import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { Sparkles, Calendar, CheckCircle2, Trophy, Activity, Dumbbell, Award, Users, ShoppingBag } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
export default function MemberHome({ client, onSwitchToStore }: { client: Client | null, onSwitchToStore?: () => void }) {
  const { theme } = useTheme();
  const [lastCheckIn, setLastCheckIn] = useState<string | null>(null);
  const [performanceLogs, setPerformanceLogs] = useState<any[]>([]);
  const [loadingPerformance, setLoadingPerformance] = useState(true);
  const [trafficData, setTrafficData] = useState<any[]>([]);
  const [loadingTraffic, setLoadingTraffic] = useState(true);

  useEffect(() => {
    if (!client?.id) return;

    // Fetch attendance to find the latest check-in
    const attendanceRef = collection(db, 'attendance');
    const q = query(attendanceRef, where('clientId', '==', client.id));

    getDocs(q)
      .then((snapshot) => {
        if (!snapshot.empty) {
          const records = snapshot.docs.map(doc => doc.data());
          // Sort by date descending
          records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setLastCheckIn(records[0]?.date || null);
        } else {
          setLastCheckIn(null);
        }
      })
      .catch((err) => {
        console.error("Error fetching last check-in:", err);
      });
  }, [client?.id]);

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
        // Gracefully handle permission errors — show empty state
        console.warn("Could not load performance logs (may be a permissions issue):", err.code || err.message);
        setPerformanceLogs([]);
      })
      .finally(() => setLoadingPerformance(false));
  }, [client?.id]);

  useEffect(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const attendanceRef = collection(db, 'attendance');
    const q = query(
      attendanceRef,
      where('date', '>=', thirtyDaysAgo.toISOString())
    );

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
          return {
            hour: h,
            label: hourLabels[h] || `${h}:00`,
            count: 0
          };
        });

        records.forEach(r => {
          try {
            if (r.date) {
              const hr = new Date(r.date).getHours();
              const entry = hoursMap.find(d => d.hour === hr);
              if (entry) {
                entry.count += 1;
              }
            }
          } catch (e) {
            console.error("Error parsing attendance date:", e);
          }
        });

        setTrafficData(hoursMap);
        setLoadingTraffic(false);
      })
      .catch((err) => {
        console.warn("Could not load traffic data (may be a permissions issue):", err.code || err.message);
        setTrafficData([]);
        setLoadingTraffic(false);
      });
  }, []);

  // Extract all PRs
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

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <p className="font-semibold text-lg">No member record found.</p>
        <p className="text-xs">Contact gym administration to link your account.</p>
      </div>
    );
  }

  // Format expiry/start dates safely
  const formatOptionalDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return 'N/A';
    }
  };

  const statusColor = client.status === 'Active' 
    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
    : 'bg-amber-500/10 text-amber-500 border-amber-500/20';

  const memberQrValue = client.memberId || client.id;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Premium Glassmorphism Membership Card */}
      <div className="relative group overflow-hidden rounded-3xl p-0.5 bg-gradient-to-br from-primary via-primary/30 to-background/50 shadow-2xl">
        <div className="absolute inset-0 bg-grid-white/[0.02] rounded-3xl" />
        <div className="absolute -inset-y-12 -inset-x-12 bg-gradient-to-tr from-primary/10 via-transparent to-transparent blur-3xl opacity-50 group-hover:opacity-75 transition-opacity" />
        
        <Card className="relative border-0 rounded-[22px] overflow-hidden bg-zinc-950 text-white shadow-none">
          {/* Card Header styling */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
          
          <CardContent className="p-6 space-y-6">
            {/* Logo and Level */}
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400">MITRIXOGYMCRM BOXING CLUB</p>
                <p className="text-xs font-mono text-primary mt-0.5">MEMBER PASS</p>
              </div>
              <Badge className={`px-2 py-0.5 text-[10px] font-semibold border ${statusColor}`} variant="outline">
                {client.status}
              </Badge>
            </div>

            {/* QR Code section */}
            <div className="flex justify-center py-2 relative">
              <div className="bg-white p-3.5 rounded-2xl shadow-lg shadow-black/40 border border-white/10 relative z-10">
                <QRCodeSVG 
                  value={memberQrValue} 
                  size={140} 
                  level="H" 
                  includeMargin={false}
                  fgColor="#09090b" // Zinc-950 match
                />
              </div>
            </div>

            {/* Member Card Details */}
            <div className="flex justify-between items-end pt-2">
              <div className="space-y-1">
                <p className="text-xs text-zinc-400 font-medium">NAME</p>
                <p className="text-lg font-bold tracking-tight leading-none truncate max-w-[180px]">{client.name}</p>
                <p className="text-[10px] font-mono text-zinc-500">ID: {client.memberId || client.id.substring(0, 8)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400 font-medium">BRANCH</p>
                <p className="text-sm font-semibold tracking-wide text-primary uppercase">{client.branch || 'COMPLEX'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {onSwitchToStore && (
        <Button 
          onClick={onSwitchToStore}
          className="w-full bg-zinc-950 hover:bg-zinc-900 text-primary border border-primary/20 hover:border-primary/40 rounded-2xl h-12 text-xs font-bold uppercase tracking-wider shadow-sm flex items-center justify-center gap-2"
        >
          <ShoppingBag className="h-4 w-4" /> Shop Session Packages
        </Button>
      )}

      {/* Quick Summary Metrics */}
      <div className="grid grid-cols-2 gap-4">
        {/* Metric: Active Package */}
        <Card className="border bg-card/50 shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between h-24">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Active Package</span>
              <Trophy className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1">
              <p className="text-sm font-bold truncate pr-1" title={client.packageType || 'None'}>
                {client.packageType || 'No active package'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Expires: {formatOptionalDate(client.membershipExpiry)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Metric: Sessions Remaining */}
        <Card className="border bg-card/50 shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between h-24">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider">Remaining</span>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1">
              {client.sessionsRemaining === 'unlimited' ? (
                <p className="text-xl font-extrabold text-emerald-500 leading-none">Unlimited</p>
              ) : (
                <p className={`text-xl font-extrabold leading-none ${
                  Number(client.sessionsRemaining || 0) <= 1 ? 'text-destructive' : 'text-emerald-500'
                }`}>
                  {client.sessionsRemaining ?? 0} <span className="text-xs font-semibold text-muted-foreground">left</span>
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Start: {formatOptionalDate(client.startDate)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Check-In Detail */}
      <Card className="border bg-card/50 shadow-sm">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Last Check-In</p>
              <p className="text-sm font-semibold mt-0.5">
                {lastCheckIn ? format(parseISO(lastCheckIn), 'EEEE, dd MMM yyyy') : 'No check-in recorded yet'}
              </p>
            </div>
          </div>
          {lastCheckIn && (
            <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold tracking-wider uppercase">Verified</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gym Peak Hours Traffic Widget */}
      <Card className="border bg-card/40 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary animate-pulse" /> Gym Peak Hours
          </CardTitle>
          <CardDescription className="text-[11px]">
            Hourly gym occupancy based on check-ins over the past 30 days.
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
                  <XAxis 
                    dataKey="label" 
                    stroke={theme === 'dark' ? '#a1a1aa' : '#71717a'} 
                    fontSize={8} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke={theme === 'dark' ? '#a1a1aa' : '#71717a'} 
                    fontSize={8} 
                    tickLine={false} 
                    axisLine={false}
                    allowDecimals={false}
                  />
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
                  <Bar 
                    dataKey="count" 
                    fill={theme === 'dark' ? '#ffffff' : '#09090b'} 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground italic">
              No recent attendance data available to forecast peak hours.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fitness & Performance Logs */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-primary" /> My Fitness Progress
        </h3>

        {/* Personal Records Card */}
        {prsList.length > 0 && (
          <Card className="border bg-card/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Award className="h-3.5 w-3.5 text-primary" /> Personal Records (PRs)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pt-0">
              {prsList.map((pr, idx) => (
                <Badge key={idx} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] py-1 px-2.5 rounded-lg flex flex-col items-start gap-0.5">
                  <span className="font-bold">{pr.exercise}</span>
                  <span className="font-mono text-xs">{pr.weight} kg x {pr.reps} reps</span>
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Historical Logs List */}
        {performanceLogs.length > 0 ? (
          <div className="space-y-3">
            {performanceLogs.map(log => (
              <Card key={log.id} className="border bg-card/40 hover:bg-card/75 transition-colors shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground border-b pb-2">
                    <span className="font-bold text-foreground">Logged by Coach {log.coachName}</span>
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
                      <span className="text-[9px] text-muted-foreground block uppercase font-bold">Coach Workout Notes</span>
                      <p className="mt-1 text-muted-foreground leading-relaxed bg-muted/20 p-2 rounded-lg border">"{log.workoutNotes}"</p>
                    </div>
                  )}

                  {log.nutritionNotes && (
                    <div className="text-xs">
                      <span className="text-[9px] text-muted-foreground block uppercase font-bold">Coach Nutrition Notes</span>
                      <p className="mt-1 text-muted-foreground leading-relaxed bg-muted/20 p-2 rounded-lg border">"{log.nutritionNotes}"</p>
                    </div>
                  )}

                  {log.prs && log.prs.length > 0 && (
                    <div className="text-xs pt-1">
                      <span className="text-[9px] text-muted-foreground block uppercase font-bold">PRs Registered</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {log.prs.map((pr: any, i: number) => (
                          <Badge key={i} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[9px] font-medium">
                            {pr.exercise}: {pr.weight} kg x {pr.reps} reps
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-8 text-center text-muted-foreground text-xs italic">
              No fitness logs recorded yet. Ask your coach to log your stats during your next session!
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
