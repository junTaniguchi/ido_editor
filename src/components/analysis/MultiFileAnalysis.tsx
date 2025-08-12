'use client';

import React, { useState, useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { parseCSV, parseJSON, parseYAML } from '@/lib/dataPreviewUtils';
import { combineMultipleFiles, compareMultipleFileStatistics, createCrossTabFromFiles } from '@/lib/dataAnalysisUtils';
import { IoAnalyticsOutline, IoBarChartOutline, IoStatsChartOutline, IoCloseOutline, IoCheckboxOutline, IoSquareOutline } from 'react-icons/io5';
import QueryResultTable from './QueryResultTable';

interface MultiFileAnalysisProps {
  onClose: () => void;
}

const MultiFileAnalysis: React.FC<MultiFileAnalysisProps> = ({ onClose }) => {
  const { 
    selectedFiles,
    clearSelectedFiles,
    rootDirHandle
  } = useEditorStore();

  // 状態管理
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileDataMap, setFileDataMap] = useState<Map<string, any[]>>(new Map());
  const [analysisType, setAnalysisType] = useState<'combine' | 'compare' | 'crosstab'>('combine');
  const [joinType, setJoinType] = useState<'union' | 'intersection' | 'join'>('union');
  const [joinKeys, setJoinKeys] = useState<string[]>([]);
  const [comparisonColumns, setComparisonColumns] = useState<string[]>([]);
  const [crossTabSettings, setCrossTabSettings] = useState({
    rowField: '',
    colField: '',
    valueField: '',
    aggregation: 'sum' as 'sum' | 'avg' | 'count' | 'min' | 'max'
  });
  const [result, setResult] = useState<any[] | null>(null);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  // 選択されたファイルを読み込み
  useEffect(() => {
    loadSelectedFiles();
  }, [selectedFiles]);

  const loadSelectedFiles = async () => {
    if (selectedFiles.size === 0 || !rootDirHandle) return;

    setLoading(true);
    setError(null);
    
    try {
      const newFileDataMap = new Map<string, any[]>();
      const allColumns = new Set<string>();

      for (const filePath of selectedFiles) {
        try {
          // ファイルハンドルを取得（簡略化、実際は階層構造を辿る必要あり）
          const pathParts = filePath.split('/').filter(part => part);
          let currentHandle: FileSystemDirectoryHandle = rootDirHandle;
          
          // ディレクトリを辿る
          for (let i = 0; i < pathParts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]);
          }
          
          // ファイルを取得
          const fileName = pathParts[pathParts.length - 1];
          const fileHandle = await currentHandle.getFileHandle(fileName);
          const file = await fileHandle.getFile();
          const content = await file.text();

          // ファイル形式に応じてパース
          let data: any[] = [];
          const extension = fileName.split('.').pop()?.toLowerCase();
          
          switch (extension) {
            case 'csv':
              const csvResult = parseCSV(content);
              if (csvResult.error) throw new Error(csvResult.error);
              data = csvResult.data || [];
              break;
            case 'json':
              const jsonResult = parseJSON(content);
              if (jsonResult.error) throw new Error(jsonResult.error);
              data = Array.isArray(jsonResult.data) ? jsonResult.data : [jsonResult.data];
              break;
            case 'yaml':
            case 'yml':
              const yamlResult = parseYAML(content);
              if (yamlResult.error) throw new Error(yamlResult.error);
              data = Array.isArray(yamlResult.data) ? yamlResult.data : [yamlResult.data];
              break;
            default:
              console.warn(`Unsupported file format: ${extension}`);
              continue;
          }

          newFileDataMap.set(filePath, data);
          
          // 列名を収集
          if (data.length > 0) {
            Object.keys(data[0]).forEach(col => allColumns.add(col));
          }

        } catch (fileError) {
          console.error(`Error loading file ${filePath}:`, fileError);
        }
      }

      setFileDataMap(newFileDataMap);
      setAvailableColumns(Array.from(allColumns));
      
    } catch (err) {
      console.error('Error loading selected files:', err);
      setError(err instanceof Error ? err.message : '複数ファイル読み込みエラー');
    } finally {
      setLoading(false);
    }
  };

  // 分析実行
  const executeAnalysis = () => {
    if (fileDataMap.size === 0) {
      setError('分析するファイルがありません');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      switch (analysisType) {
        case 'combine':
          const combineResult = combineMultipleFiles(fileDataMap, joinType, joinKeys);
          if (combineResult.error) {
            setError(combineResult.error);
          } else {
            setResult(combineResult.data);
          }
          break;

        case 'compare':
          if (comparisonColumns.length === 0) {
            setError('比較する列を選択してください');
            return;
          }
          const compareResult = compareMultipleFileStatistics(fileDataMap, comparisonColumns);
          if (compareResult.error) {
            setError(compareResult.error);
          } else {
            // 統計情報を表形式に変換
            const statsData: any[] = [];
            if (compareResult.stats) {
              Object.keys(compareResult.stats).forEach(fileName => {
                const fileStats = compareResult.stats![fileName];
                Object.keys(fileStats).forEach(column => {
                  statsData.push({
                    ファイル名: fileName,
                    列名: column,
                    ...fileStats[column]
                  });
                });
              });
            }
            setResult(statsData);
          }
          break;

        case 'crosstab':
          if (!crossTabSettings.rowField || !crossTabSettings.valueField) {
            setError('行フィールドと値フィールドを選択してください');
            return;
          }
          const crossTabResult = createCrossTabFromFiles(
            fileDataMap,
            crossTabSettings.rowField,
            crossTabSettings.colField,
            crossTabSettings.valueField,
            crossTabSettings.aggregation
          );
          if (crossTabResult.error) {
            setError(crossTabResult.error);
          } else {
            setResult(crossTabResult.data);
          }
          break;
      }
    } catch (err) {
      console.error('Analysis execution error:', err);
      setError(err instanceof Error ? err.message : '分析実行エラー');
    } finally {
      setLoading(false);
    }
  };

  // 列選択の切り替え
  const toggleColumnSelection = (column: string) => {
    setComparisonColumns(prev => 
      prev.includes(column) 
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center">
          <IoAnalyticsOutline size={24} className="mr-2 text-blue-600" />
          <h2 className="text-lg font-semibold">複数ファイル分析</h2>
          <span className="ml-2 text-sm text-gray-500">
            ({selectedFiles.size}個のファイルを選択中)
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded hover:bg-gray-100"
          title="閉じる"
        >
          <IoCloseOutline size={20} />
        </button>
      </div>

      {/* 設定パネル */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        {/* 分析タイプ選択 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            分析タイプ
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="combine"
                checked={analysisType === 'combine'}
                onChange={(e) => setAnalysisType(e.target.value as any)}
                className="mr-2"
              />
              データ統合
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="compare"
                checked={analysisType === 'compare'}
                onChange={(e) => setAnalysisType(e.target.value as any)}
                className="mr-2"
              />
              統計比較
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="crosstab"
                checked={analysisType === 'crosstab'}
                onChange={(e) => setAnalysisType(e.target.value as any)}
                className="mr-2"
              />
              クロス集計
            </label>
          </div>
        </div>

        {/* データ統合設定 */}
        {analysisType === 'combine' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              結合方式
            </label>
            <select
              value={joinType}
              onChange={(e) => setJoinType(e.target.value as any)}
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value="union">全結合（縦に連結）</option>
              <option value="intersection">共通列のみ</option>
              <option value="join">キー結合</option>
            </select>
            
            {joinType === 'join' && (
              <div className="mt-2">
                <label className="block text-sm text-gray-600 mb-1">
                  結合キー（カンマ区切り）
                </label>
                <input
                  type="text"
                  value={joinKeys.join(', ')}
                  onChange={(e) => setJoinKeys(e.target.value.split(',').map(k => k.trim()).filter(k => k))}
                  placeholder="例: id, name"
                  className="w-full p-2 border border-gray-300 rounded text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* 統計比較設定 */}
        {analysisType === 'compare' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              比較する列を選択
            </label>
            <div className="max-h-32 overflow-y-auto border border-gray-300 rounded p-2 bg-white">
              {availableColumns.map(column => (
                <label key={column} className="flex items-center p-1 hover:bg-gray-50">
                  <button
                    onClick={() => toggleColumnSelection(column)}
                    className="mr-2"
                  >
                    {comparisonColumns.includes(column) ? (
                      <IoCheckboxOutline size={16} className="text-blue-600" />
                    ) : (
                      <IoSquareOutline size={16} className="text-gray-400" />
                    )}
                  </button>
                  <span className="text-sm">{column}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* クロス集計設定 */}
        {analysisType === 'crosstab' && (
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                行フィールド
              </label>
              <select
                value={crossTabSettings.rowField}
                onChange={(e) => setCrossTabSettings(prev => ({ ...prev, rowField: e.target.value }))}
                className="w-full p-2 border border-gray-300 rounded"
              >
                <option value="">選択してください</option>
                {availableColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                値フィールド
              </label>
              <select
                value={crossTabSettings.valueField}
                onChange={(e) => setCrossTabSettings(prev => ({ ...prev, valueField: e.target.value }))}
                className="w-full p-2 border border-gray-300 rounded"
              >
                <option value="">選択してください</option>
                {availableColumns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                集計方法
              </label>
              <select
                value={crossTabSettings.aggregation}
                onChange={(e) => setCrossTabSettings(prev => ({ ...prev, aggregation: e.target.value as any }))}
                className="w-full p-2 border border-gray-300 rounded"
              >
                <option value="sum">合計</option>
                <option value="avg">平均</option>
                <option value="count">カウント</option>
                <option value="min">最小</option>
                <option value="max">最大</option>
              </select>
            </div>
          </div>
        )}

        {/* 実行ボタン */}
        <div className="flex space-x-2">
          <button
            onClick={executeAnalysis}
            disabled={loading || fileDataMap.size === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
          >
            <IoBarChartOutline size={16} className="mr-2" />
            分析実行
          </button>
          <button
            onClick={() => {
              clearSelectedFiles();
              onClose();
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            選択をクリア
          </button>
        </div>
      </div>

      {/* 結果表示エリア */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">処理中...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded m-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {result && result.length > 0 && (
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <IoStatsChartOutline size={20} className="mr-2" />
              分析結果 ({result.length}件)
            </h3>
            <div className="border border-gray-200 rounded">
              <QueryResultTable data={result} />
            </div>
          </div>
        )}

        {fileDataMap.size === 0 && !loading && (
          <div className="flex items-center justify-center p-8 text-gray-500">
            <p>分析するファイルを選択してください</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiFileAnalysis;