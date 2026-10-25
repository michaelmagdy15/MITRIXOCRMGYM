import React, { useState, useEffect } from 'react';
import { BellRing, Share, PlusSquare, CheckCircle2, Volume2, Smartphone, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { getTenantId } from '../firebase';
import {
  initGlobalAudioUnlock,
  isIosBrowserDevice,
  isMobileBrowserDevice,
  isStandalonePwaMode,
  playBrowserNotificationPing,
  requestAndPersistBrowserNotifications,
} from '../services/browserNotificationService';
import { toast } from 'sonner';

export function NotificationEnforcementGate() {
  const { currentUser } = useAuth();
  const { branding } = useSettings();

  // Declare all useState hooks at the top before any useEffect (prevents TDZ issues)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  const [minimizedToBanner, setMinimizedToBanner] = useState<boolean>(false);

  const tenantId = getTenantId();
  const brandName =
    branding?.companyName && !branding.companyName.toLowerCase().includes('mitrixo')
      ? branding.companyName
      : tenantId.toLowerCase().includes('inzan')
      ? 'INZAN Athletics'
      : 'STRIKE';

  useEffect(() => {
    initGlobalAudioUnlock();
    const mobile = isMobileBrowserDevice();
    const ios = isIosBrowserDevice();
    const standalone = isStandalonePwaMode();
    setIsMobile(mobile);
    setIsIos(ios);
    setIsStandalone(standalone);

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    } else {
      setPermission('unsupported');
    }
  }, [currentUser?.id]);

  // Automatically sync granted status to Firestore if already granted
  useEffect(() => {
    if (!currentUser?.id || permission !== 'granted') return;
    const syncedKey = `_notif_synced_${currentUser.id}`;
    try {
      if (sessionStorage.getItem(syncedKey)) return;
      sessionStorage.setItem(syncedKey, '1');
    } catch {
      // ignore
    }
    requestAndPersistBrowserNotifications({
      userId: currentUser.id,
      clientRecordId: currentUser.clientDocId || currentUser.clientRecordId || undefined,
    }).catch(() => {});
  }, [currentUser?.id, currentUser?.clientDocId, currentUser?.clientRecordId, permission]);

  // Do not show on Kiosk, Check-in, or unauthenticated screens
  if (!currentUser?.id) return null;
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path === '/kiosk' || path === '/checkin') return null;
    // Native Expo wrapper already manages native push tokens directly
    if (/mitrixogymcrmCRM-Mobile/i.test(navigator.userAgent || '')) return null;
  }

  // Once permission is granted, hide the enforcement gate completely
  if (permission === 'granted') {
    return null;
  }

  const handleEnableClick = async () => {
    setIsRequesting(true);
    try {
      // Play immediate sound ping on tap so user gesture unlocks Web Audio API
      playBrowserNotificationPing('default');

      const result = await requestAndPersistBrowserNotifications({
        userId: currentUser.id,
        clientRecordId: currentUser.clientDocId || currentUser.clientRecordId || undefined,
      });
      setPermission(result);

      if (result === 'granted') {
        toast.success(`${brandName} live notifications & sound alerts enabled!`);
      } else if (result === 'denied') {
        toast.error(
          'Notifications are blocked in your browser settings. Tap the lock icon in your address bar to Allow Notifications.'
        );
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const iosNeedsHomeScreen = isIos && !isStandalone && permission === 'unsupported';

  // Full-screen Mandatory Modal on Mobile Devices (or when not minimized)
  if (isMobile && !minimizedToBanner) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-card text-card-foreground shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600/20 via-primary/15 to-emerald-600/10 p-5 border-b border-border/60 flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <BellRing className="h-6 w-6 text-emerald-400 animate-bounce" />
            </div>
            <div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] mb-1">
                REQUIRED FOR MOBILE ACCESS
              </Badge>
              <h2 className="text-base font-extrabold tracking-tight text-foreground">
                Enable {brandName} Live Alerts
              </h2>
            </div>
          </div>

          <div className="p-5 space-y-4 text-xs">
            <p className="text-muted-foreground leading-relaxed">
              To receive instant <strong className="text-foreground">club announcements, class reminders, booking confirmations, and live sound alerts</strong> on your phone, please turn on notifications below.
            </p>

            {iosNeedsHomeScreen ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5">
                <p className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                  <Smartphone className="h-4 w-4 shrink-0" />
                  iPhone / iOS Safari Quick Setup (2 Steps):
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-[11px]">
                  <li>
                    Tap the <strong className="text-foreground">Share</strong> icon{' '}
                    <Share className="inline h-3.5 w-3.5 text-sky-400 mx-0.5" /> at the bottom of Safari.
                  </li>
                  <li>
                    Select <strong className="text-foreground">&ldquo;Add to Home Screen&rdquo;</strong>{' '}
                    <PlusSquare className="inline h-3.5 w-3.5 text-emerald-400 mx-0.5" /> and open the {brandName} app icon to unlock full iOS lock-screen push notifications.
                  </li>
                </ol>
                <Button
                  type="button"
                  onClick={() => {
                    playBrowserNotificationPing('default');
                    setMinimizedToBanner(true);
                    toast.success('Live in-app sound & popup alerts are active for this session!');
                  }}
                  className="w-full h-11 font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl mt-2 gap-2"
                >
                  <Volume2 className="h-4 w-4" />
                  Activate Live Sound &amp; In-App Alerts Now
                </Button>
              </div>
            ) : permission === 'denied' ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-2">
                <p className="font-bold text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Browser Notifications Currently Blocked
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Tap the <strong className="text-foreground">Lock / Tune icon</strong> next to the website address at the top of your browser, set <strong className="text-foreground">Notifications → Allow</strong>, then tap Retry below.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    onClick={handleEnableClick}
                    className="flex-1 h-10 font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl"
                  >
                    Retry Permission
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      playBrowserNotificationPing('default');
                      setMinimizedToBanner(true);
                    }}
                    className="h-10 text-xs rounded-xl"
                  >
                    Use Sound Alerts Only
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                <Button
                  type="button"
                  disabled={isRequesting}
                  onClick={handleEnableClick}
                  className="w-full h-12 text-sm font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-600/25 gap-2"
                >
                  <BellRing className="h-4 w-4" />
                  {isRequesting ? 'Requesting Permission...' : 'Tap to Enable Notifications & Sound'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Persistent Top Bar on Desktop Browsers (or minimized mobile state) until granted
  return (
    <div className="w-full bg-gradient-to-r from-emerald-950/90 via-zinc-900 to-emerald-950/90 border-b border-emerald-500/30 px-3 py-2 text-xs text-white flex flex-wrap items-center justify-between gap-2 z-50">
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-6 w-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
          <BellRing className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
        </span>
        <span className="font-semibold truncate">
          {iosNeedsHomeScreen
            ? `iPhone Tip: Tap Share → "Add to Home Screen" for lock-screen push. Live sound ping is active!`
            : `Enable ${brandName} instant browser notifications & audible sound pings so you never miss an alert.`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!iosNeedsHomeScreen && permission !== 'unsupported' && (
          <Button
            type="button"
            size="sm"
            disabled={isRequesting}
            onClick={handleEnableClick}
            className="h-7 px-3 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {permission === 'denied' ? 'Unblock Alerts' : 'Enable Notifications & Sound'}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            playBrowserNotificationPing('default');
            toast.success('Notification sound ping tested & active!');
          }}
          className="h-7 px-2.5 text-[11px] border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 rounded-lg gap-1"
        >
          <Volume2 className="h-3 w-3" />
          Test Ping
        </Button>
      </div>
    </div>
  );
}
