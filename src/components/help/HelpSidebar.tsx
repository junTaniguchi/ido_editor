'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IoAddOutline, IoTrashOutline } from 'react-icons/io5';
import { useEditorStore } from '@/store/editorStore';
import { sanitizeHelpRequest } from '@/lib/llm/helpSanitizer';
import { requestHelp } from '@/lib/llm/helpClient';
import { createId } from '@/lib/utils/id';
import type { HelpMessage, HelpThread, HelpUserRole } from '@/types';

const ROLE_LABELS: Record<HelpUserRole, string> = {
  viewer: '閲覧者',
  editor: '編集者',
  admin: '管理者',
};

const threadTitle = (thread: HelpThread | undefined) => thread?.title || '無題のスレッド';

const HelpSidebar: React.FC = () => {
  // Use individual selectors to avoid returning a new object each render which
  // can cause an infinite update loop with Zustand's getSnapshot.
  const helpThreads = useEditorStore((state) => state.helpThreads);
  const helpThreadOrder = useEditorStore((state) => state.helpThreadOrder);
  const activeHelpThreadId = useEditorStore((state) => state.activeHelpThreadId);
  const setActiveHelpThread = useEditorStore((state) => state.setActiveHelpThread);
  const createHelpThread = useEditorStore((state) => state.createHelpThread);
  const addHelpMessage = useEditorStore((state) => state.addHelpMessage);
  const removeHelpThread = useEditorStore((state) => state.removeHelpThread);
  const updateHelpThread = useEditorStore((state) => state.updateHelpThread);
  const helpSettings = useEditorStore((state) => state.helpSettings);
  const updateHelpSettings = useEditorStore((state) => state.updateHelpSettings);

  const activeTabId = useEditorStore((state) => state.activeTabId);
  const tabs = useEditorStore((state) => state.tabs);
  const activeTab = useMemo(() => (activeTabId ? tabs.get(activeTabId) : undefined), [activeTabId, tabs]);

  const activeThread = activeHelpThreadId ? helpThreads[activeHelpThreadId] : undefined;

  const [message, setMessage] = useState('');
  const [includeActiveTab, setIncludeActiveTab] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [lastMaskedSummary, setLastMaskedSummary] = useState<{ files: string[]; patterns: string[] } | null>(null);

  useEffect(() => {
    if (!activeHelpThreadId) {
      if (helpThreadOrder.length > 0) {
        setActiveHelpThread(helpThreadOrder[0]);
      } else {
        const thread = createHelpThread();
        setActiveHelpThread(thread.id);
      }
    }
  }, [activeHelpThreadId, helpThreadOrder, setActiveHelpThread, createHelpThread]);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setActiveHelpThread(threadId);
      setStatus(null);
      setLastMaskedSummary(null);
    },
    [setActiveHelpThread],
  );

  const handleNewThread = useCallback(() => {
    const thread = createHelpThread({ title: '新しい問い合わせ' });
    setActiveHelpThread(thread.id);
    setStatus(null);
    setMessage('');
  }, [createHelpThread, setActiveHelpThread]);

  const handleRemoveThread = useCallback(
    (threadId: string) => {
      if (helpThreadOrder.length <= 1) {
        // 最後のスレッドは削除せず初期化
        updateHelpThread(threadId, { messages: [], title: '新しい問い合わせ', updatedAt: new Date().toISOString() });
        setStatus(null);
        return;
      }
      removeHelpThread(threadId);
    },
    [helpThreadOrder.length, removeHelpThread, updateHelpThread],
  );

  const handleUpdateDocumentInfo = useCallback(
    (field: 'documentId' | 'knowledgeBaseUrl', value: string) => {
      if (!activeThread) return;
      if (field === 'documentId') {
        updateHelpThread(activeThread.id, { documentId: value });
      } else {
        updateHelpThread(activeThread.id, { knowledgeBaseUrl: value });
      }
    },
    [activeThread, updateHelpThread],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!activeThread) {
        setStatus('スレッドの準備が完了していません。');
        return;
      }

      const trimmed = message.trim();
      if (!trimmed) {
        setStatus('問い合わせ内容を入力してください。');
        return;
      }

      const documentId = (activeThread.documentId || helpSettings.defaultDocumentId || '').trim();
      const knowledgeBaseUrl = (activeThread.knowledgeBaseUrl || helpSettings.defaultKnowledgeBaseUrl || '').trim();

      if (!documentId || !knowledgeBaseUrl) {
        setStatus('ドキュメントIDとナレッジベースURLを設定してください。');
        return;
      }

      const attachments = includeActiveTab && activeTab
        ? [{ path: activeTab.name, content: typeof activeTab.content === 'string' ? activeTab.content : JSON.stringify(activeTab.content) }]
        : [];

      const sanitized = sanitizeHelpRequest(
        { query: trimmed, files: attachments },
        {
          maskFileContent: helpSettings.maskFileContent,
          userRole: helpSettings.currentRole,
          allowedRoles: helpSettings.allowedRoles,
        },
      );

      if (sanitized.blocked) {
        setStatus(sanitized.blockReason || '現在の権限では送信できません。');
        setLastMaskedSummary({ files: [], patterns: sanitized.maskedPatterns });
        return;
      }

      const maskedFileLabels = sanitized.maskedFiles.map((item) => `${item.path} (${item.reason})`);
      setLastMaskedSummary({ files: maskedFileLabels, patterns: sanitized.maskedPatterns });
      setStatus(null);
      setIsSending(true);

      const now = new Date().toISOString();
      const userMessage: HelpMessage = {
        id: createId('help_user'),
        role: 'user',
        content: sanitized.sanitizedQuery,
        createdAt: now,
        metadata: {
          maskedFiles: sanitized.maskedFiles,
          maskedPatterns: sanitized.maskedPatterns,
        },
      };

      const historyPayload = (activeThread.messages || []).map((item) => ({ role: item.role, content: item.content }));
      historyPayload.push({ role: 'user', content: sanitized.sanitizedQuery });

      addHelpMessage(activeThread.id, userMessage);
      setMessage('');

      try {
        const response = await requestHelp({
          query: sanitized.sanitizedQuery,
          documentId,
          knowledgeBaseUrl,
          context: sanitized.context,
          history: historyPayload,
          maskedFiles: sanitized.maskedFiles,
        });

        const assistantMessage: HelpMessage = {
          id: createId('help_ai'),
          role: 'assistant',
          content: response.answer,
          createdAt: new Date().toISOString(),
        };
        addHelpMessage(activeThread.id, assistantMessage);
        setStatus(null);
      } catch (error) {
        console.error('Failed to request help:', error);
        setStatus(error instanceof Error ? error.message : 'ヘルプの取得に失敗しました。');
      } finally {
        setIsSending(false);
      }
    },
    [
      activeThread,
      message,
      includeActiveTab,
      activeTab,
      helpSettings.maskFileContent,
      helpSettings.currentRole,
      helpSettings.allowedRoles,
      helpSettings.defaultDocumentId,
      helpSettings.defaultKnowledgeBaseUrl,
      addHelpMessage,
    ],
  );

  const handleRoleChange = useCallback(
    (role: HelpUserRole) => {
      updateHelpSettings({ currentRole: role });
    },
    [updateHelpSettings],
  );

  const handleToggleRolePermission = useCallback(
    (role: HelpUserRole) => {
      const current = helpSettings.allowedRoles[role];
      updateHelpSettings({
        allowedRoles: {
          ...helpSettings.allowedRoles,
          [role]: !current,
        },
      });
    },
    [helpSettings.allowedRoles, updateHelpSettings],
  );

  const handleDefaultDocChange = useCallback(
    (field: 'defaultDocumentId' | 'defaultKnowledgeBaseUrl', value: string) => {
      updateHelpSettings({ [field]: value });
    },
    [updateHelpSettings],
  );

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-slate-900">
      <div className="border-b border-gray-200 p-3 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">AIヘルプ</h2>
          <button
            type="button"
            className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
            onClick={handleNewThread}
          >
            <IoAddOutline size={16} /> 新規
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {helpThreadOrder.map((threadId) => {
            const thread = helpThreads[threadId];
            const isActive = activeHelpThreadId === threadId;
            return (
              <div key={threadId} className={`flex items-center rounded border px-2 py-1 text-xs ${isActive ? 'border-blue-500 bg-blue-100 dark:border-blue-400 dark:bg-blue-900/40' : 'border-gray-300 bg-white dark:border-slate-700 dark:bg-slate-800'}`}>
                <button
                  type="button"
                  className={`max-w-[140px] truncate text-left ${isActive ? 'text-blue-700 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200'}`}
                  onClick={() => handleSelectThread(threadId)}
                >
                  {threadTitle(thread)}
                </button>
                <button
                  type="button"
                  className="ml-1 text-gray-400 hover:text-red-500"
                  onClick={() => handleRemoveThread(threadId)}
                  title="スレッドを削除"
                >
                  <IoTrashOutline size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-b border-gray-200 p-3 text-xs dark:border-slate-800">
        <label className="mb-2 block font-semibold text-gray-600 dark:text-gray-300">このスレッドのナレッジベース情報</label>
        <div className="space-y-2">
          <div>
            <span className="block text-[11px] text-gray-500">ドキュメントID</span>
            <input
              type="text"
              value={activeThread?.documentId ?? ''}
              onChange={(event) => handleUpdateDocumentInfo('documentId', event.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
          <div>
            <span className="block text-[11px] text-gray-500">ナレッジベースURL</span>
            <input
              type="text"
              value={activeThread?.knowledgeBaseUrl ?? ''}
              onChange={(event) => handleUpdateDocumentInfo('knowledgeBaseUrl', event.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          {activeThread?.messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`max-w-full rounded-lg border px-3 py-2 text-xs leading-relaxed ${
                  isUser
                    ? 'ml-auto border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-900/30 dark:text-blue-100'
                    : 'mr-auto border-gray-200 bg-white text-gray-800 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100'
                }`}
              >
                <pre className="whitespace-pre-wrap break-words font-sans text-xs">{msg.content}</pre>
                {msg.metadata?.maskedFiles && msg.metadata.maskedFiles.length > 0 && (
                  <div className="mt-2 rounded bg-white/40 p-2 text-[10px] text-gray-500 dark:bg-slate-900/40 dark:text-gray-400">
                    <p className="font-semibold">マスク情報</p>
                    <ul className="list-disc pl-4">
                      {msg.metadata.maskedFiles.map((item) => (
                        <li key={`${item.path}-${item.reason}`}>{item.path}: {item.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
          {!activeThread?.messages?.length && (
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">問い合わせ内容を入力して、AIヘルプに質問しましょう。</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 dark:border-slate-800">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-200">問い合わせ内容</label>
        <textarea
          className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={isSending}
        />
        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeActiveTab}
              onChange={(event) => setIncludeActiveTab(event.target.checked)}
            />
            アクティブなファイル内容をコンテキストとして送信
          </label>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={isSending}
          >
            {isSending ? '送信中...' : '送信'}
          </button>
        </div>
        {status && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{status}</p>}
        {lastMaskedSummary && (lastMaskedSummary.files.length > 0 || lastMaskedSummary.patterns.length > 0) && (
          <div className="mt-2 rounded bg-yellow-50 p-2 text-[10px] text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200">
            <p className="font-semibold">マスクされた情報</p>
            {lastMaskedSummary.files.length > 0 && (
              <div className="mt-1">
                <p>ファイル:</p>
                <ul className="list-disc pl-4">
                  {lastMaskedSummary.files.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {lastMaskedSummary.patterns.length > 0 && (
              <div className="mt-1">
                <p>検知された機密情報:</p>
                <ul className="list-disc pl-4">
                  {lastMaskedSummary.patterns.map((item) => (
                    <li key={item}>{item.replace(/^pattern:/, 'パターン: ')}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </form>

      <div className="border-t border-gray-200 p-3 text-[11px] text-gray-600 dark:border-slate-800 dark:text-gray-300">
        <p className="mb-2 text-xs font-semibold">権限とマスク設定</p>
        <div className="space-y-2">
          <div>
            <span className="block text-[10px] text-gray-500">現在のロール</span>
            <select
              value={helpSettings.currentRole}
              onChange={(event) => handleRoleChange(event.target.value as HelpUserRole)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-[10px] text-gray-500">利用を許可するロール</span>
            <div className="mt-1 space-y-1">
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <label key={role} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={helpSettings.allowedRoles[role as HelpUserRole]}
                    onChange={() => handleToggleRolePermission(role as HelpUserRole)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={helpSettings.maskFileContent}
              onChange={(event) => updateHelpSettings({ maskFileContent: event.target.checked })}
            />
            ファイル内容を常にマスクする
          </label>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <span className="block text-[10px] text-gray-500">デフォルトのドキュメントID</span>
              <input
                type="text"
                value={helpSettings.defaultDocumentId}
                onChange={(event) => handleDefaultDocChange('defaultDocumentId', event.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <span className="block text-[10px] text-gray-500">デフォルトのナレッジベースURL</span>
              <input
                type="text"
                value={helpSettings.defaultKnowledgeBaseUrl}
                onChange={(event) => handleDefaultDocChange('defaultKnowledgeBaseUrl', event.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpSidebar;
