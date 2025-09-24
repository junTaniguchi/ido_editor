'use client';

let mermaidInitialized = false;
let mermaidInstance: any = null;
let mermaidInitializationPromise: Promise<any> | null = null;

const DEFAULT_INITIALIZE_OPTIONS = {
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose' as const,
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  logLevel: 'error' as const,
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    curve: 'basis',
  },
  sequence: {
    useMaxWidth: false,
    diagramMarginX: 50,
    diagramMarginY: 30,
    actorMargin: 50,
    width: 150,
    height: 65,
    boxMargin: 10,
    boxTextMargin: 5,
    noteMargin: 10,
    messageMargin: 35,
  },
  gantt: {
    useMaxWidth: false,
  },
  er: {
    useMaxWidth: false,
  },
  class: {
    useMaxWidth: false,
  },
  state: {
    useMaxWidth: false,
  },
  pie: {
    useMaxWidth: false,
  },
  suppressErrorRendering: true,
};

export const initializeMermaid = async (retryCount = 0): Promise<any> => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (mermaidInstance) {
    return mermaidInstance;
  }

  if (!mermaidInitializationPromise) {
    mermaidInitializationPromise = (async () => {
      const mermaidModule = await import('mermaid');
      const mermaid = (mermaidModule as any).default ?? mermaidModule;

      if (!mermaidInitialized) {
        mermaid.initialize(DEFAULT_INITIALIZE_OPTIONS);
        mermaidInitialized = true;
      }

      mermaidInstance = mermaid;
      return mermaid;
    })();
  }

  try {
    return await mermaidInitializationPromise;
  } catch (error) {
    console.error('Mermaid initialization failed:', error);

    if (retryCount < 3) {
      mermaidInitialized = false;
      mermaidInstance = null;
      mermaidInitializationPromise = null;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return initializeMermaid(retryCount + 1);
    }

    mermaidInitializationPromise = null;
    throw error;
  }
};

export const resetMermaidInstance = () => {
  mermaidInitialized = false;
  mermaidInstance = null;
  mermaidInitializationPromise = null;
};

