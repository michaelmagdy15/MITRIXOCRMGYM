import { useState, useEffect } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  justCameBackOnline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [justCameBackOnline, setJustCameBackOnline] = useState(false);

  useEffect(() => {
    let flashTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      setJustCameBackOnline(true);
      flashTimer = setTimeout(() => setJustCameBackOnline(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustCameBackOnline(false);
      if (flashTimer) clearTimeout(flashTimer);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (flashTimer) clearTimeout(flashTimer);
    };
  }, []);

  return { isOnline, justCameBackOnline };
}
