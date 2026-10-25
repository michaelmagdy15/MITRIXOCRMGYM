import React, { useState, useMemo, useEffect } from 'react';
import {
  FULL_EXERCISE_CATALOG,
  ExerciseCatalogItem,
  ExerciseCategory,
  ExerciseEquipment,
} from '../data/exerciseLibraryData';
import {
  POPULAR_WORKOUT_TEMPLATES,
  PROGRAM_CATEGORIES,
  ProgramCategory,
} from '../data/workoutTemplatesData';
import { db } from '../firebase';
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../context';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Dumbbell,
  Search,
  Sparkles,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  BookOpen,
  Layers,
  Calendar,
  User,
  Info,
  X,
  Flame,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES: ('All' | ExerciseCategory)[] = [
  'All',
  'Calisthenics',
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms & Core',
  'Conditioning',
];

const EQUIPMENTS: ('All' | ExerciseEquipment)[] = [
  'All',
  'Bodyweight',
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Kettlebell',
  'Bands & Rings',
];

interface TemplateExerciseItem {
  name: string;
  category: ExerciseCategory;
  equipment?: ExerciseEquipment;
  targetSets: number;
  targetReps: number;
  targetWeightKg: number;
  notes?: string;
  gifUrl?: string;
  instructions?: string[];
}

interface WorkoutTemplateDoc {
  id: string;
  name: string;
  description: string;
  category?: string;
  programCategory?: string;
  programSource?: string;
  difficulty?: string;
  createdById?: string;
  createdByName?: string;
  createdAt?: string;
  isSystem?: boolean;
  items: TemplateExerciseItem[];
}

const CATALOG_BY_NAME = new Map<string, ExerciseCatalogItem>();
for (const ex of FULL_EXERCISE_CATALOG) {
  CATALOG_BY_NAME.set(ex.name.toLowerCase(), ex);
}

interface ExerciseLibraryHubProps {
  mode?: 'staff' | 'member';
  memberClient?: Client | null;
  onStartFloorWithClient?: (client?: Client | null) => void;
}

export default function ExerciseLibraryHub({
  mode = 'staff',
  memberClient = null,
  onStartFloorWithClient,
}: ExerciseLibraryHubProps) {
  const { currentUser } = useAuth();
  const { clients } = useAppContext();

  const [activeSubView, setActiveSubView] = useState<'library' | 'templates' | 'assigned'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | ExerciseCategory>('All');
  const [selectedEquipment, setSelectedEquipment] = useState<'All' | ExerciseEquipment>('All');
  const [visibleCount, setVisibleCount] = useState(36);

  // Template filtering & search state (declared before all useEffects to prevent TDZ)
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedProgramCategory, setSelectedProgramCategory] = useState<ProgramCategory>('All');

  // Selected exercise for full detail modal
  const [detailExercise, setDetailExercise] = useState<ExerciseCatalogItem | null>(null);

  // Custom templates from Firestore
  const [customTemplates, setCustomTemplates] = useState<WorkoutTemplateDoc[]>([]);
  // Assigned workouts from Firestore
  const [assignedWorkouts, setAssignedWorkouts] = useState<any[]>([]);

  // Template / Assignment Draft Builder State
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderMode, setBuilderMode] = useState<'template' | 'assign'>('template');
  const [builderTitle, setBuilderTitle] = useState('');
  const [builderDescription, setBuilderDescription] = useState('');
  const [builderClientId, setBuilderClientId] = useState('');
  const [builderClientSearch, setBuilderClientSearch] = useState('');
  const [builderDate, setBuilderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [builderExercises, setBuilderExercises] = useState<TemplateExerciseItem[]>([]);
  const [builderPickerSearch, setBuilderPickerSearch] = useState('');
  const [builderPickerCategory, setBuilderPickerCategory] = useState<'All' | ExerciseCategory>('All');
  const [isSavingBuilder, setIsSavingBuilder] = useState(false);

  // Quick staging tray when browsing the library in staff mode
  const [stagedItems, setStagedItems] = useState<TemplateExerciseItem[]>([]);

  useEffect(() => {
    setVisibleCount(36);
  }, [searchQuery, selectedCategory, selectedEquipment]);

  useEffect(() => {
    const q = query(collection(db, 'workoutTemplates'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as any), id: d.id } as WorkoutTemplateDoc))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setCustomTemplates(list);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const q =
      mode === 'member' && memberClient?.id
        ? query(collection(db, 'assignedWorkouts'), where('clientId', '==', memberClient.id))
        : query(collection(db, 'assignedWorkouts'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ ...(d.data() as any), id: d.id }))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setAssignedWorkouts(list);
      },
      () => {}
    );
    return () => unsub();
  }, [mode, memberClient?.id]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: FULL_EXERCISE_CATALOG.length };
    for (const c of CATEGORIES) {
      if (c !== 'All') counts[c] = 0;
    }
    for (const ex of FULL_EXERCISE_CATALOG) {
      counts[ex.category] = (counts[ex.category] || 0) + 1;
    }
    return counts;
  }, []);

  const filteredExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FULL_EXERCISE_CATALOG.filter((ex) => {
      if (selectedCategory !== 'All' && ex.category !== selectedCategory) return false;
      if (selectedEquipment !== 'All' && ex.equipment !== selectedEquipment) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.category.toLowerCase().includes(q) ||
        ex.equipment.toLowerCase().includes(q) ||
        (ex.target && ex.target.toLowerCase().includes(q)) ||
        (ex.secondary && ex.secondary.some((s) => s.toLowerCase().includes(q)))
      );
    });
  }, [searchQuery, selectedCategory, selectedEquipment]);

  const visibleExercises = useMemo(
    () => filteredExercises.slice(0, visibleCount),
    [filteredExercises, visibleCount]
  );

  const allTemplates = useMemo(() => {
    const byId = new Map<string, WorkoutTemplateDoc>();
    for (const tpl of POPULAR_WORKOUT_TEMPLATES) {
      byId.set(tpl.id, {
        ...tpl,
        isSystem: true,
        items: (tpl.items || []).map((item) => {
          const meta = CATALOG_BY_NAME.get(item.name.toLowerCase());
          return {
            ...item,
            gifUrl: item.gifUrl || meta?.gifUrl,
            instructions: item.instructions || meta?.instructions,
          };
        }),
      });
    }
    for (const custom of customTemplates) {
      const rawItems: TemplateExerciseItem[] = Array.isArray(custom.items)
        ? custom.items
        : Array.isArray((custom as any).exercises)
          ? (custom as any).exercises
          : [];
      if (rawItems.length === 0) continue;
      byId.set(custom.id, {
        ...custom,
        items: rawItems.map((item) => {
          const meta = CATALOG_BY_NAME.get((item.name || '').toLowerCase());
          return {
            ...item,
            targetSets: Number(item.targetSets ?? (item as any).sets ?? 3),
            targetReps: Number(item.targetReps ?? parseInt(String((item as any).reps || '10'), 10) ?? 10),
            targetWeightKg: Number(item.targetWeightKg ?? 0),
            gifUrl: item.gifUrl || meta?.gifUrl,
            instructions: item.instructions || meta?.instructions,
          };
        }),
      });
    }
    return Array.from(byId.values());
  }, [customTemplates]);

  const programCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: allTemplates.length };
    for (const cat of PROGRAM_CATEGORIES) {
      if (cat !== 'All') counts[cat] = 0;
    }
    for (const tpl of allTemplates) {
      const cat = tpl.programCategory || tpl.category || 'Trending Splits';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [allTemplates]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return allTemplates.filter((tpl) => {
      const cat = tpl.programCategory || tpl.category || 'Trending Splits';
      if (selectedProgramCategory !== 'All' && cat !== selectedProgramCategory) return false;
      if (!q) return true;
      return (
        tpl.name.toLowerCase().includes(q) ||
        (tpl.description || '').toLowerCase().includes(q) ||
        (tpl.programSource || '').toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q) ||
        tpl.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [allTemplates, selectedProgramCategory, templateSearch]);

  const filteredClients = useMemo(() => {
    const active = (clients || []).filter((c) => c.status !== 'Lead');
    const q = builderClientSearch.trim().toLowerCase();
    if (!q) return active.slice(0, 60);
    return active
      .filter(
        (c) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.memberId || '').toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [clients, builderClientSearch]);

  const builderCatalogMatches = useMemo(() => {
    const q = builderPickerSearch.trim().toLowerCase();
    return FULL_EXERCISE_CATALOG.filter((ex) => {
      if (builderPickerCategory !== 'All' && ex.category !== builderPickerCategory) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        (ex.target && ex.target.toLowerCase().includes(q)) ||
        ex.equipment.toLowerCase().includes(q)
      );
    }).slice(0, 40);
  }, [builderPickerSearch, builderPickerCategory]);

  const handleToggleStageExercise = (ex: ExerciseCatalogItem) => {
    setStagedItems((prev) => {
      const exists = prev.some((i) => i.name === ex.name);
      if (exists) {
        return prev.filter((i) => i.name !== ex.name);
      }
      return [
        ...prev,
        {
          name: ex.name,
          category: ex.category,
          equipment: ex.equipment,
          targetSets: 3,
          targetReps: 10,
          targetWeightKg: 0,
          notes: '',
          gifUrl: ex.gifUrl,
          instructions: ex.instructions,
        },
      ];
    });
  };

  const openBuilderFromStaged = (targetMode: 'template' | 'assign') => {
    setBuilderMode(targetMode);
    setBuilderTitle(targetMode === 'template' ? 'Custom Coach Template' : 'Assigned Coach Workout');
    setBuilderDescription('');
    setBuilderExercises([...stagedItems]);
    setBuilderOpen(true);
  };

  const openAssignFromTemplate = (tpl: WorkoutTemplateDoc) => {
    setBuilderMode('assign');
    setBuilderTitle(tpl.name);
    setBuilderDescription(tpl.description || '');
    setBuilderExercises(
      tpl.items.map((i) => {
        const meta = CATALOG_BY_NAME.get(i.name.toLowerCase());
        return {
          ...i,
          gifUrl: i.gifUrl || meta?.gifUrl,
          instructions: i.instructions || meta?.instructions,
        };
      })
    );
    setBuilderOpen(true);
  };

  const openNewTemplateModal = () => {
    setBuilderMode('template');
    setBuilderTitle('');
    setBuilderDescription('');
    setBuilderExercises(stagedItems.length > 0 ? [...stagedItems] : []);
    setBuilderOpen(true);
  };

  const handleSaveBuilder = async () => {
    if (!builderTitle.trim()) {
      toast.error('Please enter a workout / template title');
      return;
    }
    if (builderExercises.length === 0) {
      toast.error('Please add at least one exercise');
      return;
    }

    setIsSavingBuilder(true);
    try {
      const sanitizedItems = builderExercises.map((item) => {
        const meta = CATALOG_BY_NAME.get(item.name.toLowerCase());
        return {
          name: item.name,
          category: item.category,
          equipment: item.equipment || meta?.equipment || 'Bodyweight',
          targetSets: Number(item.targetSets) || 3,
          targetReps: Number(item.targetReps) || 10,
          targetWeightKg: Number(item.targetWeightKg) || 0,
          notes: item.notes || '',
          gifUrl: item.gifUrl || meta?.gifUrl || '',
          instructions: item.instructions || meta?.instructions || [],
        };
      });

      if (builderMode === 'template') {
        await addDoc(collection(db, 'workoutTemplates'), {
          name: builderTitle.trim(),
          description: builderDescription.trim() || `${sanitizedItems.length} exercises`,
          items: sanitizedItems,
          createdById: currentUser?.id || '',
          createdByName: currentUser?.name || 'Coach',
          createdAt: new Date().toISOString(),
        });
        toast.success(`Saved workout template "${builderTitle.trim()}"!`);
        setStagedItems([]);
        setBuilderOpen(false);
        setActiveSubView('templates');
      } else {
        const targetClient = (clients || []).find((c) => c.id === builderClientId);
        if (!targetClient) {
          toast.error('Please select a client to assign this workout to');
          setIsSavingBuilder(false);
          return;
        }
        await addDoc(collection(db, 'assignedWorkouts'), {
          clientId: targetClient.id,
          clientName: targetClient.name || 'Member',
          coachId: currentUser?.id || '',
          coachName: currentUser?.name || 'Coach',
          title: builderTitle.trim(),
          scheduledDate: builderDate,
          coachNotes: builderDescription.trim(),
          exercises: sanitizedItems,
          status: 'Assigned',
          createdAt: new Date().toISOString(),
        });

        await addDoc(collection(db, 'notifications'), {
          recipientId: targetClient.id,
          clientId: targetClient.id,
          title: `New Workout Assigned: ${builderTitle.trim()}`,
          body: `${currentUser?.name || 'Your Coach'} assigned "${builderTitle.trim()}" (${sanitizedItems.length} exercises) for ${builderDate}.`,
          type: 'workout_assigned',
          read: false,
          createdAt: new Date().toISOString(),
        });

        toast.success(`Assigned "${builderTitle.trim()}" to ${targetClient.name}!`);
        setStagedItems([]);
        setBuilderOpen(false);
        setActiveSubView('assigned');
      }
    } catch (err: any) {
      toast.error('Failed to save: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingBuilder(false);
    }
  };

  const handleMarkAssignedDone = async (w: any) => {
    try {
      await updateDoc(doc(db, 'assignedWorkouts', w.id), {
        status: 'Completed',
        completedAt: new Date().toISOString(),
      });
      toast.success(`Completed "${w.title}"!`);
    } catch {
      toast.error('Could not update workout status');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Hero Header */}
      <div className="rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Dumbbell className="h-5 w-5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                Exercise Library & Workout Hub
              </h2>
              <Badge variant="outline" className="text-[10px] font-extrabold uppercase tracking-wider border-primary/30 text-primary">
                {FULL_EXERCISE_CATALOG.length.toLocaleString()} Animated GIF Exercises
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {mode === 'member'
                ? 'View your coach-assigned workouts and browse 1,585 gym & calisthenics exercises with animated GIF demonstrations.'
                : 'Full ExerciseDB + Calisthenics & Gymnastics library with animated GIF demos, custom coach workout templates, and 1-click client workout assignment.'}
            </p>
          </div>

          {/* Sub-view Switcher + Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-muted/70 border border-border/60">
              <button
                type="button"
                onClick={() => setActiveSubView('library')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeSubView === 'library'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>GIF Library ({FULL_EXERCISE_CATALOG.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubView('templates')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeSubView === 'templates'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Trending Templates ({allTemplates.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubView('assigned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeSubView === 'assigned'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {mode === 'member' ? 'My Workouts' : 'Assigned'} ({assignedWorkouts.length})
                </span>
              </button>
            </div>

            {mode === 'staff' && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openNewTemplateModal}
                  className="h-9 rounded-xl font-bold text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Template</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setBuilderMode('assign');
                    setBuilderTitle('');
                    setBuilderDescription('');
                    setBuilderExercises(stagedItems.length > 0 ? [...stagedItems] : []);
                    setBuilderOpen(true);
                  }}
                  className="h-9 rounded-xl font-bold text-xs gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Assign Workout</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Staged exercises floating bar for quick template/assignment building */}
        {mode === 'staff' && stagedItems.length > 0 && (
          <div className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-primary text-primary-foreground font-extrabold text-xs">
                {stagedItems.length} Exercise{stagedItems.length > 1 ? 's' : ''} Selected
              </Badge>
              <span className="text-xs text-muted-foreground truncate max-w-md">
                {stagedItems.map((i) => i.name).join(', ')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStagedItems([])}
                className="h-8 text-xs text-muted-foreground"
              >
                Clear
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openBuilderFromStaged('template')}
                className="h-8 text-xs font-bold rounded-lg gap-1"
              >
                <Layers className="h-3.5 w-3.5" /> Save as Template
              </Button>
              <Button
                size="sm"
                onClick={() => openBuilderFromStaged('assign')}
                className="h-8 text-xs font-bold rounded-lg gap-1"
              >
                <Send className="h-3.5 w-3.5" /> Assign to Client
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* SUBVIEW 1: EXERCISE GIF LIBRARY */}
      {activeSubView === 'library' && (
        <div className="space-y-4">
          {/* Search + Category + Equipment Filters */}
          <div className="rounded-2xl border bg-card p-3.5 sm:p-4 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search 1,585 exercises by name, muscle (lats, chest, abs, glutes), or skill (planche, muscle-up, squat)..."
                  className="pl-9 h-10 rounded-xl bg-background"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
                <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block mr-1" />
                {EQUIPMENTS.map((eq) => (
                  <button
                    key={eq}
                    type="button"
                    onClick={() => setSelectedEquipment(eq)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap border transition-all ${
                      selectedEquipment === eq
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-muted/40 text-muted-foreground border-border/60 hover:text-foreground'
                    }`}
                  >
                    {eq}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
              {CATEGORIES.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border/70'
                    }`}
                  >
                    {cat === 'Calisthenics' && <Flame className="h-3.5 w-3.5 text-amber-500" />}
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {categoryCounts[cat] || 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results Count */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-muted-foreground">
              Showing <span className="text-foreground font-bold">{visibleExercises.length}</span> of{' '}
              <span className="text-foreground font-bold">{filteredExercises.length.toLocaleString()}</span> matching exercises
            </p>
          </div>

          {/* Responsive Visual GIF Grid (1 col mobile -> 2 col sm -> 3 col lg -> 4 col xl) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {visibleExercises.map((ex) => {
              const isStaged = stagedItems.some((i) => i.name === ex.name);
              return (
                <div
                  key={ex.id}
                  className={`group rounded-2xl border bg-card overflow-hidden flex flex-col justify-between transition-all hover:shadow-md ${
                    isStaged ? 'ring-2 ring-primary border-primary' : 'border-border/80'
                  }`}
                >
                  <div>
                    {/* Animated GIF Preview Header */}
                    <div
                      onClick={() => setDetailExercise(ex)}
                      className="relative h-44 w-full bg-white flex items-center justify-center overflow-hidden cursor-pointer border-b"
                    >
                      {ex.gifUrl ? (
                        <img
                          src={ex.gifUrl}
                          alt={ex.name}
                          loading="lazy"
                          className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <Dumbbell className="h-10 w-10 text-zinc-300" />
                      )}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        <Badge className="bg-zinc-900/85 text-white hover:bg-zinc-900 text-[10px] font-bold backdrop-blur-xs">
                          {ex.category}
                        </Badge>
                      </div>
                      <div className="absolute top-2.5 right-2.5">
                        <Badge variant="outline" className="bg-white/90 text-zinc-800 border-zinc-300 text-[10px] font-semibold">
                          {ex.equipment}
                        </Badge>
                      </div>
                      <div className="absolute bottom-2 right-2 bg-zinc-900/75 text-white rounded-lg px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 opacity-90 group-hover:opacity-100">
                        <Info className="h-3 w-3" /> Steps & Form
                      </div>
                    </div>

                    {/* Exercise Info */}
                    <div className="p-3.5 space-y-2">
                      <h3
                        onClick={() => setDetailExercise(ex)}
                        className="font-bold text-sm text-foreground leading-snug cursor-pointer hover:text-primary line-clamp-2"
                      >
                        {ex.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1">
                        {ex.target && (
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                            Target: {ex.target}
                          </span>
                        )}
                        {ex.secondary?.slice(0, 2).map((sec) => (
                          <span
                            key={sec}
                            className="text-[10px] font-medium capitalize px-2 py-0.5 rounded-md bg-muted text-muted-foreground"
                          >
                            {sec}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="px-3.5 pb-3.5 pt-1 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailExercise(ex)}
                      className="flex-1 h-8 text-xs font-bold rounded-xl"
                    >
                      View Demo
                    </Button>
                    {mode === 'staff' && (
                      <Button
                        type="button"
                        variant={isStaged ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => handleToggleStageExercise(ex)}
                        className="flex-1 h-8 text-xs font-bold rounded-xl gap-1"
                      >
                        {isStaged ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Selected
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" /> Select
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load More Pagination */}
          {visibleCount < filteredExercises.length && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + 48)}
                className="rounded-xl font-bold px-8 h-11"
              >
                Load More Exercises ({filteredExercises.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* SUBVIEW 2: WORKOUT TEMPLATES */}
      {activeSubView === 'templates' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Popular & Trending Open-Source Workout Templates ({allTemplates.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Curated from r/Fitness (Reddit PPL, GZCLP, nSuns, 5/3/1), r/bodyweightfitness (RR, Planche, Front Lever, Rings), PHUL, PHAT, Arnold Split, HYROX, CrossFit WODs & Strong Curves.
              </p>
            </div>
            {mode === 'staff' && (
              <Button onClick={openNewTemplateModal} size="sm" className="rounded-xl font-bold gap-1.5 shrink-0">
                <Plus className="h-4 w-4" /> Create Custom Template
              </Button>
            )}
          </div>

          {/* Template Search + Program Category Filter Pills */}
          <div className="rounded-2xl border bg-card p-3.5 sm:p-4 space-y-3 shadow-xs">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search 78+ templates: Reddit PPL, GZCLP, nSuns, Arnold, PHUL, PHAT, Calisthenics RR, Planche, HYROX, Murph, Strong Curves..."
                className="pl-9 pr-9 h-10 rounded-xl text-sm"
              />
              {templateSearch && (
                <button
                  type="button"
                  onClick={() => setTemplateSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
              {PROGRAM_CATEGORIES.map((cat) => {
                const active = selectedProgramCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedProgramCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border/70'
                    }`}
                  >
                    <span>{cat}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {programCategoryCounts[cat] || 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-muted-foreground">
              Showing <span className="text-foreground font-bold">{filteredTemplates.length}</span> of{' '}
              <span className="text-foreground font-bold">{allTemplates.length}</span> workout templates
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((tpl) => {
              const catLabel = tpl.programCategory || tpl.category || 'Trending Splits';
              return (
                <Card key={tpl.id} className="rounded-2xl flex flex-col justify-between border-border/80 hover:shadow-md transition-all">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/15 border-0 text-[10px] font-extrabold">
                        {catLabel}
                      </Badge>
                      {tpl.difficulty && (
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {tpl.difficulty}
                        </Badge>
                      )}
                      {tpl.programSource && (
                        <span className="text-[10px] font-medium text-muted-foreground truncate">
                          • {tpl.programSource}
                        </span>
                      )}
                    </div>
                    <CardTitle className="text-base font-bold leading-snug">{tpl.name}</CardTitle>
                    <CardDescription className="text-xs mt-1 line-clamp-3">{tpl.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {tpl.items.map((item, idx) => {
                        const meta = CATALOG_BY_NAME.get(item.name.toLowerCase());
                        const gif = item.gifUrl || meta?.gifUrl;
                        return (
                          <div
                            key={`${item.name}_${idx}`}
                            onClick={() => {
                              if (meta) setDetailExercise(meta);
                            }}
                            className="flex items-center justify-between gap-2 p-2 rounded-xl bg-muted/50 hover:bg-muted text-xs cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {gif && (
                                <img
                                  src={gif}
                                  alt={item.name}
                                  loading="lazy"
                                  className="h-9 w-9 rounded-lg object-contain bg-white border shrink-0"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="font-semibold truncate text-foreground">{item.name}</p>
                                {item.notes && (
                                  <p className="text-[10px] text-muted-foreground truncate">{item.notes}</p>
                                )}
                              </div>
                            </div>
                            <span className="font-mono text-[11px] font-bold text-primary shrink-0">
                              {item.targetSets}×{(item as any).reps || item.targetReps}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      {mode === 'staff' ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => openAssignFromTemplate(tpl)}
                            className="flex-1 h-9 rounded-xl text-xs font-bold gap-1.5"
                          >
                            <Send className="h-3.5 w-3.5" /> Assign to Client
                          </Button>
                          {!tpl.isSystem && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  await deleteDoc(doc(db, 'workoutTemplates', tpl.id));
                                  toast.success('Template deleted');
                                } catch {
                                  toast.error('Failed to delete template');
                                }
                              }}
                              className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!memberClient?.id) {
                              toast.error('Unable to find your member profile');
                              return;
                            }
                            try {
                              await addDoc(collection(db, 'assignedWorkouts'), {
                                title: tpl.name,
                                description: tpl.description || '',
                                clientId: memberClient.id,
                                clientName: memberClient.name || 'Member',
                                scheduledDate: new Date().toISOString().slice(0, 10),
                                status: 'Assigned',
                                assignedById: memberClient.id,
                                assignedByName: tpl.programSource || 'Self-Selected Template',
                                createdAt: new Date().toISOString(),
                                exercises: tpl.items.map((i) => ({
                                  name: i.name,
                                  category: i.category,
                                  equipment: i.equipment || 'Bodyweight',
                                  targetSets: Number(i.targetSets) || 3,
                                  targetReps: Number(i.targetReps) || 10,
                                  targetWeightKg: Number(i.targetWeightKg) || 0,
                                  notes: i.notes || '',
                                  gifUrl: i.gifUrl || '',
                                  completed: false,
                                })),
                              });
                              toast.success(`Added "${tpl.name}" to My Workouts!`);
                              setActiveSubView('assigned');
                            } catch {
                              toast.error('Failed to add workout');
                            }
                          }}
                          className="flex-1 h-9 rounded-xl text-xs font-bold gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add to My Workouts
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBVIEW 3: ASSIGNED WORKOUTS */}
      {activeSubView === 'assigned' && (
        <div className="space-y-4">
          {assignedWorkouts.length === 0 ? (
            <Card className="rounded-2xl p-8 text-center">
              <Dumbbell className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm font-bold text-foreground">No Assigned Workouts Yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                {mode === 'member'
                  ? 'When your coach assigns you a workout plan, it will appear right here with animated GIF demos.'
                  : 'Use the "Assign Workout" button or select any template to assign a workout to a client.'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignedWorkouts.map((w) => (
                <Card key={w.id} className="rounded-2xl">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-bold">{w.title}</CardTitle>
                        <CardDescription className="text-xs">
                          {mode === 'member'
                            ? `Assigned by Coach ${w.coachName || 'Trainer'} • ${w.scheduledDate || ''}`
                            : `Client: ${w.clientName} • Coach: ${w.coachName || 'Trainer'} • ${w.scheduledDate || ''}`}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={w.status === 'Completed' ? 'default' : 'outline'}
                        className={w.status === 'Completed' ? 'bg-emerald-600 text-white' : ''}
                      >
                        {w.status || 'Assigned'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {w.coachNotes && (
                      <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-xl italic">
                        "{w.coachNotes}"
                      </p>
                    )}
                    <div className="space-y-2">
                      {(w.exercises || []).map((ex: any, i: number) => {
                        const meta = CATALOG_BY_NAME.get(String(ex.name || '').toLowerCase());
                        const gif = ex.gifUrl || meta?.gifUrl;
                        return (
                          <div
                            key={`${ex.name}_${i}`}
                            onClick={() => meta && setDetailExercise(meta)}
                            className="flex items-center justify-between gap-3 p-2.5 rounded-xl border bg-background/60 hover:bg-muted/40 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {gif && (
                                <img
                                  src={gif}
                                  alt={ex.name}
                                  className="h-11 w-11 rounded-lg object-contain bg-white border p-0.5 shrink-0"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate">{ex.name}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {ex.targetSets} sets × {ex.targetReps} reps
                                  {ex.targetWeightKg ? ` @ ${ex.targetWeightKg}kg` : ''}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              Demo GIF
                            </Badge>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      {w.status !== 'Completed' && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkAssignedDone(w)}
                          className="h-9 rounded-xl text-xs font-bold gap-1.5"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Mark Completed
                        </Button>
                      )}
                      {mode === 'staff' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await deleteDoc(doc(db, 'assignedWorkouts', w.id));
                            toast.success('Removed assigned workout');
                          }}
                          className="h-9 rounded-xl text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EXERCISE GIF & FORM DETAIL MODAL */}
      <Dialog open={!!detailExercise} onOpenChange={(open) => !open && setDetailExercise(null)}>
        <DialogContent className="!w-[95vw] !max-w-[1100px] max-h-[92dvh] overflow-y-auto">
          {detailExercise && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge>{detailExercise.category}</Badge>
                  <Badge variant="outline">{detailExercise.equipment}</Badge>
                  {detailExercise.target && (
                    <Badge variant="secondary" className="uppercase text-[10px]">
                      Target: {detailExercise.target}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-xl font-black pt-1">{detailExercise.name}</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                {detailExercise.gifUrl && (
                  <div className="md:col-span-5 rounded-2xl border bg-white p-4 flex items-center justify-center h-72 sm:h-80 overflow-hidden">
                    <img
                      src={detailExercise.gifUrl}
                      alt={detailExercise.name}
                      className="h-full w-auto object-contain"
                    />
                  </div>
                )}

                <div className={`${detailExercise.gifUrl ? 'md:col-span-7' : 'md:col-span-12'} space-y-4`}>
                  {detailExercise.secondary && detailExercise.secondary.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-muted-foreground">Secondary Muscles:</span>
                      {detailExercise.secondary.map((s) => (
                        <Badge key={s} variant="outline" className="text-xs capitalize">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {detailExercise.instructions && detailExercise.instructions.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                        Step-by-Step Coaching Instructions
                      </h4>
                      <ol className="space-y-2 text-xs sm:text-sm text-foreground list-decimal list-inside bg-muted/40 p-4 rounded-xl">
                        {detailExercise.instructions.map((step, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2">
                {mode === 'staff' && (
                  <Button
                    type="button"
                    onClick={() => {
                      handleToggleStageExercise(detailExercise);
                      setDetailExercise(null);
                    }}
                    className="rounded-xl font-bold gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    {stagedItems.some((i) => i.name === detailExercise.name)
                      ? 'Remove from Selection'
                      : 'Select for Template / Client'}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setDetailExercise(null)} className="rounded-xl">
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* TEMPLATE / ASSIGN WORKOUT BUILDER MODAL — FULL SCREEN WORKBENCH */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="!w-[96vw] !max-w-[1440px] max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">
              {builderMode === 'template' ? 'Create Coach Workout Template' : 'Assign Workout to Client'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {builderMode === 'template'
                ? 'Build a reusable workout template from the 1,492-exercise animated GIF library.'
                : 'Select a client, customize sets/reps/weights, and send this workout directly to their Member Portal.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Client Picker, Metadata & Exercise Catalog Picker */}
            <div className="lg:col-span-6 space-y-4">
              {builderMode === 'assign' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-muted/40 border">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-primary" /> Select Client
                    </label>
                    <Input
                      value={builderClientSearch}
                      onChange={(e) => setBuilderClientSearch(e.target.value)}
                      placeholder="Filter client by name or ID..."
                      className="h-9 text-xs mb-1.5"
                    />
                    <select
                      value={builderClientId}
                      onChange={(e) => setBuilderClientId(e.target.value)}
                      className="w-full h-10 rounded-xl border bg-background px-3 text-xs font-semibold"
                    >
                      <option value="">-- Choose Member --</option>
                      {filteredClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.memberId ? `(#${c.memberId})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-primary" /> Scheduled Date
                    </label>
                    <Input
                      type="date"
                      value={builderDate}
                      onChange={(e) => setBuilderDate(e.target.value)}
                      className="h-10 text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold">Workout / Template Title</label>
                  <Input
                    value={builderTitle}
                    onChange={(e) => setBuilderTitle(e.target.value)}
                    placeholder="e.g. Calisthenics Upper Skill Day"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold">Coach Notes / Description</label>
                  <Input
                    value={builderDescription}
                    onChange={(e) => setBuilderDescription(e.target.value)}
                    placeholder="Optional focus cues or rest times..."
                    className="h-10"
                  />
                </div>
              </div>

              {/* Exercise Picker */}
              <div className="rounded-2xl border p-4 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                    Add Exercises from GIF Catalog
                  </label>
                  <span className="text-[11px] text-muted-foreground">{FULL_EXERCISE_CATALOG.length} exercises</span>
                </div>
                <Input
                  value={builderPickerSearch}
                  onChange={(e) => setBuilderPickerSearch(e.target.value)}
                  placeholder="Search 1,492 exercises to add..."
                  className="h-9 text-xs"
                />
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setBuilderPickerCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border ${
                        builderPickerCategory === cat
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="max-h-72 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                  {builderCatalogMatches.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() =>
                        setBuilderExercises((prev) => [
                          ...prev,
                          {
                            name: ex.name,
                            category: ex.category,
                            equipment: ex.equipment,
                            targetSets: 3,
                            targetReps: 10,
                            targetWeightKg: 0,
                            gifUrl: ex.gifUrl,
                            instructions: ex.instructions,
                          },
                        ])
                      }
                      className="flex items-center justify-between gap-2 p-2 rounded-xl border bg-background hover:bg-muted text-left text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {ex.gifUrl && (
                          <img src={ex.gifUrl} alt={ex.name} className="h-9 w-9 rounded-lg object-contain bg-white border shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{ex.name}</p>
                          <p className="text-[10px] text-muted-foreground">{ex.category} • {ex.equipment}</p>
                        </div>
                      </div>
                      <Plus className="h-4 w-4 text-primary shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Selected Exercises List */}
            <div className="lg:col-span-6 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-black">
                  Workout Exercises ({builderExercises.length})
                </label>
                {builderExercises.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBuilderExercises([])}
                    className="h-7 text-xs text-muted-foreground"
                  >
                    Clear All
                  </Button>
                )}
              </div>
              {builderExercises.length === 0 ? (
                <div className="text-xs text-muted-foreground py-16 text-center border rounded-2xl bg-muted/10">
                  Click any exercise on the left to add it to this workout.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[58dvh] overflow-y-auto pr-1">
                  {builderExercises.map((item, idx) => (
                    <div
                      key={`${item.name}_${idx}`}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 rounded-2xl border bg-card text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {item.gifUrl && (
                          <img src={item.gifUrl} alt={item.name} className="h-11 w-11 rounded-xl object-contain bg-white border shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm truncate">{item.name}</p>
                          {item.notes && (
                            <p className="text-[11px] text-muted-foreground truncate">{item.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={item.targetSets}
                            onChange={(e) =>
                              setBuilderExercises((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, targetSets: Number(e.target.value) } : it))
                              )
                            }
                            className="w-16 h-9 text-xs font-bold text-center"
                            title="Sets"
                          />
                          <span className="text-[11px] text-muted-foreground font-medium">sets</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={item.targetReps}
                            onChange={(e) =>
                              setBuilderExercises((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, targetReps: Number(e.target.value) } : it))
                              )
                            }
                            className="w-16 h-9 text-xs font-bold text-center"
                            title="Reps"
                          />
                          <span className="text-[11px] text-muted-foreground font-medium">reps</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={item.targetWeightKg}
                            onChange={(e) =>
                              setBuilderExercises((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, targetWeightKg: Number(e.target.value) } : it))
                              )
                            }
                            className="w-18 h-9 text-xs font-bold text-center"
                            title="Weight (kg)"
                          />
                          <span className="text-[11px] text-muted-foreground font-medium">kg</span>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setBuilderExercises((prev) => prev.filter((_, i) => i !== idx))}
                          className="h-9 w-9 text-destructive hover:bg-destructive/10 rounded-xl"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setBuilderOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveBuilder} disabled={isSavingBuilder} className="rounded-xl font-bold gap-1.5">
              {builderMode === 'template' ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  {isSavingBuilder ? 'Saving...' : 'Save Workout Template'}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {isSavingBuilder ? 'Assigning...' : 'Assign Workout to Client'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
