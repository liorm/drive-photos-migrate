import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { processQueue } from '@/lib/queue-processor';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';

const logger = createLogger('api:queue:process');

/**
 * POST /api/queue/process - Start processing the upload queue
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
  const accessToken = session.accessToken;

  logger.info('Process queue request', { requestId, userEmail });

  // Start processing queue in the background
  // Don't await - let it run asynchronously
  processQueue(userEmail, accessToken).catch(error => {
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
