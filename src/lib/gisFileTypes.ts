export type GisFileType = 'geojson' | 'kml' | 'kmz' | 'shapefile';

export const GIS_FILE_TYPES: readonly GisFileType[] = ['geojson', 'kml', 'kmz', 'shapefile'] as const;
