import { createContext, useContext } from 'react';

export interface EdgeControlOffset {
  offsetX: number;
  offsetY: number;
}

interface EdgeControlContextValue {
  beginEdgeControlAdjustment: (edgeId: string) => void;
  updateEdgeControlPoint: (edgeId: string, offset: EdgeControlOffset | null, options?: { commit?: boolean }) => void;
}

const defaultContext: EdgeControlContextValue = {
  beginEdgeControlAdjustment: () => {},
  updateEdgeControlPoint: () => {},
};

export const EdgeControlContext = createContext<EdgeControlContextValue>(defaultContext);

export const useEdgeControlContext = () => useContext(EdgeControlContext);

export default EdgeControlContext;
