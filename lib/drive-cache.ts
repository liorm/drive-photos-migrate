import {
  isFolderCached as checkFolderCached,
  getCachedFolder,
  cacheFolderContents,
  clearFolderFromCache,
  getCachedFolderCount as getFolderCount,
} from './db';
import { CachedPageResponse } from '@/types/drive-cache';
import { getFolderPath, listAllDriveFiles } from './google-drive';
import { GoogleAuthContext } from '@/types/auth';
import { createLogger } from '@/lib/logger';
import operationStatusManager, {
  OperationType,
  trackOperation,
} from '@/lib/operation-status';

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

      // Don't wait for this, let it update the description in the background
      getFolderPath({ auth, folderId, operationId, userEmail })
        .then(breadcrumbs => {
          const breadcrumbString = breadcrumbs.map(b => b.name).join(' / ');
          operationStatusManager.updateOperation(operationId, {
            description: `Syncing folder: ${breadcrumbString}`,
          });
        })
        .catch(err => {
          logger.warn('Failed to get breadcrumbs for operation description', {
            operationId,
            error: err,
          });
        });

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

/**
 * Recursively sync a folder and all its subfolders to cache
 */
export async function syncFolderToCacheRecursively(
  userEmail: string,
  folderId: string,
  auth: GoogleAuthContext,
  options?: {
    maxDepth?: number;
    currentDepth?: number;
    maxConcurrency?: number;
    operationId?: string;
  }
): Promise<void> {
  const maxDepth = options?.maxDepth ?? Number.MAX_SAFE_INTEGER;
  const currentDepth = options?.currentDepth ?? 0;
  const maxConcurrency = options?.maxConcurrency ?? 3;

  // Create operation if at root level
  const isRootCall = !options?.operationId;
  const operationId = options?.operationId ?? '';

  const syncOperation = async (opId: string) => {
    logger.info('Starting recursive folder sync', {
      userEmail,
      folderId,
      currentDepth,
      maxDepth,
    });

    // Check depth limit
    if (currentDepth >= maxDepth) {
      logger.info('Max depth reached, skipping folder', {
        userEmail,
        folderId,
        currentDepth,
        maxDepth,
      });
      return;
    }

    // Update operation description with folder path
    if (isRootCall) {
      getFolderPath({ auth, folderId, operationId: opId, userEmail })
        .then(breadcrumbs => {
          const breadcrumbString = breadcrumbs.map(b => b.name).join(' / ');
          operationStatusManager.updateOperation(opId, {
            description: `Recursively syncing: ${breadcrumbString}`,
          });
        })
        .catch(err => {
          logger.warn('Failed to get breadcrumbs for operation description', {
            operationId: opId,
            error: err,
          });
        });
    }

    // Fetch all files and folders from Drive API
    const { files: allFiles, folders: allFolders } = await listAllDriveFiles({
      auth,
      folderId,
      operationId: opId,
    });

    logger.info('Drive files fetched, writing to cache', {
      userEmail,
      folderId,
      fileCount: allFiles.length,
      folderCount: allFolders.length,
      currentDepth,
    });

    // Store in cache with recursive metadata
    cacheFolderContents(userEmail, folderId, allFiles, allFolders, {
      recursiveSync: true,
      maxDepth: maxDepth === Number.MAX_SAFE_INTEGER ? undefined : maxDepth,
    });

    // If we haven't reached max depth and there are subfolders, sync them
    if (currentDepth < maxDepth - 1 && allFolders.length > 0) {
      logger.info('Syncing subfolders recursively', {
        userEmail,
        folderId,
        subfolderCount: allFolders.length,
        currentDepth: currentDepth + 1,
      });

      // Process subfolders in batches to control concurrency
      const batchSize = maxConcurrency;
      for (let i = 0; i < allFolders.length; i += batchSize) {
        const batch = allFolders.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async subfolder => {
            try {
              await syncFolderToCacheRecursively(
                userEmail,
                subfolder.id,
                auth,
                {
                  maxDepth,
                  currentDepth: currentDepth + 1,
                  maxConcurrency,
                  operationId: opId,
                }
              );
            } catch (error) {
              logger.error('Failed to sync subfolder', error, {
                userEmail,
                folderId: subfolder.id,
                folderName: subfolder.name,
                parentFolderId: folderId,
              });
              // Continue with other subfolders even if one fails
            }
          })
        );
      }
    }

    logger.info('Recursive folder sync completed', {
      userEmail,
      folderId,
      currentDepth,
      totalItems: allFiles.length + allFolders.length,
    });
  };

  // If this is the root call, wrap in operation tracking
  if (isRootCall) {
    return trackOperation(
      OperationType.LONG_READ,
      'Recursively syncing folder from Drive',
      syncOperation,
      {
        description: `Recursively syncing folder ${folderId}`,
        metadata: { userEmail, folderId, maxDepth },
      }
    );
  } else {
    // Otherwise, just execute the sync operation
    await syncOperation(operationId);
  }
}
