'use client';

import React, { useCallback, useEffect, useRef } from 'react';

type SidebarHandlePosition = 'left' | 'right';

interface ResizableSidebarProps {
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
  onResizeEnd?: (width: number) => void;
  className?: string;
  handleClassName?: string;
  children: React.ReactNode;
  handlePosition?: SidebarHandlePosition;
}

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  width,
  minWidth = 200,
  maxWidth = 600,
  onResize,
  onResizeEnd,
  className = '',
  handleClassName = '',
  children,
  handlePosition = 'right',
}) => {
  const widthRef = useRef(width);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const startDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = widthRef.current;
      const direction = handlePosition === 'right' ? 1 : -1;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const nextWidth = clamp(startWidth + direction * deltaX, minWidth, maxWidth);

        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
        }

        frameRef.current = requestAnimationFrame(() => {
          widthRef.current = nextWidth;
          onResize?.(nextWidth);
        });
      };

      const handlePointerUp = () => {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.body.style.userSelect = '';
        onResizeEnd?.(widthRef.current);
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.body.style.userSelect = 'none';
    },
    [handlePosition, maxWidth, minWidth, onResize, onResizeEnd],
  );

  return (
    <div
      className={`relative flex-shrink-0 overflow-hidden ${className}`}
      style={{ width: `${width}px` }}
    >
      <div className="h-full w-full overflow-hidden">{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={startDragging}
        className={`absolute top-0 ${
          handlePosition === 'right' ? 'right-0' : 'left-0'
        } h-full w-2 cursor-col-resize touch-none select-none ${handleClassName}`}
      >
        <div className="relative flex h-full items-center justify-center">
          <div className="h-12 w-px rounded bg-gray-300 dark:bg-gray-600" />
        </div>
      </div>
    </div>
  );
};

export default ResizableSidebar;
