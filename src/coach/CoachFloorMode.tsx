import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  collection, query, where, getDocs, addDoc, doc, updateDoc, onSnapshot 
} from 'firebase/firestore';
import { Client, Session } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  Play, Pause, RotateCcw, Plus, Check, Trash2, Trophy, 
  Dumbbell, Timer, Flame, ArrowLeft, Search, User, 
  Sparkles, CheckCircle2, ChevronDown, ChevronUp, AlertCircle, 
  Volume2, HeartHandshake, Award
} from 'lucide-react';
import { format } from 'date-fns';

// Categorized Exercise Library
const EXERCISE_LIBRARY: { category: string; exercises: string[] }[] = [
  {
    category: 'Chest',
    exercises: [
      'Barbell Bench Press',
      'Incline Dumbbell Press',
      'Dumbbell Flat Press',
      'Cable Chest Flyes',
      'Dips',
      'Push-ups',
      'Incline Barbell Press'
    ]
  },
  {
    category: 'Back',
    exercises: [
      'Barbell Deadlift',
      'Barbell Bent-Over Row',
      'Lat Pulldown',
      'Seated Cable Row',
      'Pull-ups / Chin-ups',
      'Single-Arm Dumbbell Row',
      'Face Pulls',
      'T-Bar Row'
    ]
  },
  {
    category: 'Legs',
    exercises: [
      'Barbell Back Squat',
      'Front Squat',
      'Romanian Deadlift (RDL)',
      'Bulgarian Split Squat',
      'Leg Press',
      'Leg Extension',
      'Lying Leg Curl',
      'Walking Lunges',
      'Calf Raises'
    ]
  },
  {
    category: 'Shoulders',
    exercises: [
      'Overhead Barbell Press',
      'Dumbbell Shoulder Press',
      'Dumbbell Lateral Raise',
      'Cable Lateral Raise',
      'Arnold Press',
      'Rear Delt Flyes',
      'Upright Row'
    ]
  },
  {
    category: 'Arms & Core',
    exercises: [
      'Barbell Bicep Curl',
      'Dumbbell Hammer Curl',
      'Tricep Rope Pushdown',
      'Overhead Tricep Extension',
      'Skull Crushers',
      'Hanging Leg Raises',
      'Cable Woodchoppers',
      'Plank'
    ]
  },
  {
    category: 'Conditioning',
    exercises: [
      'Assault Bike Sprint',
      'Rowing Machine (500m)',
      'SkiErg',
      'Sled Push / Prowler',
      'Kettlebell Swings',
      'Battle Ropes',
      'Box Jumps'
    ]
  }
];

export interface WorkoutSet {
  id: string;
  setNumber: number;
  type: 'Working' | 'Warmup' | 'Drop' | 'Failure';
  weightKg: number;
  reps: number;
  rpe?: number;
  completed: boolean;
  isPR?: boolean;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  category: string;
  previousBest?: { weight: number; reps: number; date: string };
  sets: WorkoutSet[];
  notes?: string;
}

interface CoachFloorModeProps {
  initialClient?: Client | null;
  initialSession?: Session | null;
  onExit: () => void;
}

// Audio chime generator using browser Web Audio API
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Audio not allowed or muted
  }
}

export default function CoachFloorMode({ initialClient, initialSession, onExit }: CoachFloorModeProps) {
  const { currentUser } = useAuth();

  // Active Client & Session
  const [selectedClient, setSelectedClient] = useState<Client | null>(initialClient || null);
  const [activeSession, setActiveSession] = useState<Session | null>(initialSession || null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientPickerOpen, setClientPickerOpen] = useState(!initialClient);
  const [clientSearch, setClientSearch] = useState('');

  // Workout Session Stopwatch (Elapsed Time)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(true);

  // Floating Rest Timer
  const [restSecondsRemaining, setRestSecondsRemaining] = useState<number | null>(null);
  const [restDuration, setRestDuration] = useState(60);
  const [isRestRunning, setIsRestRunning] = useState(false);
  const restTimerRef = useRef<any>(null);

  // Logged Exercises
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [addExerciseModalOpen, setAddExerciseModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [customExerciseName, setCustomExerciseName] = useState('');

  // PR History mapping: exerciseName -> { weight: number, reps: number, date: string }
  const [clientPrs, setClientPrs] = useState<Record<string, { weight: number; reps: number; date: string }>>({});

  // Overall session notes & RPE
  const [sessionNotes, setSessionNotes] = useState('');
  const [overallRpe, setOverallRpe] = useState<number>(8);

  // Saving & Completion state
  const [isFinishing, setIsFinishing] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<{
    durationMinutes: number;
    totalVolumeKg: number;
    totalSets: number;
    totalReps: number;
    newPrs: { exercise: string; weight: number; reps: number }[];
  } | null>(null);

  // 1. Fetch clients list for picker
  useEffect(() => {
    const loadClients = async () => {
      try {
        const snap = await getDocs(collection(db, 'clients'));
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as Client));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setClients(list);
      } catch (err) {
        console.error("Error fetching clients in floor mode:", err);
      }
    };
    loadClients();
  }, []);

  // 2. Fetch client's PR history when client selected
  useEffect(() => {
    if (!selectedClient?.id) return;
    const fetchPrHistory = async () => {
      try {
        const q = query(
          collection(db, 'clientPerformance'),
          where('clientId', '==', selectedClient.id)
        );
        const snap = await getDocs(q);
        const map: Record<string, { weight: number; reps: number; date: string }> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          if (Array.isArray(data.prs)) {
            data.prs.forEach((pr: any) => {
              const name = (pr.exercise || '').trim().toLowerCase();
              const w = parseFloat(pr.weight) || 0;
              const r = parseInt(pr.reps, 10) || 0;
              if (name && w > 0) {
                if (!map[name] || w > map[name]!.weight) {
                  map[name] = { weight: w, reps: r, date: data.date || '' };
                }
              }
            });
          }
        });
        setClientPrs(map);
      } catch (err) {
        console.error("Error fetching client PRs:", err);
      }
    };
    fetchPrHistory();
  }, [selectedClient?.id]);

  // 3. Stopwatch Interval
  useEffect(() => {
    let interval: any;
    if (isStopwatchRunning) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isStopwatchRunning]);

  // 4. Rest Timer Interval
  useEffect(() => {
    if (isRestRunning && restSecondsRemaining !== null) {
      restTimerRef.current = setInterval(() => {
        setRestSecondsRemaining(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(restTimerRef.current);
            setIsRestRunning(false);
            playChime();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(restTimerRef.current);
    }
    return () => clearInterval(restTimerRef.current);
  }, [isRestRunning, restSecondsRemaining]);

  // Start rest timer helper
  const startRestTimer = (seconds: number) => {
    setRestDuration(seconds);
    setRestSecondsRemaining(seconds);
    setIsRestRunning(true);
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Add Exercise to Workout
  const handleAddExercise = (name: string, category: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const previousBest = clientPrs[trimmedName.toLowerCase()];

    const newEx: WorkoutExercise = {
      id: `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: trimmedName,
      category,
      previousBest,
      sets: [
        {
          id: `set_1_${Date.now()}`,
          setNumber: 1,
          type: 'Working',
          weightKg: previousBest ? previousBest.weight : 40,
          reps: previousBest ? previousBest.reps : 10,
          rpe: 8,
          completed: false
        }
      ]
    };

    setExercises(prev => [...prev, newEx]);
    setAddExerciseModalOpen(false);
    setCustomExerciseName('');
    setExerciseSearch('');
  };

  // Remove Exercise
  const handleRemoveExercise = (exerciseId: string) => {
    setExercises(prev => prev.filter(e => e.id !== exerciseId));
  };

  // Add Set to an Exercise
  const handleAddSet = (exerciseId: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exerciseId) return ex;
      const lastSet = ex.sets[ex.sets.length - 1];
      const newSet: WorkoutSet = {
        id: `set_${ex.sets.length + 1}_${Date.now()}`,
        setNumber: ex.sets.length + 1,
        type: lastSet?.type || 'Working',
        weightKg: lastSet?.weightKg || 40,
        reps: lastSet?.reps || 10,
        rpe: lastSet?.rpe || 8,
        completed: false
      };
      return {
        ...ex,
        sets: [...ex.sets, newSet]
      };
    }));
  };

  // Update Set Value
  const handleUpdateSet = (
    exerciseId: string, 
    setId: string, 
    field: keyof WorkoutSet, 
    value: any
  ) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exerciseId) return ex;
      return {
        ...ex,
        sets: ex.sets.map(s => {
          if (s.id !== setId) return s;
          const updated = { ...s, [field]: value };
          
          // Check for PR if weight changed
          if (field === 'weightKg' || field === 'completed') {
            const currentBestWeight = ex.previousBest?.weight || 0;
            if (updated.weightKg > currentBestWeight && currentBestWeight > 0) {
              updated.isPR = true;
            } else {
              updated.isPR = false;
            }
          }
          return updated;
        })
      };
    }));
  };

  // Toggle Set Complete (1-Tap Check & Rest Timer Trigger)
  const handleToggleSetComplete = (exerciseId: string, setId: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exerciseId) return ex;
      return {
        ...ex,
        sets: ex.sets.map(s => {
          if (s.id !== setId) return s;
          const nextCompleted = !s.completed;
          const currentBestWeight = ex.previousBest?.weight || 0;
          const isPR = nextCompleted && s.weightKg > currentBestWeight && currentBestWeight > 0;
          
          if (nextCompleted) {
            // Trigger 60s rest timer automatically
            startRestTimer(60);
          }
          return { ...s, completed: nextCompleted, isPR };
        })
      };
    }));
  };

  // Remove Set
  const handleRemoveSet = (exerciseId: string, setId: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exerciseId) return ex;
      if (ex.sets.length <= 1) return ex; // keep at least 1 set
      const filtered = ex.sets.filter(s => s.id !== setId);
      return {
        ...ex,
        sets: filtered.map((s, idx) => ({ ...s, setNumber: idx + 1 }))
      };
    }));
  };

  // Finish Workout Session
  const handleFinishWorkout = async () => {
    if (!selectedClient || !currentUser) return;
    setIsFinishing(true);

    try {
      // 1. Calculate Summary Stats
      let totalVolume = 0;
      let totalSetsCount = 0;
      let totalRepsCount = 0;
      const newPrsList: { exercise: string; weight: number; reps: number }[] = [];

      exercises.forEach(ex => {
        ex.sets.forEach(s => {
          if (s.completed) {
            totalVolume += (s.weightKg * s.reps);
            totalSetsCount += 1;
            totalRepsCount += s.reps;
            
            const prev = ex.previousBest?.weight || 0;
            if (s.weightKg > prev) {
              newPrsList.push({
                exercise: ex.name,
                weight: s.weightKg,
                reps: s.reps
              });
            }
          }
        });
      });

      const durationMins = Math.max(1, Math.round(elapsedSeconds / 60));

      // 2. Write to clientPerformance collection
      await addDoc(collection(db, 'clientPerformance'), {
        clientId: selectedClient.id,
        clientName: selectedClient.name || 'Member',
        coachId: currentUser.id,
        coachName: currentUser.name || 'Coach',
        date: new Date().toISOString(),
        durationMinutes: durationMins,
        totalVolumeKg: totalVolume,
        totalSets: totalSetsCount,
        totalReps: totalRepsCount,
        overallRpe,
        workoutNotes: sessionNotes.trim(),
        exercises: exercises.map(ex => ({
          name: ex.name,
          category: ex.category,
          sets: ex.sets.filter(s => s.completed).map(s => ({
            setNumber: s.setNumber,
            type: s.type,
            weightKg: s.weightKg,
            reps: s.reps,
            rpe: s.rpe
          }))
        })),
        prs: newPrsList
      });

      // 3. Update canonical Session if linked or create Attended session
      if (activeSession) {
        await updateDoc(doc(db, 'sessions', activeSession.id), {
          status: 'Attended',
          updatedAt: new Date().toISOString(),
          workoutSummary: {
            totalVolumeKg: totalVolume,
            totalSets: totalSetsCount,
            durationMinutes: durationMins
          }
        });
      }

      // 4. Deduct 1 session balance if member has active package
      const currentRemaining = selectedClient.sessionsRemaining ?? selectedClient.ptSessionsRemaining;
      if (typeof currentRemaining === 'number' && currentRemaining > 0) {
        const nextBal = currentRemaining - 1;
        await updateDoc(doc(db, 'clients', selectedClient.id), {
          sessionsRemaining: nextBal
        });

        // Log deduction in auditLogs
        await addDoc(collection(db, 'auditLogs'), {
          action: 'UPDATE',
          entityType: 'CLIENT',
          entityId: selectedClient.id,
          details: `Floor Mode: 1 PT session deducted for ${selectedClient.name} (${durationMins}m, ${totalVolume}kg volume). Remaining: ${nextBal}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name || 'Coach'
        });
      }

      // 5. Show celebratory completion summary modal
      setCompletionSummary({
        durationMinutes: durationMins,
        totalVolumeKg: totalVolume,
        totalSets: totalSetsCount,
        totalReps: totalRepsCount,
        newPrs: newPrsList
      });

    } catch (err: any) {
      console.error("Error saving floor workout:", err);
      alert("Failed to save workout: " + (err.message || "Unknown error"));
    } finally {
      setIsFinishing(false);
    }
  };

  // Filtered exercise catalog
  const filteredCatalog = useMemo(() => {
    let list: { category: string; name: string }[] = [];
    EXERCISE_LIBRARY.forEach(cat => {
      if (selectedCategory === 'All' || selectedCategory === cat.category) {
        cat.exercises.forEach(ex => {
          list.push({ category: cat.category, name: ex });
        });
      }
    });

    if (exerciseSearch.trim()) {
      const q = exerciseSearch.toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q));
    }
    return list;
  }, [selectedCategory, exerciseSearch]);

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-300">
      {/* Top Navigation & Live Header */}
      <div className="bg-card border rounded-2xl p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-16 z-30 backdrop-blur-md bg-opacity-95">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onExit}
            className="h-9 w-9 rounded-xl shrink-0"
            title="Exit Floor Mode"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-sm shrink-0">
              {selectedClient ? (selectedClient.name || 'M').charAt(0).toUpperCase() : <User className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base font-bold text-foreground leading-tight">
                  {selectedClient ? selectedClient.name : 'Select Member'}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setClientPickerOpen(true)}
                  className="h-5 text-[10px] px-1.5 text-primary font-bold hover:bg-primary/10 rounded"
                >
                  Change
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {selectedClient ? (
                  <span>
                    {selectedClient.packageType || 'Personal Training'} •{' '}
                    <strong className="text-primary">
                      {selectedClient.sessionsRemaining ?? selectedClient.ptSessionsRemaining ?? 0} left
                    </strong>
                  </span>
                ) : (
                  <span className="text-amber-500 font-semibold">No member selected</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stopwatch & Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Elapsed Time Pill */}
          <div className="bg-muted px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono">
            <Timer className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-black">{formatSeconds(elapsedSeconds)}</span>
            <button
              onClick={() => setIsStopwatchRunning(r => !r)}
              className="text-muted-foreground hover:text-foreground text-xs ml-1"
              title={isStopwatchRunning ? "Pause timer" : "Resume timer"}
            >
              {isStopwatchRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
          </div>

          <Button
            onClick={handleFinishWorkout}
            disabled={isFinishing || !selectedClient || exercises.length === 0}
            className="h-9 px-4 text-xs font-bold gap-1.5 rounded-xl shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4" />
            {isFinishing ? 'Saving...' : 'Finish Workout'}
          </Button>
        </div>
      </div>

      {/* FLOATING REST TIMER DOCK */}
      {restSecondsRemaining !== null && (
        <div className="bg-zinc-950 text-white border border-zinc-800 rounded-2xl p-3.5 shadow-xl flex items-center justify-between gap-3 animate-in slide-in-from-top-3">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-mono font-black text-sm border ${
              restSecondsRemaining === 0 
                ? 'bg-emerald-500 text-white animate-bounce border-emerald-400' 
                : 'bg-zinc-900 text-primary border-primary/40'
            }`}>
              {restSecondsRemaining}s
            </div>
            <div>
              <span className="text-xs font-bold block">
                {restSecondsRemaining === 0 ? 'Rest Complete! Go!' : 'Resting...'}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                {[30, 60, 90, 120].map(sec => (
                  <button
                    key={sec}
                    onClick={() => startRestTimer(sec)}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold transition-all ${
                      restDuration === sec ? 'bg-primary text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRestSecondsRemaining(prev => (prev || 0) + 15)}
              className="h-7 text-[10px] px-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg"
            >
              +15s
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsRestRunning(r => !r)}
              className="h-7 w-7 text-zinc-300 hover:bg-zinc-800 rounded-lg"
            >
              {isRestRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRestSecondsRemaining(null)}
              className="h-7 w-7 text-zinc-400 hover:text-white rounded-lg"
              title="Close rest timer"
            >
              ✕
            </Button>
          </div>
        </div>
      )}

      {/* Main Exercises List or Empty State */}
      {exercises.length === 0 ? (
        <Card className="border-dashed bg-muted/20 p-8 text-center rounded-2xl">
          <div className="max-w-sm mx-auto space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary">
              <Dumbbell className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-base">Ready on the Gym Floor!</h3>
            <p className="text-xs text-muted-foreground">
              Add your first exercise to start tracking sets, reps, weights, and live Personal Records.
            </p>
            <Button
              onClick={() => setAddExerciseModalOpen(true)}
              className="h-9 px-4 text-xs font-bold gap-1.5 rounded-xl shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add First Exercise
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {exercises.map((exercise, exIndex) => (
            <Card key={exercise.id} className="border shadow-sm rounded-2xl overflow-hidden bg-card">
              <CardHeader className="p-3.5 pb-2.5 border-b bg-muted/20 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs">
                    {exIndex + 1}
                  </span>
                  <div>
                    <h4 className="font-bold text-sm leading-tight text-foreground">{exercise.name}</h4>
                    <span className="text-[10px] text-muted-foreground">{exercise.category}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {exercise.previousBest && (
                    <Badge variant="outline" className="text-[10px] font-mono border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1 hidden sm:flex">
                      <Trophy className="h-3 w-3" />
                      Best: {exercise.previousBest.weight}kg × {exercise.previousBest.reps}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveExercise(exercise.id)}
                    className="h-7 w-7 text-muted-foreground hover:text-red-500 rounded-lg"
                    title="Remove exercise"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-3 sm:p-4 space-y-2.5">
                {/* Sets Header Table */}
                <div className="grid grid-cols-12 gap-1.5 text-[11px] font-bold text-muted-foreground uppercase px-1 pb-1">
                  <div className="col-span-2 sm:col-span-1 text-center">Set</div>
                  <div className="col-span-4 sm:col-span-3 text-center">Weight (kg)</div>
                  <div className="col-span-3 sm:col-span-3 text-center">Reps</div>
                  <div className="col-span-3 sm:col-span-5 text-right pr-2">Check</div>
                </div>

                {/* Set Rows */}
                {exercise.sets.map(set => (
                  <div
                    key={set.id}
                    className={`grid grid-cols-12 gap-1.5 items-center p-2 rounded-xl transition-all border ${
                      set.completed 
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-foreground' 
                        : 'bg-background hover:bg-muted/40 border-border/70'
                    }`}
                  >
                    {/* Set Number & Type */}
                    <div className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center">
                      <span className="font-mono font-black text-xs leading-none">{set.setNumber}</span>
                      <span className="text-[8px] text-muted-foreground uppercase font-bold mt-0.5">
                        {set.type.slice(0, 4)}
                      </span>
                    </div>

                    {/* Weight Input with Steppers */}
                    <div className="col-span-4 sm:col-span-3 flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateSet(exercise.id, set.id, 'weightKg', Math.max(0, set.weightKg - 2.5))}
                        className="h-7 w-6 rounded bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0"
                      >
                        -
                      </button>
                      <Input
                        type="number"
                        step="0.5"
                        value={set.weightKg}
                        onChange={e => handleUpdateSet(exercise.id, set.id, 'weightKg', parseFloat(e.target.value) || 0)}
                        className="h-8 text-center text-xs font-mono font-black px-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateSet(exercise.id, set.id, 'weightKg', set.weightKg + 2.5)}
                        className="h-7 w-6 rounded bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0"
                      >
                        +
                      </button>
                    </div>

                    {/* Reps Input with Steppers */}
                    <div className="col-span-3 sm:col-span-3 flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateSet(exercise.id, set.id, 'reps', Math.max(1, set.reps - 1))}
                        className="h-7 w-6 rounded bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0"
                      >
                        -
                      </button>
                      <Input
                        type="number"
                        value={set.reps}
                        onChange={e => handleUpdateSet(exercise.id, set.id, 'reps', parseInt(e.target.value, 10) || 1)}
                        className="h-8 text-center text-xs font-mono font-black px-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateSet(exercise.id, set.id, 'reps', set.reps + 1)}
                        className="h-7 w-6 rounded bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0"
                      >
                        +
                      </button>
                    </div>

                    {/* PR indicator & 1-Tap Checkbox */}
                    <div className="col-span-3 sm:col-span-5 flex items-center justify-end gap-2 pr-1">
                      {set.isPR && (
                        <Badge className="text-[9px] font-black bg-amber-500 text-black animate-pulse gap-1 px-1.5 py-0 hidden sm:flex">
                          <Trophy className="h-2.5 w-2.5" /> NEW PR!
                        </Badge>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleSetComplete(exercise.id, set.id)}
                        className={`h-8 w-12 rounded-xl flex items-center justify-center transition-all border ${
                          set.completed
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                            : 'bg-muted hover:bg-emerald-500/20 text-muted-foreground border-border hover:border-emerald-500/40'
                        }`}
                        title={set.completed ? "Mark uncompleted" : "Complete set and start rest timer"}
                      >
                        <Check className="h-4 w-4" />
                      </button>

                      {exercise.sets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSet(exercise.id, set.id)}
                          className="text-muted-foreground hover:text-red-500 text-xs px-1"
                          title="Delete set"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add Set Button */}
                <div className="pt-1 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddSet(exercise.id)}
                    className="h-7 text-xs font-bold gap-1 text-primary hover:bg-primary/10 rounded-lg"
                  >
                    <Plus className="h-3 w-3" /> Add Set
                  </Button>

                  {/* Rest shortcut */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span>Quick Rest:</span>
                    <button
                      type="button"
                      onClick={() => startRestTimer(60)}
                      className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 font-bold"
                    >
                      60s
                    </button>
                    <button
                      type="button"
                      onClick={() => startRestTimer(90)}
                      className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 font-bold"
                    >
                      90s
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Bottom Add Exercise Bar */}
          <div className="flex items-center justify-center pt-2">
            <Button
              onClick={() => setAddExerciseModalOpen(true)}
              className="h-10 px-6 font-bold text-xs gap-2 rounded-xl shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add Another Exercise
            </Button>
          </div>

          {/* Session Notes & Intensity Card */}
          <Card className="border rounded-2xl bg-card p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-primary" /> Session Intensity & Workout Notes
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">RPE:</span>
                {[6, 7, 8, 9, 10].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setOverallRpe(r)}
                    className={`h-6 w-6 rounded-lg text-xs font-bold font-mono border transition-all ${
                      overallRpe === r 
                        ? 'bg-primary text-primary-foreground border-primary' 
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              placeholder="Notes on client form, progress, areas to focus on next session..."
              value={sessionNotes}
              onChange={e => setSessionNotes(e.target.value)}
              className="text-xs resize-none h-16 rounded-xl"
            />
          </Card>
        </div>
      )}

      {/* MODAL: ADD EXERCISE FROM LIBRARY */}
      <Dialog open={addExerciseModalOpen} onOpenChange={setAddExerciseModalOpen}>
        <DialogContent className="max-w-md rounded-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-primary" /> Exercise Library
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select an exercise from the library or create a custom movement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 flex-1 overflow-y-auto">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search exercise by name..."
                value={exerciseSearch}
                onChange={e => setExerciseSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Muscle Category Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
              {['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms & Core', 'Conditioning'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold shrink-0 transition-all ${
                    selectedCategory === cat 
                      ? 'bg-primary text-primary-foreground border-primary' 
                      : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Exercises List */}
            <div className="divide-y border rounded-xl max-h-56 overflow-y-auto bg-background">
              {filteredCatalog.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">No exercises match search.</p>
              ) : (
                filteredCatalog.map(item => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => handleAddExercise(item.name, item.category)}
                    className="w-full text-left p-2.5 hover:bg-muted/60 transition-colors flex items-center justify-between text-xs group"
                  >
                    <div>
                      <p className="font-bold text-foreground group-hover:text-primary transition-colors">{item.name}</p>
                      <span className="text-[10px] text-muted-foreground">{item.category}</span>
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))
              )}
            </div>

            {/* Custom Exercise Box */}
            <div className="pt-2 border-t space-y-2">
              <Label className="text-xs font-bold">Or Add Custom Movement</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="e.g. Deficit Trap Bar Deadlift..."
                  value={customExerciseName}
                  onChange={e => setCustomExerciseName(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  onClick={() => handleAddExercise(customExerciseName, 'Custom')}
                  disabled={!customExerciseName.trim()}
                  className="h-8 text-xs font-bold shrink-0"
                >
                  Add Custom
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddExerciseModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: CLIENT PICKER */}
      <Dialog open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Select Training Member
            </DialogTitle>
            <DialogDescription className="text-xs">
              Choose the member you are training in this floor session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search member by name, phone..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <div className="divide-y border rounded-xl max-h-60 overflow-y-auto bg-background">
              {clients
                .filter(c => 
                  !clientSearch.trim() || 
                  (c.name && c.name.toLowerCase().includes(clientSearch.toLowerCase())) ||
                  (c.phone && c.phone.includes(clientSearch))
                )
                .slice(0, 20)
                .map(client => {
                  const isSelected = selectedClient?.id === client.id;
                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => {
                        setSelectedClient(client);
                        setClientPickerOpen(false);
                      }}
                      className={`w-full text-left p-2.5 transition-colors flex items-center justify-between text-xs ${
                        isSelected ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted/60'
                      }`}
                    >
                      <div>
                        <p className="font-bold">{client.name || 'Member'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {client.packageType || 'Personal Training'} • {client.phone || 'No phone'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px]">
                          {client.sessionsRemaining ?? client.ptSessionsRemaining ?? 0} sessions
                        </Badge>
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: WORKOUT COMPLETE CELEBRATION SUMMARY */}
      <Dialog open={Boolean(completionSummary)} onOpenChange={open => !open && onExit()}>
        {completionSummary && (
          <DialogContent className="max-w-md rounded-2xl text-center">
            <div className="space-y-4 py-3">
              <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mx-auto animate-bounce">
                <Trophy className="h-8 w-8" />
              </div>

              <div>
                <h3 className="text-xl font-black tracking-tight text-foreground">Workout Complete!</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Session with <strong>{selectedClient?.name}</strong> successfully logged and saved!
                </p>
              </div>

              {/* Stats Highlights */}
              <div className="grid grid-cols-3 gap-2 bg-muted/40 p-3 rounded-2xl border">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Duration</span>
                  <span className="text-base font-black text-foreground">{completionSummary.durationMinutes}m</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Volume</span>
                  <span className="text-base font-black text-primary">{completionSummary.totalVolumeKg.toLocaleString()} kg</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Sets Done</span>
                  <span className="text-base font-black text-foreground">{completionSummary.totalSets}</span>
                </div>
              </div>

              {/* PRs Achieved */}
              {completionSummary.newPrs.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-300/50 rounded-2xl text-left space-y-1.5">
                  <span className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Award className="h-4 w-4" /> Personal Records Broken:
                  </span>
                  <div className="space-y-1">
                    {completionSummary.newPrs.map((pr, i) => (
                      <div key={i} className="text-xs font-semibold flex items-center justify-between">
                        <span>{pr.exercise}</span>
                        <Badge className="bg-amber-500 text-black font-mono font-bold text-[10px]">
                          {pr.weight} kg × {pr.reps}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                onClick={onExit}
                className="w-full font-bold text-xs h-10 rounded-xl"
              >
                Back to Dashboard
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
