'use client';

import { useEffect, useState, useCallback } from 'react';
import { Operation, OperationStatus } from '@/lib/operation-status';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, X } from 'lucide-react';

interface NotificationItemProps {
  operation: Operation;
  onDismiss: (id: string) => void;
}

function NotificationItem({ operation, onDismiss }: NotificationItemProps) {
  const [isExiting, setIsExiting] = useState(false);

  // Auto-dismiss completed operations after 5 seconds
  useEffect(() => {
    if (operation.status === OperationStatus.COMPLETED) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [operation.status]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(operation.id);
    }, 300); // Match animation duration
  };

  const getIcon = () => {
    switch (operation.status) {
      case OperationStatus.COMPLETED:
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case OperationStatus.FAILED:
        return <XCircle className="h-5 w-5 text-red-500" />;
      case OperationStatus.RETRYING:
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case OperationStatus.IN_PROGRESS:
      case OperationStatus.PENDING:
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }
  };

  const getBorderColor = () => {
    switch (operation.status) {
      case OperationStatus.COMPLETED:
        return 'border-green-500';
      case OperationStatus.FAILED:
        return 'border-red-500';
      case OperationStatus.RETRYING:
        return 'border-yellow-500';
      default:
        return 'border-blue-500';
    }
  };

  const getStatusText = () => {
    if (operation.status === OperationStatus.RETRYING && operation.error) {
      return `Retrying (${operation.error.retryCount}/${operation.error.maxRetries})...`;
    }
    return operation.status;
  };

  return (
    <div
      className={`mb-3 w-full max-w-md rounded-lg border-l-4 bg-white p-4 shadow-lg transition-all duration-300 dark:bg-gray-800 ${getBorderColor()} ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'} `}
    >
      <div className="flex items-start gap-3">
        {getIcon()}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {operation.name}
            </p>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {operation.description && (
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {operation.description}
            </p>
          )}

          {/* Progress bar */}
          {operation.progress && (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>
                  {operation.progress.current} / {operation.progress.total}
                </span>
                <span>{operation.progress.percentage}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    operation.status === OperationStatus.FAILED
                      ? 'bg-red-500'
                      : operation.status === OperationStatus.RETRYING
                        ? 'bg-yellow-500'
                        : operation.status === OperationStatus.COMPLETED
                          ? 'bg-green-500'
                          : 'bg-blue-500'
                  }`}
                  style={{ width: `${operation.progress.percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Status text */}
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {getStatusText()}
          </p>

          {/* Error message */}
          {operation.error && operation.status === OperationStatus.FAILED && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {operation.error.message}
            </p>
          )}

          {/* Retry message */}
          {operation.error && operation.status === OperationStatus.RETRYING && (
            <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
              {operation.error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function OperationNotifications() {
  const [operations, setOperations] = useState<Operation[]>([]);

  const handleDismiss = useCallback((id: string) => {
    setOperations(prev => prev.filter(op => op.id !== id));
  }, []);

  useEffect(() => {
    console.log('[OperationNotifications] Connecting to SSE...');
    // Connect to SSE endpoint for real-time updates
    const eventSource = new EventSource('/api/operations/stream');

    eventSource.addEventListener('connected', event => {
      const data = JSON.parse(event.data);
      console.log('[OperationNotifications] SSE Connected, initial operations:', data.operations);
      setOperations(data.operations || []);
    });

    eventSource.addEventListener('operation:created', event => {
      const operation: Operation = JSON.parse(event.data);
      console.log('[OperationNotifications] Operation created:', operation);
      setOperations(prev => [...prev, operation]);
    });

    eventSource.addEventListener('operation:updated', event => {
      const operation: Operation = JSON.parse(event.data);
      console.log('[OperationNotifications] Operation updated:', operation);
      setOperations(prev =>
        prev.map(op => (op.id === operation.id ? operation : op))
      );
    });

    eventSource.addEventListener('operation:removed', event => {
      const data = JSON.parse(event.data);
      console.log('[OperationNotifications] Operation removed:', data.id);
      setOperations(prev => prev.filter(op => op.id !== data.id));
    });

    eventSource.addEventListener('heartbeat', event => {
      const data = JSON.parse(event.data);
      console.log('[OperationNotifications] Heartbeat:', data.timestamp);
    });

    eventSource.onerror = error => {
      console.error('[OperationNotifications] SSE connection error:', error);
      eventSource.close();

      // Retry connection after 5 seconds
      setTimeout(() => {
        console.log('[OperationNotifications] Reloading page...');
        window.location.reload();
      }, 5000);
    };

    return () => {
      console.log('[OperationNotifications] Disconnecting SSE...');
      eventSource.close();
    };
  }, []);

  if (operations.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex max-h-[80vh] flex-col items-end overflow-y-auto">
      {operations.map(operation => (
        <NotificationItem
          key={operation.id}
          operation={operation}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}
