
/**
 * TabBar.tsx
 * このファイルは、エディタ・プレビュー画面のタブバーを表示・管理するReactコンポーネントです。
 * 主な機能:
 * - タブの切り替え
 * - タブの閉じる操作
 * - アクティブタブの管理
 */
'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import { IoClose } from 'react-icons/io5';

/**
 * TabBarコンポーネント
 * エディタ・プレビュー画面のタブバーを表示・管理する。
 * - タブの切り替え
 * - タブの閉じる操作
 * - アクティブタブの管理
 */
const TabBar = () => {
  const { tabs, activeTabId, setActiveTabId, removeTab } = useEditorStore();
  
  // タブ切り替え
  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
  };
  
  // タブ閉じる
  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    removeTab(tabId);
  };
  
  const tabsArray = Array.from(tabs.entries());
  
  // タブが1つもない場合
  if (tabsArray.length === 0) {
    return (
      <div className="flex h-10 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 px-2">
        <div className="flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm w-full">
          ファイルが開かれていません
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-10 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 overflow-x-auto">
      {tabsArray.map(([tabId, tab]) => (
        <div
          key={tabId}
          className={`
            flex items-center min-w-[120px] max-w-[200px] px-3 py-1 border-r border-gray-300 dark:border-gray-700
            ${activeTabId === tabId 
              ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400' 
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}
            cursor-pointer transition-colors
          `}
          onClick={() => handleTabClick(tabId)}
        >
          <div className="flex-1 truncate text-sm">
            {tab.name}
            {tab.isDirty && <span className="ml-1 text-red-500">*</span>}
          </div>
          
          <button
            className="ml-2 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={(e) => handleCloseTab(e, tabId)}
            aria-label="Close tab"
          >
            <IoClose size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default TabBar;
