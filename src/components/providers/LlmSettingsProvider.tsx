'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { fetchLlmSettings } from '@/lib/llm/llmSettingsClient';
import type { LlmProviderStatus, LlmSettingsStatus } from '@/types/llm';

interface LlmSettingsContextValue {
  settings: LlmSettingsStatus | null;
  loading: boolean;
  error: string | null;
  aiFeaturesEnabled: boolean;
  activeProviderStatus: LlmProviderStatus | null;
  refresh: () => Promise<void>;
  setSettings: (settings: LlmSettingsStatus) => void;
}

const LlmSettingsContext = createContext<LlmSettingsContextValue | null>(null);

export const LlmSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<LlmSettingsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await fetchLlmSettings();
      setSettings(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI設定の取得に失敗しました。';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeProviderStatus = useMemo<LlmProviderStatus | null>(() => {
    if (!settings) {
      return null;
    }

    if (settings.activeProvider === 'openai') {
      return settings.openai;
    }

    if (settings.activeProvider === 'gemini') {
      return settings.gemini;
    }

    return null;
  }, [settings]);

  const aiFeaturesEnabled = Boolean(activeProviderStatus?.hasKey);

  const value = useMemo<LlmSettingsContextValue>(
    () => ({
      settings,
      loading,
      error,
      aiFeaturesEnabled,
      activeProviderStatus,
      refresh,
      setSettings,
    }),
    [settings, loading, error, aiFeaturesEnabled, activeProviderStatus, refresh],
  );

  return <LlmSettingsContext.Provider value={value}>{children}</LlmSettingsContext.Provider>;
};

export function useLlmSettingsContext(): LlmSettingsContextValue {
  const context = useContext(LlmSettingsContext);
  if (!context) {
    throw new Error('useLlmSettingsContext must be used within a LlmSettingsProvider');
  }
  return context;
}
