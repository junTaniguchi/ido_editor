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
import { extractWordsFromText } from '@/lib/wordCloudTextProcessing';
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

const isUnsetCategoryValue = (value: any): boolean => {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  return false;
};

const hexToRgba = (hex: string, alpha: number): string => {
  let sanitized = hex.replace('#', '');

  if (sanitized.length === 3) {
    sanitized = sanitized
      .split('')
      .map(char => char.repeat(2))
      .join('');
  }

  if (sanitized.length !== 6) {
    return `rgba(37, 99, 235, ${alpha})`;
  }

  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const normalizeMaybeString = (value: string | null | undefined): string | undefined =>
  value == null ? undefined : value;

const normalizeMaybeNumber = (value: number | null | undefined): number | undefined =>
  typeof value === 'number' && !Number.isNaN(value) ? value : undefined;

const normalizeMaybeBoolean = (value: boolean | null | undefined): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const cloneInitialSettingsSnapshot = (
  settings: Partial<ChartDesignerSettings>
): Partial<ChartDesignerSettings> => {
  const snapshot: Partial<ChartDesignerSettings> = {
    chartType: settings.chartType,
    title: normalizeMaybeString(settings.title),
    xField: normalizeMaybeString(settings.xField),
    yField: normalizeMaybeString(settings.yField),
    aggregation: settings.aggregation,
    bins: normalizeMaybeNumber(settings.bins),
    categoryField: normalizeMaybeString(settings.categoryField),
    sunburstLevel1Field: normalizeMaybeString(settings.sunburstLevel1Field),
    sunburstLevel2Field: normalizeMaybeString(settings.sunburstLevel2Field),
    sunburstLevel3Field: normalizeMaybeString(settings.sunburstLevel3Field),
    vennFields: Array.isArray(settings.vennFields)
      ? [...settings.vennFields]
      : undefined,
    bubbleSizeField: normalizeMaybeString(settings.bubbleSizeField),
    ganttTaskField: normalizeMaybeString(settings.ganttTaskField),
    ganttStartField: normalizeMaybeString(settings.ganttStartField),
    ganttEndField: normalizeMaybeString(settings.ganttEndField),
    pieHole: normalizeMaybeNumber(settings.pieHole),
    sunburstHole: normalizeMaybeNumber(settings.sunburstHole),
    collapsed: normalizeMaybeBoolean(settings.collapsed),
    wordCloudLimit: normalizeMaybeNumber(settings.wordCloudLimit),
  };

  return snapshot;
};

const arraysShallowEqual = (a?: string[], b?: string[]): boolean => {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

const initialSettingsSnapshotsEqual = (
  previous: Partial<ChartDesignerSettings> | undefined,
  next: Partial<ChartDesignerSettings>
): boolean => {
  if (!previous) {
    return false;
  }

  return (
    previous.chartType === next.chartType &&
    normalizeMaybeString(previous.title) === normalizeMaybeString(next.title) &&
    normalizeMaybeString(previous.xField) === normalizeMaybeString(next.xField) &&
    normalizeMaybeString(previous.yField) === normalizeMaybeString(next.yField) &&
    previous.aggregation === next.aggregation &&
    normalizeMaybeNumber(previous.bins) === normalizeMaybeNumber(next.bins) &&
    normalizeMaybeString(previous.categoryField) === normalizeMaybeString(next.categoryField) &&
    normalizeMaybeString(previous.sunburstLevel1Field) === normalizeMaybeString(next.sunburstLevel1Field) &&
    normalizeMaybeString(previous.sunburstLevel2Field) === normalizeMaybeString(next.sunburstLevel2Field) &&
    normalizeMaybeString(previous.sunburstLevel3Field) === normalizeMaybeString(next.sunburstLevel3Field) &&
    arraysShallowEqual(previous.vennFields, next.vennFields) &&
    normalizeMaybeString(previous.bubbleSizeField) === normalizeMaybeString(next.bubbleSizeField) &&
    normalizeMaybeString(previous.ganttTaskField) === normalizeMaybeString(next.ganttTaskField) &&
    normalizeMaybeString(previous.ganttStartField) === normalizeMaybeString(next.ganttStartField) &&
    normalizeMaybeString(previous.ganttEndField) === normalizeMaybeString(next.ganttEndField) &&
    normalizeMaybeNumber(previous.pieHole) === normalizeMaybeNumber(next.pieHole) &&
    normalizeMaybeNumber(previous.sunburstHole) === normalizeMaybeNumber(next.sunburstHole) &&
    normalizeMaybeBoolean(previous.collapsed) === normalizeMaybeBoolean(next.collapsed) &&
    normalizeMaybeNumber(previous.wordCloudLimit) === normalizeMaybeNumber(next.wordCloudLimit)
  );
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
  scrollZoom: true,
  doubleClick: 'reset',
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
  kde: 'カーネル密度推定',
  heatmap: 'ヒートマップ',
  sankey: 'サンキー図',
  'word-cloud': 'ワードクラウド',
  waterfall: 'ウォーターフォールチャート',
};

const DEFAULT_CHART_HEIGHT = 480;
const DEFAULT_WORD_CLOUD_LIMIT = 50;
const wordCloudLimitOptions = [10, 20, 30, 50, 100];
const zoomEnabledChartTypes: ResultChartType[] = [
  'bar',
  'line',
  'scatter',
  'histogram',
  'stacked-bar',
  'regression',
  'bubble',
  'kde',
  'heatmap',
  'waterfall',
  'streamgraph',
  'gantt',
  'word-cloud',
];

const chartTypeRequiresNumericY = (type: ResultChartType): boolean =>
  type === 'scatter' ||
  type === 'line' ||
  type === 'bar' ||
  type === 'stacked-bar' ||
  type === 'regression' ||
  type === 'bubble' ||
  type === 'heatmap' ||
  type === 'sankey' ||
  type === 'waterfall' ||
  type === 'sunburst';

const chartTypeSupportsAggregation = (type: ResultChartType): boolean =>
  type === 'bar' ||
  type === 'line' ||
  type === 'pie' ||
  type === 'stacked-bar' ||
  type === 'sunburst' ||
  type === 'treemap' ||
  type === 'streamgraph' ||
  type === 'heatmap' ||
  type === 'sankey' ||
  type === 'waterfall' ||
  type === 'word-cloud';

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
    title?: string;
    bubbleSizeField?: string;
    ganttTaskField?: string;
    ganttStartField?: string;
    ganttEndField?: string;
    sunburstLevels?: string[];
    pieHole?: number;
    sunburstHole?: number;
    wordCloudLimit?: number;
  }
): { plot?: PlotState; error?: string } => {
  if (!rows || rows.length === 0) {
    return { error: 'チャートを作成するデータがありません' };
  }

  if (chartType !== 'gantt' && !xField) {
    return { error: '表示に使用する列を選択してください' };
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

  const layoutTitle = options?.title && options.title.trim() !== '' ? options.title.trim() : undefined;

  const aggregateNumericValues = (values: number[], aggregationMethod: ResultAggregation): number => {
    if (values.length === 0) {
      return 0;
    }

    switch (aggregationMethod) {
      case 'sum':
        return values.reduce((sum, value) => sum + value, 0);
      case 'avg':
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'count':
      default:
        return values.length;
    }
  };

  const getSeriesFromAggregation = (sourceData: any[] = flattened) => {
    if (!yField && aggregation !== 'count') {
      return { error: '値に使用する列が未選択の場合は集計方法に「件数」を指定してください' };
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
    if (chartType === 'kde') {
      const hasYField = Boolean(yField && yField.trim() !== '');

      const categories = categoryField
        ? (() => {
            const set = new Map<string, string>();
            let hasUnassigned = false;

            flattened.forEach(row => {
              const raw = row[categoryField];
              if (isUnsetCategoryValue(raw)) {
                hasUnassigned = true;
                if (!set.has('__unassigned__')) {
                  set.set('__unassigned__', '未分類');
                }
              } else {
                const key = String(raw);
                if (!set.has(key)) {
                  set.set(key, key);
                }
              }
            });

            if (set.size === 0) {
              set.set('__unassigned__', '未分類');
            } else if (hasUnassigned && !set.has('__unassigned__')) {
              set.set('__unassigned__', '未分類');
            }

            return Array.from(set.entries()).map(([key, label]) => ({ key, label }));
          })()
        : [{ key: '__all__', label: 'データ' }];

      const rowsForCategory = (categoryKey: string) => {
        if (!categoryField) {
          return flattened;
        }

        return flattened.filter(row => {
          const raw = row[categoryField!];
          if (categoryKey === '__unassigned__') {
            return isUnsetCategoryValue(raw);
          }
          if (isUnsetCategoryValue(raw)) {
            return false;
          }
          return String(raw) === categoryKey;
        });
      };

      const baseValues = flattened
        .map(row => row[xField])
        .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

      if (baseValues.length < 2) {
        return { error: 'カーネル密度推定には2つ以上の数値データが必要です' };
      }

      if (hasYField) {
        const pairedAll = flattened
          .map(row => ({
            x: row[xField],
            y: row[yField],
          }))
          .filter((pair): pair is { x: number; y: number } =>
            typeof pair.x === 'number' &&
            !Number.isNaN(pair.x) &&
            typeof pair.y === 'number' &&
            !Number.isNaN(pair.y)
          );

        if (pairedAll.length < 2) {
          return { error: '2変量のカーネル密度推定には2つ以上の数値ペアが必要です' };
        }

        const allX = pairedAll.map(pair => pair.x);
        const allY = pairedAll.map(pair => pair.y);
        const xMin = Math.min(...allX);
        const xMax = Math.max(...allX);
        const yMin = Math.min(...allY);
        const yMax = Math.max(...allY);
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;
        const xPadding = xRange * 0.1;
        const yPadding = yRange * 0.1;

        const gridSize = Math.min(80, Math.max(35, Math.round(Math.sqrt(pairedAll.length) * 6)));
        const xStart = xMin - xPadding;
        const xEnd = xMax + xPadding;
        const yStart = yMin - yPadding;
        const yEnd = yMax + yPadding;
        const xStep = (xEnd - xStart) / (gridSize - 1 || 1);
        const yStep = (yEnd - yStart) / (gridSize - 1 || 1);

        const xGrid: number[] = Array.from({ length: gridSize }, (_, index) => xStart + index * xStep);
        const yGrid: number[] = Array.from({ length: gridSize }, (_, index) => yStart + index * yStep);

        const traces: PlotlyData[] = [];
        let hasDensity = false;

        categories.forEach(({ key, label }, index) => {
          const categoryRows = rowsForCategory(key);
          const pairs = categoryRows
            .map(row => ({
              x: row[xField],
              y: row[yField!],
            }))
            .filter((pair): pair is { x: number; y: number } =>
              typeof pair.x === 'number' &&
              !Number.isNaN(pair.x) &&
              typeof pair.y === 'number' &&
              !Number.isNaN(pair.y)
            );

          if (pairs.length === 0) {
            return;
          }

          hasDensity = true;

          const xValues = pairs.map(pair => pair.x);
          const yValues = pairs.map(pair => pair.y);

          const meanX = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
          const meanY = yValues.reduce((sum, value) => sum + value, 0) / yValues.length;
          const varianceX = xValues.reduce((sum, value) => sum + (value - meanX) ** 2, 0) / xValues.length;
          const varianceY = yValues.reduce((sum, value) => sum + (value - meanY) ** 2, 0) / yValues.length;
          const stdX = Math.sqrt(varianceX) || xRange / 6;
          const stdY = Math.sqrt(varianceY) || yRange / 6;
          const bandwidthFactor = Math.pow(pairs.length, -1 / 6);
          const bandwidthX = Math.max(stdX * bandwidthFactor, xRange / 200);
          const bandwidthY = Math.max(stdY * bandwidthFactor, yRange / 200);

          const gaussianConstant = 1 / (2 * Math.PI * bandwidthX * bandwidthY * (pairs.length || 1));

          const density: number[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));

          for (let yi = 0; yi < gridSize; yi += 1) {
            const y = yStart + yi * yStep;
            for (let xi = 0; xi < gridSize; xi += 1) {
              const x = xStart + xi * xStep;
              let sum = 0;
              for (const pair of pairs) {
                const dx = (x - pair.x) / bandwidthX;
                const dy = (y - pair.y) / bandwidthY;
                sum += Math.exp(-0.5 * (dx * dx + dy * dy));
              }
              density[yi][xi] = gaussianConstant * sum;
            }
          }

          const color = colorPalette[index % colorPalette.length];

          if (!categoryField) {
            traces.push({
              type: 'heatmap',
              x: xGrid,
              y: yGrid,
              z: density,
              colorscale: 'YlOrRd',
              hovertemplate: `${xField}: %{x}<br>${yField}: %{y}<br>密度: %{z:.4f}<extra></extra>`,
              showscale: true,
              name: '密度',
            } as PlotlyData);
          }

          traces.push({
            type: 'contour',
            x: xGrid,
            y: yGrid,
            z: density,
            contours: { coloring: 'fill', showlines: true },
            line: { color, width: 1.2 },
            colorscale: [
              [0, hexToRgba(color, 0)],
              [0.4, hexToRgba(color, categoryField ? 0.15 : 0.25)],
              [0.7, hexToRgba(color, categoryField ? 0.35 : 0.55)],
              [1, hexToRgba(color, categoryField ? 0.6 : 0.85)],
            ],
            showscale: false,
            hovertemplate: `${categoryField ? `${label}<br>` : ''}${xField}: %{x}<br>${yField}: %{y}<br>密度: %{z:.4f}<extra></extra>`,
            name: categoryField ? `${label} (密度)` : '等高線',
            legendgroup: label,
            showlegend: false,
            opacity: categoryField ? 0.9 : 1,
          } as PlotlyData);

          traces.push({
            type: 'scatter',
            mode: 'markers',
            x: xValues,
            y: yValues,
            marker: {
              size: 6,
              color: categoryField ? color : 'rgba(30, 64, 175, 0.65)',
              opacity: 0.75,
              line: { color: categoryField ? '#ffffff' : '#1e40af', width: 1 },
            },
            name: categoryField ? label : 'データ',
            legendgroup: label,
            hovertemplate: `${categoryField ? `${label}<br>` : ''}${xField}: %{x}<br>${yField}: %{y}<extra></extra>`,
            showlegend: Boolean(categoryField),
          } as PlotlyData);
        });

        if (!hasDensity) {
          return { error: '2変量のカーネル密度推定には2つ以上の数値ペアが必要です' };
        }

        return {
          plot: {
            data: traces,
            layout: {
              autosize: true,
              height: 360,
              margin: { t: 40, r: 40, b: 60, l: 60 },
              xaxis: { title: xField },
              yaxis: { title: yField },
              title: layoutTitle,
              showlegend: Boolean(categoryField),
              legend: { orientation: 'h', x: 0, y: 1.05 },
            },
          },
        };
      }

      const globalMin = Math.min(...baseValues);
      const globalMax = Math.max(...baseValues);
      const globalRange = globalMax - globalMin || 1;
      const padding = globalRange * 0.1 || 0.1;
      const xStart = globalMin - padding;
      const xEnd = globalMax + padding;
      const points = Math.min(200, Math.max(50, baseValues.length * 5));
      const step = (xEnd - xStart) / (points - 1 || 1);

      const xCoordinates: number[] = Array.from({ length: points }, (_, index) => xStart + index * step);
      const kernel = (u: number) => Math.exp(-0.5 * u * u);

      const traces: PlotlyData[] = [];

      categories.forEach(({ key, label }, index) => {
        const values = rowsForCategory(key)
          .map(row => row[xField])
          .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

        if (values.length === 0) {
          return;
        }

        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance);
        const fallbackRange = globalRange || Math.abs(globalMin) || 1;
        const baseBandwidth = stdDev > 0 ? 1.06 * stdDev * Math.pow(values.length, -1 / 5) : fallbackRange / 10;
        const bandwidth = baseBandwidth > 0 ? baseBandwidth : fallbackRange / 10;

        const density = xCoordinates.map(x =>
          values.reduce((sum, xi) => sum + kernel((x - xi) / bandwidth), 0) /
          (values.length * bandwidth * Math.sqrt(2 * Math.PI))
        );

        const color = colorPalette[index % colorPalette.length];

        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: xCoordinates,
          y: density,
          line: { color, width: 2 },
          hovertemplate: `${categoryField ? `${label}<br>` : ''}${xField}: %{x}<br>密度: %{y:.4f}<extra></extra>`,
          name: categoryField ? label : '密度',
        } as PlotlyData);
      });

      if (traces.length === 0) {
        return { error: 'カーネル密度推定には2つ以上の数値データが必要です' };
      }

      return {
        plot: {
          data: traces,
          layout: {
            autosize: true,
            height: 320,
            margin: { t: 40, r: 20, b: 60, l: 60 },
            xaxis: { title: xField },
            yaxis: { title: '密度' },
            title: layoutTitle,
            showlegend: categoryField ? traces.length > 1 : false,
          },
        },
      };
    }

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
            title: layoutTitle,
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
            title: layoutTitle,
          },
        },
      };
    }

    if (chartType === 'heatmap') {
      if (!categoryField) {
        return { error: 'ヒートマップにはカテゴリ列（Y軸）を指定してください' };
      }

      if (aggregation !== 'count' && !yField) {
        return { error: 'ヒートマップには値に使用する数値列を指定してください' };
      }

      const xCategories = Array.from(
        new Set(
          flattened
            .map(row => row[xField])
            .filter(value => value !== undefined && value !== null)
            .map(value => String(value))
        )
      );
      const yCategories = Array.from(
        new Set(
          flattened
            .map(row => row[categoryField])
            .filter(value => value !== undefined && value !== null)
            .map(value => String(value))
        )
      );

      if (xCategories.length === 0 || yCategories.length === 0) {
        return { error: 'ヒートマップを作成するためのカテゴリが不足しています' };
      }

      const matrix = yCategories.map(rowCategory =>
        xCategories.map(columnCategory => {
          const matchedRows = flattened.filter(row => {
            const source = row[xField];
            const target = row[categoryField];
            return (
              source !== undefined &&
              source !== null &&
              target !== undefined &&
              target !== null &&
              String(source) === columnCategory &&
              String(target) === rowCategory
            );
          });

          if (matchedRows.length === 0) {
            return 0;
          }

          if (aggregation === 'count' || !yField) {
            return matchedRows.length;
          }

          const numericValues = matchedRows
            .map(row => row[yField])
            .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

          return aggregateNumericValues(numericValues, aggregation);
        })
      );

      const trace: PlotlyData = {
        type: 'heatmap',
        x: xCategories,
        y: yCategories,
        z: matrix,
        colorscale: 'YlOrRd',
        hoverongaps: false,
        colorbar: {
          title:
            aggregation === 'count' || !yField
              ? '件数'
              : `${yField}${aggregation !== 'sum' ? ` (${aggregation})` : ''}`,
        },
      };

      return {
        plot: {
          data: [trace],
          layout: {
            autosize: true,
            height: 360,
            margin: { t: 40, r: 20, b: 60, l: 80 },
            xaxis: { title: xField },
            yaxis: { title: categoryField },
            title: layoutTitle,
          },
        },
      };
    }

    if (chartType === 'sankey') {
      if (!categoryField) {
        return { error: 'サンキー図にはカテゴリ列（遷移先）を指定してください' };
      }

      const pairs = new Map<string, number[]>();
      const counts = new Map<string, number>();

      flattened.forEach(row => {
        const sourceRaw = row[xField];
        const targetRaw = row[categoryField];

        if (sourceRaw === undefined || sourceRaw === null || targetRaw === undefined || targetRaw === null) {
          return;
        }

        const key = `${String(sourceRaw)}|||${String(targetRaw)}`;
        if (aggregation === 'count' || !yField) {
          counts.set(key, (counts.get(key) ?? 0) + 1);
          return;
        }

        const value = row[yField];
        if (typeof value === 'number' && !Number.isNaN(value)) {
          if (!pairs.has(key)) {
            pairs.set(key, []);
          }
          pairs.get(key)!.push(value);
        }
      });

      const uniqueNodes = new Map<string, number>();
      const labels: string[] = [];
      const ensureNode = (label: string) => {
        if (!uniqueNodes.has(label)) {
          uniqueNodes.set(label, labels.length);
          labels.push(label);
        }
        return uniqueNodes.get(label)!;
      };

      const sources: number[] = [];
      const targets: number[] = [];
      const values: number[] = [];

      const processEntry = (key: string, aggregatedValue: number) => {
        if (aggregatedValue <= 0) {
          return;
        }
        const [sourceLabel, targetLabel] = key.split('|||');
        sources.push(ensureNode(sourceLabel));
        targets.push(ensureNode(targetLabel));
        values.push(aggregatedValue);
      };

      pairs.forEach((valueList, key) => {
        const aggregated = aggregateNumericValues(valueList, aggregation);
        processEntry(key, aggregated);
      });

      counts.forEach((countValue, key) => {
        processEntry(key, countValue);
      });

      if (sources.length === 0 || targets.length === 0 || values.length === 0) {
        return { error: 'サンキー図を作成するデータが不足しています' };
      }

      const trace: PlotlyData = {
        type: 'sankey',
        orientation: 'h',
        node: {
          label: labels,
          pad: 15,
          thickness: 20,
          line: {
            color: '#888',
            width: 0.5,
          },
        },
        link: {
          source: sources,
          target: targets,
          value: values,
          hovertemplate: '%{source.label} → %{target.label}<br>値: %{value}<extra></extra>',
        },
      } as PlotlyData;

      return {
        plot: {
          data: [trace],
          layout: {
            height: 420,
            margin: { t: 40, r: 20, b: 20, l: 20 },
            title: layoutTitle,
          },
        },
      };
    }

    if (chartType === 'word-cloud') {
      if (!xField) {
        return { plot: undefined, error: 'ワードクラウドに使用するテキスト列を選択してください' };
      }

      const wordMap = new Map<string, number[]>();
      const countMap = new Map<string, number>();
      let hasExtractedToken = false;

      flattened.forEach(row => {
        const raw = row[xField];
        if (typeof raw !== 'string' || raw.trim() === '') {
          return;
        }

        const tokens = extractWordsFromText(raw);
        if (tokens.length === 0) {
          return;
        }

        hasExtractedToken = true;

        if (aggregation === 'count' || !yField) {
          tokens.forEach(token => {
            countMap.set(token, (countMap.get(token) ?? 0) + 1);
          });
          return;
        }

        const value = row[yField];
        if (typeof value === 'number' && !Number.isNaN(value)) {
          tokens.forEach(token => {
            if (!wordMap.has(token)) {
              wordMap.set(token, []);
            }
            wordMap.get(token)!.push(value);
          });
        }
      });

      if (!hasExtractedToken) {
        return { error: '文章から抽出できる名詞・動詞が見つかりませんでした' };
      }

      const aggregatedWeights = new Map<string, number>();

      const registerWord = (word: string, weight: number | undefined | null) => {
        if (typeof weight !== 'number' || Number.isNaN(weight) || weight <= 0) {
          return;
        }
        const current = aggregatedWeights.get(word) ?? 0;
        aggregatedWeights.set(word, current + weight);
      };

      wordMap.forEach((valueList, word) => {
        registerWord(word, aggregateNumericValues(valueList, aggregation));
      });
      countMap.forEach((countValue, word) => {
        registerWord(word, countValue);
      });

      const sortedEntries = Array.from(aggregatedWeights.entries()).sort((a, b) => b[1] - a[1]);
      const limit = options?.wordCloudLimit && options.wordCloudLimit > 0 ? options.wordCloudLimit : sortedEntries.length;
      const limitedEntries = sortedEntries.slice(0, Math.max(1, limit));

      if (limitedEntries.length === 0) {
        return { error: 'ワードクラウドのスコアを計算できませんでした' };
      }

      const words = limitedEntries.map(([word]) => word);
      const weights = limitedEntries.map(([, weight]) => weight);

      const minWeight = Math.min(...weights);
      const maxWeight = Math.max(...weights);
      const normalize = (weight: number) => {
        if (maxWeight === minWeight) {
          return 30;
        }
        return 16 + ((weight - minWeight) / (maxWeight - minWeight)) * 40;
      };

      const pseudoRandom = (seed: number) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      };

      const xPositions: number[] = [];
      const yPositions: number[] = [];
      const textSizes: number[] = [];
      const textColors: string[] = [];

      words.forEach((_, index) => {
        xPositions.push(pseudoRandom(index + 1) * 2 - 1);
        yPositions.push(pseudoRandom(index + 100) * 2 - 1);
        textSizes.push(normalize(weights[index]));
        textColors.push(colorPalette[index % colorPalette.length]);
      });

      const trace: PlotlyData = {
        type: 'scatter',
        mode: 'text',
        x: xPositions,
        y: yPositions,
        text: words,
        textfont: {
          size: textSizes,
          color: textColors,
        },
        hovertemplate: '%{text}<br>スコア: %{customdata}<extra></extra>',
        customdata: weights,
      } as PlotlyData;

      return {
        plot: {
          data: [trace],
          layout: {
            autosize: true,
            height: 360,
            margin: { t: 40, r: 20, b: 20, l: 20 },
            xaxis: { showgrid: false, showticklabels: false, zeroline: false },
            yaxis: { showgrid: false, showticklabels: false, zeroline: false },
            title: layoutTitle,
          },
        },
      };
    }

    if (chartType === 'waterfall') {
      const baseSeries = getSeriesFromAggregation();
      if ('error' in baseSeries) {
        return { error: baseSeries.error };
      }

      const baseLabels = baseSeries.labels;
      const baseValues = baseSeries.values;

      if (!baseLabels || !baseValues || baseLabels.length === 0) {
        return { error: 'ウォーターフォールチャートを作成するデータがありません' };
      }

      const buildTrace = (
        traceLabel: string,
        values: number[],
        color: string,
        options?: { legendKey?: string }
      ): PlotlyData => {
        const measure = values.map(() => 'relative');
        const legendGroup = options?.legendKey ?? traceLabel;
        return {
          type: 'waterfall',
          x: baseLabels,
          y: values,
          measure,
          connector: {
            line: { color: hexToRgba(color, 0.3), width: 1 },
          },
          increasing: { marker: { color, line: { color: '#ffffff', width: 1 } } },
          decreasing: { marker: { color: hexToRgba(color, 0.55), line: { color: '#ffffff', width: 1 } } },
          totals: { marker: { color: hexToRgba(color, 0.8), line: { color: '#ffffff', width: 1 } } },
          hovertemplate: `${traceLabel ? `${traceLabel}<br>` : ''}%{x}<br>値: %{y}<extra></extra>`,
          name: traceLabel || '値',
          legendgroup: legendGroup,
          offsetgroup: options?.legendKey,
          alignmentgroup: options?.legendKey ? 'waterfall-group' : undefined,
        } as PlotlyData;
      };

      if (!categoryField) {
        const sanitizedValues = baseValues.map(value =>
          typeof value === 'number' && !Number.isNaN(value) ? value : 0
        );
        const trace = buildTrace('', sanitizedValues, '#3b82f6');

        return {
          plot: {
            data: [trace],
            layout: {
              autosize: true,
              height: 360,
              margin: { t: 40, r: 20, b: 60, l: 80 },
              title: layoutTitle,
              xaxis: { title: xField },
              yaxis: { title: yField || '値' },
              showlegend: false,
            },
          },
        };
      }

      const categoryInfos = (() => {
        const map = new Map<string, string>();
        let hasUnassigned = false;

        flattened.forEach(row => {
          const raw = row[categoryField];
          if (isUnsetCategoryValue(raw)) {
            hasUnassigned = true;
            return;
          }

          const key = String(raw);
          if (!map.has(key)) {
            map.set(key, key);
          }
        });

        if (map.size === 0 || hasUnassigned) {
          map.set('__unassigned__', '未分類');
        }

        return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
      })();

      const baseLabelKeys = baseLabels.map(label => String(label));
      const traces: PlotlyData[] = [];

      categoryInfos.forEach(({ key, label }, index) => {
        const categoryRows = flattened.filter(row => {
          const raw = row[categoryField!];
          if (key === '__unassigned__') {
            return isUnsetCategoryValue(raw);
          }
          if (isUnsetCategoryValue(raw)) {
            return false;
          }
          return String(raw) === key;
        });

        if (categoryRows.length === 0) {
          return;
        }

        const aggregated = getSeriesFromAggregation(categoryRows);
        if ('error' in aggregated) {
          return;
        }

        const labelToValue = new Map<string, number>();
        aggregated.labels?.forEach((currentLabel, idx) => {
          const numericValue = aggregated.values?.[idx];
          if (typeof numericValue === 'number' && !Number.isNaN(numericValue)) {
            labelToValue.set(String(currentLabel), numericValue);
          }
        });

        if (labelToValue.size === 0) {
          return;
        }

        const orderedValues = baseLabelKeys.map(labelKey => labelToValue.get(labelKey) ?? 0);
        const color = colorPalette[index % colorPalette.length];
        traces.push(
          buildTrace(label, orderedValues, color, { legendKey: key })
        );
      });

      if (traces.length === 0) {
        return { error: '選択したグループに一致するデータがありません' };
      }

      const showLegend = traces.length > 1;

      return {
        plot: {
          data: traces,
          layout: {
            autosize: true,
            height: 360,
            margin: { t: 40, r: 20, b: 60, l: 80 },
            title: layoutTitle,
            xaxis: { title: xField },
            yaxis: { title: yField || '値' },
            barmode: showLegend ? 'group' : undefined,
            showlegend: showLegend,
            ...(showLegend ? { legend: { orientation: 'h', x: 0, y: 1.05 } } : {}),
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
            title: layoutTitle,
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
            title: layoutTitle,
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
            title: layoutTitle,
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
            title: layoutTitle,
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
        parents.push(entry.parentKey);
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
            title: layoutTitle,
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
            title: layoutTitle,
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
  const [chartTitle, setChartTitle] = useState<string>(() => resolvedInitial.title ?? '');
  const [xField, setXField] = useState<string>(() => resolvedInitial.xField ?? '');
  const [yField, setYField] = useState<string>(() => resolvedInitial.yField ?? '');
  const [aggregation, setAggregation] = useState<ResultAggregation>(() => resolvedInitial.aggregation ?? 'sum');
  const [bins, setBins] = useState<number>(() => resolvedInitial.bins ?? 20);
  const [wordCloudLimit, setWordCloudLimit] = useState<number>(
    () => resolvedInitial.wordCloudLimit ?? DEFAULT_WORD_CLOUD_LIMIT
  );
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  const lastInitialSettingsRef = useRef<Partial<ChartDesignerSettings> | undefined>(undefined);
  const suppressSettingsChangeRef = useRef(false);

  useEffect(() => {
    if (!initialSettings) {
      lastInitialSettingsRef.current = undefined;
      return;
    }

    const snapshot = cloneInitialSettingsSnapshot(initialSettings);
    if (initialSettingsSnapshotsEqual(lastInitialSettingsRef.current, snapshot)) {
      lastInitialSettingsRef.current = snapshot;
      return;
    }

    let didUpdate = false;

    if (initialSettings.chartType !== undefined) {
      const nextChartType = initialSettings.chartType;
      setChartType(prev => {
        if (prev === nextChartType) {
          return prev;
        }
        didUpdate = true;
        return nextChartType;
      });
    }

    if (initialSettings.title !== undefined) {
      const nextTitle = initialSettings.title ?? '';
      setChartTitle(prev => {
        if (prev === nextTitle) {
          return prev;
        }
        didUpdate = true;
        return nextTitle;
      });
    }

    if (initialSettings.xField !== undefined) {
      const nextXField = initialSettings.xField ?? '';
      setXField(prev => {
        if (prev === nextXField) {
          return prev;
        }
        didUpdate = true;
        return nextXField;
      });
    }

    if (initialSettings.yField !== undefined) {
      const nextYField = initialSettings.yField ?? '';
      setYField(prev => {
        if (prev === nextYField) {
          return prev;
        }
        didUpdate = true;
        return nextYField;
      });
    }

    if (initialSettings.aggregation !== undefined) {
      const nextAggregation = initialSettings.aggregation;
      setAggregation(prev => {
        if (prev === nextAggregation) {
          return prev;
        }
        didUpdate = true;
        return nextAggregation;
      });
    }

    if (initialSettings.bins !== undefined) {
      const nextBins = initialSettings.bins;
      setBins(prev => {
        if (prev === nextBins) {
          return prev;
        }
        didUpdate = true;
        return nextBins;
      });
    }

    if (initialSettings.categoryField !== undefined) {
      const nextCategoryField = initialSettings.categoryField ?? '';
      setCategoryField(prev => {
        if (prev === nextCategoryField) {
          return prev;
        }
        didUpdate = true;
        return nextCategoryField;
      });
    }

    if (initialSettings.sunburstLevel1Field !== undefined) {
      const nextSunburstLevel1 = initialSettings.sunburstLevel1Field ?? '';
      setSunburstLevel1Field(prev => {
        if (prev === nextSunburstLevel1) {
          return prev;
        }
        didUpdate = true;
        return nextSunburstLevel1;
      });
    }

    if (initialSettings.sunburstLevel2Field !== undefined) {
      const nextSunburstLevel2 = initialSettings.sunburstLevel2Field ?? '';
      setSunburstLevel2Field(prev => {
        if (prev === nextSunburstLevel2) {
          return prev;
        }
        didUpdate = true;
        return nextSunburstLevel2;
      });
    }

    if (initialSettings.sunburstLevel3Field !== undefined) {
      const nextSunburstLevel3 = initialSettings.sunburstLevel3Field ?? '';
      setSunburstLevel3Field(prev => {
        if (prev === nextSunburstLevel3) {
          return prev;
        }
        didUpdate = true;
        return nextSunburstLevel3;
      });
    }

    if (initialSettings.vennFields !== undefined) {
      const nextFields = initialSettings.vennFields ?? [];
      setVennFields(prev => {
        const matchesCurrent =
          prev.length === nextFields.length &&
          nextFields.every((value, index) => value === prev[index]);
        if (matchesCurrent) {
          return prev;
        }
        didUpdate = true;
        return [...nextFields];
      });
    }

    if (initialSettings.bubbleSizeField !== undefined) {
      const nextBubbleSizeField = initialSettings.bubbleSizeField ?? '';
      setBubbleSizeField(prev => {
        if (prev === nextBubbleSizeField) {
          return prev;
        }
        didUpdate = true;
        return nextBubbleSizeField;
      });
    }

    if (initialSettings.ganttTaskField !== undefined) {
      const nextGanttTask = initialSettings.ganttTaskField ?? '';
      setGanttTaskField(prev => {
        if (prev === nextGanttTask) {
          return prev;
        }
        didUpdate = true;
        return nextGanttTask;
      });
    }

    if (initialSettings.ganttStartField !== undefined) {
      const nextGanttStart = initialSettings.ganttStartField ?? '';
      setGanttStartField(prev => {
        if (prev === nextGanttStart) {
          return prev;
        }
        didUpdate = true;
        return nextGanttStart;
      });
    }

    if (initialSettings.ganttEndField !== undefined) {
      const nextGanttEnd = initialSettings.ganttEndField ?? '';
      setGanttEndField(prev => {
        if (prev === nextGanttEnd) {
          return prev;
        }
        didUpdate = true;
        return nextGanttEnd;
      });
    }

    if (initialSettings.pieHole !== undefined) {
      const nextPieHole = clampHoleValue(initialSettings.pieHole);
      setPieHole(prev => {
        if (prev === nextPieHole) {
          return prev;
        }
        didUpdate = true;
        return nextPieHole;
      });
    }

    if (initialSettings.sunburstHole !== undefined) {
      const nextSunburstHole = clampHoleValue(initialSettings.sunburstHole);
      setSunburstHole(prev => {
        if (prev === nextSunburstHole) {
          return prev;
        }
        didUpdate = true;
        return nextSunburstHole;
      });
    }

    if (initialSettings.wordCloudLimit !== undefined) {
      const nextLimit = initialSettings.wordCloudLimit ?? DEFAULT_WORD_CLOUD_LIMIT;
      setWordCloudLimit(prev => {
        if (prev === nextLimit) {
          return prev;
        }
        didUpdate = true;
        return nextLimit;
      });
    }

    if (initialSettings.collapsed !== undefined) {
      const nextExpanded = !initialSettings.collapsed;
      setExpanded(prev => {
        if (prev === nextExpanded) {
          return prev;
        }
        didUpdate = true;
        return nextExpanded;
      });
    }

    if (didUpdate) {
      suppressSettingsChangeRef.current = true;
    }

    lastInitialSettingsRef.current = snapshot;
  }, [initialSettings]);

  useEffect(() => {
    if (!onSettingsChange) {
      return;
    }

    if (suppressSettingsChangeRef.current) {
      suppressSettingsChangeRef.current = false;
      return;
    }

    const payload: ChartDesignerSettings = {
      chartType,
      title: chartTitle,
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
      wordCloudLimit,
    };

    onSettingsChange(payload);
  }, [
    aggregation,
    bins,
    bubbleSizeField,
    categoryField,
    chartType,
    chartTitle,
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
    wordCloudLimit,
  ]);

  const handleChartTypeChange = (newType: ResultChartType) => {
    setChartType(newType);
    setError(null);

    const requiresNumericForNewType = chartTypeRequiresNumericY(newType);

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
      if (newType === 'pie') {
        setYField('');
        if (aggregation !== 'count') {
          setAggregation('count');
        }
      } else if (!yField && requiresNumericForNewType && numericColumns.length > 0) {
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
    if (chartType === 'pie' && aggregation === 'count') {
      return;
    }

    const shouldEnsureYField =
      chartTypeRequiresNumericY(chartType) ||
      (chartTypeSupportsAggregation(chartType) && aggregation !== 'count' && chartType !== 'pie' && chartType !== 'kde');

    if (shouldEnsureYField) {
      if (numericColumns.length > 0) {
        setYField(prev => (prev && numericColumns.includes(prev) ? prev : numericColumns[0]));
      } else {
        setYField('');
      }
    } else if (yField && !numericColumns.includes(yField)) {
      setYField('');
    }
  }, [numericColumns, chartType, aggregation, yField]);

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
    chartType === 'kde' ||
    chartType === 'bubble' ||
    chartType === 'histogram' ||
    chartType === 'heatmap' ||
    chartType === 'sankey' ||
    chartType === 'waterfall' ||
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
        chartType === 'streamgraph' ||
        chartType === 'heatmap' ||
        chartType === 'sankey' ||
        chartType === 'waterfall' ||
        chartType === 'word-cloud') &&
      !yField &&
      aggregation !== 'count'
    ) {
      setAggregation('count');
    }
  }, [chartType, yField, aggregation]);

  useEffect(() => {
    if (chartType === 'pie' && aggregation === 'count' && yField) {
      setYField('');
    }
  }, [chartType, aggregation, yField]);

  const allowAggregation = chartTypeSupportsAggregation(chartType);
  const requiresNumericY = chartTypeRequiresNumericY(chartType);
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
      if (chartTitle && chartTitle.trim().length > 0) {
        layout.title = chartTitle.trim();
      }
      if (isDarkMode) {
        layout.paper_bgcolor = 'rgba(31, 41, 55, 0)';
        layout.plot_bgcolor = 'rgba(31, 41, 55, 0)';
        layout.font = {
          ...(layout.font || {}),
          color: '#e5e7eb',
        };

        if (layout.title) {
          layout.title = typeof layout.title === 'string'
            ? { text: layout.title, font: { color: '#e5e7eb' } }
            : {
                ...layout.title,
                font: {
                  ...(layout.title.font || {}),
                  color: '#e5e7eb',
                },
              };
        }

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

      if (!layout.height || layout.height < DEFAULT_CHART_HEIGHT) {
        layout.height = DEFAULT_CHART_HEIGHT;
      }

      if (chartType === 'streamgraph') {
        layout.dragmode = layout.dragmode ?? 'zoom';
        layout.hovermode = layout.hovermode ?? 'closest';
      }

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
        title: chartTitle,
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
        wordCloudLimit: chartType === 'word-cloud' ? wordCloudLimit : undefined,
      }
    );

    if (plot && chartTitle && chartTitle.trim()) {
      plot.layout = {
        ...(plot.layout || {}),
        title:
          typeof plot.layout?.title === 'string'
            ? plot.layout?.title
            : plot.layout?.title ?? chartTitle.trim(),
      };

      const existingTitle = plot.layout.title;
      if (typeof existingTitle === 'string') {
        plot.layout.title = existingTitle;
      } else if (existingTitle && typeof existingTitle === 'object') {
        plot.layout.title = {
          ...existingTitle,
          text: existingTitle.text ?? chartTitle.trim(),
          x: existingTitle.x ?? 0,
          xanchor: existingTitle.xanchor ?? 'left',
          font: isDarkMode
            ? { ...(existingTitle.font || {}), color: '#e5e7eb' }
            : existingTitle.font,
        };
      }

      if (typeof plot.layout.title === 'string') {
        plot.layout.title = {
          text: plot.layout.title,
          x: 0,
          xanchor: 'left',
          ...(isDarkMode ? { font: { color: '#e5e7eb' } } : {}),
        };
      } else if (plot.layout.title) {
        plot.layout.title = {
          ...plot.layout.title,
          x: plot.layout.title.x ?? 0,
          xanchor: plot.layout.title.xanchor ?? 'left',
          font: isDarkMode
            ? { ...(plot.layout.title.font || {}), color: '#e5e7eb' }
            : plot.layout.title.font,
        };
      }
    }

    if (plot) {
      const layout: Partial<PlotlyLayout> = { ...(plot.layout || {}) };

      if (!layout.height || layout.height < DEFAULT_CHART_HEIGHT) {
        layout.height = DEFAULT_CHART_HEIGHT;
      }

      if (zoomEnabledChartTypes.includes(chartType)) {
        layout.dragmode = layout.dragmode ?? 'zoom';
        layout.hovermode = layout.hovermode ?? 'closest';
      }

      plot.layout = layout;
      plot.config = {
        ...defaultPlotlyConfig,
        ...(plot.config || {}),
      };
    }

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
    wordCloudLimit,
    rows,
    isDarkMode,
    chartTitle,
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
    canSelectYField &&
    !isHierarchicalChart &&
    (chartType !== 'pie' ? true : aggregation !== 'count' && numericColumns.length > 0);
  const isWordCloudChart = chartType === 'word-cloud';
  const xFieldLabel = chartType === 'pie' ? 'カテゴリ列' : isWordCloudChart ? 'テキスト列' : 'X軸の列';
  const xFieldPlaceholder = isWordCloudChart ? 'テキスト列を選択' : '列を選択';
  const yFieldLabel =
    chartType === 'pie'
      ? '値の列'
      : chartType === 'kde'
        ? 'Y軸の列（任意）'
        : isWordCloudChart
          ? 'スコア列（任意）'
          : 'Y軸の列';
  const yFieldPlaceholder =
    chartType === 'kde'
      ? '列を選択（任意）'
      : isWordCloudChart
        ? 'スコア列を選択（任意）'
        : '列を選択';

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
        <div className="mt-3 space-y-4 flex-1 flex flex-col">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1 md:col-span-3">
              チャートタイトル
              <input
                type="text"
                value={chartTitle}
                onChange={(e) => setChartTitle(e.target.value)}
                placeholder="例: 売上内訳"
                className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
              <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                空欄の場合はチャート上のタイトルを表示しません。
              </span>
            </label>

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
                {xFieldLabel}
                <select
                  value={xField}
                  onChange={(e) => setXField(e.target.value)}
                  className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  <option value="">{xFieldPlaceholder}</option>
                  {availableColumns.map(column => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
                {isWordCloudChart && (
                  <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                    ワードクラウドに表示したい文章が含まれる列を選択してください。
                  </span>
                )}
              </label>
            )}

            {isWordCloudChart && (
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                表示する単語数
                <select
                  value={wordCloudLimit}
                  onChange={(event) => setWordCloudLimit(Number(event.target.value) || DEFAULT_WORD_CLOUD_LIMIT)}
                  className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  {wordCloudLimitOptions.map(option => (
                    <option key={option} value={option}>
                      上位 {option} 語
                    </option>
                  ))}
                </select>
                <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                  頻度の高い順に単語を抽出して表示します。
                </span>
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
                {yFieldLabel}
                <select
                  value={yField}
                  onChange={(e) => setYField(e.target.value)}
                  className="p-2 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  <option value="">{yFieldPlaceholder}</option>
                  {numericColumns.map(column => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
                {chartType === 'pie' && (
                  <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                    円グラフの各扇の大きさを計算するための数値列を指定します。
                  </span>
                )}
                {isWordCloudChart && (
                  <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                    指定すると、文章中の単語ごとのスコアをこの列の数値で集計します（未選択の場合は出現回数を使用します）。
                  </span>
                )}
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
                {isWordCloudChart && (
                  <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                    スコア列を指定した場合に、単語ごとにどのように数値を集計するかを選びます。
                  </span>
                )}
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
            <div className="border border-gray-200 dark:border-gray-800 rounded min-h-[480px] flex-1">
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
