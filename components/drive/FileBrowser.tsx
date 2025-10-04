'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  RefreshCw,
} from 'lucide-react';

interface FileBrowserProps {
  initialFolderId?: string;
}

interface ApiResponse {
  files: DriveFile[];
  folders: DriveFolder[];
  totalCount: number;
  hasMore: boolean;
  lastSynced?: string;
  folderPath: BreadcrumbItem[];
}

export function FileBrowser({ initialFolderId = 'root' }: FileBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Use URL as source of truth for current folder
  const currentFolderId = searchParams.get('folder') || initialFolderId;

  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderPath, setFolderPath] = useState<BreadcrumbItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Fetch files from API
  const fetchFiles = useCallback(
    async (folderId: string, page: number = 0, refresh: boolean = false) => {
      try {
        if (page === 0) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);

        const url = new URL('/api/drive/files', window.location.origin);
        url.searchParams.set('folderId', folderId);
        url.searchParams.set('page', page.toString());
        url.searchParams.set('pageSize', '50');
        if (refresh) url.searchParams.set('refresh', 'true');

        const response = await fetch(url.toString());

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch files');
        }

        const data: ApiResponse = await response.json();

        // Append files if loading more, otherwise replace
        if (page === 0) {
          setFiles(data.files);
          setFolders(data.folders);
        } else {
          setFiles(prev => [...prev, ...data.files]);
          // Folders only come on first page
        }

        setFolderPath(data.folderPath);
        setHasMore(data.hasMore);
        setTotalCount(data.totalCount);
        setCurrentPage(page);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        console.error('Error fetching files:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Load files on mount and folder change
  useEffect(() => {
    fetchFiles(currentFolderId, 0);
    // Clear selection when navigating to a new folder
    setSelectedFiles(new Set());
    setCurrentPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          fetchFiles(currentFolderId, currentPage + 1);
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loading, loadingMore, currentFolderId, currentPage, fetchFiles]);

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

  // Refresh folder
  const handleRefresh = () => {
    fetchFiles(currentFolderId, 0, true);
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
    setSelectedFiles(new Set(files.map(f => f.id)));
  };

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedFiles(new Set());
  };

  // Combine folders and files for display
  const items = [...folders, ...files];

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
            <span className="font-semibold">{files.length}</span> files selected
            {totalCount > 0 && (
              <span className="ml-2 text-gray-500">
                ({files.length} of {totalCount - folders.length} loaded)
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="Refresh from Google Drive"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
            <button
              onClick={handleSelectAll}
              disabled={files.length === 0}
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

      {/* Infinite scroll trigger */}
      {hasMore && !loading && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading more files...
            </div>
          )}
        </div>
      )}

      {/* End of list indicator */}
      {!hasMore && !loading && items.length > 0 && (
        <div className="py-4 text-center text-sm text-gray-500">
          All files loaded ({totalCount} total)
        </div>
      )}
    </div>
  );
}
