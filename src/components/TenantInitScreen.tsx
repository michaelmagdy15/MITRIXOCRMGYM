import React from 'react';

/**
 * TenantInitScreen
 *
 * Shown immediately on page load — before any Firestore data arrives.
 * Reads the gym identity directly from the URL subdomain (zero latency)
 * and displays a branded loading screen so users always know which gym
 * they are loading. Fades out once `ready` becomes true.
 */
interface TenantInitScreenProps {
  ready: boolean;
  children: React.ReactNode;
}

function getTenantLabel(): string {
  try {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') {
      // Capitalize and clean up: "strike" → "Strike", "golds-gym" → "Golds Gym"
      return (parts[0] ?? '')
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'Local Dev';
  } catch {
    // non-browser env
  }
  return 'Mitrixo';
}

export function TenantInitScreen({ ready, children }: TenantInitScreenProps) {
  const [hidden, setHidden] = React.useState(false);
  const gymLabel = React.useMemo(() => getTenantLabel(), []);

  React.useEffect(() => {
    if (!ready) return;
    // Short delay so the fade-out is visible (not a jarring jump)
    const timer = setTimeout(() => setHidden(true), 600);
    return () => clearTimeout(timer);
  }, [ready]);

  return (
    <>
      {children}

      {/* Overlay — sits above app content until ready */}
      {!hidden && (
        <div
          role="status"
          aria-label={`Loading ${gymLabel}`}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            backgroundColor: '#0a0a0a',
            transition: ready ? 'opacity 0.5s ease' : 'none',
            opacity: ready ? 0 : 1,
            pointerEvents: ready ? 'none' : 'all',
          }}
        >
          {/* Gym name — derived instantly from URL, no Firestore needed */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '3px',
                textTransform: 'uppercase',
                color: '#555',
                marginBottom: '8px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              Loading
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: '#f0f0f0',
                letterSpacing: '-0.5px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              {gymLabel}
            </div>
          </div>

          {/* Spinner */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '2px solid #333',
              borderTopColor: '#f0f0f0',
              animation: 'mitrixo-spin 0.8s linear infinite',
            }}
          />

          <style>{`
            @keyframes mitrixo-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
