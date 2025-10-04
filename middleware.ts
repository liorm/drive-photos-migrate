import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth(req => {
  // Check if session has a refresh token error
  if (req.auth?.error === 'RefreshAccessTokenError') {
    // Redirect to signin page if not already there
    const signinUrl = new URL('/auth/signin', req.url);
    return NextResponse.redirect(signinUrl);
  }

  // Allow the request to proceed
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|auth).*)'],
};
