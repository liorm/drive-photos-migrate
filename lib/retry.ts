import { ExtendedError } from './errors';
import { createLogger } from './logger';

const logger = createLogger('retry');

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (error: Error, attempt: number, delay: number) => void;
  shouldRetry?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  initialDelay: 300,
  maxDelay: 10000,
  backoffMultiplier: 2,
  onRetry: () => {},
  shouldRetry: isRetryableError,
};

/**
 * Determines if an error should be retried based on status code or error type
 */
function isRetryableError(error: Error): boolean {
  // Handle ExtendedError with status codes in details
  if (error instanceof ExtendedError && error.details) {
    const statusCode = error.details.statusCode as number | undefined;
    if (statusCode) {
      // Retry on rate limit (429) and server errors (5xx)
      if (statusCode === 429) return true;
      if (statusCode >= 500 && statusCode < 600) return true;

      // Don't retry client errors (4xx) except 429
      if (statusCode >= 400 && statusCode < 500) return false;
    }
  }

  // Handle Response objects from fetch
  if (
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    const status = (error as { status: number }).status;
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    if (status >= 400 && status < 500) return false;
  }

  // Retry on network errors
  const message = error.message?.toLowerCase() || '';
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout')
  ) {
    return true;
  }

  // Don't retry authentication errors
  if (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('invalid_grant')
  ) {
    return false;
  }

  // Default: retry unknown errors
  return true;
}

/**
 * Calculates delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number
): number {
  // Calculate exponential backoff: initialDelay * (backoffMultiplier ^ attempt)
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (randomize between 0% and 100% of the delay)
  const jitter = cappedDelay * Math.random();

  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleeps for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an async operation with exponential backoff
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns The result of the successful operation
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```ts
 * const result = await retryWithBackoff(
 *   () => fetch('https://api.example.com/data'),
 *   {
 *     maxRetries: 3,
 *     onRetry: (error, attempt, delay) => {
 *       console.log(`Retry ${attempt}/3 after ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If the operation was explicitly aborted, don't retry
      if (
        lastError instanceof Error &&
        'name' in lastError &&
        lastError.name === 'AbortError'
      ) {
        logger.info('Operation aborted, not retrying', {
          error: lastError.message,
        });
        throw lastError;
      }

      // Check if we should retry this error
      if (!opts.shouldRetry(lastError)) {
        logger.debug('Error is not retryable, throwing immediately', {
          error: lastError.message,
          attempt,
        });
        throw lastError;
      }

      // If we've exhausted retries, throw the error
      if (attempt === opts.maxRetries) {
        logger.warn('Max retries exhausted', {
          error: lastError.message,
          attempts: attempt + 1,
        });
        throw lastError;
      }

      // Calculate delay and wait before retrying
      const delay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier
      );

      logger.info('Retrying operation after error', {
        error: lastError.message,
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: delay,
      });

      // Call onRetry callback
      opts.onRetry(lastError, attempt + 1, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

/**
 * Wraps a fetch call with retry logic
 * Automatically checks response status and throws on error status codes
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  return retryWithBackoff(async () => {
    const response = await fetch(url, init);

    // If response is not ok, throw an error with status code
    if (!response.ok) {
      // Try to read response body for more detailed error info (best-effort)
      let responseBody = '';
      try {
        responseBody = await response.text();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_e) {
        // ignore read errors
      }

      const truncatedBody =
        typeof responseBody === 'string' && responseBody.length > 2000
          ? responseBody.slice(0, 2000) + '... (truncated)'
          : responseBody;

      const error = new ExtendedError({
        message: `HTTP ${response.status}: ${response.statusText}`,
        details: {
          statusCode: response.status,
          url,
          method: init?.method || 'GET',
          responseBody: truncatedBody,
        },
      });
      throw error;
    }

    return response;
  }, retryOptions);
}
