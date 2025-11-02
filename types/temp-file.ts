/**
 * Result of downloading a Drive file to a temporary file
 */
export interface TempFileDownloadResult {
  /** Path to the temporary file */
  tempFilePath: string;
  /** Size of the downloaded file in bytes */
  fileSize: number;
}

/**
 * Parameters for downloading a Drive file to a temp file
 */
export interface DownloadToTempParams {
  /** Drive file ID to download */
  fileId: string;
  /** Expected file size (if known) */
  fileSize?: number;
  /** User email for temp file naming */
  userEmail: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Parameters for uploading from a temp file
 */
export interface UploadFromFileParams {
  /** Path to the temporary file */
  filePath: string;
  /** Original file name */
  fileName: string;
  /** MIME type of the file */
  mimeType: string;
  /** Operation ID for tracking */
  operationId?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}
