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
  failInProgressAlbumItems,
} from './album-queue-db';
import { listDriveFiles } from './google-drive';
import { GoogleAuthContext } from '@/types/auth';
import {
  createAlbum,
  batchAddMediaItemsToAlbum,
  getAllAlbums,
  getAlbum,
} from './google-photos';
import {
  isFileUploaded,
  getUploadedMediaItemId,
  removeInvalidMediaItems,
} from './uploads-db';
import { getIgnoredFileIds } from './ignored-files-db';
import {
  getCompletedQueueItem,
  getQueueItemByFileId,
  requeueItemsByFileIds,
} from './upload-queue-db';
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
   * Recursively enumerate all files in a folder and its subfolders
   */
  private async enumerateFilesInFolder(
    auth: GoogleAuthContext,
    folderId: string,
    operationId?: string,
    signal?: AbortSignal
  ): Promise<string[]> {
    logger.info('Enumerating files in folder', { folderId });

    // Check if processing has been aborted before starting
    if (signal?.aborted) {
      logger.info('Album processing aborted during file enumeration', {
        folderId,
      });
      throw new Error('Processing stopped by user');
    }

    const fileIds: string[] = [];
    const subfolderIds: string[] = [];
    let pageToken: string | undefined;

    // First pass: collect files and subfolder IDs
    do {
      // Check for abort before each API call
      if (signal?.aborted) {
        logger.info('Album processing aborted during file enumeration', {
          folderId,
        });
        throw new Error('Processing stopped by user');
      }

      const result = await listDriveFiles({
        auth,
        folderId,
        pageToken,
        operationId,
      });

      for (const item of result.files) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          // Collect subfolder for recursive processing
          subfolderIds.push(item.id);
        } else {
          // Add file to result
          fileIds.push(item.id);
        }
      }

      pageToken = result.nextPageToken;
    } while (pageToken);

    logger.info('Files enumerated in current folder', {
      folderId,
      fileCount: fileIds.length,
      subfolderCount: subfolderIds.length,
    });

    // Recursively process subfolders
    for (const subfolderId of subfolderIds) {
      // Check for abort before processing each subfolder
      if (signal?.aborted) {
        logger.info('Album processing aborted during subfolder enumeration', {
          folderId,
          subfolderId,
        });
        throw new Error('Processing stopped by user');
      }

      logger.info('Recursing into subfolder', {
        subfolderId,
        parentFolderId: folderId,
      });

      const subfolderFiles = await this.enumerateFilesInFolder(
        auth,
        subfolderId,
        operationId,
        signal
      );

      fileIds.push(...subfolderFiles);

      logger.info('Subfolder processed', {
        subfolderId,
        filesFound: subfolderFiles.length,
        totalFilesNow: fileIds.length,
      });
    }

    logger.info('Files enumerated successfully (including subfolders)', {
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
            operationId,
            controller.signal
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
    operationId: string,
    signal?: AbortSignal
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
      operationId,
      signal
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

    // Step 7: Check which files are already uploaded or ignored

    const albumItems = await getAlbumItems(albumQueueItem.id);
    const filesToUpload: string[] = [];
    let uploadedCount = 0;
    let ignoredCount = 0;

    // Batch check ignored files for efficiency
    const ignoredFileIds = getIgnoredFileIds(
      userEmail,
      albumItems.map(i => i.driveFileId)
    );

    logger.debug('Checking album items for upload/ignore status', {
      userEmail,
      albumQueueId: albumQueueItem.id,
      totalItems: albumItems.length,
      ignoredFiles: ignoredFileIds.size,
    });

    for (const item of albumItems) {
      // Check if file is ignored FIRST
      if (ignoredFileIds.has(item.driveFileId)) {
        // Mark as FAILED so it doesn't block album creation
        await updateAlbumItem(item.id, {
          status: 'FAILED',
          photosMediaItemId: null,
        });
        ignoredCount++;
        logger.debug('File is ignored, marking as FAILED', {
          userEmail,
          albumQueueId: albumQueueItem.id,
          driveFileId: item.driveFileId,
        });
        continue; // Skip this file
      }

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
        // Not in uploads table - check if it's an orphaned completed queue item
        // (completed but recordUpload was never called)
        const completedQueueItem = await getCompletedQueueItem(
          userEmail,
          item.driveFileId
        );

        if (completedQueueItem) {
          // Orphaned completed item - needs to be re-queued
          logger.info('Found orphaned completed queue item, will re-queue', {
            userEmail,
            albumQueueId: albumQueueItem.id,
            driveFileId: item.driveFileId,
            queueItemId: completedQueueItem.id,
          });
        }

        // Queue for upload (will be re-queued if orphaned, or added fresh if not in queue)
        filesToUpload.push(item.driveFileId);
      }
    }

    // Re-queue any orphaned items (completed/failed but not in uploads table) before adding new ones
    if (filesToUpload.length > 0) {
      const requeuedCount = await requeueItemsByFileIds(
        userEmail,
        filesToUpload
      );

      if (requeuedCount > 0) {
        logger.info('Re-queued orphaned items', {
          userEmail,
          albumQueueId: albumQueueItem.id,
          requeuedCount,
        });
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
      ignoredFiles: ignoredCount,
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
        // Check if processing has been aborted
        if (signal?.aborted) {
          logger.info('Album processing aborted during upload polling', {
            userEmail,
            albumQueueId: albumQueueItem.id,
          });
          throw new Error('Processing stopped by user');
        }

        const pendingItems = await getAlbumItemsByStatus(
          albumQueueItem.id,
          'PENDING'
        );

        // Check the queue status for each pending album item
        let updatedCount = 0;
        let failedCount = 0;
        let stillProcessing = 0;

        for (const item of pendingItems) {
          // First check the queue_items table to see the upload status
          const queueItem = await getQueueItemByFileId(
            userEmail,
            item.driveFileId
          );

          if (!queueItem) {
            // Not in queue - check uploads table directly (might have been uploaded previously)
            const isUploaded = await isFileUploaded(
              userEmail,
              item.driveFileId
            );
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
            continue;
          }

          // Check queue item status
          if (
            queueItem.status === 'pending' ||
            queueItem.status === 'uploading'
          ) {
            // Still being processed, continue waiting
            stillProcessing++;
            continue;
          }

          if (queueItem.status === 'failed') {
            // Upload failed - mark album item as failed
            logger.warn('Queue item upload failed', {
              userEmail,
              albumQueueId: albumQueueItem.id,
              driveFileId: item.driveFileId,
              error: queueItem.error,
            });
            await updateAlbumItem(item.id, {
              status: 'FAILED',
            });
            failedCount++;
            continue;
          }

          if (queueItem.status === 'completed') {
            // Completed - check uploads table for media item ID
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
            } else {
              // Completed but no media item ID - this is the orphaned case
              // The item was already re-queued earlier, so this shouldn't happen
              // but log it for debugging
              logger.warn('Queue item completed but no media item ID found', {
                userEmail,
                albumQueueId: albumQueueItem.id,
                driveFileId: item.driveFileId,
                queueItemId: queueItem.id,
              });
            }
          }
        }

        if (failedCount > 0) {
          logger.warn('Some uploads failed', {
            userEmail,
            albumQueueId: albumQueueItem.id,
            failedCount,
          });
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

    // Filter out invalid media item IDs:
    // - null/undefined
    // - empty strings
    // - whitespace-only strings
    // - suspiciously short IDs (Google Photos IDs are typically 50+ characters)
    // Filter out invalid media item IDs and deduplicate
    const rawMediaItemIds = uploadedItems
      .map(item => item.photosMediaItemId)
      .filter((id): id is string => {
        if (!id || typeof id !== 'string') return false;
        const trimmed = id.trim();
        if (trimmed.length === 0) return false;
        if (trimmed.length < 20) {
          logger.warn('Suspiciously short media item ID filtered out', {
            userEmail,
            albumQueueId: albumQueueItem.id,
            id: trimmed,
            length: trimmed.length,
          });
          return false;
        }
        return true;
      });

    // Deduplicate IDs to prevent 400 Bad Request errors
    const mediaItemIds = Array.from(new Set(rawMediaItemIds));

    if (mediaItemIds.length === 0) {
      logger.warn('No media items to add to album', {
        userEmail,
        albumQueueId: albumQueueItem.id,
      });
    } else {
      // Step 11: Add all media items to the album with retry logic for invalid IDs

      logger.info('Adding media items to album', {
        userEmail,
        albumQueueId: albumQueueItem.id,
        albumId: photosAlbumId,
        itemCount: mediaItemIds.length,
      });

      const MAX_REUPLOAD_ATTEMPTS = 3;
      let attempt = 0;
      let currentMediaItemIds = [...mediaItemIds];
      const allInvalidIds: string[] = [];

      while (attempt < MAX_REUPLOAD_ATTEMPTS) {
        attempt++;

        logger.debug('Batch add attempt', {
          userEmail,
          albumQueueId: albumQueueItem.id,
          attempt,
          itemCount: currentMediaItemIds.length,
        });

        // Try to add media items to album
        const { invalidMediaItemIds } = await retryWithBackoff(
          async () =>
            batchAddMediaItemsToAlbum({
              auth,
              albumId: photosAlbumId,
              mediaItemIds: currentMediaItemIds,
            }),
          {
            maxRetries: 3,
            onRetry: (error, retryAttempt) => {
              logger.warn('Retrying add media items to album', {
                userEmail,
                albumQueueId: albumQueueItem.id,
                attempt,
                retryAttempt,
                error: error.message,
              });
            },
          }
        );

        allInvalidIds.push(...invalidMediaItemIds);

        if (invalidMediaItemIds.length === 0) {
          // All items added successfully
          logger.info('Media items added to album successfully', {
            userEmail,
            albumQueueId: albumQueueItem.id,
            albumId: photosAlbumId,
            itemCount: currentMediaItemIds.length,
          });
          break;
        }

        if (attempt >= MAX_REUPLOAD_ATTEMPTS) {
          logger.error(
            'Max reupload attempts reached, some items remain invalid',
            {
              userEmail,
              albumQueueId: albumQueueItem.id,
              invalidCount: invalidMediaItemIds.length,
              totalAttempts: attempt,
            }
          );
          break;
        }

        // Step 11a: Handle invalid media items - clean up and re-upload

        logger.warn('Found invalid media items, will re-upload', {
          userEmail,
          albumQueueId: albumQueueItem.id,
          invalidCount: invalidMediaItemIds.length,
          attempt,
        });

        // Map invalid media item IDs back to Drive file IDs
        const invalidMediaItemMap = new Map<string, string>();
        for (const item of uploadedItems) {
          if (
            item.photosMediaItemId &&
            invalidMediaItemIds.includes(item.photosMediaItemId)
          ) {
            invalidMediaItemMap.set(item.photosMediaItemId, item.driveFileId);
          }
        }

        // Remove invalid media items from uploads table
        const itemsToCleanup = Array.from(invalidMediaItemMap.entries()).map(
          ([mediaItemId, driveFileId]) => ({
            driveFileId,
            mediaItemId,
          })
        );

        await removeInvalidMediaItems(userEmail, itemsToCleanup);

        // Mark corresponding album_items as PENDING so they can be re-uploaded
        const driveFileIdsToReupload = Array.from(invalidMediaItemMap.values());

        logger.info('Marking album items as PENDING for re-upload', {
          userEmail,
          albumQueueId: albumQueueItem.id,
          count: driveFileIdsToReupload.length,
          attempt,
        });

        for (const driveFileId of driveFileIdsToReupload) {
          const item = uploadedItems.find(i => i.driveFileId === driveFileId);
          if (item) {
            await updateAlbumItem(item.id, {
              photosMediaItemId: null,
              status: 'PENDING',
            });
          }
        }

        // Queue files for re-upload
        logger.info('Queueing files for re-upload', {
          userEmail,
          albumQueueId: albumQueueItem.id,
          fileCount: driveFileIdsToReupload.length,
          attempt,
        });

        await uploadsManager.addToQueue({
          userEmail,
          auth,
          fileIds: driveFileIdsToReupload,
        });

        // Wait for re-uploads to complete
        logger.info('Waiting for re-uploads to complete', {
          userEmail,
          albumQueueId: albumQueueItem.id,
          fileCount: driveFileIdsToReupload.length,
          attempt,
        });

        const reuploadStartTime = Date.now();
        const REUPLOAD_TIMEOUT = 30 * 60 * 1000; // 30 minutes
        const REUPLOAD_POLL_INTERVAL = 5000; // 5 seconds

        while (true) {
          if (Date.now() - reuploadStartTime > REUPLOAD_TIMEOUT) {
            throw new Error(
              `Re-upload timeout after ${REUPLOAD_TIMEOUT / 1000 / 60} minutes`
            );
          }

          // Check if all items have new media item IDs
          let allReuploaded = true;
          const newMediaItemIds: string[] = [];

          for (const driveFileId of driveFileIdsToReupload) {
            const mediaItemId = await getUploadedMediaItemId(
              userEmail,
              driveFileId
            );
            if (mediaItemId) {
              newMediaItemIds.push(mediaItemId);

              // Update album_item with new media item ID
              const item = uploadedItems.find(
                i => i.driveFileId === driveFileId
              );
              if (item) {
                await updateAlbumItem(item.id, {
                  photosMediaItemId: mediaItemId,
                  status: 'UPLOADED',
                });
              }
            } else {
              allReuploaded = false;
            }
          }

          if (allReuploaded) {
            logger.info('All files re-uploaded successfully', {
              userEmail,
              albumQueueId: albumQueueItem.id,
              count: newMediaItemIds.length,
              attempt,
            });
            currentMediaItemIds = newMediaItemIds;
            break;
          }

          // Wait before polling again
          await new Promise(resolve =>
            setTimeout(resolve, REUPLOAD_POLL_INTERVAL)
          );
        }

        // Loop will retry with new media item IDs
      }

      if (allInvalidIds.length > 0) {
        logger.warn(
          'Some media items could not be added to album after retries',
          {
            userEmail,
            albumQueueId: albumQueueItem.id,
            invalidCount: allInvalidIds.length,
            totalAttempts: attempt,
          }
        );
      }
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

    // Mark any in-progress album items as failed so UI reflects the stop
    failInProgressAlbumItems(userEmail, 'Processing stopped by user').catch(
      err => {
        logger.warn('Failed to mark in-progress album items as failed', {
          userEmail,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    );

    // Fail any active album operations for this user
    try {
      const allOps = operationStatusManager.getAllOperations();
      allOps.forEach(op => {
        if (
          op.metadata?.userEmail === userEmail &&
          op.status === 'in_progress'
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
