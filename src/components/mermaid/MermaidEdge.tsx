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

type EdgeAnimationKey = 'flow' | 'fast' | 'strong' | 'pulse';

interface EdgeAnimationPreset {
  className: string;
  overlayWidth: number;
  opacity: number;
  dashArray: string;
  duration: number;
  offset: number;
  pulse?: boolean;
  glowIntensity: number;
  coreBoost: number;
  particle?: {
    radius: number;
    opacity: number;
    glow: number;
    mixRatio: number;
    count: number;
  };
}

const animationPresets: Record<EdgeAnimationKey, EdgeAnimationPreset> = {
  flow: {
    className: 'edge-animation-flow',
    overlayWidth: 2.8,
    opacity: 0.85,
    dashArray: '4 12',
    duration: 1.2,
    offset: 16,
    glowIntensity: 0.55,
    coreBoost: 0.35,
  },
  fast: {
    className: 'edge-animation-fast',
    overlayWidth: 2.4,
    opacity: 0.85,
    dashArray: '3 9',
    duration: 0.75,
    offset: 12,
    glowIntensity: 0.6,
    coreBoost: 0.4,
    particle: {
      radius: 3.2,
      opacity: 0.95,
      glow: 0.55,
      mixRatio: 0.4,
      count: 2,
    },
  },
  strong: {
    className: 'edge-animation-strong',
    overlayWidth: 3.2,
    opacity: 0.9,
    dashArray: '6 18',
    duration: 1.6,
    offset: 18,
    glowIntensity: 0.65,
    coreBoost: 0.45,
    particle: {
      radius: 3.6,
      opacity: 0.9,
      glow: 0.5,
      mixRatio: 0.35,
      count: 2,
    },
  },
  pulse: {
    className: 'edge-animation-pulse',
    overlayWidth: 2.6,
    opacity: 0.85,
    dashArray: '3 24',
    duration: 1.2,
    offset: 20,
    pulse: true,
    glowIntensity: 0.65,
    coreBoost: 0.5,
    particle: {
      radius: 3.4,
      opacity: 0.9,
      glow: 0.55,
      mixRatio: 0.5,
      count: 3,
    },
  },
};

const variantAnimationMap: Record<string, EdgeAnimationKey> = {
  arrow: 'flow',
  dashed: 'fast',
  thick: 'strong',
  solid: 'flow',
  open: 'pulse',
  inheritance: 'strong',
  composition: 'strong',
  aggregation: 'flow',
  association: 'flow',
  dependency: 'fast',
  transition: 'flow',
  identifying: 'strong',
  nonidentifying: 'fast',
  onetomany: 'strong',
  manytomany: 'pulse',
};

const normalizeAnimationKey = (value: string | undefined): EdgeAnimationKey | null => {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (key === 'none' || key === 'off') {
    return null;
  }
  if (key in animationPresets) {
    return key as EdgeAnimationKey;
  }
  switch (key) {
    case 'fast-flow':
    case 'quick':
      return 'fast';
    case 'strong-flow':
    case 'heavy':
      return 'strong';
    case 'glow':
      return 'pulse';
    default:
      return null;
  }
};

const resolveEdgeAnimation = (
  variant: string | undefined,
  metadataAnimation: string | undefined,
): EdgeAnimationPreset | null => {
  const override = normalizeAnimationKey(metadataAnimation);
  if (override) {
    return animationPresets[override];
  }
  const normalizedVariant = variant ? variant.toLowerCase() : '';
  const mapped = variantAnimationMap[normalizedVariant];
  if (!mapped) return animationPresets.flow;
  return animationPresets[mapped];
};

const expandShortHex = (value: string): string =>
  `#${value
    .slice(1)
    .split('')
    .map((char) => char + char)
    .join('')}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mixWithWhite = (input: string, ratio: number): string => {
  const normalizedRatio = clamp(ratio, 0, 1);
  if (/^#[0-9a-fA-F]{3}$/.test(input) || /^#[0-9a-fA-F]{6}$/.test(input)) {
    const normalized = input.length === 4 ? expandShortHex(input) : input.toLowerCase();
    const value = normalized.slice(1);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    const blend = (component: number) => component + (255 - component) * normalizedRatio;
    const toHex = (component: number) => clamp(component, 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(Math.round(blend(r)))}${toHex(Math.round(blend(g)))}${toHex(Math.round(blend(b)))}`;
  }

  const rgbMatch = input.match(/rgba?\s*\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+)\s*)?\)/i);
  if (rgbMatch) {
    const [, rs, gs, bs, as] = rgbMatch;
    const r = Number(rs);
    const g = Number(gs);
    const b = Number(bs);
    const alpha = as !== undefined ? clamp(Number(as), 0, 1) : 1;
    const blend = (component: number) => component + (255 - component) * normalizedRatio;
    return `rgba(${clamp(blend(r), 0, 255)}, ${clamp(blend(g), 0, 255)}, ${clamp(blend(b), 0, 255)}, ${alpha})`;
  }

  return input;
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
  const metadataAnimation = pickMetadata('animation') ?? pickMetadata('edgeAnimation');

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
  const animationPreset = resolveEdgeAnimation(data?.variant, metadataAnimation);
  const baseStrokeWidth = typeof mergedStyle.strokeWidth === 'number'
    ? mergedStyle.strokeWidth
    : DEFAULT_STROKE_WIDTH;

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

  const overlayWidth = animationPreset
    ? Math.max(animationPreset.overlayWidth, baseStrokeWidth * 0.9)
    : null;
  const highlightColor = animationPreset ? mixWithWhite(markerColor, 0.6) : null;
  const glowColor = animationPreset ? mixWithWhite(markerColor, 0.9) : null;
  const particleColor = animationPreset?.particle ? mixWithWhite(markerColor, animationPreset.particle.mixRatio) : null;

  const renderAnimatedOverlay = (
    stroke: string,
    width: number,
    opacity: number,
    key: string,
  ) => (
    <path
      key={key}
      d={path}
      className={`pointer-events-none ${animationPreset?.className ?? ''}`}
      style={{
        stroke,
        strokeWidth: width,
        opacity,
        fill: 'none',
        strokeLinecap: 'round',
        strokeDasharray: animationPreset?.dashArray,
        mixBlendMode: 'screen',
        filter: `drop-shadow(0 0 4px rgba(255,255,255,${animationPreset.glowIntensity}))`,
      }}
    >
      <animate
        attributeName="stroke-dashoffset"
        values={`0;-${animationPreset?.offset ?? 24}`}
        dur={`${animationPreset?.duration ?? 1.5}s`}
        repeatCount="indefinite"
        calcMode="linear"
      />
      {animationPreset?.pulse && (
        <animate
          attributeName="stroke-opacity"
          values={`${opacity};${Math.min(1, opacity + 0.4)};${opacity}`}
          dur={`${animationPreset.duration}s`}
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
        />
      )}
    </path>
  );

  const renderParticle = (index: number) => {
    if (!animationPreset?.particle || !particleColor) return null;
    const { radius, opacity, glow, count } = animationPreset.particle;
    const delay = (animationPreset.duration / Math.max(1, count)) * index;
    return (
      <circle
        key={`particle-${index}`}
        r={radius}
        fill={particleColor}
        opacity={opacity}
        style={{ filter: `drop-shadow(0 0 6px rgba(255,255,255,${glow}))` }}
      >
        <animateMotion
          dur={`${animationPreset.duration}s`}
          begin={`${delay}s`}
          repeatCount="indefinite"
          path={path}
          rotate="auto"
        />
        <animate
          attributeName="opacity"
          values={`${opacity};${opacity * 0.6};${opacity}`}
          dur={`${animationPreset.duration}s`}
          begin={`${delay}s`}
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
        />
      </circle>
    );
  };

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={resolvedMarkerEnd} style={mergedStyle} />
      {animationPreset && overlayWidth && highlightColor && glowColor && (
        <>
          {renderAnimatedOverlay(glowColor, overlayWidth * 1.6, animationPreset.opacity * animationPreset.glowIntensity, 'glow')}
          {renderAnimatedOverlay(highlightColor, overlayWidth, Math.min(1, animationPreset.opacity + animationPreset.coreBoost), 'core')}
        </>
      )}
      {animationPreset?.particle && (
        <g className="pointer-events-none">
          {Array.from({ length: animationPreset.particle.count }).map((_, index) => renderParticle(index))}
        </g>
      )}
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
