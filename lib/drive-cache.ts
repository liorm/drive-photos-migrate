import { getDb } from './db';
import { CachedPageResponse } from '@/types/drive-cache';
import { listAllDriveFiles } from './google-drive';

/**
 * Check if a folder is cached for a user
 */
export async function isFolderCached(
  userEmail: string,
  folderId: string
): Promise<boolean> {
  const db = await getDb();

  return !!(
    db.data.users[userEmail]?.folders &&
    db.data.users[userEmail].folders[folderId]
  );
}

/**
 * Get a paginated slice of cached files for a folder
 */
export async function getCachedFolderPage(
  userEmail: string,
  folderId: string,
  page: number = 0,
  pageSize: number = 50
): Promise<CachedPageResponse | null> {
  const db = await getDb();

  const cachedFolder = db.data.users[userEmail]?.folders?.[folderId];

  if (!cachedFolder) {
    return null;
  }

  // Folders are always shown first (not paginated)
  const folders = cachedFolder.folders;

  // Paginate files only
  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;
  const files = cachedFolder.files.slice(startIndex, endIndex);

  return {
    files,
    folders: page === 0 ? folders : [], // Only return folders on first page
    totalCount: cachedFolder.totalCount,
    hasMore: endIndex < cachedFolder.files.length,
    lastSynced: cachedFolder.lastSynced,
  };
}

/**
 * Sync a folder to cache by fetching all files from Google Drive API
 */
export async function syncFolderToCache(
  userEmail: string,
  folderId: string,
  accessToken: string
): Promise<void> {
  // Fetch ALL files from Drive API
  const { files: allFiles, folders: allFolders } = await listAllDriveFiles(
    accessToken,
    folderId
  );

  const db = await getDb();

  // Initialize user cache if it doesn't exist
  if (!db.data.users[userEmail]) {
    db.data.users[userEmail] = { folders: {} };
  }

  // Store in cache
  db.data.users[userEmail].folders[folderId] = {
    files: allFiles,
    folders: allFolders,
    lastSynced: new Date().toISOString(),
    totalCount: allFiles.length + allFolders.length,
  };

  // Persist to disk
  await db.write();
}

/**
 * Clear a folder from cache (for refresh)
 */
export async function clearFolderCache(
  userEmail: string,
  folderId: string
): Promise<void> {
  const db = await getDb();

  if (db.data.users[userEmail]?.folders?.[folderId]) {
    delete db.data.users[userEmail].folders[folderId];
    await db.write();
  }
}

/**
 * Get total count of files in cached folder
 */
export async function getCachedFolderCount(
  userEmail: string,
  folderId: string
): Promise<number> {
  const db = await getDb();

  const cachedFolder = db.data.users[userEmail]?.folders?.[folderId];

  return cachedFolder?.totalCount || 0;
}
