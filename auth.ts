import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

/**
 * Refreshes an expired access token using the refresh token
 */
async function refreshAccessToken(refreshToken: string) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(tokens.error || 'Failed to refresh token');
    }

    return {
      accessToken: tokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      refreshToken: tokens.refresh_token ?? refreshToken, // Fall back to old refresh token
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          access_type: 'offline',
          prompt: 'consent',
          scope: [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/photoslibrary.appendonly',
          ].join(' '),
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign in
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        return token;
      }

      // Token is still valid
      const expiresAt = token.expiresAt as number;
      if (Date.now() < expiresAt * 1000) {
        return token;
      }

      // Token has expired, refresh it
      try {
        const refreshToken = token.refreshToken as string;
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const refreshedTokens = await refreshAccessToken(refreshToken);

        return {
          ...token,
          accessToken: refreshedTokens.accessToken,
          expiresAt: refreshedTokens.expiresAt,
          refreshToken: refreshedTokens.refreshToken,
        };
      } catch (error) {
        console.error('Error refreshing token:', error);
        // Return token with error flag to trigger re-authentication
        return {
          ...token,
          error: 'RefreshAccessTokenError',
        };
      }
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      session.expiresAt = token.expiresAt as number;
      session.error = token.error as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
});
