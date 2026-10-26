import React, { useState, useEffect, useMemo } from 'react';
import { isFitnessManagerUser, isGeneralManagerOrCEO } from '../utils/permissions';
import { getTenantId } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, getDocs, or, addDoc } from 'firebase/firestore';
import { Session, SessionStatus, Client, Assessment } from '../types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dumbbell, CheckCircle, XCircle, Clock, Ban, ClipboardList } from 'lucide-react';
import { safeFormatDate, toValidDate } from '../utils/dateUtils';
import { updatePTSessionStatus } from '../services/ptSessionService';
import { openWhatsAppChat } from '../utils/whatsappTemplates';

type StatusFilter = 'all' | SessionStatus;

const DEFAULT_STYLE = { 
  badge: 'bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700', 
  icon: <Clock className="h-3.5 w-3.5" /> 
};

const STATUS_STYLES: Record<string, { badge: string; icon: React.ReactNode }> = {
  Scheduled:   { badge: 'bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 font-semibold', icon: <Clock className="h-3.5 w-3.5" /> },
  Completed:   { badge: 'bg-zinc-900 text-white border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-300 font-bold', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  Attended:    { badge: 'bg-zinc-900 text-white border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-300 font-bold', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  'No Show':   { badge: 'bg-zinc-200 text-zinc-600 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 line-through', icon: <XCircle className="h-3.5 w-3.5" /> },
  Rescheduled: { badge: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700', icon: <Clock className="h-3.5 w-3.5" /> },
  Cancelled:   { badge: 'bg-zinc-100 text-zinc-400 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800', icon: <Ban className="h-3.5 w-3.5" /> },
};

export default function CoachSessions() {
  const { currentUser } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [clientMap, setClientMap] = useState<Record<string, Client>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = sessionStorage.getItem('coach_sessions_tab');
      if (stored) {
        sessionStorage.removeItem('coach_sessions_tab');
        return stored;
      }
    } catch {}
    return 'sessions';
  });
  const [loading, setLoading] = useState(true);
  const [completingAssessmentId, setCompletingAssessmentId] = useState<string | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [recommendedPackage, setRecommendedPackage] = useState('');
  const [assessmentWeight, setAssessmentWeight] = useState('');
  const [savingAssessment, setSavingAssessment] = useState(false);

  const isInzan = useMemo(() => {
    const tid = getTenantId().toLowerCase();
    return tid.includes('inzan') || tid === 'db-inzanathletics';
  }, []);

  const canDirectlyCancelSession = useMemo(() => {
    if (!isInzan) return true;
    return isFitnessManagerUser(currentUser) || isGeneralManagerOrCEO(currentUser) || currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?.role === 'super_admin';
  }, [isInzan, currentUser]);

  const handleRequestCancelSession = async (session: Session) => {
    const reason = window.prompt('Regular coaches cannot cancel a session directly. Please enter a reason to request Fitness Manager approval to cancel this session:', 'Member requested cancellation');
    if (reason === null) return;
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, 'sessions', session.id), {
        cancellationRequest: {
          status: 'Pending',
          requestedBy: currentUser?.id || '',
          requestedByName: currentUser?.name || 'Coach',
          requestedAt: nowIso,
          reason: reason.trim() || 'Requested by Coach',
        },
        updatedAt: nowIso,
      });
      alert('Cancellation request submitted to the Fitness Manager for approval.');
    } catch (err) {
      console.error('Failed to request session cancellation:', err);
      alert('Failed to submit cancellation request.');
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    
    // Fetch Sessions matching either coachId or trainerId
    let qSessions;
    try {
      qSessions = query(
        collection(db, 'sessions'),
        or(
          where('coachId', '==', currentUser.id),
          where('trainerId', '==', currentUser.id)
        )
      );
    } catch {
      qSessions = query(collection(db, 'sessions'), where('coachId', '==', currentUser.id));
    }

    const unsubSessions = onSnapshot(qSessions, async (snap) => {
      const records = snap.docs.map(d => ({ ...d.data(), id: d.id } as Session));
      records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setSessions(records);

      // Fetch client names for sessions
      const ids = [...new Set(records.map(r => r.clientId).filter(Boolean))];
      const map: Record<string, Client> = {};
      for (let i = 0; i < ids.length; i += 30) {
        const batch = ids.slice(i, i + 30);
        const cq = query(collection(db, 'clients'), where('__name__', 'in', batch));
        const csnap = await getDocs(cq);
        csnap.docs.forEach(d => { map[d.id] = { ...d.data(), id: d.id } as Client; });
      }
      setClientMap(prev => ({...prev, ...map}));
      setLoading(false);
    }, (err) => {
      console.error("Error fetching coach sessions:", err);
      // Fallback query if 'or' query requires indexing or fails
      const fallbackQ = query(collection(db, 'sessions'), where('coachId', '==', currentUser.id));
      onSnapshot(fallbackQ, (s) => {
        const fallbackRecords = s.docs.map(d => ({ ...d.data(), id: d.id } as Session));
        fallbackRecords.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setSessions(fallbackRecords);
        setLoading(false);
      });
    });

    // Fetch Assessments with comprehensive coach mapping
    const unsubAssessments = onSnapshot(collection(db, 'assessments'), (snap) => {
      const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Assessment));
      const myAssessments = all.filter(a =>
        a.assignedCoachId === currentUser.id ||
        a.preferredCoachId === currentUser.id ||
        (currentUser.coachId && (a.assignedCoachId === currentUser.coachId || a.preferredCoachId === currentUser.coachId)) ||
        (currentUser.name && (a.assignedCoachName === currentUser.name || a.preferredCoachName === currentUser.name || a.coachName === currentUser.name))
      );
      myAssessments.sort((a, b) => (toValidDate(b.createdAt)?.getTime() || 0) - (toValidDate(a.createdAt)?.getTime() || 0));
      setAssessments(myAssessments);
    });

    return () => {
      unsubSessions();
      unsubAssessments();
    };
  }, [currentUser?.id, currentUser?.coachId, currentUser?.name]);

  const handleStatusUpdate = async (id: string, newStatus: SessionStatus) => {
    const normalizedStatus = newStatus === 'Completed' ? 'Attended' : newStatus;
    try {
      await updatePTSessionStatus(id, normalizedStatus, {
        authorName: currentUser?.name || 'Coach',
        authorId: currentUser?.id
      });
    } catch (e) {
      console.warn("Falling back to direct session status update:", e);
      try {
        await updateDoc(doc(db, 'sessions', id), { 
          status: normalizedStatus,
          updatedAt: new Date().toISOString()
        });
      } catch (fallbackErr) {
        console.error("Failed to update session status:", fallbackErr);
      }
    }
  };

  const handleResolveReschedule = async (session: Session, approve: boolean) => {
    const req = (session as any).rescheduleRequest;
    if (!req) return;
    try {
      const nowIso = new Date().toISOString();
      if (approve) {
        await updateDoc(doc(db, 'sessions', session.id), {
          date: req.proposedDate || session.date,
          startTime: req.proposedTime || session.startTime,
          time: req.proposedTime || (session as any).time || session.startTime,
          status: 'Scheduled',
          rescheduleRequest: {
            ...req,
            status: 'Approved',
            resolvedAt: nowIso,
            resolvedBy: currentUser?.name || 'Coach',
          },
          updatedAt: nowIso,
        });
      } else {
        await updateDoc(doc(db, 'sessions', session.id), {
          rescheduleRequest: {
            ...req,
            status: 'Rejected',
            resolvedAt: nowIso,
            resolvedBy: currentUser?.name || 'Coach',
          },
          updatedAt: nowIso,
        });
      }
    } catch (err) {
      console.error('Failed to resolve reschedule request:', err);
    }
  };

  const handleCompleteAssessment = async (assessment: Assessment) => {
    setSavingAssessment(true);
    try {
      const nowIso = new Date().toISOString();
      const combinedNotes = [
        outcomeNotes.trim(),
        recommendedPackage.trim() ? `Recommended PT Package: ${recommendedPackage.trim()}` : ''
      ].filter(Boolean).join(' | ');

      await updateDoc(doc(db, 'assessments', assessment.id), {
        status: 'Completed',
        coachOutcomeNotes: combinedNotes,
        ...(recommendedPackage.trim() ? { recommendedPackage: recommendedPackage.trim() } : {}),
        completedAt: nowIso,
        updatedAt: nowIso
      });

      const parsedWeight = parseFloat(assessmentWeight);
      if (!isNaN(parsedWeight) && parsedWeight > 0 && assessment.clientId) {
        await addDoc(collection(db, 'bodyRecords'), {
          memberId: assessment.clientId,
          date: nowIso,
          weight: parsedWeight,
          ...(combinedNotes ? { notes: `Assessment: ${combinedNotes}` } : {})
        });
        await addDoc(collection(db, 'clientPerformance'), {
          clientId: assessment.clientId,
          clientName: assessment.clientName || 'Member',
          coachId: currentUser?.id || '',
          coachName: currentUser?.name || 'Coach',
          date: nowIso,
          weight: parsedWeight,
          workoutNotes: combinedNotes ? `Assessment Findings: ${combinedNotes}` : 'Initial Fitness Assessment',
          prs: []
        });
      }

      setCompletingAssessmentId(null);
      setOutcomeNotes('');
      setRecommendedPackage('');
      setAssessmentWeight('');
    } catch (e) {
      console.error("Failed to complete assessment:", e);
    } finally {
      setSavingAssessment(false);
    }
  };

  const filtered = statusFilter === 'all' ? sessions : sessions.filter(s => s.status === statusFilter);

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Dumbbell className="h-6 w-6 text-primary" /> My Schedule
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your sessions and client requests.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="assessments" className="relative">
            Assessments
            {assessments.filter(a => a.status === 'Pending').length > 0 && (
              <span className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-red-500" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Attended">Attended</SelectItem>
                <SelectItem value="No Show">No Show</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Dumbbell className="h-12 w-12 opacity-20" />
                <p>No sessions found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filtered.map(session => {
                const client = clientMap[session.clientId];
                const clientDisplayName = session.clientName || client?.name || 'Unknown Member';
                const style: { badge: string; icon: React.ReactNode } = STATUS_STYLES[session.status] || DEFAULT_STYLE;
                const formattedDate = safeFormatDate(session.date, 'EEEE, MMMM d, yyyy', session.date || '—');

                return (
                  <Card key={session.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-base">{clientDisplayName}</p>
                            {session.type && (
                              <Badge variant="secondary" className="text-xs">
                                {session.type}
                              </Badge>
                            )}
                            {(session as any).isFreePtSession && (
                              <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-200 font-bold">
                                Free PT Quota
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                            <span>{formattedDate}</span>
                            {session.startTime && (
                              <span>• {session.startTime} {session.endTime ? `- ${session.endTime}` : ''}</span>
                            )}
                          </p>
                          {session.notes && <p className="text-xs text-muted-foreground mt-1 italic">{session.notes}</p>}
                        </div>
                        <Badge className={`flex items-center gap-1 text-xs ${style.badge}`}>
                          {style.icon} {session.status}
                        </Badge>
                      </div>

                      {(session as any).rescheduleRequest?.status === 'PendingCoachApproval' && (
                        <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="text-xs">
                            <span className="font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                              Member Requested Reschedule
                            </span>
                            <span className="text-foreground">
                              Proposed Slot:{' '}
                              <strong className="font-mono">
                                {(session as any).rescheduleRequest.proposedDate} at {(session as any).rescheduleRequest.proposedTime}
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                              onClick={() => handleResolveReschedule(session, true)}
                            >
                              Approve New Time
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50 font-bold"
                              onClick={() => handleResolveReschedule(session, false)}
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      )}

                      {session.status === 'Scheduled' && (
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" variant="default" className="gap-1 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 h-8" onClick={() => handleStatusUpdate(session.id, 'Completed')}>
                            <CheckCircle className="h-3.5 w-3.5" /> Mark Completed
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-zinc-500 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 h-8" onClick={() => handleStatusUpdate(session.id, 'No Show')}>
                            <XCircle className="h-3.5 w-3.5" /> No Show
                          </Button>
                          <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground hover:text-foreground h-8" onClick={() => canDirectlyCancelSession ? handleStatusUpdate(session.id, 'Cancelled') : handleRequestCancelSession(session)}>
                            {canDirectlyCancelSession ? 'Cancel' : (session.cancellationRequest?.status === 'Pending' ? 'Cancel Pending FM' : 'Request Cancel (FM Approval)')}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="assessments" className="space-y-4 mt-4">
          {assessments.length === 0 ? (
            <Card className="border border-zinc-200 dark:border-zinc-800">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <ClipboardList className="h-12 w-12 opacity-20" />
                <p>No assessment requests found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {assessments.map(assessment => {
                const cleanPhone = (assessment.phone || '').replace(/[^0-9]/g, '');
                return (
                  <Card key={assessment.id} className="hover:shadow-sm transition-shadow border-l-4 border-l-zinc-900 dark:border-l-zinc-100 border-zinc-200 dark:border-zinc-800 bg-card">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-base">{assessment.clientName}</p>
                            {assessment.membershipId && (
                              <Badge variant="outline" className="text-xs font-mono bg-muted/60 border-zinc-300 dark:border-zinc-700">
                                ID: {assessment.membershipId}
                              </Badge>
                            )}
                            {assessment.membershipType && (
                              <Badge variant="secondary" className="text-xs border border-zinc-200 dark:border-zinc-700">
                                {assessment.membershipType}
                              </Badge>
                            )}
                            {assessment.ageGroup && (
                              <Badge variant="outline" className="text-xs border-zinc-300 dark:border-zinc-700">
                                Age: {assessment.ageGroup}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Requested: {safeFormatDate(assessment.createdAt, 'MMM d, yyyy HH:mm', 'Recently')}
                          </p>
                        </div>
                        <Badge 
                          className={assessment.status === 'Pending' 
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold border-zinc-700' 
                            : 'bg-zinc-100 dark:bg-zinc-800 text-muted-foreground border-zinc-300 dark:border-zinc-700'}
                        >
                          {assessment.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        {assessment.phone && (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-muted-foreground">WhatsApp:</span>
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="whatsapp_crm"
                              onClick={(e) => {
                                e.preventDefault();
                                openWhatsAppChat({ phone: cleanPhone });
                              }}
                              className="font-bold text-foreground hover:underline inline-flex items-center gap-1"
                            >
                              {assessment.phone} ↗
                            </a>
                          </div>
                        )}

                        {(assessment.timePeriod || assessment.preferredHour || assessment.preferredDate || assessment.preferredTime) && (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-muted-foreground">Preferred Time:</span>
                            <span>{assessment.timePeriod || assessment.preferredDate || ''} {assessment.preferredHour || assessment.preferredTime ? `• ${assessment.preferredHour || assessment.preferredTime}` : ''}</span>
                          </div>
                        )}

                        {assessment.referralSource && (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-muted-foreground">Source:</span>
                            <span>{assessment.referralSource}</span>
                          </div>
                        )}
                      </div>

                      {(assessment.notes || assessment.injuries || assessment.goals) && (
                        <div className="text-xs bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-300 dark:border-zinc-700 p-2.5 rounded-lg space-y-1">
                          {(assessment.notes || assessment.injuries) && (
                            <p>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 uppercase text-[10px] tracking-wider">Injuries / Notes:</span>{' '}
                              <span className="text-foreground/90">{assessment.notes || assessment.injuries}</span>
                            </p>
                          )}
                          {assessment.goals && (
                            <p>
                              <span className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Goals:</span>{' '}
                              <span className="text-foreground/90 italic">{assessment.goals}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {assessment.coachOutcomeNotes && (
                        <div className="text-xs bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-2.5 rounded-lg">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 uppercase text-[10px] tracking-wider">Assessment Outcome:</span>{' '}
                          <span className="text-foreground/90">{assessment.coachOutcomeNotes}</span>
                        </div>
                      )}

                      {assessment.status === 'Pending' && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                          {cleanPhone && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-8 text-foreground border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              onClick={() => openWhatsAppChat({ phone: cleanPhone })}
                            >
                              Open WhatsApp Chat
                            </Button>
                          )}
                          <div className="flex items-center gap-2 ml-auto">
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs h-8 border-zinc-300 dark:border-zinc-700"
                              onClick={() => updateDoc(doc(db, 'assessments', assessment.id), { status: 'Contacted', updatedAt: new Date().toISOString() })}
                            >
                              Mark as Contacted
                            </Button>
                            <Button 
                              size="sm" 
                              className="text-xs h-8 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold"
                              onClick={() => updateDoc(doc(db, 'assessments', assessment.id), { status: 'Scheduled', updatedAt: new Date().toISOString() })}
                            >
                              Mark as Scheduled
                            </Button>
                          </div>
                        </div>
                      )}

                      {(assessment.status === 'Contacted' || assessment.status === 'Scheduled') && (
                        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                          {completingAssessmentId === assessment.id ? (
                            <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                              <p className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Complete Assessment & Log Findings</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <Input
                                  placeholder="Body weight (kg, optional)"
                                  type="number"
                                  step="0.1"
                                  value={assessmentWeight}
                                  onChange={e => setAssessmentWeight(e.target.value)}
                                  className="h-8 text-xs"
                                />
                                <Input
                                  placeholder="Recommended PT package (optional)"
                                  value={recommendedPackage}
                                  onChange={e => setRecommendedPackage(e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <Input
                                placeholder="Assessment outcome notes & observations..."
                                value={outcomeNotes}
                                onChange={e => setOutcomeNotes(e.target.value)}
                                className="h-8 text-xs"
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-8"
                                  onClick={() => {
                                    setCompletingAssessmentId(null);
                                    setOutcomeNotes('');
                                    setRecommendedPackage('');
                                    setAssessmentWeight('');
                                  }}
                                >
                                  {canDirectlyCancelSession ? 'Cancel' : 'Cancel'}
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={savingAssessment}
                                  className="text-xs h-8 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold"
                                  onClick={() => handleCompleteAssessment(assessment)}
                                >
                                  {savingAssessment ? 'Saving...' : 'Mark Completed'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              {cleanPhone && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-8 text-foreground border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                  onClick={() => openWhatsAppChat({ phone: cleanPhone })}
                                >
                                  Open WhatsApp Chat
                                </Button>
                              )}
                              <div className="flex items-center gap-2 ml-auto">
                                {assessment.status === 'Contacted' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs h-8 border-zinc-300 dark:border-zinc-700"
                                    onClick={() => updateDoc(doc(db, 'assessments', assessment.id), { status: 'Scheduled', updatedAt: new Date().toISOString() })}
                                  >
                                    Mark Scheduled
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="text-xs h-8 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-bold"
                                  onClick={() => {
                                    setCompletingAssessmentId(assessment.id);
                                    setOutcomeNotes('');
                                    setRecommendedPackage('');
                                    setAssessmentWeight('');
                                  }}
                                >
                                  Complete Assessment & Log Findings
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
