import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import operationStatusManager, {
  OperationType,
  OperationStatus,
} from './operation-status';

describe('OperationStatusManager', () => {
  beforeEach(() => {
    // Reset the manager's state before each test
    operationStatusManager.clearCompleted();
    const allOps = operationStatusManager.getAllOperations();
    allOps.forEach(op => operationStatusManager.removeOperation(op.id));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a new operation with default values', () => {
    const operationId = operationStatusManager.createOperation(
      OperationType.SHORT_READ,
      'Test Operation'
    );
    const operation = operationStatusManager.getOperation(operationId);

    expect(operation).toBeDefined();
    expect(operation?.id).toBe(operationId);
    expect(operation?.name).toBe('Test Operation');
    expect(operation?.type).toBe(OperationType.SHORT_READ);
    expect(operation?.status).toBe(OperationStatus.PENDING);
    expect(operation?.progress).toBeUndefined();
    expect(operation?.error).toBeUndefined();
  });

  it('should create an operation with initial progress', () => {
    const operationId = operationStatusManager.createOperation(
      OperationType.LONG_WRITE,
      'Test Upload',
      { total: 100 }
    );
    const operation = operationStatusManager.getOperation(operationId);

    expect(operation?.progress).toEqual({
      current: 0,
      total: 100,
      percentage: 0,
    });
  });

  it('should start an operation', () => {
    const operationId = operationStatusManager.createOperation(
      OperationType.SHORT_READ,
      'Test'
    );
    operationStatusManager.startOperation(operationId);
    const operation = operationStatusManager.getOperation(operationId);
    expect(operation?.status).toBe(OperationStatus.IN_PROGRESS);
  });

  it('should update operation progress', () => {
    const operationId = operationStatusManager.createOperation(
      OperationType.LONG_READ,
      'Test Progress',
      { total: 200 }
    );
    operationStatusManager.updateProgress(operationId, 50);
    let operation = operationStatusManager.getOperation(operationId);
    expect(operation?.progress).toEqual({
      current: 50,
      total: 200,
      percentage: 25,
    });

    operationStatusManager.updateProgress(operationId, 100, 300);
    operation = operationStatusManager.getOperation(operationId);
    expect(operation?.progress?.total).toBe(300);
    expect(operation?.progress?.percentage).toBe(33);
  });

  it('should mark an operation as retrying', () => {
    const operationId = operationStatusManager.createOperation(
      OperationType.LONG_WRITE,
      'Test Retry'
    );
    operationStatusManager.retryOperation(operationId, 'Network Error', 1, 3);
    const operation = operationStatusManager.getOperation(operationId);
    expect(operation?.status).toBe(OperationStatus.RETRYING);
    expect(operation?.error?.message).toBe('Network Error');
    expect(operation?.error?.retryCount).toBe(1);
    expect(operation?.error?.maxRetries).toBe(3);
  });

  it('should complete an operation and clean it up after a timeout', () => {
    const operationId = operationStatusManager.createOperation(
      OperationType.SHORT_WRITE,
      'Test Completion'
    );
    operationStatusManager.completeOperation(operationId, { success: true });
    const operation = operationStatusManager.getOperation(operationId);

    expect(operation?.status).toBe(OperationStatus.COMPLETED);
    expect(operation?.completedAt).toBeInstanceOf(Date);
    expect(operation?.metadata?.success).toBe(true);

    // Advance time by 30 seconds
    vi.advanceTimersByTime(30000);

    const cleanedOperation = operationStatusManager.getOperation(operationId);
    expect(cleanedOperation).toBeUndefined();
  });

  it('should fail an operation and clean it up after a timeout', () => {
    const operationId = operationStatusManager.createOperation(
      OperationType.SHORT_WRITE,
      'Test Failure'
    );
    operationStatusManager.failOperation(operationId, 'Something went wrong');
    const operation = operationStatusManager.getOperation(operationId);

    expect(operation?.status).toBe(OperationStatus.FAILED);
    expect(operation?.completedAt).toBeInstanceOf(Date);
    expect(operation?.error?.message).toBe('Something went wrong');

    // Advance time by 60 seconds
    vi.advanceTimersByTime(60000);

    const cleanedOperation = operationStatusManager.getOperation(operationId);
    expect(cleanedOperation).toBeUndefined();
  });

  it('should emit an event when an operation is created', () => {
    const listener = vi.fn();
    operationStatusManager.on('operation:created', listener);

    const operationId = operationStatusManager.createOperation(
      OperationType.SHORT_READ,
      'Event Test'
    );
    const operation = operationStatusManager.getOperation(operationId);

    expect(listener).toHaveBeenCalledWith(operation);
  });

  it('should emit an event when an operation is updated', () => {
    const listener = vi.fn();
    const operationId = operationStatusManager.createOperation(
      OperationType.SHORT_READ,
      'Event Test'
    );
    operationStatusManager.on('operation:updated', listener);

    operationStatusManager.startOperation(operationId);
    const operation = operationStatusManager.getOperation(operationId);

    expect(listener).toHaveBeenCalledWith(operation);
  });

  it('should emit an event when an operation is removed', () => {
    const listener = vi.fn();
    const operationId = operationStatusManager.createOperation(
      OperationType.SHORT_READ,
      'Event Test'
    );
    operationStatusManager.on('operation:removed', listener);

    operationStatusManager.removeOperation(operationId);

    expect(listener).toHaveBeenCalledWith({ id: operationId });
  });

  it('should clear all completed and failed operations', () => {
    const op1 = operationStatusManager.createOperation(
      OperationType.SHORT_READ,
      'Op 1'
    );
    const op2 = operationStatusManager.createOperation(
      OperationType.SHORT_READ,
      'Op 2'
    );
    const op3 = operationStatusManager.createOperation(
      OperationType.SHORT_READ,
      'Op 3'
    );

    operationStatusManager.completeOperation(op1);
    operationStatusManager.failOperation(op2, 'Failed');
    operationStatusManager.startOperation(op3);

    expect(operationStatusManager.getAllOperations().length).toBe(3);

    operationStatusManager.clearCompleted();

    const remainingOps = operationStatusManager.getAllOperations();
    expect(remainingOps.length).toBe(1);
    expect(remainingOps[0].id).toBe(op3);
  });
});
