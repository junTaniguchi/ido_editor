'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import '@grapecity/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import { GcSpreadSheets } from '@grapecity/spread-sheets-react';
import * as GC from '@grapecity/spread-sheets';
import ExcelIO from '@grapecity/spread-excelio';
import { IoAlertCircleOutline, IoRefresh } from 'react-icons/io5';

interface ExcelPreviewProps {
  content: ArrayBuffer;
  fileName: string;
}

const hostStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
};

const ExcelPreview: React.FC<ExcelPreviewProps> = ({ content, fileName }) => {
  const spreadRef = useRef<GC.Spread.Sheets.Workbook | null>(null);
  const excelIoRef = useRef(new ExcelIO.IO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const importWorkbook = useCallback(() => {
    if (!content || !spreadRef.current) {
      return;
    }

    setLoading(true);
    setError(null);

    const excelIo = excelIoRef.current;
    const blob = new Blob([content]);

    excelIo.open(
      blob,
      (json: GC.Spread.Sheets.WorkbookJSON) => {
        try {
          spreadRef.current?.fromJSON(json);
        } catch (err) {
          console.error('Excel JSON 読み込みエラー:', err);
          setError('Excelデータの表示中にエラーが発生しました');
        } finally {
          setLoading(false);
        }
      },
      (err: unknown) => {
        console.error('Excel 読み込みエラー:', err);
        setError('Excelファイルの読み込みに失敗しました');
        setLoading(false);
      }
    );
  }, [content]);

  const handleWorkbookInitialized = (spread: GC.Spread.Sheets.Workbook) => {
    spreadRef.current = spread;
    spread.options.tabStripVisible = true;
    spread.options.grayAreaBackColor = '#f8fafc';
    spread.options.backColor = '#ffffff';
    spread.options.allowUserZoom = true;
    spread.options.allowUserResize = true;

    const sheetCount = spread.getSheetCount();
    for (let index = 0; index < sheetCount; index += 1) {
      const sheet = spread.getSheet(index);
      if (!sheet) continue;
      sheet.options.allowCellOverflow = true;
      sheet.defaults.rowHeight = 26;
      sheet.defaults.colWidth = 110;
      sheet.options.isProtected = false;
      sheet.getRange(-1, -1, -1, -1).locked(false);
    }

    importWorkbook();
  };

  useEffect(() => {
    if (!spreadRef.current) return;
    importWorkbook();
  }, [content, importWorkbook]);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-900">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{fileName}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">SpreadJSでExcelファイルを表示・編集できます</p>
        </div>
        <button
          onClick={importWorkbook}
          className="inline-flex items-center rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <IoRefresh className="mr-1" /> 再読み込み
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
          <IoAlertCircleOutline />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span>Excelデータを読み込んでいます...</span>
        </div>
      )}

      <div className="flex-1">
        <GcSpreadSheets workbookInitialized={handleWorkbookInitialized} hostStyle={hostStyle} />
      </div>
    </div>
  );
};

export default ExcelPreview;
