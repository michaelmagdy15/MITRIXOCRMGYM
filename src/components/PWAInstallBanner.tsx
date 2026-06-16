import React, { useEffect, useRef, useState } from 'react';
import { X, Share } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'android' | 'ios' | 'other';

// ── Helpers ───────────────────────────────────────────────────────────────────
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as any).standalone === true) ||
    /mitrixogymcrmCRM-Mobile/i.test(navigator.userAgent)
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PWAInstallBanner() {
  const [platform] = useState<Platform>(detectPlatform);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Already installed — never show
    if (isInStandaloneMode()) return;
    // Already dismissed this session
    if (sessionStorage.getItem('pwa-dismissed')) return;

    if (platform === 'android') {
      const handler = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        setTimeout(() => triggerAndroidPrompt(), 1500);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }

    if (platform === 'ios') {
      const t = setTimeout(() => setShowIosBanner(true), 2000);
      return () => clearTimeout(t);
    }

    return undefined;
  }, [platform]);

  const triggerAndroidPrompt = async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    await deferredPrompt.current.userChoice;
    deferredPrompt.current = null;
  };

  const dismiss = () => {
    setShowIosBanner(false);
    setDismissed(true);
    sessionStorage.setItem('pwa-dismissed', '1');
  };

  if (dismissed || !showIosBanner) return null;

  // ── iOS guide banner (iOS 18+ Safari UI) ─────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '16px 20px 36px',
        background: 'linear-gradient(135deg, #111 0%, #1a1a1a 100%)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        animation: 'slideUp 0.35s cubic-bezier(.22,1,.36,1)',
      }}
    >
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        .pwa-bounce { animation: bounce 1.4s ease-in-out infinite; }
      `}</style>

      {/* Close */}
      <button
        onClick={dismiss}
        style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 4 }}
      >
        <X size={18} />
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Logo — white bg, small, properly padded */}
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 5,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>
          <img
            src="/mitrixogymcrmlogo.png"
            alt="mitrixogymcrm"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: '0.02em' }}>Add mitrixogymcrm to your Home Screen</div>
          <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>Access your portal like a native app — no App Store needed</div>
        </div>
      </div>

      {/* Steps — updated for iOS 18+ Safari */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        <Step
          n={1}
          icon={<span style={{ fontSize: 15 }}>⋯</span>}
          label='Tap the "⋯" button'
          sub='bottom-right corner of Safari'
        />

        <Step
          n={2}
          icon={<Share size={14} color="#fff" />}
          label='Tap "Share"'
          sub='in the menu that appears'
        />

        <Step
          n={3}
          icon={<span style={{ fontSize: 14 }}>📋</span>}
          label='Tap "View More…"'
          sub='bottom-right of the share sheet'
        />

        <Step
          n={4}
          icon={<span style={{ fontSize: 14 }}>➕</span>}
          label='"Add to Home Screen"'
          sub='find it in the list, then tap Add'
        />

      </div>

      {/* Animated arrow pointing to bottom-right (where ⋯ button lives) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 12, paddingTop: 2 }}>
        <div className="pwa-bounce" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: '#e5b94e' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Start here</span>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 2v14M4 10l6 6 6-6" stroke="#e5b94e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Step({ n, icon, label, sub }: { n: number; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: '#e5b94e',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#000', fontWeight: 800, fontSize: 12, flexShrink: 0,
      }}>{n}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', minWidth: 18 }}>{icon}</span>
        <div>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{label}</div>
          <div style={{ color: '#666', fontSize: 10 }}>{sub}</div>
        </div>
      </div>
    </div>
  );
}
