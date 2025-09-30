'use client';

import React, { useEffect, useRef, useState } from 'react';
import { initializeMermaid } from '@/lib/mermaid/mermaidClient';
import { normalizeMermaidSource } from '@/lib/mermaid/normalize';

interface MermaidCodePreviewProps {
  code: string;
  className?: string;
}

const MermaidCodePreview: React.FC<MermaidCodePreviewProps> = ({ code, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) {
      return;
    }

    let canceled = false;

    const render = async () => {
      const normalized = normalizeMermaidSource(code);
      if (!normalized) {
        target.innerHTML = '';
        setError('プレビューするMermaidコードがありません。');
        return;
      }

      setIsRendering(true);
      setError(null);

      try {
        const mermaid = await initializeMermaid();
        if (!mermaid) {
          throw new Error('Mermaidの初期化に失敗しました。');
        }

        const id = `mermaid-inline-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const { svg } = await mermaid.render(id, normalized);
        if (canceled) {
          return;
        }
        target.innerHTML = svg ?? '';
      } catch (err) {
        if (canceled) {
          return;
        }
        console.error('Mermaid inline preview error:', err);
        const message = err instanceof Error ? err.message : 'プレビューの生成に失敗しました。';
        setError(message);
        target.innerHTML = '';
      } finally {
        if (!canceled) {
          setIsRendering(false);
        }
      }
    };

    render();

    return () => {
      canceled = true;
      target.innerHTML = '';
    };
  }, [code]);

  return (
    <div className={className}>
      {isRendering && (
        <div className="text-sm text-gray-500 dark:text-gray-400">AIプレビューをレンダリング中…</div>
      )}
      {!isRendering && error && (
        <div className="text-sm text-red-500 dark:text-red-400">{error}</div>
      )}
      {!error && (
        <div
          ref={containerRef}
          className="mermaid-output text-left"
          aria-label="Mermaidプレビュー"
        />
      )}
    </div>
  );
};

export default MermaidCodePreview;
