'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlbumQueueItem, AlbumQueueStats } from '@/types/album-queue';
import {
  Play,
  Square,
  Loader2,
  AlertCircle,
  ExternalLink,
  Trash2,
  X,
} from 'lucide-react';
import { isAuthError, handleAuthError } from '@/lib/auth-error-handler';

export default function AlbumsPage() {
  const [queue, setQueue] = useState<AlbumQueueItem[]>([]);
  const [stats, setStats] = useState<AlbumQueueStats>({
    total: 0,
    pending: 0,
    uploading: 0,
    creating: 0,
    updating: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Fetch queue from API
  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/albums/queue');

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to fetch album queue';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      setQueue(data.queue || []);
      setStats(
        data.stats || {
          total: 0,
          pending: 0,
          uploading: 0,
          creating: 0,
          updating: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error fetching album queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load queue on mount
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Auto-refresh queue every 3 seconds when processing
  useEffect(() => {
    if (stats.uploading > 0 || stats.creating > 0 || stats.updating > 0) {
      const interval = setInterval(() => {
        fetchQueue();
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [stats.uploading, stats.creating, stats.updating, fetchQueue]);

  // Start processing queue
  const handleProcess = async () => {
    if (stats.pending === 0) return;

    try {
      setProcessing(true);
      setError(null);

      const response = await fetch('/api/albums/process', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to start processing';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error starting album processing:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Stop processing
  const handleStop = async () => {
    try {
      setError(null);

      const response = await fetch('/api/albums/process', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to stop processing';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error stopping album processing:', err);
    }
  };

  // Clear completed, failed, and cancelled items
  const handleClearCompleted = async () => {
    if (
      !confirm(
        'Clear all completed, failed, and cancelled albums from the queue?'
      )
    ) {
      return;
    }

    try {
      setClearing(true);
      setError(null);

      // Remove completed, failed, and cancelled items one by one
      const itemsToClear = queue.filter(
        item =>
          item.status === 'COMPLETED' ||
          item.status === 'FAILED' ||
          item.status === 'CANCELLED'
      );

      for (const item of itemsToClear) {
        await fetch(`/api/albums/queue/${item.id}`, {
          method: 'DELETE',
        });
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error clearing completed items:', err);
    } finally {
      setClearing(false);
    }
  };

  // Remove individual item
  const handleRemoveItem = async (item: AlbumQueueItem) => {
    if (
      item.status === 'UPLOADING' ||
      item.status === 'CREATING' ||
      item.status === 'UPDATING'
    ) {
      alert('Cannot remove item while it is being processed');
      return;
    }

    if (!confirm(`Remove "${item.folderName}" from the queue?`)) {
      return;
    }

    try {
      setError(null);

      const response = await fetch(`/api/albums/queue/${item.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove item');
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error removing item:', err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'text-gray-600 bg-gray-100';
      case 'UPLOADING':
        return 'text-blue-600 bg-blue-100';
      case 'CREATING':
      case 'UPDATING':
        return 'text-purple-600 bg-purple-100';
      case 'COMPLETED':
        return 'text-green-600 bg-green-100';
      case 'FAILED':
        return 'text-red-600 bg-red-100';
      case 'CANCELLED':
        return 'text-orange-600 bg-orange-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const isProcessingActive =
    stats.uploading > 0 || stats.creating > 0 || stats.updating > 0;

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="mb-2 text-3xl font-bold">Album Creation Queue</h1>
        <p className="text-gray-600">
          Create Google Photos albums from your Drive folders
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900">Error</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-gray-600">Total</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-gray-600">
            {stats.pending}
          </div>
          <div className="text-sm text-gray-600">Pending</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-blue-600">
            {stats.uploading}
          </div>
          <div className="text-sm text-gray-600">Uploading</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-purple-600">
            {stats.creating}
          </div>
          <div className="text-sm text-gray-600">Creating</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-purple-600">
            {stats.updating}
          </div>
          <div className="text-sm text-gray-600">Updating</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-green-600">
            {stats.completed}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-sm text-gray-600">Failed</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-2xl font-bold text-orange-600">
            {stats.cancelled}
          </div>
          <div className="text-sm text-gray-600">Cancelled</div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={handleProcess}
          disabled={stats.pending === 0 || processing || isProcessingActive}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Start Processing
        </button>

        <button
          onClick={handleStop}
          disabled={!isProcessingActive}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          <Square className="h-4 w-4" />
          Stop Processing
        </button>

        <button
          onClick={handleClearCompleted}
          disabled={
            (stats.completed === 0 &&
              stats.failed === 0 &&
              stats.cancelled === 0) ||
            clearing
          }
          className="flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {clearing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Clear Completed
        </button>
      </div>

      {/* Queue List */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold">Queue Items</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
            <p className="mt-2 text-gray-600">Loading queue...</p>
          </div>
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No albums in queue. Add folders from the Drive browser.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {queue.map(item => (
              <div key={item.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="truncate font-medium">
                        {item.folderName}
                      </h3>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${getStatusColor(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                      {item.mode && (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {item.mode}
                        </span>
                      )}
                    </div>

                    {item.totalFiles !== null && (
                      <div className="text-sm text-gray-600">
                        {item.uploadedFiles} / {item.totalFiles} files uploaded
                      </div>
                    )}

                    {item.error && (
                      <div className="mt-1 text-sm text-red-600">
                        {item.error}
                      </div>
                    )}

                    {item.photosAlbumUrl && (
                      <a
                        href={item.photosAlbumUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 flex items-center gap-1 text-sm text-blue-600 hover:underline"
                      >
                        View in Google Photos
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm text-gray-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item)}
                      disabled={
                        item.status === 'UPLOADING' ||
                        item.status === 'CREATING' ||
                        item.status === 'UPDATING'
                      }
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Remove from queue"
                    >
                      <X className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
