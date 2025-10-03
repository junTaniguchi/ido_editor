'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Config as PlotlyConfig, Data as PlotlyData, Layout as PlotlyLayout } from 'plotly.js';
import {
  aggregateData,
  flattenObjectsWithDotNotation,
  calculateRegressionLine,
  getRegressionTypeLabel,
  prepareChartData,
} from '@/lib/dataAnalysisUtils';
import { IoChevronDownOutline, IoChevronForwardOutline } from 'react-icons/io5';
import type { ChartDesignerSettings, ResultAggregation, ResultChartType } from '@/types';

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

const clampHoleValue = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 0.75);
};

interface ResultChartBuilderProps {
  rows: any[];
  title?: string;
  collapsedByDefault?: boolean;
  className?: string;
  initialSettings?: Partial<ChartDesignerSettings>;
  onSettingsChange?: (settings: ChartDesignerSettings) => void;
}

interface PlotState {
  data: PlotlyData[];
  layout: Partial<PlotlyLayout>;
  config?: Partial<PlotlyConfig>;
}

const aggregationOptions: { value: ResultAggregation; label: string }[] = [
  { value: 'sum', label: '合計' },
  { value: 'avg', label: '平均' },
  { value: 'count', label: '件数' },
  { value: 'min', label: '最小' },
  { value: 'max', label: '最大' },
];

const defaultPlotlyConfig: Partial<PlotlyConfig> = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  doubleClickDelay: 1000,
};

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
  treemap: 'ツリーマップ',
  streamgraph: 'ストリームグラフ',
  venn: 'ベン図',
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
    sunburstLevels?: string[];
    pieHole?: number;
    sunburstHole?: number;
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

      const hole = clampHoleValue(options?.pieHole);

      const trace: Partial<PlotlyData> = {
        type: 'pie',
        labels,
        values,
        hole,
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
      const configuredHierarchy = (
        options?.sunburstLevels && options.sunburstLevels.length > 0
          ? options.sunburstLevels
          : [
              ...(categoryField ? [categoryField] : []),
              ...(xField ? [xField] : []),
            ]
      )
        .filter(field => field && field.trim() !== '')
        .slice(0, 3);

      if (configuredHierarchy.length === 0) {
        return { error: 'サンバーストチャートの階層に使用する列を選択してください' };
      }

      const rootLabel = '全体';
      const useCount = aggregation === 'count' || !yField;

      const resolveLabel = (raw: any) => {
        if (raw === undefined || raw === null) {
          return '未分類';
        }
        const value = String(raw).trim();
        return value === '' ? '未分類' : value;
      };

      const nodeStats = new Map<
        string,
        { label: string; parentKey: string; parentLabel: string; values: number[]; count: number }
      >();
      const rootValues: number[] = [];
      let rootCount = 0;

      flattened.forEach(row => {
        const path = configuredHierarchy.map(field => resolveLabel(row[field]));
        if (path.length === 0) {
          return;
        }

        const rawValue = yField ? row[yField] : undefined;
        const numericValue = typeof rawValue === 'number' && !Number.isNaN(rawValue) ? rawValue : null;

        if (!useCount && numericValue === null) {
          return;
        }

        rootCount += 1;
        if (!useCount && numericValue !== null) {
          rootValues.push(numericValue);
        }

        path.forEach((label, depth) => {
          const keyPath = path.slice(0, depth + 1);
          const nodeKey = `${depth}:${keyPath.join('||')}`;
          const parentKey = depth === 0 ? 'root' : `${depth - 1}:${keyPath.slice(0, -1).join('||')}`;
          const parentLabel = depth === 0 ? rootLabel : keyPath[depth - 1];

          if (!nodeStats.has(nodeKey)) {
            nodeStats.set(nodeKey, {
              label,
              parentKey,
              parentLabel,
              values: [],
              count: 0,
            });
          }

          const node = nodeStats.get(nodeKey)!;
          node.count += 1;
          if (!useCount && numericValue !== null) {
            node.values.push(numericValue);
          }
        });
      });

      if (nodeStats.size === 0) {
        return { error: 'サンバーストチャートを作成できるデータがありません' };
      }

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

      const rootValue = computeAggregatedValue(rootValues, rootCount);
      if (rootValue === null) {
        return { error: 'サンバーストチャートを作成できるデータがありません' };
      }

      const labels: string[] = [rootLabel];
      const parents: string[] = [''];
      const values: number[] = [rootValue];
      const ids: string[] = ['root'];

      const sortedNodes = Array.from(nodeStats.entries()).sort((a, b) => {
        const depthA = Number.parseInt(a[0].split(':')[0], 10);
        const depthB = Number.parseInt(b[0].split(':')[0], 10);
        if (depthA === depthB) {
          return a[0].localeCompare(b[0]);
        }
        return depthA - depthB;
      });

      sortedNodes.forEach(([key, entry]) => {
        const value = computeAggregatedValue(entry.values, entry.count);
        if (value === null) {
          return;
        }
        labels.push(entry.label);
        parents.push(entry.parentLabel);
        values.push(value);
        ids.push(key);
      });

      const branchValuesMode: 'total' | 'remainder' = useCount || aggregation === 'sum' ? 'total' : 'remainder';

      const hole = clampHoleValue(options?.sunburstHole);

      return {
        plot: {
          data: [
            {
              type: 'sunburst',
              labels,
              parents,
              values,
              ids,
              branchvalues: branchValuesMode,
              hole,
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
  initialSettings,
  onSettingsChange,
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

  const resolvedInitial = initialSettings ?? {};

  const [categoryField, setCategoryField] = useState<string>(() => resolvedInitial.categoryField ?? '');
  const [sunburstLevel1Field, setSunburstLevel1Field] = useState<string>(() => {
    if (resolvedInitial.sunburstLevel1Field !== undefined) {
      return resolvedInitial.sunburstLevel1Field ?? '';
    }
    if (resolvedInitial.categoryField) {
      return resolvedInitial.categoryField;
    }
    if (resolvedInitial.xField) {
      return resolvedInitial.xField;
    }
    return '';
  });
  const [sunburstLevel2Field, setSunburstLevel2Field] = useState<string>(() => {
    if (resolvedInitial.sunburstLevel2Field !== undefined) {
      return resolvedInitial.sunburstLevel2Field ?? '';
    }
    if (resolvedInitial.categoryField && resolvedInitial.xField) {
      return resolvedInitial.xField;
    }
    return '';
  });
  const [sunburstLevel3Field, setSunburstLevel3Field] = useState<string>(() => resolvedInitial.sunburstLevel3Field ?? '');
  const [pieHole, setPieHole] = useState<number>(() => clampHoleValue(resolvedInitial.pieHole));
  const [sunburstHole, setSunburstHole] = useState<number>(() => clampHoleValue(resolvedInitial.sunburstHole));
  const [vennFields, setVennFields] = useState<string[]>(() => resolvedInitial.vennFields ?? []);
  const [bubbleSizeField, setBubbleSizeField] = useState<string>(() => resolvedInitial.bubbleSizeField ?? '');
  const [ganttTaskField, setGanttTaskField] = useState<string>(() => resolvedInitial.ganttTaskField ?? '');
  const [ganttStartField, setGanttStartField] = useState<string>(() => resolvedInitial.ganttStartField ?? '');
  const [ganttEndField, setGanttEndField] = useState<string>(() => resolvedInitial.ganttEndField ?? '');

  const [expanded, setExpanded] = useState(() => !(resolvedInitial.collapsed ?? collapsedByDefault));
  const [chartType, setChartType] = useState<ResultChartType>(() => resolvedInitial.chartType ?? 'bar');
  const [xField, setXField] = useState<string>(() => resolvedInitial.xField ?? '');
  const [yField, setYField] = useState<string>(() => resolvedInitial.yField ?? '');
  const [aggregation, setAggregation] = useState<ResultAggregation>(() => resolvedInitial.aggregation ?? 'sum');
  const [bins, setBins] = useState<number>(() => resolvedInitial.bins ?? 20);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  const lastInitialSettingsRef = useRef<Partial<ChartDesignerSettings> | undefined>(undefined);

  useEffect(() => {
    if (!initialSettings) {
      lastInitialSettingsRef.current = undefined;
      return;
    }

    const previous = lastInitialSettingsRef.current ?? {};

    if (
      initialSettings.chartType !== undefined &&
      previous.chartType !== initialSettings.chartType
    ) {
      setChartType(initialSettings.chartType);
    }

    if (initialSettings.xField !== undefined && previous.xField !== initialSettings.xField) {
      setXField(initialSettings.xField ?? '');
    }

    if (initialSettings.yField !== undefined && previous.yField !== initialSettings.yField) {
      setYField(initialSettings.yField ?? '');
    }

    if (
      initialSettings.aggregation !== undefined &&
      previous.aggregation !== initialSettings.aggregation
    ) {
      setAggregation(initialSettings.aggregation);
    }

    if (initialSettings.bins !== undefined && previous.bins !== initialSettings.bins) {
      setBins(initialSettings.bins);
    }

    if (
      initialSettings.categoryField !== undefined &&
      previous.categoryField !== initialSettings.categoryField
    ) {
      setCategoryField(initialSettings.categoryField ?? '');
    }

    if (
      initialSettings.sunburstLevel1Field !== undefined &&
      previous.sunburstLevel1Field !== initialSettings.sunburstLevel1Field
    ) {
      setSunburstLevel1Field(initialSettings.sunburstLevel1Field ?? '');
    }

    if (
      initialSettings.sunburstLevel2Field !== undefined &&
      previous.sunburstLevel2Field !== initialSettings.sunburstLevel2Field
    ) {
      setSunburstLevel2Field(initialSettings.sunburstLevel2Field ?? '');
    }

    if (
      initialSettings.sunburstLevel3Field !== undefined &&
      previous.sunburstLevel3Field !== initialSettings.sunburstLevel3Field
    ) {
      setSunburstLevel3Field(initialSettings.sunburstLevel3Field ?? '');
    }

    if (initialSettings.vennFields !== undefined) {
      const nextFields = initialSettings.vennFields ?? [];
      const prevFields = previous.vennFields ?? [];
      const sameLength = prevFields.length === nextFields.length;
      const sameValues = sameLength && nextFields.every((value, index) => value === prevFields[index]);

      if (!sameValues) {
        setVennFields([...nextFields]);
      }
    }

    if (
      initialSettings.bubbleSizeField !== undefined &&
      previous.bubbleSizeField !== initialSettings.bubbleSizeField
    ) {
      setBubbleSizeField(initialSettings.bubbleSizeField ?? '');
    }

    if (
      initialSettings.ganttTaskField !== undefined &&
      previous.ganttTaskField !== initialSettings.ganttTaskField
    ) {
      setGanttTaskField(initialSettings.ganttTaskField ?? '');
    }

    if (
      initialSettings.ganttStartField !== undefined &&
      previous.ganttStartField !== initialSettings.ganttStartField
    ) {
      setGanttStartField(initialSettings.ganttStartField ?? '');
    }

    if (
      initialSettings.ganttEndField !== undefined &&
      previous.ganttEndField !== initialSettings.ganttEndField
    ) {
      setGanttEndField(initialSettings.ganttEndField ?? '');
    }

    if (initialSettings.pieHole !== undefined && previous.pieHole !== initialSettings.pieHole) {
      setPieHole(clampHoleValue(initialSettings.pieHole));
    }

    if (
      initialSettings.sunburstHole !== undefined &&
      previous.sunburstHole !== initialSettings.sunburstHole
    ) {
      setSunburstHole(clampHoleValue(initialSettings.sunburstHole));
    }

    if (
      initialSettings.collapsed !== undefined &&
      previous.collapsed !== initialSettings.collapsed
    ) {
      setExpanded(!initialSettings.collapsed);
    }

    lastInitialSettingsRef.current = {
      chartType: initialSettings.chartType,
      xField: initialSettings.xField,
      yField: initialSettings.yField,
      aggregation: initialSettings.aggregation,
      bins: initialSettings.bins,
      categoryField: initialSettings.categoryField,
      sunburstLevel1Field: initialSettings.sunburstLevel1Field,
      sunburstLevel2Field: initialSettings.sunburstLevel2Field,
      sunburstLevel3Field: initialSettings.sunburstLevel3Field,
      vennFields: initialSettings.vennFields ? [...initialSettings.vennFields] : undefined,
      bubbleSizeField: initialSettings.bubbleSizeField,
      ganttTaskField: initialSettings.ganttTaskField,
      ganttStartField: initialSettings.ganttStartField,
      ganttEndField: initialSettings.ganttEndField,
      pieHole: initialSettings.pieHole,
      sunburstHole: initialSettings.sunburstHole,
      collapsed: initialSettings.collapsed,
    };
  }, [initialSettings]);

  useEffect(() => {
    if (!onSettingsChange) {
      return;
    }

    const payload: ChartDesignerSettings = {
      chartType,
      xField,
      yField,
      aggregation,
      bins,
      categoryField,
      sunburstLevel1Field,
      sunburstLevel2Field,
      sunburstLevel3Field,
      vennFields,
      bubbleSizeField,
      ganttTaskField,
      ganttStartField,
      ganttEndField,
      pieHole,
      sunburstHole,
      collapsed: !expanded,
    };

    onSettingsChange(payload);
  }, [
    aggregation,
    bins,
    bubbleSizeField,
    categoryField,
    chartType,
    expanded,
    ganttEndField,
    ganttStartField,
    ganttTaskField,
    pieHole,
    sunburstHole,
    onSettingsChange,
    sunburstLevel1Field,
    sunburstLevel2Field,
    sunburstLevel3Field,
    vennFields,
    xField,
    yField,
  ]);

  const handleChartTypeChange = (newType: ResultChartType) => {
    setChartType(newType);
    setError(null);

    if (newType === 'venn') {
      setXField('');
      setYField('');
      setCategoryField('');
      if (aggregation !== 'count') {
        setAggregation('count');
      }
    } else {
      if (!xField && availableColumns.length > 0) {
        setXField(availableColumns[0]);
      }
      if (!yField && numericColumns.length > 0) {
        setYField(numericColumns[0]);
      }
    }

    if (newType !== 'bubble') {
      setBubbleSizeField('');
    }

    if (newType !== 'gantt') {
      setGanttTaskField('');
      setGanttStartField('');
      setGanttEndField('');
    }
  };

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
    if (sunburstLevel1Field && !availableColumns.includes(sunburstLevel1Field)) {
      setSunburstLevel1Field('');
    }
  }, [availableColumns, sunburstLevel1Field]);

  useEffect(() => {
    if (sunburstLevel2Field && !availableColumns.includes(sunburstLevel2Field)) {
      setSunburstLevel2Field('');
    }
  }, [availableColumns, sunburstLevel2Field]);

  useEffect(() => {
    if (sunburstLevel3Field && !availableColumns.includes(sunburstLevel3Field)) {
      setSunburstLevel3Field('');
    }
  }, [availableColumns, sunburstLevel3Field]);

  useEffect(() => {
    if (chartType === 'sunburst' && !sunburstLevel1Field && availableColumns.length > 0) {
      setSunburstLevel1Field(availableColumns[0]);
    }
  }, [chartType, sunburstLevel1Field, availableColumns]);

  useEffect(() => {
    setVennFields(prev => {
      const filtered = prev.filter(field => availableColumns.includes(field));
      const limited = filtered.slice(0, 3);
      if (limited.length === prev.length && limited.every((field, index) => field === prev[index])) {
        return prev;
      }
      return limited;
    });
  }, [availableColumns]);

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
    if (typeof window === 'undefined') {
      return;
    }

    const updateDarkMode = () => {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const classDark = document.documentElement.classList.contains('dark');
      setIsDarkMode(prefersDark || classDark);
    };

    updateDarkMode();

    const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (!mediaQuery) {
      return;
    }

    const listener = (event: MediaQueryListEvent) => {
      setIsDarkMode(event.matches || document.documentElement.classList.contains('dark'));
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

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

  const isSunburstChart = chartType === 'sunburst';
  const isTreemapChart = chartType === 'treemap';
  const isHierarchicalChart = isSunburstChart || isTreemapChart;

  const supportsCategory =
    chartType === 'bar' ||
    chartType === 'line' ||
    chartType === 'scatter' ||
    chartType === 'stacked-bar' ||
    chartType === 'regression' ||
    chartType === 'bubble' ||
    chartType === 'histogram' ||
    isSunburstChart ||
    isTreemapChart ||
    chartType === 'streamgraph';

  useEffect(() => {
    if (!supportsCategory && categoryField) {
      setCategoryField('');
    }
  }, [supportsCategory, categoryField]);

  useEffect(() => {
    if (
      (chartType === 'bar' ||
        chartType === 'line' ||
        chartType === 'pie' ||
        chartType === 'stacked-bar' ||
        chartType === 'sunburst' ||
        chartType === 'treemap' ||
        chartType === 'streamgraph') &&
      !yField &&
      aggregation !== 'count'
    ) {
      setAggregation('count');
    }
  }, [chartType, yField, aggregation]);

  const allowAggregation =
    chartType === 'bar' ||
    chartType === 'line' ||
    chartType === 'pie' ||
    chartType === 'stacked-bar' ||
    isSunburstChart ||
    isTreemapChart ||
    chartType === 'streamgraph';
  const requiresNumericY =
    chartType === 'scatter' ||
    chartType === 'line' ||
    chartType === 'bar' ||
    chartType === 'stacked-bar' ||
    chartType === 'regression' ||
    chartType === 'bubble' ||
    isSunburstChart;
  const canSelectYField = chartType !== 'histogram' && chartType !== 'gantt' && chartType !== 'venn';
  const showXField = chartType !== 'gantt' && chartType !== 'venn' && !isHierarchicalChart;

  const chartComputation = useMemo(() => {
    if (!expanded) {
      return { plot: undefined, error: null };
    }

    if (chartType === 'treemap' || chartType === 'streamgraph' || chartType === 'venn') {
      if (chartType !== 'venn' && !xField) {
        return { plot: undefined, error: 'X軸に使用する列を選択してください' };
      }

      const cleanedVennFields =
        chartType === 'venn'
          ? Array.from(
              new Set(
                vennFields
                  .filter(field => field && field.trim() !== '')
                  .filter(field => availableColumns.includes(field))
              )
            ).slice(0, 3)
          : [];

      if (chartType === 'venn' && cleanedVennFields.length < 2) {
        return { plot: undefined, error: 'ベン図を作成するには2つ以上（最大3つ）のフィールドを選択してください' };
      }

      const prepared = prepareChartData(
        flattened,
        chartType === 'venn' ? '' : xField,
        chartType === 'venn' ? '' : (canSelectYField ? yField : ''),
        chartType,
        supportsCategory && chartType !== 'venn' && categoryField ? categoryField : undefined,
        chartType === 'venn'
          ? {
              vennFields: cleanedVennFields,
            }
          : undefined
      );

      if (!prepared) {
        return { plot: undefined, error: 'チャートを作成するデータがありません' };
      }

      if (prepared.metadata?.error) {
        return { plot: undefined, error: prepared.metadata.error };
      }

      const plotlyMeta = prepared.metadata?.plotly;
      if (!plotlyMeta || !plotlyMeta.data) {
        return { plot: undefined, error: 'Plotlyデータが不足しています' };
      }

      const layout: Partial<PlotlyLayout> = { ...(plotlyMeta.layout || {}) };
      if (isDarkMode) {
        layout.paper_bgcolor = 'rgba(31, 41, 55, 0)';
        layout.plot_bgcolor = 'rgba(31, 41, 55, 0)';
        layout.font = {
          ...(layout.font || {}),
          color: '#e5e7eb',
        };

        if (layout.annotations) {
          const annotations = Array.isArray(layout.annotations)
            ? layout.annotations
            : [layout.annotations];
          layout.annotations = annotations.map(annotation => ({
            ...annotation,
            font: {
              ...(annotation.font || {}),
              color: '#e5e7eb',
            },
          }));
        }
      }

      const adjustedData = (plotlyMeta.data as PlotlyData[]).map(trace => {
        if (isDarkMode && chartType === 'venn' && (trace as any).textfont) {
          return {
            ...trace,
            textfont: {
              ...(trace as any).textfont,
              color: '#e5e7eb',
            },
          } as PlotlyData;
        }
        return { ...trace } as PlotlyData;
      });

      const config: Partial<PlotlyConfig> = {
        ...defaultPlotlyConfig,
        ...(plotlyMeta.config || {}),
      };

      return {
        plot: {
          data: adjustedData,
          layout,
          config,
        },
        error: null,
      };
    }

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
        pieHole: chartType === 'pie' ? pieHole : undefined,
        sunburstLevels:
          chartType === 'sunburst'
            ? [sunburstLevel1Field, sunburstLevel2Field, sunburstLevel3Field]
                .filter(field => field && field.trim() !== '')
                .slice(0, 3)
            : undefined,
        sunburstHole: chartType === 'sunburst' ? sunburstHole : undefined,
      }
    );

    return { plot, error: plotError || null };
  }, [
    expanded,
    chartType,
    xField,
    vennFields,
    availableColumns,
    flattened,
    canSelectYField,
    yField,
    supportsCategory,
    categoryField,
    pieHole,
    sunburstLevel1Field,
    sunburstLevel2Field,
    sunburstLevel3Field,
    aggregation,
    bins,
    bubbleSizeField,
    ganttTaskField,
    ganttStartField,
    ganttEndField,
    sunburstHole,
    rows,
    isDarkMode,
  ]);

  useEffect(() => {
    setError(chartComputation.error ?? null);
  }, [chartComputation]);

  const plot = chartComputation.plot;

  const requiresXFieldForAggregation = !isSunburstChart;
  const aggregationDisabled =
    !allowAggregation ||
    (requiresXFieldForAggregation && !xField) ||
    (requiresNumericY && !yField);
  const showYField =
    canSelectYField && !isHierarchicalChart && (chartType !== 'pie' || numericColumns.length > 0);

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
                onChange={(e) => handleChartTypeChange(e.target.value as ResultChartType)}
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

            {isSunburstChart && (
              <>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  中心（第1層）の列
                  <select
                    value={sunburstLevel1Field}
                    onChange={(e) => setSunburstLevel1Field(e.target.value)}
                    className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">列を選択</option>
                    {availableColumns.map(column => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  第2層の列（任意）
                  <select
                    value={sunburstLevel2Field}
                    onChange={(e) => setSunburstLevel2Field(e.target.value)}
                    className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">列を選択</option>
                    {availableColumns.map(column => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  第3層の列（任意）
                  <select
                    value={sunburstLevel3Field}
                    onChange={(e) => setSunburstLevel3Field(e.target.value)}
                    className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">列を選択</option>
                    {availableColumns.map(column => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  値の列（任意）
                  <select
                    value={yField}
                    onChange={(e) => setYField(e.target.value)}
                    className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">値を集計しない（件数）</option>
                    {numericColumns.map(column => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>

                <div className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  内側のくり抜き率
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={0.75}
                      step={0.05}
                      value={sunburstHole}
                      onChange={(e) => setSunburstHole(clampHoleValue(Number.parseFloat(e.target.value)))}
                      className="flex-1"
                    />
                    <span className="w-12 text-right text-[11px] text-gray-500 dark:text-gray-400">
                      {Math.round(sunburstHole * 100)}%
                    </span>
                  </div>
                  <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                    0%で通常のサンバースト、数値を上げるとドーナツ状になります。
                  </span>
                </div>
              </>
            )}

            {isTreemapChart && (
              <>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  ラベルの列
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

                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  親カテゴリの列（任意）
                  <select
                    value={categoryField}
                    onChange={(e) => setCategoryField(e.target.value)}
                    className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">親カテゴリなし</option>
                    {availableColumns.map(column => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                  値の列（任意）
                  <select
                    value={yField}
                    onChange={(e) => setYField(e.target.value)}
                    className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">値を集計しない（件数）</option>
                    {numericColumns.map(column => (
                      <option key={column} value={column}>{column}</option>
                    ))}
                  </select>
                </label>
              </>
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

            {chartType === 'pie' && (
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                内側のくり抜き率
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={0.75}
                    step={0.05}
                    value={pieHole}
                    onChange={(e) => setPieHole(clampHoleValue(Number.parseFloat(e.target.value)))}
                    className="flex-1"
                  />
                  <span className="w-12 text-right text-[11px] text-gray-500 dark:text-gray-400">
                    {Math.round(pieHole * 100)}%
                  </span>
                </div>
                <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                  0%で通常の円グラフ、数値を上げるとドーナツグラフになります。
                </span>
              </div>
            )}

            {chartType === 'venn' && (
              <div className="md:col-span-3">
                <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">ベン図のフィールド</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  2〜3個のフィールドを選択してください（真偽値・有無を示す列が推奨です）。
                </p>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">最大3フィールドまで選択できます。</div>
                {availableColumns.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded p-2 space-y-2 bg-white dark:bg-gray-900">
                    {availableColumns.map(column => {
                      const isSelected = vennFields.includes(column);
                      const disableNewSelection = !isSelected && vennFields.length >= 3;
                      return (
                        <label
                          key={column}
                          className={`flex items-center gap-2 text-sm ${
                            disableNewSelection && !isSelected
                              ? 'text-gray-400 dark:text-gray-600'
                              : 'text-gray-700 dark:text-gray-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                            checked={isSelected}
                            disabled={disableNewSelection && !isSelected}
                            onChange={(e) => {
                              const { checked } = e.target;
                              setVennFields(prev => {
                                if (checked) {
                                  if (prev.includes(column) || prev.length >= 3) {
                                    return prev;
                                  }
                                  return [...prev, column];
                                }
                                return prev.filter(field => field !== column);
                              });
                            }}
                          />
                          <span>{column}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400">選択可能な列がありません。</div>
                )}
              </div>
            )}

            {supportsCategory && !isHierarchicalChart && (
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
              <Plot
                data={plot.data}
                layout={plot.layout}
                style={{ width: '100%', height: '100%' }}
                config={plot.config ?? { responsive: true }}
              />
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
