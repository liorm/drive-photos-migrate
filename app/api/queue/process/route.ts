import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { processQueue, requestStopProcessing } from '@/lib/queue-processor';
import { failUploadingItems } from '@/lib/upload-queue-db';
import operationStatusManager from '@/lib/operation-status';
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
  requestStopProcessing(userEmail);

  // Mark any currently uploading items as failed so UI reflects the stop.
  try {
    const failedCount = await failUploadingItems(
      userEmail,
      'Processing stopped by user'
    );

    logger.info('Failing uploading items due to stop request', {
      requestId,
      userEmail,
      failedCount,
    });
  } catch (err) {
    logger.warn('Failed to mark uploading items as failed', {
      requestId,
      userEmail,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fail any active long-write operation for this user
  try {
    // Iterate all operations and fail those matching userEmail
    const allOps = operationStatusManager.getAllOperations();
    allOps.forEach(op => {
      if (op.metadata?.userEmail === userEmail && op.status === 'in_progress') {
        operationStatusManager.failOperation(op.id, 'Stopped by user');
      }
    });
  } catch (err) {
    logger.warn('Failed to update operation status for stop request', {
      requestId,
      userEmail,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ success: true, message: 'Stop requested' });
}

export const DELETE = withErrorHandler(handleDELETE);
