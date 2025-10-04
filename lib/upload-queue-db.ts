import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { UploadQueueData, QueueItem, QueueItemStatus } from '@/types/upload-queue';
import { isFileUploaded } from './uploads-db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('upload-queue-db');

// Database file path
const QUEUE_DB_PATH = path.join(process.cwd(), 'data', 'upload_queue.json');

// Default database structure
const defaultData: UploadQueueData = {
  users: {},
};

let queueDb: Low<UploadQueueData> | null = null;

/**
 * Initialize and get the upload queue database instance
 * Singleton pattern to ensure only one instance
 */
export async function getQueueDb(): Promise<Low<UploadQueueData>> {
  if (queueDb) {
    return queueDb;
  }

  logger.info('Initializing upload queue database', { dbPath: QUEUE_DB_PATH });

  const adapter = new JSONFile<UploadQueueData>(QUEUE_DB_PATH);
  queueDb = new Low<UploadQueueData>(adapter, defaultData);

  // Read data from JSON file
  const startTime = Date.now();
  await queueDb.read();
  const readDuration = Date.now() - startTime;

  // If file doesn't exist or is empty, initialize with default data
  if (!queueDb.data) {
    logger.info('Upload queue database file empty or missing, initializing', {
      dbPath: QUEUE_DB_PATH,
    });
    queueDb.data = defaultData;
    const writeStartTime = Date.now();
    await queueDb.write();
    const writeDuration = Date.now() - writeStartTime;
    logger.info('Upload queue database initialized successfully', {
      dbPath: QUEUE_DB_PATH,
      writeDurationMs: writeDuration,
    });
  } else {
    logger.info('Upload queue database loaded successfully', {
      dbPath: QUEUE_DB_PATH,
      readDurationMs: readDuration,
      userCount: Object.keys(queueDb.data.users).length,
    });
  }

  return queueDb;
}

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

  const db = await getQueueDb();

  // Initialize user queue if doesn't exist
  if (!db.data.users[userEmail]) {
    logger.debug('Initializing upload queue for new user', { userEmail });
    db.data.users[userEmail] = { items: [] };
  }

  const queue = db.data.users[userEmail].items;
  const added: QueueItem[] = [];
  const skipped: Array<{ driveFileId: string; reason: string }> = [];

  for (const file of files) {
    // Check if already in queue
    const alreadyInQueue = queue.some(
      item => item.driveFileId === file.driveFileId && item.status !== 'failed'
    );

    if (alreadyInQueue) {
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

    queue.push(queueItem);
    added.push(queueItem);

    logger.debug('File added to queue', {
      userEmail,
      queueItemId: queueItem.id,
      driveFileId: file.driveFileId,
      fileName: file.fileName,
    });
  }

  // Persist to disk
  await db.write();

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
  const db = await getQueueDb();

  const items = db.data.users[userEmail]?.items || [];

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
  const items = await getQueue(userEmail);
  return items.filter(item => item.status === status);
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

  const db = await getQueueDb();

  if (!db.data.users[userEmail]?.items) {
    logger.warn('User queue not found', { userEmail, queueItemId });
    return;
  }

  const items = db.data.users[userEmail].items;
  const itemIndex = items.findIndex(item => item.id === queueItemId);

  if (itemIndex === -1) {
    logger.warn('Queue item not found', { userEmail, queueItemId });
    return;
  }

  // Update the item
  items[itemIndex] = {
    ...items[itemIndex],
    ...update,
  };

  await db.write();

  logger.debug('Queue item updated', {
    userEmail,
    queueItemId,
    newStatus: items[itemIndex].status,
  });
}

/**
 * Remove a queue item
 */
export async function removeFromQueue(
  userEmail: string,
  queueItemId: string
): Promise<void> {
  logger.info('Removing item from queue', { userEmail, queueItemId });

  const db = await getQueueDb();

  if (!db.data.users[userEmail]?.items) {
    logger.debug('User queue not found, nothing to remove', {
      userEmail,
      queueItemId,
    });
    return;
  }

  const items = db.data.users[userEmail].items;
  const initialLength = items.length;

  db.data.users[userEmail].items = items.filter(item => item.id !== queueItemId);

  if (db.data.users[userEmail].items.length < initialLength) {
    await db.write();
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

  const db = await getQueueDb();

  if (!db.data.users[userEmail]?.items) {
    logger.debug('User queue not found, nothing to clear', { userEmail });
    return 0;
  }

  const items = db.data.users[userEmail].items;
  const initialLength = items.length;

  db.data.users[userEmail].items = items.filter(
    item => item.status !== 'completed' && item.status !== 'failed'
  );

  const removedCount = initialLength - db.data.users[userEmail].items.length;

  if (removedCount > 0) {
    await db.write();
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
  const items = await getQueue(userEmail);

  const stats = {
    total: items.length,
    pending: items.filter(item => item.status === 'pending').length,
    uploading: items.filter(item => item.status === 'uploading').length,
    completed: items.filter(item => item.status === 'completed').length,
    failed: items.filter(item => item.status === 'failed').length,
  };

  logger.debug('Retrieved queue statistics', { userEmail, stats });

  return stats;
}
