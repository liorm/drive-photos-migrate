# **Google Drive to Google Photos Uploader**

A web application built with Next.js to help you seamlessly upload files from your Google Drive to your Google Photos library. It keeps track of uploaded files to prevent duplicates.

## **Core Features**

* **Authenticate with Google:** Securely log in using your Google account with OAuth 2.0.  
* **Browse Google Drive:** View and select files and folders from your Google Drive.  
* **Upload to Google Photos:** Upload selected files directly to your Google Photos library.  
* **Duplicate Prevention:** The application will keep a record of uploaded files to avoid uploading the same file multiple times.  
* **Status Tracking:** See the status of your uploads (pending, success, error).  
* **Responsive UI:** A clean and easy-to-use interface that works on all devices.

## **Technical Stack**

* **Framework:** [Next.js](https://nextjs.org/) (React)  
* **Authentication:** [NextAuth.js](https://next-auth.js.org/) for Google OAuth 2.0  
* **Styling:** [Tailwind CSS](https://tailwindcss.com/)  
* **Google APIs:**  
  * [Google Drive API v3](https://developers.google.com/drive/api/v3/about-sdk)  
  * [Google Photos Library API](https://developers.google.com/photos/library/guides/overview)  
* **Database:** [lowdb](https://github.com/typicode/lowdb) (for local development, using a simple JSON file). Firestore is a good option for a future production deployment.  
* **Deployment:** Vercel

## **Project Structure**

.  
├── components/         \# Reusable React components (e.g., FileBrowser, UploadStatus)  
├── data/               \# Will contain our local JSON database  
│   └── db.json  
├── pages/  
│   ├── api/            \# API routes for backend logic  
│   │   ├── auth/       \# NextAuth.js routes  
│   │   ├── drive/      \# API routes for Google Drive actions  
│   │   └── photos/     \# API routes for Google Photos actions  
│   ├── \_app.js  
│   ├── \_document.js  
│   └── index.js        \# Main application page  
├── public/             \# Static assets  
├── services/           \# Modules for interacting with external APIs (Google, Database)  
├── styles/             \# Global styles  
├── utils/              \# Utility functions  
├── .env.local          \# Environment variables (API keys, etc.)  
├── next.config.js  
└── package.json

## **Setup and Installation**

1. **Clone the repository:**  
   git clone \<repository-url\>  
   cd \<repository-name\>

2. **Install dependencies:**  
   npm install  
   \# or  
   yarn install

3. **Google Cloud Platform Setup:**  
   * Go to the [Google Cloud Console](https://console.cloud.google.com/).  
   * Create a new project.  
   * Enable the **Google Drive API** and **Google Photos Library API**.  
   * Go to "Credentials", create an "OAuth client ID" for a "Web application".  
   * Add http://localhost:3000 to "Authorized JavaScript origins".  
   * Add http://localhost:3000/api/auth/callback/google to "Authorized redirect URIs".  
   * Copy the "Client ID" and "Client Secret".  
4. **Environment Variables:**  
   * Create a .env.local file in the root of the project.  
   * Add your Google credentials and a NEXTAUTH\_SECRET.

GOOGLE\_CLIENT\_ID=your-google-client-id  
GOOGLE\_CLIENT\_SECRET=your-google-client-secret  
NEXTAUTH\_URL=http://localhost:3000  
NEXTAUTH\_SECRET=a-secure-random-string

5. **Run the development server:**  
   npm run dev  
   \# or  
   yarn dev

## **Development Roadmap**

### **Phase 1: Authentication & Basic UI**

* \[ \] **Setup Next.js & Tailwind CSS:** Initialize the project.  
* \[ \] **Integrate NextAuth.js:** Implement Google Sign-In.  
* \[ \] **Create Layout:** Build the main application shell (header, sidebar, content area).  
* \[ \] **Protected Routes:** Ensure users must be logged in to access the main features.

### **Phase 2: Google Drive Integration**

* \[ \] **Create Drive API Service:** Write functions to communicate with the Google Drive API.  
* \[ \] **Fetch Files & Folders:** Implement logic to list files and folders from the user's Drive.  
* \[ \] **Build File Browser UI:** Create components to display and navigate Drive contents.  
* \[ \] **Implement File Selection:** Allow users to select one or more files to upload.

### **Phase 3: Google Photos Integration & Upload Logic**

* \[ \] **Create Photos API Service:** Write functions to communicate with the Google Photos Library API.  
* \[ \] **Implement Upload Functionality:** Create the backend logic to handle the file upload process. This involves:  
  1. Getting an upload token from the Photos API.  
  2. Uploading the file bytes.  
  3. Creating a media item in the user's library.  
* \[ \] **Connect UI to Upload Logic:** Add an "Upload" button that triggers the process.

### **Phase 4: Tracking Uploaded Files**

* \[ \] **Setup Local Database:** Use a simple file-based database like lowdb to create a data/db.json file for tracking uploads.  
* \[ \] **Define Data Structure:** The db.json file will store an array of objects, each containing userId, driveFileId, photosMediaItemId, etc.  
* \[ \] **Implement Tracking Logic:**  
  * Before uploading, check the db.json file to see if the driveFileId already exists for the current user.  
  * If it exists, skip the file.  
  * If it doesn't exist, proceed with the upload.  
  * After a successful upload, save the new record to the db.json file.  
* \[ \] **Update UI with File Status:** Visually indicate which files have already been uploaded.

### **Phase 5: Polishing and Deployment**

* \[ \] **Add Loading States:** Show spinners or loaders during API calls.  
* \[ \] **Implement Error Handling:** Display user-friendly error messages.  
* \[ \] **Refine UI/UX:** Improve the overall look and feel.  
* \[ \] **Deploy to Vercel:** Configure the project for production deployment (and potentially migrate to a cloud database like Firestore).