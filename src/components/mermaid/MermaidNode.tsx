'use client';

import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { MermaidNodeData } from '@/lib/mermaid/types';
import { useEdgeHandleOrientation } from './EdgeHandleOrientationContext';

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
  const handlePositions = useMemo(
    () => ({
      top: {
        ...handleStyle,
        left: '50%',
        transform: 'translate(-50%, -50%)',
      } as CSSProperties,
      bottom: {
        ...handleStyle,
        left: '50%',
        transform: 'translate(-50%, 50%)',
      } as CSSProperties,
      left: {
        ...handleStyle,
        top: '50%',
        transform: 'translate(-50%, -50%)',
      } as CSSProperties,
      right: {
        ...handleStyle,
        top: '50%',
        transform: 'translate(50%, -50%)',
      } as CSSProperties,
    }),
    [],
  );

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

  const isCircular = isFlowchart && data.variant === 'startEnd';
  const isDecision = isFlowchart && data.variant === 'decision';

  if (isCircular) {
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
  } else if (isDecision) {
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

  const containerStyle: CSSProperties = isCircular || isDecision
    ? { background: 'transparent', border: 'none', padding: 0 }
    : {};

  return (
    <div className="relative" style={containerStyle}>
      {content}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        style={handlePositions.top}
        isConnectableEnd
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        style={handlePositions.bottom}
        isConnectableEnd
      />
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        style={handlePositions.left}
        isConnectableEnd
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        style={handlePositions.right}
        isConnectableEnd
      />
    </div>
  );
};

export default MermaidNodeComponent;
