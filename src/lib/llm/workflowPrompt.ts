export interface WorkflowPromptInput {
  request: string;
  columns: string[];
  sampleRows: Array<Record<string, unknown>>;
}

export interface WorkflowGeneratedCell {
  title?: string;
  sql: string;
  description?: string;
  runImmediately?: boolean;
}

export interface WorkflowPromptOutput {
  rationale?: string;
  cells: WorkflowGeneratedCell[];
}

export const workflowSystemPrompt = `あなたはデータ分析者を支援するアシスタントです。\n` +
  `与えられた自然言語の要望、利用可能な列情報、サンプル行を基に、` +
  `安全で説明可能なSQLクエリを含むNotebookセルの候補を提案してください。\n` +
  `出力は必ずJSONオブジェクトのみで、余計な文章は含めないでください。\n` +
  `SQLは読み取り専用クエリ（SELECT、WITH）に限定し、` +
  `テーブルに変更を加える命令（INSERT、UPDATE、DELETE、DROP、TRUNCATE、ALTERなど）は生成しないでください。`;

export const workflowOutputExample = {
  rationale: '生成方針の簡潔な説明（任意）',
  cells: [
    {
      title: '売上トップ10',
      sql: 'SELECT product, SUM(amount) AS total_amount FROM ? GROUP BY product ORDER BY total_amount DESC LIMIT 1000;',
      description: '商品別売上ランキングを取得します。',
      runImmediately: true,
    },
  ],
};

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function formatColumns(columns: string[]): string {
  if (!Array.isArray(columns) || columns.length === 0) {
    return '（列情報なし）';
  }

  return columns
    .filter((col) => typeof col === 'string' && col.trim().length > 0)
    .map((col) => `- ${col.trim()}`)
    .join('\n');
}

function formatSampleRows(rows: Array<Record<string, unknown>>): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '[]';
  }

  try {
    const normalized = rows.slice(0, 5).map((row) => {
      if (!row || typeof row !== 'object') {
        return row;
      }

      const entries = Object.entries(row).slice(0, 25).map(([key, value]) => {
        if (value === null || value === undefined) {
          return [key, value];
        }

        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
          return [key, value];
        }

        try {
          return [key, JSON.parse(JSON.stringify(value))];
        } catch {
          return [key, String(value)];
        }
      });

      return Object.fromEntries(entries);
    });

    return JSON.stringify(normalized, null, 2);
  } catch {
    return '[]';
  }
}

export function buildWorkflowMessages(input: WorkflowPromptInput): ChatCompletionMessage[] {
  const columnsText = formatColumns(input.columns || []);
  const sampleText = formatSampleRows(input.sampleRows || []);
  const schema = JSON.stringify(workflowOutputExample, null, 2);

  const userContent =
    `自然言語リクエスト:\n${input.request.trim()}\n\n` +
    `利用可能な列:\n${columnsText}\n\n` +
    `データサンプル(最大5行):\n${sampleText}\n\n` +
    `以下のJSONスキーマに準拠した応答のみを出力してください:\n${schema}\n\n` +
    `各セルは読み取り専用のSQLを含め、ユーザーがすぐに実行できるようにしてください。`;

  return [
    { role: 'system', content: workflowSystemPrompt },
    { role: 'user', content: userContent },
  ];
}

function extractJsonPayload(raw: string): any {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    throw new Error('モデル応答が空でした。');
  }

  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  const jsonText = fenceMatch ? fenceMatch[1] : trimmed;

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error('モデル応答をJSONとして解析できませんでした。');
  }
}

export function parseWorkflowResponse(raw: string): WorkflowPromptOutput {
  const payload = extractJsonPayload(raw);
  const cellsRaw = Array.isArray(payload?.cells) ? payload.cells : [];

  const cells: WorkflowGeneratedCell[] = cellsRaw
    .filter((cell) => cell && typeof cell === 'object')
    .map((cell) => {
      const sql = typeof cell.sql === 'string' ? cell.sql.trim() : '';
      const title = typeof cell.title === 'string' ? cell.title.trim() : undefined;
      const description = typeof cell.description === 'string' ? cell.description.trim() : undefined;
      const runImmediately = Boolean((cell as WorkflowGeneratedCell).runImmediately);

      return {
        title: title && title.length > 0 ? title : undefined,
        sql,
        description: description && description.length > 0 ? description : undefined,
        runImmediately,
      };
    })
    .filter((cell) => cell.sql.length > 0);

  if (cells.length === 0) {
    throw new Error('モデル応答に有効なセルが含まれていません。');
  }

  const rationale = typeof payload?.rationale === 'string' && payload.rationale.trim().length > 0
    ? payload.rationale.trim()
    : undefined;

  return { cells, rationale };
}

const UNSAFE_SQL_KEYWORDS = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'UPDATE', 'INSERT', 'REPLACE'];

export function detectUnsafeSql(sql: string): string | null {
  const normalized = (sql || '').replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  for (const keyword of UNSAFE_SQL_KEYWORDS) {
    const pattern = new RegExp(`(^|[^a-zA-Z_])${keyword}\\b`, 'i');
    if (pattern.test(normalized)) {
      return `${keyword.toUpperCase()} 文が含まれているため安全ではありません。`;
    }
  }

  return null;
}

export function ensureWorkflowCellsAreSafe(cells: WorkflowGeneratedCell[]): WorkflowGeneratedCell[] {
  cells.forEach((cell) => {
    const message = detectUnsafeSql(cell.sql);
    if (message) {
      throw new Error(message);
    }
  });

  return cells;
}
