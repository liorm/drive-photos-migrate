'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlbumQueueItem, AlbumQueueStats } from '@/types/album-queue';
import {
  Play,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Trash,
  RotateCw,
} from 'lucide-react';
import { isAuthError, handleAuthError } from '@/lib/auth-error-handler';
import { AlbumQueueItem as AlbumQueueItemComponent } from '@/components/albums/AlbumQueueItem';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';

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
  const [stopRequested, setStopRequested] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [requeuing, setRequeuing] = useState(false);

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
      setStopRequested(true);
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
    } finally {
      setStopRequested(false);
    }
  };

  // Clear completed, failed, and cancelled items
  const handleClear = async () => {
    if (stats.completed === 0 && stats.failed === 0 && stats.cancelled === 0)
      return;

    try {
      setClearing(true);
      setError(null);

      const response = await fetch('/api/albums/clear', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to clear items';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error clearing items:', err);
    } finally {
      setClearing(false);
    }
  };

  // Clear all items (dangerous operation)
  const handleClearAll = async () => {
    if (stats.total === 0) return;

    try {
      setClearingAll(true);
      setError(null);

      const response = await fetch('/api/albums/clear?all=true', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to clear all items';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error clearing all items:', err);
    } finally {
      setClearingAll(false);
    }
  };

  // Re-queue failed items
  const handleRequeueFailed = async () => {
    if (stats.failed === 0) return;

    try {
      setRequeuing(true);
      setError(null);

      const response = await fetch('/api/albums/requeue-failed', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to re-queue items';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error re-queuing failed items:', err);
    } finally {
      setRequeuing(false);
    }
  };

  // Remove individual item
  const handleRemove = async (id: string) => {
    try {
      setError(null);

      const response = await fetch(`/api/albums/queue/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to remove item';

        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error removing item:', err);
    }
  };

  const isProcessingActive =
    stats.uploading > 0 || stats.creating > 0 || stats.updating > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 p-8 text-white shadow-lg">
        <h1 className="mb-2 text-3xl font-bold">Album Creation Queue</h1>
        <p className="text-purple-100">
          Create Google Photos albums from your Drive folders
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        <div className="rounded-lg bg-white p-4 shadow-md">
          <p className="text-xs font-medium text-gray-500">Total</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-md">
          <p className="text-xs font-medium text-gray-500">Pending</p>
          <p className="mt-1 text-2xl font-bold text-gray-600">
            {stats.pending}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-md">
          <p className="text-xs font-medium text-blue-500">Uploading</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            {stats.uploading}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-md">
          <p className="text-xs font-medium text-purple-500">Creating</p>
          <p className="mt-1 text-2xl font-bold text-purple-600">
            {stats.creating}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-md">
          <p className="text-xs font-medium text-purple-500">Updating</p>
          <p className="mt-1 text-2xl font-bold text-purple-600">
            {stats.updating}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-md">
          <p className="text-xs font-medium text-green-500">Completed</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {stats.completed}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-md">
          <p className="text-xs font-medium text-red-500">Failed</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-md">
          <p className="text-xs font-medium text-orange-500">Cancelled</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">
            {stats.cancelled}
          </p>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={handleProcess}
            disabled={stats.pending === 0 || processing || isProcessingActive}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing || isProcessingActive ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Processing ({stats.pending})
              </>
            )}
          </button>

          <button
            onClick={handleStop}
            disabled={!isProcessingActive || stopRequested}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stopRequested ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Requesting stop...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Stop Processing
              </>
            )}
          </button>

          <button
            onClick={handleClear}
            disabled={
              (stats.completed === 0 &&
                stats.failed === 0 &&
                stats.cancelled === 0) ||
              clearing
            }
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {clearing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Clear Completed/Failed
              </>
            )}
          </button>

          <button
            onClick={handleRequeueFailed}
            disabled={stats.failed === 0 || requeuing}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requeuing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Re-queuing...
              </>
            ) : (
              <>
                <RotateCw className="h-4 w-4" />
                Re-queue Failed ({stats.failed})
              </>
            )}
          </button>

          <button
            onClick={() => setShowClearAllDialog(true)}
            disabled={stats.total === 0 || clearingAll}
            className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {clearingAll ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Clearing All...
              </>
            ) : (
              <>
                <Trash className="h-4 w-4" />
                Clear All Items
              </>
            )}
          </button>
        </div>

        <button
          onClick={fetchQueue}
          disabled={loading}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Queue List */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        {loading && queue.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
              <p className="mt-2 text-sm text-gray-600">Loading queue...</p>
            </div>
          </div>
        ) : queue.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center text-gray-600">
              <p className="text-lg font-medium">No albums in queue</p>
              <p className="mt-1 text-sm">
                Add folders from the Drive browser to create albums.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map(item => (
              <AlbumQueueItemComponent
                key={item.id}
                item={item}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>

      {/* Clear All Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showClearAllDialog}
        onClose={() => setShowClearAllDialog(false)}
        onConfirm={handleClearAll}
        title="Clear All Album Queue Items"
        message="Are you sure you want to clear ALL items from the album queue? This includes pending, uploading, creating, updating, completed, failed, and cancelled items. This action cannot be undone."
        confirmText="Clear All Items"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
