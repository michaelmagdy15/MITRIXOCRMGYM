import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { db, getTenantId } from '../firebase';
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

const BoxingGlovesIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 122.88 117.44"
    fill="currentColor"
    className={className}
  >
    <g>
      <path d="M21.86,19.78c2.94-2.56,6.34-4.67,10.2-6.3l-2.53-2.45c-3.63-0.09-5.12,0.47-8.62,3.17c-1.23,0.95-2.47,1.99-3.7,3.11 c-1.62,2.11-3.23,2.44-4.85,0.79l-0.88-0.79c-0.88-1.43-1.04-3,1.32-5.11l3.98-3.13c1.79-1.41,3.5-3.24,5.9-3.37 c0.44-0.03,0.91-0.01,1.38,0.05l-1.42-1.37c-0.57-0.45-1.15-0.81-1.75-1.07c-0.59-0.25-1.2-0.41-1.82-0.44 c-2.1-0.12-5.32,1.95-8.36,4.68c-3.69,3.31-6.97,7.49-7.68,9.98c-1.13,3.94,3.89,8.28,8.1,11.92c0.58,0.5,1.14,0.99,1.67,1.46 c2.24-4.06,5-7.53,8.26-10.42C21.32,20.24,21.59,20.01,21.86,19.78L21.86,19.78z M102.99,95.63c2.44-3.04,4.42-6.52,5.89-10.44 l2.55,2.43c0.24,3.62-0.27,5.14-2.82,8.74c-0.9,1.27-1.89,2.54-2.96,3.82c-2.04,1.7-2.31,3.33-0.6,4.87l0.83,0.85 c1.46,0.82,3.04,0.93,5.05-1.52l2.97-4.1c1.34-1.84,3.1-3.63,3.14-6.03c0.01-0.44-0.03-0.91-0.11-1.38l1.43,1.37 c0.47,0.55,0.85,1.12,1.13,1.71c0.28,0.58,0.46,1.18,0.52,1.81c0.2,2.09-1.74,5.4-4.34,8.54c-3.17,3.82-7.21,7.26-9.67,8.07 c-3.89,1.29-8.43-3.56-12.23-7.63c-0.52-0.56-1.03-1.1-1.53-1.62c3.97-2.4,7.32-5.29,10.09-8.66 C102.55,96.19,102.78,95.91,102.99,95.63L102.99,95.63z M75.6,69.87c0.36-0.7,0.09-1.56-0.61-1.92s-1.56-0.09-1.92,0.61 c-0.86,1.66-1.84,3.18-2.97,4.53c-1.12,1.33-2.39,2.49-3.84,3.46c-0.66,0.44-0.83,1.32-0.4,1.98c0.44,0.66,1.32,0.83,1.98,0.4 c1.69-1.12,3.16-2.47,4.44-4C73.55,73.42,74.64,71.72,75.6,69.87L75.6,69.87z M81.27,75.11c0.36-0.7,0.09-1.56-0.61-1.92 c-0.7-0.36-1.56-0.09-1.92,0.61c-0.86,1.66-1.84,3.18-2.97,4.53c-1.12,1.33-2.39,2.49-3.84,3.46c-0.66,0.44-0.83,1.32-0.4,1.98 c0.44,0.66,1.32,0.83,1.98,0.4c1.69-1.12,3.16-2.47,4.44-4C79.22,78.66,80.32,76.96,81.27,75.11L81.27,75.11z M92.67,68.4 c-1.54-2.57-3.1-4.77-4.67-6.61l-0.18-0.21c-1.93-3.05-3.32-6.1-1.89-7.18l0,0c0.92-0.69,2.3-0.77,3.76-0.51 c2.17,0.38,4.4,1.49,5.76,2.5c1.77,1.33,3.38,3.05,4.76,4.9c1.65,2.2,2.97,4.57,3.88,6.66c0.92,2.14,1.61,4.44,2.06,6.91 c0.43,2.41,0.62,4.98,0.56,7.73c-1.43,4.26-3.43,8.06-6.03,11.38c-0.19,0.24-0.39,0.48-0.59,0.71c-3,3.49-6.72,6.33-11.1,8.57l0,0 c-0.05,0.03-0.1,0.06-0.15,0.09c-0.54-0.02-1.09-0.05-1.65-0.1c-0.96-0.08-1.9-0.19-2.82-0.34c-3.02-0.5-5.59-1.3-8.03-2.42 c-2.47-1.13-4.82-2.57-7.4-4.32c-1.26-0.85-2.51-1.78-3.75-2.78c-1.24-0.99-2.42-2.03-3.55-3.11h0c-2.46-2.57-4.17-5.07-5.17-7.51 c-0.97-2.37-1.26-4.69-0.9-6.97c0.34-2.12,1.6-4.66,3.24-7.1c2.09-3.13,4.75-6.06,6.86-7.86c0.91-0.77,1.8-1.43,2.68-1.95 c2.86-1.71,5.75-2.25,8.6-1.53c2.91,0.73,5.86,2.77,8.8,6.18c1.24,1.98,2.63,3.83,3.67,5.24c0.29,0.38,0.54,0.72,0.93,1.26 c0.46,0.64,1.35,0.79,1.99,0.32C92.94,69.9,93.1,69.04,92.67,68.4L92.67,68.4z M82.75,56.96c-1.7-1.16-3.41-1.95-5.14-2.38 c-3.62-0.91-7.22-0.26-10.76,1.86c-1.05,0.63-2.07,1.37-3.08,2.23c-2.27,1.94-5.14,5.1-7.38,8.45c-1.84,2.75-3.28,5.67-3.69,8.25 c-0.44,2.79-0.09,5.61,1.09,8.48c1.14,2.79,3.06,5.6,5.79,8.45l0.04,0.04l0,0c-1.23,1.17-2.47,2.26,3.74,3.28 c1.25,1.01,2.57,1.98,3.94,2.91c2.71,1.84,5.19,3.36,7.82,4.56c2.66,1.21,5.45,2.09,8.75,2.64c1.05,0.17,2.07,0.3,3.06,0.38 c0.77,0.06,1.56,0.1,2.36,0.11c0.75,0.75,1.55,1.6,2.38,2.49c4.37,4.67,9.59,10.24,15.21,8.38c2.93-0.97,7.52-4.78,10.98-8.96 c3.03-3.66,5.27-7.7,4.99-10.62c-0.1-0.98-0.36-1.9-0.78-2.77c-0.4-0.84-0.94-1.63-1.59-2.38l0,0c-0.03-0.03-0.06-0.07-0.09-0.1 l-10.84-10.36c0.02-2.64-0.19-5.14-0.61-7.51c-0.48-2.67-1.23-5.18-2.25-7.53c-0.99-2.29-2.43-4.87-4.21-7.26 c-1.53-2.05-3.33-3.97-5.33-5.47c-1.64-1.23-4.35-2.57-6.97-3.03c-2.16-0.38-4.32-0.19-5.97,1.05l0,0l0,0 C82.67,53.28,82.36,55.01,82.75,56.96L82.75,56.96z M48.69,46.14c0.69-0.39,1.56-0.15,1.95,0.54c0.39,0.69,0.15,1.56-0.54,1.95 c-1.62,0.92-3.1,1.96-4.41,3.15c-1.29,1.17-2.4,2.48-3.3,3.97c-0.41,0.67-1.29,0.89-1.96,0.48c-0.67-0.41-0.89-1.29-0.48-1.96 c1.06-1.73,2.34-3.25,3.82-4.6C45.22,48.33,46.88,47.17,48.69,46.14L48.69,46.14z M43.22,40.68c0.69-0.39,1.56-0.15,1.95,0.54 c0.39,0.69,0.15,1.56-0.54,1.95c-1.62,0.92-3.1,1.96-4.41,3.15c-1.29,1.17-2.4,2.48-3.3,3.97c-0.41,0.67-1.29,0.89-1.96,0.48 c-0.67-0.41-0.89-1.29-0.48-1.96c1.06-1.73,2.34-3.25,3.82-4.6C39.76,42.86,41.41,41.7,43.22,40.68L43.22,40.68z M49.48,29.03 c2.63,1.44,4.89,2.91,6.79,4.41l0.21,0.17c3.12,1.8,6.23,3.07,7.25,1.61l0,0c0.66-0.95,0.68-2.33,0.36-3.77 c-0.47-2.15-1.66-4.34-2.72-5.65c-1.39-1.72-3.18-3.26-5.08-4.57c-2.27-1.56-4.68-2.79-6.81-3.61c-2.18-0.84-4.5-1.44-6.99-1.78 c-2.43-0.34-5.01-0.42-7.74-0.25c-4.2,1.6-7.92,3.75-11.13,6.47c-0.23,0.2-0.46,0.41-0.68,0.62c-3.37,3.14-6.06,6.96-8.12,11.43 l0,0c-0.02,0.05-0.05,0.1-0.08,0.15c0.04,0.54,0.09,1.09,0.16,1.64c0.12,0.96,0.27,1.89,0.46,2.8c0.62,3,1.52,5.53,2.73,7.92 c1.22,2.42,2.76,4.72,4.61,7.22c0.9,1.22,1.88,2.44,2.92,3.64c1.04,1.2,2.12,2.34,3.24,3.42h0c2.66,2.35,5.23,3.97,7.71,4.87 c2.41,0.88,4.74,1.08,7,0.63c2.11-0.42,4.59-1.79,6.97-3.52c3.04-2.21,5.87-4.99,7.58-7.16c0.74-0.94,1.35-1.86,1.85-2.76 c1.6-2.93,2.02-5.83,1.19-8.65c-0.85-2.88-2.99-5.75-6.52-8.55c-2.03-1.16-3.93-2.47-5.38-3.47c-0.39-0.27-0.74-0.51-1.3-0.88 c-0.66-0.44-0.84-1.32-0.4-1.98C47.97,28.81,48.83,28.62,49.48,29.03L49.48,29.03z M61.3,38.48c1.22,1.65,2.08,3.33,2.58,5.04 c1.05,3.58,0.55,7.21-1.43,10.82c-0.58,1.07-1.29,2.12-2.1,3.16c-1.85,2.35-4.89,5.34-8.15,7.71c-2.68,1.95-5.54,3.5-8.1,4.01 c-2.77,0.55-5.61,0.31-8.52-0.75c-2.83-1.03-5.72-2.84-8.67-5.46l-0.04-0.04l0,0c-1.22-1.18-2.36-2.38-3.42-3.6 c-1.06-1.21-2.08-2.49-3.06-3.82c-1.94-2.63-3.56-5.06-4.87-7.64c-1.32-2.61-2.31-5.37-2.98-8.64c-0.21-1.04-0.38-2.05-0.5-3.04 c-0.09-0.77-0.16-1.55-0.2-2.35c-0.77-0.72-1.66-1.49-2.58-2.28c-4.84-4.19-10.61-9.18-8.98-14.86c0.85-2.96,4.48-7.7,8.52-11.32 c3.53-3.17,7.49-5.57,10.42-5.4c0.99,0.06,1.92,0.29,2.8,0.67c0.85,0.37,1.67,0.87,2.44,1.49l0,0c0.03,0.03,0.07,0.06,0.1,0.09 l10.78,10.42c2.64-0.12,5.15-0.01,7.53,0.32c2.69,0.37,5.22,1.03,7.62,1.95c2.33,0.9,4.96,2.23,7.42,3.92 c2.11,1.45,4.09,3.17,5.67,5.11c1.3,1.59,2.74,4.24,3.31,6.85c0.47,2.15,0.36,4.31-0.81,6l0,0l0,0 C64.98,38.41,63.27,38.79,61.3,38.48L61.3,38.48z" />
    </g>
  </svg>
);

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
  const { branding, features } = useSettings();
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
  const firstName = (client?.name?.split(' ')[0] || 'Member').toUpperCase();

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

  const isStrike = useMemo(() => {
    const tenantId = getTenantId();
    return tenantId.toLowerCase().includes('strike') || (branding?.companyName || '').toLowerCase().includes('strike');
  }, [branding?.companyName]);

  const formatOptionalDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try { return format(parseISO(dateStr), 'dd MMM yyyy'); } catch { return 'N/A'; }
  };

  // ─── Quick Shortcuts ───
  const shortcuts = useMemo(() => {
    const list = [
      { 
        icon: isStrike ? (
          <BoxingGlovesIcon className="h-7 w-7 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
        ) : (
          <Calendar strokeWidth={1.25} className="h-6 w-6 text-red-500 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
        ), 
        label: 'Bookings', 
        action: () => onNavigate?.('booking'),
        glowColor: isStrike ? '#18181b' : '#C20E1A'
      },
      { 
        icon: <Coins strokeWidth={1.25} className={`h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] ${isStrike ? 'text-foreground' : 'text-yellow-600'}`} />, 
        label: 'Wallet', 
        action: () => onNavigate?.('wallet'),
        glowColor: isStrike ? '#71717a' : '#D97706',
        walletRequired: true
      },
      { 
        icon: <Trophy strokeWidth={1.25} className={`h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] ${isStrike ? 'text-foreground' : 'text-emerald-500'}`} />, 
        label: 'Progress', 
        action: () => onNavigate?.('profile-progress'),
        glowColor: isStrike ? '#a1a1aa' : '#059669',
        pointsRequired: true
      },
      { 
        icon: <User strokeWidth={1.25} className={`h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] ${isStrike ? 'text-foreground' : 'text-cyan-500'}`} />, 
        label: 'Profile', 
        action: () => onNavigate?.('profile'),
        glowColor: isStrike ? '#e4e4e7' : '#06B6D4'
      },
    ];
    return list.filter(item => {
      if (item.walletRequired && features.wallet === false) return false;
      if (item.pointsRequired && features.pointsSystem === false) return false;
      return true;
    });
  }, [features, onNavigate, onSwitchToStore, isStrike]);

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

  const checkinsBadgeColor = isStrike 
    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
    : 'bg-blue-500/10 border-blue-500/20 text-blue-500';

  const bestStreakBadgeColor = isStrike 
    ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
    : 'bg-primary/10 border-primary/20 text-primary';

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── BeFit-Style Greeting Header ─── */}
      <div 
        className="pt-1 cursor-pointer hover:opacity-80 active:scale-98 transition-all"
        onClick={() => onNavigate?.('profile')}
      >
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
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${checkinsBadgeColor}`}>
          <Activity className="h-4 w-4" />
          <span className="text-xs font-bold">{totalCheckIns} Check-ins</span>
        </div>
        {streak.best > 0 && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${bestStreakBadgeColor}`}>
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

      {/* ─── Quick Shortcuts (Glassmorphic Style) ─── */}
      <div className="relative z-10">
        <h3 className="text-sm font-bold mb-3">Quick Shortcuts</h3>
        <div className={`grid gap-3 p-5 bg-card/50 backdrop-blur-lg border border-border/30 rounded-3xl shadow-xl shadow-black/5 dark:shadow-black/20 hover:border-primary/20 transition-all duration-300 ${
          shortcuts.length === 3 ? 'grid-cols-3' : shortcuts.length === 4 ? 'grid-cols-4' : 'grid-cols-5'
        }`}>
          {shortcuts.map((s, idx) => (
            <button
              key={idx}
              onClick={s.action}
              className="flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform outline-none group"
            >
              <div className="w-12 h-12 flex items-center justify-center transition-all duration-300 group-hover:-translate-y-1">
                {s.icon}
              </div>
              <span className="text-[10px] font-bold mt-1 text-foreground/80 group-hover:text-foreground transition-colors truncate w-full px-0.5">
                {s.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Premium Membership Card (Horizontal Silver-Metallic) ─── */}
      <div className="relative group overflow-hidden rounded-[24px] shadow-2xl transition-all duration-300 hover:shadow-black/25 animate-float z-10">
        <div className="absolute inset-0 bg-grid-black/[0.03] rounded-3xl pointer-events-none" />
        {/* Subtle dynamic metallic reflection light */}
        <div className="absolute -inset-y-12 -inset-x-12 bg-gradient-to-tr from-white/20 via-transparent to-white/10 blur-xl opacity-60 group-hover:opacity-80 transition-opacity pointer-events-none" />
        
        <Card className="relative border border-zinc-200/60 rounded-[24px] overflow-hidden bg-gradient-to-br from-zinc-300 via-zinc-100 to-zinc-400 text-zinc-800 shadow-none h-[190px] w-full p-4 flex flex-col justify-between">
          {/* Card grain/reflection effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-white/5 to-black/5 pointer-events-none" />
          <div className="absolute top-0 right-0 w-36 h-36 bg-white/20 rounded-full blur-2xl pointer-events-none" />
          
          {/* Top Row: Brand & ID */}
          <div className="flex justify-between items-start z-10">
            <div className="flex items-center gap-1">
              <Sparkles className="h-4 w-4 text-zinc-600 animate-pulse shrink-0" />
              <p className="text-[11px] font-extrabold tracking-[0.25em] uppercase text-zinc-900 leading-none">
                {branding?.companyName || 'STRIKE'}
              </p>
            </div>
            <p className="text-[10px] font-mono font-bold tracking-wider text-zinc-600 bg-zinc-200/50 px-2 py-0.5 rounded-md border border-zinc-300/30">
              #{client.memberId || client.id.substring(0, 8)}
            </p>
          </div>

          {/* Middle & Bottom: Horizontal Layout */}
          <div className="flex items-center justify-between gap-3 z-10 flex-1 mt-2">
            {/* Left Side: Client Name, Expiry, Status, Branch */}
            <div className="flex flex-col justify-between h-full py-1 min-w-0 flex-1">
              <div>
                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-none mb-1">MEMBER PASS</p>
                <h4 className="text-lg font-black tracking-tight text-zinc-950 uppercase truncate leading-tight pr-1">
                  {client.name}
                </h4>
              </div>
              
              <div className="space-y-1 mt-auto">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[9px] font-extrabold tracking-wider px-2 py-0.5 rounded-full border ${
                    client.status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-700 border-amber-500/30'
                  }`}>
                    {client.status.toUpperCase()}
                  </span>
                  <span className="text-[9.5px] font-bold text-zinc-600 tracking-wider">
                    VALID UNTIL: {formatOptionalDate(client.membershipExpiry)}
                  </span>
                </div>
                <p className="text-[9px] font-extrabold tracking-widest text-zinc-500 uppercase">
                  BRANCH: <span className="text-zinc-800 font-black">{client.branch || 'MAIN'}</span>
                </p>
              </div>
            </div>

            {/* Right Side: QR Code & Brand Sub-text */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <div className="bg-white p-2 rounded-2xl shadow-md border border-white/50 w-24 h-24 flex items-center justify-center">
                <QRCodeSVG 
                  value={memberQrValue} 
                  size={80} 
                  level="H" 
                  includeMargin={false}
                  fgColor="#18181b"
                />
              </div>
              <span className="text-[8px] font-extrabold tracking-[0.3em] uppercase text-zinc-700 mt-1 font-logo">
                STRIKE GYMS
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Stats Grid (BeFit-Inspired Glassmorphic) ─── */}
      <div className="grid grid-cols-2 gap-3 relative z-10">
        {/* Package */}
        <Card className="border border-border/30 bg-card/45 backdrop-blur-lg shadow-lg shadow-black/5 dark:shadow-black/20 rounded-3xl hover:border-primary/20 hover:scale-[1.02] active:scale-98 transition-all duration-300">
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
        <Card className="border border-border/30 bg-card/45 backdrop-blur-lg shadow-lg shadow-black/5 dark:shadow-black/20 rounded-3xl hover:border-primary/20 hover:scale-[1.02] active:scale-98 transition-all duration-300">
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
        <Card className="border border-border/30 bg-card/45 backdrop-blur-lg shadow-lg shadow-black/5 dark:shadow-black/20 rounded-3xl hover:border-primary/20 hover:scale-[1.02] active:scale-98 transition-all duration-300">
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
        <Card className="border border-border/30 bg-card/45 backdrop-blur-lg shadow-lg shadow-black/5 dark:shadow-black/20 rounded-3xl hover:border-primary/20 hover:scale-[1.02] active:scale-98 transition-all duration-300">
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
                    formatter={(value: any) => [`${value} check-ins`, 'Volume']}
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
