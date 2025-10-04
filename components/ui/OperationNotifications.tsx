'use client';

import { Operation, OperationStatus } from '@/lib/operation-status';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, X } from 'lucide-react';
import { useOperationNotifications } from '@/components/OperationNotificationsContext';

interface NotificationItemProps {
  operation: Operation;
}

function NotificationItem({ operation }: NotificationItemProps) {
  const getIcon = () => {
    switch (operation.status) {
      case OperationStatus.COMPLETED:
        return <CheckCircle2 className="h-7 w-7 text-green-400" />;
      case OperationStatus.FAILED:
        return <XCircle className="h-7 w-7 text-red-400" />;
      case OperationStatus.RETRYING:
        return <AlertTriangle className="h-7 w-7 text-yellow-400" />;
      case OperationStatus.IN_PROGRESS:
      case OperationStatus.PENDING:
        return <Loader2 className="h-7 w-7 animate-spin text-sky-400" />;
    }
  };

  const getStatusText = () => {
    if (operation.status === OperationStatus.RETRYING && operation.error) {
      return `Retrying (${operation.error.retryCount}/${operation.error.maxRetries})...`;
    }
    return operation.status;
  };

  return (
    <div className="w-full transform-gpu rounded-none bg-transparent p-3 shadow-none transition-all duration-300 ease-in-out">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{getIcon()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="truncate text-sm font-semibold text-white">
              {operation.name}
            </p>
          </div>

          {operation.description && (
            <p className="mt-0.5 text-xs text-slate-300">
              {operation.description}
            </p>
          )}

          {operation.progress && (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                <span>
                  {operation.progress.current} / {operation.progress.total}
                </span>
                <span className="font-medium text-slate-200">
                  {operation.progress.percentage}%
                </span>
              </div>

              <div className="relative h-3 w-full overflow-visible rounded-full bg-slate-800">
                <div
                  className={`absolute top-0 left-0 h-3 rounded-full transition-all duration-300 ${
                    operation.status === OperationStatus.FAILED
                      ? 'bg-red-500'
                      : operation.status === OperationStatus.RETRYING
                        ? 'bg-yellow-400'
                        : operation.status === OperationStatus.COMPLETED
                          ? 'bg-green-400'
                          : 'bg-sky-400'
                  }`}
                  style={{ width: `${operation.progress.percentage}%` }}
                />

                {/* indicator dot */}
                <div
                  className="absolute top-1/2 z-10 -translate-y-1/2 transform rounded-full shadow-md"
                  style={{
                    left: `${operation.progress.percentage}%`,
                    width: 10,
                    height: 10,
                    marginLeft: -5,
                    background:
                      operation.status === OperationStatus.RETRYING
                        ? '#F59E0B'
                        : operation.status === OperationStatus.FAILED
                          ? '#EF4444'
                          : operation.status === OperationStatus.COMPLETED
                            ? '#34D399'
                            : '#38BDF8',
                  }}
                />
              </div>
            </div>
          )}

          <p className="mt-2 text-sm font-medium text-slate-300">
            {getStatusText()}
          </p>

          {operation.error &&
            (operation.status === OperationStatus.FAILED ||
              operation.status === OperationStatus.RETRYING) && (
              <p className="mt-2 text-sm break-words text-red-300">
                {operation.error.message}
              </p>
            )}
        </div>
      </div>
    </div>
  );
}

export function OperationNotifications() {
  const { operations, isOpen, toggle } = useOperationNotifications();

  if (!isOpen || operations.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-start p-4 sm:p-6 lg:pl-64">
      <div className="pointer-events-auto flex w-full max-w-sm flex-col space-y-0">
        <div className="flex items-center justify-between rounded-none bg-slate-900/80 px-3 py-2 shadow-none backdrop-blur-sm backdrop-filter">
          <h3 className="text-sm font-semibold text-white">
            Ongoing Operations
          </h3>
          <button
            onClick={toggle}
            className="rounded-full p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close notifications"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] w-full overflow-y-auto rounded-none bg-slate-900/90 pr-2">
          <div className="divide-y divide-slate-800">
            {operations.map(operation => (
              <NotificationItem key={operation.id} operation={operation} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
