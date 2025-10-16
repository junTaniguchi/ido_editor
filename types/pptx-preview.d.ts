declare module 'pptx-preview' {
  interface InitOptions {
    width?: number | string;
    height?: number | string;
  }

  interface PptxViewer {
    preview: (data: ArrayBuffer) => Promise<void> | void;
    destroy?: () => void;
  }

  export function init(container: HTMLElement, options?: InitOptions): PptxViewer;
}
