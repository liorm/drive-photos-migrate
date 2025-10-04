import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { downloadDriveFile, batchUploadFiles } from '@/lib/google-photos';
import { recordUploads } from '@/lib/uploads-db';
import { clearSyncStatusCacheForFolder } from '@/lib/sync-status';
import { getDriveFile } from '@/lib/google-drive';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api:photos:upload');

interface UploadRequestBody {
  fileIds: string[];
  folderId: string; // Current folder for cache invalidation
}

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  try {
    // Get session to retrieve access token
    const session = await auth();

    if (!session?.accessToken || !session?.user?.email) {
      logger.warn('Unauthorized request - No access token', { requestId });
      return NextResponse.json(
        { error: 'Unauthorized - No access token' },
        { status: 401 }
      );
    }

    // Check if token refresh failed
    if (session.error === 'RefreshAccessTokenError') {
      logger.warn('Authentication expired', {
        requestId,
        userEmail: session.user.email,
      });
      return NextResponse.json(
        { error: 'Authentication expired - Please sign in again' },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;

    // Parse request body
    const body: UploadRequestBody = await request.json();
    const { fileIds, folderId } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      logger.warn('Invalid request - No file IDs provided', {
        requestId,
        userEmail,
      });
      return NextResponse.json(
        { error: 'Invalid request - No file IDs provided' },
        { status: 400 }
      );
    }

    if (!folderId) {
      logger.warn('Invalid request - No folder ID provided', {
        requestId,
        userEmail,
      });
      return NextResponse.json(
        { error: 'Invalid request - No folder ID provided' },
        { status: 400 }
      );
    }

    logger.info('Upload request received', {
      requestId,
      userEmail,
      fileCount: fileIds.length,
      folderId,
    });

    // Fetch file metadata and download files from Drive
    const filesToUpload: Array<{
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      driveFileId: string;
    }> = [];

    for (const fileId of fileIds) {
      try {
        logger.debug('Fetching file metadata', {
          requestId,
          userEmail,
          fileId,
        });

        // Get file metadata
        const fileMetadata = await getDriveFile(session.accessToken, fileId);

        if (!fileMetadata.name || !fileMetadata.mimeType) {
          logger.warn('File metadata incomplete, skipping', {
            requestId,
            userEmail,
            fileId,
          });
          continue;
        }

        // Download file from Drive
        logger.debug('Downloading file from Drive', {
          requestId,
          userEmail,
          fileId,
          fileName: fileMetadata.name,
        });

        const buffer = await downloadDriveFile(session.accessToken, fileId);

        filesToUpload.push({
          buffer,
          fileName: fileMetadata.name,
          mimeType: fileMetadata.mimeType,
          driveFileId: fileId,
        });

        logger.debug('File downloaded successfully', {
          requestId,
          userEmail,
          fileId,
          fileName: fileMetadata.name,
          size: buffer.length,
        });
      } catch (error) {
        logger.error('Error downloading file', error, {
          requestId,
          userEmail,
          fileId,
        });
        // Continue with other files even if one fails
      }
    }

    if (filesToUpload.length === 0) {
      logger.warn('No files to upload', { requestId, userEmail });
      return NextResponse.json(
        { error: 'No valid files to upload' },
        { status: 400 }
      );
    }

    logger.info('Starting batch upload to Photos', {
      requestId,
      userEmail,
      fileCount: filesToUpload.length,
    });

    // Upload files to Photos
    const uploadResults = await batchUploadFiles(
      session.accessToken,
      filesToUpload
    );

    // Record successful uploads
    const successfulUploads = uploadResults.filter(r => r.success);

    if (successfulUploads.length > 0) {
      await recordUploads(
        userEmail,
        successfulUploads.map(r => ({
          driveFileId: r.driveFileId,
          photosMediaItemId: r.photosMediaItemId!,
          fileName:
            filesToUpload.find(f => f.driveFileId === r.driveFileId)
              ?.fileName || 'unknown',
          mimeType:
            filesToUpload.find(f => f.driveFileId === r.driveFileId)
              ?.mimeType || 'unknown',
        }))
      );

      logger.info('Uploads recorded successfully', {
        requestId,
        userEmail,
        successCount: successfulUploads.length,
      });

      // Clear sync status cache for this folder and parents
      await clearSyncStatusCacheForFolder(
        userEmail,
        folderId,
        session.accessToken
      );

      logger.info('Sync status cache cleared', {
        requestId,
        userEmail,
        folderId,
      });
    }

    const failedUploads = uploadResults.filter(r => !r.success);

    logger.info('Upload request completed', {
      requestId,
      userEmail,
      totalFiles: uploadResults.length,
      successCount: successfulUploads.length,
      failureCount: failedUploads.length,
    });

    return NextResponse.json({
      success: true,
      results: uploadResults,
      successCount: successfulUploads.length,
      failureCount: failedUploads.length,
    });
  } catch (error) {
    logger.error('Upload API error', error, { requestId });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to upload files',
      },
      { status: 500 }
    );
  }
}
