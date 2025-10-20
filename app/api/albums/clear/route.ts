import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  clearCompletedAlbumItems,
  clearAllAlbumItems,
} from '@/lib/album-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:albums:clear');

/**
 * DELETE /api/albums/clear - Clear completed, failed, and cancelled items from album queue
 * DELETE /api/albums/clear?all=true - Clear all items from album queue
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
    logger.info('Clear all album items request', { requestId, userEmail });

    // Clear all items (dangerous operation)
    const removedCount = await clearAllAlbumItems(userEmail);

    logger.info('Clear all album items request completed', {
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
    logger.info('Clear completed album items request', {
      requestId,
      userEmail,
    });

    // Clear completed/failed/cancelled items
    const removedCount = await clearCompletedAlbumItems(userEmail);

    logger.info('Clear completed album items request completed', {
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
