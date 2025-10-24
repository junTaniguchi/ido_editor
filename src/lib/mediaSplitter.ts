'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { ensureHandlePermission } from '@/lib/fileSystemUtils';

const FFMPEG_CORE_VERSION = '0.12.6';
const FFMPEG_CORE_CDN_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;
const BROWSER_FFMPEG_MAX_INPUT_BYTES = 2 * 1024 ** 3; // 約 2 GiB が現実的な上限

type ProgressStage = 'idle' | 'loading' | 'probing' | 'splitting' | 'collecting';

export interface SplitProgress {
  stage: ProgressStage;
  /** 0-1 の進捗率（取得できる場合のみ） */
  ratio?: number;
  /** 現在の処理時間（秒単位、取得できる場合のみ） */
  time?: number;
  /** 任意の補足メッセージ */
  message?: string;
}

export interface SplitMediaOptions {
  /** 1 ファイルあたりの最大サイズ（バイト） */
  sizeLimitBytes: number;
  /** 1 セグメントの最大長（秒） */
  durationLimitSeconds: number;
  /** 進捗を購読するためのコールバック */
  onProgress?: (progress: SplitProgress) => void;
}

export interface SplitSegment {
  fileName: string;
  file: File;
  size: number;
}

export interface SplitMediaResult {
  segments: SplitSegment[];
  totalDurationSeconds: number | null;
  segmentDurationSeconds: number;
  usedSizeLimitBytes: number;
  usedDurationLimitSeconds: number;
  wasSplitPerformed: boolean;
}

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadingPromise: Promise<void> | null = null;

const getFfmpeg = async (onProgress?: (progress: SplitProgress) => void): Promise<FFmpeg> => {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }

  if (ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  if (!ffmpegLoadingPromise) {
    onProgress?.({ stage: 'loading', message: 'FFmpeg を読み込んでいます…' });

    ffmpegLoadingPromise = ffmpegInstance
      .load({
        coreURL: `${FFMPEG_CORE_CDN_BASE}/ffmpeg-core.js`,
        wasmURL: `${FFMPEG_CORE_CDN_BASE}/ffmpeg-core.wasm`,
        workerURL: `${FFMPEG_CORE_CDN_BASE}/ffmpeg-core.worker.js`,
      })
      .then(() => undefined)
      .catch((error) => {
        console.error('Failed to load ffmpeg-core:', error);
        throw error;
      });
  }

  await ffmpegLoadingPromise;
  ffmpegLoadingPromise = null;
  return ffmpegInstance;
};

const revokeLater = (url: string) => {
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn('Failed to revoke object URL:', error);
    }
  }, 0);
};

const getMediaDuration = (file: File): Promise<number | null> => {
  return new Promise<number | null>((resolve) => {
    const isVideo = file.type.startsWith('video/');
    const element = document.createElement(isVideo ? 'video' : 'audio');
    element.preload = 'metadata';

    const url = URL.createObjectURL(file);
    element.src = url;

    const cleanup = () => {
      element.removeAttribute('src');
      element.load();
      revokeLater(url);
    };

    const handleLoadedMetadata = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : NaN;
      cleanup();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
    };

    const handleError = () => {
      cleanup();
      resolve(null);
    };

    element.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    element.addEventListener('error', handleError, { once: true });

    element.load();
  });
};

const sanitizeForFfmpeg = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const padIndex = (index: number, width = 3): string => {
  return String(index).padStart(width, '0');
};

const formatGiB = (bytes: number): string => {
  return (bytes / 1024 ** 3).toFixed(1);
};

export const splitMediaFile = async (
  file: File,
  options: SplitMediaOptions,
): Promise<SplitMediaResult> => {
  if (!(file instanceof File)) {
    throw new Error('分割対象は File オブジェクトである必要があります');
  }

  const onProgress = options.onProgress;

  if (file.size > BROWSER_FFMPEG_MAX_INPUT_BYTES) {
    const fileSizeGiB = formatGiB(file.size);
    const limitGiB = formatGiB(BROWSER_FFMPEG_MAX_INPUT_BYTES);
    throw new Error(
      `選択したファイルは約 ${fileSizeGiB}GiB あり、ブラウザ版 FFmpeg が扱える目安 (${limitGiB}GiB 前後) を超えています。` +
        ' お手数ですがファイルを再圧縮してサイズを下げるか、デスクトップ版 FFmpeg などをご利用ください。',
    );
  }

  const ffmpeg = await getFfmpeg(onProgress);

  onProgress?.({ stage: 'probing', message: 'メディアの長さを解析しています…' });
  const totalDuration = await getMediaDuration(file);

  const durationLimit = Math.max(1, Math.floor(options.durationLimitSeconds));
  const sizeLimitBytes = Math.max(1024 * 1024, Math.floor(options.sizeLimitBytes));

  let effectiveSegmentDuration = durationLimit;
  if (totalDuration && totalDuration > 0) {
    const averageBytesPerSecond = file.size / totalDuration;
    if (Number.isFinite(averageBytesPerSecond) && averageBytesPerSecond > 0) {
      const maxDurationBySize = sizeLimitBytes / averageBytesPerSecond;
      if (Number.isFinite(maxDurationBySize) && maxDurationBySize > 0) {
        effectiveSegmentDuration = Math.min(effectiveSegmentDuration, Math.floor(maxDurationBySize));
      }
    }
  } else if (file.size > sizeLimitBytes) {
    // 長さを取得できない場合は、サイズ基準のみで分割数を決める
    const estimatedSegments = Math.ceil(file.size / sizeLimitBytes);
    if (estimatedSegments > 0 && Number.isFinite(estimatedSegments)) {
      effectiveSegmentDuration = Math.max(1, Math.floor(durationLimit / estimatedSegments));
    }
  }

  if (!Number.isFinite(effectiveSegmentDuration) || effectiveSegmentDuration < 1) {
    effectiveSegmentDuration = 1;
  }

  const shouldSplitByDuration =
    totalDuration !== null && totalDuration > effectiveSegmentDuration + 0.5;
  const shouldSplitBySize = file.size > sizeLimitBytes;

  const shouldSplit = shouldSplitByDuration || shouldSplitBySize;

  const sanitizedInputName = sanitizeForFfmpeg(file.name);
  const dotIndex = sanitizedInputName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? sanitizedInputName.slice(0, dotIndex) : sanitizedInputName;
  const extension = dotIndex > 0 ? sanitizedInputName.slice(dotIndex + 1) : '';
  const inputName = sanitizedInputName;
  const outputPattern = `${baseName}_%03d.${extension || 'chunk'}`;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
  } catch (error) {
    console.error('Failed to write input file into ffmpeg FS:', error);
    throw new Error('FFmpeg へのファイル転送に失敗しました');
  }

  if (!shouldSplit) {
    // 分割は不要。元ファイルだけを返す。
    await ffmpeg.deleteFile(inputName).catch(() => undefined);
    return {
      segments: [
        {
          fileName: file.name,
          file,
          size: file.size,
        },
      ],
      totalDurationSeconds: totalDuration,
      segmentDurationSeconds: totalDuration ?? effectiveSegmentDuration,
      usedSizeLimitBytes: sizeLimitBytes,
      usedDurationLimitSeconds: durationLimit,
      wasSplitPerformed: false,
    };
  }

  onProgress?.({
    stage: 'splitting',
    message: `FFmpeg で分割しています（${effectiveSegmentDuration} 秒単位）…`,
  });

  const progressHandler = (event: { progress: number; time: number }) => {
    onProgress?.({
      stage: 'splitting',
      ratio: event.progress,
      time: event.time,
    });
  };

  ffmpeg.on('progress', progressHandler);

  try {
    const exitCode = await ffmpeg.exec([
      '-i',
      inputName,
      '-c',
      'copy',
      '-map',
      '0',
      '-f',
      'segment',
      '-segment_time',
      String(Math.max(1, effectiveSegmentDuration)),
      '-reset_timestamps',
      '1',
      outputPattern,
    ]);

    if (exitCode !== 0) {
      throw new Error(`FFmpeg returned exit code ${exitCode}`);
    }
  } catch (error) {
    console.error('FFmpeg execution failed:', error);
    throw new Error('FFmpeg による分割処理に失敗しました');
  } finally {
    ffmpeg.off('progress', progressHandler);

    try {
      await ffmpeg.deleteFile(inputName);
    } catch (cleanupError) {
      console.warn('Failed to remove input file from ffmpeg FS:', cleanupError);
    }
  }

  onProgress?.({ stage: 'collecting', message: '分割ファイルを取得しています…' });

  const segments: SplitSegment[] = [];
  const ffDir = await ffmpeg.listDir('/');

  const targetFiles = ffDir
    .filter((node) => !node.isDir && node.name.startsWith(`${baseName}_`))
    .map((node) => node.name)
    .sort();

  if (targetFiles.length === 0) {
    throw new Error('分割ファイルを取得できませんでした（出力が生成されていません）');
  }

  for (let index = 0; index < targetFiles.length; index += 1) {
    const ffName = targetFiles[index];
    try {
      const data = await ffmpeg.readFile(ffName);
      if (!(data instanceof Uint8Array)) {
        throw new Error('Unexpected data type from ffmpeg.readFile');
      }

      const suffix = padIndex(index + 1);
      const humanFileName = extension
        ? `${baseName}_${suffix}.${extension}`
        : `${baseName}_${suffix}`;

      const blob = new Blob([data], { type: file.type || 'application/octet-stream' });
      const segmentFile = new File([blob], humanFileName, { type: blob.type });

      segments.push({
        fileName: humanFileName,
        file: segmentFile,
        size: segmentFile.size,
      });
    } catch (error) {
      console.error(`Failed to read segment file ${ffName}:`, error);
      throw new Error('分割されたファイルの読み込みに失敗しました');
    } finally {
      try {
        await ffmpeg.deleteFile(ffName);
      } catch (cleanupError) {
        console.warn(`Failed to remove temp segment ${ffName}:`, cleanupError);
      }
    }
  }

  return {
    segments,
    totalDurationSeconds: totalDuration,
    segmentDurationSeconds: effectiveSegmentDuration,
    usedSizeLimitBytes: sizeLimitBytes,
    usedDurationLimitSeconds: durationLimit,
    wasSplitPerformed: true,
  };
};

export const saveSegmentsToDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
  segments: SplitSegment[],
): Promise<{ fileName: string; size: number }[]> => {
  if (!dirHandle) {
    throw new Error('保存先フォルダが指定されていません');
  }

  if (segments.length === 0) {
    return [];
  }

  const hasPermission = await ensureHandlePermission(dirHandle, 'readwrite');
  if (!hasPermission) {
    throw new Error('フォルダへの書き込み権限がありません');
  }

  const saved: { fileName: string; size: number }[] = [];

  for (const segment of segments) {
    try {
      const fileHandle = await dirHandle.getFileHandle(segment.fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(segment.file);
      await writable.close();
      saved.push({ fileName: segment.fileName, size: segment.size });
    } catch (error) {
      console.error(`Failed to save segment ${segment.fileName}:`, error);
      throw new Error(`"${segment.fileName}" の書き込みに失敗しました`);
    }
  }

  return saved;
};
