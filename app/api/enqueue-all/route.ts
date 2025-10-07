import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { withErrorHandler } from '@/lib/error-handler';
import { enqueueAll } from '@/lib/server/enqueue-all';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api:enqueue-all');

async function handlePOST(request: NextRequest) {
  const session = await auth();
  if (
    !session?.accessToken ||
    !session?.refreshToken ||
    !session?.user?.email
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { folderId, folderName } = await request.json();
  if (!folderId || !folderName) {
    return NextResponse.json(
      { error: 'folderId and folderName are required' },
      { status: 400 }
    );
  }

  logger.info('Enqueue all request received', {
    userEmail: session.user.email,
    folderId,
    folderName,
  });

  // Start the operation in the background, don't await it
  enqueueAll(session.user.email, folderId, folderName, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken!,
  });

  return NextResponse.json({
    success: true,
    message: 'Enqueue all operation started in the background.',
  });
}

export const POST = withErrorHandler(handlePOST);
