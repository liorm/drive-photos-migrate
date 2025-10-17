import { getDatabase } from './sqlite-db';
import {
  AlbumQueueItem,
  AlbumQueueStatus,
  AlbumQueueMode,
  AlbumItem,
  AlbumItemStatus,
  FolderAlbumMapping,
  AlbumQueueStats,
} from '@/types/album-queue';
import { createLogger } from '@/lib/logger';

const logger = createLogger('album-queue-db');

/**
 * Add a folder to the album queue
 */
export async function addToAlbumQueue(
  userEmail: string,
  driveFolderId: string,
  folderName: string
): Promise<AlbumQueueItem> {
  logger.info('Adding folder to album queue', {
    userEmail,
    driveFolderId,
    folderName,
  });

  const db = getDatabase();

  // Check if already in queue (not completed/failed/cancelled)
  const existingItem = db
    .prepare(
      `SELECT id FROM album_queue
       WHERE user_email = ? AND drive_folder_id = ?
       AND status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED')`
    )
    .get(userEmail, driveFolderId) as { id: string } | undefined;

  if (existingItem) {
    logger.debug('Folder already in queue, skipping', {
      userEmail,
      driveFolderId,
    });
    throw new Error('Folder is already in the album queue');
  }

  // Create queue item
  const queueItem: AlbumQueueItem = {
    id: `album-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    userEmail,
    driveFolderId,
    folderName,
    status: 'PENDING',
    mode: null,
    totalFiles: null,
    uploadedFiles: 0,
    photosAlbumId: null,
    photosAlbumUrl: null,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };

  db.prepare(
    `INSERT INTO album_queue
     (id, user_email, drive_folder_id, folder_name, status, mode, total_files,
      uploaded_files, photos_album_id, photos_album_url, error, created_at,
      started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    queueItem.id,
    queueItem.userEmail,
    queueItem.driveFolderId,
    queueItem.folderName,
    queueItem.status,
    queueItem.mode,
    queueItem.totalFiles,
    queueItem.uploadedFiles,
    queueItem.photosAlbumId,
    queueItem.photosAlbumUrl,
    queueItem.error,
    queueItem.createdAt,
    queueItem.startedAt,
    queueItem.completedAt
  );

  logger.info('Folder added to album queue', {
    userEmail,
    albumQueueId: queueItem.id,
    driveFolderId,
  });

  return queueItem;
}

/**
 * Get all album queue items for a user
 */
export async function getAlbumQueue(
  userEmail: string
): Promise<AlbumQueueItem[]> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `SELECT id, user_email, drive_folder_id, folder_name, status, mode,
              total_files, uploaded_files, photos_album_id, photos_album_url,
              error, created_at, started_at, completed_at
       FROM album_queue
       WHERE user_email = ?
       ORDER BY created_at DESC`
    )
    .all(userEmail) as Array<{
    id: string;
    user_email: string;
    drive_folder_id: string;
    folder_name: string;
    status: AlbumQueueStatus;
    mode: AlbumQueueMode | null;
    total_files: number | null;
    uploaded_files: number;
    photos_album_id: string | null;
    photos_album_url: string | null;
    error: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  }>;

  const items: AlbumQueueItem[] = rows.map(row => ({
    id: row.id,
    userEmail: row.user_email,
    driveFolderId: row.drive_folder_id,
    folderName: row.folder_name,
    status: row.status,
    mode: row.mode,
    totalFiles: row.total_files,
    uploadedFiles: row.uploaded_files,
    photosAlbumId: row.photos_album_id,
    photosAlbumUrl: row.photos_album_url,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }));

  logger.debug('Retrieved album queue', {
    userEmail,
    itemCount: items.length,
  });

  return items;
}

/**
 * Get album queue items by status
 */
export async function getAlbumQueueByStatus(
  userEmail: string,
  status: AlbumQueueStatus
): Promise<AlbumQueueItem[]> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `SELECT id, user_email, drive_folder_id, folder_name, status, mode,
              total_files, uploaded_files, photos_album_id, photos_album_url,
              error, created_at, started_at, completed_at
       FROM album_queue
       WHERE user_email = ? AND status = ?
       ORDER BY created_at ASC`
    )
    .all(userEmail, status) as Array<{
    id: string;
    user_email: string;
    drive_folder_id: string;
    folder_name: string;
    status: AlbumQueueStatus;
    mode: AlbumQueueMode | null;
    total_files: number | null;
    uploaded_files: number;
    photos_album_id: string | null;
    photos_album_url: string | null;
    error: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  }>;

  const items: AlbumQueueItem[] = rows.map(row => ({
    id: row.id,
    userEmail: row.user_email,
    driveFolderId: row.drive_folder_id,
    folderName: row.folder_name,
    status: row.status,
    mode: row.mode,
    totalFiles: row.total_files,
    uploadedFiles: row.uploaded_files,
    photosAlbumId: row.photos_album_id,
    photosAlbumUrl: row.photos_album_url,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }));

  logger.debug('Retrieved album queue items by status', {
    userEmail,
    status,
    itemCount: items.length,
  });

  return items;
}

/**
 * Get a single album queue item by ID
 */
export async function getAlbumQueueItem(
  userEmail: string,
  albumQueueId: string
): Promise<AlbumQueueItem | null> {
  const db = getDatabase();

  const row = db
    .prepare(
      `SELECT id, user_email, drive_folder_id, folder_name, status, mode,
              total_files, uploaded_files, photos_album_id, photos_album_url,
              error, created_at, started_at, completed_at
       FROM album_queue
       WHERE user_email = ? AND id = ?`
    )
    .get(userEmail, albumQueueId) as
    | {
        id: string;
        user_email: string;
        drive_folder_id: string;
        folder_name: string;
        status: AlbumQueueStatus;
        mode: AlbumQueueMode | null;
        total_files: number | null;
        uploaded_files: number;
        photos_album_id: string | null;
        photos_album_url: string | null;
        error: string | null;
        created_at: string;
        started_at: string | null;
        completed_at: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userEmail: row.user_email,
    driveFolderId: row.drive_folder_id,
    folderName: row.folder_name,
    status: row.status,
    mode: row.mode,
    totalFiles: row.total_files,
    uploadedFiles: row.uploaded_files,
    photosAlbumId: row.photos_album_id,
    photosAlbumUrl: row.photos_album_url,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/**
 * Update album queue item
 */
export async function updateAlbumQueueItem(
  userEmail: string,
  albumQueueId: string,
  update: Partial<AlbumQueueItem>
): Promise<void> {
  logger.debug('Updating album queue item', {
    userEmail,
    albumQueueId,
    update,
  });

  const db = getDatabase();

  // Build dynamic update query
  const updateFields: string[] = [];
  const values: (string | number | null | undefined)[] = [];

  if (update.status !== undefined) {
    updateFields.push('status = ?');
    values.push(update.status);
  }
  if (update.mode !== undefined) {
    updateFields.push('mode = ?');
    values.push(update.mode);
  }
  if (update.totalFiles !== undefined) {
    updateFields.push('total_files = ?');
    values.push(update.totalFiles);
  }
  if (update.uploadedFiles !== undefined) {
    updateFields.push('uploaded_files = ?');
    values.push(update.uploadedFiles);
  }
  if (update.photosAlbumId !== undefined) {
    updateFields.push('photos_album_id = ?');
    values.push(update.photosAlbumId);
  }
  if (update.photosAlbumUrl !== undefined) {
    updateFields.push('photos_album_url = ?');
    values.push(update.photosAlbumUrl);
  }
  if (update.error !== undefined) {
    updateFields.push('error = ?');
    values.push(update.error);
  }
  if (update.startedAt !== undefined) {
    updateFields.push('started_at = ?');
    values.push(update.startedAt);
  }
  if (update.completedAt !== undefined) {
    updateFields.push('completed_at = ?');
    values.push(update.completedAt);
  }

  if (updateFields.length === 0) {
    logger.debug('No fields to update', { userEmail, albumQueueId });
    return;
  }

  values.push(albumQueueId);
  values.push(userEmail);

  const result = db
    .prepare(
      `UPDATE album_queue
       SET ${updateFields.join(', ')}
       WHERE id = ? AND user_email = ?`
    )
    .run(...values);

  if (result.changes > 0) {
    logger.debug('Album queue item updated', {
      userEmail,
      albumQueueId,
      newStatus: update.status,
    });
  } else {
    logger.warn('Album queue item not found', { userEmail, albumQueueId });
  }
}

/**
 * Remove an album from the queue
 */
export async function removeFromAlbumQueue(
  userEmail: string,
  albumQueueId: string
): Promise<void> {
  logger.info('Removing album from queue', { userEmail, albumQueueId });

  const db = getDatabase();

  const result = db
    .prepare('DELETE FROM album_queue WHERE id = ? AND user_email = ?')
    .run(albumQueueId, userEmail);

  if (result.changes > 0) {
    logger.info('Album queue item removed successfully', {
      userEmail,
      albumQueueId,
    });
  } else {
    logger.debug('Album queue item not found, nothing removed', {
      userEmail,
      albumQueueId,
    });
  }
}

/**
 * Clear completed, failed, and cancelled items from album queue
 */
export async function clearCompletedAlbumItems(
  userEmail: string
): Promise<number> {
  logger.info('Clearing completed/failed/cancelled items from album queue', {
    userEmail,
  });

  const db = getDatabase();

  const result = db
    .prepare(
      `DELETE FROM album_queue
       WHERE user_email = ? AND (status = 'COMPLETED' OR status = 'FAILED' OR status = 'CANCELLED')`
    )
    .run(userEmail);

  const removedCount = result.changes;

  if (removedCount > 0) {
    logger.info('Cleared completed/failed/cancelled album items', {
      userEmail,
      removedCount,
    });
  } else {
    logger.debug('No completed/failed/cancelled album items to clear', {
      userEmail,
    });
  }

  return removedCount;
}

/**
 * Get album queue statistics
 */
export async function getAlbumQueueStats(
  userEmail: string
): Promise<AlbumQueueStats> {
  const db = getDatabase();

  const result = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'UPLOADING' THEN 1 ELSE 0 END) as uploading,
         SUM(CASE WHEN status = 'CREATING' THEN 1 ELSE 0 END) as creating,
         SUM(CASE WHEN status = 'UPDATING' THEN 1 ELSE 0 END) as updating,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
       FROM album_queue
       WHERE user_email = ?`
    )
    .get(userEmail) as {
    total: number;
    pending: number;
    uploading: number;
    creating: number;
    updating: number;
    completed: number;
    failed: number;
    cancelled: number;
  };

  const stats: AlbumQueueStats = {
    total: result.total,
    pending: result.pending || 0,
    uploading: result.uploading || 0,
    creating: result.creating || 0,
    updating: result.updating || 0,
    completed: result.completed || 0,
    failed: result.failed || 0,
    cancelled: result.cancelled || 0,
  };

  logger.debug('Retrieved album queue statistics', { userEmail, stats });

  return stats;
}

// =====================
// Album Items functions
// =====================

/**
 * Add files to an album queue item
 */
export async function addAlbumItems(
  albumQueueId: string,
  driveFileIds: string[]
): Promise<void> {
  logger.info('Adding album items', {
    albumQueueId,
    fileCount: driveFileIds.length,
  });

  const db = getDatabase();

  const stmt = db.prepare(
    `INSERT INTO album_items
     (id, album_queue_id, drive_file_id, photos_media_item_id, status, added_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const driveFileId of driveFileIds) {
    const itemId = `item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    stmt.run(
      itemId,
      albumQueueId,
      driveFileId,
      null,
      'PENDING',
      new Date().toISOString()
    );
  }

  logger.info('Album items added', {
    albumQueueId,
    fileCount: driveFileIds.length,
  });
}

/**
 * Get all album items for a queue item
 */
export async function getAlbumItems(
  albumQueueId: string
): Promise<AlbumItem[]> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `SELECT id, album_queue_id, drive_file_id, photos_media_item_id, status, added_at
       FROM album_items
       WHERE album_queue_id = ?
       ORDER BY added_at ASC`
    )
    .all(albumQueueId) as Array<{
    id: string;
    album_queue_id: string;
    drive_file_id: string;
    photos_media_item_id: string | null;
    status: AlbumItemStatus;
    added_at: string;
  }>;

  const items: AlbumItem[] = rows.map(row => ({
    id: row.id,
    albumQueueId: row.album_queue_id,
    driveFileId: row.drive_file_id,
    photosMediaItemId: row.photos_media_item_id,
    status: row.status,
    addedAt: row.added_at,
  }));

  return items;
}

/**
 * Update an album item
 */
export async function updateAlbumItem(
  itemId: string,
  update: Partial<AlbumItem>
): Promise<void> {
  const db = getDatabase();

  const updateFields: string[] = [];
  const values: (string | null | undefined)[] = [];

  if (update.photosMediaItemId !== undefined) {
    updateFields.push('photos_media_item_id = ?');
    values.push(update.photosMediaItemId);
  }
  if (update.status !== undefined) {
    updateFields.push('status = ?');
    values.push(update.status);
  }

  if (updateFields.length === 0) {
    return;
  }

  values.push(itemId);

  db.prepare(
    `UPDATE album_items
     SET ${updateFields.join(', ')}
     WHERE id = ?`
  ).run(...values);
}

/**
 * Get album items by status
 */
export async function getAlbumItemsByStatus(
  albumQueueId: string,
  status: AlbumItemStatus
): Promise<AlbumItem[]> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `SELECT id, album_queue_id, drive_file_id, photos_media_item_id, status, added_at
       FROM album_items
       WHERE album_queue_id = ? AND status = ?
       ORDER BY added_at ASC`
    )
    .all(albumQueueId, status) as Array<{
    id: string;
    album_queue_id: string;
    drive_file_id: string;
    photos_media_item_id: string | null;
    status: AlbumItemStatus;
    added_at: string;
  }>;

  const items: AlbumItem[] = rows.map(row => ({
    id: row.id,
    albumQueueId: row.album_queue_id,
    driveFileId: row.drive_file_id,
    photosMediaItemId: row.photos_media_item_id,
    status: row.status,
    addedAt: row.added_at,
  }));

  return items;
}

// ==========================
// Folder Albums Mapping functions
// ==========================

/**
 * Create or update a folder-album mapping
 */
export async function upsertFolderAlbumMapping(
  mapping: Omit<FolderAlbumMapping, 'id' | 'createdAt'>
): Promise<FolderAlbumMapping> {
  logger.info('Upserting folder-album mapping', {
    userEmail: mapping.userEmail,
    driveFolderId: mapping.driveFolderId,
    photosAlbumId: mapping.photosAlbumId,
  });

  const db = getDatabase();

  // Check if mapping exists
  const existing = db
    .prepare(
      `SELECT id, created_at FROM folder_albums
       WHERE user_email = ? AND drive_folder_id = ?`
    )
    .get(mapping.userEmail, mapping.driveFolderId) as
    | { id: string; created_at: string }
    | undefined;

  if (existing) {
    // Update existing mapping
    db.prepare(
      `UPDATE folder_albums
       SET folder_name = ?, photos_album_id = ?, photos_album_url = ?,
           last_updated_at = ?, total_items_in_album = ?,
           discovered_via_api = ?, album_deleted = ?
       WHERE id = ?`
    ).run(
      mapping.folderName,
      mapping.photosAlbumId,
      mapping.photosAlbumUrl,
      mapping.lastUpdatedAt,
      mapping.totalItemsInAlbum,
      mapping.discoveredViaApi ? 1 : 0,
      mapping.albumDeleted ? 1 : 0,
      existing.id
    );

    logger.info('Folder-album mapping updated', {
      userEmail: mapping.userEmail,
      driveFolderId: mapping.driveFolderId,
    });

    return {
      ...mapping,
      id: existing.id,
      createdAt: existing.created_at,
    };
  } else {
    // Insert new mapping
    const id = `mapping-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO folder_albums
       (id, user_email, drive_folder_id, folder_name, photos_album_id,
        photos_album_url, created_at, last_updated_at, total_items_in_album,
        discovered_via_api, album_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      mapping.userEmail,
      mapping.driveFolderId,
      mapping.folderName,
      mapping.photosAlbumId,
      mapping.photosAlbumUrl,
      createdAt,
      mapping.lastUpdatedAt,
      mapping.totalItemsInAlbum,
      mapping.discoveredViaApi ? 1 : 0,
      mapping.albumDeleted ? 1 : 0
    );

    logger.info('Folder-album mapping created', {
      userEmail: mapping.userEmail,
      driveFolderId: mapping.driveFolderId,
    });

    return {
      ...mapping,
      id,
      createdAt,
    };
  }
}

/**
 * Get folder-album mapping by folder ID
 */
export async function getFolderAlbumMapping(
  userEmail: string,
  driveFolderId: string
): Promise<FolderAlbumMapping | null> {
  const db = getDatabase();

  const row = db
    .prepare(
      `SELECT id, user_email, drive_folder_id, folder_name, photos_album_id,
              photos_album_url, created_at, last_updated_at, total_items_in_album,
              discovered_via_api, album_deleted
       FROM folder_albums
       WHERE user_email = ? AND drive_folder_id = ?`
    )
    .get(userEmail, driveFolderId) as
    | {
        id: string;
        user_email: string;
        drive_folder_id: string;
        folder_name: string;
        photos_album_id: string;
        photos_album_url: string;
        created_at: string;
        last_updated_at: string | null;
        total_items_in_album: number;
        discovered_via_api: number;
        album_deleted: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userEmail: row.user_email,
    driveFolderId: row.drive_folder_id,
    folderName: row.folder_name,
    photosAlbumId: row.photos_album_id,
    photosAlbumUrl: row.photos_album_url,
    createdAt: row.created_at,
    lastUpdatedAt: row.last_updated_at,
    totalItemsInAlbum: row.total_items_in_album,
    discoveredViaApi: row.discovered_via_api === 1,
    albumDeleted: row.album_deleted === 1,
  };
}

/**
 * Get multiple folder-album mappings by folder IDs
 */
export async function getBatchFolderAlbumMappings(
  userEmail: string,
  driveFolderIds: string[]
): Promise<Map<string, FolderAlbumMapping>> {
  if (driveFolderIds.length === 0) {
    return new Map();
  }

  const db = getDatabase();

  const placeholders = driveFolderIds.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT id, user_email, drive_folder_id, folder_name, photos_album_id,
              photos_album_url, created_at, last_updated_at, total_items_in_album,
              discovered_via_api, album_deleted
       FROM folder_albums
       WHERE user_email = ? AND drive_folder_id IN (${placeholders})`
    )
    .all(userEmail, ...driveFolderIds) as Array<{
    id: string;
    user_email: string;
    drive_folder_id: string;
    folder_name: string;
    photos_album_id: string;
    photos_album_url: string;
    created_at: string;
    last_updated_at: string | null;
    total_items_in_album: number;
    discovered_via_api: number;
    album_deleted: number;
  }>;

  const mappings = new Map<string, FolderAlbumMapping>();

  for (const row of rows) {
    mappings.set(row.drive_folder_id, {
      id: row.id,
      userEmail: row.user_email,
      driveFolderId: row.drive_folder_id,
      folderName: row.folder_name,
      photosAlbumId: row.photos_album_id,
      photosAlbumUrl: row.photos_album_url,
      createdAt: row.created_at,
      lastUpdatedAt: row.last_updated_at,
      totalItemsInAlbum: row.total_items_in_album,
      discoveredViaApi: row.discovered_via_api === 1,
      albumDeleted: row.album_deleted === 1,
    });
  }

  logger.debug('Retrieved batch folder-album mappings', {
    userEmail,
    requestedCount: driveFolderIds.length,
    foundCount: mappings.size,
  });

  return mappings;
}

/**
 * Mark an album as deleted
 */
export async function markAlbumAsDeleted(
  userEmail: string,
  driveFolderId: string
): Promise<void> {
  logger.info('Marking album as deleted', { userEmail, driveFolderId });

  const db = getDatabase();

  db.prepare(
    `UPDATE folder_albums
     SET album_deleted = 1
     WHERE user_email = ? AND drive_folder_id = ?`
  ).run(userEmail, driveFolderId);

  logger.info('Album marked as deleted', { userEmail, driveFolderId });
}
