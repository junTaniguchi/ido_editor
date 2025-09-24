import type { Edge, Node } from 'reactflow';

/** Mermaidで扱う主要な図の種類 */
export type MermaidDiagramType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'gantt'
  | 'pie'
  | 'gitGraph';

/** ノード共通のデータ構造 */
export interface MermaidNodeData {
  /** 図の種類（flowchart, sequenceなど） */
  diagramType: MermaidDiagramType;
  /** 図ごとのノード種別（例: startEnd, participantなど） */
  variant: string;
  /** 表示ラベル */
  label: string;
  /** 補助説明（UI表示用） */
  description?: string;
  /** 追加メタデータ（自由形式） */
  metadata?: Record<string, string>;
}

/** エッジ共通のデータ構造 */
export interface MermaidEdgeData {
  /** 図の種類 */
  diagramType: MermaidDiagramType;
  /** 図ごとのエッジ種別（例: arrow, dashed, inheritanceなど） */
  variant: string;
  /** エッジに表示するラベル */
  label?: string;
  /** 同一ノード間の並列エッジでのインデックス */
  parallelIndex?: number;
  /** 同一ノード間の並列エッジ数 */
  parallelCount?: number;
  /** 追加メタデータ（自由形式） */
  metadata?: Record<string, string>;
}

/** React Flowで扱うノード型 */
export type MermaidNode = Node<MermaidNodeData>;
/** React Flowで扱うエッジ型 */
export type MermaidEdge = Edge<MermaidEdgeData>;

/** フローチャートの向き */
export type FlowchartOrientation = 'TB' | 'TD' | 'BT' | 'LR' | 'RL';
/** シーケンス図の矢印種別 */
export type SequenceMessageStyle = 'solid' | 'dashed' | 'open';
/** クラス図の関連種別 */
export type ClassRelationshipVariant =
  | 'inheritance'
  | 'composition'
  | 'aggregation'
  | 'association'
  | 'dependency';
/** ステート図の方向 */
export type StateDiagramDirection = 'TB' | 'LR';
export type GitGraphOrientation = 'LR' | 'TB' | 'BT';

/** 図種別ごとの設定値 */
export type MermaidDiagramConfig =
  | { type: 'flowchart'; orientation: FlowchartOrientation }
  | { type: 'sequence'; autoNumber: boolean }
  | { type: 'class'; direction: StateDiagramDirection }
  | { type: 'state'; direction: StateDiagramDirection }
  | { type: 'er' }
  | { type: 'gantt'; dateFormat: string; axisFormat: string; title?: string }
  | { type: 'pie'; title?: string; showData?: boolean }
  | { type: 'gitGraph'; orientation: GitGraphOrientation };

/** React Flow上の状態をMermaidソースへ変換するためのモデル */
export interface MermaidGraphModel {
  /** 図の種類 */
  type: MermaidDiagramType;
  /** 図種別ごとの設定 */
  config: MermaidDiagramConfig;
  /** React Flowノード */
  nodes: MermaidNode[];
  /** React Flowエッジ */
  edges: MermaidEdge[];
  /** 変換時に発生した警告 */
  warnings: string[];
}
