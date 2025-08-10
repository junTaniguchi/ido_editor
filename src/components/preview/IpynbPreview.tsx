
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

interface IpynbPreviewProps {
  data: any;
}

/**
 * IpynbPreviewコンポーネント
 * Jupyter Notebook (.ipynb) データを簡易プレビュー表示する。
 * - セル一覧表示（Markdown/Code）
 * - セルタイプごとの表示切替
 * @param data Notebookデータ
 */
const IpynbPreview: React.FC<IpynbPreviewProps> = ({ data }) => {
  if (!data) return <div className="p-4 text-gray-500">Notebookデータがありません。</div>;
  // セル一覧を表示（Markdown/Codeのみ）
  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-2">Jupyter Notebookプレビュー</h2>
      {data.cells?.map((cell: any, idx: number) => (
        <div key={idx} className="mb-4 border-b pb-2">
          <div className="text-xs text-gray-400 mb-1">[{cell.cell_type}]</div>
          {cell.cell_type === 'markdown' ? (
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: cell.source.join('') }} />
          ) : (
            <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">{cell.source.join('')}</pre>
          )}
        </div>
      ))}
    </div>
  );
};

export default IpynbPreview;
