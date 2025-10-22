
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

import React, { useCallback, useEffect, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { useEditorStore } from '@/store/editorStore';
import {
  IoText, IoList, IoListOutline, IoLink, IoCode, IoAlbumsOutline,
  IoHelpCircleOutline, IoGridOutline, IoGridSharp, IoCheckbox,
  IoCheckmarkDoneSharp, IoChevronForward, IoChevronBack, IoRemoveOutline,
  IoResize, IoResizeOutline, IoMove, IoCropOutline, IoSparkles,
  IoLanguage, IoCreateOutline, IoArrowUndo, IoArrowRedo, IoClose
} from 'react-icons/io5';
import useMarkdownShortcuts from '@/hooks/useMarkdownShortcuts';
import MarkdownHelpDialog from './MarkdownHelpDialog';
import TableWizard from './TableWizard';
import { readDirectoryContents } from '@/lib/fileSystemUtils';
import { DEFAULT_TRANSLATION_TARGET, requestPairWritingPreview } from '@/lib/llm/chatClient';
import type { PairWritingUsage } from '@/lib/llm/chatClient';
import type { PairWritingHistoryEntry, PairWritingPurpose, TabData } from '@/types';
import { useLlmSettingsContext } from '@/components/providers/LlmSettingsProvider';

type TableAlignment = 'left' | 'center' | 'right' | null;

interface SelectionRange {
  from: number;
  to: number;
  text: string;
}

interface PairWritingSnapshot extends SelectionRange {
  content: string;
  purpose: PairWritingPurpose;
  targetLanguage?: string;
  instruction?: string;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  selection: SelectionRange | null;
}

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
const EMPTY_HISTORY: ReadonlyArray<PairWritingSnapshot> = [];

const MarkdownEditorExtension: React.FC<MarkdownEditorExtensionProps> = ({ tabId, editorRef }) => {
  const { aiFeaturesEnabled } = useLlmSettingsContext();
  const tabs = useEditorStore((state) => state.tabs);
  const editorSettings = useEditorStore((state) => state.editorSettings);
  const updateEditorSettings = useEditorStore((state) => state.updateEditorSettings);
  const updateTab = useEditorStore((state) => state.updateTab);
  const recordPairWritingEntry = useEditorStore((state) => state.recordPairWritingEntry);
  const undoPairWriting = useEditorStore((state) => state.undoPairWriting);
  const redoPairWriting = useEditorStore((state) => state.redoPairWriting);
  const rawPairWritingHistory = useEditorStore(
    useCallback((state) => state.pairWritingHistory[tabId], [tabId]),
  );
  const pairWritingHistory = rawPairWritingHistory ?? EMPTY_HISTORY;
  const pairWritingHistoryIndex = useEditorStore(
    useCallback((state) => {
      const history = state.pairWritingHistory[tabId];
      if (!history || history.length === 0) {
        return -1;
      }
      const index = state.pairWritingHistoryIndex[tabId];
      return typeof index === 'number' ? index : history.length - 1;
    }, [tabId]),
  );
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showTableWizard, setShowTableWizard] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [pairPanelOpen, setPairPanelOpen] = useState(false);
  const [pairPurpose, setPairPurpose] = useState<PairWritingPurpose>('rewrite');
  const [pairTargetLanguage, setPairTargetLanguage] = useState(DEFAULT_TRANSLATION_TARGET);
  const [pairInstruction, setPairInstruction] = useState('');
  const [pairPreview, setPairPreview] = useState('');
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairUsage, setPairUsage] = useState<PairWritingUsage | null>(null);
  const [pairSnapshot, setPairSnapshot] = useState<PairWritingSnapshot | null>(null);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    selection: null,
  });

  const currentTab = tabs.get(tabId);

  useEffect(() => {
    if (!aiFeaturesEnabled) {
      setPairPanelOpen(false);
      setPairError(null);
    }
  }, [aiFeaturesEnabled]);

  const getSelectionRange = useCallback((): SelectionRange | null => {
    const editor = editorRef.current;
    if (!editor) {
      return null;
    }
    const { from, to } = editor.state.selection.main;
    if (from === to) {
      return null;
    }
    const text = editor.state.sliceDoc(from, to);
    return { from, to, text };
  }, [editorRef]);

  const hideContextMenu = useCallback(() => {
    setContextMenuState({ visible: false, x: 0, y: 0, selection: null });
  }, []);

  const contextSelection = contextMenuState.selection;

  const runPairWriting = useCallback(async (purpose: PairWritingPurpose, selection: SelectionRange) => {
    if (!aiFeaturesEnabled) {
      setPairError('AI機能が無効化されています。設定からAIプロバイダーを有効にしてください。');
      return;
    }
    if (pairLoading) {
      return;
    }
    if (!currentTab) {
      setPairPanelOpen(true);
      setPairError('タブ情報を取得できませんでした。');
      return;
    }

    const normalizedText = selection.text.trim();
    if (!normalizedText) {
      setPairPanelOpen(true);
      setPairError('空のテキストは処理できません。');
      return;
    }

    hideContextMenu();

    const targetLanguage = purpose === 'translate'
      ? (pairTargetLanguage && pairTargetLanguage.trim().length > 0
        ? pairTargetLanguage.trim()
        : DEFAULT_TRANSLATION_TARGET)
      : undefined;
    const instruction = purpose === 'rewrite'
      ? (pairInstruction && pairInstruction.trim().length > 0
        ? pairInstruction.trim()
        : undefined)
      : undefined;

    if (purpose === 'translate' && (!pairTargetLanguage || pairTargetLanguage.trim().length === 0)) {
      setPairTargetLanguage(DEFAULT_TRANSLATION_TARGET);
    }

    setPairPanelOpen(true);
    setPairPurpose(purpose);
    setPairLoading(true);
    setPairError(null);
    setPairUsage(null);
    setPairPreview('');

    const snapshot: PairWritingSnapshot = {
      from: selection.from,
      to: selection.to,
      text: selection.text,
      content: currentTab.content,
      purpose,
      targetLanguage,
      instruction,
    };
    setPairSnapshot(snapshot);

    try {
      const response = await requestPairWritingPreview({
        purpose,
        text: selection.text,
        targetLanguage,
        rewriteInstruction: instruction,
      });
      setPairPreview(response.output);
      setPairUsage(response.usage ?? null);
      setPairSnapshot(prev => (prev ? {
        ...prev,
        purpose: response.purpose,
        targetLanguage: response.targetLanguage ?? prev.targetLanguage,
        instruction: response.rewriteInstruction ?? prev.instruction,
      } : prev));
      if (response.purpose === 'translate' && response.targetLanguage) {
        setPairTargetLanguage(response.targetLanguage);
      }
      if (response.purpose === 'rewrite' && response.rewriteInstruction) {
        setPairInstruction(response.rewriteInstruction);
      }
    } catch (error) {
      setPairError(error instanceof Error ? error.message : 'プレビューの生成に失敗しました。');
    } finally {
      setPairLoading(false);
    }
  }, [
    aiFeaturesEnabled,
    currentTab,
    hideContextMenu,
    pairInstruction,
    pairLoading,
    pairTargetLanguage,
  ]);

  const handleGeneratePreview = useCallback(() => {
    const selection = getSelectionRange();
    if (!selection) {
      setPairPanelOpen(true);
      setPairError('プレビュー対象のテキストを選択してください。');
      return;
    }
    void runPairWriting(pairPurpose, selection);
  }, [getSelectionRange, pairPurpose, runPairWriting]);

  const handleContextAction = useCallback((purpose: PairWritingPurpose) => {
    hideContextMenu();
    const selection = contextSelection ?? getSelectionRange();
    if (!selection) {
      setPairPanelOpen(true);
      setPairError('テキストを選択してください。');
      return;
    }
    void runPairWriting(purpose, selection);
  }, [contextSelection, getSelectionRange, hideContextMenu, runPairWriting]);

  const handleApplyPreview = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      setPairError('エディタが初期化されていません。');
      return;
    }
    const snapshot = pairSnapshot;
    if (!snapshot) {
      setPairError('適用可能なプレビューがありません。');
      return;
    }
    const tab = tabs.get(tabId);
    if (!tab) {
      setPairError('タブ情報を取得できませんでした。');
      return;
    }
    if (tab.content !== snapshot.content) {
      setPairError('エディタ内容が更新されています。最新の選択範囲で再度プレビューを生成してください。');
      return;
    }
    const editorContent = editor.state.doc.toString();
    if (editorContent !== snapshot.content) {
      setPairError('エディタの内容とストアの状態が一致していません。再度お試しください。');
      return;
    }

    const { from, to } = snapshot;
    editor.dispatch({
      changes: { from, to, insert: pairPreview },
      selection: { anchor: from, head: from + pairPreview.length },
      scrollIntoView: true,
    });
    editor.focus();

    const newContent = editor.state.doc.toString();
    updateTab(tabId, {
      content: newContent,
      isDirty: newContent !== tab.originalContent,
    });

    const entry: PairWritingHistoryEntry = {
      id: `pair-${Date.now()}`,
      tabId,
      purpose: snapshot.purpose,
      originalText: snapshot.text,
      transformedText: pairPreview,
      beforeContent: snapshot.content,
      afterContent: newContent,
      rangeFrom: snapshot.from,
      rangeTo: snapshot.from + pairPreview.length,
      targetLanguage: snapshot.targetLanguage ?? null,
      rewriteInstruction: snapshot.instruction ?? null,
      createdAt: new Date().toISOString(),
    };
    recordPairWritingEntry(tabId, entry);

    setPairSnapshot({
      ...snapshot,
      text: pairPreview,
      content: newContent,
      to: snapshot.from + pairPreview.length,
    });
    setPairError(null);
  }, [editorRef, pairPreview, pairSnapshot, recordPairWritingEntry, tabId, tabs, updateTab]);

  const handleUndoClick = useCallback(() => {
    const entry = undoPairWriting(tabId);
    if (!entry) {
      setPairError('これ以上元に戻すことはできません。');
      return;
    }
    setPairPanelOpen(true);
    setPairError(null);
    setPairUsage(null);
    setPairPurpose(entry.purpose);
    if (entry.purpose === 'translate') {
      setPairTargetLanguage(entry.targetLanguage ?? DEFAULT_TRANSLATION_TARGET);
    } else {
      setPairInstruction(entry.rewriteInstruction ?? '');
    }
    const originalLength = entry.originalText.length;
    setPairPreview(entry.originalText);
    setPairSnapshot({
      from: entry.rangeFrom,
      to: entry.rangeFrom + originalLength,
      text: entry.originalText,
      content: entry.beforeContent,
      purpose: entry.purpose,
      targetLanguage: entry.targetLanguage ?? undefined,
      instruction: entry.rewriteInstruction ?? undefined,
    });
    editorRef.current?.focus();
  }, [editorRef, tabId, undoPairWriting]);

  const handleRedoClick = useCallback(() => {
    const entry = redoPairWriting(tabId);
    if (!entry) {
      setPairError('やり直す履歴がありません。');
      return;
    }
    setPairPanelOpen(true);
    setPairError(null);
    setPairUsage(null);
    setPairPurpose(entry.purpose);
    if (entry.purpose === 'translate') {
      setPairTargetLanguage(entry.targetLanguage ?? DEFAULT_TRANSLATION_TARGET);
    } else {
      setPairInstruction(entry.rewriteInstruction ?? '');
    }
    const transformedLength = entry.transformedText.length;
    setPairPreview(entry.transformedText);
    setPairSnapshot({
      from: entry.rangeFrom,
      to: entry.rangeFrom + transformedLength,
      text: entry.transformedText,
      content: entry.afterContent,
      purpose: entry.purpose,
      targetLanguage: entry.targetLanguage ?? undefined,
      instruction: entry.rewriteInstruction ?? undefined,
    });
    editorRef.current?.focus();
  }, [editorRef, redoPairWriting, tabId]);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (!aiFeaturesEnabled) {
        return;
      }
      const editor = editorRef.current;
      if (!editor) {
        return;
      }
      if (!editor.dom.contains(event.target as Node)) {
        return;
      }
      const selection = getSelectionRange();
      if (!selection || selection.text.trim().length === 0) {
        hideContextMenu();
        return;
      }
      event.preventDefault();
      setContextMenuState({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        selection,
      });
    };

    const handleClick = () => {
      setContextMenuState(prev => (prev.visible ? { ...prev, visible: false, selection: null } : prev));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        hideContextMenu();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [aiFeaturesEnabled, editorRef, getSelectionRange, hideContextMenu]);

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
    insertUnderline,
    insertStrikethrough,
    insertHighlight,
    insertInlineCode,
    insertTaskListItem,
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

  const historyCount = pairWritingHistory.length;
  const canUndo = historyCount > 0 && pairWritingHistoryIndex >= 0;
  const canRedo = historyCount > 0 && pairWritingHistoryIndex + 1 < historyCount;
  const lastAppliedEntry: PairWritingHistoryEntry | null = pairWritingHistoryIndex >= 0
    ? pairWritingHistory[pairWritingHistoryIndex]
    : null;
  const previewCharCount = pairPreview.length;
  const originalCharCount = pairSnapshot?.text.length ?? 0;
  const pendingPurposeLabel = pairPurpose === 'translate' ? '翻訳' : 'リライト';
  const contextMenuPosition = contextMenuState.visible && typeof window !== 'undefined'
    ? {
        top: Math.min(contextMenuState.y, window.innerHeight - 120),
        left: Math.min(contextMenuState.x, window.innerWidth - 220),
      }
    : { top: contextMenuState.y, left: contextMenuState.x };

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
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertUnderline}
            title="下線"
          >
            <span className="underline font-semibold">U</span>
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertStrikethrough}
            title="打ち消し線"
          >
            <span className="line-through font-semibold">S</span>
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertHighlight}
            title="ハイライト"
          >
            <span className="rounded bg-yellow-200 px-1 text-xs font-semibold text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-100">HL</span>
          </button>
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertInlineCode}
            title="インラインコード"
          >
            <span className="font-mono text-xs">{'`code`'}</span>
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
          <button
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
            onClick={insertTaskListItem}
            title="チェックボックス"
          >
            <IoCheckbox size={18} />
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

        {aiFeaturesEnabled && (
          <div className="flex space-x-1 mr-3">
            <button
              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip ${
                pairPanelOpen ? 'bg-blue-100 dark:bg-blue-900' : ''
              }`}
              onClick={() => {
                setPairPanelOpen(prev => !prev);
                setPairError(null);
                hideContextMenu();
              }}
              title="AIペアライティングパネルを表示"
            >
              <IoSparkles size={18} />
            </button>
            <button
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
              onClick={() => handleContextAction('translate')}
              title={`選択範囲を翻訳してプレビュー (${pairTargetLanguage || DEFAULT_TRANSLATION_TARGET})`}
            >
              <IoLanguage size={18} />
            </button>
            <button
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 tooltip"
              onClick={() => handleContextAction('rewrite')}
              title="選択範囲をリライトしてプレビュー"
            >
              <IoCreateOutline size={18} />
            </button>
          </div>
        )}

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

      {aiFeaturesEnabled && pairPanelOpen && (
        <div className="mt-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <IoSparkles className="text-blue-500" size={18} />
              <span>AIペアライティング</span>
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">現在: {pendingPurposeLabel}</span>
            </div>
            <button
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800"
              onClick={() => {
                setPairPanelOpen(false);
                setPairError(null);
              }}
              title="パネルを閉じる"
            >
              <IoClose size={18} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <button
              className={`px-3 py-1 rounded border ${
                pairPurpose === 'translate'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              onClick={() => {
                setPairPurpose('translate');
                setPairError(null);
                setPairUsage(null);
              }}
            >
              翻訳
            </button>
            <button
              className={`px-3 py-1 rounded border ${
                pairPurpose === 'rewrite'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              onClick={() => {
                setPairPurpose('rewrite');
                setPairError(null);
                setPairUsage(null);
              }}
            >
              リライト
            </button>
          </div>

          {pairPurpose === 'translate' ? (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">翻訳先言語</label>
              <input
                className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={pairTargetLanguage}
                onChange={(event) => setPairTargetLanguage(event.target.value)}
                placeholder="例: 日本語"
              />
            </div>
          ) : (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">リライト指示 (任意)</label>
              <input
                className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={pairInstruction}
                onChange={(event) => setPairInstruction(event.target.value)}
                placeholder="例: 簡潔に、敬体で"
              />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 text-sm"
              onClick={handleGeneratePreview}
              disabled={pairLoading}
            >
              {pairLoading ? '生成中…' : 'プレビュー生成'}
            </button>
            <button
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-300 text-sm"
              onClick={handleApplyPreview}
              disabled={!pairSnapshot || pairLoading}
            >
              選択範囲を置換
            </button>
            <button
              className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
              onClick={handleUndoClick}
              disabled={!canUndo}
            >
              <IoArrowUndo size={14} /> 元に戻す
            </button>
            <button
              className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
              onClick={handleRedoClick}
              disabled={!canRedo}
            >
              <IoArrowRedo size={14} /> やり直す
            </button>
            {typeof pairUsage?.totalTokens === 'number' && (
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                Tokens: {pairUsage.totalTokens}
              </span>
            )}
          </div>

          {pairError && (
            <div className="mt-2 text-sm text-red-600 dark:text-red-400">{pairError}</div>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <span className="font-semibold">元のテキスト</span>
                <span>{originalCharCount} 文字</span>
              </div>
              <div className="mt-1 max-h-40 overflow-auto rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 p-2 text-xs whitespace-pre-wrap">
                {pairSnapshot ? pairSnapshot.text : '選択されたテキストがここに表示されます。'}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                <span className="font-semibold">プレビュー</span>
                <span>{previewCharCount} 文字</span>
              </div>
              <textarea
                className="mt-1 w-full min-h-[160px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={pairPreview}
                onChange={(event) => setPairPreview(event.target.value)}
                placeholder="プレビュー結果がここに表示されます"
              />
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-3">
            <span>履歴: {historyCount} 件</span>
            {lastAppliedEntry && (
              <span>
                最新: {lastAppliedEntry.purpose === 'translate' ? '翻訳' : 'リライト'} / {lastAppliedEntry.createdAt}
              </span>
            )}
          </div>
        </div>
      )}

      {aiFeaturesEnabled && contextMenuState.visible && (
        <div
          className="fixed z-[70] w-52 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg"
          style={contextMenuPosition}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            onClick={() => handleContextAction('translate')}
          >
            <IoLanguage size={16} /> 選択を翻訳
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            onClick={() => handleContextAction('rewrite')}
          >
            <IoCreateOutline size={16} /> 選択をリライト
          </button>
        </div>
      )}

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
