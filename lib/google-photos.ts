import {
  CreateMediaItemRequest,
  CreateMediaItemResponse,
} from '@/types/google-photos';
import { createLogger } from '@/lib/logger';
import { ExtendedError } from '@/lib/errors';
import { fetchWithRetry } from '@/lib/retry';
import operationStatusManager, {
  trackOperation,
  OperationType,
} from '@/lib/operation-status';
import { getDriveFile } from './google-drive';
import { retryWithBackoff } from '@/lib/retry';
import backoffController from './backoff-controller';

const logger = createLogger('google-photos');

const PHOTOS_API_BASE = 'https://photoslibrary.googleapis.com/v1';

/**
 * Upload a file to Google Photos (3-step process)
 * 1. Get upload token from Photos API
 * 2. Upload file bytes
 * 3. Create media item from upload token
 */
export async function uploadFileToPhotos(
  accessToken: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  operationId?: string,
  signal?: AbortSignal
): Promise<string> {
  logger.info('Starting file upload to Photos', { fileName, mimeType });

  // Step 1: Upload bytes to get upload token
  const uploadToken = await uploadBytes(
    accessToken,
    fileBuffer,
    fileName,
    mimeType,
    operationId,
    signal
  );

  // Step 2: Create media item from upload token
  const mediaItemId = await createMediaItemSingle(
    accessToken,
    uploadToken,
    fileName,
    operationId
  );

  logger.info('File uploaded successfully to Photos', {
    fileName,
    mediaItemId,
  });

  return mediaItemId;
}

/**
 * Step 1: Upload file bytes to Photos API and get upload token
 */
async function uploadBytes(
  accessToken: string,
  fileBuffer: Buffer,
  fileName: string,
  _mimeType: string,
  operationId?: string,
  signal?: AbortSignal
): Promise<string> {
  logger.debug('Uploading bytes to Photos API', {
    fileName,
    size: fileBuffer.length,
  });

  const response = await fetchWithRetry(
    `${PHOTOS_API_BASE}/uploads`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-File-Name': fileName,
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: fileBuffer as unknown as BodyInit,
      // forward abort signal if provided
      signal,
    },
    {
      maxRetries: 3,
      onRetry: (error, attempt, delay) => {
        logger.warn('Retrying upload bytes', {
          fileName,
          attempt,
          delay,
          error: error.message,
        });

        // Update operation status if tracking
        if (operationId) {
          operationStatusManager.retryOperation(
            operationId,
            `Upload failed: ${error.message}`,
            attempt,
            3
          );
        }
      },
    }
  );

  const uploadToken = await response.text();

  logger.debug('Upload token received', {
    fileName,
    tokenLength: uploadToken.length,
  });

  return uploadToken;
}

/**
 * Step 2: Create media item from upload token (single item)
 */
async function createMediaItemSingle(
  accessToken: string,
  uploadToken: string,
  fileName: string,
  operationId?: string
): Promise<string> {
  logger.debug('Creating media item from upload token', { fileName });

  const requestBody: CreateMediaItemRequest = {
    newMediaItems: [
      {
        simpleMediaItem: {
          uploadToken,
          fileName,
        },
      },
    ],
  };

  const response = await fetchWithRetry(
    `${PHOTOS_API_BASE}/mediaItems:batchCreate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      // createMediaItem is fast, no signal forwarded here
    },
    {
      maxRetries: 3,
      onRetry: (error, attempt, delay) => {
        logger.warn('Retrying create media item', {
          fileName,
          attempt,
          delay,
          error: error.message,
        });

        // Update operation status if tracking
        if (operationId) {
          operationStatusManager.retryOperation(
            operationId,
            `Create media item failed: ${error.message}`,
            attempt,
            3
          );
        }
      },
    }
  );

  const result: CreateMediaItemResponse = await response.json();

  // Check if creation was successful
  const mediaItemResult = result.newMediaItemResults[0];
  if (!mediaItemResult.mediaItem) {
    const errorMsg =
      mediaItemResult.status.message || 'Unknown error creating media item';
    throw new ExtendedError({
      message: 'Media item creation failed',
      details: {
        fileName,
        statusCode: mediaItemResult.status.code,
        statusMessage: errorMsg,
      },
    });
  }

  logger.debug('Media item created successfully', {
    fileName,
    mediaItemId: mediaItemResult.mediaItem.id,
  });

  return mediaItemResult.mediaItem.id;
}

/**
 * Batch create multiple media items from upload tokens
 */
export async function batchCreateMediaItems(
  accessToken: string,
  items: Array<{ uploadToken: string; fileName: string }>,
  operationId?: string
): Promise<
  Array<{
    success: boolean;
    mediaItemId?: string;
    fileName: string;
    error?: string;
  }>
> {
  logger.debug('Batch creating media items', { count: items.length });

  const requestBody: CreateMediaItemRequest = {
    newMediaItems: items.map(item => ({
      simpleMediaItem: {
        uploadToken: item.uploadToken,
        fileName: item.fileName,
      },
    })),
  };

  const response = await fetchWithRetry(
    `${PHOTOS_API_BASE}/mediaItems:batchCreate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
    {
      maxRetries: 3,
      onRetry: (error, attempt, delay) => {
        logger.warn('Retrying batch create media items', {
          count: items.length,
          attempt,
          delay,
          error: error.message,
        });

        // Update operation status if tracking
        if (operationId) {
          operationStatusManager.retryOperation(
            operationId,
            `Batch create media items failed: ${error.message}`,
            attempt,
            3
          );
        }
      },
    }
  );

  const result: CreateMediaItemResponse = await response.json();

  // Map results back to items
  return result.newMediaItemResults.map((mediaItemResult, index) => {
    const fileName = items[index].fileName;

    if (mediaItemResult.mediaItem) {
      logger.debug('Media item created successfully', {
        fileName,
        mediaItemId: mediaItemResult.mediaItem.id,
      });

      return {
        success: true,
        mediaItemId: mediaItemResult.mediaItem.id,
        fileName,
      };
    } else {
      const errorMsg =
        mediaItemResult.status.message || 'Unknown error creating media item';

      logger.warn('Media item creation failed in batch', {
        fileName,
        statusCode: mediaItemResult.status.code,
        statusMessage: errorMsg,
      });

      return {
        success: false,
        fileName,
        error: errorMsg,
      };
    }
  });
}

/**
 * Batch upload multiple files to Google Photos
 * Uploads are done sequentially to respect backoff, but createMediaItem calls are batched (5 items per batch)
 */
export async function batchUploadFiles(
  accessToken: string,
  files: Array<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    driveFileId: string;
  }>,
  onProgress?: (
    fileId: string,
    status: 'uploading' | 'success' | 'error',
    error?: string
  ) => void,
  // Optional: pass userEmail so batch uploads can coordinate per-user backoff
  userEmail?: string
): Promise<
  Array<{
    driveFileId: string;
    photosMediaItemId?: string;
    success: boolean;
    error?: string;
  }>
> {
  return trackOperation(
    OperationType.LONG_WRITE,
    'Uploading files to Google Photos',
    async operationId => {
      logger.info(
        'Starting batch upload to Photos (sequential with batched creation)',
        {
          fileCount: files.length,
        }
      );

      // Batch size for createMediaItems in batchUploadFiles. Controls how many
      // media items are created in a single API call. Google Photos API allows up to 50.
      // This value can be tuned via PHOTOS_UPLOAD_BATCH_SIZE env var. Keep <= 50.
      //
      // Env: PHOTOS_UPLOAD_BATCH_SIZE (integer, max 50)
      const BATCH_SIZE = Math.max(
        1,
        Math.min(50, parseInt(process.env.PHOTOS_UPLOAD_BATCH_SIZE || '5', 10))
      );
      let completedCount = 0;
      const results: Array<{
        driveFileId: string;
        photosMediaItemId?: string;
        success: boolean;
        error?: string;
      }> = [];

      // Accumulate uploads that need createMediaItem calls
      let pendingBatch: Array<{
        driveFileId: string;
        uploadToken: string;
        fileName: string;
      }> = [];

      // Helper function to create media items for accumulated batch
      const processBatch = async () => {
        if (pendingBatch.length === 0) return;

        logger.debug('Processing batch of uploads', {
          count: pendingBatch.length,
        });

        try {
          const createResults = await batchCreateMediaItems(
            accessToken,
            pendingBatch.map(item => ({
              uploadToken: item.uploadToken,
              fileName: item.fileName,
            })),
            operationId
          );

          // Map results back to files
          createResults.forEach((result, index) => {
            const batchItem = pendingBatch[index];

            completedCount++;
            operationStatusManager.updateProgress(
              operationId,
              completedCount,
              files.length
            );

            if (result.success) {
              onProgress?.(batchItem.driveFileId, 'success');
              results.push({
                driveFileId: batchItem.driveFileId,
                photosMediaItemId: result.mediaItemId,
                success: true,
              });
            } else {
              onProgress?.(batchItem.driveFileId, 'error', result.error);
              results.push({
                driveFileId: batchItem.driveFileId,
                success: false,
                error: result.error,
              });
            }
          });
        } catch (error) {
          // If batch creation fails completely, mark all items in batch as failed
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          logger.error('Batch create media items failed', error, {
            batchSize: pendingBatch.length,
          });

          pendingBatch.forEach(batchItem => {
            completedCount++;
            operationStatusManager.updateProgress(
              operationId,
              completedCount,
              files.length
            );

            onProgress?.(batchItem.driveFileId, 'error', errorMsg);
            results.push({
              driveFileId: batchItem.driveFileId,
              success: false,
              error: errorMsg,
            });
          });
        }

        // Clear the batch
        pendingBatch = [];
      };

      // Process files sequentially so that any retry/backoff for one file
      // pauses progress for the rest of the batch (no wasted requests).
      for (const file of files) {
        // If another item triggered a backoff for this user, wait here.
        if (userEmail) await backoffController.waitWhilePaused(userEmail);

        try {
          onProgress?.(file.driveFileId, 'uploading');

          // Upload bytes to get upload token
          const uploadToken = await retryWithBackoff(
            async () =>
              uploadBytes(
                accessToken,
                file.buffer,
                file.fileName,
                file.mimeType,
                operationId
              ),
            {
              maxRetries: 3,
              onRetry: (error, attempt, delay) => {
                logger.warn('Retrying batch upload file', {
                  driveFileId: file.driveFileId,
                  fileName: file.fileName,
                  attempt,
                  delay,
                  error: error.message,
                });

                // If we have a userEmail, set a shared pause so other workers
                // for this user wait while we backoff.
                if (userEmail && delay && delay > 0) {
                  backoffController.pauseUserBackoff(
                    userEmail,
                    delay,
                    `batch upload retry for ${file.fileName}`
                  );
                }

                // Update operation status if tracking
                if (operationId) {
                  operationStatusManager.retryOperation(
                    operationId,
                    `Upload failed for ${file.fileName}: ${error.message}`,
                    attempt,
                    3
                  );
                }
              },
            }
          );

          // Add to pending batch
          pendingBatch.push({
            driveFileId: file.driveFileId,
            uploadToken,
            fileName: file.fileName,
          });

          // Process batch if it reaches the batch size
          if (pendingBatch.length >= BATCH_SIZE) {
            await processBatch();
          }
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';
          logger.error('Batch upload file failed after retries', error, {
            driveFileId: file.driveFileId,
            fileName: file.fileName,
          });

          completedCount++;
          operationStatusManager.updateProgress(
            operationId,
            completedCount,
            files.length
          );

          onProgress?.(file.driveFileId, 'error', errorMsg);

          results.push({
            driveFileId: file.driveFileId,
            success: false,
            error: errorMsg,
          });
        }
      }

      // Process any remaining items in the batch
      await processBatch();

      const successCount = results.filter(r => r.success).length;
      logger.info('Batch upload completed', {
        totalFiles: files.length,
        successCount,
        failureCount: files.length - successCount,
      });

      return results;
    },
    {
      description: `Uploading ${files.length} files`,
      total: files.length,
      metadata: { fileCount: files.length },
    }
  );
}

/**
 * Download a file from Google Drive
 */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  operationId?: string,
  signal?: AbortSignal
): Promise<Buffer> {
  logger.debug('Downloading file from Drive', { fileId });

  try {
    const response = await fetchWithRetry(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal,
      },
      {
        maxRetries: 3,
        onRetry: (error, attempt, delay) => {
          logger.warn('Retrying download Drive file', {
            fileId,
            attempt,
            delay,
            error: error.message,
          });

          // Update operation status if tracking
          if (operationId) {
            operationStatusManager.retryOperation(
              operationId,
              `Download failed: ${error.message}`,
              attempt,
              3
            );
          }
        },
      }
    );

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logger.debug('Drive file downloaded', {
      fileId,
      size: buffer.length,
    });

    return buffer;
  } catch (error) {
    // If authorization error occurred (401/403), try refreshing file metadata
    // to obtain a new download URL and retry once more.
    // Safely inspect the error object without using `any` so linter is happy.
    let statusCode: number | undefined;
    if (error && typeof error === 'object') {
      const obj = error as Record<string, unknown>;
      if (obj.details && typeof obj.details === 'object') {
        const details = obj.details as Record<string, unknown>;
        if (typeof details.statusCode === 'number') {
          statusCode = details.statusCode;
        }
      }
      if (statusCode === undefined && typeof obj['status'] === 'number') {
        statusCode = obj['status'] as number;
      }
    }

    const lowerMsg = error instanceof Error ? error.message.toLowerCase() : '';

    const isAuthError =
      statusCode === 401 ||
      statusCode === 403 ||
      lowerMsg.includes('unauthorized') ||
      lowerMsg.includes('forbidden');

    if (isAuthError) {
      logger.warn(
        'Authorization error downloading file, attempting to refresh metadata and retry',
        {
          fileId,
        }
      );

      try {
        const metadata = await getDriveFile(accessToken, fileId, operationId);

        // Minimal typing for the fields we may use from Drive metadata
        type DriveFileMetadata = { webContentLink?: string } & Record<
          string,
          unknown
        >;

        const meta = metadata as DriveFileMetadata;

        // Try webContentLink if available
        const downloadUrl = meta.webContentLink;

        if (downloadUrl) {
          logger.debug('Retrying download using refreshed webContentLink', {
            fileId,
            downloadUrl,
          });

          const response2 = await fetchWithRetry(
            downloadUrl,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
              signal,
            },
            {
              maxRetries: 2,
              onRetry: (err, attempt, delay) => {
                logger.warn('Retrying download via webContentLink', {
                  fileId,
                  attempt,
                  delay,
                  error: err.message,
                });

                if (operationId) {
                  operationStatusManager.retryOperation(
                    operationId,
                    `Download via refreshed URL failed: ${err.message}`,
                    attempt,
                    2
                  );
                }
              },
            }
          );

          const arrayBuffer2 = await response2.arrayBuffer();
          const buffer2 = Buffer.from(arrayBuffer2);

          logger.debug('Drive file downloaded via refreshed URL', {
            fileId,
            size: buffer2.length,
          });

          return buffer2;
        }
      } catch (metaErr) {
        logger.warn(
          'Failed to refresh metadata or download via refreshed URL',
          {
            fileId,
            error: metaErr instanceof Error ? metaErr.message : String(metaErr),
          }
        );
      }
    }

    // Re-throw original error if we couldn't recover
    throw error;
  }
}
