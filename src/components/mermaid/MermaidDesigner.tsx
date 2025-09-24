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
  MarkerType,
  MiniMap,
  NodeChange,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
} from 'reactflow';
import type { FitViewOptions, ReactFlowInstance, XYPosition } from 'reactflow';
import 'reactflow/dist/style.css';
import { IoAlertCircleOutline, IoTrash } from 'react-icons/io5';
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
  MermaidSubgraph,
} from '@/lib/mermaid/types';
import MermaidPreview from '@/components/preview/MermaidPreview';
import InteractiveMermaidCanvas from './InteractiveMermaidCanvas';
import GroupOverlays from './GroupOverlays';
import MermaidEdgeComponent from './MermaidEdge';

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

interface EdgeDraft {
  source: string;
  target: string;
  variant: string;
  label: string;
}

const getDefaultEdgeVariant = (type: MermaidDiagramType): string => {
  const definition = diagramDefinitions[type];
  return definition.edgeTemplates[0]?.variant || 'arrow';
};

const toBooleanString = (value: boolean): string => (value ? 'true' : 'false');

const parseBoolean = (value: string | undefined): boolean => value === 'true';

const createEdgeId = (): string => `edge_${Date.now().toString(36)}`;

const PERSISTENT_METADATA_KEYS = ['sequence', 'command'];

const MERMAID_EDGE_TYPE = 'mermaid-edge';

const expandShortHex = (value: string): string =>
  `#${value
    .slice(1)
    .split('')
    .map((char) => char + char)
    .join('')}`;

const toHexColor = (value: string | undefined, fallback: string): string => {
  if (!value) return fallback;
  let normalized = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    normalized = expandShortHex(normalized.toLowerCase());
  }
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }
  return fallback;
};

const sanitizeColorValue = (value: string): string => {
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return expandShortHex(value.toLowerCase());
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return value;
};

const cloneNodeList = (nodes: MermaidNode[]): MermaidNode[] =>
  nodes.map(node => ({
    ...node,
    position: node.position ? { ...node.position } : node.position,
    positionAbsolute: node.positionAbsolute ? { ...node.positionAbsolute } : node.positionAbsolute,
    style: node.style ? { ...node.style } : node.style,
    data: {
      ...node.data,
      metadata: node.data.metadata ? { ...node.data.metadata } : undefined,
    },
  }));

const cloneEdgeList = (edges: MermaidEdge[]): MermaidEdge[] =>
  edges.map(edge => ({
    ...edge,
    style: edge.style ? { ...edge.style } : edge.style,
    markerEnd: edge.markerEnd ? { ...edge.markerEnd } : edge.markerEnd,
    data: {
      ...edge.data,
      metadata: edge.data.metadata ? { ...edge.data.metadata } : undefined,
    },
  }));

interface Snapshot {
  diagramType: MermaidDiagramType;
  config: MermaidDiagramConfig;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  subgraphs: MermaidSubgraph[];
  ganttSections: string[];
}

const getNodeTemplateDefaults = (diagramType: MermaidDiagramType, variant: string) => {
  const templates = diagramDefinitions[diagramType]?.nodeTemplates;
  const template = templates?.find((item) => item.variant === variant);
  return template?.defaultMetadata ?? {};
};

const getEdgeTemplateDefaults = (diagramType: MermaidDiagramType, variant: string) => {
  const templates = diagramDefinitions[diagramType]?.edgeTemplates;
  const template = templates?.find((item) => item.variant === variant);
  return template?.defaultMetadata ?? {};
};

const applyNodeDefaults = (node: MermaidNode, fallbackDiagramType?: MermaidDiagramType): MermaidNode => {
  const diagramType = (node.data.diagramType as MermaidDiagramType) || fallbackDiagramType || 'flowchart';
  const defaultMetadata = getNodeTemplateDefaults(diagramType, node.data.variant);
  const metadata = { ...defaultMetadata, ...(node.data.metadata || {}) };
  const fillColor = metadata.fillColor ? sanitizeColorValue(metadata.fillColor) : '#ffffff';
  const strokeColor = metadata.strokeColor ? sanitizeColorValue(metadata.strokeColor) : '#1f2937';
  const textColor = metadata.textColor ? sanitizeColorValue(metadata.textColor) : '#111827';

  return {
    ...node,
    data: {
      ...node.data,
      metadata,
    },
    style: {
      ...node.style,
      background: fillColor,
      border: `2px solid ${strokeColor}`,
      color: textColor,
    },
  };
};

const normalizeEdges = (edgeList: MermaidEdge[]): MermaidEdge[] => {
  if (!Array.isArray(edgeList) || edgeList.length === 0) {
    return [];
  }

  const edgesWithIds = edgeList.map((edge, index) => ({
    edge,
    id: edge.id ?? `edge_auto_${index}`,
  }));

  const pairMap = new Map<string, string[]>();
  edgesWithIds.forEach(({ edge, id }) => {
    const key = `${edge.source ?? ''}__${edge.target ?? ''}`;
    const existing = pairMap.get(key);
    if (existing) {
      existing.push(id);
    } else {
      pairMap.set(key, [id]);
    }
  });

  const metaMap = new Map<string, { index: number; count: number }>();
  pairMap.forEach((ids) => {
    ids.forEach((edgeId, index) => {
      metaMap.set(edgeId, { index, count: ids.length });
    });
  });

  return edgesWithIds.map(({ edge, id }) => {
    const meta = metaMap.get(id);
    const parallelCount = meta?.count ?? 1;
    const parallelIndex = meta && parallelCount > 1 ? meta.index : 0;
    const normalizedLabel = edge.data?.label ?? edge.label;
    const diagramType = (edge.data?.diagramType as MermaidDiagramType) || 'flowchart';
    const defaultMetadata = getEdgeTemplateDefaults(diagramType, edge.data?.variant ?? '');
    const metadata = { ...defaultMetadata, ...(edge.data?.metadata ?? {}) };
    const strokeColor = metadata.strokeColor ? sanitizeColorValue(metadata.strokeColor) : '#1f2937';
    const fillColor = metadata.fillColor ? sanitizeColorValue(metadata.fillColor) : undefined;
    const textColor = metadata.textColor ? sanitizeColorValue(metadata.textColor) : undefined;
    if (fillColor) {
      metadata.fillColor = fillColor;
    }
    if (textColor) {
      metadata.textColor = textColor;
    }
    metadata.strokeColor = strokeColor;

    const baseStyle = {
      stroke: strokeColor,
      strokeWidth: edge.data?.variant === 'thick' ? 2.6 : 1.6,
    } as const;

    return {
      ...edge,
      id,
      type: edge.type ?? MERMAID_EDGE_TYPE,
      label: normalizedLabel,
      data: {
        ...edge.data,
        label: normalizedLabel,
        parallelIndex,
        parallelCount,
        metadata,
      },
      markerEnd:
        edge.markerEnd ??
        ({
          type: MarkerType.ArrowClosed,
          width: 18,
          height: 18,
          color: strokeColor,
        } as const),
      style: edge.style ? { ...baseStyle, ...edge.style } : { ...baseStyle },
      updatable: true,
    };
  });
};

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
  subgraphs: MermaidSubgraph[],
): MermaidGraphModel => ({
  type,
  config,
  nodes,
  edges,
  warnings: [],
  subgraphs,
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

const MermaidDesigner: React.FC<MermaidDesignerProps> = ({ tabId, fileName, content }) => {
  const { updateTab, getTab } = useTabActions();
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const [diagramType, setDiagramType] = useState<MermaidDiagramType>('flowchart');
  const [config, setConfig] = useState<MermaidDiagramConfig>(diagramDefinitions.flowchart.defaultConfig);
  const [nodes, setNodes] = useState<MermaidNode[]>([]);
  const [edges, setEdgesState] = useState<MermaidEdge[]>([]);
  const [subgraphs, setSubgraphs] = useState<MermaidSubgraph[]>([]);
  const [ganttSections, setGanttSections] = useState<string[]>(['General']);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [inspector, setInspector] = useState<InspectorState | null>(null);
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const [, setEdgeDraft] = useState<EdgeDraft>({
    source: '',
    target: '',
    variant: '',
    label: '',
  });
  const lastSerializedRef = useRef<string>('');
  const lastHydratedTabIdRef = useRef<string | null>(null);
  const isHydrating = useRef<boolean>(false);
  const hasInitialized = useRef<boolean>(false);
  const isRestoring = useRef<boolean>(false);
  const historyRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const suppressHistoryRef = useRef<number>(0);
  const hasPendingSyncRef = useRef<boolean>(false);

  const beginSuppressHistory = () => {
    suppressHistoryRef.current += 1;
  };

  const endSuppressHistory = () => {
    suppressHistoryRef.current = Math.max(0, suppressHistoryRef.current - 1);
  };

  const runWithSuppressedHistory = (action: () => void) => {
    beginSuppressHistory();
    try {
      action();
    } finally {
      queueMicrotask(() => {
        endSuppressHistory();
      });
    }
  };

  const createSnapshot = useCallback((): Snapshot => ({
    diagramType,
    config: JSON.parse(JSON.stringify(config)) as MermaidDiagramConfig,
    nodes: cloneNodeList(nodes),
    edges: cloneEdgeList(edges),
    subgraphs: subgraphs.map(subgraph => ({ ...subgraph, nodes: [...subgraph.nodes] })),
    ganttSections: [...ganttSections],
  }), [diagramType, config, nodes, edges, subgraphs, ganttSections]);

  const recordHistory = useCallback(() => {
    if (isRestoring.current) return;
    hasPendingSyncRef.current = true;
    historyRef.current.push(createSnapshot());
    if (historyRef.current.length > 100) {
      historyRef.current.shift();
    }
    futureRef.current = [];
  }, [createSnapshot]);

  const restoreSnapshot = useCallback((snapshot: Snapshot) => {
    isRestoring.current = true;
    hasPendingSyncRef.current = true;
    setDiagramType(snapshot.diagramType);
    setConfig(snapshot.config);
    setNodes(snapshot.nodes);
    setEdgesState(snapshot.edges);
    setSubgraphs(snapshot.subgraphs);
    setGanttSections(snapshot.ganttSections);
    requestAnimationFrame(() => {
      isRestoring.current = false;
    });
  }, []);

  const undo = useCallback(() => {
    if (!historyRef.current.length) return;
    const previous = historyRef.current.pop()!;
    futureRef.current.push(createSnapshot());
    restoreSnapshot(previous);
  }, [createSnapshot, restoreSnapshot]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(createSnapshot());
    restoreSnapshot(next);
  }, [createSnapshot, restoreSnapshot]);

  const updateEdges = useCallback(
    (updater: React.SetStateAction<MermaidEdge[]>) => {
      setEdgesState((current) => {
        const next =
          typeof updater === 'function' ? (updater as (prev: MermaidEdge[]) => MermaidEdge[])(current) : updater;
        return normalizeEdges(Array.isArray(next) ? next : []);
      });
    },
    [],
  );

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

  const supportsEdges = useMemo(() => diagramDefinitions[diagramType].supportsEdges, [diagramType]);

  const refreshGeneratedCode = useCallback(() => {
    const model = buildModel(diagramType, config, nodes, edges, subgraphs);
    const { code, warnings: serializationWarnings } = serializeMermaid(model);
    setGeneratedCode(code);
    setWarnings(serializationWarnings);
    lastSerializedRef.current = code;
    if (hasPendingSyncRef.current) {
      const tab = getTab(tabId);
      if (tab) {
        const isDirty = tab.originalContent !== code;
        if (tab.content !== code || tab.isDirty !== isDirty) {
          updateTab(tabId, { content: code, isDirty });
        }
      }
      hasPendingSyncRef.current = false;
      lastHydratedTabIdRef.current = tabId;
    }
  }, [diagramType, config, nodes, edges, subgraphs, getTab, tabId, updateTab]);

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
    if (content === lastSerializedRef.current && lastHydratedTabIdRef.current === tabId) {
      return;
    }

    isHydrating.current = true;
    const parsed = parseMermaidSource(content);
    const hydratedNodes = parsed.nodes.map((node) => applyNodeDefaults(node, parsed.type));
    const normalizedEdges = normalizeEdges(
      parsed.edges.map((edge) => ({
        ...edge,
        label: edge.data.label,
      })),
    );
    const parsedSubgraphs = (parsed.subgraphs ?? []).map((subgraph) => ({
      ...subgraph,
      nodes: [...subgraph.nodes],
    }));
    const nextGanttSections = (() => {
      if (parsed.type !== 'gantt') {
        return ['General'];
      }
      const sectionSet = new Set<string>(['General']);
      hydratedNodes.forEach((node) => {
        const section = node.data.metadata?.section;
        if (section) {
          sectionSet.add(section);
        }
      });
      return Array.from(sectionSet);
    })();

    setDiagramType(parsed.type);
    setConfig(parsed.config);
    setNodes(hydratedNodes);
    setEdgesState(normalizedEdges);
    setSubgraphs(parsedSubgraphs);
    setGanttSections(nextGanttSections);
    setWarnings(parsed.warnings);

    const model = buildModel(parsed.type, parsed.config, hydratedNodes, normalizedEdges, parsedSubgraphs);
    const { code } = serializeMermaid(model);
    setGeneratedCode(code);
    lastSerializedRef.current = code;
    lastHydratedTabIdRef.current = tabId;
    hasPendingSyncRef.current = false;
    setInspector(null);
    const firstEdgeTemplate = diagramDefinitions[parsed.type].edgeTemplates[0];
    setEdgeDraft({
      source: '',
      target: '',
      variant: firstEdgeTemplate?.variant ?? '',
      label: firstEdgeTemplate?.defaultLabel ?? '',
    });
    hasInitialized.current = true;

    requestAnimationFrame(() => {
      isHydrating.current = false;
      fitViewToDiagram({ duration: 300 });
      requestAnimationFrame(() => {
        const initialSnapshot: Snapshot = {
          diagramType: parsed.type,
          config: JSON.parse(JSON.stringify(parsed.config)) as MermaidDiagramConfig,
          nodes: cloneNodeList(hydratedNodes),
          edges: cloneEdgeList(normalizedEdges),
          subgraphs: parsedSubgraphs.map((subgraph) => ({ ...subgraph, nodes: [...subgraph.nodes] })),
          ganttSections: [...nextGanttSections],
        };
        historyRef.current = [initialSnapshot];
        futureRef.current = [];
        hasPendingSyncRef.current = false;
      });
    });
  }, [content, tabId, fitViewToDiagram]);

  useEffect(() => {
    if (!hasInitialized.current) return;
    if (isHydrating.current) return;
    refreshGeneratedCode();
  }, [diagramType, config, nodes, edges, subgraphs, refreshGeneratedCode]);

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

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (isRestoring.current) {
        return;
      }
      const shouldRecord = changes.some(change => {
        switch (change.type) {
          case 'add':
          case 'remove':
            return true;
          case 'position':
            return !(change as any).dragging;
          default:
            return false;
        }
      });
      if (suppressHistoryRef.current <= 0 && shouldRecord) {
        recordHistory();
      }
      setNodes((current) =>
        applyNodeChanges(changes, current).map(node => applyNodeDefaults(node, diagramType)),
      );
    },
    [diagramType, recordHistory],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isRestoring.current) {
        return;
      }
      const shouldRecord = changes.some(change => change.type === 'remove' || change.type === 'add');
      if (suppressHistoryRef.current <= 0 && shouldRecord) {
        recordHistory();
      }
      updateEdges((current) => applyEdgeChanges(changes, current));
    },
    [recordHistory, updateEdges],
  );

  const handleEdgeUpdate = useCallback(
    (oldEdge: MermaidEdge, newConnection: Connection) => {
      if (!newConnection.source || !newConnection.target) {
        return;
      }
      recordHistory();
      runWithSuppressedHistory(() => {
        updateEdges((current) =>
          current.map((edge) =>
            edge.id === oldEdge.id
              ? {
                  ...edge,
                  source: newConnection.source,
                  target: newConnection.target,
                }
              : edge,
          ),
        );
      });
    },
    [recordHistory, updateEdges],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!supportsEdges || edgeTemplates.length === 0) return;
      if (!connection.source || !connection.target) return;
      recordHistory();
      const variant = getDefaultEdgeVariant(diagramType);
      const template = edgeTemplates.find((item) => item.variant === variant) ?? edgeTemplates[0];
      const id = createEdgeId();
      runWithSuppressedHistory(() => {
        updateEdges((current) => {
        const existing = current.filter(
          (edge) => edge.source === connection.source && edge.target === connection.target,
        );
        const baseLabel = template?.defaultLabel ?? '';
        const automaticLabel = baseLabel
          ? existing.length > 0
            ? `${baseLabel} ${existing.length + 1}`
            : baseLabel
          : undefined;

        const newEdge: MermaidEdge = {
          id,
          type: MERMAID_EDGE_TYPE,
          source: connection.source,
          target: connection.target,
          data: {
            diagramType,
            variant: template?.variant ?? variant,
            label: automaticLabel,
            metadata: template?.defaultMetadata ? { ...template.defaultMetadata } : {},
          },
          label: automaticLabel,
        };

        return [...current, newEdge];
        });
      });
      setInspector({ type: 'edge', id });
    },
    [diagramType, edgeTemplates, recordHistory, supportsEdges, updateEdges],
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
      recordHistory();
      const definition = diagramDefinitions[diagramType];
      const id = definition.createNodeId ? definition.createNodeId() : `node_${Date.now()}`;
      runWithSuppressedHistory(() => {
        setNodes((current) => {
          const baseMetadata = template.defaultMetadata ? { ...template.defaultMetadata } : {};
          if (diagramType === 'gitGraph') {
            const sequenceValues = current
              .map((node) => Number(node.data.metadata?.sequence))
              .filter((value) => Number.isFinite(value));
            const nextSequence = sequenceValues.length > 0 ? Math.max(...sequenceValues) + 1 : 0;
            baseMetadata.sequence = nextSequence.toString();
            if ((template.variant === 'commit' || template.variant === 'merge') && !baseMetadata.type) {
              baseMetadata.type = 'NORMAL';
            }
          }
          if (diagramType === 'gantt') {
            const fallbackSection = ganttSections[0] ?? 'General';
            baseMetadata.section = fallbackSection;
          }

          const defaultPosition =
            position ?? {
              x: (current.length % 4) * 200 + 50,
              y: Math.floor(current.length / 4) * 150 + 40,
            };

          const newNode: MermaidNode = {
            id,
            type: 'default',
            position: defaultPosition,
            data: {
              diagramType,
              variant: template.variant,
              label: template.defaultLabel,
              metadata: baseMetadata,
            },
          };

          return [...current, applyNodeDefaults(newNode, diagramType)];
        });
      });
      setInspector({ type: 'node', id });
    },
    [diagramType, ganttSections, recordHistory],
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

  const updateNode = useCallback(
    (nodeId: string, updater: (node: MermaidNode) => MermaidNode) => {
      recordHistory();
      runWithSuppressedHistory(() => {
        setNodes((current) =>
          current.map((node) => (node.id === nodeId ? applyNodeDefaults(updater(node), diagramType) : node)),
        );
      });
    },
    [diagramType, recordHistory],
  );

  const updateEdge = useCallback(
    (edgeId: string, updater: (edge: MermaidEdge) => MermaidEdge) => {
      recordHistory();
      runWithSuppressedHistory(() => {
        updateEdges((current) => current.map((edge) => (edge.id === edgeId ? updater(edge) : edge)));
      });
    },
    [recordHistory, updateEdges],
  );

  const addSubgraph = useCallback(() => {
    recordHistory();
    const newId = `subgraph_${Date.now().toString(36)}`;
    setSubgraphs((current) => [
      ...current,
      {
        id: newId,
        title: '新しいサブグラフ',
        nodes: [],
      },
    ]);
  }, [recordHistory]);

  const updateSubgraphTitle = useCallback(
    (subgraphId: string, title: string) => {
      const trimmed = title.trim();
      const target = subgraphs.find((subgraph) => subgraph.id === subgraphId);
      if (!target || target.title === trimmed) {
        return;
      }
      recordHistory();
      setSubgraphs((current) =>
        current.map((subgraph) => (subgraph.id === subgraphId ? { ...subgraph, title: trimmed } : subgraph)),
      );
    },
    [recordHistory, subgraphs],
  );

  const removeSubgraph = useCallback(
    (subgraphId: string) => {
      const exists = subgraphs.some((subgraph) => subgraph.id === subgraphId);
      if (!exists) return;
      recordHistory();
      setSubgraphs((current) => current.filter((subgraph) => subgraph.id !== subgraphId));
      runWithSuppressedHistory(() => {
        setNodes((current) =>
          current.map((node) => {
            if (node.data.metadata?.subgraphId !== subgraphId) {
              return node;
            }
            const nextMetadata = { ...(node.data.metadata || {}) };
            delete nextMetadata.subgraphId;
            return applyNodeDefaults(
              {
                ...node,
                data: {
                  ...node.data,
                  metadata: nextMetadata,
                },
              },
              diagramType,
            );
          }),
        );
      });
    },
    [diagramType, recordHistory, subgraphs],
  );

  const assignNodeToSubgraph = useCallback(
    (nodeId: string, subgraphId: string | null) => {
      const targetNode = nodes.find((node) => node.id === nodeId);
      const currentId = targetNode?.data.metadata?.subgraphId ?? null;
      if (!targetNode || currentId === subgraphId) {
        return;
      }
      recordHistory();
      runWithSuppressedHistory(() => {
        setNodes((current) =>
          current.map((node) => {
            if (node.id !== nodeId) {
              return node;
            }
            const nextMetadata = { ...(node.data.metadata || {}) };
            if (subgraphId) {
              nextMetadata.subgraphId = subgraphId;
            } else {
              delete nextMetadata.subgraphId;
            }
            return applyNodeDefaults(
              {
                ...node,
                data: {
                  ...node.data,
                  metadata: nextMetadata,
                },
              },
              diagramType,
            );
          }),
        );
      });

      setSubgraphs((current) =>
        current.map((subgraph) => {
          const filtered = subgraph.nodes.filter((id) => id !== nodeId);
          if (subgraphId && subgraph.id === subgraphId) {
            return {
              ...subgraph,
              nodes: filtered.includes(nodeId) ? filtered : [...filtered, nodeId],
            };
          }
          return {
            ...subgraph,
            nodes: filtered,
          };
        }),
      );
    },
    [diagramType, nodes, recordHistory],
  );

  const addGanttSection = useCallback(() => {
    recordHistory();
    setGanttSections((current) => {
      const baseName = `Section ${current.length + 1}`;
      let candidate = baseName;
      let counter = 1;
      while (current.includes(candidate)) {
        counter += 1;
        candidate = `${baseName} ${counter}`;
      }
      return [...current, candidate];
    });
  }, [recordHistory]);

  const updateGanttSection = useCallback(
    (index: number, name: string) => {
      if (index < 0 || index >= ganttSections.length) return;
      const trimmed = name.trim();
      const currentName = ganttSections[index];
      const nextName = trimmed || currentName;
      if (currentName === nextName) {
        return;
      }
      if (ganttSections.includes(nextName) && nextName !== currentName) {
        return;
      }
      recordHistory();
      setGanttSections((current) => {
        const nextSections = current.map((section, i) => (i === index ? nextName : section));
        runWithSuppressedHistory(() => {
          setNodes((nodesList) =>
            nodesList.map((node) => {
              if (node.data.diagramType !== 'gantt') {
                return node;
              }
              const metadata = { ...(node.data.metadata || {}) };
              if (metadata.section === currentName) {
                metadata.section = nextName;
                return applyNodeDefaults(
                  {
                    ...node,
                    data: { ...node.data, metadata },
                  },
                  'gantt',
                );
              }
              return node;
            }),
          );
        });
        return nextSections;
      });
    },
    [ganttSections, recordHistory],
  );

  const removeGanttSection = useCallback((index: number) => {
    if (index < 0 || index >= ganttSections.length) return;
    recordHistory();
    setGanttSections((current) => {
      const removed = current[index];
      const remaining = current.filter((_, i) => i !== index);
      const nextSections = remaining.length > 0 ? remaining : ['General'];
      const fallback = nextSections[0];
      runWithSuppressedHistory(() => {
        setNodes((nodesList) =>
          nodesList.map((node) => {
            if (node.data.diagramType !== 'gantt') {
              return node;
            }
            const metadata = { ...(node.data.metadata || {}) };
            if (metadata.section === removed) {
              metadata.section = fallback;
              return applyNodeDefaults(
                {
                  ...node,
                  data: { ...node.data, metadata },
                },
                'gantt',
              );
            }
            return node;
          }),
        );
      });
      return nextSections;
    });
  }, [ganttSections, recordHistory]);

  useEffect(() => {
    setSubgraphs((current) =>
      current.map((subgraph) => ({
        ...subgraph,
        nodes: subgraph.nodes.filter((nodeId) => nodes.some((node) => node.id === nodeId)),
      })),
    );
  }, [nodes]);

  useEffect(() => {
    if (diagramType !== 'gantt') {
      return;
    }
    const fallbackSection = ganttSections[0] ?? 'General';
    runWithSuppressedHistory(() => {
      setNodes((current) => {
        let hasChanges = false;
        const nextNodes = current.map((node) => {
          if (node.data.diagramType !== 'gantt') {
            return node;
          }
          const metadata = { ...(node.data.metadata || {}) };
          const currentSection = metadata.section;
          if (!currentSection || !ganttSections.includes(currentSection)) {
            metadata.section = fallbackSection;
            hasChanges = true;
            return applyNodeDefaults(
              {
                ...node,
                data: { ...node.data, metadata },
              },
              'gantt',
            );
          }
          return node;
        });
        return hasChanges ? nextNodes : current;
      });
    });
  }, [diagramType, ganttSections]);

  useEffect(() => {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const handleKey = (event: KeyboardEvent) => {
      const metaPressed = isMac ? event.metaKey : event.ctrlKey;
      if (!metaPressed) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((isMac && key === 'z' && event.shiftKey) || (!isMac && (key === 'y' || (key === 'z' && event.shiftKey)))) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [redo, undo]);

  const handleAutoLayout = useCallback(() => {
    recordHistory();
    runWithSuppressedHistory(() => {
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

      const sortedLayers = Array.from(layerMap.entries()).sort((a, b) => a[0] - b[0]);
      const previousLayerOrder = new Map<string, number>();
      sortedLayers.forEach(([layerIndex, nodeIds]) => {
        const ranked = nodeIds.map((nodeId, rawIndex) => {
          const inbound = edges.filter(
            (edge) => edge.target === nodeId && (levels.get(edge.source) ?? 0) < layerIndex,
          );
          if (inbound.length > 0) {
            const score = inbound.reduce((sum, edge) => sum + (previousLayerOrder.get(edge.source) ?? rawIndex), 0);
            return { nodeId, score: score / inbound.length };
          }

          const outbound = edges.filter(
            (edge) => edge.source === nodeId && (levels.get(edge.target) ?? 0) < layerIndex,
          );
          if (outbound.length > 0) {
            const score = outbound.reduce((sum, edge) => sum + (previousLayerOrder.get(edge.target) ?? rawIndex), 0);
            return { nodeId, score: score / outbound.length + 0.3 };
          }

          return { nodeId, score: rawIndex + layerIndex * 0.01 };
        });

        ranked.sort((a, b) => a.score - b.score || a.nodeId.localeCompare(b.nodeId));
        const orderedIds = ranked.map((item) => item.nodeId);
        layerMap.set(layerIndex, orderedIds);
        orderedIds.forEach((nodeId, index) => {
          previousLayerOrder.set(nodeId, index);
        });
      });

      const maxNodesPerLayer = sortedLayers.reduce((max, [, nodeIds]) => Math.max(max, nodeIds.length), 1);
      const baseSpacing = 220;
      const horizontalSpacing = Math.max(160, baseSpacing - Math.max(0, maxNodesPerLayer - 4) * 12);
      const verticalSpacing = 180;
      const startX = 80;
      const startY = 40;

      const positionMap = new Map<string, { x: number; y: number }>();
      sortedLayers.forEach(([layerIndex]) => {
        const orderedIds = layerMap.get(layerIndex) ?? [];
        const offsetX =
          startX + ((Math.max(1, maxNodesPerLayer) - orderedIds.length) * horizontalSpacing) / 2;
        orderedIds.forEach((nodeId, index) => {
          positionMap.set(nodeId, {
            x: offsetX + index * horizontalSpacing,
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
        return applyNodeDefaults(
          {
            ...node,
            position: target,
          },
          diagramType,
        );
      });
      });
    });

    setTimeout(() => {
      fitViewToDiagram({ duration: 400 });
    }, 50);
  }, [edges, fitViewToDiagram, recordHistory]);

  const handleDiagramTypeChange = useCallback(
    (nextType: MermaidDiagramType) => {
      if (nextType === diagramType) return;
      let allowSwitch = true;
      if ((nodes.length > 0 || edges.length > 0) && typeof window !== 'undefined') {
        allowSwitch = window.confirm('図の種類を変更すると現在の図はクリアされます。続行しますか？');
      }
      if (!allowSwitch) return;
      recordHistory();
      const definition = diagramDefinitions[nextType];
      setDiagramType(nextType);
      setConfig(definition.defaultConfig);
      setNodes([]);
      updateEdges([]);
      setSubgraphs([]);
      setGanttSections(nextType === 'gantt' ? ['General'] : ['General']);
      setWarnings([]);
      setInspector(null);
      const firstEdgeTemplate = definition.edgeTemplates[0];
      setEdgeDraft({
        source: '',
        target: '',
        variant: firstEdgeTemplate?.variant ?? '',
        label: firstEdgeTemplate?.defaultLabel ?? '',
      });
    },
    [diagramType, edges.length, nodes.length, recordHistory],
  );

  const handleDeleteSelection = useCallback(() => {
    if (!inspector) return;
    recordHistory();
    if (inspector.type === 'node') {
      runWithSuppressedHistory(() => {
        setNodes((current) => current.filter((node) => node.id !== inspector.id));
      });
      runWithSuppressedHistory(() => {
        updateEdges((current) => current.filter((edge) => edge.source !== inspector.id && edge.target !== inspector.id));
      });
      setSubgraphs((current) =>
        current.map((subgraph) => ({
          ...subgraph,
          nodes: subgraph.nodes.filter((nodeId) => nodeId !== inspector.id),
        })),
      );
      setEdgeDraft((current) => ({
        source: current.source === inspector.id ? '' : current.source,
        target: current.target === inspector.id ? '' : current.target,
        variant: current.variant,
        label: current.label,
      }));
    } else {
      runWithSuppressedHistory(() => {
        updateEdges((current) => current.filter((edge) => edge.id !== inspector.id));
      });
    }
    setInspector(null);
  }, [inspector, recordHistory, updateEdges]);

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

  const edgeTypes = useMemo(() => ({
    [MERMAID_EDGE_TYPE]: MermaidEdgeComponent,
  }), []);

  const defaultEdgeOptions = useMemo(
    () => ({
      type: MERMAID_EDGE_TYPE,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: '#1f2937',
      },
      style: {
        stroke: '#1f2937',
        strokeWidth: 1.6,
      },
    }),
    [],
  );

  const paletteClasses = isPaletteCollapsed ? 'w-12' : 'w-36';

  const renderNodeInspector = () => {
    if (!selectedNode) {
      return <p className="text-sm text-gray-500">ノードを選択すると詳細を編集できます。</p>;
    }
    const nodeMetadata = selectedNode.data.metadata || {};
    const fillColorValue = toHexColor(nodeMetadata.fillColor, '#ffffff');
    const strokeColorValue = toHexColor(nodeMetadata.strokeColor, '#1f2937');
    const textColorValue = toHexColor(nodeMetadata.textColor, '#1f2937');

    const handleNodeColorChange = (key: 'fillColor' | 'strokeColor' | 'textColor', color: string | null) => {
      updateNode(selectedNode.id, (node) => {
        const metadata = { ...(node.data.metadata || {}) };
        if (color) {
          metadata[key] = sanitizeColorValue(color);
        } else {
          delete metadata[key];
        }
        return {
          ...node,
          data: {
            ...node.data,
            metadata,
          },
        };
      });
    };
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
              updateNode(selectedNode.id, (node) => {
                const previousMetadata = node.data.metadata || {};
                const nextMetadata = template?.defaultMetadata ? { ...template.defaultMetadata } : {};
                PERSISTENT_METADATA_KEYS.forEach((key) => {
                  if (previousMetadata[key] === undefined) {
                    return;
                  }
                  if (key === 'command' && nextVariant !== 'checkout' && nextVariant !== 'cherryPick') {
                    return;
                  }
                  nextMetadata[key] = previousMetadata[key];
                });
                if (
                  diagramType === 'gitGraph' &&
                  (nextVariant === 'commit' || nextVariant === 'merge') &&
                  !nextMetadata.type
                ) {
                  nextMetadata.type = 'NORMAL';
                }
                return {
                  ...node,
                  data: {
                    ...node.data,
                    variant: nextVariant,
                    label: template ? template.defaultLabel : node.data.label,
                    metadata: nextMetadata,
                  },
                };
              });
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
        {diagramType === 'flowchart' && (
          <div>
            <label className="block text-xs text-gray-500">サブグラフ</label>
            <select
              className="w-full border border-gray-300 dark:border-gray-700 rounded p-1 text-sm"
              value={nodeMetadata.subgraphId ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                assignNodeToSubgraph(selectedNode.id, value ? value : null);
              }}
            >
              <option value="">（なし）</option>
              {subgraphs.map((subgraph) => (
                <option key={subgraph.id} value={subgraph.id}>
                  {subgraph.title || subgraph.id}
                </option>
              ))}
            </select>
          </div>
        )}
        {selectedNodeTemplate?.fields
          ?.filter((field) => !(diagramType === 'gantt' && field.key === 'section'))
          .map((field) => {
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
        <div>
          <label className="block text-xs text-gray-500">背景色</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={fillColorValue}
              onChange={(event) => handleNodeColorChange('fillColor', event.target.value)}
            />
            <button
              type="button"
              className="text-[11px] text-gray-500 hover:text-gray-700"
              onClick={() => handleNodeColorChange('fillColor', null)}
            >
              リセット
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500">枠線色</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={strokeColorValue}
              onChange={(event) => handleNodeColorChange('strokeColor', event.target.value)}
            />
            <button
              type="button"
              className="text-[11px] text-gray-500 hover:text-gray-700"
              onClick={() => handleNodeColorChange('strokeColor', null)}
            >
              リセット
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500">文字色</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={textColorValue}
              onChange={(event) => handleNodeColorChange('textColor', event.target.value)}
            />
            <button
              type="button"
              className="text-[11px] text-gray-500 hover:text-gray-700"
              onClick={() => handleNodeColorChange('textColor', null)}
            >
              リセット
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderEdgeInspector = () => {
    if (!selectedEdge) {
      return <p className="text-sm text-gray-500">エッジを選択すると詳細を編集できます。</p>;
    }
    const edgeMetadata = selectedEdge.data.metadata || {};
    const strokeColorValue = toHexColor(edgeMetadata.strokeColor, '#1f2937');
    const textColorValue = toHexColor(edgeMetadata.textColor, '#1f2937');
    const fillColorValue = toHexColor(edgeMetadata.fillColor, '#ffffff');

    const handleEdgeColorChange = (key: 'strokeColor' | 'textColor' | 'fillColor', color: string | null) => {
      updateEdge(selectedEdge.id, (edge) => {
        const metadata = { ...(edge.data.metadata || {}) };
        if (color) {
          metadata[key] = sanitizeColorValue(color);
        } else {
          delete metadata[key];
        }
        return {
          ...edge,
          data: {
            ...edge.data,
            metadata,
          },
        };
      });
    };
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
        <div>
          <label className="block text-xs text-gray-500">線の色</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={strokeColorValue}
              onChange={(event) => handleEdgeColorChange('strokeColor', event.target.value)}
            />
            <button
              type="button"
              className="text-[11px] text-gray-500 hover:text-gray-700"
              onClick={() => handleEdgeColorChange('strokeColor', null)}
            >
              リセット
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500">文字色</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={textColorValue}
              onChange={(event) => handleEdgeColorChange('textColor', event.target.value)}
            />
            <button
              type="button"
              className="text-[11px] text-gray-500 hover:text-gray-700"
              onClick={() => handleEdgeColorChange('textColor', null)}
            >
              リセット
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500">背景色</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={fillColorValue}
              onChange={(event) => handleEdgeColorChange('fillColor', event.target.value)}
            />
            <button
              type="button"
              className="text-[11px] text-gray-500 hover:text-gray-700"
              onClick={() => handleEdgeColorChange('fillColor', null)}
            >
              リセット
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ReactFlowProvider>
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
                  'bg-white dark:bg-gray-900'
                }`}
                value={diagramType}
                onChange={(event) => handleDiagramTypeChange(event.target.value as MermaidDiagramType)}
              >
                {diagramList.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.label}
                  </option>
                ))}
              </select>
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
                        recordHistory();
                        setConfig((current) => ({
                          ...(current as any),
                          [field.key]:
                            field.type === 'boolean'
                              ? newValue === 'true'
                              : field.type === 'number'
                                ? Number(newValue)
                                : newValue,
                        }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {!isPaletteCollapsed && diagramType === 'flowchart' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">サブグラフ</p>
                <button
                  type="button"
                  className="rounded border border-blue-500 px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-900"
                  onClick={addSubgraph}
                >
                  追加
                </button>
              </div>
              {subgraphs.length === 0 ? (
                <p className="text-[11px] text-gray-500">サブグラフはまだありません。</p>
              ) : (
                <div className="space-y-2">
                  {subgraphs.map((subgraph) => (
                    <div key={subgraph.id} className="rounded border border-gray-200 p-2 text-xs dark:border-gray-700">
                      <label className="block text-[11px] text-gray-500">タイトル</label>
                      <input
                        type="text"
                        className="mt-1 w-full rounded border border-gray-300 p-1 text-xs dark:border-gray-600 dark:bg-gray-900"
                        value={subgraph.title}
                        onChange={(event) => updateSubgraphTitle(subgraph.id, event.target.value)}
                      />
                      <p className="mt-1 text-[10px] text-gray-400">ノード数: {subgraph.nodes.length}</p>
                      <button
                        type="button"
                        className="mt-2 flex items-center text-[11px] text-red-500 hover:text-red-600"
                        onClick={() => removeSubgraph(subgraph.id)}
                      >
                        <IoTrash className="mr-1" /> 削除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!isPaletteCollapsed && diagramType === 'gantt' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">セクション</p>
                <button
                  type="button"
                  className="rounded border border-blue-500 px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-900"
                  onClick={addGanttSection}
                >
                  追加
                </button>
              </div>
              {ganttSections.length === 0 ? (
                <p className="text-[11px] text-gray-500">セクションはまだありません。</p>
              ) : (
                <div className="space-y-2">
                  {ganttSections.map((section, index) => (
                    <div key={`gantt-section-${section}-${index}`} className="rounded border border-gray-200 p-2 text-xs dark:border-gray-700">
                      <label className="block text-[11px] text-gray-500">セクション名</label>
                      <input
                        type="text"
                        className="mt-1 w-full rounded border border-gray-300 p-1 text-xs dark:border-gray-600 dark:bg-gray-900"
                        value={section}
                        onChange={(event) => updateGanttSection(index, event.target.value)}
                      />
                      <button
                        type="button"
                        className="mt-2 flex items-center text-[11px] text-red-500 hover:text-red-600"
                        onClick={() => removeGanttSection(index)}
                      >
                        <IoTrash className="mr-1" /> 削除
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onEdgeUpdate={handleEdgeUpdate}
            onSelectionChange={handleSelectionChange}
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance;
              fitViewToDiagram();
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            edgeUpdaterRadius={12}
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
          <GroupOverlays
            diagramType={diagramType}
            subgraphs={subgraphs}
            ganttSections={ganttSections}
          />
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
          <div className="border border-gray-200 dark:border-gray-800 rounded overflow-hidden">
            <MermaidPreview content={generatedCode} fileName={fileName} />
          </div>
        </div>
      </aside>
      </div>
    </ReactFlowProvider>
  );
};

export default MermaidDesigner;
