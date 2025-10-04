import { NextRequest } from 'next/server';
import operationStatusManager, { Operation } from '@/lib/operation-status';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api:operations:stream');

/**
 * SSE endpoint for streaming operation status updates to clients
 * GET /api/operations/stream
 */
export async function GET(request: NextRequest) {
  // Set up SSE headers
  const responseHeaders = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable buffering in nginx
  });

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Helper to send SSE message
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial connection message with all current operations
      const initialOperations = operationStatusManager.getAllOperations();
      sendEvent('connected', {
        timestamp: new Date().toISOString(),
        operations: initialOperations,
      });

      logger.info('SSE client connected', {
        activeOperations: initialOperations.length,
      });

      // Set up event listeners for operation updates
      const onOperationCreated = (operation: Operation) => {
        sendEvent('operation:created', operation);
      };

      const onOperationUpdated = (operation: Operation) => {
        sendEvent('operation:updated', operation);
      };

      const onOperationRemoved = (data: { id: string }) => {
        sendEvent('operation:removed', data);
      };

      // Register event listeners
      operationStatusManager.on('operation:created', onOperationCreated);
      operationStatusManager.on('operation:updated', onOperationUpdated);
      operationStatusManager.on('operation:removed', onOperationRemoved);

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          sendEvent('heartbeat', {
            timestamp: new Date().toISOString(),
          });
        } catch {
          // Client disconnected, stop heartbeat
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Clean up on client disconnect
      request.signal.addEventListener('abort', () => {
        logger.info('SSE client disconnected');

        // Remove event listeners
        operationStatusManager.off('operation:created', onOperationCreated);
        operationStatusManager.off('operation:updated', onOperationUpdated);
        operationStatusManager.off('operation:removed', onOperationRemoved);

        // Clear heartbeat
        clearInterval(heartbeatInterval);

        // Close the stream
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, { headers: responseHeaders });
}
