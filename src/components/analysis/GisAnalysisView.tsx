'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Geometry } from 'geojson';
import type { CircleMarker, GeoJSON as LeafletGeoJSON, Map as LeafletMap, Path } from 'leaflet';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IoChevronDown, IoChevronForward, IoSparkles, IoWarningOutline } from 'react-icons/io5';

import { useEditorStore } from '@/store/editorStore';
import { useGisAnalysisStore } from '@/store/gisStore';
import type { FileTreeItem, TabData } from '@/types';
import { getFileType } from '@/lib/editorUtils';
import { readFileContent } from '@/lib/fileSystemUtils';
import {
  GisParseResult,
  parseGeoJsonContent,
  parseKmlContent,
  parseKmzContent,
  parseShapefileContent,
} from '@/lib/gisUtils';
import type { GisFileType } from '@/lib/gisFileTypes';
import { GIS_FILE_TYPES } from '@/lib/gisFileTypes';
import { buildAnalysisSummary, type LlmReportResponse } from '@/lib/llm/analysisSummarizer';
import { loadLeaflet } from '@/lib/loadLeaflet';

type LeafletModule = Awaited<ReturnType<typeof loadLeaflet>>;

type RemoteFilePayload =
  | { kind: 'text'; content: string }
  | { kind: 'base64'; content: string };

const remoteFileCache = new Map<string, RemoteFilePayload | null>();

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  if (!base64) {
    return new ArrayBuffer(0);
  }

  if (typeof window === 'undefined' || typeof window.atob !== 'function') {
    return new ArrayBuffer(0);
  }

  const normalized = base64.replace(/\s+/g, '');
  const binary = window.atob(normalized);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
};

const fetchWorkspaceFile = async (path: string): Promise<RemoteFilePayload | null> => {
  if (!path) {
    return null;
  }

  const normalized = path.replace(/^\/+/, '');
  const candidates = new Set<string>();
  candidates.add(normalized);
  if (!normalized.startsWith('test_data/')) {
    candidates.add(`test_data/${normalized}`);
  }

  for (const candidate of candidates) {
    if (remoteFileCache.has(candidate)) {
      const cached = remoteFileCache.get(candidate) ?? null;
      if (cached) {
        return cached;
      }
      continue;
    }

    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(candidate)}`);
      if (!response.ok) {
        remoteFileCache.set(candidate, null);
        continue;
      }
      const payload = (await response.json()) as Partial<RemoteFilePayload> | null;
      if (
        payload &&
        typeof payload === 'object' &&
        (payload.kind === 'text' || payload.kind === 'base64') &&
        typeof payload.content === 'string'
      ) {
        remoteFileCache.set(candidate, payload as RemoteFilePayload);
        return payload as RemoteFilePayload;
      }
      remoteFileCache.set(candidate, null);
    } catch (error) {
      console.error('Failed to fetch workspace file for GIS analysis:', error);
      remoteFileCache.set(candidate, null);
    }
  }

  return null;
};

interface GisFileEntry {
  path: string;
  name: string;
  type: GisFileType;
  fileHandle?: FileSystemFileHandle;
}

interface StyleSettings {
  color: string;
  brightness: number;
  fillOpacity: number;
  lineWeight: number;
  pointRadius: number;
  valueDriven: boolean;
  valueIntensity: number;
}

const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  color: '#2563eb',
  brightness: 0,
  fillOpacity: 60,
  lineWeight: 2,
  pointRadius: 6,
  valueDriven: true,
  valueIntensity: 60,
};

const STYLE_COLOR_PALETTE = ['#2563eb', '#16a34a', '#f97316', '#ef4444', '#a855f7', '#0ea5e9', '#10b981', '#f59e0b'];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 3 && normalized.length !== 6) {
    return null;
  }

  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;

  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return null;
  }

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (component: number) => clamp(Math.round(component), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const adjustColorBrightness = (hex: string, delta: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }

  const factor = (100 + delta) / 100;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
};

const mixColors = (hexA: string, hexB: string, weight: number) => {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) {
    return hexA;
  }

  const ratio = clamp(weight, 0, 1);
  const r = rgbA.r * (1 - ratio) + rgbB.r * ratio;
  const g = rgbA.g * (1 - ratio) + rgbB.g * ratio;
  const b = rgbA.b * (1 - ratio) + rgbB.b * ratio;
  return rgbToHex(r, g, b);
};

const escapeHtml = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => entities[char]);
};

const formatNumber = (value: number, maximumFractionDigits = 2) => {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return value.toLocaleString('ja-JP', { maximumFractionDigits });
};

const formatPercentage = (value: number, maximumFractionDigits = 1) => {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return `${value.toLocaleString('ja-JP', { maximumFractionDigits })}%`;
};

const truncateLabel = (value: string, maxLength = 60) => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

const valueToLabel = (value: unknown) => {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const isGisTab = (tab: TabData | null | undefined): tab is TabData & { type: GisFileType } => {
  if (!tab) return false;
  return (GIS_FILE_TYPES as readonly string[]).includes(tab.type as string);
};

const collectGisFiles = (root: FileTreeItem | null): GisFileEntry[] => {
  if (!root) {
    return [];
  }

  const results: GisFileEntry[] = [];
  const stack: FileTreeItem[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (current.isDirectory) {
      current.children?.forEach((child) => stack.push(child));
      continue;
    }

    const fileType = getFileType(current.name);
    if ((GIS_FILE_TYPES as readonly string[]).includes(fileType)) {
      results.push({
        path: current.path,
        name: current.name,
        type: fileType as GisFileType,
        fileHandle: current.fileHandle,
      });
    }
  }

  results.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return results;
};

const getFileEntryMap = (entries: GisFileEntry[]) => {
  const map = new Map<string, GisFileEntry>();
  entries.forEach((entry) => {
    map.set(entry.path, entry);
  });
  return map;
};

const getPreferredColumns = (columns: string[]) => {
  const ignored = new Set(['geometry', 'geometry_type']);
  return columns.filter((column) => !ignored.has(column));
};

const GisAnalysisView: React.FC<{ tabId: string }> = ({ tabId }) => {
  const rootFileTree = useEditorStore((state) => state.rootFileTree);
  const tabs = useEditorStore((state) => state.tabs);
  const selectedFilePaths = useGisAnalysisStore((state) => state.selectedFilePaths);
  const activeFilePath = useGisAnalysisStore((state) => state.activeFilePath);
  const setActiveFilePath = useGisAnalysisStore((state) => state.setActiveFilePath);
  const selectedColumns = useGisAnalysisStore((state) => state.selectedColumns);
  const setSelectedColumn = useGisAnalysisStore((state) => state.setSelectedColumn);
  const columnCache = useGisAnalysisStore((state) => state.columnCache);
  const updateColumnCache = useGisAnalysisStore((state) => state.setColumnCache);
  const clearColumnCache = useGisAnalysisStore((state) => state.clearColumnCache);
  const setAnalysisSummary = useGisAnalysisStore((state) => state.setAnalysisSummary);

  const [datasets, setDatasets] = useState<
    Record<string, { rows: any[]; columns: string[]; featureCollection: FeatureCollection | null }>
  >({});
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [errorsByPath, setErrorsByPath] = useState<Record<string, string | null>>({});

  const [styleSettingsMap, setStyleSettingsMap] = useState<Record<string, StyleSettings>>({});
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const setPathLoading = useCallback((path: string, value: boolean) => {
    setLoadingPaths((previous) => {
      const next = new Set(previous);
      if (value) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  }, []);

  const isAnyLoading = loadingPaths.size > 0;
  const activeError = activeFilePath ? errorsByPath[activeFilePath] ?? null : null;

  const activeDataset = activeFilePath ? datasets[activeFilePath] ?? null : null;
  const rows = activeDataset?.rows ?? [];
  const featureCollection = activeDataset?.featureCollection ?? null;

  const [analysisPrompt, setAnalysisPrompt] = useState('');
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<LlmReportResponse | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const geoJsonLayerRef = useRef<LeafletGeoJSON | null>(null);
  const datasetCacheRef = useRef<Map<string, { rows: any[]; columns: string[]; featureCollection: FeatureCollection | null }>>(
    new Map(),
  );
  const [leafletLib, setLeafletLib] = useState<LeafletModule | null>(null);
  const [leafletLoading, setLeafletLoading] = useState(false);
  const [leafletError, setLeafletError] = useState<string | null>(null);

  const columns = useMemo(() => {
    if (!activeFilePath) {
      return [];
    }
    return columnCache[activeFilePath] ?? [];
  }, [activeFilePath, columnCache]);

  const activeSelectedColumn = useMemo(() => {
    if (!activeFilePath) {
      return null;
    }
    return selectedColumns[activeFilePath] ?? null;
  }, [activeFilePath, selectedColumns]);

  useEffect(() => {
    setStyleSettingsMap((previous) => {
      const next = { ...previous };
      let mutated = false;

      selectedFilePaths.forEach((path, index) => {
        if (!next[path]) {
          const paletteColor = STYLE_COLOR_PALETTE[index % STYLE_COLOR_PALETTE.length] ?? DEFAULT_STYLE_SETTINGS.color;
          next[path] = { ...DEFAULT_STYLE_SETTINGS, color: paletteColor };
          mutated = true;
        }
      });

      Object.keys(next).forEach((path) => {
        if (!selectedFilePaths.includes(path)) {
          delete next[path];
          mutated = true;
        }
      });

      return mutated ? next : previous;
    });
  }, [selectedFilePaths]);

  useEffect(() => {
    setExpandedTables((previous) => {
      const next = { ...previous };
      let mutated = false;

      selectedFilePaths.forEach((path) => {
        if (!(path in next)) {
          next[path] = path === activeFilePath;
          mutated = true;
        } else if (path === activeFilePath && !next[path]) {
          next[path] = true;
          mutated = true;
        }
      });

      Object.keys(next).forEach((path) => {
        if (!selectedFilePaths.includes(path)) {
          delete next[path];
          mutated = true;
        }
      });

      return mutated ? next : previous;
    });
  }, [activeFilePath, selectedFilePaths]);

  const resolveStyleSettings = useCallback(
    (path: string): StyleSettings => {
      const existing = styleSettingsMap[path];
      if (existing) {
        return existing;
      }
      const index = selectedFilePaths.indexOf(path);
      const paletteColor = STYLE_COLOR_PALETTE[index % STYLE_COLOR_PALETTE.length] ?? DEFAULT_STYLE_SETTINGS.color;
      return { ...DEFAULT_STYLE_SETTINGS, color: paletteColor };
    },
    [selectedFilePaths, styleSettingsMap],
  );

  const activeStyleSettings = useMemo(() => {
    if (!activeFilePath) {
      return DEFAULT_STYLE_SETTINGS;
    }
    return resolveStyleSettings(activeFilePath);
  }, [activeFilePath, resolveStyleSettings]);

  const updateActiveStyleSettings = useCallback(
    (updater: (previous: StyleSettings) => StyleSettings) => {
      if (!activeFilePath) {
        return;
      }
      setStyleSettingsMap((previous) => {
        const current = previous[activeFilePath] ?? resolveStyleSettings(activeFilePath);
        const next = updater(current);
        return { ...previous, [activeFilePath]: next };
      });
    },
    [activeFilePath, resolveStyleSettings],
  );

  const toggleTableExpansion = useCallback((path: string) => {
    setExpandedTables((previous) => ({ ...previous, [path]: !previous[path] }));
  }, []);

  const activeTab = useMemo(() => tabs.get(tabId) ?? null, [tabs, tabId]);
  const gisFiles = useMemo(() => {
    const baseEntries = collectGisFiles(rootFileTree);
    if (isGisTab(activeTab) && !baseEntries.some((entry) => entry.path === activeTab.id)) {
      const fileHandle = activeTab.file && typeof activeTab.file === 'object' && 'getFile' in activeTab.file
        ? (activeTab.file as FileSystemFileHandle)
        : undefined;
      return [
        {
          path: activeTab.id,
          name: activeTab.name,
          type: activeTab.type as GisFileType,
          fileHandle,
        },
        ...baseEntries,
      ];
    }
    return baseEntries;
  }, [activeTab, rootFileTree]);
  const gisFileMap = useMemo(() => getFileEntryMap(gisFiles), [gisFiles]);

  const activeFileEntry = useMemo(() => {
    if (!activeFilePath) {
      return null;
    }
    return gisFileMap.get(activeFilePath) ?? null;
  }, [activeFilePath, gisFileMap]);

  const datasetName = useMemo(() => {
    if (activeFileEntry?.name) {
      return activeFileEntry.name;
    }
    if (activeTab?.name) {
      return activeTab.name;
    }
    if (activeFilePath) {
      const segments = activeFilePath.split('/');
      return segments[segments.length - 1] || activeFilePath;
    }
    return 'GISデータセット';
  }, [activeFileEntry, activeFilePath, activeTab]);

  const datasetType = useMemo(() => {
    if (activeFileEntry?.type) {
      return activeFileEntry.type;
    }
    if (activeTab?.type && (GIS_FILE_TYPES as readonly string[]).includes(activeTab.type as string)) {
      return activeTab.type as GisFileType;
    }
    return null;
  }, [activeFileEntry, activeTab]);

  const geometryInfo = useMemo(() => {
    if (!featureCollection) {
      return { counts: [] as { type: string; count: number }[], boundingBox: null as null | {
        west: number;
        south: number;
        east: number;
        north: number;
      } };
    }

    const countsMap = new Map<string, number>();
    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    const updateBounds = (lng: unknown, lat: unknown) => {
      if (typeof lng !== 'number' || typeof lat !== 'number') {
        return;
      }
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return;
      }
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    };

    const walkCoordinates = (coordinates: unknown): void => {
      if (!coordinates) {
        return;
      }

      if (Array.isArray(coordinates)) {
        if (coordinates.length > 0 && typeof coordinates[0] === 'number') {
          const [lng, lat] = coordinates as [number, number];
          updateBounds(lng, lat);
          return;
        }
        coordinates.forEach((item) => {
          walkCoordinates(item);
        });
      }
    };

    const processGeometry = (geometry: Geometry | null | undefined) => {
      if (!geometry) {
        return;
      }
      if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
        geometry.geometries.forEach((nested) => processGeometry(nested));
        return;
      }
      walkCoordinates((geometry as Geometry & { coordinates?: unknown }).coordinates);
    };

    featureCollection.features.forEach((feature) => {
      const type = feature.geometry?.type ?? 'Unknown';
      countsMap.set(type, (countsMap.get(type) ?? 0) + 1);
      processGeometry(feature.geometry);
    });

    const counts = Array.from(countsMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    const hasBounds = Number.isFinite(minLng) && Number.isFinite(minLat) && Number.isFinite(maxLng) && Number.isFinite(maxLat);

    return {
      counts,
      boundingBox: hasBounds
        ? {
            west: minLng,
            south: minLat,
            east: maxLng,
            north: maxLat,
          }
        : null,
    };
  }, [featureCollection]);

  const selectedColumnProfile = useMemo(() => {
    if (!activeSelectedColumn) {
      return null;
    }

    const values = rows
      .map((row) => {
        if (!row || typeof row !== 'object') {
          return undefined;
        }
        return (row as Record<string, unknown>)[activeSelectedColumn];
      })
      .filter((value) => value !== null && value !== undefined);

    const missingCount = Math.max(rows.length - values.length, 0);

    if (values.length === 0) {
      return { kind: 'empty' as const, missingCount };
    }

    const numericValues = values
      .map((value) => {
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : Number.NaN;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : Number.NaN;
        }
        return Number.NaN;
      })
      .filter((value) => !Number.isNaN(value));

    const numericRatio = values.length > 0 ? numericValues.length / values.length : 0;

    if (numericValues.length > 0 && numericRatio >= 0.6) {
      const limited = numericValues.slice(0, 5000).sort((a, b) => a - b);
      const count = numericValues.length;
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);
      const sum = numericValues.reduce((acc, value) => acc + value, 0);
      const mean = sum / count;
      const midIndex = Math.floor(limited.length / 2);
      const median = limited.length % 2 === 0
        ? (limited[midIndex - 1] + limited[midIndex]) / 2
        : limited[midIndex];

      return {
        kind: 'numeric' as const,
        count,
        missingCount,
        min,
        max,
        mean,
        median,
      };
    }

    const frequency = new Map<string, number>();
    values.forEach((value) => {
      const label = truncateLabel(valueToLabel(value), 80);
      frequency.set(label, (frequency.get(label) ?? 0) + 1);
    });

    const topValues = Array.from(frequency.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      kind: 'categorical' as const,
      count: values.length,
      missingCount,
      uniqueCount: frequency.size,
      topValues,
    };
  }, [activeSelectedColumn, rows]);

  const analysisContext = useMemo(() => {
    const lines: string[] = [];
    const featureCount = featureCollection?.features.length ?? 0;

    lines.push('このサマリーはDataLoom StudioのGIS分析モードで地図上に可視化されたデータです。');
    lines.push(`対象ファイル: ${datasetName} (${activeFilePath ?? '未保存パス'})`);
    if (datasetType) {
      lines.push(`ファイル種別: ${datasetType}`);
    }
    lines.push(`フィーチャー数: ${featureCount} / 属性行数: ${rows.length}`);

    if (geometryInfo.counts.length > 0) {
      const summary = geometryInfo.counts
        .map((entry) => `${entry.type}: ${entry.count}件`)
        .join(', ');
      lines.push(`ジオメトリタイプ内訳: ${summary}`);
    }

    if (geometryInfo.boundingBox) {
      const { north, south, east, west } = geometryInfo.boundingBox;
      lines.push(
        `地理的範囲（緯度/経度）: 北 ${formatNumber(north, 4)}°, 南 ${formatNumber(south, 4)}°, 東 ${formatNumber(east, 4)}°, 西 ${formatNumber(west, 4)}°`,
      );
    }

    if (activeSelectedColumn) {
      if (!selectedColumnProfile || selectedColumnProfile.kind === 'empty') {
        lines.push(`可視化対象カラム: ${activeSelectedColumn}（値が取得できませんでした）`);
      } else if (selectedColumnProfile.kind === 'numeric') {
        lines.push(
          `可視化対象カラム: ${activeSelectedColumn}（数値: 有効データ ${selectedColumnProfile.count} 件, 欠損 ${selectedColumnProfile.missingCount} 件, ` +
            `最小 ${formatNumber(selectedColumnProfile.min, 4)}, 最大 ${formatNumber(selectedColumnProfile.max, 4)}, ` +
            `平均 ${formatNumber(selectedColumnProfile.mean, 4)}, 中央値 ${formatNumber(selectedColumnProfile.median, 4)}）`,
        );
      } else if (selectedColumnProfile.kind === 'categorical') {
        const topValues = selectedColumnProfile.topValues
          .map((entry) => {
            const ratio = selectedColumnProfile.count > 0 ? (entry.count / selectedColumnProfile.count) * 100 : 0;
            return `${entry.value}（${entry.count}件, ${formatPercentage(ratio, 1)}）`;
          })
          .join(', ');
        lines.push(
          `可視化対象カラム: ${activeSelectedColumn}（カテゴリ: 有効データ ${selectedColumnProfile.count} 件, 欠損 ${selectedColumnProfile.missingCount} 件, ` +
            `ユニーク値 ${selectedColumnProfile.uniqueCount} 件, 上位: ${topValues || 'データ不足'}）`,
        );
      }
    } else {
      lines.push('可視化対象カラム: 未選択');
    }

    const styleParts = [
      `ベースカラー ${activeStyleSettings.color}`,
      `明度 ${activeStyleSettings.brightness}`,
      `透明度 ${activeStyleSettings.fillOpacity}%`,
      `ライン太さ ${activeStyleSettings.lineWeight}px`,
      `ポイント半径 ${activeStyleSettings.pointRadius}px`,
      activeStyleSettings.valueDriven
        ? `値に応じて色分け（強調度 ${activeStyleSettings.valueIntensity}%）`
        : '値に応じた色分けなし',
    ];
    lines.push(`スタイル設定: ${styleParts.join(' / ')}`);

    lines.push(
      '分析観点: 地理的な偏り・クラスタ・異常値や、特定地域での高低やカテゴリの集中度を明らかにし、ビジネスで活用できる示唆を提示してください。',
    );
    lines.push('可能であれば、具体的な地域名・座標範囲・値の範囲を挙げて説明してください。');

    return lines.join('\n');
  }, [
    datasetName,
    datasetType,
    featureCollection?.features.length,
    geometryInfo.boundingBox,
    geometryInfo.counts,
    rows.length,
    activeFilePath,
    activeSelectedColumn,
    selectedColumnProfile,
    activeStyleSettings.brightness,
    activeStyleSettings.color,
    activeStyleSettings.fillOpacity,
    activeStyleSettings.lineWeight,
    activeStyleSettings.pointRadius,
    activeStyleSettings.valueDriven,
    activeStyleSettings.valueIntensity,
  ]);

  const aiSummary = useMemo(() => {
    if (rows.length === 0) {
      return null;
    }
    return buildAnalysisSummary({
      datasetName,
      datasetType: datasetType ? `GIS:${datasetType}` : 'GIS',
      columns,
      rows,
      analysisContext,
    });
  }, [analysisContext, columns, datasetName, datasetType, rows]);

  useEffect(() => {
    setAnalysisSummary(aiSummary);
  }, [aiSummary, setAnalysisSummary]);

  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      datasetCacheRef.current.clear();
      useGisAnalysisStore.getState().reset();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let cancelled = false;
    setLeafletLoading(true);
    setLeafletError(null);

    loadLeaflet()
      .then((library) => {
        if (cancelled) {
          return;
        }
        setLeafletLib(library);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        const message = loadError instanceof Error
          ? loadError.message
          : 'Leafletライブラリの読み込みに失敗しました。';
        setLeafletLib(null);
        setLeafletError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setLeafletLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const initialiseMap = useCallback(() => {
    if (!mapContainerRef.current || mapInstanceRef.current || !leafletLib) {
      return;
    }

    const map = leafletLib.map(mapContainerRef.current, {
      center: [35.681236, 139.767125],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });

    leafletLib.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;
  }, [leafletLib]);

  useEffect(() => {
    if (typeof window === 'undefined' || !leafletLib) {
      return;
    }
    initialiseMap();
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [initialiseMap, leafletLib]);

  const numericStatsByPath = useMemo(() => {
    const stats: Record<string, { min: number; max: number } | null> = {};

    selectedFilePaths.forEach((path) => {
      const dataset = datasets[path];
      const column = selectedColumns[path];
      if (!dataset || !column) {
        stats[path] = null;
        return;
      }

      const values = dataset.rows
        .map((row) => row?.[column])
        .filter((value) => value !== null && value !== undefined && value !== '');

      if (values.length === 0) {
        stats[path] = null;
        return;
      }

      const numericValues = values
        .map((value) => {
          if (typeof value === 'number') {
            return Number.isFinite(value) ? value : Number.NaN;
          }
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : Number.NaN;
        })
        .filter((value) => !Number.isNaN(value));

      if (numericValues.length === 0) {
        stats[path] = null;
        return;
      }

      stats[path] = {
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
      };
    });

    return stats;
  }, [datasets, selectedColumns, selectedFilePaths]);

  const activeNumericStats = useMemo(() => {
    if (!activeFilePath) {
      return null;
    }
    return numericStatsByPath[activeFilePath] ?? null;
  }, [activeFilePath, numericStatsByPath]);

  useEffect(() => {
    if (!activeNumericStats && activeStyleSettings.valueDriven) {
      updateActiveStyleSettings((prev) => ({ ...prev, valueDriven: false }));
    }
  }, [activeNumericStats, activeStyleSettings.valueDriven, updateActiveStyleSettings]);

  const computeColorForFeature = useCallback(
    (path: string, value: unknown) => {
      const settings = resolveStyleSettings(path);
      const baseColor = adjustColorBrightness(settings.color, settings.brightness);
      const stats = numericStatsByPath[path];

      if (!settings.valueDriven || !stats) {
        return baseColor;
      }

      const numericValue = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numericValue)) {
        return baseColor;
      }

      const { min, max } = stats;
      if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return baseColor;
      }

      const normalized = clamp((numericValue - min) / (max - min), 0, 1);
      const intensity = clamp(settings.valueIntensity / 100, 0, 1);
      return mixColors(baseColor, '#ffffff', normalized * intensity);
    },
    [numericStatsByPath, resolveStyleSettings],
  );

  const updateGeoJsonLayerStyle = useCallback(() => {
    const layer = geoJsonLayerRef.current;
    if (!layer || !leafletLib) {
      return;
    }

    layer.eachLayer((subLayer) => {
      const leafletLayer = subLayer as (CircleMarker | Path) & { feature?: GeoJSON.Feature };
      const feature = leafletLayer.feature;
      const properties =
        feature && feature.properties && typeof feature.properties === 'object'
          ? (feature.properties as Record<string, unknown>)
          : null;
      const sourcePath = properties && typeof properties.__source_path === 'string'
        ? (properties.__source_path as string)
        : null;

      if (!sourcePath) {
        return;
      }

      const settings = resolveStyleSettings(sourcePath);
      const fillOpacity = clamp(settings.fillOpacity / 100, 0, 1);
      const selectedColumnForSource = selectedColumns[sourcePath] ?? null;
      const value = selectedColumnForSource && properties ? properties[selectedColumnForSource] : undefined;
      const color = computeColorForFeature(sourcePath, value);

      if (leafletLayer instanceof leafletLib.CircleMarker) {
        leafletLayer.setStyle({
          color,
          fillColor: color,
          fillOpacity,
          opacity: fillOpacity,
          weight: 1,
        });
        leafletLayer.setRadius(settings.pointRadius);
      } else if (leafletLayer instanceof leafletLib.Path) {
        leafletLayer.setStyle({
          color,
          weight: settings.lineWeight,
          fillColor: color,
          fillOpacity,
          opacity: fillOpacity,
        });
      }

      if (feature && leafletLayer.bindPopup && properties) {
        const popupLines: string[] = [];
        const sourceName = typeof properties.__source_name === 'string' ? String(properties.__source_name) : null;
        if (sourceName) {
          popupLines.push(`<div class="text-xs font-semibold text-gray-700 dark:text-gray-200">${escapeHtml(sourceName)}</div>`);
        }
        if (selectedColumnForSource) {
          popupLines.push(
            `<div><strong>${escapeHtml(selectedColumnForSource)}</strong>: ${escapeHtml(properties[selectedColumnForSource])}</div>`,
          );
        }

        const additionalColumns = (columnCache[sourcePath] ?? [])
          .filter((column) => column !== selectedColumnForSource)
          .slice(0, 4);

        additionalColumns.forEach((column) => {
          popupLines.push(`<div>${escapeHtml(column)}: ${escapeHtml(properties[column])}</div>`);
        });

        leafletLayer.bindPopup(`<div class="text-sm space-y-1">${popupLines.join('')}</div>`);
      }
    });
  }, [columnCache, computeColorForFeature, leafletLib, resolveStyleSettings, selectedColumns]);

  const combinedFeatureCollection = useMemo(() => {
    const features: FeatureCollection['features'] = [];

    selectedFilePaths.forEach((path) => {
      const dataset = datasets[path];
      if (!dataset?.featureCollection) {
        return;
      }
      const entry = gisFileMap.get(path);
      const rowsForDataset = dataset.rows;

      dataset.featureCollection.features.forEach((feature, index) => {
        const row = rowsForDataset[index];
        const sanitizedProperties: Record<string, unknown> = {};
        if (row && typeof row === 'object') {
          Object.entries(row as Record<string, unknown>).forEach(([key, value]) => {
            if (key !== 'geometry') {
              sanitizedProperties[key] = value;
            }
          });
        }

        features.push({
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            __feature_index: index,
            __source_path: path,
            __source_name: entry?.name ?? path.split('/').pop() ?? path,
            ...sanitizedProperties,
          },
        });
      });
    });

    return features.length > 0
      ? ({
          type: 'FeatureCollection',
          features,
        } as FeatureCollection)
      : null;
  }, [datasets, gisFileMap, selectedFilePaths]);

  useEffect(() => {
    const mapInstance = mapInstanceRef.current;
    if (!mapInstance || !leafletLib) {
      return;
    }

    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove();
      geoJsonLayerRef.current = null;
    }

    if (!combinedFeatureCollection) {
      return;
    }

    const layer = leafletLib.geoJSON(combinedFeatureCollection, {
      pointToLayer: (feature, latlng) => {
        const properties =
          feature && feature.properties && typeof feature.properties === 'object'
            ? (feature.properties as Record<string, unknown>)
            : {};
        const sourcePath = typeof properties.__source_path === 'string' ? (properties.__source_path as string) : '';
        const settings = resolveStyleSettings(sourcePath);
        const selectedColumnForSource = selectedColumns[sourcePath] ?? null;
        const value = selectedColumnForSource ? properties[selectedColumnForSource] : undefined;
        const color = computeColorForFeature(sourcePath, value);
        const opacity = clamp(settings.fillOpacity / 100, 0, 1);
        return leafletLib.circleMarker(latlng, {
          radius: settings.pointRadius,
          color,
          fillColor: color,
          fillOpacity: opacity,
          opacity,
          weight: 1,
        });
      },
    });

    layer.addTo(mapInstance);
    geoJsonLayerRef.current = layer;

    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      mapInstance.fitBounds(bounds, { padding: [24, 24] });
    }

    updateGeoJsonLayerStyle();
  }, [
    combinedFeatureCollection,
    computeColorForFeature,
    leafletLib,
    resolveStyleSettings,
    selectedColumns,
    updateGeoJsonLayerStyle,
  ]);

  useEffect(() => {
    updateGeoJsonLayerStyle();
  }, [combinedFeatureCollection, updateGeoJsonLayerStyle]);

  useEffect(() => {
    setAiAnalysisResult(null);
    setAiAnalysisError(null);
  }, [analysisContext, activeFilePath, activeSelectedColumn]);

  const applyDatasetToState = useCallback(
    (path: string, dataset: { rows: any[]; columns: string[]; featureCollection: FeatureCollection | null }) => {
      setDatasets((previous) => ({ ...previous, [path]: dataset }));

      const preferredColumns = getPreferredColumns(dataset.columns);
      updateColumnCache(path, preferredColumns);

      if (preferredColumns.length > 0) {
        const currentColumn = useGisAnalysisStore.getState().selectedColumns[path] ?? null;
        if (!currentColumn || !preferredColumns.includes(currentColumn)) {
          setSelectedColumn(path, preferredColumns[0]);
        }
      } else {
        setSelectedColumn(path, null);
      }

      setErrorsByPath((previous) => {
        const next = { ...previous };
        delete next[path];
        return next;
      });
    },
    [setSelectedColumn, setErrorsByPath, updateColumnCache],
  );

  const removeDatasetForPath = useCallback((path: string) => {
    setDatasets((previous) => {
      if (!(path in previous)) {
        return previous;
      }
      const next = { ...previous };
      delete next[path];
      return next;
    });
  }, []);

  const resolveGisResult = useCallback(
    (path: string, result: GisParseResult, options?: { cache?: boolean }) => {
      if (result.error) {
        removeDatasetForPath(path);
        setErrorsByPath((previous) => ({ ...previous, [path]: result.error ?? 'GISデータの解析に失敗しました。' }));
        datasetCacheRef.current.delete(path);
        clearColumnCache(path);
        setSelectedColumn(path, null);
        return;
      }

      const dataset = {
        rows: result.rows,
        columns: result.columns,
        featureCollection: result.featureCollection ?? null,
      };

      if (options?.cache) {
        datasetCacheRef.current.set(path, dataset);
      }

      applyDatasetToState(path, dataset);
    },
    [applyDatasetToState, clearColumnCache, removeDatasetForPath, setErrorsByPath, setSelectedColumn],
  );

  const loadArrayBufferFromHandle = async (fileHandle?: FileSystemFileHandle | TabData['file']) => {
    if (!fileHandle) {
      return null;
    }

    if (fileHandle instanceof File) {
      return fileHandle.arrayBuffer();
    }

    if ('getFile' in fileHandle) {
      const file = await fileHandle.getFile();
      return file.arrayBuffer();
    }

    return null;
  };

  const loadGisFile = useCallback(async (path: string) => {
    const entry = gisFileMap.get(path);
    const tab = tabs.get(path);

    const shouldBypassCache = Boolean(tab?.isDirty);
    if (shouldBypassCache) {
      datasetCacheRef.current.delete(path);
    }
    const cached = datasetCacheRef.current.get(path);
    if (cached && !shouldBypassCache) {
      applyDatasetToState(path, cached);
      return;
    }

    if (!entry && !tab) {
      removeDatasetForPath(path);
      clearColumnCache(path);
      setErrorsByPath((previous) => ({ ...previous, [path]: '選択されたファイルを読み込めませんでした' }));
      return;
    }

    const fileType = entry?.type ?? (tab?.type as GisFileType | undefined);
    if (!fileType) {
      removeDatasetForPath(path);
      clearColumnCache(path);
      setErrorsByPath((previous) => ({ ...previous, [path]: 'このファイル形式はGIS分析に対応していません' }));
      return;
    }

    setPathLoading(path, true);
    setErrorsByPath((previous) => {
      const next = { ...previous };
      delete next[path];
      return next;
    });

    try {
      switch (fileType) {
        case 'geojson': {
          let content = typeof tab?.content === 'string' ? tab.content : undefined;
          if (!content && entry?.fileHandle) {
            content = await readFileContent(entry.fileHandle);
          }
          if (!content) {
            const remote = await fetchWorkspaceFile(path);
            if (remote?.kind === 'text') {
              content = remote.content;
            }
          }
          if (!content) {
            throw new Error('GeoJSONの内容を取得できませんでした');
          }
          const result = parseGeoJsonContent(content);
          resolveGisResult(path, result, { cache: !shouldBypassCache });
          break;
        }
        case 'kml': {
          let content = typeof tab?.content === 'string' ? tab.content : undefined;
          if (!content && entry?.fileHandle) {
            content = await readFileContent(entry.fileHandle);
          }
          if (!content) {
            const remote = await fetchWorkspaceFile(path);
            if (remote?.kind === 'text') {
              content = remote.content;
            }
          }
          if (!content) {
            throw new Error('KMLの内容を取得できませんでした');
          }
          const result = await parseKmlContent(content);
          resolveGisResult(path, result, { cache: !shouldBypassCache });
          break;
        }
        case 'kmz': {
          const buffer = await loadArrayBufferFromHandle(tab?.file ?? entry?.fileHandle);
          let workingBuffer = buffer;
          if (!workingBuffer) {
            const remote = await fetchWorkspaceFile(path);
            if (remote?.kind === 'base64') {
              workingBuffer = base64ToArrayBuffer(remote.content);
            }
          }
          if (!workingBuffer || workingBuffer.byteLength === 0) {
            throw new Error('KMZの内容を取得できませんでした');
          }
          const result = await parseKmzContent(workingBuffer);
          resolveGisResult(path, result, { cache: !shouldBypassCache });
          break;
        }
        case 'shapefile': {
          const buffer = await loadArrayBufferFromHandle(tab?.file ?? entry?.fileHandle);
          let workingBuffer = buffer;
          if (!workingBuffer) {
            const remote = await fetchWorkspaceFile(path);
            if (remote?.kind === 'base64') {
              workingBuffer = base64ToArrayBuffer(remote.content);
            }
          }
          if (!workingBuffer || workingBuffer.byteLength === 0) {
            throw new Error('シェープファイルの内容を取得できませんでした');
          }
          const result = await parseShapefileContent(workingBuffer);
          resolveGisResult(path, result, { cache: !shouldBypassCache });
          break;
        }
        default:
          removeDatasetForPath(path);
          clearColumnCache(path);
          setErrorsByPath((previous) => ({ ...previous, [path]: 'このファイル形式には対応していません' }));
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'ファイルの読み込みに失敗しました';
      removeDatasetForPath(path);
      clearColumnCache(path);
      datasetCacheRef.current.delete(path);
      setErrorsByPath((previous) => ({ ...previous, [path]: message }));
    } finally {
      setPathLoading(path, false);
    }
  }, [
    applyDatasetToState,
    clearColumnCache,
    gisFileMap,
    removeDatasetForPath,
    resolveGisResult,
    setErrorsByPath,
    setPathLoading,
    tabs,
  ]);

  const canRequestAiAnalysis = useMemo(() => {
    return Boolean(aiSummary && featureCollection && rows.length > 0);
  }, [aiSummary, featureCollection, rows.length]);

  const handleRequestAiAnalysis = useCallback(async () => {
    if (!aiSummary || !featureCollection || rows.length === 0) {
      setAiAnalysisError('分析対象の地図データが読み込まれていません。');
      setAiAnalysisResult(null);
      return;
    }

    setAiAnalysisLoading(true);
    setAiAnalysisError(null);
    setAiAnalysisResult(null);

    try {
      const additionalPrompt = analysisPrompt.trim();
      const customInstructionLines = [
        '与えられたJSONサマリーは地図上にプロットしたGIS属性データです。',
        '空間的な傾向や地域ごとの差異、異常値、ビジネスで活用できる洞察を日本語で整理してください。',
        '事実に基づき、可能であれば具体的な地名・座標範囲・値のレンジを提示してください。',
      ];
      if (additionalPrompt.length > 0) {
        customInstructionLines.push(`ユーザーからの追加要望: ${additionalPrompt}`);
      }

      const response = await fetch('/api/llm/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: aiSummary,
          customInstruction: customInstructionLines.join('\n'),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof (payload as any).error === 'string'
          ? (payload as { error: string }).error
          : `GIS分析レポートの生成に失敗しました。（${response.status}）`;
        throw new Error(message);
      }

      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof (payload as Record<string, unknown>).markdown !== 'string' ||
        !Array.isArray((payload as Record<string, unknown>).bulletSummary)
      ) {
        throw new Error('ChatGPTから有効な分析結果を取得できませんでした。');
      }

      setAiAnalysisResult(payload as LlmReportResponse);
    } catch (error) {
      console.error('GIS AI analysis error:', error);
      const message = error instanceof Error ? error.message : 'GIS分析レポートの生成に失敗しました。';
      setAiAnalysisError(message);
    } finally {
      setAiAnalysisLoading(false);
    }
  }, [aiSummary, analysisPrompt, featureCollection, rows.length]);

  useEffect(() => {
    if (selectedFilePaths.length === 0) {
      setDatasets({});
      setErrorsByPath({});
      return;
    }

    selectedFilePaths.forEach((path) => {
      loadGisFile(path).catch((err) => {
        console.error('Failed to load GIS file:', err);
        setErrorsByPath((previous) => ({ ...previous, [path]: err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました' }));
      });
    });
  }, [loadGisFile, selectedFilePaths]);

  useEffect(() => {
    setDatasets((previous) => {
      const next = { ...previous };
      let mutated = false;
      Object.keys(next).forEach((path) => {
        if (!selectedFilePaths.includes(path)) {
          delete next[path];
          mutated = true;
        }
      });
      return mutated ? next : previous;
    });

    setErrorsByPath((previous) => {
      const next = { ...previous };
      let mutated = false;
      Object.keys(next).forEach((path) => {
        if (!selectedFilePaths.includes(path)) {
          delete next[path];
          mutated = true;
        }
      });
      return mutated ? next : previous;
    });

    setLoadingPaths((previous) => {
      const next = new Set(previous);
      let mutated = false;
      Array.from(next).forEach((path) => {
        if (!selectedFilePaths.includes(path)) {
          next.delete(path);
          mutated = true;
        }
      });
      return mutated ? next : previous;
    });
  }, [selectedFilePaths]);

  useEffect(() => {
    Object.keys(columnCache).forEach((path) => {
      if (!selectedFilePaths.includes(path)) {
        clearColumnCache(path);
      }
    });
  }, [clearColumnCache, columnCache, selectedFilePaths]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    map.whenReady(() => {
      setTimeout(() => {
        map.invalidateSize();
      }, 50);
    });
  }, [combinedFeatureCollection, leafletLib, selectedFilePaths.length]);

  useEffect(() => {
    if (selectedFilePaths.length > 0) {
      return;
    }

    if (gisFileMap.has(tabId)) {
      setActiveFilePath(tabId);
      return;
    }

    if (isGisTab(activeTab)) {
      setActiveFilePath(activeTab.id);
    }
  }, [activeTab, gisFileMap, selectedFilePaths.length, setActiveFilePath, tabId]);

  const renderMapOverlay = () => {
    const renderCenteredOverlay = (content: React.ReactNode) => (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="pointer-events-auto">{content}</div>
      </div>
    );

    if (leafletError) {
      return renderCenteredOverlay(
        <div className="max-w-md rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/40 dark:text-red-200">
          <div className="font-medium">地図表示の初期化に失敗しました</div>
          <div className="mt-1 whitespace-pre-line leading-relaxed">{leafletError}</div>
        </div>,
      );
    }

    if (activeError && (!combinedFeatureCollection || combinedFeatureCollection.features.length === 0)) {
      return renderCenteredOverlay(
        <div className="max-w-md rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/40 dark:text-red-200">
          <div className="font-medium">GISデータの読み込みに失敗しました</div>
          <div className="mt-1 whitespace-pre-line leading-relaxed">{activeError}</div>
        </div>,
      );
    }

    if (leafletLoading || !leafletLib || !mapInstanceRef.current) {
      return renderCenteredOverlay(
        <div className="rounded bg-white/80 px-4 py-2 text-sm text-gray-600 shadow-sm dark:bg-gray-900/70 dark:text-gray-300">
          OpenStreetMapを初期化しています…
        </div>,
      );
    }

    if (isAnyLoading && (!combinedFeatureCollection || combinedFeatureCollection.features.length === 0)) {
      return renderCenteredOverlay(
        <div className="rounded bg-white/80 px-4 py-2 text-sm text-gray-600 shadow-sm dark:bg-gray-900/70 dark:text-gray-300">
          GISデータを解析しています…
        </div>,
      );
    }

    if (selectedFilePaths.length === 0) {
      return (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <div className="pointer-events-auto rounded border border-gray-200 bg-white/85 px-4 py-2 text-center text-sm text-gray-600 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300">
            左サイドバーのGISファイルから表示したいデータを選択してください。
          </div>
        </div>
      );
    }

    if (!combinedFeatureCollection || combinedFeatureCollection.features.length === 0) {
      return renderCenteredOverlay(
        <div className="rounded border border-gray-200 bg-white/85 px-4 py-2 text-center text-sm text-gray-600 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300">
          選択したファイルに表示可能な地物がありません。別のファイルまたはカラムを選択してください。
        </div>,
      );
    }

    return null;
  };

  const isNumericColumn = Boolean(activeNumericStats);

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-gray-900">
      <main className="relative flex flex-1 flex-col">
        <div className="relative flex-1">
          <div ref={mapContainerRef} className="relative z-0 h-full w-full" />
          {renderMapOverlay()}
        </div>
        {selectedFilePaths.length > 0 && (
          <div className="max-h-64 overflow-y-auto border-t border-gray-200 bg-white/90 text-xs dark:border-gray-800 dark:bg-gray-900/60">
            {selectedFilePaths.map((path) => {
              const dataset = datasets[path];
              const isExpanded = expandedTables[path] ?? false;
              const isLoading = loadingPaths.has(path);
              const errorMessage = errorsByPath[path] ?? null;
              const fileEntry = gisFileMap.get(path);
              const displayName = fileEntry?.name ?? path.split('/').pop() ?? path;
              const datasetColumns = dataset?.columns ?? [];
              const preferredColumns = dataset ? getPreferredColumns(datasetColumns) : [];
              const cachedColumns = columnCache[path] ?? [];
              const fallbackColumns = preferredColumns.length > 0
                ? preferredColumns
                : cachedColumns.length > 0
                ? cachedColumns
                : datasetColumns.length > 0
                ? datasetColumns
                : dataset && dataset.rows.length > 0
                ? Object.keys(dataset.rows[0] ?? {}).filter((key) => key !== 'geometry')
                : [];
              const limitedColumns = fallbackColumns.slice(0, 8);
              const displayRows = dataset ? dataset.rows.slice(0, 50) : [];
              const rowCount = dataset?.rows.length ?? 0;

              return (
                <div key={path} className="border-b border-gray-200 last:border-b-0 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => toggleTableExpansion(path)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <span className="flex items-center gap-2">
                      {isExpanded ? <IoChevronDown size={14} /> : <IoChevronForward size={14} />}
                      <span className="truncate">{displayName}</span>
                    </span>
                    <span className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                      <span>行 {rowCount.toLocaleString('ja-JP')}</span>
                      <span>列 {(datasetColumns.length || fallbackColumns.length).toLocaleString('ja-JP')}</span>
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      {isLoading ? (
                        <div className="py-6 text-center text-[11px] text-gray-500 dark:text-gray-400">属性データを読み込んでいます…</div>
                      ) : errorMessage ? (
                        <div className="rounded border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300">
                          {errorMessage}
                        </div>
                      ) : dataset && displayRows.length > 0 && limitedColumns.length > 0 ? (
                        <>
                          <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-[11px]">
                              <thead>
                                <tr className="bg-gray-100 text-left font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-200">
                                  <th className="w-12 px-2 py-1 text-[11px] text-gray-500 dark:text-gray-300">#</th>
                                  {limitedColumns.map((column) => (
                                    <th key={`${path}-head-${column}`} className="px-2 py-1 text-[11px] text-gray-500 dark:text-gray-300">
                                      {column}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {displayRows.map((row, index) => (
                                  <tr
                                    key={`${path}-row-${index}`}
                                    className={index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/70'}
                                  >
                                    <td className="px-2 py-1 text-[11px] text-gray-400">{index + 1}</td>
                                    {limitedColumns.map((column) => (
                                      <td key={`${path}-${column}-${index}`} className="px-2 py-1 text-[11px] text-gray-700 dark:text-gray-200">
                                        {truncateLabel(valueToLabel((row ?? {})[column]), 80)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {dataset.rows.length > displayRows.length && (
                            <div className="mt-1 text-right text-[11px] text-gray-400 dark:text-gray-500">先頭50件を表示しています</div>
                          )}
                        </>
                      ) : (
                        <div className="py-4 text-center text-[11px] text-gray-500 dark:text-gray-400">
                          表示できる属性データがありません。
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <aside className="w-80 flex-shrink-0 border-l border-gray-200 bg-white/80 p-4 overflow-y-auto dark:border-gray-800 dark:bg-gray-900/60">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">シンボル設定</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            選択中のカラムを地図上にどのように表現するかを調整できます。
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">ベースカラー</label>
            <input
              type="color"
              value={activeStyleSettings.color}
              onChange={(event) => updateActiveStyleSettings((prev) => ({ ...prev, color: event.target.value }))}
              className="mt-1 h-10 w-full cursor-pointer rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">明度</label>
            <input
              type="range"
              min={-50}
              max={50}
              value={activeStyleSettings.brightness}
              onChange={(event) => updateActiveStyleSettings((prev) => ({ ...prev, brightness: Number(event.target.value) }))}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{activeStyleSettings.brightness}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">透明度</label>
            <input
              type="range"
              min={10}
              max={100}
              value={activeStyleSettings.fillOpacity}
              onChange={(event) => updateActiveStyleSettings((prev) => ({ ...prev, fillOpacity: Number(event.target.value) }))}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{activeStyleSettings.fillOpacity}%</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">ポイント半径</label>
            <input
              type="range"
              min={2}
              max={20}
              value={activeStyleSettings.pointRadius}
              onChange={(event) => updateActiveStyleSettings((prev) => ({ ...prev, pointRadius: Number(event.target.value) }))}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{activeStyleSettings.pointRadius}px</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">ライン太さ</label>
            <input
              type="range"
              min={1}
              max={10}
              value={activeStyleSettings.lineWeight}
              onChange={(event) => updateActiveStyleSettings((prev) => ({ ...prev, lineWeight: Number(event.target.value) }))}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{activeStyleSettings.lineWeight}px</div>
          </div>

          <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={activeStyleSettings.valueDriven && isNumericColumn}
                onChange={(event) => updateActiveStyleSettings((prev) => ({
                  ...prev,
                  valueDriven: isNumericColumn ? event.target.checked : false,
                }))}
                disabled={!isNumericColumn}
              />
              値に応じて色を変化
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              数値カラムの場合、値の大小に合わせて色を自動調整します。
            </p>

            <label className="mt-3 block text-xs font-medium text-gray-600 dark:text-gray-300">
              値の強調度
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={activeStyleSettings.valueIntensity}
              onChange={(event) => updateActiveStyleSettings((prev) => ({ ...prev, valueIntensity: Number(event.target.value) }))}
              disabled={!activeStyleSettings.valueDriven || !isNumericColumn}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">
              {activeStyleSettings.valueIntensity}%
            </div>
          </div>

          {activeNumericStats && activeSelectedColumn && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
              <div className="font-semibold">{activeSelectedColumn} の統計</div>
              <div className="mt-2 flex flex-col gap-1">
                <div>最小値: {activeNumericStats.min.toLocaleString()}</div>
                <div>最大値: {activeNumericStats.max.toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 border-t border-gray-200 pt-4 dark:border-gray-800">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">ChatGPTに分析を依頼</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                地図に表示しているデータの傾向や注目ポイントをAIに解説してもらえます。
              </p>
            </div>
          </div>

          <label className="mt-4 block text-xs font-medium text-gray-600 dark:text-gray-300" htmlFor="gis-ai-prompt">
            追加で伝えたいこと（任意）
          </label>
          <textarea
            id="gis-ai-prompt"
            value={analysisPrompt}
            onChange={(event) => setAnalysisPrompt(event.target.value)}
            rows={3}
            placeholder="例: 東京23区の中で値が高いエリアの理由を知りたい"
            className="mt-1 w-full rounded border border-gray-200 bg-white p-2 text-xs text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:border-blue-400"
          />

          <button
            type="button"
            onClick={() => { void handleRequestAiAnalysis(); }}
            disabled={!canRequestAiAnalysis || aiAnalysisLoading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-800/60"
          >
            {aiAnalysisLoading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                生成中...
              </>
            ) : (
              <>
                <IoSparkles size={16} />
                ChatGPTに分析してもらう
              </>
            )}
          </button>

          {!canRequestAiAnalysis && !aiAnalysisLoading && (
            <p className="mt-2 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
              <IoWarningOutline size={14} className="mt-0.5 flex-shrink-0" />
              地図にデータを読み込むと分析を依頼できます。対応ファイルを選択し、プロットを表示してください。
            </p>
          )}

          {aiAnalysisError && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300">
              {aiAnalysisError}
            </div>
          )}

          {aiAnalysisResult && (
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">要点</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                  {aiAnalysisResult.bulletSummary.map((item, index) => (
                    <li key={`gis-ai-bullet-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Markdownレポート</h3>
                <div className="mt-2 max-h-64 overflow-y-auto rounded border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysisResult.markdown}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default GisAnalysisView;
