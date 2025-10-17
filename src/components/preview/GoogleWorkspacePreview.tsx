'use client';

import React from 'react';
import { IoOpenOutline, IoWarningOutline } from 'react-icons/io5';
import type { GoogleWorkspaceInfo, GoogleWorkspaceFileType } from '@/utils/googleWorkspace';

interface GoogleWorkspacePreviewProps {
  info: GoogleWorkspaceInfo;
  fileType: GoogleWorkspaceFileType;
  fileName: string;
}

const TYPE_LABELS: Record<GoogleWorkspaceFileType, string> = {
  gdoc: 'Googleドキュメント',
  gsheet: 'Googleスプレッドシート',
  gslides: 'Googleスライド',
};

const GoogleWorkspacePreview: React.FC<GoogleWorkspacePreviewProps> = ({ info, fileType, fileName }) => {
  const label = TYPE_LABELS[fileType];
  const embedUrl = info.embedUrl || info.originalUrl || null;
  const externalUrl = info.originalUrl || info.embedUrl || null;
  const title = info.title || fileName || label;

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-900">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {label} をアプリ内でプレビューしています。サインインが必要な場合は外部ブラウザで開いてください。
          </p>
        </div>
        {externalUrl && (
          <a
            className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IoOpenOutline /> 新しいタブで開く
          </a>
        )}
      </div>
      {info.error && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          <IoWarningOutline />
          <span>{info.error}</span>
        </div>
      )}
      <div className="relative flex-1 overflow-hidden bg-gray-100 dark:bg-slate-950">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={title}
            className="h-full w-full border-0"
            allow="clipboard-read; clipboard-write; fullscreen"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-gray-600 dark:text-gray-300">
            <IoWarningOutline className="text-lg" />
            <p>
              プレビュー用の埋め込みURLを取得できませんでした。
              {externalUrl ? ' 上部のボタンから外部ブラウザでファイルを開いてください。' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GoogleWorkspacePreview;
