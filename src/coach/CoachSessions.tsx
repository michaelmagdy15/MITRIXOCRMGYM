import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, getDocs } from 'firebase/firestore';
import { PTPackageRecord, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dumbbell, CheckCircle, XCircle, Clock, Ban, ClipboardList } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Assessment } from '../types';

type StatusFilter = 'all' | 'Scheduled' | 'Attended' | 'No Show' | 'Cancelled';

const STATUS_STYLES: Record<PTPackageRecord['status'], { badge: string; icon: React.ReactNode }> = {
  Scheduled:  { badge: 'bg-blue-500/10 text-blue-600',   icon: <Clock className="h-3.5 w-3.5" /> },
  Attended:   { badge: 'bg-green-500/10 text-green-600', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  'No Show':  { badge: 'bg-red-500/10 text-red-600',     icon: <XCircle className="h-3.5 w-3.5" /> },
  Cancelled:  { badge: 'bg-gray-500/10 text-gray-500',   icon: <Ban className="h-3.5 w-3.5" /> },
};

export default function CoachSessions() {
  const { currentUser } = useAuth();
  const [sessions, setSessions] = useState<PTPackageRecord[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [clientMap, setClientMap] = useState<Record<string, Client>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeTab, setActiveTab] = useState('sessions');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    
    // Fetch Sessions
    const qSessions = query(collection(db, 'sessions'), where('trainerId', '==', currentUser.id));
    const unsubSessions = onSnapshot(qSessions, async (snap) => {
      const records = snap.docs.map(d => ({ ...d.data(), id: d.id } as PTPackageRecord));
      records.sort((a, b) => b.date.localeCompare(a.date));
      setSessions(records);

      // Fetch client names for sessions
      const ids = [...new Set(records.map(r => r.clientId))];
      const map: Record<string, Client> = {};
      for (let i = 0; i < ids.length; i += 30) {
        const batch = ids.slice(i, i + 30);
        const cq = query(collection(db, 'clients'), where('__name__', 'in', batch));
        const csnap = await getDocs(cq);
        csnap.docs.forEach(d => { map[d.id] = { ...d.data(), id: d.id } as Client; });
      }
      setClientMap(prev => ({...prev, ...map}));
      setLoading(false);
    });

    // Fetch Assessments
    const qAssessments = query(
      collection(db, 'assessments'), 
      where('preferredCoachId', 'in', [currentUser.id, null]) // Coach gets their own, plus unassigned (if we want, or just their own. Let's do their own for now, since 'in' doesn't support null. We will do two queries if needed, or just their own)
    );
    // Actually `in [null]` is not valid in Firestore if we want null and ID. We'll just fetch where preferredCoachId == currentUser.id.
    const qAss2 = query(collection(db, 'assessments'), where('preferredCoachId', '==', currentUser.id));
    const unsubAssessments = onSnapshot(qAss2, (snap) => {
      const records = snap.docs.map(d => ({ ...d.data(), id: d.id } as Assessment));
      records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAssessments(records);
    });

    return () => {
      unsubSessions();
      unsubAssessments();
    };
  }, [currentUser?.id]);

  const handleStatusUpdate = async (id: string, newStatus: PTPackageRecord['status']) => {
    await updateDoc(doc(db, 'sessions', id), { status: newStatus });
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
                const style = STATUS_STYLES[session.status] ?? STATUS_STYLES['Scheduled'];
                return (
                  <Card key={session.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{client?.name ?? 'Unknown Member'}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(session.date), 'EEEE, MMMM d, yyyy')}
                          </p>
                          {session.notes && <p className="text-xs text-muted-foreground mt-1 italic">{session.notes}</p>}
                        </div>
                        <Badge className={`flex items-center gap-1 text-xs ${style.badge}`}>
                          {style.icon} {session.status}
                        </Badge>
                      </div>
                      {session.status === 'Scheduled' && (
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" variant="outline" className="gap-1 text-green-600 border-green-200 hover:bg-green-50" onClick={() => handleStatusUpdate(session.id, 'Attended')}>
                            <CheckCircle className="h-3.5 w-3.5" /> Mark Attended
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-red-500 border-red-200 hover:bg-red-50" onClick={() => handleStatusUpdate(session.id, 'No Show')}>
                            <XCircle className="h-3.5 w-3.5" /> No Show
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
            <Card>
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
                  <Card key={assessment.id} className="hover:shadow-sm transition-shadow border-l-4 border-l-primary">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-base">{assessment.clientName}</p>
                            {assessment.membershipId && (
                              <Badge variant="outline" className="text-xs font-mono bg-muted/60">
                                ID: {assessment.membershipId}
                              </Badge>
                            )}
                            {assessment.membershipType && (
                              <Badge variant="secondary" className="text-xs">
                                {assessment.membershipType}
                              </Badge>
                            )}
                            {assessment.ageGroup && (
                              <Badge variant="outline" className="text-xs">
                                Age: {assessment.ageGroup}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Requested: {assessment.createdAt ? format(new Date(assessment.createdAt), 'MMM d, yyyy HH:mm') : 'Recently'}
                          </p>
                        </div>
                        <Badge variant={assessment.status === 'Pending' ? 'default' : 'secondary'}>
                          {assessment.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-muted/30 p-3 rounded-lg border border-border/50">
                        {assessment.phone && (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-muted-foreground">WhatsApp:</span>
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-emerald-600 hover:underline inline-flex items-center gap-1"
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
                        <div className="text-xs bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-lg space-y-1">
                          {(assessment.notes || assessment.injuries) && (
                            <p>
                              <span className="font-bold text-amber-700 dark:text-amber-400">Injuries / Notes:</span>{' '}
                              <span className="text-foreground/90">{assessment.notes || assessment.injuries}</span>
                            </p>
                          )}
                          {assessment.goals && (
                            <p>
                              <span className="font-bold text-muted-foreground">Goals:</span>{' '}
                              <span className="text-foreground/90 italic">{assessment.goals}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {assessment.status === 'Pending' && (
                        <div className="flex items-center justify-between gap-2 pt-2 border-t">
                          {cleanPhone && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-8 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                              onClick={() => window.open(`https://wa.me/${cleanPhone}`, '_blank')}
                            >
                              Open WhatsApp Chat
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            className="text-xs h-8 ml-auto"
                            onClick={() => updateDoc(doc(db, 'assessments', assessment.id), { status: 'Contacted', updatedAt: new Date().toISOString() })}
                          >
                            Mark as Contacted
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
      </Tabs>
    </div>
  );
}
