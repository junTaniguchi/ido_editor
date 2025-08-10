
/**
 * ConfirmDialog.tsx
 * このファイルは、削除・保存・重要操作時の確認ダイアログを表示するReactコンポーネントです。
 * 主な機能:
 * - 操作確認ダイアログ表示
 * - ESCキーでキャンセル
 * - 破壊的操作の警告
 */
'use client';

import React, { useEffect } from 'react';
import { IoAlertCircleOutline, IoCloseOutline } from 'react-icons/io5';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

/**
 * ConfirmDialogコンポーネント
 * 削除・保存・重要操作時の確認ダイアログを表示する。
 * - 操作確認ダイアログ表示
 * - ESCキーでキャンセル
 * - 破壊的操作の警告
 * @param title ダイアログタイトル
 * @param message メッセージ
 * @param confirmLabel 確認ボタンラベル
 * @param cancelLabel キャンセルボタンラベル
 * @param isDestructive 破壊的操作か
 * @param onConfirm 確認時コールバック
 * @param onCancel キャンセル時コールバック
 * @param isOpen 表示状態
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = '確認',
  cancelLabel = 'キャンセル',
  isDestructive = false,
  onConfirm,
  onCancel,
  isOpen
}) => {
  // ESCキーでキャンセル
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-96 max-w-full">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            {isDestructive && (
              <IoAlertCircleOutline className="text-red-500 mr-2" size={24} />
            )}
            <h3 className="text-lg font-medium">{title}</h3>
          </div>
          <button
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={onCancel}
          >
            <IoCloseOutline size={24} />
          </button>
        </div>
        
        <div className="p-4">
          <p className="text-gray-700 dark:text-gray-300">{message}</p>
        </div>
        
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm text-white rounded-md ${
              isDestructive 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
