'use client';

import { DriveFile, DriveFolder } from '@/types/google-drive';
import { FileItem } from './FileItem';
import { FolderItem } from './FolderItem';

interface FileGridProps {
  items: (DriveFile | DriveFolder)[];
  selectedFiles: Set<string>;
  queuedFiles: Set<string>;
  onToggleSelect: (file: DriveFile) => void;
  onNavigate: (folderId: string) => void;
}

export function FileGrid({
  items,
  selectedFiles,
  queuedFiles,
  onToggleSelect,
  onNavigate,
}: FileGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No files found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            This folder is empty or contains no supported media files.
          </p>
        </div>
      </div>
    );
  }

  // Separate folders and files
  const folders = items.filter(
    item => item.mimeType === 'application/vnd.google-apps.folder'
  ) as DriveFolder[];
  const files = items.filter(
    item => item.mimeType !== 'application/vnd.google-apps.folder'
  ) as DriveFile[];

  return (
    <div className="space-y-6">
      {/* Folders section */}
      {folders.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Folders ({folders.length})
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {folders.map(folder => (
              <FolderItem
                key={folder.id}
                folder={folder}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Files section */}
      {files.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Files ({files.length})
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {files.map(file => (
              <FileItem
                key={file.id}
                file={file}
                isSelected={selectedFiles.has(file.id)}
                isQueued={queuedFiles.has(file.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
