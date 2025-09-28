'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';

// Applies or removes the `dark` class on <html> based on editorSettings.theme
const ThemeController = () => {
  const { editorSettings } = useEditorStore();
  const isDark = editorSettings.theme === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      document.cookie = 'dataloom-theme=dark; path=/; max-age=31536000';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      document.cookie = 'dataloom-theme=light; path=/; max-age=31536000';
    }
  }, [isDark]);

  return null;
};

export default ThemeController;
