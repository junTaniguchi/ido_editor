
/**
 * EditableDataTable.tsx
 * 編集可能なテーブルGUIデザインモードReactコンポーネント。
 * 対応フォーマット: CSV, TSV, JSON, YAML, Parquet
 * 主な機能:
 * - セル編集（インライン）
 * - 行追加・削除
 * - 列選択・表示/非表示切り替え
 * - マークダウン表形式でのコピー（クリップボード）
 * - ネスト構造データの階層表示（ObjectViewer連携）
 * - カラム幅調整
 * - データ型ごとの柔軟なプレビュー
 * - 列セレクターによる表示制御
 * - react-tableによるソート・表示制御
 */

'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
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
  Row,
} from '@tanstack/react-table';
import { IoCaretDown, IoCaretUp, IoEyeOutline, IoEyeOffOutline, IoOptionsOutline, IoGrid, IoAdd, IoTrash, IoSave } from 'react-icons/io5';
import ObjectViewer from './ObjectViewer';

/**
 * EditableDataTableProps
 * 編集可能テーブルコンポーネントのプロパティ型定義
 * @property {any[]} data 表示・編集対象のデータ配列
 * @property {string[]} columns テーブルの列名配列
 * @property {boolean} [isNested] ネスト構造表示モード
 * @property {(newData: any[]) => void} [onDataChange] データ変更時のコールバック
 * @property {(newData: any[]) => void} [onSave] 保存時のコールバック
 * @property {'csv'|'tsv'|'json'|'yaml'|'parquet'} [fileType] データ種別
 */
interface EditableDataTableProps {
  data: any[];
  columns: string[];
  isNested?: boolean;
  onDataChange?: (newData: any[]) => void;
  onSave?: (newData: any[]) => void;
  fileType?: 'csv' | 'tsv' | 'json' | 'yaml' | 'parquet';
}

/**
 * EditableDataTableコンポーネント
 * テーブルデータをExcelライクに編集・表示するための汎用コンポーネント。
 * - 行・列の追加/削除
 * - セル編集
 * - 列の表示/非表示切り替え
 * - ネスト構造データの表示
 * - 編集内容の保存・通知
 * @param data 表示・編集対象のデータ配列
 * @param columns テーブルの列名配列
 * @param isNested ネスト構造表示モード
 * @param onDataChange データ変更時のコールバック
 * @param onSave 保存時のコールバック
 * @param fileType データ種別（csv/tsv/json/yaml/parquet）
 */
/**
 * EditableDataTableコンポーネント
 * テーブルデータをExcelライクに編集・表示するための汎用Reactコンポーネント。
 * - 行・列の追加/削除
 * - セル編集
 * - 列の表示/非表示切り替え
 * - ネスト構造データの表示
 * - 編集内容の保存・通知
 * @param {EditableDataTableProps} props
 * @returns 編集可能なテーブルプレビューUI（React要素）
 */
const EditableDataTable: React.FC<EditableDataTableProps> = ({ 
  data, 
  columns, 
  isNested = false,
  onDataChange,
  onSave,
  fileType = 'json'
}) => {
  /**
   * 編集用テーブルデータ（内部state）
   */
  const [tableData, setTableData] = useState<any[]>([...data]);
  /**
   * テーブルのソート状態
   */
  const [sorting, setSorting] = useState<SortingState>([]);
  /**
   * ページサイズ（表示行数）
   */
  const [pageSize, setPageSize] = useState<number>(15);
  /**
   * 列の表示/非表示状態
   */
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  /**
   * 列セレクター表示状態
   */
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  /**
   * 編集中セル情報
   */
  const [editingCell, setEditingCell] = useState<{rowIndex: number, columnId: string} | null>(null);
  /**
   * 編集中セルの値
   */
  const [editValue, setEditValue] = useState<string>('');
  /**
   * 選択中の行インデックス集合
   */
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  /**
   * 各カラムの幅（px単位、カラム名をkeyとする）
   */
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  /**
   * 列リサイズ操作の一時状態保持用ref
   */
  const resizingColumnRef = useRef<{ id: string, startX: number, startWidth: number } | null>(null);
  /**
   * テーブルDOM参照用ref
   */
  const tableRef = useRef<HTMLTableElement>(null);
  /**
   * 編集入力フィールド参照用ref
   */
  const editInputRef = useRef<HTMLInputElement>(null);
  /**
   * データが変更されたときにテーブルデータを更新（内部更新フラグを使用）
   */
  const isInternalUpdate = useRef(false);
  
  /**
   * 外部data変更時に内部テーブルデータを同期
   */
  useEffect(() => {
    // 内部更新の場合はスキップ
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    setTableData([...data]);
  }, [data]);
  
  // 親コンポーネントにデータの変更を通知
  /**
   * 編集内容が変更された場合、親コンポーネントに通知
   */
  useEffect(() => {
    // 初回マウント時は通知しない
    if (tableData === data) return;
    // tableDataが内部で更新された場合のみ親に通知
    if (onDataChange && !isInternalUpdate.current) {
      isInternalUpdate.current = true;
      onDataChange(tableData);
    }
  }, [tableData, onDataChange, data]);
  
  // 編集入力フィールドにフォーカスを当てる
  /**
   * 編集セルが変更されたとき、入力フィールドにフォーカス
   */
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingCell]);
  
  /**
   * react-tableのカラムヘルパー
   */
  const columnHelper = createColumnHelper<any>();
  
  // 選択列を追加
  /**
   * 行選択用カラム定義（チェックボックス）
   */
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
  
  /**
   * テーブルのカラム定義（react-table用）
   * 列名・カラム幅・セル表示・編集ロジックを定義。
   * @returns {ColumnDef<any, any>[]} カラム定義配列
   */
  const tableColumns = useMemo(
    () => [
      selectionColumn,
      ...columns.map(col => columnHelper.accessor(col, {
        header: col,
        size: columnWidths[col] || 150, // デフォルト幅を設定
        cell: info => {
          const rowIndex = info.row.index;
          const columnId = info.column.id;
          const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnId === columnId;
          const value = info.getValue();
          
          if (isEditing) {
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
            return (
              <div
                className="text-gray-400 cursor-pointer"
                onClick={() => startEditing(rowIndex, columnId, '-')}
              >
                -
              </div>
            );
          }
          
          // オブジェクト型またはネスト構造の表示
          if (typeof value === 'object') {
            if (isNested) {
              return (
                <div 
                  className="max-w-xs overflow-hidden cursor-pointer"
                  onClick={() => startEditing(rowIndex, columnId, JSON.stringify(value))}
                >
                  <ObjectViewer data={value} expandByDefault={false} expandLevel={0} compactMode={true} />
                </div>
              );
            } else {
              return (
                <div 
                  className="text-blue-600 dark:text-blue-400 cursor-pointer" 
                  title={JSON.stringify(value)}
                  onClick={() => startEditing(rowIndex, columnId, JSON.stringify(value))}
                >
                  {JSON.stringify(value).substring(0, 50) + (JSON.stringify(value).length > 50 ? '...' : '')}
                </div>
              );
            }
          }
          
          // 配列の表示
          if (Array.isArray(value)) {
            if (isNested) {
              return (
                <div 
                  className="max-w-xs overflow-hidden cursor-pointer"
                  onClick={() => startEditing(rowIndex, columnId, JSON.stringify(value))}
                >
                  <ObjectViewer data={value} expandByDefault={false} expandLevel={0} compactMode={true} />
                </div>
              );
            } else {
              return (
                <div 
                  className="text-blue-600 dark:text-blue-400 cursor-pointer" 
                  title={JSON.stringify(value)}
                  onClick={() => startEditing(rowIndex, columnId, JSON.stringify(value))}
                >
                  [{value.length}] {JSON.stringify(value).substring(0, 50) + (JSON.stringify(value).length > 50 ? '...' : '')}
                </div>
              );
            }
          }
          
          return (
            <div
              className="cursor-pointer"
              onClick={() => startEditing(rowIndex, columnId, String(value))}
            >
              {String(value)}
            </div>
          );
        },
      }))
    ],
    [columns, columnHelper, isNested, columnWidths, editingCell, editValue, selectedRows]
  );
  
  /**
   * react-tableのインスタンス（テーブルUI制御）
   */
  const table = useReactTable({
    data: tableData,
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
  
  /**
   * 編集開始関数
   * @param {number} rowIndex 行インデックス
   * @param {string} columnId カラムID
   * @param {string} initialValue 初期値
   */
  const startEditing = (rowIndex: number, columnId: string, initialValue: string) => {
    setEditingCell({ rowIndex, columnId });
    setEditValue(initialValue);
  };
  
  /**
   * 編集完了関数
   * 編集内容を反映し、型変換も行う
   */
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
        
        // 内部更新フラグを設定してからテーブルデータを更新
        isInternalUpdate.current = true;
        setTableData(newData);
      } catch (error) {
        console.error('Error updating data:', error);
      }
    }
    
    setEditingCell(null);
  };
  
  /**
   * 編集キャンセル関数
   */
  const cancelEditing = () => {
    setEditingCell(null);
  };
  
  /**
   * 新しい行を追加する関数
   */
  const addNewRow = () => {
    const newRow: Record<string, any> = {};
    columns.forEach(col => {
      newRow[col] = null;
    });
    
    isInternalUpdate.current = true;
    setTableData([...tableData, newRow]);
  };
  
  /**
   * 選択された行を削除する関数
   */
  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) return;
    
    const newData = tableData.filter((_, index) => !selectedRows.has(index));
    isInternalUpdate.current = true;
    setTableData(newData);
    setSelectedRows(new Set());
  };
  
  /**
   * 編集データを保存する関数
   */
  const saveData = () => {
    if (onSave) {
      onSave(tableData);
    }
  };
  
  /**
   * 列リサイズ開始処理
   * @param {React.MouseEvent<HTMLDivElement>} e マウスイベント
   * @param {string} columnId カラムID
   */
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
  
  /**
   * 列リサイズ中の処理
   * @param {MouseEvent} e マウスイベント
   */
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
  
  /**
   * 列リサイズ終了処理
   */
  const handleResizeEnd = () => {
    resizingColumnRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };
  
  /**
   * 列の表示・非表示を切り替えるドロップダウンメニュー描画関数
   * @returns {React.ReactNode|null}
   */
  const renderColumnSelector = () => {
    if (!showColumnSelector) return null;
    
    return (
      <div className="absolute top-10 right-0 mt-2 w-64 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10">
        <div className="py-1 px-2 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
          表示する列を選択
        </div>
        <div className="py-1 max-h-60 overflow-y-auto">
          {table.getAllLeafColumns().map(column => {
            // selection列は非表示にできないようにする
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
  
  if (!tableData.length) {
    return (
      <div className="text-center p-4 text-gray-500">
        <p>データがありません</p>
        <button
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={addNewRow}
        >
          <IoAdd className="inline mr-1" /> 新しい行を追加
        </button>
      </div>
    );
  }
  
  return (
    <div className="overflow-auto">
      <div className="flex justify-between mb-2">
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
          <button
            className="px-3 py-1 flex items-center text-sm bg-green-600 text-white rounded hover:bg-green-700"
            onClick={saveData}
          >
            <IoSave className="mr-1" /> 変更を保存
          </button>
        </div>
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
      
      <div className="overflow-auto max-h-[500px]">
        <table ref={tableRef} className="min-w-full divide-y divide-gray-300 dark:divide-gray-700 border-collapse">
        <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const columnId = header.column.id;
                
                return (
                  <th
                    key={header.id}
                    data-column-id={columnId}
                    className={`px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap select-none relative
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
                    {/* リサイズハンドル (選択列以外) */}
                    {columnId !== 'selection' && (
                      <div
                        className="absolute right-0 top-0 h-full w-4 bg-transparent cursor-col-resize group"
                        onMouseDown={(e) => handleResizeStart(e, columnId)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="w-px h-full bg-gray-300 dark:bg-gray-700 group-hover:bg-blue-500 group-hover:w-[3px] mx-auto" />
                      </div>
                    )}
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

export default EditableDataTable;
