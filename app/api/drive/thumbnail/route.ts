import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validateSession } from '@/lib/auth-utils';
import { withErrorHandler } from '@/lib/error-handler';
import { createLogger } from '@/lib/logger';
import { google } from 'googleapis';
import { GoogleAuthContext } from '@/types/auth';

const logger = createLogger('api:drive:thumbnail');

/**
 * Initialize Google Drive API client with OAuth2 credentials
 */
function getDriveClient(auth: GoogleAuthContext) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: auth.accessToken });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Fetch thumbnail from Google Drive with authentication
 */
async function fetchThumbnail(
  authContext: GoogleAuthContext,
  fileId: string
): Promise<{ data: ArrayBuffer; contentType: string }> {
  // Get file metadata to get thumbnailLink
  const drive = getDriveClient(authContext);
  const fileResponse = await drive.files.get({
    fileId,
    fields: 'thumbnailLink',
  });

  const thumbnailLink = fileResponse.data.thumbnailLink;
  if (!thumbnailLink) {
    throw new Error('No thumbnail available for this file');
  }

  // Fetch thumbnail with OAuth token
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: authContext.accessToken });

  const token = await oauth2Client.getAccessToken();
  if (!token.token) {
    throw new Error('Failed to get access token');
  }

  const response = await fetch(thumbnailLink, {
    headers: {
      Authorization: `Bearer ${token.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch thumbnail: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'image/jpeg';

  return { data, contentType };
}

async function handleGET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail, auth: authContext } = sessionResult.data;

  // Get fileId from query params
  const searchParams = request.nextUrl.searchParams;
  const fileId = searchParams.get('fileId');

  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  logger.debug('Thumbnail request', {
    requestId,
    userEmail,
    fileId,
  });

  try {
    const { data, contentType } = await fetchThumbnail(authContext, fileId);

    logger.debug('Thumbnail fetched successfully', {
      requestId,
      fileId,
      contentType,
      size: data.byteLength,
    });

    // Return image with caching headers
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable', // Cache for 24 hours
        'X-File-Id': fileId,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch thumbnail', error, {
      requestId,
      fileId,
    });

    // Return a 1x1 transparent PNG as fallback
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    return new NextResponse(transparentPng, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300', // Cache error response for 5 minutes
        'X-Error': 'Thumbnail fetch failed',
      },
    });
  }
}

export const GET = withErrorHandler(handleGET);
