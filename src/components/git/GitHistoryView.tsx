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
  const [selectedCommitOids, setSelectedCommitOids] = useState<string[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);

  const getDiffAgainstWorkingTree = useGitStore((state) => state.getDiffAgainstWorkingTree);
  const getDiffBetweenCommits = useGitStore((state) => state.getDiffBetweenCommits);
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
    setSelectedCommitOids([]);
  }, [historyData.filePath]);

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

  const selectedCommits = useMemo(() => {
    if (selectedCommitOids.length === 0) {
      return [];
    }
    return selectedCommitOids
      .map((oid) => historyData.commits.find((commit) => commit.oid === oid) || null)
      .filter((commit): commit is GitCommitEntry => commit !== null);
  }, [historyData.commits, selectedCommitOids]);

  const selectedPair = useMemo(() => {
    if (selectedCommitOids.length < 2) {
      return null;
    }

    const [firstOid, secondOid] = selectedCommitOids;
    const firstCommit = historyData.commits.find((commit) => commit.oid === firstOid) || null;
    const secondCommit = historyData.commits.find((commit) => commit.oid === secondOid) || null;
    if (!firstCommit || !secondCommit) {
      return null;
    }

    const firstIndex = historyData.commits.findIndex((commit) => commit.oid === firstOid);
    const secondIndex = historyData.commits.findIndex((commit) => commit.oid === secondOid);
    if (firstIndex === -1 || secondIndex === -1 || firstIndex === secondIndex) {
      return null;
    }

    const base = firstIndex > secondIndex ? firstCommit : secondCommit;
    const target = firstIndex > secondIndex ? secondCommit : firstCommit;

    return { base, target };
  }, [historyData.commits, selectedCommitOids]);

  const handleToggleCommitSelection = useCallback((commit: GitCommitEntry) => {
    setSelectedCommitOids((previous) => {
      if (previous.includes(commit.oid)) {
        return previous.filter((oid) => oid !== commit.oid);
      }
      if (previous.length >= 2) {
        return [previous[1], commit.oid];
      }
      return [...previous, commit.oid];
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedCommitOids([]);
  }, []);

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
          baseCommit: commit,
          compareCommit: null as GitCommitEntry | null,
          comparisonLabel: '作業ツリー',
          commit,
          diff,
          historyTabId: tab.id,
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
    [
      addTab,
      getDiffAgainstWorkingTree,
      getTab,
      historyData.fileName,
      historyData.filePath,
      isBusy,
      setActiveTabId,
      tab.id,
      updateTab,
    ]
  );

  const handleCompareSelected = useCallback(async () => {
    if (!historyData.filePath || !selectedPair || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      const diff = await getDiffBetweenCommits(
        historyData.filePath,
        selectedPair.base.oid,
        selectedPair.target.oid,
      );
      const payload = {
        filePath: historyData.filePath,
        fileName: historyData.fileName,
        baseCommit: selectedPair.base,
        compareCommit: selectedPair.target,
        comparisonLabel: null as string | null,
        commit: selectedPair.target,
        diff,
        historyTabId: tab.id,
      };
      const serialized = JSON.stringify(payload);
      const tabId = `git-diff:${historyData.filePath}:${selectedPair.base.oid}:${selectedPair.target.oid}`;
      const tabName = `${historyData.fileName} Diff (${selectedPair.base.oid.slice(0, 7)}...${selectedPair.target.oid.slice(0, 7)})`;
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
      console.error('Failed to generate diff between commits:', error);
      alert(`差分の取得に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsBusy(false);
    }
  }, [
    addTab,
    getDiffBetweenCommits,
    getTab,
    historyData.fileName,
    historyData.filePath,
    isBusy,
    selectedPair,
    setActiveTabId,
    tab.id,
    updateTab,
  ]);

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
          <>
            <div className="mb-4 rounded border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-slate-800/60 dark:text-gray-300">
              <p>差分を確認したいコミットをチェックボックスから2つ選択してください。</p>
              {selectedCommits.length === 1 && (
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  選択中: {selectedCommits[0].oid.slice(0, 7)} - {selectedCommits[0].message}
                </p>
              )}
              {selectedPair && (
                <div className="mt-2 space-y-1 text-[11px] text-gray-500 dark:text-gray-300">
                  <p>
                    比較元: <span className="font-mono">{selectedPair.base.oid.slice(0, 7)}</span> - {selectedPair.base.message}
                  </p>
                  <p>
                    比較先: <span className="font-mono">{selectedPair.target.oid.slice(0, 7)}</span> - {selectedPair.target.message}
                  </p>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCompareSelected}
                  disabled={!selectedPair || isBusy}
                  className="rounded bg-blue-600 px-3 py-1 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-gray-200 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  選択したコミットの差分を表示
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  disabled={selectedCommitOids.length === 0 || isBusy}
                  className="rounded border border-gray-300 px-3 py-1 text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/60"
                >
                  選択をクリア
                </button>
              </div>
            </div>
            <ul className="space-y-3">
              {historyData.commits.map((commit) => {
                const isSelected = selectedCommitOids.includes(commit.oid);
                return (
                  <li
                    key={commit.oid}
                    className={`rounded border px-3 py-2 shadow-sm transition dark:border-gray-700 dark:bg-slate-900 ${
                      isSelected
                        ? 'border-blue-400 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/40'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleCommitSelection(commit)}
                        disabled={isBusy}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`${commit.oid} を比較対象に選択`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold leading-relaxed">{commit.message}</p>
                        <p className="break-words text-xs text-gray-500 dark:text-gray-400">{commit.author}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{commit.date}</p>
                        <button
                          type="button"
                          onContextMenu={(event) => handleCommitContextMenu(event, commit)}
                          className="mt-2 block w-full truncate rounded border border-dashed border-blue-400 bg-blue-50 px-2 py-1 text-left font-mono text-xs text-blue-700 hover:border-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200"
                          title="右クリックでアクションを表示"
                        >
                          {commit.oid}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
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
