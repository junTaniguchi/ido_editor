'use client';

import React, { useMemo } from 'react';
import { useStore, type Node } from 'reactflow';
import type { MermaidDiagramType, MermaidSubgraph } from '@/lib/mermaid/types';
import shallow from 'zustand/shallow';

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

const SUBGRAPH_COLORS = ['#BFDBFE', '#C7D2FE', '#FBCFE8', '#BBF7D0', '#FDE68A', '#FECACA'];
const SECTION_COLORS = ['#DBEAFE', '#FCE7F3', '#DCFCE7', '#FEF3C7', '#E0F2FE', '#F5F3FF'];
const PADDING = 32;

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
        const members = nodes.filter(node => node.data?.metadata?.subgraphId === subgraph.id);
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

    return overlayList;
  }, [diagramType, ganttSections, nodes, subgraphs]);

  if (!overlays.length) {
    return null;
  }

  const [translateX, translateY, zoom] = transform;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})`,
          transformOrigin: '0 0',
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
              backgroundColor: `${overlay.color}50`,
              border: `2px dashed ${overlay.color}`,
              borderRadius: 18,
              boxShadow: `0 8px 24px ${overlay.color}55`,
              padding: 12,
              display: 'flex',
              alignItems: 'flex-start',
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
