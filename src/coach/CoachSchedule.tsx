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
import { Save, Calendar, Users, Target, UserPlus, FileHeart } from 'lucide-react';
import { SessionType } from '../types';

const SESSION_TYPES: { key: SessionType; label: string; icon: any }[] = [
  { key: '1-on-1', label: '1-on-1', icon: Target },
  { key: 'Partner', label: 'Partner', icon: UserPlus },
  { key: 'Small Group', label: 'Small Group', icon: Users },
  { key: 'Class', label: 'Class', icon: Users },
  { key: 'Nutrition', label: 'Nutrition', icon: FileHeart },
];

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
  DAYS.map(d => [
    d.key, 
    { 
      enabled: d.key !== 'sunday', 
      startTime: '09:00', 
      endTime: '21:00',
      capacities: {
        '1-on-1': 1,
        'Partner': 2,
        'Small Group': 5,
        'Class': 15,
        'Nutrition': 1
      }
    }
  ])
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

  const updateCapacity = (day: string, type: SessionType, value: number) => {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day]!,
        capacities: {
          ...(prev[day]?.capacities || {}),
          [type]: value
        }
      }
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
          const day = (schedule[key] ?? DEFAULT_SCHEDULE[key])!;
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
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center gap-3">
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
                      <Badge variant="secondary" className="ml-auto text-xs hidden md:flex">
                        {day.startTime} – {day.endTime}
                      </Badge>
                    </div>
                    
                    {/* Capacities */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 border-t pt-4">
                      {SESSION_TYPES.map(type => {
                        const Icon = type.icon;
                        return (
                          <div key={type.key} className="flex flex-col gap-1.5">
                            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Icon className="h-3 w-3" /> {type.label}
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              value={day.capacities?.[type.key] ?? 0}
                              onChange={e => updateCapacity(key, type.key, parseInt(e.target.value) || 0)}
                              className="h-8 text-sm"
                            />
                          </div>
                        );
                      })}
                    </div>
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
