'use client';

import { QueueItem as QueueItemType } from '@/types/upload-queue';
import {
  FileIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

interface QueueItemProps {
  item: QueueItemType;
  onRemove: (id: string) => void;
}

interface FolderPath {
  id: string;
  name: string;
}

interface EnrichResponse {
  success: boolean;
  folderPath: FolderPath[] | null;
  error?: string;
}

// Simple in-memory cache for folder paths to avoid duplicate API calls
const folderPathCache = new Map<string, FolderPath[] | null>();

export function QueueItem({ item, onRemove }: QueueItemProps) {
  const router = useRouter();
  const [folderPath, setFolderPath] = useState<FolderPath[] | null>(
    item.folderPath || null
  );
  const [isLoadingPath, setIsLoadingPath] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
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

  const fetchFolderPath = useCallback(async () => {
    if (isLoadingPath) return;

    // Check cache first
    const cacheKey = item.id;
    if (folderPathCache.has(cacheKey)) {
      const cachedPath = folderPathCache.get(cacheKey);
      setFolderPath(cachedPath || null);
      return;
    }

    setIsLoadingPath(true);
    setPathError(null);

    try {
      const response = await fetch(`/api/queue/${item.id}/enrich`);

      if (!response.ok) {
        throw new Error(`Failed to fetch folder path: ${response.status}`);
      }

      const data: EnrichResponse = await response.json();

      if (data.success) {
        // Cache the result
        folderPathCache.set(cacheKey, data.folderPath);
        setFolderPath(data.folderPath);
      } else {
        setPathError(data.error || 'Failed to load folder path');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setPathError(errorMessage);
      console.warn('Failed to fetch folder path for queue item:', errorMessage);
    } finally {
      setIsLoadingPath(false);
    }
  }, [item.id, isLoadingPath]);

  // Fetch folder path on component mount if not already available
  useEffect(() => {
    const shouldFetchPath = !folderPath && !isLoadingPath && !pathError;

    if (shouldFetchPath) {
      // Add a small delay to batch requests and avoid overwhelming the API
      const timeoutId = setTimeout(() => {
        fetchFolderPath();
      }, Math.random() * 500); // Random delay between 0-500ms to spread requests

      return () => clearTimeout(timeoutId);
    }
  }, [folderPath, isLoadingPath, pathError, fetchFolderPath]); // Dependencies to control when to fetch

  const handleNavigateToFolder = () => {
    if (folderPath && folderPath.length > 0) {
      // Navigate to the file's parent folder in the drive browser
      const parentFolder = folderPath[folderPath.length - 1];
      router.push(`/drive?folder=${parentFolder.id}`);
    }
  };

  const renderFolderPath = () => {
    if (isLoadingPath) {
      return (
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading path...</span>
        </div>
      );
    }

    if (pathError) {
      return (
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
          <FolderOpen className="h-3 w-3" />
          <span className="truncate">Path unavailable</span>
        </div>
      );
    }

    if (!folderPath || folderPath.length === 0) {
      return null;
    }

    const pathString = folderPath.map(folder => folder.name).join(' / ');

    return (
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
        <FolderOpen className="h-3 w-3" />
        <span className="truncate">{pathString}</span>
      </div>
    );
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
          {renderFolderPath()}
          {item.error && (
            <p className="mt-1 text-xs text-red-600">{item.error}</p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        {/* Navigate to Folder Button */}
        {folderPath && folderPath.length > 0 && (
          <button
            onClick={handleNavigateToFolder}
            className="rounded-md p-2 text-gray-400 transition-colors hover:bg-white hover:text-blue-600"
            title="Navigate to folder"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        )}

        {/* Remove Button (only for pending and failed items) */}
        {(item.status === 'pending' || item.status === 'failed') && (
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
