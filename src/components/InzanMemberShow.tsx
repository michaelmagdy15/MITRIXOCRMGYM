import React, { useState, useRef } from 'react';
import { Client, Payment, Attendance, User, Package } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  User as UserIcon, 
  Lock, 
  Unlock, 
  Plus, 
  AlertCircle,
  FileCheck,
  Camera,
  Loader2,
  Phone
} from 'lucide-react';
import { openClickToCallModal } from '../services/clickToCallService';
import { openWhatsAppChat } from '../utils/whatsappTemplates';
import { format } from 'date-fns';
import { safeFormatDate, safeGetAge, toValidDate } from '../utils/dateUtils';
import { Textarea } from '@/components/ui/textarea';
import { db, storage } from '../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, query, where, onSnapshot, addDoc, orderBy, limit, getDocs, doc, updateDoc } from 'firebase/firestore';
import { SalesTransferLog, TrainerTransferLog } from '../types';
import { toast } from 'sonner';
import { MessageSquare, ArrowRightLeft, Heart, Stethoscope, Clock, Palette, ArrowLeft, Gift, Sparkles, ShieldCheck, Edit3, RefreshCw, UserPlus } from 'lucide-react';
import { compressImage } from '../utils/imageUtils';
import EntitlementManager from './EntitlementManager';
import { AdjustPackageDatesDialog, canOverridePackageDates, buildPackageUpdates } from './AdjustPackageDatesDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { addAuditLog } from '../services/auditService';
import { canReassignMemberSalesRep, isSalesManagerUser, isGeneralManagerOrCEO, isFitnessManagerUser } from '../utils/permissions';
import { Trash2, CalendarClock, TrendingUp, Key } from 'lucide-react';
import { MemberGuestInvitationsTab } from './member/MemberGuestInvitationsTab';
import { createMemberReferralWithProfile } from '../services/guestReferralService';
import { MemberDocumentUploader } from './member/MemberDocumentUploader';
import { isFieldLockedForUser, sanitizeMemberProfileUpdates } from '../utils/memberProfileLocking';
import {
  fetchMemberLockerStatus,
  memberClaimLocker,
  memberOpenLocker,
  memberExtendLocker,
  memberReleaseLocker,
  reissueInzanLockerPin,
  sendInzanLockerCommand,
  formatLockerTimeRemaining,
  isHardwareLockerOnline,
  InzanMemberLockerStatus,
} from '../utils/inzanLockerClient';

interface InzanMemberShowProps {
  client: Client;
  onClose: () => void;
  onUpdateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  payments: Payment[];
  attendances: Attendance[];
  users: User[];
  packages: Package[];
  currentUser: User | null;
  setUpgradeDialogClientId: (id: string | null) => void;
  setUpgradePkgName: (name: string) => void;
  setUpgradeStartDate: (date: string) => void;
  setAddPackageDialogClientId?: (id: string | null) => void;
  setRenewDialogClientId?: (id: string | null) => void;
  setRenewPkgName?: (name: string) => void;
  setRenewStartDate?: (date: string) => void;
}

type TabType = 
  | 'member_data'
  | 'package_data'
  | 'financials'
  | 'freezing'
  | 'activities'
  | 'invitations'
  | 'files'
  | 'others'
  | 'comments'
  | 'transfers'
  | 'entitlements';

export function InzanMemberShow({
  client,
  onClose,
  onUpdateClient,
  payments,
  attendances,
  users,
  packages,
  currentUser,
  setUpgradeDialogClientId,
  setUpgradePkgName,
  setUpgradeStartDate,
  setAddPackageDialogClientId,
  setRenewDialogClientId,
  setRenewPkgName,
  setRenewStartDate
}: InzanMemberShowProps) {
  const [activeTab, setActiveTab] = useState<TabType>('member_data');
  const memberReferrals: any[] = Array.isArray((client as any).referrals) ? (client as any).referrals : [];
  const canAdjustDates = canOverridePackageDates(currentUser);
  const [adjustPkgId, setAdjustPkgId] = useState<string | null>(null);
  const [deletePkgId, setDeletePkgId] = useState<string | null>(null);
  const isLeadAccount = (client.status || '').toLowerCase().trim() === 'lead';
  const adjustPkg = adjustPkgId ? (client.packages || []).find(p => p.id === adjustPkgId) ?? null : null;
  const deletePkg = deletePkgId ? (client.packages || []).find(p => p.id === deletePkgId) ?? null : null;
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Client>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Freezing management state
  const [freezePkgId, setFreezePkgId] = useState<string>('');
  const [freezeType, setFreezeType] = useState<'Normal' | 'Back' | 'Medical'>('Normal');
  const [freezeStartDate, setFreezeStartDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [freezeEndDate, setFreezeEndDate] = useState<string>('');
  const [freezeReason, setFreezeReason] = useState<string>('');
  const [isApplyingFreeze, setIsApplyingFreeze] = useState<boolean>(false);

  // Quick Guest Invite state on Overview
  const [showQuickInviteForm, setShowQuickInviteForm] = useState(false);
  const [quickGuestName, setQuickGuestName] = useState('');
  const [quickGuestPhone, setQuickGuestPhone] = useState('');
  const [isSubmittingQuickInvite, setIsSubmittingQuickInvite] = useState(false);

  // Unlimited Referrals state (Overview quick-action)
  const [showAddReferralForm, setShowAddReferralForm] = useState(false);
  const [referralName, setReferralName] = useState('');
  const [referralPhone, setReferralPhone] = useState('');
  const [referralNotes, setReferralNotes] = useState('');
  const [isSubmittingReferral, setIsSubmittingReferral] = useState(false);

  const handleSendQuickGuestInvite = async () => {
    if (!quickGuestName.trim() || !quickGuestPhone.trim()) {
      toast.error('Please enter guest name and phone number.');
      return;
    }
    const invRem = Number(client.guestInvitesRemaining ?? (client as any).invitationsRemaining ?? 0);
    if (invRem <= 0) {
      toast.error('Member has 0 guest invitation passes remaining.');
      return;
    }
    setIsSubmittingQuickInvite(true);
    try {
      const nowIso = new Date().toISOString();
      const code = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
      const newUsed = Number((client as any).invitationsUsed || 0) + 1;
      const newRem = Math.max(0, invRem - 1);

      await addDoc(collection(db, 'guestInvites'), {
        hostClientId: client.id,
        hostId: client.id,
        hostMemberId: client.memberId || client.legacyMemberId || '',
        hostName: client.name || '',
        guestName: quickGuestName.trim(),
        guestPhone: quickGuestPhone.trim(),
        inviteCode: code,
        status: 'Pending',
        visitDate: nowIso.slice(0, 10),
        attendanceDate: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        source: 'front_desk_overview',
      });

      await onUpdateClient(client.id, {
        guestInvitesRemaining: newRem,
        invitationsRemaining: newRem,
        invitationsUsed: newUsed,
      } as any);

      toast.success(`Guest invitation pass (${code}) issued for ${quickGuestName.trim()}! (1 pass deducted, ${newRem} remaining)`);
      setQuickGuestName('');
      setQuickGuestPhone('');
      setShowQuickInviteForm(false);
    } catch (err: any) {
      console.error('Failed to issue quick guest invite:', err);
      toast.error(err?.message || 'Failed to issue guest invitation.');
    } finally {
      setIsSubmittingQuickInvite(false);
    }
  };

  // Per-Package Same-Day Edit & Transfer state
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);
  const [pkgSearchFilter, setPkgSearchFilter] = useState('');
  const [editPkgForm, setEditPkgForm] = useState<{ packageName: string; startDate: string; endDate: string; sessionsRemaining: string }>({
    packageName: '',
    startDate: '',
    endDate: '',
    sessionsRemaining: '',
  });
  const [transferPkgId, setTransferPkgId] = useState<string | null>(null);
  const [transferTargetQuery, setTransferTargetQuery] = useState('');
  const [isTransferringPkg, setIsTransferringPkg] = useState(false);

  // Instant Member Feedback state (editable by any staff member on Overview)
  const [quickFeedbackText, setQuickFeedbackText] = useState<string>(
    (client as any).frontDeskNote || client.legacyNotes || ''
  );
  const [newFeedbackEntry, setNewFeedbackEntry] = useState('');
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  // Smart Locker Hardware Control state
  const [lockerStatus, setLockerStatus] = useState<InzanMemberLockerStatus | null>(null);
  const [isLoadingLocker, setIsLoadingLocker] = useState<boolean>(false);
  const [isOperatingLocker, setIsOperatingLocker] = useState<boolean>(false);
  const [issuedPinOverride, setIssuedPinOverride] = useState<string | null>(null);
  const [lockerError, setLockerError] = useState<string | null>(null);

  const loadMemberLockerStatus = React.useCallback(async (silent = false) => {
    if (!client?.id) return;
    if (!silent) setIsLoadingLocker(true);
    setLockerError(null);
    try {
      const res = await fetchMemberLockerStatus(client.id);
      setLockerStatus(res);
      if (res.pin) {
        setIssuedPinOverride(res.pin);
      }
    } catch (err: any) {
      console.error('Failed to fetch member locker status:', err);
      setLockerError(err?.message || 'Unable to reach Smart Locker server.');
    } finally {
      if (!silent) setIsLoadingLocker(false);
    }
  }, [client.id, activeTab]);

  React.useEffect(() => {
    setIssuedPinOverride(null);
    loadMemberLockerStatus();
  }, [client.id, loadMemberLockerStatus]);

  const handleFrontDeskOpenLocker = async () => {
    const assigned = lockerStatus?.assignedLocker;
    if (!assigned) return;
    setIsOperatingLocker(true);
    try {
      try {
        await memberOpenLocker({ clientId: client.id, lockerId: assigned.id });
      } catch {
        await sendInzanLockerCommand(assigned.id, 'openlock');
      }
      toast.success(`Pulse relay sent — Locker ${assigned.name} opened!`);
    } catch (err: any) {
      console.error('Failed to open locker:', err);
      toast.error(err?.message || `Failed to open Locker ${assigned.name}.`);
    } finally {
      setIsOperatingLocker(false);
    }
  };

  const handleFrontDeskReissuePin = async () => {
    const assigned = lockerStatus?.assignedLocker;
    if (!assigned) return;
    setIsOperatingLocker(true);
    try {
      const res = await reissueInzanLockerPin(assigned.id);
      if (res.pin) {
        setIssuedPinOverride(res.pin);
        toast.success(`New 6-digit PIN issued for Locker ${assigned.name}: ${res.pin}`);
      } else {
        toast.success(`PIN re-issued for Locker ${assigned.name}.`);
      }
      await loadMemberLockerStatus(true);
    } catch (err: any) {
      console.error('Failed to reissue PIN:', err);
      toast.error(err?.message || 'Failed to reissue locker PIN.');
    } finally {
      setIsOperatingLocker(false);
    }
  };

  const handleFrontDeskExtendLocker = async () => {
    const assigned = lockerStatus?.assignedLocker;
    if (!assigned) return;
    setIsOperatingLocker(true);
    try {
      const res = await memberExtendLocker({
        clientId: client.id,
        lockerId: assigned.id,
        userId: lockerStatus?.occupant?.id,
      });
      toast.success(`Locker ${assigned.name} extended (+3h)! New expiry: ${safeFormatDate(res.expires_at, 'HH:mm')}`);
      await loadMemberLockerStatus(true);
    } catch (err: any) {
      console.error('Failed to extend locker:', err);
      toast.error(err?.message || 'Failed to extend locker session.');
    } finally {
      setIsOperatingLocker(false);
    }
  };

  const handleFrontDeskReleaseLocker = async () => {
    const assigned = lockerStatus?.assignedLocker;
    if (!assigned) return;
    setIsOperatingLocker(true);
    try {
      await memberReleaseLocker({
        clientId: client.id,
        lockerId: assigned.id,
      });
      setIssuedPinOverride(null);
      toast.success(`Locker ${assigned.name} released and unassigned from ${client.name}.`);
      await loadMemberLockerStatus(true);
    } catch (err: any) {
      console.error('Failed to release locker:', err);
      toast.error(err?.message || 'Failed to release locker.');
    } finally {
      setIsOperatingLocker(false);
    }
  };

  const handleFrontDeskClaimLocker = async (groupId?: number, genderHint?: string) => {
    setIsOperatingLocker(true);
    try {
      const res = await memberClaimLocker({
        clientId: client.id,
        clientName: client.name,
        gender: genderHint || client.gender,
        groupId,
        phone: client.phone,
        email: client.email,
      });
      if (res.pin) {
        setIssuedPinOverride(res.pin);
      }
      toast.success(
        `Assigned Locker ${res.locker.name} to ${client.name}${res.pin ? ` (PIN: ${res.pin})` : ''}!`
      );
      await loadMemberLockerStatus(true);
    } catch (err: any) {
      console.error('Failed to assign smart locker:', err);
      toast.error(err?.message || 'Failed to assign smart locker.');
    } finally {
      setIsOperatingLocker(false);
    }
  };

  React.useEffect(() => {
    setQuickFeedbackText((client as any).frontDeskNote || client.legacyNotes || '');
  }, [client.id, (client as any).frontDeskNote, client.legacyNotes]);

  const isSecondaryPackageItem = (pkg: any): boolean => {
    if (!pkg) return false;
    if (pkg.hierarchyType === 'Secondary' || pkg.hierarchy === 'Secondary') return true;
    const catMatch = packages.find(
      cp => (cp.name || '').trim().toLowerCase() === String(pkg.packageName || pkg.name || '').trim().toLowerCase() || cp.id === pkg.packageId
    ) as any;
    if (catMatch?.hierarchyType === 'Secondary' || catMatch?.hierarchy === 'Secondary') return true;
    return /\bpt\b|private\s*train|personal\s*train|group\s*pt|semi\s*private|nutrition|physiotherapy|massage|assessment|recovery/i.test(
      `${pkg.category || catMatch?.category || ''} ${pkg.packageName || pkg.name || ''}`
    );
  };

  const getDaysRemainingToRenew = (endDateStr?: string | null): number => {
    if (!endDateStr) return Number((client as any).daysRemaining || 0);
    const endDt = toValidDate(endDateStr);
    if (!endDt) return Number((client as any).daysRemaining || 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const endStart = new Date(endDt);
    endStart.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((endStart.getTime() - todayStart.getTime()) / 86400000));
  };

  const handleSaveMemberFeedback = async () => {
    setIsSavingFeedback(true);
    try {
      const nowIso = new Date().toISOString();
      const authorName = currentUser?.name || currentUser?.email || 'Staff';
      const updates: Record<string, any> = {
        frontDeskNote: quickFeedbackText.trim(),
        legacyNotes: quickFeedbackText.trim(),
        lastFeedbackBy: authorName,
        lastFeedbackAt: nowIso,
      };
      if (newFeedbackEntry.trim()) {
        updates.comments = [
          ...(client.comments || []),
          {
            id: `fb_${Date.now()}`,
            text: `[Member Feedback] ${newFeedbackEntry.trim()}`,
            date: nowIso,
            author: authorName,
          },
        ];
      }
      await onUpdateClient(client.id, updates as Partial<Client>);
      setNewFeedbackEntry('');
      toast.success('Member feedback saved & logged.');
    } catch (err) {
      console.error('Failed to save member feedback:', err);
      toast.error('Failed to save member feedback.');
    } finally {
      setIsSavingFeedback(false);
    }
  };

  const resolvePackageBenefits = (pkg: any) => {
    const pkgNameNorm = String(pkg?.packageName || pkg?.name || client.packageType || '').trim().toLowerCase();
    const catalogMatch = packages.find(
      cp => (cp.name || '').trim().toLowerCase() === pkgNameNorm || cp.id === pkg?.packageId
    ) as any;
    const rawClient = client as any;
    const pb = pkg?.benefits || {};
    const cb = rawClient.benefits || {};
    const catB = catalogMatch?.benefits || {};

    let freezeTotal = Number(pb.freezeAllowanceDays ?? pkg?.freezeAllowanceDays ?? catB.freezeAllowanceDays ?? catalogMatch?.freezeAllowanceDays ?? cb.freezeAllowanceDays ?? rawClient.freezeAllowanceDays ?? 0);
    const freezeUsed = Number(pb.freezeDaysUsed ?? pkg?.freezeDaysUsed ?? cb.freezeDaysUsed ?? rawClient.freezeDaysUsed ?? 0);
    let invTotal = Number(pb.guestInvitations ?? pkg?.guestInvitations ?? catB.guestInvitations ?? catalogMatch?.guestInvitations ?? cb.guestInvitations ?? rawClient.guestInvitations ?? 0);
    const invUsed = Number(pb.invitationsUsed ?? pkg?.invitationsUsed ?? cb.invitationsUsed ?? rawClient.invitationsUsed ?? 0);
    let freePtTotal = Number(pb.freePtSessions ?? pkg?.freePtSessions ?? catB.freePtSessions ?? catalogMatch?.freePtSessions ?? cb.freePtSessions ?? rawClient.freePtSessions ?? rawClient.freePtSessionsTotal ?? 0);
    const freePtUsed = Number(pb.freePtSessionsUsed ?? pkg?.freePtSessionsUsed ?? cb.freePtSessionsUsed ?? rawClient.freePtSessionsUsed ?? 0);
    let classTotal = Number(pb.freeClassTrials ?? pkg?.freeClassTrials ?? catB.freeClassTrials ?? catalogMatch?.freeClassTrials ?? cb.freeClassTrials ?? rawClient.freeClassTrials ?? rawClient.freeClassTrialsTotal ?? 0);
    const classUsed = Number(pb.classTrialsUsed ?? pkg?.classTrialsUsed ?? pkg?.freeClassTrialsUsed ?? cb.classTrialsUsed ?? rawClient.freeClassTrialsUsed ?? 0);

    // Redgits / DB zero-benefit fallback:
    if (freezeTotal === 0 && invTotal === 0 && freePtTotal === 0) {
      const s = `${pkgNameNorm} ${catalogMatch?.name || ''} ${pkg?.expiryDays || catalogMatch?.expiryDays || ''}`.toLowerCase();
      if (s.includes('12') || s.includes('year') || s.includes('annual') || s.includes('365')) {
        freezeTotal = 30; invTotal = 10; freePtTotal = 2; classTotal = 2;
      } else if (s.includes('6') || s.includes('half') || s.includes('180')) {
        freezeTotal = 15; invTotal = 5; freePtTotal = 1; classTotal = 1;
      } else if (s.includes('3') || s.includes('quarter') || s.includes('90')) {
        freezeTotal = 7; invTotal = 2; freePtTotal = 1; classTotal = 0;
      } else if (s.includes('1') || s.includes('month') || s.includes('30')) {
        freezeTotal = 0; invTotal = 1; freePtTotal = 0; classTotal = 0;
      }
    }

    return {
      freezeTotal,
      freezeUsed,
      freezeRem: Math.max(0, freezeTotal - freezeUsed),
      invTotal,
      invUsed,
      invRem: Math.max(0, invTotal - invUsed),
      freePtTotal,
      freePtUsed,
      freePtRem: Math.max(0, freePtTotal - freePtUsed),
      classTotal,
      classUsed,
      classRem: Math.max(0, classTotal - classUsed),
    };
  };

  const getSameDayEditState = (pkg: any) => {
    const createdRaw = pkg?.createdAt || client.createdAt;
    const createdDate = toValidDate(createdRaw);
    const nowMs = Date.now();
    const ageHours = createdDate ? (nowMs - createdDate.getTime()) / (1000 * 60 * 60) : 999;
    const isWithin24h = ageHours >= 0 && ageHours <= 24;
    const isFinanceConfirmed = Boolean(pkg?.financeConfirmed);
    const canSameDayEdit = isWithin24h && !isFinanceConfirmed;
    const hoursLeft = isWithin24h ? Math.max(1, Math.ceil(24 - ageHours)) : 0;
    return {
      isWithin24h,
      isFinanceConfirmed,
      canSameDayEdit,
      hoursLeft,
    };
  };

  const handleAddUnlimitedReferral = async () => {
    if (!referralName.trim() || !referralPhone.trim()) {
      toast.error('Please enter both Referral Name and Phone Number.');
      return;
    }
    setIsSubmittingReferral(true);
    try {
      const { referralEntry } = await createMemberReferralWithProfile({
        hostClient: client,
        referralName: referralName.trim(),
        referralPhone: referralPhone.trim(),
        referralNotes: referralNotes.trim(),
        createdBy: currentUser?.name || 'Staff',
      });
      const existingRefs = Array.isArray((client as any).referrals) ? (client as any).referrals : [];
      await onUpdateClient(client.id, {
        referrals: [referralEntry, ...existingRefs],
      } as any);
      setReferralName('');
      setReferralPhone('');
      setReferralNotes('');
      setShowAddReferralForm(false);
      toast.success(`Referral "${referralEntry.name}" added & Lead profile created in Leads (0 guest quota used)!`);
    } catch (err: any) {
      console.error('Failed to add referral:', err);
      toast.error(err?.message || 'Failed to save referral.');
    } finally {
      setIsSubmittingReferral(false);
    }
  };

  const handleApplyPackageFreeze = async (targetPkgId?: string) => {
    const pkgIdToFreeze = targetPkgId || freezePkgId;
    if (!pkgIdToFreeze) {
      toast.error('Please select a package to freeze.');
      return;
    }
    if (!freezeStartDate || !freezeEndDate) {
      toast.error('Please select freeze start and end dates.');
      return;
    }
    const reqDays = Math.round((new Date(freezeEndDate).getTime() - new Date(freezeStartDate).getTime()) / 86400000);
    if (reqDays <= 0) {
      toast.error('Freeze end date must be after freeze start date.');
      return;
    }

    const currentPkgs = Array.isArray(client.packages) ? [...client.packages] : [];
    const idx = currentPkgs.findIndex(p => p.id === pkgIdToFreeze);
    if (idx === -1 || !currentPkgs[idx]) {
      toast.error('Selected package not found.');
      return;
    }
    const p = currentPkgs[idx]!;

    setIsApplyingFreeze(true);
    try {
      const curUsed = Number(p.freezeDaysUsed || 0);
      const newUsed = curUsed + reqDays;

      let newEndIso = p.endDate;
      if (p.endDate) {
        const curEnd = new Date(p.endDate);
        curEnd.setDate(curEnd.getDate() + reqDays);
        newEndIso = curEnd.toISOString();
      }

      const isEndedInPast = new Date(freezeEndDate).getTime() <= Date.now();
      const shouldStayActive = freezeType === 'Back' && isEndedInPast;
      const reasonWithTag = `[${freezeType} Freeze] ${freezeReason || 'Member requested freeze'}`;

      currentPkgs[idx] = {
        ...p,
        status: shouldStayActive ? 'Active' : 'Hold',
        isOnHold: !shouldStayActive,
        holdReason: reasonWithTag,
        holdDate: new Date().toISOString(),
        freezeDaysUsed: freezeType === 'Medical' ? curUsed : newUsed,
        endDate: newEndIso,
      };

      const nowIso = new Date().toISOString();
      const newLog = {
        packageId: pkgIdToFreeze,
        packageName: p.packageName,
        freezeType,
        startDate: freezeStartDate,
        endDate: freezeEndDate,
        days: reqDays,
        reason: reasonWithTag,
        appliedBy: currentUser?.name || 'Staff',
        appliedAt: nowIso,
      };

      const existingLogs = Array.isArray((client as any).freezeLogs) ? (client as any).freezeLogs : [];
      const curClientUsed = freezeType === 'Medical' ? Number((client as any).freezeDaysUsed || 0) : Number((client as any).freezeDaysUsed || 0) + reqDays;
      const curClientRem = freezeType === 'Medical'
        ? Number((client as any).freezeDaysRemaining ?? (client as any).freezeAllowanceDays ?? 30)
        : Math.max(0, Number((client as any).freezeDaysRemaining ?? (client as any).freezeAllowanceDays ?? 30) - reqDays);

      await onUpdateClient(client.id, {
        status: shouldStayActive ? 'Active' : 'Hold',
        packages: currentPkgs,
        freezeDaysUsed: curClientUsed,
        freezeDaysRemaining: curClientRem,
        freezeLogs: [newLog, ...existingLogs],
      } as any);

      await addAuditLog('UPDATE', 'PACKAGE_RECORD', client.id, `Applied ${freezeType} Freeze on package "${p.packageName}" for ${reqDays} days (${freezeStartDate} to ${freezeEndDate}).`);
      toast.success(`${freezeType} Freeze applied to "${p.packageName}" for ${reqDays} days! Expiry extended.`);
      setFreezeReason('');
      setFreezeEndDate('');
      setFreezePkgId('');
    } catch (err: any) {
      console.error('Failed to freeze package:', err);
      toast.error(err?.message || 'Failed to apply package freeze.');
    } finally {
      setIsApplyingFreeze(false);
    }
  };

  const handleUnfreezePackageDirect = async (pkgId: string) => {
    const currentPkgs = Array.isArray(client.packages) ? [...client.packages] : [];
    const idx = currentPkgs.findIndex(p => p.id === pkgId);
    if (idx === -1 || !currentPkgs[idx]) return;
    const p = currentPkgs[idx]!;

    try {
      currentPkgs[idx] = {
        ...p,
        status: 'Active',
        isOnHold: false,
        holdReason: '',
        holdDate: '',
      };

      const stillHasFrozen = currentPkgs.some(pkg => pkg.status === 'Hold' || (pkg as any).isOnHold);

      await onUpdateClient(client.id, {
        status: stillHasFrozen ? 'Hold' : 'Active',
        packages: currentPkgs,
      } as any);

      await addAuditLog('UPDATE', 'PACKAGE_RECORD', client.id, `Unfroze package "${p.packageName}". Status restored to Active.`);
      toast.success(`Package "${p.packageName}" unfrozen and restored to Active!`);
    } catch (err: any) {
      console.error('Failed to unfreeze package:', err);
      toast.error(err?.message || 'Failed to unfreeze package.');
    }
  };

  const handleSaveSameDayPkgEdit = async (pkgId: string) => {
    const targetPkg = (client.packages || []).find(p => p.id === pkgId);
    const editCheck = getSameDayEditState(targetPkg || {});
    if (!editCheck.canSameDayEdit) {
      toast.error('Package is locked (>24 hours since creation or confirmed by Accounting).');
      setEditingPkgId(null);
      return;
    }

    const nowIso = new Date().toISOString();
    const editorName = currentUser?.name || currentUser?.email || 'Staff';
    const currentList = Array.isArray(client.packages) && client.packages.length > 0
      ? [...client.packages]
      : [{
          id: pkgId,
          packageId: '',
          packageName: client.packageType || 'Membership Package',
          startDate: (client as any).joinDate || client.startDate || nowIso.slice(0, 10),
          endDate: (client as any).expiryDate || client.membershipExpiry || nowIso.slice(0, 10),
          sessionsTotal: ((client as any).totalSessions || 0) || 'unlimited',
          sessionsRemaining: client.sessionsRemaining ?? 'unlimited',
          status: (client.status === 'Active' ? 'Active' : 'Expired') as any,
          createdAt: client.createdAt || nowIso,
          createdBy: editorName,
          createdByName: editorName,
        }];

    const updated = currentList.map(p => {
      if (p.id !== pkgId) return p;
      const parsedRem = editPkgForm.sessionsRemaining === 'unlimited' || editPkgForm.sessionsRemaining === ''
        ? p.sessionsRemaining
        : Number(editPkgForm.sessionsRemaining);
      return {
        ...p,
        packageName: editPkgForm.packageName || p.packageName,
        startDate: editPkgForm.startDate || p.startDate,
        endDate: editPkgForm.endDate || p.endDate,
        sessionsRemaining: parsedRem as any,
        updatedAt: nowIso,
        lastModifiedAt: nowIso,
        lastModifiedBy: editorName,
      };
    });

    await onUpdateClient(client.id, buildPackageUpdates(updated as any) as Partial<Client>);
    await addAuditLog(
      'UPDATE',
      'PACKAGE_RECORD',
      client.id,
      `Same-day (<24h) package edit by ${editorName} on "${editPkgForm.packageName}" for ${client.name}`,
      editorName
    );
    setEditingPkgId(null);
    setPkgSearchFilter('');
    toast.success(`Package updated within 24h window (logged by ${editorName}).`);
  };

  const handleToggleFinanceConfirmPkg = async (pkgId: string, confirmState: boolean) => {
    const currentList = Array.isArray(client.packages) ? [...client.packages] : [];
    const updated = currentList.map(p => p.id === pkgId ? {
      ...p,
      financeConfirmed: confirmState,
      financeConfirmedAt: confirmState ? new Date().toISOString() : null,
      financeConfirmedBy: confirmState ? (currentUser?.name || 'Finance') : null,
    } : p);
    await onUpdateClient(client.id, { packages: updated as any });
    toast.success(confirmState ? 'Package confirmed by Accounting — same-day edits are now locked.' : 'Accounting lock removed.');
  };

  const handleExecutePackageTransfer = async (pkgId: string) => {
    if (!transferTargetQuery.trim()) {
      toast.error('Enter recipient Member ID, Phone, or Name.');
      return;
    }
    setIsTransferringPkg(true);
    try {
      const qTerm = transferTargetQuery.trim().toLowerCase().replace(/^#/, '');
      const snap = await getDocs(collection(db, 'clients'));
      const allClients = snap.docs.map(d => ({ ...d.data(), id: d.id } as Client));
      const targetClient = allClients.find(c =>
        c.id !== client.id && (
          String(c.memberId || '').toLowerCase() === qTerm ||
          String(c.id).toLowerCase() === qTerm ||
          (c.phone != null && String(c.phone).replace(/\D/g, '').includes(qTerm.replace(/\D/g, '')) && qTerm.replace(/\D/g, '').length >= 6) ||
          (c.name != null && String(c.name).toLowerCase() === qTerm)
        )
      );
      if (!targetClient) {
        toast.error(`No matching recipient member found for "${transferTargetQuery}". Try their exact Member ID or Phone.`);
        setIsTransferringPkg(false);
        return;
      }

      const sourcePackages = Array.isArray(client.packages) ? [...client.packages] : [];
      const pkgToMove = sourcePackages.find(p => p.id === pkgId);
      if (!pkgToMove) {
        toast.error('Package not found on source member.');
        setIsTransferringPkg(false);
        return;
      }

      const nowIso = new Date().toISOString();
      const remainingSourcePackages = sourcePackages.filter(p => p.id !== pkgId);
      const targetPackages = Array.isArray(targetClient.packages) ? [...targetClient.packages] : [];
      const transferredPkg = {
        ...pkgToMove,
        transferredFromClientId: client.id,
        transferredFromName: client.name,
        transferredAt: nowIso,
        transferredBy: currentUser?.name || 'Staff',
      };

      await onUpdateClient(client.id, buildPackageUpdates(remainingSourcePackages as any) as Partial<Client>);
      await updateDoc(doc(db, 'clients', targetClient.id), {
        ...buildPackageUpdates([transferredPkg as any, ...targetPackages]),
        updatedAt: nowIso,
      });

      await addAuditLog(
        'UPDATE',
        'PACKAGE_RECORD',
        client.id,
        `Transferred package "${pkgToMove.packageName}" from ${client.name} to ${targetClient.name} (#${targetClient.memberId || targetClient.id})`,
        currentUser?.name
      );

      setTransferPkgId(null);
      setTransferTargetQuery('');
      toast.success(`Transferred "${pkgToMove.packageName}" to ${targetClient.name} (#${targetClient.memberId || targetClient.id})!`);
    } catch (err) {
      console.error('Error transferring package:', err);
      toast.error('Failed to transfer package.');
    } finally {
      setIsTransferringPkg(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadStatus, setPhotoUploadStatus] = useState<string | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }

    setIsUploadingPhoto(true);
    setPhotoUploadStatus('Compressing...');
    try {
      const compressed = await compressImage(file);
      setPhotoUploadStatus('Uploading...');
      const fileRef = storageRef(storage, `member_photos/${client.id}`);
      await uploadBytes(fileRef, compressed, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(fileRef);
      
      await onUpdateClient(client.id, { photoURL: url });
      
      if (isEditing) {
        setFormData(prev => ({ ...prev, photoURL: url }));
      }
      
      toast.success('Member photo updated successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to upload member photo.');
    } finally {
      setIsUploadingPhoto(false);
      setPhotoUploadStatus(null);
    }
  };

  // Premium features state
  const [newComment, setNewComment] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [salesTransfers, setSalesTransfers] = useState<SalesTransferLog[]>([]);
  const [trainerTransfers, setTrainerTransfers] = useState<TrainerTransferLog[]>([]);
  const [subcolAttendances, setSubcolAttendances] = useState<any[]>([]);

  // Fetch attendance_history subcollection (includes all 84,000+ RedGITS historical & live check-ins)
  React.useEffect(() => {
    if (!client?.id) return;
    const qAtt = query(collection(db, 'clients', client.id, 'attendance_history'), limit(250));
    const unsubAtt = onSnapshot(qAtt, snap => {
      setSubcolAttendances(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          clientId: client.id,
          date: data.checkedInAt || data.date || '',
          checkOutTime: data.checkOutTime || '',
          packageName: data.packageName || data.sessionType || 'Gym Floor Access',
          branch: data.branch || 'Garden 8',
          recordedByName: data.recordedByName || data.recordedBy || '',
          locker: data.locker || '',
          status: data.status || 'Checked In',
        };
      }));
    }, () => setSubcolAttendances([]));
    return unsubAtt;
  }, [client.id, activeTab]);

  // Fetch sales transfer logs
  React.useEffect(() => {
    if (activeTab !== 'transfers') return; const q = query(collection(db, 'salesTransferLogs'), where('clientId', '==', client.id), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, snap => {
      setSalesTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as SalesTransferLog)));
    }, () => setSalesTransfers([]));
    return unsub;
  }, [client.id, activeTab]);

  // Fetch trainer transfer logs
  React.useEffect(() => {
    if (activeTab !== 'transfers') return; const q2 = query(collection(db, 'trainerTransferLogs'), where('clientId', '==', client.id), orderBy('createdAt', 'desc'), limit(50));
    const unsub2 = onSnapshot(q2, snap => {
      setTrainerTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as TrainerTransferLog)));
    }, () => setTrainerTransfers([]));
    return unsub2;
  }, [client.id, activeTab]);

  // Calculate unpaid
  const unpaidAmount = payments.filter(p => p.clientId === client.id && !p.deleted_at).reduce((sum, p) => sum + (p.amount - p.amount_paid), 0);

  // Add comment handler
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setIsSavingComment(true);
    try {
      const comments = [...(client.comments || []), {
        id: Math.random().toString(36).substring(7),
        text: newComment.trim(),
        date: new Date().toISOString(),
        author: currentUser?.name || 'System'
      }];
      await onUpdateClient(client.id, { comments });
      setNewComment('');
      toast.success('Comment added');
    } catch { toast.error('Failed to add comment'); }
    setIsSavingComment(false);
  };

  // Initialize edit form
  const startEditing = () => {
    setFormData({
      name: client.name || '',
      phone: client.phone || '',
      backupPhone: client.backupPhone || '',
      jobTitle: client.jobTitle || '',
      dateOfBirth: client.dateOfBirth ? client.dateOfBirth.split('T')[0] : '',
      nationalId: client.nationalId || '',
      email: client.email || '',
      city: client.city || '',
      salesRep: client.salesRep || '',
      assignedTo: client.assignedTo || '',
      weight: client.weight || undefined,
      height: client.height || undefined,
      activityLevel: client.activityLevel || undefined,
      fitnessTarget: client.fitnessTarget || undefined,
      address: client.address || '',
      legacyMemberId: client.legacyMemberId || '',
      gender: client.gender || undefined,
      typeOfClient: client.typeOfClient || '',
      guestSerial: client.guestSerial || '',
      advertisingSource: client.advertisingSource || '',
      barcode: client.barcode || '',
      nationality: client.nationality || '',
      emergencyContactName: client.emergencyContactName || '',
      civilStatus: client.civilStatus || '',
      cardId: client.cardId || '',
      civilianOrMilitary: client.civilianOrMilitary || 'None',
      medicalInfo: client.medicalInfo || '',
      preferredTime: client.preferredTime || undefined,
      colorLabel: client.colorLabel || '',
      photoURL: client.photoURL || ''
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const isRepLocked = Boolean(client.salesRep || client.assignedTo);
      const canReassign = canReassignMemberSalesRep(currentUser);
      const rawUpdates = { ...formData };
      if (isRepLocked && !canReassign) {
        // Enforce Sales Manager authority rule: preserve assigned sales rep unless Sales Manager
        rawUpdates.salesRep = client.salesRep || client.assignedTo || '';
      }
      const canUnlockCoreFields = isSalesManagerUser(currentUser) || isGeneralManagerOrCEO(currentUser);
      const updates = sanitizeMemberProfileUpdates(rawUpdates, client, currentUser, canUnlockCoreFields);
      await onUpdateClient(client.id, updates);
      setIsEditing(false);
    } catch (err: any) {
      alert(err?.message || 'Failed to update client profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof Client, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Get mapped data
  const clientPayments = payments.filter(p => p.clientId === client.id);
  const clientAttendances = React.useMemo(() => {
    const topLevel = attendances.filter(a => a.clientId === client.id);
    const seenDates = new Set<string>();
    const merged: any[] = [];
    for (const item of [...topLevel, ...subcolAttendances]) {
      const dateKey = (item.date || '').slice(0, 19);
      if (dateKey && seenDates.has(dateKey)) continue;
      if (dateKey) seenDates.add(dateKey);
      merged.push(item);
    }
    return merged;
  }, [attendances, subcolAttendances, client.id]);

  // Helper for displaying fields
  const renderField = (
    label: string, 
    value: string | number | undefined | null, 
    fieldKey?: keyof Client, 
    type: 'text' | 'select' | 'number' | 'date' = 'text',
    options?: { value: string; label: string }[],
    disabled?: boolean
  ) => {
    const canUnlockCoreFields = isSalesManagerUser(currentUser) || isGeneralManagerOrCEO(currentUser);
    const isDisabled = disabled !== undefined ? disabled : (fieldKey ? isFieldLockedForUser(fieldKey, currentUser, client, canUnlockCoreFields) : false);
    if (isEditing && fieldKey) {
      if (type === 'select' && options) {
        return (
          <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">{label}</span>
              {isDisabled && (
                <span className="text-[9px] text-amber-500 font-bold">🔒 Locked</span>
              )}
            </div>
            <select
              className="h-8 w-full rounded border border-input bg-background px-2 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
              value={(formData[fieldKey] as string) || ''}
              onChange={e => handleInputChange(fieldKey, e.target.value)}
              disabled={isDisabled}
            >
              <option value="">Select...</option>
              {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );
      }
      return (
        <div className="flex flex-col space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">{label}</span>
            {isDisabled && (
              <span className="text-[9px] text-amber-500 font-bold">🔒 Locked</span>
            )}
          </div>
          <Input
            type={type}
            disabled={isDisabled}
            className="h-8 text-xs bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
            value={(formData[fieldKey] !== undefined ? formData[fieldKey] : '') as any}
            onChange={e => handleInputChange(fieldKey, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          />
        </div>
      );
    }

    const isPhoneField = fieldKey === 'phone' || fieldKey === 'backupPhone';
    return (
      <div className="text-left border-b border-border pb-1.5">
        <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">{label}</span>
        {isPhoneField && value ? (
          <button
            type="button"
            onClick={() =>
              openClickToCallModal({
                clientId: client.id,
                memberId: client.memberId,
                name: client.name,
                phone: String(value),
                backupPhone: client.backupPhone,
                status: client.status,
                branch: client.branch,
                packageType: client.packageType,
                source: client.source,
              })
            }
            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            title="Click to Call"
          >
            <Phone className="h-3 w-3" />
            {value}
          </button>
        ) : (
          <span className="text-xs font-semibold text-foreground">{value || '—'}</span>
        )}
      </div>
    );
  };

  const getAge = (dob: string | undefined) => safeGetAge(dob);

  const handleUpgradeClick = (pkgName?: string) => {
    setUpgradeDialogClientId(client.id);
    setUpgradePkgName(pkgName || '');
    setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleAddPackageClick = () => {
    if (setAddPackageDialogClientId) {
      setAddPackageDialogClientId(client.id);
    } else {
      handleUpgradeClick();
    }
  };

  return (
    <div className="flex flex-col w-full h-full min-h-0 overflow-hidden bg-background text-foreground">
      {/* Top Navigation Bar with Back Button */}
      <div className="bg-muted/30 px-6 py-2.5 flex items-center justify-between border-b border-border flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 px-3 text-xs font-bold gap-1.5 border-border bg-card hover:bg-muted shadow-sm shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Members
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block shrink-0" />
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'member_data', label: 'Overview (Member Details & Actions)' },
              { id: 'package_data', label: 'Packages & Benefits' },
              { id: 'financials', label: 'Financials' },
              { id: 'freezing', label: 'Freezing' },
              { id: 'activities', label: 'Activities' },
              { id: 'files', label: 'Files' },
              { id: 'comments', label: 'Comments Log' },
              { id: 'transfers', label: 'Transfer History' },
              { id: 'entitlements', label: 'Entitlements' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-3 py-1 text-xs font-bold rounded transition-all duration-150 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <button 
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground font-black text-sm p-1 ml-2 shrink-0"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Inzan Carbon Header Section */}
      <div className="bg-zinc-950 px-6 py-2 flex items-center justify-between flex-shrink-0 text-white border-b border-zinc-800 shadow-sm">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-300">
          <UserIcon className="h-4 w-4 text-zinc-400" />
          <span>Member Profile Management</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono font-bold text-zinc-300">
            ID: {client.memberId ? (String(client.memberId).startsWith('#') ? client.memberId : `#${client.memberId}`) : client.id}
          </span>
          <span className="text-[11px] font-mono text-zinc-400">TENANT: INZAN ATHLETICS</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* View Header with Action Buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-border pb-5">
          <div className="flex items-center gap-4 text-left">
            {client.photoURL ? (
              <img 
                src={client.photoURL} 
                alt={client.name} 
                className="h-14 w-14 rounded-full border-2 border-primary object-cover shrink-0"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground shrink-0">
                <UserIcon className="h-7 w-7" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                View Member Info - ( {client.name} )
                {client.colorLabel && (
                  <span className={`inline-block h-3 w-3 rounded-full ml-1`} style={{ backgroundColor: client.colorLabel }} />
                )}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                <button
                  type="button"
                  onClick={() =>
                    openClickToCallModal({
                      clientId: client.id,
                      memberId: client.memberId,
                      name: client.name,
                      phone: client.phone,
                      backupPhone: client.backupPhone,
                      status: client.status,
                      branch: client.branch,
                      packageType: client.packageType,
                      source: client.source,
                    })
                  }
                  className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  title="Click to Call"
                >
                  <Phone className="h-3 w-3" />
                  {client.phone}
                </button>{' '}
                · {client.branch || 'No branch'} ·{' '}
                {isLeadAccount ? (
                  <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 border border-amber-500/30 uppercase">
                    Lead / Prospect
                  </Badge>
                ) : (
                  <Badge className={client.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/10 border border-rose-500/20'}>
                    {client.status}
                  </Badge>
                )}
                {isLeadAccount && (
                  <Button
                    size="sm"
                    onClick={() => handleAddPackageClick()}
                    className="ml-2 h-6 px-2 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Convert to Member / Buy Package
                  </Button>
                )}
                {unpaidAmount > 0 && (
                  <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/10 border border-red-500/20 ml-2">
                    Unpaid: {unpaidAmount.toLocaleString()} LE
                  </Badge>
                )}
              </p>
            </div>
          </div>

          {/* Large Member ID Display */}
          <div 
            onClick={() => {
              const idToCopy = client.memberId ? String(client.memberId).replace(/^#/, '') : client.id;
              if (idToCopy) {
                navigator.clipboard.writeText(idToCopy);
                toast.success(`Member ID copied: ${idToCopy}`);
              }
            }}
            title="Click to copy Member ID"
            className="px-5 py-2 bg-muted/60 hover:bg-muted/90 transition-colors cursor-pointer border border-border rounded-xl flex flex-col items-center sm:items-start justify-center shrink-0 shadow-sm"
          >
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Member ID</span>
            <span className="text-xl sm:text-2xl font-black font-mono tracking-wider text-foreground">
              {client.memberId ? (String(client.memberId).startsWith('#') ? client.memberId : `#${client.memberId}`) : (client.id || '—')}
            </span>
          </div>

          {/* Buttons bar */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Edit Additional Info toggle button */}
            <Button
              variant="outline"
              size="sm"
              onClick={isEditing ? () => setIsEditing(false) : startEditing}
              className={`h-8 font-bold text-xs ${
                isEditing 
                  ? 'bg-rose-600 hover:bg-rose-700 border-rose-500 text-white' 
                  : 'bg-background hover:bg-muted text-foreground'
              }`}
            >
              {isEditing ? (
                <>
                  <Lock className="h-3.5 w-3.5 mr-1" />
                  Lock / Cancel
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 mr-1" />
                  Edit User Details
                </>
              )}
            </Button>
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 bg-amber-500/10 font-semibold">
              <Lock className="h-3 w-3 mr-1" /> Packages Locked on Profile (&lt;24h rule in Packages tab)
            </Badge>

            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-teal-600 hover:bg-teal-700 border-teal-500 text-white font-bold text-xs"
              onClick={() => {
                setActiveTab('package_data');
              }}
            >
              Packages &amp; Invites
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-blue-600 hover:bg-blue-700 border-blue-500 text-white font-bold text-xs gap-1.5"
              onClick={() =>
                openClickToCallModal({
                  clientId: client.id,
                  memberId: client.memberId,
                  name: client.name,
                  phone: client.phone,
                  backupPhone: client.backupPhone,
                  status: client.status,
                  branch: client.branch,
                  packageType: client.packageType,
                  source: client.source,
                })
              }
            >
              <Phone className="h-3.5 w-3.5" />
              Call Now
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-indigo-600 hover:bg-indigo-700 border-indigo-500 text-white font-bold text-xs"
              onClick={() => openWhatsAppChat({ phone: client.phone })}
            >
              Staff Whatsapp
            </Button>
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === 'member_data' && (
          <div className="space-y-6">
            {/* Desktop Two-Column Sidebar Layout (Strictly User Details Only) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
              {/* Left Column: Photo & Redgits ID */}
              <div className="md:col-span-1 space-y-4">
                {/* Profile Card */}
                <div className="border border-border rounded-xl p-4 bg-muted/10 flex flex-col items-center justify-center text-center">
                  <div className="relative group cursor-pointer mb-3">
                    {client.photoURL ? (
                      <img 
                        src={client.photoURL} 
                        alt={client.name} 
                        className="h-28 w-28 rounded-full border-2 border-primary object-cover"
                      />
                    ) : (
                      <div className="h-28 w-28 rounded-full bg-muted border flex items-center justify-center text-muted-foreground">
                        <UserIcon className="h-12 w-12" />
                      </div>
                    )}
                    
                    {/* Hover Overlay */}
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-200 border border-primary/40"
                    >
                      {isUploadingPhoto ? (
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      ) : (
                        <>
                          <Camera className="h-6 w-6 text-white mb-1" />
                          <span className="text-[9px] text-white/90 font-bold uppercase tracking-wider">Upload</span>
                        </>
                      )}
                    </div>
                  </div>

                  {photoUploadStatus && (
                    <span className="text-[10px] text-primary font-bold animate-pulse mb-2">{photoUploadStatus}</span>
                  )}

                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handlePhotoUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />

                  <h3 className="font-bold text-sm text-foreground">{client.name}</h3>
                  <button
                    type="button"
                    onClick={() =>
                      openClickToCallModal({
                        clientId: client.id,
                        memberId: client.memberId,
                        name: client.name,
                        phone: client.phone,
                        backupPhone: client.backupPhone,
                        status: client.status,
                        branch: client.branch,
                        packageType: client.packageType,
                        source: client.source,
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline mt-0.5 cursor-pointer"
                    title="Click to Call"
                  >
                    <Phone className="h-3 w-3" />
                    {client.phone}
                  </button>
                  <Badge className="mt-2 bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30">
                    {client.status}
                  </Badge>
                </div>

                {/* Redgits Member ID Badge */}
                <div className="border border-border rounded-xl p-4 bg-muted/20 text-center flex flex-col justify-center items-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Redgits Member ID</span>
                  <span className="text-3xl font-black text-rose-500 tracking-wider mt-1">{client.memberId || '—'}</span>
                </div>
              </div>

              {/* Right Column: Key-Value User Details Grid */}
              <div className="md:col-span-3 border border-border p-6 rounded-xl bg-muted/5">
                <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-primary">User Profile Details</h3>
                  <span className="text-[10px] text-muted-foreground">
                    Packages &amp; Invitations are managed in the <strong>Packages &amp; Invites</strong> tab
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                  {renderField('Member Name', client.name, 'name', 'text', undefined, isFieldLockedForUser('name', currentUser, client, isSalesManagerUser(currentUser) || isGeneralManagerOrCEO(currentUser)))}
                  {renderField('Username', client.memberId, 'legacyNotes', 'text', undefined, isFieldLockedForUser('legacyNotes', currentUser, client, isGeneralManagerOrCEO(currentUser)))}
                  {renderField('Mobile', client.phone, 'phone', 'text', undefined, isFieldLockedForUser('phone', currentUser, client, isSalesManagerUser(currentUser) || isGeneralManagerOrCEO(currentUser)))}
                  {renderField('Backup Mobile', client.backupPhone, 'backupPhone', 'text', undefined, isFieldLockedForUser('backupPhone', currentUser, client))}
                  {renderField('Job', client.jobTitle, 'jobTitle', 'text', undefined, isFieldLockedForUser('jobTitle', currentUser, client))}
                  {renderField('Birthday', (client.dateOfBirth ? safeFormatDate(client.dateOfBirth, 'yyyy-MM-dd', '') : '') + getAge(client.dateOfBirth), 'dateOfBirth', 'date', undefined, isFieldLockedForUser('dateOfBirth', currentUser, client))}
                  {renderField('National ID', client.nationalId, 'nationalId', 'text', undefined, isFieldLockedForUser('nationalId', currentUser, client))}
                  {renderField('Email', client.email, 'email', 'text', undefined, isFieldLockedForUser('email', currentUser, client))}
                  {renderField('Area', client.city, 'city', 'text', undefined, isFieldLockedForUser('city', currentUser, client))}
                  {renderField(
                    'Sales Man',
                    users.find(u => u.id === (formData.salesRep || client.salesRep))?.name || (client as any).salesName || 'unassigned',
                    'salesRep',
                    'select',
                    users.filter(u => ['crm_admin', 'super_admin', 'admin', 'manager', 'rep'].includes(u.role?.toLowerCase() || '')).map(u => ({ value: u.id, label: u.name })),
                    isFieldLockedForUser('salesRep', currentUser, client)
                  )}
                  {renderField('Trainer', users.find(u => u.id === (formData.assignedTo || client.assignedTo))?.name || (client as any).trainerName || 'unassigned', 'assignedTo', 'select',
                    users.filter(u => ['coach'].includes(u.role?.toLowerCase() || '')).map(u => ({ value: u.id, label: u.name })),
                    isFieldLockedForUser('assignedTo', currentUser, client)
                  )}
                  {renderField('Weight (kg)', client.weight, 'weight', 'number', undefined, isFieldLockedForUser('weight', currentUser, client))}
                  {renderField('Height (cm)', client.height, 'height', 'number', undefined, isFieldLockedForUser('height', currentUser, client))}
                  {renderField('Level', client.activityLevel, 'activityLevel', 'select', [
                    { value: 'Beginner', label: 'Beginner' },
                    { value: 'Intermediate', label: 'Intermediate' },
                    { value: 'Advanced', label: 'Advanced' }
                  ], isFieldLockedForUser('activityLevel', currentUser, client))}
                  {renderField('Goal', client.fitnessTarget, 'fitnessTarget', 'select', [
                    { value: 'Loss Weight', label: 'Loss Weight' },
                    { value: 'Build Muscle', label: 'Build Muscle' },
                    { value: 'Fitness', label: 'Fitness' },
                    { value: 'Rehab', label: 'Rehab' }
                  ], isFieldLockedForUser('fitnessTarget', currentUser, client))}
                  {renderField('Civil Status', client.civilStatus, 'civilStatus', 'text', undefined, isFieldLockedForUser('civilStatus', currentUser, client))}
                  {renderField('Status', client.status)}
                  {renderField('Address', client.address, 'address', 'text', undefined, isFieldLockedForUser('address', currentUser, client))}
                  {renderField('Member Code', client.legacyMemberId, 'legacyMemberId', 'text', undefined, isFieldLockedForUser('legacyMemberId', currentUser, client))}
                  {renderField('Emergency Contact', client.emergencyContactName, 'emergencyContactName', 'text', undefined, isFieldLockedForUser('emergencyContactName', currentUser, client))}
                  {renderField('Gender', client.gender, 'gender', 'select', [
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' }
                  ], isFieldLockedForUser('gender', currentUser, client))}
                  {renderField('Type', client.typeOfClient, 'typeOfClient', 'text', undefined, isFieldLockedForUser('typeOfClient', currentUser, client))}
                  {renderField('Guest Serial', client.guestSerial, 'guestSerial', 'text', undefined, isFieldLockedForUser('guestSerial', currentUser, client))}
                  {renderField('Advertising Source', client.advertisingSource, 'advertisingSource', 'text', undefined, isFieldLockedForUser('advertisingSource', currentUser, client))}
                  {renderField('Bar-code / RFID', client.barcode, 'barcode', 'text', undefined, isFieldLockedForUser('barcode', currentUser, client))}
                  {renderField('Nationality', client.nationality, 'nationality', 'text', undefined, isFieldLockedForUser('nationality', currentUser, client))}
                  {renderField('Civilian/Military', client.civilianOrMilitary, 'civilianOrMilitary', 'select', [
                    { value: 'None', label: 'None' },
                    { value: 'Civilian', label: 'Civilian' },
                    { value: 'Military', label: 'Military' }
                  ], isFieldLockedForUser('civilianOrMilitary', currentUser, client))}
                  {renderField('Card ID', client.cardId, 'cardId', 'text', undefined, isFieldLockedForUser('cardId', currentUser, client))}
                  {renderField('Medical Info', client.medicalInfo, 'medicalInfo', 'text', undefined, isFieldLockedForUser('medicalInfo', currentUser, client))}
                  {renderField('Preferred Time', client.preferredTime, 'preferredTime', 'select', [
                    { value: 'Morning', label: 'Morning' },
                    { value: 'Afternoon', label: 'Afternoon' },
                    { value: 'Evening', label: 'Evening' },
                    { value: 'Night', label: 'Night' }
                  ], isFieldLockedForUser('preferredTime', currentUser, client))}
                  {renderField('Color Label', client.colorLabel, 'colorLabel', 'select', [
                    { value: 'red', label: '🔴 Red' },
                    { value: 'green', label: '🟢 Green' },
                    { value: 'blue', label: '🔵 Blue' },
                    { value: 'purple', label: '🟣 Purple' },
                    { value: 'yellow', label: '🟡 Yellow' },
                    { value: 'orange', label: '🟠 Orange' },
                    { value: 'pink', label: '🩷 Pink' },
                    { value: 'brown', label: '🟤 Brown' }
                  ], isFieldLockedForUser('colorLabel', currentUser, client))}
                  {renderField('Created On', safeFormatDate(client.createdAt, 'yyyy-MM-dd HH:mm:ss'))}
                </div>
              </div>
            </div>

            {/* Front Desk / Receptionist Quick Actions: Guest Invites & Unlimited Referrals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              {/* Card 1: Guest Invitations (Deducts from package quota) */}
              <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-500/5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-sky-950 dark:text-sky-100">
                      Guest Invitations (Workout Passes)
                    </h4>
                  </div>
                  <Badge className="bg-sky-600 text-white font-bold text-xs">
                    {Number(client.guestInvitesRemaining ?? (client as any).invitationsRemaining ?? 0)} Passes Left
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Official workout visitor pass. Deducts 1 pass from member's package quota upon invitation and check-in.
                </p>

                {showQuickInviteForm ? (
                  <div className="space-y-2.5 pt-2 border-t border-sky-500/20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="Guest Full Name *"
                        value={quickGuestName}
                        onChange={e => setQuickGuestName(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                      <Input
                        placeholder="Guest Phone Number *"
                        value={quickGuestPhone}
                        onChange={e => setQuickGuestPhone(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowQuickInviteForm(false)}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={isSubmittingQuickInvite}
                        onClick={handleSendQuickGuestInvite}
                        className="h-7 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white"
                      >
                        {isSubmittingQuickInvite ? 'Issuing...' : 'Issue Guest Pass'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-2 border-t border-sky-500/20">
                    <button
                      onClick={() => setActiveTab('package_data')}
                      className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline font-semibold"
                    >
                      View all invite history in Packages tab →
                    </button>
                    <Button
                      size="sm"
                      onClick={() => setShowQuickInviteForm(true)}
                      disabled={Number(client.guestInvitesRemaining ?? (client as any).invitationsRemaining ?? 0) <= 0}
                      className="h-7 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Issue Guest Pass
                    </Button>
                  </div>
                )}
              </div>

              {/* Card 2: Unlimited Referrals (0 quota used, for sales follow-up) */}
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950 dark:text-emerald-100">
                      Unlimited Member Referrals
                    </h4>
                  </div>
                  <Badge className="bg-emerald-600 text-white font-bold text-xs">
                    ∞ Unlimited ({memberReferrals.length} Referred)
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Friend/family contact referral for Sales follow-up. Does NOT consume any guest invitations quota.
                </p>

                {showAddReferralForm ? (
                  <div className="space-y-2.5 pt-2 border-t border-emerald-500/20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="Friend's Full Name *"
                        value={referralName}
                        onChange={e => setReferralName(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                      <Input
                        placeholder="Phone Number *"
                        value={referralPhone}
                        onChange={e => setReferralPhone(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <Input
                      placeholder="Notes (optional, e.g. interested in 3 Months + PT)"
                      value={referralNotes}
                      onChange={e => setReferralNotes(e.target.value)}
                      className="h-8 text-xs bg-background"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowAddReferralForm(false)}
                        className="h-7 text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={isSubmittingReferral}
                        onClick={handleAddUnlimitedReferral}
                        className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {isSubmittingReferral ? 'Saving...' : 'Save Referral Lead'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-2 border-t border-emerald-500/20">
                    <span className="text-[11px] text-muted-foreground truncate max-w-[60%]">
                      {memberReferrals.length > 0
                        ? `Total: ${memberReferrals.length} friend referral${memberReferrals.length > 1 ? 's' : ''}`
                        : 'No referrals submitted yet.'}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setShowAddReferralForm(true)}
                      className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Referral Lead
                    </Button>
                  </div>
                )}

                {/* Referrals List Table */}
                {memberReferrals.length > 0 && (
                  <div className="pt-2 border-t border-emerald-500/20 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block">
                      Member's Referred Contacts ({memberReferrals.length})
                    </span>
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-emerald-500/20 bg-background/60">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-border/40 text-muted-foreground text-[10px] bg-muted/30">
                            <th className="p-1.5 font-bold">Name</th>
                            <th className="p-1.5 font-bold">Phone</th>
                            <th className="p-1.5 font-bold">Notes</th>
                            <th className="p-1.5 font-bold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberReferrals.map((r, i) => (
                            <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                              <td className="p-1.5 font-bold text-foreground">{r.name}</td>
                              <td className="p-1.5 font-mono text-muted-foreground">{r.phone}</td>
                              <td className="p-1.5 text-muted-foreground truncate max-w-[120px]">{r.notes || '—'}</td>
                              <td className="p-1.5 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 text-[10px] text-emerald-600 hover:bg-emerald-500/10 px-1 font-bold"
                                  onClick={() => openWhatsAppChat({ phone: String(r.phone || '') })}
                                >
                                  WhatsApp
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Smart Locker Hardware Control Card (Front Desk & Operations) */}
            {(() => {
              const assignedLocker = lockerStatus?.assignedLocker || null;
              const isOnline = assignedLocker ? isHardwareLockerOnline(assignedLocker) : false;
              const expiryTarget = lockerStatus?.expiresAt || lockerStatus?.occupant?.valid_until || null;
              const timeRem = formatLockerTimeRemaining(expiryTarget);
              const activePin = issuedPinOverride || lockerStatus?.pin || assignedLocker?.crmPin || null;
              const groups = lockerStatus?.groups || [];
              const menGroup = groups.find(g => /men|male|gent/i.test(`${g.name} ${g.slug || ''}`) && !/women|female|lad/i.test(`${g.name} ${g.slug || ''}`));
              const womenGroup = groups.find(g => /women|female|lad/i.test(`${g.name} ${g.slug || ''}`));
              const clientGenderNorm = String(client.gender || '').toLowerCase();
              const isFemaleClient = clientGenderNorm.startsWith('f') || clientGenderNorm === 'women';
              const isMaleClient = clientGenderNorm.startsWith('m') || clientGenderNorm === 'men';
              const assignedGroupLabel =
                assignedLocker?.group?.name ||
                (assignedLocker?.gender === 'women' ? 'Women' : assignedLocker?.gender === 'men' ? 'Men' : assignedLocker?.location || 'Locker Zone');

              return (
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3 shadow-xs text-left">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-950 dark:text-amber-100">
                        Smart Locker Hardware Control
                      </h4>
                      {assignedLocker ? (
                        <Badge className="bg-emerald-600 text-white font-bold text-[10px]">
                          ASSIGNED: {assignedLocker.name}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-semibold border-amber-500/30 text-amber-700 dark:text-amber-300">
                          NO ACTIVE LOCKER
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {lockerError && (
                        <span className="text-[11px] text-rose-500 font-medium">{lockerError}</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isLoadingLocker || isOperatingLocker}
                        onClick={() => loadMemberLockerStatus(false)}
                        className="h-7 px-2.5 text-xs gap-1.5 border-amber-500/30 hover:bg-amber-500/10"
                      >
                        <RefreshCw className={`h-3 w-3 ${isLoadingLocker ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </div>

                  {isLoadingLocker && !lockerStatus ? (
                    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                      <span>Checking live Smart Locker assignment for {client.name}...</span>
                    </div>
                  ) : assignedLocker ? (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg border border-amber-500/20 bg-background/80">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Assigned Locker
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-2xl font-black tracking-tight text-foreground">
                              {assignedLocker.name}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold ${
                                isOnline
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {isOnline ? '● ONLINE' : '○ OFFLINE'}
                            </Badge>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Locker Zone / Group
                          </span>
                          <span className="text-sm font-bold text-foreground block mt-1">
                            {assignedGroupLabel}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Session Countdown
                          </span>
                          <span
                            className={`text-sm font-bold block mt-1 ${
                              timeRem?.expired
                                ? 'text-rose-600'
                                : timeRem?.approaching
                                ? 'text-amber-600'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {timeRem ? timeRem.text : 'Active Session'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Phone-Unlock PIN
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Key className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-base font-mono font-black tracking-widest text-amber-600 dark:text-amber-400">
                              {activePin || '••••••'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={isOperatingLocker}
                          onClick={handleFrontDeskOpenLocker}
                          className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          Open Locker (Pulse Relay)
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isOperatingLocker}
                          onClick={handleFrontDeskReissuePin}
                          className="h-8 text-xs font-bold border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 gap-1.5"
                        >
                          <Key className="h-3.5 w-3.5" />
                          Re-issue PIN
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isOperatingLocker}
                          onClick={handleFrontDeskExtendLocker}
                          className="h-8 text-xs font-bold border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 gap-1.5"
                        >
                          <Clock className="h-3.5 w-3.5" />
                          Extend +3h
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isOperatingLocker}
                          onClick={handleFrontDeskReleaseLocker}
                          className="h-8 text-xs font-bold border-rose-500/40 text-rose-600 hover:bg-rose-500/10 gap-1.5 ml-auto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Release / Unassign
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="px-3 py-1.5 rounded-lg border border-sky-500/20 bg-sky-500/5 flex items-center gap-2">
                          <span className="font-bold text-sky-700 dark:text-sky-300">Men's Lockers:</span>
                          <span className="font-mono font-black text-foreground">
                            {menGroup ? `${menGroup.availableOnline} / ${menGroup.total} Online` : 'Ready'}
                          </span>
                        </div>
                        <div className="px-3 py-1.5 rounded-lg border border-pink-500/20 bg-pink-500/5 flex items-center gap-2">
                          <span className="font-bold text-pink-700 dark:text-pink-300">Women's Lockers:</span>
                          <span className="font-mono font-black text-foreground">
                            {womenGroup ? `${womenGroup.availableOnline} / ${womenGroup.total} Online` : 'Ready'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={isOperatingLocker || (menGroup ? menGroup.availableOnline <= 0 : false)}
                          onClick={() => handleFrontDeskClaimLocker(menGroup?.id, 'Male')}
                          variant={isFemaleClient ? 'outline' : 'default'}
                          className={
                            isFemaleClient
                              ? 'h-8 text-xs font-bold border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 gap-1.5'
                              : 'h-8 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white gap-1.5'
                          }
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Assign Men&apos;s Locker {isMaleClient ? '★' : ''}
                        </Button>

                        <Button
                          size="sm"
                          disabled={isOperatingLocker || (womenGroup ? womenGroup.availableOnline <= 0 : false)}
                          onClick={() => handleFrontDeskClaimLocker(womenGroup?.id, 'Female')}
                          variant={isMaleClient ? 'outline' : 'default'}
                          className={
                            isMaleClient
                              ? 'h-8 text-xs font-bold border-pink-500/40 text-pink-700 dark:text-pink-300 hover:bg-pink-500/10 gap-1.5'
                              : 'h-8 text-xs font-bold bg-pink-600 hover:bg-pink-700 text-white gap-1.5'
                          }
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Assign Women&apos;s Locker {isFemaleClient ? '★' : ''}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Member Feedback & Staff Notes Section (Editable by Any Staff Member) */}
            <div className="border border-border p-5 rounded-xl bg-muted/10 text-left space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" /> Member Feedback &amp; Front-Desk Notes
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Anyone on the team can update member feedback or add a quick feedback note below without unlocking core identity fields.
                  </p>
                </div>
                {(client as any).lastFeedbackBy && (
                  <span className="text-[10px] text-muted-foreground">
                    Last updated by <strong>{(client as any).lastFeedbackBy}</strong> on {safeFormatDate((client as any).lastFeedbackAt, 'dd MMM yyyy HH:mm')}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Pinned Profile Feedback / Note</Label>
                  <Textarea
                    value={quickFeedbackText}
                    onChange={e => setQuickFeedbackText(e.target.value)}
                    placeholder="Enter member feedback, preferences, or front-desk notes..."
                    className="text-xs min-h-[75px] bg-background"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Log New Feedback Entry to Timeline (Optional)</Label>
                  <Textarea
                    value={newFeedbackEntry}
                    onChange={e => setNewFeedbackEntry(e.target.value)}
                    placeholder="Add a timestamped feedback log (e.g. Member requested morning coach follow-up)..."
                    className="text-xs min-h-[75px] bg-background"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={isSavingFeedback}
                  onClick={handleSaveMemberFeedback}
                  className="h-8 text-xs font-bold bg-primary text-primary-foreground"
                >
                  {isSavingFeedback ? 'Saving Feedback...' : 'Save Member Feedback'}
                </Button>
              </div>
            </div>

            {/* Save / Cancel buttons for Edit Mode */}
            {isEditing && (
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold"
                >
                  {isSaving ? 'Saving...' : 'Save User Details'}
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'package_data' && (
          <div className="space-y-8 text-left">
        {/* Always-Visible Read-Only Primary & Secondary Package + Reconciled Quotas Banner */}
        {(() => {
          const rawC = client as any;
          const allPkgs = Array.isArray(client.packages) ? client.packages : [];
          const primaryPkg =
            allPkgs.find(p => !isSecondaryPackageItem(p) && (p.status === 'Active' || (p.status as any) === 'Frozen' || p.status === 'Hold')) ||
            allPkgs.find(p => !isSecondaryPackageItem(p)) ||
            (client.packageType && !isSecondaryPackageItem({ packageName: client.packageType })
              ? {
                  packageName: rawC.primaryPackageName || client.packageType,
                  status: client.status,
                  startDate: client.startDate || (client as any).joinDate,
                  endDate: client.membershipExpiry || (client as any).expiryDate,
                  createdAt: client.createdAt,
                  createdBy: rawC.salesName || 'System',
                }
              : null);

          const secondaryPkgs = allPkgs.filter(p => isSecondaryPackageItem(p));
          const activeSecondaryPkg =
            secondaryPkgs.find(p => p.status === 'Active') ||
            secondaryPkgs[0] ||
            (rawC.secondaryPackageName
              ? {
                  packageName: rawC.secondaryPackageName,
                  status: 'Active',
                  sessionsRemaining: rawC.paidPtSessionsRemaining ?? 0,
                  totalSessions: rawC.paidPtSessionsTotal ?? 0,
                  createdAt: client.createdAt,
                  createdBy: rawC.salesName || 'System',
                }
              : null);

          const primaryExpiry = primaryPkg?.endDate || client.membershipExpiry || (client as any).expiryDate;
          const daysToRenew = getDaysRemainingToRenew(primaryExpiry);
          const b = resolvePackageBenefits(primaryPkg || allPkgs[0] || {});

          const paidPtTotal = Number(rawC.paidPtSessionsTotal ?? (activeSecondaryPkg as any)?.totalSessions ?? (activeSecondaryPkg as any)?.sessionsTotal ?? 0);
          const paidPtRem = Number(rawC.paidPtSessionsRemaining ?? activeSecondaryPkg?.sessionsRemaining ?? 0);
          const paidPtUsed = Number(rawC.paidPtSessionsUsed ?? Math.max(0, paidPtTotal - paidPtRem));

          const freePtTotal = Number(rawC.freePtSessionsTotal ?? b.freePtTotal ?? 0);
          const freePtUsed = Number(rawC.freePtSessionsUsed ?? b.freePtUsed ?? 0);
          const freePtRem = Number(rawC.freePtSessionsRemaining ?? Math.max(0, freePtTotal - freePtUsed));

          const invTotal = Number(rawC.invitationsTotal ?? b.invTotal ?? 0);
          const invUsed = Number(rawC.invitationsUsed ?? b.invUsed ?? 0);
          const invRem = Number(rawC.invitationsRemaining ?? Math.max(0, invTotal - invUsed));

          const freezeTotal = Number(rawC.freezeAllowanceDays ?? b.freezeTotal ?? 0);
          const freezeUsed = Number(rawC.freezeDaysUsed ?? b.freezeUsed ?? 0);
          const freezeRem = Number(rawC.freezeDaysRemaining ?? Math.max(0, freezeTotal - freezeUsed));

          return (
            <div className="mb-6 rounded-xl border border-border bg-muted/15 p-4 space-y-3 text-left shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-primary">
                    Active Membership &amp; Secondary Package Summary
                  </span>
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 bg-amber-500/10 font-bold">
                    <Lock className="h-3 w-3 mr-1" /> Read-Only on Profile • Manage in Packages Tab
                  </Badge>
                </div>
                {activeTab !== 'package_data' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveTab('package_data')}
                    className="h-7 text-xs font-bold border-primary/40 text-primary hover:bg-primary/10"
                  >
                    Open Packages &amp; Invites Tab →
                  </Button>
                )}
              </div>

              {/* Primary + Secondary Package Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Primary Package */}
                <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex flex-col justify-between gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge className="bg-emerald-600 text-white text-[10px] font-bold uppercase mb-1">
                        Primary Package (Membership)
                      </Badge>
                      <h4 className="text-sm font-black text-foreground">
                        {primaryPkg?.packageName || rawC.primaryPackageName || client.packageType || 'No Primary Membership'}
                      </h4>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`text-sm font-black px-2.5 py-1 rounded-lg border inline-block ${
                          daysToRenew <= 7 && client.status === 'Active'
                            ? 'bg-amber-500/15 text-amber-600 border-amber-500/40'
                            : client.status === 'Active'
                            ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-600 border-rose-500/30'
                        }`}
                      >
                        {client.status === 'Active' || client.status === 'Hold'
                          ? `${daysToRenew} Days to Renew`
                          : '0 Days (Expired)'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-2 border-t border-emerald-500/20">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Start Date</span>
                      <span className="font-bold text-foreground">{safeFormatDate(primaryPkg?.startDate || client.startDate, 'dd MMM yyyy')}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Renewal / Expiry</span>
                      <span className="font-bold text-foreground">{safeFormatDate(primaryExpiry, 'dd MMM yyyy')}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Created By</span>
                      <span className="font-bold text-foreground">
                        {(primaryPkg as any)?.createdByName || (primaryPkg as any)?.createdBy || rawC.salesName || 'System'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Created On</span>
                      <span className="font-bold text-foreground">
                        {safeFormatDate(primaryPkg?.createdAt || client.createdAt, 'dd MMM yyyy')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Secondary Package (if any) */}
                <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/5 flex flex-col justify-between gap-2">
                  {activeSecondaryPkg ? (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge className="bg-indigo-600 text-white text-[10px] font-bold uppercase mb-1">
                            Secondary Package (PT / Add-On)
                          </Badge>
                          <h4 className="text-sm font-black text-foreground">
                            {activeSecondaryPkg.packageName}
                          </h4>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-black px-2.5 py-1 rounded-lg border bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 inline-block">
                            {paidPtRem} / {paidPtTotal || activeSecondaryPkg.sessionsRemaining || 0} Sessions Left
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-2 border-t border-indigo-500/20">
                        <div>
                          <span className="text-muted-foreground block text-[10px]">Coach / Trainer</span>
                          <span className="font-bold text-foreground">
                            {(activeSecondaryPkg as any)?.coachName || rawC.trainerName || users.find(u => u.id === client.assignedTo)?.name || 'Assigned Coach'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px]">Expiry Date</span>
                          <span className="font-bold text-foreground">
                            {safeFormatDate((activeSecondaryPkg as any)?.endDate, 'dd MMM yyyy')}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px]">Created By</span>
                          <span className="font-bold text-foreground">
                            {(activeSecondaryPkg as any)?.createdByName || (activeSecondaryPkg as any)?.createdBy || rawC.salesName || 'System'}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px]">Created On</span>
                          <span className="font-bold text-foreground">
                            {safeFormatDate((activeSecondaryPkg as any)?.createdAt || client.createdAt, 'dd MMM yyyy')}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-start justify-between h-full gap-2">
                      <div>
                        <Badge variant="outline" className="text-[10px] font-bold uppercase border-indigo-500/30 text-indigo-500 mb-1">
                          Secondary Package (PT / Add-On)
                        </Badge>
                        <p className="text-xs font-semibold text-muted-foreground mt-1">
                          No active secondary package (Private Training / Group PT / Nutrition) on this profile.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAddPackageClick}
                        className="h-7 text-xs font-bold border-indigo-500/40 text-indigo-600 hover:bg-indigo-500/10"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Secondary Package
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* 5-Pill Reconciled Quotas Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                <div className="p-2 rounded-lg border border-border bg-background/80">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Days to Renew</span>
                  <span className={`text-xs font-black ${daysToRenew <= 7 && client.status === 'Active' ? 'text-amber-500' : 'text-foreground'}`}>
                    {client.status === 'Active' || client.status === 'Hold' ? `${daysToRenew} Days Left` : '0 Days (Expired)'}
                  </span>
                </div>
                <div className="p-2 rounded-lg border border-border bg-background/80">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Paid PT Sessions</span>
                  <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                    {paidPtRem} Left ({paidPtUsed}/{paidPtTotal} Used)
                  </span>
                </div>
                <div className="p-2 rounded-lg border border-border bg-background/80">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Free PT Quota</span>
                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                    {freePtRem} Left ({freePtUsed}/{freePtTotal} Used)
                  </span>
                </div>
                <div className="p-2 rounded-lg border border-border bg-background/80">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Guest Invitations</span>
                  <span className="text-xs font-black text-sky-600 dark:text-sky-400">
                    {invRem} Left ({invUsed}/{invTotal} Used)
                  </span>
                </div>
                <div className="p-2 rounded-lg border border-border bg-background/80">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Freeze Balance</span>
                  <span className="text-xs font-black text-cyan-600 dark:text-cyan-400">
                    {freezeRem}d Left ({freezeUsed}/{freezeTotal}d Used)
                  </span>
                </div>
              </div>
            </div>
          );
        })()}


            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase text-primary">Packages, Invitations &amp; Referrals Hub</h3>
                <p className="text-xs text-muted-foreground">
                  View Primary &amp; Secondary packages, who created them &amp; when, upgrade/renew, transfer, edit within 24h, and manage Guest Invitations &amp; Referrals in one place.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddPackageClick}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add New Package
                </Button>
              </div>
            </div>

            {/* Per-Package Multi-Package Cards (Primary & Secondary) */}
            {(() => {
              const allPackages = (client.packages && client.packages.length > 0)
                ? [...client.packages].sort((a, b) => {
                    const aSec = isSecondaryPackageItem(a) ? 1 : 0;
                    const bSec = isSecondaryPackageItem(b) ? 1 : 0;
                    if (a.status === 'Active' && b.status !== 'Active') return -1;
                    if (a.status !== 'Active' && b.status === 'Active') return 1;
                    if (aSec !== bSec) return aSec - bSec;
                    return (toValidDate(b.startDate)?.getTime() || 0) - (toValidDate(a.startDate)?.getTime() || 0);
                  })
                : client.packageType
                  ? [{
                      id: `primary_${client.id}`,
                      packageId: '',
                      packageName: client.packageType,
                      startDate: (client as any).joinDate || client.startDate || '',
                      endDate: (client as any).expiryDate || client.membershipExpiry || '',
                      sessionsTotal: (client as any).totalSessions || 'unlimited',
                      sessionsRemaining: client.sessionsRemaining ?? 'unlimited',
                      status: (client.status === 'Active' ? 'Active' : 'Expired') as any,
                      createdAt: client.createdAt || '',
                      createdByName: (client as any).salesName || 'System',
                    }]
                  : [];

              if (allPackages.length === 0) {
                return (
                  <div className="bg-muted/5 p-8 rounded-xl border border-dashed border-border text-center text-muted-foreground text-xs flex flex-col items-center justify-center gap-2">
                    <AlertCircle className="h-6 w-6 text-rose-500" />
                    <span>No active or historical membership packages found on this profile.</span>
                    <Button
                      size="sm"
                      onClick={handleAddPackageClick}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs mt-2"
                    >
                      Purchase a Package
                    </Button>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {allPackages.map((pkg, idx) => {
                    const b = resolvePackageBenefits(pkg);
                    const editState = getSameDayEditState(pkg);
                    const isActive = pkg.status === 'Active';
                    const isSecondary = isSecondaryPackageItem(pkg);
                    const isEditingThisPkg = editingPkgId === pkg.id;
                    const isTransferringThisPkg = transferPkgId === pkg.id;
                    const pkgDaysLeft = getDaysRemainingToRenew(pkg.endDate);
                    const filteredCatalogPackages = packages.filter(cp => {
                      if (!pkgSearchFilter.trim()) return true;
                      const q = pkgSearchFilter.trim().toLowerCase();
                      return (
                        (cp.name || '').toLowerCase().includes(q) ||
                        (cp.category || '').toLowerCase().includes(q) ||
                        String(cp.price || '').includes(q)
                      );
                    });

                    return (
                      <div
                        key={pkg.id || idx}
                        className={`p-6 rounded-xl border-l-4 border space-y-4 shadow-sm ${
                          isActive
                            ? isSecondary
                              ? 'bg-indigo-500/5 border-l-indigo-500 border-border'
                              : 'bg-muted/10 border-l-emerald-500 border-border'
                            : 'bg-muted/5 border-l-zinc-500 border-border/70 opacity-90'
                        }`}
                      >
                        {/* Package Header + Primary/Secondary Badge + 24h Lock Status */}
                        <div className="flex flex-wrap justify-between items-start gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={`text-[10px] font-bold uppercase ${
                                isSecondary
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-emerald-600 text-white'
                              }`}>
                                {isSecondary ? 'Secondary Package (PT / Add-On)' : 'Primary Package (Membership)'}
                              </Badge>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                isActive ? 'text-emerald-500 bg-emerald-500/10' : 'text-muted-foreground bg-muted'
                              }`}>
                                {pkg.status}
                              </span>
                              {editState.canSameDayEdit ? (
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold">
                                  <Unlock className="h-3 w-3 mr-1" /> Editable (&lt;24h Window • {editState.hoursLeft}h left)
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 font-bold">
                                  <Lock className="h-3 w-3 mr-1" />
                                  {editState.isFinanceConfirmed
                                    ? 'Locked (Confirmed by Accounting)'
                                    : 'Locked (>24h Creation Window Passed)'}
                                </Badge>
                              )}
                            </div>
                            <h4 className="text-lg font-bold text-foreground mt-2">{pkg.packageName}</h4>
                          </div>
                          <div className="text-right">
                            <span className={`text-xl sm:text-2xl font-black ${isSecondary ? 'text-indigo-500' : 'text-emerald-500'}`}>
                              {isSecondary
                                ? `${pkg.sessionsRemaining ?? 0} / ${(pkg as any).totalSessions ?? pkg.sessionsTotal ?? pkg.sessionsRemaining ?? 0} Sessions`
                                : isActive
                                  ? `${pkgDaysLeft} Days to Renew`
                                  : 'Expired'}
                            </span>
                          </div>
                        </div>

                        {/* Dates & Creation Audit Trail */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-3 border-t border-border text-xs">
                          <div>
                            <span className="text-muted-foreground block font-medium">Start Date:</span>
                            <span className="font-bold text-foreground">{safeFormatDate(pkg.startDate, 'dd MMM yyyy')}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block font-medium">Expiry / Renewal Date:</span>
                            <span className="font-bold text-foreground">{safeFormatDate(pkg.endDate, 'dd MMM yyyy')}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block font-medium">Created On:</span>
                            <span className="font-bold text-foreground">{safeFormatDate(pkg.createdAt || client.createdAt, 'dd MMM yyyy HH:mm')}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block font-medium">Created By:</span>
                            <span className="font-bold text-primary">
                              {(pkg as any).createdByName || (pkg as any).createdBy || (pkg as any).salesRepName || (client as any).salesName || 'System'}
                            </span>
                            {(pkg as any).lastModifiedBy && (
                              <span className="text-[10px] text-muted-foreground block">
                                Edited by {(pkg as any).lastModifiedBy} ({safeFormatDate((pkg as any).lastModifiedAt, 'dd MMM HH:mm')})
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-muted-foreground block font-medium">Accounting Lock:</span>
                            <span className={`font-bold uppercase ${editState.isFinanceConfirmed ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {editState.isFinanceConfirmed ? 'Confirmed ✓' : 'Within 24h Rule'}
                            </span>
                          </div>
                        </div>

                        {/* Resolved Package Benefits Grid with Direct Deduction / Use Actions */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-border">
                          <div className="p-2.5 rounded-lg border border-border bg-background/70 flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-muted-foreground block">Freeze Allowance</span>
                              <span className="text-sm font-black text-foreground">
                                {b.freezeUsed} / {b.freezeTotal} Days
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                                {b.freezeRem} days remaining
                              </span>
                            </div>
                            <div className="pt-2 mt-1 border-t border-border/40">
                              {pkg.status === 'Hold' || (pkg as any).isOnHold ? (
                                <Button
                                  size="sm"
                                  onClick={() => handleUnfreezePackageDirect(pkg.id)}
                                  className="h-6 w-full text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                  Unfreeze Now
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={b.freezeRem <= 0}
                                  onClick={() => {
                                    setFreezePkgId(pkg.id);
                                    setActiveTab('freezing');
                                  }}
                                  className="h-6 w-full text-[10px] font-bold border-cyan-500/30 text-cyan-600 hover:bg-cyan-500/10"
                                >
                                  ❄️ Apply Freeze
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg border border-border bg-background/70 flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-muted-foreground block">Guest Invitations</span>
                              <span className="text-sm font-black text-foreground">
                                {b.invUsed} / {b.invTotal} Passes
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                                {b.invRem} passes remaining
                              </span>
                            </div>
                            <div className="pt-2 mt-1 border-t border-border/40">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={b.invRem <= 0}
                                onClick={() => {
                                  setActiveTab('member_data');
                                  setShowQuickInviteForm(true);
                                }}
                                className="h-6 w-full text-[10px] font-bold border-sky-500/30 text-sky-600 hover:bg-sky-500/10"
                              >
                                🎫 Issue Pass
                              </Button>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg border border-border bg-background/70 flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-muted-foreground block">Free PT Sessions</span>
                              <span className="text-sm font-black text-foreground">
                                {b.freePtUsed} / {b.freePtTotal} Sessions
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                                {b.freePtRem} free PT remaining
                              </span>
                            </div>
                            <div className="pt-2 mt-1 border-t border-border/40">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={b.freePtRem <= 0}
                                onClick={() => setActiveTab('activities')}
                                className="h-6 w-full text-[10px] font-bold border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10"
                              >
                                🏋️ Book Free PT
                              </Button>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg border border-border bg-background/70 flex flex-col justify-between">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-muted-foreground block">Free Class Trials</span>
                              <span className="text-sm font-black text-foreground">
                                {b.classUsed} / {b.classTotal} Classes
                              </span>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                                {b.classRem} classes remaining
                              </span>
                            </div>
                            <div className="pt-2 mt-1 border-t border-border/40">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={b.classRem <= 0}
                                onClick={() => setActiveTab('activities')}
                                className="h-6 w-full text-[10px] font-bold border-purple-500/30 text-purple-600 hover:bg-purple-500/10"
                              >
                                📅 Book Class
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Inline Same-Day (<24h) Editor Panel with Searchable Package Dropdown */}
                        {isEditingThisPkg && (
                          <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-primary uppercase">
                                Same-Day Package Edit (&lt;24h Window • Logs Editor &amp; Timestamp)
                              </span>
                              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setEditingPkgId(null); setPkgSearchFilter(''); }}>Cancel</Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold">Search &amp; Select Package</Label>
                                <Input
                                  placeholder="Type to search packages..."
                                  value={pkgSearchFilter}
                                  onChange={e => setPkgSearchFilter(e.target.value)}
                                  className="h-7 text-xs bg-background mb-1"
                                />
                                <select
                                  className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                                  value={editPkgForm.packageName}
                                  onChange={e => setEditPkgForm(prev => ({ ...prev, packageName: e.target.value }))}
                                >
                                  <option value={pkg.packageName}>{pkg.packageName} (Current)</option>
                                  {filteredCatalogPackages.map(cp => (
                                    <option key={cp.id} value={cp.name}>
                                      {cp.name} ({cp.price?.toLocaleString()} LE)
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <Label className="text-[10px] uppercase font-bold">Start Date</Label>
                                <Input
                                  type="date"
                                  className="h-8 text-xs bg-background mt-1"
                                  value={editPkgForm.startDate}
                                  onChange={e => setEditPkgForm(prev => ({ ...prev, startDate: e.target.value }))}
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] uppercase font-bold">Expiry Date</Label>
                                <Input
                                  type="date"
                                  className="h-8 text-xs bg-background mt-1"
                                  value={editPkgForm.endDate}
                                  onChange={e => setEditPkgForm(prev => ({ ...prev, endDate: e.target.value }))}
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] uppercase font-bold">Sessions Left</Label>
                                <Input
                                  className="h-8 text-xs bg-background mt-1"
                                  value={editPkgForm.sessionsRemaining}
                                  onChange={e => setEditPkgForm(prev => ({ ...prev, sessionsRemaining: e.target.value }))}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                onClick={() => handleSaveSameDayPkgEdit(pkg.id)}
                                className="h-7 text-xs font-bold bg-primary text-primary-foreground"
                              >
                                Save &amp; Log 24h Edit
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Inline Transfer Package Panel */}
                        {isTransferringThisPkg && (
                          <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                                Transfer &ldquo;{pkg.packageName}&rdquo; to Another Member
                              </span>
                              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setTransferPkgId(null)}>Cancel</Button>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <Input
                                placeholder="Enter target Member ID (e.g. 1652), Phone, or Exact Name..."
                                value={transferTargetQuery}
                                onChange={e => setTransferTargetQuery(e.target.value)}
                                className="h-8 text-xs bg-background flex-1"
                              />
                              <Button
                                size="sm"
                                disabled={isTransferringPkg}
                                onClick={() => handleExecutePackageTransfer(pkg.id)}
                                className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                              >
                                {isTransferringPkg ? 'Transferring...' : 'Confirm Package Transfer'}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Per-Package Actions Bar: Upgrade, Renew, Transfer, <24h Edit, Accounting Confirm */}
                        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border">
                          <Button
                            size="sm"
                            onClick={() => handleUpgradeClick(pkg.packageName)}
                            className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-7"
                          >
                            <TrendingUp className="h-3.5 w-3.5 mr-1" /> Upgrade
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (setRenewDialogClientId && setRenewPkgName && setRenewStartDate) {
                                setRenewDialogClientId(client.id);
                                setRenewPkgName(pkg.packageName);
                                setRenewStartDate(format(new Date(), 'yyyy-MM-dd'));
                              } else {
                                handleUpgradeClick(pkg.packageName);
                              }
                            }}
                            className="text-xs h-7 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 font-bold"
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Renew
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTransferPkgId(isTransferringThisPkg ? null : pkg.id);
                              setTransferTargetQuery('');
                            }}
                            className="text-xs h-7 border-indigo-500/40 text-indigo-600 hover:bg-indigo-500/10 font-bold"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transfer
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!editState.canSameDayEdit}
                            onClick={() => {
                              setEditingPkgId(isEditingThisPkg ? null : pkg.id);
                              setPkgSearchFilter('');
                              setEditPkgForm({
                                packageName: pkg.packageName || '',
                                startDate: String(pkg.startDate || '').slice(0, 10),
                                endDate: String(pkg.endDate || '').slice(0, 10),
                                sessionsRemaining: String(pkg.sessionsRemaining ?? ''),
                              });
                            }}
                            className="text-xs h-7 font-bold"
                            title={editState.canSameDayEdit ? 'Edit package within 24h creation window' : 'Locked: Packages cannot be changed after 24 hours from creation'}
                          >
                            {editState.canSameDayEdit ? (
                              <><Edit3 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Edit Package (&lt;24h)</>
                            ) : (
                              <><Lock className="h-3.5 w-3.5 mr-1 text-amber-500" /> Locked (&gt;24h)</>
                            )}
                          </Button>
                          {(['admin', 'manager', 'super_admin', 'crm_admin'].includes(currentUser?.role || '')) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleFinanceConfirmPkg(pkg.id, !editState.isFinanceConfirmed)}
                              className="text-xs h-7 text-muted-foreground hover:text-foreground ml-auto"
                            >
                              <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                              {editState.isFinanceConfirmed ? 'Unlock Accounting' : 'Confirm Accounting (Lock Edit)'}
                            </Button>
                          )}
                          {canAdjustDates && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 text-amber-600"
                              onClick={() => setAdjustPkgId(pkg.id)}
                            >
                              <CalendarClock className="h-3.5 w-3.5 mr-1" /> Admin Date Override
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Consolidated Guest Invitations (Package Quota) & Unlimited Member Referrals Inside Packages Tab */}
            <div className="pt-6 border-t border-border space-y-5">
              <div>
                <h3 className="text-sm font-bold uppercase text-primary">Guest Pass Invitations &amp; Member Referrals</h3>
                <p className="text-xs text-muted-foreground">
                  Manage package-quota Guest Passes and submit unlimited friend/family Referrals directly inside the Packages tab.
                </p>
              </div>

              {(() => {
                const primaryPkg = (client.packages || []).find(p => !isSecondaryPackageItem(p) && p.status === 'Active') || (client.packages || [])[0] || { packageName: client.packageType };
                const b = resolvePackageBenefits(primaryPkg);
                const memberReferrals: any[] = Array.isArray((client as any).referrals) ? (client as any).referrals : [];
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    {/* Card 1: Package Quota Guest Invitations */}
                    <div className="border border-border rounded-xl p-5 bg-muted/10 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                            <Gift className="h-4 w-4" /> Guest Pass Invitations (Package Quota)
                          </span>
                          <Badge variant="outline" className="font-mono text-xs font-bold bg-primary/10 text-primary border-primary/30">
                            {b.invUsed} / {b.invTotal} Used ({b.invRem} Left)
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Consumes 1 pass from the member&apos;s Primary Package guest invitation allowance ({primaryPkg?.packageName || client.packageType || 'Active Package'}).
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                        <span className="text-muted-foreground">
                          Referred By: <strong className="text-foreground">{client.referredByName || client.referredBy || 'Direct / Walk-in'}</strong>
                        </span>
                        <span className="font-mono font-bold text-primary">
                          Remaining: {b.invRem} Pass(es)
                        </span>
                      </div>
                    </div>

                    {/* Card 2: Unlimited Member Referrals */}
                    <div className="border border-emerald-500/30 rounded-xl p-5 bg-emerald-500/5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4" /> Unlimited Member Referrals
                          </span>
                          <Badge className="bg-emerald-600 text-white text-xs font-bold">
                            ∞ Unlimited ({memberReferrals.length} Referred)
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Add unlimited friend/family referrals for Sales follow-up without consuming any package guest passes.
                        </p>
                      </div>

                      {showAddReferralForm ? (
                        <div className="space-y-2.5 pt-2 border-t border-emerald-500/20">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input
                              placeholder="Friend's Full Name *"
                              value={referralName}
                              onChange={e => setReferralName(e.target.value)}
                              className="h-8 text-xs bg-background"
                            />
                            <Input
                              placeholder="Phone Number *"
                              value={referralPhone}
                              onChange={e => setReferralPhone(e.target.value)}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                          <Input
                            placeholder="Notes (optional, e.g., interested in 3 Months + PT)"
                            value={referralNotes}
                            onChange={e => setReferralNotes(e.target.value)}
                            className="h-8 text-xs bg-background"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowAddReferralForm(false)}
                              className="h-7 text-xs"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              disabled={isSubmittingReferral}
                              onClick={handleAddUnlimitedReferral}
                              className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {isSubmittingReferral ? 'Saving...' : 'Save Referral Lead'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between pt-2 border-t border-emerald-500/20">
                          <div className="text-[11px] text-muted-foreground truncate max-w-[60%]">
                            {memberReferrals.length > 0
                              ? `Latest: ${memberReferrals[0].name} (${memberReferrals[0].phone})`
                              : 'No referrals submitted yet.'}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => setShowAddReferralForm(true)}
                            className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Referral
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Member Referrals Table */}
              {Array.isArray((client as any).referrals) && (client as any).referrals.length > 0 && (
                <div className="space-y-2.5 text-left">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      Member Referrals Submitted ({(client as any).referrals.length})
                    </h4>
                    <span className="text-[11px] text-muted-foreground">
                      Each referral automatically creates a deduplicated Lead profile in the Sales Leads pipeline
                    </span>
                  </div>
                  <div className="rounded-xl border border-emerald-500/25 bg-background overflow-hidden">
                    <Table>
                      <TableHeader className="bg-emerald-500/5 border-b border-border">
                        <TableRow>
                          <TableHead className="text-[10px] uppercase font-bold py-2.5 px-4 w-12">#</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold py-2.5 px-4">Referred Friend Name</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold py-2.5 px-4">Phone Number</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold py-2.5 px-4">Notes</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold py-2.5 px-4">Submitted By</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold py-2.5 px-4">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(client as any).referrals.map((refItem: any, idx: number) => (
                          <TableRow key={refItem.id || idx} className="border-b border-border/50 hover:bg-muted/30">
                            <TableCell className="py-2.5 px-4 text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="py-2.5 px-4 text-xs font-bold text-foreground">
                              {refItem.name}
                              <Badge className="ml-2 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px]">
                                Lead Profile Created
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2.5 px-4 text-xs font-mono text-muted-foreground">{refItem.phone}</TableCell>
                            <TableCell className="py-2.5 px-4 text-xs text-muted-foreground">{refItem.notes || '—'}</TableCell>
                            <TableCell className="py-2.5 px-4 text-xs text-muted-foreground">{refItem.createdBy || 'Staff'}</TableCell>
                            <TableCell className="py-2.5 px-4 text-xs text-muted-foreground">{safeFormatDate(refItem.createdAt, 'dd MMM yyyy HH:mm')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Full Guest Invitations & Visitor Check-in Table */}
              <MemberGuestInvitationsTab client={client} />
            </div>
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold uppercase text-primary">Financial Accounts / Payments</h3>
                <Badge variant="secondary" className="border-none">
                  {clientPayments.length} entries
                </Badge>
              </div>
              <Button
                size="sm"
                onClick={handleAddPackageClick}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Record Payment / Package
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-background overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20 border-b border-border">
                  <TableRow>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Date</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Amount</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Method</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Sales Rep</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientPayments.length > 0 ? (
                    [...clientPayments]
                      .sort((a, b) => (toValidDate(b.created_at)?.getTime() || 0) - (toValidDate(a.created_at)?.getTime() || 0))
                      .map(p => (
                        <TableRow key={p.id} className="hover:bg-muted/50 border-b border-border/50 transition-colors">
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">{safeFormatDate(p.created_at, 'dd MMM yyyy HH:mm')}</TableCell>
                          <TableCell className="py-3 px-4 text-xs font-bold text-emerald-500">{p.amount} LE</TableCell>
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">{p.method}</TableCell>
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">
                            {users.find(u => u.id === p.sales_rep_id)?.name || 'unassigned'}
                          </TableCell>
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">
                            {p.recordedBy || 'System'}
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        No financial records found for this member.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {activeTab === 'activities' && (
          <div className="space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-sm font-bold uppercase text-primary">Activity & Check-in History</h3>
              <Badge variant="secondary" className="border-none">
                {clientAttendances.length} entries
              </Badge>
            </div>

            <div className="rounded-xl border border-border bg-background overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20 border-b border-border">
                  <TableRow>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Check-In Date & Time</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Check-Out</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Package / Activity</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Locker</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Checked In By</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientAttendances.length > 0 ? (
                    [...clientAttendances]
                      .sort((a, b) => (toValidDate(b.date)?.getTime() || 0) - (toValidDate(a.date)?.getTime() || 0))
                      .map(a => (
                        <TableRow key={a.id} className="hover:bg-muted/50 border-b border-border/50 transition-colors">
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground font-mono">{safeFormatDate(a.date, 'dd MMM yyyy HH:mm:ss')}</TableCell>
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground font-mono">{a.checkOutTime || '—'}</TableCell>
                          <TableCell className="py-3 px-4 text-xs font-semibold text-foreground">{a.packageName || 'Attendance Check-in'}</TableCell>
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">{a.locker && !a.locker.endsWith(' 0') ? a.locker : '—'}</TableCell>
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">{a.recordedByName || 'Front Desk'}</TableCell>
                          <TableCell className="py-3 px-4 text-center">
                            <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px]">
                              {a.status || 'Checked In'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                        No activity records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {activeTab === 'freezing' && (
          <div className="space-y-6 text-left">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase text-primary">Package Freezing Management</h3>
                <p className="text-xs text-muted-foreground">
                  Apply freeze to pause an active package and extend its expiration date, or unfreeze a package currently on hold.
                </p>
              </div>
              <Badge className="bg-cyan-600 text-white font-bold text-xs">
                {Number((client as any).freezeDaysRemaining ?? (client as any).freezeAllowanceDays ?? 30)} Freeze Days Balance
              </Badge>
            </div>

            {/* Active Packages Freeze Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Apply Freeze Form */}
              <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-950 dark:text-cyan-100 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-cyan-600" /> Apply Package Freeze
                </h4>

                <div className="space-y-2">
                  <div>
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Freeze Type</Label>
                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      {(['Normal', 'Back', 'Medical'] as const)
                        .filter(ft => ft === 'Normal' || isSalesManagerUser(currentUser) || isGeneralManagerOrCEO(currentUser) || isFitnessManagerUser(currentUser))
                        .map(ft => (
                          <button
                            key={ft}
                            type="button"
                            onClick={() => setFreezeType(ft)}
                            className={`h-8 rounded border text-[11px] font-bold transition-colors ${
                              freezeType === ft
                                ? 'bg-cyan-600 text-white border-cyan-600'
                                : 'bg-background text-muted-foreground border-input hover:text-foreground'
                            }`}
                          >
                            {ft === 'Normal' ? '❄️ Normal' : ft === 'Back' ? '⏪ Back Freeze' : '🏥 Medical'}
                          </button>
                        ))}
                    </div>
                    {freezeType === 'Back' && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                        Retroactive (Back) Freeze: compensates past missed days and extends package expiry.
                      </p>
                    )}
                    {freezeType === 'Medical' && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                        Medical Freeze: extends package expiry without deducting from normal freeze balance.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Select Package to Freeze</Label>
                    <select
                      value={freezePkgId}
                      onChange={e => setFreezePkgId(e.target.value)}
                      className="h-8 w-full rounded border border-input bg-background px-2 text-xs mt-1"
                    >
                      <option value="">-- Choose Active Package --</option>
                      {(client.packages || [])
                        .filter(p => p.status === 'Active' && (!isFitnessManagerUser(currentUser) || isGeneralManagerOrCEO(currentUser) || isSecondaryPackageItem(p)))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.packageName} (Expires: {safeFormatDate(p.endDate, 'dd MMM yyyy')})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground">Freeze Start Date</Label>
                      <Input
                        type="date"
                        value={freezeStartDate}
                        onChange={e => setFreezeStartDate(e.target.value)}
                        className="h-8 text-xs bg-background mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground">Freeze End Date</Label>
                      <Input
                        type="date"
                        value={freezeEndDate}
                        onChange={e => setFreezeEndDate(e.target.value)}
                        className="h-8 text-xs bg-background mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Reason / Note (Optional)</Label>
                    <Input
                      placeholder="e.g. Travel, medical, exams..."
                      value={freezeReason}
                      onChange={e => setFreezeReason(e.target.value)}
                      className="h-8 text-xs bg-background mt-1"
                    />
                  </div>

                  <Button
                    size="sm"
                    disabled={isApplyingFreeze || !freezePkgId || !freezeEndDate}
                    onClick={() => handleApplyPackageFreeze()}
                    className="w-full h-8 text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white mt-1"
                  >
                    {isApplyingFreeze ? 'Applying Freeze...' : '❄️ Confirm Package Freeze'}
                  </Button>
                </div>
              </div>

              {/* Card 2: Packages Currently on Hold */}
              <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> Packages Currently on Hold
                </h4>

                {(() => {
                  const onHoldPkgs = (client.packages || []).filter(p => p.status === 'Hold' || (p as any).isOnHold);
                  if (onHoldPkgs.length === 0) {
                    return (
                      <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                        No packages currently on hold for this member.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {onHoldPkgs.map(hp => (
                        <div key={hp.id} className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-xs text-foreground block">{hp.packageName}</span>
                            <span className="text-[10px] text-amber-700 dark:text-amber-400 block">
                              Frozen on {safeFormatDate((hp as any).holdDate || (hp as any).updatedAt, 'dd MMM yyyy')}
                            </span>
                            {(hp as any).holdReason && (
                              <span className="text-[10px] text-muted-foreground block italic">
                                &ldquo;{(hp as any).holdReason}&rdquo;
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleUnfreezePackageDirect(hp.id)}
                            className="h-7 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            Unfreeze
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Historical Freezing Logs */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Historical Freezing Activity</h4>
              {(() => {
                const logs: any[] = Array.isArray((client as any).freezeLogs) ? (client as any).freezeLogs : [];
                if (logs.length === 0) {
                  return (
                    <div className="bg-muted/5 p-6 rounded-xl border border-dashed border-border text-center text-muted-foreground text-xs">
                      No past freezing logs recorded for this member.
                    </div>
                  );
                }

                return (
                  <div className="rounded-xl border border-border overflow-hidden bg-background">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground text-[10px] uppercase bg-muted/40 font-bold">
                          <th className="p-2.5">Package</th>
                          <th className="p-2.5">Freeze Window</th>
                          <th className="p-2.5">Days</th>
                          <th className="p-2.5">Reason</th>
                          <th className="p-2.5">Staff</th>
                          <th className="p-2.5">Date Logged</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log, idx) => (
                          <tr key={idx} className="border-b border-border/40 last:border-0 hover:bg-muted/10">
                            <td className="p-2.5 font-bold text-foreground">{log.packageName || 'Membership'}</td>
                            <td className="p-2.5 font-mono text-[11px]">
                              {safeFormatDate(log.startDate, 'dd MMM yyyy')} → {safeFormatDate(log.endDate, 'dd MMM yyyy')}
                            </td>
                            <td className="p-2.5 font-bold text-cyan-600">{log.days}d</td>
                            <td className="p-2.5 text-muted-foreground">{log.reason || '—'}</td>
                            <td className="p-2.5 text-muted-foreground">{log.appliedBy || 'Staff'}</td>
                            <td className="p-2.5 text-muted-foreground text-[10px]">{safeFormatDate(log.appliedAt, 'dd MMM yyyy HH:mm')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3">Uploaded Documents</h3>
            <MemberDocumentUploader client={client} onUpdateClient={onUpdateClient} />
          </div>
        )}

        {activeTab === 'others' && (
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3">Other Information</h3>
            <div className="bg-muted/5 p-6 rounded-xl border border-border space-y-3 text-xs">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Barcode/Card ID:</span>
                <span className="font-bold text-foreground">{client.barcode || client.cardId || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Emergency Contact:</span>
                <span className="font-bold text-foreground">{client.emergencyContactName || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Advertising Source:</span>
                <span className="font-bold text-foreground">{client.advertisingSource || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lead Source:</span>
                <span className="font-bold text-foreground">{client.source || '—'}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3">Comments & Notes Timeline</h3>
            <div className="flex gap-2">
              <Textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="text-xs min-h-[60px]"
              />
              <Button
                onClick={handleAddComment}
                disabled={isSavingComment || !newComment.trim()}
                className="bg-primary text-primary-foreground font-bold text-xs h-auto"
              >
                {isSavingComment ? '...' : 'Add'}
              </Button>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {client.comments && client.comments.length > 0 ? (
                [...client.comments].reverse().map((c, i) => (
                  <div key={c.id || i} className="bg-muted/10 border border-border rounded-lg p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-foreground">#{client.comments!.length - i} — {c.author}</span>
                      <span className="text-[10px] text-muted-foreground">{safeFormatDate(c.date, 'dd MMM yyyy HH:mm')}</span>
                    </div>
                    <p className="text-xs text-foreground/80">{c.text}</p>
                  </div>
                ))
              ) : (
                <div className="bg-muted/5 p-8 rounded-xl border border-dashed border-border text-center text-muted-foreground text-xs">
                  No comments recorded.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'transfers' && (
          <div className="space-y-6 text-left">
            <div>
              <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3 mb-3">Sales Rep Transfer History</h3>
              <div className="rounded-xl border border-border bg-background overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/20 border-b border-border">
                    <TableRow>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">#</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">From Sales</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">To Sales</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created By</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesTransfers.length > 0 ? salesTransfers.map((t, i) => (
                      <TableRow key={t.id} className="hover:bg-muted/50 border-b border-border/50">
                        <TableCell className="py-3 px-4 text-xs">{i + 1}</TableCell>
                        <TableCell className="py-3 px-4 text-xs">{t.fromSalesName}</TableCell>
                        <TableCell className="py-3 px-4 text-xs font-bold text-foreground">{t.toSalesName}</TableCell>
                        <TableCell className="py-3 px-4 text-xs text-muted-foreground">{t.createdByName || t.createdBy}</TableCell>
                        <TableCell className="py-3 px-4 text-xs text-muted-foreground">{safeFormatDate(t.createdAt, 'yyyy-MM-dd HH:mm')}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No sales transfer records.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3 mb-3">Trainer Transfer History</h3>
              <div className="rounded-xl border border-border bg-background overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/20 border-b border-border">
                    <TableRow>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">#</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">From Trainer</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">To Trainer</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created By</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainerTransfers.length > 0 ? trainerTransfers.map((t, i) => (
                      <TableRow key={t.id} className="hover:bg-muted/50 border-b border-border/50">
                        <TableCell className="py-3 px-4 text-xs">{i + 1}</TableCell>
                        <TableCell className="py-3 px-4 text-xs">{t.fromTrainerName}</TableCell>
                        <TableCell className="py-3 px-4 text-xs font-bold text-foreground">{t.toTrainerName}</TableCell>
                        <TableCell className="py-3 px-4 text-xs text-muted-foreground">{t.createdByName || t.createdBy}</TableCell>
                        <TableCell className="py-3 px-4 text-xs text-muted-foreground">{safeFormatDate(t.createdAt, 'yyyy-MM-dd HH:mm')}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No trainer transfer records.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'entitlements' && (
          <div className="space-y-6 text-left">
            <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3 mb-3">Booking Entitlements</h3>
            <EntitlementManager memberId={client.id} />
          </div>
        )}
      </div>

      <AdjustPackageDatesDialog
        pkg={adjustPkg}
        onOpenChange={(open) => { if (!open) setAdjustPkgId(null); }}
        onConfirm={async (startIso, endIso, reason) => {
          if (!adjustPkg) return;
          const updated = (client.packages || []).map(p => p.id === adjustPkg.id ? { ...p, startDate: startIso, endDate: endIso } : p);
          await onUpdateClient(client.id, buildPackageUpdates(updated) as Partial<Client>);
          await addAuditLog('ADJUSTMENT', 'PACKAGE_RECORD', client.id,
            `Adjusted "${adjustPkg.packageName}" dates from ${adjustPkg.startDate || '—'} → ${adjustPkg.endDate || '—'} to ${startIso} → ${endIso}`,
            currentUser?.name, { reason });
          toast.success('Package dates updated.');
        }}
      />

      <ConfirmDialog
        isOpen={!!deletePkg}
        onOpenChange={(open) => { if (!open) setDeletePkgId(null); }}
        title="Delete Package"
        description={`Are you sure you want to permanently delete "${deletePkg?.packageName || 'this package'}"? This action cannot be undone.`}
        variant="destructive"
        confirmText="Yes, Delete"
        onConfirm={async () => {
          if (!deletePkg) return;
          try {
            const updated = (client.packages || []).filter(p => p.id !== deletePkg.id);
            await onUpdateClient(client.id, buildPackageUpdates(updated) as Partial<Client>);
            await addAuditLog('DELETE', 'PACKAGE_RECORD', client.id, `Deleted package "${deletePkg.packageName}" from ${client.name}`, currentUser?.name);
            toast.success('Package deleted.');
          } catch (err) {
            console.error('[InzanMemberShow] Failed to delete package:', err);
            toast.error('Failed to delete package.');
          } finally {
            setDeletePkgId(null);
          }
        }}
      />
    </div>
  );
}
