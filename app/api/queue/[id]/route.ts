import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { removeFromQueue } from '@/lib/upload-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';

const logger = createLogger('api:queue:item');

/**
 * DELETE /api/queue/[id] - Remove specific item from queue
 */
async function handleDELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = Math.random().toString(36).substring(7);
  const { id: queueItemId } = await params;

  // Get session
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

  logger.info('Remove queue item request', {
    requestId,
    userEmail,
    queueItemId,
  });

  // Remove from queue
  await removeFromQueue(userEmail, queueItemId);

  logger.info('Remove queue item request completed', {
    requestId,
    userEmail,
    queueItemId,
  });

  return NextResponse.json({
    success: true,
  });
}

export const DELETE = withErrorHandler(handleDELETE);
