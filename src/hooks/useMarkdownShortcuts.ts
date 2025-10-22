'use client';

import { useCallback, useEffect, RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { useEditorStore } from '@/store/editorStore';
import type { EditorRefValue } from '@/types/editor';

const useMarkdownShortcuts = (editorRef: RefObject<EditorView | null>, tabId: string) => {
  const { tabs, updateTab } = useEditorStore();
  
  const insertMarkdown = useCallback((prefix: string, suffix: string, placeholder: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const selection = editor.state.sliceDoc(
      editor.state.selection.main.from,
      editor.state.selection.main.to
    );
    
    const text = selection || placeholder;
    const from = editor.state.selection.main.from;
    const to = editor.state.selection.main.to;
    
    editor.dispatch({
      changes: { from, to, insert: prefix + text + suffix }
    });
    
    // カーソル位置を調整（選択がなかった場合）
    if (!selection) {
      const newPos = from + prefix.length + placeholder.length;
      editor.dispatch({
        selection: { anchor: newPos }
      });
    }
    
    editor.focus();
    
    // タブの内容を更新
    const currentTab = tabs.get(tabId);
    if (currentTab) {
      const newContent = editor.state.doc.toString();
      updateTab(tabId, { content: newContent });
    }
  }, [editorRef, tabId, tabs, updateTab]);
  
  // 選択範囲の各行に対する一括処理
  const processSelectedLines = useCallback((
    processFunc: (line: string, lineIndex: number) => string,
    defaultText: string = ''
  ) => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const { from, to } = editor.state.selection.main;
    const doc = editor.state.doc;
    
    // 選択範囲のテキストを取得
    const selection = editor.state.sliceDoc(from, to);
    
    if (selection) {
      // 選択範囲がある場合、各行に処理を適用
      const lines = selection.split('\n');
      const processedLines = lines.map((line: string, index: number) => processFunc(line, index));
      
      // 処理結果をエディタに反映
      editor.dispatch({
        changes: { from, to, insert: processedLines.join('\n') }
      });
    } else {
      // 選択範囲がない場合、現在行にデフォルトテキストを挿入
      const line = doc.lineAt(from);
      editor.dispatch({
        changes: { from: line.from, to: line.from, insert: defaultText }
      });
    }
    
    editor.focus();
    
    // タブの内容を更新
    const currentTab = tabs.get(tabId);
    if (currentTab) {
      const newContent = editor.state.doc.toString();
      updateTab(tabId, { content: newContent });
    }
  }, [editorRef, tabId, tabs, updateTab]);
  
  // 選択範囲の各行に箇条書きを適用
  const bulkUnorderedList = useCallback(() => {
    processSelectedLines(line => {
      // すでに箇条書きになっている場合は変換しない
      if (line.trim().match(/^[-*+]\s/)) return line;
      // 番号付きリストになっている場合は箇条書きに変換
      if (line.trim().match(/^\d+\.\s/)) return line.replace(/^\d+\.\s/, '- ');
      // 空行は無視
      if (!line.trim()) return line;
      // それ以外は箇条書きに変換
      return `- ${line}`;
    });
  }, [processSelectedLines]);
  
  // 選択範囲の各行に番号付きリストを適用
  const bulkOrderedList = useCallback(() => {
    processSelectedLines((line, index) => {
      // すでに番号付きリストになっている場合は変換しない（ただし番号は連番に修正）
      if (line.trim().match(/^\d+\.\s/)) return line.replace(/^\d+\./, `${index + 1}.`);
      // 箇条書きになっている場合は番号付きリストに変換
      if (line.trim().match(/^[-*+]\s/)) return line.replace(/^[-*+]\s/, `${index + 1}. `);
      // 空行は無視
      if (!line.trim()) return line;
      // それ以外は番号付きリストに変換
      return `${index + 1}. ${line}`;
    });
  }, [processSelectedLines]);
  
  // 選択範囲の各行にタスクリストを適用
  const bulkTaskList = useCallback((checked: boolean = false) => {
    processSelectedLines(line => {
      // すでにタスクリストになっている場合はチェック状態を変更
      if (line.trim().match(/^[-*+]\s\[[ x]\]\s/)) {
        return line.replace(/^([-*+]\s\[)[ x](\]\s)/, `$1${checked ? 'x' : ' '}$2`);
      }
      // 箇条書きやリストになっている場合はタスクリストに変換
      if (line.trim().match(/^[-*+]\s/)) {
        return line.replace(/^([-*+]\s)/, `$1[${checked ? 'x' : ' '}] `);
      }
      if (line.trim().match(/^\d+\.\s/)) {
        return line.replace(/^\d+\.\s/, `- [${checked ? 'x' : ' '}] `);
      }
      // 空行は無視
      if (!line.trim()) return line;
      // それ以外はタスクリストに変換
      return `- [${checked ? 'x' : ' '}] ${line}`;
    });
  }, [processSelectedLines]);
  
  // 選択範囲の各行に引用を適用
  const bulkBlockquote = useCallback(() => {
    processSelectedLines(line => {
      // すでに引用になっている場合はそのまま
      if (line.trim().startsWith('>')) return line;
      // 空行でも > を付ける（引用ブロックの連続性のため）
      return `> ${line}`;
    });
  }, [processSelectedLines]);
  
  // 選択範囲の各行をコメントアウト/コメント解除
  const toggleComment = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const { from, to } = editor.state.selection.main;
    const selection = editor.state.sliceDoc(from, to);
    
    if (!selection) return;
    
    // 選択されたすべての行がコメントアウトされているかチェック
    const lines = selection.split('\n');
    const allCommented = lines.every(line => line.trim().startsWith('<!--') && line.trim().endsWith('-->'));
    
    // コメントの追加または削除
    if (allCommented) {
      // コメント解除
      const uncommentedLines = lines.map(line => 
        line.replace(/^\s*<!--\s*(.*?)\s*-->\s*$/, '$1')
      );
      editor.dispatch({
        changes: { from, to, insert: uncommentedLines.join('\n') }
      });
    } else {
      // コメント追加
      const commentedLines = lines.map(line => 
        line.trim() ? `<!-- ${line} -->` : line
      );
      editor.dispatch({
        changes: { from, to, insert: commentedLines.join('\n') }
      });
    }
    
    editor.focus();
    
    // タブの内容を更新
    const currentTab = tabs.get(tabId);
    if (currentTab) {
      const newContent = editor.state.doc.toString();
      updateTab(tabId, { content: newContent });
    }
  }, [editorRef, tabId, tabs, updateTab]);
  
  // 選択範囲をインデント
  const indentSelection = useCallback(() => {
    processSelectedLines(line => {
      return `  ${line}`;
    });
  }, [processSelectedLines]);
  
  // 選択範囲のインデント解除
  const outdentSelection = useCallback(() => {
    processSelectedLines(line => {
      return line.replace(/^(\s{1,2})/, '');
    });
  }, [processSelectedLines]);
  
  // 見出しの挿入
  const insertHeading = useCallback((level: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const { from, to } = editor.state.selection.main;
    const lineFrom = editor.state.doc.lineAt(from);
    
    // 行頭の#を削除
    const lineText = editor.state.sliceDoc(lineFrom.from, lineFrom.to);
    const cleanLine = lineText.replace(/^#+\s*/, '');
    
    // 新しい見出しレベルのプレフィックスを作成
    const prefix = '#'.repeat(level) + ' ';
    
    // 行を置換
    editor.dispatch({
      changes: { from: lineFrom.from, to: lineFrom.to, insert: prefix + cleanLine }
    });
    
    editor.focus();
    
    // タブの内容を更新
    const currentTab = tabs.get(tabId);
    if (currentTab) {
      const newContent = editor.state.doc.toString();
      updateTab(tabId, { content: newContent });
    }
  }, [editorRef, tabId, tabs, updateTab]);
  
  // 太字の挿入
  const insertBold = useCallback(() => {
    insertMarkdown('**', '**', '太字');
  }, [insertMarkdown]);

  // 斜体の挿入
  const insertItalic = useCallback(() => {
    insertMarkdown('*', '*', '斜体');
  }, [insertMarkdown]);

  // 下線の挿入
  const insertUnderline = useCallback(() => {
    insertMarkdown('<u>', '</u>', '下線');
  }, [insertMarkdown]);

  // 打ち消し線の挿入
  const insertStrikethrough = useCallback(() => {
    insertMarkdown('~~', '~~', '打ち消し');
  }, [insertMarkdown]);

  // ハイライトの挿入
  const insertHighlight = useCallback(() => {
    insertMarkdown('==', '==', 'ハイライト');
  }, [insertMarkdown]);

  // インラインコードの挿入
  const insertInlineCode = useCallback(() => {
    insertMarkdown('`', '`', 'インラインコード');
  }, [insertMarkdown]);

  // チェックボックスの挿入
  const insertTaskListItem = useCallback(() => {
    insertMarkdown('- [ ] ', '', 'タスク項目');
  }, [insertMarkdown]);

  // リンクの挿入
  const insertLink = useCallback(() => {
    insertMarkdown('[', '](URL)', 'リンクテキスト');
  }, [insertMarkdown]);
  
  // 引用の挿入
  const insertBlockquote = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const { from, to } = editor.state.selection.main;
    const selection = editor.state.sliceDoc(from, to);
    
    if (selection) {
      // 選択範囲がある場合は、各行の先頭に > を追加
      const lines = selection.split('\n');
      const quotedLines = lines.map(line => `> ${line}`);
      editor.dispatch({
        changes: { from, to, insert: quotedLines.join('\n') }
      });
    } else {
      // 選択範囲がない場合は、現在行の先頭に > を追加
      insertMarkdown('> ', '', '引用テキスト');
    }
    
    // タブの内容を更新
    const currentTab = tabs.get(tabId);
    if (currentTab && editor) {
      const newContent = editor.state.doc.toString();
      updateTab(tabId, { content: newContent });
    }
  }, [editorRef, insertMarkdown, tabId, tabs, updateTab]);
  
  // 箇条書きの挿入
  const insertUnorderedList = useCallback(() => {
    insertMarkdown('- ', '', 'リスト項目');
  }, [insertMarkdown]);
  
  // 番号付きリストの挿入
  const insertOrderedList = useCallback(() => {
    insertMarkdown('1. ', '', 'リスト項目');
  }, [insertMarkdown]);
  
  // コードブロックの挿入
  const insertCodeBlock = useCallback(() => {
    insertMarkdown('```\n', '\n```', 'コードをここに記述');
  }, [insertMarkdown]);
  
  // テーブルの挿入
  const insertTable = useCallback((rows: number, cols: number, alignments: string[]) => {
    const editor = editorRef.current;
    if (!editor) return;
    
    // ヘッダー行を作成
    const headerRow = '| ' + Array(cols).fill('ヘッダー').join(' | ') + ' |';
    
    // 区切り行を作成（列の配置を反映）
    const separatorRow = '| ' + alignments.map(align => {
      switch(align) {
        case 'left': return ':---';
        case 'center': return ':---:';
        case 'right': return '---:';
        default: return '---';
      }
    }).join(' | ') + ' |';
    
    // データ行を作成
    const dataRows = Array(rows - 1).fill(0).map(() => 
      '| ' + Array(cols).fill('データ').join(' | ') + ' |'
    );
    
    // 全てを結合
    const tableContent = [
      headerRow,
      separatorRow,
      ...dataRows
    ].join('\n');
    
    // カーソル位置に挿入
    const { from, to } = editor.state.selection.main;
    editor.dispatch({
      changes: { from, to, insert: tableContent }
    });
    
    editor.focus();
    
    // タブの内容を更新
    const currentTab = tabs.get(tabId);
    if (currentTab) {
      const newContent = editor.state.doc.toString();
      updateTab(tabId, { content: newContent });
    }
  }, [editorRef, tabId, tabs, updateTab]);
  
  // テーブルの整形
  const formatTable = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const { from, to } = editor.state.selection.main;
    const doc = editor.state.doc;
    
    // 選択範囲内のテキストを取得
    let selectedText = editor.state.sliceDoc(from, to);
    
    // 選択範囲がない場合、カーソル位置のテーブルを見つける
    if (!selectedText.trim()) {
      // カーソル位置の行番号
      const cursorLine = doc.lineAt(from).number;
      
      // テーブルの開始行と終了行を見つける
      let startLine = cursorLine;
      let endLine = cursorLine;
      
      // テーブルの開始行を見つける
      while (startLine > 1) {
        const lineText = doc.line(startLine - 1).text;
        if (!lineText.trim().startsWith('|')) break;
        startLine--;
      }
      
      // テーブルの終了行を見つける
      while (endLine < doc.lines) {
        const lineText = doc.line(endLine + 1).text;
        if (!lineText.trim().startsWith('|')) break;
        endLine++;
      }
      
      // テーブル範囲のテキストを取得
      const startPos = doc.line(startLine).from;
      const endPos = doc.line(endLine).to;
      selectedText = editor.state.sliceDoc(startPos, endPos);
      
      // 選択範囲を更新
      const tableFrom = startPos;
      const tableTo = endPos;
      
      // テーブルが見つからなかった場合は終了
      if (!selectedText.includes('|')) return;
      
      // テーブルを整形
      const formattedTable = formatMarkdownTable(selectedText);
      
      // 整形したテーブルを挿入
      editor.dispatch({
        changes: { from: tableFrom, to: tableTo, insert: formattedTable }
      });
      
      // タブの内容を更新
      const currentTab = tabs.get(tabId);
      if (currentTab) {
        const newContent = editor.state.doc.toString();
        updateTab(tabId, { content: newContent });
      }
    } else {
      // 選択範囲がある場合、その範囲のテキストを整形
      if (selectedText.includes('|')) {
        const formattedTable = formatMarkdownTable(selectedText);
        
        editor.dispatch({
          changes: { from, to, insert: formattedTable }
        });
        
        // タブの内容を更新
        const currentTab = tabs.get(tabId);
        if (currentTab) {
          const newContent = editor.state.doc.toString();
          updateTab(tabId, { content: newContent });
        }
      }
    }
  }, [editorRef, tabId, tabs, updateTab]);
  
  // マークダウンテーブルを整形する関数
  const formatMarkdownTable = (tableText: string) => {
    // テーブルの行を分割
    const lines = tableText.split('\n').filter(line => line.trim().startsWith('|'));
    if (lines.length < 2) return tableText; // ヘッダーと区切り線がない場合は整形しない
    
    // 各セルの内容を取得
    const rows = lines.map(line => {
      // 先頭と末尾の | を削除し、| で分割
      return line.trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map(cell => cell.trim());
    });
    
    // 各列の最大幅を計算
    const colWidths = Array(rows[0].length).fill(0);
    rows.forEach(row => {
      row.forEach((cell, i) => {
        if (i < colWidths.length) {
          colWidths[i] = Math.max(colWidths[i], cell.length);
        }
      });
    });
    
    // 整形された行を作成
    const formattedRows = rows.map((row, rowIndex) => {
      // 区切り行（2行目）の場合
      if (rowIndex === 1) {
        return '| ' + row.map((cell, i) => {
          // 左揃え、中央揃え、右揃えを判定
          const isLeft = cell.startsWith(':');
          const isRight = cell.endsWith(':');
          
          if (isLeft && isRight) {
            // 中央揃え
            return ':' + '-'.repeat(Math.max(colWidths[i] - 2, 1)) + ':';
          } else if (isLeft) {
            // 左揃え
            return ':' + '-'.repeat(Math.max(colWidths[i] - 1, 1));
          } else if (isRight) {
            // 右揃え
            return '-'.repeat(Math.max(colWidths[i] - 1, 1)) + ':';
          } else {
            // デフォルト（左揃え）
            return '-'.repeat(Math.max(colWidths[i], 3));
          }
        }).join(' | ') + ' |';
      }
      
      // 通常の行
      return '| ' + row.map((cell, i) => {
        return cell + ' '.repeat(Math.max(0, colWidths[i] - cell.length));
      }).join(' | ') + ' |';
    });
    
    return formattedRows.join('\n');
  };
  
  // キーボードショートカットの処理
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // エディタがアクティブでない場合は処理しない
    if (!document.activeElement || !editorRef.current) return;
    
    // Cmd/Ctrl + B: 太字
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      insertBold();
    }
    
    // Cmd/Ctrl + I: 斜体
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      insertItalic();
    }
    
    // Cmd/Ctrl + K: リンク
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      insertLink();
    }
    
    // Cmd/Ctrl + 1-3: 見出し
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      const level = parseInt(e.key);
      insertHeading(level);
    }
    
    // Cmd/Ctrl + Q: 引用
    if ((e.metaKey || e.ctrlKey) && e.key === 'q') {
      e.preventDefault();
      insertBlockquote();
    }
    
    // Cmd/Ctrl + U: 箇条書き
    if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
      e.preventDefault();
      insertUnorderedList();
    }
    
    // Cmd/Ctrl + O: 番号付きリスト
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault();
      insertOrderedList();
    }
    
    // Cmd/Ctrl + Shift + C: コードブロック
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
      e.preventDefault();
      insertCodeBlock();
    }
    
    // Alt + T: テーブル整形
    if (e.altKey && e.key === 't') {
      e.preventDefault();
      formatTable();
    }
    
    // Cmd/Ctrl + Shift + U: 一括箇条書き
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'u') {
      e.preventDefault();
      bulkUnorderedList();
    }
    
    // Cmd/Ctrl + Shift + O: 一括番号付きリスト
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'o') {
      e.preventDefault();
      bulkOrderedList();
    }
    
    // Cmd/Ctrl + Shift + T: タスクリスト
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 't') {
      e.preventDefault();
      bulkTaskList(false);
    }
    
    // Cmd/Ctrl + Shift + X: 完了タスクリスト
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'x') {
      e.preventDefault();
      bulkTaskList(true);
    }
    
    // Cmd/Ctrl + Shift + Q: 一括引用
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'q') {
      e.preventDefault();
      bulkBlockquote();
    }
    
    // Cmd/Ctrl + /: コメントトグル
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      toggleComment();
    }
    
    // Tab: インデント（選択範囲がある場合）
    if (e.key === 'Tab' && !e.shiftKey) {
      const editor = editorRef.current;
      if (editor && editor.state.selection.main.from !== editor.state.selection.main.to) {
        e.preventDefault();
        indentSelection();
      }
    }
    
    // Shift + Tab: アウトデント（選択範囲がある場合）
    if (e.key === 'Tab' && e.shiftKey) {
      const editor = editorRef.current;
      if (editor && editor.state.selection.main.from !== editor.state.selection.main.to) {
        e.preventDefault();
        outdentSelection();
      }
    }
  }, [
    editorRef, 
    insertBold, 
    insertItalic, 
    insertLink, 
    insertHeading, 
    insertBlockquote, 
    insertUnorderedList, 
    insertOrderedList, 
    insertCodeBlock,
    formatTable,
    bulkUnorderedList,
    bulkOrderedList,
    bulkTaskList,
    bulkBlockquote,
    toggleComment,
    indentSelection,
    outdentSelection
  ]);

  useEffect(() => {
    // グローバルなキーイベントリスナーを設定
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return { 
    insertMarkdown,
    insertHeading,
    insertBold,
    insertItalic,
    insertUnderline,
    insertStrikethrough,
    insertHighlight,
    insertInlineCode,
    insertTaskListItem,
    insertLink,
    insertBlockquote,
    insertUnorderedList,
    insertOrderedList,
    insertCodeBlock,
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
  };
};

export default useMarkdownShortcuts;
