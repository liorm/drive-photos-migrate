'use client';

import { signOut } from 'next-auth/react';

/**
 * Detects if an error response is an authentication error that requires re-login
 */
export function isAuthError(errorMessage: string): boolean {
  return (
    errorMessage.includes('Authentication expired') ||
    errorMessage.includes('Unauthorized') ||
    errorMessage.includes('No access token')
  );
}

/**
 * Handles authentication errors by signing out and redirecting to signin
 */
export async function handleAuthError() {
  // Sign out the user (this clears the session)
  await signOut({
    redirect: true,
    callbackUrl: '/auth/signin',
  });
}

/**
 * Wrapper for fetch responses that automatically handles auth errors
 */
export async function handleFetchResponse(response: Response): Promise<void> {
  if (!response.ok && response.status === 401) {
    try {
      const errorData = await response.json();
      if (isAuthError(errorData.error)) {
        await handleAuthError();
        // Throw error to prevent further execution
        throw new Error('Authentication expired - Redirecting to login');
      }
    } catch (error) {
      // If JSON parsing fails or handleAuthError throws, just let the original error propagate
      if (
        error instanceof Error &&
        error.message.includes('Redirecting to login')
      ) {
        throw error;
      }
    }
  }
}
