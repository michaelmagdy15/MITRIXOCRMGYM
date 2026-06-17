import { QRCodeSVG } from 'qrcode.react';
import React, { useState, useDeferredValue, useRef, useEffect } from 'react';
import { useAppContext } from './context';
import { useLanguage } from './contexts/LanguageContext';
import { ASSIGNABLE_ROLES } from './constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO, isBefore, addDays, differenceInDays } from 'date-fns';
import { Client, LeadCategory, LeadInterest, LeadSource, LeadStage, Branch, InteractionType, InteractionOutcome } from './types';
import { Phone, Calendar, MessageSquare, Plus, FileSpreadsheet, Download, UserCheck, ArrowRight } from 'lucide-react';
import ImportData from './ImportData';
import ImportHistory from './ImportHistory';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, ChevronLeft, ChevronRight, User, Search, MapPin, Tag, Info, AlertCircle, Activity, QrCode, Copy, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { resolveUserDisplay } from './utils/resolveUserDisplay';
import { WhatsAppDialog } from './components/WhatsAppDialog';
import { MessageCircle } from 'lucide-react';

export default function Leads() {
  const {
    currentUser,
    users,
    canAssignLeads,
    canDeleteRecords,
    fetchClientDetails,
    clients, addClient, updateClient, deleteMultipleClients, deleteClient, addComment, addInteraction
  } = useAppContext();
  const { t } = useLanguage();

  // Debounce timers for lead name/phone edits
  const debounceTimers = useRef<{ [key: string]: any }>({});
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<Client | null>(null);
  const [whatsAppLead, setWhatsAppLead] = useState<Client | null>(null);
  const [newComment, setNewComment] = useState('');
  const [interactionType, setInteractionType] = useState<InteractionType>('Call');
  const [interactionOutcome, setInteractionOutcome] = useState<InteractionOutcome>('Interested');
  const [interactionNotes, setInteractionNotes] = useState('');
  const [interactionDate, setInteractionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [interactionDateError, setInteractionDateError] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  
  // Lazy Loading Details State
  const [activeLeadDetails, setActiveLeadDetails] = useState<{leadId: string, comments: any[], interactions: any[]} | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  const loadLeadDetails = async (leadId: string) => {
    setIsDetailsLoading(true);
    const details = await fetchClientDetails(leadId);
    setActiveLeadDetails({ leadId, ...details });
    setIsDetailsLoading(false);
  };

  // Debounced update handler to prevent excessive Firestore writes
  const debouncedUpdate = (leadId: string, updates: any, delayMs = 500) => {
    const key = `${leadId}-${Object.keys(updates)[0]}`;

    // Clear existing timer
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }

    // Set new timer
    debounceTimers.current[key] = setTimeout(() => {
      updateClient(leadId, updates);
      delete debounceTimers.current[key];
    }, delayMs);
  };
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const didSetDefaultTab = useRef(false);

  useEffect(() => {
    if (!didSetDefaultTab.current && currentUser && currentUser.role !== 'rep') {
      setActiveTab('unassigned');
      didSetDefaultTab.current = true;
    }
  }, [currentUser]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBranch, setFilterBranch] = useState<Branch | 'All'>('All');
  const [filterStage, setFilterStage] = useState<LeadStage | 'All'>('All');
  const [filterInterest, setFilterInterest] = useState<LeadInterest | 'All'>('All');
  const [filterAssignedTo, setFilterAssignedTo] = useState<string | 'All'>('All');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'score'>('newest');

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredFilterBranch = useDeferredValue(filterBranch);
  const deferredFilterStage = useDeferredValue(filterStage);
  const deferredFilterInterest = useDeferredValue(filterInterest);
  const deferredFilterAssignedTo = useDeferredValue(filterAssignedTo);
  const deferredSortBy = useDeferredValue(sortBy);
  const deferredActiveTab = useDeferredValue(activeTab);
  
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadSource, setNewLeadSource] = useState<LeadSource>('Instagram');
  const [newLeadBranch, setNewLeadBranch] = useState<Branch | ''>('');
  const [newLeadAssignedTo, setNewLeadAssignedTo] = useState<string>(
    currentUser?.role === 'rep' ? currentUser.id : ''
  );
  const [newLeadLinked, setNewLeadLinked] = useState(false);

  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [leadToConvert, setLeadToConvert] = useState<Client | null>(null);
  const [isMobileLeadDialogOpen, setIsMobileLeadDialogOpen] = useState(false);

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

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isDeleteAllLeadsDialogOpen, setIsDeleteAllLeadsDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const allLeads = clients.filter(c => {
    if (c.status !== 'Lead') return false;
    if (currentUser?.role === 'rep' && c.assignedTo !== currentUser.id) return false;
    return true;
  });

  const calculateLeadScore = (lead: Client) => {
    let score = 0;
    
    // Source
    switch (lead.source) {
      case 'Walk-in': score += 10; break;
      case 'Instagram': score += 7; break;
      case 'WhatsApp': score += 6; break;
      case 'TikTok': score += 5; break;
      case 'Other': score += 3; break;
    }

    // Interest
    switch (lead.interest) {
      case 'Interested': score += 15; break;
      case 'Pending': score += 5; break;
      case 'Not Interested': score += 0; break;
    }

    // Stage
    switch (lead.stage) {
      case 'Trial': score += 10; break;
      case 'Follow Up': score += 5; break;
      case 'New': score += 0; break;
    }

    // Days since last contact
    let daysDiff = 20; 
    if (lead.lastContactDate) {
      const diff = differenceInDays(new Date(), parseISO(lead.lastContactDate));
      daysDiff = Math.max(0, Math.min(20, diff));
    }
    score -= daysDiff;

    return Math.max(0, score);
  };
  
  const getFilteredLeads = () => {
    let filtered = [...allLeads];
    
    // Tab filtering
    switch (deferredActiveTab) {
      case 'unassigned': filtered = filtered.filter(l => !l.assignedTo); break;
      case 'instagram': filtered = filtered.filter(l => l.source === 'Instagram'); break;
      case 'whatsapp': filtered = filtered.filter(l => l.source === 'WhatsApp'); break;
      case 'walkin': filtered = filtered.filter(l => l.source === 'Walk-in'); break;
      case 'tiktok': filtered = filtered.filter(l => l.source === 'TikTok'); break;
      case 'other': filtered = filtered.filter(l => l.source === 'Other'); break;
      case 'trials': filtered = filtered.filter(l => l.stage === 'Trial'); break;
      case 'followup': filtered = filtered.filter(l => l.stage === 'Follow Up'); break;
    }

    // Search filtering
    if (deferredSearchTerm) {
      const term = deferredSearchTerm.toLowerCase();
      filtered = filtered.filter(l => 
        l.name.toLowerCase().includes(term) || 
        l.phone.includes(term)
      );
    }

    if (deferredFilterBranch !== 'All') {
      filtered = filtered.filter(l => l.branch === deferredFilterBranch);
    }
    if (deferredFilterStage !== 'All') {
      filtered = filtered.filter(l => l.stage === deferredFilterStage);
    }
    if (deferredFilterInterest !== 'All') {
      filtered = filtered.filter(l => l.interest === deferredFilterInterest);
    }
    if (deferredFilterAssignedTo !== 'All') {
      filtered = filtered.filter(l => deferredFilterAssignedTo === 'unassigned' ? !l.assignedTo : l.assignedTo === deferredFilterAssignedTo);
    }

    if (deferredSortBy === 'score') {
      filtered.sort((a, b) => calculateLeadScore(b) - calculateLeadScore(a));
    } else if (deferredSortBy === 'newest') {
      filtered.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : (a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0);
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : (b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0);
        return dateB - dateA;
      });
    } else if (deferredSortBy === 'oldest') {
      filtered.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : (a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0);
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : (b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0);
        return dateA - dateB;
      });
    }

    return filtered;
  };

  const leads = getFilteredLeads();
  const totalPages = Math.ceil(leads.length / itemsPerPage);
  const paginatedLeads = leads.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeadIds(paginatedLeads.map(l => l.id));
    } else {
      setSelectedLeadIds([]);
    }
  };

  const handleSelectLead = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedLeadIds(prev => [...prev, id]);
    } else {
      setSelectedLeadIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleBulkStageUpdate = async (stage: LeadStage) => {
    for (const id of selectedLeadIds) {
      await updateClient(id, { stage });
    }
    setSelectedLeadIds([]);
  };

  const handleBulkAssign = async (userId: string) => {
    const isRep = currentUser?.role === 'rep';
    for (const id of selectedLeadIds) {
      const lead = clients.find(c => c.id === id);
      // Reps cannot reassign leads that already have an assigned rep (commission protection)
      if (isRep && lead?.assignedTo) continue;
      await updateClient(id, { assignedTo: userId === 'unassigned' ? '' : userId });
    }
    setSelectedLeadIds([]);
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = async () => {
    await deleteMultipleClients(selectedLeadIds);
    setSelectedLeadIds([]);
  };

  const handleDeleteLead = async (id: string) => {
    setLeadToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteLead = async () => {
    if (leadToDelete) {
      await deleteClient(leadToDelete);
      setLeadToDelete(null);
    }
  };

  const handleDeleteAllLeads = async () => {
    setIsDeleteAllLeadsDialogOpen(true);
  };

  const confirmDeleteAllLeads = async () => {
    const allLeadIds = allLeads.map(l => l.id);
    if (allLeadIds.length > 0) {
      await deleteMultipleClients(allLeadIds);
      setSelectedLeadIds([]);
    }
  };

  // Reset page when tab changes
  React.useEffect(() => {
    setCurrentPage(1);
    setSelectedLeadIds([]);
  }, [activeTab]);

  const exportToCSV = () => {
    const headers = ['Name', 'Phone', 'Branch', 'Source', 'Stage', 'Interest', 'Category', 'Trial Date', 'Last Contact', 'Next Reminder', 'Assigned To'];
    const csvRows = [
      headers.join(','),
      ...leads.map(l => {
        const assignedUser = resolveUserDisplay(l.assignedTo, users, 'Unassigned');
        return [
          `"${l.name}"`,
          `"${l.phone}"`,
          `"${l.branch || ''}"`,
          `"${l.source || ''}"`,
          `"${l.stage || ''}"`,
          `"${l.interest || ''}"`,
          `"${l.category || ''}"`,
          `"${l.trialDate ? format(parseISO(l.trialDate), 'yyyy-MM-dd') : ''}"`,
          `"${l.lastContactDate ? format(parseISO(l.lastContactDate), 'yyyy-MM-dd') : ''}"`,
          `"${l.nextReminderDate ? format(parseISO(l.nextReminderDate), 'yyyy-MM-dd') : ''}"`,
          `"${assignedUser}"`
        ].join(',');
      })
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleAddComment = async () => {
    if (selectedLead && newComment && currentUser) {
      const commentData = {
        id: 'temp-' + Date.now(),
        text: newComment,
        author: currentUser.name || 'Admin',
        date: new Date().toISOString()
      };
      await addComment(selectedLead.id, newComment, currentUser.name);
      
      if (activeLeadDetails?.leadId === selectedLead.id) {
        setActiveLeadDetails(prev => prev ? {
          ...prev,
          comments: [commentData, ...prev.comments]
        } : null);
      }
      setNewComment('');
    }
  };

  const handleAddInteraction = async () => {
    if (!interactionDate) {
      setInteractionDateError('Interaction date is required.');
      return;
    }
    setInteractionDateError('');
    if (selectedLead && currentUser) {
      const newIA: any = {
        type: interactionType,
        outcome: interactionOutcome,
        notes: interactionNotes,
        date: new Date(interactionDate).toISOString(),
        author: currentUser.name || 'Admin'
      };

      if (nextFollowUpDate) {
        newIA.nextFollowUp = nextFollowUpDate;
      }
      
      await addInteraction(selectedLead.id, newIA);

      if (activeLeadDetails?.leadId === selectedLead.id) {
        setActiveLeadDetails(prev => prev ? {
          ...prev,
          interactions: [{ ...newIA, id: 'temp-' + Date.now() }, ...prev.interactions]
        } : null);
      }

      setInteractionNotes('');
      setInteractionDate(format(new Date(), 'yyyy-MM-dd'));
      setNextFollowUpDate('');
    }
  };

  const handleAddLead = () => {
    if (!newLeadName || newLeadName.trim().length < 2) {
      alert('Please enter a valid lead name (at least 2 characters).');
      return;
    }
    if (!newLeadPhone || newLeadPhone.trim().length < 7) {
      alert('Please enter a valid phone number.');
      return;
    }
    const newLead: Client = {
      id: Math.random().toString(36).substr(2, 9),
      name: newLeadName.trim(),
      phone: newLeadPhone.trim(),
      status: 'Lead',
      source: newLeadSource,
      branch: newLeadBranch || undefined,
      stage: 'New',
      comments: [],
      interactions: [],
      assignedTo: newLeadAssignedTo || (currentUser?.role === 'rep' ? currentUser.id : undefined),
      lastContactDate: new Date().toISOString(),
      nextReminderDate: new Date(Date.now() + 86400000).toISOString(),
      linkedAccount: newLeadLinked || undefined,
    };
    addClient(newLead);
    setIsNewLeadOpen(false);
    setNewLeadName('');
    setNewLeadPhone('');
    setNewLeadSource('Instagram');
    setNewLeadBranch('');
    setNewLeadAssignedTo('');
    setNewLeadLinked(false);
  };

  const handleStageChange = (lead: Client, newStage: LeadStage) => {
    if (newStage === 'Converted') {
      setLeadToConvert(lead);
      setIsConvertDialogOpen(true);
    } else {
      updateClient(lead.id, { stage: newStage });
    }
  };

  const handleInterestChange = (lead: Client, newInterest: LeadInterest) => {
    if (newInterest === 'Not Interested') {
      updateClient(lead.id, { interest: newInterest, assignedTo: '' });
    } else {
      updateClient(lead.id, { interest: newInterest });
    }
  };

  const confirmConversion = () => {
    if (leadToConvert) {
      updateClient(leadToConvert.id, { 
        stage: 'Converted', 
        status: 'Active',
        startDate: new Date().toISOString()
      });
      setIsConvertDialogOpen(false);
      setLeadToConvert(null);
    }
  };

  const getInterestBadge = (interest?: LeadInterest) => {
    switch (interest) {
      case 'Interested': return <Badge className="bg-green-500">Interested</Badge>;
      case 'Not Interested': return <Badge variant="destructive">Not Interested</Badge>;
      case 'Pending': return <Badge variant="secondary">Pending</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getScoreBadge = (score: number) => {
    if (score >= 20) return <Badge className="bg-green-500">{score}</Badge>;
    if (score >= 10) return <Badge className="bg-yellow-500 text-black hover:bg-yellow-600">{score}</Badge>;
    return <Badge variant="destructive">{score}</Badge>;
  };

  // Check if reminder is due (overdue or due within the next 3 days)
  const isReminderDue = (lead: Client) => {
    if (!lead.nextReminderDate) return false;
    const nextReminder = parseISO(lead.nextReminderDate);
    const now = new Date();
    const threeDaysFromNow = addDays(now, 3);
    
    return isBefore(nextReminder, threeDaysFromNow);
  };

  const renderLeadsTable = (leadsData: Client[]) => (
    <div>
      {/* ── Mobile card list (< md) ── */}
      <div className="md:hidden divide-y divide-border">
        {leadsData.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No leads found.</div>
        ) : leadsData.map(lead => {
          const score = calculateLeadScore(lead);
          const overdue = lead.nextReminderDate && isBefore(parseISO(lead.nextReminderDate), new Date());
          const dueSoon = !overdue && lead.nextReminderDate && isBefore(parseISO(lead.nextReminderDate), addDays(new Date(), 3));
          return (
            <div
              key={lead.id}
              className={`flex items-center gap-3 px-4 py-3 ${overdue ? 'bg-red-50/50 dark:bg-red-900/10' : dueSoon ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
            >
              <Checkbox
                checked={selectedLeadIds.includes(lead.id)}
                onCheckedChange={(checked) => handleSelectLead(lead.id, !!checked)}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate">{lead.name}</span>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{lead.stage || 'New'}</Badge>
                  {score >= 20 ? <Badge className="bg-green-500 text-[10px] h-4 px-1.5">{score}</Badge>
                    : score >= 10 ? <Badge className="bg-yellow-500 text-black text-[10px] h-4 px-1.5">{score}</Badge>
                    : <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{score}</Badge>}
                  {overdue && <Badge variant="destructive" className="text-[10px] h-4 px-1">OVERDUE</Badge>}
                  {dueSoon && <Badge className="bg-amber-500 text-[10px] h-4 px-1">DUE SOON</Badge>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />
                    {currentUser?.role === 'rep' && lead.assignedTo !== currentUser.id ? '**********' : lead.phone}
                  </span>
                  {lead.source && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{lead.source}</Badge>}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-green-500 hover:bg-green-50 hover:text-green-600"
                onClick={() => setWhatsAppLead(lead)}
                title="Send WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => { setSelectedLead(lead); setIsMobileLeadDialogOpen(true); loadLeadDetails(lead.id); }}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              {canDeleteRecords && (
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => handleDeleteLead(lead.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
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
                checked={selectedLeadIds.length === leadsData.length && leadsData.length > 0}
                onCheckedChange={(checked) => handleSelectAll(!!checked)}
              />
            </TableHead>
            <TableHead>{t('leads.table.id')}</TableHead>
            <TableHead>{t('leads.table.name')}</TableHead>
            <TableHead>{t('leads.table.score')}</TableHead>
            <TableHead>{t('leads.table.phone')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('leads.branch')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('leads.table.source')}</TableHead>
            <TableHead>{t('leads.stage')}</TableHead>
            <TableHead>{t('leads.table.paid_status')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('leads.interest')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('leads.table.category')}</TableHead>
            <TableHead className="hidden xl:table-cell">{t('leads.table.trial_date')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('leads.table.last_contact')}</TableHead>
            <TableHead>{t('leads.table.next_reminder')}</TableHead>
            {canAssignLeads && <TableHead className="hidden lg:table-cell">{t('leads.assigned_to')}</TableHead>}
            <TableHead>{t('leads.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leadsData.map(lead => (
            <TableRow key={lead.id} className={isReminderDue(lead) ? (isBefore(parseISO(lead.nextReminderDate!), new Date()) ? 'bg-red-50/50 dark:bg-red-900/10' : 'bg-amber-50/50 dark:bg-amber-900/10') : ''}>
              <TableCell>
                <Checkbox 
                  checked={selectedLeadIds.includes(lead.id)}
                  onCheckedChange={(checked) => handleSelectLead(lead.id, !!checked)}
                />
              </TableCell>
              <TableCell>
                <div className="font-mono text-xs text-muted-foreground">
                  #{lead.memberId || '---'}
                </div>
              </TableCell>
              <TableCell className="font-medium">
                {lead.name}
              </TableCell>
              <TableCell>
                {getScoreBadge(calculateLeadScore(lead))}
              </TableCell>
              <TableCell>
                <div className="flex items-center">
                  <Phone className="h-3 w-3 mr-2 text-muted-foreground" />
                  {currentUser?.role === 'rep' && lead.assignedTo !== currentUser.id ? '**********' : lead.phone}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="secondary">{lead.branch || 'Unassigned'}</Badge>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline">{lead.source || 'Unknown'}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{lead.stage || 'New'}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={lead.paid || false} 
                    onCheckedChange={(checked) => updateClient(lead.id, { paid: !!checked })}
                  />
                  <span className="text-xs">{lead.paid ? 'Paid' : 'Not Paid'}</span>
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell">{getInterestBadge(lead.interest)}</TableCell>
              <TableCell className="hidden lg:table-cell">
                <Badge variant="outline">{lead.category || 'None'}</Badge>
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {lead.trialDate || lead.expectedVisitDate ? (
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-2 text-blue-500" />
                    {format(parseISO((lead.trialDate || lead.expectedVisitDate)!), 'MMM d, yyyy')}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Not set</span>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {lead.lastContactDate ? format(parseISO(lead.lastContactDate), 'MMM d') : 'Never'}
              </TableCell>
               <TableCell>
                {lead.nextReminderDate ? (
                  <div className="flex flex-col space-y-1">
                    <span className="text-sm">
                      {format(parseISO(lead.nextReminderDate), 'MMM d, yyyy')}
                    </span>
                    {isBefore(parseISO(lead.nextReminderDate), new Date()) ? (
                      <Badge variant="destructive" className="w-fit text-[10px] h-4 px-1">OVERDUE</Badge>
                    ) : isBefore(parseISO(lead.nextReminderDate), addDays(new Date(), 3)) ? (
                      <Badge className="bg-amber-500 hover:bg-amber-600 w-fit text-[10px] h-4 px-1">DUE SOON</Badge>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Not set</span>
                )}
              </TableCell>
              {canAssignLeads && (
                <TableCell className="hidden lg:table-cell">
                  <Select 
                    defaultValue={lead.assignedTo || 'unassigned'}
                    onValueChange={(v) => updateClient(lead.id, { assignedTo: v === 'unassigned' ? '' : (v || undefined) })}
                  >
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue placeholder="Assign rep">
                        {lead.assignedTo && lead.assignedTo !== 'unassigned'
                          ? resolveUserDisplay(lead.assignedTo, users, 'Unknown User')
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">{t('leads.tabs.unassigned')}</SelectItem>
                      {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).map(rep => (
                        <SelectItem key={rep.id} value={rep.id}>{rep.name || rep.email || 'Unknown User'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-500 hover:bg-green-50 hover:text-green-600"
                    onClick={() => setWhatsAppLead(lead)}
                    title="Send WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Dialog onOpenChange={(open) => { if (open) { setSelectedLead(lead); loadLeadDetails(lead.id); } }}>
                    <DialogTrigger render={<Button variant="ghost" size="sm" />}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Log Activity</span>
                  </DialogTrigger>
                  <DialogContent className="!w-full !max-w-[1400px] h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl rounded-3xl bg-background/95 backdrop-blur-xl">
                    <DialogHeader className="p-10 pb-6 bg-muted/30 border-b">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <DialogTitle className="text-3xl font-extrabold tracking-tight">Lead Profile: <span className="text-primary">{lead.name}</span></DialogTitle>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-primary/20">
                              #{lead.memberId || 'PENDING ID'}
                            </div>
                            <Badge variant="outline" className="rounded-full px-3 py-0.5 border-muted-foreground/30 font-bold text-[10px]">
                              {lead.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                      <Tabs defaultValue="information" className="w-full">
                        <TabsList className="w-full justify-start border-b rounded-none px-0 mb-8 bg-transparent space-x-6 h-auto">
                          <TabsTrigger 
                            value="information" 
                            className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3 font-semibold tracking-wider uppercase text-xs text-muted-foreground data-[state=active]:text-primary"
                          >
                            <User className="h-4 w-4 mr-2" />
                            Information
                          </TabsTrigger>
                          <TabsTrigger 
                            value="interactions" 
                            className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3 font-semibold tracking-wider uppercase text-xs text-muted-foreground data-[state=active]:text-primary"
                          >
                            <Activity className="h-4 w-4 mr-2" />
                            Interactions
                          </TabsTrigger>
                          <TabsTrigger 
                            value="comments" 
                            className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3 font-semibold tracking-wider uppercase text-xs text-muted-foreground data-[state=active]:text-primary"
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Comments
                          </TabsTrigger>
                          <TabsTrigger 
                            value="qrcode" 
                            className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3 font-semibold tracking-wider uppercase text-xs text-muted-foreground data-[state=active]:text-primary"
                          >
                            <MapPin className="h-4 w-4 mr-2" />
                            QR Code
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="information" className="mt-0">
                          <div className="bg-muted/30 p-8 rounded-[32px] border-2 border-white/10 shadow-inner">
                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground mb-8 flex items-center gap-3">
                              <User className="h-4 w-4 text-primary" />
                              Lead Details
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
                              <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</Label>
                                <Input
                                  type="text"
                                  className="w-full bg-background/50 border-white/5 rounded-xl h-12"
                                  defaultValue={lead.name}
                                  onChange={(e) => debouncedUpdate(lead.id, { name: e.target.value })}
                                  placeholder="Lead name"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone</Label>
                                <Input
                                  type="text"
                                  className="w-full bg-background/50 border-white/5 rounded-xl h-12"
                                  defaultValue={lead.phone}
                                  onChange={(e) => debouncedUpdate(lead.id, { phone: e.target.value })}
                                  placeholder="Phone number"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Source</Label>
                                  <Select 
                                    defaultValue={lead.source} 
                                    onValueChange={(v) => updateClient(lead.id, { source: v as LeadSource })}
                                  >
                                    <SelectTrigger className="w-full bg-background/50 border-white/5 rounded-xl h-12">
                                      <SelectValue placeholder="Select source" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Instagram">Instagram</SelectItem>
                                      <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                                      <SelectItem value="Walk-in">Walk-in</SelectItem>
                                      <SelectItem value="TikTok">TikTok</SelectItem>
                                      <SelectItem value="Other">Other</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Branch</Label>
                                  <Select 
                                    defaultValue={lead.branch || ''} 
                                    onValueChange={(v) => updateClient(lead.id, { branch: v as Branch })}
                                  >
                                    <SelectTrigger className="w-full bg-background/50 border-white/5 rounded-xl h-12">
                                      <SelectValue placeholder="Select branch" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="COMPLEX">COMPLEX</SelectItem>
                                      <SelectItem value="MIVIDA">MIVIDA</SelectItem>
                                      <SelectItem value="mitrixogymcrm IMPACT">mitrixogymcrm IMPACT</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stage</Label>
                                  <Select 
                                    defaultValue={lead.stage} 
                                    onValueChange={(v) => handleStageChange(lead, v as LeadStage)}
                                  >
                                    <SelectTrigger className="w-full bg-background/50 border-white/5 rounded-xl h-12">
                                      <SelectValue placeholder="Select stage" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="New">New</SelectItem>
                                      <SelectItem value="Trial">Int. & Trial</SelectItem>
                                      <SelectItem value="Follow Up">Follow Up</SelectItem>
                                      <SelectItem value="Converted">Converted</SelectItem>
                                      <SelectItem value="Lost">Lost</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Interest Level</Label>
                                  <Select 
                                    defaultValue={lead.interest} 
                                    onValueChange={(v) => handleInterestChange(lead, v as LeadInterest)}
                                  >
                                    <SelectTrigger className="w-full bg-background/50 border-white/5 rounded-xl h-12">
                                      <SelectValue placeholder="Select interest" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Interested">Interested</SelectItem>
                                      <SelectItem value="Pending">Pending</SelectItem>
                                      <SelectItem value="Not Interested">Not Interested</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8">
                               <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category / Reason</Label>
                                <Select 
                                  defaultValue={lead.category}
                                  onValueChange={(v) => updateClient(lead.id, { category: v as LeadCategory })}
                                >
                                  <SelectTrigger className="w-full bg-background/50 border-white/5 rounded-xl h-12">
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Out of area zone">Out of area zone</SelectItem>
                                    <SelectItem value="Social class">Social class</SelectItem>
                                    <SelectItem value="Price">Price</SelectItem>
                                    <SelectItem value="No answer">No answer</SelectItem>
                                    <SelectItem value="Ladies only">Ladies only</SelectItem>
                                    <SelectItem value="Morning package">Morning package</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                    <SelectItem value="None">None</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Trial / Expected Visit Date</Label>
                                <Input 
                                  type="date" 
                                  className="w-full bg-background/50 border-white/5 rounded-xl h-12"
                                  defaultValue={lead.trialDate || lead.expectedVisitDate ? format(parseISO((lead.trialDate || lead.expectedVisitDate) as string), 'yyyy-MM-dd') : ''}
                                  onChange={(e) => updateClient(lead.id, { trialDate: new Date(e.target.value).toISOString(), expectedVisitDate: new Date(e.target.value).toISOString() })}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8">
                              <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Next Reminder Date</Label>
                                <Input 
                                  type="date" 
                                  className="w-full bg-background/50 border-white/5 rounded-xl h-12"
                                  defaultValue={lead.nextReminderDate ? format(parseISO(lead.nextReminderDate), 'yyyy-MM-dd') : ''}
                                  onChange={(e) => updateClient(lead.id, { nextReminderDate: new Date(e.target.value).toISOString() })}
                                />
                              </div>
                              <div className="flex items-center space-x-3 pt-8">
                                <Checkbox 
                                  id={`paid-detail-${lead.id}`}
                                  checked={lead.paid || false} 
                                  onCheckedChange={(checked) => updateClient(lead.id, { paid: !!checked })}
                                  className="h-5 w-5 rounded-md border-primary/30"
                                />
                                <Label htmlFor={`paid-detail-${lead.id}`} className="text-sm font-semibold cursor-pointer">Payment Received (Paid)</Label>
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="interactions" className="mt-0">
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                            <div className="lg:col-span-7 space-y-6">
                              <div className="h-[400px] overflow-y-auto space-y-4 pr-4 custom-scrollbar bg-muted/10 p-6 rounded-[24px] border border-white/5">
                                {isDetailsLoading && activeLeadDetails?.leadId === lead.id ? (
                                  <div className="h-full flex flex-col items-center justify-center py-10">
                                    <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground opacity-20" />
                                    <p className="text-xs text-muted-foreground mt-2">Loading interactions...</p>
                                  </div>
                                ) : activeLeadDetails?.leadId === lead.id && activeLeadDetails.interactions.length > 0 ? (
                                  [...activeLeadDetails.interactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(interaction => (
                                    <div key={interaction.id} className="bg-background/40 p-5 rounded-2xl border border-white/5 shadow-sm space-y-3">
                                      <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                          <Badge className={
                                            interaction.type === 'Call' ? 'bg-blue-500' :
                                            interaction.type === 'WhatsApp' ? 'bg-green-500' :
                                            interaction.type === 'Email' ? 'bg-amber-500' :
                                            'bg-purple-500'
                                          }>
                                            {interaction.type}
                                          </Badge>
                                          <Badge variant="outline" className="border-primary/20 text-primary">
                                            {interaction.outcome}
                                          </Badge>
                                        </div>
                                        <span className="text-[10px] uppercase font-black text-muted-foreground/60 tracking-tighter">
                                          {format(parseISO(interaction.date), 'MMM d, h:mm a')}
                                        </span>
                                      </div>
                                      <p className="text-sm leading-relaxed text-foreground/90 italic">"{interaction.notes}"</p>
                                      <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground/50 border-t border-white/5 pt-2">
                                        <span className="flex items-center gap-1"><User className="h-3 w-3" /> {interaction.author}</span>
                                        {interaction.nextFollowUp && (
                                          <span className="flex items-center gap-1 text-amber-500/80">
                                            <Calendar className="h-3 w-3" /> Follow-up: {format(parseISO(interaction.nextFollowUp), 'MMM d')}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic gap-4">
                                    <div className="p-4 bg-muted/20 rounded-full">
                                      <Activity className="h-8 w-8 opacity-20" />
                                    </div>
                                    No interactions logged yet.
                                  </div>
                                )}
                              </div>
                              
                              <div className="bg-background/80 backdrop-blur-sm p-8 rounded-[32px] border border-white/10 shadow-2xl space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Type</Label>
                                    <Select value={interactionType} onValueChange={(v) => setInteractionType(v as InteractionType)}>
                                      <SelectTrigger className="bg-muted/20 border-white/5 rounded-xl h-10">
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
                                  <div className="space-y-2">
                                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Outcome</Label>
                                    <Select value={interactionOutcome} onValueChange={(v) => setInteractionOutcome(v as InteractionOutcome)}>
                                      <SelectTrigger className="bg-muted/20 border-white/5 rounded-xl h-10">
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
                                <div className="space-y-2">
                                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                                    Interaction Date <span className="text-destructive">*</span>
                                  </Label>
                                  <Input
                                    type="date"
                                    className={`bg-muted/20 border-white/5 rounded-xl h-10 ${interactionDateError ? 'border-destructive ring-1 ring-destructive' : ''}`}
                                    value={interactionDate}
                                    onChange={(e) => {
                                      setInteractionDate(e.target.value);
                                      if (e.target.value) setInteractionDateError('');
                                    }}
                                    required
                                  />
                                  {interactionDateError && (
                                    <p className="text-xs text-destructive mt-1">{interactionDateError}</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Follow-up Reminder (Optional)</Label>
                                  <Input
                                    type="date"
                                    className="bg-muted/20 border-white/5 rounded-xl h-10"
                                    value={nextFollowUpDate}
                                    onChange={(e) => setNextFollowUpDate(e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Interaction Notes</Label>
                                  <Textarea 
                                    placeholder="Summary of the conversation..." 
                                    className="min-h-[100px] rounded-2xl bg-muted/20 border-white/5 focus:border-primary/30 transition-all resize-none p-4"
                                    value={interactionNotes}
                                    onChange={(e) => setInteractionNotes(e.target.value)}
                                  />
                                </div>
                                <Button className="w-full rounded-2xl py-6 font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-transform" onClick={handleAddInteraction}>
                                  Log Interaction
                                </Button>
                              </div>
                            </div>

                            <div className="lg:col-span-5 h-full">
                              <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-[32px] p-8 border border-primary/10 h-full flex flex-col items-center text-center space-y-6">
                                <div className="p-5 bg-background shadow-xl rounded-2xl rotate-3">
                                  <Phone className="h-8 w-8 text-primary" />
                                </div>
                                <div className="space-y-2">
                                  <h4 className="font-black text-xl tracking-tight">Structured Logging</h4>
                                  <p className="text-sm text-muted-foreground leading-relaxed">
                                    Log each call, message or visit with specific outcomes to build a detailed history of engagement.
                                  </p>
                                </div>
                                <div className="w-full h-px bg-primary/10" />
                                <div className="grid grid-cols-2 gap-4 w-full">
                                  <div className="p-4 bg-background/50 rounded-2xl border border-white/5">
                                    <div className="text-2xl font-black text-primary">{lead.interactions?.length || 0}</div>
                                    <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Interactions</div>
                                  </div>
                                  <div className="p-4 bg-background/50 rounded-2xl border border-white/5">
                                    <div className="text-2xl font-black text-primary">
                                      {lead.lastContactDate ? differenceInDays(new Date(), parseISO(lead.lastContactDate)) : '∞'}
                                    </div>
                                    <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Last Interacted</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="comments" className="mt-0">
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                            <div className="lg:col-span-7 space-y-6">
                              <div className="h-[400px] overflow-y-auto space-y-4 pr-4 custom-scrollbar bg-muted/10 p-6 rounded-[24px] border border-white/5">
                                {isDetailsLoading && activeLeadDetails?.leadId === lead.id ? (
                                  <div className="h-full flex flex-col items-center justify-center py-10">
                                    <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground opacity-20" />
                                    <p className="text-xs text-muted-foreground mt-2">Loading notes...</p>
                                  </div>
                                ) : activeLeadDetails?.leadId === lead.id && activeLeadDetails.comments.length > 0 ? (
                                  [...activeLeadDetails.comments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(comment => (
                                    <div key={comment.id} className="bg-background/40 p-4 rounded-2xl text-sm border border-white/5 shadow-sm">
                                      <p className="leading-relaxed text-foreground/90">{comment.text}</p>
                                      <div className="flex justify-between mt-3 text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground/60">
                                        <span className="flex items-center gap-1.5"><User className="h-3 w-3" /> {comment.author}</span>
                                        <span>{format(parseISO(comment.date), 'MMM d, h:mm a')}</span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="h-full flex items-center justify-center text-muted-foreground italic text-sm">
                                    No comments logged yet.
                                  </div>
                                )}
                              </div>
                              
                              <div className="bg-background/80 backdrop-blur-sm p-6 rounded-[32px] border border-white/10 shadow-2xl space-y-4">
                                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">General Note</Label>
                                <Textarea 
                                  placeholder="Type any additional internal notes here..." 
                                  className="min-h-[120px] rounded-2xl bg-muted/20 border-white/5 focus:border-primary/30 transition-all resize-none p-4"
                                  value={newComment}
                                  onChange={(e) => setNewComment(e.target.value)}
                                />
                                <Button className="w-full rounded-2xl py-6 font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform" onClick={handleAddComment}>
                                  Save Note
                                </Button>
                              </div>
                            </div>

                            <div className="lg:col-span-5">
                              <div className="bg-primary/5 rounded-[32px] p-8 border border-primary/10 h-full flex flex-col justify-center items-center text-center space-y-4">
                                <div className="p-4 bg-primary/10 rounded-full">
                                  <MessageSquare className="h-8 w-8 text-primary" />
                                </div>
                                <h4 className="font-bold text-lg">Internal Comments</h4>
                                <p className="text-sm text-muted-foreground px-4">Internal notes for team collaboration and background information.</p>
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="qrcode" className="mt-0 space-y-8">
                           <div className="flex flex-col items-center justify-center p-12 bg-muted/30 rounded-[32px] border border-white/5">
                             <div className="text-center mb-8">
                               <h3 className="text-2xl font-black mb-2">Member QR Code</h3>
                               <p className="text-muted-foreground">Scan for quick check-ins and member access.</p>
                             </div>
                             
                             <div className="p-8 bg-white rounded-3xl shadow-2xl mb-8 transform transition-transform hover:scale-105" id={`qr-code-${lead.id}`}>
                               <QRCodeSVG value={lead.memberId || lead.id} size={250} level="H" includeMargin={true} data-qr-id={lead.memberId || lead.id} />
                               <div className="text-center mt-4 text-black font-extrabold pb-2">#{lead.memberId || 'PENDING ID'}</div>
                             </div>
                             
                             <div className="flex flex-wrap justify-center gap-4">
                               <Button 
                                 onClick={() => downloadQRCode(lead.memberId || lead.id, lead.name)}
                                 className="font-black uppercase tracking-widest px-8 py-6 rounded-2xl shadow-lg border-2 border-primary/20 hover:bg-primary"
                               >
                                 <Download className="mr-3 h-5 w-5" />
                                 Download
                               </Button>
                               <Button 
                                 onClick={() => copyQRCodeToClipboard(lead.memberId || lead.id)}
                                 variant="outline"
                                 className="font-black uppercase tracking-widest px-8 py-6 rounded-2xl shadow-lg border-2 border-primary/30 hover:bg-primary/5 hover:text-primary"
                               >
                                 <Copy className="mr-3 h-5 w-5" />
                                 Copy for Sharing
                               </Button>
                             </div>
                           </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </DialogContent>
                </Dialog>
                {canDeleteRecords && (
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteLead(lead.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight">{t('leads.title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            {t('leads.export_csv')}
          </Button>
          <ImportData type="Lead" />
          <ImportHistory />
          {canDeleteRecords && (
            <Button variant="destructive" size="sm" onClick={handleDeleteAllLeads}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('leads.delete_all')}
            </Button>
          )}
          <Dialog open={isNewLeadOpen} onOpenChange={setIsNewLeadOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-2 h-4 w-4" /> {t('leads.add_lead')}
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('leads.add_lead')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t('leads.table.name')}</Label>
                  <Input id="name" placeholder="Client Name" value={newLeadName} onChange={(e) => setNewLeadName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('leads.table.phone')}</Label>
                  <Input id="phone" placeholder="+20 100..." value={newLeadPhone} onChange={(e) => setNewLeadPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('leads.table.source')}</Label>
                  <Select value={newLeadSource} onValueChange={(v) => setNewLeadSource(v as LeadSource)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                      <SelectItem value="Walk-in">Walk-in</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('leads.branch')}</Label>
                  <Select value={newLeadBranch} onValueChange={(v) => setNewLeadBranch(v as Branch)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COMPLEX">COMPLEX</SelectItem>
                      <SelectItem value="MIVIDA">MIVIDA</SelectItem>
                      <SelectItem value="mitrixogymcrm IMPACT">mitrixogymcrm IMPACT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {currentUser?.role === 'rep' ? (
                  <div className="space-y-2">
                    <Label>{t('leads.assigned_to')}</Label>
                    <div className="h-10 px-3 flex items-center rounded-md border bg-muted/50 text-sm text-muted-foreground">
                      {currentUser.name || currentUser.email} (you)
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>{t('leads.assigned_to')}</Label>
                    <Select value={newLeadAssignedTo} onValueChange={(v) => setNewLeadAssignedTo(v || '')}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select assignment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">{t('leads.tabs.unassigned')}</SelectItem>
                        {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).map(rep => (
                          <SelectItem key={rep.id} value={rep.id}>{rep.name || rep.email || 'Unknown'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 p-3">
                  <Checkbox
                    checked={newLeadLinked}
                    onCheckedChange={(checked) => setNewLeadLinked(!!checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-semibold">Linked family account</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Shares a phone number with another member (e.g. parent's number for a child)</p>
                  </div>
                </label>
                <Button className="w-full" onClick={handleAddLead}>{t('leads.add_lead')}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">{t('leads.sort_by')}</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'newest' | 'oldest' | 'score')}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="score">Score (High-Low)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Search Name/Phone</Label>
            <Input 
              placeholder={t('leads.search_placeholder')} 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('leads.branch')}</Label>
            <Select value={filterBranch} onValueChange={(v) => setFilterBranch(v as Branch | 'All')}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t('dashboard.all_branches')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t('dashboard.all_branches')}</SelectItem>
                <SelectItem value="COMPLEX">COMPLEX</SelectItem>
                <SelectItem value="MIVIDA">MIVIDA</SelectItem>
                <SelectItem value="mitrixogymcrm IMPACT">mitrixogymcrm IMPACT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('leads.stage')}</Label>
            <Select value={filterStage} onValueChange={(v) => setFilterStage(v as LeadStage | 'All')}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Stages</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Follow Up">Follow Up</SelectItem>
                <SelectItem value="Trial">Trial</SelectItem>
                <SelectItem value="Interested">Interested</SelectItem>
                <SelectItem value="Not Interested">Not Interested</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('leads.interest')}</Label>
            <Select value={filterInterest} onValueChange={(v) => setFilterInterest(v as LeadInterest | 'All')}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Interests" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Interests</SelectItem>
                <SelectItem value="Interested">Interested</SelectItem>
                <SelectItem value="Not Interested">Not Interested</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('leads.assigned_to')}</Label>
            <Select value={filterAssignedTo} onValueChange={(v) => setFilterAssignedTo(v || 'All')}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Reps">
                  {filterAssignedTo === 'All' || !filterAssignedTo
                    ? undefined
                    : filterAssignedTo === 'unassigned'
                      ? t('leads.tabs.unassigned')
                      : users.find(u => u.id === filterAssignedTo)?.name || 'Unknown User'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Reps</SelectItem>
                <SelectItem value="unassigned">{t('leads.tabs.unassigned')}</SelectItem>
                {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).map(rep => (
                  <SelectItem key={rep.id} value={rep.id}>{rep.name || rep.email || 'Unknown User'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {selectedLeadIds.length > 0 && (
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground p-3 rounded-lg shadow-lg flex flex-wrap items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-primary-foreground text-primary">
              {selectedLeadIds.length} selected
            </Badge>
            <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setSelectedLeadIds([])}>
              Cancel
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-primary-foreground/10 p-1 rounded-md">
              <ArrowRight className="h-4 w-4" />
              <Select onValueChange={(v: string | null) => v && handleBulkStageUpdate(v as LeadStage)}>
                <SelectTrigger className="h-8 w-[140px] bg-transparent border-none text-primary-foreground">
                  <SelectValue placeholder="Update Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Trial">Int. & Trial</SelectItem>
                  <SelectItem value="Follow Up">Follow Up</SelectItem>
                  <SelectItem value="Lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {canAssignLeads ? (
              <div className="flex items-center gap-2 bg-primary-foreground/10 p-1 rounded-md">
                <UserCheck className="h-4 w-4" />
                <Select onValueChange={(v: string | null) => v && handleBulkAssign(v)}>
                  <SelectTrigger className="h-8 w-[140px] bg-transparent border-none text-primary-foreground">
                    <SelectValue placeholder="Assign To" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).map(rep => (
                      <SelectItem key={rep.id} value={rep.id}>{rep.name || rep.email || 'Unknown User'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {canDeleteRecords && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete Selected
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog 
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Lead"
        description="Are you sure you want to delete this lead? This action cannot be undone."
        onConfirm={confirmDeleteLead}
        variant="destructive"
        confirmText="Delete"
      />

      <ConfirmDialog 
        isOpen={isBulkDeleteDialogOpen}
        onOpenChange={setIsBulkDeleteDialogOpen}
        title="Delete Multiple Leads"
        description={`Are you sure you want to delete ${selectedLeadIds.length} leads? This action cannot be undone.`}
        onConfirm={confirmBulkDelete}
        variant="destructive"
        confirmText="Delete All Selected"
      />

      <ConfirmDialog 
        isOpen={isDeleteAllLeadsDialogOpen}
        onOpenChange={setIsDeleteAllLeadsDialogOpen}
        title="CRITICAL: Delete All Leads"
        description="Are you sure you want to delete ALL leads in the system? This action is permanent and cannot be undone."
        onConfirm={confirmDeleteAllLeads}
        variant="destructive"
        confirmText="Yes, Delete Everything"
      />

      {whatsAppLead && (
        <WhatsAppDialog
          isOpen={!!whatsAppLead}
          onOpenChange={(open) => !open && setWhatsAppLead(null)}
          client={whatsAppLead}
          onSuccess={() => {
            if (activeLeadDetails?.leadId === whatsAppLead.id) {
              loadLeadDetails(whatsAppLead.id);
            }
          }}
        />
      )}

      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
          <TabsList className="flex w-max sm:w-full bg-muted/50 rounded-lg p-1 justify-start sm:justify-center mb-4">
            <TabsTrigger value="unassigned" className="px-4 text-xs sm:text-sm text-amber-600 font-bold dark:text-amber-500">{t('leads.tabs.unassigned')}</TabsTrigger>
            <TabsTrigger value="all" className="px-4 text-xs sm:text-sm">{t('leads.tabs.all')}</TabsTrigger>
            <TabsTrigger value="instagram" className="px-4 text-xs sm:text-sm">{t('leads.tabs.instagram')}</TabsTrigger>
            <TabsTrigger value="whatsapp" className="px-4 text-xs sm:text-sm">{t('leads.tabs.whatsapp')}</TabsTrigger>
            <TabsTrigger value="walkin" className="px-4 text-xs sm:text-sm">{t('leads.tabs.walk_in')}</TabsTrigger>
            <TabsTrigger value="tiktok" className="px-4 text-xs sm:text-sm">{t('leads.tabs.tiktok')}</TabsTrigger>
            <TabsTrigger value="other" className="px-4 text-xs sm:text-sm">{t('leads.tabs.other')}</TabsTrigger>
            <TabsTrigger value="trials" className="px-4 text-xs sm:text-sm">{t('leads.tabs.trials')}</TabsTrigger>
            <TabsTrigger value="followup" className="px-4 text-xs sm:text-sm">{t('leads.tabs.follow_up')}</TabsTrigger>
          </TabsList>
        </div>
        
        <Card>
          <CardContent className="p-0">
            {renderLeadsTable(paginatedLeads)}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, leads.length)} of {leads.length} entries
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
      </Tabs>

      <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Lead to Client?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">
              Would you like to convert <strong>{leadToConvert?.name}</strong> into an active client record? 
              This will move them from Leads to Members.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConvertDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmConversion}>Confirm Conversion</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Shared mobile lead dialog */}
      {selectedLead && (
        <Dialog open={isMobileLeadDialogOpen} onOpenChange={(open) => { setIsMobileLeadDialogOpen(open); if (!open) setSelectedLead(null); }}>
          <DialogContent className="!w-full !max-w-[1400px] h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl bg-background/95 backdrop-blur-xl">
            <DialogHeader className="p-4 pb-4 bg-muted/30 border-b shrink-0">
              <DialogTitle className="text-xl font-extrabold tracking-tight">Lead: <span className="text-primary">{selectedLead.name}</span></DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <div className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-black uppercase border border-primary/20">#{selectedLead.memberId || 'PENDING'}</div>
                <Badge variant="outline" className="rounded-full text-[10px]">{selectedLead.status}</Badge>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              {/* Tab nav */}
              <div className="overflow-x-auto border-b">
                <div className="flex w-max px-2 pt-2 gap-1">
                  {(['information','interactions','comments','qrcode'] as const).map(tab => (
                    <button key={tab} data-mobile-lead-tab={tab} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b-2 border-transparent data-[active]:border-primary data-[active]:text-primary whitespace-nowrap" onClick={e => {
                      document.querySelectorAll('[data-mobile-lead-tab]').forEach(el => el.removeAttribute('data-active'));
                      (e.currentTarget as HTMLElement).setAttribute('data-active','');
                      document.querySelectorAll('[data-mobile-lead-panel]').forEach(el => (el as HTMLElement).style.display='none');
                      const panel = document.querySelector(`[data-mobile-lead-panel="${tab}"]`) as HTMLElement;
                      if(panel) panel.style.display='block';
                    }}>
                      {tab === 'information' ? 'Info' : tab === 'interactions' ? 'Activity' : tab === 'comments' ? 'Notes' : 'QR'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Minimal info panel for mobile */}
              <div data-mobile-lead-panel="information" className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground text-xs">Source</span><div className="font-medium">{selectedLead.source || 'Unknown'}</div></div>
                  <div><span className="text-muted-foreground text-xs">Stage</span><div className="font-medium">{selectedLead.stage || 'New'}</div></div>
                  <div><span className="text-muted-foreground text-xs">Branch</span><div className="font-medium">{selectedLead.branch || '—'}</div></div>
                  <div><span className="text-muted-foreground text-xs">Interest</span><div className="font-medium">{selectedLead.interest || 'Pending'}</div></div>
                  <div><span className="text-muted-foreground text-xs">Phone</span><div className="font-medium">{selectedLead.phone}</div></div>
                  <div><span className="text-muted-foreground text-xs">Category</span><div className="font-medium">{selectedLead.category || '—'}</div></div>
                </div>
                <div className="space-y-2 pt-2">
                  <Label className="text-xs">Stage</Label>
                  <Select defaultValue={selectedLead.stage} onValueChange={v => updateClient(selectedLead.id, { stage: v as LeadStage })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['New','Follow Up','Trial','Interested','Not Interested'] as LeadStage[]).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Label className="text-xs">Interest</Label>
                  <Select defaultValue={selectedLead.interest} onValueChange={v => handleInterestChange(selectedLead, v as LeadInterest)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['Interested','Not Interested','Pending'] as LeadInterest[]).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div data-mobile-lead-panel="interactions" style={{display:'none'}} className="p-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">Type</Label>
                  <Select value={interactionType} onValueChange={v => setInteractionType(v as InteractionType)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['Call','WhatsApp','Email','Visit'] as InteractionType[]).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Label className="text-xs">Outcome</Label>
                  <Select value={interactionOutcome} onValueChange={v => setInteractionOutcome(v as InteractionOutcome)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['Interested','Not Answered','Scheduled Trial','Rejected','Other'] as InteractionOutcome[]).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Label className="text-xs">Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={interactionDate} onChange={e => setInteractionDate(e.target.value)} className="h-9" />
                  <Label className="text-xs">Follow-up Reminder (Optional)</Label>
                  <Input type="date" value={nextFollowUpDate} onChange={e => setNextFollowUpDate(e.target.value)} className="h-9" />
                  <Label className="text-xs">Notes</Label>
                  <Textarea placeholder="Notes..." value={interactionNotes} onChange={e => setInteractionNotes(e.target.value)} className="min-h-[80px]" />
                  <Button className="w-full" onClick={handleAddInteraction}>Log Interaction</Button>
                </div>
                <div className="space-y-2 mt-4">
                  {(selectedLead.interactions || []).slice().reverse().map((ia, i) => (
                    <div key={i} className="text-xs bg-muted/30 rounded-lg p-3">
                      <div className="font-bold">{ia.type} — {ia.outcome}</div>
                      <div className="text-muted-foreground mt-0.5">{ia.date ? format(parseISO(ia.date), 'MMM d, yyyy') : ''}</div>
                      {ia.notes && <div className="mt-1">{ia.notes}</div>}
                    </div>
                  ))}
                </div>
              </div>
              <div data-mobile-lead-panel="comments" style={{display:'none'}} className="p-4 space-y-3">
                <div className="space-y-2">
                  {(selectedLead.comments || []).slice().reverse().map(c => (
                    <div key={c.id} className="text-xs bg-muted/30 rounded-lg p-3">
                      <p>{c.text}</p>
                      <div className="text-muted-foreground mt-1">{c.author} · {format(parseISO(c.date), 'MMM d')}</div>
                    </div>
                  ))}
                  <Textarea placeholder="Add note..." value={newComment} onChange={e => setNewComment(e.target.value)} className="min-h-[80px]" />
                  <Button className="w-full" onClick={handleAddComment}>Save Note</Button>
                </div>
              </div>
              <div data-mobile-lead-panel="qrcode" style={{display:'none'}} className="p-4 flex flex-col items-center gap-4">
                <div className="p-6 bg-white rounded-2xl shadow-lg">
                  <QRCodeSVG value={selectedLead.memberId || selectedLead.id} size={200} level="H" includeMargin={true} data-qr-id={selectedLead.memberId || selectedLead.id} />
                  <div className="text-center mt-2 text-black font-bold text-sm">#{selectedLead.memberId || 'PENDING'}</div>
                </div>
                <Button className="w-full" onClick={() => downloadQRCode(selectedLead.memberId || selectedLead.id, selectedLead.name)}>
                  <Download className="mr-2 h-4 w-4" />Download QR
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

