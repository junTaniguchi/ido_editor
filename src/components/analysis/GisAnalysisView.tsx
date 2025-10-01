'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Geometry } from 'geojson';
import L, { CircleMarker, GeoJSON as LeafletGeoJSON, Path } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IoSparkles, IoWarningOutline } from 'react-icons/io5';

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
  const selectedFilePath = useGisAnalysisStore((state) => state.selectedFilePath);
  const setSelectedFile = useGisAnalysisStore((state) => state.setSelectedFilePath);
  const selectedColumn = useGisAnalysisStore((state) => state.selectedColumn);
  const setSelectedColumn = useGisAnalysisStore((state) => state.setSelectedColumn);
  const columnCache = useGisAnalysisStore((state) => state.columnCache);
  const updateColumnCache = useGisAnalysisStore((state) => state.setColumnCache);

  const [rows, setRows] = useState<any[]>([]);
  const [featureCollection, setFeatureCollection] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [styleSettings, setStyleSettings] = useState<StyleSettings>({
    color: '#2563eb',
    brightness: 0,
    fillOpacity: 60,
    lineWeight: 2,
    pointRadius: 6,
    valueDriven: true,
    valueIntensity: 60,
  });

  const [analysisPrompt, setAnalysisPrompt] = useState('');
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<LlmReportResponse | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<LeafletGeoJSON | null>(null);

  const columns = useMemo(() => {
    if (!selectedFilePath) {
      return [];
    }
    return columnCache[selectedFilePath] ?? [];
  }, [columnCache, selectedFilePath]);

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

  const selectedFileEntry = useMemo(() => {
    if (!selectedFilePath) {
      return null;
    }
    return gisFileMap.get(selectedFilePath) ?? null;
  }, [gisFileMap, selectedFilePath]);

  const datasetName = useMemo(() => {
    if (selectedFileEntry?.name) {
      return selectedFileEntry.name;
    }
    if (activeTab?.name) {
      return activeTab.name;
    }
    if (selectedFilePath) {
      const segments = selectedFilePath.split('/');
      return segments[segments.length - 1] || selectedFilePath;
    }
    return 'GISデータセット';
  }, [activeTab, selectedFileEntry, selectedFilePath]);

  const datasetType = useMemo(() => {
    if (selectedFileEntry?.type) {
      return selectedFileEntry.type;
    }
    if (activeTab?.type && (GIS_FILE_TYPES as readonly string[]).includes(activeTab.type as string)) {
      return activeTab.type as GisFileType;
    }
    return null;
  }, [activeTab, selectedFileEntry]);

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
    if (!selectedColumn) {
      return null;
    }

    const values = rows
      .map((row) => {
        if (!row || typeof row !== 'object') {
          return undefined;
        }
        return (row as Record<string, unknown>)[selectedColumn];
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
  }, [rows, selectedColumn]);

  const analysisContext = useMemo(() => {
    const lines: string[] = [];
    const featureCount = featureCollection?.features.length ?? 0;

    lines.push('このサマリーはDataLoom StudioのGIS分析モードで地図上に可視化されたデータです。');
    lines.push(`対象ファイル: ${datasetName} (${selectedFilePath ?? '未保存パス'})`);
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

    if (selectedColumn) {
      if (!selectedColumnProfile || selectedColumnProfile.kind === 'empty') {
        lines.push(`可視化対象カラム: ${selectedColumn}（値が取得できませんでした）`);
      } else if (selectedColumnProfile.kind === 'numeric') {
        lines.push(
          `可視化対象カラム: ${selectedColumn}（数値: 有効データ ${selectedColumnProfile.count} 件, 欠損 ${selectedColumnProfile.missingCount} 件, ` +
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
          `可視化対象カラム: ${selectedColumn}（カテゴリ: 有効データ ${selectedColumnProfile.count} 件, 欠損 ${selectedColumnProfile.missingCount} 件, ` +
            `ユニーク値 ${selectedColumnProfile.uniqueCount} 件, 上位: ${topValues || 'データ不足'}）`,
        );
      }
    } else {
      lines.push('可視化対象カラム: 未選択');
    }

    const styleParts = [
      `ベースカラー ${styleSettings.color}`,
      `明度 ${styleSettings.brightness}`,
      `透明度 ${styleSettings.fillOpacity}%`,
      `ライン太さ ${styleSettings.lineWeight}px`,
      `ポイント半径 ${styleSettings.pointRadius}px`,
      styleSettings.valueDriven
        ? `値に応じて色分け（強調度 ${styleSettings.valueIntensity}%）`
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
    selectedColumn,
    selectedColumnProfile,
    selectedFilePath,
    styleSettings.brightness,
    styleSettings.color,
    styleSettings.fillOpacity,
    styleSettings.lineWeight,
    styleSettings.pointRadius,
    styleSettings.valueDriven,
    styleSettings.valueIntensity,
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

  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      useGisAnalysisStore.getState().reset();
    };
  }, []);

  const initialiseMap = useCallback(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) {
      return;
    }

    const map = L.map(mapContainerRef.current, {
      center: [35.681236, 139.767125],
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    initialiseMap();
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [initialiseMap]);

  const numericStats = useMemo(() => {
    if (!selectedColumn) {
      return null;
    }

    const values = rows
      .map((row) => row?.[selectedColumn])
      .filter((value) => value !== null && value !== undefined && value !== '');

    if (values.length === 0) {
      return null;
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
      return null;
    }

    return {
      min: Math.min(...numericValues),
      max: Math.max(...numericValues),
    };
  }, [rows, selectedColumn]);

  useEffect(() => {
    if (!numericStats && styleSettings.valueDriven) {
      setStyleSettings((prev) => ({ ...prev, valueDriven: false }));
    }
  }, [numericStats, styleSettings.valueDriven]);

  const computeColor = useCallback((value: unknown) => {
    const baseColor = adjustColorBrightness(styleSettings.color, styleSettings.brightness);
    if (!styleSettings.valueDriven || !numericStats) {
      return baseColor;
    }

    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return baseColor;
    }

    const { min, max } = numericStats;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      return baseColor;
    }

    const normalized = clamp((numericValue - min) / (max - min), 0, 1);
    const intensity = clamp(styleSettings.valueIntensity / 100, 0, 1);
    return mixColors(baseColor, '#ffffff', normalized * intensity);
  }, [numericStats, styleSettings.brightness, styleSettings.color, styleSettings.valueDriven, styleSettings.valueIntensity]);

  const updateGeoJsonLayerStyle = useCallback(() => {
    const layer = geoJsonLayerRef.current;
    if (!layer) {
      return;
    }

    const fillOpacity = clamp(styleSettings.fillOpacity / 100, 0, 1);

    layer.eachLayer((subLayer) => {
      const leafletLayer = subLayer as (CircleMarker | Path) & { feature?: GeoJSON.Feature }; // 型ガード
      const feature = leafletLayer.feature;
      const index = feature?.properties && typeof feature.properties === 'object'
        ? Number((feature.properties as Record<string, unknown>).__feature_index)
        : Number.NaN;
      const row = Number.isFinite(index) ? rows[index] : undefined;
      const value = selectedColumn && row ? row[selectedColumn] : undefined;
      const color = computeColor(value);

      if (leafletLayer instanceof CircleMarker) {
        leafletLayer.setStyle({
          color,
          fillColor: color,
          fillOpacity,
          opacity: fillOpacity,
          weight: 1,
        });
        leafletLayer.setRadius(styleSettings.pointRadius);
      } else if (leafletLayer instanceof Path) {
        leafletLayer.setStyle({
          color,
          weight: styleSettings.lineWeight,
          fillColor: color,
          fillOpacity,
          opacity: fillOpacity,
        });
      }

      if (feature && leafletLayer.bindPopup) {
        const rowForPopup = row ?? {};
        const selectedValue = selectedColumn ? rowForPopup?.[selectedColumn] : undefined;
        const popupLines: string[] = [];
        if (selectedColumn) {
          popupLines.push(`<div><strong>${escapeHtml(selectedColumn)}</strong>: ${escapeHtml(selectedValue)}</div>`);
        }

        const additionalColumns = columns
          .filter((column) => column !== selectedColumn)
          .slice(0, 4);

        additionalColumns.forEach((column) => {
          popupLines.push(`<div>${escapeHtml(column)}: ${escapeHtml(rowForPopup?.[column])}</div>`);
        });

        leafletLayer.bindPopup(`<div class="text-sm space-y-1">${popupLines.join('')}</div>`);
      }
    });
  }, [columns, computeColor, rows, selectedColumn, styleSettings.fillOpacity, styleSettings.lineWeight, styleSettings.pointRadius]);

  const buildEnrichedFeatureCollection = useCallback((collection: FeatureCollection | null) => {
    if (!collection) {
      return null;
    }

    const features = collection.features.map((feature, index) => {
      const row = rows[index] ?? {};
      const sanitizedRow = { ...row };
      delete sanitizedRow.geometry;

      return {
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          __feature_index: index,
          ...sanitizedRow,
        },
      };
    });

    return {
      type: 'FeatureCollection',
      features,
    } as FeatureCollection;
  }, [rows]);

  useEffect(() => {
    const mapInstance = mapInstanceRef.current;
    if (!mapInstance) {
      return;
    }

    const enriched = buildEnrichedFeatureCollection(featureCollection);
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove();
      geoJsonLayerRef.current = null;
    }

    if (!enriched) {
      return;
    }

    const layer = L.geoJSON(enriched, {
      pointToLayer: (feature, latlng) => {
        const index = typeof feature.properties === 'object'
          ? Number((feature.properties as Record<string, unknown>).__feature_index)
          : Number.NaN;
        const row = Number.isFinite(index) ? rows[index] : undefined;
        const value = selectedColumn && row ? row[selectedColumn] : undefined;
        const color = computeColor(value);
        return L.circleMarker(latlng, {
          radius: styleSettings.pointRadius,
          color,
          fillColor: color,
          fillOpacity: clamp(styleSettings.fillOpacity / 100, 0, 1),
          opacity: clamp(styleSettings.fillOpacity / 100, 0, 1),
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
  }, [buildEnrichedFeatureCollection, computeColor, featureCollection, rows, selectedColumn, styleSettings.fillOpacity, styleSettings.pointRadius, updateGeoJsonLayerStyle]);

  useEffect(() => {
    updateGeoJsonLayerStyle();
  }, [updateGeoJsonLayerStyle]);

  useEffect(() => {
    setAiAnalysisResult(null);
    setAiAnalysisError(null);
  }, [analysisContext, selectedColumn, selectedFilePath]);

  const resolveGisResult = useCallback((path: string, result: GisParseResult) => {
    if (result.error) {
      setError(result.error);
      return;
    }

    setRows(result.rows);
    setFeatureCollection(result.featureCollection ?? null);

    const preferredColumns = getPreferredColumns(result.columns);
    updateColumnCache(path, preferredColumns);

    if (preferredColumns.length > 0) {
      const currentColumn = useGisAnalysisStore.getState().selectedColumn;
      if (!currentColumn || !preferredColumns.includes(currentColumn)) {
        setSelectedColumn(preferredColumns[0]);
      }
    } else {
      setSelectedColumn(null);
    }

    setError(null);
  }, [setSelectedColumn, updateColumnCache]);

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

    if (!entry && !tab) {
      setError('選択されたファイルを読み込めませんでした');
      return;
    }

    const fileType = entry?.type ?? (tab?.type as GisFileType | undefined);
    if (!fileType) {
      setError('このファイル形式はGIS分析に対応していません');
      return;
    }

    setLoading(true);

    try {
      switch (fileType) {
        case 'geojson': {
          let content = typeof tab?.content === 'string' ? tab.content : undefined;
          if (!content && entry?.fileHandle) {
            content = await readFileContent(entry.fileHandle);
          }
          if (!content) {
            throw new Error('GeoJSONの内容を取得できませんでした');
          }
          const result = parseGeoJsonContent(content);
          resolveGisResult(path, result);
          break;
        }
        case 'kml': {
          let content = typeof tab?.content === 'string' ? tab.content : undefined;
          if (!content && entry?.fileHandle) {
            content = await readFileContent(entry.fileHandle);
          }
          if (!content) {
            throw new Error('KMLの内容を取得できませんでした');
          }
          const result = await parseKmlContent(content);
          resolveGisResult(path, result);
          break;
        }
        case 'kmz': {
          const buffer = await loadArrayBufferFromHandle(tab?.file ?? entry?.fileHandle);
          if (!buffer) {
            throw new Error('KMZの内容を取得できませんでした');
          }
          const result = await parseKmzContent(buffer);
          resolveGisResult(path, result);
          break;
        }
        case 'shapefile': {
          const buffer = await loadArrayBufferFromHandle(tab?.file ?? entry?.fileHandle);
          if (!buffer) {
            throw new Error('シェープファイルの内容を取得できませんでした');
          }
          const result = await parseShapefileContent(buffer);
          resolveGisResult(path, result);
          break;
        }
        default:
          setError('このファイル形式には対応していません');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'ファイルの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [gisFileMap, resolveGisResult, tabs]);

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
    if (!selectedFilePath) {
      return;
    }
    loadGisFile(selectedFilePath).catch((err) => {
      console.error('Failed to load GIS file:', err);
    });
  }, [loadGisFile, selectedFilePath]);

  useEffect(() => {
    if (selectedFilePath) {
      return;
    }

    if (gisFileMap.has(tabId)) {
      setSelectedFile(tabId);
      return;
    }

    if (isGisTab(activeTab)) {
      setSelectedFile(activeTab.id);
    }
  }, [activeTab, gisFileMap, selectedFilePath, setSelectedFile, tabId]);

  const renderMapPlaceholder = () => {
    if (error) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="max-w-md rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-900/40 dark:text-red-200">
            <div className="font-medium">GISデータの読み込みに失敗しました</div>
            <div className="mt-1 whitespace-pre-line leading-relaxed">{error}</div>
          </div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          GISデータを解析しています…
        </div>
      );
    }

    if (!selectedFilePath) {
      return (
        <div className="flex h-full items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
          左サイドバーのGISファイルから表示したいデータを選択してください。
        </div>
      );
    }

    if (!featureCollection || featureCollection.features.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
          選択したファイルに表示可能な地物がありません。別のファイルまたはカラムを選択してください。
        </div>
      );
    }

    return null;
  };

  const isNumericColumn = Boolean(numericStats);

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-gray-900">
      <main className="relative flex flex-1">
        <div className="flex-1">
          <div ref={mapContainerRef} className="h-full w-full" />
          {renderMapPlaceholder()}
        </div>
      </main>

      <aside className="w-80 flex-shrink-0 border-l border-gray-200 bg-white/80 p-4 dark:border-gray-800 dark:bg-gray-900/60">
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
              value={styleSettings.color}
              onChange={(event) => setStyleSettings((prev) => ({ ...prev, color: event.target.value }))}
              className="mt-1 h-10 w-full cursor-pointer rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">明度</label>
            <input
              type="range"
              min={-50}
              max={50}
              value={styleSettings.brightness}
              onChange={(event) => setStyleSettings((prev) => ({ ...prev, brightness: Number(event.target.value) }))}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{styleSettings.brightness}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">透明度</label>
            <input
              type="range"
              min={10}
              max={100}
              value={styleSettings.fillOpacity}
              onChange={(event) => setStyleSettings((prev) => ({ ...prev, fillOpacity: Number(event.target.value) }))}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{styleSettings.fillOpacity}%</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">ポイント半径</label>
            <input
              type="range"
              min={2}
              max={20}
              value={styleSettings.pointRadius}
              onChange={(event) => setStyleSettings((prev) => ({ ...prev, pointRadius: Number(event.target.value) }))}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{styleSettings.pointRadius}px</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">ライン太さ</label>
            <input
              type="range"
              min={1}
              max={10}
              value={styleSettings.lineWeight}
              onChange={(event) => setStyleSettings((prev) => ({ ...prev, lineWeight: Number(event.target.value) }))}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{styleSettings.lineWeight}px</div>
          </div>

          <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={styleSettings.valueDriven && isNumericColumn}
                onChange={(event) => setStyleSettings((prev) => ({
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
              value={styleSettings.valueIntensity}
              onChange={(event) => setStyleSettings((prev) => ({ ...prev, valueIntensity: Number(event.target.value) }))}
              disabled={!styleSettings.valueDriven || !isNumericColumn}
              className="mt-2 w-full"
            />
            <div className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">
              {styleSettings.valueIntensity}%
            </div>
          </div>

          {numericStats && (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
              <div className="font-semibold">{selectedColumn} の統計</div>
              <div className="mt-2 flex flex-col gap-1">
                <div>最小値: {numericStats.min.toLocaleString()}</div>
                <div>最大値: {numericStats.max.toLocaleString()}</div>
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

