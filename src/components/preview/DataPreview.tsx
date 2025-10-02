/**
 * DataPreview.tsx
 * 各種データ（CSV, TSV, JSON, YAML, Parquet等）のプレビュー表示Reactコンポーネント。
 * 主な機能:
 * - データ型ごとのプレビューUI切替
 * - テーブル・グラフ・オブジェクト表示
 * - ネスト構造・配列・プリミティブ型対応
 * - ダークモード対応
 */
'use client';

/**
 * DataPreview.tsx
 * このファイルは、CSV/TSV/JSON/YAML/Parquet/Markdown/Mermaid/PDF/ipynbなど多様なデータを解析し、
 * プレビュー・編集・エクスポート・分析モードを切り替えて表示するReactコンポーネントを提供します。
 * 主な機能:
 * - データ種別ごとの解析・表示
 * - 編集・エクスポート（Word/Excel等）
 * - 分析モード切替
 * - エラー・ローディング表示
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '@/store/editorStore';
import type { ChartDesignerSettings } from '@/types';
import {
  parseCSV,
  parseJSON,
  parseYAML,
  parseParquet,
  flattenNestedObjects,
  parseMermaid,
} from '@/lib/dataPreviewUtils';
import { formatData } from '@/lib/dataFormatUtils';
import {
  buildGisDatasetFromObject,
  parseGeoJsonContent,
  parseKmlContent,
  parseKmzContent,
  parseShapefileContent,
  type GisParseResult,
} from '@/lib/gisUtils';
import DataTable from './DataTable';
import EditableDataTable from './EditableDataTable';
import ObjectViewer from './ObjectViewer';
import DataDesignerPanel from './DataDesignerPanel';
import type { MermaidDesignerProps } from '@/components/mermaid/MermaidDesigner';
import IpynbPreview from './IpynbPreview';
import PdfPreview from './PdfPreview';
import ExcelPreview from './ExcelPreview';
import ExportModal from './ExportModal';
import { IoAlertCircleOutline, IoCodeSlash, IoEye, IoAnalytics, IoLayers, IoGrid, IoSave, IoClose, IoDownload, IoColorPalette } from 'react-icons/io5';
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph } from 'docx';

const MermaidDesigner = dynamic<MermaidDesignerProps>(
  () => import('@/components/mermaid/MermaidDesigner'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Mermaidデザイナーを読み込み中...
      </div>
    ),
  },
);

interface DataPreviewProps {
  tabId: string;
}


/**
 * DataPreviewコンポーネント
 * 選択されたタブのデータを解析し、プレビュー・編集・エクスポート・分析モードを切り替えて表示する。
 * - データ種別ごとの解析・表示
 * - 編集・エクスポート（Word/Excel等）
 * - 分析モード切替
 * - エラー・ローディング表示
 * @param tabId 表示対象のタブID
 */

const DataPreview: React.FC<DataPreviewProps> = ({ tabId }) => {
  // Word/Excelエクスポート処理
  const handleExport = () => {
    if (type === 'markdown') {
      // markdown→Word
      const doc = new Document({
        sections: [
          {
            children: [new Paragraph(content)],
          },
        ],
      });
      Packer.toBlob(doc).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (tabs.get(tabId)?.name?.replace(/\.md$/, '') || 'markdown') + '.docx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    } else if (['csv', 'tsv', 'json', 'yaml'].includes(type || '')) {
      // csv/tsv/json/yaml→Excel
      let exportData = parsedData;
      if (!Array.isArray(exportData)) {
        exportData = [exportData];
      }
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (tabs.get(tabId)?.name?.replace(/\.(csv|tsv|json|ya?ml)$/, '') || 'data') + '.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };
  const {
    tabs,
    updateTab,
    getViewMode,
    setViewMode,
    paneState,
    updatePaneState,
    editorSettings,
    updateEditorSettings,
    analysisData,
    setAnalysisData,
  } = useEditorStore();
  const [content, setContent] = useState<string | ArrayBuffer>('');
  const [type, setType] = useState<
    | 'text'
    | 'markdown'
    | 'html'
    | 'json'
    | 'yaml'
    | 'sql'
    | 'csv'
    | 'tsv'
    | 'parquet'
    | 'mermaid'
    | 'ipynb'
    | 'pdf'
    | 'excel'
    | null
  >(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [originalData, setOriginalData] = useState<any>(null); // 元のネスト構造データ
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editableContent, setEditableContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isTableEditing, setIsTableEditing] = useState(false);
  const [editedData, setEditedData] = useState<any>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [designerView, setDesignerView] = useState(false);
  
  const viewMode = getViewMode(tabId);
  const dataDisplayMode = editorSettings.dataDisplayMode || 'flat';
  const analysisEntry = analysisData[tabId];

  const isTabularData = useMemo(() => {
    if (!type) return false;
    const isStructuredType = ['csv', 'tsv', 'parquet', 'json', 'yaml', 'excel'].includes(type);
    if (!isStructuredType) return false;
    if (!Array.isArray(parsedData) || parsedData.length === 0) return false;
    if (typeof parsedData[0] !== 'object' || parsedData[0] === null) return false;
    return columns.length > 0;
  }, [type, parsedData, columns]);

  useEffect(() => {
    if (!isTabularData && designerView) {
      setDesignerView(false);
    }
  }, [designerView, isTabularData]);

  const designerSettings = analysisEntry?.chartSettings;

  useEffect(() => {
    if (!isTabularData || !Array.isArray(parsedData)) {
      return;
    }

    const current = useEditorStore.getState().analysisData[tabId];
    const currentColumns = current?.columns ?? [];
    const columnsMatch =
      currentColumns.length === columns.length &&
      currentColumns.every((value, index) => value === columns[index]);
    const rowsMatch = current?.rows === parsedData;
    const settingsMatch = current?.chartSettings === designerSettings;

    if (columnsMatch && rowsMatch && settingsMatch) {
      return;
    }

    setAnalysisData(tabId, {
      columns,
      rows: parsedData,
      chartSettings: designerSettings,
    });
  }, [columns, designerSettings, isTabularData, parsedData, setAnalysisData, tabId]);

  const handleDesignerSettingsChange = useCallback(
    (settings: ChartDesignerSettings) => {
      if (!isTabularData || !Array.isArray(parsedData)) {
        return;
      }

      setAnalysisData(tabId, {
        columns,
        rows: parsedData,
        chartSettings: settings,
      });
    },
    [columns, isTabularData, parsedData, setAnalysisData, tabId],
  );
  
  useEffect(() => {
    let isMounted = true; // コンポーネントがマウントされているかを追跡
    
    const loadData = async () => {
      const tab = tabs.get(tabId);
      if (!tab) {
        if (isMounted) {
          setError('タブが見つかりません');
          setParsedData(null);
          setOriginalData(null);
          setColumns([]);
        }
        return;
      }
      
      if (isMounted) {
        // 型変換: md→markdown, mmd→mermaid
        let mappedType = tab.type;
        if (tab.type === 'md') mappedType = 'markdown';
        if (tab.type === 'mmd') mappedType = 'mermaid';
        if (tab.type === 'text' || tab.type === 'json') {
          const fileName = tab.name || '';
          const extension = fileName.split('.').pop()?.toLowerCase();
          if (extension === 'ipynb') mappedType = 'ipynb';
          if (extension === 'pdf') mappedType = 'pdf';
          if (extension === 'mmd') mappedType = 'mermaid';
        }
        setType(mappedType as typeof type);
        
        // Excelファイルの場合は特別な処理
        if (tab.type === 'excel') {
          await parseContent(tab.content, mappedType);
        } else {
          setContent(tab.content);
          setEditableContent(tab.content);
          await parseContent(tab.content, mappedType);
        }
      }
    };
    
    loadData();
    
    // クリーンアップ関数
    return () => {
      isMounted = false; // アンマウント時にフラグを更新
    };
  }, [tabId, tabs]);
  
  // タブのコンテンツが外部（エディタなど）で変更された場合に更新
  useEffect(() => {
    const tab = tabs.get(tabId);

    const loadBinaryFromTab = async (): Promise<ArrayBuffer> => {
      if (!tab?.file) {
        throw new Error('ファイルハンドルが見つかりません');
      }

      if ('getFile' in tab.file) {
        const file = await tab.file.getFile();
        return await file.arrayBuffer();
      }

      if (tab.file instanceof File) {
        return await tab.file.arrayBuffer();
      }

      throw new Error('バイナリデータの読み込みに失敗しました');
    };

    const applyGisResult = (result: GisParseResult) => {
      if (result.error) {
        setError(result.error);
        return false;
      }
      setParsedData(result.rows);
      setOriginalData(result.rows);
      setColumns(result.columns);
      return true;
    };
    if (!tab || tab.content === content) return;
    
    // 編集中でない場合のみコンテンツを更新
    if (!isEditing && !isTableEditing) {
      setContent(tab.content);
      setEditableContent(tab.content);
      let mappedType = tab.type;
      if (tab.type === 'mmd') mappedType = 'mermaid';
      if (tab.type === 'text' || tab.type === 'json') {
        const fileName = tab.name || '';
        const extension = fileName.split('.').pop()?.toLowerCase();
        if (extension === 'ipynb') mappedType = 'ipynb';
        if (extension === 'pdf') mappedType = 'pdf';
        if (extension === 'mmd') mappedType = 'mermaid';
      }
      parseContent(tab.content, mappedType);
    }
  }, [tabs, tabId, isEditing, isTableEditing]);
  
  // データ表示モードが変更された時にデータを更新
  useEffect(() => {
    if (type === 'ipynb') {
      return;
    }

    if (originalData) {
      if (dataDisplayMode === 'flat') {
        // フラット化モードの場合
        if (Array.isArray(originalData)) {
          const flattenedData = flattenNestedObjects(originalData);
          setParsedData(flattenedData);
          if (flattenedData.length > 0 && typeof flattenedData[0] === 'object') {
            setColumns(Object.keys(flattenedData[0]));
          }
        } else if (originalData !== null && typeof originalData === 'object') {
          // トップレベルオブジェクトの場合、配列キーを探す
          const arrayKeys = Object.keys(originalData).filter(key => Array.isArray(originalData[key]));
          if (arrayKeys.length > 0) {
            const firstArrayKey = arrayKeys[0];
            const arrayData = originalData[firstArrayKey];
            if (Array.isArray(arrayData) && arrayData.length > 0) {
              const flattenedData = flattenNestedObjects(arrayData);
              setParsedData(flattenedData);
              if (flattenedData.length > 0 && typeof flattenedData[0] === 'object') {
                setColumns(Object.keys(flattenedData[0]));
              }
            }
          } else {
            // 配列がない場合はそのまま表示
            setParsedData(originalData);
          }
        }
      } else {
        // ネスト構造保持モードの場合
        setParsedData(originalData);
        if (Array.isArray(originalData) && originalData.length > 0 && typeof originalData[0] === 'object') {
          setColumns(Object.keys(originalData[0]));
        } else if (originalData !== null && typeof originalData === 'object') {
          const arrayKeys = Object.keys(originalData).filter(key => Array.isArray(originalData[key]));
          if (arrayKeys.length > 0) {
            const firstArrayKey = arrayKeys[0];
            const arrayData = originalData[firstArrayKey];
            if (Array.isArray(arrayData) && arrayData.length > 0 && typeof arrayData[0] === 'object') {
              setParsedData(arrayData);
              setColumns(Object.keys(arrayData[0]));
            }
          }
        }
      }
    }
  }, [dataDisplayMode, originalData, type]);
  
  const parseContent = async (content: string | ArrayBuffer, type: string) => {
    setLoading(true);
    setError(null);
    setParsedData(null);
    setOriginalData(null);
    setColumns([]);

    const tab = tabs.get(tabId);

    // コンテンツが空の場合（Excelファイルは除く）
    const isStringContent = typeof content === 'string';
    if (type !== 'excel') {
      if (!content || (isStringContent && content.trim() === '')) {
        setLoading(false);
        setParsedData(null);
        return;
      }
    }

    const stringContent = isStringContent ? content : '';
    if (!stringContent && isStringContent && type !== 'excel') {
      setLoading(false);
      setParsedData(null);
      return;
    }

    try {
      switch (type) {
        case 'csv':
          const csvResult = parseCSV((content as string) ?? '');
          if (csvResult.error) {
            setError(csvResult.error);
          } else {
            setParsedData(csvResult.data);
            setOriginalData(csvResult.data);
            setColumns(csvResult.columns);
          }
          break;
          
        case 'tsv':
          const tsvResult = parseCSV((content as string) ?? '', '\t');
          if (tsvResult.error) {
            setError(tsvResult.error);
          } else {
            setParsedData(tsvResult.data);
            setOriginalData(tsvResult.data);
            setColumns(tsvResult.columns);
          }
          break;
          
        case 'json': {
          const jsonResult = parseJSON((content as string) ?? '');
          if (jsonResult.error) {
            setError(jsonResult.error);
            break;
          }

          const geoDataset = buildGisDatasetFromObject(jsonResult.data);
          if (geoDataset && geoDataset.rows.length > 0) {
            applyGisResult(geoDataset);
            break;
          }

          // 元のデータを保存
          setOriginalData(jsonResult.data);

          // 表示モードに応じた処理
          if (dataDisplayMode === 'flat') {
            // 配列の場合はテーブル表示も可能
            if (Array.isArray(jsonResult.data) && jsonResult.data.length > 0 && typeof jsonResult.data[0] === 'object') {
              // ネストされたオブジェクトをフラット化
              const flattenedData = flattenNestedObjects(jsonResult.data);
              // フラット化されたデータを使用
              if (flattenedData.length > 0 && typeof flattenedData[0] === 'object') {
                setParsedData(flattenedData);
                setColumns(Object.keys(flattenedData[0]));
              } else {
                setParsedData(jsonResult.data);
                setColumns(Object.keys(jsonResult.data[0]));
              }
            } else if (jsonResult.data && typeof jsonResult.data === 'object') {
              // トップレベルがオブジェクトの場合、内部の配列を探す
              const arrayKeys = Object.keys(jsonResult.data).filter(key =>
                Array.isArray(jsonResult.data[key]) &&
                jsonResult.data[key].length > 0 &&
                typeof jsonResult.data[key][0] === 'object'
              );

              if (arrayKeys.length > 0) {
                const firstArrayKey = arrayKeys[0];
                const arrayData = jsonResult.data[firstArrayKey];
                const flattenedData = flattenNestedObjects(arrayData);

                if (flattenedData.length > 0) {
                  setParsedData(flattenedData);
                  setColumns(Object.keys(flattenedData[0]));
                } else {
                  setParsedData(jsonResult.data);
                }
              } else {
                setParsedData(jsonResult.data);
              }
            } else {
              setParsedData(jsonResult.data);
            }
          } else {
            // ネスト構造保持モード
            setParsedData(jsonResult.data);
            if (Array.isArray(jsonResult.data) && jsonResult.data.length > 0 && typeof jsonResult.data[0] === 'object') {
              setColumns(Object.keys(jsonResult.data[0]));
            } else if (jsonResult.data && typeof jsonResult.data === 'object') {
              // トップレベルがオブジェクトの場合、内部の配列を探す
              const arrayKeys = Object.keys(jsonResult.data).filter(key =>
                Array.isArray(jsonResult.data[key]) &&
                jsonResult.data[key].length > 0 &&
                typeof jsonResult.data[key][0] === 'object'
              );

              if (arrayKeys.length > 0) {
                const firstArrayKey = arrayKeys[0];
                setParsedData(jsonResult.data[firstArrayKey]);
                setColumns(Object.keys(jsonResult.data[firstArrayKey][0]));
              }
            }
          }
          break;
        }
          
        case 'yaml':
          const yamlResult = parseYAML((content as string) ?? '');
          if (yamlResult.error) {
            setError(yamlResult.error);
          } else {
            // 元のデータを保存
            setOriginalData(yamlResult.data);
            
            // YAML データを明示的に型指定して処理
            const yamlData = yamlResult.data as Record<string, any>;
            
            // 表示モードに応じた処理
            if (dataDisplayMode === 'flat') {
              // YAMLデータをフラット化
              const flattenedData = flattenNestedObjects(yamlData);
              
              // フラット化されたデータを処理
              if (flattenedData && flattenedData.length > 0 && typeof flattenedData[0] === 'object') {
                setParsedData(flattenedData);
                setColumns(Object.keys(flattenedData[0]));
              } else {
                // フラット化されなかった場合は元のデータを使用
                setParsedData(yamlData);
                
                // 配列の場合はテーブル表示のためにカラムを設定
                if (Array.isArray(yamlData) && yamlData.length > 0 && 
                    typeof yamlData[0] === 'object') {
                  setColumns(Object.keys(yamlData[0]));
                } else if (yamlData && typeof yamlData === 'object') {
                  // トップレベルがオブジェクトの場合、内部の配列を探す
                  const arrayKeys = Object.keys(yamlData).filter(key => {
                    const item = yamlData[key];
                    return Array.isArray(item) && item.length > 0 && typeof item[0] === 'object';
                  });
                  
                  if (arrayKeys.length > 0) {
                    const firstArrayKey = arrayKeys[0];
                    // TypeScriptの型問題を解決するために型アサーションを使用
                    const typedYamlData = yamlData as { [key: string]: any };
                    const arrayData = typedYamlData[firstArrayKey] as any[];
                    const flattenedArrayData = flattenNestedObjects(arrayData);
                    
                    if (flattenedArrayData.length > 0) {
                      setParsedData(flattenedArrayData);
                      setColumns(Object.keys(flattenedArrayData[0]));
                    }
                  }
                }
              }
            } else {
              // ネスト構造保持モード
              if (Array.isArray(yamlData) && yamlData.length > 0 && typeof yamlData[0] === 'object') {
                setParsedData(yamlData);
                setColumns(Object.keys(yamlData[0]));
              } else if (yamlData && typeof yamlData === 'object') {
                // トップレベルがオブジェクトの場合、内部の配列を探す
                const arrayKeys = Object.keys(yamlData).filter(key => {
                  const item = yamlData[key];
                  return Array.isArray(item) && item.length > 0 && typeof item[0] === 'object';
                });
                
                if (arrayKeys.length > 0) {
                  const firstArrayKey = arrayKeys[0];
                  // TypeScriptの型問題を解決するために型アサーションを使用
                  const typedYamlData = yamlData as { [key: string]: any };
                  const arrayData = typedYamlData[firstArrayKey] as any[];
                  setParsedData(arrayData);
                  if (arrayData.length > 0 && typeof arrayData[0] === 'object') {
                    setColumns(Object.keys(arrayData[0]));
                  }
                } else {
                  // 配列が見つからない場合はそのまま表示
                  setParsedData(yamlData);
                }
              } else {
                setParsedData(yamlData);
              }
            }
          }
          break;

        case 'geojson': {
          const geoResult = parseGeoJsonContent((content as string) ?? '');
          applyGisResult(geoResult);
          break;
        }

        case 'kml': {
          const kmlResult = await parseKmlContent((content as string) ?? '');
          applyGisResult(kmlResult);
          break;
        }

        case 'kmz': {
          try {
            const buffer = await loadBinaryFromTab();
            const kmzResult = await parseKmzContent(buffer);
            if (!applyGisResult(kmzResult)) {
              setLoading(false);
              return;
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'KMZの読み込みに失敗しました');
          }
          break;
        }

        case 'shapefile': {
          try {
            const buffer = await loadBinaryFromTab();
            const shapefileResult = await parseShapefileContent(buffer);
            if (!applyGisResult(shapefileResult)) {
              setLoading(false);
              return;
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'シェープファイルの読み込みに失敗しました');
          }
          break;
        }

        case 'parquet':
          // Parquetのパース処理（簡易版）
          const parquetResult = await parseParquet((content as string) ?? '');
          if (parquetResult.error) {
            setError(parquetResult.error);
          } else if (parquetResult.headers && parquetResult.rows) {
            const parsedRows = parquetResult.rows.map(row => {
              const obj: Record<string, any> = {};
              parquetResult.headers.forEach((header, i) => {
                obj[header] = row[i];
              });
              return obj;
            });
            setParsedData(parsedRows);
            setOriginalData(parsedRows);
            setColumns(parquetResult.headers);
          }
          break;
          
        case 'excel':
          // Excelファイルの処理
          try {
            console.log('Excel処理開始:', {
              hasTab: !!tab,
              tabName: tab?.name, 
              hasFile: !!tab?.file, 
              fileType: typeof tab?.file,
              contentLength: typeof content === 'string'
                ? content.length
                : content instanceof ArrayBuffer
                  ? content.byteLength
                  : 0
            });
            
            if (!tab?.file) {
              console.error('Excelファイルハンドルが存在しません');
              throw new Error('ファイルハンドルが見つかりません');
            }
            
            let buffer: ArrayBuffer;
            
            // FileSystemFileHandleの場合
            if (tab.file && 'getFile' in tab.file) {
              const file = await (tab.file as FileSystemFileHandle).getFile();
              buffer = await file.arrayBuffer();
            } 
            // File型の場合
            else if (tab.file instanceof File) {
              buffer = await tab.file.arrayBuffer();
            } 
            else {
              console.error('不明なファイル形式:', { file: tab.file, hasGetFile: 'getFile' in (tab.file || {}) });
              throw new Error('対応していないファイル形式です');
            }
            
            setContent(buffer); // ArrayBufferをcontentに設定（ExcelPreviewで使用）
          } catch (err) {
            console.error('Excel処理エラー:', err);
            setError(`Excelファイルの読み込みに失敗しました: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
          break;

        case 'mermaid':
          // Mermaidファイルのパース処理
          const mermaidResult = parseMermaid((content as string) ?? '');
          if (!mermaidResult.valid) {
            setError(mermaidResult.error || 'Mermaid図式の解析に失敗しました');
          } else {
            setParsedData(mermaidResult.data);
            setOriginalData(mermaidResult.data);
          }
          break;
          
        case 'ipynb':
          try {
            const notebook = JSON.parse(content);
            setParsedData(notebook);
            setOriginalData(notebook);
          } catch (e) {
            setError('Notebookデータの解析に失敗しました');
          }
          return; // ipynb は特殊処理に任せる
        case 'pdf':
          // PDFはcontentにURLまたはBase64が入る想定
          setParsedData(content);
          setOriginalData(content);
          break;
        default:
          setError('プレビューに対応していないファイル形式です');
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };
  
  const toggleViewMode = () => {
    const newMode = viewMode === 'editor' ? 'preview' : 'editor';
    setViewMode(tabId, newMode);
  };
  
  const toggleAnalysisMode = () => {
    const nextMode = viewMode === 'analysis' ? 'editor' : 'analysis';
    setViewMode(tabId, nextMode);
  };
  
  const toggleDisplayMode = () => {
    const newMode = dataDisplayMode === 'flat' ? 'nested' : 'flat';
    updateEditorSettings({ dataDisplayMode: newMode });
  };
  
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableContent(e.target.value);
    
    // テーブルデータを同期的に更新するため、新しいコンテンツを解析
    if ((type === 'csv' || type === 'tsv' || type === 'json' || type === 'yaml' || type === 'parquet')) {
      try {
        let tempParsedData;
        switch (type) {
          case 'csv':
            tempParsedData = parseCSV(e.target.value).data;
            break;
          case 'tsv':
            tempParsedData = parseCSV(e.target.value, '\t').data;
            break;
          case 'json':
            tempParsedData = parseJSON(e.target.value).data;
            break;
          case 'yaml':
            tempParsedData = parseYAML(e.target.value).data;
            break;
        }
        
        if (Array.isArray(tempParsedData)) {
          setEditedData(tempParsedData);
        }
      } catch (err) {
        // 解析エラーの場合は何もしない
      }
    }
  };
  
  const saveChanges = () => {
    updateTab(tabId, { content: editableContent });
    setContent(editableContent);
    parseContent(editableContent, type || '');
    setIsEditing(false);
  };
  
  const cancelEditing = () => {
    setEditableContent(content);
    setIsEditing(false);
  };
  
  // テーブル編集データの変更をハンドリング
  const handleDataChange = (newData: any[]) => {
    setEditedData(newData);
    
    // エディタコンテンツも同期的に更新
    if (type) {
      try {
        const formattedContent = formatData(newData, type);
        setEditableContent(formattedContent);
      } catch (err) {
        console.error('Error syncing table edits to text editor:', err);
      }
    }
  };
  
  // テーブル編集モードからテキスト編集モードへ切り替え
  const switchToTextEditing = () => {
    if (!editedData || !type) return;
    
    try {
      // 現在の編集データを文字列に変換してテキストエディタに設定
      const formattedContent = formatData(editedData, type);
      setEditableContent(formattedContent);
      
      // テーブル編集モードを終了し、テキスト編集モードを開始
      setIsTableEditing(false);
      setIsEditing(true);
    } catch (error) {
      console.error('Error switching to text editing:', error);
      setError('編集モードの切り替え中にエラーが発生しました');
    }
  };
  
  // テキスト編集モードからテーブル編集モードへ切り替え
  const switchToTableEditing = () => {
    if (!type) return;
    
    try {
      // 現在のテキスト内容を解析してテーブルデータに変換
      let parsedResult;
      switch (type) {
        case 'csv':
          parsedResult = parseCSV(editableContent);
          break;
        case 'tsv':
          parsedResult = parseCSV(editableContent, '\t');
          break;
        case 'json':
          parsedResult = parseJSON(editableContent);
          break;
        case 'yaml':
          parsedResult = parseYAML(editableContent);
          break;
        default:
          throw new Error('未対応のファイル形式です');
      }
      
      if (parsedResult.error) {
        setError(parsedResult.error);
        return;
      }
      
      // 解析されたデータがテーブル形式（配列）であることを確認
      if (Array.isArray(parsedResult.data) && parsedResult.data.length > 0) {
        setEditedData(parsedResult.data);
        
        // テキスト編集モードを終了し、テーブル編集モードを開始
        setIsEditing(false);
        setIsTableEditing(true);
      } else {
        setError('テキストをテーブルデータに変換できませんでした');
      }
    } catch (error) {
      console.error('Error switching to table editing:', error);
      setError('編集モードの切り替え中にエラーが発生しました');
    }
  };
  
  // テーブル編集データの保存
  const saveTableEdits = () => {
    if (!editedData || !type) return;
    
    try {
      // データを適切な形式に変換
      const formattedContent = formatData(editedData, type);
      
      // タブの内容を更新
      updateTab(tabId, { content: formattedContent });
      setContent(formattedContent);
      
      // 編集モードを終了
      setIsTableEditing(false);
      
      // データを再解析して表示を更新
      parseContent(formattedContent, type);
    } catch (error) {
      console.error('Error saving table edits:', error);
      setError('データの保存中にエラーが発生しました');
    }
  };
  
  const renderPreviewWithEditOption = () => {
    
    if (isEditing) {
      // テーブル形式に変換可能かどうかをチェック
      const canSwitchToTable = (type === 'csv' || type === 'tsv' || type === 'json' || type === 'yaml') &&
        editableContent && editableContent.trim() !== '';
      
      return (
        <div className="h-full flex flex-col">
          <div className="p-2 border-b border-gray-300 dark:border-gray-700 flex justify-between items-center">
            <div className="flex items-center">
              <span className="font-medium mr-2">データ編集モード (テキスト)</span>
            </div>
            <div className="flex items-center">
              {canSwitchToTable && (
                <button
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2 flex items-center"
                  onClick={switchToTableEditing}
                >
                  <IoGrid className="inline mr-1" /> テーブル編集に切替
                </button>
              )}
              <button 
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 mr-2"
                onClick={saveChanges}
              >
                <IoSave className="inline mr-1" /> 保存
              </button>
              <button 
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                onClick={cancelEditing}
              >
                <IoClose className="inline mr-1" /> キャンセル
              </button>
            </div>
          </div>
          <textarea
            value={editableContent}
            onChange={handleContentChange}
            className="flex-1 p-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none focus:outline-none border-0"
            spellCheck={false}
          />
        </div>
      );
    }
    
    if (isTableEditing) {
      return (
        <div className="h-full flex flex-col">
          <div className="p-2 border-b border-gray-300 dark:border-gray-700 flex justify-between items-center">
            <div className="flex items-center">
              <span className="font-medium mr-2">テーブル編集モード</span>
              <span className="text-sm text-gray-500 ml-2">
                表示モード: {dataDisplayMode === 'flat' ? 'フラット' : '階層構造'}
              </span>
            </div>
            <div className="flex items-center">
              <button
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2 flex items-center"
                onClick={switchToTextEditing}
              >
                <IoCodeSlash className="inline mr-1" /> テキスト編集に切替
              </button>
              <button 
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 mr-2"
                onClick={saveTableEdits}
              >
                <IoSave className="inline mr-1" /> 保存
              </button>
              <button 
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                onClick={() => setIsTableEditing(false)}
              >
                <IoClose className="inline mr-1" /> キャンセル
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {((type === 'csv' || type === 'tsv' || type === 'parquet' || 
               type === 'json' || type === 'yaml') && 
               Array.isArray(editedData) && editedData.length > 0 && 
               typeof editedData[0] === 'object') ? (
              <EditableDataTable 
                data={editedData} 
                columns={Object.keys(editedData[0])}
                isNested={dataDisplayMode === 'nested'}
                onDataChange={handleDataChange}
                onSave={saveTableEdits}
                fileType={type}
              />
            ) : (
              <div className="text-center p-4 text-yellow-500">
                このデータ形式はテーブル編集に対応していません。テキスト編集モードを使用してください。
              </div>
            )}
          </div>
        </div>
      );
    }
    
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <p>データを解析中...</p>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-red-500">
          <IoAlertCircleOutline size={48} className="mb-4" />
          <p className="text-center">{error}</p>
        </div>
      );
    }
    
    if (!parsedData && type !== 'excel') {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-gray-500">
          <p>プレビューするデータがありません</p>
        </div>
      );
    }
    
    return (
      <div className="h-full flex flex-col">
        <div className="p-2 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
          <div className="flex items-center">
            <span className="font-medium mr-2">GUIデザインモード</span>
            <span className="text-sm text-gray-500 ml-2">
              表示モード: {dataDisplayMode === 'flat' ? 'フラット' : '階層構造'}
            </span>
            <button
              className={`ml-4 px-2 py-1 rounded border text-xs ${dataDisplayMode === 'flat' ? 'bg-gray-100 border-gray-400' : 'bg-blue-100 border-blue-400'}`}
              onClick={() => updateEditorSettings({ dataDisplayMode: dataDisplayMode === 'flat' ? 'nested' : 'flat' })}
              title={dataDisplayMode === 'flat' ? '階層構造モードに切替' : 'フラットモードに切替'}
            >
              {dataDisplayMode === 'flat' ? '階層構造モードへ' : 'フラットモードへ'}
            </button>
          </div>
          <div className="flex items-center">
            {/* Word/Excelエクスポートボタン */}
            {(type === 'markdown' || (tabs.get(tabId)?.name?.endsWith('.md'))) && (
              <button
                className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 mr-2 flex items-center"
                onClick={handleExport}
                title="Word形式でエクスポート"
              >
                <IoDownload className="inline mr-1" /> Word出力
              </button>
            )}
            {['csv', 'tsv', 'json', 'yaml', 'parquet'].includes(type || '') && Array.isArray(parsedData) && parsedData.length > 0 && (
              <button
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2 flex items-center"
                onClick={() => setIsExportModalOpen(true)}
                title="データエクスポート"
              >
                <IoDownload className="inline mr-1" /> エクスポート
              </button>
            )}
            {/* 分析モード切替アイコン（データ系ファイルで常に表示） */}
            {(type === 'csv' || type === 'tsv' || type === 'json' || type === 'yaml' || type === 'parquet' || type === 'excel') && (
              <button
                className={`px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 mr-2 flex items-center ${paneState.isAnalysisVisible ? 'bg-blue-100 dark:bg-blue-900' : ''}`}
                onClick={toggleAnalysisMode}
                title={paneState.isAnalysisVisible ? '分析モードを閉じる' : '分析モードに切り替え'}
              >
                <IoAnalytics size={20} className="mr-1" /> 分析
              </button>
            )}
            {isTabularData && (
              <button
                className={`px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 mr-2 flex items-center ${designerView ? 'bg-blue-100 dark:bg-blue-900' : ''}`}
                onClick={() => setDesignerView(prev => !prev)}
                title={designerView ? 'テーブル表示に戻る' : 'GUIデザインモードに切り替え'}
              >
                <IoColorPalette size={20} className="mr-1" /> デザイナー
              </button>
            )}
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2"
              onClick={() => {
                if ((type === 'csv' || type === 'tsv' || type === 'parquet' ||
                    type === 'json' || type === 'yaml') &&
                    Array.isArray(parsedData) && parsedData.length > 0 && 
                    typeof parsedData[0] === 'object' && 
                    columns.length > 0) {
                  setIsTableEditing(true);
                  setEditedData([...parsedData]);
                } else {
                  setIsEditing(true);
                }
              }}
            >
              編集
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {/* Mermaid図式の場合 */}
          {type === 'mermaid' && (
            <MermaidDesigner
              tabId={tabId}
              fileName={tabs.get(tabId)?.name || 'mermaid-diagram.mmd'}
              content={content}
            />
          )}
          {/* Jupyter Notebookプレビュー */}
          {type === 'ipynb' && parsedData && (
            <div className="p-2">
              <IpynbPreview data={parsedData} />
            </div>
          )}
          {/* PDFプレビュー */}
          {type === 'pdf' && parsedData && (
            <div className="p-2">
              <PdfPreview fileUrl={parsedData} />
            </div>
          )}
          {/* Excelプレビュー */}
          {type === 'excel' && !designerView && (() => {
            console.log('Excel条件チェック:', {
              typeIsExcel: type === 'excel',
              hasContent: !!content,
              isArrayBuffer: content instanceof ArrayBuffer,
              contentType: typeof content
            });
            return content && content instanceof ArrayBuffer;
          })() && (
            <ExcelPreview 
              content={content as ArrayBuffer} 
              fileName={tabs.get(tabId)?.name || 'excel-file'} 
            />
          )}
          {/* Excel エラー表示 */}
          {type === 'excel' && !content && (
            <div className="p-4 text-center">
              <p className="text-red-500">Excelファイルの読み込みに失敗しました</p>
            </div>
          )}
          {/* CSV、TSV、JSONとYAMLの配列形式のデータはテーブルで表示 */}
          {isTabularData ? (
            <div className="p-2">
              {designerView ? (
                <DataDesignerPanel
                  rows={Array.isArray(parsedData) ? parsedData : []}
                  columns={columns}
                  initialSettings={designerSettings}
                  onSettingsChange={handleDesignerSettingsChange}
                />
              ) : (
                <DataTable
                  data={parsedData}
                  columns={columns}
                  isNested={dataDisplayMode === 'nested'}
                />
              )}
            </div>
          ) : (
            // それ以外はオブジェクトビューアで表示（Mermaid以外）
            type !== 'mermaid' && type !== 'ipynb' && type !== 'pdf' && (
              <div className="p-2">
                <ObjectViewer
                  data={parsedData}
                  expandByDefault={dataDisplayMode === 'nested'} 
                  expandLevel={dataDisplayMode === 'nested' ? 3 : 1}
                />
              </div>
            )
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="h-full overflow-hidden bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {renderPreviewWithEditOption()}
      
      {/* エクスポートモーダル */}
      {isExportModalOpen && Array.isArray(parsedData) && parsedData.length > 0 && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          data={parsedData}
          fileName={tabs.get(tabId)?.name || 'data'}
        />
      )}
    </div>
  );
};

export default DataPreview;
