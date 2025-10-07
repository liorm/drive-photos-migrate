# **Drive Photos Migrate**

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
   cd drive-photos-migrate

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

Additional tuning environment variables

- `QUEUE_MAX_CONCURRENCY` (integer, default 10): Maximum number of concurrent
   workers used to process a single user's upload queue. Lower this to reduce
   parallel downloads/uploads and overall API usage.
- `PHOTOS_MEDIA_BATCH_SIZE` (integer, default 30, max 50): Number of media
   items sent in a single `mediaItems:batchCreate` call when processing the
   main upload queue. Keep this <= 50 (Google Photos API limit).
- `PHOTOS_UPLOAD_BATCH_SIZE` (integer, default 5, max 50): Number of media
   items sent per `mediaItems:batchCreate` call when using the `batchUploadFiles`
   helper (used by file upload flows). Keep this <= 50.
   - `QUEUE_CONCURRENCY` (integer, default 5, max 10): Number of concurrent
      workers used to process a single user's upload queue. Lower this to reduce
      parallel downloads/uploads and overall API usage.

5. **Run the development server:**
   pnpm dev

   Open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000) in your browser.

## **Development Roadmap**

See [PLAN.md](PLAN.md) for the detailed development roadmap.
