
/**
 * DataPreviewFixed.tsx
 * このファイルは、CSV/TSV/JSON/YAML/Parquetなどのデータを解析し、
 * プレビュー・編集・エクスポート・分析モードを切り替えて表示するReactコンポーネント（Fixed版）を提供します。
 * 主な機能:
 * - データ種別ごとの解析・表示
 * - 編集・エクスポート
 * - 分析モード切替
 * - エラー・ローディング表示
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '@/store/editorStore';
import { parseCSV, parseJSON, parseYAML, parseParquet, flattenNestedObjects } from '@/lib/dataPreviewUtils';
import { formatData } from '@/lib/dataFormatUtils';
import DataTable from './DataTable';
import ObjectViewer from './ObjectViewer';
import { IoAlertCircleOutline, IoCodeSlash, IoEye, IoAnalytics, IoLayers, IoGrid, IoSave, IoClose, IoOptionsOutline } from 'react-icons/io5';

const SpreadSheetEditor = dynamic(
  () => import('@/components/spread/SpreadSheetEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        SpreadJSエディタを読み込み中...
      </div>
    ),
  },
);

interface DataPreviewProps {
  tabId: string;
}

/**
 * DataPreviewコンポーネント（Fixed版）
 * 選択されたタブのデータを解析し、プレビュー・編集・エクスポート・分析モードを切り替えて表示する。
 * - データ種別ごとの解析・表示
 * - 編集・エクスポート
 * - 分析モード切替
 * - エラー・ローディング表示
 * @param tabId 表示対象のタブID
 */
const DataPreview: React.FC<DataPreviewProps> = ({ tabId }) => {
  const { tabs, updateTab, getViewMode, setViewMode, paneState, updatePaneState, editorSettings, updateEditorSettings } = useEditorStore();
  const [content, setContent] = useState('');
  const [type, setType] = useState<'text' | 'markdown' | 'html' | 'json' | 'yaml' | 'sql' | 'csv' | 'tsv' | 'parquet' | 'md' | 'mermaid' | 'mmd' | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [originalData, setOriginalData] = useState<any>(null); // 元のネスト構造データ
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editableContent, setEditableContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isTableEditing, setIsTableEditing] = useState(false);
  const [editedData, setEditedData] = useState<any>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const tableEditingColumns = useMemo(() => {
    if (Array.isArray(editedData) && editedData.length > 0 && typeof editedData[0] === 'object' && editedData[0] !== null) {
      return Object.keys(editedData[0]);
    }
    if (columns.length > 0) {
      return columns;
    }
    return [];
  }, [editedData, columns]);
  
  const viewMode = getViewMode(tabId);
  const dataDisplayMode = editorSettings.dataDisplayMode || 'flat';
  
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
        setContent(tab.content);
        setEditableContent(tab.content);
        setType(tab.type);
        await parseContent(tab.content, tab.type);
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
    if (!tab || tab.content === content) return;
    
    // 編集中でない場合のみコンテンツを更新
    if (!isEditing && !isTableEditing) {
      setContent(tab.content);
      setEditableContent(tab.content);
      parseContent(tab.content, tab.type);
    }
  }, [tabs, tabId, isEditing, isTableEditing]);
  
  // データ表示モードが変更された時にデータを更新
  useEffect(() => {
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
  }, [dataDisplayMode, originalData]);
  
  const parseContent = async (content: string, type: string) => {
    setLoading(true);
    setError(null);
    setParsedData(null);
    setOriginalData(null);
    setColumns([]);
    
    // コンテンツが空の場合
    if (!content || content.trim() === '') {
      setLoading(false);
      setParsedData(null);
      return;
    }
    
    try {
      switch (type) {
        case 'csv':
          const csvResult = parseCSV(content);
          if (csvResult.error) {
            setError(csvResult.error);
          } else {
            setParsedData(csvResult.data);
            setOriginalData(csvResult.data);
            setColumns(csvResult.columns);
          }
          break;
          
        case 'tsv':
          const tsvResult = parseCSV(content, '\t');
          if (tsvResult.error) {
            setError(tsvResult.error);
          } else {
            setParsedData(tsvResult.data);
            setOriginalData(tsvResult.data);
            setColumns(tsvResult.columns);
          }
          break;
          
        case 'json':
          const jsonResult = parseJSON(content);
          if (jsonResult.error) {
            setError(jsonResult.error);
          } else {
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
          }
          break;
          
        case 'yaml':
          const yamlResult = parseYAML(content);
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
          
        case 'parquet':
          // Parquetのパース処理（簡易版）
          const parquetResult = await parseParquet(content);
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
  const handleDataChange = useCallback((newData: any[]) => {
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
  }, [type]);
  
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
          <div className="flex-1 overflow-hidden p-2">
            {((type === 'csv' || type === 'tsv' || type === 'parquet' ||
               type === 'json' || type === 'yaml') &&
               Array.isArray(editedData)) ? (
              <div className="h-full rounded border border-gray-200 dark:border-gray-700">
                <SpreadSheetEditor
                  data={Array.isArray(editedData) ? editedData : []}
                  columns={tableEditingColumns}
                  onDataChange={handleDataChange}
                />
              </div>
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
    
    if (!parsedData) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-gray-500">
          <p>プレビューするデータがありません</p>
        </div>
      );
    }
    
    return (
      <div className="h-full flex flex-col">
        <div className="p-2 border-b border-gray-300 dark:border-gray-700 flex justify-between items-center">
          <div className="flex items-center">
            <span className="font-medium mr-2">GUIデザインモード</span>
            <span className="text-sm text-gray-500 ml-2">
              表示モード: {dataDisplayMode === 'flat' ? 'フラット' : '階層構造'}
            </span>
          </div>
          <div className="flex items-center">
            {/* 列の表示設定ボタンを編集ボタンの横に移動 */}
            {((type === 'csv' || type === 'tsv' || type === 'parquet' || 
              type === 'json' || type === 'yaml') && 
              Array.isArray(parsedData) && parsedData.length > 0 && 
              typeof parsedData[0] === 'object' && 
              columns.length > 0) && (
              <button
                className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700 mr-2 flex items-center"
                onClick={() => setShowColumnSelector(!showColumnSelector)}
              >
                <IoOptionsOutline className="inline mr-1" /> 列の表示設定
              </button>
            )}
            <button 
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2"
              onClick={() => {
                // テーブル形式のデータの場合、テーブル編集モードを提供
                if ((type === 'csv' || type === 'tsv' || type === 'parquet' || 
                    type === 'json' || type === 'yaml') && 
                    Array.isArray(parsedData) && parsedData.length > 0 && 
                    typeof parsedData[0] === 'object' && 
                    columns.length > 0) {
                  setIsTableEditing(true);
                  setEditedData([...parsedData]);
                } else {
                  // それ以外はテキスト編集モード
                  setIsEditing(true);
                }
              }}
            >
              編集
            </button>
            <button 
              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 mr-2 ${
                dataDisplayMode === 'nested' ? 'bg-blue-100 dark:bg-blue-900' : ''
              }`}
              onClick={toggleDisplayMode}
              title={dataDisplayMode === 'flat' ? '階層構造モードに切り替え' : 'フラットモードに切り替え'}
            >
              {dataDisplayMode === 'flat' ? <IoLayers size={20} /> : <IoGrid size={20} />}
            </button>
            <button 
              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 mr-2 ${
                paneState.isAnalysisVisible ? 'bg-blue-100 dark:bg-blue-900' : ''
              }`}
              onClick={toggleAnalysisMode}
              title="分析モードに切り替え"
            >
              <IoAnalytics size={20} />
            </button>
            <button
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={toggleViewMode}
              title={viewMode === 'editor' ? 'プレビューモードに切り替え' : 'エディタモードに切り替え'}
            >
              {viewMode === 'editor' ? <IoEye size={20} /> : <IoCodeSlash size={20} />}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {/* CSV、TSV、JSONとYAMLの配列形式のデータはテーブルで表示 */}
          {((type === 'csv' || type === 'tsv' || type === 'parquet' || 
            type === 'json' || type === 'yaml') && 
            Array.isArray(parsedData) && parsedData.length > 0 && 
            typeof parsedData[0] === 'object' && 
            columns.length > 0) ? (
            <div className="p-2">
              <DataTable 
                data={parsedData} 
                columns={columns} 
                isNested={dataDisplayMode === 'nested'}
                showColumnSelector={showColumnSelector}
                onColumnSelectorChange={setShowColumnSelector}
              />
            </div>
          ) : (
            // それ以外はオブジェクトビューアで表示
            <div className="p-2">
              <ObjectViewer 
                data={parsedData} 
                expandByDefault={dataDisplayMode === 'nested'} 
                expandLevel={dataDisplayMode === 'nested' ? 3 : 1}
              />
            </div>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="h-full overflow-hidden bg-white dark:bg-gray-900">
      {renderPreviewWithEditOption()}
    </div>
  );
};

export default DataPreview;
