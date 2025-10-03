import { auth } from '@/auth';
import { FileBrowser } from '@/components/drive/FileBrowser';

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

      {/* File Browser */}
      <FileBrowser />
    </div>
  );
}
