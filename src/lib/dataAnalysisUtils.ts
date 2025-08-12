'use client';

import { jStat } from 'jstat';

// alasqlの代わりに簡単なSQL風クエリ処理を実装
const executeSimpleQuery = (data: any[], query: string) => {
  // 基本的なSELECT文のパースと実行
  const normalizedQuery = query.trim().toLowerCase();
  
  if (normalizedQuery.startsWith('select')) {
    // シンプルなSELECT ALL実装
    if (normalizedQuery.includes('select *') || normalizedQuery === 'select') {
      return data;
    }
    
    // 特定の列を選択する場合の簡易実装
    const selectMatch = normalizedQuery.match(/select\s+(.+?)(?:\s+from|$)/);
    if (selectMatch) {
      const columns = selectMatch[1].split(',').map(col => col.trim());
      return data.map(row => {
        const filteredRow: any = {};
        columns.forEach(col => {
          if (col !== '*' && row.hasOwnProperty(col)) {
            filteredRow[col] = row[col];
          }
        });
        return Object.keys(filteredRow).length > 0 ? filteredRow : row;
      });
    }
  }
  
  return data;
};

/**
 * 複数ファイルのデータを統合する
 * @param fileDataMap ファイルパス -> データのマップ
 * @param joinType 結合方式 ('union', 'intersection', 'join')
 * @param joinKeys 結合キー（joinTypeが'join'の場合のみ必要）
 * @returns 統合されたデータ
 */
export const combineMultipleFiles = (
  fileDataMap: Map<string, any[]>,
  joinType: 'union' | 'intersection' | 'join' = 'union',
  joinKeys?: string[]
) => {
  if (fileDataMap.size === 0) {
    return { data: [], error: 'データがありません' };
  }

  try {
    const fileEntries = Array.from(fileDataMap.entries());
    
    switch (joinType) {
      case 'union':
        // 全ファイルのデータを縦に結合し、ファイル名を追加
        const unionData: any[] = [];
        fileEntries.forEach(([filePath, data]) => {
          const fileName = filePath.split('/').pop() || filePath;
          data.forEach(row => {
            unionData.push({
              ...row,
              _sourceFile: fileName,
              _sourceFilePath: filePath
            });
          });
        });
        return { data: unionData, error: null };

      case 'intersection':
        // 共通する列名のデータのみを抽出
        if (fileEntries.length === 0) return { data: [], error: null };
        
        // 全ファイルで共通する列名を取得
        const allColumns = fileEntries.map(([_, data]) => 
          data.length > 0 ? Object.keys(data[0]) : []
        );
        const commonColumns = allColumns.reduce((acc, columns) => 
          acc.filter(col => columns.includes(col))
        );

        const intersectionData: any[] = [];
        fileEntries.forEach(([filePath, data]) => {
          const fileName = filePath.split('/').pop() || filePath;
          data.forEach(row => {
            const filteredRow: any = { _sourceFile: fileName, _sourceFilePath: filePath };
            commonColumns.forEach(col => {
              filteredRow[col] = row[col];
            });
            intersectionData.push(filteredRow);
          });
        });
        return { data: intersectionData, error: null };

      case 'join':
        // キーベースで結合
        if (!joinKeys || joinKeys.length === 0) {
          return { data: [], error: '結合キーが指定されていません' };
        }

        // 最初のファイルをベースとして、他のファイルを結合
        const [baseFile, ...otherFiles] = fileEntries;
        let joinedData = baseFile[1].map(row => ({
          ...row,
          _sourceFile: baseFile[0].split('/').pop() || baseFile[0]
        }));

        otherFiles.forEach(([filePath, data]) => {
          const fileName = filePath.split('/').pop() || filePath;
          
          joinedData = joinedData.map(baseRow => {
            // 結合キーに基づいて対応する行を探す
            const matchingRow = data.find(dataRow => 
              joinKeys.every(key => baseRow[key] === dataRow[key])
            );

            if (matchingRow) {
              // キーが重複する場合はサフィックスを追加
              const mergedRow = { ...baseRow };
              Object.keys(matchingRow).forEach(key => {
                if (joinKeys.includes(key)) return; // 結合キーは重複させない
                
                const newKey = mergedRow.hasOwnProperty(key) ? `${key}_${fileName}` : key;
                mergedRow[newKey] = matchingRow[key];
              });
              return mergedRow;
            }

            return baseRow;
          });
        });

        return { data: joinedData, error: null };

      default:
        return { data: [], error: `未対応の結合方式: ${joinType}` };
    }
  } catch (error) {
    console.error('Error combining multiple files:', error);
    return {
      data: [],
      error: error instanceof Error ? error.message : '複数ファイル統合エラー'
    };
  }
};

/**
 * 複数ファイルの統計比較を実行する
 * @param fileDataMap ファイルパス -> データのマップ
 * @param columns 比較する列名
 * @returns ファイル別統計情報
 */
export const compareMultipleFileStatistics = (
  fileDataMap: Map<string, any[]>,
  columns: string[]
) => {
  if (fileDataMap.size === 0) {
    return { stats: null, error: 'データがありません' };
  }

  try {
    const comparisonStats: Record<string, any> = {};

    Array.from(fileDataMap.entries()).forEach(([filePath, data]) => {
      const fileName = filePath.split('/').pop() || filePath;
      const { stats, error } = calculateStatistics(data, true);
      
      if (stats && !error) {
        // 指定された列のみを抽出
        const filteredStats: Record<string, any> = {};
        columns.forEach(col => {
          if (stats[col]) {
            filteredStats[col] = stats[col];
          }
        });
        comparisonStats[fileName] = filteredStats;
      }
    });

    return { stats: comparisonStats, error: null };
  } catch (error) {
    console.error('Error comparing file statistics:', error);
    return {
      stats: null,
      error: error instanceof Error ? error.message : '統計比較エラー'
    };
  }
};

/**
 * 複数ファイルからクロス集計テーブルを作成する
 * @param fileDataMap ファイルパス -> データのマップ
 * @param rowField 行に使用するフィールド
 * @param colField 列に使用するフィールド（通常はファイル名）
 * @param valueField 値に使用するフィールド
 * @param aggregation 集計方法
 * @returns クロス集計テーブル
 */
export const createCrossTabFromFiles = (
  fileDataMap: Map<string, any[]>,
  rowField: string,
  colField: string,
  valueField: string,
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' = 'sum'
) => {
  try {
    // 各ファイルからデータを集計
    const aggregatedByFile: Record<string, Record<string, number>> = {};
    
    Array.from(fileDataMap.entries()).forEach(([filePath, data]) => {
      const fileName = filePath.split('/').pop() || filePath;
      
      // ファイル内でグループ集計
      const { data: aggregatedData, error } = aggregateData(
        data, rowField, valueField, aggregation, true
      );
      
      if (aggregatedData && !error) {
        aggregatedByFile[fileName] = {};
        aggregatedData.forEach(row => {
          const rowKey = String(row[rowField]);
          aggregatedByFile[fileName][rowKey] = row.value || row[valueField] || 0;
        });
      }
    });

    // 全ての行キーを収集
    const allRowKeys = new Set<string>();
    Object.values(aggregatedByFile).forEach(fileData => {
      Object.keys(fileData).forEach(key => allRowKeys.add(key));
    });

    // クロス集計テーブルを構築
    const crossTabData = Array.from(allRowKeys).map(rowKey => {
      const row: Record<string, any> = { [rowField]: rowKey };
      Object.keys(aggregatedByFile).forEach(fileName => {
        row[fileName] = aggregatedByFile[fileName][rowKey] || 0;
      });
      return row;
    });

    return { data: crossTabData, error: null };
  } catch (error) {
    console.error('Error creating cross-tab from files:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'クロス集計エラー'
    };
  }
};

/**
 * データの型・最大文字数などのサマリーを算出（pandas.info()相当）
 * @param data サマリーを算出するデータ
 * @param enableNestedAccess ネストされたプロパティへのアクセスを有効にするかどうか
 * @returns info summary object
 */
export const calculateInfo = (data: any[], enableNestedAccess: boolean = true) => {
  if (!data || data.length === 0) {
    return { info: null, error: 'データがありません' };
  }
  try {
    const processedData = enableNestedAccess ? flattenObjectsWithDotNotation(data) : data;
    const columns = Object.keys(processedData[0]);
    const info: Record<string, any> = {};
    columns.forEach(column => {
      const values = processedData.map(row => row[column]);
      const nonNullValues = values.filter(v => v !== null && v !== undefined);
      let dtype = 'null';
      if (nonNullValues.length > 0) {
        const types = new Set(nonNullValues.map(v => Array.isArray(v) ? 'array' : typeof v));
        if (types.size === 1) {
          dtype = Array.from(types)[0];
        } else {
          dtype = Array.from(types).join('|');
        }
      }
      let maxLength = null;
      if (dtype === 'string') {
        maxLength = nonNullValues.reduce((max, v) => Math.max(max, v.length), 0);
      }
      info[column] = {
        type: dtype,
        count: values.length,
        nonNullCount: nonNullValues.length,
        maxLength,
        sample: nonNullValues.slice(0, 3)
      };
    });
    return { info, error: null };
  } catch (error) {
    console.error('Error calculating info:', error);
    return {
      info: null,
      error: error instanceof Error ? error.message : 'info計算エラー'
    };
  }
};

/**
 * ドット記法のパスを使用して、深くネストされたオブジェクト内の値を安全に取得する
 * @param obj 対象のオブジェクト
 * @param path ドット記法のパス (例: "products.reviews.average_rating")
 * @param defaultValue 値が見つからない場合のデフォルト値
 * @returns 見つかった値またはデフォルト値
 */
export const getNestedValue = (obj: any, path: string, defaultValue: any = undefined) => {
  if (!obj || !path) return defaultValue;
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    // 配列アクセスをチェック (例: "tags[0]")
    const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
    
    if (arrayMatch) {
      // 配列アクセスの場合
      const propName = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      
      if (current === null || current === undefined || 
          typeof current !== 'object' || 
          !(propName in current) || 
          !Array.isArray(current[propName]) || 
          index >= current[propName].length) {
        return defaultValue;
      }
      
      current = current[propName][index];
    } else {
      // 通常のプロパティアクセスの場合
      if (current === null || current === undefined || 
          typeof current !== 'object' || 
          !(part in current)) {
        return defaultValue;
      }
      
      current = current[part];
    }
  }
  
  return current;
};

/**
 * ネストされたオブジェクトをフラット化し、ドット記法のキーでアクセスできるようにする
 * @param data 元のデータ配列
 * @returns フラット化されたデータ配列
 */
export const flattenObjectsWithDotNotation = (data: any[]): any[] => {
  if (!Array.isArray(data) || data.length === 0) return data;

  return data.map(item => {
    if (typeof item !== 'object' || item === null) return item;

    const result: Record<string, any> = {};
    
    // 元のプロパティをコピー
    Object.keys(item).forEach(key => {
      result[key] = item[key];
    });
    
    // ネストされたプロパティをフラット化
    const processObject = (obj: any, prefix: string) => {
      if (!obj || typeof obj !== 'object') return;
      
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        // プリミティブ値の場合、直接追加
        if (value === null || typeof value !== 'object') {
          result[newKey] = value;
          return;
        }
        
        // 配列の場合、インデックス付きで追加
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            // 配列の要素がオブジェクトの場合は再帰的に処理
            if (item !== null && typeof item === 'object') {
              processObject(item, `${newKey}[${index}]`);
            }
            // 配列要素を直接追加
            result[`${newKey}[${index}]`] = item;
          });
          return;
        }
        
        // オブジェクトの場合は再帰的に処理
        processObject(value, newKey);
      });
    };
    
    // ルートレベルのオブジェクトを処理
    Object.keys(item).forEach(key => {
      const value = item[key];
      if (value !== null && typeof value === 'object') {
        processObject(value, key);
      }
    });
    
    return result;
  });
};

/**
 * データに対してSQLクエリを実行する
 * @param data クエリを実行するデータ
 * @param query 実行するSQLクエリ
 * @param enableNestedAccess ネストされたプロパティへのアクセスを有効にするかどうか
 */
export const executeQuery = (data: any[], query: string, enableNestedAccess: boolean = true) => {
  try {
    // ネストされたプロパティへのアクセスが必要な場合
    const processedData = enableNestedAccess ? flattenObjectsWithDotNotation(data) : data;
    
    // 簡易SQL処理を使用
    const result = executeSimpleQuery(processedData, query);
    return { data: result, error: null };
  } catch (error) {
    console.error('Error executing SQL query:', error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : 'クエリ実行エラー'
    };
  }
};

/**
 * データの基本統計情報を計算する（Pandasのdescribe()に相当）
 * @param data 統計情報を計算するデータ
 * @param enableNestedAccess ネストされたプロパティへのアクセスを有効にするかどうか
 */
export const calculateStatistics = (data: any[], enableNestedAccess: boolean = true) => {
  if (!data || data.length === 0) {
    return { stats: null, error: 'データがありません' };
  }
  
  try {
    // ネストされたプロパティへのアクセスが必要な場合はデータを前処理
    const processedData = enableNestedAccess ? flattenObjectsWithDotNotation(data) : data;
    
    // 最初の要素からすべての列名を取得
    const columns = Object.keys(processedData[0]);
    const stats: Record<string, any> = {};
    
    columns.forEach(column => {
      // 数値の場合のみ統計を計算
      const values = processedData.map(row => row[column])
                        .filter(val => typeof val === 'number' && !isNaN(val));
      
      if (values.length > 0) {
        stats[column] = {
          count: values.length,
          mean: jStat.mean(values),
          std: jStat.stdev(values),
          min: Math.min(...values),
          q1: jStat.quartiles(values)[0],
          median: jStat.median(values),
          q3: jStat.quartiles(values)[2],
          max: Math.max(...values)
        };
      } else {
        // 数値以外の場合はカウントとユニーク値数のみ
        const allValues = processedData.map(row => row[column]);
        const uniqueValues = new Set(allValues);
        
        // 非数値データの場合はサンプル例を保存（最大5件）
        const sampleValues = Array.from(uniqueValues)
          .filter(val => val !== null && val !== undefined)
          .slice(0, 5);
        
        // 例の中にオブジェクトや配列があるか確認
        const hasComplexTypes = sampleValues.some(val => typeof val === 'object');
        
        stats[column] = {
          count: allValues.length,
          uniqueCount: uniqueValues.size,
          type: 'non-numeric',
          examples: hasComplexTypes ? sampleValues : sampleValues.map(String)
        };
      }
    });
    
    return { stats, error: null };
  } catch (error) {
    console.error('Error calculating statistics:', error);
    return { 
      stats: null, 
      error: error instanceof Error ? error.message : '統計計算エラー'
    };
  }
};

/**
 * データを指定の形式に変換する
 * @param data 変換するデータ
 * @param format 出力形式（'json', 'csv', 'tsv', 'yaml'）
 * @returns 変換されたデータの文字列
 */
export const convertDataToFormat = (
  data: any[],
  format: 'json' | 'csv' | 'tsv' | 'yaml'
): string => {
  if (!data || data.length === 0) {
    throw new Error('変換するデータがありません');
  }

  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);

    case 'csv':
      return convertToDelimitedText(data, ',');

    case 'tsv':
      return convertToDelimitedText(data, '\t');

    case 'yaml':
      // 簡易的なYAML変換（実際のプロジェクトではyamlパッケージを使うことを推奨）
      try {
        return convertToSimpleYAML(data);
      } catch (error) {
        console.error('YAML変換エラー:', error);
        throw new Error('YAML形式への変換に失敗しました');
      }

    default:
      throw new Error(`未対応の形式: ${format}`);
  }
};

/**
 * データを簡易的なYAML形式に変換する内部ヘルパー関数
 * @param data 変換するデータ
 * @returns YAML形式の文字列
 */
const convertToSimpleYAML = (data: any[]): string => {
  if (data.length === 0) return '';

  return data.map((item, index) => {
    const itemStr = Object.entries(item)
      .map(([key, value]) => {
        // YAMLでは値の型を適切に処理
        let yamlValue: string;
        if (value === null || value === undefined) {
          yamlValue = 'null';
        } else if (typeof value === 'string') {
          // 特殊文字が含まれる場合はクオートで囲む
          if (/[:#{}[\],&*!|>'"%@\`]/.test(value) || value.includes('\n') || value === '') {
            yamlValue = `"${value.replace(/"/g, '\\"')}"`;
          } else {
            yamlValue = value;
          }
        } else if (typeof value === 'object') {
          yamlValue = JSON.stringify(value);
        } else {
          yamlValue = String(value);
        }
        
        return `  ${key}: ${yamlValue}`;
      })
      .join('\n');
    
    return `- # 項目 ${index + 1}\n${itemStr}`;
  }).join('\n');
};

/**
 * データをCSV/TSV形式に変換する内部ヘルパー関数
 * @param data 変換するデータ
 * @param delimiter 区切り文字（CSVなら',', TSVなら'\t'）
 * @returns 変換された文字列
 */
const convertToDelimitedText = (data: any[], delimiter: string): string => {
  if (data.length === 0) return '';

  // ヘッダー行の取得
  const headers = Object.keys(data[0]);
  const headerRow = headers.map(escapeDelimitedValue).join(delimiter);

  // データ行の変換
  const rows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      return escapeDelimitedValue(value);
    }).join(delimiter);
  });

  // ヘッダーとデータ行を結合
  return [headerRow, ...rows].join('\n');
};

/**
 * CSV/TSV用の値のエスケープ処理
 * @param value エスケープする値
 * @returns エスケープされた文字列
 */
const escapeDelimitedValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  
  const stringValue = String(value);
  
  // 文字列に「カンマ、タブ、改行、ダブルクォート」が含まれている場合はダブルクォートで囲む
  if (/[,\t\n"]/.test(stringValue)) {
    // ダブルクォートはダブルクォートでエスケープ
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
};

/**
 * データをダウンロードさせる
 * @param data ダウンロードするデータ
 * @param filename ダウンロードするファイル名
 * @param mimeType MIMEタイプ
 */
export const downloadData = (
  data: string | Blob,
  filename: string,
  mimeType: string
): void => {
  // ブラウザ環境でのみ実行
  if (typeof window === 'undefined') {
    console.error('ダウンロード機能はブラウザ環境でのみ利用可能です');
    return;
  }

  const blob = typeof data === 'string'
    ? new Blob([data], { type: mimeType })
    : data;
  
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  // クリーンアップ
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

/**
 * データを指定した列でグループ化して集計する
 * @param data 集計するデータ
 * @param groupBy グループ化する列
 * @param valueColumn 集計する値の列
 * @param aggregation 集計方法（sum, avg, count, min, max）
 * @param enableNestedAccess ネストされたプロパティへのアクセスを有効にするかどうか
 */
export const aggregateData = (
  data: any[], 
  groupBy: string, 
  valueColumn: string, 
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max',
  enableNestedAccess: boolean = true
) => {
  if (!data || data.length === 0) {
    return { data: null, error: 'データがありません' };
  }
  
  // 集計前のデータサンプルをログ出力
  console.log('集計処理デバッグ - 入力データ:', {
    件数: data.length,
    サンプル: data.slice(0, 3),
    groupBy列: groupBy,
    value列: valueColumn,
    集計方法: aggregation
  });
  
  try {
    // ネストされたプロパティへのアクセスが必要な場合はデータを前処理
    const processedData = enableNestedAccess ? flattenObjectsWithDotNotation(data) : data;
    
    // 処理後のデータサンプルをログ出力
    console.log('集計処理デバッグ - 前処理後データ:', {
      件数: processedData.length,
      サンプル: processedData.slice(0, 3),
      最初の行のキー: processedData.length > 0 ? Object.keys(processedData[0]) : []
    });
    
    // SQLインジェクション対策として、手動でデータを集計する
    try {
      // データを手動でグループ化
      const groups = new Map<string, number[]>();
      const groupCounts = new Map<string, number>(); // カウント集計用
      
      for (const row of processedData) {
        const groupValue = row[groupBy];
        
        if (typeof groupValue !== 'undefined' && groupValue !== null) {
          const groupKey = String(groupValue);
          
          // カウント集計時はグループのカウントを増やす
          if (aggregation === 'count' && (!valueColumn || valueColumn.trim() === '')) {
            if (!groupCounts.has(groupKey)) {
              groupCounts.set(groupKey, 0);
            }
            groupCounts.set(groupKey, groupCounts.get(groupKey)! + 1);
          } else {
            // それ以外の集計方法では値を追加
            const valueToAggregate = row[valueColumn];
            
            if (!groups.has(groupKey)) {
              groups.set(groupKey, []);
            }
            
            if (typeof valueToAggregate === 'number' && !isNaN(valueToAggregate)) {
              groups.get(groupKey)?.push(valueToAggregate);
            }
          }
        }
      }
      
      // 集計を実行
      const result = [];
      
      // カウント集計で値が指定されていない場合は、グループカウントを使用
      if (aggregation === 'count' && (!valueColumn || valueColumn.trim() === '')) {
        for (const [key, count] of groupCounts.entries()) {
          // グループごとのカウント結果を追加
          const resultObj: Record<string, any> = { 
            [groupBy]: key, 
            value: count
          };
          
          result.push(resultObj);
        }
      } else {
        // 通常の集計処理
        for (const [key, values] of groups.entries()) {
          let aggregatedValue = 0;
          
          if (values.length > 0) {
            switch (aggregation) {
              case 'sum':
                aggregatedValue = values.reduce((sum: number, val: number) => sum + val, 0);
                break;
              case 'avg':
                aggregatedValue = values.reduce((sum: number, val: number) => sum + val, 0) / values.length;
                break;
              case 'count':
                aggregatedValue = values.length;
                break;
              case 'min':
                aggregatedValue = Math.min(...values);
                break;
              case 'max':
                aggregatedValue = Math.max(...values);
                break;
            }
          }
          
          // ここで各データポイントに「元のY列名」をコピーして結果に追加
          // 例: 'sepal_length'や'sepal_width'といった元の列名も保持する
          // 散布図用に元の列名で値を保持するが、元の列名が空文字列やnullの場合は問題が起こるので修正
          const resultObj: Record<string, any> = { 
            [groupBy]: key, 
            value: aggregatedValue
          };
          
          // 元の列名が有効な場合のみ追加（散布図で使用される）
          if (valueColumn && valueColumn.trim() !== '') {
            resultObj[valueColumn] = aggregatedValue;
          }
          
          // デバッグ用（最初の数件のみ）
          if (result.length < 3) {
            console.log(`集計結果オブジェクト[${result.length}]:`, {
              集計値: aggregatedValue,
              元の列名: valueColumn,
              結果オブジェクト: resultObj
            });
          }
          
          result.push(resultObj);
        }
      }
      
      // キーでソート
      result.sort((a, b) => {
        const aVal = a[groupBy];
        const bVal = b[groupBy];
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return aVal.localeCompare(bVal);
        }
        
        return String(aVal).localeCompare(String(bVal));
      });
      
      // 最終結果のサンプルをログ出力
      console.log('集計処理デバッグ - 結果:', {
        件数: result.length,
        サンプル: result.slice(0, 3),
        最初の行のキー: result.length > 0 ? Object.keys(result[0]) : []
      });
      
      return { data: result, error: null };
    } catch (error) {
      console.error('Error during manual data aggregation:', error);
      return { 
        data: null, 
        error: error instanceof Error ? error.message : '集計エラー'
      };
    }
  } catch (error) {
    console.error('Error aggregating data:', error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : '集計エラー'
    };
  }
};

/**
 * Chart.jsで使用できるデータ形式に変換する
 * @param data 変換するデータ
 * @param labelField ラベルとして使用するフィールド
 * @param valueField 値として使用するフィールド
 * @param chartType チャートタイプ
 * @param categoryField X軸のカテゴリでグループ化するフィールド（積立棒グラフなど）
 * @param options 追加のオプション（ヒストグラムのビン数など）
 */
export const prepareChartData = (
  data: any[], 
  labelField: string, 
  valueField: string, 
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'stacked-bar' | 'regression' | 'histogram' | 'gantt' = 'bar',
  categoryField?: string,
  options?: {
    bins?: number;  // ヒストグラム用のビン数
    regressionType?: 'linear' | 'exponential' | 'polynomial' | 'power' | 'logarithmic'; // 回帰分析のタイプ
    regressionOrder?: number; // 多項式回帰の次数
    startDateField?: string; // ガントチャートの開始日フィールド
    endDateField?: string;   // ガントチャートの終了日フィールド
  }
) => {
  if (!data || data.length === 0) {
    return null;
  }
  
  // データの初期確認（デバッグ用）
  console.log('チャートデータ準備 - 入力データ確認:', {
    データ型: chartType,
    レコード数: data.length,
    X軸フィールド: labelField,
    Y軸フィールド: valueField,
    カテゴリフィールド: categoryField,
    サンプルデータ: data.slice(0, 3).map(item => ({
      [labelField]: item[labelField],
      [valueField]: item[valueField],
      [categoryField || 'カテゴリなし']: categoryField ? item[categoryField] : 'なし'
    }))
  });
  
  // 基本的な色パレット
  const colorPalette = [
    'rgba(255, 99, 132, 0.6)', // 赤
    'rgba(54, 162, 235, 0.6)', // 青
    'rgba(255, 206, 86, 0.6)', // 黄
    'rgba(75, 192, 192, 0.6)', // ティール
    'rgba(153, 102, 255, 0.6)', // 紫
    'rgba(255, 159, 64, 0.6)', // オレンジ
    'rgba(199, 199, 199, 0.6)', // グレー
    'rgba(83, 123, 51, 0.6)', // 緑
    'rgba(128, 0, 128, 0.6)', // 深い紫
    'rgba(0, 128, 128, 0.6)', // 深いティール
  ];
  
  const borderColorPalette = colorPalette.map(color => color.replace('0.6', '1'));
  
  // チャートタイプに応じたデータ処理
  switch (chartType) {
    case 'stacked-bar': {
      const labels = data.map(item => item[labelField]);
      const values = data.map(item => item[valueField]);
      
      // カテゴリフィールドが指定されている場合、カテゴリごとに色分け
      if (categoryField) {
        const categories = [...new Set(data.map(item => item[categoryField]))];
        
        console.log('積み上げ棒グラフのカテゴリ:', {
          カテゴリ一覧: categories,
          カテゴリ数: categories.length
        });
        
        // カテゴリごとのデータセットを作成
        const datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => item[categoryField] === category);
          const categoryLabels = categoryData.map(item => item[labelField]);
          const categoryValues = categoryData.map(item => item[valueField]);
          
          // カテゴリごとにデータポイントをマッピング
          const dataPoints = labels.map(label => {
            const idx = categoryLabels.indexOf(label);
            return idx !== -1 ? categoryValues[idx] : 0; // nullではなく0を使用（積み上げのため）
          });
          
          return {
            label: String(category),
            data: dataPoints,
            backgroundColor: colorPalette[index % colorPalette.length],
            borderColor: borderColorPalette[index % borderColorPalette.length],
            borderWidth: 1,
            stack: 'stack1' // すべて同じスタックに配置
          };
        });
        
        return {
          labels,
          datasets,
        };
      }
      
      // カテゴリがない場合は棒グラフと同じ処理
      return {
        labels,
        datasets: [
          {
            label: valueField,
            data: values,
            backgroundColor: colorPalette[0],
            borderColor: borderColorPalette[0],
            borderWidth: 1,
          }
        ],
      };
    }
    
    case 'pie': {
      const labels = data.map(item => item[labelField]);
      const values = data.map(item => item[valueField]);
      
      // 配列が足りない場合は繰り返し使用
      let backgroundColor = [...colorPalette];
      let borderColor = [...borderColorPalette];
      
      if (labels.length > backgroundColor.length) {
        const baseColors = [...backgroundColor];
        const baseBorders = [...borderColor];
        for (let i = 0; i < Math.ceil(labels.length / baseColors.length) - 1; i++) {
          backgroundColor = [...backgroundColor, ...baseColors];
          borderColor = [...borderColor, ...baseBorders];
        }
      }
      
      return {
        labels,
        datasets: [
          {
            label: valueField,
            data: values,
            backgroundColor: backgroundColor.slice(0, labels.length),
            borderColor: borderColor.slice(0, labels.length),
            borderWidth: 1,
          },
        ],
      };
    }
    
    case 'line': {
      const labels = data.map(item => item[labelField]);
      const values = data.map(item => item[valueField]);
      
      // カテゴリフィールドが指定されている場合、カテゴリごとに色分け
      if (categoryField) {
        const categories = [...new Set(data.map(item => item[categoryField]))];
        
        // カテゴリごとのデータセットを作成
        const datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => item[categoryField] === category);
          const categoryLabels = categoryData.map(item => item[labelField]);
          const categoryValues = categoryData.map(item => item[valueField]);
          
          // カテゴリごとにデータポイントをマッピング
          const dataPoints = labels.map(label => {
            const idx = categoryLabels.indexOf(label);
            return idx !== -1 ? categoryValues[idx] : null;
          });
          
          return {
            label: String(category),
            data: dataPoints,
            backgroundColor: colorPalette[index % colorPalette.length],
            borderColor: borderColorPalette[index % borderColorPalette.length],
            borderWidth: 1,
            fill: false,
            tension: 0.1
          };
        });
        
        return {
          labels,
          datasets,
        };
      }
      
      // カテゴリがない場合は単一のデータセット
      return {
        labels,
        datasets: [
          {
            label: valueField,
            data: values,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            fill: false,
            tension: 0.1
          },
        ],
      };
    }
    
    case 'scatter': {
      // デバッグ: 元のデータとフィールド名を確認
      console.log('散布図データ処理開始 - 入力確認:', {
        データ件数: data.length,
        X軸フィールド: labelField,
        Y軸フィールド: valueField,
        カテゴリフィールド: categoryField,
        サンプルデータ: data.slice(0, 3)
      });
      
      // 指定されたフィールドが存在するか確認
      if (data.length > 0) {
        const firstItem = data[0];
        const availableFields = Object.keys(firstItem);
        console.log('散布図データ処理 - 利用可能なフィールド:', {
          利用可能フィールド: availableFields,
          X軸存在: availableFields.includes(labelField),
          Y軸存在: availableFields.includes(valueField),
          X軸を含む列: availableFields.filter(f => f.toLowerCase().includes(labelField.toLowerCase())),
          Y軸を含む列: availableFields.filter(f => f.toLowerCase().includes(valueField.toLowerCase()))
        });

        // デバッグ: Y値を特に詳しく検査
        if (availableFields.includes(valueField)) {
          // Y値のサンプルを表示
          console.log('Y値詳細検査 - 直接アクセス:', {
            最初の5行: data.slice(0, 5).map((item, idx) => ({
              行: idx,
              [valueField]: item[valueField],
              型: typeof item[valueField],
              数値変換: parseFloat(String(item[valueField]))
            }))
          });
        } else {
          // valueフィールドが見つからない場合、類似名を探す
          const similarYFields = availableFields.filter(f => 
            f.toLowerCase().includes(valueField.toLowerCase()) || 
            valueField.toLowerCase().includes(f.toLowerCase()));
            
          console.log('Y値詳細検査 - 類似フィールド検索:', {
            探索フィールド: valueField,
            類似フィールド: similarYFields,
            サンプル値: similarYFields.length > 0 ? 
              data.slice(0, 3).map(item => ({
                値: item[similarYFields[0]],
                型: typeof item[similarYFields[0]]
              })) : '類似フィールドなし'
          });

          // 'value'フィールドも確認（集計結果の場合）
          if (availableFields.includes('value')) {
            console.log('Y値詳細検査 - valueフィールド確認:', {
              最初の5行: data.slice(0, 5).map((item, idx) => ({
                行: idx,
                value: item['value'],
                型: typeof item['value']
              }))
            });
          }
        }
      }
      
      // X軸とY軸の値を抽出（フィールド名の解決を改善）
      const scatterData = data.map((item, i) => {
        // ログ出力（最初の数件のみ）
        if (i < 3) {
          console.log(`散布図データポイント [${i}] - 元データ:`, {
            item: item,
            キー: Object.keys(item),
            labelField: labelField,
            valueField: valueField,
            labelFieldValue: item[labelField],
            valueFieldValue: item[valueField]
          });
        }

        // 実際のフィールド名を取得（大文字小文字を区別せず）
        const itemKeys = Object.keys(item);
        
        // X軸フィールド名の解決（正確なキーを見つける）
        // 完全一致を試す
        let actualXField = itemKeys.find(key => key === labelField);
        // 完全一致しない場合は大文字小文字を区別しない比較を試す
        if (!actualXField) {
          actualXField = itemKeys.find(key => key.toLowerCase() === labelField.toLowerCase());
        }
        // それでも見つからない場合は元のフィールド名を使用
        if (!actualXField) actualXField = labelField;
        
        // Y軸フィールド名の解決（複数の可能性を試す）
        // 1. 完全一致
        let actualYField = itemKeys.find(key => key === valueField);
        // 2. 大文字小文字を区別しない比較
        if (!actualYField) {
          actualYField = itemKeys.find(key => key.toLowerCase() === valueField.toLowerCase());
        }
        // 3. 'value'フィールドを確認（集計結果の場合）
        if (!actualYField && itemKeys.includes('value')) {
          actualYField = 'value';
          if (i < 3) {
            console.log(`Y値フィールド解決 [${i}]: valueフィールドを使用します`);
          }
        }
        // 4. それでも見つからない場合は元のフィールド名を使用
        if (!actualYField) actualYField = valueField;
        
        // ログ出力（最初の数件のみ）
        if (i < 3) {
          console.log(`散布図データポイント [${i}] - フィールド解決:`, {
            元のX軸フィールド: labelField,
            解決されたX軸フィールド: actualXField,
            元のY軸フィールド: valueField,
            解決されたY軸フィールド: actualYField
          });
        }
        
        // 元の値を取得
        const xRaw = item[actualXField];
        let yRaw = item[actualYField];
        
        // Y値が見つからない場合のバックアップ戦略
        if (yRaw === undefined || yRaw === null) {
          // 値フィールドを試す
          if (item['value'] !== undefined && item['value'] !== null) {
            yRaw = item['value'];
            if (i < 3) console.log(`Y値バックアップ [${i}]: valueフィールドから値を取得 = ${yRaw}`);
          } else {
            // その他のフィールドを探す
            const potentialYFields = itemKeys.filter(key => 
              typeof item[key] === 'number' && 
              key !== actualXField && 
              key !== 'x' && 
              !key.toLowerCase().includes('count'));
            
            if (potentialYFields.length > 0) {
              yRaw = item[potentialYFields[0]];
              if (i < 3) console.log(`Y値バックアップ [${i}]: 代替フィールド ${potentialYFields[0]} から値を取得 = ${yRaw}`);
            }
          }
        }
        
        // ログ出力（最初の数件のみ）
        if (i < 3) {
          console.log(`散布図データポイント [${i}] - 生の値:`, {
            xRaw: xRaw,
            yRaw: yRaw,
            xRawType: typeof xRaw,
            yRawType: typeof yRaw
          });
        }
        
        // 明示的に数値変換して、無効な値をチェック
        let numX, numY;
        
        // X値の処理
        if (typeof xRaw === 'number') {
          numX = xRaw;
          if (i < 3) console.log(`X値処理 [${i}]: 元々数値型 ${xRaw}`);
        } else if (xRaw !== undefined && xRaw !== null) {
          // 文字列をトリムして数値変換
          const xStr = String(xRaw).trim();
          numX = parseFloat(xStr);
          if (i < 3) console.log(`X値処理 [${i}]: 文字列変換 "${xStr}" -> ${numX}`);
        } else {
          numX = NaN;
          if (i < 3) console.log(`X値処理 [${i}]: 値がnullまたはundefined -> NaN`);
        }
        
        // Y値の処理（より堅牢に）
        if (typeof yRaw === 'number') {
          numY = yRaw;
          if (i < 5) console.log(`Y値処理 [${i}]: 元々数値型 ${yRaw} -> ${numY}`);
        } else if (yRaw !== undefined && yRaw !== null) {
          // 文字列をトリムして数値変換
          const yStr = String(yRaw).trim();
          numY = parseFloat(yStr);
          if (i < 5) {
            console.log(`Y値処理 [${i}]: 文字列変換 "${yStr}" -> ${numY}, isNaN=${isNaN(numY)}`);
            
            // 変換失敗した場合の詳細デバッグ
            if (isNaN(numY)) {
              console.log(`Y値処理 [${i}]: 変換失敗詳細=`, {
                元の値: yRaw,
                元の型: typeof yRaw,
                文字列化後: yStr,
                文字列長: yStr.length,
                各文字のコード: Array.from(yStr).map(c => c.charCodeAt(0))
              });
              
              // もしitemに'value'フィールドがあれば、そこから取得を試みる
              if (item['value'] !== undefined && typeof item['value'] === 'number') {
                numY = item['value'];
                if (i < 5) console.log(`Y値処理 [${i}]: valueフィールドから値を取得 ${numY}`);
              }
              
              // valueFieldを大文字小文字を区別せずに探す
              const lowerCaseValueField = valueField.toLowerCase();
              const normalizedValueField = Object.keys(item).find(key => 
                key.toLowerCase() === lowerCaseValueField
              );
              
              if (normalizedValueField && normalizedValueField !== valueField) {
                const normalizedY = item[normalizedValueField];
                if (typeof normalizedY === 'number') {
                  numY = normalizedY;
                  if (i < 5) console.log(`Y値処理 [${i}]: 正規化フィールド名から値を取得 ${numY}`);
                } else if (normalizedY !== undefined && normalizedY !== null) {
                  numY = parseFloat(String(normalizedY));
                  if (!isNaN(numY) && i < 5) console.log(`Y値処理 [${i}]: 正規化フィールド名から変換した値 ${numY}`);
                }
              }
            }
          }
        } else {
          // Y値がない場合のバックアップ
          
          // 1. 'value'フィールドを確認
          if (item['value'] !== undefined && typeof item['value'] === 'number') {
            numY = item['value'];
            if (i < 5) console.log(`Y値処理 [${i}]: バックアップ(value) -> ${numY}`);
          }
          
          // 2. 大文字小文字を区別せずにY軸フィールドを探す
          else {
            const lowerCaseValueField = valueField.toLowerCase();
            for (const key of Object.keys(item)) {
              if (key.toLowerCase() === lowerCaseValueField) {
                const altY = item[key];
                if (typeof altY === 'number') {
                  numY = altY;
                  if (i < 5) console.log(`Y値処理 [${i}]: 代替キー(${key})から値を取得 ${numY}`);
                  break;
                } else if (altY !== undefined && altY !== null) {
                  numY = parseFloat(String(altY));
                  if (!isNaN(numY)) {
                    if (i < 5) console.log(`Y値処理 [${i}]: 代替キー(${key})から変換した値 ${numY}`);
                    break;
                  }
                }
              }
            }
          }
          
          // 3. まだ見つからない場合は最後の手段として数値フィールドを探す
          if (numY === undefined || isNaN(numY as number)) {
            const numericFields = Object.keys(item).filter(key => 
              key !== labelField && typeof item[key] === 'number' && !isNaN(item[key])
            );
            
            if (numericFields.length > 0) {
              numY = item[numericFields[0]];
              if (i < 5) console.log(`Y値処理 [${i}]: 最終手段として数値フィールド(${numericFields[0]})から値を取得 ${numY}`);
            } else {
              numY = NaN;
              if (i < 5) console.log(`Y値処理 [${i}]: 値がnullまたはundefined -> NaN`);
            }
          }
        }
        
        // ログ出力（最初の数件のみ）
        if (i < 3) {
          console.log(`散布図データポイント [${i}] - 変換後の値:`, {
            numX: numX,
            numY: numY,
            isValidX: !isNaN(numX),
            isValidY: !isNaN(numY)
          });
        }
        
        if (isNaN(numX) || isNaN(numY)) {
          return null; // 無効なデータポイントはnullとして扱う
        }
        
        return {
          x: numX,
          y: numY,
          // カテゴリフィールドの値を追加（利用可能な場合）
          category: categoryField && item[categoryField] !== undefined ? 
                    String(item[categoryField]) : 
                    valueField, // valueFieldをデフォルトとして使用
          // 元の値も保持（デバッグ用）
          originalX: xRaw,
          originalY: yRaw
        };
      }).filter(point => point !== null); // nullを除外
      
      // 変換結果のログ出力
      console.log('散布図データ変換結果サマリー:', {
        総データ数: data.length,
        有効なデータポイント数: scatterData.length,
        最初の3つのデータポイント: scatterData.slice(0, 3)
      });
      
      // 散布図データ変換結果をログ
      console.log('散布図データ変換 - 結果サンプル:', {
        総データ数: scatterData.length,
        有効データ数: scatterData.filter(p => p !== null).length,
        サンプル: scatterData.slice(0, 5),
        Y値が0の数: scatterData.filter(p => p && p.y === 0).length,
        Y値が0の割合: `${scatterData.filter(p => p && p.y === 0).length}/${scatterData.filter(p => p !== null).length}`,
        Y値分布: scatterData.filter(p => p !== null).map(p => p.y).slice(0, 20)
      });
      
      // カテゴリフィールドが指定されている場合、カテゴリごとに色分け
      if (categoryField) {
        // categoryFieldが存在する項目のみから一意なカテゴリ値を抽出
        const categories = [...new Set(data
          .filter(item => item[categoryField as string] !== undefined)
          .map(item => String(item[categoryField as string]))
        )];
        
        const datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => 
            categoryField !== undefined && 
            item[categoryField as string] === category
          );
          
          // カテゴリデータからX値とY値を抽出し、明示的に数値に変換
          const categoryScatterData = categoryData.map(item => {
            const x = item[labelField];
            const y = item[valueField];
            
            // 数値に変換
            const numX = typeof x === 'number' ? x : parseFloat(String(x));
            const numY = typeof y === 'number' ? y : parseFloat(String(y));
            
            if (isNaN(numX) || isNaN(numY)) {
              return null; // 無効なデータはnull
            }
            
            return {
              x: numX,
              y: numY,
              category: String(category),
              original: {
                x: x,
                y: y
              }
            };
          }).filter(point => point !== null); // nullを除外
          
          return {
            label: String(category),
            data: categoryScatterData,
            backgroundColor: colorPalette[index % colorPalette.length],
            borderColor: borderColorPalette[index % borderColorPalette.length],
            borderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 7
          };
        });
        
        return {
          datasets,
        };
      }
      
      // カテゴリがない場合は単一のデータセット
      return {
        datasets: [
          {
            label: valueField,
            data: scatterData.map(point => {
              // カテゴリフィールドが指定されている場合、各データポイントにカテゴリ情報を追加
              if (categoryField && !point.category) {
                const idx = scatterData.indexOf(point);
                const item = idx < data.length ? data[idx] : null;
                if (item && item[categoryField as string] !== undefined) {
                  point.category = String(item[categoryField as string]);
                } else {
                  point.category = valueField; // デフォルトはvalueField
                }
              }
              return point;
            }),
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 7
          },
        ],
      };
    }
    
    case 'regression': {
      // X軸とY軸の値を抽出
      const xValues = data.map(item => parseFloat(item[labelField]));
      const yValues = data.map(item => item[valueField]);
      
      // カテゴリフィールドが指定されている場合、カテゴリ値も抽出
      const hasCategory = categoryField && categoryField !== '';
      
      // 散布図のデータポイント形式に変換
      const scatterData = xValues.map((x, i) => {
        const point: any = {
          x,
          y: yValues[i]
        };
        
        // カテゴリ情報があれば追加
        if (hasCategory && data[i]) {
          const categoryValue = data[i][categoryField as string];
          point.category = categoryValue !== undefined ? String(categoryValue) : '';
        }
        
        return point;
      });
      
      // 回帰タイプを決定
      const regressionType = options?.regressionType || 'linear';
      const regressionOrder = options?.regressionOrder || 2; // 多項式回帰用
      
      return {
        datasets: [
          {
            type: 'scatter',
            label: 'データポイント',
            data: scatterData,
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
            pointRadius: 5,
            pointHoverRadius: 7
          },
          {
            type: 'line',
            label: '回帰線',
            data: scatterData,
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false,
            // Chart.js-regression プラグイン用の設定
            regression: true,
            regressionType,
            regressionOrder,
          }
        ],
      };
    }
    
    case 'histogram': {
      // ヒストグラム用の値を抽出（カテゴリ情報も含める）
      const dataPoints = data.map(item => {
        const val = item[valueField];
        // カテゴリフィールドが指定されていれば、その値も含める
        const category = categoryField ? String(item[categoryField] || '') : '';
        return typeof val === 'number' && !isNaN(val) ? { value: val, category } : null;
      }).filter(point => point !== null) as { value: number, category: string }[];
      
      if (dataPoints.length === 0) {
        console.error('ヒストグラム用の数値データが見つかりません');
        return null;
      }
      
      // 値の配列を抽出（従来の処理との互換性のため）
      const values = dataPoints.map(point => point.value);
      
      console.log('ヒストグラム用データ:', { 
        field: valueField, 
        count: values.length,
        categoryField: categoryField || 'なし',
        hasCategoryData: !!categoryField
      });
      
      // ビン数の決定（デフォルトは10）
      const bins = options?.bins || 10;
      
      // 最小値と最大値を取得
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      // ビンの幅を計算
      const binWidth = (max - min) / bins;
      
      // カテゴリがある場合は、カテゴリごとに処理
      const hasCategories = categoryField && dataPoints.some(p => p.category);
      
      // ビンの幅が0の場合（全て同じ値など）
      if (binWidth <= 0) {
        // 単一の値の場合は、その値を中心にしたビンを作成
        const singleValue = values[0];
        
        // カテゴリがある場合
        if (hasCategories) {
          // カテゴリごとのカウントを集計
          const categoryCounts: { [key: string]: number } = {};
          dataPoints.forEach(point => {
            if (!categoryCounts[point.category]) {
              categoryCounts[point.category] = 0;
            }
            categoryCounts[point.category]++;
          });
          
          // カテゴリごとのデータセットを作成
          const categoryNames = Object.keys(categoryCounts);
          const datasets = categoryNames.map((category, idx) => {
            // カラーパレットの定義
            const colorPalette = [
              'rgba(54, 162, 235, 0.6)', // 青
              'rgba(255, 99, 132, 0.6)', // 赤
              'rgba(75, 192, 192, 0.6)', // ティール
              'rgba(255, 206, 86, 0.6)', // 黄
              'rgba(153, 102, 255, 0.6)', // 紫
              'rgba(255, 159, 64, 0.6)', // オレンジ
              'rgba(102, 187, 106, 0.6)', // 緑
              'rgba(238, 130, 238, 0.6)', // バイオレット
              'rgba(150, 150, 150, 0.6)' // グレー
            ];
            
            const borderColorPalette = [
              'rgba(54, 162, 235, 1)',
              'rgba(255, 99, 132, 1)',
              'rgba(75, 192, 192, 1)',
              'rgba(255, 206, 86, 1)',
              'rgba(153, 102, 255, 1)',
              'rgba(255, 159, 64, 1)',
              'rgba(102, 187, 106, 1)',
              'rgba(238, 130, 238, 1)',
              'rgba(150, 150, 150, 1)'
            ];
            
            const colorIndex = idx % colorPalette.length;
            
            return {
              label: category,
              data: [categoryCounts[category]],
              backgroundColor: colorPalette[colorIndex],
              borderColor: borderColorPalette[colorIndex],
              borderWidth: 1,
              category
            };
          });
          
          return {
            labels: ['単一値'],
            datasets
          };
        } else {
          // カテゴリなしの場合は従来通り
          return {
            labels: ['単一値'],
            datasets: [
              {
                label: `値 = ${singleValue}`,
                data: [values.length],
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
              }
            ],
          };
        }
      }
      
      // 各ビンの境界を計算
      const binBoundaries = Array.from({ length: bins + 1 }, (_, i) => min + i * binWidth);
      
      // 各ビンの中央値を計算（ラベル用）
      const binCenters = Array.from({ length: bins }, (_, i) => 
        min + (i + 0.5) * binWidth
      );
      
      // カテゴリがある場合
      if (hasCategories) {
        // カテゴリごとのビンカウントを初期化
        const categoryBinCounts: { [key: string]: number[] } = {};
        
        // カテゴリの一覧を取得
        const uniqueCategories = [...new Set(dataPoints.map(p => p.category))];
        
        // 各カテゴリのビンカウントを初期化
        uniqueCategories.forEach(category => {
          categoryBinCounts[category] = Array(bins).fill(0);
        });
        
        // 各データポイントを対応するビンに割り当て
        dataPoints.forEach(point => {
          const value = point.value;
          const category = point.category;
          
          if (value === max) {
            // 最大値は最後のビンに割り当て
            categoryBinCounts[category][bins - 1]++;
          } else {
            // どのビンに属するか計算
            const binIndex = Math.floor((value - min) / binWidth);
            // インデックスが範囲外にならないようにする
            if (binIndex >= 0 && binIndex < bins) {
              categoryBinCounts[category][binIndex]++;
            }
          }
        });
        
        // ビン境界のラベルを作成
        const labels = binCenters.map((center, i) => {
          const lower = binBoundaries[i].toFixed(2);
          const upper = binBoundaries[i + 1].toFixed(2);
          return `${lower} - ${upper}`;
        });
        
        // カラーパレットの定義
        const colorPalette = [
          'rgba(54, 162, 235, 0.6)', // 青
          'rgba(255, 99, 132, 0.6)', // 赤
          'rgba(75, 192, 192, 0.6)', // ティール
          'rgba(255, 206, 86, 0.6)', // 黄
          'rgba(153, 102, 255, 0.6)', // 紫
          'rgba(255, 159, 64, 0.6)', // オレンジ
          'rgba(102, 187, 106, 0.6)', // 緑
          'rgba(238, 130, 238, 0.6)', // バイオレット
          'rgba(150, 150, 150, 0.6)' // グレー
        ];
        
        const borderColorPalette = [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)',
          'rgba(102, 187, 106, 1)',
          'rgba(238, 130, 238, 1)',
          'rgba(150, 150, 150, 1)'
        ];
        
        // カテゴリごとのデータセットを作成
        const datasets = uniqueCategories.map((category, idx) => {
          const colorIndex = idx % colorPalette.length;
          
          return {
            label: category,
            data: categoryBinCounts[category],
            backgroundColor: colorPalette[colorIndex],
            borderColor: borderColorPalette[colorIndex],
            borderWidth: 1,
            category: category // カテゴリ情報を明示的に追加
          };
        });
        
        return {
          labels,
          datasets
        };
      } else {
        // カテゴリなしの場合は従来通りの処理
        // 各ビンのカウントを初期化
        const binCounts = Array(bins).fill(0);
        
        // 値を対応するビンに割り当て
        values.forEach(value => {
          if (value === max) {
            // 最大値は最後のビンに割り当て
            binCounts[bins - 1]++;
          } else {
            // どのビンに属するか計算
            const binIndex = Math.floor((value - min) / binWidth);
            // インデックスが範囲外にならないようにする
            if (binIndex >= 0 && binIndex < bins) {
              binCounts[binIndex]++;
            } else {
              console.warn(`範囲外のビンインデックス: ${binIndex}, 値: ${value}`);
            }
          }
        });
        
        // ラベルとして各ビンの範囲を表示
        const labels = binBoundaries.slice(0, -1).map((start, i) => 
          `${start.toFixed(2)} - ${binBoundaries[i + 1].toFixed(2)}`
        );
        
        console.log('ヒストグラム生成:', { labels, counts: binCounts });
        
        return {
          labels,
          datasets: [
            {
              label: `${valueField} の分布`,
              data: binCounts,
              backgroundColor: 'rgba(54, 162, 235, 0.6)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1,
              barPercentage: 1.0,
              categoryPercentage: 1.0,
              category: 'histogram' // カテゴリ情報を追加
            }
          ],
        };
      }
    }
    
    case 'gantt': {
      // ガントチャート用のフィールド
      const startDateField = options?.startDateField || 'startDate';
      const endDateField = options?.endDateField || 'endDate';
      
      // タスク名と日付を抽出
      const taskNames = data.map(item => item[labelField]);
      const startDates = data.map(item => new Date(item[startDateField]));
      const endDates = data.map(item => new Date(item[endDateField]));
      
      // 開始日が存在しない、または無効な場合は処理をスキップ
      if (startDates.some(date => !(date instanceof Date) || isNaN(date.getTime()))) {
        return null;
      }
      
      // 終了日が存在しない、または無効な場合は処理をスキップ
      if (endDates.some(date => !(date instanceof Date) || isNaN(date.getTime()))) {
        return null;
      }
      
      // 各タスクのデータを作成
      const ganttData = taskNames.map((task, index) => {
        const start = startDates[index];
        const end = endDates[index];
        const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24); // 日数で表現
        
        return {
          x: task,
          y: [start, end],
          duration
        };
      });
      
      // カテゴリフィールドが指定されている場合、カテゴリごとに色分け
      let datasets = [];
      
      if (categoryField) {
        const categories = [...new Set(data.map(item => item[categoryField]))];
        
        datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => item[categoryField] === category);
          const categoryGanttData = categoryData.map(item => {
            const start = new Date(item[startDateField]);
            const end = new Date(item[endDateField]);
            const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
            
            return {
              x: item[labelField],
              y: [start, end],
              duration
            };
          });
          
          return {
            label: String(category),
            data: categoryGanttData,
            backgroundColor: colorPalette[index % colorPalette.length],
            borderColor: borderColorPalette[index % borderColorPalette.length],
            borderWidth: 1,
          };
        });
      } else {
        datasets = [
          {
            label: 'タスク',
            data: ganttData,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          }
        ];
      }
      
      return {
        labels: taskNames,
        datasets,
      };
    }
    
    case 'bar':
    default: {
      const labels = data.map(item => item[labelField]);
      const values = data.map(item => item[valueField]);
      
      // カテゴリフィールドが指定されている場合、カテゴリごとに色分け
      if (categoryField) {
        const categories = [...new Set(data.map(item => item[categoryField]))];
        
        // カテゴリごとのデータセットを作成
        const datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => item[categoryField] === category);
          const categoryLabels = categoryData.map(item => item[labelField]);
          const categoryValues = categoryData.map(item => item[valueField]);
          
          // カテゴリごとにデータポイントをマッピング
          const dataPoints = labels.map(label => {
            const idx = categoryLabels.indexOf(label);
            return idx !== -1 ? categoryValues[idx] : null;
          });
          
          return {
            label: String(category),
            data: dataPoints,
            backgroundColor: colorPalette[index % colorPalette.length],
            borderColor: borderColorPalette[index % borderColorPalette.length],
            borderWidth: 1,
          };
        });
        
        return {
          labels,
          datasets,
        };
      }
      
      // カテゴリがない場合は単一のデータセット
      return {
        labels,
        datasets: [
          {
            label: valueField,
            data: values,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          },
        ],
      };
    }
  }
};
