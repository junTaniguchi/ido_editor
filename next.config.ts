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
