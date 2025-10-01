const LEAFLET_SCRIPT_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_STYLESHEET_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

type LeafletModule = typeof import('leaflet');

declare global {
  interface Window {
    L?: LeafletModule;
  }
}

let leafletPromise: Promise<LeafletModule> | null = null;

const ensureStylesheet = () => {
  if (typeof document === 'undefined') {
    return;
  }

  const existing = document.querySelector('link[data-leaflet-stylesheet="true"]');
  if (existing) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_STYLESHEET_URL;
  link.dataset.leafletStylesheet = 'true';
  document.head.appendChild(link);
};

export const loadLeaflet = async (): Promise<LeafletModule> => {
  if (typeof window === 'undefined') {
    throw new Error('Leafletはブラウザ環境でのみ読み込めます。');
  }

  if (window.L) {
    ensureStylesheet();
    return window.L;
  }

  if (!leafletPromise) {
    leafletPromise = new Promise<LeafletModule>((resolve, reject) => {
      ensureStylesheet();

      const handleLoaded = () => {
        if (window.L) {
          resolve(window.L);
        } else {
          leafletPromise = null;
          reject(new Error('Leafletライブラリの初期化に失敗しました。'));
        }
      };

      const handleError = () => {
        leafletPromise = null;
        reject(new Error('Leafletライブラリの読み込みに失敗しました。'));
      };

      const existingScript = document.querySelector<HTMLScriptElement>('script[data-leaflet-script="true"]');
      if (existingScript) {
        existingScript.addEventListener('load', handleLoaded, { once: true });
        existingScript.addEventListener('error', handleError, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = LEAFLET_SCRIPT_URL;
      script.async = true;
      script.dataset.leafletScript = 'true';
      script.addEventListener('load', handleLoaded, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.head.appendChild(script);
    });
  }

  return leafletPromise;
};

export type { LeafletModule };
