import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, onSnapshot 
} from 'firebase/firestore';
import { Client, Session } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  Play, Pause, Plus, Check, Trash2, Trophy, 
  Dumbbell, Timer, Flame, ArrowLeft, Search, User, 
  Sparkles, CheckCircle2, Award, BookmarkPlus, Send, Calendar, Info, Eye, FolderPlus
} from 'lucide-react';
import { toast } from 'sonner';
import {
  FULL_EXERCISE_CATALOG,
  ExerciseCatalogItem,
  ExerciseCategory,
  ExerciseEquipment
} from '../data/exerciseLibraryData';

export type EquipmentType = ExerciseEquipment;

export function inferEquipment(name: string): EquipmentType {
  const n = name.toLowerCase();
  if (n.includes('ring') || n.includes('band') || n.includes('trx')) return 'Bands & Rings';
  if (n.includes('barbell') || (n.includes('squat') && !n.includes('split') && !n.includes('pistol') && !n.includes('shrimp') && !n.includes('sissy') && !n.includes('bodyweight')) || n.includes('deadlift') || n.includes('t-bar') || n.includes('skull') || n.includes('upright row')) return 'Barbell';
  if (n.includes('dumbbell') || n.includes('arnold') || n.includes('rear delt') || n.includes('split squat') || n.includes('walking lunges')) return 'Dumbbell';
  if (n.includes('cable') || n.includes('face pull') || n.includes('rope pushdown') || n.includes('overhead tricep')) return 'Cable';
  if (n.includes('kettlebell')) return 'Kettlebell';
  if (
    n.includes('machine') ||
    n.includes('leg press') ||
    n.includes('leg extension') ||
    n.includes('leg curl') ||
    n.includes('lat pulldown') ||
    n.includes('assault bike') ||
    n.includes('rowing') ||
    n.includes('skierg') ||
    n.includes('sled') ||
    n.includes('calf raises')
  ) {
    return 'Machine';
  }
  return 'Bodyweight';
}

export function calculateEpley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weightKg);
  return Math.round(weightKg * (1 + reps / 30));
}

export interface TemplateExerciseItem {
  name: string;
  category: string;
  equipment?: string;
  targetSets: number;
  targetReps: number;
  targetWeightKg: number;
  notes?: string;
  gifUrl?: string;
  instructions?: string[];
}

export interface WorkoutTemplateRecord {
  id: string;
  name: string;
  category: string;
  description?: string;
  isBuiltIn?: boolean;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
  items: TemplateExerciseItem[];
}

export interface AssignedWorkoutRecord {
  id: string;
  clientId: string;
  clientName: string;
  coachId: string;
  coachName: string;
  title: string;
  templateName?: string;
  scheduledDate: string;
  coachNotes?: string;
  status: 'Assigned' | 'Completed';
  createdAt: string;
  completedAt?: string;
  exercises: TemplateExerciseItem[];
}

const BUILTIN_WORKOUT_TEMPLATES: WorkoutTemplateRecord[] = [
  {
    id: 'builtin_cali_statics',
    name: 'Calisthenics Statics (Planche & Lever)',
    category: 'Calisthenics',
    description: 'Straight-arm scapular strength, Planche progressions, Front Lever holds & L-Sit.',
    isBuiltIn: true,
    items: [
      { name: 'Planche Lean (Floor / Parallettes)', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 4, targetReps: 15, targetWeightKg: 0, notes: '15s hold per set, protract scapulae' },
      { name: 'Tuck Planche Hold', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 4, targetReps: 10, targetWeightKg: 0, notes: '10s hold with locked elbows' },
      { name: 'Tuck Front Lever Hold', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 4, targetReps: 12, targetWeightKg: 0, notes: 'Depress scapulae, flat torso' },
      { name: 'Pseudo Planche Push-Up (PPPU)', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 3, targetReps: 8, targetWeightKg: 0 },
      { name: 'L-Sit Hold (Floor / Parallettes / Bars)', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 3, targetReps: 15, targetWeightKg: 0, notes: '15s hold, knees locked' }
    ]
  },
  {
    id: 'builtin_cali_upper_rings',
    name: 'Calisthenics Upper & Rings',
    category: 'Calisthenics',
    description: 'Explosive bar & ring upper body skills: Muscle-Ups, HSPU, RTO Dips & Dragon Flags.',
    isBuiltIn: true,
    items: [
      { name: 'Bar Muscle-Up (Strict / Kipping)', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 4, targetReps: 5, targetWeightKg: 0 },
      { name: 'Chest-to-Wall Handstand Push-Up (HSPU)', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 4, targetReps: 6, targetWeightKg: 0 },
      { name: 'Ring Dip (RTO Top Support)', category: 'Calisthenics', equipment: 'Bands & Rings', targetSets: 3, targetReps: 8, targetWeightKg: 0 },
      { name: 'Archer Pull-Up', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 3, targetReps: 6, targetWeightKg: 0 },
      { name: 'Dragon Flag (Full / Negatives)', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 3, targetReps: 6, targetWeightKg: 0 }
    ]
  },
  {
    id: 'builtin_cali_legs',
    name: 'Calisthenics Lower Body & Mobility',
    category: 'Calisthenics',
    description: 'Single-leg knee & hamstring mastery: Pistol Squats, Shrimp Squats & Nordic Curls.',
    isBuiltIn: true,
    items: [
      { name: 'Pistol Squat (Single-Leg Squat)', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 4, targetReps: 6, targetWeightKg: 0 },
      { name: 'Nordic Hamstring Curl', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 4, targetReps: 6, targetWeightKg: 0 },
      { name: 'Shrimp Squat (Beginner / Intermediate / Advanced)', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 3, targetReps: 8, targetWeightKg: 0 },
      { name: 'Sissy Squat (Bodyweight Quad Isolation)', category: 'Calisthenics', equipment: 'Bodyweight', targetSets: 3, targetReps: 10, targetWeightKg: 0 }
    ]
  },
  {
    id: 'builtin_push',
    name: 'Push Day (Chest, Shoulders & Triceps)',
    category: 'Chest',
    description: 'Classic strength & hypertrophy pressing session.',
    isBuiltIn: true,
    items: [
      { name: 'Barbell Bench Press', category: 'Chest', equipment: 'Barbell', targetSets: 4, targetReps: 8, targetWeightKg: 60 },
      { name: 'Dumbbell Incline Bench Press', category: 'Chest', equipment: 'Dumbbell', targetSets: 3, targetReps: 10, targetWeightKg: 22.5 },
      { name: 'Barbell Seated Overhead Press', category: 'Shoulders', equipment: 'Barbell', targetSets: 3, targetReps: 8, targetWeightKg: 40 },
      { name: 'Cable Pushdown (With Rope Attachment)', category: 'Arms & Core', equipment: 'Cable', targetSets: 3, targetReps: 12, targetWeightKg: 25 }
    ]
  },
  {
    id: 'builtin_pull',
    name: 'Pull Day (Back & Biceps)',
    category: 'Back',
    description: 'Posterior chain & vertical/horizontal pulling hypertrophy.',
    isBuiltIn: true,
    items: [
      { name: 'Barbell Deadlift', category: 'Back', equipment: 'Barbell', targetSets: 4, targetReps: 5, targetWeightKg: 100 },
      { name: 'Cable Pulldown', category: 'Back', equipment: 'Cable', targetSets: 3, targetReps: 10, targetWeightKg: 55 },
      { name: 'Cable Seated Row', category: 'Back', equipment: 'Cable', targetSets: 3, targetReps: 10, targetWeightKg: 50 },
      { name: 'Barbell Curl', category: 'Arms & Core', equipment: 'Barbell', targetSets: 3, targetReps: 10, targetWeightKg: 30 }
    ]
  },
  {
    id: 'builtin_legs',
    name: 'Leg Day (Squat & Posterior Chain)',
    category: 'Legs',
    description: 'Lower body strength and hypertrophy builder.',
    isBuiltIn: true,
    items: [
      { name: 'Barbell Full Squat', category: 'Legs', equipment: 'Barbell', targetSets: 4, targetReps: 6, targetWeightKg: 80 },
      { name: 'Barbell Romanian Deadlift', category: 'Legs', equipment: 'Barbell', targetSets: 3, targetReps: 8, targetWeightKg: 70 },
      { name: 'Sled 45° Leg Press', category: 'Legs', equipment: 'Machine', targetSets: 3, targetReps: 10, targetWeightKg: 140 },
      { name: 'Dumbbell Single Leg Split Squat', category: 'Legs', equipment: 'Dumbbell', targetSets: 3, targetReps: 10, targetWeightKg: 16 }
    ]
  },
  {
    id: 'builtin_hiit',
    name: 'Full Body HIIT & Conditioning',
    category: 'Conditioning',
    description: 'High-output metabolic conditioning circuit.',
    isBuiltIn: true,
    items: [
      { name: 'Kettlebell Swing', category: 'Conditioning', equipment: 'Kettlebell', targetSets: 4, targetReps: 15, targetWeightKg: 20 },
      { name: 'Box Jump (Multiple Response)', category: 'Conditioning', equipment: 'Bodyweight', targetSets: 4, targetReps: 10, targetWeightKg: 0 },
      { name: 'Battling Ropes', category: 'Conditioning', equipment: 'Bodyweight', targetSets: 4, targetReps: 30, targetWeightKg: 0 },
      { name: 'Front Plank', category: 'Arms & Core', equipment: 'Bodyweight', targetSets: 3, targetReps: 45, targetWeightKg: 0 }
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
  equipment?: string;
  gifUrl?: string;
  instructions?: string[];
  previousBest?: { weight: number; reps: number; date: string };
  sets: WorkoutSet[];
  notes?: string;
}

interface CoachFloorModeProps {
  initialClient?: Client | null;
  initialSession?: Session | null;
  onExit: () => void;
}

// Fast lookup map by lowercase exercise name for ExerciseDB metadata
const CATALOG_BY_NAME = new Map<string, ExerciseCatalogItem>();
FULL_EXERCISE_CATALOG.forEach(item => {
  CATALOG_BY_NAME.set(item.name.toLowerCase(), item);
});

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

  // ALL useState declarations FIRST (prevents TDZ on minification)
  const [selectedClient, setSelectedClient] = useState<Client | null>(initialClient || null);
  const [activeSession] = useState<Session | null>(initialSession || null);
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

  // Logged Exercises on the Floor
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [expandedDemoExId, setExpandedDemoExId] = useState<string | null>(null);

  // Exercise Library Modal State
  const [addExerciseModalOpen, setAddExerciseModalOpen] = useState(false);
  const [libraryPickerTarget, setLibraryPickerTarget] = useState<'floor' | 'template'>('floor');
  const [selectedCategory, setSelectedCategory] = useState<'All' | ExerciseCategory>('All');
  const [selectedEquipment, setSelectedEquipment] = useState<'All' | EquipmentType>('All');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [visibleCatalogLimit, setVisibleCatalogLimit] = useState(60);
  const [previewCatalogItem, setPreviewCatalogItem] = useState<ExerciseCatalogItem | null>(null);
  const [customExerciseName, setCustomExerciseName] = useState('');
  const [customExerciseCategory, setCustomExerciseCategory] = useState<ExerciseCategory>('Calisthenics');

  // Custom Templates & Builder Modal State
  const [customTemplates, setCustomTemplates] = useState<WorkoutTemplateRecord[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState<string>('Calisthenics');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [newTemplateItems, setNewTemplateItems] = useState<TemplateExerciseItem[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Assign Workout to Client Modal State
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignClientId, setAssignClientId] = useState<string>(initialClient?.id || '');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDate, setAssignDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assignNotes, setAssignNotes] = useState('');
  const [assignItems, setAssignItems] = useState<TemplateExerciseItem[]>([]);
  const [isAssigningWorkout, setIsAssigningWorkout] = useState(false);

  // Client's Currently Assigned Workouts
  const [clientAssignedWorkouts, setClientAssignedWorkouts] = useState<AssignedWorkoutRecord[]>([]);

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

  const restTimerRef = useRef<any>(null);

  // Sync assignClientId when selectedClient changes
  useEffect(() => {
    if (selectedClient?.id) {
      setAssignClientId(selectedClient.id);
    }
  }, [selectedClient?.id]);

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

  // 2. Real-time Custom Workout Templates listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'workoutTemplates'),
      (snap) => {
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          isBuiltIn: false
        } as WorkoutTemplateRecord));
        list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setCustomTemplates(list);
      },
      (err) => {
        console.warn("Could not load custom workout templates:", err);
      }
    );
    return () => unsub();
  }, []);

  // 3. Real-time Assigned Workouts listener for selectedClient
  useEffect(() => {
    if (!selectedClient?.id) {
      setClientAssignedWorkouts([]);
      return;
    }
    const q = query(collection(db, 'assignedWorkouts'), where('clientId', '==', selectedClient.id));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedWorkoutRecord));
        list.sort((a, b) => String(b.scheduledDate || b.createdAt || '').localeCompare(String(a.scheduledDate || a.createdAt || '')));
        setClientAssignedWorkouts(list);
      },
      (err) => {
        console.warn("Could not load client assigned workouts:", err);
      }
    );
    return () => unsub();
  }, [selectedClient?.id]);

  // 4. Fetch client's PR history when client selected
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

  // 5. Stopwatch Interval
  useEffect(() => {
    let interval: any;
    if (isStopwatchRunning) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isStopwatchRunning]);

  // 6. Rest Timer Interval
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

  // All templates combined (Custom first, then Built-in)
  const allTemplates = useMemo(() => {
    return [...customTemplates, ...BUILTIN_WORKOUT_TEMPLATES];
  }, [customTemplates]);

  // Category counts for the Exercise Library
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: FULL_EXERCISE_CATALOG.length };
    FULL_EXERCISE_CATALOG.forEach(ex => {
      counts[ex.category] = (counts[ex.category] || 0) + 1;
    });
    return counts;
  }, []);

  // Filtered 1,585-exercise catalog
  const filteredCatalog = useMemo(() => {
    const q = exerciseSearch.trim().toLowerCase();
    return FULL_EXERCISE_CATALOG.filter(item => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (selectedEquipment !== 'All' && item.equipment !== selectedEquipment) return false;
      if (q) {
        const inName = item.name.toLowerCase().includes(q);
        const inTarget = (item.target || '').toLowerCase().includes(q);
        const inSecondary = (item.secondary || []).some(s => s.toLowerCase().includes(q));
        return inName || inTarget || inSecondary;
      }
      return true;
    });
  }, [selectedCategory, selectedEquipment, exerciseSearch]);

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

  // Add Exercise to Floor Workout OR Template Builder
  const handleSelectCatalogExercise = (item: ExerciseCatalogItem) => {
    if (libraryPickerTarget === 'template') {
      const defaultWeight = item.equipment === 'Bodyweight' || item.equipment === 'Bands & Rings' ? 0 : 20;
      setNewTemplateItems(prev => [
        ...prev,
        {
          name: item.name,
          category: item.category,
          equipment: item.equipment,
          targetSets: 3,
          targetReps: 10,
          targetWeightKg: defaultWeight,
          gifUrl: item.gifUrl,
          instructions: item.instructions
        }
      ]);
      toast.success(`Added "${item.name}" to template`);
      return;
    }

    handleAddExercise(item.name, item.category, item);
  };

  // Add Exercise to Live Floor Workout
  const handleAddExercise = (name: string, category: string, catalogMeta?: ExerciseCatalogItem) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const meta = catalogMeta || CATALOG_BY_NAME.get(trimmedName.toLowerCase());
    const previousBest = clientPrs[trimmedName.toLowerCase()];
    const isBodyweight =
      meta?.equipment === 'Bodyweight' ||
      meta?.equipment === 'Bands & Rings' ||
      category === 'Calisthenics';

    const newEx: WorkoutExercise = {
      id: `ex_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: trimmedName,
      category: meta?.category || category,
      equipment: meta?.equipment || inferEquipment(trimmedName),
      gifUrl: meta?.gifUrl,
      instructions: meta?.instructions,
      previousBest,
      sets: [
        {
          id: `set_1_${Date.now()}`,
          setNumber: 1,
          type: 'Working',
          weightKg: previousBest ? previousBest.weight : isBodyweight ? 0 : 40,
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

  // Load 1-Tap Workout Program Template onto the Floor
  const handleApplyTemplate = (template: WorkoutTemplateRecord) => {
    const now = Date.now();
    const mappedExercises: WorkoutExercise[] = template.items.map((item, idx) => {
      const meta = CATALOG_BY_NAME.get(item.name.toLowerCase());
      const previousBest = clientPrs[item.name.toLowerCase()];
      const isBodyweight =
        item.equipment === 'Bodyweight' ||
        item.equipment === 'Bands & Rings' ||
        item.category === 'Calisthenics' ||
        meta?.equipment === 'Bodyweight';
      const baseWeight = previousBest
        ? previousBest.weight
        : item.targetWeightKg !== undefined
        ? item.targetWeightKg
        : isBodyweight
        ? 0
        : 40;
      const baseReps = previousBest ? previousBest.reps : item.targetReps || 10;
      const numSets = Math.max(1, item.targetSets || 3);

      return {
        id: `ex_${now}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
        name: item.name,
        category: item.category,
        equipment: item.equipment || meta?.equipment || inferEquipment(item.name),
        gifUrl: item.gifUrl || meta?.gifUrl,
        instructions: item.instructions || meta?.instructions,
        notes: item.notes,
        previousBest,
        sets: Array.from({ length: numSets }, (_, sIdx) => ({
          id: `set_${sIdx + 1}_${now}_${idx}`,
          setNumber: sIdx + 1,
          type: 'Working' as const,
          weightKg: baseWeight,
          reps: baseReps,
          rpe: 8,
          completed: false
        }))
      };
    });

    setExercises(prev => [...prev, ...mappedExercises]);
    toast.success(`Loaded "${template.name}" (${mappedExercises.length} exercises)`);
  };

  // Open "Save Current Floor Workout as Template"
  const handleOpenSaveFloorAsTemplate = () => {
    if (exercises.length === 0) {
      toast.error('Add at least one exercise first');
      return;
    }
    const items: TemplateExerciseItem[] = exercises.map(ex => ({
      name: ex.name,
      category: ex.category,
      equipment: ex.equipment,
      targetSets: ex.sets.length,
      targetReps: ex.sets[0]?.reps || 10,
      targetWeightKg: ex.sets[0]?.weightKg ?? 0,
      notes: ex.notes,
      gifUrl: ex.gifUrl,
      instructions: ex.instructions
    }));
    setNewTemplateName('');
    setNewTemplateCategory(exercises[0]?.category || 'Calisthenics');
    setNewTemplateDesc(sessionNotes || '');
    setNewTemplateItems(items);
    setTemplateModalOpen(true);
  };

  // Open Blank Template Creator
  const handleOpenCreateTemplateModal = () => {
    setNewTemplateName('');
    setNewTemplateCategory('Calisthenics');
    setNewTemplateDesc('');
    setNewTemplateItems([]);
    setTemplateModalOpen(true);
  };

  // Save Custom Template to Firestore
  const handleSaveCustomTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (newTemplateItems.length === 0) {
      toast.error('Please add at least one exercise to the template');
      return;
    }
    setIsSavingTemplate(true);
    try {
      await addDoc(collection(db, 'workoutTemplates'), {
        name: newTemplateName.trim(),
        category: newTemplateCategory,
        description: newTemplateDesc.trim(),
        createdBy: currentUser?.id || '',
        createdByName: currentUser?.name || 'Coach',
        createdAt: new Date().toISOString(),
        items: newTemplateItems.map(item => ({
          name: item.name,
          category: item.category,
          equipment: item.equipment || inferEquipment(item.name),
          targetSets: Number(item.targetSets) || 3,
          targetReps: Number(item.targetReps) || 10,
          targetWeightKg: Number(item.targetWeightKg) || 0,
          notes: item.notes || '',
          gifUrl: item.gifUrl || '',
          instructions: item.instructions || []
        }))
      });
      toast.success(`Template "${newTemplateName.trim()}" saved!`);
      setTemplateModalOpen(false);
    } catch (err: any) {
      console.error('Error saving workout template:', err);
      toast.error('Failed to save template: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Delete Custom Template
  const handleDeleteCustomTemplate = async (templateId: string, name: string) => {
    try {
      await deleteDoc(doc(db, 'workoutTemplates', templateId));
      toast.success(`Deleted template "${name}"`);
    } catch (err: any) {
      console.error('Error deleting template:', err);
      toast.error('Could not delete template');
    }
  };

  // Open Assign Workout Modal from a Template
  const handleOpenAssignFromTemplate = (template: WorkoutTemplateRecord) => {
    setAssignClientId(selectedClient?.id || '');
    setAssignTitle(template.name);
    setAssignDate(new Date().toISOString().slice(0, 10));
    setAssignNotes(template.description || '');
    setAssignItems(
      template.items.map(i => {
        const meta = CATALOG_BY_NAME.get(i.name.toLowerCase());
        return {
          ...i,
          gifUrl: i.gifUrl || meta?.gifUrl,
          instructions: i.instructions || meta?.instructions
        };
      })
    );
    setAssignModalOpen(true);
  };

  // Open Assign Workout Modal from Current Floor Workout
  const handleOpenAssignFromFloor = () => {
    if (exercises.length === 0) {
      toast.error('Add exercises to the workout or pick a template to assign');
      return;
    }
    setAssignClientId(selectedClient?.id || '');
    setAssignTitle(`${selectedClient?.name ? `${selectedClient.name.split(' ')[0]}'s ` : ''}Custom Workout`);
    setAssignDate(new Date().toISOString().slice(0, 10));
    setAssignNotes(sessionNotes || '');
    setAssignItems(
      exercises.map(ex => ({
        name: ex.name,
        category: ex.category,
        equipment: ex.equipment,
        targetSets: ex.sets.length,
        targetReps: ex.sets[0]?.reps || 10,
        targetWeightKg: ex.sets[0]?.weightKg ?? 0,
        notes: ex.notes,
        gifUrl: ex.gifUrl,
        instructions: ex.instructions
      }))
    );
    setAssignModalOpen(true);
  };

  // Confirm Assign Workout to Client -> Writes to `assignedWorkouts` + `notifications`
  const handleConfirmAssignWorkout = async () => {
    const targetClient = clients.find(c => c.id === assignClientId) || selectedClient;
    if (!targetClient) {
      toast.error('Please select a client to assign this workout to');
      return;
    }
    if (!assignTitle.trim()) {
      toast.error('Please enter a workout title');
      return;
    }
    if (assignItems.length === 0) {
      toast.error('Workout must include at least one exercise');
      return;
    }

    setIsAssigningWorkout(true);
    try {
      const sanitizedExercises = assignItems.map(item => {
        const meta = CATALOG_BY_NAME.get(item.name.toLowerCase());
        return {
          name: item.name,
          category: item.category,
          equipment: item.equipment || meta?.equipment || inferEquipment(item.name),
          targetSets: Number(item.targetSets) || 3,
          targetReps: Number(item.targetReps) || 10,
          targetWeightKg: Number(item.targetWeightKg) || 0,
          notes: item.notes || '',
          gifUrl: item.gifUrl || meta?.gifUrl || '',
          instructions: item.instructions || meta?.instructions || []
        };
      });

      await addDoc(collection(db, 'assignedWorkouts'), {
        clientId: targetClient.id,
        clientName: targetClient.name || 'Member',
        coachId: currentUser?.id || '',
        coachName: currentUser?.name || 'Coach',
        title: assignTitle.trim(),
        scheduledDate: assignDate,
        coachNotes: assignNotes.trim(),
        exercises: sanitizedExercises,
        status: 'Assigned',
        createdAt: new Date().toISOString()
      });

      // Send in-app notification to the client
      await addDoc(collection(db, 'notifications'), {
        recipientId: targetClient.id,
        clientId: targetClient.id,
        title: `New Workout Assigned: ${assignTitle.trim()}`,
        body: `Coach ${currentUser?.name || 'Trainer'} assigned "${assignTitle.trim()}" (${sanitizedExercises.length} exercises) for ${assignDate}. Open your Member Portal to view your workout!`,
        type: 'workout_assigned',
        read: false,
        createdAt: new Date().toISOString()
      });

      toast.success(`Assigned "${assignTitle.trim()}" to ${targetClient.name}!`);
      setAssignModalOpen(false);
    } catch (err: any) {
      console.error('Error assigning workout to client:', err);
      toast.error('Failed to assign workout: ' + (err.message || 'Unknown error'));
    } finally {
      setIsAssigningWorkout(false);
    }
  };

  // Delete an assigned workout
  const handleDeleteAssignedWorkout = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'assignedWorkouts', id));
      toast.success('Removed assigned workout');
    } catch (err) {
      console.error('Error removing assigned workout:', err);
    }
  };

  // Remove Exercise from Floor
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
        weightKg: lastSet?.weightKg ?? 0,
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
      if (ex.sets.length <= 1) return ex;
      const filtered = ex.sets.filter(s => s.id !== setId);
      return {
        ...ex,
        sets: filtered.map((s, idx) => ({ ...s, setNumber: idx + 1 }))
      };
    }));
  };

  // Auto-Progression (+2.5kg Overload)
  const handleApplyOverload = (exerciseId: string) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exerciseId || !ex.previousBest) return ex;
      const targetWeight = ex.previousBest.weight + 2.5;
      return {
        ...ex,
        sets: ex.sets.map(s => {
          if (s.type !== 'Working') return s;
          return {
            ...s,
            weightKg: targetWeight,
            isPR: targetWeight > ex.previousBest!.weight
          };
        })
      };
    }));
  };

  // Live Muscle Volume & Recovery Breakdown
  const muscleVolumeMap = useMemo(() => {
    const categories = ['Calisthenics', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms & Core', 'Conditioning'];
    const map: Record<string, { sets: number; volumeKg: number; status: 'Warming Up' | 'Optimal Stimulus' | 'High Fatigue' }> = {};
    categories.forEach(cat => {
      map[cat] = { sets: 0, volumeKg: 0, status: 'Warming Up' };
    });

    exercises.forEach(ex => {
      const entry = map[ex.category] ?? map['Conditioning']!;
      ex.sets.forEach(s => {
        if (s.completed) {
          entry.sets += 1;
          entry.volumeKg += s.weightKg * s.reps;
        }
      });
    });

    Object.keys(map).forEach(cat => {
      const entry = map[cat];
      if (!entry) return;
      const count = entry.sets;
      if (count >= 11) entry.status = 'High Fatigue';
      else if (count >= 4) entry.status = 'Optimal Stimulus';
      else entry.status = 'Warming Up';
    });

    return map;
  }, [exercises]);

  // Finish Workout Session
  const handleFinishWorkout = async () => {
    if (!selectedClient || !currentUser) return;
    setIsFinishing(true);

    try {
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
            if (s.weightKg > prev && s.weightKg > 0) {
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

      const shouldDeductSession =
        !activeSession ||
        (!(activeSession as any).deductedOnBook && activeSession.status === 'Scheduled');

      const currentRemaining = selectedClient.sessionsRemaining ?? selectedClient.ptSessionsRemaining;
      if (shouldDeductSession && typeof currentRemaining === 'number' && currentRemaining > 0) {
        const nextBal = currentRemaining - 1;
        await updateDoc(doc(db, 'clients', selectedClient.id), {
          sessionsRemaining: nextBal
        });

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
        <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
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

          {exercises.length > 0 && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenSaveFloorAsTemplate}
                className="h-9 px-3 text-xs font-bold gap-1.5 rounded-xl border-primary/30 text-primary hover:bg-primary/10"
                title="Save these exercises as a reusable Coach Template"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Save Template</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenAssignFromFloor}
                className="h-9 px-3 text-xs font-bold gap-1.5 rounded-xl border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                title="Assign this workout to client so they see it in their Member Portal"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Assign to Client</span>
              </Button>
            </>
          )}

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

      {/* Workout Templates & Client Assignment Hub */}
      <div className="bg-card/70 border rounded-2xl p-3.5 space-y-2.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
              Coach Workout Templates ({allTemplates.length})
            </span>
            <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-bold">
              1,585 Exercises + Calisthenics
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenCreateTemplateModal}
              className="h-7 text-[11px] font-bold px-2.5 rounded-lg gap-1 border-primary/40 text-primary hover:bg-primary/10"
            >
              <FolderPlus className="h-3.5 w-3.5" /> + Create Template
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setLibraryPickerTarget('floor');
                setAddExerciseModalOpen(true);
              }}
              className="h-7 text-[11px] font-bold px-2.5 rounded-lg gap-1"
            >
              <Dumbbell className="h-3.5 w-3.5" /> Browse Library
            </Button>
          </div>
        </div>

        {/* Templates Pill Bar with Load + Assign to Client actions */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {allTemplates.map(tpl => (
            <div
              key={tpl.id}
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 shrink-0 transition-all ${
                tpl.category === 'Calisthenics'
                  ? 'bg-emerald-500/5 border-emerald-500/30'
                  : 'bg-background border-border/80'
              }`}
            >
              <button
                type="button"
                onClick={() => handleApplyTemplate(tpl)}
                className="text-left group pr-1"
                title="Tap to load template into live floor session"
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    + {tpl.name}
                  </span>
                  {!tpl.isBuiltIn && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/40 text-primary">
                      Custom
                    </Badge>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground block">
                  {tpl.category} • {tpl.items.length} exercises
                </span>
              </button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenAssignFromTemplate(tpl)}
                className="h-6 px-2 text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 rounded-lg gap-1"
                title="Assign this template to a client"
              >
                <Send className="h-2.5 w-2.5" /> Assign
              </Button>

              {!tpl.isBuiltIn && (
                <button
                  type="button"
                  onClick={() => handleDeleteCustomTemplate(tpl.id, tpl.name)}
                  className="text-muted-foreground hover:text-red-500 p-1 rounded"
                  title="Delete custom template"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Selected Client's Upcoming Assigned Workouts */}
        {selectedClient && clientAssignedWorkouts.length > 0 && (
          <div className="pt-2 border-t flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Assigned to {selectedClient.name.split(' ')[0]}:
            </span>
            {clientAssignedWorkouts.slice(0, 4).map(aw => (
              <div
                key={aw.id}
                className="inline-flex items-center gap-1.5 text-[11px] bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-0.5"
              >
                <button
                  type="button"
                  onClick={() =>
                    handleApplyTemplate({
                      id: aw.id,
                      name: aw.title,
                      category: aw.exercises[0]?.category || 'Custom',
                      items: aw.exercises
                    })
                  }
                  className="font-bold text-foreground hover:text-primary"
                  title="Click to load this assigned workout into Floor Mode"
                >
                  {aw.title} ({aw.scheduledDate})
                </button>
                <Badge variant="outline" className="text-[8px] px-1 py-0">
                  {aw.status}
                </Badge>
                <button
                  type="button"
                  onClick={() => handleDeleteAssignedWorkout(aw.id)}
                  className="text-muted-foreground hover:text-red-500"
                  title="Remove assignment"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Trained Muscle Volume & Stimulus Bar */}
      {exercises.length > 0 && (
        <Card className="border rounded-2xl bg-card p-3.5 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
              <Flame className="h-4 w-4 text-primary" /> Trained Muscle Volume & Stimulus
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              Live Set & Volume Breakdown
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {Object.entries(muscleVolumeMap).map(([cat, stats]) => {
              const isActive = stats.sets > 0;
              const badgeColor =
                stats.status === 'High Fatigue'
                  ? 'bg-red-500/15 text-red-600 border-red-500/30'
                  : stats.status === 'Optimal Stimulus'
                  ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-600 border-amber-500/30';
              return (
                <div
                  key={cat}
                  className={`p-2 rounded-xl border text-xs transition-all ${
                    isActive ? 'bg-primary/5 border-primary/30' : 'bg-muted/20 border-border/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold truncate text-[11px]">{cat}</span>
                    <span className="font-mono font-black text-[11px] text-primary">{stats.sets}s</span>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {stats.volumeKg.toLocaleString()} kg
                  </div>
                  {isActive && (
                    <Badge variant="outline" className={`mt-1 text-[9px] px-1.5 py-0 font-bold ${badgeColor}`}>
                      {stats.status}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Main Exercises List or Empty State */}
      {exercises.length === 0 ? (
        <Card className="border-dashed bg-muted/20 p-8 text-center rounded-2xl">
          <div className="max-w-md mx-auto space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary">
              <Dumbbell className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-base">Ready on the Gym Floor!</h3>
            <p className="text-xs text-muted-foreground">
              Browse <strong>1,585 Gym & Calisthenics exercises</strong> (with animated form demos), apply a template, or build & assign a workout program to your client.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button
                onClick={() => {
                  setLibraryPickerTarget('floor');
                  setAddExerciseModalOpen(true);
                }}
                className="h-9 px-4 text-xs font-bold gap-1.5 rounded-xl shadow-sm"
              >
                <Plus className="h-4 w-4" /> Add Exercise from Library
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenCreateTemplateModal}
                className="h-9 px-4 text-xs font-bold gap-1.5 rounded-xl"
              >
                <FolderPlus className="h-4 w-4" /> Create Workout Template
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {exercises.map((exercise, exIndex) => {
            const isDemoExpanded = expandedDemoExId === exercise.id;
            return (
              <Card key={exercise.id} className="border shadow-sm rounded-2xl overflow-hidden bg-card">
                <CardHeader className="p-3.5 pb-2.5 border-b bg-muted/20 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs">
                      {exIndex + 1}
                    </span>
                    <div>
                      <h4 className="font-bold text-sm leading-tight text-foreground">{exercise.name}</h4>
                      <span className="text-[10px] text-muted-foreground">
                        {exercise.category} {exercise.equipment ? `• ${exercise.equipment}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {(exercise.gifUrl || (exercise.instructions && exercise.instructions.length > 0)) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedDemoExId(isDemoExpanded ? null : exercise.id)}
                        className="h-6 px-2 text-[10px] font-bold rounded-lg gap-1"
                      >
                        <Eye className="h-3 w-3" /> {isDemoExpanded ? 'Hide Guide' : 'Demo & Cues'}
                      </Button>
                    )}
                    {exercise.previousBest && (
                      <>
                        <Badge variant="outline" className="text-[10px] font-mono border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1">
                          <Trophy className="h-3 w-3" />
                          Prev Best: {exercise.previousBest.weight}kg × {exercise.previousBest.reps} (1RM ~{calculateEpley1RM(exercise.previousBest.weight, exercise.previousBest.reps)}kg)
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleApplyOverload(exercise.id)}
                          className="h-6 px-2 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                        >
                          +2.5kg Overload
                        </Button>
                      </>
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

                {isDemoExpanded && (
                  <div className="p-3 bg-muted/30 border-b flex flex-col sm:flex-row gap-3 items-start text-xs">
                    {exercise.gifUrl && (
                      <img
                        src={exercise.gifUrl}
                        alt={exercise.name}
                        loading="lazy"
                        className="w-28 h-28 rounded-xl object-cover border bg-white shrink-0"
                      />
                    )}
                    {exercise.instructions && exercise.instructions.length > 0 && (
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground">
                        {exercise.instructions.map((step, i) => (
                          <li key={i} className="leading-relaxed">{step}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                <CardContent className="p-3 sm:p-4 space-y-2.5">
                  <div className="grid grid-cols-12 gap-1.5 text-[11px] font-bold text-muted-foreground uppercase px-1 pb-1">
                    <div className="col-span-2 sm:col-span-1 text-center">Set</div>
                    <div className="col-span-4 sm:col-span-3 text-center">Weight (kg)</div>
                    <div className="col-span-3 sm:col-span-3 text-center">Reps / Sec</div>
                    <div className="col-span-3 sm:col-span-5 text-right pr-2">Check</div>
                  </div>

                  {exercise.sets.map(set => (
                    <div
                      key={set.id}
                      className={`grid grid-cols-12 gap-1.5 items-center p-2 rounded-xl transition-all border ${
                        set.completed 
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-foreground' 
                          : 'bg-background hover:bg-muted/40 border-border/70'
                      }`}
                    >
                      <div className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center">
                        <span className="font-mono font-black text-xs leading-none">{set.setNumber}</span>
                        <span className="text-[8px] text-muted-foreground uppercase font-bold mt-0.5">
                          {set.type.slice(0, 4)}
                        </span>
                      </div>

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

                      <div className="col-span-3 sm:col-span-5 flex items-center justify-end gap-1.5 pr-1">
                        {set.weightKg > 0 ? (
                          <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground border-border/80 px-1.5 py-0 hidden sm:flex">
                            1RM: ~{calculateEpley1RM(set.weightKg, set.reps)}kg
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-1.5 py-0 hidden sm:flex">
                            Bodyweight
                          </Badge>
                        )}
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
            );
          })}

          {/* Bottom Action Bar */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button
              onClick={() => {
                setLibraryPickerTarget('floor');
                setAddExerciseModalOpen(true);
              }}
              className="h-10 px-6 font-bold text-xs gap-2 rounded-xl shadow-sm"
            >
              <Plus className="h-4 w-4" /> Add Another Exercise
            </Button>
            <Button
              variant="outline"
              onClick={handleOpenSaveFloorAsTemplate}
              className="h-10 px-4 font-bold text-xs gap-1.5 rounded-xl border-primary/30 text-primary"
            >
              <BookmarkPlus className="h-4 w-4" /> Save as Template
            </Button>
            <Button
              variant="outline"
              onClick={handleOpenAssignFromFloor}
              className="h-10 px-4 font-bold text-xs gap-1.5 rounded-xl border-amber-500/40 text-amber-600 dark:text-amber-400"
            >
              <Send className="h-4 w-4" /> Assign Workout to Client
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

      {/* MODAL 1: FULL 1,585 EXERCISEDB + CALISTHENICS LIBRARY */}
      <Dialog open={addExerciseModalOpen} onOpenChange={setAddExerciseModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-primary" /> Full Gym & Calisthenics Library ({filteredCatalog.length})
            </DialogTitle>
            <DialogDescription className="text-xs">
              {libraryPickerTarget === 'template'
                ? 'Tap any exercise to add it to your Workout Template.'
                : 'Search 1,585 ExerciseDB & Calisthenics movements or add a custom exercise.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 flex-1 overflow-y-auto">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search e.g. Planche, Front Lever, Muscle-Up, Bench Press, Lats..."
                value={exerciseSearch}
                onChange={e => {
                  setExerciseSearch(e.target.value);
                  setVisibleCatalogLimit(60);
                }}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Muscle / Calisthenics Category Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
              {(['All', 'Calisthenics', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms & Core', 'Conditioning'] as const).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setVisibleCatalogLimit(60);
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold shrink-0 transition-all ${
                    selectedCategory === cat 
                      ? 'bg-primary text-primary-foreground border-primary' 
                      : cat === 'Calisthenics'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {cat} ({categoryCounts[cat] || 0})
                </button>
              ))}
            </div>

            {/* Equipment Filter Bar */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
              {(['All', 'Bodyweight', 'Bands & Rings', 'Barbell', 'Dumbbell', 'Cable', 'Machine', 'Kettlebell'] as const).map(eq => (
                <button
                  key={eq}
                  type="button"
                  onClick={() => {
                    setSelectedEquipment(eq);
                    setVisibleCatalogLimit(60);
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold shrink-0 transition-all ${
                    selectedEquipment === eq
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-background hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {eq}
                </button>
              ))}
            </div>

            {/* Preview Box if an exercise info button was clicked */}
            {previewCatalogItem && (
              <div className="p-3 rounded-xl border bg-muted/40 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-foreground">{previewCatalogItem.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {previewCatalogItem.category} • {previewCatalogItem.equipment}
                      {previewCatalogItem.target ? ` • Target: ${previewCatalogItem.target}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewCatalogItem(null)}
                    className="text-muted-foreground hover:text-foreground text-xs px-1.5"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  {previewCatalogItem.gifUrl && (
                    <img
                      src={previewCatalogItem.gifUrl}
                      alt={previewCatalogItem.name}
                      className="w-28 h-28 rounded-xl object-cover border bg-white shrink-0"
                    />
                  )}
                  {previewCatalogItem.instructions && previewCatalogItem.instructions.length > 0 && (
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground">
                      {previewCatalogItem.instructions.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}

            {/* Exercises List */}
            <div className="divide-y border rounded-xl max-h-64 overflow-y-auto bg-background">
              {filteredCatalog.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">No exercises match search.</p>
              ) : (
                <>
                  {filteredCatalog.slice(0, visibleCatalogLimit).map(item => (
                    <div
                      key={item.id}
                      className="w-full p-2.5 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2 text-xs group"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectCatalogExercise(item)}
                        className="flex-1 text-left flex items-center gap-2.5 min-w-0"
                      >
                        {item.gifUrl ? (
                          <img
                            src={item.gifUrl}
                            alt={item.name}
                            loading="lazy"
                            className="w-10 h-10 rounded-lg object-cover border bg-white shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-[10px] shrink-0">
                            CALI
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-foreground group-hover:text-primary transition-colors truncate">
                            {item.name}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                            <span className={item.category === 'Calisthenics' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}>
                              {item.category}
                            </span>
                            <span>• {item.equipment}</span>
                            {item.target && <span>• {item.target}</span>}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {(item.gifUrl || (item.instructions && item.instructions.length > 0)) && (
                          <button
                            type="button"
                            onClick={() => setPreviewCatalogItem(previewCatalogItem?.id === item.id ? null : item)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Preview demo & instructions"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSelectCatalogExercise(item)}
                          className="h-7 px-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg"
                        >
                          <Plus className="h-3.5 w-3.5 mr-0.5" /> Add
                        </Button>
                      </div>
                    </div>
                  ))}
                  {filteredCatalog.length > visibleCatalogLimit && (
                    <button
                      type="button"
                      onClick={() => setVisibleCatalogLimit(l => l + 80)}
                      className="w-full py-2.5 text-center text-xs font-bold text-primary hover:bg-muted/50"
                    >
                      Show More ({filteredCatalog.length - visibleCatalogLimit} remaining)
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Custom Exercise Box */}
            <div className="pt-2 border-t space-y-2">
              <Label className="text-xs font-bold">Or Add Custom Movement</Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="e.g. Ring Maltese Press, Deficit Deadlift..."
                  value={customExerciseName}
                  onChange={e => setCustomExerciseName(e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                <select
                  value={customExerciseCategory}
                  onChange={e => setCustomExerciseCategory(e.target.value as ExerciseCategory)}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  {(['Calisthenics', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms & Core', 'Conditioning'] as const).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (libraryPickerTarget === 'template') {
                      setNewTemplateItems(prev => [
                        ...prev,
                        {
                          name: customExerciseName.trim(),
                          category: customExerciseCategory,
                          equipment: inferEquipment(customExerciseName),
                          targetSets: 3,
                          targetReps: 10,
                          targetWeightKg: customExerciseCategory === 'Calisthenics' ? 0 : 20
                        }
                      ]);
                      setCustomExerciseName('');
                      toast.success('Added custom exercise to template');
                    } else {
                      handleAddExercise(customExerciseName, customExerciseCategory);
                    }
                  }}
                  disabled={!customExerciseName.trim()}
                  className="h-8 text-xs font-bold shrink-0"
                >
                  Add
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
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: CREATE / SAVE CUSTOM WORKOUT TEMPLATE */}
      <Dialog open={templateModalOpen} onOpenChange={setTemplateModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <BookmarkPlus className="h-4 w-4 text-primary" /> Create Coach Workout Template
            </DialogTitle>
            <DialogDescription className="text-xs">
              Build a reusable workout template that coaches can load in 1 tap or assign directly to clients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-bold">Template Name</Label>
                <Input
                  placeholder="e.g. Calisthenics Intermediate Upper A"
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Focus / Category</Label>
                <select
                  value={newTemplateCategory}
                  onChange={e => setNewTemplateCategory(e.target.value)}
                  className="w-full h-8 rounded-md border bg-background px-2 text-xs font-semibold"
                >
                  {['Calisthenics', 'Strength', 'Hypertrophy', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms & Core', 'Conditioning'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Coach Instructions / Warm-Up Notes (Optional)</Label>
              <Input
                placeholder="e.g. 5 min wrist + scapular warm-up before starting..."
                value={newTemplateDesc}
                onChange={e => setNewTemplateDesc(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold">
                  Template Exercises ({newTemplateItems.length})
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLibraryPickerTarget('template');
                    setAddExerciseModalOpen(true);
                  }}
                  className="h-7 text-xs font-bold gap-1 border-primary/40 text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> Add from 1,585 Library
                </Button>
              </div>

              {newTemplateItems.length === 0 ? (
                <div className="border border-dashed rounded-xl p-6 text-center text-xs text-muted-foreground">
                  No exercises added yet. Click <strong>+ Add from 1,585 Library</strong> above to pick Gym or Calisthenics movements.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {newTemplateItems.map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl border bg-background space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-foreground truncate">
                          {idx + 1}. {item.name} <span className="text-[10px] text-muted-foreground font-normal">({item.category})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setNewTemplateItems(prev => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Target Sets</span>
                          <Input
                            type="number"
                            value={item.targetSets}
                            onChange={e => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setNewTemplateItems(prev => prev.map((it, i) => i === idx ? { ...it, targetSets: val } : it));
                            }}
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Reps / Hold (s)</span>
                          <Input
                            type="number"
                            value={item.targetReps}
                            onChange={e => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setNewTemplateItems(prev => prev.map((it, i) => i === idx ? { ...it, targetReps: val } : it));
                            }}
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Weight (kg)</span>
                          <Input
                            type="number"
                            step="0.5"
                            value={item.targetWeightKg}
                            onChange={e => {
                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                              setNewTemplateItems(prev => prev.map((it, i) => i === idx ? { ...it, targetWeightKg: val } : it));
                            }}
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTemplateModalOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCustomTemplate}
              disabled={isSavingTemplate || !newTemplateName.trim() || newTemplateItems.length === 0}
              className="text-xs font-bold"
            >
              {isSavingTemplate ? 'Saving...' : 'Save Workout Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: ASSIGN WORKOUT TO CLIENT */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Send className="h-4 w-4 text-amber-500" /> Assign Workout to Client
            </DialogTitle>
            <DialogDescription className="text-xs">
              Your client will immediately see this workout, target sets/reps, and animated exercise demos in their Member Portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Client / Member</Label>
                <select
                  value={assignClientId}
                  onChange={e => setAssignClientId(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-2.5 text-xs font-semibold"
                >
                  <option value="">-- Select Member --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.memberId ? `(#${c.memberId})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Scheduled Date</Label>
                <Input
                  type="date"
                  value={assignDate}
                  onChange={e => setAssignDate(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Workout Title</Label>
              <Input
                placeholder="e.g. Day 1 — Calisthenics Planche & Push"
                value={assignTitle}
                onChange={e => setAssignTitle(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Coach Instructions / Notes for Client</Label>
              <Textarea
                placeholder="e.g. Focus on 2-second pause at the top of each rep. Film your last set of Tuck Planche."
                value={assignNotes}
                onChange={e => setAssignNotes(e.target.value)}
                className="text-xs resize-none h-14 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Assigned Exercises ({assignItems.length})</Label>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {assignItems.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl border bg-muted/20 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{idx + 1}. {item.name}</span>
                      <button
                        type="button"
                        onClick={() => setAssignItems(prev => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Sets</span>
                        <Input
                          type="number"
                          value={item.targetSets}
                          onChange={e => {
                            const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setAssignItems(prev => prev.map((it, i) => i === idx ? { ...it, targetSets: val } : it));
                          }}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Reps / Sec</span>
                        <Input
                          type="number"
                          value={item.targetReps}
                          onChange={e => {
                            const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setAssignItems(prev => prev.map((it, i) => i === idx ? { ...it, targetReps: val } : it));
                          }}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Weight (kg)</span>
                        <Input
                          type="number"
                          step="0.5"
                          value={item.targetWeightKg}
                          onChange={e => {
                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                            setAssignItems(prev => prev.map((it, i) => i === idx ? { ...it, targetWeightKg: val } : it));
                          }}
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAssignModalOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmAssignWorkout}
              disabled={isAssigningWorkout || !assignClientId || !assignTitle.trim() || assignItems.length === 0}
              className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {isAssigningWorkout ? 'Assigning...' : 'Send Workout to Client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: CLIENT PICKER */}
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

      {/* MODAL 5: WORKOUT COMPLETE CELEBRATION SUMMARY */}
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
