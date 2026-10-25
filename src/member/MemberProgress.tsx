import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTheme } from '../contexts/ThemeContext';
import { safeFormatDate } from '../utils/dateUtils';
import { Activity, Award, Calendar, TrendingUp, Apple, Dumbbell, Flame, CheckCircle2, Eye } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const CORE_MUSCLE_GROUPS = ['Calisthenics', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms & Core', 'Conditioning'] as const;

export default function MemberProgress({ client }: { client: Client | null }) {
  const { theme } = useTheme();
  const [performanceLogs, setPerformanceLogs] = useState<any[]>([]);
  const [bodyRecords, setBodyRecords] = useState<any[]>([]);
  const [assignedWorkouts, setAssignedWorkouts] = useState<any[]>([]);
  const [expandedExerciseDemo, setExpandedExerciseDemo] = useState<string | null>(null);
  const [completingWorkoutId, setCompletingWorkoutId] = useState<string | null>(null);
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

    const unsubscribePerf = onSnapshot(q, (snapshot) => {
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

    const bodyQ = query(
      collection(db, 'bodyRecords'),
      where('memberId', '==', client.id)
    );

    const unsubscribeBody = onSnapshot(bodyQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBodyRecords(list);
    }, (err) => {
      console.error("Error loading body records:", err);
    });

    const assignedQ = query(
      collection(db, 'assignedWorkouts'),
      where('clientId', '==', client.id)
    );

    const unsubscribeAssigned = onSnapshot(assignedQ, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      list.sort((a: any, b: any) =>
        String(b.scheduledDate || b.createdAt || '').localeCompare(String(a.scheduledDate || a.createdAt || ''))
      );
      setAssignedWorkouts(list);
    }, (err) => {
      console.warn("Error loading assigned workouts:", err);
    });

    return () => {
      unsubscribePerf();
      unsubscribeBody();
      unsubscribeAssigned();
    };
  }, [client?.id]);

  const handleMarkWorkoutCompleted = async (workoutId: string) => {
    setCompletingWorkoutId(workoutId);
    try {
      await updateDoc(doc(db, 'assignedWorkouts', workoutId), {
        status: 'Completed',
        completedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Failed to mark workout completed:", err);
    } finally {
      setCompletingWorkoutId(null);
    }
  };

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

  // Chronologically sorted (oldest first) unified data for weight chart
  const mergedWeightEntries = [
    ...performanceLogs
      .filter(log => log.weight !== null && log.weight !== undefined && !isNaN(parseFloat(log.weight)))
      .map(log => ({ rawDate: String(log.date || ''), weight: parseFloat(log.weight) })),
    ...bodyRecords
      .filter(rec => rec.weight !== null && rec.weight !== undefined && !isNaN(parseFloat(rec.weight)))
      .map(rec => ({ rawDate: String(rec.date || ''), weight: parseFloat(rec.weight) }))
  ].sort((a, b) => a.rawDate.localeCompare(b.rawDate));

  // Deduplicate entries logged at the same minute/day with identical weight
  const uniqueWeightEntries = mergedWeightEntries.filter((entry, idx, arr) => {
    if (idx === 0) return true;
    const prev = arr[idx - 1]!;
    return !(prev.rawDate.slice(0, 16) === entry.rawDate.slice(0, 16) && prev.weight === entry.weight);
  });

  const weightChartData = uniqueWeightEntries.map(entry => ({
    date: safeFormatDate(entry.rawDate, 'dd MMM'),
    dateFull: safeFormatDate(entry.rawDate, 'dd MMM yyyy'),
    weight: entry.weight
  }));

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

  // 7-Day Muscle Group Stimulus & Recovery Status (inspect last 14 days of performanceLogs)
  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const muscleMap = CORE_MUSCLE_GROUPS.map((group) => {
    let sets7d = 0;
    let volume7d = 0;
    let lastTrainedMs: number | null = null;

    performanceLogs.forEach((log) => {
      if (!log.date || !Array.isArray(log.exercises)) return;
      const logTime = new Date(log.date).getTime();
      if (isNaN(logTime)) return;
      const ageMs = nowMs - logTime;
      if (ageMs < 0 || ageMs > fourteenDaysMs) return;

      log.exercises.forEach((ex: { name?: string; category?: string; sets?: { weightKg?: number; reps?: number }[] }) => {
        const cat = CORE_MUSCLE_GROUPS.includes(ex.category as any) ? ex.category : 'Conditioning';
        if (cat !== group) return;
        const exSets = Array.isArray(ex.sets) ? ex.sets : [];
        if (exSets.length === 0) return;

        if (lastTrainedMs === null || logTime > lastTrainedMs) {
          lastTrainedMs = logTime;
        }

        if (ageMs <= sevenDaysMs) {
          sets7d += exSets.length;
          exSets.forEach((s) => {
            volume7d += (Number(s.weightKg) || 0) * (Number(s.reps) || 0);
          });
        }
      });
    });

    const hoursSince = lastTrainedMs !== null ? Math.max(0, Math.round((nowMs - lastTrainedMs) / (1000 * 60 * 60))) : null;

    let status: 'Fatigued / Recovering' | 'Fresh / Prime' | 'Detrained / Ready' = 'Detrained / Ready';
    let badgeClass = 'bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30';
    if (hoursSince !== null && hoursSince < 48) {
      status = 'Fatigued / Recovering';
      badgeClass = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    } else if (hoursSince !== null && hoursSince <= 168) {
      status = 'Fresh / Prime';
      badgeClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    }

    const relativeTime =
      hoursSince === null
        ? 'No recent sessions'
        : hoursSince < 1
        ? 'Just now'
        : hoursSince < 48
        ? `${hoursSince}h ago`
        : `${Math.floor(hoursSince / 24)}d ago`;

    return {
      group,
      sets7d,
      volume7d: Math.round(volume7d),
      hoursSince,
      relativeTime,
      status,
      badgeClass
    };
  });

  // Chart configuration colors
  const strokeColor = theme === 'dark' ? '#f4f4f5' : '#09090b';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = theme === 'dark' ? '#a1a1aa' : '#71717a';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Workouts & Fitness Progress
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          View your coach-assigned workout programs, personal records, and training logs.
        </p>
      </div>

      {/* Assigned Workouts from Coach */}
      <Card className="border border-primary/30 bg-card/60 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-primary" /> Your Assigned Workouts
              </CardTitle>
              <CardDescription className="text-[11px]">
                Workout templates and exercise plans assigned to you by your coach.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold border-primary/30 text-primary">
              {assignedWorkouts.filter(w => w.status !== 'Completed').length} Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignedWorkouts.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground italic">
              No workouts assigned yet. Your coach can assign custom Gym or Calisthenics templates to your profile.
            </div>
          ) : (
            assignedWorkouts.map((workout) => {
              const isCompleted = workout.status === 'Completed';
              return (
                <div
                  key={workout.id}
                  className={`rounded-2xl border p-3.5 space-y-3 transition-all ${
                    isCompleted
                      ? 'bg-emerald-500/5 border-emerald-500/30'
                      : 'bg-background border-border/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-foreground">{workout.title || 'Assigned Workout'}</h3>
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-bold ${
                            isCompleted
                              ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                              : 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                          }`}
                        >
                          {isCompleted ? 'Completed' : 'Upcoming Workout'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Coach {workout.coachName || 'Trainer'} • Scheduled: <span className="font-mono font-semibold text-foreground">{safeFormatDate(workout.scheduledDate || workout.createdAt, 'dd MMM yyyy')}</span>
                      </p>
                    </div>

                    {!isCompleted && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkWorkoutCompleted(workout.id)}
                        disabled={completingWorkoutId === workout.id}
                        className="h-7 px-2.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1 shrink-0"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {completingWorkoutId === workout.id ? 'Saving...' : 'Mark Done'}
                      </Button>
                    )}
                  </div>

                  {workout.coachNotes && (
                    <div className="text-xs bg-muted/40 border rounded-xl p-2.5 text-muted-foreground italic">
                      <strong className="text-foreground not-italic">Coach Notes:</strong> {workout.coachNotes}
                    </div>
                  )}

                  <div className="divide-y border rounded-xl overflow-hidden bg-card/50">
                    {(workout.exercises || []).map((ex: any, idx: number) => {
                      const demoKey = `${workout.id}_${idx}`;
                      const isExpanded = expandedExerciseDemo === demoKey;
                      const hasDemo = Boolean(ex.gifUrl || (Array.isArray(ex.instructions) && ex.instructions.length > 0));
                      return (
                        <div key={idx} className="p-2.5 text-xs space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-5 w-5 rounded-md bg-primary/10 text-primary font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-foreground truncate">{ex.name}</p>
                                <span className="text-[10px] text-muted-foreground">
                                  {ex.category} {ex.equipment ? `• ${ex.equipment}` : ''}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant="outline" className="font-mono text-[10px] font-bold bg-primary/5 border-primary/20 text-foreground">
                                {ex.targetSets || 3} × {ex.targetReps || 10}
                                {Number(ex.targetWeightKg) > 0 ? ` @ ${ex.targetWeightKg}kg` : ' (BW)'}
                              </Badge>
                              {hasDemo && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedExerciseDemo(isExpanded ? null : demoKey)}
                                  className="px-2 py-1 rounded-lg border text-[10px] font-bold hover:bg-muted flex items-center gap-1 text-primary"
                                >
                                  <Eye className="h-3 w-3" /> {isExpanded ? 'Hide' : 'Demo'}
                                </button>
                              )}
                            </div>
                          </div>

                          {isExpanded && hasDemo && (
                            <div className="p-2.5 rounded-xl bg-muted/40 border flex flex-col sm:flex-row gap-3 items-start">
                              {ex.gifUrl && (
                                <img
                                  src={ex.gifUrl}
                                  alt={ex.name}
                                  loading="lazy"
                                  className="w-28 h-28 rounded-xl object-cover border bg-white shrink-0"
                                />
                              )}
                              {Array.isArray(ex.instructions) && ex.instructions.length > 0 && (
                                <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground">
                                  {ex.instructions.map((step: string, sIdx: number) => (
                                    <li key={sIdx} className="leading-relaxed">{step}</li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

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

      {/* Muscle Recovery & Weekly Stimulus Map */}
      <Card className="border bg-card/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" /> Muscle Recovery & Weekly Stimulus Map
          </CardTitle>
          <CardDescription className="text-[11px]">
            7-day set & volume stimulus with recovery readiness across core muscle zones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {muscleMap.map((m) => {
              const barPct = Math.min(100, Math.round((m.sets7d / 12) * 100));
              return (
                <div
                  key={m.group}
                  className="bg-card border rounded-xl p-3 flex flex-col justify-between gap-2 hover:bg-card/75 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground truncate">{m.group}</span>
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-bold shrink-0 ${m.badgeClass}`}>
                      {m.status}
                    </Badge>
                  </div>

                  <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-300"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                    <span>
                      <strong className="text-foreground">{m.sets7d}</strong> sets •{' '}
                      <strong className="text-foreground">{m.volume7d.toLocaleString()}</strong> kg
                    </span>
                    <span>{m.relativeTime}</span>
                  </div>
                </div>
              );
            })}
          </div>
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
                    {pr.reps > 1 && (
                      <Badge variant="outline" className="mt-1.5 text-[9px] font-mono bg-primary/5 text-primary border-primary/20 px-1.5 py-0">
                        Est. 1RM: {Math.round(pr.weight * (1 + (pr.reps || 1) / 30))} kg
                      </Badge>
                    )}
                  </div>
                  <span className="text-[9px] text-zinc-500 font-mono">
                    {safeFormatDate(pr.date, 'dd MMM yyyy')}
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
                        {safeFormatDate(log.date, 'dd MMM yyyy, h:mm a')}
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
