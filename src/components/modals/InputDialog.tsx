
/**
 * InputDialog.tsx
 * このファイルは、ファイル名や値の入力・バリデーション・拡張子選択などを行うダイアログ型Reactコンポーネントです。
 * 主な機能:
 * - ファイル名や値の入力
 * - バリデーション
 * - 拡張子選択
 * - ダイアログの表示/非表示制御
 */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { IoCloseOutline } from 'react-icons/io5';

interface InputDialogProps {
  title: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  validateInput?: (value: string) => string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  isOpen: boolean;
  showExtensionSelect?: boolean;
  extensions?: string[];
}

/**
 * InputDialogコンポーネント
 * ファイル名や値の入力・バリデーション・拡張子選択などを行うダイアログ。
 * - ファイル名や値の入力
 * - バリデーション
 * - 拡張子選択
 * - ダイアログの表示/非表示制御
 * @param title ダイアログタイトル
 * @param label 入力ラベル
 * @param placeholder プレースホルダー
 * @param initialValue 初期値
 * @param validateInput 入力バリデーション関数
 * @param onConfirm 確定時コールバック
 * @param onCancel キャンセル時コールバック
 * @param isOpen 表示状態
 * @param showExtensionSelect 拡張子選択表示
 * @param extensions 拡張子リスト
 */
const InputDialog: React.FC<InputDialogProps> = ({
  title,
  label,
  placeholder = '',
  initialValue = '',
  validateInput,
  onConfirm,
  onCancel,
  isOpen,
  showExtensionSelect = false,
  extensions = ['md', 'txt', 'json', 'csv', 'tsv', 'yaml', 'html', 'js', 'ts', 'css']
}) => {
  const [inputValue, setInputValue] = useState(initialValue);
  const [selectedExtension, setSelectedExtension] = useState('md');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // ファイル名と拡張子を分離する
  useEffect(() => {
    if (isOpen && initialValue) {
      const parts = initialValue.split('.');
      if (parts.length > 1) {
        const ext = parts.pop() || '';
        const name = parts.join('.');
        if (extensions.includes(ext.toLowerCase())) {
          setSelectedExtension(ext.toLowerCase());
          setInputValue(name);
        } else {
          setInputValue(initialValue);
        }
      } else {
        setInputValue(initialValue);
      }
    }
  }, [isOpen, initialValue, extensions]);
  
  // ダイアログが開いたとき、入力欄にフォーカスとセレクト
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      
      // 初期値をセット
      setInputValue(initialValue);
      setError(null);
    }
  }, [isOpen, initialValue]);
  
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
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    
    // 入力値のバリデーション
    if (validateInput) {
      const valueToValidate = showExtensionSelect 
        ? `${e.target.value}.${selectedExtension}`
        : e.target.value;
      const validationError = validateInput(valueToValidate);
      setError(validationError);
    }
  };
  
  const handleExtensionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedExtension(e.target.value);
    
    // 拡張子が変わったらバリデーションを再実行
    if (validateInput) {
      const valueToValidate = `${inputValue}.${e.target.value}`;
      const validationError = validateInput(valueToValidate);
      setError(validationError);
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // ファイル名と拡張子を結合
    const finalValue = showExtensionSelect 
      ? `${inputValue}.${selectedExtension}`
      : inputValue;
    
    // 再度バリデーション
    if (validateInput) {
      const validationError = validateInput(finalValue);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    
    onConfirm(finalValue);
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-96 max-w-full">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium">{title}</h3>
          <button
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={onCancel}
          >
            <IoCloseOutline size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {label}
            </label>
            
            <div className={`flex ${showExtensionSelect ? 'space-x-2' : ''}`}>
              <input
                ref={inputRef}
                type="text"
                className={`w-full p-2 border rounded-md dark:bg-gray-700 dark:text-white dark:border-gray-600 ${
                  error ? 'border-red-500 dark:border-red-500' : 'border-gray-300'
                }`}
                value={inputValue}
                onChange={handleInputChange}
                placeholder={placeholder}
              />
              
              {showExtensionSelect && (
                <div className="flex items-center">
                  <span className="mx-1 text-gray-500 dark:text-gray-400">.</span>
                  <select
                    className="p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    value={selectedExtension}
                    onChange={handleExtensionChange}
                  >
                    {extensions.map(ext => (
                      <option key={ext} value={ext}>{ext}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            
            {error && (
              <p className="mt-1 text-sm text-red-500">{error}</p>
            )}
          </div>
          
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={onCancel}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className={`px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 ${
                error ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={!!error}
            >
              確認
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InputDialog;
