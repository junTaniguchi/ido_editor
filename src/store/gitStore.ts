'use client';

import { create } from 'zustand';
import { createTwoFilesPatch } from 'diff';
import type { ReadCommitResult, StatusMatrixResult } from 'isomorphic-git';
import { FileSystemAccessFs } from '@/lib/git/fileSystemAccessFs';

type GitFileStatus = 'unmodified' | 'modified' | 'deleted' | 'added' | 'untracked' | 'absent';

export interface GitStatusEntry {
  filepath: string;
  worktreeStatus: GitFileStatus;
  stagedStatus: GitFileStatus;
  isStaged: boolean;
  isUntracked: boolean;
}

export interface GitCommitEntry {
  oid: string;
  message: string;
  author: string;
  date: string;
}

interface GitStoreState {
  rootDirHandle: FileSystemDirectoryHandle | null;
  fsAdapter: FileSystemAccessFs | null;
  repoInitialized: boolean;
  loading: boolean;
  error: string | null;
  status: GitStatusEntry[];
  branches: string[];
  currentBranch: string | null;
  commits: GitCommitEntry[];
  authorName: string;
  authorEmail: string;
  setRootDirectory: (handle: FileSystemDirectoryHandle | null) => Promise<void>;
  initializeRepository: () => Promise<void>;
  refreshRepository: () => Promise<void>;
  stageFile: (filepath: string) => Promise<void>;
  unstageFile: (filepath: string) => Promise<void>;
  discardChanges: (filepath: string) => Promise<void>;
  commit: (message: string) => Promise<void>;
  checkoutBranch: (branch: string) => Promise<void>;
  createBranch: (branch: string, checkout?: boolean) => Promise<void>;
  setAuthorName: (name: string) => void;
  setAuthorEmail: (email: string) => void;
  getFileHistory: (filepath: string) => Promise<GitCommitEntry[]>;
  getDiffAgainstWorkingTree: (filepath: string, oid: string) => Promise<string>;
  getDiffBetweenCommits: (filepath: string, baseOid: string, targetOid: string) => Promise<string>;
  restoreFileToCommit: (filepath: string, oid: string) => Promise<string | null>;
  cloneRepository: (options: {
    url: string;
    directoryName?: string;
    reference?: string;
  }) => Promise<{ handle: FileSystemDirectoryHandle; folderName: string } | null>;
}

const interpretStatus = (head: number, value: number): GitFileStatus => {
  if (value === 0) {
    return head === 0 ? 'absent' : 'deleted';
  }
  if (value === 1) {
    return 'unmodified';
  }
  if (value === 2) {
    return head === 0 ? 'added' : 'modified';
  }
  if (value === 3) {
    return 'modified';
  }
  return 'modified';
};

const formatCommits = (entries: ReadCommitResult[]): GitCommitEntry[] =>
  entries.map((entry) => ({
    oid: entry.oid,
    message: entry.commit.message.split('\n')[0] ?? '',
    author: entry.commit.author ? `${entry.commit.author.name} <${entry.commit.author.email}>` : 'unknown',
    date: entry.commit.author?.timestamp
      ? new Date(entry.commit.author.timestamp * 1000).toLocaleString()
      : '',
  }));

const withFs = async <T>(state: GitStoreState, fn: (params: { fs: any; adapter: FileSystemAccessFs }) => Promise<T>): Promise<T> => {
  if (!state.fsAdapter) {
    throw new Error('リポジトリが選択されていません');
  }
  return fn({ fs: state.fsAdapter.getFs(), adapter: state.fsAdapter });
};

const textDecoder = new TextDecoder();

type GitModule = typeof import('isomorphic-git');

let gitModule: GitModule | null = null;

const loadGit = async (): Promise<GitModule> => {
  if (!gitModule) {
    gitModule = await import('isomorphic-git');
  }
  return gitModule;
};

export const useGitStore = create<GitStoreState>((set, get) => ({
  rootDirHandle: null,
  fsAdapter: null,
  repoInitialized: false,
  loading: false,
  error: null,
  status: [],
  branches: [],
  currentBranch: null,
  commits: [],
  authorName: 'DataLoom User',
  authorEmail: 'dataloom@example.com',

  setRootDirectory: async (handle) => {
    if (!handle) {
      set({
        rootDirHandle: null,
        fsAdapter: null,
        repoInitialized: false,
        status: [],
        branches: [],
        currentBranch: null,
        commits: [],
        error: null,
      });
      return;
    }

    const adapter = new FileSystemAccessFs(handle);
    set({ rootDirHandle: handle, fsAdapter: adapter, loading: true, error: null });

    try {
      const hasGitDir = await adapter.exists('.git');
      set({ repoInitialized: hasGitDir });
      if (hasGitDir) {
        await get().refreshRepository();
      } else {
        set({ loading: false, status: [], branches: [], currentBranch: null, commits: [] });
      }
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'リポジトリの初期化確認中にエラーが発生しました',
      });
    }
  },

  initializeRepository: async () => {
    const state = get();
    await withFs(state, async ({ fs }) => {
      set({ loading: true, error: null });
      try {
        const git = await loadGit();
        await git.init({ fs, dir: '/', defaultBranch: 'main' });
        set({ repoInitialized: true });
        await get().refreshRepository();
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Gitリポジトリの初期化に失敗しました',
        });
      }
    });
  },

  refreshRepository: async () => {
    const state = get();
    await withFs(state, async ({ fs, adapter }) => {
      set({ loading: true, error: null });
      try {
        const git = await loadGit();
        const hasGitDir = await adapter.exists('.git');
        if (!hasGitDir) {
          set({
            repoInitialized: false,
            status: [],
            branches: [],
            currentBranch: null,
            commits: [],
            loading: false,
          });
          return;
        }

        const [branch, branches, matrix, logEntries] = await Promise.all([
          git.currentBranch({ fs, dir: '/', fullname: false }),
          git.listBranches({ fs, dir: '/' }),
          git.statusMatrix({ fs, dir: '/' }) as Promise<StatusMatrixResult>,
          git
            .log({ fs, dir: '/', depth: 50 })
            .catch(() => [] as ReadCommitResult[]),
        ]);

        const statusEntries: GitStatusEntry[] = matrix.map(([filepath, head, workdir, stage]) => {
          const isUntracked = head === 0 && workdir === 2 && stage === 0;
          const worktreeStatus = isUntracked ? 'untracked' : interpretStatus(head, workdir);
          const stagedStatus = interpretStatus(head, stage);
          const isStaged = stage !== head;

          return {
            filepath,
            worktreeStatus,
            stagedStatus,
            isStaged,
            isUntracked,
          };
        });

        statusEntries.sort((a, b) => a.filepath.localeCompare(b.filepath));

        set({
          repoInitialized: true,
          currentBranch: branch ?? null,
          branches,
          status: statusEntries,
          commits: formatCommits(logEntries),
          loading: false,
        });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Git状態の更新に失敗しました',
        });
      }
    });
  },

  stageFile: async (filepath) => {
    const state = get();
    await withFs(state, async ({ fs }) => {
      set({ loading: true, error: null });
      try {
        const git = await loadGit();
        const entry = state.status.find((item) => item.filepath === filepath);
        if (!entry) {
          throw new Error('ファイルの状態が見つかりません');
        }
        if (entry.worktreeStatus === 'deleted' || (entry.stagedStatus === 'deleted' && entry.isStaged)) {
          await git.remove({ fs, dir: '/', filepath });
        } else {
          await git.add({ fs, dir: '/', filepath });
        }
        await get().refreshRepository();
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'ステージングに失敗しました',
        });
      }
    });
  },

  unstageFile: async (filepath) => {
    const state = get();
    await withFs(state, async ({ fs }) => {
      set({ loading: true, error: null });
      try {
        const git = await loadGit();
        await git.resetIndex({ fs, dir: '/', filepath });
        await get().refreshRepository();
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'ステージの解除に失敗しました',
        });
      }
    });
  },

  discardChanges: async (filepath) => {
    const state = get();
    await withFs(state, async ({ fs, adapter }) => {
      set({ loading: true, error: null });
      try {
        const entry = state.status.find((item) => item.filepath === filepath);
        if (!entry) {
          throw new Error('ファイルの状態が見つかりません');
        }
        if (entry.isUntracked) {
          await adapter.delete(filepath);
        } else {
          const git = await loadGit();
          await git.checkout({ fs, dir: '/', filepaths: [filepath], force: true });
        }
        await get().refreshRepository();
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : '変更の破棄に失敗しました',
        });
      }
    });
  },

  commit: async (message) => {
    const state = get();
    if (!message.trim()) {
      set({ error: 'コミットメッセージを入力してください。' });
      return;
    }
    if (!state.status.some((entry) => entry.isStaged)) {
      set({ error: 'ステージされた変更がありません。' });
      return;
    }

    await withFs(state, async ({ fs }) => {
      set({ loading: true, error: null });
      try {
        const git = await loadGit();
        await git.commit({
          fs,
          dir: '/',
          message,
          author: {
            name: state.authorName,
            email: state.authorEmail,
          },
          committer: {
            name: state.authorName,
            email: state.authorEmail,
          },
        });
        await get().refreshRepository();
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'コミットに失敗しました',
        });
      }
    });
  },

  checkoutBranch: async (branch) => {
    if (!branch) {
      return;
    }
    const state = get();
    await withFs(state, async ({ fs }) => {
      set({ loading: true, error: null });
      try {
        const git = await loadGit();
        await git.checkout({ fs, dir: '/', ref: branch });
        await get().refreshRepository();
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'ブランチの切り替えに失敗しました',
        });
      }
    });
  },

  createBranch: async (branch, checkout = true) => {
    if (!branch.trim()) {
      set({ error: 'ブランチ名を入力してください。' });
      return;
    }
    const state = get();
    if (state.branches.includes(branch)) {
      set({ error: '同名のブランチが既に存在します。' });
      return;
    }

    await withFs(state, async ({ fs }) => {
      set({ loading: true, error: null });
      try {
        const git = await loadGit();
        await git.branch({ fs, dir: '/', ref: branch, checkout });
        await get().refreshRepository();
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'ブランチの作成に失敗しました',
        });
      }
    });
  },

  getFileHistory: async (filepath) => {
    const state = get();
    return withFs(state, async ({ fs }) => {
      try {
        const git = await loadGit();
        const entries = await git
          .log({ fs, dir: '/', filepath, depth: 100 })
          .catch(() => [] as ReadCommitResult[]);
        return formatCommits(entries);
      } catch (error) {
        throw error instanceof Error ? error : new Error('コミット履歴の取得に失敗しました');
      }
    });
  },

  getDiffAgainstWorkingTree: async (filepath, oid) => {
    const state = get();
    return withFs(state, async ({ fs, adapter }) => {
      try {
        const git = await loadGit();
        let commitContent = '';
        try {
          const { blob } = await git.readBlob({ fs, dir: '/', oid, filepath });
          commitContent = textDecoder.decode(blob);
        } catch (error) {
          if ((error as any)?.code !== 'NotFoundError') {
            throw error;
          }
        }

        let workingContent = '';
        try {
          const raw = await adapter.readFile(filepath, 'utf8');
          workingContent = typeof raw === 'string' ? raw : textDecoder.decode(raw);
        } catch {
          workingContent = '';
        }

        return createTwoFilesPatch(
          `${filepath}@${oid.slice(0, 7)}`,
          `${filepath}@作業ツリー`,
          commitContent,
          workingContent,
        );
      } catch (error) {
        throw error instanceof Error ? error : new Error('差分の取得に失敗しました');
      }
    });
  },

  getDiffBetweenCommits: async (filepath, baseOid, targetOid) => {
    const state = get();
    return withFs(state, async ({ fs }) => {
      try {
        const git = await loadGit();

        const readBlobSafely = async (oid: string): Promise<string> => {
          if (!oid) {
            return '';
          }
          try {
            const { blob } = await git.readBlob({ fs, dir: '/', oid, filepath });
            return textDecoder.decode(blob);
          } catch (error) {
            if ((error as any)?.code === 'NotFoundError') {
              return '';
            }
            throw error;
          }
        };

        const [baseContent, targetContent] = await Promise.all([
          readBlobSafely(baseOid),
          readBlobSafely(targetOid),
        ]);

        return createTwoFilesPatch(
          `${filepath}@${baseOid.slice(0, 7) || 'ベース'}`,
          `${filepath}@${targetOid.slice(0, 7) || '比較先'}`,
          baseContent,
          targetContent,
        );
      } catch (error) {
        throw error instanceof Error ? error : new Error('差分の取得に失敗しました');
      }
    });
  },

  restoreFileToCommit: async (filepath, oid) => {
    const state = get();
    return withFs(state, async ({ fs, adapter }) => {
      set({ loading: true, error: null });
      try {
        const git = await loadGit();
        let commitBlob: Uint8Array | null = null;
        try {
          const { blob } = await git.readBlob({ fs, dir: '/', oid, filepath });
          commitBlob = blob;
        } catch (error) {
          if ((error as any)?.code !== 'NotFoundError') {
            throw error;
          }
        }

        let restoredText: string | null = null;
        if (commitBlob) {
          await adapter.writeFile(filepath, commitBlob);
          restoredText = textDecoder.decode(commitBlob);
        } else {
          try {
            await adapter.delete(filepath);
          } catch {
            // 対象ファイルが既に存在しない場合は無視
          }
          restoredText = null;
        }

        await get().refreshRepository();
        return restoredText;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ロールバックに失敗しました';
        set({ loading: false, error: message });
        throw new Error(message);
      }
    });
  },

  cloneRepository: async ({ url, directoryName, reference }) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      set({ error: 'リポジトリのURLを入力してください。' });
      return null;
    }

    if (!('showDirectoryPicker' in window)) {
      set({ error: 'このブラウザはGitのクローンに必要なファイルアクセスAPIをサポートしていません。' });
      return null;
    }

    set({ loading: true, error: null });

    let parentHandle: FileSystemDirectoryHandle | null = null;
    let createdFolderName: string | null = null;

    try {
      // @ts-ignore File System Access API is experimental
      parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

      const fallbackName = (() => {
        const sanitized = trimmedUrl.replace(/\.git$/i, '');
        const segments = sanitized.split('/').filter(Boolean);
        const last = segments[segments.length - 1] ?? '';
        return last.replace(/[^a-zA-Z0-9._-]/g, '-') || `repository-${Date.now()}`;
      })();

      const targetName = (directoryName?.trim() || fallbackName).replace(/\s+/g, '-');
      createdFolderName = targetName;

      const repoHandle = await parentHandle.getDirectoryHandle(targetName, { create: true });

      for await (const _entry of repoHandle.entries()) {
        throw new Error('クローン先のフォルダが空ではありません。別のフォルダ名を指定してください。');
      }

      const adapter = new FileSystemAccessFs(repoHandle);
      const fs = adapter.getFs();
      const git = await loadGit();
      const httpModule = await import('isomorphic-git/http/web');
      const http = (httpModule as { default?: any }).default ?? httpModule;

      await git.clone({
        fs,
        http,
        dir: '/',
        url: trimmedUrl,
        singleBranch: true,
        depth: 50,
        corsProxy: 'https://cors.isomorphic-git.org',
        ref: reference?.trim() || undefined,
      });

      await get().setRootDirectory(repoHandle);

      return { handle: repoHandle, folderName: targetName };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        set({ loading: false, error: null });
        return null;
      }

      console.error('Failed to clone repository:', error);
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Gitリポジトリのクローンに失敗しました',
      });

      if (parentHandle && createdFolderName) {
        parentHandle
          .removeEntry(createdFolderName, { recursive: true })
          .catch(() => undefined);
      }

      return null;
    }
  },

  setAuthorName: (name) => set({ authorName: name }),
  setAuthorEmail: (email) => set({ authorEmail: email }),
}));
