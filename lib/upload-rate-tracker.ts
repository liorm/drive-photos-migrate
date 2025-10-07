import { createLogger } from './logger';

const logger = createLogger('upload-rate-tracker');

const BUCKET_DURATION_MS = 5000; // 5 seconds
const MAX_BUCKETS = 12; // Keep 1 minute of history (12 * 5s)

interface TimeBucket {
  timestamp: number;
  count: number;
  size: number;
}

export class UploadRateTracker {
  private buckets: TimeBucket[] = [];
  private totalUploadedCount = 0;
  private totalUploadedSize = 0;

  constructor() {
    logger.info('UploadRateTracker created');
  }

  addUpload(size: number) {
    const now = Date.now();
    this.cleanupOldBuckets(now);

    let currentBucket = this.buckets.find(
      b => now - b.timestamp < BUCKET_DURATION_MS
    );

    if (!currentBucket) {
      currentBucket = { timestamp: now, count: 0, size: 0 };
      this.buckets.push(currentBucket);
    }

    currentBucket.count += 1;
    currentBucket.size += size;
    this.totalUploadedCount += 1;
    this.totalUploadedSize += size;
  }

  getStats() {
    const now = Date.now();
    this.cleanupOldBuckets(now);

    const totalCount = this.buckets.reduce((sum, b) => sum + b.count, 0);
    const totalSize = this.buckets.reduce((sum, b) => sum + b.size, 0);
    const duration =
      this.buckets.length > 0 ? (now - this.buckets[0].timestamp) / 1000 : 0;

    const itemsPerSecond = duration > 0 ? totalCount / duration : 0;
    const bytesPerSecond = duration > 0 ? totalSize / duration : 0;

    return {
      itemsPerSecond,
      bytesPerSecond,
      totalUploadedCount: this.totalUploadedCount,
      totalUploadedSize: this.totalUploadedSize,
      isTracking: this.buckets.length > 0,
    };
  }

  private cleanupOldBuckets(now: number) {
    const cutoff = now - MAX_BUCKETS * BUCKET_DURATION_MS;
    this.buckets = this.buckets.filter(b => b.timestamp >= cutoff);
  }

  reset() {
    this.buckets = [];
    this.totalUploadedCount = 0;
    this.totalUploadedSize = 0;
    logger.info('UploadRateTracker reset');
  }
}
