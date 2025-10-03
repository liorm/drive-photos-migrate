'use client';

import { useState } from 'react';

interface FolderNode {
  id: string;
  name: string;
  children?: FolderNode[];
}

// Mock data - replace with actual Google Drive API data later
const mockFolders: FolderNode[] = [
  {
    id: '1',
    name: 'My Drive',
    children: [
      {
        id: '2',
        name: 'Photos',
        children: [
          { id: '3', name: '2024' },
          { id: '4', name: '2023' },
        ],
      },
      {
        id: '5',
        name: 'Documents',
        children: [
          { id: '6', name: 'Work' },
          { id: '7', name: 'Personal' },
        ],
      },
      { id: '8', name: 'Videos' },
    ],
  },
];

function FolderTree({
  folders,
  level = 0,
}: {
  folders: FolderNode[];
  level?: number;
}) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['1'])
  );

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div>
      {folders.map(folder => {
        const isExpanded = expandedFolders.has(folder.id);
        const hasChildren = folder.children && folder.children.length > 0;

        return (
          <div key={folder.id}>
            <div
              className={`group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-blue-50 ${
                level === 0 ? 'font-medium' : ''
              }`}
              style={{ paddingLeft: `${level * 16 + 12}px` }}
              onClick={() => hasChildren && toggleFolder(folder.id)}
            >
              {hasChildren ? (
                <svg
                  className={`h-4 w-4 flex-shrink-0 text-gray-500 transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              ) : (
                <div className="w-4" />
              )}
              <svg
                className="h-5 w-5 flex-shrink-0 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={
                    isExpanded && hasChildren
                      ? 'M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z'
                      : 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'
                  }
                />
              </svg>
              <span className="truncate text-gray-700 group-hover:text-gray-900">
                {folder.name}
              </span>
            </div>
            {isExpanded && hasChildren && (
              <FolderTree folders={folder.children!} level={level + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`fixed top-16 left-0 z-40 h-[calc(100vh-4rem)] border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${
        isCollapsed ? 'w-0' : 'w-64'
      } overflow-hidden`}
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">Google Drive</h2>
          <p className="mt-0.5 text-xs text-gray-500">Browse your folders</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <FolderTree folders={mockFolders} />
        </div>
      </div>
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-6 -right-3 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-md transition-all hover:bg-gray-50 hover:shadow-lg"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          className={`h-3 w-3 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
    </aside>
  );
}
