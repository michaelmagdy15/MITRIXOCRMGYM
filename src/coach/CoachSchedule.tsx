import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { CoachSchedule as CoachScheduleType } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Save, Calendar } from 'lucide-react';

const DAYS = [
  { key: 'monday',    label: 'Monday' },
  { key: 'tuesday',   label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday',  label: 'Thursday' },
  { key: 'friday',    label: 'Friday' },
  { key: 'saturday',  label: 'Saturday' },
  { key: 'sunday',    label: 'Sunday' },
];

const DEFAULT_SCHEDULE: CoachScheduleType['days'] = Object.fromEntries(
  DAYS.map(d => [d.key, { enabled: d.key !== 'sunday', startTime: '09:00', endTime: '21:00' }])
);

export default function CoachSchedule() {
  const { currentUser } = useAuth();
  const [schedule, setSchedule] = useState<CoachScheduleType['days']>(DEFAULT_SCHEDULE);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    const fetch = async () => {
      try {
        const ref = doc(db, 'coachSchedules', currentUser.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setSchedule(snap.data().days || DEFAULT_SCHEDULE);
        }
      } catch (err) {
        console.error("Error fetching coach schedule:", err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [currentUser?.id]);

  const updateDay = (day: string, field: 'enabled' | 'startTime' | 'endTime', value: boolean | string) => {
    setSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day]!, [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'coachSchedules', currentUser.id), {
        coachId: currentUser.id,
        days: schedule,
        updatedAt: new Date().toISOString(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" /> My Schedule
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Set your weekly availability for training sessions.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          <Save className="h-4 w-4" />
          {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Schedule'}
        </Button>
      </div>

      <div className="grid gap-3">
        {DAYS.map(({ key, label }) => {
          const day = schedule[key] ?? { enabled: false, startTime: '09:00', endTime: '21:00' };
          return (
            <Card key={key} className={`transition-opacity ${day.enabled ? '' : 'opacity-50'}`}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 w-36">
                  <Switch
                    checked={day.enabled}
                    onCheckedChange={v => updateDay(key, 'enabled', v)}
                  />
                  <Label className="font-semibold cursor-pointer" onClick={() => updateDay(key, 'enabled', !day.enabled)}>
                    {label}
                  </Label>
                </div>

                {day.enabled ? (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                      <Input
                        type="time"
                        value={day.startTime}
                        onChange={e => updateDay(key, 'startTime', e.target.value)}
                        className="w-32"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                      <Input
                        type="time"
                        value={day.endTime}
                        onChange={e => updateDay(key, 'endTime', e.target.value)}
                        className="w-32"
                      />
                    </div>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {day.startTime} – {day.endTime}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Off</span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
