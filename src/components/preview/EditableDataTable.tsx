
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

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
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
import { IoCaretDown, IoCaretUp, IoEyeOutline, IoEyeOffOutline, IoOptionsOutline, IoAdd, IoTrash, IoSave } from 'react-icons/io5';
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
   * テーブル全体へのフォーカス制御用ref
   */
  const tableContainerRef = useRef<HTMLDivElement>(null);
  /**
   * データが変更されたときにテーブルデータを更新（内部更新フラグを使用）
   */
  const isInternalUpdate = useRef(false);
  /**
   * アクティブなセル（選択中セル）
   */
  const [activeCell, setActiveCell] = useState<{ rowIndex: number; columnIndex: number } | null>(null);
  /**
   * 選択範囲（矩形選択）
   */
  const [selectedRange, setSelectedRange] = useState<{
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
  } | null>(null);
  /**
   * 選択の起点セル
   */
  const selectionAnchorRef = useRef<{ rowIndex: number; columnIndex: number } | null>(null);
  /**
   * マウスドラッグによる選択フラグ
   */
  const [isMouseSelecting, setIsMouseSelecting] = useState(false);
  
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
   * 列名とインデックスの対応マップ
   */
  const columnIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    columns.forEach((col, index) => {
      map[col] = index;
    });
    return map;
  }, [columns]);

  /**
   * 範囲情報を正規化（start <= end）
   */
  const normalizeRange = useCallback(
    (range: { startRow: number; endRow: number; startCol: number; endCol: number }) => {
      const startRow = Math.min(range.startRow, range.endRow);
      const endRow = Math.max(range.startRow, range.endRow);
      const startCol = Math.min(range.startCol, range.endCol);
      const endCol = Math.max(range.startCol, range.endCol);
      return { startRow, endRow, startCol, endCol };
    },
    [],
  );

  /**
   * セル選択状態を更新
   */
  const updateSelection = useCallback(
    (target: { rowIndex: number; columnIndex: number }, extend: boolean) => {
      const rowCount = tableData.length;
      const colCount = columns.length;

      if (rowCount === 0 || colCount === 0) {
        setActiveCell(null);
        setSelectedRange(null);
        selectionAnchorRef.current = null;
        return;
      }

      const clampedRow = Math.max(0, Math.min(target.rowIndex, rowCount - 1));
      const clampedCol = Math.max(0, Math.min(target.columnIndex, colCount - 1));
      const normalizedTarget = { rowIndex: clampedRow, columnIndex: clampedCol };

      if (!extend || !selectionAnchorRef.current) {
        selectionAnchorRef.current = normalizedTarget;
        setSelectedRange({
          startRow: normalizedTarget.rowIndex,
          endRow: normalizedTarget.rowIndex,
          startCol: normalizedTarget.columnIndex,
          endCol: normalizedTarget.columnIndex,
        });
      } else {
        const anchor = selectionAnchorRef.current;
        setSelectedRange(
          normalizeRange({
            startRow: anchor.rowIndex,
            endRow: normalizedTarget.rowIndex,
            startCol: anchor.columnIndex,
            endCol: normalizedTarget.columnIndex,
          }),
        );
      }

      setActiveCell(normalizedTarget);
    },
    [columns.length, normalizeRange, tableData.length],
  );

  /**
   * アクティブセルの移動
   */
  const moveActiveCell = useCallback(
    (rowDelta: number, colDelta: number, extend = false, allowRowWrap = false) => {
      if (!activeCell) return;

      const rowCount = tableData.length;
      const colCount = columns.length;
      if (rowCount === 0 || colCount === 0) return;

      let nextRow = activeCell.rowIndex + rowDelta;
      let nextCol = activeCell.columnIndex + colDelta;

      if (allowRowWrap) {
        if (nextCol >= colCount) {
          nextCol = 0;
          nextRow += 1;
        } else if (nextCol < 0) {
          nextCol = colCount - 1;
          nextRow -= 1;
        }
      }

      nextRow = Math.max(0, Math.min(nextRow, rowCount - 1));
      nextCol = Math.max(0, Math.min(nextCol, colCount - 1));

      updateSelection({ rowIndex: nextRow, columnIndex: nextCol }, extend);
    },
    [activeCell, columns.length, tableData.length, updateSelection],
  );

  /**
   * セル編集時の初期値整形
   */
  const getInitialEditValue = useCallback((value: any) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (error) {
        console.error('Failed to stringify value:', error);
        return String(value);
      }
    }
    return String(value);
  }, []);

  /**
   * 文字列から値へ変換
   */
  const parseInputValue = useCallback((input: string) => {
    if (input.startsWith('{') || input.startsWith('[')) {
      try {
        return JSON.parse(input);
      } catch (e) {
        return input;
      }
    }
    if (input === '-') {
      return null;
    }
    if (!isNaN(Number(input)) && input.trim() !== '') {
      return Number(input);
    }
    if (input.toLowerCase() === 'true') {
      return true;
    }
    if (input.toLowerCase() === 'false') {
      return false;
    }
    return input;
  }, []);

  /**
   * クリップボード出力用の値整形
   */
  const formatValueForClipboard = useCallback((value: any) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (error) {
        console.error('Failed to stringify value for clipboard:', error);
        return String(value);
      }
    }
    return String(value);
  }, []);

  /**
   * セルマウスダウン時の処理
   */
  const handleCellMouseDown = useCallback(
    (event: React.MouseEvent, rowIndex: number, columnIndex: number) => {
      if (columnIndex < 0) return;
      if (event.button !== 0) return;
      event.preventDefault();
      tableContainerRef.current?.focus();
      updateSelection({ rowIndex, columnIndex }, event.shiftKey);
      setIsMouseSelecting(true);
    },
    [updateSelection],
  );

  /**
   * セルマウスエンター時の処理（ドラッグ選択）
   */
  const handleCellMouseEnter = useCallback(
    (rowIndex: number, columnIndex: number) => {
      if (columnIndex < 0) return;
      if (!isMouseSelecting || !selectionAnchorRef.current) return;
      const anchor = selectionAnchorRef.current;
      setSelectedRange(
        normalizeRange({
          startRow: anchor.rowIndex,
          endRow: rowIndex,
          startCol: anchor.columnIndex,
          endCol: columnIndex,
        }),
      );
    },
    [isMouseSelecting, normalizeRange],
  );

  /**
   * セルダブルクリック時の編集開始
   */
  const handleCellDoubleClick = useCallback(
    (rowIndex: number, columnId: string, currentValue: any) => {
      const columnIndex = columnIndexMap[columnId];
      if (columnIndex === undefined) return;
      updateSelection({ rowIndex, columnIndex }, false);
      const initialValue = getInitialEditValue(currentValue);
      setEditingCell({ rowIndex, columnId });
      setEditValue(initialValue);
    },
    [columnIndexMap, getInitialEditValue, updateSelection],
  );

  /**
   * キーボード操作
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!activeCell) return;
      if (editingCell) return;

      const isCtrlLike = event.ctrlKey || event.metaKey;

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          moveActiveCell(-1, 0, event.shiftKey);
          return;
        case 'ArrowDown':
          event.preventDefault();
          moveActiveCell(1, 0, event.shiftKey);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          moveActiveCell(0, -1, event.shiftKey);
          return;
        case 'ArrowRight':
          event.preventDefault();
          moveActiveCell(0, 1, event.shiftKey);
          return;
        case 'Tab': {
          event.preventDefault();
          moveActiveCell(0, event.shiftKey ? -1 : 1, false, true);
          return;
        }
        case 'Enter': {
          event.preventDefault();
          const columnId = columns[activeCell.columnIndex];
          const currentValue = tableData[activeCell.rowIndex]?.[columnId];
          handleCellDoubleClick(activeCell.rowIndex, columnId, currentValue);
          return;
        }
        case 'F2': {
          event.preventDefault();
          const columnId = columns[activeCell.columnIndex];
          const currentValue = tableData[activeCell.rowIndex]?.[columnId];
          handleCellDoubleClick(activeCell.rowIndex, columnId, currentValue);
          return;
        }
        case 'Delete':
        case 'Backspace': {
          event.preventDefault();
          if (!selectedRange) return;
          const normalized = normalizeRange(selectedRange);
          const newData = tableData.map(row => ({ ...row }));
          for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
            for (let col = normalized.startCol; col <= normalized.endCol; col += 1) {
              const columnId = columns[col];
              if (!columnId) continue;
              newData[row][columnId] = null;
            }
          }
          isInternalUpdate.current = true;
          setTableData(newData);
          return;
        }
        default:
          break;
      }

      if (!isCtrlLike && event.key.length === 1) {
        const columnId = columns[activeCell.columnIndex];
        if (!columnId) return;
        handleCellDoubleClick(activeCell.rowIndex, columnId, event.key);
        setEditValue(event.key);
        event.preventDefault();
      }
    },
    [activeCell, columns, editingCell, handleCellDoubleClick, moveActiveCell, normalizeRange, selectedRange, setEditValue, tableData],
  );

  /**
   * クリップボードへコピー
   */
  const handleCopy = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!selectedRange && !activeCell) return;
      const range = selectedRange
        ? normalizeRange(selectedRange)
        : {
            startRow: activeCell!.rowIndex,
            endRow: activeCell!.rowIndex,
            startCol: activeCell!.columnIndex,
            endCol: activeCell!.columnIndex,
          };

      event.preventDefault();

      const lines: string[] = [];
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        const cells: string[] = [];
        for (let col = range.startCol; col <= range.endCol; col += 1) {
          const columnId = columns[col];
          if (!columnId) continue;
          const value = tableData[row]?.[columnId];
          cells.push(formatValueForClipboard(value));
        }
        lines.push(cells.join('\t'));
      }

      const text = lines.join('\n');
      event.clipboardData.setData('text/plain', text);
    },
    [activeCell, columns, formatValueForClipboard, normalizeRange, selectedRange, tableData],
  );

  /**
   * クリップボードから貼り付け
   */
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!activeCell) return;
      const text = event.clipboardData.getData('text/plain');
      if (!text) return;

      event.preventDefault();

      const rowStrings = text.replace(/\r/g, '').split('\n');
      const cleanedRows = rowStrings.filter((row, index) => !(row === '' && index === rowStrings.length - 1));
      const rows = cleanedRows.map(row => row.split('\t')).filter(row => row.length > 0);

      if (rows.length === 0) return;

      const newData = tableData.map(row => ({ ...row }));
      const startRow = activeCell.rowIndex;
      const startCol = activeCell.columnIndex;
      let maxRowOffset = 0;
      let maxColOffset = 0;

      rows.forEach((rowValues, rowOffset) => {
        const targetRow = startRow + rowOffset;
        if (targetRow >= newData.length) return;
        maxRowOffset = Math.max(maxRowOffset, rowOffset);
        rowValues.forEach((value, colOffset) => {
          const targetCol = startCol + colOffset;
          if (targetCol >= columns.length) return;
          maxColOffset = Math.max(maxColOffset, colOffset);
          const columnId = columns[targetCol];
          if (!columnId) return;
          newData[targetRow][columnId] = parseInputValue(value);
        });
      });

      if (maxRowOffset === 0 && maxColOffset === 0 && rows[0][0] === undefined) {
        return;
      }

      isInternalUpdate.current = true;
      setTableData(newData);

      const endRow = Math.min(startRow + maxRowOffset, tableData.length - 1);
      const endCol = Math.min(startCol + maxColOffset, columns.length - 1);
      const range = normalizeRange({
        startRow,
        endRow,
        startCol,
        endCol,
      });
      setSelectedRange(range);
      selectionAnchorRef.current = { rowIndex: range.startRow, columnIndex: range.startCol };
    },
    [activeCell, columns, normalizeRange, parseInputValue, tableData],
  );

  /**
   * 切り取り操作
   */
  const handleCut = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!selectedRange && !activeCell) return;
      handleCopy(event);
      const range = selectedRange
        ? normalizeRange(selectedRange)
        : {
            startRow: activeCell!.rowIndex,
            endRow: activeCell!.rowIndex,
            startCol: activeCell!.columnIndex,
            endCol: activeCell!.columnIndex,
          };

      const newData = tableData.map(row => ({ ...row }));
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        for (let col = range.startCol; col <= range.endCol; col += 1) {
          const columnId = columns[col];
          if (!columnId) continue;
          newData[row][columnId] = null;
        }
      }

      isInternalUpdate.current = true;
      setTableData(newData);
    },
    [activeCell, columns, handleCopy, normalizeRange, selectedRange, tableData],
  );

  /**
   * マウスアップ時にドラッグ選択を解除
   */
  useEffect(() => {
    const handleMouseUp = () => {
      setIsMouseSelecting(false);
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  /**
   * データ・列の変化に応じてアクティブセルを調整
   */
  useEffect(() => {
    if (tableData.length === 0 || columns.length === 0) {
      setActiveCell(null);
      setSelectedRange(null);
      selectionAnchorRef.current = null;
      return;
    }

    if (!activeCell) {
      const initialCell = { rowIndex: 0, columnIndex: 0 };
      selectionAnchorRef.current = initialCell;
      setActiveCell(initialCell);
      setSelectedRange({
        startRow: 0,
        endRow: 0,
        startCol: 0,
        endCol: 0,
      });
      return;
    }

    const rowIndex = Math.min(activeCell.rowIndex, tableData.length - 1);
    const columnIndex = Math.min(activeCell.columnIndex, columns.length - 1);
    if (rowIndex !== activeCell.rowIndex || columnIndex !== activeCell.columnIndex) {
      const adjusted = { rowIndex, columnIndex };
      selectionAnchorRef.current = adjusted;
      setActiveCell(adjusted);
      setSelectedRange({
        startRow: rowIndex,
        endRow: rowIndex,
        startCol: columnIndex,
        endCol: columnIndex,
      });
    }
  }, [activeCell, columns.length, tableData.length]);

  /**
   * アクティブセルが変更されたらテーブルにフォーカス
   */
  useEffect(() => {
    if (editingCell) return;
    if (!activeCell) return;
    tableContainerRef.current?.focus();
  }, [activeCell, editingCell]);
  
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
    () => {
      const normalizedSelection = selectedRange ? normalizeRange(selectedRange) : null;
      return [
      selectionColumn,
      ...columns.map(col => columnHelper.accessor(col, {
        header: col,
        size: columnWidths[col] || 150, // デフォルト幅を設定
        cell: info => {
          const rowIndex = info.row.index;
          const columnId = info.column.id;
          const columnIndex = columnIndexMap[columnId] ?? -1;
          const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnId === columnId;
          const value = info.getValue();

          const isActive =
            columnIndex >= 0 &&
            activeCell?.rowIndex === rowIndex &&
            activeCell?.columnIndex === columnIndex;
          const isInSelection = (() => {
            if (!normalizedSelection || columnIndex < 0) return false;
            const { startRow, endRow, startCol, endCol } = normalizedSelection;
            return rowIndex >= startRow && rowIndex <= endRow && columnIndex >= startCol && columnIndex <= endCol;
          })();

          const baseClasses = [
            'min-h-[34px]',
            'px-2',
            'py-1',
            'text-sm',
            'flex',
            'items-center',
            'whitespace-nowrap',
            'border',
            'transition-colors',
            'cursor-cell',
          ];

          if (isActive) {
            baseClasses.push('border-blue-500', 'dark:border-blue-400', 'bg-blue-100', 'dark:bg-blue-900/40');
          } else if (isInSelection) {
            baseClasses.push('border-blue-200', 'dark:border-blue-700', 'bg-blue-50', 'dark:bg-blue-900/30');
          } else {
            baseClasses.push('border-transparent');
          }

          const combinedClassName = baseClasses.join(' ');

          const renderValue = () => {
            if (value === null || value === undefined) {
              return <span className="text-gray-400">-</span>;
            }

            if (Array.isArray(value)) {
              if (isNested) {
                return (
                  <div className="max-w-xs overflow-hidden">
                    <ObjectViewer data={value} expandByDefault={false} expandLevel={0} compactMode={true} />
                  </div>
                );
              }
              const json = JSON.stringify(value);
              return (
                <span className="text-blue-600 dark:text-blue-400" title={json}>
                  [{value.length}] {json.substring(0, 50) + (json.length > 50 ? '...' : '')}
                </span>
              );
            }

            if (typeof value === 'object') {
              if (isNested) {
                return (
                  <div className="max-w-xs overflow-hidden">
                    <ObjectViewer data={value} expandByDefault={false} expandLevel={0} compactMode={true} />
                  </div>
                );
              }
              const json = JSON.stringify(value);
              return (
                <span className="text-blue-600 dark:text-blue-400" title={json}>
                  {json.substring(0, 50) + (json.length > 50 ? '...' : '')}
                </span>
              );
            }

            return <span>{String(value)}</span>;
          };

          return (
            <div
              className={combinedClassName}
              onMouseDown={(event) => handleCellMouseDown(event, rowIndex, columnIndex)}
              onMouseEnter={() => handleCellMouseEnter(rowIndex, columnIndex)}
              onDoubleClick={() => handleCellDoubleClick(rowIndex, columnId, value)}
            >
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => finishEditing()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      finishEditing();
                      setTimeout(() => {
                        moveActiveCell(e.shiftKey ? -1 : 1, 0);
                      }, 0);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEditing();
                    } else if (e.key === 'Tab') {
                      e.preventDefault();
                      finishEditing();
                      setTimeout(() => {
                        moveActiveCell(0, e.shiftKey ? -1 : 1, false, true);
                      }, 0);
                    }
                  }}
                  className="w-full bg-transparent outline-none focus:ring-0"
                />
              ) : (
                renderValue()
              )}
            </div>
          );
        },
      }))
    ];
    },
    [
      selectionColumn,
      columns,
      columnHelper,
      columnIndexMap,
      columnWidths,
      editingCell,
      editValue,
      activeCell,
      selectedRange,
      normalizeRange,
      handleCellMouseDown,
      handleCellMouseEnter,
      handleCellDoubleClick,
      moveActiveCell,
      isNested,
    ],
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
   * 編集完了関数
   * 編集内容を反映し、型変換も行う
   */
  const finishEditing = () => {
    if (editingCell) {
      const { rowIndex, columnId } = editingCell;
      const updatedRow = { ...tableData[rowIndex] };
      try {
        updatedRow[columnId] = parseInputValue(editValue);
        const newData = [...tableData];
        newData[rowIndex] = updatedRow;
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
    <div
      ref={tableContainerRef}
      className="overflow-auto focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onCopy={handleCopy}
      onPaste={handlePaste}
      onCut={handleCut}
    >
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
