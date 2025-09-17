'use client';

import React, { useMemo, useState } from 'react';
import ResultChartBuilder from './ResultChartBuilder';
import QueryResultTable from './QueryResultTable';
import EditableQueryResultTable from './EditableQueryResultTable';
import { IoBarChartOutline, IoCodeSlash } from 'react-icons/io5';

interface ResultChartPanelProps {
  rows: any[];
  originalRows?: any[] | null;
  isEditable?: boolean;
  isEditing?: boolean;
  onToggleEdit?: () => void;
  onEditedRowsChange?: (rows: any[]) => void;
  editingRows?: any[] | null;
  enableChart?: boolean;
  chartTitle?: string;
  initialView?: 'table' | 'chart';
  activeView?: 'table' | 'chart';
  onViewChange?: (view: 'table' | 'chart') => void;
}

const ResultChartPanel: React.FC<ResultChartPanelProps> = ({
  rows,
  originalRows = null,
  isEditable = false,
  isEditing = false,
  onToggleEdit,
  onEditedRowsChange,
  editingRows,
  enableChart = true,
  chartTitle = 'チャート',
  initialView = 'table',
  activeView,
  onViewChange,
}) => {
  const [internalView, setInternalView] = useState<'table' | 'chart'>(initialView);
  const effectiveRows = useMemo(() => (isEditing && editingRows ? editingRows : rows), [isEditing, editingRows, rows]);

  const handleToggleView = (view: 'table' | 'chart') => {
    if (onViewChange) {
      onViewChange(view);
    } else {
      setInternalView(view);
    }
  };

  const currentView = activeView ?? internalView;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2">
        <div className="space-x-2">
          <button
            className={`inline-flex items-center px-3 py-1 text-sm rounded ${
              currentView === 'table'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            onClick={() => handleToggleView('table')}
          >
            <IoCodeSlash className="mr-1" size={16} /> テーブル
          </button>
          {enableChart && (
            <button
              className={`inline-flex items-center px-3 py-1 text-sm rounded ${
                currentView === 'chart'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onClick={() => handleToggleView('chart')}
            >
              <IoBarChartOutline className="mr-1" size={16} /> チャート
            </button>
          )}
        </div>
        {isEditable && onToggleEdit && (
          <button
            className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded"
            onClick={onToggleEdit}
          >
            {isEditing ? '表示モード' : '編集モード'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {currentView === 'table' ? (
          isEditing && editingRows && onEditedRowsChange ? (
            <EditableQueryResultTable data={editingRows} onDataChange={onEditedRowsChange} />
          ) : (
            <QueryResultTable data={effectiveRows} />
          )
        ) : (
          <div className="p-3">
            <ResultChartBuilder
              rows={originalRows ?? rows}
              title={chartTitle}
              collapsedByDefault={false}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultChartPanel;
