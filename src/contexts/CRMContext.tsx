import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  Client,
  Payment,
  PrivateSession,
  AuditLog,
  Comment,
  Task,
  Package,
  ImportBatch,
  UserTarget,
  ClientId,
  PaymentId,
  SessionId,
  TaskId,
  PackageId,
  ImportBatchId,
  UserId,
  ClientUpdates
} from '../types';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  collectionGroup, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  writeBatch,
  getDocs 
} from 'firebase/firestore';
import * as clientService from '../services/clientService';
import * as sharedService from '../services/sharedServices';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { cleanData } from '../utils';
import { exportDatabaseToJson } from '../services/backupService';

interface CRMContextType {
  clients: Client[];
  payments: Payment[];
  privateSessions: PrivateSession[];
  auditLogs: AuditLog[];
  tasks: Task[];
  packages: Package[];
  importBatches: ImportBatch[];
  userTargets: UserTarget[];
  addClient: (client: Client) => Promise<void>;
  bulkAddClients: (clients: Client[]) => Promise<{success: number, failed: number, errors: {row: number, reason: string}[]}>;
  updateClient: (id: ClientId, updates: ClientUpdates) => Promise<void>;
  deleteClient: (id: ClientId) => Promise<void>;
  deleteMultipleClients: (ids: ClientId[]) => Promise<void>;
  addComment: (clientId: ClientId, text: string, author: string) => Promise<void>;
  addPayment: (payment: Omit<Payment, 'id'>) => Promise<void>;
  deletePayment: (id: PaymentId) => Promise<void>;
  addPrivateSession: (session: Omit<PrivateSession, 'id'>) => Promise<void>;
  updatePrivateSession: (id: SessionId, updates: Partial<PrivateSession>) => Promise<void>;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'createdBy'>, client?: Client) => Promise<void>;
  updateTask: (id: TaskId, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: TaskId) => Promise<void>;
  addPackage: (pkg: Omit<Package, 'id'>) => Promise<void>;
  updatePackage: (id: PackageId, updates: Partial<Package>) => Promise<void>;
  deletePackage: (id: PackageId) => Promise<void>;
  addImportBatch: (batch: Omit<ImportBatch, 'id'>) => Promise<ImportBatchId>;
  rollbackImport: (batchId: ImportBatchId) => Promise<void>;
  clearAllData: () => Promise<void>;
  exportBackup: () => Promise<void>;
  importBackup: (jsonData: string) => Promise<void>;
  recordSessionAttendance: (clientId: ClientId, sessionId: SessionId, status: 'Attended' | 'No Show' | 'Cancelled' | 'Scheduled', client: Client, authorName: string) => Promise<void>;
  analytics: {
    revenueByMonth: { month: string, revenue: number, sessions: number }[];
    leadsByStage: { stage: string, count: number }[];
    membershipStats: { name: string, value: number }[];
    conversionRate: number;
  };
}

const CRMContext = createContext<CRMContextType | undefined>(undefined);

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, effectiveRole, isSuperUser } = useAuth();
  const { searchQuery, setSalesTarget } = useSettings();

  const [baseClients, setBaseClients] = useState<Omit<Client, 'comments'>[]>([]);
  const [allComments, setAllComments] = useState<Record<ClientId, Comment[]>>({});
  const [payments, setPayments] = useState<Payment[]>([]);
  const [privateSessions, setPrivateSessions] = useState<PrivateSession[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [userTargets, setUserTargets] = useState<UserTarget[]>([]);

  const fullClients = useMemo(() => {
    return baseClients.map(c => ({
      ...c,
      comments: allComments[c.id] || []
    })) as Client[];
  }, [baseClients, allComments]);

  useEffect(() => {
    if (!currentUser) return;

    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      setBaseClients(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id as ClientId } as Omit<Client, 'comments'>)));
    });

    const unsubComments = onSnapshot(collectionGroup(db, 'comments'), (snapshot) => {
      const commentsByClient: Record<ClientId, Comment[]> = {} as any;
      snapshot.docs.forEach(doc => {
        const clientId = doc.ref.parent.parent?.id as ClientId | undefined;
        if (clientId) {
          if (!commentsByClient[clientId]) commentsByClient[clientId] = [];
          commentsByClient[clientId]!.push({ ...doc.data(), id: doc.id } as Comment);
        }
      });
      setAllComments(commentsByClient);
    });

    const unsubPayments = onSnapshot(collection(db, 'payments'), (snapshot) => {
      const paymentsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id as PaymentId } as Payment));
      setPayments(paymentsData);
      
      const total = paymentsData.reduce((acc, p) => acc + (p.amount || 0), 0);
      const privateSold = paymentsData.filter(p => p.packageType?.toLowerCase().includes('private')).length;
      const groupSold = paymentsData.filter(p => 
        p.packageType?.toLowerCase().includes('group') || 
        p.packageType?.toLowerCase().includes('gt')
      ).length;
      
      setSalesTarget((prev) => ({
        ...prev,
        currentAmount: total,
        privateSessionsSold: privateSold,
        groupSessionsSold: groupSold
      }));
    });

    const unsubSessions = onSnapshot(collection(db, 'sessions'), (snapshot) => {
      setPrivateSessions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id as SessionId } as PrivateSession)));
    });

    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id as TaskId } as Task)));
    });

    const unsubPackages = onSnapshot(collection(db, 'packages'), (snapshot) => {
      setPackages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id as PackageId } as Package)));
    });

    const unsubBatches = onSnapshot(query(collection(db, 'importBatches'), orderBy('date', 'desc')), (snapshot) => {
      setImportBatches(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id as ImportBatchId } as ImportBatch)));
    });

    const unsubTargets = onSnapshot(collection(db, 'userTargets'), (snapshot) => {
      setUserTargets(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as UserTarget)));
    });

    let unsubAudit: (() => void) | undefined;
    if (['manager', 'admin', 'super_admin', 'crm_admin'].includes(effectiveRole || '')) {
      unsubAudit = onSnapshot(query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc')), (snapshot) => {
        setAuditLogs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AuditLog)));
      });
    }

    return () => {
      unsubClients();
      unsubComments();
      unsubPayments();
      unsubSessions();
      unsubTasks();
      unsubPackages();
      unsubBatches();
      unsubTargets();
      if (unsubAudit) unsubAudit();
    };
  }, [currentUser, effectiveRole, setSalesTarget]);

  const visibleClients = useMemo(() => {
    if (!currentUser) return [];
    let filtered = fullClients;
    if (!['manager', 'admin', 'super_admin', 'crm_admin'].includes(effectiveRole || '')) {
      filtered = fullClients.filter(c => c.assignedTo === currentUser.id);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c => {
        const hasMemberId = 'memberId' in c && c.memberId?.toLowerCase().includes(q);
        return c.name.toLowerCase().includes(q) || 
               c.phone.includes(q) || 
               hasMemberId;
      });
    }
    return filtered;
  }, [fullClients, currentUser, effectiveRole, searchQuery]);

  const visiblePayments = useMemo(() => {
    if (!currentUser) return [];
    if (['manager', 'admin'].includes(effectiveRole || '')) return payments;
    const visibleClientIds = new Set(visibleClients.map(c => c.id));
    return payments.filter(p => visibleClientIds.has(p.clientId));
  }, [payments, visibleClients, currentUser, effectiveRole]);

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    if (['manager', 'admin'].includes(effectiveRole || '')) return tasks;
    return tasks.filter(t => t.assignedTo === currentUser.id || t.createdBy === currentUser.id);
  }, [tasks, currentUser, effectiveRole]);

  // Actions (Service Wrappers)
  const addClient = async (client: Client) => { await clientService.addClient(client); };
  const bulkAddClients = async (newClients: Client[]) => { return await clientService.bulkAddClients(newClients); };
  
  const updateClient = async (id: ClientId, updates: ClientUpdates) => {
    const currentName = fullClients.find(c => c.id === id)?.name;
    await clientService.updateClient(id, updates as any, currentName);
  };
  
  const deleteClient = async (id: ClientId) => {
    if (!isSuperUser) throw new Error("Unauthorized");
    const clientName = fullClients.find(c => c.id === id)?.name;
    await clientService.deleteClient(id, clientName);
  };
  
  const deleteMultipleClients = async (ids: ClientId[]) => {
    if (!isSuperUser) throw new Error("Unauthorized");
    await clientService.deleteMultipleClients(ids);
  };
  
  const addComment = async (clientId: ClientId, text: string, author: string) => {
    await clientService.addComment(clientId, text, author);
  };
  
  const addPayment = async (payment: Omit<Payment, 'id'>) => { await sharedService.addPayment(payment); };
  const deletePayment = async (id: PaymentId) => {
    if (!isSuperUser) throw new Error("Unauthorized");
    await sharedService.deletePayment(id);
  };
  
  const addPrivateSession = async (session: Omit<PrivateSession, 'id'>) => { await sharedService.addPrivateSession(session); };
  const updatePrivateSession = async (id: SessionId, updates: Partial<PrivateSession>) => { await sharedService.updatePrivateSession(id, updates); };
  
  const recordSessionAttendance = async (
    clientId: ClientId,
    sessionId: SessionId,
    status: 'Attended' | 'No Show' | 'Cancelled' | 'Scheduled',
    client: Client,
    authorName: string
  ) => {
    await clientService.recordSessionAttendance(clientId, sessionId, status, client, authorName);
  };
  
  const addTask = async (task: Omit<Task, 'id' | 'createdAt' | 'createdBy'>) => {
    if (!currentUser) return;
    await sharedService.addTask({ ...task, createdBy: currentUser.id, createdAt: new Date().toISOString() });
  };
  
  const updateTask = async (id: TaskId, updates: Partial<Task>) => { await sharedService.updateTask(id, updates); };
  const deleteTask = async (id: TaskId) => { await sharedService.deleteTask(id); };
  
  const addPackage = async (pkg: Omit<Package, 'id'>) => { await sharedService.addPackage(pkg); };
  const updatePackage = async (id: PackageId, updates: Partial<Package>) => { await sharedService.updatePackage(id, updates); };
  const deletePackage = async (id: PackageId) => { await sharedService.deletePackage(id); };
  
  const addImportBatch = async (batch: Omit<ImportBatch, 'id'>) => {
    const docRef = await addDoc(collection(db, 'importBatches'), cleanData(batch));
    return docRef.id as ImportBatchId;
  };
  
  const rollbackImport = async (batchId: ImportBatchId) => {
    const clientsToRollback = fullClients.filter(c => c.importBatchId === batchId);
    for (const client of clientsToRollback) { await deleteDoc(doc(db, 'clients', client.id)); }
    await updateDoc(doc(db, 'importBatches', batchId), { status: 'Rolled Back' });
  };

  const clearAllData = async () => {
    if (!isSuperUser) throw new Error("Unauthorized");
    const collectionsToClear = ['clients', 'payments', 'sessions', 'tasks', 'packages', 'auditLogs', 'importBatches'];
    for (const collName of collectionsToClear) {
      const snapshot = await getDocs(collection(db, collName));
      let batch = writeBatch(db);
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  };

  const exportBackup = async () => { await exportDatabaseToJson(); };
  const importBackup = async (_: string) => { /* Incomplete implementation in source but kept for type compliance */ };

  const analytics = useMemo(() => {
    // 1. Revenue by Month
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    
    const revenueByMonthMap = payments.reduce((acc, p) => {
      const date = new Date(p.date || Date.now());
      if (date.getFullYear() === currentYear) {
        const monthName = months[date.getMonth()]!;
        acc[monthName] = (acc[monthName] || 0) + p.amount;
      }
      return acc;
    }, {} as Record<string, number>);

    const sessionsByMonthMap = privateSessions.reduce((acc, s) => {
      if (s.status === 'Attended') {
        const date = new Date(s.date || Date.now());
        if (date.getFullYear() === currentYear) {
          const monthName = months[date.getMonth()]!;
          acc[monthName] = (acc[monthName] || 0) + 1;
        }
      }
      return acc;
    }, {} as Record<string, number>);

    const revenueByMonth = months.map(m => ({
      month: m,
      revenue: revenueByMonthMap[m] || 0,
      sessions: sessionsByMonthMap[m] || 0
    })).slice(0, new Date().getMonth() + 1);

    // 2. Leads by Stage
    const leadsByStage = [
      { stage: 'Leads', count: fullClients.filter(c => c.status === 'Lead').length },
      { stage: 'Trial', count: fullClients.filter(c => (c as any).stage === 'Trial').length },
      { stage: 'Member', count: fullClients.filter(c => c.status === 'Active' || c.status === 'Nearly Expired').length },
    ];

    // 3. Membership Stats
    const totalMembers = fullClients.filter(c => ['Active', 'Nearly Expired', 'Expired'].includes(c.status)).length;
    const active = fullClients.filter(c => c.status === 'Active' || c.status === 'Nearly Expired').length;
    
    const membershipStats = [
      { name: 'Active', value: active },
      { name: 'Expired', value: fullClients.filter(c => c.status === 'Expired').length },
    ];

    // 4. Conversion Rate
    const leadsCount = fullClients.filter(c => c.status === 'Lead').length;
    const membersCount = fullClients.filter(c => c.status === 'Active').length;
    const conversionRate = leadsCount > 0 ? Math.round((membersCount / (leadsCount + membersCount)) * 100) : 0;

    return {
      revenueByMonth,
      leadsByStage,
      membershipStats,
      conversionRate
    };
  }, [payments, fullClients]);

  const value = useMemo(() => ({
    clients: visibleClients,
    payments: visiblePayments,
    privateSessions,
    auditLogs,
    tasks: visibleTasks,
    packages,
    importBatches,
    userTargets,
    addClient,
    bulkAddClients,
    updateClient,
    deleteClient,
    deleteMultipleClients,
    addComment,
    addPayment,
    deletePayment,
    addPrivateSession,
    updatePrivateSession,
    addTask,
    updateTask,
    deleteTask,
    addPackage,
    updatePackage,
    deletePackage,
    addImportBatch,
    rollbackImport,
    clearAllData,
    exportBackup,
    importBackup,
    recordSessionAttendance,
    analytics
  }), [visibleClients, visiblePayments, privateSessions, auditLogs, visibleTasks, packages, importBatches, userTargets, isSuperUser, analytics]);

  return <CRMContext.Provider value={value}>{children}</CRMContext.Provider>;
};

export const useCRMData = () => {
  const context = useContext(CRMContext);
  if (!context) throw new Error('useCRMData must be used within a CRMProvider');
  return context;
};
