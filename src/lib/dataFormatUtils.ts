'use client';

import { stringify as csvStringify } from 'csv-stringify/browser/esm/sync';
import yaml from 'js-yaml';

// 配列データをマークダウン表に変換
export function arrayToMarkdownTable(data: any[][]): string {
  if (!data || !data.length) return '';
  const header = data[0];
  const body = data.slice(1);
  const headerLine = `| ${header.map(String).join(' | ')} |`;
  const separatorLine = `|${header.map(() => '---').join('|')}|`;
  const bodyLines = body.map(row => `| ${row.map(String).join(' | ')} |`);
  return [headerLine, separatorLine, ...bodyLines].join('\n');
}
import Papa from 'papaparse';

export function csvToMarkdownTable(csv: string): string {
  const { data } = Papa.parse(csv.trim(), { skipEmptyLines: true });
  return arrayToMarkdownTable(data as string[][]);
}

export function tsvToMarkdownTable(tsv: string): string {
  const { data } = Papa.parse(tsv.trim(), { delimiter: '\t', skipEmptyLines: true });
  return arrayToMarkdownTable(data as string[][]);
}

export function jsonToMarkdownTable(json: string): string {
  let arr;
  try {
    arr = JSON.parse(json);
  } catch {
    return 'JSONパースエラー';
  }
  if (!Array.isArray(arr)) arr = [arr];
  const columns = Object.keys(arr[0] || {});
  const rows = arr.map(obj => columns.map(col => obj[col] ?? ''));
  return arrayToMarkdownTable([columns, ...rows]);
}

export function yamlToMarkdownTable(yamlStr: string): string {
  let arr;
  try {
    arr = yaml.load(yamlStr);
  } catch {
    return 'YAMLパースエラー';
  }
  if (!Array.isArray(arr)) arr = [arr];
  const columns = Object.keys(arr[0] || {});
  const rows = arr.map(obj => columns.map(col => obj[col] ?? ''));
  return arrayToMarkdownTable([columns, ...rows]);
}

/**
 * CSVエクスポート設定
 */
export interface CSVExportOptions {
  /** ヘッダー行を含めるかどうか */
  includeHeaders: boolean;
  /** 区切り文字 */
  delimiter: ',' | '\t' | ';' | '|';
  /** クォート文字 */
  quote: '"' | "'" | '';
  /** クォートルール */
  quoteRule: 'all' | 'minimal' | 'nonnumeric' | 'none';
  /** NULL値の表現 */
  nullValue: '' | 'NULL' | 'null' | '\\N';
  /** 空文字の表現 */
  emptyValue: '' | '""' | "''";
  /** エンコーディング */
  encoding: 'utf-8' | 'shift-jis';
  /** 改行コード */
  lineBreak: '\n' | '\r\n' | '\r';
}

/**
 * デフォルトCSVエクスポート設定
 */
export const defaultCSVOptions: CSVExportOptions = {
  includeHeaders: true,
  delimiter: ',',
  quote: '"',
  quoteRule: 'minimal',
  nullValue: '',
  emptyValue: '',
  encoding: 'utf-8',
  lineBreak: '\n'
};

/**
 * TSVエクスポート設定
 */
export interface TSVExportOptions {
  /** ヘッダー行を含めるかどうか */
  includeHeaders: boolean;
  /** NULL値の表現 */
  nullValue: '' | 'NULL' | 'null' | '\\N';
  /** エンコーディング */
  encoding: 'utf-8' | 'shift-jis';
  /** 改行コード */
  lineBreak: '\n' | '\r\n' | '\r';
}

/**
 * デフォルトTSVエクスポート設定
 */
export const defaultTSVOptions: TSVExportOptions = {
  includeHeaders: true,
  nullValue: '',
  encoding: 'utf-8',
  lineBreak: '\n'
};

/**
 * JSONエクスポート設定
 */
export interface JSONExportOptions {
  /** インデント */
  indent: 0 | 2 | 4;
  /** 配列として出力するか、オブジェクトとして出力するか */
  arrayFormat: boolean;
  /** エンコーディング */
  encoding: 'utf-8' | 'shift-jis';
}

/**
 * デフォルトJSONエクスポート設定
 */
export const defaultJSONOptions: JSONExportOptions = {
  indent: 2,
  arrayFormat: true,
  encoding: 'utf-8'
};

/**
 * YAMLエクスポート設定
 */
export interface YAMLExportOptions {
  /** インデント */
  indent: 2 | 4;
  /** 配列として出力するか、オブジェクトとして出力するか */
  arrayFormat: boolean;
  /** エンコーディング */
  encoding: 'utf-8' | 'shift-jis';
}

/**
 * デフォルトYAMLエクスポート設定
 */
export const defaultYAMLOptions: YAMLExportOptions = {
  indent: 2,
  arrayFormat: true,
  encoding: 'utf-8'
};

/**
 * Parquetエクスポート設定
 */
export interface ParquetExportOptions {
  /** エンコーディング */
  encoding: 'utf-8';
  /** 圧縮レベル */
  compression: 'none' | 'snappy' | 'gzip';
}

/**
 * デフォルトParquetエクスポート設定
 */
export const defaultParquetOptions: ParquetExportOptions = {
  encoding: 'utf-8',
  compression: 'snappy'
};

/**
 * 値がクォートが必要かどうかを判定
 */
function needsQuote(value: string, delimiter: string, quote: string, quoteRule: string): boolean {
  if (quoteRule === 'all') return true;
  if (quoteRule === 'none') return false;
  if (quoteRule === 'nonnumeric' && isNaN(Number(value))) return true;
  
  // minimal: 区切り文字、クォート文字、改行コードが含まれている場合
  return value.includes(delimiter) || 
         value.includes(quote) || 
         value.includes('\n') || 
         value.includes('\r');
}

/**
 * CSVフォーマットでデータを出力
 */
export function exportToCSV(data: any[], options: CSVExportOptions = defaultCSVOptions): string {
  if (!data || data.length === 0) return '';

  const lines: string[] = [];
  const headers = Object.keys(data[0]);

  // ヘッダー行
  if (options.includeHeaders) {
    const headerLine = headers.map(header => {
      let value = header;
      if (options.quote && needsQuote(value, options.delimiter, options.quote, options.quoteRule)) {
        value = options.quote + value.replace(new RegExp(options.quote, 'g'), options.quote + options.quote) + options.quote;
      }
      return value;
    }).join(options.delimiter);
    lines.push(headerLine);
  }

  // データ行
  data.forEach(row => {
    const values = headers.map(header => {
      let value = row[header];
      
      // NULL値の処理
      if (value === null || value === undefined) {
        return options.nullValue;
      }
      
      // 空文字の処理
      if (value === '') {
        return options.emptyValue;
      }
      
      // 文字列に変換
      value = String(value);
      
      // クォートの処理
      if (options.quote && needsQuote(value, options.delimiter, options.quote, options.quoteRule)) {
        value = options.quote + value.replace(new RegExp(options.quote, 'g'), options.quote + options.quote) + options.quote;
      }
      
      return value;
    });
    lines.push(values.join(options.delimiter));
  });

  return lines.join(options.lineBreak);
}

/**
 * TSVフォーマットでデータを出力
 */
export function exportToTSV(data: any[], options: TSVExportOptions = defaultTSVOptions): string {
  if (!data || data.length === 0) return '';

  const lines: string[] = [];
  const headers = Object.keys(data[0]);

  // ヘッダー行
  if (options.includeHeaders) {
    lines.push(headers.join('\t'));
  }

  // データ行
  data.forEach(row => {
    const values = headers.map(header => {
      let value = row[header];
      
      // NULL値の処理
      if (value === null || value === undefined) {
        return options.nullValue;
      }
      
      // 文字列に変換してタブと改行をエスケープ
      value = String(value).replace(/\t/g, '    ').replace(/\n/g, ' ').replace(/\r/g, '');
      
      return value;
    });
    lines.push(values.join('\t'));
  });

  return lines.join(options.lineBreak);
}

/**
 * JSONフォーマットでデータを出力
 */
export function exportToJSON(data: any[], options: JSONExportOptions = defaultJSONOptions): string {
  if (!data || data.length === 0) return '[]';

  const output = options.arrayFormat ? data : (data.length === 1 ? data[0] : data);
  
  if (options.indent === 0) {
    return JSON.stringify(output);
  } else {
    return JSON.stringify(output, null, options.indent);
  }
}

/**
 * YAMLフォーマットでデータを出力
 */
export function exportToYAML(data: any[], options: YAMLExportOptions = defaultYAMLOptions): string {
  if (!data || data.length === 0) return '[]';

  const output = options.arrayFormat ? data : (data.length === 1 ? data[0] : data);
  
  return yaml.dump(output, {
    indent: options.indent,
    lineWidth: -1,
    noRefs: true
  });
}

/**
 * Parquetフォーマットでデータを出力（簡易版）
 * 注: 実際のParquet出力には専用ライブラリが必要
 */
export function exportToParquet(data: any[], options: ParquetExportOptions = defaultParquetOptions): string {
  // 簡易的にCSV形式で出力（実際のParquet実装は複雑）
  const csvOptions: CSVExportOptions = {
    includeHeaders: true,
    delimiter: ',',
    quote: '"',
    quoteRule: 'minimal',
    nullValue: '',
    emptyValue: '',
    encoding: options.encoding,
    lineBreak: '\n'
  };
  
  return exportToCSV(data, csvOptions);
}

/**
 * エンコーディングを適用してBlobを作成
 */
export function createEncodedBlob(content: string, encoding: 'utf-8' | 'shift-jis', mimeType: string): Blob {
  if (encoding === 'shift-jis') {
    // Shift-JISエンコーディング（簡易実装）
    // 実際のShift-JIS変換には専用ライブラリが必要
    const uint8Array = new TextEncoder().encode(content);
    return new Blob([uint8Array], { type: mimeType + ';charset=shift-jis' });
  } else {
    // UTF-8エンコーディング
    return new Blob([content], { type: mimeType + ';charset=utf-8' });
  }
}

/**
 * ファイルダウンロード実行
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
// import { ParquetReader } from 'parquetjs-lite';
// export async function parquetToMarkdownTable(buffer: ArrayBuffer): Promise<string> {
//   const reader = await ParquetReader.openBuffer(buffer);
//   const cursor = reader.getCursor();
//   const rows = [];
//   let row;
//   while (row = await cursor.next()) rows.push(row);
//   await reader.close();
//   const columns = Object.keys(rows[0] || {});
//   const dataRows = rows.map(obj => columns.map(col => obj[col] ?? ''));
//   return arrayToMarkdownTable([columns, ...dataRows]);
// }

/**
 * JSONデータを文字列に変換する
 * @param data JSON形式のデータ
 * @param pretty 整形するかどうか
 * @returns JSON文字列
 */
export const formatToJSON = (data: any, pretty: boolean = true): string => {
  try {
    return pretty 
      ? JSON.stringify(data, null, 2) 
      : JSON.stringify(data);
  } catch (error) {
    console.error('Error formatting to JSON:', error);
    return JSON.stringify({ error: 'JSONフォーマットエラー' });
  }
};

/**
 * データをYAML形式の文字列に変換する
 * @param data 変換するデータ
 * @returns YAML文字列
 */
export const formatToYAML = (data: any): string => {
  try {
    return yaml.dump(data, {
      indent: 2,
      lineWidth: -1,
      sortKeys: false,
    });
  } catch (error) {
    console.error('Error formatting to YAML:', error);
    return yaml.dump({ error: 'YAMLフォーマットエラー' });
  }
};

/**
 * データをCSV形式の文字列に変換する
 * @param data 変換するデータ配列
 * @param delimiter 区切り文字（デフォルトはカンマ）
 * @returns CSV文字列
 */
export const formatToCSV = (data: any[], delimiter: string = ','): string => {
  try {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }
    
    // ヘッダーを取得
    const headers = Object.keys(data[0]);
    
    // データを準備
    const rows = data.map(item => {
      return headers.map(header => {
        const value = item[header];
        if (value === null || value === undefined) {
          return '';
        } else if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return value;
      });
    });
    
    // CSV文字列を生成
    return csvStringify([headers, ...rows], {
      delimiter,
    });
  } catch (error) {
    console.error('Error formatting to CSV:', error);
    return 'CSVフォーマットエラー';
  }
};

/**
 * 特定のファイル形式に基づいてデータをフォーマットする
 * @param data フォーマットするデータ
 * @param fileType ファイル形式（json, yaml, csv, tsv）
 * @returns フォーマットされた文字列
 */
export const formatData = (
  data: any, 
  fileType: 'json' | 'yaml' | 'csv' | 'tsv' | 'parquet' | string
): string => {
  switch (fileType) {
    case 'json':
      return formatToJSON(data);
      
    case 'yaml':
      return formatToYAML(data);
      
    case 'csv':
      return formatToCSV(data);
      
    case 'tsv':
      return formatToCSV(data, '\t');
      
    case 'parquet':
      // Parquetは現在クライアントサイドでのフォーマットに対応していないため、JSONを返す
      return formatToJSON(data);
      
    default:
      return formatToJSON(data);
  }
};
