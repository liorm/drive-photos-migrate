'use client';

import { useEffect, useState, useCallback } from 'react';
import { QueueItem as QueueItemType } from '@/types/upload-queue';
import { QueueList } from '@/components/queue/QueueList';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import {
  Play,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  Trash,
} from 'lucide-react';
import { isAuthError, handleAuthError } from '@/lib/auth-error-handler';

interface QueueStats {
  total: number;
  pending: number;
  uploading: number;
  completed: number;
  failed: number;
}

export default function QueuePage() {
  const [queue, setQueue] = useState<QueueItemType[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    total: 0,
    pending: 0,
    uploading: 0,
    completed: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);

  // Fetch queue from API
  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/queue');

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to fetch queue';

        // Check if this is an authentication error
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
          completed: 0,
          failed: 0,
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error fetching queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load queue on mount
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Auto-refresh queue every 3 seconds when items are uploading
  useEffect(() => {
    if (stats.uploading > 0) {
      const interval = setInterval(() => {
        fetchQueue();
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [stats.uploading, fetchQueue]);

  // Start processing queue
  const handleProcess = async () => {
    if (stats.pending === 0) return;

    try {
      setProcessing(true);
      setError(null);

      const response = await fetch('/api/queue/process', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to start processing';

        // Check if this is an authentication error
        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      // Refresh queue after starting processing
      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error starting queue processing:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Clear completed/failed items
  const handleClear = async () => {
    if (stats.completed === 0 && stats.failed === 0) return;

    try {
      setClearing(true);
      setError(null);

      const response = await fetch('/api/queue/clear', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to clear queue';

        // Check if this is an authentication error
        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      // Refresh queue after clearing
      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error clearing queue:', err);
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

      const response = await fetch('/api/queue/clear?all=true', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to clear all items';

        // Check if this is an authentication error
        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      // Refresh queue after clearing
      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error clearing all queue items:', err);
    } finally {
      setClearingAll(false);
    }
  };

  // Remove individual item
  const handleRemove = async (id: string) => {
    try {
      setError(null);

      const response = await fetch(`/api/queue/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to remove item';

        // Check if this is an authentication error
        if (response.status === 401 && isAuthError(errorMessage)) {
          await handleAuthError();
          return;
        }

        throw new Error(errorMessage);
      }

      // Refresh queue after removing item
      await fetchQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error removing queue item:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 p-8 text-white shadow-lg">
        <h1 className="mb-2 text-3xl font-bold">Upload Queue</h1>
        <p className="text-purple-100">
          Manage your photo upload queue and track progress
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
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
          <p className="text-xs font-medium text-green-500">Completed</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {stats.completed}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-md">
          <p className="text-xs font-medium text-red-500">Failed</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={handleProcess}
            disabled={stats.pending === 0 || processing || stats.uploading > 0}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing || stats.uploading > 0 ? (
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
            onClick={handleClear}
            disabled={(stats.completed === 0 && stats.failed === 0) || clearing}
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

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Queue List */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        {loading && queue.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
              <p className="mt-2 text-sm text-gray-600">Loading queue...</p>
            </div>
          </div>
        ) : (
          <QueueList items={queue} onRemove={handleRemove} />
        )}
      </div>

      {/* Clear All Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showClearAllDialog}
        onClose={() => setShowClearAllDialog(false)}
        onConfirm={handleClearAll}
        title="Clear All Queue Items"
        message="Are you sure you want to clear ALL items from the queue? This includes pending, uploading, completed, and failed items. This action cannot be undone."
        confirmText="Clear All Items"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
