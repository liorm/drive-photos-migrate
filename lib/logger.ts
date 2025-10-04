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
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';

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

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext =
      error instanceof Error
        ? { ...context, error: error.message, stack: error.stack }
        : { ...context, error };
    console.error(this.formatMessage('error', message, errorContext));
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
