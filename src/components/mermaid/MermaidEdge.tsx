'use client';

import React from 'react';
import type { CSSProperties } from 'react';
import { BaseEdge, EdgeLabelRenderer, MarkerType, getBezierPath, type EdgeProps } from 'reactflow';
import type { MermaidEdgeData } from '@/lib/mermaid/types';

const DEFAULT_STROKE = '#1f2937';
const DEFAULT_STROKE_WIDTH = 1.6;
const PARALLEL_OFFSET = 38;

const expandShortHex = (value: string): string =>
  `#${value
    .slice(1)
    .split('')
    .map((char) => char + char)
    .join('')}`;

const sanitizeColorValue = (value: string): string => {
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return expandShortHex(value.toLowerCase());
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return value;
};

const buildStrokeStyle = (variant?: string): CSSProperties => {
  const style: CSSProperties = {
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  };

  switch (variant) {
    case 'dashed':
    case 'dependency':
      style.strokeDasharray = '6 4';
      break;
    case 'thick':
      style.strokeWidth = 2.6;
      break;
    case 'open':
      style.stroke = '#1f2937';
      style.strokeWidth = 1.6;
      break;
    case 'identifying':
    case 'nonIdentifying':
    case 'oneToMany':
    case 'manyToMany':
      style.strokeWidth = 2;
      break;
    default:
      break;
  }

  return style;
};

const MermaidEdge: React.FC<EdgeProps<MermaidEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  markerEnd,
  style,
  label,
}) => {
  const parallelCount = data?.parallelCount ?? 1;
  const parallelIndex = data?.parallelIndex ?? 0;
  const strokeColor = data?.metadata?.strokeColor;
  const labelTextColor = data?.metadata?.textColor;
  const labelBackground = data?.metadata?.fillColor;

  let path = '';
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;

  if (sourceX === targetX && sourceY === targetY) {
    const radius = 40;
    const offsetX = sourcePosition === 'right' ? radius : -radius;
    const offsetY = -radius;
    const control1X = sourceX + offsetX;
    const control1Y = sourceY + offsetY;
    const control2X = targetX + offsetX;
    const control2Y = targetY + radius;
    path = `M ${sourceX},${sourceY} C ${control1X},${control1Y} ${control2X},${control2Y} ${targetX},${targetY}`;
    labelX = sourceX + offsetX;
    labelY = sourceY + offsetY;
  } else if (parallelCount > 1) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const middleX = (sourceX + targetX) / 2;
    const middleY = (sourceY + targetY) / 2;
    const offsetIndex = parallelIndex - (parallelCount - 1) / 2;
    const curvature = offsetIndex * PARALLEL_OFFSET;
    const controlX = middleX + normalX * curvature;
    const controlY = middleY + normalY * curvature;
    path = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;
    labelX = controlX;
    labelY = controlY;
  } else {
    const [bezierPath, x, y] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    path = bezierPath;
    labelX = x;
    labelY = y;
  }

  const baseStyle = buildStrokeStyle(data?.variant);
  const mergedStyle: CSSProperties = {
    ...baseStyle,
    ...(strokeColor ? { stroke: strokeColor } : {}),
    ...(style ?? {}),
  };

  const markerColor = typeof mergedStyle.stroke === 'string' ? mergedStyle.stroke : DEFAULT_STROKE;

  const resolvedMarkerEnd = markerEnd ?? {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: markerColor,
  };

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={resolvedMarkerEnd} style={mergedStyle} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: labelBackground ? sanitizeColorValue(labelBackground) : 'rgba(255, 255, 255, 0.9)',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 12,
              color: labelTextColor ? sanitizeColorValue(labelTextColor) : '#1f2937',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.18)',
              whiteSpace: 'nowrap',
              maxWidth: 200,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default MermaidEdge;
