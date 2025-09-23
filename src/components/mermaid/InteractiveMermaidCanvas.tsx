'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { initializeMermaid } from '@/lib/mermaid/mermaidClient';
import type { MermaidEdge, MermaidNode } from '@/lib/mermaid/types';

export interface MermaidSelection {
  type: 'node' | 'edge';
  id: string;
}

interface InteractiveMermaidCanvasProps {
  code: string;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  selected: MermaidSelection | null;
  onSelect: (selection: MermaidSelection | null) => void;
}

const escapeCss = (value: string): string => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
};

const restoreHighlight = (element: SVGGElement) => {
  const shapes = element.querySelectorAll<SVGElement>('rect, circle, ellipse, polygon, path');
  shapes.forEach((shape) => {
    const originalStroke = shape.getAttribute('data-ido-orig-stroke');
    const originalWidth = shape.getAttribute('data-ido-orig-stroke-width');
    if (originalStroke !== null) {
      if (originalStroke === '') {
        shape.removeAttribute('stroke');
      } else {
        shape.setAttribute('stroke', originalStroke);
      }
      shape.removeAttribute('data-ido-orig-stroke');
    }
    if (originalWidth !== null) {
      if (originalWidth === '') {
        shape.removeAttribute('stroke-width');
      } else {
        shape.setAttribute('stroke-width', originalWidth);
      }
      shape.removeAttribute('data-ido-orig-stroke-width');
    }
    shape.classList.remove('ido-selected-shape');
  });
};

const applyHighlight = (element: SVGGElement) => {
  const shapes = element.querySelectorAll<SVGElement>('rect, circle, ellipse, polygon, path');
  shapes.forEach((shape) => {
    if (!shape.hasAttribute('data-ido-orig-stroke')) {
      const stroke = shape.getAttribute('stroke');
      shape.setAttribute('data-ido-orig-stroke', stroke ?? '');
    }
    if (!shape.hasAttribute('data-ido-orig-stroke-width')) {
      const width = shape.getAttribute('stroke-width');
      shape.setAttribute('data-ido-orig-stroke-width', width ?? '');
    }
    shape.setAttribute('stroke', '#2563eb');
    shape.setAttribute('stroke-width', '3');
    shape.classList.add('ido-selected-shape');
  });
};

const findNodeElement = (svgElement: SVGSVGElement, nodeId: string): SVGGElement | null => {
  const escaped = escapeCss(nodeId);
  const selectors = [
    `g#${escaped}`,
    `#${escaped}`,
    `[id$='-${escaped}']`,
    `[id$='_${escaped}']`,
  ];

  for (const selector of selectors) {
    const found = svgElement.querySelector(selector);
    if (found) {
      const group = found instanceof SVGGElement ? found : found.closest('g');
      if (group) {
        return group as SVGGElement;
      }
    }
  }

  const groups = svgElement.querySelectorAll<SVGGElement>('g');
  for (const group of groups) {
    const title = group.querySelector('title');
    if (title?.textContent?.trim() === nodeId) {
      return group;
    }
    const dataId = group.getAttribute('data-id') ?? group.getAttribute('data-element-id');
    if (dataId === nodeId) {
      return group;
    }
  }

  return null;
};

const findEdgeElement = (svgElement: SVGSVGElement, edge: MermaidEdge): SVGGElement | null => {
  const selectors = ['g.edgePath', 'g.edgeLabel', 'g.messageLine', 'g.loopLine'];
  const candidates = svgElement.querySelectorAll<SVGGElement>(selectors.join(','));
  const source = edge.source;
  const target = edge.target;

  for (const candidate of candidates) {
    const classes = Array.from(candidate.classList);
    const hasSource = classes.some((cls) => cls === `LS-${source}` || cls.endsWith(`-${source}`));
    const hasTarget = classes.some((cls) => cls === `LE-${target}` || cls.endsWith(`-${target}`));
    if (hasSource && hasTarget) {
      return candidate;
    }
    const title = candidate.querySelector('title');
    if (title) {
      const text = title.textContent ?? '';
      if (text.includes(source) && text.includes(target)) {
        return candidate;
      }
    }
    const path = candidate.querySelector('path');
    const idAttr = path?.getAttribute('id') ?? candidate.getAttribute('id');
    if (idAttr && idAttr.includes(source) && idAttr.includes(target)) {
      return candidate;
    }
  }

  return null;
};

const InteractiveMermaidCanvas: React.FC<InteractiveMermaidCanvasProps> = ({
  code,
  nodes,
  edges,
  selected,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderCounterRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const svgClickHandlerRef = useRef<{
    element: SVGSVGElement | null;
    handler: ((event: MouseEvent) => void) | null;
  }>({ element: null, handler: null });

  const detachSvgHandler = useCallback(() => {
    const current = svgClickHandlerRef.current;
    if (current.element && current.handler) {
      current.element.removeEventListener('click', current.handler);
    }
    svgClickHandlerRef.current = { element: null, handler: null };
  }, []);

  const highlightSelection = useCallback((svgElement: SVGSVGElement | null) => {
    if (!svgElement) {
      return;
    }
    const highlighted = svgElement.querySelectorAll<SVGGElement>('[data-ido-selected="true"]');
    highlighted.forEach((element) => {
      element.removeAttribute('data-ido-selected');
      restoreHighlight(element);
    });

    if (!selected) {
      return;
    }

    const selector = `[data-ido-type="${selected.type}"][data-ido-id="${escapeCss(selected.id)}"]`;
    const target = svgElement.querySelector<SVGGElement>(selector);
    if (target) {
      target.setAttribute('data-ido-selected', 'true');
      applyHighlight(target);
    }
  }, [selected]);

  const annotateSvg = useCallback(
    (svgElement: SVGSVGElement) => {
      detachSvgHandler();

      const annotatedElements = svgElement.querySelectorAll<SVGGElement>('[data-ido-type]');
      annotatedElements.forEach((element) => {
        restoreHighlight(element);
        element.removeAttribute('data-ido-selected');
        element.removeAttribute('data-ido-type');
        element.removeAttribute('data-ido-id');
        element.style.cursor = '';
        element.style.pointerEvents = '';
        const shapes = element.querySelectorAll<SVGElement>('rect, circle, ellipse, polygon, path, text, foreignObject, line, polyline');
        shapes.forEach((shape) => {
          shape.style.pointerEvents = '';
        });
      });

      nodes.forEach((node) => {
        const element = findNodeElement(svgElement, node.id);
        if (element) {
          element.setAttribute('data-ido-type', 'node');
          element.setAttribute('data-ido-id', node.id);
          element.style.cursor = 'pointer';
          element.style.pointerEvents = 'auto';
          const shapes = element.querySelectorAll<SVGElement>('rect, circle, ellipse, polygon, path, text, foreignObject');
          shapes.forEach((shape) => {
            shape.style.pointerEvents = 'auto';
          });
        }
      });

      edges.forEach((edge) => {
        const element = findEdgeElement(svgElement, edge);
        if (element) {
          element.setAttribute('data-ido-type', 'edge');
          element.setAttribute('data-ido-id', edge.id);
          element.style.cursor = 'pointer';
          element.style.pointerEvents = 'auto';
          const shapes = element.querySelectorAll<SVGElement>('path, polygon, line, polyline, rect, circle, ellipse, text');
          shapes.forEach((shape) => {
            shape.style.pointerEvents = 'auto';
          });
        }
      });

      const handleSvgClick = (event: MouseEvent) => {
        const eventTarget = event.target as Element | null;
        const interactiveTarget = eventTarget?.closest('[data-ido-type]') as SVGGElement | null;
        if (!interactiveTarget) {
          onSelect(null);
          return;
        }

        event.stopPropagation();
        const type = interactiveTarget.getAttribute('data-ido-type');
        const id = interactiveTarget.getAttribute('data-ido-id');
        if (!type || !id) {
          onSelect(null);
          return;
        }

        onSelect({ type: type as 'node' | 'edge', id });
      };

      svgElement.addEventListener('click', handleSvgClick);
      svgClickHandlerRef.current = { element: svgElement, handler: handleSvgClick };
      highlightSelection(svgElement);
    },
    [detachSvgHandler, edges, nodes, onSelect, highlightSelection],
  );

  const renderDiagram = useCallback(async () => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    detachSvgHandler();
    if (!code.trim()) {
      container.innerHTML = '';
      setError(null);
      setIsRendering(false);
      return;
    }

    setIsRendering(true);
    setError(null);
    container.innerHTML = '';

    try {
      const mermaid = await initializeMermaid();
      if (!mermaid) {
        throw new Error('Mermaidライブラリの読み込みに失敗しました');
      }

      renderCounterRef.current += 1;
      const renderId = `interactive-${Date.now()}-${renderCounterRef.current}`;
      const { svg } = await mermaid.render(renderId, code);
      container.innerHTML = svg;
      const svgElement = container.querySelector('svg');
      if (!svgElement) {
        throw new Error('Mermaidの描画結果を取得できませんでした');
      }
      svgElement.style.maxWidth = 'none';
      annotateSvg(svgElement as SVGSVGElement);
    } catch (renderError) {
      console.error('Mermaid diagram render failed:', renderError);
      setError(renderError instanceof Error ? renderError.message : 'Mermaidの描画に失敗しました');
    } finally {
      setIsRendering(false);
    }
  }, [code, annotateSvg, detachSvgHandler]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  useEffect(() => {
    return () => {
      detachSvgHandler();
    };
  }, [detachSvgHandler]);

  useEffect(() => {
    const svgElement = containerRef.current?.querySelector('svg');
    if (svgElement) {
      highlightSelection(svgElement as SVGSVGElement);
    }
  }, [selected, highlightSelection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const handleBackgroundClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-ido-type]')) {
        onSelect(null);
      }
    };
    container.addEventListener('click', handleBackgroundClick);
    return () => {
      container.removeEventListener('click', handleBackgroundClick);
    };
  }, [onSelect]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white dark:bg-gray-950">
      <div ref={containerRef} className="h-full w-full overflow-auto p-4" />
      {!code.trim() && !isRendering && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Mermaidコードを入力すると図が表示されます。
        </div>
      )}
      {isRendering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-gray-600 dark:bg-gray-950/70 dark:text-gray-300">
          Mermaid図をレンダリングしています...
        </div>
      )}
      {error && !isRendering && (
        <div className="absolute bottom-3 right-3 max-w-sm rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
          {error}
        </div>
      )}
    </div>
  );
};

export default InteractiveMermaidCanvas;
