# CLAUDE.md - Development Guide

## Quick Reference

### Development Commands

```bash
# Install dependencies
pnpm install

# Development server (with isolated dist dir to avoid conflicts)
pnpm dev

# Production build
pnpm build

# Start production server
pnpm start

# Type checking
pnpm type-check

# Linting
pnpm lint                # Check for lint errors
pnpm lint:fix           # Auto-fix lint errors

# Testing
pnpm test               # Run tests once
pnpm test:watch        # Run tests in watch mode
pnpm test:e2e          # Run Playwright E2E tests

# Code formatting
pnpm format             # Format all files
pnpm format:check       # Check formatting without changes
```

### Environment Setup

1. Copy `.env.local.example` to `.env.local`
2. Generate a secret: `openssl rand -base64 32`
3. Add Google OAuth credentials:
   ```
   AUTH_SECRET=<generated-secret>
   NEXTAUTH_URL=http://localhost:3000
   AUTH_GOOGLE_ID=<your-client-id>.apps.googleusercontent.com
   AUTH_GOOGLE_SECRET=<your-client-secret>
   ```
4. Optional tuning variables:
   - `QUEUE_MAX_CONCURRENCY` (int, default 10): Max concurrent upload workers
   - `PHOTOS_MEDIA_BATCH_SIZE` (int, default 30, max 50): Files per batch to Google Photos
   - `PHOTOS_UPLOAD_BATCH_SIZE` (int, default 5, max 50): Files per batch for direct uploads
   - `QUEUE_CONCURRENCY` (int, default 5, max 10): Concurrent workers for upload queue

---

## High-Level Architecture

### Project Overview

**Google Drive to Photos Uploader** is a Next.js web application that helps users upload files from Google Drive to Google Photos, with duplicate prevention, progress tracking, and album creation capabilities.

### Core Stack

- **Framework**: Next.js 15 (App Router, React 19, TypeScript)
- **Authentication**: NextAuth.js v5 (Google OAuth 2.0)
- **Database**: SQLite with better-sqlite3 (local development)
- **APIs**: Google Drive API v3 (read-only), Google Photos Library API (append-only for uploads and app-created albums)
- **Styling**: Tailwind CSS v4 with PostCSS
- **Testing**: Vitest (unit tests), Playwright (E2E tests)
- **Code Quality**: ESLint, Prettier, TypeScript strict mode

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Client Components)                                 │
│ - app/**/page.tsx (route handlers)                           │
│ - components/* (reusable React components)                   │
│ - Context: OperationNotificationsContext (real-time updates) │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ API Routes (Server-Side Endpoints)                           │
│ - app/api/** (Next.js route handlers)                        │
│ - Request validation & session checking                      │
│ - Error handling wrapper (withErrorHandler)                  │
│ - Delegate to business logic layer                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Business Logic & Managers (lib/*)                            │
│ - UploadsManager (singleton): Manages upload queue           │
│ - AlbumsManager (singleton): Manages album creation queue    │
│ - Google API services (google-drive.ts, google-photos.ts)   │
│ - Database services (uploads-db.ts, upload-queue-db.ts, etc)│
│ - Error handling, retry logic, token refresh                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Database Layer (SQLite via better-sqlite3)                   │
│ - Persisted upload/album queues                              │
│ - Drive file cache                                           │
│ - Sync status tracking                                       │
│ - Folder-to-album mappings                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ External APIs                                                │
│ - Google Drive API (list files, get metadata)                │
│ - Google Photos API (upload bytes, create albums, batch add) │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
app/
├── api/
│   ├── auth/[...nextauth]/          # NextAuth.js routes
│   ├── queue/                        # Upload queue endpoints
│   ├── albums/                       # Album creation endpoints
│   ├── drive/                        # Drive browsing endpoints
│   ├── photos/                       # Photos API endpoints
│   └── operations/                   # Operation status streaming
├── auth/signin/                      # Custom sign-in page
├── drive/                            # Drive browser page
├── albums/                           # Album creation UI
├── queue/                            # Queue management page
├── layout.tsx                        # Root layout with sidebar/navbar
├── page.tsx                          # Dashboard home
└── globals.css                       # Tailwind CSS directives

components/
├── drive/                            # Drive browsing UI
│   ├── FileBrowser.tsx
│   ├── FileGrid.tsx
│   ├── FileItem.tsx
│   └── FolderItem.tsx
├── queue/                            # Queue management UI
│   ├── QueueList.tsx
│   └── QueueItem.tsx
├── ui/                               # Generic UI components
│   ├── OperationNotifications.tsx
│   ├── ConfirmationDialog.tsx
├── Sidebar.tsx
├── Navbar.tsx
├── Header.tsx
├── AuthButton.tsx
├── Providers.tsx
└── OperationNotificationsContext.tsx

lib/
├── uploads-manager.ts                # Singleton managing upload queue
├── albums-manager.ts                 # Singleton managing album creation queue
├── google-drive.ts                   # Google Drive API client & operations
├── google-photos.ts                  # Google Photos API client & operations
├── uploads-db.ts                     # Upload history queries
├── upload-queue-db.ts                # Upload queue persistence
├── album-queue-db.ts                 # Album queue persistence
├── sqlite-db.ts                      # Database initialization & schema
├── db.ts                             # Cache database queries
├── cache-db.ts                       # Drive file cache management
├── operation-status.ts               # Operation tracking & events (EventEmitter)
├── auth-utils.ts                     # Session validation helpers
├── token-refresh.ts                  # Token refresh with retry logic
├── error-handler.ts                  # Global API error wrapper
├── retry.ts                          # Retry logic with exponential backoff
├── backoff-controller.ts             # Rate limit backoff management
├── logger.ts                         # Structured logging with ANSI colors
├── errors.ts                         # ExtendedError class for rich error context
├── sync-status.ts                    # Sync status cache management
├── drive-cache.ts                    # Drive file cache helpers
├── upload-rate-tracker.ts            # Rate limiting for uploads
├── migration.ts                      # Database schema migrations
└── server/
    └── enqueue-all.ts                # Batch enqueue helper

types/
├── auth.ts                           # GoogleAuthContext interface
├── next-auth.d.ts                    # Session/JWT type extensions
├── google-drive.ts                   # Drive API types
├── google-photos.ts                  # Photos API types
├── upload-queue.ts                   # Queue item types
├── uploads.ts                        # Upload record types
├── album-queue.ts                    # Album queue types
├── drive-cache.ts                    # Cache types
└── sync-status.ts                    # Sync status types

data/
└── app.db                            # SQLite database (created on first run)

auth.ts                               # NextAuth.js configuration
middleware.ts                         # Route protection middleware
next.config.ts                        # Next.js configuration
tailwind.config.ts                    # Tailwind CSS configuration
tsconfig.json                         # TypeScript configuration
```

---

## Key Patterns & Conventions

### 1. Singleton Managers

**UploadsManager** (`lib/uploads-manager.ts`) and **AlbumsManager** (`lib/albums-manager.ts`) are singletons that centralize queue management:

```typescript
class UploadsManager {
  private static instance: UploadsManager | undefined;

  static getInstance(): UploadsManager {
    if (!UploadsManager.instance) {
      UploadsManager.instance = new UploadsManager();
    }
    return UploadsManager.instance;
  }

  // Track active processing per user
  private activeProcessing = new Set<string>();
  private activeControllers = new Map<string, AbortController>();

  // Core methods for queueing, processing, stopping
  async addToQueue({ userEmail, auth, fileIds, operationId }): Promise<...>;
  async startProcessing(userEmail: string, auth: GoogleAuthContext): Promise<void>;
  stopProcessing(userEmail: string): void;
}

// Use in API routes:
const manager = uploadsManager.getInstance();
await manager.addToQueue({ userEmail, auth, fileIds });
```

**Benefits**:

- Consistent state across all API routes
- Per-user concurrency control (prevent concurrent processing)
- AbortController management for cancellation
- Centralized processing logic

### 2. API Route Error Handling

All API routes wrap handlers with `withErrorHandler` to provide consistent error responses:

```typescript
import { withErrorHandler } from '@/lib/error-handler';

async function handlePOST(request: NextRequest) {
  // Your logic here
  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handlePOST);
export const GET = withErrorHandler(handleGET);
```

**Error Handler Responsibilities**:

- Catches unhandled exceptions
- Logs with full context (using prefix-based logger)
- Detects ExtendedError for rich error details
- Returns appropriate HTTP status codes (401, 404, 500)
- Logs authentication errors specifically

### 3. Session & Authentication Validation

Helper function to validate and extract auth data from sessions:

```typescript
import { validateSession } from '@/lib/auth-utils';

const session = await auth();
const sessionResult = validateSession(session, requestId);

if (!sessionResult.success) {
  return sessionResult.response; // 401 response
}

const { userEmail, auth: authContext } = sessionResult.data;
```

**Session Structure** (from `types/next-auth.d.ts`):

```typescript
interface Session {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string; // 'RefreshAccessTokenError' if token refresh failed
  user: { id: string; email: string; name: string; image: string };
}
```

### 4. Token Refresh Strategy

Token refresh is handled automatically at two levels:

**Level 1: NextAuth.js JWT Callback** (`auth.ts`):

- Checks if token is expired (compares Date.now() with expiresAt)
- Calls `refreshAccessToken()` if expired
- Returns token with `error: 'RefreshAccessTokenError'` if refresh fails

**Level 2: withGoogleAuthRetry Wrapper** (`lib/token-refresh.ts`):

- Wraps Google API calls
- If API returns 401 (Unauthorized), attempts refresh and retries
- Provides exponential backoff for retries

**Middleware** (`middleware.ts`):

- Checks for `RefreshAccessTokenError` in session
- Redirects to `/auth/signin` to force re-authentication

### 5. Operation Status Tracking

Real-time operation tracking using EventEmitter:

```typescript
import operationStatusManager, {
  OperationType,
  OperationStatus,
} from '@/lib/operation-status';

// Create an operation
const operationId = operationStatusManager.createOperation(
  OperationType.LONG_WRITE,
  'Uploading files',
  { total: 100 }
);

// Update progress
operationStatusManager.updateProgress(operationId, {
  current: 50,
  percentage: 50,
});

// Transition status
operationStatusManager.updateOperation(operationId, {
  status: OperationStatus.IN_PROGRESS,
});

// Complete or fail
operationStatusManager.completeOperation(operationId, { metadata });
operationStatusManager.failOperation(operationId, 'Error message');

// Subscribe to updates
operationStatusManager.on('operation:updated', operation => {
  console.log(operation);
});
```

**Real-Time Frontend Updates**:

- API endpoint `/api/operations/stream` streams operation events via Server-Sent Events (SSE)
- `OperationNotificationsContext` listens for events
- Components subscribe to context for real-time UI updates

### 6. Retry Logic & Rate Limiting

**Retry Wrapper** (`lib/retry.ts`):

```typescript
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T>;

// Automatically retries on:
// - 429 (rate limit)
// - 5xx errors
// - Network errors (ECONNRESET, ETIMEDOUT, etc.)

// Does NOT retry on:
// - 4xx errors (except 429)
// - Logic errors
```

**Backoff Controller** (`lib/backoff-controller.ts`):

- Manages per-user rate limiting for Google Photos API
- Enforces minimum delays between requests per user
- Prevents exceeding API quotas

### 7. Error Handling

**ExtendedError** (`lib/errors.ts`):

- Preserves error context and details
- Maintains error cause chain
- Stores status codes and retry information

```typescript
throw new ExtendedError({
  message: 'Failed to upload file',
  cause: originalError,
  details: {
    fileName: 'photo.jpg',
    statusCode: 429,
    driveFileId: 'file-123',
  },
});

// Logger automatically extracts and logs these details
```

### 8. Logging Strategy

Prefix-based structured logging:

```typescript
const logger = createLogger('my-service:my-function');

logger.info('File uploaded', {
  fileId: '123',
  fileName: 'photo.jpg',
  duration: 1234,
});

// Output: [timestamp] [INFO] [my-service:my-function] File uploaded
// { fileId: '123', fileName: 'photo.jpg', duration: 1234 }

// Child loggers for more granular prefixes
const childLogger = logger.child('sub-operation');
// Prefix becomes: my-service:my-function:sub-operation
```

### 9. Database Layer

**SQLite with better-sqlite3** (`lib/sqlite-db.ts`):

- Singleton instance ensures single connection
- WAL mode enabled for better concurrent access
- Foreign key constraints enabled
- Schema initialized on first run
- **Migrations run automatically** on startup via `lib/migration.ts`

**Migration System** (`lib/migration.ts`):

The database uses a migration-based schema evolution system:

```typescript
// Migrations are tracked in the 'migrations' table
// Each migration runs only once and is recorded

const MIGRATIONS: Array<{ name: string; migrate: (db: Database) => void }> = [
  {
    name: 'add-file-size-to-uploads',
    migrate: addFileSizeToUploads,
  },
  {
    name: 'add-album-tables',
    migrate: addAlbumTables,
  },
];

// Migration runs automatically on db.getDatabase()
// Checks 'migrations' table to see which have already run
// Executes pending migrations in order
```

**Adding New Migrations**:

1. Create migration function in `lib/migration.ts`
2. Add to `MIGRATIONS` array (append to end, never reorder!)
3. Migration runs once per database, tracked in `migrations` table
4. Always check if column/table exists before altering (idempotent)

**Important Migration Rules**:

- **Never modify existing migrations** - they may have already run in production
- **Never reorder migrations** - order matters for consistency
- **Always make migrations idempotent** - use `IF NOT EXISTS` for tables, check columns before adding
- **Test migrations** on a copy of production database first
- **Migrations run in transaction** - failure stops further migrations

**Query Organization**:

- `uploads-db.ts`: Queries for upload history (READ-only after initial insert)
- `upload-queue-db.ts`: Queue item persistence
- `album-queue-db.ts`: Album queue persistence
- `cache-db.ts`: Drive file cache
- `db.ts`: Generic cache queries

**Key Tables**:

```
uploads                   - Upload history (drive file ID -> photos media item ID)
queue_items               - Pending/processing/failed uploads
album_queue               - Album creation jobs
album_items               - Files included in albums
folder_albums             - Folder-to-album mappings (with lazy discovery)
cached_folders            - Drive folder metadata cache
cached_files              - Files within folders (cache)
cached_subfolders         - Subfolder metadata (cache)
sync_status_cache         - Sync status for UI
migrations                - Migration tracking (name, run_at)
```

### 10. Google API Integration

**Google Drive** (`lib/google-drive.ts`):

- Read-only scope
- Lists files/folders with pagination
- Supports folder navigation
- Caches metadata to reduce API calls
- Retries on rate limits and server errors

**Google Photos** (`lib/google-photos.ts`):

- Append-only scope for uploads and app-created album management
- Two-step upload process:
  1. Upload bytes to `/v1/uploads` (raw binary)
  2. Create media items with `/v1/mediaItems:batchCreate`
- Three-step album creation:
  1. Create album
  2. Create media items from Drive files
  3. Batch add items to album
- List app-created albums for duplicate prevention (restricted by Google's 2025 API changes)

**Authentication Context** (`types/auth.ts`):

```typescript
interface GoogleAuthContext {
  readonly accessToken: string;
  readonly refreshToken: string;
  refresh: () => Promise<void>; // Refresh and update context
}
```

### 11. Frontend Component Patterns

**Client Components** (`'use client'`):

- Use session from NextAuth for authorization
- Fetch data from API routes
- Update UI based on operation events
- Use Tailwind CSS for styling

**Layout** (`app/layout.tsx`):

- Sidebar for navigation
- Main content area with max width
- `OperationNotificationsProvider` wraps app
- `SessionProvider` wraps app

**Key Contexts**:

- `OperationNotificationsContext`: Real-time operation updates (SSE)

### 12. Type Safety

**Strict Mode Enabled**:

- `strict: true` in `tsconfig.json`
- No implicit `any`
- Exhaustive switch statements required

**Type Definitions Organization**:

- `types/` directory for all custom types
- Module augmentation for NextAuth (Session, JWT)
- Google API type definitions
- Queue/operation types

### 13. Build & Development Considerations

**Dev vs Build**:

- Dev mode uses `.next-dev/` (via `NEXT_DIST_DIR` env var)
- Build uses `.next/` (default)
- Allows parallel dev and build sessions

**Image Optimization**:

- Google user avatar images from `lh3.googleusercontent.com`
- Google Drive file icons from `drive.google.com` and `docs.google.com`
- Configured in `next.config.ts` for Next.js Image optimization

**ESLint Configuration**:

- `eslint-config-next` for Next.js rules
- Prettier integration for code formatting
- Tailwind CSS plugin for class sorting

---

## Common Tasks & Workflows

### Adding a New API Endpoint

1. Create route handler in `app/api/your-route/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { withErrorHandler } from '@/lib/error-handler';
import { validateSession } from '@/lib/auth-utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api:your-route');

async function handlePOST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const session = await auth();
  const sessionResult = validateSession(session, requestId);

  if (!sessionResult.success) {
    return sessionResult.response;
  }

  const { userEmail, auth: authContext } = sessionResult.data;
  logger.info('POST request', { requestId, userEmail });

  try {
    // Your logic here
    return NextResponse.json({ success: true });
  } catch (error) {
    throw error; // withErrorHandler catches it
  }
}

export const POST = withErrorHandler(handlePOST);
```

2. Business logic goes in `lib/` (if reusable) or keep in route handler

3. Add types in `types/` if needed

### Adding a New Frontend Page

1. Create `app/your-page/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function YourPage() {
  const { data: session } = useSession();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!session?.user) return;

    async function fetchData() {
      const response = await fetch('/api/your-endpoint');
      if (response.ok) {
        setData(await response.json());
      }
    }

    fetchData();
  }, [session]);

  if (!session?.user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Your UI */}
    </div>
  );
}
```

2. Add to sidebar navigation in `components/Sidebar.tsx`

### Adding a Database Migration

When you need to modify the database schema (add column, add table, add index):

1. Create migration function in `lib/migration.ts`:

```typescript
function addMyNewFeature(db: Database): void {
  logger.info('Running migration: add-my-new-feature');

  // ALWAYS check if table/column exists first (idempotent)
  const columns = db.pragma('table_info(my_table)') as Array<{ name: string }>;
  const hasNewColumn = columns.some(col => col.name === 'new_column');

  if (!hasNewColumn) {
    logger.info('Adding new_column to my_table');
    db.exec('ALTER TABLE my_table ADD COLUMN new_column TEXT');
  }

  // Or create new table (IF NOT EXISTS is idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS my_new_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
  `);

  // Add indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_my_new_table_name
    ON my_new_table(name);
  `);
}
```

2. Add to `MIGRATIONS` array at the end:

```typescript
const MIGRATIONS: Array<{ name: string; migrate: (db: Database) => void }> = [
  {
    name: 'add-file-size-to-uploads',
    migrate: addFileSizeToUploads,
  },
  {
    name: 'add-album-tables',
    migrate: addAlbumTables,
  },
  {
    name: 'add-my-new-feature', // New migration
    migrate: addMyNewFeature,
  },
];
```

3. **IMPORTANT**:
   - Never modify existing migrations
   - Never reorder migrations
   - Always append new migrations to the end
   - Make migrations idempotent (check before altering)
   - Test on a database copy first

4. Migration runs automatically on next `pnpm dev` or app restart

### Debugging

**Logging**:

- All important operations logged with prefix-based loggers
- Use `createLogger('your-prefix')` in files
- Logs include context objects automatically
- Error logs include stack traces and error causes

**Operation Status Tracking**:

- Create operation with `operationStatusManager.createOperation()`
- Monitor progress via `/api/operations/status`
- Stream updates via `/api/operations/stream` (SSE)

**Database Queries**:

- SQLite database at `data/app.db`
- Use any SQLite client to inspect
- Schema automatically initialized on startup

---

## Testing

### Unit Tests (Vitest)

Located in `lib/**/*.test.ts`:

```bash
pnpm test              # Run all tests once
pnpm test:watch       # Watch mode for development
```

Example test (`lib/my-function.test.ts`):

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { myFunction } from './my-function';

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });
});
```

### E2E Tests (Playwright)

Located in `tests/e2e/`:

```bash
pnpm test:e2e          # Run E2E tests
```

---

## Important Implementation Details

### Upload Queue Processing

The `UploadsManager.startProcessing()` method:

1. **Fetch Queue**: Gets all items with status `pending` or `uploading`
2. **Reset Stuck Items**: Changes `uploading` items (from previous runs) to `pending`
3. **Process in Batches**:
   - Respects `QUEUE_MAX_CONCURRENCY` limit
   - For each item:
     - Downloads Drive file
     - Uploads to Photos (gets upload token)
     - Creates media item in Photos
     - Records in `uploads` table
     - Updates queue item status
4. **Error Handling**:
   - Captures errors per item
   - Sets item status to `failed`
   - Stores error message
   - Continues processing remaining items
5. **Rate Limiting**:
   - Uses `UploadRateTracker` per user
   - Enforces minimum delays between requests

### Album Creation Processing

The `AlbumsManager.startProcessing()` method:

1. **Check Album Status**: Determine if creating or updating
2. **Enumerate Files**: Get all files from Drive folder
3. **Upload Phase**: Use `UploadsManager` to queue and upload all files
4. **Create/Add Phase**:
   - Create album in Google Photos (if new)
   - Batch add all media items to album
5. **Store Mapping**: Save `folder_albums` record for future reference
6. **Handle Updates**: If album already exists, only add new files

### Duplicate Prevention

Three-layer approach:

1. **Frontend**: Show "Already uploaded" badge on files
2. **Database Query**: Check `uploads` table before queueing
3. **API Check**: Verify media item exists in Photos before creating

---

## Performance Considerations

1. **Caching**: Drive file metadata cached to reduce API calls
2. **Batching**: Media items created in batches (up to 50 per request)
3. **Concurrency Control**: Per-user concurrency limits prevent API throttling
4. **Rate Limiting**: Backoff controller enforces delays between requests
5. **Database**: WAL mode enables better concurrent read/write access
6. **Session**: Token refresh happens proactively before expiration

---

## Security Considerations

1. **OAuth 2.0**: Offline access with refresh tokens
2. **Scopes**: Minimal scopes (read-only for Drive, append-only for Photos to upload and manage app-created albums)
3. **Session Validation**: All API routes validate session before processing
4. **Error Messages**: Sensitive details not leaked to frontend
5. **Token Rotation**: Automatic token refresh before expiration
6. **Middleware**: Route protection redirects to sign-in if token invalid

---

## Troubleshooting

### Common Issues

**"RefreshAccessTokenError"**

- Token refresh failed (usually credentials invalid)
- User must sign in again
- Middleware handles redirect automatically

**Rate Limiting (429 errors)**

- Reduce `QUEUE_MAX_CONCURRENCY`
- Increase `PHOTOS_MEDIA_BATCH_SIZE` (fewer requests, more items per request)
- Use backoff delays (automatic with retry logic)

**Stuck Upload Items**

- Items with status `uploading` from previous run stuck
- `UploadsManager` automatically resets on initialization
- Can also clear and requeue manually via API

**Database Locked**

- Multiple writers trying to write simultaneously
- SQLite should handle this with WAL mode
- Check for long-running transactions

**Files Not Showing in Drive Browser**

- Folder might not be cached
- Click refresh to re-enumerate folder
- Cache expires after certain period (check `cached_folders` table)

---

## Future Enhancements

See `PLAN.md` for album creation feature details and roadmap.

Key upcoming features:

- Album creation from Drive folders (in progress)
- Batch operations (create multiple albums)
- Smart duplicate detection (hash-based)
- Resume upload queue across sessions
- Progress persistence to localStorage
