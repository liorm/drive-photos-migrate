## TODOs

### **Feature: Create Albums from Drive Folders**

#### **Overview**
Allow users to convert Drive folders into Google Photos albums. Folders can be queued for album creation, and a dedicated manager (similar to `UploadsManager`) handles the album creation workflow. Users can monitor progress, manage the queue, and see which folders have already been converted to albums.

#### **Key Design Decisions**
1. **Folder-Album Mapping with Lazy Discovery**:
   - Primary source of truth: `folder_albums` table in database
   - **Lazy initialization**: When checking if a folder has an album:
     - First, query DB for existing mapping
     - If not found, query Google Photos API for album with matching folder name (one-time check)
     - If album found in API, store mapping in DB for future lookups
     - All subsequent checks use DB only (fast O(1) lookups)
   - This enables:
     - Showing badges on folders that are already albums
     - Preventing duplicate album creation attempts
     - Linking back to the Google Photos album from the folder
     - Discovering manually-created albums

2. **Album Name Linking**:
   - Album name in Google Photos = Drive folder name
   - **Metadata tracking**: Cannot store custom metadata directly in Google Photos albums
   - Store `driveFolderId` in our DB to maintain the link even if user renames the album in Google Photos
   - Use album name for initial discovery, but rely on `photosAlbumId` for all operations after initial link

3. **Two-Phase Processing**:
   - **Phase 1 (UPLOADING)**: Ensure all files from the folder are uploaded to Google Photos via `UploadsManager`
   - **Phase 2 (CREATING)**: Create the album in Google Photos and add all uploaded media items

4. **Sync Status Handling**: Include ALL files from the folder in the album, whether already synced or not. For already-synced files, look up their Photos media item IDs from the `uploads` table instead of re-uploading.

5. **Album Updates**: SUPPORTED. When new files are added to a Drive folder after album creation:
   - Detect new files by comparing folder contents with `album_items` table
   - Add new files to `UploadsManager` queue
   - Once uploaded, add them to the existing Google Photos album
   - Update `lastUpdatedAt` and `totalItemsInAlbum` in `folder_albums` table

6. **Queue Persistence**: Album creation queue persists in the database across app restarts (similar to upload queue).

---

#### **1. Database Schema**

##### **`album_queue` Table**
Tracks album creation jobs in the queue.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `userEmail` | VARCHAR | User who queued the album |
| `driveFolderId` | VARCHAR | Google Drive folder ID |
| `folderName` | VARCHAR | Display name of the folder |
| `status` | ENUM | `PENDING`, `UPLOADING`, `CREATING`, `UPDATING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `mode` | ENUM | `CREATE`, `UPDATE` (set during processing based on existing album check) |
| `totalFiles` | INTEGER | Total number of files in folder (null until enumerated) |
| `uploadedFiles` | INTEGER | Number of files uploaded so far |
| `photosAlbumId` | VARCHAR | Google Photos album ID (populated when created) |
| `photosAlbumUrl` | VARCHAR | Google Photos album URL (populated when created) |
| `error` | TEXT | Error message if failed |
| `createdAt` | TIMESTAMP | When queued |
| `startedAt` | TIMESTAMP | When processing started |
| `completedAt` | TIMESTAMP | When completed/failed |

##### **`album_items` Table**
Join table linking album queue entries to their files.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `albumQueueId` | UUID | Foreign key to `album_queue` |
| `driveFileId` | VARCHAR | Google Drive file ID |
| `photosMediaItemId` | VARCHAR | Google Photos media item ID (from `uploads` table) |
| `status` | ENUM | `PENDING`, `UPLOADED`, `FAILED` |
| `addedAt` | TIMESTAMP | When added to album items |

##### **`folder_albums` Table**
Persistent mapping of Drive folders to their created Google Photos albums.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `userEmail` | VARCHAR | User email |
| `driveFolderId` | VARCHAR | Google Drive folder ID |
| `folderName` | VARCHAR | Folder name at time of creation/discovery |
| `photosAlbumId` | VARCHAR | Google Photos album ID |
| `photosAlbumUrl` | VARCHAR | Google Photos album URL (format: `https://photos.google.com/lr/album/{albumId}`) |
| `createdAt` | TIMESTAMP | When album was created (or discovered) |
| `lastUpdatedAt` | TIMESTAMP | When we last added files to this album (NULL if never updated) |
| `totalItemsInAlbum` | INTEGER | Current number of items in the album |
| `discoveredViaApi` | BOOLEAN | `true` if found via API lookup, `false` if created by us |
| `albumDeleted` | BOOLEAN | `true` if album no longer exists in Google Photos (verified on access) |

**Indexes**:
- Composite index on `(userEmail, driveFolderId)` for fast lookups
- Index on `(userEmail, photosAlbumId)` for reverse lookups

---

#### **2. AlbumsManager Singleton**

Create `lib/albums-manager.ts` following the same pattern as `UploadsManager`:

**Responsibilities**:
- Add folders to the album creation queue
- Process the queue: enumerate files, ensure uploads, create albums
- Provide queue statistics and progress tracking
- Handle cancellation and error recovery

**Key Methods**:
- `addToQueue(userEmail, auth, folderId, folderName)`: Queue a folder for album creation
- `startProcessing(userEmail, auth)`: Process the album queue for a user
- `stopProcessing(userEmail)`: Cancel in-flight album processing
- `getQueueStats(userEmail)`: Get queue statistics
- `removeFromQueue(userEmail, albumQueueId)`: Remove an album from the queue

**Processing Flow**:
1. Fetch album queue items with `PENDING` status
2. For each album:
   - **Check for existing album**:
     - Query `folder_albums` table for mapping
     - If not found, query Google Photos API for album with matching folder name
     - If found via API, store in `folder_albums` table with `discoveredViaApi=true`
     - If existing album found: switch to UPDATE mode instead of CREATE mode
   - Set status to `UPLOADING`
   - Recursively enumerate all files in the Drive folder
   - Create `album_items` records for each file
   - For each file:
     - Check if already uploaded (exists in `uploads` table with `photosMediaItemId`)
     - If uploaded: mark `album_items` entry as `UPLOADED`
     - If not uploaded: add to `UploadsManager` queue
   - Wait for all files to be uploaded (poll `album_items` for completion)
   - Set status to `CREATING`
   - **CREATE mode**: Create new Google Photos album via API
   - **UPDATE mode**: Use existing album ID from `folder_albums`
   - Batch add all media items to the album (skip items already in album for UPDATE mode)
   - Set status to `COMPLETED`
   - Create/update record in `folder_albums` table
   - Update `lastUpdatedAt` and `totalItemsInAlbum`
3. Track progress via `operation-status` manager

---

#### **3. Backend API Endpoints**

##### **POST `/api/albums/queue`**
Add a folder to the album creation queue.

**Request Body**:
```json
{
  "folderId": "string",
  "folderName": "string"
}
```

**Response**:
```json
{
  "albumQueueId": "uuid",
  "status": "PENDING"
}
```

##### **GET `/api/albums/queue`**
Get all album queue items for the current user.

**Response**:
```json
{
  "queue": [
    {
      "id": "uuid",
      "driveFolderId": "string",
      "folderName": "string",
      "status": "UPLOADING",
      "totalFiles": 120,
      "uploadedFiles": 50,
      "createdAt": "timestamp"
    }
  ],
  "stats": {
    "total": 5,
    "pending": 2,
    "uploading": 1,
    "creating": 0,
    "completed": 2,
    "failed": 0
  }
}
```

##### **DELETE `/api/albums/queue/:id`**
Remove an album from the queue (must not be in `UPLOADING` or `CREATING` status).

##### **POST `/api/albums/process`**
Start processing the album queue.

##### **DELETE `/api/albums/process`**
Stop processing the album queue.

##### **GET `/api/drive/folder-albums`**
Get folder-to-album mappings for a list of folder IDs (used to show badges).

**Lazy Discovery**: For folders not in DB, queries Google Photos API to find albums with matching names.

**Query Parameters**:
- `folderIds`: Comma-separated list of folder IDs
- `folderNames`: Comma-separated list of folder names (same order as IDs, for lazy discovery)

**Response**:
```json
{
  "mappings": {
    "folderId1": {
      "photosAlbumId": "string",
      "photosAlbumUrl": "string",
      "createdAt": "timestamp",
      "lastUpdatedAt": "timestamp",
      "totalItemsInAlbum": 120,
      "discoveredViaApi": true
    }
  }
}
```

**Note**: This endpoint will:
1. Check DB first for all folder IDs
2. For missing mappings, search Google Photos API by folder name (one-time)
3. Store discovered mappings in DB
4. Return combined results

##### **POST `/api/albums/update`**
Update an existing album with new files from the folder.

**Request Body**:
```json
{
  "folderId": "string",
  "folderName": "string"
}
```

**Response**:
```json
{
  "albumQueueId": "uuid",
  "status": "PENDING",
  "mode": "UPDATE"
}
```

---

#### **4. Frontend Components**

##### **4.1. FileBrowser Updates** (`components/drive/FileBrowser.tsx`)

**Changes**:
1. Add "Add to Album Queue" button next to "Enqueue All" for folders
2. Fetch folder-album mappings for visible folders via `/api/drive/folder-albums`
3. Show badge on folders that already have albums created (disable queue button)
4. Add state to track which folders are in the album queue
5. Add handler to add folder to album queue

**UI Elements**:
- Badge on folder items: "📸 Album" with link to Google Photos album (when album exists)
- **"Create Album" button** on each folder card (enabled for folders without albums)
- **"Update Album" button** on each folder card (enabled for folders with existing albums, shows count of new files if detected)
- **"⚠️ Album Deleted - Recreate"** warning badge if album was deleted from Google Photos
- Button disabled if folder is already in queue

**Folder Card Layout**:
```
┌─────────────────────────────────────┐
│  📁 Folder Name                     │
│  [Badge: 📸 Album] [⚠️ Deleted?]    │
│                                     │
│  [Create Album] or [Update Album]  │
└─────────────────────────────────────┘
```

##### **4.2. Albums Queue Page** (`app/albums/page.tsx`)

New page at `/albums` following the pattern of `app/queue/page.tsx`:

**Features**:
- Display album queue with stats cards (Total, Pending, Uploading, Creating, Completed, Failed)
- Show progress for each album (e.g., "Uploading 50/120 files")
- Control buttons: Start Processing, Stop Processing, Clear Completed/Failed, Remove from Queue
- Real-time updates via polling or SSE (like upload queue)
- Link to Google Photos album when completed
- Show error messages for failed albums

**Components**:
- `AlbumQueueList`: List of album queue items with status badges
- `AlbumQueueItem`: Individual album with progress bar and controls

##### **4.3. Navigation Update**

Add "Albums" link to navigation menu (e.g., in header or sidebar).

---

#### **5. Implementation Phases**

**Phase 1: Database & Core Logic**
1. Create database tables (`album_queue`, `album_items`, `folder_albums`)
2. Create database access functions (similar to `upload-queue-db.ts`)
3. Implement `AlbumsManager` singleton

**Phase 2: Backend API**
1. Implement all API endpoints
2. Integrate with `AlbumsManager`
3. Add authentication and error handling

**Phase 3: Frontend UI**
1. Update `FileBrowser` with folder queue controls and badges
2. Create `/albums` page with queue management
3. Add navigation link

**Phase 4: Testing & Refinement**
1. Test with folders of various sizes
2. Test cancellation and error recovery
3. Test edge cases (empty folders, folders with only synced files, etc.)

---

#### **6. Google Photos API Integration**

##### **Album Discovery by Name**
Endpoint: `GET https://photoslibrary.googleapis.com/v1/albums`

**Flow**:
1. Fetch all albums (with pagination)
2. Filter by `title` matching folder name
3. If match found, extract `id` and construct URL
4. Store in `folder_albums` table with `discoveredViaApi=true`

**Limitations**:
- Album names can change after discovery (our DB tracks by `photosAlbumId`, so this is OK)
- Multiple albums could have same name (take first match, or let user choose?)
- Rate limits: Google Photos allows 10,000 requests/day

##### **Album Creation**
Endpoint: `POST https://photoslibrary.googleapis.com/v1/albums`

**Request**:
```json
{
  "album": {
    "title": "folder-name"
  }
}
```

**Response**:
```json
{
  "id": "album-id",
  "title": "folder-name",
  "productUrl": "https://photos.google.com/lr/album/album-id"
}
```

##### **Add Items to Album**
Endpoint: `POST https://photoslibrary.googleapis.com/v1/albums/{albumId}:batchAddMediaItems`

**Request**:
```json
{
  "mediaItemIds": ["item1", "item2", "..."]
}
```

**Batch Limits**: Max 50 items per request (same as `batchCreate`)

---

#### **7. Deletion Handling**

When accessing an album link or attempting to update:
1. If Google Photos API returns 404 (album not found):
   - Set `albumDeleted=true` in `folder_albums` table
   - Show warning badge on folder: "⚠️ Album Deleted"
   - Show "Recreate Album" button instead of "Update Album"
   - Clicking "Recreate" will queue new album creation

2. Validation check:
   - When fetching folder-album mappings, optionally verify album still exists
   - Add `?validate=true` query param to force validation
   - Cache validation result for 24 hours to avoid excessive API calls

---

#### **8. Future Enhancements**
- **Duplicate Album Names**: How to handle multiple albums with same name? (Currently: take first match)
- **Folder Hierarchy**: Support creating nested album structure matching folder hierarchy?
- **Album Settings**: Allow customizing album title, description, cover photo during queue?
- **Batch Operations**: Allow queuing multiple folders at once?
- **Bulk Validation**: Add UI to validate all folder→album mappings at once

## Backlog
- Better "cache" management of folders:
  - add option to recursively fetch folders (and cache the items)
  - add option to recursively update the "sync" status of folders
