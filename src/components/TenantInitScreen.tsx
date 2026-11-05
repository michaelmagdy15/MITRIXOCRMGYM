import React from 'react';

/**
 * Universal TenantInitScreen
 *
 * Shown during initial application bootstrap before Firebase Auth resolves.
 * Matches 1:1 with the high-end preloader in index.html to guarantee a unified,
 * premium branded loading experience across desktop, tablet, and mobile.
 * Completely eliminates ugly plain text spinners for both Inzan Athletics and Strike.
 */
interface TenantInitScreenProps {
  ready: boolean;
  children: React.ReactNode;
}

interface TenantBrandConfig {
  id: 'inzanathletics' | 'strike' | 'other';
  title: string;
  logo: string;
  glow: string;
  barGradient: string;
  barShadow: string;
  bgColor: string;
}

function resolveTenantBrand(): TenantBrandConfig {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = (params.get('tenant') || '').toLowerCase();
    const host = window.location.hostname.toLowerCase();
    const cfgTenant = ((window as any).__FIREBASE_CONFIG__?.tenantId || '').toLowerCase();
    const isInzan = cfgTenant === 'inzanathletics' || t === 'inzan' || t === 'inzanathletics' || host.includes('inzan');
    const isStrike = !isInzan && (cfgTenant === 'strike' || t === 'strike' || host.includes('strike') || host.includes('strike-egy') || host.includes('strikeboxing'));

    if (isInzan) {
      return {
        id: 'inzanathletics',
        title: 'INZAN ATHLETICS',
        logo: '/inzanlogo_white.png',
        glow: 'radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, rgba(16, 185, 129, 0.08) 50%, transparent 70%)',
        barGradient: 'linear-gradient(90deg, transparent, #10b981, #ffffff, #10b981, transparent)',
        barShadow: '0 0 10px #10b981',
        bgColor: '#08080a',
      };
    }

    if (isStrike) {
      return {
        id: 'strike',
        title: 'STRIKE BOXING CLUB',
        logo: '/strikelogo_white.png',
        glow: 'radial-gradient(circle, rgba(225, 29, 72, 0.32) 0%, rgba(225, 29, 72, 0.08) 50%, transparent 70%)',
        barGradient: 'linear-gradient(90deg, transparent, #e11d48, #ffffff, #e11d48, transparent)',
        barShadow: '0 0 10px #e11d48',
        bgColor: '#050507',
      };
    }

    // Generic / Fallback tenant
    const parts = host.split('.');
    let name = 'Mitrixo';
    if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'admin' && parts[0] !== 'app') {
      name = (parts[0] ?? '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return {
      id: 'other',
      title: name.toUpperCase(),
      logo: '/favicon.png',
      glow: 'radial-gradient(circle, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 50%, transparent 70%)',
      barGradient: 'linear-gradient(90deg, transparent, #ffffff, #888888, transparent)',
      barShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
      bgColor: '#0a0a0a',
    };
  } catch {
    return {
      id: 'other',
      title: 'MITRIXO CRM',
      logo: '/favicon.png',
      glow: 'radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
      barGradient: 'linear-gradient(90deg, transparent, #ffffff, #888888, transparent)',
      barShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
      bgColor: '#0a0a0a',
    };
  }
}

export function TenantInitScreen({ ready, children }: TenantInitScreenProps) {
  const [hidden, setHidden] = React.useState(false);
  const brand = React.useMemo(() => resolveTenantBrand(), []);

  React.useEffect(() => {
    if (!ready) return;
    // Dismiss any native HTML splash in parallel
    if (typeof window !== 'undefined' && typeof (window as any).__dismissMobileSplash === 'function') {
      (window as any).__dismissMobileSplash(true);
    }
    // Fade out smoothly
    const timer = setTimeout(() => setHidden(true), 500);
    return () => clearTimeout(timer);
  }, [ready]);

  return (
    <>
      {children}

      {!hidden && (
        <div
          role="status"
          aria-label={`Loading ${brand.title}`}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99998,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: brand.bgColor,
            padding: 'calc(env(safe-area-inset-top, 40px) + 30px) 24px calc(env(safe-area-inset-bottom, 24px) + 36px)',
            boxSizing: 'border-box',
            transition: ready ? 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s ease' : 'none',
            opacity: ready ? 0 : 1,
            transform: ready ? 'scale(1.02)' : 'scale(1)',
            pointerEvents: ready ? 'none' : 'all',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {/* Subtle Ambient Radial Overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.95) 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* Centered Logo with Animated Ambient Halo */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              width: '100%',
              maxWidth: '340px',
              zIndex: 2,
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: '240px',
                height: '240px',
                background: brand.glow,
                borderRadius: '50%',
                filter: 'blur(32px)',
                animation: 'tenantGlowPulse 2.4s ease-in-out infinite alternate',
                pointerEvents: 'none',
              }}
            />
            <img
              src={brand.logo}
              alt={brand.title}
              style={{
                position: 'relative',
                zIndex: 1,
                width: '210px',
                maxWidth: '75vw',
                height: 'auto',
                maxHeight: '145px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 14px 28px rgba(0,0,0,0.85)) drop-shadow(0 0 16px rgba(255,255,255,0.15))',
                animation: 'tenantLogoFloat 2.4s ease-in-out infinite alternate',
              }}
            />
          </div>

          {/* Sleek Animated Progress Bar & Tagline */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
              width: '100%',
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: '140px',
                height: '3px',
                background: 'rgba(255, 255, 255, 0.14)',
                borderRadius: '9999px',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: '40%',
                  background: brand.barGradient,
                  borderRadius: '9999px',
                  boxShadow: brand.barShadow,
                  animation: 'tenantBarFill 1.6s ease-in-out infinite',
                }}
              />
            </div>

            <div
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.38em',
                textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.65)',
                marginLeft: '0.38em',
              }}
            >
              {brand.title}
            </div>
          </div>

          <style>{`
            @keyframes tenantLogoFloat {
              0% { transform: translateY(0) scale(1); }
              100% { transform: translateY(-4px) scale(1.02); }
            }
            @keyframes tenantGlowPulse {
              0% { opacity: 0.45; transform: scale(0.9); }
              100% { opacity: 1; transform: scale(1.2); }
            }
            @keyframes tenantBarFill {
              0% { left: -45%; width: 35%; }
              50% { left: 35%; width: 50%; }
              100% { left: 110%; width: 35%; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
