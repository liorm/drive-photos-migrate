## TODOs

- **Feature: Create Albums from Drive Folders**
  - **1. Folder Selection & Album Creation UI**
    - Modify the Drive file browser to allow selecting folders.
    - Add a "Create Album" button, enabled when a folder is selected.
    - Clicking the button will trigger an API call to a new endpoint to start the album creation process.
  - **2. Album Job Database Schema**
    - Create a new `albums` table to track album creation jobs. It will store album title, Drive folder ID, status (`PENDING`, `UPLOADING`, `CREATING`, `COMPLETED`, `FAILED`), and the resulting Google Photos album ID.
    - Create a new `album_items` join table to link albums to their corresponding file uploads in the `uploads` table.
  - **3. Backend API for Album Creation**
    - Create a new API endpoint (e.g., `/api/albums/create`).
    - This endpoint will:
      1. Create a new record in the `albums` table.
      2. Recursively find all files in the specified Drive folder.
      3. For each file, add it to the upload queue via the `UploadsManager`.
      4. Create records in the `album_items` table to associate the files with the album job.
      5. Update the album job status to `UPLOADING`.
  - **4. Album Processing Logic**
    - Develop a background process or a trigger-based system to manage album creation jobs.
    - This processor will:
      1. Monitor albums with the `UPLOADING` status.
      2. Check if all associated files in `album_items` have a `COMPLETED` status in the `uploads` table.
      3. Once all files are uploaded, change the album status to `CREATING`.
      4. Call the Google Photos API to create a new album.
      5. Add all the uploaded media items to the new album.
      6. Update the album job status to `COMPLETED` and store the new album ID.
  - **5. Albums Queue UI**
    - Create a new page at `/albums` to display the status of all album creation jobs.
    - This page will fetch data from a new API endpoint that returns all album jobs.
    - The UI will show each album's name, its current status (e.g., "Uploading 50/120 files"), and the final album link when completed.
- Better "cache" management of folders:
  - add option to recursively fetch folders (and cache the items)
  - add option to recursively update the "sync" status of folders
