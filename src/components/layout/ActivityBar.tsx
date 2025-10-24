'use client';

import React from 'react';
import {
  IoFolderOpenOutline,
  IoGlobeOutline,
  IoGitBranchOutline,
  IoChatbubblesOutline,
  IoGitMergeOutline,
  IoTerminalOutline,
  IoCutOutline,
} from 'react-icons/io5';

type ActivityItem = 'explorer' | 'gis' | 'git' | 'help';

interface ActivityBarProps {
  activeItem: ActivityItem | null;
  onSelect: (item: ActivityItem) => void;
  helpEnabled: boolean;
  multiFileAnalysisAvailable: boolean;
  multiFileAnalysisEnabled: boolean;
  onToggleMultiFileAnalysis: () => void;
  onOpenTerminal: () => void;
  mediaSplitterEnabled: boolean;
  onToggleMediaSplitter: () => void;
}

const ActivityBar: React.FC<ActivityBarProps> = ({
  activeItem,
  onSelect,
  helpEnabled,
  multiFileAnalysisAvailable,
  multiFileAnalysisEnabled,
  onToggleMultiFileAnalysis,
  onOpenTerminal,
  mediaSplitterEnabled,
  onToggleMediaSplitter,
}) => {
  const baseButton =
    'w-10 h-10 flex items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
  const inactiveClass = 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800';
  const activeClass = 'bg-blue-100 text-blue-600 dark:bg-blue-600/20 dark:text-blue-200';

  return (
    <nav className="flex w-12 flex-col items-center border-r border-gray-200 bg-gray-100 py-2 dark:border-gray-800 dark:bg-slate-950">
      <button
        type="button"
        className={`${baseButton} ${activeItem === 'explorer' ? activeClass : inactiveClass}`}
        onClick={() => onSelect('explorer')}
        title="エクスプローラ"
        aria-pressed={activeItem === 'explorer'}
      >
        <IoFolderOpenOutline size={20} />
      </button>
      <button
        type="button"
        className={`${baseButton} mt-2 ${inactiveClass}`}
        onClick={onOpenTerminal}
        title="ターミナル"
        aria-pressed={false}
      >
        <IoTerminalOutline size={20} />
      </button>
      <button
        type="button"
        className={`${baseButton} mt-2 ${mediaSplitterEnabled ? activeClass : inactiveClass}`}
        onClick={onToggleMediaSplitter}
        title={`音声・動画ファイル分割 ${mediaSplitterEnabled ? '表示中' : ''}`}
        aria-pressed={mediaSplitterEnabled}
      >
        <IoCutOutline size={20} />
      </button>
     {multiFileAnalysisAvailable && (
        <button
          type="button"
          className={`${baseButton} mt-2 ${multiFileAnalysisEnabled ? activeClass : inactiveClass}`}
          onClick={onToggleMultiFileAnalysis}
          title={`複数ファイル分析モード ${multiFileAnalysisEnabled ? 'ON' : 'OFF'}`}
          aria-pressed={multiFileAnalysisEnabled}
        >
          <IoGitMergeOutline size={20} />
        </button>
      )}
      <button
        type="button"
        className={`${baseButton} mt-2 ${activeItem === 'gis' ? activeClass : inactiveClass}`}
        onClick={() => onSelect('gis')}
        title="GIS分析"
        aria-pressed={activeItem === 'gis'}
      >
        <IoGlobeOutline size={20} />
      </button>
      <button
        type="button"
        className={`${baseButton} mt-2 ${activeItem === 'git' ? activeClass : inactiveClass}`}
        onClick={() => onSelect('git')}
        title="Git"
        aria-pressed={activeItem === 'git'}
      >
        <IoGitBranchOutline size={20} />
      </button>
      {helpEnabled && (
        <button
          type="button"
          className={`${baseButton} mt-2 ${activeItem === 'help' ? activeClass : inactiveClass}`}
          onClick={() => onSelect('help')}
          title="ヘルプ"
          aria-pressed={activeItem === 'help'}
        >
          <IoChatbubblesOutline size={20} />
        </button>
      )}
    </nav>
  );
};

export default ActivityBar;
