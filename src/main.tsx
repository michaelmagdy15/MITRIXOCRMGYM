import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/transitions.css';

// ── Guard 1: Unregister any lingering service workers ──────────────────────
// PWA was removed; make sure no stale SW serves cached pages to users.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => reg.unregister());
  }).catch(() => { /* ignore — non-critical */ });
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
