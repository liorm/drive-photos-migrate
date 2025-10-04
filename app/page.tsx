import { auth } from '@/auth';
import Link from 'next/link';
import DashboardStats from '@/components/dashboard-stats';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 p-8 text-white shadow-lg">
        <h1 className="mb-2 text-3xl font-bold">
          Welcome back, {session.user.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-blue-100">
          Upload files from your Google Drive to Google Photos seamlessly.
        </p>
      </div>

      {/* Stats Cards */}
      <DashboardStats />

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

          <button className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left transition-all hover:border-green-500 hover:bg-green-50">
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
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h3 className="font-semibold text-blue-900">
              Phase 1 Complete: Authentication Ready
            </h3>
            <p className="mt-1 text-sm text-blue-800">
              Your account is connected and ready. The file browser and upload
              functionality will be added in the next phases. Use the sidebar to
              explore your Google Drive folders.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}