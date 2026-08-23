import React, { useState, useEffect, useRef } from 'react';
import { Client } from '../types';
import { auth, db } from '../firebase';
import { collection, query, onSnapshot, getDocs, doc, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Users as UsersIcon, CheckCircle2, AlertTriangle, Sparkles, ShoppingBag } from 'lucide-react';
import { format, addDays, parseISO, isToday, isSameDay, startOfDay } from 'date-fns';

import { ClassSchedule } from '../types/class';
import { ClassBookingDialog } from './components/ClassBookingDialog';

export default function MemberClasses({ client, onSwitchToStore }: { client: Client | null; onSwitchToStore?: (packageId?: string) => void }) {
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionClassId, setActionClassId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [selectedBookingClass, setSelectedBookingClass] = useState<ClassSchedule | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const dateScrollRef = useRef<HTMLDivElement>(null);

  // Generate date range: 7 days before and 14 days after today
  const dateRange = Array.from({ length: 21 }, (_, i) => addDays(new Date(), i - 7));

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    let unsub: (() => void) | undefined;

    const init = async () => {
      const q = collection(db, 'classSchedules');
      unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ClassSchedule));
        list.sort((a, b) => a.startTime.localeCompare(b.startTime));
        setClasses(list);
        setLoading(false);
      }, (err) => {
        console.error("Error loading classes:", err);
        setLoading(false);
      });
    };

    init().catch(err => {
      console.error("Failed to initialize MemberClasses:", err);
      setLoading(false);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [client?.id, client?.branch]);

  // Scroll to today on mount
  useEffect(() => {
    const el = dateScrollRef.current;
    if (el) {
      const todayBtn = el.querySelector('[data-today="true"]');
      if (todayBtn) {
        todayBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, []);

  const handleOpenBookingDialog = (gymClass: ClassSchedule) => {
    setSelectedBookingClass(gymClass);
    setIsBookingDialogOpen(true);
  };

  const handleLeaveBooking = async (gymClass: ClassSchedule) => {
    if (!client || !client.id) return;
    setActionClassId(gymClass.id);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/classes/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          classId: gymClass.id,
          action: 'leave',
          clientId: client.id,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Failed to cancel booking. Please try again.");
        return;
      }
    } catch (err) {
      console.error("Failed to leave class:", err);
      alert("Failed to cancel booking. Please try again.");
    } finally {
      setActionClassId(null);
    }
  };

  const getClassDateStr = (c: ClassSchedule): string => {
    if ((c as any).date) return (c as any).date;
    if (c.startTime && c.startTime.length >= 10) return c.startTime.substring(0, 10);
    return '';
  };

  const getClassTimeDisplay = (c: ClassSchedule): string => {
    if ((c as any).time) return (c as any).time;
    if (c.startTime && c.endTime) {
      try {
        const s = new Date(c.startTime);
        const e = new Date(c.endTime);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
          return `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      } catch { /* fallback */ }
      return `${c.startTime} - ${c.endTime}`;
    }
    return '10:00 - 11:15';
  };

  // Filter classes for selected date and client branch
  const filteredClasses = classes.filter(c => {
    try {
      const dateStr = getClassDateStr(c);
      if (!dateStr) return false;
      const isDateMatch = isSameDay(parseISO(dateStr), selectedDate);
      const classBranch = c.branch?.trim();
      const clientBranch = client?.branch?.trim();
      const isBranchMatch = !classBranch 
        || classBranch.toLowerCase() === 'all' 
        || !clientBranch 
        || classBranch.toLowerCase() === clientBranch.toLowerCase();
      return isDateMatch && isBranchMatch;
    } catch { return false; }
  });

  // Count classes per date for dot indicators
  const classCountByDate = new Map<string, number>();
  classes.forEach(c => {
    const classBranch = c.branch?.trim();
    const clientBranch = client?.branch?.trim();
    const isBranchMatch = !classBranch 
      || classBranch.toLowerCase() === 'all' 
      || !clientBranch 
      || classBranch.toLowerCase() === clientBranch.toLowerCase();
    if (isBranchMatch) {
      const key = getClassDateStr(c);
      if (key) {
        classCountByDate.set(key, (classCountByDate.get(key) || 0) + 1);
      }
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Classes & Events
          </h2>
          {onSwitchToStore && (
            <Button 
              onClick={onSwitchToStore} 
              variant="outline" 
              size="sm" 
              className="h-8 text-[11px] font-bold border-primary/20 hover:border-primary/45 rounded-xl flex items-center gap-1.5 shrink-0 bg-background/50 shadow-sm"
            >
              <ShoppingBag className="h-3 w-3" /> Buy Packages
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Swipe to browse upcoming sessions and events.</p>
      </div>

      {/* ─── BeFit-Style Horizontal Date Ribbon ─── */}
      <div className="relative">
        <div
          ref={dateScrollRef}
          className="flex gap-1 overflow-x-auto no-scrollbar py-1 px-0.5"
        >
          {dateRange.map((date, idx) => {
            const dateKey = format(date, 'yyyy-MM-dd');
            const isSelected = isSameDay(date, selectedDate);
            const today = isToday(date);
            const hasClasses = (classCountByDate.get(dateKey) || 0) > 0;

            return (
              <button
                key={idx}
                data-today={today ? 'true' : undefined}
                onClick={() => setSelectedDate(startOfDay(date))}
                className={`flex flex-col items-center min-w-[48px] py-2 px-1 rounded-xl transition-all duration-200 shrink-0 ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105'
                    : today
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <span className="text-[9px] font-bold uppercase tracking-wider">
                  {format(date, 'EEE')}
                </span>
                <span className="text-lg font-bold leading-none mt-0.5">
                  {format(date, 'd')}
                </span>
                <span className="text-[8px] font-medium mt-0.5 uppercase">
                  {format(date, 'MMM')}
                </span>
                {/* Activity dot */}
                {hasClasses && (
                  <div className={`h-1 w-1 rounded-full mt-1 ${
                    isSelected ? 'bg-primary-foreground' : 'bg-primary'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Selected Date Header ─── */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">
          {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, dd MMM')}
          <span className="text-muted-foreground font-normal ml-2">
            {filteredClasses.length} {filteredClasses.length === 1 ? 'session' : 'sessions'}
          </span>
        </p>
      </div>

      {/* ─── Class Cards ─── */}
      <div className="space-y-3">
        {filteredClasses.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-10 text-center text-muted-foreground text-xs">
              <Calendar className="h-8 w-8 mx-auto opacity-20 mb-2" />
              <p className="font-medium mb-1">
                No sessions scheduled for {isToday(selectedDate) ? 'today' : format(selectedDate, 'dd MMM')}.
              </p>
              {client?.branch && (
                <p className="text-[10px] mb-2 opacity-70">
                  Showing classes for branch: <span className="font-bold text-foreground">{client.branch}</span>
                </p>
              )}
              <p className="italic">Try selecting a different date above.</p>
              {classes.length > 0 && filteredClasses.length === 0 && client?.branch && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="mt-3 text-xs"
                  onClick={() => setSelectedDate(startOfDay(new Date()))}
                >
                  View all dates
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredClasses.map(gymClass => {
            const isBooked = client ? (gymClass.attendees || []).includes(client.id) : false;
            const isWaitlisted = client ? (gymClass.waitlist || []).includes(client.id) : false;
            const isFull = (gymClass.attendees || []).length >= gymClass.capacity;
            const spotsLeft = Math.max(0, gymClass.capacity - (gymClass.attendees || []).length);

            return (
              <Card key={gymClass.id} className={`border bg-card/40 hover:bg-card/70 transition-all ${isBooked ? 'border-primary bg-primary/5' : ''} ${isWaitlisted ? 'border-yellow-500 bg-yellow-500/5' : ''}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={(gymClass.category === 'Event') ? 'default' : 'secondary'} className="text-[9px] uppercase tracking-wider h-4">
                          {(gymClass.category || 'Class')}
                        </Badge>
                        <span className="text-[10px] text-primary uppercase font-mono tracking-wider font-bold">
                          {gymClass.branch}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold leading-snug tracking-tight">{gymClass.name}</h4>
                    </div>

                    <div className="text-right flex flex-col items-end">
                      <div className="flex items-center gap-1 text-xs font-mono font-bold">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {getClassTimeDisplay(gymClass)}
                      </div>
                    </div>
                  </div>

                  {(gymClass as any).description && (
                    <p className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg border leading-relaxed">
                      {(gymClass as any).description}
                    </p>
                  )}

                  <div className="flex items-center justify-between border-t pt-2.5 mt-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                      <UsersIcon className="h-4 w-4" />
                      <span>{(gymClass.attendees || []).length} / {gymClass.capacity} Joined</span>
                      {isWaitlisted && (
                        <Badge variant="outline" className="text-[9px] font-bold text-yellow-600 border-yellow-500 bg-yellow-500/10 ml-2">
                          Waitlisted (#{(gymClass.waitlist || []).indexOf(client?.id || '') + 1})
                        </Badge>
                      )}
                      {spotsLeft <= 3 && spotsLeft > 0 && !isBooked && !isWaitlisted && (
                        <Badge className="bg-strike-green/10 text-strike-green border-strike-green/25 text-[9px] font-bold">
                          {spotsLeft} spots left!
                        </Badge>
                      )}
                    </div>

                    {isBooked || isWaitlisted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-all text-xs font-bold"
                        onClick={() => handleLeaveBooking(gymClass)}
                        disabled={actionClassId === gymClass.id}
                      >
                        {isWaitlisted ? 'Leave Waitlist' : 'Leave'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 text-xs font-bold"
                        onClick={() => handleOpenBookingDialog(gymClass)}
                        disabled={actionClassId === gymClass.id}
                      >
                        {isFull ? 'Join Waitlist' : 'Join Class'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ─── Interactive Class Booking Dialog ─── */}
      <ClassBookingDialog
        open={isBookingDialogOpen}
        onOpenChange={setIsBookingDialogOpen}
        gymClass={selectedBookingClass}
        client={client}
        onSwitchToStore={onSwitchToStore}
      />
    </div>
  );
}
