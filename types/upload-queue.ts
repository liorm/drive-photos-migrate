/**
 * Upload queue types and schemas
 */

/**
 * Status of a queue item
 */
export type QueueItemStatus = 'pending' | 'uploading' | 'completed' | 'failed';

/**
 * A single item in the upload queue
 */
export interface QueueItem {
  id: string; // Unique queue item ID
  driveFileId: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  status: QueueItemStatus;
  addedAt: string; // ISO timestamp
  startedAt?: string; // ISO timestamp
  completedAt?: string; // ISO timestamp
  error?: string; // Error message if failed
  photosMediaItemId?: string; // Set after successful upload
  folderPath?: Array<{ id: string; name: string }>; // Breadcrumb path to file's parent folder
}

/**
 * Upload queue for a single user
 */
export interface UserUploadQueue {
  items: QueueItem[];
}

/**
 * Root structure for upload queue database
 */
export interface UploadQueueData {
  users: {
    [userEmail: string]: UserUploadQueue;
  };
}
