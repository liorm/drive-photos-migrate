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
      <div className="rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 p-8 text-white shadow-lg">
        <h1 className="mb-2 text-3xl font-bold">Google Drive</h1>
        <p className="text-purple-100">
          Browse and select files to upload to Google Photos
        </p>
      </div>

      {/* File Browser */}
      <FileBrowser />
    </div>
  );
}
