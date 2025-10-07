import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getCachedFolderSyncStatus,
  calculateFolderSyncStatus,
} from '@/lib/sync-status';
import { getUploadRecords } from '@/lib/uploads-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';

const logger = createLogger('api:photos:sync-status');

async function handleGET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get session to retrieve access token
  const session = await auth();

  if (
    !session?.accessToken ||
    !session?.refreshToken ||
    !session?.user?.email
  ) {
    logger.warn('Unauthorized request - No access token or refresh token', {
      requestId,
    });
    return NextResponse.json(
      { error: 'Unauthorized - No access token or refresh token' },
      { status: 401 }
    );
  }

  const userEmail = session.user.email;

  // Parse query parameters
  const searchParams = request.nextUrl.searchParams;
  const folderId = searchParams.get('folderId');
  const fileIds = searchParams.get('fileIds'); // Comma-separated file IDs
  const forceRecalculate = searchParams.get('forceRecalculate') === 'true';

  logger.info('Sync status request', {
    requestId,
    userEmail,
    folderId,
    fileIds: fileIds ? fileIds.split(',').length : 0,
    forceRecalculate,
  });

  // Handle folder sync status request
  if (folderId) {
    logger.debug('Getting folder sync status', {
      requestId,
      userEmail,
      folderId,
    });

    let folderStatus;

    if (forceRecalculate) {
      folderStatus = await calculateFolderSyncStatus(userEmail, folderId);
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
        folderStatus = await calculateFolderSyncStatus(userEmail, folderId);
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
