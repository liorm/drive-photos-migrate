# **Development Roadmap**

## **Phase 1: Authentication & Basic UI ✅ COMPLETED**

- ✅ **Setup Next.js & Tailwind CSS:** Initialized Next.js 15 with TypeScript, App Router, and Tailwind CSS v4
- ✅ **Integrate NextAuth.js:** Implemented Auth.js v5 with Google OAuth 2.0
- ✅ **Create Layout:** Built responsive layout with Header, AuthButton, and Tailwind CSS dark mode support.
- ✅ **Protected Routes:** Implemented middleware-based route protection.

## **Phase 2: Google Drive Integration ✅ COMPLETED**

- ✅ **Create Drive API Service:** Implemented lib/google-drive.ts for API communication.
- ✅ **Fetch Files & Folders:** Created server-side API endpoint /api/drive/files.
- ✅ **Build File Browser UI:** Created FileBrowser, FileGrid, FileItem, and FolderItem components.
- ✅ **Implement File Selection:** Added multi-file selection with "Select All" and "Deselect All".
- ✅ **Browser Navigation Support:** Implemented URL-based navigation for folders.

## **Phase 3: Caching Google Drive Files & Infinite Scroll ✅ COMPLETED**

- ✅ **Setup Local Database for Caching:** Implemented lowdb with data/drive_cache.json for backend storage.
- ✅ **Define Cache Data Structure:** Created schema to store files with rich metadata (ID, name, size, creation date, thumbnail, dimensions, etc.), organized by folder and user.
- ✅ **Implement Backend Caching Logic:** Updated /api/drive/files endpoint to:
  1. Fetch the latest list of files from the Google Drive API for a requested folder.
  2. Update the drive_cache.json for that folder, adding new files and updating existing ones.
- ✅ **Implement Paginated API Response:** API returns paginated cached files with hasMore flag and totalCount for efficient data transfer.
- ✅ **Implement Frontend Infinite Scroll:**
  - FileBrowser component loads initial batch of files from cache with pagination support.
  - Intersection Observer detects scroll position and automatically loads more files.
  - Smooth infinite scroll effect with loading indicators.
- ✅ **Add Refresh Functionality:** Implemented refresh button to force re-sync from Google Drive API.

## **Phase 4: Google Photos Integration & Upload Tracking**

- [ ] **Create Photos API Service:** Write functions to communicate with the Google Photos Library API.
- [ ] **Implement Upload Functionality:** Create the backend logic to handle the multi-step file upload process (get upload token, upload bytes, create media item).
- [ ] **Implement Upload Tracking:** Use lowdb (e.g., in data/uploads.json) to track uploaded files to prevent duplicates.
  - Before starting an upload, check the uploads.json file.
  - After a successful upload, record the file's driveFileId and photosMediaItemId.
- [ ] **Connect UI to Upload Logic:** Add an "Upload Selected" button to the FileBrowser component that triggers the process.
- [ ] **Update UI with File Status:** Visually indicate which files in the browser have already been uploaded based on the tracking data.

## **Phase 5: Polishing and Deployment**

- [ ] **Add Loading & Upload Status UI:** Show spinners during syncs and detailed progress during uploads.
- [ ] **Implement Error Handling:** Display user-friendly error messages for API or upload failures.
- [ ] **Refine UI/UX:** Improve the overall look, feel, and performance.
- [ ] **Deploy to Vercel:** Configure the project for production deployment.
