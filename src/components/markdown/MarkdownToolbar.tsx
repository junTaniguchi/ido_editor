'use client';
/**
 * MarkdownToolbar.tsx
 * マークダウン記法の入力補助ツールバーReactコンポーネント。
 * 主な機能:
 * - 見出し・テキストスタイル・リスト・リンク・画像・引用・コード・表などの挿入
 * - エディタへのマークダウン構文挿入
 * - マークダウンヘルプダイアログ表示
 * - ダークモード対応
 */

import React, { useState } from 'react';
import {
  IoText, IoTextOutline, IoList, IoListOutline, IoLink, IoImage,
  IoCodeOutline, IoChatbox, IoCheckbox,
  IoRemove, IoDocumentText, IoHelpCircleOutline
} from 'react-icons/io5';
import { TbTable, TbQuote } from 'react-icons/tb';
import MarkdownHelpDialog from './MarkdownHelpDialog';
import type { EditorRefValue } from '@/types/editor';

interface MarkdownToolbarProps {
  editorRef: React.RefObject<EditorRefValue | null>;
  onOpenTableWizard: () => void;
}

const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({ editorRef, onOpenTableWizard }) => {
  const [showHelpDialog, setShowHelpDialog] = useState(false);

  const insertMarkdown = (prefix: string, suffix: string, placeholder: string) => {
    const editor = editorRef.current?.view;
    if (!editor) return;

    const { state } = editor;
    const { from, to } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);
    const text = selectedText || placeholder;
    const insertText = `${prefix}${text}${suffix}`;

    editor.dispatch({
      changes: { from, to, insert: insertText },
      selection: {
        anchor: from + prefix.length,
        head: from + prefix.length + text.length,
      },
      scrollIntoView: true,
    });

    editor.focus();
  };
  
  return (
    <div className="p-2 flex flex-wrap gap-1 border-b border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* 見出し */}
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('# ', '', '見出し1')}
        title="見出し1"
      >
        <span className="text-sm font-bold">H1</span>
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('## ', '', '見出し2')}
        title="見出し2"
      >
        <span className="text-sm font-bold">H2</span>
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('### ', '', '見出し3')}
        title="見出し3"
      >
        <span className="text-sm font-bold">H3</span>
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('#### ', '', '見出し4')}
        title="見出し4"
      >
        <span className="text-sm font-bold">H4</span>
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('##### ', '', '見出し5')}
        title="見出し5"
      >
        <span className="text-sm font-bold">H5</span>
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('###### ', '', '見出し6')}
        title="見出し6"
      >
        <span className="text-sm font-bold">H6</span>
      </button>
      
      <div className="border-l border-gray-300 dark:border-gray-700 mx-1"></div>
      
      {/* テキストスタイル */}
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('**', '**', '太字')}
        title="太字"
      >
        <IoText size={18} />
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('*', '*', '斜体')}
        title="斜体"
      >
        <IoTextOutline size={18} />
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('~~', '~~', '取り消し線')}
        title="取り消し線"
      >
        <IoRemove size={18} />
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('`', '`', 'インラインコード')}
        title="インラインコード"
      >
        <IoCodeOutline size={18} />
      </button>
      
      <div className="border-l border-gray-300 dark:border-gray-700 mx-1"></div>
      
      {/* リスト */}
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('- ', '', 'リスト項目')}
        title="箇条書きリスト"
      >
        <IoList size={18} />
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('1. ', '', 'リスト項目')}
        title="番号付きリスト"
      >
        <IoListOutline size={18} />
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('- [ ] ', '', 'タスク')}
        title="タスクリスト"
      >
        <IoCheckbox size={18} />
      </button>
      
      <div className="border-l border-gray-300 dark:border-gray-700 mx-1"></div>
      
      {/* リンクと画像 */}
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('[', '](URL)', 'リンクテキスト')}
        title="リンク"
      >
        <IoLink size={18} />
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('![', '](URL)', '画像の説明')}
        title="画像"
      >
        <IoImage size={18} />
      </button>
      
      <div className="border-l border-gray-300 dark:border-gray-700 mx-1"></div>
      
      {/* ブロック要素 */}
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('> ', '', '引用テキスト')}
        title="引用"
      >
        <TbQuote size={18} />
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('>> ', '', 'ネストされた引用')}
        title="ネストされた引用"
      >
        <div className="flex items-center justify-center" style={{fontSize: '10px'}}>
          <TbQuote size={14} />
          <TbQuote size={10} className="ml-[-5px]" />
        </div>
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('```\n', '\n```', 'コードブロック')}
        title="コードブロック"
      >
        <IoCodeOutline size={18} />
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('```javascript\n', '\n```', 'JavaScriptコード')}
        title="JavaScriptコードブロック"
      >
        <div className="text-xs font-mono">JS</div>
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('```typescript\n', '\n```', 'TypeScriptコード')}
        title="TypeScriptコードブロック"
      >
        <div className="text-xs font-mono">TS</div>
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('```python\n', '\n```', 'Pythonコード')}
        title="Pythonコードブロック"
      >
        <div className="text-xs font-mono">PY</div>
      </button>
      
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={onOpenTableWizard}
        title="表の挿入"
      >
        <TbTable size={18} />
      </button>
      
      <div className="border-l border-gray-300 dark:border-gray-700 mx-1"></div>
      
      {/* 区切り線 */}
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => insertMarkdown('\n---\n', '', '')}
        title="区切り線"
      >
        <span className="text-sm">—</span>
      </button>
      
      <div className="border-l border-gray-300 dark:border-gray-700 mx-1"></div>
      
      {/* ヘルプ */}
      <button 
        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
        onClick={() => setShowHelpDialog(true)}
        title="マークダウンヘルプ"
      >
        <IoHelpCircleOutline size={18} />
      </button>
      
      {showHelpDialog && (
        <MarkdownHelpDialog onClose={() => setShowHelpDialog(false)} />
      )}
    </div>
  );
};

export default MarkdownToolbar;
