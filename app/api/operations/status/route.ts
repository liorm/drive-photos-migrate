import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validateSession } from '@/lib/auth-utils';
import operationStatusManager from '@/lib/operation-status';

/**
 * Debug endpoint to check current operations for the logged-in user
 * GET /api/operations/status
 */
export async function GET() {
  const session = await auth();
  const sessionResult = validateSession(session, 'status');

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  // Only return operations for the current user
  const operations = operationStatusManager.getOperationsByUser(userEmail);

  return NextResponse.json({
    userEmail,
    count: operations.length,
    operations: operations.map(op => ({
      id: op.id,
      type: op.type,
      status: op.status,
      name: op.name,
      progress: op.progress,
      startedAt: op.startedAt,
      error: op.error,
    })),
  });
}
