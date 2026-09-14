import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClasses } from '../../hooks/useClasses';
import { useAppContext } from '../../context';
import { safeFormatTime, toValidDate } from '../../utils/dateUtils';

const toClassDate = (date?: string, time?: string) => {
  if (time && time.includes('T')) return toValidDate(time);
  if (!date) return toValidDate(time);
  if (date.includes('T') && !time) return toValidDate(date);
  return toValidDate(`${date}T${time || '00:00'}`);
};

const getClassStatus = (start: Date | null, end: Date | null, now: Date) => {
  if (!start || !end) return { label: 'Scheduled', tone: 'secondary', detail: '' };
  if (now >= start && now <= end) return { label: 'LIVE', tone: 'live', detail: 'Now' };
  if (now < start) {
    const minutes = Math.max(1, Math.round((start.getTime() - now.getTime()) / 60000));
    const detail = minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)}h`;
    return { label: 'Upcoming', tone: 'upcoming', detail };
  }
  return { label: 'Completed', tone: 'completed', detail: '' };
};

export default function TodayClassesWidget() {
  const { classes, loading } = useClasses();
  const { setActiveTab } = useAppContext();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayClasses = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return classes
      .filter(cls => cls.date === today || (cls.startTime || '').startsWith(today))
      .sort((a, b) => {
        const aStart = toClassDate(a.date, a.startTime || a.time)?.getTime() || 0;
        const bStart = toClassDate(b.date, b.startTime || b.time)?.getTime() || 0;
        return aStart - bStart;
      });
  }, [classes]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Today's Classes
          </CardTitle>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setActiveTab('class-manager')}>
            Class Manager
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading classes...</div>
        ) : todayClasses.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No classes scheduled today.</p>
            <Button size="sm" variant="outline" onClick={() => setActiveTab('class-manager')}>
              Open Class Manager
            </Button>
          </div>
        ) : (
          todayClasses.map(cls => {
            const start = toClassDate(cls.date, cls.startTime || cls.time);
            const end = toClassDate(cls.date, cls.endTime);
            const status = getClassStatus(start, end, now);
            const enrolled = cls.attendees?.length || 0;
            const capacity = cls.capacity || 0;
            const pct = capacity > 0 ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0;

            return (
              <button
                key={cls.id}
                type="button"
                onClick={() => setActiveTab('class-manager')}
                className={`w-full text-left rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-muted/30 ${
                  status.tone === 'completed' ? 'opacity-65' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {safeFormatTime(cls.startTime || cls.time, 'HH:mm', 'TBD')} - {safeFormatTime(cls.endTime, 'HH:mm', 'TBD')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-foreground truncate">{cls.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{cls.instructorName || 'Unassigned coach'}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-black ${
                      status.tone === 'live'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                        : status.tone === 'upcoming'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {status.tone === 'live' && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />}
                    {status.label}{status.detail ? ` ${status.detail}` : ''}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> {enrolled}/{capacity || '∞'}
                  </span>
                  {cls.branch && (
                    <span className="flex items-center gap-1.5 truncate">
                      <MapPin className="h-3.5 w-3.5" /> {cls.branch}
                    </span>
                  )}
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
