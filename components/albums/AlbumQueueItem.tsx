'use client';

import { AlbumQueueItem as AlbumQueueItemType } from '@/types/album-queue';
import {
  FolderIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Trash2,
  FolderOpen,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AlbumQueueItemProps {
  item: AlbumQueueItemType;
  onRemove: (id: string) => void;
}

export function AlbumQueueItem({ item, onRemove }: AlbumQueueItemProps) {
  const router = useRouter();

  const getStatusIcon = () => {
    switch (item.status) {
      case 'PENDING':
        return <Clock className="h-5 w-5 text-gray-500" />;
      case 'UPLOADING':
      case 'CREATING':
      case 'UPDATING':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'COMPLETED':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'FAILED':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'CANCELLED':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'PENDING':
        return 'Pending';
      case 'UPLOADING':
        return 'Uploading files...';
      case 'CREATING':
        return 'Creating album...';
      case 'UPDATING':
        return 'Updating album...';
      case 'COMPLETED':
        return 'Completed';
      case 'FAILED':
        return 'Failed';
      case 'CANCELLED':
        return 'Cancelled';
    }
  };

  const getStatusColor = () => {
    switch (item.status) {
      case 'PENDING':
        return 'bg-gray-50 border-gray-200';
      case 'UPLOADING':
      case 'CREATING':
      case 'UPDATING':
        return 'bg-blue-50 border-blue-200';
      case 'COMPLETED':
        return 'bg-green-50 border-green-200';
      case 'FAILED':
        return 'bg-red-50 border-red-200';
      case 'CANCELLED':
        return 'bg-orange-50 border-orange-200';
    }
  };

  const getModeText = () => {
    if (!item.mode) return null;
    return item.mode === 'CREATE' ? 'Creating' : 'Updating';
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const handleNavigateToFolder = () => {
    router.push(`/drive?folder=${item.driveFolderId}`);
  };

  const canRemove =
    item.status === 'PENDING' ||
    item.status === 'FAILED' ||
    item.status === 'CANCELLED';

  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-4 transition-all ${getStatusColor()}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Status Icon */}
        <div className="flex-shrink-0">{getStatusIcon()}</div>

        {/* Folder Icon */}
        <div className="flex-shrink-0">
          <FolderIcon className="h-8 w-8 text-gray-400" />
        </div>

        {/* Album Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {item.folderName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{getStatusText()}</span>
            {item.mode && (
              <>
                <span>•</span>
                <span className="rounded bg-gray-200 px-1.5 py-0.5 font-medium">
                  {getModeText()}
                </span>
              </>
            )}
            {item.totalFiles !== null && (
              <>
                <span>•</span>
                <span>
                  {item.uploadedFiles} / {item.totalFiles} files
                </span>
              </>
            )}
            {item.createdAt && (
              <>
                <span>•</span>
                <span>Added {formatDate(item.createdAt)}</span>
              </>
            )}
          </div>

          {/* Google Photos Link */}
          {item.photosAlbumUrl && (
            <a
              href={item.photosAlbumUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline"
              onClick={e => e.stopPropagation()}
            >
              View in Google Photos
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Error Message */}
          {item.error && (
            <p className="mt-1 text-xs text-red-600">{item.error}</p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        {/* Navigate to Folder Button */}
        <button
          onClick={handleNavigateToFolder}
          className="rounded-md p-2 text-gray-400 transition-colors hover:bg-white hover:text-blue-600"
          title="Navigate to folder in Drive"
        >
          <FolderOpen className="h-4 w-4" />
        </button>

        {/* Remove Button (only for pending, failed, and cancelled items) */}
        {canRemove && (
          <button
            onClick={() => onRemove(item.id)}
            className="rounded-md p-2 text-gray-400 transition-colors hover:bg-white hover:text-red-600"
            title="Remove from queue"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
