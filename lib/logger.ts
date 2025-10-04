/**
 * Server-side logger
 * Simple logging infrastructure for server components and API routes
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
} as const;

class Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const prefixStr = this.prefix ? `[${this.prefix}] ` : '';
    const contextStr = context ? `\n${JSON.stringify(context, null, 2)}` : '';

    // Color scheme based on log level
    let levelColor: string;
    let levelLabel: string;

    switch (level) {
      case 'debug':
        levelColor = colors.gray;
        levelLabel = 'DEBUG';
        break;
      case 'info':
        levelColor = colors.cyan;
        levelLabel = 'INFO';
        break;
      case 'warn':
        levelColor = colors.yellow;
        levelLabel = 'WARN';
        break;
      case 'error':
        levelColor = colors.red;
        levelLabel = 'ERROR';
        break;
    }

    return `${colors.gray}[${timestamp}]${colors.reset} ${levelColor}[${levelLabel}]${colors.reset} ${colors.magenta}${prefixStr}${colors.reset}${message}${colors.green}${contextStr}${colors.reset}`;
  }

  debug(message: string, context?: LogContext): void {
    // eslint-disable-next-line no-console
    console.debug(this.formatMessage('debug', message, context));
  }

  info(message: string, context?: LogContext): void {
    // eslint-disable-next-line no-console
    console.info(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  private formatError(error: Error | unknown): string {
    if (!(error instanceof Error)) {
      return `\n${colors.red}Error details:${colors.reset}\n${JSON.stringify(error, null, 2)}`;
    }

    let output = `\n${colors.red}${error.name}: ${error.message}${colors.reset}`;

    // Add stack trace (skip first line which is the error message)
    if (error.stack) {
      const stackLines = error.stack.split('\n').slice(1);
      output += `\n${colors.gray}${stackLines.join('\n')}${colors.reset}`;
    }

    // Handle error cause chain
    if ('cause' in error && error.cause) {
      output += `\n\n${colors.yellow}Caused by:${colors.reset}`;
      output += this.formatError(error.cause);
    }

    return output;
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    // Build the log message parts
    const timestamp = new Date().toISOString();
    const prefixStr = this.prefix ? `[${this.prefix}] ` : '';

    // Header line
    let output = `${colors.gray}[${timestamp}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${colors.magenta}${prefixStr}${colors.reset}${message}`;

    // Merge context with ExtendedError details if present
    let mergedContext = { ...context };
    if (
      error &&
      typeof error === 'object' &&
      'details' in error &&
      typeof error.details === 'object' &&
      error.details !== null
    ) {
      mergedContext = {
        ...mergedContext,
        ...(error.details as Record<string, unknown>),
      };
    }

    // Add context if present
    if (Object.keys(mergedContext).length > 0) {
      output += `\n${colors.green}Context:${colors.reset}\n${JSON.stringify(mergedContext, null, 2)}`;
    }

    // Add error details if present
    if (error) {
      output += this.formatError(error);
    }

    console.error(output);
  }

  /**
   * Create a child logger with a specific prefix
   */
  child(prefix: string): Logger {
    const childPrefix = this.prefix ? `${this.prefix}:${prefix}` : prefix;
    return new Logger(childPrefix);
  }
}

// Default logger instance
export const logger = new Logger();

// Helper to create logger with specific prefix
export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}
