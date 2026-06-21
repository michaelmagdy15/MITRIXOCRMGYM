import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { format, parseISO, differenceInDays, isToday, startOfDay } from 'date-fns';
import { 
  Sparkles, Calendar, CheckCircle2, Trophy, Activity, Dumbbell, Award, Users, 
  ShoppingBag, Bell, Clock, Flame, ChevronRight, MapPin, Zap, User, 
  TrendingUp, Star, Timer, Target, Coins
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// ─── Helper: Get time-based greeting ───
function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 6) return { text: 'Good Night', emoji: '🌙' };
  if (hour < 12) return { text: 'Good Morning', emoji: '☀️' };
  if (hour < 17) return { text: 'Good Afternoon', emoji: '🌤️' };
  if (hour < 21) return { text: 'Good Evening', emoji: '🌅' };
  return { text: 'Good Night', emoji: '🌙' };
}

// ─── Helper: Calculate streak from attendance records ───
function calculateStreak(records: { date: string }[]): { current: number; best: number } {
  if (!records.length) return { current: 0, best: 0 };
  
  // Get unique dates, sorted descending
  const dateStrings: string[] = records.map(r => {
    try { return startOfDay(parseISO(r.date)).toISOString(); } catch { return ''; }
  }).filter(d => d !== '');
  const uniqueDates = [...new Set(dateStrings)].sort().reverse();
  
  if (uniqueDates.length === 0) return { current: 0, best: 0 };
  
  // Calculate current streak (from today backwards)
  const today = startOfDay(new Date());
  let current = 0;
  let checkDate = today;
  
  for (const dateStr of uniqueDates) {
    const d = new Date(dateStr);
    const diff = differenceInDays(checkDate, d);
    if (diff <= 1) {
      current++;
      checkDate = d;
    } else {
      break;
    }
  }
  
  // Calculate best streak
  let best = 1;
  let tempStreak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]!);
    const curr = new Date(uniqueDates[i]!);
    const diff = differenceInDays(prev, curr);
    if (diff === 1) {
      tempStreak++;
      best = Math.max(best, tempStreak);
    } else {
      tempStreak = 1;
    }
  }
  best = Math.max(best, current);
  
  return { current, best };
}

interface QuickShortcut {
  icon: React.ReactNode;
  label: string;
  action: () => void;
  color: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  linkUrl?: string;
  priority: number;
  startDate: string;
  endDate: string;
  createdBy: string;
}

export default function MemberHome({ client, onSwitchToStore, onNavigate }: { 
  client: Client | null; 
  onSwitchToStore?: () => void;
  onNavigate?: (tab: string) => void;
}) {
  const { theme } = useTheme();
  const { branding } = useSettings();
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [streak, setStreak] = useState({ current: 0, best: 0 });
  const [performanceLogs, setPerformanceLogs] = useState<any[]>([]);
  const [loadingPerformance, setLoadingPerformance] = useState(true);
  const [trafficData, setTrafficData] = useState<any[]>([]);
  const [loadingTraffic, setLoadingTraffic] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = client?.name?.split(' ')[0] || 'Member';

  // ─── Fetch attendance data ───
  useEffect(() => {
    if (!client?.id) return;
    const attendanceRef = collection(db, 'attendance');
    const q = query(attendanceRef, where('clientId', '==', client.id));

    getDocs(q)
      .then((snapshot) => {
        const records = snapshot.docs.map(doc => doc.data());
        setTotalCheckIns(records.length);
        records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setLastCheckIn(records[0]?.date || null);
        setStreak(calculateStreak(records as { date: string }[]));
      })
      .catch((err) => {
        console.warn("Could not load attendance:", err.code || err.message);
      });
  }, [client?.id]);

  // ─── Fetch performance logs ───
  useEffect(() => {
    if (!client?.id) {
      setLoadingPerformance(false);
      return;
    }
    const q = query(collection(db, 'clientPerformance'), where('clientId', '==', client.id));
    getDocs(q)
      .then((snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        list.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
        setPerformanceLogs(list);
      })
      .catch((err) => {
        console.warn("Could not load performance logs:", err.code || err.message);
        setPerformanceLogs([]);
      })
      .finally(() => setLoadingPerformance(false));
  }, [client?.id]);

  // ─── Fetch gym traffic data ───
  useEffect(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const attendanceRef = collection(db, 'attendance');
    const q = query(attendanceRef, where('date', '>=', thirtyDaysAgo.toISOString()));

    getDocs(q)
      .then((snapshot) => {
        const records = snapshot.docs.map(doc => doc.data());
        const hourLabels: Record<number, string> = {
          6: '6am', 7: '7am', 8: '8am', 9: '9am', 10: '10am', 11: '11am',
          12: '12pm', 13: '1pm', 14: '2pm', 15: '3pm', 16: '4pm', 17: '5pm',
          18: '6pm', 19: '7pm', 20: '8pm', 21: '9pm', 22: '10pm'
        };
        const hoursMap = Array.from({ length: 17 }, (_, i) => {
          const h = i + 6;
          return { hour: h, label: hourLabels[h] || `${h}:00`, count: 0 };
        });
        records.forEach(r => {
          try {
            if (r.date) {
              const hr = new Date(r.date).getHours();
              const entry = hoursMap.find(d => d.hour === hr);
              if (entry) entry.count += 1;
            }
          } catch (e) { /* ignore */ }
        });
        setTrafficData(hoursMap);
        setLoadingTraffic(false);
      })
      .catch((err) => {
        console.warn("Could not load traffic data:", err.code || err.message);
        setTrafficData([]);
        setLoadingTraffic(false);
      });
  }, []);

  // ─── Fetch announcements ───
  useEffect(() => {
    getDocs(collection(db, 'announcements'))
      .then((snapshot) => {
        const now = new Date();
        const list = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Announcement))
          .filter(a => {
            try {
              if (!a.startDate || !a.endDate) return false;
              const start = parseISO(a.startDate);
              const end = parseISO(a.endDate);
              return now >= start && now <= end;
            } catch { return false; }
          })
          .sort((a, b) => (b.priority || 0) - (a.priority || 0));
        setAnnouncements(list);
      })
      .catch((err) => {
        // Announcements collection may not exist yet — that's fine
        console.warn("Could not load announcements:", err.code || err.message);
      });
  }, []);

  // ─── Auto-rotate announcements ───
  useEffect(() => {
    if (announcements.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentAnnouncementIndex(prev => (prev + 1) % announcements.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [announcements.length]);

  // ─── Extract PRs ───
  const prsMap = new Map<string, { weight: number; reps: number; date: string }>();
  performanceLogs.forEach(log => {
    if (log.prs && Array.isArray(log.prs)) {
      log.prs.forEach((pr: any) => {
        const key = pr.exercise.trim().toLowerCase();
        const existing = prsMap.get(key);
        if (!existing || pr.weight > existing.weight) {
          prsMap.set(key, { weight: pr.weight, reps: pr.reps, date: log.date });
        }
      });
    }
  });
  const prsList = Array.from(prsMap.entries()).map(([exercise, data]) => ({
    exercise: exercise.toUpperCase(),
    ...data
  }));

  // ─── Calculate days until expiry ───
  const daysToExpiry = useMemo(() => {
    if (!client?.membershipExpiry) return null;
    try {
      return differenceInDays(parseISO(client.membershipExpiry), new Date());
    } catch { return null; }
  }, [client?.membershipExpiry]);

  const formatOptionalDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try { return format(parseISO(dateStr), 'dd MMM yyyy'); } catch { return 'N/A'; }
  };

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <p className="font-semibold text-lg">No member record found.</p>
        <p className="text-xs">Contact gym administration to link your account.</p>
      </div>
    );
  }

  const statusColor = client.status === 'Active' 
    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
    : 'bg-amber-500/10 text-amber-500 border-amber-500/20';

  const memberQrValue = client.memberId || client.id;

  // ─── Quick Shortcuts ───
  const shortcuts: QuickShortcut[] = [
    { 
      icon: <Calendar className="h-6 w-6" />, 
      label: 'Bookings', 
      action: () => onNavigate?.('booking'),
      color: 'bg-blue-500/10 text-blue-500'
    },
    { 
      icon: <ShoppingBag className="h-6 w-6" />, 
      label: 'Shop', 
      action: () => onSwitchToStore?.(),
      color: 'bg-orange-500/10 text-orange-500'
    },
    { 
      icon: <Coins className="h-6 w-6" />, 
      label: 'Wallet', 
      action: () => onNavigate?.('wallet'),
      color: 'bg-amber-500/10 text-amber-500'
    },
    { 
      icon: <Trophy className="h-6 w-6" />, 
      label: 'Progress', 
      action: () => onNavigate?.('profile-progress'),
      color: 'bg-purple-500/10 text-purple-500'
    },
    { 
      icon: <User className="h-6 w-6" />, 
      label: 'Profile', 
      action: () => onNavigate?.('profile'),
      color: 'bg-emerald-500/10 text-emerald-500'
    },
  ];

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── BeFit-Style Greeting Header ─── */}
      <div className="pt-1">
        <p className="text-2xl font-bold tracking-tight">
          {greeting.text} {greeting.emoji}
        </p>
        <p className="text-lg font-semibold text-primary mt-0.5">{firstName}</p>
      </div>

      {/* ─── Streak & Stats Badges ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-500 px-3 py-1.5 rounded-full">
          <Flame className="h-4 w-4" />
          <span className="text-xs font-bold">{streak.current} Day Streak</span>
        </div>
        <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-500 px-3 py-1.5 rounded-full">
          <Activity className="h-4 w-4" />
          <span className="text-xs font-bold">{totalCheckIns} Check-ins</span>
        </div>
        {streak.best > 0 && (
          <div className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-500 px-3 py-1.5 rounded-full">
            <Star className="h-4 w-4" />
            <span className="text-xs font-bold">Best: {streak.best}</span>
          </div>
        )}
      </div>

      {/* ─── Announcement Carousel ─── */}
      {announcements.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl">
          {announcements.map((announcement, idx) => (
            <div
              key={announcement.id}
              className={`transition-all duration-500 ${
                idx === currentAnnouncementIndex ? 'block' : 'hidden'
              }`}
            >
              <div 
                className="relative bg-gradient-to-br from-primary/90 to-primary/60 text-primary-foreground p-5 rounded-2xl cursor-pointer"
                onClick={() => announcement.linkUrl && window.open(announcement.linkUrl, '_blank')}
              >
                {announcement.imageUrl && (
                  <div className="absolute inset-0 rounded-2xl overflow-hidden">
                    <img 
                      src={announcement.imageUrl} 
                      alt="" 
                      className="w-full h-full object-cover opacity-20"
                    />
                  </div>
                )}
                <div className="relative z-10">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">📢 Announcement</p>
                  <p className="text-lg font-bold">{announcement.title}</p>
                  <p className="text-sm opacity-90 mt-1 line-clamp-2">{announcement.body}</p>
                </div>
              </div>
            </div>
          ))}
          {/* Carousel dots */}
          {announcements.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-2">
              {announcements.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentAnnouncementIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentAnnouncementIndex 
                      ? 'w-6 bg-primary' 
                      : 'w-1.5 bg-muted-foreground/30'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Quick Shortcuts (BeFit-style) ─── */}
      <div>
        <h3 className="text-sm font-bold mb-3">Quick Shortcuts</h3>
        <div className="grid grid-cols-4 gap-3">
          {shortcuts.map((s, idx) => (
            <button
              key={idx}
              onClick={s.action}
              className="flex flex-col items-center gap-2 group"
            >
              <div className={`w-14 h-14 rounded-full ${s.color} flex items-center justify-center transition-transform group-hover:scale-110 group-active:scale-95 border border-current/10`}>
                {s.icon}
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Premium Membership Card ─── */}
      <div className="relative group overflow-hidden rounded-3xl p-0.5 bg-gradient-to-br from-primary via-primary/30 to-background/50 shadow-2xl">
        <div className="absolute inset-0 bg-grid-white/[0.02] rounded-3xl" />
        <div className="absolute -inset-y-12 -inset-x-12 bg-gradient-to-tr from-primary/10 via-transparent to-transparent blur-3xl opacity-50 group-hover:opacity-75 transition-opacity" />
        
        <Card className="relative border-0 rounded-[22px] overflow-hidden bg-zinc-950 text-white shadow-none">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
          
          <CardContent className="p-5 space-y-5">
            {/* Logo and Status */}
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400">{branding?.companyName || 'MITRIXO GYM'}</p>
                <p className="text-xs font-mono text-primary mt-0.5">MEMBER PASS</p>
              </div>
              <Badge className={`px-2 py-0.5 text-[10px] font-semibold border ${statusColor}`} variant="outline">
                {client.status}
              </Badge>
            </div>

            {/* QR Code */}
            <div className="flex justify-center py-1 relative">
              <div className="bg-white p-3 rounded-2xl shadow-lg shadow-black/40 border border-white/10 relative z-10">
                <QRCodeSVG 
                  value={memberQrValue} 
                  size={120} 
                  level="H" 
                  includeMargin={false}
                  fgColor="#09090b"
                />
              </div>
            </div>

            {/* Member Details */}
            <div className="flex justify-between items-end pt-1">
              <div className="space-y-0.5">
                <p className="text-xs text-zinc-400 font-medium">NAME</p>
                <p className="text-lg font-bold tracking-tight leading-none truncate max-w-[180px]">{client.name}</p>
                <p className="text-[10px] font-mono text-zinc-500">ID: {client.memberId || client.id.substring(0, 8)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400 font-medium">BRANCH</p>
                <p className="text-sm font-semibold tracking-wide text-primary uppercase">{client.branch || 'MAIN'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Stats Grid (BeFit-Inspired) ─── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Package */}
        <Card className="border bg-card/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex flex-col justify-between h-[100px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Package</span>
              <Trophy className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-auto">
              <p className="text-sm font-bold truncate pr-1" title={client.packageType || 'None'}>
                {client.packageType || 'No package'}
              </p>
              {daysToExpiry !== null && (
                <p className={`text-[10px] font-semibold mt-0.5 ${
                  daysToExpiry <= 3 ? 'text-destructive' : daysToExpiry <= 7 ? 'text-amber-500' : 'text-muted-foreground'
                }`}>
                  {daysToExpiry < 0 ? 'Expired' : daysToExpiry === 0 ? 'Expires today' : `${daysToExpiry} days left`}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sessions */}
        <Card className="border bg-card/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex flex-col justify-between h-[100px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Sessions</span>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-auto">
              {client.sessionsRemaining === 'unlimited' ? (
                <p className="text-xl font-extrabold text-emerald-500 leading-none">Unlimited</p>
              ) : (
                <p className={`text-2xl font-extrabold leading-none ${
                  Number(client.sessionsRemaining || 0) <= 1 ? 'text-destructive' : 'text-emerald-500'
                }`}>
                  {client.sessionsRemaining ?? 0}
                  <span className="text-xs font-semibold text-muted-foreground ml-1">left</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Check-in streak */}
        <Card className="border bg-card/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex flex-col justify-between h-[100px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Streak</span>
              <Flame className="h-4 w-4 text-orange-500" />
            </div>
            <div className="mt-auto">
              <p className="text-2xl font-extrabold text-orange-500 leading-none">
                {streak.current}
                <span className="text-xs font-semibold text-muted-foreground ml-1">days</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Best: {streak.best} days
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Last Check-in */}
        <Card className="border bg-card/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex flex-col justify-between h-[100px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Last Visit</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-auto">
              {lastCheckIn ? (
                <>
                  <p className="text-sm font-bold leading-tight">
                    {isToday(parseISO(lastCheckIn)) ? 'Today' : format(parseISO(lastCheckIn), 'EEE, dd MMM')}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(parseISO(lastCheckIn), 'h:mm a')}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">No visits yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Shop Button ─── */}
      {onSwitchToStore && (
        <Button 
          onClick={onSwitchToStore}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl h-12 text-sm font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
        >
          <ShoppingBag className="h-4 w-4" /> Shop Session Packages
        </Button>
      )}

      {/* ─── Gym Peak Hours ─── */}
      <Card className="border bg-card/40 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Gym Peak Hours
          </CardTitle>
          <CardDescription className="text-[11px]">
            Hourly gym occupancy (last 30 days)
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-1">
          {loadingTraffic ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            </div>
          ) : trafficData.some(d => d.count > 0) ? (
            <div className="h-32 w-full -ml-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trafficData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} vertical={false} />
                  <XAxis dataKey="label" stroke={theme === 'dark' ? '#a1a1aa' : '#71717a'} fontSize={8} tickLine={false} axisLine={false} />
                  <YAxis stroke={theme === 'dark' ? '#a1a1aa' : '#71717a'} fontSize={8} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', 
                      borderColor: theme === 'dark' ? '#27272a' : '#e4e4e7',
                      color: theme === 'dark' ? '#ffffff' : '#000000',
                      borderRadius: '8px',
                      fontSize: '10px'
                    }}
                    formatter={(value) => [`${value} check-ins`, 'Volume']}
                  />
                  <Bar dataKey="count" fill={theme === 'dark' ? '#ffffff' : '#09090b'} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground italic">
              No recent attendance data available.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Personal Records (PRs) ─── */}
      {prsList.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <Award className="h-4 w-4 text-primary" /> Personal Records
          </h3>
          <div className="flex flex-wrap gap-2">
            {prsList.map((pr, idx) => (
              <Badge key={idx} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] py-1.5 px-3 rounded-xl flex flex-col items-start gap-0.5">
                <span className="font-bold">{pr.exercise}</span>
                <span className="font-mono text-xs">{pr.weight} kg × {pr.reps}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ─── Recent Fitness Logs ─── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-primary" /> Recent Workouts
        </h3>

        {performanceLogs.length > 0 ? (
          <div className="space-y-3">
            {performanceLogs.slice(0, 3).map(log => (
              <Card key={log.id} className="border bg-card/40 hover:bg-card/75 transition-colors shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground border-b pb-2">
                    <span className="font-bold text-foreground">Coach {log.coachName}</span>
                    <span>{format(parseISO(log.date), 'dd MMM yyyy')}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {log.weight && (
                      <div className="bg-muted/40 p-2.5 rounded-xl border">
                        <span className="text-[9px] text-muted-foreground block uppercase font-bold">Weight</span>
                        <strong className="text-sm font-bold text-foreground">{log.weight} kg</strong>
                      </div>
                    )}
                  </div>

                  {log.workoutNotes && (
                    <div className="text-xs">
                      <span className="text-[9px] text-muted-foreground block uppercase font-bold">Notes</span>
                      <p className="mt-1 text-muted-foreground leading-relaxed bg-muted/20 p-2 rounded-lg border text-[11px]">"{log.workoutNotes}"</p>
                    </div>
                  )}

                  {log.prs && log.prs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {log.prs.map((pr: any, i: number) => (
                        <Badge key={i} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[9px] font-medium">
                          {pr.exercise}: {pr.weight}kg × {pr.reps}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {performanceLogs.length > 3 && (
              <Button 
                variant="ghost" 
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate?.('profile-progress')}
              >
                View all {performanceLogs.length} workout logs <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-8 text-center text-muted-foreground text-xs italic">
              No fitness logs yet. Ask your coach to log your stats during your next session!
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
