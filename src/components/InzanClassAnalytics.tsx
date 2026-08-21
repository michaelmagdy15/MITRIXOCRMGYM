import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ClassSchedule, ClassBooking } from '../types/class';
import { User } from '../types';
import { BarChart3, TrendingUp, Users, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';

export const InzanClassAnalytics: React.FC = () => {
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [bookings, setBookings] = useState<ClassBooking[]>([]);
  const [instructors, setInstructors] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Payout configuration (could be moved to Firestore later)
  const [payoutRate, setPayoutRate] = useState<number>(50); // Base rate per class
  const [perHeadRate, setPerHeadRate] = useState<number>(10); // Extra per attended member

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
        setInstructors(allUsers.filter(u => u.role === 'coach'));
      } catch (err) {
        console.error("Error fetching analytics data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Calculating analytics...</div>;
  }

  // Analytics Calculations
  const totalClasses = classes.length;
  const totalBookings = bookings.length;
  const totalAttended = bookings.filter(b => b.status === 'attended').length;
  const totalNoShows = bookings.filter(b => b.status === 'no-show').length;
  
  const attendanceRate = totalBookings > 0 ? Math.round((totalAttended / totalBookings) * 100) : 0;

  // Instructor Payouts
  const instructorStats = instructors.map(inst => {
    const instClasses = classes.filter(c => c.instructorId === inst.id);
    const instBookings = bookings.filter(b => instClasses.some(c => c.id === b.classId));
    
    const attendedCount = instBookings.filter(b => b.status === 'attended').length;
    
    const basePay = instClasses.length * payoutRate;
    const bonusPay = attendedCount * perHeadRate;
    const totalPayout = basePay + bonusPay;

    return {
      id: inst.id,
      name: inst.name,
      classCount: instClasses.length,
      attendedCount,
      totalPayout
    };
  }).filter(stat => stat.classCount > 0);

  return (
    <div className="space-y-6 mt-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <BarChart3 className="h-8 w-8 text-primary mb-2 opacity-80" />
            <p className="text-sm text-muted-foreground font-semibold">Total Classes</p>
            <p className="text-3xl font-bold mt-1">{totalClasses}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <Users className="h-8 w-8 text-blue-500 mb-2 opacity-80" />
            <p className="text-sm text-muted-foreground font-semibold">Total Bookings</p>
            <p className="text-3xl font-bold mt-1">{totalBookings}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <TrendingUp className="h-8 w-8 text-green-500 mb-2 opacity-80" />
            <p className="text-sm text-muted-foreground font-semibold">Attendance Rate</p>
            <p className="text-3xl font-bold mt-1 text-green-500">{attendanceRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <DollarSign className="h-8 w-8 text-amber-500 mb-2 opacity-80" />
            <p className="text-sm text-muted-foreground font-semibold">No-Shows</p>
            <p className="text-3xl font-bold mt-1 text-red-500">{totalNoShows}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instructor Payout Calculations</CardTitle>
          <div className="flex gap-4 items-center mt-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">Base Rate / Class:</span>
              <Input 
                type="number" 
                className="w-24 h-8" 
                value={payoutRate} 
                onChange={(e) => setPayoutRate(Number(e.target.value))} 
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">Bonus / Head:</span>
              <Input 
                type="number" 
                className="w-24 h-8" 
                value={perHeadRate} 
                onChange={(e) => setPerHeadRate(Number(e.target.value))} 
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Instructor</th>
                  <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Classes Taught</th>
                  <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Total Attendance</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Est. Payout (EGP)</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {instructorStats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">No classes taught yet.</td>
                  </tr>
                ) : (
                  instructorStats.map(stat => (
                    <tr key={stat.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle font-semibold">{stat.name}</td>
                      <td className="p-4 align-middle text-center">{stat.classCount}</td>
                      <td className="p-4 align-middle text-center">{stat.attendedCount}</td>
                      <td className="p-4 align-middle text-right font-bold text-green-600">
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
