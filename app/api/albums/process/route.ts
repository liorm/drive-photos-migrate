import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import albumsManager from '@/lib/albums-manager';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:albums:process');

/**
 * POST /api/albums/process - Start processing the album queue
 */
async function handlePOST(_request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail, auth: authContext } = sessionResult.data;

  logger.info('Start album processing request', { requestId, userEmail });

  // Start processing in the background (don't await)
  albumsManager.startProcessing(userEmail, authContext).catch(error => {
    logger.error('Error in album processing', error, {
      requestId,
      userEmail,
    });
  });

  logger.info('Album processing started', { requestId, userEmail });

  return NextResponse.json({
    success: true,
    message: 'Album processing started',
  });
}

/**
 * DELETE /api/albums/process - Stop processing the album queue
 */
async function handleDELETE(_request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  logger.info('Stop album processing request', { requestId, userEmail });

  // Stop processing
  albumsManager.stopProcessing(userEmail);

  logger.info('Album processing stop requested', { requestId, userEmail });

  return NextResponse.json({
    success: true,
    message: 'Album processing stopped',
  });
}

export const POST = withErrorHandler(handlePOST);
export const DELETE = withErrorHandler(handleDELETE);
