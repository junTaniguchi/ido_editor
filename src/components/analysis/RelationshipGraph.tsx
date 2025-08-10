// ...existing code...
// ...existing code...
import React, { useState, useEffect, useRef, useMemo } from 'react';
import nearley from 'nearley';
import moo from 'moo';
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
  // Cypherクエリ入力状態
  const [cypherQuery, setCypherQuery] = useState('');
  // パースエラー表示用
  const [parseError, setParseError] = useState<string | null>(null);

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

  // Cypherクエリのパーサー拡張
  const cypherLexer = useMemo(() => moo.compile({
    ws:      /[ \t]+/,
    lparen:  '(',
    rparen:  ')',
    lbrace:  '{',
    rbrace:  '}',
    lbrack:  '[',
    rbrack:  ']',
    arrow:   '->',
    backarrow: '<-',
    dash:    '-',
    colon:   ':',
    comma:   ',',
    dot:     '.',
    eq:      '=',
    string:  /'(?:\\'|[^'])*'/,
    number:  /[0-9]+(?:\.[0-9]+)?/, 
    keyword: ['MATCH', 'RETURN', 'WHERE', 'AND', 'OR', 'NOT'],
    identifier: /[a-zA-Z_][a-zA-Z0-9_]*/,
    NL:      { match: /\n/, lineBreaks: true },
    lt:       '<',
    gt:       '>',
    gte:      '>=',
    lte:      '<=',
  }), []);

  // nearleyのパーサー拡張
  const cypherGrammar = useMemo(() => {
    // 双方向リレーション、複数パターン連結、WHERE句対応
    return {
      Lexer: cypherLexer,
      ParserRules: [
        // main entry
        // RETURN句直前の空白・改行も許容
        // 各句間すべてに「_」を挟み、改行・空白を完全許容
        { name: "main", symbols: ["_", "MATCH", "_", "patternChain", "_", "whereOpt", "_repeat", "RETURN", "_", "resultList", "_"], postprocess: (d: any) => ({ match: d[3], where: d[5], return: d[9] }) },
        { name: "MATCH", symbols: [{ type: "keyword" }], postprocess: (d: any) => d[0].value },
        { name: "RETURN", symbols: [{ type: "keyword" }], postprocess: (d: any) => d[0].value },
        // _repeat: 0回以上の空白・改行
        { name: "_repeat", symbols: ["_", "_repeat"], postprocess: () => null },
        { name: "_repeat", symbols: [], postprocess: () => null },
        // patternChain: 複数パターン連結
        { name: "patternChain", symbols: ["pattern", "patternChainTail"], postprocess: (d: any) => [d[0], ...d[1]] },
        { name: "patternChainTail", symbols: ["pattern", "patternChainTail"], postprocess: (d: any) => [d[0], ...d[1]] },
        { name: "patternChainTail", symbols: ["relationPattern", "nodePattern", "patternChainTail"], postprocess: (d: any) => [{ rel: d[0], to: d[1] }, ...d[2]] },
        { name: "patternChainTail", symbols: [], postprocess: () => [] },
        // pattern: nodePattern relationPattern nodePattern
        { name: "pattern", symbols: ["nodePattern", "relationPattern", "nodePattern"], postprocess: (d: any) => ({ from: d[0], rel: d[1], to: d[2] }) },
        // nodePattern: (a:Person {name: 'Alice'})
        { name: "nodePattern", symbols: [{ type: "lparen" }, "_", "varLabel", "_", "propsOpt", "_", { type: "rparen" }], postprocess: (d: any) => ({ variable: d[2].variable, label: d[2].label, props: d[4] }) },
        // varLabel: a:Person
        { name: "varLabel", symbols: [{ type: "identifier" }, { type: "colon" }, { type: "identifier" }], postprocess: (d: any) => ({ variable: d[0].value, label: d[2].value }) },
        // propsOpt: {name: 'Alice'} or empty
        { name: "propsOpt", symbols: ["props"], postprocess: (d: any) => d[0] },
        { name: "propsOpt", symbols: [], postprocess: () => null },
        // props: {name: 'Alice'}
        { name: "props", symbols: [{ type: "lbrace" }, "_", "propList", "_", { type: "rbrace" }], postprocess: (d: any) => d[2] },
        // propList: name: 'Alice', age: 30
        { name: "propList", symbols: ["prop", "propListTail"], postprocess: (d: any) => [d[0], ...d[1]] },
        { name: "propListTail", symbols: ["_", { type: "comma" }, "_", "prop", "propListTail"], postprocess: (d: any) => [d[3], ...d[4]] },
        { name: "propListTail", symbols: [], postprocess: () => [] },
        { name: "prop", symbols: ["_", { type: "identifier" }, "_", { type: "colon" }, "_", "propValue", "_"], postprocess: (d: any) => ({ key: d[1].value, value: d[5] }) },
        { name: "propValue", symbols: ["_", { type: "string" }, "_"], postprocess: (d: any) => d[1].value },
        { name: "propValue", symbols: ["_", { type: "number" }, "_"], postprocess: (d: any) => Number(d[1].value) },
        // relationPattern: -[:FRIEND]->, <-[:FRIEND]-
        { name: "relationPattern", symbols: [{ type: "dash" }, { type: "lbrack" }, { type: "colon" }, { type: "identifier" }, { type: "rbrack" }, { type: "arrow" }], postprocess: (d: any) => ({ type: d[3].value, direction: 'out' }) },
        { name: "relationPattern", symbols: [{ type: "backarrow" }, { type: "lbrack" }, { type: "colon" }, { type: "identifier" }, { type: "rbrack" }, { type: "dash" }], postprocess: (d: any) => ({ type: d[3].value, direction: 'in' }) },
        // resultList: friend.name, friend.age
        { name: "resultList", symbols: ["_", "resultItem", "resultListTail"], postprocess: (d: any) => [d[1], ...d[2]] },
        // カンマ前後の空白・改行を柔軟に許容
        { name: "resultListTail", symbols: ["_", { type: "comma" }, "_", "resultItem", "resultListTail"], postprocess: (d: any) => [d[3], ...d[4]] },
        { name: "resultListTail", symbols: ["_", { type: "comma" }, { type: "NL" }, "_", "resultItem", "resultListTail"], postprocess: (d: any) => [d[4], ...d[5]] },
        { name: "resultListTail", symbols: ["_", { type: "comma" }, "_", { type: "NL" }, "_", "resultItem", "resultListTail"], postprocess: (d: any) => [d[5], ...d[6]] },
        { name: "resultListTail", symbols: [], postprocess: () => [] },
        { name: "resultItem", symbols: ["_", { type: "identifier" }, "_", { type: "dot" }, "_", { type: "identifier" }, "_"], postprocess: (d: any) => `${d[1].value}.${d[5].value}` },
        { name: "resultItem", symbols: ["_", { type: "identifier" }, "_"], postprocess: (d: any) => d[1].value },
        // WHERE句
        { name: "whereOpt", symbols: ["_", "WHERE", "_", "whereCond", "_"], postprocess: (d: any) => d[3] },
        { name: "whereOpt", symbols: [], postprocess: () => null },
        { name: "WHERE", symbols: [{ type: "keyword" }], postprocess: (d: any) => d[0].value },
        // whereCond: p1.name = 'Alice'
        { name: "whereCond", symbols: ["_", { type: "identifier" }, { type: "dot" }, { type: "identifier" }, { type: "eq" }, "propValue", "_"], postprocess: (d: any) => ({ variable: d[1].value, key: d[3].value, value: d[5], op: '=' }) },
        { name: "whereCond", symbols: ["_", { type: "identifier" }, { type: "dot" }, { type: "identifier" }, { type: "lt" }, "propValue", "_"], postprocess: (d: any) => ({ variable: d[1].value, key: d[3].value, value: d[5], op: '<' }) },
        { name: "whereCond", symbols: ["_", { type: "identifier" }, { type: "dot" }, { type: "identifier" }, { type: "gt" }, "propValue", "_"], postprocess: (d: any) => ({ variable: d[1].value, key: d[3].value, value: d[5], op: '>' }) },
        { name: "whereCond", symbols: ["_", { type: "identifier" }, { type: "dot" }, { type: "identifier" }, { type: "lte" }, "propValue", "_"], postprocess: (d: any) => ({ variable: d[1].value, key: d[3].value, value: d[5], op: '<=' }) },
        { name: "whereCond", symbols: ["_", { type: "identifier" }, { type: "dot" }, { type: "identifier" }, { type: "gte" }, "propValue", "_"], postprocess: (d: any) => ({ variable: d[1].value, key: d[3].value, value: d[5], op: '>=' }) },
        // 空白・改行許容
        { name: "_", symbols: [{ type: "ws" }], postprocess: () => null },
        { name: "_", symbols: [{ type: "NL" }], postprocess: () => null },
        { name: "_", symbols: [], postprocess: () => null },
      ],
      ParserStart: "main"
    };
  }, [cypherLexer]);

  // クエリ実行（パース＋今後フィルタ）
  const handleRunCypherQuery = () => {
    setParseError(null);
    try {
      const parser = new nearley.Parser(nearley.Grammar.fromCompiled(cypherGrammar));
      parser.feed(cypherQuery);
      const result = parser.results;
      if (result.length === 0) {
        setParseError('クエリの構文が正しくありません');
        return;
      }
      // パース結果をフィルタに利用
      console.log('Cypher parse result:', result);
      // 1つ目の解釈のみ使う
      const parsed = result[0];
      let nodes = data.nodes || [];
      let edges = data.edges || [];
      // 複数パターン連結対応
      if (parsed && parsed.match && Array.isArray(parsed.match)) {
        let nodeVars: Record<string, any> = {};
        let edgeVars: Record<string, any> = {};
        let filteredNodes = nodes;
        let filteredEdges = edges;
        // パターンチェーンを順に適用
        parsed.match.forEach((pat: any, idx: number) => {
          // from/toノード条件
          let fromNodes = filteredNodes.filter((n: any) => {
            if (pat.from.label && n.label !== pat.from.label) return false;
            if (pat.from.props) {
              for (const p of pat.from.props) {
                if (n.properties?.[p.key] !== p.value) return false;
              }
            }
            return true;
          });
          let toNodes = filteredNodes.filter((n: any) => {
            if (pat.to.label && n.label !== pat.to.label) return false;
            if (pat.to.props) {
              for (const p of pat.to.props) {
                if (n.properties?.[p.key] !== p.value) return false;
              }
            }
            return true;
          });
          // rel条件（双方向対応）
          let relEdges = filteredEdges.filter((e: any) => {
            if (pat.rel.type && e.label !== pat.rel.type) return false;
            const fromIds = fromNodes.map((n: any) => n.id);
            const toIds = toNodes.map((n: any) => n.id);
            if (pat.rel.direction === 'out') {
              if (!fromIds.includes(e.source)) return false;
              if (!toIds.includes(e.target)) return false;
            } else if (pat.rel.direction === 'in') {
              if (!toIds.includes(e.source)) return false;
              if (!fromIds.includes(e.target)) return false;
            }
            return true;
          });
          // 変数名でノード・エッジを記録
          if (pat.from.variable) nodeVars[pat.from.variable] = fromNodes;
          if (pat.to.variable) nodeVars[pat.to.variable] = toNodes;
          edgeVars[`rel${idx}`] = relEdges;
          // 次のパターン用に絞り込み
          filteredNodes = [...fromNodes, ...toNodes];
          filteredEdges = relEdges;
        });
        // WHERE句対応（比較演算子）
        if (parsed.where && parsed.where.variable && parsed.where.key && parsed.where.op) {
          const whereNodes = nodeVars[parsed.where.variable] || [];
          filteredNodes = whereNodes.filter((n: any) => {
            const val = n.properties?.[parsed.where.key];
            const cmp = parsed.where.value;
            switch (parsed.where.op) {
              case '=':
                return val === cmp;
              case '<':
                return typeof val === 'number' && val < cmp;
              case '>':
                return typeof val === 'number' && val > cmp;
              case '<=':
                return typeof val === 'number' && val <= cmp;
              case '>=':
                return typeof val === 'number' && val >= cmp;
              default:
                return false;
            }
          });
        }
        // 返却項目の絞り込み（RETURN句対応）
        let filteredGraphNodes = nodes.filter((n: any) => filteredNodes.map((nn: any) => nn.id).includes(n.id));
        let filteredGraphEdges = filteredEdges;
        // RETURN句で指定されたプロパティのみ抽出
        if (parsed.return && Array.isArray(parsed.return) && parsed.return.length > 0) {
          // 例: ['p2.name', 'p2.age']
          filteredGraphNodes = filteredGraphNodes.map((n: any) => {
            // 変数名が一致するRETURN項目のみ抽出
            const props: any = {};
            parsed.return.forEach((ret: string) => {
              const [varName, key] = ret.split('.');
              // ノード変数名が一致
              for (const v in nodeVars) {
                if (Array.isArray(nodeVars[v]) && nodeVars[v].find((nn: any) => nn.id === n.id) && varName === v) {
                  props[key] = n.properties?.[key];
                }
              }
            });
            return { ...n, properties: props };
          });
        }
        setGraphData({ nodes: filteredGraphNodes, links: filteredGraphEdges });
        return;
      }
      // 単一パターン（旧ロジック）
      if (parsed && parsed.match && parsed.match.from && parsed.match.rel && parsed.match.to) {
        const from = parsed.match.from;
        const rel = parsed.match.rel;
        const to = parsed.match.to;
        let filteredNodes = nodes.filter((n: any) => {
          if (from.label && n.label !== from.label) return false;
          if (from.props) {
            for (const p of from.props) {
              if (n.properties?.[p.key] !== p.value) return false;
            }
          }
          return true;
        });
        let filteredToNodes = nodes.filter((n: any) => {
          if (to.label && n.label !== to.label) return false;
          return true;
        });
        let filteredEdges = edges.filter((e: any) => {
          if (rel.type && e.label !== rel.type) return false;
          const fromIds = filteredNodes.map((n: any) => n.id);
          const toIds = filteredToNodes.map((n: any) => n.id);
          if (rel.direction === 'out') {
            if (!fromIds.includes(e.source)) return false;
            if (!toIds.includes(e.target)) return false;
          } else if (rel.direction === 'in') {
            if (!toIds.includes(e.source)) return false;
            if (!fromIds.includes(e.target)) return false;
          }
          return true;
        });
        let filteredGraphNodes = nodes.filter((n: any) => [...filteredNodes, ...filteredToNodes].map((nn: any) => nn.id).includes(n.id));
        let filteredGraphEdges = filteredEdges;
        // RETURN句で指定されたプロパティのみ抽出
        if (parsed.return && Array.isArray(parsed.return) && parsed.return.length > 0) {
          filteredGraphNodes = filteredGraphNodes.map((n: any) => {
            const props: any = {};
            parsed.return.forEach((ret: string) => {
              const [varName, key] = ret.split('.');
              // from/toノードの変数名が一致
              if (varName === from.variable || varName === to.variable) {
                props[key] = n.properties?.[key];
              }
            });
            return { ...n, properties: props };
          });
        }
        setGraphData({ nodes: filteredGraphNodes, links: filteredGraphEdges });
        return;
      }
      // パターンに合致しない場合は全件表示
      setGraphData(transformJsonToGraphData(data));
    } catch (e: any) {
      setParseError('パースエラー: ' + (e.message || e.toString()));
    }
  };

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
      {/* Cypherクエリ入力欄（エディタ風・textarea化） */}
      <div className="flex items-start gap-2 p-2 mb-2 bg-gray-50 dark:bg-gray-900 rounded">
        <textarea
          className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm resize-vertical min-h-[80px] max-h-[240px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          style={{ lineHeight: '1.6', tabSize: 4 }}
          placeholder="Cypherクエリを入力 (例: MATCH (n:Person) RETURN n)"
          value={cypherQuery}
          onChange={e => setCypherQuery(e.target.value)}
          rows={5}
        />
        <button
          type="button"
          className="px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 text-base font-semibold shadow"
          onClick={handleRunCypherQuery}
        >
          実行
        </button>
      </div>
      {parseError && (
        <div className="text-red-500 text-sm px-2 pb-2">{parseError}</div>
      )}
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
