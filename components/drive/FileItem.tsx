'use client';

import { DriveFile } from '@/types/google-drive';
import { FileImage, FileVideo, File } from 'lucide-react';
import Image from 'next/image';

interface FileItemProps {
  file: DriveFile;
  isSelected: boolean;
  onToggleSelect: (file: DriveFile) => void;
}

export function FileItem({ file, isSelected, onToggleSelect }: FileItemProps) {
  const isImage = file.mimeType.startsWith('image/');
  const isVideo = file.mimeType.startsWith('video/');

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
      }`}
      onClick={() => onToggleSelect(file)}
    >
      {/* Selection checkbox */}
      <div className="absolute top-2 right-2 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(file)}
          className="h-5 w-5 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Thumbnail or icon */}
      <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-md bg-gray-100">
        {file.thumbnailLink ? (
          <Image
            src={file.thumbnailLink}
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
