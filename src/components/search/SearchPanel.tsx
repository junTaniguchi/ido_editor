
/**
 * SearchPanel.tsx
 * このファイルは、ファイル/ディレクトリ内のテキスト検索・置換・結果表示を行うReactコンポーネントです。
 * 主な機能:
 * - ディレクトリ・ファイル内のテキスト検索
 * - 検索結果の表示・展開
 * - 置換・一括置換
 * - 検索オプションの切替
 */
'use client';

import React, { useState, useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { searchInDirectory, replaceInFile } from '@/lib/fileSystemUtils';
import { SearchResult, SearchMatch } from '@/types';
import { 
  IoSearch, IoClose, IoCheckmark, IoSettingsOutline, 
  IoChevronDown, IoChevronForward, IoAlertCircleOutline, 
  IoReloadOutline
} from 'react-icons/io5';

/**
 * SearchPanelコンポーネント
 * ファイル/ディレクトリ内のテキスト検索・置換・結果表示を行う。
 * - ディレクトリ・ファイル内のテキスト検索
 * - 検索結果の表示・展開
 * - 置換・一括置換
 * - 検索オプションの切替
 */
const SearchPanel: React.FC = () => {
  const { 
    rootDirHandle,
    searchSettings, 
    updateSearchSettings,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    isSearching,
    setIsSearching,
    replaceText,
    setReplaceText,
    updatePaneState,
    updateTab,
    tabs
  } = useEditorStore();

  const [showOptions, setShowOptions] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [replacing, setReplacing] = useState(false);
  const [showReplace, setShowReplace] = useState(false);

  // 検索の実行
  const handleSearch = async () => {
    if (!searchQuery.trim() || !rootDirHandle) return;
    
    setIsSearching(true);
    setSearchResults([]);
    
    try {
      const results = await searchInDirectory(
        rootDirHandle, 
        searchQuery, 
        searchSettings,
      );
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Enterキーで検索実行
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // ファイルの展開状態を切り替え
  const toggleFileExpand = (filePath: string) => {
    const newExpandedFiles = new Set(expandedFiles);
    if (newExpandedFiles.has(filePath)) {
      newExpandedFiles.delete(filePath);
    } else {
      newExpandedFiles.add(filePath);
    }
    setExpandedFiles(newExpandedFiles);
  };

  // マッチの選択状態を切り替え
  const toggleMatchSelection = (id: string) => {
    const newSelectedMatches = new Set(selectedMatches);
    if (newSelectedMatches.has(id)) {
      newSelectedMatches.delete(id);
    } else {
      newSelectedMatches.add(id);
    }
    setSelectedMatches(newSelectedMatches);
  };

  // 全マッチの選択状態を切り替え
  const toggleAllMatches = () => {
    if (selectedMatches.size > 0) {
      setSelectedMatches(new Set());
    } else {
      const allIds = new Set<string>();
      searchResults.forEach(result => {
        result.matches.forEach((match, index) => {
          allIds.add(`${result.filePath}-${match.line}-${index}`);
        });
      });
      setSelectedMatches(allIds);
    }
  };

  // 置換処理
  const handleReplace = async (all: boolean = false) => {
    if (!searchQuery.trim() || !rootDirHandle) return;

    setReplacing(true);
    const updatedResults: SearchResult[] = [];

    try {
      for (const result of searchResults) {
        const fileHandle = result.fileHandle;
        if (!fileHandle) continue;

        // 選択されたマッチだけ置換するか、全て置換するか
        if (all || result.matches.some((match, index) => 
          selectedMatches.has(`${result.filePath}-${match.line}-${index}`)
        )) {
          // 置換実行
          const { content, replaceCount } = await replaceInFile(
            fileHandle,
            searchQuery,
            replaceText,
            searchSettings
          );

          // 現在開いているタブの内容を更新
          if (replaceCount > 0) {
            for (const [id, tab] of tabs.entries()) {
              if (tab.name === result.fileName || tab.name === result.filePath) {
                updateTab(id, { 
                  content,
                  isDirty: true
                });
                break;
              }
            }

            // 置換済みのマッチを記録
            const updatedMatches = result.matches.map((match, index) => {
              const id = `${result.filePath}-${match.line}-${index}`;
              const shouldReplace = all || selectedMatches.has(id);
              return {
                ...match,
                replaced: shouldReplace
              };
            });

            updatedResults.push({
              ...result,
              matches: updatedMatches
            });
          } else {
            updatedResults.push(result);
          }
        } else {
          updatedResults.push(result);
        }
      }
      
      // 結果を更新
      setSearchResults(updatedResults);
      setSelectedMatches(new Set());
    } catch (error) {
      console.error('Replace error:', error);
    } finally {
      setReplacing(false);
    }
  };

  // 検索結果をクリア
  const clearResults = () => {
    setSearchResults([]);
    setSelectedMatches(new Set());
  };

  // 検索パネルを閉じる
  const closePanel = () => {
    updatePaneState({ isSearchVisible: false });
  };

  // マッチの前後のコンテキストを表示
  const renderMatchContext = (match: SearchMatch) => {
    const { text, startCol, endCol, matchText } = match;
    
    // 前後のテキストを表示
    const prefix = text.substring(0, startCol);
    const suffix = text.substring(endCol);
    
    return (
      <div className="font-mono text-sm whitespace-pre-wrap break-all">
        <span className="text-gray-600 dark:text-gray-400">{prefix}</span>
        <span className="bg-yellow-200 dark:bg-yellow-900 font-bold">{matchText}</span>
        <span className="text-gray-600 dark:text-gray-400">{suffix}</span>
      </div>
    );
  };
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-l border-gray-300 dark:border-gray-700">
      {/* ヘッダー */}
      <div className="px-3 py-2 border-b border-gray-300 dark:border-gray-700 flex justify-between items-center">
        <h2 className="font-medium text-sm">検索</h2>
        <button 
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={closePanel}
          title="閉じる"
        >
          <IoClose size={18} />
        </button>
      </div>
      
      {/* 検索フォーム */}
      <div className="p-3 border-b border-gray-300 dark:border-gray-700">
        <div className="flex items-center mb-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="検索"
              className="w-full pl-8 pr-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <IoSearch className="absolute left-2.5 top-2 text-gray-500 dark:text-gray-400" size={16} />
          </div>
          <button
            className="ml-2 p-1 rounded bg-blue-500 hover:bg-blue-600 text-white"
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim() || !rootDirHandle}
          >
            {isSearching ? <IoReloadOutline className="animate-spin" size={16} /> : <IoSearch size={16} />}
          </button>
          <button
            className="ml-2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={() => setShowOptions(!showOptions)}
            title="検索オプション"
          >
            <IoSettingsOutline size={16} />
          </button>
        </div>

        {/* 検索オプション */}
        {showOptions && (
          <div className="py-2 space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={searchSettings.caseSensitive}
                  onChange={(e) => updateSearchSettings({ caseSensitive: e.target.checked })}
                  className="mr-1"
                />
                大文字と小文字を区別
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={searchSettings.wholeWord}
                  onChange={(e) => updateSearchSettings({ wholeWord: e.target.checked })}
                  className="mr-1"
                />
                単語単位
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={searchSettings.useRegex}
                  onChange={(e) => updateSearchSettings({ useRegex: e.target.checked })}
                  className="mr-1"
                />
                正規表現
              </label>
            </div>
            <div>
              <label className="block">
                <span>含める (例: *.js,*.ts)</span>
                <input
                  type="text"
                  value={searchSettings.includePattern}
                  onChange={(e) => updateSearchSettings({ includePattern: e.target.value })}
                  className="w-full mt-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                  placeholder="*.js,*.ts"
                />
              </label>
            </div>
            <div>
              <label className="block">
                <span>除外 (例: node_modules,dist)</span>
                <input
                  type="text"
                  value={searchSettings.excludePattern}
                  onChange={(e) => updateSearchSettings({ excludePattern: e.target.value })}
                  className="w-full mt-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                  placeholder="node_modules,dist"
                />
              </label>
            </div>
          </div>
        )}
        
        {/* 置換フォーム */}
        <div className="mt-2 flex items-center">
          <button 
            className="text-sm text-blue-500 hover:underline mr-2"
            onClick={() => setShowReplace(!showReplace)}
          >
            {showReplace ? '置換を隠す' : '置換を表示'}
          </button>
          
          {searchResults.length > 0 && (
            <div className="text-xs text-gray-500 ml-auto">
              {searchResults.reduce((sum, r) => sum + r.matches.length, 0)} 件の結果
            </div>
          )}
        </div>
        
        {showReplace && (
          <div className="mt-2">
            <div className="flex items-center">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="置換"
                  className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                />
              </div>
              <button
                className="ml-2 px-2 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white disabled:bg-blue-300 dark:disabled:bg-blue-800"
                onClick={() => handleReplace(false)}
                disabled={replacing || selectedMatches.size === 0 || !searchResults.length}
              >
                {replacing ? '置換中...' : '選択を置換'}
              </button>
              <button
                className="ml-2 px-2 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white disabled:bg-blue-300 dark:disabled:bg-blue-800"
                onClick={() => handleReplace(true)}
                disabled={replacing || !searchResults.length}
              >
                {replacing ? '置換中...' : 'すべて置換'}
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* 検索結果 */}
      <div className="flex-1 overflow-auto">
        {isSearching ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <IoReloadOutline className="animate-spin text-4xl mb-2" />
            <p>検索中...</p>
          </div>
        ) : searchResults.length > 0 ? (
          <div className="py-1">
            <div className="flex justify-between items-center px-3 py-1 border-b border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-700">
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={selectedMatches.size > 0 && selectedMatches.size === searchResults.reduce((sum, r) => sum + r.matches.length, 0)}
                  onChange={toggleAllMatches}
                  className="mr-2"
                />
                すべて選択
              </label>
              <button
                className="text-xs text-blue-500 hover:underline"
                onClick={clearResults}
              >
                クリア
              </button>
            </div>
            
            {searchResults.map((result) => (
              <div key={result.filePath} className="border-b border-gray-200 dark:border-gray-700">
                <div 
                  className="flex items-center px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  onClick={() => toggleFileExpand(result.filePath)}
                >
                  {expandedFiles.has(result.filePath) ? 
                    <IoChevronDown size={16} className="mr-1" /> : 
                    <IoChevronForward size={16} className="mr-1" />
                  }
                  <span className="text-sm font-medium mr-1">{result.fileName}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({result.matches.length} {result.matches.length === 1 ? '件の一致' : '件の一致'})
                  </span>
                </div>
                
                {expandedFiles.has(result.filePath) && (
                  <div className="pl-6 pb-1 text-sm">
                    {result.matches.map((match, matchIndex) => {
                      const matchId = `${result.filePath}-${match.line}-${matchIndex}`;
                      return (
                        <div 
                          key={matchId}
                          className={`px-2 py-1 border-l-2 ${selectedMatches.has(matchId) ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-700'}`}
                        >
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={selectedMatches.has(matchId)}
                              onChange={() => toggleMatchSelection(matchId)}
                              className="mr-2"
                            />
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-10">
                              行 {match.line}:
                            </span>
                            
                            {match.replaced ? (
                              <div className="flex items-center text-green-600 dark:text-green-400">
                                <IoCheckmark size={16} className="mr-1" />
                                <span className="text-sm">置換済み</span>
                              </div>
                            ) : (
                              renderMatchContext(match)
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : searchQuery && !isSearching ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <IoAlertCircleOutline className="text-4xl mb-2" />
            <p>一致する結果がありません</p>
          </div>
        ) : rootDirHandle ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 text-center">
            <IoSearch className="text-4xl mb-2" />
            <p className="mb-2">検索語句を入力してください</p>
            <p className="text-sm">フォルダ内のファイルを検索します</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 text-center">
            <IoAlertCircleOutline className="text-4xl mb-2" />
            <p className="mb-2">フォルダが開かれていません</p>
            <p className="text-sm">最初にフォルダを開いてください</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPanel;
