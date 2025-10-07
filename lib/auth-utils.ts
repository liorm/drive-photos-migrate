import { NextResponse } from 'next/server';
import { Session } from 'next-auth';
import { GoogleAuthContext } from '@/types/auth';
import { createLogger } from './logger';

const logger = createLogger('auth-utils');

export interface AuthorizedSession {
  userEmail: string;
  auth: GoogleAuthContext;
}

/**
 * Validates a session and returns authorized session data or an error response
 */
export function validateSession(
  session: Session | null,
  requestId?: string
):
  | { success: true; data: AuthorizedSession }
  | { success: false; response: NextResponse } {
  // Check for required tokens and user email
  if (
    !session?.accessToken ||
    !session?.refreshToken ||
    !session?.user?.email
  ) {
    logger.warn('Unauthorized request - Missing tokens or email', {
      requestId,
    });
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized - No access token or refresh token' },
        { status: 401 }
      ),
    };
  }

  // Check if token refresh failed
  if (session.error === 'RefreshAccessTokenError') {
    logger.warn('Authentication expired', {
      requestId,
      userEmail: session.user.email,
    });
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Authentication expired - Please sign in again' },
        { status: 401 }
      ),
    };
  }

  return {
    success: true,
    data: {
      userEmail: session.user.email,
      auth: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      },
    },
  };
}
