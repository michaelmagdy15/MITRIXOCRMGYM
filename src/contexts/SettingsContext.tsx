import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { BrandingSettings, SalesTarget, Branch } from '../types';
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

  // Branding — use one-time read for members/coaches to avoid onSnapshot permission errors
  useEffect(() => {
    // Wait for role to be determined before subscribing
    if (!isAuthenticated && !role) return;

    if (role === 'client' || role === 'coach') {
      // One-time read for members
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
  }), [branding, searchQuery, salesTarget, branches, commissionRates, updateBranding, updateSalesTarget, updateBranches, updateCommissionRates]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
