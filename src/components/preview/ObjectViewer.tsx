
/**
 * ObjectViewer.tsx
 * オブジェクト・配列などのネスト構造データを階層表示するReactコンポーネント。
 * 主な機能:
 * - ネスト構造の展開・折りたたみ
 * - プリミティブ型・配列・オブジェクトの可視化
 * - 展開レベル・デフォルト展開制御
 * - ダークモード対応
 */
'use client';

import React, { useState } from 'react';
import { IoCaretDown, IoCaretForward } from 'react-icons/io5';

interface ObjectViewerProps {
  data: any;
  maxDepth?: number;
  expandByDefault?: boolean;
  expandLevel?: number;
  compactMode?: boolean;
}

/**
 * ObjectViewerコンポーネント
 * JSONやオブジェクト型データを階層構造で見やすく表示する。
 * - ネスト構造の展開・折りたたみ
 * - 最大階層指定
 * - コンパクト表示
 * @param data 表示対象のデータ
 * @param maxDepth 最大表示階層
 * @param expandByDefault デフォルトで展開するか
 * @param expandLevel デフォルト展開階層
 * @param compactMode コンパクト表示モード
 */
const ObjectViewer: React.FC<ObjectViewerProps> = ({
  data,
  maxDepth = 10,
  expandByDefault = true,
  expandLevel = 1, // デフォルトで開く階層レベル
  compactMode = false,
}) => {
  return (
    <div className={`font-mono text-sm bg-white dark:bg-gray-900 overflow-auto ${compactMode ? 'p-0' : 'p-4'}`}>
      <div className="json-human">
        <RenderValue 
          value={data} 
          depth={0} 
          maxDepth={maxDepth} 
          expandByDefault={expandByDefault}
          expandLevel={expandLevel}
          isKey={false}
          compactMode={compactMode}
        />
      </div>
    </div>
  );
};

interface RenderValueProps {
  value: any;
  depth: number;
  maxDepth: number;
  expandByDefault: boolean;
  expandLevel: number;
  isKey: boolean;
  compactMode: boolean;
}

const RenderValue: React.FC<RenderValueProps> = ({ 
  value, 
  depth, 
  maxDepth, 
  expandByDefault, 
  expandLevel,
  isKey,
  compactMode
}) => {
  const [expanded, setExpanded] = useState(expandByDefault && depth < expandLevel);
  
  const getObjectType = (obj: any): string => {
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    if (Array.isArray(obj)) return 'array';
    return typeof obj;
  };
  
  const type = getObjectType(value);
  
  // 最大深度に達した場合
  if (depth > maxDepth) {
    return <span className="text-gray-500">[最大深度に達しました]</span>;
  }
  
  // プリミティブ値の場合
  if (type === 'string') {
    return <span className="text-green-600 dark:text-green-400">"{value}"</span>;
  } else if (type === 'number') {
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
  } else if (type === 'boolean') {
    return <span className="text-purple-600 dark:text-purple-400">{value ? 'true' : 'false'}</span>;
  } else if (type === 'null') {
    return <span className="text-gray-500">null</span>;
  } else if (type === 'undefined') {
    return <span className="text-gray-500">undefined</span>;
  }
  
  // 配列の場合
  if (type === 'array') {
    if (value.length === 0) {
      return <span className="text-gray-600 dark:text-gray-400">[]</span>;
    }
    
    return (
      <div className={`${isKey ? "" : compactMode ? "ml-2" : "ml-4"} json-array`}>
        <div 
          onClick={() => setExpanded(!expanded)}
          className="cursor-pointer json-toggle flex items-center"
        >
          {expanded ? 
            <IoCaretDown className="text-gray-500 mr-1" size={14} /> : 
            <IoCaretForward className="text-gray-500 mr-1" size={14} />
          }
          <span className="text-gray-600 dark:text-gray-400 select-none">
            Array[{value.length}]
          </span>
        </div>
        
        {expanded && (
          <div className={`${compactMode ? "pl-2" : "pl-4"} border-l border-gray-300 dark:border-gray-700 json-array-items`}>
            {value.map((item: any, index: number) => (
              <div key={index} className={`${compactMode ? "my-0.5" : "my-1"} json-array-item`}>
                <span className="text-gray-500 json-index select-none">{index}: </span>
                <RenderValue 
                  value={item} 
                  depth={depth + 1} 
                  maxDepth={maxDepth} 
                  expandByDefault={expandByDefault}
                  expandLevel={expandLevel}
                  isKey={false}
                  compactMode={compactMode}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } 
  
  // オブジェクトの場合
  if (type === 'object') {
    const keys = Object.keys(value);
    
    if (keys.length === 0) {
      return <span className="text-gray-600 dark:text-gray-400">{"{}"}</span>;
    }
    
    return (
      <div className={`${isKey ? "" : compactMode ? "ml-2" : "ml-4"} json-object`}>
        <div 
          onClick={() => setExpanded(!expanded)}
          className="cursor-pointer json-toggle flex items-center"
        >
          {expanded ? 
            <IoCaretDown className="text-gray-500 mr-1" size={14} /> : 
            <IoCaretForward className="text-gray-500 mr-1" size={14} />
          }
          <span className="text-gray-600 dark:text-gray-400 select-none">
            Object{`{${keys.length}}`}
          </span>
        </div>
        
        {expanded && (
          <div className={`${compactMode ? "pl-2" : "pl-4"} border-l border-gray-300 dark:border-gray-700 json-object-items`}>
            {keys.map((key) => (
              <div key={key} className={`${compactMode ? "my-0.5" : "my-1"} json-prop`}>
                <span className="text-red-600 dark:text-red-400 json-key select-none">{key}: </span>
                <RenderValue 
                  value={value[key]} 
                  depth={depth + 1} 
                  maxDepth={maxDepth} 
                  expandByDefault={expandByDefault}
                  expandLevel={expandLevel}
                  isKey={false}
                  compactMode={compactMode}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  
  // その他の場合
  return <span className="json-value">{String(value)}</span>;
};

export default ObjectViewer;
