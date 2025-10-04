import {
  getQueueByStatus,
  updateQueueItem,
  removeFromQueue,
} from './upload-queue-db';
import { downloadDriveFile, uploadFileToPhotos } from './google-photos';
import { recordUpload } from './uploads-db';
import { clearFileSyncStatusCache } from './sync-status';
import { createLogger } from './logger';
import operationStatusManager, {
  OperationType,
  OperationStatus,
} from './operation-status';

const logger = createLogger('queue-processor');

// Track active processing per user to prevent concurrent processing
const activeProcessing = new Map<string, boolean>();

/**
 * Process the upload queue for a user
 * Uploads items one at a time
 */
export async function processQueue(
  userEmail: string,
  accessToken: string
): Promise<void> {
  // Check if already processing for this user
  if (activeProcessing.get(userEmail)) {
    logger.info('Queue already being processed for user, skipping', {
      userEmail,
    });
    return;
  }

  // Mark as processing
  activeProcessing.set(userEmail, true);

  try {
    logger.info('Starting queue processing', { userEmail });

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

    // Process items one at a time
    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];

      logger.info('Processing queue item', {
        userEmail,
        queueItemId: item.id,
        driveFileId: item.driveFileId,
        fileName: item.fileName,
        progress: `${i + 1}/${pendingItems.length}`,
      });

      // Update operation progress
      operationStatusManager.updateProgress(operationId, i, pendingItems.length);

      try {
        // Update item status to uploading
        await updateQueueItem(userEmail, item.id, {
          status: 'uploading',
          startedAt: new Date().toISOString(),
        });

        // Download file from Drive
        logger.debug('Downloading file from Drive', {
          userEmail,
          driveFileId: item.driveFileId,
          fileName: item.fileName,
        });

        const buffer = await downloadDriveFile(accessToken, item.driveFileId);

        logger.debug('File downloaded successfully', {
          userEmail,
          driveFileId: item.driveFileId,
          size: buffer.length,
        });

        // Upload to Photos
        logger.debug('Uploading file to Photos', {
          userEmail,
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

        successCount++;

        logger.info('Queue item processed successfully', {
          userEmail,
          queueItemId: item.id,
          driveFileId: item.driveFileId,
          fileName: item.fileName,
        });
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
    }

    // Update final operation progress
    operationStatusManager.updateProgress(
      operationId,
      pendingItems.length,
      pendingItems.length
    );

    // Complete the operation
    operationStatusManager.completeOperation(operationId, {
      successCount,
      failureCount,
    });

    logger.info('Queue processing completed', {
      userEmail,
      totalItems: pendingItems.length,
      successCount,
      failureCount,
    });
  } catch (error) {
    logger.error('Error processing queue', error, { userEmail });
    throw error;
  } finally {
    // Mark as not processing
    activeProcessing.delete(userEmail);
  }
}
