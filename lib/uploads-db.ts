import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { UploadsData, UploadRecord } from '@/types/uploads';
import { createLogger } from '@/lib/logger';

const logger = createLogger('uploads-db');

// Database file path
const UPLOADS_DB_PATH = path.join(process.cwd(), 'data', 'uploads.json');

// Default database structure
const defaultData: UploadsData = {
  users: {},
};

let uploadsDb: Low<UploadsData> | null = null;

/**
 * Initialize and get the uploads database instance
 * Singleton pattern to ensure only one instance
 */
export async function getUploadsDb(): Promise<Low<UploadsData>> {
  if (uploadsDb) {
    return uploadsDb;
  }

  logger.info('Initializing uploads database', { dbPath: UPLOADS_DB_PATH });

  const adapter = new JSONFile<UploadsData>(UPLOADS_DB_PATH);
  uploadsDb = new Low<UploadsData>(adapter, defaultData);

  // Read data from JSON file
  const startTime = Date.now();
  await uploadsDb.read();
  const readDuration = Date.now() - startTime;

  // If file doesn't exist or is empty, initialize with default data
  if (!uploadsDb.data) {
    logger.info('Uploads database file empty or missing, initializing', {
      dbPath: UPLOADS_DB_PATH,
    });
    uploadsDb.data = defaultData;
    const writeStartTime = Date.now();
    await uploadsDb.write();
    const writeDuration = Date.now() - writeStartTime;
    logger.info('Uploads database initialized successfully', {
      dbPath: UPLOADS_DB_PATH,
      writeDurationMs: writeDuration,
    });
  } else {
    logger.info('Uploads database loaded successfully', {
      dbPath: UPLOADS_DB_PATH,
      readDurationMs: readDuration,
      userCount: Object.keys(uploadsDb.data.users).length,
    });
  }

  return uploadsDb;
}

/**
 * Check if a Drive file has been uploaded to Photos
 */
export async function isFileUploaded(
  userEmail: string,
  driveFileId: string
): Promise<boolean> {
  const db = await getUploadsDb();

  const isUploaded = !!db.data.users[userEmail]?.[driveFileId];

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
  const db = await getUploadsDb();

  const record = db.data.users[userEmail]?.[driveFileId] || null;

  logger.debug('Retrieved upload record', {
    userEmail,
    driveFileId,
    found: !!record,
  });

  return record;
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

  const db = await getUploadsDb();
  const userRecords = db.data.users[userEmail] || {};

  const results = new Map<string, UploadRecord | null>();

  for (const fileId of driveFileIds) {
    results.set(fileId, userRecords[fileId] || null);
  }

  const uploadedCount = Array.from(results.values()).filter(
    r => r !== null
  ).length;

  logger.debug('Bulk check completed', {
    userEmail,
    totalFiles: driveFileIds.length,
    uploadedCount,
    unuploadedCount: driveFileIds.length - uploadedCount,
  });

  return results;
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
  fileSizeBytes: number
): Promise<void> {
  logger.info('Recording upload', {
    userEmail,
    driveFileId,
    photosMediaItemId,
    fileName,
    fileSizeBytes,
  });

  const db = await getUploadsDb();

  // Initialize user if doesn't exist
  if (!db.data.users[userEmail]) {
    logger.debug('Initializing upload records for new user', { userEmail });
    db.data.users[userEmail] = {};
  }

  // Record upload
  db.data.users[userEmail][driveFileId] = {
    photosMediaItemId,
    uploadedAt: new Date().toISOString(),
    fileName,
    mimeType,
    fileSizeBytes,
  };

  // Persist to disk
  await db.write();

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
    fileSizeBytes: number;
  }>
): Promise<void> {
  logger.info('Recording batch uploads', {
    userEmail,
    uploadCount: uploads.length,
  });

  const db = await getUploadsDb();

  // Initialize user if doesn't exist
  if (!db.data.users[userEmail]) {
    logger.debug('Initializing upload records for new user', { userEmail });
    db.data.users[userEmail] = {};
  }

  const uploadedAt = new Date().toISOString();

  // Record all uploads
  for (const upload of uploads) {
    db.data.users[userEmail][upload.driveFileId] = {
      photosMediaItemId: upload.photosMediaItemId,
      uploadedAt,
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      fileSizeBytes: upload.fileSizeBytes,
    };
  }

  // Persist to disk
  await db.write();

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

  const db = await getUploadsDb();

  if (db.data.users[userEmail]?.[driveFileId]) {
    delete db.data.users[userEmail][driveFileId];
    await db.write();
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
 * Get all upload records for a user
 * @returns An array of upload records
 */
export async function getUploadedRecords(
  userEmail: string
): Promise<UploadRecord[]> {
  const db = await getUploadsDb();
  const userRecords = db.data.users[userEmail] || {};
  const records = Object.values(userRecords);

  logger.debug('Retrieved all upload records for user', {
    userEmail,
    count: records.length,
  });

  return records;
}

/**
 * Get count of uploaded files for a user
 */
export async function getUploadedFileCount(userEmail: string): Promise<number> {
  const db = await getUploadsDb();

  const count = Object.keys(db.data.users[userEmail] || {}).length;

  logger.debug('Retrieved uploaded file count', { userEmail, count });

  return count;
}
