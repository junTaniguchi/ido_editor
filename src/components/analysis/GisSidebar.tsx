'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  IoChevronDown,
  IoChevronForward,
  IoDocumentOutline,
  IoFolderOutline,
  IoStatsChartOutline,
} from 'react-icons/io5';

import { useEditorStore } from '@/store/editorStore';
import { useGisAnalysisStore } from '@/store/gisStore';
import { getFileType } from '@/lib/editorUtils';
import type { FileTreeItem } from '@/types';
import type { GisFileType } from '@/lib/gisFileTypes';
import { GIS_FILE_TYPES } from '@/lib/gisFileTypes';

interface GisDirectoryNode {
  kind: 'directory';
  name: string;
  path: string;
  children: GisTreeNode[];
}

interface GisFileNode {
  kind: 'file';
  name: string;
  path: string;
  fileType: GisFileType;
}

type GisTreeNode = GisDirectoryNode | GisFileNode;

const isSupportedGisType = (value: string): value is GisFileType => {
  return (GIS_FILE_TYPES as readonly string[]).includes(value);
};

const isGisFile = (item: FileTreeItem) => {
  if (item.isDirectory) {
    return false;
  }
  const type = getFileType(item.name);
  return isSupportedGisType(type);
};

const buildGisTree = (root: FileTreeItem | null): GisTreeNode[] => {
  if (!root) {
    return [];
  }

  const traverse = (node: FileTreeItem): GisTreeNode | null => {
    if (node.isDirectory) {
      const children = (node.children ?? [])
        .map(traverse)
        .filter((child): child is GisTreeNode => Boolean(child));

      if (children.length === 0) {
        return null;
      }

      return {
        kind: 'directory',
        name: node.name,
        path: node.path,
        children,
      };
    }

    if (isGisFile(node)) {
      const type = getFileType(node.name);
      if (!isSupportedGisType(type)) {
        return null;
      }
      return {
        kind: 'file',
        name: node.name,
        path: node.path,
        fileType: type,
      };
    }

    return null;
  };

  if (root.isDirectory) {
    return (root.children ?? [])
      .map(traverse)
      .filter((child): child is GisTreeNode => Boolean(child));
  }

  const single = traverse(root);
  return single ? [single] : [];
};

const ensureExpandedAncestors = (path: string): string[] => {
  const segments = path.split('/');
  const expanded: string[] = [];
  let accumulator = '';
  segments.forEach((segment) => {
    if (!segment) {
      return;
    }
    accumulator = accumulator ? `${accumulator}/${segment}` : segment;
    expanded.push(accumulator);
  });
  return expanded;
};

const GisSidebar: React.FC = () => {
  const rootFileTree = useEditorStore((state) => state.rootFileTree);
  const columnCache = useGisAnalysisStore((state) => state.columnCache);
  const selectedFilePath = useGisAnalysisStore((state) => state.selectedFilePath);
  const selectedColumn = useGisAnalysisStore((state) => state.selectedColumn);
  const setSelectedFilePath = useGisAnalysisStore((state) => state.setSelectedFilePath);
  const setSelectedColumn = useGisAnalysisStore((state) => state.setSelectedColumn);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildGisTree(rootFileTree), [rootFileTree]);

  useEffect(() => {
    if (!selectedFilePath) {
      return;
    }
    setExpandedNodes((previous) => {
      const next = new Set(previous);
      ensureExpandedAncestors(selectedFilePath).forEach((ancestor) => next.add(ancestor));
      return next;
    });
  }, [selectedFilePath]);

  useEffect(() => {
    if (tree.length === 0) {
      setExpandedNodes(new Set());
    }
  }, [tree]);

  const toggleNode = (path: string) => {
    setExpandedNodes((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSelectFile = (path: string) => {
    setSelectedFilePath(path);
    setExpandedNodes((previous) => {
      const next = new Set(previous);
      ensureExpandedAncestors(path).forEach((ancestor) => next.add(ancestor));
      next.add(path);
      return next;
    });
  };

  const handleSelectColumn = (column: string) => {
    setSelectedColumn(column);
  };

  const renderNode = (node: GisTreeNode, depth = 0) => {
    if (node.kind === 'directory') {
      const isExpanded = expandedNodes.has(node.path);
      return (
        <div key={node.path}>
          <button
            type="button"
            onClick={() => toggleNode(node.path)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            style={{ paddingLeft: depth * 16 + 8 }}
          >
            {isExpanded ? <IoChevronDown size={16} /> : <IoChevronForward size={16} />}
            <IoFolderOutline size={16} />
            <span>{node.name}</span>
          </button>
          {isExpanded && node.children.length > 0 && (
            <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    const isExpanded = expandedNodes.has(node.path);
    const isSelected = selectedFilePath === node.path;
    const columns = columnCache[node.path] ?? [];
    const showColumns = (isExpanded || isSelected) && columns.length > 0;

    return (
      <div key={node.path}>
        <button
          type="button"
          onClick={() => {
            if (isExpanded) {
              toggleNode(node.path);
            } else {
              setExpandedNodes((previous) => {
                const next = new Set(previous);
                next.add(node.path);
                return next;
              });
            }
            handleSelectFile(node.path);
          }}
          className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
            isSelected
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200'
              : 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-800 dark:text-gray-200'
          }`}
          style={{ paddingLeft: depth * 16 + 8 }}
        >
          {showColumns ? <IoChevronDown size={16} /> : <IoChevronForward size={16} />}
          <IoDocumentOutline size={16} />
          <span className="flex-1 truncate">{node.name}</span>
          <span className="text-xs uppercase text-gray-400">{node.fileType}</span>
        </button>
        {isSelected && columns.length === 0 && (
          <div className="pl-10 pr-4 text-xs text-gray-500 dark:text-gray-400">
            カラム情報は解析が完了すると表示されます。
          </div>
        )}
        {showColumns && (
          <ul className="space-y-1 py-2">
            {columns.map((column) => {
              const isColumnSelected = column === selectedColumn;
              return (
                <li key={`${node.path}:${column}`}>
                  <button
                    type="button"
                    onClick={() => handleSelectColumn(column)}
                    className={`ml-9 flex w-[calc(100%-2.25rem)] items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                      isColumnSelected
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    <IoStatsChartOutline size={14} />
                    <span className="truncate">{column}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  if (tree.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50/80 p-4 text-sm text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
        GIS対応ファイルが見つかりません。エクスプローラからGeoJSONやKMLなどのファイルを追加してください。
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50/80 dark:bg-gray-900/40">
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-800 dark:text-gray-300">
        GISデータ
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {tree.map((node) => (
          <div key={node.path}>{renderNode(node)}</div>
        ))}
      </div>
    </div>
  );
};

export default GisSidebar;
