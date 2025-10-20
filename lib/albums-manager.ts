import {
  addToAlbumQueue as addToAlbumQueueDb,
  getAlbumQueueByStatus,
  updateAlbumQueueItem,
  addAlbumItems,
  getAlbumItems,
  updateAlbumItem,
  getAlbumItemsByStatus,
  upsertFolderAlbumMapping,
  getFolderAlbumMapping,
  removeDuplicateAlbumItems,
} from './album-queue-db';
import { listDriveFiles } from './google-drive';
import { GoogleAuthContext } from '@/types/auth';
import {
  createAlbum,
  batchAddMediaItemsToAlbum,
  getAllAlbums,
  getAlbum,
} from './google-photos';
import { isFileUploaded, getUploadedMediaItemId } from './uploads-db';
import { createLogger } from './logger';
import operationStatusManager, { OperationType } from './operation-status';
import { retryWithBackoff } from './retry';
import { AlbumQueueItem, FolderAlbumMapping } from '@/types/album-queue';
import uploadsManager from './uploads-manager';

const logger = createLogger('albums-manager');

/**
 * Centralized manager for album creation queue operations
 * Singleton pattern ensures consistent state across API routes
 */
class AlbumsManager {
  // Track active processing per user to prevent concurrent processing
  private activeProcessing = new Set<string>();

  // Per-user AbortControllers for in-flight work so we can cancel operations
  private activeControllers = new Map<string, AbortController>();

  private static instance: AlbumsManager | undefined;
  private initialized = false;

  private constructor() {
    logger.info('AlbumsManager singleton created');
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): AlbumsManager {
    if (!AlbumsManager.instance) {
      logger.info('Creating new AlbumsManager singleton');
      AlbumsManager.instance = new AlbumsManager();
    }
    return AlbumsManager.instance;
  }

  /**
   * Initialize the manager
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing AlbumsManager');
    this.initialized = true;
  }

  /**
   * Add a folder to the album creation queue
   */
  async addToQueue({
    userEmail,
    auth: _auth,
    driveFolderId,
    folderName,
  }: {
    userEmail: string;
    auth: GoogleAuthContext;
    driveFolderId: string;
    folderName: string;
  }): Promise<AlbumQueueItem> {
    await this.initialize();

    logger.info('Adding folder to album queue', {
      userEmail,
      driveFolderId,
      folderName,
    });

    try {
      // Add to database
      const queueItem = await addToAlbumQueueDb(
        userEmail,
        driveFolderId,
        folderName
      );

      logger.info('Folder added to album queue successfully', {
        userEmail,
        albumQueueId: queueItem.id,
        driveFolderId,
      });

      return queueItem;
    } catch (error) {
      logger.error('Error adding folder to album queue', error, {
        userEmail,
        driveFolderId,
      });
      throw error;
    }
  }

  /**
   * Lazy discovery: Check if an album with matching name exists in Google Photos
   *
   * NOTE: With appendonly scope, this only returns albums created by this app.
   * This is perfect for our use case - we want to detect if we already created
   * an album for this Drive folder, not search the user's entire library.
   */
  private async discoverExistingAlbum(
    auth: GoogleAuthContext,
    folderName: string
  ): Promise<{ id: string; productUrl: string } | null> {
    logger.info('Searching for app-created album by name', { folderName });

    try {
      const albums = await getAllAlbums(auth);
      const matchingAlbum = albums.find(album => album.title === folderName);

      if (matchingAlbum) {
        logger.info('Found existing app-created album with matching name', {
          folderName,
          albumId: matchingAlbum.id,
        });
        return {
          id: matchingAlbum.id,
          productUrl: matchingAlbum.productUrl,
        };
      }

      logger.info('No existing app-created album found with matching name', {
        folderName,
      });
      return null;
    } catch (error) {
      logger.warn(
        'Could not discover existing album via API, will check DB only',
        {
          folderName,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      // Don't fail the whole process if API discovery fails
      // DB-based discovery will still work
      return null;
    }
  }

  /**
   * Recursively enumerate all files in a folder
   */
  private async enumerateFilesInFolder(
    auth: GoogleAuthContext,
    folderId: string,
    operationId?: string
  ): Promise<string[]> {
    logger.info('Enumerating files in folder', { folderId });

    const fileIds: string[] = [];
    let pageToken: string | undefined;

    do {
      const result = await listDriveFiles({
        auth,
        folderId,
        pageToken,
        operationId,
      });

      // Add files (not folders) to the list
      for (const item of result.files) {
        if (item.mimeType !== 'application/vnd.google-apps.folder') {
          fileIds.push(item.id);
        }
      }

      pageToken = result.nextPageToken;
    } while (pageToken);

    logger.info('Files enumerated successfully', {
      folderId,
      fileCount: fileIds.length,
    });

    return fileIds;
  }

  /**
   * Start processing the album queue for a user
   */
  async startProcessing(
    userEmail: string,
    auth: GoogleAuthContext
  ): Promise<void> {
    await this.initialize();

    // Check if already processing for this user
    if (this.activeProcessing.has(userEmail)) {
      logger.info('Album queue already being processed for user, skipping', {
        userEmail,
      });
      return;
    }

    // Mark as processing
    this.activeProcessing.add(userEmail);

    try {
      logger.info('Starting album queue processing', { userEmail });

      // Get pending items
      const pendingItems = await getAlbumQueueByStatus(userEmail, 'PENDING');

      if (pendingItems.length === 0) {
        logger.info('No pending album items in queue', { userEmail });
        return;
      }

      logger.info('Processing album queue items', {
        userEmail,
        itemCount: pendingItems.length,
      });

      // Create an operation to track overall progress
      const operationId = operationStatusManager.createOperation(
        OperationType.LONG_WRITE,
        'Creating Albums',
        {
          description: `Creating ${pendingItems.length} album(s)`,
          total: pendingItems.length,
          metadata: { userEmail },
        }
      );

      operationStatusManager.startOperation(operationId);

      let successCount = 0;
      let failureCount = 0;

      // Create an AbortController for this run so we can cancel
      const controller = new AbortController();
      this.activeControllers.set(userEmail, controller);

      // Process each album sequentially
      for (let i = 0; i < pendingItems.length; i++) {
        if (controller.signal.aborted) {
          logger.info('Album processing aborted', { userEmail });
          break;
        }

        const albumQueueItem = pendingItems[i];

        try {
          await this.processAlbumQueueItem(
            userEmail,
            auth,
            albumQueueItem,
            operationId
          );

          successCount++;

          logger.info('Album queue item processed successfully', {
            userEmail,
            albumQueueId: albumQueueItem.id,
            folderName: albumQueueItem.folderName,
          });
        } catch (error) {
          failureCount++;

          const errorMessage =
            error instanceof Error ? error.message : String(error);

          logger.error('Error processing album queue item', error, {
            userEmail,
            albumQueueId: albumQueueItem.id,
            folderName: albumQueueItem.folderName,
          });

          // Update item status to failed
          await updateAlbumQueueItem(userEmail, albumQueueItem.id, {
            status: 'FAILED',
            completedAt: new Date().toISOString(),
            error: errorMessage,
          });
        }

        // Update operation progress
        operationStatusManager.updateProgress(
          operationId,
          i + 1,
          pendingItems.length
        );
      }

      // Complete the operation
      operationStatusManager.completeOperation(operationId, {
        successCount,
        failureCount,
        totalItems: pendingItems.length,
      });

      logger.info('Album queue processing completed', {
        userEmail,
        totalItems: pendingItems.length,
        successCount,
        failureCount,
      });
    } catch (error) {
      logger.error('Error processing album queue', error, { userEmail });
      throw error;
    } finally {
      // Mark as not processing
      this.activeProcessing.delete(userEmail);
      // Remove and abort any active controller for this user
      const controller = this.activeControllers.get(userEmail);
      if (controller) {
        try {
          controller.abort();
        } catch {
          // ignore
        }
        this.activeControllers.delete(userEmail);
      }
    }
  }

  /**
   * Process a single album queue item
   */
  private async processAlbumQueueItem(
    userEmail: string,
    auth: GoogleAuthContext,
    albumQueueItem: AlbumQueueItem,
    operationId: string
  ): Promise<void> {
    logger.info('Processing album queue item', {
      userEmail,
      albumQueueId: albumQueueItem.id,
      folderName: albumQueueItem.folderName,
    });

    // Step 1: Check for existing album mapping in DB
    let existingMapping = await getFolderAlbumMapping(
      userEmail,
      albumQueueItem.driveFolderId
    );

    // Step 2: If no mapping in DB, try lazy discovery via Google Photos API
    if (!existingMapping || existingMapping.albumDeleted) {
      const discoveredAlbum = await this.discoverExistingAlbum(
        auth,
        albumQueueItem.folderName
      );

      if (discoveredAlbum) {
        // Verify album still exists
        const albumDetails = await getAlbum({
          auth,
          albumId: discoveredAlbum.id,
        });

        if (albumDetails) {
          // Store discovered mapping in DB
          existingMapping = await upsertFolderAlbumMapping({
            userEmail,
            driveFolderId: albumQueueItem.driveFolderId,
            folderName: albumQueueItem.folderName,
            photosAlbumId: discoveredAlbum.id,
            photosAlbumUrl: discoveredAlbum.productUrl,
            lastUpdatedAt: null,
            totalItemsInAlbum: parseInt(
              albumDetails.mediaItemsCount || '0',
              10
            ),
            discoveredViaApi: true,
            albumDeleted: false,
          });

          logger.info('Discovered and stored existing album mapping', {
            userEmail,
            driveFolderId: albumQueueItem.driveFolderId,
            albumId: discoveredAlbum.id,
          });
        }
      }
    }

    // Step 3: Determine mode (CREATE or UPDATE)
    const mode =
      existingMapping && !existingMapping.albumDeleted ? 'UPDATE' : 'CREATE';

    await updateAlbumQueueItem(userEmail, albumQueueItem.id, {
      status: 'UPLOADING',
      mode,
      startedAt: new Date().toISOString(),
    });

    logger.info('Album mode determined', {
      userEmail,
      albumQueueId: albumQueueItem.id,
      mode,
    });

    // Step 4: Enumerate all files in the folder

    const fileIds = await this.enumerateFilesInFolder(
      auth,
      albumQueueItem.driveFolderId,
      operationId
    );

    await updateAlbumQueueItem(userEmail, albumQueueItem.id, {
      totalFiles: fileIds.length,
    });

    // Step 5: Create album_items records for all files (if not already created)
    const existingAlbumItems = await getAlbumItems(albumQueueItem.id);

    if (existingAlbumItems.length === 0) {
      // First time processing - create album items
      await addAlbumItems(albumQueueItem.id, fileIds);
      logger.info('Album items added to database', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        fileCount: fileIds.length,
      });
    } else {
      logger.info('Album items already exist (retry), skipping creation', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        existingCount: existingAlbumItems.length,
      });
    }

    // Step 6: Clean up any duplicate album_items from previous failed attempts
    const removedDuplicates = await removeDuplicateAlbumItems(
      albumQueueItem.id
    );
    if (removedDuplicates > 0) {
      logger.info('Cleaned up duplicate album items from previous retries', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        removed: removedDuplicates,
      });
    }

    // Step 7: Check which files are already uploaded

    const albumItems = await getAlbumItems(albumQueueItem.id);
    const filesToUpload: string[] = [];
    let uploadedCount = 0;

    for (const item of albumItems) {
      const isUploaded = await isFileUploaded(userEmail, item.driveFileId);

      if (isUploaded) {
        // Get the media item ID from uploads table
        const mediaItemId = await getUploadedMediaItemId(
          userEmail,
          item.driveFileId
        );

        if (mediaItemId) {
          // Mark as uploaded in album_items
          await updateAlbumItem(item.id, {
            photosMediaItemId: mediaItemId,
            status: 'UPLOADED',
          });
          uploadedCount++;
        } else {
          // File is marked as uploaded but no media item ID found
          // Queue for upload
          filesToUpload.push(item.driveFileId);
        }
      } else {
        // Not uploaded, queue for upload
        filesToUpload.push(item.driveFileId);
      }
    }

    await updateAlbumQueueItem(userEmail, albumQueueItem.id, {
      uploadedFiles: uploadedCount,
    });

    logger.info('Upload status checked', {
      userEmail,
      albumQueueId: albumQueueItem.id,
      totalFiles: fileIds.length,
      alreadyUploaded: uploadedCount,
      needsUpload: filesToUpload.length,
    });

    // Step 8: Add non-uploaded files to UploadsManager queue and start processing
    if (filesToUpload.length > 0) {
      logger.info('Adding files to upload queue', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        fileCount: filesToUpload.length,
      });

      await uploadsManager.addToQueue({
        userEmail,
        auth,
        fileIds: filesToUpload,
      });

      // Start upload processing to actually process the queued files
      logger.info('Starting upload processing for queued files', {
        userEmail,
        albumQueueId: albumQueueItem.id,
      });

      // Start processing in the background (don't await - let it run concurrently)
      uploadsManager.startProcessing(userEmail, auth).catch(error => {
        logger.error('Error in background upload processing', error, {
          userEmail,
          albumQueueId: albumQueueItem.id,
        });
      });
    }

    // Step 9: Wait for all files to be uploaded
    if (filesToUpload.length > 0) {
      logger.info('Waiting for files to be uploaded', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        fileCount: filesToUpload.length,
      });

      // Poll until all files are uploaded
      let pollCount = 0;
      const maxPolls = 600; // 10 minutes at 1 second intervals
      const pollInterval = 1000; // 1 second

      while (pollCount < maxPolls) {
        const pendingItems = await getAlbumItemsByStatus(
          albumQueueItem.id,
          'PENDING'
        );

        // Check if any of the pending items have been uploaded
        let updatedCount = 0;
        for (const item of pendingItems) {
          const isUploaded = await isFileUploaded(userEmail, item.driveFileId);
          if (isUploaded) {
            const mediaItemId = await getUploadedMediaItemId(
              userEmail,
              item.driveFileId
            );
            if (mediaItemId) {
              await updateAlbumItem(item.id, {
                photosMediaItemId: mediaItemId,
                status: 'UPLOADED',
              });
              updatedCount++;
            }
          }
        }

        if (updatedCount > 0) {
          uploadedCount += updatedCount;
          await updateAlbumQueueItem(userEmail, albumQueueItem.id, {
            uploadedFiles: uploadedCount,
          });

          logger.debug('Upload progress updated', {
            userEmail,
            albumQueueId: albumQueueItem.id,
            uploadedFiles: uploadedCount,
            totalFiles: fileIds.length,
          });
        }

        // Check if all files are uploaded
        const remainingPending = await getAlbumItemsByStatus(
          albumQueueItem.id,
          'PENDING'
        );

        if (remainingPending.length === 0) {
          logger.info('All files uploaded successfully', {
            userEmail,
            albumQueueId: albumQueueItem.id,
          });
          break;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;
      }

      // Check for timeout
      const finalPending = await getAlbumItemsByStatus(
        albumQueueItem.id,
        'PENDING'
      );
      if (finalPending.length > 0) {
        throw new Error(
          `Timeout waiting for ${finalPending.length} file(s) to be uploaded`
        );
      }
    }

    // Step 10: Create or update album
    await updateAlbumQueueItem(userEmail, albumQueueItem.id, {
      status: mode === 'CREATE' ? 'CREATING' : 'UPDATING',
    });

    let photosAlbumId: string;
    let photosAlbumUrl: string;

    if (mode === 'CREATE') {
      logger.info('Creating album in Google Photos', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        folderName: albumQueueItem.folderName,
      });

      const album = await retryWithBackoff(
        async () => createAlbum({ auth, title: albumQueueItem.folderName }),
        {
          maxRetries: 3,
          onRetry: (error, attempt) => {
            logger.warn('Retrying album creation', {
              userEmail,
              albumQueueId: albumQueueItem.id,
              attempt,
              error: error.message,
            });
          },
        }
      );

      photosAlbumId = album.id;
      photosAlbumUrl = album.productUrl;

      logger.info('Album created successfully', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        albumId: photosAlbumId,
      });
    } else {
      // UPDATE mode - use existing album
      if (!existingMapping) {
        throw new Error('Existing mapping not found for UPDATE mode');
      }

      photosAlbumId = existingMapping.photosAlbumId;
      photosAlbumUrl = existingMapping.photosAlbumUrl;

      logger.info('Using existing album', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        albumId: photosAlbumId,
      });
    }

    // Step 10: Get all uploaded media item IDs
    const uploadedItems = await getAlbumItemsByStatus(
      albumQueueItem.id,
      'UPLOADED'
    );

    const mediaItemIds = uploadedItems
      .map(item => item.photosMediaItemId)
      .filter((id): id is string => id !== null);

    if (mediaItemIds.length === 0) {
      logger.warn('No media items to add to album', {
        userEmail,
        albumQueueId: albumQueueItem.id,
      });
    } else {
      // Step 11: Add all media items to the album

      logger.info('Adding media items to album', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        albumId: photosAlbumId,
        itemCount: mediaItemIds.length,
      });

      await retryWithBackoff(
        async () =>
          batchAddMediaItemsToAlbum({
            auth,
            albumId: photosAlbumId,
            mediaItemIds,
          }),
        {
          maxRetries: 3,
          onRetry: (error, attempt) => {
            logger.warn('Retrying add media items to album', {
              userEmail,
              albumQueueId: albumQueueItem.id,
              attempt,
              error: error.message,
            });
          },
        }
      );

      logger.info('Media items added to album successfully', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        albumId: photosAlbumId,
        itemCount: mediaItemIds.length,
      });
    }

    // Step 12: Update album queue item and folder-album mapping
    await updateAlbumQueueItem(userEmail, albumQueueItem.id, {
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      photosAlbumId,
      photosAlbumUrl,
    });

    await upsertFolderAlbumMapping({
      userEmail,
      driveFolderId: albumQueueItem.driveFolderId,
      folderName: albumQueueItem.folderName,
      photosAlbumId,
      photosAlbumUrl,
      lastUpdatedAt: new Date().toISOString(),
      totalItemsInAlbum: mediaItemIds.length,
      discoveredViaApi: false,
      albumDeleted: false,
    });

    logger.info('Album queue item completed successfully', {
      userEmail,
      albumQueueId: albumQueueItem.id,
      albumId: photosAlbumId,
      totalItems: mediaItemIds.length,
    });
  }

  /**
   * Stop processing the album queue for a user
   */
  stopProcessing(userEmail: string): void {
    logger.info('Stop album processing requested', { userEmail });

    // If there's an in-flight controller for this user, abort
    const controller = this.activeControllers.get(userEmail);
    if (controller) {
      logger.info(
        'Aborting in-flight album processing for user due to stop request',
        {
          userEmail,
        }
      );
      try {
        controller.abort();
      } catch (e) {
        logger.warn('Error aborting controller', { userEmail, error: e });
      }
    }

    // Fail any active album operations for this user
    try {
      const allOps = operationStatusManager.getAllOperations();
      allOps.forEach(op => {
        if (
          op.metadata?.userEmail === userEmail &&
          op.status === 'in_progress' &&
          op.type === OperationType.LONG_WRITE
        ) {
          operationStatusManager.failOperation(op.id, 'Stopped by user');
        }
      });
    } catch (err) {
      logger.warn('Failed to update operation status for stop request', {
        userEmail,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Discover album for a folder (for lazy discovery API endpoint)
   */
  async discoverAlbumForFolder(
    userEmail: string,
    auth: GoogleAuthContext,
    driveFolderId: string,
    folderName: string
  ): Promise<FolderAlbumMapping | null> {
    logger.info('Discovering album for folder', {
      userEmail,
      driveFolderId,
      folderName,
    });

    // Check DB first
    const existingMapping = await getFolderAlbumMapping(
      userEmail,
      driveFolderId
    );

    if (existingMapping && !existingMapping.albumDeleted) {
      logger.info('Found existing mapping in DB', {
        userEmail,
        driveFolderId,
        albumId: existingMapping.photosAlbumId,
      });
      return existingMapping;
    }

    // Try API discovery
    const discoveredAlbum = await this.discoverExistingAlbum(auth, folderName);

    if (discoveredAlbum) {
      // Verify album still exists
      const albumDetails = await getAlbum({
        auth,
        albumId: discoveredAlbum.id,
      });

      if (albumDetails) {
        // Store discovered mapping
        const mapping = await upsertFolderAlbumMapping({
          userEmail,
          driveFolderId,
          folderName,
          photosAlbumId: discoveredAlbum.id,
          photosAlbumUrl: discoveredAlbum.productUrl,
          lastUpdatedAt: null,
          totalItemsInAlbum: parseInt(albumDetails.mediaItemsCount || '0', 10),
          discoveredViaApi: true,
          albumDeleted: false,
        });

        logger.info('Discovered and stored album mapping', {
          userEmail,
          driveFolderId,
          albumId: discoveredAlbum.id,
        });

        return mapping;
      }
    }

    logger.info('No album found for folder', {
      userEmail,
      driveFolderId,
      folderName,
    });

    return null;
  }
}

// Export the singleton instance
const albumsManager = AlbumsManager.getInstance();

export default albumsManager;
