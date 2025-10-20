import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requeueFailedAlbumItems } from '@/lib/album-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:albums:requeue-failed');

/**
 * POST /api/albums/requeue-failed - Re-queue all failed album items
 */
async function handlePOST(_request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  logger.info('Re-queue failed album items request', { requestId, userEmail });

  const requeuedCount = await requeueFailedAlbumItems(userEmail);

  logger.info('Re-queue failed album items request completed', {
    requestId,
    userEmail,
    requeuedCount,
  });

  return NextResponse.json({
    success: true,
    requeuedCount,
  });
}

export const POST = withErrorHandler(handlePOST);
