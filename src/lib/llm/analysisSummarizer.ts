import { ChartSettings, SqlNotebookCell } from '@/types';
import type { ChatCompletionMessage } from './workflowPrompt';

const MAX_DATASET_COLUMNS = 60;
const MAX_SAMPLE_ROWS = 20;
const MAX_ROW_KEYS = 40;
const MAX_STRING_LENGTH = 500;
const MAX_NOTEBOOK_CELLS = 12;
const MAX_NOTEBOOK_SAMPLE_ROWS = 20;
const MAX_NOTEBOOK_COLUMNS = 40;
const MAX_BULLET_ITEMS = 8;
const MAX_CHART_LABELS = 25;
const MAX_CHART_DATASET_PREVIEW = 10;
const MAX_WORD_TABLE_ROWS = 15;

export interface AnalysisSummaryInput {
  datasetName?: string | null;
  datasetType?: string | null;
  columns?: string[] | null;
  rows?: any[] | null;
  infoSummary?: Record<string, any> | null;
  statistics?: Record<string, any> | null;
  notebookCells?: SqlNotebookCell[] | null;
  chartSettings?: ChartSettings | null;
  chartData?: any;
  analysisContext?: string | null;
  latestQuery?: string | null;
  latestQueryResult?: {
    columns?: string[] | null;
    rows?: any[] | null;
  } | null;
}

export interface InfoSummaryEntry {
  column: string;
  type: string;
  count: number;
  nonNullCount: number;
  maxLength?: number | null;
  sample?: unknown[];
}

export interface StatisticsSummaryEntry {
  column: string;
  type: 'numeric' | 'non-numeric';
  metrics: Record<string, number | string | null>;
}

export interface NotebookCellSummary {
  id: string;
  title: string;
  query: string;
  status: SqlNotebookCell['status'];
  executedAt?: string | null;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, unknown>[];
  error?: string | null;
  updatedAt?: string | null;
}

export interface ChartDatasetPreview {
  label?: string | null;
  length?: number;
  sample?: unknown[];
}

export interface ChartDataPreview {
  labels?: unknown[];
  datasets?: ChartDatasetPreview[];
  records?: Record<string, unknown>[];
  notes?: string[];
  metadata?: Record<string, unknown>;
}

export interface ChartSummary {
  type: ChartSettings['type'];
  xAxis?: string | null;
  yAxis?: string | null;
  aggregation?: ChartSettings['aggregation'] | null;
  categoryField?: string | null;
  dataSource?: ChartSettings['dataSource'] | null;
  options?: Record<string, unknown> | null;
  dataPreview?: ChartDataPreview | null;
}

export interface QueryResultSummary {
  query: string;
  rowCount: number;
  columns: string[];
  sampleRows: Record<string, unknown>[];
}

export interface AnalysisSummary {
  metadata: {
    generatedAt: string;
    datasetName?: string | null;
    datasetType?: string | null;
    rowCount: number;
    columnCount: number;
    notebookCellCount: number;
    hasStatistics: boolean;
    hasChart: boolean;
    hasInfoSummary: boolean;
    analysisContext?: string | null;
  };
  dataset?: {
    columns: string[];
    sampleRows: Record<string, unknown>[];
  } | null;
  infoSummary?: InfoSummaryEntry[] | null;
  statistics?: StatisticsSummaryEntry[] | null;
  notebook?: {
    cells: NotebookCellSummary[];
  } | null;
  chart?: ChartSummary | null;
  latestQuery?: QueryResultSummary | null;
}

export interface LlmReportWordTable {
  caption?: string | null;
  headers: string[];
  rows: string[][];
}

export interface LlmReportWordSection {
  heading: string;
  level?: 1 | 2 | 3;
  paragraphs?: string[];
  bullets?: string[];
  table?: LlmReportWordTable;
}

export interface LlmReportWordDocument {
  title: string;
  sections: LlmReportWordSection[];
}

export interface LlmReportResponse {
  markdown: string;
  bulletSummary: string[];
  word: LlmReportWordDocument;
}

export const reportResponseJsonSchema = {
  name: 'analysis_insight_response',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['markdown', 'bulletSummary', 'word'],
    properties: {
      markdown: {
        type: 'string',
        description: '完全なMarkdown形式の分析レポート。',
      },
      bulletSummary: {
        type: 'array',
        maxItems: MAX_BULLET_ITEMS,
        items: {
          type: 'string',
          description: '主要なポイントを簡潔に表現した日本語の箇条書き。',
        },
      },
      word: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'sections'],
        properties: {
          title: {
            type: 'string',
            description: 'Wordドキュメントのタイトル。',
          },
          sections: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['heading'],
              properties: {
                heading: {
                  type: 'string',
                  description: 'セクション見出し。',
                },
                level: {
                  type: 'integer',
                  enum: [1, 2, 3],
                  description: '見出しレベル。1が最上位。',
                },
                paragraphs: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '本文の段落。',
                },
                bullets: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '箇条書き項目。',
                },
                table: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['headers', 'rows'],
                  properties: {
                    caption: {
                      type: 'string',
                      description: 'テーブルのキャプション。',
                    },
                    headers: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'テーブルの列ヘッダー。',
                    },
                    rows: {
                      type: 'array',
                      items: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      description: 'テーブルの各行。',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const truncateString = (value: string, limit = MAX_STRING_LENGTH): string => {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}… (truncated ${trimmed.length - limit} chars)`;
};

const sanitizeValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number(value.toFixed(6));
    }
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= 2) {
    if (Array.isArray(value)) {
      return { type: 'array', length: value.length };
    }
    return '[Object]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_NOTEBOOK_SAMPLE_ROWS).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_ROW_KEYS)
      .map(([key, val]) => [key, sanitizeValue(val, depth + 1)]);
    return Object.fromEntries(entries);
  }

  return String(value);
};

const sanitizeRow = (row: any): Record<string, unknown> => {
  if (row === null || row === undefined) {
    return {};
  }

  if (Array.isArray(row)) {
    const limited = row.slice(0, MAX_ROW_KEYS);
    return Object.fromEntries(limited.map((value, index) => [
      `col_${index}`,
      sanitizeValue(value, 1),
    ]));
  }

  if (typeof row !== 'object') {
    return { value: sanitizeValue(row, 1) };
  }

  const entries = Object.entries(row as Record<string, unknown>)
    .slice(0, MAX_ROW_KEYS)
    .map(([key, value]) => [key, sanitizeValue(value, 1)]);

  return Object.fromEntries(entries);
};

const limitArray = <T>(values: T[] | null | undefined, limit: number): T[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.slice(0, limit);
};

const summarizeInfo = (info: Record<string, any> | null | undefined): InfoSummaryEntry[] => {
  if (!info || typeof info !== 'object') {
    return [];
  }

  return Object.entries(info)
    .slice(0, MAX_DATASET_COLUMNS)
    .map(([column, value]) => {
      const entry = (typeof value === 'object' && value !== null) ? value as Record<string, any> : {};
      const sample = Array.isArray(entry.sample)
        ? entry.sample.map((item: unknown) => sanitizeValue(item, 1))
        : undefined;

      return {
        column,
        type: typeof entry.type === 'string' ? entry.type : 'unknown',
        count: typeof entry.count === 'number' ? entry.count : 0,
        nonNullCount: typeof entry.nonNullCount === 'number' ? entry.nonNullCount : 0,
        maxLength: typeof entry.maxLength === 'number' ? entry.maxLength : null,
        sample,
      } satisfies InfoSummaryEntry;
    });
};

const summarizeStatistics = (stats: Record<string, any> | null | undefined): StatisticsSummaryEntry[] => {
  if (!stats || typeof stats !== 'object') {
    return [];
  }

  return Object.entries(stats)
    .slice(0, MAX_DATASET_COLUMNS)
    .map(([column, value]) => {
      const entry = (typeof value === 'object' && value !== null) ? value as Record<string, any> : {};
      const isNumeric = entry.type !== 'non-numeric' && Object.keys(entry).some((key) => typeof entry[key] === 'number');
      const metrics: Record<string, number | string | null> = {};

      Object.entries(entry)
        .filter(([key]) => key !== 'examples' && key !== 'type')
        .slice(0, MAX_ROW_KEYS)
        .forEach(([key, metricValue]) => {
          if (typeof metricValue === 'number' && Number.isFinite(metricValue)) {
            metrics[key] = Number(metricValue.toFixed(4));
          } else if (metricValue === null) {
            metrics[key] = null;
          } else if (typeof metricValue === 'string') {
            metrics[key] = truncateString(metricValue, 120);
          } else if (Array.isArray(metricValue)) {
            metrics[key] = truncateString(JSON.stringify(metricValue.slice(0, 5)));
          }
        });

      if (Array.isArray(entry.examples)) {
        metrics.examples = JSON.stringify(entry.examples.slice(0, 5).map((item: unknown) => sanitizeValue(item, 1)));
      }

      return {
        column,
        type: isNumeric ? 'numeric' : 'non-numeric',
        metrics,
      } satisfies StatisticsSummaryEntry;
    });
};

const summarizeNotebookCells = (cells: SqlNotebookCell[] | null | undefined): NotebookCellSummary[] => {
  if (!Array.isArray(cells) || cells.length === 0) {
    return [];
  }

  return cells
    .slice(0, MAX_NOTEBOOK_CELLS)
    .map((cell) => {
      const query = typeof cell.query === 'string' ? truncateString(cell.query, 2000) : '';
      const columns = Array.isArray(cell.columns)
        ? cell.columns.filter((col): col is string => typeof col === 'string').slice(0, MAX_NOTEBOOK_COLUMNS)
        : [];

      const sourceRows = Array.isArray(cell.result)
        ? cell.result
        : Array.isArray(cell.originalResult)
          ? cell.originalResult
          : [];
      const rowCount = Array.isArray(sourceRows) ? sourceRows.length : 0;
      const sampleRows = limitArray(sourceRows, MAX_NOTEBOOK_SAMPLE_ROWS).map((row) => sanitizeRow(row));

      return {
        id: cell.id,
        title: cell.title,
        query,
        status: cell.status,
        executedAt: cell.executedAt,
        updatedAt: cell.updatedAt,
        rowCount,
        columns,
        sampleRows,
        error: cell.error,
      } satisfies NotebookCellSummary;
    });
};

const summarizeChart = (
  chartSettings: ChartSettings | null | undefined,
  chartData: any,
): ChartSummary | null => {
  if (!chartSettings) {
    return null;
  }

  const summary: ChartSummary = {
    type: chartSettings.type,
    xAxis: chartSettings.xAxis ?? null,
    yAxis: chartSettings.yAxis ?? null,
    aggregation: chartSettings.aggregation ?? null,
    categoryField: chartSettings.categoryField ?? null,
    dataSource: chartSettings.dataSource ?? null,
    options: chartSettings.options ? sanitizeValue(chartSettings.options, 1) as Record<string, unknown> : null,
    dataPreview: null,
  };

  if (!chartData || typeof chartData !== 'object') {
    return summary;
  }

  const preview: ChartDataPreview = {};

  if (Array.isArray(chartData.labels)) {
    preview.labels = chartData.labels
      .slice(0, MAX_CHART_LABELS)
      .map((label: unknown) => sanitizeValue(label, 1));
  }

  if (Array.isArray(chartData.datasets)) {
    preview.datasets = chartData.datasets.slice(0, 5).map((dataset: any) => {
      const label = typeof dataset?.label === 'string' ? dataset.label : null;
      const dataArray = Array.isArray(dataset?.data) ? dataset.data : [];
      return {
        label,
        length: dataArray.length,
        sample: dataArray.slice(0, MAX_CHART_DATASET_PREVIEW).map((item: unknown) => sanitizeValue(item, 1)),
      } satisfies ChartDatasetPreview;
    });
  }

  if (Array.isArray(chartData.data)) {
    preview.records = chartData.data
      .slice(0, MAX_CHART_DATASET_PREVIEW)
      .map((item: unknown) => sanitizeRow(item));
  }

  if (chartData.metadata && typeof chartData.metadata === 'object') {
    preview.metadata = sanitizeValue(chartData.metadata, 1) as Record<string, unknown>;
  }

  if (Array.isArray(chartData.notes)) {
    preview.notes = chartData.notes
      .slice(0, 10)
      .map((note: unknown) => String(note));
  }

  summary.dataPreview = Object.keys(preview).length > 0 ? preview : null;
  return summary;
};

const summarizeQueryResult = (
  queryText: string | null | undefined,
  result: AnalysisSummaryInput['latestQueryResult'],
): QueryResultSummary | null => {
  if (!queryText || !result) {
    return null;
  }

  const rows = Array.isArray(result.rows) ? result.rows : [];
  const columns = Array.isArray(result.columns) && result.columns.length > 0
    ? result.columns.filter((col): col is string => typeof col === 'string')
    : (rows.length > 0 && typeof rows[0] === 'object')
      ? Object.keys(rows[0] as Record<string, unknown>)
      : [];

  const limitedColumns = limitArray(columns, MAX_DATASET_COLUMNS);
  const sampleRows = limitArray(rows, MAX_SAMPLE_ROWS).map((row) => sanitizeRow(row));

  return {
    query: truncateString(queryText, 2000),
    rowCount: rows.length,
    columns: limitedColumns,
    sampleRows,
  } satisfies QueryResultSummary;
};

export function buildAnalysisSummary(input: AnalysisSummaryInput): AnalysisSummary {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const columnsFromInput = Array.isArray(input.columns)
    ? input.columns.filter((col): col is string => typeof col === 'string')
    : [];

  const inferredColumns = rows.length > 0 && typeof rows[0] === 'object'
    ? Object.keys(rows[0] as Record<string, unknown>)
    : [];

  const columns = (columnsFromInput.length > 0 ? columnsFromInput : inferredColumns)
    .slice(0, MAX_DATASET_COLUMNS);
  const sampleRows = rows.slice(0, MAX_SAMPLE_ROWS).map((row) => sanitizeRow(row));

  const infoSummary = summarizeInfo(input.infoSummary);
  const statistics = summarizeStatistics(input.statistics);
  const notebookCells = summarizeNotebookCells(input.notebookCells);
  const chart = summarizeChart(input.chartSettings, input.chartData);
  const latestQuery = summarizeQueryResult(input.latestQuery ?? null, input.latestQueryResult);

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      datasetName: input.datasetName ?? null,
      datasetType: input.datasetType ?? null,
      rowCount: rows.length,
      columnCount: columns.length,
      notebookCellCount: notebookCells.length,
      hasStatistics: statistics.length > 0,
      hasChart: chart !== null,
      hasInfoSummary: infoSummary.length > 0,
      analysisContext: input.analysisContext ?? null,
    },
    dataset: columns.length > 0 || sampleRows.length > 0 ? { columns, sampleRows } : null,
    infoSummary: infoSummary.length > 0 ? infoSummary : null,
    statistics: statistics.length > 0 ? statistics : null,
    notebook: notebookCells.length > 0 ? { cells: notebookCells } : null,
    chart,
    latestQuery,
  } satisfies AnalysisSummary;
}

export const reportSystemPrompt = `あなたはデータ分析結果を要約するアナリストです。` +
  `渡されたJSONサマリーを用いて、意思決定者向けの簡潔で正確な説明を日本語で作成します。` +
  `事実のみを記述し、推測は行わないでください。`;

export function buildReportMessages(summary: AnalysisSummary, customInstruction?: string): ChatCompletionMessage[] {
  const summaryJson = JSON.stringify(summary, null, 2);
  const additionalInstruction = customInstruction && customInstruction.trim().length > 0
    ? customInstruction.trim()
    : '分析のポイントを抽出し、実務で活用できる洞察を箇条書きで示してください。';

  const userContent = [
    '以下はNotebookの結果・統計・チャート設定をまとめた分析サマリーJSONです。',
    'この内容のみを根拠として、Markdownレポート・主要ポイントの箇条書き・Word構造を生成してください。',
    '',
    '=== 分析サマリーJSON ===',
    summaryJson,
    '==========================',
    '',
    '追加指示:',
    additionalInstruction,
    '',
    '出力要件:',
    `- JSONオブジェクトのみを出力し、プロパティは markdown, bulletSummary (最大${MAX_BULLET_ITEMS}件), word に限定すること。`,
    '- bulletSummary は実行可能なアクションや重要な観察点を短文で表現する。',
    '- markdown は見出し・表・箇条書きを適切に用いて日本語で記述する。',
    '- word は Word ドキュメントを構築するための構造データとし、sections の各要素に paragraphs または bullets 等を含める。',
  ].join('\n');

  return [
    { role: 'system', content: reportSystemPrompt },
    { role: 'user', content: userContent },
  ];
}

const parseWordTable = (raw: any): LlmReportWordTable | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const headers = Array.isArray(raw.headers)
    ? raw.headers.filter((item): item is string => typeof item === 'string')
    : [];
  const rows = Array.isArray(raw.rows)
    ? raw.rows.slice(0, MAX_WORD_TABLE_ROWS).map((row: any) =>
        Array.isArray(row)
          ? row.map((cell) => (typeof cell === 'string' ? cell : JSON.stringify(sanitizeValue(cell, 1))))
          : [])
    : [];

  if (headers.length === 0 || rows.length === 0) {
    return null;
  }

  return {
    caption: typeof raw.caption === 'string' ? truncateString(raw.caption, 200) : null,
    headers,
    rows,
  } satisfies LlmReportWordTable;
};

const parseWordSection = (raw: any): LlmReportWordSection | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const heading = typeof raw.heading === 'string' ? raw.heading.trim() : '';
  if (!heading) {
    return null;
  }

  const level = typeof raw.level === 'number' && [1, 2, 3].includes(raw.level)
    ? (raw.level as 1 | 2 | 3)
    : undefined;

  const paragraphs = Array.isArray(raw.paragraphs)
    ? raw.paragraphs
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => truncateString(item, 1000))
    : undefined;

  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => truncateString(item, 300))
    : undefined;

  const table = parseWordTable(raw.table);

  return {
    heading,
    level,
    paragraphs,
    bullets,
    table,
  } satisfies LlmReportWordSection;
};

export function parseReportResponse(payload: any): LlmReportResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('LLM応答を解析できませんでした。');
  }

  const markdown = typeof payload.markdown === 'string' ? payload.markdown : '';
  const bulletSummary = Array.isArray(payload.bulletSummary)
    ? payload.bulletSummary
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, MAX_BULLET_ITEMS)
        .map((item) => truncateString(item, 300))
    : [];

  const wordRaw = payload.word;
  const title = typeof wordRaw?.title === 'string' ? truncateString(wordRaw.title, 200) : '';
  const sectionsRaw = Array.isArray(wordRaw?.sections) ? wordRaw.sections : [];
  const sections = sectionsRaw
    .map((section) => parseWordSection(section))
    .filter((section): section is LlmReportWordSection => section !== null);

  if (!markdown || bulletSummary.length === 0 || !title || sections.length === 0) {
    throw new Error('LLM応答に必要な項目が不足しています。');
  }

  return {
    markdown,
    bulletSummary,
    word: {
      title,
      sections,
    },
  } satisfies LlmReportResponse;
}


