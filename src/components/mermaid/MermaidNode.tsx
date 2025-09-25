'use client';

import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { MermaidNodeData } from '@/lib/mermaid/types';

const handleStyle: CSSProperties = {
  width: 12,
  height: 12,
  background: '#2563eb',
  borderRadius: '9999px',
  border: '2px solid #ffffff',
};

const wrapLabel = (label: string, color: string) => (
  <span
    className="text-sm font-medium"
    style={{ color, textAlign: 'center', wordBreak: 'break-word', display: 'block' }}
  >
    {label}
  </span>
);

const MermaidNodeComponent: React.FC<NodeProps<MermaidNodeData>> = ({ data, selected }) => {
  const handlePositions = useMemo(() => ({
    targetTop: { ...handleStyle, left: '30%' } as CSSProperties,
    sourceTop: { ...handleStyle, left: '70%' } as CSSProperties,
    targetBottom: { ...handleStyle, left: '30%' } as CSSProperties,
    sourceBottom: { ...handleStyle, left: '70%' } as CSSProperties,
    targetLeft: { ...handleStyle, top: '30%' } as CSSProperties,
    sourceLeft: { ...handleStyle, top: '70%' } as CSSProperties,
    targetRight: { ...handleStyle, top: '30%' } as CSSProperties,
    sourceRight: { ...handleStyle, top: '70%' } as CSSProperties,
  }), []);

  const { fillColor, strokeColor, textColor } = useMemo(() => {
    const metadata = data.metadata ?? {};
    const fill = typeof metadata.fillColor === 'string' ? metadata.fillColor : '#ffffff';
    const stroke = typeof metadata.strokeColor === 'string' ? metadata.strokeColor : '#1f2937';
    const text = typeof metadata.textColor === 'string' ? metadata.textColor : '#111827';
    return { fillColor: fill, strokeColor: stroke, textColor: text };
  }, [data.metadata]);

  const baseBoxShadow = selected ? '0 0 0 3px rgba(37, 99, 235, 0.35)' : undefined;

  const isFlowchart = data.diagramType === 'flowchart';

  let content: React.ReactNode;

  if (isFlowchart && data.variant === 'startEnd') {
    content = (
      <div
        className="flex items-center justify-center"
        style={{
          background: fillColor,
          border: `2px solid ${strokeColor}`,
          borderRadius: '9999px',
          minWidth: 96,
          minHeight: 96,
          padding: '12px 16px',
          boxShadow: baseBoxShadow,
        }}
      >
        {wrapLabel(data.label, textColor)}
      </div>
    );
  } else if (isFlowchart && data.variant === 'decision') {
    content = (
      <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            background: fillColor,
            border: `2px solid ${strokeColor}`,
            transform: 'rotate(45deg)',
            borderRadius: 12,
            boxShadow: baseBoxShadow,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
          {wrapLabel(data.label, textColor)}
        </div>
      </div>
    );
  } else {
    content = (
      <div
        className="flex items-center justify-center"
        style={{
          background: fillColor,
          border: `2px solid ${strokeColor}`,
          borderRadius: 12,
          minWidth: isFlowchart ? 140 : undefined,
          minHeight: isFlowchart ? 72 : undefined,
          padding: isFlowchart ? '12px 16px' : '8px 12px',
          boxShadow: baseBoxShadow,
        }}
      >
        {wrapLabel(data.label, textColor)}
      </div>
    );
  }

  return (
    <div className="relative">
      {content}
      <Handle id="target-top" type="target" position={Position.Top} style={handlePositions.targetTop} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} style={handlePositions.targetBottom} />
      <Handle id="target-left" type="target" position={Position.Left} style={handlePositions.targetLeft} />
      <Handle id="target-right" type="target" position={Position.Right} style={handlePositions.targetRight} />
      <Handle id="source-top" type="source" position={Position.Top} style={handlePositions.sourceTop} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} style={handlePositions.sourceBottom} />
      <Handle id="source-left" type="source" position={Position.Left} style={handlePositions.sourceLeft} />
      <Handle id="source-right" type="source" position={Position.Right} style={handlePositions.sourceRight} />
    </div>
  );
};

export default MermaidNodeComponent;
