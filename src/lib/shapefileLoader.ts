import type { FeatureCollection } from 'geojson';

import type { LoaderWithParser } from '@loaders.gl/core';

let loadersCoreModulePromise: Promise<typeof import('@loaders.gl/core')> | null = null;
const loadLoadersCoreModule = async () => {
  if (!loadersCoreModulePromise) {
    loadersCoreModulePromise = import('@loaders.gl/core');
  }
  return loadersCoreModulePromise;
};

let shapefileModulePromise: Promise<typeof import('@loaders.gl/shapefile')> | null = null;
const loadShapefileModule = async () => {
  if (!shapefileModulePromise) {
    shapefileModulePromise = import('@loaders.gl/shapefile');
  }
  return shapefileModulePromise;
};

export interface LoadShapefileOptions {
  /**
   * When true, geometry objects are stringified instead of returned as plain objects.
   * This is useful when the consumer expects tabular data without nested objects.
   */
  stringifyGeometry?: boolean;
}

export interface LoadShapefileResult {
  featureCollection: FeatureCollection;
  warning?: string;
}

const normalizeLoader = (loader: unknown): LoaderWithParser | null => {
  if (!loader || typeof loader !== 'object') {
    return null;
  }

  if ('parse' in loader || 'parseSync' in loader) {
    return loader as LoaderWithParser;
  }

  return null;
};

export const loadShapefileFromArrayBuffer = async (
  buffer: ArrayBuffer,
  options: LoadShapefileOptions = {}
): Promise<LoadShapefileResult> => {
  const [loadersCoreModule, shapefileModule] = await Promise.all([
    loadLoadersCoreModule(),
    loadShapefileModule(),
  ]);

  const { load } = loadersCoreModule;
  if (typeof load !== 'function') {
    throw new Error('loaders.gl/core の読み込みに失敗しました');
  }

  const loader = normalizeLoader((shapefileModule as any).ShapefileLoader ?? null);
  if (!loader) {
    throw new Error('ShapefileLoaderが利用できません (@loaders.gl/shapefile の読み込みに失敗しました)。');
  }

  const result = await load(buffer, loader, {
    shapefile: {
      _targetCrs: 'WGS84',
    },
  });

  if (!result) {
    throw new Error('シェープファイルの解析結果が空でした');
  }

  let featureCollection: FeatureCollection;

  if (Array.isArray(result)) {
    featureCollection = {
      type: 'FeatureCollection',
      features: result as FeatureCollection['features'],
    };
  } else if ((result as any).type === 'FeatureCollection') {
    featureCollection = result as FeatureCollection;
  } else if ((result as any).features) {
    featureCollection = {
      type: 'FeatureCollection',
      features: (result as any).features,
    };
  } else {
    throw new Error('シェープファイルからGeoJSONフィーチャを抽出できませんでした');
  }

  if (options.stringifyGeometry) {
    featureCollection = {
      ...featureCollection,
      features: featureCollection.features.map((feature) => ({
        ...feature,
        geometry: feature.geometry ? JSON.stringify(feature.geometry) : feature.geometry,
      })),
    };
  }

  const warning =
    !featureCollection.features || featureCollection.features.length === 0
      ? 'シェープファイルに有効なフィーチャが含まれていません'
      : undefined;

  return {
    featureCollection,
    warning,
  };
};

export const ShapefileLoader = {
  loadShapefileFromArrayBuffer,
};

export default ShapefileLoader;
