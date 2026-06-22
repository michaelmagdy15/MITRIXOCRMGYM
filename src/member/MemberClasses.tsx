import React, { useState, useEffect, useRef } from 'react';
import { Client } from '../types';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Users as UsersIcon, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { format, addDays, parseISO, isToday, isSameDay, startOfDay } from 'date-fns';

interface GymClass {
  id: string;
  name: string;
  coachName: string;
  date: string;          // YYYY-MM-DD
  time: string;          // e.g. "18:00 - 19:15"
  branch: string;
  capacity: number;
  attendees: string[];   // clientIds
  type: 'Class' | 'Event';
  description?: string;
}

export default function MemberClasses({ client }: { client: Client | null }) {
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionClassId, setActionClassId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const dateScrollRef = useRef<HTMLDivElement>(null);

  // Generate date range: 7 days before and 14 days after today
  const dateRange = Array.from({ length: 21 }, (_, i) => addDays(new Date(), i - 7));

  // Seed default classes/events if the database is empty
  const seedDemoClasses = async () => {
    try {
      const ref = collection(db, 'classes');
      const snap = await getDocs(ref);
      if (!snap.empty) return;

      console.log("Seeding group classes and events...");
      const batch = writeBatch(db);
      const demoData: Omit<GymClass, 'id'>[] = [
        {
          name: "Boxing Fundamentals",
          coachName: "SHADY YOUSSEF",
          date: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
          time: "18:00 - 19:15",
          branch: client?.branch || "Maadi",
          capacity: 15,
          attendees: [],
          type: "Class",
          description: "Learn basic stances, punches, and movements. Recommended for beginners."
        },
        {
          name: "Conditioning & Sparring",
          coachName: "MAHMOUD ALI",
          date: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
          time: "19:30 - 21:00",
          branch: client?.branch || "Maadi",
          capacity: 12,
          attendees: [],
          type: "Class",
          description: "Heavy conditioning drill followed by supervised light sparring sessions."
        },
        {
          name: "mitrixogymcrm Tournament 2026",
          coachName: "ALL COACHES",
          date: format(addDays(new Date(), 5), 'yyyy-MM-dd'),
          time: "16:00 - 22:00",
          branch: client?.branch || "Maadi",
          capacity: 100,
          attendees: [],
          type: "Event",
          description: "Annual amateur boxing cup. Join us for food, music, and epic matches!"
        },
        {
          name: "Ladies Only Boxing Kickoff",
          coachName: "SARA AHMED",
          date: format(addDays(new Date(), 3), 'yyyy-MM-dd'),
          time: "11:00 - 12:30",
          branch: client?.branch || "Maadi",
          capacity: 20,
          attendees: [],
          type: "Class",
          description: "Exclusive women-only training focusing on cardiorespiratory endurance."
        }
      ];

      demoData.forEach(item => {
        const newDocRef = doc(collection(db, 'classes'));
        batch.set(newDocRef, item);
      });

      await batch.commit();
    } catch (err) {
      console.warn("Seeding classes skipped (likely lack of write permissions):", err);
    }
  };

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    let unsub: (() => void) | undefined;

    const init = async () => {
      await seedDemoClasses();
      const q = collection(db, 'classes');
      unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as GymClass));
        list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
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

  const handleToggleBooking = async (gymClass: GymClass) => {
    if (!client || !client.id) return;
    setActionClassId(gymClass.id);

    try {
      const isBooked = gymClass.attendees.includes(client.id);
      let updatedAttendees = [...gymClass.attendees];

      if (isBooked) {
        updatedAttendees = updatedAttendees.filter(id => id !== client.id);
      } else {
        if (gymClass.attendees.length >= gymClass.capacity) {
          alert("This class is fully booked!");
          return;
        }
        updatedAttendees.push(client.id);
      }

      await updateDoc(doc(db, 'classes', gymClass.id), {
        attendees: updatedAttendees
      });
    } catch (err) {
      console.error("Failed to update booking status:", err);
      alert("Failed to update booking. Please try again.");
    } finally {
      setActionClassId(null);
    }
  };

  // Filter classes for selected date
  const filteredClasses = classes.filter(c => {
    try {
      return isSameDay(parseISO(c.date), selectedDate);
    } catch { return false; }
  });

  // Count classes per date for dot indicators
  const classCountByDate = new Map<string, number>();
  classes.forEach(c => {
    const key = c.date;
    classCountByDate.set(key, (classCountByDate.get(key) || 0) + 1);
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
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" /> Classes & Events
        </h2>
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
            <CardContent className="py-10 text-center text-muted-foreground text-xs italic">
              <Calendar className="h-8 w-8 mx-auto opacity-20 mb-2" />
              No sessions scheduled for {isToday(selectedDate) ? 'today' : format(selectedDate, 'dd MMM')}.
              <br />Try selecting a different date above.
            </CardContent>
          </Card>
        ) : (
          filteredClasses.map(gymClass => {
            const isBooked = client ? gymClass.attendees.includes(client.id) : false;
            const isFull = gymClass.attendees.length >= gymClass.capacity;
            const spotsLeft = Math.max(0, gymClass.capacity - gymClass.attendees.length);

            return (
              <Card key={gymClass.id} className={`border bg-card/40 hover:bg-card/70 transition-all ${isBooked ? 'border-primary bg-primary/5' : ''}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={gymClass.type === 'Event' ? 'default' : 'secondary'} className="text-[9px] uppercase tracking-wider h-4">
                          {gymClass.type}
                        </Badge>
                        <span className="text-[10px] text-primary uppercase font-mono tracking-wider font-bold">
                          {gymClass.branch}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold leading-snug tracking-tight">{gymClass.name}</h4>
                      <p className="text-[11px] text-muted-foreground">Led by <strong>{gymClass.coachName}</strong></p>
                    </div>

                    <div className="text-right flex flex-col items-end">
                      <div className="flex items-center gap-1 text-xs font-mono font-bold">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {gymClass.time}
                      </div>
                    </div>
                  </div>

                  {gymClass.description && (
                    <p className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg border leading-relaxed">
                      {gymClass.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between border-t pt-2.5 mt-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                      <UsersIcon className="h-4 w-4" />
                      <span>{gymClass.attendees.length} / {gymClass.capacity} Joined</span>
                      {spotsLeft <= 3 && spotsLeft > 0 && !isBooked && (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-200/50 text-[9px] font-bold">
                          {spotsLeft} spots left!
                        </Badge>
                      )}
                    </div>

                    {isBooked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-destructive/50 text-destructive hover:bg-destructive hover:text-white transition-all text-xs font-bold"
                        onClick={() => handleToggleBooking(gymClass)}
                        disabled={actionClassId === gymClass.id}
                      >
                        Leave
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 text-xs font-bold"
                        onClick={() => handleToggleBooking(gymClass)}
                        disabled={actionClassId === gymClass.id || (isFull && !isBooked) || client?.status !== 'Active'}
                      >
                        {isFull ? 'Full' : 'Join Class'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
