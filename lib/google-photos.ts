import {
  CreateMediaItemRequest,
  CreateMediaItemResponse,
} from '@/types/google-photos';
import { createLogger } from '@/lib/logger';

const logger = createLogger('google-photos');

const PHOTOS_API_BASE = 'https://photoslibrary.googleapis.com/v1';

/**
 * Upload a file to Google Photos (3-step process)
 * 1. Get upload token from Photos API
 * 2. Upload file bytes
 * 3. Create media item from upload token
 */
export async function uploadFileToPhotos(
  accessToken: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  logger.info('Starting file upload to Photos', { fileName, mimeType });

  try {
    // Step 1: Upload bytes to get upload token
    const uploadToken = await uploadBytes(
      accessToken,
      fileBuffer,
      fileName,
      mimeType
    );

    // Step 2: Create media item from upload token
    const mediaItemId = await createMediaItem(
      accessToken,
      uploadToken,
      fileName
    );

    logger.info('File uploaded successfully to Photos', {
      fileName,
      mediaItemId,
    });

    return mediaItemId;
  } catch (error) {
    logger.error('Error uploading file to Photos', error, { fileName });
    throw new Error(
      `Failed to upload ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Step 1: Upload file bytes to Photos API and get upload token
 */
async function uploadBytes(
  accessToken: string,
  fileBuffer: Buffer,
  fileName: string,
  _mimeType: string
): Promise<string> {
  logger.debug('Uploading bytes to Photos API', {
    fileName,
    size: fileBuffer.length,
  });

  const response = await fetch(`${PHOTOS_API_BASE}/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'X-Goog-Upload-File-Name': fileName,
      'X-Goog-Upload-Protocol': 'raw',
    },
    body: fileBuffer as unknown as BodyInit,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to upload bytes', new Error(errorText), {
      fileName,
      statusCode: response.status,
    });
    throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
  }

  const uploadToken = await response.text();

  logger.debug('Upload token received', {
    fileName,
    tokenLength: uploadToken.length,
  });

  return uploadToken;
}

/**
 * Step 2: Create media item from upload token
 */
async function createMediaItem(
  accessToken: string,
  uploadToken: string,
  fileName: string
): Promise<string> {
  logger.debug('Creating media item from upload token', { fileName });

  const requestBody: CreateMediaItemRequest = {
    newMediaItems: [
      {
        simpleMediaItem: {
          uploadToken,
          fileName,
        },
      },
    ],
  };

  const response = await fetch(`${PHOTOS_API_BASE}/mediaItems:batchCreate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to create media item', new Error(errorText), {
      fileName,
      statusCode: response.status,
    });
    throw new Error(
      `Failed to create media item: ${response.statusText} - ${errorText}`
    );
  }

  const result: CreateMediaItemResponse = await response.json();

  // Check if creation was successful
  const mediaItemResult = result.newMediaItemResults[0];
  if (!mediaItemResult.mediaItem) {
    const errorMsg =
      mediaItemResult.status.message || 'Unknown error creating media item';
    logger.error('Media item creation failed', new Error(errorMsg), {
      fileName,
      statusCode: mediaItemResult.status.code,
    });
    throw new Error(errorMsg);
  }

  logger.debug('Media item created successfully', {
    fileName,
    mediaItemId: mediaItemResult.mediaItem.id,
  });

  return mediaItemResult.mediaItem.id;
}

/**
 * Batch upload multiple files to Google Photos
 */
export async function batchUploadFiles(
  accessToken: string,
  files: Array<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    driveFileId: string;
  }>,
  onProgress?: (
    fileId: string,
    status: 'uploading' | 'success' | 'error',
    error?: string
  ) => void
): Promise<
  Array<{
    driveFileId: string;
    photosMediaItemId?: string;
    success: boolean;
    error?: string;
  }>
> {
  logger.info('Starting batch upload to Photos', { fileCount: files.length });

  const results = await Promise.allSettled(
    files.map(async file => {
      try {
        onProgress?.(file.driveFileId, 'uploading');

        const mediaItemId = await uploadFileToPhotos(
          accessToken,
          file.buffer,
          file.fileName,
          file.mimeType
        );

        onProgress?.(file.driveFileId, 'success');

        return {
          driveFileId: file.driveFileId,
          photosMediaItemId: mediaItemId,
          success: true,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Batch upload file failed', error, {
          driveFileId: file.driveFileId,
          fileName: file.fileName,
        });

        onProgress?.(file.driveFileId, 'error', errorMsg);

        return {
          driveFileId: file.driveFileId,
          success: false,
          error: errorMsg,
        };
      }
    })
  );

  const finalResults = results.map(result => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        driveFileId: 'unknown',
        success: false,
        error: result.reason?.message || 'Unknown error',
      };
    }
  });

  const successCount = finalResults.filter(r => r.success).length;
  logger.info('Batch upload completed', {
    totalFiles: files.length,
    successCount,
    failureCount: files.length - successCount,
  });

  return finalResults;
}

/**
 * Download a file from Google Drive
 */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string
): Promise<Buffer> {
  logger.debug('Downloading file from Drive', { fileId });

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to download Drive file', new Error(errorText), {
      fileId,
      statusCode: response.status,
    });
    throw new Error(
      `Failed to download file: ${response.statusText} - ${errorText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  logger.debug('Drive file downloaded', {
    fileId,
    size: buffer.length,
  });

  return buffer;
}
