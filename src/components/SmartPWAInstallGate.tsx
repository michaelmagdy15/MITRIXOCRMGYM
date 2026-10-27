import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Share,
  PlusSquare,
  Download,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '../contexts/SettingsContext';
import { getTenantId } from '../firebase';
import { isStandalonePwaMode } from '../services/browserNotificationService';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __deferredPwaInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function SmartPWAInstallGate() {
  const { branding, features } = useSettings();
  const isSmartPwaEnabled = features?.smartPwaInstaller !== false;
  const [isMobile, setIsMobile] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInAppWebView, setIsInAppWebView] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [forceInstallParam, setForceInstallParam] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showProfileGuide, setShowProfileGuide] = useState(false);

  const tenantId = (typeof window !== 'undefined' ? getTenantId() : 'default').toLowerCase();
  const isInzan =
    tenantId.includes('inzan') ||
    (typeof window !== 'undefined' && window.location.hostname.toLowerCase().includes('inzan')) ||
    (branding?.companyName || '').toLowerCase().includes('inzan');

  const appDisplayName = isInzan
    ? 'INZAN Athletics'
    : branding?.companyName && !branding.companyName.toLowerCase().includes('mitrixo')
    ? branding.companyName
    : 'STRIKE';

  const appIconUrl = isInzan ? '/inzan-pwa-icon.png' : branding?.logoUrl || '/pwa-icon.png';

  const checkEnvironment = useCallback(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const ios =
      /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const mobile = ios || android || window.innerWidth <= 768;

    // Detect if opened inside WhatsApp / Instagram / Facebook / QR Scanner in-app browser
    const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line|Snapchat|MicroMessenger|wv\)/i.test(ua);

    const standalone =
      isStandalonePwaMode() ||
      Boolean((window.navigator as any).standalone) ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      /mitrixogymcrmCRM-Mobile|Strike.*Mobile|Inzan.*Mobile/i.test(ua) ||
      Boolean((window as any).ReactNativeWebView);

    const params = new URLSearchParams(window.location.search);
    const forced = params.get('install') === '1' || params.get('pwa_install') === '1';

    setIsIos(ios);
    setIsAndroid(android);
    setIsMobile(mobile);
    setIsInAppWebView(inApp);
    setIsStandalone(standalone);
    setForceInstallParam(forced);

    if (window.__deferredPwaInstallPrompt) {
      setDeferredPrompt(window.__deferredPwaInstallPrompt);
    }
  }, []);

  useEffect(() => {
    checkEnvironment();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__deferredPwaInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleCustomPwaAvailable = (e: Event) => {
      const customEvt = e as CustomEvent<BeforeInstallPromptEvent>;
      if (customEvt.detail) {
        setDeferredPrompt(customEvt.detail);
      }
    };

    const handleAppInstalled = () => {
      window.__deferredPwaInstallPrompt = null;
      setDeferredPrompt(null);
      setIsStandalone(true);
      toast.success(`${appDisplayName} installed on your Home Screen!`);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-install-available', handleCustomPwaAvailable);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-install-available', handleCustomPwaAvailable);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [checkEnvironment, appDisplayName]);

  // Trigger Android native install prompt automatically on first user gesture if forced via QR
  const handleAndroidInstall = async () => {
    const promptToUse = deferredPrompt || window.__deferredPwaInstallPrompt;
    if (!promptToUse) {
      toast.info(
        'Tap the ⋮ menu in the top-right corner of Chrome and select "Install app" or "Add to Home screen".'
      );
      return;
    }

    setIsInstalling(true);
    try {
      await promptToUse.prompt();
      const choice = await promptToUse.userChoice;
      if (choice.outcome === 'accepted') {
        toast.success(`Installing ${appDisplayName} to your Home Screen...`);
        window.__deferredPwaInstallPrompt = null;
        setDeferredPrompt(null);
        setIsStandalone(true);
      }
    } catch (err) {
      console.warn('[PWA] Install prompt error:', err);
    } finally {
      setIsInstalling(false);
    }
  };

  // Trigger Apple iOS .mobileconfig WebClip Profile Direct Download
  const handleIosProfileInstall = () => {
    setShowProfileGuide(true);
    const tenantQuery = isInzan ? '?tenant=inzanathletics' : '';
    window.location.href = `/api/pwa/ios-profile.mobileconfig${tenantQuery}`;
  };

  const handleCopyLink = () => {
    const cleanUrl = `${window.location.origin}/?install=1`;
    navigator.clipboard.writeText(cleanUrl);
    setCopiedUrl(true);
    toast.success('App link copied! Paste it in Safari or Chrome.');
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  // Never show when disabled via Admin Hub feature flag, on desktop (unless explicitly testing with ?install=1), or when already installed as standalone PWA
  if (!isSmartPwaEnabled && !forceInstallParam) {
    return null;
  }

  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path === '/kiosk' || path === '/checkin') return null;
  }

  if (isStandalone && !forceInstallParam) {
    return null;
  }

  if (!isMobile && !forceInstallParam) {
    return null;
  }

  // Minimized sticky bottom bar so user can still re-open the installer anytime
  if (minimized && !forceInstallParam) {
    return (
      <div className="fixed bottom-3 left-3 right-3 z-[9998] sm:left-auto sm:right-4 sm:w-96 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-zinc-950/95 p-3 text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-white p-1.5 shrink-0 flex items-center justify-center shadow-md">
              <img
                src={appIconUrl}
                alt={appDisplayName}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold truncate">{appDisplayName}</p>
              <p className="text-[11px] text-zinc-400 truncate">
                Install official app to your Home Screen
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setMinimized(false)}
            className="h-9 px-3.5 rounded-xl bg-white text-black hover:bg-zinc-200 font-extrabold text-xs shrink-0"
          >
            Install App
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-between p-5 overflow-y-auto text-white animate-in fade-in duration-300">
      {/* Top Status Pill */}
      <div className="w-full max-w-md flex items-center justify-between pt-[env(safe-area-inset-top,8px)]">
        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider gap-1.5">
          <Sparkles className="h-3 w-3" /> Official Mobile App
        </Badge>
        {!forceInstallParam && (
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="text-[11px] font-semibold text-zinc-400 hover:text-white underline underline-offset-4 px-2 py-1"
          >
            Continue in browser
          </button>
        )}
      </div>

      {/* Main App Card */}
      <div className="w-full max-w-md my-auto py-4 space-y-5">
        {/* App Icon Preview (exact iOS/Android Home Screen Preview) */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <div className="h-24 w-24 rounded-[22px] bg-white p-2.5 shadow-[0_12px_40px_rgba(255,255,255,0.18)] border border-white/20 flex items-center justify-center overflow-hidden">
              <img
                src={appIconUrl}
                alt={appDisplayName}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-lg border-2 border-black">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-white">{appDisplayName}</h1>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
              Add <strong className="text-white">{appDisplayName}</strong> to your Home Screen for
              instant full-screen access, digital check-in QR, class bookings, and live notifications.
            </p>
          </div>
        </div>

        {/* In-App Browser Warning (Instagram / WhatsApp / Facebook) */}
        {isInAppWebView && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
            <p className="text-xs font-extrabold text-amber-300 flex items-center gap-2">
              <ExternalLink className="h-4 w-4 shrink-0" />
              Open in {isIos ? 'Safari' : 'Chrome'} to Install
            </p>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              You are viewing this inside an in-app browser. Tap the{' '}
              <strong className="text-white">•••</strong> menu in the corner and choose{' '}
              <strong className="text-white">
                &ldquo;Open in {isIos ? 'Safari' : 'Browser'}&rdquo;
              </strong>
              , or copy the link below:
            </p>
            <Button
              type="button"
              onClick={handleCopyLink}
              variant="outline"
              className="w-full h-10 rounded-xl border-amber-500/40 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 font-bold text-xs gap-2"
            >
              {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedUrl ? 'Link Copied!' : 'Copy App Install Link'}
            </Button>
          </div>
        )}

        {/* ANDROID ONE-TAP INSTALL */}
        {(isAndroid || (!isIos && deferredPrompt)) && (
          <div className="rounded-2xl border border-white/15 bg-zinc-900/90 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                🤖 Android Instant Install
              </span>
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                No Play Store Needed
              </Badge>
            </div>

            <Button
              type="button"
              disabled={isInstalling}
              onClick={handleAndroidInstall}
              className="w-full h-13 text-sm font-black bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl shadow-lg shadow-emerald-500/25 gap-2"
            >
              <Download className="h-5 w-5" />
              {isInstalling
                ? 'Installing to Home Screen...'
                : `Add ${appDisplayName} to Home Screen`}
            </Button>

            {!deferredPrompt && (
              <div className="rounded-xl bg-black/50 border border-white/10 p-3 space-y-1.5 text-[11px] text-zinc-300">
                <p className="font-bold text-white">Or install from Chrome menu in 2 taps:</p>
                <p>
                  1. Tap the <strong className="text-white">⋮</strong> menu icon at the top-right of
                  Chrome.
                </p>
                <p>
                  2. Tap <strong className="text-white">&ldquo;Install app&rdquo;</strong> or{' '}
                  <strong className="text-white">&ldquo;Add to Home screen&rdquo;</strong>.
                </p>
              </div>
            )}
          </div>
        )}

        {/* IPHONE / IPAD INSTALL (Safari Add to Home Screen + Apple WebClip Profile) */}
        {(isIos || (!isAndroid && !deferredPrompt)) && (
          <div className="rounded-2xl border border-white/15 bg-zinc-900/90 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                🍎 iPhone &amp; iPad Home Screen Setup
              </span>
              <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400">
                iOS Web App
              </Badge>
            </div>

            {/* Method 1: Standard Safari Share -> Add to Home Screen */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 rounded-xl bg-black/60 border border-white/10 p-3">
                <div className="h-8 w-8 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-400 font-black text-xs flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="text-xs">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    Tap the Safari <span className="text-sky-400">Share</span> button{' '}
                    <Share className="h-4 w-4 text-sky-400 inline" />
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Located at the bottom bar of Safari (or inside the ⋯ menu)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-black/60 border border-white/10 p-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="text-xs">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    Tap &ldquo;Add to Home Screen&rdquo;{' '}
                    <PlusSquare className="h-4 w-4 text-emerald-400 inline" />
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Scroll down the share sheet and tap{' '}
                    <strong className="text-white">Add</strong> in the top-right corner
                  </p>
                </div>
              </div>
            </div>

            {/* Method 2: Direct Apple Configuration Profile (.mobileconfig) */}
            <div className="pt-2 border-t border-white/10 space-y-2.5">
              <Button
                type="button"
                onClick={handleIosProfileInstall}
                className="w-full h-11 text-xs font-extrabold bg-white hover:bg-zinc-200 text-black rounded-xl shadow-md gap-2"
              >
                <Smartphone className="h-4 w-4" />
                One-Tap iOS Profile Installer ({appDisplayName} Icon)
              </Button>

              {showProfileGuide && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-[11px] text-sky-100 space-y-1 animate-in fade-in duration-200">
                  <p className="font-extrabold text-sky-300 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Profile Downloaded! Complete in
                    3 seconds:
                  </p>
                  <p>
                    1. Tap <strong>Allow</strong> on the prompt.
                  </p>
                  <p>
                    2. Open your iPhone <strong>Settings</strong> app → tap{' '}
                    <strong>&ldquo;Profile Downloaded&rdquo;</strong> at the top.
                  </p>
                  <p>
                    3. Tap <strong>Install</strong> — the{' '}
                    <strong>{appDisplayName}</strong> app icon will appear on your Home Screen!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {forceInstallParam && (
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => {
                setForceInstallParam(false);
                setMinimized(true);
              }}
              className="text-xs font-semibold text-zinc-400 hover:text-white underline underline-offset-4"
            >
              Already installed? Continue to {appDisplayName} Portal →
            </button>
          </div>
        )}
      </div>

      {/* Animated Bottom Pointer for iOS Safari Share Button */}
      {isIos && !isInAppWebView && (
        <div className="w-full max-w-md flex flex-col items-center pb-[calc(env(safe-area-inset-bottom,12px)+4px)] text-sky-400 animate-bounce">
          <span className="text-[10px] font-extrabold uppercase tracking-widest">
            Tap Safari Share Below
          </span>
          <ArrowDown className="h-5 w-5 mt-0.5" />
        </div>
      )}
    </div>
  );
}
export default SmartPWAInstallGate;
