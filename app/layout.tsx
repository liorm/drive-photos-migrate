import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import Providers from '@/components/Providers';

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
          <div className="flex h-screen flex-col bg-gray-50">
            <Navbar />
            <div className="flex flex-1 overflow-hidden pt-16">
              <Sidebar />
              <main className="ml-64 flex-1 overflow-y-auto bg-gray-50">
                <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
