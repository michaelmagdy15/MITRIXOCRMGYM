import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '../contexts/ThemeContext';
import { format, parseISO } from 'date-fns';
import { Activity, Award, Calendar, MessageSquare, TrendingUp, Apple, Dumbbell } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export default function MemberProgress({ client }: { client: Client | null }) {
  const { theme } = useTheme();
  const [performanceLogs, setPerformanceLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'clientPerformance'),
      where('clientId', '==', client.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort descending (newest first)
      list.sort((a: any, b: any) => b.date.localeCompare(a.date));
      setPerformanceLogs(list);
      setLoading(false);
    }, (err) => {
      console.error("Error loading performance logs:", err);
      setLoading(false);
    });

    return unsubscribe;
  }, [client?.id]);

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <p className="font-semibold text-lg">No member record found.</p>
        <p className="text-xs">Contact gym administration to link your account.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Chronologically sorted (oldest first) data for weight chart
  const weightChartData = [...performanceLogs]
    .filter(log => log.weight !== null && log.weight !== undefined && !isNaN(parseFloat(log.weight)))
    .map(log => ({
      date: format(parseISO(log.date), 'dd MMM'),
      dateFull: format(parseISO(log.date), 'dd MMM yyyy'),
      weight: parseFloat(log.weight)
    }))
    .reverse(); // Reverse so oldest is first for chronological chart

  // Extract all Personal Records (PRs)
  const prsMap = new Map<string, { weight: number; reps: number; date: string }>();
  performanceLogs.forEach(log => {
    if (log.prs && Array.isArray(log.prs)) {
      log.prs.forEach((pr: any) => {
        const key = pr.exercise.trim().toLowerCase();
        const weightVal = parseFloat(pr.weight);
        const repsVal = parseInt(pr.reps, 10);
        if (!isNaN(weightVal)) {
          const existing = prsMap.get(key);
          if (!existing || weightVal > existing.weight) {
            prsMap.set(key, { weight: weightVal, reps: repsVal || 0, date: log.date });
          }
        }
      });
    }
  });

  const prsList = Array.from(prsMap.entries()).map(([exercise, data]) => ({
    exercise: exercise.toUpperCase(),
    ...data
  })).sort((a, b) => a.exercise.localeCompare(b.exercise));

  // Chart configuration colors
  const strokeColor = theme === 'dark' ? '#f4f4f5' : '#09090b';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = theme === 'dark' ? '#a1a1aa' : '#71717a';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Fitness Progress
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Monitor your body weight trends, personal records, and training logs.
        </p>
      </div>

      {/* Weight History Chart */}
      <Card className="border bg-card/40 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Weight Progress
          </CardTitle>
          <CardDescription className="text-[11px]">
            Your weight logs over time. Ask your trainer to add new records.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {weightChartData.length > 0 ? (
            <div className="h-48 w-full -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke={textColor} 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke={textColor} 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(value) => `${value}kg`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', 
                      borderColor: theme === 'dark' ? '#27272a' : '#e4e4e7',
                      color: theme === 'dark' ? '#ffffff' : '#000000',
                      borderRadius: '8px',
                      fontSize: '11px'
                    }}
                    formatter={(value) => [`${value} kg`, 'Weight']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="weight" 
                    stroke={strokeColor} 
                    strokeWidth={2}
                    dot={{ stroke: strokeColor, strokeWidth: 2, r: 3, fill: theme === 'dark' ? '#09090b' : '#ffffff' }}
                    activeDot={{ r: 5, strokeWidth: 0, fill: strokeColor }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground italic">
              No weight data logged yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personal Records (PRs) */}
      <Card className="border bg-card/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" /> Personal Records (PRs)
          </CardTitle>
          <CardDescription className="text-[11px]">
            Your personal bests logged by trainers during sparring or lifts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prsList.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {prsList.map((pr, idx) => (
                <div 
                  key={idx} 
                  className="bg-card border rounded-xl p-3 flex flex-col justify-between hover:bg-card/75 transition-colors gap-2"
                >
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block truncate">
                    {pr.exercise}
                  </span>
                  <div>
                    <strong className="text-base font-extrabold text-foreground font-mono">
                      {pr.weight} <span className="text-xs font-normal text-zinc-400">kg</span>
                    </strong>
                    {pr.reps > 0 && (
                      <span className="text-[10px] text-muted-foreground font-medium block font-sans">
                        for {pr.reps} rep{pr.reps > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-zinc-500 font-mono">
                    {format(parseISO(pr.date), 'dd MMM yyyy')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground italic">
              No personal records logged yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coach Logs / Timeline */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Dumbbell className="h-4 w-4 text-primary" /> Coach Feedback Logs
        </h3>

        {performanceLogs.length > 0 ? (
          <div className="relative border-l border-zinc-200 dark:border-zinc-800 ml-2.5 pl-4 space-y-5">
            {performanceLogs.map((log) => (
              <div key={log.id} className="relative group">
                {/* Timeline Dot */}
                <div className="absolute -left-[22.5px] top-1.5 h-3 w-3 rounded-full bg-card border-2 border-primary group-hover:bg-primary transition-colors" />
                
                <Card className="border bg-card/30 group-hover:bg-card/50 transition-colors shadow-none">
                  <CardContent className="p-3.5 space-y-2.5">
                    <div className="flex justify-between items-center text-[10px] text-zinc-400">
                      <span className="font-bold text-zinc-950 dark:text-zinc-50">
                        Logged by Coach {log.coachName || 'Trainer'}
                      </span>
                      <span className="font-mono flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(log.date), 'dd MMM yyyy, h:mm a')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {log.weight && (
                        <div className="bg-card border p-2 rounded-lg">
                          <span className="text-[9px] text-muted-foreground block uppercase font-bold">Weight</span>
                          <strong className="text-xs font-bold text-foreground font-mono">{log.weight} kg</strong>
                        </div>
                      )}
                    </div>

                    {log.workoutNotes && (
                      <div className="text-xs">
                        <span className="text-[9px] text-muted-foreground block uppercase font-bold flex items-center gap-1">
                          <Dumbbell className="h-3 w-3 text-primary" /> Workout Notes
                        </span>
                        <p className="mt-1 text-muted-foreground leading-relaxed bg-card border p-2.5 rounded-lg italic">
                          "{log.workoutNotes}"
                        </p>
                      </div>
                    )}

                    {log.nutritionNotes && (
                      <div className="text-xs">
                        <span className="text-[9px] text-zinc-400 block uppercase font-bold flex items-center gap-1">
                          <Apple className="h-3 w-3 text-primary" /> Nutrition Advice
                        </span>
                        <p className="mt-1 text-muted-foreground leading-relaxed bg-card border p-2.5 rounded-lg italic">
                          "{log.nutritionNotes}"
                        </p>
                      </div>
                    )}

                    {log.prs && log.prs.length > 0 && (
                      <div className="text-xs">
                        <span className="text-[9px] text-zinc-400 block uppercase font-bold flex items-center gap-1">
                          <Award className="h-3 w-3 text-primary" /> Records Logged
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {log.prs.map((pr: any, i: number) => (
                            <Badge key={i} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[9px] font-mono">
                              {pr.exercise}: {pr.weight} kg x {pr.reps} reps
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-8 text-center text-muted-foreground text-xs italic">
              No training feedback logs recorded yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
