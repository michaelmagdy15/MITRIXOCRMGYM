import React, { createContext, useContext, useEffect, useState } from 'react';

import { activeConfig, getTenantId } from '../firebase';

const tenantId = (activeConfig as { tenantId?: string }).tenantId || getTenantId();
const themeLocked = false;

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  themeLocked: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'crm_theme';

function getInitialTheme(): Theme {
  // Check localStorage first
  const stored = typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEY) as Theme | null) : null;
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }

  // Fall back to light mode as platform default
  return 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.tenantTheme = tenantId;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, theme);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light');
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, themeLocked }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
