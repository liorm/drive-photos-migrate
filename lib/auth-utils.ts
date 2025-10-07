import { NextResponse } from 'next/server';
import { Session } from 'next-auth';
import { GoogleAuthContext } from '@/types/auth';
import { createLogger } from './logger';
import { refreshAccessToken } from './token-refresh';

const logger = createLogger('auth-utils');

export interface AuthorizedSession {
  userEmail: string;
  auth: GoogleAuthContext;
}

class GoogleAuthContextImpl implements GoogleAuthContext {
  constructor(
    private _accessToken: string,
    private _refreshToken: string
  ) {}

  get accessToken() {
    return this._accessToken;
  }
  get refreshToken() {
    return this._refreshToken;
  }

  async refresh() {
    const result = await refreshAccessToken(this._refreshToken);
    this._refreshToken = result.refreshToken;
    this._accessToken = result.accessToken;
  }
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
      auth: new GoogleAuthContextImpl(
        session.accessToken,
        session.refreshToken
      ),
    },
  };
}
