import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { withErrorHandler } from '@/lib/error-handler';
import { enqueueAll } from '@/lib/server/enqueue-all';
import { createLogger } from '@/lib/logger';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:enqueue-all');

async function handlePOST(request: NextRequest) {
  const session = await auth();
  const sessionResult = validateSession(session);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail, auth: authContext } = sessionResult.data;

  const { folderId, folderName } = await request.json();
  if (!folderId || !folderName) {
    return NextResponse.json(
      { error: 'folderId and folderName are required' },
      { status: 400 }
    );
  }

  logger.info('Enqueue all request received', {
    userEmail,
    folderId,
    folderName,
  });

  // Start the operation in the background, don't await it
  enqueueAll(userEmail, folderId, folderName, authContext);

  return NextResponse.json({
    success: true,
    message: 'Enqueue all operation started in the background.',
  });
}

export const POST = withErrorHandler(handlePOST);
