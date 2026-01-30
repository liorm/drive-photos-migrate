'use client';

import { useEffect, useState, useCallback } from 'react';
import { FailedAddItemWithContext } from '@/lib/album-queue-db';
import {
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckSquare,
  Square,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react';
import { isAuthError, handleAuthError } from '@/lib/auth-error-handler';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';

export default function FailedAlbumItemsPage() {
  const [items, setItems] = useState<FailedAddItemWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClearUploadsDialog, setShowClearUploadsDialog] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch failed items from API
  const fetchItems = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      const response = await fetch('/api/albums/failed-items', {
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage =
          errorData.error || 'Failed to fetch failed album items';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      setItems(data.items || []);
      // Clear selection for items that no longer exist
      setSelectedIds(prev => {
        const itemIds = new Set(data.items.map((i: FailedAddItemWithContext) => i.id));
        return new Set([...prev].filter(id => itemIds.has(id)));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error fetching failed album items:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // Load items on mount
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Toggle selection for a single item
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Select all items
  const selectAll = () => {
    setSelectedIds(new Set(items.map(item => item.id)));
  };

  // Deselect all items
  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Delete selected items (without clearing uploads)
  const handleDelete = async () => {
    if (selectedIds.size === 0) return;

    try {
      setDeleting(true);
      setError(null);

      const response = await fetch('/api/albums/failed-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          itemIds: Array.from(selectedIds),
          clearUploads: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to delete items';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      await fetchItems(false);
      setShowDeleteDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error deleting items:', err);
    } finally {
      setDeleting(false);
    }
  };

  // Delete selected items AND clear their upload records
  const handleDeleteWithClearUploads = async () => {
    if (selectedIds.size === 0) return;

    try {
      setDeleting(true);
      setError(null);

      const response = await fetch('/api/albums/failed-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          itemIds: Array.from(selectedIds),
          clearUploads: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to delete items';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      await fetchItems(false);
      setShowClearUploadsDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error deleting items with uploads:', err);
    } finally {
      setDeleting(false);
    }
  };

  // Copy text to clipboard
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  };

  // Group items by folder
  const itemsByFolder = items.reduce(
    (acc, item) => {
      if (!acc[item.driveFolderId]) {
        acc[item.driveFolderId] = {
          folderName: item.folderName,
          items: [],
        };
      }
      acc[item.driveFolderId].items.push(item);
      return acc;
    },
    {} as Record<string, { folderName: string; items: FailedAddItemWithContext[] }>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-red-500 to-orange-600 p-8 text-white shadow-lg">
        <h1 className="mb-2 text-3xl font-bold">Failed Album Items</h1>
        <p className="text-red-100">
          Items that were uploaded but could not be added to their albums
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900">Error</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900">About Failed Items</h3>
          <p className="mt-1 text-sm text-amber-700">
            These items were successfully uploaded to Google Photos but could not
            be added to their albums. Common causes include:
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-700">
            <li>The media item was deleted from Google Photos</li>
            <li>The media item was not created by this app</li>
            <li>API timing issues during upload</li>
          </ul>
          <p className="mt-2 text-sm text-amber-700">
            <strong>Delete Selected:</strong> Removes from this list only.{' '}
            <strong>Delete & Clear Uploads:</strong> Also removes upload records,
            allowing re-upload from scratch.
          </p>
        </div>
      </div>

      {/* Stats and Actions */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {items.length} failed item{items.length !== 1 ? 's' : ''} |{' '}
            {selectedIds.size} selected
          </span>

          <button
            onClick={selectAll}
            disabled={items.length === 0}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <CheckSquare className="h-4 w-4" />
            Select All
          </button>

          <button
            onClick={deselectAll}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <Square className="h-4 w-4" />
            Deselect All
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDeleteDialog(true)}
            disabled={selectedIds.size === 0 || deleting}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete Selected
          </button>

          <button
            onClick={() => setShowClearUploadsDialog(true)}
            disabled={selectedIds.size === 0 || deleting}
            className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete & Clear Uploads
          </button>

          <button
            onClick={() => fetchItems(false)}
            disabled={loading}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Items List */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        {loading && items.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-red-600" />
              <p className="mt-2 text-sm text-gray-600">
                Loading failed items...
              </p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center text-gray-600">
              <p className="text-lg font-medium">No failed items</p>
              <p className="mt-1 text-sm">
                All album items were added successfully.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(itemsByFolder).map(
              ([folderId, { folderName, items: folderItems }]) => (
                <div key={folderId} className="border-b border-gray-200 pb-4 last:border-0">
                  <h3 className="mb-3 text-lg font-semibold text-gray-900">
                    {folderName}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({folderItems.length} item{folderItems.length !== 1 ? 's' : ''})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {folderItems.map(item => (
                      <div
                        key={item.id}
                        className={`rounded-lg border p-4 ${
                          selectedIds.has(item.id)
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleSelection(item.id)}
                            className="mt-1 flex-shrink-0"
                          >
                            {selectedIds.has(item.id) ? (
                              <CheckSquare className="h-5 w-5 text-blue-600" />
                            ) : (
                              <Square className="h-5 w-5 text-gray-400" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                              <div>
                                <span className="font-medium text-gray-700">
                                  Drive File ID:
                                </span>
                                <div className="flex items-center gap-1">
                                  <code className="truncate text-xs text-gray-600">
                                    {item.driveFileId}
                                  </code>
                                  <button
                                    onClick={() =>
                                      copyToClipboard(
                                        item.driveFileId,
                                        `drive-${item.id}`
                                      )
                                    }
                                    className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                                    title="Copy to clipboard"
                                  >
                                    {copiedId === `drive-${item.id}` ? (
                                      <Check className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">
                                  Photos Media Item ID:
                                </span>
                                <div className="flex items-center gap-1">
                                  <code className="truncate text-xs text-gray-600">
                                    {item.photosMediaItemId || 'N/A'}
                                  </code>
                                  {item.photosMediaItemId && (
                                    <button
                                      onClick={() =>
                                        copyToClipboard(
                                          item.photosMediaItemId!,
                                          `photos-${item.id}`
                                        )
                                      }
                                      className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                                      title="Copy to clipboard"
                                    >
                                      {copiedId === `photos-${item.id}` ? (
                                        <Check className="h-3 w-3 text-green-600" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                            {item.errorMessage && (
                              <div className="mt-2">
                                <span className="text-sm font-medium text-red-700">
                                  Error:
                                </span>
                                <p className="text-sm text-red-600">
                                  {item.errorMessage}
                                </p>
                              </div>
                            )}
                            <div className="mt-2 text-xs text-gray-500">
                              Added: {new Date(item.addedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete Selected Items"
        message={`Are you sure you want to delete ${selectedIds.size} selected item${selectedIds.size !== 1 ? 's' : ''} from the failed items list? This will remove them from the album items database only.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="warning"
      />

      {/* Clear Uploads Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showClearUploadsDialog}
        onClose={() => setShowClearUploadsDialog(false)}
        onConfirm={handleDeleteWithClearUploads}
        title="Delete & Clear Upload Records"
        message={`Are you sure you want to delete ${selectedIds.size} selected item${selectedIds.size !== 1 ? 's' : ''} and clear their upload records? This will allow these files to be re-uploaded from scratch.`}
        confirmText="Delete & Clear"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
