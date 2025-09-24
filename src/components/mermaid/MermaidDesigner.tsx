'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactFlow, {
  Background,
  Connection,
  Controls,
  EdgeChange,
  MiniMap,
  NodeChange,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from 'reactflow';
import type { FitViewOptions, ReactFlowInstance, XYPosition } from 'reactflow';
import 'reactflow/dist/style.css';
import { IoAdd, IoAlertCircleOutline, IoCopy, IoTrash } from 'react-icons/io5';
import { useEditorStore } from '@/store/editorStore';
import {
  diagramDefinitions,
  diagramList,
  type MermaidEdgeTemplate,
  type MermaidFieldDefinition,
  type MermaidNodeTemplate,
} from '@/lib/mermaid/diagramDefinitions';
import { parseMermaidSource } from '@/lib/mermaid/parser';
import { serializeMermaid } from '@/lib/mermaid/serializer';
import type {
  MermaidDiagramConfig,
  MermaidDiagramType,
  MermaidEdge,
  MermaidGraphModel,
  MermaidNode,
} from '@/lib/mermaid/types';
import MermaidPreview from '@/components/preview/MermaidPreview';

export interface MermaidDesignerProps {
  tabId: string;
  fileName: string;
  content: string;
}

interface InspectorState {
  type: 'node' | 'edge';
  id: string;
}

interface CanvasContextMenuState {
  x: number;
  y: number;
  position: XYPosition;
}

const getDefaultEdgeVariant = (type: MermaidDiagramType): string => {
  const definition = diagramDefinitions[type];
  return definition.edgeTemplates[0]?.variant || 'arrow';
};

const toBooleanString = (value: boolean): string => (value ? 'true' : 'false');

const parseBoolean = (value: string | undefined): boolean => value === 'true';

const createEdgeId = (): string => `edge_${Date.now().toString(36)}`;

const useTabActions = () => {
  const updateTab = useEditorStore((state) => state.updateTab);
  const getTab = useEditorStore((state) => state.getTab);
  return { updateTab, getTab };
};

const buildModel = (
  type: MermaidDiagramType,
  config: MermaidDiagramConfig,
  nodes: MermaidNode[],
  edges: MermaidEdge[],
): MermaidGraphModel => ({
  type,
  config,
  nodes,
  edges,
  warnings: [],
});

const FieldInput: React.FC<{
  field: MermaidFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}> = ({ field, value, onChange }) => {
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
          rows={4}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'select':
      return (
        <select
          className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'boolean':
      return (
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={parseBoolean(value)}
            onChange={(event) => onChange(toBooleanString(event.target.checked))}
          />
          <span>{field.placeholder ?? '有効化'}</span>
        </label>
      );
    case 'number':
      return (
        <input
          type="number"
          className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'text':
    default:
      return (
        <input
          type="text"
          className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
};

const MermaidDesignerInner: React.FC<MermaidDesignerProps> = ({ tabId, fileName, content }) => {
  const { updateTab, getTab } = useTabActions();
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const [diagramType, setDiagramType] = useState<MermaidDiagramType>('flowchart');
  const [config, setConfig] = useState<MermaidDiagramConfig>(diagramDefinitions.flowchart.defaultConfig);
  const [nodes, setNodes] = useState<MermaidNode[]>([]);
  const [edges, setEdges] = useState<MermaidEdge[]>([]);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [inspector, setInspector] = useState<InspectorState | null>(null);
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState<boolean>(false);
  const [isDiagramTypeLocked, setIsDiagramTypeLocked] = useState<boolean>(false);
  const [edgeDraft, setEdgeDraft] = useState<{
    source: string;
    target: string;
    variant: string;
    label: string;
  }>({
    source: '',
    target: '',
    variant: '',
    label: '',
  });
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const lastSerializedRef = useRef<string>('');
  const lastHydratedTabIdRef = useRef<string | null>(null);
  const isHydrating = useRef<boolean>(false);
  const hasInitialized = useRef<boolean>(false);
  const hasLockedTypeRef = useRef<boolean>(false);

  const nodeTemplates = useMemo<MermaidNodeTemplate[]>(
    () => diagramDefinitions[diagramType].nodeTemplates,
    [diagramType],
  );

  const edgeTemplates = useMemo<MermaidEdgeTemplate[]>(
    () => diagramDefinitions[diagramType].edgeTemplates,
    [diagramType],
  );

  const configFields = useMemo<MermaidFieldDefinition[]>(
    () => diagramDefinitions[diagramType].configFields ?? [],
    [diagramType],
  );

  const refreshGeneratedCode = useCallback(() => {
    const model = buildModel(diagramType, config, nodes, edges);
    const { code, warnings: serializationWarnings } = serializeMermaid(model);
    setGeneratedCode(code);
    setWarnings(serializationWarnings);
    lastSerializedRef.current = code;
    const tab = getTab(tabId);
    if (tab) {
      const isDirty = tab.originalContent !== code;
      if (tab.content !== code || tab.isDirty !== isDirty) {
        updateTab(tabId, { content: code, isDirty });
      }
    }
  }, [diagramType, config, nodes, edges, getTab, tabId, updateTab]);

  const fitViewToDiagram = useCallback(
    (options?: FitViewOptions) => {
      const instance = reactFlowInstanceRef.current;
      if (!instance) return;
      instance.fitView({
        padding: 0.2,
        ...options,
      });
    },
    [],
  );

  useEffect(() => {
    hasLockedTypeRef.current = false;
    setIsDiagramTypeLocked(false);
  }, [tabId]);

  useEffect(() => {
    if (content === lastSerializedRef.current && lastHydratedTabIdRef.current === tabId) {
      return;
    }
    isHydrating.current = true;
    const parsed = parseMermaidSource(content);
    setDiagramType(parsed.type);
    setConfig(parsed.config);
    setNodes(parsed.nodes);
    setEdges(parsed.edges.map((edge) => ({ ...edge, label: edge.data.label })));
    setWarnings(parsed.warnings);
    const trimmed = content.trim();
    const shouldLockType = trimmed.length > 0 || parsed.nodes.length > 0 || parsed.edges.length > 0;
    if (shouldLockType) {
      hasLockedTypeRef.current = true;
    }
    setIsDiagramTypeLocked(hasLockedTypeRef.current);
    const { code } = serializeMermaid(parsed);
    setGeneratedCode(code);
    lastSerializedRef.current = code;
    lastHydratedTabIdRef.current = tabId;
    setInspector(null);
    setEdgeDraft({ source: '', target: '', variant: '', label: '' });
    hasInitialized.current = true;
    requestAnimationFrame(() => {
      isHydrating.current = false;
      fitViewToDiagram({ duration: 300 });
    });
  }, [content, tabId, fitViewToDiagram]);

  useEffect(() => {
    if (!hasInitialized.current) return;
    if (isHydrating.current) return;
    refreshGeneratedCode();
  }, [diagramType, config, nodes, edges, refreshGeneratedCode]);

  useEffect(() => {
    const defaultVariant = edgeTemplates[0]?.variant ?? getDefaultEdgeVariant(diagramType);
    setEdgeDraft((current) => ({
      source: current.source,
      target: current.target,
      variant: current.variant || defaultVariant,
      label: current.label,
    }));
  }, [diagramType, edgeTemplates]);

  useEffect(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    setEdgeDraft((current) => ({
      source: nodeIds.has(current.source) ? current.source : '',
      target: nodeIds.has(current.target) ? current.target : '',
      variant: current.variant,
      label: current.label,
    }));
  }, [nodes]);

  useEffect(() => {
    const handleWindowClick = (event: MouseEvent) => {
      if (event.button === 2) {
        return;
      }
      setContextMenu(null);
    };
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, []);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const variant = getDefaultEdgeVariant(diagramType);
      const template = edgeTemplates.find((item) => item.variant === variant) ?? edgeTemplates[0];
      const id = createEdgeId();
      const newEdge: MermaidEdge = {
        id,
        source: connection.source,
        target: connection.target,
        data: {
          diagramType,
          variant: template?.variant ?? variant,
          label: template?.defaultLabel,
          metadata: template?.defaultMetadata ? { ...template.defaultMetadata } : {},
        },
        label: template?.defaultLabel,
      };
      setEdges((current) => addEdge(newEdge, current));
      setInspector({ type: 'edge', id });
    },
    [diagramType, edgeTemplates],
  );

  const handleSelectionChange = useCallback((params: { nodes: MermaidNode[]; edges: MermaidEdge[] }) => {
    if (params.nodes.length > 0) {
      setInspector({ type: 'node', id: params.nodes[0].id });
    } else if (params.edges.length > 0) {
      setInspector({ type: 'edge', id: params.edges[0].id });
    } else {
      setInspector(null);
    }
  }, []);

  const handleAddNode = useCallback(
    (template: MermaidNodeTemplate, position?: XYPosition) => {
      const definition = diagramDefinitions[diagramType];
      const id = definition.createNodeId ? definition.createNodeId() : `node_${Date.now()}`;
      const newNode: MermaidNode = {
        id,
        type: 'default',
        position:
          position ?? {
            x: (nodes.length % 4) * 200 + 50,
            y: Math.floor(nodes.length / 4) * 150 + 40,
          },
        data: {
          diagramType,
          variant: template.variant,
          label: template.defaultLabel,
          metadata: template.defaultMetadata ? { ...template.defaultMetadata } : {},
        },
      };
      setNodes((current) => [...current, newNode]);
      setInspector({ type: 'node', id });
    },
    [diagramType, nodes.length],
  );

  const handleContextMenuAddNode = useCallback(
    (template: MermaidNodeTemplate) => {
      if (!contextMenu) return;
      handleAddNode(template, contextMenu.position);
      setContextMenu(null);
    },
    [contextMenu, handleAddNode],
  );

  const handleCanvasContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    if (!reactFlowInstanceRef.current || !flowWrapperRef.current) {
      return;
    }
    const bounds = flowWrapperRef.current.getBoundingClientRect();
    const projected = reactFlowInstanceRef.current.project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    setContextMenu({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      position: projected,
    });
  }, []);

  const handleCanvasMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button !== 2) {
      setContextMenu(null);
    }
  }, []);

  const updateNode = useCallback((nodeId: string, updater: (node: MermaidNode) => MermaidNode) => {
    setNodes((current) => current.map((node) => (node.id === nodeId ? updater(node) : node)));
  }, []);

  const updateEdge = useCallback((edgeId: string, updater: (edge: MermaidEdge) => MermaidEdge) => {
    setEdges((current) => current.map((edge) => (edge.id === edgeId ? updater(edge) : edge)));
  }, []);

  const handleAutoLayout = useCallback(() => {
    setNodes((currentNodes) => {
      if (currentNodes.length === 0) {
        return currentNodes;
      }

      const adjacency = new Map<string, Set<string>>();
      const indegree = new Map<string, number>();

      currentNodes.forEach((node) => {
        adjacency.set(node.id, new Set<string>());
        indegree.set(node.id, 0);
      });

      edges.forEach((edge) => {
        if (!adjacency.has(edge.source)) {
          adjacency.set(edge.source, new Set<string>());
        }
        adjacency.get(edge.source)?.add(edge.target);
        if (indegree.has(edge.target)) {
          indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
        }
      });

      const levels = new Map<string, number>();
      currentNodes.forEach((node) => {
        levels.set(node.id, 0);
      });

      const queue: string[] = [];
      const indegreeSnapshot = new Map(indegree);
      indegreeSnapshot.forEach((value, nodeId) => {
        if (value === 0) {
          queue.push(nodeId);
        }
      });

      const visited = new Set<string>();
      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        visited.add(nodeId);
        const baseLevel = levels.get(nodeId) ?? 0;
        const neighbors = adjacency.get(nodeId);
        neighbors?.forEach((targetId) => {
          const nextLevel = Math.max(levels.get(targetId) ?? 0, baseLevel + 1);
          levels.set(targetId, nextLevel);
          const nextIndegree = (indegreeSnapshot.get(targetId) ?? 0) - 1;
          indegreeSnapshot.set(targetId, nextIndegree);
          if (nextIndegree <= 0 && !visited.has(targetId)) {
            queue.push(targetId);
          }
        });
      }

      if (visited.size === 0) {
        currentNodes.forEach((node, index) => {
          levels.set(node.id, Math.floor(index / 4));
        });
      } else if (visited.size < currentNodes.length) {
        let maxLevel = 0;
        levels.forEach((value) => {
          maxLevel = Math.max(maxLevel, value);
        });
        const remaining = currentNodes.filter((node) => !visited.has(node.id));
        remaining.forEach((node, index) => {
          const additionalLevel = maxLevel + 1 + Math.floor(index / 4);
          levels.set(node.id, additionalLevel);
        });
      }

      const layerMap = new Map<number, string[]>();
      currentNodes.forEach((node) => {
        const level = levels.get(node.id) ?? 0;
        const entry = layerMap.get(level) ?? [];
        entry.push(node.id);
        layerMap.set(level, entry);
      });

      const horizontalSpacing = 220;
      const verticalSpacing = 180;
      const startX = 80;
      const startY = 40;

      const positionMap = new Map<string, { x: number; y: number }>();
      Array.from(layerMap.entries())
        .sort((a, b) => a[0] - b[0])
        .forEach(([layerIndex, nodeIds]) => {
          nodeIds.forEach((nodeId, index) => {
            positionMap.set(nodeId, {
              x: startX + index * horizontalSpacing,
              y: startY + layerIndex * verticalSpacing,
            });
          });
        });

      return currentNodes.map((node, index) => {
        const fallbackRow = Math.floor(index / 4);
        const fallbackPosition = {
          x: startX + (index % 4) * horizontalSpacing,
          y: startY + fallbackRow * verticalSpacing,
        };
        const target = positionMap.get(node.id) ?? fallbackPosition;
        return {
          ...node,
          position: target,
        };
      });
    });

    setTimeout(() => {
      fitViewToDiagram({ duration: 400 });
    }, 50);
  }, [edges, fitViewToDiagram]);

  const handleDiagramTypeChange = useCallback(
    (nextType: MermaidDiagramType) => {
      if (isDiagramTypeLocked) return;
      if (nextType === diagramType) return;
      let allowSwitch = true;
      if ((nodes.length > 0 || edges.length > 0) && typeof window !== 'undefined') {
        allowSwitch = window.confirm('図の種類を変更すると現在の図はクリアされます。続行しますか？');
      }
      if (!allowSwitch) return;
      const definition = diagramDefinitions[nextType];
      setDiagramType(nextType);
      setConfig(definition.defaultConfig);
      setNodes([]);
      setEdges([]);
      setWarnings([]);
      setInspector(null);
      setEdgeDraft({ source: '', target: '', variant: '', label: '' });
      hasLockedTypeRef.current = true;
      setIsDiagramTypeLocked(true);
    },
    [diagramType, edges.length, isDiagramTypeLocked, nodes.length],
  );

  const handleDeleteSelection = useCallback(() => {
    if (!inspector) return;
    if (inspector.type === 'node') {
      setNodes((current) => current.filter((node) => node.id !== inspector.id));
      setEdges((current) => current.filter((edge) => edge.source !== inspector.id && edge.target !== inspector.id));
      setEdgeDraft((current) => ({
        source: current.source === inspector.id ? '' : current.source,
        target: current.target === inspector.id ? '' : current.target,
        variant: current.variant,
        label: current.label,
      }));
    } else {
      setEdges((current) => current.filter((edge) => edge.id !== inspector.id));
    }
    setInspector(null);
  }, [inspector]);

  const handleCopyCode = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(generatedCode).catch(() => {
        // ignore copy failure
      });
    }
  }, [generatedCode]);

  const handleAddEdge = useCallback(() => {
    if (!edgeDraft.source || !edgeDraft.target) {
      if (typeof window !== 'undefined') {
        window.alert('接続元と接続先を選択してください。');
      }
      return;
    }
    const variant = edgeDraft.variant || getDefaultEdgeVariant(diagramType);
    const template = edgeTemplates.find((item) => item.variant === variant);
    const id = createEdgeId();
    const newEdge: MermaidEdge = {
      id,
      source: edgeDraft.source,
      target: edgeDraft.target,
      data: {
        diagramType,
        variant,
        label: edgeDraft.label || template?.defaultLabel,
        metadata: template?.defaultMetadata ? { ...template.defaultMetadata } : {},
      },
      label: edgeDraft.label || template?.defaultLabel,
    };
    setEdges((current) => [...current, newEdge]);
    setInspector({ type: 'edge', id });
    setEdgeDraft((current) => ({
      source: current.source,
      target: current.target,
      variant: current.variant || variant,
      label: '',
    }));
  }, [diagramType, edgeDraft, edgeTemplates]);

  const selectedNode = useMemo(
    () => nodes.find((node) => inspector?.type === 'node' && node.id === inspector.id),
    [inspector, nodes],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => inspector?.type === 'edge' && edge.id === inspector.id),
    [inspector, edges],
  );

  const selectedNodeTemplate = useMemo(() => {
    if (!selectedNode) return undefined;
    return nodeTemplates.find((template) => template.variant === selectedNode.data.variant);
  }, [selectedNode, nodeTemplates]);

  const selectedEdgeTemplate = useMemo(() => {
    if (!selectedEdge) return undefined;
    return edgeTemplates.find((template) => template.variant === selectedEdge.data.variant);
  }, [selectedEdge, edgeTemplates]);

  const paletteClasses = isPaletteCollapsed ? 'w-12' : 'w-36';
  const canAddEdge = nodes.length >= 2;

  const renderNodeInspector = () => {
    if (!selectedNode) {
      return <p className="text-sm text-gray-500">ノードを選択すると詳細を編集できます。</p>;
    }
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500">ノード種別</label>
          <select
            className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
            value={selectedNode.data.variant}
            onChange={(event) => {
              const nextVariant = event.target.value;
              const template = nodeTemplates.find((item) => item.variant === nextVariant);
              updateNode(selectedNode.id, (node) => ({
                ...node,
                data: {
                  ...node.data,
                  variant: nextVariant,
                  label: template ? template.defaultLabel : node.data.label,
                  metadata: template?.defaultMetadata ? { ...template.defaultMetadata } : {},
                },
              }));
            }}
          >
            {nodeTemplates.map((template) => (
              <option key={template.variant} value={template.variant}>
                {template.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">ラベル</label>
          <input
            type="text"
            className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
            value={selectedNode.data.label}
            onChange={(event) => {
              const value = event.target.value;
              updateNode(selectedNode.id, (node) => ({
                ...node,
                data: { ...node.data, label: value },
              }));
            }}
          />
        </div>
        {selectedNodeTemplate?.fields?.map((field) => {
          const value = selectedNode.data.metadata?.[field.key] ?? '';
          return (
            <div key={field.key}>
              <label className="block text-xs text-gray-500">{field.label}</label>
              <FieldInput
                field={field}
                value={value}
                onChange={(newValue) => {
                  updateNode(selectedNode.id, (node) => ({
                    ...node,
                    data: {
                      ...node.data,
                      metadata: { ...node.data.metadata, [field.key]: newValue },
                    },
                  }));
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const renderEdgeInspector = () => {
    if (!selectedEdge) {
      return <p className="text-sm text-gray-500">エッジを選択すると詳細を編集できます。</p>;
    }
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500">エッジ種別</label>
          <select
            className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
            value={selectedEdge.data.variant}
            onChange={(event) => {
              const nextVariant = event.target.value;
              const template = edgeTemplates.find((item) => item.variant === nextVariant);
              updateEdge(selectedEdge.id, (edge) => ({
                ...edge,
                data: {
                  ...edge.data,
                  variant: nextVariant,
                  label: template?.defaultLabel,
                  metadata: template?.defaultMetadata ? { ...template.defaultMetadata } : {},
                },
                label: template?.defaultLabel,
              }));
            }}
          >
            {edgeTemplates.map((template) => (
              <option key={template.variant} value={template.variant}>
                {template.label}
              </option>
            ))}
          </select>
        </div>
        {selectedEdgeTemplate?.fields?.map((field) => {
          const value = selectedEdge.data.metadata?.[field.key] ?? selectedEdge.data.label ?? '';
          return (
            <div key={field.key}>
              <label className="block text-xs text-gray-500">{field.label}</label>
              <FieldInput
                field={field}
                value={value}
                onChange={(newValue) => {
                  updateEdge(selectedEdge.id, (edge) => ({
                    ...edge,
                    data: {
                      ...edge.data,
                      label: field.key === 'label' ? newValue : edge.data.label,
                      metadata: { ...edge.data.metadata, [field.key]: newValue },
                    },
                    label: field.key === 'label' ? newValue : edge.label,
                  }));
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-full flex">
      <aside className={`flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 transition-all duration-200 ${paletteClasses}`}>
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">図の種類</label>
            <button
              type="button"
              className="text-xs text-blue-600"
              onClick={() => setIsPaletteCollapsed((prev) => !prev)}
            >
              {isPaletteCollapsed ? '展開' : '折りたたむ'}
            </button>
          </div>
          {!isPaletteCollapsed && (
            <div className="space-y-1">
              <select
                className={`w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm ${
                  isDiagramTypeLocked
                    ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed text-gray-500 dark:text-gray-400'
                    : 'bg-white dark:bg-gray-900'
                }`}
                value={diagramType}
                onChange={(event) => handleDiagramTypeChange(event.target.value as MermaidDiagramType)}
                disabled={isDiagramTypeLocked}
              >
                {diagramList.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.label}
                  </option>
                ))}
              </select>
              {isDiagramTypeLocked && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  図の種類は一度選択すると変更できません。
                </p>
              )}
            </div>
          )}
          {!isPaletteCollapsed && (
            <div>
              <p className="text-xs text-gray-500 mb-2">ノードを追加</p>
              <div className="space-y-2">
                {nodeTemplates.map((template) => (
                  <button
                    key={template.variant}
                    type="button"
                    className="w-full flex items-center justify-between px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleAddNode(template)}
                  >
                    <span>{template.label}</span>
                    <IoAdd />
                  </button>
                ))}
              </div>
            </div>
          )}
          {!isPaletteCollapsed && edgeTemplates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">接続を追加</p>
              <select
                className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
                value={edgeDraft.source}
                onChange={(event) => setEdgeDraft((current) => ({ ...current, source: event.target.value }))}
              >
                <option value="">接続元を選択</option>
                {nodes.map((node) => (
                  <option key={`source-${node.id}`} value={node.id}>
                    {node.data.label || node.id}
                  </option>
                ))}
              </select>
              <select
                className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
                value={edgeDraft.target}
                onChange={(event) => setEdgeDraft((current) => ({ ...current, target: event.target.value }))}
              >
                <option value="">接続先を選択</option>
                {nodes.map((node) => (
                  <option key={`target-${node.id}`} value={node.id}>
                    {node.data.label || node.id}
                  </option>
                ))}
              </select>
              <select
                className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
                value={edgeDraft.variant}
                onChange={(event) => setEdgeDraft((current) => ({ ...current, variant: event.target.value }))}
              >
                {edgeTemplates.map((template) => (
                  <option key={template.variant} value={template.variant}>
                    {template.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
                placeholder="ラベル (任意)"
                value={edgeDraft.label}
                onChange={(event) => setEdgeDraft((current) => ({ ...current, label: event.target.value }))}
              />
              <button
                type="button"
                className={`w-full flex items-center justify-center px-2 py-1 rounded text-sm ${canAddEdge ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                onClick={handleAddEdge}
                disabled={!canAddEdge}
              >
                <IoAdd className="mr-1" /> 接続を追加
              </button>
              {!canAddEdge && (
                <p className="text-[11px] text-gray-500">接続を作成するには2つ以上のノードが必要です。</p>
              )}
            </div>
          )}
          {!isPaletteCollapsed && edgeTemplates.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">接続種別一覧</p>
              <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                {edgeTemplates.map((template) => (
                  <li key={`summary-${template.variant}`}>{template.label}</li>
                ))}
              </ul>
            </div>
          )}
          {!isPaletteCollapsed && configFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">図の設定</p>
              {configFields.map((field) => {
                const value = (config as any)[field.key]?.toString?.() ?? '';
                return (
                  <div key={field.key}>
                    <label className="block text-xs text-gray-500">{field.label}</label>
                    <FieldInput
                      field={field}
                      value={value}
                      onChange={(newValue) => {
                        setConfig((current) => ({
                          ...(current as any),
                          [field.key]: field.type === 'boolean' ? newValue === 'true' : field.type === 'number' ? Number(newValue) : newValue,
                        }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col bg-white dark:bg-gray-950">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">キャンバス</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1 text-xs rounded border border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950"
              onClick={handleAutoLayout}
            >
              自動整列
            </button>
            <button
              type="button"
              className="px-3 py-1 text-xs rounded border border-gray-400 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={() => fitViewToDiagram({ duration: 300 })}
            >
              全体表示
            </button>
          </div>
        </div>
        <div
          ref={flowWrapperRef}
          className="relative flex-1 min-h-0 border-b border-gray-200 dark:border-gray-800"
          onContextMenu={handleCanvasContextMenu}
          onMouseDown={handleCanvasMouseDown}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onSelectionChange={handleSelectionChange}
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance;
              fitViewToDiagram();
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
          {contextMenu && (
            <div
              className="absolute z-50 min-w-[160px] rounded border border-gray-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <p className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-300">ノードの追加</p>
              <div className="max-h-60 overflow-y-auto">
                {nodeTemplates.map((template) => (
                  <button
                    key={template.variant}
                    type="button"
                    className="flex w-full items-center px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
                    onClick={() => handleContextMenuAddNode(template)}
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <aside className="w-96 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">プロパティ</h3>
            <button
              type="button"
              className="flex items-center text-xs text-red-600 disabled:text-gray-400"
              onClick={handleDeleteSelection}
              disabled={!inspector}
            >
              <IoTrash className="mr-1" /> 削除
            </button>
          </div>
          {inspector?.type === 'node' ? renderNodeInspector() : inspector?.type === 'edge' ? renderEdgeInspector() : (
            <p className="text-sm text-gray-500">ノードまたはエッジを選択してください。</p>
          )}
          {warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 text-yellow-700 rounded p-2 text-xs space-y-1">
              <div className="flex items-center font-semibold">
                <IoAlertCircleOutline className="mr-1" /> Mermaid変換警告
              </div>
              <ul className="list-disc list-inside space-y-1">
                {warnings.map((warning, index) => (
                  <li key={`warning-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Mermaid記法</h3>
              <button
                type="button"
                className="flex items-center text-xs text-blue-600"
                onClick={handleCopyCode}
              >
                <IoCopy className="mr-1" /> コピー
              </button>
            </div>
            <textarea
              className="w-full h-40 border border-gray-300 dark:border-gray-700 rounded p-2 text-xs font-mono bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
              value={generatedCode}
              readOnly
            />
          </div>
          <div className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
            <MermaidPreview content={generatedCode} fileName={fileName} />
          </div>
        </div>
      </aside>
    </div>
  );
};

const MermaidDesigner: React.FC<MermaidDesignerProps> = (props) => (
  <ReactFlowProvider>
    <MermaidDesignerInner {...props} />
  </ReactFlowProvider>
);

export default MermaidDesigner;
