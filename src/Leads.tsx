import { QRCodeSVG } from 'qrcode.react';
import React, { useState, useDeferredValue, useRef, useEffect, useMemo } from 'react';
import { useAppContext } from './context';
import { getTenantId } from './firebase';
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
import { safeFormatDate, toValidDate, safeIsoDate } from './utils/dateUtils';
import { Client, LeadCategory, LeadInterest, LeadSource, LeadStage, Branch, InteractionType, InteractionOutcome, Gender, ClientPackage, Package, Coach } from './types';
import { Phone, Calendar, MessageSquare, Plus, FileSpreadsheet, Download, UserCheck, ArrowRight, Package as PackageIcon, Sparkles, CheckCircle2, Clock, Building2, Dumbbell, CreditCard } from 'lucide-react';
import ImportData from './ImportData';
import ImportHistory from './ImportHistory';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, ChevronLeft, ChevronRight, User, Search, MapPin, Tag, Info, AlertCircle, Activity, QrCode, Copy, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { resolveUserDisplay } from './utils/resolveUserDisplay';
import { addClient as addClientWithId } from './services/clientService';
import { WhatsAppDialog } from './components/WhatsAppDialog';
import { MessageCircle } from 'lucide-react';
import { downloadFile } from './utils/download';
import { PhoneInput } from './components/ui/PhoneInput';
import { addAuditLog } from './services/auditService';
import { openClickToCallModal } from './services/clickToCallService';
import { checkPhoneSimilarityForCandidate, maskEgyptianPhone } from './utils/phoneSimilarity';
import { matchesFuzzyNameSearch } from './utils/fuzzyNameSearch';

export default function Leads() {
  const {
    currentUser,
    users,
    canAssignLeads,
    canDeleteRecords,
    fetchClientDetails,
    clients, addClient, updateClient, deleteMultipleClients, deleteClient, addComment, addInteraction,
    prefilledLeadData, setPrefilledLeadData,
    branches,
    features,
    packages,
    coaches,
    addPayment,
    setActiveTab: setNavTab,
    setActiveClientId
  } = useAppContext();
  const { t } = useLanguage();
  const isInzan = getTenantId() === 'inzanathletics' || features?.salesPipelineStages === '7-stage';

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
  const [sortBy, setSortBy] = useState<'transferred' | 'newest' | 'oldest' | 'score'>('transferred');
  const [onlyRecentTransfers, setOnlyRecentTransfers] = useState(false);

  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredFilterBranch = useDeferredValue(filterBranch);
  const deferredFilterStage = useDeferredValue(filterStage);
  const deferredFilterInterest = useDeferredValue(filterInterest);
  const deferredFilterAssignedTo = useDeferredValue(filterAssignedTo);
  const deferredSortBy = useDeferredValue(sortBy);
  const deferredActiveTab = useDeferredValue(activeTab);
  const deferredOnlyRecentTransfers = useDeferredValue(onlyRecentTransfers);
  
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadSource, setNewLeadSource] = useState<LeadSource>('Instagram');
  const [newLeadBranch, setNewLeadBranch] = useState<Branch | ''>('');
  const [newLeadAssignedTo, setNewLeadAssignedTo] = useState<string>(
    currentUser?.role === 'rep' ? currentUser.id : ''
  );
  const [newLeadLinked, setNewLeadLinked] = useState(false);
  const [newLeadGender, setNewLeadGender] = useState<Gender>('Male');

  React.useEffect(() => {
    if (prefilledLeadData) {
      if (prefilledLeadData.name) setNewLeadName(prefilledLeadData.name);
      if (prefilledLeadData.phone) setNewLeadPhone(prefilledLeadData.phone);
      setIsNewLeadOpen(true);
      setPrefilledLeadData(null);
    }
  }, [prefilledLeadData, setPrefilledLeadData]);

  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [leadToConvert, setLeadToConvert] = useState<Client | null>(null);
  const [convertPackageId, setConvertPackageId] = useState<string>('');
  const [convertStartDate, setConvertStartDate] = useState<string>('');
  const [convertEndDate, setConvertEndDate] = useState<string>('');
  const [convertBranch, setConvertBranch] = useState<string>('');
  const [convertCoachId, setConvertCoachId] = useState<string>('');
  const [convertRecordPayment, setConvertRecordPayment] = useState<boolean>(true);
  const [convertPaymentMethod, setConvertPaymentMethod] = useState<'Cash' | 'Credit Card' | 'Bank Transfer' | 'Instapay' | 'Other'>('Cash');
  const [convertPaymentAmount, setConvertPaymentAmount] = useState<string>('');
  const [convertInstapayRef, setConvertInstapayRef] = useState<string>('');
  const [convertPaymentNotes, setConvertPaymentNotes] = useState<string>('');
  const [convertError, setConvertError] = useState<string>('');
  const [isSubmittingConvert, setIsSubmittingConvert] = useState<boolean>(false);
  const [conversionSuccessInfo, setConversionSuccessInfo] = useState<{ memberName: string; packageName: string; memberId?: string } | null>(null);
  const [isMobileLeadDialogOpen, setIsMobileLeadDialogOpen] = useState(false);

  // Quick inline Call / Comment logger while scrolling the table
  const [quickNoteLeadId, setQuickNoteLeadId] = useState<string | null>(null);
  const [quickNoteText, setQuickNoteText] = useState<string>('');
  const [quickNoteOutcome, setQuickNoteOutcome] = useState<InteractionOutcome>('Not Answered');
  const [isSavingQuickNote, setIsSavingQuickNote] = useState<boolean>(false);

  // Sales Rep Portfolio Transfer modal (for when a sales rep leaves the gym)
  const [isTransferRepOpen, setIsTransferRepOpen] = useState<boolean>(false);
  const [transferSourceRep, setTransferSourceRep] = useState<string>('');
  const [transferMode, setTransferMode] = useState<'single' | 'round-robin'>('single');
  const [transferTargetRep, setTransferTargetRep] = useState<string>('');
  const [transferPoolReps, setTransferPoolReps] = useState<string[]>([]);
  const [transferStageFilter, setTransferStageFilter] = useState<string>('All');
  const [transferCallFilter, setTransferCallFilter] = useState<'all' | 'has_call' | 'no_call'>('all');
  const [isTransferringRep, setIsTransferringRep] = useState<boolean>(false);

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

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isDeleteAllLeadsDialogOpen, setIsDeleteAllLeadsDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const allLeads = useMemo(() => {
    return clients.filter(c => {
      if (c.status !== 'Lead') return false;
      if (currentUser?.role === 'rep' && c.assignedTo !== currentUser.id) return false;
      return true;
    });
  }, [clients, currentUser?.role, currentUser?.id]);

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
      const d = toValidDate(lead.lastContactDate);
      if (d) {
        const diff = differenceInDays(new Date(), d);
        daysDiff = Math.max(0, Math.min(20, diff));
      }
    }
    score -= daysDiff;

    return Math.max(0, score);
  };

  const getLatestCallInfo = (lead: Client): { text: string; date?: string; author?: string; outcome?: string; type?: string } | null => {
    if (lead.lastCall && lead.lastCall.text) {
      return lead.lastCall;
    }
    if (lead.lastCallText) {
      return {
        text: lead.lastCallText,
        date: lead.lastCallDate,
        author: lead.lastCallBy,
      };
    }
    if (Array.isArray(lead.interactions) && lead.interactions.length > 0) {
      const sorted = [...lead.interactions].sort((a, b) => (toValidDate(b.date)?.getTime() || 0) - (toValidDate(a.date)?.getTime() || 0));
      const latest = sorted[0];
      if (latest) {
        return {
          text: latest.notes || latest.outcome || latest.type || 'Call logged',
          date: latest.date,
          author: latest.author,
          outcome: latest.outcome,
          type: latest.type,
        };
      }
    }
    return null;
  };

  const getLatestCommentInfo = (lead: Client): { text: string; date?: string; author?: string } | null => {
    if (lead.lastComment && lead.lastComment.text) {
      return lead.lastComment;
    }
    if (Array.isArray(lead.comments) && lead.comments.length > 0) {
      const sorted = [...lead.comments].sort((a, b) => (toValidDate(b.date)?.getTime() || 0) - (toValidDate(a.date)?.getTime() || 0));
      const latest = sorted[0];
      if (latest && latest.text) {
        return {
          text: latest.text,
          date: latest.date,
          author: latest.author,
        };
      }
    }
    if (lead.frontDeskNote) {
      return {
        text: lead.frontDeskNote,
        date: lead.createdAt,
        author: lead.salesName || lead.salesRep,
      };
    }
    return null;
  };

  const getLeadRepLabel = (lead: Client): string => {
    if (lead.assignedTo && lead.assignedTo !== 'unassigned') {
      const resolved = resolveUserDisplay(lead.assignedTo, users, '');
      if (resolved) return resolved;
    }
    if (lead.salesName) return lead.salesName;
    if (lead.salesRep) return lead.salesRep;
    return '';
  };

  const getLeadTransferTimestamp = (lead: Client): number => {
    const raw = lead.transferredAt || lead.assignedAt;
    if (!raw) return 0;
    const ms = new Date(raw).getTime();
    return isNaN(ms) ? 0 : ms;
  };

  const isRecentlyTransferred = (lead: Client, windowHours = 24): boolean => {
    const ts = getLeadTransferTimestamp(lead);
    if (!ts) return false;
    const diffMs = Date.now() - ts;
    return diffMs >= -60000 && diffMs <= windowHours * 60 * 60 * 1000;
  };

  const recentTransfersCount = useMemo(() => {
    return allLeads.filter(l => isRecentlyTransferred(l, 24)).length;
  }, [allLeads]);

  // Build unified list of sales reps (both CRM users and RedGITS salesName values on leads) with lead counts
  const repSummaries = useMemo(() => {
    const map = new Map<string, { value: string; label: string; userId?: string; count: number; isLegacyName?: boolean; isNonWorking?: boolean }>();

    users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '')).forEach(u => {
      const label = u.name || u.email || 'Unknown User';
      map.set(u.id, {
        value: u.id,
        label,
        userId: u.id,
        count: 0,
        isNonWorking: u.status === 'nonworking',
      });
    });

    allLeads.forEach(l => {
      if (l.assignedTo && map.has(l.assignedTo)) {
        map.get(l.assignedTo)!.count += 1;
      } else {
        const repName = (l.salesName || l.salesRep || (l.assignedTo ? resolveUserDisplay(l.assignedTo, users, l.assignedTo) : '')).trim();
        if (repName) {
          // Check if matches an existing user by name (case-insensitive)
          const matchedUser = Array.from(map.values()).find(r => r.label.toLowerCase() === repName.toLowerCase());
          if (matchedUser) {
            matchedUser.count += 1;
          } else {
            const key = `name:${repName}`;
            if (!map.has(key)) {
              map.set(key, {
                value: key,
                label: repName,
                count: 0,
                isLegacyName: true,
              });
            }
            map.get(key)!.count += 1;
          }
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [users, allLeads]);

  const matchesRepFilter = (lead: Client, filterVal: string): boolean => {
    if (!filterVal || filterVal === 'All') return true;
    if (filterVal === 'unassigned') {
      return !lead.assignedTo && !lead.salesName && !lead.salesRep;
    }
    if (filterVal.startsWith('name:')) {
      const targetName = filterVal.slice(5).toLowerCase();
      return (
        (lead.salesName || '').toLowerCase() === targetName ||
        (lead.salesRep || '').toLowerCase() === targetName ||
        resolveUserDisplay(lead.assignedTo, users, '').toLowerCase() === targetName
      );
    }
    const targetUser = users.find(u => u.id === filterVal);
    const targetNameLower = (targetUser?.name || '').toLowerCase();
    return (
      lead.assignedTo === filterVal ||
      (!!targetNameLower && (
        (lead.salesName || '').toLowerCase() === targetNameLower ||
        (lead.salesRep || '').toLowerCase() === targetNameLower
      ))
    );
  };
  
  // ⚡ Bolt Performance Optimization:
  // Converted getFilteredLeads logic into a useMemo hook (now computing 'leads' directly).
  const leads = React.useMemo(() => {
    let filtered = [...allLeads];
    
    // Tab filtering
    switch (deferredActiveTab) {
      case 'unassigned': filtered = filtered.filter(l => !l.assignedTo); break;
      case 'recently_transferred': filtered = filtered.filter(l => isRecentlyTransferred(l, 24)); break;
      case 'referrals':
        filtered = filtered.filter(l =>
          String(l.source || '') === 'Referral' ||
          String(l.comeFromType || '') === 'Referral' ||
          Boolean((l as any).referredByClientId) ||
          Boolean((l as any).invitedByClientId) ||
          Boolean(l.referredBy)
        );
        break;
      case 'instagram': filtered = filtered.filter(l => l.source === 'Instagram'); break;
      case 'whatsapp': filtered = filtered.filter(l => l.source === 'WhatsApp'); break;
      case 'walkin': filtered = filtered.filter(l => l.source === 'Walk-in'); break;
      case 'tiktok': filtered = filtered.filter(l => l.source === 'TikTok'); break;
      case 'other': filtered = filtered.filter(l => l.source === 'Other'); break;
      case 'trials': filtered = filtered.filter(l => l.stage === 'Trial'); break;
      case 'followup': filtered = filtered.filter(l => l.stage === 'Follow Up'); break;
    }

    // Search filtering (Name, Phone, Lead Code, Latest Call, Latest Comment, Sales Rep)
    if (deferredSearchTerm) {
      const term = deferredSearchTerm.toLowerCase();
      filtered = filtered.filter(l => {
        const callInfo = getLatestCallInfo(l);
        const commentInfo = getLatestCommentInfo(l);
        return (
          matchesFuzzyNameSearch(l.name, term) || 
          (l.phone || '').includes(term) ||
          String(l.leadId || l.redgitsId || '').toLowerCase().includes(term) ||
          matchesFuzzyNameSearch(l.salesName, term) ||
          matchesFuzzyNameSearch(l.salesRep, term) ||
          (callInfo?.text || '').toLowerCase().includes(term) ||
          (callInfo?.author || '').toLowerCase().includes(term) ||
          (commentInfo?.text || '').toLowerCase().includes(term)
        );
      });
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
      filtered = filtered.filter(l => matchesRepFilter(l, deferredFilterAssignedTo));
    }
    if (deferredOnlyRecentTransfers) {
      filtered = filtered.filter(l => isRecentlyTransferred(l, 24));
    }

    if (deferredSortBy === 'transferred') {
      filtered.sort((a, b) => {
        const transA = getLeadTransferTimestamp(a);
        const transB = getLeadTransferTimestamp(b);
        if (transA !== transB) return transB - transA;
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : (a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0);
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : (b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0);
        return dateB - dateA;
      });
    } else if (deferredSortBy === 'score') {
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
  }, [
    allLeads,
    deferredActiveTab,
    deferredSearchTerm,
    deferredFilterBranch,
    deferredFilterStage,
    deferredFilterInterest,
    deferredFilterAssignedTo,
    deferredSortBy,
    deferredOnlyRecentTransfers,
    users
  ]);

  const totalPages = Math.ceil(leads.length / itemsPerPage);
  const paginatedLeads = leads.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeadIds(paginatedLeads.map(l => l.id));
    } else {
      setSelectedLeadIds([]);
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedLeadIds(leads.map(l => l.id));
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

  const resolveRepTarget = (targetVal: string): { assignedTo: string; salesName: string; salesRep: string } => {
    if (!targetVal || targetVal === 'unassigned') {
      return { assignedTo: '', salesName: '', salesRep: '' };
    }
    if (targetVal.startsWith('name:')) {
      const repName = targetVal.slice(5);
      const matchedUser = users.find(u => (u.name || '').toLowerCase() === repName.toLowerCase());
      return {
        assignedTo: matchedUser ? matchedUser.id : repName,
        salesName: repName,
        salesRep: repName,
      };
    }
    const matchedUser = users.find(u => u.id === targetVal);
    const repName = matchedUser?.name || matchedUser?.email || targetVal;
    return {
      assignedTo: targetVal,
      salesName: repName,
      salesRep: repName,
    };
  };

  const handleBulkAssign = async (userId: string) => {
    const isRep = currentUser?.role === 'rep';
    const resolved = resolveRepTarget(userId);
    const nowIso = new Date().toISOString();
    for (const id of selectedLeadIds) {
      const lead = clients.find(c => c.id === id);
      // Reps cannot reassign leads that already have an assigned rep (commission protection)
      if (isRep && lead?.assignedTo) continue;
      await updateClient(id, {
        assignedTo: resolved.assignedTo,
        salesName: resolved.salesName || undefined,
        salesRep: resolved.salesRep || undefined,
        assignedAt: resolved.assignedTo ? nowIso : undefined,
        transferredAt: resolved.assignedTo ? nowIso : undefined,
        assignedBy: currentUser?.name || currentUser?.id || 'System',
      });
    }
    setSelectedLeadIds([]);
  };

  const handleQuickSaveCallNote = async (lead: Client) => {
    if (!quickNoteText.trim()) return;
    setIsSavingQuickNote(true);
    try {
      const nowIso = new Date().toISOString();
      const authorName = currentUser?.name || currentUser?.email || 'Sales Team';
      await addInteraction(lead.id, {
        type: 'Call',
        outcome: quickNoteOutcome,
        notes: quickNoteText.trim(),
        date: nowIso,
      });
      await addComment(lead.id, quickNoteText.trim(), authorName);
      setQuickNoteLeadId(null);
      setQuickNoteText('');
    } catch (err) {
      console.error('[Leads] Failed to save quick call note:', err);
    } finally {
      setIsSavingQuickNote(false);
    }
  };

  // Candidates matching the Sales Rep Portfolio Transfer modal filters
  const transferCandidateLeads = useMemo(() => {
    if (!transferSourceRep) return [];
    return allLeads.filter(l => {
      if (!matchesRepFilter(l, transferSourceRep)) return false;
      if (transferStageFilter !== 'All' && (l.stage || 'New') !== transferStageFilter) return false;
      const hasCall = !!getLatestCallInfo(l) || !!getLatestCommentInfo(l);
      if (transferCallFilter === 'has_call' && !hasCall) return false;
      if (transferCallFilter === 'no_call' && hasCall) return false;
      return true;
    });
  }, [allLeads, transferSourceRep, transferStageFilter, transferCallFilter, users]);

  const handleExecuteRepTransfer = async () => {
    if (transferCandidateLeads.length === 0) return;
    const targets = transferMode === 'single'
      ? (transferTargetRep ? [transferTargetRep] : [])
      : transferPoolReps;
    if (targets.length === 0) {
      alert('Please select at least one target Sales Rep to receive the leads.');
      return;
    }

    setIsTransferringRep(true);
    try {
      const sourceLabel = repSummaries.find(r => r.value === transferSourceRep)?.label || transferSourceRep;
      const nowIso = new Date().toISOString();
      for (let i = 0; i < transferCandidateLeads.length; i++) {
        const lead = transferCandidateLeads[i];
        const targetKey = targets[i % targets.length];
        if (!lead || !targetKey) continue;
        const resolved = resolveRepTarget(targetKey);
        await updateClient(lead.id, {
          assignedTo: resolved.assignedTo,
          salesName: resolved.salesName,
          salesRep: resolved.salesRep,
          assignedAt: nowIso,
          transferredAt: nowIso,
          assignedBy: currentUser?.name || currentUser?.id || 'System',
          previousAssignedTo: lead.assignedTo || lead.salesName || sourceLabel,
        });
      }
      await addAuditLog(
        'UPDATE',
        'CLIENT',
        transferSourceRep,
        `Transferred ${transferCandidateLeads.length} leads from "${sourceLabel}" (${transferMode === 'single' ? `to ${resolveRepTarget(targets[0] || '').salesName}` : `distributed across ${targets.length} reps`}).`,
        currentUser?.name
      );
      setIsTransferRepOpen(false);
      setTransferSourceRep('');
      setTransferTargetRep('');
      setTransferPoolReps([]);
    } catch (err) {
      console.error('[Leads] Failed to transfer rep leads:', err);
      alert('Failed to complete lead transfer. Please try again.');
    } finally {
      setIsTransferringRep(false);
    }
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
    const headers = ['Lead Code', 'Name', 'Phone', 'Branch', 'Come From', 'Source', 'Stage', 'Interest', 'Category', 'Latest Call', 'Latest Call Date', 'Latest Call By', 'Latest Comment', 'Trial Date', 'Last Contact', 'Next Reminder', 'Assigned To'];
    const csvRows = [
      headers.join(','),
      ...leads.map(l => {
        const assignedUser = getLeadRepLabel(l) || 'Unassigned';
        const callInfo = getLatestCallInfo(l);
        const commentInfo = getLatestCommentInfo(l);
        return [
          `"${l.leadId || l.redgitsId || ''}"`,
          `"${(l.name || '').replace(/"/g, '""')}"`,
          `"${l.phone || ''}"`,
          `"${l.branch || ''}"`,
          `"${l.comeFromType || ''}"`,
          `"${l.source || ''}"`,
          `"${l.stage || ''}"`,
          `"${l.interest || ''}"`,
          `"${l.category || ''}"`,
          `"${(callInfo?.text || '').replace(/"/g, '""')}"`,
          `"${callInfo?.date || ''}"`,
          `"${(callInfo?.author || '').replace(/"/g, '""')}"`,
          `"${(commentInfo?.text || '').replace(/"/g, '""')}"`,
          `"${safeFormatDate(l.trialDate, 'yyyy-MM-dd')}"`,
          `"${safeFormatDate(l.lastContactDate, 'yyyy-MM-dd')}"`,
          `"${safeFormatDate(l.nextReminderDate, 'yyyy-MM-dd')}"`,
          `"${assignedUser.replace(/"/g, '""')}"`
        ].join(',');
      })
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `leads_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
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

  const handleAddLead = async () => {
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
      gender: newLeadGender,
      branch: newLeadBranch || undefined,
      stage: 'New',
      comments: [],
      interactions: [],
      assignedTo: newLeadAssignedTo || (currentUser?.role === 'rep' ? currentUser.id : undefined),
      lastContactDate: new Date().toISOString(),
      nextReminderDate: new Date(Date.now() + 86400000).toISOString(),
      linkedAccount: newLeadLinked || undefined,
    };
    let createdId: string | null = null;
    if (isInzan) {
      try {
        createdId = await addClientWithId(newLead);
      } catch (err) {
        console.error('[Leads] Failed to create lead:', err);
        alert(err instanceof Error ? `Could not save lead: ${err.message}` : 'Could not save lead. Please try again.');
        return;
      }
    } else {
      addClient(newLead);
    }
    setIsNewLeadOpen(false);
    setNewLeadName('');
    setNewLeadPhone('');
    setNewLeadSource('Instagram');
    setNewLeadGender('Male');
    setNewLeadBranch('');
    setNewLeadAssignedTo('');
    setNewLeadLinked(false);
    if (isInzan && createdId) {
      // Open the full account profile so staff can verify the saved details instantly.
      setActiveClientId(createdId);
      setNavTab('clients');
    }
  };

  const availablePackages: Package[] = useMemo(() => {
    return (packages || []).filter((p: Package) => p.is_active !== false && p.isActive !== false);
  }, [packages]);

  const availableCoaches = useMemo(() => {
    const active = (coaches || []).filter((c: Coach) => c.active !== false);
    if (active.length > 0) return active;
    return (users || []).filter(u => u.role === 'coach').map(u => ({
      id: u.id,
      name: u.name,
      active: true
    }));
  }, [coaches, users]);

  const computeEndDate = (startStr: string, expiryDays: number): string => {
    try {
      if (!startStr) return '';
      const d = parseISO(startStr);
      if (isNaN(d.getTime())) return '';
      const end = addDays(d, expiryDays || 30);
      return format(end, 'yyyy-MM-dd');
    } catch {
      return '';
    }
  };

  const openConvertDialog = (lead: Client) => {
    setLeadToConvert(lead);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const activePkgs = availablePackages;
    const defaultBranch = lead.branch || (currentUser?.branch && currentUser.branch !== 'ALL' ? currentUser.branch : (branches[0] || ''));
    const matchedPkg = activePkgs.find((p: Package) => p.branch === defaultBranch || p.branch === 'ALL' || !p.branch) || activePkgs[0] || null;

    const pkgId = matchedPkg ? matchedPkg.id : '';
    setConvertPackageId(pkgId);
    setConvertStartDate(todayStr);
    setConvertEndDate(matchedPkg ? computeEndDate(todayStr, matchedPkg.expiryDays) : computeEndDate(todayStr, 30));
    setConvertBranch(defaultBranch);
    setConvertCoachId('');
    setConvertRecordPayment(true);
    setConvertPaymentMethod('Cash');
    setConvertPaymentAmount(matchedPkg ? String(matchedPkg.price) : '');
    setConvertInstapayRef('');
    setConvertPaymentNotes('');
    setConvertError('');
    setIsSubmittingConvert(false);
    setIsConvertDialogOpen(true);
  };

  const handlePackageSelect = (pkgId: string) => {
    setConvertPackageId(pkgId);
    setConvertError('');
    const pkg = availablePackages.find((p: Package) => p.id === pkgId);
    if (pkg) {
      setConvertEndDate(computeEndDate(convertStartDate, pkg.expiryDays));
      setConvertPaymentAmount(String(pkg.price));
    }
  };

  const handleStartDateSelect = (newStart: string) => {
    setConvertStartDate(newStart);
    const pkg = availablePackages.find((p: Package) => p.id === convertPackageId);
    if (pkg) {
      setConvertEndDate(computeEndDate(newStart, pkg.expiryDays));
    } else {
      setConvertEndDate(computeEndDate(newStart, 30));
    }
  };

  const handleStageChange = (lead: Client, newStage: LeadStage) => {
    if (newStage === 'Converted' || newStage === 'Won') {
      openConvertDialog(lead);
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

  const handleConfirmConvert = async () => {
    if (!leadToConvert) return;

    if (!convertPackageId) {
      setConvertError('Please select a membership package to assign to this member.');
      return;
    }

    const selectedPkg = availablePackages.find((p: Package) => p.id === convertPackageId);
    if (!selectedPkg) {
      setConvertError('Selected package could not be found. Please choose an active package.');
      return;
    }

    if (!convertStartDate) {
      setConvertError('Please select a start date for the membership.');
      return;
    }

    if (!convertEndDate) {
      setConvertError('Please specify an expiry / end date.');
      return;
    }

    setIsSubmittingConvert(true);
    setConvertError('');

    try {
      const startIso = new Date(convertStartDate + 'T00:00:00').toISOString();
      const endIso = new Date(convertEndDate + 'T23:59:59').toISOString();
      const targetBranch = convertBranch || leadToConvert.branch || (currentUser?.branch !== 'ALL' ? currentUser?.branch : branches[0]) || '';

      const selectedCoach = availableCoaches.find((c: any) => c.id === convertCoachId);
      const coachName = selectedCoach?.name || undefined;

      const newClientPkg: ClientPackage = {
        id: 'pkg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        packageName: selectedPkg.name,
        startDate: startIso,
        endDate: endIso,
        sessionsTotal: selectedPkg.sessions,
        sessionsRemaining: selectedPkg.sessions,
        status: 'Active',
        subscriptionType: 'new',
        trainerName: coachName,
        salesRepName: currentUser?.name || undefined,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name || currentUser?.email || 'Staff'
      };

      const finalStage: LeadStage = isInzan ? 'Won' : 'Converted';
      const parsedAmount = parseFloat(convertPaymentAmount) || 0;
      const isPaidInFull = convertRecordPayment && parsedAmount >= selectedPkg.price;

      const clientUpdateData: Partial<Client> = {
        stage: finalStage,
        status: 'Active',
        packageType: selectedPkg.name,
        sessionsRemaining: selectedPkg.sessions,
        startDate: startIso,
        membershipExpiry: endIso,
        branch: targetBranch as Branch,
        packages: [newClientPkg],
        paid: isPaidInFull,
        salesRep: currentUser?.name || leadToConvert.salesRep,
        salesName: currentUser?.name || leadToConvert.salesName,
      };

      if (coachName && convertCoachId) {
        clientUpdateData.staffAssignments = {
          ...(leadToConvert.staffAssignments || {}),
          coach: { staffId: convertCoachId, staffName: coachName }
        };
      }

      await updateClient(leadToConvert.id, clientUpdateData);

      if (convertRecordPayment && parsedAmount > 0) {
        await addPayment({
          clientId: leadToConvert.id,
          amount: parsedAmount,
          date: new Date().toISOString(),
          method: convertPaymentMethod,
          packageType: selectedPkg.name,
          status: 'paid',
          branch: targetBranch as Branch,
          sales_rep_id: currentUser?.id || '',
          salesName: currentUser?.name || '',
          notes: convertPaymentNotes.trim() || `Initial payment upon lead conversion for ${selectedPkg.name}`,
          instapayRef: convertPaymentMethod === 'Instapay' && convertInstapayRef.trim() ? convertInstapayRef.trim() : undefined,
        });
      }

      await addAuditLog(
        'UPDATE',
        'CLIENT',
        leadToConvert.id,
        `Converted lead "${leadToConvert.name}" to Active member with package "${selectedPkg.name}" (${selectedPkg.sessions} sessions, valid until ${convertEndDate}). Initial payment: ${convertRecordPayment ? `${parsedAmount} EGP (${convertPaymentMethod})` : 'Deferred/Pending'}.`,
        currentUser?.name,
        { branch: targetBranch as Branch }
      );

      const convertedName = leadToConvert.name;
      const convertedMemberId = leadToConvert.memberId;

      setIsConvertDialogOpen(false);
      setLeadToConvert(null);
      setConversionSuccessInfo({
        memberName: convertedName,
        packageName: selectedPkg.name,
        memberId: convertedMemberId
      });

    } catch (err: any) {
      console.error('Failed to convert lead:', err);
      setConvertError(err?.message || 'Failed to complete conversion. Please try again.');
    } finally {
      setIsSubmittingConvert(false);
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
    const nextReminder = toValidDate(lead.nextReminderDate);
    if (!nextReminder) return false;
    const now = new Date();
    const threeDaysFromNow = addDays(now, 3);
    
    return isBefore(nextReminder, threeDaysFromNow);
  };

  const openLeadAccount = (lead: Client) => {
    if (isInzan) {
      setActiveClientId(lead.id);
      setNavTab('clients');
    } else {
      setSelectedLead(lead);
      setIsMobileLeadDialogOpen(true);
      loadLeadDetails(lead.id);
    }
  };

  const renderLeadsTable = (leadsData: Client[]) => (
    <div>
      {/* ── Mobile card list (< md) ── */}
      <div className="md:hidden divide-y divide-border">
        {leadsData.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No leads found.</div>
        ) : leadsData.map(lead => {
          const score = calculateLeadScore(lead);
          const reminderD = toValidDate(lead.nextReminderDate);
          const overdue = reminderD && isBefore(reminderD, new Date());
          const dueSoon = !overdue && reminderD && isBefore(reminderD, addDays(new Date(), 3));
          const latestCall = getLatestCallInfo(lead);
          const latestComment = getLatestCommentInfo(lead);
          const repLabel = getLeadRepLabel(lead);
          const recentlyTransferred = isRecentlyTransferred(lead, 24);
          return (
            <div
              key={lead.id}
              className={`flex items-start gap-3 px-4 py-3 ${overdue ? 'bg-red-50/50 dark:bg-red-900/10' : dueSoon ? 'bg-amber-50/50 dark:bg-amber-900/10' : recentlyTransferred ? 'bg-emerald-500/5 border-l-4 border-l-emerald-500' : ''}`}
            >
              <Checkbox
                checked={selectedLeadIds.includes(lead.id)}
                onCheckedChange={(checked) => handleSelectLead(lead.id, !!checked)}
                className="shrink-0 mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => openLeadAccount(lead)}
                    className="font-mono text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                    title="Open Account Details"
                  >
                    Lead #{lead.leadId || lead.redgitsId || '---'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openLeadAccount(lead)}
                    className="font-semibold text-sm truncate hover:text-primary hover:underline cursor-pointer text-left"
                    title="Open Account Details"
                  >
                    {lead.name}
                  </button>
                  {recentlyTransferred && (
                    <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] h-4 px-1.5 font-bold uppercase tracking-wider">
                      ⚡ New Transfer
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{lead.stage || 'New'}</Badge>
                  {score >= 20 ? <Badge className="bg-green-500 text-[10px] h-4 px-1.5">{score}</Badge>
                    : score >= 10 ? <Badge className="bg-yellow-500 text-black text-[10px] h-4 px-1.5">{score}</Badge>
                    : <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{score}</Badge>}
                  {overdue && <Badge variant="destructive" className="text-[10px] h-4 px-1">OVERDUE</Badge>}
                  {dueSoon && <Badge className="bg-amber-500 text-[10px] h-4 px-1">DUE SOON</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentUser?.role === 'rep' && lead.assignedTo !== currentUser.id) return;
                      openClickToCallModal({
                        clientId: lead.id,
                        memberId: lead.memberId,
                        name: lead.name,
                        phone: lead.phone,
                        backupPhone: lead.backupPhone,
                        status: lead.status,
                        branch: lead.branch,
                        packageType: lead.packageType,
                        source: lead.source,
                      });
                    }}
                    className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                    title="Click to Call"
                  >
                    <Phone className="h-3 w-3" />
                    {currentUser?.role === 'rep' && lead.assignedTo !== currentUser.id ? '**********' : lead.phone}
                  </button>
                  {lead.comeFromType && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{lead.comeFromType}</Badge>}
                  {lead.source && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{lead.source}</Badge>}
                  {repLabel && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/30 text-primary">{repLabel}</Badge>}
                </div>
                {(latestCall || latestComment) && (
                  <div className="mt-1.5 rounded-lg bg-muted/50 border border-border/60 px-2.5 py-1.5 text-[11px] space-y-0.5">
                    {latestCall && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[9px] h-4 px-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                          Last Call
                        </Badge>
                        <span className="font-semibold text-foreground">{latestCall.text}</span>
                        {latestCall.date && <span className="text-[10px] text-muted-foreground">• {latestCall.date.slice(0, 16).replace('T', ' ')}</span>}
                        {latestCall.author && <span className="text-[10px] font-medium text-primary">• {latestCall.author}</span>}
                      </div>
                    )}
                    {latestComment && (!latestCall || latestComment.text !== latestCall.text) && (
                      <div className="text-muted-foreground truncate">
                        <span className="font-semibold text-foreground/80">Note:</span> {latestComment.text}
                      </div>
                    )}
                  </div>
                )}
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
              {isInzan && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs font-semibold"
                  onClick={() => { setActiveClientId(lead.id); setNavTab('clients'); }}
                  title="View Account"
                >
                  <User className="h-3.5 w-3.5 mr-1" /> View Account
                </Button>
              )}
              {lead.stage !== 'Won' && lead.stage !== 'Converted' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30"
                  onClick={() => openConvertDialog(lead)}
                  title="Convert to Member with Package"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              )}
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

      {/* ── Tablet (iPad 10") & Desktop Smart Composite Table (≥ md) ── */}
      <div className="hidden md:block overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[42px] pl-3">
              <Checkbox
                checked={paginatedLeads.length > 0 && paginatedLeads.every(l => selectedLeadIds.includes(l.id))}
                onCheckedChange={(checked) => handleSelectAll(!!checked)}
              />
            </TableHead>
            <TableHead>{t('leads.table.name')} & {t('leads.table.phone')}</TableHead>
            <TableHead>{t('leads.stage')} & {t('leads.table.paid_status')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('leads.interest')} & {t('leads.table.category')}</TableHead>
            <TableHead>{t('leads.table.next_reminder')}{canAssignLeads ? ` & ${t('leads.assigned_to')}` : ''}</TableHead>
            <TableHead className="w-[300px] min-w-[240px] max-w-[320px]">Latest Call & Comments</TableHead>
            <TableHead className="text-right pr-4 w-[1%] whitespace-nowrap">{t('leads.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leadsData.map(lead => {
            const latestCall = getLatestCallInfo(lead);
            const latestComment = getLatestCommentInfo(lead);
            const repLabel = getLeadRepLabel(lead);
            const isQuickLogging = quickNoteLeadId === lead.id;
            const recentlyTransferred = isRecentlyTransferred(lead, 24);
            const transferIso = lead.transferredAt || lead.assignedAt;

            return (
            <TableRow key={lead.id} className={
              recentlyTransferred
                ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-l-2 border-l-emerald-500'
                : isReminderDue(lead)
                ? (() => {
                    const d = toValidDate(lead.nextReminderDate);
                    return d && isBefore(d, new Date()) ? 'bg-red-50/50 dark:bg-red-900/10' : 'bg-amber-50/50 dark:bg-amber-900/10';
                  })()
                : ''
            }>
              <TableCell className="pl-3 py-3 align-top">
                <Checkbox
                  checked={selectedLeadIds.includes(lead.id)}
                  onCheckedChange={(checked) => handleSelectLead(lead.id, !!checked)}
                />
              </TableCell>

              {/* Column 2: ID + Name + Score + Phone + Branch + Come From + Source */}
              <TableCell className="py-3 align-top whitespace-normal max-w-[260px]">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => openLeadAccount(lead)}
                      className="font-mono text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                      title="Click to open account details"
                    >
                      Lead #{lead.leadId || lead.redgitsId || '---'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openLeadAccount(lead)}
                      className="font-bold text-sm text-foreground hover:text-primary hover:underline cursor-pointer text-left transition-colors"
                      title="Click to open account details"
                    >
                      {lead.name}
                    </button>
                    {getScoreBadge(calculateLeadScore(lead))}
                    {recentlyTransferred && (
                      <Badge
                        className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[9px] px-1.5 py-0 h-4 font-extrabold uppercase tracking-wider"
                        title={`Transferred ${safeFormatDate(transferIso, 'MMM d, yyyy HH:mm')}${lead.previousAssignedTo ? ` (from ${lead.previousAssignedTo})` : ''}`}
                      >
                        ⚡ New Transfer
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => {
                        if (currentUser?.role === 'rep' && lead.assignedTo !== currentUser.id) return;
                        openClickToCallModal({
                          clientId: lead.id,
                          memberId: lead.memberId,
                          name: lead.name,
                          phone: lead.phone,
                          backupPhone: lead.backupPhone,
                          status: lead.status,
                          branch: lead.branch,
                          packageType: lead.packageType,
                          source: lead.source,
                        });
                      }}
                      className="inline-flex items-center text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer transition-colors"
                      title="Click to Call"
                    >
                      <Phone className="h-3 w-3 mr-1" />
                      {currentUser?.role === 'rep' && lead.assignedTo !== currentUser.id ? '**********' : lead.phone}
                    </button>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{lead.branch || 'Unassigned'}</Badge>
                    {lead.comeFromType && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/5 border-primary/20 text-primary">
                        {lead.comeFromType}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{lead.source || 'Unknown'}</Badge>
                    {lead.createdAt && (
                      <span className="text-[10px] text-muted-foreground/80">
                        • {safeFormatDate(lead.createdAt, 'yyyy-MM-dd')}
                      </span>
                    )}
                    {transferIso && (
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        • Assigned {safeFormatDate(transferIso, 'MMM d, HH:mm')}
                      </span>
                    )}
                  </div>
                </div>
              </TableCell>

              {/* Column 3: Stage + Paid Status */}
              <TableCell className="py-3 align-top">
                <div className="flex flex-col gap-1.5 items-start">
                  <Badge variant="secondary" className="text-xs font-semibold">{lead.stage || 'New'}</Badge>
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      checked={lead.paid || false}
                      onCheckedChange={(checked) => updateClient(lead.id, { paid: !!checked })}
                    />
                    <span className="text-[11px] text-muted-foreground font-medium">{lead.paid ? 'Paid' : 'Not Paid'}</span>
                  </div>
                </div>
              </TableCell>

              {/* Column 4: Interest + Category + Trial Date (lg+) */}
              <TableCell className="hidden lg:table-cell py-3 align-top">
                <div className="flex flex-col gap-1 items-start">
                  <div className="flex flex-wrap items-center gap-1">
                    {getInterestBadge(lead.interest)}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{lead.category || 'None'}</Badge>
                  </div>
                  {(lead.trialDate || lead.expectedVisitDate) && (
                    <div className="flex items-center text-[11px] text-blue-600 dark:text-blue-400">
                      <Calendar className="h-3 w-3 mr-1" />
                      Trial: {safeFormatDate(lead.trialDate || lead.expectedVisitDate, 'MMM d, yyyy')}
                    </div>
                  )}
                </div>
              </TableCell>

              {/* Column 5: Next Reminder + Last Contact + Assigned Rep */}
              <TableCell className="py-3 align-top">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {lead.nextReminderDate ? (
                      <>
                        <span className="text-xs font-semibold">
                          {safeFormatDate(lead.nextReminderDate, 'MMM d, yyyy')}
                        </span>
                        {(() => {
                          const d = toValidDate(lead.nextReminderDate);
                          if (!d) return null;
                          if (isBefore(d, new Date())) return <Badge variant="destructive" className="w-fit text-[9px] h-4 px-1">OVERDUE</Badge>;
                          if (isBefore(d, addDays(new Date(), 3))) return <Badge className="bg-amber-500 hover:bg-amber-600 w-fit text-[9px] h-4 px-1">DUE SOON</Badge>;
                          return null;
                        })()}
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">No reminder</span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      • Last: {safeFormatDate(lead.lastContactDate, 'MMM d', 'Never')}
                    </span>
                  </div>
                  {canAssignLeads ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={lead.assignedTo || (lead.salesName ? `name:${lead.salesName}` : 'unassigned')}
                        onValueChange={(v) => {
                          const resolved = resolveRepTarget(v || 'unassigned');
                          const nowIso = new Date().toISOString();
                          updateClient(lead.id, {
                            assignedTo: resolved.assignedTo,
                            salesName: resolved.salesName || undefined,
                            salesRep: resolved.salesRep || undefined,
                            assignedAt: resolved.assignedTo ? nowIso : undefined,
                            transferredAt: resolved.assignedTo ? nowIso : undefined,
                            assignedBy: currentUser?.name || currentUser?.id || 'System',
                          });
                        }}
                      >
                        <SelectTrigger className="w-[155px] h-7 text-[11px]">
                          <SelectValue placeholder="Assign rep">
                            {repLabel || t('leads.tabs.unassigned')}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">{t('leads.tabs.unassigned')}</SelectItem>
                          {repSummaries.map(rep => (
                            <SelectItem key={rep.value} value={rep.value}>
                              {rep.label} {rep.isLegacyName ? '(RedGITS)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : repLabel ? (
                    <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0 h-5">
                      {repLabel}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>

              {/* Column 6: Latest Call & Comments (Inline while browsing/scrolling) */}
              <TableCell className="py-3 align-top whitespace-normal w-[300px] min-w-[240px] max-w-[320px]" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col gap-1.5 w-full max-w-[300px] overflow-hidden">
                  {latestCall ? (
                    <div className="rounded-lg bg-muted/50 border border-border/70 px-2.5 py-1.5 text-xs space-y-0.5 whitespace-normal break-words">
                      <div className="flex items-start justify-between gap-1.5 flex-wrap">
                        <span className="font-bold text-foreground whitespace-normal break-words leading-snug line-clamp-2" title={latestCall.text}>
                          {latestCall.text}
                        </span>
                        {latestCall.outcome && latestCall.outcome !== latestCall.text && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 border-primary/30 text-primary">
                            {latestCall.outcome}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                        {latestCall.date && (
                          <span className="font-mono">
                            {latestCall.date.length > 16 ? latestCall.date.slice(0, 16).replace('T', ' ') : latestCall.date}
                          </span>
                        )}
                        {latestCall.author && (
                          <span className="font-semibold text-primary">
                            • {latestCall.author}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground italic">No call logged yet</span>
                  )}

                  {latestComment && (!latestCall || latestComment.text !== latestCall.text) && (
                    <div
                      className="rounded-md bg-amber-500/5 border border-amber-500/20 px-2.5 py-1.5 text-[11px] text-foreground/90 whitespace-normal break-words leading-snug line-clamp-2"
                      title={`${latestComment.text}${latestComment.author ? ` (${latestComment.author})` : ''}`}
                    >
                      <span className="font-semibold text-amber-600 dark:text-amber-400 mr-1">Comment:</span>
                      <span className="whitespace-normal break-words">{latestComment.text}</span>
                      {latestComment.author && (
                        <span className="text-[10px] text-muted-foreground ml-1">({latestComment.author})</span>
                      )}
                    </div>
                  )}

                  {isQuickLogging ? (
                    <div className="mt-1 p-2 rounded-lg border border-primary/30 bg-background shadow-sm space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Select value={quickNoteOutcome} onValueChange={(v) => setQuickNoteOutcome(v as InteractionOutcome)}>
                          <SelectTrigger className="h-6 text-[10px] w-[115px] px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Not Answered">NA / No Answer</SelectItem>
                            <SelectItem value="Interested">Interested</SelectItem>
                            <SelectItem value="Scheduled Trial">Trial Set</SelectItem>
                            <SelectItem value="Rejected">Not Interested</SelectItem>
                            <SelectItem value="Other">Other / WP</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={quickNoteText}
                          onChange={(e) => setQuickNoteText(e.target.value)}
                          placeholder="e.g. NA/wp, Busy, Follow up..."
                          className="h-6 text-[11px] px-2 flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleQuickSaveCallNote(lead);
                            } else if (e.key === 'Escape') {
                              setQuickNoteLeadId(null);
                              setQuickNoteText('');
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px]"
                          onClick={() => { setQuickNoteLeadId(null); setQuickNoteText(''); }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-5 px-2.5 text-[10px]"
                          disabled={isSavingQuickNote || !quickNoteText.trim()}
                          onClick={() => handleQuickSaveCallNote(lead)}
                        >
                          {isSavingQuickNote ? 'Saving...' : 'Save Call'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-primary w-fit"
                        onClick={() => {
                          setQuickNoteLeadId(lead.id);
                          setQuickNoteText('');
                          setQuickNoteOutcome('Not Answered');
                        }}
                      >
                        <Plus className="h-2.5 w-2.5 mr-0.5" /> Quick Call / Note
                      </Button>
                    </div>
                  )}
                </div>
              </TableCell>

              {/* Column 7: Actions */}
              <TableCell className="text-right pr-4 pl-3 py-3 align-top whitespace-nowrap w-[1%]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/30"
                    onClick={() => {
                      if (currentUser?.role === 'rep' && lead.assignedTo !== currentUser.id) return;
                      openClickToCallModal({
                        clientId: lead.id,
                        memberId: lead.memberId,
                        name: lead.name,
                        phone: lead.phone,
                        backupPhone: lead.backupPhone,
                        status: lead.status,
                        branch: lead.branch,
                        packageType: lead.packageType,
                        source: lead.source,
                      });
                    }}
                    title="Click to Call"
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-500 hover:bg-green-50 hover:text-green-600"
                    onClick={() => setWhatsAppLead(lead)}
                    title="Send WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  {isInzan && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 gap-1 text-xs font-semibold"
                      onClick={() => { setActiveClientId(lead.id); setNavTab('clients'); }}
                      title="View Account"
                    >
                      <User className="h-3.5 w-3.5" />
                      <span className="hidden xl:inline">Account</span>
                    </Button>
                  )}
                  {lead.stage !== 'Won' && lead.stage !== 'Converted' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-600 hover:text-white font-semibold text-xs shadow-xs"
                      onClick={() => openConvertDialog(lead)}
                      title="Convert Lead to Member with Package"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="hidden xl:inline">Convert</span>
                    </Button>
                  )}
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
                              Lead #{lead.leadId || lead.redgitsId || 'PENDING ID'}
                            </div>
                            <Badge variant="outline" className="rounded-full px-3 py-0.5 border-muted-foreground/30 font-bold text-[10px]">
                              {lead.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {lead.stage !== 'Won' && lead.stage !== 'Converted' && (
                            <Button
                              onClick={() => openConvertDialog(lead)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-2 rounded-xl shadow-md h-10 px-4"
                            >
                              <Sparkles className="h-4 w-4" />
                              Convert to Member
                            </Button>
                          )}
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
                                      {branches.map(b => (
                                        <SelectItem key={b} value={b}>{b}</SelectItem>
                                      ))}
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
                                      {isInzan && <SelectItem value="Contacted">Contacted</SelectItem>}
                                      {isInzan && <SelectItem value="Qualified">Qualified</SelectItem>}
                                      <SelectItem value="Trial">{isInzan ? 'Trial / Visit' : 'Int. & Trial'}</SelectItem>
                                      {isInzan && <SelectItem value="Proposal">Proposal</SelectItem>}
                                      <SelectItem value="Follow Up">Follow Up</SelectItem>
                                      <SelectItem value={isInzan ? 'Won' : 'Converted'}>{isInzan ? 'Won (Convert to Member)' : 'Converted'}</SelectItem>
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
                                  defaultValue={safeFormatDate(lead.trialDate || lead.expectedVisitDate, 'yyyy-MM-dd')}
                                  onChange={(e) => updateClient(lead.id, { trialDate: safeIsoDate(e.target.value), expectedVisitDate: safeIsoDate(e.target.value) })}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8">
                              <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Next Reminder Date</Label>
                                <Input 
                                  type="date" 
                                  className="w-full bg-background/50 border-white/5 rounded-xl h-12"
                                  defaultValue={safeFormatDate(lead.nextReminderDate, 'yyyy-MM-dd')}
                                  onChange={(e) => updateClient(lead.id, { nextReminderDate: safeIsoDate(e.target.value) })}
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
                                  [...activeLeadDetails.interactions].sort((a, b) => (toValidDate(b.date)?.getTime() || 0) - (toValidDate(a.date)?.getTime() || 0)).map(interaction => (
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
                                          {safeFormatDate(interaction.date, 'MMM d, h:mm a')}
                                        </span>
                                      </div>
                                      <p className="text-sm leading-relaxed text-foreground/90 italic">"{interaction.notes}"</p>
                                      <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground/50 border-t border-white/5 pt-2">
                                        <span className="flex items-center gap-1"><User className="h-3 w-3" /> {interaction.author}</span>
                                        {interaction.nextFollowUp && (
                                          <span className="flex items-center gap-1 text-amber-500/80">
                                            <Calendar className="h-3 w-3" /> Follow-up: {safeFormatDate(interaction.nextFollowUp, 'MMM d')}
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
                                      {(() => {
                                        const d = toValidDate(lead.lastContactDate);
                                        return d ? differenceInDays(new Date(), d) : '∞';
                                      })()}
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
                                  [...activeLeadDetails.comments].sort((a, b) => (toValidDate(b.date)?.getTime() || 0) - (toValidDate(a.date)?.getTime() || 0)).map(comment => (
                                    <div key={comment.id} className="bg-background/40 p-4 rounded-2xl text-sm border border-white/5 shadow-sm">
                                      <p className="leading-relaxed text-foreground/90">{comment.text}</p>
                                      <div className="flex justify-between mt-3 text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground/60">
                                        <span className="flex items-center gap-1.5"><User className="h-3 w-3" /> {comment.author}</span>
                                        <span>{safeFormatDate(comment.date, 'MMM d, h:mm a')}</span>
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
                               <QRCodeSVG value={lead.leadId || lead.redgitsId || lead.id} size={250} level="H" includeMargin={true} data-qr-id={lead.leadId || lead.redgitsId || lead.id} />
                               <div className="text-center mt-4 text-black font-extrabold pb-2">Lead #{lead.leadId || lead.redgitsId || 'PENDING ID'}</div>
                             </div>
                             
                             <div className="flex flex-wrap justify-center gap-4">
                               <Button 
                                 onClick={() => downloadQRCode(lead.leadId || lead.redgitsId || lead.id, lead.name)}
                                 className="font-black uppercase tracking-widest px-8 py-6 rounded-2xl shadow-lg border-2 border-primary/20 hover:bg-primary"
                               >
                                 <Download className="mr-3 h-5 w-5" />
                                 Download
                               </Button>
                               <Button 
                                 onClick={() => copyQRCodeToClipboard(lead.leadId || lead.redgitsId || lead.id)}
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
            );
          })}
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
          {canAssignLeads && (
            <Dialog open={isTransferRepOpen} onOpenChange={setIsTransferRepOpen}>
              <DialogTrigger render={<Button variant="outline" size="sm" className="border-primary/40 text-primary hover:bg-primary/10 font-semibold" />}>
                <UserCheck className="mr-2 h-4 w-4" />
                Transfer Rep Leads
              </DialogTrigger>
              <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-primary" />
                    Transfer Sales Rep Portfolio
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Reassign leads when a sales rep leaves the gym or moves to Black-List. Preview latest calls and comments before transferring to one rep or distributing evenly across active reps.
                  </p>
                </DialogHeader>

                <div className="space-y-5 py-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">From Sales Rep (Leaving)</Label>
                      <Select value={transferSourceRep} onValueChange={(v) => setTransferSourceRep(v || '')}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue placeholder="Select departing rep">
                            {transferSourceRep
                              ? (transferSourceRep === 'unassigned'
                                  ? 'Unassigned'
                                  : repSummaries.find(r => r.value === transferSourceRep)?.label || transferSourceRep)
                              : 'Select departing rep'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          <SelectItem value="unassigned">Unassigned Leads</SelectItem>
                          {repSummaries.map(rep => (
                            <SelectItem key={rep.value} value={rep.value}>
                              {rep.label} ({rep.count} leads){rep.isNonWorking ? ' • Left' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stage Filter</Label>
                      <Select value={transferStageFilter} onValueChange={(v) => setTransferStageFilter(v || 'All')}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue placeholder="All Stages" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All Stages</SelectItem>
                          <SelectItem value="New">New</SelectItem>
                          <SelectItem value="Contacted">Contacted</SelectItem>
                          <SelectItem value="Qualified">Qualified</SelectItem>
                          <SelectItem value="Trial">Trial / Visit</SelectItem>
                          <SelectItem value="Proposal">Proposal</SelectItem>
                          <SelectItem value="Follow Up">Follow Up</SelectItem>
                          <SelectItem value="Lost">Lost</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Call History Filter</Label>
                      <Select value={transferCallFilter} onValueChange={(v) => setTransferCallFilter((v as any) || 'all')}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Leads (With or Without Call)</SelectItem>
                          <SelectItem value="has_call">Has Latest Call / Comment</SelectItem>
                          <SelectItem value="no_call">No Call Logged Yet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Preview of leads to be transferred */}
                  {transferSourceRep && (
                    <div className="rounded-2xl border border-border bg-muted/20 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Matching Leads to Transfer: <Badge variant="secondary" className="ml-1">{transferCandidateLeads.length}</Badge>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-primary"
                          onClick={() => {
                            setFilterAssignedTo(transferSourceRep);
                            setActiveTab('all');
                            setIsTransferRepOpen(false);
                          }}
                        >
                          Filter Table by This Rep
                        </Button>
                      </div>
                      {transferCandidateLeads.length > 0 && (
                        <div className="max-h-48 overflow-y-auto divide-y divide-border/60 rounded-xl border bg-background">
                          {transferCandidateLeads.slice(0, 40).map(l => {
                            const call = getLatestCallInfo(l);
                            const comment = getLatestCommentInfo(l);
                            return (
                              <div key={l.id} className="px-3 py-2 text-xs flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <span className="font-mono text-[10px] text-muted-foreground mr-1.5">
                                    #{l.leadId || l.redgitsId || '---'}
                                  </span>
                                  <span className="font-semibold text-foreground">{l.name}</span>
                                  <span className="text-muted-foreground ml-2">{l.phone}</span>
                                </div>
                                <div className="text-right shrink-0 max-w-[260px] truncate">
                                  {call ? (
                                    <span className="text-[11px] font-medium text-primary">
                                      {call.text} {call.date ? `(${call.date.slice(0, 10)})` : ''}
                                    </span>
                                  ) : comment ? (
                                    <span className="text-[11px] text-amber-600">{comment.text}</span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground italic">No call note</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {transferCandidateLeads.length > 40 && (
                            <div className="px-3 py-1.5 text-[11px] text-center text-muted-foreground bg-muted/30">
                              + {transferCandidateLeads.length - 40} more leads will be transferred
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Target Selection */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={transferMode === 'single' ? 'default' : 'outline'}
                        size="sm"
                        className="rounded-xl text-xs"
                        onClick={() => setTransferMode('single')}
                      >
                        Transfer All to One Rep
                      </Button>
                      <Button
                        type="button"
                        variant={transferMode === 'round-robin' ? 'default' : 'outline'}
                        size="sm"
                        className="rounded-xl text-xs"
                        onClick={() => setTransferMode('round-robin')}
                      >
                        Distribute Evenly (Round-Robin)
                      </Button>
                    </div>

                    {transferMode === 'single' ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assign To Target Sales Rep</Label>
                        <Select value={transferTargetRep} onValueChange={(v) => setTransferTargetRep(v || '')}>
                          <SelectTrigger className="h-10 rounded-xl">
                            <SelectValue placeholder="Choose receiving sales rep">
                              {transferTargetRep
                                ? repSummaries.find(r => r.value === transferTargetRep)?.label || transferTargetRep
                                : 'Choose receiving sales rep'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {repSummaries.filter(r => !r.isNonWorking && r.value !== transferSourceRep).map(rep => (
                              <SelectItem key={rep.value} value={rep.value}>
                                {rep.label} ({rep.count} current leads)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Select Active Reps to Split Leads Evenly ({transferPoolReps.length} selected)
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-xl border bg-muted/10">
                          {repSummaries.filter(r => !r.isNonWorking && r.value !== transferSourceRep && r.label !== 'Black-List').map(rep => {
                            const checked = transferPoolReps.includes(rep.value);
                            return (
                              <label key={rep.value} className="flex items-center gap-2 p-2 rounded-lg border bg-background cursor-pointer text-xs">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) => {
                                    if (c) setTransferPoolReps(prev => [...prev, rep.value]);
                                    else setTransferPoolReps(prev => prev.filter(x => x !== rep.value));
                                  }}
                                />
                                <span className="font-semibold flex-1 truncate">{rep.label}</span>
                                <Badge variant="outline" className="text-[10px]">{rep.count}</Badge>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" className="rounded-xl" onClick={() => setIsTransferRepOpen(false)} disabled={isTransferringRep}>
                    Cancel
                  </Button>
                  <Button
                    className="rounded-xl font-bold"
                    disabled={isTransferringRep || transferCandidateLeads.length === 0 || (transferMode === 'single' ? !transferTargetRep : transferPoolReps.length === 0)}
                    onClick={handleExecuteRepTransfer}
                  >
                    {isTransferringRep ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Transferring {transferCandidateLeads.length} Leads...
                      </>
                    ) : (
                      <>
                        <UserCheck className="mr-2 h-4 w-4" />
                        Transfer {transferCandidateLeads.length} Leads Now
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
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
            <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
              <DialogHeader>
                <DialogTitle className="text-xl md:text-2xl font-bold">{t('leads.add_lead')}</DialogTitle>
              </DialogHeader>
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3.5 my-2 text-xs text-muted-foreground flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">How Lead Capture Works:</span> Enter prospect contact details and marketing source. When sales closes an agreement, converting this lead automatically creates their member profile, activates service entitlements, and preserves full sales attribution history without duplicate client records.
                </div>
              </div>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t('leads.table.name')}</Label>
                  <Input id="name" placeholder="Client Name" value={newLeadName} onChange={(e) => setNewLeadName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('leads.table.phone')}</Label>
                  <PhoneInput 
                    id="phone" 
                    value={newLeadPhone} 
                    onChange={(val) => setNewLeadPhone(val)} 
                  />
                  {(() => {
                    if (!isInzan || !newLeadPhone || newLeadPhone.replace(/\D/g, '').length < 7) return null;
                    const simMatches = checkPhoneSimilarityForCandidate(newLeadPhone, clients);
                    if (simMatches.length === 0) return null;
                    return (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1.5">
                        <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>
                            {`RedGITS 7-Digit Phone Similarity Alert (${simMatches.length})`}
                          </span>
                        </div>
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {simMatches.map(({ matchedClient: m, sharedDigits }) => (
                            <div key={m.id} className="flex items-center justify-between bg-background/70 px-2.5 py-1.5 rounded border border-amber-500/20">
                              <span className="font-semibold">{m.name} {m.memberId ? `(#${m.memberId})` : ''}</span>
                              <span className="text-muted-foreground">{m.status} • {maskEgyptianPhone(m.phone, true)} (<code className="font-mono text-amber-600 dark:text-amber-400">{sharedDigits}</code>)</span>
                            </div>
                          ))}
                        </div>
                        {!newLeadLinked && (
                          <p className="text-[11px] text-muted-foreground">
                            Verify this is not a duplicate trial or unpaid debtor account. Check "Linked family account" below if sharing a family phone.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <Label>{t('leads.table.source')}</Label>
                  <Select value={newLeadSource} onValueChange={(v) => setNewLeadSource(v as LeadSource)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Call in">Call in</SelectItem>
                      <SelectItem value="Walk-in">Walk-in</SelectItem>
                      <SelectItem value="Word Of Mouth">Word Of Mouth</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="ADS">ADS</SelectItem>
                      <SelectItem value="Facebook">Facebook</SelectItem>
                      <SelectItem value="Website">Website</SelectItem>
                      <SelectItem value="Google">Google</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={newLeadGender} onValueChange={(v) => setNewLeadGender(v as Gender)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                      <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
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
                      {branches.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
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
                        <SelectValue placeholder="Select assignment">
                          {newLeadAssignedTo
                            ? (newLeadAssignedTo === 'unassigned' ? t('leads.tabs.unassigned') : resolveUserDisplay(newLeadAssignedTo, users, 'Select assignment'))
                            : 'Select assignment'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">{t('leads.tabs.unassigned')}</SelectItem>
                        {users.filter(u => ASSIGNABLE_ROLES.includes(u.role?.toLowerCase() || '') && u.status !== 'nonworking').map(rep => (
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

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">{t('leads.sort_by')}</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'transferred' | 'newest' | 'oldest' | 'score')}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transferred">Recently Transferred / Assigned</SelectItem>
                <SelectItem value="newest">Newest Created First</SelectItem>
                <SelectItem value="oldest">Oldest Created First</SelectItem>
                <SelectItem value="score">Score (High-Low)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Search Name, Phone, ID or Call Note</Label>
            <Input 
              placeholder="Search name, phone, ID, or call note (e.g. NA/wp)..." 
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
                {branches.map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
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
                {isInzan && <SelectItem value="Contacted">Contacted</SelectItem>}
                {isInzan && <SelectItem value="Qualified">Qualified</SelectItem>}
                <SelectItem value="Trial">{isInzan ? 'Trial / Visit' : 'Trial'}</SelectItem>
                {isInzan && <SelectItem value="Proposal">Proposal</SelectItem>}
                <SelectItem value="Follow Up">Follow Up</SelectItem>
                <SelectItem value={isInzan ? 'Won' : 'Converted'}>{isInzan ? 'Won' : 'Converted'}</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
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
                      : repSummaries.find(r => r.value === filterAssignedTo)?.label || users.find(u => u.id === filterAssignedTo)?.name || 'Unknown User'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="All">All Reps</SelectItem>
                <SelectItem value="unassigned">{t('leads.tabs.unassigned')}</SelectItem>
                {repSummaries.map(rep => (
                  <SelectItem key={rep.value} value={rep.value}>
                    {rep.label} ({rep.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={onlyRecentTransfers ? 'default' : 'outline'}
              className={`h-8 text-xs font-bold gap-1.5 ${
                onlyRecentTransfers
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600'
                  : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
              }`}
              onClick={() => {
                setOnlyRecentTransfers(prev => !prev);
                setSortBy('transferred');
                setCurrentPage(1);
              }}
            >
              <span>⚡ Recently Assigned (&lt; 24h)</span>
              <Badge
                variant="secondary"
                className={`text-[10px] px-1.5 py-0 h-4 ${
                  onlyRecentTransfers
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {recentTransfersCount}
              </Badge>
            </Button>
            {onlyRecentTransfers && (
              <span className="text-xs text-muted-foreground">
                Showing only leads assigned or transferred in the last 24 hours.
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            Sorted by: <strong className="text-foreground">{sortBy === 'transferred' ? 'Latest Transfer / Assignment Date' : sortBy === 'newest' ? 'Creation Date (Newest)' : sortBy === 'oldest' ? 'Creation Date (Oldest)' : 'Lead Score'}</strong>
          </span>
        </div>
      </Card>

      {selectedLeadIds.length > 0 && (
        <div className="sticky top-0 z-10 bg-card text-card-foreground border border-primary/30 p-3 rounded-lg shadow-lg flex flex-wrap items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="bg-primary text-primary-foreground font-semibold">
              {selectedLeadIds.length} selected
            </Badge>
            {selectedLeadIds.length < leads.length && (
              <Button
                variant="secondary"
                size="sm"
                className="h-7 text-xs font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
                onClick={handleSelectAllFiltered}
              >
                Select All {leads.length} Matching Leads
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-foreground hover:bg-muted font-medium" onClick={() => setSelectedLeadIds([])}>
              Cancel
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-secondary/80 border border-border px-2 py-1 rounded-md text-foreground">
              <ArrowRight className="h-4 w-4 text-foreground shrink-0" />
              <Select onValueChange={(v: string | null) => v && handleBulkStageUpdate(v as LeadStage)}>
                <SelectTrigger className="h-8 w-[140px] bg-transparent dark:bg-transparent border-none text-foreground font-medium shadow-none [&_span]:!text-foreground [&_svg]:!text-foreground">
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
              <div className="flex items-center gap-2 bg-secondary/80 border border-border px-2 py-1 rounded-md text-foreground">
                <UserCheck className="h-4 w-4 text-foreground shrink-0" />
                <Select onValueChange={(v: string | null) => v && handleBulkAssign(v)}>
                  <SelectTrigger className="h-8 w-[160px] bg-transparent dark:bg-transparent border-none text-foreground font-medium shadow-none [&_span]:!text-foreground [&_svg]:!text-foreground">
                    <SelectValue placeholder="Assign / Transfer To" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {repSummaries.filter(r => !r.isNonWorking).map(rep => (
                      <SelectItem key={rep.value} value={rep.value}>{rep.label}</SelectItem>
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
            <TabsTrigger value="recently_transferred" className="px-4 text-xs sm:text-sm text-emerald-600 font-bold dark:text-emerald-400">
              ⚡ Recently Assigned ({recentTransfersCount})
            </TabsTrigger>
            <TabsTrigger value="referrals" className="px-4 text-xs sm:text-sm text-purple-600 font-bold dark:text-purple-400">
              Referrals ({allLeads.filter(l => String(l.source || '') === 'Referral' || String(l.comeFromType || '') === 'Referral' || Boolean((l as any).referredByClientId) || Boolean((l as any).invitedByClientId) || Boolean(l.referredBy)).length})
            </TabsTrigger>
            <TabsTrigger value="instagram" className="px-4 text-xs sm:text-sm">{t('leads.tabs.instagram')}</TabsTrigger>
            <TabsTrigger value="whatsapp" className="px-4 text-xs sm:text-sm">{t('leads.tabs.whatsapp')}</TabsTrigger>
            <TabsTrigger value="walkin" className="px-4 text-xs sm:text-sm">{t('leads.tabs.walk_in')}</TabsTrigger>
            <TabsTrigger value="tiktok" className="px-4 text-xs sm:text-sm">{t('leads.tabs.tiktok')}</TabsTrigger>
            <TabsTrigger value="other" className="px-4 text-xs sm:text-sm">{t('leads.tabs.other')}</TabsTrigger>
            <TabsTrigger value="trials" className="px-4 text-xs sm:text-sm">{t('leads.tabs.trials')}</TabsTrigger>
            <TabsTrigger value="followup" className="px-4 text-xs sm:text-sm">{t('leads.tabs.follow_up')}</TabsTrigger>
          </TabsList>
        </div>
        
        {activeTab === 'referrals' && (() => {
          const allReferralRecords = clients.filter(
            (c) =>
              String(c.source || '') === 'Referral' ||
              String(c.comeFromType || '') === 'Referral' ||
              Boolean((c as any).referredByClientId) ||
              Boolean((c as any).invitedByClientId) ||
              Boolean(c.referredBy)
          );
          const convertedReferralMembers = allReferralRecords.filter(
            (c) =>
              c.stage === 'Converted' ||
              c.status === 'Active' ||
              Boolean(c.packageType && c.packageType !== 'None') ||
              Boolean(c.packages && c.packages.length > 0)
          );
          const byReferrerMap = new Map<string, { name: string; memberId?: string; total: number; converted: number }>();
          for (const rc of allReferralRecords) {
            const refId = String((rc as any).referredByClientId || (rc as any).invitedByClientId || rc.referredBy || '').trim();
            const hostMember = clients.find(
              (m) => m.id === refId || (m.memberId && m.memberId === refId) || (m.name && m.name.toLowerCase() === refId.toLowerCase())
            );
            const key = hostMember?.id || refId || (rc as any).referredByName || 'Unknown Referrer';
            const displayName = hostMember?.name || (rc as any).referredByName || rc.referredBy || 'Member Referral';
            const entry = byReferrerMap.get(key) || { name: displayName, memberId: hostMember?.memberId, total: 0, converted: 0 };
            entry.total += 1;
            const isConv =
              rc.stage === 'Converted' ||
              rc.status === 'Active' ||
              Boolean(rc.packageType && rc.packageType !== 'None') ||
              Boolean(rc.packages && rc.packages.length > 0);
            if (isConv) entry.converted += 1;
            byReferrerMap.set(key, entry);
          }
          const topReferrers = Array.from(byReferrerMap.values()).sort((a, b) => b.total - a.total);
          const totalRef = allReferralRecords.length;
          const totalConv = convertedReferralMembers.length;
          const convRate = totalRef > 0 ? Math.round((totalConv / totalRef) * 100) : 0;

          return (
            <div className="mb-4 p-4 rounded-2xl border border-purple-500/30 bg-purple-500/5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                    🤝 Member Referrals &amp; Conversion Tracker
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Tracks how many friends were referred by each member and how many became active gym members.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs font-bold bg-background border-purple-500/30 text-purple-600 dark:text-purple-400 px-3 py-1">
                    {totalRef} Total Referred
                  </Badge>
                  <Badge variant="outline" className="text-xs font-bold bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 px-3 py-1">
                    ✅ {totalConv} Became Members ({convRate}%)
                  </Badge>
                  <Badge variant="outline" className="text-xs font-bold bg-amber-500/10 border-amber-500/30 text-amber-600 px-3 py-1">
                    ⏳ {Math.max(0, totalRef - totalConv)} In Lead Pipeline
                  </Badge>
                </div>
              </div>
              {topReferrers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-purple-500/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    By Referring Member:
                  </span>
                  {topReferrers.slice(0, 8).map((r, idx) => (
                    <Badge
                      key={idx}
                      variant="outline"
                      className="text-[11px] font-semibold bg-background/90 border-border px-2.5 py-0.5"
                    >
                      {r.name}{r.memberId ? ` (#${r.memberId})` : ''}:{' '}
                      <strong className="text-purple-600 dark:text-purple-400 ml-1">{r.total} Referred</strong>
                      {' → '}
                      <strong className="text-emerald-600 dark:text-emerald-400">{r.converted} Became Member{r.converted === 1 ? '' : 's'}</strong>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

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

      {/* Enhanced Lead Conversion Dialog */}
      <Dialog open={isConvertDialogOpen} onOpenChange={(open) => {
        if (!isSubmittingConvert) {
          setIsConvertDialogOpen(open);
          if (!open) {
            setLeadToConvert(null);
            setConvertError('');
          }
        }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black">Convert Lead to Member</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Assign membership package, schedule duration, and configure billing for this client.
                </p>
              </div>
            </div>
          </DialogHeader>

          {convertError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{convertError}</span>
            </div>
          )}

          {leadToConvert && (
            <div className="space-y-6 pt-2">
              {/* Lead Summary Strip */}
              <div className="bg-muted/40 p-3.5 rounded-2xl border border-border/50 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Prospect</span>
                  <span className="font-bold text-sm text-foreground">{leadToConvert.name}</span>
                  {(leadToConvert.leadId || leadToConvert.redgitsId) && <span className="ml-1 text-muted-foreground">Lead #{leadToConvert.leadId || leadToConvert.redgitsId}</span>}
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Phone</span>
                  <span className="font-medium text-foreground">{leadToConvert.phone || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Source</span>
                  <Badge variant="outline" className="text-[10px]">{leadToConvert.source || 'Direct'}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Current Branch</span>
                  <Badge variant="secondary" className="text-[10px]">{leadToConvert.branch || 'Unassigned'}</Badge>
                </div>
              </div>

              {/* Step 1: Package Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <PackageIcon className="h-3.5 w-3.5 text-primary" />
                    Select Membership Package <span className="text-red-500">*</span>
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    {availablePackages.length} packages available
                  </span>
                </div>

                {availablePackages.length === 0 ? (
                  <div className="p-4 text-center border border-dashed rounded-xl text-xs text-muted-foreground">
                    No active packages configured. Please configure packages in the Packages tab first.
                  </div>
                ) : (
                  <Select value={convertPackageId} onValueChange={(v: string | null) => v && handlePackageSelect(v)}>
                    <SelectTrigger className="h-12 rounded-xl bg-background/50 border-input">
                      <SelectValue placeholder="Choose a membership or training package" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {availablePackages.map((pkg: Package) => (
                        <SelectItem
                          key={pkg.id}
                          value={pkg.id}
                          label={`${pkg.name} — ${pkg.price} EGP (${pkg.sessions === 9999 || pkg.sessions === -1 ? 'Unlimited' : `${pkg.sessions} ses.`} · ${pkg.expiryDays}d)`}
                        >
                          <div className="flex items-center justify-between w-full gap-4">
                            <span className="font-semibold">{pkg.name}</span>
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-[10px]">{pkg.type || 'Standard'}</Badge>
                              <span className="font-bold text-emerald-600">{pkg.price} EGP</span>
                              <span className="text-muted-foreground">· {pkg.sessions === 9999 || pkg.sessions === -1 ? 'Unlimited' : `${pkg.sessions} ses.`}</span>
                              <span className="text-muted-foreground">· {pkg.expiryDays}d</span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Selected Package Details Pill */}
                {(() => {
                  const selectedPkg = availablePackages.find((p: Package) => p.id === convertPackageId);
                  if (!selectedPkg) return null;
                  return (
                    <div className="p-3.5 bg-primary/5 border border-primary/15 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground text-[10px] block font-medium">Type</span>
                        <span className="font-semibold capitalize text-foreground">{selectedPkg.type || 'Standard'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] block font-medium">Package Price</span>
                        <span className="font-bold text-emerald-600">{selectedPkg.price} EGP</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] block font-medium">Sessions</span>
                        <span className="font-semibold text-foreground">
                          {selectedPkg.sessions === 9999 || selectedPkg.sessions === -1 ? 'Unlimited' : `${selectedPkg.sessions} Sessions`}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] block font-medium">Validity Period</span>
                        <span className="font-semibold text-foreground">{selectedPkg.expiryDays} Days</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Step 2: Dates, Branch, Trainer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    Start Date <span className="text-red-500">*</span>
                  </Label>
                  <Input 
                    type="date"
                    value={convertStartDate}
                    onChange={(e) => handleStartDateSelect(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Expiry / End Date <span className="text-red-500">*</span>
                  </Label>
                  <Input 
                    type="date"
                    value={convertEndDate}
                    onChange={(e) => setConvertEndDate(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    Home Branch
                  </Label>
                  <Select value={convertBranch} onValueChange={(v: string | null) => setConvertBranch(v || '')}>
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue placeholder="Select Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Dumbbell className="h-3.5 w-3.5 text-primary" />
                    Assigned Coach / Trainer (Optional)
                  </Label>
                  <Select value={convertCoachId || 'none'} onValueChange={(v: string | null) => setConvertCoachId(!v || v === 'none' ? '' : v)}>
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue placeholder="Assign Trainer (Optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None / Unassigned</SelectItem>
                      {availableCoaches.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Step 3: Payment Section */}
              <div className="border border-border/70 rounded-2xl p-4 bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Checkbox 
                      id="record-payment-toggle"
                      checked={convertRecordPayment}
                      onCheckedChange={(checked) => setConvertRecordPayment(!!checked)}
                    />
                    <Label htmlFor="record-payment-toggle" className="text-xs font-bold cursor-pointer">
                      Collect & Record Initial Payment Now
                    </Label>
                  </div>
                  <Badge variant={convertRecordPayment ? "default" : "secondary"} className="text-[10px]">
                    {convertRecordPayment ? "Payment Paid" : "Payment Pending"}
                  </Badge>
                </div>

                {convertRecordPayment ? (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-muted-foreground">Payment Method</Label>
                        <Select 
                          value={convertPaymentMethod} 
                          onValueChange={(v: any) => setConvertPaymentMethod(v)}
                        >
                          <SelectTrigger className="h-9 rounded-xl text-xs">
                            <SelectValue placeholder="Payment Method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Cash">Cash</SelectItem>
                            <SelectItem value="Credit Card">Credit Card / Visa</SelectItem>
                            <SelectItem value="Instapay">Instapay</SelectItem>
                            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-muted-foreground">Amount Paid (EGP)</Label>
                        <Input 
                          type="number"
                          value={convertPaymentAmount}
                          onChange={(e) => setConvertPaymentAmount(e.target.value)}
                          placeholder="Amount in EGP"
                          className="h-9 rounded-xl text-xs font-semibold"
                        />
                      </div>
                    </div>

                    {convertPaymentMethod === 'Instapay' && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-muted-foreground">Instapay 12-Digit Reference</Label>
                        <Input 
                          type="text"
                          value={convertInstapayRef}
                          onChange={(e) => setConvertInstapayRef(e.target.value)}
                          placeholder="e.g. 123456789012"
                          maxLength={12}
                          className="h-9 rounded-xl text-xs font-mono"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-muted-foreground">Payment Notes / Receipt Ref (Optional)</Label>
                      <Input 
                        type="text"
                        value={convertPaymentNotes}
                        onChange={(e) => setConvertPaymentNotes(e.target.value)}
                        placeholder="Receipt number or notes..."
                        className="h-9 rounded-xl text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    Member will be created with "Payment Pending / Unpaid" status. Payment can be collected later from the Payments tab.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsConvertDialogOpen(false)}
              disabled={isSubmittingConvert}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmConvert}
              disabled={isSubmittingConvert || !convertPackageId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 rounded-xl"
            >
              {isSubmittingConvert ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm Conversion & Create Member
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversion Success Dialog */}
      {conversionSuccessInfo && (
        <Dialog open={!!conversionSuccessInfo} onOpenChange={() => setConversionSuccessInfo(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <DialogTitle className="text-xl font-bold">Lead Successfully Converted!</DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              <strong>{conversionSuccessInfo.memberName}</strong> has been enrolled as an active member with the <strong>{conversionSuccessInfo.packageName}</strong> package.
            </p>
            <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2 sm:justify-center">
              <Button variant="outline" className="rounded-xl" onClick={() => setConversionSuccessInfo(null)}>
                Stay on Leads
              </Button>
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-xl"
                onClick={() => {
                  setConversionSuccessInfo(null);
                  setNavTab('clients');
                }}
              >
                View in Members Directory
                <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {/* Shared mobile lead dialog */}
      {selectedLead && (
        <Dialog open={isMobileLeadDialogOpen} onOpenChange={(open) => { setIsMobileLeadDialogOpen(open); if (!open) setSelectedLead(null); }}>
          <DialogContent className="!w-full !max-w-[1400px] h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl bg-background/95 backdrop-blur-xl">
            <DialogHeader className="p-4 pb-4 bg-muted/30 border-b shrink-0 flex flex-row items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-extrabold tracking-tight">Lead: <span className="text-primary">{selectedLead.name}</span></DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <div className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-black uppercase border border-primary/20">Lead #{selectedLead.leadId || selectedLead.redgitsId || 'PENDING'}</div>
                  <Badge variant="outline" className="rounded-full text-[10px]">{selectedLead.status}</Badge>
                </div>
              </div>
              {selectedLead.stage !== 'Won' && selectedLead.stage !== 'Converted' && (
                <Button
                  size="sm"
                  onClick={() => {
                    setIsMobileLeadDialogOpen(false);
                    openConvertDialog(selectedLead);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 rounded-xl mr-6"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Convert
                </Button>
              )}
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
                  <Select defaultValue={selectedLead.stage} onValueChange={v => {
                    if (v === 'Won' || v === 'Converted') {
                      setIsMobileLeadDialogOpen(false);
                      openConvertDialog(selectedLead);
                    } else {
                      updateClient(selectedLead.id, { stage: v as LeadStage });
                    }
                  }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(isInzan 
                        ? ['New', 'Contacted', 'Qualified', 'Trial', 'Proposal', 'Follow Up', 'Won', 'Lost'] 
                        : ['New', 'Follow Up', 'Trial', 'Converted', 'Lost']
                      ).map(s => <SelectItem key={s} value={s}>{s === 'Won' ? 'Won (Member)' : s}</SelectItem>)}
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
                      <div className="text-muted-foreground mt-0.5">{safeFormatDate(ia.date, 'MMM d, yyyy')}</div>
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
                      <div className="text-muted-foreground mt-1">{c.author} · {safeFormatDate(c.date, 'MMM d')}</div>
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

