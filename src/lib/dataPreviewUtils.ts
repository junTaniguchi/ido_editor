import Papa from 'papaparse';
import YAML from 'js-yaml';
import { tableFromArrays, Table } from 'apache-arrow';
import * as XLSX from 'xlsx';
import { load } from '@loaders.gl/core';
import type { LoaderWithParser } from '@loaders.gl/core';
import { WKTLoader } from '@loaders.gl/wkt';
import { feature as topojsonFeature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

const getShapefileLoader = (() => {
  let cachedPromise: Promise<LoaderWithParser | null> | null = null;

  return async (): Promise<LoaderWithParser | null> => {
    if (!cachedPromise) {
      cachedPromise = (async () => {
        const moduleId = '@loaders.gl/' + 'shapefile';
        try {
          const module = await import(moduleId);
          return module?.ShapefileLoader as LoaderWithParser;
        } catch (error) {
          console.warn(
            'Shapefile support is unavailable. Install @loaders.gl/shapefile to enable shapefile previews.'
          );
          console.error(error);
          return null;
        }
      })();
    }

    return cachedPromise;
  };
})();

/**
 * CSVデータをパースする
 * @param content CSVの文字列データ
 * @param delimiter 区切り文字（デフォルトはカンマ）
 */
export const parseCSV = (content: string, delimiter: string = ',') => {
  try {
    // デバッグ情報を追加（最初の数行のみ）
    const sampleLines = content.split('\n').slice(0, 5).join('\n');
    
    // CSVヘッダー行を取得して列名を確認
    const headerLine = content.split('\n')[0];
    
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

  if (!Array.isArray(data) && data !== null && typeof data === 'object') {
    const arrayKeys = Object.keys(data).filter(key => Array.isArray(data[key]));
    if (arrayKeys.length > 0) {
      const firstArrayKey = arrayKeys[0];
      const arrayData = data[firstArrayKey];
      if (Array.isArray(arrayData) && arrayData.length > 0) {
        return flattenNestedObjects(arrayData, firstArrayKey);
      }
    }
  }

  if (!Array.isArray(data) || data.length === 0) {
    return Array.isArray(data) ? data : [];
  }

  const allObjects = data.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));
  if (!allObjects) {
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

  const flattened = data.map(item => {
    const flatItem: Record<string, any> = {};
    Object.entries(item).forEach(([key, value]) => {
      if (value !== null && typeof value === 'object') {
        // 親キー自体もセット（address, certifications など）
        flatItem[key] = value;
        if (Array.isArray(value)) {
          const prefix = parentPrefix ? `${parentPrefix}.${key}` : key;
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
    return flatItem;
  });

  return flattened;
};

const toFeatureCollection = (value: any): FeatureCollection | null => {
  if (!value) {
    return null;
  }

  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    return value as FeatureCollection;
  }

  if (value.type === 'Feature' && value.geometry) {
    return {
      type: 'FeatureCollection',
      features: [value as Feature],
    };
  }

  if (value.type && value.coordinates) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: value as Geometry,
          properties: {},
        },
      ],
    };
  }

  if (Array.isArray(value)) {
    const features: Feature[] = [];
    value.forEach((item) => {
      const collection = toFeatureCollection(item);
      if (collection) {
        features.push(...collection.features);
      } else if (item && typeof item === 'object' && 'type' in item && 'coordinates' in item) {
        features.push({
          type: 'Feature',
          geometry: item as Geometry,
          properties: {},
        });
      }
    });
    if (features.length > 0) {
      return {
        type: 'FeatureCollection',
        features,
      };
    }
  }

  return null;
};

export const flattenGeoJsonFeatures = (featureCollection: FeatureCollection | null) => {
  if (!featureCollection || !Array.isArray(featureCollection.features) || featureCollection.features.length === 0) {
    return {
      rows: [] as any[],
      columns: [] as string[],
    };
  }

  const propertyRecords = featureCollection.features.map((feature) => (
    feature && feature.properties && typeof feature.properties === 'object'
      ? (feature.properties as Record<string, any>)
      : {}
  ));

  const flattenedProperties = propertyRecords.length > 0
    ? flattenNestedObjects(propertyRecords)
    : propertyRecords;

  const rows = featureCollection.features.map((feature, index) => {
    const flattened = flattenedProperties[index] ?? {};
    const row: Record<string, any> = { ...flattened };

    if (feature.id !== undefined && feature.id !== null) {
      row.featureId = feature.id;
    }

    row.geometry = feature.geometry ?? null;

    return row;
  });

  const columnSet = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => columnSet.add(key));
  });

  const columns = Array.from(columnSet);
  if (!columns.includes('geometry')) {
    columns.push('geometry');
  }

  return {
    rows,
    columns,
  };
};

type ParseGeospatialFormat = 'geojson' | 'topojson' | 'wkt' | 'shapefile';

interface ParseGeospatialOptions {
  fileName?: string;
  formatHint?: ParseGeospatialFormat;
}

interface ParseGeospatialResult {
  columns: string[];
  data: any[];
  geoJson: FeatureCollection | null;
  error: string | null;
}

const textFromInput = async (input: string | ArrayBuffer | Blob): Promise<string> => {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof Blob) {
    return await input.text();
  }
  return new TextDecoder().decode(input);
};

const arrayBufferFromInput = async (input: string | ArrayBuffer | Blob): Promise<ArrayBuffer | null> => {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  if (input instanceof Blob) {
    return await input.arrayBuffer();
  }
  if (typeof input === 'string') {
    return new TextEncoder().encode(input).buffer;
  }
  return null;
};

const detectGeospatialFormat = async (
  input: string | ArrayBuffer | Blob,
  options: ParseGeospatialOptions = {},
): Promise<ParseGeospatialFormat> => {
  if (options.formatHint) {
    return options.formatHint;
  }

  const fileName = options.fileName?.toLowerCase();
  if (fileName) {
    if (/(\.shp|\.shpz|\.shz|\.dbf)$/.test(fileName) || (fileName.endsWith('.zip') && fileName.includes('.shp'))) {
      return 'shapefile';
    }
    if (fileName.endsWith('.topojson')) {
      return 'topojson';
    }
    if (fileName.endsWith('.wkt')) {
      return 'wkt';
    }
    if (fileName.endsWith('.geojson')) {
      return 'geojson';
    }
  }

  const text = typeof input === 'string' ? input : await textFromInput(input);
  const trimmed = text.trim();
  if (!trimmed) {
    return 'geojson';
  }

  if (typeof input !== 'string') {
    return 'shapefile';
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        if ((parsed as any).type === 'Topology' || (parsed as any).objects) {
          return 'topojson';
        }
        const asCollection = toFeatureCollection(parsed);
        if (asCollection) {
          return 'geojson';
        }
      }
    } catch {
      // JSONとして解析できない場合は後続で判定
    }
  }

  if (/^(?:SRID=\d+;)?\s*(POINT|LINESTRING|POLYGON|MULTI|GEOMETRYCOLLECTION)/i.test(trimmed)) {
    return 'wkt';
  }

  return 'geojson';
};

export const parseGeospatialData = async (
  input: string | ArrayBuffer | Blob,
  options: ParseGeospatialOptions = {},
): Promise<ParseGeospatialResult> => {
  try {
    const format = await detectGeospatialFormat(input, options);
    let featureCollection: FeatureCollection | null = null;

    switch (format) {
      case 'topojson': {
        const dataInput = typeof input === 'string' ? input : await textFromInput(input);
        let topoSource: any = null;
        try {
          topoSource = JSON.parse(dataInput);
        } catch (parseError) {
          throw new Error('TopoJSONの解析に失敗しました');
        }

        const objectEntries = topoSource && typeof topoSource === 'object' && (topoSource as any).objects
          ? Object.entries((topoSource as any).objects as Record<string, any>)
          : [];

        const features: Feature[] = [];
        if (objectEntries.length > 0) {
          for (const [key, topoObject] of objectEntries) {
            try {
              const result = topojsonFeature(topoSource, topoObject as any);
              if (!result) {
                continue;
              }
              if (result.type === 'FeatureCollection' && Array.isArray(result.features)) {
                features.push(...result.features);
              } else if (result.type === 'Feature') {
                features.push(result as Feature);
              }
            } catch (conversionError) {
              console.warn(`TopoJSONオブジェクト ${key} の変換に失敗しました`, conversionError);
            }
          }
        }

        if (features.length > 0) {
          featureCollection = {
            type: 'FeatureCollection',
            features,
          };
        } else {
          featureCollection = toFeatureCollection(topoSource);
        }
        break;
      }
      case 'wkt': {
        const text = typeof input === 'string' ? input : await textFromInput(input);
        const entries = text
          .split(/\r?\n+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        const features: Feature[] = [];
        if (entries.length === 0) {
          const loaded = await load(text, WKTLoader);
          const collection = toFeatureCollection(loaded);
          if (collection) {
            featureCollection = collection;
            break;
          }
        }
        for (const entry of (entries.length > 0 ? entries : [text])) {
          try {
            const loaded = await load(entry, WKTLoader);
            const collection = toFeatureCollection(loaded);
            if (collection) {
              features.push(...collection.features);
              continue;
            }
          } catch {
            // フォールバックで後続処理
          }
          try {
            // wellknown互換のフォールバック
            const wellknownModule = await import('wellknown');
            const geometry = wellknownModule.parse(entry) as Geometry | null;
            if (geometry) {
              features.push({
                type: 'Feature',
                geometry,
                properties: {},
              });
            }
          } catch {
            // 無効な行はスキップ
          }
        }
        if (features.length > 0) {
          featureCollection = {
            type: 'FeatureCollection',
            features,
          };
        }
        break;
      }
      case 'shapefile': {
        const buffer = await arrayBufferFromInput(input);
        if (!buffer) {
          throw new Error('Shapefileのバイナリデータを読み込めませんでした');
        }

        const shapefileLoader = await getShapefileLoader();
        if (!shapefileLoader) {
          throw new Error('Shapefileサポートが有効になっていません。@loaders.gl/shapefile をインストールしてください。');
        }

        let loaded: any = null;
        try {
          loaded = await load(buffer, shapefileLoader);
        } catch (shapeError) {
          console.error('ShapefileLoaderの解析に失敗しました:', shapeError);
          throw new Error('Shapefileの解析に失敗しました');
        }

        const collection = toFeatureCollection(loaded);
        if (!collection) {
          throw new Error('ShapefileからGeoJSONを生成できませんでした');
        }
        featureCollection = collection;
        break;
      }
      case 'geojson':
      default: {
        const text = typeof input === 'string' ? input : await textFromInput(input);
        try {
          const parsed = JSON.parse(text);
          featureCollection = toFeatureCollection(parsed);
        } catch {
          featureCollection = null;
        }
        break;
      }
    }

    if (!featureCollection) {
      return {
        columns: [],
        data: [],
        geoJson: null,
        error: 'GeoJSONフィーチャの解析に失敗しました',
      };
    }

    const flattened = flattenGeoJsonFeatures(featureCollection);
    return {
      columns: flattened.columns,
      data: flattened.rows,
      geoJson: featureCollection,
      error: null,
    };
  } catch (error) {
    console.error('Error parsing geospatial data:', error);
    return {
      columns: [],
      data: [],
      geoJson: null,
      error: error instanceof Error ? error.message : '地理空間データの解析に失敗しました',
    };
  }
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
 * Parquetデータをパースする
 * @param content Parquetの文字列データ（実際はバイナリデータ）
 */
export const parseParquet = async (content: string): Promise<{
  table: Table | null;
  headers: string[];
  rows: any[][];
  error: string | null;
}> => {
  try {
    // バイナリデータかテキストデータかを判定
    const isBinary = content.includes('\0') || content.includes('PAR1');
    
    if (isBinary) {
      // 実際のParquetバイナリファイルの場合
      try {
        // バイナリデータをUint8Arrayに変換
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(content);
        
        // Apache Arrowでの解析を試行
        // 注: 完全なParquet対応にはparquetjs等の専用ライブラリが必要
        // 現時点では基本的なサポートのみ
        
        return {
          table: null,
          headers: [],
          rows: [],
          error: 'バイナリParquetファイルの完全サポートには専用ライブラリが必要です。CSVまたはJSONでエクスポートしてください。'
        };
      } catch (binaryError) {
        console.error('Binary Parquet parsing error:', binaryError);
        return {
          table: null,
          headers: [],
          rows: [],
          error: 'バイナリParquetファイルの解析に失敗しました'
        };
      }
    } else {
      // テキストベースのParquet風データ（CSV形式など）の場合
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
        return values.slice(0, headers.length).map(val => {
          // 数値変換を試行
          const trimmed = val.trim();
          if (/^-?\d*\.?\d+$/.test(trimmed)) {
            const num = parseFloat(trimmed);
            if (!isNaN(num)) return num;
          }
          return trimmed;
        });
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
    const trimmed = content.trim();

    if (!trimmed) {
      return {
        data: {
          diagram: content,
          type: 'flowchart',
          metadata: {
            lines: 0,
            type: 'flowchart',
            preview: '',
          },
          valid: true,
        },
        error: null,
        valid: true,
      };
    }

    const lines = trimmed.split('\n');

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
    case 'xlsx':
    case 'xls':
      return 'excel';
    default:
      return 'text';
  }
};

// Excel関連のインターフェース
export interface ExcelSheetInfo {
  name: string;
  range: string;
  rowCount: number;
  colCount: number;
}

export interface ExcelParseOptions {
  sheetName?: string;
  startRow?: number;
  startCol?: number;
  endRow?: number;
  endCol?: number;
  hasHeader?: boolean;
}

/**
 * Excelファイルからシート情報を取得する
 * @param buffer ファイルのArrayBuffer
 */
export const getExcelSheets = (buffer: ArrayBuffer): ExcelSheetInfo[] => {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    return workbook.SheetNames.map(name => {
      const worksheet = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      
      return {
        name,
        range: worksheet['!ref'] || 'A1:A1',
        rowCount: range.e.r - range.s.r + 1,
        colCount: range.e.c - range.s.c + 1
      };
    });
  } catch (error) {
    console.error('Excel sheet information extraction failed:', error);
    return [];
  }
};

/**
 * Excelファイルのシートからデータを読み取る
 * @param buffer ファイルのArrayBuffer
 * @param options パース設定
 */
export const parseExcel = (buffer: ArrayBuffer, options: ExcelParseOptions = {}) => {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    // シート選択（デフォルトは最初のシート）
    const sheetName = options.sheetName || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      throw new Error(`シート '${sheetName}' が見つかりません`);
    }
    
    // 範囲の調整
    let range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    
    if (options.startRow !== undefined) {
      range.s.r = Math.max(0, options.startRow - 1); // 1-based to 0-based
    }
    if (options.startCol !== undefined) {
      range.s.c = Math.max(0, options.startCol - 1); // 1-based to 0-based
    }
    if (options.endRow !== undefined) {
      range.e.r = Math.min(range.e.r, options.endRow - 1); // 1-based to 0-based
    }
    if (options.endCol !== undefined) {
      range.e.c = Math.min(range.e.c, options.endCol - 1); // 1-based to 0-based
    }
    
    // 調整した範囲でデータを取得
    const adjustedRef = XLSX.utils.encode_range(range);
    
    // ヘッダー設定に応じてデータを取得
    let data;
    if (options.hasHeader !== false) {
      // ヘッダーありの場合：最初の行をヘッダーとして使用
      data = XLSX.utils.sheet_to_json(worksheet, {
        range: adjustedRef,
        defval: null // 空のセルはnullに
      });
    } else {
      // ヘッダーなしの場合：数値インデックスを使用
      data = XLSX.utils.sheet_to_json(worksheet, {
        range: adjustedRef,
        header: 1,
        defval: null // 空のセルはnullに
      });
    }
    
    console.log('Excel解析完了:', {
      シート名: sheetName,
      データ範囲: adjustedRef,
      行数: data.length,
      ヘッダー有無: options.hasHeader !== false,
      サンプルデータ: data.slice(0, 2)
    });
    
    return data;
  } catch (error) {
    console.error('Excel parsing failed:', error);
    throw error;
  }
};

/**
 * Excelファイルのプレビュー用データを取得する（最初のシートの最初の100行）
 * @param buffer ファイルのArrayBuffer
 */
export const previewExcel = (buffer: ArrayBuffer) => {
  try {
    const sheets = getExcelSheets(buffer);
    if (sheets.length === 0) {
      throw new Error('有効なシートが見つかりません');
    }
    
    // 最初のシートから最大100行のデータを取得
    const previewData = parseExcel(buffer, {
      sheetName: sheets[0].name,
      endRow: Math.min(100, sheets[0].rowCount)
    });
    
    return {
      sheets,
      previewData,
      currentSheet: sheets[0].name
    };
  } catch (error) {
    console.error('Excel preview failed:', error);
    throw error;
  }
};
