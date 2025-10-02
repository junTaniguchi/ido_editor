'use client';

import React from 'react';
import { TabData } from '@/types';
import { type EditorViewMode } from '@/store/editorStore';

const MODE_LABELS: Record<EditorViewMode, string> = {
  editor: 'エディタ',
  preview: 'プレビュー',
  'data-preview': 'GUIデザインモード',
  analysis: '分析モード',
  split: '分割表示',
  'gis-analysis': 'GIS分析',
};

const MODE_CLASS_NAMES: Record<EditorViewMode, string> = {
  editor: 'bg-blue-100 text-blue-800',
  preview: 'bg-green-100 text-green-800',
  'data-preview': 'bg-indigo-100 text-indigo-800',
  analysis: 'bg-amber-100 text-amber-800',
  split: 'bg-purple-100 text-purple-800',
  'gis-analysis': 'bg-teal-100 text-teal-800',
};

interface ViewModeBannerProps {
  activeTab: TabData | null;
  activeTabViewMode: EditorViewMode;
  canToggleViewMode: boolean;
  availableViewModes: EditorViewMode[];
  onSelectViewMode: (mode: EditorViewMode) => void;
}

const ViewModeBanner: React.FC<ViewModeBannerProps> = ({
  activeTab,
  activeTabViewMode,
  canToggleViewMode,
  availableViewModes,
  onSelectViewMode,
}) => {
  if (!activeTab) {
    return null;
  }

  const modeLabel = MODE_LABELS[activeTabViewMode];
  const modeClassName = MODE_CLASS_NAMES[activeTabViewMode];
  const showModeSelector = canToggleViewMode && availableViewModes.length > 1;

  return (
    <div className="bg-gray-100 dark:bg-gray-900 px-2 py-1 border-b border-gray-300 dark:border-gray-700 flex justify-between items-center">
      <div className="text-xs flex items-center">
        <span className="font-medium mr-2">現在のモード:</span>
        <span className={`px-2 py-0.5 rounded ${modeClassName}`}>
          {modeLabel}
        </span>
      </div>
      {showModeSelector && (
        <div className="flex items-center text-xs">
          <span className="mr-2">モード切替:</span>
          <select
            className="px-2 py-1 border border-gray-300 rounded bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
            value={activeTabViewMode}
            onChange={(event) => onSelectViewMode(event.target.value as EditorViewMode)}
          >
            {availableViewModes.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default ViewModeBanner;
