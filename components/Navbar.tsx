'use client';

import { Menu } from 'lucide-react';

interface NavbarProps {
  onMenuClick: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  return (
    <nav className="fixed top-0 z-30 w-full border-b border-gray-200 bg-white">
      <div className="px-3 py-3 lg:px-5 lg:pl-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-start">
            <button
              onClick={onMenuClick}
              className="inline-flex items-center rounded-lg p-2 text-sm text-gray-500 hover:bg-gray-100 focus:ring-2 focus:ring-gray-200 focus:outline-none lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="ml-2 self-center text-xl font-semibold whitespace-nowrap sm:text-2xl">
              Google Drive Photo Migrator
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
