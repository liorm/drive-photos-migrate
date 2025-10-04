import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listAllDriveFiles } from '@/lib/google-drive';
import { getUploadedRecords } from '@/lib/uploads-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all files from drive
    const { files: allDriveFiles } = await listAllDriveFiles(
      session.accessToken
    );
    const totalFiles = allDriveFiles.length;

    // Fetch uploaded records from our DB
    const uploadedRecords = await getUploadedRecords(session.user.email);
    const uploadedFiles = uploadedRecords.length;

    // Calculate total storage used
    const storageUsedBytes = uploadedRecords.reduce(
      (total, record) => total + (record.fileSizeBytes || 0),
      0
    );

    return NextResponse.json({
      totalFiles,
      uploadedFiles,
      storageUsedBytes,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
