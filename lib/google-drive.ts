import { google } from 'googleapis';
import {
  DriveListResponse,
  DriveFile,
  DriveFolder,
  SUPPORTED_MIME_TYPES,
} from '@/types/google-drive';

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
 * @returns List of files and folders with pagination info
 */
export async function listDriveFiles(
  accessToken: string,
  folderId: string = 'root',
  pageToken?: string
): Promise<DriveListResponse> {
  try {
    const drive = getDriveClient(accessToken);

    // Build query to list files in specified folder
    // Filter for supported media types OR folders
    const mimeTypeQuery = SUPPORTED_MIME_TYPES.map(
      type => `mimeType='${type}'`
    ).join(' or ');

    const query = `'${folderId}' in parents and trashed=false and (${mimeTypeQuery} or mimeType='application/vnd.google-apps.folder')`;

    const response = await drive.files.list({
      q: query,
      pageSize: 100,
      pageToken,
      fields:
        'nextPageToken, incompleteSearch, files(id, name, mimeType, size, thumbnailLink, webContentLink, iconLink, createdTime, modifiedTime, parents)',
      orderBy: 'folder,name',
    });

    return {
      files: (response.data.files || []) as (DriveFile | DriveFolder)[],
      nextPageToken: response.data.nextPageToken || undefined,
      incompleteSearch: response.data.incompleteSearch || false,
    };
  } catch (error) {
    console.error('Error listing Drive files:', error);
    throw new Error(
      `Failed to list Drive files: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get file metadata by ID
 * @param accessToken - User's OAuth access token
 * @param fileId - File ID to retrieve
 * @returns File metadata
 */
export async function getDriveFile(accessToken: string, fileId: string) {
  try {
    const drive = getDriveClient(accessToken);

    const response = await drive.files.get({
      fileId,
      fields:
        'id, name, mimeType, size, thumbnailLink, webContentLink, iconLink, createdTime, modifiedTime, parents',
    });

    return response.data;
  } catch (error) {
    console.error('Error getting Drive file:', error);
    throw new Error(
      `Failed to get Drive file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Fetch ALL files and folders from a Google Drive folder (across all pages)
 * @param accessToken - User's OAuth access token
 * @param folderId - Folder ID to list contents (defaults to root)
 * @returns All files and folders (not paginated)
 */
export async function listAllDriveFiles(
  accessToken: string,
  folderId: string = 'root'
): Promise<{ files: DriveFile[]; folders: DriveFolder[] }> {
  const allFiles: DriveFile[] = [];
  const allFolders: DriveFolder[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const response = await listDriveFiles(accessToken, folderId, pageToken);

      // Separate files and folders
      response.files.forEach(item => {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          allFolders.push(item as DriveFolder);
        } else {
          allFiles.push(item as DriveFile);
        }
      });

      pageToken = response.nextPageToken;
    } while (pageToken);

    return { files: allFiles, folders: allFolders };
  } catch (error) {
    console.error('Error listing all Drive files:', error);
    throw new Error(
      `Failed to list all Drive files: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get folder path (breadcrumbs) from root to current folder
 * @param accessToken - User's OAuth access token
 * @param folderId - Current folder ID
 * @returns Array of folder metadata from root to current
 */
export async function getFolderPath(accessToken: string, folderId: string) {
  if (folderId === 'root') {
    return [{ id: 'root', name: 'My Drive' }];
  }

  try {
    const drive = getDriveClient(accessToken);
    const path: Array<{ id: string; name: string }> = [];

    let currentId = folderId;

    // Traverse up the folder hierarchy
    while (currentId !== 'root') {
      const response = await drive.files.get({
        fileId: currentId,
        fields: 'id, name, parents',
      });

      const file = response.data;
      path.unshift({ id: file.id!, name: file.name! });

      if (file.parents && file.parents.length > 0) {
        currentId = file.parents[0];
      } else {
        break;
      }
    }

    // Add root at the beginning
    path.unshift({ id: 'root', name: 'My Drive' });

    return path;
  } catch (error) {
    console.error('Error getting folder path:', error);
    // Return at least root on error
    return [{ id: 'root', name: 'My Drive' }];
  }
}
