
/**
 * MarkdownEditorExtension.tsx
 * このファイルは、Markdownエディタの拡張機能（見出し・リスト・リンク・テーブル・ショートカット・ヘルプ等）を提供するReactコンポーネントです。
 * 主な機能:
 * - Markdown記法の挿入・編集
 * - テーブル作成ウィザード
 * - ヘルプダイアログ
 * - ショートカット操作
 */
'use client';

import React, { useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { 
  IoText, IoList, IoListOutline, IoLink, IoCode, IoAlbumsOutline, 
  IoHelpCircleOutline, IoGridOutline, IoGridSharp, IoCheckbox, 
  IoCheckmarkDoneSharp, IoChevronForward, IoChevronBack, IoRemoveOutline,
  IoResize, IoResizeOutline, IoMove, IoCropOutline
} from 'react-icons/io5';
import useMarkdownShortcuts from '@/hooks/useMarkdownShortcuts';
import MarkdownHelpDialog from './MarkdownHelpDialog';
import TableWizard from './TableWizard';

interface MarkdownEditorExtensionProps {
  tabId: string;
  editorRef: React.RefObject<any>;
}

/**
 * MarkdownEditorExtensionコンポーネント
 * Markdownエディタの拡張機能（見出し・リスト・リンク・テーブル・ショートカット・ヘルプ等）を提供。
 * - Markdown記法の挿入・編集
 * - テーブル作成ウィザード
 * - ヘルプダイアログ
 * - ショートカット操作
 * @param tabId 編集対象タブID
 * @param editorRef エディタ参照
 */
const MarkdownEditorExtension: React.FC<MarkdownEditorExtensionProps> = ({ tabId, editorRef }) => {
  const { tabs, editorSettings, updateEditorSettings } = useEditorStore();
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showTableWizard, setShowTableWizard] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  const currentTab = tabs.get(tabId);
  
  const { 
    insertHeading,
    insertBold,
    insertItalic,
    insertUnorderedList,
    insertOrderedList,
    insertLink,
    insertCodeBlock,
    insertBlockquote,
    insertTable,
    formatTable,
    // 選択範囲の一括処理
    bulkUnorderedList,
    bulkOrderedList,
    bulkTaskList,
    bulkBlockquote,
    toggleComment,
    indentSelection,
    outdentSelection
  } = useMarkdownShortcuts(editorRef, tabId);

  // テーブルウィザードで設定した値に基づいてテーブルを挿入
  const handleInsertTable = (rows: number, cols: number, alignments: string[]) => {
    insertTable(rows, cols, alignments);
    setShowTableWizard(false);
  };

  if (!currentTab) return null;

  return (
    <>
      <div className="p-1 border-b border-gray-300 dark:border-gray-700 flex flex-wrap items-center">
        <div className="flex space-x-1 mr-3">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={() => insertHeading(1)}
            title="見出し1 (Ctrl+1)"
          >
            <span className="font-bold">H1</span>
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={() => insertHeading(2)}
            title="見出し2 (Ctrl+2)"
          >
            <span className="font-bold">H2</span>
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={() => insertHeading(3)}
            title="見出し3 (Ctrl+3)"
          >
            <span className="font-bold">H3</span>
          </button>
        </div>

        <div className="flex space-x-1 mr-3">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertBold}
            title="太字 (Ctrl+B)"
          >
            <span className="font-bold">B</span>
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertItalic}
            title="斜体 (Ctrl+I)"
          >
            <span className="italic">I</span>
          </button>
        </div>

        <div className="flex space-x-1 mr-3">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertUnorderedList}
            title="箇条書き (Ctrl+U)"
          >
            <IoListOutline size={18} />
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertOrderedList}
            title="番号付きリスト (Ctrl+O)"
          >
            <IoList size={18} />
          </button>
        </div>

        <div className="flex space-x-1 mr-3">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertLink}
            title="リンク (Ctrl+K)"
          >
            <IoLink size={18} />
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertCodeBlock}
            title="コードブロック (Ctrl+Shift+C)"
          >
            <IoCode size={18} />
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertBlockquote}
            title="引用 (Ctrl+Q)"
          >
            <IoAlbumsOutline size={18} />
          </button>
        </div>
        
        <div className="flex space-x-1 mr-3">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={() => setShowTableWizard(true)}
            title="テーブルウィザード"
          >
            <IoGridOutline size={18} />
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={formatTable}
            title="テーブル整形 (Alt+T)"
          >
            <IoGridSharp size={18} />
          </button>
        </div>

        <div className="flex space-x-1 mr-3 relative">
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={() => setShowBulkMenu(!showBulkMenu)}
            title="選択範囲の一括処理"
          >
            <span className="font-bold text-sm">¶¶</span>
          </button>
          
          {showBulkMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50 w-56">
              <div className="p-1">
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => {
                    bulkUnorderedList();
                    setShowBulkMenu(false);
                  }}
                  title="選択範囲を箇条書きに変換 (Ctrl+Shift+U)"
                >
                  <IoListOutline size={16} className="mr-2" />
                  <span>箇条書き</span>
                </button>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => {
                    bulkOrderedList();
                    setShowBulkMenu(false);
                  }}
                  title="選択範囲を番号付きリストに変換 (Ctrl+Shift+O)"
                >
                  <IoList size={16} className="mr-2" />
                  <span>番号付きリスト</span>
                </button>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => {
                    bulkTaskList(false);
                    setShowBulkMenu(false);
                  }}
                  title="選択範囲をタスクリストに変換 (Ctrl+Shift+T)"
                >
                  <IoCheckbox size={16} className="mr-2" />
                  <span>タスクリスト</span>
                </button>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => {
                    bulkTaskList(true);
                    setShowBulkMenu(false);
                  }}
                  title="選択範囲を完了タスクリストに変換 (Ctrl+Shift+X)"
                >
                  <IoCheckmarkDoneSharp size={16} className="mr-2" />
                  <span>完了タスクリスト</span>
                </button>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => {
                    bulkBlockquote();
                    setShowBulkMenu(false);
                  }}
                  title="選択範囲を引用に変換 (Ctrl+Shift+Q)"
                >
                  <IoAlbumsOutline size={16} className="mr-2" />
                  <span>引用</span>
                </button>
                <div className="border-t border-gray-300 dark:border-gray-600 my-1"></div>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => {
                    toggleComment();
                    setShowBulkMenu(false);
                  }}
                  title="コメントの切り替え (Ctrl+/)"
                >
                  <IoRemoveOutline size={16} className="mr-2" />
                  <span>コメント切替</span>
                </button>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => {
                    indentSelection();
                    setShowBulkMenu(false);
                  }}
                  title="インデント追加 (Tab)"
                >
                  <IoChevronForward size={16} className="mr-2" />
                  <span>インデント</span>
                </button>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => {
                    outdentSelection();
                    setShowBulkMenu(false);
                  }}
                  title="インデント削除 (Shift+Tab)"
                >
                  <IoChevronBack size={16} className="mr-2" />
                  <span>アウトデント</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex space-x-1">
          <button
            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip ${
              editorSettings.lineWrapping ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            onClick={() => updateEditorSettings({ lineWrapping: !editorSettings.lineWrapping })}
            title={editorSettings.lineWrapping ? "折り返しをOFF" : "折り返しをON"}
          >
            {editorSettings.lineWrapping ? <IoResize size={18} /> : <IoResizeOutline size={18} />}
          </button>
          <button
            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip ${
              editorSettings.rectangularSelection ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            onClick={() => updateEditorSettings({ rectangularSelection: !editorSettings.rectangularSelection })}
            title={editorSettings.rectangularSelection ? "矩形選択をOFF" : "矩形選択をON"}
          >
            {editorSettings.rectangularSelection ? <IoMove size={18} /> : <IoCropOutline size={18} />}
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={() => setShowHelpDialog(true)}
            title="マークダウンヘルプ"
          >
            <IoHelpCircleOutline size={18} />
          </button>
        </div>
      </div>

      {showHelpDialog && (
        <MarkdownHelpDialog onClose={() => setShowHelpDialog(false)} />
      )}
      
      {showTableWizard && (
        <TableWizard 
          onInsertTable={handleInsertTable}
          onClose={() => setShowTableWizard(false)}
        />
      )}
    </>
  );
};

export default MarkdownEditorExtension;
