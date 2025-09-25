import { createContext, useContext } from 'react';

export type EdgeHandleOrientation = 'vertical' | 'horizontal';

export const EdgeHandleOrientationContext = createContext<EdgeHandleOrientation>('vertical');

export const useEdgeHandleOrientation = (): EdgeHandleOrientation => useContext(EdgeHandleOrientationContext);
