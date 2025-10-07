import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getQueueStats } from '@/lib/upload-queue-db';
import { getUploadsStats } from '@/lib/uploads-db';
import { getCacheStats } from '@/lib/cache-db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('stats-api');

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [queueStats, uploadsStats, cacheStats] = await Promise.all([
      getQueueStats(session.user.email),
      getUploadsStats(session.user.email),
      getCacheStats(session.user.email),
    ]);

    const stats = {
      ...queueStats,
      uploaded: uploadsStats.count,
      storageUsed: uploadsStats.totalSize,
      cache: cacheStats,
    };

    return NextResponse.json(stats);
  } catch (error) {
    logger.error('Error fetching stats', error, {
      userEmail: session.user.email,
    });
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
