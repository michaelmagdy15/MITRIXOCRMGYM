import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Scale, TrendingDown, TrendingUp, Plus, Ruler, Percent, Calendar, Target, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';

interface BodyRecord {
  id: string;
  memberId: string;
  date: string;
  weight: number;
  bodyFat?: number;
  muscleMass?: number;
  bmi?: number;
  waist?: number;
  chest?: number;
  arms?: number;
  notes?: string;
}

export default function MemberBodyTracker({ client }: { client: Client | null }) {
  const [records, setRecords] = useState<BodyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    weight: '', bodyFat: '', muscleMass: '', bmi: '', waist: '', chest: '', arms: '', notes: ''
  });

  useEffect(() => {
    if (!client?.id) { setLoading(false); return; }
    loadRecords();
  }, [client?.id]);

  const loadRecords = async () => {
    if (!client?.id) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'bodyRecords'), where('memberId', '==', client.id))
      );
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as BodyRecord))
        .sort((a, b) => b.date.localeCompare(a.date));
      setRecords(data);
    } catch (err) {
      console.error('Failed to load body records:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!client?.id || !form.weight) return;
    setIsSaving(true);
    try {
      const record: Omit<BodyRecord, 'id'> = {
        memberId: client.id,
        date: new Date().toISOString(),
        weight: Number(form.weight),
        bodyFat: form.bodyFat ? Number(form.bodyFat) : undefined,
        muscleMass: form.muscleMass ? Number(form.muscleMass) : undefined,
        bmi: form.bmi ? Number(form.bmi) : undefined,
        waist: form.waist ? Number(form.waist) : undefined,
        chest: form.chest ? Number(form.chest) : undefined,
        arms: form.arms ? Number(form.arms) : undefined,
        notes: form.notes || undefined,
      };
      await addDoc(collection(db, 'bodyRecords'), record);
      setForm({ weight: '', bodyFat: '', muscleMass: '', bmi: '', waist: '', chest: '', arms: '', notes: '' });
      setShowForm(false);
      await loadRecords();
    } catch (err) {
      console.error('Failed to save record:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const latest = records[0];
  const previous = records[1];

  // Calculate changes
  const weightChange = latest && previous ? latest.weight - previous.weight : 0;
  const fatChange = latest?.bodyFat && previous?.bodyFat ? latest.bodyFat - previous.bodyFat : 0;
  const muscleChange = latest?.muscleMass && previous?.muscleMass ? latest.muscleMass - previous.muscleMass : 0;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Hero Stats ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-transparent border border-cyan-500/20 p-5">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full -translate-y-8 translate-x-8" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-cyan-500/15 rounded-xl">
                <Scale className="h-5 w-5 text-cyan-500" />
              </div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">Body Tracker</span>
            </div>
            <Button size="sm" className="h-7 text-xs font-bold" onClick={() => setShowForm(!showForm)}>
              {showForm ? <Minus className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              {showForm ? 'Cancel' : 'Log'}
            </Button>
          </div>

          {latest ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-card/50 rounded-xl border">
                <p className="text-2xl font-black">{latest.weight}<span className="text-xs font-medium text-muted-foreground ml-0.5">kg</span></p>
                <p className="text-[9px] text-muted-foreground font-bold mt-0.5">Weight</p>
                {weightChange !== 0 && (
                  <Badge className={`mt-1 text-[8px] font-bold ${weightChange < 0 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50' : 'bg-rose-500/10 text-rose-600 border-rose-200/50'}`}>
                    {weightChange > 0 ? <ArrowUp className="h-2.5 w-2.5 mr-0.5" /> : <ArrowDown className="h-2.5 w-2.5 mr-0.5" />}
                    {Math.abs(weightChange).toFixed(1)}
                  </Badge>
                )}
              </div>
              <div className="text-center p-3 bg-card/50 rounded-xl border">
                <p className="text-2xl font-black">{latest.bodyFat || '—'}<span className="text-xs font-medium text-muted-foreground ml-0.5">%</span></p>
                <p className="text-[9px] text-muted-foreground font-bold mt-0.5">Body Fat</p>
                {fatChange !== 0 && (
                  <Badge className={`mt-1 text-[8px] font-bold ${fatChange < 0 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50' : 'bg-rose-500/10 text-rose-600 border-rose-200/50'}`}>
                    {fatChange > 0 ? '+' : ''}{fatChange.toFixed(1)}%
                  </Badge>
                )}
              </div>
              <div className="text-center p-3 bg-card/50 rounded-xl border">
                <p className="text-2xl font-black">{latest.muscleMass || '—'}<span className="text-xs font-medium text-muted-foreground ml-0.5">kg</span></p>
                <p className="text-[9px] text-muted-foreground font-bold mt-0.5">Muscle</p>
                {muscleChange !== 0 && (
                  <Badge className={`mt-1 text-[8px] font-bold ${muscleChange > 0 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50' : 'bg-rose-500/10 text-rose-600 border-rose-200/50'}`}>
                    {muscleChange > 0 ? '+' : ''}{muscleChange.toFixed(1)}
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4 italic">No body composition records yet. Tap "Log" to start tracking!</p>
          )}
        </div>
      </div>

      {/* ─── Log Form ─── */}
      {showForm && (
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold">Weight (kg) *</Label>
                <Input type="number" step="0.1" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="75.5" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold">Body Fat (%)</Label>
                <Input type="number" step="0.1" value={form.bodyFat} onChange={e => setForm(f => ({ ...f, bodyFat: e.target.value }))} placeholder="18.5" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold">Muscle Mass (kg)</Label>
                <Input type="number" step="0.1" value={form.muscleMass} onChange={e => setForm(f => ({ ...f, muscleMass: e.target.value }))} placeholder="32.0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold">BMI</Label>
                <Input type="number" step="0.1" value={form.bmi} onChange={e => setForm(f => ({ ...f, bmi: e.target.value }))} placeholder="24.5" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold">Waist (cm)</Label>
                <Input type="number" step="0.5" value={form.waist} onChange={e => setForm(f => ({ ...f, waist: e.target.value }))} placeholder="80" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold">Chest (cm)</Label>
                <Input type="number" step="0.5" value={form.chest} onChange={e => setForm(f => ({ ...f, chest: e.target.value }))} placeholder="100" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold">Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Post-workout measurement" />
            </div>
            <Button className="w-full font-bold" onClick={handleSave} disabled={isSaving || !form.weight}>
              {isSaving ? 'Saving...' : 'Save Record'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Measurements Cards ─── */}
      {latest && (latest.waist || latest.chest || latest.bmi) && (
        <div className="grid grid-cols-3 gap-2">
          {latest.waist && (
            <div className="p-2.5 rounded-xl bg-card/50 border text-center">
              <Ruler className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-lg font-black">{latest.waist}</p>
              <p className="text-[8px] text-muted-foreground font-bold">Waist (cm)</p>
            </div>
          )}
          {latest.chest && (
            <div className="p-2.5 rounded-xl bg-card/50 border text-center">
              <Target className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-lg font-black">{latest.chest}</p>
              <p className="text-[8px] text-muted-foreground font-bold">Chest (cm)</p>
            </div>
          )}
          {latest.bmi && (
            <div className="p-2.5 rounded-xl bg-card/50 border text-center">
              <Percent className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-lg font-black">{latest.bmi}</p>
              <p className="text-[8px] text-muted-foreground font-bold">BMI</p>
            </div>
          )}
        </div>
      )}

      {/* ─── History ─── */}
      {records.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" /> History ({records.length} records)
          </h3>
          
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {records.map((r, idx) => {
              const prev = records[idx + 1];
              const wDiff = prev ? r.weight - prev.weight : 0;
              return (
                <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-card/50 border text-xs">
                  <div>
                    <p className="font-bold font-mono">{r.weight} kg</p>
                    <p className="text-[9px] text-muted-foreground">
                      {(() => { try { return format(parseISO(r.date), 'dd MMM yyyy'); } catch { return ''; } })()}
                      {r.bodyFat ? ` · ${r.bodyFat}% fat` : ''}
                      {r.muscleMass ? ` · ${r.muscleMass}kg muscle` : ''}
                    </p>
                  </div>
                  {wDiff !== 0 && (
                    <Badge className={`text-[8px] font-bold ${wDiff < 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                      {wDiff > 0 ? '+' : ''}{wDiff.toFixed(1)} kg
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
