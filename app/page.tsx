'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

// Helper function to format bytes
function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper function to format relative time
function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

interface CacheStats {
  cachedFolders: number;
  cachedFiles: number;
  cachedSubfolders: number;
  totalCacheSize: number;
  averageFileSize: number;
  lastCacheUpdate: string | null;
  fileTypeBreakdown: {
    images: number;
    videos: number;
    documents: number;
    other: number;
  };
}

interface Stats {
  total: number;
  pending: number;
  uploading: number;
  completed: number;
  failed: number;
  uploaded: number;
  storageUsed: number;
  cache: CacheStats;
}

export default function Home() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  if (!session?.user) {
    return null; // Or a loading spinner
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 p-8 text-white shadow-lg">
        <h1 className="mb-2 text-3xl font-bold">
          Welcome back, {session.user.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-blue-100">
          Here is an overview of your upload activity.
        </p>
      </div>

      {/* Queue & Upload Stats */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow-md transition-shadow hover:shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">
              Files in Queue
            </h3>
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
            {stats ? stats.total : '0'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {stats ? `${stats.pending} pending` : ''}
          </p>
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
            {stats ? stats.uploaded : '0'}
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
            {stats ? formatBytes(stats.storageUsed) : '0 MB'}
          </p>
          <p className="mt-1 text-xs text-gray-500">Transferred</p>
        </div>
      </div>

      {/* Cache Statistics */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
          Drive Cache Statistics
        </h2>
        <div className="grid gap-6 md:grid-cols-4">
          <div className="text-center">
            <div className="mb-2 flex items-center justify-center">
              <svg
                className="h-8 w-8 text-indigo-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.cache ? stats.cache.cachedFolders : '0'}
            </p>
            <p className="text-sm text-gray-500">Folders Cached</p>
          </div>

          <div className="text-center">
            <div className="mb-2 flex items-center justify-center">
              <svg
                className="h-8 w-8 text-orange-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.cache ? stats.cache.cachedFiles.toLocaleString() : '0'}
            </p>
            <p className="text-sm text-gray-500">Files Cached</p>
          </div>

          <div className="text-center">
            <div className="mb-2 flex items-center justify-center">
              <svg
                className="h-8 w-8 text-teal-500"
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
            <p className="text-2xl font-bold text-gray-900">
              {stats?.cache ? formatBytes(stats.cache.totalCacheSize) : '0 MB'}
            </p>
            <p className="text-sm text-gray-500">Cache Size</p>
          </div>

          <div className="text-center">
            <div className="mb-2 flex items-center justify-center">
              <svg
                className="h-8 w-8 text-pink-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.cache ? formatBytes(stats.cache.averageFileSize) : '0 MB'}
            </p>
            <p className="text-sm text-gray-500">Avg File Size</p>
          </div>
        </div>

        {/* File Type Breakdown */}
        {stats?.cache && (
          <div className="mt-6 border-t pt-6">
            <h3 className="mb-4 text-lg font-medium text-gray-800">
              File Type Breakdown
            </h3>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex items-center space-x-3">
                <div className="h-3 w-3 rounded-full bg-blue-500"></div>
                <span className="text-sm text-gray-600">
                  Images:{' '}
                  {stats.cache.fileTypeBreakdown.images.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="h-3 w-3 rounded-full bg-red-500"></div>
                <span className="text-sm text-gray-600">
                  Videos:{' '}
                  {stats.cache.fileTypeBreakdown.videos.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-gray-600">
                  Documents:{' '}
                  {stats.cache.fileTypeBreakdown.documents.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="h-3 w-3 rounded-full bg-gray-500"></div>
                <span className="text-sm text-gray-600">
                  Other: {stats.cache.fileTypeBreakdown.other.toLocaleString()}
                </span>
              </div>
            </div>

            {stats.cache.lastCacheUpdate && (
              <div className="mt-4 text-sm text-gray-500">
                Last updated: {formatRelativeTime(stats.cache.lastCacheUpdate)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">
          Quick Actions
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/drive"
            className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-blue-500 hover:bg-blue-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <svg
                className="h-6 w-6 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Browse Drive</h3>
              <p className="text-sm text-gray-500">
                Select files from Google Drive
              </p>
            </div>
          </Link>

          <a
            href="https://photos.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-green-500 hover:bg-green-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">View Photos</h3>
              <p className="text-sm text-gray-500">
                Open your Google Photos library
              </p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
