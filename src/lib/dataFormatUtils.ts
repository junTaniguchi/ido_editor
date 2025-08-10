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

// ParquetはバイナリデータをArrayBufferで受け取る想定
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
'use client';

import { stringify as csvStringify } from 'csv-stringify/browser/esm/sync';
import yaml from 'js-yaml';

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
