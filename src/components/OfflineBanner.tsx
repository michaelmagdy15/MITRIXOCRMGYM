import React, { useState, useEffect } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { onOutboxChange } from '../services/outboxService';
import { Wifi, WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const { isOnline, justCameBackOnline } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    const unsubscribe = onOutboxChange((count) => {
      setPendingCount(count);
    });
    return unsubscribe;
  }, []);

  if (isOnline && !justCameBackOnline) return null;

  if (justCameBackOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-[calc(0.75rem+var(--safe-top))] left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-emerald-500/90 dark:bg-emerald-600/90 backdrop-blur-md text-white border border-emerald-400/30 px-4 py-2.5 rounded-full shadow-lg text-xs font-bold tracking-wide uppercase animate-in fade-in slide-in-from-top-4 duration-300"
      >
        <Wifi className="h-4 w-4 animate-bounce" />
        <span>Back online — Syncing {pendingCount} local change(s)…</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-[calc(0.75rem+var(--safe-top))] left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-amber-500/95 dark:bg-amber-600/95 backdrop-blur-md text-white border border-amber-400/30 px-4 py-2.5 rounded-full shadow-lg text-xs font-bold tracking-wide uppercase animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <WifiOff className="h-4 w-4 animate-pulse" />
      <span>Offline Mode — {pendingCount} change(s) saved locally</span>
    </div>
  );
}
