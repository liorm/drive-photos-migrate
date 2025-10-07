import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getFolderPath } from '@/lib/google-drive';
import {
  isFolderCached,
  getCachedFolderPage,
  syncFolderToCache,
} from '@/lib/drive-cache';
import { getUploadRecords } from '@/lib/uploads-db';
import {
  getCachedFolderSyncStatus,
  calculateFolderSyncStatus,
  clearSyncStatusCacheForFolder,
} from '@/lib/sync-status';
import { getQueuedFileIds } from '@/lib/upload-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { clearFolderFromCache } from '@/lib/db';

const logger = createLogger('api:drive:files');

async function handleGET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get session to retrieve access token
  const session = await auth();

  if (!session?.accessToken || !session?.user?.email) {
    logger.warn('Unauthorized request - No access token', { requestId });
    return NextResponse.json(
      { error: 'Unauthorized - No access token' },
      { status: 401 }
    );
  }

  // Check if token refresh failed
  if (session.error === 'RefreshAccessTokenError') {
    logger.warn('Authentication expired', {
      requestId,
      userEmail: session.user.email,
    });
    return NextResponse.json(
      { error: 'Authentication expired - Please sign in again' },
      { status: 401 }
    );
  }

  const userEmail = session.user.email;

  // Parse query parameters
  const searchParams = request.nextUrl.searchParams;
  const folderId = searchParams.get('folderId') || 'root';
  const refresh = searchParams.get('refresh') === 'true';
  const page = parseInt(searchParams.get('page') || '0', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

  logger.info('Drive files request', {
    requestId,
    userEmail,
    folderId,
    refresh,
    page,
    pageSize,
  });

  // Check if folder is cached and if refresh is requested
  const cached = await isFolderCached(userEmail, folderId);

  logger.info('Cache check result', {
    requestId,
    userEmail,
    folderId,
    cached,
    willSync: !cached || refresh,
  });

  // If not cached or refresh requested, sync from Drive API
  if (!cached || refresh) {
    // Clear cache if refreshing
    if (refresh && cached) {
      logger.info('Refresh requested, clearing cache', {
        requestId,
        userEmail,
        folderId,
      });
      clearFolderFromCache(userEmail, folderId);
      await clearSyncStatusCacheForFolder(userEmail, folderId, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
    }

    // Sync all files from Drive API to cache
    logger.info('Triggering folder sync', {
      requestId,
      userEmail,
      folderId,
    });
    await syncFolderToCache(userEmail, folderId, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  }

  // Get paginated data from cache
  const cachedData = await getCachedFolderPage(
    userEmail,
    folderId,
    page,
    pageSize
  );

  if (!cachedData) {
    logger.error('Failed to retrieve cached data after sync', undefined, {
      requestId,
      userEmail,
      folderId,
    });
    return NextResponse.json(
      { error: 'Failed to retrieve cached data' },
      { status: 500 }
    );
  }

  // Get folder path for breadcrumbs
  const folderPath = await getFolderPath({
    auth: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    },
    folderId,
    userEmail,
  });
  // Get sync status for files and folders
  // For files: bulk check upload status
  const fileIds = cachedData.files.map(f => f.id);
  const uploadRecords = await getUploadRecords(userEmail, fileIds);

  const fileSyncStatuses = new Map();
  for (const [fileId, uploadRecord] of uploadRecords.entries()) {
    fileSyncStatuses.set(fileId, uploadRecord !== null ? 'synced' : 'unsynced');
  }

  // Get queued file IDs
  const queuedFileIds = await getQueuedFileIds(userEmail, fileIds);

  // For folders: try to get cached sync status, calculate if not cached
  const folderSyncStatuses = new Map();
  for (const folder of cachedData.folders) {
    const cached = await getCachedFolderSyncStatus(userEmail, folder.id);
    if (cached) {
      folderSyncStatuses.set(folder.id, cached);
    } else {
      // Calculate in the background to avoid blocking the response
      // Store as 'unknown' for now
      folderSyncStatuses.set(folder.id, {
        status: 'unsynced',
        syncedCount: 0,
        totalCount: 0,
        percentage: 0,
        lastChecked: new Date().toISOString(),
      });
      // Trigger calculation in background (don't await)
      calculateFolderSyncStatus(userEmail, folder.id).catch(error => {
        logger.error('Background folder sync calculation failed', error, {
          userEmail,
          folderId: folder.id,
        });
      });
    }
  }

  logger.info('Request completed successfully', {
    requestId,
    userEmail,
    folderId,
    filesReturned: cachedData.files.length,
    foldersReturned: cachedData.folders.length,
    totalCount: cachedData.totalCount,
    hasMore: cachedData.hasMore,
  });

  return NextResponse.json({
    files: cachedData.files.map(file => ({
      ...file,
      syncStatus: fileSyncStatuses.get(file.id) || 'unsynced',
    })),
    folders: cachedData.folders.map(folder => ({
      ...folder,
      syncStatus: folderSyncStatuses.get(folder.id),
    })),
    totalCount: cachedData.totalCount,
    hasMore: cachedData.hasMore,
    lastSynced: cachedData.lastSynced,
    folderPath,
    queuedFileIds: Array.from(queuedFileIds),
  });
}

export const GET = withErrorHandler(handleGET);
