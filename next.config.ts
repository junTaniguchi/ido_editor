import path from 'path';
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // alasqlがブラウザで動作するように設定を調整
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'react-native-fs': false,
      'react-native-fetch-blob': false,
      fs: false,
      path: false,
      stream: false,
    };

    const shapefilePackageName = '@loaders.gl/shapefile';
    let shapefileAvailable = true;

    try {
      require.resolve(shapefilePackageName);
    } catch (error) {
      shapefileAvailable = false;
      console.warn(
        `[debug] ${shapefilePackageName} is not installed. Using a stub loader so the build can continue without shapefile support.`
      );
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        [shapefilePackageName]: path.resolve(__dirname, 'src/lib/shapefileLoaderStub.ts'),
      };
    }
    
    // Mermaidの最適化設定
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          ...config.optimization.splitChunks,
          cacheGroups: {
            ...config.optimization.splitChunks?.cacheGroups,
            mermaid: {
              test: /[\\/]node_modules[\\/]mermaid[\\/]/,
              name: 'mermaid',
              chunks: 'all',
              priority: 10,
            },
          },
        },
      };
    }

    if (shapefileAvailable) {
      const shapefileWarningPattern = /Critical dependency: the request of a dependency is an expression/;
      const shapefileModulePattern = /dataPreviewUtils\.ts$/;
      config.ignoreWarnings = [
        ...(config.ignoreWarnings ?? []),
        (warning) =>
          typeof warning.message === 'string' &&
          shapefileWarningPattern.test(warning.message) &&
          shapefileModulePattern.test((warning.module?.resource as string | undefined) ?? ''),
      ];
    }

    return config;
  },
  // TypeScriptの設定
  typescript: {
    ignoreBuildErrors: true, // 本番環境では必要に応じてfalseに変更
  },
  // ESLintの設定
  eslint: {
    ignoreDuringBuilds: true, // 本番環境では必要に応じてfalseに変更
  },
};

export default nextConfig;
