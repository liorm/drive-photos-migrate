import {
  SyncStatus,
  SyncStatusDetail,
  RecursiveSyncRefreshResult,
} from '@/types/sync-status';
import {
  getCachedFileSyncStatus as getFileSyncStatusFromCache,
  getCachedFolderSyncStatus as getFolderSyncStatusFromCache,
  cacheFileSyncStatus as saveFileSyncStatus,
  cacheFolderSyncStatus as saveFolderSyncStatus,
  clearFilesSyncStatusCache as clearFilesCache,
  clearFoldersSyncStatusCache as clearFoldersCache,
  clearAllSyncStatusCache as clearAllCache,
  getCachedFolder,
  getFolderDetailsFromCache,
  UNPAGINATED_PAGE_SIZE,
} from './db';
import { isFileUploaded, getUploadRecords } from './uploads-db';
import { createLogger } from '@/lib/logger';
import { GoogleAuthContext } from '@/types/auth';

const logger = createLogger('sync-status');

/**
 * Default concurrency limit for parallel subfolder processing.
 * Limits how many subfolders are processed simultaneously to avoid
 * overwhelming the database with too many concurrent reads.
 */
const DEFAULT_SUBFOLDER_CONCURRENCY = 10;

/**
 * Process items in parallel batches with concurrency control
 * Uses Promise.allSettled to handle failures gracefully - if one item fails,
 * others continue processing.
 *
 * @param items - Array of items to process
 * @param processFn - Async function to process each item
 * @param concurrency - Maximum number of concurrent operations
 * @returns Array of successfully processed results (failed items are logged and skipped)
 */
async function processBatched<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(processFn));

    // Extract successful results and log failures
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        const itemIndex = i + j;
        logger.warn('Failed to process item in batch', {
          itemIndex,
          error: result.reason?.message || String(result.reason),
        });
      }
    }
  }

  return results;
}

/**
 * Get cached sync status for a file
 */
export async function getCachedFileSyncStatus(
  userEmail: string,
  fileId: string
): Promise<SyncStatusDetail | null> {
  return getFileSyncStatusFromCache(userEmail, fileId);
}

/**
 * Get cached sync status for a folder
 */
export async function getCachedFolderSyncStatus(
  userEmail: string,
  folderId: string
): Promise<SyncStatusDetail | null> {
  return getFolderSyncStatusFromCache(userEmail, folderId);
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
  saveFileSyncStatus(userEmail, fileId, status);

  logger.debug('File sync status calculated', {
    userEmail,
    fileId,
    status: status.status,
  });

  return status;
}

/**
 * Calculate sync status for a folder
 * @param userEmail - User's email
 * @param folderId - Folder ID to calculate status for
 * @param recursive - If true, recursively calculate status for all subfolders (default: true)
 */
export async function calculateFolderSyncStatus(
  userEmail: string,
  folderId: string,
  recursive = true
): Promise<SyncStatusDetail> {
  logger.info('Calculating folder sync status', {
    userEmail,
    folderId,
    recursive,
  });
  const startTime = Date.now();

  // Get cached folder data (retrieve all items without pagination)
  const cachedData = getCachedFolder(
    userEmail,
    folderId,
    0,
    UNPAGINATED_PAGE_SIZE
  );

  if (!cachedData) {
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
    saveFolderSyncStatus(userEmail, folderId, status);
    return status;
  }

  const files = cachedData.files;
  const subfolders = cachedData.folders;

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

  // 2. Recursively check all subfolders (if recursive is enabled)
  if (recursive && subfolders.length > 0) {
    logger.debug('Processing subfolders in parallel', {
      userEmail,
      folderId,
      subfolderCount: subfolders.length,
      concurrency: DEFAULT_SUBFOLDER_CONCURRENCY,
    });

    const subfolderStatuses = await processBatched(
      subfolders,
      async subfolder => {
        const status = await calculateFolderSyncStatus(
          userEmail,
          subfolder.id,
          recursive
        );

        logger.debug('Subfolder checked', {
          userEmail,
          folderId,
          subfolderId: subfolder.id,
          subfolderSynced: status.syncedCount,
          subfolderTotal: status.totalCount,
        });

        return status;
      },
      DEFAULT_SUBFOLDER_CONCURRENCY
    );

    // Aggregate results from all subfolders
    for (const subfolderStatus of subfolderStatuses) {
      totalSyncedCount += subfolderStatus.syncedCount;
      totalItemCount += subfolderStatus.totalCount;
    }
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
  saveFolderSyncStatus(userEmail, folderId, statusDetail);

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
 * Recursively refresh sync status for a folder and all its subfolders
 * This function forces recalculation and returns detailed information about all processed folders
 *
 * @param userEmail - User's email
 * @param folderId - Root folder ID to start from
 * @returns Detailed information about all processed folders
 */
export async function recursivelyRefreshFolderSyncStatus(
  userEmail: string,
  folderId: string
): Promise<RecursiveSyncRefreshResult> {
  logger.info('Starting recursive sync status refresh', {
    userEmail,
    folderId,
  });

  const startTime = Date.now();
  const result = await recursiveRefreshHelper(userEmail, folderId);
  const duration = Date.now() - startTime;

  logger.info('Recursive sync status refresh completed', {
    userEmail,
    folderId,
    processedCount: result.processedCount,
    durationMs: duration,
  });

  return result;
}

/**
 * Helper function for recursive sync status refresh
 */
async function recursiveRefreshHelper(
  userEmail: string,
  folderId: string
): Promise<RecursiveSyncRefreshResult> {
  // Get folder data (retrieve all items without pagination)
  const cachedData = getCachedFolder(
    userEmail,
    folderId,
    0,
    UNPAGINATED_PAGE_SIZE
  );

  if (!cachedData) {
    logger.warn('Folder not found in cache during recursive refresh', {
      userEmail,
      folderId,
    });

    const emptyStatus: SyncStatusDetail = {
      status: 'unsynced',
      syncedCount: 0,
      totalCount: 0,
      percentage: 0,
      lastChecked: new Date().toISOString(),
    };

    return {
      folderId,
      status: emptyStatus,
      subfolders: [],
      processedCount: 1,
      durationMs: 0,
    };
  }

  const startTime = Date.now();
  const subfolders = cachedData.folders;

  // Process all subfolders recursively in parallel batches
  let subfolderResults: RecursiveSyncRefreshResult[] = [];
  let totalProcessedCount = 1; // Count this folder

  if (subfolders.length > 0) {
    logger.debug('Processing subfolders in parallel for recursive refresh', {
      userEmail,
      folderId,
      subfolderCount: subfolders.length,
      concurrency: DEFAULT_SUBFOLDER_CONCURRENCY,
    });

    subfolderResults = await processBatched(
      subfolders,
      async subfolder => recursiveRefreshHelper(userEmail, subfolder.id),
      DEFAULT_SUBFOLDER_CONCURRENCY
    );

    // Calculate total processed count
    totalProcessedCount += subfolderResults.reduce(
      (sum, result) => sum + result.processedCount,
      0
    );
  }

  // Calculate sync status for this folder (recursive to include subfolders)
  const status = await calculateFolderSyncStatus(userEmail, folderId, true);

  // Get folder name from cache (may be undefined for root-level folders or
  // folders not enumerated as subfolders in the cache)
  const folderDetails = getFolderDetailsFromCache(userEmail, folderId);

  const duration = Date.now() - startTime;

  logger.debug('Folder sync status refreshed', {
    userEmail,
    folderId,
    status: status.status,
    subfolderCount: subfolders.length,
    processedCount: totalProcessedCount,
  });

  return {
    folderId,
    folderName: folderDetails?.name,
    status,
    subfolders: subfolderResults,
    processedCount: totalProcessedCount,
    durationMs: duration,
  };
}

/**
 * Clear sync status cache for a folder and ALL parent folders (recursive up to root)
 */
export async function clearSyncStatusCacheForFolder(
  userEmail: string,
  folderId: string,
  auth: GoogleAuthContext
): Promise<void> {
  logger.info('Clearing sync status cache for folder and parents', {
    userEmail,
    folderId,
  });

  // Get parent folders by traversing up the folder hierarchy
  const parentFolderIds = await getParentFolderIds(userEmail, folderId, auth);

  // Clear cache for all parent folders
  if (parentFolderIds.length > 0) {
    clearFoldersCache(userEmail, parentFolderIds);
    logger.debug('Cleared parent folder sync status cache', {
      userEmail,
      parentCount: parentFolderIds.length,
    });
  }

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
  auth: GoogleAuthContext
): Promise<string[]> {
  // Import here to avoid circular dependency
  const { getFolderPath } = await import('./google-drive');

  const folderPath = await getFolderPath({
    auth,
    folderId,
    userEmail,
  });

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

  clearFilesCache(userEmail, fileIds);

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

  clearAllCache(userEmail);

  logger.info('All sync status cache cleared', { userEmail });
}
