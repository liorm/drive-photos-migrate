import { getDatabase } from './sqlite-db';
import { DriveFile, DriveFolder } from '@/types/google-drive';
import { SyncStatusDetail } from '@/types/sync-status';
import { createLogger } from '@/lib/logger';

const logger = createLogger('db');

/**
 * Page size used to retrieve all items without pagination.
 * This is used when we need to process entire folder contents at once
 * (e.g., calculating sync status for all files in a folder tree).
 */
export const UNPAGINATED_PAGE_SIZE = 999999;

/**
 * Check if a folder is cached for a user
 */
export function isFolderCached(userEmail: string, folderId: string): boolean {
  const db = getDatabase();

  const result = db
    .prepare(
      'SELECT id FROM cached_folders WHERE user_email = ? AND folder_id = ?'
    )
    .get(userEmail, folderId);

  const isCached = !!result;

  logger.debug('Checked if folder is cached', {
    userEmail,
    folderId,
    isCached,
  });

  return isCached;
}

/**
 * Get cached folder files and subfolders (paginated)
 */
export function getCachedFolder(
  userEmail: string,
  folderId: string,
  page: number = 0,
  pageSize: number = 50
): {
  files: DriveFile[];
  folders: DriveFolder[];
  totalCount: number;
  lastSynced: string;
} | null {
  const db = getDatabase();

  // Get cached folder metadata
  const cachedFolder = db
    .prepare(
      'SELECT id, last_synced, total_count FROM cached_folders WHERE user_email = ? AND folder_id = ?'
    )
    .get(userEmail, folderId) as
    | { id: number; last_synced: string; total_count: number }
    | undefined;

  if (!cachedFolder) {
    logger.debug('Folder not found in cache', { userEmail, folderId });
    return null;
  }

  // Get subfolders (all, not paginated)
  const subfolderRows = db
    .prepare(
      `SELECT folder_id, name, mime_type, created_time, modified_time, parents
       FROM cached_subfolders
       WHERE cached_folder_id = ?`
    )
    .all(cachedFolder.id) as Array<{
    folder_id: string;
    name: string;
    mime_type: string;
    created_time: string;
    modified_time: string;
    parents: string | null;
  }>;

  const folders: DriveFolder[] = subfolderRows.map(row => ({
    id: row.folder_id,
    name: row.name,
    mimeType: row.mime_type as 'application/vnd.google-apps.folder',
    createdTime: row.created_time,
    modifiedTime: row.modified_time,
    parents: row.parents ? JSON.parse(row.parents) : undefined,
  }));

  // Get files (paginated)
  const offset = page * pageSize;
  const fileRows = db
    .prepare(
      `SELECT file_id, name, mime_type, size, thumbnail_link, web_content_link,
              icon_link, created_time, modified_time, parents
       FROM cached_files
       WHERE cached_folder_id = ?
       LIMIT ? OFFSET ?`
    )
    .all(cachedFolder.id, pageSize, offset) as Array<{
    file_id: string;
    name: string;
    mime_type: string;
    size: string | null;
    thumbnail_link: string | null;
    web_content_link: string | null;
    icon_link: string | null;
    created_time: string;
    modified_time: string;
    parents: string | null;
  }>;

  const files: DriveFile[] = fileRows.map(row => ({
    id: row.file_id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size ?? undefined,
    thumbnailLink: row.thumbnail_link ?? undefined,
    webContentLink: row.web_content_link ?? undefined,
    iconLink: row.icon_link ?? undefined,
    createdTime: row.created_time,
    modifiedTime: row.modified_time,
    parents: row.parents ? JSON.parse(row.parents) : undefined,
  }));

  logger.debug('Retrieved cached folder', {
    userEmail,
    folderId,
    page,
    filesInPage: files.length,
    foldersCount: folders.length,
  });

  return {
    files,
    folders: page === 0 ? folders : [], // Only return folders on first page
    totalCount: cachedFolder.total_count,
    lastSynced: cachedFolder.last_synced,
  };
}

/**
 * Cache a folder's contents
 */
export function cacheFolderContents(
  userEmail: string,
  folderId: string,
  files: DriveFile[],
  folders: DriveFolder[]
): void {
  const db = getDatabase();

  logger.info('Caching folder contents', {
    userEmail,
    folderId,
    fileCount: files.length,
    folderCount: folders.length,
  });

  const transaction = db.transaction(() => {
    // Delete existing cache for this folder
    const existingFolder = db
      .prepare(
        'SELECT id FROM cached_folders WHERE user_email = ? AND folder_id = ?'
      )
      .get(userEmail, folderId) as { id: number } | undefined;

    if (existingFolder) {
      db.prepare('DELETE FROM cached_files WHERE cached_folder_id = ?').run(
        existingFolder.id
      );
      db.prepare(
        'DELETE FROM cached_subfolders WHERE cached_folder_id = ?'
      ).run(existingFolder.id);
      db.prepare('DELETE FROM cached_folders WHERE id = ?').run(
        existingFolder.id
      );
    }

    // Insert folder metadata
    const result = db
      .prepare(
        `INSERT INTO cached_folders (user_email, folder_id, last_synced, total_count)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        userEmail,
        folderId,
        new Date().toISOString(),
        files.length + folders.length
      );

    const cachedFolderId = result.lastInsertRowid;

    // Insert files
    const insertFile = db.prepare(
      `INSERT INTO cached_files
       (cached_folder_id, file_id, name, mime_type, size, thumbnail_link,
        web_content_link, icon_link, created_time, modified_time, parents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const file of files) {
      insertFile.run(
        cachedFolderId,
        file.id,
        file.name,
        file.mimeType,
        file.size ?? null,
        file.thumbnailLink ?? null,
        file.webContentLink ?? null,
        file.iconLink ?? null,
        file.createdTime,
        file.modifiedTime,
        file.parents ? JSON.stringify(file.parents) : null
      );
    }

    // Insert subfolders
    const insertSubfolder = db.prepare(
      `INSERT INTO cached_subfolders
       (cached_folder_id, folder_id, name, mime_type, created_time, modified_time, parents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const folder of folders) {
      insertSubfolder.run(
        cachedFolderId,
        folder.id,
        folder.name,
        folder.mimeType,
        folder.createdTime,
        folder.modifiedTime,
        folder.parents ? JSON.stringify(folder.parents) : null
      );
    }
  });

  transaction();

  logger.info('Folder contents cached successfully', {
    userEmail,
    folderId,
    totalItems: files.length + folders.length,
  });
}

/**
 * Clear a folder from cache
 */
export function clearFolderFromCache(
  userEmail: string,
  folderId: string
): void {
  const db = getDatabase();

  logger.info('Clearing folder cache', { userEmail, folderId });

  const existingFolder = db
    .prepare(
      'SELECT id FROM cached_folders WHERE user_email = ? AND folder_id = ?'
    )
    .get(userEmail, folderId) as { id: number } | undefined;

  if (existingFolder) {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM cached_files WHERE cached_folder_id = ?').run(
        existingFolder.id
      );
      db.prepare(
        'DELETE FROM cached_subfolders WHERE cached_folder_id = ?'
      ).run(existingFolder.id);
      db.prepare('DELETE FROM cached_folders WHERE id = ?').run(
        existingFolder.id
      );
    });

    transaction();

    logger.info('Folder cache cleared successfully', { userEmail, folderId });
  } else {
    logger.debug('Folder cache not found, nothing to clear', {
      userEmail,
      folderId,
    });
  }
}

/**
 * Get total count of items in cached folder
 */
export function getCachedFolderCount(
  userEmail: string,
  folderId: string
): number {
  const db = getDatabase();

  const result = db
    .prepare(
      'SELECT total_count FROM cached_folders WHERE user_email = ? AND folder_id = ?'
    )
    .get(userEmail, folderId) as { total_count: number } | undefined;

  return result?.total_count || 0;
}

/**
 * Get all file IDs from a cached folder (no pagination)
 */
export function getAllCachedFileIds(
  userEmail: string,
  folderId: string
): string[] {
  const db = getDatabase();

  // Get cached folder metadata
  const cachedFolder = db
    .prepare(
      'SELECT id FROM cached_folders WHERE user_email = ? AND folder_id = ?'
    )
    .get(userEmail, folderId) as { id: number } | undefined;

  if (!cachedFolder) {
    logger.debug('Folder not found in cache', { userEmail, folderId });
    return [];
  }

  // Get all file IDs
  const fileRows = db
    .prepare('SELECT file_id FROM cached_files WHERE cached_folder_id = ?')
    .all(cachedFolder.id) as Array<{ file_id: string }>;

  const fileIds = fileRows.map(row => row.file_id);

  logger.debug('Retrieved all cached file IDs', {
    userEmail,
    folderId,
    fileCount: fileIds.length,
  });

  return fileIds;
}

/**
 * Get file metadata from Drive cache by file ID
 */
export function getFileMetadataFromDriveCache(
  userEmail: string,
  fileId: string
): {
  fileName: string;
  mimeType: string;
  fileSize?: number;
} | null {
  const db = getDatabase();

  // Find the file in cached_files across all folders for this user
  const fileRow = db
    .prepare(
      `SELECT cf.name, cf.mime_type, cf.size
       FROM cached_files cf
       JOIN cached_folders cfolder ON cf.cached_folder_id = cfolder.id
       WHERE cfolder.user_email = ? AND cf.file_id = ?
       LIMIT 1`
    )
    .get(userEmail, fileId) as
    | {
        name: string;
        mime_type: string;
        size: string | null;
      }
    | undefined;

  if (!fileRow) {
    logger.debug('File metadata not found in Drive cache', {
      userEmail,
      fileId,
    });
    return null;
  }

  logger.debug('Retrieved file metadata from Drive cache', {
    userEmail,
    fileId,
    fileName: fileRow.name,
  });

  return {
    fileName: fileRow.name,
    mimeType: fileRow.mime_type,
    fileSize: fileRow.size ? parseInt(fileRow.size) : undefined,
  };
}

/**
 * Get file details from Drive cache by file ID including parent information
 */
export function getFileDetailsFromCache(
  userEmail: string,
  fileId: string
): {
  fileName: string;
  mimeType: string;
  fileSize?: number;
  parents?: string[];
} | null {
  const db = getDatabase();

  // Find the file in cached_files across all folders for this user
  const fileRow = db
    .prepare(
      `SELECT cf.name, cf.mime_type, cf.size, cf.parents
       FROM cached_files cf
       JOIN cached_folders cfolder ON cf.cached_folder_id = cfolder.id
       WHERE cfolder.user_email = ? AND cf.file_id = ?
       LIMIT 1`
    )
    .get(userEmail, fileId) as
    | {
        name: string;
        mime_type: string;
        size: string | null;
        parents: string | null;
      }
    | undefined;

  if (!fileRow) {
    logger.debug('File details not found in Drive cache', {
      userEmail,
      fileId,
    });
    return null;
  }

  logger.debug('Retrieved file details from Drive cache', {
    userEmail,
    fileId,
    fileName: fileRow.name,
  });

  return {
    fileName: fileRow.name,
    mimeType: fileRow.mime_type,
    fileSize: fileRow.size ? parseInt(fileRow.size) : undefined,
    parents: fileRow.parents ? JSON.parse(fileRow.parents) : undefined,
  };
}

/**
 * Get folder metadata from Drive cache by folder ID
 */
export function getFolderDetailsFromCache(
  userEmail: string,
  folderId: string
): { name: string; parents: string[] } | null {
  const db = getDatabase();

  const subfolderRow = db
    .prepare(
      `SELECT cs.name, cs.parents
       FROM cached_subfolders cs
       JOIN cached_folders cfolder ON cs.cached_folder_id = cfolder.id
       WHERE cfolder.user_email = ? AND cs.folder_id = ?
       LIMIT 1`
    )
    .get(userEmail, folderId) as { name: string; parents: string | null } as
    | {
        name: string;
        parents: string | null;
      }
    | undefined;

  if (subfolderRow?.parents) {
    logger.debug('Retrieved folder info from Drive cache', {
      userEmail,
      folderId,
      folderName: subfolderRow.name,
    });
    return {
      name: subfolderRow.name,
      parents: JSON.parse(subfolderRow.parents),
    };
  }

  return null;
}

// ============================================================================
// Sync Status Cache Operations
// ============================================================================

/**
 * Get cached sync status for a file
 */
export function getCachedFileSyncStatus(
  userEmail: string,
  fileId: string
): SyncStatusDetail | null {
  const db = getDatabase();

  const result = db
    .prepare(
      `SELECT status, synced_count, total_count, percentage, last_checked
       FROM sync_status_cache
       WHERE user_email = ? AND item_id = ? AND item_type = 'file'`
    )
    .get(userEmail, fileId) as
    | {
        status: 'synced' | 'partial' | 'unsynced';
        synced_count: number;
        total_count: number;
        percentage: number;
        last_checked: string;
      }
    | undefined;

  if (!result) {
    logger.debug('Cached file sync status not found', { userEmail, fileId });
    return null;
  }

  logger.debug('Retrieved cached file sync status', { userEmail, fileId });

  return {
    status: result.status,
    syncedCount: result.synced_count,
    totalCount: result.total_count,
    percentage: result.percentage,
    lastChecked: result.last_checked,
  };
}

/**
 * Get cached sync status for a folder
 */
export function getCachedFolderSyncStatus(
  userEmail: string,
  folderId: string
): SyncStatusDetail | null {
  const db = getDatabase();

  const result = db
    .prepare(
      `SELECT status, synced_count, total_count, percentage, last_checked
       FROM sync_status_cache
       WHERE user_email = ? AND item_id = ? AND item_type = 'folder'`
    )
    .get(userEmail, folderId) as
    | {
        status: 'synced' | 'partial' | 'unsynced';
        synced_count: number;
        total_count: number;
        percentage: number;
        last_checked: string;
      }
    | undefined;

  if (!result) {
    logger.debug('Cached folder sync status not found', {
      userEmail,
      folderId,
    });
    return null;
  }

  logger.debug('Retrieved cached folder sync status', { userEmail, folderId });

  return {
    status: result.status,
    syncedCount: result.synced_count,
    totalCount: result.total_count,
    percentage: result.percentage,
    lastChecked: result.last_checked,
  };
}

/**
 * Cache file sync status
 */
export function cacheFileSyncStatus(
  userEmail: string,
  fileId: string,
  status: SyncStatusDetail
): void {
  const db = getDatabase();

  db.prepare(
    `INSERT INTO sync_status_cache
     (user_email, item_id, item_type, status, synced_count, total_count, percentage, last_checked)
     VALUES (?, ?, 'file', ?, ?, ?, ?, ?)
     ON CONFLICT(user_email, item_id, item_type)
     DO UPDATE SET
       status = excluded.status,
       synced_count = excluded.synced_count,
       total_count = excluded.total_count,
       percentage = excluded.percentage,
       last_checked = excluded.last_checked`
  ).run(
    userEmail,
    fileId,
    status.status,
    status.syncedCount,
    status.totalCount,
    status.percentage,
    status.lastChecked
  );

  logger.debug('File sync status cached', { userEmail, fileId });
}

/**
 * Cache folder sync status
 */
export function cacheFolderSyncStatus(
  userEmail: string,
  folderId: string,
  status: SyncStatusDetail
): void {
  const db = getDatabase();

  db.prepare(
    `INSERT INTO sync_status_cache
     (user_email, item_id, item_type, status, synced_count, total_count, percentage, last_checked)
     VALUES (?, ?, 'folder', ?, ?, ?, ?, ?)
     ON CONFLICT(user_email, item_id, item_type)
     DO UPDATE SET
       status = excluded.status,
       synced_count = excluded.synced_count,
       total_count = excluded.total_count,
       percentage = excluded.percentage,
       last_checked = excluded.last_checked`
  ).run(
    userEmail,
    folderId,
    status.status,
    status.syncedCount,
    status.totalCount,
    status.percentage,
    status.lastChecked
  );

  logger.debug('Folder sync status cached', { userEmail, folderId });
}

/**
 * Clear sync status cache for a folder
 */
export function clearFolderSyncStatusCache(
  userEmail: string,
  folderId: string
): void {
  const db = getDatabase();

  db.prepare(
    `DELETE FROM sync_status_cache
     WHERE user_email = ? AND item_id = ? AND item_type = 'folder'`
  ).run(userEmail, folderId);

  logger.debug('Cleared folder sync status cache', { userEmail, folderId });
}

/**
 * Clear sync status cache for multiple folders
 */
export function clearFoldersSyncStatusCache(
  userEmail: string,
  folderIds: string[]
): void {
  if (folderIds.length === 0) return;

  const db = getDatabase();

  const placeholders = folderIds.map(() => '?').join(',');
  db.prepare(
    `DELETE FROM sync_status_cache
     WHERE user_email = ? AND item_id IN (${placeholders}) AND item_type = 'folder'`
  ).run(userEmail, ...folderIds);

  logger.debug('Cleared multiple folders sync status cache', {
    userEmail,
    folderCount: folderIds.length,
  });
}

/**
 * Clear sync status cache for files
 */
export function clearFilesSyncStatusCache(
  userEmail: string,
  fileIds: string[]
): void {
  if (fileIds.length === 0) return;

  const db = getDatabase();

  const placeholders = fileIds.map(() => '?').join(',');
  db.prepare(
    `DELETE FROM sync_status_cache
     WHERE user_email = ? AND item_id IN (${placeholders}) AND item_type = 'file'`
  ).run(userEmail, ...fileIds);

  logger.debug('Cleared files sync status cache', {
    userEmail,
    fileCount: fileIds.length,
  });
}

/**
 * Clear all sync status cache for a user
 */
export function clearAllSyncStatusCache(userEmail: string): void {
  const db = getDatabase();

  db.prepare('DELETE FROM sync_status_cache WHERE user_email = ?').run(
    userEmail
  );

  logger.info('All sync status cache cleared', { userEmail });
}
