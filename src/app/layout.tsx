import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import ThemeController from "@/components/theme/ThemeController";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DataLoom Studio",
  description: "ブラウザとElectronで動作するデータ分析&ドキュメント統合ワークスペース",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  applicationName: "DataLoom Studio",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get('dataloom-theme')?.value;
  const initialTheme = cookieTheme === 'dark' ? 'dark' : 'light';

  return (
    <html lang="ja" suppressHydrationWarning className={initialTheme === 'dark' ? 'dark' : undefined} data-theme={initialTheme}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Ensure dark mode is applied before hydration using persisted store */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`
          (function(){
            try {
              var cookieMatch = document.cookie.match(/(?:^|; )dataloom-theme=([^;]+)/);
              if (cookieMatch) {
                var themeFromCookie = decodeURIComponent(cookieMatch[1]);
                if (themeFromCookie === 'dark') {
                  document.documentElement.classList.add('dark');
                  document.documentElement.setAttribute('data-theme','dark');
                }
              }
              var raw = localStorage.getItem('editor-storage');
              if (!raw) return;
              var data = JSON.parse(raw);
              var state = data?.state || data; // zustand persist structure
              var theme = state?.editorSettings?.theme;
              if (theme === 'dark') {
                document.documentElement.classList.add('dark');
                document.documentElement.setAttribute('data-theme','dark');
              } else if (theme === 'light') {
                document.documentElement.classList.remove('dark');
                document.documentElement.setAttribute('data-theme','light');
              }
            } catch(e) {
              // noop
            }
          })();
          `}
        </Script>
        {/* Apply dark class on <html> based on persisted setting */}
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
