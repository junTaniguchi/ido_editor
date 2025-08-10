declare module 'react-plotly.js' {
  import * as Plotly from 'plotly.js';
  import * as React from 'react';

  interface PlotParams {
    data: Plotly.Data[];
    layout?: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    frames?: Plotly.Frame[];
    style?: React.CSSProperties;
    className?: string;
    onInitialized?: (figure: Plotly.Figure, graphDiv: HTMLElement) => void;
    onUpdate?: (figure: Plotly.Figure, graphDiv: HTMLElement) => void;
    onPurge?: (figure: Plotly.Figure, graphDiv: HTMLElement) => void;
    onError?: (err: Error) => void;
    onClickAnnotation?: (event: Plotly.ClickAnnotationEvent) => void;
    onClick?: (event: Plotly.PlotMouseEvent) => void;
    onDoubleClick?: (event: Plotly.PlotMouseEvent) => void;
    onHover?: (event: Plotly.PlotMouseEvent) => void;
    onUnHover?: (event: Plotly.PlotMouseEvent) => void;
    onSelected?: (event: Plotly.PlotSelectionEvent) => void;
    onSelecting?: (event: Plotly.PlotSelectionEvent) => void;
    onRestyle?: (data: any) => void;
    onRelayout?: (layout: any) => void;
    onRedraw?: () => void;
    onAnimated?: () => void;
    onAnimatingFrame?: (event: { name: string; frame: Plotly.Frame; animation: {
      frame: { duration: number; redraw: boolean; };
      transition: { duration: number; easing: string; };
    } }) => void;
    onAfterExport?: () => void;
    onAfterPlot?: () => void;
    onAutoSize?: () => void;
    onBeforeExport?: () => void;
    onButtonClicked?: (event: Plotly.ButtonClickEvent) => void;
    onClickAnnotations?: (event: Plotly.ClickAnnotationEvent) => void;
    onDeselect?: () => void;
    onDoubleClickAnnotations?: (event: Plotly.ClickAnnotationEvent) => void;
    onFramework?: () => void;
    onLegendClick?: (event: Plotly.LegendClickEvent) => boolean;
    onLegendDoubleClick?: (event: Plotly.LegendClickEvent) => boolean;
    onRelayouting?: () => void;
    onRestyling?: () => void;
    onTransitioning?: () => void;
    onTransitionInterrupted?: () => void;
  }

  class Plot extends React.Component<PlotParams> {}

  export default Plot;
}
