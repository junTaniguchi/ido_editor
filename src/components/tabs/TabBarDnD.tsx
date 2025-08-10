/**
 * TabBarDnD.tsx
 * タブバーのドラッグ＆ドロップ並び替え対応版
 */
'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import { IoClose } from 'react-icons/io5';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

// ソート可能なタブ
function SortableTab({tabId, tab, active, onClick, onClose}: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({id: tabId});

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
      className={`
        flex items-center min-w-[120px] max-w-[200px] px-3 py-1 border-r border-gray-300 dark:border-gray-700
        ${active ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}
        cursor-pointer transition-colors select-none
      `}
      onClick={onClick}
    >
      <div className="flex-1 truncate text-sm">
        {tab.name}
        {tab.isDirty && <span className="ml-1 text-red-500">*</span>}
      </div>
      <button
        className="ml-2 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
        onClick={onClose}
        aria-label="Close tab"
      >
        <IoClose size={16} />
      </button>
    </div>
  );
}

const TabBarDnD = () => {
  const { tabs, activeTabId, setActiveTabId, removeTab, reorderTabs } = useEditorStore();
  const tabsArray = Array.from(tabs.entries());
  const tabIds = tabsArray.map(([id]) => id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // 並び替え時
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = tabIds.indexOf(active.id);
      const newIndex = tabIds.indexOf(over.id);
      const newOrder = arrayMove(tabIds, oldIndex, newIndex);
      reorderTabs(newOrder);
    }
  };

  // タブが1つもない場合
  if (tabsArray.length === 0) {
    return (
      <div className="flex h-10 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 px-2">
        <div className="flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm w-full">
          ファイルが開かれていません
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
        <div className="flex h-10 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 overflow-x-auto">
          {tabsArray.map(([tabId, tab]) => (
            <SortableTab
              key={tabId}
              tabId={tabId}
              tab={tab}
              active={activeTabId === tabId}
              onClick={() => setActiveTabId(tabId)}
              onClose={(e: React.MouseEvent) => { e.stopPropagation(); removeTab(tabId); }}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default TabBarDnD;
