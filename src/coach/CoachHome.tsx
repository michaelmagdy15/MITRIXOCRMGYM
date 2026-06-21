import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Users, Dumbbell, User, Clock, TrendingUp, Star, Flame, ChevronRight, Activity, Award } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { format, parseISO, isToday, startOfWeek, endOfWeek, isWithinInterval, differenceInDays } from 'date-fns';

type CoachTab = 'home' | 'schedule' | 'members' | 'sessions' | 'profile';

interface CoachStats {
  totalClients: number;
  sessionsThisWeek: number;
  sessionsToday: number;
  totalSessionsAllTime: number;
  upcomingSessions: { clientName: string; time: string; type: string }[];
}

export default function CoachHome({ onNavigate }: { onNavigate: (tab: CoachTab) => void }) {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState<CoachStats>({
    totalClients: 0, sessionsThisWeek: 0, sessionsToday: 0, totalSessionsAllTime: 0, upcomingSessions: []
  });
  const [loading, setLoading] = useState(true);

  // Greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    if (!currentUser?.coachId && !currentUser?.name) { setLoading(false); return; }

    const loadStats = async () => {
      try {
        const coachName = currentUser?.name || '';
        
        // Clients assigned to this coach
        const clientsSnap = await getDocs(
          query(collection(db, 'clients'), where('coach', '==', coachName))
        );
        const totalClients = clientsSnap.size;

        // Sessions (attendance records)
        const attendanceSnap = await getDocs(collection(db, 'attendance'));
        const allSessions = attendanceSnap.docs
          .map(d => d.data())
          .filter((a: any) => a.coach === coachName || a.coachName === coachName);

        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

        const sessionsThisWeek = allSessions.filter((a: any) => {
          try {
            const d = parseISO(a.date);
            return isWithinInterval(d, { start: weekStart, end: weekEnd });
          } catch { return false; }
        }).length;

        const sessionsToday = allSessions.filter((a: any) => {
          try { return isToday(parseISO(a.date)); } catch { return false; }
        }).length;

        setStats({
          totalClients,
          sessionsThisWeek,
          sessionsToday,
          totalSessionsAllTime: allSessions.length,
          upcomingSessions: []
        });
      } catch (err) {
        console.error('Failed to load coach stats:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [currentUser?.coachId, currentUser?.name]);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Hero Greeting ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-primary/20 p-5">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -translate-y-12 translate-x-12" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/5 rounded-full translate-y-8 -translate-x-8" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-black text-xl shadow-lg">
              {(currentUser?.name || 'C').charAt(0)}
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{greeting} 👋</p>
              <h2 className="text-xl font-black tracking-tight">{currentUser?.name || 'Coach'}</h2>
              <Badge variant="outline" className="text-[8px] font-extrabold tracking-widest uppercase border-primary/30 text-primary mt-0.5">
                Trainer
              </Badge>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* ─── Stats Grid ─── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 text-center">
          <div className="p-2 bg-blue-500/10 rounded-lg w-fit mx-auto mb-2">
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-500">{stats.totalClients}</p>
          <p className="text-[9px] text-muted-foreground font-bold uppercase">My Clients</p>
        </div>
        
        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-center">
          <div className="p-2 bg-emerald-500/10 rounded-lg w-fit mx-auto mb-2">
            <Activity className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-500">{stats.sessionsToday}</p>
          <p className="text-[9px] text-muted-foreground font-bold uppercase">Today's Sessions</p>
        </div>
        
        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-center">
          <div className="p-2 bg-amber-500/10 rounded-lg w-fit mx-auto mb-2">
            <Flame className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-500">{stats.sessionsThisWeek}</p>
          <p className="text-[9px] text-muted-foreground font-bold uppercase">This Week</p>
        </div>
        
        <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/15 text-center">
          <div className="p-2 bg-purple-500/10 rounded-lg w-fit mx-auto mb-2">
            <Award className="h-5 w-5 text-purple-500" />
          </div>
          <p className="text-2xl font-black text-purple-500">{stats.totalSessionsAllTime}</p>
          <p className="text-[9px] text-muted-foreground font-bold uppercase">All Time</p>
        </div>
      </div>

      {/* ─── Quick Actions ─── */}
      <div className="space-y-2">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">Quick Actions</h3>
        
        <div className="space-y-2">
          {[
            { icon: <Calendar className="h-5 w-5 text-blue-500" />, label: 'My Schedule', desc: 'Manage your availability & time slots', tab: 'schedule' as CoachTab, color: 'bg-blue-500/5 border-blue-500/15' },
            { icon: <Dumbbell className="h-5 w-5 text-emerald-500" />, label: 'Sessions', desc: 'View upcoming & past PT sessions', tab: 'sessions' as CoachTab, color: 'bg-emerald-500/5 border-emerald-500/15' },
            { icon: <Users className="h-5 w-5 text-amber-500" />, label: 'My Members', desc: 'Check your assigned clients', tab: 'members' as CoachTab, color: 'bg-amber-500/5 border-amber-500/15' },
            { icon: <User className="h-5 w-5 text-purple-500" />, label: 'Profile', desc: 'Update your details & password', tab: 'profile' as CoachTab, color: 'bg-purple-500/5 border-purple-500/15' },
          ].map(action => (
            <button
              key={action.tab}
              onClick={() => onNavigate(action.tab)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all hover:shadow-sm active:scale-[0.98] ${action.color}`}
            >
              <div className="p-2 rounded-lg bg-card shadow-sm">{action.icon}</div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold">{action.label}</p>
                <p className="text-[10px] text-muted-foreground">{action.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      {/* ─── Motivational Card ─── */}
      <Card className="bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
        <CardContent className="p-4 flex items-center gap-3">
          <Star className="h-8 w-8 text-primary/60 shrink-0" />
          <div>
            <p className="text-xs font-bold text-primary">Keep up the great work!</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              You've coached {stats.totalSessionsAllTime} sessions. Your dedication is building champions. 💪
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
