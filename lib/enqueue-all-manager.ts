import { DriveFile, DriveFolder } from '@/types/google-drive';
import { isAuthError, handleAuthError } from './auth-error-handler';
import operationStatusManager, { OperationStatus } from './operation-status';

export class EnqueueAllManager {
  private static instance: EnqueueAllManager;

  private constructor() {}

  public static getInstance(): EnqueueAllManager {
    if (!EnqueueAllManager.instance) {
      EnqueueAllManager.instance = new EnqueueAllManager();
    }
    return EnqueueAllManager.instance;
  }

  public async enqueueAll(folderId: string, operationId: string) {
    try {
      operationStatusManager.updateOperation(operationId, {
        status: OperationStatus.IN_PROGRESS,
        metadata: { details: 'Discovering all folders...' },
      });

      const allFoldersToProcess: { id: string; name: string }[] = [];
      await this._discoverFolders(folderId, allFoldersToProcess, new Set<string>());

      const totalFolders = allFoldersToProcess.length;
      operationStatusManager.updateOperation(operationId, {
        progress: { current: 5, total: 100, percentage: 5 },
        metadata: { details: `Found ${totalFolders} folders. Now enqueueing files.` },
      });

      let enqueuedFiles = 0;
      let processedFolders = 0;

      for (const folder of allFoldersToProcess) {
        try {
          const newFiles = await this._processSingleFolder(folder.id);
          enqueuedFiles += newFiles;
        } catch (error) {
          console.error(
            `Skipping folder ${folder.name} (${folder.id}) due to error:`,
            error
          );
        }

        processedFolders++;
        const percentage =
          5 + Math.round((processedFolders / totalFolders) * 95);
        operationStatusManager.updateOperation(operationId, {
          progress: { current: percentage, total: 100, percentage },
          metadata: {
            details: `[${processedFolders}/${totalFolders}] Processed "${folder.name}". Enqueued ${enqueuedFiles} files so far.`,
          },
        });
      }

      operationStatusManager.completeOperation(operationId, {
        details: `Successfully enqueued ${enqueuedFiles} files from ${totalFolders} folders.`,
      });
    } catch (error) {
      console.error('Error during enqueueAll operation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      operationStatusManager.failOperation(operationId, `Error during enqueue all: ${errorMessage}`);
    }
  }

  private async _discoverFolders(
    folderId: string,
    folderList: { id: string; name: string }[],
    visited: Set<string>
  ) {
    if (visited.has(folderId)) {
      return;
    }
    visited.add(folderId);

    const url = new URL('/api/drive/files', window.location.origin);
    url.searchParams.set('folderId', folderId);
    url.searchParams.set('page', '0');
    url.searchParams.set('pageSize', '1'); // We only need folders from the response

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.error || 'Failed to fetch folder list';
      if (isAuthError(errorMessage)) {
        await handleAuthError();
      }
      throw new Error(errorMessage);
    }
    const data = await response.json();
    const currentFolder =
      data.folderPath.length > 0
        ? data.folderPath[data.folderPath.length - 1]
        : { id: 'root', name: 'Root' };
    folderList.push({ id: folderId, name: currentFolder.name });

    const subFolders: DriveFolder[] = data.folders;
    for (const subFolder of subFolders) {
      await this._discoverFolders(subFolder.id, folderList, visited);
    }
  }

  private async _processSingleFolder(folderId: string): Promise<number> {
    const allFiles: DriveFile[] = [];
    let hasMore = true;
    let page = 0;

    while (hasMore) {
      const url = new URL('/api/drive/files', window.location.origin);
      url.searchParams.set('folderId', folderId);
      url.searchParams.set('page', page.toString());
      url.searchParams.set('pageSize', '100');

      const response = await fetch(url.toString());
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Failed to fetch files for folder ${folderId}`
        );
      }

      const data = await response.json();
      allFiles.push(...data.files);
      hasMore = data.hasMore;
      page++;
    }

    if (allFiles.length > 0) {
      const fileIds = allFiles.map(f => f.id);
      const response = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add files to queue');
      }
      const result = await response.json();
      return result.addedCount;
    }
    return 0;
  }
}
