import {
  addToQueue as addToQueueDb,
  getQueueByStatus,
  updateQueueItem,
  getCachedFileMetadata,
  failUploadingItems,
  resetStuckUploadingItems,
} from './upload-queue-db';
import { getFileMetadataFromDriveCache } from './db';
import { getDriveFile } from './google-drive';
import { GoogleAuthContext } from '@/types/auth';
import {
  downloadDriveFile,
  batchCreateMediaItems,
  uploadBytes as photosUploadBytes,
  downloadDriveFileToTemp,
  uploadBytesFromFile,
  LARGE_FILE_THRESHOLD,
} from './google-photos';
import { recordUpload } from './uploads-db';
import { clearFileSyncStatusCache } from './sync-status';
import { createLogger } from './logger';
import operationStatusManager, { OperationType } from './operation-status';
import { retryWithBackoff } from './retry';
import backoffController from './backoff-controller';
import { QueueItem } from '@/types/upload-queue';
import { UploadRateTracker } from './upload-rate-tracker';
import { cleanAllTempFiles, deleteTempFile } from './temp-file-utils';
import { ignoreFile } from './ignored-files-db';

const logger = createLogger('uploads-manager');

/**
 * Centralized manager for upload queue operations
 * Singleton pattern ensures consistent state across API routes
 */
class UploadsManager {
  // Track active processing per user to prevent concurrent processing
  private activeProcessing = new Set<string>();

  // Per-user AbortControllers for in-flight work so we can cancel downloads/uploads
  private activeControllers = new Map<string, AbortController>();

  // Per-user rate trackers
  private rateTrackers = new Map<string, UploadRateTracker>();

  private static instance: UploadsManager | undefined;
  private initialized = false;

  private constructor() {
    logger.info('UploadsManager singleton created');
  }

  // Wrapper around the photos uploadBytes function so instance methods can be
  // spied/mocked in tests. Tests spy on the instance method `uploadBytes`.
  private async uploadBytes(params: {
    auth: GoogleAuthContext;
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    operationId?: string;
    signal?: AbortSignal;
  }): Promise<string> {
    return photosUploadBytes(params);
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): UploadsManager {
    if (!UploadsManager.instance) {
      logger.info('Creating new UploadsManager singleton');
      UploadsManager.instance = new UploadsManager();
    }
    return UploadsManager.instance;
  }

  /**
   * Initialize the manager - reset stuck uploading items from previous runs
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info(
      'Initializing UploadsManager - resetting stuck uploading items and cleaning temp files'
    );

    // Clean all temp files from previous runs
    cleanAllTempFiles();

    // Note: We don't have userEmail at init time, so this will be done per-user
    // on first processing request. This is intentional - we only reset for users
    // who actually try to process.

    this.initialized = true;
  }

  /**
   * Add files to the upload queue
   * Consolidates logic from POST /api/queue
   */
  async addToQueue({
    userEmail,
    auth,
    fileIds,
    operationId,
  }: {
    userEmail: string;
    auth: GoogleAuthContext;
    fileIds: string[];
    operationId?: string;
  }): Promise<{
    added: Array<{
      driveFileId: string;
      fileName: string;
      mimeType: string;
    }>;
    skipped: Array<{ driveFileId: string; reason: string }>;
  }> {
    await this.initialize();

    logger.info('Adding files to queue', {
      userEmail,
      fileCount: fileIds.length,
    });

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

        // Update progress if tracking
        if (operationId) {
          operationStatusManager.updateProgress(operationId, i, fileIds.length);
        }

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
                userEmail,
                fileId,
              });

              const fileMetadata = await getDriveFile({
                auth,
                fileId,
              });

              if (!fileMetadata.name || !fileMetadata.mimeType) {
                logger.warn('File metadata incomplete, skipping', {
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
              fileSize =
                fileMetadata.size !== undefined && fileMetadata.size !== null
                  ? parseInt(String(fileMetadata.size))
                  : undefined;

              logger.debug('File metadata fetched from Drive API', {
                userEmail,
                fileId,
                fileName,
              });
            }
          }

          // Add this file to queue immediately
          const result = await addToQueueDb(userEmail, [
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
            userEmail,
            fileId,
            added: result.added.length > 0,
          });

          // Small delay to yield control and allow SSE updates to be sent
          await new Promise(resolve => setImmediate(resolve));
        } catch (error) {
          logger.error('Error processing file', error, {
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
      if (operationId) {
        operationStatusManager.updateProgress(
          operationId,
          fileIds.length,
          fileIds.length
        );
      }

      logger.info('Add to queue completed', {
        userEmail,
        addedCount: allAdded.length,
        skippedCount: allSkipped.length,
      });

      return {
        added: allAdded,
        skipped: allSkipped,
      };
    } catch (error) {
      logger.error('Error adding files to queue', error, { userEmail });
      throw error;
    }
  }

  /**
   * Start processing the upload queue for a user
   * Consolidates logic from queue-processor.ts with batching support
   */
  async startProcessing(
    userEmail: string,
    auth: GoogleAuthContext
  ): Promise<void> {
    await this.initialize();

    // Check if already processing for this user
    if (this.activeProcessing.has(userEmail)) {
      logger.info('Queue already being processed for user, skipping', {
        userEmail,
      });
      return;
    }

    // Mark as processing
    this.activeProcessing.add(userEmail);

    // Get or create a rate tracker for the user and reset it
    if (!this.rateTrackers.has(userEmail)) {
      this.rateTrackers.set(userEmail, new UploadRateTracker());
    }
    const rateTracker = this.rateTrackers.get(userEmail)!;
    rateTracker.reset();

    try {
      logger.info('Starting queue processing', { userEmail });

      // Reset any stuck uploading items for this user
      await resetStuckUploadingItems(userEmail, 0);

      // Get pending items
      const pendingItems = await getQueueByStatus(userEmail, 'pending');

      if (pendingItems.length === 0) {
        logger.info('No pending items in queue', { userEmail });
        return;
      }

      logger.info('Processing queue items', {
        userEmail,
        itemCount: pendingItems.length,
      });

      // Create an operation to track overall progress
      const operationId = operationStatusManager.createOperation(
        OperationType.LONG_WRITE,
        'Processing Upload Queue',
        {
          description: `Uploading ${pendingItems.length} file(s) to Google Photos`,
          total: pendingItems.length,
          metadata: { userEmail },
        }
      );

      operationStatusManager.startOperation(operationId);

      let successCount = 0;
      let failureCount = 0;
      let stopRequestedDuringRun = false;

      // Concurrency settings
      // Single env-driven concurrency level for processing workers. Use this
      // to control how many parallel workers will process a single user's
      // upload queue. The value is bounded by a hard cap to prevent runaway
      // concurrency.
      //
      // Env: QUEUE_CONCURRENCY (integer, default 5, max 10)
      const envConcurrency = Math.max(
        1,
        parseInt(process.env.QUEUE_CONCURRENCY || '5', 10)
      );
      const MAX_ALLOWED_CONCURRENCY = 15;
      const concurrency = Math.max(
        1,
        Math.min(
          MAX_ALLOWED_CONCURRENCY,
          Math.min(envConcurrency, pendingItems.length)
        )
      );

      logger.info('Processing queue items with concurrency', {
        userEmail,
        totalItems: pendingItems.length,
        concurrency,
      });

      let nextIndex = 0;

      // Create an AbortController for this run so we can cancel in-flight fetches
      const controller = new AbortController();
      this.activeControllers.set(userEmail, controller);

      // Batch settings for createMediaItems
      // Batch settings for createMediaItems
      // Number of media items to include in a single call to
      // mediaItems:batchCreate. Google Photos API allows up to 50 items per
      // request; this value can be tuned via the PHOTOS_MEDIA_BATCH_SIZE env
      // var. Keep it <= 50.
      //
      // Env: PHOTOS_MEDIA_BATCH_SIZE (integer, max 50)
      const BATCH_SIZE = Math.max(
        1,
        Math.min(50, parseInt(process.env.PHOTOS_MEDIA_BATCH_SIZE || '30', 10))
      );
      const pendingBatch: Array<{
        queueItem: QueueItem;
        uploadToken: string;
      }> = [];

      // Helper function to process accumulated batch
      const processBatch = async () => {
        if (pendingBatch.length === 0) return;

        // Take a snapshot of the pending batch so concurrent workers can't race
        const batchItems = pendingBatch.splice(0, pendingBatch.length);

        logger.info('Processing batch of media items', {
          userEmail,
          batchSize: batchItems.length,
        });

        try {
          const createResults = await batchCreateMediaItems({
            auth,
            items: batchItems.map(item => ({
              uploadToken: item.uploadToken,
              fileName: item.queueItem.fileName,
            })),
            operationId,
          });

          // Process results and update database
          for (let i = 0; i < createResults.length; i++) {
            const result = createResults[i];
            const { queueItem } = batchItems[i];

            if (result.success && result.mediaItemId) {
              // Record upload in database
              await recordUpload(
                userEmail,
                queueItem.driveFileId,
                result.mediaItemId,
                queueItem.fileName,
                queueItem.mimeType,
                queueItem.fileSize
              );

              // Clear sync status cache for this file
              await clearFileSyncStatusCache(userEmail, [
                queueItem.driveFileId,
              ]);

              // Update item status to completed
              await updateQueueItem(userEmail, queueItem.id, {
                status: 'completed',
                completedAt: new Date().toISOString(),
                photosMediaItemId: result.mediaItemId,
              });

              // Record the upload for rate tracking
              if (queueItem.fileSize) {
                rateTracker.addUpload(queueItem.fileSize);
              }

              successCount++;

              logger.info('Queue item processed successfully', {
                userEmail,
                queueItemId: queueItem.id,
                driveFileId: queueItem.driveFileId,
                fileName: queueItem.fileName,
              });
            } else {
              // Update item status to failed
              await updateQueueItem(userEmail, queueItem.id, {
                status: 'failed',
                completedAt: new Date().toISOString(),
                error: result.error || 'Unknown error creating media item',
              });

              failureCount++;

              logger.error(
                'Queue item failed to create media item',
                new Error(result.error || 'Unknown error'),
                {
                  userEmail,
                  queueItemId: queueItem.id,
                  driveFileId: queueItem.driveFileId,
                  fileName: queueItem.fileName,
                }
              );
            }

            // Update operation progress after each item
            const completedSoFar = successCount + failureCount;
            operationStatusManager.updateProgress(
              operationId,
              Math.min(completedSoFar, pendingItems.length),
              pendingItems.length
            );
          }

          // If for some reason the Photos API returned fewer results than items
          // we sent, mark the remaining items as failed so they don't get lost.
          if (createResults.length < batchItems.length) {
            for (let j = createResults.length; j < batchItems.length; j++) {
              const { queueItem } = batchItems[j];
              await updateQueueItem(userEmail, queueItem.id, {
                status: 'failed',
                completedAt: new Date().toISOString(),
                error: 'No result returned from batch create',
              });

              failureCount++;

              const completedSoFar = successCount + failureCount;
              operationStatusManager.updateProgress(
                operationId,
                Math.min(completedSoFar, pendingItems.length),
                pendingItems.length
              );
            }
          }
        } catch (error) {
          // If batch creation fails completely, mark all items in this snapshot as failed
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown error';

          logger.error('Batch create media items failed', error, {
            userEmail,
            batchSize: batchItems.length,
          });

          for (const { queueItem } of batchItems) {
            await updateQueueItem(userEmail, queueItem.id, {
              status: 'failed',
              completedAt: new Date().toISOString(),
              error: errorMsg,
            });

            failureCount++;

            // Update operation progress
            const completedSoFar = successCount + failureCount;
            operationStatusManager.updateProgress(
              operationId,
              Math.min(completedSoFar, pendingItems.length),
              pendingItems.length
            );
          }
        }
      };

      const workers: Promise<void>[] = [];

      for (let w = 0; w < concurrency; w++) {
        const worker = (async () => {
          while (!controller.signal.aborted) {
            const index = nextIndex++;
            if (index >= pendingItems.length) break;
            const item = pendingItems[index];

            logger.info('Worker picked queue item', {
              userEmail,
              workerId: w,
              queueItemId: item.id,
              driveFileId: item.driveFileId,
              fileName: item.fileName,
            });

            // Wait if the user is paused due to a backoff triggered elsewhere
            await backoffController.waitWhilePaused(userEmail);

            // Skip files with zero size - mark as completed without uploading
            // Check this BEFORE marking as 'uploading' to avoid any processing
            // Note: Check for both 0 and undefined, as fileSize might be undefined
            // for 0-byte files due to previous bug in metadata parsing
            if (item.fileSize === 0 || item.fileSize === undefined) {
              logger.info('Skipping zero-sized or unknown-size file', {
                userEmail,
                queueItemId: item.id,
                driveFileId: item.driveFileId,
                fileName: item.fileName,
                fileSize: item.fileSize,
              });

              try {
                // Mark file as ignored in the ignored_files table
                ignoreFile(userEmail, item.driveFileId, 'Empty file (0 bytes)');

                await updateQueueItem(userEmail, item.id, {
                  status: 'completed',
                  completedAt: new Date().toISOString(),
                  error: 'Skipped: Empty file (0 bytes)',
                });

                successCount++;

                // Update operation progress
                const completedSoFar = successCount + failureCount;
                operationStatusManager.updateProgress(
                  operationId,
                  Math.min(completedSoFar, pendingItems.length),
                  pendingItems.length
                );

                logger.info('Zero-sized file skipped and marked as ignored', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                });
              } catch (error) {
                logger.error(
                  'Error marking zero-sized file as ignored',
                  error,
                  {
                    userEmail,
                    queueItemId: item.id,
                    driveFileId: item.driveFileId,
                    fileName: item.fileName,
                  }
                );
                // Continue processing even if marking as ignored fails
              }

              continue;
            }

            // Track temp file path for cleanup
            let tempFilePath: string | null = null;

            try {
              // Update item status to uploading
              await updateQueueItem(userEmail, item.id, {
                status: 'uploading',
                startedAt: new Date().toISOString(),
              });

              // Determine if we should use temp file streaming for large files
              const useStreaming =
                item.fileSize && item.fileSize > LARGE_FILE_THRESHOLD;

              let uploadToken: string;

              if (useStreaming) {
                // Large file: stream to temp file, then upload from temp file
                logger.debug('Using temp file streaming for large file', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                  fileSize: item.fileSize,
                });

                // Download to temp file ONCE (with retry for download failures)
                logger.debug('Downloading file from Drive to temp file', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                  fileSize: item.fileSize,
                });

                const downloadResult = await retryWithBackoff(
                  async () =>
                    downloadDriveFileToTemp({
                      auth,
                      fileId: item.driveFileId,
                      userEmail,
                      fileSize: item.fileSize,
                      operationId,
                      signal: controller.signal,
                    }),
                  {
                    maxRetries: 3,
                    onRetry: (error, attempt, delay) => {
                      logger.warn('Retrying download to temp file', {
                        userEmail,
                        queueItemId: item.id,
                        driveFileId: item.driveFileId,
                        fileName: item.fileName,
                        attempt,
                        delay,
                        error: error.message,
                      });

                      if (delay && delay > 0) {
                        backoffController.pauseUserBackoff(
                          userEmail,
                          delay,
                          `backoff retry download for ${item.fileName}`
                        );
                      }

                      operationStatusManager.retryOperation(
                        operationId,
                        `Retrying download ${item.fileName}: ${error.message}`,
                        attempt,
                        3
                      );
                    },
                  }
                );

                tempFilePath = downloadResult.tempFilePath;

                logger.debug('File downloaded to temp file successfully', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  tempFilePath,
                  size: downloadResult.fileSize,
                });

                // Upload from temp file (with retry, reuses same temp file)
                logger.debug('Uploading file to Photos from temp file', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                  tempFilePath,
                });

                uploadToken = await retryWithBackoff(
                  async () =>
                    uploadBytesFromFile({
                      auth,
                      filePath: tempFilePath!,
                      fileName: item.fileName,
                      mimeType: item.mimeType,
                      operationId,
                      signal: controller.signal,
                    }),
                  {
                    maxRetries: 3,
                    onRetry: (error, attempt, delay) => {
                      logger.warn('Retrying upload from temp file', {
                        userEmail,
                        queueItemId: item.id,
                        driveFileId: item.driveFileId,
                        fileName: item.fileName,
                        tempFilePath,
                        attempt,
                        delay,
                        error: error.message,
                      });

                      if (delay && delay > 0) {
                        backoffController.pauseUserBackoff(
                          userEmail,
                          delay,
                          `backoff retry upload for ${item.fileName}`
                        );
                      }

                      operationStatusManager.retryOperation(
                        operationId,
                        `Retrying upload ${item.fileName}: ${error.message}`,
                        attempt,
                        3
                      );
                    },
                  }
                );
              } else {
                // Small file: use in-memory approach
                logger.debug('Using in-memory approach for small file', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                  fileSize: item.fileSize,
                });

                // Download file from Drive ONCE (with retry for download failures)
                logger.debug('Downloading file from Drive', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                  fileSize: item.fileSize,
                });

                const buffer = await retryWithBackoff(
                  async () =>
                    downloadDriveFile({
                      auth,
                      fileId: item.driveFileId,
                      signal: controller.signal,
                    }),
                  {
                    maxRetries: 3,
                    onRetry: (error, attempt, delay) => {
                      logger.warn('Retrying download from Drive', {
                        userEmail,
                        queueItemId: item.id,
                        driveFileId: item.driveFileId,
                        fileName: item.fileName,
                        attempt,
                        delay,
                        error: error.message,
                      });

                      if (delay && delay > 0) {
                        backoffController.pauseUserBackoff(
                          userEmail,
                          delay,
                          `backoff retry download for ${item.fileName}`
                        );
                      }

                      operationStatusManager.retryOperation(
                        operationId,
                        `Retrying download ${item.fileName}: ${error.message}`,
                        attempt,
                        3
                      );
                    },
                  }
                );

                logger.debug('File downloaded successfully', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  size: buffer.length,
                });

                // Upload bytes to get upload token (with retry, reuses buffer)
                logger.debug('Uploading file to Photos', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                });

                uploadToken = await retryWithBackoff(
                  async () =>
                    this.uploadBytes({
                      auth: auth,
                      fileBuffer: buffer,
                      fileName: item.fileName,
                      mimeType: item.mimeType,
                      operationId,
                      signal: controller.signal,
                    }),
                  {
                    maxRetries: 3,
                    onRetry: (error, attempt, delay) => {
                      logger.warn('Retrying upload to Photos', {
                        userEmail,
                        queueItemId: item.id,
                        driveFileId: item.driveFileId,
                        fileName: item.fileName,
                        attempt,
                        delay,
                        error: error.message,
                      });

                      if (delay && delay > 0) {
                        backoffController.pauseUserBackoff(
                          userEmail,
                          delay,
                          `backoff retry upload for ${item.fileName}`
                        );
                      }

                      operationStatusManager.retryOperation(
                        operationId,
                        `Retrying upload ${item.fileName}: ${error.message}`,
                        attempt,
                        3
                      );
                    },
                  }
                );
              }

              logger.debug('Upload token received', {
                userEmail,
                queueItemId: item.id,
                driveFileId: item.driveFileId,
                fileName: item.fileName,
              });

              // Add to pending batch
              pendingBatch.push({
                queueItem: item,
                uploadToken,
              });

              // Process batch if it reaches the batch size
              if (pendingBatch.length >= BATCH_SIZE) {
                await processBatch();
              }
            } catch (error) {
              // If the error was due to an abort, stop processing without
              // marking the item as failed (so it remains pending).
              const isAbort =
                error &&
                typeof error === 'object' &&
                (error as Record<string, unknown>).name === 'AbortError';

              if (isAbort) {
                logger.info('Processing aborted during item download/upload', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                });

                // Ensure stop flag is set so main flow finalizes accordingly
                stopRequestedDuringRun = true;

                // Do not mark the item as failed; leave as pending for retry
                break;
              }

              const errorMessage =
                error instanceof Error ? error.message : String(error);

              logger.error('Error processing queue item', error, {
                userEmail,
                queueItemId: item.id,
                driveFileId: item.driveFileId,
                fileName: item.fileName,
              });

              // Update item status to failed
              await updateQueueItem(userEmail, item.id, {
                status: 'failed',
                completedAt: new Date().toISOString(),
                error: errorMessage,
              });

              failureCount++;

              // Update operation progress after each item
              const completedSoFar = successCount + failureCount;
              operationStatusManager.updateProgress(
                operationId,
                Math.min(completedSoFar, pendingItems.length),
                pendingItems.length
              );
            } finally {
              // Always clean up temp file if it was created
              if (tempFilePath) {
                deleteTempFile(tempFilePath);
                tempFilePath = null;
              }
            }
          }
        })();

        workers.push(worker);
      }

      await Promise.all(workers);

      // Process any remaining items in the batch
      await processBatch();

      // Compute processed count
      const processedCount = successCount + failureCount;

      // Update final operation progress to actual processed items
      operationStatusManager.updateProgress(
        operationId,
        Math.min(processedCount, pendingItems.length),
        pendingItems.length
      );

      // If a stop was requested during the run, mark the operation as completed
      // but include metadata to indicate it was stopped prematurely.
      if (stopRequestedDuringRun) {
        operationStatusManager.completeOperation(operationId, {
          successCount,
          failureCount,
          stopped: true,
          processedCount,
        });

        logger.info('Queue processing stopped by user', {
          userEmail,
          totalItems: pendingItems.length,
          processedCount,
          successCount,
          failureCount,
        });
      } else {
        // Complete the operation normally
        operationStatusManager.completeOperation(operationId, {
          successCount,
          failureCount,
          processedCount,
        });

        logger.info('Queue processing completed', {
          userEmail,
          totalItems: pendingItems.length,
          successCount,
          failureCount,
        });
      }
    } catch (error) {
      logger.error('Error processing queue', error, { userEmail });
      throw error;
    } finally {
      // Mark as not processing
      this.activeProcessing.delete(userEmail);
      // Remove and abort any active controller for this user
      const controller = this.activeControllers.get(userEmail);
      if (controller) {
        try {
          controller.abort();
        } catch {
          // ignore
        }
        this.activeControllers.delete(userEmail);
      }
    }
  }

  /**
   * Get upload stats for a user
   */
  getUploadStats(userEmail: string) {
    const tracker = this.rateTrackers.get(userEmail);
    if (tracker) {
      return tracker.getStats();
    }
    return null;
  }

  /**
   * Request that processing for a user be stopped
   * Consolidates logic from queue-processor.ts and DELETE /api/queue/process
   */
  stopProcessing(userEmail: string): void {
    logger.info('Stop processing requested', { userEmail });

    // Reset the rate tracker for the user
    const tracker = this.rateTrackers.get(userEmail);
    if (tracker) {
      tracker.reset();
    }

    // If there's no active processing for this user, reset any stuck uploading items
    // so future processing attempts are not blocked by leftover 'uploading' states.
    if (!this.activeProcessing.has(userEmail)) {
      logger.info(
        'No active processing for user - resetting stuck uploading items',
        {
          userEmail,
        }
      );

      resetStuckUploadingItems(userEmail, 0).catch(err => {
        logger.warn(
          'Failed to reset stuck uploading items during stopProcessing',
          {
            userEmail,
            error: err instanceof Error ? err.message : String(err),
          }
        );
      });
    }

    // If there's an in-flight controller for this user, abort to cancel downloads/uploads
    const controller = this.activeControllers.get(userEmail);
    if (controller) {
      logger.info('Aborting in-flight work for user due to stop request', {
        userEmail,
      });
      try {
        controller.abort();
      } catch (e) {
        logger.warn('Error aborting controller', { userEmail, error: e });
      }
    }

    // Mark any currently uploading items as failed so UI reflects the stop
    failUploadingItems(userEmail, 'Processing stopped by user').catch(err => {
      logger.warn('Failed to mark uploading items as failed', {
        userEmail,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Fail any active long-write operation for this user
    try {
      const allOps = operationStatusManager.getAllOperations();
      allOps.forEach(op => {
        if (
          op.metadata?.userEmail === userEmail &&
          op.status === 'in_progress'
        ) {
          operationStatusManager.failOperation(op.id, 'Stopped by user');
        }
      });
    } catch (err) {
      logger.warn('Failed to update operation status for stop request', {
        userEmail,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// Export the singleton instance
const uploadsManager = UploadsManager.getInstance();

export default uploadsManager;
