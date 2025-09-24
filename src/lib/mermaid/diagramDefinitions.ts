import type { MermaidDiagramConfig, MermaidDiagramType } from './types';

/** フォームフィールドの種別 */
export type MermaidFieldType = 'text' | 'textarea' | 'select' | 'number' | 'boolean' | 'date';

/** ノード・エッジ・設定で共通のフィールド定義 */
export interface MermaidFieldDefinition {
  key: string;
  label: string;
  type: MermaidFieldType;
  description?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

/** ノードのテンプレート定義 */
export interface MermaidNodeTemplate {
  variant: string;
  label: string;
  description?: string;
  defaultLabel: string;
  defaultMetadata?: Record<string, string>;
  fields?: MermaidFieldDefinition[];
}

/** エッジのテンプレート定義 */
export interface MermaidEdgeTemplate {
  variant: string;
  label: string;
  description?: string;
  defaultLabel?: string;
  defaultMetadata?: Record<string, string>;
  fields?: MermaidFieldDefinition[];
}

/** 図種別ごとの定義 */
export interface MermaidDiagramDefinition {
  type: MermaidDiagramType;
  label: string;
  description: string;
  nodeTemplates: MermaidNodeTemplate[];
  edgeTemplates: MermaidEdgeTemplate[];
  defaultConfig: MermaidDiagramConfig;
  /** 新規作成時に利用するテンプレートコード */
  defaultTemplate: string;
  configFields?: MermaidFieldDefinition[];
  supportsEdges: boolean;
  /** ノード追加時にユニークIDを生成するヘルパー */
  createNodeId?: () => string;
}

let idCounter = 0;
const createId = () => {
  idCounter += 1;
  return idCounter.toString(36).padStart(4, '0');
};

/** 図種別ごとのテンプレート定義 */
export const diagramDefinitions: Record<MermaidDiagramType, MermaidDiagramDefinition> = {
  flowchart: {
    type: 'flowchart',
    label: 'フローチャート',
    description: '処理の流れを表現する基本的なフローチャート',
    nodeTemplates: [
      {
        variant: 'startEnd',
        label: '開始/終了',
        description: '開始・終了を表す端点',
        defaultLabel: 'Start',
      },
      {
        variant: 'process',
        label: '処理',
        description: '通常の処理ステップ',
        defaultLabel: 'Process',
      },
      {
        variant: 'decision',
        label: '分岐',
        description: '条件分岐',
        defaultLabel: 'Decision',
      },
      {
        variant: 'inputOutput',
        label: '入出力',
        description: '入力または出力',
        defaultLabel: 'I/O',
      },
      {
        variant: 'subroutine',
        label: 'サブルーチン',
        description: 'サブルーチン呼び出し',
        defaultLabel: 'Subroutine',
      },
    ],
    edgeTemplates: [
      {
        variant: 'arrow',
        label: '通常の矢印',
        defaultMetadata: {},
        fields: [
          { key: 'label', label: 'ラベル', type: 'text', placeholder: 'Yes/No など' },
        ],
      },
      {
        variant: 'dashed',
        label: '破線矢印',
        description: '補助的な流れ',
        fields: [
          { key: 'label', label: 'ラベル', type: 'text', placeholder: '補足説明' },
        ],
      },
      {
        variant: 'thick',
        label: '強調矢印',
        description: '重要な流れを強調',
        fields: [
          { key: 'label', label: 'ラベル', type: 'text' },
        ],
      },
    ],
    defaultConfig: { type: 'flowchart', orientation: 'TD' },
    defaultTemplate: `flowchart TD
  Start((Start))
  Process[Process]
  End((End))

  Start --> Process
  Process --> End`,
    configFields: [
      {
        key: 'orientation',
        label: 'レイアウト方向',
        type: 'select',
        options: [
          { value: 'TD', label: '上 → 下 (TD)' },
          { value: 'TB', label: '上 → 下 (TB)' },
          { value: 'BT', label: '下 → 上 (BT)' },
          { value: 'LR', label: '左 → 右 (LR)' },
          { value: 'RL', label: '右 → 左 (RL)' },
        ],
      },
    ],
    supportsEdges: true,
    createNodeId: () => `node_${createId()}`,
  },
  sequence: {
    type: 'sequence',
    label: 'シーケンス図',
    description: 'オブジェクト間のメッセージの時系列を表現',
    nodeTemplates: [
      {
        variant: 'participant',
        label: '参加者',
        defaultLabel: 'Participant',
        fields: [
          { key: 'alias', label: '識別子', type: 'text', placeholder: '内部ID (省略可)' },
        ],
      },
      {
        variant: 'actor',
        label: 'アクター',
        defaultLabel: 'Actor',
        fields: [
          { key: 'alias', label: '識別子', type: 'text', placeholder: '内部ID (省略可)' },
        ],
      },
      {
        variant: 'boundary',
        label: 'バウンダリ',
        defaultLabel: 'Boundary',
        fields: [
          { key: 'alias', label: '識別子', type: 'text' },
        ],
      },
      {
        variant: 'control',
        label: 'コントロール',
        defaultLabel: 'Control',
        fields: [
          { key: 'alias', label: '識別子', type: 'text' },
        ],
      },
      {
        variant: 'database',
        label: 'データベース',
        defaultLabel: 'DB',
        fields: [
          { key: 'alias', label: '識別子', type: 'text' },
        ],
      },
    ],
    edgeTemplates: [
      {
        variant: 'solid',
        label: '同期メッセージ',
        defaultLabel: 'Message',
        fields: [
          { key: 'label', label: 'メッセージ', type: 'text', placeholder: 'メッセージ内容' },
        ],
      },
      {
        variant: 'dashed',
        label: '非同期メッセージ',
        defaultLabel: 'Async',
        fields: [
          { key: 'label', label: 'メッセージ', type: 'text' },
        ],
      },
      {
        variant: 'open',
        label: 'オープン矢印',
        defaultLabel: 'Signal',
        fields: [
          { key: 'label', label: 'メッセージ', type: 'text' },
        ],
      },
    ],
    defaultConfig: { type: 'sequence', autoNumber: false },
    defaultTemplate: `sequenceDiagram
  participant Alice
  participant Bob

  Alice->>Bob: Hello Bob!`,
    configFields: [
      {
        key: 'autoNumber',
        label: '自動番号',
        type: 'boolean',
        description: 'メッセージに自動連番を付与',
      },
    ],
    supportsEdges: true,
    createNodeId: () => `actor_${createId()}`,
  },
  class: {
    type: 'class',
    label: 'クラス図',
    description: 'クラスとその関係を表現',
    nodeTemplates: [
      {
        variant: 'class',
        label: 'クラス',
        defaultLabel: 'ClassName',
        fields: [
          { key: 'stereotype', label: 'ステレオタイプ', type: 'text', placeholder: '<<interface>> など' },
          { key: 'members', label: '属性', type: 'textarea', placeholder: '属性1\n属性2' },
          { key: 'methods', label: '操作', type: 'textarea', placeholder: '+ operation()' },
        ],
      },
      {
        variant: 'interface',
        label: 'インターフェース',
        defaultLabel: 'Interface',
        defaultMetadata: { stereotype: '<<interface>>' },
        fields: [
          { key: 'members', label: '属性', type: 'textarea' },
          { key: 'methods', label: '操作', type: 'textarea' },
        ],
      },
      {
        variant: 'abstract',
        label: '抽象クラス',
        defaultLabel: 'AbstractClass',
        defaultMetadata: { stereotype: '<<abstract>>' },
        fields: [
          { key: 'members', label: '属性', type: 'textarea' },
          { key: 'methods', label: '操作', type: 'textarea' },
        ],
      },
    ],
    edgeTemplates: [
      { variant: 'inheritance', label: '継承 (<|--)', fields: [{ key: 'label', label: '説明', type: 'text' }] },
      { variant: 'composition', label: 'コンポジション (*--)', fields: [{ key: 'label', label: '説明', type: 'text' }] },
      { variant: 'aggregation', label: '集約 (o--)', fields: [{ key: 'label', label: '説明', type: 'text' }] },
      { variant: 'association', label: '関連 (--)', fields: [{ key: 'label', label: '説明', type: 'text' }] },
      { variant: 'dependency', label: '依存 (..>)', fields: [{ key: 'label', label: '説明', type: 'text' }] },
    ],
    defaultConfig: { type: 'class', direction: 'TB' },
    defaultTemplate: `classDiagram
  class ClassName {
    +string property
    +operation()
  }

  ClassName <|-- DerivedClass`,
    configFields: [
      {
        key: 'direction',
        label: '方向',
        type: 'select',
        options: [
          { value: 'TB', label: '縦方向 (TB)' },
          { value: 'LR', label: '横方向 (LR)' },
        ],
      },
    ],
    supportsEdges: true,
    createNodeId: () => `class_${createId()}`,
  },
  state: {
    type: 'state',
    label: 'ステート図',
    description: '状態遷移を表現',
    nodeTemplates: [
      {
        variant: 'state',
        label: '状態',
        defaultLabel: 'State',
      },
      {
        variant: 'start',
        label: '開始',
        defaultLabel: 'Start',
      },
      {
        variant: 'end',
        label: '終了',
        defaultLabel: 'End',
      },
      {
        variant: 'choice',
        label: '分岐',
        defaultLabel: 'Choice',
      },
    ],
    edgeTemplates: [
      {
        variant: 'transition',
        label: '遷移',
        fields: [
          { key: 'label', label: 'イベント/条件', type: 'text', placeholder: 'イベント / ガード [アクション]' },
        ],
      },
    ],
    defaultConfig: { type: 'state', direction: 'TB' },
    defaultTemplate: `stateDiagram-v2
  [*] --> State1
  State1 --> State2
  State2 --> [*]`,
    configFields: [
      {
        key: 'direction',
        label: '方向',
        type: 'select',
        options: [
          { value: 'TB', label: '縦方向 (TB)' },
          { value: 'LR', label: '横方向 (LR)' },
        ],
      },
    ],
    supportsEdges: true,
    createNodeId: () => `state_${createId()}`,
  },
  er: {
    type: 'er',
    label: 'ER 図',
    description: 'エンティティとリレーションシップを表現',
    nodeTemplates: [
      {
        variant: 'entity',
        label: 'エンティティ',
        defaultLabel: 'Entity',
        fields: [
          { key: 'attributes', label: '属性', type: 'textarea', placeholder: 'id PK\nname' },
        ],
      },
      {
        variant: 'weakEntity',
        label: '弱エンティティ',
        defaultLabel: 'WeakEntity',
        fields: [
          { key: 'attributes', label: '属性', type: 'textarea' },
        ],
      },
    ],
    edgeTemplates: [
      { variant: 'identifying', label: '識別 (||--||)', fields: [{ key: 'label', label: '説明', type: 'text' }] },
      { variant: 'nonIdentifying', label: '非識別 (||--o{)', fields: [{ key: 'label', label: '説明', type: 'text' }] },
      { variant: 'oneToMany', label: '1対多 (||--|{)', fields: [{ key: 'label', label: '説明', type: 'text' }] },
      { variant: 'manyToMany', label: '多対多 ({--})', fields: [{ key: 'label', label: '説明', type: 'text' }] },
    ],
    defaultConfig: { type: 'er' },
    defaultTemplate: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  CUSTOMER {
    string name
    string address
  }`,
    supportsEdges: true,
    createNodeId: () => `entity_${createId()}`,
  },
  gantt: {
    type: 'gantt',
    label: 'ガントチャート',
    description: 'スケジュール管理用ガントチャート',
    nodeTemplates: [
      {
        variant: 'task',
        label: 'タスク',
        defaultLabel: 'Task',
        defaultMetadata: { status: 'active', section: 'General' },
        fields: [
          { key: 'section', label: 'セクション', type: 'text', placeholder: 'カテゴリ名' },
          { key: 'taskId', label: 'タスクID', type: 'text', placeholder: 'task_1' },
          { key: 'start', label: '開始日', type: 'date' },
          { key: 'end', label: '終了日', type: 'date' },
          { key: 'duration', label: '期間 (例: 5d)', type: 'text' },
          { key: 'dependsOn', label: '依存タスクID', type: 'text', placeholder: 'task_2' },
          {
            key: 'status',
            label: '状態',
            type: 'select',
            options: [
              { value: 'active', label: '進行中' },
              { value: 'done', label: '完了' },
              { value: 'crit', label: '重要' },
              { value: 'milestone', label: 'マイルストーン' },
            ],
          },
        ],
      },
      {
        variant: 'milestone',
        label: 'マイルストーン',
        defaultLabel: 'Milestone',
        defaultMetadata: { status: 'milestone', section: 'General' },
        fields: [
          { key: 'section', label: 'セクション', type: 'text' },
          { key: 'taskId', label: 'タスクID', type: 'text' },
          { key: 'start', label: '日付', type: 'date' },
          { key: 'dependsOn', label: '依存タスクID', type: 'text' },
        ],
      },
    ],
    edgeTemplates: [],
    defaultConfig: { type: 'gantt', dateFormat: 'YYYY-MM-DD', axisFormat: '%m/%d', title: 'Timeline' },
    defaultTemplate: `gantt
  title Timeline
  dateFormat YYYY-MM-DD
  section General
    Task :a1, 2024-01-01, 3d`,
    configFields: [
      { key: 'title', label: 'タイトル', type: 'text' },
      { key: 'dateFormat', label: '日付フォーマット', type: 'text', placeholder: 'YYYY-MM-DD' },
      { key: 'axisFormat', label: '軸フォーマット', type: 'text', placeholder: '%m/%d' },
    ],
    supportsEdges: false,
    createNodeId: () => `task_${createId()}`,
  },
};

export const diagramList: { type: MermaidDiagramType; label: string }[] = Object.values(diagramDefinitions).map(
  ({ type, label }) => ({ type, label })
);

export const getMermaidTemplate = (type: MermaidDiagramType): string => diagramDefinitions[type].defaultTemplate;
