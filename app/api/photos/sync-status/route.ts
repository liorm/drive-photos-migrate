import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getCachedFolderSyncStatus,
  calculateFolderSyncStatus,
  recursivelyRefreshFolderSyncStatus,
} from '@/lib/sync-status';
import { getUploadRecords } from '@/lib/uploads-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:photos:sync-status');

async function handleGET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  // Parse query parameters
  const searchParams = request.nextUrl.searchParams;
  const folderId = searchParams.get('folderId');
  const fileIds = searchParams.get('fileIds'); // Comma-separated file IDs
  const forceRecalculate = searchParams.get('forceRecalculate') === 'true';
  const recursive = searchParams.get('recursive') !== 'false'; // Default true
  const recursiveRefresh = searchParams.get('recursiveRefresh') === 'true'; // Force recursive refresh with details

  logger.info('Sync status request', {
    requestId,
    userEmail,
    folderId,
    fileIds: fileIds ? fileIds.split(',').length : 0,
    forceRecalculate,
    recursive,
    recursiveRefresh,
  });

  // Handle folder sync status request
  if (folderId) {
    logger.debug('Getting folder sync status', {
      requestId,
      userEmail,
      folderId,
      recursive,
      recursiveRefresh,
    });

    // If recursiveRefresh is requested, return detailed subfolder information
    if (recursiveRefresh) {
      logger.info('Starting recursive sync status refresh', {
        requestId,
        userEmail,
        folderId,
      });

      const result = await recursivelyRefreshFolderSyncStatus(
        userEmail,
        folderId
      );

      logger.info('Recursive sync status refresh completed', {
        requestId,
        userEmail,
        folderId,
        processedCount: result.processedCount,
        durationMs: result.durationMs,
      });

      return NextResponse.json({
        folderId,
        syncStatus: result.status,
        recursiveResult: result,
      });
    }

    // Otherwise, handle normal sync status request
    let folderStatus;

    if (forceRecalculate) {
      folderStatus = await calculateFolderSyncStatus(
        userEmail,
        folderId,
        recursive
      );
    } else {
      // Try to get cached status first
      const cached = await getCachedFolderSyncStatus(userEmail, folderId);

      if (cached) {
        logger.debug('Using cached folder sync status', {
          requestId,
          userEmail,
          folderId,
        });
        folderStatus = cached;
      } else {
        logger.debug('Calculating folder sync status (not cached)', {
          requestId,
          userEmail,
          folderId,
        });
        folderStatus = await calculateFolderSyncStatus(
          userEmail,
          folderId,
          recursive
        );
      }
    }

    logger.info('Folder sync status retrieved', {
      requestId,
      userEmail,
      folderId,
      status: folderStatus.status,
      percentage: folderStatus.percentage,
    });

    return NextResponse.json({
      folderId,
      syncStatus: folderStatus,
    });
  }

  // Handle multiple file sync status request
  if (fileIds) {
    const fileIdArray = fileIds.split(',').filter(id => id.trim());

    logger.debug('Getting sync status for multiple files', {
      requestId,
      userEmail,
      fileCount: fileIdArray.length,
    });

    // Bulk check upload records
    const uploadRecords = await getUploadRecords(userEmail, fileIdArray);

    const fileStatuses = new Map();

    for (const [fileId, uploadRecord] of uploadRecords.entries()) {
      const isUploaded = uploadRecord !== null;
      fileStatuses.set(fileId, {
        status: isUploaded ? 'synced' : 'unsynced',
        syncedCount: isUploaded ? 1 : 0,
        totalCount: 1,
        percentage: isUploaded ? 100 : 0,
        lastChecked: new Date().toISOString(),
      });
    }

    const syncedCount = Array.from(uploadRecords.values()).filter(
      r => r !== null
    ).length;

    logger.info('File sync statuses retrieved', {
      requestId,
      userEmail,
      fileCount: fileIdArray.length,
      syncedCount,
    });

    return NextResponse.json({
      fileStatuses: Object.fromEntries(fileStatuses),
      summary: {
        totalFiles: fileIdArray.length,
        syncedCount,
        unsyncedCount: fileIdArray.length - syncedCount,
      },
    });
  }

  // No valid parameters provided
  logger.warn('Invalid request - No folderId or fileIds provided', {
    requestId,
    userEmail,
  });

  return NextResponse.json(
    { error: 'Invalid request - Provide folderId or fileIds parameter' },
    { status: 400 }
  );
}

export const GET = withErrorHandler(handleGET);
