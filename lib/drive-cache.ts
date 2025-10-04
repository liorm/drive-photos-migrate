import { getDb } from './db';
import { CachedPageResponse } from '@/types/drive-cache';
import { listAllDriveFiles } from './google-drive';
import { createLogger } from '@/lib/logger';

const logger = createLogger('drive-cache');

/**
 * Check if a folder is cached for a user
 */
export async function isFolderCached(
  userEmail: string,
  folderId: string
): Promise<boolean> {
  const db = await getDb();

  const isCached = !!(
    db.data.users[userEmail]?.folders &&
    db.data.users[userEmail].folders[folderId]
  );

  logger.debug('Checked if folder is cached', {
    userEmail,
    folderId,
    isCached,
  });

  return isCached;
}

/**
 * Get a paginated slice of cached files for a folder
 */
export async function getCachedFolderPage(
  userEmail: string,
  folderId: string,
  page: number = 0,
  pageSize: number = 50
): Promise<CachedPageResponse | null> {
  logger.debug('Retrieving cached folder page', {
    userEmail,
    folderId,
    page,
    pageSize,
  });

  const db = await getDb();

  const cachedFolder = db.data.users[userEmail]?.folders?.[folderId];

  if (!cachedFolder) {
    logger.debug('Folder not found in cache', { userEmail, folderId });
    return null;
  }

  // Folders are always shown first (not paginated)
  const folders = cachedFolder.folders;

  // Paginate files only
  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;
  const files = cachedFolder.files.slice(startIndex, endIndex);

  logger.debug('Retrieved cached folder page', {
    userEmail,
    folderId,
    page,
    filesInPage: files.length,
    foldersInPage: page === 0 ? folders.length : 0,
    hasMore: endIndex < cachedFolder.files.length,
  });

  return {
    files,
    folders: page === 0 ? folders : [], // Only return folders on first page
    totalCount: cachedFolder.totalCount,
    hasMore: endIndex < cachedFolder.files.length,
    lastSynced: cachedFolder.lastSynced,
  };
}

/**
 * Sync a folder to cache by fetching all files from Google Drive API
 */
export async function syncFolderToCache(
  userEmail: string,
  folderId: string,
  accessToken: string
): Promise<void> {
  logger.info('Starting folder sync to cache', { userEmail, folderId });
  const startTime = Date.now();

  // Fetch ALL files from Drive API (this logs progress internally)
  const { files: allFiles, folders: allFolders } = await listAllDriveFiles(
    accessToken,
    folderId
  );

  logger.info('Drive files fetched, writing to cache', {
    userEmail,
    folderId,
    fileCount: allFiles.length,
    folderCount: allFolders.length,
  });

  const db = await getDb();

  // Initialize user cache if it doesn't exist
  if (!db.data.users[userEmail]) {
    logger.debug('Initializing cache for new user', { userEmail });
    db.data.users[userEmail] = { folders: {} };
  }

  // Store in cache
  db.data.users[userEmail].folders[folderId] = {
    files: allFiles,
    folders: allFolders,
    lastSynced: new Date().toISOString(),
    totalCount: allFiles.length + allFolders.length,
  };

  // Persist to disk
  await db.write();

  const duration = Date.now() - startTime;
  logger.info('Folder sync completed successfully', {
    userEmail,
    folderId,
    totalItems: allFiles.length + allFolders.length,
    durationMs: duration,
  });
}

/**
 * Clear a folder from cache (for refresh)
 */
export async function clearFolderCache(
  userEmail: string,
  folderId: string
): Promise<void> {
  logger.info('Clearing folder cache', { userEmail, folderId });

  const db = await getDb();

  if (db.data.users[userEmail]?.folders?.[folderId]) {
    delete db.data.users[userEmail].folders[folderId];
    await db.write();
    logger.info('Folder cache cleared successfully', { userEmail, folderId });
  } else {
    logger.debug('Folder cache not found, nothing to clear', {
      userEmail,
      folderId,
    });
  }
}

/**
 * Get total count of files in cached folder
 */
export async function getCachedFolderCount(
  userEmail: string,
  folderId: string
): Promise<number> {
  const db = await getDb();

  const cachedFolder = db.data.users[userEmail]?.folders?.[folderId];

  return cachedFolder?.totalCount || 0;
}
