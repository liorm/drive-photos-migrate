/**
 * Upload tracking database schema
 */

/**
 * Record of a successfully uploaded file
 */
export interface UploadRecord {
  photosMediaItemId: string;
  uploadedAt: string;
  fileName: string;
  mimeType: string;
}

/**
 * Upload records for a single user
 */
export interface UserUploadRecords {
  [driveFileId: string]: UploadRecord;
}

/**
 * Root structure for uploads database
 */
export interface UploadsData {
  users: {
    [userEmail: string]: UserUploadRecords;
  };
}
