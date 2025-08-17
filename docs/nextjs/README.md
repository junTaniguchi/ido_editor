# Next.js アプリケーション仕様

## 概要

IDO Editor は Next.js 15.4.5 をベースとした高機能Webアプリケーションです。App Router を使用してモダンなReactアプリケーション構成を実現しています。

## プロジェクト構造

### App Router 構成

```
src/app/
├── layout.tsx          # ルートレイアウト
├── page.tsx           # ホームページ
├── globals.css        # グローバルスタイル
└── favicon.ico        # ファビコン
```

### 主要設定ファイル

#### next.config.ts
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizeCss: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  webpack: (config) => {
    config.resolve.fallback = {
      fs: false,
      path: false,
    };
    return config;
  }
};

export default nextConfig;
```

#### 主要機能
- **CSS最適化**: experimental.optimizeCss
- **本番環境でのconsole.log除去**: compiler.removeConsole
- **Webpack設定**: Node.jsモジュールのフォールバック設定

## アーキテクチャパターン

### クライアントサイドレンダリング (CSR)

IDO Editor は完全にクライアントサイドで動作する設計となっています:

**理由**:
- File System Access API の使用
- ブラウザ内でのファイル処理
- リアルタイムデータ分析

**実装例**:
```tsx
'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';

export default function HomePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div>Loading...</div>;
  }

  return <MainLayout />;
}
```

### 状態管理パターン

#### Zustand Store 統合
```typescript
// src/store/editorStore.ts
import { create } from 'zustand';

interface EditorStore {
  // タブ管理
  tabs: Map<string, Tab>;
  activeTabId: string | null;
  
  // ファイルシステム
  rootDirHandle: FileSystemDirectoryHandle | null;
  rootFileTree: FileTree | null;
  
  // 分析機能
  analysisEnabled: boolean;
  analysisData: any[] | null;
  
  // アクション
  setActiveTabId: (id: string) => void;
  addTab: (tab: Tab) => void;
  // ...
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  // 実装
}));
```

## コンポーネント設計

### レイアウトコンポーネント

#### MainLayout.tsx
```tsx
interface MainLayoutProps {
  children?: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <FileExplorer />
      <div className="flex-1 flex flex-col">
        <TabBar />
        <div className="flex-1 flex">
          <Editor />
          <PreviewPanel />
        </div>
      </div>
    </div>
  );
};
```

### 機能別コンポーネント階層

```
MainLayout
├── FileExplorer
│   ├── DirectoryTree
│   └── FileItem
├── TabBar
│   ├── Tab
│   └── TabActions
├── Editor
│   ├── CodeMirrorEditor
│   └── MarkdownToolbar
└── PreviewPanel
    ├── DataPreview
    ├── MarkdownPreview
    ├── MermaidPreview
    └── DataAnalysis
```

## パフォーマンス最適化

### Code Splitting

#### 動的インポート
```typescript
// 重いライブラリの動的読み込み
const PlotlyChart = dynamic(() => import('react-plotly.js'), {
  loading: () => <div>Loading chart...</div>,
  ssr: false
});

const DataAnalysis = dynamic(() => import('@/components/analysis/DataAnalysis'), {
  loading: () => <div>Loading analysis...</div>
});
```

#### React.lazy の活用
```typescript
const MermaidPreview = lazy(() => import('@/components/preview/MermaidPreview'));
const ExcelPreview = lazy(() => import('@/components/preview/ExcelPreview'));
```

### メモ化戦略

#### React.memo によるコンポーネント最適化
```typescript
const DataTable = React.memo<DataTableProps>(({ data, pageSize }) => {
  const memoizedData = useMemo(() => {
    return processTableData(data);
  }, [data]);

  return <Table data={memoizedData} pageSize={pageSize} />;
});
```

#### カスタムフックでの計算キャッシュ
```typescript
const useAnalysisData = (data: any[], query: string) => {
  return useMemo(() => {
    if (!data || !query) return null;
    return executeSQL(data, query);
  }, [data, query]);
};
```

## スタイリングシステム

### Tailwind CSS 設定

#### tailwind.config.ts
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        }
      }
    }
  },
  plugins: [],
};
```

### ダークモード実装

#### テーマ切り替えコンポーネント
```tsx
const ThemeToggle: React.FC = () => {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const isDark = localStorage.getItem('darkMode') === 'true';
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleTheme = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', newDarkMode.toString());
    document.documentElement.classList.toggle('dark', newDarkMode);
  };

  return (
    <button onClick={toggleTheme}>
      {darkMode ? <SunIcon /> : <MoonIcon />}
    </button>
  );
};
```

## TypeScript 設定

### tsconfig.json
```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 型定義の拡張

#### globals.d.ts
```typescript
// File System Access API の型定義
interface FileSystemFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
  // ...
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  getFileHandle(name: string): Promise<FileSystemFileHandle>;
  // ...
}
```

## セキュリティ考慮事項

### Content Security Policy

#### next.config.ts での設定
```typescript
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'"
            ].join('; ')
          }
        ]
      }
    ];
  }
};
```

### File System Access API セキュリティ

#### 安全なファイルアクセス
```typescript
const openFile = async (): Promise<FileSystemFileHandle> => {
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Text files',
          accept: {
            'text/*': ['.txt', '.md', '.csv', '.json']
          }
        }
      ]
    });
    return fileHandle;
  } catch (error) {
    throw new Error('ファイルアクセスが拒否されました');
  }
};
```

## デプロイメント

### Vercel デプロイ設定

#### vercel.json
```json
{
  "functions": {
    "src/app/**/*.tsx": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        },
        {
          "key": "Cross-Origin-Opener-Policy", 
          "value": "same-origin"
        }
      ]
    }
  ]
}
```

### 環境変数管理

#### .env.local
```bash
NEXT_PUBLIC_APP_NAME=IDO Editor
NEXT_PUBLIC_VERSION=1.0.0
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
```

#### 環境変数の型安全な使用
```typescript
interface Env {
  NEXT_PUBLIC_APP_NAME: string;
  NEXT_PUBLIC_VERSION: string;
}

const env: Env = {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME!,
  NEXT_PUBLIC_VERSION: process.env.NEXT_PUBLIC_VERSION!,
};

export default env;
```

## 今後の拡張計画

### SSR/SSG 機能の追加

#### 静的ページ生成
```typescript
// 将来的なドキュメントページ
export async function generateStaticParams() {
  return [
    { slug: 'getting-started' },
    { slug: 'api-reference' },
    { slug: 'examples' }
  ];
}

export default function DocsPage({ params }: { params: { slug: string } }) {
  return <DocumentationPage slug={params.slug} />;
}
```

### PWA対応

#### next-pwa 設定
```typescript
import withPWA from 'next-pwa';

const nextConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
});
```

この Next.js 設定により、IDO Editor は高性能でスケーラブルなWebアプリケーションとして動作し、継続的な機能拡張に対応できる堅牢な基盤を提供しています。