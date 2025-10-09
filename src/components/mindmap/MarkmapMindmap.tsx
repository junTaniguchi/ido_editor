'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import type { IPureNode } from 'markmap-common';
import { Markmap } from 'markmap-view';

export interface MarkmapMindmapProps {
  markdown: string;
  className?: string;
}

const MarkmapMindmap: React.FC<MarkmapMindmapProps> = ({ markdown, className }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const markmapRef = useRef<Markmap | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const transformer = useMemo(() => new Transformer(), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!resizeObserverRef.current) {
      resizeObserverRef.current = new ResizeObserver(() => {
        if (markmapRef.current) {
          markmapRef.current.fit();
        }
      });
    }

    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const { root } = transformer.transform(markdown || '');

    if (!markmapRef.current) {
      markmapRef.current = Markmap.create(svgRef.current, undefined, root as IPureNode);
    } else {
      markmapRef.current.setData(root as IPureNode);
    }

    requestAnimationFrame(() => {
      markmapRef.current?.fit();
    });
  }, [markdown, transformer]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      markmapRef.current?.destroy();
      markmapRef.current = null;
    };
  }, []);

  const showPlaceholder = !markdown || markdown.trim() === '';

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-auto ${className ?? ''}`}>
      <svg ref={svgRef} className="min-h-[320px] w-full text-gray-900 dark:text-gray-100" />
      {showPlaceholder && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            見出しやリスト形式でMarkdownを記述すると、ここにMarkmap風のマインドマップが自動生成されます。
            見出し階層や箇条書きを使って構造を表現してください。
          </p>
        </div>
      )}
    </div>
  );
};

export default MarkmapMindmap;
