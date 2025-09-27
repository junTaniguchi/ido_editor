'use client';

import { jStat } from 'jstat';
import { parseWKT } from '@loaders.gl/gis';
import type { MapAggregation } from '@/types';

// 複数ファイル対応のSQL風クエリ処理を実装
const executeMultiFileQuery = (fileDataMap: Map<string, any[]>, combinedData: any[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  
  // JOIN構文の検出
  const joinMatch = normalizedQuery.match(/from\s+(\w+)\s+((?:inner\s+|left\s+|right\s+)?join\s+\w+\s+on\s+[^where]+)/i);
  
  if (joinMatch) {
    return executeJoinQuery(fileDataMap, query, normalizedQuery);
  }
  
  // 通常のFROM句の処理
  const fromMatch = normalizedQuery.match(/from\s+([^\s\(\)]+)/i);
  
  if (fromMatch) {
    const tableName = fromMatch[1].trim();
    
    // 特定のファイル名が指定されている場合
    if (tableName !== 'data' && tableName !== 'combined') {
      const targetData = findFileData(fileDataMap, tableName);
      if (targetData.length === 0) {
        throw new Error(`指定されたファイル "${tableName}" が見つかりません`);
      }
      return executeSimpleSelectQuery(targetData, query);
    }
  }
  
  // デフォルトは統合データを使用
  return executeSimpleSelectQuery(combinedData, query);
};

// ファイルデータを名前で検索
const findFileData = (fileDataMap: Map<string, any[]>, fileName: string): any[] => {
  for (const [filePath, data] of fileDataMap.entries()) {
    const currentFileName = filePath.split('/').pop() || filePath;
    const baseFileName = currentFileName.replace(/\.[^/.]+$/, ''); // 拡張子を除去
    
    if (baseFileName.toLowerCase() === fileName.toLowerCase() ||
        currentFileName.toLowerCase() === fileName.toLowerCase()) {
      return data;
    }
  }
  return [];
};

// JOIN クエリの実行
const executeJoinQuery = (fileDataMap: Map<string, any[]>, originalQuery: string, normalizedQuery: string) => {
  // JOIN構文の解析
  const joinParsed = parseJoinQuery(normalizedQuery);
  if (!joinParsed) {
    throw new Error('JOIN構文の解析に失敗しました');
  }

  // 左側テーブル（FROM句）のデータを取得
  const leftData = findFileData(fileDataMap, joinParsed.leftTable);
  if (leftData.length === 0) {
    throw new Error(`左側テーブル "${joinParsed.leftTable}" が見つかりません`);
  }

  // 右側テーブル（JOIN句）のデータを取得
  const rightData = findFileData(fileDataMap, joinParsed.rightTable);
  if (rightData.length === 0) {
    throw new Error(`右側テーブル "${joinParsed.rightTable}" が見つかりません`);
  }

  // JOIN実行
  const joinedData = performJoin(
    leftData, 
    rightData, 
    joinParsed.leftColumn, 
    joinParsed.rightColumn, 
    joinParsed.joinType,
    joinParsed.leftTable,
    joinParsed.rightTable
  );

  // SELECT、WHERE句などの処理
  return executeSimpleSelectQuery(joinedData, originalQuery);
};

// JOIN構文の解析
const parseJoinQuery = (normalizedQuery: string) => {
  // FROM table1 [INNER|LEFT|RIGHT] JOIN table2 ON table1.col = table2.col
  const joinRegex = /from\s+(\w+)\s+(inner\s+join|left\s+join|right\s+join|join)\s+(\w+)\s+on\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i;
  const match = normalizedQuery.match(joinRegex);
  
  if (!match) {
    // シンプルなJOIN構文もサポート: FROM table1 JOIN table2 ON col1 = col2
    const simpleJoinRegex = /from\s+(\w+)\s+(inner\s+join|left\s+join|right\s+join|join)\s+(\w+)\s+on\s+(\w+)\s*=\s*(\w+)/i;
    const simpleMatch = normalizedQuery.match(simpleJoinRegex);
    
    if (simpleMatch) {
      return {
        leftTable: simpleMatch[1],
        joinType: simpleMatch[2].replace(/\s+/g, '_').toLowerCase() as 'join' | 'inner_join' | 'left_join' | 'right_join',
        rightTable: simpleMatch[3],
        leftColumn: simpleMatch[4],
        rightColumn: simpleMatch[5]
      };
    }
    return null;
  }

  return {
    leftTable: match[1],
    joinType: match[2].replace(/\s+/g, '_').toLowerCase() as 'join' | 'inner_join' | 'left_join' | 'right_join',
    rightTable: match[3],
    leftTable2: match[4], // テーブル名付きの場合
    leftColumn: match[5],
    rightTable2: match[6], // テーブル名付きの場合
    rightColumn: match[7]
  };
};

// 実際のJOIN処理
const performJoin = (
  leftData: any[], 
  rightData: any[], 
  leftColumn: string, 
  rightColumn: string, 
  joinType: string,
  leftTableName: string,
  rightTableName: string
): any[] => {
  const result: any[] = [];

  switch (joinType) {
    case 'join':
    case 'inner_join':
      // INNER JOIN
      leftData.forEach(leftRow => {
        rightData.forEach(rightRow => {
          if (leftRow[leftColumn] === rightRow[rightColumn]) {
            // 列名の競合を避けるため、テーブル名をプレフィックスとして追加
            const joinedRow: any = {};
            
            // 左テーブルの列
            Object.keys(leftRow).forEach(key => {
              joinedRow[`${leftTableName}_${key}`] = leftRow[key];
              // エイリアスなしでも参照可能（左優先）
              if (!joinedRow.hasOwnProperty(key)) {
                joinedRow[key] = leftRow[key];
              }
            });
            
            // 右テーブルの列
            Object.keys(rightRow).forEach(key => {
              joinedRow[`${rightTableName}_${key}`] = rightRow[key];
              // エイリアスなしでも参照可能（左優先）
              if (!joinedRow.hasOwnProperty(key)) {
                joinedRow[key] = rightRow[key];
              }
            });
            
            result.push(joinedRow);
          }
        });
      });
      break;

    case 'left_join':
      // LEFT JOIN
      leftData.forEach(leftRow => {
        let hasMatch = false;
        rightData.forEach(rightRow => {
          if (leftRow[leftColumn] === rightRow[rightColumn]) {
            hasMatch = true;
            const joinedRow: any = {};
            
            // 左テーブルの列
            Object.keys(leftRow).forEach(key => {
              joinedRow[`${leftTableName}_${key}`] = leftRow[key];
              if (!joinedRow.hasOwnProperty(key)) {
                joinedRow[key] = leftRow[key];
              }
            });
            
            // 右テーブルの列
            Object.keys(rightRow).forEach(key => {
              joinedRow[`${rightTableName}_${key}`] = rightRow[key];
              if (!joinedRow.hasOwnProperty(key)) {
                joinedRow[key] = rightRow[key];
              }
            });
            
            result.push(joinedRow);
          }
        });
        
        // マッチしない場合はNULLで埋める
        if (!hasMatch) {
          const joinedRow: any = {};
          
          // 左テーブルの列
          Object.keys(leftRow).forEach(key => {
            joinedRow[`${leftTableName}_${key}`] = leftRow[key];
            if (!joinedRow.hasOwnProperty(key)) {
              joinedRow[key] = leftRow[key];
            }
          });
          
          // 右テーブルの列（NULL埋め）
          if (rightData.length > 0) {
            Object.keys(rightData[0]).forEach(key => {
              joinedRow[`${rightTableName}_${key}`] = null;
              if (!joinedRow.hasOwnProperty(key)) {
                joinedRow[key] = null;
              }
            });
          }
          
          result.push(joinedRow);
        }
      });
      break;

    case 'right_join':
      // RIGHT JOIN (LEFT JOINの逆)
      rightData.forEach(rightRow => {
        let hasMatch = false;
        leftData.forEach(leftRow => {
          if (leftRow[leftColumn] === rightRow[rightColumn]) {
            hasMatch = true;
            const joinedRow: any = {};
            
            // 左テーブルの列
            Object.keys(leftRow).forEach(key => {
              joinedRow[`${leftTableName}_${key}`] = leftRow[key];
              if (!joinedRow.hasOwnProperty(key)) {
                joinedRow[key] = leftRow[key];
              }
            });
            
            // 右テーブルの列
            Object.keys(rightRow).forEach(key => {
              joinedRow[`${rightTableName}_${key}`] = rightRow[key];
              if (!joinedRow.hasOwnProperty(key)) {
                joinedRow[key] = rightRow[key];
              }
            });
            
            result.push(joinedRow);
          }
        });
        
        // マッチしない場合はNULLで埋める
        if (!hasMatch) {
          const joinedRow: any = {};
          
          // 左テーブルの列（NULL埋め）
          if (leftData.length > 0) {
            Object.keys(leftData[0]).forEach(key => {
              joinedRow[`${leftTableName}_${key}`] = null;
              if (!joinedRow.hasOwnProperty(key)) {
                joinedRow[key] = null;
              }
            });
          }
          
          // 右テーブルの列
          Object.keys(rightRow).forEach(key => {
            joinedRow[`${rightTableName}_${key}`] = rightRow[key];
            if (!joinedRow.hasOwnProperty(key)) {
              joinedRow[key] = rightRow[key];
            }
          });
          
          result.push(joinedRow);
        }
      });
      break;
  }

  return result;
};

// 基本的なSELECT文のパース処理
const executeSimpleSelectQuery = (data: any[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  
  if (normalizedQuery.startsWith('select')) {
    // WHERE句の処理
    const whereMatch = normalizedQuery.match(/where\s+(.+?)(?:\s+group\s+by|\s+order\s+by|$)/);
    let filteredData = data;
    
    if (whereMatch) {
      const whereClause = whereMatch[1];
      filteredData = data.filter(row => {
        try {
          return evaluateWhereClause(row, whereClause);
        } catch (e) {
          return true;
        }
      });
    }
    
    let resultData: any[] = filteredData;
    
    // GROUP BY句の処理
    const groupByMatch = normalizedQuery.match(/group\s+by\s+([^order]+?)(?:\s+order\s+by|$)/);
    if (groupByMatch) {
      const groupByColumns = groupByMatch[1].split(',').map(col => col.trim());
      resultData = groupDataByColumns(filteredData, groupByColumns, query);
    } else {
      // SELECT句の処理
      const selectMatch = normalizedQuery.match(/select\s+(.+?)(?:\s+from|$)/);
      if (selectMatch) {
        const selectClause = selectMatch[1].trim();
        
        if (selectClause !== '*') {
          // 特定の列を選択
          const columns = selectClause.split(',').map(col => col.trim());
          resultData = filteredData.map(row => {
            const filteredRow: any = {};
            columns.forEach(col => {
              if (row.hasOwnProperty(col)) {
                filteredRow[col] = row[col];
              }
            });
            return filteredRow;
          });
        }
      }
    }
    
    // LIMIT/OFFSET句の処理
    const limitOffsetMatch = normalizedQuery.match(/limit\s+(\d+)\s+offset\s+(\d+)/);
    const limitCommaMatch = normalizedQuery.match(/limit\s+(\d+)\s*,\s*(\d+)/);
    const simpleLimitMatch = normalizedQuery.match(/limit\s+(\d+)/);
    
    let limit: number | null = null;
    let offset = 0;
    
    if (limitOffsetMatch) {
      limit = parseInt(limitOffsetMatch[1], 10);
      offset = parseInt(limitOffsetMatch[2], 10);
    } else if (limitCommaMatch) {
      offset = parseInt(limitCommaMatch[1], 10);
      limit = parseInt(limitCommaMatch[2], 10);
    } else if (simpleLimitMatch) {
      limit = parseInt(simpleLimitMatch[1], 10);
    }
    
    if (limit !== null && !isNaN(limit)) {
      const start = Math.max(offset, 0);
      const end = start + Math.max(limit, 0);
      return resultData.slice(start, end);
    }
    
    return resultData;
  }
  
  return data;
};

// GROUP BY処理
const groupDataByColumns = (data: any[], groupByColumns: string[], originalQuery: string) => {
  const grouped = new Map<string, any[]>();
  
  // データをグループ化
  data.forEach(row => {
    const key = groupByColumns.map(col => String(row[col] || '')).join('|');
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)?.push(row);
  });
  
  // SELECT句から集計関数を抽出
  const selectMatch = originalQuery.toLowerCase().match(/select\s+(.+?)(?:\s+from|$)/);
  if (!selectMatch) return [];
  
  const selectClause = selectMatch[1];
  const aggregations = extractAggregations(selectClause);
  
  // グループごとに集計を実行
  const result: any[] = [];
  grouped.forEach((groupRows, key) => {
    const keyValues = key.split('|');
    const resultRow: any = {};
    
    // GROUP BYの列を設定
    groupByColumns.forEach((col, index) => {
      resultRow[col] = groupRows[0][col];
    });
    
    // 集計関数を計算
    aggregations.forEach(agg => {
      switch (agg.func.toLowerCase()) {
        case 'count':
          resultRow[agg.alias] = groupRows.length;
          break;
        case 'sum':
          resultRow[agg.alias] = groupRows.reduce((sum, row) => {
            return sum + (parseFloat(row[agg.column]) || 0);
          }, 0);
          break;
        case 'avg':
          const sum = groupRows.reduce((s, row) => s + (parseFloat(row[agg.column]) || 0), 0);
          resultRow[agg.alias] = sum / groupRows.length;
          break;
        case 'max':
          resultRow[agg.alias] = Math.max(...groupRows.map(row => parseFloat(row[agg.column]) || 0));
          break;
        case 'min':
          resultRow[agg.alias] = Math.min(...groupRows.map(row => parseFloat(row[agg.column]) || 0));
          break;
      }
    });
    
    result.push(resultRow);
  });
  
  return result;
};

// 集計関数の抽出
const extractAggregations = (selectClause: string) => {
  const aggregations: Array<{func: string, column: string, alias: string}> = [];
  
  // COUNT(*)の処理
  const countStarMatch = selectClause.match(/count\(\s*\*\s*\)(?:\s+as\s+(\w+))?/i);
  if (countStarMatch) {
    aggregations.push({
      func: 'COUNT',
      column: '*',
      alias: countStarMatch[1] || 'count'
    });
  }
  
  // その他の集計関数の処理
  const aggRegex = /(count|sum|avg|max|min)\(\s*(\w+)\s*\)(?:\s+as\s+(\w+))?/gi;
  let match;
  while ((match = aggRegex.exec(selectClause)) !== null) {
    aggregations.push({
      func: match[1],
      column: match[2],
      alias: match[3] || `${match[1]}_${match[2]}`
    });
  }
  
  return aggregations;
};

// 簡易WHERE句評価
const evaluateWhereClause = (row: any, whereClause: string): boolean => {
  // 基本的な比較演算子をサポート
  const operators = ['>=', '<=', '!=', '=', '>', '<'];
  
  for (const op of operators) {
    if (whereClause.includes(op)) {
      const parts = whereClause.split(op).map(p => p.trim());
      if (parts.length === 2) {
        const column = parts[0];
        let value = parts[1];
        
        // 文字列リテラルの処理
        if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        } else if (!isNaN(Number(value))) {
          value = Number(value);
        }
        
        const rowValue = row[column];
        
        switch (op) {
          case '=':
            return rowValue == value;
          case '!=':
            return rowValue != value;
          case '>':
            return Number(rowValue) > Number(value);
          case '<':
            return Number(rowValue) < Number(value);
          case '>=':
            return Number(rowValue) >= Number(value);
          case '<=':
            return Number(rowValue) <= Number(value);
        }
      }
    }
  }
  
  return true;
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
    const result = executeSimpleSelectQuery(processedData, query);
    return { data: result, error: null };
  } catch (error) {
    console.error('Error executing SQL query:', error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : 'クエリ実行エラー'
    };
  }
};

// 複数ファイル対応のクエリ実行関数
export const executeMultiFileQueryAnalysis = (
  fileDataMap: Map<string, any[]>, 
  combinedData: any[], 
  query: string, 
  enableNestedAccess: boolean = true
) => {
  try {
    // ネストされたプロパティへのアクセスが必要な場合
    const processedCombinedData = enableNestedAccess ? flattenObjectsWithDotNotation(combinedData) : combinedData;
    let processedFileDataMap = new Map<string, any[]>();
    
    if (enableNestedAccess) {
      fileDataMap.forEach((data, filePath) => {
        processedFileDataMap.set(filePath, flattenObjectsWithDotNotation(data));
      });
    } else {
      processedFileDataMap = fileDataMap;
    }
    
    // 複数ファイル対応のSQL処理を使用
    const result = executeMultiFileQuery(processedFileDataMap, processedCombinedData, query);
    return { data: result, error: null };
  } catch (error) {
    console.error('Error executing multi-file SQL query:', error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : '複数ファイルクエリ実行エラー'
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
  chartType:
    | 'bar'
    | 'line'
    | 'pie'
    | 'scatter'
    | 'stacked-bar'
    | 'regression'
    | 'histogram'
    | 'gantt'
    | 'treemap'
    | 'streamgraph'
    | 'venn' = 'bar',
  categoryField?: string,
  options?: {
    bins?: number;  // ヒストグラム用のビン数
    regressionType?: 'linear' | 'exponential' | 'polynomial' | 'power' | 'logarithmic'; // 回帰分析のタイプ
    regressionOrder?: number; // 多項式回帰の次数
    startDateField?: string;  // ガントチャート用の開始日フィールド
    endDateField?: string;    // ガントチャート用の終了日フィールド
    taskNameField?: string;   // ガントチャート用のタスク名フィールド
  }
) => {
  if (!data || data.length === 0) {
    return null;
  }
  
  // categoryFieldが空文字列の場合はundefinedに変換
  const normalizedCategoryField = categoryField && categoryField.trim() !== '' 
    ? categoryField 
    : undefined;
  
  // valueFieldが空文字列またはundefinedの場合、頻度分析用に'value'フィールドを使用
  const actualValueField = (!valueField || valueField.trim() === '') ? 'value' : valueField;
  
  // データの初期確認（デバッグ用）
  console.log('チャートデータ準備 - 入力データ確認:', {
    データ型: chartType,
    レコード数: data.length,
    X軸フィールド: labelField,
    Y軸フィールド: valueField,
    実際のY軸フィールド: actualValueField,
    カテゴリフィールド: normalizedCategoryField,
    サンプルデータ: data.slice(0, 3).map(item => {
      try {
        return {
          [labelField]: item[labelField],
          [valueField]: item[valueField],
          [actualValueField]: item[actualValueField],
          [normalizedCategoryField || 'カテゴリなし']: normalizedCategoryField ? item[normalizedCategoryField] : 'なし'
        };
      } catch (e) {
        return { error: 'データアクセスエラー' };
      }
    })
  });

  // データの妥当性チェック
  if (!labelField && chartType !== 'venn') {
    console.error('X軸フィールドが指定されていません');
    return null;
  }

  try {
  
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
      const values = data.map(item => item[actualValueField]);
      
      // カテゴリフィールドが指定されている場合、カテゴリごとに色分け
      if (normalizedCategoryField) {
        // undefinedやnullを除外して、有効なカテゴリ値のみを取得
        const categories = [...new Set(
          data
            .map(item => item[normalizedCategoryField])
            .filter(cat => cat !== undefined && cat !== null && cat !== '')
            .map(cat => String(cat))
        )];
        
        console.log('積み上げ棒グラフのカテゴリ:', {
          カテゴリフィールド: normalizedCategoryField,
          カテゴリ一覧: categories,
          カテゴリ数: categories.length,
          サンプルデータのカテゴリ値: data.slice(0, 5).map(item => item[normalizedCategoryField])
        });
        
        // カテゴリごとのデータセットを作成
        const datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => 
            item[normalizedCategoryField] !== undefined && 
            item[normalizedCategoryField] !== null &&
            String(item[normalizedCategoryField]) === category
          );
          
          // 頻度分析の場合（valueFieldが空またはvalueフィールドが存在しない場合）
          const isFrequencyAnalysis = (!valueField || valueField.trim() === '') || 
                                     !categoryData.some(item => item.hasOwnProperty(actualValueField));
          
          let dataPoints;
          if (isFrequencyAnalysis) {
            // 頻度分析：X軸の各ラベルについて、このカテゴリの出現回数をカウント
            dataPoints = labels.map(label => {
              return categoryData.filter(item => String(item[labelField]) === String(label)).length;
            });
          } else {
            // 通常の分析：集計済みデータを使用
            const categoryLabels = categoryData.map(item => item[labelField]);
            const categoryValues = categoryData.map(item => item[actualValueField]);
            
            dataPoints = labels.map(label => {
              const idx = categoryLabels.indexOf(label);
              return idx !== -1 ? categoryValues[idx] : 0; // nullではなく0を使用（積み上げのため）
            });
          }
          
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
            label: actualValueField,
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
      const values = data.map(item => item[actualValueField]);
      
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
            label: actualValueField,
            data: values,
            backgroundColor: backgroundColor.slice(0, labels.length),
            borderColor: borderColor.slice(0, labels.length),
            borderWidth: 1,
          },
        ],
      };
    }
    
    case 'line': {
      // 数値フィールドを使った頻度分析の場合の特別処理
      const hasNumericData = data.length > 0 && data.some(item => 
        item[labelField] !== undefined && 
        item[labelField] !== null && 
        typeof item[labelField] === 'number' && 
        !isNaN(item[labelField])
      );
      const isNumericFrequencyAnalysis = (!valueField || valueField.trim() === '') && hasNumericData;
      
      let labels, values;
      
      if (isNumericFrequencyAnalysis) {
        try {
          // 数値フィールドをビン化して頻度分析
          const numericValues = data.map(item => item[labelField]).filter(val => typeof val === 'number' && !isNaN(val));
          
          if (numericValues.length === 0) {
            console.warn('数値データが見つかりません:', labelField);
            // 通常処理にフォールバック
            labels = data.map(item => String(item[labelField] || ''));
            values = data.map(item => item[actualValueField] || 0);
          } else {
            const min = Math.min(...numericValues);
            const max = Math.max(...numericValues);
            
            // 最小値と最大値が同じ場合の処理
            if (min === max) {
              labels = [String(min)];
              values = [numericValues.length];
            } else {
              const binCount = Math.min(10, Math.max(5, Math.floor(Math.sqrt(numericValues.length)))); // 動的ビン数
              const binWidth = (max - min) / binCount;
              
              console.log('線グラフ - 数値フィールド頻度分析:', {
                フィールド: labelField,
                データ数: numericValues.length,
                最小値: min,
                最大値: max,
                ビン数: binCount,
                ビン幅: binWidth
              });
              
              // ビンラベルを作成
              labels = [];
              for (let i = 0; i < binCount; i++) {
                const binStart = min + i * binWidth;
                const binEnd = min + (i + 1) * binWidth;
                labels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
              }
              
              // 各ビンのカウントを計算
              values = new Array(binCount).fill(0);
              numericValues.forEach(val => {
                let binIndex = Math.floor((val - min) / binWidth);
                if (binIndex >= binCount) binIndex = binCount - 1; // 最大値の場合
                values[binIndex]++;
              });
            }
          }
        } catch (error) {
          console.error('線グラフ - 数値フィールド頻度分析エラー:', error);
          // エラー時は通常処理にフォールバック
          labels = data.map(item => String(item[labelField] || ''));
          values = data.map(item => item[actualValueField] || 0);
        }
      } else {
        // 通常の処理
        labels = data.map(item => item[labelField]);
        values = data.map(item => item[actualValueField]);
      }
      
      // カテゴリフィールドが指定されている場合、カテゴリごとに色分け
      if (normalizedCategoryField) {
        // undefinedやnullを除外して、有効なカテゴリ値のみを取得
        const categories = [...new Set(
          data
            .map(item => item[normalizedCategoryField])
            .filter(cat => cat !== undefined && cat !== null && cat !== '')
            .map(cat => String(cat))
        )];
        
        // カテゴリごとのデータセットを作成
        const datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => 
            item[normalizedCategoryField] !== undefined && 
            item[normalizedCategoryField] !== null &&
            String(item[normalizedCategoryField]) === category
          );
          
          let dataPoints;
          if (isNumericFrequencyAnalysis) {
            // 数値フィールド頻度分析：各ビンについて、このカテゴリの出現回数をカウント
            const categoryNumericValues = categoryData
              .map(item => item[labelField])
              .filter(val => typeof val === 'number' && !isNaN(val));
            
            const min = Math.min(...data.map(item => item[labelField]).filter(val => typeof val === 'number'));
            const max = Math.max(...data.map(item => item[labelField]).filter(val => typeof val === 'number'));
            const binCount = labels.length;
            const binWidth = (max - min) / binCount;
            
            dataPoints = new Array(binCount).fill(0);
            categoryNumericValues.forEach(val => {
              let binIndex = Math.floor((val - min) / binWidth);
              if (binIndex >= binCount) binIndex = binCount - 1;
              dataPoints[binIndex]++;
            });
            
          } else {
            // 頻度分析の場合（valueFieldが空またはvalueフィールドが存在しない場合）
            const isFrequencyAnalysis = (!valueField || valueField.trim() === '') || 
                                       !categoryData.some(item => item.hasOwnProperty(actualValueField));
            
            if (isFrequencyAnalysis) {
              // 頻度分析：X軸の各ラベルについて、このカテゴリの出現回数をカウント
              dataPoints = labels.map(label => {
                return categoryData.filter(item => String(item[labelField]) === String(label)).length;
              });
            } else {
              // 通常の分析：集計済みデータを使用
              const categoryLabels = categoryData.map(item => item[labelField]);
              const categoryValues = categoryData.map(item => item[actualValueField]);
              
              dataPoints = labels.map(label => {
                const idx = categoryLabels.indexOf(label);
                return idx !== -1 ? categoryValues[idx] : null;
              });
            }
          }
          
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
            label: actualValueField,
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
        カテゴリフィールド: normalizedCategoryField,
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
          category: normalizedCategoryField && item[normalizedCategoryField] !== undefined ? 
                    String(item[normalizedCategoryField]) : 
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
      if (normalizedCategoryField) {
        // categoryFieldが存在する項目のみから一意なカテゴリ値を抽出（undefinedやnullも除外）
        const categories = [...new Set(data
          .filter(item => 
            item[normalizedCategoryField as string] !== undefined && 
            item[normalizedCategoryField as string] !== null &&
            item[normalizedCategoryField as string] !== ''
          )
          .map(item => String(item[normalizedCategoryField as string]))
        )];
        
        const datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => 
            normalizedCategoryField !== undefined && 
            item[normalizedCategoryField as string] !== undefined &&
            item[normalizedCategoryField as string] !== null &&
            String(item[normalizedCategoryField as string]) === category
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
              if (normalizedCategoryField && !point.category) {
                const idx = scatterData.indexOf(point);
                const item = idx < data.length ? data[idx] : null;
                if (item && item[normalizedCategoryField as string] !== undefined) {
                  point.category = String(item[normalizedCategoryField as string]);
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
      const hasCategory = normalizedCategoryField && normalizedCategoryField !== '';
      
      // 散布図のデータポイント形式に変換
      const scatterData = xValues.map((x, i) => {
        const point: any = {
          x,
          y: yValues[i]
        };
        
        // カテゴリ情報があれば追加
        if (hasCategory && data[i]) {
          const categoryValue = data[i][normalizedCategoryField as string];
          point.category = categoryValue !== undefined ? String(categoryValue) : '';
        }
        
        return point;
      });
      
      // 回帰タイプを決定
      const regressionType = options?.regressionType || 'linear';
      const regressionOrder = options?.regressionOrder || 2; // 多項式回帰用
      
      // 回帰線の計算
      const regressionData = calculateRegressionLine(scatterData, regressionType, regressionOrder);
      
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
            label: `回帰線 (${getRegressionTypeLabel(regressionType)})`,
            data: regressionData,
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: regressionType === 'linear' ? 0 : 0.1,
            fill: false
          }
        ],
      };
    }
    
    case 'histogram': {
      // ヒストグラム用の値を抽出（カテゴリ情報も含める）
      const dataPoints = data.map(item => {
        const val = item[valueField];
        // カテゴリフィールドが指定されていれば、その値も含める
        const category = normalizedCategoryField ? String(item[normalizedCategoryField] || '') : '';
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
        categoryField: normalizedCategoryField || 'なし',
        hasCategoryData: !!normalizedCategoryField
      });
      
      // ビン数の決定（デフォルトは10）
      const bins = options?.bins || 10;
      
      // 最小値と最大値を取得
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      // ビンの幅を計算
      const binWidth = (max - min) / bins;
      
      // カテゴリがある場合は、カテゴリごとに処理
      const hasCategories = normalizedCategoryField && dataPoints.some(p => p.category);
      
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
      
      if (normalizedCategoryField) {
        const categories = [...new Set(data.map(item => item[normalizedCategoryField]))];
        
        datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => item[normalizedCategoryField] === category);
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
      // 数値フィールドを使った頻度分析の場合の特別処理
      const hasNumericData = data.length > 0 && data.some(item => 
        item[labelField] !== undefined && 
        item[labelField] !== null && 
        typeof item[labelField] === 'number' && 
        !isNaN(item[labelField])
      );
      const isNumericFrequencyAnalysis = (!valueField || valueField.trim() === '') && hasNumericData;
      
      let labels, values;
      
      if (isNumericFrequencyAnalysis) {
        try {
          // 数値フィールドをビン化して頻度分析
          const numericValues = data.map(item => item[labelField]).filter(val => typeof val === 'number' && !isNaN(val));
          
          if (numericValues.length === 0) {
            console.warn('数値データが見つかりません:', labelField);
            // 通常処理にフォールバック
            labels = data.map(item => String(item[labelField] || ''));
            values = data.map(item => item[actualValueField] || 0);
          } else {
            const min = Math.min(...numericValues);
            const max = Math.max(...numericValues);
            
            // 最小値と最大値が同じ場合の処理
            if (min === max) {
              labels = [String(min)];
              values = [numericValues.length];
            } else {
              const binCount = Math.min(10, Math.max(5, Math.floor(Math.sqrt(numericValues.length)))); // 動的ビン数
              const binWidth = (max - min) / binCount;
              
              console.log('数値フィールド頻度分析:', {
                フィールド: labelField,
                データ数: numericValues.length,
                最小値: min,
                最大値: max,
                ビン数: binCount,
                ビン幅: binWidth
              });
              
              // ビンラベルを作成
              labels = [];
              for (let i = 0; i < binCount; i++) {
                const binStart = min + i * binWidth;
                const binEnd = min + (i + 1) * binWidth;
                labels.push(`${binStart.toFixed(1)}-${binEnd.toFixed(1)}`);
              }
              
              // 各ビンのカウントを計算
              values = new Array(binCount).fill(0);
              numericValues.forEach(val => {
                let binIndex = Math.floor((val - min) / binWidth);
                if (binIndex >= binCount) binIndex = binCount - 1; // 最大値の場合
                values[binIndex]++;
              });
            }
          }
        } catch (error) {
          console.error('数値フィールド頻度分析エラー:', error);
          // エラー時は通常処理にフォールバック
          labels = data.map(item => String(item[labelField] || ''));
          values = data.map(item => item[actualValueField] || 0);
        }
      } else {
        // 通常の処理
        labels = data.map(item => item[labelField]);
        values = data.map(item => item[actualValueField]);
      }
      
      // カテゴリフィールドが指定されている場合、カテゴリごとに色分け
      if (normalizedCategoryField) {
        // undefinedやnullを除外して、有効なカテゴリ値のみを取得
        const categories = [...new Set(
          data
            .map(item => item[normalizedCategoryField])
            .filter(cat => cat !== undefined && cat !== null && cat !== '')
            .map(cat => String(cat))
        )];
        
        console.log('棒グラフ - カテゴリ分析:', {
          カテゴリフィールド: normalizedCategoryField,
          全データ数: data.length,
          有効カテゴリ: categories,
          カテゴリ数: categories.length,
          数値フィールド頻度分析: isNumericFrequencyAnalysis,
          サンプルデータのカテゴリ値: data.slice(0, 5).map(item => item[normalizedCategoryField])
        });
        
        // カテゴリごとのデータセットを作成
        const datasets = categories.map((category, index) => {
          const categoryData = data.filter(item => 
            item[normalizedCategoryField] !== undefined && 
            item[normalizedCategoryField] !== null &&
            String(item[normalizedCategoryField]) === category
          );
          
          let dataPoints;
          if (isNumericFrequencyAnalysis) {
            // 数値フィールド頻度分析：各ビンについて、このカテゴリの出現回数をカウント
            const categoryNumericValues = categoryData
              .map(item => item[labelField])
              .filter(val => typeof val === 'number' && !isNaN(val));
            
            const min = Math.min(...data.map(item => item[labelField]).filter(val => typeof val === 'number'));
            const max = Math.max(...data.map(item => item[labelField]).filter(val => typeof val === 'number'));
            const binCount = labels.length;
            const binWidth = (max - min) / binCount;
            
            dataPoints = new Array(binCount).fill(0);
            categoryNumericValues.forEach(val => {
              let binIndex = Math.floor((val - min) / binWidth);
              if (binIndex >= binCount) binIndex = binCount - 1;
              dataPoints[binIndex]++;
            });
            
          } else {
            // 頻度分析の場合（valueFieldが空またはvalueフィールドが存在しない場合）
            const isFrequencyAnalysis = (!valueField || valueField.trim() === '') || 
                                       !categoryData.some(item => item.hasOwnProperty(actualValueField));
            
            if (isFrequencyAnalysis) {
              // 頻度分析：X軸の各ラベルについて、このカテゴリの出現回数をカウント
              dataPoints = labels.map(label => {
                return categoryData.filter(item => String(item[labelField]) === String(label)).length;
              });
            } else {
              // 通常の分析：集計済みデータを使用
              const categoryLabels = categoryData.map(item => item[labelField]);
              const categoryValues = categoryData.map(item => item[actualValueField]);
              
              dataPoints = labels.map(label => {
                const idx = categoryLabels.indexOf(label);
                return idx !== -1 ? categoryValues[idx] : null;
              });
            }
          }
          
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
            label: actualValueField,
            data: values,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
          },
        ],
      };
    }

    case 'treemap': {
      const rootLabel = '全体';
      const hasNumericValues = data.some(item => {
        const raw = item[actualValueField];
        if (raw === undefined || raw === null) return false;
        if (typeof raw === 'number') return !isNaN(raw);
        const parsed = parseFloat(String(raw));
        return !isNaN(parsed);
      });

      const childMap = new Map<string, { label: string; parent: string; value: number }>();
      const parentTotals = new Map<string, number>();
      let totalValue = 0;

      data.forEach(item => {
        const rawLabel = item[labelField];
        if (rawLabel === undefined || rawLabel === null) {
          return;
        }
        const label = String(rawLabel);
        if (label.trim() === '') {
          return;
        }

        let parentLabel = rootLabel;
        if (normalizedCategoryField) {
          const rawParent = item[normalizedCategoryField];
          parentLabel =
            rawParent === undefined || rawParent === null || String(rawParent).trim() === ''
              ? '未分類'
              : String(rawParent);
        }

        let numericValue = 1;
        if (hasNumericValues) {
          const rawValue = item[actualValueField];
          if (rawValue === undefined || rawValue === null) {
            return;
          }
          if (typeof rawValue === 'number' && !isNaN(rawValue)) {
            numericValue = rawValue;
          } else {
            const parsed = parseFloat(String(rawValue));
            if (isNaN(parsed)) {
              return;
            }
            numericValue = parsed;
          }
        }

        const key = `${parentLabel}||${label}`;
        if (!childMap.has(key)) {
          childMap.set(key, { label, parent: parentLabel, value: 0 });
        }
        childMap.get(key)!.value += numericValue;

        if (normalizedCategoryField) {
          parentTotals.set(parentLabel, (parentTotals.get(parentLabel) ?? 0) + numericValue);
        }

        totalValue += numericValue;
      });

      if (childMap.size === 0) {
        return {
          labels: [],
          datasets: [],
          metadata: {
            error: 'ツリーマップを作成できるデータがありません',
          },
        };
      }

      const labels: string[] = [];
      const parents: string[] = [];
      const values: number[] = [];

      labels.push(rootLabel);
      parents.push('');
      values.push(totalValue);

      if (normalizedCategoryField) {
        parentTotals.forEach((value, parentLabel) => {
          labels.push(parentLabel);
          parents.push(rootLabel);
          values.push(value);
        });
      }

      childMap.forEach(entry => {
        labels.push(entry.label);
        parents.push(normalizedCategoryField ? entry.parent : rootLabel);
        values.push(entry.value);
      });

      const plotlyData = [
        {
          type: 'treemap',
          labels,
          parents,
          values,
          branchvalues: 'total',
          textinfo: 'label+value+percent parent',
          hovertemplate: '%{label}<br>値: %{value}<extra></extra>',
        },
      ];

      const layout = {
        margin: { t: 40, r: 0, l: 0, b: 0 },
      };

      return {
        labels,
        datasets: [],
        metadata: {
          plotly: {
            data: plotlyData,
            layout,
          },
        },
      };
    }

    case 'streamgraph': {
      const parseXEntry = (
        value: any,
      ): { label: string; sort: number | string; type: 'date' | 'number' | 'string' } => {
        if (value instanceof Date && !isNaN(value.getTime())) {
          return { label: value.toISOString().split('T')[0], sort: value.getTime(), type: 'date' };
        }
        if (typeof value === 'number' && !isNaN(value)) {
          return { label: String(value), sort: value, type: 'number' };
        }
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed === '') {
            return { label: trimmed, sort: trimmed, type: 'string' };
          }
          const parsedDate = Date.parse(trimmed);
          if (!isNaN(parsedDate)) {
            return { label: trimmed, sort: parsedDate, type: 'date' };
          }
          const parsedNumber = parseFloat(trimmed);
          if (!isNaN(parsedNumber)) {
            return { label: trimmed, sort: parsedNumber, type: 'number' };
          }
          return { label: trimmed, sort: trimmed, type: 'string' };
        }
        return { label: String(value ?? ''), sort: String(value ?? ''), type: 'string' };
      };

      const xEntryMap = new Map<
        string,
        { label: string; sort: number | string; type: 'date' | 'number' | 'string' }
      >();
      const categorySet = new Set<string>();
      const missingCategoryLabel = '未分類';
      const defaultCategoryLabel = '全体';

      data.forEach(item => {
        const rawLabel = item[labelField];
        if (rawLabel === undefined || rawLabel === null) {
          return;
        }
        const entry = parseXEntry(rawLabel);
        if (!xEntryMap.has(entry.label)) {
          xEntryMap.set(entry.label, entry);
        }

        const categoryLabel = normalizedCategoryField
          ? (() => {
              const rawCategory = item[normalizedCategoryField];
              if (rawCategory === undefined || rawCategory === null || String(rawCategory).trim() === '') {
                return missingCategoryLabel;
              }
              return String(rawCategory);
            })()
          : defaultCategoryLabel;

        categorySet.add(categoryLabel);
      });

      if (xEntryMap.size === 0) {
        return {
          labels: [],
          datasets: [],
          metadata: {
            error: 'ストリームグラフを作成できるX軸データが見つかりません',
          },
        };
      }

      const xEntries = Array.from(xEntryMap.values());
      xEntries.sort((a, b) => {
        if (a.type === 'date' && b.type === 'date') {
          return (a.sort as number) - (b.sort as number);
        }
        if (a.type === 'number' && b.type === 'number') {
          return (a.sort as number) - (b.sort as number);
        }
        if (typeof a.sort === 'number' && typeof b.sort === 'number') {
          return (a.sort as number) - (b.sort as number);
        }
        return String(a.sort).localeCompare(String(b.sort), 'ja');
      });

      const xLabels = xEntries.map(entry => entry.label);
      const xIndexMap = new Map<string, number>();
      xLabels.forEach((label, index) => xIndexMap.set(label, index));

      let categories = Array.from(categorySet);
      if (categories.length === 0) {
        categories = [defaultCategoryLabel];
      }
      const categoryIndexMap = new Map<string, number>();
      categories.forEach((category, index) => categoryIndexMap.set(category, index));

      const series = categories.map(() => new Array(xLabels.length).fill(0));

      const hasNumericValues = data.some(item => {
        const raw = item[actualValueField];
        if (raw === undefined || raw === null) return false;
        if (typeof raw === 'number') return !isNaN(raw);
        const parsed = parseFloat(String(raw));
        return !isNaN(parsed);
      });

      data.forEach(item => {
        const rawLabel = item[labelField];
        if (rawLabel === undefined || rawLabel === null) {
          return;
        }
        const parsedEntry = parseXEntry(rawLabel);
        const label = parsedEntry.label;
        const xIndex = xIndexMap.get(label);
        if (xIndex === undefined) {
          return;
        }

        const categoryLabel = normalizedCategoryField
          ? (() => {
              const rawCategory = item[normalizedCategoryField];
              if (rawCategory === undefined || rawCategory === null || String(rawCategory).trim() === '') {
                return missingCategoryLabel;
              }
              return String(rawCategory);
            })()
          : defaultCategoryLabel;

        const catIndex = categoryIndexMap.get(categoryLabel);
        if (catIndex === undefined) {
          return;
        }

        let numericValue: number | null = null;
        if (hasNumericValues) {
          const rawValue = item[actualValueField];
          if (typeof rawValue === 'number' && !isNaN(rawValue)) {
            numericValue = rawValue;
          } else if (rawValue !== undefined && rawValue !== null) {
            const parsed = parseFloat(String(rawValue));
            if (!isNaN(parsed)) {
              numericValue = parsed;
            }
          }
          if (numericValue === null) {
            return;
          }
        } else {
          numericValue = 1;
        }

        series[catIndex][xIndex] += numericValue;
      });

      const hasValues = series.some(values => values.some(value => Math.abs(value) > 0));
      if (!hasValues) {
        return {
          labels: xLabels,
          datasets: [],
          metadata: {
            error: 'ストリームグラフを作成できる数値データが見つかりません',
          },
        };
      }

      const axisType = xEntries.every(entry => entry.type === 'date')
        ? 'date'
        : xEntries.every(entry => entry.type === 'number')
          ? 'linear'
          : 'category';

      const streamColors = [
        { fill: 'rgba(37, 99, 235, 0.6)', line: 'rgba(37, 99, 235, 1)' },
        { fill: 'rgba(16, 185, 129, 0.6)', line: 'rgba(16, 185, 129, 1)' },
        { fill: 'rgba(239, 68, 68, 0.6)', line: 'rgba(239, 68, 68, 1)' },
        { fill: 'rgba(245, 158, 11, 0.6)', line: 'rgba(245, 158, 11, 1)' },
        { fill: 'rgba(139, 92, 246, 0.6)', line: 'rgba(139, 92, 246, 1)' },
        { fill: 'rgba(236, 72, 153, 0.6)', line: 'rgba(236, 72, 153, 1)' },
        { fill: 'rgba(20, 184, 166, 0.6)', line: 'rgba(20, 184, 166, 1)' },
        { fill: 'rgba(59, 130, 246, 0.6)', line: 'rgba(59, 130, 246, 1)' },
      ];

      const traces = categories.map((category, index) => ({
        type: 'scatter',
        mode: 'lines',
        x: xLabels,
        y: series[index],
        name: category,
        stackgroup: 'stream',
        line: {
          color: streamColors[index % streamColors.length].line,
          width: 1.5,
          shape: 'spline',
          smoothing: 0.4,
        },
        fill: index === 0 ? 'tozeroy' : 'tonexty',
        fillcolor: streamColors[index % streamColors.length].fill,
        hoverinfo: 'x+y+name',
        opacity: 0.9,
      }));

      const layout = {
        showlegend: true,
        hovermode: 'x unified',
        margin: { t: 40, r: 30, b: 40, l: 50 },
        xaxis: {
          title: labelField,
          type: axisType === 'category' ? 'category' : axisType,
          tickangle: xLabels.length > 10 ? -45 : 0,
        },
        yaxis: {
          title: hasNumericValues ? (valueField || actualValueField) : '件数',
          zeroline: false,
        },
      };

      return {
        labels: xLabels,
        datasets: [],
        metadata: {
          plotly: {
            data: traces,
            layout,
          },
        },
      };
    }

    case 'venn': {
      const rawFields = options?.vennFields?.filter(field => field && field.trim() !== '') || [];
      const vennFields = Array.from(new Set(rawFields.map(field => field.trim()))).slice(0, 3);

      if (vennFields.length < 2) {
        return {
          labels: [],
          datasets: [],
          metadata: {
            error: 'ベン図を作成するには2つ以上（最大3つ）のフィールドを選択してください',
          },
        };
      }

      const truthyValues = new Set([
        'true',
        '1',
        'yes',
        'y',
        'on',
        't',
        'ok',
        'はい',
        '有',
        'あり',
        '○',
        '◯',
        '〇',
        '✔',
        '✓',
      ]);
      const falsyValues = new Set(['false', '0', 'no', 'n', 'off', 'f', 'いいえ', '無', 'なし', '×', '✗']);

      const isTruthy = (value: any): boolean => {
        if (value === undefined || value === null) return false;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object') return Object.keys(value).length > 0;
        const normalized = String(value).trim().toLowerCase();
        if (normalized === '') return false;
        if (truthyValues.has(normalized)) return true;
        if (falsyValues.has(normalized)) return false;
        const numeric = Number(normalized);
        if (!isNaN(numeric)) {
          return numeric !== 0;
        }
        return normalized.length > 0;
      };

      const combinationCounts = new Map<string, number>();
      data.forEach(item => {
        const membership: number[] = [];
        vennFields.forEach((field, index) => {
          if (isTruthy(item[field])) {
            membership.push(index);
          }
        });
        if (membership.length === 0) {
          return;
        }
        const key = membership.join('');
        combinationCounts.set(key, (combinationCounts.get(key) ?? 0) + 1);
      });

      const totalMembers = Array.from(combinationCounts.values()).reduce((sum, val) => sum + val, 0);
      if (totalMembers === 0) {
        return {
          labels: [],
          datasets: [],
          metadata: {
            error: 'ベン図を作成できるデータが見つかりません',
          },
        };
      }

      const ensureKey = (key: string) => {
        if (!combinationCounts.has(key)) {
          combinationCounts.set(key, 0);
        }
      };

      if (vennFields.length === 2) {
        ['0', '1', '01'].forEach(ensureKey);
      } else if (vennFields.length === 3) {
        ['0', '1', '2', '01', '02', '12', '012'].forEach(ensureKey);
      }

      const countsByKey: Record<string, number> = {};
      combinationCounts.forEach((value, key) => {
        countsByKey[key] = value;
      });

      const setTotals = vennFields.map((_, index) => {
        let total = 0;
        combinationCounts.forEach((count, key) => {
          if (key.includes(String(index))) {
            total += count;
          }
        });
        return total;
      });

      const vennColors = [
        { fill: 'rgba(99, 102, 241, 0.35)', line: 'rgba(99, 102, 241, 0.85)' },
        { fill: 'rgba(16, 185, 129, 0.35)', line: 'rgba(16, 185, 129, 0.85)' },
        { fill: 'rgba(239, 68, 68, 0.35)', line: 'rgba(239, 68, 68, 0.85)' },
      ];

      const circleDefs = vennFields.length === 2
        ? [
            { cx: -1.4, cy: 0, r: 1.8 },
            { cx: 1.4, cy: 0, r: 1.8 },
          ]
        : [
            { cx: -1.3, cy: -0.7, r: 1.9 },
            { cx: 1.3, cy: -0.7, r: 1.9 },
            { cx: 0, cy: 1.2, r: 1.9 },
          ];

      const shapes = circleDefs.map((circle, index) => ({
        type: 'circle' as const,
        xref: 'x',
        yref: 'y',
        x0: circle.cx - circle.r,
        y0: circle.cy - circle.r,
        x1: circle.cx + circle.r,
        y1: circle.cy + circle.r,
        line: { color: vennColors[index].line, width: 2 },
        fillcolor: vennColors[index].fill,
      }));

      const regionPositions: Record<string, { x: number; y: number }> =
        vennFields.length === 2
          ? {
              '0': { x: circleDefs[0].cx - 0.65, y: circleDefs[0].cy },
              '1': { x: circleDefs[1].cx + 0.65, y: circleDefs[1].cy },
              '01': { x: 0, y: 0 },
            }
          : {
              '0': { x: circleDefs[0].cx - 0.55, y: circleDefs[0].cy - 0.2 },
              '1': { x: circleDefs[1].cx + 0.55, y: circleDefs[1].cy - 0.2 },
              '2': { x: circleDefs[2].cx, y: circleDefs[2].cy + circleDefs[2].r - 0.2 },
              '01': { x: 0, y: circleDefs[0].cy - 0.35 },
              '02': { x: (circleDefs[0].cx + circleDefs[2].cx) / 2 - 0.2, y: (circleDefs[0].cy + circleDefs[2].cy) / 2 + 0.35 },
              '12': { x: (circleDefs[1].cx + circleDefs[2].cx) / 2 + 0.2, y: (circleDefs[1].cy + circleDefs[2].cy) / 2 + 0.35 },
              '012': { x: 0, y: circleDefs[0].cy + 0.2 },
            };

      const regionKeys = vennFields.length === 2
        ? ['0', '1', '01']
        : ['0', '1', '2', '01', '02', '12', '012'];

      const textPoints = regionKeys.map(key => {
        const position = regionPositions[key];
        return {
          x: position.x,
          y: position.y,
          text: String(countsByKey[key] ?? 0),
        };
      });

      const textTrace = {
        type: 'scatter' as const,
        x: textPoints.map(point => point.x),
        y: textPoints.map(point => point.y),
        mode: 'text' as const,
        text: textPoints.map(point => point.text),
        textfont: { size: 18, color: '#111827' },
        hoverinfo: 'skip',
      };

      const labelAnnotations = vennFields.map((field, index) => ({
        x: circleDefs[index].cx,
        y: circleDefs[index].cy + circleDefs[index].r + 0.35,
        text: `${field} (${setTotals[index]})`,
        showarrow: false,
        font: { size: 14, color: '#111827' },
      }));

      const xRange: [number, number] = [
        Math.min(...circleDefs.map(circle => circle.cx - circle.r)) - 0.6,
        Math.max(...circleDefs.map(circle => circle.cx + circle.r)) + 0.6,
      ];
      const yRange: [number, number] = [
        Math.min(...circleDefs.map(circle => circle.cy - circle.r)) - 0.6,
        Math.max(...circleDefs.map(circle => circle.cy + circle.r)) + 0.6,
      ];

      const layout = {
        showlegend: false,
        margin: { t: 80, r: 40, l: 40, b: 40 },
        xaxis: { visible: false, range: xRange },
        yaxis: { visible: false, range: yRange },
        shapes,
        annotations: [
          ...labelAnnotations,
          {
            x: xRange[0] + (xRange[1] - xRange[0]) * 0.02,
            y: yRange[0] + (yRange[1] - yRange[0]) * 0.05,
            text: `対象レコード数: ${totalMembers}`,
            showarrow: false,
            font: { size: 12, color: '#4b5563' },
            align: 'left' as const,
          },
        ],
      };

      return {
        labels: vennFields,
        datasets: [],
        metadata: {
          plotly: {
            data: [textTrace],
            layout,
          },
          venn: {
            fields: vennFields,
            counts: countsByKey,
            totals: setTotals,
          },
        },
      };
    }
  }

  } catch (error) {
    console.error('prepareChartData エラー:', error);
    console.error('エラー発生時のパラメータ:', {
      データ型: chartType,
      レコード数: data?.length || 0,
      X軸フィールド: labelField,
      Y軸フィールド: valueField,
      カテゴリフィールド: normalizedCategoryField
    });
    return null;
  }
};

/**
 * 回帰線を計算する
 * @param data 散布図データ [{x: number, y: number}]
 * @param regressionType 回帰タイプ
 * @param order 多項式の次数（polynomialの場合）
 * @returns 回帰線の座標データ
 */
export const calculateRegressionLine = (
  data: { x: number; y: number }[], 
  regressionType: string, 
  order: number = 2
): { x: number; y: number }[] => {
  if (data.length < 2) return [];
  
  // X値でソート
  const sortedData = [...data].sort((a, b) => a.x - b.x);
  const xValues = sortedData.map(d => d.x);
  const yValues = sortedData.map(d => d.y);
  
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const step = (maxX - minX) / 100; // 100点で描画
  
  let regressionPoints: { x: number; y: number }[] = [];
  
  try {
    switch (regressionType) {
      case 'linear':
        // 線形回帰: y = ax + b
        const linearCoeffs = calculateLinearRegression(xValues, yValues);
        if (linearCoeffs) {
          for (let x = minX; x <= maxX; x += step) {
            const y = linearCoeffs.a * x + linearCoeffs.b;
            regressionPoints.push({ x, y });
          }
        }
        break;
        
      case 'polynomial':
        // 多項式回帰
        const polyCoeffs = calculatePolynomialRegression(xValues, yValues, order);
        if (polyCoeffs && polyCoeffs.length > 0) {
          for (let x = minX; x <= maxX; x += step) {
            let y = 0;
            for (let i = 0; i < polyCoeffs.length; i++) {
              y += polyCoeffs[i] * Math.pow(x, i);
            }
            regressionPoints.push({ x, y });
          }
        }
        break;
        
      case 'exponential':
        // 指数回帰: y = ae^(bx)
        const expCoeffs = calculateExponentialRegression(xValues, yValues);
        if (expCoeffs) {
          for (let x = minX; x <= maxX; x += step) {
            const y = expCoeffs.a * Math.exp(expCoeffs.b * x);
            if (isFinite(y)) {
              regressionPoints.push({ x, y });
            }
          }
        }
        break;
        
      case 'power':
        // 累乗回帰: y = ax^b
        const powerCoeffs = calculatePowerRegression(xValues, yValues);
        if (powerCoeffs) {
          for (let x = minX; x <= maxX; x += step) {
            if (x > 0) { // 累乗回帰は正の値のみ
              const y = powerCoeffs.a * Math.pow(x, powerCoeffs.b);
              if (isFinite(y)) {
                regressionPoints.push({ x, y });
              }
            }
          }
        }
        break;
        
      case 'logarithmic':
        // 対数回帰: y = a * ln(x) + b
        const logCoeffs = calculateLogarithmicRegression(xValues, yValues);
        if (logCoeffs) {
          for (let x = minX; x <= maxX; x += step) {
            if (x > 0) { // 対数は正の値のみ
              const y = logCoeffs.a * Math.log(x) + logCoeffs.b;
              if (isFinite(y)) {
                regressionPoints.push({ x, y });
              }
            }
          }
        }
        break;
        
      default:
        // フォールバック: 線形回帰
        const fallbackCoeffs = calculateLinearRegression(xValues, yValues);
        if (fallbackCoeffs) {
          for (let x = minX; x <= maxX; x += step) {
            const y = fallbackCoeffs.a * x + fallbackCoeffs.b;
            regressionPoints.push({ x, y });
          }
        }
        break;
    }
  } catch (error) {
    console.error(`回帰計算エラー (${regressionType}):`, error);
    // エラーの場合は線形回帰にフォールバック
    const fallbackCoeffs = calculateLinearRegression(xValues, yValues);
    if (fallbackCoeffs) {
      for (let x = minX; x <= maxX; x += step) {
        const y = fallbackCoeffs.a * x + fallbackCoeffs.b;
        regressionPoints.push({ x, y });
      }
    }
  }
  
  return regressionPoints;
};

/**
 * 線形回帰係数を計算する
 */
const calculateLinearRegression = (xValues: number[], yValues: number[]) => {
  if (xValues.length !== yValues.length || xValues.length < 2) return null;
  
  const n = xValues.length;
  const sumX = xValues.reduce((sum, x) => sum + x, 0);
  const sumY = yValues.reduce((sum, y) => sum + y, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
  const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
  
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) return null;
  
  const a = (n * sumXY - sumX * sumY) / denominator;
  const b = (sumY - a * sumX) / n;
  
  return { a, b };
};

/**
 * 多項式回帰係数を計算する
 */
const calculatePolynomialRegression = (xValues: number[], yValues: number[], order: number) => {
  if (xValues.length !== yValues.length || xValues.length < order + 1) return null;
  
  const n = xValues.length;
  const matrix: number[][] = [];
  const result: number[] = [];
  
  // 行列を構築
  for (let i = 0; i <= order; i++) {
    matrix[i] = [];
    let sum = 0;
    
    for (let j = 0; j <= order; j++) {
      let matrixSum = 0;
      for (let k = 0; k < n; k++) {
        matrixSum += Math.pow(xValues[k], i + j);
      }
      matrix[i][j] = matrixSum;
    }
    
    for (let k = 0; k < n; k++) {
      sum += Math.pow(xValues[k], i) * yValues[k];
    }
    result[i] = sum;
  }
  
  // ガウス消去法で解く
  return solveLinearSystem(matrix, result);
};

/**
 * 指数回帰係数を計算する
 */
const calculateExponentialRegression = (xValues: number[], yValues: number[]) => {
  // y = ae^(bx) → ln(y) = ln(a) + bx
  const positiveYValues = yValues.filter(y => y > 0);
  const correspondingXValues = xValues.filter((x, i) => yValues[i] > 0);
  
  if (positiveYValues.length < 2) return null;
  
  const lnYValues = positiveYValues.map(y => Math.log(y));
  const linearCoeffs = calculateLinearRegression(correspondingXValues, lnYValues);
  
  if (!linearCoeffs) return null;
  
  return {
    a: Math.exp(linearCoeffs.b),
    b: linearCoeffs.a
  };
};

/**
 * 累乗回帰係数を計算する
 */
const calculatePowerRegression = (xValues: number[], yValues: number[]) => {
  // y = ax^b → ln(y) = ln(a) + b*ln(x)
  const validIndices = xValues
    .map((x, i) => ({ x, y: yValues[i], i }))
    .filter(item => item.x > 0 && item.y > 0);
  
  if (validIndices.length < 2) return null;
  
  const lnXValues = validIndices.map(item => Math.log(item.x));
  const lnYValues = validIndices.map(item => Math.log(item.y));
  
  const linearCoeffs = calculateLinearRegression(lnXValues, lnYValues);
  
  if (!linearCoeffs) return null;
  
  return {
    a: Math.exp(linearCoeffs.b),
    b: linearCoeffs.a
  };
};

/**
 * 対数回帰係数を計算する
 */
const calculateLogarithmicRegression = (xValues: number[], yValues: number[]) => {
  // y = a * ln(x) + b
  const positiveXValues = xValues.filter(x => x > 0);
  const correspondingYValues = yValues.filter((y, i) => xValues[i] > 0);
  
  if (positiveXValues.length < 2) return null;
  
  const lnXValues = positiveXValues.map(x => Math.log(x));
  return calculateLinearRegression(lnXValues, correspondingYValues);
};

/**
 * 連立方程式を解く（ガウス消去法）
 */
const solveLinearSystem = (matrix: number[][], result: number[]): number[] | null => {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => [...row, result[i]]);
  
  // 前進消去
  for (let i = 0; i < n; i++) {
    // ピボット選択
    let maxRow = i;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(augmented[j][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = j;
      }
    }
    
    if (Math.abs(augmented[maxRow][i]) < 1e-10) {
      return null; // 特異行列
    }
    
    // 行を交換
    if (maxRow !== i) {
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    }
    
    // 消去
    for (let j = i + 1; j < n; j++) {
      const factor = augmented[j][i] / augmented[i][i];
      for (let k = i; k <= n; k++) {
        augmented[j][k] -= factor * augmented[i][k];
      }
    }
  }
  
  // 後退代入
  const solution = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    solution[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      solution[i] -= augmented[i][j] * solution[j];
    }
    solution[i] /= augmented[i][i];
  }
  
  return solution;
};

/**
 * 回帰タイプのラベルを取得する
 */
export const getRegressionTypeLabel = (regressionType: string): string => {
  switch (regressionType) {
    case 'linear': return '線形';
    case 'polynomial': return '多項式';
    case 'exponential': return '指数';
    case 'power': return '累乗';
    case 'logarithmic': return '対数';
    default: return '線形';
  }
};

const LATITUDE_KEYWORDS = ['latitude', 'lat', 'y_coord', 'ycoord', 'latitud', 'lat_deg'];
const LONGITUDE_KEYWORDS = ['longitude', 'lon', 'lng', 'long', 'x_coord', 'xcoord', 'lon_deg'];
const GEOJSON_KEYWORDS = ['geojson', 'geometry', 'geom_json'];
const WKT_KEYWORDS = ['wkt', 'wellknowntxt', 'well_known_text', 'geom_wkt'];
const PATH_KEYWORDS = ['path', 'route', 'linestring'];
const POLYGON_KEYWORDS = ['polygon', 'multipolygon', 'area'];

const normalizeColumn = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

const findCandidates = (columns: string[], keywords: string[]) => {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  return columns.filter((column) => {
    const normalized = normalizeColumn(column);
    return normalizedKeywords.some((keyword) => normalized.includes(keyword));
  });
};

export interface CoordinateInferenceResult {
  latitudeCandidates: string[];
  longitudeCandidates: string[];
  suggestedLatitude?: string;
  suggestedLongitude?: string;
  geoJsonColumns: string[];
  wktColumns: string[];
  pathColumns: string[];
  polygonColumns: string[];
}

export const inferCoordinateColumns = (columns: string[]): CoordinateInferenceResult => {
  const latitudeCandidates = findCandidates(columns, LATITUDE_KEYWORDS);
  const longitudeCandidates = findCandidates(columns, LONGITUDE_KEYWORDS);
  const geoJsonColumns = findCandidates(columns, GEOJSON_KEYWORDS);
  const wktColumns = findCandidates(columns, WKT_KEYWORDS);
  const pathColumns = findCandidates(columns, PATH_KEYWORDS);
  const polygonColumns = findCandidates(columns, POLYGON_KEYWORDS);

  const suggestedLatitude = latitudeCandidates[0];
  const suggestedLongitude = longitudeCandidates[0];

  return {
    latitudeCandidates,
    longitudeCandidates,
    suggestedLatitude,
    suggestedLongitude,
    geoJsonColumns,
    wktColumns,
    pathColumns,
    polygonColumns,
  };
};

export interface GeoPointDatum {
  position: [number, number];
  properties: Record<string, any>;
  category?: string;
  colorValue?: string | number;
  metricValue?: number | null;
}

export interface GeoPathDatum {
  path: [number, number][];
  properties: Record<string, any>;
}

export interface GeoPolygonDatum {
  polygon: [number, number][][];
  properties: Record<string, any>;
}

export interface GeoColumnDatum {
  position: [number, number];
  elevation: number;
  properties: Record<string, any>;
  category?: string;
  colorValue?: string | number;
}

export interface BuildGeoJsonResult {
  points: GeoPointDatum[];
  columns: GeoColumnDatum[];
  paths: GeoPathDatum[];
  polygons: GeoPolygonDatum[];
  geoJsonFeatures: Array<{ type: 'Feature'; geometry: any; properties: Record<string, any> }>;
  bounds: [[number, number], [number, number]] | null;
  categories: string[];
}

export interface BuildGeoJsonOptions {
  latitudeColumn?: string;
  longitudeColumn?: string;
  geoJsonColumn?: string;
  wktColumn?: string;
  pathColumn?: string;
  polygonColumn?: string;
  categoryColumn?: string;
  colorColumn?: string;
  heightColumn?: string;
  aggregation?: MapAggregation;
}

const toNumeric = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeLngLatPair = (first: number | null, second: number | null): [number, number] | null => {
  if (first === null || second === null) return null;
  const isLatFirst = Math.abs(first) <= 90 && Math.abs(second) <= 180;
  const isLonFirst = Math.abs(first) <= 180 && Math.abs(second) <= 90;

  if (isLatFirst && !isLonFirst) {
    return [second, first];
  }

  return [first, second];
};

const parseCoordinateList = (value: any): [number, number][] | null => {
  if (!value) return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (Array.isArray(value[0])) {
      const coords = value
        .map((pair) => {
          if (!Array.isArray(pair) || pair.length < 2) return null;
          const first = toNumeric(pair[0]);
          const second = toNumeric(pair[1]);
          return normalizeLngLatPair(first, second);
        })
        .filter((item): item is [number, number] => Array.isArray(item));
      return coords.length ? coords : null;
    }

    if (typeof value[0] === 'object' && value[0] !== null) {
      const coords = value
        .map((entry) => {
          const lat = toNumeric(entry.lat ?? entry.latitude ?? entry.latitud ?? entry.y ?? entry.latDeg ?? entry.Latitude);
          const lon = toNumeric(entry.lon ?? entry.lng ?? entry.longitude ?? entry.x ?? entry.lonDeg ?? entry.Longitude);
          if (lat === null || lon === null) return null;
          return [lon, lat] as [number, number];
        })
        .filter((item): item is [number, number] => Array.isArray(item));
      return coords.length ? coords : null;
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      return parseCoordinateList(parsed);
    } catch {
      const segments = trimmed
        .split(/[;\n]+/)
        .map((segment) => segment.trim())
        .filter(Boolean);

      const coords = segments
        .map((segment) => {
          const parts = segment.split(/[\s,]+/).filter(Boolean);
          if (parts.length < 2) return null;
          const first = toNumeric(parts[0]);
          const second = toNumeric(parts[1]);
          return normalizeLngLatPair(first, second);
        })
        .filter((item): item is [number, number] => Array.isArray(item));

      return coords.length ? coords : null;
    }
  }

  return null;
};

const parsePolygonCoordinates = (value: any): [number, number][][] | null => {
  if (!value) return null;

  if (Array.isArray(value)) {
    if (Array.isArray(value[0]) && Array.isArray(value[0][0])) {
      const rings = value
        .map((ring) => parseCoordinateList(ring))
        .filter((ring): ring is [number, number][] => Array.isArray(ring) && ring.length >= 3);
      return rings.length ? rings : null;
    }

    const coords = parseCoordinateList(value);
    return coords ? [coords] : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsePolygonCoordinates(parsed);
    } catch {
      return null;
    }
  }

  return null;
};

const computeAggregatedMetric = (rows: any[], column: string | undefined, aggregation: MapAggregation): number => {
  if (!rows.length) return 0;

  if (!column) {
    switch (aggregation) {
      case 'count':
        return rows.length;
      case 'none':
        return 1;
      case 'sum':
      case 'avg':
      case 'min':
      case 'max':
      default:
        return rows.length;
    }
  }

  const numericValues = rows
    .map((row) => toNumeric(row[column as string]))
    .filter((value): value is number => value !== null);

  if (!numericValues.length) {
    return aggregation === 'count' ? rows.length : 0;
  }

  switch (aggregation) {
    case 'sum':
      return numericValues.reduce((sum, value) => sum + value, 0);
    case 'avg':
      return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    case 'min':
      return Math.min(...numericValues);
    case 'max':
      return Math.max(...numericValues);
    case 'none':
      return numericValues[0];
    case 'count':
    default:
      return rows.length;
  }
};

const mergeProperties = (base: Record<string, any>, extra: Record<string, any>) => ({
  ...base,
  ...extra,
});

const pushGeometry = (
  geometry: any,
  result: BuildGeoJsonResult,
  updateBounds: (lon: number, lat: number) => void,
  baseProperties: Record<string, any>,
) => {
  if (!geometry) return;

  if (geometry.type === 'FeatureCollection' && Array.isArray(geometry.features)) {
    geometry.features.forEach((feature: any) =>
      pushGeometry(feature, result, updateBounds, baseProperties)
    );
    return;
  }

  if (geometry.type === 'Feature' && geometry.geometry) {
    const mergedProps = mergeProperties(baseProperties, geometry.properties || {});
    pushGeometry(geometry.geometry, result, updateBounds, mergedProps);
    return;
  }

  switch (geometry.type) {
    case 'Point': {
      const coords = geometry.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const lon = toNumeric(coords[0]);
        const lat = toNumeric(coords[1]);
        if (lon !== null && lat !== null) {
          const position: [number, number] = [lon, lat];
          updateBounds(lon, lat);
          result.points.push({
            position,
            properties: baseProperties,
            category: baseProperties.categoryValue,
            colorValue: baseProperties.colorValue,
            metricValue: baseProperties.metricValue,
          });
          result.geoJsonFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: position },
            properties: baseProperties,
          });
        }
      }
      break;
    }
    case 'MultiPoint': {
      const coords = geometry.coordinates;
      if (Array.isArray(coords)) {
        coords.forEach((point: any) =>
          pushGeometry({ type: 'Point', coordinates: point }, result, updateBounds, baseProperties)
        );
      }
      break;
    }
    case 'LineString': {
      if (Array.isArray(geometry.coordinates)) {
        const path = geometry.coordinates
          .map((pair: any) => {
            if (!Array.isArray(pair) || pair.length < 2) return null;
            const lon = toNumeric(pair[0]);
            const lat = toNumeric(pair[1]);
            if (lon === null || lat === null) return null;
            updateBounds(lon, lat);
            return [lon, lat] as [number, number];
          })
          .filter((point): point is [number, number] => Array.isArray(point));

        if (path.length >= 2) {
          result.paths.push({ path, properties: baseProperties });
          result.geoJsonFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: path },
            properties: baseProperties,
          });
        }
      }
      break;
    }
    case 'MultiLineString': {
      const lines = geometry.coordinates;
      if (Array.isArray(lines)) {
        lines.forEach((line: any) =>
          pushGeometry({ type: 'LineString', coordinates: line }, result, updateBounds, baseProperties)
        );
      }
      break;
    }
    case 'Polygon': {
      const rings = geometry.coordinates;
      if (Array.isArray(rings) && rings.length) {
        const polygon = rings
          .map((ring: any) => {
            if (!Array.isArray(ring)) return null;
            const coords = ring
              .map((pair: any) => {
                if (!Array.isArray(pair) || pair.length < 2) return null;
                const lon = toNumeric(pair[0]);
                const lat = toNumeric(pair[1]);
                if (lon === null || lat === null) return null;
                updateBounds(lon, lat);
                return [lon, lat] as [number, number];
              })
              .filter((point): point is [number, number] => Array.isArray(point));
            return coords.length >= 3 ? coords : null;
          })
          .filter((ring): ring is [number, number][] => Array.isArray(ring));

        if (polygon.length) {
          result.polygons.push({ polygon, properties: baseProperties });
          result.geoJsonFeatures.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: polygon },
            properties: baseProperties,
          });
        }
      }
      break;
    }
    case 'MultiPolygon': {
      const polygons = geometry.coordinates;
      if (Array.isArray(polygons)) {
        polygons.forEach((poly: any) =>
          pushGeometry({ type: 'Polygon', coordinates: poly }, result, updateBounds, baseProperties)
        );
      }
      break;
    }
    default: {
      // それ以外のジオメトリもFeatureとして保持
      result.geoJsonFeatures.push({
        type: 'Feature',
        geometry,
        properties: baseProperties,
      });
      break;
    }
  }
};

export const buildGeoJsonFromRows = (rows: any[], options: BuildGeoJsonOptions = {}): BuildGeoJsonResult => {
  const {
    latitudeColumn,
    longitudeColumn,
    geoJsonColumn,
    wktColumn,
    pathColumn,
    polygonColumn,
    categoryColumn,
    colorColumn,
    heightColumn,
    aggregation = 'sum',
  } = options;

  const result: BuildGeoJsonResult = {
    points: [],
    columns: [],
    paths: [],
    polygons: [],
    geoJsonFeatures: [],
    bounds: null,
    categories: [],
  };

  if (!rows || rows.length === 0) {
    return result;
  }

  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;

  const updateBounds = (lon: number, lat: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }
    minLat = Math.min(minLat, lat);
    minLon = Math.min(minLon, lon);
    maxLat = Math.max(maxLat, lat);
    maxLon = Math.max(maxLon, lon);
  };

  const categories = new Set<string>();
  const columnGroups = new Map<string, { position: [number, number]; rows: any[] }>();

  rows.forEach((row) => {
    const categoryValueRaw = categoryColumn ? row[categoryColumn] : undefined;
    const colorValueRaw = colorColumn ? row[colorColumn] : undefined;
    const metricValueRaw = heightColumn ? toNumeric(row[heightColumn]) : null;
    const categoryValue = categoryValueRaw !== undefined && categoryValueRaw !== null ? String(categoryValueRaw) : undefined;
    const colorValue = colorValueRaw ?? categoryValueRaw;

    if (categoryValue !== undefined) {
      categories.add(categoryValue);
    } else if (colorValueRaw !== undefined && colorValueRaw !== null) {
      categories.add(String(colorValueRaw));
    }

    const baseProperties = {
      ...row,
      categoryValue,
      colorValue,
      metricValue: metricValueRaw,
    } as Record<string, any>;

    if (latitudeColumn && longitudeColumn) {
      const lat = toNumeric(row[latitudeColumn]);
      const lon = toNumeric(row[longitudeColumn]);
      if (lat !== null && lon !== null) {
        const position: [number, number] = [lon, lat];
        updateBounds(lon, lat);
        result.points.push({
          position,
          properties: baseProperties,
          category: categoryValue,
          colorValue,
          metricValue: metricValueRaw,
        });

        const groupKeyParts = [lon.toFixed(6), lat.toFixed(6)];
        if (categoryValue !== undefined) {
          groupKeyParts.push(categoryValue);
        } else if (colorValueRaw !== undefined && colorValueRaw !== null) {
          groupKeyParts.push(String(colorValueRaw));
        }
        const groupKey = groupKeyParts.join('|');
        const existing = columnGroups.get(groupKey);
        if (existing) {
          existing.rows.push(row);
        } else {
          columnGroups.set(groupKey, { position, rows: [row] });
        }
      }
    }

    if (pathColumn && row[pathColumn]) {
      const coordinates = parseCoordinateList(row[pathColumn]);
      if (coordinates && coordinates.length >= 2) {
        coordinates.forEach(([lon, lat]) => updateBounds(lon, lat));
        result.paths.push({ path: coordinates, properties: baseProperties });
        result.geoJsonFeatures.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coordinates },
          properties: baseProperties,
        });
      }
    }

    if (polygonColumn && row[polygonColumn]) {
      const polygons = parsePolygonCoordinates(row[polygonColumn]);
      if (polygons && polygons.length) {
        polygons.forEach((ring) => ring.forEach(([lon, lat]) => updateBounds(lon, lat)));
        result.polygons.push({ polygon: polygons, properties: baseProperties });
        result.geoJsonFeatures.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: polygons },
          properties: baseProperties,
        });
      }
    }

    if (geoJsonColumn && row[geoJsonColumn]) {
      const raw = row[geoJsonColumn];
      let geometry: any = null;
      if (typeof raw === 'string') {
        try {
          geometry = JSON.parse(raw);
        } catch {
          geometry = null;
        }
      } else if (typeof raw === 'object') {
        geometry = raw;
      }
      if (geometry) {
        pushGeometry(geometry, result, updateBounds, baseProperties);
      }
    }

    if (wktColumn && row[wktColumn] && typeof row[wktColumn] === 'string') {
      try {
        const geometry = parseWKT(row[wktColumn]);
        if (geometry) {
          pushGeometry(geometry, result, updateBounds, baseProperties);
        }
      } catch {
        // 無効なWKTは無視
      }
    }
  });

  columnGroups.forEach(({ position, rows: groupedRows }) => {
    const elevation = computeAggregatedMetric(groupedRows, heightColumn, aggregation);
    if (!Number.isFinite(elevation)) {
      return;
    }

    const sample = groupedRows[0] || {};
    const categoryValueRaw = categoryColumn ? sample[categoryColumn] : undefined;
    const colorValueRaw = colorColumn ? sample[colorColumn] : undefined;
    const categoryValue = categoryValueRaw !== undefined && categoryValueRaw !== null ? String(categoryValueRaw) : undefined;
    const colorValue = colorValueRaw ?? categoryValueRaw;

    if (categoryValue !== undefined) {
      categories.add(categoryValue);
    } else if (colorValueRaw !== undefined && colorValueRaw !== null) {
      categories.add(String(colorValueRaw));
    }

    const properties = {
      ...sample,
      metricValue: elevation,
      categoryValue,
      colorValue,
      aggregatedCount: groupedRows.length,
    } as Record<string, any>;

    result.columns.push({
      position,
      elevation,
      properties,
      category: categoryValue,
      colorValue,
    });
    updateBounds(position[0], position[1]);
  });

  if (Number.isFinite(minLat) && Number.isFinite(minLon) && minLat !== Infinity && minLon !== Infinity) {
    result.bounds = [
      [minLon, minLat],
      [maxLon, maxLat],
    ];
  }

  result.categories = Array.from(categories);

  return result;
};
