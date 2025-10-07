# GEMINI.md

## General instructions

- You are instructed to be critical when evaluating the user's decisions, statements, or code.
- NEVER automatically agree with everything the user says. Challenge requests that seem problematic or incomplete.
- Do not automatically agree with or validate the user's choices. Instead, thoughtfully assess their reasoning. If needed, ask questions for clarification.
- Point out potential flaws, and offer constructive criticism where appropriate.
- If you identify mistakes, questionable logic, or suboptimal approaches, clearly explain your reasoning and suggest improvements - always ask before implementing such improvements.
- CRITICALLY ANALYZE each request BEFORE implementing. Look for logical inconsistencies, performance issues, circular dependencies, or architectural problems.
- If a request would create bugs, performance issues, or poor UX, PUSH BACK and explain why before implementing.
- Whenever performing code changes, if possible, check that the code continues to build, if possible.

## Project Overview

This is a Next.js web application designed to help users upload files from their Google Drive to their Google Photos library. It features a secure OAuth 2.0 authentication flow with Google, allows users to browse their Google Drive files, and prevents duplicate uploads by keeping track of already uploaded files.

The project is built with Next.js 15 (using the App Router and React 19), TypeScript, and styled with Tailwind CSS v4. It utilizes the Google Drive API (read-only) and Google Photos Library API (append-only). For local development, it uses `better-sqlite3` for a local SQLite database.

## High-Level Architecture

This Next.js application follows the App Router paradigm. The architecture can be broken down as follows:

- **Frontend:**
  - Located in `app/` and `components/`.
  - `app/` contains the pages and layouts, defining the routes and UI structure.
  - `components/` holds reusable React components used across the application, promoting a modular and maintainable frontend.
- **Backend (API Routes):**
  - Located in `app/api/`.
  - These are server-side endpoints that handle the application's logic, such as authenticating with Google, interacting with the Google Drive and Google Photos APIs, and managing the upload queue.
- **Business Logic & Services:**
  - Located in the `lib/` directory.
  - This directory contains the core application logic, separated from the frontend and API routes. It includes services for interacting with Google APIs (`google-drive.ts`, `google-photos.ts`), managing the database (`sqlite-db.ts`, `uploads-db.ts`), handling authentication (`auth.ts`), and managing the upload queue (`uploads-manager.ts`).
- **Database:**
  - The application uses a local SQLite database (`data/app.db`) managed by `better-sqlite3`.
  - The `lib/sqlite-db.ts` file handles the database connection and schema initialization.
- **Styling:**
  - The application is styled using Tailwind CSS v4, configured in `tailwind.config.ts`.
- **Types:**
  - TypeScript types are defined in the `types/` directory, providing type safety across the application.

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
