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

- **Framework:** [Next.js 15](https://nextjs.org/) with App Router (React 19)
- **Language:** TypeScript
- **Authentication:** [Auth.js v5 (NextAuth.js)](https://authjs.dev/) for Google OAuth 2.0
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Google APIs:**
  - [Google Drive API v3](https://developers.google.com/drive/api/v3/about-sdk) (read-only scope)
  - [Google Photos Library API](https://developers.google.com/photos/library/guides/overview) (append-only scope)
- **Database:** [lowdb v7](https://github.com/typicode/lowdb) (for local development, using a simple JSON file). Firestore is a good option for a future production deployment.
- **Deployment:** Vercel

## **Project Structure**

```
.
├── app/                      # Next.js App Router
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/  # Auth.js API routes
│   ├── auth/
│   │   └── signin/           # Custom sign-in page
│   ├── layout.tsx            # Root layout with header
│   ├── page.tsx              # Home page (protected)
│   └── globals.css           # Tailwind CSS directives
├── components/               # Reusable React components
│   ├── Header.tsx            # Header with user info
│   └── AuthButton.tsx        # Client-side auth button
├── types/                    # TypeScript type definitions
│   └── next-auth.d.ts        # Extended session types
├── auth.ts                   # Auth.js v5 configuration
├── middleware.ts             # Route protection
├── .env.local.example        # Environment variable template
├── next.config.ts            # Next.js configuration
├── tailwind.config.ts        # Tailwind CSS v4 configuration
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies and scripts
```

## **Setup and Installation**

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd google-photos
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Google Cloud Platform Setup:**
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Enable the **Google Drive API** and **Google Photos Library API**
   - Go to "Credentials", create an "OAuth client ID" for a "Web application"
   - Add `http://localhost:3000` to "Authorized JavaScript origins"
   - Add `http://localhost:3000/api/auth/callback/google` to "Authorized redirect URIs"
   - Copy the "Client ID" and "Client Secret"

4. **Environment Variables:**
   - Copy the example file: `cp .env.local.example .env.local`
   - Generate a secret: `openssl rand -base64 32`
   - Edit `.env.local` and add your credentials:

   ```bash
   AUTH_SECRET=<generated-secret>
   NEXTAUTH_URL=http://localhost:3000
   AUTH_GOOGLE_ID=<your-client-id>.apps.googleusercontent.com
   AUTH_GOOGLE_SECRET=<your-client-secret>
   ```

5. **Run the development server:**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## **Development Roadmap**

### **Phase 1: Authentication & Basic UI** ✅ COMPLETED

- ✅ **Setup Next.js & Tailwind CSS:** Initialized Next.js 15 with TypeScript, App Router, and Tailwind CSS v4
- ✅ **Integrate NextAuth.js:** Implemented Auth.js v5 with Google OAuth 2.0
  - Configured Google Drive API (read-only) and Google Photos Library API (append-only) scopes
  - Created custom sign-in page with Google branding
  - Set up JWT and session callbacks to store access tokens
- ✅ **Create Layout:** Built responsive layout with:
  - Header component with user profile display
  - Client-side authentication button
  - Tailwind CSS styling with dark mode support
- ✅ **Protected Routes:** Implemented middleware-based route protection
  - All routes except `/auth/*` require authentication
  - Automatic redirect to sign-in page for unauthenticated users

### **Phase 2: Google Drive Integration**

- \[ \] **Create Drive API Service:** Write functions to communicate with the Google Drive API.
- \[ \] **Fetch Files & Folders:** Implement logic to list files and folders from the user's Drive.
- \[ \] **Build File Browser UI:** Create components to display and navigate Drive contents.
- \[ \] **Implement File Selection:** Allow users to select one or more files to upload.

### **Phase 3: Google Photos Integration & Upload Logic**

- \[ \] **Create Photos API Service:** Write functions to communicate with the Google Photos Library API.
- \[ \] **Implement Upload Functionality:** Create the backend logic to handle the file upload process. This involves:
  1. Getting an upload token from the Photos API.
  2. Uploading the file bytes.
  3. Creating a media item in the user's library.
- \[ \] **Connect UI to Upload Logic:** Add an "Upload" button that triggers the process.

### **Phase 4: Tracking Uploaded Files**

- \[ \] **Setup Local Database:** Use a simple file-based database like lowdb to create a data/db.json file for tracking uploads.
- \[ \] **Define Data Structure:** The db.json file will store an array of objects, each containing userId, driveFileId, photosMediaItemId, etc.
- \[ \] **Implement Tracking Logic:**
  - Before uploading, check the db.json file to see if the driveFileId already exists for the current user.
  - If it exists, skip the file.
  - If it doesn't exist, proceed with the upload.
  - After a successful upload, save the new record to the db.json file.
- \[ \] **Update UI with File Status:** Visually indicate which files have already been uploaded.

### **Phase 5: Polishing and Deployment**

- \[ \] **Add Loading States:** Show spinners or loaders during API calls.
- \[ \] **Implement Error Handling:** Display user-friendly error messages.
- \[ \] **Refine UI/UX:** Improve the overall look and feel.
- \[ \] **Deploy to Vercel:** Configure the project for production deployment (and potentially migrate to a cloud database like Firestore).
