# GEMINI.md

## Project Overview

This is a Next.js web application designed to help users upload files from their Google Drive to their Google Photos library. It features a secure OAuth 2.0 authentication flow with Google, allows users to browse their Google Drive files, and prevents duplicate uploads by keeping track of already uploaded files.

The project is built with Next.js 15 (using the App Router and React 19), TypeScript, and styled with Tailwind CSS v4. It utilizes the Google Drive API (read-only) and Google Photos Library API (append-only). For local development, it uses `lowdb`, a simple JSON file-based database.

## Building and Running

The following scripts are available in `package.json`:

- **`pnpm dev`**: Runs the application in development mode.
- **`pnpm build`**: Builds the application for production.
- **`pnpm start`**: Starts the production server.
- **`pnpm lint`**: Lints the codebase using ESLint.
- **`pnpm format`**: Formats the code using Prettier.

To run the project locally, you need to:

1.  Install dependencies with `pnpm install`.
2.  Set up a Google Cloud Platform project with the Google Drive and Google Photos APIs enabled.
3.  Create an OAuth 2.0 client ID and secret.
4.  Create a `.env.local` file and add your credentials.
5.  Run the development server with `pnpm dev`.

## Development Conventions

- **Authentication**: The project uses NextAuth.js v5 for authentication, with a Google provider configured for OAuth 2.0. It handles token refresh automatically.
- **Routing**: The application uses the Next.js App Router. Route protection is implemented using middleware.
- **Styling**: The project uses Tailwind CSS v4 for styling.
- **Linting and Formatting**: The project is set up with ESLint and Prettier to enforce a consistent coding style.
- **Type Safety**: The project is written in TypeScript and includes type definitions for Google Drive and NextAuth.js.
