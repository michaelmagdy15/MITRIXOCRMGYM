import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ClassSchedule, ClassBooking } from '../types/class';
import { User } from '../types';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar, 
  Clock, 
  Flame, 
  AlertTriangle,
  Award
} from 'lucide-react';
import { Input } from '@/components/ui/input';

const DAYS_OF_WEEK = [
  { key: 1, label: 'Monday' },
  { key: 2, label: 'Tuesday' },
  { key: 3, label: 'Wednesday' },
  { key: 4, label: 'Thursday' },
  { key: 5, label: 'Friday' },
  { key: 6, label: 'Saturday' },
  { key: 0, label: 'Sunday' },
];

const TIME_BLOCKS = [
  { label: '06:00 - 08:00', startHour: 6, endHour: 8 },
  { label: '08:00 - 10:00', startHour: 8, endHour: 10 },
  { label: '10:00 - 12:00', startHour: 10, endHour: 12 },
  { label: '12:00 - 14:00', startHour: 12, endHour: 14 },
  { label: '14:00 - 16:00', startHour: 14, endHour: 16 },
  { label: '16:00 - 18:00', startHour: 16, endHour: 18 },
  { label: '18:00 - 20:00', startHour: 18, endHour: 20 },
  { label: '20:00 - 22:00', startHour: 20, endHour: 22 },
];

export const InzanClassAnalytics: React.FC = () => {
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [bookings, setBookings] = useState<ClassBooking[]>([]);
  const [instructors, setInstructors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Payout configuration
  const [payoutRate, setPayoutRate] = useState<number>(50); // Base rate per class (EGP)
  const [perHeadRate, setPerHeadRate] = useState<number>(10); // Extra per attended member (EGP)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clsSnap, bookSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'classSchedules')),
          getDocs(collection(db, 'classBookings')),
          getDocs(collection(db, 'users'))
        ]);
        
        setClasses(clsSnap.docs.map(d => ({ ...d.data(), id: d.id } as ClassSchedule)));
        setBookings(bookSnap.docs.map(d => ({ ...d.data(), id: d.id } as ClassBooking)));
        
        const allUsers = usersSnap.docs.map(d => ({ ...d.data(), id: d.id } as User));
        setInstructors(allUsers.filter(u => u.role === 'coach' || (u.role as string) === 'trainer'));
      } catch (err) {
        console.error("Error fetching analytics data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Compute robust metrics combining class arrays and classBookings collection
  const totalClasses = classes.length;
  
  const classAttendeeSum = classes.reduce((sum, c) => sum + (c.attendees?.length || 0), 0);
  const distinctBookingsCount = bookings.filter(b => b.status === 'booked' || b.status === 'attended').length;
  const totalBookings = Math.max(classAttendeeSum, distinctBookingsCount);

  const classCheckedInSum = classes.reduce((sum, c) => sum + (c.checkedIn?.length || 0), 0);
  const bookingsAttendedCount = bookings.filter(b => b.status === 'attended').length;
  const totalAttended = Math.max(classCheckedInSum, bookingsAttendedCount);

  const classNoShowsSum = classes.reduce((sum, c) => sum + (c.noShows?.length || 0), 0);
  const bookingsNoShowsCount = bookings.filter(b => b.status === 'no-show').length;
  const totalNoShows = Math.max(classNoShowsSum, bookingsNoShowsCount);
  
  const attendanceRate = totalBookings > 0 ? Math.round((totalAttended / totalBookings) * 100) : 0;

  // Heatmap Matrix Calculation (Day of week x Time block)
  const heatmapData = useMemo(() => {
    return DAYS_OF_WEEK.map(day => {
      const slots = TIME_BLOCKS.map(block => {
        // Find classes that match this day and fall into this time block
        const matchingClasses = classes.filter(cls => {
          if (!cls.startTime) return false;
          try {
            const classDate = new Date(cls.startTime);
            const classDay = classDate.getDay();
            const classHour = classDate.getHours();
            return classDay === day.key && classHour >= block.startHour && classHour < block.endHour;
          } catch {
            return false;
          }
        });

        const attendeesTotal = matchingClasses.reduce((sum, c) => sum + (c.attendees?.length || 0), 0);
        const capacityTotal = matchingClasses.reduce((sum, c) => sum + (c.capacity || 15), 0);
        const fillPercent = capacityTotal > 0 ? Math.round((attendeesTotal / capacityTotal) * 100) : 0;

        return {
          classCount: matchingClasses.length,
          attendeesTotal,
          capacityTotal,
          fillPercent,
          classes: matchingClasses
        };
      });

      return {
        day: day.label,
        slots
      };
    });
  }, [classes]);

  // Identify peak hours and underutilized slots
  const allSlotsFlat = heatmapData.flatMap(d => d.slots);
  const peakAttendees = Math.max(0, ...allSlotsFlat.map(s => s.attendeesTotal));
  const underutilizedCount = allSlotsFlat.filter(s => s.classCount > 0 && s.fillPercent < 30).length;

  // Instructor Stats & Payouts
  const instructorStats = instructors.map(inst => {
    const instClasses = classes.filter(c => c.instructorId === inst.id || c.instructorName?.toLowerCase() === inst.name?.toLowerCase());
    
    // Attended from class arrays or classBookings
    const classAttended = instClasses.reduce((sum, c) => sum + (c.checkedIn?.length || c.attendees?.length || 0), 0);
    const bookingAttended = bookings.filter(b => instClasses.some(c => c.id === b.classId) && b.status === 'attended').length;
    const attendedCount = Math.max(classAttended, bookingAttended);

    const totalCap = instClasses.reduce((sum, c) => sum + (c.capacity || 15), 0);
    const avgFillRate = totalCap > 0 ? Math.round((attendedCount / totalCap) * 100) : 0;
    
    const basePay = instClasses.length * payoutRate;
    const bonusPay = attendedCount * perHeadRate;
    const totalPayout = basePay + bonusPay;

    return {
      id: inst.id,
      name: inst.name,
      classCount: instClasses.length,
      attendedCount,
      avgFillRate,
      totalPayout
    };
  }).filter(stat => stat.classCount > 0);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Calculating class analytics and heatmaps...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Classes</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{totalClasses}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Active schedule slots</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Bookings</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{totalBookings}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Enrolled member spots</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance Rate</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600">{attendanceRate}%</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{totalAttended} attended</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">No-Shows</p>
              <p className="text-2xl font-bold mt-1 text-rose-600">{totalNoShows}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Unverified members</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Peak-Hour Heatmap Grid */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Flame className="h-5 w-5 text-amber-500" /> Visual Peak-Hour Heatmap
              </CardTitle>
              <CardDescription className="text-xs">
                Attendance and booking density across days of the week and studio time slots.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">Density:</span>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-muted/40 border inline-block" />
                <span className="text-[10px] text-muted-foreground">Empty</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-emerald-500/30 border border-emerald-500/40 inline-block" />
                <span className="text-[10px] text-muted-foreground">Moderate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-emerald-600 inline-block" />
                <span className="text-[10px] text-muted-foreground font-semibold">Peak</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {underutilizedCount > 0 && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>Underutilized Slots Detected:</strong> {underutilizedCount} scheduled time {underutilizedCount === 1 ? 'slot has' : 'slots have'} fill rates below 30%. Consider adjusting marketing or rescheduling off-peak hours.
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header row: Time blocks */}
              <div className="grid grid-cols-9 gap-1.5 pb-2 text-center text-xs font-semibold text-muted-foreground">
                <div className="text-left font-bold text-foreground">Day</div>
                {TIME_BLOCKS.map(block => (
                  <div key={block.label} className="text-[11px] truncate">
                    {block.label.split(' - ')[0]}
                  </div>
                ))}
              </div>

              {/* Day rows */}
              <div className="space-y-1.5">
                {heatmapData.map(dayRow => (
                  <div key={dayRow.day} className="grid grid-cols-9 gap-1.5 items-center">
                    <div className="text-xs font-medium text-foreground truncate pr-1">
                      {dayRow.day}
                    </div>
                    {dayRow.slots.map((slot, idx) => {
                      let cellStyle = 'bg-muted/20 border-border/40 text-muted-foreground/50';
                      if (slot.classCount > 0) {
                        if (slot.attendeesTotal === 0) {
                          cellStyle = 'bg-muted/40 border-muted text-muted-foreground';
                        } else if (slot.fillPercent >= 75 || slot.attendeesTotal >= 12) {
                          cellStyle = 'bg-emerald-600 text-white font-bold shadow-sm';
                        } else if (slot.fillPercent >= 40 || slot.attendeesTotal >= 6) {
                          cellStyle = 'bg-emerald-500/40 border border-emerald-500/50 text-emerald-950 dark:text-emerald-100 font-semibold';
                        } else {
                          cellStyle = 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300';
                        }
                      }

                      return (
                        <div
                          key={idx}
                          title={slot.classCount > 0 ? `${slot.classCount} class(es), ${slot.attendeesTotal}/${slot.capacityTotal} enrolled (${slot.fillPercent}%)` : 'No classes'}
                          className={`h-10 rounded-lg border flex flex-col items-center justify-center text-center transition-all cursor-default ${cellStyle}`}
                        >
                          {slot.classCount > 0 ? (
                            <>
                              <span className="text-xs leading-none">{slot.attendeesTotal}</span>
                              <span className="text-[9px] opacity-80 leading-tight">
                                {slot.fillPercent}%
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px]">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instructor Performance & Payout Calculations */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" /> Instructor Performance & Payout Calculations
              </CardTitle>
              <CardDescription className="text-xs">
                Audit class volume, member attendance counts, fill percentages, and automated payroll payouts.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-medium">Base/Class:</span>
                <Input 
                  type="number" 
                  className="w-20 h-8 text-xs font-semibold" 
                  value={payoutRate} 
                  onChange={(e) => setPayoutRate(Number(e.target.value))} 
                />
                <span className="text-xs text-muted-foreground">EGP</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-medium">Bonus/Head:</span>
                <Input 
                  type="number" 
                  className="w-20 h-8 text-xs font-semibold" 
                  value={perHeadRate} 
                  onChange={(e) => setPerHeadRate(Number(e.target.value))} 
                />
                <span className="text-xs text-muted-foreground">EGP</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b bg-muted/20">
                <tr className="border-b">
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Instructor</th>
                  <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Classes Taught</th>
                  <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Total Attendance</th>
                  <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Avg Fill Rate</th>
                  <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Est. Payout</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0 divide-y">
                {instructorStats.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">No instructor class history found yet.</td>
                  </tr>
                ) : (
                  instructorStats.map(stat => (
                    <tr key={stat.id} className="transition-colors hover:bg-muted/40">
                      <td className="p-4 align-middle font-semibold text-foreground">
                        {stat.name}
                      </td>
                      <td className="p-4 align-middle text-center text-sm">
                        {stat.classCount}
                      </td>
                      <td className="p-4 align-middle text-center text-sm font-medium">
                        {stat.attendedCount}
                      </td>
                      <td className="p-4 align-middle text-center">
                        <Badge variant="outline" className="text-xs">
                          {stat.avgFillRate}%
                        </Badge>
                      </td>
                      <td className="p-4 align-middle text-right font-bold text-emerald-600 text-base">
                        {stat.totalPayout.toLocaleString()} EGP
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
