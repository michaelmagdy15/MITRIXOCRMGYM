import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Calendar, Users, Dumbbell, User, Clock, Flame, ChevronRight, 
  Activity, Award, CheckCircle, ArrowRight, DollarSign, Bell, MessageSquare,
  AlertTriangle, RefreshCw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { format, parseISO, isToday, startOfWeek, endOfWeek, isWithinInterval, differenceInDays, isAfter, startOfDay } from 'date-fns';
import { safeFormatDate, toValidDate } from '../utils/dateUtils';
import { openWhatsAppChat } from '../utils/whatsappTemplates';
import { ClassSchedule } from '../types/class';
import { Session, Assessment, Client } from '../types';

type CoachTab = 'home' | 'classes' | 'schedule' | 'members' | 'sessions' | 'earnings' | 'profile';

interface TodayAgendaItem {
  id: string;
  type: 'class' | 'pt';
  title: string;
  clientOrRoom: string;
  time: string;
  statusOrCapacity: string;
  tab: CoachTab;
}

interface CoachStats {
  totalClients: number;
  sessionsThisWeek: number;
  todayCount: number;
  pendingAssessmentsCount: number;
  totalSessionsAllTime: number;
}

interface RadarClientItem {
  id: string;
  name: string;
  phone?: string;
  remaining: number | null;
  lastSessionDaysAgo: number | null;
  hasUpcomingSession: boolean;
}

export default function CoachHome({ 
  onNavigate, 
  onStartFloor 
}: { 
  onNavigate: (tab: CoachTab) => void;
  onStartFloor?: (client?: any, session?: any) => void;
}) {
  const { currentUser } = useAuth();
  const { branding } = useSettings();
  const clubTitleUpper = (branding?.companyName || 'STRIKE').toUpperCase();
  const [stats, setStats] = useState<CoachStats>({
    totalClients: 0,
    sessionsThisWeek: 0,
    todayCount: 0,
    pendingAssessmentsCount: 0,
    totalSessionsAllTime: 0,
  });
  const [todayAgenda, setTodayAgenda] = useState<TodayAgendaItem[]>([]);
  const [pendingAssessments, setPendingAssessments] = useState<Assessment[]>([]);
  const [assignedClientAlerts, setAssignedClientAlerts] = useState<any[]>([]);
  const [lowBalanceClients, setLowBalanceClients] = useState<RadarClientItem[]>([]);
  const [atRiskClients, setAtRiskClients] = useState<RadarClientItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayDateStr = format(new Date(), 'yyyy-MM-dd');
  const todayDayName = format(new Date(), 'EEEE');

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }

    const coachName = currentUser?.name || '';
    const coachId = currentUser?.id || '';
    const coachCustomId = currentUser?.coachId || '';

    // 1. Listen to Assessments assigned to this coach
    const unsubAssessments = onSnapshot(collection(db, 'assessments'), (snap) => {
      const all = snap.docs.map(d => ({ ...d.data(), id: d.id } as Assessment));
      const myAssessments = all.filter(a =>
        a.assignedCoachId === coachId ||
        a.preferredCoachId === coachId ||
        (coachCustomId && (a.assignedCoachId === coachCustomId || a.preferredCoachId === coachCustomId)) ||
        (coachName && (a.assignedCoachName === coachName || a.preferredCoachName === coachName))
      );
      const pending = myAssessments.filter(a => a.status === 'Pending');
      setPendingAssessments(pending);
      setStats(prev => ({ ...prev, pendingAssessmentsCount: pending.length }));
    });

    // 1b. Listen to PT Client Assignment Notifications for this coach
    const unsubNotifications = onSnapshot(
      query(collection(db, 'notifications'), where('read', '==', false)),
      (snap) => {
        const nameLower = coachName.toLowerCase();
        const mine = snap.docs
          .map(d => ({ ...d.data(), id: d.id } as any))
          .filter(n => {
            if (n.type !== 'coach_client_assigned') return false;
            return (
              (coachId && (n.recipientUid === coachId || n.recipientId === coachId || n.coachId === coachId)) ||
              (coachCustomId && (n.coachCustomId === coachCustomId || n.coachId === coachCustomId)) ||
              (nameLower && String(n.coachName || '').toLowerCase() === nameLower)
            );
          })
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setAssignedClientAlerts(mine);
      },
      () => {}
    );

    // 2. Fetch Assigned Clients, Today's Classes & PT Sessions
    const loadOverview = async () => {
      try {
        const coachNameLower = coachName.toLowerCase();
        const clientQueries: Promise<any>[] = [
          getDocs(query(collection(db, 'clients'), where('assignedCoachId', '==', coachId))),
        ];
        if (coachCustomId) {
          clientQueries.push(getDocs(query(collection(db, 'clients'), where('assignedCoachId', '==', coachCustomId))));
        }
        if (coachName) {
          clientQueries.push(getDocs(query(collection(db, 'clients'), where('assignedCoachName', '==', coachName))));
          clientQueries.push(getDocs(query(collection(db, 'clients'), where('trainerName', '==', coachName))));
          clientQueries.push(getDocs(query(collection(db, 'clients'), where('coach', '==', coachName))));
        }
        const clientSnaps = await Promise.all(clientQueries);
        const assignedClientDocsMap = new Map<string, Client>();
        clientSnaps.forEach(s => {
          s?.docs?.forEach((d: any) => {
            assignedClientDocsMap.set(d.id, { ...d.data(), id: d.id } as Client);
          });
        });
        try {
          const activeSnap = await getDocs(query(collection(db, 'clients'), where('status', '==', 'Active')));
          activeSnap.docs.forEach(d => {
            if (assignedClientDocsMap.has(d.id)) return;
            const c = { ...d.data(), id: d.id } as Client;
            const matchesPkg = (c.packages || []).some(p => {
              const pName = (p.trainerName || (p as any).coachName || '').toLowerCase();
              const pId = (p as any).coachId || '';
              return (coachNameLower && pName === coachNameLower) || pId === coachId || (coachCustomId && pId === coachCustomId);
            });
            if (matchesPkg) assignedClientDocsMap.set(d.id, c);
          });
        } catch {}
        const totalClients = assignedClientDocsMap.size;

        // Classes for today
        const classesSnap = await getDocs(collection(db, 'classSchedules'));
        const allClasses = classesSnap.docs.map(d => ({ ...d.data(), id: d.id } as ClassSchedule));
        
        const myClassesToday = allClasses.filter(c => {
          if (c.status === 'cancelled') return false;
          const cAny = c as any;
          const matchesCoach = 
            cAny.coachId === coachId || 
            cAny.coachId === coachCustomId || 
            c.instructorId === coachId || 
            (c.coachName && coachName && c.coachName.toLowerCase() === coachName.toLowerCase()) ||
            (c.instructorName && coachName && c.instructorName.toLowerCase() === coachName.toLowerCase());
          if (!matchesCoach) return false;

          // Check if class occurs today
          const occursOnDate = c.date === todayDateStr || (c.startTime && c.startTime.startsWith(todayDateStr));
          const occursOnDay = Array.isArray(cAny.daysOfWeek) && cAny.daysOfWeek.includes(todayDayName);
          return occursOnDate || occursOnDay;
        });

        // PT Sessions
        const sessionsSnap = await getDocs(collection(db, 'sessions'));
        const allSessions = sessionsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Session));
        
        const mySessions = allSessions.filter(s => {
          const sAny = s as any;
          return s.coachId === coachId ||
            sAny.trainerId === coachId ||
            (coachCustomId && (s.coachId === coachCustomId || sAny.trainerId === coachCustomId)) ||
            (coachName && s.coachName && s.coachName.toLowerCase() === coachName.toLowerCase());
        });

        const mySessionsToday = mySessions.filter(s => {
          if (!s.date) return false;
          try {
            return isToday(parseISO(s.date)) || s.date.startsWith(todayDateStr);
          } catch {
            return false;
          }
        });

        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

        const completedThisWeek = mySessions.filter(s => {
          if (s.status !== 'Completed' && (s.status as string) !== 'Attended') return false;
          try {
            const d = parseISO(s.date);
            return isWithinInterval(d, { start: weekStart, end: weekEnd });
          } catch {
            return false;
          }
        }).length;

        // Combine into Today's Agenda
        const agenda: TodayAgendaItem[] = [];

        myClassesToday.forEach(c => {
          const booked = c.attendees?.length || (c as any).currentBookings || (c as any).bookedMemberIds?.length || 0;
          const cap = c.capacity || 15;
          let timeDisplay = c.time || 'TBD';
          if (c.startTime) {
            try {
              timeDisplay = c.startTime.includes('T') ? format(parseISO(c.startTime), 'HH:mm') : c.startTime;
            } catch {
              timeDisplay = c.startTime;
            }
          }
          agenda.push({
            id: c.id,
            type: 'class',
            title: c.name || (c as any).title || 'Group Class',
            clientOrRoom: c.branch || 'Studio 1',
            time: timeDisplay,
            statusOrCapacity: `${booked}/${cap} Booked`,
            tab: 'classes'
          });
        });

        mySessionsToday.forEach(s => {
          let sessionTime = s.startTime || 'Scheduled';
          if (!s.startTime && s.date && s.date.includes('T')) {
            const parts = s.date.split('T');
            if (parts[1]) {
              sessionTime = parts[1].slice(0, 5);
            }
          }
          agenda.push({
            id: s.id,
            type: 'pt',
            title: `${s.type || (s as any).sessionType || 'PT'} Session`,
            clientOrRoom: s.clientName || 'Client',
            time: sessionTime,
            statusOrCapacity: s.status || 'Scheduled',
            tab: 'sessions'
          });
        });

        // Sort agenda by time
        agenda.sort((a, b) => a.time.localeCompare(b.time));
        setTodayAgenda(agenda);

        // Build PT Client Retention & Renewal Radar
        const clientMap = new Map<string, Client>(assignedClientDocsMap);

        const sessionClientIds = [...new Set(mySessions.map(s => s.clientId).filter(Boolean))];
        const missingIds = sessionClientIds.filter(id => !clientMap.has(id));
        for (let i = 0; i < missingIds.length; i += 30) {
          const batch = missingIds.slice(i, i + 30);
          if (batch.length > 0) {
            const extraSnap = await getDocs(query(collection(db, 'clients'), where('__name__', 'in', batch)));
            extraSnap.docs.forEach(d => {
              clientMap.set(d.id, { ...d.data(), id: d.id } as Client);
            });
          }
        }

        const lowBalList: RadarClientItem[] = [];
        const atRiskList: RadarClientItem[] = [];
        const todayStart = startOfDay(now);

        clientMap.forEach(client => {
          const rawRem = client.ptSessionsRemaining ?? client.sessionsRemaining;
          const parsedRem = typeof rawRem === 'number'
            ? rawRem
            : (rawRem !== undefined && rawRem !== null && String(rawRem).trim() !== '' ? Number(rawRem) : NaN);
          const remaining = !isNaN(parsedRem) ? parsedRem : null;

          const clientSessions = mySessions.filter(s => s.clientId === client.id);
          let lastAttendedDate: Date | null = null;
          let hasUpcoming = false;

          clientSessions.forEach(s => {
            if (!s.date) return;
            try {
              const d = parseISO(s.date);
              if (isNaN(d.getTime())) return;
              const st = s.status as string;
              if (st === 'Attended' || st === 'Completed') {
                if (!lastAttendedDate || isAfter(d, lastAttendedDate)) {
                  lastAttendedDate = d;
                }
              }
              if (st === 'Scheduled' || st === 'Rescheduled') {
                if (isToday(d) || isAfter(d, todayStart) || s.date >= todayDateStr) {
                  hasUpcoming = true;
                }
              }
            } catch {}
          });

          const lastSessionDaysAgo = lastAttendedDate ? differenceInDays(now, lastAttendedDate) : null;

          const radarItem: RadarClientItem = {
            id: client.id,
            name: client.name || 'Client',
            phone: client.phone,
            remaining,
            lastSessionDaysAgo,
            hasUpcomingSession: hasUpcoming,
          };

          // 1. Low-Balance PT Clients: remaining between 0 and 2 (inclusive)
          if (remaining !== null && remaining >= 0 && remaining <= 2) {
            lowBalList.push(radarItem);
          }

          // 2. At-Risk / Inactive PT Clients: last attended > 10 days ago (or no upcoming scheduled session) while active sessions remaining > 0
          const hasActiveSessions = remaining !== null && remaining > 0;
          const isInactiveOver10d = lastSessionDaysAgo !== null ? lastSessionDaysAgo > 10 : true;
          if (hasActiveSessions && (isInactiveOver10d || !hasUpcoming)) {
            atRiskList.push(radarItem);
          }
        });

        setLowBalanceClients(lowBalList);
        setAtRiskClients(atRiskList);

        setStats(prev => ({
          ...prev,
          totalClients: Math.max(totalClients, clientMap.size),
          sessionsThisWeek: completedThisWeek,
          todayCount: agenda.length,
          totalSessionsAllTime: mySessions.length
        }));
      } catch (err) {
        console.error('Failed to load coach overview:', err);
      } finally {
        setLoading(false);
      }
    };

    loadOverview();

    return () => {
      unsubAssessments();
      unsubNotifications();
    };
  }, [currentUser]);

  const handleOpenAssessments = () => {
    try {
      sessionStorage.setItem('coach_sessions_tab', 'assessments');
    } catch {}
    onNavigate('sessions');
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Inzan Hero Greeting (Sleek Carbon & Silver) ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-zinc-950 text-white border border-zinc-800 shadow-2xl p-6">
        {/* Subtle metallic linear highlights */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-zinc-700/10 via-zinc-800/5 to-transparent rounded-full -translate-y-20 translate-x-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-zinc-800/10 rounded-full translate-y-12 -translate-x-12 pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3.5">
              {/* Metallic Silver Avatar */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-zinc-100 via-zinc-300 to-zinc-400 text-zinc-950 font-black text-2xl flex items-center justify-center shadow-lg border border-white/40">
                {(currentUser?.name || 'C').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-400 tracking-wide">{greeting}</p>
                <h2 className="text-2xl font-black tracking-tight text-zinc-100">{currentUser?.name || 'Coach'}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[9px] font-mono font-bold uppercase tracking-widest bg-zinc-900/80 text-zinc-300 border-zinc-700">
                    {clubTitleUpper} TRAINER
                  </Badge>
                  {currentUser?.coachId && (
                    <span className="text-[10px] font-mono text-zinc-400">#{currentUser.coachId}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-zinc-400">{format(new Date(), 'EEEE')}</p>
              <p className="text-sm font-black text-zinc-200">{format(new Date(), 'MMM d, yyyy')}</p>
            </div>
          </div>
          
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <span>{clubTitleUpper} COACHING PORTAL</span>
            <span className="font-mono text-zinc-300">SYSTEM OPERATIONAL</span>
          </div>
        </div>
      </div>

      {/* ─── New Assigned PT Clients Alert ─── */}
      {assignedClientAlerts.length > 0 && (
        <div className="space-y-2.5 animate-in fade-in">
          {assignedClientAlerts.slice(0, 3).map(alertItem => (
            <div
              key={alertItem.id}
              className="rounded-2xl bg-emerald-950/90 border border-emerald-500/40 p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-zinc-950 flex items-center justify-center shrink-0 shadow-md">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white">
                      {alertItem.title || `New PT Client Assigned: ${alertItem.clientName}`}
                    </p>
                    <Badge className="bg-emerald-400 text-zinc-950 text-[10px] font-extrabold px-1.5 py-0.5">
                      NEW CLIENT
                    </Badge>
                  </div>
                  <p className="text-xs text-emerald-200/90 mt-0.5">
                    {alertItem.body || alertItem.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'notifications', alertItem.id), { read: true });
                    } catch {}
                    onNavigate('members');
                  }}
                  className="bg-emerald-400 text-zinc-950 hover:bg-emerald-300 font-bold text-xs"
                >
                  View in My Clients <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Pending Assessments Priority Alert ─── */}
      {stats.pendingAssessmentsCount > 0 && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-700 p-4 shadow-xl flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-950 flex items-center justify-center shrink-0 shadow-md">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-zinc-100">
                  {stats.pendingAssessmentsCount} Intake Assessment{stats.pendingAssessmentsCount > 1 ? 's' : ''} Assigned
                </p>
                <Badge className="bg-white text-zinc-950 text-[10px] font-extrabold px-1.5 py-0.5">NEW</Badge>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                New member inquiries with goals & injury history are awaiting your initial contact.
              </p>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={handleOpenAssessments}
            className="shrink-0 bg-zinc-100 text-zinc-950 hover:bg-zinc-200 font-bold text-xs"
          >
            Review Leads <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      )}

      {/* ─── Stats Grid (Monochrome Silver, White & Black) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'My Clients', count: stats.totalClients, icon: <Users className="h-4 w-4" /> },
          { label: "Today's Schedule", count: stats.todayCount, icon: <Activity className="h-4 w-4" /> },
          { label: 'Completed This Week', count: stats.sessionsThisWeek, icon: <Flame className="h-4 w-4" /> },
          { label: 'Total All Time', count: stats.totalSessionsAllTime, icon: <Award className="h-4 w-4" /> }
        ].map((item, idx) => (
          <div 
            key={idx} 
            className="p-4 rounded-2xl bg-card border border-zinc-200 dark:border-zinc-800 text-center shadow-sm relative overflow-hidden group hover:border-zinc-400 dark:hover:border-zinc-600 transition-all"
          >
            {/* Metallic circular badge */}
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-foreground flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform shadow-inner">
              {item.icon}
            </div>
            <p className="text-2xl font-black text-foreground tracking-tight">{item.count}</p>
            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* ─── Today's Live Agenda ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Today's Schedule</h3>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            {todayAgenda.length} Event{todayAgenda.length === 1 ? '' : 's'}
          </span>
        </div>

        {todayAgenda.length === 0 ? (
          <Card className="border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <CardContent className="p-6 text-center space-y-2">
              <Calendar className="h-8 w-8 text-zinc-400 mx-auto" />
              <p className="text-sm font-bold text-foreground">No sessions or classes scheduled for today.</p>
              <p className="text-xs text-muted-foreground">Check your upcoming schedule or set your availability slots.</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onNavigate('schedule')}
                className="mt-2 text-xs border-zinc-300 dark:border-zinc-700 font-semibold"
              >
                Manage Schedule
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {todayAgenda.map(item => (
              <div 
                key={item.id}
                onClick={() => onNavigate(item.tab)}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all cursor-pointer shadow-sm group"
              >
                <div className="flex items-center gap-3">
                  <div className="px-2.5 py-1.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-mono text-xs font-bold shrink-0">
                    {item.time}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-foreground group-hover:underline">{item.title}</p>
                      <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider border-zinc-300 dark:border-zinc-700">
                        {item.type === 'class' ? 'Class' : 'PT'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.clientOrRoom}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {item.type === 'pt' && onStartFloor && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartFloor({ id: item.id, name: item.title });
                      }}
                      className="h-7 text-[10px] font-bold border-amber-500/40 text-amber-600 hover:bg-amber-500/10 px-2 rounded-lg gap-1"
                    >
                      <Flame className="h-3 w-3 fill-current" /> Floor
                    </Button>
                  )}
                  <Badge variant="secondary" className="text-xs bg-zinc-100 dark:bg-zinc-800 text-foreground font-mono font-medium border border-zinc-200 dark:border-zinc-700">
                    {item.statusOrCapacity}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── PT Client Retention & Renewal Radar ─── */}
      <Card className="border border-zinc-200 dark:border-zinc-800 bg-card shadow-sm overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-4 border-b border-zinc-100 dark:border-zinc-800/80 flex flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-xs font-black uppercase tracking-widest text-foreground">
                PT Client Retention & Renewal Radar
              </CardTitle>
            </div>
            <CardDescription className="text-[11px] mt-0.5">
              Actionable upsell & retention triggers for your assigned PT roster
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('members')}
            className="h-7 text-[11px] font-bold px-2.5 text-muted-foreground hover:text-foreground"
          >
            View Members <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
          </Button>
        </CardHeader>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Low-Balance PT Clients (Upsell / Renewal Trigger) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Low-Balance (0–2 Left)
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-600 dark:text-amber-400">
                {lowBalanceClients.length}
              </Badge>
            </div>

            {lowBalanceClients.length === 0 ? (
              <div className="p-3 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-xs text-muted-foreground">
                No clients due for package renewal right now.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {lowBalanceClients.map(client => {
                  const cleanPhone = (client.phone || '').replace(/[^0-9]/g, '');
                  return (
                    <div
                      key={`low-${client.id}`}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{client.name}</p>
                        <Badge
                          variant="outline"
                          className={`mt-1 text-[10px] font-bold px-1.5 py-0 ${
                            client.remaining === 0
                              ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          Renewal Due • {client.remaining} left
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {cleanPhone && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openWhatsAppChat({ phone: cleanPhone })}
                            className="h-7 px-2 text-[10px] font-bold border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                          >
                            WhatsApp Follow-up
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onNavigate('members')}
                          className="h-7 px-2 text-[10px] font-bold"
                        >
                          View
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* At-Risk / Inactive PT Clients (Retention Trigger) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> At-Risk / Inactive (&gt;10d)
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-rose-500/30 text-rose-600 dark:text-rose-400">
                {atRiskClients.length}
              </Badge>
            </div>

            {atRiskClients.length === 0 ? (
              <div className="p-3 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-xs text-muted-foreground">
                All active PT clients are booked or recently attended.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {atRiskClients.map(client => {
                  const cleanPhone = (client.phone || '').replace(/[^0-9]/g, '');
                  return (
                    <div
                      key={`risk-${client.id}`}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{client.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {client.lastSessionDaysAgo !== null
                            ? `Last attended ${client.lastSessionDaysAgo}d ago`
                            : 'No attended sessions yet'}
                          {!client.hasUpcomingSession ? ' • No upcoming booking' : ''}
                          {client.remaining !== null ? ` (${client.remaining} left)` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onNavigate('schedule')}
                          className="h-7 px-2 text-[10px] font-bold border-zinc-300 dark:border-zinc-700"
                        >
                          Book Session
                        </Button>
                        {cleanPhone && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openWhatsAppChat({ phone: cleanPhone })}
                            className="h-7 px-2 text-[10px] font-bold border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                          >
                            WhatsApp
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Coach Command Center Actions (All PRD Modules + Floor Mode) ─── */}
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Command Center</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            { 
              icon: <Flame className="h-5 w-5 text-amber-500 fill-amber-500/20" />, 
              label: 'Live Floor Mode', 
              desc: 'Real-time workout logger, sets, reps, rest timer & PRs', 
              tab: 'floor' as CoachTab,
              action: () => onStartFloor ? onStartFloor() : onNavigate('floor' as CoachTab)
            },
            { 
              icon: <Users className="h-5 w-5" />, 
              label: 'Group Classes', 
              desc: 'Live roster, spot counts & instant check-in', 
              tab: 'classes' as CoachTab 
            },
            { 
              icon: <Dumbbell className="h-5 w-5" />, 
              label: 'PT Sessions', 
              desc: '1-on-1, Partner & Group training logs', 
              tab: 'sessions' as CoachTab 
            },
            { 
              icon: <Calendar className="h-5 w-5" />, 
              label: 'My Schedule', 
              desc: 'Working days, off-days & hourly capacity', 
              tab: 'schedule' as CoachTab 
            },
            { 
              icon: <Users className="h-5 w-5" />, 
              label: 'Client Roster', 
              desc: 'Assigned members & package balances', 
              tab: 'members' as CoachTab 
            },
            { 
              icon: <MessageSquare className="h-5 w-5" />, 
              label: 'Intake Assessments', 
              desc: 'Triage member goals & WhatsApp follow up', 
              tab: 'sessions' as CoachTab,
              action: handleOpenAssessments
            },
            { 
              icon: <DollarSign className="h-5 w-5" />, 
              label: 'Payouts & Earnings', 
              desc: 'Rates, period totals & payout records', 
              tab: 'earnings' as CoachTab 
            },
          ].map((action, idx) => (
            <button
              key={idx}
              onClick={action.action ? action.action : () => onNavigate(action.tab)}
              className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-card hover:bg-zinc-50 dark:hover:bg-zinc-900/60 hover:border-zinc-400 dark:hover:border-zinc-700 transition-all active:scale-[0.98] group text-left shadow-sm"
            >
              {/* Brushed Metallic Icon Frame */}
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-foreground flex items-center justify-center shrink-0 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-950 transition-colors shadow-inner">
                {action.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-foreground group-hover:underline truncate">{action.label}</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{action.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* ─── Inzan Athletics Brutalist Brand Card ─── */}
      <div className="rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-950 to-black border border-zinc-800 text-white p-4 flex items-center gap-3.5 shadow-lg">
        <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 flex items-center justify-center shrink-0">
          <Award className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-zinc-200">{clubTitleUpper} STANDARD</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Consistent execution fuels athletic greatness. All sessions and class check-ins are logged with audit protection.
          </p>
        </div>
      </div>
    </div>
  );
}
