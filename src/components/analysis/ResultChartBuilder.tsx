'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Data as PlotlyData, Layout as PlotlyLayout } from 'plotly.js';
import { aggregateData, flattenObjectsWithDotNotation, calculateRegressionLine, getRegressionTypeLabel } from '@/lib/dataAnalysisUtils';
import { IoChevronDownOutline, IoChevronForwardOutline } from 'react-icons/io5';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

const parseDateValue = (value: any): Date | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    if (!Number.isNaN(fromNumber.getTime())) {
      return fromNumber;
    }
  }

  if (typeof value === 'string' && value.trim() === '') return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isParsableDateValue = (value: any): boolean => parseDateValue(value) !== null;

export type ResultChartType =
  | 'bar'
  | 'line'
  | 'scatter'
  | 'pie'
  | 'histogram'
  | 'stacked-bar'
  | 'regression'
  | 'bubble'
  | 'sunburst'
  | 'gantt';
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
  'stacked-bar': '積み上げ棒グラフ',
  regression: '線形回帰',
  bubble: 'バブルチャート',
  sunburst: 'サンバーストチャート',
  gantt: 'ガントチャート',
};

const buildPlotConfig = (
  rows: any[],
  flattened: any[],
  chartType: ResultChartType,
  xField: string,
  yField: string,
  aggregation: ResultAggregation,
  bins: number,
  categoryField?: string,
  options?: {
    bubbleSizeField?: string;
    ganttTaskField?: string;
    ganttStartField?: string;
    ganttEndField?: string;
  }
): { plot?: PlotState; error?: string } => {
  if (!rows || rows.length === 0) {
    return { error: 'チャートを作成するデータがありません' };
  }

  if (chartType !== 'gantt' && !xField) {
    return { error: 'X軸に使用する列を選択してください' };
  }

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
      if (yField && Object.prototype.hasOwnProperty.call(row, yField)) {
        return row[yField];
      }
      return row.value;
    });

    return { labels, values };
  };

  try {
    if (chartType === 'scatter') {
      if (!yField) {
        return { error: '散布図にはY軸に使用する数値列が必要です' };
      }

      const categoriesRaw = categoryField
        ? [...new Set(
            flattened
              .map(row => row[categoryField])
              .filter(value => value !== undefined && value !== null)
              .map(value => String(value))
          )]
        : [];
      const categories = categoryField ? (categoriesRaw.length > 0 ? categoriesRaw : [undefined]) : [undefined];

      const traces: PlotlyData[] = [];

      categories.forEach((category, index) => {
        const filtered = category
          ? flattened.filter(row => String(row[categoryField!]) === category)
          : flattened;

        const xValues = filtered.map(row => row[xField]).filter(value => value !== undefined && value !== null);
        const yValues = filtered
          .map(row => row[yField])
          .filter(value => typeof value === 'number' && !Number.isNaN(value));

        if (xValues.length > 0 && yValues.length > 0) {
          const displayName =
            category || (categoryField ? '未分類' : (yField || (aggregation === 'count' ? 'count' : 'value')));
          traces.push({
            type: 'scatter',
            mode: 'markers',
            x: xValues,
            y: yValues,
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

    if (chartType === 'histogram') {
      const categoriesRaw = categoryField
        ? [...new Set(
            flattened
              .map(row => row[categoryField])
              .filter(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''))
              .map(value => String(value))
          )]
        : [];

      let categories: string[];
      if (categoryField) {
        const categorySet = new Set<string>(categoriesRaw);
        const hasUnassigned = flattened.some(row => {
          const rawCategory = row[categoryField];
          return rawCategory === undefined || rawCategory === null || (typeof rawCategory === 'string' && rawCategory.trim() === '');
        });
        if (hasUnassigned || categorySet.size === 0) {
          categorySet.add('未分類');
        }
        categories = Array.from(categorySet);
      } else {
        categories = ['データ'];
      }

      const traces: PlotlyData[] = [];

      categories.forEach((category, index) => {
        const filtered = categoryField
          ? flattened.filter(row => {
              const rawCategory = row[categoryField!];
              if (
                rawCategory === undefined ||
                rawCategory === null ||
                (typeof rawCategory === 'string' && rawCategory.trim() === '')
              ) {
                return category === '未分類';
              }
              return String(rawCategory) === category;
            })
          : flattened;

        const values = filtered
          .map(row => row[xField])
          .filter(value => typeof value === 'number' && !Number.isNaN(value));

        if (values.length === 0) {
          return;
        }

        traces.push({
          type: 'histogram',
          x: values,
          nbinsx: bins,
          name: category,
          marker: { color: colorPalette[index % colorPalette.length] },
          opacity: categoryField ? 0.6 : 0.8,
        } as PlotlyData);
      });

      if (traces.length === 0) {
        return { error: 'ヒストグラムには数値列が必要です' };
      }

      return {
        plot: {
          data: traces,
          layout: {
            autosize: true,
            height: 320,
            margin: { t: 40, r: 20, b: 60, l: 60 },
            xaxis: { title: xField },
            yaxis: { title: '度数' },
            barmode: categoryField ? 'overlay' : undefined,
            showlegend: categoryField ? traces.length > 1 : false,
          },
        },
      };
    }

    if (chartType === 'pie') {
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

    if (chartType === 'bar' || chartType === 'line' || chartType === 'stacked-bar') {
      const categoriesRaw = categoryField
        ? [...new Set(
            flattened
              .map(row => row[categoryField])
              .filter(value => value !== undefined && value !== null)
              .map(value => String(value))
          )]
        : [];
      const categories = categoryField ? (categoriesRaw.length > 0 ? categoriesRaw : [undefined]) : [undefined];

      const allLabelsSet = new Set<string | number>();
      const seriesMaps: { category: string; values: Map<string | number, number> }[] = [];

      categories.forEach(category => {
        const filtered = category
          ? flattened.filter(row => String(row[categoryField!]) === category)
          : flattened;

        const { labels, values, error } = getSeriesFromAggregation(filtered);
        if (error || !labels || !values) {
          return;
        }

        const valueMap = new Map<string | number, number>();
        labels.forEach((label, index) => {
          const value = values[index];
          if (value !== undefined && value !== null) {
            valueMap.set(label, value);
          }
          allLabelsSet.add(label);
        });

        const displayName =
          category || (categoryField ? '未分類' : (yField || (aggregation === 'count' ? 'count' : 'value')));
        seriesMaps.push({ category: displayName, values: valueMap });
      });

      const labels = Array.from(allLabelsSet);
      if (labels.length === 0 || seriesMaps.length === 0) {
        return { error: 'チャートを作成できるデータがありません' };
      }

      const traces: PlotlyData[] = seriesMaps.map((series, index) => {
        const data = labels.map(label => series.values.get(label) ?? 0);

        return {
          type: chartType === 'line' ? 'scatter' : 'bar',
          mode: chartType === 'line' ? 'lines+markers' : undefined,
          x: labels,
          y: data,
          name: series.category,
          marker: { color: colorPalette[index % colorPalette.length] },
          line: chartType === 'line' ? { color: colorPalette[index % colorPalette.length], width: 2 } : undefined,
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
            barmode:
              chartType === 'bar' && categories.length > 1
                ? 'group'
                : chartType === 'stacked-bar'
                  ? 'stack'
                  : undefined,
            showlegend: categories.length > 1,
          },
        },
      };
    }

    if (chartType === 'bubble') {
      if (!yField) {
        return { error: 'バブルチャートにはY軸に使用する数値列が必要です' };
      }

      const sizeField = options?.bubbleSizeField;
      if (!sizeField) {
        return { error: 'バブルのサイズに使用する列を選択してください' };
      }

      const dataPoints = flattened
        .map(row => {
          const rawX = row[xField];
          const rawY = row[yField];
          const rawSize = row[sizeField];
          const category = categoryField ? row[categoryField] : undefined;

          if (
            rawX === null || rawX === undefined ||
            rawY === null || rawY === undefined ||
            rawSize === null || rawSize === undefined ||
            (typeof rawX === 'string' && rawX.trim() === '') ||
            (typeof rawY === 'string' && rawY.trim() === '') ||
            (typeof rawSize === 'string' && rawSize.trim() === '')
          ) {
            return null;
          }

          const x = typeof rawX === 'number' ? rawX : Number(rawX);
          const y = typeof rawY === 'number' ? rawY : Number(rawY);
          const size = typeof rawSize === 'number' ? rawSize : Number(rawSize);

          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size)) {
            return null;
          }

          return {
            x,
            y,
            size: Math.abs(size),
            category: category !== undefined && category !== null ? String(category) : undefined,
          };
        })
        .filter((point): point is { x: number; y: number; size: number; category?: string } => point !== null);

      if (dataPoints.length === 0) {
        return { error: 'バブルチャートを作成できる数値データがありません' };
      }

      const grouped = new Map<string, { x: number; y: number; size: number }[]>();
      dataPoints.forEach(point => {
        const key = categoryField ? (point.category ?? '未分類') : 'データ';
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(point);
      });

      const sizes = dataPoints.map(point => point.size);
      const minSize = Math.min(...sizes);
      const maxSize = Math.max(...sizes);

      const scaleSize = (value: number) => {
        if (!Number.isFinite(value)) return 8;
        if (maxSize === minSize) {
          return 22;
        }
        const normalized = (value - minSize) / (maxSize - minSize);
        return 10 + normalized * 30;
      };

      const traces: PlotlyData[] = Array.from(grouped.entries()).map(([category, points], index) => ({
        type: 'scatter',
        mode: 'markers',
        x: points.map(point => point.x),
        y: points.map(point => point.y),
        name: category,
        marker: {
          size: points.map(point => scaleSize(point.size)),
          color: colorPalette[index % colorPalette.length],
          sizemode: 'diameter',
          sizemin: 6,
          opacity: 0.75,
          line: { width: 1, color: 'rgba(17, 24, 39, 0.4)' },
        },
        customdata: points.map(point => point.size),
        hovertemplate: 'X: %{x}<br>Y: %{y}<br>サイズ: %{customdata}<extra></extra>',
      } as PlotlyData));

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

    if (chartType === 'regression') {
      if (!yField) {
        return { error: '回帰分析にはY軸に使用する数値列が必要です' };
      }

      const dataPoints = flattened
        .map(row => {
          const rawX = row[xField];
          const rawY = row[yField];
          const category = categoryField ? row[categoryField] : undefined;

          if (
            rawX === null || rawX === undefined ||
            rawY === null || rawY === undefined ||
            (typeof rawX === 'string' && rawX.trim() === '') ||
            (typeof rawY === 'string' && rawY.trim() === '')
          ) {
            return null;
          }

          const x = typeof rawX === 'number' ? rawX : Number(rawX);
          const y = typeof rawY === 'number' ? rawY : Number(rawY);

          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
          }

          return {
            x,
            y,
            category: category !== undefined && category !== null ? String(category) : undefined,
          };
        })
        .filter((point): point is { x: number; y: number; category?: string } => point !== null);

      if (dataPoints.length < 2) {
        return { error: '回帰分析を行うには十分な数値データが必要です' };
      }

      const grouped = new Map<string, { x: number; y: number }[]>();
      dataPoints.forEach(point => {
        const key = categoryField ? (point.category ?? '未分類') : 'データ';
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(point);
      });

      const groupedEntries = Array.from(grouped.entries());
      const traces: PlotlyData[] = [];
      let hasRegressionLine = false;

      groupedEntries.forEach(([groupName, points], index) => {
        const color = colorPalette[index % colorPalette.length];
        const displayName = groupName;

        traces.push({
          type: 'scatter',
          mode: 'markers',
          x: points.map(point => point.x),
          y: points.map(point => point.y),
          name: displayName,
          legendgroup: displayName,
          marker: {
            color,
            size: 8,
            opacity: 0.85,
          },
        } as PlotlyData);

        if (points.length >= 2) {
          const regressionPoints = calculateRegressionLine(points, 'linear');
          if (regressionPoints.length > 0) {
            hasRegressionLine = true;
            traces.push({
              type: 'scatter',
              mode: 'lines',
              x: regressionPoints.map(point => point.x),
              y: regressionPoints.map(point => point.y),
              name: `${displayName} 回帰線`,
              legendgroup: displayName,
              showlegend: false,
              line: { color, width: 2 },
              hoverinfo: 'skip',
            } as PlotlyData);
          }
        }
      });

      if (!hasRegressionLine) {
        return { error: '各グループで回帰線を描画するには2件以上のデータが必要です' };
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
            showlegend: true,
          },
        },
      };
    }

    if (chartType === 'sunburst') {
      if (categoryField && categoryField === xField) {
        return { error: 'サンバーストチャートではラベル用と親カテゴリ用に異なる列を選択してください' };
      }

      const rootLabel = '全体';
      const useCount = aggregation === 'count' || !yField;

      const childStats = new Map<string, { label: string; parent: string; values: number[]; count: number }>();
      const parentStats = new Map<string, { values: number[]; count: number }>();
      const rootValues: number[] = [];
      let rootCount = 0;

      const resolveCategory = (row: any) => {
        if (!categoryField) return rootLabel;
        const raw = row[categoryField];
        if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
          return '未分類';
        }
        return String(raw);
      };

      flattened.forEach(row => {
        const rawLabel = row[xField];
        if (rawLabel === undefined || rawLabel === null) {
          return;
        }
        const label = String(rawLabel);
        if (label.trim() === '') {
          return;
        }

        const parentLabel = resolveCategory(row);
        const rawValue = yField ? row[yField] : undefined;
        const numericValue = typeof rawValue === 'number' && !Number.isNaN(rawValue) ? rawValue : null;

        if (!useCount && numericValue === null) {
          return;
        }

        const key = `${parentLabel}||${label}`;
        if (!childStats.has(key)) {
          childStats.set(key, { label, parent: parentLabel, values: [], count: 0 });
        }
        const childEntry = childStats.get(key)!;
        childEntry.count += 1;
        if (!useCount && numericValue !== null) {
          childEntry.values.push(numericValue);
        }

        if (categoryField) {
          if (!parentStats.has(parentLabel)) {
            parentStats.set(parentLabel, { values: [], count: 0 });
          }
          const parentEntry = parentStats.get(parentLabel)!;
          parentEntry.count += 1;
          if (!useCount && numericValue !== null) {
            parentEntry.values.push(numericValue);
          }
        }

        rootCount += 1;
        if (!useCount && numericValue !== null) {
          rootValues.push(numericValue);
        }
      });

      const computeAggregatedValue = (values: number[], count: number): number | null => {
        if (useCount) {
          return count;
        }
        if (values.length === 0) {
          return null;
        }
        switch (aggregation) {
          case 'sum':
            return values.reduce((sum, value) => sum + value, 0);
          case 'avg':
            return values.reduce((sum, value) => sum + value, 0) / values.length;
          case 'min':
            return Math.min(...values);
          case 'max':
            return Math.max(...values);
          default:
            return null;
        }
      };

      const childOutputs: { label: string; parent: string; value: number }[] = [];
      childStats.forEach(entry => {
        const value = computeAggregatedValue(entry.values, entry.count);
        if (value === null) {
          return;
        }
        const parentLabel = categoryField ? entry.parent : rootLabel;
        childOutputs.push({ label: entry.label, parent: parentLabel, value });
      });

      if (childOutputs.length === 0) {
        return { error: 'サンバーストチャートを作成できるデータがありません' };
      }

      const rootValue = computeAggregatedValue(rootValues, rootCount);
      if (rootValue === null) {
        return { error: 'サンバーストチャートを作成できるデータがありません' };
      }

      const labels: string[] = [rootLabel];
      const parents: string[] = [''];
      const values: number[] = [rootValue];

      if (categoryField) {
        parentStats.forEach((entry, parentLabel) => {
          const value = computeAggregatedValue(entry.values, entry.count);
          if (value === null) {
            return;
          }
          labels.push(parentLabel);
          parents.push(rootLabel);
          values.push(value);
        });
      }

      childOutputs.forEach(output => {
        labels.push(output.label);
        parents.push(output.parent);
        values.push(output.value);
      });

      const branchValuesMode: 'total' | 'remainder' = useCount || aggregation === 'sum' ? 'total' : 'remainder';

      return {
        plot: {
          data: [
            {
              type: 'sunburst',
              labels,
              parents,
              values,
              branchvalues: branchValuesMode,
              hovertemplate: '%{label}<br>値: %{value}<extra></extra>',
            } as PlotlyData,
          ],
          layout: {
            autosize: true,
            height: 360,
            margin: { t: 40, r: 20, b: 20, l: 20 },
          },
        },
      };
    }

    if (chartType === 'gantt') {
      const taskField = options?.ganttTaskField;
      const startField = options?.ganttStartField;
      const endField = options?.ganttEndField;

      if (!taskField || !startField || !endField) {
        return { error: 'ガントチャートにはタスク名、開始日、終了日の列を選択してください' };
      }

      const taskData = flattened
        .map(row => {
          const taskName = row[taskField];
          const startDate = parseDateValue(row[startField]);
          const endDate = parseDateValue(row[endField]);

          if (!taskName || !startDate || !endDate) {
            return null;
          }

          if (endDate.getTime() < startDate.getTime()) {
            return null;
          }

          return {
            task: String(taskName),
            start: startDate,
            end: endDate,
          };
        })
        .filter((item): item is { task: string; start: Date; end: Date } => item !== null);

      if (taskData.length === 0) {
        return { error: 'ガントチャートを作成できるデータが見つかりませんでした' };
      }

      taskData.sort((a, b) => a.start.getTime() - b.start.getTime());

      const formatDate = (date: Date) => {
        const iso = date.toISOString();
        return iso.replace('T', ' ').slice(0, 16);
      };

      const traces: PlotlyData[] = taskData.map((task, index) => ({
        type: 'scatter',
        mode: 'lines',
        x: [task.start.toISOString(), task.end.toISOString()],
        y: [task.task, task.task],
        line: {
          width: 14,
          color: colorPalette[index % colorPalette.length],
          shape: 'hv',
        },
        showlegend: false,
        hoverinfo: 'text',
        text: [
          `${task.task}<br>開始: ${formatDate(task.start)}<br>終了: ${formatDate(task.end)}`,
          `${task.task}<br>開始: ${formatDate(task.start)}<br>終了: ${formatDate(task.end)}`,
        ],
      }));

      const height = Math.max(320, taskData.length * 30 + 120);

      return {
        plot: {
          data: traces,
          layout: {
            autosize: true,
            height,
            margin: { t: 40, r: 20, b: 60, l: 140 },
            xaxis: { title: '日付', type: 'date' },
            yaxis: { title: 'タスク', autorange: 'reversed' },
            showlegend: false,
          },
        },
      };
    }

    return { error: '未対応のチャートタイプです' };
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

  const dateColumns = useMemo(() => {
    return availableColumns.filter(col =>
      flattened.some(row => isParsableDateValue(row[col]))
    );
  }, [availableColumns, flattened]);

  const [categoryField, setCategoryField] = useState<string>('');
  const [bubbleSizeField, setBubbleSizeField] = useState<string>('');
  const [ganttTaskField, setGanttTaskField] = useState<string>('');
  const [ganttStartField, setGanttStartField] = useState<string>('');
  const [ganttEndField, setGanttEndField] = useState<string>('');

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

  useEffect(() => {
    if (bubbleSizeField && !numericColumns.includes(bubbleSizeField)) {
      setBubbleSizeField('');
    }
  }, [bubbleSizeField, numericColumns]);

  useEffect(() => {
    if (chartType === 'bubble' && numericColumns.length > 0) {
      const defaultSizeField = numericColumns[0] ?? '';
      if (!bubbleSizeField || !numericColumns.includes(bubbleSizeField)) {
        setBubbleSizeField(defaultSizeField);
      }
    }
  }, [chartType, bubbleSizeField, numericColumns]);

  useEffect(() => {
    if (ganttTaskField && !availableColumns.includes(ganttTaskField)) {
      setGanttTaskField('');
    }
  }, [ganttTaskField, availableColumns]);

  useEffect(() => {
    if (ganttStartField && !availableColumns.includes(ganttStartField)) {
      setGanttStartField('');
    }
  }, [ganttStartField, availableColumns]);

  useEffect(() => {
    if (ganttEndField && !availableColumns.includes(ganttEndField)) {
      setGanttEndField('');
    }
  }, [ganttEndField, availableColumns]);

  useEffect(() => {
    if (chartType === 'gantt') {
      if (!ganttTaskField && availableColumns.length > 0) {
        setGanttTaskField(availableColumns[0]);
      }
      if (!ganttStartField) {
        if (dateColumns.length > 0) {
          setGanttStartField(dateColumns[0]);
        } else if (availableColumns.length > 0) {
          setGanttStartField(availableColumns[0]);
        }
      }
      if (!ganttEndField) {
        if (dateColumns.length > 1) {
          setGanttEndField(dateColumns[1]);
        } else if (dateColumns.length === 1) {
          setGanttEndField(dateColumns[0]);
        } else if (availableColumns.length > 1) {
          setGanttEndField(availableColumns[1]);
        } else if (availableColumns.length === 1) {
          setGanttEndField(availableColumns[0]);
        }
      }
    }
  }, [chartType, availableColumns, dateColumns, ganttTaskField, ganttStartField, ganttEndField]);

  const supportsCategory =
    chartType === 'bar' ||
    chartType === 'line' ||
    chartType === 'scatter' ||
    chartType === 'stacked-bar' ||
    chartType === 'regression' ||
    chartType === 'bubble' ||
    chartType === 'histogram' ||
    chartType === 'sunburst';

  useEffect(() => {
    if (!supportsCategory && categoryField) {
      setCategoryField('');
    }
  }, [supportsCategory, categoryField]);

  useEffect(() => {
    if ((chartType === 'bar' || chartType === 'line' || chartType === 'pie' || chartType === 'stacked-bar' || chartType === 'sunburst') && !yField && aggregation !== 'count') {
      setAggregation('count');
    }
  }, [chartType, yField, aggregation]);

  const allowAggregation = chartType === 'bar' || chartType === 'line' || chartType === 'pie' || chartType === 'stacked-bar' || chartType === 'sunburst';
  const requiresNumericY =
    chartType === 'scatter' ||
    chartType === 'line' ||
    chartType === 'bar' ||
    chartType === 'stacked-bar' ||
    chartType === 'regression' ||
    chartType === 'bubble' ||
    chartType === 'sunburst';
  const canSelectYField = chartType !== 'histogram' && chartType !== 'gantt';
  const showXField = chartType !== 'gantt';

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
      supportsCategory && categoryField ? categoryField : undefined,
      {
        bubbleSizeField: chartType === 'bubble' ? bubbleSizeField || undefined : undefined,
        ganttTaskField: chartType === 'gantt' ? ganttTaskField || undefined : undefined,
        ganttStartField: chartType === 'gantt' ? ganttStartField || undefined : undefined,
        ganttEndField: chartType === 'gantt' ? ganttEndField || undefined : undefined,
      }
    );
    setError(plotError || null);
    return { plot };
  }, [rows, flattened, chartType, xField, yField, aggregation, bins, expanded, canSelectYField, supportsCategory, categoryField, bubbleSizeField, ganttTaskField, ganttStartField, ganttEndField]);

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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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

            {showXField && (
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
            )}

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
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
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

            {chartType === 'bubble' && (
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                バブルサイズの列
                <select
                  value={bubbleSizeField}
                  onChange={(e) => setBubbleSizeField(e.target.value)}
                  className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  <option value="">列を選択</option>
                  {numericColumns.map(column => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
              </label>
            )}

            {chartType === 'gantt' && (
              <>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  タスク名の列
                  <select
                    value={ganttTaskField}
                    onChange={(e) => setGanttTaskField(e.target.value)}
                    className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">列を選択</option>
                    {availableColumns.map(column => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  開始日の列
                  <select
                    value={ganttStartField}
                    onChange={(e) => setGanttStartField(e.target.value)}
                    className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">列を選択</option>
                    {availableColumns.map(column => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  終了日の列
                  <select
                    value={ganttEndField}
                    onChange={(e) => setGanttEndField(e.target.value)}
                    className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">列を選択</option>
                    {availableColumns.map(column => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>
              </>
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
