/**
 * Google Photos Library API types
 */

/**
 * Upload token received from Photos API
 */
export interface UploadToken {
  token: string;
}

/**
 * Request to create a media item in Photos
 */
export interface CreateMediaItemRequest {
  albumId?: string;
  newMediaItems: NewMediaItem[];
}

/**
 * New media item to be created
 */
export interface NewMediaItem {
  description?: string;
  simpleMediaItem: {
    uploadToken: string;
    fileName?: string;
  };
}

/**
 * Response from creating media items
 */
export interface CreateMediaItemResponse {
  newMediaItemResults: MediaItemResult[];
}

/**
 * Result for a single media item creation
 */
export interface MediaItemResult {
  uploadToken: string;
  status: {
    message: string;
    code?: number;
  };
  mediaItem?: MediaItem;
}

/**
 * Media item in Google Photos
 */
export interface MediaItem {
  id: string;
  productUrl: string;
  baseUrl: string;
  mimeType: string;
  mediaMetadata: {
    creationTime: string;
    width: string;
    height: string;
    photo?: PhotoMetadata;
    video?: VideoMetadata;
  };
  filename: string;
}

/**
 * Photo-specific metadata
 */
export interface PhotoMetadata {
  cameraMake?: string;
  cameraModel?: string;
  focalLength?: number;
  apertureFNumber?: number;
  isoEquivalent?: number;
  exposureTime?: string;
}

/**
 * Video-specific metadata
 */
export interface VideoMetadata {
  cameraMake?: string;
  cameraModel?: string;
  fps?: number;
  status?: string;
}

/**
 * Upload progress tracking
 */
export interface UploadProgress {
  driveFileId: string;
  fileName: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress?: number; // 0-100
  error?: string;
  photosMediaItemId?: string;
}
