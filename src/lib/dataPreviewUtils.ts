import Papa from 'papaparse';
import YAML from 'js-yaml';
import { tableFromArrays, Table } from 'apache-arrow';

/**
 * CSVデータをパースする
 * @param content CSVの文字列データ
 * @param delimiter 区切り文字（デフォルトはカンマ）
 */
export const parseCSV = (content: string, delimiter: string = ',') => {
  try {
    // デバッグ情報を追加（最初の数行のみ）
    const sampleLines = content.split('\n').slice(0, 5).join('\n');
    console.log('CSV解析デバッグ - 入力データサンプル:', sampleLines);
    
    // CSVヘッダー行を取得して列名を確認
    const headerLine = content.split('\n')[0];
    console.log('CSV解析デバッグ - ヘッダー行:', headerLine);
    
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      delimiter,
      dynamicTyping: true, // 自動的に数値や真偽値に変換
      // 空の値は undefined として扱い、0 に変換しないようにする
      transformHeader: (header) => header.trim(),
      transform: (value, field) => {
        // デバッグ用に変換前の値を記録
        if (field === 'sepal_length' || field === 'sepal_width' || field === 'petal_length' || field === 'petal_width') {
          console.log(`CSV解析デバッグ - 列[${field}]の値変換:`, { 変換前: value, 型: typeof value });
        }
        
        if (value === '') return null; // 空文字列は null に変換
        
        // 数値らしき文字列は明示的に数値に変換（PapaParseのdynamicTypingを補完）
        if (typeof value === 'string' && /^-?\d*\.?\d+$/.test(value.trim())) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            return numValue;
          }
        }
        
        return value; // その他の値はそのまま
      }
    });
    
    // 解析結果のサンプルをログに出力
    if (result.data && result.data.length > 0) {
      const firstRow = result.data[0] as Record<string, unknown>;
      console.log('CSV解析デバッグ - 解析結果サンプル:', {
        最初の行: firstRow,
        カラム: result.meta.fields,
        データの型: Object.entries(firstRow).map(([key, value]) => ({
          列名: key,
          値: value,
          型: typeof value
        }))
      });
    }
    
    return {
      columns: result.meta.fields || [],
      data: result.data,
      error: null
    };
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return {
      columns: [],
      data: [],
      error: error instanceof Error ? error.message : 'CSV解析エラー'
    };
  }
};

/**
 * JSONデータをパースする
 * @param content JSONの文字列データ
 */
export const parseJSON = (content: string) => {
  try {
    const data = JSON.parse(content);
    return { data, error: null };
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : 'JSON解析エラー'
    };
  }
};

/**
 * ネストされたオブジェクトをフラット化する
 * @param data オブジェクトまたは配列
 * @param parentKey 親キー（階層表現用）
 * @returns フラット化されたオブジェクト配列
 */
export const flattenNestedObjects = (data: any, parentPrefix: string = ''): any[] => {
  // デバッグ: 入力データの型と内容
  console.log('[flattenNestedObjects] 入力:', { data, parentPrefix });

  if (!Array.isArray(data) && data !== null && typeof data === 'object') {
    const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
    console.log('[flattenNestedObjects] トップレベルがオブジェクト、配列キー:', arrayKeys);
    if (arrayKeys.length > 0) {
      const firstArrayKey = arrayKeys[0];
      const arrayData = data[firstArrayKey];
      console.log('[flattenNestedObjects] 配列データ:', { firstArrayKey, arrayData });
      if (Array.isArray(arrayData) && arrayData.length > 0) {
        return flattenNestedObjects(arrayData, firstArrayKey);
      }
    }
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.log('[flattenNestedObjects] 配列でない、または空:', data);
    return Array.isArray(data) ? data : [];
  }

  const allObjects = data.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));
  console.log('[flattenNestedObjects] 配列内がすべてオブジェクトか:', allObjects);
  if (!allObjects) {
    console.log('[flattenNestedObjects] 配列内にオブジェクト以外が含まれる:', data);
    return data;
  }

  const nestedProperties = new Map<string, boolean>();
  data.forEach(item => {
    if (item !== null && typeof item === 'object') {
      Object.entries(item).forEach(([key, value]) => {
        if (value !== null && typeof value === 'object') {
          nestedProperties.set(key, true);
        }
      });
    }
  });
  console.log('[flattenNestedObjects] ネストプロパティ:', Array.from(nestedProperties.keys()));

  const flattened = data.map(item => {
    const flatItem: Record<string, any> = {};
    Object.entries(item).forEach(([key, value]) => {
      if (value !== null && typeof value === 'object') {
        // 親キー自体もセット（address, certifications など）
        flatItem[key] = value;
        if (Array.isArray(value)) {
          const prefix = parentPrefix ? `${parentPrefix}.${key}` : key;
          console.log(`[flattenNestedObjects] 配列プロパティ: ${prefix}`, value);
          if (value.length === 0) {
            flatItem[prefix] = [];
          } else if (typeof value[0] === 'object' && !Array.isArray(value[0])) {
            // 各要素ごとに全てのキーを展開
            value.forEach((nestedItem, index) => {
              if (nestedItem && typeof nestedItem === 'object') {
                // certifications[0] などのキーでオブジェクト自体もセット
                flatItem[`${prefix}[${index}]`] = nestedItem;
                Object.entries(nestedItem).forEach(([nestedKey, nestedValue]) => {
                  flatItem[`${prefix}[${index}].${nestedKey}`] = nestedValue;
                });
              } else {
                // プリミティブ値の場合
                flatItem[`${prefix}[${index}]`] = nestedItem;
              }
            });
          } else {
            value.forEach((val, index) => {
              flatItem[`${prefix}[${index}]`] = val;
            });
          }
        } else if (typeof value === 'object') {
          const prefix = parentPrefix ? `${parentPrefix}.${key}` : key;
          console.log(`[flattenNestedObjects] オブジェクトプロパティ: ${prefix}`, value);
          if (Object.keys(value).length === 0) {
            flatItem[prefix] = {};
          } else {
            Object.entries(value).forEach(([nestedKey, nestedValue]) => {
              flatItem[`${prefix}.${nestedKey}`] = nestedValue;
            });
          }
        }
      } else if (value === null) {
        flatItem[key] = '';
      } else {
        flatItem[key] = value;
      }
    });
    console.log('[flattenNestedObjects] フラット化結果:', flatItem);
    return flatItem;
  });

  console.log('[flattenNestedObjects] 全フラット化結果:', flattened);
  return flattened;
};

/**
 * YAMLデータをパースする
 * @param content YAMLの文字列データ
 */
export const parseYAML = (content: string) => {
  try {
    const data = YAML.load(content);
    return { data, error: null };
  } catch (error) {
    console.error('Error parsing YAML:', error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : 'YAML解析エラー'
    };
  }
};

/**
 * Parquetデータをパースする (ブラウザではサポート制限あり)
 * @param content Parquetの文字列データ（実際はバイナリデータ）
 */
export const parseParquet = async (content: string): Promise<{
  table: Table | null;
  headers: string[];
  rows: any[][];
  error: string | null;
}> => {
  try {
    // ブラウザでのParquet解析は複雑なため、簡易的な対応として
    // CSVのようにテキストベースで処理する
    // 注: 実際のParquetファイルはバイナリなので、本来はapache-arrowを使用してバイナリ解析が必要
    
    // 行に分割し、先頭行をヘッダーとして扱う（簡易的処理）
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      return {
        table: null,
        headers: [],
        rows: [],
        error: 'データが空です'
      };
    }
    
    // 1行目をヘッダーとして扱う
    const headers = lines[0].split(/[,\t]/).map(h => h.trim());
    
    // 2行目以降をデータとして扱う
    const rows = lines.slice(1).map(line => {
      const values = line.split(/[,\t]/);
      // ヘッダー数に合わせて配列の長さを調整
      while (values.length < headers.length) {
        values.push('');
      }
      return values.slice(0, headers.length);
    });
    
    // Apache Arrowのテーブルに変換
    try {
      const table = tableFromArrays({
        columns: headers.map((h, i) => {
          const columnData = rows.map(r => r[i] || '');
          return { name: h, data: columnData };
        })
      });
      
      return {
        table,
        headers,
        rows,
        error: null
      };
    } catch (arrowError) {
      console.error('Arrow table creation error:', arrowError);
      // テーブル作成に失敗してもヘッダーとデータは返す
      return {
        table: null,
        headers,
        rows,
        error: null
      };
    }
  } catch (error) {
    console.error('Error parsing Parquet:', error);
    return { 
      table: null,
      headers: [],
      rows: [],
      error: error instanceof Error ? error.message : 'Parquetファイル解析エラー'
    };
  }
};

/**
 * CSVデータをパースする
 * @param content CSVの文字列データ
 * @param delimiter 区切り文字（デフォルトはカンマ）
 */
export const convertDataToCSV = (data: any[]) => {
  if (!data || data.length === 0) return '';

  // ヘッダー行の作成
  const headers = Object.keys(data[0]);
  const headerRow = headers.join(',');

  // データ行の作成
  const rows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // 文字列の場合はダブルクォートでエスケープ
      if (typeof value === 'string') {
        // カンマやダブルクォートを含む場合は、ダブルクォートでエスケープ
        return `"${value.replace(/"/g, '""')}"`;
      }
      // null や undefined は空文字に
      if (value === null || value === undefined) {
        return '';
      }
      return String(value);
    }).join(',');
  });

  // ヘッダーとデータ行を結合
  return [headerRow, ...rows].join('\n');
};

/**
 * データをTSV形式に変換する
 * @param data データオブジェクトの配列
 * @returns TSV形式の文字列
 */
export const convertDataToTSV = (data: any[]) => {
  if (!data || data.length === 0) return '';

  // ヘッダー行の作成
  const headers = Object.keys(data[0]);
  const headerRow = headers.join('\t');

  // データ行の作成
  const rows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // 文字列の場合は必要に応じてエスケープ
      if (typeof value === 'string') {
        // タブを含む場合は、ダブルクォートでエスケープ
        if (value.includes('\t')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }
      // null や undefined は空文字に
      if (value === null || value === undefined) {
        return '';
      }
      return String(value);
    }).join('\t');
  });

  // ヘッダーとデータ行を結合
  return [headerRow, ...rows].join('\n');
};

/**
 * データをJSON形式に変換する
 * @param data データオブジェクトの配列
 * @returns JSON形式の文字列
 */
export const convertDataToJSON = (data: any[]) => {
  if (!data || data.length === 0) return '[]';
  return JSON.stringify(data, null, 2);
};

/**
 * データをYAML形式に変換する
 * @param data データオブジェクトの配列
 * @returns YAML形式の文字列
 */
export const convertDataToYAML = (data: any[]) => {
  if (!data || data.length === 0) return '';
  // データを変換してYAML形式で出力
  return `# データエクスポート\n${YAML.dump(data)}`;
};

/**
 * データをParquet形式に変換する
 * @param data データオブジェクトの配列
 * @returns Parquet形式の文字列（仮実装）
 */
export const convertDataToParquet = (data: any[]) => {
  // ブラウザでParquetを直接生成するのは複雑なため、この関数は簡易的な実装
  // 実際の実装では、Apache Arrowなどのライブラリを使用することが推奨される
  return convertDataToCSV(data); // 現状はCSVとして出力
};

/**
 * データを指定された形式に変換する
 * @param data データオブジェクトの配列
 * @param format 出力形式 ('csv'|'tsv'|'json'|'yaml'|'parquet')
 * @returns 変換された文字列
 */
export const convertDataToFormat = (data: any[], format: 'csv'|'tsv'|'json'|'yaml'|'parquet') => {
  if (!data || data.length === 0) return '';

  switch (format) {
    case 'csv':
      return convertDataToCSV(data);
    case 'tsv':
      return convertDataToTSV(data);
    case 'json':
      return convertDataToJSON(data);
    case 'yaml':
      return convertDataToYAML(data);
    case 'parquet':
      return convertDataToParquet(data);
    default:
      return convertDataToCSV(data);
  }
};

/**
 * データをダウンロードする
 * @param data ダウンロードするデータ
 * @param filename ファイル名
 * @param format ファイル形式
 */
export const downloadData = (data: any[], filename: string, format: 'csv'|'tsv'|'json'|'yaml'|'parquet') => {
  // データが空の場合は何もしない
  if (!data || data.length === 0) return;

  // データを指定された形式に変換
  const content = convertDataToFormat(data, format);
  
  // MIMEタイプを決定
  let mimeType = 'text/plain';
  switch (format) {
    case 'csv':
      mimeType = 'text/csv';
      break;
    case 'tsv':
      mimeType = 'text/tab-separated-values';
      break;
    case 'json':
      mimeType = 'application/json';
      break;
    case 'yaml':
      mimeType = 'application/x-yaml';
      break;
    case 'parquet':
      mimeType = 'application/octet-stream';
      break;
  }

  // ファイル名に拡張子を追加
  const extension = format === 'yaml' ? 'yml' : format;
  const fullFilename = filename.endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;

  // ダウンロードリンクを作成
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fullFilename;
  
  // リンクをクリックしてダウンロード開始
  document.body.appendChild(link);
  link.click();
  
  // クリーンアップ
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
};

/**
 * Mermaid図式をパースする
 * @param content Mermaidの文字列データ
 */
export const parseMermaid = (content: string) => {
  try {
    // Mermaidはテキスト形式なので、基本的なバリデーションのみ行う
    const lines = content.trim().split('\n');
    
    // 空のファイルかチェック
    if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
      return { 
        data: { diagram: content, type: 'unknown', valid: false },
        error: '空のMermaidファイルです', 
        valid: false 
      };
    }
    
    // 一般的なMermaid図式タイプを検出
    const firstLine = lines[0].trim().toLowerCase();
    let diagramType = 'unknown';
    
    if (firstLine.startsWith('graph ') || firstLine.startsWith('flowchart ')) {
      diagramType = 'flowchart';
    } else if (firstLine.startsWith('sequencediagram')) {
      diagramType = 'sequence';
    } else if (firstLine.startsWith('classdiagram')) {
      diagramType = 'class';
    } else if (firstLine.startsWith('statediagram')) {
      diagramType = 'state';
    } else if (firstLine.startsWith('erdiagram')) {
      diagramType = 'er';
    } else if (firstLine.startsWith('gantt')) {
      diagramType = 'gantt';
    } else if (firstLine.startsWith('pie')) {
      diagramType = 'pie';
    }
    
    // メタデータを収集
    const metadata = {
      lines: lines.length,
      type: diagramType,
      preview: lines.slice(0, Math.min(5, lines.length)).join('\n') + (lines.length > 5 ? '...' : '')
    };
    
    return { 
      data: { 
        diagram: content, 
        type: diagramType,
        metadata,
        valid: true 
      }, 
      error: null,
      valid: true
    };
  } catch (error) {
    console.error('Error parsing Mermaid file:', error);
    return { 
      data: { diagram: content, type: 'unknown', valid: false },
      error: error instanceof Error ? error.message : 'Mermaid図式の解析に失敗しました',
      valid: false 
    };
  }
};

/**
 * ファイルの拡張子からファイルタイプを判定する
 * @param fileName ファイル名
 */
export const getFileType = (fileName: string): 'text' | 'markdown' | 'html' | 'json' | 'yaml' | 'sql' | 'csv' | 'tsv' | 'parquet' | 'mermaid' => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  switch (extension) {
    case 'md':
      return 'markdown';
    case 'html':
    case 'htm':
      return 'html';
    case 'json':
      return 'json';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sql':
      return 'sql';
    case 'csv':
      return 'csv';
    case 'tsv':
      return 'tsv';
    case 'parquet':
      return 'parquet';
    case 'mmd':
      return 'mermaid';
    default:
      return 'text';
  }
};
