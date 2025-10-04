import { getQueueByStatus, updateQueueItem } from './upload-queue-db';
import { downloadDriveFile, uploadFileToPhotos } from './google-photos';
import { recordUpload } from './uploads-db';
import { clearFileSyncStatusCache } from './sync-status';
import { createLogger } from './logger';
import operationStatusManager, { OperationType } from './operation-status';
import { retryWithBackoff } from './retry';
import backoffController from './backoff-controller';

const logger = createLogger('queue-processor');

// Track active processing per user to prevent concurrent processing
const activeProcessing = new Set<string>();

// Track stop requests (set by API/UI) so processing can be stopped
// gracefully between batches.
const stopRequests = new Set<string>();

/** Request that processing for a user be stopped. */
export function requestStopProcessing(userEmail: string): void {
  stopRequests.add(userEmail);
}

/** Clear a previously requested stop for a user. */
export function clearStopRequest(userEmail: string): void {
  stopRequests.delete(userEmail);
}

/**
 * Process the upload queue for a user
 * Uploads items one at a time
 */
export async function processQueue(
  userEmail: string,
  accessToken: string
): Promise<void> {
  // Check if already processing for this user
  if (activeProcessing.has(userEmail)) {
    logger.info('Queue already being processed for user, skipping', {
      userEmail,
    });
    return;
  }

  // Respect a stop request that was issued before processing started
  if (stopRequests.has(userEmail)) {
    logger.info('Stop requested before starting processing, skipping', {
      userEmail,
    });
    stopRequests.delete(userEmail);
    return;
  }

  // Mark as processing
  activeProcessing.add(userEmail);

  try {
    logger.info('Starting queue processing', { userEmail });

    // Single-instance server: reset any items left in 'uploading' state so
    // they can be retried. This is safe because there's only one process
    // handling the queue.
    // (No implicit resets here - stop is explicit via requestStopProcessing)

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
      }
    );

    operationStatusManager.startOperation(operationId);

    let successCount = 0;
    let failureCount = 0;
    let stopRequestedDuringRun = false;

    // Process items with limited concurrency (workers). This allows up to
    // QUEUE_CONCURRENCY concurrent downloads/uploads while still honoring
    // shared backoff pauses when a retry indicates rate limiting.
    // Process items with limited concurrency (workers). This allows up to
    // QUEUE_CONCURRENCY concurrent downloads/uploads while still honoring
    // shared backoff pauses when a retry indicates rate limiting.
    const DEFAULT_CONCURRENCY =
      parseInt(process.env.QUEUE_CONCURRENCY || '5', 10) || 5;
    const MAX_CONCURRENCY = 10;
    const concurrency = Math.max(
      1,
      Math.min(
        MAX_CONCURRENCY,
        Math.min(DEFAULT_CONCURRENCY, pendingItems.length)
      )
    );

    logger.info('Processing queue items with concurrency', {
      userEmail,
      totalItems: pendingItems.length,
      concurrency,
    });

    let nextIndex = 0;

    const workers: Promise<void>[] = [];

    for (let w = 0; w < concurrency; w++) {
      const worker = (async () => {
        while (true) {
          // Respect a stop request between items
          if (stopRequests.has(userEmail)) {
            logger.info('Stop requested during processing, worker exiting', {
              userEmail,
              workerId: w,
            });

            // Record that a stop was requested so main flow can finalize accordingly
            stopRequestedDuringRun = true;

            // Clear the stop request so future processing calls aren't immediately skipped
            stopRequests.delete(userEmail);

            break;
          }
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

          // Check stop request again after any pause
          if (stopRequests.has(userEmail)) {
            logger.info(
              'Stop requested during processing (after pause), worker exiting',
              {
                userEmail,
                workerId: w,
                queueItemId: item.id,
              }
            );

            stopRequestedDuringRun = true;
            stopRequests.delete(userEmail);
            break;
          }

          try {
            await retryWithBackoff(
              async () => {
                // Update item status to uploading
                await updateQueueItem(userEmail, item.id, {
                  status: 'uploading',
                  startedAt: new Date().toISOString(),
                });

                // Download file from Drive
                logger.debug('Downloading file from Drive', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                });

                const buffer = await downloadDriveFile(
                  accessToken,
                  item.driveFileId
                );

                logger.debug('File downloaded successfully', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  size: buffer.length,
                });

                // Upload to Photos
                logger.debug('Uploading file to Photos', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                });

                const photosMediaItemId = await uploadFileToPhotos(
                  accessToken,
                  buffer,
                  item.fileName,
                  item.mimeType
                );

                logger.info('File uploaded to Photos successfully', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                  photosMediaItemId,
                });

                // Record upload in database
                await recordUpload(
                  userEmail,
                  item.driveFileId,
                  photosMediaItemId,
                  item.fileName,
                  item.mimeType
                );

                // Clear sync status cache for this file
                await clearFileSyncStatusCache(userEmail, [item.driveFileId]);

                // Update item status to completed
                await updateQueueItem(userEmail, item.id, {
                  status: 'completed',
                  completedAt: new Date().toISOString(),
                  photosMediaItemId,
                });

                logger.info('Queue item processed successfully', {
                  userEmail,
                  queueItemId: item.id,
                  driveFileId: item.driveFileId,
                  fileName: item.fileName,
                });
              },
              {
                maxRetries: 3,
                onRetry: (error, attempt, delay) => {
                  logger.warn('Retrying queue item', {
                    userEmail,
                    queueItemId: item.id,
                    driveFileId: item.driveFileId,
                    fileName: item.fileName,
                    attempt,
                    delay,
                    error: error.message,
                  });

                  // If the error is a rate-limit (delay > 0) we'll pause other
                  // processing for this user for at least the delay window.
                  if (delay && delay > 0) {
                    backoffController.pauseUserBackoff(
                      userEmail,
                      delay,
                      `backoff retry for ${item.fileName}`
                    );
                  }

                  // Update operation status if tracking
                  operationStatusManager.retryOperation(
                    operationId,
                    `Retrying ${item.fileName}: ${error.message}`,
                    attempt,
                    3
                  );
                },
              }
            );

            successCount++;
          } catch (error) {
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
          }

          // Update operation progress after each item
          const completedSoFar = successCount + failureCount;
          operationStatusManager.updateProgress(
            operationId,
            Math.min(completedSoFar, pendingItems.length),
            pendingItems.length
          );
        }
      })();

      workers.push(worker);
    }

    await Promise.all(workers);

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
    activeProcessing.delete(userEmail);
  }
}
