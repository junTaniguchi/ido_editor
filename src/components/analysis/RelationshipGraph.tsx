// ...existing code...
// ...existing code...
import React, { useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { FiZoomIn, FiZoomOut, FiMaximize } from 'react-icons/fi';
import { IoMdDownload } from 'react-icons/io';

interface RelationshipGraphProps {
  data: any;
  theme?: string;
  width?: number;
  height?: number;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface Node {
  id: string;
  name: string;
  val?: number;
  color?: string;
  group?: string;
  x?: number;
  y?: number;
  lightColor?: string;
  darkColor?: string;
  [key: string]: any;
}

interface Link {
  source: string | Node;
  target: string | Node;
  value?: number;
  label?: string;
  [key: string]: any;
}

// 色のテーマ設定
const nodeColors = {
  light: {
    default: '#3498db',
    highlighted: '#e74c3c',
    groups: ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#d35400']
  },
  dark: {
    default: '#5dade2',
    highlighted: '#ec7063',
    groups: ['#5dade2', '#58d68d', '#ec7063', '#f5b041', '#af7ac5', '#48c9b0', '#5d6d7e', '#e67e22']
  }
};

// JSONデータから関係グラフデータを生成する関数
export const transformJsonToGraphData = (jsonData: any): GraphData => {
  // ノードとリンクを格納する配列
  const nodes: Node[] = [];
  const links: Link[] = [];
  
  // ノードIDのセット（重複チェック用）
  const nodeIds = new Set<string>();
  
  // オブジェクトをグラフデータに変換する再帰関数
  const processObject = (obj: any, parentId: string | null = null, path: string = '') => {
      // オブジェクトの場合
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      // このオブジェクトの一意のIDを生成
      const currentId = path || 'root';
      
      // ノードの重複を防ぐ
      if (!nodeIds.has(currentId)) {
        nodeIds.add(currentId);
        // ノード名を最後のパス部分から抽出
        const nameParts = currentId.split('.');
        const name = nameParts[nameParts.length - 1] || 'root';
        
        // オブジェクトノードを追加
        nodes.push({
          id: currentId,
          name: name,
          group: 'object',
          val: Object.keys(obj).length, // ノードのサイズはプロパティ数に比例
        });        // 親ノードとの接続
        if (parentId) {
          links.push({
            source: parentId,
            target: currentId,
            value: 1
          });
        }
        
        // 子要素を処理
        Object.entries(obj).forEach(([key, value]) => {
          const childPath = path ? `${path}.${key}` : key;
          processObject(value, currentId, childPath);
        });
      }
    }
    // 配列の場合
    else if (Array.isArray(obj)) {
      // 配列自体のノードを作成
      const arrayId = path ? `${path}[]` : 'array_root';
      if (!nodeIds.has(arrayId)) {
        nodeIds.add(arrayId);
        const nameParts = path ? path.split('.') : ['array_root'];
        const name = path ? `${nameParts[nameParts.length - 1]}[]` : 'array_root';
        
        nodes.push({
          id: arrayId,
          name: name,
          group: 'array',
          val: obj.length, // ノードサイズは配列の長さに比例
        });
        
        if (parentId) {
          links.push({
            source: parentId,
            target: arrayId,
            value: 1
          });
        }
        
        // 配列の各要素を処理
        obj.forEach((item, index) => {
          const itemPath = `${path}[${index}]`;
          processObject(item, arrayId, itemPath);
        });
      }
    }
    // プリミティブ値の場合
    else if (parentId) {
      const valueId = path;
      if (!nodeIds.has(valueId) && path) {
        nodeIds.add(valueId);
        const nameParts = valueId.split('.');
        const name = nameParts[nameParts.length - 1];
        
        // 値が文字列の場合、表示を短くする
        const displayValue = typeof obj === 'string' && obj.length > 30 
          ? `${obj.substring(0, 27)}...` 
          : String(obj);
        
        // プリミティブ値のノードを追加
        nodes.push({
          id: valueId,
          name: `${name}: ${displayValue}`,
          group: typeof obj,
          val: 1, // プリミティブ値は小さめのノード
        });
        
        // 親との接続
        links.push({
          source: parentId,
          target: valueId,
          value: 1
        });
      }
    }
  };
  
  // データ変換開始
  processObject(jsonData);
  
  // グループに基づいて色を設定
  const uniqueGroups = [...new Set(nodes.map(node => node.group))];
  nodes.forEach(node => {
    const groupIndex = uniqueGroups.indexOf(node.group);
    const colorIndex = groupIndex % nodeColors.light.groups.length;
    node.lightColor = nodeColors.light.groups[colorIndex];
    node.darkColor = nodeColors.dark.groups[colorIndex];
  });
  
  return { nodes, links };
};


const RelationshipGraph: React.FC<RelationshipGraphProps> = ({ 
  data, 
  theme = 'light',
  width = 800, 
  height = 600 
}) => {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const graphRef = useRef<any>(null);

  // --- 既存の操作関数群（再配置） ---
  const handleZoomIn = () => {
    if (graphRef.current) {
      const newZoom = zoomLevel * 1.2;
      setZoomLevel(newZoom);
      graphRef.current.zoom(newZoom);
    }
  };
  const handleZoomOut = () => {
    if (graphRef.current) {
      const newZoom = zoomLevel / 1.2;
      setZoomLevel(newZoom);
      graphRef.current.zoom(newZoom);
    }
  };
  const handleZoomReset = () => {
    if (graphRef.current) {
      setZoomLevel(1);
      graphRef.current.zoom(1);
      graphRef.current.centerAt();
    }
  };
  const handleExportSvg = () => {
    const svgElement = document.querySelector('.force-graph-container > svg');
    if (!svgElement) return;
    const svgCopy = svgElement.cloneNode(true) as SVGElement;
    const styles = document.createElement('style');
    Array.from(document.styleSheets).forEach(styleSheet => {
      try {
        Array.from(styleSheet.cssRules).forEach(rule => {
          styles.innerHTML += rule.cssText;
        });
      } catch (e) {
        console.warn('Error accessing CSS rules:', e);
      }
    });
    svgCopy.insertBefore(styles, svgCopy.firstChild);
    const svgData = new XMLSerializer().serializeToString(svgCopy);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relationship_graph.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  // ノードの色を計算
  const getNodeColor = (node: Node) => {
    const isHighlighted = highlightNodes.has(node.id);
    if (hoverNode && !isHighlighted) {
      return 'rgba(160, 160, 160, 0.3)';
    }
    return currentTheme === 'dark' ? (node.darkColor || '#5dade2') : (node.lightColor || '#3498db');
  };
  // リンクの色を計算
  const getLinkColor = (link: Link) => {
    const isHighlighted = highlightLinks.has(link);
    if (hoverNode && !isHighlighted) {
      return 'rgba(160, 160, 160, 0.1)';
    }
    return currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
  };
  // テーマに基づく色を決定
  const currentTheme = theme === 'dark' ? 'dark' : 'light';

  // JSONデータからグラフデータを生成
  useEffect(() => {
    if (data) {
      try {
        const transformedData = transformJsonToGraphData(data);
        setGraphData(transformedData);
      } catch (error) {
        console.error('Error transforming JSON to graph data:', error);
      }
    }
  }, [data]);




  // ...existing code...
  // ノードのハイライト処理
  const handleNodeHover = (node: Node | null) => {
    if (!node) {
      setHoverNode(null);
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      return;
    }
    const nodeId = node.id;
    setHoverNode(nodeId);
    // ...existing code...
  };
  // ...existing code...
  // ズーム操作、SVGエクスポート、色計算などはそのまま

  return (
    <div className="flex flex-col w-full h-full">
      {/* 既存の操作ボタン群 */}
      <div className="flex justify-end gap-2 p-2 mb-2 bg-gray-100 dark:bg-gray-800 rounded">
        <button 
          onClick={handleZoomIn} 
          className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700" 
          aria-label="Zoom In"
        >
          <FiZoomIn />
        </button>
        <button 
          onClick={handleZoomOut}
          className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          aria-label="Zoom Out"
        >
          <FiZoomOut />
        </button>
        <button 
          onClick={handleZoomReset}
          className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          aria-label="Reset Zoom"
        >
          <FiMaximize />
        </button>
        <button 
          onClick={handleExportSvg}
          className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          aria-label="Export as SVG"
        >
          <IoMdDownload />
        </button>
      </div>
      {/* グラフ表示部はそのまま */}
      <div className="flex-grow relative border rounded">
        {graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeId="id"
            nodeLabel="name"
            nodeVal="val"
            nodeColor={getNodeColor}
            linkColor={getLinkColor}
            linkWidth={(link: Link) => highlightLinks.has(link) ? 2 : 1}
            width={width}
            height={height}
            onNodeHover={handleNodeHover}
            nodeCanvasObjectMode={() => 'after'}
            nodeCanvasObject={(node: Node, ctx: CanvasRenderingContext2D, globalScale: number) => {
              // ...existing code...
            }}
            cooldownTicks={100}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={(link: Link) => highlightLinks.has(link) ? 2 : 0}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
            <p className="text-gray-500 dark:text-gray-400">
              JSONデータを読み込み中、または有効な関係を見つけられませんでした。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RelationshipGraph;
