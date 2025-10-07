import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { getCacheStats, getLargestCachedFiles, getCacheGrowthStats } from './cache-db';
import * as sqliteDb from './sqlite-db';
import { runMigrations } from './migration';

// Mock the logger to prevent console noise
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const userEmail = 'test@example.com';
let db: Database.Database;

// Spy on the original getDatabase and closeDatabase functions
const getDatabaseSpy = vi.spyOn(sqliteDb, 'getDatabase');

describe('Cache DB functions', () => {
  beforeEach(() => {
    // Use an in-memory SQLite database for testing
    db = new Database(':memory:');

    // Mock getDatabase to return the in-memory instance
    getDatabaseSpy.mockReturnValue(db);

    // Manually run schema initialization and migrations on the in-memory db
    const schema = `
      CREATE TABLE cached_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        last_synced TEXT NOT NULL,
        total_count INTEGER NOT NULL
      );
      CREATE TABLE cached_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cached_folder_id INTEGER NOT NULL,
        file_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size TEXT,
        FOREIGN KEY (cached_folder_id) REFERENCES cached_folders(id) ON DELETE CASCADE
      );
      CREATE TABLE cached_subfolders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cached_folder_id INTEGER NOT NULL,
        folder_id TEXT NOT NULL,
        FOREIGN KEY (cached_folder_id) REFERENCES cached_folders(id) ON DELETE CASCADE
      );
    `;
    db.exec(schema);
    runMigrations(db); // Ensure migrations run on the test DB

    // Seed the database
    const insertFolder = db.prepare(
      "INSERT INTO cached_folders (user_email, folder_id, last_synced, total_count) VALUES (?, ?, ?, ?)"
    );
    const folder1Id = insertFolder.run(userEmail, 'folder1', new Date().toISOString(), 10).lastInsertRowid;

    const insertFile = db.prepare(
      "INSERT INTO cached_files (cached_folder_id, file_id, name, mime_type, size) VALUES (?, ?, ?, ?, ?)"
    );
    insertFile.run(folder1Id, 'file1', 'image.jpg', 'image/jpeg', '1024');
    insertFile.run(folder1Id, 'file2', 'video.mp4', 'video/mp4', '4096');
    insertFile.run(folder1Id, 'file3', 'doc.pdf', 'application/pdf', '512');
    insertFile.run(folder1Id, 'file4', 'archive.zip', 'application/zip', '2048');

    const insertSubfolder = db.prepare("INSERT INTO cached_subfolders (cached_folder_id, folder_id) VALUES (?, ?)");
    insertSubfolder.run(folder1Id, 'subfolder1');
  });

  afterEach(() => {
    db.close();
  });

  describe('getCacheStats', () => {
    it('should return correct statistics for a user', async () => {
      const stats = await getCacheStats(userEmail);

      expect(stats.cachedFolders).toBe(1);
      expect(stats.cachedFiles).toBe(4);
      expect(stats.cachedSubfolders).toBe(1);
      expect(stats.totalCacheSize).toBe(1024 + 4096 + 512 + 2048);
      expect(stats.averageFileSize).toBe((1024 + 4096 + 512 + 2048) / 4);
      expect(stats.fileTypeBreakdown.images).toBe(1);
      expect(stats.fileTypeBreakdown.videos).toBe(1);
      expect(stats.fileTypeBreakdown.documents).toBe(1);
      expect(stats.fileTypeBreakdown.other).toBe(1);
    });
  });

  describe('getLargestCachedFiles', () => {
    it('should return the largest files in descending order', async () => {
      const files = await getLargestCachedFiles(userEmail, 2);

      expect(files.length).toBe(2);
      expect(files[0].fileName).toBe('video.mp4');
      expect(files[0].size).toBe(4096);
      expect(files[1].fileName).toBe('archive.zip');
      expect(files[1].size).toBe(2048);
    });
  });

  describe('getCacheGrowthStats', () => {
    it('should return correct growth stats for today', async () => {
      const stats = await getCacheGrowthStats(userEmail);

      expect(stats.foldersAddedToday).toBe(1);
      expect(stats.filesAddedToday).toBe(4);
      expect(stats.sizeAddedToday).toBe(7680);
    });

    it('should return zero growth stats if no data was added today', async () => {
        // Insert data for a different user
        const otherUser = 'other@example.com';
        const insertFolder = db.prepare(
          "INSERT INTO cached_folders (user_email, folder_id, last_synced, total_count) VALUES (?, ?, ?, ?)"
        );
        const folderId = insertFolder.run(otherUser, 'folder2', '2024-01-01T00:00:00.000Z', 1).lastInsertRowid;
        const insertFile = db.prepare(
            "INSERT INTO cached_files (cached_folder_id, file_id, name, mime_type, size) VALUES (?, ?, ?, ?, ?)"
        );
        insertFile.run(folderId, 'file5', 'old.txt', 'text/plain', '100');

        const stats = await getCacheGrowthStats(otherUser);
        expect(stats.foldersAddedToday).toBe(0);
        expect(stats.filesAddedToday).toBe(0);
        expect(stats.sizeAddedToday).toBe(0);
    });
  });
});