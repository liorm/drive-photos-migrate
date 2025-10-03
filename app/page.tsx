import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return null; // Middleware will redirect to sign-in
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          Welcome, {session.user.name}!
        </h1>
        <p className="text-gray-600 mb-6">
          Upload files from your Google Drive to Google Photos seamlessly.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              📁 Google Drive
            </h2>
            <p className="text-gray-600 text-sm">
              Browse and select files from your Google Drive to upload.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              📸 Google Photos
            </h2>
            <p className="text-gray-600 text-sm">
              Files will be uploaded to your Google Photos library.
            </p>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
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
