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
import { IoCaretDown, IoCaretUp, IoEyeOutline, IoEyeOffOutline, IoOptionsOutline, IoAdd, IoTrash, IoSave } from 'react-icons/io5';
import ObjectViewer from '@/components/preview/ObjectViewer';

interface EditableQueryResultTableProps {
  data: any[];
  onDataChange?: (newData: any[]) => void;
  onSave?: (newData: any[]) => void;
  editable?: boolean;
}

const EditableQueryResultTable: React.FC<EditableQueryResultTableProps> = ({ 
  data, 
  onDataChange,
  onSave,
  editable = false
}) => {
  const { editorSettings } = useEditorStore();
  const isNested = editorSettings.dataDisplayMode === 'nested';

  // 状態管理
  const [tableData, setTableData] = useState<any[]>([...data]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(0);
  const [editingCell, setEditingCell] = useState<{rowIndex: number, columnId: string} | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  
  // 列のリサイズ用の状態
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingColumnRef = useRef<{ id: string, startX: number, startWidth: number } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // データが変更されたときにテーブルデータを更新
  useEffect(() => {
    setTableData([...data]);
  }, [data]);
  
  // 親コンポーネントにデータの変更を通知
  useEffect(() => {
    if (onDataChange) {
      onDataChange(tableData);
    }
  }, [tableData, onDataChange]);
  
  // 編集入力フィールドにフォーカスを当てる
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingCell]);

  // 列の定義
  const columnHelper = createColumnHelper<any>();

  // 選択列を追加
  const selectionColumn = useMemo(
    () => columnHelper.display({
      id: 'selection',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={selectedRows.size === tableData.length && tableData.length > 0}
          onChange={(e) => {
            if (e.target.checked) {
              // すべての行を選択
              const allRows = new Set<number>();
              tableData.forEach((_, index) => allRows.add(index));
              setSelectedRows(allRows);
            } else {
              // すべての選択を解除
              setSelectedRows(new Set());
            }
          }}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-700"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedRows.has(row.index)}
          onChange={(e) => {
            const newSelectedRows = new Set(selectedRows);
            if (e.target.checked) {
              newSelectedRows.add(row.index);
            } else {
              newSelectedRows.delete(row.index);
            }
            setSelectedRows(newSelectedRows);
          }}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-700"
        />
      ),
      size: 40,
    }),
    [columnHelper, selectedRows, tableData.length]
  );
  
  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // 編集可能モードの場合は選択列を追加
    const tableColumns = editable 
      ? [selectionColumn]
      : [];
    
    const resultColumns = Object.keys(data[0]);
    const dataColumns = resultColumns.map(col => columnHelper.accessor(col, {
      header: col,
      size: columnWidths[col] || 150, // デフォルト幅を設定
      cell: info => {
        const rowIndex = info.row.index;
        const columnId = info.column.id;
        const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnId === columnId;
        const value = info.getValue();
        
        if (editable && isEditing) {
          return (
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => finishEditing()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  finishEditing();
                } else if (e.key === 'Escape') {
                  cancelEditing();
                }
              }}
              className="w-full p-1 border border-blue-400 dark:border-blue-600 bg-white dark:bg-gray-800 rounded"
            />
          );
        }
        
        if (value === null || value === undefined) {
          return editable ? (
            <div
              className="text-gray-400 cursor-pointer"
              onClick={() => editable && startEditing(rowIndex, columnId, '-')}
            >
              -
            </div>
          ) : (
            <span className="text-gray-400">-</span>
          );
        }
        
        if (typeof value === 'object') {
          if (isNested) {
            return (
              <div 
                className={`w-full max-w-[300px] ${editable ? 'cursor-pointer' : ''}`}
                onClick={() => editable && startEditing(rowIndex, columnId, JSON.stringify(value))}
              >
                <ObjectViewer data={value} expandLevel={1} compactMode={true} />
              </div>
            );
          } else {
            return (
              <span 
                className={`text-blue-600 dark:text-blue-400 ${editable ? 'cursor-pointer' : 'cursor-help'}`} 
                title={JSON.stringify(value)}
                onClick={() => editable && startEditing(rowIndex, columnId, JSON.stringify(value))}
              >
                {JSON.stringify(value).substring(0, 50) + (JSON.stringify(value).length > 50 ? '...' : '')}
              </span>
            );
          }
        }
        
        return editable ? (
          <div
            className="cursor-pointer"
            onClick={() => startEditing(rowIndex, columnId, String(value))}
          >
            {String(value)}
          </div>
        ) : (
          String(value)
        );
      }
    }));
    
    return [...tableColumns, ...dataColumns];
  }, [data, columnHelper, isNested, columnWidths, editingCell, editValue, selectedRows, editable, selectionColumn]);

  // テーブルの設定
  const table = useReactTable({
    data: tableData,
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

  // 編集開始
  const startEditing = (rowIndex: number, columnId: string, initialValue: string) => {
    if (!editable) return;
    setEditingCell({ rowIndex, columnId });
    setEditValue(initialValue);
  };
  
  // 編集完了
  const finishEditing = () => {
    if (editingCell) {
      const { rowIndex, columnId } = editingCell;
      const newData = [...tableData];
      
      try {
        // JSONオブジェクトや配列の場合はパースする
        if (editValue.startsWith('{') || editValue.startsWith('[')) {
          try {
            newData[rowIndex][columnId] = JSON.parse(editValue);
          } catch (e) {
            // パースに失敗した場合は文字列として扱う
            newData[rowIndex][columnId] = editValue;
          }
        } else if (editValue === '-') {
          // '-'はnullとして扱う
          newData[rowIndex][columnId] = null;
        } else if (!isNaN(Number(editValue)) && editValue.trim() !== '') {
          // 数値の場合は数値型に変換
          newData[rowIndex][columnId] = Number(editValue);
        } else if (editValue.toLowerCase() === 'true') {
          newData[rowIndex][columnId] = true;
        } else if (editValue.toLowerCase() === 'false') {
          newData[rowIndex][columnId] = false;
        } else {
          // それ以外は文字列
          newData[rowIndex][columnId] = editValue;
        }
        
        setTableData(newData);
      } catch (error) {
        console.error('Error updating data:', error);
      }
    }
    
    setEditingCell(null);
  };
  
  // 編集キャンセル
  const cancelEditing = () => {
    setEditingCell(null);
  };
  
  // 新しい行を追加
  const addNewRow = () => {
    if (!editable || !data || data.length === 0) return;
    
    const newRow: Record<string, any> = {};
    Object.keys(data[0]).forEach(col => {
      newRow[col] = null;
    });
    
    setTableData([...tableData, newRow]);
  };
  
  // 選択された行を削除
  const deleteSelectedRows = () => {
    if (!editable || selectedRows.size === 0) return;
    
    const newData = tableData.filter((_, index) => !selectedRows.has(index));
    setTableData(newData);
    setSelectedRows(new Set());
  };
  
  // データを保存
  const saveData = () => {
    if (onSave) {
      onSave(tableData);
    }
  };

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
            if (column.id === 'selection') return null;
            
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
    return (
      <div className="text-center p-4 text-gray-500">
        <div>データがありません</div>
        {editable && (
          <button
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={addNewRow}
          >
            <IoAdd className="inline mr-1" /> 新しい行を追加
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <div className="flex justify-between mb-2">
        {editable ? (
          <div className="flex space-x-2">
            <button
              className="px-3 py-1 flex items-center text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={addNewRow}
            >
              <IoAdd className="mr-1" /> 行を追加
            </button>
            <button
              className={`px-3 py-1 flex items-center text-sm rounded
                ${selectedRows.size > 0 
                  ? 'bg-red-600 text-white hover:bg-red-700' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              onClick={deleteSelectedRows}
              disabled={selectedRows.size === 0}
            >
              <IoTrash className="mr-1" /> 選択行を削除 ({selectedRows.size})
            </button>
            {onSave && (
              <button
                className="px-3 py-1 flex items-center text-sm bg-green-600 text-white rounded hover:bg-green-700"
                onClick={saveData}
              >
                <IoSave className="mr-1" /> 変更を保存
              </button>
            )}
          </div>
        ) : (
          <div></div>
        )}
        <div className="relative">
          <button
            className="px-2 py-1 flex items-center text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={() => setShowColumnSelector(!showColumnSelector)}
          >
            <IoOptionsOutline className="mr-1" />
            列の表示設定
          </button>
          {renderColumnSelector()}
        </div>
      </div>
      
      <div className="overflow-auto max-h-[calc(100vh-200px)]">
        <table ref={tableRef} className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const columnId = header.column.id;
                  
                  return (
                    <th
                      key={header.id}
                      data-column-id={columnId}
                      className={`px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap select-none relative bg-gray-100 dark:bg-gray-800
                        ${columnId === 'selection' ? '' : 'cursor-pointer'}`}
                      style={{ width: columnWidths[columnId] || 'auto' }}
                      onClick={(e) => {
                        if (columnId !== 'selection') {
                          header.column.getToggleSortingHandler()?.(e);
                        }
                      }}
                    >
                      <div className="flex items-center">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {columnId !== 'selection' && (
                          header.column.getIsSorted() === 'asc' ? (
                            <IoCaretUp className="ml-1 text-blue-500" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <IoCaretDown className="ml-1 text-blue-500" />
                          ) : (
                            <span className="ml-1 text-gray-300 dark:text-gray-700">⇅</span>
                          )
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

export default EditableQueryResultTable;
