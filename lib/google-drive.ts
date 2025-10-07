import { google } from 'googleapis';
import {
  DriveListResponse,
  DriveFile,
  DriveFolder,
  SUPPORTED_MIME_TYPES,
} from '@/types/google-drive';
import { getFolderDetailsFromCache } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { ExtendedError } from '@/lib/errors';
import { retryWithBackoff } from '@/lib/retry';
import { withGoogleAuthRetry } from '@/lib/token-refresh';
import { GoogleAuthContext } from '@/types/auth';
import operationStatusManager from '@/lib/operation-status';

const logger = createLogger('google-drive');

/**
 * Initialize Google Drive API client with OAuth2 credentials
 */
function getDriveClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * List files and folders from Google Drive
 * @param accessToken - User's OAuth access token
 * @param folderId - Optional folder ID to list contents (defaults to root)
 * @param pageToken - Optional pagination token
 * @param operationId - Optional operation ID for status tracking
 * @returns List of files and folders with pagination info
 */
interface ListDriveFilesParams {
  auth: GoogleAuthContext;
  folderId?: string;
  pageToken?: string;
  operationId?: string;
}

export async function listDriveFiles({
  auth,
  folderId = 'root',
  pageToken,
  operationId,
}: ListDriveFilesParams): Promise<DriveListResponse> {
  logger.debug('Listing Drive files', { folderId, hasPageToken: !!pageToken });

  return retryWithBackoff(
    async () => {
      try {
        const { result: response } = await withGoogleAuthRetry(
          auth,
          async token => {
            const drive = getDriveClient(token);

            // Build query to list files in specified folder
            // Filter for supported media types OR folders
            const mimeTypeQuery = SUPPORTED_MIME_TYPES.map(
              type => `mimeType='${type}'`
            ).join(' or ');

            const query = `'${folderId}' in parents and trashed=false and (${mimeTypeQuery} or mimeType='application/vnd.google-apps.folder')`;

            return await drive.files.list({
              q: query,
              pageSize: 100,
              pageToken,
              fields:
                'nextPageToken, incompleteSearch, files(id, name, mimeType, size, thumbnailLink, webContentLink, iconLink, createdTime, modifiedTime, parents)',
              orderBy: 'folder,name',
            });
          }
        );

        const fileCount = response.data.files?.length || 0;
        logger.debug('Drive files listed successfully', {
          folderId,
          fileCount,
          hasMore: !!response.data.nextPageToken,
        });

        return {
          files: (response.data.files || []) as (DriveFile | DriveFolder)[],
          nextPageToken: response.data.nextPageToken || undefined,
          incompleteSearch: response.data.incompleteSearch || false,
        };
      } catch (error) {
        throw new ExtendedError({
          message: 'Failed to list Drive files',
          cause: error,
          details: { folderId, hasPageToken: !!pageToken },
        });
      }
    },
    {
      maxRetries: 3,
      onRetry: (error, attempt, delay) => {
        logger.warn('Retrying list Drive files', {
          folderId,
          attempt,
          delay,
          error: error.message,
        });

        // Update operation status if tracking
        if (operationId) {
          operationStatusManager.retryOperation(
            operationId,
            `List files failed: ${error.message}`,
            attempt,
            3
          );
        }
      },
    }
  );
}

/**
 * Get file metadata by ID
 * @param accessToken - User's OAuth access token
 * @param fileId - File ID to retrieve
 * @param operationId - Optional operation ID for status tracking
 * @returns File metadata
 */
interface GetDriveFileParams {
  auth: GoogleAuthContext;
  fileId: string;
  operationId?: string;
}

export async function getDriveFile({
  auth,
  fileId,
  operationId,
}: GetDriveFileParams) {
  logger.debug('Getting Drive file metadata', { fileId });

  return retryWithBackoff(
    async () => {
      try {
        const { result: response } = await withGoogleAuthRetry(
          auth,
          async token => {
            const drive = getDriveClient(token);
            return await drive.files.get({
              fileId,
              fields:
                'id, name, mimeType, size, thumbnailLink, webContentLink, iconLink, createdTime, modifiedTime, parents',
            });
          }
        );

        logger.debug('Drive file metadata retrieved', {
          fileId,
          name: response.data.name,
        });

        return response.data;
      } catch (error) {
        throw new ExtendedError({
          message: 'Failed to get Drive file metadata',
          cause: error,
          details: { fileId },
        });
      }
    },
    {
      maxRetries: 3,
      onRetry: (error, attempt, delay) => {
        logger.warn('Retrying get Drive file', {
          fileId,
          attempt,
          delay,
          error: error.message,
        });

        // Update operation status if tracking
        if (operationId) {
          operationStatusManager.retryOperation(
            operationId,
            `Get file failed: ${error.message}`,
            attempt,
            3
          );
        }
      },
    }
  );
}

/**
 * Fetch ALL files and folders from a Google Drive folder (across all pages)
 * @param accessToken - User's OAuth access token
 * @param folderId - Folder ID to list contents (defaults to root)
 * @param operationId - Optional operation ID for status tracking
 * @returns All files and folders (not paginated)
 */
interface ListAllDriveFilesParams {
  auth: GoogleAuthContext;
  folderId?: string;
  operationId?: string;
}

export async function listAllDriveFiles({
  auth,
  folderId = 'root',
  operationId,
}: ListAllDriveFilesParams): Promise<{
  files: DriveFile[];
  folders: DriveFolder[];
}> {
  logger.info('Starting to fetch all Drive files', { folderId });
  const startTime = Date.now();

  const allFiles: DriveFile[] = [];
  const allFolders: DriveFolder[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  try {
    do {
      pageCount++;
      const response = await listDriveFiles({
        auth,
        folderId,
        pageToken,
        operationId,
      });

      // Separate files and folders
      response.files.forEach(item => {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          allFolders.push(item as DriveFolder);
        } else {
          allFiles.push(item as DriveFile);
        }
      });

      pageToken = response.nextPageToken;

      // Update operation progress if tracking
      if (operationId) {
        operationStatusManager.updateProgress(
          operationId,
          pageCount,
          pageCount + (pageToken ? 1 : 0) // Estimate total pages
        );
      }

      // Log progress after each page
      logger.info('Fetched Drive files page', {
        folderId,
        pageNumber: pageCount,
        itemsInPage: response.files.length,
        totalFilesSoFar: allFiles.length,
        totalFoldersSoFar: allFolders.length,
        hasMore: !!pageToken,
      });
    } while (pageToken);

    const duration = Date.now() - startTime;
    logger.info('Completed fetching all Drive files', {
      folderId,
      totalFiles: allFiles.length,
      totalFolders: allFolders.length,
      totalPages: pageCount,
      durationMs: duration,
    });

    return { files: allFiles, folders: allFolders };
  } catch (error) {
    throw new ExtendedError({
      message: 'Failed to list all Drive files',
      cause: error,
      details: {
        folderId,
        filesRetrievedSoFar: allFiles.length,
        foldersRetrievedSoFar: allFolders.length,
        pagesProcessed: pageCount,
      },
    });
  }
}

/**
 * Get folder path (breadcrumbs) from root to current folder
 * @param accessToken - User's OAuth access token
 * @param folderId - Current folder ID
 * @param operationId - Optional operation ID for status tracking
 * @returns Array of folder metadata from root to current
 */
interface GetFolderPathParams {
  auth: GoogleAuthContext;
  folderId: string;
  userEmail: string;
  operationId?: string;
}

export async function getFolderPath({
  auth,
  folderId,
  userEmail,
  operationId,
}: GetFolderPathParams) {
  if (folderId === 'root') {
    return [{ id: 'root', name: 'My Drive' }];
  }

  logger.debug('Getting folder path for breadcrumbs', { folderId, userEmail });

  try {
    const path: Array<{ id: string; name: string }> = [];
    let currentId = folderId;

    while (currentId !== 'root') {
      let name: string;
      let parent: string | undefined;

      const cachedData = getFolderDetailsFromCache(userEmail, currentId);

      if (cachedData) {
        name = cachedData.name;
        parent = cachedData.parents?.[0];
      } else {
        const response = await retryWithBackoff(
          async () => {
            const { result } = await withGoogleAuthRetry(auth, async token => {
              const drv = getDriveClient(token);
              return await drv.files.get({
                fileId: currentId,
                fields: 'id, name, parents',
              });
            });
            return result;
          },
          {
            maxRetries: 3,
            onRetry: (error, attempt, delay) => {
              logger.warn('Retrying get folder path', {
                currentId,
                attempt,
                delay,
                error: error.message,
              });
              if (operationId) {
                operationStatusManager.retryOperation(
                  operationId,
                  `Get folder path failed: ${error.message}`,
                  attempt,
                  3
                );
              }
            },
          }
        );
        name = response.data.name!;
        parent = response.data.parents?.[0];
      }

      path.unshift({ id: currentId, name });

      if (parent) {
        currentId = parent;
      } else {
        break;
      }
    }

    path.unshift({ id: 'root', name: 'My Drive' });

    logger.debug('Folder path retrieved', {
      folderId,
      pathDepth: path.length,
      path: path.map(p => p.name).join(' / '),
    });

    return path;
  } catch (error) {
    logger.error('Error getting folder path', error, { folderId });
    return [{ id: 'root', name: 'My Drive' }];
  }
}
