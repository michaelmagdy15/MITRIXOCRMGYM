import { doc, setDoc } from 'firebase/firestore';
import { db, getTenantId } from '../firebase';

let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      sharedAudioCtx = new AudioContextClass();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

/**
 * Attaches one-time pointer/keyboard listeners so the browser's Web Audio API
 * is unlocked on the very first user gesture on both desktop and mobile browsers.
 */
export function initGlobalAudioUnlock(): void {
  if (typeof window === 'undefined' || audioUnlocked) return;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    audioUnlocked = true;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

/**
 * Plays a clear, pleasant multi-tone notification ping on desktop and mobile browsers
 * using Web Audio API synthesis (zero external audio file dependencies).
 * Also triggers gentle haptic vibration on supported mobile devices.
 */
export function playBrowserNotificationPing(variant: 'default' | 'urgent' = 'default'): void {
  if (typeof window === 'undefined') return;

  // Trigger mobile vibration if supported
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(variant === 'urgent' ? [200, 100, 200] : [140, 70, 140]);
    }
  } catch {
    // Ignore vibration errors on unsupported browsers
  }

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(variant === 'urgent' ? 0.28 : 0.22, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + (variant === 'urgent' ? 0.85 : 0.65));
    masterGain.connect(ctx.destination);

    const notes = variant === 'urgent' ? [784, 987.77, 1174.66, 1567.98] : [880, 1174.66, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const startTime = now + idx * 0.11;
      osc.frequency.setValueAtTime(freq, startTime);
      osc.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + 0.19);
    });
  } catch (err) {
    console.warn('[BrowserNotification] Audio ping suppressed by browser policy:', err);
  }
}

export function isIosBrowserDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS;
}

export function isStandalonePwaMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    /mitrixogymcrmCRM-Mobile/i.test(navigator.userAgent || '')
  );
}

export function isMobileBrowserDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

function getBrandTitlePrefix(): string {
  try {
    const t = getTenantId().toLowerCase();
    if (t.includes('inzan')) return 'INZAN Athletics';
    if (t.includes('strike')) return 'STRIKE';
  } catch {
    // ignore
  }
  return 'Gym Notification';
}

/**
 * Fires a native OS / Browser notification (via ServiceWorker registration on mobile
 * or window.Notification on desktop) + audible ping.
 */
export async function showBrowserNotificationWithPing(params: {
  id: string;
  title: string;
  body: string;
  urgent?: boolean;
  onClickUrl?: string;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  // Deduplicate within session so the same notification ID never double-pings
  const dedupeKey = `_notified_ping_${params.id}`;
  try {
    if (sessionStorage.getItem(dedupeKey)) return;
    sessionStorage.setItem(dedupeKey, '1');
  } catch {
    // ignore sessionStorage restrictions
  }

  // Always play audible ping on desktop & mobile
  playBrowserNotificationPing(params.urgent ? 'urgent' : 'default');

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const brand = getBrandTitlePrefix();
  const fullTitle = params.title.toLowerCase().includes(brand.toLowerCase())
    ? params.title
    : `${brand}: ${params.title}`;

  const options: NotificationOptions = {
    body: params.body,
    tag: `mitrixo_${params.id}`,
    requireInteraction: Boolean(params.urgent),
    data: {
      id: params.id,
      url: params.onClickUrl || window.location.href,
    },
  };

  try {
    // Mobile Chrome / Android & iOS PWA require ServiceWorkerRegistration.showNotification
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(fullTitle, options);
        return;
      }
    }
  } catch {
    // Fallback to standard Notification constructor below
  }

  try {
    const notif = new Notification(fullTitle, options);
    notif.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      notif.close();
    };
  } catch (err) {
    console.warn('[BrowserNotification] Could not display OS notification:', err);
  }
}

/**
 * Requests browser Notification permission (must be called from a user tap/click handler)
 * and persists the granted status to Firestore for the current user & member record.
 */
export async function requestAndPersistBrowserNotifications(params: {
  userId?: string;
  clientRecordId?: string;
}): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      playBrowserNotificationPing('default');
      await showBrowserNotificationWithPing({
        id: `welcome_notif_${Date.now()}`,
        title: 'Notifications Enabled!',
        body: 'You will now receive instant alerts and sound pings on this device.',
      });
    }

    if (params.userId) {
      const nowIso = new Date().toISOString();
      const deviceMeta = {
        browserNotificationsEnabled: permission === 'granted',
        browserNotificationPermission: permission,
        browserNotificationUpdatedAt: nowIso,
        lastBrowserUserAgent: navigator.userAgent || '',
        notificationPreferences: {
          pushNotifications: true,
          classReminders: true,
          sessionUpdates: true,
        },
      };

      await setDoc(doc(db, 'users', params.userId), deviceMeta, { merge: true }).catch((err) => {
        console.warn('[BrowserNotification] Could not save status to user doc:', err);
      });

      if (params.clientRecordId) {
        await setDoc(
          doc(db, 'clients', params.clientRecordId),
          {
            browserNotificationsEnabled: permission === 'granted',
            browserNotificationPermission: permission,
            browserNotificationUpdatedAt: nowIso,
          },
          { merge: true }
        ).catch((err) => {
          console.warn('[BrowserNotification] Could not save status to client doc:', err);
        });
      }
    }

    return permission;
  } catch (err) {
    console.error('[BrowserNotification] Error requesting permission:', err);
    return Notification.permission;
  }
}
