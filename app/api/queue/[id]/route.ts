import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { removeFromQueue } from '@/lib/upload-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

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

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

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
