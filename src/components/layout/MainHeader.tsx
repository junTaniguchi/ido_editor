'use client';

import React from 'react';
import {
  IoMenu,
  IoSunny,
  IoMoon,
  IoSearch,
  IoAddOutline,
  IoGitMergeOutline,
  IoGitBranchOutline,
  IoDownloadOutline,
  IoKeyOutline,
  IoHelpCircleOutline,
  IoGlobeOutline,
} from 'react-icons/io5';

interface MainHeaderProps {
  onToggleExplorer: () => void;
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  fontSize: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNewFile: () => void;
  onToggleSearch: () => void;
  multiFileAnalysisEnabled: boolean;
  onToggleMultiFileAnalysis: () => void;
  selectedFileCount: number;
  onToggleGit: () => void;
  isGitPaneVisible: boolean;
  onCloneRepository: () => void;
  onToggleHelp: () => void;
  isHelpPaneVisible: boolean;
  onOpenLlmSettings: () => void;
  isGisData: boolean;
  isGisModeActive: boolean;
  onToggleGisMode: () => void;
}

const MainHeader: React.FC<MainHeaderProps> = ({
  onToggleExplorer,
  onDecreaseFont,
  onIncreaseFont,
  fontSize,
  theme,
  onToggleTheme,
  onNewFile,
  onToggleSearch,
  multiFileAnalysisEnabled,
  onToggleMultiFileAnalysis,
  selectedFileCount,
  onToggleGit,
  isGitPaneVisible,
  onCloneRepository,
  onToggleHelp,
  isHelpPaneVisible,
  onOpenLlmSettings,
  isGisData,
  isGisModeActive,
  onToggleGisMode,
}) => {
  const isDark = theme === 'dark';

  const canToggleGisMode = isGisData || isGisModeActive;
  const gisButtonLabel = isGisModeActive
    ? 'GIS分析モードを終了'
    : isGisData
      ? 'GIS分析モードを表示'
      : 'GIS対応ファイルを開くと利用できます';

  return (
    <header className="flex items-center px-4 h-12 bg-white border-b border-gray-300 dark:bg-gray-900 dark:border-gray-700">
      <button
        className="p-1 mr-2 rounded hover:bg-gray-200 dark:hover:bg-gray-800"
        onClick={onToggleExplorer}
        aria-label="Toggle Explorer"
      >
        <IoMenu size={24} />
      </button>
      <h1 className="text-xl font-semibold flex-1">DataLoom Studio</h1>
      <div className="ml-2 flex items-center">
        <label htmlFor="font-size-controls" className="text-xs mr-1">フォントサイズ</label>
        <button
          id="font-size-controls"
          className="px-2 py-0.5 rounded border border-gray-300 bg-white text-xs mr-1 dark:bg-gray-900 dark:border-gray-600"
          onClick={onDecreaseFont}
          title="フォントサイズを小さく"
        >
          −
        </button>
        <span className="text-xs w-10 text-center select-none">{fontSize}px</span>
        <button
          className="px-2 py-0.5 rounded border border-gray-300 bg-white text-xs ml-1 dark:bg-gray-900 dark:border-gray-600"
          onClick={onIncreaseFont}
          title="フォントサイズを大きく"
        >
          ＋
        </button>
      </div>
      <button
        className="p-1 rounded hover:bg-gray-200 ml-2 dark:hover:bg-gray-800"
        onClick={onToggleTheme}
        aria-label="Toggle Theme"
        title={isDark ? 'ライトモードに切替' : 'ダークモードに切替'}
      >
        {isDark ? <IoSunny size={20} /> : <IoMoon size={20} />}
      </button>
      <button
        className="p-1 rounded hover:bg-gray-200 ml-2 dark:hover:bg-gray-800"
        onClick={onNewFile}
        aria-label="Create New File"
      >
        <IoAddOutline size={20} />
      </button>
      <button
        className="p-1 rounded hover:bg-gray-200 ml-2 dark:hover:bg-gray-800"
        onClick={onCloneRepository}
        aria-label="Clone Repository"
        title="Gitリポジトリをクローン"
      >
        <IoDownloadOutline size={20} />
      </button>
      <button
        className="p-1 rounded hover:bg-gray-200 ml-2 dark:hover:bg-gray-800"
        onClick={onToggleSearch}
        aria-label="Toggle Search"
      >
        <IoSearch size={20} />
      </button>
      <button
        className="p-1 rounded hover:bg-gray-200 ml-2 dark:hover:bg-gray-800"
        onClick={onOpenLlmSettings}
        aria-label="OpenAI APIキー設定"
        title="OpenAI APIキー設定"
      >
        <IoKeyOutline size={20} />
      </button>
      {isGisData && (
        <button
          className={`p-1 rounded ml-2 ${
            isGisModeActive ? 'bg-teal-100 text-teal-700' : 'hover:bg-gray-200 dark:hover:bg-gray-800'
          }`}
          onClick={onToggleGisMode}
          aria-label="Toggle GIS Analysis Mode"
          title={`GIS分析モードを${isGisModeActive ? '終了' : '表示'}`}
        >
          <IoGlobeOutline size={20} />
        </button>
      )}
      <button
        className={`p-1 rounded ml-2 ${
          isGisModeActive
            ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200'
            : 'hover:bg-gray-200 dark:hover:bg-gray-800'
        } ${canToggleGisMode ? '' : 'opacity-40 cursor-not-allowed'}`}
        onClick={() => {
          if (!canToggleGisMode) {
            return;
          }
          onToggleGisMode();
        }}
        aria-label="Toggle GIS Analysis Mode"
        title={gisButtonLabel}
        type="button"
      >
        <IoGlobeOutline size={20} />
      </button>
      <button
        className={`p-1 rounded ml-2 ${
          isGisModeActive
            ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200'
            : 'hover:bg-gray-200 dark:hover:bg-gray-800'
        } ${canToggleGisMode ? '' : 'opacity-40 cursor-not-allowed'}`}
        onClick={() => {
          if (!canToggleGisMode) {
            return;
          }
          onToggleGisMode();
        }}
        aria-label="Toggle GIS Analysis Mode"
        title={gisButtonLabel}
        type="button"
      >
        <IoGlobeOutline size={20} />
      </button>
      <button
        className={`p-1 rounded ml-2 ${
          isHelpPaneVisible ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 dark:hover:bg-gray-800'
        }`}
        onClick={onToggleHelp}
        aria-label="Toggle Help"
        title={`ヘルプパネル ${isHelpPaneVisible ? '表示中' : '非表示'}`}
      >
        <IoHelpCircleOutline size={20} />
      </button>
      <button
        className={`p-1 rounded ml-2 ${
          isGitPaneVisible ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 dark:hover:bg-gray-800'
        }`}
        onClick={onToggleGit}
        aria-label="Toggle Git Panel"
        title={`Gitパネル ${isGitPaneVisible ? '表示中' : '非表示'}`}
      >
        <IoGitBranchOutline size={20} />
      </button>
      <button
        className={`p-1 rounded ml-2 relative ${
          multiFileAnalysisEnabled ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 dark:hover:bg-gray-800'
        }`}
        onClick={onToggleMultiFileAnalysis}
        aria-label="Toggle Multi-File Analysis"
        title={`複数ファイル分析モード ${multiFileAnalysisEnabled ? 'ON' : 'OFF'}`}
      >
        <IoGitMergeOutline size={20} />
        {selectedFileCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
            {selectedFileCount}
          </span>
        )}
      </button>
    </header>
  );
};

export default MainHeader;
