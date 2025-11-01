import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validateSession } from '@/lib/auth-utils';
import operationStatusManager, { OperationType } from '@/lib/operation-status';

/**
 * Test endpoint to create a mock operation for debugging notifications
 * GET /api/operations/test
 */
export async function GET() {
  const session = await auth();
  const sessionResult = validateSession(session, 'test-op');

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail } = sessionResult.data;

  const operationId = operationStatusManager.createOperation(
    OperationType.LONG_READ,
    'Test Operation',
    {
      description: 'This is a test operation to verify notifications work',
      total: 100,
      metadata: { userEmail },
    }
  );

  // Simulate progress updates
  setTimeout(() => {
    operationStatusManager.updateProgress(operationId, 25);
  }, 1000);

  setTimeout(() => {
    operationStatusManager.updateProgress(operationId, 50);
  }, 2000);

  setTimeout(() => {
    operationStatusManager.updateProgress(operationId, 75);
  }, 3000);

  setTimeout(() => {
    operationStatusManager.completeOperation(operationId, {
      message: 'Test operation completed successfully',
    });
  }, 4000);

  return NextResponse.json({
    success: true,
    operationId,
    message: 'Test operation created. It will complete in 4 seconds.',
  });
}
