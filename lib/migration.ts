import { Database } from 'better-sqlite3';
import { createLogger } from '@/lib/logger';

const logger = createLogger('migration');

// List of migration functions
const MIGRATIONS: Array<{ name: string; migrate: (db: Database) => void }> = [
  {
    name: 'add-file-size-to-uploads',
    migrate: addFileSizeToUploads,
  },
];

function addFileSizeToUploads(db: Database): void {
  logger.info('Running migration: add-file-size-to-uploads');

  const columns = db.pragma('table_info(uploads)') as Array<{ name: string }>;
  const hasFileSizeColumn = columns.some(col => col.name === 'file_size');

  if (!hasFileSizeColumn) {
    logger.info('Adding file_size column to uploads table');
    db.exec('ALTER TABLE uploads ADD COLUMN file_size INTEGER DEFAULT 0');

    logger.info('Populating file_size column from cached_files');
    const uploadsToUpdate = db
      .prepare(
        'SELECT user_email, drive_file_id FROM uploads WHERE file_size = 0'
      )
      .all() as Array<{ user_email: string; drive_file_id: string }>;

    let updatedCount = 0;
    for (const upload of uploadsToUpdate) {
      const cachedFile = db
        .prepare(
          `SELECT cf.size
           FROM cached_files cf
           JOIN cached_folders cfo ON cf.cached_folder_id = cfo.id
           WHERE cfo.user_email = ? AND cf.file_id = ? AND cf.size IS NOT NULL`
        )
        .get(upload.user_email, upload.drive_file_id) as {
        size: string | null;
      };

      if (cachedFile?.size) {
        db.prepare(
          'UPDATE uploads SET file_size = ? WHERE drive_file_id = ?'
        ).run(parseInt(cachedFile.size, 10), upload.drive_file_id);
        updatedCount++;
      }
    }
    logger.info(`Populated file_size for ${updatedCount} uploads`);
  }
}

export function runMigrations(db: Database): void {
  logger.info('Running database migrations...');

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      run_at TEXT NOT NULL
    );
  `);

  const completedMigrations = new Set(
    (
      db.prepare('SELECT name FROM migrations').all() as Array<{ name: string }>
    ).map(m => m.name)
  );

  for (const migration of MIGRATIONS) {
    if (!completedMigrations.has(migration.name)) {
      try {
        migration.migrate(db);
        db.prepare('INSERT INTO migrations (name, run_at) VALUES (?, ?)').run(
          migration.name,
          new Date().toISOString()
        );
        logger.info(`Migration ${migration.name} completed successfully`);
      } catch (error) {
        logger.error(`Migration ${migration.name} failed`, error);
        // Stop further migrations if one fails
        return;
      }
    }
  }

  logger.info('Database migrations are up to date.');
}
