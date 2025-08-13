'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { parseCSV, parseJSON, parseYAML, parseParquet, parseExcel } from '@/lib/dataPreviewUtils';
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
  IoGitNetwork,
  IoChevronUpOutline,
  IoChevronDownOutline,
  IoGrid,
  IoPlay
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
    rootDirHandle,
    editorSettings,
    updateEditorSettings,
    tabs
  } = useEditorStore();

  // 状態管理
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileDataMap, setFileDataMap] = useState<Map<string, any[]>>(new Map());
  
  // Excelファイル設定
  const [excelSettings, setExcelSettings] = useState<Map<string, {
    sheetName: string;
    startRow: number;
    startCol: number;
    endRow?: number;
    endCol?: number;
    hasHeader: boolean;
    sheets: Array<{name: string, rowCount: number, colCount: number}>;
  }>>(new Map());
  
  // 分析タブの管理
  const [activeTab, setActiveTab] = useState<'excel-settings' | 'combine' | 'query' | 'stats' | 'chart' | 'relationship'>('excel-settings');
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [isQueryCollapsed, setIsQueryCollapsed] = useState(false);
  
  // 表示モード切り替え関数
  const toggleDisplayMode = () => {
    const newMode = editorSettings.dataDisplayMode === 'flat' ? 'nested' : 'flat';
    updateEditorSettings({ dataDisplayMode: newMode });
  };
  
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
  
  // Cypher クエリ関連
  const [cypherQuery, setCypherQuery] = useState<string>('');
  const [cypherParseError, setCypherParseError] = useState<string | null>(null);
  
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
    // Excelファイルが含まれている場合、最初にExcel設定タブを表示
    const hasExcelFiles = Array.from(selectedFiles).some(filePath => {
      const fileName = filePath.split('/').pop() || filePath;
      return fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');
    });
    
    if (hasExcelFiles && activeTab === 'excel-settings') {
      // Excel設定があるファイルは既に読み込まれているので、設定がないExcelファイルのみ読み込み
      const needsReload = Array.from(selectedFiles).some(filePath => {
        const fileName = filePath.split('/').pop() || filePath;
        const isExcel = fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');
        return isExcel && !excelSettings.has(filePath);
      });
      
      if (needsReload) {
        loadSelectedFiles();
      }
    } else {
      loadSelectedFiles();
    }
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
            case 'parquet':
            case 'parq':
              const parquetResult = await parseParquet(content);
              if (parquetResult.error) throw new Error(parquetResult.error);
              
              if (parquetResult.headers && parquetResult.rows) {
                data = parquetResult.rows.map((row: any[]) => {
                  const obj: any = {};
                  parquetResult.headers.forEach((header: string, i: number) => {
                    obj[header] = row[i] || null;
                  });
                  return obj;
                });
              } else {
                data = [];
              }
              break;
            
            case 'xlsx':
            case 'xls':
              // Excelファイルの処理
              try {
                let buffer: ArrayBuffer;
                
                // 1. タブから取得を試行
                const tab = tabs.get(filePath);
                if (tab && tab.file && 'getFile' in tab.file) {
                  const file = await (tab.file as FileSystemFileHandle).getFile();
                  buffer = await file.arrayBuffer();
                } else {
                  // 2. ルートディレクトリハンドルから直接取得
                  if (!rootDirHandle) {
                    throw new Error('ルートディレクトリハンドルが見つかりません');
                  }
                  
                  try {
                    const fileHandle = await rootDirHandle.getFileHandle(fileName);
                    const file = await fileHandle.getFile();
                    buffer = await file.arrayBuffer();
                  } catch (fileError) {
                    throw new Error(`ファイルアクセスエラー: ${fileName}`);
                  }
                }
                
                // Excelファイルの設定を確認
                const currentSettings = excelSettings.get(filePath);
                if (!currentSettings) {
                  // 初回読み込み: シート情報を取得してデフォルト設定を作成
                  const { getExcelSheets } = await import('@/lib/dataPreviewUtils');
                  const sheets = getExcelSheets(buffer);
                  
                  if (sheets.length === 0) {
                    throw new Error('Excelファイルにシートが見つかりません');
                  }
                  
                  // デフォルト設定を保存
                  const defaultSettings = {
                    sheetName: sheets[0].name,
                    startRow: 1,
                    startCol: 1,
                    hasHeader: true,
                    sheets: sheets
                  };
                  
                  setExcelSettings(prev => new Map(prev.set(filePath, defaultSettings)));
                  
                  // デフォルト設定でパース
                  data = parseExcel(buffer, {
                    sheetName: defaultSettings.sheetName,
                    startRow: defaultSettings.startRow,
                    startCol: defaultSettings.startCol,
                    hasHeader: defaultSettings.hasHeader
                  });
                } else {
                  // 既存設定を使用してパース
                  data = parseExcel(buffer, {
                    sheetName: currentSettings.sheetName,
                    startRow: currentSettings.startRow,
                    startCol: currentSettings.startCol,
                    endRow: currentSettings.endRow,
                    endCol: currentSettings.endCol,
                    hasHeader: currentSettings.hasHeader
                  });
                }
              } catch (excelError) {
                console.error(`Excel parsing error for ${fileName}:`, excelError);
                throw new Error(`Excelファイルの解析に失敗: ${fileName}`);
              }
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
      console.log('チャート設定デバッグ - 更新開始時の設定:', {
        X軸: chartSettings.xAxis,
        Y軸: chartSettings.yAxis,
        カテゴリフィールド: chartSettings.categoryField,
        データソース: chartSettings.dataSource,
        チャートタイプ: chartSettings.type,
        集計方法: chartSettings.aggregation,
        オプション: chartSettings.options
      });

      const dataSource = chartSettings.dataSource === 'queryResult' && queryResult 
        ? queryResult 
        : combinedData;

      if (!dataSource || dataSource.length === 0) {
        setError('チャート用データソースが空です');
        setLoading(false);
        return;
      }

      // 散布図の場合、X軸とY軸が必須
      if (chartSettings.type === 'scatter' && (!chartSettings.xAxis || !chartSettings.yAxis)) {
        setError('散布図にはX軸とY軸の設定が必要です');
        setLoading(false);
        return;
      }

      // ヒストグラムの場合、X軸のみ必須
      if (chartSettings.type === 'histogram' && !chartSettings.xAxis) {
        setError('ヒストグラムにはX軸の設定が必要です');
        setLoading(false);
        return;
      }

      // 線形回帰の場合、X軸とY軸が必須
      if (chartSettings.type === 'regression' && (!chartSettings.xAxis || !chartSettings.yAxis)) {
        setError('線形回帰グラフにはX軸とY軸の設定が必要です');
        setLoading(false);
        return;
      }

      // ガントチャートの場合、必要なフィールドの設定確認
      if (chartSettings.type === 'gantt') {
        const taskNameField = chartSettings.options?.taskNameField;
        const startDateField = chartSettings.options?.startDateField;
        const endDateField = chartSettings.options?.endDateField;

        if (!taskNameField || !startDateField || !endDateField) {
          setError('ガントチャートにはタスク名、開始日、終了日のフィールドが必要です');
          setLoading(false);
          return;
        }
      }

      // 基本的なチャートの場合、X軸は必須
      if (!chartSettings.xAxis && chartSettings.type !== 'pie' && chartSettings.type !== 'gantt') {
        setError('X軸の設定が必要です');
        setLoading(false);
        return;
      }

      let processedData = dataSource;

      console.log('データ処理分岐判定:', {
        チャートタイプ: chartSettings.type,
        集計方法: chartSettings.aggregation,
        カテゴリフィールド: chartSettings.categoryField,
        グループ分けあり: !!(chartSettings.categoryField && chartSettings.categoryField.trim() !== '')
      });

      // ヒストグラムと散布図以外で集計処理を行う
      // ただし、カウント集計やグループ分け（カテゴリフィールド）が指定されている場合は集計をスキップ
      if (chartSettings.type !== 'histogram' && 
          chartSettings.type !== 'scatter' && 
          chartSettings.aggregation && 
          chartSettings.aggregation !== 'none' &&
          chartSettings.aggregation !== 'count' &&
          !(chartSettings.categoryField && chartSettings.categoryField.trim() !== '')) {
        
        console.log('通常集計処理開始:', {
          集計方法: chartSettings.aggregation,
          X軸: chartSettings.xAxis,
          Y軸: chartSettings.yAxis
        });

        const { data: aggregatedData, error } = aggregateData(
          dataSource,
          chartSettings.xAxis,
          chartSettings.yAxis || '',
          chartSettings.aggregation as any,
          true
        );

        if (error) {
          setError(error);
          setLoading(false);
          return;
        }

        processedData = aggregatedData || [];
        console.log('通常集計後のデータ:', processedData);
      } else if (chartSettings.aggregation === 'count' && chartSettings.type !== 'histogram') {
        // カウント集計の場合の特別処理
        console.log('カウント集計処理開始 - 分岐に入りました');
        
        // グループ分け（カテゴリフィールド）が指定されている場合は、
        // prepareChartData内でカウント処理を行うため、ここでは集計しない
        if (chartSettings.categoryField && chartSettings.categoryField.trim() !== '') {
          console.log('グループ分けあり - prepareChartData内でカウント処理を実行（元データをそのまま使用）');
          processedData = dataSource; // 元データをそのまま渡す
        } else {
          console.log('グループ分けなし - aggregateDataでカウント集計実行');
          // グループ分けなしの場合は従来通り集計
          const { data: aggregatedData, error } = aggregateData(
            dataSource,
            chartSettings.xAxis,
            chartSettings.yAxis || '',
            'count',
            true
          );

          if (error) {
            setError(error);
            setLoading(false);
            return;
          }

          processedData = aggregatedData || [];
        }
      } else {
        console.log('集計をスキップ - 元データをそのまま使用');
      }

      console.log('チャートデータ準備開始:', {
        データ件数: processedData.length,
        チャートタイプ: chartSettings.type,
        処理データ: processedData.slice(0, 3)
      });

      console.log('prepareChartData呼び出しパラメータ:', {
        labelField: chartSettings.xAxis,
        valueField: chartSettings.yAxis,
        chartType: chartSettings.type,
        categoryField: chartSettings.categoryField,
        正規化後categoryField: chartSettings.categoryField && chartSettings.categoryField.trim() !== '' 
          ? chartSettings.categoryField 
          : undefined
      });

      // ガントチャートの場合のlabelField調整
      const labelField = chartSettings.type === 'gantt' 
        ? chartSettings.options?.taskNameField 
        : chartSettings.xAxis;

      const chartDataResult = prepareChartData(
        processedData,
        labelField,
        chartSettings.yAxis,
        chartSettings.type as any,
        chartSettings.categoryField && chartSettings.categoryField.trim() !== '' 
          ? chartSettings.categoryField 
          : undefined,
        chartSettings.options
      );

      if (chartDataResult) {
        console.log('チャートデータ生成成功:', chartDataResult);
        setChartData(chartDataResult);
        setError(null);
      } else {
        setError('チャートデータの生成に失敗しました');
      }
    } catch (err) {
      console.error('Chart generation error:', err);
      setError(err instanceof Error ? err.message : 'チャート生成エラー');
      setChartData(null);
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
      <div className="flex border-b border-gray-200 bg-white overflow-x-auto">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'excel-settings'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-gray-800 hover:border-gray-300'
          }`}
          onClick={() => setActiveTab('excel-settings')}
        >
          <IoGrid className="inline mr-1" size={16} />
          Excel設定
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
      <div className="border-b border-gray-200 bg-gray-50">
        {/* 設定パネルヘッダー */}
        <div className="px-4 py-2 flex items-center justify-between bg-gray-100">
          <h3 className="text-sm font-medium text-gray-700">設定</h3>
          <button
            onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
            className="p-1 hover:bg-gray-200 rounded"
            title={isSettingsCollapsed ? '設定を展開' : '設定を折りたたむ'}
          >
            {isSettingsCollapsed ? (
              <IoChevronDownOutline size={16} />
            ) : (
              <IoChevronUpOutline size={16} />
            )}
          </button>
        </div>
        
        {/* 設定パネル内容 */}
        {!isSettingsCollapsed && (
          <div className="p-4">
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
            <div className="flex flex-wrap gap-2 mb-4">
              <div className="w-32">
                <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">グラフタイプ</div>
                <select
                  value={chartSettings.type}
                  onChange={(e) => {
                    const newType = e.target.value as any;
                    updateChartSettings({ 
                      type: newType,
                      // 散布図かヒストグラムかガントチャートの場合は集計なしに設定
                      aggregation: (newType === 'scatter' || newType === 'histogram' || newType === 'gantt') 
                        ? undefined 
                        : chartSettings.aggregation
                    });
                    // グラフタイプが変更されたらすぐにチャートを更新
                    setTimeout(() => generateChartData(), 50);
                  }}
                  className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="bar">棒グラフ</option>
                  <option value="line">折れ線グラフ</option>
                  <option value="pie">円グラフ</option>
                  <option value="scatter">散布図</option>
                  <option value="stacked-bar">積立棒グラフ</option>
                  <option value="regression">線形回帰グラフ</option>
                  <option value="histogram">ヒストグラム</option>
                  <option value="gantt">ガントチャート</option>
                </select>
              </div>
              
              {chartSettings.type !== 'histogram' && chartSettings.type !== 'regression' && chartSettings.type !== 'gantt' && (
                <div className="w-36">
                  <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                    集計方法 <span title="単一項目の出現頻度分析: X軸に分析したい項目、集計方法に「カウント」を選択、Y軸は空でOK&#10;各区分ごとの合計値: 例）部門別売上合計&#10;各区分ごとの平均値: 例）地域別平均気温&#10;各区分ごとの最大値: 例）月別最高気温&#10;各区分ごとの最小値: 例）製品別最低価格" className="text-red-500 cursor-help">*</span>
                  </div>
                  <select
                    value={chartSettings.aggregation || 'none'}
                    onChange={(e) => {
                      updateChartSettings({ aggregation: e.target.value === 'none' ? undefined : e.target.value as any });
                      // 集計方法が変更されたらすぐにチャートを更新
                      setTimeout(() => generateChartData(), 50);
                    }}
                    className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="none">集計なし</option>
                    <option value="sum">合計</option>
                    <option value="avg">平均</option>
                    <option value="count">カウント</option>
                    <option value="min">最小値</option>
                    <option value="max">最大値</option>
                  </select>
                </div>
              )}
              
              <div className="w-36">
                <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">データソース</div>
                <select
                  value={chartSettings.dataSource}
                  onChange={(e) => updateChartSettings({ dataSource: e.target.value as 'originalData' | 'queryResult' })}
                  className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="originalData">統合データ</option>
                  <option value="queryResult">クエリ結果</option>
                </select>
              </div>
              
              {chartSettings.type === 'histogram' && (
                <div className="w-24">
                  <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">ビン数</div>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={chartSettings.options?.bins || 10}
                    onChange={(e) => {
                      updateChartSettings({ 
                        options: { 
                          ...chartSettings.options, 
                          bins: parseInt(e.target.value) || 10 
                        } 
                      });
                      // ビン数が変更されたらすぐにチャートを更新
                      setTimeout(() => generateChartData(), 50);
                    }}
                    className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
              )}
              
              {chartSettings.type === 'gantt' && (
                <>
                  <div className="w-48">
                    <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">タスク名フィールド</div>
                    <select
                      value={chartSettings.options?.taskNameField || ''}
                      onChange={(e) => {
                        updateChartSettings({ 
                          options: { 
                            ...chartSettings.options, 
                            taskNameField: e.target.value 
                          } 
                        });
                        setTimeout(() => { generateChartData(); }, 50);
                      }}
                      className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">タスク名フィールドを選択</option>
                      {availableColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-48">
                    <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">開始日フィールド</div>
                    <select
                      value={chartSettings.options?.startDateField || ''}
                      onChange={(e) => {
                        updateChartSettings({ 
                          options: { 
                            ...chartSettings.options, 
                            startDateField: e.target.value 
                          } 
                        });
                        setTimeout(() => { generateChartData(); }, 50);
                      }}
                      className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">開始日フィールドを選択</option>
                      {availableColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-48">
                    <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">終了日フィールド</div>
                    <select
                      value={chartSettings.options?.endDateField || ''}
                      onChange={(e) => {
                        updateChartSettings({ 
                          options: { 
                            ...chartSettings.options, 
                            endDateField: e.target.value 
                          } 
                        });
                        setTimeout(() => { generateChartData(); }, 50);
                      }}
                      className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">終了日フィールドを選択</option>
                      {availableColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            
            
            <div className="flex flex-wrap gap-2 mt-4 mb-2">
              <div className="w-48">
                <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">X軸（カテゴリ）</div>
                <select
                  value={chartSettings.xAxis}
                  onChange={(e) => {
                    updateChartSettings({ xAxis: e.target.value });
                    // X軸が変更されたらすぐにチャートを更新
                    setTimeout(() => generateChartData(), 50);
                  }}
                  className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">X軸を選択</option>
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
              {/* ヒストグラムの場合はY軸選択を表示しない */}
              {chartSettings.type !== 'histogram' && (
                <div className="w-48">
                  <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                    Y軸（値）{chartSettings.aggregation === 'count' ? <span className="text-xs text-gray-500">（省略可）</span> : ''}
                    {chartSettings.aggregation === 'count' && <span title="頻度分析の場合、Y軸は省略できます。&#10;省略するとX軸の各値の出現回数が自動的にカウントされます。" className="ml-1 text-red-500 cursor-help">*</span>}
                  </div>
                  <select
                    value={chartSettings.yAxis}
                    onChange={(e) => {
                      updateChartSettings({ yAxis: e.target.value });
                      // Y軸が変更されたらすぐにチャートを更新
                      setTimeout(() => generateChartData(), 50);
                    }}
                    className={`w-full p-1.5 text-sm border ${chartSettings.aggregation === 'count' ? 'border-gray-200 dark:border-gray-600' : 'border-gray-300 dark:border-gray-700'} rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}
                    required={chartSettings.aggregation !== 'count'}
                  >
                    <option value="">{chartSettings.aggregation === 'count' ? 'Y軸なし（頻度分析）' : 'Y軸を選択'}</option>
                    {availableColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="w-48">
                <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                  グループ分け <span title="グループ分けの使い方：&#10;・単一項目の頻度分析時は空白のままにします&#10;・X軸の各カテゴリごとに複数の棒/線を表示する場合に使用します&#10;・例：「地域別、製品カテゴリ別の売上」ではX軸に地域、グループ分けに製品カテゴリを指定" className="text-red-500 cursor-help">*</span>
                </div>
                <select
                  value={chartSettings.categoryField || ''}
                  onChange={(e) => {
                    updateChartSettings({ categoryField: e.target.value || undefined });
                    // カテゴリフィールドが変更されたらすぐにチャートを更新
                    setTimeout(() => generateChartData(), 50);
                  }}
                  className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">カテゴリなし</option>
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
              
              {chartSettings.type === 'regression' && (
                <div className="w-48">
                  <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">回帰タイプ</div>
                  <select
                    value={chartSettings.options?.regressionType || 'linear'}
                    onChange={(e) => {
                      updateChartSettings({ 
                        options: { 
                          ...chartSettings.options, 
                          regressionType: e.target.value as any 
                        } 
                      });
                      // 回帰タイプが変更されたらすぐにチャートを更新
                      setTimeout(() => generateChartData(), 50);
                    }}
                    className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="linear">線形</option>
                    <option value="exponential">指数</option>
                    <option value="polynomial">多項式</option>
                    <option value="power">累乗</option>
                    <option value="logarithmic">対数</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 関係性設定 */}
        {activeTab === 'relationship' && (
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Cypherクエリ
              </label>
              <textarea
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm resize-vertical min-h-[80px] max-h-[240px] focus:outline-none focus:ring-2 focus:ring-blue-400"
                style={{ lineHeight: '1.6', tabSize: 4 }}
                placeholder="Cypherクエリを入力 (例: MATCH (n:Person) RETURN n)"
                value={cypherQuery}
                onChange={(e) => setCypherQuery(e.target.value)}
                rows={4}
              />
              {cypherParseError && (
                <div className="text-red-500 text-sm mt-1">{cypherParseError}</div>
              )}
            </div>
            
            <button
              onClick={() => {
                // TODO: Cypherクエリ実行処理をここに移動
                setCypherParseError(null);
              }}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
            >
              <IoGitNetwork size={16} className="mr-2" />
              クエリ実行
            </button>
          </div>
        )}

            {/* 共通ボタン */}
            {activeTab !== 'stats' && activeTab !== 'relationship' && (
              <div className="flex justify-end mt-4 pt-4 border-t border-gray-200 gap-2">
                <button
                  onClick={() => {
                    clearSelectedFiles();
                    onClose();
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  選択をクリア
                </button>
                {activeTab === 'chart' && (
                  <>
                    <button
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      onClick={generateChartData}
                    >
                      グラフを更新
                    </button>
                    {loading && (
                      <div className="inline-flex items-center text-sm text-blue-600">
                        <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full mr-2"></div>
                        更新中...
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 結果表示エリア */}
      <div className="flex-1 overflow-auto min-h-0">
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

        {/* Excel設定タブ */}
        {activeTab === 'excel-settings' && (
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <IoGrid size={20} className="mr-2 text-green-600" />
              Excelファイル設定
            </h3>
            
            {/* Excelファイルごとの設定パネル */}
            {Array.from(excelSettings.entries()).map(([filePath, settings]) => {
              const fileName = filePath.split('/').pop() || filePath;
              const isExcelFile = fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');
              
              if (!isExcelFile) return null;
              
              const currentSheet = settings.sheets.find(s => s.name === settings.sheetName);
              
              return (
                <div key={filePath} className="mb-6 p-4 border border-gray-200 rounded bg-gray-50">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                    <IoGrid className="mr-2 text-green-600" size={16} />
                    {fileName}
                    <span className="ml-2 text-sm text-gray-500">({settings.sheets.length} シート)</span>
                  </h4>
                  
                  {/* シート選択と範囲設定 */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">シート</label>
                      <select
                        value={settings.sheetName}
                        onChange={(e) => {
                          const newSettings = { ...settings, sheetName: e.target.value };
                          setExcelSettings(prev => new Map(prev.set(filePath, newSettings)));
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded bg-white"
                      >
                        {settings.sheets.map((sheet) => (
                          <option key={sheet.name} value={sheet.name}>
                            {sheet.name} ({sheet.rowCount}×{sheet.colCount})
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">開始行</label>
                      <input
                        type="number"
                        min="1"
                        max={currentSheet?.rowCount || 1}
                        value={settings.startRow}
                        onChange={(e) => {
                          const newSettings = { ...settings, startRow: parseInt(e.target.value) || 1 };
                          setExcelSettings(prev => new Map(prev.set(filePath, newSettings)));
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">開始列</label>
                      <input
                        type="number"
                        min="1"
                        max={currentSheet?.colCount || 1}
                        value={settings.startCol}
                        onChange={(e) => {
                          const newSettings = { ...settings, startCol: parseInt(e.target.value) || 1 };
                          setExcelSettings(prev => new Map(prev.set(filePath, newSettings)));
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">終了行</label>
                      <input
                        type="number"
                        min={settings.startRow}
                        max={currentSheet?.rowCount || 1}
                        value={settings.endRow || ''}
                        onChange={(e) => {
                          const newSettings = { 
                            ...settings, 
                            endRow: e.target.value ? parseInt(e.target.value) : undefined 
                          };
                          setExcelSettings(prev => new Map(prev.set(filePath, newSettings)));
                        }}
                        placeholder="全て"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">終了列</label>
                      <input
                        type="number"
                        min={settings.startCol}
                        max={currentSheet?.colCount || 1}
                        value={settings.endCol || ''}
                        onChange={(e) => {
                          const newSettings = { 
                            ...settings, 
                            endCol: e.target.value ? parseInt(e.target.value) : undefined 
                          };
                          setExcelSettings(prev => new Map(prev.set(filePath, newSettings)));
                        }}
                        placeholder="全て"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                  
                  {/* ヘッダー設定と適用ボタン */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.hasHeader}
                        onChange={(e) => {
                          const newSettings = { ...settings, hasHeader: e.target.checked };
                          setExcelSettings(prev => new Map(prev.set(filePath, newSettings)));
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">先頭行をヘッダーとして使用</span>
                    </label>
                    
                    <button
                      onClick={loadSelectedFiles}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center text-sm"
                    >
                      <IoPlay className="mr-1" size={14} />
                      設定を適用
                    </button>
                  </div>
                  
                  {/* 現在のシート情報 */}
                  {currentSheet && (
                    <div className="mt-3 text-sm text-gray-600">
                      <strong>{settings.sheetName}</strong> - 
                      範囲: A1:{String.fromCharCode(65 + currentSheet.colCount - 1)}{currentSheet.rowCount} 
                      ({currentSheet.rowCount}行 × {currentSheet.colCount}列)
                    </div>
                  )}
                </div>
              );
            })}
            
            {Array.from(selectedFiles).filter(filePath => {
              const fileName = filePath.split('/').pop() || filePath;
              return fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls');
            }).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <IoGrid size={48} className="mx-auto mb-2 opacity-50" />
                <p>Excelファイルが選択されていません</p>
                <p className="text-sm">エクスプローラーでExcelファイル（.xlsx/.xls）を選択してください</p>
              </div>
            )}
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
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold flex items-center">
                <IoCodeSlash size={20} className="mr-2" />
                クエリ結果 ({queryResult.length}件)
              </h3>
              <button
                className="px-3 py-1 flex items-center text-sm text-gray-600 hover:text-blue-600"
                onClick={toggleDisplayMode}
                title={editorSettings.dataDisplayMode === 'flat' ? "階層表示に切替" : "フラット表示に切替"}
              >
                <IoLayersOutline className="mr-1" size={16} />
                <span className="text-sm">
                  {editorSettings.dataDisplayMode === 'flat' ? '階層表示' : 'フラット表示'}
                </span>
              </button>
            </div>
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
                <h3 className="text-lg font-semibold mb-2">項目ごとの型・最大文字数サマリー</h3>
                <div className="border border-gray-200 rounded">
                  <InfoResultTable infoResult={infoResult} />
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
              <div className="flex justify-center h-96">
                {chartSettings.type === 'bar' && (
                  <Bar 
                    data={chartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        datalabels: {
                          display: false // データラベルを非表示
                        }
                      }
                    }}
                  />
                )}
                {chartSettings.type === 'line' && (
                  <Line 
                    data={chartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        datalabels: {
                          display: false
                        }
                      }
                    }}
                  />
                )}
                {chartSettings.type === 'pie' && (
                  <Pie 
                    data={chartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        datalabels: {
                          display: false
                        }
                      }
                    }}
                  />
                )}
                {chartSettings.type === 'scatter' && (
                  <Scatter 
                    data={chartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        datalabels: {
                          display: false
                        }
                      }
                    }}
                  />
                )}
                {chartSettings.type === 'stacked-bar' && (
                  <Bar 
                    data={chartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        datalabels: {
                          display: false
                        }
                      }
                    }}
                  />
                )}
                {chartSettings.type === 'regression' && (
                  <Scatter 
                    data={chartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        datalabels: {
                          display: false
                        }
                      }
                    }}
                  />
                )}
                {chartSettings.type === 'histogram' && (
                  <Bar 
                    data={chartData} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        datalabels: {
                          display: false
                        }
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* 関係性タブ */}
        {activeTab === 'relationship' && combinedData && combinedData.length > 0 && (
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2 flex items-center">
              <IoGitNetwork size={20} className="mr-2" />
              データ関係性分析
            </h3>
            <div className="h-96 border border-gray-200 rounded bg-white" ref={graphContainerRef}>
              <RelationshipGraph
                data={combinedData}
                width={graphSize.width}
                height={graphSize.height}
                theme={currentTheme}
                isQueryCollapsed={isQueryCollapsed}
                onToggleQueryCollapse={() => setIsQueryCollapsed(!isQueryCollapsed)}
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