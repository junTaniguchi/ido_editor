'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  getBezierPath,
  type EdgeProps,
  useReactFlow,
} from 'reactflow';
import type { MermaidEdgeData } from '@/lib/mermaid/types';
import { useEdgeControlContext, type EdgeControlOffset } from './EdgeControlContext';

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
  selected,
}) => {
  const reactFlow = useReactFlow();
  const { beginEdgeControlAdjustment, updateEdgeControlPoint } = useEdgeControlContext();

  const [isDragging, setIsDragging] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastOffsetRef = useRef<EdgeControlOffset | null>(null);

  const manualCurve = data?.manualCurve ?? null;

  useEffect(() => {
    lastOffsetRef.current = manualCurve ? { ...manualCurve } : null;
  }, [manualCurve]);

  useEffect(
    () => () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        updateEdgeControlPoint(id, lastOffsetRef.current, { commit: true });
      }
    },
    [id, updateEdgeControlPoint],
  );

  const metadata = (data?.metadata || {}) as Record<string, string | string[]>;
  const pickMetadata = (key: string): string | undefined => {
    const value = metadata[key];
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : undefined;
    }
    return value;
  };

  const parallelCount = data?.parallelCount ?? 1;
  const parallelIndex = data?.parallelIndex ?? 0;
  const strokeColor = pickMetadata('strokeColor');
  const labelTextColor = pickMetadata('textColor');
  const labelBackground = pickMetadata('fillColor');

  const midpointX = (sourceX + targetX) / 2;
  const midpointY = (sourceY + targetY) / 2;
  const isSelfLoop = sourceX === targetX && sourceY === targetY;

  let path = '';
  let labelX = midpointX;
  let labelY = midpointY;
  let handleCandidate: { x: number; y: number } | null = null;

  if (isSelfLoop) {
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
  } else if (manualCurve) {
    const controlX = midpointX + manualCurve.offsetX;
    const controlY = midpointY + manualCurve.offsetY;
    path = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;
    labelX = 0.25 * sourceX + 0.5 * controlX + 0.25 * targetX;
    labelY = 0.25 * sourceY + 0.5 * controlY + 0.25 * targetY;
    handleCandidate = { x: controlX, y: controlY };
  } else if (parallelCount > 1) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const middleX = midpointX;
    const middleY = midpointY;
    const offsetIndex = parallelIndex - (parallelCount - 1) / 2;
    const curvature = offsetIndex * PARALLEL_OFFSET;
    const controlX = middleX + normalX * curvature;
    const controlY = middleY + normalY * curvature;
    path = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;
    labelX = controlX;
    labelY = controlY;
    handleCandidate = { x: controlX, y: controlY };
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
    handleCandidate = { x, y };
  }

  const strokeColorValue = strokeColor ? sanitizeColorValue(strokeColor) : undefined;

  const baseStyle = buildStrokeStyle(data?.variant);
  const mergedStyle: CSSProperties = {
    ...baseStyle,
    ...(strokeColorValue ? { stroke: strokeColorValue } : {}),
    ...(style ?? {}),
  };

  const markerColor = typeof mergedStyle.stroke === 'string' ? mergedStyle.stroke : DEFAULT_STROKE;

  const resolvedMarkerEnd = markerEnd ?? {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: markerColor,
  };

  const showControlHandle = !isSelfLoop && !!handleCandidate && selected;
  const handlePosition = handleCandidate ?? { x: labelX, y: labelY };
  const handleTransform = manualCurve
    ? `translate(-50%, -50%) translate(${handlePosition.x}px, ${handlePosition.y}px)`
    : `translate(-50%, -50%) translate(${handlePosition.x}px, ${handlePosition.y}px) translate(0px, -18px)`;

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!reactFlow) return;
      event.preventDefault();
      event.stopPropagation();
      if (cleanupRef.current) {
        cleanupRef.current();
      }

      beginEdgeControlAdjustment(id);
      setIsDragging(true);

      const pointerId = event.pointerId;

      const handleMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const flowPoint = reactFlow.screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
        const offset: EdgeControlOffset = {
          offsetX: flowPoint.x - midpointX,
          offsetY: flowPoint.y - midpointY,
        };
        lastOffsetRef.current = offset;
        updateEdgeControlPoint(id, offset);
      };

      const finishDrag = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);
        cleanupRef.current = null;
        setIsDragging(false);
      };

      const handleUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        finishDrag();
        updateEdgeControlPoint(id, lastOffsetRef.current, { commit: true });
      };

      const handleCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== pointerId) return;
        finishDrag();
        updateEdgeControlPoint(id, lastOffsetRef.current, { commit: true });
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleCancel);
      cleanupRef.current = () => {
        finishDrag();
      };
    },
    [beginEdgeControlAdjustment, id, midpointX, midpointY, reactFlow, updateEdgeControlPoint],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      beginEdgeControlAdjustment(id);
      lastOffsetRef.current = null;
      updateEdgeControlPoint(id, null, { commit: true });
    },
    [beginEdgeControlAdjustment, id, updateEdgeControlPoint],
  );

  const controlHandleStyle: React.CSSProperties = {
    width: 18,
    height: 18,
    background: '#2563eb',
    borderRadius: '9999px',
    border: '2px solid #ffffff',
    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
    cursor: isDragging ? 'grabbing' : 'grab',
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
              maxWidth: 220,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
      {showControlHandle && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: handleTransform,
              pointerEvents: 'auto',
              zIndex: 5,
            }}
            onPointerDown={handlePointerDown}
            onDoubleClick={handleDoubleClick}
            role="button"
            tabIndex={-1}
            title="ドラッグで曲線を調整 / ダブルクリックでリセット"
          >
            <div style={controlHandleStyle} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default MermaidEdge;
