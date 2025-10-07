import Database from 'better-sqlite3';
import path from 'path';
import { createLogger } from '@/lib/logger';
import fs from 'fs';

import { runMigrations } from './migration';

const logger = createLogger('sqlite-db');

const DB_PATH = path.join(process.cwd(), 'data', 'app.db');

let db: Database.Database | null = null;

/**
 * Initialize and get the SQLite database instance
 * Singleton pattern to ensure only one instance
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  logger.info('Initializing SQLite database', { dbPath: DB_PATH });

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    logger.info('Created data directory', { dataDir });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL'); // Better performance for concurrent reads/writes
  db.pragma('foreign_keys = ON'); // Enable foreign key constraints

  // Initialize schema
  initializeSchema(db);

  // Run migrations
  runMigrations(db);

  logger.info('SQLite database initialized successfully', { dbPath: DB_PATH });

  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema(database: Database.Database): void {
  logger.info('Initializing database schema');

  // Create tables
  database.exec(`
    -- Cached folders
    CREATE TABLE IF NOT EXISTS cached_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      last_synced TEXT NOT NULL,
      total_count INTEGER NOT NULL,
      UNIQUE(user_email, folder_id)
    );

    -- Cached files within folders
    CREATE TABLE IF NOT EXISTS cached_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cached_folder_id INTEGER NOT NULL,
      file_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size TEXT,
      thumbnail_link TEXT,
      web_content_link TEXT,
      icon_link TEXT,
      created_time TEXT NOT NULL,
      modified_time TEXT NOT NULL,
      parents TEXT,
      FOREIGN KEY (cached_folder_id) REFERENCES cached_folders(id) ON DELETE CASCADE
    );

    -- Cached subfolders within folders
    CREATE TABLE IF NOT EXISTS cached_subfolders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cached_folder_id INTEGER NOT NULL,
      folder_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      created_time TEXT NOT NULL,
      modified_time TEXT NOT NULL,
      parents TEXT,
      FOREIGN KEY (cached_folder_id) REFERENCES cached_folders(id) ON DELETE CASCADE
    );

    -- Sync status cache
    CREATE TABLE IF NOT EXISTS sync_status_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_type TEXT NOT NULL CHECK(item_type IN ('file', 'folder')),
      status TEXT NOT NULL CHECK(status IN ('synced', 'partial', 'unsynced')),
      synced_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      percentage INTEGER NOT NULL,
      last_checked TEXT NOT NULL,
      UNIQUE(user_email, item_id, item_type)
    );

    -- Uploads tracking
    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      drive_file_id TEXT NOT NULL,
      photos_media_item_id TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      UNIQUE(user_email, drive_file_id)
    );

    -- Upload queue
    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      drive_file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER,
      status TEXT NOT NULL CHECK(status IN ('pending', 'uploading', 'completed', 'failed')),
      added_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      photos_media_item_id TEXT
    );
  `);

  // Create indexes
  database.exec(`
    -- Drive cache indexes
    CREATE INDEX IF NOT EXISTS idx_cached_folders_user_folder
      ON cached_folders(user_email, folder_id);

    CREATE INDEX IF NOT EXISTS idx_cached_files_folder
      ON cached_files(cached_folder_id);

    CREATE INDEX IF NOT EXISTS idx_cached_files_file_id
      ON cached_files(file_id);

    CREATE INDEX IF NOT EXISTS idx_cached_subfolders_folder
      ON cached_subfolders(cached_folder_id);

    CREATE INDEX IF NOT EXISTS idx_sync_status_user_item
      ON sync_status_cache(user_email, item_id, item_type);

    -- Uploads indexes
    CREATE INDEX IF NOT EXISTS idx_uploads_user_file
      ON uploads(user_email, drive_file_id);

    CREATE INDEX IF NOT EXISTS idx_uploads_user
      ON uploads(user_email);

    -- Queue indexes
    CREATE INDEX IF NOT EXISTS idx_queue_user_status
      ON queue_items(user_email, status);

    CREATE INDEX IF NOT EXISTS idx_queue_user
      ON queue_items(user_email);

    CREATE INDEX IF NOT EXISTS idx_queue_status
      ON queue_items(status);
  `);

  logger.info('Database schema initialized successfully');
}

/**
 * Close the database connection (for cleanup/testing)
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}
