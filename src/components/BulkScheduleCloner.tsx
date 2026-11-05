import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { db } from '../firebase';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { addAuditLog } from '../services/auditService';
import { cleanData } from '../utils';
import { toast } from 'sonner';
import { Copy, Calendar, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';

interface BulkScheduleClonerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingClasses: any[];
  currentUser?: { id: string; name: string } | null;
  onSuccess?: () => void;
}

export function BulkScheduleCloner({
  open,
  onOpenChange,
  existingClasses,
  currentUser,
  onSuccess,
}: BulkScheduleClonerProps) {
  // Source week starting Monday
  const [sourceWeekStart, setSourceWeekStart] = useState(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  });

  const [targetWeeksCount, setTargetWeeksCount] = useState<'1' | '2' | '4'>('2');
  const [isCloning, setIsCloning] = useState(false);

  // Compute source week range
  const sourceWeekRange = useMemo(() => {
    const start = new Date(sourceWeekStart);
    const end = addDays(start, 6);
    return {
      startStr: format(start, 'yyyy-MM-dd'),
      endStr: format(end, 'yyyy-MM-dd'),
    };
  }, [sourceWeekStart]);

  // Find classes falling in the source week
  const sourceClasses = useMemo(() => {
    return existingClasses.filter((c) => {
      const classDate = c.date || (c.startTime ? String(c.startTime).substring(0, 10) : '');
      return classDate >= sourceWeekRange.startStr && classDate <= sourceWeekRange.endStr;
    });
  }, [existingClasses, sourceWeekRange]);

  const totalClassesToGenerate = sourceClasses.length * parseInt(targetWeeksCount, 10);

  const handleClone = async () => {
    if (sourceClasses.length === 0) {
      toast.error('No classes found in the selected source week to clone.');
      return;
    }

    setIsCloning(true);
    const weeksToClone = parseInt(targetWeeksCount, 10);
    let createdCount = 0;

    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();

      for (let weekOffset = 1; weekOffset <= weeksToClone; weekOffset++) {
        const daysShift = weekOffset * 7;

        for (const cls of sourceClasses) {
          const originalDateStr = cls.date || (cls.startTime ? String(cls.startTime).substring(0, 10) : '');
          const originalDate = new Date(originalDateStr);
          const targetDate = addDays(originalDate, daysShift);
          const targetDateStr = format(targetDate, 'yyyy-MM-dd');

          // Shift startTime and endTime by the same number of days
          const startTimeSuffix = cls.startTime && cls.startTime.includes('T') ? cls.startTime.split('T')[1] : '10:00:00';
          const endTimeSuffix = cls.endTime && cls.endTime.includes('T') ? cls.endTime.split('T')[1] : '11:15:00';
          const newStartTime = `${targetDateStr}T${startTimeSuffix}`;
          const newEndTime = `${targetDateStr}T${endTimeSuffix}`;

          // Avoid duplicate collisions if an identical class exists on that target date
          const exists = existingClasses.some((ec) => {
            const ecDate = ec.date || (ec.startTime ? String(ec.startTime).substring(0, 10) : '');
            return ec.name === cls.name && ecDate === targetDateStr && ec.startTime === newStartTime;
          });

          if (!exists) {
            const classId = `class_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            const newClassData = cleanData({
              ...cls,
              id: classId,
              date: targetDateStr,
              startTime: newStartTime,
              endTime: newEndTime,
              attendees: [],
              waitlist: [],
              checkedInAttendees: [],
              noShowAttendees: [],
              status: 'active',
              createdAt: nowIso,
              updatedAt: nowIso,
              clonedFromId: cls.id,
              clonedAt: nowIso,
            });

            batch.set(doc(db, 'classSchedules', classId), newClassData);
            createdCount++;
          }
        }
      }

      await batch.commit();

      try {
        await addAuditLog(
          'CREATE',
          'CLASS',
          `batch_clone_${Date.now()}`,
          `Bulk cloned ${createdCount} classes across ${weeksToClone} upcoming week(s)`,
          currentUser?.name || 'Admin'
        );
      } catch (err) {
        console.warn('Audit log write failed:', err);
      }

      toast.success(`Successfully cloned ${createdCount} classes into the schedule!`);
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error cloning schedule:', err);
      toast.error(err?.message || 'Failed to clone schedule');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Copy className="h-5 w-5 text-primary" />
            Bulk Schedule Cloner
          </DialogTitle>
          <DialogDescription className="text-xs">
            Duplicate an entire week's classes, room allocations, and instructor assignments into upcoming weeks in seconds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source Week */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Select Source Week (Starting Monday)</Label>
            <Input
              type="date"
              value={sourceWeekStart}
              onChange={(e) => setSourceWeekStart(e.target.value)}
              className="rounded-xl h-10 text-xs"
            />
            <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
              <span>Week: {sourceWeekRange.startStr} to {sourceWeekRange.endStr}</span>
              <Badge variant={sourceClasses.length > 0 ? 'secondary' : 'outline'} className="font-semibold text-xs">
                {sourceClasses.length} class{sourceClasses.length === 1 ? '' : 'es'} found
              </Badge>
            </div>
          </div>

          {/* Classes Preview */}
          {sourceClasses.length > 0 && (
            <div className="max-h-36 overflow-y-auto rounded-xl border bg-muted/30 p-2.5 space-y-1.5 text-xs">
              <div className="font-semibold text-[11px] text-muted-foreground mb-1">Classes in this week:</div>
              {sourceClasses.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                    <span>{c.instructorName || c.coachName || 'Coach'}</span>
                    <span>•</span>
                    <span className="font-mono">{c.time || (c.startTime ? c.startTime.substring(11, 16) : '')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Target Duration */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Duplicate To Upcoming Period</Label>
            <Select value={targetWeeksCount} onValueChange={(val: any) => setTargetWeeksCount(val)}>
              <SelectTrigger className="rounded-xl h-10 text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Next 1 Week (+7 days forward)</SelectItem>
                <SelectItem value="2">Next 2 Weeks (+7, +14 days forward)</SelectItem>
                <SelectItem value="4">Next 4 Weeks (Full upcoming month)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Projection Summary Box */}
          <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 text-xs space-y-1">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Automated Invariants Applied:
            </div>
            <ul className="list-disc list-inside text-muted-foreground text-[11px] space-y-0.5 pl-1">
              <li>Attendees and waitlists are reset to 0 (clean rosters).</li>
              <li>Coaches, room capacities, and tiers are preserved.</li>
              <li>Existing duplicate slots on target dates are safely skipped.</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isCloning}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleClone}
            disabled={isCloning || sourceClasses.length === 0}
            className="rounded-xl font-bold shadow-sm"
          >
            {isCloning ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Cloning...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1.5" />
                Clone {totalClassesToGenerate} Classes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
