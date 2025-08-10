
/**
 * ファイル名: ContextMenu.tsx
 * 機能: ファイル/フォルダの右クリック時に表示されるコンテキストメニュー。新規作成・名前変更・削除・更新などの操作を提供。
 */
'use client';

import React, { useEffect, useRef } from 'react';
import { 
  IoAddOutline, 
  IoCreateOutline, 
  IoTrashOutline, 
  IoFolderOutline, 
  IoDocumentOutline, 
  IoReloadOutline,
  IoReturnUpForwardOutline
} from 'react-icons/io5';
import { useEditorStore } from '@/store/editorStore';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  isFile: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ 
/**
 * ContextMenuコンポーネント
 * ファイル/フォルダの右クリック時に表示されるメニュー。各種操作（新規作成・名前変更・削除・更新）を実行する。
 * @param x メニュー表示位置（X座標）
 * @param y メニュー表示位置（Y座標）
 * @param onClose メニューを閉じるコールバック
 * @param onCreateFile 新規ファイル作成コールバック
 * @param onCreateFolder 新規フォルダ作成コールバック
 * @param onRename 名前変更コールバック
 * @param onDelete 削除コールバック
 * @param onRefresh 更新コールバック
 * @param isFile ファイルかフォルダかの判定
 */
  x, 
  y, 
  onClose, 
  onCreateFile, 
  onCreateFolder, 
  onRename, 
  onDelete,
  onRefresh,
  isFile 
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  
  // メニュー外クリックでクローズ
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    // Escキーでクローズ
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);
  
  // 画面外にはみ出す場合は位置を調整
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const menuWidth = rect.width;
      const menuHeight = rect.height;
      
      // 右側がはみ出す場合
      if (x + menuWidth > window.innerWidth) {
        menuRef.current.style.left = `${window.innerWidth - menuWidth - 5}px`;
      } else {
        menuRef.current.style.left = `${x}px`;
      }
      
      // 下側がはみ出す場合
      if (y + menuHeight > window.innerHeight) {
        menuRef.current.style.top = `${window.innerHeight - menuHeight - 5}px`;
      } else {
        menuRef.current.style.top = `${y}px`;
      }
    }
  }, [x, y]);
  
  // メニュー項目のクリックハンドラ
  const handleAction = (action: () => void) => {
    action();
    onClose();
  };
  
  return (
    <div 
      ref={menuRef}
      className="fixed z-50 w-52 bg-white dark:bg-gray-800 shadow-lg rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden"
      style={{ left: x, top: y }}
    >
      <div className="py-1">
        {!isFile && (
          <button
            className="w-full px-4 py-2 text-left flex items-center hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handleAction(onCreateFile)}
          >
            <IoDocumentOutline className="mr-2" />
            新規ファイル
          </button>
        )}
        
        {!isFile && (
          <button
            className="w-full px-4 py-2 text-left flex items-center hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handleAction(onCreateFolder)}
          >
            <IoFolderOutline className="mr-2" />
            新規フォルダ
          </button>
        )}
        
        <button
          className="w-full px-4 py-2 text-left flex items-center hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={() => handleAction(onRename)}
        >
          <IoCreateOutline className="mr-2" />
          {isFile ? 'ファイル名変更' : 'フォルダ名変更'}
        </button>
        
        <button
          className="w-full px-4 py-2 text-left flex items-center hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400"
          onClick={() => handleAction(onDelete)}
        >
          <IoTrashOutline className="mr-2" />
          {isFile ? 'ファイルを削除' : 'フォルダを削除'}
        </button>
        
        <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
        
        <button
          className="w-full px-4 py-2 text-left flex items-center hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={() => handleAction(onRefresh)}
        >
          <IoReloadOutline className="mr-2" />
          更新
        </button>
      </div>
    </div>
  );
};

export default ContextMenu;
