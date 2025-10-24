/**
 * TableWizard.tsx
 * MarkdownテーブルをGUIで作成・挿入するための SpreadJS ベースのウィザード。
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as GC from '@grapecity/spread-sheets';
import { IoClose } from 'react-icons/io5';
import SpreadSheetEditor from '@/components/spread/SpreadSheetEditor';

type TableAlignment = 'left' | 'center' | 'right';

interface TableWizardProps {
  onInsertTable: (tableData: string[][], alignments: TableAlignment[]) => void;
  onClose: () => void;
}

const DEFAULT_ROW_COUNT = 10;
const DEFAULT_COLUMN_COUNT = 10;

const createDefaultColumnKeys = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `列${index + 1}`);

const createInitialMatrix = (columnCount: number, rowCount: number = DEFAULT_ROW_COUNT): string[][] => {
  return Array.from({ length: Math.max(2, rowCount) }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) =>
      rowIndex === 0 ? `ヘッダー${columnIndex + 1}` : '',
    ),
  );
};

const ensureMatrixShape = (matrix: string[][], columnCount: number): string[][] => {
  const normalizedRows = matrix.map(row => {
    const nextRow = [...row];
    while (nextRow.length < columnCount) {
      nextRow.push('');
    }
    return nextRow.slice(0, columnCount);
  });

  if (normalizedRows.length === 0) {
    return createInitialMatrix(columnCount);
  }

  if (normalizedRows.length === 1) {
    normalizedRows.push(Array(columnCount).fill(''));
  }

  return normalizedRows;
};

const sanitizeCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const arraysEqual = <T,>(a: readonly T[], b: readonly T[]): boolean => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
};

const matricesEqual = (a: string[][], b: string[][]): boolean => {
  if (a.length !== b.length) return false;
  for (let row = 0; row < a.length; row += 1) {
    if (!arraysEqual(a[row], b[row])) {
      return false;
    }
  }
  return true;
};

const matrixToSpreadData = (matrix: string[][], columnKeys: string[]) => {
  return matrix.map(row => {
    const record: Record<string, string> = {};
    columnKeys.forEach((key, columnIndex) => {
      record[key] = row[columnIndex] ?? '';
    });
    return record;
  });
};

const shallowEqualAlignmentMap = (
  a: Record<string, TableAlignment>,
  b: Record<string, TableAlignment>,
): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

const TableWizard: React.FC<TableWizardProps> = ({ onInsertTable, onClose }) => {
  const [columnKeys, setColumnKeys] = useState<string[]>(() =>
    createDefaultColumnKeys(DEFAULT_COLUMN_COUNT),
  );
  const [tableMatrix, setTableMatrix] = useState<string[][]>(() =>
    createInitialMatrix(DEFAULT_COLUMN_COUNT),
  );
  const [alignmentMap, setAlignmentMap] = useState<Record<string, TableAlignment>>({});
  const [spreadInstance, setSpreadInstance] = useState<GC.Spread.Sheets.Workbook | null>(null);
  const [activeColumnIndex, setActiveColumnIndex] = useState<number | null>(null);

  const spreadData = useMemo(() => matrixToSpreadData(tableMatrix, columnKeys), [columnKeys, tableMatrix]);

  const handleDataChange = useCallback((rows: any[]) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      const defaultKeys = createDefaultColumnKeys(DEFAULT_COLUMN_COUNT);
      const defaultMatrix = createInitialMatrix(DEFAULT_COLUMN_COUNT);
      setColumnKeys(prev => (arraysEqual(prev, defaultKeys) ? prev : defaultKeys));
      setTableMatrix(prev => (matricesEqual(prev, defaultMatrix) ? prev : defaultMatrix));
      setAlignmentMap(prev => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const keyOrder = rows.reduce<string[]>((order, row) => {
      if (!row || typeof row !== 'object') return order;
      Object.keys(row).forEach(key => {
        if (!order.includes(key)) {
          order.push(key);
        }
      });
      return order;
    }, []);

    const nextColumnKeys =
      keyOrder.length > 0 ? keyOrder : createDefaultColumnKeys(DEFAULT_COLUMN_COUNT);

    const nextMatrix = rows.map(row =>
      nextColumnKeys.map(key => sanitizeCellValue(row?.[key])),
    );
    const normalizedMatrix = ensureMatrixShape(nextMatrix, nextColumnKeys.length);

    setColumnKeys(prev => (arraysEqual(prev, nextColumnKeys) ? prev : nextColumnKeys));
    setTableMatrix(prev => (matricesEqual(prev, normalizedMatrix) ? prev : normalizedMatrix));
    setAlignmentMap(prev => {
      const next: Record<string, TableAlignment> = {};
      nextColumnKeys.forEach(key => {
        const value = prev[key];
        if (value && value !== 'left') {
          next[key] = value;
        }
      });
      return shallowEqualAlignmentMap(prev, next) ? prev : next;
    });
  }, []);

  const applyAlignment = useCallback(
    (alignment: TableAlignment) => {
      if (!spreadInstance) return;
      const sheet = spreadInstance.getActiveSheet();
      if (!sheet) return;

      const totalColumns = columnKeys.length;
      if (totalColumns === 0) return;

      let hAlign = GC.Spread.Sheets.HorizontalAlign.left;
      if (alignment === 'center') {
        hAlign = GC.Spread.Sheets.HorizontalAlign.center;
      } else if (alignment === 'right') {
        hAlign = GC.Spread.Sheets.HorizontalAlign.right;
      }

      const selections = sheet.getSelections();
      const affectedColumns = new Set<number>();

      const registerColumns = (start: number | null | undefined, count: number | null | undefined) => {
        if (start === null || start === undefined) {
          const activeCol = sheet.getActiveColumnIndex();
          if (activeCol >= 0) {
            affectedColumns.add(activeCol);
          }
          return;
        }

        if (start < 0) {
          for (let index = 0; index < totalColumns; index += 1) {
            affectedColumns.add(index);
          }
          return;
        }

        let length = count ?? 1;
        if (length < 0) {
          length = Math.max(0, totalColumns - start);
        }

        for (let offset = 0; offset < length; offset += 1) {
          const columnIndex = start + offset;
          if (columnIndex >= 0 && columnIndex < totalColumns) {
            affectedColumns.add(columnIndex);
          }
        }
      };

      if (selections && selections.length > 0) {
        selections.forEach(selection => {
          registerColumns(selection.col, selection.colCount);
        });
      }

      if (affectedColumns.size === 0) {
        const activeCol = sheet.getActiveColumnIndex();
        if (activeCol >= 0 && activeCol < totalColumns) {
          affectedColumns.add(activeCol);
        }
      }

      if (affectedColumns.size === 0) return;

      sheet.suspendPaint();
      affectedColumns.forEach(index => {
        sheet.getRange(-1, index, -1, 1).hAlign(hAlign);
        sheet.getRange(0, index, 1, 1, GC.Spread.Sheets.SheetArea.colHeader).hAlign(hAlign);
      });
      sheet.resumePaint();
      sheet.repaint();

      setAlignmentMap(prev => {
        const next = { ...prev };
        let changed = false;
        affectedColumns.forEach(index => {
          const key = columnKeys[index];
          if (!key) return;
          if (alignment === 'left') {
            if (next[key]) {
              delete next[key];
              changed = true;
            }
          } else if (next[key] !== alignment) {
            next[key] = alignment;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    },
    [columnKeys, spreadInstance],
  );

  useEffect(() => {
    if (!spreadInstance) return;
    const sheet = spreadInstance.getActiveSheet();
    if (!sheet) return;

    const handler = () => {
      const activeCol = sheet.getActiveColumnIndex();
      setActiveColumnIndex(activeCol >= 0 ? activeCol : null);
    };

    handler();
    spreadInstance.bind(GC.Spread.Sheets.Events.SelectionChanged, handler);
    return () => {
      spreadInstance.unbind(GC.Spread.Sheets.Events.SelectionChanged, handler);
    };
  }, [spreadInstance]);

  useEffect(() => {
    if (!spreadInstance) return;
    const sheet = spreadInstance.getActiveSheet();
    if (!sheet) return;
    sheet.suspendPaint();
    columnKeys.forEach((key, index) => {
      const alignment = alignmentMap[key] ?? 'left';
      let hAlign = GC.Spread.Sheets.HorizontalAlign.left;
      if (alignment === 'center') {
        hAlign = GC.Spread.Sheets.HorizontalAlign.center;
      } else if (alignment === 'right') {
        hAlign = GC.Spread.Sheets.HorizontalAlign.right;
      }
      sheet.getRange(-1, index, -1, 1).hAlign(hAlign);
      sheet.getRange(0, index, 1, 1, GC.Spread.Sheets.SheetArea.colHeader).hAlign(hAlign);
    });
    sheet.resumePaint();
    sheet.repaint();
  }, [alignmentMap, columnKeys, spreadInstance]);

  const activeAlignment =
    activeColumnIndex !== null && columnKeys[activeColumnIndex]
      ? alignmentMap[columnKeys[activeColumnIndex]] ?? 'left'
      : null;

  const handleInsert = useCallback(() => {
    const normalized = ensureMatrixShape(tableMatrix, columnKeys.length);
    onInsertTable(normalized, columnKeys.map(key => alignmentMap[key] ?? 'left'));
  }, [alignmentMap, columnKeys, onInsertTable, tableMatrix]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-4xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">テーブルウィザード</h3>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={onClose}
            aria-label="閉じる"
          >
            <IoClose size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-600 dark:text-gray-300">
              1 行目が Markdown テーブルのヘッダー行になります。セルは SpreadJS グリッド上で直接編集でき、右クリックメニューから行・列の追加や削除も行えます。
            </p>

            <div className="flex justify-end">
              <div className="flex items-center gap-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2 py-1">
                <span className="text-xs text-gray-600 dark:text-gray-300">配置</span>
                <div className="flex overflow-hidden rounded border border-gray-200 dark:border-gray-700">
                  <button
                    className={`px-2 py-1 text-xs ${
                      activeAlignment === 'left'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => applyAlignment('left')}
                    disabled={!spreadInstance}
                    title="左揃え (選択されたセル/列)"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 3h12v1H2zM2 6h8v1H2zM2 9h12v1H2zM2 12h8v1H2z" />
                    </svg>
                  </button>
                  <button
                    className={`px-2 py-1 text-xs border-l border-gray-200 dark:border-gray-700 ${
                      activeAlignment === 'center'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => applyAlignment('center')}
                    disabled={!spreadInstance}
                    title="中央揃え (選択されたセル/列)"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 3h12v1H2zM4 6h8v1H4zM2 9h12v1H2zM4 12h8v1H4z" />
                    </svg>
                  </button>
                  <button
                    className={`px-2 py-1 text-xs border-l border-gray-200 dark:border-gray-700 ${
                      activeAlignment === 'right'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => applyAlignment('right')}
                    disabled={!spreadInstance}
                    title="右揃え (選択されたセル/列)"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 3h12v1H2zM6 6h8v1H6zM2 9h12v1H2zM6 12h8v1H6z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[360px] rounded border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
            <SpreadSheetEditor
              data={spreadData}
              columns={columnKeys}
              onDataChange={handleDataChange}
              height="100%"
              sheetName="MarkdownTable"
              bindColumns={false}
              preserveEmptyRows
              onWorkbookReady={setSpreadInstance}
            />
          </div>

          <div className="pt-4 border-t flex justify-end gap-2">
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
