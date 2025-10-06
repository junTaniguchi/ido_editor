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

    const sheetColumns = normalizedColumns.length > 0
      ? normalizedColumns
      : Array.from({ length: sheet.getColumnCount(GC.Spread.Sheets.SheetArea.viewport) }, (_, index) => `Column${index + 1}`);

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
  }, [normalizedColumns]);

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

    if (!readOnly) {
      sheet.getRange(-1, -1, -1, -1).locked(false);
    }

    sheet.resumePaint();
  }, [data, normalizedColumns, readOnly, sheetName]);

  const handleWorkbookInitialized = useCallback((spread: GC.Spread.Sheets.Workbook) => {
    spreadRef.current = spread;
    spread.options.tabStripVisible = false;
    spread.options.grayAreaBackColor = '#f8fafc';
    const sheet = spread.getActiveSheet();
    configureSheet(sheet);
    attachListeners();

    if (onDataChange) {
      onDataChange(extractRows());
    }
  }, [attachListeners, configureSheet, extractRows, onDataChange]);

  useEffect(() => {
    return () => {
      detachListeners();
    };
  }, [detachListeners]);

  useEffect(() => {
    const spread = spreadRef.current;
    if (!spread) return;
    const sheet = spread.getActiveSheet();
    configureSheet(sheet);
    detachListeners();
    attachListeners();
    if (onDataChange) {
      onDataChange(extractRows());
    }
  }, [attachListeners, configureSheet, detachListeners, extractRows, onDataChange]);

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
