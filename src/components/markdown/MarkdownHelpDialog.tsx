
/**
 * MarkdownHelpDialog.tsx
 * このファイルは、Markdownエディタのショートカットや記法ヘルプを表示するダイアログ型Reactコンポーネントを提供します。
 * 主な機能:
 * - Markdown記法のヘルプ表示
 * - ショートカット一覧表示
 * - ダイアログの表示/非表示制御
 */
'use client';

import React from 'react';
import { IoClose } from 'react-icons/io5';

interface MarkdownHelpDialogProps {
  onClose: () => void;
}

/**
 * MarkdownHelpDialogコンポーネント
 * Markdownエディタのショートカットや記法ヘルプを表示するダイアログ。
 * - Markdown記法のヘルプ表示
 * - ショートカット一覧表示
 * - ダイアログの表示/非表示制御
 * @param onClose ダイアログを閉じるコールバック
 */
const MarkdownHelpDialog: React.FC<MarkdownHelpDialogProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-[600px] max-h-[80vh] overflow-y-auto shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">マークダウンエディタのヘルプ</h3>
          <button 
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={onClose}
          >
            <IoClose size={20} />
          </button>
        </div>
        
        <div className="space-y-4">
          <h4 className="font-bold">ショートカットキー</h4>
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="p-2 text-left">ショートカット</th>
                <th className="p-2 text-left">機能</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + B</code></td>
                <td className="p-2">太字</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + I</code></td>
                <td className="p-2">斜体</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + K</code></td>
                <td className="p-2">リンク</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + 1</code></td>
                <td className="p-2">H1見出し</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + 2</code></td>
                <td className="p-2">H2見出し</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + 3</code></td>
                <td className="p-2">H3見出し</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + Q</code></td>
                <td className="p-2">引用</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + U</code></td>
                <td className="p-2">箇条書きリスト</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + O</code></td>
                <td className="p-2">番号付きリスト</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + Shift + C</code></td>
                <td className="p-2">コードブロック</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Alt + T</code></td>
                <td className="p-2">テーブル整形</td>
              </tr>
            </tbody>
          </table>
          
          <h4 className="font-bold mt-4">選択範囲の一括処理ショートカット</h4>
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="p-2 text-left">ショートカット</th>
                <th className="p-2 text-left">機能</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + Shift + U</code></td>
                <td className="p-2">選択範囲を箇条書きに変換</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + Shift + O</code></td>
                <td className="p-2">選択範囲を番号付きリストに変換</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + Shift + T</code></td>
                <td className="p-2">選択範囲をタスクリストに変換</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + Shift + X</code></td>
                <td className="p-2">選択範囲を完了タスクリストに変換</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + Shift + Q</code></td>
                <td className="p-2">選択範囲を引用に変換</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Ctrl/Cmd + /</code></td>
                <td className="p-2">選択範囲のコメント切替</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Tab</code></td>
                <td className="p-2">選択範囲のインデント追加</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>Shift + Tab</code></td>
                <td className="p-2">選択範囲のインデント削除</td>
              </tr>
            </tbody>
          </table>
          
          <h4 className="font-bold mt-4">特殊選択と編集ツール</h4>
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="p-2 text-left">機能</th>
                <th className="p-2 text-left">説明</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2">矩形選択（カラム選択）</td>
                <td className="p-2">ツールバーの矩形選択ボタンをオンにすると、Alt/Option キーを押しながらドラッグすることで、テキストの列（カラム）単位で選択できます。表形式のデータの編集に便利です。</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2">行折り返し</td>
                <td className="p-2">ツールバーの折り返しボタンで、長い行の折り返し表示をON/OFFできます。折り返しを無効にすると、横スクロールで全体を見ることができます。</td>
              </tr>
            </tbody>
          </table>
          
          <h4 className="font-bold mt-4">マークダウン構文</h4>
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="p-2 text-left">構文</th>
                <th className="p-2 text-left">説明</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code># テキスト</code></td>
                <td className="p-2">見出し1</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>## テキスト</code></td>
                <td className="p-2">見出し2</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>**テキスト**</code></td>
                <td className="p-2">太字</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>*テキスト*</code></td>
                <td className="p-2">斜体</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>~~テキスト~~</code></td>
                <td className="p-2">取り消し線</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>[リンクテキスト](URL)</code></td>
                <td className="p-2">リンク</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>![代替テキスト](画像URL)</code></td>
                <td className="p-2">画像</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>- テキスト</code></td>
                <td className="p-2">箇条書きリスト</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>1. テキスト</code></td>
                <td className="p-2">番号付きリスト</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>- [ ] タスク</code></td>
                <td className="p-2">タスクリスト（未完了）</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>- [x] タスク</code></td>
                <td className="p-2">タスクリスト（完了）</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>{`> テキスト`}</code></td>
                <td className="p-2">引用</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>{"\`\`\`\nコード\n\`\`\`"}</code></td>
                <td className="p-2">コードブロック</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>---</code></td>
                <td className="p-2">水平線</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>| ヘッダー1 | ヘッダー2 |</code><br /><code>| ------- | ------- |</code><br /><code>| データ1 | データ2 |</code></td>
                <td className="p-2">テーブル</td>
              </tr>
              <tr className="border-b dark:border-gray-600">
                <td className="p-2"><code>| 左揃え | 中央揃え | 右揃え |</code><br /><code>| :---- | :---: | ----: |</code></td>
                <td className="p-2">テーブル（列の配置指定）</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MarkdownHelpDialog;
