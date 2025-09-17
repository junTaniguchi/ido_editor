
/**
 * IpynbPreview.tsx
 * Jupyter Notebook（.ipynb）ファイルのプレビューReactコンポーネント。
 * 主な機能:
 * - セルごとの内容表示（コード・Markdown・出力）
 * - セルタイプごとのレンダリング
 * - 実行結果の表示（グラフ・画像・テキスト等）
 * - Notebook構造の階層表示
 */
 
/**
 * IpynbPreview.tsx
 * このファイルは、Jupyter Notebook (.ipynb) データを簡易プレビュー表示するReactコンポーネントを提供します。
 * 主な機能:
 * - セル一覧表示（Markdown/Code）
 * - セルタイプごとの表示切替
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const normalizeText = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
};

interface NotebookCell {
  cell_type: 'markdown' | 'code' | string;
  metadata?: Record<string, any>;
  source?: string[];
  outputs?: NotebookOutput[];
  execution_count?: number | null;
}

type NotebookOutput =
  | {
      output_type: 'stream';
      name: 'stdout' | 'stderr';
      text: string | string[];
    }
  | {
      output_type: 'execute_result' | 'display_data';
      data?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  | {
      output_type: 'error';
      ename: string;
      evalue: string;
      traceback?: string[];
    };

interface NotebookData {
  cells?: NotebookCell[];
  metadata?: Record<string, any>;
}

interface IpynbPreviewProps {
  data: NotebookData;
}

const renderOutput = (output: NotebookOutput, index: number) => {
  switch (output.output_type) {
    case 'stream': {
      const textRaw = Array.isArray(output.text) ? output.text.join('') : (output.text || '');
      const text = normalizeText(textRaw);
      const isError = output.name === 'stderr';
      return (
        <pre
          key={`stream-${index}`}
          className={`text-xs rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap ${
            isError ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
          }`}
        >
          {text}
        </pre>
      );
    }
    case 'execute_result':
    case 'display_data': {
      const data = output.data || {};
      const mimeTextRaw =
        data['text/plain']?.join?.('') ||
        data['text/plain'] ||
        data['text/html']?.join?.('') ||
        data['text/html'];
      const mimeText = mimeTextRaw ? normalizeText(String(mimeTextRaw)) : '';
      if (data['image/png']) {
        const src = `data:image/png;base64,${data['image/png']}`;
        return (
          <img
            key={`image-${index}`}
            src={src}
            alt="Notebook output"
            className="my-2 max-h-64 rounded-md border border-gray-200 dark:border-gray-700"
          />
        );
      }
      if (data['text/html']) {
        return (
          <div
            key={`html-${index}`}
            className="text-sm mt-2 prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: Array.isArray(data['text/html']) ? data['text/html'].join('') : data['text/html'] }}
          />
        );
      }
      if (mimeText) {
        return (
          <pre
            key={`result-${index}`}
            className="bg-gray-100 dark:bg-gray-800 text-xs px-3 py-2 rounded-md overflow-x-auto whitespace-pre-wrap"
          >
            {mimeText}
          </pre>
        );
      }
      return null;
    }
    case 'error': {
      return (
        <pre
          key={`error-${index}`}
          className="bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-200 text-xs px-3 py-2 rounded-md overflow-x-auto whitespace-pre-wrap"
        >
          {normalizeText(`${output.ename}: ${output.evalue}\n${(output.traceback || []).join('\n')}`)}
        </pre>
      );
    }
    default:
      return null;
  }
};

/**
 * IpynbPreviewコンポーネント
 * Notebook セルをカード形式で表示する。
 */
const IpynbPreview: React.FC<IpynbPreviewProps> = ({ data }) => {
  if (!data || !data.cells) {
    return <div className="p-4 text-gray-500">Notebookデータがありません。</div>;
  }

  return (
    <div className="space-y-4">
      {data.cells.map((cell, idx) => {
        const source = cell.source ? cell.source.join('') : '';
        const normalizedSource = normalizeText(source);
        const isMarkdown = cell.cell_type === 'markdown';
        const executionLabel =
          cell.cell_type === 'code'
            ? `In [${cell.execution_count ?? ' '}]:`
            : cell.cell_type === 'markdown'
            ? 'Markdown'
            : cell.cell_type;

        return (
          <div
            key={idx}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
          >
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="font-mono">{executionLabel}</span>
              {cell.metadata && Object.keys(cell.metadata).length > 0 && (
                <span className="font-mono text-[11px]">metadata: {JSON.stringify(cell.metadata)}</span>
              )}
            </div>
            <div className="px-4 py-3 space-y-3">
              {isMarkdown ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizedSource}</ReactMarkdown>
                </div>
              ) : (
                <pre className="bg-gray-900/90 text-gray-50 text-xs px-3 py-2 rounded-md overflow-x-auto whitespace-pre-wrap">
                  <code className="whitespace-pre-wrap block">{normalizedSource}</code>
                </pre>
              )}

              {cell.outputs && cell.outputs.length > 0 && (
                <div className="space-y-2 border-t border-dashed border-gray-200 dark:border-gray-700 pt-3">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-300">Outputs</div>
                  {cell.outputs.map((output, outputIdx) => renderOutput(output, outputIdx))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default IpynbPreview;
