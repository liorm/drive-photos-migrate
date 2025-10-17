import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { removeFromAlbumQueue, getAlbumQueueItem } from '@/lib/album-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:albums:queue:id');

/**
 * DELETE /api/albums/queue/[id] - Remove an album from the queue
 */
async function handleDELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  const { id: albumQueueId } = await params;

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  logger.info('Remove album from queue request', {
    requestId,
    userEmail,
    albumQueueId,
  });

  // Check if item exists and belongs to user
  const queueItem = await getAlbumQueueItem(userEmail, albumQueueId);

  if (!queueItem) {
    logger.warn('Album queue item not found', {
      requestId,
      userEmail,
      albumQueueId,
    });
    return NextResponse.json(
      { error: 'Album queue item not found' },
      { status: 404 }
    );
  }

  // Check if item can be removed (not currently processing)
  if (
    queueItem.status === 'UPLOADING' ||
    queueItem.status === 'CREATING' ||
    queueItem.status === 'UPDATING'
  ) {
    logger.warn('Cannot remove album - currently processing', {
      requestId,
      userEmail,
      albumQueueId,
      status: queueItem.status,
    });
    return NextResponse.json(
      { error: `Cannot remove album while status is ${queueItem.status}` },
      { status: 409 }
    );
  }

  // Remove from queue
  await removeFromAlbumQueue(userEmail, albumQueueId);

  logger.info('Album removed from queue successfully', {
    requestId,
    userEmail,
    albumQueueId,
  });

  return NextResponse.json({
    success: true,
    message: 'Album removed from queue',
  });
}

export const DELETE = withErrorHandler(handleDELETE);
