'use client';

import { DriveFolder } from '@/types/google-drive';
import {
  Folder,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Image,
  RefreshCw,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { FolderAlbumMapping } from './FileBrowser';
import { useToast } from '@/components/ui/Toast';

interface FolderItemProps {
  folder: DriveFolder;
  albumMapping?: FolderAlbumMapping;
  queueStatus?: string;
  onNavigate: (folderId: string) => void;
  onAlbumCreated: () => void;
}

export function FolderItem({
  folder,
  albumMapping,
  queueStatus,
  onNavigate,
  onAlbumCreated,
}: FolderItemProps) {
  const syncStatus = folder.syncStatus;
  const [working, setWorking] = useState(false);
  const [optimisticQueueStatus, setOptimisticQueueStatus] = useState<
    string | null
  >(null);
  const { showToast } = useToast();

  // Handle create/update album
  const handleAlbumAction = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent folder navigation

    // Optimistic UI update - immediately show queue status
    setOptimisticQueueStatus('PENDING');
    setWorking(true);

    try {
      const response = await fetch('/api/albums/queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderId: folder.id,
          folderName: folder.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        showToast(
          errorData.error || 'Failed to add folder to album queue',
          'error'
        );
        // Reset optimistic state on error
        setOptimisticQueueStatus(null);
        return;
      }

      const action = albumMapping ? 'update' : 'creation';
      showToast(`"${folder.name}" added to album ${action} queue`, 'success');

      // Refresh mappings after adding to queue
      onAlbumCreated();
    } catch (error) {
      console.error('Error adding folder to album queue:', error);
      showToast('Failed to add folder to album queue', 'error');
      // Reset optimistic state on error
      setOptimisticQueueStatus(null);
    } finally {
      setWorking(false);
    }
  };

  // Determine sync status badge
  const getSyncBadge = () => {
    if (!syncStatus) {
      return null;
    }

    // Show badge for folders with items
    if (syncStatus.totalCount > 0) {
      if (syncStatus.status === 'synced') {
        return (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
            <CheckCircle2 className="h-3 w-3" />
            Synced
          </div>
        );
      }

      if (syncStatus.status === 'partial') {
        return (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-yellow-600 px-2 py-0.5 text-xs font-semibold text-white">
            <AlertCircle className="h-3 w-3" />
            {syncStatus.percentage}%
          </div>
        );
      }

      if (syncStatus.status === 'unsynced') {
        return (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-gray-500 px-2 py-0.5 text-xs font-semibold text-white">
            <AlertCircle className="h-3 w-3" />
            0%
          </div>
        );
      }
    }

    // Empty folders (totalCount === 0) - only show if folder was actually checked
    // Don't show badge for folders that were never enumerated from Drive
    if (syncStatus.totalCount === 0 && syncStatus.hasBeenEnumerated === true) {
      return (
        <div
          className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-gray-400 px-2 py-0.5 text-xs font-semibold text-white"
          title="Folder was checked and is empty"
        >
          Empty
        </div>
      );
    }

    // No badge for unchecked folders (clean look)
    return null;
  };

  // Clear optimistic queue status when real queue status arrives
  useEffect(() => {
    if (queueStatus && optimisticQueueStatus) {
      setOptimisticQueueStatus(null);
    }
  }, [queueStatus, optimisticQueueStatus]);

  // Check if folder is already in queue (active status)
  // Use optimistic state if available, otherwise use prop
  const effectiveQueueStatus = optimisticQueueStatus || queueStatus;
  const isInQueue =
    effectiveQueueStatus &&
    ['PENDING', 'UPLOADING', 'CREATING', 'UPDATING'].includes(
      effectiveQueueStatus
    );

  // Determine button text and style
  const getButtonConfig = () => {
    // If in queue, show "In Queue" status
    if (isInQueue) {
      return {
        text: `In Queue (${effectiveQueueStatus})`,
        icon: <Clock className="h-3 w-3" />,
        className:
          'text-gray-700 bg-gray-100 border-gray-300 cursor-not-allowed',
      };
    }

    if (!albumMapping) {
      // No album exists - show Create Album
      return {
        text: 'Create Album',
        // eslint-disable-next-line jsx-a11y/alt-text
        icon: <Image className="h-3 w-3" aria-hidden="true" />,
        className: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100',
      };
    }

    if (albumMapping.albumDeleted) {
      // Album was deleted - show Recreate Album
      return {
        text: 'Recreate Album',
        icon: <RefreshCw className="h-3 w-3" />,
        className:
          'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100',
      };
    }

    // Album exists - show Update Album
    return {
      text: 'Update Album',
      icon: <RefreshCw className="h-3 w-3" />,
      className:
        'text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100',
    };
  };

  const buttonConfig = getButtonConfig();

  return (
    <div
      className="group relative cursor-pointer rounded-lg border-2 border-gray-200 bg-white p-4 transition-all hover:border-blue-400 hover:bg-blue-50 hover:shadow-lg"
      onClick={() => onNavigate(folder.id)}
    >
      {/* Sync status badge */}
      {getSyncBadge()}

      {/* Folder icon */}
      <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-blue-100 to-blue-200">
        <Folder className="h-20 w-20 text-blue-600" />
      </div>

      {/* Folder info */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h3
            className="flex-1 truncate text-sm font-medium text-gray-900"
            title={folder.name}
          >
            <span className="flex items-center gap-2">
              {folder.name}
              {/* Status icon next to folder name */}
              {isInQueue && (
                <span title={`In queue (${effectiveQueueStatus})`}>
                  <Clock className="h-4 w-4 flex-shrink-0 text-orange-500" />
                </span>
              )}
              {!isInQueue && albumMapping && !albumMapping.albumDeleted && (
                <span title="Has album in Google Photos">
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image
                    className="h-4 w-4 flex-shrink-0 text-green-600"
                    aria-hidden="true"
                  />
                </span>
              )}
              <a
                href={`https://drive.google.com/drive/folders/${folder.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={e => e.stopPropagation()}
                title="Open in Google Drive"
              >
                <ExternalLink className="h-4 w-4 text-gray-500 hover:text-blue-600" />
              </a>
            </span>
          </h3>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
        </div>

        <p className="text-xs text-gray-500">
          Folder
          {syncStatus && syncStatus.totalCount > 0 && (
            <span className="ml-1 text-gray-400">
              • {syncStatus.syncedCount}/{syncStatus.totalCount} items
            </span>
          )}
        </p>

        {/* Queue Status Badge */}
        {isInQueue && (
          <div className="flex items-center gap-1 text-xs">
            <Clock
              className={`h-3 w-3 ${
                effectiveQueueStatus === 'PENDING'
                  ? 'text-orange-600'
                  : effectiveQueueStatus === 'UPLOADING'
                    ? 'text-blue-600'
                    : 'text-purple-600'
              }`}
            />
            <span
              className={`font-medium ${
                effectiveQueueStatus === 'PENDING'
                  ? 'text-orange-600'
                  : effectiveQueueStatus === 'UPLOADING'
                    ? 'text-blue-600'
                    : 'text-purple-600'
              }`}
            >
              In Queue ({effectiveQueueStatus})
            </span>
          </div>
        )}

        {/* Album Badge */}
        {albumMapping && !albumMapping.albumDeleted && (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image className="h-3 w-3 text-green-600" aria-hidden="true" />
            <span className="font-medium text-green-600">Has Album</span>
            {albumMapping.photosAlbumUrl && (
              <a
                href={albumMapping.photosAlbumUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="ml-1 text-blue-600 hover:underline"
                title="View album in Google Photos"
              >
                <ExternalLink className="inline h-3 w-3" />
              </a>
            )}
            <span className="text-gray-400">
              • {albumMapping.totalItemsInAlbum} items
            </span>
          </div>
        )}

        {/* Deleted Album Warning */}
        {albumMapping && albumMapping.albumDeleted && (
          <div className="flex items-center gap-1 text-xs font-medium text-orange-600">
            <AlertTriangle className="h-3 w-3" />
            <span>Album Deleted</span>
          </div>
        )}

        {/* Create/Update Album Button */}
        <button
          onClick={handleAlbumAction}
          disabled={working || !!isInQueue}
          className={`relative z-10 mt-2 flex w-full items-center justify-center gap-1 rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonConfig.className}`}
          title={
            isInQueue
              ? `Already in queue (${effectiveQueueStatus})`
              : albumMapping
                ? albumMapping.albumDeleted
                  ? 'Recreate album in Google Photos'
                  : 'Update album with new files'
                : 'Create album from this folder'
          }
        >
          {buttonConfig.icon}
          {working ? 'Adding...' : buttonConfig.text}
        </button>
      </div>

      {/* Hover indicator */}
      <div className="absolute inset-0 rounded-lg border-2 border-transparent transition-all group-hover:border-blue-500 group-hover:bg-blue-50/50" />
    </div>
  );
}
