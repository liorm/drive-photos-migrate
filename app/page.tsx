import { auth } from '@/auth';

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return null; // Middleware will redirect to sign-in
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h1 className="mb-4 text-3xl font-bold text-gray-800">
          Welcome, {session.user.name}!
        </h1>
        <p className="mb-6 text-gray-600">
          Upload files from your Google Drive to Google Photos seamlessly.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-4">
            <h2 className="mb-2 text-xl font-semibold text-gray-800">
              📁 Google Drive
            </h2>
            <p className="text-sm text-gray-600">
              Browse and select files from your Google Drive to upload.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <h2 className="mb-2 text-xl font-semibold text-gray-800">
              📸 Google Photos
            </h2>
            <p className="text-sm text-gray-600">
              Files will be uploaded to your Google Photos library.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            <strong>Phase 1 Complete:</strong> Authentication is set up and
            working! The file browser and upload functionality will be added in
            the next phases.
          </p>
        </div>
      </div>
    </div>
  );
}
