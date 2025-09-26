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

const GANTT_DATE_FORMAT_OPTIONS = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (日付)' },
  { value: 'YYYY-MM-DD HH:mm', label: 'YYYY-MM-DD HH:mm (日時)' },
  { value: 'YYYY-MM', label: 'YYYY-MM (年月)' },
  { value: 'YYYY', label: 'YYYY (年)' },
  { value: 'MM-DD', label: 'MM-DD (月日)' },
];

const GANTT_AXIS_FORMAT_OPTIONS = [
  { value: '%m/%d', label: '%m/%d (月/日)' },
  { value: '%Y-%m-%d', label: '%Y-%m-%d (年月日)' },
  { value: '%b %d', label: '%b %d (短縮表記)' },
  { value: '%a %m/%d', label: '%a %m/%d (曜日付き)' },
  { value: '%H:%M', label: '%H:%M (時:分)' },
];

export const ARCHITECTURE_ICON_OPTIONS = [
  { value: 'server', label: 'server' },
  { value: 'database', label: 'database' },
  { value: 'disk', label: 'disk' },
  { value: 'cloud', label: 'cloud' },
  { value: 'internet', label: 'internet' },
  { value: 'unknown', label: 'unknown' },
  { value: 'blank', label: 'blank' },
];

const ARCHITECTURE_ICON_SELECT_OPTIONS = [
  { value: '', label: '自動 (推奨)' },
  ...ARCHITECTURE_ICON_OPTIONS,
];

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
        defaultMetadata: { fillColor: '#DBEAFE', strokeColor: '#1D4ED8', textColor: '#1E3A8A' },
      },
      {
        variant: 'process',
        label: '処理',
        description: '通常の処理ステップ',
        defaultLabel: 'Process',
        defaultMetadata: { fillColor: '#E2E8F0', strokeColor: '#1F2937', textColor: '#111827' },
      },
      {
        variant: 'decision',
        label: '分岐',
        description: '条件分岐',
        defaultLabel: 'Decision',
        defaultMetadata: { fillColor: '#FDE68A', strokeColor: '#D97706', textColor: '#92400E' },
      },
      {
        variant: 'inputOutput',
        label: '入出力',
        description: '入力または出力',
        defaultLabel: 'I/O',
        defaultMetadata: { fillColor: '#C7D2FE', strokeColor: '#4338CA', textColor: '#1E1B4B' },
      },
      {
        variant: 'subroutine',
        label: 'サブルーチン',
        description: 'サブルーチン呼び出し',
        defaultLabel: 'Subroutine',
        defaultMetadata: { fillColor: '#DDD6FE', strokeColor: '#7C3AED', textColor: '#4C1D95' },
      },
    ],
    edgeTemplates: [
      {
        variant: 'arrow',
        label: '通常の矢印',
        defaultMetadata: { strokeColor: '#2563EB' },
        fields: [
          { key: 'label', label: 'ラベル', type: 'text', placeholder: 'Yes/No など' },
        ],
      },
      {
        variant: 'dashed',
        label: '破線矢印',
        description: '補助的な流れ',
        defaultMetadata: { strokeColor: '#7C3AED' },
        fields: [
          { key: 'label', label: 'ラベル', type: 'text', placeholder: '補足説明' },
        ],
      },
      {
        variant: 'thick',
        label: '強調矢印',
        description: '重要な流れを強調',
        defaultMetadata: { strokeColor: '#F59E0B' },
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
        defaultMetadata: { fillColor: '#E0F2FE', strokeColor: '#0284C7', textColor: '#0C4A6E' },
        fields: [
          { key: 'alias', label: '識別子', type: 'text', placeholder: '内部ID (省略可)' },
        ],
      },
      {
        variant: 'actor',
        label: 'アクター',
        defaultLabel: 'Actor',
        defaultMetadata: { fillColor: '#F5F3FF', strokeColor: '#7C3AED', textColor: '#4C1D95' },
        fields: [
          { key: 'alias', label: '識別子', type: 'text', placeholder: '内部ID (省略可)' },
        ],
      },
      {
        variant: 'boundary',
        label: 'バウンダリ',
        defaultLabel: 'Boundary',
        defaultMetadata: { fillColor: '#FEF9C3', strokeColor: '#CA8A04', textColor: '#713F12' },
        fields: [
          { key: 'alias', label: '識別子', type: 'text' },
        ],
      },
      {
        variant: 'control',
        label: 'コントロール',
        defaultLabel: 'Control',
        defaultMetadata: { fillColor: '#FEE2E2', strokeColor: '#DC2626', textColor: '#7F1D1D' },
        fields: [
          { key: 'alias', label: '識別子', type: 'text' },
        ],
      },
      {
        variant: 'database',
        label: 'データベース',
        defaultLabel: 'DB',
        defaultMetadata: { fillColor: '#DCFCE7', strokeColor: '#16A34A', textColor: '#14532D' },
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
        defaultMetadata: { strokeColor: '#2563EB' },
        fields: [
          { key: 'label', label: 'メッセージ', type: 'text', placeholder: 'メッセージ内容' },
        ],
      },
      {
        variant: 'dashed',
        label: '非同期メッセージ',
        defaultLabel: 'Async',
        defaultMetadata: { strokeColor: '#0EA5E9' },
        fields: [
          { key: 'label', label: 'メッセージ', type: 'text' },
        ],
      },
      {
        variant: 'open',
        label: 'オープン矢印',
        defaultLabel: 'Signal',
        defaultMetadata: { strokeColor: '#DB2777' },
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
        defaultMetadata: { fillColor: '#F3F4F6', strokeColor: '#4B5563', textColor: '#111827' },
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
        defaultMetadata: {
          stereotype: '<<interface>>',
          fillColor: '#DBEAFE',
          strokeColor: '#1D4ED8',
          textColor: '#1E3A8A',
        },
        fields: [
          { key: 'members', label: '属性', type: 'textarea' },
          { key: 'methods', label: '操作', type: 'textarea' },
        ],
      },
      {
        variant: 'abstract',
        label: '抽象クラス',
        defaultLabel: 'AbstractClass',
        defaultMetadata: {
          stereotype: '<<abstract>>',
          fillColor: '#FCE7F3',
          strokeColor: '#BE185D',
          textColor: '#831843',
        },
        fields: [
          { key: 'members', label: '属性', type: 'textarea' },
          { key: 'methods', label: '操作', type: 'textarea' },
        ],
      },
    ],
    edgeTemplates: [
      {
        variant: 'inheritance',
        label: '継承 (<|--)',
        defaultMetadata: { strokeColor: '#2563EB' },
        fields: [{ key: 'label', label: '説明', type: 'text' }],
      },
      {
        variant: 'composition',
        label: 'コンポジション (*--)',
        defaultMetadata: { strokeColor: '#16A34A' },
        fields: [{ key: 'label', label: '説明', type: 'text' }],
      },
      {
        variant: 'aggregation',
        label: '集約 (o--)',
        defaultMetadata: { strokeColor: '#0EA5E9' },
        fields: [{ key: 'label', label: '説明', type: 'text' }],
      },
      {
        variant: 'association',
        label: '関連 (--)',
        defaultMetadata: { strokeColor: '#6B7280' },
        fields: [{ key: 'label', label: '説明', type: 'text' }],
      },
      {
        variant: 'dependency',
        label: '依存 (..>)',
        defaultMetadata: { strokeColor: '#F59E0B' },
        fields: [{ key: 'label', label: '説明', type: 'text' }],
      },
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
        defaultMetadata: { fillColor: '#EEF2FF', strokeColor: '#4C51BF', textColor: '#312E81' },
      },
      {
        variant: 'start',
        label: '開始',
        defaultLabel: 'Start',
        defaultMetadata: { fillColor: '#22C55E', strokeColor: '#15803D', textColor: '#064E3B' },
      },
      {
        variant: 'end',
        label: '終了',
        defaultLabel: 'End',
        defaultMetadata: { fillColor: '#F87171', strokeColor: '#B91C1C', textColor: '#7F1D1D' },
      },
      {
        variant: 'choice',
        label: '分岐',
        defaultLabel: 'Choice',
        defaultMetadata: { fillColor: '#FCD34D', strokeColor: '#B45309', textColor: '#78350F' },
      },
    ],
    edgeTemplates: [
      {
        variant: 'transition',
        label: '遷移',
        defaultMetadata: { strokeColor: '#2563EB' },
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
        defaultMetadata: { fillColor: '#DCFCE7', strokeColor: '#16A34A', textColor: '#065F46' },
        fields: [
          { key: 'attributes', label: '属性', type: 'textarea', placeholder: 'id PK\nname' },
        ],
      },
      {
        variant: 'weakEntity',
        label: '弱エンティティ',
        defaultLabel: 'WeakEntity',
        defaultMetadata: { fillColor: '#FEF3C7', strokeColor: '#D97706', textColor: '#92400E' },
        fields: [
          { key: 'attributes', label: '属性', type: 'textarea' },
        ],
      },
    ],
    edgeTemplates: [
      {
        variant: 'identifying',
        label: '識別 (||--||)',
        defaultMetadata: { strokeColor: '#16A34A' },
        fields: [{ key: 'label', label: '説明', type: 'text' }],
      },
      {
        variant: 'nonIdentifying',
        label: '非識別 (||--o{)',
        defaultMetadata: { strokeColor: '#0EA5E9' },
        fields: [{ key: 'label', label: '説明', type: 'text' }],
      },
      {
        variant: 'oneToMany',
        label: '1対多 (||--|{)',
        defaultMetadata: { strokeColor: '#F59E0B' },
        fields: [{ key: 'label', label: '説明', type: 'text' }],
      },
      {
        variant: 'manyToMany',
        label: '多対多 ({--})',
        defaultMetadata: { strokeColor: '#DC2626' },
        fields: [{ key: 'label', label: '説明', type: 'text' }],
      },
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
        defaultMetadata: {
          status: 'active',
          section: 'General',
          fillColor: '#DBEAFE',
          strokeColor: '#1D4ED8',
          textColor: '#1E3A8A',
        },
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
        defaultMetadata: {
          status: 'milestone',
          section: 'General',
          fillColor: '#FDE68A',
          strokeColor: '#D97706',
          textColor: '#92400E',
        },
        fields: [
          { key: 'section', label: 'セクション', type: 'text' },
          { key: 'taskId', label: 'タスクID', type: 'text' },
          { key: 'start', label: '日付', type: 'date' },
          { key: 'dependsOn', label: '依存タスクID', type: 'text' },
        ],
      },
    ],
    edgeTemplates: [
      {
        variant: 'gitCommit',
        label: 'コミット線',
        description: '同一ブランチ内のコミットをつなぐ標準的な線',
        defaultLabel: '',
      },
      {
        variant: 'gitCheckout',
        label: 'チェックアウト',
        description: '別ブランチへチェックアウトする遷移を表現',
        defaultLabel: '',
        defaultMetadata: { branchId: '' },
      },
    ],
    defaultConfig: { type: 'gantt', dateFormat: 'YYYY-MM-DD', axisFormat: '%m/%d', title: 'Timeline' },
    defaultTemplate: `gantt
  title Timeline
  dateFormat YYYY-MM-DD
  section General
    Task :a1, 2024-01-01, 3d`,
    configFields: [
      { key: 'title', label: 'タイトル', type: 'text' },
      { key: 'dateFormat', label: '日付フォーマット', type: 'select', options: GANTT_DATE_FORMAT_OPTIONS },
      { key: 'axisFormat', label: '軸フォーマット', type: 'select', options: GANTT_AXIS_FORMAT_OPTIONS },
    ],
    supportsEdges: false,
    createNodeId: () => `task_${createId()}`,
  },
  gitGraph: {
    type: 'gitGraph',
    label: 'Gitグラフ',
    description: 'ブランチとコミットの履歴を表現するGitグラフ',
    nodeTemplates: [
      {
        variant: 'commit',
        label: 'コミット',
        description: '現在のブランチにコミットを追加',
        defaultLabel: 'Commit',
        defaultMetadata: {
          type: 'NORMAL',
          branchId: 'main',
          fillColor: '#DBEAFE',
          strokeColor: '#2563eb',
          textColor: '#1d4ed8',
        },
        fields: [
          { key: 'id', label: 'コミットID', type: 'text', placeholder: '例: A1' },
          { key: 'tag', label: 'タグ', type: 'text', placeholder: '例: v1.0.0' },
          {
            key: 'type',
            label: 'コミットタイプ',
            type: 'select',
            options: [
              { value: 'NORMAL', label: '通常 (NORMAL)' },
              { value: 'HIGHLIGHT', label: 'ハイライト (HIGHLIGHT)' },
              { value: 'REVERSE', label: 'リバース (REVERSE)' },
            ],
          },
        ],
      },
      {
        variant: 'branch',
        label: 'ブランチ作成',
        description: '新しいブランチを作成して現在のブランチにする',
        defaultLabel: 'develop',
        defaultMetadata: {
          fillColor: '#F3E8FF',
          strokeColor: '#8B5CF6',
          textColor: '#5B21B6',
        },
        fields: [
          { key: 'order', label: '表示順序 (order)', type: 'number', placeholder: '例: 1' },
        ],
      },
      {
        variant: 'checkout',
        label: 'チェックアウト',
        description: '既存のブランチへ切り替え',
        defaultLabel: 'main',
        defaultMetadata: {
          fillColor: '#FEF3C7',
          strokeColor: '#D97706',
          textColor: '#92400E',
        },
      },
      {
        variant: 'merge',
        label: 'マージ',
        description: '指定ブランチを現在のブランチへマージ',
        defaultLabel: 'develop',
        defaultMetadata: {
          type: 'NORMAL',
          branchId: 'main',
          fillColor: '#DCFCE7',
          strokeColor: '#16A34A',
          textColor: '#166534',
        },
        fields: [
          { key: 'id', label: 'マージコミットID', type: 'text' },
          { key: 'tag', label: 'タグ', type: 'text' },
          {
            key: 'type',
            label: 'コミットタイプ',
            type: 'select',
            options: [
              { value: 'NORMAL', label: '通常 (NORMAL)' },
              { value: 'HIGHLIGHT', label: 'ハイライト (HIGHLIGHT)' },
              { value: 'REVERSE', label: 'リバース (REVERSE)' },
            ],
          },
        ],
      },
      {
        variant: 'cherryPick',
        label: 'チェリーピック',
        description: '別ブランチのコミットを現在のブランチへ取り込む',
        defaultLabel: 'commitId',
        defaultMetadata: {
          fillColor: '#FEE2E2',
          strokeColor: '#DC2626',
          textColor: '#7F1D1D',
        },
        fields: [
          { key: 'id', label: '対象コミットID', type: 'text', placeholder: '必須: MERGE など' },
          { key: 'parent', label: '親コミットID', type: 'text', placeholder: 'マージコミットの場合のみ' },
        ],
      },
    ],
    edgeTemplates: [
      {
        variant: 'gitCommit',
        label: 'コミット線',
        description: '同一ブランチ内のコミットをつなぐ標準的な線',
        defaultLabel: '',
        defaultMetadata: {
          strokeColor: '#2563eb',
          textColor: '#1d4ed8',
          fillColor: '#DBEAFE',
        },
      },
      {
        variant: 'gitBranchCreate',
        label: 'ブランチ作成',
        description: 'コミットから新しいブランチ作成ノードへ向かう遷移',
        defaultLabel: '',
        defaultMetadata: {
          strokeColor: '#8B5CF6',
          textColor: '#5B21B6',
          fillColor: '#F3E8FF',
        },
      },
      {
        variant: 'gitCheckout',
        label: 'チェックアウト',
        description: '別ブランチへチェックアウトする遷移を表現',
        defaultLabel: '',
        defaultMetadata: {
          branchId: '',
          strokeColor: '#D97706',
          textColor: '#92400E',
          fillColor: '#FEF3C7',
        },
      },
      {
        variant: 'gitMerge',
        label: 'マージ遷移',
        description: 'マージノードへ向かう遷移を表現',
        defaultLabel: '',
        defaultMetadata: {
          strokeColor: '#16A34A',
          textColor: '#166534',
          fillColor: '#DCFCE7',
        },
      },
    ],
    defaultConfig: { type: 'gitGraph', orientation: 'LR' },
    defaultTemplate: `gitGraph LR:
  commit id: "A"
  commit id: "B"
  branch feature
  checkout feature
  commit
  checkout main
  merge feature`,
    configFields: [
      {
        key: 'orientation',
        label: 'レイアウト方向',
        type: 'select',
        options: [
          { value: 'LR', label: '左 → 右 (LR)' },
          { value: 'TB', label: '上 → 下 (TB)' },
          { value: 'BT', label: '下 → 上 (BT)' },
        ],
      },
    ],
    supportsEdges: true,
    createNodeId: () => `git_${createId()}`,
  },
  c4: {
    type: 'c4',
    label: 'C4図',
    description: 'システムの文脈やコンテナ構成を表現するC4ダイアグラム',
    nodeTemplates: [
      {
        variant: 'person',
        label: '人物',
        description: '利用者やアクターを表現',
        defaultLabel: 'Person',
        defaultMetadata: {
          fillColor: '#F5F3FF',
          strokeColor: '#7C3AED',
          textColor: '#4C1D95',
          description: 'システム利用者',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea', placeholder: '役割や背景' },
        ],
      },
      {
        variant: 'personExternal',
        label: '外部人物',
        description: 'システム外部のアクター',
        defaultLabel: 'External Person',
        defaultMetadata: {
          fillColor: '#FFF7ED',
          strokeColor: '#F97316',
          textColor: '#9A3412',
          description: '外部アクター',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea', placeholder: '役割や背景' },
        ],
      },
      {
        variant: 'system',
        label: 'システム',
        description: '対象システム全体',
        defaultLabel: 'System',
        defaultMetadata: {
          fillColor: '#DBEAFE',
          strokeColor: '#2563EB',
          textColor: '#1D4ED8',
          description: '主要システム',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea', placeholder: '目的や責務' },
          { key: 'technology', label: '技術/備考', type: 'text', placeholder: '使用技術など (任意)' },
        ],
      },
      {
        variant: 'systemExternal',
        label: '外部システム',
        description: '連携する外部システム',
        defaultLabel: 'External System',
        defaultMetadata: {
          fillColor: '#E0F2FE',
          strokeColor: '#0284C7',
          textColor: '#0C4A6E',
          description: '外部連携システム',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea' },
          { key: 'technology', label: '技術/備考', type: 'text' },
        ],
      },
      {
        variant: 'container',
        label: 'コンテナ',
        description: 'システム内部のコンテナ',
        defaultLabel: 'Container',
        defaultMetadata: {
          fillColor: '#FEF3C7',
          strokeColor: '#F59E0B',
          textColor: '#B45309',
          technology: 'Node.js',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea', placeholder: '責務や役割' },
          { key: 'technology', label: '技術スタック', type: 'text', placeholder: '例: Node.js, React' },
        ],
      },
      {
        variant: 'containerExternal',
        label: '外部コンテナ',
        description: '外部提供のサービスやコンテナ',
        defaultLabel: 'External Container',
        defaultMetadata: {
          fillColor: '#FFF7ED',
          strokeColor: '#EA580C',
          textColor: '#9A3412',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea' },
          { key: 'technology', label: '技術スタック', type: 'text' },
        ],
      },
      {
        variant: 'containerDatabase',
        label: 'データベース',
        description: '永続化コンテナ',
        defaultLabel: 'Database',
        defaultMetadata: {
          fillColor: '#FEE2E2',
          strokeColor: '#DC2626',
          textColor: '#991B1B',
          technology: 'PostgreSQL',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea' },
          { key: 'technology', label: '技術スタック', type: 'text' },
        ],
      },
      {
        variant: 'systemDatabase',
        label: 'システムDB',
        description: 'システムレベルのデータベース',
        defaultLabel: 'System DB',
        defaultMetadata: {
          fillColor: '#FDE68A',
          strokeColor: '#D97706',
          textColor: '#92400E',
          technology: 'RDBMS',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea' },
          { key: 'technology', label: '技術スタック', type: 'text' },
        ],
      },
      {
        variant: 'component',
        label: 'コンポーネント',
        description: 'コンテナ内のコンポーネント',
        defaultLabel: 'Component',
        defaultMetadata: {
          fillColor: '#E5E7EB',
          strokeColor: '#4B5563',
          textColor: '#1F2937',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea' },
          { key: 'technology', label: '技術/備考', type: 'text' },
        ],
      },
      {
        variant: 'componentExternal',
        label: '外部コンポーネント',
        description: '外部提供コンポーネント',
        defaultLabel: 'External Component',
        defaultMetadata: {
          fillColor: '#EDE9FE',
          strokeColor: '#7C3AED',
          textColor: '#5B21B6',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea' },
          { key: 'technology', label: '技術/備考', type: 'text' },
        ],
      },
      {
        variant: 'componentDatabase',
        label: 'コンポーネントDB',
        description: 'コンポーネント専用データストア',
        defaultLabel: 'Component DB',
        defaultMetadata: {
          fillColor: '#DCFCE7',
          strokeColor: '#16A34A',
          textColor: '#166534',
        },
        fields: [
          { key: 'description', label: '説明', type: 'textarea' },
          { key: 'technology', label: '技術/備考', type: 'text' },
        ],
      },
    ],
    edgeTemplates: [
      {
        variant: 'relationship',
        label: '関係 (Rel)',
        defaultLabel: '利用',
        defaultMetadata: {
          strokeColor: '#2563EB',
          textColor: '#1D4ED8',
        },
        fields: [
          { key: 'label', label: '関係ラベル', type: 'text', placeholder: '例: 利用する' },
          { key: 'technology', label: '技術', type: 'text', placeholder: '例: HTTPS' },
        ],
      },
      {
        variant: 'relationshipDashed',
        label: '破線の関係 (Rel_Dashed)',
        defaultLabel: '参照',
        defaultMetadata: {
          strokeColor: '#7C3AED',
          textColor: '#5B21B6',
        },
        fields: [
          { key: 'label', label: '関係ラベル', type: 'text' },
          { key: 'technology', label: '技術', type: 'text' },
        ],
      },
      {
        variant: 'relationshipBidirectional',
        label: '双方向の関係 (BiRel)',
        defaultLabel: '双方向連携',
        defaultMetadata: {
          strokeColor: '#059669',
          textColor: '#065F46',
        },
        fields: [
          { key: 'label', label: '関係ラベル', type: 'text' },
          { key: 'technology', label: '技術', type: 'text' },
        ],
      },
    ],
    defaultConfig: { type: 'c4', diagramVariant: 'C4Context' },
    defaultTemplate: `C4Context
  title システム文脈図
  Person(admin, "管理者", "システムを操作")
  System(system, "業務システム", "業務処理を提供")
  System_Ext(external, "外部サービス", "認証を提供")
  Rel(admin, system, "操作", "HTTPS")
  Rel(system, external, "認証連携", "OIDC")`,
    configFields: [
      {
        key: 'diagramVariant',
        label: '図の種類',
        type: 'select',
        options: [
          { value: 'C4Context', label: 'コンテキスト (C4Context)' },
          { value: 'C4Container', label: 'コンテナ (C4Container)' },
          { value: 'C4Component', label: 'コンポーネント (C4Component)' },
          { value: 'C4Dynamic', label: 'ダイナミック (C4Dynamic)' },
        ],
      },
      { key: 'title', label: 'タイトル', type: 'text', placeholder: '図のタイトル' },
    ],
    supportsEdges: true,
    createNodeId: () => `c4_${createId()}`,
  },
  architecture: {
    type: 'architecture',
    label: 'アーキテクチャ図',
    description: 'MermaidのArchitecture構文でシステム構成を表現',
    nodeTemplates: [
      {
        variant: 'service',
        label: 'サービス',
        description: 'アプリケーションやAPIなどのサービス',
        defaultLabel: 'Service',
        defaultMetadata: {
          fillColor: '#DBEAFE',
          strokeColor: '#1D4ED8',
          textColor: '#1E3A8A',
          icon: 'server',
          directive: 'service',
        },
        fields: [
          {
            key: 'icon',
            label: 'アイコン',
            type: 'select',
            options: ARCHITECTURE_ICON_SELECT_OPTIONS,
            placeholder: '例: server, cloud, internet, database, disk, unknown',
          },
          { key: 'description', label: '説明', type: 'textarea', placeholder: '役割など (任意)' },
        ],
      },
      {
        variant: 'database',
        label: 'データベース',
        description: 'データベースなどの永続層',
        defaultLabel: 'Database',
        defaultMetadata: {
          fillColor: '#FEE2E2',
          strokeColor: '#B91C1C',
          textColor: '#7F1D1D',
          icon: 'database',
          directive: 'database',
        },
        fields: [
          {
            key: 'icon',
            label: 'アイコン',
            type: 'select',
            options: ARCHITECTURE_ICON_SELECT_OPTIONS,
            placeholder: '例: database',
          },
          { key: 'description', label: '説明', type: 'textarea' },
        ],
      },
      {
        variant: 'queue',
        label: 'メッセージキュー',
        description: 'キューやストリーム',
        defaultLabel: 'Queue',
        defaultMetadata: {
          fillColor: '#FEF3C7',
          strokeColor: '#D97706',
          textColor: '#92400E',
          icon: 'unknown',
          directive: 'queue',
        },
        fields: [
          {
            key: 'icon',
            label: 'アイコン',
            type: 'select',
            options: ARCHITECTURE_ICON_SELECT_OPTIONS,
            placeholder: '例: unknown, server',
          },
          { key: 'description', label: '説明', type: 'textarea' },
        ],
      },
      {
        variant: 'cache',
        label: 'キャッシュ',
        description: 'キャッシュやインメモリストア',
        defaultLabel: 'Cache',
        defaultMetadata: {
          fillColor: '#F0FDF4',
          strokeColor: '#22C55E',
          textColor: '#15803D',
          icon: 'disk',
          directive: 'cache',
        },
        fields: [
          {
            key: 'icon',
            label: 'アイコン',
            type: 'select',
            options: ARCHITECTURE_ICON_SELECT_OPTIONS,
            placeholder: '例: disk, cloud',
          },
          { key: 'description', label: '説明', type: 'textarea' },
        ],
      },
      {
        variant: 'storage',
        label: 'ストレージ',
        description: 'オブジェクトストレージなど',
        defaultLabel: 'Storage',
        defaultMetadata: {
          fillColor: '#E0F2FE',
          strokeColor: '#0369A1',
          textColor: '#0C4A6E',
          icon: 'disk',
          directive: 'storage',
        },
        fields: [
          { key: 'icon', label: 'アイコン', type: 'select', options: ARCHITECTURE_ICON_SELECT_OPTIONS },
          { key: 'description', label: '説明', type: 'textarea' },
        ],
      },
      {
        variant: 'user',
        label: 'ユーザー',
        description: '人物や外部アクター',
        defaultLabel: 'User',
        defaultMetadata: {
          fillColor: '#F5F3FF',
          strokeColor: '#6D28D9',
          textColor: '#4C1D95',
          icon: 'unknown',
          directive: 'user',
        },
        fields: [
          {
            key: 'icon',
            label: 'アイコン',
            type: 'select',
            options: ARCHITECTURE_ICON_SELECT_OPTIONS,
            placeholder: '例: unknown, cloud',
          },
          { key: 'description', label: '説明', type: 'textarea' },
        ],
      },
      {
        variant: 'device',
        label: 'デバイス',
        description: 'モバイルや端末',
        defaultLabel: 'Device',
        defaultMetadata: {
          fillColor: '#E5E7EB',
          strokeColor: '#4B5563',
          textColor: '#1F2937',
          icon: 'unknown',
          directive: 'device',
        },
        fields: [
          {
            key: 'icon',
            label: 'アイコン',
            type: 'select',
            options: ARCHITECTURE_ICON_SELECT_OPTIONS,
            placeholder: '例: cloud, unknown',
          },
          { key: 'description', label: '説明', type: 'textarea' },
        ],
      },
      {
        variant: 'component',
        label: 'コンポーネント',
        description: '小さな構成要素',
        defaultLabel: 'Component',
        defaultMetadata: {
          fillColor: '#FFF7ED',
          strokeColor: '#EA580C',
          textColor: '#9A3412',
          icon: 'server',
          directive: 'component',
        },
        fields: [
          {
            key: 'icon',
            label: 'アイコン',
            type: 'select',
            options: ARCHITECTURE_ICON_SELECT_OPTIONS,
            placeholder: '例: server, cloud',
          },
          { key: 'description', label: '説明', type: 'textarea' },
        ],
      },
      {
        variant: 'junction',
        label: 'ジャンクション',
        description: '配線を分岐させる中継点',
        defaultLabel: 'junction',
        defaultMetadata: {
          fillColor: '#FFFFFF',
          strokeColor: '#4B5563',
          textColor: '#1F2937',
          directive: 'junction',
        },
        fields: [],
      },
    ],
    edgeTemplates: [
      {
        variant: 'connectionDirected',
        label: '接続 (矢印あり)',
        defaultLabel: '',
        defaultMetadata: {
          strokeColor: '#2563EB',
          textColor: '#1D4ED8',
          connector: '--',
          targetArrow: 'true',
        },
        fields: [
          { key: 'sourceAnchor', label: '始点アンカー (L/R/T/B)', type: 'text', placeholder: '例: R' },
          { key: 'targetAnchor', label: '終点アンカー (L/R/T/B)', type: 'text', placeholder: '例: L' },
          { key: 'sourceGroup', label: '始点グループ参照', type: 'text', placeholder: '例: edge' },
          { key: 'targetGroup', label: '終点グループ参照', type: 'text', placeholder: '例: core' },
          { key: 'sourceArrow', label: '始点に矢印', type: 'boolean', placeholder: '始点矢印を表示' },
          { key: 'targetArrow', label: '終点に矢印', type: 'boolean', placeholder: '終点矢印を表示' },
          { key: 'connector', label: '線種 (- または --)', type: 'text', placeholder: '--' },
        ],
      },
      {
        variant: 'connectionUndirected',
        label: '接続 (矢印なし)',
        defaultLabel: '',
        defaultMetadata: {
          strokeColor: '#10B981',
          textColor: '#047857',
          connector: '--',
        },
        fields: [
          { key: 'sourceAnchor', label: '始点アンカー (L/R/T/B)', type: 'text' },
          { key: 'targetAnchor', label: '終点アンカー (L/R/T/B)', type: 'text' },
          { key: 'sourceGroup', label: '始点グループ参照', type: 'text' },
          { key: 'targetGroup', label: '終点グループ参照', type: 'text' },
          { key: 'sourceArrow', label: '始点に矢印', type: 'boolean', placeholder: '始点矢印を表示' },
          { key: 'targetArrow', label: '終点に矢印', type: 'boolean', placeholder: '終点矢印を表示' },
          { key: 'connector', label: '線種 (- または --)', type: 'text', placeholder: '--' },
        ],
      },
    ],
    defaultConfig: { type: 'architecture', diagramVariant: 'architecture-beta' },
    defaultTemplate: `architecture-beta
  title Web Application Architecture
  group edge(cloud)[Edge]
  group core(server)[Core]
  service frontend(internet)[Frontend] in edge
  service cdn(cloud)[CDN] in edge
  service backend(server)[API Service] in core
  database db(database)[Data Store]
  frontend:R -- L:cdn
  frontend:B --> T:backend
  backend:B -- T:db`,
    configFields: [
      {
        key: 'diagramVariant',
        label: '構文バージョン',
        type: 'select',
        options: [
          { value: 'architecture-beta', label: 'architecture-beta' },
          { value: 'architecture', label: 'architecture' },
        ],
      },
      { key: 'title', label: 'タイトル', type: 'text', placeholder: '図のタイトル' },
    ],
    supportsEdges: true,
    createNodeId: () => `arch_${createId()}`,
  },
  pie: {
    type: 'pie',
    label: '円グラフ',
    description: 'カテゴリ別の割合を表現する円グラフ',
    nodeTemplates: [
      {
        variant: 'slice',
        label: 'スライス',
        defaultLabel: 'カテゴリ',
        defaultMetadata: { value: '10' },
        fields: [
          { key: 'value', label: '値', type: 'number', placeholder: '例: 25.5' },
        ],
      },
    ],
    edgeTemplates: [],
    defaultConfig: { type: 'pie', title: 'サンプル', showData: false },
    defaultTemplate: `pie title サンプル
  "項目A" : 40
  "項目B" : 60`,
    configFields: [
      { key: 'title', label: 'タイトル', type: 'text', placeholder: '図のタイトル' },
      { key: 'showData', label: '値を表示', type: 'boolean', placeholder: 'スライスの値を表示' },
    ],
    supportsEdges: false,
    createNodeId: () => `slice_${createId()}`,
  },
};

export const diagramList: { type: MermaidDiagramType; label: string }[] = Object.values(diagramDefinitions).map(
  ({ type, label }) => ({ type, label })
);

export const getMermaidTemplate = (type: MermaidDiagramType): string => diagramDefinitions[type].defaultTemplate;
