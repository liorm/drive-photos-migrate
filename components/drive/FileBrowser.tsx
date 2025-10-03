'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DriveFile, DriveFolder, BreadcrumbItem } from '@/types/google-drive';
import { FileGrid } from './FileGrid';
import {
  ChevronRight,
  Home,
  Loader2,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';

interface FileBrowserProps {
  initialFolderId?: string;
}

interface ApiResponse {
  files: (DriveFile | DriveFolder)[];
  nextPageToken?: string;
  folderPath: BreadcrumbItem[];
}

export function FileBrowser({ initialFolderId = 'root' }: FileBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Use URL as source of truth for current folder
  const currentFolderId = searchParams.get('folder') || initialFolderId;

  const [items, setItems] = useState<(DriveFile | DriveFolder)[]>([]);
  const [folderPath, setFolderPath] = useState<BreadcrumbItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();

  // Fetch files from API
  const fetchFiles = useCallback(
    async (folderId: string, pageToken?: string) => {
      try {
        setLoading(true);
        setError(null);

        const url = new URL('/api/drive/files', window.location.origin);
        url.searchParams.set('folderId', folderId);
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const response = await fetch(url.toString());

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch files');
        }

        const data: ApiResponse = await response.json();

        setItems(pageToken ? [...items, ...data.files] : data.files);
        setFolderPath(data.folderPath);
        setNextPageToken(data.nextPageToken);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        console.error('Error fetching files:', err);
      } finally {
        setLoading(false);
      }
    },
    [items]
  );

  // Load files on mount and folder change
  useEffect(() => {
    fetchFiles(currentFolderId);
    // Clear selection when navigating to a new folder
    setSelectedFiles(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  // Navigate to folder
  const handleNavigate = (folderId: string) => {
    // Update URL to reflect current folder
    const url = new URL(window.location.href);
    if (folderId === 'root') {
      url.searchParams.delete('folder');
    } else {
      url.searchParams.set('folder', folderId);
    }
    router.push(url.pathname + url.search);
  };

  // Toggle file selection
  const handleToggleSelect = (file: DriveFile) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file.id)) {
        next.delete(file.id);
      } else {
        next.add(file.id);
      }
      return next;
    });
  };

  // Select all files
  const handleSelectAll = () => {
    const allFiles = items.filter(
      item => item.mimeType !== 'application/vnd.google-apps.folder'
    ) as DriveFile[];
    setSelectedFiles(new Set(allFiles.map(f => f.id)));
  };

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedFiles(new Set());
  };

  // Load more files
  const handleLoadMore = () => {
    if (nextPageToken) {
      fetchFiles(currentFolderId, nextPageToken);
    }
  };

  const fileCount = items.filter(
    item => item.mimeType !== 'application/vnd.google-apps.folder'
  ).length;

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <nav className="flex items-center space-x-2 text-sm">
        {folderPath.map((folder, index) => (
          <div key={folder.id} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="mx-1 h-4 w-4 text-gray-400" />
            )}
            <button
              onClick={() => handleNavigate(folder.id)}
              className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
                index === folderPath.length - 1
                  ? 'font-semibold text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {index === 0 && <Home className="h-4 w-4" />}
              {folder.name}
            </button>
          </div>
        ))}
      </nav>

      {/* Selection controls */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">{selectedFiles.size}</span> of{' '}
            <span className="font-semibold">{fileCount}</span> files selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              disabled={fileCount === 0}
              className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckSquare className="h-4 w-4" />
              Select All
            </button>
            <button
              onClick={handleDeselectAll}
              disabled={selectedFiles.size === 0}
              className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square className="h-4 w-4" />
              Deselect All
            </button>
          </div>
        </div>

        {selectedFiles.size > 0 && (
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
            Upload {selectedFiles.size} file
            {selectedFiles.size !== 1 ? 's' : ''} to Photos
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Error loading files</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && items.length === 0 && (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
            <p className="mt-2 text-sm text-gray-600">Loading files...</p>
          </div>
        </div>
      )}

      {/* File grid */}
      {!loading && items.length > 0 && (
        <FileGrid
          items={items}
          selectedFiles={selectedFiles}
          onToggleSelect={handleToggleSelect}
          onNavigate={handleNavigate}
        />
      )}

      {/* Empty state when not loading */}
      {!loading && items.length === 0 && !error && (
        <FileGrid
          items={[]}
          selectedFiles={selectedFiles}
          onToggleSelect={handleToggleSelect}
          onNavigate={handleNavigate}
        />
      )}

      {/* Load more button */}
      {nextPageToken && (
        <div className="flex justify-center pt-4">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
