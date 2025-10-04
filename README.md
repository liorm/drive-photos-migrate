# **Google Drive to Google Photos Uploader**

A web application built with Next.js to help you seamlessly upload files from your Google Drive to your Google Photos library. It keeps track of uploaded files to prevent duplicates.

## **Core Features**

- **Authenticate with Google:** Securely log in using your Google account with OAuth 2.0.
- **Browse Google Drive:** View and select files and folders from your Google Drive.
- **Upload to Google Photos:** Upload selected files directly to your Google Photos library.
- **Duplicate Prevention:** The application will keep a record of uploaded files to avoid uploading the same file multiple times.
- **Status Tracking:** See the status of your uploads (pending, success, error).
- **Responsive UI:** A clean and easy-to-use interface that works on all devices.

## **Technical Stack**

- **Framework:** [Next.js 15](https://nextjs.org/) with App Router (React 19\)
- **Language:** TypeScript
- **Authentication:** [Auth.js v5 (NextAuth.js)](https://authjs.dev/) for Google OAuth 2.0
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Google APIs:**
  - [Google Drive API v3](https://developers.google.com/drive/api/v3/about-sdk) (read-only scope)
  - [Google Photos Library API](https://developers.google.com/photos/library/guides/overview) (append-only scope)
- **Database:** [lowdb v7](https://github.com/typicode/lowdb) (for local development, using a simple JSON file). Firestore is a good option for a future production deployment.
- **Deployment:** Vercel

## **Project Structure**

.  
├── app/ \# Next.js App Router  
│ ├── api/  
│ │ ├── auth/  
│ │ │ └── \[...nextauth\]/ \# Auth.js API routes  
│ │ └── drive/  
│ │ └── files/ \# Drive files listing endpoint  
│ ├── auth/  
│ │ └── signin/ \# Custom sign-in page  
│ ├── drive/  
│ │ └── page.tsx \# Drive browser page  
│ ├── layout.tsx \# Root layout with sidebar & navbar  
│ ├── page.tsx \# Dashboard home page  
│ └── globals.css \# Tailwind CSS directives  
├── components/ \# Reusable React components  
│ ├── drive/  
│ │ ├── FileBrowser.tsx \# Main file browser container  
│ │ ├── FileGrid.tsx \# Grid layout for files/folders  
│ │ ├── FileItem.tsx \# Individual file card  
│ │ └── FolderItem.tsx \# Folder navigation card  
│ ├── AuthButton.tsx \# Client-side auth button  
│ ├── Header.tsx \# Header with user info  
│ ├── Navbar.tsx \# Top navigation bar  
│ ├── Sidebar.tsx \# Sidebar navigation menu  
│ └── Providers.tsx \# Client-side providers wrapper  
├── lib/  
│ └── google-drive.ts \# Drive API service layer  
├── types/ \# TypeScript type definitions  
│ ├── google-drive.ts \# Drive file/folder types  
│ └── next-auth.d.ts \# Extended session types  
├── auth.ts \# Auth.js v5 configuration  
├── middleware.ts \# Route protection  
├── .env.local.example \# Environment variable template  
├── next.config.ts \# Next.js configuration  
├── tailwind.config.ts \# Tailwind CSS v4 configuration  
├── tsconfig.json \# TypeScript configuration  
└── package.json \# Dependencies and scripts

## **Setup and Installation**

1. **Clone the repository:**  
   git clone \<repository-url\>  
   cd google-photos

2. **Install dependencies:**  
   pnpm install

3. **Google Cloud Platform Setup:**
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Enable the **Google Drive API** and **Google Photos Library API**
   - Go to "Credentials", create an "OAuth client ID" for a "Web application"
   - Add http://localhost:3000 to "Authorized JavaScript origins"
   - Add http://localhost:3000/api/auth/callback/google to "Authorized redirect URIs"
   - Copy the "Client ID" and "Client Secret"
4. **Environment Variables:**
   - Copy the example file: cp .env.local.example .env.local
   - Generate a secret: openssl rand \-base64 32
   - Edit .env.local and add your credentials:

AUTH_SECRET=\<generated-secret\>  
NEXTAUTH_URL=http://localhost:3000  
AUTH_GOOGLE_ID=\<your-client-id\>.apps.googleusercontent.com  
AUTH_GOOGLE_SECRET=\<your-client-secret\>

5. **Run the development server:**  
   pnpm dev

   Open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000) in your browser.

## **Development Roadmap**

### **Phase 1: Authentication & Basic UI ✅ COMPLETED**

- ✅ **Setup Next.js & Tailwind CSS:** Initialized Next.js 15 with TypeScript, App Router, and Tailwind CSS v4
- ✅ **Integrate NextAuth.js:** Implemented Auth.js v5 with Google OAuth 2.0
- ✅ **Create Layout:** Built responsive layout with Header, AuthButton, and Tailwind CSS dark mode support.
- ✅ **Protected Routes:** Implemented middleware-based route protection.

### **Phase 2: Google Drive Integration ✅ COMPLETED**

- ✅ **Create Drive API Service:** Implemented lib/google-drive.ts for API communication.
- ✅ **Fetch Files & Folders:** Created server-side API endpoint /api/drive/files.
- ✅ **Build File Browser UI:** Created FileBrowser, FileGrid, FileItem, and FolderItem components.
- ✅ **Implement File Selection:** Added multi-file selection with "Select All" and "Deselect All".
- ✅ **Browser Navigation Support:** Implemented URL-based navigation for folders.

### **Phase 3: Caching Google Drive Files & Infinite Scroll ✅ COMPLETED**

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

### **Phase 4: Google Photos Integration & Upload Tracking**

- \[ \] **Create Photos API Service:** Write functions to communicate with the Google Photos Library API.
- \[ \] **Implement Upload Functionality:** Create the backend logic to handle the multi-step file upload process (get upload token, upload bytes, create media item).
- \[ \] **Implement Upload Tracking:** Use lowdb (e.g., in data/uploads.json) to track uploaded files to prevent duplicates.
  - Before starting an upload, check the uploads.json file.
  - After a successful upload, record the file's driveFileId and photosMediaItemId.
- \[ \] **Connect UI to Upload Logic:** Add an "Upload Selected" button to the FileBrowser component that triggers the process.
- \[ \] **Update UI with File Status:** Visually indicate which files in the browser have already been uploaded based on the tracking data.

### **Phase 5: Polishing and Deployment**

- \[ \] **Add Loading & Upload Status UI:** Show spinners during syncs and detailed progress during uploads.
- \[ \] **Implement Error Handling:** Display user-friendly error messages for API or upload failures.
- \[ \] **Refine UI/UX:** Improve the overall look, feel, and performance.
- \[ \] **Deploy to Vercel:** Configure the project for production deployment.
