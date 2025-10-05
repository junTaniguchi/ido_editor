'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IoChevronDown,
  IoChevronForward,
  IoCloudOutline,
  IoDocumentOutline,
  IoInformationCircleOutline,
  IoLinkOutline,
  IoLogInOutline,
  IoLogOutOutline,
  IoReloadOutline,
  IoSaveOutline,
  IoTrashOutline,
  IoWarningOutline,
} from 'react-icons/io5';
import { useEditorStore } from '@/store/editorStore';
import type { TabData } from '@/types';

type GoogleDriveMime = string;

interface DriveTreeItem {
  id: string;
  resourceId: string;
  name: string;
  mimeType: GoogleDriveMime;
  isFolder: boolean;
  isShortcut: boolean;
  webViewLink?: string;
  webContentLink?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  prompt?: 'consent' | 'select_account' | 'none';
}

interface GoogleTokenClient {
  callback: (response: GoogleTokenResponse) => void;
  requestAccessToken: (options?: { prompt?: 'consent' | 'select_account' | 'none' }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
          revoke: (accessToken: string, done: () => void) => void;
        };
      };
    };
  }
}

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_API_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';

const SCRIPT_CACHE: Record<string, Promise<void>> = {};

const loadScript = (src: string) => {
  if (SCRIPT_CACHE[src]) {
    return SCRIPT_CACHE[src];
  }

  SCRIPT_CACHE[src] = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Document is not available'));
      return;
    }

    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

  return SCRIPT_CACHE[src];
};

const SUPPORTED_MIME_AS_TEXT = new Map<GoogleDriveMime, { exportMime?: string; tabType: TabData['type']; description: string }>([
  ['text/plain', { tabType: 'text', description: 'テキストとして開きます。' }],
  ['text/markdown', { tabType: 'markdown', description: 'Markdown として開きます。' }],
  ['application/json', { tabType: 'json', description: 'JSON として開きます。' }],
  ['application/vnd.google-apps.document', {
    exportMime: 'text/plain',
    tabType: 'markdown',
    description: 'Google ドキュメントをテキストに変換して開きます。',
  }],
  ['text/csv', { tabType: 'csv', description: 'CSV として開きます。' }],
  ['text/tab-separated-values', { tabType: 'tsv', description: 'TSV として開きます。' }],
  ['application/vnd.google-apps.spreadsheet', {
    exportMime: 'text/csv',
    tabType: 'csv',
    description: 'Google スプレッドシートを CSV に変換して開きます。',
  }],
  ['application/vnd.google-apps.script', {
    exportMime: 'application/vnd.google-apps.script+json',
    tabType: 'json',
    description: 'Apps Script プロジェクトを JSON として開きます。',
  }],
]);

const SUPPORTED_MIME_AS_BLOB = new Map<GoogleDriveMime, { exportMime?: string; tabType: TabData['type']; description: string }>([
  ['application/pdf', { tabType: 'pdf', description: 'PDF をプレビュー用に読み込みます。' }],
]);

const GoogleDriveExplorer: React.FC = () => {
  const envClientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || '';
  const storedClientId = useEditorStore((state) => state.googleDriveClientId);
  const setGoogleDriveClientId = useEditorStore((state) => state.setGoogleDriveClientId);
  const clientId = useMemo(() => {
    const trimmedStored = storedClientId?.trim();
    if (trimmedStored) {
      return trimmedStored;
    }
    const trimmedEnv = envClientId.trim();
    return trimmedEnv || '';
  }, [envClientId, storedClientId]);
  const addTab = useEditorStore((state) => state.addTab);
  const updateTab = useEditorStore((state) => state.updateTab);
  const setActiveTabId = useEditorStore((state) => state.setActiveTabId);

  const [gisReady, setGisReady] = useState(false);
  const [tokenClient, setTokenClient] = useState<GoogleTokenClient | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInProgress, setAuthInProgress] = useState(false);

  const [driveChildren, setDriveChildren] = useState<Record<string, DriveTreeItem[]>>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [folderErrors, setFolderErrors] = useState<Record<string, string>>({});
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [clientIdInput, setClientIdInput] = useState<string>(storedClientId || '');

  const isSignedIn = Boolean(accessToken);
  const isBrowser = typeof window !== 'undefined';
  const appOrigin = isBrowser ? window.location.origin : 'http://localhost:3000';
  const isUsingEnvClientId = !storedClientId?.trim() && Boolean(envClientId.trim());

  useEffect(() => {
    setClientIdInput(storedClientId || '');
  }, [storedClientId]);

  useEffect(() => {
    setAccessToken(null);
    setTokenClient(null);
    setAuthError(null);
    setAuthInProgress(false);
    setDriveChildren({});
    setExpandedFolders(new Set<string>());
    setLoadingFolders(new Set<string>());
    setFolderErrors({});
    setPreviewingId(null);
    setPreviewError(null);
  }, [clientId]);

  useEffect(() => {
    if (!isBrowser || !clientId) {
      return;
    }

    let cancelled = false;

    loadScript(GOOGLE_IDENTITY_SCRIPT)
      .then(() => {
        if (cancelled) return;
        setGisReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, isBrowser]);

  useEffect(() => {
    if (!gisReady || !clientId || !isBrowser) {
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      setAuthError('Google Identity Services の初期化に失敗しました。');
      return;
    }

    try {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: () => {
          // callback は handleAuthorize 内で差し替える
        },
      });
      setTokenClient(client);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  }, [clientId, gisReady, isBrowser]);

  const handleClientIdSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setGoogleDriveClientId(clientIdInput.trim());
    },
    [clientIdInput, setGoogleDriveClientId],
  );

  const handleClientIdClear = useCallback(() => {
    setGoogleDriveClientId('');
    setClientIdInput('');
  }, [setGoogleDriveClientId]);

  const hasClientIdChanges = useMemo(() => {
    return clientIdInput.trim() !== (storedClientId || '').trim();
  }, [clientIdInput, storedClientId]);

  const normalizeDriveItem = useCallback((item: any): DriveTreeItem => {
    const isShortcut = item.mimeType === 'application/vnd.google-apps.shortcut';
    const targetId: string | undefined = isShortcut ? item.shortcutDetails?.targetId : undefined;
    const targetMime: GoogleDriveMime | undefined = isShortcut ? item.shortcutDetails?.targetMimeType : undefined;
    const effectiveId = targetId || item.id;
    const effectiveMime = targetMime || item.mimeType;

    return {
      id: effectiveId,
      resourceId: item.id,
      name: item.name,
      mimeType: effectiveMime,
      isFolder: effectiveMime === 'application/vnd.google-apps.folder',
      isShortcut,
      webViewLink: item.webViewLink,
      webContentLink: item.webContentLink,
    };
  }, []);

  const fetchFolder = useCallback(
    async (folderId: string) => {
      if (!accessToken) {
        return;
      }

      setLoadingFolders((prev) => new Set(prev).add(folderId));
      setFolderErrors((prev) => {
        const next = { ...prev };
        delete next[folderId];
        return next;
      });

      try {
        const collected: DriveTreeItem[] = [];
        let pageToken: string | undefined;

        do {
          const params = new URLSearchParams({
            q: `'${folderId}' in parents and trashed = false`,
            fields:
              'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, shortcutDetails(targetId, targetMimeType))',
            orderBy: 'folder,name',
            pageSize: '100',
            includeItemsFromAllDrives: 'false',
            supportsAllDrives: 'false',
          });
          if (pageToken) {
            params.set('pageToken', pageToken);
          }

          const response = await fetch(`${DRIVE_API_ENDPOINT}?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (!response.ok) {
            const message = await response.text();
            let parsed = message;
            try {
              const json = JSON.parse(message);
              parsed = json.error?.message || message;
            } catch {
              // ignore
            }
            throw new Error(parsed);
          }

          const data = await response.json();
          const files: any[] = data.files ?? [];
          collected.push(...files.map((file) => normalizeDriveItem(file)));
          pageToken = data.nextPageToken || undefined;
        } while (pageToken);

        collected.sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name, 'ja');
        });

        setDriveChildren((prev) => ({ ...prev, [folderId]: collected }));
      } catch (error) {
        setFolderErrors((prev) => ({
          ...prev,
          [folderId]: error instanceof Error ? error.message : 'Google Drive からの読み込みに失敗しました。',
        }));
      } finally {
        setLoadingFolders((prev) => {
          const next = new Set(prev);
          next.delete(folderId);
          return next;
        });
      }
    },
    [accessToken, normalizeDriveItem],
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    fetchFolder('root');
  }, [accessToken, fetchFolder]);

  useEffect(() => {
    if (!driveChildren.root || driveChildren.root.length === 0) {
      return;
    }
    setExpandedFolders((prev) => {
      if (prev.size > 0) {
        return prev;
      }
      return new Set<string>(['root']);
    });
  }, [driveChildren.root]);

  const handleAuthorize = useCallback(() => {
    if (!tokenClient) {
      setAuthError('Google Drive 認証クライアントが初期化されていません。');
      return;
    }

    setAuthError(null);
    setAuthInProgress(true);
    tokenClient.callback = (response) => {
      setAuthInProgress(false);
      if (response.error) {
        setAuthError(response.error);
        return;
      }
      setAccessToken(response.access_token);
    };
    try {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
      setAuthInProgress(false);
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  }, [tokenClient]);

  const handleSignOut = useCallback(() => {
    if (!accessToken) {
      return;
    }

    const revoke = window.google?.accounts?.oauth2?.revoke;
    const clearState = () => {
      setAccessToken(null);
      setDriveChildren({});
      setExpandedFolders(new Set());
      setFolderErrors({});
    };

    if (revoke) {
      revoke(accessToken, clearState);
    } else {
      clearState();
    }
  }, [accessToken]);

  const handleToggleFolder = useCallback(
    (item: DriveTreeItem) => {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        const key = item.resourceId;
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
          if (!driveChildren[item.id]) {
            fetchFolder(item.id);
          }
        }
        return next;
      });
    },
    [driveChildren, fetchFolder],
  );

  const handleRefresh = useCallback(() => {
    if (!accessToken) {
      return;
    }
    setDriveChildren({});
    setExpandedFolders(new Set());
    setFolderErrors({});
    fetchFolder('root');
  }, [accessToken, fetchFolder]);

  const openInDrive = useCallback((item: DriveTreeItem) => {
    const url = item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handlePreview = useCallback(
    async (item: DriveTreeItem) => {
      if (item.isFolder) {
        handleToggleFolder(item);
        return;
      }

      if (!accessToken) {
        setPreviewError('Google Drive にサインインしてください。');
        return;
      }

      const textConfig = SUPPORTED_MIME_AS_TEXT.get(item.mimeType);
      const blobConfig = SUPPORTED_MIME_AS_BLOB.get(item.mimeType);

      if (!textConfig && !blobConfig) {
        setPreviewError('このファイルタイプはまだエクスプローラ内でプレビューできません。Drive で開いてください。');
        return;
      }

      setPreviewError(null);
      setPreviewingId(item.resourceId);

      try {
        const exportConfig = textConfig?.exportMime || blobConfig?.exportMime;
        const url = exportConfig
          ? `${DRIVE_API_ENDPOINT}/${encodeURIComponent(item.id)}/export?mimeType=${encodeURIComponent(exportConfig)}`
          : `${DRIVE_API_ENDPOINT}/${encodeURIComponent(item.id)}?alt=media`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const message = await response.text();
          let parsed = message;
          try {
            const json = JSON.parse(message);
            parsed = json.error?.message || message;
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(parsed);
        }

        let content: string;
        let tabType: TabData['type'];

        if (textConfig) {
          content = await response.text();
          tabType = textConfig.tabType;
        } else {
          const blob = await response.blob();
          content = URL.createObjectURL(blob);
          tabType = blobConfig?.tabType || 'text';
        }

        const tabId = `gdrive:${item.id}`;
        const tabName = `${item.name} (Drive)`;
        const existingTab = useEditorStore.getState().tabs.get(tabId);
        if (existingTab) {
          updateTab(tabId, {
            content,
            originalContent: content,
            isDirty: false,
            type: tabType,
            isReadOnly: true,
          });
        } else {
          const tabData: TabData = {
            id: tabId,
            name: tabName,
            content,
            originalContent: content,
            isDirty: false,
            type: tabType,
            isReadOnly: true,
          };
          addTab(tabData);
        }
        setActiveTabId(tabId);
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : 'ファイルの読み込みに失敗しました。');
      } finally {
        setPreviewingId(null);
      }
    },
    [accessToken, addTab, handleToggleFolder, setActiveTabId, updateTab],
  );

  const renderChildren = (folderId: string, level: number): React.ReactNode => {
      const items = driveChildren[folderId];
      const isLoading = loadingFolders.has(folderId);
      const errorMessage = folderErrors[folderId];

      if (isLoading && !items) {
        return (
          <div className="flex items-center gap-2 py-2 text-xs text-gray-500" style={{ paddingLeft: `${level * 12 + 16}px` }}>
            <IoReloadOutline className="animate-spin" size={14} /> 読み込み中...
          </div>
        );
      }

      if (errorMessage && !items) {
        return (
          <div className="flex items-start gap-2 py-2 text-xs text-red-600" style={{ paddingLeft: `${level * 12 + 16}px` }}>
            <IoWarningOutline size={14} className="mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        );
      }

      if (!items || items.length === 0) {
        return (
          <div className="py-2 text-xs text-gray-500" style={{ paddingLeft: `${level * 12 + 16}px` }}>
            空のフォルダです。
          </div>
        );
      }

      return items.map((item) => {
        const treeKey = item.resourceId;
        const paddingLeft = `${level * 12 + 4}px`;

        if (item.isFolder) {
          const isExpanded = expandedFolders.has(treeKey);
          const childLoading = loadingFolders.has(item.id);
          return (
            <div key={treeKey}>
              <div
                className="flex items-center py-1 pl-1 pr-2 text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
                style={{ paddingLeft }}
                onClick={() => handleToggleFolder(item)}
                role="button"
                tabIndex={0}
              >
                <span className="mr-1 text-gray-500">
                  {isExpanded ? <IoChevronDown size={14} /> : <IoChevronForward size={14} />}
                </span>
                <IoCloudOutline className="mr-2 text-blue-500" size={16} />
                <span className="truncate text-sm text-gray-800 dark:text-gray-100">{item.name}</span>
                {item.isShortcut && (
                  <span className="ml-2 rounded bg-gray-200 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    ショートカット
                  </span>
                )}
                {childLoading && <IoReloadOutline size={14} className="ml-auto animate-spin text-gray-500" />}
              </div>
              {isExpanded && <div>{renderChildren(item.id, level + 1)}</div>}
            </div>
          );
        }

        const isLoadingPreview = previewingId === treeKey;

        return (
          <div
            key={treeKey}
            className="flex items-center py-1 pl-1 pr-2 text-sm hover:bg-blue-50 dark:hover:bg-slate-800"
            style={{ paddingLeft }}
            onClick={() => handlePreview(item)}
            role="button"
            tabIndex={0}
          >
            <IoDocumentOutline className="mr-2 text-gray-500" size={16} />
            <span className="truncate text-sm text-gray-800 dark:text-gray-100">{item.name}</span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openInDrive(item);
              }}
              className="ml-auto flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 transition hover:bg-gray-200 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <IoLinkOutline size={12} />
              Drive
            </button>
            {isLoadingPreview && <IoReloadOutline size={14} className="ml-2 animate-spin text-blue-500" />}
          </div>
        );
      });
    };

  let rootSection: React.ReactNode = null;
  if (isSignedIn) {
    rootSection = (
      <div className="py-2 text-sm">
        <div
          className="flex items-center py-1 pl-1 pr-2 text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={() =>
            setExpandedFolders((prev) => {
              const next = new Set(prev);
              if (next.has('root')) {
                next.delete('root');
              } else {
                next.add('root');
                if (!driveChildren.root) {
                  fetchFolder('root');
                }
              }
              return next;
            })
          }
          role="button"
          tabIndex={0}
        >
          <span className="mr-1 text-gray-500">
            {expandedFolders.has('root') ? <IoChevronDown size={14} /> : <IoChevronForward size={14} />}
          </span>
          <IoCloudOutline className="mr-2 text-blue-600" size={16} />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">マイドライブ</span>
          {loadingFolders.has('root') && <IoReloadOutline size={14} className="ml-auto animate-spin text-gray-500" />}
        </div>
        {expandedFolders.has('root') && <div>{renderChildren('root', 1)}</div>}
      </div>
    );
  }

  return (
    <div className="border-b border-gray-300 bg-white px-3 py-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IoCloudOutline className="text-blue-500" size={18} />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Google Drive</span>
        </div>
        <div className="flex items-center gap-2">
          {isSignedIn ? (
            <>
              <button
                type="button"
                onClick={handleRefresh}
                className="flex items-center gap-1 rounded border border-blue-500 px-2 py-1 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-blue-400 dark:text-blue-200 dark:hover:bg-blue-500/20"
              >
                <IoReloadOutline size={12} />
                再同期
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1 rounded border border-gray-400 px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <IoLogOutOutline size={12} />
                サインアウト
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleAuthorize}
              disabled={!clientId || authInProgress}
              className="flex items-center gap-1 rounded border border-blue-500 bg-blue-500 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <IoLogInOutline size={12} />
              Google でサインイン
            </button>
          )}
        </div>
      </div>
      <form className="mt-3 space-y-2" onSubmit={handleClientIdSubmit}>
        <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
          <IoInformationCircleOutline size={14} className="text-blue-500" />
          Google OAuth クライアント ID
        </label>
        <div className="flex items-center gap-2">
          <input
            value={clientIdInput}
            onChange={(event) => setClientIdInput(event.target.value)}
            placeholder="例: 1234567890-abcdefghijklmnop.apps.googleusercontent.com"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-blue-300"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={!clientIdInput.trim() || !hasClientIdChanges}
            className="flex items-center gap-1 rounded border border-blue-500 bg-blue-500 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <IoSaveOutline size={12} />
            保存
          </button>
          <button
            type="button"
            onClick={handleClientIdClear}
            disabled={!storedClientId}
            className="flex items-center gap-1 rounded border border-gray-400 px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <IoTrashOutline size={12} />
            クリア
          </button>
        </div>
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-100">
          <p>
            Google Cloud Console で「OAuth 2.0 クライアント ID」を「ウェブアプリケーション」タイプとして作成し、承認済みの JavaScript 生成元に
            <code className="mx-1 rounded bg-white/80 px-1 py-0.5 text-[10px] font-mono dark:bg-gray-900/60">{appOrigin}</code>
            を追加してください。
          </p>
          <p className="mt-1">
            発行されたクライアント ID を上記フィールド、または環境変数
            <code className="mx-1 rounded bg-white/80 px-1 py-0.5 text-[10px] font-mono dark:bg-gray-900/60">NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID</code>
            に設定すると、Google Drive 連携を利用できます。
          </p>
          {isUsingEnvClientId && (
            <p className="mt-1 text-[10px] text-blue-600 dark:text-blue-200">
              現在は環境変数に設定されたクライアント ID が使用されています。別の ID を利用したい場合は上記に入力して保存してください。
            </p>
          )}
        </div>
      </form>
      <p className="mt-2 leading-relaxed">
        Google Drive 上のファイルとフォルダをローカルフォルダと同じようにブラウズできます。テキスト系ファイルはタブで開き、その他のファイルは Drive で直接表示してください。
      </p>
      {!clientId && (
        <p className="mt-3 rounded border border-yellow-400 bg-yellow-50 px-3 py-2 text-[11px] font-medium text-yellow-700 dark:border-yellow-500 dark:bg-yellow-500/10 dark:text-yellow-200">
          Google OAuth クライアント ID が未設定のため、サインインボタンは無効化されています。上のフィールドにクライアント ID を登録すると利用可能になります。
        </p>
      )}
      {authError && (
        <p className="mt-3 rounded border border-red-400 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-600 dark:border-red-500 dark:bg-red-500/10 dark:text-red-200">
          {authError}
        </p>
      )}
      {previewError && (
        <p className="mt-3 rounded border border-orange-400 bg-orange-50 px-3 py-2 text-[11px] font-medium text-orange-600 dark:border-orange-500 dark:bg-orange-500/10 dark:text-orange-200">
          {previewError}
        </p>
      )}
      {rootSection}
    </div>
  );
};

export default GoogleDriveExplorer;
