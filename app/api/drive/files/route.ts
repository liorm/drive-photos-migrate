import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getFolderPath } from '@/lib/google-drive';
import {
  isFolderCached,
  getCachedFolderPage,
  syncFolderToCache,
  clearFolderCache,
} from '@/lib/drive-cache';

export async function GET(request: NextRequest) {
  try {
    // Get session to retrieve access token
    const session = await auth();

    if (!session?.accessToken || !session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized - No access token' },
        { status: 401 }
      );
    }

    // Check if token refresh failed
    if (session.error === 'RefreshAccessTokenError') {
      return NextResponse.json(
        { error: 'Authentication expired - Please sign in again' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const folderId = searchParams.get('folderId') || 'root';
    const refresh = searchParams.get('refresh') === 'true';
    const page = parseInt(searchParams.get('page') || '0', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    // Check if folder is cached and if refresh is requested
    const cached = await isFolderCached(userEmail, folderId);

    // If not cached or refresh requested, sync from Drive API
    if (!cached || refresh) {
      // Clear cache if refreshing
      if (refresh && cached) {
        await clearFolderCache(userEmail, folderId);
      }

      // Sync all files from Drive API to cache
      await syncFolderToCache(userEmail, folderId, session.accessToken);
    }

    // Get paginated data from cache
    const cachedData = await getCachedFolderPage(
      userEmail,
      folderId,
      page,
      pageSize
    );

    if (!cachedData) {
      return NextResponse.json(
        { error: 'Failed to retrieve cached data' },
        { status: 500 }
      );
    }

    // Get folder path for breadcrumbs
    const folderPath = await getFolderPath(session.accessToken, folderId);

    return NextResponse.json({
      files: cachedData.files,
      folders: cachedData.folders,
      totalCount: cachedData.totalCount,
      hasMore: cachedData.hasMore,
      lastSynced: cachedData.lastSynced,
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
