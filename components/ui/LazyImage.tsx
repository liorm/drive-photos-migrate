'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

// Global queue to control concurrent image loading
class ImageLoadQueue {
  private queue: Array<() => void> = [];
  private activeLoads = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 6) {
    this.maxConcurrent = maxConcurrent;
  }

  async enqueue(loadFn: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.activeLoads++;
        try {
          await loadFn();
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          this.activeLoads--;
          this.processQueue();
        }
      };

      if (this.activeLoads < this.maxConcurrent) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private processQueue() {
    if (this.queue.length > 0 && this.activeLoads < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

// Global singleton instance
const imageLoadQueue = new ImageLoadQueue(10);

interface LazyImageProps {
  src?: string;
  fileId?: string; // If provided, uses proxy API for authenticated thumbnail fetch
  alt: string;
  width: number;
  height: number;
  className?: string;
  placeholder?: React.ReactNode;
  unoptimized?: boolean;
}

export function LazyImage({
  src,
  fileId,
  alt,
  width,
  height,
  className,
  placeholder,
  unoptimized = true,
}: LazyImageProps) {
  // Determine the image source
  const imageSrc = fileId ? `/api/drive/thumbnail?fileId=${fileId}` : src;

  if (!imageSrc) {
    throw new Error('Either src or fileId must be provided to LazyImage');
  }
  const [isVisible, setIsVisible] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer to detect when image enters viewport
  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      {
        rootMargin: '50px', // Start loading slightly before visible
        threshold: 0.01,
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Queue image loading when visible
  useEffect(() => {
    if (!isVisible || shouldLoad) return;

    // Enqueue the load
    imageLoadQueue
      .enqueue(async () => {
        // Small delay to ensure smooth loading
        await new Promise(resolve => setTimeout(resolve, 50));
        setShouldLoad(true);
      })
      .catch(error => {
        console.error('Error loading image:', error);
        setHasError(true);
      });
  }, [isVisible, shouldLoad]);

  return (
    <div ref={imgRef} className={className} style={{ width, height }}>
      {shouldLoad && !hasError ? (
        <Image
          src={imageSrc}
          alt={alt}
          width={width}
          height={height}
          className={className}
          style={{ width: 'auto', height: 'auto' }}
          unoptimized={unoptimized}
          onError={() => setHasError(true)}
        />
      ) : hasError ? (
        <div className="flex h-full w-full items-center justify-center bg-gray-200 text-gray-400">
          <span className="text-xs">Failed to load</span>
        </div>
      ) : (
        placeholder || (
          <div className="flex h-full w-full animate-pulse items-center justify-center bg-gray-200">
            <div className="h-8 w-8 rounded-full bg-gray-300" />
          </div>
        )
      )}
    </div>
  );
}
