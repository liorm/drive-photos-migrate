import {
  isFolderCached as checkFolderCached,
  getCachedFolder,
  cacheFolderContents,
  clearFolderFromCache,
  getCachedFolderCount as getFolderCount,
} from './db';
import { CachedPageResponse } from '@/types/drive-cache';
import { listAllDriveFiles } from './google-drive';
import { GoogleAuthContext } from '@/types/auth';
import { createLogger } from '@/lib/logger';
import { trackOperation, OperationType } from '@/lib/operation-status';

const logger = createLogger('drive-cache');

/**
 * Check if a folder is cached for a user
 */
export async function isFolderCached(
  userEmail: string,
  folderId: string
): Promise<boolean> {
  return checkFolderCached(userEmail, folderId);
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

  const result = getCachedFolder(userEmail, folderId, page, pageSize);

  if (!result) {
    logger.debug('Folder not found in cache', { userEmail, folderId });
    return null;
  }

  // Calculate hasMore based on pagination
  const totalFiles = result.totalCount - result.folders.length; // Subtract folders from total
  const offset = page * pageSize;
  const hasMore = offset + result.files.length < totalFiles;

  logger.debug('Retrieved cached folder page', {
    userEmail,
    folderId,
    page,
    filesInPage: result.files.length,
    foldersInPage: result.folders.length,
    hasMore,
  });

  return {
    files: result.files,
    folders: result.folders,
    totalCount: result.totalCount,
    hasMore,
    lastSynced: result.lastSynced,
  };
}

/**
 * Sync a folder to cache by fetching all files from Google Drive API
 */
export async function syncFolderToCache(
  userEmail: string,
  folderId: string,
  auth: GoogleAuthContext
): Promise<void> {
  return trackOperation(
    OperationType.LONG_READ,
    'Syncing folder from Drive',
    async operationId => {
      logger.info('Starting folder sync to cache', { userEmail, folderId });
      const startTime = Date.now();

      // Fetch ALL files from Drive API (this logs progress internally)
      const { files: allFiles, folders: allFolders } = await listAllDriveFiles({
        auth,
        folderId,
        operationId,
      });

      logger.info('Drive files fetched, writing to cache', {
        userEmail,
        folderId,
        fileCount: allFiles.length,
        folderCount: allFolders.length,
      });

      // Store in cache (synchronous operation)
      cacheFolderContents(userEmail, folderId, allFiles, allFolders);

      const duration = Date.now() - startTime;
      logger.info('Folder sync completed successfully', {
        userEmail,
        folderId,
        totalItems: allFiles.length + allFolders.length,
        durationMs: duration,
      });
    },
    {
      description: `Syncing folder ${folderId}`,
      metadata: { userEmail, folderId },
    }
  );
}

/**
 * Clear a folder from cache (for refresh)
 * Also clears sync status cache for this folder and all parent folders
 */
export async function clearFolderCache(
  userEmail: string,
  folderId: string,
  auth: GoogleAuthContext
): Promise<void> {
  logger.info('Clearing folder cache', { userEmail, folderId });

  clearFolderFromCache(userEmail, folderId);

  // Also clear sync status cache for this folder and all parents
  const { clearSyncStatusCacheForFolder } = await import('./sync-status');
  await clearSyncStatusCacheForFolder(userEmail, folderId, auth);

  logger.info('Folder cache cleared successfully', { userEmail, folderId });
}

/**
 * Get total count of files in cached folder
 */
export async function getCachedFolderCount(
  userEmail: string,
  folderId: string
): Promise<number> {
  return getFolderCount(userEmail, folderId);
}
