import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  addToQueue,
  getQueue,
  getQueueStats,
  getCachedFileMetadata,
} from '@/lib/upload-queue-db';
import { getDriveFile } from '@/lib/google-drive';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';

const logger = createLogger('api:queue');

interface AddToQueueRequestBody {
  fileIds: string[];
}

/**
 * GET /api/queue - Get upload queue for current user
 */
async function handleGET(_request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get session
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

  logger.info('Get queue request', { requestId, userEmail });

  // Get queue and stats
  const queue = await getQueue(userEmail);
  const stats = await getQueueStats(userEmail);

  logger.info('Queue retrieved successfully', {
    requestId,
    userEmail,
    itemCount: queue.length,
  });

  return NextResponse.json({
    success: true,
    queue,
    stats,
  });
}

/**
 * POST /api/queue - Add files to upload queue
 */
async function handlePOST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get session
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

  // Parse request body
  const body: AddToQueueRequestBody = await request.json();
  const { fileIds } = body;

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    logger.warn('Invalid request - No file IDs provided', {
      requestId,
      userEmail,
    });
    return NextResponse.json(
      { error: 'Invalid request - No file IDs provided' },
      { status: 400 }
    );
  }

  logger.info('Add to queue request received', {
    requestId,
    userEmail,
    fileCount: fileIds.length,
  });

  // Fetch file metadata from Drive
  const filesToAdd: Array<{
    driveFileId: string;
    fileName: string;
    mimeType: string;
    fileSize?: number;
  }> = [];

  for (const fileId of fileIds) {
    try {
      // Check cache first
      const cachedMetadata = await getCachedFileMetadata(userEmail, fileId);

      if (cachedMetadata) {
        logger.debug('Using cached file metadata', {
          requestId,
          userEmail,
          fileId,
          fileName: cachedMetadata.fileName,
        });

        filesToAdd.push({
          driveFileId: fileId,
          fileName: cachedMetadata.fileName,
          mimeType: cachedMetadata.mimeType,
          fileSize: cachedMetadata.fileSize,
        });
        continue;
      }

      // Cache miss - fetch from Google Drive
      logger.debug('Fetching file metadata from Drive', {
        requestId,
        userEmail,
        fileId,
      });

      const fileMetadata = await getDriveFile(session.accessToken, fileId);

      if (!fileMetadata.name || !fileMetadata.mimeType) {
        logger.warn('File metadata incomplete, skipping', {
          requestId,
          userEmail,
          fileId,
        });
        continue;
      }

      filesToAdd.push({
        driveFileId: fileId,
        fileName: fileMetadata.name,
        mimeType: fileMetadata.mimeType,
        fileSize: fileMetadata.size ? parseInt(fileMetadata.size) : undefined,
      });

      logger.debug('File metadata fetched successfully', {
        requestId,
        userEmail,
        fileId,
        fileName: fileMetadata.name,
      });
    } catch (error) {
      logger.error('Error fetching file metadata', error, {
        requestId,
        userEmail,
        fileId,
      });
      // Continue with other files even if one fails
    }
  }

  if (filesToAdd.length === 0) {
    logger.warn('No valid files to add to queue', { requestId, userEmail });
    return NextResponse.json(
      { error: 'No valid files to add to queue' },
      { status: 400 }
    );
  }

  // Add to queue
  const result = await addToQueue(userEmail, filesToAdd);

  logger.info('Add to queue request completed', {
    requestId,
    userEmail,
    addedCount: result.added.length,
    skippedCount: result.skipped.length,
  });

  return NextResponse.json({
    success: true,
    added: result.added,
    skipped: result.skipped,
    addedCount: result.added.length,
    skippedCount: result.skipped.length,
  });
}

export const GET = withErrorHandler(handleGET);
export const POST = withErrorHandler(handlePOST);
