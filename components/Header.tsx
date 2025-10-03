import { auth } from '@/auth';
import AuthButton from '@/components/AuthButton';
import Image from 'next/image';

export default async function Header() {
  const session = await auth();

  return (
    <header className="border-b border-gray-200 bg-white shadow-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">
            Drive → Photos Uploader
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {session?.user && (
            <div className="flex items-center gap-3">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full"
                />
              )}
              <span className="hidden text-sm text-gray-700 sm:block">
                {session.user.email}
              </span>
            </div>
          )}
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
