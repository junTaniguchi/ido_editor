import type { Feature, FeatureCollection } from 'geojson';
import shp from 'shpjs';
import { unzipSync, strFromU8 } from 'fflate';
import { kml as convertKmlToGeoJson } from '@tmcw/togeojson';
import { flattenNestedObjects } from './dataPreviewUtils';

export interface GisParseResult {
  rows: any[];
  columns: string[];
  featureCollection?: FeatureCollection;
  warning?: string;
  error?: string;
}

const isFeatureCollection = (value: any): value is FeatureCollection => {
  return (
    value &&
    typeof value === 'object' &&
    value.type === 'FeatureCollection' &&
    Array.isArray(value.features)
  );
};

const isFeatureArray = (value: any): value is Feature[] => {
  return (
    Array.isArray(value) &&
    value.every((item) => item && typeof item === 'object' && 'geometry' in item)
  );
};

const normalizeToFeatureArray = (input: any): Feature[] | null => {
  if (!input) {
    return null;
  }

  if (isFeatureCollection(input)) {
    return input.features as Feature[];
  }

  if (input.type === 'Feature' && input.geometry) {
    return [input as Feature];
  }

  if (isFeatureArray(input)) {
    return input as Feature[];
  }

  if (input.features && Array.isArray(input.features)) {
    return normalizeToFeatureArray({
      type: 'FeatureCollection',
      features: input.features,
    });
  }

  if (typeof input === 'object') {
    const aggregated: Feature[] = [];
    let found = false;
    for (const value of Object.values(input)) {
      const normalized = normalizeToFeatureArray(value);
      if (normalized && normalized.length > 0) {
        aggregated.push(...normalized);
        found = true;
      }
    }
    return found ? aggregated : null;
  }

  return null;
};

const flattenProperties = (properties: any): Record<string, unknown> => {
  if (!properties || typeof properties !== 'object') {
    return {};
  }

  const flattened = flattenNestedObjects([properties]);
  const first = Array.isArray(flattened) && flattened.length > 0 ? flattened[0] : {};
  return (first && typeof first === 'object' ? first : {}) as Record<string, unknown>;
};

const featuresToTable = (features: Feature[]): { rows: any[]; columns: string[]; featureCollection: FeatureCollection } => {
  const rows: Record<string, unknown>[] = [];
  const columnSet = new Set<string>();

  features.forEach((feature, index) => {
    const flattenedProps = flattenProperties(feature.properties ?? {});
    const row: Record<string, unknown> = {
      feature_id: feature.id ?? index,
      geometry_type: feature.geometry?.type ?? null,
      geometry: feature.geometry ? JSON.stringify(feature.geometry) : null,
      ...flattenedProps,
    };

    Object.keys(row).forEach((key) => columnSet.add(key));
    rows.push(row);
  });

  return {
    rows,
    columns: Array.from(columnSet),
    featureCollection: {
      type: 'FeatureCollection',
      features: features,
    },
  };
};

export const buildGisDatasetFromObject = (input: any): GisParseResult | null => {
  const features = normalizeToFeatureArray(input);
  if (!features || features.length === 0) {
    return null;
  }

  const table = featuresToTable(features);
  return {
    rows: table.rows,
    columns: table.columns,
    featureCollection: table.featureCollection,
  };
};

export const parseGeoJsonContent = (content: string): GisParseResult => {
  try {
    const parsed = JSON.parse(content);
    const dataset = buildGisDatasetFromObject(parsed);
    if (!dataset) {
      return {
        rows: [],
        columns: [],
        error: 'GeoJSONデータからフィーチャを抽出できませんでした',
      };
    }
    return dataset;
  } catch (error) {
    return {
      rows: [],
      columns: [],
      error: error instanceof Error ? error.message : 'GeoJSONの解析に失敗しました',
    };
  }
};

export const parseKmlContent = (content: string): GisParseResult => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'application/xml');
    const geojson = convertKmlToGeoJson(doc);
    const dataset = buildGisDatasetFromObject(geojson);
    if (!dataset) {
      return {
        rows: [],
        columns: [],
        error: 'KML内に解析可能なフィーチャが見つかりませんでした',
      };
    }
    return dataset;
  } catch (error) {
    return {
      rows: [],
      columns: [],
      error: error instanceof Error ? error.message : 'KMLの解析に失敗しました',
    };
  }
};

export const parseKmzContent = (buffer: ArrayBuffer): GisParseResult => {
  try {
    const zipped = new Uint8Array(buffer);
    const files = unzipSync(zipped);
    const kmlEntry = Object.keys(files).find((key) => key.toLowerCase().endsWith('.kml'));
    if (!kmlEntry) {
      return {
        rows: [],
        columns: [],
        error: 'KMZ内にKMLファイルが見つかりませんでした',
      };
    }
    const kmlText = strFromU8(files[kmlEntry]);
    return parseKmlContent(kmlText);
  } catch (error) {
    return {
      rows: [],
      columns: [],
      error: error instanceof Error ? error.message : 'KMZの解析に失敗しました',
    };
  }
};

export const parseShapefileContent = async (buffer: ArrayBuffer): Promise<GisParseResult> => {
  try {
    const result = await shp(buffer);
    const dataset = buildGisDatasetFromObject(result);
    if (!dataset) {
      return {
        rows: [],
        columns: [],
        error: 'シェープファイルからフィーチャを抽出できませんでした',
      };
    }
    return dataset;
  } catch (error) {
    return {
      rows: [],
      columns: [],
      error: error instanceof Error ? error.message : 'シェープファイルの解析に失敗しました',
    };
  }
};
