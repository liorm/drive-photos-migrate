import { NextResponse } from 'next/server';
import operationStatusManager from '@/lib/operation-status';

/**
 * Debug endpoint to check current operations
 * GET /api/operations/status
 */
export async function GET() {
  const operations = operationStatusManager.getAllOperations();

  return NextResponse.json({
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
