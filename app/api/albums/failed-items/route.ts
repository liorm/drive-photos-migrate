import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getFailedAddAlbumItems,
  deleteAlbumItems,
  clearUploadRecordsForDriveFiles,
} from '@/lib/album-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:albums:failed-items');

/**
 * GET /api/albums/failed-items - Get all FAILED_ADD album items for current user
 */
async function handleGET(_request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  logger.info('Get failed add items request', { requestId, userEmail });

  // Get failed items
  const items = await getFailedAddAlbumItems(userEmail);

  logger.info('Failed add items retrieved successfully', {
    requestId,
    userEmail,
    itemCount: items.length,
  });

  return NextResponse.json({
    success: true,
    items,
  });
}

interface DeleteRequestBody {
  itemIds: string[];
  clearUploads?: boolean;
}

/**
 * POST /api/albums/failed-items - Delete selected failed items
 */
async function handlePOST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  // Parse request body
  const body: DeleteRequestBody = await request.json();
  const { itemIds, clearUploads } = body;

  if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
    logger.warn('Invalid request - Missing or empty itemIds', {
      requestId,
      userEmail,
    });
    return NextResponse.json(
      { error: 'itemIds array is required and must not be empty' },
      { status: 400 }
    );
  }

  logger.info('Delete failed add items request', {
    requestId,
    userEmail,
    itemCount: itemIds.length,
    clearUploads,
  });

  // Get the items first to find their drive file IDs (for clearing uploads)
  let driveFileIds: string[] = [];
  if (clearUploads) {
    const allItems = await getFailedAddAlbumItems(userEmail);
    driveFileIds = allItems
      .filter(item => itemIds.includes(item.id))
      .map(item => item.driveFileId);
  }

  // Delete the album items
  const deletedCount = await deleteAlbumItems(itemIds);

  // Optionally clear upload records
  let clearedUploadsCount = 0;
  if (clearUploads && driveFileIds.length > 0) {
    clearedUploadsCount = await clearUploadRecordsForDriveFiles(
      userEmail,
      driveFileIds
    );
  }

  logger.info('Failed add items deleted successfully', {
    requestId,
    userEmail,
    deletedCount,
    clearedUploadsCount,
  });

  return NextResponse.json({
    success: true,
    deletedCount,
    clearedUploadsCount,
  });
}

export const GET = withErrorHandler(handleGET);
export const POST = withErrorHandler(handlePOST);
