'use client';

import dynamic from 'next/dynamic';

// クライアントサイドのみで動作するようにDynamicインポートを使用
const MainLayoutWithNoSSR = dynamic(
  () => import('@/components/layout/MainLayout'),
  { ssr: false }
);

export default function Home() {
  return <MainLayoutWithNoSSR />;
}
