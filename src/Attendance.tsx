import { useEffect, useState, useRef, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useAppContext } from './context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Camera, 
  CheckCircle, 
  User, 
  History, 
  AlertCircle, 
  MapPin, 
  Scan, 
  XCircle, 
  Printer, 
  Check, 
  Calendar, 
  AlertTriangle, 
  Clock,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  RotateCcw,
  Search,
  CheckCheck,
  X,
  Phone,
  FileSpreadsheet,
  Globe,
  CalendarDays,
  ExternalLink,
  MessageCircle,
  ShieldAlert,
  Unlock,
  CreditCard,
  MessageSquare,
  Users,
  QrCode,
  Ticket,
  Briefcase
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { 
  safeFormatDate, 
  safeFormatTime, 
  toValidDate, 
  toSafeIsoDateTime, 
  safeFormatDistanceToNow 
} from './utils/dateUtils';
import { Branch } from './types';
import { useLanguage } from './contexts/LanguageContext';
import { db, getTenantId, auth } from './firebase';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ShiftHandoverDialog } from './components/ShiftHandoverDialog';
import { AttendanceReconciliationModal } from './components/attendance/AttendanceReconciliationModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toCanonicalBranchId } from './utils/memberCategories';
import { toast } from 'sonner';
import {
  parseUniversalQrCode,
  evaluateCheckinGatekeeper,
  computeLiveFloorOccupancy,
  CheckinLookupMode,
  CheckinGatekeeperEvaluation,
  WrongEntryLogRecord,
} from './utils/universalQr';
import { getCachedDeviceFingerprint } from './utils/deviceFingerprint';
import { checkPhoneSimilarityForCandidate, maskEgyptianPhone } from './utils/phoneSimilarity';
import {
  evaluateTurnstileGateAccess,
  triggerTurnstileRelay,
  TurnstileHardwareConfig,
  TurnstileGateDecision,
  DEFAULT_TURNSTILE_CONFIG,
} from './utils/turnstileGateBridge';

export default function Attendance({ isKiosk = false }: { isKiosk?: boolean }) {
  const {
    currentUser,
    users,
    setActiveTab,
    setActiveClientId,
    branches,
    ptPackageRecords,
    branding,
    features,
    clients,
    payments,
    packages,
    addClient,
    updateClient,
    attendances,
    recordAttendance,
  } = useAppContext();
  const isInzan = getTenantId() === 'inzanathletics' || features?.shiftHandover === true || features?.commercialGymWorkspaces === true;
  const [isShiftHandoverOpen, setIsShiftHandoverOpen] = useState(false);
  const [isTurnstileConfigOpen, setIsTurnstileConfigOpen] = useState(false);
  const [turnstileEval, setTurnstileEval] = useState<TurnstileGateDecision | null>(null);
  const [turnstileConfig, setTurnstileConfig] = useState<TurnstileHardwareConfig>(() => {
    try {
      const saved = localStorage.getItem('turnstile_gate_config');
      if (saved) return { ...DEFAULT_TURNSTILE_CONFIG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_TURNSTILE_CONFIG;
  });
  const [isGuestInviteOpen, setIsGuestInviteOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const { t, language, isRtl } = useLanguage();

  const [classes, setClasses] = useState<any[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'classSchedules'));
    const unsub = onSnapshot(q, (snap) => {
      setClasses(snap.docs.map(doc => {
        const data = doc.data();
        const dateStr = data.date || (data.startTime ? data.startTime.substring(0, 10) : '');
        const timeStr = data.time || (data.startTime && data.endTime 
          ? `${data.startTime.substring(11, 16)} - ${data.endTime.substring(11, 16)}` 
          : '10:00 - 11:15');

        return {
          ...data,
          id: doc.id,
          date: dateStr,
          time: timeStr
        };
      }));
    });
    return () => unsub();
  }, []);

  // ─── DAILY ATTENDANCE & HISTORICAL RECONCILIATION STATE ───
  const cairoTodayStr = useMemo(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }), []);
  const [rosterDate, setRosterDate] = useState<string>(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }));
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<string>('all');
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [searchScope, setSearchScope] = useState<'day' | 'all'>('day');
  const [showLowCreditsOnly, setShowLowCreditsOnly] = useState<boolean>(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddSessionId, setQuickAddSessionId] = useState('');
  const [quickAddMemberId, setQuickAddMemberId] = useState('');
  const [quickAddSearch, setQuickAddSearch] = useState('');
  const [actionLoadingAttendeeId, setActionLoadingAttendeeId] = useState<string | null>(null);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);

  const handlePrevDay = () => {
    try {
      const d = toValidDate(rosterDate) || new Date();
      const prev = new Date(d.getTime() - 24 * 60 * 60 * 1000);
      setRosterDate(format(prev, 'yyyy-MM-dd'));
      setSelectedSessionFilter('all');
    } catch {
      setRosterDate(cairoTodayStr);
    }
  };

  const handleNextDay = () => {
    try {
      const d = toValidDate(rosterDate) || new Date();
      const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      setRosterDate(format(next, 'yyyy-MM-dd'));
      setSelectedSessionFilter('all');
    } catch {
      setRosterDate(cairoTodayStr);
    }
  };

  const handleToday = () => {
    setRosterDate(cairoTodayStr);
    setSelectedSessionFilter('all');
  };

  const classesOnSelectedDate = useMemo(() => {
    return classes.filter(c => c.date === rosterDate);
  }, [classes, rosterDate]);

  const availableQuickAddClasses = useMemo(() => {
    if (classesOnSelectedDate.length > 0) return classesOnSelectedDate;
    return [...classes].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 30);
  }, [classes, classesOnSelectedDate]);

  const dailyRoster = useMemo(() => {
    const isGlobal = searchScope === 'all';

    // 1. Get check-ins for the active scope
    const scopedCheckins = attendances.filter(a => {
      if (!a.date) return false;
      if (isGlobal) return true;
      try {
        const checkinCairoDate = new Date(a.date).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
        return checkinCairoDate === rosterDate;
      } catch {
        return false;
      }
    });

    // Map by clientId to see if they checked in
    const checkinMap = new Map<string, typeof scopedCheckins[0]>();
    scopedCheckins.forEach(c => {
      if (c.clientId) checkinMap.set(c.clientId, c);
      if ((c as any).memberId) checkinMap.set((c as any).memberId, c);
      if (c.sessionId && c.clientId) checkinMap.set(`${c.sessionId}_${c.clientId}`, c);
    });

    // 2. Sourced from classes
    const classAttendees: any[] = [];
    classes.forEach(cls => {
      if (!isGlobal && cls.date !== rosterDate) return;
      if (selectedSessionFilter !== 'all' && cls.id !== selectedSessionFilter) return;

      const attendees = cls.attendees || [];
      attendees.forEach((clientId: string) => {
        const client = clients.find(c => c.id === clientId || c.memberId === clientId);
        const matchedIds = [clientId, client?.id, client?.memberId, client?.portalUserId].filter(Boolean) as string[];
        const isCheckedIn = (cls.checkedIn || []).some((id: string) => matchedIds.includes(String(id))) ||
                            matchedIds.some(id => checkinMap.has(id));
        const isNoShow = !isCheckedIn && (cls.noShows || []).some((id: string) => matchedIds.includes(String(id)));
        const checkinRecord = matchedIds.map(id => checkinMap.get(id)).find(Boolean) || checkinMap.get(`${cls.id}_${clientId}`);

        const sessionsRemaining = client?.sessionsRemaining ?? (client as any)?.activePackage?.creditsLeft;
        const packageType = client?.packageType || client?.memberCategory || (client?.packages?.[0]?.packageName) || '';

        classAttendees.push({
          clientId,
          client,
          memberId: client?.memberId || '—',
          name: client?.name || 'Member',
          phone: client?.phone || '',
          sessionsRemaining,
          packageType,
          slot: `${cls.name} (${cls.time})`,
          sessionId: cls.id,
          sessionTitle: cls.name,
          sessionTime: cls.time,
          sessionDate: cls.date,
          branch: cls.branch,
          checkedIn: isCheckedIn,
          isNoShow,
          checkinTime: checkinRecord?.date || (isCheckedIn ? toSafeIsoDateTime(cls.date, cls.time) : undefined),
          type: 'Class'
        });
      });
    });

    // 3. Sourced from private PT sessions
    const ptAttendees: any[] = [];
    ptPackageRecords.forEach(session => {
      if (!isGlobal && session.date !== rosterDate) return;
      if (session.status === 'Cancelled') return;
      if (selectedSessionFilter !== 'all' && selectedSessionFilter !== 'pt') return;

      const client = clients.find(c => c.id === session.clientId || c.memberId === session.clientId);
      if (client) {
        const matchedIds = [session.clientId, client.id, client.memberId].filter(Boolean) as string[];
        const isSessionAttended = session.status === 'Attended';
        const hasCheckin = matchedIds.some(id => checkinMap.has(id)) || isSessionAttended;
        const isNoShow = session.status === 'No Show';

        const sessionsRemaining = client.sessionsRemaining ?? (client as any)?.activePackage?.creditsLeft;
        const packageType = client.packageType || client.memberCategory || 'Personal Training';

        ptAttendees.push({
          clientId: session.clientId,
          client,
          memberId: client.memberId || '—',
          name: client.name,
          phone: client.phone || '',
          sessionsRemaining,
          packageType,
          slot: `PT Session (${(session as any).time || safeFormatTime(session.date, 'h:mm a', '10:00 AM')})`,
          sessionId: session.id,
          sessionTitle: 'PT Session',
          sessionTime: (session as any).time || '10:00',
          sessionDate: session.date,
          branch: session.branch || '',
          checkedIn: hasCheckin,
          isNoShow,
          checkinTime: session.status === 'Attended' ? session.date : matchedIds.map(id => checkinMap.get(id)?.date).find(Boolean),
          type: 'PT'
        });
      }
    });

    // 4. Sourced from checkins not in classes/sessions (e.g. walk-ins)
    const walkins: any[] = [];
    if (selectedSessionFilter === 'all') {
      scopedCheckins.forEach(checkin => {
        const alreadyIncluded = classAttendees.some(x => x.clientId === checkin.clientId && (!isGlobal || x.sessionDate === checkin.date)) || 
                                ptAttendees.some(x => x.clientId === checkin.clientId && (!isGlobal || x.sessionDate === checkin.date));
        if (!alreadyIncluded) {
          const client = clients.find(c => c.id === checkin.clientId || c.memberId === checkin.clientId);
          if (client) {
            const checkinDateOnly = checkin.date ? checkin.date.substring(0, 10) : rosterDate;
            const sessionsRemaining = client.sessionsRemaining ?? (client as any)?.activePackage?.creditsLeft;
            const packageType = client.packageType || client.memberCategory || 'Walk-in Member';

            walkins.push({
              clientId: checkin.clientId,
              client,
              memberId: client.memberId || '—',
              name: client.name,
              phone: client.phone || '',
              sessionsRemaining,
              packageType,
              slot: `Walk-in (${safeFormatTime(checkin.date, 'h:mm a', 'Walk-in')})`,
              sessionId: '',
              sessionTitle: 'Walk-in',
              sessionTime: '',
              sessionDate: checkinDateOnly,
              branch: checkin.branch,
              checkedIn: true,
              isNoShow: false,
              checkinTime: checkin.date,
              type: 'Walk-in'
            });
          }
        }
      });
    }

    // Combine all list items and deduplicate
    const combined = [...classAttendees, ...ptAttendees, ...walkins];
    const uniqueMap = new Map<string, any>();
    combined.forEach(item => {
      const key = `${item.sessionId || 'none'}_${item.sessionDate || 'nodate'}_${item.clientId}`;
      const existing = uniqueMap.get(key);
      if (!existing) {
        uniqueMap.set(key, item);
      } else {
        if (existing.type === 'Walk-in' && item.type !== 'Walk-in') {
          uniqueMap.set(key, item);
        }
      }
    });

    let result = Array.from(uniqueMap.values());

    // Search filter across multiple fields
    if (rosterSearch.trim()) {
      const q = rosterSearch.toLowerCase().trim();
      result = result.filter(item => 
        item.name.toLowerCase().includes(q) ||
        String(item.memberId).toLowerCase().includes(q) ||
        item.phone.includes(q) ||
        item.slot.toLowerCase().includes(q) ||
        (item.sessionDate && item.sessionDate.includes(q)) ||
        (item.branch && item.branch.toLowerCase().includes(q)) ||
        (item.packageType && item.packageType.toLowerCase().includes(q))
      );
    }

    // Low credits filter
    if (showLowCreditsOnly) {
      result = result.filter(item => item.sessionsRemaining !== undefined && item.sessionsRemaining !== null && item.sessionsRemaining !== '—' && Number(item.sessionsRemaining) <= 2);
    }

    // Sort order
    if (isGlobal) {
      result.sort((a, b) => {
        const timeB = toValidDate(b.sessionDate)?.getTime() || 0;
        const timeA = toValidDate(a.sessionDate)?.getTime() || 0;
        return timeB - timeA;
      });
    } else {
      result.sort((a, b) => (a.sessionTime || '').localeCompare(b.sessionTime || ''));
    }

    return result;
  }, [attendances, classes, ptPackageRecords, clients, rosterDate, selectedSessionFilter, rosterSearch, searchScope, showLowCreditsOnly]);

  // ─── RETROACTIVE & LIVE CHECK-IN HANDLERS ───
  const handleCheckInRosterItem = async (item: any) => {
    setActionLoadingAttendeeId(item.clientId);
    try {
      const client = clients.find(c => c.id === item.clientId || c.memberId === item.clientId);
      const targetClientId = client?.id || item.clientId;
      const matchedIds = [item.clientId, client?.id, client?.memberId, client?.portalUserId].filter(Boolean) as string[];

      if (item.type === 'Class' && item.sessionId) {
        const classRef = doc(db, 'classSchedules', item.sessionId);
        const cls = classes.find(c => c.id === item.sessionId);
        const filteredNoShows = (cls?.noShows || []).filter((id: string) => !matchedIds.includes(String(id)));
        const nextCheckedIn = Array.from(new Set([...(cls?.checkedIn || []), item.clientId]));

        await updateDoc(classRef, {
          checkedIn: nextCheckedIn,
          noShows: filteredNoShows
        });

        // Compute backdated timestamp safely
        const effectiveCheckInTime = toSafeIsoDateTime(item.sessionDate || rosterDate, item.sessionTime);

        // Update classBookings under all matching keys
        for (const id of matchedIds) {
          const bookingDocRef = doc(db, 'classBookings', `${item.sessionId}_${id}`);
          await updateDoc(bookingDocRef, {
            status: 'attended',
            checkedInAt: effectiveCheckInTime,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }

        // Forgive no-show strike if penalized
        if (client && typeof client.noShowStrikes === 'number' && client.noShowStrikes > 0) {
          const clientRef = doc(db, 'clients', client.id);
          const newStrikes = Math.max(0, client.noShowStrikes - 1);
          await updateDoc(clientRef, {
            noShowStrikes: newStrikes,
            strikes: newStrikes,
            ...(newStrikes < 3 ? { bookingBlockedUntil: null } : {}),
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }

        // Call server checkin endpoint for audit trail
        try {
          const token = await auth.currentUser?.getIdToken();
          await fetch('/api/v1/attendance/check-in', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              memberId: targetClientId,
              clientId: targetClientId,
              sessionId: item.sessionId,
              sessionTitle: item.sessionTitle,
              branchId: toCanonicalBranchId(item.branch || selectedBranch),
              branchName: item.branch || selectedBranch,
              sessionDate: item.sessionDate || rosterDate,
              sessionTime: item.sessionTime,
              status: 'ATTENDED',
              checkedInBy: currentUser?.name || currentUser?.email || 'Staff',
              deductCredit: false
            })
          });
        } catch {}

        toast.success(`Checked in ${item.name} for ${item.slot}`);
      } else if (item.type === 'PT' && item.sessionId) {
        const ptRef = doc(db, 'sessions', item.sessionId);
        await updateDoc(ptRef, {
          status: 'Attended',
          attendedAt: new Date().toISOString()
        });
        toast.success(`Checked in ${item.name} for ${item.slot}`);
      }
    } catch (err: any) {
      console.error("Error checking in roster item:", err);
      toast.error(err?.message || "Failed to check in member");
    } finally {
      setActionLoadingAttendeeId(null);
    }
  };

  const handleUndoCheckIn = async (item: any) => {
    setActionLoadingAttendeeId(item.clientId);
    try {
      const client = clients.find(c => c.id === item.clientId || c.memberId === item.clientId);
      const matchedIds = [item.clientId, client?.id, client?.memberId, client?.portalUserId].filter(Boolean) as string[];

      if (item.type === 'Class' && item.sessionId) {
        const classRef = doc(db, 'classSchedules', item.sessionId);
        const cls = classes.find(c => c.id === item.sessionId);
        const filteredCheckedIn = (cls?.checkedIn || []).filter((id: string) => !matchedIds.includes(String(id)));

        await updateDoc(classRef, {
          checkedIn: filteredCheckedIn
        });

        for (const id of matchedIds) {
          const bookingDocRef = doc(db, 'classBookings', `${item.sessionId}_${id}`);
          await updateDoc(bookingDocRef, {
            status: 'booked',
            checkedInAt: null,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }
        toast.info(`Undone check-in for ${item.name}`);
      }
    } catch (err: any) {
      console.error("Error undoing check-in:", err);
      toast.error("Failed to undo check-in");
    } finally {
      setActionLoadingAttendeeId(null);
    }
  };

  const handleBatchCheckInRemaining = async () => {
    const uncheked = dailyRoster.filter(item => !item.checkedIn && item.type === 'Class' && item.sessionId);
    if (uncheked.length === 0) {
      toast.info("All members on the roster are already checked in!");
      return;
    }
    const confirmed = window.confirm(`Check in all ${uncheked.length} remaining members for this date/class?`);
    if (!confirmed) return;

    setActionLoadingAttendeeId('batch-checkin');
    try {
      for (const item of uncheked) {
        await handleCheckInRosterItem(item);
      }
      toast.success(`Successfully checked in all ${uncheked.length} members!`);
    } catch (err: any) {
      console.error("Error during batch check-in:", err);
      toast.error("Some members could not be checked in");
    } finally {
      setActionLoadingAttendeeId(null);
    }
  };

  const handleQuickAddMember = async () => {
    if (!quickAddSessionId || !quickAddMemberId) {
      toast.error("Please select a session or walk-in, and a member.");
      return;
    }
    const client = clients.find(c => c.id === quickAddMemberId || c.memberId === quickAddMemberId);
    if (!client) {
      toast.error("Member not found.");
      return;
    }

    setActionLoadingAttendeeId('quick-add');
    try {
      if (quickAddSessionId === 'walkin_general') {
        const effectiveCheckInTime = toSafeIsoDateTime(rosterDate, '12:00 PM');
        const attendanceDocRef = doc(collection(db, 'attendances'));
        await setDoc(attendanceDocRef, {
          id: attendanceDocRef.id,
          clientId: client.id,
          memberName: client.name,
          memberId: client.memberId || '',
          date: effectiveCheckInTime,
          branch: selectedBranch || 'Main Studio',
          recordedBy: currentUser?.id || 'staff',
          recordedByName: currentUser?.name || 'Staff',
          type: 'Walk-In',
          checkInType: 'RETROACTIVE',
          notes: `Backdated general gym attendance for ${rosterDate}`,
          createdAt: new Date().toISOString()
        });

        // Decrement credit if member is on package-based pass
        const clientAny = client as any;
        if (clientAny.activePackage && typeof clientAny.activePackage.creditsLeft === 'number' && clientAny.activePackage.creditsLeft > 0) {
          const clientRef = doc(db, 'clients', client.id);
          const newCredits = Math.max(0, clientAny.activePackage.creditsLeft - 1);
          await updateDoc(clientRef, {
            'activePackage.creditsLeft': newCredits,
            sessionsRemaining: newCredits,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        } else if (typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0) {
          const clientRef = doc(db, 'clients', client.id);
          const newCredits = Math.max(0, client.sessionsRemaining - 1);
          await updateDoc(clientRef, {
            sessionsRemaining: newCredits,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }

        toast.success(`Backdated check-in recorded for ${client.name} on ${rosterDate}!`);
        setIsQuickAddOpen(false);
        setQuickAddMemberId('');
        setQuickAddSearch('');
        return;
      }

      const targetClass = classes.find(c => c.id === quickAddSessionId);
      if (!targetClass) {
        toast.error("Selected session not found.");
        return;
      }

      const classRef = doc(db, 'classSchedules', quickAddSessionId);
      const nextAttendees = Array.from(new Set([...(targetClass.attendees || []), client.id]));
      const nextCheckedIn = Array.from(new Set([...(targetClass.checkedIn || []), client.id]));
      const filteredNoShows = (targetClass.noShows || []).filter((id: string) => id !== client.id && id !== client.memberId);

      await updateDoc(classRef, {
        attendees: nextAttendees,
        checkedIn: nextCheckedIn,
        noShows: filteredNoShows
      });

      // Backdated timestamp safely constructed
      const effectiveCheckInTime = toSafeIsoDateTime(targetClass.date || rosterDate, targetClass.time);

      // Set booking doc
      const bookingDocRef = doc(db, 'classBookings', `${targetClass.id}_${client.id}`);
      await setDoc(bookingDocRef, {
        classId: targetClass.id,
        className: targetClass.name,
        classDate: targetClass.date,
        classTime: targetClass.time,
        branch: targetClass.branch || '',
        clientId: client.id,
        memberId: client.memberId || '',
        memberName: client.name,
        memberPhone: client.phone || '',
        status: 'attended',
        checkedInAt: effectiveCheckInTime,
        staffOverride: true,
        admittedBy: currentUser?.name || 'Staff',
        bookedAt: effectiveCheckInTime,
        createdAt: new Date().toISOString()
      }, { merge: true });

      // Call retroactive-checkin endpoint for atomic credit check & audit logging
      try {
        const token = await auth.currentUser?.getIdToken();
        await fetch(`/api/v1/sessions/${targetClass.id}/attendance/retroactive-checkin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            memberId: client.id,
            sessionId: targetClass.id,
            reason: `Staff quick-add to past session (${targetClass.date || rosterDate})`,
            forceEnroll: true
          })
        });
      } catch {}

      toast.success(`${client.name} added to ${targetClass.name} and checked in!`);
      setIsQuickAddOpen(false);
      setQuickAddMemberId('');
      setQuickAddSearch('');
    } catch (err: any) {
      console.error("Error quick adding member:", err);
      toast.error(err?.message || "Failed to add member to session");
    } finally {
      setActionLoadingAttendeeId(null);
    }
  };
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch>(() => {
    if (isKiosk) {
      const saved = localStorage.getItem('kioskBranch');
      if (saved) return saved as Branch;
    }
    return '' as Branch;
  });

  useEffect(() => {
    if (!selectedBranch && branches.length > 0) {
      setSelectedBranch(branches[0] || '');
    }
  }, [branches, selectedBranch]);
  const [lastScannedMember, setLastScannedMember] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lookupMode, setLookupMode] = useState<CheckinLookupMode>('member_id');
  const [gatekeeperEval, setGatekeeperEval] = useState<CheckinGatekeeperEvaluation | null>(null);
  const [selectedPackageName, setSelectedPackageName] = useState<string>('');
  const [checkedOutClientIds, setCheckedOutClientIds] = useState<Set<string>>(() => new Set());
  const [wrongEntryLogs, setWrongEntryLogs] = useState<WrongEntryLogRecord[]>(() => {
    try {
      const todayKey = 'mitrixo_wrong_entries_' + new Date().toISOString().slice(0, 10);
      const saved = localStorage.getItem(todayKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const stationFingerprint = useMemo(() => getCachedDeviceFingerprint(), []);

  const floorOccupancy = useMemo(
    () => computeLiveFloorOccupancy(attendances, clients, selectedBranch, checkedOutClientIds),
    [attendances, clients, selectedBranch, checkedOutClientIds]
  );

  const appendWrongEntryLog = (entry: Omit<WrongEntryLogRecord, 'id' | 'timestamp' | 'stationFingerprint'>) => {
    const newRecord: WrongEntryLogRecord = {
      ...entry,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      stationFingerprint: stationFingerprint.fingerprintId,
    };
    setWrongEntryLogs((prev) => {
      const next = [newRecord, ...prev].slice(0, 50);
      try {
        const todayKey = 'mitrixo_wrong_entries_' + new Date().toISOString().slice(0, 10);
        localStorage.setItem(todayKey, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  const handleAutoCheckOutFloor = () => {
    setCheckedOutClientIds(new Set(floorOccupancy.activeClientIds));
  };

  const [kioskOverlay, setKioskOverlay] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
    subText?: string;
  }>({
    show: false,
    type: 'success',
    title: '',
    message: ''
  });

  const checkMemberStatus = (member: any) => {
    const isArabic = language === 'ar';
    if (member.membershipExpiry) {
      const expiry = new Date(member.membershipExpiry);
      if (expiry < new Date()) {
        const dateStr = expiry.toLocaleDateString(isArabic ? 'ar-EG' : 'en-GB');
        return { 
          valid: false, 
          reason: 'Expired', 
          message: isArabic 
            ? `انتهت صلاحية اشتراكك في ${dateStr}. يرجى التجديد عند الاستقبال.` 
            : `Membership expired on ${dateStr}. Please renew with staff.` 
        };
      }
    }
    if (member.status === 'Expired') {
      return { 
        valid: false, 
        reason: 'Expired', 
        message: isArabic 
          ? 'عضويتك منتهية الصلاحية. يرجى التجديد عند الاستقبال.' 
          : 'Membership is expired. Please renew with staff.' 
      };
    }
    if (member.status === 'Hold') {
      return { 
        valid: false, 
        reason: 'Hold', 
        message: isArabic 
          ? 'عضويتك معلقة مؤقتاً.' 
          : 'Membership is currently on hold.' 
      };
    }
    if (typeof member.sessionsRemaining === 'number' && member.sessionsRemaining <= 0) {
      return { 
        valid: false, 
        reason: 'No Sessions', 
        message: isArabic 
          ? 'نفدت جميع الجلسات المتبقية لديك. يرجى إعادة الشحن عند الاستقبال.' 
          : 'No sessions remaining. Please renew your membership with staff.' 
      };
    }
    return { 
      valid: true, 
      reason: 'Active', 
      message: isArabic 
        ? `مرحباً بك، ${member.name}!` 
        : `Welcome, ${member.name}!` 
    };
  };

  const handleBreakFreezeAndCheckin = async () => {
    if (!lastScannedMember || isRecording) return;
    setIsRecording(true);
    setError(null);
    try {
      const updatedPackages = (lastScannedMember.packages || []).map((pkg: any) =>
        pkg.status === 'Hold' || pkg.isOnHold
          ? { ...pkg, status: 'Active', isOnHold: false, holdReason: undefined }
          : pkg
      );
      await updateClient(lastScannedMember.id, {
        status: 'Active',
        packages: updatedPackages,
      });
      await recordAttendance(lastScannedMember.id, selectedBranch);
      setSuccessMessage(`Freeze cancelled & check-in recorded for ${lastScannedMember.name}`);
      setGatekeeperEval(null);
      setTimeout(() => {
        setLastScannedMember(null);
        setSuccessMessage(null);
      }, 3000);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to break freeze and record attendance');
    } finally {
      setIsRecording(false);
    }
  };

  const handleScanSuccess = async (decodedId: string) => {
    const isArabic = language === 'ar';
    setError(null);

    const parsedQr = parseUniversalQrCode(decodedId);
    const lookupToken = parsedQr.tokenOrMemberId;
    if (!lookupToken) return;

    const member = clients.find(
      (c) =>
        c.id === lookupToken ||
        c.memberId === lookupToken ||
        c.phone === lookupToken ||
        c.barcode === lookupToken ||
        c.cardId === lookupToken ||
        c.guestSerial === lookupToken
    );
    if (!member) {
      appendWrongEntryLog({
        memberId: lookupToken,
        clientName: parsedQr.isUniversal ? `Universal QR (${parsedQr.originHost})` : 'Unknown Member',
        branch: selectedBranch || 'MAIN',
        lookupMode: parsedQr.isUniversal ? 'qr_code' : lookupMode,
        reasonCode: 'NOT_FOUND',
        reasonMessage: 'Member ID, QR token, or Invitation serial not found in directory.',
      });
      if (isKiosk) {
        setKioskOverlay({
          show: true,
          type: 'error',
          title: isArabic ? 'لم يتم العثور على العضو' : 'Member Not Found',
          message: isArabic 
            ? 'الرمز المدخل غير مسجل لدينا. يرجى مراجعة موظف الاستقبال.' 
            : 'Member ID or phone not found. Please see reception desk.'
        });
        setIsScanning(false);
        setTimeout(() => {
          setKioskOverlay(prev => ({ ...prev, show: false }));
          if (manualInputRef.current) manualInputRef.current.value = '';
          setIsScanning(true);
        }, 3000);
      } else {
        setError(t('attendance.no_member_found'));
      }
      return;
    }

    const evaluation = evaluateCheckinGatekeeper(member, payments || []);
    const turnstileAccess = evaluateTurnstileGateAccess({
      member,
      payments: payments || [],
      cataloguePackages: packages || [],
      config: turnstileConfig,
    });
    setGatekeeperEval(evaluation);
    setTurnstileEval(turnstileAccess);
    setSelectedPackageName(
      evaluation.activePackages[0]?.packageName || member.packageType || ''
    );

    if ((!evaluation.allowed && evaluation.denialReasonCode && evaluation.denialMessage) || !turnstileAccess.allowRelayOpen) {
      appendWrongEntryLog({
        memberId: member.memberId || member.id,
        clientName: member.name,
        clientId: member.id,
        branch: selectedBranch || 'MAIN',
        lookupMode: parsedQr.isUniversal ? 'qr_code' : lookupMode,
        reasonCode: evaluation.denialReasonCode || (turnstileAccess.reasonCode as any) || 'EXPIRED',
        reasonMessage: !turnstileAccess.allowRelayOpen ? turnstileAccess.messageEn : (evaluation.denialMessage || 'Blocked'),
      });
    }

    if (isKiosk) {
      setIsScanning(false);
      const statusCheck = checkMemberStatus(member);
      if (statusCheck.valid && evaluation.allowed && turnstileAccess.allowRelayOpen) {
        setIsRecording(true);
        try {
          await recordAttendance(member.id, selectedBranch);
          if (turnstileConfig.enabled) {
            triggerTurnstileRelay(turnstileConfig, turnstileAccess, member).catch(() => {});
          }
          setKioskOverlay({
            show: true,
            type: 'success',
            title: isArabic ? 'تم تسجيل حضورك' : 'Check-in Recorded',
            message: isArabic ? turnstileAccess.messageAr : turnstileAccess.messageEn,
            subText: member.packageType ? `${isArabic ? 'الباقة:' : 'Package:'} ${member.packageType}` : ''
          });
        } catch (err: any) {
          setKioskOverlay({
            show: true,
            type: 'error',
            title: isArabic ? 'خطأ في تسجيل الحضور' : 'System Error',
            message: err instanceof Error ? err.message : 'Error recording check-in'
          });
        } finally {
          setIsRecording(false);
        }
      } else {
        setKioskOverlay({
          show: true,
          type: statusCheck.reason === 'Hold' || evaluation.isFrozen ? 'warning' : 'error',
          title: statusCheck.reason === 'Hold' || evaluation.isFrozen
            ? (isArabic ? 'حسابك معلق' : 'Membership on Hold') 
            : (isArabic ? 'تم رفض الدخول' : 'Entry Blocked'),
          message: isArabic
            ? (!turnstileAccess.allowRelayOpen ? turnstileAccess.messageAr : (evaluation.denialMessage || statusCheck.message))
            : (!turnstileAccess.allowRelayOpen ? turnstileAccess.messageEn : (evaluation.denialMessage || statusCheck.message))
        });
      }

      setTimeout(() => {
        setKioskOverlay(prev => ({ ...prev, show: false }));
        if (manualInputRef.current) manualInputRef.current.value = '';
        setIsScanning(true);
      }, 3000);

    } else {
      // Front-desk admin checkin flow with 6-stage gatekeeper + Turnstile Bridge rules
      setLastScannedMember(member);
      setIsScanning(false);
      setError(null);
      setSuccessMessage(null);
      setIsGuestInviteOpen(lookupMode === 'invitation_id');

      if (!evaluation.allowed || !turnstileAccess.allowRelayOpen) {
        setError(
          !turnstileAccess.allowRelayOpen
            ? `${turnstileAccess.messageEn} (${turnstileAccess.messageAr})`
            : evaluation.denialMessage || 'Check-in blocked by membership gatekeeper.'
        );
        return;
      }

      if (evaluation.hasMultiplePackages || evaluation.hasOverdueDebt || evaluation.stickyNote || lookupMode === 'invitation_id') {
        // Hold member card open so reception sees the debt / sticky note / package choice / guest invite and confirms
        return;
      }

      setIsRecording(true);
      try {
        await recordAttendance(member.id, selectedBranch);
        if (turnstileConfig.enabled) {
          triggerTurnstileRelay(turnstileConfig, turnstileAccess, member).catch(() => {});
        }
        setSuccessMessage(t('attendance.attendance_recorded').replace('{name}', member.name));
        setTimeout(() => {
          setLastScannedMember(null);
          setGatekeeperEval(null);
          setTurnstileEval(null);
          setSuccessMessage(null);
          if (manualInputRef.current) manualInputRef.current.value = '';
        }, 3000);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : t('attendance.failed_record_attendance'));
        setTimeout(() => {
          setLastScannedMember(null);
          setGatekeeperEval(null);
          setTurnstileEval(null);
          setError(null);
          if (manualInputRef.current) manualInputRef.current.value = '';
        }, 4000);
      } finally {
        setIsRecording(false);
      }
    }
  };

  const handleScanSuccessRef = useRef(handleScanSuccess);
  useEffect(() => {
    handleScanSuccessRef.current = handleScanSuccess;
  }, [handleScanSuccess, clients, selectedBranch, language]);

  // Press "/" anywhere to jump to the manual ID input (skip if already in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      manualInputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    // Expose native scan handler to window so WebView can inject results
    (window as any).handleNativeScan = (decodedText: string) => {
      if (handleScanSuccessRef.current) {
        handleScanSuccessRef.current(decodedText);
      }
    };
    return () => {
      delete (window as any).handleNativeScan;
    };
  }, []);

  useEffect(() => {
    if (!isScanning) return;

    // Check if running in Mobile App wrapper
    if ((window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'START_SCANNER' }));
      return () => {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'STOP_SCANNER' }));
      };
    }

    let isComponentMounted = true;
    let scannerStarted = false; // only true after .start() resolves — guards cleanup
    let scanner: Html5Qrcode | null = null;

    const config = {
      fps: 10,
      qrbox: (w: number, h: number) => {
        const side = Math.min(Math.floor(Math.min(w, h) * 0.7), 280);
        return { width: side, height: side };
      },
    };

    const onScan = (decodedText: string) => {
      if (isComponentMounted) handleScanSuccessRef.current(decodedText);
    };

    const safeDestroy = (s: Html5Qrcode | null) => {
      if (!s) return;
      // clear() removes internal DOM + cancels polling timers even when start() failed
      try { s.clear(); } catch { /* ignore if already destroyed */ }
    };

    // Delay 50 ms so React has committed #qr-reader to the DOM
    const timer = setTimeout(async () => {
      try {
        scanner = new Html5Qrcode('qr-reader', { verbose: false });
        scannerRef.current = scanner;

        try {
          // Prefer rear camera
          await scanner.start({ facingMode: 'environment' }, config, onScan, undefined);
        } catch (envErr: unknown) {
          const errName = (envErr as { name?: string })?.name ?? '';
          // Only retry on constraint errors (no rear cam). NotReadableError = hardware busy,
          // retrying won't help and reusing the same instance breaks internal state.
          if (errName === 'OverconstrainedError' || errName === 'NotFoundError') {
            safeDestroy(scanner);
            scanner = new Html5Qrcode('qr-reader', { verbose: false });
            scannerRef.current = scanner;
            await scanner.start({ facingMode: 'user' }, config, onScan, undefined);
          } else {
            throw envErr;
          }
        }

        scannerStarted = true;
      } catch (err: unknown) {
        console.error(err);
        // Always destroy to stop internal polling timers
        safeDestroy(scanner);
        scannerRef.current = null;
        scanner = null;

        if (!isComponentMounted) return;
        const name = (err as { name?: string })?.name ?? '';
        const msg  = (err as { message?: string })?.message ?? '';
        if (name === 'NotReadableError' || msg.includes('Could not start')) {
          setError(t('attendance.camera_in_use'));
        } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError(t('attendance.camera_permission_denied'));
        } else if (name === 'NotFoundError') {
          setError(t('attendance.no_camera_found'));
        } else {
          setError(t('attendance.could_not_start_camera'));
        }
        setIsScanning(false);
      }
    }, 50);

    return () => {
      isComponentMounted = false;
      clearTimeout(timer);
      if (scanner && scannerStarted) {
        // stop() then clear() for a clean teardown
        scanner.stop().catch(console.error).finally(() => safeDestroy(scanner));
      } else {
        // start() never succeeded — just destroy to cancel any stray timers
        safeDestroy(scanner);
      }
      scannerRef.current = null;
    };
  }, [isScanning, t]);

  const handleRecordAttendance = async () => {
    if (!lastScannedMember || isRecording) return;
    
    setIsRecording(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await recordAttendance(lastScannedMember.id, selectedBranch);
      if (turnstileConfig.enabled && turnstileEval) {
        triggerTurnstileRelay(turnstileConfig, turnstileEval, lastScannedMember).catch(() => {});
      }
      setSuccessMessage(t('attendance.attendance_recorded').replace('{name}', lastScannedMember.name));
      setTimeout(() => {
        setLastScannedMember(null);
        setTurnstileEval(null);
        setSuccessMessage(null);
      }, 3000);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : t('attendance.failed_record_attendance'));
    } finally {
      setIsRecording(false);
    }
  };

  const handleRedeemGuestInvitation = async () => {
    if (!lastScannedMember || isRecording) return;
    const trimmedName = guestName.trim();
    const trimmedPhone = guestPhone.trim();
    if (!trimmedName || !trimmedPhone) {
      setError('Please enter both the Guest Name and Guest Mobile Number.');
      return;
    }

    const totalInvites = Number((lastScannedMember as any).invitationsTotal ?? (lastScannedMember as any).guestInvitations ?? 3);
    const usedInvites = Number((lastScannedMember as any).invitationsUsed ?? 0);
    const curRemaining = typeof (lastScannedMember as any).guestInvitesRemaining === "number"
      ? (lastScannedMember as any).guestInvitesRemaining
      : typeof (lastScannedMember as any).invitationsRemaining === "number"
      ? (lastScannedMember as any).invitationsRemaining
      : Math.max(0, totalInvites - usedInvites);

    if (curRemaining <= 0) {
      setError(`${lastScannedMember.name} has 0 remaining invitation passes (${usedInvites}/${totalInvites} used).`);
      return;
    }

    setIsRecording(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const inviteSerial = `INV-${Date.now().toString().slice(-6)}`;
      const newUsed = usedInvites + 1;
      const newRemaining = Math.max(0, curRemaining - 1);
      await updateClient(lastScannedMember.id, {
        invitationsTotal: Math.max(totalInvites, newUsed + newRemaining),
        invitationsUsed: newUsed,
        invitationsRemaining: newRemaining,
        guestInvitesRemaining: newRemaining,
      } as any);

      // Record in guestInvites collection so it shows up in MemberInvites & MemberGuestInvitationsTab
      try {
        const { collection: fsCol, addDoc: fsAddDoc } = await import("firebase/firestore");
        await fsAddDoc(fsCol(db, "guestInvites"), {
          hostClientId: lastScannedMember.id,
          hostId: lastScannedMember.id,
          hostMemberId: (lastScannedMember as any).memberId || (lastScannedMember as any).legacyMemberId || "",
          hostName: lastScannedMember.name || "",
          guestName: trimmedName,
          guestPhone: trimmedPhone,
          inviteCode: inviteSerial,
          status: "Attended",
          attendedAt: new Date().toISOString(),
          attendanceDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          branch: selectedBranch || lastScannedMember.branch || "MAIN",
        });
      } catch (giErr) {
        console.warn("Could not record into guestInvites collection:", giErr);
      }

      // Auto-create a Sales Lead if phone does not already exist
      const existingLeadOrMember = clients.find((c) => c.phone === trimmedPhone);
      let guestClientId = existingLeadOrMember?.id;
      if (!guestClientId) {
        guestClientId = await addClient({
          id: '',
          name: trimmedName,
          phone: trimmedPhone,
          status: 'Lead',
          branch: selectedBranch || lastScannedMember.branch || branches[0] || 'MAIN',
          interest: 'Interested',
          category: 'None',
          source: 'Word Of Mouth',
          stage: 'Trial',
          advertisingSource: 'Member Invitation',
          invitedByType: 'Member',
          invitedById: lastScannedMember.id,
          referredByName: lastScannedMember.name,
          guestSerial: inviteSerial,
          trialDate: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
        });
      }

      await recordAttendance(lastScannedMember.id, selectedBranch);
      if (turnstileConfig.enabled && turnstileEval) {
        triggerTurnstileRelay(turnstileConfig, turnstileEval, lastScannedMember).catch(() => {});
      }
      setSuccessMessage(
        `Guest "${trimmedName}" checked in (Pass ${usedInvites + 1}/${totalInvites}) & added to Sales Leads!`
      );
      setGuestName('');
      setGuestPhone('');
      setIsGuestInviteOpen(false);
      setTimeout(() => {
        setLastScannedMember(null);
        setGatekeeperEval(null);
        setTurnstileEval(null);
        setSuccessMessage(null);
      }, 3500);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to redeem guest invitation pass');
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto px-1 sm:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 no-print">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{isInzan ? 'Check-in Desk' : t('attendance.title')}</h2>
          <p className="text-muted-foreground">{isInzan ? 'Scan member QR code or check in members for workouts and sessions' : t('attendance.subtitle')}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {!isKiosk && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTurnstileConfigOpen(true)}
                className="gap-1.5 font-medium border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                <Unlock className="w-4 h-4" />
                {turnstileConfig.enabled ? 'Turnstile: Online' : 'Turnstile Gate'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsShiftHandoverOpen(true)}
                className="gap-1.5 font-medium border-primary/30 hover:bg-primary/5"
              >
                <Clock className="w-4 h-4 text-primary" />
                Shift Handover
              </Button>
            </>
          )}

          <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg border">
            <MapPin className="h-4 w-4 text-muted-foreground mx-2" />
            <select 
              className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer pe-8"
              value={selectedBranch}
              onChange={(e) => {
                const branch = e.target.value as Branch;
                setSelectedBranch(branch);
                if (isKiosk) {
                  localStorage.setItem('kioskBranch', branch);
                }
              }}
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Live Floor Occupancy Banner (RedGITS v17.12 Parity) */}
      {isInzan && !isKiosk && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border bg-card shadow-sm no-print">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">
                Active Members Now: <span className="text-primary">{floorOccupancy.totalActive}</span>
              </span>
            </div>
            <Badge variant="secondary" className="text-xs font-semibold">
              Male: {floorOccupancy.male}
            </Badge>
            <Badge variant="secondary" className="text-xs font-semibold">
              Female: {floorOccupancy.female}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono opacity-75">
              {stationFingerprint.fingerprintId}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {checkedOutClientIds.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setCheckedOutClientIds(new Set())}
              >
                Restore ({checkedOutClientIds.size})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={handleAutoCheckOutFloor}
              disabled={floorOccupancy.totalActive === 0}
            >
              Auto Check-Out ({floorOccupancy.totalActive})
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 no-print">
        {/* Scanner Section */}
        <Card className="lg:col-span-7 overflow-hidden border-2 border-primary/10 shadow-lg">
          <CardHeader className="bg-primary/5 border-b">
            <CardTitle className="flex items-center text-primary text-lg">
              <Scan className="me-2 h-5 w-5" />
              {t('attendance.live_scanner')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 relative bg-black min-h-[300px] sm:min-h-[380px] flex items-center justify-center overflow-hidden">
            {isScanning ? (
              <>
                <div
                  id="qr-reader"
                  className="w-full min-h-[300px] sm:min-h-[380px]"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute bottom-4 right-4 z-10 shadow-lg"
                  onClick={() => setIsScanning(false)}
                >
                  {t('common.cancel')}
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-white space-y-4 p-6 sm:p-8 text-center w-full h-full min-h-[300px] sm:min-h-[380px]">
                <div className="bg-white/10 p-5 sm:p-6 rounded-full animate-pulse">
                  <Camera className="h-10 w-10 sm:h-12 sm:w-12" />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold">{t('attendance.ready_to_scan')}</h3>
                  <p className="text-white/60 text-xs sm:text-sm max-w-[280px] mt-2 mx-auto">
                    {(window as any).ReactNativeWebView 
                      ? 'Uses native device camera for faster scanning.' 
                      : t('attendance.point_camera')}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="bg-white text-black hover:bg-white/90 font-bold px-8 mt-2"
                  onClick={() => setIsScanning(true)}
                >
                  {t('attendance.start_camera')}
                </Button>
              </div>
            )}
          </CardContent>
          
          <div className="bg-muted/30 p-6 border-t space-y-3">
            {/* 4-Mode Lookup Selector (Member ID, Universal QR, Invitation ID, Service Member ID) */}
            {isInzan && !isKiosk && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {([
                  { id: 'member_id', label: 'Member ID', icon: User },
                  { id: 'qr_code', label: 'QR / Universal', icon: QrCode },
                  { id: 'invitation_id', label: 'Invitation ID', icon: Ticket },
                  { id: 'service_member_id', label: 'Service ID', icon: Briefcase },
                ] as const).map((mode) => {
                  const Icon = mode.icon;
                  const active = lookupMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setLookupMode(mode.id);
                        manualInputRef.current?.focus();
                      }}
                      className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        active
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground ml-1">
                {lookupMode === 'qr_code'
                  ? 'Scan QR or Universal Cross-Branch Token (UC|host|token)'
                  : lookupMode === 'invitation_id'
                  ? 'Enter Guest / Invitation Serial or Phone'
                  : lookupMode === 'service_member_id'
                  ? 'Enter Service / PT Member ID'
                  : t('attendance.manual_entry')}
              </Label>
              <div className="flex gap-2">
                <Input
                  ref={manualInputRef}
                  placeholder={
                    lookupMode === 'qr_code'
                      ? 'Scan QR or UC|branch|token...'
                      : lookupMode === 'invitation_id'
                      ? 'Enter Invitation Serial or Guest Phone...'
                      : t('attendance.enter_member_id')
                  }
                  className="bg-background h-11"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleScanSuccess(e.currentTarget.value);
                  }}
                />
                <Button 
                  variant="secondary" 
                  className="h-11 px-6 font-bold"
                  onClick={(e) => {
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    handleScanSuccess(input.value);
                  }}
                >
                  {t('attendance.find_member')}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic ml-1">
                {t('attendance.hint')}
              </p>
            </div>
          </div>
        </Card>

        {/* Member Info / Result Section */}
        <div className="lg:col-span-5 space-y-6">
          {error && (
            <div className="bg-red-600 border-2 border-red-700 text-white p-4 rounded-xl flex items-start gap-3 shadow-lg animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold uppercase tracking-wide">Gatekeeper Alert</p>
                <p className="text-sm font-medium text-white/95">{error}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="bg-green-600 border-2 border-green-700 text-white p-4 rounded-xl flex items-start gap-3 shadow-lg animate-in fade-in slide-in-from-top-2">
              <CheckCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold uppercase tracking-wide">Check-in Recorded</p>
                <p className="text-sm font-medium text-white/95">{successMessage}</p>
              </div>
            </div>
          )}

          {lastScannedMember ? (
            <Card className="border-2 border-green-500/20 shadow-xl animate-in zoom-in-95 duration-200">
              <CardHeader className="pb-2">
                <Badge
                  className={`w-fit mb-2 ${
                    gatekeeperEval && !gatekeeperEval.allowed
                      ? 'bg-destructive hover:bg-destructive/90'
                      : 'bg-green-500 hover:bg-green-600'
                  }`}
                >
                  {gatekeeperEval && !gatekeeperEval.allowed
                    ? `Blocked: ${gatekeeperEval.denialReasonCode}`
                    : t('attendance.scan_successful')}
                </Badge>
                <CardTitle className="text-2xl">{lastScannedMember.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stage 1: Multi-Package Selector */}
                {gatekeeperEval?.hasMultiplePackages && (
                  <div className="p-3 rounded-xl border bg-muted/40 space-y-2">
                    <Label className="text-xs font-bold uppercase text-primary">
                      Select Active Package for Check-In ({gatekeeperEval.activePackages.length})
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {gatekeeperEval.activePackages.map((pkg) => (
                        <button
                          key={pkg.id || pkg.packageName}
                          type="button"
                          onClick={() => setSelectedPackageName(pkg.packageName)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                            selectedPackageName === pkg.packageName
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background border-border hover:border-primary/50'
                          }`}
                        >
                          {pkg.packageName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stage 2: Freeze Interception with 1-Click Break Freeze */}
                {gatekeeperEval?.isFrozen && (
                  <div className="bg-blue-600/10 border-2 border-blue-500/40 text-blue-700 dark:text-blue-300 p-3.5 rounded-xl space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <Unlock className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wide">
                          Membership Frozen / On Hold
                        </p>
                        <p className="text-xs mt-0.5">
                          {gatekeeperEval.freezeReason
                            ? `Reason: ${gatekeeperEval.freezeReason}`
                            : 'This member is currently in a freeze window.'}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
                      onClick={handleBreakFreezeAndCheckin}
                      disabled={isRecording}
                    >
                      <Unlock className="h-4 w-4" />
                      Break / Cancel Freeze & Check In Now
                    </Button>
                  </div>
                )}

                {/* Stage 3: Overdue Installment / Debt Alert */}
                {gatekeeperEval?.hasOverdueDebt && (
                  <div className="bg-rose-500/10 border-2 border-rose-500/40 text-rose-700 dark:text-rose-300 p-3.5 rounded-xl flex items-center justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <CreditCard className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wide">
                          Member Must Pay Installment / Debt
                        </p>
                        <p className="text-xs font-bold mt-0.5">
                          Remaining Balance: LE {gatekeeperEval.unpaidAmount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-rose-500/50 text-rose-700 dark:text-rose-300 text-xs font-bold shrink-0"
                      onClick={() => setActiveTab('debtors')}
                    >
                      Pay Debt
                    </Button>
                  </div>
                )}

                {/* Stage 4: Sticky Reception Note */}
                {gatekeeperEval?.stickyNote && (
                  <div className="bg-amber-500/10 border border-amber-500/40 text-amber-800 dark:text-amber-200 p-3 rounded-xl flex items-start gap-2.5">
                    <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-bold uppercase block">Front-Desk Note:</span>
                      <span>{gatekeeperEval.stickyNote}</span>
                    </div>
                  </div>
                )}

                {(lastScannedMember.status === 'Nearly Expired' || (typeof lastScannedMember.sessionsRemaining === 'number' && lastScannedMember.sessionsRemaining > 0 && lastScannedMember.sessionsRemaining <= 3)) && (
                  <div className="bg-amber-500 border-2 border-amber-600 text-white p-3 rounded-xl flex items-start gap-3 shadow">
                    <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wide">Nearly Expired</p>
                      <p className="text-sm font-medium text-white/95">
                        {lastScannedMember.status === 'Nearly Expired'
                          ? 'Membership is nearing its expiry date. Remind the member to renew.'
                          : `Only ${lastScannedMember.sessionsRemaining} sessions remaining. Remind the member to renew.`}
                      </p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t('attendance.member_id')}</Label>
                    <p className="font-mono text-sm">{lastScannedMember.memberId ? `#${lastScannedMember.memberId}` : '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t('attendance.status')}</Label>
                    <div>
                      <Badge variant={lastScannedMember.status === 'Active' ? 'secondary' : 'destructive'} className="text-[10px]">
                        {lastScannedMember.status === 'Active' ? t('members.tabs.active') : lastScannedMember.status === 'Hold' ? t('members.tabs.hold') : lastScannedMember.status === 'Expired' ? t('members.tabs.expired') : lastScannedMember.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t('attendance.package')}</Label>
                    <p className="text-sm font-medium truncate">{selectedPackageName || lastScannedMember.packageType || '-'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{t('attendance.packages_left')}</Label>
                    {lastScannedMember.sessionsRemaining === 'unlimited' ? (
                      <p className="text-lg font-bold text-emerald-600">∞ {t('attendance.unlimited')}</p>
                    ) : (
                      <p className={`text-lg font-bold ${Number(lastScannedMember.sessionsRemaining) <= 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {lastScannedMember.sessionsRemaining} {t('attendance.packages_unit')}
                      </p>
                    )}
                  </div>
                  {isInzan && (() => {
                    const m = lastScannedMember as any;
                    const daysLeft = typeof m.daysRemaining === 'number'
                      ? m.daysRemaining
                      : (m.membershipExpiry ? Math.max(0, Math.ceil((new Date(m.membershipExpiry).getTime() - Date.now()) / 86400000)) : 0);
                    const paidPtRem = Number(m.paidPtSessionsRemaining ?? Math.max(0, Number(m.paidPtSessionsTotal ?? 0) - Number(m.paidPtSessionsUsed ?? 0)));
                    const paidPtTot = Number(m.paidPtSessionsTotal ?? 0);

                    let rawFreePtTot = Number(m.freePtSessionsTotal ?? m.freePtSessions ?? (m as any).benefits?.freePtSessions ?? 0);
                    let rawInvTot = Number(m.invitationsTotal ?? (m as any).guestInvitations ?? (m as any).benefits?.guestInvitations ?? 0);
                    let rawFreezeTot = Number(m.freezeAllowanceDays ?? (m as any).benefits?.freezeAllowanceDays ?? 0);

                    // Redgits / DB zero-benefit fallback:
                    if (isInzan && rawFreezeTot === 0 && rawInvTot === 0 && rawFreePtTot === 0) {
                      const pkgStr = String(m.primaryPackageName || selectedPackageName || m.packageType || '').toLowerCase();
                      if (pkgStr.includes('12') || pkgStr.includes('year') || pkgStr.includes('annual') || pkgStr.includes('365')) {
                        rawFreezeTot = 30; rawInvTot = 10; rawFreePtTot = 2;
                      } else if (pkgStr.includes('6') || pkgStr.includes('half') || pkgStr.includes('180')) {
                        rawFreezeTot = 15; rawInvTot = 5; rawFreePtTot = 1;
                      } else if (pkgStr.includes('3') || pkgStr.includes('quarter') || pkgStr.includes('90')) {
                        rawFreezeTot = 7; rawInvTot = 2; rawFreePtTot = 1;
                      } else if (pkgStr.includes('1') || pkgStr.includes('month') || pkgStr.includes('30')) {
                        rawFreezeTot = 0; rawInvTot = 1; rawFreePtTot = 0;
                      }
                    }

                    const freePtTot = rawFreePtTot;
                    const freePtRem = Number(m.freePtSessionsRemaining ?? Math.max(0, freePtTot - Number(m.freePtSessionsUsed ?? 0)));
                    const invTot = rawInvTot;
                    const invRem = Number(m.invitationsRemaining ?? (m as any).guestInvitesRemaining ?? Math.max(0, invTot - Number((m as any).invitationsUsed ?? 0)));
                    const freezeTot = rawFreezeTot;
                    const freezeRem = Number(m.freezeDaysRemaining ?? m.freezeCoins ?? Math.max(0, freezeTot - Number(m.freezeDaysUsed ?? 0)));
                    const secondaryName = m.secondaryPackageName || ((m.packages || []).find((p: any) => p.status === 'Active' && p.hierarchy === 'Secondary')?.packageName);

                    return (
                      <div className="col-span-2 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded-lg bg-background border border-emerald-500/25">
                            <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block">Primary Package</span>
                            <span className="font-bold text-foreground truncate block">{m.primaryPackageName || selectedPackageName || m.packageType || '—'}</span>
                            <span className={`text-[11px] font-semibold ${daysLeft <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                              {daysLeft} days left to renew {m.membershipExpiry ? `(${String(m.membershipExpiry).slice(0, 10)})` : ''}
                            </span>
                          </div>
                          <div className="p-2 rounded-lg bg-background border border-blue-500/25">
                            <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 block">Secondary Package</span>
                            <span className="font-bold text-foreground truncate block">{secondaryName || 'No Secondary Package'}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {paidPtTot > 0 ? `Paid PT: ${paidPtRem} / ${paidPtTot} left` : 'Add-on / PT Tier'}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                          <div className="p-1.5 rounded-lg bg-background border">
                            <span className="text-[9px] uppercase text-muted-foreground font-bold block">Paid PT</span>
                            <span className="font-bold text-blue-500">{paidPtRem} / {paidPtTot}</span>
                          </div>
                          <div className="p-1.5 rounded-lg bg-background border">
                            <span className="text-[9px] uppercase text-muted-foreground font-bold block">Free PT</span>
                            <span className="font-bold text-purple-500">{freePtRem} / {freePtTot}</span>
                          </div>
                          <div className="p-1.5 rounded-lg bg-background border">
                            <span className="text-[9px] uppercase text-muted-foreground font-bold block">Invites</span>
                            <span className="font-bold text-primary">{invRem} / {invTot}</span>
                          </div>
                          <div className="p-1.5 rounded-lg bg-background border">
                            <span className="text-[9px] uppercase text-muted-foreground font-bold block">Freeze Days</span>
                            <span className="font-bold text-cyan-500">{freezeRem} / {freezeTot}d</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* RedGITS v17.12 Parity: 1-Click Guest Invitation Pass Redemption */}
                {isInzan && !isKiosk && (
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <Ticket className="h-3.5 w-3.5" />
                        Guest Invitation Pass (RedGITS Parity)
                      </span>
                      <Button
                        type="button"
                        variant={isGuestInviteOpen ? 'secondary' : 'outline'}
                        size="sm"
                        className="h-7 text-xs font-bold"
                        onClick={() => setIsGuestInviteOpen((prev) => !prev)}
                      >
                        {isGuestInviteOpen ? 'Close' : '+ Bring Guest'}
                      </Button>
                    </div>

                    {isGuestInviteOpen && (
                      <div className="space-y-2 pt-1 border-t border-primary/15">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            placeholder="Guest Full Name..."
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            className="h-9 bg-background text-xs"
                          />
                          <Input
                            placeholder="Guest Mobile (01XXXXXXXXX)..."
                            value={guestPhone}
                            onChange={(e) => setGuestPhone(e.target.value)}
                            className="h-9 bg-background text-xs font-mono"
                          />
                        </div>
                        {(() => {
                          if (!guestPhone || guestPhone.replace(/\D/g, '').length < 8) return null;
                          const simMatches = checkPhoneSimilarityForCandidate(guestPhone, clients);
                          if (simMatches.length === 0) return null;
                          return (
                            <div className="p-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-800 dark:text-amber-300">
                              <span className="font-bold">⚠️ RedGITS 7-Digit Phone Match:</span>{' '}
                              {simMatches.slice(0, 2).map((m) => `${m.matchedClient.name} (${maskEgyptianPhone(m.matchedClient.phone)})`).join(', ')}
                            </div>
                          );
                        })()}
                        <Button
                          type="button"
                          size="sm"
                          className="w-full font-bold text-xs gap-1.5"
                          onClick={handleRedeemGuestInvitation}
                          disabled={isRecording}
                        >
                          <Ticket className="h-3.5 w-3.5" />
                          Redeem 1 Guest Pass, Create Lead & Check-In
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  <Button 
                    className="w-full py-6 text-lg font-bold shadow-lg"
                    onClick={handleRecordAttendance}
                    disabled={isRecording}
                  >
                    {isRecording ? t('attendance.recording') : t('attendance.confirm_attendance')}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full text-muted-foreground"
                    onClick={() => {
                      setLastScannedMember(null);
                      setGatekeeperEval(null);
                      setError(null);
                      setIsGuestInviteOpen(false);
                    }}
                  >
                    {t('attendance.dismiss_clear')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed bg-muted/30">
              <CardContent className="h-[300px] flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <User className="h-12 w-12 mb-4 opacity-20" />
                <p className="font-medium">{t('attendance.no_member_selected')}</p>
                <p className="text-xs mt-1">{t('attendance.profile_will_appear')}</p>
              </CardContent>
            </Card>
          )}

          {/* Recent History Preview */}
          {!isKiosk && (
            <Card>
              <CardHeader className="py-4 border-b">
                <CardTitle className="text-sm font-bold flex items-center">
                  <History className="me-2 h-4 w-4" />
                  {t('attendance.todays_attendance')}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[250px] overflow-y-auto">
                  {attendances
                    .filter(a => toValidDate(a.date)?.toDateString() === new Date().toDateString())
                    .map(a => {
                      const client = clients.find(c => c.id === a.clientId);
                      const recorder = users.find(u => u.id === a.recordedBy);
                      return (
                        <div key={a.id} className="p-3 border-b last:border-0 flex items-center justify-between hover:bg-muted/30 transition-colors">
                          <div className="space-y-0.5">
                            {client ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('clients');
                                  setActiveClientId(client.id);
                                }}
                                className="text-primary hover:underline font-bold text-sm text-left block"
                              >
                                {client.name}
                              </button>
                            ) : (
                              <p className="text-sm font-bold">{t('attendance.unknown')}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground flex items-center">
                              <MapPin className="h-3 w-3 me-1" /> {a.branch} · {safeFormatDate(a.date, 'h:mm a')}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 opacity-70">
                            {t('attendance.by')} {recorder?.name?.split(' ')[0] || 'Admin'}
                          </Badge>
                        </div>
                      );
                    })}
                  {attendances.filter(a => toValidDate(a.date)?.toDateString() === new Date().toDateString()).length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-xs italic">
                      {t('attendance.no_records')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stage 6: Wrong Entry / Denied Scan Audit Log (RedGITS checkerror Parity) */}
          {isInzan && !isKiosk && wrongEntryLogs.length > 0 && (
            <Card className="border-rose-500/30">
              <CardHeader className="py-3 border-b bg-rose-500/5 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" />
                  Wrong Entry / Denied Check-In Log ({wrongEntryLogs.length})
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-muted-foreground"
                  onClick={() => {
                    setWrongEntryLogs([]);
                    try {
                      const todayKey = 'mitrixo_wrong_entries_' + new Date().toISOString().slice(0, 10);
                      localStorage.removeItem(todayKey);
                    } catch {}
                  }}
                >
                  Clear
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[180px] overflow-y-auto divide-y">
                  {wrongEntryLogs.map((log) => (
                    <div key={log.id} className="p-2.5 text-xs flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="font-bold flex items-center gap-1.5">
                          <span>{log.clientName}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">#{log.memberId}</span>
                        </div>
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                          {log.reasonMessage}
                        </p>
                      </div>
                      <Badge variant="destructive" className="text-[9px] shrink-0">
                        {log.reasonCode}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Kiosk Mode Fullscreen Overlay */}
      {isKiosk && kioskOverlay.show && (
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300 backdrop-blur-2xl ${
          kioskOverlay.type === 'success' 
            ? 'bg-emerald-950/95 text-white' 
            : kioskOverlay.type === 'warning' 
              ? 'bg-amber-950/95 text-white' 
              : 'bg-rose-950/95 text-white'
        }`}>
          <div className={`p-8 rounded-full mb-6 border-4 animate-bounce ${
            kioskOverlay.type === 'success' 
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
              : kioskOverlay.type === 'warning' 
                ? 'bg-amber-500/20 border-amber-500 text-amber-400' 
                : 'bg-rose-500/20 border-rose-500 text-rose-400'
          }`}>
            {kioskOverlay.type === 'success' && <CheckCircle className="h-24 w-24" />}
            {kioskOverlay.type === 'warning' && <AlertCircle className="h-24 w-24" />}
            {kioskOverlay.type === 'error' && <XCircle className="h-24 w-24" />}
          </div>
          
          <h1 className="text-4xl sm:text-5xl font-black mb-4 font-sans tracking-tight uppercase">
            {kioskOverlay.title}
          </h1>
          <p className="text-lg sm:text-2xl font-medium text-white/80 max-w-2xl leading-relaxed font-sans">
            {kioskOverlay.message}
          </p>
          {kioskOverlay.subText && (
            <p className="text-sm sm:text-lg font-bold text-white/60 mt-4 font-sans">
              {kioskOverlay.subText}
            </p>
          )}
        </div>
      )}
      {/* Daily Attendance & Paper Sheet Reconciliation (Hidden in Kiosk Mode) */}
      {!isKiosk && (
        <Card className="border-2 border-primary/10 shadow-lg no-print">
          <CardHeader className="bg-primary/5 border-b flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg flex items-center text-primary font-black uppercase">
                  <Calendar className="me-2 h-5 w-5" />
                  Daily Attendance & Paper Sheet Reconciliation
                </CardTitle>
                {rosterDate < cairoTodayStr && (
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 font-bold text-[10px] px-2 py-0.5">
                    Past Sheet Mode ({rosterDate})
                  </Badge>
                )}
                {rosterDate === cairoTodayStr && (
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 font-bold text-[10px] px-2 py-0.5">
                    Today
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cross-verify physical attendance sheets with CRM records and backdate check-ins for past classes.
              </p>
            </div>

            {/* Controls Header */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Date Nav Controls */}
              <div className="flex items-center bg-background rounded-lg border p-0.5 shadow-xs">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handlePrevDay} 
                  className="h-8 w-8 p-0"
                  title="Previous Day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleToday} 
                  className="h-8 px-2 text-xs font-bold"
                  title="Jump to Today"
                >
                  Today
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleNextDay} 
                  className="h-8 w-8 p-0"
                  title="Next Day"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Input
                  type="date"
                  value={rosterDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setRosterDate(e.target.value);
                      setSelectedSessionFilter('all');
                    }
                  }}
                  className="h-8 text-xs w-[130px] border-0 focus-visible:ring-0 cursor-pointer"
                  title="Pick specific date for reconciliation"
                />
              </div>

              {/* Session / Class Filter */}
              <Select value={selectedSessionFilter} onValueChange={(val) => { if (val) setSelectedSessionFilter(val); }}>
                <SelectTrigger className="h-8 text-xs w-[180px] bg-background">
                  <SelectValue placeholder="All Sessions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sessions ({classesOnSelectedDate.length} classes)</SelectItem>
                  {classesOnSelectedDate.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.time} — {c.name} ({c.attendees?.length || 0})
                    </SelectItem>
                  ))}
                  {ptPackageRecords.some(s => s.date === rosterDate && s.status !== 'Cancelled') && (
                    <SelectItem value="pt">Private PT Sessions</SelectItem>
                  )}
                </SelectContent>
              </Select>

              {/* Batch Check-In Remaining */}
              {dailyRoster.some(r => !r.checkedIn && r.type === 'Class') && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleBatchCheckInRemaining}
                  disabled={actionLoadingAttendeeId === 'batch-checkin'}
                  className="h-8 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                  title="Check in all remaining unverified members for this sheet"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {actionLoadingAttendeeId === 'batch-checkin' ? 'Checking in...' : `Check In All (${dailyRoster.filter(r => !r.checkedIn).length})`}
                </Button>
              )}

              {/* Quick Add Member to Session */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const defaultSessionId = (selectedSessionFilter !== 'all' && selectedSessionFilter !== 'pt')
                    ? selectedSessionFilter
                    : (classesOnSelectedDate[0]?.id || availableQuickAddClasses[0]?.id || 'walkin_general');
                  setQuickAddSessionId(defaultSessionId);
                  setQuickAddMemberId('');
                  setQuickAddSearch('');
                  setIsQuickAddOpen(true);
                }}
                className="h-8 text-xs font-bold gap-1 border-primary/30 text-primary hover:bg-primary/10 shadow-xs"
                title="Add an unenrolled member or past walk-in to attendance roster"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Member
              </Button>

              {/* Print Sheet */}
              <Button 
                variant="outline"
                size="sm"
                className="h-8 flex items-center gap-1.5 font-bold shadow-xs text-xs"
                onClick={() => window.print()}
                title="Print physical attendance roster sheet"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>

              {/* Dedicated Paper Reconciliation Workspace Modal */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReconcileModalOpen(true)}
                className="h-8 flex items-center gap-1.5 font-bold shadow-xs text-xs border-indigo-500/30 text-indigo-600 bg-indigo-500/10 hover:bg-indigo-500/20"
                title="Open dedicated Paper Roster Reconciliation workspace"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Paper Reconciliation
              </Button>
            </div>
          </CardHeader>

          {/* Quick Metrics Bar & Search Filter */}
          <div className="p-3 bg-muted/20 border-b flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs font-bold py-1">
                {searchScope === 'all' ? `Results: ${dailyRoster.length}` : `Total: ${dailyRoster.length}`}
              </Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-xs font-bold py-1">
                Checked In: {dailyRoster.filter(r => r.checkedIn).length}
              </Badge>
              <Badge variant="outline" className="text-xs font-bold py-1 text-muted-foreground">
                Pending: {dailyRoster.filter(r => !r.checkedIn && !r.isNoShow).length}
              </Badge>
              {dailyRoster.some(r => r.isNoShow) && (
                <Badge className="bg-rose-500/10 text-rose-600 border border-rose-500/20 text-xs font-bold py-1">
                  No-Shows: {dailyRoster.filter(r => r.isNoShow).length}
                </Badge>
              )}

              {/* Quick Filter: Low / Expired Credits */}
              <button
                type="button"
                onClick={() => setShowLowCreditsOnly(!showLowCreditsOnly)}
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
                  showLowCreditsOnly 
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs' 
                    : 'bg-background hover:bg-muted text-muted-foreground border-border'
                }`}
                title="Filter attendees with 2 or fewer remaining session credits"
              >
                <AlertTriangle className="h-3 w-3" />
                Low Credits (≤2)
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
              {/* Search Scope Switcher */}
              <div className="inline-flex rounded-lg p-0.5 bg-muted/80 border text-[11px] font-bold shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setSearchScope('day')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    searchScope === 'day' 
                      ? 'bg-background text-foreground shadow-xs' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Search roster for the selected day only"
                >
                  📅 Selected Day
                </button>
                <button
                  type="button"
                  onClick={() => setSearchScope('all')}
                  className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                    searchScope === 'all' 
                      ? 'bg-primary text-primary-foreground shadow-xs' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Search across all attendance dates across the entire CRM history"
                >
                  <Globe className="h-3 w-3" /> All System
                </button>
              </div>

              {/* Search Input Box */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={searchScope === 'all' ? "Search all attendance dates (name, phone, class)..." : "Search member, phone, or class..."}
                  value={rosterSearch}
                  onChange={e => setRosterSearch(e.target.value)}
                  className="h-8 pl-8 pr-7 text-xs bg-background"
                />
                {rosterSearch && (
                  <button 
                    type="button" 
                    onClick={() => setRosterSearch('')}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-muted/50 border-b text-xs uppercase font-bold text-muted-foreground">
                  <tr>
                    <th className="p-3">Member ID</th>
                    <th className="p-3">Member Name & Sessions</th>
                    <th className="p-3">Session / Class {searchScope === 'all' && ' & Date'}</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Reconciliation Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs">
                  {dailyRoster.map((item) => {
                    const isBusy = actionLoadingAttendeeId === item.clientId;
                    return (
                      <tr key={`${item.sessionId || 'nosess'}_${item.sessionDate || 'nodate'}_${item.clientId}`} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-muted-foreground">#{item.memberId}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('clients');
                                setActiveClientId(item.clientId);
                              }}
                              className="font-bold text-foreground hover:text-primary hover:underline text-left"
                              title="Open member CRM profile"
                            >
                              {item.name}
                            </button>

                            {/* Remaining Sessions Badge Option */}
                            {item.sessionsRemaining !== undefined && item.sessionsRemaining !== null && item.sessionsRemaining !== '—' ? (
                              Number(item.sessionsRemaining) <= 0 ? (
                                <Badge variant="outline" className="border-rose-500/40 text-rose-600 bg-rose-500/10 text-[10px] font-bold px-1.5 py-0 h-4 inline-flex items-center gap-0.5">
                                  <AlertCircle className="h-2.5 w-2.5 inline" /> 0 sessions left
                                </Badge>
                              ) : Number(item.sessionsRemaining) <= 2 ? (
                                <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10 text-[10px] font-bold px-1.5 py-0 h-4 inline-flex items-center gap-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5 inline" /> {item.sessionsRemaining} left (Low)
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/5 text-[10px] font-bold px-1.5 py-0 h-4">
                                  {item.sessionsRemaining} sessions left
                                </Badge>
                              )
                            ) : item.client?.membershipExpiry ? (
                              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 text-[10px] font-bold px-1.5 py-0 h-4">
                                Exp: {safeFormatDate(item.client.membershipExpiry, 'dd/MM/yyyy')}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] font-semibold px-1.5 py-0 h-4 opacity-75">
                                Active Pass
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-0.5">
                            {item.phone && (
                              <a href={`tel:${item.phone}`} className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-primary">
                                <Phone className="h-3 w-3" /> {item.phone}
                              </a>
                            )}
                            {item.packageType && (
                              <span className="text-[10px] text-muted-foreground/75 font-medium truncate max-w-[200px]" title={item.packageType}>
                                • {item.packageType}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          {searchScope === 'all' && item.sessionDate && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 h-4 bg-muted">
                                <CalendarDays className="h-3 w-3 mr-1 text-primary inline" />
                                {safeFormatDate(item.sessionDate, 'EEE, MMM d, yyyy')}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                ({safeFormatDistanceToNow(item.sessionDate, { addSuffix: true })})
                              </span>
                            </div>
                          )}
                          <span className="font-semibold block text-foreground">{item.slot}</span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {item.branch || selectedBranch || 'Main Studio'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {item.checkedIn ? (
                            <div className="inline-flex flex-col items-center">
                              <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold flex items-center gap-1 px-2.5 py-0.5 text-[11px]">
                                <Check className="h-3.5 w-3.5 stroke-[3]" /> Checked-In
                              </Badge>
                              {item.checkinTime && (
                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                  {safeFormatDate(item.checkinTime, 'h:mm a', 'Checked In')}
                                </span>
                              )}
                            </div>
                          ) : item.isNoShow ? (
                            <Badge className="bg-rose-500/10 text-rose-600 border border-rose-500/20 font-bold px-2 py-0.5 text-[11px]">
                              No-Show
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground font-semibold px-2 py-0.5 text-[11px]">
                              Booked / Unverified
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!item.checkedIn ? (
                              <Button
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleCheckInRosterItem(item)}
                                className="h-7 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-xs"
                                title="Verify attendance and mark checked-in"
                              >
                                <Check className="h-3.5 w-3.5 stroke-[3]" />
                                {isBusy ? "Checking..." : "Check In"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => handleUndoCheckIn(item)}
                                className="h-7 px-2 text-xs font-bold text-muted-foreground hover:text-foreground gap-1"
                                title="Undo check-in for this member"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Undo
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {dailyRoster.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-muted-foreground italic">
                        {searchScope === 'all' 
                          ? (rosterSearch.trim() ? `No attendance records found matching "${rosterSearch}" across the system.` : 'No attendance records found.')
                          : `No members scheduled or checked in for ${rosterDate}.`
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Add Member to Session Modal */}
      <Dialog open={isQuickAddOpen} onOpenChange={setIsQuickAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Add Member to Sheet Roster
            </DialogTitle>
            <DialogDescription className="text-xs">
              Directly enroll and retroactively check in a member from your physical attendance sheet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Select Attendance Target ({rosterDate})</Label>
              <Select value={quickAddSessionId} onValueChange={(val) => { if (val) setQuickAddSessionId(val); }}>
                <SelectTrigger className="h-9 text-xs bg-background">
                  <SelectValue placeholder="Choose class or walk-in..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkin_general">
                    🏢 Open Gym / Facility Walk-In ({rosterDate})
                  </SelectItem>
                  {availableQuickAddClasses.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.date === rosterDate ? '' : `[${c.date}] `}{c.time} — {c.name} ({c.branch || 'Main Studio'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Select Member</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Type name, phone, or member ID..."
                  value={quickAddSearch}
                  onChange={e => setQuickAddSearch(e.target.value)}
                  className="h-9 pl-8 text-xs bg-background"
                />
              </div>

              <div className="max-h-48 overflow-y-auto rounded-lg border bg-background divide-y mt-1">
                {clients
                  .filter(c => {
                    if (!quickAddSearch.trim()) return true;
                    const q = quickAddSearch.toLowerCase();
                    return c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || String(c.memberId || '').includes(q);
                  })
                  .slice(0, 30)
                  .map(c => {
                    const isSelected = quickAddMemberId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setQuickAddMemberId(c.id)}
                        className={`w-full p-2 text-left flex items-center justify-between text-xs hover:bg-muted/50 transition-colors ${
                          isSelected ? 'bg-primary/10 font-bold' : ''
                        }`}
                      >
                        <div>
                          <p className="font-bold text-foreground">{c.name} {c.memberId ? `(#${c.memberId})` : ''}</p>
                          <p className="text-[10px] text-muted-foreground">{c.phone || 'No phone'}</p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsQuickAddOpen(false)} className="text-xs font-semibold">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!quickAddSessionId || !quickAddMemberId || actionLoadingAttendeeId === 'quick-add'}
              onClick={handleQuickAddMember}
              className="text-xs font-bold bg-primary"
            >
              {actionLoadingAttendeeId === 'quick-add' ? 'Enrolling & Checking In...' : 'Enroll & Check In'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden print container, styled via CSS for A4 print */}
      <div className="print-container hidden print:block font-sans">
        {/* Header Block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #18181b', paddingBottom: '16px', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '24px', backgroundColor: '#ef4444', borderRadius: '2px' }}></div>
              <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '0.025em', textTransform: 'uppercase', margin: 0, color: '#18181b' }}>Daily Attendance Roster</h1>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#71717a', fontWeight: '500' }}>
              Gym Branch: <span style={{ color: '#18181b', fontWeight: '600' }}>{selectedBranch || 'MAIN'}</span> | Date: <span style={{ color: '#18181b', fontWeight: '600' }}>{rosterDate}</span>
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.companyName || 'Logo'} style={{ height: '36px', width: 'auto', marginBottom: '2px', display: 'block' }} referrerPolicy="no-referrer" />
            ) : (
              <h2 style={{ fontSize: '18px', fontWeight: '900', letterSpacing: '0.05em', color: '#18181b', margin: 0 }}>
                {branding.companyName || 'STRIKE BOXING CLUB'}
              </h2>
            )}
            <p style={{ margin: 0, fontSize: '10px', color: '#a1a1aa', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>Member Portal CRM</p>
          </div>
        </div>

        {/* Stats Summary Panel */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', padding: '12px 18px', backgroundColor: '#f4f4f5', borderRadius: '8px', border: '1px solid #e4e4e7' }}>
          <div style={{ fontSize: '12px', color: '#71717a', fontWeight: '500' }}>
            Total Scheduled: <span style={{ color: '#18181b', fontWeight: '700' }}>{dailyRoster.length}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#71717a', fontWeight: '500' }}>
            Checked In: <span style={{ color: '#10b981', fontWeight: '700' }}>{dailyRoster.filter(r => r.checkedIn).length}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#71717a', fontWeight: '500' }}>
            Pending: <span style={{ color: '#f59e0b', fontWeight: '700' }}>{dailyRoster.filter(r => !r.checkedIn).length}</span>
          </div>
        </div>

        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '15%', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em', fontWeight: '700' }}>Member ID</th>
              <th style={{ width: '40%', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em', fontWeight: '700' }}>Member Name</th>
              <th style={{ width: '25%', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em', fontWeight: '700' }}>Time Slot / Class</th>
              <th style={{ width: '20%', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.05em', fontWeight: '700' }}>Signature / Check-In</th>
            </tr>
          </thead>
          <tbody>
            {dailyRoster.map((item, idx) => (
              <tr key={item.clientId} style={{ backgroundColor: idx % 2 === 1 ? '#fafafa' : '#ffffff' }}>
                <td style={{ fontFamily: 'monospace', fontWeight: '600', fontSize: '12px', color: '#71717a' }}>#{item.memberId}</td>
                <td style={{ fontWeight: '700', fontSize: '13px', color: '#18181b' }}>{item.name}</td>
                <td style={{ fontSize: '13px', color: '#52525b' }}>{item.slot}</td>
                <td style={{ padding: '8px 14px' }}>
                  {item.checkedIn ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', fontSize: '11px', fontWeight: '800', letterSpacing: '0.025em' }}>
                      ✓ CHECKED-IN
                    </div>
                  ) : (
                    <div style={{ borderBottom: '1px dashed #d4d4d8', width: '100%', height: '24px', margin: '4px 0' }}></div>
                  )}
                </td>
              </tr>
            ))}
            {dailyRoster.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '32px', textAlign: 'center', fontStyle: 'italic', color: '#71717a' }}>
                  No members scheduled or checked in for today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        
        {/* Footer */}
        <div style={{ marginTop: '40px', borderTop: '1px solid #e4e4e7', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#a1a1aa' }}>
          <div>Generated on {new Date().toLocaleString(language === 'ar' ? 'ar-EG' : 'en-GB')}</div>
          <div>{branding.companyName || 'STRIKE'} GYM CRM • Confidential</div>
        </div>
      </div>

      <Dialog open={isTurnstileConfigOpen} onOpenChange={setIsTurnstileConfigOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-emerald-500" />
              Turnstile & Biometric Gate Hardware Bridge
            </DialogTitle>
            <DialogDescription>
              Connect ZKTeco, Hikvision, or Shelly LAN HTTP relays to automatically unlock turnstile gates on valid QR/biometric check-in, enforce Morning Package windows, and manage Seasonal Pop-Up (North Coast / Sahel) branch passes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
              <div>
                <p className="text-sm font-bold">Auto-Pulse Turnstile on Valid Check-In</p>
                <p className="text-xs text-muted-foreground">Fires LAN HTTP relay pulse when gatekeeper + time-window pass</p>
              </div>
              <input
                type="checkbox"
                checked={turnstileConfig.enabled}
                onChange={(e) => {
                  const next = { ...turnstileConfig, enabled: e.target.checked };
                  setTurnstileConfig(next);
                  localStorage.setItem('turnstile_gate_config', JSON.stringify(next));
                }}
                className="h-4 w-4 accent-emerald-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Hardware Controller Type</Label>
                <select
                  value={turnstileConfig.controllerType}
                  onChange={(e) => {
                    const next = { ...turnstileConfig, controllerType: e.target.value as any };
                    setTurnstileConfig(next);
                    localStorage.setItem('turnstile_gate_config', JSON.stringify(next));
                  }}
                  className="w-full h-9 rounded-md border bg-background px-3 text-xs font-medium"
                >
                  <option value="Shelly_HTTP">Shelly HTTP Relay (Wi-Fi / LAN)</option>
                  <option value="ZKTeco">ZKTeco Turnstile Controller</option>
                  <option value="Hikvision">Hikvision MinMoe / ISAPI</option>
                  <option value="Custom_Webhook">Custom Local Webhook</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Relay Pulse Duration (ms)</Label>
                <Input
                  type="number"
                  value={turnstileConfig.relayPulseMs}
                  onChange={(e) => {
                    const next = { ...turnstileConfig, relayPulseMs: Number(e.target.value) || 1500 };
                    setTurnstileConfig(next);
                    localStorage.setItem('turnstile_gate_config', JSON.stringify(next));
                  }}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Local LAN Relay Endpoint URL</Label>
              <Input
                value={turnstileConfig.relayEndpointUrl}
                onChange={(e) => {
                  const next = { ...turnstileConfig, relayEndpointUrl: e.target.value };
                  setTurnstileConfig(next);
                  localStorage.setItem('turnstile_gate_config', JSON.stringify(next));
                }}
                placeholder="http://192.168.1.50/relay/0?turn=on&timer=3"
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <div>
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  Seasonal / Pop-Up Branch Mode (North Coast / Sahel / Gouna)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Enforces seasonal branch pass limits for Cairo-only packages unless member holds an All-Passport / VIP tier.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(turnstileConfig.isSeasonalSahelBranch)}
                onChange={(e) => {
                  const next = { ...turnstileConfig, isSeasonalSahelBranch: e.target.checked };
                  setTurnstileConfig(next);
                  localStorage.setItem('turnstile_gate_config', JSON.stringify(next));
                }}
                className="h-4 w-4 accent-amber-600"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const res = await triggerTurnstileRelay(
                  { ...turnstileConfig, enabled: true },
                  {
                    allowRelayOpen: true,
                    relayPulseMs: turnstileConfig.relayPulseMs || 1500,
                    statusColor: 'green',
                    reasonCode: 'GRANTED',
                    messageEn: 'Test Open Gate',
                    messageAr: 'فتح تجريبي للبوابة',
                  },
                  { id: 'TEST', name: 'Test Admin' }
                );
                if (res.triggered) {
                  toast.success(`Turnstile Relay Pulsed (${turnstileConfig.relayPulseMs || 1500}ms)`);
                } else {
                  toast.error(res.error || 'Relay unreachable');
                }
              }}
              className="gap-1.5 text-xs font-bold border-emerald-500/40 text-emerald-600"
            >
              <Unlock className="h-3.5 w-3.5" />
              Test Open Gate Relay Now
            </Button>
            <Button type="button" size="sm" onClick={() => setIsTurnstileConfigOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShiftHandoverDialog
        open={isShiftHandoverOpen}
        onOpenChange={setIsShiftHandoverOpen}
        currentUser={currentUser}
        selectedBranch={selectedBranch}
      />

      <AttendanceReconciliationModal
        isOpen={isReconcileModalOpen}
        onClose={() => setIsReconcileModalOpen(false)}
        initialDate={rosterDate}
        initialSessionId={selectedSessionFilter !== 'pt' && selectedSessionFilter !== 'all' ? selectedSessionFilter : undefined}
      />
    </div>
  );
}
