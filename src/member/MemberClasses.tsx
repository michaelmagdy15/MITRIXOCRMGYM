import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Users as UsersIcon, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';

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

  // Seed default classes/events if the database is empty
  const seedDemoClasses = async () => {
    const ref = collection(db, 'classes');
    const snap = await getDocs(ref);
    if (!snap.empty) return; // Already seeded or has custom data

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
  };

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    // Run seed checking
    seedDemoClasses().then(() => {
      const q = collection(db, 'classes');
      const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as GymClass));
        // Sort by date then time
        list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        setClasses(list);
        setLoading(false);
      }, (err) => {
        console.error("Error loading classes:", err);
        setLoading(false);
      });
      return unsub;
    });
  }, [client?.id, client?.branch]);

  const handleToggleBooking = async (gymClass: GymClass) => {
    if (!client || !client.id) return;
    setActionClassId(gymClass.id);

    try {
      const isBooked = gymClass.attendees.includes(client.id);
      let updatedAttendees = [...gymClass.attendees];

      if (isBooked) {
        // Leave class
        updatedAttendees = updatedAttendees.filter(id => id !== client.id);
      } else {
        // Join class
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const formatClassDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'EEEE, dd MMM');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" /> Gym Classes & Events
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">Explore group boxing sessions, masterclasses, and club events.</p>
      </div>

      <div className="space-y-4">
        {classes.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-12 text-center text-muted-foreground text-xs italic">
              No upcoming classes or events scheduled. Please check back later.
            </CardContent>
          </Card>
        ) : (
          classes.map(gymClass => {
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
                      <span className="text-xs font-bold font-mono">{formatClassDate(gymClass.date)}</span>
                      <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{gymClass.time}</span>
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
