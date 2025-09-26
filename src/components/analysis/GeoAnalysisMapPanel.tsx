'use client';

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, ColumnLayer, ScatterplotLayer, PathLayer, GeoJsonLayer } from '@deck.gl/layers';
import { inferCoordinateColumns, buildGeoJsonFromRows } from '@/lib/dataAnalysisUtils';
import type { MapSettings } from '@/types';
import { IoInformationCircleOutline } from 'react-icons/io5';

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
}

const DEFAULT_VIEW_STATE = {
  longitude: 139.767,
  latitude: 35.681,
  zoom: 3,
  pitch: 45,
  bearing: 0,
};

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
}) => {
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);

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

  const tileLayer = useMemo(() => {
    const subDomains = ['a', 'b', 'c'];
    return new TileLayer({
      id: 'osm-tile-layer',
      data: subDomains.map((subDomain) => `https://${subDomain}.tile.openstreetmap.org/{z}/{x}/{y}.png`),
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props) => {
        const {
          tile,
          data,
          visible,
          opacity,
        } = props;
        const {
          west,
          south,
          east,
          north,
        } = tile.bbox;
        return new BitmapLayer(props, {
          id: `${props.id}-bitmap`,
          image: data,
          bounds: [west, south, east, north],
          visible,
          opacity,
        });
      },
    });
  }, []);

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
    const list = [tileLayer];
    if (columnLayer) list.push(columnLayer);
    if (scatterLayer) list.push(scatterLayer);
    if (pathLayer) list.push(pathLayer);
    if (geoJsonLayer) list.push(geoJsonLayer);
    return list;
  }, [tileLayer, columnLayer, scatterLayer, pathLayer, geoJsonLayer]);

  const computedViewState = useMemo(() => {
    if (geoData?.bounds) {
      const [[minLon, minLat], [maxLon, maxLat]] = geoData.bounds;
      const latitude = (minLat + maxLat) / 2;
      const longitude = (minLon + maxLon) / 2;
      const latDiff = Math.max(Math.abs(maxLat - minLat), 0.0001);
      const lonDiff = Math.max(Math.abs(maxLon - minLon), 0.0001);
      const zoom = Math.min(16, Math.max(2, 8 - Math.log2(Math.max(latDiff, lonDiff))));
      return {
        ...DEFAULT_VIEW_STATE,
        latitude,
        longitude,
        zoom,
      };
    }
    return DEFAULT_VIEW_STATE;
  }, [geoData?.bounds]);

  useEffect(() => {
    setViewState((prev) => ({
      ...prev,
      ...computedViewState,
    }));
  }, [computedViewState]);

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

  if (!dataSources.length) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
        {noDataMessage ?? '表示できるデータセットがありません。'}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            データソース
            <select
              value={activeSource?.id ?? ''}
              onChange={(event) => onUpdateSettings({ dataSource: event.target.value })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              {dataSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            緯度列
            <select
              value={validLatitudeColumn ?? ''}
              onChange={(event) => onUpdateSettings({ latitudeColumn: event.target.value || undefined })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">未選択</option>
              {activeSource?.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            経度列
            <select
              value={validLongitudeColumn ?? ''}
              onChange={(event) => onUpdateSettings({ longitudeColumn: event.target.value || undefined })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">未選択</option>
              {activeSource?.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            GeoJSON列
            <select
              value={validGeoJsonColumn ?? ''}
              onChange={(event) => onUpdateSettings({ geoJsonColumn: event.target.value || undefined })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">未選択</option>
              {activeSource?.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            WKT列
            <select
              value={validWktColumn ?? ''}
              onChange={(event) => onUpdateSettings({ wktColumn: event.target.value || undefined })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">未選択</option>
              {activeSource?.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            ライン列
            <select
              value={validPathColumn ?? ''}
              onChange={(event) => onUpdateSettings({ pathColumn: event.target.value || undefined })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">未選択</option>
              {activeSource?.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            ポリゴン列
            <select
              value={validPolygonColumn ?? ''}
              onChange={(event) => onUpdateSettings({ polygonColumn: event.target.value || undefined })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">未選択</option>
              {activeSource?.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            カテゴリ列
            <select
              value={validCategoryColumn ?? ''}
              onChange={(event) => onUpdateSettings({ categoryColumn: event.target.value || undefined })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">未選択</option>
              {activeSource?.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            色分け列
            <select
              value={validColorColumn ?? ''}
              onChange={(event) => onUpdateSettings({ colorColumn: event.target.value || undefined })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">未選択</option>
              {activeSource?.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            高さ列
            <select
              value={validHeightColumn ?? ''}
              onChange={(event) => onUpdateSettings({ heightColumn: event.target.value || undefined })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">未選択</option>
              {activeSource?.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            集計方法
            <select
              value={mapSettings.aggregation}
              onChange={(event) => onUpdateSettings({ aggregation: event.target.value as MapSettings['aggregation'] })}
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="sum">合計</option>
              <option value="avg">平均</option>
              <option value="count">件数</option>
              <option value="min">最小</option>
              <option value="max">最大</option>
              <option value="none">値をそのまま使用</option>
            </select>
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            点サイズ (px)
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
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            カラム半径 (m)
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
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-gray-700 dark:text-gray-300">
            高さスケール
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
              className="mt-1 rounded border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </div>

        {geoData && geoData.categories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
            {geoData.categories.map((category) => {
              const color = getColorForValue(category);
              return (
                <span key={category} className="flex items-center gap-2 rounded bg-white/70 px-2 py-1 shadow dark:bg-gray-900/60">
                  <span className="h-3 w-3 rounded" style={{ backgroundColor: toCssColor(color) }} />
                  {category}
                </span>
              );
            })}
          </div>
        )}

        {!hasGeometrySelection && (
          <div className="mt-4 flex items-center gap-2 rounded border border-dashed border-yellow-400 bg-yellow-50 p-3 text-xs text-yellow-700 dark:border-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-200">
            <IoInformationCircleOutline size={16} />
            <span>
              {noCoordinateMessage ?? '緯度・経度またはGeoJSON / WKT 列を選択するとマップが描画されます。'}
            </span>
          </div>
        )}
      </div>

      <div className="relative flex-1 bg-gray-200 dark:bg-gray-900">
        <DeckGL
          controller
          layers={layers}
          initialViewState={computedViewState}
          viewState={viewState}
          onViewStateChange={({ viewState: next }) => setViewState(next as typeof viewState)}
          getTooltip={tooltipFormatter}
        />
        {!hasRenderableData && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-gray-600 dark:text-gray-300">
            {hasGeometrySelection
              ? '選択された列に基づくジオメトリが見つかりませんでした。データ値を確認してください。'
              : (noCoordinateMessage ?? '緯度・経度またはGeoJSON / WKT 列を選択するとマップが描画されます。')}
          </div>
        )}
      </div>
    </div>
  );
};

export default GeoAnalysisMapPanel;
