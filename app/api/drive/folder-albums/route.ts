import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBatchFolderAlbumMappings } from '@/lib/album-queue-db';
import { createLogger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/error-handler';
import albumsManager from '@/lib/albums-manager';
import { validateSession } from '@/lib/auth-utils';

const logger = createLogger('api:drive:folder-albums');

/**
 * GET /api/drive/folder-albums - Get folder-to-album mappings with lazy discovery
 *
 * Query Parameters:
 * - folderIds: Comma-separated list of folder IDs
 * - folderNames: Comma-separated list of folder names (same order as IDs, for lazy discovery)
 */
async function handleGET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);

  // Get and validate session
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail, auth: authContext } = sessionResult.data;

  // Get query parameters
  const { searchParams } = new URL(request.url);
  const folderIdsParam = searchParams.get('folderIds');
  const folderNamesParam = searchParams.get('folderNames');

  if (!folderIdsParam) {
    logger.warn('Invalid request - Missing folderIds', {
      requestId,
      userEmail,
    });
    return NextResponse.json(
      { error: 'folderIds query parameter is required' },
      { status: 400 }
    );
  }

  const folderIds = folderIdsParam.split(',').filter(id => id.trim());
  const folderNames = folderNamesParam
    ? folderNamesParam.split(',').filter(name => name.trim())
    : [];

  if (folderIds.length === 0) {
    return NextResponse.json({
      success: true,
      mappings: {},
    });
  }

  if (folderNames.length > 0 && folderNames.length !== folderIds.length) {
    logger.warn('Invalid request - folderNames length mismatch', {
      requestId,
      userEmail,
      folderIdsCount: folderIds.length,
      folderNamesCount: folderNames.length,
    });
    return NextResponse.json(
      { error: 'folderNames must have the same length as folderIds' },
      { status: 400 }
    );
  }

  logger.info('Get folder-album mappings request', {
    requestId,
    userEmail,
    folderCount: folderIds.length,
    hasNames: folderNames.length > 0,
  });

  // Step 1: Get existing mappings from DB
  const existingMappings = await getBatchFolderAlbumMappings(
    userEmail,
    folderIds
  );

  const mappingsResult: Record<
    string,
    {
      photosAlbumId: string;
      photosAlbumUrl: string;
      createdAt: string;
      lastUpdatedAt: string | null;
      totalItemsInAlbum: number;
      discoveredViaApi: boolean;
      albumDeleted: boolean;
    }
  > = {};

  // Add existing mappings to result
  for (const [folderId, mapping] of existingMappings.entries()) {
    if (mapping) {
      mappingsResult[folderId] = {
        photosAlbumId: mapping.photosAlbumId,
        photosAlbumUrl: mapping.photosAlbumUrl,
        createdAt: mapping.createdAt,
        lastUpdatedAt: mapping.lastUpdatedAt,
        totalItemsInAlbum: mapping.totalItemsInAlbum,
        discoveredViaApi: mapping.discoveredViaApi,
        albumDeleted: mapping.albumDeleted,
      };
    }
  }

  // Step 2: For folders without mappings, try lazy discovery
  if (folderNames.length > 0) {
    const missingFolderIds = folderIds.filter(
      folderId =>
        !existingMappings.has(folderId) || !existingMappings.get(folderId)
    );

    if (missingFolderIds.length > 0) {
      logger.info('Attempting lazy discovery for folders', {
        requestId,
        userEmail,
        missingCount: missingFolderIds.length,
      });

      // Process each missing folder
      for (const folderId of missingFolderIds) {
        const folderIndex = folderIds.indexOf(folderId);
        const folderName = folderNames[folderIndex];

        if (!folderName) continue;

        try {
          const discoveredMapping = await albumsManager.discoverAlbumForFolder(
            userEmail,
            authContext,
            folderId,
            folderName
          );

          if (discoveredMapping) {
            mappingsResult[folderId] = {
              photosAlbumId: discoveredMapping.photosAlbumId,
              photosAlbumUrl: discoveredMapping.photosAlbumUrl,
              createdAt: discoveredMapping.createdAt,
              lastUpdatedAt: discoveredMapping.lastUpdatedAt,
              totalItemsInAlbum: discoveredMapping.totalItemsInAlbum,
              discoveredViaApi: discoveredMapping.discoveredViaApi,
              albumDeleted: discoveredMapping.albumDeleted,
            };

            logger.info('Album discovered for folder', {
              requestId,
              userEmail,
              folderId,
              albumId: discoveredMapping.photosAlbumId,
            });
          }
        } catch (error) {
          logger.warn('Error discovering album for folder', {
            requestId,
            userEmail,
            folderId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with other folders even if one fails
        }
      }
    }
  }

  logger.info('Folder-album mappings retrieved successfully', {
    requestId,
    userEmail,
    totalRequested: folderIds.length,
    mappingsFound: Object.keys(mappingsResult).length,
  });

  return NextResponse.json({
    success: true,
    mappings: mappingsResult,
  });
}

export const GET = withErrorHandler(handleGET);
