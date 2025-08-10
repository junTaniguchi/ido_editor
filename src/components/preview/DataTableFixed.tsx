
/**
 * DataTableFixed.tsx
 * このファイルは、CSV/TSV/JSON/YAML/ParquetなどのテーブルデータをWeb上でプレビュー表示するためのReactコンポーネント（Fixed版）を提供します。
 * 主な機能:
 * - 列選択・表示/非表示切り替え
 * - ネスト構造データの表示
 * - ページネーション
 * - カラム幅調整
 */
'use client';

import React, { useMemo, useState, useRef } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  ColumnDef,
  VisibilityState,
} from '@tanstack/react-table';
import { IoCaretDown, IoCaretUp, IoEyeOutline, IoEyeOffOutline, IoOptionsOutline, IoGrid } from 'react-icons/io5';
import ObjectViewer from './ObjectViewer';

interface DataTableFixedProps {
  data: any[];
  columns: string[];
  isNested?: boolean; // ネスト構造を保持するモード
  showColumnSelector?: boolean;
  onColumnSelectorChange?: (show: boolean) => void;
}

/**
 * DataTableFixedコンポーネント
 * テーブルデータをプレビュー表示するための汎用コンポーネント（Fixed版）。
 * - 列の表示/非表示切り替え
 * - ネスト構造データの可視化
 * - ページネーション
 * - カラム幅調整
 * @param data 表示対象のデータ配列
 * @param columns テーブルの列名配列
 * @param isNested ネスト構造表示モード
 * @param showColumnSelector 列セレクター表示状態
 * @param onColumnSelectorChange 列セレクター表示状態変更コールバック
 */
const DataTableFixed: React.FC<DataTableFixedProps> = ({ 
  data, 
  columns, 
  isNested = false,
  showColumnSelector: externalShowColumnSelector,
  onColumnSelectorChange
}) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageSize, setPageSize] = useState<number>(15);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [internalShowColumnSelector, setInternalShowColumnSelector] = useState(false);
  
  // 外部からコントロールされるかローカル状態を使用
  const showColumnSelector = externalShowColumnSelector !== undefined 
    ? externalShowColumnSelector 
    : internalShowColumnSelector;
  
  const toggleColumnSelector = () => {
    if (onColumnSelectorChange) {
      onColumnSelectorChange(!showColumnSelector);
    } else {
      setInternalShowColumnSelector(!internalShowColumnSelector);
    }
  };
  
  // 列のリサイズ用の状態
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingColumnRef = useRef<{ id: string, startX: number, startWidth: number } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  
  const columnHelper = createColumnHelper<any>();
  
  const tableColumns = useMemo(
    () => columns.map(col => columnHelper.accessor(col, {
      header: col,
      size: columnWidths[col] || 150, // デフォルト幅を設定
      cell: info => {
        const value = info.getValue();
        if (value === null || value === undefined) {
          return <span className="text-gray-400">-</span>;
        }
        
        // オブジェクト型またはネスト構造の表示
        if (typeof value === 'object') {
          if (isNested) {
            return (
              <div className="max-w-xs overflow-hidden">
                <ObjectViewer data={value} expandByDefault={false} expandLevel={0} compactMode={true} />
              </div>
            );
          } else {
            return (
              <span className="text-blue-600 dark:text-blue-400 cursor-help" title={JSON.stringify(value)}>
                {JSON.stringify(value).substring(0, 50) + (JSON.stringify(value).length > 50 ? '...' : '')}
              </span>
            );
          }
        }
        
        // 配列の表示
        if (Array.isArray(value)) {
          if (isNested) {
            return (
              <div className="max-w-xs overflow-hidden">
                <ObjectViewer data={value} expandByDefault={false} expandLevel={0} compactMode={true} />
              </div>
            );
          } else {
            return (
              <span className="text-blue-600 dark:text-blue-400 cursor-help" title={JSON.stringify(value)}>
                [{value.length}] {JSON.stringify(value).substring(0, 50) + (JSON.stringify(value).length > 50 ? '...' : '')}
              </span>
            );
          }
        }
        
        return String(value);
      },
    })),
    [columns, columnHelper, isNested, columnWidths]
  );
  
  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      pagination: {
        pageIndex: 0,
        pageSize,
      },
      columnVisibility,
    },
  });
  
  // 列のリサイズ処理
  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>, columnId: string) => {
    if (!tableRef.current) return;
    
    // 現在の列の幅を取得
    const headerCell = tableRef.current.querySelector(`th[data-column-id="${columnId}"]`);
    if (!headerCell) return;
    
    const currentWidth = headerCell.getBoundingClientRect().width;
    
    // リサイズ開始状態を設定
    resizingColumnRef.current = {
      id: columnId,
      startX: e.clientX,
      startWidth: currentWidth
    };
    
    // マウスムーブとマウスアップイベントを追加
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };
  
  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingColumnRef.current) return;
    
    const { id, startX, startWidth } = resizingColumnRef.current;
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + deltaX); // 最小幅を50pxに制限
    
    setColumnWidths(prev => ({
      ...prev,
      [id]: newWidth
    }));
  };
  
  const handleResizeEnd = () => {
    resizingColumnRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };
  
  // 列の表示・非表示を切り替えるドロップダウンメニュー
  const renderColumnSelector = () => {
    if (!showColumnSelector) return null;
    
    return (
      <div className="absolute top-10 right-0 mt-2 w-64 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10">
        <div className="py-1 px-2 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
          表示する列を選択
        </div>
        <div className="py-1 max-h-60 overflow-y-auto">
          {table.getAllLeafColumns().map(column => {
            const isVisible = column.getIsVisible();
            
            return (
              <div 
                key={column.id} 
                className="px-4 py-2 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                onClick={() => {
                  column.toggleVisibility(!isVisible);
                }}
              >
                <div className="flex items-center">
                  <span className="w-6">
                    {isVisible ? (
                      <IoEyeOutline className="text-blue-500" />
                    ) : (
                      <IoEyeOffOutline className="text-gray-400" />
                    )}
                  </span>
                  <span className="ml-2">{column.id}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {isVisible ? '表示中' : '非表示'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  if (!data.length) {
    return (
      <div className="text-center p-4 text-gray-500">
        データがありません
      </div>
    );
  }
  
  return (
    <div className="overflow-auto">
      <div className="flex justify-end mb-2 relative">
        <button
          className="px-2 py-1 flex items-center text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          onClick={toggleColumnSelector}
        >
          <IoOptionsOutline className="mr-1" />
          列の表示設定
        </button>
        {renderColumnSelector()}
      </div>
      
      <div className="overflow-auto max-h-[calc(100vh-200px)]">
        <table ref={tableRef} className="min-w-full divide-y divide-gray-300 dark:divide-gray-700 border-collapse">
          <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const columnId = header.column.id;
                  
                  return (
                    <th
                      key={header.id}
                      data-column-id={columnId}
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none relative bg-gray-100 dark:bg-gray-800"
                      style={{ width: columnWidths[columnId] || 'auto' }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {header.column.getIsSorted() === 'asc' ? (
                          <IoCaretUp className="ml-1 text-blue-500" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <IoCaretDown className="ml-1 text-blue-500" />
                        ) : (
                          <span className="ml-1 text-gray-300 dark:text-gray-700">⇅</span>
                        )}
                      </div>
                      {/* リサイズハンドル */}
                      <div
                        className="absolute right-0 top-0 h-full w-4 bg-transparent cursor-col-resize group"
                        onMouseDown={(e) => handleResizeStart(e, columnId)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="w-px h-full bg-gray-300 dark:bg-gray-700 group-hover:bg-blue-500 group-hover:w-[3px] mx-auto" />
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300"
                    style={{ width: columnWidths[cell.column.id] || 'auto' }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* ページネーション */}
      <div className="p-2 flex items-center justify-between border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center">
          <span className="text-sm text-gray-700 dark:text-gray-400 mr-4">
            ページ{' '}
            <strong>
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </strong>
          </span>
          
          <select
            className="text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded p-1"
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value));
            }}
          >
            {[10, 15, 25, 50, 100].map(size => (
              <option key={size} value={size}>
                {size}行表示
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <button
            className="p-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            ≪ 最初
          </button>
          <button
            className="p-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            前へ
          </button>
          <button
            className="p-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            次へ
          </button>
          <button
            className="p-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            最後 ≫
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataTableFixed;
