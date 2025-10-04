import { DriveFile, DriveFolder } from './google-drive';

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
 * Cache structure for all folders of a user
 */
export interface UserCache {
  folders: {
    [folderId: string]: CachedFolder;
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
