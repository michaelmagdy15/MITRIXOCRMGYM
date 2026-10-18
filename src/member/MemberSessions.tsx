import React, { useState, useEffect, useMemo } from 'react';
import { Client, User, SessionType, Session, CoachSchedule as CoachScheduleType } from '../types';
import { auth, db, getTenantId } from '../firebase';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs } from 'firebase/firestore';
import { useSessions } from '../hooks/useSessions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { format, parseISO, addDays, isAfter } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, MapPin, Dumbbell, CalendarRange, User as UserIcon, CheckCircle2, MessageSquare, AlertCircle, ShoppingBag, ClipboardList, Star } from 'lucide-react';
import { AssessmentDialog } from './components/AssessmentDialog';
import { SessionRatingDialog } from './components/SessionRatingDialog';
import { createApprovalRequest } from '../services/approvalService';
import { useAuth } from '../contexts/AuthContext';
import CalendarSyncButton from '../components/CalendarSyncButton';

const STATUS_STYLES: Record<string, { badge: string; text: string }> = {
  Scheduled:  { badge: 'bg-blue-500/10 text-blue-600 border-blue-200/50',   text: 'Scheduled' },
  Attended:   { badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50', text: 'Attended' },
  'No Show':  { badge: 'bg-secondary text-muted-foreground border-border', text: 'No Show' },
  Cancelled:  { badge: 'bg-zinc-500/10 text-zinc-500 border-zinc-200/50',   text: 'Cancelled' },
};

const DAYS_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const getSessionEventDates = (s: any) => {
  const dateStr = s.date || format(new Date(), 'yyyy-MM-dd');
  const startTimeStr = s.startTime ? (s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime) : '10:00:00';
  const startIso = `${dateStr}T${startTimeStr}`;
  let endIso = '';
  if (s.endTime) {
    const endTimeStr = s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime;
    endIso = `${dateStr}T${endTimeStr}`;
  } else {
    const [h = 10, m = 0] = (s.startTime || '10:00').split(':').map(Number);
    const endH = String((h + 1) % 24).padStart(2, '0');
    const endM = String(m).padStart(2, '0');
    endIso = `${dateStr}T${endH}:${endM}:00`;
  }
  return { startIso, endIso };
};

export default function MemberSessions({ client, onSwitchToStore }: { client: Client | null; onSwitchToStore?: () => void }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Booking form state
  const { bookSession, updateSessionStatus, deleteSession } = useSessions();
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [sessionType, setSessionType] = useState<SessionType>('1-on-1');
  const [coachSchedule, setCoachSchedule] = useState<CoachScheduleType['days'] | null>(null);
  const [bookingDate, setBookingDate] = useState<string>(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [bookingTime, setBookingTime] = useState<string>('10:00');
  const [bookingMessage, setBookingMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const [assessmentDialogOpen, setAssessmentDialogOpen] = useState(false);

  // Rescheduling & Cancellation state
  const [selectedRescheduleSession, setSelectedRescheduleSession] = useState<Session | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Late Cancellation Approval State
  const [isLateCancelDialogOpen, setIsLateCancelDialogOpen] = useState(false);
  const [lateCancelSession, setLateCancelSession] = useState<Session | null>(null);
  const [lateCancelReason, setLateCancelReason] = useState('');

  const { currentUser } = useAuth();
  const isInzan = useMemo(() => {
    const t = getTenantId().toLowerCase();
    return t.includes('inzan') || t === 'db-inzanathletics' || t === 'default';
  }, []);

  const [selectedRatingSession, setSelectedRatingSession] = useState<Session | null>(null);
  const [memberAssessments, setMemberAssessments] = useState<any[]>([]);
  const [rescheduleSuccessMsg, setRescheduleSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    // 1. Fetch member's personal training sessions
    const sessionsQ = query(
      collection(db, 'sessions'),
      where('clientId', '==', client.id)
    );

    const unsubSessions = onSnapshot(sessionsQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort in-memory by date descending
      list.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setSessions(list);
      setLoading(false);
    }, (err) => {
      console.error("Error subscribing to member sessions:", err);
      setLoading(false);
    });

    // 1b. Subscribe to member's PT assessments
    const assessQ = query(
      collection(db, 'assessments'),
      where('clientId', '==', client.id)
    );
    const unsubAssessments = onSnapshot(assessQ, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setMemberAssessments(list);
    }, () => {
      setMemberAssessments([]);
    });

    // 2. Fetch active coaches (server endpoint + direct Firestore fallback)
    const loadCoaches = async () => {
      try {
        const res = await fetch('/api/member/coaches');
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            setCoaches(list);
            return;
          }
        }
      } catch (err) {
        console.warn("API /api/member/coaches fetch error, trying direct fallback:", err);
      }

      // Direct fallback from coaches collection
      try {
        const snap = await getDocs(collection(db, 'coaches'));
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(c => c.active !== false && c.status !== 'inactive');
        if (list.length > 0) {
          setCoaches(list);
        }
      } catch (e) {
        console.error("Direct coaches fallback failed:", e);
      }
    };
    loadCoaches();

    return () => {
      unsubSessions();
      unsubAssessments();
    };
  }, [client?.id]);

  // Fetch coach schedule when selected coach changes
  useEffect(() => {
    if (!selectedCoachId) {
      setCoachSchedule(null);
      return;
    }

    const fetchCoachSchedule = async () => {
      try {
        const docRef = doc(db, 'coachSchedules', selectedCoachId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().days) {
          setCoachSchedule(docSnap.data().days);
        } else {
          setCoachSchedule(null);
        }
      } catch (err) {
        console.error("Error fetching coach schedule:", err);
        setCoachSchedule(null);
      }
    };

    fetchCoachSchedule();
  }, [selectedCoachId]);

  // Compute available coach slots for selected bookingDate
  const dateDaySlots = useMemo(() => {
    if (!selectedCoachId || !bookingDate || !coachSchedule) return null;
    const parsed = new Date(`${bookingDate}T00:00:00`);
    if (isNaN(parsed.getTime())) return null;
    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayMap[parsed.getDay()] || 'monday';
    const dayCfg = coachSchedule[dayKey];
    if (!dayCfg || !dayCfg.enabled) {
      return { enabled: false, dayKey, slots: [] };
    }

    const [startH = 9, startM = 0] = (dayCfg.startTime || '09:00').split(':').map(Number);
    const [endH = 21, endM = 0] = (dayCfg.endTime || '21:00').split(':').map(Number);
    const duration = dayCfg.slotDurationMinutes || 60;
    let startTotalM = startH * 60 + startM;
    const endTotalM = endH * 60 + endM;
    if (endTotalM <= startTotalM) return { enabled: true, dayKey, slots: [] };

    const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const slots: {
      id: string;
      startTime: string;
      endTime: string;
      dedicatedType?: SessionType;
      capacity: number;
      matchesSelectedType: boolean;
    }[] = [];

    while (startTotalM < endTotalM) {
      const slotEndM = Math.min(startTotalM + duration, endTotalM);
      const startTime = fmtMin(startTotalM);
      const endTime = fmtMin(slotEndM);
      const slotId = `${startTime}-${endTime}`;

      const rule = dayCfg.slotRules?.[startTime] || dayCfg.slotRules?.[slotId];
      const isBlocked =
        (dayCfg.blockedSlots || []).includes(slotId) ||
        (dayCfg.blockedSlots || []).includes(startTime) ||
        rule?.type === 'Break';

      if (!isBlocked) {
        const dedicatedType = rule && rule.type !== 'Any' && rule.type !== 'Break' ? rule.type : undefined;
        const capacity =
          rule?.capacity ||
          dayCfg.capacities?.[dedicatedType || sessionType] ||
          1;
        const matchesSelectedType = !dedicatedType || dedicatedType === sessionType;

        slots.push({
          id: slotId,
          startTime,
          endTime,
          dedicatedType,
          capacity,
          matchesSelectedType,
        });
      }

      startTotalM += duration;
    }

    return { enabled: true, dayKey, slots };
  }, [selectedCoachId, bookingDate, coachSchedule, sessionType]);

  if (!client) return null;

  const upcomingSessions = sessions.filter(s => s.status === 'Scheduled' && isAfter(parseISO(s.date), new Date()));
  const pastSessions = sessions.filter(s => s.status !== 'Scheduled' || !isAfter(parseISO(s.date), new Date()));

  const selectedCoach = coaches.find(c => c.id === selectedCoachId);

  const latestAssessment = memberAssessments[0] || null;
  const assignedCoachIdFromProfile =
    (client as any).assignedCoachId ||
    latestAssessment?.assignedCoachId ||
    null;
  const assignedCoachNameFromProfile =
    (client as any).assignedCoachName ||
    (client as any).trainerName ||
    latestAssessment?.assignedCoachName ||
    null;

  const hasCompletedOrAssignedAssessment = Boolean(
    assignedCoachIdFromProfile ||
      assignedCoachNameFromProfile ||
      (client as any).ptAssessmentCompleted ||
      memberAssessments.some((a) => a.assignedCoachId || a.status === 'Completed' || a.status === 'Scheduled')
  );
  const hasPendingAssessment = Boolean(
    !hasCompletedOrAssignedAssessment &&
      (memberAssessments.length > 0 || (client as any).ptAssessmentStatus === 'PendingFitnessManager')
  );

  const freePtTotal =
    (client as any).freePtSessionsTotal ??
    (Array.isArray(client.packages)
      ? client.packages.reduce((acc: number, p: any) => acc + (Number(p?.freePtSessions) || 0), 0)
      : 0);
  const freePtUsed = (client as any).freePtSessionsUsed ?? 0;
  const freePtRemaining = Math.max(0, freePtTotal - freePtUsed);

  const activePackageBounds = useMemo(() => {
    const activePkgs = Array.isArray(client.packages)
      ? client.packages.filter((p: any) => p?.status === 'Active')
      : [];
    const ptPkg = activePkgs.find((p: any) =>
      /pt|private|trainer/i.test(`${p?.category || ''} ${p?.packageName || ''}`)
    );
    const targetPkg = ptPkg || activePkgs[0];
    return {
      startDate: targetPkg?.startDate || client.startDate || null,
      endDate: targetPkg?.endDate || client.membershipExpiry || null,
    };
  }, [client.packages, client.startDate, client.membershipExpiry]);

  const handleRequestBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoachId || !bookingDate || !bookingTime || !client.id) return;

    if (client.status === 'Expired') {
      const isTenantInzan = getTenantId().toLowerCase().includes('inzan');
      const gymName = isTenantInzan ? 'Inzan Athletics' : 'STRIKE';
      setBookingError(`Your membership is expired. You must head to the ${gymName} branch to renew before booking sessions.`);
      return;
    }

    if (isInzan && !hasCompletedOrAssignedAssessment) {
      setBookingError(
        'First-time PT members must submit a PT Assessment Request first so the Fitness Manager can assign your Coach.'
      );
      return;
    }

    if (isInzan && activePackageBounds.endDate && bookingDate > activePackageBounds.endDate) {
      setBookingError(
        `Session date (${bookingDate}) cannot exceed your active package expiry date (${activePackageBounds.endDate}).`
      );
      return;
    }

    setIsSubmitting(true);
    setBookingSuccess(false);
    setBookingError(null);

    try {
      const { checkEntitlement } = await import('../services/entitlementService');
      
      // Enforce entitlement check (or Free PT sessions for Inzan)
      const entitlementCheck = await checkEntitlement(client, 'pt');
      if (!entitlementCheck.canBook && !(isInzan && freePtRemaining > 0)) {
        throw new Error(entitlementCheck.reason || "You do not have a valid PT package or Free PT entitlement to book this session.");
      }

      const selectedDateTime = new Date(`${bookingDate}T${bookingTime}`);
      if (selectedDateTime <= new Date()) {
        throw new Error("Please select a future date and time.");
      }
      
      const coach = coaches.find(c => c.id === selectedCoachId);
      
      const [hours = 0, minutes = 0] = bookingTime.split(':').map(Number);
      const endHours = String((hours + 1) % 24).padStart(2, '0');
      const endTime = `${endHours}:${String(minutes).padStart(2, '0')}`;

      await bookSession({
        clientId: client.id,
        clientName: client.name,
        coachId: selectedCoachId,
        coachName: coach?.name || 'Unassigned Coach',
        type: sessionType,
        date: bookingDate,
        startTime: bookingTime,
        endTime,
        status: 'Scheduled',
        notes: bookingMessage.trim(),
        branch: client.branch || 'Main Studio'
      });

      setBookingSuccess(true);
      setBookingMessage('');
      setSelectedCoachId('');
    } catch (err: any) {
      console.error("Error submitting booking request:", err);
      setBookingError(err.message || "Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRescheduleSession || !rescheduleDate || !rescheduleTime) return;

    if (selectedRescheduleSession.date && selectedRescheduleSession.startTime) {
      const [hours, minutes] = selectedRescheduleSession.startTime.split(':').map(Number);
      const sessionStart = new Date(selectedRescheduleSession.date);
      sessionStart.setHours(hours || 0, minutes || 0, 0, 0);
      
      const now = new Date();
      const diffMs = sessionStart.getTime() - now.getTime();
      if (diffMs < 3600000) {
        setRescheduleError("Sessions cannot be rescheduled less than 1 hour before start time.");
        return;
      }
    }

    if (isInzan && activePackageBounds.endDate && rescheduleDate > activePackageBounds.endDate) {
      setRescheduleError(
        `New date (${rescheduleDate}) cannot be after your package expiry date (${activePackageBounds.endDate}).`
      );
      return;
    }

    setIsRescheduling(true);
    setRescheduleError(null);

    try {
      const selectedDateTime = new Date(`${rescheduleDate}T${rescheduleTime}`);
      if (selectedDateTime <= new Date()) {
        throw new Error("Please select a future date and time.");
      }
      
      const { updateDoc } = await import('firebase/firestore');
      if (isInzan) {
        // In Inzan Athletics, member reschedule sends an Edit Request to the Coach for confirmation
        await updateDoc(doc(db, 'sessions', selectedRescheduleSession.id), {
          rescheduleRequest: {
            proposedDate: rescheduleDate,
            proposedTime: rescheduleTime,
            previousDate: selectedRescheduleSession.date,
            previousTime: selectedRescheduleSession.startTime,
            requestedBy: client.name || 'Member',
            requestedAt: new Date().toISOString(),
            status: 'PendingCoachApproval',
          },
          updatedAt: new Date().toISOString(),
        });
        setRescheduleSuccessMsg(
          `Reschedule request (${rescheduleDate} at ${rescheduleTime}) sent to your Coach for confirmation!`
        );
        setTimeout(() => setRescheduleSuccessMsg(null), 5000);
      } else {
        await updateDoc(doc(db, 'sessions', selectedRescheduleSession.id), {
          date: rescheduleDate,
          startTime: rescheduleTime,
          status: 'Scheduled'
        });
      }

      setSelectedRescheduleSession(null);
    } catch (err: any) {
      console.error("Error rescheduling session:", err);
      setRescheduleError(err.message || "Failed to reschedule. Please try again.");
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleCancelSession = async (session: Session) => {
    const sessionStart = new Date(`${session.date}T${session.startTime}`);
    const now = new Date();
    const diffHours = (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24) {
      setLateCancelSession(session);
      setLateCancelReason('');
      setIsLateCancelDialogOpen(true);
      return;
    }

    if (!window.confirm("Are you sure you want to cancel this session?")) return;
    try {
      await updateSessionStatus(session.id, 'Cancelled', client.branch);
    } catch (err: any) {
      console.error("Error cancelling session:", err);
      alert("Failed to cancel session: " + err.message);
    }
  };

  const handleLateCancelSubmit = async () => {
    if (!currentUser || !lateCancelSession) return;
    
    try {
      await createApprovalRequest(
        'cancellation',
        { sessionId: lateCancelSession.id, type: lateCancelSession.type, date: lateCancelSession.date },
        lateCancelReason,
        currentUser.id,
        client.name, // Member requesting
        'member',
        lateCancelSession.id,
        'session'
      );
      
      setIsLateCancelDialogOpen(false);
      setLateCancelSession(null);
      setLateCancelReason('');
      
      alert("Late cancellation request submitted for approval. A manager will review your request.");
    } catch (err: any) {
      console.error("Failed to submit late cancellation request:", err);
      alert(err.message || "Failed to submit request.");
    }
  };

  const getTrainerName = (trainerId?: string, fallbackName?: string) => {
    if (fallbackName && fallbackName !== 'Unassigned Coach') return fallbackName;
    if (!trainerId) return 'Unassigned Coach';
    const trainer = coaches.find(c => c.id === trainerId);
    return trainer?.name || fallbackName || 'Trainer';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" /> My Sessions
          </h2>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => setAssessmentDialogOpen(true)}
              variant="outline" 
              size="sm" 
              className="h-8 text-[11px] font-bold flex items-center gap-1.5 shrink-0"
            >
              <ClipboardList className="h-3 w-3" /> Request Assessment
            </Button>
            {onSwitchToStore && (!isInzan || hasCompletedOrAssignedAssessment) && (
              <Button 
                onClick={onSwitchToStore} 
                variant="outline" 
                size="sm" 
                className="h-8 text-[11px] font-bold border-primary/20 hover:border-primary/45 rounded-xl flex items-center gap-1.5 shrink-0 bg-background/50 shadow-sm"
              >
                <ShoppingBag className="h-3 w-3" /> Buy Packages
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">View scheduled personal training sessions and manage your workouts.</p>
      </div>

      {rescheduleSuccessMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{rescheduleSuccessMsg}</span>
        </div>
      )}

      {/* Session Balance + Free PT Balance */}
      {((client.packages && client.packages.some(p => p.status === 'Active' && p.sessionsRemaining !== undefined)) || (typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0) || (typeof client.ptSessionsRemaining === 'number' && client.ptSessionsRemaining > 0) || freePtRemaining > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {freePtRemaining > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex flex-col justify-center items-center text-center">
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Complimentary PT</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 my-1">{freePtRemaining}</span>
              <span className="text-[9px] text-muted-foreground">Free PT Sessions Left</span>
            </div>
          )}
          {client.packages && client.packages.some(p => p.status === 'Active' && p.sessionsRemaining !== undefined) ? (
            client.packages.filter(p => p.status === 'Active' && p.sessionsRemaining !== undefined).map(pkg => (
              <div key={pkg.id} className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-col justify-center items-center text-center">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{pkg.packageName}</span>
                <span className="text-2xl font-black text-primary my-1">{pkg.sessionsRemaining}</span>
                <span className="text-[9px] text-muted-foreground">
                  Sessions Remaining {pkg.endDate ? `• Exp ${pkg.endDate}` : ''}
                </span>
              </div>
            ))
          ) : (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-col justify-center items-center text-center">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">{client.packageType || 'Personal Training'}</span>
              <span className="text-2xl font-black text-primary my-1">{client.ptSessionsRemaining ?? client.sessionsRemaining}</span>
              <span className="text-[9px] text-muted-foreground">Sessions Remaining</span>
            </div>
          )}
        </div>
      )}

      {/* INZAN MANDATORY PT ASSESSMENT GATE */}
      {isInzan && !hasCompletedOrAssignedAssessment ? (
        <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 text-[10px] font-extrabold uppercase tracking-wider">
                Mandatory First Step
              </Badge>
              {freePtRemaining > 0 && (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] font-bold">
                  {freePtRemaining} Free PT Sessions Included
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-extrabold flex items-center gap-2 mt-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {hasPendingAssessment
                ? 'PT Assessment Request Under Fitness Manager Review'
                : 'Step 1: Request Your PT Assessment First'}
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              {hasPendingAssessment
                ? `Your PT Assessment request has been routed to the Fitness Manager${
                    latestAssessment?.preferredCoachName ? ` (Preferred Coach: ${latestAssessment.preferredCoachName})` : ''
                  }. Once the Fitness Manager assigns your Coach, your PT schedule and package options will unlock automatically.`
                : 'At Inzan Athletics, all members starting Personal Training (including complimentary Free PT sessions) must first complete a PT Assessment Request. The Fitness Manager will review your profile and assign the best Coach for your goals.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 flex flex-wrap items-center gap-3">
            {hasPendingAssessment ? (
              <div className="w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-amber-700 dark:text-amber-300">Status: Awaiting Fitness Manager Coach Assignment</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Submitted {latestAssessment?.createdAt ? format(parseISO(latestAssessment.createdAt), 'dd MMM yyyy HH:mm') : 'recently'} • Shift: {latestAssessment?.timePeriod || 'Flexible'} ({latestAssessment?.preferredHour || 'Any'})
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs font-bold shrink-0" onClick={() => setAssessmentDialogOpen(true)}>
                  Update Request
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setAssessmentDialogOpen(true)}
                className="w-full sm:w-auto font-extrabold gap-2 h-10 px-5 shadow-sm"
              >
                <ClipboardList className="h-4 w-4" /> Request PT Assessment Now
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Book a new session Section */
        <Card className="border bg-card/40 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-primary" /> Request PT Session
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {isInzan && assignedCoachNameFromProfile
                    ? `Assigned Coach: ${assignedCoachNameFromProfile}. Your coach sets your recurring timetable, or you can request a slot below within your package validity.`
                    : 'Select a coach and request a personalized training session.'}
                </CardDescription>
              </div>
              {isInzan && activePackageBounds.endDate && (
                <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                  Valid until {activePackageBounds.endDate}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRequestBooking} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="coachSelect" className="text-xs font-bold text-muted-foreground">Select Coach</Label>
                <Select value={selectedCoachId} onValueChange={(val) => setSelectedCoachId(val || '')}>
                  <SelectTrigger id="coachSelect" className="bg-background">
                    <SelectValue placeholder="Choose a trainer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(isInzan && assignedCoachIdFromProfile
                      ? coaches.filter((c) => c.id === assignedCoachIdFromProfile || c.name === assignedCoachNameFromProfile)
                      : coaches
                    ).map(coach => (
                      <SelectItem key={coach.id} value={coach.id}>
                        {coach.name} {coach.branch ? `(${coach.branch})` : ''}
                      </SelectItem>
                    ))}
                    {isInzan && assignedCoachIdFromProfile && coaches.filter((c) => c.id === assignedCoachIdFromProfile || c.name === assignedCoachNameFromProfile).length === 0 && (
                      coaches.map(coach => (
                        <SelectItem key={coach.id} value={coach.id}>
                          {coach.name} {coach.branch ? `(${coach.branch})` : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Session Type</Label>
                <Select value={sessionType} onValueChange={(val) => setSessionType(val as SessionType)}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-on-1">1-on-1 PT</SelectItem>
                    <SelectItem value="Partner">Partner Training</SelectItem>
                    <SelectItem value="Small Group">Small Group</SelectItem>
                    <SelectItem value="Class">Class</SelectItem>
                    <SelectItem value="Nutrition">Nutrition</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Coach Availability Preview */}
              {selectedCoachId && (
                <div className="bg-muted/50 border rounded-xl p-3 space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase">
                    <Clock className="h-3.5 w-3.5" />
                    Coach Weekly Availability
                  </div>
                  {coachSchedule ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-medium text-muted-foreground">
                      {DAYS_ORDER.map(dayKey => {
                        const dayConfig = coachSchedule[dayKey];
                        return (
                          <div key={dayKey} className="flex justify-between border-b border-border/40 py-0.5">
                            <span className="capitalize">{dayKey.substring(0, 3)}:</span>
                            <span>
                              {dayConfig?.enabled 
                                ? `${dayConfig.startTime} – ${dayConfig.endTime}` 
                                : <span className="text-muted-foreground/70 font-semibold italic">Off</span>
                              }
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">No availability schedule set by this coach yet. You can still send a request.</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bookDate" className="text-xs font-bold text-muted-foreground">Date</Label>
                  <Input
                    id="bookDate"
                    type="date"
                    min={format(addDays(new Date(), 1), 'yyyy-MM-dd')}
                    max={isInzan && activePackageBounds.endDate ? activePackageBounds.endDate : undefined}
                    value={bookingDate}
                    onChange={e => setBookingDate(e.target.value)}
                    required
                    className="bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bookTime" className="text-xs font-bold text-muted-foreground">Time</Label>
                  <Input
                    id="bookTime"
                    type="time"
                    value={bookingTime}
                    onChange={e => setBookingTime(e.target.value)}
                    required
                    className="bg-background"
                  />
                </div>
              </div>

              {/* Interactive Slot Pills for Selected Date */}
              {dateDaySlots && (
                <div className="space-y-2 pt-1 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-muted-foreground capitalize">
                      Available Slots ({dateDaySlots.dayKey})
                    </Label>
                    <span className="text-[10px] text-muted-foreground">1-tap to select time & type</span>
                  </div>
                  {!dateDaySlots.enabled ? (
                    <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 font-medium">
                      Coach is marked Off on {dateDaySlots.dayKey}. Please pick another date.
                    </p>
                  ) : dateDaySlots.slots.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No open slots configured for this day.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {dateDaySlots.slots.map(slot => {
                        const isSelected = bookingTime === slot.startTime;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => {
                              setBookingTime(slot.startTime);
                              if (slot.dedicatedType) {
                                setSessionType(slot.dedicatedType);
                              }
                            }}
                            className={`p-2 rounded-xl border text-left transition-all flex flex-col justify-between gap-1 ${
                              isSelected
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm font-bold'
                                : slot.matchesSelectedType
                                  ? 'bg-background hover:border-primary/50 text-foreground border-border'
                                  : 'bg-muted/40 hover:border-primary/40 text-muted-foreground border-dashed border-border'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-mono font-extrabold">
                                {slot.startTime} – {slot.endTime}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-1 text-[10px]">
                              <span className="truncate font-semibold">
                                {slot.dedicatedType ? slot.dedicatedType : 'Any Type'}
                              </span>
                              <span className="font-mono opacity-80 shrink-0">
                                Max {slot.capacity}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="bookMessage" className="text-xs font-bold text-muted-foreground">Message / Focus (Optional)</Label>
                <Textarea
                  id="bookMessage"
                  rows={2}
                  value={bookingMessage}
                  onChange={e => setBookingMessage(e.target.value)}
                  placeholder="e.g. Focus on strength, conditioning, mobility..."
                  className="bg-background resize-none"
                />
              </div>

              {bookingError && (
                <div className="bg-secondary border border-border text-muted-foreground p-3 rounded-lg flex items-center gap-2.5 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{bookingError}</span>
                </div>
              )}

              {bookingSuccess && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-600 p-3 rounded-lg flex items-center gap-2.5 text-xs">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Request sent successfully! Your coach will confirm soon.</span>
                </div>
              )}

              <Button type="submit" disabled={isSubmitting || !selectedCoachId} className="w-full font-bold">
                {isSubmitting ? 'Sending Request...' : 'Send Request'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Sessions */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-primary animate-pulse" /> Upcoming Sessions
        </h3>
        {upcomingSessions.length > 0 ? (
          upcomingSessions.map(session => {
            const dateObj = new Date(`${session.date}T${session.startTime}`);
            const style = STATUS_STYLES[session.status] || { badge: 'bg-blue-500/10 text-blue-600 border-blue-200/50', text: 'Scheduled' };
            const pendingReschedule = session.rescheduleRequest?.status === 'PendingCoachApproval' ? session.rescheduleRequest : null;
            
            return (
              <Card key={session.id} className="border bg-card/40 hover:bg-card/75 transition-colors shadow-sm">
                <CardContent className="p-4 flex justify-between items-center gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-bold">
                      <UserIcon className="h-4 w-4 text-primary" />
                      <span>{getTrainerName(session.coachId, session.coachName)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-semibold">
                      <span className="flex items-center gap-1 font-mono">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(dateObj, 'eee, dd MMM yyyy')}
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="h-3.5 w-3.5" />
                        {format(dateObj, 'h:mm a')}
                      </span>
                      <span className="flex items-center gap-1 font-mono text-primary">
                         {session.type}
                      </span>
                      {session.branch && (
                        <span className="flex items-center gap-1 uppercase tracking-wider text-[10px] text-primary">
                          <MapPin className="h-3 w-3" />
                          {session.branch}
                        </span>
                      )}
                    </div>
                    {pendingReschedule && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Edit Request Pending Coach Approval: Proposed {pendingReschedule.proposedDate} at {pendingReschedule.proposedTime}
                        </span>
                      </div>
                    )}
                    {session.notes && (
                      <p className="text-[11px] text-muted-foreground flex items-start gap-1 bg-muted/40 p-2 rounded-lg mt-2 italic">
                        <MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />
                        "{session.notes}"
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/40 justify-start flex-wrap">
                      <CalendarSyncButton
                        size="xs"
                        variant="outline"
                        buttonText="Add to Calendar"
                        className="text-[10px] text-primary border-primary/20 hover:border-primary/40 h-7 font-bold px-2.5 bg-primary/5 hover:bg-primary/10"
                        event={{
                          title: `PT Session with ${getTrainerName(session.coachId, session.coachName)} (${session.type || '1-on-1'})`,
                          description: `Personal Training Session with Coach ${getTrainerName(session.coachId, session.coachName)}.\nType: ${session.type || '1-on-1'}\nBranch: ${session.branch || 'Inzan Athletics'}${session.notes ? `\nFocus/Notes: ${session.notes}` : ''}`,
                          location: session.branch || 'Inzan Athletics',
                          startTime: getSessionEventDates(session).startIso,
                          endTime: getSessionEventDates(session).endIso
                        }}
                      />
                      <Button
                        size="xs"
                        variant="outline"
                        type="button"
                        className="text-[10px] text-primary border-primary/20 h-7 font-bold px-2.5"
                        onClick={() => {
                          setSelectedRescheduleSession(session);
                          setRescheduleDate(pendingReschedule?.proposedDate || session.date);
                          setRescheduleTime(pendingReschedule?.proposedTime || session.startTime);
                          setRescheduleError(null);
                        }}
                      >
                        {isInzan ? (pendingReschedule ? 'Update Edit Request' : 'Edit / Request Reschedule') : 'Reschedule'}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        type="button"
                        className="text-[10px] text-muted-foreground border-border hover:bg-secondary hover:text-foreground h-7 font-bold px-2.5 disabled:opacity-50"
                        onClick={() => handleCancelSession(session)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                  <Badge className={`border text-xs px-2.5 py-0.5 rounded-full shrink-0 ${style.badge}`} variant="outline">
                    {pendingReschedule ? 'Edit Pending' : style.text}
                  </Badge>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-8 text-center text-muted-foreground text-xs italic">
              {isInzan && !hasCompletedOrAssignedAssessment
                ? 'Complete your PT Assessment Request above so your assigned Coach can schedule your sessions.'
                : 'No upcoming sessions scheduled. Your assigned coach will set your sessions or you can request a slot above.'}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Past Sessions History */}
      {pastSessions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">Session History</h3>
          <div className="space-y-3">
            {pastSessions.slice(0, 10).map(session => {
              const dateObj = parseISO(session.date);
              const style = STATUS_STYLES[session.status] || { badge: 'bg-zinc-500/10 text-zinc-500 border-zinc-200/50', text: session.status };
              return (
                <Card key={session.id} className="border bg-card/40 opacity-75 shadow-sm">
                  <CardContent className="p-4 flex justify-between items-center gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-muted-foreground">{getTrainerName(session.coachId)}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">{format(dateObj, 'dd MMM yyyy')}</span>
                        <span className="font-mono">{format(dateObj, 'h:mm a')}</span>
                        {session.branch && <span className="uppercase text-[9px] font-bold">{session.branch}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={`border text-[10px] px-2 py-0.5 rounded-full ${style.badge}`} variant="outline">
                        {style.text}
                      </Badge>
                      {session.status === 'Attended' && (
                        <Button 
                          variant="ghost" 
                          size="xs" 
                          className={`h-6 text-[10px] gap-1 px-2 ${session.rating ? 'text-yellow-500 hover:text-yellow-600' : 'text-muted-foreground'}`}
                          onClick={() => setSelectedRatingSession(session)}
                        >
                          <Star className={`h-3 w-3 ${session.rating ? 'fill-current' : ''}`} />
                          {session.rating ? 'Edit Rating' : 'Rate Session'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      {/* Reschedule Dialog */}
      <Dialog open={selectedRescheduleSession !== null} onOpenChange={open => { if (!open) setSelectedRescheduleSession(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reschedule Session</DialogTitle>
            <DialogDescription>
              Select a new date and time for your session with {selectedRescheduleSession && getTrainerName(selectedRescheduleSession.coachId)}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRescheduleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-date">New Date</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={rescheduleDate}
                onChange={e => setRescheduleDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reschedule-time">New Time</Label>
              <Input
                id="reschedule-time"
                type="time"
                value={rescheduleTime}
                onChange={e => setRescheduleTime(e.target.value)}
                required
              />
            </div>

            {rescheduleError && (
              <div className="bg-secondary border border-border text-muted-foreground p-3 rounded-lg text-xs font-semibold">
                {rescheduleError}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedRescheduleSession(null)} disabled={isRescheduling}>
                Cancel
              </Button>
              <Button type="submit" disabled={isRescheduling} className="font-bold">
                {isRescheduling ? 'Rescheduling...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Late Cancel Request Dialog */}
      <Dialog open={isLateCancelDialogOpen} onOpenChange={setIsLateCancelDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Late Cancellation Request</DialogTitle>
            <DialogDescription>
              Cancellations within 24 hours require manager approval. Please provide a valid reason for this late cancellation. If rejected, the session may be marked as a No Show.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="lateCancelReason">Reason for Late Cancellation</Label>
              <Input
                id="lateCancelReason"
                placeholder="Medical emergency, stuck at work..."
                value={lateCancelReason}
                onChange={(e) => setLateCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLateCancelDialogOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" onClick={handleLateCancelSubmit} disabled={!lateCancelReason.trim()}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AssessmentDialog
        open={assessmentDialogOpen}
        onOpenChange={setAssessmentDialogOpen}
        client={client}
        coaches={coaches}
      />
      <SessionRatingDialog 
        session={selectedRatingSession}
        onOpenChange={(open) => {
          if (!open) setSelectedRatingSession(null);
        }}
      />
    </div>
  );
}
