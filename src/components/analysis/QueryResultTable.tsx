'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { 
  createColumnHelper, 
  flexRender, 
  getCoreRowModel, 
  getPaginationRowModel, 
  useReactTable, 
  VisibilityState, 
  SortingState, 
  getSortedRowModel 
} from '@tanstack/react-table';
import { 
  IoCaretDown, 
  IoCaretUp, 
  IoEyeOutline, 
  IoEyeOffOutline, 
  IoOptionsOutline,
  IoDownloadOutline,
  IoEllipsisVertical 
} from 'react-icons/io5';
import ObjectViewer from '@/components/preview/ObjectViewer';
import { convertDataToFormat, downloadData } from '@/lib/dataAnalysisUtils';

interface QueryResultTableProps {
  data: any[];
}

const QueryResultTable: React.FC<QueryResultTableProps> = ({ data }) => {
  const { editorSettings } = useEditorStore();
  const isNested = editorSettings.dataDisplayMode === 'nested';

  // 状態管理
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(0);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  
  // ダウンロード処理
  const handleDownload = (format: 'json' | 'csv' | 'tsv' | 'yaml') => {
    try {
      // データを指定のフォーマットに変換
      const convertedData = convertDataToFormat(data, format);
      
      // ファイル名と MIME タイプを設定
      let filename = `query_result.${format}`;
      let mimeType = 'text/plain';
      
      switch (format) {
        case 'json':
          mimeType = 'application/json';
          break;
        case 'csv':
          mimeType = 'text/csv';
          break;
        case 'tsv':
          mimeType = 'text/tab-separated-values';
          break;
        case 'yaml':
          mimeType = 'application/x-yaml';
          break;
      }
      
      // ダウンロード実行
      downloadData(convertedData, filename, mimeType);
      
      // メニューを閉じる
      setShowDownloadMenu(false);
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      alert(`ダウンロード中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  };
  
  // 列のリサイズ用の状態
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const tableRef = useRef<HTMLTableElement>(null);
  const resizingColumnRef = useRef<{ id: string, startX: number, startWidth: number } | null>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const columnSelectorRef = useRef<HTMLDivElement>(null);
  
  // グローバルクリックイベントのハンドラを設定（メニューを閉じる）
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // ダウンロードメニュー外のクリックを検知
      if (showDownloadMenu && 
          downloadMenuRef.current && 
          !downloadMenuRef.current.contains(event.target as Node)) {
        setShowDownloadMenu(false);
      }
      
      // 列選択メニュー外のクリックを検知
      if (showColumnSelector && 
          columnSelectorRef.current && 
          !columnSelectorRef.current.contains(event.target as Node)) {
        setShowColumnSelector(false);
      }
    };
    
    // イベントリスナーを追加
    document.addEventListener('mousedown', handleClickOutside);
    
    // クリーンアップ
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDownloadMenu, showColumnSelector]);

  // 列の定義
  const columnHelper = createColumnHelper<any>();
  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const resultColumns = Object.keys(data[0]);
    return resultColumns.map(col => columnHelper.accessor(col, {
      header: col,
      size: columnWidths[col] || 150, // デフォルト幅を設定
      cell: info => {
        const value = info.getValue();
        
        if (value === null || value === undefined) {
          return <span className="text-gray-400">-</span>;
        }
        
        if (typeof value === 'object') {
          if (isNested) {
            return (
              <div className="w-full max-w-[300px]">
                <ObjectViewer data={value} expandLevel={1} compactMode={true} />
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
        
        return String(value);
      }
    }));
  }, [data, columnHelper, isNested, columnWidths]);

  // テーブルの設定
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      pagination: {
        pageIndex,
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

  // ダウンロードメニューの表示
  const renderDownloadMenu = () => {
    if (!showDownloadMenu) return null;
    
    return (
      <div 
        ref={downloadMenuRef}
        className="absolute top-10 right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10"
      >
        <div className="py-1 px-2 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
          ダウンロード形式を選択
        </div>
        <div className="py-1">
          <button 
            className="px-4 py-2 w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handleDownload('json')}
          >
            JSON形式
          </button>
          <button 
            className="px-4 py-2 w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handleDownload('csv')}
          >
            CSV形式
          </button>
          <button 
            className="px-4 py-2 w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handleDownload('tsv')}
          >
            TSV形式
          </button>
          <button 
            className="px-4 py-2 w-full text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handleDownload('yaml')}
          >
            YAML形式
          </button>
        </div>
      </div>
    );
  };

  // 列の表示・非表示を切り替えるドロップダウンメニュー
  const renderColumnSelector = () => {
    if (!showColumnSelector) return null;
    
    return (
      <div 
        ref={columnSelectorRef}
        className="absolute top-10 right-0 mt-2 w-64 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10"
      >
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

  if (!data || data.length === 0) {
    return <div className="text-center p-4 text-gray-500">データがありません</div>;
  }

  return (
  <div className="overflow-auto max-h-[500px]">
      <div className="flex justify-between mb-2 relative">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
          結果: {data.length}行
        </div>
        <div className="flex space-x-2 relative">
          <button
            className="px-2 py-1 flex items-center text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={() => {
              setShowDownloadMenu(!showDownloadMenu);
              // 他のメニューを閉じる
              setShowColumnSelector(false);
            }}
          >
            <IoDownloadOutline className="mr-1" />
            ダウンロード
          </button>
          {renderDownloadMenu()}
          
          <button
            className="px-2 py-1 flex items-center text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={() => {
              setShowColumnSelector(!showColumnSelector);
              // 他のメニューを閉じる
              setShowDownloadMenu(false);
            }}
          >
            <IoOptionsOutline className="mr-1" />
            列の表示設定
          </button>
          {renderColumnSelector()}
        </div>
      </div>
      
      <table ref={tableRef} className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
        <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const columnId = header.column.id;
                
                return (
                  <th
                    key={header.id}
                    data-column-id={columnId}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none relative"
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
            {[10, 25, 50, 100].map(size => (
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

export default QueryResultTable;
