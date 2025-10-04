import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  addToQueue,
  getQueue,
  getQueueStats,
  getCachedFileMetadata,
} from '@/lib/upload-queue-db';
import { getDriveFile } from '@/lib/google-drive';
import { getAllCachedFileIds, getFileMetadataFromDriveCache } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import operationStatusManager, { OperationType } from '@/lib/operation-status';

const logger = createLogger('api:queue');

interface AddToQueueRequestBody {
  fileIds?: string[];
  folderId?: string;
}

/**
 * Process files asynchronously in the background
 */
async function processFilesAsync(
  operationId: string,
  userEmail: string,
  fileIds: string[],
  accessToken: string,
  requestId: string
): Promise<void> {
  const allAdded: Array<{
    driveFileId: string;
    fileName: string;
    mimeType: string;
  }> = [];
  const allSkipped: Array<{ driveFileId: string; reason: string }> = [];

  try {
    // Process files one at a time, adding to queue incrementally
    for (let i = 0; i < fileIds.length; i++) {
      const fileId = fileIds[i];

      // Update progress
      operationStatusManager.updateProgress(operationId, i, fileIds.length);

      try {
        let fileName: string;
        let mimeType: string;
        let fileSize: number | undefined;

        // Try Drive cache first (from folder browsing)
        const driveCacheMetadata = getFileMetadataFromDriveCache(
          userEmail,
          fileId
        );

        if (driveCacheMetadata) {
          logger.debug('Using Drive cache metadata', {
            requestId,
            userEmail,
            fileId,
            fileName: driveCacheMetadata.fileName,
          });

          fileName = driveCacheMetadata.fileName;
          mimeType = driveCacheMetadata.mimeType;
          fileSize = driveCacheMetadata.fileSize;
        } else {
          // Try queue cache next (from previous queue operations)
          const queueCacheMetadata = await getCachedFileMetadata(
            userEmail,
            fileId
          );

          if (queueCacheMetadata) {
            logger.debug('Using queue cache metadata', {
              requestId,
              userEmail,
              fileId,
              fileName: queueCacheMetadata.fileName,
            });

            fileName = queueCacheMetadata.fileName;
            mimeType = queueCacheMetadata.mimeType;
            fileSize = queueCacheMetadata.fileSize;
          } else {
            // Cache miss - fetch from Google Drive API
            logger.debug('Fetching file metadata from Drive API', {
              requestId,
              userEmail,
              fileId,
            });

            const fileMetadata = await getDriveFile(accessToken, fileId);

            if (!fileMetadata.name || !fileMetadata.mimeType) {
              logger.warn('File metadata incomplete, skipping', {
                requestId,
                userEmail,
                fileId,
              });
              allSkipped.push({
                driveFileId: fileId,
                reason: 'Incomplete metadata',
              });
              continue;
            }

            fileName = fileMetadata.name;
            mimeType = fileMetadata.mimeType;
            fileSize = fileMetadata.size
              ? parseInt(fileMetadata.size)
              : undefined;

            logger.debug('File metadata fetched from Drive API', {
              requestId,
              userEmail,
              fileId,
              fileName,
            });
          }
        }

        // Add this file to queue immediately
        const result = await addToQueue(userEmail, [
          {
            driveFileId: fileId,
            fileName,
            mimeType,
            fileSize,
          },
        ]);

        // Track results
        allAdded.push(...result.added);
        allSkipped.push(...result.skipped);

        logger.debug('File processed and added to queue', {
          requestId,
          userEmail,
          fileId,
          added: result.added.length > 0,
        });

        // Small delay to yield control and allow SSE updates to be sent
        // Even cached operations need time for the client to see updates
        await new Promise(resolve => setImmediate(resolve));
      } catch (error) {
        logger.error('Error processing file', error, {
          requestId,
          userEmail,
          fileId,
        });
        allSkipped.push({
          driveFileId: fileId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with other files even if one fails
      }
    }

    // Update final progress
    operationStatusManager.updateProgress(
      operationId,
      fileIds.length,
      fileIds.length
    );

    logger.info('Async file processing completed', {
      requestId,
      userEmail,
      addedCount: allAdded.length,
      skippedCount: allSkipped.length,
    });

    // Complete operation with results
    operationStatusManager.completeOperation(operationId, {
      addedCount: allAdded.length,
      skippedCount: allSkipped.length,
      totalProcessed: fileIds.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error in async file processing', error, {
      requestId,
      userEmail,
    });
    operationStatusManager.failOperation(operationId, errorMessage);
  }
}

/**
 * GET /api/queue - Get upload queue for current user
 */
async function handleGET(_request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get session
  const session = await auth();

  if (!session?.accessToken || !session?.user?.email) {
    logger.warn('Unauthorized request - No access token', { requestId });
    return NextResponse.json(
      { error: 'Unauthorized - No access token' },
      { status: 401 }
    );
  }

  // Check if token refresh failed
  if (session.error === 'RefreshAccessTokenError') {
    logger.warn('Authentication expired', {
      requestId,
      userEmail: session.user.email,
    });
    return NextResponse.json(
      { error: 'Authentication expired - Please sign in again' },
      { status: 401 }
    );
  }

  const userEmail = session.user.email;

  logger.info('Get queue request', { requestId, userEmail });

  // Get queue and stats
  const queue = await getQueue(userEmail);
  const stats = await getQueueStats(userEmail);

  logger.info('Queue retrieved successfully', {
    requestId,
    userEmail,
    itemCount: queue.length,
  });

  return NextResponse.json({
    success: true,
    queue,
    stats,
  });
}

/**
 * POST /api/queue - Add files to upload queue
 */
async function handlePOST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get session
  const session = await auth();

  if (!session?.accessToken || !session?.user?.email) {
    logger.warn('Unauthorized request - No access token', { requestId });
    return NextResponse.json(
      { error: 'Unauthorized - No access token' },
      { status: 401 }
    );
  }

  // Check if token refresh failed
  if (session.error === 'RefreshAccessTokenError') {
    logger.warn('Authentication expired', {
      requestId,
      userEmail: session.user.email,
    });
    return NextResponse.json(
      { error: 'Authentication expired - Please sign in again' },
      { status: 401 }
    );
  }

  const userEmail = session.user.email;

  // Parse request body
  const body: AddToQueueRequestBody = await request.json();
  let { fileIds } = body;
  const { folderId } = body;

  // Handle folderId parameter - fetch all file IDs from cache
  if (folderId) {
    logger.info('Add to queue request with folderId', {
      requestId,
      userEmail,
      folderId,
    });

    const cachedFileIds = getAllCachedFileIds(userEmail, folderId);

    if (cachedFileIds.length === 0) {
      logger.warn('No files found in cached folder', {
        requestId,
        userEmail,
        folderId,
      });
      return NextResponse.json(
        { error: 'No files found in folder or folder not cached' },
        { status: 400 }
      );
    }

    fileIds = cachedFileIds;
    logger.info('Retrieved file IDs from folder cache', {
      requestId,
      userEmail,
      folderId,
      fileCount: fileIds.length,
    });
  }

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    logger.warn('Invalid request - No file IDs provided', {
      requestId,
      userEmail,
    });
    return NextResponse.json(
      { error: 'Invalid request - No file IDs provided' },
      { status: 400 }
    );
  }

  logger.info('Add to queue request received', {
    requestId,
    userEmail,
    fileCount: fileIds.length,
  });

  // Create operation to track progress for large operations (10+ files)
  const shouldTrackProgress = fileIds.length >= 10;
  let operationId: string | null = null;

  if (shouldTrackProgress) {
    operationId = operationStatusManager.createOperation(
      OperationType.LONG_WRITE,
      'Adding Files to Queue',
      {
        description: `Adding ${fileIds.length} file(s) to upload queue`,
        total: fileIds.length,
        metadata: { userEmail, fileCount: fileIds.length },
      }
    );

    operationStatusManager.startOperation(operationId);

    // Process files asynchronously in the background
    processFilesAsync(
      operationId,
      userEmail,
      fileIds,
      session.accessToken,
      requestId
    );

    // Return immediately so client can see progress updates via SSE
    return NextResponse.json({
      success: true,
      operationId,
      message: `Processing ${fileIds.length} file(s) in the background. Watch operation notifications for progress.`,
      fileCount: fileIds.length,
    });
  }

  // For small operations (<10 files), process synchronously
  const allAdded: Array<{
    driveFileId: string;
    fileName: string;
    mimeType: string;
  }> = [];
  const allSkipped: Array<{ driveFileId: string; reason: string }> = [];

  try {
    // Process files one at a time, adding to queue incrementally
    for (let i = 0; i < fileIds.length; i++) {
      const fileId = fileIds[i];

      try {
        let fileName: string;
        let mimeType: string;
        let fileSize: number | undefined;

        // Try Drive cache first (from folder browsing)
        const driveCacheMetadata = getFileMetadataFromDriveCache(
          userEmail,
          fileId
        );

        if (driveCacheMetadata) {
          logger.debug('Using Drive cache metadata', {
            requestId,
            userEmail,
            fileId,
            fileName: driveCacheMetadata.fileName,
          });

          fileName = driveCacheMetadata.fileName;
          mimeType = driveCacheMetadata.mimeType;
          fileSize = driveCacheMetadata.fileSize;
        } else {
          // Try queue cache next (from previous queue operations)
          const queueCacheMetadata = await getCachedFileMetadata(
            userEmail,
            fileId
          );

          if (queueCacheMetadata) {
            logger.debug('Using queue cache metadata', {
              requestId,
              userEmail,
              fileId,
              fileName: queueCacheMetadata.fileName,
            });

            fileName = queueCacheMetadata.fileName;
            mimeType = queueCacheMetadata.mimeType;
            fileSize = queueCacheMetadata.fileSize;
          } else {
            // Cache miss - fetch from Google Drive API
            logger.debug('Fetching file metadata from Drive API', {
              requestId,
              userEmail,
              fileId,
            });

            const fileMetadata = await getDriveFile(
              session.accessToken,
              fileId
            );

            if (!fileMetadata.name || !fileMetadata.mimeType) {
              logger.warn('File metadata incomplete, skipping', {
                requestId,
                userEmail,
                fileId,
              });
              allSkipped.push({
                driveFileId: fileId,
                reason: 'Incomplete metadata',
              });
              continue;
            }

            fileName = fileMetadata.name;
            mimeType = fileMetadata.mimeType;
            fileSize = fileMetadata.size
              ? parseInt(fileMetadata.size)
              : undefined;

            logger.debug('File metadata fetched from Drive API', {
              requestId,
              userEmail,
              fileId,
              fileName,
            });
          }
        }

        // Add this file to queue immediately
        const result = await addToQueue(userEmail, [
          {
            driveFileId: fileId,
            fileName,
            mimeType,
            fileSize,
          },
        ]);

        // Track results
        allAdded.push(...result.added);
        allSkipped.push(...result.skipped);

        logger.debug('File processed and added to queue', {
          requestId,
          userEmail,
          fileId,
          added: result.added.length > 0,
        });
      } catch (error) {
        logger.error('Error processing file', error, {
          requestId,
          userEmail,
          fileId,
        });
        allSkipped.push({
          driveFileId: fileId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with other files even if one fails
      }
    }

    if (allAdded.length === 0 && allSkipped.length === fileIds.length) {
      logger.warn('No files were added to queue', { requestId, userEmail });
      return NextResponse.json(
        {
          error: 'No files could be added to queue',
          skipped: allSkipped,
        },
        { status: 400 }
      );
    }

    logger.info('Add to queue request completed (sync)', {
      requestId,
      userEmail,
      addedCount: allAdded.length,
      skippedCount: allSkipped.length,
    });

    return NextResponse.json({
      success: true,
      added: allAdded,
      skipped: allSkipped,
      addedCount: allAdded.length,
      skippedCount: allSkipped.length,
    });
  } catch (error) {
    logger.error('Error adding files to queue', error, {
      requestId,
      userEmail,
    });
    throw error;
  }
}

export const GET = withErrorHandler(handleGET);
export const POST = withErrorHandler(handlePOST);
