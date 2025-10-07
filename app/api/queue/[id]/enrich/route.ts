import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getFileDetailsFromCache } from '@/lib/db';
import { getFolderPath } from '@/lib/google-drive';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:queue-enrich');

/**
 * GET /api/queue/[id]/enrich - Get enriched data for a specific queue item
 * Returns folder path information for the queue item
 */
async function handleGET(
  _request: NextRequest,
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

  const { userEmail, auth: authContext } = sessionResult.data;

  logger.debug('Queue item enrich request', {
    requestId,
    userEmail,
    queueItemId,
  });

  try {
    // Get queue item to find the driveFileId
    // We'll need to query the database to get the driveFileId for this queue item
    const db = (await import('@/lib/sqlite-db')).getDatabase();
    const queueItem = db
      .prepare(
        'SELECT drive_file_id FROM queue_items WHERE id = ? AND user_email = ?'
      )
      .get(queueItemId, userEmail) as
      | { drive_file_id: string }
      | undefined;

    if (!queueItem) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      );
    }

    const driveFileId = queueItem.drive_file_id;

    // Get file details from cache to get parent folder ID
    const fileDetails = getFileDetailsFromCache(userEmail, driveFileId);

    if (!fileDetails?.parents?.[0]) {
      logger.debug('No parent folder found for queue item', {
        requestId,
        userEmail,
        queueItemId,
        driveFileId,
      });
      return NextResponse.json({
        success: true,
        folderPath: null,
      });
    }

    // Get folder path for the first parent
    const folderPath = await getFolderPath({
      auth: authContext,
      folderId: fileDetails.parents[0],
      userEmail,
    });

    logger.debug('Queue item enriched successfully', {
      requestId,
      userEmail,
      queueItemId,
      driveFileId,
      pathDepth: folderPath.length,
    });

    return NextResponse.json({
      success: true,
      folderPath,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    logger.error('Error enriching queue item', error, {
      requestId,
      userEmail,
      queueItemId,
    });

    // Return empty result instead of error to avoid breaking the UI
    return NextResponse.json({
      success: true,
      folderPath: null,
      error: errorMessage,
    });
  }
}

export const GET = withErrorHandler(handleGET);