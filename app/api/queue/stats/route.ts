import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import uploadsManager from '@/lib/uploads-manager';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:queue:stats');

/**
 * GET /api/queue/stats - Get upload queue processing stats
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

  logger.debug('Get queue stats request', { requestId, userEmail });

  const stats = uploadsManager.getUploadStats(userEmail);

  return NextResponse.json({
    success: true,
    stats,
  });
}

export const GET = withErrorHandler(handleGET);
