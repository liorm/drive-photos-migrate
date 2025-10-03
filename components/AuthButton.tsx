'use client';

import { signIn, signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';

export default function AuthButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <button
        onClick={() => signOut()}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
      >
        Sign Out
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn('google')}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
    >
      Sign In with Google
    </button>
  );
}
