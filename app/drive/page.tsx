import { auth } from '@/auth';

export default async function DrivePage() {
  const session = await auth();

  if (!session?.user) {
    return null; // Middleware will redirect to sign-in
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Google Drive</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse and select files to upload to Google Photos
          </p>
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-md">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-blue-100">
          <svg
            className="h-12 w-12 text-blue-600"
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
        <h2 className="mt-6 text-xl font-semibold text-gray-900">
          Drive Browser Coming Soon
        </h2>
        <p className="mt-2 text-gray-600">
          The Google Drive file browser will be implemented here.
        </p>
      </div>
    </div>
  );
}
