'use client';

import { QueueItem as QueueItemType } from '@/types/upload-queue';
import {
  FileIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Trash2,
} from 'lucide-react';

interface QueueItemProps {
  item: QueueItemType;
  onRemove: (id: string) => void;
}

export function QueueItem({ item, onRemove }: QueueItemProps) {
  const getStatusIcon = () => {
    switch (item.status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-500" />;
      case 'uploading':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'pending':
        return 'Pending';
      case 'uploading':
        return 'Uploading...';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
    }
  };

  const getStatusColor = () => {
    switch (item.status) {
      case 'pending':
        return 'bg-gray-50 border-gray-200';
      case 'uploading':
        return 'bg-blue-50 border-blue-200';
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'failed':
        return 'bg-red-50 border-red-200';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-4 transition-all ${getStatusColor()}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Status Icon */}
        <div className="flex-shrink-0">{getStatusIcon()}</div>

        {/* File Icon */}
        <div className="flex-shrink-0">
          <FileIcon className="h-8 w-8 text-gray-400" />
        </div>

        {/* File Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {item.fileName}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
            <span>{getStatusText()}</span>
            {item.fileSize && (
              <>
                <span>•</span>
                <span>{formatFileSize(item.fileSize)}</span>
              </>
            )}
            {item.addedAt && (
              <>
                <span>•</span>
                <span>Added {formatDate(item.addedAt)}</span>
              </>
            )}
          </div>
          {item.error && (
            <p className="mt-1 text-xs text-red-600">{item.error}</p>
          )}
        </div>
      </div>

      {/* Remove Button (only for pending and failed items) */}
      {(item.status === 'pending' || item.status === 'failed') && (
        <button
          onClick={() => onRemove(item.id)}
          className="ml-4 flex-shrink-0 rounded-md p-2 text-gray-400 transition-colors hover:bg-white hover:text-red-600"
          title="Remove from queue"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
