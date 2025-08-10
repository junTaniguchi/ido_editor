
/**
 * TableWizard.tsx
 * このファイルは、MarkdownテーブルをGUIで作成・挿入するためのウィザード型Reactコンポーネントを提供します。
 * 主な機能:
 * - 行・列数の指定
 * - 列ごとの配置（左/中央/右）指定
 * - Markdownテーブルの挿入
 */
'use client';

import React, { useState } from 'react';
import { IoClose, IoCheckmark } from 'react-icons/io5';

interface TableWizardProps {
  onInsertTable: (rows: number, cols: number, alignment: string[]) => void;
  onClose: () => void;
}

/**
 * TableWizardコンポーネント
 * MarkdownテーブルをGUIで作成・挿入するウィザード。
 * - 行・列数の指定
 * - 列ごとの配置（左/中央/右）指定
 * - Markdownテーブルの挿入
 * @param onInsertTable テーブル挿入コールバック
 * @param onClose ウィザード閉じるコールバック
 */
const TableWizard: React.FC<TableWizardProps> = ({ onInsertTable, onClose }) => {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [alignments, setAlignments] = useState<string[]>([]);

  // 行数の増減
  const incrementRows = () => setRows(prev => Math.min(prev + 1, 20));
  const decrementRows = () => setRows(prev => Math.max(prev - 1, 2));
  
  // 列数の増減
  const incrementCols = () => setCols(prev => Math.min(prev + 1, 10));
  const decrementCols = () => setCols(prev => Math.max(prev - 1, 2));

  // 列の配置を設定
  const setColumnAlignment = (colIndex: number, alignment: string) => {
    const newAlignments = [...(alignments.length ? alignments : Array(cols).fill('left'))];
    newAlignments[colIndex] = alignment;
    setAlignments(newAlignments);
  };

  // 表の挿入
  const handleInsert = () => {
    // デフォルトの配置は左揃え
    const finalAlignments = alignments.length ? alignments : Array(cols).fill('left');
    onInsertTable(rows, cols, finalAlignments);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg w-[500px] max-w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">テーブルウィザード</h3>
          <button 
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={onClose}
          >
            <IoClose size={20} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">行数:</label>
            <div className="flex items-center">
              <button 
                className="px-2 py-1 border rounded-l"
                onClick={decrementRows}
              >
                -
              </button>
              <span className="px-4 py-1 border-t border-b bg-gray-50 dark:bg-gray-700">
                {rows}
              </span>
              <button 
                className="px-2 py-1 border rounded-r"
                onClick={incrementRows}
              >
                +
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">列数:</label>
            <div className="flex items-center">
              <button 
                className="px-2 py-1 border rounded-l"
                onClick={decrementCols}
              >
                -
              </button>
              <span className="px-4 py-1 border-t border-b bg-gray-50 dark:bg-gray-700">
                {cols}
              </span>
              <button 
                className="px-2 py-1 border rounded-r"
                onClick={incrementCols}
              >
                +
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">列の配置:</label>
            <div className="overflow-x-auto">
              <div className="flex space-x-2 min-w-max">
                {Array.from({ length: cols }).map((_, colIndex) => (
                  <div key={colIndex} className="flex flex-col items-center">
                    <span className="text-xs mb-1">列 {colIndex + 1}</span>
                    <div className="flex flex-col space-y-1">
                      <button
                        className={`p-1 rounded ${
                          (!alignments.length && 'left') || alignments[colIndex] === 'left' 
                            ? 'bg-blue-100 dark:bg-blue-900' 
                            : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => setColumnAlignment(colIndex, 'left')}
                        title="左揃え"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M2 3h12v1H2zM2 6h8v1H2zM2 9h12v1H2zM2 12h8v1H2z" />
                        </svg>
                      </button>
                      <button
                        className={`p-1 rounded ${
                          alignments[colIndex] === 'center' 
                            ? 'bg-blue-100 dark:bg-blue-900' 
                            : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => setColumnAlignment(colIndex, 'center')}
                        title="中央揃え"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M2 3h12v1H2zM4 6h8v1H4zM2 9h12v1H2zM4 12h8v1H4z" />
                        </svg>
                      </button>
                      <button
                        className={`p-1 rounded ${
                          alignments[colIndex] === 'right' 
                            ? 'bg-blue-100 dark:bg-blue-900' 
                            : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => setColumnAlignment(colIndex, 'right')}
                        title="右揃え"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M2 3h12v1H2zM6 6h8v1H6zM2 9h12v1H2zM6 12h8v1H6z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="pt-4 border-t flex justify-end space-x-2">
            <button
              className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={handleInsert}
            >
              テーブルを挿入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableWizard;
