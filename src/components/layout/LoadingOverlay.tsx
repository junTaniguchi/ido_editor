'use client';

import React from 'react';
import { IoReloadOutline } from 'react-icons/io5';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, message }) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-5 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900/95">
        <IoReloadOutline className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
        <p className="text-gray-700 dark:text-gray-200">{message ?? '処理を実行しています…'}</p>
      </div>
    </div>
  );
};

export default LoadingOverlay;
