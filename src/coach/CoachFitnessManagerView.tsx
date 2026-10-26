import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, getDocs } from 'firebase/firestore';
import { Assessment, Client, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ClipboardList,
  UserCheck,
  Search,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Phone,
  Mail,
  Globe,
  Award,
  Users,
  Dumbbell,
} from 'lucide-react';
import { safeFormatDate, toValidDate } from '../utils/dateUtils';
import { openWhatsAppChat } from '../utils/whatsappTemplates';

export default function CoachFitnessManagerView() {
  const { currentUser } = useAuth();
  const { branding } = useSettings();
  const clubLabel = branding?.companyName || 'STRIKE';
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [coaches, setCoaches] = useState<User[]>([]);
  const [clientsMap, setClientsMap] = useState<Record<string, Client>>({});
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'unassigned' | 'assigned' | 'all'>('unassigned');
  const [selectedCoachByAssessment, setSelectedCoachByAssessment] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Subscribe to all assessments in db-inzanathletics
    const unsubAssessments = onSnapshot(collection(db, 'assessments'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Assessment));
      list.sort((a, b) => (toValidDate(b.createdAt)?.getTime() || 0) - (toValidDate(a.createdAt)?.getTime() || 0));
      setAssessments(list);
      setLoading(false);
    });

    // 2. Load active coaches & trainers
    const loadCoachesAndClients = async () => {
      try {
        const [coachesSnap, usersSnap, clientsSnap] = await Promise.all([
          getDocs(collection(db, 'coaches')),
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'clients')),
        ]);

        const coachListMap = new Map<string, User>();
        coachesSnap.docs.forEach((d) => {
          const data = d.data() as any;
          if (data.status !== 'Inactive' && data.active !== false) {
            coachListMap.set(d.id, {
              id: d.id,
              name: data.name || 'Coach',
              email: data.email || '',
              role: 'coach',
              coachId: data.coachId || d.id,
              branch: data.branch || clubLabel,
            });
          }
        });
        usersSnap.docs.forEach((d) => {
          const data = d.data() as any;
          if (data.role === 'coach' || data.role === 'trainer') {
            coachListMap.set(d.id, {
              id: d.id,
              name: data.name || 'Coach',
              email: data.email || '',
              role: 'coach',
              coachId: data.coachId || d.id,
              branch: data.branch || clubLabel,
            });
          }
        });

        setCoaches(Array.from(coachListMap.values()).sort((a, b) => a.name.localeCompare(b.name)));

        const cMap: Record<string, Client> = {};
        clientsSnap.docs.forEach((d) => {
          cMap[d.id] = { ...d.data(), id: d.id } as Client;
        });
        setClientsMap(cMap);
      } catch (err) {
        console.error('Error loading coaches/clients for Fitness Manager board:', err);
      }
    };

    loadCoachesAndClients();
    return () => unsubAssessments();
  }, []);

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

      // 1. Update Assessment document
      await updateDoc(doc(db, 'assessments', assessment.id), {
        assignedCoachId: chosenCoachId,
        assignedCoachName: coachName,
        triageStatus: 'AssignedByFitnessManager',
        assignedByFitnessManagerId: currentUser?.id || 'fitness_manager',
        assignedByFitnessManagerName: currentUser?.name || 'Fitness Manager',
        assignedAt: nowIso,
        updatedAt: nowIso,
      });

      // 2. Update Client document so CoachClients & MemberSessions immediately reflect the assigned coach
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

      // 3. Audit Log
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
              {clubLabel} • Fitness Manager Command Board
            </Badge>
            <div className="flex items-center gap-2 text-xs font-bold">
              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                {unassignedCount} Awaiting Coach Assignment
              </Badge>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                {assignedCount} Assigned to Coaches
              </Badge>
            </div>
          </div>
          <CardTitle className="text-xl font-extrabold flex items-center gap-2 mt-2">
            <UserCheck className="h-5 w-5 text-primary" />
            PT Assessment Triage & Coach Assignment
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Every PT Assessment request routes here first. Review the member&apos;s PT entitlement (Free PT sessions vs. Paid PT Package vs. Awaiting Payment), check their preferred coach/shift, and assign them to a Coach. Regular coaches only see members you assign to them.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Filter Tabs & Search */}
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

      {/* Assessment Requests List */}
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
                        {assessment.membershipType && (
                          <Badge variant="secondary" className="text-[11px]">
                            {assessment.membershipType}
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
                          Shift: <strong>{assessment.timePeriod || 'Flexible'}</strong> ({assessment.preferredHour || 'Any'})
                        </span>
                        <span>
                          Requested: {safeFormatDate(assessment.createdAt, 'dd MMM yyyy HH:mm', 'Recently')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {assessment.hasCoachPreference && (
                        <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary text-xs font-bold">
                          <Award className="h-3 w-3 mr-1" />
                          Member Preferred: {assessment.preferredCoachName || assessment.coachName}
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

                  {(assessment.notes || assessment.injuries || assessment.goals) && (
                    <div className="text-xs bg-muted/40 border rounded-lg p-2.5 space-y-1">
                      {(assessment.notes || assessment.injuries) && (
                        <p>
                          <strong className="uppercase text-[10px] tracking-wider text-muted-foreground">
                            Member Notes / Injuries:
                          </strong>{' '}
                          {assessment.notes || assessment.injuries}
                        </p>
                      )}
                      {assessment.goals && (
                        <p>
                          <strong className="uppercase text-[10px] tracking-wider text-muted-foreground">Goals:</strong>{' '}
                          {assessment.goals}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Coach Assignment Bar */}
                  <div className="pt-2 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-[11px] text-muted-foreground">
                      {entitlement.canScheduleImmediately ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          ✓ Once assigned, Coach can immediately schedule up to{' '}
                          {entitlement.paidPtRemaining > 0
                            ? `${entitlement.paidPtRemaining} Paid PT sessions`
                            : `${entitlement.freePtRemaining} Free PT sessions`}
                          .
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          ⚠ Once assigned, Coach will conduct the Assessment first. Session scheduling stays locked until member purchases a PT package.
                        </span>
                      )}
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
                              {c.name} {c.coachId ? `(${c.coachId})` : ''}
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
  );
}
