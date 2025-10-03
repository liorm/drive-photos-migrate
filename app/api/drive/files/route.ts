import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listDriveFiles, getFolderPath } from '@/lib/google-drive';

export async function GET(request: NextRequest) {
  try {
    // Get session to retrieve access token
    const session = await auth();

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized - No access token' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const folderId = searchParams.get('folderId') || 'root';
    const pageToken = searchParams.get('pageToken') || undefined;

    // Fetch files from Google Drive
    const [filesData, folderPath] = await Promise.all([
      listDriveFiles(session.accessToken, folderId, pageToken),
      getFolderPath(session.accessToken, folderId),
    ]);

    return NextResponse.json({
      ...filesData,
      folderPath,
    });
  } catch (error) {
    console.error('Drive API error:', error);

    // Check if it's an authentication error
    if (
      error instanceof Error &&
      (error.message.includes('invalid_grant') ||
        error.message.includes('Invalid Credentials'))
    ) {
      return NextResponse.json(
        { error: 'Authentication expired - Please sign in again' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch files',
      },
      { status: 500 }
    );
  }
}
