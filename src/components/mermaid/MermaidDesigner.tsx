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
import { IoAlertCircleOutline, IoSave, IoTrash } from 'react-icons/io5';
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
import MermaidNodeComponent from './MermaidNode';
import { EdgeHandleOrientationContext, type EdgeHandleOrientation } from './EdgeHandleOrientationContext';
import { writeFileContent } from '@/lib/fileSystemUtils';

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

type NodeMetadata = Record<string, string | string[]> & {
  subgraphIds?: string[];
  subgraphId?: string;
};

const getMetadataString = (metadata: NodeMetadata | undefined, key: string): string | undefined => {
  if (!metadata) return undefined;
  const value = metadata[key];
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : undefined;
  }
  return value;
};

const normalizeSubgraphIds = (ids: string[]): string[] =>
  Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)));

const getSubgraphIdsFromMetadata = (metadata: NodeMetadata | undefined): string[] => {
  if (!metadata) return [];
  if (Array.isArray(metadata.subgraphIds)) {
    return normalizeSubgraphIds(metadata.subgraphIds);
  }
  const legacy = metadata.subgraphId;
  if (typeof legacy === 'string' && legacy.trim()) {
    return [legacy.trim()];
  }
  return [];
};

const setSubgraphIdsOnMetadata = (metadata: NodeMetadata, subgraphIds: string[]): NodeMetadata => {
  const normalized = normalizeSubgraphIds(subgraphIds);
  if (normalized.length > 0) {
    metadata.subgraphIds = normalized;
  } else {
    delete metadata.subgraphIds;
  }
  if ('subgraphId' in metadata) {
    delete metadata.subgraphId;
  }
  return metadata;
};

const subgraphIdListsEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
};

const getDefaultEdgeVariant = (type: MermaidDiagramType): string => {
  const definition = diagramDefinitions[type];
  return definition.edgeTemplates[0]?.variant || 'arrow';
};

const toBooleanString = (value: boolean): string => (value ? 'true' : 'false');

const parseBoolean = (value: string | undefined): boolean => value === 'true';

const normalizeHandleId = (handleId: string | null | undefined, fallback: 'top' | 'bottom' | 'left' | 'right'): 'top' | 'bottom' | 'left' | 'right' => {
  if (!handleId) {
    return fallback;
  }
  const mapping: Record<string, 'top' | 'bottom' | 'left' | 'right'> = {
    top: 'top',
    bottom: 'bottom',
    left: 'left',
    right: 'right',
    'source-top': 'top',
    'target-top': 'top',
    'source-bottom': 'bottom',
    'target-bottom': 'bottom',
    'source-left': 'left',
    'target-left': 'left',
    'source-right': 'right',
    'target-right': 'right',
  };
  return mapping[handleId] ?? fallback;
};

const createEdgeId = (): string => `edge_${Date.now().toString(36)}`;

const PERSISTENT_METADATA_KEYS = ['sequence', 'command'];

const MERMAID_NODE_TYPE = 'mermaid-node';
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

const getHandleIdsForOrientation = (
  orientation: EdgeHandleOrientation,
): { source: 'top' | 'bottom' | 'left' | 'right'; target: 'top' | 'bottom' | 'left' | 'right' } => {
  if (orientation === 'horizontal') {
    return { source: 'right', target: 'left' };
  }
  return { source: 'bottom', target: 'top' };
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
  edgeHandleOrientation: EdgeHandleOrientation;
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
  const metadata = { ...defaultMetadata, ...(node.data.metadata || {}) } as NodeMetadata;
  const fillColor = sanitizeColorValue(getMetadataString(metadata, 'fillColor') ?? '#ffffff');
  const strokeColor = sanitizeColorValue(getMetadataString(metadata, 'strokeColor') ?? '#1f2937');
  const textColor = sanitizeColorValue(getMetadataString(metadata, 'textColor') ?? '#111827');
  metadata.fillColor = fillColor;
  metadata.strokeColor = strokeColor;
  metadata.textColor = textColor;
  setSubgraphIdsOnMetadata(metadata, getSubgraphIdsFromMetadata(metadata));
  const isSpecialFlowchartShape =
    diagramType === 'flowchart' && (node.data.variant === 'startEnd' || node.data.variant === 'decision');

  const nextStyle: React.CSSProperties = {
    ...node.style,
    background: fillColor,
    border: `2px solid ${strokeColor}`,
    color: textColor,
  };

  if (isSpecialFlowchartShape) {
    nextStyle.background = 'transparent';
    nextStyle.border = 'none';
  }

  return {
    ...node,
    data: {
      ...node.data,
      metadata,
    },
    style: nextStyle,
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
    const sourceHandle = normalizeHandleId(edge.sourceHandle, 'bottom');
    const targetHandle = normalizeHandleId(edge.targetHandle, 'top');
    const diagramType = (edge.data?.diagramType as MermaidDiagramType) || 'flowchart';
    const defaultMetadata = getEdgeTemplateDefaults(diagramType, edge.data?.variant ?? '');
    const metadata = { ...defaultMetadata, ...(edge.data?.metadata ?? {}) } as NodeMetadata;
    const strokeColor = sanitizeColorValue(getMetadataString(metadata, 'strokeColor') ?? '#1f2937');
    const fillColor = getMetadataString(metadata, 'fillColor');
    const textColor = getMetadataString(metadata, 'textColor');
    if (fillColor) {
      metadata.fillColor = sanitizeColorValue(fillColor);
    }
    if (textColor) {
      metadata.textColor = sanitizeColorValue(textColor);
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
      sourceHandle,
      targetHandle,
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
  const currentTab = useEditorStore(
    useCallback((state) => state.tabs.get(tabId), [tabId])
  );
  const rootDirHandle = useEditorStore((state) => state.rootDirHandle);
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
  const [edgeHandleOrientation, setEdgeHandleOrientation] = useState<EdgeHandleOrientation>('vertical');
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

  const beginSuppressHistory = useCallback(() => {
    suppressHistoryRef.current += 1;
  }, []);

  const endSuppressHistory = useCallback(() => {
    suppressHistoryRef.current = Math.max(0, suppressHistoryRef.current - 1);
  }, []);

  const runWithSuppressedHistory = useCallback(
    (action: () => void) => {
      beginSuppressHistory();
      try {
        action();
      } finally {
        queueMicrotask(() => {
          endSuppressHistory();
        });
      }
    },
    [beginSuppressHistory, endSuppressHistory],
  );

  const createSnapshot = useCallback(
    (): Snapshot => ({
      diagramType,
      config: JSON.parse(JSON.stringify(config)) as MermaidDiagramConfig,
      nodes: cloneNodeList(nodes),
      edges: cloneEdgeList(edges),
      subgraphs: subgraphs.map((subgraph) => ({ ...subgraph, nodes: [...subgraph.nodes] })),
      ganttSections: [...ganttSections],
      edgeHandleOrientation,
    }),
    [diagramType, config, nodes, edges, subgraphs, ganttSections, edgeHandleOrientation],
  );

  const recordHistory = useCallback(() => {
    if (isRestoring.current) return;
    historyRef.current.push(createSnapshot());
    if (historyRef.current.length > 100) {
      historyRef.current.shift();
    }
    futureRef.current = [];
  }, [createSnapshot]);

  const restoreSnapshot = useCallback((snapshot: Snapshot) => {
    isRestoring.current = true;
    setDiagramType(snapshot.diagramType);
    setConfig(snapshot.config);
    setNodes(snapshot.nodes);
    setEdgesState(snapshot.edges);
    setSubgraphs(snapshot.subgraphs);
    setGanttSections(snapshot.ganttSections);
    setEdgeHandleOrientation('vertical');
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
    const tab = getTab(tabId);
    if (tab) {
      const isDirty = tab.originalContent !== code;
      if (tab.content !== code || tab.isDirty !== isDirty) {
        updateTab(tabId, { content: code, isDirty });
      }
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
          edgeHandleOrientation,
        };
        historyRef.current = [initialSnapshot];
        futureRef.current = [];
      });
    });
  }, [content, tabId, fitViewToDiagram, edgeHandleOrientation]);

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
      console.debug('[MermaidDesigner][handleEdgeUpdate] orientation', edgeHandleOrientation);
      if (typeof getHandleIdsForOrientation !== 'function') {
        console.warn('[MermaidDesigner][handleEdgeUpdate] getHandleIdsForOrientation is not defined');
        return;
      }
      const handles = getHandleIdsForOrientation(edgeHandleOrientation);
      runWithSuppressedHistory(() => {
        updateEdges((current) =>
          current.map((edge) =>
            edge.id === oldEdge.id
              ? {
                  ...edge,
                  source: newConnection.source,
                  target: newConnection.target,
                  sourceHandle: normalizeHandleId(newConnection.sourceHandle, 'bottom'),
                  targetHandle: normalizeHandleId(newConnection.targetHandle, 'top'),
                }
              : edge,
          ),
        );
      });
    },
    [recordHistory, runWithSuppressedHistory, updateEdges],
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
          sourceHandle: normalizeHandleId(connection.sourceHandle, 'bottom'),
          targetHandle: normalizeHandleId(connection.targetHandle, 'top'),
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
    [diagramType, edgeTemplates, recordHistory, runWithSuppressedHistory, supportsEdges, updateEdges],
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
            type: MERMAID_NODE_TYPE,
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
    [diagramType, ganttSections, recordHistory, runWithSuppressedHistory],
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
    [diagramType, recordHistory, runWithSuppressedHistory],
  );

  const updateEdge = useCallback(
    (edgeId: string, updater: (edge: MermaidEdge) => MermaidEdge) => {
      recordHistory();
      runWithSuppressedHistory(() => {
        updateEdges((current) => current.map((edge) => (edge.id === edgeId ? updater(edge) : edge)));
      });
    },
    [recordHistory, runWithSuppressedHistory, updateEdges],
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
            const metadata = (node.data.metadata || {}) as NodeMetadata;
            const currentIds = getSubgraphIdsFromMetadata(metadata);
            if (!currentIds.includes(subgraphId)) {
              return node;
            }
            const nextMetadata = setSubgraphIdsOnMetadata({ ...metadata }, currentIds.filter((id) => id !== subgraphId));
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
    [diagramType, recordHistory, runWithSuppressedHistory, subgraphs],
  );

  const assignNodeToSubgraphs = useCallback(
    (nodeId: string, nextSubgraphIds: string[]) => {
      const targetNode = nodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        return;
      }
      const desiredIds = normalizeSubgraphIds(nextSubgraphIds);
      const currentIds = getSubgraphIdsFromMetadata(targetNode.data.metadata as NodeMetadata | undefined);
      if (subgraphIdListsEqual(currentIds, desiredIds)) {
        return;
      }

      recordHistory();
      runWithSuppressedHistory(() => {
        setNodes((current) =>
          current.map((node) => {
            if (node.id !== nodeId) {
              return node;
            }
            const metadata = { ...(node.data.metadata || {}) } as NodeMetadata;
            const nextMetadata = setSubgraphIdsOnMetadata(metadata, desiredIds);
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
          if (desiredIds.includes(subgraph.id)) {
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
    [diagramType, nodes, recordHistory, runWithSuppressedHistory],
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
    [ganttSections, recordHistory, runWithSuppressedHistory],
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
  }, [ganttSections, recordHistory, runWithSuppressedHistory]);

  useEffect(() => {
    setSubgraphs((current) =>
      current.map((subgraph) => ({
        ...subgraph,
        nodes: Array.from(
          new Set(subgraph.nodes.filter((nodeId) => nodes.some((node) => node.id === nodeId))),
        ),
      })),
    );
  }, [nodes]);

  useEffect(() => {
    console.debug('[MermaidDesigner][useEffect] orientation changed', edgeHandleOrientation);
    if (typeof getHandleIdsForOrientation !== 'function') {
      console.warn('[MermaidDesigner][useEffect] getHandleIdsForOrientation is not defined');
      return;
    }
    const handles = getHandleIdsForOrientation(edgeHandleOrientation);
    runWithSuppressedHistory(() => {
      updateEdges((current) => {
        let hasChanges = false;
        const nextEdges = current.map((edge) => {
          if (edge.sourceHandle === handles.source && edge.targetHandle === handles.target) {
            return edge;
          }
          hasChanges = true;
          return {
            ...edge,
            sourceHandle: handles.source,
            targetHandle: handles.target,
          };
        });
        return hasChanges ? nextEdges : current;
      });
    });
  }, [edgeHandleOrientation, runWithSuppressedHistory, updateEdges]);

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
  }, [diagramType, ganttSections, runWithSuppressedHistory]);

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

  const handleAutoLayout = useCallback((direction: 'vertical' | 'horizontal') => {
    const isVertical = direction === 'vertical';
    recordHistory();
    runWithSuppressedHistory(() => {
      setNodes((currentNodes) => {
        if (currentNodes.length === 0) {
          return currentNodes;
        }

        const nodeIdSet = new Set(currentNodes.map((node) => node.id));
        const adjacency = new Map<string, Set<string>>();
        const indegree = new Map<string, number>();
        const incoming = new Map<string, Set<string>>();
        const outgoing = new Map<string, Set<string>>();

        currentNodes.forEach((node) => {
          adjacency.set(node.id, new Set<string>());
          indegree.set(node.id, 0);
          incoming.set(node.id, new Set<string>());
          outgoing.set(node.id, new Set<string>());
        });

        edges.forEach((edge) => {
          if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) {
            return;
          }
          adjacency.get(edge.source)?.add(edge.target);
          outgoing.get(edge.source)?.add(edge.target);
          incoming.get(edge.target)?.add(edge.source);
          indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
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

        const layers = Array.from(layerMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([level, nodeIds]) => ({ level, nodeIds: [...nodeIds] }));

        if (layers.length > 1) {
          const baseLayerOrders = layers.map((layer) => {
            const order = new Map<string, number>();
            layer.nodeIds.forEach((nodeId, index) => order.set(nodeId, index));
            return order;
          });
          const dynamicOrders = layers.map((layer) => {
            const order = new Map<string, number>();
            layer.nodeIds.forEach((nodeId, index) => order.set(nodeId, index));
            return order;
          });

          const sweepCount = Math.min(8, Math.max(2, layers.length * 2));
          for (let iteration = 0; iteration < sweepCount; iteration += 1) {
            const downward = iteration % 2 === 0;
            const start = downward ? 1 : layers.length - 2;
            const end = downward ? layers.length : -1;
            const step = downward ? 1 : -1;

            for (let layerIndex = start; layerIndex !== end; layerIndex += step) {
              const layer = layers[layerIndex];
              if (!layer) continue;
              const adjacentIndex = layerIndex - step;
              const adjacentLayer = layers[adjacentIndex];
              if (!adjacentLayer) continue;

              const adjacentOrder = dynamicOrders[adjacentIndex];
              const currentOrder = dynamicOrders[layerIndex];
              const baseOrder = baseLayerOrders[layerIndex];
              const expectedNeighborLevel = downward ? layer.level - 1 : layer.level + 1;

              const ranked = layer.nodeIds.map((nodeId) => {
                const neighborSet = downward ? incoming.get(nodeId) : outgoing.get(nodeId);
                let relevantNeighbors: string[] = [];
                if (neighborSet) {
                  relevantNeighbors = Array.from(neighborSet).filter((neighborId) => (
                    levels.get(neighborId) ?? expectedNeighborLevel
                  ) === expectedNeighborLevel);
                  if (relevantNeighbors.length === 0) {
                    relevantNeighbors = Array.from(neighborSet);
                  }
                }

                let barycenter: number;
                if (relevantNeighbors.length > 0) {
                  barycenter = relevantNeighbors.reduce((sum, neighborId) => {
                    const neighborPosition = adjacentOrder.get(neighborId);
                    if (neighborPosition === undefined) {
                      return sum + (baseOrder.get(nodeId) ?? 0);
                    }
                    return sum + neighborPosition;
                  }, 0) / relevantNeighbors.length;
                } else {
                  barycenter = currentOrder.get(nodeId) ?? (baseOrder.get(nodeId) ?? 0);
                }

                const spreadPenalty = relevantNeighbors.length > 0 ? 1 / relevantNeighbors.length : 1;

                return {
                  nodeId,
                  barycenter,
                  spreadPenalty,
                };
              });

              ranked.sort((a, b) => (
                a.barycenter - b.barycenter
                || a.spreadPenalty - b.spreadPenalty
                || (baseOrder.get(a.nodeId) ?? 0) - (baseOrder.get(b.nodeId) ?? 0)
                || a.nodeId.localeCompare(b.nodeId)
              ));

              layer.nodeIds = ranked.map((item) => item.nodeId);
              layer.nodeIds.forEach((nodeId, index) => {
                dynamicOrders[layerIndex].set(nodeId, index);
              });
            }
          }
        }

        const maxNodesPerLayer = layers.reduce((max, layer) => Math.max(max, layer.nodeIds.length), 1);
        const baseSpacing = 220;
        const nodeSpacing = Math.max(160, baseSpacing - Math.max(0, maxNodesPerLayer - 4) * 12);
        const layerSpacing = 180;
        const originX = 80;
        const originY = 40;

        const positionMap = new Map<string, { x: number; y: number }>();
        layers.forEach((layer) => {
          const secondaryOffset = ((Math.max(1, maxNodesPerLayer) - layer.nodeIds.length) * nodeSpacing) / 2;
          layer.nodeIds.forEach((nodeId, index) => {
            const x = isVertical
              ? originX + secondaryOffset + index * nodeSpacing
              : originX + layer.level * layerSpacing;
            const y = isVertical
              ? originY + layer.level * layerSpacing
              : originY + secondaryOffset + index * nodeSpacing;
            positionMap.set(nodeId, { x, y });
          });
        });

        return currentNodes.map((node, index) => {
          const fallbackRow = Math.floor(index / 4);
          const fallbackPosition = isVertical
            ? {
                x: originX + (index % 4) * nodeSpacing,
                y: originY + fallbackRow * layerSpacing,
              }
            : {
                x: originX + fallbackRow * layerSpacing,
                y: originY + (index % 4) * nodeSpacing,
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
  }, [diagramType, edges, fitViewToDiagram, recordHistory, runWithSuppressedHistory]);

  const handleSaveDiagram = useCallback(async () => {
    const tab = getTab(tabId);
    if (!tab) {
      alert('現在のタブ情報を取得できませんでした。');
      return;
    }

    if (tab.isReadOnly) {
      alert('このファイルは読み取り専用のため保存できません。');
      return;
    }

    if (!tab.isDirty && tab.originalContent === generatedCode) {
      return;
    }

    const contentToSave = generatedCode;
    let fileHandle: FileSystemFileHandle | null = null;
    const existingHandle = tab.file;

    if (existingHandle && typeof (existingHandle as FileSystemFileHandle).createWritable === 'function') {
      fileHandle = existingHandle as FileSystemFileHandle;
    } else if (rootDirHandle) {
      const candidatePath = tab.id && !tab.id.startsWith('temp_') ? tab.id : tab.name;

      if (candidatePath) {
        const segments = candidatePath.split('/').filter(Boolean);

        if (segments.length > 0) {
          try {
            let directoryHandle: FileSystemDirectoryHandle = rootDirHandle;
            for (let i = 0; i < segments.length - 1; i += 1) {
              directoryHandle = await directoryHandle.getDirectoryHandle(segments[i]);
            }

            const targetFileName = segments[segments.length - 1];
            fileHandle = await directoryHandle.getFileHandle(targetFileName, { create: true });
          } catch (error) {
            console.error('Failed to resolve file handle for saving:', error);
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
      console.error('Failed to save mermaid diagram:', error);
      alert(`ファイルの保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  }, [generatedCode, getTab, rootDirHandle, tabId, updateTab]);

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
    [diagramType, edges.length, nodes.length, recordHistory, updateEdges],
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
  }, [inspector, recordHistory, runWithSuppressedHistory, updateEdges]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (!inspector) {
        return;
      }
      event.preventDefault();
      handleDeleteSelection();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDeleteSelection, inspector]);

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

  const nodeTypes = useMemo(
    () => ({
      [MERMAID_NODE_TYPE]: MermaidNodeComponent,
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      [MERMAID_EDGE_TYPE]: MermaidEdgeComponent,
    }),
    [],
  );

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
  const canSaveDiagram = useMemo(() => {
    if (!currentTab || currentTab.isReadOnly) {
      return false;
    }
    if (currentTab.isDirty) {
      return true;
    }
    return currentTab.originalContent !== generatedCode;
  }, [currentTab, generatedCode]);

  const renderNodeInspector = () => {
    if (!selectedNode) {
      return <p className="text-sm text-gray-500">ノードを選択すると詳細を編集できます。</p>;
    }
    const nodeMetadata = (selectedNode.data.metadata || {}) as NodeMetadata;
    const nodeSubgraphIds = getSubgraphIdsFromMetadata(nodeMetadata);
    const fillColorValue = toHexColor(getMetadataString(nodeMetadata, 'fillColor'), '#ffffff');
    const strokeColorValue = toHexColor(getMetadataString(nodeMetadata, 'strokeColor'), '#1f2937');
    const textColorValue = toHexColor(getMetadataString(nodeMetadata, 'textColor'), '#1f2937');

    const handleNodeColorChange = (key: 'fillColor' | 'strokeColor' | 'textColor', color: string | null) => {
      updateNode(selectedNode.id, (node) => {
        const metadata = { ...(node.data.metadata || {}) } as NodeMetadata;
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
            <div className="flex items-center justify-between">
              <label className="block text-xs text-gray-500">サブグラフ</label>
              {nodeSubgraphIds.length > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-blue-600 hover:text-blue-700"
                  onClick={() => assignNodeToSubgraphs(selectedNode.id, [])}
                >
                  クリア
                </button>
              )}
            </div>
            {subgraphs.length === 0 ? (
              <p className="mt-1 text-xs text-gray-500">サブグラフがありません。</p>
            ) : (
              <div className="mt-1 space-y-1 border border-gray-300 dark:border-gray-700 rounded p-2 max-h-48 overflow-y-auto bg-white dark:bg-gray-900">
                {subgraphs.map((subgraph) => {
                  const checked = nodeSubgraphIds.includes(subgraph.id);
                  return (
                    <label key={subgraph.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input
                        type="checkbox"
                        className="accent-blue-600"
                        checked={checked}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...nodeSubgraphIds, subgraph.id]
                            : nodeSubgraphIds.filter((id) => id !== subgraph.id);
                          assignNodeToSubgraphs(selectedNode.id, next);
                        }}
                      />
                      <span>{subgraph.title || subgraph.id}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {selectedNodeTemplate?.fields
          ?.filter((field) => !(diagramType === 'gantt' && field.key === 'section'))
          .map((field) => {
          const value = getMetadataString(nodeMetadata, field.key) ?? '';
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
    const edgeMetadata = (selectedEdge.data.metadata || {}) as NodeMetadata;
    const strokeColorValue = toHexColor(getMetadataString(edgeMetadata, 'strokeColor'), '#1f2937');
    const textColorValue = toHexColor(getMetadataString(edgeMetadata, 'textColor'), '#1f2937');
    const fillColorValue = toHexColor(getMetadataString(edgeMetadata, 'fillColor'), '#ffffff');

    const handleEdgeColorChange = (key: 'strokeColor' | 'textColor' | 'fillColor', color: string | null) => {
      updateEdge(selectedEdge.id, (edge) => {
        const metadata = { ...(edge.data.metadata || {}) } as NodeMetadata;
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
          const value = getMetadataString(edgeMetadata, field.key) ?? selectedEdge.data.label ?? '';
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
              className="px-3 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 flex items-center disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={() => void handleSaveDiagram()}
              disabled={!canSaveDiagram}
            >
              <IoSave className="mr-1" size={16} /> 保存
            </button>
            <button
              type="button"
              className="px-3 py-1 text-xs rounded border border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950"
              onClick={() => handleAutoLayout('vertical')}
            >
              自動整列（縦）
            </button>
            <button
              type="button"
              className="px-3 py-1 text-xs rounded border border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950"
              onClick={() => handleAutoLayout('horizontal')}
            >
              自動整列（横）
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
          <EdgeHandleOrientationContext.Provider value={edgeHandleOrientation}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
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
          </EdgeHandleOrientationContext.Provider>
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
