import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import uploadsManager from '@/lib/uploads-manager';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';

const logger = createLogger('api:queue:process');

/**
 * POST /api/queue/process - Start processing the upload queue
 */
async function handlePOST(_request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

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
  logger.info('Process queue request', { requestId, userEmail });

  // Start processing queue in the background
  // Don't await - let it run asynchronously
  uploadsManager
    .startProcessing(userEmail, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    })
    .catch(error => {
      logger.error('Error processing queue', error, {
        requestId,
        userEmail,
      });
    });

  logger.info('Queue processing started', { requestId, userEmail });

  return NextResponse.json({
    success: true,
    message: 'Queue processing started',
  });
}

export const POST = withErrorHandler(handlePOST);

/**
 * DELETE /api/queue/process - Request stop of ongoing processing for current user
 */
async function handleDELETE(_request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  const session = await auth();

  if (!session?.user?.email) {
    logger.warn('Unauthorized request - No session', { requestId });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = session.user.email;

  logger.info('Stop processing request received', { requestId, userEmail });

  // Delegate to UploadsManager
  uploadsManager.stopProcessing(userEmail);

  return NextResponse.json({ success: true, message: 'Stop requested' });
}

export const DELETE = withErrorHandler(handleDELETE);
