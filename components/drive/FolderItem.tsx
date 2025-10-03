'use client';

import { DriveFolder } from '@/types/google-drive';
import { Folder, ChevronRight } from 'lucide-react';

interface FolderItemProps {
  folder: DriveFolder;
  onNavigate: (folderId: string) => void;
}

export function FolderItem({ folder, onNavigate }: FolderItemProps) {
  return (
    <div
      className="group relative cursor-pointer rounded-lg border-2 border-gray-200 bg-white p-4 transition-all hover:border-blue-400 hover:bg-blue-50 hover:shadow-lg"
      onClick={() => onNavigate(folder.id)}
    >
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
            {folder.name}
          </h3>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
        </div>
        <p className="text-xs text-gray-500">Folder</p>
      </div>

      {/* Hover indicator */}
      <div className="absolute inset-0 rounded-lg border-2 border-transparent transition-all group-hover:border-blue-500 group-hover:bg-blue-50/50" />
    </div>
  );
}
