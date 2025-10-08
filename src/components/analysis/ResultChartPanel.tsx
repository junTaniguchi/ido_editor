'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ResultChartBuilder from './ResultChartBuilder';
import QueryResultTable from './QueryResultTable';
import EditableQueryResultTable from './EditableQueryResultTable';
import { IoBarChartOutline, IoCodeSlash, IoLayersOutline } from 'react-icons/io5';
import type { ChartDesignerSettings } from '@/types';

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
  tableViewMode?: 'react-table' | 'spread';
  onTableViewModeChange?: (mode: 'react-table' | 'spread') => void;
  dataDisplayMode?: 'flat' | 'nested';
  onToggleDataDisplayMode?: () => void;
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
  tableViewMode,
  onTableViewModeChange,
  dataDisplayMode,
  onToggleDataDisplayMode,
}) => {
  const [internalView, setInternalView] = useState<'table' | 'chart'>(initialView);
  const [persistedChartSettings, setPersistedChartSettings] = useState<ChartDesignerSettings | undefined>(undefined);
  const effectiveRows = useMemo(() => (isEditing && editingRows ? editingRows : rows), [isEditing, editingRows, rows]);
  const [internalTableViewMode, setInternalTableViewMode] = useState<'react-table' | 'spread'>('react-table');

  const handleToggleView = (view: 'table' | 'chart') => {
    if (onViewChange) {
      onViewChange(view);
    } else {
      setInternalView(view);
    }
  };

  const handleChartSettingsChange = useCallback((settings: ChartDesignerSettings) => {
    setPersistedChartSettings(previous => {
      if (!previous) {
        return settings;
      }

      const keys = new Set([...Object.keys(previous), ...Object.keys(settings)]);
      for (const key of keys) {
        if ((previous as Record<string, unknown>)[key] !== (settings as Record<string, unknown>)[key]) {
          return settings;
        }
      }
      return previous;
    });
  }, []);

  const currentView = activeView ?? internalView;
  const effectiveTableViewMode = tableViewMode ?? internalTableViewMode;
  const activeTableViewMode = isEditing ? 'react-table' : effectiveTableViewMode;

  const handleSetTableViewMode = useCallback((mode: 'react-table' | 'spread') => {
    if (onTableViewModeChange) {
      onTableViewModeChange(mode);
    } else {
      setInternalTableViewMode(mode);
    }
  }, [onTableViewModeChange]);

  useEffect(() => {
    if (isEditing && effectiveTableViewMode !== 'react-table') {
      handleSetTableViewMode('react-table');
    }
  }, [handleSetTableViewMode, isEditing, effectiveTableViewMode]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2">
        <div className="space-x-2 flex items-center">
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
          {currentView === 'table' && (
            <div className="inline-flex items-center ml-4 space-x-2">
              <button
                className={`px-2 py-1 text-xs rounded border transition-colors ${activeTableViewMode === 'react-table' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                onClick={() => handleSetTableViewMode('react-table')}
              >
                React Table
              </button>
              <button
                className={`px-2 py-1 text-xs rounded border transition-colors ${activeTableViewMode === 'spread' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'} ${isEditing ? 'opacity-50 cursor-not-allowed hover:bg-white dark:hover:bg-gray-800' : ''}`}
                onClick={() => !isEditing && handleSetTableViewMode('spread')}
                disabled={isEditing}
              >
                SpreadJS
              </button>
              {onToggleDataDisplayMode && dataDisplayMode && (
                <button
                  className="inline-flex items-center px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={onToggleDataDisplayMode}
                  title={dataDisplayMode === 'flat' ? '階層表示に切替' : 'フラット表示に切替'}
                >
                  <IoLayersOutline className="mr-1" size={14} />
                  {dataDisplayMode === 'flat' ? '階層表示' : 'フラット表示'}
                </button>
              )}
            </div>
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
            <EditableQueryResultTable data={editingRows} onDataChange={onEditedRowsChange} viewMode="react-table" />
          ) : (
            <QueryResultTable data={effectiveRows} viewMode={activeTableViewMode} />
          )
        ) : (
          <div className="p-3 h-full overflow-auto">
            <ResultChartBuilder
              rows={originalRows ?? rows}
              title={chartTitle}
              collapsedByDefault={false}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded h-full flex flex-col"
              initialSettings={persistedChartSettings}
              onSettingsChange={handleChartSettingsChange}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultChartPanel;
