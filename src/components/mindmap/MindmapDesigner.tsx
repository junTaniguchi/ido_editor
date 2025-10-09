import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IoAddCircleOutline, IoChevronDown, IoChevronUp, IoGitBranch, IoSave, IoTrashOutline } from 'react-icons/io5';
import { LuPlus, LuSparkles } from 'react-icons/lu';
import { useEditorStore } from '@/store/editorStore';
import { useLlmSettingsContext } from '@/components/providers/LlmSettingsProvider';
import MarkmapMindmap from './MarkmapMindmap';
import {
  addMindmapChild,
  addMindmapSibling,
  createMindmapNode,
  DEFAULT_MINDMAP_LAYOUT,
  ensureMindmapRoot,
  findMindmapNode,
  generateMarkdownFromMindmap,
  getMindmapNodeContext,
  getMindmapNodePath,
  MindmapLayout,
  MindmapNode,
  moveMindmapNode,
  parseMindmap,
  removeMindmapNode,
  serializeMindmap,
  updateMindmapNodeLabel,
} from '@/lib/mindmap/mindmapUtils';
import { writeFileContent } from '@/lib/fileSystemUtils';

interface MindmapDesignerProps {
  tabId: string;
  fileName: string;
  content: string;
  onContentChange?: (code: string) => void;
}

const layoutOptions: { value: MindmapLayout; label: string }[] = [
  { value: 'LR', label: '左 → 右 (Markmap風)' },
  { value: 'RL', label: '右 → 左' },
  { value: 'TB', label: '上 → 下' },
  { value: 'BT', label: '下 → 上' },
];

const depthColors = ['#2563eb', '#0891b2', '#16a34a', '#d97706', '#9333ea', '#db2777'];

const MindmapDesigner: React.FC<MindmapDesignerProps> = ({ tabId, fileName, content, onContentChange }) => {
  const updateTab = useEditorStore((state) => state.updateTab);
  const getTab = useEditorStore((state) => state.getTab);
  const rootDirHandle = useEditorStore((state) => state.rootDirHandle);

  const initialParsed = useMemo(() => parseMindmap(content), [content]);
  const initialRoot = useMemo(() => ensureMindmapRoot(initialParsed.root), [initialParsed.root]);
  const initialLayout = initialParsed.layout ?? DEFAULT_MINDMAP_LAYOUT;

  const [tree, setTree] = useState<MindmapNode>(initialRoot);
  const [layout, setLayout] = useState<MindmapLayout>(initialLayout);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(initialRoot.id);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const lastSerializedRef = useRef<string>(content);
  const { aiFeaturesEnabled } = useLlmSettingsContext();
  const [aiInstruction, setAiInstruction] = useState('');
  const [isAiExpanding, setAiExpanding] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInfo, setAiInfo] = useState<string | null>(null);

  useEffect(() => {
    if (content === lastSerializedRef.current) {
      return;
    }
    const parsed = parseMindmap(content);
    const ensuredRoot = ensureMindmapRoot(parsed.root);
    setTree(ensuredRoot);
    setLayout(parsed.layout);
    setSelectedNodeId(ensuredRoot.id);
    lastSerializedRef.current = content;
  }, [content]);

  useEffect(() => {
    const serialized = serializeMindmap(tree, layout);
    if (serialized === lastSerializedRef.current) {
      return;
    }
    lastSerializedRef.current = serialized;
    onContentChange?.(serialized);
    const tab = getTab(tabId);
    const isDirty = tab ? serialized !== tab.originalContent : true;
    updateTab(tabId, { content: serialized, isDirty });
  }, [tree, layout, getTab, onContentChange, tabId, updateTab]);

  useEffect(() => {
    setAiError(null);
    setAiInfo(null);
  }, [selectedNodeId]);

  const handleUpdateTree = useCallback((updater: (current: MindmapNode) => MindmapNode) => {
    setTree((current) => ensureMindmapRoot(updater(current)));
  }, []);

  const handleRename = useCallback(
    (label: string) => {
      handleUpdateTree((current) => updateMindmapNodeLabel(current, selectedNodeId, label));
    },
    [handleUpdateTree, selectedNodeId],
  );

  const handleAddChild = useCallback(() => {
    const newNode = createMindmapNode('新しいアイデア');
    handleUpdateTree((current) => {
      const result = addMindmapChild(current, selectedNodeId, newNode);
      if (result.added) {
        setSelectedNodeId(newNode.id);
        return result.tree;
      }
      return current;
    });
  }, [handleUpdateTree, selectedNodeId]);

  const handleAddSibling = useCallback(() => {
    if (tree.id === selectedNodeId) {
      handleAddChild();
      return;
    }
    const newNode = createMindmapNode('新しいアイデア');
    handleUpdateTree((current) => {
      const result = addMindmapSibling(current, selectedNodeId, newNode);
      if (result.added) {
        setSelectedNodeId(newNode.id);
        return result.tree;
      }
      return current;
    });
  }, [handleAddChild, handleUpdateTree, selectedNodeId, tree.id]);

  const handleDelete = useCallback(() => {
    if (tree.id === selectedNodeId) {
      return;
    }
    handleUpdateTree((current) => {
      const result = removeMindmapNode(current, selectedNodeId);
      if (result.removed) {
        if (result.parentId) {
          setSelectedNodeId(result.parentId);
        } else {
          setSelectedNodeId(current.id);
        }
        return ensureMindmapRoot(result.tree);
      }
      return current;
    });
  }, [handleUpdateTree, selectedNodeId, tree.id]);

  const handleMove = useCallback(
    (direction: 'up' | 'down') => {
      handleUpdateTree((current) => {
        const result = moveMindmapNode(current, selectedNodeId, direction);
        return result.moved ? result.tree : current;
      });
    },
    [handleUpdateTree, selectedNodeId],
  );

  const handleLayoutChange = useCallback((nextLayout: MindmapLayout) => {
    setLayout(nextLayout);
  }, []);

  const selectedNode = useMemo(() => findMindmapNode(tree, selectedNodeId) ?? tree, [selectedNodeId, tree]);

  const handleAiExpand = useCallback(async () => {
    if (!aiFeaturesEnabled) {
      setAiError('AI機能が無効化されています。設定からAIプロバイダーを有効にしてください。');
      return;
    }

    if (!selectedNode) {
      setAiError('詳細化するノードを選択してください。');
      return;
    }

    const normalizeLabelForAi = (value: string) => value.replace(/\s+/g, ' ').trim();
    const targetLabel = normalizeLabelForAi(selectedNode.label ?? '');

    if (!targetLabel) {
      setAiError('ノード名が空です。先にノード名を入力してください。');
      return;
    }

    setAiExpanding(true);
    setAiError(null);
    setAiInfo(null);

    try {
      const pathNodes = getMindmapNodePath(tree, selectedNodeId);
      const ancestorLabels = Array.from(
        new Set(
          pathNodes
            .slice(0, -1)
            .map((node) => normalizeLabelForAi(node.label ?? ''))
            .filter((label) => label.length > 0),
        ),
      );
      const existingChildLabels = Array.from(
        new Set(
          selectedNode.children
            .map((child) => normalizeLabelForAi(child.label ?? ''))
            .filter((label) => label.length > 0),
        ),
      );

      const extraInstruction = aiInstruction.trim();

      const response = await fetch('/api/llm/mindmap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeLabel: targetLabel,
          ancestorPath: ancestorLabels,
          existingChildren: existingChildLabels,
          instruction: extraInstruction.length > 0 ? extraInstruction : undefined,
        }),
      });

      if (!response.ok) {
        let message = `AIによる子ノード提案に失敗しました。（${response.status}）`;
        try {
          const errorPayload = await response.json();
          if (errorPayload && typeof errorPayload.error === 'string') {
            message = errorPayload.error;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const data = await response.json();
      if (data && typeof data.error === 'string') {
        throw new Error(data.error);
      }
      const rawSuggestions: unknown[] = Array.isArray(data?.children) ? data.children : [];
      const suggestions = rawSuggestions
        .map((item) => {
          if (item && typeof item === 'object' && typeof (item as { label?: string }).label === 'string') {
            return normalizeLabelForAi((item as { label: string }).label);
          }
          if (typeof item === 'string') {
            return normalizeLabelForAi(item);
          }
          return '';
        })
        .filter((label) => label.length > 0);

      if (suggestions.length === 0) {
        setAiError('AIから有効な子ノード案を取得できませんでした。');
        return;
      }

      const uniqueSuggestions = Array.from(new Set(suggestions));
      const existingSet = new Set(existingChildLabels);
      let addedCount = 0;
      let skippedCount = 0;

      handleUpdateTree((current) => {
        let nextTree = current;
        uniqueSuggestions.forEach((label) => {
          if (existingSet.has(label)) {
            skippedCount += 1;
            return;
          }
          existingSet.add(label);
          const newNode = { ...createMindmapNode(label), label };
          const result = addMindmapChild(nextTree, selectedNodeId, newNode);
          if (result.added) {
            nextTree = result.tree;
            addedCount += 1;
          }
        });
        return nextTree;
      });

      if (addedCount > 0) {
        setAiInfo(
          `${addedCount}件の子ノードを追加しました。${
            skippedCount > 0 ? `（${skippedCount}件は重複のためスキップ）` : ''
          }`,
        );
      } else if (skippedCount > 0) {
        setAiError('AIからの提案は既存の子ノードと重複していたため追加されませんでした。');
      } else {
        setAiError('AIから有効な子ノード案を取得できませんでした。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AIによる子ノード提案に失敗しました。';
      setAiError(message);
    } finally {
      setAiExpanding(false);
    }
  }, [aiFeaturesEnabled, aiInstruction, handleUpdateTree, selectedNode, selectedNodeId, tree]);

  const nodeContext = useMemo(() => getMindmapNodeContext(tree, selectedNodeId), [selectedNodeId, tree]);

  const canDelete = tree.id !== selectedNodeId;
  const canAddSibling = Boolean(nodeContext?.parent);
  const canMoveUp = Boolean(nodeContext?.parent && nodeContext.index > 0);
  const canMoveDown = Boolean(
    nodeContext?.parent && nodeContext.index < (nodeContext.parent.children.length ?? 0) - 1,
  );

  const markdown = useMemo(() => generateMarkdownFromMindmap(tree), [tree]);

  const handleSave = useCallback(async () => {
    const contentToSave = serializeMindmap(tree, layout);
    lastSerializedRef.current = contentToSave;

    const tab = getTab(tabId);
    if (!tab) {
      alert('現在のタブ情報を取得できませんでした。');
      return;
    }

    if (tab.isReadOnly) {
      alert('このファイルは読み取り専用のため保存できません。');
      return;
    }

    const existingHandle = tab.file;
    let fileHandle: FileSystemFileHandle | null = null;

    if (existingHandle && typeof (existingHandle as FileSystemFileHandle).createWritable === 'function') {
      fileHandle = existingHandle as FileSystemFileHandle;
    } else if (rootDirHandle) {
      const candidatePath = tab.id && !tab.id.startsWith('temp_') ? tab.id : tab.name;
      if (candidatePath) {
        const segments = candidatePath.split('/').filter(Boolean);
        if (segments.length > 0) {
          try {
            let directoryHandle: FileSystemDirectoryHandle = rootDirHandle;
            for (let index = 0; index < segments.length - 1; index += 1) {
              directoryHandle = await directoryHandle.getDirectoryHandle(segments[index]);
            }
            const targetFileName = segments[segments.length - 1];
            fileHandle = await directoryHandle.getFileHandle(targetFileName, { create: true });
          } catch (error) {
            console.error('Failed to resolve file handle for saving mindmap:', error);
          }
        }
      }
    }

    if (!fileHandle) {
      alert('ファイルの保存先を特定できませんでした。フォルダを開き直してください。');
      return;
    }

    try {
      const didWrite = await writeFileContent(fileHandle, contentToSave);
      if (!didWrite) {
        throw new Error('ファイルの書き込みに失敗しました');
      }

      const latestTab = useEditorStore.getState().tabs.get(tabId);
      const latestContent = typeof latestTab?.content === 'string' ? latestTab.content : contentToSave;
      const hasPendingChanges = typeof latestContent === 'string' && latestContent !== contentToSave;

      updateTab(tabId, {
        originalContent: contentToSave,
        isDirty: hasPendingChanges,
        file: fileHandle,
      });
    } catch (error) {
      console.error('Failed to save mindmap:', error);
      alert(`ファイルの保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  }, [getTab, layout, rootDirHandle, tabId, tree, updateTab]);

  const renderTree = useCallback(
    (node: MindmapNode, depth: number): React.ReactNode => {
      const isSelected = node.id === selectedNodeId;
      const color = depthColors[depth % depthColors.length];
      return (
        <div key={node.id} style={{ paddingLeft: depth * 16 }} className="space-y-1">
          <button
            type="button"
            onClick={() => setSelectedNodeId(node.id)}
            className={`flex w-full items-center justify-between rounded px-2 py-1 text-left transition ${
              isSelected
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                className="block h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              <span className="text-sm">{node.label || '（無題）'}</span>
            </span>
            <span className="text-xs text-gray-400">{node.children.length}</span>
          </button>
          {node.children.length > 0 && (
            <div className="space-y-1 border-l border-dashed border-gray-300 pl-3 dark:border-gray-600">
              {node.children.map((child) => renderTree(child, depth + 1))}
            </div>
          )}
        </div>
      );
    },
    [selectedNodeId],
  );

  return (
    <div className="flex h-full bg-white dark:bg-gray-950">
      <aside
        className={`transition-all duration-200 ${
          isSidebarCollapsed ? 'w-0 opacity-0' : 'w-80 opacity-100'
        } overflow-hidden border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900`}
      >
        {!isSidebarCollapsed && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">マインドマップ構造</h2>
              <button
                type="button"
                className="text-xs text-blue-600 dark:text-blue-300"
                onClick={() => setSidebarCollapsed(true)}
              >
                折りたたむ
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">レイアウト</label>
                <select
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  value={layout}
                  onChange={(event) => handleLayoutChange(event.target.value as MindmapLayout)}
                >
                  {layoutOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">ノード一覧</p>
                <div className="max-h-72 space-y-1 overflow-auto rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
                  {renderTree(tree, 0)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">選択中のノード</label>
                <input
                  type="text"
                  value={selectedNode?.label ?? ''}
                  onChange={(event) => handleRename(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="flex items-center justify-center gap-1 rounded border border-blue-500 bg-blue-50 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50"
                >
                  <IoAddCircleOutline size={14} /> 子ノード
                </button>
                <button
                  type="button"
                  onClick={handleAddSibling}
                  disabled={!canAddSibling}
                  className={`flex items-center justify-center gap-1 rounded border py-2 text-xs font-medium ${
                    canAddSibling
                      ? 'border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50'
                      : 'border-gray-300 bg-gray-200 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500'
                  }`}
                >
                  <LuPlus size={14} /> 同列ノード
                </button>
                <button
                  type="button"
                  onClick={() => handleMove('up')}
                  disabled={!canMoveUp}
                  className={`flex items-center justify-center gap-1 rounded border py-2 text-xs font-medium ${
                    canMoveUp
                      ? 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      : 'border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-600'
                  }`}
                >
                  <IoChevronUp size={14} /> 上へ
                </button>
                <button
                  type="button"
                  onClick={() => handleMove('down')}
                  disabled={!canMoveDown}
                  className={`flex items-center justify-center gap-1 rounded border py-2 text-xs font-medium ${
                    canMoveDown
                      ? 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      : 'border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-600'
                  }`}
                >
                  <IoChevronDown size={14} /> 下へ
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canDelete}
                  className={`col-span-2 flex items-center justify-center gap-1 rounded border py-2 text-xs font-medium ${
                    canDelete
                      ? 'border-red-500 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-400 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/60'
                      : 'border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-600'
                  }`}
                >
                  <IoTrashOutline size={14} /> ノードを削除
                </button>
              </div>

              <div className="space-y-2 rounded border border-gray-200 bg-white p-3 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-800/80">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-700 dark:text-gray-200">AIで詳細化</p>
                  {isAiExpanding && (
                    <span className="text-[11px] text-blue-600 dark:text-blue-300">生成中…</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  選択中のノードをAIに渡して、関連する子ノード候補を自動生成します。
                </p>
                <textarea
                  value={aiInstruction}
                  onChange={(event) => setAiInstruction(event.target.value)}
                  placeholder="AIに伝えたい補足や観点があれば入力してください（任意）"
                  className="h-20 w-full resize-none rounded border border-gray-300 bg-white p-2 text-xs text-gray-700 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => void handleAiExpand()}
                  disabled={!aiFeaturesEnabled || isAiExpanding}
                  className={`flex w-full items-center justify-center gap-1 rounded border px-3 py-2 text-xs font-medium transition ${
                    aiFeaturesEnabled && !isAiExpanding
                      ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-500 dark:border-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400'
                      : 'border-gray-300 bg-gray-200 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500'
                  }`}
                >
                  <LuSparkles size={14} />
                  {isAiExpanding ? '生成中…' : 'AIで子ノードを提案'}
                </button>
                {!aiFeaturesEnabled && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    AI機能を利用するには右上の鍵アイコンからプロバイダー設定とAPIキーを登録してください。
                  </p>
                )}
                {aiInfo && (
                  <p className="text-[11px] text-green-600 dark:text-green-300">{aiInfo}</p>
                )}
                {aiError && (
                  <p className="text-[11px] text-red-600 dark:text-red-300">{aiError}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              {isSidebarCollapsed ? '▶ ノード一覧を表示' : '◀ ノード一覧を隠す'}
            </button>
            <div>
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{fileName}</p>
              <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <IoGitBranch size={12} />
                Markmap風マインドマップをGUIで編集できます
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              className="flex items-center gap-1 rounded border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 dark:border-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <IoSave size={16} />
              保存
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <MarkmapMindmap markdown={markdown} className="h-full" />
        </div>
      </div>
    </div>
  );
};

export default MindmapDesigner;
