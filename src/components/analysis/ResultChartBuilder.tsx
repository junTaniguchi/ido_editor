'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Data as PlotlyData, Layout as PlotlyLayout } from 'plotly.js';
import { aggregateData, flattenObjectsWithDotNotation } from '@/lib/dataAnalysisUtils';
import { IoChevronDownOutline, IoChevronForwardOutline } from 'react-icons/io5';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export type ResultChartType = 'bar' | 'line' | 'scatter' | 'pie' | 'histogram';
export type ResultAggregation = 'sum' | 'avg' | 'count' | 'min' | 'max';

interface ResultChartBuilderProps {
  rows: any[];
  title?: string;
  collapsedByDefault?: boolean;
  className?: string;
}

interface PlotState {
  data: PlotlyData[];
  layout: Partial<PlotlyLayout>;
}

const aggregationOptions: { value: ResultAggregation; label: string }[] = [
  { value: 'sum', label: '合計' },
  { value: 'avg', label: '平均' },
  { value: 'count', label: '件数' },
  { value: 'min', label: '最小' },
  { value: 'max', label: '最大' },
];

const chartTypeLabels: Record<ResultChartType, string> = {
  bar: '棒グラフ',
  line: '折れ線グラフ',
  scatter: '散布図',
  pie: '円グラフ',
  histogram: 'ヒストグラム',
};

const buildPlotConfig = (
  rows: any[],
  flattened: any[],
  chartType: ResultChartType,
  xField: string,
  yField: string,
  aggregation: ResultAggregation,
  bins: number,
  categoryField?: string
): { plot?: PlotState; error?: string } => {
  if (!rows || rows.length === 0) {
    return { error: 'チャートを作成するデータがありません' };
  }

  if (!xField) {
    return { error: 'X軸に使用する列を選択してください' };
  }

  const getSeriesFromAggregation = (sourceData: any[] = flattened) => {
    if (!yField && aggregation !== 'count') {
      return { error: 'Y軸の列が未選択の場合は集計方法に「件数」を指定してください' };
    }

    const result = aggregateData(sourceData, xField, yField || '', aggregation, false);
    if (result.error || !result.data) {
      return { error: result.error || '集計に失敗しました' };
    }

    if (yField) {
      const hasNumeric = sourceData.some(row => typeof row[yField] === 'number' && !Number.isNaN(row[yField]));
      if (!hasNumeric) {
        return { error: '選択したY軸の列には数値データが必要です' };
      }
    }

    const labels = result.data.map((row: any) => row[xField]);
    const values = result.data.map((row: any) => {
      if (yField && row.hasOwnProperty(yField)) {
        return row[yField];
      }
      return row.value;
    });

    return { labels, values };
  };

  try {
    switch (chartType) {
      case 'scatter': {
        if (!yField) {
          return { error: '散布図にはY軸に使用する数値列が必要です' };
        }
        const xValues = flattened.map(row => row[xField]).filter(value => value !== undefined && value !== null);
        const yValues = flattened
          .map(row => row[yField])
          .filter(value => typeof value === 'number' && !Number.isNaN(value));

        if (xValues.length === 0 || yValues.length === 0) {
          return { error: '散布図を作成できる十分なデータがありません' };
        }

        const categoriesRaw = categoryField
          ? [...new Set(flattened
              .map(row => row[categoryField])
              .filter(value => value !== undefined && value !== null)
              .map(value => String(value)))]
          : [];
        const categories = categoryField ? (categoriesRaw.length > 0 ? categoriesRaw : [undefined]) : [undefined];

        const colorPalette = [
          '#2563eb',
          '#ef4444',
          '#10b981',
          '#f59e0b',
          '#8b5cf6',
          '#ec4899',
          '#14b8a6',
          '#f97316',
          '#6366f1',
        ];

        const traces: PlotlyData[] = [];

        categories.forEach((category, index) => {
          const filtered = category
            ? flattened.filter(row => String(row[categoryField!]) === category)
            : flattened;

          const xValuesCat = filtered
            .map(row => row[xField])
            .filter(value => value !== undefined && value !== null);
          const yValuesCat = filtered
            .map(row => row[yField])
            .filter(value => typeof value === 'number' && !Number.isNaN(value));

          if (xValuesCat.length > 0 && yValuesCat.length > 0) {
            const displayName = category
              || (categoryField ? '未分類' : (yField || (aggregation === 'count' ? 'count' : 'value')));
            traces.push({
              type: 'scatter',
              mode: 'markers',
              x: xValuesCat,
              y: yValuesCat,
              name: displayName,
              marker: {
                color: colorPalette[index % colorPalette.length],
                size: 8,
                opacity: 0.8,
              },
            } as PlotlyData);
          }
        });

        if (traces.length === 0) {
          return { error: '散布図を作成できるデータがありません' };
        }

        return {
          plot: {
            data: traces,
            layout: {
              autosize: true,
              height: 320,
              margin: { t: 40, r: 20, b: 60, l: 60 },
              xaxis: { title: xField },
              yaxis: { title: yField },
              showlegend: traces.length > 1,
            },
          },
        };
      }

      case 'histogram': {
        if (categoryField) {
          return { error: 'ヒストグラムではグループ分けを利用できません' };
        }
        const values = flattened
          .map(row => row[xField])
          .filter(value => typeof value === 'number' && !Number.isNaN(value));

        if (values.length === 0) {
          return { error: 'ヒストグラムには数値列が必要です' };
        }

        const trace: Partial<PlotlyData> = {
          type: 'histogram',
          x: values,
          nbinsx: bins,
          marker: { color: '#34d399' },
          opacity: 0.8,
        };

        return {
          plot: {
            data: [trace as PlotlyData],
            layout: {
              autosize: true,
              height: 320,
              margin: { t: 40, r: 20, b: 60, l: 60 },
              xaxis: { title: xField },
              yaxis: { title: '度数' },
            },
          },
        };
      }

      case 'pie': {
        if (categoryField) {
          return { error: '円グラフではグループ分けを利用できません' };
        }
        const { labels, values, error } = getSeriesFromAggregation();
        if (error) return { error };
        if (!labels || !values || values.every(v => v === undefined || v === null)) {
          return { error: '円グラフを作成できるデータがありません' };
        }

        const trace: Partial<PlotlyData> = {
          type: 'pie',
          labels,
          values,
          hole: 0,
        };

        return {
          plot: {
            data: [trace as PlotlyData],
            layout: {
              autosize: true,
              height: 320,
              margin: { t: 40, r: 20, b: 40, l: 20 },
              legend: { orientation: 'h' },
            },
          },
        };
      }

      case 'line':
      case 'bar': {
        const categoriesRaw = categoryField
          ? [...new Set(flattened
              .map(row => row[categoryField])
              .filter(value => value !== undefined && value !== null)
              .map(value => String(value)))]
          : [];
        const categories = categoryField ? (categoriesRaw.length > 0 ? categoriesRaw : [undefined]) : [undefined];

        const colorPalette = [
          '#2563eb',
          '#ef4444',
          '#10b981',
          '#f59e0b',
          '#8b5cf6',
          '#ec4899',
          '#14b8a6',
          '#f97316',
          '#6366f1',
        ];

        const allLabelsSet = new Set<string | number>();
        const seriesMaps: { category: string; values: Map<string | number, number> }[] = [];

        categories.forEach((category, index) => {
          const filtered = category
            ? flattened.filter(row => String(row[categoryField!]) === category)
            : flattened;

          const { labels, values, error } = getSeriesFromAggregation(filtered);
          if (error || !labels || !values) {
            return;
          }
          const valueMap = new Map<string | number, number>();
          labels.forEach((label, idx) => {
            const value = values[idx];
            if (value !== undefined && value !== null) {
              valueMap.set(label, value);
            }
            allLabelsSet.add(label);
          });
          const displayName = category
            || (categoryField ? `未分類` : (yField || (aggregation === 'count' ? 'count' : 'value')));
          seriesMaps.push({ category: displayName, values: valueMap });
        });

        const labels = Array.from(allLabelsSet);
        if (labels.length === 0 || seriesMaps.length === 0) {
          return { error: 'チャートを作成できるデータがありません' };
        }

        const traces: PlotlyData[] = seriesMaps.map((series, idx) => {
          const data = labels.map(label => {
            const value = series.values.get(label);
            return value !== undefined ? value : 0;
          });

          return {
            type: chartType === 'bar' ? 'bar' : 'scatter',
            mode: chartType === 'line' ? 'lines+markers' : undefined,
            x: labels,
            y: data,
            name: series.category,
            marker: {
              color: colorPalette[idx % colorPalette.length],
            },
            line: chartType === 'line' ? { color: colorPalette[idx % colorPalette.length], width: 2 } : undefined,
          } as PlotlyData;
        });

        return {
          plot: {
            data: traces,
            layout: {
              autosize: true,
              height: 320,
              margin: { t: 40, r: 20, b: 60, l: 60 },
              xaxis: { title: xField },
              yaxis: { title: yField || '値' },
              barmode: chartType === 'bar' && categories.length > 1 ? 'group' : undefined,
              showlegend: categories.length > 1,
            },
          },
        };
      }

      default:
        return { error: '未対応のチャートタイプです' };
    }
  } catch (err) {
    console.error('Inline chart error:', err);
    return { error: err instanceof Error ? err.message : 'チャート生成中にエラーが発生しました' };
  }
};

const ResultChartBuilder: React.FC<ResultChartBuilderProps> = ({
  rows,
  title = 'チャート',
  collapsedByDefault = false,
  className,
}) => {
  const flattened = useMemo(() => flattenObjectsWithDotNotation(rows || []), [rows]);
  const availableColumns = useMemo(() => {
    if (!flattened || flattened.length === 0) return [];
    return Object.keys(flattened[0]);
  }, [flattened]);

  const numericColumns = useMemo(() => {
    return availableColumns.filter(col =>
      flattened.some(row => typeof row[col] === 'number' && !Number.isNaN(row[col]))
    );
  }, [availableColumns, flattened]);

  const [categoryField, setCategoryField] = useState<string>('');

  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const [chartType, setChartType] = useState<ResultChartType>('bar');
  const [xField, setXField] = useState<string>('');
  const [yField, setYField] = useState<string>('');
  const [aggregation, setAggregation] = useState<ResultAggregation>('sum');
  const [bins, setBins] = useState<number>(20);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (availableColumns.length > 0) {
      setXField(prev => (prev && availableColumns.includes(prev) ? prev : availableColumns[0]));
    } else {
      setXField('');
    }
  }, [availableColumns]);

  useEffect(() => {
    if (numericColumns.length > 0) {
      setYField(prev => (prev && numericColumns.includes(prev) ? prev : numericColumns[0]));
    } else {
      setYField('');
    }
  }, [numericColumns]);

  useEffect(() => {
    if (categoryField && !availableColumns.includes(categoryField)) {
      setCategoryField('');
    }
  }, [availableColumns, categoryField]);

  const supportsCategory = chartType === 'bar' || chartType === 'line' || chartType === 'scatter';

  useEffect(() => {
    if (!supportsCategory && categoryField) {
      setCategoryField('');
    }
  }, [supportsCategory, categoryField]);

  useEffect(() => {
    if ((chartType === 'bar' || chartType === 'line' || chartType === 'pie') && !yField && aggregation !== 'count') {
      setAggregation('count');
    }
  }, [chartType, yField, aggregation]);

  const allowAggregation = chartType === 'bar' || chartType === 'line' || chartType === 'pie';
  const requiresNumericY = chartType === 'scatter' || chartType === 'line' || chartType === 'bar';
  const canSelectYField = chartType !== 'histogram';

  const { plot } = useMemo(() => {
    if (!expanded) return { plot: undefined };
    const { plot, error: plotError } = buildPlotConfig(
      rows,
      flattened,
      chartType,
      xField,
      canSelectYField ? yField : '',
      aggregation,
      bins,
      supportsCategory && categoryField ? categoryField : undefined
    );
    setError(plotError || null);
    return { plot };
  }, [rows, flattened, chartType, xField, yField, aggregation, bins, expanded, canSelectYField, supportsCategory, categoryField]);

  const aggregationDisabled = !allowAggregation || !xField || (requiresNumericY && !yField);
  const showYField = canSelectYField && (chartType !== 'pie' || numericColumns.length > 0);

  return (
    <div className={className}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 text-left rounded"
        onClick={() => setExpanded(prev => !prev)}
      >
        <span className="font-medium text-sm text-gray-700 dark:text-gray-200">{title}</span>
        {expanded ? <IoChevronDownOutline size={16} /> : <IoChevronForwardOutline size={16} />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
              チャートタイプ
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value as ResultChartType)}
                className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              >
                {(Object.keys(chartTypeLabels) as ResultChartType[]).map(type => (
                  <option key={type} value={type}>{chartTypeLabels[type]}</option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
              X軸の列
              <select
                value={xField}
                onChange={(e) => setXField(e.target.value)}
                className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              >
                <option value="">列を選択</option>
                {availableColumns.map(column => (
                  <option key={column} value={column}>{column}</option>
                ))}
              </select>
            </label>

            {showYField && (
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                Y軸の列
                <select
                  value={yField}
                  onChange={(e) => setYField(e.target.value)}
                  className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  <option value="">列を選択</option>
                  {numericColumns.map(column => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
              </label>
            )}

            {allowAggregation && (
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                集計方法
                <select
                  value={aggregation}
                  onChange={(e) => setAggregation(e.target.value as ResultAggregation)}
                  className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  disabled={aggregationDisabled}
                >
                  {aggregationOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}

            {supportsCategory && (
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1 col-span-full lg:col-span-1">
                グループ分け
                <select
                  value={categoryField}
                  onChange={(e) => setCategoryField(e.target.value)}
                  className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  <option value="">グループ分けなし</option>
                  {availableColumns.map(column => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
              </label>
            )}

            {chartType === 'histogram' && (
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                ビン数
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={bins}
                  onChange={(e) => setBins(Number(e.target.value) || 10)}
                  className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                />
              </label>
            )}
          </div>

          {error ? (
            <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
              {error}
            </div>
          ) : plot ? (
            <div className="border border-gray-200 dark:border-gray-800 rounded">
              <Plot data={plot.data} layout={plot.layout} style={{ width: '100%', height: '100%' }} config={{ responsive: true }} />
            </div>
          ) : (
            <div className="p-4 text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-300 rounded">
              チャートを表示するには設定を選択してください。
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultChartBuilder;
