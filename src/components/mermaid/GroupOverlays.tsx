'use client';

import React, { useMemo } from 'react';
import { useStore, type Node } from 'reactflow';
import type { MermaidDiagramType, MermaidSubgraph } from '@/lib/mermaid/types';
import { shallow } from 'zustand/shallow';

interface GroupOverlaysProps {
  diagramType: MermaidDiagramType;
  subgraphs: MermaidSubgraph[];
  ganttSections: string[];
}

interface Overlay {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type Metadata = Record<string, string | string[]> & {
  subgraphIds?: string[];
  subgraphId?: string;
};

const extractSubgraphIds = (metadata?: Metadata): string[] => {
  if (!metadata) return [];
  const rawIds = metadata.subgraphIds;
  if (Array.isArray(rawIds)) {
    return Array.from(new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
  }
  const legacy = metadata.subgraphId;
  if (typeof legacy === 'string' && legacy.trim()) {
    return [legacy.trim()];
  }
  return [];
};

const SUBGRAPH_COLORS = ['#BFDBFE', '#C7D2FE', '#FBCFE8', '#BBF7D0', '#FDE68A', '#FECACA'];
const SECTION_COLORS = ['#DBEAFE', '#FCE7F3', '#DCFCE7', '#FEF3C7', '#E0F2FE', '#F5F3FF'];
const GIT_BRANCH_COLORS = ['#DBEAFE', '#DDD6FE', '#FBCFE8', '#DCFCE7', '#FDE68A', '#FECACA', '#E0E7FF'];
const PADDING = 32;

const getMetadataString = (metadata: Metadata | undefined, key: string): string | undefined => {
  if (!metadata) return undefined;
  const value = metadata[key];
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
};

const computeBounds = (nodes: Node[]): { x: number; y: number; width: number; height: number } | null => {
  if (!nodes.length) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  const x2s: number[] = [];
  const y2s: number[] = [];

  nodes.forEach(node => {
    if (!node.positionAbsolute) return;
    const { x, y } = node.positionAbsolute;
    const width = node.width ?? 180;
    const height = node.height ?? 100;
    xs.push(x);
    ys.push(y);
    x2s.push(x + width);
    y2s.push(y + height);
  });

  if (!xs.length) return null;

  const minX = Math.min(...xs) - PADDING;
  const minY = Math.min(...ys) - PADDING;
  const maxX = Math.max(...x2s) + PADDING;
  const maxY = Math.max(...y2s) + PADDING;

  return {
    x: minX,
    y: minY,
    width: Math.max(200, maxX - minX),
    height: Math.max(160, maxY - minY),
  };
};

const GroupOverlays: React.FC<GroupOverlaysProps> = ({ diagramType, subgraphs, ganttSections }) => {
  const { nodes, transform } = useStore(
    state => ({
      nodes: Array.from(state.nodeInternals.values()),
      transform: state.transform,
    }),
    shallow,
  );

  const overlays = useMemo<Overlay[]>(() => {
    const overlayList: Overlay[] = [];
    if (!nodes.length) return overlayList;

    if (diagramType === 'flowchart' && subgraphs.length > 0) {
      subgraphs.forEach((subgraph, index) => {
        const members = nodes.filter((node) => extractSubgraphIds(node.data?.metadata as Metadata | undefined).includes(subgraph.id));
        const bounds = computeBounds(members as Node[]);
        if (!bounds) return;
        overlayList.push({
          id: `subgraph-${subgraph.id}`,
          label: subgraph.title || subgraph.id,
          color: SUBGRAPH_COLORS[index % SUBGRAPH_COLORS.length],
          ...bounds,
        });
      });
    }

    if (diagramType === 'gantt' && ganttSections.length > 0) {
      ganttSections.forEach((section, index) => {
        const members = nodes.filter(
          node => node.data?.diagramType === 'gantt' && node.data?.metadata?.section === section,
        );
        const bounds = computeBounds(members as Node[]);
        if (!bounds) return;
        overlayList.push({
          id: `gantt-${section}`,
          label: section,
          color: SECTION_COLORS[index % SECTION_COLORS.length],
          ...bounds,
        });
      });
    }

    if (diagramType === 'gitGraph') {
      const branchLabels = new Map<string, string>();
      nodes.forEach((node) => {
        if (node.data?.diagramType === 'gitGraph' && node.data?.variant === 'branch') {
          const label = typeof node.data.label === 'string' && node.data.label.trim().length > 0
            ? node.data.label.trim()
            : node.id;
          branchLabels.set(node.id, label);
        }
      });

      const branchMembers = new Map<string, Node[]>();
      nodes.forEach((node) => {
        if (node.data?.diagramType !== 'gitGraph') return;
        if (node.data?.variant !== 'commit' && node.data?.variant !== 'merge') return;
        const metadata = node.data?.metadata as Metadata | undefined;
        const branchId = getMetadataString(metadata, 'branchId') || 'main';
        const list = branchMembers.get(branchId);
        if (list) {
          list.push(node);
        } else {
          branchMembers.set(branchId, [node]);
        }
      });

      const sortedBranches = Array.from(branchMembers.entries()).sort((a, b) => {
        const labelA = branchLabels.get(a[0]) ?? a[0];
        const labelB = branchLabels.get(b[0]) ?? b[0];
        return labelA.localeCompare(labelB, 'ja');
      });

      sortedBranches.forEach(([branchId, members], index) => {
        const bounds = computeBounds(members as Node[]);
        if (!bounds) return;
        const label = branchLabels.get(branchId) ?? branchId;
        overlayList.push({
          id: `git-branch-${branchId}`,
          label,
          color: GIT_BRANCH_COLORS[index % GIT_BRANCH_COLORS.length],
          ...bounds,
        });
      });
    }

    return overlayList;
  }, [diagramType, ganttSections, nodes, subgraphs]);

  if (!overlays.length) {
    return null;
  }

  const [translateX, translateY, zoom] = transform;

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      >
        {overlays.map(overlay => (
          <div
            key={overlay.id}
            style={{
              position: 'absolute',
              left: overlay.x,
              top: overlay.y,
              width: overlay.width,
              height: overlay.height,
              backgroundColor: `${overlay.color}40`,
              border: `2px dashed ${overlay.color}`,
              borderRadius: 18,
              boxShadow: `0 8px 24px ${overlay.color}55`,
              padding: 12,
              display: 'flex',
              alignItems: 'flex-start',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                backgroundColor: overlay.color,
                color: '#1f2937',
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 10px',
                borderRadius: 9999,
                pointerEvents: 'none',
              }}
            >
              {overlay.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GroupOverlays;
