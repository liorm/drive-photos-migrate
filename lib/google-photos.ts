import {
  CreateMediaItemRequest,
  CreateMediaItemResponse,
} from '@/types/google-photos';
import { createLogger } from '@/lib/logger';
import { fetchWithRetry } from '@/lib/retry';
import operationStatusManager, {
  trackOperation,
  OperationType,
} from '@/lib/operation-status';
import { getDriveFile } from './google-drive';
import { retryWithBackoff } from '@/lib/retry';
import { withGoogleAuthRetry } from '@/lib/token-refresh';
import { GoogleAuthContext } from '@/types/auth';
import backoffController from './backoff-controller';

const logger = createLogger('google-photos');

const PHOTOS_API_BASE = 'https://photoslibrary.googleapis.com/v1';

/**
 * Step 1: Upload file bytes to Photos API and get upload token
 */
interface UploadBytesParams {
  auth: GoogleAuthContext;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  operationId?: string;
  signal?: AbortSignal;
}

export async function uploadBytes({
  auth,
  fileBuffer,
  fileName,
  mimeType: _mimeType,
  operationId,
  signal,
}: UploadBytesParams): Promise<string> {
  logger.debug('Uploading bytes to Photos API', {
    fileName,
    size: fileBuffer.length,
  });

  const { fetchWithRetry } = await import('./retry');

  const response = await fetchWithRetry(
    `${PHOTOS_API_BASE}/uploads`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-File-Name': encodeURIComponent(fileName),
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: fileBuffer as unknown as BodyInit,
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
 * Batch create multiple media items from upload tokens
 */
interface BatchCreateMediaItemsParams {
  auth: GoogleAuthContext;
  items: Array<{ uploadToken: string; fileName: string }>;
  operationId?: string;
}

export async function batchCreateMediaItems({
  auth,
  items,
  operationId: _operationId,
}: BatchCreateMediaItemsParams): Promise<
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

  const { result: response } = await withGoogleAuthRetry(auth, async auth => {
    const res = await fetchWithRetry(
      `${PHOTOS_API_BASE}/mediaItems:batchCreate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );
    return res;
  });

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
interface BatchUploadFilesParams {
  auth: GoogleAuthContext;
  files: Array<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    driveFileId: string;
  }>;
  onProgress?: (
    fileId: string,
    status: 'uploading' | 'success' | 'error',
    error?: string
  ) => void;
  userEmail?: string;
}

export async function batchUploadFiles({
  auth,
  files,
  onProgress,
  userEmail,
}: BatchUploadFilesParams): Promise<
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
          const createResults = await batchCreateMediaItems({
            auth,
            items: pendingBatch.map(item => ({
              uploadToken: item.uploadToken,
              fileName: item.fileName,
            })),
            operationId,
          });

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
              uploadBytes({
                auth,
                fileBuffer: file.buffer,
                fileName: file.fileName,
                mimeType: file.mimeType,
                operationId,
              }),
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
interface DownloadDriveFileParams {
  auth: GoogleAuthContext;
  fileId: string;
  operationId?: string;
  signal?: AbortSignal;
}

export async function downloadDriveFile({
  auth,
  fileId,
  operationId,
  signal,
}: DownloadDriveFileParams): Promise<Buffer> {
  logger.debug('Downloading file from Drive', { fileId });

  try {
    const response = await fetchWithRetry(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
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
        const metadata = await getDriveFile({ auth, fileId, operationId });

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
                Authorization: `Bearer ${auth.accessToken}`,
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

// =====================
// Album Management APIs
// =====================

/**
 * Google Photos Album type
 */
export interface GooglePhotosAlbum {
  id: string;
  title: string;
  productUrl: string;
  isWriteable?: boolean;
  mediaItemsCount?: string;
  coverPhotoBaseUrl?: string;
  coverPhotoMediaItemId?: string;
}

/**
 * List all albums for the user (with pagination support)
 */
interface ListAlbumsParams {
  auth: GoogleAuthContext;
  pageSize?: number; // Max 50
  pageToken?: string;
}

export async function listAlbums({
  auth,
  pageSize = 50,
  pageToken,
}: ListAlbumsParams): Promise<{
  albums: GooglePhotosAlbum[];
  nextPageToken?: string;
}> {
  logger.debug('Listing Google Photos albums', { pageSize, pageToken });

  const url = new URL(`${PHOTOS_API_BASE}/albums`);
  url.searchParams.set('pageSize', Math.min(pageSize, 50).toString());
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }

  const { result: response } = await withGoogleAuthRetry(auth, async auth => {
    return await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
      },
    });
  });

  const data = (await response.json()) as {
    albums?: GooglePhotosAlbum[];
    nextPageToken?: string;
  };

  logger.debug('Albums listed successfully', {
    count: data.albums?.length || 0,
    hasNextPage: !!data.nextPageToken,
  });

  return {
    albums: data.albums || [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Get all albums for the user (handles pagination automatically)
 */
export async function getAllAlbums(
  auth: GoogleAuthContext
): Promise<GooglePhotosAlbum[]> {
  logger.info('Fetching all Google Photos albums');

  const allAlbums: GooglePhotosAlbum[] = [];
  let pageToken: string | undefined;

  do {
    const { albums, nextPageToken } = await listAlbums({
      auth,
      pageSize: 50,
      pageToken,
    });

    allAlbums.push(...albums);
    pageToken = nextPageToken;
  } while (pageToken);

  logger.info('Fetched all Google Photos albums', { count: allAlbums.length });

  return allAlbums;
}

/**
 * Create a new album
 */
interface CreateAlbumParams {
  auth: GoogleAuthContext;
  title: string;
}

export async function createAlbum({
  auth,
  title,
}: CreateAlbumParams): Promise<GooglePhotosAlbum> {
  logger.info('Creating Google Photos album', { title });

  const { result: response } = await withGoogleAuthRetry(auth, async auth => {
    return await fetchWithRetry(`${PHOTOS_API_BASE}/albums`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        album: {
          title,
        },
      }),
    });
  });

  const album: GooglePhotosAlbum = await response.json();

  logger.info('Album created successfully', {
    title,
    albumId: album.id,
    productUrl: album.productUrl,
  });

  return album;
}

/**
 * Get album by ID (for validation)
 */
interface GetAlbumParams {
  auth: GoogleAuthContext;
  albumId: string;
}

export async function getAlbum({
  auth,
  albumId,
}: GetAlbumParams): Promise<GooglePhotosAlbum | null> {
  logger.debug('Getting Google Photos album', { albumId });

  try {
    const { result: response } = await withGoogleAuthRetry(auth, async auth => {
      return await fetchWithRetry(`${PHOTOS_API_BASE}/albums/${albumId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
        },
      });
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.debug('Album not found', { albumId });
        return null;
      }
      throw new Error(`Failed to get album: ${response.statusText}`);
    }

    const album: GooglePhotosAlbum = await response.json();

    logger.debug('Album retrieved successfully', {
      albumId,
      title: album.title,
    });

    return album;
  } catch (error) {
    logger.error('Error getting album', error, { albumId });
    return null;
  }
}

/**
 * Add media items to an album in batches
 */
interface BatchAddMediaItemsToAlbumParams {
  auth: GoogleAuthContext;
  albumId: string;
  mediaItemIds: string[];
}

export async function batchAddMediaItemsToAlbum({
  auth,
  albumId,
  mediaItemIds,
}: BatchAddMediaItemsToAlbumParams): Promise<void> {
  logger.info('Adding media items to album', {
    albumId,
    itemCount: mediaItemIds.length,
  });

  // Google Photos API allows max 50 items per request
  const BATCH_SIZE = 50;

  for (let i = 0; i < mediaItemIds.length; i += BATCH_SIZE) {
    const batch = mediaItemIds.slice(i, i + BATCH_SIZE);

    logger.debug('Adding batch to album', {
      albumId,
      batchSize: batch.length,
      progress: `${i + batch.length}/${mediaItemIds.length}`,
    });

    await retryWithBackoff(
      async () => {
        const { result: response } = await withGoogleAuthRetry(
          auth,
          async auth => {
            return await fetchWithRetry(
              `${PHOTOS_API_BASE}/albums/${albumId}:batchAddMediaItems`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${auth.accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  mediaItemIds: batch,
                }),
              }
            );
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to add media items to album: ${response.statusText}`
          );
        }
      },
      {
        maxRetries: 3,
        onRetry: (error, attempt, delay) => {
          logger.warn('Retrying batch add to album', {
            albumId,
            batchSize: batch.length,
            attempt,
            delay,
            error: error.message,
          });
        },
      }
    );
  }

  logger.info('All media items added to album successfully', {
    albumId,
    totalItems: mediaItemIds.length,
  });
}
