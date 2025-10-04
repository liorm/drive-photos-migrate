import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { DriveCacheData } from '@/types/drive-cache';

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

  const adapter = new JSONFile<DriveCacheData>(DB_PATH);
  db = new Low<DriveCacheData>(adapter, defaultData);

  // Read data from JSON file, this will set db.data
  await db.read();

  // If file doesn't exist or is empty, initialize with default data
  if (!db.data) {
    db.data = defaultData;
    await db.write();
  }

  return db;
}
