import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/transitions.css';
import './styles/inzan-theme.css';

// ── Guard 1: Register Service Worker for Offline Sync ──────────────────────
// Re-enabling the PWA service worker to allow offline caching (Background Sync)
// autoUpdate is configured in vite.config.ts, so this will
// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

// A deployed build can leave an already-open tab pointing at an old hashed
// lazy chunk. Reload once so the tab picks up the current index/manifest.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const key = 'mitrixo_chunk_reload_at';
  const lastReload = Number(sessionStorage.getItem(key) || '0');
  if (Date.now() - lastReload > 30000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
});

// Register service worker for PWA features (offline support, caching)
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    const key = 'mitrixo_sw_controller_reload_at';
    const lastReload = Number(sessionStorage.getItem(key) || '0');
    if (Date.now() - lastReload > 30000) {
      refreshing = true;
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  });

  registerSW({
    onNeedRefresh() {
      // Reload occurs on controllerchange when skipWaiting promotes the new SW
    },
    onRegisteredSW(swUrl: any, r: any) {
      console.log(`Service Worker registered: ${swUrl}`);
      if (r && typeof r.update === 'function') {
        const checkUpdate = () => {
          if (document.visibilityState === 'visible') {
            r.update().catch(() => {});
          }
        };
        document.addEventListener('visibilitychange', checkUpdate);
        window.setInterval(checkUpdate, 10 * 60 * 1000);
      }
    },
    onRegisterError(error: any) {
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

import { getTenantId } from './firebase';

// ── Guard 3: Tenant change detection ──────────────────────────────────────
// If the user navigates between gyms in the same browser session,
// detect the switch and reload once to get a clean Firebase state.
try {
  const currentTenant = getTenantId();
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
