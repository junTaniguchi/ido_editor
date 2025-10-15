'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import '@grapecity/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import { SpreadSheets } from '@grapecity/spread-sheets-react';
import * as GC from '@grapecity/spread-sheets';

export interface SpreadSheetEditorProps {
  data: any[];
  columns?: string[];
  readOnly?: boolean;
  onDataChange?: (rows: any[]) => void;
  height?: string | number;
  sheetName?: string;
}

const cloneRows = (rows: any[]): any[] => rows.map(row => ({ ...row }));

const defaultHostStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
};

const SpreadSheetEditor: React.FC<SpreadSheetEditorProps> = ({
  data,
  columns,
  readOnly = false,
  onDataChange,
  height,
  sheetName,
}) => {
  const spreadRef = useRef<GC.Spread.Sheets.Workbook | null>(null);
  const handlerRef = useRef<(() => void) | null>(null);
  const clipboardHandlerRef = useRef<(() => void) | null>(null);

  const normalizedColumns = useMemo(() => {
    if (columns && columns.length > 0) {
      return columns;
    }
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      return Object.keys(data[0]);
    }
    return [];
  }, [columns, data]);

  const detachListeners = useCallback(() => {
    const spread = spreadRef.current;
    if (!spread || !handlerRef.current) return;
    const unbind = handlerRef.current;
    unbind();
    handlerRef.current = null;
  }, []);

  const buildColumnNames = useCallback((sheet: GC.Spread.Sheets.Worksheet) => {
    const columnCount = sheet.getColumnCount(GC.Spread.Sheets.SheetArea.viewport);

    if (normalizedColumns.length === 0) {
      return Array.from({ length: columnCount }, (_, index) => `Column${index + 1}`);
    }

    if (normalizedColumns.length >= columnCount) {
      return normalizedColumns;
    }

    const additionalColumns = Array.from(
      { length: columnCount - normalizedColumns.length },
      (_, index) => `Column${normalizedColumns.length + index + 1}`,
    );

    return [...normalizedColumns, ...additionalColumns];
  }, [normalizedColumns]);

  const extractRows = useCallback((): any[] => {
    const spread = spreadRef.current;
    if (!spread) return [];
    const sheet = spread.getActiveSheet();
    if (!sheet) return [];

    const dataSource = sheet.getDataSource() as any;
    if (Array.isArray(dataSource)) {
      return dataSource.map(row => ({ ...row }));
    }
    if (dataSource && typeof dataSource.getSource === 'function') {
      const source = dataSource.getSource();
      if (Array.isArray(source)) {
        return source.map((row: any) => ({ ...row }));
      }
    }

    const sheetColumns = buildColumnNames(sheet);

    const rowCount = sheet.getRowCount(GC.Spread.Sheets.SheetArea.viewport);
    const extracted: any[] = [];

    for (let row = 0; row < rowCount; row += 1) {
      const record: Record<string, any> = {};
      let hasValue = false;

      sheetColumns.forEach((columnName, columnIndex) => {
        const value = sheet.getValue(row, columnIndex, GC.Spread.Sheets.SheetArea.viewport);
        if (value !== null && value !== undefined && value !== '') {
          hasValue = true;
        }
        record[columnName] = value ?? '';
      });

      if (hasValue) {
        extracted.push(record);
      }
    }

    return extracted;
  }, [buildColumnNames]);

  const ensureColumnHeaders = useCallback((sheet: GC.Spread.Sheets.Worksheet) => {
    const columnNames = buildColumnNames(sheet);
    columnNames.forEach((columnName, columnIndex) => {
      sheet.setValue(0, columnIndex, columnName, GC.Spread.Sheets.SheetArea.colHeader);
    });
  }, [buildColumnNames]);

  const detachClipboardListener = useCallback(() => {
    if (!clipboardHandlerRef.current) return;
    clipboardHandlerRef.current();
    clipboardHandlerRef.current = null;
  }, []);

  const attachClipboardListener = useCallback(() => {
    const spread = spreadRef.current;
    if (!spread) return;

    detachClipboardListener();

    const handler = (_: GC.Spread.Sheets.Workbook, args: GC.Spread.Sheets.ClipboardPastingEventArgs) => {
      const sheet = args.sheet ?? spread.getActiveSheet();
      if (!sheet || args.cancel) {
        return;
      }

      const cellRange = args.cellRange;
      if (!cellRange) {
        return;
      }

      const startRow = Math.max(cellRange.row ?? 0, 0);
      const startColumn = Math.max(cellRange.col ?? 0, 0);

      const currentRowCount = sheet.getRowCount(GC.Spread.Sheets.SheetArea.viewport);
      const currentColumnCount = sheet.getColumnCount(GC.Spread.Sheets.SheetArea.viewport);

      let pasteRowCount = 0;
      let pasteColumnCount = 0;

      const dataTable = args.pasteData?.dataTable;
      if (Array.isArray(dataTable) && dataTable.length > 0) {
        pasteRowCount = dataTable.length;
        pasteColumnCount = dataTable.reduce((max, row) => {
          if (!row) return max;
          const length = Array.isArray(row) ? row.length : Object.keys(row).length;
          return Math.max(max, length);
        }, 0);
      }

      if (pasteRowCount === 0 || pasteColumnCount === 0) {
        const text = args.text ?? args.pasteData?.text;
        if (typeof text === 'string' && text.length > 0) {
          const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          const rows = normalized.split('\n');
          if (rows[rows.length - 1] === '') {
            rows.pop();
          }
          if (rows.length > 0) {
            pasteRowCount = Math.max(pasteRowCount, rows.length);
            pasteColumnCount = Math.max(
              pasteColumnCount,
              ...rows.map(row => (row === '' ? 1 : row.split('\t').length)),
            );
          }
        }
      }

      if (pasteRowCount === 0 || pasteColumnCount === 0) {
        return;
      }

      const requiredRowCount = Math.max(currentRowCount, startRow + pasteRowCount);
      const requiredColumnCount = Math.max(currentColumnCount, startColumn + pasteColumnCount);

      if (requiredRowCount > currentRowCount) {
        sheet.setRowCount(requiredRowCount, GC.Spread.Sheets.SheetArea.viewport);
      }

      if (requiredColumnCount > currentColumnCount) {
        sheet.setColumnCount(requiredColumnCount, GC.Spread.Sheets.SheetArea.viewport);
        ensureColumnHeaders(sheet);
      }
    };

    spread.bind(GC.Spread.Sheets.Events.ClipboardPasting, handler);

    clipboardHandlerRef.current = () => {
      spread.unbind(GC.Spread.Sheets.Events.ClipboardPasting, handler);
    };
  }, [detachClipboardListener, ensureColumnHeaders]);

  const attachListeners = useCallback(() => {
    const spread = spreadRef.current;
    if (!spread || !onDataChange) return;

    const handler = () => {
      const rows = extractRows();
      onDataChange(rows);
    };

    spread.bind(GC.Spread.Sheets.Events.ValueChanged, handler);
    spread.bind(GC.Spread.Sheets.Events.RowChanged, handler);
    spread.bind(GC.Spread.Sheets.Events.ColumnChanged, handler);

    handlerRef.current = () => {
      spread.unbind(GC.Spread.Sheets.Events.ValueChanged, handler);
      spread.unbind(GC.Spread.Sheets.Events.RowChanged, handler);
      spread.unbind(GC.Spread.Sheets.Events.ColumnChanged, handler);
    };
  }, [extractRows, onDataChange]);

  const configureSheet = useCallback((sheet: GC.Spread.Sheets.Worksheet) => {
    sheet.suspendPaint();

    if (sheetName) {
      sheet.name(sheetName);
    }

    sheet.options.allowAddNew = !readOnly;
    sheet.options.allowDelete = !readOnly;
    sheet.options.allowDragDrop = !readOnly;
    sheet.options.allowDragFill = !readOnly;
    sheet.options.allowCellOverflow = true;
    sheet.defaults.rowHeight = 28;
    sheet.defaults.colWidth = 120;
    sheet.options.isProtected = readOnly;
    sheet.options.protectionOptions = {
      ...sheet.options.protectionOptions,
      allowResizeRows: true,
      allowResizeColumns: true,
    };

    const style = new GC.Spread.Sheets.Style();
    style.backColor = '#ffffff';
    sheet.setDefaultStyle(style);

    const bindingColumns = normalizedColumns.map((columnName) => ({
      name: columnName,
      displayName: columnName,
      dataField: columnName,
    }));

    sheet.autoGenerateColumns = bindingColumns.length === 0;

    if (bindingColumns.length > 0) {
      sheet.bindColumns(bindingColumns as any);
    } else {
      sheet.bindColumns(null as any);
    }

    const source = cloneRows(data ?? []);
    sheet.setDataSource(source);
    ensureColumnHeaders(sheet);

    if (!readOnly) {
      sheet.getRange(-1, -1, -1, -1).locked(false);
    }

    sheet.resumePaint();
  }, [data, ensureColumnHeaders, normalizedColumns, readOnly, sheetName]);

  const handleWorkbookInitialized = useCallback((spread: GC.Spread.Sheets.Workbook) => {
    spreadRef.current = spread;
    spread.options.tabStripVisible = false;
    spread.options.grayAreaBackColor = '#f8fafc';
    spread.options.allowUserResize = true;
    const sheet = spread.getActiveSheet();
    configureSheet(sheet);
    attachListeners();
    attachClipboardListener();

    if (onDataChange) {
      onDataChange(extractRows());
    }
  }, [attachClipboardListener, attachListeners, configureSheet, extractRows, onDataChange]);

  useEffect(() => {
    return () => {
      detachListeners();
      detachClipboardListener();
    };
  }, [detachClipboardListener, detachListeners]);

  useEffect(() => {
    const spread = spreadRef.current;
    if (!spread) return;
    const sheet = spread.getActiveSheet();
    configureSheet(sheet);
    detachListeners();
    attachListeners();
    attachClipboardListener();
    if (onDataChange) {
      onDataChange(extractRows());
    }
  }, [attachClipboardListener, attachListeners, configureSheet, detachListeners, extractRows, onDataChange]);

  return (
    <SpreadSheets
      workbookInitialized={handleWorkbookInitialized}
      hostStyle={{
        ...defaultHostStyle,
        height: height ?? '100%',
      }}
    />
  );
};

export default SpreadSheetEditor;
