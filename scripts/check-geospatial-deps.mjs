import { existsSync } from 'node:fs';
import path from 'node:path';

const requiredPackages = [
  '@loaders.gl/wkt',
  '@loaders.gl/shapefile',
  '@loaders.gl/topojson',
  'wellknown'
];

const missingPackages = requiredPackages.filter((pkg) => {
  const packageJsonPath = path.join('node_modules', ...pkg.split('/'), 'package.json');
  return !existsSync(packageJsonPath);
});

if (missingPackages.length > 0) {
  const formattedList = missingPackages.map((pkg) => ` - ${pkg}`).join('\n');
  console.error(
    '\nRequired geospatial dependencies are missing.\n' +
    'Please reinstall the project dependencies so the following packages are available:\n' +
    `${formattedList}\n\n` +
    'Example: npm install\n'
  );
  process.exitCode = 1;
}
