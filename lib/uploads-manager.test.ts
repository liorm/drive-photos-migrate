import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import uploadsManager from './uploads-manager';
import { GoogleAuthContext } from '@/types/auth';
import { QueueItem } from '@/types/upload-queue';

// Mock dependencies
vi.mock('./upload-queue-db', () => ({
  addToQueue: vi.fn(),
  getQueueByStatus: vi.fn(),
  updateQueueItem: vi.fn(),
  getCachedFileMetadata: vi.fn(),
  failUploadingItems: vi.fn().mockResolvedValue(undefined),
  resetStuckUploadingItems: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./db', () => ({
  getFileMetadataFromDriveCache: vi.fn(),
}));
vi.mock('./google-drive', () => ({
  getDriveFile: vi.fn(),
}));
vi.mock('./google-photos', () => ({
  downloadDriveFile: vi.fn(),
  batchCreateMediaItems: vi.fn(),
}));
vi.mock('./uploads-db', () => ({
  recordUpload: vi.fn(),
}));
vi.mock('./sync-status', () => ({
  clearFileSyncStatusCache: vi.fn(),
}));
vi.mock('./operation-status', () => ({
  default: {
    createOperation: vi.fn().mockReturnValue('op-123'),
    startOperation: vi.fn(),
    updateProgress: vi.fn(),
    completeOperation: vi.fn(),
    failOperation: vi.fn(),
    retryOperation: vi.fn(),
    getAllOperations: vi.fn().mockReturnValue([]),
  },
  OperationType: {
    LONG_WRITE: 'LONG_WRITE',
  },
}));
vi.mock('./retry', () => ({
  retryWithBackoff: vi.fn(fn => fn()),
  fetchWithRetry: vi.fn(),
}));
vi.mock('./backoff-controller', () => ({
  default: {
    waitWhilePaused: vi.fn(),
    pauseUserBackoff: vi.fn(),
  },
}));
vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import mocked modules after vi.mock calls
const uploadQueueDb = await import('./upload-queue-db');
const db = await import('./db');
const googleDrive = await import('./google-drive');
const googlePhotos = await import('./google-photos');
const uploadsDb = await import('./uploads-db');
const operationStatus = (await import('./operation-status')).default;

const userEmail = 'test@example.com';
const auth: GoogleAuthContext = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  async refresh() {
    // Mock refresh implementation
  },
};

describe('UploadsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the singleton's internal state
    uploadsManager['activeProcessing'].clear();
    uploadsManager['activeControllers'].clear();
    uploadsManager['initialized'] = false;
  });

  describe('addToQueue', () => {
    it('should add a file from Drive API if not in cache', async () => {
      vi.mocked(db.getFileMetadataFromDriveCache).mockReturnValue(null);
      vi.mocked(uploadQueueDb.getCachedFileMetadata).mockResolvedValue(null);
      vi.mocked(googleDrive.getDriveFile).mockResolvedValue({
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        size: '1024',
      });
      vi.mocked(uploadQueueDb.addToQueue).mockResolvedValue({
        added: [
          {
            id: 'queue-123',
            driveFileId: 'file1',
            fileName: 'test.jpg',
            mimeType: 'image/jpeg',
            status: 'pending',
            addedAt: new Date().toISOString(),
          },
        ],
        skipped: [],
      });

      const result = await uploadsManager.addToQueue({
        userEmail,
        auth,
        fileIds: ['file1'],
      });

      expect(googleDrive.getDriveFile).toHaveBeenCalledWith({
        auth,
        fileId: 'file1',
      });
      expect(uploadQueueDb.addToQueue).toHaveBeenCalledWith(userEmail, [
        {
          driveFileId: 'file1',
          fileName: 'test.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
        },
      ]);
      expect(result.added.length).toBe(1);
      expect(result.skipped.length).toBe(0);
    });

    it('should use Drive cache if available', async () => {
      vi.mocked(db.getFileMetadataFromDriveCache).mockReturnValue({
        fileName: 'cached.jpg',
        mimeType: 'image/jpeg',
        fileSize: 2048,
      });
      vi.mocked(uploadQueueDb.addToQueue).mockResolvedValue({
        added: [
          {
            id: 'queue-456',
            driveFileId: 'file2',
            fileName: 'cached.jpg',
            mimeType: 'image/jpeg',
            status: 'pending',
            addedAt: new Date().toISOString(),
          },
        ],
        skipped: [],
      });

      await uploadsManager.addToQueue({
        userEmail,
        auth,
        fileIds: ['file2'],
      });

      expect(db.getFileMetadataFromDriveCache).toHaveBeenCalledWith(
        userEmail,
        'file2'
      );
      expect(googleDrive.getDriveFile).not.toHaveBeenCalled();
      expect(uploadQueueDb.addToQueue).toHaveBeenCalledWith(userEmail, [
        {
          driveFileId: 'file2',
          fileName: 'cached.jpg',
          mimeType: 'image/jpeg',
          fileSize: 2048,
        },
      ]);
    });

    it('should skip files with incomplete metadata from Drive', async () => {
      vi.mocked(db.getFileMetadataFromDriveCache).mockReturnValue(null);
      vi.mocked(uploadQueueDb.getCachedFileMetadata).mockResolvedValue(null);
      vi.mocked(googleDrive.getDriveFile).mockResolvedValue({
        // name is missing
        mimeType: 'image/jpeg',
      });

      const result = await uploadsManager.addToQueue({
        userEmail,
        auth,
        fileIds: ['file3'],
      });

      expect(result.added.length).toBe(0);
      expect(result.skipped.length).toBe(1);
      expect(result.skipped[0].reason).toBe('Incomplete metadata');
      expect(uploadQueueDb.addToQueue).not.toHaveBeenCalled();
    });
  });

  describe('startProcessing', () => {
    it('should process a single pending item successfully', async () => {
      const pendingItem: QueueItem = {
        id: 'queue-1',
        driveFileId: 'file1',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        status: 'pending',
        fileSize: 1024,
        addedAt: new Date().toISOString(),
      };
      vi.mocked(uploadQueueDb.getQueueByStatus).mockResolvedValue([pendingItem]);
      vi.mocked(googlePhotos.downloadDriveFile).mockResolvedValue(
        Buffer.from('test data')
      );
      // This is a private method, so we need to mock the public method that calls it
      const uploadBytesSpy = vi
        .spyOn(uploadsManager as any, 'uploadBytes')
        .mockResolvedValue('upload-token-123');

      vi.mocked(googlePhotos.batchCreateMediaItems).mockResolvedValue([
        { success: true, mediaItemId: 'photo-123', fileName: 'test.jpg' },
      ]);

      await uploadsManager.startProcessing(userEmail, auth);

      expect(uploadQueueDb.getQueueByStatus).toHaveBeenCalledWith(
        userEmail,
        'pending'
      );
      expect(googlePhotos.downloadDriveFile).toHaveBeenCalled();
      expect(uploadBytesSpy).toHaveBeenCalled();
      expect(googlePhotos.batchCreateMediaItems).toHaveBeenCalledWith({
        auth,
        items: [{ uploadToken: 'upload-token-123', fileName: 'test.jpg' }],
        operationId: 'op-123',
      });
      expect(uploadsDb.recordUpload).toHaveBeenCalledWith(
        userEmail,
        'file1',
        'photo-123',
        'test.jpg',
        'image/jpeg',
        1024
      );
      expect(uploadQueueDb.updateQueueItem).toHaveBeenCalledWith(
        userEmail,
        'queue-1',
        expect.objectContaining({ status: 'completed' })
      );
      expect(operationStatus.completeOperation).toHaveBeenCalled();
    });

    it('should handle processing failure for an item', async () => {
      const pendingItem: QueueItem = {
        id: 'queue-2',
        driveFileId: 'file1',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        status: 'pending',
        fileSize: 1024,
        addedAt: new Date().toISOString(),
      };
      vi.mocked(uploadQueueDb.getQueueByStatus).mockResolvedValue([pendingItem]);
      vi.mocked(googlePhotos.downloadDriveFile).mockRejectedValue(
        new Error('Download failed')
      );

      await uploadsManager.startProcessing(userEmail, auth);

      expect(uploadQueueDb.updateQueueItem).toHaveBeenCalledWith(
        userEmail,
        'queue-2',
        expect.objectContaining({
          status: 'failed',
          error: 'Download failed',
        })
      );
      expect(operationStatus.completeOperation).toHaveBeenCalledWith(
        'op-123',
        expect.objectContaining({ failureCount: 1, successCount: 0 })
      );
    });

    it('should not process if another process is active', async () => {
      uploadsManager['activeProcessing'].add(userEmail);

      await uploadsManager.startProcessing(userEmail, auth);

      expect(uploadQueueDb.getQueueByStatus).not.toHaveBeenCalled();
    });
  });

  describe('stopProcessing', () => {
    it('should abort the active controller and fail uploading items', () => {
      const abortSpy = vi.fn();
      const mockController = {
        abort: abortSpy,
        signal: { aborted: false },
      } as unknown as AbortController;

      uploadsManager['activeControllers'].set(userEmail, mockController);

      uploadsManager.stopProcessing(userEmail);

      expect(abortSpy).toHaveBeenCalled();
      expect(uploadQueueDb.failUploadingItems).toHaveBeenCalledWith(
        userEmail,
        'Processing stopped by user'
      );
    });
  });
});