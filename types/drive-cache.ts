import { DriveFile, DriveFolder } from './google-drive';
import { SyncStatusDetail } from './sync-status';

/**
 * Cache structure for a single folder
 */
export interface CachedFolder {
  files: DriveFile[];
  folders: DriveFolder[];
  lastSynced: string;
  totalCount: number;
}

/**
 * Sync status cache for items (files and folders)
 */
export interface SyncStatusCache {
  [itemId: string]: SyncStatusDetail;
}

/**
 * Cache structure for all folders of a user
 */
export interface UserCache {
  folders: {
    [folderId: string]: CachedFolder;
  };
  syncStatusCache?: {
    files: SyncStatusCache;
    folders: SyncStatusCache;
  };
}

/**
 * Root database structure
 */
export interface DriveCacheData {
  users: {
    [userEmail: string]: UserCache;
  };
}

/**
 * Paginated response from cache
 */
export interface CachedPageResponse {
  files: DriveFile[];
  folders: DriveFolder[];
  totalCount: number;
  hasMore: boolean;
  lastSynced?: string;
}
