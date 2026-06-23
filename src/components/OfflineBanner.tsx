import React from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export function OfflineBanner() {
  const { isOnline, justCameBackOnline } = useNetworkStatus();

  if (isOnline && !justCameBackOnline) return null;

  if (justCameBackOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          backgroundColor: '#16a34a',
          color: '#fff',
          textAlign: 'center',
          padding: '8px 16px',
          fontSize: '14px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        <span>✅</span>
        <span>Back online — syncing your local changes automatically…</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: '#b45309',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: '14px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}
    >
      <span>📴</span>
      <span>
        Offline — your changes are saved locally and will sync automatically when you reconnect.
      </span>
    </div>
  );
}
