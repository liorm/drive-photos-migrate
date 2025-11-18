import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';
import { createLogger } from '@/lib/logger';
import { withGoogleAuthRetry } from '@/lib/token-refresh';
import { fetchWithRetry } from '@/lib/retry';
import { getUploadedMediaItemId } from '@/lib/uploads-db';
import { getDatabase } from '@/lib/sqlite-db';

const logger = createLogger('api:photos:media-item');

const PHOTOS_API_BASE = 'https://photoslibrary.googleapis.com/v1';

async function handleGET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail, auth: authContext } = sessionResult.data;

  // Get driveFileId from query params
  const searchParams = request.nextUrl.searchParams;
  const driveFileId = searchParams.get('driveFileId');

  if (!driveFileId) {
    return NextResponse.json(
      { error: 'driveFileId is required' },
      { status: 400 }
    );
  }

  logger.info('Fetching media item productUrl', {
    requestId,
    userEmail,
    driveFileId,
  });

  // Get the media item ID from uploads table
  const mediaItemId = await getUploadedMediaItemId(userEmail, driveFileId);

  if (!mediaItemId) {
    logger.warn('Media item not found for drive file', {
      requestId,
      userEmail,
      driveFileId,
    });
    return NextResponse.json(
      { error: 'File has not been uploaded to Google Photos' },
      { status: 404 }
    );
  }

  try {
    // Fetch media item details from Google Photos API
    const { result: response } = await withGoogleAuthRetry(
      authContext,
      async auth => {
        return await fetchWithRetry(
          `${PHOTOS_API_BASE}/mediaItems/${mediaItemId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${auth.accessToken}`,
            },
          }
        );
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('Media item not found in Google Photos', {
          requestId,
          userEmail,
          driveFileId,
          mediaItemId,
        });
        return NextResponse.json(
          { error: 'Media item not found in Google Photos' },
          { status: 404 }
        );
      }

      const errorText = await response.text();
      logger.error('Failed to fetch media item', new Error(errorText), {
        requestId,
        userEmail,
        driveFileId,
        mediaItemId,
        status: response.status,
      });
      return NextResponse.json(
        { error: 'Failed to fetch media item from Google Photos' },
        { status: response.status }
      );
    }

    const mediaItem = await response.json();
    const productUrl = mediaItem.productUrl;

    // Update the uploads table with the productUrl for future use
    if (productUrl) {
      const db = getDatabase();
      db.prepare(
        'UPDATE uploads SET product_url = ? WHERE user_email = ? AND drive_file_id = ?'
      ).run(productUrl, userEmail, driveFileId);

      logger.info('Updated uploads table with productUrl', {
        requestId,
        userEmail,
        driveFileId,
        mediaItemId,
      });
    }

    logger.info('Successfully fetched media item productUrl', {
      requestId,
      userEmail,
      driveFileId,
      mediaItemId,
      hasProductUrl: !!productUrl,
    });

    return NextResponse.json({
      productUrl,
      mediaItemId,
    });
  } catch (error) {
    logger.error('Error fetching media item', error, {
      requestId,
      userEmail,
      driveFileId,
      mediaItemId,
    });
    throw error;
  }
}

export const GET = withErrorHandler(handleGET);
