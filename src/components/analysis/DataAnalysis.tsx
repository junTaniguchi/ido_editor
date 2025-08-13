'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { parseCSV, parseJSON, parseYAML, parseParquet, parseExcel, flattenNestedObjects } from '@/lib/dataPreviewUtils';
import { executeQuery, calculateStatistics, aggregateData, prepareChartData, calculateInfo } from '@/lib/dataAnalysisUtils';
import { IoAlertCircleOutline, IoAnalyticsOutline, IoBarChartOutline, IoStatsChartOutline, IoCodeSlash, IoEye, IoLayersOutline, IoCreate, IoSave, IoGitNetwork, IoChevronUpOutline, IoChevronDownOutline } from 'react-icons/io5';
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
    analysisData, 
    setAnalysisData, 
    chartSettings, 
    updateChartSettings,
    paneState,
    updatePaneState,
    getViewMode,
    setViewMode,
    editorSettings,
    updateEditorSettings
  } = useEditorStore();

  const toggleViewMode = () => {
    const tab = useEditorStore.getState().getTab(tabId);
    if (!tab) return;

    const currentMode = getViewMode(tabId);
    const newMode = currentMode === 'editor' ? 'preview' : 'editor';
    setViewMode(tabId, newMode);
  };

  const toggleAnalysisMode = () => {
    updatePaneState({ 
      isAnalysisVisible: !paneState.isAnalysisVisible 
    });
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
  const [isQueryEditing, setIsQueryEditing] = useState(false);
  const [editedQueryResult, setEditedQueryResult] = useState<any[] | null>(null);
  
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
  
  // グラフコンテナのためのref
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  
  // 関係グラフのサイズを更新するためのステート
  const [graphSize, setGraphSize] = useState({ width: 800, height: 600 });
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  
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
      const queryColumns = Object.keys(queryResult[0]);
      // クエリ結果のカラムが存在する場合、最初の選択肢を設定
      if (queryColumns.length > 0) {
        let numericCol = '';
        let categoryCol = '';
        
        // 数値カラムとカテゴリカラムを探す
        for (const col of queryColumns) {
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
          xAxis: categoryCol || queryColumns[0],
          yAxis: numericCol || queryColumns[queryColumns.length > 1 ? 1 : 0]
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
    
    try {
      let data: any[] = [];
      let cols: string[] = [];
      
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
      console.log('CSVデータロード結果:', {
        カラム: cols,
        データ数: data.length,
        最初の行: data[0],
        数値型かどうか: {
          最初の行の最初のカラム: typeof data[0]?.[cols[0]],
          最初の行の2番目のカラム: typeof data[0]?.[cols[1]],
          '最初の行のsepal_length': typeof data[0]?.sepal_length,
          '最初の行のsepal_width': typeof data[0]?.sepal_width,
        },
        値の例: {
          [cols[0]]: data.slice(0, 5).map(row => ({ 値: row[cols[0]], 型: typeof row[cols[0]] })),
          [cols[1]]: data.slice(0, 5).map(row => ({ 値: row[cols[1]], 型: typeof row[cols[1]] })),
          'sepal_length': data.slice(0, 5).map(row => ({ 値: row['sepal_length'], 型: typeof row['sepal_length'] })),
          'sepal_width': data.slice(0, 5).map(row => ({ 値: row['sepal_width'], 型: typeof row['sepal_width'] }))
        }
      });          // すべてのカラムの値を詳しく確認
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
            console.log('最初の行の各カラム値の詳細:', columnValues);
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
              console.log('Speciesカラム発見:', {
                カラム名: speciesColumn,
                値の例: data.slice(0, 10).map(row => ({
                  rawValue: row[speciesColumn],
                  type: typeof row[speciesColumn],
                  stringValue: String(row[speciesColumn])
                }))
              });
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
          console.log('TSVデータロード結果:', {
            カラム: cols,
            データ数: data.length,
            最初の行: data[0],
            数値型かどうか: {
              最初の行の最初のカラム: typeof data[0]?.[cols[0]],
              最初の行の2番目のカラム: typeof data[0]?.[cols[1]]
            }
          });
          break;
          
        case 'json':
          const jsonResult = parseJSON(content);
          if (jsonResult.error) {
            setError(jsonResult.error);
            setLoading(false);
            return;
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
      setAnalysisData({ columns: cols, rows: data });
      
      // 統計情報を計算
      const statsResult = calculateStatistics(data, true);
      if (statsResult.error) {
        console.error(statsResult.error);
      } else {
        setStatisticsResult(statsResult.stats);
      }
      
      // デフォルトクエリを設定
      setSqlQuery(`SELECT * FROM ? LIMIT 10`);
      
      // デフォルトクエリを実行
      const queryResult = executeQuery(data, `SELECT * FROM ? LIMIT 10`, true);
      if (queryResult.error) {
        console.error(queryResult.error);
      } else {
        setQueryResult(queryResult.data as any[]);
        setOriginalQueryResult(queryResult.data as any[]);
      }
      
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
      データソース: chartSettings.dataSource || 'originalData',
      集計方法: chartSettings.aggregation
    });
    
    // Y軸はカウント集計の場合のみ省略可能
    if (!chartSettings.xAxis || (!chartSettings.yAxis && chartSettings.aggregation !== 'count')) {
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
    
    // データソースが未設定の場合はoriginalDataを使用
    if (!chartSettings.dataSource) {
      updateChartSettings({ dataSource: 'originalData' });
    }
    
    console.log('カテゴリデバッグ - チャート更新開始:', {
      X軸: chartSettings.xAxis,
      Y軸: chartSettings.yAxis,
      カテゴリフィールド: chartSettings.categoryField,
      チャートタイプ: chartSettings.type,
      データソース: chartSettings.dataSource || 'originalData'
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
        
        console.log('カテゴリデバッグ - 検出されたカテゴリ一覧:', uniqueCategories);
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
          console.log(`Y値デバッグ - 列名を正規化: "${chartSettings.yAxis}" -> "${normalizedYAxis}"`);
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
        
        setChartData(preparedData);
        setError(null);
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
        setChartData(preparedData);
        setError(null);
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
        
        setChartData(preparedData);
        setError(null);
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
                    console.log('Y値デバッグ - 列名が異なるため更新します');
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
                
                console.log('【デバッグ】検出されたカテゴリ一覧:', categories);
                
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
                      console.log(`【デバッグ】X軸列名を正規化: "${chartSettings.xAxis}" -> "${actualXField}"`);
                    }
                  } else if (item[actualXField] !== undefined && item[actualXField] !== null) {
                    const xStr = String(item[actualXField]).trim();
                    xValue = parseFloat(xStr);
                    if (isNaN(xValue) && idx < 5) {
                      console.log(`【デバッグ】X値の変換に失敗 [${idx}]: "${xStr}" (型: ${typeof item[actualXField]})`);
                    }
                  }
                  
                  // Y値の処理
                  if (typeof item[actualYField] === 'number') {
                    yValue = item[actualYField];
                    if (idx < 5) {
                      console.log(`【デバッグ】Y値は数値型 [${idx}]: ${yValue} (${typeof yValue}), 使用した列名: ${actualYField}`);
                    }
                  } else if (item[actualYField] !== undefined && item[actualYField] !== null) {
                    const yStr = String(item[actualYField]).trim();
                    yValue = parseFloat(yStr);
                    if (isNaN(yValue) && idx < 5) {
                      console.log(`【デバッグ】Y値の変換に失敗 [${idx}]: "${yStr}" (型: ${typeof item[actualYField]})`);
                    } else if (idx < 5) {
                      console.log(`【デバッグ】Y値の変換成功 [${idx}]: "${yStr}" => ${yValue} (${typeof yValue}), 使用した列名: ${actualYField}`);
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
                console.log(`【デバッグ】カテゴリ ${category} の有効データポイント数:`, categoryScatterData.length);
                if (categoryScatterData.length > 0) {
                  console.log(`【デバッグ】カテゴリ ${category} の最初のポイント:`, categoryScatterData[0]);
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
                    console.log(`X値デバッグ - 変換: [${index}]: 元の値="${originalXValue}" (${typeof originalXValue}) => ${xValue}`);
                  }
                }
                
                // Y値の処理 - 正規化された列名を使用してY値を取得
                // 複数の方法でY値の取得を試みる（より堅牢な実装）
                
                // 1. まず正規化された列名で取得を試みる
                if (typeof item[actualYField] === 'number') {
                  yValue = item[actualYField];
                  if (index < 5) {
                    console.log(`Y値デバッグ - 数値型のY値 [${index}]: ${yValue} (${typeof yValue}), 使用した列名: ${actualYField}`);
                  }
                } else if (item[actualYField] !== undefined && item[actualYField] !== null) {
                  // 文字列を数値に変換する前に、元の値を保存
                  const originalYValue = item[actualYField];
                  const yString = String(originalYValue).trim();
                  
                  // 変換前の文字列をログに出力
                  if (index < 5) {
                    console.log(`Y値デバッグ - Y値の文字列表現 [${index}]: "${yString}" (長さ:${yString.length}), 使用した列名: ${actualYField}`);
                  }
                  
                  // 文字列を数値に変換
                  yValue = parseFloat(yString);
                  
                  // 変換後の数値をログに出力
                  if (index < 5) {
                    console.log(`Y値デバッグ - Y値の変換結果 [${index}]: 元の値="${originalYValue}" (${typeof originalYValue}) => ${yValue} (${typeof yValue}), isNaN=${isNaN(yValue)}`);
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
                    console.log(`Y値デバッグ - 元のY列名フィールドから取得 [${index}]: ${yValue}, 使用した列名: ${chartSettings.yAxis}`);
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
                    console.log(`Y値デバッグ - valueフィールドから取得 [${index}]: ${yValue}`);
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
                      console.log(`Y値デバッグ - 大文字列名からY値を取得 [${index}]: ${yValue}, 使用した列名: ${upperCaseYAxis}`);
                    }
                  } else if (item[lowerCaseYAxis] !== undefined && item[lowerCaseYAxis] !== null) {
                    if (typeof item[lowerCaseYAxis] === 'number') {
                      yValue = item[lowerCaseYAxis];
                    } else {
                      yValue = parseFloat(String(item[lowerCaseYAxis]).trim());
                    }
                    if (index < 5) {
                      console.log(`Y値デバッグ - 小文字列名からY値を取得 [${index}]: ${yValue}, 使用した列名: ${lowerCaseYAxis}`);
                    }
                  }
                }
                
                // 5. 他の数値フィールドを探す（最後の手段）
                if ((yValue === null || isNaN(yValue as number)) && index < 5) {
                  console.log(`Y値デバッグ - Y値が見つかりません [${index}]: item[${actualYField}]=${item[actualYField]}, 全てのキー:`, Object.keys(item));
                  
                  // 全ての数値フィールドをチェック
                  const numericFields = Object.keys(item).filter(key => 
                    typeof item[key] === 'number' && 
                    !isNaN(item[key]) && 
                    key !== actualXField
                  );
                  
                  if (numericFields.length > 0) {
                    yValue = item[numericFields[0]];
                    console.log(`Y値デバッグ - 最後の手段として数値フィールドから取得 [${index}]: ${yValue}, 使用した列名: ${numericFields[0]}`);
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
                    console.log(`Y値デバッグ - 無効なデータポイント[${index}]: x=${xValue}, y=${yValue}`);
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
                  console.log(`Y値デバッグ - 最終データポイント[${idx}]: X=${point.x}, Y=${point.y}, 型=${typeof point.y}`);
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
            setChartData(preparedData);
            setError(null);
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
            setChartData(preparedData);
            setError(null);
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
  
  // クエリ結果の編集データの変更をハンドリング
  const handleQueryDataChange = (newData: any[]) => {
    setEditedQueryResult(newData);
  };
  
  // クエリ結果の編集を保存
  const saveQueryEdits = () => {
    if (!editedQueryResult) return;
    
    setQueryResult([...editedQueryResult]);
    setOriginalQueryResult([...editedQueryResult]);
    setIsQueryEditing(false);
  };
  
  // クエリ結果の表示
  const renderQueryResult = () => {
    if (!queryResult || queryResult.length === 0) {
      return <div className="text-center p-4 text-gray-500">クエリ結果がありません</div>;
    }
    
    const dataToUse = editorSettings.dataDisplayMode === 'nested' && originalQueryResult ? originalQueryResult : queryResult;
    
    if (isQueryEditing) {
      return (
        <div className="flex flex-col h-full">
          <div className="p-2 border-b border-gray-300 dark:border-gray-700 flex justify-between items-center">
            <div className="flex items-center">
              <span className="font-medium mr-2">クエリ結果編集モード</span>
            </div>
            <div>
              <button
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 mr-2"
                onClick={saveQueryEdits}
              >
                <IoSave className="inline mr-1" /> 保存
              </button>
              <button
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                onClick={() => setIsQueryEditing(false)}
              >
                キャンセル
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <EditableQueryResultTable 
              data={dataToUse} 
              onDataChange={handleQueryDataChange}
              onSave={saveQueryEdits}
              editable={true}
            />
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b border-gray-300 dark:border-gray-700 flex justify-end">
          <button
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => {
              setIsQueryEditing(true);
              setEditedQueryResult([...dataToUse]);
            }}
          >
            <IoCreate className="inline mr-1" /> 結果を編集
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <QueryResultTable data={dataToUse} />
        </div>
      </div>
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
    
    const config: Partial<PlotlyTypes.Config> = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      // 凡例のダブルクリックでシングルトレース表示/非表示を無効化（通常のクリック操作を優先）
      doubleClickDelay: 1000
    };
    
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
                console.log('カテゴリデバッグ - 元データから散布図データを作成します');
                
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
                    console.log(`カテゴリデバッグ - ポイント[${idx}]: rawから値を取得 ${y}`);
                  }
                } else {
                  // point.raw に元の値が保存されている可能性がある
                  if (point.raw && typeof point.raw.y === 'number' && !isNaN(point.raw.y)) {
                    y = point.raw.y;
                    console.log(`カテゴリデバッグ - ポイント[${idx}]: 未定義の場合にrawから値を取得 ${y}`);
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
                    console.log(`カテゴリデバッグ - ポイント[${idx}]のデフォルトカテゴリ:`, categoryText);
                  }
                  
                  textValues.push(categoryText);
                  if (idx < 5) {
                    console.log(`カテゴリデバッグ - ポイント[${idx}]の最終カテゴリ:`, categoryText);
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
                console.log('カテゴリデバッグ - すべてのY値が0です。元データから修正を試みます。');
                
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
                        console.log('カテゴリデバッグ - データを置き換えました');
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
                    console.log(`Y値デバッグ - 数値配列変換 [${i}]: x=${i}, y=${yValue}`);
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
                    console.log(`Y値デバッグ - 変換形式2: 有効なデータポイント追加[${i}]: x=${x}, y=${y}`);
                  } else if (i < 5) {
                    console.warn(`Y値デバッグ - 変換形式2: 無効なデータポイント[${i}]: x=${x}, y=${y}`);
                  }
                }
              }
            }
            
              // データの整合性チェック
              if (xValues.length === 0 || yValues.length === 0) {
                console.log('カテゴリデバッグ - 有効なデータがありません');
                return;
              }
              
              // Y値チェック
              const zeroYCount = yValues.filter((y: number) => y === 0).length;
              if (zeroYCount === yValues.length && yValues.length > 0) {
                console.log('カテゴリデバッグ - すべてのY値が0です');
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
          console.log('カテゴリデバッグ - 散布図用のデータセットがありません');
          
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
              
              console.log(`Y値デバッグ - プロット直前のY値チェック: 0の数=${zeroCount}/${totalCount}, 非ゼロ値の存在=${hasNonZeroY}`);
              
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
    const isDarkMode = document.documentElement.classList.contains('dark');
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
    
    console.log("Plotlyデータ:", plotlyData);
    
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
  if (loading && activeTab !== 'chart') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p>データを解析中...</p>
      </div>
    );
  }
  
  // エラー表示（グラフタブでない場合のみ全体表示）
  if (error && activeTab !== 'chart') {
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
            activeTab === 'chart'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('chart')}
        >
          <IoBarChartOutline className="inline mr-1" size={16} />
          チャート
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
        <button
          className="px-3 py-2 flex items-center text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
          onClick={toggleViewMode}
          title="エディタ/プレビュー切替"
        >
          {getViewMode(tabId) === 'editor' ? (
            <IoEye className="mr-1" size={18} />
          ) : (
            <IoCodeSlash className="mr-1" size={18} />
          )}
          <span className="text-sm">{getViewMode(tabId) === 'editor' ? 'プレビュー' : 'エディタ'}</span>
        </button>
        <button
          className="px-3 py-2 flex items-center text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
          onClick={toggleAnalysisMode}
          title="分析モード切替"
        >
          <IoAnalyticsOutline className="mr-1" size={18} />
          <span className="text-sm">分析モード終了</span>
        </button>
      </div>
      
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
              <div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    SQLクエリ
                  </label>
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    className="w-full h-32 p-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="SELECT * FROM ? LIMIT 10"
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
                          // 散布図かヒストグラムの場合は集計なしに設定
                          aggregation: (newType === 'scatter' || newType === 'histogram' || newType === 'gantt') 
                            ? undefined 
                            : chartSettings.aggregation
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
                    </select>
                  </div>
                  
                  {chartSettings.type !== 'histogram' && chartSettings.type !== 'regression' && chartSettings.type !== 'gantt' && (
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
                  
                  {chartSettings.type !== 'histogram' && chartSettings.aggregation !== 'count' && (
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
            <div className="flex justify-end p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <button
                className="px-3 py-1 flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                onClick={toggleDisplayMode}
                title={editorSettings.dataDisplayMode === 'flat' ? "階層表示に切替" : "フラット表示に切替"}
              >
                <IoLayersOutline className="mr-1" size={16} />
                <span className="text-sm">
                  {editorSettings.dataDisplayMode === 'flat' ? '階層表示' : 'フラット表示'}
                </span>
              </button>
            </div>
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
