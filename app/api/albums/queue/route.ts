import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAlbumQueue, getAlbumQueueStats } from '@/lib/album-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import albumsManager from '@/lib/albums-manager';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:albums:queue');

interface AddToAlbumQueueRequestBody {
  folderId: string;
  folderName: string;
}

/**
 * GET /api/albums/queue - Get album queue for current user
 */
async function handleGET(_request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  logger.info('Get album queue request', { requestId, userEmail });

  // Get queue and stats
  const queue = await getAlbumQueue(userEmail);
  const stats = await getAlbumQueueStats(userEmail);

  logger.info('Album queue retrieved successfully', {
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
 * POST /api/albums/queue - Add a folder to the album creation queue
 */
async function handlePOST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail, auth: authContext } = sessionResult.data;

  // Parse request body
  const body: AddToAlbumQueueRequestBody = await request.json();
  const { folderId, folderName } = body;

  if (!folderId || !folderName) {
    logger.warn('Invalid request - Missing folderId or folderName', {
      requestId,
      userEmail,
    });
    return NextResponse.json(
      { error: 'folderId and folderName are required' },
      { status: 400 }
    );
  }

  logger.info('Add folder to album queue request', {
    requestId,
    userEmail,
    folderId,
    folderName,
  });

  try {
    // Add to queue via AlbumsManager
    const queueItem = await albumsManager.addToQueue({
      userEmail,
      auth: authContext,
      driveFolderId: folderId,
      folderName,
    });

    logger.info('Folder added to album queue successfully', {
      requestId,
      userEmail,
      albumQueueId: queueItem.id,
    });

    return NextResponse.json({
      success: true,
      albumQueueId: queueItem.id,
      status: queueItem.status,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('already in the album queue')
    ) {
      logger.warn('Folder already in album queue', {
        requestId,
        userEmail,
        folderId,
      });
      return NextResponse.json(
        { error: 'Folder is already in the album queue' },
        { status: 409 }
      );
    }

    throw error;
  }
}

export const GET = withErrorHandler(handleGET);
export const POST = withErrorHandler(handlePOST);
