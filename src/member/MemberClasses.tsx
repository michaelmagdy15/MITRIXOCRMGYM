import React, { useState, useEffect, useRef } from 'react';
import { Client } from '../types';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Users as UsersIcon, CheckCircle2, AlertTriangle, Sparkles, ShoppingBag } from 'lucide-react';
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

export default function MemberClasses({ client, onSwitchToStore }: { client: Client | null; onSwitchToStore?: () => void }) {
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

  const isPackageMatchingClass = (packageName: string, className: string): boolean => {
    const pName = packageName.toLowerCase();
    const cName = className.toLowerCase();
    
    const isPT = pName.includes('pt') || pName.includes('personal');
    if (isPT) return false;
    
    const classIsJunior = cName.includes('junior');
    const classIsKids = cName.includes('kid');
    const classIsAdvanced = cName.includes('advanced') || cName.includes('pro');
    
    const pkgHasJunior = pName.includes('junior');
    const pkgHasKids = pName.includes('kid');
    const pkgHasAdvanced = pName.includes('advanced') || pName.includes('pro');
    
    if (classIsJunior) {
      if (classIsAdvanced) {
        return pkgHasJunior && pkgHasAdvanced;
      }
      return pkgHasJunior && !pkgHasAdvanced;
    }
    
    if (classIsKids) {
      if (classIsAdvanced) {
        return pkgHasKids && pkgHasAdvanced;
      }
      return pkgHasKids && !pkgHasAdvanced;
    }
    
    // Adult class (neither kids nor junior)
    return !classIsJunior && !classIsKids && !pkgHasJunior && !pkgHasKids;
  };

  const handleToggleBooking = async (gymClass: GymClass) => {
    if (!client || !client.id) return;
    if (client.status === 'Expired') {
      alert("Your membership is expired. You must head to the STRIKE branch to renew before booking classes.");
      return;
    }
    setActionClassId(gymClass.id);

    try {
      const isBooked = gymClass.attendees.includes(client.id);
      let updatedAttendees = [...gymClass.attendees];
      let updatedPackages = client.packages ? [...client.packages] : [];
      let updatedSessionsRemaining = client.sessionsRemaining;

      if (isBooked) {
        // Leaving class: Check 1-hour cancellation limit
        const startTimeStr = gymClass.time.split(' - ')[0]; // e.g. "18:00"
        if (startTimeStr) {
          const [hours, minutes] = startTimeStr.split(':').map(Number);
          const classStart = new Date(gymClass.date);
          classStart.setHours(hours || 0, minutes || 0, 0, 0);
          
          const now = new Date();
          const diffMs = classStart.getTime() - now.getTime();
          if (diffMs < 3600000) {
            alert("Bookings cannot be cancelled less than 1 hour before the class starts.");
            return;
          }
        }

        // Leaving class: Refund 1 session
        updatedAttendees = updatedAttendees.filter(id => id !== client.id);
        
        // Find matching active GT package to refund
        const pkgToRefund = updatedPackages.find(pkg => {
          if (pkg.status !== 'Active') return false;
          const nameUpper = pkg.packageName.toUpperCase();
          const isGroup = nameUpper.includes('GT') || nameUpper.includes('GP') || nameUpper.includes('GROUP');
          if (!isGroup) return false;
          return isPackageMatchingClass(pkg.packageName, gymClass.name);
        });

        if (pkgToRefund && (pkgToRefund.sessionsRemaining as any) !== 'unlimited') {
          pkgToRefund.sessionsRemaining = (Number(pkgToRefund.sessionsRemaining) || 0) + 1;
        }

        if (client.sessionsRemaining !== 'unlimited') {
          updatedSessionsRemaining = (Number(client.sessionsRemaining) || 0) + 1;
        }
      } else {
        // Joining class: Validate capacity
        if (gymClass.attendees.length >= gymClass.capacity) {
          alert("This class is fully booked!");
          return;
        }

        // Validate package availability
        const validPkgIndex = updatedPackages.findIndex(pkg => {
          if (pkg.status !== 'Active') return false;
          const nameUpper = pkg.packageName.toUpperCase();
          const isGroup = nameUpper.includes('GT') || nameUpper.includes('GP') || nameUpper.includes('GROUP');
          if (!isGroup) return false;
          if (!isPackageMatchingClass(pkg.packageName, gymClass.name)) return false;
          const remaining = pkg.sessionsRemaining;
          return (remaining as any) === 'unlimited' || (typeof remaining === 'number' && remaining > 0);
        });

        if (validPkgIndex === -1) {
          let displayCategory = 'Adults';
          const cName = gymClass.name.toLowerCase();
          if (cName.includes('junior')) {
            displayCategory = cName.includes('advanced') || cName.includes('pro') ? 'Juniors Advanced' : 'Juniors';
          } else if (cName.includes('kid')) {
            displayCategory = cName.includes('pro') ? 'Kids Pro' : 'Kids';
          }
          alert(`You do not have any active Group Training (GT) packages matching this class category (${displayCategory}) with sessions remaining. Please buy a package first.`);
          return;
        }

        const validPkg = updatedPackages[validPkgIndex];
        if (validPkg && (validPkg.sessionsRemaining as any) !== 'unlimited') {
          validPkg.sessionsRemaining = (Number(validPkg.sessionsRemaining) || 0) - 1;
        }

        if (client.sessionsRemaining !== 'unlimited') {
          updatedSessionsRemaining = Math.max(0, (Number(client.sessionsRemaining) || 0) - 1);
        }

        updatedAttendees.push(client.id);
      }

      // Perform updates atomically in a batch
      const batch = writeBatch(db);
      batch.update(doc(db, 'classes', gymClass.id), { attendees: updatedAttendees });
      batch.update(doc(db, 'clients', client.id), { 
        packages: updatedPackages,
        sessionsRemaining: updatedSessionsRemaining
      });
      await batch.commit();

    } catch (err) {
      console.error("Failed to update booking status:", err);
      alert("Failed to update booking. Please try again.");
    } finally {
      setActionClassId(null);
    }
  };

  // Filter classes for selected date and client branch
  const filteredClasses = classes.filter(c => {
    try {
      const isDateMatch = isSameDay(parseISO(c.date), selectedDate);
      const isBranchMatch = !c.branch || c.branch === 'ALL' || c.branch === client?.branch || !client?.branch;
      return isDateMatch && isBranchMatch;
    } catch { return false; }
  });

  // Count classes per date for dot indicators
  const classCountByDate = new Map<string, number>();
  classes.forEach(c => {
    const isBranchMatch = !c.branch || c.branch === 'ALL' || c.branch === client?.branch || !client?.branch;
    if (isBranchMatch) {
      const key = c.date;
      classCountByDate.set(key, (classCountByDate.get(key) || 0) + 1);
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
