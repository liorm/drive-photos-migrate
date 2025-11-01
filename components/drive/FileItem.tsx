'use client';

import { DriveFile } from '@/types/google-drive';
import {
  FileImage,
  FileVideo,
  File,
  CheckCircle2,
  Clock,
  EyeOff,
} from 'lucide-react';
import { LazyImage } from '@/components/ui/LazyImage';

interface FileItemProps {
  file: DriveFile;
  isSelected: boolean;
  isQueued: boolean;
  onToggleSelect: (file: DriveFile) => void;
}

export function FileItem({
  file,
  isSelected,
  isQueued,
  onToggleSelect,
}: FileItemProps) {
  const isImage = file.mimeType.startsWith('image/');
  const isVideo = file.mimeType.startsWith('video/');
  const isSynced = file.syncStatus === 'synced';
  const isIgnored = file.isIgnored || false;

  // Format file size
  const formatSize = (bytes?: string) => {
    if (!bytes) return 'Unknown size';
    const size = parseInt(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024)
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div
      className={`group relative cursor-pointer rounded-lg border-2 bg-white p-4 transition-all hover:shadow-lg ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300'
      } ${isIgnored ? 'opacity-60' : ''}`}
      onClick={() => !isIgnored && onToggleSelect(file)}
    >
      {/* Selection checkbox */}
      <div className="absolute top-2 right-2 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(file)}
          className="h-5 w-5 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          onClick={e => e.stopPropagation()}
          disabled={isIgnored}
        />
      </div>

      {/* Thumbnail or icon */}
      <div className="relative mb-3 flex h-32 items-center justify-center overflow-hidden rounded-md bg-gray-100">
        {file.thumbnailLink ? (
          <LazyImage
            fileId={file.id}
            alt={file.name}
            width={128}
            height={128}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {isImage && <FileImage className="h-16 w-16 text-blue-500" />}
            {isVideo && <FileVideo className="h-16 w-16 text-purple-500" />}
            {!isImage && !isVideo && (
              <File className="h-16 w-16 text-gray-400" />
            )}
          </div>
        )}

        {/* Synced badge on thumbnail */}
        {isSynced && !isIgnored && (
          <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white shadow-md">
            <CheckCircle2 className="h-3 w-3" />
            Synced
          </div>
        )}

        {/* Ignored badge on thumbnail */}
        {isIgnored && (
          <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-gray-600 px-2 py-0.5 text-xs font-semibold text-white shadow-md">
            <EyeOff className="h-3 w-3" />
            Ignored
          </div>
        )}

        {/* Queued badge on thumbnail */}
        {isQueued && !isSynced && (
          <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-orange-600 px-2 py-0.5 text-xs font-semibold text-white shadow-md">
            <Clock className="h-3 w-3" />
            Queued
          </div>
        )}
      </div>

      {/* File info */}
      <div className="space-y-1">
        <h3
          className="truncate text-sm font-medium text-gray-900"
          title={file.name}
        >
          {file.name}
        </h3>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{isImage ? 'Image' : isVideo ? 'Video' : 'File'}</span>
          <span>{formatSize(file.size)}</span>
        </div>
      </div>

      {/* Selected badge */}
      {isSelected && (
        <div className="absolute top-2 left-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
          Selected
        </div>
      )}
    </div>
  );
}
