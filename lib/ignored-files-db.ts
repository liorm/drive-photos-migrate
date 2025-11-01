import { getDatabase } from './sqlite-db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ignored-files-db');

/**
 * Check if a file is ignored
 */
export function isFileIgnored(userEmail: string, driveFileId: string): boolean {
  const db = getDatabase();

  const result = db
    .prepare(
      'SELECT id FROM ignored_files WHERE user_email = ? AND drive_file_id = ?'
    )
    .get(userEmail, driveFileId);

  return !!result;
}

/**
 * Get all ignored file IDs for a user (optionally filtered by specific file IDs)
 */
export function getIgnoredFileIds(
  userEmail: string,
  driveFileIds?: string[]
): Set<string> {
  const db = getDatabase();

  if (driveFileIds && driveFileIds.length > 0) {
    // Batch query for specific files
    const placeholders = driveFileIds.map(() => '?').join(',');
    const results = db
      .prepare(
        `SELECT drive_file_id FROM ignored_files
         WHERE user_email = ? AND drive_file_id IN (${placeholders})`
      )
      .all(userEmail, ...driveFileIds) as Array<{ drive_file_id: string }>;

    return new Set(results.map(r => r.drive_file_id));
  } else {
    // Get all ignored files for user
    const results = db
      .prepare('SELECT drive_file_id FROM ignored_files WHERE user_email = ?')
      .all(userEmail) as Array<{ drive_file_id: string }>;

    return new Set(results.map(r => r.drive_file_id));
  }
}

/**
 * Mark file as ignored
 */
export function ignoreFile(
  userEmail: string,
  driveFileId: string,
  reason?: string
): void {
  logger.info('Ignoring file', { userEmail, driveFileId, reason });

  const db = getDatabase();

  db.prepare(
    `INSERT INTO ignored_files (user_email, drive_file_id, ignored_at, reason)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_email, drive_file_id) DO NOTHING`
  ).run(userEmail, driveFileId, new Date().toISOString(), reason || null);

  logger.info('File ignored successfully', { userEmail, driveFileId });
}

/**
 * Unignore file
 */
export function unignoreFile(userEmail: string, driveFileId: string): void {
  logger.info('Unignoring file', { userEmail, driveFileId });

  const db = getDatabase();

  const result = db
    .prepare(
      'DELETE FROM ignored_files WHERE user_email = ? AND drive_file_id = ?'
    )
    .run(userEmail, driveFileId);

  if (result.changes > 0) {
    logger.info('File unignored successfully', { userEmail, driveFileId });
  } else {
    logger.debug('File was not ignored', { userEmail, driveFileId });
  }
}

/**
 * Batch ignore multiple files
 */
export function ignoreFiles(
  userEmail: string,
  driveFileIds: string[],
  reason?: string
): void {
  logger.info('Batch ignoring files', {
    userEmail,
    count: driveFileIds.length,
  });

  const db = getDatabase();
  const ignoredAt = new Date().toISOString();

  const transaction = db.transaction(() => {
    const stmt = db.prepare(
      `INSERT INTO ignored_files (user_email, drive_file_id, ignored_at, reason)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_email, drive_file_id) DO NOTHING`
    );

    for (const fileId of driveFileIds) {
      stmt.run(userEmail, fileId, ignoredAt, reason || null);
    }
  });

  transaction();

  logger.info('Batch ignore completed', {
    userEmail,
    count: driveFileIds.length,
  });
}

/**
 * Get count of ignored files for a user
 */
export function getIgnoredFileCount(userEmail: string): number {
  const db = getDatabase();

  const result = db
    .prepare('SELECT COUNT(*) as count FROM ignored_files WHERE user_email = ?')
    .get(userEmail) as { count: number };

  return result.count;
}
