import fs from 'fs';
import path from 'path';
import { createLogger } from './logger';

const logger = createLogger('temp-file-utils');

// Temp directory for streaming large files
export const TEMP_DIR = path.join(process.cwd(), 'data', 'tmp');

// File size threshold for using temp files (100MB)
export const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;

/**
 * Ensure temp directory exists
 */
export function ensureTempDir(): void {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      logger.info('Creating temp directory', { tempDir: TEMP_DIR });
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  } catch (error) {
    logger.error('Failed to create temp directory', error, {
      tempDir: TEMP_DIR,
    });
    throw error;
  }
}

/**
 * Generate unique temp file path
 */
export function generateTempFilePath(
  userEmail: string,
  driveFileId: string
): string {
  ensureTempDir();

  const timestamp = Date.now();
  const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `${sanitizedEmail}-${driveFileId}-${timestamp}.tmp`;

  return path.join(TEMP_DIR, fileName);
}

/**
 * Delete a specific temp file
 */
export function deleteTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug('Deleted temp file', { filePath });
    }
  } catch (error) {
    logger.warn('Failed to delete temp file', {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Clean all temp files in the temp directory
 * Called on UploadsManager initialization to clean up from previous runs
 */
export function cleanAllTempFiles(): void {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      logger.debug('Temp directory does not exist, nothing to clean');
      return;
    }

    const files = fs.readdirSync(TEMP_DIR);
    let deletedCount = 0;

    for (const file of files) {
      if (file.endsWith('.tmp')) {
        const filePath = path.join(TEMP_DIR, file);
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (error) {
          logger.warn('Failed to delete temp file during cleanup', {
            filePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (deletedCount > 0) {
      logger.info('Cleaned temp files from previous runs', {
        deletedCount,
        tempDir: TEMP_DIR,
      });
    } else {
      logger.debug('No temp files to clean');
    }
  } catch (error) {
    logger.error('Failed to clean temp directory', error, {
      tempDir: TEMP_DIR,
    });
  }
}
