'use client';

import { useEffect, useState } from 'react';

interface Stats {
  totalFiles: number;
  uploadedFiles: number;
  storageUsedBytes: number;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function DashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const response = await fetch('/api/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred'
        );
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return <p>Loading stats...</p>;
  }

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="rounded-lg bg-white p-6 shadow-md transition-shadow hover:shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-500">Total Files</h3>
          <svg
            className="h-8 w-8 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <p className="text-3xl font-bold text-gray-900">
          {stats?.totalFiles ?? 0}
        </p>
        <p className="mt-1 text-xs text-gray-500">Ready to upload</p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-md transition-shadow hover:shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-500">Uploaded</h3>
          <svg
            className="h-8 w-8 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="text-3xl font-bold text-gray-900">
          {stats?.uploadedFiles ?? 0}
        </p>
        <p className="mt-1 text-xs text-gray-500">Successfully synced</p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-md transition-shadow hover:shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-500">Storage Used</h3>
          <svg
            className="h-8 w-8 text-purple-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            />
          </svg>
        </div>
        <p className="text-3xl font-bold text-gray-900">
          {formatBytes(stats?.storageUsedBytes ?? 0)}
        </p>
        <p className="mt-1 text-xs text-gray-500">Transferred</p>
      </div>
    </div>
  );
}
