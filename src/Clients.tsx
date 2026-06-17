import React, { useState, useDeferredValue, useRef } from 'react';
import { useAppContext } from './context';
import { useLanguage } from './contexts/LanguageContext';
import { ASSIGNABLE_ROLES } from './constants';
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
import { FileText, Trash2, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Gift, Phone, Calendar, Download, Plus, Search, ArrowUpDown, QrCode, RefreshCw, User, Users, UserPlus, Copy, MessageSquare, Activity } from 'lucide-react';
import { Client, InteractionType, InteractionOutcome } from './types';
import { format, parseISO, isAfter, isBefore, addDays, subDays, differenceInDays } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { QRCodeSVG } from 'qrcode.react';
import { ConfirmDialog } from './components/ConfirmDialog';
import ImportData from './ImportData';
import ImportHistory from './ImportHistory';
import { WhatsAppDialog } from './components/WhatsAppDialog';
import { MessageCircle } from 'lucide-react';
import RenewalPipeline from './components/RenewalPipeline';
import ResyncAssignments from './components/ResyncAssignments';
import ResyncPayments from './components/ResyncPayments';
import { writeBatch, doc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { cleanData } from './utils';
import { generateClientContract } from './utils/pdfGenerator';

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

export default function Clients() {
  const { t } = useLanguage();
  const { currentUser, users, payments, clients, addClient, updateClient, deleteClient, deleteMultipleClients, addComment, addInteraction, canViewGlobalDashboard, canDeleteRecords, recalculateAllPackages, isManagerOrSama, branches, processPaymentTransaction, fetchClientDetails, createClientAccount } = useAppContext();
  const { packages } = usePackages();
  const [activeTab, setActiveTab] = useState('active');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  
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

  const [isNewMemberOpen, setIsNewMemberOpen] = useState(false);
  const [isRecalculateConfirmOpen, setIsRecalculateConfirmOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberBranch, setNewMemberBranch] = useState<any>('');
  const [newMemberAssignedTo, setNewMemberAssignedTo] = useState<string>('');
  const [newMemberLinked, setNewMemberLinked] = useState(false);

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

  // Interaction Logging State
  const [interactionType, setInteractionType] = useState<InteractionType>('Call');
  const [interactionOutcome, setInteractionOutcome] = useState<InteractionOutcome>('Interested');
  const [interactionNotes, setInteractionNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [newComment, setNewComment] = useState('');

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
    });
    setIsNewMemberOpen(false);
    setNewMemberName('');
    setNewMemberPhone('');
    setNewMemberBranch('');
    setNewMemberAssignedTo('');
    setNewMemberLinked(false);
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

    if (upgradePaymentMethod === 'Instapay' && (!upgradeInstapayRef || !/^\d{12}$/.test(upgradeInstapayRef))) {
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
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `QR_${name.replace(/\s+/g, '_')}_${memberId}.png`;
      link.click();
      URL.revokeObjectURL(url);
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
            const matchedRep = users.find(u => u.name && m.salesName!.trim().toLowerCase() === u.name.trim().toLowerCase());
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
          if (m.salesName && repUser.name && m.salesName.trim().toLowerCase() === repUser.name.trim().toLowerCase()) return true;
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
  }, [activeTab, searchTerm, filterBranch, filterRep, sortBy, filterDiscount]);

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
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `members_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                <Dialog onOpenChange={(open) => open && loadClientDetails(client.id)}>
                  <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                    <User className="h-4 w-4" />
                  </DialogTrigger>
                  <DialogContent className="!w-full !max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl bg-background/95 backdrop-blur-xl">
                    <DialogHeader className="p-4 pb-3 bg-muted/30 border-b shrink-0">
                      <DialogTitle className="text-lg font-extrabold">{client.name}</DialogTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {client.memberId && <span className="text-xs font-mono font-bold text-primary">#{client.memberId}</span>}
                        {getStatusBadge(client.status)}
                        {client.branch && <Badge variant="secondary" className="text-[10px]">{client.branch}</Badge>}
                      </div>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {/* Quick info grid */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-[10px] uppercase text-muted-foreground block">{t('members.table.package')}</span><span className="font-semibold text-xs">{client.packageType || '—'}</span></div>
                        <div><span className="text-[10px] uppercase text-muted-foreground block">{t('members.table.sessions')}</span><span className="font-semibold text-xs">{client.sessionsRemaining === 'unlimited' ? '∞ Unlimited' : client.sessionsRemaining ?? '—'}</span></div>
                        <div><span className="text-[10px] uppercase text-muted-foreground block">{t('payments.expiry')}</span><span className="font-semibold text-xs">{client.membershipExpiry ? format(parseISO(client.membershipExpiry), 'MMM d, yyyy') : '—'}</span></div>
                        <div><span className="text-[10px] uppercase text-muted-foreground block">{t('members.table.total_paid')}</span><span className="font-semibold text-xs text-green-600">{totalPaid.toLocaleString()} LE</span></div>
                        <div><span className="text-[10px] uppercase text-muted-foreground block">{t('leads.table.phone')}</span><span className="font-semibold text-xs">{client.phone}</span></div>
                        <div><span className="text-[10px] uppercase text-muted-foreground block">{t('leads.assigned_to')}</span><span className="font-semibold text-xs">{assignedName || t('leads.tabs.unassigned')}</span></div>
                      </div>
                      {/* Interactions */}
                      {isDetailsLoading && activeClientDetails?.clientId === client.id ? (
                        <div className="flex justify-center p-4"><RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                      ) : activeClientDetails?.clientId === client.id && activeClientDetails.interactions.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{t('common.recent_interactions')}</p>
                          <div className="space-y-2">
                            {[...activeClientDetails.interactions].sort((a,b) => new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,3).map(ia => (
                              <div key={ia.id} className="text-xs bg-muted/30 rounded-lg p-2.5">
                                <div className="flex justify-between items-center">
                                  <span className="font-bold">{ia.type} — {ia.outcome}</span>
                                  <span className="text-[10px] text-muted-foreground">{format(parseISO(ia.date), 'MMM d')}</span>
                                </div>
                                {ia.notes && <p className="text-muted-foreground mt-0.5 italic">{ia.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {/* Comments */}
                      {isDetailsLoading && activeClientDetails?.clientId === client.id ? null : 
                       activeClientDetails?.clientId === client.id && activeClientDetails.comments.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{t('payments.table.notes')}</p>
                          <div className="space-y-2">
                            {[...activeClientDetails.comments].sort((a,b) => new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,2).map(c => (
                              <div key={c.id} className="text-xs bg-muted/30 rounded-lg p-2.5">
                                <p>{c.text}</p>
                                <div className="text-[10px] text-muted-foreground mt-1">{c.author} · {format(parseISO(c.date), 'MMM d')}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {/* QR */}
                      {client.memberId && (
                        <div className="flex flex-col items-center gap-3 pt-2">
                          <div className="bg-white p-4 rounded-xl shadow-md">
                            <QRCodeSVG id={`qr-mobile-${client.id}`} value={client.memberId || client.id} size={140} level="H" includeMargin data-qr-id={client.memberId || client.id} />
                          </div>
                          <Button variant="outline" size="sm" className="w-full" onClick={() => downloadQRCode(client.memberId || client.id, client.name)}>
                            <Download className="mr-2 h-4 w-4" />{t('common.download_qr')}
                          </Button>
                          <Button variant="outline" size="sm" className="w-full text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => {
                            const clientPayments = payments.filter(p => p.clientId === client.id);
                            const latestPayment = clientPayments.length > 0 
                              ? clientPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                              : null;
                            generateClientContract(client, latestPayment?.amount, latestPayment?.method);
                          }}>
                            <FileText className="mr-2 h-4 w-4" />{t('common.generate_contract')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
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
                  <Dialog onOpenChange={(open) => {
                    if (open) {
                      loadClientDetails(client.id);
                      const migrationData = migratePackageData(client, packages);
                      if (Object.keys(migrationData).length > 0) {
                        updateClient(client.id, migrationData);
                      }
                    }
                  }}>
                    <DialogTrigger render={<Button variant="outline" size="sm" />}>
                      {t('common.manage')}
                    </DialogTrigger>
                    <DialogContent className="!w-full !max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl rounded-2xl bg-background">
                      {/* Compact header */}
                      <DialogHeader className="px-6 pt-5 pb-4 border-b bg-muted/20 flex-shrink-0">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <DialogTitle className="text-lg font-bold leading-tight">{client.name}</DialogTitle>
                            <p className="text-xs text-muted-foreground">{client.phone} · {client.branch || 'No branch'} · <span className={client.status === 'Active' ? 'text-green-600 font-semibold' : client.status === 'Nearly Expired' ? 'text-amber-600 font-semibold' : 'text-red-500 font-semibold'}>{client.status}</span></p>
                          </div>
                        </div>
                      </DialogHeader>

                      <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden min-h-0">
                        {/* Sleek tab bar */}
                        <div className="px-6 pt-3 pb-0 border-b flex-shrink-0">
                          <TabsList className="bg-transparent p-0 h-auto gap-0 w-full rounded-none border-none shadow-none flex">
                            {[
                              { value: 'overview', label: 'Overview' },
                              { value: 'activity', label: 'Activity' },
                              { value: 'history', label: 'History' },
                            ].map(tab => (
                              <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-all"
                              >
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
                              <div className="space-y-4 p-4 rounded-xl border bg-muted/20">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Member Details</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1 col-span-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</Label>
                                    <Input
                                      type="text"
                                      className="h-9 text-sm bg-background rounded-lg"
                                      defaultValue={client.name}
                                      onChange={(e) => debouncedUpdate(client.id, { name: e.target.value })}
                                      placeholder="Member name"
                                    />
                                  </div>
                                  <div className="space-y-1 col-span-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Phone</Label>
                                    <Input
                                      type="text"
                                      className="h-9 text-sm bg-background rounded-lg"
                                      defaultValue={client.phone}
                                      onChange={(e) => debouncedUpdate(client.id, { phone: e.target.value })}
                                      placeholder="Phone number"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                                    <select
                                      className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                      defaultValue={client.status}
                                      onChange={(e) => updateClient(client.id, { status: e.target.value as any })}
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
                                      defaultValue={client.branch || ''}
                                      onChange={(e) => updateClient(client.id, { branch: e.target.value as any })}
                                    >
                                      <option value="" disabled>Select Branch</option>
                                      {branches.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Points</Label>
                                    <Input type="number" className="h-9 rounded-lg bg-background text-sm px-3" defaultValue={client.points} placeholder="0" onChange={(e) => updateClient(client.id, { points: parseInt(e.target.value) || 0 })} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date of Birth</Label>
                                    <Input type="date" className="h-9 rounded-lg bg-background text-sm px-3" defaultValue={client.dateOfBirth ? format(parseISO(client.dateOfBirth), 'yyyy-MM-dd') : ''} onChange={(e) => { const val = e.target.value; updateClient(client.id, { dateOfBirth: val ? new Date(val).toISOString() : '' }); }} />
                                  </div>
                                                                  <div className="space-y-1 col-span-2">
                                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assigned Sales Rep</Label>
                                    <select
                                      className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                                      value={client.assignedTo || 'unassigned'}
                                      disabled={currentUser?.role === 'rep' && !!client.assignedTo}
                                      onChange={(e) => updateClient(client.id, { assignedTo: e.target.value === 'unassigned' ? '' : e.target.value })}
                                    >
                                      <option value="unassigned">Unassigned</option>
                                      {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).map(rep => (
                                        <option key={rep.id} value={rep.id}>{rep.name || rep.email || 'Unknown'}</option>
                                      ))}
                                    </select>
                                    {currentUser?.role === 'rep' && !!client.assignedTo && (
                                      <p className="text-[9px] text-muted-foreground mt-0.5">Assignment locked — contact a manager to reassign.</p>
                                    )}
                                  </div>
                                </div>

                                {/* Portal Access Control */}
                                <div className="border-t pt-3 mt-4 space-y-2">
                                  <Label className="text-[10px] font-bold uppercase tracking-wider text-primary">Portal Access</Label>
                                  <div className="flex items-center justify-between">
                                    {client.portalUserId ? (
                                      <div className="space-y-0.5">
                                        <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                                          <CheckCircle className="h-3.5 w-3.5" /> Portal Active
                                        </p>
                                        <p className="text-[9px] text-muted-foreground font-mono select-all cursor-pointer" title="Click to copy email">
                                          Email: member-{client.memberId?.toLowerCase()}@mitrixogymcrm-member.local
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="space-y-0.5">
                                        <p className="text-xs text-muted-foreground">No portal access enabled yet.</p>
                                      </div>
                                    )}
                                    
                                    {!client.portalUserId && (
                                      client.memberId ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-xs font-bold text-primary border-primary/20 hover:border-primary/40"
                                          disabled={isActivatingPortal === client.id}
                                          onClick={async () => {
                                            if (window.confirm(`Enable portal access for ${client.name}?`)) {
                                              setIsActivatingPortal(client.id);
                                              try {
                                                await createClientAccount(client.id, client.memberId!, client.name, client.phone);
                                                alert("Portal access enabled! Default password is: 12345678");
                                              } catch (err: any) {
                                                alert("Failed to enable portal access: " + err.message);
                                              } finally {
                                                setIsActivatingPortal(null);
                                              }
                                            }
                                          }}
                                        >
                                          {isActivatingPortal === client.id ? "Activating..." : "Enable Access"}
                                        </Button>
                                      ) : (
                                        <p className="text-[10px] text-amber-500 font-semibold italic">Requires a Member ID to enable access</p>
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right: Package card */}
                              <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current Package</p>
                                  <div className="flex gap-1">
                                    <Button variant="outline" size="sm" className="h-7 text-[10px] bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-200" onClick={() => { setUpgradeDialogClientId(client.id); setUpgradePkgName(''); setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd')); }}>
                                      <ArrowUpDown className="h-3 w-3 mr-1" /> Upgrade
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-7 text-[10px] bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-200" onClick={() => { const newPkg = { id: Math.random().toString(36).substring(7), packageName: '', status: 'Active' as const }; updateClient(client.id, { packages: [...(client.packages || []), newPkg] }); }}>
                                      <Plus className="h-3 w-3 mr-1" /> Add
                                    </Button>
                                  </div>
                                </div>
                                {(client.packages || []).length > 0 ? (
                                  <div className="space-y-2">
                                    {(client.packages || []).map((pkg, idx) => (
                                      <div key={pkg.id} className="p-3 bg-background rounded-lg border text-xs space-y-2">
                                        <Select value={pkg.packageName} onValueChange={(val) => { if (!val) return; const sysPkg = packages.find(p => p.name === val); const updated = [...(client.packages || [])]; const cur = updated[idx]; if (!cur) return; updated[idx] = { ...cur, packageName: val, sessionsTotal: sysPkg?.sessions, sessionsRemaining: sysPkg?.sessions, endDate: sysPkg && cur.startDate ? addDays(parseISO(cur.startDate), sysPkg.expiryDays).toISOString() : cur.endDate }; updateClient(client.id, { packages: updated }); }}>
                                          <SelectTrigger className="h-7 text-xs bg-muted/30"><SelectValue placeholder="Select package" /></SelectTrigger>
                                          <SelectContent>{packages.map(p => <SelectItem key={p.id} value={p.name} className="text-xs">{p.name}</SelectItem>)}<SelectItem value="Custom" className="text-xs">Custom</SelectItem></SelectContent>
                                        </Select>
                                        <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                                          <div><p className="text-[9px] text-muted-foreground uppercase mb-0.5">Start</p><Input type="date" className="h-7 text-[10px] px-1 font-mono bg-background" value={pkg.startDate ? format(parseISO(pkg.startDate), 'yyyy-MM-dd') : ''} onChange={e => { const updated = [...(client.packages || [])]; const cur = updated[idx]; if (!cur) return; const sysPkg = packages.find(p => p.name === cur.packageName); const val = e.target.value; const ns = val ? new Date(val).toISOString() : ''; updated[idx] = { ...cur, startDate: ns, endDate: sysPkg && ns ? addDays(parseISO(ns), sysPkg.expiryDays).toISOString() : cur.endDate }; updateClient(client.id, { packages: updated }); }} /></div>
                                          <div><p className="text-[9px] text-muted-foreground uppercase mb-0.5">Expiry</p><Input type="date" className="h-7 text-[10px] px-1 font-mono bg-background" value={pkg.endDate ? format(parseISO(pkg.endDate), 'yyyy-MM-dd') : ''} onChange={e => { const updated = [...(client.packages || [])]; const cur = updated[idx]; if (!cur) return; const val = e.target.value; const ns = val ? new Date(val).toISOString() : ''; updated[idx] = { ...cur, endDate: ns }; updateClient(client.id, { packages: updated }); }} /></div>
                                          <div><p className="text-[9px] text-muted-foreground uppercase mb-0.5">Remaining</p><Input type="number" className="h-7 text-[10px] px-1 font-mono bg-background" value={pkg.sessionsRemaining ?? ''} onChange={e => { const updated = [...(client.packages || [])]; const cur = updated[idx]; if (!cur) return; updated[idx] = { ...cur, sessionsRemaining: parseInt(e.target.value) || 0 }; updateClient(client.id, { packages: updated }); }} /></div>
                                        </div>
                                        <div className="flex gap-1">
                                          <Select value={pkg.status} onValueChange={(val: any) => { if (!val) return; const updated = [...(client.packages || [])]; const cur = updated[idx]; if (!cur) return; updated[idx] = { ...cur, status: val }; updateClient(client.id, { packages: updated }); }}>
                                            <SelectTrigger className="h-7 text-xs flex-1 bg-background"><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="Active" className="text-xs">Active</SelectItem><SelectItem value="Expired" className="text-xs">Expired</SelectItem><SelectItem value="Cancelled" className="text-xs">Cancelled</SelectItem></SelectContent>
                                          </Select>
                                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => updateClient(client.id, { packages: (client.packages || []).filter((_, i) => i !== idx) })}><Trash2 className="h-3 w-3" /></Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  client.packageType && client.packageType !== 'Unknown' ? (
                                    <div className="p-3 bg-primary/5 rounded-lg border text-xs space-y-2">
                                      <div className="grid grid-cols-2 gap-2">
                                        <div><span className="text-[9px] uppercase text-muted-foreground block">Package</span><span className="font-semibold">{client.packageType}</span></div>
                                        {typeof client.sessionsRemaining !== 'undefined' && <div><span className="text-[9px] uppercase text-muted-foreground block">Sessions Left</span><span className="font-semibold">{client.sessionsRemaining === 'unlimited' ? '∞ Unlimited' : client.sessionsRemaining}</span></div>}
                                        {client.startDate && <div><span className="text-[9px] uppercase text-muted-foreground block">Start</span><span className="font-semibold">{format(parseISO(client.startDate), 'dd MMM yyyy')}</span></div>}
                                        {client.membershipExpiry && <div><span className="text-[9px] uppercase text-muted-foreground block">Expires</span><span className="font-semibold">{format(parseISO(client.membershipExpiry), 'dd MMM yyyy')}</span></div>}
                                      </div>
                                      <p className="text-[10px] text-muted-foreground">Click "+ Add" to create a formal entry.</p>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground text-center py-4">No package found. Click "+ Add" to assign one.</p>
                                  )
                                )}
                              </div>
                            </div>
                          </TabsContent>

                          {/* ── ACTIVITY TAB ── */}
                          <TabsContent value="activity" className="mt-0 outline-none p-5">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                              {/* Interactions column */}
                              <div className="space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Interactions</p>
                                <div className="h-48 overflow-y-auto space-y-2 custom-scrollbar">
                                {activeClientDetails?.clientId === client.id && activeClientDetails.interactions.length > 0 ? (
                                  [...activeClientDetails.interactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(interaction => (
                                    <div key={interaction.id} className="bg-muted/20 p-3 rounded-lg border text-xs space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <div className="flex gap-1.5">
                                          <Badge className={`text-[9px] px-1.5 py-0 h-5 ${interaction.type === 'Call' ? 'bg-blue-500' : interaction.type === 'WhatsApp' ? 'bg-green-500' : interaction.type === 'Email' ? 'bg-amber-500' : 'bg-purple-500'}`}>{interaction.type}</Badge>
                                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5">{interaction.outcome}</Badge>
                                        </div>
                                        <span className="text-[9px] text-muted-foreground">{format(parseISO(interaction.date), 'MMM d, h:mm a')}</span>
                                      </div>
                                      <p className="text-muted-foreground leading-relaxed italic">"{interaction.notes}"</p>
                                      {interaction.nextFollowUp && <p className="text-amber-600 text-[9px] flex items-center gap-1"><Calendar className="h-3 w-3" />Follow-up: {format(parseISO(interaction.nextFollowUp), 'MMM d')}</p>}
                                    </div>
                                  ))
                                ) : isDetailsLoading && activeClientDetails?.clientId === client.id ? (
                                  <div className="h-full flex items-center justify-center py-10"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                                ) : (
                                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No interactions yet.</div>
                                )}
                                </div>
                                <div className="p-3 rounded-xl border bg-muted/10 space-y-2.5">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <Label className="text-[9px] uppercase font-bold text-muted-foreground">Type</Label>
                                      <Select value={interactionType} onValueChange={(v) => setInteractionType(v as InteractionType)}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="Call">Call</SelectItem><SelectItem value="WhatsApp">WhatsApp</SelectItem><SelectItem value="Email">Email</SelectItem><SelectItem value="Visit">Visit</SelectItem></SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[9px] uppercase font-bold text-muted-foreground">Outcome</Label>
                                      <Select value={interactionOutcome} onValueChange={(v) => setInteractionOutcome(v as InteractionOutcome)}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="Interested">Interested</SelectItem><SelectItem value="Not Answered">Not Answered</SelectItem><SelectItem value="Scheduled Trial">Scheduled Trial</SelectItem><SelectItem value="Rejected">Rejected</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[9px] uppercase font-bold text-muted-foreground">Follow-up Date (optional)</Label>
                                    <Input type="date" className="h-8 text-xs" value={nextFollowUpDate} onChange={(e) => setNextFollowUpDate(e.target.value)} />
                                  </div>
                                  <Textarea placeholder="Notes..." className="min-h-[70px] text-xs resize-none rounded-lg" value={interactionNotes} onChange={(e) => setInteractionNotes(e.target.value)} />
                                  <Button className="w-full h-9 text-xs font-bold" onClick={() => handleAddInteraction(client.id)}>Log Interaction</Button>
                                </div>
                              </div>

                              {/* Comments column */}
                              <div className="space-y-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Internal Notes</p>
                                <div className="h-48 overflow-y-auto space-y-2 custom-scrollbar">
                                  {activeClientDetails?.clientId === client.id && activeClientDetails.comments.length > 0 ? (
                                    [...activeClientDetails.comments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(comment => (
                                      <div key={comment.id} className="bg-muted/20 p-3 rounded-lg border text-xs space-y-1">
                                        <p className="leading-relaxed text-foreground/90">{comment.text}</p>
                                        <div className="flex justify-between text-[9px] text-muted-foreground">
                                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{comment.author}</span>
                                          <span>{format(parseISO(comment.date), 'MMM d, h:mm a')}</span>
                                        </div>
                                      </div>
                                    ))
                                  ) : isDetailsLoading && activeClientDetails?.clientId === client.id ? (
                                    <div className="h-full flex items-center justify-center py-10"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                                  ) : (
                                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No notes yet.</div>
                                  )}
                                </div>
                                <div className="p-3 rounded-xl border bg-muted/10 space-y-2.5">
                                  <Label className="text-[9px] uppercase font-bold text-muted-foreground">Add Note</Label>
                                  <Textarea placeholder="Type internal notes here..." className="min-h-[100px] text-xs resize-none rounded-lg" value={newComment} onChange={(e) => setNewComment(e.target.value)} />
                                  <Button className="w-full h-9 text-xs font-bold" onClick={() => handleAddComment(client.id)}>Save Note</Button>
                                </div>
                              </div>
                            </div>
                          </TabsContent>

                          {/* ── HISTORY TAB ── */}
                          <TabsContent value="history" className="mt-0 outline-none p-5">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                              {/* Payments (2/3 width) */}
                              <div className="lg:col-span-2 space-y-5">

                                {/* Package History */}
                                {(client.packages || []).length > 0 && (
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
                                          {[...(client.packages || [])]
                                            .sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime())
                                            .map(pkg => (
                                              <TableRow key={pkg.id} className="hover:bg-muted/20 border-b transition-colors">
                                                <TableCell className="py-2.5 px-3 text-xs font-medium">{pkg.packageName || '—'}</TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs">{pkg.startDate ? format(parseISO(pkg.startDate), 'dd MMM yyyy') : '—'}</TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs">{pkg.endDate ? format(parseISO(pkg.endDate), 'dd MMM yyyy') : '—'}</TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs text-center">
                                                  {(pkg.sessionsRemaining as any) === 'unlimited' ? '∞' : typeof pkg.sessionsRemaining === 'number' ? `${pkg.sessionsRemaining} / ${pkg.sessionsTotal ?? '?'}` : '—'}
                                                </TableCell>
                                                <TableCell className="py-2.5 px-3 text-center">
                                                  <Badge className={`text-[9px] px-1.5 py-0 ${pkg.status === 'Active' ? 'bg-green-500' : pkg.status === 'Expired' ? 'bg-muted text-muted-foreground' : 'bg-red-500'}`}>
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
                                  <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-none">{payments.filter(p => p.clientId === client.id).length} entries</Badge>
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
                                      {payments.filter(p => p.clientId === client.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(payment => (
                                        <TableRow key={payment.id} className="hover:bg-muted/20 border-b transition-colors">
                                          <TableCell className="py-2.5 px-3 text-xs">{format(parseISO(payment.date), 'MMM d, yyyy')}</TableCell>
                                          <TableCell className="py-2.5 px-3 text-right"><span className="text-xs font-bold text-green-600">{payment.amount.toLocaleString()} LE</span></TableCell>
                                          <TableCell className="py-2.5 px-3 text-xs max-w-[120px] truncate">{payment.packageType}</TableCell>
                                          <TableCell className="py-2.5 px-3 text-center"><Badge variant="outline" className="text-[9px] px-1.5 py-0">{payment.method}</Badge></TableCell>
                                        </TableRow>
                                      ))}
                                      {payments.filter(p => p.clientId === client.id).length === 0 && (
                                        <TableRow><TableCell colSpan={4} className="text-center py-10 text-xs text-muted-foreground italic">No payments recorded.</TableCell></TableRow>
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                                </div>
                              </div>

                              {/* QR Code (1/3 width) */}
                              <div className="flex flex-col items-center gap-4 p-4 rounded-xl border bg-muted/10">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground self-start">Member QR</p>
                                <div className="bg-white p-4 rounded-xl shadow-md">
                                  <QRCodeSVG id={`qr-svg-${client.id}`} value={client.memberId || client.id} size={140} level="H" includeMargin={true} data-qr-id={client.memberId || client.id} />
                                </div>
                                <p className="text-xs font-mono font-bold text-center">#{client.memberId || client.id.slice(0, 8).toUpperCase()}</p>
                                <div className="flex gap-2 w-full">
                                  <Button variant="outline" size="sm" className="flex-1 text-[10px] gap-1" onClick={() => downloadQRCode(client.memberId || client.id, client.name)}><Download className="h-3 w-3" />Save</Button>
                                  <Button variant="outline" size="sm" className="flex-1 text-[10px] gap-1" onClick={() => copyQRCodeToClipboard(client.memberId || client.id)}><Copy className="h-3 w-3" />Copy</Button>
                                </div>
                              </div>
                            </div>
                          </TabsContent>

                        </div>
                      </Tabs>
                    </DialogContent>
                  </Dialog>


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
        <h2 className="text-2xl font-bold tracking-tight">{t('members.title')}</h2>
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
                  {packages.map(p => (
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
