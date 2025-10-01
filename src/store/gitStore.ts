'use client';

import { create } from 'zustand';
import { createTwoFilesPatch } from 'diff';
import type { ReadCommitResult, StatusMatrixResult } from 'isomorphic-git';
import { FileSystemAccessFs } from '@/lib/git/fileSystemAccessFs';
import type {
  GitAssistDiffPayload,
  GitAssistDiffScope,
  GitAssistSkippedFile,
  GitFileStatus,
} from '@/types/git';

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
  parents: string[];
  timestamp: number | null;
}

export interface GitFlowMermaidResult {
  diagram: string;
  branchAliases: Record<string, string>;
  branchCount: number;
  commitCount: number;
  depth: number;
  generatedAt: string;
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
  pullRepository: () => Promise<void>;
  setAuthorName: (name: string) => void;
  setAuthorEmail: (email: string) => void;
  getFileHistory: (filepath: string) => Promise<GitCommitEntry[]>;
  getDiffAgainstWorkingTree: (filepath: string, oid: string) => Promise<string>;
  getDiffBetweenCommits: (filepath: string, baseOid: string, targetOid: string) => Promise<string>;
  getCommitDiff: (oid: string) => Promise<{
    commit: GitCommitEntry | null;
    parentCommit: GitCommitEntry | null;
    files: { filePath: string; diff: string }[];
  }>;
  getDiffPayload: (options?: { scope?: GitAssistDiffScope }) => Promise<GitAssistDiffPayload>;
  generateGitFlowMermaid: (options?: { depth?: number }) => Promise<GitFlowMermaidResult>;
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
    parents: entry.commit.parent ?? [],
    timestamp: entry.commit.author?.timestamp ?? null,
  }));

const withFs = async <T>(state: GitStoreState, fn: (params: { fs: any; adapter: FileSystemAccessFs }) => Promise<T>): Promise<T> => {
  if (!state.fsAdapter) {
    throw new Error('リポジトリが選択されていません');
  }
  return fn({ fs: state.fsAdapter.getFs(), adapter: state.fsAdapter });
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const SENSITIVE_FILENAME_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i,
  /^id_[a-z0-9_-]+$/i,
];

const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /\.pem$/i,
  /\.key$/i,
  /\.crt$/i,
  /\.cer$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /\.der$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /\.asc$/i,
];

const SENSITIVE_KEYWORD_PATTERN = /(?:^|[\\/._-])(secret|credential|token|password|private|apikey)(?:[\\/._-]|$)/i;

const isSensitiveFilePath = (filepath: string): boolean => {
  const normalized = filepath.trim();
  if (!normalized) {
    return false;
  }
  const lower = normalized.toLowerCase();
  const filename = lower.split('/').pop() ?? lower;
  if (SENSITIVE_FILENAME_PATTERNS.some((pattern) => pattern.test(filename))) {
    return true;
  }
  if (SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(filename) || pattern.test(lower))) {
    return true;
  }
  if (SENSITIVE_KEYWORD_PATTERN.test(lower)) {
    return true;
  }
  return false;
};

const isProbablyBinary = (buffer: Uint8Array | null): boolean => {
  if (!buffer || buffer.length === 0) {
    return false;
  }
  const sampleLength = Math.min(buffer.length, 1024);
  let suspicious = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index];
    if (byte === 0) {
      return true;
    }
    if (byte < 7 || (byte > 13 && byte < 32) || byte === 127) {
      suspicious += 1;
    }
  }
  return suspicious / sampleLength > 0.3;
};

type GitModule = typeof import('isomorphic-git');

let gitModule: GitModule | null = null;

let gitHttpClient: any | null = null;

const loadGit = async (): Promise<GitModule> => {
  if (!gitModule) {
    gitModule = await import('isomorphic-git');
  }
  return gitModule;
};

const loadGitHttpClient = async () => {
  if (!gitHttpClient) {
    const httpModule = await import('isomorphic-git/http/web');
    gitHttpClient = (httpModule as { default?: any }).default ?? httpModule;
  }
  return gitHttpClient;
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

  pullRepository: async () => {
    const state = get();
    await withFs(state, async ({ fs }) => {
      set({ loading: true, error: null });
      try {
        const git = await loadGit();
        const http = await loadGitHttpClient();

        const remotes = await git.listRemotes({ fs, dir: '/' });
        if (!remotes || remotes.length === 0) {
          throw new Error('リモートリポジトリが設定されていません。');
        }

        const defaultRemote = remotes.find((remote) => remote.remote === 'origin') ?? remotes[0];
        const currentBranch =
          state.currentBranch ?? (await git.currentBranch({ fs, dir: '/', fullname: false })) ?? 'main';

        await git.pull({
          fs,
          http,
          dir: '/',
          remote: defaultRemote.remote,
          ref: currentBranch,
          singleBranch: true,
          corsProxy: 'https://cors.isomorphic-git.org',
        });

        await get().refreshRepository();
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'リモートからの取得に失敗しました',
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

  getCommitDiff: async (oid) => {
    const state = get();
    return withFs(state, async ({ fs }) => {
      try {
        const git = await loadGit();
        const commitResult = await git.readCommit({ fs, dir: '/', oid });
        const commitEntry = formatCommits([commitResult])[0] ?? null;
        let parentCommitEntry: GitCommitEntry | null = null;
        let parentOid = commitResult.commit.parent?.[0] ?? null;

        if (parentOid) {
          try {
            const parentResult = await git.readCommit({ fs, dir: '/', oid: parentOid });
            parentCommitEntry = formatCommits([parentResult])[0] ?? null;
          } catch (error) {
            if ((error as any)?.code === 'NotFoundError') {
              parentOid = null;
            } else {
              throw error;
            }
          }
        }

        const fileSet = new Set<string>();
        const currentFiles = await git.listFiles({ fs, dir: '/', ref: oid }).catch(() => [] as string[]);
        currentFiles.forEach((file) => fileSet.add(file));

        if (parentOid) {
          const parentFiles = await git.listFiles({ fs, dir: '/', ref: parentOid }).catch(() => [] as string[]);
          parentFiles.forEach((file) => fileSet.add(file));
        }

        const readBlobSafely = async (targetOid: string | null, filepath: string): Promise<string> => {
          if (!targetOid) {
            return '';
          }
          try {
            const { blob } = await git.readBlob({ fs, dir: '/', oid: targetOid, filepath });
            return textDecoder.decode(blob);
          } catch (error) {
            if ((error as any)?.code === 'NotFoundError') {
              return '';
            }
            throw error;
          }
        };

        const files: { filePath: string; diff: string }[] = [];
        const sortedFiles = Array.from(fileSet).sort((a, b) => a.localeCompare(b));

        for (const filePath of sortedFiles) {
          const [baseContent, targetContent] = await Promise.all([
            readBlobSafely(parentOid, filePath),
            readBlobSafely(oid, filePath),
          ]);

          if (baseContent === targetContent) {
            continue;
          }

          const baseLabel = parentOid
            ? `${filePath}@${parentOid.slice(0, 7)}`
            : `${filePath}@初期状態`;
          const targetLabel = `${filePath}@${oid.slice(0, 7)}`;
          const diff = createTwoFilesPatch(baseLabel, targetLabel, baseContent, targetContent);
          files.push({ filePath, diff });
        }

        return {
          commit: commitEntry,
          parentCommit: parentCommitEntry,
          files,
        };
      } catch (error) {
        throw error instanceof Error ? error : new Error('コミット差分の取得に失敗しました');
      }
    });
  },

  getDiffPayload: async (options) => {
    const state = get();
    const scope: GitAssistDiffScope = options?.scope ?? 'staged';

    const selectEntries = (entries: GitStatusEntry[]): GitStatusEntry[] =>
      entries.filter((entry) => {
        switch (scope) {
          case 'staged':
            return entry.isStaged;
          case 'worktree':
            return entry.worktreeStatus !== 'unmodified' && entry.worktreeStatus !== 'absent';
          case 'all':
          default:
            return entry.isStaged || entry.worktreeStatus !== 'unmodified';
        }
      });

    return withFs(state, async ({ fs, adapter }) => {
      const git = await loadGit();
      const files: GitAssistDiffPayload['files'] = [];
      const skipped: GitAssistSkippedFile[] = [];
      const targetEntries = selectEntries(state.status);

      for (const entry of targetEntries) {
        if (isSensitiveFilePath(entry.filepath)) {
          skipped.push({ path: entry.filepath, reason: 'sensitive', message: '機密性の高い可能性のあるファイルのため除外しました。' });
          continue;
        }

        let headBuffer: Uint8Array | null = null;
        try {
          const { blob } = await git.readBlob({ fs, dir: '/', oid: 'HEAD', filepath: entry.filepath });
          headBuffer = blob;
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (code !== 'ResolveRefError' && code !== 'NotFoundError' && code !== 'TreeOrBlobNotFoundError') {
            throw error;
          }
        }

        let workBuffer: Uint8Array | null = null;
        try {
          const raw = await adapter.readFile(entry.filepath);
          if (typeof raw === 'string') {
            workBuffer = textEncoder.encode(raw);
          } else {
            workBuffer = raw;
          }
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (code === 'ENOENT') {
            workBuffer = null;
          } else {
            skipped.push({
              path: entry.filepath,
              reason: 'error',
              message: error instanceof Error ? error.message : 'ファイルの読み込みに失敗しました。',
            });
            continue;
          }
        }

        const baseBinary = isProbablyBinary(headBuffer);
        const workBinary = isProbablyBinary(workBuffer);
        const isBinary = baseBinary || workBinary;

        let baseText = '';
        let workText = '';
        if (!isBinary) {
          baseText = headBuffer ? textDecoder.decode(headBuffer) : '';
          workText = workBuffer ? textDecoder.decode(workBuffer) : '';
          if (baseText === workText) {
            continue;
          }
        }

        const baseLabel = headBuffer ? `${entry.filepath}@HEAD` : `${entry.filepath}@ベース`;
        const targetLabel = workBuffer !== null ? `${entry.filepath}@作業ツリー` : `${entry.filepath}@削除`;

        const diff = isBinary ? null : createTwoFilesPatch(baseLabel, targetLabel, baseText, workText);

        files.push({
          path: entry.filepath,
          worktreeStatus: entry.worktreeStatus,
          stagedStatus: entry.stagedStatus,
          isStaged: entry.isStaged,
          isUntracked: entry.isUntracked,
          diff,
          isBinary,
          headSize: headBuffer ? headBuffer.length : null,
          worktreeSize: workBuffer ? workBuffer.length : null,
        });
      }

      return {
        branch: state.currentBranch ?? null,
        scope,
        files,
        skipped,
      } satisfies GitAssistDiffPayload;
    });
  },

  generateGitFlowMermaid: async (options) => {
    const state = get();
    const depth = Math.max(1, Math.min(options?.depth ?? 160, 500));

    return withFs(state, async ({ fs, adapter }) => {
      const git = await loadGit();
      const hasGitDir = await adapter.exists('.git');
      if (!hasGitDir) {
        throw new Error('Gitリポジトリが見つかりません。');
      }

      const timestamp = new Date().toISOString();
      const branches = await git.listBranches({ fs, dir: '/' });

      if (branches.length === 0) {
        const lines = [
          'gitGraph LR',
          `  %% 生成日時: ${timestamp}`,
          '  %% コミット履歴が見つかりません。',
        ];
        return {
          diagram: lines.join('\n'),
          branchAliases: {},
          branchCount: 0,
          commitCount: 0,
          depth,
          generatedAt: timestamp,
        } satisfies GitFlowMermaidResult;
      }

      const branchLogs = await Promise.all(
        branches.map(async (branch) => {
          const log = await git
            .log({ fs, dir: '/', ref: branch, depth })
            .catch(() => [] as ReadCommitResult[]);
          return { branch, log } as const;
        }),
      );

      const commitMap = new Map<string, { entry: ReadCommitResult; branches: Set<string> }>();
      for (const { branch, log } of branchLogs) {
        for (const entry of log) {
          const existing = commitMap.get(entry.oid);
          if (existing) {
            existing.branches.add(branch);
          } else {
            commitMap.set(entry.oid, { entry, branches: new Set([branch]) });
          }
        }
      }

      if (commitMap.size === 0) {
        const lines = [
          'gitGraph LR',
          `  %% 生成日時: ${timestamp}`,
          '  %% コミット履歴が見つかりません。',
        ];
        return {
          diagram: lines.join('\n'),
          branchAliases: {},
          branchCount: branches.length,
          commitCount: 0,
          depth,
          generatedAt: timestamp,
        } satisfies GitFlowMermaidResult;
      }

      const branchPriority = [...new Set([state.currentBranch ?? null, ...branches])].filter(
        (value): value is string => Boolean(value),
      );
      if (branchPriority.length === 0) {
        branchPriority.push(branches[0]);
      }

      const branchLogMap = new Map<string, ReadCommitResult[]>();
      for (const { branch, log } of branchLogs) {
        branchLogMap.set(branch, log);
      }

      const commitBranch = new Map<string, string>();
      for (const branch of branchPriority) {
        const log = branchLogMap.get(branch) ?? [];
        for (let index = log.length - 1; index >= 0; index -= 1) {
          const entry = log[index];
          if (!commitBranch.has(entry.oid)) {
            commitBranch.set(entry.oid, branch);
          }
        }
      }

      for (const [oid, node] of commitMap.entries()) {
        if (!commitBranch.has(oid)) {
          const fallback = node.branches.values().next().value ?? branchPriority[0];
          if (fallback) {
            commitBranch.set(oid, fallback);
          }
        }
      }

      const visited = new Set<string>();
      const ordered: string[] = [];
      const dfs = (oid: string) => {
        if (visited.has(oid)) {
          return;
        }
        visited.add(oid);
        const node = commitMap.get(oid);
        if (!node) {
          return;
        }
        const parents = node.entry.commit.parent ?? [];
        for (const parent of parents) {
          if (commitMap.has(parent)) {
            dfs(parent);
          }
        }
        ordered.push(oid);
      };

      const tipCandidates = branchPriority
        .map((branch) => branchLogMap.get(branch)?.[0]?.oid)
        .filter((oid): oid is string => Boolean(oid));
      for (const tip of tipCandidates) {
        dfs(tip);
      }
      for (const oid of commitMap.keys()) {
        if (!visited.has(oid)) {
          dfs(oid);
        }
      }

      const aliasMap = new Map<string, string>();
      const aliasLegend = new Map<string, string>();
      const usedAliases = new Set<string>();

      const registerAlias = (branch: string, alias: string) => {
        aliasMap.set(branch, alias);
        aliasLegend.set(alias, branch);
        usedAliases.add(alias);
        return alias;
      };

      const sanitizeAlias = (branch: string) => {
        const base = branch.replace(/[^a-zA-Z0-9_]/g, '_') || 'branch';
        let candidate = base;
        let counter = 1;
        while (usedAliases.has(candidate)) {
          candidate = `${base}_${counter}`;
          counter += 1;
        }
        return candidate;
      };

      const baseBranch = branchPriority[0] ?? 'main';
      const ensureAlias = (branchName: string | null | undefined) => {
        const key = branchName ?? baseBranch;
        const existing = aliasMap.get(key);
        if (existing) {
          return existing;
        }
        const preferred = key === baseBranch ? 'main' : sanitizeAlias(key);
        if (usedAliases.has(preferred)) {
          return registerAlias(key, sanitizeAlias(key));
        }
        return registerAlias(key, preferred);
      };

      const baseAlias = ensureAlias(baseBranch);
      const branchCreated = new Set<string>([baseAlias]);
      let activeAlias = baseAlias;

      const escapeMermaidString = (value: string) =>
        value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      const formatCommitLabel = (oid: string, message: string | undefined) => {
        const shortOid = oid.slice(0, 7);
        const normalized = (message ?? '').replace(/[\r\n]+/g, ' ').trim();
        const truncated = normalized.length > 60 ? `${normalized.slice(0, 57)}…` : normalized;
        const rawTag = truncated ? `${shortOid} ${truncated}` : shortOid;
        return { id: shortOid, tag: escapeMermaidString(rawTag) };
      };

      const commandLines: string[] = [];
      const legendLines: string[] = [
        `  %% 生成日時: ${timestamp}`,
        `  %% ブランチ数: ${branches.length}`,
        `  %% 表示深さ: ${depth}`,
      ];

      for (const oid of ordered) {
        const node = commitMap.get(oid);
        if (!node) {
          continue;
        }

        const assignedBranch = commitBranch.get(oid) ?? baseBranch;
        const branchAliasValue = ensureAlias(assignedBranch);
        const parents = node.entry.commit.parent ?? [];
        const firstParent = parents.find((parentOid) => commitMap.has(parentOid)) ?? null;
        const parentBranchName = firstParent
          ? commitBranch.get(firstParent) ?? assignedBranch
          : assignedBranch;
        const parentAlias = ensureAlias(parentBranchName);

        if (!branchCreated.has(branchAliasValue)) {
          if (branchAliasValue !== baseAlias) {
            if (!branchCreated.has(parentAlias)) {
              branchCreated.add(parentAlias);
              commandLines.push(`  branch ${parentAlias}`);
            }
            if (activeAlias !== parentAlias) {
              commandLines.push(`  checkout ${parentAlias}`);
              activeAlias = parentAlias;
            }
            commandLines.push(`  branch ${branchAliasValue}`);
          }
          branchCreated.add(branchAliasValue);
        }

        if (activeAlias !== branchAliasValue) {
          commandLines.push(`  checkout ${branchAliasValue}`);
          activeAlias = branchAliasValue;
        }

        const { id, tag } = formatCommitLabel(oid, node.entry.commit.message);

        if (parents.length > 1) {
          const mergeParent = parents.slice(1).find((parentOid) => commitMap.has(parentOid)) ?? null;
          if (mergeParent) {
            const mergeBranchName = commitBranch.get(mergeParent) ?? baseBranch;
            const mergeAlias = ensureAlias(mergeBranchName);
            if (!branchCreated.has(mergeAlias)) {
              branchCreated.add(mergeAlias);
              commandLines.push(`  branch ${mergeAlias}`);
            }
            if (activeAlias !== branchAliasValue) {
              commandLines.push(`  checkout ${branchAliasValue}`);
              activeAlias = branchAliasValue;
            }
            commandLines.push(`  merge ${mergeAlias} id: "${id}" tag: "${tag}"`);

            if (parents.length > 2) {
              legendLines.push(
                `  %% コミット ${id} は追加のマージ親 (${parents.length - 2} 件) を持ちます`,
              );
            }
            continue;
          }
        }

        commandLines.push(`  commit id: "${id}" tag: "${tag}"`);
      }

      aliasLegend.forEach((branchName, alias) => {
        legendLines.push(`  %% ${alias} => ${branchName}`);
      });

      const diagramLines = ['gitGraph LR', ...legendLines, ...commandLines];
      const branchAliasRecord: Record<string, string> = {};
      aliasLegend.forEach((branchName, alias) => {
        branchAliasRecord[branchName] = alias;
      });

      return {
        diagram: diagramLines.join('\n'),
        branchAliases: branchAliasRecord,
        branchCount: branches.length,
        commitCount: ordered.length,
        depth,
        generatedAt: timestamp,
      } satisfies GitFlowMermaidResult;
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
      const http = await loadGitHttpClient();

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
