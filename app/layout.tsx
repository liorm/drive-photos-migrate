import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import Providers from '@/components/Providers';
import { OperationNotifications } from '@/components/ui/OperationNotifications';
import { OperationNotificationsProvider } from '@/components/OperationNotificationsContext';

export const metadata: Metadata = {
  title: 'Google Drive to Photos Uploader',
  description: 'Upload files from Google Drive to Google Photos seamlessly',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <Providers>
          <OperationNotificationsProvider>
            <div className="flex h-screen bg-gray-50">
              <Sidebar />
              <main className="ml-64 flex-1 overflow-y-auto bg-gray-50">
                <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
                  {children}
                </div>
              </main>
            </div>
            <OperationNotifications />
          </OperationNotificationsProvider>
        </Providers>
      </body>
    </html>
  );
}
