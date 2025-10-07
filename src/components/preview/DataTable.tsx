
/**
 * DataTable.tsx
 * 汎用テーブルGUIデザインモードReactコンポーネント。
 * 対応フォーマット: CSV, TSV, JSON, YAML, Parquet
 * 主な機能:
 * - 列選択・表示/非表示切り替え
 * - マークダウン表形式でのコピー（クリップボード）
 * - ネスト構造データの階層表示（ObjectViewer連携）
 * - カラム幅調整
 * - データ型ごとの柔軟なプレビュー
 * - 列セレクターによる表示制御
 * - react-tableによるソート・表示制御
 */

'use client';

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
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
import { IoCaretDown, IoCaretUp, IoEyeOutline, IoEyeOffOutline, IoOptionsOutline, IoGrid, IoAnalytics, IoCopyOutline } from 'react-icons/io5';
import ObjectViewer from './ObjectViewer';

/**
 * DataTableProps
 * DataTableコンポーネントのプロパティ型定義（テーブルプレビューの挙動を制御）
 * @property {any[]} data 表示対象のデータ配列（各行はオブジェクト。CSV/TSV/JSON/YAML/Parquetをパースした結果）
 * @property {string[]} columns テーブルの列名配列（ヘッダー行）
 * @property {'csv'|'tsv'|'json'|'yaml'|'parquet'} [fileType] データ種別（csv/tsv/json/yaml/parquetのいずれか、省略時csv）
 * @property {string} [rawText] 元データのテキスト（CSV/TSV/JSON/YAML/ParquetバイナリBase64。コピー用）
 * @property {boolean} [isNested] ネスト構造を保持するモード（trueでObjectViewer表示）
 * @property {boolean} [showColumnSelector] 列セレクターの表示状態（外部制御用）
 * @property {(show: boolean) => void} [onColumnSelectorChange] 列セレクターの表示状態変更コールバック（外部制御用）
 */
interface DataTableProps {
  data: any[];
  columns: string[];
  fileType?: 'csv' | 'tsv' | 'json' | 'yaml' | 'parquet';
  rawText?: string;
  isNested?: boolean;
  showColumnSelector?: boolean;
  onColumnSelectorChange?: (show: boolean) => void;
}

/**
 * DataTableコンポーネント
 * テーブルデータをプレビュー表示するための汎用Reactコンポーネント。
 * - 列の表示/非表示切り替え
 * - マークダウン表形式でのコピー
 * - ネスト構造データの可視化
 * - カラム幅調整
 * - データ型ごとの柔軟なプレビュー
 * @param {DataTableProps} props DataTableの各種設定・データ
 *   - data: 表示対象のデータ配列（各行はオブジェクト）
 *   - columns: テーブルの列名配列
 *   - fileType: データ種別（csv/tsv/json/yaml/parquet）
 *   - rawText: 元データのテキスト
 *   - isNested: ネスト構造表示モード
 *   - showColumnSelector: 列セレクター表示状態
 *   - onColumnSelectorChange: 列セレクター表示状態変更コールバック
 * @returns テーブルプレビューUI（React要素）
 */
const DataTable: React.FC<DataTableProps> = (props) => {
  /**
   * テーブルのソート状態
   */
  /**
   * テーブルのソート状態（react-tableのsorting state）
   */
  const [sorting, setSorting] = useState<SortingState>([]);
  // ページネーションはプレビューでは不要
  /**
   * 列の表示/非表示状態
   */
  /**
   * 列の表示/非表示状態（react-tableのcolumnVisibility state）
   */
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  /**
   * 列セレクターの内部表示状態
   */
  /**
   * 列セレクターの内部表示状態（外部propsが未指定の場合に使用）
   */
  const [internalShowColumnSelector, setInternalShowColumnSelector] = useState(false);
  /**
   * 各カラムの幅（px単位）
   */
  /**
   * 各カラムの幅（px単位、カラム名をkeyとする）
   */
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const {
    data,
    columns,
    fileType = 'csv',
    rawText,
    isNested = false,
    showColumnSelector: externalShowColumnSelector,
    onColumnSelectorChange
  } = props;
  /**
   * 現在表示中のテーブルデータをマークダウン表形式に変換し、クリップボードへコピーする。
   * データ種別ごとに適切な変換関数を呼び出す。
   * @returns {void}
   * @throws 変換エラー時はalertで通知
   */
  const handleCopyMarkdownTable = () => {
    let markdown = '';
    try {
      if (fileType === 'csv' && rawText) {
        const { csvToMarkdownTable } = require('@/lib/dataFormatUtils');
        markdown = csvToMarkdownTable(rawText);
      } else if (fileType === 'tsv' && rawText) {
        const { tsvToMarkdownTable } = require('@/lib/dataFormatUtils');
        markdown = tsvToMarkdownTable(rawText);
      } else if (fileType === 'json' && rawText) {
        const { jsonToMarkdownTable } = require('@/lib/dataFormatUtils');
        markdown = jsonToMarkdownTable(rawText);
      } else if (fileType === 'yaml' && rawText) {
        const { yamlToMarkdownTable } = require('@/lib/dataFormatUtils');
        markdown = yamlToMarkdownTable(rawText);
      } else if (fileType === 'parquet' && rawText) {
        markdown = 'ParquetはWeb環境で直接変換できません';
      } else {
        // テーブル表示中のデータをそのまま変換
        const { arrayToMarkdownTable } = require('@/lib/dataFormatUtils');
        markdown = arrayToMarkdownTable([columns, ...data.map(row => columns.map(col => row[col] ?? ''))]);
      }
      navigator.clipboard.writeText(markdown)
        .then(() => {
          alert('マークダウン表形式でコピーしました');
        })
        .catch(() => {
          alert('クリップボードへのコピーに失敗しました');
        });
    } catch (e) {
      alert('変換エラー: ' + e);
    }
  }
  
  // 列のリサイズ用の状態
  /**
   * 列リサイズ操作の一時状態保持用ref
   */
  /**
   * 列リサイズ操作の一時状態保持用ref
   * @type {React.MutableRefObject<{ id: string, startX: number, startWidth: number } | null>}
   */
  const resizingColumnRef = useRef<{ id: string, startX: number, startWidth: number } | null>(null);
  /**
   * テーブルDOM参照用ref
   */
  /**
   * テーブルDOM参照用ref
   * @type {React.RefObject<HTMLTableElement>}
   */
  const tableRef = useRef<HTMLTableElement>(null);

  const getColumnWidth = useCallback(
    (columnId: string): number => columnWidths[columnId] ?? 150,
    [columnWidths],
  );

  const handleResizeMove = useCallback((event: MouseEvent) => {
    if (!resizingColumnRef.current) {
      return;
    }

    const { id, startX, startWidth } = resizingColumnRef.current;
    const delta = event.clientX - startX;
    const newWidth = Math.max(60, startWidth + delta);

    setColumnWidths(prev => {
      if (prev[id] === newWidth) {
        return prev;
      }
      return { ...prev, [id]: newWidth };
    });
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingColumnRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>, columnId: string) => {
    event.preventDefault();
    event.stopPropagation();

    const headerCell = tableRef.current?.querySelector<HTMLTableCellElement>(`th[data-column-id="${columnId}"]`);
    const currentWidth = headerCell?.getBoundingClientRect().width ?? getColumnWidth(columnId);

    resizingColumnRef.current = {
      id: columnId,
      startX: event.clientX,
      startWidth: currentWidth,
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [getColumnWidth, handleResizeEnd, handleResizeMove]);

  useEffect(() => () => {
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeEnd, handleResizeMove]);
  
  /**
   * 列セレクターの表示状態を外部/内部で管理し、切り替える関数。
   * @param show 表示状態
   */
  /**
   * 列セレクターの表示状態（外部props優先、なければ内部state）
   */
  /**
   * 列セレクターの表示状態（外部props優先、なければ内部state）
   * @type {boolean}
   */
  const showColumnSelector = externalShowColumnSelector !== undefined 
    ? externalShowColumnSelector 
    : internalShowColumnSelector;

  /**
   * 列セレクターの表示状態を切り替える関数
   * 外部propsのコールバックがあればそれを呼び出し、なければ内部stateを更新。
   * @param {boolean} show 表示状態（true:表示, false:非表示）
   * @returns {void}
   */
  const setShowColumnSelector = (show: boolean) => {
    if (onColumnSelectorChange) {
      onColumnSelectorChange(show);
    } else {
      setInternalShowColumnSelector(show);
    }
  };
  
  /**
   * react-tableのカラムヘルパー
   */
  /**
   * react-tableのカラムヘルパー
   */
  const columnHelper = createColumnHelper<any>();
  
  /**
   * テーブルのカラム定義（react-table用）
   * 列名・カラム幅・セル表示ロジックを定義。
   * @see https://tanstack.com/table/v8/docs/guide/column-defs
   * @returns {ColumnDef<any, any>[]} カラム定義配列
   */
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
        // 通常値
        return <span>{value}</span>;
      }
    })),
    [columns, columnWidths, isNested]
  );

  // react-tableを使ったテーブルUI
  /**
   * react-tableのインスタンス（テーブルUI制御）
   */
  /**
   * react-tableのインスタンス（テーブルUI制御）
   * @type {ReturnType<typeof useReactTable>}
   */
  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: false,
  });

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2 relative">
        <div className="flex items-center gap-2">
          {/* マークダウン表コピーアイコンボタン */}
          <button
            type="button"
            className="px-2 py-1 flex items-center text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="マークダウン表形式でコピー"
            onClick={handleCopyMarkdownTable}
          >
            <IoCopyOutline className="mr-1" />
            マークダウン表形式でコピー
          </button>
        </div>
        <div className="flex items-center gap-2 relative">
          {/* 列表示設定ボタン */}
          <button
            type="button"
            className="px-2 py-1 flex items-center text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="列の表示設定"
            onClick={() => setShowColumnSelector(!showColumnSelector)}
          >
            <IoOptionsOutline className="mr-1" />
            列の表示設定
          </button>
          {/* カラムセレクター（ドロップダウン） */}
          {showColumnSelector && (
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
                      onClick={() => column.toggleVisibility(!isVisible)}
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
          )}
        </div>
      </div>
  <div className="overflow-auto max-h-[500px]">
        {table.getRowModel().rows.length > 0 ? (
          <table ref={tableRef} className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      data-column-id={header.column.id}
                      className="relative px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap select-none"
                      style={{ width: getColumnWidth(header.column.id) }}
                    >
                      <div className="flex items-center">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? (
                          <IoCaretUp className="ml-1 text-blue-500" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <IoCaretDown className="ml-1 text-blue-500" />
                        ) : (
                          <span className="ml-1 text-gray-300 dark:text-gray-700">⇅</span>
                        )}
                      </div>
                      <div
                        className="absolute right-0 top-0 h-full w-3 cursor-col-resize"
                        onMouseDown={(event) => handleResizeStart(event, header.column.id)}
                      />
                    </th>
                  ))}
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
                      style={{ width: getColumnWidth(cell.column.id) }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-gray-400 p-4">データがありません</div>
        )}
      </div>
    </div>
  );
}
export default DataTable;
