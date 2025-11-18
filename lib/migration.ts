import { Database } from 'better-sqlite3';
import { createLogger } from '@/lib/logger';

const logger = createLogger('migration');

// List of migration functions
const MIGRATIONS: Array<{ name: string; migrate: (db: Database) => void }> = [
  {
    name: 'add-file-size-to-uploads',
    migrate: addFileSizeToUploads,
  },
  {
    name: 'add-album-tables',
    migrate: addAlbumTables,
  },
  {
    name: 'add-recursive-sync-tracking',
    migrate: addRecursiveSyncTracking,
  },
  {
    name: 'add-ignored-files-table',
    migrate: addIgnoredFilesTable,
  },
  {
    name: 'add-product-url-to-uploads',
    migrate: addProductUrlToUploads,
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

function addAlbumTables(db: Database): void {
  logger.info('Running migration: add-album-tables');

  // Create album_queue table
  db.exec(`
    CREATE TABLE IF NOT EXISTS album_queue (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      drive_folder_id TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'UPLOADING', 'CREATING', 'UPDATING', 'COMPLETED', 'FAILED', 'CANCELLED')),
      mode TEXT CHECK(mode IN ('CREATE', 'UPDATE')),
      total_files INTEGER,
      uploaded_files INTEGER NOT NULL DEFAULT 0,
      photos_album_id TEXT,
      photos_album_url TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );
  `);

  // Create album_items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS album_items (
      id TEXT PRIMARY KEY,
      album_queue_id TEXT NOT NULL,
      drive_file_id TEXT NOT NULL,
      photos_media_item_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'UPLOADED', 'FAILED')),
      added_at TEXT NOT NULL,
      FOREIGN KEY (album_queue_id) REFERENCES album_queue(id) ON DELETE CASCADE
    );
  `);

  // Create folder_albums table
  db.exec(`
    CREATE TABLE IF NOT EXISTS folder_albums (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      drive_folder_id TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      photos_album_id TEXT NOT NULL,
      photos_album_url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_updated_at TEXT,
      total_items_in_album INTEGER NOT NULL DEFAULT 0,
      discovered_via_api INTEGER NOT NULL DEFAULT 0,
      album_deleted INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Create indexes for album_queue
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_album_queue_user_status
    ON album_queue(user_email, status);
  `);

  // Create indexes for album_items
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_album_items_queue_id
    ON album_items(album_queue_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_album_items_drive_file
    ON album_items(drive_file_id);
  `);

  // Create indexes for folder_albums
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_folder_albums_user_folder
    ON folder_albums(user_email, drive_folder_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_folder_albums_user_album
    ON folder_albums(user_email, photos_album_id);
  `);

  logger.info('Album tables created successfully');
}

function addRecursiveSyncTracking(db: Database): void {
  logger.info('Running migration: add-recursive-sync-tracking');

  // Check if the column already exists
  const columns = db.pragma('table_info(cached_folders)') as Array<{
    name: string;
  }>;
  const hasRecursiveColumn = columns.some(col => col.name === 'recursive_sync');
  const hasDepthColumn = columns.some(col => col.name === 'max_depth');

  if (!hasRecursiveColumn) {
    logger.info('Adding recursive_sync column to cached_folders table');
    db.exec(
      'ALTER TABLE cached_folders ADD COLUMN recursive_sync INTEGER NOT NULL DEFAULT 0'
    );
  }

  if (!hasDepthColumn) {
    logger.info('Adding max_depth column to cached_folders table');
    db.exec(
      'ALTER TABLE cached_folders ADD COLUMN max_depth INTEGER DEFAULT NULL'
    );
  }

  logger.info('Recursive sync tracking columns added successfully');
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

function addIgnoredFilesTable(db: Database): void {
  logger.info('Running migration: add-ignored-files-table');

  // Check if table already exists (idempotent)
  const tableExists = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name='ignored_files'`
    )
    .get();

  if (!tableExists) {
    logger.info('Creating ignored_files table');

    db.exec(`
      CREATE TABLE ignored_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        drive_file_id TEXT NOT NULL,
        ignored_at TEXT NOT NULL,
        reason TEXT,
        UNIQUE(user_email, drive_file_id)
      );
    `);

    db.exec(`
      CREATE INDEX idx_ignored_files_user_file
      ON ignored_files(user_email, drive_file_id);
    `);

    logger.info('ignored_files table created successfully');
  } else {
    logger.info('ignored_files table already exists, skipping');
  }
}

function addProductUrlToUploads(db: Database): void {
  logger.info('Running migration: add-product-url-to-uploads');

  const columns = db.pragma('table_info(uploads)') as Array<{ name: string }>;
  const hasProductUrlColumn = columns.some(col => col.name === 'product_url');

  if (!hasProductUrlColumn) {
    logger.info('Adding product_url column to uploads table');
    db.exec('ALTER TABLE uploads ADD COLUMN product_url TEXT');
    logger.info('product_url column added successfully');
  } else {
    logger.info('product_url column already exists, skipping');
  }
}
