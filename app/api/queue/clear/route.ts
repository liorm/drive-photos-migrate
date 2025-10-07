import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { clearCompletedItems, clearAllItems } from '@/lib/upload-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:queue:clear');

/**
 * DELETE /api/queue/clear - Clear completed and failed items from queue
 * DELETE /api/queue/clear?all=true - Clear all items from queue
 */
async function handleDELETE(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const { searchParams } = new URL(request.url);
  const clearAll = searchParams.get('all') === 'true';

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  if (clearAll) {
    logger.info('Clear all items request', { requestId, userEmail });

    // Clear all items (dangerous operation)
    const removedCount = await clearAllItems(userEmail);

    logger.info('Clear all items request completed', {
      requestId,
      userEmail,
      removedCount,
    });

    return NextResponse.json({
      success: true,
      removedCount,
      cleared: 'all',
    });
  } else {
    logger.info('Clear completed items request', { requestId, userEmail });

    // Clear completed/failed items
    const removedCount = await clearCompletedItems(userEmail);

    logger.info('Clear completed items request completed', {
      requestId,
      userEmail,
      removedCount,
    });

    return NextResponse.json({
      success: true,
      removedCount,
      cleared: 'completed',
    });
  }
}

export const DELETE = withErrorHandler(handleDELETE);
