'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditorStore } from '@/store/editorStore';
import { parseCSV, parseJSON, parseYAML, parseParquet, parseExcel, flattenNestedObjects } from '@/lib/dataPreviewUtils';
import {
  buildGisDatasetFromObject,
  parseGeoJsonContent,
  parseKmlContent,
  parseKmzContent,
  parseShapefileContent,
} from '@/lib/gisUtils';
import { executeQuery, calculateStatistics, aggregateData, prepareChartData, calculateInfo, downloadData } from '@/lib/dataAnalysisUtils';
import { IoAlertCircleOutline, IoBarChartOutline, IoStatsChartOutline, IoCodeSlash, IoLayersOutline, IoCreate, IoSave, IoGitNetwork, IoChevronUpOutline, IoChevronDownOutline, IoBookOutline, IoAddOutline, IoPlay, IoPlayForward, IoTrashOutline, IoDownloadOutline, IoSparkles } from 'react-icons/io5';
import QueryResultTable from './QueryResultTable';
import InfoResultTable from './InfoResultTable';
import ResultChartPanel from './ResultChartPanel';
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
  TooltipItem,
  ChartType
} from 'chart.js';
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2';
import ObjectViewer from '@/components/preview/ObjectViewer';
import { Chart } from 'react-chartjs-2';
import dynamic from 'next/dynamic';
// Plotlyをインポート（型情報用）
import * as PlotlyTypes from 'plotly.js';
// Plotlyを動的インポートすることで、SSR時のエラーを回避
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });
// データラベルプラグインをインポート
import ChartDataLabels from 'chartjs-plugin-datalabels';
// 関係グラフコンポーネントを動的インポート（SSR回避）
const RelationshipGraph = dynamic(() => import('./RelationshipGraph'), { ssr: false });
import { SqlNotebookCell } from '@/types';
import { WorkflowGeneratedCell } from '@/lib/llm/workflowPrompt';
import { buildAnalysisSummary, LlmReportResponse } from '@/lib/llm/analysisSummarizer';

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

interface DataAnalysisProps {
  tabId: string;
}

const DataAnalysis: React.FC<DataAnalysisProps> = ({ tabId }) => {
  const {
    tabs,
    setAnalysisData,
    chartSettings,
    updateChartSettings,
    paneState,
    updatePaneState,
    getViewMode,
    setViewMode,
    editorSettings,
    updateEditorSettings,
    sqlNotebook,
    setSqlNotebook
  } = useEditorStore();

  const toggleAnalysisMode = () => {
    const tab = tabs.get(tabId);
    const type = tab?.type?.toLowerCase();
    const isDataPreviewable =
      type === 'csv' ||
      type === 'tsv' ||
      type === 'json' ||
      type === 'yaml' ||
      type === 'parquet' ||
      type === 'excel' ||
      type === 'geojson' ||
      type === 'kml' ||
      type === 'kmz' ||
      type === 'shapefile';

    const fallbackMode = isDataPreviewable ? 'data-preview' : 'editor';
    setViewMode(tabId, fallbackMode);
  };
  
  const toggleDisplayMode = () => {
    const newMode = editorSettings.dataDisplayMode === 'flat' ? 'nested' : 'flat';
    updateEditorSettings({ dataDisplayMode: newMode });
  };
  
  // 状態
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<any[] | null>(null);
  const [originalData, setOriginalData] = useState<any[] | null>(null); // フラット化する前の元データ
  const [columns, setColumns] = useState<string[]>([]);
  const [sqlQuery, setSqlQuery] = useState<string>('');
  const [queryResult, setQueryResult] = useState<any[] | null>(null);
  const [originalQueryResult, setOriginalQueryResult] = useState<any[] | null>(null); // クエリ結果の元データ
  const [statisticsResult, setStatisticsResult] = useState<Record<string, any> | null>(null);
  const [infoResult, setInfoResult] = useState<Record<string, any> | null>(null);
  const [chartData, setChartData] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'query' | 'stats' | 'chart' | 'relationship'>('query');
  const [notebookSnapshotMeta, setNotebookSnapshotMeta] = useState<{ name: string; exportedAt?: string } | null>(null);
  const [insightPreview, setInsightPreview] = useState<LlmReportResponse | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [isInsightPanelOpen, setIsInsightPanelOpen] = useState(false);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);

  // 現在のテーマを取得する
  const [currentTheme, setCurrentTheme] = useState<string>('light');
  
  useEffect(() => {
    // システムの現在のテーマを検出（ダークモード対応）
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    // もしくはCSSの変数からテーマを検出
    const htmlElement = document.documentElement;
    const isDarkTheme = htmlElement.classList.contains('dark');
    
    setCurrentTheme(isDarkTheme || isDarkMode ? 'dark' : 'light');
    
    // テーマ変更の監視
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setCurrentTheme(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!isSaveMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(event.target as Node)) {
        setIsSaveMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSaveMenuOpen]);

  useEffect(() => {
    if (!insightPreview) {
      setIsSaveMenuOpen(false);
    }
  }, [insightPreview]);

  // グラフコンテナのためのref
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const saveMenuRef = useRef<HTMLDivElement | null>(null);
  
  // 関係グラフのサイズを更新するためのステート
  const [graphSize, setGraphSize] = useState({ width: 800, height: 600 });
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [isNotebookMode, setIsNotebookMode] = useState(false);
  const [runAllInProgress, setRunAllInProgress] = useState(false);
  const [cellViewModes, setCellViewModes] = useState<Record<string, 'table' | 'chart'>>({});
  const notebookCells = useMemo(() => sqlNotebook[tabId] || [], [sqlNotebook, tabId]);
  const hasNotebookCells = notebookCells.length > 0;
  const [workflowRequest, setWorkflowRequest] = useState('');
  const [workflowGenerating, setWorkflowGenerating] = useState(false);
  const [workflowGenerationError, setWorkflowGenerationError] = useState<string | null>(null);
  const [workflowGenerationInfo, setWorkflowGenerationInfo] = useState<string | null>(null);
  const llmSampleRows = useMemo(() => (parsedData ? parsedData.slice(0, 5) : []), [parsedData]);

  const generateCellId = useCallback(() => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `cell-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }, []);

  const createNotebookCell = useCallback((index: number): SqlNotebookCell => {
    const timestamp = new Date().toISOString();
    return {
      id: generateCellId(),
      title: `セル ${index}`,
      query: 'SELECT * FROM ? LIMIT 1000',
      status: 'idle',
      error: null,
      result: null,
      originalResult: null,
      columns: [],
      executedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }, [generateCellId]);

  const updateNotebookCells = useCallback((updater: (cells: SqlNotebookCell[]) => SqlNotebookCell[]) => {
    const currentCells = sqlNotebook[tabId] || [];
    setSqlNotebook(tabId, updater(currentCells));
  }, [setSqlNotebook, sqlNotebook, tabId]);

  // 関係グラフのサイズを更新
  useEffect(() => {
    if (activeTab === 'relationship' && graphContainerRef.current) {
      const updateSize = () => {
        setGraphSize({
          width: graphContainerRef.current?.clientWidth || 800,
          height: (graphContainerRef.current?.clientHeight || 600) - 20
        });
      };
      
      updateSize();
      
      // ウィンドウのリサイズイベントを監視
      window.addEventListener('resize', updateSize);
      
      return () => {
        window.removeEventListener('resize', updateSize);
      };
    }
  }, [activeTab]);

  // ノートブックの初期セルを準備
  useEffect(() => {
    if (isNotebookMode) return;
    const existingCells = sqlNotebook[tabId];
    if (!existingCells || existingCells.length === 0) {
      setSqlNotebook(tabId, [createNotebookCell(1)]);
    }
  }, [createNotebookCell, isNotebookMode, setSqlNotebook, sqlNotebook, tabId]);
  
  // データを初期ロード
  useEffect(() => {
    const tab = tabs.get(tabId);
    if (tab) {
      loadData(tab.content, tab.type);
    }
  }, [tabId, tabs]);
  
  // データソースが変更されたときに、選択されている列をリセットする
  useEffect(() => {
    if (chartSettings.dataSource === 'queryResult' && queryResult && queryResult.length > 0) {
      const computedQueryColumns = Object.keys(queryResult[0]);
      // クエリ結果のカラムが存在する場合、最初の選択肢を設定
      if (computedQueryColumns.length > 0) {
        let numericCol = '';
        let categoryCol = '';

        // 数値カラムとカテゴリカラムを探す
        for (const col of computedQueryColumns) {
          const values = queryResult.map(row => row[col]);
          const isNumeric = values.some(val => typeof val === 'number' && !isNaN(val));

          if (isNumeric && !numericCol) {
            numericCol = col;
          } else if (!categoryCol) {
            categoryCol = col;
          }
          
          if (numericCol && categoryCol) break;
        }

        // 適切な列が見つかれば設定、見つからなければ最初の列を使用
        updateChartSettings({
          xAxis: categoryCol || computedQueryColumns[0],
          yAxis: numericCol || computedQueryColumns[computedQueryColumns.length > 1 ? 1 : 0]
        });
      }
    } else if (parsedData && parsedData.length > 0 && columns.length > 0) {
      // 元データに戻った場合は元の列を選択
      let numericCol = '';
      let categoryCol = '';
      
      // 数値カラムとカテゴリカラムを探す
      for (const col of columns) {
        const values = parsedData.map(row => row[col]);
        const isNumeric = values.some(val => typeof val === 'number' && !isNaN(val));
        
        if (isNumeric && !numericCol) {
          numericCol = col;
        } else if (!categoryCol) {
          categoryCol = col;
        }
        
        if (numericCol && categoryCol) break;
      }
      
      updateChartSettings({
        xAxis: categoryCol || columns[0],
        yAxis: numericCol || columns[columns.length > 1 ? 1 : 0]
      });
    }
  }, [chartSettings.dataSource, queryResult, parsedData]);
  
  // 表示モードが変更されたときにクエリ結果を更新
  useEffect(() => {
    if (queryResult && editorSettings.dataDisplayMode === 'nested' && originalData) {
      // 表示モードが「ネスト」に変更された場合、クエリ結果を再生成
      try {
        const result = executeQuery(originalData, sqlQuery);
        if (!result.error && result.data) {
          setOriginalQueryResult(result.data as any[]);
        }
      } catch (err) {
        console.error('Error updating nested query result:', err);
      }
    }
  }, [editorSettings.dataDisplayMode, queryResult, originalData, sqlQuery]);
  
  // データをロードして解析
  const loadData = async (content: string, type: string) => {
    setLoading(true);
    setError(null);
    setParsedData(null);
    setColumns([]);
    setQueryResult(null);
    setStatisticsResult(null);
    setChartData(null);
    setOriginalData(null);
    setOriginalQueryResult(null);
    setInfoResult(null);
    setNotebookSnapshotMeta(null);
    setIsNotebookMode(false);
    setCellViewModes({});
    
    try {
      let data: any[] = [];
      let cols: string[] = [];

      const currentTab = tabs.get(tabId);
      const trimmedContent = typeof content === 'string' ? content.trim() : '';
      const attemptNotebookImport =
        trimmedContent.startsWith('{') &&
        (type === 'json' || (currentTab?.name?.toLowerCase().includes('.sqlnb') ?? false));
      if (attemptNotebookImport) {
        try {
          const snapshot = JSON.parse(trimmedContent);
          if (
            snapshot &&
            typeof snapshot === 'object' &&
            ((snapshot as any).version !== undefined || currentTab?.name?.toLowerCase().includes('.sqlnb') || (snapshot as any).type === 'sql-notebook') &&
            Array.isArray((snapshot as any).cells)
          ) {
            const cellsSource = (snapshot as any).cells as any[];
            const now = new Date().toISOString();
            const mappedCells: SqlNotebookCell[] = cellsSource.map((rawCell, index) => {
              const cellObj = rawCell && typeof rawCell === 'object' ? rawCell : {};
              const previewRows = Array.isArray((cellObj as any).preview) ? (cellObj as any).preview.filter((row: unknown) => row && typeof row === 'object') : [];
              const hasPreview = previewRows.length > 0;
              const normalizedColumns = Array.isArray((cellObj as any).columns)
                ? (cellObj as any).columns.filter((col: unknown): col is string => typeof col === 'string')
                : hasPreview
                  ? Object.keys(previewRows[0] as Record<string, unknown>)
                  : [];

              const createdAt = typeof (cellObj as any).createdAt === 'string' ? (cellObj as any).createdAt : now;
              const updatedAt = typeof (cellObj as any).updatedAt === 'string' ? (cellObj as any).updatedAt : createdAt;

              return {
                id: typeof (cellObj as any).id === 'string' && (cellObj as any).id ? (cellObj as any).id : generateCellId(),
                title: typeof (cellObj as any).title === 'string' && (cellObj as any).title ? (cellObj as any).title : `セル ${index + 1}`,
                query: typeof (cellObj as any).query === 'string' && (cellObj as any).query ? (cellObj as any).query : 'SELECT * FROM ? LIMIT 1000',
                status: hasPreview ? 'success' : 'idle',
                error: null,
                result: hasPreview ? previewRows : null,
                originalResult: hasPreview ? previewRows : null,
                columns: normalizedColumns,
                executedAt: typeof (cellObj as any).executedAt === 'string' ? (cellObj as any).executedAt : null,
                createdAt,
                updatedAt,
              };
            });

            const cellsToUse = mappedCells.length > 0 ? mappedCells : [createNotebookCell(1)];
            setSqlNotebook(tabId, cellsToUse);
            setIsNotebookMode(true);
            setNotebookSnapshotMeta({
              name: currentTab?.name || 'SQL Notebook',
              exportedAt: typeof (snapshot as any).exportedAt === 'string' ? (snapshot as any).exportedAt : undefined,
            });
            if (cellsToUse.length > 0) {
              setSqlQuery(cellsToUse[0].query);
            }
            setCellViewModes({});

            setOriginalData(null);
            setOriginalQueryResult(null);
            setInfoResult(null);
            setAnalysisData(tabId, { columns: [], rows: [] });
            setLoading(false);
            return;
          }
        } catch (err) {
          // JSON parse failed or snapshot format mismatch; continue with standard processing
        }
      }

      const loadBinaryContent = async (): Promise<ArrayBuffer> => {
        if (!currentTab?.file) {
          throw new Error('バイナリデータを読み込むためのファイルハンドルが見つかりません');
        }

        if ('getFile' in currentTab.file) {
          const file = await currentTab.file.getFile();
          return await file.arrayBuffer();
        }

        if (currentTab.file instanceof File) {
          return await currentTab.file.arrayBuffer();
        }

        throw new Error('バイナリデータの読み込みに失敗しました');
      };

      switch (type) {
        case 'csv':
          const csvResult = parseCSV(content);
          if (csvResult.error) {
            setError(csvResult.error);
            setLoading(false);
            return;
          }
          data = csvResult.data as any[];
          cols = csvResult.columns;
          
          // カラム名の正規化（トリムと特殊文字の除去）
          if (data.length > 0) {
            const normalizedData = data.map(row => {
              const newRow: Record<string, any> = {};
              Object.entries(row).forEach(([key, value]) => {
                // キーを正規化（スペースや特殊文字を削除）
                const normalizedKey = key.trim();
                newRow[normalizedKey] = value;
              });
              return newRow;
            });
            data = normalizedData;
          }
          
      // 読み込んだデータの型を確認
          // すべてのカラムの値を詳しく確認
          if (data.length > 0 && cols.length > 0) {
            const firstRow = data[0];
            const columnValues: Record<string, any> = {};
            cols.forEach(col => {
              columnValues[col] = {
                値: firstRow[col],
                型: typeof firstRow[col],
                数値に変換: parseFloat(String(firstRow[col])),
                文字列表現: String(firstRow[col]),
                カラム名厳密比較: col === 'species',
                カラム名小文字比較: col.toLowerCase() === 'species',
              };
            });
            // info summary を計算
            const info = calculateInfo(data);
            if (!info.error && info.info) {
              setInfoResult(info.info);
            }
            
            // 全レコードのspeciesカラムの値を調べる
            const speciesColumn = cols.find(col => 
              col.toLowerCase() === 'species' || 
              col.toLowerCase() === 'category' || 
              col.toLowerCase() === 'class'
            );
            
            if (speciesColumn) {
            }
          }
          break;
          
        case 'tsv':
          const tsvResult = parseCSV(content, '\t');
          if (tsvResult.error) {
            setError(tsvResult.error);
            setLoading(false);
            return;
          }
          data = tsvResult.data as any[];
          cols = tsvResult.columns;
          
          // TSVデータも同様に確認
          break;
          
        case 'json':
          const jsonResult = parseJSON(content);
          if (jsonResult.error) {
            setError(jsonResult.error);
            setLoading(false);
            return;
          }

          const geoDataset = buildGisDatasetFromObject(jsonResult.data);
          if (geoDataset && geoDataset.rows.length > 0) {
            data = geoDataset.rows;
            cols = geoDataset.columns;
            setOriginalData(geoDataset.rows);
            const info = calculateInfo(data);
            if (!info.error && info.info) {
              setInfoResult(info.info);
            }
            break;
          }

          let jsonProcessedData: any[] = [];
          let jsonOriginalData: any[] = [];

          if (Array.isArray(jsonResult.data)) {
            // 配列の場合は直接フラット化
            jsonProcessedData = flattenNestedObjects(jsonResult.data);
            jsonOriginalData = jsonResult.data;
          } else if (jsonResult.data && typeof jsonResult.data === 'object') {
            // トップレベルがオブジェクトの場合、内部の配列を探す
            const arrayKeys = Object.keys(jsonResult.data).filter(key => {
              const item = jsonResult.data[key];
              return Array.isArray(item) && item.length > 0 && typeof item[0] === 'object';
            });

            if (arrayKeys.length > 0) {
              const firstArrayKey = arrayKeys[0];
              const arrayData = jsonResult.data[firstArrayKey] as any[];
              jsonProcessedData = flattenNestedObjects(arrayData);
              jsonOriginalData = arrayData;
            } else {
              // 配列が見つからない場合はオブジェクト自体をフラット化して配列にする
              jsonProcessedData = [jsonResult.data];
              jsonOriginalData = [jsonResult.data];
            }
          }

          if (jsonProcessedData.length > 0 && typeof jsonProcessedData[0] === 'object') {
            data = jsonProcessedData;
            setOriginalData(jsonOriginalData);
            cols = Object.keys(jsonProcessedData[0]);
            // info summary を計算
            const info = calculateInfo(data);
            if (!info.error && info.info) {
              setInfoResult(info.info);
            }
          } else {
            setError('JSONデータを表形式に変換できませんでした');
            setLoading(false);
            return;
          }
          break;

        case 'yaml':
          const yamlResult = parseYAML(content);
          if (yamlResult.error) {
            setError(yamlResult.error);
            setLoading(false);
            return;
          }
          
          const yamlData = yamlResult.data as Record<string, any>;
          
          // YAMLデータの処理（トップレベルがオブジェクトの場合も対応）
          let processedData: any[] = [];
          let yamlOriginalData: any[] = [];
          
          if (Array.isArray(yamlData)) {
            // 直接配列の場合
            processedData = flattenNestedObjects(yamlData);
            yamlOriginalData = yamlData;
          } else if (yamlData && typeof yamlData === 'object') {
            // トップレベルがオブジェクトの場合、内部の配列を探す
            const arrayKeys = Object.keys(yamlData).filter(key => {
              const item = yamlData[key];
              return Array.isArray(item) && item.length > 0 && typeof item[0] === 'object';
            });
            
            if (arrayKeys.length > 0) {
              const firstArrayKey = arrayKeys[0];
              const typedYamlData = yamlData as { [key: string]: any };
              const arrayData = typedYamlData[firstArrayKey] as any[];
              processedData = flattenNestedObjects(arrayData);
              yamlOriginalData = arrayData;
            } else {
              // 配列が見つからない場合はオブジェクト自体をフラット化して配列にする
              processedData = [yamlData];
              yamlOriginalData = [yamlData];
            }
          }
          
          if (processedData.length > 0 && typeof processedData[0] === 'object') {
            data = processedData;
            setOriginalData(yamlOriginalData);
            cols = Object.keys(processedData[0]);
            // info summary を計算
            const info = calculateInfo(data);
            if (!info.error && info.info) {
              setInfoResult(info.info);
            }
          } else {
            setError('YAMLデータを表形式に変換できませんでした');
            setLoading(false);
            return;
          }
          break;

        case 'geojson': {
          const geoResult = parseGeoJsonContent(content);
          if (geoResult.error) {
            setError(geoResult.error);
            setLoading(false);
            return;
          }
          data = geoResult.rows;
          cols = geoResult.columns;
          setOriginalData(geoResult.rows);
          break;
        }

        case 'kml': {
          const kmlResult = await parseKmlContent(content);
          if (kmlResult.error) {
            setError(kmlResult.error);
            setLoading(false);
            return;
          }
          data = kmlResult.rows;
          cols = kmlResult.columns;
          setOriginalData(kmlResult.rows);
          break;
        }

        case 'kmz': {
          try {
            const buffer = await loadBinaryContent();
            const kmzResult = await parseKmzContent(buffer);
            if (kmzResult.error) {
              setError(kmzResult.error);
              setLoading(false);
              return;
            }
            data = kmzResult.rows;
            cols = kmzResult.columns;
            setOriginalData(kmzResult.rows);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'KMZの読み込みに失敗しました');
            setLoading(false);
            return;
          }
          break;
        }

        case 'shapefile': {
          try {
            const buffer = await loadBinaryContent();
            const shapefileResult = await parseShapefileContent(buffer);
            if (shapefileResult.error) {
              setError(shapefileResult.error);
              setLoading(false);
              return;
            }
            data = shapefileResult.rows;
            cols = shapefileResult.columns;
            setOriginalData(shapefileResult.rows);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'シェープファイルの読み込みに失敗しました');
            setLoading(false);
            return;
          }
          break;
        }

        case 'parquet':
          const parquetResult = await parseParquet(content);
          if (parquetResult.error) {
            setError(parquetResult.error);
            setLoading(false);
            return;
          }
          if (parquetResult.headers && parquetResult.rows) {
            data = parquetResult.rows.map((row: any[]) => {
              const obj: Record<string, any> = {};
              parquetResult.headers.forEach((header: string, i: number) => {
                obj[header] = row[i];
              });
              return obj;
            });
            cols = parquetResult.headers;
          }
          break;
          
        case 'excel':
          // Excelファイルの場合、contentはArrayBufferの可能性がある
          try {
            let buffer: ArrayBuffer;
            if (typeof content === 'string') {
              // プレースホルダーの場合、タブからファイルハンドルを取得
              const tab = tabs.get(tabId);
              if (tab && tab.file && 'getFile' in tab.file) {
                const file = await (tab.file as FileSystemFileHandle).getFile();
                buffer = await file.arrayBuffer();
              } else {
                throw new Error('Excelファイルの読み込みに失敗しました');
              }
            } else {
              buffer = content as ArrayBuffer;
            }
            
            const excelData = parseExcel(buffer);
            data = excelData;
            if (data.length > 0) {
              cols = Object.keys(data[0]);
            }
          } catch (err) {
            setError(`Excelファイルの処理に失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setLoading(false);
            return;
          }
          break;

        default:
          setError('分析に対応していないファイル形式です');
          setLoading(false);
          return;
      }
      
      setParsedData(data);
      setColumns(cols);
      setAnalysisData(tabId, { columns: cols, rows: data });
      
      // 統計情報を計算
      const statsResult = calculateStatistics(data, true);
      if (statsResult.error) {
        console.error(statsResult.error);
      } else {
        setStatisticsResult(statsResult.stats);
      }
      
      // デフォルトクエリを設定
      setSqlQuery(`SELECT * FROM ? LIMIT 1000`);
      
      // デフォルトクエリを実行
      const queryResult = executeQuery(data, `SELECT * FROM ? LIMIT 1000`, true);
      if (queryResult.error) {
        console.error(queryResult.error);
      } else {
        setQueryResult(queryResult.data as any[]);
        setOriginalQueryResult(queryResult.data as any[]);
      }

      updateNotebookCells((cells) => {
        const normalizedCells = cells.length > 0 ? cells : [createNotebookCell(1)];
        const timestamp = new Date().toISOString();
        return normalizedCells.map((cell, idx) => ({
          ...cell,
          title: cell.title || `セル ${idx + 1}`,
          status: 'idle',
          error: null,
          result: null,
          originalResult: null,
          columns: [],
          executedAt: null,
          updatedAt: timestamp,
        }));
      });
      
      // デフォルトチャートデータを準備（もし適切な数値カラムがあれば）
      if (data.length > 0 && cols.length > 1) {
        let numericCol = '';
        let categoryCol = '';
        
        // 数値カラムとカテゴリカラムを探す
        for (const col of cols) {
          const values = data.map(row => row[col]);
          const isNumeric = values.some(val => typeof val === 'number' && !isNaN(val));
          
          if (isNumeric && !numericCol) {
            numericCol = col;
          } else if (!categoryCol) {
            categoryCol = col;
          }
          
          if (numericCol && categoryCol) break;
        }
        
        if (numericCol && categoryCol) {
          // チャート設定を更新
          updateChartSettings({
            type: 'bar',
            xAxis: categoryCol,
            yAxis: numericCol,
            aggregation: 'sum'
          });
          
          // データを集計してチャートデータを準備
          const aggResult = aggregateData(data, categoryCol, numericCol, 'sum');
          if (!aggResult.error && aggResult.data) {
            const chartData = prepareChartData(aggResult.data as any[], categoryCol, 'value', 'bar');
            setChartData(chartData);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };
  
  // SQLクエリを実行
  const executeUserQuery = () => {
    if (!parsedData) return;
    
    setLoading(true);
    
    try {
      // クエリは常にフラットデータに対して実行
      const flatResult = executeQuery(parsedData, sqlQuery, true); // ネストされたプロパティへのアクセスを有効化
      
      if (flatResult.error) {
        setError(flatResult.error);
        setQueryResult(null);
        setOriginalQueryResult(null);
      } else {
        setError(null);
        setQueryResult(flatResult.data as any[]);
        
        // ネストモードの場合は元のデータに対しても同じクエリを実行
        if (editorSettings.dataDisplayMode === 'nested' && originalData) {
          try {
            const nestedResult = executeQuery(originalData, sqlQuery, true); // ネストされたプロパティへのアクセスを有効化
            if (!nestedResult.error) {
              setOriginalQueryResult(nestedResult.data as any[]);
            } else {
              setOriginalQueryResult(flatResult.data as any[]);
            }
          } catch (err) {
            console.error('Error executing nested query:', err);
            setOriginalQueryResult(flatResult.data as any[]);
          }
        } else {
          setOriginalQueryResult(flatResult.data as any[]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'クエリ実行中にエラーが発生しました');
      setQueryResult(null);
      setOriginalQueryResult(null);
    } finally {
      setLoading(false);
    }
  };

  const addNotebookCell = useCallback(() => {
    updateNotebookCells((cells) => {
      const nextCells = [...cells, createNotebookCell(cells.length + 1)];
      return nextCells.map((cell, idx) => ({
        ...cell,
        title: `セル ${idx + 1}`,
      }));
    });
  }, [createNotebookCell, updateNotebookCells]);

  const removeNotebookCell = useCallback((cellId: string) => {
    updateNotebookCells((cells) => {
      const filtered = cells.filter(cell => cell.id !== cellId);
      if (filtered.length === 0) {
        return [createNotebookCell(1)];
      }
      return filtered.map((cell, idx) => ({
        ...cell,
        title: `セル ${idx + 1}`,
      }));
    });
  }, [createNotebookCell, updateNotebookCells]);

  const updateNotebookCellQuery = useCallback((cellId: string, query: string) => {
    updateNotebookCells((cells) => cells.map(cell => (
      cell.id === cellId
        ? { ...cell, query, updatedAt: new Date().toISOString() }
        : cell
    )));
  }, [updateNotebookCells]);

  const executeNotebookCell = useCallback(async (cellId: string): Promise<boolean> => {
    if (!parsedData) {
      updateNotebookCells((cells) => cells.map(cell => (
        cell.id === cellId
          ? {
              ...cell,
              status: 'error',
              error: 'データが読み込まれていません',
            }
          : cell
      )));
      return false;
    }

    let targetCell: SqlNotebookCell | undefined;
    updateNotebookCells((cells) => cells.map(cell => {
      if (cell.id === cellId) {
        targetCell = cell;
        return {
          ...cell,
          status: 'running',
          error: null,
        };
      }
      return cell;
    }));

    if (!targetCell) {
      return false;
    }

    const queryText = targetCell.query?.trim();

    if (!queryText) {
      updateNotebookCells((cells) => cells.map(cell => (
        cell.id === cellId
          ? {
              ...cell,
              status: 'error',
              error: 'SQLクエリが入力されていません',
            }
          : cell
      )));
      return false;
    }

    try {
      const flatResult = executeQuery(parsedData, queryText, true);

      if (flatResult.error) {
        updateNotebookCells((cells) => cells.map(cell => (
          cell.id === cellId
            ? {
                ...cell,
                status: 'error',
                error: flatResult.error,
                result: null,
                originalResult: null,
                columns: [],
                executedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : cell
        )));
        console.error('Notebook SQL execution error:', flatResult.error);
        return false;
      }

      const resultData = (flatResult.data as any[]) || [];
      let nestedResult: any[] | null = null;

      if (originalData) {
        const nested = executeQuery(originalData, queryText, true);
        if (!nested.error) {
          nestedResult = nested.data as any[];
        }
      }

      const columns = resultData.length > 0 ? Object.keys(resultData[0]) : [];
      const timestamp = new Date().toISOString();

      updateNotebookCells((cells) => cells.map(cell => (
        cell.id === cellId
          ? {
              ...cell,
              status: 'success',
              error: null,
              result: resultData,
              originalResult: nestedResult,
              columns,
              executedAt: timestamp,
              updatedAt: timestamp,
            }
          : cell
      )));

      setQueryResult(resultData);
      setOriginalQueryResult(nestedResult || resultData);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'クエリ実行中にエラーが発生しました';
      updateNotebookCells((cells) => cells.map(cell => (
        cell.id === cellId
          ? {
              ...cell,
              status: 'error',
              error: message,
              result: null,
              originalResult: null,
              columns: [],
              executedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : cell
      )));
      console.error('Notebook SQL execution error:', message);
      return false;
    }
  }, [parsedData, originalData, updateNotebookCells, setQueryResult, setOriginalQueryResult]);

  const executeAllNotebookCells = useCallback(async () => {
    setRunAllInProgress(true);

    try {
      for (const cell of notebookCells) {
        const success = await executeNotebookCell(cell.id);
        if (!success) {
          break;
        }
      }
    } finally {
      setRunAllInProgress(false);
    }
  }, [executeNotebookCell, notebookCells]);

  const generateNotebookFromRequest = useCallback(async () => {
    if (workflowGenerating) {
      return;
    }

    const trimmedRequest = workflowRequest.trim();

    if (!trimmedRequest) {
      setWorkflowGenerationError('自然言語リクエストを入力してください。');
      return;
    }

    if (!parsedData || parsedData.length === 0) {
      setWorkflowGenerationError('データが読み込まれていません。');
      return;
    }

    setWorkflowGenerating(true);
    setWorkflowGenerationError(null);
    setWorkflowGenerationInfo(null);

    try {
      const response = await fetch('/api/llm/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request: trimmedRequest,
          columns,
          sampleRows: llmSampleRows,
        }),
      });

      if (!response.ok) {
        let message = `ワークフローの生成に失敗しました。（${response.status}）`;
        try {
          const errorPayload = await response.json();
          if (errorPayload && typeof errorPayload.error === 'string') {
            message = errorPayload.error;
          }
        } catch {
          // ignore JSON parse errors
        }
        setWorkflowGenerationError(message);
        return;
      }

      const payload = await response.json();
      const generatedCellsRaw = Array.isArray(payload?.cells)
        ? (payload.cells as WorkflowGeneratedCell[])
        : [];

      if (generatedCellsRaw.length === 0) {
        setWorkflowGenerationError('生成されたセルがありませんでした。');
        return;
      }

      const timestamp = new Date().toISOString();
      const baseIndex = notebookCells.length;

      const newCells: SqlNotebookCell[] = generatedCellsRaw.map((cell, index) => ({
        id: generateCellId(),
        title: cell.title && cell.title.length > 0 ? cell.title : `セル ${baseIndex + index + 1}`,
        query: cell.sql,
        status: 'idle',
        error: null,
        result: null,
        originalResult: null,
        columns: [],
        executedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));

      if (newCells.some((cell) => !cell.query || cell.query.trim().length === 0)) {
        setWorkflowGenerationError('生成結果にSQLが含まれていませんでした。');
        return;
      }

      updateNotebookCells((cells) => {
        const merged = [...cells, ...newCells];
        return merged.map((cell, idx) => ({
          ...cell,
          title: cell.title && cell.title.trim().length > 0 ? cell.title : `セル ${idx + 1}`,
        }));
      });

      setWorkflowRequest('');

      const rationale = typeof payload?.rationale === 'string' && payload.rationale.trim().length > 0
        ? payload.rationale.trim()
        : null;

      let executedCount = 0;
      for (const cell of newCells) {
        const success = await executeNotebookCell(cell.id);
        if (!success) {
          setWorkflowGenerationError(`セル「${cell.title || `セル ${baseIndex + executedCount + 1}`}」の実行に失敗しました。`);
          break;
        }
        executedCount += 1;
      }

      if (executedCount === newCells.length) {
        setWorkflowGenerationInfo(rationale || `${executedCount}件のセルを生成して実行しました。`);
      } else if (executedCount > 0) {
        setWorkflowGenerationInfo(`${executedCount}件のセルを実行しましたが、一部でエラーが発生しました。`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ワークフローの生成に失敗しました。';
      setWorkflowGenerationError(message);
    } finally {
      setWorkflowGenerating(false);
    }
  }, [
    workflowGenerating,
    workflowRequest,
    parsedData,
    columns,
    llmSampleRows,
    notebookCells.length,
    generateCellId,
    updateNotebookCells,
    executeNotebookCell,
  ]);

  const exportNotebook = useCallback(() => {
    if (!notebookCells || notebookCells.length === 0) {
      return;
    }

    const activeTab = tabs.get(tabId);
    const baseName = activeTab?.name?.replace(/\.[^/.]+$/, '') || 'sql-notebook';
    const timestamp = new Date().toISOString();
    const payload = {
      version: 1,
      exportedAt: timestamp,
      tabId,
      tabName: activeTab?.name || null,
      cellCount: notebookCells.length,
      cells: notebookCells.map((cell) => ({
        id: cell.id,
        title: cell.title,
        query: cell.query,
        status: cell.status,
        error: cell.error,
        executedAt: cell.executedAt,
        updatedAt: cell.updatedAt,
        previewRowCount: cell.result ? cell.result.length : 0,
        preview: cell.result ? cell.result.slice(0, 100) : [],
        columns: cell.columns,
      })),
    };

    downloadData(JSON.stringify(payload, null, 2), `${baseName}.sqlnb.json`, 'application/json');
  }, [notebookCells, tabId, tabs]);

  const handleGenerateInsights = useCallback(async () => {
    if (insightLoading) {
      return;
    }

    const hasDataset = Array.isArray(parsedData) && parsedData.length > 0;
    const hasNotebookResult = notebookCells.some(
      (cell) =>
        (Array.isArray(cell.result) && cell.result.length > 0) ||
        (Array.isArray(cell.originalResult) && cell.originalResult.length > 0),
    );
    const hasQueryResult = Array.isArray(queryResult) && queryResult.length > 0;
    const hasStats = statisticsResult && Object.keys(statisticsResult).length > 0;
    const hasInfo = infoResult && Object.keys(infoResult).length > 0;
    const hasChartData = chartData && typeof chartData === 'object';

    if (!hasDataset && !hasNotebookResult && !hasQueryResult && !hasStats && !hasInfo && !hasChartData) {
      setInsightError('インサイトを生成するためのデータがありません。');
      setInsightPreview(null);
      setIsInsightPanelOpen(true);
      return;
    }

    try {
      setInsightLoading(true);
      setInsightError(null);
      setIsInsightPanelOpen(true);
      setInsightPreview(null);
      setIsSaveMenuOpen(false);

      const activeTab = tabs.get(tabId);
      const queryColumns = Array.isArray(queryResult) && queryResult.length > 0 && typeof queryResult[0] === 'object'
        ? Object.keys(queryResult[0] as Record<string, unknown>)
        : [];

      const summary = buildAnalysisSummary({
        datasetName: activeTab?.name || 'データセット',
        datasetType: activeTab?.type || null,
        columns,
        rows: parsedData || [],
        infoSummary: infoResult,
        statistics: statisticsResult,
        notebookCells,
        chartSettings,
        chartData,
        analysisContext: workflowRequest && workflowRequest.trim().length > 0 ? workflowRequest : null,
        latestQuery: sqlQuery && sqlQuery.trim().length > 0 ? sqlQuery : null,
        latestQueryResult: Array.isArray(queryResult)
          ? { columns: queryColumns, rows: queryResult }
          : null,
      });

      const response = await fetch('/api/llm/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'インサイトの生成に失敗しました。');
      }

      const data = await response.json();
      setInsightPreview(data as LlmReportResponse);
      setInsightError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'インサイトの生成に失敗しました。';
      setInsightError(message);
      setInsightPreview(null);
    } finally {
      setInsightLoading(false);
    }
  }, [
    insightLoading,
    parsedData,
    notebookCells,
    queryResult,
    statisticsResult,
    infoResult,
    chartData,
    tabs,
    tabId,
    columns,
    chartSettings,
    workflowRequest,
    sqlQuery,
  ]);

  const handleSaveMarkdown = useCallback(() => {
    if (!insightPreview) {
      setInsightError('保存するインサイトがありません。');
      setIsInsightPanelOpen(true);
      setIsSaveMenuOpen(false);
      return;
    }

    const activeTab = tabs.get(tabId);
    const baseName = activeTab?.name?.replace(/\.[^/.]+$/, '') || 'analysis';
    downloadData(insightPreview.markdown, `${baseName}-insight.md`, 'text/markdown');
    setInsightError(null);
    setIsSaveMenuOpen(false);
  }, [insightPreview, tabId, tabs]);

  const handleSaveWord = useCallback(async () => {
    if (!insightPreview?.word) {
      setInsightError('Word出力に必要なデータがありません。');
      setIsInsightPanelOpen(true);
      setIsSaveMenuOpen(false);
      return;
    }

    try {
      const {
        Document,
        Packer,
        Paragraph,
        HeadingLevel,
        TextRun,
        Table,
        TableRow,
        TableCell,
        WidthType,
      } = await import('docx');

      const elements: any[] = [];
      const headingMap: Record<number, HeadingLevel> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
      };

      elements.push(new Paragraph({ text: insightPreview.word.title, heading: HeadingLevel.HEADING_1 }));

      insightPreview.word.sections.forEach((section) => {
        const headingLevel = section.level ? headingMap[section.level] : HeadingLevel.HEADING_2;
        elements.push(new Paragraph({ text: section.heading, heading: headingLevel }));

        if (section.paragraphs) {
          section.paragraphs.forEach((paragraph) => {
            const lines = paragraph
              .split(/\n+/)
              .map((line) => line.trim())
              .filter((line) => line.length > 0);
            if (lines.length === 0) {
              elements.push(new Paragraph({ text: '' }));
            } else {
              lines.forEach((line) => {
                elements.push(new Paragraph({ text: line }));
              });
            }
          });
        }

        if (section.bullets) {
          section.bullets.forEach((bullet) => {
            bullet
              .split(/\n+/)
              .map((line) => line.trim())
              .filter((line) => line.length > 0)
              .forEach((line) => {
                elements.push(new Paragraph({ text: line, bullet: { level: 0 } }));
              });
          });
        }

        if (section.table) {
          if (section.table.caption) {
            elements.push(
              new Paragraph({
                children: [new TextRun({ text: section.table.caption, italics: true })],
              }),
            );
          }

          const headerRow = new TableRow({
            children: section.table.headers.map(
              (header) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: header, bold: true })],
                    }),
                  ],
                }),
            ),
          });

          const dataRows = section.table.rows.map(
            (row) =>
              new TableRow({
                children: row.map(
                  (cell) =>
                    new TableCell({
                      children: [new Paragraph({ text: cell })],
                    }),
                ),
              }),
          );

          elements.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [headerRow, ...dataRows],
            }),
          );
        }

        elements.push(new Paragraph({ text: '' }));
      });

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: elements,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const activeTab = tabs.get(tabId);
      const baseName = activeTab?.name?.replace(/\.[^/.]+$/, '') || 'analysis';
      downloadData(
        blob,
        `${baseName}-insight.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      setInsightError(null);
    } catch (error) {
      console.error('Word export error:', error);
      setInsightError('Wordエクスポート中にエラーが発生しました。');
      setIsInsightPanelOpen(true);
    } finally {
      setIsSaveMenuOpen(false);
    }
  }, [insightPreview, tabId, tabs]);

  // チャートを更新
  const updateChart = () => {
    // チャート設定の詳細なデバッグ出力
    console.log('チャート設定デバッグ - 更新開始時の設定:', {
      X軸: chartSettings.xAxis,
      Y軸: chartSettings.yAxis,
      カテゴリフィールド: chartSettings.categoryField,
      カテゴリフィールドの型: typeof chartSettings.categoryField,
      カテゴリフィールドの値チェック: chartSettings.categoryField ? 'あり' : 'なし',
      カテゴリフィールドの長さ: chartSettings.categoryField ? chartSettings.categoryField.length : 0,
      チャートタイプ: chartSettings.type,
      データソース: chartSettings.dataSource || 'queryResult',
      集計方法: chartSettings.aggregation
    });
    
    const applyPreparedChartData = (preparedData: any, fallbackError?: string) => {
      if (!preparedData) {
        setError(fallbackError || 'チャートデータの生成に失敗しました');
        setChartData(null);
        setLoading(false);
        return false;
      }

      if (preparedData.metadata?.error) {
        setError(preparedData.metadata.error);
        setChartData(null);
        setLoading(false);
        return false;
      }

      setChartData(preparedData);
      setError(null);
      return true;
    };

    if (chartSettings.type === 'venn') {
      const vennFields = chartSettings.options?.vennFields?.filter(field => field && field.trim() !== '') || [];
      if (vennFields.length < 2) {
        setError('ベン図を作成するには2つ以上（最大3つ）のフィールドを選択してください');
        setChartData(null);
        setLoading(false);
        return;
      }
    } else if (!chartSettings.xAxis || (!chartSettings.yAxis && chartSettings.aggregation !== 'count')) {
      // カウント集計時はY軸がなくてもよい、それ以外はY軸が必須
      if (!chartSettings.xAxis) {
        setError('X軸の選択は必須です');
      } else if (!chartSettings.yAxis && chartSettings.aggregation !== 'count') {
        setError('Y軸の選択は必須です（カウント集計を除く）');
      }
      return;
    }

    setLoading(true);
    setError(null); // エラーをクリア
    
    // データソースが未設定の場合はクエリ結果を使用
    if (!chartSettings.dataSource) {
      updateChartSettings({ dataSource: 'queryResult' });
    }
    
    console.log('カテゴリデバッグ - チャート更新開始:', {
      X軸: chartSettings.xAxis,
      Y軸: chartSettings.yAxis,
      カテゴリフィールド: chartSettings.categoryField,
      チャートタイプ: chartSettings.type,
      データソース: chartSettings.dataSource || 'queryResult'
    });
    
    let sourceData: any[] | null = null;
    try {
      // データソースの選択に基づいてデータを選択
      if (chartSettings.dataSource === 'queryResult') {
        // クエリ結果を使用
        sourceData = queryResult;
        if (!sourceData || sourceData.length === 0) {
          setError('クエリ結果がありません。先にSQLクエリを実行してください。');
          setChartData(null);
          setLoading(false);
          return;
        }
      } else {
        // 元データを使用
        sourceData = parsedData;
        if (!sourceData || sourceData.length === 0) {
          setError('データがありません');
          setChartData(null);
          setLoading(false);
          return;
        }
      }
      
      // データソースのサンプルデータを確認
      console.log('カテゴリデバッグ - データソースサンプル:', {
        最初の行: sourceData[0],
        利用可能な列: Object.keys(sourceData[0]),
        データ行数: sourceData.length
      });
      
      // カテゴリフィールドの確認（より詳細なデバッグ）
      console.log('カテゴリデバッグ - カテゴリフィールド存在チェック:', {
        カテゴリフィールド: chartSettings.categoryField,
        カテゴリフィールドの型: typeof chartSettings.categoryField,
        値の確認: chartSettings.categoryField ? '値あり' : '値なし',
        条件評価結果: chartSettings.categoryField ? true : false,
        文字列長さ: chartSettings.categoryField ? chartSettings.categoryField.length : 0,
        trimした文字列長さ: chartSettings.categoryField ? chartSettings.categoryField.trim().length : 0
      });
      
      if (chartSettings.categoryField && chartSettings.categoryField.trim().length > 0) {
        console.log('カテゴリデバッグ - カテゴリフィールド情報:', {
          指定カテゴリフィールド: chartSettings.categoryField,
          サンプル値: sourceData.slice(0, 3).map(item => ({
            カテゴリ値: item[chartSettings.categoryField || ''],
            型: typeof item[chartSettings.categoryField || '']
          }))
        });
        
        // カテゴリの一意な値を取得
        const categoryField = chartSettings.categoryField;
        const uniqueCategories = [...new Set(sourceData
          .filter(item => item[categoryField] !== undefined)
          .map(item => String(item[categoryField]))
        )];
        
      }
      
      // 元データの列名を大文字小文字を区別せずに確認
      if (sourceData && sourceData.length > 0) {
        const firstItem = sourceData[0];
        const availableColumns = Object.keys(firstItem);
        const lowerCaseColumns = availableColumns.map(col => col.toLowerCase());
        
        console.log('Y値デバッグ - 利用可能な列名:', {
          列名一覧: availableColumns,
          小文字の列名一覧: lowerCaseColumns,
          Y軸指定値: chartSettings.yAxis,
          Y軸指定値の小文字: chartSettings.yAxis.toLowerCase(),
          一致するか: lowerCaseColumns.includes(chartSettings.yAxis.toLowerCase()),
          最初の行のY値: firstItem[chartSettings.yAxis],
          Y値の型: typeof firstItem[chartSettings.yAxis],
          Y値の数値変換: parseFloat(String(firstItem[chartSettings.yAxis])),
          変換後の型: typeof parseFloat(String(firstItem[chartSettings.yAxis]))
        });
        
        // 実際の列名を見つける（大文字小文字を区別せずに）
        const normalizedYAxis = availableColumns.find(
          col => col.toLowerCase() === chartSettings.yAxis.toLowerCase()
        ) || chartSettings.yAxis;
        
        if (normalizedYAxis !== chartSettings.yAxis) {
          updateChartSettings({ yAxis: normalizedYAxis });
          // 列名が変更されたので一度この関数を終了し、useEffectで再度呼び出されるようにする
          setLoading(false);
          return;
        }
      }
      
      // 色の配列を定義（一貫性のある色を提供するため）
      const colorPalette = [
        { bg: 'rgba(54, 162, 235, 0.6)', border: 'rgba(54, 162, 235, 1)' },
        { bg: 'rgba(255, 99, 132, 0.6)', border: 'rgba(255, 99, 132, 1)' },
        { bg: 'rgba(75, 192, 192, 0.6)', border: 'rgba(75, 192, 192, 1)' },
        { bg: 'rgba(255, 159, 64, 0.6)', border: 'rgba(255, 159, 64, 1)' },
        { bg: 'rgba(153, 102, 255, 0.6)', border: 'rgba(153, 102, 255, 1)' },
        { bg: 'rgba(255, 205, 86, 0.6)', border: 'rgba(255, 205, 86, 1)' },
        { bg: 'rgba(201, 203, 207, 0.6)', border: 'rgba(201, 203, 207, 1)' },
        { bg: 'rgba(102, 187, 106, 0.6)', border: 'rgba(102, 187, 106, 1)' },
        { bg: 'rgba(238, 130, 238, 0.6)', border: 'rgba(238, 130, 238, 1)' },
        { bg: 'rgba(255, 99, 71, 0.6)', border: 'rgba(255, 99, 71, 1)' }
      ];
      
      // 色を取得する関数
      const getColor = (index: number) => {
        return colorPalette[index % colorPalette.length];
      };
      
      // 集計関数を使用するかどうか
      const useAggregation = chartSettings.aggregation !== 'none';
      // chartSettings.aggregationが'none'の場合は'count'を使用（集計が必要な場合のみ）
      const aggType = useAggregation ? chartSettings.aggregation : 'count';
      
      console.log('カテゴリデバッグ - チャート処理方法の決定:', {
        チャートタイプ: chartSettings.type,
        集計使用: useAggregation,
        集計タイプ: aggType
      });
      
      // ヒストグラムの場合は集計なしで直接データを使用
      if (chartSettings.type === 'histogram') {
        // ヒストグラム用のデータを確認
        const histogramValues = sourceData.map(item => {
          const value = item[chartSettings.yAxis];
          return typeof value === 'number' && !isNaN(value) ? value : null;
        }).filter(v => v !== null);
        
        if (histogramValues.length === 0) {
          setError('ヒストグラム用の数値データが見つかりません。Y軸に数値フィールドを選択してください。');
          setChartData(null);
          setLoading(false);
          return;
        }
        
        const preparedData = prepareChartData(
          sourceData,
          chartSettings.xAxis,
          chartSettings.yAxis,
          'histogram',
          chartSettings.categoryField,
          { bins: chartSettings.options?.bins || 10 }
        );

        console.log('カテゴリデバッグ - ヒストグラムデータ準備完了:', {
          データセット数: preparedData?.datasets?.length || 0,
          ラベル数: preparedData?.labels?.length || 0
        });

        if (!applyPreparedChartData(preparedData, 'ヒストグラム用のチャートデータの生成に失敗しました')) {
          return;
        }
      }
      // 回帰分析の場合も集計なしで直接データを使用
      else if (chartSettings.type === 'regression') {
        const preparedData = prepareChartData(
          sourceData,
          chartSettings.xAxis, 
          chartSettings.yAxis, 
          'regression',
          chartSettings.categoryField,
          { 
            regressionType: chartSettings.options?.regressionType || 'linear',
            regressionOrder: chartSettings.options?.regressionOrder || 2
          }
        );
        if (!applyPreparedChartData(preparedData, '回帰チャートの生成に失敗しました')) {
          return;
        }
      } else if (chartSettings.type === 'gantt') {
        const taskNameField = chartSettings.options?.taskNameField;
        const startDateField = chartSettings.options?.startDateField;
        const endDateField = chartSettings.options?.endDateField;

        if (!taskNameField || !startDateField || !endDateField) {
          setError('ガントチャートにはタスク名、開始日、終了日のフィールドが必要です');
          setChartData(null);
          setLoading(false);
          return;
        }

        const preparedData = prepareChartData(
          sourceData, 
          taskNameField, // labelField
          '', // valueField (not used for gantt)
          'gantt',
          chartSettings.categoryField,
          { 
            taskNameField,
            startDateField,
            endDateField
          }
        );

        if (!applyPreparedChartData(preparedData, 'ガントチャートの生成に失敗しました')) {
          return;
        }
      } else if (chartSettings.type === 'venn') {
        const vennFields = chartSettings.options?.vennFields?.filter(field => field && field.trim() !== '') || [];
        const preparedData = prepareChartData(
          sourceData,
          '',
          '',
          'venn',
          undefined,
          {
            ...chartSettings.options,
            vennFields
          }
        );

        if (!applyPreparedChartData(preparedData, 'ベン図を作成できませんでした')) {
          return;
        }
        return;
      }
      // その他のチャートタイプは通常の集計を使用
      else {
        // 集計なしの場合は直接データを使用
        if (!useAggregation) {
          // データの生成方法はチャートタイプによって異なる
          if (chartSettings.type === 'line' || chartSettings.type === 'bar' || chartSettings.type === 'pie') {
            // 散布図と同様の方法で直接データを使用
            const labels = sourceData.map(item => item[chartSettings.xAxis]);
            const values = sourceData.map(item => item[chartSettings.yAxis]);
            
            // カテゴリフィールドがある場合
            if (chartSettings.categoryField) {
              const categories = [...new Set(sourceData?.map(item => item[chartSettings.categoryField || '']) || [])];
              
              const datasets = categories.map((category, index) => {
                const categoryData = sourceData?.filter(item => item[chartSettings.categoryField || ''] === category) || [];
                const categoryLabels = categoryData.map(item => item[chartSettings.xAxis]);
                const categoryValues = categoryData.map(item => item[chartSettings.yAxis]);
                
                // カテゴリごとにデータポイントをマッピング
                const dataPoints = labels.map(label => {
                  const idx = categoryLabels.indexOf(label);
                  return idx !== -1 ? categoryValues[idx] : null;
                });
                
                const color = getColor(index);
                
                return {
                  label: String(category),
                  data: dataPoints,
                  backgroundColor: color.bg,
                  borderColor: color.border,
                  borderWidth: 1,
                };
              });
              
              setChartData({
                labels,
                datasets,
              });
            } else {
              // カテゴリなしの場合
              const defaultColor = getColor(0);
              setChartData({
                labels,
                datasets: [
                  {
                    label: chartSettings.yAxis,
                    data: values,
                    backgroundColor: defaultColor.bg,
                    borderColor: defaultColor.border,
                    borderWidth: 1,
                  },
                ],
              });
            }
            
            setError(null);
          } else if (chartSettings.type === 'scatter') {
                // 散布図の場合
                console.log('散布図データソース:', {
                  sourceData: sourceData?.slice(0, 3),
                  x軸: chartSettings.xAxis,
                  y軸: chartSettings.yAxis
                });
                
                // フィールド名が正しいか確認
                if (sourceData && sourceData.length > 0) {
                  const firstItem = sourceData[0];
                  const availableFields = Object.keys(firstItem);
                  
                  // 元データの詳細ログ（Y値確認用）
                  console.log('Y値デバッグ - 元データの詳細:', {
                    最初の行: firstItem,
                    利用可能な列名: availableFields,
                    Y軸に指定された列名: chartSettings.yAxis,
                    実際のY値: firstItem[chartSettings.yAxis],
                    Y値の型: typeof firstItem[chartSettings.yAxis]
                  });
                  
                  // 大文字小文字を区別せずに適切な列名を見つける
                  const actualXField = availableFields.find(field => 
                    field.toLowerCase() === chartSettings.xAxis.toLowerCase()
                  ) || chartSettings.xAxis;
                  
                  const actualYField = availableFields.find(field => 
                    field.toLowerCase() === chartSettings.yAxis.toLowerCase()
                  ) || chartSettings.yAxis;
                  
                  // 見つかった正確な列名を使用
                  const xAxisNormalized = actualXField;
                  const yAxisNormalized = actualYField;
                  
                  console.log('Y値デバッグ - 正規化された列名:', {
                    元のX軸: chartSettings.xAxis,
                    正規化されたX軸: xAxisNormalized,
                    元のY軸: chartSettings.yAxis,
                    正規化されたY軸: yAxisNormalized,
                    利用可能なフィールド: availableFields
                  });
                  
                  // 列名の正規化が必要な場合は設定を更新して再実行
                  if (xAxisNormalized !== chartSettings.xAxis || yAxisNormalized !== chartSettings.yAxis) {
                    updateChartSettings({ 
                      xAxis: xAxisNormalized, 
                      yAxis: yAxisNormalized 
                    });
                    setLoading(false);
                    return;
                  }
                  
                  console.log('利用可能なフィールド:', {
                    全フィールド: availableFields,
                    X軸が存在: availableFields.includes(chartSettings.xAxis),
                    Y軸が存在: availableFields.includes(chartSettings.yAxis),
                    カテゴリが存在: chartSettings.categoryField ? availableFields.includes(chartSettings.categoryField) : 'カテゴリ未指定'
                  });              
                  
                  // フィールドが存在しない場合は警告
                  if (!availableFields.includes(chartSettings.xAxis)) {
                    console.error(`X軸に指定されたフィールド "${chartSettings.xAxis}" が見つかりません`);
                  }
                  if (!availableFields.includes(chartSettings.yAxis)) {
                    console.error(`Y軸に指定されたフィールド "${chartSettings.yAxis}" が見つかりません`);
                  }
                  
                  // sourceDataの内容を詳細に確認（最初の数行のみ）
                  console.log('sourceDataのサンプル値 (先頭5行):', sourceData.slice(0, 5).map(item => ({
                    [chartSettings.xAxis]: item[chartSettings.xAxis],
                    [chartSettings.yAxis]: item[chartSettings.yAxis],
                    [chartSettings.categoryField || 'カテゴリなし']: chartSettings.categoryField ? item[chartSettings.categoryField] : 'なし'
                  })));
                }
            
              // 散布図のデータ詳細ログ（特にXとYの値をチェック）
            if (sourceData && sourceData.length > 0) {
              console.log('【デバッグ】散布図用データの詳細:', {
                x軸: chartSettings.xAxis,
                y軸: chartSettings.yAxis,
                最初の5つの行: sourceData.slice(0, 5).map((item, idx) => ({
                  row: idx,
                  [chartSettings.xAxis]: item[chartSettings.xAxis],
                  [chartSettings.yAxis]: item[chartSettings.yAxis],
                  [chartSettings.xAxis + '_type']: typeof item[chartSettings.xAxis],
                  [chartSettings.yAxis + '_type']: typeof item[chartSettings.yAxis]
                }))
              });
            }            if (chartSettings.categoryField) {
              // カテゴリフィールドを使用して色分け
              // フィールド名の正規化を試みる（大文字小文字の違いや類似名を考慮）
              const categoryField = chartSettings.categoryField || '';
              
              // すべてのカラム名を小文字化して比較し、正確な大文字小文字を保持したフィールド名を取得
              const normalizedCategoryField = sourceData && sourceData.length > 0
                ? Object.keys(sourceData[0]).find(key => 
                    key.toLowerCase() === categoryField.toLowerCase() || 
                    key.toLowerCase().includes(categoryField.toLowerCase()) || 
                    categoryField.toLowerCase().includes(key.toLowerCase())
                  ) || categoryField
                : categoryField;
              
                // カテゴリフィールド処理の詳細ログ
                console.log('【デバッグ】カテゴリフィールド情報:', {
                  指定されたフィールド名: categoryField,
                  正規化フィールド名: normalizedCategoryField,
                  利用可能なフィールド: sourceData && sourceData.length > 0 ? Object.keys(sourceData[0]) : [],
                  正規化フィールドのサンプル値: sourceData && sourceData.length > 0 
                    ? sourceData.slice(0, 5).map((item, idx) => ({
                        行: idx,
                        値: item[normalizedCategoryField],
                        小文字値: item[normalizedCategoryField.toLowerCase()]
                      }))
                    : []
                });
                
                // カテゴリ値を正確に取得
                const categories = [...new Set(sourceData?.map(item => {
                  // カテゴリ値を正確に取得（大文字小文字両方のフィールド名を試す）
                  const categoryValue = item[normalizedCategoryField] || 
                                       item[normalizedCategoryField.toLowerCase()] || 
                                       item[normalizedCategoryField.toUpperCase()];
                  // 常に文字列化してnull/undefinedチェック
                  const result = categoryValue !== undefined && categoryValue !== null ? String(categoryValue) : 'undefined';
                  return result;
                }) || [])];
                
                
                // 散布図データ準備のログを削除して必要なものだけ残す
                console.log('【デバッグ】散布図データの準備:', {
                  カテゴリ一覧: categories,
                  xAxis: chartSettings.xAxis,
                  yAxis: chartSettings.yAxis,
                  カテゴリフィールド: categoryField,
                  正規化後のカテゴリフィールド: normalizedCategoryField
                });              const datasets = categories.map((category, index) => {
                // カテゴリデータのフィルタリング
                const categoryData = sourceData?.filter((item, idx) => {
                  // カテゴリ値を文字列化して比較（複数のフィールド名バリエーションを試す）
                  const itemCategoryValue = item[normalizedCategoryField] || 
                                           item[normalizedCategoryField.toLowerCase()] || 
                                           item[normalizedCategoryField.toUpperCase()];
                  const itemCategoryStr = String(itemCategoryValue || '');
                  const categoryStr = String(category || '');
                  
                  // デバッグログ（最初の数項目のみ）
                  if (idx < 3) {
                    console.log(`【デバッグ】カテゴリ比較 [${idx}]:`, {
                      実際の値: itemCategoryValue,
                      正規化値: itemCategoryStr,
                      比較対象: categoryStr,
                      一致: itemCategoryStr === categoryStr
                    });
                  }
                  
                  return itemCategoryStr === categoryStr;
                }) || [];
                
                // カテゴリデータのログを簡素化
                console.log(`【デバッグ】カテゴリ "${category}" のデータ:`, {
                  データ数: categoryData.length,
                  最初の行のサンプル: categoryData.length > 0 ? {
                    [chartSettings.xAxis]: categoryData[0][chartSettings.xAxis],
                    [chartSettings.yAxis]: categoryData[0][chartSettings.yAxis],
                    [normalizedCategoryField]: categoryData[0][normalizedCategoryField]
                  } : null
                });
                
              const categoryScatterData = categoryData?.map((item, idx) => {
                  // 元の値を詳細に確認（最初の数行のみ）
                  if (idx < 3) {
                    console.log(`【デバッグ】カテゴリ ${category} の元データ[${idx}]:`, {
                      [chartSettings.xAxis]: item[chartSettings.xAxis],
                      [chartSettings.xAxis + '_type']: typeof item[chartSettings.xAxis],
                      [chartSettings.yAxis]: item[chartSettings.yAxis],
                      [chartSettings.yAxis + '_type']: typeof item[chartSettings.yAxis],
                      [normalizedCategoryField]: item[normalizedCategoryField],
                      [normalizedCategoryField + '_lowercase']: item[normalizedCategoryField.toLowerCase()]
                    });
                  }
                  
                  // 明示的に数値に変換し、NaNをチェック
                  let xValue = null;
                  let yValue = null;
                  
                  // 大文字小文字を区別せずに正確な列名を見つける
                  const itemKeys = Object.keys(item);
                  const actualXField = itemKeys.find(key => key.toLowerCase() === chartSettings.xAxis.toLowerCase()) || chartSettings.xAxis;
                  const actualYField = itemKeys.find(key => key.toLowerCase() === chartSettings.yAxis.toLowerCase()) || chartSettings.yAxis;
                  
                  // 正規化された列名を使用
                  // X値の処理
                  if (typeof item[actualXField] === 'number') {
                    xValue = item[actualXField];
                    if (idx < 5 && actualXField !== chartSettings.xAxis) {
                    }
                  } else if (item[actualXField] !== undefined && item[actualXField] !== null) {
                    const xStr = String(item[actualXField]).trim();
                    xValue = parseFloat(xStr);
                    if (isNaN(xValue) && idx < 5) {
                    }
                  }
                  
                  // Y値の処理
                  if (typeof item[actualYField] === 'number') {
                    yValue = item[actualYField];
                    if (idx < 5) {
                    }
                  } else if (item[actualYField] !== undefined && item[actualYField] !== null) {
                    const yStr = String(item[actualYField]).trim();
                    yValue = parseFloat(yStr);
                    if (isNaN(yValue) && idx < 5) {
                    } else if (idx < 5) {
                    }
                  }
                  
                  // 変換後の値をログに出力（デバッグ用）
                  if (idx < 3) {
                    console.log(`【デバッグ】カテゴリ ${category} 変換後[${idx}]:`, { 
                      x: xValue, 
                      y: yValue,
                      xType: typeof xValue,
                      yType: typeof yValue,
                      カテゴリ: String(category)
                    });
                  }
                  
                  // NaNでないことを確認
                  if (xValue === null || yValue === null || isNaN(xValue) || isNaN(yValue)) {
                    if (idx < 5) {
                      console.warn(`無効なデータポイント [${idx}]: X=${xValue}, Y=${yValue}`);
                    }
                    return null;
                  }
                  
                  // 必ず文字列として保存するために明示的に変換
                  const categoryStr = String(category || '');
                  
                  return {
                    x: xValue,
                    y: yValue,
                    category: categoryStr, // 確実に文字列として保存
                    original: {
                      x: item[chartSettings.xAxis],
                      y: item[chartSettings.yAxis],
                      category: item[normalizedCategoryField]
                    }
                  };
                }).filter(point => point !== null && point.x !== null && point.y !== null && !isNaN(point.x) && !isNaN(point.y)); // 無効なポイントを除外
                
                // カテゴリ散布図データのログを簡素化
                if (categoryScatterData.length > 0) {
                }
                
                const color = getColor(index);
                
                return {
                  label: String(category),
                  data: categoryScatterData,
                  backgroundColor: color.bg,
                  borderColor: color.border,
                  borderWidth: 1,
                  pointRadius: 5,
                  pointHoverRadius: 7,
                  categoryColorIndex: index // カテゴリの色のインデックスを保存
                };
              });
              
              // 有効なデータセットがあるかチェック
              const hasValidData = datasets.some(dataset => dataset.data.length > 0);
              if (!hasValidData) {
                setError('有効なデータポイントがありません。数値データを選択してください。');
                setChartData(null);
              } else {
                // カテゴリなしの場合のデータログを簡素化
              console.log('【デバッグ】カテゴリ別散布図データ:', datasets.map(d => ({ 
                label: d.label, 
                データ数: d.data.length,
                サンプル: d.data.length > 0 && d.data[0] ? { x: d.data[0].x, y: d.data[0].y } : null
              })));
                
                setChartData({
                  datasets
                });
              }
            } else {
                // カテゴリなしの散布図データの生成
              const scatterData = sourceData.map((item, index) => {
                // 大文字小文字を区別せずに正確な列名を見つける
                const itemKeys = Object.keys(item);
                const actualXField = itemKeys.find(key => key.toLowerCase() === chartSettings.xAxis.toLowerCase()) || chartSettings.xAxis;
                const actualYField = itemKeys.find(key => key.toLowerCase() === chartSettings.yAxis.toLowerCase()) || chartSettings.yAxis;
                
                // Y値デバッグ - 元データの詳細なログ
                if (index < 5) {
                  const allYValues: Record<string, { 値: any; 型: string }> = {};
                  // すべてのキーに対して、指定されたY軸名に近いキーの値を検査
                  itemKeys.forEach(key => {
                    if (key.toLowerCase().includes(chartSettings.yAxis.toLowerCase()) || 
                        chartSettings.yAxis.toLowerCase().includes(key.toLowerCase())) {
                      allYValues[key] = {
                        値: item[key],
                        型: typeof item[key]
                      };
                    }
                  });
                  
                  console.log(`Y値デバッグ - 詳細な列名一致チェック[${index}]:`, {
                    元データキー: itemKeys,
                    検索するY軸名: chartSettings.yAxis,
                    検索するY軸名小文字: chartSettings.yAxis.toLowerCase(),
                    正規化されたY軸名: actualYField,
                    正規化前のY値: item[chartSettings.yAxis],
                    正規化後のY値: item[actualYField],
                    正規化前のY値型: typeof item[chartSettings.yAxis],
                    正規化後のY値型: typeof item[actualYField],
                    類似キーのY値一覧: allYValues,
                    元データ完全ダンプ: JSON.stringify(item)
                  });
                }
                
                // 明示的に数値に変換し、NaNをチェック
                let xValue = null;
                let yValue = null;
                
                // X値の処理 - 正規化された列名を使用
                if (typeof item[actualXField] === 'number') {
                  xValue = item[actualXField];
                } else if (item[actualXField] !== undefined && item[actualXField] !== null) {
                  // 文字列を数値に変換する前に、元の値を保存
                  const originalXValue = item[actualXField];
                  const xString = String(originalXValue).trim();
                  
                  // 特殊文字を除去しない - CSVから読み込んだ数値は適切に処理されるべき
                  xValue = parseFloat(xString);
                  
                  if (index < 5) {
                  }
                }
                
                // Y値の処理 - 正規化された列名を使用してY値を取得
                // 複数の方法でY値の取得を試みる（より堅牢な実装）
                
                // 1. まず正規化された列名で取得を試みる
                if (typeof item[actualYField] === 'number') {
                  yValue = item[actualYField];
                  if (index < 5) {
                  }
                } else if (item[actualYField] !== undefined && item[actualYField] !== null) {
                  // 文字列を数値に変換する前に、元の値を保存
                  const originalYValue = item[actualYField];
                  const yString = String(originalYValue).trim();
                  
                  // 変換前の文字列をログに出力
                  if (index < 5) {
                  }
                  
                  // 文字列を数値に変換
                  yValue = parseFloat(yString);
                  
                  // 変換後の数値をログに出力
                  if (index < 5) {
                  }
                }
                
                // 2. 元のY列名フィールドを試す（大文字小文字の正規化前）
                if ((yValue === null || isNaN(yValue as number)) && 
                    chartSettings.yAxis !== actualYField && 
                    item[chartSettings.yAxis] !== undefined && 
                    item[chartSettings.yAxis] !== null) {
                  if (typeof item[chartSettings.yAxis] === 'number') {
                    yValue = item[chartSettings.yAxis];
                  } else {
                    yValue = parseFloat(String(item[chartSettings.yAxis]).trim());
                  }
                  if (index < 5) {
                  }
                }
                
                // 3. 'value'フィールドを試す（集計関数からの結果である可能性がある）
                if ((yValue === null || isNaN(yValue as number)) && 
                    item.value !== undefined && 
                    item.value !== null) {
                  if (typeof item.value === 'number') {
                    yValue = item.value;
                  } else {
                    yValue = parseFloat(String(item.value).trim());
                  }
                  if (index < 5) {
                  }
                }
                
                // 4. 元の列名の大文字小文字バリエーションを試す
                if (yValue === null || isNaN(yValue as number)) {
                  // 大文字と小文字バリエーションを試す
                  const upperCaseYAxis = chartSettings.yAxis.toUpperCase();
                  const lowerCaseYAxis = chartSettings.yAxis.toLowerCase();
                  
                  if (item[upperCaseYAxis] !== undefined && item[upperCaseYAxis] !== null) {
                    if (typeof item[upperCaseYAxis] === 'number') {
                      yValue = item[upperCaseYAxis];
                    } else {
                      yValue = parseFloat(String(item[upperCaseYAxis]).trim());
                    }
                    if (index < 5) {
                    }
                  } else if (item[lowerCaseYAxis] !== undefined && item[lowerCaseYAxis] !== null) {
                    if (typeof item[lowerCaseYAxis] === 'number') {
                      yValue = item[lowerCaseYAxis];
                    } else {
                      yValue = parseFloat(String(item[lowerCaseYAxis]).trim());
                    }
                    if (index < 5) {
                    }
                  }
                }
                
                // 5. 他の数値フィールドを探す（最後の手段）
                if ((yValue === null || isNaN(yValue as number)) && index < 5) {
                  
                  // 全ての数値フィールドをチェック
                  const numericFields = Object.keys(item).filter(key => 
                    typeof item[key] === 'number' && 
                    !isNaN(item[key]) && 
                    key !== actualXField
                  );
                  
                  if (numericFields.length > 0) {
                    yValue = item[numericFields[0]];
                  }
                }
                
                // 変換後の値ログ
                if (index < 5) {
                  console.log(`Y値デバッグ - 変換後データ[${index}]:`, { 
                    yValue,
                    yType: typeof yValue,
                    isValidY: yValue !== null && !isNaN(yValue as number)
                  });
                }
                
                // NaNでないことを確認
                if (xValue === null || yValue === null || (typeof xValue === 'number' && isNaN(xValue)) || (typeof yValue === 'number' && isNaN(yValue))) {
                  if (index < 5) {
                  }
                  return null;
                }
                
                // 値をしっかりと確認し、数値であることを保証する
                const validX = typeof xValue === 'number' && !isNaN(xValue) ? xValue : null;
                const validY = typeof yValue === 'number' && !isNaN(yValue) ? yValue : null;
                
                // 最終データログ
                if (index < 5) {
                  console.log(`Y値デバッグ - 最終データ[${index}]:`, { 
                    x: validX, 
                    y: validY,
                    original: { x: item[actualXField], y: item[actualYField] }
                  });
                }
                
                return {
                  x: validX,
                  y: validY,
                  // 元の値も保存
                  raw: {
                    x: item[actualXField],
                    y: item[actualYField]
                  },
                  // カテゴリなしの場合でも species 列があればそれを使用
                  category: chartSettings.categoryField ? 
                    (item[chartSettings.categoryField] !== undefined ? String(item[chartSettings.categoryField]) : "") 
                    : ""
                };
              }).filter(point => point !== null && point.x !== null && point.y !== null && !isNaN(point.x) && !isNaN(point.y)); // 無効なポイントを除外
              
              // 散布図データ生成結果のログを簡素化
              console.log('【デバッグ】散布図データ生成結果:', {
                総行数: sourceData.length,
                有効データ数: scatterData.length,
                最初のサンプル: scatterData.length > 0 && scatterData[0] ? { 
                  x: scatterData[0].x, 
                  y: scatterData[0].y 
                } : null
              });
              
              const defaultColor = getColor(0);
              
              // 有効なデータがあるかチェック
              if (scatterData.length === 0) {
                setError('有効なデータポイントがありません。数値データを選択してください。');
                setChartData(null);
              } else {
                // Y値が0かどうかの確認
              console.log('Y値デバッグ - 散布図データ最終結果:', {
                総データ数: scatterData.length,
                Y値が0の数: scatterData.filter(p => p && p.y === 0).length,
                Y値が0のデータポイント: scatterData.filter(p => p && p.y === 0).slice(0, 5),
                Y値のユニーク値: [...new Set(scatterData.map(p => p ? p.y : null).filter(v => v !== null))]
                  .sort((a, b) => (a as number) - (b as number))
                  .slice(0, 20),
                元データのY値サンプル: sourceData.slice(0, 5).map(item => {
                  // 正確な列名を取得
                  const itemKeys = Object.keys(item);
                  const actualYField = itemKeys.find(key => key.toLowerCase() === chartSettings.yAxis.toLowerCase()) || chartSettings.yAxis;
                  
                  return {
                    Y軸指定値: chartSettings.yAxis,
                    正規化されたY軸名: actualYField,
                    元の値: item[actualYField],
                    型: typeof item[actualYField],
                    変換後: parseFloat(String(item[actualYField]))
                  };
                })
              });
              
              // Y値のログを詳細に出す
              scatterData.slice(0, 5).forEach((point, idx) => {
                if (point) {
                }
              });
              
              setChartData({
                datasets: [
                  {
                    label: `${chartSettings.xAxis} vs ${chartSettings.yAxis}`,
                    data: scatterData,
                    backgroundColor: defaultColor.bg,
                    borderColor: defaultColor.border,
                    borderWidth: 1,
                    pointRadius: 5,
                    pointHoverRadius: 7
                  },
                ],
              });
              }
            }
            
            setError(null);
          } else {
            // その他のタイプはライブラリの関数を使用
            const preparedData = prepareChartData(
              sourceData,
              chartSettings.xAxis,
              chartSettings.yAxis,
              chartSettings.type,
              chartSettings.categoryField,
              {
                bins: chartSettings.options?.bins || 10,
                regressionType: chartSettings.options?.regressionType || 'linear',
                regressionOrder: chartSettings.options?.regressionOrder || 2
              }
            );
            if (!applyPreparedChartData(preparedData, `${chartSettings.type}チャートの生成に失敗しました`)) {
              return;
            }
          }
        } else {
          // 集計を使用する場合
          // カウント集計でY軸が空の場合は、Y軸なしで集計
          const result = aggregateData(
            sourceData, 
            chartSettings.xAxis, 
            chartSettings.aggregation === 'count' && !chartSettings.yAxis ? '' : chartSettings.yAxis, 
            aggType as 'sum' | 'avg' | 'count' | 'min' | 'max',
            true // ネストされたプロパティへのアクセスを有効化
          );
          
          if (result.error) {
            setError(result.error);
            setChartData(null);
          } else if (result.data) {
            // 集計結果のフィールド名を確認
            console.log('Y値デバッグ - 集計結果の構造:', {
              集計結果: result.data.slice(0, 3),
              キー: result.data.length > 0 ? Object.keys(result.data[0]) : []
            });
            
            // 集計時は通常'value'だが、散布図の場合は実際のカテゴリフィールドの値を使用する
            const valueFieldName = chartSettings.type === 'scatter' 
              ? (chartSettings.categoryField || chartSettings.yAxis) 
              : 'value';
            
            console.log('カテゴリデバッグ - 使用するフィールド名:', {
              チャートタイプ: chartSettings.type,
              使用フィールド名: valueFieldName,
              カテゴリフィールド: chartSettings.categoryField,
              Y軸フィールド: chartSettings.yAxis
            });
            
            // 棒グラフなどでカテゴリフィールドが指定されている場合は、集計結果を加工してカテゴリ情報を追加
            if (chartSettings.categoryField && 
                (chartSettings.type === 'bar' || chartSettings.type === 'stacked-bar' || chartSettings.type === 'line')) {
                
                // カテゴリ値ごとのデータを用意
                const categoryData: Record<string, any[]> = {};
                
                // 元データから一意なカテゴリ値を取得
                const originalData = chartSettings.dataSource === 'queryResult' ? queryResult : parsedData;
                if (originalData && originalData.length > 0) {
                    const uniqueCategories = [...new Set(originalData
                        .filter(item => item[chartSettings.categoryField!] !== undefined)
                        .map(item => String(item[chartSettings.categoryField!])))];
                    
                    console.log('カテゴリデバッグ - 集計後のカテゴリ処理:', {
                        カテゴリフィールド: chartSettings.categoryField,
                        ユニークカテゴリ: uniqueCategories,
                        元データ件数: originalData.length,
                        集計結果件数: result.data.length
                    });
                    
                    // 集計結果の拡張を試みる
                    for (const item of result.data as any[]) {
                        const xValue = item[chartSettings.xAxis]; // X軸の値
                        
                        for (const category of uniqueCategories) {
                            if (!categoryData[category]) {
                                categoryData[category] = [];
                            }
                            
                            // 該当カテゴリのデータがこのX値に存在するか確認
                            const categoryItemsWithXValue = originalData.filter(
                                origItem => String(origItem[chartSettings.categoryField!]) === category && 
                                           String(origItem[chartSettings.xAxis]) === String(xValue)
                            );
                            
                            // カテゴリごとに集計値を計算
                            let categoryValue = 0;
                            if (chartSettings.aggregation === 'count') {
                                // カウント集計ならそのカテゴリの数をカウント
                                categoryValue = categoryItemsWithXValue.length;
                            } else {
                                // その他の集計方法なら実際に集計
                                const categoryItems = originalData.filter(
                                    origItem => String(origItem[chartSettings.categoryField!]) === category
                                );
                                if (categoryItems.length > 0 && chartSettings.yAxis) {
                                    switch (chartSettings.aggregation) {
                                        case 'sum':
                                            categoryValue = categoryItemsWithXValue.reduce(
                                                (sum, item) => sum + (parseFloat(String(item[chartSettings.yAxis])) || 0), 0
                                            );
                                            break;
                                        case 'avg':
                                            if (categoryItemsWithXValue.length > 0) {
                                                categoryValue = categoryItemsWithXValue.reduce(
                                                    (sum, item) => sum + (parseFloat(String(item[chartSettings.yAxis])) || 0), 0
                                                ) / categoryItemsWithXValue.length;
                                            }
                                            break;
                                        case 'min':
                                            categoryValue = Math.min(
                                                ...categoryItemsWithXValue.map(
                                                    item => parseFloat(String(item[chartSettings.yAxis])) || 0
                                                )
                                            );
                                            break;
                                        case 'max':
                                            categoryValue = Math.max(
                                                ...categoryItemsWithXValue.map(
                                                    item => parseFloat(String(item[chartSettings.yAxis])) || 0
                                                )
                                            );
                                            break;
                                    }
                                }
                            }
                            
                            // このX値に対応するカテゴリデータを追加
                            categoryData[category].push({
                                x: xValue,
                                y: categoryValue,
                                category: category
                            });
                        }
                    }
                    
                    // カテゴリごとのデータをログ出力
                    console.log('カテゴリデバッグ - カテゴリ別データ生成結果:', {
                        カテゴリ数: Object.keys(categoryData).length,
                        データサンプル: Object.entries(categoryData).slice(0, 2).map(([category, data]) => ({
                            カテゴリ: category,
                            データ数: data.length,
                            最初の要素: data[0]
                        }))
                    });
                    
                    // カテゴリごとのデータセットを生成して使用
                    if (Object.keys(categoryData).length > 0) {
                        // カスタムデータセットを作成
                        const customDatasets = Object.entries(categoryData).map(([category, dataPoints], index) => {
                            return {
                                label: category,
                                data: dataPoints.map(dp => dp.y),
                                category: category,
                                backgroundColor: `rgba(${54 + index * 40}, ${162 - index * 20}, ${235 - index * 30}, 0.6)`,
                                borderColor: `rgba(${54 + index * 40}, ${162 - index * 20}, ${235 - index * 30}, 1)`,
                                borderWidth: 1
                            };
                        });
                        
                        // カスタムチャートデータを作成
                        const customChartData = {
                            labels: (result.data as any[]).map(item => item[chartSettings.xAxis]),
                            datasets: customDatasets
                        };
                        
                        setChartData(customChartData);
                        setError(null);
                        setLoading(false);
                        return; // カスタムデータを設定したので終了
                    }
                }
            }
            
            const preparedData = prepareChartData(
              result.data as any[],
              chartSettings.xAxis,
              valueFieldName,
              chartSettings.type,
              chartSettings.categoryField,
              {
                bins: chartSettings.options?.bins || 10,
                regressionType: chartSettings.options?.regressionType || 'linear',
                regressionOrder: chartSettings.options?.regressionOrder || 2
              }
            );
            if (!applyPreparedChartData(preparedData, `${chartSettings.type}チャートの生成に失敗しました`)) {
              return;
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'チャート生成中にエラーが発生しました');
      setChartData(null);
    } finally {
      setLoading(false);
    }
  };
  
  // 統計情報の表示
  // 統計・info summary の表示
  const renderStatistics = () => {
    return (
      <div className="flex flex-col gap-8">
        {/* info summary テーブル */}
        <div>
          <h3 className="font-bold mb-2">項目ごとの型・最大文字数サマリー</h3>
          {infoResult ? (
            <InfoResultTable infoResult={infoResult} />
          ) : <div>型・最大文字数サマリーがありません</div>}
        </div>
        {/* describe 統計テーブル */}
        <div>
          <h3 className="font-bold mb-2">数値型項目の統計情報</h3>
          {statisticsResult ? (
            <div className="overflow-auto">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">列名</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">個数</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">平均</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">標準偏差</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">最小値</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">第1四分位</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">中央値</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">第3四分位</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">最大値</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {Object.entries(statisticsResult).map(([column, stats]) => (
                    <tr key={column} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-300">{column}</td>
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300">
                        {(stats as any).count}
                      </td>
                      {(stats as any).type === 'non-numeric' ? (
                        <td colSpan={7} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          非数値データ (ユニーク値: {(stats as any).uniqueCount})
                          {editorSettings.dataDisplayMode === 'nested' && (stats as any).examples && (
                            <div className="mt-1">
                              <span className="text-xs text-gray-500">例:</span>
                              <div className="mt-1 max-h-24 overflow-auto">
                                <ObjectViewer 
                                  data={(stats as any).examples} 
                                  expandLevel={1} 
                                  compactMode={true} 
                                />
                              </div>
                            </div>
                          )}
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300">
                            {(stats as any).mean?.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300">
                            {(stats as any).std?.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300">
                            {(stats as any).min?.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300">
                            {(stats as any).q1?.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300">
                            {(stats as any).median?.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300">
                            {(stats as any).q3?.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-300">
                            {(stats as any).max?.toFixed(2)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div>統計情報はありません</div>}
        </div>
      </div>
    );
  };

  const renderNotebookWorkspace = () => {
    if (!notebookCells || notebookCells.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-gray-500 dark:text-gray-400">
          <p className="mb-4">ノートブックセルがありません。</p>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
            onClick={addNotebookCell}
          >
            <IoAddOutline className="mr-2" />
            セルを追加
          </button>
        </div>
      );
    }

    const statusStyles: Record<SqlNotebookCell['status'], { text: string; className: string }> = {
      idle: { text: '未実行', className: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
      running: { text: '実行中', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' },
      success: { text: '成功', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' },
      error: { text: 'エラー', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200' },
    };

    const exportedLabel = notebookSnapshotMeta?.exportedAt
      ? (() => {
          try {
            return new Date(notebookSnapshotMeta.exportedAt).toLocaleString();
          } catch {
            return notebookSnapshotMeta.exportedAt;
          }
        })()
      : null;

    return (
      <div className="space-y-6 p-4">
        {notebookSnapshotMeta && (
          <div className="rounded-md border border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-900/20 p-4 text-sm text-blue-800 dark:text-blue-200">
            <div className="font-medium">Notebookスナップショットを読み込みました。</div>
            <div className="mt-1 text-xs sm:text-sm text-blue-700/80 dark:text-blue-200/90">
              ファイル: {notebookSnapshotMeta.name}
              {exportedLabel ? `（エクスポート: ${exportedLabel}）` : ''}
              。保存時点のクエリと結果プレビューのみ復元されるため、データセットを再度読み込んで実行してください。
            </div>
          </div>
        )}
        {notebookCells.map((cell, index) => {
          const statusInfo = statusStyles[cell.status];
          const isRunning = cell.status === 'running' || runAllInProgress;
          const resultData = editorSettings.dataDisplayMode === 'nested' && cell.originalResult ? cell.originalResult : cell.result;
          const hasResult = Array.isArray(resultData) && resultData.length > 0;
          const rowCount = Array.isArray(resultData) ? resultData.length : 0;
          const executedLabel = cell.executedAt
            ? (() => {
                try {
                  return new Date(cell.executedAt).toLocaleString();
                } catch {
                  return cell.executedAt;
                }
              })()
            : null;
          const cellView = cellViewModes[cell.id] ?? 'table';

          return (
            <div
              key={cell.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {cell.title || `セル ${index + 1}`}
                  </span>
                  {executedLabel && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      最終実行: {executedLabel}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.className}`}>
                    {statusInfo.text}
                  </span>
                  {hasResult && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {rowCount} 件
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center text-sm disabled:opacity-50"
                    onClick={() => executeNotebookCell(cell.id)}
                    disabled={isRunning}
                  >
                    <IoPlay className="mr-1" />
                    {cell.status === 'running' ? '実行中...' : 'セルを実行'}
                  </button>
                  <button
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 flex items-center text-sm disabled:opacity-50"
                    onClick={() => removeNotebookCell(cell.id)}
                    disabled={notebookCells.length === 1 || runAllInProgress}
                  >
                    <IoTrashOutline className="mr-1" />
                    削除
                  </button>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <textarea
                  value={cell.query}
                  onChange={(e) => updateNotebookCellQuery(cell.id, e.target.value)}
                  className="w-full min-h-[120px] p-3 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm"
                  placeholder="SELECT * FROM ? LIMIT 1000"
                  spellCheck={false}
                  disabled={isRunning}
                />
                {cell.status === 'running' ? (
                  <div className="border border-gray-200 dark:border-gray-700 rounded">
                    <div className="flex items-center justify-center py-10 text-blue-500">
                      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500 mr-3"></div>
                      <span>クエリを実行中...</span>
                    </div>
                  </div>
                ) : cell.status === 'error' ? (
                  <div className="border border-red-200 dark:border-red-800 rounded bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-300">
                    {cell.error || 'クエリ実行でエラーが発生しました'}
                  </div>
                ) : hasResult ? (
                  <ResultChartPanel
                    rows={resultData || []}
                    originalRows={cell.originalResult || resultData || []}
                    isEditable={false}
                    chartTitle="セル結果のチャート"
                    initialView={cellView}
                    activeView={cellView}
                    onViewChange={(view) => setCellViewModes(prev => ({ ...prev, [cell.id]: view }))}
                  />
                ) : (
                  <div className="border border-gray-200 dark:border-gray-700 rounded p-4 text-sm text-gray-500 dark:text-gray-400">
                    実行済みの結果がありません。クエリを実行すると結果が表示されます。
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="flex justify-center pb-4">
          <button
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 flex items-center"
            onClick={addNotebookCell}
          >
            <IoAddOutline className="mr-2" />
            セルを追加
          </button>
        </div>
      </div>
    );
  };

  // クエリ結果の表示
  const renderQueryResult = () => {
    if (isNotebookMode) {
      return renderNotebookWorkspace();
    }

    if (!queryResult || queryResult.length === 0) {
      return <div className="text-center p-4 text-gray-500">クエリ結果がありません</div>;
    }
    
    const dataToUse = editorSettings.dataDisplayMode === 'nested' && originalQueryResult ? originalQueryResult : queryResult;
    return (
      <ResultChartPanel
        rows={dataToUse}
        originalRows={originalQueryResult || null}
        chartTitle="クエリ結果でチャート作成"
      />
    );
  };
  
  // チャートの表示
  const renderChart = () => {
    if (!chartData) {
      // エラーメッセージがある場合はそれを表示
      if (error) {
        return (
          <div className="h-full w-full flex items-center justify-center">
            <div className="text-center p-6 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded max-w-2xl">
              <IoAlertCircleOutline size={40} className="mx-auto mb-4" />
              <p className="font-medium mb-2">グラフを作成できませんでした</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        );
      }
      return <div className="h-full w-full flex items-center justify-center text-gray-500">チャートデータがありません</div>;
    }

    if (chartData.metadata?.error) {
      return (
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-center p-6 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded max-w-2xl">
            <IoAlertCircleOutline size={40} className="mx-auto mb-4" />
            <p className="font-medium mb-2">グラフを作成できませんでした</p>
            <p className="text-sm">{chartData.metadata.error}</p>
          </div>
        </div>
      );
    }

    const defaultPlotlyConfig: Partial<PlotlyTypes.Config> = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      // 凡例のダブルクリックでシングルトレース表示/非表示を無効化（通常のクリック操作を優先）
      doubleClickDelay: 1000
    };

    const isDarkMode = document.documentElement.classList.contains('dark');

    if (chartSettings.type === 'treemap' || chartSettings.type === 'streamgraph' || chartSettings.type === 'venn') {
      const plotlyMeta = chartData.metadata?.plotly;

      if (!plotlyMeta) {
        return <div className="h-full w-full flex items-center justify-center text-gray-500">チャートデータが不足しています</div>;
      }

      const mergedLayout: Partial<PlotlyTypes.Layout> = { ...(plotlyMeta.layout || {}) };

      if (isDarkMode) {
        mergedLayout.paper_bgcolor = 'rgba(31, 41, 55, 0)';
        mergedLayout.plot_bgcolor = 'rgba(31, 41, 55, 0)';
        mergedLayout.font = {
          ...(mergedLayout.font || {}),
          color: '#e5e7eb'
        };
      }

      const mergedConfig: Partial<PlotlyTypes.Config> = {
        ...defaultPlotlyConfig,
        ...(plotlyMeta.config || {})
      };

      return (
        <div className="h-full w-full">
          <Plot
            data={(plotlyMeta.data as PlotlyTypes.Data[]) || []}
            layout={mergedLayout}
            config={mergedConfig}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      );
    }

    // Plotly用のデータ構造に変換
    const plotlyData: PlotlyTypes.Data[] = [];
    const plotlyLayout: Partial<PlotlyTypes.Layout> = {
      title: {
        text: `${chartSettings.xAxis} vs ${chartSettings.yAxis} ${chartSettings.type !== 'histogram' && chartSettings.aggregation !== 'none' ? `(${chartSettings.aggregation})` : ''}`,
        font: {
          size: 16
        }
      },
      xaxis: {
        title: {
          text: chartSettings.xAxis
        }
      },
      yaxis: {
        title: {
          text: chartSettings.yAxis
        }
      },
      hovermode: 'closest',
      legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: 1.02,
        xanchor: 'right',
        x: 1,
        // 凡例項目をクリックしたときのダブルクリック動作を無効化
        itemclick: 'toggle',
        itemdoubleclick: false
      },
      margin: { t: 50, r: 20, l: 50, b: 60 },
      autosize: true,
      // クリックモードを設定して凡例の操作を有効化
      clickmode: 'event+select'
    };
    
    const config: Partial<PlotlyTypes.Config> = { ...defaultPlotlyConfig };
    
    // グラフタイプに応じてデータを変換
    switch (chartSettings.type) {
      case 'bar':
        if (chartData.datasets) {
          // 常に凡例を表示する
          plotlyLayout.showlegend = true;
          
          chartData.datasets.forEach((dataset: any, index: number) => {
            // データセット名が正しく設定されているか確認し、必要に応じて修正
            if (dataset.label === undefined || dataset.label === 'undefined') {
              // カテゴリフィールドが指定されている場合は、そのフィールドの値を使用
              if (chartSettings.categoryField && dataset.category) {
                dataset.label = String(dataset.category);
              } else {
                dataset.label = `データセット ${index + 1}`;
              }
            }
            
            // 明示的にカテゴリ値を凡例名として使用（labelよりcategoryを優先）
            if (chartSettings.categoryField && dataset.category) {
              dataset.label = String(dataset.category);
            }
            
            // デバッグ出力
            console.log(`凡例名デバッグ - 棒グラフデータセット[${index}]:`, {
              ラベル: dataset.label,
              カテゴリフィールド: chartSettings.categoryField,
              カテゴリ値: dataset.category,
              元のデータサンプル: dataset.data.slice(0, 3)
            });
            
            const barData: PlotlyTypes.Data = {
              type: 'bar',
              x: chartData.labels,
              y: dataset.data,
              name: dataset.label, // ここで修正したラベルを使用
              marker: {
                color: dataset.backgroundColor,
                line: {
                  color: dataset.borderColor,
                  width: 1
                }
              },
              // 凡例クリックによる表示/非表示の動作を許可
              legendgroup: dataset.label,
              showlegend: true
            } as any;
            
            // デバッグ情報を出力
            console.log(`グラフデバッグ - 棒グラフデータ設定[${index}]:`, {
              タイプ: barData.type,
              モード: (barData as any).mode || '棒グラフはmodeプロパティを使用しない',
              データセット名: barData.name,
              データ数: dataset.data.length,
              データサンプル: dataset.data.slice(0, 5)
            });
            
            plotlyData.push(barData);
          });
        }
        break;
      
      case 'stacked-bar':
        if (chartData.datasets) {
          // 常に凡例を表示する
          plotlyLayout.showlegend = true;
          
          chartData.datasets.forEach((dataset: any, index: number) => {
            // データセット名が正しく設定されているか確認し、必要に応じて修正
            if (dataset.label === undefined || dataset.label === 'undefined') {
              // カテゴリフィールドが指定されている場合は、そのフィールドの値を使用
              if (chartSettings.categoryField && dataset.category) {
                dataset.label = String(dataset.category);
              } else {
                dataset.label = `データセット ${index + 1}`;
              }
            }
            
            // 明示的にカテゴリ値を凡例名として使用（labelよりcategoryを優先）
            if (chartSettings.categoryField && dataset.category) {
              dataset.label = String(dataset.category);
            }
            
            // デバッグ出力
            console.log(`凡例名デバッグ - 積立棒グラフデータセット[${index}]:`, {
              ラベル: dataset.label,
              カテゴリフィールド: chartSettings.categoryField,
              カテゴリ値: dataset.category,
              元のデータサンプル: dataset.data.slice(0, 3)
            });
            
            const stackedBarData: PlotlyTypes.Data = {
              type: 'bar',
              x: chartData.labels,
              y: dataset.data,
              name: dataset.label, // ここで修正したラベルを使用
              marker: {
                color: dataset.backgroundColor,
                line: {
                  color: dataset.borderColor,
                  width: 1
                }
              },
              // 凡例クリックによる表示/非表示の動作を許可
              legendgroup: dataset.label,
              showlegend: true
            } as any;
            
            // デバッグ情報を出力
            console.log(`グラフデバッグ - 積立棒グラフデータ設定[${index}]:`, {
              タイプ: stackedBarData.type,
              モード: (stackedBarData as any).mode || '棒グラフはmodeプロパティを使用しない',
              データセット名: stackedBarData.name,
              データ数: dataset.data.length,
              データサンプル: dataset.data.slice(0, 5)
            });
            
            plotlyData.push(stackedBarData);
          });
          plotlyLayout.barmode = 'stack';
        }
        break;
        
      case 'line':
        if (chartData.datasets) {
          // 常に凡例を表示する
          plotlyLayout.showlegend = true;
          
          chartData.datasets.forEach((dataset: any, index: number) => {
            // データセット名が正しく設定されているか確認し、必要に応じて修正
            if (dataset.label === undefined || dataset.label === 'undefined') {
              // カテゴリフィールドが指定されている場合は、そのフィールドの値を使用
              if (chartSettings.categoryField && dataset.category) {
                dataset.label = String(dataset.category);
              } else {
                dataset.label = `データセット ${index + 1}`;
              }
            }
            
            // 明示的にカテゴリ値を凡例名として使用（labelよりcategoryを優先）
            if (chartSettings.categoryField && dataset.category) {
              dataset.label = String(dataset.category);
            }
            
            // デバッグ出力
            console.log(`凡例名デバッグ - 折れ線グラフデータセット[${index}]:`, {
              ラベル: dataset.label,
              カテゴリフィールド: chartSettings.categoryField,
              カテゴリ値: dataset.category,
              元のデータサンプル: dataset.data.slice(0, 3)
            });
            
            const lineData: PlotlyTypes.Data = {
              type: 'scatter',
              mode: 'lines+markers',
              x: chartData.labels,
              y: dataset.data,
              name: dataset.label, // ここで修正したラベルを使用
              line: {
                color: dataset.borderColor,
                width: 2
              },
              marker: {
                color: dataset.backgroundColor,
                size: 6
              },
              // 凡例クリックによる表示/非表示の動作を許可
              legendgroup: dataset.label,
              showlegend: true
            } as any;
            
            // デバッグ情報を出力
            console.log(`グラフデバッグ - 折れ線グラフデータ設定[${index}]:`, {
              タイプ: lineData.type,
              モード: (lineData as any).mode,
              データセット名: lineData.name,
              データ数: dataset.data.length,
              データサンプル: dataset.data.slice(0, 5)
            });
            
            plotlyData.push(lineData);
          });
        }
        break;
        
      case 'pie':
        if (chartData.datasets && chartData.datasets.length > 0) {
          const dataset = chartData.datasets[0];
          plotlyData.push({
            type: 'pie',
            labels: chartData.labels,
            values: dataset.data,
            name: dataset.label,
            marker: {
              colors: Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor : [dataset.backgroundColor]
            },
            textinfo: 'label+percent',
            hoverinfo: 'all'
          });
        }
        break;
        
      case 'scatter':
        if (chartData.datasets) {
          // データセットがない場合、または空の場合
          if (chartData.datasets.length === 0) {
            // 元データから直接散布図データを作成してみる
            const originalData = chartSettings.dataSource === 'queryResult' ? queryResult : parsedData;
            
            console.log('カテゴリデバッグ - データセットなしの処理:', {
              データソース: chartSettings.dataSource,
              元データ件数: originalData?.length || 0,
              X軸: chartSettings.xAxis,
              Y軸: chartSettings.yAxis,
              カテゴリフィールド: chartSettings.categoryField || '未設定'
            });
            
            if (originalData && originalData.length > 0) {
              const firstItem = originalData[0];
              
              // 利用可能な値かチェック
              const hasXAxis = Object.keys(firstItem).some(key => 
                key.toLowerCase() === chartSettings.xAxis.toLowerCase());
              const hasYAxis = Object.keys(firstItem).some(key => 
                key.toLowerCase() === chartSettings.yAxis.toLowerCase());
                
              console.log('カテゴリデバッグ - フィールド存在確認:', {
                X軸存在: hasXAxis,
                Y軸存在: hasYAxis,
                利用可能フィールド: Object.keys(firstItem)
              });
              
              // フィールドが存在すれば、元データから直接散布図データを作成
              if (hasXAxis && hasYAxis) {
                
                // 新しいデータセットを作成
                const newDataset: any = {
                  label: 'データポイント',
                  data: [] as any[],
                  backgroundColor: 'rgba(75, 192, 192, 0.6)',
                  borderColor: 'rgba(75, 192, 192, 1)'
                };
                
                // X軸とY軸のフィールド名を取得（大文字小文字を考慮）
                const xAxisKey = Object.keys(firstItem).find(key => 
                  key.toLowerCase() === chartSettings.xAxis.toLowerCase()) || chartSettings.xAxis;
                const yAxisKey = Object.keys(firstItem).find(key => 
                  key.toLowerCase() === chartSettings.yAxis.toLowerCase()) || chartSettings.yAxis;
                
                // カテゴリフィールドのキーを取得
                let categoryKey = '';
                if (chartSettings.categoryField) {
                  const categoryField = chartSettings.categoryField;
                  categoryKey = Object.keys(firstItem).find(key => 
                    key.toLowerCase() === categoryField.toLowerCase()) || categoryField;
                }
                
                // 元データからデータポイントを作成
                originalData.forEach((item, idx) => {
                  let xValue = item[xAxisKey];
                  let yValue = item[yAxisKey];
                  const categoryValue = categoryKey ? String(item[categoryKey] || '') : '';
                  
                  // X軸がカテゴリフィールドと同じ場合は文字列として扱う
                  const isXAxisCategory = chartSettings.xAxis === chartSettings.categoryField;
                  if (isXAxisCategory) {
                    xValue = String(xValue || '');
                  }
                  // それ以外は数値変換を試みる
                  else if (typeof xValue === 'string') {
                    const parsedX = parseFloat(xValue);
                    if (!isNaN(parsedX)) {
                      xValue = parsedX;
                    }
                  }
                  
                  // Y値は常に数値変換を試みる
                  if (typeof yValue === 'string') {
                    const parsedY = parseFloat(yValue);
                    if (!isNaN(parsedY)) {
                      yValue = parsedY;
                    }
                  }
                  
                  // Y値が数値であることを確認
                  const isValidY = typeof yValue === 'number' && !isNaN(yValue);
                  
                  if (xValue !== undefined && isValidY) {
                    newDataset.data.push({
                      x: xValue,
                      y: yValue,
                      category: categoryValue || 'default'
                    });
                    
                    if (idx < 5) {
                      console.log(`カテゴリデバッグ - 元データからポイント作成[${idx}]:`, {
                        x: xValue,
                        y: yValue,
                        category: categoryValue,
                        X型: typeof xValue,
                        Y型: typeof yValue
                      });
                    }
                  }
                });
                
                // データセットに追加
                if (newDataset.data.length > 0) {
                  console.log('カテゴリデバッグ - 新しいデータセットを作成しました:', {
                    データポイント数: newDataset.data.length,
                    サンプル: newDataset.data.slice(0, 5)
                  });
                  chartData.datasets = [newDataset];
                }
              }
            }
          }
          
          chartData.datasets.forEach((dataset: any, index: number) => {
            // 単純な数値配列かどうかを最初に確認
            const isSimpleNumberArray = Array.isArray(dataset.data) && 
                                      dataset.data.length > 0 && 
                                      typeof dataset.data[0] === 'number';
            
            if (isSimpleNumberArray) {
              // 直接インデックス→x、値→yの変換を行う
              const newData = dataset.data.map((value: number, idx: number) => ({
                x: idx,
                y: value,
                category: dataset.label || ''
              }));
              
              console.log('カテゴリデバッグ - 数値配列から変換されたデータ:', {
                データ例: newData.slice(0, 3),
                カテゴリ例: newData.slice(0, 3).map((d: {category: string}) => d.category)
              });
              
              // 変換後のデータで置き換える
              dataset.data = newData;
            }
            
            // データが空でないか確認
            if (!dataset.data || dataset.data.length === 0) {
              return;
            }
            
            // カテゴリフィールドが設定されていて、すべてのデータポイントのcategoryが'value'の場合に修正
            if (chartSettings.categoryField && 
                dataset.data.length > 0 && 
                dataset.data[0].category === 'value') {
              console.log('カテゴリデバッグ - カテゴリ値の修正:', {
                現在のカテゴリ: dataset.data[0].category,
                指定されたカテゴリフィールド: chartSettings.categoryField,
                修正方法: 'データソースから適切なカテゴリ値を取得します'
              });
              
              // 元データソースからカテゴリ値を取得して設定
              const originalData = chartSettings.dataSource === 'queryResult' ? queryResult : parsedData;
              
              if (originalData && originalData.length > 0) {
                // 適切なカテゴリ値をマッピング
                const categoryValues = originalData.map(item => item[chartSettings.categoryField || '']);
                
                // データポイントに適切なカテゴリ値を設定
                dataset.data.forEach((point: any, idx: number) => {
                  if (idx < originalData.length) {
                    const categoryValue = categoryValues[idx];
                    if (categoryValue !== undefined) {
                      point.category = String(categoryValue);
                      if (idx < 5) {
                        console.log(`カテゴリデバッグ - カテゴリ値修正[${idx}]:`, {
                          元の値: 'value',
                          新しい値: point.category
                        });
                      }
                    }
                  }
                });
              }
            }
            
            // x, y データの抽出（データポイントの形式を確認）
            let xValues: number[] = [];
            let yValues: number[] = [];
            let textValues: string[] = [];
            
            // データ形式をチェック
            const firstPoint = dataset.data[0];
            console.log('カテゴリデバッグ - 最初のデータポイント:', {
              x: firstPoint.x,
              y: firstPoint.y,
              category: firstPoint.category,
              categoryType: typeof firstPoint.category
            });
            
            if (firstPoint && typeof firstPoint.x !== 'undefined' && typeof firstPoint.y !== 'undefined') {
              // {x, y} 形式のオブジェクト
              
              // カテゴリリストの取得
              const uniqueCategories = [...new Set(dataset.data
                .filter((p: any) => p && p.category !== undefined)
                .map((p: any) => p.category))];
                
              console.log('カテゴリデバッグ - データセット内のカテゴリ:', {
                データセット名: dataset.label,
                ユニークカテゴリ: uniqueCategories,
                カテゴリ数: uniqueCategories.length
              });
              console.log('カテゴリデバッグ - データセット内のカテゴリ:', {
                データセット名: dataset.label,
                ユニークカテゴリ: uniqueCategories,
                カテゴリ数: uniqueCategories.length
              });
              
              // データ変換時にログ出力して確認
              dataset.data.forEach((point: any, idx: number) => {
                if (idx < 5) {
                  console.log(`カテゴリデバッグ - データポイント[${idx}]:`, {
                    x: point.x,
                    y: point.y,
                    category: point.category,
                    categoryType: typeof point.category
                  });
                }
                
                // 数値に変換して追加
                let x, y;
                
                // X軸がカテゴリフィールドと同じかチェック
                const isXAxisCategory = chartSettings.xAxis === chartSettings.categoryField;
                
                // X値の変換（カテゴリの場合は文字列として保持）
                if (isXAxisCategory && point.x !== undefined && point.x !== null) {
                  x = String(point.x);
                } else if (typeof point.x === 'number' && !isNaN(point.x)) {
                  x = point.x;
                } else if (point.x !== undefined && point.x !== null) {
                  const xStr = typeof point.x === 'string' ? point.x.trim() : String(point.x).trim();
                  x = parseFloat(xStr);
                } else {
                  x = NaN;
                }
                
                // Y値の変換（null/undefined/NaNチェック）
                if (typeof point.y === 'number' && !isNaN(point.y)) {
                  y = point.y;
                } else if (point.y !== undefined && point.y !== null) {
                  const yStr = typeof point.y === 'string' ? point.y.trim() : String(point.y).trim();
                  y = parseFloat(yStr);
                  
                  // point.raw に元の値が保存されている可能性がある
                  if (isNaN(y) && point.raw && typeof point.raw.y === 'number' && !isNaN(point.raw.y)) {
                    y = point.raw.y;
                  }
                } else {
                  // point.raw に元の値が保存されている可能性がある
                  if (point.raw && typeof point.raw.y === 'number' && !isNaN(point.raw.y)) {
                    y = point.raw.y;
                  } else {
                    y = NaN;
                  }
                }
                
                if (!isNaN(x) && !isNaN(y)) {
                  xValues.push(x);
                  yValues.push(y);
                  
                  // カテゴリ情報を確実に文字列として取得
                  let categoryText = '';
                  if (point.category !== undefined) {
                    categoryText = String(point.category);
                    console.log(`カテゴリデバッグ - ポイント[${idx}]のカテゴリ設定:`, {
                      元の値: point.category,
                      型: typeof point.category,
                      文字列化後: categoryText
                    });
                  } else {
                    categoryText = dataset.label || '';
                  }
                  
                  textValues.push(categoryText);
                  if (idx < 5) {
                  }
                }
              });
              
              // 変換後のxValues, yValuesを検証（最初の数点）
              console.log('カテゴリデバッグ - 変換後のデータ:', {
                X値: xValues.slice(0, 5),
                Y値: yValues.slice(0, 5),
                カテゴリ: textValues.slice(0, 5)
              });
              
              // 重要: Y値が全て0かチェック
              const allYZero = yValues.every((y: number) => y === 0);
              if (allYZero && yValues.length > 0) {
                
                // グローバルのparsedDataまたはqueryResultを使用して修正
                const originalData = chartSettings.dataSource === 'queryResult' ? queryResult : parsedData;
                
                if (originalData && originalData.length > 0) {
                  try {
                    // 元データから直接Y値を抽出
                    const directYValues = originalData.map((item: any) => {
                      // 正確なフィールド名を取得
                      const keys = Object.keys(item);
                      const yKey = keys.find(k => k.toLowerCase() === chartSettings.yAxis.toLowerCase()) || chartSettings.yAxis;
                      
                      // Y値を取得
                      const yRaw = item[yKey];
                      return typeof yRaw === 'number' ? yRaw : parseFloat(String(yRaw));
                    }).filter((y: number) => !isNaN(y));
                    
                    console.log('カテゴリデバッグ - 元データからのY値抽出結果:', {
                      抽出件数: directYValues.length,
                      サンプル: directYValues.slice(0, 5)
                    });
                    
                    // 有効なY値があれば、それを使用
                    if (directYValues.some((y: number) => y !== 0)) {
                      // X値と組み合わせて新しいデータポイントを作成
                      const directDataPoints = xValues.map((x, idx) => {
                        return idx < directYValues.length ? { x, y: directYValues[idx] } : null;
                      }).filter((p: any) => p !== null && !isNaN(p.y));
                      
                      console.log('カテゴリデバッグ - 新しいデータポイント:', {
                        作成件数: directDataPoints.length,
                        サンプル: directDataPoints.slice(0, 5)
                      });
                      
                      // データを置き換え
                      if (directDataPoints.length > 0) {
                        dataset.data = directDataPoints;
                        // 再度データを抽出
                        xValues = directDataPoints.map((p: any) => p.x);
                        yValues = directDataPoints.map((p: any) => p.y);
                        textValues = directDataPoints.map(() => '');
                      }
                    }
                  } catch (err) {
                    console.error('カテゴリデバッグ - データ修正に失敗:', err);
                  }
                }
              }
            } else if (Array.isArray(dataset.data) && dataset.data.length > 0 && typeof dataset.data[0] === 'number') {
              // 単純な数値配列の場合、インデックスをX軸、値をY軸として変換
              console.log('Y値デバッグ - 単純な数値配列を散布図データに変換します:', {
                データ長: dataset.data.length,
                サンプル: dataset.data.slice(0, 5)
              });
              
              for (let i = 0; i < dataset.data.length; i++) {
                const yValue = dataset.data[i];
                if (typeof yValue === 'number' && !isNaN(yValue)) {
                  xValues.push(i); // インデックスをX値として使用
                  yValues.push(yValue);
                  textValues.push(dataset.label || '');
                  
                  if (i < 5) {
                  }
                }
              }
              
              // 変換結果を表示
              if (xValues.length > 0) {
                console.log('Y値デバッグ - 数値配列からの変換結果:', {
                  変換後のX値: xValues.slice(0, 5),
                  変換後のY値: yValues.slice(0, 5),
                  データポイント数: xValues.length
                });
              }
            } else {
              // 別の形式の場合（配列など）、適切に処理
              console.warn('散布図データが予期しない形式です。データを変換します。');
              for (let i = 0; i < dataset.data.length; i++) {
                if (Array.isArray(dataset.data[i]) && dataset.data[i].length >= 2) {
                  const x = typeof dataset.data[i][0] === 'number' ? dataset.data[i][0] : parseFloat(String(dataset.data[i][0]));
                  const y = typeof dataset.data[i][1] === 'number' ? dataset.data[i][1] : parseFloat(String(dataset.data[i][1]));
                  
                  if (!isNaN(x) && !isNaN(y)) {
                    xValues.push(x);
                    yValues.push(y);
                    textValues.push('');
                  } else if (i < 5) {
                    console.warn(`Y値デバッグ - 変換形式2: 無効なデータポイント[${i}]: x=${x}, y=${y}`);
                  }
                }
              }
            }
            
              // データの整合性チェック
              if (xValues.length === 0 || yValues.length === 0) {
                return;
              }
              
              // Y値チェック
              const zeroYCount = yValues.filter((y: number) => y === 0).length;
              if (zeroYCount === yValues.length && yValues.length > 0) {
              }
              
              // Plotlyのデータ構造に変換
              console.log('カテゴリデバッグ - Plotlyへのデータ変換前:', {
                X値サンプル: xValues.slice(0, 5),
                Y値サンプル: yValues.slice(0, 5),
                カテゴリサンプル: textValues.slice(0, 5)
              });
            
              // 最終的なカテゴリ情報の確認
              console.log('カテゴリデバッグ - 最終的なカテゴリ情報:', {
                カテゴリ配列: textValues.slice(0, 10),
                ユニーク値: [...new Set(textValues)]
              });
              
              // 実際に値をチェックしてからデータに追加する
              // X軸がカテゴリの場合は数値変換をスキップ
              const isXAxisCategory = chartSettings.xAxis === chartSettings.categoryField;
              const finalXValues = isXAxisCategory 
                ? xValues.filter(v => v !== null) 
                : xValues.filter(v => v !== null && !isNaN(v));
              const finalYValues = yValues.filter(v => v !== null && !isNaN(v));
              
              console.log('カテゴリデバッグ - フィルタ後の最終データ:', {
                X軸はカテゴリ: isXAxisCategory,
                X値サンプル: finalXValues.slice(0, 5),
                Y値サンプル: finalYValues.slice(0, 5),
                データポイント数: finalXValues.length
              });
              
              // カテゴリ値に基づいた色分け機能
              let colorMap: { [key: string]: string } = {};
              let colorScale: string[] = [];
              
              // カテゴリが複数ある場合は色分けする
              const uniqueCategories = [...new Set(textValues)];
              if (uniqueCategories.length > 1 && chartSettings.categoryField) {
                console.log('カテゴリデバッグ - 色分け機能を有効化:', {
                  ユニークカテゴリ数: uniqueCategories.length,
                  カテゴリリスト: uniqueCategories
                });
                
                // カラーパレットの定義
                const colorPalette = [
                  'rgba(54, 162, 235, 1)', // 青
                  'rgba(255, 99, 132, 1)', // 赤
                  'rgba(75, 192, 192, 1)', // ティール
                  'rgba(255, 206, 86, 1)', // 黄
                  'rgba(153, 102, 255, 1)', // 紫
                  'rgba(255, 159, 64, 1)', // オレンジ
                  'rgba(102, 187, 106, 1)', // 緑
                  'rgba(238, 130, 238, 1)', // バイオレット
                  'rgba(150, 150, 150, 1)' // グレー
                ];
                
                // 各カテゴリに色を割り当て
                uniqueCategories.forEach((category, idx) => {
                  const colorIdx = idx % colorPalette.length;
                  colorMap[category] = colorPalette[colorIdx];
                });
                
                console.log('カテゴリデバッグ - カラーマッピング:', {
                  カラーマップ: colorMap,
                  カテゴリサンプル: textValues.slice(0, 5)
                });
                
                // カテゴリごとにデータポイントをグループ化
                const categoryGroups: { [key: string]: { x: any[], y: any[] } } = {};
                
                // 初期化
                uniqueCategories.forEach(category => {
                  categoryGroups[category] = { x: [], y: [] };
                });
                
                // データポイントを各カテゴリグループに振り分け
                for (let i = 0; i < finalXValues.length; i++) {
                  const category = textValues[i];
                  if (categoryGroups[category]) {
                    categoryGroups[category].x.push(finalXValues[i]);
                    categoryGroups[category].y.push(finalYValues[i]);
                  }
                }
                
                // 各カテゴリごとに別々のトレースを作成
                uniqueCategories.forEach((category, idx) => {
                  const colorIdx = idx % colorPalette.length;
                  const groupData = categoryGroups[category];
                  
                  if (groupData.x.length > 0) {
                    plotlyData.push({
                      type: 'scatter',
                      mode: 'markers',
                      x: groupData.x,
                      y: groupData.y,
                      name: category,
                      marker: {
                        color: colorPalette[colorIdx],
                        size: 8,
                        line: {
                          color: 'rgba(255, 255, 255, 0.8)',
                          width: 1
                        }
                      },
                      hoverinfo: 'x+y+text',
                      hovertemplate: `${chartSettings.xAxis}: %{x}<br>${chartSettings.yAxis}: %{y}<br>${chartSettings.categoryField}: ${category}<extra>%{name}</extra>`
                    });
                  }
                });
                
                console.log('カテゴリデバッグ - カテゴリごとのトレース作成完了:', {
                  カテゴリ数: uniqueCategories.length,
                  トレース数: plotlyData.length
                });
              } else {
                // カテゴリが1種類または未設定の場合は単一色で表示
                plotlyData.push({
                  type: 'scatter',
                  mode: 'markers',
                  x: finalXValues,
                  y: finalYValues,
                  name: dataset.label || '散布図データ',
                  marker: {
                    color: dataset.backgroundColor || 'rgba(75, 192, 192, 0.6)',
                    size: 8,
                    line: {
                      color: dataset.borderColor || 'rgba(75, 192, 192, 1)',
                      width: 1
                    }
                  },
                  hoverinfo: 'x+y+text',
                  hovertemplate: `${chartSettings.xAxis}: %{x}<br>${chartSettings.yAxis}: %{y}<br>${chartSettings.categoryField || 'カテゴリ'}: %{text}<extra>%{name}</extra>`,
                  text: textValues,
                  textposition: 'none' // テキストを表示しない
                });
              }
            
            // データ変換が完了したことを確認
            console.log('カテゴリデバッグ - Plotlyデータ変換完了:', {
              データセット: index,
              データポイント数: finalXValues.length
            });
          });
        } else {
          
          // データがない場合はダミーデータを表示（空のプロット）
          plotlyData.push({
            type: 'scatter',
            mode: 'markers',
            x: [],
            y: [],
            name: 'データなし',
            marker: {
              color: 'rgba(200, 200, 200, 0.5)',
              size: 8
            }
          });
        }
        break;
        
      case 'histogram':
        if (chartData.datasets && chartData.datasets.length > 0) {
          // カテゴリに基づいて複数のデータセットがある場合
          const hasMultipleDatasets = chartData.datasets.length > 1;
          
          // 各データセットをPlotlyデータに変換
          chartData.datasets.forEach((dataset: any, index: number) => {
            let histogramData: any = {
              type: 'histogram',
              x: dataset.data,
              name: dataset.label || `グループ ${index + 1}`,
              marker: {
                color: dataset.backgroundColor,
                line: {
                  color: dataset.borderColor,
                  width: 1
                }
              }
            };
            
            // 複数のデータセットがある場合、opacity設定とカテゴリ名を設定
            if (hasMultipleDatasets) {
              histogramData.opacity = 0.7;
              histogramData.histfunc = 'count';
              
              // データセットにカテゴリ情報がある場合、名前として使用
              if (dataset.category) {
                histogramData.name = dataset.category;
              }
              
              // 凡例クリックによる表示/非表示の動作を許可
              histogramData.legendgroup = histogramData.name;
              histogramData.showlegend = true;
            }
            
            plotlyData.push(histogramData);
          });
          
          // 複数のデータセットがある場合、オーバーレイモードを設定
          if (hasMultipleDatasets) {
            plotlyLayout.barmode = 'overlay';
            
            // 凡例を表示
            plotlyLayout.showlegend = true;
            plotlyLayout.legend = {
              title: { text: chartSettings.categoryField || 'カテゴリ' },
              x: 1,
              y: 1,
              bgcolor: 'rgba(255, 255, 255, 0.5)',
              bordercolor: 'rgba(0, 0, 0, 0.2)',
              borderwidth: 1,
              font: { size: 12 }
            };
          }
        }
        break;
        
      case 'regression':
        // 散布図データ
        if (chartData.datasets && chartData.datasets.length > 0) {
          const scatterDataset = chartData.datasets[0];
          
          // データが存在することを確認
          if (scatterDataset.data && scatterDataset.data.length > 0) {
            // x, y データの抽出（データポイントの形式を確認）
            let xValues = [];
            let yValues = [];
            
            let textValues: string[] = [];
            
            if (typeof scatterDataset.data[0].x !== 'undefined' && typeof scatterDataset.data[0].y !== 'undefined') {
              // {x, y} 形式のオブジェクト
              xValues = scatterDataset.data.map((point: any) => point.x);
              yValues = scatterDataset.data.map((point: any) => point.y);
              
              // カテゴリ情報を取得
              if (chartSettings.categoryField) {
                textValues = scatterDataset.data.map((point: any) => point.category || '');
              }
            } else {
              // 別の形式の場合、適切に処理
              console.warn('回帰データが予期しない形式です。データを変換します。');
              for (let i = 0; i < scatterDataset.data.length; i++) {
                if (Array.isArray(scatterDataset.data[i]) && scatterDataset.data[i].length >= 2) {
                  xValues.push(scatterDataset.data[i][0]);
                  yValues.push(scatterDataset.data[i][1]);
                  textValues.push('');
                }
              }
            }
            
            // カテゴリ値に基づいた色分け機能
            if (chartSettings.categoryField && textValues.length > 0) {
              // カテゴリが複数ある場合は色分けする
              const uniqueCategories = [...new Set(textValues)];
              let colorMap: { [key: string]: string } = {};
              let colorScale: string[] = [];
              
              if (uniqueCategories.length > 1) {
                console.log('回帰デバッグ - 色分け機能を有効化:', {
                  ユニークカテゴリ数: uniqueCategories.length,
                  カテゴリリスト: uniqueCategories
                });
                
                // カラーパレットの定義
                const colorPalette = [
                  'rgba(54, 162, 235, 1)', // 青
                  'rgba(255, 99, 132, 1)', // 赤
                  'rgba(75, 192, 192, 1)', // ティール
                  'rgba(255, 206, 86, 1)', // 黄
                  'rgba(153, 102, 255, 1)', // 紫
                  'rgba(255, 159, 64, 1)', // オレンジ
                  'rgba(102, 187, 106, 1)', // 緑
                  'rgba(238, 130, 238, 1)', // バイオレット
                  'rgba(150, 150, 150, 1)' // グレー
                ];
                
                // 各カテゴリに色を割り当て
                uniqueCategories.forEach((category, idx) => {
                  const colorIdx = idx % colorPalette.length;
                  colorMap[category] = colorPalette[colorIdx];
                });
                
                // テキスト値に基づいて色の配列を作成
                colorScale = textValues.map(category => colorMap[category] || colorPalette[0]);
                
                // 色分けありのマーカー設定
                plotlyData.push({
                  type: 'scatter',
                  mode: 'markers',
                  x: xValues,
                  y: yValues,
                  name: 'データポイント',
                  marker: {
                    color: colorScale,
                    size: 8,
                    line: {
                      color: 'rgba(255, 255, 255, 0.8)',
                      width: 1
                    }
                  },
                  hoverinfo: 'x+y+text',
                  hovertemplate: `${chartSettings.xAxis}: %{x}<br>${chartSettings.yAxis}: %{y}<br>${chartSettings.categoryField}: %{text}<extra>データポイント</extra>`,
                  text: textValues
                });
              } else {
                // カテゴリが1種類の場合は単一色で表示
                plotlyData.push({
                  type: 'scatter',
                  mode: 'markers',
                  x: xValues,
                  y: yValues,
                  name: 'データポイント',
                  marker: {
                    color: scatterDataset.backgroundColor,
                    size: 8
                  }
                });
              }
            } else {
              // カテゴリフィールドが指定されていない場合は従来通り
              plotlyData.push({
                type: 'scatter',
                mode: 'markers',
                x: xValues,
                y: yValues,
                name: 'データポイント',
                marker: {
                  color: scatterDataset.backgroundColor,
                  size: 8
                }
              });
            }
          }
          
          // 回帰線
          if (chartData.datasets.length > 1) {
            const regressionDataset = chartData.datasets[1];
            
            // データが存在することを確認
            if (regressionDataset.data && regressionDataset.data.length > 0) {
              // データポイントからカテゴリ情報を抽出
              let categoryValues: string[] = [];
              if (chartSettings.categoryField && scatterDataset.data && scatterDataset.data.length > 0) {
                categoryValues = scatterDataset.data.map((point: any) => String(point.category || ''));
              }
              
              // カテゴリごとに分類
              if (chartSettings.categoryField && categoryValues.length > 0) {
                const uniqueCategories = [...new Set(categoryValues)];
                
                if (uniqueCategories.length > 1) {
                  // カラーパレットの定義（散布図と同じもの）
                  const colorPalette = [
                    'rgba(54, 162, 235, 1)', // 青
                    'rgba(255, 99, 132, 1)', // 赤
                    'rgba(75, 192, 192, 1)', // ティール
                    'rgba(255, 206, 86, 1)', // 黄
                    'rgba(153, 102, 255, 1)', // 紫
                    'rgba(255, 159, 64, 1)', // オレンジ
                    'rgba(102, 187, 106, 1)', // 緑
                    'rgba(238, 130, 238, 1)', // バイオレット
                    'rgba(150, 150, 150, 1)' // グレー
                  ];
                  
                  // 各カテゴリに色を割り当て
                  let colorMap: { [key: string]: string } = {};
                  uniqueCategories.forEach((category, idx) => {
                    const colorIdx = idx % colorPalette.length;
                    colorMap[String(category)] = colorPalette[colorIdx];
                  });
                  
                  // カテゴリ別にデータポイントをグループ化
                  const categoryGroups: {[key: string]: {x: number[], y: number[]}} = {};
                  
                  // 初期化
                  uniqueCategories.forEach(category => {
                    categoryGroups[String(category)] = {x: [], y: []};
                  });
                  
                  // 各カテゴリのデータポイントを収集
                  scatterDataset.data.forEach((point: any, idx: number) => {
                    const categoryKey = String(point.category || '');
                    if (categoryGroups[categoryKey]) {
                      categoryGroups[categoryKey].x.push(point.x);
                      categoryGroups[categoryKey].y.push(point.y);
                    }
                  });
                  
                  // カテゴリ別に線形回帰を計算して表示
                  uniqueCategories.forEach(category => {
                    const categoryKey = String(category);
                    const groupData = categoryGroups[categoryKey];
                    if (groupData.x.length > 1) { // 少なくとも2点必要
                      // 単純な線形回帰計算
                      const { slope, intercept } = calculateLinearRegression(groupData.x, groupData.y);
                      
                      // X値の範囲を取得
                      const minX = Math.min(...groupData.x);
                      const maxX = Math.max(...groupData.x);
                      
                      // 回帰線の両端の点を計算
                      const lineX = [minX, maxX];
                      const lineY = lineX.map(x => slope * x + intercept);
                      
                      // 回帰線をプロット
                      plotlyData.push({
                        type: 'scatter',
                        mode: 'lines',
                        x: lineX,
                        y: lineY,
                        name: `回帰線 - ${category}`,
                        line: {
                          color: colorMap[categoryKey],
                          width: 2
                        }
                      });
                    }
                  });
                  
                  console.log('回帰デバッグ - カテゴリ別回帰線:', {
                    カテゴリ数: uniqueCategories.length,
                    カラーマップ: colorMap
                  });
                } else {
                  // カテゴリが1種類の場合は通常の回帰線
                  addDefaultRegressionLine(regressionDataset);
                }
              } else {
                // カテゴリなしの場合は通常の回帰線
                addDefaultRegressionLine(regressionDataset);
              }
            }
          }
          
          // 通常の回帰線を追加する関数
          function addDefaultRegressionLine(regressionDataset: any) {
            // x, y データの抽出
            let xValues = [];
            let yValues = [];
            
            if (typeof regressionDataset.data[0].x !== 'undefined' && typeof regressionDataset.data[0].y !== 'undefined') {
              xValues = regressionDataset.data.map((point: any) => point.x);
              yValues = regressionDataset.data.map((point: any) => point.y);
            } else {
              // 別の形式の場合、適切に処理
              for (let i = 0; i < regressionDataset.data.length; i++) {
                if (Array.isArray(regressionDataset.data[i]) && regressionDataset.data[i].length >= 2) {
                  xValues.push(regressionDataset.data[i][0]);
                  yValues.push(regressionDataset.data[i][1]);
                }
              }
            }
            
            plotlyData.push({
              type: 'scatter',
              mode: 'lines',
              x: xValues,
              y: yValues,
              name: '回帰線',
              line: {
                color: regressionDataset.borderColor,
                width: 2
              }
            });
          }
          
          // 線形回帰を計算する関数
          function calculateLinearRegression(xValues: number[], yValues: number[]) {
            const n = xValues.length;
            if (n <= 1) return { slope: 0, intercept: 0 };
            
            let sumX = 0;
            let sumY = 0;
            let sumXY = 0;
            let sumXX = 0;
            
            for (let i = 0; i < n; i++) {
              sumX += xValues[i];
              sumY += yValues[i];
              sumXY += xValues[i] * yValues[i];
              sumXX += xValues[i] * xValues[i];
            }
            
            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;
            
            return { slope, intercept };
          }
        }
        break;
        
      default:
        break;
    }
    
            // データの整合性チェック - Y値が全て0の場合は警告
            if (plotlyData.length > 0) {
              let hasNonZeroY = false;
              let zeroCount = 0;
              let totalCount = 0;
              
              for (const dataset of plotlyData) {
                const yValues = (dataset as any).y;
                if (yValues && Array.isArray(yValues)) {
                  totalCount += yValues.length;
                  const zeroYValues = yValues.filter((val: number) => val === 0);
                  zeroCount += zeroYValues.length;
                  
                  if (yValues.some((val: number) => val !== 0)) {
                    hasNonZeroY = true;
                  }
                  
                  // 全てのY値をログに出力（最初の10件のみ）
                  console.log('最終的なY値チェック:', {
                    Y値サンプル: yValues.slice(0, 10),
                    全てが0か: yValues.every((val: number) => val === 0),
                    ゼロ値の数: zeroYValues.length,
                    非ゼロ値の数: yValues.length - zeroYValues.length,
                    最大値: Math.max(...yValues),
                    最小値: Math.min(...yValues)
                  });
                }
              }
              
              
              if (!hasNonZeroY && totalCount > 0) {
                console.warn('Y値デバッグ - 最終警告: すべてのY値が0です。データ変換に問題がある可能性があります。');
              }
            }
    
    // レイアウトの調整（凡例の追加）
    if ((chartSettings.categoryField && (chartSettings.type === 'scatter' || chartSettings.type === 'regression' || 
        chartSettings.type === 'bar' || chartSettings.type === 'line' || chartSettings.type === 'stacked-bar')) || 
        (chartSettings.type === 'histogram' && chartData.datasets && chartData.datasets.length > 1) ||
        // 棒グラフ、折れ線グラフ、積み上げ棒グラフで複数のデータセットがある場合
        ((chartSettings.type === 'bar' || chartSettings.type === 'line' || chartSettings.type === 'stacked-bar') && 
         chartData.datasets && chartData.datasets.length > 1)) {
      // カテゴリフィールドが指定されている場合、または複数のデータセットがある場合、凡例を表示
      plotlyLayout.showlegend = true;
      
      // データセットの数またはカテゴリの数に基づいて凡例を設定
      let legendLabels: string[] = [];
      
      if (chartSettings.categoryField && (chartSettings.type === 'scatter' || chartSettings.type === 'regression')) {
        // カテゴリフィールドが設定されている散布図や回帰グラフの場合
        const categoryValues = chartData.datasets?.flatMap((dataset: any) => 
          dataset.data?.map((point: any) => String(point.category || '')) || []
        ) || [];
        
        // 重複を除去して文字列の配列に変換
        legendLabels = Array.from(new Set(categoryValues)).map(val => String(val));
      } else if (chartData.datasets) {
        // それ以外の場合はデータセットのラベルを使用
        legendLabels = chartData.datasets.map((dataset: any) => String(dataset.label || ''));
      }
      
      // 複数の凡例項目がある場合のみ凡例を表示
      if (legendLabels.length > 1) {
        console.log('凡例デバッグ - 凡例を表示します:', {
          凡例項目一覧: legendLabels,
          グラフタイプ: chartSettings.type
        });
        
        // 凡例の位置とスタイルを調整
        plotlyLayout.legend = {
          x: 1,
          y: 1,
          bgcolor: 'rgba(255, 255, 255, 0.5)',
          bordercolor: 'rgba(0, 0, 0, 0.2)',
          borderwidth: 1,
          font: { size: 12 },
          title: { text: chartSettings.categoryField || 'データセット' }
        };
        
        // 凡例クリックによるトレース表示/非表示を有効化
        plotlyLayout.clickmode = 'event+select';
      }
    }

    // ダークモード対応
    if (isDarkMode) {
      plotlyLayout.paper_bgcolor = 'rgba(31, 41, 55, 0)';  // bg-gray-800 with transparency
      plotlyLayout.plot_bgcolor = 'rgba(31, 41, 55, 0)';   // bg-gray-800 with transparency
      plotlyLayout.font = {
        color: '#e5e7eb'  // text-gray-200
      };
      // X軸がカテゴリの場合は明示的にタイプを指定
      const isXAxisCategory = chartSettings.xAxis === chartSettings.categoryField;
      plotlyLayout.xaxis = {
        ...plotlyLayout.xaxis,
        type: isXAxisCategory ? 'category' : undefined,
        gridcolor: 'rgba(75, 85, 99, 0.4)',  // gray-600 with transparency
        linecolor: 'rgba(75, 85, 99, 0.4)'   // gray-600 with transparency
      };
      plotlyLayout.yaxis = {
        ...plotlyLayout.yaxis,
        gridcolor: 'rgba(75, 85, 99, 0.4)',  // gray-600 with transparency
        linecolor: 'rgba(75, 85, 99, 0.4)'   // gray-600 with transparency
      };
    }
    
    
    return (
      <div className="h-full w-full">
        <Plot
          data={plotlyData}
          layout={plotlyLayout}
          config={config}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    );
  };
  
  // ローディング表示（グラフタブでない場合のみ全体表示）
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p>データを解析中...</p>
      </div>
    );
  }
  
  // エラー表示（グラフタブでない場合のみ全体表示）
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-red-500">
        <IoAlertCircleOutline size={48} className="mb-4" />
        <p className="text-center">{error}</p>
      </div>
    );
  }
  
  // データがない場合
  if (!parsedData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-gray-500">
        <p>分析するデータがありません</p>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* タブナビゲーション */}
      <div className="flex border-b border-gray-300 dark:border-gray-700">
        <button
          className={`px-4 py-2 ${
            activeTab === 'query'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('query')}
        >
          <IoCodeSlash className="inline mr-1" size={16} />
          クエリ
        </button>
        <button
          className={`px-4 py-2 ${
            activeTab === 'stats'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('stats')}
        >
          <IoStatsChartOutline className="inline mr-1" size={16} />
          統計情報
        </button>
        <button
          className={`px-4 py-2 ${
            activeTab === 'relationship'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('relationship')}
        >
          <div className="flex items-center">
            <IoGitNetwork className="mr-1" size={18} />
            関係性
          </div>
        </button>
        <div className="flex-1"></div>
        <div className="flex items-center gap-2 pr-2">
          <button
            className="px-3 py-2 bg-blue-600 text-white rounded flex items-center gap-2 text-sm shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleGenerateInsights}
            disabled={insightLoading}
          >
            {insightLoading ? (
              <>
                <span className="inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                生成中...
              </>
            ) : (
              <>
                <IoSparkles size={16} />
                インサイト生成
              </>
            )}
          </button>
          <div ref={saveMenuRef} className="relative">
            <button
              className={`px-3 py-2 rounded flex items-center gap-2 text-sm shadow-sm transition-colors ${
                insightPreview && !insightLoading
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
              onClick={() => insightPreview && !insightLoading && setIsSaveMenuOpen((prev) => !prev)}
              disabled={!insightPreview || insightLoading}
              title={insightPreview ? '生成したインサイトを保存' : 'インサイト生成後に利用できます'}
            >
              <IoSave size={16} />
              Markdown/Word として保存
            </button>
            {isSaveMenuOpen && insightPreview && (
              <div className="absolute right-0 mt-2 w-48 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-20">
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    handleSaveMarkdown();
                  }}
                >
                  <IoDownloadOutline size={16} /> Markdown (.md)
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    void handleSaveWord();
                  }}
                >
                  <IoDownloadOutline size={16} /> Word (.docx)
                </button>
              </div>
            )}
          </div>
          <button
            className="px-3 py-2 flex items-center text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            onClick={toggleDisplayMode}
            title={editorSettings.dataDisplayMode === 'flat' ? "階層表示に切替" : "フラット表示に切替"}
          >
            <IoLayersOutline className="mr-1" size={18} />
            <span className="text-sm">
              {editorSettings.dataDisplayMode === 'flat' ? '階層表示' : 'フラット表示'}
            </span>
          </button>
        </div>
      </div>
      
      {isInsightPanelOpen && (
        <div className="border-b border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-900/10">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
              <IoSparkles size={16} />
              <span>インサイトプレビュー</span>
              {insightLoading && (
                <span className="flex items-center gap-1 text-xs">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-ping"></span>
                  生成中...
                </span>
              )}
            </div>
            <button
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => setIsInsightPanelOpen(false)}
            >
              閉じる
            </button>
          </div>
          <div className="px-4 pb-4">
            {insightLoading && !insightPreview ? (
              <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500"></div>
                インサイトを生成しています...
              </div>
            ) : insightPreview ? (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">要点</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                    {insightPreview.bulletSummary.map((item, index) => (
                      <li key={`insight-bullet-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Markdownプレビュー</h4>
                  <div className="border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 p-3 max-h-72 overflow-auto">
                    <ReactMarkdown
                      className="text-sm leading-relaxed text-gray-800 dark:text-gray-100"
                      remarkPlugins={[remarkGfm]}
                    >
                      {insightPreview.markdown}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <details className="group border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900">
                    <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                      Word出力構造
                    </summary>
                    <div className="px-4 pb-4 pt-2 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                      {insightPreview.word.sections.map((section, index) => (
                        <div
                          key={`${section.heading}-${index}`}
                          className="border border-gray-200 dark:border-gray-700 rounded p-3 bg-gray-50 dark:bg-gray-800/60"
                        >
                          <div className="font-semibold text-gray-800 dark:text-gray-100">{section.heading}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            レベル: {section.level ?? 2} / 段落: {section.paragraphs?.length ?? 0} / 箇条書き: {section.bullets?.length ?? 0}
                            {section.table ? ` / 表: ${section.table.headers.length}列 × ${section.table.rows.length}行` : ''}
                          </div>
                        </div>
                      ))}
                      {insightPreview.word.sections.length === 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">セクション情報がありません。</div>
                      )}
                    </div>
                  </details>
                </div>
                {insightError && (
                  <div className="md:col-span-2 text-sm text-red-600 dark:text-red-300">{insightError}</div>
                )}
              </div>
            ) : insightError ? (
              <div className="text-sm text-red-600 dark:text-red-300">{insightError}</div>
            ) : (
              <div className="text-sm text-gray-600 dark:text-gray-300">インサイトを生成すると結果がここに表示されます。</div>
            )}
          </div>
        </div>
      )}

      {/* 設定パネル */}
      <div className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
        {/* 設定パネルヘッダー */}
        <div className="px-4 py-2 flex items-center justify-between bg-gray-100 dark:bg-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">設定</h3>
          <button
            onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
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
            {/* SQLクエリ設定 */}
            {activeTab === 'query' && (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      SQLクエリ
                    </label>
                    <div className="inline-flex rounded overflow-hidden border border-gray-300 dark:border-gray-600">
                      <button
                        className={`px-3 py-1 text-sm ${
                          !isNotebookMode
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                        onClick={() => setIsNotebookMode(false)}
                      >
                        シングルクエリ
                      </button>
                      <button
                        className={`px-3 py-1 text-sm ${
                          isNotebookMode
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                        onClick={() => setIsNotebookMode(true)}
                      >
                        ノートブック
                      </button>
                    </div>
                  </div>

                  {!isNotebookMode ? (
                    <>
                      <textarea
                        value={sqlQuery}
                        onChange={(e) => setSqlQuery(e.target.value)}
                        rows={3}
                        style={{ fontSize: `${editorSettings.fontSize}px`, minHeight: '3rem', lineHeight: 1.5 }}
                        className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-y"
                        placeholder="SELECT * FROM ? LIMIT 1000"
                      />
                      <div className="mt-2 flex justify-between items-center">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          テーブルは ?（クエスチョンマーク）で参照できます
                        </div>
                        <button
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                          onClick={executeUserQuery}
                        >
                          実行
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <IoBookOutline size={16} />
                          <span>Notebookモードでは複数のSQLセルを順次実行できます。</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center disabled:opacity-50"
                            onClick={addNotebookCell}
                          >
                            <IoAddOutline className="mr-1" /> セル追加
                          </button>
                          <button
                            className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 flex items-center disabled:opacity-50"
                            onClick={executeAllNotebookCells}
                            disabled={!parsedData || runAllInProgress || !hasNotebookCells}
                          >
                            {runAllInProgress ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                実行中...
                              </>
                            ) : (
                              <>
                                <IoPlayForward className="mr-1" /> 全セル実行
                              </>
                            )}
                          </button>
                          <button
                            className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 flex items-center disabled:opacity-50"
                            onClick={exportNotebook}
                            disabled={!hasNotebookCells}
                          >
                            <IoDownloadOutline className="mr-1" /> Notebookを保存
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        テーブルは ?（クエスチョンマーク）で参照できます。各セル単位でSQLを編集・実行して結果を確認できます。
                      </div>
                      <div className="rounded-md border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-900/40 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
                          <IoSparkles size={16} />
                          <span>自然言語リクエスト</span>
                        </div>
                        <textarea
                          value={workflowRequest}
                          onChange={(e) => setWorkflowRequest(e.target.value)}
                          className="w-full min-h-[96px] p-2 border border-blue-200 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                          placeholder="例: 地域ごとの売上トップ5を確認したい"
                          disabled={workflowGenerating}
                        />
                        {workflowGenerationError && (
                          <div className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded p-2">
                            {workflowGenerationError}
                          </div>
                        )}
                        {workflowGenerationInfo && !workflowGenerationError && (
                          <div className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded p-2">
                            {workflowGenerationInfo}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            利用列 {columns.length} 件・サンプル行 {llmSampleRows.length} 件を送信します。
                          </span>
                          <button
                            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 flex items-center text-sm"
                            onClick={generateNotebookFromRequest}
                            disabled={workflowGenerating}
                          >
                            {workflowGenerating ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                生成中...
                              </>
                            ) : (
                              <>
                                <IoSparkles className="mr-1" />
                                SQLを生成して実行
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* チャート設定 */}
            {activeTab === 'chart' && (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">グラフタイプ</div>
                    <select
                      value={chartSettings.type}
                      onChange={(e) => {
                        const newType = e.target.value as any;
                        updateChartSettings({
                          type: newType,
                          // グラフタイプごとの初期設定
                          aggregation:
                            newType === 'venn'
                              ? 'count'
                              : (newType === 'scatter' || newType === 'histogram' || newType === 'gantt')
                                ? undefined
                                : chartSettings.aggregation,
                          xAxis: newType === 'venn' ? '' : chartSettings.xAxis,
                          yAxis: newType === 'venn' ? '' : chartSettings.yAxis,
                          categoryField: newType === 'venn' ? '' : chartSettings.categoryField,
                          options: {
                            ...chartSettings.options,
                            vennFields: newType === 'venn' ? [] : chartSettings.options?.vennFields || []
                          }
                        });
                        // グラフタイプが変更されたらすぐにチャートを更新
                        setTimeout(() => { updateChart(); }, 50);
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
                      <option value="treemap">ツリーマップ</option>
                      <option value="streamgraph">ストリームグラフ</option>
                      <option value="venn">ベン図</option>
                    </select>
                  </div>

                  {chartSettings.type !== 'histogram' && chartSettings.type !== 'regression' && chartSettings.type !== 'gantt' && chartSettings.type !== 'venn' && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                        集計方法 <span title="単一項目の出現頻度分析: X軸に分析したい項目、集計方法に「カウント」を選択、Y軸は空でOK&#10;各区分ごとの合計値: 例）部門別売上合計&#10;各区分ごとの平均値: 例）地域別平均気温&#10;各区分ごとの最大値: 例）月別最高気温&#10;各区分ごとの最小値: 例）製品別最低価格" className="text-red-500 cursor-help">*</span>
                      </div>
                      <select
                        value={chartSettings.aggregation || 'none'}
                        onChange={(e) => {
                          updateChartSettings({ aggregation: e.target.value === 'none' ? undefined : e.target.value as any });
                          // 集計方法が変更されたらすぐにチャートを更新
                          setTimeout(() => { updateChart(); }, 50);
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
                  
                  <div>
                    <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">データソース</div>
                    <select
                      value={chartSettings.dataSource}
                      onChange={(e) => updateChartSettings({ dataSource: e.target.value as 'originalData' | 'queryResult' })}
                      className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="originalData">元データ</option>
                      <option value="queryResult">クエリ結果</option>
                    </select>
                  </div>
                  
                  {chartSettings.type === 'histogram' && (
                    <div>
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
                          setTimeout(() => { updateChart(); }, 50);
                        }}
                        className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  )}
                  
                  {chartSettings.type === 'gantt' && (
                    <>
                      <div>
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
                            setTimeout(() => { updateChart(); }, 50);
                          }}
                          className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          <option value="">タスク名フィールドを選択</option>
                          {chartSettings.dataSource === 'queryResult' && queryResult && queryResult.length > 0
                            ? Object.keys(queryResult[0]).map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))
                            : columns.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                        </select>
                      </div>
                      <div>
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
                            setTimeout(() => { updateChart(); }, 50);
                          }}
                          className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          <option value="">開始日フィールドを選択</option>
                          {chartSettings.dataSource === 'queryResult' && queryResult && queryResult.length > 0
                            ? Object.keys(queryResult[0]).map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))
                            : columns.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                        </select>
                      </div>
                      <div>
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
                            setTimeout(() => { updateChart(); }, 50);
                          }}
                          className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          <option value="">終了日フィールドを選択</option>
                          {chartSettings.dataSource === 'queryResult' && queryResult && queryResult.length > 0
                            ? Object.keys(queryResult[0]).map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))
                            : columns.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                        </select>
                      </div>
                    </>
                  )}
                  
                  {chartSettings.type !== 'venn' && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">X軸</div>
                      <select
                        value={chartSettings.xAxis || ''}
                        onChange={(e) => {
                          updateChartSettings({ xAxis: e.target.value || undefined });
                          // X軸が変更されたらすぐにチャートを更新
                          setTimeout(() => { updateChart(); }, 50);
                        }}
                        className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">X軸を選択</option>
                        {chartSettings.dataSource === 'queryResult' && queryResult && queryResult.length > 0
                          ? Object.keys(queryResult[0]).map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))
                          : columns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))
                        }
                      </select>
                    </div>
                  )}

                  {chartSettings.type !== 'venn' && chartSettings.type !== 'histogram' && chartSettings.aggregation !== 'count' && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">Y軸</div>
                      <select
                        value={chartSettings.yAxis || ''}
                        onChange={(e) => {
                          updateChartSettings({ yAxis: e.target.value || undefined });
                          // Y軸が変更されたらすぐにチャートを更新
                          setTimeout(() => { updateChart(); }, 50);
                        }}
                        className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">{chartSettings.aggregation === 'count' ? 'Y軸なし（頻度分析）' : 'Y軸を選択'}</option>
                        {chartSettings.dataSource === 'queryResult' && queryResult && queryResult.length > 0
                          ? Object.keys(queryResult[0]).map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))
                          : columns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))
                        }
                      </select>
                    </div>
                  )}

                  {chartSettings.type !== 'venn' && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                        グループ分け <span title="グループ分けの使い方：&#10;・単一項目の頻度分析時は空白のままにします&#10;・X軸の各カテゴリごとに複数の棒/線を表示する場合に使用します&#10;・例：「地域別、製品カテゴリ別の売上」ではX軸に地域、グループ分けに製品カテゴリを指定" className="text-red-500 cursor-help">*</span>
                      </div>
                      <select
                        value={chartSettings.categoryField || ''}
                        onChange={(e) => {
                          updateChartSettings({ categoryField: e.target.value || undefined });
                          // カテゴリフィールドが変更されたらすぐにチャートを更新
                          setTimeout(() => { updateChart(); }, 50);
                        }}
                        className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">カテゴリなし</option>
                        {chartSettings.dataSource === 'queryResult' && queryResult && queryResult.length > 0
                          ? Object.keys(queryResult[0]).map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))
                          : columns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))
                        }
                      </select>
                    </div>
                  )}

                  {chartSettings.type === 'venn' && (() => {
                    const availableColumns = chartSettings.dataSource === 'queryResult' && queryResult && queryResult.length > 0
                      ? Object.keys(queryResult[0])
                      : columns;
                    const selectedFields = chartSettings.options?.vennFields || [];

                    return (
                      <div className="col-span-2 md:col-span-3">
                        <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">ベン図のフィールド</div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          2〜3個のフィールドを選択してください（真偽値・有無を示す列が推奨です）。
                        </p>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">最大3フィールドまで選択できます。</div>
                        {availableColumns.length > 0 ? (
                          <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded p-2 space-y-2 bg-white dark:bg-gray-800">
                            {availableColumns.map(col => {
                              const isSelected = selectedFields.includes(col);
                              return (
                                <label key={col} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      const current = chartSettings.options?.vennFields || [];
                                      let nextFields = current;

                                      if (checked) {
                                        if (!current.includes(col) && current.length < 3) {
                                          nextFields = [...current, col];
                                        }
                                      } else {
                                        nextFields = current.filter(field => field !== col);
                                      }

                                      updateChartSettings({
                                        options: {
                                          ...chartSettings.options,
                                          vennFields: nextFields
                                        }
                                      });
                                      setTimeout(() => { updateChart(); }, 50);
                                    }}
                                  />
                                  <span>{col}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 dark:text-gray-400">選択可能な列がありません。</div>
                        )}
                      </div>
                    );
                  })()}
                  
                  {chartSettings.type === 'regression' && (
                    <div>
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
                          setTimeout(() => { updateChart(); }, 50);
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
                
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                    onClick={toggleAnalysisMode}
                  >
                    選択をクリア
                  </button>
                  <button
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
                    onClick={updateChart}
                  >
                    <IoBarChartOutline className="mr-2" size={16} />
                    グラフを更新
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
      
      {/* タブコンテンツ */}
      <div className="flex-1 overflow-hidden min-h-0">
        {/* SQLクエリタブ */}
        {activeTab === 'query' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto">
              {renderQueryResult()}
            </div>
          </div>
        )}
        
        {/* 統計情報タブ */}
        {activeTab === 'stats' && (
          <div className="h-full overflow-auto p-4">
            {renderStatistics()}
          </div>
        )}
        
        {/* グラフ作成タブ */}
        {activeTab === 'chart' && (
          <div className="h-full overflow-auto" style={{ height: '400px' }}>
            {renderChart()}
          </div>
        )}

        {/* 関係グラフタブ */}
        {activeTab === 'relationship' && (
          <div className="h-full overflow-auto p-4" ref={graphContainerRef}>
            {originalData && typeof originalData === 'object' ? (
              <RelationshipGraph 
                data={originalData} 
                theme={currentTheme}
                width={graphSize.width}
                height={graphSize.height}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-800 rounded">
                <p className="text-gray-500 dark:text-gray-400">
                  関係グラフの表示には有効なJSONデータが必要です。
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataAnalysis;
