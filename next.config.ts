import type { NextConfig } from 'next';

// Allow overriding Next.js output dir via NEXT_DIST_DIR for parallel dev/build
// Default keeps the standard `.next` so behavior is unchanged when the env var is not set.
const nextConfig: NextConfig = {
  // Use an env var so you can run dev and build in parallel without clobbering the same .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Emit browser source maps in production builds so client exceptions map to original sources
  // (useful when debugging production errors and for stack trace mapping)
  productionBrowserSourceMaps: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'docs.google.com',
        pathname: '/**',
      },
    ],
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
