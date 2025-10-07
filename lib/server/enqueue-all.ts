import { trackOperation, OperationType } from '@/lib/operation-status';
import { syncFolderToCache, getCachedFolderPage } from '@/lib/drive-cache';
import { getAllCachedFileIds } from '@/lib/db';
import uploadsManager from '@/lib/uploads-manager';
import operationStatusManager from '@/lib/operation-status';

import { getFolderPath } from '@/lib/google-drive';

async function discoverFolders(
  userEmail: string,
  folderId: string,
  auth: { accessToken: string; refreshToken?: string },
  visited: Set<string>,
  folderList: { id: string; name: string }[]
) {
  if (visited.has(folderId)) {
    return;
  }
  visited.add(folderId);

  await syncFolderToCache(userEmail, folderId, auth);
  const page = await getCachedFolderPage(userEmail, folderId, 0, 1000); // Assuming max 1000 folders per folder

  if (page) {
    const folderPath = await getFolderPath({ auth, folderId });
    const currentFolder = folderPath[folderPath.length - 1] ?? {
      id: 'root',
      name: 'Root',
    };
    folderList.push({ id: folderId, name: currentFolder.name });

    for (const subFolder of page.folders) {
      await discoverFolders(userEmail, subFolder.id, auth, visited, folderList);
    }
  }
}

async function _performEnqueueAll(
  userEmail: string,
  folderId: string,
  auth: { accessToken: string; refreshToken?: string },
  operationId: string
) {
  operationStatusManager.updateOperation(operationId, {
    metadata: { details: 'Discovering all folders...' },
  });

  const allFoldersToProcess: { id: string; name: string }[] = [];
  await discoverFolders(
    userEmail,
    folderId,
    auth,
    new Set<string>(),
    allFoldersToProcess
  );

  const totalFolders = allFoldersToProcess.length;
  let processedFolders = 0;
  const allFileIds: string[] = [];

  for (const folder of allFoldersToProcess) {
    const fileIds = getAllCachedFileIds(userEmail, folder.id);
    allFileIds.push(...fileIds);
    processedFolders++;
    const percentage = Math.round((processedFolders / totalFolders) * 50); // Discovery is 50%
    operationStatusManager.updateOperation(operationId, {
      progress: { current: percentage, total: 100, percentage },
      metadata: {
        details: `[${processedFolders}/${totalFolders}] Discovered folder "${folder.name}"`,
      },
    });
  }

  operationStatusManager.updateOperation(operationId, {
    progress: { current: 50, total: 100, percentage: 50 },
    metadata: {
      details: `Found ${allFileIds.length} files. Now adding to queue...`,
    },
  });

  await uploadsManager.addToQueue({
    userEmail,
    auth,
    fileIds: allFileIds,
    operationId,
  });

  // The uploadsManager will update the progress from 50 to 100
}

export function enqueueAll(
  userEmail: string,
  folderId: string,
  folderName: string,
  auth: { accessToken: string; refreshToken?: string }
) {
  return trackOperation(
    OperationType.LONG_WRITE,
    'Enqueue All',
    operationId => _performEnqueueAll(userEmail, folderId, auth, operationId),
    {
      description: `Enqueue all files from "${folderName}"`,
      metadata: { rootFolderId: folderId },
    }
  );
}
