/**
 * Extended Error class that preserves error context and details
 *
 * Usage:
 * ```ts
 * throw new ExtendedError({
 *   message: 'Failed to upload file',
 *   cause: originalError,
 *   details: {
 *     fileName: 'photo.jpg',
 *     statusCode: 429,
 *     retryAfter: 60
 *   }
 * });
 * ```
 */

export interface ExtendedErrorOptions {
  message: string;
  cause?: Error | unknown;
  details?: Record<string, unknown>;
}

export class ExtendedError extends Error {
  public readonly cause?: Error | unknown;
  public readonly details?: Record<string, unknown>;

  constructor(options: ExtendedErrorOptions) {
    super(options.message);
    this.name = 'ExtendedError';
    this.cause = options.cause;
    this.details = options.details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExtendedError);
    }
  }

  /**
   * Type guard to check if an error is an ExtendedError
   */
  static isExtendedError(error: unknown): error is ExtendedError {
    return error instanceof ExtendedError;
  }
}
