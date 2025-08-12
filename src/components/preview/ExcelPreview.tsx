'use client';

import React, { useState, useEffect } from 'react';
import { IoGridOutline, IoOptions, IoRefresh, IoPlay } from 'react-icons/io5';
import { 
  getExcelSheets, 
  parseExcel, 
  ExcelSheetInfo, 
  ExcelParseOptions 
} from '@/lib/dataPreviewUtils';
import QueryResultTable from '@/components/analysis/QueryResultTable';

interface ExcelPreviewProps {
  content: ArrayBuffer;
  fileName: string;
}

const ExcelPreview: React.FC<ExcelPreviewProps> = ({ content, fileName }) => {
  const [sheets, setSheets] = useState<ExcelSheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  
  // パース設定
  const [parseOptions, setParseOptions] = useState<ExcelParseOptions>({
    startRow: 1,
    startCol: 1,
    hasHeader: true
  });

  // 初期化：シート情報を取得
  useEffect(() => {
    try {
      const sheetList = getExcelSheets(content);
      setSheets(sheetList);
      if (sheetList.length > 0) {
        setSelectedSheet(sheetList[0].name);
        // 初期プレビューを読み込み
        loadSheetData(sheetList[0].name, parseOptions);
      }
    } catch (err) {
      setError(`Excelファイルの読み取りに失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [content]);

  // シートデータの読み込み
  const loadSheetData = async (sheetName: string, options: ExcelParseOptions) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = parseExcel(content, {
        ...options,
        sheetName
      });
      setParsedData(data);
    } catch (err) {
      setError(`データの読み取りに失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setParsedData(null);
    } finally {
      setLoading(false);
    }
  };

  // シート変更処理
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    loadSheetData(sheetName, parseOptions);
  };

  // パース設定変更処理
  const handleOptionsChange = (newOptions: Partial<ExcelParseOptions>) => {
    const updatedOptions = { ...parseOptions, ...newOptions };
    setParseOptions(updatedOptions);
  };

  // データの再読み込み
  const handleReload = () => {
    if (selectedSheet) {
      loadSheetData(selectedSheet, parseOptions);
    }
  };

  const currentSheet = sheets.find(s => s.name === selectedSheet);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* ヘッダー */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <IoGridOutline className="mr-2 text-green-600" size={24} />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {fileName}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {sheets.length} シート
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="px-3 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 flex items-center"
            >
              <IoOptions className="mr-1" size={16} />
              設定
            </button>
            <button
              onClick={handleReload}
              disabled={loading}
              className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center disabled:opacity-50"
            >
              <IoRefresh className="mr-1" size={16} />
              再読み込み
            </button>
          </div>
        </div>

        {/* シート選択 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {sheets.map((sheet) => (
            <button
              key={sheet.name}
              onClick={() => handleSheetChange(sheet.name)}
              className={`px-3 py-2 rounded text-sm transition-colors ${
                selectedSheet === sheet.name
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {sheet.name}
              <span className="ml-2 text-xs opacity-75">
                ({sheet.rowCount}×{sheet.colCount})
              </span>
            </button>
          ))}
        </div>

        {/* パース設定パネル */}
        {showOptions && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              読み取り設定
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  開始行
                </label>
                <input
                  type="number"
                  min="1"
                  max={currentSheet?.rowCount || 1}
                  value={parseOptions.startRow || 1}
                  onChange={(e) => handleOptionsChange({ startRow: parseInt(e.target.value) || 1 })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  開始列
                </label>
                <input
                  type="number"
                  min="1"
                  max={currentSheet?.colCount || 1}
                  value={parseOptions.startCol || 1}
                  onChange={(e) => handleOptionsChange({ startCol: parseInt(e.target.value) || 1 })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  終了行（オプション）
                </label>
                <input
                  type="number"
                  min={parseOptions.startRow || 1}
                  max={currentSheet?.rowCount || 1}
                  value={parseOptions.endRow || ''}
                  onChange={(e) => handleOptionsChange({ endRow: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="全て"
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  終了列（オプション）
                </label>
                <input
                  type="number"
                  min={parseOptions.startCol || 1}
                  max={currentSheet?.colCount || 1}
                  value={parseOptions.endCol || ''}
                  onChange={(e) => handleOptionsChange({ endCol: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="全て"
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={parseOptions.hasHeader !== false}
                  onChange={(e) => handleOptionsChange({ hasHeader: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  先頭行をヘッダーとして使用
                </span>
              </label>
              <button
                onClick={handleReload}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
              >
                <IoPlay className="mr-1" size={14} />
                適用
              </button>
            </div>
          </div>
        )}

        {/* 現在のシート情報 */}
        {currentSheet && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <strong>{currentSheet.name}</strong> - 
            範囲: {currentSheet.range} ({currentSheet.rowCount}行 × {currentSheet.colCount}列)
            {parsedData && (
              <span> | 読み込み済み: {parsedData.length}行</span>
            )}
          </div>
        )}
      </div>

      {/* コンテンツエリア */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-gray-600 dark:text-gray-400">データを読み込み中...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-red-600 dark:text-red-400">
              <p className="mb-2">⚠️ エラーが発生しました</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && parsedData && (
          <div className="h-full overflow-auto">
            <QueryResultTable data={parsedData} />
          </div>
        )}

        {!loading && !error && !parsedData && (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400">
              シートを選択してデータを表示
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExcelPreview;