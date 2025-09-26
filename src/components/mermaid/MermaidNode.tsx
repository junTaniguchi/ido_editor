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
  const orientation = useEdgeHandleOrientation();
  const isFlowchart = data.diagramType === 'flowchart';
  const isDecision = isFlowchart && data.variant === 'decision';
  const isCircular = isFlowchart && data.variant === 'startEnd';

  const handlePositions = useMemo(() => {
    const base: Record<'top' | 'bottom' | 'left' | 'right', CSSProperties> = {
      top: {
        ...handleStyle,
        left: '50%',
        transform: 'translate(-50%, -50%)',
      },
      bottom: {
        ...handleStyle,
        left: '50%',
        transform: 'translate(-50%, 50%)',
      },
      left: {
        ...handleStyle,
        top: '50%',
        transform: 'translate(-50%, -50%)',
      },
      right: {
        ...handleStyle,
        top: '50%',
        transform: 'translate(50%, -50%)',
      },
    };

    if (isDecision) {
      base.top = {
        ...handleStyle,
        left: '50%',
        top: 0,
        transform: 'translate(-50%, -105%)',
      };
      base.bottom = {
        ...handleStyle,
        left: '50%',
        top: '100%',
        transform: 'translate(-50%, 105%)',
      };
      base.left = {
        ...handleStyle,
        top: '50%',
        left: 0,
        transform: 'translate(-105%, -50%)',
      };
      base.right = {
        ...handleStyle,
        top: '50%',
        left: '100%',
        transform: 'translate(105%, -50%)',
      };
    }

    return base;
  }, [isDecision]);

  const handlesToRender = useMemo(
    () => (
      orientation === 'horizontal'
        ? ([
            { id: 'left', position: Position.Left, type: 'target' as const },
            { id: 'right', position: Position.Right, type: 'source' as const },
          ] as const)
        : ([
            { id: 'top', position: Position.Top, type: 'target' as const },
            { id: 'bottom', position: Position.Bottom, type: 'source' as const },
          ] as const)
    ),
    [orientation],
  );

  const { fillColor, strokeColor, textColor } = useMemo(() => {
    const metadata = (data.metadata || {}) as Record<string, string | string[]>;
    const pick = (key: string, fallback: string): string => {
      const value = metadata[key];
      if (Array.isArray(value)) {
        return value.length > 0 ? value[0] : fallback;
      }
      return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
    };
    return {
      fillColor: pick('fillColor', '#ffffff'),
      strokeColor: pick('strokeColor', '#1f2937'),
      textColor: pick('textColor', '#111827'),
    };
  }, [data.metadata]);

  const baseBoxShadow = selected ? '0 0 0 3px rgba(37, 99, 235, 0.35)' : undefined;

  let content: React.ReactNode;

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
    const decisionSize = 132;
    content = (
      <div
        className="relative flex items-center justify-center"
        style={{ width: decisionSize, height: decisionSize, boxShadow: baseBoxShadow }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: strokeColor,
            clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            inset: '6px',
            background: fillColor,
            clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
            pointerEvents: 'none',
          }}
        >
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
          borderRadius: 0,
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
      {handlesToRender.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type={handle.type}
          position={handle.position}
          style={handlePositions[handle.id]}
          isConnectableStart={handle.type === 'source'}
          isConnectableEnd={handle.type === 'target'}
        />
      ))}
    </div>
  );
};

export default MermaidNodeComponent;
