'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IoFolderOpenOutline,
  IoDownloadOutline,
  IoConstructOutline,
  IoCloseOutline,
} from 'react-icons/io5';
import { splitMediaFile, saveSegmentsToDirectory, type SplitProgress } from '@/lib/mediaSplitter';
import { ensureHandlePermission } from '@/lib/fileSystemUtils';

interface MediaSplitPanelProps {
  defaultOutputDirectory?: FileSystemDirectoryHandle | null;
  onRequestClose?: () => void;
}

interface DownloadEntry {
  name: string;
  url: string;
  size: number;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const cleanupDownloadEntries = (entries: DownloadEntry[]) => {
  for (const entry of entries) {
    try {
      URL.revokeObjectURL(entry.url);
    } catch (error) {
      console.warn('Failed to revoke download URL:', error);
    }
  }
};

const MediaSplitPanel: React.FC<MediaSplitPanelProps> = ({
  defaultOutputDirectory = null,
  onRequestClose,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [outputDirectory, setOutputDirectory] = useState<FileSystemDirectoryHandle | null>(
    defaultOutputDirectory ?? null,
  );
  const [sizeLimitMb, setSizeLimitMb] = useState<number>(1024);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<SplitProgress | null>(null);
  const [downloadEntries, setDownloadEntries] = useState<DownloadEntry[]>([]);
  const [saveSummary, setSaveSummary] = useState<{ fileName: string; size: number }[] | null>(null);
  const [splitSummary, setSplitSummary] = useState<{
    wasSplitPerformed: boolean;
    segmentDurationSeconds: number;
    totalDurationSeconds: number | null;
    usedSizeLimitBytes: number;
    usedDurationLimitSeconds: number;
  } | null>(null);

  useEffect(() => {
    if (!outputDirectory && defaultOutputDirectory) {
      setOutputDirectory(defaultOutputDirectory);
    }
  }, [defaultOutputDirectory, outputDirectory]);

  useEffect(() => {
    return () => {
      cleanupDownloadEntries(downloadEntries);
    };
  }, [downloadEntries]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setErrorMessage(null);
    setStatusMessage(null);
    setSplitSummary(null);
    setSaveSummary(null);
    cleanupDownloadEntries(downloadEntries);
    setDownloadEntries([]);
  }, [downloadEntries]);

  const handleUseWorkspaceRoot = useCallback(async () => {
    if (!defaultOutputDirectory) {
      setErrorMessage('ワークスペースのルートディレクトリが未設定です');
      return;
    }
    try {
      const granted = await ensureHandlePermission(defaultOutputDirectory, 'readwrite');
      if (!granted) {
        setErrorMessage('ワークスペースフォルダへの書き込み権限がありません');
        return;
      }
      setOutputDirectory(defaultOutputDirectory);
      setErrorMessage(null);
    } catch (error) {
      console.error('Failed to use workspace root:', error);
      setErrorMessage('ワークスペースフォルダのアクセスに失敗しました');
    }
  }, [defaultOutputDirectory]);

  const handlePickDirectory = useCallback(async () => {
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      setErrorMessage('このブラウザはディレクトリ選択に対応していません');
      return;
    }
    try {
      const picker = window as typeof window & {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
      };
      const handle = await picker.showDirectoryPicker?.();
      if (!handle) {
        return;
      }
      const granted = await ensureHandlePermission(handle, 'readwrite');
      if (!granted) {
        setErrorMessage('選択したフォルダへの書き込み権限がありません');
        return;
      }
      setOutputDirectory(handle);
      setErrorMessage(null);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        return;
      }
      console.error('Failed to pick directory:', error);
      setErrorMessage('フォルダの選択に失敗しました');
    }
  }, []);

  const handleSplit = useCallback(async () => {
    if (!selectedFile) {
      setErrorMessage('分割する音声/動画ファイルを選択してください');
      return;
    }

    if (!Number.isFinite(sizeLimitMb) || sizeLimitMb <= 0) {
      setErrorMessage('サイズ上限は 1MB 以上で指定してください');
      return;
    }

    if (!Number.isFinite(timeLimitMinutes) || timeLimitMinutes <= 0) {
      setErrorMessage('時間上限は 1 分以上で指定してください');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('分割処理を開始します…');
    setProgress(null);
    setSaveSummary(null);
    setSplitSummary(null);
    cleanupDownloadEntries(downloadEntries);
    setDownloadEntries([]);

    try {
      const result = await splitMediaFile(selectedFile, {
        sizeLimitBytes: sizeLimitMb * 1024 * 1024,
        durationLimitSeconds: timeLimitMinutes * 60,
        onProgress: (progressState) => {
          setProgress(progressState);
          if (progressState.message) {
            setStatusMessage(progressState.message);
          }
        },
      });

      setSplitSummary({
        wasSplitPerformed: result.wasSplitPerformed,
        segmentDurationSeconds: result.segmentDurationSeconds,
        totalDurationSeconds: result.totalDurationSeconds,
        usedSizeLimitBytes: result.usedSizeLimitBytes,
        usedDurationLimitSeconds: result.usedDurationLimitSeconds,
      });

      const downloads = result.segments.map(({ file, fileName }) => ({
        name: fileName,
        url: URL.createObjectURL(file),
        size: file.size,
      }));
      setDownloadEntries(downloads);

      if (outputDirectory) {
        const saved = await saveSegmentsToDirectory(outputDirectory, result.segments);
        setSaveSummary(saved);
        setStatusMessage(
          `分割結果をフォルダ「${outputDirectory.name}」に保存しました（${saved.length}件）。`,
        );
      } else {
        setStatusMessage(
          result.wasSplitPerformed
            ? '分割が完了しました。必要に応じて個別にダウンロードしてください。'
            : 'ファイルは設定した上限を超えていないため、分割は行われませんでした。',
        );
      }
    } catch (error) {
      console.error('Failed to split media file:', error);
      const message = error instanceof Error ? error.message : 'メディアの分割に失敗しました';
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  }, [downloadEntries, outputDirectory, selectedFile, sizeLimitMb, timeLimitMinutes]);

  const directoryLabel = useMemo(() => {
    if (!outputDirectory) {
      return '未選択';
    }
    return outputDirectory.name || '(名称未設定フォルダ)';
  }, [outputDirectory]);

  const totalDownloadSize = useMemo(() => {
    return downloadEntries.reduce((sum, entry) => sum + entry.size, 0);
  }, [downloadEntries]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">音声・動画ファイルの分割</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            デフォルトでは 1GB / 50 分を超える場合に自動で分割し、出力ファイル名の末尾に通番を付与します。
          </p>
        </div>
        {onRequestClose && (
          <button
            type="button"
            className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            onClick={() => onRequestClose()}
            disabled={isProcessing}
            aria-label="パネルを閉じる"
          >
            <IoCloseOutline size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">対象ファイル</h3>
            <label className="block">
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={handleFileChange}
                disabled={isProcessing}
                className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
              />
            </label>
            {selectedFile && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                選択中: {selectedFile.name}（{formatBytes(selectedFile.size)}）
              </p>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                サイズ上限 (MB)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={sizeLimitMb}
                onChange={(event) => setSizeLimitMb(Number(event.target.value))}
                disabled={isProcessing}
                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                指定サイズを超えないようセグメント化します（既定: 1024MB）。
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                時間上限 (分)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={timeLimitMinutes}
                onChange={(event) => setTimeLimitMinutes(Number(event.target.value))}
                disabled={isProcessing}
                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                超過時に分割する区切り時間です（既定: 50 分）。
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">保存先フォルダ</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                選択中: {directoryLabel}
              </span>
              <button
                type="button"
                onClick={handlePickDirectory}
                disabled={isProcessing}
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                <IoFolderOpenOutline className="mr-1" />
                フォルダを選択
              </button>
              {defaultOutputDirectory && (
                <button
                  type="button"
                  onClick={handleUseWorkspaceRoot}
                  disabled={isProcessing}
                  className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <IoConstructOutline className="mr-1" />
                  ワークスペースのルートを使用
                </button>
              )}
              <p className="w-full text-xs text-gray-500 dark:text-gray-400">
                保存先を選ばない場合は、分割後のファイルを個別にダウンロードできます。
              </p>
            </div>
          </section>

          {errorMessage && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/60 dark:bg-red-900/30 dark:text-red-200">
              {errorMessage}
            </div>
          )}

          {statusMessage && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-500/60 dark:bg-blue-900/30 dark:text-blue-200">
              {statusMessage}
            </div>
          )}

          {isProcessing && (
            <div className="flex items-center space-x-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span>
                {progress?.stage === 'splitting'
                  ? 'FFmpeg 処理中…'
                  : progress?.stage === 'loading'
                  ? 'FFmpeg 読み込み中…'
                  : '処理を実行しています…'}
              </span>
              {progress?.ratio !== undefined && (
                <span className="text-xs text-gray-400">
                  {Math.round(progress.ratio * 100)}%
                </span>
              )}
            </div>
          )}

          {splitSummary && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <p>
                処理結果:
                {splitSummary.wasSplitPerformed ? ' 分割を実行しました。' : ' 分割は不要と判断しました。'}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>指定サイズ上限: {formatBytes(splitSummary.usedSizeLimitBytes)}</li>
                <li>指定時間上限: {splitSummary.usedDurationLimitSeconds} 秒</li>
                {splitSummary.totalDurationSeconds !== null && (
                  <li>推定元ファイル長: 約 {Math.round(splitSummary.totalDurationSeconds)} 秒</li>
                )}
                <li>使用した区切り時間: {splitSummary.segmentDurationSeconds} 秒</li>
              </ul>
            </div>
          )}

          {downloadEntries.length > 0 && (
            <section className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  分割結果（{downloadEntries.length} ファイル / 合計 {formatBytes(totalDownloadSize)}）
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  フォルダ保存済みのファイルも再ダウンロードできます
                </span>
              </div>
              <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                {downloadEntries.map((entry) => (
                  <li
                    key={entry.name}
                    className="flex items-center justify-between rounded border border-gray-100 px-2 py-1 text-sm dark:border-gray-700"
                  >
                    <span className="truncate text-gray-700 dark:text-gray-200" title={entry.name}>
                      {entry.name}
                    </span>
                    <div className="ml-3 flex items-center space-x-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatBytes(entry.size)}
                      </span>
                      <a
                        href={entry.url}
                        download={entry.name}
                        className="inline-flex items-center rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
                      >
                        <IoDownloadOutline className="mr-1" />
                        ダウンロード
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {saveSummary && saveSummary.length > 0 && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-500/60 dark:bg-green-900/30 dark:text-green-200">
              {saveSummary.length} 件のファイルを保存しました。
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
        {onRequestClose && (
          <button
            type="button"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            onClick={() => onRequestClose()}
            disabled={isProcessing}
          >
            パネルを閉じる
          </button>
        )}
        <button
          type="button"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          onClick={handleSplit}
          disabled={isProcessing}
        >
          分割を実行
        </button>
      </div>
    </div>
  );
};

export default MediaSplitPanel;

