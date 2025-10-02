'use client';

import React from 'react';
import { TabData } from '@/types';

interface ViewModeBannerProps {
  activeTab: TabData | null;
  activeTabViewMode: 'editor' | 'preview' | 'data-preview' | 'analysis' | 'split' | 'gis-analysis';
  canToggleViewMode: boolean;
  onToggleViewMode: () => void;
}

const ViewModeBanner: React.FC<ViewModeBannerProps> = ({
  activeTab,
  activeTabViewMode,
  canToggleViewMode,
  onToggleViewMode,
}) => {
  if (!activeTab) {
    return null;
  }

  const modeLabel =
    activeTabViewMode === 'editor'
      ? 'エディタ'
      : activeTabViewMode === 'preview'
        ? 'プレビュー'
        : activeTabViewMode === 'data-preview'
          ? 'GUIデザインモード'
          : activeTabViewMode === 'analysis'
            ? '分析モード'
            : activeTabViewMode === 'gis-analysis'
              ? 'GIS分析'
              : '分割表示';

  const modeClassName =
    activeTabViewMode === 'editor'
      ? 'bg-blue-100 text-blue-800'
      : activeTabViewMode === 'preview'
        ? 'bg-green-100 text-green-800'
        : activeTabViewMode === 'data-preview'
          ? 'bg-indigo-100 text-indigo-800'
          : activeTabViewMode === 'analysis'
            ? 'bg-amber-100 text-amber-800'
            : activeTabViewMode === 'gis-analysis'
              ? 'bg-teal-100 text-teal-800'
              : 'bg-purple-100 text-purple-800';

  return (
    <div className="bg-gray-100 dark:bg-gray-900 px-2 py-1 border-b border-gray-300 dark:border-gray-700 flex justify-between items-center">
      <div className="text-xs flex items-center">
        <span className="font-medium mr-2">現在のモード:</span>
        <span className={`px-2 py-0.5 rounded ${modeClassName}`}>
          {modeLabel}
        </span>
      </div>
      {canToggleViewMode && (
        <button
          className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700"
          onClick={onToggleViewMode}
        >
          モード切替
        </button>
      )}
    </div>
  );
};

export default ViewModeBanner;
