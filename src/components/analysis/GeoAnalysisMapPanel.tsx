'use client';

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, ColumnLayer, ScatterplotLayer, PathLayer, GeoJsonLayer } from '@deck.gl/layers';
import { load } from '@loaders.gl/core';
import { ImageLoader } from '@loaders.gl/images';
import { inferCoordinateColumns, buildGeoJsonFromRows } from '@/lib/dataAnalysisUtils';
import type { MapSettings, MapBasemap, MapBasemapOverlay, MapBasemapOverlayState, MapLayerSettings } from '@/types';
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

const OPTIONAL_SIDEBAR_WIDTH_PX = 320;

const DEFAULT_VIEW_STATE = {
  longitude: 139.767,
  latitude: 35.681,
  zoom: 3,
  pitch: 0,
  bearing: 0,
};

const buildTileUrl = (template: string, x: number, y: number, z: number) => template
  .replace('{x}', String(x))
  .replace('{y}', String(y))
  .replace('{z}', String(z));

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
  getTileData: async ({ x, y, z, signal }: { x: number; y: number; z: number; signal?: AbortSignal }) => {
    if (!urlTemplates.length) {
      return null;
    }

    const templateIndex = ((Math.abs(x) + y + z) % urlTemplates.length + urlTemplates.length) % urlTemplates.length;
    const url = buildTileUrl(urlTemplates[templateIndex], x, y, z);

    try {
      const loadedImage = await load(url, ImageLoader, {
        fetch: {
          signal,
          mode: 'cors',
          credentials: 'omit',
        },
        image: {
          type: 'imagebitmap',
          decode: true,
        },
      });

      if (loadedImage) {
        return loadedImage as ImageBitmap | ImageData | HTMLImageElement;
      }
    } catch (error) {
      const err = error as Error;
      if (err?.name === 'AbortError') {
        return null;
      }
      // 失敗した場合はフォールバックのフェッチに切り替え
    }

    try {
      const response = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
      if (!response.ok) {
        throw new Error(`Failed to fetch tile: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();

      if (typeof window !== 'undefined' && 'createImageBitmap' in window && typeof window.createImageBitmap === 'function') {
        try {
          return await window.createImageBitmap(blob);
        } catch {
          // フォールバックとして HTMLImageElement を生成
        }
      }

      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(blob);
        const image = new Image();
        image.crossOrigin = 'anonymous';

        const cleanup = () => {
          URL.revokeObjectURL(objectUrl);
          image.removeEventListener('load', handleLoad);
          image.removeEventListener('error', handleError);
          signal?.removeEventListener('abort', handleAbort);
        };

        const handleLoad = () => {
          cleanup();
          resolve(image);
        };

        const handleError = () => {
          cleanup();
          reject(new Error(`Failed to load tile image: ${url}`));
        };

        const handleAbort = () => {
          cleanup();
          const abortError = new Error('Tile fetch aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        };

        if (signal?.aborted) {
          handleAbort();
          return;
        }

        image.addEventListener('load', handleLoad);
        image.addEventListener('error', handleError);
        if (signal) {
          signal.addEventListener('abort', handleAbort);
        }

        image.decoding = 'async';
        image.src = objectUrl;
      });
    } catch (error) {
      const err = error as Error;
      if (err?.name === 'AbortError') {
        return null;
      }
      throw error;
    }
  },
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
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  const overlaySettings: MapBasemapOverlayState = mapSettings.basemapOverlays ?? DEFAULT_BASEMAP_OVERLAYS;
  const availableSourceMap = useMemo(() => new Map(dataSources.map((source) => [source.id, source])), [dataSources]);

  useEffect(() => {
    if (!dataSources.length) {
      if ((mapSettings.activeDataSourceIds ?? []).length > 0) {
        onUpdateSettings({ activeDataSourceIds: [] });
      }
      return;
    }

    const availableIds = dataSources.map((source) => source.id);
    const existing = mapSettings.activeDataSourceIds ?? [];
    const deduped = existing.filter((id, index) => existing.indexOf(id) === index);
    const filtered = deduped.filter((id) => availableIds.includes(id));
    let nextIds = filtered;

    if (!nextIds.length) {
      if (mapSettings.dataSource && availableIds.includes(mapSettings.dataSource)) {
        nextIds = [mapSettings.dataSource];
      } else {
        nextIds = [availableIds[0]];
      }
    }

    const previous = mapSettings.activeDataSourceIds ?? [];
    const isSameLength = nextIds.length === previous.length;
    const isSameOrder = isSameLength && nextIds.every((id, index) => id === previous[index]);

    if (!isSameOrder) {
      onUpdateSettings({ activeDataSourceIds: nextIds });
    }
  }, [dataSources, mapSettings.activeDataSourceIds, mapSettings.dataSource, onUpdateSettings]);

  const activeLayerIds = useMemo(() => {
    const ids = mapSettings.activeDataSourceIds ?? [];
    return ids.filter((id, index) => ids.indexOf(id) === index && availableSourceMap.has(id));
  }, [mapSettings.activeDataSourceIds, availableSourceMap]);

  useEffect(() => {
    const currentLayerSettings = mapSettings.layerSettings ?? {};
    const nextLayerSettings: Record<string, MapLayerSettings> = { ...currentLayerSettings };
    let changed = false;

    Object.keys(nextLayerSettings).forEach((layerId) => {
      if (!availableSourceMap.has(layerId)) {
        delete nextLayerSettings[layerId];
        changed = true;
      }
    });

    activeLayerIds.forEach((layerId) => {
      if (!nextLayerSettings[layerId]) {
        nextLayerSettings[layerId] = {};
        changed = true;
      }
    });

    if (changed) {
      onUpdateSettings({ layerSettings: nextLayerSettings });
    }
  }, [activeLayerIds, availableSourceMap, mapSettings.layerSettings, onUpdateSettings]);

  const activeLayers = useMemo(
    () => activeLayerIds
      .map((id) => {
        const source = availableSourceMap.get(id);
        if (!source) return null;
        return { id, source };
      })
      .filter((value): value is { id: string; source: MapDataSource } => Boolean(value)),
    [activeLayerIds, availableSourceMap],
  );

  useEffect(() => {
    if (!activeLayers.length) return;

    const currentLayerSettings = mapSettings.layerSettings ?? {};
    const nextLayerSettings: Record<string, MapLayerSettings> = { ...currentLayerSettings };
    let changed = false;

    activeLayers.forEach(({ id, source }) => {
      const inference = inferCoordinateColumns(source.columns);
      const previous = nextLayerSettings[id] ?? {};
      const updated: MapLayerSettings = { ...previous };
      let layerChanged = false;

      const ensureColumn = (
        key: keyof MapLayerSettings,
        candidate?: string,
        candidatesList: string[] = [],
      ) => {
        const current = updated[key];
        if (current && source.columns.includes(current)) {
          return;
        }
        if (candidate && source.columns.includes(candidate)) {
          if (current !== candidate) {
            updated[key] = candidate;
            layerChanged = true;
          }
          return;
        }
        const fallback = candidatesList.find((column) => source.columns.includes(column));
        if (fallback) {
          if (current !== fallback) {
            updated[key] = fallback;
            layerChanged = true;
          }
          return;
        }
        if (current) {
          updated[key] = undefined;
          layerChanged = true;
        }
      };

      ensureColumn('latitudeColumn', inference.suggestedLatitude, inference.latitudeCandidates);
      ensureColumn('longitudeColumn', inference.suggestedLongitude, inference.longitudeCandidates);
      ensureColumn('geoJsonColumn', inference.geoJsonColumns[0], inference.geoJsonColumns);
      ensureColumn('wktColumn', inference.wktColumns[0], inference.wktColumns);
      ensureColumn('pathColumn', inference.pathColumns[0], inference.pathColumns);
      ensureColumn('polygonColumn', inference.polygonColumns[0], inference.polygonColumns);

      (['categoryColumn', 'colorColumn', 'heightColumn'] as const).forEach((key) => {
        const value = updated[key];
        if (value && !source.columns.includes(value)) {
          updated[key] = undefined;
          layerChanged = true;
        }
      });

      if (layerChanged) {
        nextLayerSettings[id] = updated;
        changed = true;
      }
    });

    if (changed) {
      onUpdateSettings({ layerSettings: nextLayerSettings });
    }
  }, [activeLayers, mapSettings.layerSettings, onUpdateSettings]);

  useEffect(() => {
    if (selectedLayerId && activeLayerIds.includes(selectedLayerId)) {
      return;
    }
    setSelectedLayerId(activeLayerIds[0] ?? null);
  }, [activeLayerIds, selectedLayerId]);

  const updateLayerSettings = useCallback((layerId: string, updates: Partial<MapLayerSettings>) => {
    const currentLayerSettings = mapSettings.layerSettings ?? {};
    const previous = currentLayerSettings[layerId] ?? {};
    onUpdateSettings({
      layerSettings: {
        ...currentLayerSettings,
        [layerId]: {
          ...previous,
          ...updates,
        },
      },
    });
  }, [mapSettings.layerSettings, onUpdateSettings]);

  interface LayerConfig {
    id: string;
    source: MapDataSource;
    validColumns: MapLayerSettings;
    geoData: ReturnType<typeof buildGeoJsonFromRows> | null;
    categoryColorMap: Map<string, [number, number, number]>;
    getColorForValue: (value: any) => [number, number, number];
    usingFallbackCategory: boolean;
  }

  const layerConfigs = useMemo<LayerConfig[]>(() => {
    const configs: LayerConfig[] = [];
    const currentLayerSettings = mapSettings.layerSettings ?? {};

    activeLayers.forEach(({ id, source }) => {
      const settings = currentLayerSettings[id] ?? {};
      const validColumns: MapLayerSettings = {
        latitudeColumn: settings.latitudeColumn && source.columns.includes(settings.latitudeColumn)
          ? settings.latitudeColumn
          : undefined,
        longitudeColumn: settings.longitudeColumn && source.columns.includes(settings.longitudeColumn)
          ? settings.longitudeColumn
          : undefined,
        geoJsonColumn: settings.geoJsonColumn && source.columns.includes(settings.geoJsonColumn)
          ? settings.geoJsonColumn
          : undefined,
        wktColumn: settings.wktColumn && source.columns.includes(settings.wktColumn)
          ? settings.wktColumn
          : undefined,
        pathColumn: settings.pathColumn && source.columns.includes(settings.pathColumn)
          ? settings.pathColumn
          : undefined,
        polygonColumn: settings.polygonColumn && source.columns.includes(settings.polygonColumn)
          ? settings.polygonColumn
          : undefined,
        categoryColumn: settings.categoryColumn && source.columns.includes(settings.categoryColumn)
          ? settings.categoryColumn
          : undefined,
        colorColumn: settings.colorColumn && source.columns.includes(settings.colorColumn)
          ? settings.colorColumn
          : undefined,
        heightColumn: settings.heightColumn && source.columns.includes(settings.heightColumn)
          ? settings.heightColumn
          : undefined,
      };

      const rowsWithMetadata = source.rows.map((row) => ({
        ...row,
        __layerId: id,
        __layerLabel: source.label,
      }));
      const usingFallbackCategory = !validColumns.categoryColumn;
      const geoData = buildGeoJsonFromRows(rowsWithMetadata, {
        latitudeColumn: validColumns.latitudeColumn,
        longitudeColumn: validColumns.longitudeColumn,
        geoJsonColumn: validColumns.geoJsonColumn,
        wktColumn: validColumns.wktColumn,
        pathColumn: validColumns.pathColumn,
        polygonColumn: validColumns.polygonColumn,
        categoryColumn: validColumns.categoryColumn ?? '__layerLabel',
        colorColumn: validColumns.colorColumn,
        heightColumn: validColumns.heightColumn,
        aggregation: mapSettings.aggregation,
      });

      const categoryColorMap = new Map<string, [number, number, number]>();
      (geoData?.categories ?? []).forEach((category, index) => {
        const key = String(category);
        const paletteIndex = index % COLOR_PALETTE.length;
        categoryColorMap.set(key, COLOR_PALETTE[paletteIndex]);
      });

      const getColorForValue = (value: any) => {
        if (value === null || value === undefined) {
          return COLOR_PALETTE[0];
        }
        const key = String(value);
        if (categoryColorMap.has(key)) {
          return categoryColorMap.get(key)!;
        }
        const index = Math.abs(hashString(`${id}:${key}`)) % COLOR_PALETTE.length;
        return COLOR_PALETTE[index];
      };

      configs.push({
        id,
        source,
        validColumns,
        geoData,
        categoryColorMap,
        getColorForValue,
        usingFallbackCategory,
      });
    });

    return configs;
  }, [activeLayers, mapSettings.aggregation, mapSettings.layerSettings]);
  const selectedLayerConfig = selectedLayerId
    ? layerConfigs.find((config) => config.id === selectedLayerId) ?? null
    : (layerConfigs[0] ?? null);
  const selectedLayerColumns = selectedLayerConfig?.source.columns ?? [];
  const selectedLayerHasGeometrySelection = Boolean(
    selectedLayerConfig
      && (
        (selectedLayerConfig.validColumns.latitudeColumn && selectedLayerConfig.validColumns.longitudeColumn)
        || selectedLayerConfig.validColumns.geoJsonColumn
        || selectedLayerConfig.validColumns.wktColumn
        || selectedLayerConfig.validColumns.pathColumn
        || selectedLayerConfig.validColumns.polygonColumn
      ),
  );

  const aggregatedBounds = useMemo(() => {
    let bounds: [[number, number], [number, number]] | null = null;
    layerConfigs.forEach((config) => {
      const geoBounds = config.geoData?.bounds;
      if (!geoBounds) return;
      if (!bounds) {
        bounds = [
          [geoBounds[0][0], geoBounds[0][1]],
          [geoBounds[1][0], geoBounds[1][1]],
        ];
      } else {
        bounds = [
          [Math.min(bounds[0][0], geoBounds[0][0]), Math.min(bounds[0][1], geoBounds[0][1])],
          [Math.max(bounds[1][0], geoBounds[1][0]), Math.max(bounds[1][1], geoBounds[1][1])],
        ];
      }
    });
    return bounds;
  }, [layerConfigs]);

  const hasGeometrySelection = useMemo(() => layerConfigs.some((config) => (
    (config.validColumns.latitudeColumn && config.validColumns.longitudeColumn)
    || config.validColumns.geoJsonColumn
    || config.validColumns.wktColumn
    || config.validColumns.pathColumn
    || config.validColumns.polygonColumn
  )), [layerConfigs]);

  const hasRenderableData = useMemo(() => layerConfigs.some((config) => {
    const geoData = config.geoData;
    if (!geoData) return false;
    return Boolean(
      geoData.points.length
      || geoData.columns.length
      || geoData.paths.length
      || geoData.polygons.length
      || geoData.geoJsonFeatures.length,
    );
  }), [layerConfigs]);

  const legendEntries = useMemo(() => {
    const entries: { id: string; label: string; color: [number, number, number] }[] = [];
    layerConfigs.forEach((config) => {
      if (!config.geoData) {
        return;
      }
      if (config.usingFallbackCategory) {
        if (
          config.geoData.points.length
          || config.geoData.columns.length
          || config.geoData.paths.length
          || config.geoData.polygons.length
          || config.geoData.geoJsonFeatures.length
        ) {
          entries.push({
            id: `${config.id}:layer`,
            label: config.source.label,
            color: config.getColorForValue(config.source.label),
          });
        }
      } else {
        (config.geoData.categories ?? []).forEach((category) => {
          entries.push({
            id: `${config.id}:${category}`,
            label: `${config.source.label}: ${category}`,
            color: config.getColorForValue(category),
          });
        });
      }
    });
    return entries;
  }, [layerConfigs]);

  const selectedBasemap = BASEMAPS[mapSettings.basemap] ?? BASEMAPS['osm-standard'];
  const allowTilt = selectedBasemap.allowTilt ?? false;
  const defaultPitch = selectedBasemap.defaultPitch ?? 0;
  const defaultBearing = selectedBasemap.defaultBearing ?? 0;

  const tileLayer = useMemo(() => (
    createBitmapTileLayer(`osm-tile-layer-${mapSettings.basemap}`, selectedBasemap.urlTemplates)
  ), [mapSettings.basemap, selectedBasemap]);

  const overlayLayers = useMemo(() => (
    (Object.entries(BASEMAP_OVERLAYS) as [MapBasemapOverlay, (typeof BASEMAP_OVERLAYS)[MapBasemapOverlay]][])
      .filter(([key]) => overlaySettings[key])
      .map(([key, overlay]) => createBitmapTileLayer(
        `osm-overlay-${key}`,
        overlay.urlTemplates,
        {
          opacity: overlay.opacity,
          minZoom: overlay.minZoom,
          maxZoom: overlay.maxZoom,
        },
      ))
  ), [overlaySettings]);

  const dataLayers = useMemo(() => {
    const baseLayers = [tileLayer, ...overlayLayers];

    layerConfigs.forEach((config) => {
      const { id, geoData, getColorForValue, validColumns } = config;
      if (!geoData) {
        return;
      }
      if (geoData.columns.length) {
        baseLayers.push(new ColumnLayer({
          id: `geo-columns-${id}`,
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
        }));
      }
      if (geoData.points.length) {
        baseLayers.push(new ScatterplotLayer({
          id: `geo-points-${id}`,
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
        }));
      }
      if (geoData.paths.length) {
        baseLayers.push(new PathLayer({
          id: `geo-paths-${id}`,
          data: geoData.paths,
          pickable: true,
          widthScale: 2,
          widthMinPixels: 2,
          getPath: (d: any) => d.path,
          getColor: (d: any) => {
            const color = getColorForValue(d.properties?.colorValue ?? d.properties?.categoryValue);
            return [...color, 200];
          },
        }));
      }
      if (geoData.geoJsonFeatures.length) {
        baseLayers.push(new GeoJsonLayer({
          id: `geojson-layer-${id}`,
          data: {
            type: 'FeatureCollection',
            features: geoData.geoJsonFeatures,
          },
          pickable: true,
          stroked: true,
          filled: true,
          extruded: Boolean(validColumns.heightColumn),
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
        }));
      }
    });

    return baseLayers;
  }, [layerConfigs, mapSettings.columnRadius, mapSettings.elevationScale, mapSettings.pointRadius, overlayLayers, tileLayer]);

  const computedViewState = useMemo(() => {
    const baseState = {
      ...DEFAULT_VIEW_STATE,
      pitch: defaultPitch,
      bearing: defaultBearing,
    };
    if (aggregatedBounds) {
      const [[minLon, minLat], [maxLon, maxLat]] = aggregatedBounds;
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
  }, [aggregatedBounds, defaultBearing, defaultPitch]);

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
  const tooltipFormatter = useCallback(({ object }: { object: any }) => {
    if (!object) return null;
    const properties = object.properties ?? object;
    const category = properties?.categoryValue ?? properties?.category;
    const metric = properties?.metricValue ?? properties?.elevation;
    const position = object.position || properties?.position;
    const lines: string[] = [];
    if (properties?.__layerLabel) {
      lines.push(`レイヤー: ${String(properties.__layerLabel)}`);
    }
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

  const handleLayerToggle = useCallback((layerId: string, enabled: boolean) => {
    const currentIds = mapSettings.activeDataSourceIds ?? [];
    const filtered = currentIds.filter((id) => id !== layerId);
    let nextIds = enabled ? [...filtered, layerId] : filtered;
    const orderMap = new Map(dataSources.map((source, index) => [source.id, index]));
    nextIds = nextIds
      .filter((id, index) => nextIds.indexOf(id) === index && orderMap.has(id))
      .sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
    onUpdateSettings({ activeDataSourceIds: nextIds });
  }, [dataSources, mapSettings.activeDataSourceIds, onUpdateSettings]);

  const settingsContent = (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">レイヤー管理</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            地図に表示するデータセットをレイヤーとして選択し、それぞれの列設定をカスタマイズできます。
          </p>
        </div>
        <div className="space-y-2">
          {dataSources.map((source) => {
            const isActive = activeLayerIds.includes(source.id);
            return (
              <label
                key={source.id}
                className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                <span className="truncate pr-2">{source.label}</span>
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600"
                  checked={isActive}
                  onChange={(event) => handleLayerToggle(source.id, event.target.checked)}
                />
              </label>
            );
          })}
          {dataSources.length === 0 && (
            <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              レイヤーとして表示できるデータセットがありません。
            </div>
          )}
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">設定対象レイヤー</span>
          <select
            value={selectedLayerConfig ? selectedLayerConfig.id : ''}
            onChange={(event) => setSelectedLayerId(event.target.value || null)}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            disabled={!activeLayerIds.length}
          >
            {activeLayerIds.length === 0 && <option value="">レイヤー未選択</option>}
            {activeLayerIds.map((layerId) => {
              const source = availableSourceMap.get(layerId);
              if (!source) return null;
              return (
                <option key={layerId} value={layerId}>
                  {source.label}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {selectedLayerConfig ? (
        <>
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
                  北緯（lat）の値を含む列を指定します。散布や柱状グラフのY座標として利用されます。
                </span>
                <select
                  value={selectedLayerConfig.validColumns.latitudeColumn ?? ''}
                  onChange={(event) => updateLayerSettings(selectedLayerConfig.id, { latitudeColumn: event.target.value || undefined })}
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">未選択</option>
                  {selectedLayerColumns.map((column) => (
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
                  value={selectedLayerConfig.validColumns.longitudeColumn ?? ''}
                  onChange={(event) => updateLayerSettings(selectedLayerConfig.id, { longitudeColumn: event.target.value || undefined })}
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">未選択</option>
                  {selectedLayerColumns.map((column) => (
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
                  value={selectedLayerConfig.validColumns.geoJsonColumn ?? ''}
                  onChange={(event) => updateLayerSettings(selectedLayerConfig.id, { geoJsonColumn: event.target.value || undefined })}
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">未選択</option>
                  {selectedLayerColumns.map((column) => (
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
                  value={selectedLayerConfig.validColumns.wktColumn ?? ''}
                  onChange={(event) => updateLayerSettings(selectedLayerConfig.id, { wktColumn: event.target.value || undefined })}
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">未選択</option>
                  {selectedLayerColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                <span>ライン列</span>
                <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
                  経度・緯度のペア配列を持つ列を指定すると、PathLayerでルートを描画します。
                </span>
                <select
                  value={selectedLayerConfig.validColumns.pathColumn ?? ''}
                  onChange={(event) => updateLayerSettings(selectedLayerConfig.id, { pathColumn: event.target.value || undefined })}
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">未選択</option>
                  {selectedLayerColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                <span>ポリゴン列</span>
                <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
                  経度・緯度のリング配列を含む列を指定すると、面データを塗りつぶして表示します。
                </span>
                <select
                  value={selectedLayerConfig.validColumns.polygonColumn ?? ''}
                  onChange={(event) => updateLayerSettings(selectedLayerConfig.id, { polygonColumn: event.target.value || undefined })}
                  className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">未選択</option>
                  {selectedLayerColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {!selectedLayerHasGeometrySelection && (
            <div className="flex items-center gap-2 rounded border border-dashed border-yellow-400 bg-yellow-50 p-3 text-xs text-yellow-700 dark:border-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-200">
              <IoInformationCircleOutline size={16} />
              <span>
                {noCoordinateMessage ?? '設定パネルで緯度・経度またはGeoJSON / WKT 列を選択するとマップが描画されます。'}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="rounded border border-dashed border-yellow-400 bg-yellow-50 p-3 text-xs text-yellow-700 dark:border-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-200">
          レイヤーを有効化すると設定項目が表示されます。
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
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>カテゴリ列</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            選択するとカテゴリごとに凡例が作成され、点やカラムをグループ別に色分けできます。
          </span>
          <select
            value={selectedLayerConfig?.validColumns.categoryColumn ?? ''}
            onChange={(event) => selectedLayerConfig && updateLayerSettings(selectedLayerConfig.id, { categoryColumn: event.target.value || undefined })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            disabled={!selectedLayerConfig}
          >
            <option value="">未選択</option>
            {selectedLayerColumns.map((column) => (
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
            value={selectedLayerConfig?.validColumns.colorColumn ?? ''}
            onChange={(event) => selectedLayerConfig && updateLayerSettings(selectedLayerConfig.id, { colorColumn: event.target.value || undefined })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            disabled={!selectedLayerConfig}
          >
            <option value="">未選択</option>
            {selectedLayerColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>高さ列</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            ColumnLayerで棒グラフを表示するときの高さに使う指標列を指定します。
          </span>
          <select
            value={selectedLayerConfig?.validColumns.heightColumn ?? ''}
            onChange={(event) => selectedLayerConfig && updateLayerSettings(selectedLayerConfig.id, { heightColumn: event.target.value || undefined })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            disabled={!selectedLayerConfig}
          >
            <option value="">未選択</option>
            {selectedLayerColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
          <span>集計方法</span>
          <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            同一座標に複数行がある場合に高さ列の値をどのように集約するかを指定します。
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
            ScatterplotLayerの点の大きさをピクセル単位で調整します。
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
            ColumnLayerで描画する円柱の半径をメートル単位で指定します。
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
            棒グラフの高さを掛け算で拡大・縮小します。
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

        <div className="rounded border border-gray-200 bg-white p-3 text-xs text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <div className="font-medium">OpenStreetMap オーバーレイ</div>
          <div className="mt-1 text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">
            道路・鉄道・起伏のタイルレイヤーを個別にON/OFFできます。
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {(Object.entries(BASEMAP_OVERLAYS) as [MapBasemapOverlay, (typeof BASEMAP_OVERLAYS)[MapBasemapOverlay]][]).map(([key, overlay]) => (
              <label key={key} className="flex items-start gap-2 rounded border border-gray-200 px-2 py-2 font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
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
                <span className="flex flex-col gap-1">
                  <span>{overlay.label}</span>
                  <span className="text-[11px] font-normal leading-snug text-gray-500 dark:text-gray-400">{overlay.description}</span>
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
          layers={dataLayers}
          initialViewState={computedViewState}
          viewState={viewState}
          onViewStateChange={handleViewStateChange}
          getTooltip={tooltipFormatter}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex min-h-0 items-start justify-end">
          {isOptionalSidebarOpen ? (
            <div className="pointer-events-auto z-10 flex h-full max-h-full min-h-0 w-80 max-w-[90vw] flex-col border-l border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
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
              <div className="min-h-0 flex-1 overflow-y-auto pl-3 pr-4 py-4">
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
        <div
          className="pointer-events-none absolute top-4 flex flex-col gap-3"
          style={{ right: `${isOptionalSidebarOpen ? OPTIONAL_SIDEBAR_WIDTH_PX + 24 : 16}px` }}
        >
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
        {legendEntries.length > 0 && (
          <div
            className="pointer-events-none absolute bottom-3 flex max-w-[50vw] flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300"
            style={{ right: `${isOptionalSidebarOpen ? OPTIONAL_SIDEBAR_WIDTH_PX + 24 : 12}px` }}
          >
            {legendEntries.map((entry) => (
              <span
                key={entry.id}
                className="pointer-events-auto flex items-center gap-2 rounded bg-white/80 px-2 py-1 shadow dark:bg-gray-900/70"
              >
                <span className="h-3 w-3 rounded" style={{ backgroundColor: toCssColor(entry.color) }} />
                {entry.label}
              </span>
            ))}
          </div>
        )}
        {!hasRenderableData && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-600 dark:text-gray-300">
            {activeLayerIds.length === 0
              ? '表示するレイヤーを選択してください。'
              : (hasGeometrySelection
                ? '選択された列に基づくジオメトリが見つかりませんでした。データ値を確認してください。'
                : (noCoordinateMessage ?? '設定パネルで緯度・経度またはGeoJSON / WKT 列を選択するとマップが描画されます。'))}
          </div>
        )}
      </div>
    </div>
  );
};
export default GeoAnalysisMapPanel;
