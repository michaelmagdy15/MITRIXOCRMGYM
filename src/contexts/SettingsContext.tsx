import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { BrandingSettings, SalesTarget, Branch, FeatureFlags, StorefrontConfig } from '../types';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { addAuditLog } from '../services/auditService';

interface SettingsContextType {
  branding: BrandingSettings;
  updateBranding: (branding: Partial<BrandingSettings>) => Promise<void>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  salesTarget: SalesTarget;
  updateSalesTarget: (target: number) => Promise<void>;
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
  const [branches, setBranches] = useState<Branch[]>(['COMPLEX', 'MIVIDA', 'mitrixogymcrm IMPACT']);
  const [commissionRates, setCommissionRates] = useState({ ptRate: 8, groupRate: 5 });
  const [features, setFeatures] = useState<FeatureFlags>({
    leads: true,
    ptPackages: true,
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
    frozenMembers: false
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
      img.onload = () => {
        setBranding(mergedData);
        onComplete();
      };
      img.onerror = () => {
        setBranding(mergedData);
        onComplete();
      };
    } else {
      setBranding(mergedData);
      onComplete();
    }
  }, []);

  // Branding — load or subscribe to branding settings
  useEffect(() => {
    let active = true;
    if (!isAuthenticated || role === 'client' || role === 'coach') {
      // One-time read for unauthenticated/members/coaches
      getDoc(doc(db, 'settings', 'branding'))
        .then((snapshot) => {
          if (active) {
            if (snapshot.exists()) {
              preloadBrandingLogo(snapshot.data() as BrandingSettings, () => {
                if (active) setIsBrandingLoaded(true);
              });
            } else {
              setIsBrandingLoaded(true);
            }
          }
        })
        .catch((err) => {
          console.warn('Could not load branding:', err.code || err.message);
          if (active) setIsBrandingLoaded(true);
        });
      return () => { active = false; };
    }
    // Real-time listener for staff/admin
    const unsubBranding = onSnapshot(
      doc(db, 'settings', 'branding'),
      (snapshot) => {
        if (active) {
          if (snapshot.exists()) {
            preloadBrandingLogo(snapshot.data() as BrandingSettings, () => {
              if (active) setIsBrandingLoaded(true);
            });
          } else {
            setIsBrandingLoaded(true);
          }
        }
      },
      (error) => {
        console.warn('Firestore Error (branding):', error.code || error.message);
        if (active) setIsBrandingLoaded(true);
      }
    );
    return () => {
      active = false;
      unsubBranding();
    };
  }, [role, isAuthenticated, preloadBrandingLogo]);

  // Features — load or subscribe to feature flags
  useEffect(() => {
    if (!isAuthenticated || role === 'client' || role === 'coach') {
      getDoc(doc(db, 'settings', 'features'))
        .then((snapshot) => {
          if (snapshot.exists()) setFeatures(prev => ({ ...prev, ...snapshot.data() }));
        })
        .catch((err) => console.warn('Could not load features:', err.message));
      return;
    }

    const unsubFeatures = onSnapshot(
      doc(db, 'settings', 'features'),
      (snapshot) => {
        if (snapshot.exists()) setFeatures(prev => ({ ...prev, ...snapshot.data() }));
      },
      (error) => console.warn('Firestore Error (features):', error.message)
    );
    return () => { unsubFeatures(); };
  }, [role, isAuthenticated]);

  // Storefront config — load for everyone, real-time for admins
  useEffect(() => {
    if (!isAuthenticated || role === 'client' || role === 'coach') {
      getDoc(doc(db, 'settings', 'storefront'))
        .then((snapshot) => {
          if (snapshot.exists()) setStorefrontConfig(prev => ({ ...prev, ...snapshot.data() as Partial<StorefrontConfig> }));
        })
        .catch((err) => console.warn('Could not load storefront config:', err.code || err.message));
      return;
    }
    const unsubStorefront = onSnapshot(
      doc(db, 'settings', 'storefront'),
      (snapshot) => {
        if (snapshot.exists()) setStorefrontConfig(prev => ({ ...prev, ...snapshot.data() as Partial<StorefrontConfig> }));
      },
      (error) => console.warn('Firestore Error (storefront):', error.code || error.message)
    );
    return () => { unsubStorefront(); };
  }, [role, isAuthenticated]);

  // Auth-required settings — only subscribe when a privileged user is logged in to avoid permission errors
  useEffect(() => {
    if (!isAuthenticated) return;
    if (role === 'coach' || role === 'client') return;

    const unsubBranches = onSnapshot(
      doc(db, 'settings', 'branches'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data?.branches && Array.isArray(data.branches)) setBranches(data.branches);
        }
      },
      (error) => console.error('Firestore Error (branches):', error)
    );

    const unsubCommission = onSnapshot(
      doc(db, 'settings', 'commission'),
      (snapshot) => {
        if (snapshot.exists()) setCommissionRates(snapshot.data() as { ptRate: number; groupRate: number });
      },
      (error) => console.error('Firestore Error (commission):', error)
    );

    const unsubTarget = onSnapshot(
      doc(db, 'settings', 'sales-target'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSalesTarget(prev => ({ ...prev, targetAmount: data.targetAmount || 50000 }));
        }
      },
      (error) => console.error('Firestore Error (sales-target):', error)
    );

    return () => { unsubBranches(); unsubCommission(); unsubTarget(); };
  }, [isAuthenticated]);

  const updateBranding = useCallback(async (updates: Partial<BrandingSettings>) => {
    await setDoc(doc(db, 'settings', 'branding'), updates, { merge: true });
    await addAuditLog('UPDATE', 'TARGET', 'branding', `Updated branding settings`);
  }, []);

  const updateSalesTarget = useCallback(async (target: number) => {
    await setDoc(doc(db, 'settings', 'sales-target'), { targetAmount: target }, { merge: true });
    await addAuditLog('UPDATE', 'TARGET', 'sales-target', `Updated overall sales target to ${target}`);
  }, []);

  const updateBranches = useCallback(async (newBranches: Branch[]) => {
    await setDoc(doc(db, 'settings', 'branches'), { branches: newBranches }, { merge: true });
    setBranches(newBranches);
    await addAuditLog('UPDATE', 'SYSTEM', 'branches', `Updated system branches`);
  }, []);

  const updateCommissionRates = useCallback(async (rates: { ptRate: number; groupRate: number }) => {
    await setDoc(doc(db, 'settings', 'commission'), rates, { merge: true });
    await addAuditLog('UPDATE', 'TARGET', 'commission', `Updated commission rates: PT ${rates.ptRate}%, Group ${rates.groupRate}%`);
  }, []);

  const updateFeatures = useCallback(async (updates: Partial<FeatureFlags>) => {
    await setDoc(doc(db, 'settings', 'features'), updates, { merge: true });
    await addAuditLog('UPDATE', 'SYSTEM', 'features', `Updated system feature flags`);
  }, []);

  const updateStorefrontConfig = useCallback(async (updates: Partial<StorefrontConfig>) => {
    await setDoc(doc(db, 'settings', 'storefront'), updates, { merge: true });
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.08)_0%,transparent_60%)] pointer-events-none animate-[pulse_4s_infinite_ease-in-out]" />
        
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
                
                <p className="text-[10px] tracking-[0.4em] text-zinc-500 uppercase mt-2 font-semibold">Boxing Club</p>
              </div>
            )}
          </div>
          
          {/* Glowing loader bar */}
          <div className="h-1 w-28 bg-zinc-900 mt-10 rounded-full overflow-hidden border border-white/5 relative">
            <div className="h-full bg-gradient-to-r from-rose-500 to-rose-600 rounded-full animate-[slide_1.5s_infinite_ease-in-out] shadow-[0_0_10px_#f43f5e]" />
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
