export type GitFileStatus = 'unmodified' | 'modified' | 'deleted' | 'added' | 'untracked' | 'absent';

export type GitAssistIntent = 'commit-summary' | 'review-comments';

export type GitAssistDiffScope = 'staged' | 'worktree' | 'all';

export interface GitAssistFileDiff {
  path: string;
  worktreeStatus: GitFileStatus;
  stagedStatus: GitFileStatus;
  isStaged: boolean;
  isUntracked: boolean;
  diff: string | null;
  isBinary: boolean;
  headSize: number | null;
  worktreeSize: number | null;
}

export type GitAssistSkipReason = 'sensitive' | 'error';

export interface GitAssistSkippedFile {
  path: string;
  reason: GitAssistSkipReason;
  message?: string;
}

export interface GitAssistDiffPayload {
  branch: string | null;
  scope: GitAssistDiffScope;
  files: GitAssistFileDiff[];
  skipped: GitAssistSkippedFile[];
}

export interface GitAssistRequestPayload {
  intent: GitAssistIntent;
  branch?: string | null;
  commitPurpose?: string | null;
  diff: GitAssistDiffPayload;
}

export interface GitAssistModelResponse {
  intent: GitAssistIntent;
  commitMessage?: string | null;
  summary?: string[] | null;
  reviewComments?: string[] | null;
  warnings?: string[] | null;
}

export type GitAssistApiResponse = GitAssistModelResponse;
