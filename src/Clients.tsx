import React, { useState, useDeferredValue, useRef } from 'react';
import { useAppContext } from './context';
import { useLanguage } from './contexts/LanguageContext';
import { ASSIGNABLE_ROLES, toCanonical } from './constants';
import { usePackages } from './hooks/usePackages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Trash2, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Gift, Phone, Calendar, Download, Plus, Minus, Search, ArrowUpDown, QrCode, RefreshCw, User, Users, UserPlus, Copy, MessageSquare, Activity } from 'lucide-react';
import { Client, InteractionType, InteractionOutcome, AuditLog, ClientPackage } from './types';
import { format, parseISO, isAfter, isBefore, addDays, subDays, differenceInDays } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { ConfirmDialog } from './components/ConfirmDialog';
import ImportData from './ImportData';
import ImportHistory from './ImportHistory';
import { WhatsAppDialog } from './components/WhatsAppDialog';
import { MessageCircle } from 'lucide-react';
import RenewalPipeline from './components/RenewalPipeline';
import ResyncAssignments from './components/ResyncAssignments';
import ResyncPayments from './components/ResyncPayments';
import { writeBatch, doc, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { cleanData } from './utils';
import { generateClientContract } from './utils/pdfGenerator';
import { downloadFile } from './utils/download';

// Migrate legacy packageType to new packages array format
const migratePackageData = (client: Client, systemPackages: any[]): Partial<Client> => {
  if (client.packages && client.packages.length > 0) return {}; // Already migrated
  if (!client.packageType || client.packageType === 'Unknown') return {}; // No legacy data

  const sysPkg = systemPackages.find(p => p.name === client.packageType);
  const startDate = client.startDate || new Date().toISOString();
  const endDate = sysPkg ? addDays(parseISO(startDate), sysPkg.expiryDays).toISOString() : (client.membershipExpiry || addDays(new Date(), 30).toISOString());

  return {
    packages: [{
      id: Math.random().toString(36).substring(7),
      packageName: client.packageType,
      startDate,
      endDate,
      sessionsTotal: typeof client.sessionsRemaining === 'number' ? client.sessionsRemaining : sysPkg?.sessions || 0,
      sessionsRemaining: typeof client.sessionsRemaining === 'number' ? client.sessionsRemaining : sysPkg?.sessions || 0,
      status: client.status === 'Expired' ? 'Expired' : client.status === 'Nearly Expired' ? 'Active' : 'Active' as const,
    }],
  };
};

export const getMemberCategory = (client: Client): 'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults' => {
  if (client.memberCategory) return client.memberCategory;
  const pkgStr = (client.packageType || '').toLowerCase();
  if (pkgStr.includes('kids pro')) return 'Kids Pro';
  if (pkgStr.includes('kids')) return 'Kids Only';
  if (pkgStr.includes('junior advanced') || pkgStr.includes('juniors advanced') || pkgStr.includes('junior pro')) return 'Junior Advanced';
  if (pkgStr.includes('junior')) return 'Junior Only';
  if (pkgStr.includes('adult')) return 'Adults';
  return 'Adults';
};

export default function Clients() {
  const { t } = useLanguage();
  const { currentUser, users, payments, clients, addClient, updateClient, deleteClient, deleteMultipleClients, addComment, addInteraction, canViewGlobalDashboard, canDeleteRecords, recalculateAllPackages, isManagerOrSama, branches, processPaymentTransaction, fetchClientDetails, createClientAccount, activeClientId, setActiveClientId, auditLogs, features, attendances } = useAppContext();
  const { packages } = usePackages();
  const visiblePackages = React.useMemo(() => {
    return packages.filter(p => features?.ptPackages !== false || p.type !== 'Private');
  }, [packages, features]);
  const activeClient = activeClientId ? clients.find(c => c.id === activeClientId) : null;

  const handleUpdateSessionsRemaining = async (change: number) => {
    if (!activeClient) return;
    
    let newSessions = activeClient.sessionsRemaining;
    if (typeof newSessions === 'number') {
      newSessions = Math.max(0, newSessions + change);
    } else {
      const currentNum = parseInt(newSessions as any) || 0;
      newSessions = Math.max(0, currentNum + change);
    }

    const updates: any = {
      sessionsRemaining: newSessions
    };

    if (activeClient.packages && activeClient.packages.length > 0) {
      const packagesCopy = [...activeClient.packages];
      const activePkgIdx = packagesCopy.findIndex(p => p.status === 'Active');
      if (activePkgIdx !== -1) {
        const activePkg = packagesCopy[activePkgIdx];
        if (activePkg) {
          let pkgSessions = activePkg.sessionsRemaining;
          if (typeof pkgSessions === 'number') {
            pkgSessions = Math.max(0, pkgSessions + change);
          } else {
            const currentNum = parseInt(pkgSessions as any) || 0;
            pkgSessions = Math.max(0, currentNum + change);
          }
          packagesCopy[activePkgIdx] = {
            ...activePkg,
            sessionsRemaining: pkgSessions
          } as ClientPackage;
          updates.packages = packagesCopy;
        }
      }
    }

    await updateClient(activeClient.id, updates);
  };

  const updateClientPackages = (newPkgs: ClientPackage[]) => {
    if (!activeClient) return;
    
    const activePkg = newPkgs.find(p => p.status === 'Active');
    const updates: any = {
      packages: newPkgs
    };

    if (activePkg) {
      updates.packageType = activePkg.packageName || '';
      updates.sessionsRemaining = activePkg.sessionsRemaining !== undefined ? activePkg.sessionsRemaining : 0;
      if (activePkg.startDate) updates.startDate = activePkg.startDate;
      if (activePkg.endDate) updates.membershipExpiry = activePkg.endDate;
    } else {
      updates.sessionsRemaining = 0;
    }

    updateClient(activeClient.id, updates);
  };
  const [activeTab, setActiveTab] = useState('active');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [isBulkPackageDialogOpen, setIsBulkPackageDialogOpen] = useState(false);
  const [bulkSelectedPackageName, setBulkSelectedPackageName] = useState('');
  
  // Lazy Loading Details State
  const [activeClientDetails, setActiveClientDetails] = useState<{clientId: string, comments: any[], interactions: any[]} | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  const loadClientDetails = async (clientId: string) => {
    setIsDetailsLoading(true);
    const details = await fetchClientDetails(clientId);
    setActiveClientDetails({ clientId, ...details });
    setIsDetailsLoading(false);
  };
  const [isActivatingPortal, setIsActivatingPortal] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [whatsAppClient, setWhatsAppClient] = useState<Client | null>(null);

  React.useEffect(() => {
    if (activeClientId) {
      loadClientDetails(activeClientId);
      const client = clients.find(c => c.id === activeClientId);
      if (client) {
        const migrationData = migratePackageData(client, packages);
        if (Object.keys(migrationData).length > 0) {
          updateClient(client.id, migrationData);
        }
      }
    }
  }, [activeClientId, clients, packages]);

  const [isNewMemberOpen, setIsNewMemberOpen] = useState(false);
  const [isRecalculateConfirmOpen, setIsRecalculateConfirmOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberBranch, setNewMemberBranch] = useState<any>('');
  const [newMemberAssignedTo, setNewMemberAssignedTo] = useState<string>('');
  const [newMemberLinked, setNewMemberLinked] = useState(false);
  const [newMemberGender, setNewMemberGender] = useState<'Male' | 'Female' | 'Other' | 'Prefer not to say'>('Male');
  const [newMemberCategory, setNewMemberCategory] = useState<'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults'>('Adults');

  const [upgradeDialogClientId, setUpgradeDialogClientId] = useState<string | null>(null);
  const [upgradePkgName, setUpgradePkgName] = useState('');
  const [upgradeStartDate, setUpgradeStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [upgradePaymentMethod, setUpgradePaymentMethod] = useState('Cash');
  const [upgradeInstapayRef, setUpgradeInstapayRef] = useState('');
  const [upgradeSalesRep, setUpgradeSalesRep] = useState('unassigned');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState('All');
  const [filterRep, setFilterRep] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [filterDiscount, setFilterDiscount] = useState('All');
  const [filterGender, setFilterGender] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');

  // Interaction Logging State
  const [interactionType, setInteractionType] = useState<InteractionType>('Call');
  const [interactionOutcome, setInteractionOutcome] = useState<InteractionOutcome>('Interested');
  const [interactionNotes, setInteractionNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [newComment, setNewComment] = useState('');

  // Member Details Sub-Tabs States
  const [freezePackageId, setFreezePackageId] = useState<string>('');
  const [freezeType, setFreezeType] = useState<'Normal' | 'Back Freeze' | 'Medical'>('Normal');
  const [freezeStartDate, setFreezeStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [freezeEndDate, setFreezeEndDate] = useState<string>('');
  const [freezeReason, setFreezeReason] = useState<string>('');
  const [newDocName, setNewDocName] = useState<string>('');
  const [newDocUrl, setNewDocUrl] = useState<string>('');
  const [transferPackageId, setTransferPackageId] = useState<string>('');
  const [transferRecipientId, setTransferRecipientId] = useState<string>('');
  const [accountRecipientId, setAccountRecipientId] = useState<string>('');

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredFilterBranch = useDeferredValue(filterBranch);

  // Debounce timers for member name/phone updates
  const debounceTimers = useRef<Record<string, any>>({});
  const debouncedUpdate = (clientId: string, updates: any, delayMs = 500) => {
    const key = `${clientId}-${Object.keys(updates)[0]}`;
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }
    debounceTimers.current[key] = setTimeout(() => {
      updateClient(clientId, updates);
      delete debounceTimers.current[key];
    }, delayMs);
  };
  const deferredFilterRep = useDeferredValue(filterRep);
  const deferredActiveTab = useDeferredValue(activeTab);
  const deferredSortBy = useDeferredValue(sortBy);
  const deferredFilterDiscount = useDeferredValue(filterDiscount);
  const deferredFilterGender = useDeferredValue(filterGender);
  const deferredFilterCategory = useDeferredValue(filterCategory);

  const handleAddMember = () => {
    if (!newMemberName || newMemberName.trim().length < 2) {
      alert('Please enter a valid member name (at least 2 characters).');
      return;
    }
    if (!newMemberPhone || newMemberPhone.trim().length < 10) {
      alert('Please enter a valid phone number (at least 10 digits).');
      return;
    }
    
    addClient({
      id: Math.random().toString(36).substr(2, 9),
      name: newMemberName,
      phone: newMemberPhone,
      status: 'Active',
      branch: newMemberBranch || undefined,
      stage: 'Converted',
      comments: [],
      interactions: [],
      assignedTo: newMemberAssignedTo || (currentUser?.role === 'rep' ? currentUser.id : undefined),
      startDate: new Date().toISOString(),
      linkedAccount: newMemberLinked || undefined,
      gender: newMemberGender,
      memberCategory: newMemberCategory,
    });
    setIsNewMemberOpen(false);
    setNewMemberName('');
    setNewMemberPhone('');
    setNewMemberBranch('');
    setNewMemberAssignedTo('');
    setNewMemberLinked(false);
    setNewMemberGender('Male');
    setNewMemberCategory('Adults');
  };

  const handleAddInteraction = async (clientId: string) => {
    const newIA = {
      type: interactionType,
      outcome: interactionOutcome,
      notes: interactionNotes,
      date: new Date().toISOString(),
      nextFollowUp: nextFollowUpDate || undefined,
      author: currentUser?.name || 'Admin'
    };
    
    await addInteraction(clientId, newIA);

    if (activeClientDetails?.clientId === clientId) {
      setActiveClientDetails(prev => prev ? {
        ...prev,
        interactions: [{ ...newIA, id: 'temp-'+Date.now() }, ...prev.interactions]
      } : null);
    }

    setInteractionNotes('');
    setNextFollowUpDate('');
  };

  const handleUpgradePackage = async () => {
    if (!upgradeDialogClientId || !upgradePkgName) return;
    const client = clients.find(c => c.id === upgradeDialogClientId);
    if (!client) return;
    const pkg = packages.find(p => p.name === upgradePkgName);
    if (!pkg) return;
    
    const prevActive = (client.packages || []).find(p => p.status === 'Active');
    const prevSysPkg = prevActive ? packages.find(p => p.name === prevActive.packageName) : null;
    const priceDiff = prevSysPkg ? pkg.price - prevSysPkg.price : pkg.price;
    const amountToPay = Math.max(0, priceDiff);

    const repId = upgradeSalesRep !== 'unassigned' ? upgradeSalesRep : (currentUser?.id || '');
    const repName = users.find(u => u.id === repId)?.name || '';

    if (upgradePaymentMethod === 'Instapay' && upgradeInstapayRef && !/^\d{12}$/.test(upgradeInstapayRef)) {
      alert('Please enter a valid 12-digit Instapay reference number.');
      return;
    }

    try {
      await processPaymentTransaction({
        clientId: client.id,
        clientName: client.name,
        clientBranch: client.branch,
        clientStatus: client.status,
        clientPackages: client.packages,
        amount: amountToPay,
        method: upgradePaymentMethod as any,
        instapayRef: upgradePaymentMethod === 'Instapay' ? upgradeInstapayRef : undefined,
        packageType: pkg.name,
        packageCategory: pkg.name.toLowerCase().includes('pt') || pkg.name.toLowerCase().includes('private') ? 'Private Training' : 'Group Training',
        sales_rep_id: repId,
        salesName: repName,
        recordedBy: currentUser?.id || '',
        recordedByName: currentUser?.name || '',
        paymentDate: new Date(upgradeStartDate).toISOString(),
        startDate: new Date(upgradeStartDate).toISOString(),
        systemPackage: pkg,
        previousPackageName: prevActive?.packageName || client.packageType,
        isUpgradePayment: true
      });
    } catch (error) {
      console.error("Error during upgrade transaction:", error);
      alert(error instanceof Error ? error.message : "Failed to process upgrade. Please try again.");
    } finally {
      setUpgradeDialogClientId(null);
      setUpgradePkgName('');
      setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd'));
      setUpgradePaymentMethod('Cash');
      setUpgradeInstapayRef('');
      setUpgradeSalesRep('unassigned');
    }
  };

  const handleRedeemPoints = async (pointsCost: number, actionType: 'juice' | 'group_session' | 'private_session') => {
    if (!activeClient) return;
    const currentPoints = activeClient.points || 0;
    if (currentPoints < pointsCost) {
      alert("Insufficient points balance.");
      return;
    }

    const newPoints = currentPoints - pointsCost;

    try {
      if (actionType === 'juice') {
        // Add completed order to juiceBarOrders
        await addDoc(collection(db, 'juiceBarOrders'), {
          clientId: activeClient.id,
          clientName: activeClient.name,
          items: [{ name: 'Points Reward Drink', quantity: 1, price: 0 }],
          totalAmount: 0,
          pickupTime: 'Now',
          status: 'Completed',
          orderedAt: new Date().toISOString()
        });
        await updateClient(activeClient.id, { points: newPoints });
      } else {
        // Add session to package
        const isGroup = actionType === 'group_session';
        const packagesCopy = [...(activeClient.packages || [])];
        const activePkgIdx = packagesCopy.findIndex(p => p.status === 'Active');
        if (activePkgIdx !== -1) {
          const activePkg = packagesCopy[activePkgIdx];
          if (activePkg) {
            const sessionsRemaining = activePkg.sessionsRemaining;
            const newSessionsLeft = typeof sessionsRemaining === 'number' ? sessionsRemaining + 1 : 1;
            packagesCopy[activePkgIdx] = {
              ...activePkg,
              sessionsRemaining: newSessionsLeft
            } as ClientPackage;
            await updateClient(activeClient.id, { 
              points: newPoints, 
              packages: packagesCopy,
              sessionsRemaining: newSessionsLeft
            });
          }
        } else {
          const sessionsRemaining = activeClient.sessionsRemaining;
          await updateClient(activeClient.id, { 
            points: newPoints, 
            sessionsRemaining: typeof sessionsRemaining === 'number' ? sessionsRemaining + 1 : 1
          });
        }
      }

      // Add audit log
      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'client',
        entityId: activeClient.id,
        details: `Redeemed ${pointsCost} points for ${
          actionType === 'juice' ? 'a Juice Bar Drink' : actionType === 'group_session' ? '1 Group Session credit' : '1 Private Session credit'
        }. New balance: ${newPoints} pts.`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'staff',
        userName: currentUser?.name || 'Staff'
      });

      alert("Points redeemed successfully!");
      loadClientDetails(activeClient.id);
    } catch (error) {
      console.error("Points redemption error:", error);
      alert("Failed to redeem points. Please try again.");
    }
  };

  const handleFreezePackage = async () => {
    if (!activeClient) return;
    if (!freezePackageId) {
      alert("Please select a package to freeze.");
      return;
    }
    if (!freezeStartDate || !freezeEndDate) {
      alert("Please select freeze start and end dates.");
      return;
    }

    const packagesCopy = [...(activeClient.packages || [])];
    const pkgIdx = packagesCopy.findIndex(p => p.id === freezePackageId);
    if (pkgIdx === -1) {
      alert("Selected package not found.");
      return;
    }

    try {
      const pkg = packagesCopy[pkgIdx];
      if (!pkg) {
        alert("Selected package not found.");
        return;
      }
      packagesCopy[pkgIdx] = {
        ...pkg,
        status: 'Hold',
        isOnHold: true,
        holdReason: `${freezeType} Freeze: ${freezeReason || 'No details provided'}`,
        holdDate: new Date().toISOString(),
        startDate: freezeStartDate,
        endDate: freezeEndDate
      };

      await updateClient(activeClient.id, {
        status: 'Hold',
        packages: packagesCopy
      });

      // Log audit event
      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'client',
        entityId: activeClient.id,
        details: `Placed package "${pkg.packageName}" on Hold (${freezeType} Freeze) from ${freezeStartDate} to ${freezeEndDate}.`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'staff',
        userName: currentUser?.name || 'Staff'
      });

      alert("Package frozen successfully.");
      setFreezeReason('');
      setFreezeEndDate('');
      setFreezePackageId('');
      loadClientDetails(activeClient.id);
    } catch (error) {
      console.error("Package freeze error:", error);
      alert("Failed to freeze package.");
    }
  };

  const handleUnfreezePackage = async (pkgId: string) => {
    if (!activeClient) return;
    const packagesCopy = [...(activeClient.packages || [])];
    const pkgIdx = packagesCopy.findIndex(p => p.id === pkgId);
    if (pkgIdx === -1) return;

    try {
      const pkg = packagesCopy[pkgIdx];
      if (!pkg) return;
      packagesCopy[pkgIdx] = {
        ...pkg,
        status: 'Active',
        isOnHold: false,
        holdReason: '',
        holdDate: ''
      };

      await updateClient(activeClient.id, {
        status: 'Active',
        packages: packagesCopy
      });

      // Log audit event
      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'client',
        entityId: activeClient.id,
        details: `Resumed/unfroze package "${pkg.packageName}". Status set back to Active.`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'staff',
        userName: currentUser?.name || 'Staff'
      });

      alert("Package unfrozen successfully.");
      loadClientDetails(activeClient.id);
    } catch (error) {
      console.error("Package unfreeze error:", error);
      alert("Failed to unfreeze package.");
    }
  };

  const handleAddDocument = async () => {
    if (!activeClient) return;
    if (!newDocName.trim() || !newDocUrl.trim()) {
      alert("Please enter document name and URL.");
      return;
    }

    try {
      const newDocObj = {
        id: Math.random().toString(36).substring(7),
        name: newDocName.trim(),
        url: newDocUrl.trim(),
        uploadDate: new Date().toISOString()
      };

      const updatedDocs = [...(activeClient.documents || []), newDocObj];
      await updateClient(activeClient.id, { documents: updatedDocs });

      // Log audit event
      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'client',
        entityId: activeClient.id,
        details: `Added document: "${newDocName.trim()}".`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'staff',
        userName: currentUser?.name || 'Staff'
      });

      alert("Document logged successfully.");
      setNewDocName('');
      setNewDocUrl('');
      loadClientDetails(activeClient.id);
    } catch (error) {
      console.error("Document upload error:", error);
      alert("Failed to save document.");
    }
  };

  const handleTransferPackage = async () => {
    if (!activeClient) return;
    if (!transferPackageId) {
      alert("Please select a package to transfer.");
      return;
    }
    if (!transferRecipientId) {
      alert("Please select a recipient member.");
      return;
    }

    const recipient = clients.find(c => c.id === transferRecipientId);
    if (!recipient) {
      alert("Recipient member not found.");
      return;
    }

    const sourcePkgs = [...(activeClient.packages || [])];
    const pkgIdx = sourcePkgs.findIndex(p => p.id === transferPackageId);
    if (pkgIdx === -1) {
      alert("Package not found.");
      return;
    }

    try {
      const transferPkg = sourcePkgs[pkgIdx];
      if (!transferPkg) {
        alert("Package not found.");
        return;
      }
      const updatedSourcePkgs = sourcePkgs.filter(p => p.id !== transferPackageId);
      const recipientPkgs = [...(recipient.packages || []), { ...transferPkg, status: 'Active' as const }];

      await updateClient(activeClient.id, { packages: updatedSourcePkgs });
      await updateClient(recipient.id, { packages: recipientPkgs, status: 'Active' });

      // Log audit events
      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'client',
        entityId: activeClient.id,
        details: `Transferred package "${transferPkg.packageName}" to ${recipient.name} (ID: ${recipient.memberId || 'None'}).`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'staff',
        userName: currentUser?.name || 'Staff'
      });

      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'client',
        entityId: recipient.id,
        details: `Received transferred package "${transferPkg.packageName}" from ${activeClient.name} (ID: ${activeClient.memberId || 'None'}).`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'staff',
        userName: currentUser?.name || 'Staff'
      });

      alert(`Package successfully transferred to ${recipient.name}.`);
      setTransferPackageId('');
      setTransferRecipientId('');
      loadClientDetails(activeClient.id);
    } catch (error) {
      console.error("Package transfer error:", error);
      alert("Failed to transfer package.");
    }
  };

  const handleTransferAccount = async () => {
    if (!activeClient) return;
    if (!accountRecipientId) {
      alert("Please select a recipient member to merge/transfer account details.");
      return;
    }

    const recipient = clients.find(c => c.id === accountRecipientId);
    if (!recipient) {
      alert("Recipient member not found.");
      return;
    }

    if (window.confirm(`Are you sure you want to merge and transfer all remaining packages, points, and account balances from ${activeClient.name} to ${recipient.name}? This action cannot be undone.`)) {
      try {
        const sourcePkgs = activeClient.packages || [];
        const sourcePoints = activeClient.points || 0;
        const updatedSourcePkgs = sourcePkgs.map(p => ({ ...p, status: 'Cancelled' as const }));
        const recipientPkgs = [...(recipient.packages || []), ...sourcePkgs.map(p => ({ ...p, id: Math.random().toString(36).substring(7) }))];
        const recipientPoints = (recipient.points || 0) + sourcePoints;

        await updateClient(activeClient.id, { packages: updatedSourcePkgs, points: 0, status: 'Expired' });
        await updateClient(recipient.id, { packages: recipientPkgs, points: recipientPoints, status: 'Active' });

        // Log audit events
        await addDoc(collection(db, 'auditLogs'), {
          action: 'UPDATE',
          entityType: 'client',
          entityId: activeClient.id,
          details: `Transferred whole account packages and ${sourcePoints} points to ${recipient.name}. Account deactivated.`,
          timestamp: new Date().toISOString(),
          userId: currentUser?.id || 'staff',
          userName: currentUser?.name || 'Staff'
        });

        await addDoc(collection(db, 'auditLogs'), {
          action: 'UPDATE',
          entityType: 'client',
          entityId: recipient.id,
          details: `Merged/received packages and ${sourcePoints} points from ${activeClient.name} via account transfer.`,
          timestamp: new Date().toISOString(),
          userId: currentUser?.id || 'staff',
          userName: currentUser?.name || 'Staff'
        });

        alert(`Account merged and transferred successfully to ${recipient.name}.`);
        setAccountRecipientId('');
        setActiveClientId(null);
      } catch (error) {
        console.error("Account transfer error:", error);
        alert("Failed to transfer account.");
      }
    }
  };

  const handleAddComment = async (clientId: string) => {
    if (!newComment.trim()) return;
    const commentData = {
      id: 'temp-' + Date.now(),
      text: newComment,
      author: currentUser?.name || 'Admin',
      date: new Date().toISOString()
    };
    await addComment(clientId, newComment);
    
    if (activeClientDetails?.clientId === clientId) {
      setActiveClientDetails(prev => prev ? {
        ...prev,
        comments: [commentData, ...prev.comments]
      } : null);
    }
    
    setNewComment('');
  };
  const getQRCodeAsBlob = async (memberId: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const svg = document.querySelector(`[data-qr-id="${memberId}"]`);
      if (!svg) {
        reject(new Error('QR Code SVG not found'));
        return;
      }
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/png');
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    });
  };

  const downloadQRCode = async (memberId: string, name: string) => {
    try {
      const blob = await getQRCodeAsBlob(memberId);
      downloadFile(blob, `QR_${name.replace(/\s+/g, '_')}_${memberId}.png`);
    } catch (error) {
      console.error('Error downloading QR code:', error);
      alert('Failed to download QR code');
    }
  };

  const copyQRCodeToClipboard = async (memberId: string) => {
    try {
      const blob = await getQRCodeAsBlob(memberId);
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      alert('QR code copied to clipboard!');
    } catch (error) {
      console.error('Error copying QR code:', error);
      alert('Failed to copy QR code to clipboard');
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const now = new Date();

  // context.clients is already visibleClients (rep-filtered via isClientAssignedToRep).
  const members = clients.filter(c => c.status !== 'Lead');
  
  const activeMembers = members.filter(c => c.status === 'Active');
  const nearlyExpired = members.filter(c => c.status === 'Nearly Expired');
  const expired = members.filter(c => c.status === 'Expired');
  const onHold = members.filter(c => c.status === 'Hold');

  const maleCount = members.filter(c => c.gender === 'Male').length;
  const femaleCount = members.filter(c => c.gender === 'Female').length;
  const otherGenderCount = members.filter(c => c.gender === 'Other' || c.gender === 'Prefer not to say').length;
  
  const upcomingBirthdays = members.filter(c => {
    if (!c.dateOfBirth) return false;
    const dob = parseISO(c.dateOfBirth);
    const dobThisYear = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    return isAfter(dobThisYear, subDays(now, 1)) && isBefore(dobThisYear, addDays(now, 7));
  });

  const getFilteredMembers = () => {
    let base = [];
    switch (deferredActiveTab) {
      case 'active': base = [...activeMembers, ...nearlyExpired]; break;
      case 'hold': base = onHold; break;
      case 'expired': base = expired; break;
      default: base = [...activeMembers, ...nearlyExpired]; break;
    }

    let filtered = base;

    // Search
    if (deferredSearchTerm) {
      const term = deferredSearchTerm.toLowerCase();
      filtered = filtered.filter(m => 
        m.name.toLowerCase().includes(term) || 
        m.phone.includes(term) ||
        (m.memberId && m.memberId.toString().includes(term))
      );
    }

    // Branch
    if (deferredFilterBranch !== 'All') {
      filtered = filtered.filter(m => m.branch === deferredFilterBranch);
    }

    // Assigned Rep filter (managers/admins only)
    // Checks both assignedTo (userId) AND salesName (legacy name string from import)
    if (deferredFilterRep !== 'all') {
      if (deferredFilterRep === 'unassigned') {
        // Show clients with no assignedTo AND no matching salesName
        filtered = filtered.filter(m => {
          if (m.assignedTo && m.assignedTo !== '') return false;
          if (m.salesName) {
            const matchedRep = users.find(u => u.name && toCanonical(m.salesName!).toLowerCase() === toCanonical(u.name).toLowerCase());
            if (matchedRep) return false; // Has a salesName matching a known rep → not unassigned
          }
          return true;
        });
      } else {
        filtered = filtered.filter(m => {
          const repUser = users.find(u => u.id === deferredFilterRep);
          if (!repUser) return false;
          // Match by userId
          if (m.assignedTo === deferredFilterRep) return true;
          // Match by legacy salesName (case-insensitive) for imported records
          if (m.salesName && repUser.name && toCanonical(m.salesName).toLowerCase() === toCanonical(repUser.name).toLowerCase()) return true;
          return false;
        });
      }
    }

    // Discount filter
    if (deferredFilterDiscount === 'with-discount') {
      filtered = filtered.filter(m => m.hasDiscount);
    } else if (deferredFilterDiscount === 'no-discount') {
      filtered = filtered.filter(m => !m.hasDiscount);
    }

    if (deferredFilterGender && deferredFilterGender !== 'All') {
      filtered = filtered.filter(m => m.gender === deferredFilterGender);
    }

    if (deferredFilterCategory && deferredFilterCategory !== 'All') {
      filtered = filtered.filter(m => getMemberCategory(m) === deferredFilterCategory);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      if (deferredSortBy === 'id-asc') return (Number(a.memberId) || 0) - (Number(b.memberId) || 0);
      if (deferredSortBy === 'id-desc') return (Number(b.memberId) || 0) - (Number(a.memberId) || 0);
      if (deferredSortBy === 'newest') {
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA;
      }
      return 0;
    });

    return filtered;
  };

  const filteredMembers = getFilteredMembers();
  const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);
  const paginatedMembers = filteredMembers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedClientIds(paginatedMembers.map(c => c.id));
    } else {
      setSelectedClientIds([]);
    }
  };

  const handleSelectClient = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedClientIds(prev => [...prev, id]);
    } else {
      setSelectedClientIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    await deleteMultipleClients(selectedClientIds);
    setSelectedClientIds([]);
  };

  const changeClientPackage = async (clientId: string, newPackageName: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    const sysPkg = packages.find(p => p.name === newPackageName);
    if (!sysPkg) return;

    const isPt = sysPkg.name.toLowerCase().includes('pt') || sysPkg.name.toLowerCase().includes('private');
    const category = isPt ? 'Private Training' : 'Group Training';

    // 1. Prepare packages list
    const packagesCopy = [...(client.packages || [])];
    const activePkgIdx = packagesCopy.findIndex(p => p.status === 'Active');
    
    const now = new Date();
    const startDateStr = now.toISOString();
    const endDateStr = new Date(now.getTime() + sysPkg.expiryDays * 24 * 60 * 60 * 1000).toISOString();

    const newClientPkg: ClientPackage = {
      id: 'pkg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      packageName: sysPkg.name,
      startDate: startDateStr,
      endDate: endDateStr,
      sessionsTotal: sysPkg.sessions,
      sessionsRemaining: sysPkg.sessions,
      status: 'Active',
      subscriptionType: 'renew'
    };

    if (activePkgIdx !== -1) {
      // Deactivate the old active package
      const activePkg = packagesCopy[activePkgIdx];
      if (activePkg) {
        packagesCopy[activePkgIdx] = {
          ...activePkg,
          id: activePkg.id || 'pkg-' + Date.now(),
          status: 'Expired',
          endDate: startDateStr
        };
      }
    }
    
    // Add the new active package
    packagesCopy.push(newClientPkg);

    // 2. Perform Firestore update
    await updateClient(client.id, {
      packageType: sysPkg.name,
      sessionsRemaining: sysPkg.sessions,
      startDate: startDateStr,
      membershipExpiry: endDateStr,
      packages: packagesCopy
    });

    // 3. Log Audit Log
    await addDoc(collection(db, 'auditLogs'), {
      action: 'UPDATE',
      entityType: 'CLIENT',
      entityId: client.id,
      details: `Active package corrected to ${sysPkg.name} (Sessions: ${sysPkg.sessions}, Expiry Days: ${sysPkg.expiryDays})`,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || '',
      userName: currentUser?.name || '',
      branch: client.branch || ''
    });
  };

  const confirmBulkUpdatePackage = async () => {
    if (!bulkSelectedPackageName) return;
    setIsBulkPackageDialogOpen(false);
    
    let successCount = 0;
    try {
      for (const clientId of selectedClientIds) {
        await changeClientPackage(clientId, bulkSelectedPackageName);
        successCount++;
      }
      toast.success(`Successfully updated package for ${successCount} members.`);
    } catch (err) {
      console.error(err);
      toast.error(`Error updating packages. Updated ${successCount} members.`);
    } finally {
      setSelectedClientIds([]);
      setBulkSelectedPackageName('');
    }
  };

  const handleDeleteClient = async (id: string) => {
    setClientToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteClient = async () => {
    if (clientToDelete) {
      await deleteClient(clientToDelete);
      setClientToDelete(null);
    }
  };

  // Reset page when tab or filters change
  React.useEffect(() => {
    setCurrentPage(1);
    setSelectedClientIds([]);
  }, [activeTab, searchTerm, filterBranch, filterRep, sortBy, filterDiscount, filterGender, filterCategory]);

  const exportToCSV = () => {
    const headers = ['Member ID', 'Name', 'Phone', 'Branch', 'Package', 'Packages Rem.', 'Status', 'Expiry Date', 'Total Paid', 'Assigned To'];
    
    // Pre-calculate payments to O(N) map to avoid O(N*M) performance crash on large datasets
    const paymentTotals = new Map<string, number>();
    for (const p of payments) {
      paymentTotals.set(p.clientId, (paymentTotals.get(p.clientId) || 0) + p.amount);
    }
    
    // Using a map for users for O(N) lookup
    const userMap = new Map<string, string>();
    for (const u of users) {
      userMap.set(u.id, u.name || 'Unassigned');
    }

    const getAssignedName = (id?: string) => {
      if (!id) return 'Unassigned';
      return userMap.get(id) || id; // Return user name or the literal name (for sales members without accounts)
    };

    const csvRows = [
      headers.join(','),
      ...members.map(c => {
        const totalPaid = paymentTotals.get(c.id) || 0;
        const assignedUser = getAssignedName(c.assignedTo);
        return [
          `"${c.memberId || ''}"`,
          `"${c.name}"`,
          `"${c.phone}"`,
          `"${c.branch || ''}"`,
          `"${c.packageType || ''}"`,
          `"${c.sessionsRemaining || ''}"`,
          `"${c.status}"`,
          `"${c.membershipExpiry ? format(parseISO(c.membershipExpiry), 'yyyy-MM-dd') : ''}"`,
          `"${totalPaid}"`,
          `"${assignedUser}"`
        ].join(',');
      })
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `members_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active': return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Active</Badge>;
      case 'Nearly Expired': return <Badge className="bg-amber-500"><AlertTriangle className="w-3 h-3 mr-1" /> Expiring Soon</Badge>;
      case 'Expired': return <Badge variant="destructive">Expired</Badge>;
      case 'Hold': return <Badge className="bg-blue-500 text-white border-blue-500">Hold</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderClientTable = (clientList: Client[]) => (
    <div>
      {/* ── Mobile card list (< md) ── */}
      <div className="md:hidden divide-y divide-border">
        {clientList.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t('members.no_members')}</div>
        ) : clientList.map(client => {
          const totalPaid = payments.filter(p => p.clientId === client.id).reduce((s, p) => s + p.amount, 0);
          const assignedName = (() => {
            if (!client.assignedTo) return client.salesName || null;
            const u = users.find(u => u.id === client.assignedTo);
            return u ? (u.name || u.email) : client.salesName || client.assignedTo;
          })();
          return (
            <div key={client.id} className="flex items-center gap-3 px-4 py-3">
              <Checkbox
                checked={selectedClientIds.includes(client.id)}
                onCheckedChange={(checked) => handleSelectClient(client.id, !!checked)}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {client.memberId && <span className="text-[10px] font-bold text-muted-foreground">#{client.memberId}</span>}
                  <span className="font-semibold text-sm truncate">{client.name}</span>
                  {upcomingBirthdays.some(b => b.id === client.id) && <Gift className="h-3.5 w-3.5 text-pink-500 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {getStatusBadge(client.status)}
                  <Badge variant="outline" className="font-bold text-[9px] uppercase bg-indigo-500/10 text-indigo-400 border-indigo-500/20 px-1.5 py-0 h-4 shrink-0">
                    {getMemberCategory(client)}
                  </Badge>
                  {typeof client.sessionsRemaining === 'number' ? (
                    <Badge variant={client.sessionsRemaining < 0 ? 'destructive' : 'secondary'} className="text-[10px] h-4">
                      {client.sessionsRemaining} {t('common.left')}
                    </Badge>
                  ) : client.sessionsRemaining === 'unlimited' ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200 border text-[10px] h-4">∞</Badge>
                  ) : null}
                  {client.membershipExpiry && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Calendar className="h-3 w-3" />
                      {format(parseISO(client.membershipExpiry), 'MMM d, yy')}
                    </span>
                  )}
                  {assignedName && (
                    <span className="text-[10px] text-muted-foreground">{assignedName}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-500 hover:bg-green-50 hover:text-green-600"
                  onClick={() => setWhatsAppClient(client)}
                  title="Send WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:bg-muted"
                  onClick={() => setActiveClientId(client.id)}
                  title={t('common.manage') || 'Manage'}
                >
                  <User className="h-4 w-4" />
                </Button>
                {canDeleteRecords && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteClient(client.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Desktop table (≥ md) ── */}
      <div className="hidden md:block overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <Checkbox 
                checked={selectedClientIds.length === clientList.length && clientList.length > 0}
                onCheckedChange={(checked) => handleSelectAll(!!checked)}
              />
            </TableHead>
            <TableHead>{t('leads.table.id')}</TableHead>
            <TableHead>{t('leads.table.name')}</TableHead>
            <TableHead>{t('leads.table.phone')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('leads.branch')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('members.table.package')}</TableHead>
            <TableHead className="hidden md:table-cell">Category</TableHead>
            <TableHead>{t('members.table.sessions')}</TableHead>
            <TableHead>{t('members.table.status')}</TableHead>
            <TableHead className="hidden sm:table-cell">{t('members.table.expiry_date')}</TableHead>
            {canViewGlobalDashboard && <TableHead className="hidden lg:table-cell">{t('members.table.total_paid')}</TableHead>}
            {canViewGlobalDashboard && <TableHead className="hidden xl:table-cell">{t('leads.assigned_to')}</TableHead>}
            <TableHead>{t('leads.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientList.map(client => {
            const clientPayments = payments.filter(p => p.clientId === client.id);
            const totalPaid = clientPayments.reduce((sum, p) => sum + p.amount, 0);
            
            return (
            <TableRow key={client.id}>
              <TableCell>
                <Checkbox 
                  checked={selectedClientIds.includes(client.id)}
                  onCheckedChange={(checked) => handleSelectClient(client.id, !!checked)}
                />
              </TableCell>
              <TableCell className="font-medium text-muted-foreground">
                {client.memberId ? `#${client.memberId}` : '-'}
              </TableCell>
              <TableCell className="font-medium">
                {client.name}
                {upcomingBirthdays.some(b => b.id === client.id) && (
                  <Gift className="inline-block ml-2 h-4 w-4 text-pink-500" />
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center">
                  <Phone className="h-3 w-3 mr-2 text-muted-foreground" />
                  {currentUser?.role === 'rep' && client.assignedTo !== currentUser.id ? '**********' : client.phone}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="secondary">{client.branch || t('leads.tabs.unassigned')}</Badge>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline">{client.packageType || t('leads.tabs.other')}</Badge>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline" className="font-bold text-[10px] uppercase bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                  {getMemberCategory(client)}
                </Badge>
              </TableCell>
              <TableCell>
                {typeof client.sessionsRemaining === 'number' ? (
                  <Badge variant={client.sessionsRemaining < 0 ? 'destructive' : 'secondary'}>
                    {client.sessionsRemaining} {t('common.left')}
                  </Badge>
                ) : client.sessionsRemaining === 'unlimited' ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200 border">∞ Unlimited</Badge>
                ) : client.sessionsRemaining === 'no attend' ? (
                  <Badge variant="outline" className="text-amber-600 border-amber-600">No Attend</Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">-</span>
                )}
              </TableCell>
              <TableCell>{getStatusBadge(client.status)}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {client.membershipExpiry ? (
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-2 text-muted-foreground" />
                    {format(parseISO(client.membershipExpiry), 'MMM d, yyyy')}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">{t('leads.tabs.unassigned')}</span>
                )}
              </TableCell>
              {canViewGlobalDashboard && (
                <TableCell className="font-medium text-green-600 hidden lg:table-cell">
                  {totalPaid.toLocaleString()} LE
                </TableCell>
              )}
              {canViewGlobalDashboard && (
                <TableCell className="hidden xl:table-cell">
                  <select 
                    className="flex h-8 w-[130px] items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={client.assignedTo || 'unassigned'}
                    onChange={(e) => updateClient(client.id, { assignedTo: e.target.value === 'unassigned' ? '' : e.target.value })}
                  >
                    <option value="unassigned">{t('leads.tabs.unassigned')}</option>
                    {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).map(rep => (
                      <option key={rep.id} value={rep.id}>{rep.name || rep.email || 'Unknown User'}</option>
                    ))}
                  </select>
                </TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-500 hover:bg-green-50 hover:text-green-600"
                    onClick={() => setWhatsAppClient(client)}
                    title="Send WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700" title="Generate Contract" onClick={() => {
                    const clientPayments = payments.filter(p => p.clientId === client.id);
                    const latestPayment = clientPayments.length > 0 
                      ? clientPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                      : null;
                    generateClientContract(client, latestPayment?.amount, latestPayment?.method);
                  }}>
                    <FileText className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveClientId(client.id)}
                  >
                    {t('common.manage')}
                  </Button>


                {canDeleteRecords && (
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteClient(client.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                </div>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('members.title')}</h2>
          <div className="flex gap-4 mt-1 text-xs text-muted-foreground font-semibold">
            <span className="flex items-center gap-1">Male: <strong className="text-foreground">{maleCount}</strong></span>
            <span className="flex items-center gap-1">Female: <strong className="text-foreground">{femaleCount}</strong></span>
            {otherGenderCount > 0 && <span className="flex items-center gap-1">Other: <strong className="text-foreground">{otherGenderCount}</strong></span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            {t('leads.export_csv')}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsRecalculateConfirmOpen(true)}
            disabled={isRecalculating}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRecalculating ? 'animate-spin' : ''}`} />
            {t('members.recalculate_expiry')}
          </Button>
          <ImportData type="Active" />
          <ImportHistory />
          {isManagerOrSama && (
            <>
              <ResyncAssignments clients={clients} users={users} currentUser={currentUser} />
              <ResyncPayments clients={clients} users={users} />
            </>
          )}
          <Dialog open={isNewMemberOpen} onOpenChange={setIsNewMemberOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-2 h-4 w-4" /> {t('members.add_member')}
            </DialogTrigger>
          <DialogContent className="!w-full !max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl rounded-3xl bg-background/95 backdrop-blur-xl">
            <DialogHeader className="p-10 pb-6 bg-muted/30 border-b">
              <DialogTitle className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
                <UserPlus className="h-8 w-8 text-primary" />
                {t('members.add_member')}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-10 pt-8 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('leads.table.name')}</Label>
                  <Input 
                    placeholder={t('members.search_placeholder')} 
                    className="h-14 rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg"
                    value={newMemberName} 
                    onChange={(e) => setNewMemberName(e.target.value)} 
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('leads.table.phone')}</Label>
                  <Input 
                    placeholder="+20 1xx xxxx xxx" 
                    className="h-14 rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg"
                    value={newMemberPhone} 
                    onChange={(e) => setNewMemberPhone(e.target.value)} 
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('leads.branch')}</Label>
                  <Select value={newMemberBranch} onValueChange={(v) => setNewMemberBranch(v || '')}>
                    <SelectTrigger className="h-14 rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder={t('leads.branch')} />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      {branches.map(b => (
                        <SelectItem key={b} value={b} className="rounded-xl py-3 px-4">{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('leads.assigned_to')}</Label>
                  <Select value={newMemberAssignedTo} onValueChange={(v) => setNewMemberAssignedTo(v || '')}>
                    <SelectTrigger className="h-14 rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder={t('leads.assigned_to')} />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      <SelectItem value="unassigned" className="rounded-xl py-3 px-4">{t('leads.tabs.unassigned')}</SelectItem>
                      {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).map(rep => (
                        <SelectItem key={rep.id} value={rep.id} className="rounded-xl py-3 px-4">{rep.name || rep.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">Gender</Label>
                  <Select value={newMemberGender} onValueChange={(v: any) => setNewMemberGender(v)}>
                    <SelectTrigger className="h-14 rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder="Select Gender" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      <SelectItem value="Male" className="rounded-xl py-3 px-4">Male</SelectItem>
                      <SelectItem value="Female" className="rounded-xl py-3 px-4">Female</SelectItem>
                      <SelectItem value="Other" className="rounded-xl py-3 px-4">Other</SelectItem>
                      <SelectItem value="Prefer not to say" className="rounded-xl py-3 px-4">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">Member Category</Label>
                  <Select value={newMemberCategory} onValueChange={(v: any) => setNewMemberCategory(v)}>
                    <SelectTrigger className="h-14 rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      <SelectItem value="Kids Only" className="rounded-xl py-3 px-4">Kids Only</SelectItem>
                      <SelectItem value="Kids Pro" className="rounded-xl py-3 px-4">Kids Pro</SelectItem>
                      <SelectItem value="Junior Only" className="rounded-xl py-3 px-4">Junior Only</SelectItem>
                      <SelectItem value="Junior Advanced" className="rounded-xl py-3 px-4">Junior Advanced</SelectItem>
                      <SelectItem value="Adults" className="rounded-xl py-3 px-4">Adults</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-8 p-5 rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/10">
                <label className="flex items-start gap-4 cursor-pointer">
                  <Checkbox
                    checked={newMemberLinked}
                    onCheckedChange={(checked) => setNewMemberLinked(!!checked)}
                    className="mt-0.5 h-5 w-5"
                  />
                  <div>
                    <p className="text-sm font-semibold">{t('members.linked_family_account')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('members.linked_family_desc')}
                    </p>
                  </div>
                </label>
              </div>
              <div className="mt-6">
                <Button onClick={handleAddMember} className="w-full h-16 rounded-2xl text-xl font-extrabold shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.01] active:scale-[0.99]">
                  {t('members.create_member_profile')}
                </Button>
              </div>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="active" onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row items-end gap-4 mb-6 bg-card p-4 rounded-xl border shadow-sm">
          <div className="flex-1 w-full space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('members.search_placeholder')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t('members.search_placeholder')} 
                className="pl-9 h-11 bg-muted/30 border-none focus-visible:ring-1"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="w-full md:w-[180px] space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('leads.branch')}</Label>
            <select 
              className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-none"
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
            >
              <option value="All">{t('dashboard.all_branches')}</option>
              {branches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-[180px] space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('leads.sort_by')}</Label>
            <div className="relative">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <select 
                className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-none appearance-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="newest">{t('common.newest_first')}</option>
                <option value="id-asc">{t('common.member_id_low_high')}</option>
                <option value="id-desc">{t('common.member_id_high_low')}</option>
              </select>
            </div>
          </div>

          <div className="w-full md:w-[150px] space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground ml-1">Gender</Label>
            <select 
              className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring border-none"
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
            >
              <option value="All">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div className="w-full md:w-[150px] space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground ml-1">Category</Label>
            <select 
              className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring border-none"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="All">All Categories</option>
              <option value="Kids Only">Kids Only</option>
              <option value="Kids Pro">Kids Pro</option>
              <option value="Junior Only">Junior Only</option>
              <option value="Junior Advanced">Junior Advanced</option>
              <option value="Adults">Adults</option>
            </select>
          </div>
          {/* Assigned Rep filter — sales manager & CRM admin only */}
          {(currentUser?.role === 'manager' || currentUser?.role === 'crm_admin') && (
            <div className="w-full md:w-[200px] space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('leads.assigned_to')}</Label>
              <select
                className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-none"
                value={filterRep}
                onChange={(e) => setFilterRep(e.target.value)}
              >
                <option value="all">{t('dashboard.all_reps')}</option>
                <option value="unassigned">{t('leads.tabs.unassigned')}</option>
                {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).map(rep => (
                  <option key={rep.id} value={rep.id}>{rep.name || rep.email}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
          <TabsList className="flex w-max sm:w-full bg-muted/50 rounded-lg p-1 justify-start sm:justify-center">
            <TabsTrigger value="active" className="px-4 text-xs sm:text-sm">{t('members.tabs.active')} ({activeMembers.length + nearlyExpired.length})</TabsTrigger>
            <TabsTrigger value="hold" className="px-4 text-xs sm:text-sm">{t('members.tabs.hold')} ({onHold.length})</TabsTrigger>
            <TabsTrigger value="expired" className="px-4 text-xs sm:text-sm">{t('members.tabs.expired')} ({expired.length})</TabsTrigger>
            <TabsTrigger value="renewal" className="px-4 text-xs sm:text-sm bg-blue-500/10 text-blue-700 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">{t('members.tabs.renewal_pipeline')}</TabsTrigger>
          </TabsList>
        </div>

         {activeTab !== 'renewal' ? (
          <>
            {selectedClientIds.length > 0 && (
              <div className="bg-primary/10 border border-primary/20 text-primary p-3 rounded-lg flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-primary text-primary-foreground">
                    {selectedClientIds.length} {t('common.selected')}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedClientIds([])}>
                    {t('common.cancel')}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="bg-background text-primary border-primary/20 hover:bg-primary/5" onClick={() => setIsBulkPackageDialogOpen(true)}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Change Package
                  </Button>
                  {canDeleteRecords && (
                    <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                      <Trash2 className="h-4 w-4 mr-2" /> {t('common.delete_selected')}
                    </Button>
                  )}
                </div>
              </div>
            )}
            
            <Card className="mt-4">
              <CardContent className="p-0">
                {renderClientTable(paginatedMembers)}
              </CardContent>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  {t('common.showing')} {(currentPage - 1) * itemsPerPage + 1} {t('common.to')} {Math.min(currentPage * itemsPerPage, filteredMembers.length)} {t('common.of')} {filteredMembers.length} {t('common.entries')}
                </p>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">{t('common.page')} {currentPage} {t('common.of')} {totalPages}</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <RenewalPipeline />
        )}
      </Tabs>

      <ConfirmDialog
        isOpen={isRecalculateConfirmOpen}
        onOpenChange={setIsRecalculateConfirmOpen}
        title="Recalculate All Expiry Dates?"
        description="This will update the expiry dates for ALL records based on their package type and start date. This action cannot be undone."
        confirmText={isRecalculating ? 'Recalculating...' : 'Recalculate All'}
        onConfirm={async () => {
          setIsRecalculating(true);
          try {
            await recalculateAllPackages();
          } finally {
            setIsRecalculating(false);
          }
        }}
      />

      <ConfirmDialog 
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Member"
        description="Are you sure you want to delete this member? This action cannot be undone."
        onConfirm={confirmDeleteClient}
        variant="destructive"
        confirmText="Delete"
      />

      <ConfirmDialog 
        isOpen={isBulkDeleteDialogOpen}
        onOpenChange={setIsBulkDeleteDialogOpen}
        title="Delete Multiple Members"
        description={`Are you sure you want to delete ${selectedClientIds.length} members? This action cannot be undone.`}
        onConfirm={confirmBulkDelete}
        variant="destructive"
        confirmText="Delete All Selected"
      />

      <Dialog open={isBulkPackageDialogOpen} onOpenChange={setIsBulkPackageDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Batch Change Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-xs text-muted-foreground">
              You are about to change the active package for <strong>{selectedClientIds.length}</strong> selected members.
              This will update their active package type, reset their remaining sessions, and recalculate their expiry date from today.
            </p>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Select New Package</Label>
              <Select
                value={bulkSelectedPackageName}
                onValueChange={(val) => setBulkSelectedPackageName(val || '')}
              >
                <SelectTrigger className="w-full text-xs bg-background font-semibold">
                  <SelectValue placeholder="Choose a package" />
                </SelectTrigger>
                <SelectContent>
                  {visiblePackages.map((p) => (
                    <SelectItem key={p.id} value={p.name} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setIsBulkPackageDialogOpen(false); setBulkSelectedPackageName(''); }}>
              Cancel
            </Button>
            <Button className="flex-1 rounded-xl font-bold" disabled={!bulkSelectedPackageName} onClick={confirmBulkUpdatePackage}>
              Update Packages
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {whatsAppClient && (
        <WhatsAppDialog
          isOpen={!!whatsAppClient}
          onOpenChange={(open) => !open && setWhatsAppClient(null)}
          client={whatsAppClient}
          onSuccess={() => {
            if (activeClientDetails?.clientId === whatsAppClient.id) {
              loadClientDetails(whatsAppClient.id);
            }
          }}
        />
      )}

      {activeClient && (
        <Dialog open={!!activeClientId} onOpenChange={(open) => { if (!open) setActiveClientId(null); }}>
          <DialogContent className="!w-full !max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl rounded-2xl bg-background">
            {/* Header */}
            <DialogHeader className="px-6 pt-5 pb-4 border-b bg-muted/20 flex-shrink-0">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <DialogTitle className="text-lg font-bold leading-tight">{activeClient.name}</DialogTitle>
                    <p className="text-xs text-muted-foreground">
                      {activeClient.phone} · {activeClient.branch || 'No branch'} ·{' '}
                      <span className={activeClient.status === 'Active' ? 'text-green-600 font-semibold' : activeClient.status === 'Nearly Expired' ? 'text-amber-600 font-semibold' : 'text-red-500 font-semibold'}>
                        {activeClient.status}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="text-right px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Category</span>
                  <span className="text-2xl font-black text-indigo-400 tracking-tight">{getMemberCategory(activeClient)}</span>
                </div>
              </div>
            </DialogHeader>

            <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Modern scrollable horizontal tab pills */}
              <div className="px-6 py-2 border-b flex-shrink-0 bg-muted/10">
                <TabsList className="bg-transparent p-0 h-auto gap-1 w-full rounded-none border-none shadow-none flex flex-wrap">
                  {[
                    { value: 'overview', label: 'Overview', icon: <User className="h-3.5 w-3.5" /> },
                    { value: 'activity', label: 'Activity', icon: <MessageSquare className="h-3.5 w-3.5" /> },
                    { value: 'history', label: 'History', icon: <FileText className="h-3.5 w-3.5" /> },
                    { value: 'referrals', label: 'Referrals', icon: <Users className="h-3.5 w-3.5" /> },
                    { value: 'audit-logs', label: 'Audit Logs', icon: <Activity className="h-3.5 w-3.5" /> },
                    { value: 'points', label: 'Points', icon: <Gift className="h-3.5 w-3.5" /> },
                    { value: 'freeze', label: 'Freeze', icon: <Calendar className="h-3.5 w-3.5" /> },
                    { value: 'documents', label: 'Documents', icon: <FileText className="h-3.5 w-3.5" /> },
                    { value: 'transfers', label: 'Transfers', icon: <ArrowUpDown className="h-3.5 w-3.5" /> },
                  ].map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      {tab.icon}
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                {/* ── OVERVIEW TAB ── */}
                <TabsContent value="overview" className="mt-0 outline-none p-5 space-y-5">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Left: Editable fields */}
                    <div className="space-y-4 p-4 rounded-xl border bg-muted/20 text-left">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Member Details</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1 col-span-2">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</Label>
                          <Input
                            type="text"
                            className="h-9 text-sm bg-background rounded-lg"
                            defaultValue={activeClient.name}
                            onChange={(e) => debouncedUpdate(activeClient.id, { name: e.target.value })}
                            placeholder="Member name"
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Phone</Label>
                          <Input
                            type="text"
                            className="h-9 text-sm bg-background rounded-lg"
                            defaultValue={activeClient.phone}
                            onChange={(e) => debouncedUpdate(activeClient.id, { phone: e.target.value })}
                            placeholder="Phone number"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            defaultValue={activeClient.status}
                            onChange={(e) => updateClient(activeClient.id, { status: e.target.value as any })}
                          >
                            <option value="Active">Active</option>
                            <option value="Nearly Expired">Nearly Expired</option>
                            <option value="Expired">Expired</option>
                            <option value="Hold">Hold</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Branch</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            defaultValue={activeClient.branch || ''}
                            onChange={(e) => updateClient(activeClient.id, { branch: e.target.value as any })}
                          >
                            <option value="" disabled>Select Branch</option>
                            {branches.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Points</Label>
                          <Input
                            type="number"
                            className="h-9 rounded-lg bg-background text-sm px-3"
                            defaultValue={activeClient.points}
                            placeholder="0"
                            onChange={(e) => updateClient(activeClient.id, { points: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date of Birth</Label>
                          <Input
                            type="date"
                            className="h-9 rounded-lg bg-background text-sm px-3"
                            defaultValue={activeClient.dateOfBirth ? format(parseISO(activeClient.dateOfBirth), 'yyyy-MM-dd') : ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateClient(activeClient.id, { dateOfBirth: val ? new Date(val).toISOString() : '' });
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gender</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            value={activeClient.gender || ''}
                            onChange={(e) => updateClient(activeClient.id, { gender: e.target.value as any })}
                          >
                            <option value="" disabled>Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                            <option value="Prefer not to say">Prefer not to say</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            value={activeClient.memberCategory || ''}
                            onChange={(e) => updateClient(activeClient.id, { memberCategory: e.target.value as any })}
                          >
                            <option value="" disabled>Select Category</option>
                            <option value="Kids Only">Kids Only</option>
                            <option value="Kids Pro">Kids Pro</option>
                            <option value="Junior Only">Junior Only</option>
                            <option value="Junior Advanced">Junior Advanced</option>
                            <option value="Adults">Adults</option>
                          </select>
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assigned Sales Rep</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                            value={activeClient.assignedTo || 'unassigned'}
                            disabled={currentUser?.role === 'rep' && !!activeClient.assignedTo}
                            onChange={(e) => updateClient(activeClient.id, { assignedTo: e.target.value === 'unassigned' ? '' : e.target.value })}
                          >
                            <option value="unassigned">Unassigned</option>
                            {users
                              .filter((u) => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || ''))
                              .map((rep) => (
                                <option key={rep.id} value={rep.id}>
                                  {rep.name || rep.email || 'Unknown'}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      {/* Additional whitelabeling fields */}
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-4 border-t">Additional Information</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">National ID</Label>
                          <Input
                            type="text"
                            className="h-9 text-sm bg-background rounded-lg"
                            defaultValue={activeClient.nationalId || ''}
                            onChange={(e) => debouncedUpdate(activeClient.id, { nationalId: e.target.value })}
                            placeholder="National ID"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email</Label>
                          <Input
                            type="email"
                            className="h-9 text-sm bg-background rounded-lg"
                            defaultValue={activeClient.email || ''}
                            onChange={(e) => debouncedUpdate(activeClient.id, { email: e.target.value })}
                            placeholder="Email address"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Backup Phone</Label>
                          <Input
                            type="text"
                            className="h-9 text-sm bg-background rounded-lg"
                            defaultValue={activeClient.backupPhone || ''}
                            onChange={(e) => debouncedUpdate(activeClient.id, { backupPhone: e.target.value })}
                            placeholder="Backup phone number"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Military/Civilian Status</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            defaultValue={activeClient.civilianOrMilitary || 'None'}
                            onChange={(e) => updateClient(activeClient.id, { civilianOrMilitary: e.target.value as any })}
                          >
                            <option value="None">None</option>
                            <option value="Civilian">Civilian</option>
                            <option value="Military">Military</option>
                          </select>
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lead Advertising Source</Label>
                          <select
                            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            defaultValue={activeClient.advertisingSource || ''}
                            onChange={(e) => updateClient(activeClient.id, { advertisingSource: e.target.value })}
                          >
                            <option value="">Select source</option>
                            <option value="Call in">Call in</option>
                            <option value="Walk-in">Walk-in</option>
                            <option value="Word Of Mouth">Word Of Mouth</option>
                            <option value="Instagram">Instagram</option>
                            <option value="ADS">ADS</option>
                            <option value="Facebook">Facebook</option>
                            <option value="Website">Website</option>
                            <option value="Google">Google</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Referred By Name/ID</Label>
                          <Input
                            type="text"
                            className="h-9 text-sm bg-background rounded-lg"
                            defaultValue={activeClient.referredByName || activeClient.referredBy || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              debouncedUpdate(activeClient.id, { referredByName: val, referredBy: val });
                            }}
                            placeholder="Referred by details"
                          />
                        </div>
                      </div>

                      {/* Portal Access Control */}
                      <div className="border-t pt-3 mt-4 space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-primary">Portal Access</Label>
                        <div className="flex items-center justify-between">
                          {activeClient.portalUserId ? (
                            <div className="space-y-0.5">
                              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                                <CheckCircle className="h-3.5 w-3.5" /> Portal Active
                              </p>
                              <p className="text-[9px] text-muted-foreground font-mono select-all cursor-pointer" title="Click to copy email">
                                Email: member-{activeClient.memberId?.toLowerCase()}@mitrixogymcrm-member.local
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground">No portal access enabled yet.</p>
                            </div>
                          )}

                          {!activeClient.portalUserId &&
                            (activeClient.memberId ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs font-bold text-primary border-primary/20 hover:border-primary/40"
                                disabled={isActivatingPortal === activeClient.id}
                                onClick={async () => {
                                  if (window.confirm(`Enable portal access for ${activeClient.name}?`)) {
                                    setIsActivatingPortal(activeClient.id);
                                    try {
                                      await createClientAccount(activeClient.id, activeClient.memberId!, activeClient.name, activeClient.phone);
                                      alert('Portal access enabled! Default password is: 12345678');
                                    } catch (err: any) {
                                      alert('Failed to enable portal access: ' + err.message);
                                    } finally {
                                      setIsActivatingPortal(null);
                                    }
                                  }
                                }}
                              >
                                {isActivatingPortal === activeClient.id ? 'Activating...' : 'Enable Access'}
                              </Button>
                            ) : (
                              <p className="text-[10px] text-amber-500 font-semibold italic">Requires a Member ID to enable access</p>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* Right: Package card */}
                    <div className="p-4 rounded-xl border bg-muted/20 space-y-3 text-left">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current Package</p>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-200"
                            onClick={() => {
                              setUpgradeDialogClientId(activeClient.id);
                              setUpgradePkgName('');
                              setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd'));
                            }}
                          >
                            <ArrowUpDown className="h-3 w-3 mr-1" /> Upgrade
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-200"
                            onClick={() => {
                              const newPkg = { id: Math.random().toString(36).substring(7), packageName: '', status: 'Active' as const };
                              updateClientPackages([...(activeClient.packages || []), newPkg]);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add
                          </Button>
                        </div>
                      </div>
                      {(activeClient.packages || []).length > 0 ? (
                        <div className="space-y-2">
                          {(activeClient.packages || []).map((pkg, idx) => (
                            <div key={pkg.id} className="p-3 bg-background rounded-lg border text-xs space-y-2">
                              <Select
                                value={pkg.packageName}
                                onValueChange={(val) => {
                                  if (!val) return;
                                  const sysPkg = packages.find((p) => p.name === val);
                                  const updated = [...(activeClient.packages || [])];
                                  const cur = updated[idx];
                                  if (!cur) return;
                                  updated[idx] = {
                                    ...cur,
                                    packageName: val,
                                    sessionsTotal: sysPkg?.sessions,
                                    sessionsRemaining: sysPkg?.sessions,
                                    endDate: sysPkg && cur.startDate ? addDays(parseISO(cur.startDate), sysPkg.expiryDays).toISOString() : cur.endDate,
                                  };
                                  updateClientPackages(updated);
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs bg-muted/30">
                                  <SelectValue placeholder="Select package" />
                                </SelectTrigger>
                                <SelectContent>
                                  {visiblePackages.map((p) => (
                                    <SelectItem key={p.id} value={p.name} className="text-xs">
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="Custom" className="text-xs">
                                    Custom
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                                <div>
                                  <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Start</p>
                                  <Input
                                    type="date"
                                    className="h-7 text-[10px] px-1 font-mono bg-background"
                                    value={pkg.startDate ? format(parseISO(pkg.startDate), 'yyyy-MM-dd') : ''}
                                    onChange={(e) => {
                                      const updated = [...(activeClient.packages || [])];
                                      const cur = updated[idx];
                                      if (!cur) return;
                                      const sysPkg = packages.find((p) => p.name === cur.packageName);
                                      const val = e.target.value;
                                      const ns = val ? new Date(val).toISOString() : '';
                                      updated[idx] = {
                                        ...cur,
                                        startDate: ns,
                                        endDate: sysPkg && ns ? addDays(parseISO(ns), sysPkg.expiryDays).toISOString() : cur.endDate,
                                      };
                                      updateClientPackages(updated);
                                    }}
                                  />
                                </div>
                                <div>
                                  <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Expiry</p>
                                  <Input
                                    type="date"
                                    className="h-7 text-[10px] px-1 font-mono bg-background"
                                    value={pkg.endDate ? format(parseISO(pkg.endDate), 'yyyy-MM-dd') : ''}
                                    onChange={(e) => {
                                      const updated = [...(activeClient.packages || [])];
                                      const cur = updated[idx];
                                      if (!cur) return;
                                      const val = e.target.value;
                                      const ns = val ? new Date(val).toISOString() : '';
                                      updated[idx] = { ...cur, endDate: ns };
                                      updateClientPackages(updated);
                                    }}
                                  />
                                </div>
                                <div>
                                  <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Remaining</p>
                                  <Input
                                    type="number"
                                    className="h-7 text-[10px] px-1 font-mono bg-background"
                                    value={pkg.sessionsRemaining ?? ''}
                                    onChange={(e) => {
                                      const updated = [...(activeClient.packages || [])];
                                      const cur = updated[idx];
                                      if (!cur) return;
                                      const newVal = parseInt(e.target.value) || 0;
                                      updated[idx] = { ...cur, sessionsRemaining: newVal };
                                      const updates = {
                                        packages: updated,
                                        ...(cur.status === 'Active' ? { sessionsRemaining: newVal } : {})
                                      };
                                      updateClient(activeClient.id, updates);
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Select
                                  value={pkg.status}
                                  onValueChange={(val: any) => {
                                    if (!val) return;
                                    const updated = [...(activeClient.packages || [])];
                                    const cur = updated[idx];
                                    if (!cur) return;
                                    updated[idx] = { ...cur, status: val };
                                    updateClientPackages(updated);
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs flex-1 bg-background">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Active" className="text-xs">
                                      Active
                                    </SelectItem>
                                    <SelectItem value="Expired" className="text-xs">
                                      Expired
                                    </SelectItem>
                                    <SelectItem value="Cancelled" className="text-xs">
                                      Cancelled
                                    </SelectItem>
                                    <SelectItem value="Hold" className="text-xs">
                                      Hold
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive shrink-0"
                                  onClick={() => updateClientPackages((activeClient.packages || []).filter((_, i) => i !== idx))}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : activeClient.packageType && activeClient.packageType !== 'Unknown' ? (
                        <div className="p-3 bg-primary/5 rounded-lg border text-xs space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2 mb-2">
                              <span className="text-[9px] uppercase text-muted-foreground block mb-1">Active Package (Correction)</span>
                              <Select
                                value={activeClient.packageType}
                                onValueChange={async (val) => {
                                  if (!val || val === activeClient.packageType) return;
                                  if (confirm(`Are you sure you want to correct this member's active package to: ${val}? This will update their active package, sessions remaining, and expiry date.`)) {
                                    try {
                                      await changeClientPackage(activeClient.id, val);
                                      toast.success("Package updated successfully!");
                                    } catch (err) {
                                      console.error(err);
                                      toast.error("Failed to update package.");
                                    }
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs bg-background font-semibold">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {visiblePackages.map((p) => (
                                    <SelectItem key={p.id} value={p.name} className="text-xs">
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {typeof activeClient.sessionsRemaining !== 'undefined' && (
                               <div className="flex flex-col gap-1">
                                 <span className="text-[9px] uppercase text-muted-foreground block">Sessions Left</span>
                                 <div className="flex items-center gap-1.5">
                                   <Button 
                                     size="icon" 
                                     variant="outline" 
                                     className="h-5 w-5 rounded-md" 
                                     onClick={() => handleUpdateSessionsRemaining(-1)}
                                     disabled={activeClient.sessionsRemaining === 'unlimited' || activeClient.sessionsRemaining === 0}
                                   >
                                     <Minus className="h-2.5 w-2.5" />
                                   </Button>
                                   <span className="font-mono font-bold text-xs min-w-[16px] text-center">
                                     {activeClient.sessionsRemaining === 'unlimited' ? '∞' : activeClient.sessionsRemaining}
                                   </span>
                                   <Button 
                                     size="icon" 
                                     variant="outline" 
                                     className="h-5 w-5 rounded-md" 
                                     onClick={() => handleUpdateSessionsRemaining(1)}
                                     disabled={activeClient.sessionsRemaining === 'unlimited'}
                                   >
                                     <Plus className="h-2.5 w-2.5" />
                                   </Button>
                                 </div>
                               </div>
                             )}
                            {activeClient.startDate && (
                              <div>
                                <span className="text-[9px] uppercase text-muted-foreground block">Start</span>
                                <span className="font-semibold">{format(parseISO(activeClient.startDate), 'dd MMM yyyy')}</span>
                              </div>
                            )}
                            {activeClient.membershipExpiry && (
                              <div>
                                <span className="text-[9px] uppercase text-muted-foreground block">Expires</span>
                                <span className="font-semibold">{format(parseISO(activeClient.membershipExpiry), 'dd MMM yyyy')}</span>
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">Click "+ Add" to create a formal entry.</p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">No package found. Click "+ Add" to assign one.</p>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* ── ACTIVITY TAB ── */}
                <TabsContent value="activity" className="mt-0 outline-none p-5 text-left">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Interactions column */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Interactions</p>
                      <div className="h-48 overflow-y-auto space-y-2 custom-scrollbar">
                        {activeClientDetails?.clientId === activeClient.id && activeClientDetails.interactions.length > 0 ? (
                          [...activeClientDetails.interactions]
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((interaction) => (
                              <div key={interaction.id} className="bg-muted/20 p-3 rounded-lg border text-xs space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex gap-1.5">
                                    <Badge
                                      className={`text-[9px] px-1.5 py-0 h-5 ${
                                        interaction.type === 'Call'
                                          ? 'bg-blue-500'
                                          : interaction.type === 'WhatsApp'
                                          ? 'bg-green-500'
                                          : interaction.type === 'Email'
                                          ? 'bg-amber-500'
                                          : 'bg-purple-500'
                                      }`}
                                    >
                                      {interaction.type}
                                    </Badge>
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5">
                                      {interaction.outcome}
                                    </Badge>
                                  </div>
                                  <span className="text-[9px] text-muted-foreground">{format(parseISO(interaction.date), 'MMM d, h:mm a')}</span>
                                </div>
                                <p className="text-muted-foreground leading-relaxed italic">"{interaction.notes}"</p>
                                {interaction.nextFollowUp && (
                                  <p className="text-amber-600 text-[9px] flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Follow-up: {format(parseISO(interaction.nextFollowUp), 'MMM d')}
                                  </p>
                                )}
                              </div>
                            ))
                        ) : isDetailsLoading && activeClientDetails?.clientId === activeClient.id ? (
                          <div className="h-full flex items-center justify-center py-10">
                            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No interactions yet.</div>
                        )}
                      </div>
                      <div className="p-3 rounded-xl border bg-muted/10 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[9px] uppercase font-bold text-muted-foreground">Type</Label>
                            <Select value={interactionType} onValueChange={(v) => setInteractionType(v as InteractionType)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Call">Call</SelectItem>
                                <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                                <SelectItem value="Email">Email</SelectItem>
                                <SelectItem value="Visit">Visit</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[9px] uppercase font-bold text-muted-foreground">Outcome</Label>
                            <Select value={interactionOutcome} onValueChange={(v) => setInteractionOutcome(v as InteractionOutcome)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Interested">Interested</SelectItem>
                                <SelectItem value="Not Answered">Not Answered</SelectItem>
                                <SelectItem value="Scheduled Trial">Scheduled Trial</SelectItem>
                                <SelectItem value="Rejected">Rejected</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] uppercase font-bold text-muted-foreground">Follow-up Date (optional)</Label>
                          <Input type="date" className="h-8 text-xs" value={nextFollowUpDate} onChange={(e) => setNextFollowUpDate(e.target.value)} />
                        </div>
                        <Textarea
                          placeholder="Notes..."
                          className="min-h-[70px] text-xs resize-none rounded-lg"
                          value={interactionNotes}
                          onChange={(e) => setInteractionNotes(e.target.value)}
                        />
                        <Button className="w-full h-9 text-xs font-bold" onClick={() => handleAddInteraction(activeClient.id)}>
                          Log Interaction
                        </Button>
                      </div>
                    </div>

                    {/* Comments column */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Internal Notes</p>
                      <div className="h-48 overflow-y-auto space-y-2 custom-scrollbar">
                        {activeClientDetails?.clientId === activeClient.id && activeClientDetails.comments.length > 0 ? (
                          [...activeClientDetails.comments]
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((comment) => (
                              <div key={comment.id} className="bg-muted/20 p-3 rounded-lg border text-xs space-y-1">
                                <p className="leading-relaxed text-foreground/90">{comment.text}</p>
                                <div className="flex justify-between text-[9px] text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {comment.author}
                                  </span>
                                  <span>{format(parseISO(comment.date), 'MMM d, h:mm a')}</span>
                                </div>
                              </div>
                            ))
                        ) : isDetailsLoading && activeClientDetails?.clientId === activeClient.id ? (
                          <div className="h-full flex items-center justify-center py-10">
                            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No notes yet.</div>
                        )}
                      </div>
                      <div className="p-3 rounded-xl border bg-muted/10 space-y-2.5">
                        <Label className="text-[9px] uppercase font-bold text-muted-foreground">Add Note</Label>
                        <Textarea
                          placeholder="Type internal notes here..."
                          className="min-h-[100px] text-xs resize-none rounded-lg"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                        />
                        <Button className="w-full h-9 text-xs font-bold" onClick={() => handleAddComment(activeClient.id)}>
                          Save Note
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── HISTORY TAB ── */}
                <TabsContent value="history" className="mt-0 outline-none p-5 text-left">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Payments (2/3 width) */}
                    <div className="lg:col-span-2 space-y-5">
                      {/* Package History */}
                      {(activeClient.packages || []).length > 0 && (
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Package History</p>
                          <div className="rounded-xl border bg-background overflow-hidden">
                            <Table>
                              <TableHeader className="bg-muted/30">
                                <TableRow>
                                  <TableHead className="text-[10px] uppercase py-2.5 px-3">Package</TableHead>
                                  <TableHead className="text-[10px] uppercase py-2.5 px-3">Start</TableHead>
                                  <TableHead className="text-[10px] uppercase py-2.5 px-3">Expires</TableHead>
                                  <TableHead className="text-[10px] uppercase py-2.5 px-3 text-center">Sessions</TableHead>
                                  <TableHead className="text-[10px] uppercase py-2.5 px-3 text-center">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {[...(activeClient.packages || [])]
                                  .sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime())
                                  .map((pkg) => (
                                    <TableRow key={pkg.id} className="hover:bg-muted/20 border-b transition-colors">
                                      <TableCell className="py-2.5 px-3 text-xs font-medium">{pkg.packageName || '—'}</TableCell>
                                      <TableCell className="py-2.5 px-3 text-xs">{pkg.startDate ? format(parseISO(pkg.startDate), 'dd MMM yyyy') : '—'}</TableCell>
                                      <TableCell className="py-2.5 px-3 text-xs">{pkg.endDate ? format(parseISO(pkg.endDate), 'dd MMM yyyy') : '—'}</TableCell>
                                      <TableCell className="py-2.5 px-3 text-xs text-center">
                                        {(pkg.sessionsRemaining as any) === 'unlimited' ? '∞' : typeof pkg.sessionsRemaining === 'number' ? `${pkg.sessionsRemaining} / ${pkg.sessionsTotal ?? '?'}` : '—'}
                                      </TableCell>
                                      <TableCell className="py-2.5 px-3 text-center">
                                        <Badge
                                          className={`text-[9px] px-1.5 py-0 ${
                                            pkg.status === 'Active' ? 'bg-green-500' : pkg.status === 'Expired' ? 'bg-muted text-muted-foreground' : pkg.status === 'Hold' ? 'bg-amber-500' : 'bg-red-500'
                                          }`}
                                        >
                                          {pkg.status}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payment History</p>
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-none">
                            {payments.filter((p) => p.clientId === activeClient.id).length} entries
                          </Badge>
                        </div>
                        <div className="rounded-xl border bg-background overflow-hidden">
                          <Table>
                            <TableHeader className="bg-muted/30">
                              <TableRow>
                                <TableHead className="text-[10px] uppercase py-2.5 px-3">Date</TableHead>
                                <TableHead className="text-[10px] uppercase py-2.5 px-3 text-right">Amount</TableHead>
                                <TableHead className="text-[10px] uppercase py-2.5 px-3">Package</TableHead>
                                <TableHead className="text-[10px] uppercase py-2.5 px-3 text-center">Method</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {payments
                                .filter((p) => p.clientId === activeClient.id)
                                .sort((a, b) => {
                                  const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
                                  if (dateDiff !== 0) return dateDiff;
                                  // Tiebreaker: created_at (actual recording time) newest first
                                  return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                                })
                                .map((payment) => (
                                  <TableRow key={payment.id} className="hover:bg-muted/20 border-b transition-colors">
                                    <TableCell className="py-2.5 px-3 text-xs">{format(parseISO(payment.date), 'MMM d, yyyy')}</TableCell>
                                    <TableCell className="py-2.5 px-3 text-right">
                                      <span className="text-xs font-bold text-green-600">
                                        {payment.amount.toLocaleString()} {t('payments.currency_le')}
                                      </span>
                                    </TableCell>
                                    <TableCell className="py-2.5 px-3 text-xs max-w-[120px] truncate">{payment.packageType}</TableCell>
                                    <TableCell className="py-2.5 px-3 text-center">
                                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                        {payment.method}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              {payments.filter((p) => p.clientId === activeClient.id).length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center py-10 text-xs text-muted-foreground italic">
                                    No payments recorded.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      {/* Attendance History */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Attendance History</p>
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-none">
                            {attendances.filter((att) => att.clientId === activeClient.id).length} entries
                          </Badge>
                        </div>
                        <div className="rounded-xl border bg-background overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                          <Table>
                            <TableHeader className="bg-muted/30">
                              <TableRow>
                                <TableHead className="text-[10px] uppercase py-2.5 px-3">Date</TableHead>
                                <TableHead className="text-[10px] uppercase py-2.5 px-3">Package</TableHead>
                                <TableHead className="text-[10px] uppercase py-2.5 px-3">Branch</TableHead>
                                <TableHead className="text-[10px] uppercase py-2.5 px-3">Recorded By</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {attendances
                                .filter((att) => att.clientId === activeClient.id)
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                .map((att) => (
                                  <TableRow key={att.id || Math.random().toString()} className="hover:bg-muted/20 border-b transition-colors">
                                    <TableCell className="py-2.5 px-3 text-xs">
                                      {att.date ? format(parseISO(att.date), 'MMM d, yyyy - hh:mm a') : '—'}
                                    </TableCell>
                                    <TableCell className="py-2.5 px-3 text-xs max-w-[150px] truncate">{att.packageName || '—'}</TableCell>
                                    <TableCell className="py-2.5 px-3 text-xs capitalize">{att.branch || '—'}</TableCell>
                                    <TableCell className="py-2.5 px-3 text-xs">{att.recordedBy || '—'}</TableCell>
                                  </TableRow>
                                ))}
                              {attendances.filter((att) => att.clientId === activeClient.id).length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center py-10 text-xs text-muted-foreground italic">
                                    No attendance recorded.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>

                    {/* QR Code (1/3 width) */}
                    <div className="flex flex-col items-center gap-4 p-4 rounded-xl border bg-muted/10 h-fit">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground self-start">Member QR</p>
                      <div className="bg-white p-4 rounded-xl shadow-md">
                        <QRCodeSVG
                          id={`qr-svg-${activeClient.id}`}
                          value={activeClient.memberId || activeClient.id}
                          size={140}
                          level="H"
                          includeMargin={true}
                          data-qr-id={activeClient.memberId || activeClient.id}
                        />
                      </div>
                      <p className="text-xs font-mono font-bold text-center">#{activeClient.memberId || activeClient.id.slice(0, 8).toUpperCase()}</p>
                      <div className="flex gap-2 w-full">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-[10px] gap-1"
                          onClick={() => downloadQRCode(activeClient.memberId || activeClient.id, activeClient.name)}
                        >
                          <Download className="h-3 w-3" />
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-[10px] gap-1"
                          onClick={() => copyQRCodeToClipboard(activeClient.memberId || activeClient.id)}
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── REFERRALS TAB ── */}
                <TabsContent value="referrals" className="mt-0 outline-none p-5 text-left space-y-6">
                  {/* Referred By */}
                  <div className="p-4 rounded-xl border bg-muted/20">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Referred By</p>
                    {(() => {
                      const referredByClient = activeClient.referredBy
                        ? clients.find(
                            (c) =>
                              c.memberId === activeClient.referredBy ||
                              c.phone === activeClient.referredBy ||
                              c.id === activeClient.referredBy
                          )
                        : null;

                      if (referredByClient) {
                        return (
                          <div className="flex items-center justify-between bg-background p-3 rounded-lg border border-primary/20">
                            <div>
                              <p className="text-sm font-bold text-foreground">{referredByClient.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Member ID: #{referredByClient.memberId || '—'} · Phone: {referredByClient.phone}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs font-semibold text-primary"
                              onClick={() => setActiveClientId(referredByClient.id)}
                            >
                              View Profile
                            </Button>
                          </div>
                        );
                      } else if (activeClient.referredByName || activeClient.referredBy) {
                        return (
                          <div className="bg-background p-3 rounded-lg border">
                            <p className="text-sm font-medium text-foreground">{activeClient.referredByName || activeClient.referredBy}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Custom Referral Log (Not linked to database profile)</p>
                          </div>
                        );
                      } else {
                        return <p className="text-xs text-muted-foreground italic">Direct registration / Organic lead (No referrer logged)</p>;
                      }
                    })()}
                  </div>

                  {/* Referred Members */}
                  <div className="p-4 rounded-xl border bg-muted/20">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Referred Members</p>
                    {(() => {
                      const referredList = clients.filter(
                        (c) =>
                          c.referredBy === activeClient.memberId ||
                          c.referredBy === activeClient.id ||
                          (c.referredByName && c.referredByName.toLowerCase().trim() === activeClient.name.toLowerCase().trim())
                      );

                      if (referredList.length > 0) {
                        return (
                          <div className="space-y-2">
                            {referredList.map((m) => (
                              <div key={m.id} className="flex items-center justify-between bg-background p-3 rounded-lg border">
                                <div>
                                  <p className="text-sm font-bold text-foreground">{m.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Member ID: #{m.memberId || '—'} · Status:{' '}
                                    <span className={m.status === 'Active' ? 'text-green-600 font-semibold' : 'text-muted-foreground'}>
                                      {m.status}
                                    </span>
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs font-semibold text-primary"
                                  onClick={() => setActiveClientId(m.id)}
                                >
                                  View Profile
                                </Button>
                              </div>
                            ))}
                          </div>
                        );
                      } else {
                        return <p className="text-xs text-muted-foreground italic">This member has not referred anyone yet.</p>;
                      }
                    })()}
                  </div>
                </TabsContent>

                {/* ── AUDIT LOGS TAB ── */}
                <TabsContent value="audit-logs" className="mt-0 outline-none p-5 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Audit Logs History</p>
                  <div className="h-72 overflow-y-auto space-y-2 custom-scrollbar">
                    {(() => {
                      const clientLogs = auditLogs.filter((log) => log.entityId === activeClient.id);
                      if (clientLogs.length > 0) {
                        return clientLogs
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .map((log) => (
                            <div key={log.id} className="bg-muted/20 p-3 rounded-lg border text-xs space-y-1">
                              <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                                <span className="font-semibold text-foreground/80 flex items-center gap-1">
                                  <User className="h-3.5 w-3.5" />
                                  {log.userName || 'System'} ({log.action})
                                </span>
                                <span>{format(parseISO(log.timestamp), 'MMM d yyyy, h:mm a')}</span>
                              </div>
                              <p className="text-muted-foreground">{log.details}</p>
                            </div>
                          ));
                      } else {
                        return <p className="text-xs text-muted-foreground italic text-center py-10">No audit events logged for this member.</p>;
                      }
                    })()}
                  </div>
                </TabsContent>

                {/* ── POINTS EXCHANGE TAB ── */}
                <TabsContent value="points" className="mt-0 outline-none p-5 text-left space-y-6">
                  {/* points balance card */}
                  <div className="p-4 rounded-xl border bg-primary/10 border-primary/20 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Points Balance</p>
                      <p className="text-3xl font-black text-primary mt-1">{activeClient.points || 0} Points</p>
                    </div>
                    <Gift className="h-10 w-10 text-primary opacity-80" />
                  </div>

                  {/* redemptions section */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Available Point Exchanges</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Juice card */}
                      <div className="p-4 rounded-xl border bg-background flex flex-col justify-between space-y-3">
                        <div>
                          <Badge className="bg-primary/20 text-primary hover:bg-primary/20 font-bold text-[10px] tracking-wide mb-1.5">
                            5 POINTS
                          </Badge>
                          <h4 className="text-sm font-bold">Earth's Kitchen Drink</h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Redeem 5 points for a free juice/shake from the juice bar.</p>
                        </div>
                        <Button
                          size="sm"
                          className="w-full text-xs font-bold"
                          disabled={(activeClient.points || 0) < 5}
                          onClick={() => handleRedeemPoints(5, 'juice')}
                        >
                          Redeem Now
                        </Button>
                      </div>

                      {/* Group Session */}
                      <div className="p-4 rounded-xl border bg-background flex flex-col justify-between space-y-3">
                        <div>
                          <Badge className="bg-primary/20 text-primary hover:bg-primary/20 font-bold text-[10px] tracking-wide mb-1.5">
                            15 POINTS
                          </Badge>
                          <h4 className="text-sm font-bold">1 Group Session Credit</h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Adds 1 group session to current package balance.</p>
                        </div>
                        <Button
                          size="sm"
                          className="w-full text-xs font-bold"
                          disabled={(activeClient.points || 0) < 15}
                          onClick={() => handleRedeemPoints(15, 'group_session')}
                        >
                          Redeem Now
                        </Button>
                      </div>

                      {/* Private Session */}
                      <div className="p-4 rounded-xl border bg-background flex flex-col justify-between space-y-3">
                        <div>
                          <Badge className="bg-primary/20 text-primary hover:bg-primary/20 font-bold text-[10px] tracking-wide mb-1.5">
                            25 POINTS
                          </Badge>
                          <h4 className="text-sm font-bold">1 Private Session (PT)</h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Adds 1 private coaching session to package balance.</p>
                        </div>
                        <Button
                          size="sm"
                          className="w-full text-xs font-bold"
                          disabled={(activeClient.points || 0) < 25}
                          onClick={() => handleRedeemPoints(25, 'private_session')}
                        >
                          Redeem Now
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* points history */}
                  <div className="p-4 rounded-xl border bg-muted/20">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Redemption History</p>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs custom-scrollbar">
                      {(() => {
                        const pointsLogs = auditLogs.filter(
                          (log) =>
                            log.entityId === activeClient.id &&
                            log.details &&
                            (log.details.toLowerCase().includes('points') || log.details.toLowerCase().includes('pts'))
                        );

                        if (pointsLogs.length > 0) {
                          return pointsLogs.map((log) => (
                            <div key={log.id} className="bg-background p-2.5 rounded border flex justify-between gap-4">
                              <p className="text-muted-foreground leading-snug">{log.details}</p>
                              <span className="text-[9px] text-muted-foreground shrink-0">{format(parseISO(log.timestamp), 'dd MMM yyyy')}</span>
                            </div>
                          ));
                        } else {
                          return <p className="text-xs text-muted-foreground italic text-center py-4">No point transactions logged.</p>;
                        }
                      })()}
                    </div>
                  </div>
                </TabsContent>

                {/* ── FREEZE TAB ── */}
                <TabsContent value="freeze" className="mt-0 outline-none p-5 text-left space-y-6">
                  {/* Frozen Packages list */}
                  {(() => {
                    const frozenPkgs = (activeClient.packages || []).filter((p) => p.status === 'Hold' || p.isOnHold);

                    if (frozenPkgs.length > 0) {
                      return (
                        <div className="p-4 rounded-xl border border-amber-200 bg-amber-500/10 space-y-3">
                          <div className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            <p className="text-sm font-bold">Currently Frozen Packages</p>
                          </div>
                          {frozenPkgs.map((pkg) => (
                            <div key={pkg.id} className="bg-background p-3 rounded-lg border flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-bold text-foreground">{pkg.packageName}</p>
                                <p className="text-xs text-muted-foreground">{pkg.holdReason || 'Frozen package'}</p>
                              </div>
                              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleUnfreezePackage(pkg.id)}>
                                Resume / Unfreeze
                              </Button>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Freeze form */}
                  <div className="p-4 rounded-xl border bg-muted/20 space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pause Package / Freeze Membership</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">Select Active Package</Label>
                        <select
                          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          value={freezePackageId}
                          onChange={(e) => setFreezePackageId(e.target.value)}
                        >
                          <option value="">Select a package</option>
                          {(activeClient.packages || [])
                            .filter((p) => p.status === 'Active')
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.packageName}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">Freeze Type</Label>
                        <select
                          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          value={freezeType}
                          onChange={(e) => setFreezeType(e.target.value as any)}
                        >
                          <option value="Normal">Normal Freeze</option>
                          <option value="Back Freeze">Back Freeze (Retroactive)</option>
                          <option value="Medical">Medical Emergency Freeze</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">Start Date</Label>
                        <Input type="date" className="h-9" value={freezeStartDate} onChange={(e) => setFreezeStartDate(e.target.value)} />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">End Date</Label>
                        <Input type="date" className="h-9" value={freezeEndDate} onChange={(e) => setFreezeEndDate(e.target.value)} />
                      </div>

                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs font-semibold text-muted-foreground">Freeze Reason / Notes</Label>
                        <Input
                          type="text"
                          className="h-9 bg-background"
                          value={freezeReason}
                          onChange={(e) => setFreezeReason(e.target.value)}
                          placeholder="e.g. Travel, Retroactive freeze details, Medical notes"
                        />
                      </div>
                    </div>
                    <Button className="w-full text-xs font-bold" onClick={handleFreezePackage}>
                      Submit Freeze Request
                    </Button>
                  </div>
                </TabsContent>

                {/* ── DOCUMENTS TAB ── */}
                <TabsContent value="documents" className="mt-0 outline-none p-5 text-left space-y-6">
                  {/* Documents List */}
                  <div className="p-4 rounded-xl border bg-muted/20">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Logged Documents</p>
                    {activeClient.documents && activeClient.documents.length > 0 ? (
                      <div className="space-y-2">
                        {activeClient.documents.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between bg-background p-3 rounded-lg border text-xs">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary" />
                              <div>
                                <p className="font-bold text-foreground">{doc.name}</p>
                                <p className="text-[10px] text-muted-foreground">Logged on: {format(parseISO(doc.uploadDate), 'dd MMM yyyy')}</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[11px] h-7 px-2.5 font-bold"
                              onClick={() => window.open(doc.url, '_blank')}
                            >
                              View Doc
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No logged files or documents.</p>
                    )}
                  </div>

                  {/* Add Document Form */}
                  <div className="p-4 rounded-xl border bg-muted/20 space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Log New Document</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">Document Type / Name</Label>
                        <Input
                          type="text"
                          className="h-9 bg-background"
                          value={newDocName}
                          onChange={(e) => setNewDocName(e.target.value)}
                          placeholder="e.g. Waiver Agreement, ID Copy, Medical Note"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">Document Link / URL</Label>
                        <Input
                          type="text"
                          className="h-9 bg-background"
                          value={newDocUrl}
                          onChange={(e) => setNewDocUrl(e.target.value)}
                          placeholder="Google Drive, Dropbox, or file server URL"
                        />
                      </div>
                    </div>
                    <Button className="w-full text-xs font-bold" onClick={handleAddDocument}>
                      Log Document
                    </Button>
                  </div>
                </TabsContent>

                {/* ── TRANSFERS TAB ── */}
                <TabsContent value="transfers" className="mt-0 outline-none p-5 text-left space-y-6">
                  {/* Transfer Package */}
                  <div className="p-4 rounded-xl border bg-muted/20 space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Transfer Package to Another Member</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">Select Package to Move</Label>
                        <select
                          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          value={transferPackageId}
                          onChange={(e) => setTransferPackageId(e.target.value)}
                        >
                          <option value="">Select a package</option>
                          {(activeClient.packages || [])
                            .filter((p) => p.status === 'Active')
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.packageName} ({p.sessionsRemaining} sessions left)
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">Recipient Member</Label>
                        <select
                          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          value={transferRecipientId}
                          onChange={(e) => setTransferRecipientId(e.target.value)}
                        >
                          <option value="">Select recipient</option>
                          {clients
                            .filter((c) => c.id !== activeClient.id)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} (#{c.memberId || 'None'})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <Button className="w-full text-xs font-bold" onClick={handleTransferPackage}>
                      Execute Package Transfer
                    </Button>
                  </div>

                  {/* Transfer Account / Merge */}
                  <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-destructive mb-1">Merge & Transfer Whole Account (High Risk)</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      This will transfer all active packages, remaining sessions, and points balance from {activeClient.name} to the recipient member.
                      This member's account status will be set to Expired and points/packages cleared.
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground">Select Recipient Member</Label>
                      <select
                        className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={accountRecipientId}
                        onChange={(e) => setAccountRecipientId(e.target.value)}
                      >
                        <option value="">Select recipient</option>
                        {clients
                          .filter((c) => c.id !== activeClient.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} (#{c.memberId || 'None'})
                            </option>
                          ))}
                      </select>
                    </div>
                    <Button variant="destructive" className="w-full text-xs font-bold" onClick={handleTransferAccount}>
                      Merge & Deactivate Source Account
                    </Button>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
      
      <Dialog open={!!upgradeDialogClientId} onOpenChange={(open) => { if (!open) { setUpgradeDialogClientId(null); setUpgradePkgName(''); setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd')); } }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Upgrade Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">New Package</Label>
              <Select value={upgradePkgName} onValueChange={v => v && setUpgradePkgName(v)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select package" />
                </SelectTrigger>
                <SelectContent>
                  {visiblePackages.map(p => (
                    <SelectItem key={p.id} value={p.name}>{p.name} ({p.price.toLocaleString()} LE)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Start Date</Label>
              <Input
                type="date"
                className="h-11 rounded-xl"
                value={upgradeStartDate}
                onChange={e => setUpgradeStartDate(e.target.value)}
              />
            </div>
            {upgradePkgName && upgradeStartDate && (() => {
              const pkg = packages.find(p => p.name === upgradePkgName);
              if (!pkg) return null;
              const endDate = format(addDays(new Date(upgradeStartDate), pkg.expiryDays), 'dd MMM yyyy');
              const upgradeClient = upgradeDialogClientId ? clients.find(c => c.id === upgradeDialogClientId) : null;
              const currentActivePkg = upgradeClient?.packages?.find(p => p.status === 'Active');
              const currentSysPkg = currentActivePkg ? packages.find(p => p.name === currentActivePkg.packageName) : null;
              const priceDiff = currentSysPkg ? pkg.price - currentSysPkg.price : pkg.price;
              return (
                <div className="rounded-xl bg-muted/30 p-3 text-sm space-y-1.5">
                  {currentSysPkg && (
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>Current ({currentActivePkg?.packageName}):</span>
                      <span>{currentSysPkg.price.toLocaleString()} LE</span>
                    </div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">New Package:</span><span className="font-semibold">{pkg.price.toLocaleString()} LE</span></div>
                  <div className="flex justify-between border-t pt-1.5 mt-1">
                    <span className="font-bold">Amount to Collect:</span>
                    <span className={`font-bold text-base ${priceDiff > 0 ? 'text-primary' : 'text-green-600'}`}>
                      {priceDiff > 0 ? '+' : ''}{priceDiff.toLocaleString()} LE
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Sessions:</span><span className="font-semibold">{pkg.sessions === 0 ? 'Unlimited' : pkg.sessions}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Expires:</span><span className="font-semibold">{endDate}</span></div>
                </div>
              );
            })()}
            {upgradePkgName && (() => {
              const pkg = packages.find(p => p.name === upgradePkgName);
              const upgradeClient = upgradeDialogClientId ? clients.find(c => c.id === upgradeDialogClientId) : null;
              const currentActivePkg = upgradeClient?.packages?.find(p => p.status === 'Active');
              const currentSysPkg = currentActivePkg ? packages.find(p => p.name === currentActivePkg.packageName) : null;
              const priceDiff = currentSysPkg ? (pkg?.price || 0) - currentSysPkg.price : (pkg?.price || 0);

              if (priceDiff > 0) {
                return (
                  <div className="space-y-4 pt-2 border-t">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Payment Method</Label>
                      <Select value={upgradePaymentMethod} onValueChange={(val) => val && setUpgradePaymentMethod(val)}>
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="Select Method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Credit Card">Credit Card</SelectItem>
                          <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                          <SelectItem value="Instapay">Instapay</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {upgradePaymentMethod === 'Instapay' && (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Instapay Ref (12 digits)</Label>
                        <Input
                          placeholder="123456789012"
                          maxLength={12}
                          value={upgradeInstapayRef}
                          onChange={(e) => setUpgradeInstapayRef(e.target.value.replace(/\D/g, ''))}
                          className="h-11 rounded-xl"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Sales Representative</Label>
                      <Select value={upgradeSalesRep} onValueChange={(val) => val && setUpgradeSalesRep(val)}>
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="Select Sales Rep" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).map(rep => (
                            <SelectItem key={rep.id} value={rep.id}>{rep.name || rep.email || 'Unknown User'}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            <p className="text-xs text-muted-foreground">Current active packages will be marked as Expired. Record the difference amount as a new payment.</p>
          </div>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setUpgradeDialogClientId(null); setUpgradePkgName(''); setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd')); setUpgradePaymentMethod('Cash'); setUpgradeSalesRep('unassigned'); }}>
              Cancel
            </Button>
            <Button className="flex-1 rounded-xl font-bold" disabled={!upgradePkgName} onClick={handleUpgradePackage}>
              Confirm Upgrade
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {upcomingBirthdays.length > 0 && (
        <Card className="border-pink-200 dark:border-pink-900">
          <CardHeader className="bg-pink-50 dark:bg-pink-900/20 pb-4">
            <CardTitle className="flex items-center text-pink-600 dark:text-pink-400">
              <Gift className="mr-2 h-5 w-5" />
              Upcoming Birthdays (Give Discounts/Points!)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingBirthdays.map(client => (
                <div key={client.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{client.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {client.dateOfBirth ? format(parseISO(client.dateOfBirth), 'MMMM do') : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="text-pink-600 border-pink-200 hover:bg-pink-50">
                    Send Offer
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
