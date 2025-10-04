import { SyncStatus, SyncStatusDetail } from '@/types/sync-status';
import { getDb } from './db';
import { isFileUploaded, getUploadRecords } from './uploads-db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('sync-status');

/**
 * Get cached sync status for a file
 */
export async function getCachedFileSyncStatus(
  userEmail: string,
  fileId: string
): Promise<SyncStatusDetail | null> {
  const db = await getDb();

  const cached =
    db.data.users[userEmail]?.syncStatusCache?.files?.[fileId] || null;

  logger.debug('Retrieved cached file sync status', {
    userEmail,
    fileId,
    found: !!cached,
  });

  return cached;
}

/**
 * Get cached sync status for a folder
 */
export async function getCachedFolderSyncStatus(
  userEmail: string,
  folderId: string
): Promise<SyncStatusDetail | null> {
  const db = await getDb();

  const cached =
    db.data.users[userEmail]?.syncStatusCache?.folders?.[folderId] || null;

  logger.debug('Retrieved cached folder sync status', {
    userEmail,
    folderId,
    found: !!cached,
  });

  return cached;
}

/**
 * Calculate sync status for a single file
 */
export async function calculateFileSyncStatus(
  userEmail: string,
  fileId: string
): Promise<SyncStatusDetail> {
  logger.debug('Calculating file sync status', { userEmail, fileId });

  const isUploaded = await isFileUploaded(userEmail, fileId);

  const status: SyncStatusDetail = {
    status: isUploaded ? 'synced' : 'unsynced',
    syncedCount: isUploaded ? 1 : 0,
    totalCount: 1,
    percentage: isUploaded ? 100 : 0,
    lastChecked: new Date().toISOString(),
  };

  // Cache the result
  await cacheFileSyncStatus(userEmail, fileId, status);

  logger.debug('File sync status calculated', {
    userEmail,
    fileId,
    status: status.status,
  });

  return status;
}

/**
 * Calculate sync status for a folder (recursive)
 * Checks all files in the folder and all subfolders
 */
export async function calculateFolderSyncStatus(
  userEmail: string,
  folderId: string
): Promise<SyncStatusDetail> {
  logger.info('Calculating folder sync status', { userEmail, folderId });
  const startTime = Date.now();

  const db = await getDb();

  // Get cached folder data
  const cachedFolder = db.data.users[userEmail]?.folders?.[folderId];

  if (!cachedFolder) {
    logger.warn('Folder not found in cache, returning unsynced', {
      userEmail,
      folderId,
    });
    const status: SyncStatusDetail = {
      status: 'unsynced',
      syncedCount: 0,
      totalCount: 0,
      percentage: 0,
      lastChecked: new Date().toISOString(),
    };
    await cacheFolderSyncStatus(userEmail, folderId, status);
    return status;
  }

  const files = cachedFolder.files;
  const subfolders = cachedFolder.folders;

  let totalSyncedCount = 0;
  let totalItemCount = 0;

  // 1. Check all files in this folder
  if (files.length > 0) {
    const fileIds = files.map(f => f.id);
    const uploadRecords = await getUploadRecords(userEmail, fileIds);

    const syncedFilesCount = Array.from(uploadRecords.values()).filter(
      r => r !== null
    ).length;

    totalSyncedCount += syncedFilesCount;
    totalItemCount += files.length;

    logger.debug('Files checked in folder', {
      userEmail,
      folderId,
      totalFiles: files.length,
      syncedFiles: syncedFilesCount,
    });
  }

  // 2. Recursively check all subfolders
  for (const subfolder of subfolders) {
    const subfolderStatus = await calculateFolderSyncStatus(
      userEmail,
      subfolder.id
    );

    totalSyncedCount += subfolderStatus.syncedCount;
    totalItemCount += subfolderStatus.totalCount;

    logger.debug('Subfolder checked', {
      userEmail,
      folderId,
      subfolderId: subfolder.id,
      subfolderSynced: subfolderStatus.syncedCount,
      subfolderTotal: subfolderStatus.totalCount,
    });
  }

  // 3. Calculate overall status
  let status: SyncStatus;
  let percentage = 0;

  if (totalItemCount === 0) {
    status = 'unsynced';
    percentage = 0;
  } else {
    percentage = Math.round((totalSyncedCount / totalItemCount) * 100);

    if (totalSyncedCount === totalItemCount) {
      status = 'synced';
    } else if (totalSyncedCount > 0) {
      status = 'partial';
    } else {
      status = 'unsynced';
    }
  }

  const statusDetail: SyncStatusDetail = {
    status,
    syncedCount: totalSyncedCount,
    totalCount: totalItemCount,
    percentage,
    lastChecked: new Date().toISOString(),
  };

  // Cache the result
  await cacheFolderSyncStatus(userEmail, folderId, statusDetail);

  const duration = Date.now() - startTime;
  logger.info('Folder sync status calculated', {
    userEmail,
    folderId,
    status,
    syncedCount: totalSyncedCount,
    totalCount: totalItemCount,
    percentage,
    durationMs: duration,
  });

  return statusDetail;
}

/**
 * Cache file sync status
 */
async function cacheFileSyncStatus(
  userEmail: string,
  fileId: string,
  status: SyncStatusDetail
): Promise<void> {
  const db = await getDb();

  // Initialize cache structure if needed
  if (!db.data.users[userEmail]) {
    db.data.users[userEmail] = { folders: {} };
  }
  if (!db.data.users[userEmail].syncStatusCache) {
    db.data.users[userEmail].syncStatusCache = { files: {}, folders: {} };
  }

  // Cache the status
  db.data.users[userEmail].syncStatusCache!.files[fileId] = status;

  await db.write();

  logger.debug('File sync status cached', { userEmail, fileId });
}

/**
 * Cache folder sync status
 */
async function cacheFolderSyncStatus(
  userEmail: string,
  folderId: string,
  status: SyncStatusDetail
): Promise<void> {
  const db = await getDb();

  // Initialize cache structure if needed
  if (!db.data.users[userEmail]) {
    db.data.users[userEmail] = { folders: {} };
  }
  if (!db.data.users[userEmail].syncStatusCache) {
    db.data.users[userEmail].syncStatusCache = { files: {}, folders: {} };
  }

  // Cache the status
  db.data.users[userEmail].syncStatusCache!.folders[folderId] = status;

  await db.write();

  logger.debug('Folder sync status cached', { userEmail, folderId });
}

/**
 * Clear sync status cache for a folder and ALL parent folders (recursive up to root)
 */
export async function clearSyncStatusCacheForFolder(
  userEmail: string,
  folderId: string,
  accessToken: string
): Promise<void> {
  logger.info('Clearing sync status cache for folder and parents', {
    userEmail,
    folderId,
  });

  const db = await getDb();

  if (!db.data.users[userEmail]?.syncStatusCache) {
    logger.debug('No sync status cache to clear', { userEmail, folderId });
    return;
  }

  // Clear cache for this folder
  delete db.data.users[userEmail].syncStatusCache!.folders[folderId];

  // Get parent folders by traversing up the folder hierarchy
  const parentFolderIds = await getParentFolderIds(
    userEmail,
    folderId,
    accessToken
  );

  // Clear cache for all parent folders
  for (const parentId of parentFolderIds) {
    delete db.data.users[userEmail].syncStatusCache!.folders[parentId];
    logger.debug('Cleared parent folder sync status cache', {
      userEmail,
      parentFolderId: parentId,
    });
  }

  await db.write();

  logger.info('Sync status cache cleared for folder and parents', {
    userEmail,
    folderId,
    parentCount: parentFolderIds.length,
  });
}

/**
 * Get all parent folder IDs up to root
 */
async function getParentFolderIds(
  userEmail: string,
  folderId: string,
  accessToken: string
): Promise<string[]> {
  // Import here to avoid circular dependency
  const { getFolderPath } = await import('./google-drive');

  const folderPath = await getFolderPath(accessToken, folderId);

  // Remove the last item (current folder) and first item (root)
  // We want all folders in between
  const parentIds = folderPath.slice(0, -1).map(f => f.id);

  logger.debug('Retrieved parent folder IDs', {
    userEmail,
    folderId,
    parentCount: parentIds.length,
  });

  return parentIds;
}

/**
 * Clear sync status cache for specific files
 */
export async function clearFileSyncStatusCache(
  userEmail: string,
  fileIds: string[]
): Promise<void> {
  logger.info('Clearing sync status cache for files', {
    userEmail,
    fileCount: fileIds.length,
  });

  const db = await getDb();

  if (!db.data.users[userEmail]?.syncStatusCache?.files) {
    logger.debug('No file sync status cache to clear', { userEmail });
    return;
  }

  for (const fileId of fileIds) {
    delete db.data.users[userEmail].syncStatusCache!.files[fileId];
    logger.debug('Cleared file sync status cache', { userEmail, fileId });
  }

  await db.write();

  logger.info('File sync status cache cleared', {
    userEmail,
    fileCount: fileIds.length,
  });
}

/**
 * Clear ALL sync status cache for a user (for testing)
 */
export async function clearAllSyncStatusCache(
  userEmail: string
): Promise<void> {
  logger.info('Clearing all sync status cache', { userEmail });

  const db = await getDb();

  if (db.data.users[userEmail]?.syncStatusCache) {
    db.data.users[userEmail].syncStatusCache = { files: {}, folders: {} };
    await db.write();
    logger.info('All sync status cache cleared', { userEmail });
  } else {
    logger.debug('No sync status cache to clear', { userEmail });
  }
}
