import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requeueFailedItems } from '@/lib/upload-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:queue:requeue-failed');

/**
 * POST /api/queue/requeue-failed - Re-queue all failed items
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

  logger.info('Re-queue failed items request', { requestId, userEmail });

  const requeuedCount = await requeueFailedItems(userEmail);

  logger.info('Re-queue failed items request completed', {
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
