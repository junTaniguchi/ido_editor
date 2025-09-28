'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TabData } from '@/types';
import { useGitStore, type GitCommitEntry } from '@/store/gitStore';
import { useEditorStore } from '@/store/editorStore';
import { readDirectoryContents } from '@/lib/fileSystemUtils';

interface FileHistoryPayload {
  filePath: string;
  fileName: string;
  commits: GitCommitEntry[];
}

interface GitHistoryViewProps {
  tab: TabData;
}

const GitHistoryView: React.FC<GitHistoryViewProps> = ({ tab }) => {
  const historyData = useMemo<FileHistoryPayload>(() => {
    try {
      const parsed = JSON.parse(tab.content) as Partial<FileHistoryPayload>;
      return {
        filePath: parsed.filePath ?? '',
        fileName: parsed.fileName ?? tab.name,
        commits: parsed.commits ?? [],
      };
    } catch {
      return { filePath: '', fileName: tab.name, commits: [] };
    }
  }, [tab.content, tab.name]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    commit: GitCommitEntry;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const getDiffAgainstWorkingTree = useGitStore((state) => state.getDiffAgainstWorkingTree);
  const restoreFileToCommit = useGitStore((state) => state.restoreFileToCommit);

  const addTab = useEditorStore((state) => state.addTab);
  const updateTab = useEditorStore((state) => state.updateTab);
  const setActiveTabId = useEditorStore((state) => state.setActiveTabId);
  const getTab = useEditorStore((state) => state.getTab);
  const rootDirHandle = useEditorStore((state) => state.rootDirHandle);
  const setRootFileTree = useEditorStore((state) => state.setRootFileTree);

  const handleCommitContextMenu = useCallback((event: React.MouseEvent, commit: GitCommitEntry) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, commit });
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const handleGlobalMouseDown = () => {
      setContextMenu(null);
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('mousedown', handleGlobalMouseDown);
    window.addEventListener('keydown', handleKeydown);

    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !menuRef.current) {
      return;
    }
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    let nextX = contextMenu.x;
    let nextY = contextMenu.y;
    if (nextX + rect.width > window.innerWidth) {
      nextX = window.innerWidth - rect.width - 8;
    }
    if (nextY + rect.height > window.innerHeight) {
      nextY = window.innerHeight - rect.height - 8;
    }
    menu.style.left = `${Math.max(0, nextX)}px`;
    menu.style.top = `${Math.max(0, nextY)}px`;
  }, [contextMenu]);

  const handleShowDiff = useCallback(
    async (commit: GitCommitEntry) => {
      if (!historyData.filePath || isBusy) {
        setContextMenu(null);
        return;
      }
      setIsBusy(true);
      try {
        const diff = await getDiffAgainstWorkingTree(historyData.filePath, commit.oid);
        const payload = {
          filePath: historyData.filePath,
          fileName: historyData.fileName,
          commit,
          diff,
        };
        const serialized = JSON.stringify(payload);
        const tabId = `git-diff:${historyData.filePath}:${commit.oid}`;
        const tabName = `${historyData.fileName} Diff (${commit.oid.slice(0, 7)})`;
        const existing = getTab(tabId);
        if (existing) {
          updateTab(tabId, {
            content: serialized,
            originalContent: serialized,
            isDirty: false,
            type: 'git-diff',
            isReadOnly: true,
          });
          setActiveTabId(tabId);
        } else {
          addTab({
            id: tabId,
            name: tabName,
            content: serialized,
            originalContent: serialized,
            isDirty: false,
            type: 'git-diff',
            isReadOnly: true,
          });
        }
      } catch (error) {
        console.error('Failed to generate diff view:', error);
        alert(`差分の取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsBusy(false);
        setContextMenu(null);
      }
    },
    [addTab, getDiffAgainstWorkingTree, getTab, historyData.fileName, historyData.filePath, isBusy, setActiveTabId, updateTab]
  );

  const handleRestore = useCallback(
    async (commit: GitCommitEntry) => {
      if (!historyData.filePath || isBusy) {
        setContextMenu(null);
        return;
      }
      setIsBusy(true);
      try {
        const restoredContent = await restoreFileToCommit(historyData.filePath, commit.oid);
        const existingFileTab = getTab(historyData.filePath);
        if (existingFileTab) {
          updateTab(historyData.filePath, {
            content: restoredContent ?? '',
            originalContent: restoredContent ?? '',
            isDirty: false,
          });
        }
        if (rootDirHandle) {
          try {
            const tree = await readDirectoryContents(rootDirHandle);
            setRootFileTree(tree);
          } catch (treeError) {
            console.warn('Failed to refresh file tree after rollback:', treeError);
          }
        }
        alert('ファイルを選択したコミットの内容にロールバックしました。');
      } catch (error) {
        console.error('Failed to restore file content:', error);
        alert(`ロールバックに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsBusy(false);
        setContextMenu(null);
      }
    },
    [getTab, historyData.filePath, restoreFileToCommit, isBusy, rootDirHandle, setRootFileTree, updateTab]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold">{historyData.fileName}</h2>
        <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{historyData.filePath || 'ファイルパス未指定'}</p>
      </div>
      <div className="flex-1 overflow-auto px-4 py-3 text-sm">
        {historyData.commits.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">コミット履歴が存在しません。</p>
        ) : (
          <ul className="space-y-3">
            {historyData.commits.map((commit) => (
              <li
                key={commit.oid}
                className="rounded border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-slate-900"
              >
                <p className="font-semibold leading-relaxed break-words">{commit.message}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 break-words">{commit.author}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{commit.date}</p>
                <button
                  type="button"
                  onContextMenu={(event) => handleCommitContextMenu(event, commit)}
                  className="mt-2 block w-full truncate rounded border border-dashed border-blue-400 bg-blue-50 px-2 py-1 text-left font-mono text-xs text-blue-700 hover:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200"
                  title="右クリックでアクションを表示"
                >
                  {commit.oid}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-48 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-slate-900"
          onMouseDown={(event) => event.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => handleShowDiff(contextMenu.commit)}
            disabled={isBusy}
          >
            現在の内容との差分を表示
          </button>
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => handleRestore(contextMenu.commit)}
            disabled={isBusy}
          >
            このバージョンにロールバック
          </button>
        </div>
      )}
    </div>
  );
};

export default GitHistoryView;
