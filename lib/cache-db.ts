import { getDatabase } from './sqlite-db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('cache-db');

export async function getCacheStats(userEmail: string): Promise<{
  cachedFolders: number;
  cachedFiles: number;
  cachedSubfolders: number;
  totalCacheSize: number;
  averageFileSize: number;
  lastCacheUpdate: string | null;
  fileTypeBreakdown: {
    images: number;
    videos: number;
    documents: number;
    other: number;
  };
}> {
  const db = getDatabase();

  // Get folder count
  const folderResult = db
    .prepare(
      'SELECT COUNT(*) as count FROM cached_folders WHERE user_email = ?'
    )
    .get(userEmail) as { count: number };

  // Get file stats and most recent cache update
  const fileStats = db
    .prepare(
      `SELECT 
         COUNT(*) as count, 
         SUM(CAST(size AS INTEGER)) as totalSize,
         AVG(CAST(size AS INTEGER)) as averageSize,
         MAX(cfo.last_synced) as lastUpdate
       FROM cached_files cf
       JOIN cached_folders cfo ON cf.cached_folder_id = cfo.id
       WHERE cfo.user_email = ?`
    )
    .get(userEmail) as {
    count: number;
    totalSize: number | null;
    averageSize: number | null;
    lastUpdate: string | null;
  };

  // Get subfolder count
  const subfolderResult = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM cached_subfolders cs
       JOIN cached_folders cfo ON cs.cached_folder_id = cfo.id
       WHERE cfo.user_email = ?`
    )
    .get(userEmail) as { count: number };

  // Get file type breakdown
  const imageTypes = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM cached_files cf
       JOIN cached_folders cfo ON cf.cached_folder_id = cfo.id
       WHERE cfo.user_email = ? 
       AND (cf.mime_type LIKE 'image/%' OR cf.mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'))`
    )
    .get(userEmail) as { count: number };

  const videoTypes = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM cached_files cf
       JOIN cached_folders cfo ON cf.cached_folder_id = cfo.id
       WHERE cfo.user_email = ? 
       AND (cf.mime_type LIKE 'video/%' OR cf.mime_type IN ('video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'))`
    )
    .get(userEmail) as { count: number };

  const documentTypes = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM cached_files cf
       JOIN cached_folders cfo ON cf.cached_folder_id = cfo.id
       WHERE cfo.user_email = ? 
       AND (cf.mime_type LIKE 'application/%' OR cf.mime_type LIKE 'text/%'
            OR cf.mime_type IN ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'))`
    )
    .get(userEmail) as { count: number };

  const totalFiles = fileStats.count || 0;
  const images = imageTypes.count || 0;
  const videos = videoTypes.count || 0;
  const documents = documentTypes.count || 0;
  const other = Math.max(0, totalFiles - images - videos - documents);

  const stats = {
    cachedFolders: folderResult.count || 0,
    cachedFiles: totalFiles,
    cachedSubfolders: subfolderResult.count || 0,
    totalCacheSize: fileStats.totalSize || 0,
    averageFileSize: fileStats.averageSize || 0,
    lastCacheUpdate: fileStats.lastUpdate,
    fileTypeBreakdown: {
      images,
      videos,
      documents,
      other,
    },
  };

  logger.debug('Retrieved enhanced cache stats', { userEmail, stats });

  return stats;
}

export async function getLargestCachedFiles(
  userEmail: string,
  limit: number = 10
): Promise<
  Array<{
    fileName: string;
    size: number;
    mimeType: string;
    folderName?: string;
  }>
> {
  const db = getDatabase();

  const files = db
    .prepare(
      `SELECT 
         cf.name as fileName,
         CAST(cf.size AS INTEGER) as size,
         cf.mime_type as mimeType,
         'Unknown' as folderName
       FROM cached_files cf
       JOIN cached_folders cfo ON cf.cached_folder_id = cfo.id
       WHERE cfo.user_email = ? AND cf.size IS NOT NULL AND cf.size != ''
       ORDER BY CAST(cf.size AS INTEGER) DESC
       LIMIT ?`
    )
    .all(userEmail, limit) as Array<{
    fileName: string;
    size: number;
    mimeType: string;
    folderName: string;
  }>;

  logger.debug('Retrieved largest cached files', {
    userEmail,
    count: files.length,
  });

  return files;
}

export async function getCacheGrowthStats(userEmail: string): Promise<{
  foldersAddedToday: number;
  filesAddedToday: number;
  sizeAddedToday: number;
}> {
  const db = getDatabase();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const foldersToday = db
    .prepare(
      'SELECT COUNT(*) as count FROM cached_folders WHERE user_email = ? AND last_synced >= ?'
    )
    .get(userEmail, todayISO) as { count: number };

  // For files, we need to check folders that were synced today
  const filesToday = db
    .prepare(
      `SELECT COUNT(*) as count, SUM(CAST(cf.size AS INTEGER)) as totalSize
       FROM cached_files cf
       JOIN cached_folders cfo ON cf.cached_folder_id = cfo.id
       WHERE cfo.user_email = ? AND cfo.last_synced >= ?`
    )
    .get(userEmail, todayISO) as { count: number; totalSize: number | null };

  const stats = {
    foldersAddedToday: foldersToday.count || 0,
    filesAddedToday: filesToday.count || 0,
    sizeAddedToday: filesToday.totalSize || 0,
  };

  logger.debug('Retrieved cache growth stats', { userEmail, stats });

  return stats;
}
