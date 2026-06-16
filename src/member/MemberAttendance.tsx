import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Calendar, Clock, Dumbbell, History } from 'lucide-react';

export default function MemberAttendance({ client }: { client: Client | null }) {
  const [attendances, setAttendances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'attendance'),
      where('clientId', '==', client.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort in-memory by date descending
      list.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setAttendances(list);
      setLoading(false);
    }, (err) => {
      console.error("Error listening to attendance logs:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [client?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <History className="h-5 w-5 text-primary animate-pulse" />
          Attendance History
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">Your complete workout and class attendance timeline.</p>
      </div>

      {attendances.length === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground">
            <div className="bg-primary/5 p-4 rounded-full mb-3 border border-primary/10">
              <Dumbbell className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <p className="font-semibold text-sm">No workouts recorded yet</p>
            <p className="text-xs max-w-[240px] mt-1">
              Your check-in history will show up here automatically when you scan your card at the front desk.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative border-l border-primary/20 ml-3.5 pl-6 space-y-6">
          {attendances.map((item, index) => {
            const dateObj = parseISO(item.date);
            const timeStr = format(dateObj, 'h:mm a');
            const dayName = format(dateObj, 'EEEE');
            const dateStr = format(dateObj, 'dd MMM yyyy');

            return (
              <div key={item.id || index} className="relative group">
                {/* Timeline Dot */}
                <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border-2 border-primary bg-background ring-4 ring-background group-hover:scale-125 transition-transform duration-200" />
                
                {/* Check-In Row */}
                <Card className="border bg-card/40 hover:bg-card/75 transition-all shadow-sm">
                  <CardContent className="p-4 flex justify-between items-center">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-bold">{dayName}, {dateStr}</span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-semibold">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="h-3.5 w-3.5 text-zinc-400" /> {timeStr}
                        </span>
                        <span className="flex items-center gap-1 text-primary uppercase tracking-wider text-[10px]">
                          <MapPin className="h-3 w-3" /> {item.branch || 'COMPLEX'}
                        </span>
                      </div>
                    </div>

                    {item.packageName && (
                      <div className="text-right">
                        <span className="text-[10px] font-bold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md">
                          {item.packageName}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
