'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { parseCSV, parseJSON, parseYAML } from '@/lib/dataPreviewUtils';
import { 
  combineMultipleFiles, 
  compareMultipleFileStatistics, 
  createCrossTabFromFiles,
  executeQuery,
  executeMultiFileQueryAnalysis,
  calculateStatistics,
  prepareChartData,
  calculateInfo,
  aggregateData
} from '@/lib/dataAnalysisUtils';
import { 
  IoAnalyticsOutline, 
  IoBarChartOutline, 
  IoStatsChartOutline, 
  IoCloseOutline, 
  IoCheckboxOutline, 
  IoSquareOutline,
  IoCodeSlash,
  IoEye,
  IoLayersOutline,
  IoGitNetwork
} from 'react-icons/io5';
import QueryResultTable from './QueryResultTable';
import InfoResultTable from './InfoResultTable';
import EditableQueryResultTable from './EditableQueryResultTable';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import dynamic from 'next/dynamic';

// Chart.jsコンポーネントを登録
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

// 関係グラフコンポーネントを動的インポート（SSR回避）
const RelationshipGraph = dynamic(() => import('./RelationshipGraph'), { ssr: false });

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
  
  // 分析タブの管理
  const [activeTab, setActiveTab] = useState<'combine' | 'query' | 'stats' | 'chart' | 'relationship'>('combine');
  
  // データ統合関連
  const [joinType, setJoinType] = useState<'union' | 'intersection' | 'join'>('union');
  const [joinKeys, setJoinKeys] = useState<string[]>([]);
  const [comparisonColumns, setComparisonColumns] = useState<string[]>([]);
  const [crossTabSettings, setCrossTabSettings] = useState({
    rowField: '',
    colField: '',
    valueField: '',
    aggregation: 'sum' as 'sum' | 'avg' | 'count' | 'min' | 'max'
  });
  
  // 統合データと結果
  const [combinedData, setCombinedData] = useState<any[] | null>(null);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  
  // SQL クエリ関連
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM combined');
  const [queryResult, setQueryResult] = useState<any[] | null>(null);
  const [isQueryEditing, setIsQueryEditing] = useState(false);
  const [editedQueryResult, setEditedQueryResult] = useState<any[] | null>(null);
  const [showQueryHelp, setShowQueryHelp] = useState(false);
  
  // 統計情報関連
  const [statisticsResult, setStatisticsResult] = useState<Record<string, any> | null>(null);
  const [infoResult, setInfoResult] = useState<Record<string, any> | null>(null);
  
  // チャート関連
  const [chartData, setChartData] = useState<any | null>(null);
  const { chartSettings, updateChartSettings } = useEditorStore();
  
  // テーマ関連
  const [currentTheme, setCurrentTheme] = useState<string>('light');
  
  // グラフコンテナのref
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 800, height: 600 });

  // テーマ設定
  useEffect(() => {
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const htmlElement = document.documentElement;
    const isDarkTheme = htmlElement.classList.contains('dark');
    
    setCurrentTheme(isDarkTheme || isDarkMode ? 'dark' : 'light');
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setCurrentTheme(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // グラフサイズ更新
  useEffect(() => {
    if (activeTab === 'relationship' && graphContainerRef.current) {
      const updateSize = () => {
        setGraphSize({
          width: graphContainerRef.current?.clientWidth || 800,
          height: (graphContainerRef.current?.clientHeight || 600) - 20
        });
      };
      
      updateSize();
      window.addEventListener('resize', updateSize);
      
      return () => {
        window.removeEventListener('resize', updateSize);
      };
    }
  }, [activeTab]);

  // 選択されたファイルを読み込み
  useEffect(() => {
    loadSelectedFiles();
  }, [selectedFiles]);

  // データが統合されたときの処理
  useEffect(() => {
    if (combinedData && combinedData.length > 0) {
      // 統計情報とinfo情報を自動計算
      const statsResult = calculateStatistics(combinedData, true);
      const infoRes = calculateInfo(combinedData, true);
      
      if (!statsResult.error && statsResult.stats) {
        setStatisticsResult(statsResult.stats);
      }
      
      if (!infoRes.error && infoRes.info) {
        setInfoResult(infoRes.info);
      }

      // チャート設定の初期化
      if (availableColumns.length > 0) {
        let numericCol = '';
        let categoryCol = '';
        
        for (const col of availableColumns) {
          if (col.startsWith('_source')) continue; // ソース情報列は除外
          
          const values = combinedData.map(row => row[col]);
          const isNumeric = values.some(val => typeof val === 'number' && !isNaN(val));
          
          if (isNumeric && !numericCol) {
            numericCol = col;
          } else if (!categoryCol) {
            categoryCol = col;
          }
          
          if (numericCol && categoryCol) break;
        }
        
        updateChartSettings({
          xAxis: categoryCol || availableColumns[0],
          yAxis: numericCol || availableColumns[availableColumns.length > 1 ? 1 : 0],
          dataSource: 'originalData'
        });
      }
    }
  }, [combinedData, availableColumns]);

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
      
      // データ統合を自動実行
      if (newFileDataMap.size > 0) {
        const combineResult = combineMultipleFiles(newFileDataMap, 'union');
        if (!combineResult.error && combineResult.data) {
          setCombinedData(combineResult.data);
        }
      }
      
    } catch (err) {
      console.error('Error loading selected files:', err);
      setError(err instanceof Error ? err.message : '複数ファイル読み込みエラー');
    } finally {
      setLoading(false);
    }
  };

  // SQLクエリ実行
  const executeQueryAnalysis = () => {
    if (!combinedData || combinedData.length === 0) {
      setError('実行するデータがありません');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = executeMultiFileQueryAnalysis(fileDataMap, combinedData, sqlQuery, true);
      if (result.error) {
        setError(result.error);
      } else {
        setQueryResult(result.data);
      }
    } catch (err) {
      console.error('Query execution error:', err);
      setError(err instanceof Error ? err.message : 'クエリ実行エラー');
    } finally {
      setLoading(false);
    }
  };

  // チャートデータ生成
  const generateChartData = () => {
    if (!combinedData || combinedData.length === 0) {
      setError('チャート作成用のデータがありません');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dataSource = chartSettings.dataSource === 'queryResult' && queryResult 
        ? queryResult 
        : combinedData;

      if (!dataSource || dataSource.length === 0) {
        setError('チャート用データソースが空です');
        setLoading(false);
        return;
      }

      let processedData = dataSource;

      // 集計が指定されている場合
      if (chartSettings.aggregation !== 'none') {
        const { data: aggregatedData, error } = aggregateData(
          dataSource,
          chartSettings.xAxis,
          chartSettings.yAxis,
          chartSettings.aggregation as any,
          true
        );

        if (error) {
          setError(error);
          setLoading(false);
          return;
        }

        processedData = aggregatedData || [];
      }

      const chartDataResult = prepareChartData(
        processedData,
        chartSettings.xAxis,
        chartSettings.yAxis,
        chartSettings.type as any,
        chartSettings.categoryField,
        chartSettings.options
      );

      if (chartDataResult) {
        setChartData(chartDataResult);
      } else {
        setError('チャートデータの生成に失敗しました');
      }
    } catch (err) {
      console.error('Chart generation error:', err);
      setError(err instanceof Error ? err.message : 'チャート生成エラー');
    } finally {
      setLoading(false);
    }
  };

  // データ統合実行
  const executeCombineAnalysis = () => {
    if (fileDataMap.size === 0) {
      setError('分析するファイルがありません');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const combineResult = combineMultipleFiles(fileDataMap, joinType, joinKeys);
      if (combineResult.error) {
        setError(combineResult.error);
      } else {
        setCombinedData(combineResult.data);
      }
    } catch (err) {
      console.error('Combine analysis execution error:', err);
      setError(err instanceof Error ? err.message : 'データ統合エラー');
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

      {/* タブナビゲーション */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'combine'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('combine')}
        >
          <IoLayersOutline className="inline mr-1" size={16} />
          データ統合
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'query'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('query')}
        >
          <IoCodeSlash className="inline mr-1" size={16} />
          クエリ
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'stats'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('stats')}
        >
          <IoStatsChartOutline className="inline mr-1" size={16} />
          統計情報
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'chart'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('chart')}
        >
          <IoBarChartOutline className="inline mr-1" size={16} />
          チャート
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'relationship'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('relationship')}
        >
          <IoGitNetwork className="inline mr-1" size={16} />
          関係性
        </button>
      </div>

      {/* 設定パネル */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        {/* データ統合設定 */}
        {activeTab === 'combine' && (
          <div>
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
            
            <button
              onClick={executeCombineAnalysis}
              disabled={loading || fileDataMap.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
            >
              <IoLayersOutline size={16} className="mr-2" />
              データ統合実行
            </button>
          </div>
        )}

        {/* SQLクエリ設定 */}
        {activeTab === 'query' && (
          <div>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  SQLクエリ
                </label>
                <button
                  onClick={() => setShowQueryHelp(!showQueryHelp)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {showQueryHelp ? 'ヘルプを隠す' : 'FROM句の書き方'}
                </button>
              </div>
              
              {showQueryHelp && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                  <h4 className="font-semibold mb-2">SQL構文の書き方：</h4>
                  
                  <div className="mb-3">
                    <p className="font-medium text-gray-800 mb-1">基本的なFROM句:</p>
                    <ul className="space-y-1 text-gray-700">
                      <li><code className="bg-gray-100 px-1 rounded">FROM combined</code> - 統合された全ファイルのデータ</li>
                      <li><code className="bg-gray-100 px-1 rounded">FROM ファイル名</code> - 特定のファイルのみ（拡張子なし）</li>
                    </ul>
                  </div>
                  
                  <div className="mb-3">
                    <p className="font-medium text-gray-800 mb-1">JOIN構文:</p>
                    <ul className="space-y-1 text-gray-700 text-xs">
                      <li><code className="bg-gray-100 px-1 rounded">FROM table1 JOIN table2 ON column1 = column2</code></li>
                      <li><code className="bg-gray-100 px-1 rounded">FROM table1 INNER JOIN table2 ON table1.id = table2.id</code></li>
                      <li><code className="bg-gray-100 px-1 rounded">FROM table1 LEFT JOIN table2 ON table1.key = table2.key</code></li>
                      <li><code className="bg-gray-100 px-1 rounded">FROM table1 RIGHT JOIN table2 ON table1.ref = table2.ref</code></li>
                    </ul>
                  </div>

                  <div className="mt-2 pt-2 border-t border-blue-200">
                    <p className="font-semibold mb-1">利用可能なファイル:</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(fileDataMap.keys()).map(filePath => {
                        const fileName = filePath.split('/').pop() || filePath;
                        const baseFileName = fileName.replace(/\.[^/.]+$/, '');
                        return (
                          <span key={filePath} className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {baseFileName}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="mt-2 pt-2 border-t border-blue-200">
                    <p className="font-semibold mb-1">クエリ例:</p>
                    <ul className="text-xs space-y-1">
                      <li><code className="bg-gray-100 px-1 rounded">SELECT * FROM combined WHERE _sourceFile = 'data1.csv'</code></li>
                      <li><code className="bg-gray-100 px-1 rounded">SELECT name, age FROM users WHERE age &gt; 25</code></li>
                      <li><code className="bg-gray-100 px-1 rounded">SELECT _sourceFile, COUNT(*) FROM combined GROUP BY _sourceFile</code></li>
                      <li><code className="bg-gray-100 px-1 rounded">SELECT u.name, o.amount FROM users u JOIN orders o ON u.id = o.user_id</code></li>
                    </ul>
                  </div>
                </div>
              )}
              
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={4}
                className="w-full p-2 border border-gray-300 rounded font-mono text-sm"
                placeholder="SELECT * FROM combined WHERE ..."
                disabled={!combinedData || combinedData.length === 0}
              />
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={executeQueryAnalysis}
                disabled={loading || !combinedData || combinedData.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              >
                <IoCodeSlash size={16} className="mr-2" />
                クエリ実行
              </button>
              
              {/* クエリサンプルボタン */}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setSqlQuery('SELECT * FROM combined')}
                  className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                >
                  全データ
                </button>
                <button
                  onClick={() => setSqlQuery('SELECT _sourceFile, COUNT(*) FROM combined GROUP BY _sourceFile')}
                  className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                >
                  ファイル別件数
                </button>
                {Array.from(fileDataMap.keys()).length >= 2 && (
                  <button
                    onClick={() => {
                      const fileNames = Array.from(fileDataMap.keys()).map(path => {
                        const fileName = path.split('/').pop() || path;
                        return fileName.replace(/\.[^/.]+$/, '');
                      });
                      setSqlQuery(`SELECT * FROM ${fileNames[0]} JOIN ${fileNames[1]} ON ${fileNames[0]}.id = ${fileNames[1]}.id`);
                    }}
                    className="px-2 py-1 text-xs bg-green-200 hover:bg-green-300 rounded"
                  >
                    JOIN例
                  </button>
                )}
                {Array.from(fileDataMap.keys()).length >= 2 && (
                  <button
                    onClick={() => {
                      const fileNames = Array.from(fileDataMap.keys()).map(path => {
                        const fileName = path.split('/').pop() || path;
                        return fileName.replace(/\.[^/.]+$/, '');
                      });
                      setSqlQuery(`SELECT a.*, b.* FROM ${fileNames[0]} a LEFT JOIN ${fileNames[1]} b ON a.key = b.key`);
                    }}
                    className="px-2 py-1 text-xs bg-green-200 hover:bg-green-300 rounded"
                  >
                    LEFT JOIN例
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* チャート設定 */}
        {activeTab === 'chart' && (
          <div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  チャートタイプ
                </label>
                <select
                  value={chartSettings.type}
                  onChange={(e) => updateChartSettings({ type: e.target.value as any })}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  <option value="bar">棒グラフ</option>
                  <option value="line">線グラフ</option>
                  <option value="pie">円グラフ</option>
                  <option value="scatter">散布図</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  データソース
                </label>
                <select
                  value={chartSettings.dataSource}
                  onChange={(e) => updateChartSettings({ dataSource: e.target.value as any })}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  <option value="originalData">統合データ</option>
                  <option value="queryResult">クエリ結果</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  X軸
                </label>
                <select
                  value={chartSettings.xAxis}
                  onChange={(e) => updateChartSettings({ xAxis: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Y軸
                </label>
                <select
                  value={chartSettings.yAxis}
                  onChange={(e) => updateChartSettings({ yAxis: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <button
              onClick={generateChartData}
              disabled={loading || !combinedData || combinedData.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
            >
              <IoBarChartOutline size={16} className="mr-2" />
              チャート作成
            </button>
          </div>
        )}

        {/* 共通ボタン */}
        {activeTab !== 'stats' && activeTab !== 'relationship' && (
          <div className="flex justify-end mt-4 pt-4 border-t border-gray-200">
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
        )}
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

        {/* データ統合タブ */}
        {activeTab === 'combine' && combinedData && combinedData.length > 0 && (
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <IoLayersOutline size={20} className="mr-2" />
              統合データ ({combinedData.length}件)
            </h3>
            <div className="border border-gray-200 rounded">
              <QueryResultTable data={combinedData} />
            </div>
          </div>
        )}

        {/* クエリタブ */}
        {activeTab === 'query' && queryResult && queryResult.length > 0 && (
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <IoCodeSlash size={20} className="mr-2" />
              クエリ結果 ({queryResult.length}件)
            </h3>
            <div className="border border-gray-200 rounded">
              {isQueryEditing ? (
                <EditableQueryResultTable 
                  data={editedQueryResult || queryResult} 
                  onDataChange={setEditedQueryResult}
                />
              ) : (
                <QueryResultTable data={queryResult} />
              )}
            </div>
            <div className="mt-2 flex space-x-2">
              <button
                onClick={() => setIsQueryEditing(!isQueryEditing)}
                className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
              >
                <IoEye size={14} className="inline mr-1" />
                {isQueryEditing ? '表示モード' : '編集モード'}
              </button>
            </div>
          </div>
        )}

        {/* 統計タブ */}
        {activeTab === 'stats' && (
          <div className="p-4 space-y-4">
            {statisticsResult && (
              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center">
                  <IoStatsChartOutline size={20} className="mr-2" />
                  統計情報
                </h3>
                <div className="border border-gray-200 rounded">
                  <QueryResultTable data={Object.entries(statisticsResult).map(([key, value]) => ({ 
                    列名: key, 
                    ...value 
                  }))} />
                </div>
              </div>
            )}
            
            {infoResult && (
              <div>
                <h3 className="text-lg font-semibold mb-2">データ型情報</h3>
                <div className="border border-gray-200 rounded">
                  <InfoResultTable data={infoResult} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* チャートタブ */}
        {activeTab === 'chart' && chartData && (
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <IoBarChartOutline size={20} className="mr-2" />
              チャート
            </h3>
            <div className="border border-gray-200 rounded p-4 bg-white">
              <div className="flex justify-center">
                {chartSettings.type === 'bar' && <Bar data={chartData} />}
                {chartSettings.type === 'line' && <Line data={chartData} />}
                {chartSettings.type === 'pie' && <Pie data={chartData} />}
                {chartSettings.type === 'scatter' && <Scatter data={chartData} />}
              </div>
            </div>
          </div>
        )}

        {/* 関係性タブ */}
        {activeTab === 'relationship' && combinedData && combinedData.length > 0 && (
          <div className="p-4 h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <IoGitNetwork size={20} className="mr-2" />
              データ関係性分析
            </h3>
            <div className="flex-1 border border-gray-200 rounded bg-white" ref={graphContainerRef}>
              <RelationshipGraph
                data={combinedData}
                width={graphSize.width}
                height={graphSize.height}
                theme={currentTheme}
              />
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