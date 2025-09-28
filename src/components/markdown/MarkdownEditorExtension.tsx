
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

import React, { useEffect, useState } from 'react';
import type { EditorView } from '@codemirror/view';
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
import { readDirectoryContents } from '@/lib/fileSystemUtils';
import type { TabData } from '@/types';

type TableAlignment = 'left' | 'center' | 'right' | null;

const sanitizeMarkdownCell = (value: string) => {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
};

const alignmentToMarkdown = (alignment: TableAlignment) => {
  switch (alignment) {
    case 'left':
      return ':---';
    case 'center':
      return ':---:';
    case 'right':
      return '---:';
    default:
      return '---';
  }
};

const getAlignmentFromCell = (cell: Element): TableAlignment => {
  const alignAttr = cell.getAttribute('align');
  if (alignAttr) {
    const lower = alignAttr.toLowerCase();
    if (lower === 'left' || lower === 'center' || lower === 'right') {
      return lower;
    }
  }

  const styleAttr = cell.getAttribute('style');
  if (styleAttr) {
    if (/text-align\s*:\s*center/i.test(styleAttr)) return 'center';
    if (/text-align\s*:\s*right/i.test(styleAttr)) return 'right';
    if (/text-align\s*:\s*left/i.test(styleAttr)) return 'left';
  }

  return null;
};

const convertHtmlTableToMarkdown = (html: string): string | null => {
  if (!html || !/<table/i.test(html)) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;

  const rows: string[][] = [];
  const alignments: TableAlignment[] = [];

  const rowElements = Array.from(table.querySelectorAll('tr'));
  rowElements.forEach(row => {
    const cellElements = Array.from(row.querySelectorAll('th,td'));
    if (cellElements.length === 0) return;

    const values = cellElements.map((cell, index) => {
      const alignment = getAlignmentFromCell(cell);
      if (alignment && !alignments[index]) {
        alignments[index] = alignment;
      }
      const text = 'innerText' in cell
        ? (cell as HTMLElement).innerText
        : cell.textContent || '';
      return sanitizeMarkdownCell(text);
    });

    const isNonEmpty = values.some(value => value.length > 0);
    if (isNonEmpty) {
      rows.push(values);
    }
  });

  if (rows.length === 0) return null;

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) return null;

  const normalizedRows = rows.map(row => {
    if (row.length === columnCount) return row;
    const filled = [...row];
    while (filled.length < columnCount) {
      filled.push('');
    }
    return filled;
  });

  if (columnCount < 2 && normalizedRows.length < 2) {
    return null;
  }

  while (alignments.length < columnCount) {
    alignments.push(null);
  }

  const header = normalizedRows[0];
  const headerLine = `| ${header.map(value => (value.length > 0 ? value : ' ')).join(' | ')} |`;
  const separatorLine = `| ${alignments.map(alignmentToMarkdown).join(' | ')} |`;
  const bodyLines = normalizedRows.slice(1).map(row => `| ${row.map(value => (value.length > 0 ? value : ' ')).join(' | ')} |`);

  return [headerLine, separatorLine, ...bodyLines].join('\n');
};

const convertPlainTextTableToMarkdown = (text: string): string | null => {
  if (!text) return null;

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.includes('\t')) return null;

  const lines = normalized.split('\n').map(line => line.trimEnd());
  const rows = lines
    .map(line => line.split('\t').map(cell => sanitizeMarkdownCell(cell)))
    .filter(row => row.some(cell => cell.length > 0));

  if (rows.length === 0) return null;

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) return null;

  const normalizedRows = rows.map(row => {
    if (row.length === columnCount) return row;
    const filled = [...row];
    while (filled.length < columnCount) {
      filled.push('');
    }
    return filled;
  });

  if (columnCount < 2 && normalizedRows.length < 2) {
    return null;
  }

  const header = normalizedRows[0];
  const headerLine = `| ${header.map(value => (value.length > 0 ? value : ' ')).join(' | ')} |`;
  const separatorLine = `| ${new Array(columnCount).fill('---').join(' | ')} |`;
  const bodyLines = normalizedRows.slice(1).map(row => `| ${row.map(value => (value.length > 0 ? value : ' ')).join(' | ')} |`);

  return [headerLine, separatorLine, ...bodyLines].join('\n');
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};

const sanitizeBaseName = (baseName: string) => {
  const trimmed = baseName.replace(/\.[^/.]+$/, '');
  const sanitized = trimmed.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'pasted-image';
};

const resolveWorkingDirectory = async (
  tab: TabData,
  rootDirHandle: FileSystemDirectoryHandle | null
): Promise<FileSystemDirectoryHandle | null> => {
  if (!rootDirHandle) return null;
  if (!tab.id || tab.id.startsWith('temp_')) return null;

  const normalizedPath = tab.id.replace(/\\/g, '/');
  const segments = normalizedPath.split('/').filter(Boolean);

  let directoryHandle: FileSystemDirectoryHandle = rootDirHandle;
  try {
    for (let index = 0; index < Math.max(segments.length - 1, 0); index += 1) {
      directoryHandle = await directoryHandle.getDirectoryHandle(segments[index]);
    }
    return directoryHandle;
  } catch (error) {
    console.error('Failed to resolve directory for pasted image:', error);
    return null;
  }
};

const ensureUniqueFileName = async (
  directoryHandle: FileSystemDirectoryHandle,
  baseName: string,
  extension: string
) => {
  const timestamp = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');
  const dateStamp = `${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(timestamp.getDate())}-${pad(timestamp.getHours())}${pad(timestamp.getMinutes())}${pad(timestamp.getSeconds())}`;
  const normalizedBase = sanitizeBaseName(baseName);

  let candidate = `${normalizedBase}-${dateStamp}.${extension}`;
  let counter = 1;

  const fileExists = async (name: string) => {
    try {
      await directoryHandle.getFileHandle(name);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return false;
      }
      throw error;
    }
  };

  while (await fileExists(candidate)) {
    candidate = `${normalizedBase}-${dateStamp}-${counter}.${extension}`;
    counter += 1;
  }

  return candidate;
};

const getImageExtension = (file: File) => {
  const name = file.name || '';
  const existingExt = name.includes('.') ? name.split('.').pop() : '';
  if (existingExt) {
    return existingExt.toLowerCase();
  }
  const mimeExt = MIME_EXTENSION_MAP[file.type];
  return mimeExt || 'png';
};

const buildImageMarkdown = (fileName: string, altText: string) => {
  const encoded = encodeURI(fileName);
  const alt = altText || 'image';
  return `![${alt}](./${encoded})`;
};

interface MarkdownEditorExtensionProps {
  tabId: string;
  editorRef: React.RefObject<EditorView | null>;
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

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const attachPasteHandler = () => {
      if (disposed) return;
      const editor = editorRef.current;
      if (!editor) {
        requestAnimationFrame(attachPasteHandler);
        return;
      }

      const handlePaste = async (event: ClipboardEvent) => {
        if (!event.clipboardData) return;

        const htmlData = event.clipboardData.getData('text/html');
        const plainText = event.clipboardData.getData('text/plain');
        const files = Array.from(event.clipboardData.files || []);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        const nonImageFiles = files.filter(file => !file.type.startsWith('image/'));

        const editorState = useEditorStore.getState();
        const targetTab = editorState.tabs.get(tabId);

        const insertMarkdown = (markdown: string) => {
          const activeEditor = editorRef.current;
          if (!activeEditor || !targetTab) return;

          const { from, to } = activeEditor.state.selection.main;
          activeEditor.dispatch({ changes: { from, to, insert: markdown } });
          const newContent = activeEditor.state.doc.toString();
          editorState.updateTab(tabId, {
            content: newContent,
            isDirty: newContent !== targetTab.originalContent,
          });
          activeEditor.focus();
        };

        if (htmlData) {
          const markdownTable = convertHtmlTableToMarkdown(htmlData);
          if (markdownTable) {
            event.preventDefault();
            insertMarkdown(markdownTable);
            return;
          }
        }

        if (plainText) {
          const markdownTable = convertPlainTextTableToMarkdown(plainText);
          if (markdownTable) {
            event.preventDefault();
            insertMarkdown(markdownTable);
            return;
          }
        }

        if (imageFiles.length > 0) {
          event.preventDefault();

          if (!targetTab) {
            alert('画像を貼り付けできません。編集中のタブ情報を取得できませんでした。');
            return;
          }

          const { rootDirHandle, setRootFileTree } = editorState;
          if (!rootDirHandle) {
            alert('画像を貼り付けるには、エクスプローラでフォルダを開いてください。');
            return;
          }

          const workingDirectory = await resolveWorkingDirectory(targetTab, rootDirHandle);
          if (!workingDirectory) {
            alert('画像の保存先を特定できませんでした。保存済みのファイルを開いてから貼り付けてください。');
            return;
          }

          const markdownLines: string[] = [];

          for (const imageFile of imageFiles) {
            const extension = getImageExtension(imageFile);
            let baseName = imageFile.name || targetTab.name || 'pasted-image';
            if (!baseName.trim()) {
              baseName = 'pasted-image';
            }

            let fileName: string;
            try {
              fileName = await ensureUniqueFileName(workingDirectory, baseName, extension);
            } catch (error) {
              console.error('Failed to determine filename for pasted image:', error);
              alert('画像ファイル名の生成に失敗しました。');
              return;
            }

            try {
              const fileHandle = await workingDirectory.getFileHandle(fileName, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(imageFile);
              await writable.close();
              markdownLines.push(buildImageMarkdown(fileName, sanitizeBaseName(baseName)));
            } catch (error) {
              console.error('Failed to save pasted image:', error);
              alert('画像の保存に失敗しました。');
              return;
            }
          }

          if (markdownLines.length > 0) {
            insertMarkdown(markdownLines.join('\n'));

            if (editorState.rootDirHandle && setRootFileTree) {
              try {
                const updatedTree = await readDirectoryContents(editorState.rootDirHandle);
                setRootFileTree(updatedTree);
              } catch (error) {
                console.error('Failed to refresh file tree after image paste:', error);
              }
            }
          }
          return;
        }

        if (nonImageFiles.length > 0) {
          // 他のコンポーネント側で処理できるように残す
          return;
        }
      };

      editor.contentDOM.addEventListener('paste', handlePaste);
      cleanup = () => {
        editor.contentDOM.removeEventListener('paste', handlePaste);
      };
    };

    attachPasteHandler();

    return () => {
      disposed = true;
      if (cleanup) {
        cleanup();
      }
    };
  }, [editorRef, tabId]);
  
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
