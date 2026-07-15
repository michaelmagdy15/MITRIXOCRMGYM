import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { BrandingSettings, SalesTarget, Branch, FeatureFlags, StorefrontConfig } from '../types';
import { auth } from '../firebase';
import { addAuditLog } from '../services/auditService';


const DEFAULT_ACCENT = '#1a1a1a';

function applyBrandAccent(hex?: string) {
  try {
    const color = hex || DEFAULT_ACCENT;
    document.documentElement.style.setProperty('--brand-accent', color);
    document.documentElement.style.setProperty('--brand-accent-muted', color + '26');
  } catch {
    // silently ignore — CSS fallback default applies
  }
}

interface SettingsContextType {
  branding: BrandingSettings;
  updateBranding: (branding: Partial<BrandingSettings>) => Promise<void>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  salesTarget: SalesTarget;
  updateSalesTarget: (target: number, ptTarget?: number, classesTarget?: number, membershipsTarget?: number) => Promise<void>;
  setSalesTarget: React.Dispatch<React.SetStateAction<SalesTarget>>;
  branches: Branch[];
  updateBranches: (branches: Branch[]) => Promise<void>;
  commissionRates: { ptRate: number; groupRate: number };
  updateCommissionRates: (rates: { ptRate: number; groupRate: number }) => Promise<void>;
  features: FeatureFlags;
  updateFeatures: (updates: Partial<FeatureFlags>) => Promise<void>;
  storefrontConfig: StorefrontConfig;
  updateStorefrontConfig: (config: Partial<StorefrontConfig>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode; isAuthenticated?: boolean; role?: string }> = ({ children, isAuthenticated = false, role }) => {
  const [branding, setBranding] = useState<BrandingSettings>({
    companyName: 'mitrixogymcrm',
    logoUrl: '',
    currencyCode: 'EGP',
    currencySymbol: 'LE'
  });
  const [isBrandingLoaded, setIsBrandingLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [salesTarget, setSalesTarget] = useState<SalesTarget>({
    targetAmount: 50000,
    currentAmount: 0,
    privatePackagesSold: 0,
    groupPackagesSold: 0,
  });
  const [branches, setBranches] = useState<Branch[]>(['Maxim Compound', 'Mivida Compound', 'Impact by Strike']);
  const [commissionRates, setCommissionRates] = useState({ ptRate: 8, groupRate: 5 });
  const [features, setFeatures] = useState<FeatureFlags>({
    leads: true,
    ptPackages: false,
    payments: true,
    attendance: true,
    reports: true,
    quotes: true,
    operations: true,
    mobileApp: false,
    juiceBar: true,
    locker: true,
    qrCheckin: true,
    pointsSystem: true,
    wallet: true,
    debtors: false,
    unconfirmedMemberships: false,
    frozenMembers: false,
    callCenter: false,
    lostAndFound: false,
    complaints: false,
    advancedReports: false,
    surveys: false,
    serviceCategoryTargets: false
  });

  // Storefront CMS config
  const DEFAULT_STOREFRONT: StorefrontConfig = {
    heroSlides: [
      { id: 'default-1', title: 'Elite Fitness & Training', subtitle: 'Timings available now', badgeText: 'Featured', badgeColor: 'white', imageUrl: '', ctaText: 'Book Now!', enabled: true, order: 0 },
      { id: 'default-2', title: 'Kids & Juniors Programs', subtitle: 'Specialized youth fitness and coaching', badgeText: 'Popular', badgeColor: 'primary', imageUrl: '', ctaText: 'Book Now!', enabled: true, order: 1 },
      { id: 'default-3', title: 'Personal Coaching', subtitle: 'Certified personal trainers', badgeText: 'New', badgeColor: 'red', imageUrl: '', ctaText: 'Book Now!', enabled: true, order: 2 },
    ],
    sections: [
      { id: 'sec-kids', type: 'packages-kids', title: 'Kids Packages', enabled: true, order: 0 },
      { id: 'sec-banner', type: 'banner', title: 'IMPACT', subtitle: 'Our premium sister company', imageUrl: '', enabled: true, order: 1 },
      { id: 'sec-adults', type: 'packages-adults', title: 'Adult Packages', enabled: true, order: 2 },
    ],
    tabs: { book: true, locations: true, schedule: true, announcements: true },
    schedule: [],
    offers: [],
    packageDisplay: {
      showPrices: true,
      showSessionCount: true,
      showExpiryDays: true,
      allowAddToCart: true,
      groupBy: 'category',
      categoryLabels: { kids: 'Kids Packages', adults: 'Adult Packages' },
    },
    ctaText: 'Member / Staff Login',
    ctaTextMember: 'My Portal',
    branchLocations: [
      {
        branchName: 'Maxim Compound',
        displayName: 'Maxim Compound Branch',
        address: 'Maxim Country Club',
        mapUrl: 'https://maps.app.goo.gl/8BPj5eG8EtsZD66c8'
      },
      {
        branchName: 'Mivida Compound',
        displayName: 'Mivida Compound Branch',
        address: 'Lake District',
        mapUrl: 'https://maps.app.goo.gl/hEM2eFL4fF2bqS8F7'
      },
      {
        branchName: 'Impact by Strike',
        displayName: 'Impact by Strike',
        address: 'Maxim Mall',
        mapUrl: 'https://maps.app.goo.gl/4VnA5jAgiZx1RhjQ8'
      }
    ]
  };
  const [storefrontConfig, setStorefrontConfig] = useState<StorefrontConfig>(DEFAULT_STOREFRONT);

  // Helper to preload image before setting loaded state
  const preloadBrandingLogo = useCallback((data: BrandingSettings, onComplete: () => void) => {
    if (data.companyName) {
      document.title = data.companyName;
    }
    const mergedData = {
      currencyCode: 'EGP',
      currencySymbol: 'LE',
      ...data
    };
    if (data.logoUrl) {
      const img = new Image();
      img.src = data.logoUrl;
      let finished = false;
      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          setBranding(mergedData);
          onComplete();
        }
      }, 1500);
      img.onload = () => {
        clearTimeout(timeout);
        if (!finished) {
          finished = true;
          setBranding(mergedData);
          onComplete();
        }
      };
      img.onerror = () => {
        clearTimeout(timeout);
        if (!finished) {
          finished = true;
          setBranding(mergedData);
          onComplete();
        }
      };
    } else {
      setBranding(mergedData);
      onComplete();
    }
  }, []);

  // Branding — load or subscribe to branding settings
  const fetchSettings = useCallback(async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isAuthenticated && auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/settings', { headers });
      const data = await response.json();
      const settings = data.settings || {};

      if (settings.branding) {
        applyBrandAccent(settings.branding.brandAccentColor);
        preloadBrandingLogo(settings.branding as BrandingSettings, () => {
          setIsBrandingLoaded(true);
        });
      } else {
        setIsBrandingLoaded(true);
      }

      if (settings.features) setFeatures(prev => ({ ...prev, ...settings.features }));
      if (settings.storefront) setStorefrontConfig(prev => ({ ...prev, ...settings.storefront }));
      if (settings.branches?.branches && Array.isArray(settings.branches.branches)) {
        setBranches(settings.branches.branches);
      }
      
      if (isAuthenticated && role !== 'client' && role !== 'coach') {
        if (settings.commission) setCommissionRates(settings.commission);
        if (settings['sales-target']) {
          setSalesTarget(prev => ({ ...prev, ...settings['sales-target'] }));
        }
      }
    } catch (err: any) {
      console.error('Could not load settings:', err);
      setIsBrandingLoaded(true);
    }
  }, [isAuthenticated, role, preloadBrandingLogo]);

  useEffect(() => {
    let active = true;
    const safetyTimeout = setTimeout(() => {
      if (active) {
        console.warn('Branding load safety timeout triggered');
        setIsBrandingLoaded(true);
      }
    }, 2500);

    fetchSettings().finally(() => {
      clearTimeout(safetyTimeout);
    });

    let interval: ReturnType<typeof setInterval>;
    if (isAuthenticated && role !== 'client') {
      interval = setInterval(fetchSettings, 30000);
    }

    return () => {
      active = false;
      clearTimeout(safetyTimeout);
      if (interval) clearInterval(interval);
    };
  }, [fetchSettings, isAuthenticated, role]);

  const updateSetting = async (id: string, updates: any) => {
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch('/api/settings/update', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, updates })
    });
    if (!res.ok) throw new Error(`Failed to update ${id}`);
  };

  const updateBranding = useCallback(async (updates: Partial<BrandingSettings>) => {
    await updateSetting('branding', updates);
    setBranding(prev => ({ ...prev, ...updates }));
    if (updates.brandAccentColor !== undefined) {
      applyBrandAccent(updates.brandAccentColor);
    }
    await addAuditLog('UPDATE', 'TARGET', 'branding', `Updated branding settings`);
  }, []);

  const updateSalesTarget = useCallback(async (target: number, ptTarget?: number, classesTarget?: number, membershipsTarget?: number) => {
    try {
      const dataToSave = { 
        targetAmount: target,
        ...(ptTarget !== undefined && { ptTarget }),
        ...(classesTarget !== undefined && { classesTarget }),
        ...(membershipsTarget !== undefined && { membershipsTarget })
      };
      await updateSetting('sales-target', dataToSave);
      setSalesTarget(prev => ({ ...prev, ...dataToSave }));
      await addAuditLog('UPDATE', 'SYSTEM', 'sales-target', `Updated global sales target to ${target} LE`);
    } catch (error) {
      console.error('Failed to update sales target', error);
    }
  }, []);

  const updateBranches = useCallback(async (newBranches: Branch[]) => {
    await updateSetting('branches', { branches: newBranches });
    setBranches(newBranches);
    await addAuditLog('UPDATE', 'SYSTEM', 'branches', `Updated system branches`);
  }, []);

  const updateCommissionRates = useCallback(async (rates: { ptRate: number; groupRate: number }) => {
    await updateSetting('commission', rates);
    setCommissionRates(rates);
    await addAuditLog('UPDATE', 'TARGET', 'commission', `Updated commission rates: PT ${rates.ptRate}%, Group ${rates.groupRate}%`);
  }, []);

  const updateFeatures = useCallback(async (updates: Partial<FeatureFlags>) => {
    await updateSetting('features', updates);
    setFeatures(prev => ({ ...prev, ...updates }));
    await addAuditLog('UPDATE', 'SYSTEM', 'features', `Updated system feature flags`);
  }, []);

  const updateStorefrontConfig = useCallback(async (updates: Partial<StorefrontConfig>) => {
    await updateSetting('storefront', updates);
    setStorefrontConfig(prev => ({ ...prev, ...updates }));
    await addAuditLog('UPDATE', 'SYSTEM', 'storefront', `Updated storefront configuration`);
  }, []);

  const value = useMemo(() => ({
    branding,
    updateBranding,
    searchQuery,
    setSearchQuery,
    salesTarget,
    setSalesTarget,
    updateSalesTarget,
    branches,
    updateBranches,
    commissionRates,
    updateCommissionRates,
    features,
    updateFeatures,
    storefrontConfig,
    updateStorefrontConfig,
  }), [branding, searchQuery, salesTarget, branches, commissionRates, features, storefrontConfig, updateBranding, updateSalesTarget, updateBranches, updateCommissionRates, updateFeatures, updateStorefrontConfig]);

  const [isExiting, setIsExiting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!isBrandingLoaded) return () => {};

    let exitTimer: any;
    const delayTimer = window.setTimeout(() => {
      setIsExiting(true);
      exitTimer = window.setTimeout(() => {
        setIsDone(true);
      }, 600);
    }, 3000);

    return () => {
      window.clearTimeout(delayTimer);
      if (exitTimer) window.clearTimeout(exitTimer);
    };
  }, [isBrandingLoaded]);

  if (!isDone) {
    if (!isBrandingLoaded) {
      return (
        <div className="min-h-screen bg-[#070709] flex flex-col items-center justify-center relative overflow-hidden font-sans" />
      );
    }

    const companyName = branding?.companyName || 'CRM';
    const logoUrl = branding?.logoUrl;

    return (
      <div className={`min-h-screen bg-[#070709] flex flex-col items-center justify-center relative overflow-hidden font-sans ${isExiting ? 'preloader-exit' : ''}`}>
        {/* Radial light source glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--brand-accent-muted)_0%,transparent_60%)] pointer-events-none animate-[pulse_4s_infinite_ease-in-out]" />
        
        <div className="relative flex flex-col items-center z-10 scale-95 animate-[fadeIn_0.8s_ease-out_forwards]">
          <div className="relative flex items-center justify-center mb-6">
            {logoUrl ? (
              <div className="relative w-72 h-28 flex items-center justify-center">
                {/* Layer 1: Silhouette (faint outline) */}
                <img 
                  src={logoUrl} 
                  alt="Logo Silhouette" 
                  className="absolute inset-0 w-full h-full object-contain opacity-10 filter brightness-0 invert" 
                />

                {/* Layer 2: Animated mask container (glow & shine) */}
                <div 
                  className="absolute inset-0 w-full h-full filter drop-shadow-[0_0_15px_rgba(255,255,255,0.7)]"
                  style={{
                    maskImage: `url(${logoUrl})`,
                    WebkitMaskImage: `url(${logoUrl})`,
                    maskSize: 'contain',
                    WebkitMaskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskPosition: 'center',
                  }}
                >
                  {/* White reveal sweep */}
                  <div 
                    className="absolute inset-0 bg-white"
                    style={{
                      maskImage: 'linear-gradient(to right, white 40%, transparent 60%)',
                      WebkitMaskImage: 'linear-gradient(to right, white 40%, transparent 60%)',
                      maskSize: '200% 100%',
                      WebkitMaskSize: '200% 100%',
                      animation: 'revealLogo 3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                    }}
                  />

                  {/* Sweeping shine */}
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/90 to-transparent"
                    style={{
                      backgroundSize: '200% 100%',
                      animation: 'sweepShine 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite'
                    }}
                  />
                </div>

                {/* Layer 3: Full color logo resolving on top */}
                <img 
                  src={logoUrl} 
                  alt={companyName} 
                  className="absolute inset-0 w-full h-full object-contain opacity-0" 
                  style={{
                    animation: 'resolveColor 3s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards'
                  }}
                />
              </div>
            ) : (
              <div className="relative text-center flex flex-col items-center mb-6">
                {/* Layer 1: Silhouette / background text */}
                <h1 className="text-5xl font-black tracking-[0.25em] text-white/10 uppercase font-sans">
                  {companyName}
                </h1>

                {/* Layer 2: White reveal sweep text */}
                <h1 
                  className="absolute inset-0 text-5xl font-black tracking-[0.25em] text-white uppercase font-sans select-none pointer-events-none filter drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                  style={{
                    maskImage: 'linear-gradient(to right, white 40%, transparent 60%)',
                    WebkitMaskImage: 'linear-gradient(to right, white 40%, transparent 60%)',
                    maskSize: '200% 100%',
                    WebkitMaskSize: '200% 100%',
                    animation: 'revealLogo 3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                  }}
                >
                  {companyName}
                </h1>

                {/* Layer 3: Sweeping shine on text */}
                <h1 
                  className="absolute inset-0 text-5xl font-black tracking-[0.25em] text-transparent uppercase font-sans select-none pointer-events-none"
                  style={{
                    backgroundImage: 'linear-gradient(to right, transparent 30%, white 50%, transparent 70%)',
                    backgroundSize: '200% 100%',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    animation: 'sweepShine 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite'
                  }}
                >
                  {companyName}
                </h1>
                

              </div>
            )}
          </div>
          
          {/* Glowing loader bar */}
          <div className="h-1 w-28 bg-zinc-900 mt-10 rounded-full overflow-hidden border border-white/5 relative">
            <div className="h-full bg-gradient-to-r from-rose-500 to-rose-600 rounded-full animate-[slide_1.5s_infinite_ease-in-out] shadow-[0_0_10px_var(--brand-accent)]" />
          </div>
          <p className="text-[10px] tracking-[0.3em] text-zinc-500 uppercase mt-4 font-semibold animate-pulse">Initializing CRM Portal...</p>
        </div>

        <style>{`
          @keyframes slide {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
          @keyframes fadeIn {
            0% { opacity: 0; transform: scale(0.95); filter: blur(5px); }
            100% { opacity: 1; transform: scale(1); filter: blur(0); }
          }
          @keyframes revealLogo {
            0% {
              mask-position: 100% 0;
              -webkit-mask-position: 100% 0;
            }
            60% {
              mask-position: 0% 0;
              -webkit-mask-position: 0% 0;
            }
            100% {
              mask-position: 0% 0;
              -webkit-mask-position: 0% 0;
            }
          }
          @keyframes sweepShine {
            0% {
              background-position: 200% 0;
            }
            70% {
              background-position: -200% 0;
            }
            100% {
              background-position: -200% 0;
            }
          }
          @keyframes resolveColor {
            0% {
              opacity: 0;
              filter: drop-shadow(0 0 0px rgba(255,255,255,0));
            }
            40% {
              opacity: 0;
              filter: drop-shadow(0 0 0px rgba(255,255,255,0));
            }
            80% {
              opacity: 1;
              filter: drop-shadow(0 0 15px rgba(255,255,255,0.4));
            }
            100% {
              opacity: 1;
              filter: drop-shadow(0 0 10px rgba(255,255,255,0.2));
            }
          }
          @keyframes fadeOutUp {
            0% { opacity: 1; transform: scale(1); filter: blur(0); }
            100% { opacity: 0; transform: scale(1.05); filter: blur(8px); }
          }
          .preloader-exit {
            animation: fadeOutUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            pointer-events: none;
          }
        `}</style>
      </div>
    );
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
