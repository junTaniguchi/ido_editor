'use client';

import { create } from 'zustand';

interface GisAnalysisState {
  selectedFilePath: string | null;
  selectedColumn: string | null;
  columnCache: Record<string, string[]>;
  setSelectedFilePath: (path: string | null) => void;
  setSelectedColumn: (column: string | null) => void;
  setColumnCache: (path: string, columns: string[]) => void;
  clearColumnCache: (path: string) => void;
  reset: () => void;
}

const initialState: Pick<GisAnalysisState, 'selectedFilePath' | 'selectedColumn' | 'columnCache'> = {
  selectedFilePath: null,
  selectedColumn: null,
  columnCache: {},
};

export const useGisAnalysisStore = create<GisAnalysisState>((set) => ({
  ...initialState,
  setSelectedFilePath: (path) =>
    set(() => ({
      selectedFilePath: path,
      // 選択ファイルが変わったらカラム選択をリセットする
      selectedColumn: null,
    })),
  setSelectedColumn: (column) => set({ selectedColumn: column }),
  setColumnCache: (path, columns) =>
    set((state) => ({ columnCache: { ...state.columnCache, [path]: columns } })),
  clearColumnCache: (path) =>
    set((state) => {
      const next = { ...state.columnCache };
      delete next[path];
      return { columnCache: next };
    }),
  reset: () => set({ ...initialState }),
}));
