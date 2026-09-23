import React, { createContext, useContext, useEffect, useState } from 'react';

import { activeConfig, getTenantId } from '../firebase';

const tenantId = (activeConfig as { tenantId?: string }).tenantId || getTenantId();
const themeLocked = tenantId === 'inzanathletics';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  themeLocked: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'crm_theme';

function getInitialTheme(): Theme {
  if (themeLocked) return 'dark';
  // Check localStorage first
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }

  // Fall back to light mode as platform default
  return 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.tenantTheme = tenantId;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  if (!themeLocked) localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    if (themeLocked) return;
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, themeLocked }}>
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
