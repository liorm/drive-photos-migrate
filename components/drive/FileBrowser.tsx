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
  ListPlus,
  EyeOff,
  Eye,
} from 'lucide-react';
import { isAuthError, handleAuthError } from '@/lib/auth-error-handler';

import { useOperationNotifications } from '@/components/OperationNotificationsContext';

export interface FolderAlbumMapping {
  photosAlbumId: string;
  photosAlbumUrl: string;
  createdAt: string;
  lastUpdatedAt: string | null;
  totalItemsInAlbum: number;
  discoveredViaApi: boolean;
  albumDeleted: boolean;
}

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
  queuedFileIds: string[];
}

import { OperationType } from '@/lib/operation-status';

export function FileBrowser({ initialFolderId = 'root' }: FileBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { operations } = useOperationNotifications();

  // Use URL as source of truth for current folder
  const currentFolderId = searchParams.get('folder') || initialFolderId;

  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderPath, setFolderPath] = useState<BreadcrumbItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [queuedFiles, setQueuedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [isFolderBeingEnqueued, setIsFolderBeingEnqueued] = useState(false);
  const [hideSynced, setHideSynced] = useState(false);
  const [recursiveFetch, setRecursiveFetch] = useState(false);
  const [maxDepth, setMaxDepth] = useState<number>(3);
  const [folderAlbumMappings, setFolderAlbumMappings] = useState<
    Map<string, FolderAlbumMapping>
  >(new Map());
  const [folderQueueStatus, setFolderQueueStatus] = useState<
    Map<string, string>
  >(new Map());

  // Load hide synced preference from localStorage on mount
  useEffect(() => {
    const savedPreference = localStorage.getItem('hideSyncedFiles');
    if (savedPreference !== null) {
      setHideSynced(savedPreference === 'true');
    }
  }, []);

  useEffect(() => {
    const enqueueOps = operations.filter(
      op => op.type === OperationType.LONG_WRITE
    );
    const isRunning = enqueueOps.some(
      op =>
        op.metadata?.rootFolderId === currentFolderId &&
        (op.status === 'pending' || op.status === 'in_progress')
    );
    setIsFolderBeingEnqueued(isRunning);
  }, [currentFolderId, operations]);

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
        if (recursiveFetch) {
          url.searchParams.set('recursive', 'true');
          if (maxDepth > 0) {
            url.searchParams.set('maxDepth', maxDepth.toString());
          }
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = errorData.error || 'Failed to fetch files';

          // Check if this is an authentication error
          if (response.status === 401 && isAuthError(errorMessage)) {
            // Sign out and redirect to login
            await handleAuthError();
            return; // Exit early, user will be redirected
          }

          throw new Error(errorMessage);
        }

        const data: ApiResponse = await response.json();

        // Append files if loading more, otherwise replace
        if (page === 0) {
          setFiles(data.files);
          setFolders(data.folders);
          setQueuedFiles(new Set(data.queuedFileIds || []));
        } else {
          setFiles(prev => [...prev, ...data.files]);
          // Folders only come on first page
          // Merge queued files for pagination
          setQueuedFiles(
            prev => new Set([...prev, ...(data.queuedFileIds || [])])
          );
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
    [recursiveFetch, maxDepth]
  );

  // Fetch folder-album mappings and queue status
  const fetchFolderAlbumMappings = useCallback(
    async (folderList: DriveFolder[]) => {
      if (folderList.length === 0) {
        setFolderAlbumMappings(new Map());
        setFolderQueueStatus(new Map());
        return;
      }

      try {
        const folderIds = folderList.map(f => f.id).join(',');
        const folderNames = folderList.map(f => f.name).join(',');

        const url = new URL('/api/drive/folder-albums', window.location.origin);
        url.searchParams.set('folderIds', folderIds);
        url.searchParams.set('folderNames', folderNames);

        const response = await fetch(url.toString());

        if (!response.ok) {
          console.error('Failed to fetch folder-album mappings');
          return;
        }

        const data = await response.json();
        const mappingsMap = new Map<string, FolderAlbumMapping>();
        const queueStatusMap = new Map<string, string>();

        if (data.mappings) {
          Object.entries(data.mappings).forEach(([folderId, mapping]) => {
            mappingsMap.set(folderId, mapping as FolderAlbumMapping);
          });
        }

        if (data.queueStatus) {
          Object.entries(data.queueStatus).forEach(([folderId, status]) => {
            queueStatusMap.set(folderId, status as string);
          });
        }

        setFolderAlbumMappings(mappingsMap);
        setFolderQueueStatus(queueStatusMap);
      } catch (err) {
        console.error('Error fetching folder-album mappings:', err);
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

  // Fetch folder-album mappings when folders change
  useEffect(() => {
    fetchFolderAlbumMappings(folders);
  }, [folders, fetchFolderAlbumMappings]);

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

  // Select all visible files
  const handleSelectAll = () => {
    setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
  };

  // Deselect all
  const handleDeselectAll = () => {
    setSelectedFiles(new Set());
  };

  // Add selected files to upload queue
  const handleAddToQueue = async () => {
    if (selectedFiles.size === 0) return;

    setUploading(true);
    setUploadProgress(`Adding ${selectedFiles.size} file(s) to queue...`);

    try {
      const response = await fetch('/api/queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileIds: Array.from(selectedFiles),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to add files to queue';

        // Check if this is an authentication error
        if (response.status === 401 && isAuthError(errorMessage)) {
          // Sign out and redirect to login
          await handleAuthError();
          return; // Exit early, user will be redirected
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      setUploadProgress(
        `Added ${result.addedCount} file(s) to queue. ${result.skippedCount} skipped (already in queue or synced).`
      );

      // Update queued files state with newly added files
      if (result.added && result.added.length > 0) {
        const newQueuedIds = result.added.map(
          (item: { driveFileId: string }) => item.driveFileId
        );
        setQueuedFiles(prev => new Set([...prev, ...newQueuedIds]));
      }

      // Clear selection
      setSelectedFiles(new Set());

      // Clear message after 3 seconds
      setTimeout(() => {
        setUploadProgress(null);
      }, 3000);
    } catch (err) {
      setUploadProgress(
        `Error: ${err instanceof Error ? err.message : 'Unknown error occurred'}`
      );
      console.error('Error adding files to queue:', err);

      // Clear error after 5 seconds
      setTimeout(() => {
        setUploadProgress(null);
      }, 5000);
    } finally {
      setUploading(false);
    }
  };

  // Add all files from current folder to upload queue
  const handleEnqueueAll = async () => {
    const currentFolderName =
      folderPath[folderPath.length - 1]?.name || 'current folder';

    try {
      await fetch('/api/enqueue-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderId: currentFolderId,
          folderName: currentFolderName,
        }),
      });

      // Optional: give immediate feedback, though the operation notification will appear.
      setUploadProgress(
        `Started enqueueing all files from "${currentFolderName}"...`
      );
      setTimeout(() => setUploadProgress(null), 3000);
    } catch (err) {
      setUploadProgress(
        `Error: ${
          err instanceof Error ? err.message : 'Unknown error occurred'
        }`
      );
      console.error('Error starting enqueue all files:', err);
      setTimeout(() => setUploadProgress(null), 5000);
    }
  };

  // Filter out synced items if hideSynced is enabled
  const filteredFolders = hideSynced
    ? folders.filter(folder => folder.syncStatus?.status !== 'synced')
    : folders;

  const filteredFiles = hideSynced
    ? files.filter(file => file.syncStatus !== 'synced')
    : files;

  // Combine folders and files for display
  const items = [...filteredFolders, ...filteredFiles];

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
            <span className="font-semibold">{filteredFiles.length}</span> files
            selected
            {totalCount > 0 && (
              <span className="ml-2 text-gray-500">
                ({filteredFiles.length} of {files.length} shown
                {hideSynced &&
                  files.length > filteredFiles.length &&
                  `, ${files.length - filteredFiles.length} synced hidden`}
                )
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
            <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={recursiveFetch}
                  onChange={e => setRecursiveFetch(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Recursive
                </span>
              </label>
              {recursiveFetch && (
                <>
                  <span className="text-gray-400">|</span>
                  <label className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-600">Depth:</span>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={maxDepth}
                      onChange={e =>
                        setMaxDepth(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))
                      }
                      className="w-14 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </label>
                </>
              )}
            </div>
            <button
              onClick={handleSelectAll}
              disabled={filteredFiles.length === 0}
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
            <button
              onClick={handleEnqueueAll}
              disabled={uploading || isFolderBeingEnqueued}
              className="flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ListPlus className="h-4 w-4" />
              Enqueue All
            </button>
            <button
              onClick={() => {
                const newHideSynced = !hideSynced;
                setHideSynced(newHideSynced);

                // Save preference to localStorage
                localStorage.setItem(
                  'hideSyncedFiles',
                  newHideSynced.toString()
                );

                // Clear selection of synced files when hiding them
                if (newHideSynced) {
                  setSelectedFiles(prev => {
                    const newSelection = new Set(prev);
                    files.forEach(file => {
                      if (file.syncStatus === 'synced') {
                        newSelection.delete(file.id);
                      }
                    });
                    return newSelection;
                  });
                }
              }}
              className={`flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                hideSynced
                  ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {hideSynced ? (
                <>
                  <EyeOff className="h-4 w-4" />
                  Show Synced
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Hide Synced
                </>
              )}
            </button>
          </div>
        </div>

        {selectedFiles.size > 0 && (
          <button
            onClick={handleAddToQueue}
            disabled={uploading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </span>
            ) : (
              <>
                Add {selectedFiles.size} file
                {selectedFiles.size !== 1 ? 's' : ''} to Queue
              </>
            )}
          </button>
        )}
      </div>

      {/* Upload progress */}
      {uploadProgress && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">
          <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin" />
          <p className="text-sm">{uploadProgress}</p>
        </div>
      )}

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

      {/* Hidden files info */}
      {hideSynced && files.length > filteredFiles.length && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <div className="flex items-center gap-2">
            <EyeOff className="h-4 w-4" />
            <span>
              {files.length - filteredFiles.length} synced file
              {files.length - filteredFiles.length !== 1 ? 's' : ''} hidden
            </span>
          </div>
        </div>
      )}

      {/* File grid */}
      {!loading && items.length > 0 && (
        <FileGrid
          items={items}
          selectedFiles={selectedFiles}
          queuedFiles={queuedFiles}
          folderAlbumMappings={folderAlbumMappings}
          folderQueueStatus={folderQueueStatus}
          onToggleSelect={handleToggleSelect}
          onNavigate={handleNavigate}
          onAlbumCreated={() => fetchFolderAlbumMappings(folders)}
        />
      )}

      {/* Empty state when not loading */}
      {!loading && items.length === 0 && !error && (
        <FileGrid
          items={[]}
          selectedFiles={selectedFiles}
          queuedFiles={queuedFiles}
          folderAlbumMappings={folderAlbumMappings}
          folderQueueStatus={folderQueueStatus}
          onToggleSelect={handleToggleSelect}
          onNavigate={handleNavigate}
          onAlbumCreated={() => fetchFolderAlbumMappings(folders)}
        />
      )}

      {/* All files hidden state */}
      {!loading &&
        items.length === 0 &&
        hideSynced &&
        files.length > 0 &&
        !error && (
          <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-green-300 bg-green-50">
            <div className="text-center">
              <EyeOff className="mx-auto h-12 w-12 text-green-600" />
              <h3 className="mt-2 text-sm font-medium text-green-900">
                All files are synced and hidden
              </h3>
              <p className="mt-1 text-sm text-green-700">
                {files.length} file{files.length !== 1 ? 's' : ''} are hidden
                because they are already synced.
              </p>
              <button
                onClick={() => {
                  setHideSynced(false);
                  localStorage.setItem('hideSyncedFiles', 'false');
                }}
                className="mt-3 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              >
                Show synced files
              </button>
            </div>
          </div>
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
