import React, { createContext, useContext, useMemo, useCallback, useState } from 'react';
import { db } from './firebase';
import {
  doc,
  collection,
  writeBatch,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where
} from 'firebase/firestore';
import { useAuth } from './contexts/AuthContext';
import { useSettings } from './contexts/SettingsContext';
import { useClients } from './hooks/useClients';
import { usePayments } from './hooks/usePayments';
import { useTasks } from './hooks/useTasks';
import { usePackages } from './hooks/usePackages';
import { useCoaches } from './hooks/useCoaches';
import { useAttendance } from './hooks/useAttendance';
import { useImportBatches } from './hooks/useImportBatches';
import { usePTSessions } from './hooks/usePTSessions';
import { useUserTargets } from './hooks/useUserTargets';
import { SALES_NAME_MAPPING } from './constants';
import { 
  Client, 
  User, 
  UserRole, 
  Payment, 
  CRMComment,
  InteractionLog,
  SalesTarget, 
  PTPackageRecord, 
  Task, 
  Package, 
  Coach, 
  ImportBatch,
  UserSalesTarget,
  BrandingSettings,
  Attendance,
  Branch,
  CommissionRates,
  FeatureFlags
} from './types';
import { cleanData } from './utils';
import { processPaymentTransaction, PaymentTransactionParams } from './services/transactionService';

export interface AppContextType {
  currentUser: User | null;
  users: User[];
  logout: () => Promise<void>;
  clients: Client[];
  loadingClients: boolean;
  loadingExpired: boolean;
  expiredLoaded: boolean;
  fetchExpiredMembers: () => Promise<void>;
  salesTarget: SalesTarget;
  payments: Payment[];
  loadingPayments: boolean;
  ptPackageRecords: PTPackageRecord[];
  tasks: Task[];
  allTasks: Task[];
  packages: Package[];
  loadingPackages: boolean;
  coaches: Coach[];
  importBatches: ImportBatch[];
  userTargets: UserSalesTarget[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeClientId: string | null;
  setActiveClientId: (id: string | null) => void;
  prefilledLeadData: { name?: string; phone?: string } | null;
  setPrefilledLeadData: (data: { name?: string; phone?: string } | null) => void;
  addClient: (client: Client) => Promise<void>;
  bulkAddClients: (clients: Client[]) => Promise<{success: number, failed: number, errors: {row: number, reason: string}[]}>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  deleteMultipleClients: (ids: string[]) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  inviteUser: (email: string, role: UserRole) => Promise<void>;
  addComment: (clientId: string, text: string, author?: string) => Promise<void>;
  addInteraction: (clientId: string, interaction: Omit<InteractionLog, 'id' | 'author'>) => Promise<void>;
  addPayment: (payment: Omit<Payment, 'id' | 'client_name' | 'amount_paid' | 'created_at' | 'package_category_type' | 'deleted_at'>) => Promise<void>;
  updateSalesTarget: (target: number, ptTarget?: number, classesTarget?: number, membershipsTarget?: number) => Promise<void>;
  updateUserTarget: (userId: string, month: string, total: number, ptTarget?: number, classesTarget?: number, membershipsTarget?: number) => Promise<void>;
  addPTPackageRecord: (session: Omit<PTPackageRecord, 'id'>) => Promise<void>;
  updatePTPackageRecord: (id: string, updates: Partial<PTPackageRecord>) => Promise<void>;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'createdBy'>) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  addPackage: (pkg: Omit<Package, 'id'>) => Promise<void>;
  updatePackage: (id: string, updates: Partial<Package>) => Promise<void>;
  deletePackage: (id: string) => Promise<void>;
  addCoach: (coach: Omit<Coach, 'id'>) => Promise<void>;
  updateCoach: (id: string, updates: Partial<Coach>) => Promise<void>;
  deleteCoach: (id: string) => Promise<void>;
  addImportBatch: (batch: Omit<ImportBatch, 'id'>) => Promise<string>;
  rollbackImport: (batchId: string) => Promise<void>;
  isAuthReady: boolean;
  branding: BrandingSettings;
  updateBranding: (branding: Partial<BrandingSettings>) => Promise<void>;
  features: FeatureFlags;
  updateFeatures: (updates: Partial<FeatureFlags>) => Promise<void>;
  previewRole: UserRole | null;
  setPreviewRole: (role: UserRole | null) => void;
  effectiveRole: UserRole | undefined;
  attendances: Attendance[];
  recordAttendance: (clientId: string, branch: Branch) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  updatePayment: (id: string, updates: Partial<Payment>) => Promise<void>;
  wipeSystem: () => Promise<void>;
  bulkAddPayments: (payments: Payment[]) => Promise<void>;
  canDeletePayments: boolean;
  canAccessSettings: boolean;
  canViewGlobalDashboard: boolean;
  canDeleteRecords: boolean;
  canAssignLeads: boolean;
  recalculateAllPackages: () => Promise<void>;
  selfCheckIn: (identifier: string, pin: string, branch: Branch) => Promise<{ success: boolean; message: string }>;
  commissionRates: CommissionRates;
  updateCommissionRates: (rates: CommissionRates) => Promise<void>;
  isManagerOrSama: boolean;
  branches: Branch[];
  updateBranches: (branches: Branch[]) => Promise<void>;
  processPaymentTransaction: (params: PaymentTransactionParams) => Promise<void>;
  fetchClientDetails: (clientId: string) => Promise<{ comments: CRMComment[]; interactions: InteractionLog[] }>;
  createClientAccount: (clientId: string, memberId: string, clientName: string, phone?: string) => Promise<{ uid: string }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { 
    currentUser, 
    users, 
    isAuthReady, 
    effectiveRole, 
    previewRole, 
    setPreviewRole, 
    logout, 
    updateUser, 
    deleteUser, 
    inviteUser,
    createClientAccount
  } = useAuth();

  const { 
    branding, 
    updateBranding, 
    searchQuery, 
    setSearchQuery, 
    salesTarget, 
    updateSalesTarget,
    branches,
    updateBranches,
    commissionRates,
    updateCommissionRates,
    features,
    updateFeatures
  } = useSettings();

  const {
    clients,
    loading: loadingClients,
    loadingExpired,
    expiredLoaded,
    fetchExpiredMembers,
    addClient,
    bulkAddClients,
    updateClient,
    deleteClient,
    deleteMultipleClients,
    addComment,
    addInteraction,
    fetchClientDetails
  } = useClients(currentUser, searchQuery);

  const { 
    payments, 
    loading: loadingPayments, 
    addPayment, 
    deletePayment,
    updatePayment
  } = usePayments({ 
    currentUser, 
    clients, 
    canDeletePayments: true 
  });

  const { 
    tasks, 
    allTasks, 
    addTask, 
    updateTask, 
    deleteTask 
  } = useTasks();

  const { 
    packages, 
    loading: loadingPackages, 
    addPackage, 
    updatePackage, 
    deletePackage,
    recalculateAllPackages
  } = usePackages();

  const { 
    coaches, 
    addCoach, 
    updateCoach, 
    deleteCoach 
  } = useCoaches();

  const { 
    attendances, 
    recordAttendance 
  } = useAttendance(currentUser, clients);

  const { 
    importBatches, 
    addImportBatch, 
    rollbackImport 
  } = useImportBatches(currentUser, clients, payments);

  const { ptPackageRecords, addPTPackageRecord, updatePTPackageRecord } = usePTSessions(currentUser, clients);
  const { userTargets, updateUserTarget } = useUserTargets(currentUser);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [prefilledLeadData, setPrefilledLeadData] = useState<{ name?: string; phone?: string } | null>(null);

  const isManagerOrSama = useMemo(() => {
    if (!currentUser) return false;
    const role = effectiveRole;
    return role === 'manager' || role === 'admin' || role === 'super_admin' || role === 'crm_admin';
  }, [currentUser, effectiveRole]);

  const canDeletePayments = useMemo(() => {
    if (!currentUser) return false;
    const role = effectiveRole;
    if (role === 'super_admin' || role === 'crm_admin' || role === 'manager' || role === 'admin') return true;
    return !!currentUser.can_delete_payments;
  }, [currentUser, effectiveRole]);

  const canAccessSettings = useMemo(() => {
    if (!currentUser) return false;
    const role = effectiveRole;
    if (role === 'super_admin' || role === 'crm_admin' || role === 'manager' || role === 'admin') return true;
    return !!currentUser.can_access_settings_and_history;
  }, [currentUser, effectiveRole]);

  const canViewGlobalDashboard = useMemo(() => {
    if (!currentUser) return false;
    const role = effectiveRole;
    if (role === 'super_admin' || role === 'crm_admin' || role === 'manager' || role === 'admin') return true;
    return !!currentUser.can_view_global_dashboard;
  }, [currentUser, effectiveRole]);

  const canDeleteRecords = useMemo(() => {
    if (!currentUser) return false;
    const role = effectiveRole;
    if (role === 'super_admin' || role === 'crm_admin' || role === 'manager' || role === 'admin') return true;
    return !!currentUser.can_delete_records || !!currentUser.can_delete_payments;
  }, [currentUser, effectiveRole]);

  const canAssignLeads = useMemo(() => {
    if (!currentUser) return false;
    const role = effectiveRole;
    if (role === 'super_admin' || role === 'crm_admin' || role === 'manager' || role === 'admin') return true;
    return !!currentUser.can_assign_leads || !!currentUser.can_access_settings_and_history;
  }, [currentUser, effectiveRole]);

  const getCanonicalName = useCallback((name: string) => {
    if (!name) return '';
    const trimmed = name.trim().toLowerCase();
    for (const [key, value] of Object.entries(SALES_NAME_MAPPING)) {
      if (key.toLowerCase() === trimmed) return value.toLowerCase().trim();
    }
    return trimmed;
  }, []);

  const isClientAssignedToRep = useCallback((client: any, repId: string, repName: string) => {
    if (!client.assignedTo) return false;
    if (client.assignedTo === repId) return true;
    
    const canonicalAssigned = getCanonicalName(client.assignedTo);
    const canonicalRep = getCanonicalName(repName);
    
    return canonicalAssigned === canonicalRep && canonicalAssigned !== '';
  }, [getCanonicalName]);

  const isPaymentAttributedToRep = useCallback((payment: any, repId: string, repName: string, visibleClientIds: Set<string>) => {
    // 1. Direct ID match (new payments created through the CRM)
    if (payment.sales_rep_id && payment.sales_rep_id === repId) return true;

    // 2. Canonical name match on payment fields (legacy data)
    const salesName = (payment.salesName || payment.assigned_sales_name || '').trim();
    if (salesName) {
      const canonicalSalesName = getCanonicalName(salesName);
      const canonicalRep = getCanonicalName(repName);
      if (canonicalSalesName === canonicalRep && canonicalSalesName !== '') return true;
    }

    // 3. Transitive: look up the client and check their salesName/assignedTo.
    // Critical for imported data where sales_rep_id points to the importer,
    // but the client record has the correct salesName (e.g. "Maisoon").
    const client = clients.find(c => c.id === payment.clientId);
    if (client) {
      if (client.assignedTo === repId) return true;
      const clientSalesName = (client.salesName || client.assignedTo || '').trim();
      if (clientSalesName) {
        const canonicalClientSales = getCanonicalName(clientSalesName);
        const canonicalRep = getCanonicalName(repName);
        if (canonicalClientSales === canonicalRep && canonicalClientSales !== '') return true;
      }
    }

    return false;
  }, [clients, getCanonicalName]);

  const visibleClients = useMemo(() => {
    if (!currentUser) return [];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return clients.filter(c => 
        c.name.toLowerCase().includes(q) || 
        c.phone.includes(q) || 
        (c.memberId && c.memberId.includes(q))
      );
    }
    let filtered = clients;
    if (!canViewGlobalDashboard) {
      filtered = clients.filter(c => isClientAssignedToRep(c, currentUser.id, currentUser.name || ''));
    }
    return filtered;
  }, [clients, currentUser, searchQuery, canViewGlobalDashboard, isClientAssignedToRep]);

  const visiblePayments = useMemo(() => {
    if (!currentUser) return [];
    if (canViewGlobalDashboard) return payments;
    
    const visibleClientIds = new Set(visibleClients.map(c => c.id));
    return payments.filter(p => isPaymentAttributedToRep(p, currentUser.id, currentUser.name || '', visibleClientIds));
  }, [payments, visibleClients, currentUser, canViewGlobalDashboard, isPaymentAttributedToRep]);


  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    if (isManagerOrSama) return tasks;
    return tasks.filter(t => t.assignedTo === currentUser.id || t.createdBy === currentUser.id);
  }, [tasks, currentUser, isManagerOrSama]);

  const salesStats = useMemo(() => {
    const total = visiblePayments.reduce((acc: number, p: Payment) => acc + (Number(p.amount) || 0), 0);
    const privateSold = visiblePayments.filter((p: Payment) => p.packageType?.toLowerCase().includes('private') || p.packageType?.toLowerCase().includes('pt')).length;
    const groupSold = visiblePayments.filter((p: Payment) => p.packageType?.toLowerCase().includes('group') || p.packageType?.toLowerCase().includes('gt')).length;
    
    const currentMonthStr = new Date().toISOString().substring(0, 7); 

    let targetAmount = salesTarget?.targetAmount || 50000;

    if (currentUser?.role === 'rep') {
      const personalTarget = userTargets.find((t: UserSalesTarget) => t.userId === currentUser.id && t.month === currentMonthStr);
      if (personalTarget) {
        targetAmount = personalTarget.targetAmount;
      } else if (currentUser.salesTarget) {
        targetAmount = currentUser.salesTarget;
      }
    } else {
      const allMonthTargets = userTargets.filter((t: UserSalesTarget) => t.month === currentMonthStr);
      if (allMonthTargets.length > 0) {
        targetAmount = allMonthTargets.reduce((sum: number, t: UserSalesTarget) => sum + t.targetAmount, 0);
      }
    }

    return {
      targetAmount,
      currentAmount: total,
      privatePackagesSold: privateSold,
      groupPackagesSold: groupSold
    };
  }, [visiblePayments, salesTarget, currentUser, userTargets]);


  const selfCheckIn = useCallback(async (identifier: string, pin: string, branch: Branch) => {
    // Server-authoritative check-in: the server validates the daily PIN,
    // resolves the member, checks double check-in, records attendance, and
    // decrements sessions — so no Firestore rule grants are needed here.
    try {
      const res = await fetch('/api/attendance/self-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), pin: pin.trim(), branch })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[Check-in] Server error:', data?.error || res.status);
        return { success: false, message: 'Failed to record attendance. Please ask staff for help.' };
      }
      return { success: data.success === true, message: data.message || '' };
    } catch (err) {
      console.error('[Check-in] Network error:', err);
      return { success: false, message: 'Failed to record attendance. Please ask staff for help.' };
    }
  }, []);

  const wipeSystem = useCallback(async () => {
    if (!isManagerOrSama) return;
    console.warn('System wipe initiated!');
    const collections = ['clients', 'payments', 'attendance', 'tasks', 'interactions', 'importBatches'];
    for (const col of collections) {
      const { getDocs, collection: col_ } = await import('firebase/firestore');
      const snap = await getDocs(col_(db, col));
      if (snap.empty) continue;
      let batch = writeBatch(db);
      let count = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref);
        count++;
        if (count === 450) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }
    console.warn('System wipe complete.');
  }, [isManagerOrSama]);

  const bulkAddPayments = useCallback(async (newPayments: Payment[]) => {
    let batch = writeBatch(db);
    let count = 0;
    for (const p of newPayments) {
      const docRef = doc(collection(db, 'payments'));
      batch.set(docRef, cleanData(p));
      count++;
      if (count === 450) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }, []);

  const contextValue = useMemo<AppContextType>(() => ({
    currentUser: currentUser ? { ...currentUser, role: effectiveRole as any } : null,
    users,
    logout,
    clients: visibleClients,
    loadingClients,
    loadingExpired,
    expiredLoaded,
    fetchExpiredMembers,
    salesTarget: salesStats,
    payments: visiblePayments,
    loadingPayments,
    ptPackageRecords,
    tasks: visibleTasks,
    allTasks,
    packages,
    loadingPackages,
    coaches,
    importBatches,
    userTargets,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    activeClientId,
    setActiveClientId,
    prefilledLeadData,
    setPrefilledLeadData,
    addClient,
    bulkAddClients,
    updateClient,
    deleteClient,
    deleteMultipleClients,
    updateUser,
    deleteUser,
    inviteUser,
    addComment,
    addInteraction,
    addPayment,
    updateSalesTarget,
    updateUserTarget,
    addPTPackageRecord,
    updatePTPackageRecord,
    addTask,
    updateTask,
    deleteTask,
    addPackage,
    updatePackage,
    deletePackage,
    addCoach,
    updateCoach,
    deleteCoach,
    addImportBatch,
    rollbackImport,
    isAuthReady,
    branding,
    updateBranding,
    features,
    updateFeatures,
    previewRole,
    setPreviewRole,
    effectiveRole,
    attendances,
    recordAttendance,
    deletePayment,
    updatePayment,
    wipeSystem,
    bulkAddPayments,
    canDeletePayments,
    canAccessSettings,
    canViewGlobalDashboard,
    canDeleteRecords,
    canAssignLeads,
    recalculateAllPackages,
    selfCheckIn,
    commissionRates,
    updateCommissionRates,
    isManagerOrSama,
    branches,
    updateBranches,
    processPaymentTransaction,
    fetchClientDetails,
    createClientAccount
  }), [
    currentUser, effectiveRole, users, visibleClients, loadingClients,
    loadingExpired, expiredLoaded, fetchExpiredMembers,
    salesStats, visiblePayments, loadingPayments, ptPackageRecords,
    visibleTasks, allTasks, packages, loadingPackages,
    coaches, importBatches, userTargets, searchQuery, activeTab, activeClientId, prefilledLeadData, isAuthReady, branding,
    features, updateFeatures, previewRole, attendances, canDeletePayments, canAccessSettings,
    canViewGlobalDashboard, canDeleteRecords, canAssignLeads,
    commissionRates, isManagerOrSama, branches, fetchClientDetails, createClientAccount,
    updatePayment
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
