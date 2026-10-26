import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  setDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { Assessment, Client, User, Session, Payment } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { isPaymentInRevenueScope } from '../utils/permissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ClipboardList,
  UserCheck,
  Search,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  Globe,
  Award,
  Users,
  Dumbbell,
  Plus,
  Minus,
  RotateCcw,
  Trash2,
  Snowflake,
  DollarSign,
  Target,
  ShieldCheck,
  XCircle,
  UserPlus,
  FileCheck,
} from 'lucide-react';
import { safeFormatDate, toValidDate } from '../utils/dateUtils';
import { openWhatsAppChat } from '../utils/whatsappTemplates';

type FMCommandTab =
  | 'triage'
  | 'trainers'
  | 'pt_controls'
  | 'session_approvals'
  | 'workouts'
  | 'services_revenue';

export default function CoachFitnessManagerView() {
  const { currentUser } = useAuth();
  const { branding } = useSettings();
  const clubLabel = branding?.companyName || 'INZAN ATHLETICS';
  const currency = branding?.currencySymbol || 'EGP';

  const [commandTab, setCommandTab] = useState<FMCommandTab>('triage');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [coaches, setCoaches] = useState<User[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<string, Client>>({});
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workoutTemplates, setWorkoutTemplates] = useState<any[]>([]);
  const [assignedWorkouts, setAssignedWorkouts] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'unassigned' | 'assigned' | 'all'>('unassigned');
  const [selectedCoachByAssessment, setSelectedCoachByAssessment] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Trainers & Targets State ---
  const [newTrainerName, setNewTrainerName] = useState('');
  const [newTrainerEmail, setNewTrainerEmail] = useState('');
  const [newTrainerPhone, setNewTrainerPhone] = useState('');
  const [newTrainerSpecialty, setNewTrainerSpecialty] = useState('Personal Trainer');
  const [newTrainerTarget, setNewTrainerTarget] = useState('');
  const [newTrainerSalary, setNewTrainerSalary] = useState('');
  const [newTrainerCommission, setNewTrainerCommission] = useState('15');
  const [creatingTrainer, setCreatingTrainer] = useState(false);
  const [coachEdits, setCoachEdits] = useState<
    Record<string, { target: string; baseSalary: string; commissionPct: string; commissionApproved?: boolean }>
  >({});
  const [savingCoachId, setSavingCoachId] = useState<string | null>(null);

  // --- PT Controls & Freeze State ---
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [ptFreezeDays, setPtFreezeDays] = useState('14');
  const [ptFreezeReason, setPtFreezeReason] = useState('');
  const [selectedCoachForMember, setSelectedCoachForMember] = useState('');

  useEffect(() => {
    const unsubAssessments = onSnapshot(collection(db, 'assessments'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Assessment));
      list.sort((a, b) => (toValidDate(b.createdAt)?.getTime() || 0) - (toValidDate(a.createdAt)?.getTime() || 0));
      setAssessments(list);
      setLoading(false);
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      const cMap: Record<string, Client> = {};
      snap.docs.forEach((d) => {
        cMap[d.id] = { ...d.data(), id: d.id } as Client;
      });
      setClientsMap(cMap);
    });

    const unsubSessions = onSnapshot(collection(db, 'sessions'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Session));
      list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      setSessions(list);
    });

    const unsubTemplates = onSnapshot(collection(db, 'workoutTemplates'), (snap) => {
      setWorkoutTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubAssignedWorkouts = onSnapshot(collection(db, 'assignedWorkouts'), (snap) => {
      setAssignedWorkouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubPayments = onSnapshot(collection(db, 'payments'), (snap) => {
      setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment)));
    });

    const loadCoaches = async () => {
      try {
        const [coachesSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'coaches')),
          getDocs(collection(db, 'users')),
        ]);

        const coachListMap = new Map<string, User & { baseSalary?: number; commissionPct?: number; commissionApproved?: boolean }>();
        coachesSnap.docs.forEach((d) => {
          const data = d.data() as any;
          if (data.status !== 'Inactive' && data.active !== false) {
            coachListMap.set(d.id, {
              id: d.id,
              name: data.name || 'Coach',
              email: data.email || '',
              phone: data.phone || '',
              role: 'coach',
              coachId: data.coachId || d.id,
              branch: data.branch || clubLabel,
              salesTarget: Number(data.salesTarget || data.monthlyTarget || 0),
              baseSalary: Number(data.baseSalary || 0),
              commissionPct: Number(data.commissionPct ?? 15),
              commissionApproved: Boolean(data.commissionApproved),
            });
          }
        });
        usersSnap.docs.forEach((d) => {
          const data = d.data() as any;
          if (data.role === 'coach' || data.role === 'trainer' || data.role === 'fitness_manager') {
            const existing = coachListMap.get(d.id);
            coachListMap.set(d.id, {
              id: d.id,
              name: data.name || existing?.name || 'Coach',
              email: data.email || existing?.email || '',
              phone: data.phone || existing?.phone || '',
              role: data.role || 'coach',
              coachId: data.coachId || existing?.coachId || d.id,
              branch: data.branch || existing?.branch || clubLabel,
              salesTarget: Number(data.salesTarget ?? existing?.salesTarget ?? 0),
              baseSalary: Number(data.baseSalary ?? existing?.baseSalary ?? 0),
              commissionPct: Number(data.commissionPct ?? existing?.commissionPct ?? 15),
              commissionApproved: Boolean(data.commissionApproved ?? existing?.commissionApproved),
            });
          }
        });

        const sorted = Array.from(coachListMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        setCoaches(sorted);
        const edits: Record<string, { target: string; baseSalary: string; commissionPct: string; commissionApproved?: boolean }> = {};
        sorted.forEach((c: any) => {
          edits[c.id] = {
            target: String(c.salesTarget || 0),
            baseSalary: String(c.baseSalary || 0),
            commissionPct: String(c.commissionPct ?? 15),
            commissionApproved: Boolean(c.commissionApproved),
          };
        });
        setCoachEdits(edits);
      } catch (err) {
        console.error('Error loading coaches for Fitness Manager board:', err);
      }
    };

    loadCoaches();
    return () => {
      unsubAssessments();
      unsubClients();
      unsubSessions();
      unsubTemplates();
      unsubAssignedWorkouts();
      unsubPayments();
    };
  }, [clubLabel]);

  const getClientEntitlementInfo = (assessment: any) => {
    const client = assessment.clientId ? clientsMap[assessment.clientId] : null;
    const pkgs: any[] = Array.isArray(client?.packages) ? client!.packages : [];
    const activePtPkg = pkgs.find(
      (p) =>
        p?.status === 'Active' &&
        (/pt|private|trainer/i.test(`${p?.category || ''} ${p?.packageName || ''}`) || p?.type === 'pt') &&
        (Number(p?.sessionsRemaining) || 0) > 0
    );
    const paidPtRemaining =
      activePtPkg?.sessionsRemaining ??
      (typeof client?.ptSessionsRemaining === 'number' && client.ptSessionsRemaining > 0
        ? client.ptSessionsRemaining
        : 0);

    const freePtTotal =
      (client as any)?.freePtSessionsTotal ??
      pkgs.reduce((acc, p) => acc + (Number(p?.freePtSessions) || 0), 0) ??
      assessment.freePtSessionsRemaining ??
      0;
    const freePtUsed = (client as any)?.freePtSessionsUsed ?? 0;
    const freePtRemaining = Math.max(
      0,
      typeof assessment.freePtSessionsRemaining === 'number'
        ? assessment.freePtSessionsRemaining
        : freePtTotal - freePtUsed
    );

    if (paidPtRemaining > 0) {
      return {
        type: 'paid' as const,
        label: `Paid PT Package (${paidPtRemaining} Sessions)`,
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        canScheduleImmediately: true,
        freePtRemaining,
        paidPtRemaining,
      };
    }

    if (freePtRemaining > 0) {
      return {
        type: 'free' as const,
        label: `${freePtRemaining} Free PT Sessions Included`,
        badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
        canScheduleImmediately: true,
        freePtRemaining,
        paidPtRemaining: 0,
      };
    }

    return {
      type: 'none' as const,
      label: '0 Free PT • Needs Paid PT Package After Assessment',
      badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
      canScheduleImmediately: false,
      freePtRemaining: 0,
      paidPtRemaining: 0,
    };
  };

  const handleAssignCoach = async (assessment: any) => {
    const chosenCoachId =
      selectedCoachByAssessment[assessment.id] ||
      assessment.assignedCoachId ||
      assessment.preferredCoachId ||
      '';
    if (!chosenCoachId) {
      alert('Please select a Coach to assign this member to.');
      return;
    }

    const coach = coaches.find((c) => c.id === chosenCoachId);
    const coachName = coach?.name || assessment.preferredCoachName || 'Assigned Coach';

    setAssigningId(assessment.id);
    try {
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, 'assessments', assessment.id), {
        assignedCoachId: chosenCoachId,
        assignedCoachName: coachName,
        triageStatus: 'AssignedByFitnessManager',
        assignedByFitnessManagerId: currentUser?.id || 'fitness_manager',
        assignedByFitnessManagerName: currentUser?.name || 'Fitness Manager',
        assignedAt: nowIso,
        updatedAt: nowIso,
      });

      if (assessment.clientId && assessment.clientId !== 'guest') {
        try {
          await updateDoc(doc(db, 'clients', assessment.clientId), {
            assignedCoachId: chosenCoachId,
            assignedCoachName: coachName,
            trainerName: coachName,
            ptAssessmentStatus: 'AssignedToCoach',
            assignedByFitnessManagerAt: nowIso,
            updatedAt: nowIso,
          });
        } catch (clientErr) {
          console.warn('Could not update client document with assigned coach:', clientErr);
        }
      }

      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'CLIENT',
        entityId: assessment.clientId || assessment.id,
        details: `Fitness Manager assigned member ${assessment.clientName} to Coach ${coachName} (Assessment #${assessment.id})`,
        timestamp: nowIso,
        userId: currentUser?.id || 'fitness_manager',
        userName: currentUser?.name || 'Fitness Manager',
      });
    } catch (err: any) {
      console.error('Error assigning coach:', err);
      alert(err.message || 'Failed to assign coach.');
    } finally {
      setAssigningId(null);
    }
  };

  // --- Add New Trainer ---
  const handleCreateTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrainerName.trim() || !newTrainerEmail.trim()) {
      alert('Please provide Trainer Name and Email.');
      return;
    }
    setCreatingTrainer(true);
    try {
      const nowIso = new Date().toISOString();
      const trainerRef = doc(collection(db, 'users'));
      const payload = {
        id: trainerRef.id,
        name: newTrainerName.trim(),
        email: newTrainerEmail.trim().toLowerCase(),
        phone: newTrainerPhone.trim(),
        role: 'coach',
        department: 'Fitness',
        jobTitle: newTrainerSpecialty || 'Personal Trainer',
        salesTarget: Number(newTrainerTarget) || 0,
        baseSalary: Number(newTrainerSalary) || 0,
        commissionPct: Number(newTrainerCommission) || 15,
        commissionApproved: true,
        status: 'Active',
        active: true,
        createdAt: nowIso,
        createdBy: currentUser?.name || 'Fitness Manager',
      };
      await setDoc(trainerRef, payload);
      await setDoc(doc(db, 'coaches', trainerRef.id), payload);

      setCoaches((prev) => [...prev, payload as any]);
      setCoachEdits((prev) => ({
        ...prev,
        [trainerRef.id]: {
          target: String(payload.salesTarget),
          baseSalary: String(payload.baseSalary),
          commissionPct: String(payload.commissionPct),
          commissionApproved: true,
        },
      }));
      setNewTrainerName('');
      setNewTrainerEmail('');
      setNewTrainerPhone('');
      setNewTrainerTarget('');
      setNewTrainerSalary('');
      alert(`Trainer ${payload.name} created and added to Fitness team!`);
    } catch (err) {
      console.error('Failed to create trainer:', err);
      alert('Failed to create trainer.');
    } finally {
      setCreatingTrainer(false);
    }
  };

  // --- Save Trainer Target, Salary & Commission Approval ---
  const handleSaveTrainerFinancials = async (coach: User, approveCommission = false) => {
    const edits = coachEdits[coach.id];
    if (!edits) return;
    setSavingCoachId(coach.id);
    try {
      const nowIso = new Date().toISOString();
      const updates = {
        salesTarget: Number(edits.target) || 0,
        monthlyTarget: Number(edits.target) || 0,
        baseSalary: Number(edits.baseSalary) || 0,
        commissionPct: Number(edits.commissionPct) || 0,
        commissionApproved: approveCommission ? true : Boolean(edits.commissionApproved),
        commissionApprovedBy: currentUser?.name || 'Fitness Manager',
        commissionApprovedAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(doc(db, 'users', coach.id), updates, { merge: true });
      await setDoc(doc(db, 'coaches', coach.id), { ...updates, name: coach.name, email: coach.email }, { merge: true });

      setCoachEdits((prev) => ({
        ...prev,
        [coach.id]: {
          ...prev[coach.id]!,
          commissionApproved: updates.commissionApproved,
        },
      }));
      alert(`Saved target, salary & commission for ${coach.name}!`);
    } catch (err) {
      console.error('Error saving trainer financials:', err);
      alert('Failed to save trainer settings.');
    } finally {
      setSavingCoachId(null);
    }
  };

  // --- PT Session Adjustments (+, -, Reset Old, Freeze PT Package, Assign Trainer) ---
  const handleAdjustMemberPtSessions = async (client: Client, action: 'add' | 'deduct' | 'reset') => {
    const currentSessions = Number(client.ptSessionsRemaining ?? client.sessionsRemaining ?? 0);
    let nextSessions = currentSessions;
    if (action === 'add') nextSessions = currentSessions + 1;
    else if (action === 'deduct') nextSessions = Math.max(0, currentSessions - 1);
    else if (action === 'reset') {
      if (!window.confirm(`Reset old PT sessions for ${client.name} to 0?`)) return;
      nextSessions = 0;
    }

    try {
      const nowIso = new Date().toISOString();
      const pkgs = Array.isArray(client.packages) ? [...client.packages] : [];
      const ptIdx = pkgs.findIndex(
        (p: any) =>
          p?.status === 'Active' &&
          (/pt|private|trainer/i.test(`${p?.category || ''} ${p?.packageName || ''}`) || p?.type === 'pt')
      );
      if (ptIdx >= 0 && pkgs[ptIdx]) {
        pkgs[ptIdx] = { ...pkgs[ptIdx]!, sessionsRemaining: nextSessions };
      }

      await updateDoc(doc(db, 'clients', client.id), {
        ptSessionsRemaining: nextSessions,
        sessionsRemaining: nextSessions,
        ...(ptIdx >= 0 ? { packages: pkgs } : {}),
        ...(action === 'reset' ? { freePtSessionsUsed: 0, freePtSessionsRemaining: 0 } : {}),
        updatedAt: nowIso,
      });

      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'CLIENT',
        entityId: client.id,
        details: `Fitness Manager (${currentUser?.name}) adjusted PT sessions (${action.toUpperCase()}) for ${client.name}: ${currentSessions} -> ${nextSessions}`,
        timestamp: nowIso,
        userId: currentUser?.id || 'fitness_manager',
        userName: currentUser?.name || 'Fitness Manager',
      });
    } catch (err) {
      console.error('Error adjusting PT sessions:', err);
      alert('Failed to adjust PT sessions.');
    }
  };

  const handleFreezePtPackage = async (client: Client) => {
    const days = Math.max(1, parseInt(ptFreezeDays, 10) || 14);
    try {
      const nowIso = new Date().toISOString();
      const endFreeze = new Date();
      endFreeze.setDate(endFreeze.getDate() + days);

      await updateDoc(doc(db, 'clients', client.id), {
        ptPackageFrozen: true,
        ptFreezeStartDate: nowIso.slice(0, 10),
        ptFreezeEndDate: endFreeze.toISOString().slice(0, 10),
        ptFreezeDays: days,
        ptFreezeReason: ptFreezeReason.trim() || 'Frozen by Fitness Manager',
        updatedAt: nowIso,
      });
      setPtFreezeReason('');
      alert(`PT Package frozen for ${client.name} for ${days} days.`);
    } catch (err) {
      console.error('Error freezing PT package:', err);
      alert('Failed to freeze PT package.');
    }
  };

  const handleUnfreezePtPackage = async (client: Client) => {
    try {
      await updateDoc(doc(db, 'clients', client.id), {
        ptPackageFrozen: false,
        ptFreezeEndDate: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString(),
      });
      alert(`PT Package unfrozen for ${client.name}.`);
    } catch (err) {
      console.error('Error unfreezing PT package:', err);
    }
  };

  const handleDirectAssignMemberCoach = async (client: Client, coachId: string) => {
    const coach = coaches.find((c) => c.id === coachId);
    if (!coach) return;
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, 'clients', client.id), {
        assignedCoachId: coach.id,
        assignedCoachName: coach.name,
        trainerName: coach.name,
        assignedByFitnessManagerAt: nowIso,
        updatedAt: nowIso,
      });
      alert(`Assigned ${client.name} to trainer ${coach.name}!`);
    } catch (err) {
      console.error('Error assigning trainer to member:', err);
      alert('Failed to assign trainer.');
    }
  };

  // --- Approve / Reject Session Cancellation Requests or Delete Session ---
  const handleResolveCancelRequest = async (session: Session, approve: boolean) => {
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, 'sessions', session.id), {
        ...(approve ? { status: 'Cancelled' } : {}),
        cancellationRequest: {
          ...(session.cancellationRequest || {}),
          status: approve ? 'Approved' : 'Rejected',
          resolvedBy: currentUser?.name || 'Fitness Manager',
          resolvedAt: nowIso,
        },
        updatedAt: nowIso,
      });
    } catch (err) {
      console.error('Error resolving cancellation request:', err);
      alert('Failed to process cancellation request.');
    }
  };

  const handleDeleteSession = async (session: Session) => {
    if (!window.confirm(`Permanently delete PT session for ${session.clientName || 'Member'} on ${session.date}?`)) return;
    try {
      await deleteDoc(doc(db, 'sessions', session.id));
    } catch (err) {
      console.error('Error deleting session:', err);
      alert('Failed to delete session.');
    }
  };

  // --- Approve / Reject Workouts ---
  const handleApproveWorkout = async (collectionName: 'workoutTemplates' | 'assignedWorkouts', id: string, status: 'Approved' | 'Rejected') => {
    try {
      await updateDoc(doc(db, collectionName, id), {
        approvalStatus: status,
        approvedBy: currentUser?.name || 'Fitness Manager',
        approvedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error updating workout approval:', err);
      alert('Failed to update workout approval.');
    }
  };

  const filteredAssessments = useMemo(() => {
    return assessments.filter((a: any) => {
      const isAssigned = Boolean(a.assignedCoachId && a.triageStatus !== 'AwaitingFitnessManager');
      if (filterTab === 'unassigned' && isAssigned) return false;
      if (filterTab === 'assigned' && !isAssigned) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = (a.clientName || '').toLowerCase().includes(q);
        const matchPhone = (a.phone || '').includes(q);
        const matchId = String(a.membershipId || '').toLowerCase().includes(q);
        const matchCoach = (a.assignedCoachName || a.preferredCoachName || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchId && !matchCoach) return false;
      }
      return true;
    });
  }, [assessments, filterTab, search]);

  const unassignedCount = assessments.filter(
    (a: any) => !a.assignedCoachId || a.triageStatus === 'AwaitingFitnessManager'
  ).length;
  const assignedCount = assessments.length - unassignedCount;

  const pendingCancelSessions = useMemo(
    () => sessions.filter((s) => s.cancellationRequest?.status === 'Pending'),
    [sessions]
  );

  // Services Revenue Only (PT, Classes/Instructors, Nutrition — NO Memberships)
  const servicesPayments = useMemo(
    () => payments.filter((p) => isPaymentInRevenueScope(p, 'services_only')),
    [payments]
  );

  const servicesBreakdown = useMemo(() => {
    let ptTotal = 0;
    let nutritionTotal = 0;
    let classesTotal = 0;
    servicesPayments.forEach((p: any) => {
      const amt = Number(p.amount) || 0;
      const text = `${p.category || ''} ${p.packageName || ''} ${p.type || ''} ${p.notes || ''}`.toLowerCase();
      if (/nutrition|diet|inbody/i.test(text)) {
        nutritionTotal += amt;
      } else if (/class|instructor|group|sgf|mma|boxing|yoga|spinning/i.test(text)) {
        classesTotal += amt;
      } else {
        ptTotal += amt;
      }
    });
    return {
      ptTotal,
      nutritionTotal,
      classesTotal,
      grandTotal: ptTotal + nutritionTotal + classesTotal,
    };
  }, [servicesPayments]);

  const searchedMembers = useMemo(() => {
    const all = Object.values(clientsMap);
    if (!memberSearch.trim()) return all.slice(0, 15);
    const q = memberSearch.toLowerCase();
    return all
      .filter(
        (c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          String(c.memberId || '').toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [clientsMap, memberSearch]);

  const selectedMember = selectedMemberId ? clientsMap[selectedMemberId] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header Banner */}
      <Card className="border-2 border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge className="bg-primary text-primary-foreground text-[10px] font-extrabold uppercase tracking-wider">
              {clubLabel} • Fitness Manager Command Suite
            </Badge>
            <div className="flex items-center gap-2 text-xs font-bold">
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                {unassignedCount} Awaiting Coach Assignment
              </Badge>
              {pendingCancelSessions.length > 0 && (
                <Badge className="bg-red-500 text-white">
                  {pendingCancelSessions.length} Session Cancel Requests
                </Badge>
              )}
            </div>
          </div>
          <CardTitle className="text-xl font-extrabold flex items-center gap-2 mt-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Fitness Manager Operations &amp; Approvals
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Distribute clients to trainers, manage trainer targets/salaries/commissions, freeze PT packages, add/deduct/reset PT sessions, approve coach session cancellations &amp; workouts, and monitor Services financials (PT, Classes &amp; Nutrition).
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Command Suite Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {(
          [
            { id: 'triage', label: `Client Distribution (${unassignedCount})`, icon: <UserCheck className="h-3.5 w-3.5" /> },
            { id: 'trainers', label: `Trainers, Targets & Commissions (${coaches.length})`, icon: <Target className="h-3.5 w-3.5" /> },
            { id: 'pt_controls', label: 'PT Freeze & Session (+/-) Controls', icon: <Snowflake className="h-3.5 w-3.5" /> },
            { id: 'session_approvals', label: `Session Cancellations (${pendingCancelSessions.length})`, icon: <Clock className="h-3.5 w-3.5" /> },
            { id: 'workouts', label: 'Approve Workouts', icon: <FileCheck className="h-3.5 w-3.5" /> },
            { id: 'services_revenue', label: 'Services Revenue (PT / Classes / Nutrition)', icon: <DollarSign className="h-3.5 w-3.5" /> },
          ] as const
        ).map((tab) => (
          <Button
            key={tab.id}
            size="sm"
            variant={commandTab === tab.id ? 'default' : 'outline'}
            onClick={() => setCommandTab(tab.id)}
            className="text-xs font-bold gap-1.5 rounded-xl"
          >
            {tab.icon}
            {tab.label}
          </Button>
        ))}
      </div>

      {/* TAB 1: CLIENT DISTRIBUTION & ASSESSMENT TRIAGE */}
      {commandTab === 'triage' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border">
              <button
                type="button"
                onClick={() => setFilterTab('unassigned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  filterTab === 'unassigned'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Needs Assignment ({unassignedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('assigned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  filterTab === 'assigned'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Assigned ({assignedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterTab === 'all'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({assessments.length})
              </button>
            </div>

            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9 text-xs"
                placeholder="Search member name, ID, phone, or coach..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filteredAssessments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
                <ClipboardList className="h-10 w-10 opacity-25" />
                <p className="text-sm font-semibold">No PT Assessment requests in this view.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3.5">
              {filteredAssessments.map((assessment: any) => {
                const entitlement = getClientEntitlementInfo(assessment);
                const isAssigned = Boolean(
                  assessment.assignedCoachId && assessment.triageStatus !== 'AwaitingFitnessManager'
                );
                const currentSelectedCoach =
                  selectedCoachByAssessment[assessment.id] ??
                  assessment.assignedCoachId ??
                  assessment.preferredCoachId ??
                  '';
                const cleanPhone = String(assessment.phone || '').replace(/[^0-9]/g, '');

                return (
                  <Card
                    key={assessment.id}
                    className={`border transition-all shadow-xs ${
                      isAssigned ? 'bg-card/60' : 'border-l-4 border-l-amber-500 bg-card'
                    }`}
                  >
                    <CardContent className="p-4 space-y-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-base">{assessment.clientName}</span>
                            {assessment.source === 'website' && (
                              <Badge variant="outline" className="text-[11px] bg-blue-500/10 text-blue-600 border-blue-500/30 gap-1">
                                <Globe className="h-3 w-3" /> Website
                              </Badge>
                            )}
                            {assessment.membershipId && (
                              <Badge variant="outline" className="font-mono text-[11px]">
                                ID: {assessment.membershipId}
                              </Badge>
                            )}
                            <Badge variant="outline" className={`text-[11px] font-bold ${entitlement.badgeClass}`}>
                              <Dumbbell className="h-3 w-3 mr-1" />
                              {entitlement.label}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {assessment.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {assessment.phone}
                                {cleanPhone && (
                                  <a
                                    href={`https://wa.me/${cleanPhone}`}
                                    target="whatsapp_crm"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      openWhatsAppChat({ phone: cleanPhone });
                                    }}
                                    className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline ml-1"
                                  >
                                    WhatsApp ↗
                                  </a>
                                )}
                              </span>
                            )}
                            {assessment.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {assessment.email}
                              </span>
                            )}
                            <span>
                              Requested: {safeFormatDate(assessment.createdAt, 'dd MMM yyyy HH:mm', 'Recently')}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {assessment.hasCoachPreference && (
                            <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-xs font-bold">
                              <Award className="h-3 w-3 mr-1" />
                              Preferred: {assessment.preferredCoachName || assessment.coachName}
                            </Badge>
                          )}
                          <Badge
                            variant={isAssigned ? 'default' : 'outline'}
                            className={
                              isAssigned
                                ? 'bg-emerald-600 text-white text-xs'
                                : 'border-amber-500/50 text-amber-600 dark:text-amber-400 text-xs font-bold'
                            }
                          >
                            {isAssigned ? `Assigned: ${assessment.assignedCoachName}` : 'Unassigned'}
                          </Badge>
                        </div>
                      </div>

                      <div className="pt-2 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-[11px] text-muted-foreground">
                          Assign or redistribute this client to any trainer on your team.
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={currentSelectedCoach}
                            onValueChange={(val) =>
                              setSelectedCoachByAssessment((prev) => ({
                                ...prev,
                                [assessment.id]: val || '',
                              }))
                            }
                          >
                            <SelectTrigger className="w-52 h-8 text-xs bg-background">
                              <SelectValue placeholder="Assign to Coach..." />
                            </SelectTrigger>
                            <SelectContent>
                              {coaches.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            size="sm"
                            disabled={assigningId === assessment.id || !currentSelectedCoach}
                            onClick={() => handleAssignCoach(assessment)}
                            className="h-8 text-xs font-bold gap-1.5"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            {assigningId === assessment.id
                              ? 'Assigning...'
                              : isAssigned
                              ? 'Reassign Coach'
                              : 'Assign to Coach'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TRAINERS, TARGETS, SALARIES & COMMISSIONS */}
      {commandTab === 'trainers' && (
        <div className="space-y-6">
          <Card className="border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" /> Add New Trainer / Coach
              </CardTitle>
              <CardDescription className="text-xs">
                Create a trainer profile and configure their initial monthly target, base salary, and commission percentage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateTrainer} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">Trainer Name *</Label>
                  <Input
                    value={newTrainerName}
                    onChange={(e) => setNewTrainerName(e.target.value)}
                    placeholder="Coach Name"
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">Email *</Label>
                  <Input
                    type="email"
                    value={newTrainerEmail}
                    onChange={(e) => setNewTrainerEmail(e.target.value)}
                    placeholder="coach@inzan.com"
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">Phone</Label>
                  <Input
                    value={newTrainerPhone}
                    onChange={(e) => setNewTrainerPhone(e.target.value)}
                    placeholder="010..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">Monthly Target ({currency})</Label>
                  <Input
                    type="number"
                    value={newTrainerTarget}
                    onChange={(e) => setNewTrainerTarget(e.target.value)}
                    placeholder="50000"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">Base Salary ({currency})</Label>
                  <Input
                    type="number"
                    value={newTrainerSalary}
                    onChange={(e) => setNewTrainerSalary(e.target.value)}
                    placeholder="8000"
                    className="h-8 text-xs"
                  />
                </div>
                <Button type="submit" size="sm" disabled={creatingTrainer} className="h-8 text-xs font-bold gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  {creatingTrainer ? 'Adding...' : 'Add Trainer'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {coaches.map((coach) => {
              const edit = coachEdits[coach.id] || {
                target: '0',
                baseSalary: '0',
                commissionPct: '15',
                commissionApproved: false,
              };
              return (
                <Card key={coach.id} className="border bg-card">
                  <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{coach.name}</span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {coach.email || coach.id}
                        </Badge>
                        {edit.commissionApproved && (
                          <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30 text-[10px]">
                            ✓ Commission &amp; Salary Approved
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Target ({currency})</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={edit.target}
                          onChange={(e) =>
                            setCoachEdits((prev) => ({
                              ...prev,
                              [coach.id]: { ...edit, target: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Base Salary ({currency})</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={edit.baseSalary}
                          onChange={(e) =>
                            setCoachEdits((prev) => ({
                              ...prev,
                              [coach.id]: { ...edit, baseSalary: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Commission (%)</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={edit.commissionPct}
                          onChange={(e) =>
                            setCoachEdits((prev) => ({
                              ...prev,
                              [coach.id]: { ...edit, commissionPct: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          disabled={savingCoachId === coach.id}
                          onClick={() => handleSaveTrainerFinancials(coach, true)}
                          className="h-8 text-xs font-bold gap-1 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Save &amp; Approve
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: PT PACKAGE FREEZE & SESSION (+/- / RESET) CONTROLS */}
      {commandTab === 'pt_controls' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Select Member</CardTitle>
              <CardDescription className="text-xs">
                Search any member to distribute to a trainer, freeze PT package, or add/remove/reset PT sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-2.5" />
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Name, phone, or Member ID..."
                  className="pl-9 h-8 text-xs"
                />
              </div>
              <div className="max-h-96 overflow-y-auto divide-y border rounded-xl">
                {searchedMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMemberId(m.id);
                      setSelectedCoachForMember((m as any).assignedCoachId || '');
                    }}
                    className={`w-full text-left p-2.5 text-xs flex items-center justify-between transition-colors ${
                      selectedMemberId === m.id ? 'bg-primary/10 font-bold text-primary' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div>
                      <p className="font-bold">{m.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        ID: {m.memberId || 'N/A'} • {m.phone}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {Number(m.ptSessionsRemaining ?? m.sessionsRemaining ?? 0)} PT
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">
                {selectedMember ? `PT Controls: ${selectedMember.name}` : 'Select a Member from the left list'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedMember ? (
                <p className="text-xs text-muted-foreground py-12 text-center">
                  Choose a member to manage their PT sessions, trainer assignment, or PT package freeze.
                </p>
              ) : (
                <div className="space-y-6">
                  {/* Session Balance (+ / - / Reset) */}
                  <div className="p-4 rounded-xl border bg-muted/20 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase text-muted-foreground">Current PT Session Balance</p>
                      <p className="text-3xl font-black text-primary mt-1">
                        {Number(selectedMember.ptSessionsRemaining ?? selectedMember.sessionsRemaining ?? 0)} Sessions
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Assigned Coach: <strong>{(selectedMember as any).assignedCoachName || 'Unassigned'}</strong>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAdjustMemberPtSessions(selectedMember, 'add')}
                        className="h-9 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Session (+1)
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAdjustMemberPtSessions(selectedMember, 'deduct')}
                        className="h-9 text-xs font-bold gap-1 border-amber-500/40 text-amber-500"
                      >
                        <Minus className="h-3.5 w-3.5" /> Deduct Session (-1)
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAdjustMemberPtSessions(selectedMember, 'reset')}
                        className="h-9 text-xs font-bold gap-1 border-red-500/40 text-red-500"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reset Old Sessions (0)
                      </Button>
                    </div>
                  </div>

                  {/* Distribute / Assign Member to Trainer */}
                  <div className="p-4 rounded-xl border space-y-2">
                    <Label className="text-xs font-bold">Distribute / Assign Client to Trainer</Label>
                    <div className="flex items-center gap-2">
                      <Select value={selectedCoachForMember} onValueChange={(v) => setSelectedCoachForMember(v || '')}>
                        <SelectTrigger className="h-9 text-xs flex-1">
                          <SelectValue placeholder="Choose Trainer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {coaches.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!selectedCoachForMember}
                        onClick={() => handleDirectAssignMemberCoach(selectedMember, selectedCoachForMember)}
                        className="h-9 text-xs font-bold"
                      >
                        Assign Trainer
                      </Button>
                    </div>
                  </div>

                  {/* PT Package Freeze */}
                  <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold flex items-center gap-1.5 text-cyan-500">
                        <Snowflake className="h-4 w-4" /> Freeze PT Package
                      </Label>
                      {(selectedMember as any).ptPackageFrozen && (
                        <Badge className="bg-cyan-500 text-black text-[10px] font-bold">
                          Frozen until {(selectedMember as any).ptFreezeEndDate}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                      <div>
                        <Label className="text-[10px]">Freeze Duration (Days)</Label>
                        <Input
                          type="number"
                          value={ptFreezeDays}
                          onChange={(e) => setPtFreezeDays(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Reason</Label>
                        <Input
                          value={ptFreezeReason}
                          onChange={(e) => setPtFreezeReason(e.target.value)}
                          placeholder="Travel / Injury / Request..."
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleFreezePtPackage(selectedMember)}
                          className="h-8 text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black flex-1"
                        >
                          Freeze PT
                        </Button>
                        {(selectedMember as any).ptPackageFrozen && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnfreezePtPackage(selectedMember)}
                            className="h-8 text-xs font-bold"
                          >
                            Unfreeze
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: SESSION CANCELLATION APPROVALS & SESSION DELETION */}
      {commandTab === 'session_approvals' && (
        <div className="space-y-4">
          <Card className="border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">
                Coach Session Cancellation Requests &amp; All PT Sessions
              </CardTitle>
              <CardDescription className="text-xs">
                Regular coaches cannot cancel a PT session on their own. Approve or decline their cancellation requests here, or delete any session directly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sessions.slice(0, 40).map((s) => {
                const isPendingCancel = s.cancellationRequest?.status === 'Pending';
                return (
                  <div
                    key={s.id}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isPendingCancel ? 'border-amber-500 bg-amber-500/10' : 'bg-card'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{s.clientName || 'Member'}</span>
                        <Badge variant="outline" className="text-[10px]">
                          Coach: {(s as any).coachName || s.coachId}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {s.status}
                        </Badge>
                        {isPendingCancel && (
                          <Badge className="bg-amber-500 text-black text-[10px] font-bold">
                            Cancel Requested: {s.cancellationRequest?.reason}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.date} • {s.startTime} {s.endTime ? `- ${s.endTime}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPendingCancel && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleResolveCancelRequest(s, true)}
                            className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Approve Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResolveCancelRequest(s, false)}
                            className="h-8 text-xs font-bold"
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteSession(s)}
                        className="h-8 text-xs text-red-500 hover:bg-red-500/10 gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete Session
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 5: WORKOUT APPROVALS */}
      {commandTab === 'workouts' && (
        <div className="space-y-4">
          <Card className="border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Trainer Workouts &amp; Templates Approval Queue</CardTitle>
              <CardDescription className="text-xs">
                Review and approve workouts created or assigned by trainers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ...assignedWorkouts.map((w) => ({ ...w, _col: 'assignedWorkouts' as const })),
                ...workoutTemplates.map((w) => ({ ...w, _col: 'workoutTemplates' as const })),
              ].length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">No workouts found.</p>
              ) : (
                [
                  ...assignedWorkouts.map((w) => ({ ...w, _col: 'assignedWorkouts' as const })),
                  ...workoutTemplates.map((w) => ({ ...w, _col: 'workoutTemplates' as const })),
                ].map((item) => (
                  <div
                    key={`${item._col}-${item.id}`}
                    className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{item.name || item.title || 'Workout Plan'}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {item._col === 'assignedWorkouts' ? `Assigned to ${item.clientName || 'Member'}` : 'Template'}
                        </Badge>
                        <Badge
                          className={`text-[10px] ${
                            item.approvalStatus === 'Approved'
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : item.approvalStatus === 'Rejected'
                              ? 'bg-red-500/20 text-red-500'
                              : 'bg-amber-500/20 text-amber-500'
                          }`}
                        >
                          {item.approvalStatus || 'Pending Approval'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Created by: {item.coachName || item.createdBy || 'Trainer'} • Exercises:{' '}
                        {Array.isArray(item.exercises) ? item.exercises.length : 0}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApproveWorkout(item._col, item.id, 'Approved')}
                        className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve Workout
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApproveWorkout(item._col, item.id, 'Rejected')}
                        className="h-8 text-xs font-bold text-red-500 border-red-500/30 gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 6: SERVICES FINANCIALS ONLY (PT, CLASSES/INSTRUCTORS, NUTRITION) */}
      {commandTab === 'services_revenue' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="border bg-emerald-500/5 border-emerald-500/30">
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Total Services Revenue</p>
                <p className="text-2xl font-black text-emerald-500 mt-1">
                  {currency} {servicesBreakdown.grandTotal.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Excludes Membership Sales</p>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Personal Training (PT)</p>
                <p className="text-2xl font-black text-primary mt-1">
                  {currency} {servicesBreakdown.ptTotal.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Classes &amp; Instructors</p>
                <p className="text-2xl font-black text-blue-500 mt-1">
                  {currency} {servicesBreakdown.classesTotal.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card className="border">
              <CardContent className="p-4">
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Nutrition Services</p>
                <p className="text-2xl font-black text-amber-500 mt-1">
                  {currency} {servicesBreakdown.nutritionTotal.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Recent Service Payments (PT, Classes &amp; Nutrition Only)</CardTitle>
            </CardHeader>
            <CardContent>
              {servicesPayments.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">No service payments recorded yet.</p>
              ) : (
                <div className="divide-y max-h-96 overflow-y-auto">
                  {servicesPayments.slice(0, 50).map((p: any) => (
                    <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold">{p.clientName || 'Member'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {p.packageName || p.category || p.type || 'Service'} • {safeFormatDate(p.date || p.createdAt, 'dd MMM yyyy', '')}
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono font-bold text-emerald-500 border-emerald-500/30">
                        {currency} {Number(p.amount || 0).toLocaleString()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
export { CoachFitnessManagerView };
