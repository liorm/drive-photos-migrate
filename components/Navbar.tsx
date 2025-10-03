import { auth } from '@/auth';
import AuthButton from '@/components/AuthButton';
import Image from 'next/image';

export default async function Navbar() {
  const session = await auth();

  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur-sm">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Drive → Photos</h1>
            <p className="text-xs text-gray-500">Upload Manager</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {session?.user && (
            <div className="flex items-center gap-3 rounded-full bg-gray-50 py-1.5 pr-4 pl-1.5">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full ring-2 ring-white"
                />
              )}
              <div className="hidden flex-col sm:flex">
                <span className="text-sm font-medium text-gray-900">
                  {session.user.name}
                </span>
                <span className="text-xs text-gray-500">
                  {session.user.email}
                </span>
              </div>
            </div>
          )}
          <AuthButton />
        </div>
      </div>
    </nav>
  );
}
