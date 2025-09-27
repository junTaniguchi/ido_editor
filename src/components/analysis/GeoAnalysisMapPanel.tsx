'use client';

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, ColumnLayer, ScatterplotLayer, PathLayer, GeoJsonLayer } from '@deck.gl/layers';
import { inferCoordinateColumns, buildGeoJsonFromRows } from '@/lib/dataAnalysisUtils';
import type { MapSettings, MapBasemap, MapBasemapOverlay, MapBasemapOverlayState } from '@/types';
import { IoInformationCircleOutline, IoOptionsOutline, IoCloseOutline } from 'react-icons/io5';

interface MapDataSource {
  id: string;
  label: string;
  rows: any[];
  columns: string[];
  description?: string;
}

interface GeoAnalysisMapPanelProps {
  dataSources: MapDataSource[];
  mapSettings: MapSettings;
  onUpdateSettings: (settings: Partial<MapSettings>) => void;
  noDataMessage?: string;
  noCoordinateMessage?: string;
  settingsContainer?: HTMLElement | null;
  settingsPlacement?: 'inline' | 'external';
}

const BASEMAPS: Record<MapBasemap, {
  label: string;
  urlTemplates: string[];
  attribution: string;
  defaultPitch?: number;
  defaultBearing?: number;
  allowTilt?: boolean;
}> = {
  'osm-standard': {
    label: 'OpenStreetMap 標準',
    urlTemplates: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    attribution: '© OpenStreetMap contributors',
    defaultPitch: 0,
    defaultBearing: 0,
    allowTilt: false,
  },
  'osm-humanitarian': {
    label: 'OpenStreetMap Humanitarian',
    urlTemplates: [
      'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    ],
    attribution: '© OpenStreetMap contributors, Humanitarian style',
    defaultPitch: 0,
    defaultBearing: 0,
    allowTilt: false,
  },
  'osm-germany': {
    label: 'OpenStreetMap ドイツ',
    urlTemplates: [
      'https://a.tile.openstreetmap.de/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.de/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.de/{z}/{x}/{y}.png',
    ],
    attribution: '© OpenStreetMap contributors, German style',
    defaultPitch: 0,
    defaultBearing: 0,
    allowTilt: false,
  },
  'osm-standard-oblique': {
    label: 'OpenStreetMap 立体ビュー',
    urlTemplates: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    attribution: '© OpenStreetMap contributors',
    defaultPitch: 45,
    defaultBearing: -30,
    allowTilt: true,
  },
};

const DEFAULT_BASEMAP_OVERLAYS: MapBasemapOverlayState = {
  roads: true,
  railways: false,
  terrain: false,
};

const BASEMAP_OVERLAYS: Record<MapBasemapOverlay, {
  label: string;
  description: string;
  urlTemplates: string[];
  attribution: string;
  opacity?: number;
  minZoom?: number;
  maxZoom?: number;
}> = {
  roads: {
    label: '道路',
    description: 'CyclOSMスタイルの道路ハイライトを重ねて主要道路を見やすくします。',
    urlTemplates: [
      'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    ],
    attribution: '© OpenStreetMap contributors, CyclOSM.',
    opacity: 0.55,
  },
  railways: {
    label: '鉄道',
    description: 'OpenRailwayMapの鉄道路線を重ねて表示します。',
    urlTemplates: [
      'https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
      'https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
      'https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
    ],
    attribution: '© OpenRailwayMap contributors (OpenStreetMap data)',
    opacity: 0.9,
  },
  terrain: {
    label: '起伏',
    description: 'OpenTopoMapのヒルシェード（陰影起伏）タイルを重ねます。',
    urlTemplates: [
      'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
      'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
    ],
    attribution: 'Map tiles by OpenTopoMap (CC-BY-SA). Data by © OpenStreetMap contributors.',
    opacity: 0.6,
    maxZoom: 17,
  },
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 19;

const DEFAULT_VIEW_STATE = {
  longitude: 139.767,
  latitude: 35.681,
  zoom: 3,
  pitch: 0,
  bearing: 0,
};

const createBitmapTileLayer = (
  id: string,
  urlTemplates: string[],
  options: { opacity?: number; minZoom?: number; maxZoom?: number } = {},
) => new TileLayer({
  id,
  data: urlTemplates,
  minZoom: options.minZoom ?? MIN_ZOOM,
  maxZoom: options.maxZoom ?? MAX_ZOOM,
  tileSize: 256,
  opacity: options.opacity ?? 1,
  renderSubLayers: (props) => {
    const {
      tile,
      data,
      visible,
      opacity,
    } = props;
    if (!data) {
      return null;
    }
    const {
      west,
      south,
      east,
      north,
    } = tile.bbox;
    return new BitmapLayer(props, {
      id: `${props.id}-bitmap`,
      data: null,
      image: data,
      bounds: [west, south, east, north],
      visible,
      opacity,
    });
  },
});

const COLOR_PALETTE: [number, number, number][] = [
  [59, 130, 246],
  [249, 115, 22],
  [16, 185, 129],
  [234, 179, 8],
  [14, 165, 233],
  [244, 114, 182],
  [167, 139, 250],
  [251, 191, 36],
  [34, 197, 94],
  [248, 113, 113],
];

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return hash;
};

const toCssColor = (color: [number, number, number]) => `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

const GeoAnalysisMapPanel: React.FC<GeoAnalysisMapPanelProps> = ({
  dataSources,
  mapSettings,
  onUpdateSettings,
  noDataMessage,
  noCoordinateMessage,
  settingsContainer,
  settingsPlacement = 'inline',
}) => {
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);
  const [isOptionalSidebarOpen, setIsOptionalSidebarOpen] = useState(true);

  useEffect(() => {
    if (!dataSources.length) {
      return;
    }
    if (!dataSources.some((source) => source.id === mapSettings.dataSource)) {
      onUpdateSettings({ dataSource: dataSources[0].id });
    }
  }, [dataSources, mapSettings.dataSource, onUpdateSettings]);

  const activeSource = useMemo(() => {
    if (!dataSources.length) return undefined;
    const matched = dataSources.find((source) => source.id === mapSettings.dataSource);
    return matched ?? dataSources[0];
  }, [dataSources, mapSettings.dataSource]);

  const coordinateInference = useMemo(() => {
    if (!activeSource) return null;
    return inferCoordinateColumns(activeSource.columns);
  }, [activeSource]);

  useEffect(() => {
    if (!activeSource || !coordinateInference) return;
    const updates: Partial<MapSettings> = {};

    const ensureColumn = (
      key: 'latitudeColumn' | 'longitudeColumn' | 'geoJsonColumn' | 'wktColumn' | 'pathColumn' | 'polygonColumn',
      candidate?: string,
      candidatesList: string[] = [],
    ) => {
      const current = mapSettings[key];
      if (current && activeSource.columns.includes(current)) {
        return;
      }
      if (candidate && activeSource.columns.includes(candidate)) {
        updates[key] = candidate as any;
        return;
      }
      const fallback = candidatesList.find((column) => activeSource.columns.includes(column));
      if (fallback) {
        updates[key] = fallback as any;
        return;
      }
      if (current && !activeSource.columns.includes(current)) {
        updates[key] = undefined as any;
      }
    };

    ensureColumn('latitudeColumn', coordinateInference.suggestedLatitude, coordinateInference.latitudeCandidates);
    ensureColumn('longitudeColumn', coordinateInference.suggestedLongitude, coordinateInference.longitudeCandidates);
    ensureColumn('geoJsonColumn', coordinateInference.geoJsonColumns[0], coordinateInference.geoJsonColumns);
    ensureColumn('wktColumn', coordinateInference.wktColumns[0], coordinateInference.wktColumns);
    ensureColumn('pathColumn', coordinateInference.pathColumns[0], coordinateInference.pathColumns);
    ensureColumn('polygonColumn', coordinateInference.polygonColumns[0], coordinateInference.polygonColumns);

    const optionalUpdates: Partial<MapSettings> = {};
    (['categoryColumn', 'colorColumn', 'heightColumn'] as const).forEach((key) => {
      const value = mapSettings[key];
      if (value && !activeSource.columns.includes(value)) {
        optionalUpdates[key] = undefined;
      }
    });

    const merged = { ...updates, ...optionalUpdates };
    if (Object.keys(merged).length > 0) {
      onUpdateSettings(merged);
    }
  }, [activeSource, coordinateInference, mapSettings, onUpdateSettings]);

  const validLatitudeColumn = activeSource && mapSettings.latitudeColumn && activeSource.columns.includes(mapSettings.latitudeColumn)
    ? mapSettings.latitudeColumn
    : undefined;
  const validLongitudeColumn = activeSource && mapSettings.longitudeColumn && activeSource.columns.includes(mapSettings.longitudeColumn)
    ? mapSettings.longitudeColumn
    : undefined;
  const validGeoJsonColumn = activeSource && mapSettings.geoJsonColumn && activeSource.columns.includes(mapSettings.geoJsonColumn)
    ? mapSettings.geoJsonColumn
    : undefined;
  const validWktColumn = activeSource && mapSettings.wktColumn && activeSource.columns.includes(mapSettings.wktColumn)
    ? mapSettings.wktColumn
    : undefined;
  const validPathColumn = activeSource && mapSettings.pathColumn && activeSource.columns.includes(mapSettings.pathColumn)
    ? mapSettings.pathColumn
    : undefined;
  const validPolygonColumn = activeSource && mapSettings.polygonColumn && activeSource.columns.includes(mapSettings.polygonColumn)
    ? mapSettings.polygonColumn
    : undefined;
  const validCategoryColumn = activeSource && mapSettings.categoryColumn && activeSource.columns.includes(mapSettings.categoryColumn)
    ? mapSettings.categoryColumn
    : undefined;
  const validColorColumn = activeSource && mapSettings.colorColumn && activeSource.columns.includes(mapSettings.colorColumn)
    ? mapSettings.colorColumn
    : undefined;
  const validHeightColumn = activeSource && mapSettings.heightColumn && activeSource.columns.includes(mapSettings.heightColumn)
    ? mapSettings.heightColumn
    : undefined;

  const geoData = useMemo(() => {
    if (!activeSource) return null;
    return buildGeoJsonFromRows(activeSource.rows, {
      latitudeColumn: validLatitudeColumn,
      longitudeColumn: validLongitudeColumn,
      geoJsonColumn: validGeoJsonColumn,
      wktColumn: validWktColumn,
      pathColumn: validPathColumn,
      polygonColumn: validPolygonColumn,
      categoryColumn: validCategoryColumn,
      colorColumn: validColorColumn,
      heightColumn: validHeightColumn,
      aggregation: mapSettings.aggregation,
    });
  }, [activeSource, mapSettings.aggregation, validCategoryColumn, validColorColumn, validGeoJsonColumn, validHeightColumn, validLatitudeColumn, validLongitudeColumn, validPathColumn, validPolygonColumn, validWktColumn]);

  const categoryColorMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    if (!geoData) return map;
    (geoData.categories || []).forEach((category, index) => {
      const paletteIndex = index % COLOR_PALETTE.length;
      map.set(category, COLOR_PALETTE[paletteIndex]);
    });
    return map;
  }, [geoData]);

  const getColorForValue = useCallback((value: any) => {
    if (value === null || value === undefined) {
      return COLOR_PALETTE[0];
    }
    const key = String(value);
    if (categoryColorMap.has(key)) {
      return categoryColorMap.get(key)!;
    }
    const index = Math.abs(hashString(key)) % COLOR_PALETTE.length;
    return COLOR_PALETTE[index];
  }, [categoryColorMap]);

  useEffect(() => {
    if (!mapSettings.basemapOverlays) {
      onUpdateSettings({ basemapOverlays: { ...DEFAULT_BASEMAP_OVERLAYS } });
    }
  }, [mapSettings.basemapOverlays, onUpdateSettings]);

  const overlaySettings: MapBasemapOverlayState = mapSettings.basemapOverlays ?? DEFAULT_BASEMAP_OVERLAYS;

  const selectedBasemap = BASEMAPS[mapSettings.basemap] ?? BASEMAPS['osm-standard'];
  const allowTilt = selectedBasemap.allowTilt ?? false;
  const defaultPitch = selectedBasemap.defaultPitch ?? 0;
  const defaultBearing = selectedBasemap.defaultBearing ?? 0;

  const tileLayer = useMemo(() => {
    return createBitmapTileLayer(`osm-tile-layer-${mapSettings.basemap}`, selectedBasemap.urlTemplates);
  }, [mapSettings.basemap, selectedBasemap]);

  const overlayLayers = useMemo(() => {
    const entries = Object.entries(BASEMAP_OVERLAYS) as [MapBasemapOverlay, (typeof BASEMAP_OVERLAYS)[MapBasemapOverlay]][];
    return entries
      .filter(([key]) => overlaySettings[key])
      .map(([key, overlay]) => createBitmapTileLayer(
        `osm-overlay-${key}`,
        overlay.urlTemplates,
        {
          opacity: overlay.opacity,
          minZoom: overlay.minZoom,
          maxZoom: overlay.maxZoom,
        },
      ));
  }, [overlaySettings.roads, overlaySettings.railways, overlaySettings.terrain]);

  const scatterLayer = useMemo(() => {
    if (!geoData || !geoData.points.length) return null;
    return new ScatterplotLayer({
      id: 'geo-points',
      data: geoData.points,
      pickable: true,
      radiusUnits: 'pixels',
      radiusMinPixels: Math.max(2, mapSettings.pointRadius - 2),
      radiusMaxPixels: mapSettings.pointRadius + 6,
      getRadius: () => mapSettings.pointRadius,
      getPosition: (d: any) => d.position,
      getFillColor: (d: any) => {
        const color = getColorForValue(d.colorValue ?? d.category);
        return [...color, 200];
      },
      getLineColor: [255, 255, 255, 200],
      lineWidthMinPixels: 1,
    });
  }, [geoData, getColorForValue, mapSettings.pointRadius]);

  const columnLayer = useMemo(() => {
    if (!geoData || !geoData.columns.length) return null;
    return new ColumnLayer({
      id: 'geo-columns',
      data: geoData.columns,
      pickable: true,
      diskResolution: 12,
      radius: mapSettings.columnRadius,
      extruded: true,
      elevationScale: mapSettings.elevationScale,
      getPosition: (d: any) => d.position,
      getElevation: (d: any) => d.elevation,
      getFillColor: (d: any) => {
        const color = getColorForValue(d.colorValue ?? d.category);
        return [...color, 220];
      },
      getLineColor: [255, 255, 255, 180],
    });
  }, [geoData, getColorForValue, mapSettings.columnRadius, mapSettings.elevationScale]);

  const pathLayer = useMemo(() => {
    if (!geoData || !geoData.paths.length) return null;
    return new PathLayer({
      id: 'geo-paths',
      data: geoData.paths,
      pickable: true,
      widthScale: 2,
      widthMinPixels: 2,
      getPath: (d: any) => d.path,
      getColor: (d: any) => {
        const color = getColorForValue(d.properties?.colorValue ?? d.properties?.categoryValue);
        return [...color, 200];
      },
    });
  }, [geoData, getColorForValue]);

  const geoJsonLayer = useMemo(() => {
    if (!geoData || !geoData.geoJsonFeatures.length) return null;
    return new GeoJsonLayer({
      id: 'geojson-layer',
      data: {
        type: 'FeatureCollection',
        features: geoData.geoJsonFeatures,
      },
      pickable: true,
      stroked: true,
      filled: true,
      extruded: Boolean(validHeightColumn),
      getElevation: (feature: any) => {
        const metric = feature.properties?.metricValue;
        return typeof metric === 'number' ? metric : 0;
      },
      elevationScale: mapSettings.elevationScale,
      getLineColor: (feature: any) => {
        const color = getColorForValue(feature.properties?.colorValue ?? feature.properties?.categoryValue);
        return [...color, 220];
      },
      getFillColor: (feature: any) => {
        const color = getColorForValue(feature.properties?.colorValue ?? feature.properties?.categoryValue);
        return [...color, 100];
      },
    });
  }, [geoData, getColorForValue, mapSettings.elevationScale, validHeightColumn]);

  const layers = useMemo(() => {
    const list = [tileLayer, ...overlayLayers];
    if (columnLayer) list.push(columnLayer);
    if (scatterLayer) list.push(scatterLayer);
    if (pathLayer) list.push(pathLayer);
    if (geoJsonLayer) list.push(geoJsonLayer);
    return list;
  }, [tileLayer, overlayLayers, columnLayer, scatterLayer, pathLayer, geoJsonLayer]);

  const computedViewState = useMemo(() => {
    const baseState = {
      ...DEFAULT_VIEW_STATE,
      pitch: defaultPitch,
      bearing: defaultBearing,
    };
    if (geoData?.bounds) {
      const [[minLon, minLat], [maxLon, maxLat]] = geoData.bounds;
      const latitude = (minLat + maxLat) / 2;
      const longitude = (minLon + maxLon) / 2;
      const latDiff = Math.max(Math.abs(maxLat - minLat), 0.0001);
      const lonDiff = Math.max(Math.abs(maxLon - minLon), 0.0001);
      const estimatedZoom = 8 - Math.log2(Math.max(latDiff, lonDiff));
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, estimatedZoom));
      return {
        ...baseState,
        latitude,
        longitude,
        zoom,
      };
    }
    return baseState;
  }, [defaultBearing, defaultPitch, geoData?.bounds]);

  useEffect(() => {
    setViewState((prev) => {
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, computedViewState.zoom ?? DEFAULT_VIEW_STATE.zoom),
      );
      return {
        ...prev,
        ...computedViewState,
        zoom: nextZoom,
        pitch: allowTilt ? (computedViewState.pitch ?? defaultPitch) : defaultPitch,
        bearing: allowTilt ? (computedViewState.bearing ?? defaultBearing) : defaultBearing,
      };
    });
  }, [allowTilt, computedViewState, defaultBearing, defaultPitch]);

  const hasGeometrySelection = Boolean(
    (validLatitudeColumn && validLongitudeColumn)
    || validGeoJsonColumn
    || validWktColumn
    || validPathColumn
    || validPolygonColumn,
  );

  const hasRenderableData = Boolean(
    geoData && (
      geoData.points.length
      || geoData.columns.length
      || geoData.paths.length
      || geoData.polygons.length
      || geoData.geoJsonFeatures.length
    ),
  );

  const tooltipFormatter = useCallback(({ object }: { object: any }) => {
    if (!object) return null;
    const properties = object.properties ?? object;
    const category = properties?.categoryValue ?? properties?.category;
    const metric = properties?.metricValue ?? properties?.elevation;
    const position = object.position || properties?.position;
    const lines: string[] = [];
    if (category !== undefined) {
      lines.push(`カテゴリ: ${String(category)}`);
    }
    if (metric !== undefined && metric !== null && !Number.isNaN(Number(metric))) {
      lines.push(`値: ${Number(metric).toLocaleString()}`);
    }
    if (Array.isArray(position)) {
      const [lon, lat] = position;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        lines.push(`座標: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      }
    }
    return { text: lines.length ? lines.join('\n') : '地物' };
  }, []);

  const activeColumns = activeSource?.columns ?? [];

  const handleZoom = useCallback((delta: number) => {
    setViewState((prev) => {
      const currentZoom = Number.isFinite(prev.zoom)
        ? prev.zoom
        : (computedViewState.zoom ?? DEFAULT_VIEW_STATE.zoom);
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom + delta));
      return {
        ...prev,
        zoom: nextZoom,
        pitch: allowTilt ? (prev.pitch ?? defaultPitch) : defaultPitch,
        bearing: allowTilt ? (prev.bearing ?? defaultBearing) : defaultBearing,
      };
    });
  }, [allowTilt, computedViewState.zoom, defaultBearing, defaultPitch]);

  const controllerSettings = useMemo(() => ({
    dragRotate: allowTilt,
    touchRotate: allowTilt,
    minPitch: 0,
    maxPitch: allowTilt ? 60 : 0,
  }), [allowTilt]);

  const handleViewStateChange = useCallback(({ viewState: next }: { viewState: any }) => {
    setViewState((prev) => {
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, (next?.zoom ?? prev.zoom ?? DEFAULT_VIEW_STATE.zoom)),
      );
      const normalizedBearing = allowTilt
        ? (Number.isFinite(next?.bearing)
          ? ((next.bearing % 360) + 360) % 360
          : (prev.bearing ?? defaultBearing))
        : defaultBearing;
      const nextPitch = allowTilt
        ? Math.min(60, Math.max(0, next?.pitch ?? prev.pitch ?? defaultPitch))
        : defaultPitch;
      return {
        ...prev,
        ...next,
        zoom: nextZoom,
        pitch: nextPitch,
        bearing: normalizedBearing,
      };
    });
  }, [allowTilt, defaultBearing, defaultPitch]);

  const settingsContent = (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">必須設定</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            緯度と経度の組み合わせ、または GeoJSON / WKT / ライン / ポリゴン列のいずれかを指定してください。
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            <span>緯度列</span>
            <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
              北緯（lat）の値を含む列を指定します。散布図や柱状グラフのY座標として利用されます。
            </span>
            <select
              value={validLatitudeColumn ?? ''}
              onChange={(event) => onUpdateSettings({ latitudeColumn: event.target.value || undefined })}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              disabled={!activeSource}
            >
              <option value="">未選択</option>
              {activeColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            <span>経度列</span>
            <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
              東経（lon）の値を含む列を指定します。散布図や柱状グラフのX座標として利用されます。
            </span>
            <select
              value={validLongitudeColumn ?? ''}
              onChange={(event) => onUpdateSettings({ longitudeColumn: event.target.value || undefined })}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              disabled={!activeSource}
            >
              <option value="">未選択</option>
              {activeColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            <span>GeoJSON列</span>
            <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
              GeoJSONのFeature / FeatureCollection / Geometryオブジェクトを含む列を指定すると、そのままラインやポリゴンを描画できます。
            </span>
            <select
              value={validGeoJsonColumn ?? ''}
              onChange={(event) => onUpdateSettings({ geoJsonColumn: event.target.value || undefined })}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              disabled={!activeSource}
            >
              <option value="">未選択</option>
              {activeColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            <span>WKT列</span>
            <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
              POINT / LINESTRING / POLYGON などのWell-Known Text形式を含む列を選ぶと、文字列から地物を生成して表示します。
            </span>
            <select
              value={validWktColumn ?? ''}
              onChange={(event) => onUpdateSettings({ wktColumn: event.target.value || undefined })}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              disabled={!activeSource}
            >
              <option value="">未選択</option>
              {activeColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            <span>ライン列</span>
            <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
              経度・緯度のペア配列（例: [[lon, lat], ...] や "lon lat; ..."）を持つ列を指定すると、PathLayerでルートを描画します。
            </span>
            <select
              value={validPathColumn ?? ''}
              onChange={(event) => onUpdateSettings({ pathColumn: event.target.value || undefined })}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              disabled={!activeSource}
            >
              <option value="">未選択</option>
              {activeColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            <span>ポリゴン列</span>
            <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
              経度・緯度のリング配列（例: [[[lon, lat], ...]]]）を含む列を指定すると、面データを塗りつぶして表示します。
            </span>
            <select
              value={validPolygonColumn ?? ''}
              onChange={(event) => onUpdateSettings({ polygonColumn: event.target.value || undefined })}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              disabled={!activeSource}
            >
              <option value="">未選択</option>
              {activeColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!hasGeometrySelection && (
        <div className="flex items-center gap-2 rounded border border-dashed border-yellow-400 bg-yellow-50 p-3 text-xs text-yellow-700 dark:border-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-200">
          <IoInformationCircleOutline size={16} />
          <span>
            {noCoordinateMessage ?? '設定パネルで緯度・経度またはGeoJSON / WKT 列を選択するとマップが描画されます。'}
          </span>
        </div>
      )}
    </div>
  );

  const optionalSettingsContent = (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">任意設定</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          色分けや棒グラフの高さ、ベースマップなど表示スタイルを調整できます。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>カテゴリ列</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            選択するとカテゴリごとに凡例が作成され、点やカラムをグループ別に色分けできます。
          </span>
          <select
            value={validCategoryColumn ?? ''}
            onChange={(event) => onUpdateSettings({ categoryColumn: event.target.value || undefined })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            disabled={!activeSource}
          >
            <option value="">未選択</option>
            {activeColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>色分け列</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            数値やカテゴリ値を基に自動配色します。カテゴリ列と別の値で色分けしたいときに指定してください。
          </span>
          <select
            value={validColorColumn ?? ''}
            onChange={(event) => onUpdateSettings({ colorColumn: event.target.value || undefined })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            disabled={!activeSource}
          >
            <option value="">未選択</option>
            {activeColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>高さ列</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            ColumnLayerで棒グラフを表示するときの高さに使う指標列を指定します。集計方法と組み合わせて集計値を立体化できます。
          </span>
          <select
            value={validHeightColumn ?? ''}
            onChange={(event) => onUpdateSettings({ heightColumn: event.target.value || undefined })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            disabled={!activeSource}
          >
            <option value="">未選択</option>
            {activeColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>集計方法</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            同一座標に複数行がある場合に高さ列の値をどのように集約するかを指定します。ツールチップや棒グラフの高さに反映されます。
          </span>
          <select
            value={mapSettings.aggregation}
            onChange={(event) => onUpdateSettings({ aggregation: event.target.value as MapSettings['aggregation'] })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="sum">合計</option>
            <option value="avg">平均</option>
            <option value="count">件数</option>
            <option value="min">最小</option>
            <option value="max">最大</option>
            <option value="none">値をそのまま使用</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>点サイズ (px)</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            ScatterplotLayerの点の大きさをピクセル単位で調整します。視認性に応じてサイズを変更してください。
          </span>
          <input
            type="number"
            min={1}
            value={mapSettings.pointRadius}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) {
                onUpdateSettings({ pointRadius: Math.max(1, value) });
              }
            }}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>カラム半径 (m)</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            ColumnLayerで描画する円柱の半径をメートル単位で指定します。値を大きくすると棒グラフの太さが増します。
          </span>
          <input
            type="number"
            min={10}
            value={mapSettings.columnRadius}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) {
                onUpdateSettings({ columnRadius: Math.max(10, value) });
              }
            }}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>高さスケール</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            棒グラフの高さを掛け算で拡大・縮小します。値が大きいほど柱が高く表示されます。
          </span>
          <input
            type="number"
            min={1}
            value={mapSettings.elevationScale}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) {
                onUpdateSettings({ elevationScale: Math.max(1, value) });
              }
            }}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>ベースマップ</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            標準タイルは真上から、立体ビューを選ぶとピッチ45°の斜め視点と回転操作が有効になります。
          </span>
          <select
            value={mapSettings.basemap}
            onChange={(event) => onUpdateSettings({ basemap: event.target.value as MapBasemap })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {Object.entries(BASEMAPS).map(([value, option]) => (
              <option key={value} value={value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="col-span-3 rounded border border-gray-200 bg-white p-3 text-xs text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <div className="font-medium">OpenStreetMap オーバーレイ</div>
          <div className="mt-1 text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            道路・鉄道・起伏のタイルレイヤーを個別にON/OFFできます。見たい情報に合わせて切り替えてください。
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {(Object.entries(BASEMAP_OVERLAYS) as [MapBasemapOverlay, typeof BASEMAP_OVERLAYS[MapBasemapOverlay]][]).map(([key, overlay]) => (
              <label key={key} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1 font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                  checked={Boolean(overlaySettings[key])}
                  onChange={(event) => {
                    const nextValue = event.target.checked;
                    onUpdateSettings({
                      basemapOverlays: {
                        ...overlaySettings,
                        [key]: nextValue,
                      },
                    });
                  }}
                />
                <span className="flex flex-col">
                  <span>{overlay.label}</span>
                  <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">{overlay.description}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
            提供元: {Object.values(BASEMAP_OVERLAYS).map((overlay) => overlay.attribution).join(' / ')}
          </div>
        </div>
      </div>
    </div>
  );

  if (!dataSources.length) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
        {noDataMessage ?? '表示できるデータセットがありません。'}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {settingsPlacement === 'inline' && (
        <div className="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {settingsContent}
          </div>
        </div>
      )}
      {settingsPlacement === 'external' && settingsContainer
        && createPortal(<div className="space-y-4">{settingsContent}</div>, settingsContainer)}
      <div className="relative flex-1 bg-gray-200 dark:bg-gray-900">
        <DeckGL
          controller={controllerSettings}
          layers={layers}
          initialViewState={computedViewState}
          viewState={viewState}
          onViewStateChange={handleViewStateChange}
          getTooltip={tooltipFormatter}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-start">
          {isOptionalSidebarOpen ? (
            <div className="pointer-events-auto flex h-full max-h-full w-80 max-w-[90vw] flex-col border-r border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <IoOptionsOutline size={16} />
                  詳細設定
                </div>
                <button
                  type="button"
                  onClick={() => setIsOptionalSidebarOpen(false)}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  aria-label="詳細設定を閉じる"
                >
                  <IoCloseOutline size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-4">
                {optionalSettingsContent}
              </div>
            </div>
          ) : (
            <div className="pointer-events-auto p-3">
              <button
                type="button"
                onClick={() => setIsOptionalSidebarOpen(true)}
                className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <IoOptionsOutline size={16} />
                詳細設定を開く
              </button>
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute right-4 top-4 flex flex-col gap-3">
          <div className="pointer-events-auto overflow-hidden rounded-md bg-white text-gray-700 shadow dark:bg-gray-800 dark:text-gray-100">
            <button
              type="button"
              className="block px-3 py-2 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => handleZoom(0.75)}
              aria-label="ズームイン"
            >
              ＋
            </button>
            <div className="h-px bg-gray-200 dark:bg-gray-700" />
            <button
              type="button"
              className="block px-3 py-2 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => handleZoom(-0.75)}
              aria-label="ズームアウト"
            >
              −
            </button>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-gray-600 dark:text-gray-300">
          <span className="rounded bg-white/80 px-2 py-1 shadow dark:bg-gray-900/70">
            {selectedBasemap.attribution}
          </span>
        </div>
        {geoData && geoData.categories.length > 0 && (
          <div className="pointer-events-none absolute bottom-3 right-3 flex max-w-[50vw] flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
            {geoData.categories.map((category) => {
              const color = getColorForValue(category);
              return (
                <span
                  key={category}
                  className="pointer-events-auto flex items-center gap-2 rounded bg-white/80 px-2 py-1 shadow dark:bg-gray-900/70"
                >
                  <span className="h-3 w-3 rounded" style={{ backgroundColor: toCssColor(color) }} />
                  {category}
                </span>
              );
            })}
          </div>
        )}
        {!hasRenderableData && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-600 dark:text-gray-300">
            {hasGeometrySelection
              ? '選択された列に基づくジオメトリが見つかりませんでした。データ値を確認してください。'
              : (noCoordinateMessage ?? '設定パネルで緯度・経度またはGeoJSON / WKT 列を選択するとマップが描画されます。')}
          </div>
        )}
      </div>
    </div>
  );
};

export default GeoAnalysisMapPanel;
