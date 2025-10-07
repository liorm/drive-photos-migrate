import { createLogger } from './logger';
import { GoogleAuthContext } from '@/types/auth';

const logger = createLogger('token-refresh');

export interface RefreshedTokens {
  accessToken: string;
  expiresAt: number; // epoch seconds
  refreshToken: string; // may be same as input
}

/**
 * Refresh Google OAuth access token using a refresh token.
 * Mirrors logic used in NextAuth JWT callback but exported for ad-hoc runtime refresh
 * when an unexpected 401/invalid_grant is encountered mid-request.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshedTokens> {
  logger.info('Attempting to refresh access token (runtime)');

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const tokens = await response.json();

    if (!response.ok) {
      logger.error('Token refresh failed', new Error(tokens.error), {
        statusCode: response.status,
      });
      throw new Error(tokens.error || 'Failed to refresh token');
    }

    logger.info('Access token refreshed successfully (runtime)', {
      expiresIn: tokens.expires_in,
    });

    return {
      accessToken: tokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      refreshToken: tokens.refresh_token ?? refreshToken,
    };
  } catch (error) {
    logger.error('Error refreshing access token (runtime)', error);
    throw error;
  }
}

/**
 * Detect if an error represents an authorization failure that warrants a token refresh attempt.
 */
export function isAuthError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as any;
  const message = (anyErr.message || '').toString().toLowerCase();
  const statusCode =
    anyErr.code ||
    anyErr.status ||
    anyErr.statusCode ||
    anyErr?.details?.statusCode;
  if (statusCode === 401) return true;
  // Sometimes googleapis sets errors like err.errors[0].reason === 'authError'
  if (Array.isArray(anyErr.errors)) {
    if (anyErr.errors.some((e: any) => e?.reason === 'authError')) return true;
  }
  return (
    message.includes('unauthorized') || message.includes('invalid credentials')
  );
}

/**
 * Execute an async function that performs a Google API call, refreshing the access token once on 401.
 * The exec function is passed the (possibly updated) access token.
 * Returns the result and the (possibly refreshed) access token for chaining.
 */
export async function withGoogleAuthRetry<T>(
  auth: GoogleAuthContext,
  exec: (token: string) => Promise<T>
): Promise<{ result: T; accessToken: string }> {
  try {
    const result = await exec(auth.accessToken);
    return { result, accessToken: auth.accessToken };
  } catch (err) {
    if (!auth.refreshToken || !isAuthError(err)) throw err;

    logger.warn(
      'Auth error detected, attempting single token refresh then retry',
      {
        error: (err as Error).message,
      }
    );
    const refreshed = await refreshAccessToken(auth.refreshToken);
    const result = await exec(refreshed.accessToken);
    return { result, accessToken: refreshed.accessToken };
  }
}
