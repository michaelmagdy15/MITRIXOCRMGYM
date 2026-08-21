import React, { useState, useEffect, useMemo } from 'react';
import { useSessions } from '../hooks/useSessions';
import { Session, SessionStatus, User, SessionType } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, User as UserIcon, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { useAppContext } from '../context';

const STATUS_STYLES: Record<string, { badge: string; text: string; icon: React.ReactNode }> = {
  Scheduled:  { badge: 'bg-blue-500/10 text-blue-600 border-blue-200/50',   text: 'Scheduled', icon: <Clock className="h-3 w-3" /> },
  Completed:  { badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50', text: 'Completed', icon: <CheckCircle2 className="h-3 w-3" /> },
  'No Show':  { badge: 'bg-secondary text-muted-foreground border-border', text: 'No Show', icon: <AlertCircle className="h-3 w-3" /> },
  Rescheduled:{ badge: 'bg-orange-500/10 text-orange-600 border-orange-200/50', text: 'Rescheduled', icon: <Clock className="h-3 w-3" /> },
  Cancelled:  { badge: 'bg-zinc-500/10 text-zinc-500 border-zinc-200/50',   text: 'Cancelled', icon: <XCircle className="h-3 w-3" /> },
};

export default function AdminScheduleView() {
  const { coaches } = useAppContext();
  const { fetchSessions, updateSessionStatus, loading } = useSessions();
  const [sessions, setSessions] = useState<Session[]>([]);
  
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedCoachId, setSelectedCoachId] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  useEffect(() => {
    // Fetch all sessions (in a real production app with thousands of sessions, you'd filter by date range)
    fetchSessions().then(data => {
      setSessions(data);
    });
  }, [fetchSessions]);

  const handlePrevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const handleNextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date());

  const daysOfWeek = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      if (selectedCoachId !== 'all' && session.coachId !== selectedCoachId) return false;
      if (selectedType !== 'all' && session.type !== selectedType) return false;
      return true;
    });
  }, [sessions, selectedCoachId, selectedType]);

  const getSessionsForDay = (date: Date) => {
    return filteredSessions
      .filter(s => isSameDay(parseISO(s.date), date))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const handleStatusChange = async (sessionId: string, newStatus: SessionStatus) => {
    if (!window.confirm(`Are you sure you want to change this session to ${newStatus}?`)) return;
    try {
      await updateSessionStatus(sessionId, newStatus);
      // Refresh
      const updated = await fetchSessions();
      setSessions(updated);
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Master Schedule</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage and view all coaching sessions across the facility.</p>
        </div>
      </div>

      <Card className="border shadow-sm bg-card/40">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handlePrevWeek}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={handleToday}>Today</Button>
              <Button variant="outline" size="icon" onClick={handleNextWeek}><ChevronRight className="h-4 w-4" /></Button>
              <span className="font-semibold text-sm ml-2">
                {format(daysOfWeek[0]!, 'MMM d')} - {format(daysOfWeek[6]!, 'MMM d, yyyy')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedCoachId} onValueChange={(val) => setSelectedCoachId(val || 'all')}>
                <SelectTrigger className="w-[160px] bg-background">
                  <SelectValue placeholder="All Coaches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Coaches</SelectItem>
                  {coaches.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedType} onValueChange={(val) => setSelectedType(val || 'all')}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="1-on-1">1-on-1 PT</SelectItem>
                  <SelectItem value="Partner">Partner</SelectItem>
                  <SelectItem value="Small Group">Small Group</SelectItem>
                  <SelectItem value="Class">Class</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-7 border-t border-l">
            {daysOfWeek.map((day, i) => {
              const daySessions = getSessionsForDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div key={day.toISOString()} className="min-h-[200px] border-r border-b p-2">
                  <div className={`text-center py-1 mb-2 rounded-sm ${isToday ? 'bg-primary/10 text-primary font-bold' : 'text-muted-foreground'}`}>
                    <div className="text-[10px] uppercase">{format(day, 'EEE')}</div>
                    <div className="text-lg">{format(day, 'd')}</div>
                  </div>
                  <div className="space-y-2">
                    {daySessions.map(session => (
                      <div key={session.id} className="bg-background rounded-md border shadow-sm p-2 text-xs hover:border-primary/50 transition-colors">
                        <div className="font-bold flex items-center justify-between">
                          <span>{session.startTime} - {session.endTime}</span>
                          <span className="text-[9px] text-muted-foreground uppercase">{session.type}</span>
                        </div>
                        <div className="text-muted-foreground truncate my-1">
                          {session.clientName || 'Unknown Client'}
                        </div>
                        <div className="text-muted-foreground flex items-center gap-1 mb-2">
                          <UserIcon className="h-3 w-3" /> {session.coachName || 'Unknown Coach'}
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_STYLES[session.status]?.badge}`}>
                            {STATUS_STYLES[session.status]?.text}
                          </Badge>
                          <Select 
                            value={session.status} 
                            onValueChange={(val) => handleStatusChange(session.id, val as SessionStatus)}
                          >
                            <SelectTrigger className="h-5 w-5 p-0 border-0 bg-transparent ring-0 focus:ring-0">
                              <span className="sr-only">Update Status</span>
                            </SelectTrigger>
                            <SelectContent align="end">
                              <SelectItem value="Scheduled">Scheduled</SelectItem>
                              <SelectItem value="Completed">Completed</SelectItem>
                              <SelectItem value="No Show">No Show</SelectItem>
                              <SelectItem value="Cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {daySessions.length === 0 && (
                      <div className="text-center text-muted-foreground/50 text-[10px] py-4">No sessions</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
