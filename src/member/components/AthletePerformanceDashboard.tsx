import React, { useState, useMemo, useEffect } from 'react';
import { Client } from '../../types';
import { db } from '../../firebase';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import {
  FULL_EXERCISE_CATALOG,
  ExerciseCatalogItem,
  ExerciseCategory,
} from '../../data/exerciseLibraryData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTheme } from '../../contexts/ThemeContext';
import { safeFormatDate } from '../../utils/dateUtils';
import {
  Activity,
  Award,
  BarChart3,
  Check,
  CheckCircle2,
  Dumbbell,
  Flame,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  User,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { toast } from 'sonner';

export interface LoggedSetEntry {
  setNumber: number;
  type: 'Working' | 'Warmup' | 'Drop' | 'Failure';
  weightKg: number;
  reps: number;
  rpe?: number;
  completed: boolean;
  isPR?: boolean;
}

export interface LoggedExerciseEntry {
  id: string;
  name: string;
  category: string;
  equipment?: string;
  targetSets?: number;
  targetReps?: number;
  targetWeightKg?: number;
  sets: LoggedSetEntry[];
}

export interface AthletePerformanceDashboardProps {
  client: Client;
  assignedWorkouts?: any[];
  performanceLogs?: any[];
  bodyweightKg?: number;
  isCoachView?: boolean;
  initialLogWorkout?: any | null;
  onCloseInitialLog?: () => void;
}

const CATALOG_BY_NAME = new Map<string, ExerciseCatalogItem>();
for (const ex of FULL_EXERCISE_CATALOG) {
  CATALOG_BY_NAME.set(ex.name.toLowerCase(), ex);
}

export function calculateEpley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weightKg * 10) / 10;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

interface BenchmarkLift {
  key: string;
  label: string;
  category: string;
  aliases: string[];
  standards: {
    rookie: number; // x Bodyweight
    intermediate: number;
    advanced: number;
    elite: number;
  };
}

const ATHLETE_BENCHMARK_LIFTS: BenchmarkLift[] = [
  {
    key: 'squat',
    label: 'Squat (1RM)',
    category: 'Lower Body Force',
    aliases: ['barbell full squat', 'barbell squat', 'back squat', 'squat', 'front squat', 'hack squat'],
    standards: { rookie: 0.8, intermediate: 1.25, advanced: 1.75, elite: 2.25 },
  },
  {
    key: 'bench',
    label: 'Bench Press (1RM)',
    category: 'Upper Push Power',
    aliases: ['barbell bench press', 'bench press', 'dumbbell bench press', 'incline bench press', 'chest press'],
    standards: { rookie: 0.6, intermediate: 1.0, advanced: 1.35, elite: 1.75 },
  },
  {
    key: 'deadlift',
    label: 'Deadlift (1RM)',
    category: 'Posterior Chain',
    aliases: ['barbell deadlift', 'deadlift', 'sumo deadlift', 'romanian deadlift', 'barbell romanian deadlift', 'trap bar deadlift'],
    standards: { rookie: 1.0, intermediate: 1.5, advanced: 2.0, elite: 2.5 },
  },
  {
    key: 'ohp',
    label: 'Overhead Press (1RM)',
    category: 'Vertical Push',
    aliases: ['barbell seated overhead press', 'overhead press', 'military press', 'dumbbell shoulder press', 'shoulder press'],
    standards: { rookie: 0.4, intermediate: 0.65, advanced: 0.9, elite: 1.15 },
  },
  {
    key: 'pull',
    label: 'Vertical Pull / Row',
    category: 'Upper Pull Strength',
    aliases: ['pull-up', 'pull up', 'chin-up', 'cable pulldown', 'lat pulldown', 'barbell bent over row', 'cable seated row', 'muscle up'],
    standards: { rookie: 0.5, intermediate: 0.85, advanced: 1.2, elite: 1.55 },
  },
];

export default function AthletePerformanceDashboard({
  client,
  assignedWorkouts: propAssignedWorkouts,
  performanceLogs: propPerformanceLogs,
  bodyweightKg: propBodyweightKg,
  isCoachView = false,
  initialLogWorkout = null,
  onCloseInitialLog,
}: AthletePerformanceDashboardProps) {
  const { theme } = useTheme();

  // All hooks declared at top to avoid TDZ
  const [livePerfLogs, setLivePerfLogs] = useState<any[]>([]);
  const [liveAssignedWorkouts, setLiveAssignedWorkouts] = useState<any[]>([]);
  const [selectedLiftForCurve, setSelectedLiftForCurve] = useState<string>('');
  const [curveMetric, setCurveMetric] = useState<'est1RM' | 'maxWeight' | 'volume'>('est1RM');

  // Logger Modal State
  const [loggerOpen, setLoggerOpen] = useState(false);
  const [activeAssignedWorkout, setActiveAssignedWorkout] = useState<any | null>(null);
  const [workoutTitle, setWorkoutTitle] = useState('Personal Training Session');
  const [coachNameInput, setCoachNameInput] = useState(client.assignedCoachName || (client as any).coachName || 'Personal Trainer');
  const [loggedExercises, setLoggedExercises] = useState<LoggedExerciseEntry[]>([]);
  const [sessionRpe, setSessionRpe] = useState<number>(8);
  const [clientBodyweightInput, setClientBodyweightInput] = useState<string>('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);

  // Exercise Picker inside Logger Modal
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState<'All' | ExerciseCategory>('All');
  const [customExerciseName, setCustomExerciseName] = useState('');

  // Subscribe to performance logs if not passed by parent
  useEffect(() => {
    if (propPerformanceLogs) return;
    if (!client?.id) return;
    const q = query(collection(db, 'clientPerformance'), where('clientId', '==', client.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));
        setLivePerfLogs(list);
      },
      (err) => console.warn('AthletePerformanceDashboard perf listener error:', err)
    );
    return () => unsub();
  }, [client?.id, propPerformanceLogs]);

  // Subscribe to assigned workouts if not passed by parent
  useEffect(() => {
    if (propAssignedWorkouts) return;
    if (!client?.id) return;
    const q = query(collection(db, 'assignedWorkouts'), where('clientId', '==', client.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) =>
          String(b.scheduledDate || b.createdAt || '').localeCompare(String(a.scheduledDate || a.createdAt || ''))
        );
        setLiveAssignedWorkouts(list);
      },
      (err) => console.warn('AthletePerformanceDashboard assignedWorkouts listener error:', err)
    );
    return () => unsub();
  }, [client?.id, propAssignedWorkouts]);

  const performanceLogs = propPerformanceLogs ?? livePerfLogs;
  const assignedWorkouts = propAssignedWorkouts ?? liveAssignedWorkouts;

  // Historical PRs map (exercise name lowercased -> best weight, reps, 1RM)
  const historicalPrMap = useMemo(() => {
    const map = new Map<string, { weight: number; reps: number; est1RM: number; date: string }>();
    performanceLogs.forEach((log) => {
      const logDate = String(log.date || '');
      if (Array.isArray(log.exercises)) {
        log.exercises.forEach((ex: any) => {
          const key = String(ex.name || '').trim().toLowerCase();
          if (!key) return;
          const sets = Array.isArray(ex.sets) ? ex.sets : [];
          sets.forEach((s: any) => {
            const w = Number(s.weightKg) || 0;
            const r = Number(s.reps) || 0;
            if (w <= 0 && r <= 0) return;
            const rm = calculateEpley1RM(w, r);
            const curr = map.get(key);
            if (!curr || rm > curr.est1RM || (rm === curr.est1RM && w > curr.weight)) {
              map.set(key, { weight: w, reps: r, est1RM: rm, date: logDate });
            }
          });
        });
      }
      if (Array.isArray(log.prs)) {
        log.prs.forEach((pr: any) => {
          const key = String(pr.exercise || '').trim().toLowerCase();
          const w = Number(pr.weight) || 0;
          const r = Number(pr.reps) || 1;
          if (!key || w <= 0) return;
          const rm = calculateEpley1RM(w, r);
          const curr = map.get(key);
          if (!curr || rm > curr.est1RM || w > curr.weight) {
            map.set(key, { weight: w, reps: r, est1RM: rm, date: logDate });
          }
        });
      }
    });
    return map;
  }, [performanceLogs]);

  // Open Logger for an Assigned Workout or Blank Session
  const openWorkoutLogger = (workout?: any | null) => {
    if (workout) {
      setActiveAssignedWorkout(workout);
      setWorkoutTitle(workout.title || 'Assigned PT Workout');
      setCoachNameInput(workout.coachName || client.assignedCoachName || 'Personal Trainer');
      const sourceExercises = Array.isArray(workout.loggedExercises) && workout.loggedExercises.length > 0
        ? workout.loggedExercises
        : Array.isArray(workout.exercises)
          ? workout.exercises
          : [];

      const mapped: LoggedExerciseEntry[] = sourceExercises.map((ex: any, idx: number) => {
        const key = String(ex.name || '').trim().toLowerCase();
        const prev = historicalPrMap.get(key);
        const targetSets = Math.max(1, Number(ex.targetSets) || (Array.isArray(ex.sets) ? ex.sets.length : 3));
        const targetReps = Math.max(1, Number(ex.targetReps) || 10);
        const defaultWeight =
          Number(ex.targetWeightKg) > 0
            ? Number(ex.targetWeightKg)
            : prev?.weight || 0;

        const sets: LoggedSetEntry[] =
          Array.isArray(ex.sets) && ex.sets.length > 0
            ? ex.sets.map((s: any, sIdx: number) => ({
                setNumber: sIdx + 1,
                type: s.type || 'Working',
                weightKg: Number(s.weightKg) || 0,
                reps: Number(s.reps) || targetReps,
                rpe: Number(s.rpe) || 8,
                completed: Boolean(s.completed ?? true),
              }))
            : Array.from({ length: targetSets }, (_, sIdx) => ({
                setNumber: sIdx + 1,
                type: 'Working',
                weightKg: defaultWeight,
                reps: targetReps,
                rpe: 8,
                completed: true,
              }));

        return {
          id: `log_ex_${Date.now()}_${idx}`,
          name: ex.name || `Exercise ${idx + 1}`,
          category: ex.category || 'Strength',
          equipment: ex.equipment || 'Barbell',
          targetSets,
          targetReps,
          targetWeightKg: defaultWeight,
          sets,
        };
      });
      setLoggedExercises(mapped);
      setSessionNotes(workout.clientNotes || '');
    } else {
      setActiveAssignedWorkout(null);
      setWorkoutTitle('Personal Training Session');
      setCoachNameInput(client.assignedCoachName || (client as any).coachName || 'Personal Trainer');
      setLoggedExercises([
        {
          id: `log_ex_${Date.now()}_0`,
          name: 'Barbell Full Squat',
          category: 'Legs',
          equipment: 'Barbell',
          sets: [
            { setNumber: 1, type: 'Working', weightKg: historicalPrMap.get('barbell full squat')?.weight || 60, reps: 8, rpe: 8, completed: true },
            { setNumber: 2, type: 'Working', weightKg: historicalPrMap.get('barbell full squat')?.weight || 60, reps: 8, rpe: 8, completed: true },
            { setNumber: 3, type: 'Working', weightKg: historicalPrMap.get('barbell full squat')?.weight || 60, reps: 8, rpe: 8, completed: true },
          ],
        },
      ]);
      setSessionNotes('');
    }
    setLoggerOpen(true);
  };

  // Trigger initialLogWorkout if passed from parent
  useEffect(() => {
    if (initialLogWorkout) {
      openWorkoutLogger(initialLogWorkout);
    }
  }, [initialLogWorkout]);

  // Derived Bodyweight
  const effectiveBodyweight = useMemo(() => {
    if (propBodyweightKg && propBodyweightKg > 25) return propBodyweightKg;
    for (const log of performanceLogs) {
      const w = parseFloat(log.weight);
      if (!isNaN(w) && w > 25) return w;
    }
    const clientW = parseFloat((client as any).weight || '');
    if (!isNaN(clientW) && clientW > 25) return clientW;
    return 75; // Default athletic reference bodyweight (75 kg)
  }, [propBodyweightKg, performanceLogs, client]);

  // Extract per-exercise chronological history for 1RM & Volume progression curves
  const exerciseHistoryMap = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        category: string;
        sessions: {
          date: string;
          label: string;
          maxWeight: number;
          maxReps: number;
          est1RM: number;
          volume: number;
          setsCount: number;
          loggedBy: string;
        }[];
      }
    >();

    // Chronological order (oldest -> newest)
    const chronological = [...performanceLogs].sort((a, b) =>
      String(a.date || '').localeCompare(String(b.date || ''))
    );

    chronological.forEach((log) => {
      const rawDate = String(log.date || new Date().toISOString());
      const dateLabel = safeFormatDate(rawDate, 'dd MMM');
      const loggedBy = log.loggedBy || (log.coachName ? `Coach ${log.coachName}` : 'Client');

      if (Array.isArray(log.exercises)) {
        log.exercises.forEach((ex: any) => {
          const exName = String(ex.name || '').trim();
          if (!exName) return;
          const key = exName.toLowerCase();
          const sets = Array.isArray(ex.sets) ? ex.sets : [];
          if (sets.length === 0) return;

          let maxW = 0;
          let maxR = 0;
          let best1RM = 0;
          let vol = 0;

          sets.forEach((s: any) => {
            const w = Number(s.weightKg) || 0;
            const r = Number(s.reps) || 0;
            vol += w * r;
            if (w > maxW) maxW = w;
            if (r > maxR) maxR = r;
            const rm = calculateEpley1RM(w, r);
            if (rm > best1RM) best1RM = rm;
          });

          if (!map.has(key)) {
            map.set(key, {
              name: exName,
              category: ex.category || 'Strength',
              sessions: [],
            });
          }
          map.get(key)!.sessions.push({
            date: rawDate,
            label: dateLabel,
            maxWeight: maxW,
            maxReps: maxR,
            est1RM: best1RM,
            volume: Math.round(vol),
            setsCount: sets.length,
            loggedBy,
          });
        });
      }

      // Also support legacy PR entries if no exercises array was logged
      if ((!Array.isArray(log.exercises) || log.exercises.length === 0) && Array.isArray(log.prs)) {
        log.prs.forEach((pr: any) => {
          const exName = String(pr.exercise || '').trim();
          if (!exName) return;
          const key = exName.toLowerCase();
          const w = Number(pr.weight) || 0;
          const r = Number(pr.reps) || 1;
          const rm = calculateEpley1RM(w, r);
          if (!map.has(key)) {
            map.set(key, { name: exName, category: 'Strength', sessions: [] });
          }
          map.get(key)!.sessions.push({
            date: rawDate,
            label: dateLabel,
            maxWeight: w,
            maxReps: r,
            est1RM: rm,
            volume: Math.round(w * r),
            setsCount: 1,
            loggedBy,
          });
        });
      }
    });

    return map;
  }, [performanceLogs]);

  const trackedExercisesList = useMemo(() => {
    return Array.from(exerciseHistoryMap.entries())
      .map(([key, val]) => ({
        key,
        name: val.name,
        category: val.category,
        sessionsCount: val.sessions.length,
        latest1RM: val.sessions[val.sessions.length - 1]?.est1RM || 0,
        best1RM: Math.max(0, ...val.sessions.map((s) => s.est1RM)),
        sessions: val.sessions,
      }))
      .sort((a, b) => b.sessionsCount - a.sessionsCount || b.best1RM - a.best1RM);
  }, [exerciseHistoryMap]);

  // Select top tracked lift automatically
  useEffect(() => {
    if (!selectedLiftForCurve && trackedExercisesList.length > 0) {
      setSelectedLiftForCurve(trackedExercisesList[0]!.key);
    }
  }, [trackedExercisesList, selectedLiftForCurve]);

  // Compute Benchmark Strength Standards & Relative Strength Tiers
  const benchmarkResults = useMemo(() => {
    return ATHLETE_BENCHMARK_LIFTS.map((bench) => {
      let best1RM = 0;
      let bestWeight = 0;
      let bestReps = 0;
      let matchedName = bench.label;

      for (const [exKey, data] of historicalPrMap.entries()) {
        const isMatch = bench.aliases.some((alias) => exKey.includes(alias));
        if (isMatch && data.est1RM > best1RM) {
          best1RM = data.est1RM;
          bestWeight = data.weight;
          bestReps = data.reps;
          const histName = exerciseHistoryMap.get(exKey)?.name;
          if (histName) matchedName = histName;
        }
      }

      const ratio = effectiveBodyweight > 0 ? Math.round((best1RM / effectiveBodyweight) * 100) / 100 : 0;
      let tier: 'Unranked' | 'Rookie' | 'Intermediate' | 'Advanced' | 'Elite Athlete' = 'Unranked';
      let tierColor = 'text-zinc-400 border-zinc-500/30 bg-zinc-500/10';
      let progressPct = 0;

      if (best1RM > 0) {
        if (ratio >= bench.standards.elite) {
          tier = 'Elite Athlete';
          tierColor = 'text-amber-500 border-amber-500/40 bg-amber-500/15';
          progressPct = 100;
        } else if (ratio >= bench.standards.advanced) {
          tier = 'Advanced';
          tierColor = 'text-purple-500 border-purple-500/40 bg-purple-500/15';
          progressPct = Math.min(98, Math.round((ratio / bench.standards.elite) * 100));
        } else if (ratio >= bench.standards.intermediate) {
          tier = 'Intermediate';
          tierColor = 'text-emerald-500 border-emerald-500/40 bg-emerald-500/15';
          progressPct = Math.round((ratio / bench.standards.elite) * 100);
        } else {
          tier = 'Rookie';
          tierColor = 'text-sky-500 border-sky-500/40 bg-sky-500/15';
          progressPct = Math.max(15, Math.round((ratio / bench.standards.elite) * 100));
        }
      }

      return {
        ...bench,
        matchedName,
        best1RM,
        bestWeight,
        bestReps,
        ratio,
        tier,
        tierColor,
        progressPct,
        eliteTargetKg: Math.round(bench.standards.elite * effectiveBodyweight),
      };
    });
  }, [historicalPrMap, exerciseHistoryMap, effectiveBodyweight]);

  // 6-Axis Athletic Ability Radar Data (0 - 100 scale)
  const athleteRadarData = useMemo(() => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    let sessions30d = 0;
    let totalVolumeAll = 0;
    let totalSetsAll = 0;
    let heavySetsCount = 0; // <= 5 reps
    let hypertrophySetsCount = 0; // 6-12 reps
    let enduranceSetsCount = 0; // >= 12 reps
    let calisthenicsAndPowerSets = 0;

    performanceLogs.forEach((log) => {
      const t = new Date(log.date || '').getTime();
      if (!isNaN(t) && now - t <= thirtyDaysMs) {
        sessions30d += 1;
      }
      totalVolumeAll += Number(log.totalVolumeKg) || 0;
      totalSetsAll += Number(log.totalSets) || 0;

      if (Array.isArray(log.exercises)) {
        log.exercises.forEach((ex: any) => {
          const cat = String(ex.category || '').toLowerCase();
          const sets = Array.isArray(ex.sets) ? ex.sets : [];
          sets.forEach((s: any) => {
            const r = Number(s.reps) || 0;
            const w = Number(s.weightKg) || 0;
            if (r > 0 && r <= 5 && w > 0) heavySetsCount += 1;
            if (r >= 6 && r <= 12) hypertrophySetsCount += 1;
            if (r >= 12) enduranceSetsCount += 1;
            if (cat.includes('calisthenics') || cat.includes('conditioning') || r <= 5) {
              calisthenicsAndPowerSets += 1;
            }
          });
        });
      }
    });

    // Relative strength score from benchmarks
    const avgProgress =
      benchmarkResults.reduce((acc, b) => acc + b.progressPct, 0) / Math.max(1, benchmarkResults.length);

    const maxStrengthScore = Math.min(
      100,
      Math.round(Math.max(avgProgress, Math.min(100, heavySetsCount * 5 + (historicalPrMap.size > 0 ? 35 : 15))))
    );
    const hypertrophyScore = Math.min(
      100,
      Math.round(Math.min(70, hypertrophySetsCount * 2.5) + Math.min(30, totalVolumeAll / 1500))
    );
    const enduranceScore = Math.min(
      100,
      Math.round(Math.min(75, enduranceSetsCount * 4) + (sessions30d > 0 ? 25 : 10))
    );
    const powerScore = Math.min(
      100,
      Math.round(Math.max(avgProgress * 0.85, Math.min(100, calisthenicsAndPowerSets * 4 + 20)))
    );
    const workCapacityScore = Math.min(
      100,
      Math.round(Math.min(100, (totalSetsAll / Math.max(1, performanceLogs.length)) * 5.5))
    );
    // 12 sessions in 30 days (3x/week) = 100% consistency
    const consistencyScore = Math.min(100, Math.round((sessions30d / 12) * 100));

    return [
      { ability: 'Max Strength', score: maxStrengthScore || 20, fullMark: 100 },
      { ability: 'Hypertrophy', score: hypertrophyScore || 20, fullMark: 100 },
      { ability: 'Endurance', score: enduranceScore || 20, fullMark: 100 },
      { ability: 'Explosiveness', score: powerScore || 20, fullMark: 100 },
      { ability: 'Work Capacity', score: workCapacityScore || 20, fullMark: 100 },
      { ability: 'Consistency', score: consistencyScore || 15, fullMark: 100 },
    ];
  }, [performanceLogs, benchmarkResults, historicalPrMap.size]);

  const overallAthleteScore = useMemo(() => {
    const sum = athleteRadarData.reduce((acc, item) => acc + item.score, 0);
    return Math.round(sum / athleteRadarData.length);
  }, [athleteRadarData]);

  // Weekly Tonnage & Session Volume Chart Data (last 8 sessions)
  const sessionVolumeChartData = useMemo(() => {
    const chronological = [...performanceLogs]
      .filter((l) => Number(l.totalVolumeKg) > 0 || (Array.isArray(l.exercises) && l.exercises.length > 0))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      .slice(-10);

    return chronological.map((log) => {
      let vol = Number(log.totalVolumeKg) || 0;
      let sets = Number(log.totalSets) || 0;
      if (vol === 0 && Array.isArray(log.exercises)) {
        log.exercises.forEach((ex: any) => {
          (ex.sets || []).forEach((s: any) => {
            vol += (Number(s.weightKg) || 0) * (Number(s.reps) || 0);
            sets += 1;
          });
        });
      }
      return {
        date: safeFormatDate(log.date, 'dd MMM'),
        volumeKg: Math.round(vol),
        sets,
        rpe: Number(log.overallRpe) || 8,
        loggedBy: log.loggedBy === 'client' ? 'Self-Logged' : `Coach ${log.coachName || ''}`,
      };
    });
  }, [performanceLogs]);

  // Filtered Catalog for Modal Exercise Picker
  const pickerExercises = useMemo(() => {
    const q = exerciseSearch.trim().toLowerCase();
    return FULL_EXERCISE_CATALOG.filter((ex) => {
      if (pickerCategory !== 'All' && ex.category !== pickerCategory) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        (ex.target && ex.target.toLowerCase().includes(q)) ||
        ex.equipment.toLowerCase().includes(q)
      );
    }).slice(0, 30);
  }, [exerciseSearch, pickerCategory]);

  // Logger Handlers
  const handleAddExerciseToLogger = (name: string, category: string, equipment = 'Barbell') => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const prev = historicalPrMap.get(trimmed.toLowerCase());
    const defaultWeight = prev ? prev.weight : equipment === 'Bodyweight' || category === 'Calisthenics' ? 0 : 20;
    const defaultReps = prev ? prev.reps : 10;

    setLoggedExercises((prevList) => [
      ...prevList,
      {
        id: `log_ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        category,
        equipment,
        sets: [
          { setNumber: 1, type: 'Working', weightKg: defaultWeight, reps: defaultReps, rpe: 8, completed: true },
          { setNumber: 2, type: 'Working', weightKg: defaultWeight, reps: defaultReps, rpe: 8, completed: true },
          { setNumber: 3, type: 'Working', weightKg: defaultWeight, reps: defaultReps, rpe: 8, completed: true },
        ],
      },
    ]);
    setCustomExerciseName('');
    toast.success(`Added ${trimmed}`);
  };

  const handleAddSetToLoggedExercise = (exId: string) => {
    setLoggedExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              setNumber: ex.sets.length + 1,
              type: 'Working',
              weightKg: last ? last.weightKg : 0,
              reps: last ? last.reps : 10,
              rpe: last?.rpe || 8,
              completed: true,
            },
          ],
        };
      })
    );
  };

  const handleUpdateLoggedSet = (
    exId: string,
    setIdx: number,
    field: keyof LoggedSetEntry,
    value: number | boolean | string
  ) => {
    setLoggedExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, i) => (i === setIdx ? { ...s, [field]: value } : s)),
        };
      })
    );
  };

  const handleRemoveLoggedSet = (exId: string, setIdx: number) => {
    setLoggedExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId || ex.sets.length <= 1) return ex;
        const nextSets = ex.sets
          .filter((_, i) => i !== setIdx)
          .map((s, idx) => ({ ...s, setNumber: idx + 1 }));
        return { ...ex, sets: nextSets };
      })
    );
  };

  const handleRemoveLoggedExercise = (exId: string) => {
    setLoggedExercises((prev) => prev.filter((ex) => ex.id !== exId));
  };

  const handleSaveLoggedWorkout = async () => {
    if (!client?.id) return;
    if (loggedExercises.length === 0) {
      toast.error('Add at least one exercise to log your performance');
      return;
    }

    setIsSavingWorkout(true);
    try {
      let totalVolumeKg = 0;
      let totalSets = 0;
      let totalReps = 0;
      const newPrs: { exercise: string; weight: number; reps: number; est1RM: number }[] = [];

      const sanitizedExercises = loggedExercises.map((ex) => {
        const completedSets = ex.sets.filter((s) => s.completed);
        const setsToSave = completedSets.length > 0 ? completedSets : ex.sets;
        const exKey = ex.name.trim().toLowerCase();
        const prevBest = historicalPrMap.get(exKey);
        let bestSessionWeight = 0;
        let bestSessionReps = 0;
        let bestSession1RM = 0;

        setsToSave.forEach((s) => {
          const w = Number(s.weightKg) || 0;
          const r = Number(s.reps) || 0;
          totalVolumeKg += w * r;
          totalSets += 1;
          totalReps += r;
          const rm = calculateEpley1RM(w, r);
          if (rm > bestSession1RM) {
            bestSession1RM = rm;
            bestSessionWeight = w;
            bestSessionReps = r;
          }
        });

        if (bestSessionWeight > 0 && (!prevBest || bestSession1RM > prevBest.est1RM || bestSessionWeight > prevBest.weight)) {
          newPrs.push({
            exercise: ex.name.trim(),
            weight: bestSessionWeight,
            reps: bestSessionReps,
            est1RM: bestSession1RM,
          });
        }

        return {
          name: ex.name.trim(),
          category: ex.category || 'Strength',
          equipment: ex.equipment || 'Barbell',
          sets: setsToSave.map((s, idx) => ({
            setNumber: idx + 1,
            type: s.type || 'Working',
            weightKg: Number(s.weightKg) || 0,
            reps: Number(s.reps) || 0,
            rpe: Number(s.rpe) || sessionRpe,
            completed: true,
          })),
        };
      });

      const nowIso = new Date().toISOString();
      const bwVal = parseFloat(clientBodyweightInput);

      const perfPayload: Record<string, any> = {
        clientId: client.id,
        clientName: client.name || 'Member',
        coachId: activeAssignedWorkout?.coachId || (client as any).assignedCoachId || '',
        coachName: coachNameInput.trim() || 'Personal Trainer',
        workoutTitle: workoutTitle.trim() || 'PT Session',
        loggedBy: isCoachView ? 'coach' : 'client',
        date: nowIso,
        totalVolumeKg: Math.round(totalVolumeKg),
        totalSets,
        totalReps,
        overallRpe: sessionRpe,
        workoutNotes: sessionNotes.trim(),
        exercises: sanitizedExercises,
        prs: newPrs,
      };

      if (!isNaN(bwVal) && bwVal > 20) {
        perfPayload.weight = bwVal;
      }

      const perfDocRef = await addDoc(collection(db, 'clientPerformance'), perfPayload);

      if (activeAssignedWorkout?.id) {
        await updateDoc(doc(db, 'assignedWorkouts', activeAssignedWorkout.id), {
          status: 'Completed',
          completedAt: nowIso,
          updatedAt: nowIso,
          loggedExercises: sanitizedExercises,
          clientNotes: sessionNotes.trim(),
          totalVolumeKg: Math.round(totalVolumeKg),
          totalSets,
          totalReps,
          performanceDocId: perfDocRef.id,
        });
      }

      toast.success(
        newPrs.length > 0
          ? `Workout saved! You hit ${newPrs.length} new Personal Record${newPrs.length > 1 ? 's' : ''}!`
          : 'Workout weights & reps logged! Your coach can now review your session.'
      );
      setLoggerOpen(false);
      setActiveAssignedWorkout(null);
      if (onCloseInitialLog) onCloseInitialLog();
    } catch (err: any) {
      console.error('Error saving client workout performance:', err);
      toast.error('Failed to save workout log: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingWorkout(false);
    }
  };

  const selectedExerciseCurve = selectedLiftForCurve
    ? exerciseHistoryMap.get(selectedLiftForCurve)
    : trackedExercisesList[0]
      ? exerciseHistoryMap.get(trackedExercisesList[0].key)
      : undefined;

  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const textColor = theme === 'dark' ? '#a1a1aa' : '#71717a';

  return (
    <div className="space-y-5">
      {/* Top Athlete Performance Action Banner */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-primary text-black font-black text-[10px] uppercase tracking-wider px-2.5 py-0.5">
                <Zap className="h-3 w-3 mr-1 inline" /> Athlete Performance Lab
              </Badge>
              <Badge variant="outline" className="border-zinc-700 text-zinc-300 text-[10px] font-mono">
                Overall Rating: <strong className="text-primary ml-1">{overallAthleteScore}/100</strong>
              </Badge>
              <Badge variant="outline" className="border-zinc-700 text-zinc-300 text-[10px] font-mono">
                Ref BW: {effectiveBodyweight} kg
              </Badge>
            </div>
            <h3 className="text-lg sm:text-xl font-black tracking-tight text-white">
              {isCoachView ? `${client.name}'s Strength & Athletic Abilities` : 'Your Dynamic Strength & Athletic Dashboard'}
            </h3>
            <p className="text-xs text-zinc-400">
              {isCoachView
                ? 'Live view of client-logged weights & reps, estimated 1RM progression curves, and relative strength standards.'
                : 'Log your weights and reps during Personal Training so your coach can track your 1RM, volume, and athletic progression.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              onClick={() => openWorkoutLogger(null)}
              className="h-10 px-4 rounded-xl font-black text-xs gap-2 bg-primary hover:bg-primary/90 text-black shadow-md"
            >
              <Dumbbell className="h-4 w-4" />
              {isCoachView ? 'Log PT Sets for Client' : '+ Log My PT Weights & Reps'}
            </Button>
          </div>
        </div>

        {/* Quick Assigned Workouts Ready to Log */}
        {assignedWorkouts.filter((w) => w.status !== 'Completed').length > 0 && (
          <div className="mt-4 pt-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" /> Ready to Log with Trainer:
            </span>
            {assignedWorkouts
              .filter((w) => w.status !== 'Completed')
              .slice(0, 3)
              .map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => openWorkoutLogger(w)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Log "{w.title}" Weights & Reps</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border bg-card/60 rounded-2xl">
          <CardContent className="p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Activity className="h-3.5 w-3.5 text-primary" /> Logged Sessions
            </span>
            <p className="text-2xl font-black font-mono mt-1 text-foreground">{performanceLogs.length}</p>
            <span className="text-[10px] text-muted-foreground">
              {performanceLogs.filter((l) => l.loggedBy === 'client').length} self-logged •{' '}
              {performanceLogs.filter((l) => l.loggedBy !== 'client').length} by coach
            </span>
          </CardContent>
        </Card>

        <Card className="border bg-card/60 rounded-2xl">
          <CardContent className="p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-amber-500" /> Total Tonnage Lifted
            </span>
            <p className="text-2xl font-black font-mono mt-1 text-primary">
              {(
                performanceLogs.reduce((acc, l) => acc + (Number(l.totalVolumeKg) || 0), 0) / 1000
              ).toFixed(1)}{' '}
              <span className="text-xs font-normal text-muted-foreground">tons</span>
            </p>
            <span className="text-[10px] text-muted-foreground">
              {performanceLogs
                .reduce((acc, l) => acc + (Number(l.totalVolumeKg) || 0), 0)
                .toLocaleString()}{' '}
              kg lifetime volume
            </span>
          </CardContent>
        </Card>

        <Card className="border bg-card/60 rounded-2xl">
          <CardContent className="p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5 text-emerald-500" /> Personal Records
            </span>
            <p className="text-2xl font-black font-mono mt-1 text-foreground">{historicalPrMap.size}</p>
            <span className="text-[10px] text-muted-foreground">Unique movements with verified PRs</span>
          </CardContent>
        </Card>

        <Card className="border bg-card/60 rounded-2xl">
          <CardContent className="p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-purple-500" /> Athletic Index
            </span>
            <p className="text-2xl font-black font-mono mt-1 text-foreground">
              {overallAthleteScore}
              <span className="text-xs font-normal text-muted-foreground">/100</span>
            </p>
            <span className="text-[10px] text-muted-foreground">
              {overallAthleteScore >= 80
                ? 'Elite Tier'
                : overallAthleteScore >= 60
                  ? 'Advanced Athlete'
                  : overallAthleteScore >= 40
                    ? 'Intermediate'
                    : 'Building Foundation'}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* 6-Axis Athletic Ability Radar + Relative Strength Standards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 6-Axis Radar */}
        <Card className="lg:col-span-5 border bg-card/60 rounded-2xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> 6-Axis Athletic Ability Profile
            </CardTitle>
            <CardDescription className="text-[11px]">
              Dynamic athletic balance across Strength, Hypertrophy, Endurance, Explosiveness, Work Capacity & Consistency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={athleteRadarData}>
                  <PolarGrid stroke={gridColor} />
                  <PolarAngleAxis dataKey="ability" tick={{ fill: textColor, fontSize: 11, fontWeight: 700 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="Athlete Score"
                    dataKey="score"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.28}
                    strokeWidth={2}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: '#27272a',
                      color: '#fff',
                      borderRadius: '10px',
                      fontSize: '11px',
                    }}
                    formatter={(val: any) => [`${val} / 100`, 'Score']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Relative Strength Standards (Bodyweight Multipliers) */}
        <Card className="lg:col-span-7 border bg-card/60 rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" /> Compound Strength Standards & Relative Ratios
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Estimated 1-Rep Max compared to bodyweight ({effectiveBodyweight} kg) across key compound lifts.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                Epley 1RM Formula
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {benchmarkResults.map((b) => (
              <div key={b.key} className="p-3 rounded-xl border bg-background/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">{b.label}</span>
                      <span className="text-[10px] text-muted-foreground">({b.category})</span>
                    </div>
                    {b.best1RM > 0 ? (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Best Set: <strong className="text-foreground font-mono">{b.bestWeight}kg × {b.bestReps}</strong> ({b.matchedName})
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic mt-0.5">
                        Not logged yet — log {b.label.split(' ')[0]} sets to unlock your strength tier
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-1.5">
                      <Badge variant="outline" className={`text-[10px] font-bold ${b.tierColor}`}>
                        {b.tier}
                      </Badge>
                      <span className="font-mono font-black text-sm text-foreground">
                        {b.best1RM > 0 ? `${b.best1RM} kg` : '—'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground block">
                      {b.best1RM > 0 ? `${b.ratio}x BW (Elite: ${b.eliteTargetKg}kg)` : `Elite Target: ${b.eliteTargetKg}kg`}
                    </span>
                  </div>
                </div>

                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${b.progressPct}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Interactive Exercise 1RM & Volume Progression Curve */}
      <Card className="border bg-card/60 rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Exercise Strength & 1RM Progression Curve
              </CardTitle>
              <CardDescription className="text-[11px]">
                Select any exercise you have logged to inspect your Estimated 1RM, Top Set Weight, or Session Volume over time.
              </CardDescription>
            </div>

            <div className="flex items-center gap-1.5">
              {(['est1RM', 'maxWeight', 'volume'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCurveMetric(m)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                    curveMetric === m
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border/70 hover:text-foreground'
                  }`}
                >
                  {m === 'est1RM' ? 'Est. 1RM (kg)' : m === 'maxWeight' ? 'Max Weight (kg)' : 'Volume (kg)'}
                </button>
              ))}
            </div>
          </div>

          {/* Exercise Selector Pills */}
          {trackedExercisesList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2">
              {trackedExercisesList.slice(0, 12).map((ex) => {
                const active = (selectedLiftForCurve || trackedExercisesList[0]?.key) === ex.key;
                return (
                  <button
                    key={ex.key}
                    type="button"
                    onClick={() => setSelectedLiftForCurve(ex.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-all flex items-center gap-1.5 ${
                      active
                        ? 'bg-primary/15 text-primary border-primary font-black'
                        : 'bg-background text-muted-foreground border-border/70 hover:text-foreground'
                    }`}
                  >
                    <span>{ex.name}</span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0">
                      1RM: {ex.best1RM}kg
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </CardHeader>

        <CardContent>
          {selectedExerciseCurve && selectedExerciseCurve.sessions.length > 0 ? (
            <div className="space-y-3">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selectedExerciseCurve.sessions}>
                    <defs>
                      <linearGradient id="athleteLiftGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" stroke={textColor} fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke={textColor}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => `${v}kg`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        borderColor: '#27272a',
                        color: '#fff',
                        borderRadius: '10px',
                        fontSize: '11px',
                      }}
                      formatter={(val: any, _name: any, props: any) => {
                        const p = props?.payload;
                        const label =
                          curveMetric === 'est1RM'
                            ? 'Estimated 1RM'
                            : curveMetric === 'maxWeight'
                              ? 'Top Set Weight'
                              : 'Exercise Volume';
                        return [
                          `${val} kg (Best set: ${p?.maxWeight}kg × ${p?.maxReps} • ${p?.loggedBy})`,
                          label,
                        ];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={curveMetric}
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#athleteLiftGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No exercise sets logged yet. Click <strong>+ Log My PT Weights & Reps</strong> above to start tracking your strength curves!
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Volume Bar Chart & Detailed Set-by-Set Logbook */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Session Volume History */}
        <Card className="lg:col-span-5 border bg-card/60 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Session Tonnage & Workload
            </CardTitle>
            <CardDescription className="text-[11px]">
              Total weight lifted (kg) across your recent training sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessionVolumeChartData.length > 0 ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sessionVolumeChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="date" stroke={textColor} fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke={textColor}
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        borderColor: '#27272a',
                        color: '#fff',
                        borderRadius: '10px',
                        fontSize: '11px',
                      }}
                      formatter={(val: any, _name: any, props: any) => [
                        `${Number(val).toLocaleString()} kg (${props?.payload?.sets || 0} sets • ${props?.payload?.loggedBy})`,
                        'Session Volume',
                      ]}
                    />
                    <Bar dataKey="volumeKg" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground italic">
                Log your first workout to see your session tonnage chart.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Set-by-Set Performance Logbook (Visible to Both Client & Coach) */}
        <Card className="lg:col-span-7 border bg-card/60 rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-primary" /> Set-by-Set Training Logbook
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Every exercise, weight, and rep logged by you or your coach during PT sessions.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {performanceLogs.length} Sessions
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {performanceLogs.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground italic">
                No training sessions recorded yet.
              </div>
            ) : (
              performanceLogs.slice(0, 12).map((log) => {
                const isSelfLogged = log.loggedBy === 'client';
                return (
                  <div key={log.id} className="p-3 rounded-xl border bg-background/70 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">
                          {log.workoutTitle || 'PT Training Session'}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-bold ${
                            isSelfLogged
                              ? 'border-sky-500/40 text-sky-500 bg-sky-500/10'
                              : 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                          }`}
                        >
                          {isSelfLogged ? 'Logged by Client' : `Coach ${log.coachName || 'Trainer'}`}
                        </Badge>
                        {log.overallRpe && (
                          <Badge variant="outline" className="text-[9px] font-mono">
                            RPE {log.overallRpe}/10
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {safeFormatDate(log.date, 'dd MMM yyyy, h:mm a')}
                      </span>
                    </div>

                    {Array.isArray(log.exercises) && log.exercises.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {log.exercises.map((ex: any, i: number) => (
                          <div key={i} className="p-2 rounded-lg border bg-card/60 space-y-1">
                            <p className="font-bold text-[11px] text-foreground truncate">{ex.name}</p>
                            <div className="flex flex-wrap gap-1">
                              {(ex.sets || []).map((s: any, sIdx: number) => (
                                <span
                                  key={sIdx}
                                  className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground"
                                >
                                  S{s.setNumber || sIdx + 1}: <strong>{s.weightKg}kg</strong>×{s.reps}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {log.workoutNotes && (
                      <p className="text-[11px] text-muted-foreground italic bg-muted/40 p-2 rounded-lg">
                        "{log.workoutNotes}"
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* INTERACTIVE PT WEIGHTS & REPS LOGGER MODAL */}
      <Dialog
        open={loggerOpen}
        onOpenChange={(open) => {
          setLoggerOpen(open);
          if (!open && onCloseInitialLog) onCloseInitialLog();
        }}
      >
        <DialogContent className="!w-[94vw] !max-w-[680px] max-h-[90dvh] overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 rounded-2xl">
          <DialogHeader className="min-w-0 pr-6 text-left">
            <DialogTitle className="text-base sm:text-lg font-black flex items-center gap-2 leading-tight break-words">
              <Dumbbell className="h-5 w-5 text-primary shrink-0" />
              <span className="min-w-0 break-words">
                {activeAssignedWorkout
                  ? `Log Weights & Reps: ${activeAssignedWorkout.title}`
                  : 'Log Personal Training Weights & Reps'}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed break-words">
              Enter the weight (kg) and reps completed for each set. Your coach can immediately view your numbers, PRs, and 1RM progression.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1 min-w-0">
            {/* Session Metadata Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 p-3 rounded-xl bg-muted/30 border min-w-0">
              <div className="min-w-0">
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">Session Title</label>
                <Input
                  value={workoutTitle}
                  onChange={(e) => setWorkoutTitle(e.target.value)}
                  placeholder="e.g. Upper Body Strength PT"
                  className="h-9 text-xs font-semibold w-full min-w-0"
                />
              </div>
              <div className="min-w-0">
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">Personal Trainer / Coach</label>
                <Input
                  value={coachNameInput}
                  onChange={(e) => setCoachNameInput(e.target.value)}
                  placeholder="Coach Name"
                  className="h-9 text-xs w-full min-w-0"
                />
              </div>
              <div className="min-w-0">
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Current Bodyweight (kg, optional)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  value={clientBodyweightInput}
                  onChange={(e) => setClientBodyweightInput(e.target.value)}
                  placeholder={`${effectiveBodyweight} kg`}
                  className="h-9 text-xs font-mono w-full min-w-0"
                />
              </div>
            </div>

            {/* Logged Exercises & Sets */}
            <div className="space-y-3 min-w-0">
              {loggedExercises.map((ex, exIdx) => {
                const prevBest = historicalPrMap.get(ex.name.trim().toLowerCase());
                return (
                  <Card key={ex.id} className="border rounded-2xl overflow-hidden bg-card min-w-0">
                    <div className="p-2.5 sm:p-3 bg-muted/30 border-b flex items-center justify-between gap-2 flex-wrap min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-6 w-6 rounded-lg bg-primary/15 text-primary font-mono font-black text-xs flex items-center justify-center shrink-0">
                          {exIdx + 1}
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-foreground truncate">{ex.name}</h4>
                          <span className="text-[10px] text-muted-foreground block truncate">
                            {ex.category} {ex.equipment ? `• ${ex.equipment}` : ''}
                            {ex.targetSets ? ` • Target: ${ex.targetSets}×${ex.targetReps}` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {prevBest && (
                          <Badge variant="outline" className="text-[10px] font-mono border-amber-500/40 text-amber-500">
                            <Trophy className="h-3 w-3 mr-1" />
                            PR: {prevBest.weight}kg × {prevBest.reps}
                          </Badge>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveLoggedExercise(ex.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <CardContent className="p-2.5 sm:p-3 space-y-2 min-w-0">
                      <div className="grid grid-cols-12 gap-1.5 sm:gap-2 text-[10px] font-bold uppercase text-muted-foreground px-1">
                        <div className="col-span-2 sm:col-span-1 text-center">Set</div>
                        <div className="col-span-4 sm:col-span-4 text-center">Weight (kg)</div>
                        <div className="col-span-4 sm:col-span-3 text-center">Reps</div>
                        <div className="col-span-2 sm:col-span-4 text-right pr-1">Done</div>
                      </div>

                      {ex.sets.map((set, sIdx) => {
                        const est1RM = calculateEpley1RM(Number(set.weightKg) || 0, Number(set.reps) || 0);
                        const isNewPr =
                          prevBest &&
                          Number(set.weightKg) > 0 &&
                          (est1RM > prevBest.est1RM || Number(set.weightKg) > prevBest.weight);

                        return (
                          <div
                            key={sIdx}
                            className={`grid grid-cols-12 gap-1.5 sm:gap-2 items-center p-1.5 sm:p-2 rounded-xl border min-w-0 ${
                              set.completed
                                ? 'bg-emerald-500/5 border-emerald-500/30'
                                : 'bg-background border-border/60 opacity-60'
                            }`}
                          >
                            <div className="col-span-2 sm:col-span-1 text-center font-mono font-black text-xs">
                              #{set.setNumber}
                            </div>

                            <div className="col-span-4 sm:col-span-4 flex items-center justify-center gap-1 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateLoggedSet(
                                    ex.id,
                                    sIdx,
                                    'weightKg',
                                    Math.max(0, (Number(set.weightKg) || 0) - 2.5)
                                  )
                                }
                                className="h-7 w-6 rounded bg-muted hover:bg-muted/80 font-bold text-xs shrink-0"
                              >
                                -
                              </button>
                              <Input
                                type="number"
                                step="0.5"
                                value={set.weightKg}
                                onChange={(e) =>
                                  handleUpdateLoggedSet(ex.id, sIdx, 'weightKg', parseFloat(e.target.value) || 0)
                                }
                                className="h-8 w-full min-w-0 text-center font-mono font-black text-xs px-1"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateLoggedSet(ex.id, sIdx, 'weightKg', (Number(set.weightKg) || 0) + 2.5)
                                }
                                className="h-7 w-6 rounded bg-muted hover:bg-muted/80 font-bold text-xs shrink-0"
                              >
                                +
                              </button>
                            </div>

                            <div className="col-span-4 sm:col-span-3 flex items-center justify-center gap-1 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateLoggedSet(ex.id, sIdx, 'reps', Math.max(1, (Number(set.reps) || 1) - 1))
                                }
                                className="h-7 w-6 rounded bg-muted hover:bg-muted/80 font-bold text-xs shrink-0"
                              >
                                -
                              </button>
                              <Input
                                type="number"
                                value={set.reps}
                                onChange={(e) =>
                                  handleUpdateLoggedSet(ex.id, sIdx, 'reps', Math.max(1, parseInt(e.target.value, 10) || 1))
                                }
                                className="h-8 w-full min-w-0 text-center font-mono font-black text-xs px-1"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateLoggedSet(ex.id, sIdx, 'reps', (Number(set.reps) || 0) + 1)
                                }
                                className="h-7 w-6 rounded bg-muted hover:bg-muted/80 font-bold text-xs shrink-0"
                              >
                                +
                              </button>
                            </div>

                            <div className="col-span-2 sm:col-span-4 flex items-center justify-end gap-1 min-w-0">
                              {est1RM > 0 && (
                                <Badge variant="outline" className="text-[9px] font-mono hidden sm:inline-flex">
                                  1RM ~{est1RM}kg
                                </Badge>
                              )}
                              {isNewPr && (
                                <Badge className="bg-amber-500 text-black text-[9px] font-black hidden sm:inline-flex">
                                  PR!
                                </Badge>
                              )}
                              <button
                                type="button"
                                onClick={() => handleUpdateLoggedSet(ex.id, sIdx, 'completed', !set.completed)}
                                className={`h-7 w-8 sm:w-9 rounded-lg flex items-center justify-center border transition-all shrink-0 ${
                                  set.completed
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-muted text-muted-foreground border-border'
                                }`}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              {ex.sets.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLoggedSet(ex.id, sIdx)}
                                  className="text-muted-foreground hover:text-red-500 text-xs px-0.5 shrink-0"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddSetToLoggedExercise(ex.id)}
                        className="h-7 text-xs font-bold text-primary gap-1"
                      >
                        <Plus className="h-3 w-3" /> + Add Set
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Add Exercise Picker Box */}
            <div className="p-3.5 rounded-2xl border bg-muted/20 space-y-2.5">
              <label className="text-xs font-extrabold uppercase tracking-wider text-foreground block">
                + Add Exercise to This Session
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={exerciseSearch}
                    onChange={(e) => setExerciseSearch(e.target.value)}
                    placeholder="Search 1,585 exercises (Bench Press, Squat, Deadlift, Pull-Up, Planche)..."
                    className="pl-9 h-8 text-xs"
                  />
                </div>
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                  {(['All', 'Calisthenics', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms & Core', 'Conditioning'] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setPickerCategory(cat)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap border ${
                          pickerCategory === cat
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground'
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                {pickerExercises.slice(0, 12).map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => handleAddExerciseToLogger(ex.name, ex.category, ex.equipment)}
                    className="px-2.5 py-1.5 rounded-xl border bg-background hover:bg-primary/10 hover:border-primary/40 text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 shrink-0 transition-all"
                  >
                    <Plus className="h-3 w-3 text-primary" />
                    <span>{ex.name}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Input
                  value={customExerciseName}
                  onChange={(e) => setCustomExerciseName(e.target.value)}
                  placeholder="Or type any custom exercise name..."
                  className="h-8 text-xs flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!customExerciseName.trim()}
                  onClick={() => handleAddExerciseToLogger(customExerciseName, 'Strength', 'Barbell')}
                  className="h-8 text-xs font-bold"
                >
                  Add Custom
                </Button>
              </div>
            </div>

            {/* Session RPE & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold block">Session Intensity (RPE 1-10)</label>
                <div className="flex items-center gap-1.5">
                  {[6, 7, 8, 9, 10].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSessionRpe(r)}
                      className={`h-8 w-9 rounded-xl font-mono text-xs font-bold border transition-all ${
                        sessionRpe === r
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold block">Notes for Your Coach</label>
                <Textarea
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="How did the weights feel today? Any PRs or form notes for your trainer?"
                  className="h-14 text-xs resize-none rounded-xl"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLoggerOpen(false);
                if (onCloseInitialLog) onCloseInitialLog();
              }}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveLoggedWorkout}
              disabled={isSavingWorkout || loggedExercises.length === 0}
              className="rounded-xl text-xs font-black gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isSavingWorkout ? 'Saving Performance...' : 'Save Weights & Reps to Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
