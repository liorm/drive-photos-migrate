import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  ignoreFile,
  unignoreFile,
  isFileIgnored,
} from '@/lib/ignored-files-db';
import { getQueuedFileIds } from '@/lib/upload-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:files:ignore');

/**
 * POST /api/files/ignore - Mark file as ignored
 */
async function handlePOST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  const body = await request.json();
  const { fileId } = body;

  if (!fileId) {
    return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
  }

  logger.info('Ignore file request', { requestId, userEmail, fileId });

  // Check if file is in queue
  const queuedFiles = await getQueuedFileIds(userEmail, [fileId]);
  if (queuedFiles.has(fileId)) {
    logger.warn('Cannot ignore file in queue', {
      requestId,
      userEmail,
      fileId,
    });
    return NextResponse.json(
      {
        error:
          'Cannot ignore file that is currently in upload queue. Please remove it from the queue first.',
      },
      { status: 400 }
    );
  }

  // Mark file as ignored
  ignoreFile(userEmail, fileId);

  logger.info('File ignored successfully', { requestId, userEmail, fileId });

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/files/ignore - Unignore file
 */
async function handleDELETE(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  const body = await request.json();
  const { fileId } = body;

  if (!fileId) {
    return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
  }

  logger.info('Unignore file request', { requestId, userEmail, fileId });

  // Unignore file
  unignoreFile(userEmail, fileId);

  logger.info('File unignored successfully', { requestId, userEmail, fileId });

  return NextResponse.json({ success: true });
}

/**
 * GET /api/files/ignore - Check if file is ignored
 */
async function handleGET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');

  if (!fileId) {
    return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
  }

  const ignored = isFileIgnored(userEmail, fileId);

  return NextResponse.json({ ignored });
}

export const POST = withErrorHandler(handlePOST);
export const DELETE = withErrorHandler(handleDELETE);
export const GET = withErrorHandler(handleGET);
