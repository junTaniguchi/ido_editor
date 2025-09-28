import type { LoaderWithParser } from '@loaders.gl/core';

export const ShapefileLoader: LoaderWithParser | null = null;

if (process.env.NODE_ENV !== 'production') {
  console.warn(
    '[debug] Using shapefile loader stub because @loaders.gl/shapefile is not installed. Shapefile previews will be disabled.'
  );
}

export default { ShapefileLoader };
