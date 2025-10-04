import { getDatabase } from './sqlite-db';
import { QueueItem, QueueItemStatus } from '@/types/upload-queue';
import { isFileUploaded } from './uploads-db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('upload-queue-db');

/**
 * Add files to the upload queue
 * Validates against duplicates and already-synced files
 */
export async function addToQueue(
  userEmail: string,
  files: Array<{
    driveFileId: string;
    fileName: string;
    mimeType: string;
    fileSize?: number;
  }>
): Promise<{
  added: QueueItem[];
  skipped: Array<{ driveFileId: string; reason: string }>;
}> {
  logger.info('Adding files to upload queue', {
    userEmail,
    fileCount: files.length,
  });

  const db = getDatabase();
  const added: QueueItem[] = [];
  const skipped: Array<{ driveFileId: string; reason: string }> = [];

  for (const file of files) {
    // Check if already in queue (not failed)
    const existingItem = db
      .prepare(
        `SELECT id FROM queue_items
         WHERE user_email = ? AND drive_file_id = ? AND status != 'failed'`
      )
      .get(userEmail, file.driveFileId);

    if (existingItem) {
      logger.debug('File already in queue, skipping', {
        userEmail,
        driveFileId: file.driveFileId,
      });
      skipped.push({
        driveFileId: file.driveFileId,
        reason: 'Already in queue',
      });
      continue;
    }

    // Check if already synced/uploaded
    const isAlreadyUploaded = await isFileUploaded(userEmail, file.driveFileId);

    if (isAlreadyUploaded) {
      logger.debug('File already synced, skipping', {
        userEmail,
        driveFileId: file.driveFileId,
      });
      skipped.push({
        driveFileId: file.driveFileId,
        reason: 'Already synced',
      });
      continue;
    }

    // Add to queue
    const queueItem: QueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      driveFileId: file.driveFileId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      status: 'pending',
      addedAt: new Date().toISOString(),
    };

    db.prepare(
      `INSERT INTO queue_items
       (id, user_email, drive_file_id, file_name, mime_type, file_size, status, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      queueItem.id,
      userEmail,
      queueItem.driveFileId,
      queueItem.fileName,
      queueItem.mimeType,
      queueItem.fileSize || null,
      queueItem.status,
      queueItem.addedAt
    );

    added.push(queueItem);

    logger.debug('File added to queue', {
      userEmail,
      queueItemId: queueItem.id,
      driveFileId: file.driveFileId,
      fileName: file.fileName,
    });
  }

  logger.info('Files added to upload queue', {
    userEmail,
    addedCount: added.length,
    skippedCount: skipped.length,
  });

  return { added, skipped };
}

/**
 * Get all queue items for a user
 */
export async function getQueue(userEmail: string): Promise<QueueItem[]> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `SELECT id, drive_file_id, file_name, mime_type, file_size, status,
              added_at, started_at, completed_at, error, photos_media_item_id
       FROM queue_items
       WHERE user_email = ?
       ORDER BY added_at ASC`
    )
    .all(userEmail) as Array<{
    id: string;
    drive_file_id: string;
    file_name: string;
    mime_type: string;
    file_size: number | null;
    status: QueueItemStatus;
    added_at: string;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    photos_media_item_id: string | null;
  }>;

  const items: QueueItem[] = rows.map(row => ({
    id: row.id,
    driveFileId: row.drive_file_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size || undefined,
    status: row.status,
    addedAt: row.added_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    error: row.error || undefined,
    photosMediaItemId: row.photos_media_item_id || undefined,
  }));

  logger.debug('Retrieved upload queue', {
    userEmail,
    itemCount: items.length,
  });

  return items;
}

/**
 * Get queue items by status
 */
export async function getQueueByStatus(
  userEmail: string,
  status: QueueItemStatus
): Promise<QueueItem[]> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `SELECT id, drive_file_id, file_name, mime_type, file_size, status,
              added_at, started_at, completed_at, error, photos_media_item_id
       FROM queue_items
       WHERE user_email = ? AND status = ?
       ORDER BY added_at ASC`
    )
    .all(userEmail, status) as Array<{
    id: string;
    drive_file_id: string;
    file_name: string;
    mime_type: string;
    file_size: number | null;
    status: QueueItemStatus;
    added_at: string;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    photos_media_item_id: string | null;
  }>;

  const items: QueueItem[] = rows.map(row => ({
    id: row.id,
    driveFileId: row.drive_file_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size || undefined,
    status: row.status,
    addedAt: row.added_at,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    error: row.error || undefined,
    photosMediaItemId: row.photos_media_item_id || undefined,
  }));

  logger.debug('Retrieved queue items by status', {
    userEmail,
    status,
    itemCount: items.length,
  });

  return items;
}

/**
 * Update queue item status
 */
export async function updateQueueItem(
  userEmail: string,
  queueItemId: string,
  update: Partial<QueueItem>
): Promise<void> {
  logger.debug('Updating queue item', {
    userEmail,
    queueItemId,
    update,
  });

  const db = getDatabase();

  // Build dynamic update query
  const updateFields: string[] = [];
  const values: (string | undefined)[] = [];

  if (update.status !== undefined) {
    updateFields.push('status = ?');
    values.push(update.status);
  }
  if (update.startedAt !== undefined) {
    updateFields.push('started_at = ?');
    values.push(update.startedAt);
  }
  if (update.completedAt !== undefined) {
    updateFields.push('completed_at = ?');
    values.push(update.completedAt);
  }
  if (update.error !== undefined) {
    updateFields.push('error = ?');
    values.push(update.error);
  }
  if (update.photosMediaItemId !== undefined) {
    updateFields.push('photos_media_item_id = ?');
    values.push(update.photosMediaItemId);
  }

  if (updateFields.length === 0) {
    logger.debug('No fields to update', { userEmail, queueItemId });
    return;
  }

  values.push(queueItemId);
  values.push(userEmail);

  const result = db
    .prepare(
      `UPDATE queue_items
       SET ${updateFields.join(', ')}
       WHERE id = ? AND user_email = ?`
    )
    .run(...values);

  if (result.changes > 0) {
    logger.debug('Queue item updated', {
      userEmail,
      queueItemId,
      newStatus: update.status,
    });
  } else {
    logger.warn('Queue item not found', { userEmail, queueItemId });
  }
}

/**
 * Remove a queue item
 */
export async function removeFromQueue(
  userEmail: string,
  queueItemId: string
): Promise<void> {
  logger.info('Removing item from queue', { userEmail, queueItemId });

  const db = getDatabase();

  const result = db
    .prepare('DELETE FROM queue_items WHERE id = ? AND user_email = ?')
    .run(queueItemId, userEmail);

  if (result.changes > 0) {
    logger.info('Queue item removed successfully', { userEmail, queueItemId });
  } else {
    logger.debug('Queue item not found, nothing removed', {
      userEmail,
      queueItemId,
    });
  }
}

/**
 * Clear completed and failed items from queue
 */
export async function clearCompletedItems(userEmail: string): Promise<number> {
  logger.info('Clearing completed/failed items from queue', { userEmail });

  const db = getDatabase();

  const result = db
    .prepare(
      `DELETE FROM queue_items
       WHERE user_email = ? AND (status = 'completed' OR status = 'failed')`
    )
    .run(userEmail);

  const removedCount = result.changes;

  if (removedCount > 0) {
    logger.info('Cleared completed/failed items', { userEmail, removedCount });
  } else {
    logger.debug('No completed/failed items to clear', { userEmail });
  }

  return removedCount;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(userEmail: string): Promise<{
  total: number;
  pending: number;
  uploading: number;
  completed: number;
  failed: number;
}> {
  const db = getDatabase();

  const result = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'uploading' THEN 1 ELSE 0 END) as uploading,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM queue_items
       WHERE user_email = ?`
    )
    .get(userEmail) as {
    total: number;
    pending: number;
    uploading: number;
    completed: number;
    failed: number;
  };

  const stats = {
    total: result.total,
    pending: result.pending || 0,
    uploading: result.uploading || 0,
    completed: result.completed || 0,
    failed: result.failed || 0,
  };

  logger.debug('Retrieved queue statistics', { userEmail, stats });

  return stats;
}
