import { SyncStatus, SyncStatusDetail } from './sync-status';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webContentLink?: string;
  iconLink?: string;
  createdTime: string;
  modifiedTime: string;
  parents?: string[];
  syncStatus?: SyncStatus;
  isIgnored?: boolean;
  photosUrl?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  mimeType: 'application/vnd.google-apps.folder';
  createdTime: string;
  modifiedTime: string;
  parents?: string[];
  syncStatus?: SyncStatusDetail;
}

export interface DriveListResponse {
  files: (DriveFile | DriveFolder)[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

// Supported media types for upload to Google Photos
export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
] as const;
