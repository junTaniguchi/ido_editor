import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IoAddCircleOutline, IoChevronDown, IoChevronUp, IoGitBranch, IoTrashOutline } from 'react-icons/io5';
import { LuPlus } from 'react-icons/lu';
import { useEditorStore } from '@/store/editorStore';
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
  MindmapLayout,
  MindmapNode,
  moveMindmapNode,
  parseMindmap,
  removeMindmapNode,
  serializeMindmap,
  updateMindmapNodeLabel,
} from '@/lib/mindmap/mindmapUtils';

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

  const initialParsed = useMemo(() => parseMindmap(content), [content]);
  const initialRoot = useMemo(() => ensureMindmapRoot(initialParsed.root), [initialParsed.root]);
  const initialLayout = initialParsed.layout ?? DEFAULT_MINDMAP_LAYOUT;

  const [tree, setTree] = useState<MindmapNode>(initialRoot);
  const [layout, setLayout] = useState<MindmapLayout>(initialLayout);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(initialRoot.id);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const lastSerializedRef = useRef<string>(content);

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

  const persist = useCallback(
    (nextTree: MindmapNode, nextLayout: MindmapLayout = layout) => {
      const serialized = serializeMindmap(nextTree, nextLayout);
      lastSerializedRef.current = serialized;
      onContentChange?.(serialized);
      const tab = getTab(tabId);
      const isDirty = tab ? serialized !== tab.originalContent : true;
      updateTab(tabId, { content: serialized, isDirty });
    },
    [getTab, layout, onContentChange, tabId, updateTab],
  );

  const handleUpdateTree = useCallback(
    (updater: (current: MindmapNode) => MindmapNode) => {
      setTree((current) => {
        const next = ensureMindmapRoot(updater(current));
        persist(next);
        return next;
      });
    },
    [persist],
  );

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

  const handleLayoutChange = useCallback(
    (nextLayout: MindmapLayout) => {
      setLayout(nextLayout);
      persist(tree, nextLayout);
    },
    [persist, tree],
  );

  const selectedNode = useMemo(() => findMindmapNode(tree, selectedNodeId) ?? tree, [selectedNodeId, tree]);

  const nodeContext = useMemo(() => getMindmapNodeContext(tree, selectedNodeId), [selectedNodeId, tree]);

  const canDelete = tree.id !== selectedNodeId;
  const canAddSibling = Boolean(nodeContext?.parent);
  const canMoveUp = Boolean(nodeContext?.parent && nodeContext.index > 0);
  const canMoveDown = Boolean(
    nodeContext?.parent && nodeContext.index < (nodeContext.parent.children.length ?? 0) - 1,
  );

  const markdown = useMemo(() => generateMarkdownFromMindmap(tree), [tree]);

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
        </div>

        <div className="flex-1 overflow-hidden">
          <MarkmapMindmap markdown={markdown} className="h-full" />
        </div>
      </div>
    </div>
  );
};

export default MindmapDesigner;
