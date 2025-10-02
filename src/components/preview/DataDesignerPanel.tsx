'use client';

import React, { useMemo } from 'react';
import ResultChartBuilder from '@/components/analysis/ResultChartBuilder';
import type { ChartDesignerSettings } from '@/types';

const MAX_DESIGNER_ROWS = 5000;

interface DataDesignerPanelProps {
  rows: any[];
  columns: string[];
  initialSettings?: ChartDesignerSettings;
  onSettingsChange?: (settings: ChartDesignerSettings) => void;
  className?: string;
}

const DataDesignerPanel: React.FC<DataDesignerPanelProps> = ({
  rows,
  columns,
  initialSettings,
  onSettingsChange,
  className,
}) => {
  const sanitizedRows = useMemo(() => {
    if (!Array.isArray(rows)) {
      return [];
    }
    if (rows.length <= MAX_DESIGNER_ROWS) {
      return rows;
    }
    return rows.slice(0, MAX_DESIGNER_ROWS);
  }, [rows]);

  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const truncated = rowCount > MAX_DESIGNER_ROWS;
  const hasTabularData = sanitizedRows.length > 0 && columns.length > 0;

  if (!hasTabularData) {
    return (
      <div className="p-4 text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded">
        データデザイナーを利用するには表形式のデータが必要です。
      </div>
    );
  }

  return (
    <div className={className ?? 'space-y-3'}>
      {truncated && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-200">
          大規模データセットのため、先頭{MAX_DESIGNER_ROWS.toLocaleString()}件のみをチャートに利用しています。
        </div>
      )}
      <ResultChartBuilder
        rows={sanitizedRows}
        title="データデザイナー"
        collapsedByDefault={initialSettings?.collapsed ?? false}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded"
        initialSettings={initialSettings}
        onSettingsChange={onSettingsChange}
      />
    </div>
  );
};

export default DataDesignerPanel;
