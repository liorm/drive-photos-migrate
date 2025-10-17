/**
 * Album queue types and schemas
 */

/**
 * Status of an album queue item
 */
export type AlbumQueueStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'CREATING'
  | 'UPDATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

/**
 * Mode of album operation
 */
export type AlbumQueueMode = 'CREATE' | 'UPDATE';

/**
 * Status of an album item (file)
 */
export type AlbumItemStatus = 'PENDING' | 'UPLOADED' | 'FAILED';

/**
 * A single item in the album queue
 */
export interface AlbumQueueItem {
  id: string; // UUID
  userEmail: string;
  driveFolderId: string;
  folderName: string;
  status: AlbumQueueStatus;
  mode: AlbumQueueMode | null;
  totalFiles: number | null;
  uploadedFiles: number;
  photosAlbumId: string | null;
  photosAlbumUrl: string | null;
  error: string | null;
  createdAt: string; // ISO timestamp
  startedAt: string | null; // ISO timestamp
  completedAt: string | null; // ISO timestamp
}

/**
 * A single file item within an album
 */
export interface AlbumItem {
  id: string; // UUID
  albumQueueId: string;
  driveFileId: string;
  photosMediaItemId: string | null;
  status: AlbumItemStatus;
  addedAt: string; // ISO timestamp
}

/**
 * Mapping of a Drive folder to a Google Photos album
 */
export interface FolderAlbumMapping {
  id: string; // UUID
  userEmail: string;
  driveFolderId: string;
  folderName: string;
  photosAlbumId: string;
  photosAlbumUrl: string;
  createdAt: string; // ISO timestamp
  lastUpdatedAt: string | null; // ISO timestamp
  totalItemsInAlbum: number;
  discoveredViaApi: boolean;
  albumDeleted: boolean;
}

/**
 * Album queue statistics
 */
export interface AlbumQueueStats {
  total: number;
  pending: number;
  uploading: number;
  creating: number;
  updating: number;
  completed: number;
  failed: number;
  cancelled: number;
}
