'use client';

import { Home, FolderOpen, X, LogOut, LogIn, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import Image from 'next/image';
import { useState } from 'react';

const menuItems = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Browse', href: '/drive', icon: FolderOpen },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  // Treat sessions with errors as logged out
  const isValidSession = session && !session.error;

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 z-30 rounded-lg bg-white p-2 text-gray-500 shadow-md hover:bg-gray-100 lg:hidden"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="bg-opacity-50 fixed inset-0 z-20 bg-black lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-64 transition-transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col border-r border-gray-200 bg-gray-50 lg:translate-x-0`}
      >
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-3 right-3 rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Navigation Menu */}
        <div className="flex-1 overflow-y-auto bg-gray-50 px-3 pt-4 pb-4">
          <ul className="space-y-2 font-medium">
            {menuItems.map(item => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`group flex items-center rounded-lg p-2 hover:bg-gray-100 ${
                      isActive ? 'bg-gray-100 text-blue-600' : 'text-gray-900'
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 transition duration-75 ${
                        isActive
                          ? 'text-blue-600'
                          : 'text-gray-500 group-hover:text-gray-900'
                      }`}
                    />
                    <span className="ml-3">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Auth Section at Bottom */}
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-4">
          {isValidSession ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-white p-2">
                {session.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name || 'User'}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300 font-semibold text-gray-600">
                    {session.user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {session.user?.name || 'User'}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {session.user?.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="flex w-full items-center justify-center gap-2 rounded-lg p-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn('google')}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 p-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <LogIn className="h-4 w-4" />
              Sign In with Google
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
