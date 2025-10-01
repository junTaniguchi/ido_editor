'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  IoGitBranchOutline,
  IoGitCommitOutline,
  IoGitCompareOutline,
  IoCloudDownloadOutline,
  IoRefresh,
  IoWarningOutline,
  IoCheckmarkCircle,
  IoSparklesOutline,
  IoChatboxEllipsesOutline,
} from 'react-icons/io5';
import { useGitStore, type GitCommitEntry } from '@/store/gitStore';
import { useEditorStore } from '@/store/editorStore';
import GitAssistSummaryResult from './GitAssistSummaryResult';
import GitAssistReviewResult from './GitAssistReviewResult';
import { requestGitAssist } from '@/lib/llm/gitAssist';
import type { GitAssistSkippedFile } from '@/types/git';

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
    pullRepository,
    getCommitDiff,
    getDiffPayload,
  } = useGitStore();
  const [commitMessage, setCommitMessage] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [commitDiffLoadingOid, setCommitDiffLoadingOid] = useState<string | null>(null);
  const [commitPurpose, setCommitPurpose] = useState('');
  const [assistLoading, setAssistLoading] = useState<'commit' | 'review' | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [commitSummaryDraft, setCommitSummaryDraft] = useState('');
  const [commitSummaryPoints, setCommitSummaryPoints] = useState<string[]>([]);
  const [commitSummaryWarnings, setCommitSummaryWarnings] = useState<string[]>([]);
  const [reviewDraft, setReviewDraft] = useState('');
  const [reviewWarnings, setReviewWarnings] = useState<string[]>([]);

  const addTab = useEditorStore((state) => state.addTab);
  const updateTab = useEditorStore((state) => state.updateTab);
  const getTab = useEditorStore((state) => state.getTab);
  const setActiveTabId = useEditorStore((state) => state.setActiveTabId);

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

  const skippedToWarnings = useCallback(
    (skipped: GitAssistSkippedFile[]) =>
      skipped.map((item) =>
        item.reason === 'sensitive'
          ? `${item.path} は機密性の高い可能性があるためAIには送信されていません。`
          : `${item.path} は読み込みエラーのためAIには送信されていません。${item.message ? ` (${item.message})` : ''}`,
      ),
    [],
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

  const handleOpenCommitDiff = useCallback(
    async (commitEntry: GitCommitEntry) => {
      if (commitDiffLoadingOid) {
        return;
      }
      setCommitDiffLoadingOid(commitEntry.oid);
      try {
        const diff = await getCommitDiff(commitEntry.oid);
        const payload = JSON.stringify(diff);
        const tabId = `git-commit-diff:${commitEntry.oid}`;
        const tabName = `コミット ${commitEntry.oid.slice(0, 7)}`;
        const existing = getTab(tabId);
        if (existing) {
          updateTab(tabId, {
            content: payload,
            originalContent: payload,
            isDirty: false,
            type: 'git-commit-diff',
            isReadOnly: true,
          });
          setActiveTabId(tabId);
        } else {
          addTab({
            id: tabId,
            name: tabName,
            content: payload,
            originalContent: payload,
            isDirty: false,
            type: 'git-commit-diff',
            isReadOnly: true,
          });
        }
      } catch (error) {
        console.error('Failed to open commit diff:', error);
        alert(`コミット差分の取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
      } finally {
        setCommitDiffLoadingOid(null);
      }
    },
    [addTab, commitDiffLoadingOid, getCommitDiff, getTab, setActiveTabId, updateTab],
  );

  const handleApplyCommitSummary = useCallback(() => {
    const trimmed = commitSummaryDraft.trim();
    if (!trimmed) {
      return;
    }
    setAssistError(null);
    setCommitMessage(trimmed);
  }, [commitSummaryDraft]);

  const handleClearCommitSummary = useCallback(() => {
    setCommitSummaryDraft('');
    setCommitSummaryPoints([]);
    setCommitSummaryWarnings([]);
    setAssistError(null);
  }, []);

  const handleClearReview = useCallback(() => {
    setReviewDraft('');
    setReviewWarnings([]);
    setAssistError(null);
  }, []);

  const handleGenerateCommitSummary = useCallback(async () => {
    if (assistLoading) {
      return;
    }
    if (stagedEntries.length === 0) {
      setAssistError('ステージされた変更がありません。');
      return;
    }
    setAssistError(null);
    setAssistLoading('commit');
    try {
      const diffPayload = await getDiffPayload({ scope: 'staged' });
      const skipWarnings = skippedToWarnings(diffPayload.skipped);
      if (diffPayload.files.length === 0) {
        setCommitSummaryWarnings(skipWarnings);
        setAssistError('送信可能な差分がありません。');
        return;
      }

      const response = await requestGitAssist({
        intent: 'commit-summary',
        branch: currentBranch ?? diffPayload.branch ?? null,
        commitPurpose: commitPurpose.trim() || undefined,
        diff: diffPayload,
      });

      setCommitSummaryDraft(response.commitMessage ?? '');
      setCommitSummaryPoints(response.summary ?? []);
      const warnings = [...skipWarnings, ...(response.warnings ?? [])];
      setCommitSummaryWarnings(warnings);

      if (!response.commitMessage) {
        setAssistError('コミットメッセージの提案を取得できませんでした。');
      }
    } catch (error) {
      setAssistError(error instanceof Error ? error.message : 'コミット要約の生成に失敗しました。');
    } finally {
      setAssistLoading(null);
    }
  }, [assistLoading, stagedEntries, getDiffPayload, skippedToWarnings, currentBranch, commitPurpose]);

  const handleGenerateReviewComments = useCallback(async () => {
    if (assistLoading) {
      return;
    }
    if (stagedEntries.length === 0 && workingEntries.length === 0) {
      setAssistError('変更がありません。');
      return;
    }
    setAssistError(null);
    setAssistLoading('review');
    try {
      const diffPayload = await getDiffPayload({ scope: 'all' });
      const skipWarnings = skippedToWarnings(diffPayload.skipped);
      if (diffPayload.files.length === 0) {
        setReviewWarnings(skipWarnings);
        setAssistError('送信可能な差分がありません。');
        return;
      }

      const response = await requestGitAssist({
        intent: 'review-comments',
        branch: currentBranch ?? diffPayload.branch ?? null,
        commitPurpose: commitPurpose.trim() || undefined,
        diff: diffPayload,
      });

      const reviewList = response.reviewComments ?? [];
      setReviewDraft(reviewList.length > 0 ? reviewList.join('\n\n') : '');
      const warnings = [...skipWarnings, ...(response.warnings ?? [])];
      setReviewWarnings(warnings);

      if (reviewList.length === 0) {
        setAssistError('レビューコメントの提案を取得できませんでした。');
      }
    } catch (error) {
      setAssistError(error instanceof Error ? error.message : 'レビューコメントの生成に失敗しました。');
    } finally {
      setAssistLoading(null);
    }
  }, [assistLoading, stagedEntries, workingEntries, getDiffPayload, skippedToWarnings, currentBranch, commitPurpose]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-gray-900 border-l border-gray-300 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <IoGitCompareOutline size={18} />
          <span className="font-semibold text-sm">ソース管理</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => pullRepository()}
            title="リモートから最新を取得"
            disabled={!repoInitialized || loading}
            aria-label="Pull Latest Changes"
          >
            <IoCloudDownloadOutline size={18} />
          </button>
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
        <div className="flex-1 flex flex-col overflow-hidden">
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
              <label className="mt-2 block text-xs text-gray-500 dark:text-gray-400">AI補助用のコミット目的（任意）</label>
              <input
                type="text"
                value={commitPurpose}
                onChange={(event) => setCommitPurpose(event.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                placeholder="例: ログイン画面のバグ修正"
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
              <div className="mt-4 space-y-3 rounded border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    <IoSparklesOutline size={16} />
                    <span>AI支援ツール</span>
                  </div>
                  {assistError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{assistError}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleGenerateCommitSummary}
                    disabled={assistLoading !== null || stagedEntries.length === 0}
                  >
                    <IoSparklesOutline size={15} />
                    コミット要約
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    onClick={handleGenerateReviewComments}
                    disabled={assistLoading !== null || (stagedEntries.length === 0 && workingEntries.length === 0)}
                  >
                    <IoChatboxEllipsesOutline size={15} />
                    レビューコメント生成
                  </button>
                </div>
                <GitAssistSummaryResult
                  value={commitSummaryDraft}
                  onChange={setCommitSummaryDraft}
                  summary={commitSummaryPoints}
                  warnings={commitSummaryWarnings}
                  onApply={handleApplyCommitSummary}
                  onClear={handleClearCommitSummary}
                  disabled={assistLoading !== null}
                  loading={assistLoading === 'commit'}
                />
                <GitAssistReviewResult
                  value={reviewDraft}
                  onChange={setReviewDraft}
                  warnings={reviewWarnings}
                  onClear={handleClearReview}
                  disabled={assistLoading !== null}
                  loading={assistLoading === 'review'}
                />
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
                {commits.map((commitEntry) => {
                  const isLoading = commitDiffLoadingOid === commitEntry.oid;
                  return (
                    <li key={commitEntry.oid}>
                      <button
                        type="button"
                        onClick={() => handleOpenCommitDiff(commitEntry)}
                        disabled={Boolean(commitDiffLoadingOid)}
                        className={`w-full rounded border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          isLoading
                            ? 'border-blue-400 bg-blue-50/80 dark:border-blue-500 dark:bg-blue-950/40'
                            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/60 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-600/70 dark:hover:bg-blue-900/30'
                        }`}
                        aria-busy={isLoading}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm break-words text-gray-800 dark:text-gray-100">
                              {commitEntry.message}
                            </p>
                            <p className="text-xs text-gray-500 break-words dark:text-gray-400">{commitEntry.author}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{commitEntry.date}</p>
                            <p className="text-[10px] text-gray-400 break-all mt-1 font-mono dark:text-gray-500">
                              {commitEntry.oid}
                            </p>
                          </div>
                          <span className="mt-1 whitespace-nowrap text-[11px] font-medium text-blue-600 dark:text-blue-300">
                            {isLoading ? '読込中…' : '差分を表示'}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
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
