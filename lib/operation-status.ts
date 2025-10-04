import { EventEmitter } from 'events';
import { createLogger } from './logger';

const logger = createLogger('operation-status');

export enum OperationType {
  LONG_READ = 'LONG_READ',
  LONG_WRITE = 'LONG_WRITE',
  SHORT_READ = 'SHORT_READ',
  SHORT_WRITE = 'SHORT_WRITE',
}

export enum OperationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  RETRYING = 'retrying',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface OperationProgress {
  current: number;
  total: number;
  percentage: number;
}

export interface OperationError {
  message: string;
  retryCount: number;
  maxRetries: number;
  lastRetryAt?: Date;
}

export interface Operation {
  id: string;
  type: OperationType;
  status: OperationStatus;
  name: string;
  description?: string;
  progress?: OperationProgress;
  error?: OperationError;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

export interface OperationUpdate {
  status?: OperationStatus;
  progress?: Partial<OperationProgress>;
  error?: Partial<OperationError>;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * Global operation status manager
 * Tracks all ongoing operations and emits events for real-time updates
 */
class OperationStatusManager extends EventEmitter {
  private operations: Map<string, Operation> = new Map();
  private nextId = 1;

  /**
   * Creates a new operation and returns its ID
   */
  createOperation(
    type: OperationType,
    name: string,
    options?: {
      description?: string;
      total?: number;
      metadata?: Record<string, any>;
    }
  ): string {
    const id = `op-${this.nextId++}-${Date.now()}`;

    const operation: Operation = {
      id,
      type,
      status: OperationStatus.PENDING,
      name,
      description: options?.description,
      progress: options?.total
        ? { current: 0, total: options.total, percentage: 0 }
        : undefined,
      startedAt: new Date(),
      metadata: options?.metadata,
    };

    this.operations.set(id, operation);
    this.emit('operation:created', operation);

    logger.info('Operation created', {
      id,
      type,
      name,
      total: options?.total,
    });

    return id;
  }

  /**
   * Updates an existing operation
   */
  updateOperation(id: string, update: OperationUpdate): void {
    const operation = this.operations.get(id);
    if (!operation) {
      logger.warn('Attempted to update non-existent operation', { id });
      return;
    }

    // Update status
    if (update.status) {
      operation.status = update.status;
    }

    // Update progress
    if (update.progress) {
      if (!operation.progress) {
        operation.progress = {
          current: 0,
          total: 100,
          percentage: 0,
        };
      }

      if (update.progress.current !== undefined) {
        operation.progress.current = update.progress.current;
      }
      if (update.progress.total !== undefined) {
        operation.progress.total = update.progress.total;
      }

      // Recalculate percentage
      operation.progress.percentage =
        operation.progress.total > 0
          ? Math.round(
              (operation.progress.current / operation.progress.total) * 100
            )
          : 0;
    }

    // Update error
    if (update.error) {
      if (!operation.error) {
        operation.error = {
          message: '',
          retryCount: 0,
          maxRetries: 3,
        };
      }

      if (update.error.message !== undefined) {
        operation.error.message = update.error.message;
      }
      if (update.error.retryCount !== undefined) {
        operation.error.retryCount = update.error.retryCount;
      }
      if (update.error.maxRetries !== undefined) {
        operation.error.maxRetries = update.error.maxRetries;
      }
      if (update.error.lastRetryAt !== undefined) {
        operation.error.lastRetryAt = update.error.lastRetryAt;
      }
    }

    // Update completion time
    if (update.completedAt) {
      operation.completedAt = update.completedAt;
    }

    // Update metadata
    if (update.metadata) {
      operation.metadata = {
        ...operation.metadata,
        ...update.metadata,
      };
    }

    this.emit('operation:updated', operation);

    logger.debug('Operation updated', {
      id,
      status: operation.status,
      progress: operation.progress,
    });
  }

  /**
   * Marks an operation as started (in progress)
   */
  startOperation(id: string): void {
    this.updateOperation(id, { status: OperationStatus.IN_PROGRESS });
  }

  /**
   * Updates operation progress
   */
  updateProgress(id: string, current: number, total?: number): void {
    this.updateOperation(id, {
      progress: { current, total },
    });
  }

  /**
   * Marks an operation as retrying due to an error
   */
  retryOperation(
    id: string,
    error: string,
    retryCount: number,
    maxRetries: number
  ): void {
    this.updateOperation(id, {
      status: OperationStatus.RETRYING,
      error: {
        message: error,
        retryCount,
        maxRetries,
        lastRetryAt: new Date(),
      },
    });
  }

  /**
   * Marks an operation as completed successfully
   */
  completeOperation(id: string, metadata?: Record<string, any>): void {
    this.updateOperation(id, {
      status: OperationStatus.COMPLETED,
      completedAt: new Date(),
      metadata,
    });

    // Auto-cleanup completed operations after 30 seconds
    setTimeout(() => {
      this.removeOperation(id);
    }, 30000);
  }

  /**
   * Marks an operation as failed
   */
  failOperation(id: string, error: string): void {
    this.updateOperation(id, {
      status: OperationStatus.FAILED,
      completedAt: new Date(),
      error: {
        message: error,
        retryCount: 0,
        maxRetries: 0,
      },
    });

    // Auto-cleanup failed operations after 60 seconds
    setTimeout(() => {
      this.removeOperation(id);
    }, 60000);
  }

  /**
   * Removes an operation from tracking
   */
  removeOperation(id: string): void {
    const operation = this.operations.get(id);
    if (operation) {
      this.operations.delete(id);
      this.emit('operation:removed', { id });

      logger.debug('Operation removed', { id });
    }
  }

  /**
   * Gets a specific operation by ID
   */
  getOperation(id: string): Operation | undefined {
    return this.operations.get(id);
  }

  /**
   * Gets all active operations
   */
  getAllOperations(): Operation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Gets operations filtered by type
   */
  getOperationsByType(type: OperationType): Operation[] {
    return Array.from(this.operations.values()).filter(op => op.type === type);
  }

  /**
   * Gets operations filtered by status
   */
  getOperationsByStatus(status: OperationStatus): Operation[] {
    return Array.from(this.operations.values()).filter(
      op => op.status === status
    );
  }

  /**
   * Clears all completed and failed operations
   */
  clearCompleted(): void {
    const toRemove: string[] = [];

    for (const [id, operation] of this.operations) {
      if (
        operation.status === OperationStatus.COMPLETED ||
        operation.status === OperationStatus.FAILED
      ) {
        toRemove.push(id);
      }
    }

    toRemove.forEach(id => this.removeOperation(id));

    logger.info('Cleared completed operations', { count: toRemove.length });
  }
}

// Global singleton instance using globalThis to ensure it's shared across all Next.js API routes
// This prevents module isolation issues where different routes get separate instances
declare global {
  // eslint-disable-next-line no-var
  var __operationStatusManager: OperationStatusManager | undefined;
}

function getOperationStatusManager(): OperationStatusManager {
  if (!globalThis.__operationStatusManager) {
    logger.info('Creating new OperationStatusManager singleton');
    globalThis.__operationStatusManager = new OperationStatusManager();
  }
  return globalThis.__operationStatusManager;
}

const operationStatusManager = getOperationStatusManager();

export default operationStatusManager;

/**
 * Helper function to track an async operation with automatic status updates
 */
export async function trackOperation<T>(
  type: OperationType,
  name: string,
  fn: (operationId: string) => Promise<T>,
  options?: {
    description?: string;
    total?: number;
    metadata?: Record<string, any>;
  }
): Promise<T> {
  const operationId = operationStatusManager.createOperation(
    type,
    name,
    options
  );

  try {
    operationStatusManager.startOperation(operationId);
    const result = await fn(operationId);
    operationStatusManager.completeOperation(operationId);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    operationStatusManager.failOperation(operationId, errorMessage);
    throw error;
  }
}
