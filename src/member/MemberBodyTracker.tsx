import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '../types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Scale,
  Plus,
  Ruler,
  Percent,
  Calendar,
  Target,
  ArrowDown,
  ArrowUp,
  Minus,
  Sparkles,
  MessageCircle,
  Trophy,
  Flame,
  AlertTriangle,
} from 'lucide-react';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import {
  InBodyScanRecord,
  parseInBodyTextReport,
  computeInBodyTransformation,
  buildWhatsAppInBodyReportUrl,
} from '../utils/inbodyParser';
import { openWhatsAppUrl } from '../utils/whatsappTemplates';

export default function MemberBodyTracker({
  client,
  clubName = 'Inzan Athletics',
}: {
  client: Client | null;
  clubName?: string;
}) {
  const [records, setRecords] = useState<InBodyScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ocrPasteText, setOcrPasteText] = useState('');
  const [form, setForm] = useState({
    weight: '',
    bodyFat: '',
    muscleMass: '',
    bodyFatMass: '',
    bmi: '',
    visceralFatLevel: '',
    bmr: '',
    inbodyScore: '',
    waist: '',
    chest: '',
    arms: '',
    notes: '',
  });

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }
    loadRecords();
  }, [client?.id]);

  const loadRecords = async () => {
    if (!client?.id) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'bodyRecords'), where('memberId', '==', client.id))
      );
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as InBodyScanRecord))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setRecords(data);
    } catch (err) {
      console.error('Failed to load body records:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleParseInBodyText = (raw: string) => {
    setOcrPasteText(raw);
    const parsed = parseInBodyTextReport(raw);
    setForm((prev) => ({
      ...prev,
      weight: parsed.weight !== undefined ? String(parsed.weight) : prev.weight,
      muscleMass: parsed.muscleMass !== undefined ? String(parsed.muscleMass) : prev.muscleMass,
      bodyFat: parsed.bodyFat !== undefined ? String(parsed.bodyFat) : prev.bodyFat,
      bodyFatMass: parsed.bodyFatMass !== undefined ? String(parsed.bodyFatMass) : prev.bodyFatMass,
      bmi: parsed.bmi !== undefined ? String(parsed.bmi) : prev.bmi,
      visceralFatLevel:
        parsed.visceralFatLevel !== undefined ? String(parsed.visceralFatLevel) : prev.visceralFatLevel,
      bmr: parsed.bmr !== undefined ? String(parsed.bmr) : prev.bmr,
      inbodyScore: parsed.inbodyScore !== undefined ? String(parsed.inbodyScore) : prev.inbodyScore,
    }));
  };

  const handleSave = async () => {
    if (!client?.id || !form.weight) return;
    setIsSaving(true);
    try {
      const record: Omit<InBodyScanRecord, 'id'> = {
        memberId: client.id,
        date: new Date().toISOString(),
        weight: Number(form.weight),
        bodyFat: form.bodyFat ? Number(form.bodyFat) : undefined,
        muscleMass: form.muscleMass ? Number(form.muscleMass) : undefined,
        bodyFatMass: form.bodyFatMass ? Number(form.bodyFatMass) : undefined,
        bmi: form.bmi ? Number(form.bmi) : undefined,
        visceralFatLevel: form.visceralFatLevel ? Number(form.visceralFatLevel) : undefined,
        bmr: form.bmr ? Number(form.bmr) : undefined,
        inbodyScore: form.inbodyScore ? Number(form.inbodyScore) : undefined,
        waist: form.waist ? Number(form.waist) : undefined,
        chest: form.chest ? Number(form.chest) : undefined,
        arms: form.arms ? Number(form.arms) : undefined,
        notes: form.notes || undefined,
      };
      await addDoc(collection(db, 'bodyRecords'), record);
      setForm({
        weight: '',
        bodyFat: '',
        muscleMass: '',
        bodyFatMass: '',
        bmi: '',
        visceralFatLevel: '',
        bmr: '',
        inbodyScore: '',
        waist: '',
        chest: '',
        arms: '',
        notes: '',
      });
      setOcrPasteText('');
      setShowForm(false);
      await loadRecords();
    } catch (err) {
      console.error('Failed to save record:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const transformation = useMemo(() => computeInBodyTransformation(records), [records]);
  const whatsappReportUrl = useMemo(() => {
    if (!client) return null;
    return buildWhatsAppInBodyReportUrl({
      clientName: client.name,
      clientPhone: client.phone,
      summary: transformation,
      clubName,
    });
  }, [client, transformation, clubName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const latest = transformation.latest;
  const { weightDelta: weightChange, bodyFatDelta: fatChange, muscleDelta: muscleChange, scoreDelta } =
    transformation.vsPrevious;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Hero Stats ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-transparent border border-cyan-500/20 p-5">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full -translate-y-8 translate-x-8" />

        <div className="relative z-10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-cyan-500/15 rounded-xl">
                <Scale className="h-5 w-5 text-cyan-500" />
              </div>
              <div>
                <span className="text-xs font-extrabold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
                  InBody 270/570 Composition & Transformation
                </span>
                <p className="text-[11px] text-muted-foreground">{transformation.coachingHeadline}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {whatsappReportUrl && (
                <a
                  href={whatsappReportUrl}
                  target="whatsapp_crm"
                  onClick={(e) => {
                    e.preventDefault();
                    openWhatsAppUrl(whatsappReportUrl);
                  }}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                  title="Send InBody Transformation Report via WhatsApp"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp InBody
                </a>
              )}
              <Button size="sm" className="h-7 text-xs font-bold" onClick={() => setShowForm(!showForm)}>
                {showForm ? <Minus className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                {showForm ? 'Cancel' : 'Log InBody Scan'}
              </Button>
            </div>
          </div>

          {latest ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="text-center p-3 bg-card/70 rounded-xl border">
                <p className="text-2xl font-black">
                  {latest.weight}
                  <span className="text-xs font-medium text-muted-foreground ml-0.5">kg</span>
                </p>
                <p className="text-[9px] text-muted-foreground font-bold uppercase mt-0.5">Weight</p>
                {weightChange !== 0 && (
                  <Badge
                    className={`mt-1 text-[8px] font-bold ${
                      weightChange < 0
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                        : 'bg-secondary text-muted-foreground border-border'
                    }`}
                  >
                    {weightChange > 0 ? <ArrowUp className="h-2.5 w-2.5 mr-0.5" /> : <ArrowDown className="h-2.5 w-2.5 mr-0.5" />}
                    {Math.abs(weightChange).toFixed(1)} kg
                  </Badge>
                )}
              </div>

              <div className="text-center p-3 bg-card/70 rounded-xl border">
                <p className="text-2xl font-black">
                  {latest.muscleMass || '—'}
                  <span className="text-xs font-medium text-muted-foreground ml-0.5">kg</span>
                </p>
                <p className="text-[9px] text-muted-foreground font-bold uppercase mt-0.5">Muscle Mass (SMM)</p>
                {muscleChange !== 0 && (
                  <Badge
                    className={`mt-1 text-[8px] font-bold ${
                      muscleChange > 0
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                        : 'bg-secondary text-muted-foreground border-border'
                    }`}
                  >
                    {muscleChange > 0 ? '+' : ''}
                    {muscleChange.toFixed(1)} kg
                  </Badge>
                )}
              </div>

              <div className="text-center p-3 bg-card/70 rounded-xl border">
                <p className="text-2xl font-black">
                  {latest.bodyFat || '—'}
                  <span className="text-xs font-medium text-muted-foreground ml-0.5">%</span>
                </p>
                <p className="text-[9px] text-muted-foreground font-bold uppercase mt-0.5">Body Fat (PBF)</p>
                {fatChange !== 0 && (
                  <Badge
                    className={`mt-1 text-[8px] font-bold ${
                      fatChange < 0
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                        : 'bg-secondary text-muted-foreground border-border'
                    }`}
                  >
                    {fatChange > 0 ? '+' : ''}
                    {fatChange.toFixed(1)}%
                  </Badge>
                )}
              </div>

              <div className="text-center p-3 bg-card/70 rounded-xl border">
                <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400">
                  {latest.inbodyScore || '—'}
                  <span className="text-xs font-medium text-muted-foreground ml-0.5">/100</span>
                </p>
                <p className="text-[9px] text-muted-foreground font-bold uppercase mt-0.5">InBody Score</p>
                {scoreDelta !== 0 && (
                  <Badge className="mt-1 text-[8px] font-bold bg-cyan-500/15 text-cyan-600 border-cyan-500/30">
                    {scoreDelta > 0 ? '+' : ''}
                    {scoreDelta} pts
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4 italic">
              No InBody composition records yet. Tap "Log InBody Scan" to start tracking!
            </p>
          )}

          {transformation.coachingAlerts.map((alertText, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300 font-medium"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>{alertText}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Log Form ─── */}
      {showForm && (
        <Card className="border-cyan-500/25 bg-cyan-500/5">
          <CardContent className="p-4 space-y-3">
            {/* Smart InBody Text / OCR Parser */}
            <div className="rounded-xl border border-cyan-500/30 bg-background/80 p-3 space-y-1.5">
              <Label className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Smart InBody Sheet Text / OCR Auto-Fill (Optional)
              </Label>
              <Input
                value={ocrPasteText}
                onChange={(e) => handleParseInBodyText(e.target.value)}
                placeholder="Paste InBody summary text e.g. Weight: 78.4 kg SMM: 36.2 PBF: 14.8% Score: 84 BMR: 1850 Visceral Fat: 5"
                className="h-8 text-xs bg-background"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">Weight (kg) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.weight}
                  onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                  placeholder="75.5"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">Muscle Mass SMM (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.muscleMass}
                  onChange={(e) => setForm((f) => ({ ...f, muscleMass: e.target.value }))}
                  placeholder="34.2"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">Body Fat PBF (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.bodyFat}
                  onChange={(e) => setForm((f) => ({ ...f, bodyFat: e.target.value }))}
                  placeholder="16.5"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">InBody Score (0–100)</Label>
                <Input
                  type="number"
                  value={form.inbodyScore}
                  onChange={(e) => setForm((f) => ({ ...f, inbodyScore: e.target.value }))}
                  placeholder="82"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">Body Fat Mass (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.bodyFatMass}
                  onChange={(e) => setForm((f) => ({ ...f, bodyFatMass: e.target.value }))}
                  placeholder="12.4"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">Visceral Fat (1–20)</Label>
                <Input
                  type="number"
                  value={form.visceralFatLevel}
                  onChange={(e) => setForm((f) => ({ ...f, visceralFatLevel: e.target.value }))}
                  placeholder="6"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">BMR (kcal/day)</Label>
                <Input
                  type="number"
                  value={form.bmr}
                  onChange={(e) => setForm((f) => ({ ...f, bmr: e.target.value }))}
                  placeholder="1820"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">BMI</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.bmi}
                  onChange={(e) => setForm((f) => ({ ...f, bmi: e.target.value }))}
                  placeholder="24.2"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">Waist (cm)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.waist}
                  onChange={(e) => setForm((f) => ({ ...f, waist: e.target.value }))}
                  placeholder="80"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">Chest (cm)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.chest}
                  onChange={(e) => setForm((f) => ({ ...f, chest: e.target.value }))}
                  placeholder="102"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-[10px] font-bold">Coach / Nutritionist Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Fasted morning InBody 270 scan"
                />
              </div>
            </div>
            <Button className="w-full font-bold" onClick={handleSave} disabled={isSaving || !form.weight}>
              {isSaving ? 'Saving Scan...' : 'Save InBody Scan Record'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Secondary Metrics Row ─── */}
      {latest &&
        (latest.visceralFatLevel || latest.bmr || latest.bmi || latest.waist || latest.chest) && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {latest.visceralFatLevel && (
              <div className="p-2.5 rounded-xl bg-card/50 border text-center">
                <Trophy className="h-3.5 w-3.5 mx-auto text-amber-500 mb-0.5" />
                <p className="text-base font-black">{latest.visceralFatLevel}</p>
                <p className="text-[9px] text-muted-foreground font-bold">Visceral Fat</p>
              </div>
            )}
            {latest.bmr && (
              <div className="p-2.5 rounded-xl bg-card/50 border text-center">
                <Flame className="h-3.5 w-3.5 mx-auto text-orange-500 mb-0.5" />
                <p className="text-base font-black">{latest.bmr}</p>
                <p className="text-[9px] text-muted-foreground font-bold">BMR (kcal)</p>
              </div>
            )}
            {latest.bmi && (
              <div className="p-2.5 rounded-xl bg-card/50 border text-center">
                <Percent className="h-3.5 w-3.5 mx-auto text-cyan-500 mb-0.5" />
                <p className="text-base font-black">{latest.bmi}</p>
                <p className="text-[9px] text-muted-foreground font-bold">BMI</p>
              </div>
            )}
            {latest.waist && (
              <div className="p-2.5 rounded-xl bg-card/50 border text-center">
                <Ruler className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-0.5" />
                <p className="text-base font-black">{latest.waist}</p>
                <p className="text-[9px] text-muted-foreground font-bold">Waist (cm)</p>
              </div>
            )}
            {latest.chest && (
              <div className="p-2.5 rounded-xl bg-card/50 border text-center">
                <Target className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-0.5" />
                <p className="text-base font-black">{latest.chest}</p>
                <p className="text-[9px] text-muted-foreground font-bold">Chest (cm)</p>
              </div>
            )}
          </div>
        )}

      {/* ─── History ─── */}
      {records.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" /> InBody Scan History ({records.length})
          </h3>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {records.map((r, idx) => {
              const prev = records[idx + 1];
              const wDiff = prev ? r.weight - prev.weight : 0;
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-card/50 border text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold font-mono">{r.weight} kg</p>
                      {r.inbodyScore && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-cyan-500/40 text-cyan-600">
                          Score {r.inbodyScore}/100
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {(() => {
                        try {
                          return format(parseISO(r.date), 'dd MMM yyyy');
                        } catch {
                          return '';
                        }
                      })()}
                      {r.muscleMass ? ` · ${r.muscleMass}kg SMM` : ''}
                      {r.bodyFat ? ` · ${r.bodyFat}% PBF` : ''}
                      {r.visceralFatLevel ? ` · VF ${r.visceralFatLevel}` : ''}
                      {r.bmr ? ` · ${r.bmr} kcal` : ''}
                    </p>
                  </div>
                  {wDiff !== 0 && (
                    <Badge
                      className={`text-[9px] font-bold ${
                        wDiff < 0
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {wDiff > 0 ? '+' : ''}
                      {wDiff.toFixed(1)} kg
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
