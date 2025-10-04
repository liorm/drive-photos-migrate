import { NextRequest, NextResponse } from 'next/server';
import { ExtendedError } from './errors';
import { createLogger } from './logger';

const logger = createLogger('error-handler');

type ApiHandler = (
  request: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => Promise<NextResponse>;

/**
 * Global error handler wrapper for API routes
 *
 * Catches unhandled errors, logs them with full context, and returns appropriate error responses.
 * Detects ExtendedError to log additional details.
 *
 * Usage:
 * ```ts
 * export const POST = withErrorHandler(async (request: NextRequest) => {
 *   // Your handler logic
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (
    request: NextRequest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): Promise<NextResponse> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      // Log the error with full context
      if (ExtendedError.isExtendedError(error)) {
        // Pass the cause if it exists, otherwise pass the ExtendedError itself
        // The logger will extract details from ExtendedError automatically
        logger.error(error.message, error.cause || error, error.details);
      } else if (error instanceof Error) {
        logger.error(error.message, error);
      } else {
        logger.error('Unknown error occurred', error);
      }

      // Determine response status and message
      let statusCode = 500;
      let errorMessage = 'Internal server error';

      if (error instanceof Error) {
        errorMessage = error.message;

        // Detect authentication/authorization errors
        if (
          errorMessage.toLowerCase().includes('unauthorized') ||
          errorMessage.toLowerCase().includes('invalid_grant') ||
          errorMessage.toLowerCase().includes('invalid credentials')
        ) {
          statusCode = 401;
          errorMessage = 'Authentication expired - Please sign in again';
        } else if (errorMessage.toLowerCase().includes('not found')) {
          statusCode = 404;
        } else if (errorMessage.toLowerCase().includes('invalid')) {
          statusCode = 400;
        }
      }

      return NextResponse.json(
        {
          error: errorMessage,
        },
        { status: statusCode }
      );
    }
  };
}
