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
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { safeFormatDate, safeGetAge, toValidDate } from '../utils/dateUtils';
import { Textarea } from '@/components/ui/textarea';
import { db, storage } from '../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, query, where, onSnapshot, addDoc, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { SalesTransferLog, TrainerTransferLog } from '../types';
import { toast } from 'sonner';
import { MessageSquare, ArrowRightLeft, Heart, Stethoscope, Clock, Palette, ArrowLeft, Gift, Sparkles, ShieldCheck, Edit3, RefreshCw } from 'lucide-react';
import { compressImage } from '../utils/imageUtils';
import EntitlementManager from './EntitlementManager';
import { AdjustPackageDatesDialog, canOverridePackageDates, buildPackageUpdates } from './AdjustPackageDatesDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { addAuditLog } from '../services/auditService';
import { canReassignMemberSalesRep } from '../utils/permissions';
import { Trash2, CalendarClock, TrendingUp } from 'lucide-react';
import { MemberGuestInvitationsTab } from './member/MemberGuestInvitationsTab';
import { MemberDocumentUploader } from './member/MemberDocumentUploader';
import { isFieldLockedForUser, sanitizeMemberProfileUpdates } from '../utils/memberProfileLocking';

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
  const canAdjustDates = canOverridePackageDates(currentUser);
  const [adjustPkgId, setAdjustPkgId] = useState<string | null>(null);
  const [deletePkgId, setDeletePkgId] = useState<string | null>(null);
  const isLeadAccount = (client.status || '').toLowerCase().trim() === 'lead';
  const adjustPkg = adjustPkgId ? (client.packages || []).find(p => p.id === adjustPkgId) ?? null : null;
  const deletePkg = deletePkgId ? (client.packages || []).find(p => p.id === deletePkgId) ?? null : null;
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Client>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Unlimited Referrals state (Overview quick-action)
  const [showAddReferralForm, setShowAddReferralForm] = useState(false);
  const [referralName, setReferralName] = useState('');
  const [referralPhone, setReferralPhone] = useState('');
  const [referralNotes, setReferralNotes] = useState('');
  const [isSubmittingReferral, setIsSubmittingReferral] = useState(false);

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

    const freezeTotal = Number(pb.freezeAllowanceDays ?? pkg?.freezeAllowanceDays ?? catB.freezeAllowanceDays ?? catalogMatch?.freezeAllowanceDays ?? cb.freezeAllowanceDays ?? rawClient.freezeAllowanceDays ?? 0);
    const freezeUsed = Number(pb.freezeDaysUsed ?? pkg?.freezeDaysUsed ?? cb.freezeDaysUsed ?? rawClient.freezeDaysUsed ?? 0);
    const invTotal = Number(pb.guestInvitations ?? pkg?.guestInvitations ?? catB.guestInvitations ?? catalogMatch?.guestInvitations ?? cb.guestInvitations ?? rawClient.guestInvitations ?? 0);
    const invUsed = Number(pb.invitationsUsed ?? pkg?.invitationsUsed ?? cb.invitationsUsed ?? rawClient.invitationsUsed ?? 0);
    const freePtTotal = Number(pb.freePtSessions ?? pkg?.freePtSessions ?? catB.freePtSessions ?? catalogMatch?.freePtSessions ?? cb.freePtSessions ?? rawClient.freePtSessions ?? rawClient.freePtSessionsTotal ?? 0);
    const freePtUsed = Number(pb.freePtSessionsUsed ?? pkg?.freePtSessionsUsed ?? cb.freePtSessionsUsed ?? rawClient.freePtSessionsUsed ?? 0);
    const classTotal = Number(pb.freeClassTrials ?? pkg?.freeClassTrials ?? catB.freeClassTrials ?? catalogMatch?.freeClassTrials ?? cb.freeClassTrials ?? rawClient.freeClassTrials ?? rawClient.freeClassTrialsTotal ?? 0);
    const classUsed = Number(pb.classTrialsUsed ?? pkg?.classTrialsUsed ?? pkg?.freeClassTrialsUsed ?? cb.classTrialsUsed ?? rawClient.freeClassTrialsUsed ?? 0);

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
      const nowIso = new Date().toISOString();
      const newRefEntry = {
        id: `ref_${Date.now()}`,
        name: referralName.trim(),
        phone: referralPhone.trim(),
        notes: referralNotes.trim(),
        referredByClientId: client.id,
        referredByMemberId: client.memberId || client.id,
        referredByName: client.name,
        createdAt: nowIso,
        createdBy: currentUser?.name || 'Staff',
      };
      // 1. Add to leads collection so sales team can follow up
      await addDoc(collection(db, 'leads'), {
        name: referralName.trim(),
        phone: referralPhone.trim(),
        notes: referralNotes.trim() ? `Member Referral from ${client.name} (#${client.memberId || client.id}): ${referralNotes.trim()}` : `Referred by member ${client.name} (#${client.memberId || client.id})`,
        source: 'Member Referral',
        referredBy: client.id,
        referredByName: client.name,
        status: 'New',
        branch: client.branch || currentUser?.branch || 'Inzan Athletics',
        createdAt: nowIso,
      });
      // 2. Append to member's unlimited referrals list on client doc
      const existingRefs = Array.isArray((client as any).referrals) ? (client as any).referrals : [];
      await onUpdateClient(client.id, {
        referrals: [newRefEntry, ...existingRefs],
      } as any);
      setReferralName('');
      setReferralPhone('');
      setReferralNotes('');
      setShowAddReferralForm(false);
      toast.success(`Referral "${newRefEntry.name}" added (Unlimited Referrals — 0 guest quota used)!`);
    } catch (err) {
      console.error('Failed to add referral:', err);
      toast.error('Failed to save referral.');
    } finally {
      setIsSubmittingReferral(false);
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
          startDate: client.joinDate || nowIso.slice(0, 10),
          endDate: client.expiryDate || nowIso.slice(0, 10),
          sessionsTotal: client.totalSessions || 'unlimited',
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
          (c.phone && c.phone.replace(/\D/g, '').includes(qTerm.replace(/\D/g, '')) && qTerm.replace(/\D/g, '').length >= 6) ||
          (c.name && c.name.toLowerCase() === qTerm)
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

  // Fetch sales transfer logs
  React.useEffect(() => {
    const q = query(collection(db, 'salesTransferLogs'), where('clientId', '==', client.id), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setSalesTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as SalesTransferLog)));
    }, () => setSalesTransfers([]));
    return unsub;
  }, [client.id]);

  // Fetch trainer transfer logs
  React.useEffect(() => {
    const q2 = query(collection(db, 'trainerTransferLogs'), where('clientId', '==', client.id), orderBy('createdAt', 'desc'));
    const unsub2 = onSnapshot(q2, snap => {
      setTrainerTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as TrainerTransferLog)));
    }, () => setTrainerTransfers([]));
    return unsub2;
  }, [client.id]);

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
      const updates = sanitizeMemberProfileUpdates(rawUpdates, client, currentUser);
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
  const clientAttendances = attendances.filter(a => a.clientId === client.id);

  // Helper for displaying fields
  const renderField = (
    label: string, 
    value: string | number | undefined | null, 
    fieldKey?: keyof Client, 
    type: 'text' | 'select' | 'number' | 'date' = 'text',
    options?: { value: string; label: string }[],
    disabled?: boolean
  ) => {
    const isDisabled = disabled !== undefined ? disabled : (fieldKey ? isFieldLockedForUser(fieldKey, currentUser, client) : false);
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

    return (
      <div className="text-left border-b border-border pb-1.5">
        <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">{label}</span>
        <span className="text-xs font-semibold text-foreground">{value || '—'}</span>
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
              { id: 'member_data', label: 'Overview (User Details)' },
              { id: 'package_data', label: 'Packages & Invites' },
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
                {client.phone} · {client.branch || 'No branch'} ·{' '}
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
              className="h-8 bg-indigo-600 hover:bg-indigo-700 border-indigo-500 text-white font-bold text-xs"
              onClick={() => {
                const cleanNum = client.phone.replace(/\D/g, '');
                window.open(`https://wa.me/${cleanNum.startsWith('0') ? '20' + cleanNum.substring(1) : cleanNum}`, '_blank');
              }}
            >
              Staff Whatsapp
            </Button>
          </div>
        </div>

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
                  startDate: client.startDate || client.joinDate,
                  endDate: client.membershipExpiry || client.expiryDate,
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

          const primaryExpiry = primaryPkg?.endDate || client.membershipExpiry || client.expiryDate;
          const daysToRenew = getDaysRemainingToRenew(primaryExpiry);
          const b = resolvePackageBenefits(primaryPkg || allPkgs[0] || {});

          const paidPtTotal = Number(rawC.paidPtSessionsTotal ?? activeSecondaryPkg?.totalSessions ?? (activeSecondaryPkg as any)?.sessionsTotal ?? 0);
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
                  <p className="text-xs text-muted-foreground mt-0.5">{client.phone}</p>
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
                  {renderField('Member Name', client.name, 'name', 'text', undefined, isFieldLockedForUser('name', currentUser, client))}
                  {renderField('Username', client.memberId, 'legacyNotes', 'text', undefined, isFieldLockedForUser('legacyNotes', currentUser, client))}
                  {renderField('Mobile', client.phone, 'phone', 'text', undefined, isFieldLockedForUser('phone', currentUser, client))}
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
                      startDate: client.joinDate || client.startDate || '',
                      endDate: client.expiryDate || client.membershipExpiry || '',
                      sessionsTotal: client.totalSessions || 'unlimited',
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

                        {/* Resolved Package Benefits Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-border">
                          <div className="p-2.5 rounded-lg border border-border bg-background/70">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground block">Freeze Allowance</span>
                            <span className="text-sm font-black text-foreground">
                              {b.freezeUsed} / {b.freezeTotal} Days
                            </span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                              {b.freezeRem} days remaining
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg border border-border bg-background/70">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground block">Guest Invitations</span>
                            <span className="text-sm font-black text-foreground">
                              {b.invUsed} / {b.invTotal} Passes
                            </span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                              {b.invRem} passes remaining
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg border border-border bg-background/70">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground block">Free PT Sessions</span>
                            <span className="text-sm font-black text-foreground">
                              {b.freePtUsed} / {b.freePtTotal} Sessions
                            </span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                              {b.freePtRem} free PT remaining
                            </span>
                          </div>
                          <div className="p-2.5 rounded-lg border border-border bg-background/70">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground block">Free Class Trials</span>
                            <span className="text-sm font-black text-foreground">
                              {b.classUsed} / {b.classTotal} Classes
                            </span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                              {b.classRem} classes remaining
                            </span>
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
                          {(currentUser?.role === 'Admin' || currentUser?.role === 'Manager') && (
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
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Timestamp</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Activity / Class</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientAttendances.length > 0 ? (
                    [...clientAttendances]
                      .sort((a, b) => (toValidDate(b.date)?.getTime() || 0) - (toValidDate(a.date)?.getTime() || 0))
                      .map(a => (
                        <TableRow key={a.id} className="hover:bg-muted/50 border-b border-border/50 transition-colors">
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">{safeFormatDate(a.date, 'dd MMM yyyy HH:mm:ss')}</TableCell>
                          <TableCell className="py-3 px-4 text-xs font-semibold text-foreground">{a.packageName || 'Attendance Check-in'}</TableCell>
                          <TableCell className="py-3 px-4 text-center">
                            <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px]">
                              Success
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
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
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3">Freezing Logs</h3>
            <div className="bg-muted/5 p-8 rounded-xl border border-dashed border-border text-center text-muted-foreground text-xs">
              No active or historical package freezing requests recorded.
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
