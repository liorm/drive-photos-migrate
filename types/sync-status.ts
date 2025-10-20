/**
 * Sync status types and schemas
 */

/**
 * Sync status for a file or folder
 */
export type SyncStatus = 'synced' | 'partial' | 'unsynced';

/**
 * Detailed sync status with metadata
 */
export interface SyncStatusDetail {
  status: SyncStatus;
  syncedCount: number;
  totalCount: number;
  percentage: number; // 0-100
  lastChecked: string;
}

/**
 * Cached sync status for a single item (file or folder)
 */
export interface CachedSyncStatus {
  [itemId: string]: SyncStatusDetail;
}

/**
 * Sync status cache for a user
 */
export interface UserSyncStatusCache {
  folders: CachedSyncStatus;
  files: CachedSyncStatus;
}

/**
 * Root structure for sync status cache (stored in drive_cache.json)
 */
export interface SyncStatusCacheData {
  users: {
    [userEmail: string]: UserSyncStatusCache;
  };
}

/**
 * Result of recursive sync status refresh operation
 */
export interface RecursiveSyncRefreshResult {
  folderId: string;
  folderName?: string;
  status: SyncStatusDetail;
  subfolders: RecursiveSyncRefreshResult[];
  processedCount: number; // Total number of folders processed
  durationMs: number;
}
