'use client';

import React, { useMemo, useState } from 'react';
import {
  IoGitBranchOutline,
  IoGitCommitOutline,
  IoGitCompareOutline,
  IoRefresh,
  IoWarningOutline,
  IoCheckmarkCircle,
} from 'react-icons/io5';
import { useGitStore } from '@/store/gitStore';

const statusLabel = (status: string) => {
  switch (status) {
    case 'modified':
      return '変更あり';
    case 'deleted':
      return '削除';
    case 'added':
      return '追加';
    case 'untracked':
      return '未追跡';
    default:
      return status;
  }
};

const GitPanel: React.FC = () => {
  const {
    repoInitialized,
    loading,
    error,
    status,
    branches,
    currentBranch,
    commits,
    authorName,
    authorEmail,
    setAuthorName,
    setAuthorEmail,
    initializeRepository,
    refreshRepository,
    stageFile,
    unstageFile,
    discardChanges,
    commit,
    checkoutBranch,
    createBranch,
  } = useGitStore();
  const [commitMessage, setCommitMessage] = useState('');
  const [newBranchName, setNewBranchName] = useState('');

  const stagedEntries = useMemo(() => status.filter((entry) => entry.isStaged), [status]);
  const workingEntries = useMemo(
    () =>
      status.filter(
        (entry) =>
          !entry.isStaged &&
          (entry.worktreeStatus === 'modified' || entry.worktreeStatus === 'deleted' || entry.worktreeStatus === 'untracked' || entry.worktreeStatus === 'added')
      ),
    [status]
  );

  const handleCommit = async () => {
    const message = commitMessage.trim();
    await commit(message);
    if (message) {
      setCommitMessage('');
    }
  };

  const handleCreateBranch = async () => {
    await createBranch(newBranchName, true);
    setNewBranchName('');
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-300 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <IoGitCompareOutline size={18} />
          <span className="font-semibold text-sm">ソース管理</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800"
            onClick={() => refreshRepository()}
            title="状態を更新"
          >
            <IoRefresh size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <IoWarningOutline size={16} />
          <span>{error}</span>
        </div>
      )}

      {!repoInitialized ? (
        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
          <div className="space-y-3">
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              選択中のフォルダに Git リポジトリが見つかりません。既存の <code>.git</code> フォルダをコピーするか、以下のボタンからリポジトリを初期化してください。
            </p>
            <button
              className="w-full flex items-center justify-center gap-2 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={() => initializeRepository()}
              disabled={loading}
            >
              <IoGitBranchOutline size={18} />
              リポジトリを初期化
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-sm">
            <section>
              <div className="flex items-center gap-2 mb-2 font-semibold">
                <IoCheckmarkCircle size={16} className="text-green-600" />
                <span>ステージ済みの変更 ({stagedEntries.length})</span>
              </div>
              {stagedEntries.length === 0 ? (
                <p className="text-xs text-gray-500">ステージされた変更はありません。</p>
              ) : (
                <ul className="space-y-2">
                  {stagedEntries.map((entry) => (
                    <li key={entry.filepath} className="flex items-center justify-between gap-2">
                      <div>
                        <span className="block text-xs text-gray-500">{statusLabel(entry.stagedStatus)}</span>
                        <span className="text-sm break-all">{entry.filepath}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => unstageFile(entry.filepath)}
                          disabled={loading}
                        >
                          アンステージ
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2 font-semibold">
                <IoWarningOutline size={16} className="text-yellow-600" />
                <span>変更あり ({workingEntries.length})</span>
              </div>
              {workingEntries.length === 0 ? (
                <p className="text-xs text-gray-500">変更はありません。</p>
              ) : (
                <ul className="space-y-2">
                  {workingEntries.map((entry) => (
                    <li key={entry.filepath} className="flex items-center justify-between gap-2">
                      <div>
                        <span className="block text-xs text-gray-500">{statusLabel(entry.worktreeStatus)}</span>
                        <span className="text-sm break-all">{entry.filepath}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => stageFile(entry.filepath)}
                          disabled={loading}
                        >
                          ステージ
                        </button>
                        <button
                          className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-red-100 dark:hover:bg-gray-800"
                          onClick={() => discardChanges(entry.filepath)}
                          disabled={loading}
                        >
                          破棄
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-semibold">
                  <IoGitCommitOutline size={16} />
                  <span>コミット</span>
                </div>
                <span className="text-xs text-gray-500">{currentBranch ? `現在のブランチ: ${currentBranch}` : 'ブランチ未設定'}</span>
              </div>
              <textarea
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                className="w-full h-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                placeholder="コミットメッセージを入力"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="flex-1 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={handleCommit}
                  disabled={loading || stagedEntries.length === 0 || commitMessage.trim().length === 0}
                >
                  コミット
                </button>
                <button
                  className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => setCommitMessage('')}
                  disabled={loading || commitMessage.length === 0}
                >
                  クリア
                </button>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2 font-semibold">
                <IoGitBranchOutline size={16} />
                <span>ブランチ</span>
              </div>
              <div className="space-y-2">
                <select
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                  value={currentBranch ?? ''}
                  onChange={(event) => checkoutBranch(event.target.value)}
                  disabled={loading}
                >
                  <option value="">ブランチを選択</option>
                  {branches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newBranchName}
                    onChange={(event) => setNewBranchName(event.target.value)}
                    className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                    placeholder="新しいブランチ名"
                  />
                  <button
                    className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                    onClick={handleCreateBranch}
                    disabled={loading || newBranchName.trim().length === 0}
                  >
                    作成
                  </button>
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2 font-semibold">
                <IoGitCommitOutline size={16} />
                <span>コミット設定</span>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ユーザー名</label>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(event) => setAuthorName(event.target.value)}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">メールアドレス</label>
                  <input
                    type="email"
                    value={authorEmail}
                    onChange={(event) => setAuthorEmail(event.target.value)}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-900/40 max-h-64 overflow-y-auto">
            <div className="flex items-center gap-2 mb-2 font-semibold">
              <IoGitCommitOutline size={16} />
              <span>リポジトリ履歴</span>
            </div>
            {commits.length === 0 ? (
              <p className="text-xs text-gray-500">コミット履歴はありません。</p>
            ) : (
              <ul className="space-y-2">
                {commits.map((commitEntry) => (
                  <li key={commitEntry.oid} className="border border-gray-200 dark:border-gray-700 rounded px-3 py-2 bg-white dark:bg-gray-900">
                    <p className="font-semibold text-sm break-words">{commitEntry.message}</p>
                    <p className="text-xs text-gray-500 break-words">{commitEntry.author}</p>
                    <p className="text-xs text-gray-500">{commitEntry.date}</p>
                    <p className="text-[10px] text-gray-400 break-all mt-1">{commitEntry.oid}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-700">
          処理中...
        </div>
      )}
    </div>
  );
};

export default GitPanel;
