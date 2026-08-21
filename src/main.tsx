import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/transitions.css';

// ── Guard 1: Register Service Worker for Offline Sync ──────────────────────
// Re-enabling the PWA service worker to allow offline caching (Background Sync)
// autoUpdate is configured in vite.config.ts, so this will automatically fetch new versions.
import { registerSW } from 'virtual:pwa-register';

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, r) {
      console.log(`Service Worker registered: ${swUrl}`);
    },
    onRegisterError(error) {
      console.error('Service Worker registration error', error);
    },
  });
}

// ── Guard 2: bfcache bust ──────────────────────────────────────────────────
// Browsers restore pages from memory on Back/Forward without re-running JS.
// If the user navigated between gym subdomains, the restored page would have
// the WRONG Firebase instance. Force a reload when restored from bfcache.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

// ── Guard 3: Tenant change detection ──────────────────────────────────────
// If the user navigates from strike.mitrixo.com → golds.mitrixo.com in the
// same browser session, detect the switch and reload once to get a clean
// Firebase state (no cached module singletons from the previous gym).
try {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  const currentTenant = parts.length >= 3 && parts[0] !== 'www' ? (parts[0] ?? 'default') : 'default';
  const lastTenant = sessionStorage.getItem('_mitrixo_tenant');

  if (lastTenant && lastTenant !== currentTenant) {
    // Tenant changed — clear session and reload for a clean init
    sessionStorage.clear();
    sessionStorage.setItem('_mitrixo_tenant', currentTenant);
    window.location.reload();
  } else {
    sessionStorage.setItem('_mitrixo_tenant', currentTenant);
  }
} catch {
  // sessionStorage unavailable (private mode edge case) — continue normally
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
