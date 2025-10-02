'use client';

import { create } from 'zustand';

import type { AnalysisSummary } from '@/lib/llm/analysisSummarizer';

interface GisAnalysisState {
  selectedFilePaths: string[];
  activeFilePath: string | null;
  selectedColumns: Record<string, string | null>;
  columnCache: Record<string, string[]>;
  analysisSummary: AnalysisSummary | null;
  toggleSelectedFilePath: (path: string) => void;
  setActiveFilePath: (path: string | null) => void;
  setSelectedColumn: (path: string, column: string | null) => void;
  setColumnCache: (path: string, columns: string[]) => void;
  clearColumnCache: (path: string) => void;
  setAnalysisSummary: (summary: AnalysisSummary | null) => void;
  reset: () => void;
}

const initialState: Pick<
  GisAnalysisState,
  'selectedFilePaths' | 'activeFilePath' | 'selectedColumns' | 'columnCache' | 'analysisSummary'
> = {
  selectedFilePaths: [],
  activeFilePath: null,
  selectedColumns: {},
  columnCache: {},
  analysisSummary: null,
};

export const useGisAnalysisStore = create<GisAnalysisState>((set) => ({
  ...initialState,
  toggleSelectedFilePath: (path) =>
    set((state) => {
      const exists = state.selectedFilePaths.includes(path);
      let selectedFilePaths = state.selectedFilePaths;
      let activeFilePath = state.activeFilePath;
      const selectedColumns = { ...state.selectedColumns };

      if (exists) {
        selectedFilePaths = state.selectedFilePaths.filter((item) => item !== path);
        delete selectedColumns[path];
        if (activeFilePath === path) {
          activeFilePath = selectedFilePaths[0] ?? null;
        }
      } else {
        selectedFilePaths = [...state.selectedFilePaths, path];
        if (!activeFilePath) {
          activeFilePath = path;
        }
      }

      return {
        selectedFilePaths,
        activeFilePath,
        selectedColumns,
      };
    }),
  setActiveFilePath: (path) =>
    set((state) => {
      if (path === null) {
        return { activeFilePath: null };
      }

      const selectedFilePaths = state.selectedFilePaths.includes(path)
        ? state.selectedFilePaths
        : [...state.selectedFilePaths, path];

      return {
        selectedFilePaths,
        activeFilePath: path,
      };
    }),
  setSelectedColumn: (path, column) =>
    set((state) => ({ selectedColumns: { ...state.selectedColumns, [path]: column } })),
  setColumnCache: (path, columns) =>
    set((state) => ({ columnCache: { ...state.columnCache, [path]: columns } })),
  clearColumnCache: (path) =>
    set((state) => {
      const nextCache = { ...state.columnCache };
      delete nextCache[path];
      const nextColumns = { ...state.selectedColumns };
      delete nextColumns[path];
      return { columnCache: nextCache, selectedColumns: nextColumns };
    }),
  setAnalysisSummary: (summary) => set({ analysisSummary: summary }),
  reset: () => set({ ...initialState }),
}));
