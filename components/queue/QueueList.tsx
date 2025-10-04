'use client';

import { QueueItem as QueueItemType } from '@/types/upload-queue';
import { QueueItem } from './QueueItem';

interface QueueListProps {
  items: QueueItemType[];
  onRemove: (id: string) => void;
}

export function QueueList({ items, onRemove }: QueueListProps) {
  // Group items by status
  const pending = items.filter(item => item.status === 'pending');
  const uploading = items.filter(item => item.status === 'uploading');
  const completed = items.filter(item => item.status === 'completed');
  const failed = items.filter(item => item.status === 'failed');

  const renderSection = (
    title: string,
    sectionItems: QueueItemType[],
    showCount: boolean = true
  ) => {
    if (sectionItems.length === 0) return null;

    const DISPLAY_LIMIT = 40;
    const displayItems = sectionItems.slice(0, DISPLAY_LIMIT);
    const hiddenCount = sectionItems.length - DISPLAY_LIMIT;
    const hasHiddenItems = hiddenCount > 0;

    return (
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          {title}
          {showCount && (
            <span className="ml-2 text-gray-500">({sectionItems.length})</span>
          )}
        </h3>
        <div className="space-y-2">
          {displayItems.map(item => (
            <QueueItem key={item.id} item={item} onRemove={onRemove} />
          ))}
        </div>
        {hasHiddenItems && (
          <p className="mt-3 text-sm text-gray-600 italic">
            Additional {hiddenCount} {title.toLowerCase()} items
          </p>
        )}
      </div>
    );
  };

  if (items.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">Queue is empty</p>
          <p className="mt-1 text-xs text-gray-500">
            Add files from the Browse page to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {renderSection('Uploading', uploading, false)}
      {renderSection('Pending', pending)}
      {renderSection('Completed', completed)}
      {renderSection('Failed', failed)}
    </div>
  );
}
