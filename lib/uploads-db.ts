import { getDatabase } from './sqlite-db';
import { UploadRecord } from '@/types/uploads';
import { createLogger } from '@/lib/logger';

const logger = createLogger('uploads-db');

/**
 * Check if a Drive file has been uploaded to Photos
 */
export async function isFileUploaded(
  userEmail: string,
  driveFileId: string
): Promise<boolean> {
  const db = getDatabase();

  const result = db
    .prepare(
      'SELECT id FROM uploads WHERE user_email = ? AND drive_file_id = ?'
    )
    .get(userEmail, driveFileId);

  const isUploaded = !!result;

  logger.debug('Checked if file is uploaded', {
    userEmail,
    driveFileId,
    isUploaded,
  });

  return isUploaded;
}

/**
 * Get upload record for a Drive file
 */
export async function getUploadRecord(
  userEmail: string,
  driveFileId: string
): Promise<UploadRecord | null> {
  const db = getDatabase();

  const result = db
    .prepare(
      `SELECT photos_media_item_id, uploaded_at, file_name, mime_type, file_size
       FROM uploads
       WHERE user_email = ? AND drive_file_id = ?`
    )
    .get(userEmail, driveFileId) as
    | {
        photos_media_item_id: string;
        uploaded_at: string;
        file_name: string;
        mime_type: string;
        file_size: number | null;
      }
    | undefined;

  if (!result) {
    logger.debug('Upload record not found', { userEmail, driveFileId });
    return null;
  }

  logger.debug('Retrieved upload record', { userEmail, driveFileId });

  return {
    photosMediaItemId: result.photos_media_item_id,
    uploadedAt: result.uploaded_at,
    fileName: result.file_name,
    mimeType: result.mime_type,
    fileSize: result.file_size || undefined,
  };
}

/**
 * Bulk check if multiple files are uploaded
 * Returns a Map of driveFileId -> UploadRecord | null
 */
export async function getUploadRecords(
  userEmail: string,
  driveFileIds: string[]
): Promise<Map<string, UploadRecord | null>> {
  logger.debug('Bulk checking upload records', {
    userEmail,
    fileCount: driveFileIds.length,
  });

  if (driveFileIds.length === 0) {
    return new Map();
  }

  const db = getDatabase();

  const placeholders = driveFileIds.map(() => '?').join(',');
  const results = db
    .prepare(
      `SELECT drive_file_id, photos_media_item_id, uploaded_at, file_name, mime_type, file_size
       FROM uploads
       WHERE user_email = ? AND drive_file_id IN (${placeholders})`
    )
    .all(userEmail, ...driveFileIds) as Array<{
    drive_file_id: string;
    photos_media_item_id: string;
    uploaded_at: string;
    file_name: string;
    mime_type: string;
    file_size: number | null;
  }>;

  const recordMap = new Map<string, UploadRecord | null>();

  // Initialize all file IDs with null
  for (const fileId of driveFileIds) {
    recordMap.set(fileId, null);
  }

  // Fill in the records that exist
  for (const row of results) {
    recordMap.set(row.drive_file_id, {
      photosMediaItemId: row.photos_media_item_id,
      uploadedAt: row.uploaded_at,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size || undefined,
    });
  }

  const uploadedCount = results.length;

  logger.debug('Bulk check completed', {
    userEmail,
    totalFiles: driveFileIds.length,
    uploadedCount,
    unuploadedCount: driveFileIds.length - uploadedCount,
  });

  return recordMap;
}

/**
 * Record a successful upload
 */
export async function recordUpload(
  userEmail: string,
  driveFileId: string,
  photosMediaItemId: string,
  fileName: string,
  mimeType: string,
  fileSize?: number
): Promise<void> {
  logger.info('Recording upload', {
    userEmail,
    driveFileId,
    photosMediaItemId,
    fileName,
    fileSize,
  });

  const db = getDatabase();

  db.prepare(
    `INSERT INTO uploads (user_email, drive_file_id, photos_media_item_id, uploaded_at, file_name, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_email, drive_file_id)
     DO UPDATE SET
       photos_media_item_id = excluded.photos_media_item_id,
       uploaded_at = excluded.uploaded_at,
       file_name = excluded.file_name,
       mime_type = excluded.mime_type,
       file_size = excluded.file_size`
  ).run(
    userEmail,
    driveFileId,
    photosMediaItemId,
    new Date().toISOString(),
    fileName,
    mimeType,
    fileSize || null
  );

  logger.info('Upload recorded successfully', {
    userEmail,
    driveFileId,
    photosMediaItemId,
  });
}

/**
 * Batch record multiple uploads
 */
export async function recordUploads(
  userEmail: string,
  uploads: Array<{
    driveFileId: string;
    photosMediaItemId: string;
    fileName: string;
    mimeType: string;
    fileSize?: number;
  }>
): Promise<void> {
  logger.info('Recording batch uploads', {
    userEmail,
    uploadCount: uploads.length,
  });

  if (uploads.length === 0) {
    return;
  }

  const db = getDatabase();
  const uploadedAt = new Date().toISOString();

  const transaction = db.transaction(() => {
    const insert = db.prepare(
      `INSERT INTO uploads (user_email, drive_file_id, photos_media_item_id, uploaded_at, file_name, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_email, drive_file_id)
       DO UPDATE SET
         photos_media_item_id = excluded.photos_media_item_id,
         uploaded_at = excluded.uploaded_at,
         file_name = excluded.file_name,
         mime_type = excluded.mime_type,
         file_size = excluded.file_size`
    );

    for (const upload of uploads) {
      insert.run(
        userEmail,
        upload.driveFileId,
        upload.photosMediaItemId,
        uploadedAt,
        upload.fileName,
        upload.mimeType,
        upload.fileSize || null
      );
    }
  });

  transaction();

  logger.info('Batch uploads recorded successfully', {
    userEmail,
    uploadCount: uploads.length,
  });
}

/**
 * Delete an upload record (for testing or cleanup)
 */
export async function deleteUploadRecord(
  userEmail: string,
  driveFileId: string
): Promise<void> {
  logger.info('Deleting upload record', { userEmail, driveFileId });

  const db = getDatabase();

  const result = db
    .prepare('DELETE FROM uploads WHERE user_email = ? AND drive_file_id = ?')
    .run(userEmail, driveFileId);

  if (result.changes > 0) {
    logger.info('Upload record deleted successfully', {
      userEmail,
      driveFileId,
    });
  } else {
    logger.debug('Upload record not found, nothing to delete', {
      userEmail,
      driveFileId,
    });
  }
}

/**
 * Batch delete multiple upload records
 */
export async function deleteUploadRecords(
  userEmail: string,
  driveFileIds: string[]
): Promise<void> {
  logger.info('Deleting batch upload records', {
    userEmail,
    fileCount: driveFileIds.length,
  });

  if (driveFileIds.length === 0) {
    logger.debug('No file IDs provided, nothing to delete', { userEmail });
    return;
  }

  const db = getDatabase();

  const placeholders = driveFileIds.map(() => '?').join(',');
  const result = db
    .prepare(
      `DELETE FROM uploads
       WHERE user_email = ? AND drive_file_id IN (${placeholders})`
    )
    .run(userEmail, ...driveFileIds);

  if (result.changes > 0) {
    logger.info('Batch upload records deleted successfully', {
      userEmail,
      deletedCount: result.changes,
    });
  } else {
    logger.debug('No upload records found to delete', { userEmail });
  }
}

/**
 * Get statistics of uploaded files for a user
 */
export async function getUploadsStats(
  userEmail: string
): Promise<{ count: number; totalSize: number }> {
  const db = getDatabase();

  const result = db
    .prepare(
      'SELECT COUNT(*) as count, SUM(file_size) as totalSize FROM uploads WHERE user_email = ?'
    )
    .get(userEmail) as { count: number; totalSize: number | null };

  const stats = {
    count: result.count || 0,
    totalSize: result.totalSize || 0,
  };

  logger.debug('Retrieved uploads stats', { userEmail, stats });

  return stats;
}
