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
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  }, [isDark]);

  return null;
};

export default ThemeController;
