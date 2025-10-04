import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { DriveCacheData } from '@/types/drive-cache';
import { createLogger } from '@/lib/logger';

const logger = createLogger('db');

// Database file path
const DB_PATH = path.join(process.cwd(), 'data', 'drive_cache.json');

// Default database structure
const defaultData: DriveCacheData = {
  users: {},
};

let db: Low<DriveCacheData> | null = null;

/**
 * Initialize and get the database instance
 * Singleton pattern to ensure only one instance
 */
export async function getDb(): Promise<Low<DriveCacheData>> {
  if (db) {
    return db;
  }

  logger.info('Initializing database', { dbPath: DB_PATH });

  const adapter = new JSONFile<DriveCacheData>(DB_PATH);
  db = new Low<DriveCacheData>(adapter, defaultData);

  // Read data from JSON file, this will set db.data
  const startTime = Date.now();
  await db.read();
  const readDuration = Date.now() - startTime;

  // If file doesn't exist or is empty, initialize with default data
  if (!db.data) {
    logger.info('Database file empty or missing, initializing with defaults', {
      dbPath: DB_PATH,
    });
    db.data = defaultData;
    const writeStartTime = Date.now();
    await db.write();
    const writeDuration = Date.now() - writeStartTime;
    logger.info('Database initialized successfully', {
      dbPath: DB_PATH,
      writeDurationMs: writeDuration,
    });
  } else {
    logger.info('Database loaded successfully', {
      dbPath: DB_PATH,
      readDurationMs: readDuration,
      userCount: Object.keys(db.data.users).length,
    });
  }

  return db;
}
