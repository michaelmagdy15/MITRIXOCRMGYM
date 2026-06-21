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
    logoUrl: ''
  });
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
    mobileApp: false
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

  // Branding — load or subscribe to branding settings
  useEffect(() => {
    if (!isAuthenticated || role === 'client' || role === 'coach') {
      // One-time read for unauthenticated/members/coaches
      getDoc(doc(db, 'settings', 'branding'))
        .then((snapshot) => {
          if (snapshot.exists()) setBranding(snapshot.data() as BrandingSettings);
        })
        .catch((err) => console.warn('Could not load branding:', err.code || err.message));
      return;
    }
    // Real-time listener for staff/admin
    const unsubBranding = onSnapshot(
      doc(db, 'settings', 'branding'),
      (snapshot) => {
        if (snapshot.exists()) setBranding(snapshot.data() as BrandingSettings);
      },
      (error) => console.warn('Firestore Error (branding):', error.code || error.message)
    );
    return () => { unsubBranding(); };
  }, [role, isAuthenticated]);

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

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
