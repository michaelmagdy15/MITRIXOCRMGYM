import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc } from 'firebase/firestore';
import { ClassSchedule, ClassBooking } from '../types/class';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, CheckCircle, XCircle, Clock, Search } from 'lucide-react';
import { format, parseISO, isSameDay } from 'date-fns';
import { Input } from '@/components/ui/input';

export default function CoachClassPortal() {
  const { currentUser } = useAuth();
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Client mapping for names
  const [clientMap, setClientMap] = useState<Record<string, Client>>({});

  useEffect(() => {
    if (!currentUser) return;
    
    // Fetch classes assigned to this instructor (from today onwards)
    const q = query(
      collection(db, 'classSchedules'), 
      where('instructorId', '==', currentUser.id)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const records = snap.docs.map(d => ({ ...d.data(), id: d.id } as ClassSchedule));
      
      // Filter out past classes manually (or keep today's)
      const now = new Date();
      now.setHours(0,0,0,0);
      
      const upcoming = records.filter(c => {
        const d = new Date(c.startTime);
        d.setHours(0,0,0,0);
        return d.getTime() >= now.getTime();
      });
      
      upcoming.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      setClasses(upcoming);
      setLoading(false);
    });
    
    return () => unsub();
  }, [currentUser?.id]);

  useEffect(() => {
    // Pre-fetch all clients to map memberId -> Name
    const fetchClients = async () => {
      const q = query(collection(db, 'clients'), where('status', '!=', 'Lead'));
      const snap = await getDocs(q);
      const map: Record<string, Client> = {};
      snap.docs.forEach(doc => {
        map[doc.id] = { ...doc.data(), id: doc.id } as Client;
      });
      setClientMap(map);
    };
    fetchClients();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (selectedClass) {
    return (
      <ClassRosterView 
        classData={selectedClass} 
        clientMap={clientMap} 
        onBack={() => setSelectedClass(null)} 
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> My Classes
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your upcoming class rosters and attendance.</p>
        </div>
      </div>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Users className="h-12 w-12 opacity-20" />
            <p>You have no upcoming classes assigned.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {classes.map(c => {
            const date = new Date(c.startTime);
            const isToday = isSameDay(date, new Date());
            return (
              <Card 
                key={c.id} 
                className={`hover:shadow-md transition-shadow cursor-pointer ${isToday ? 'border-primary/50' : ''}`}
                onClick={() => setSelectedClass(c)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      {c.name}
                      {isToday && <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">Today</Badge>}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(date, 'EEEE, MMM d • h:mm a')}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="outline" className="text-xs">Capacity: {c.capacity}</Badge>
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-[10px] uppercase">
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClassRosterView({ classData, clientMap, onBack }: { classData: ClassSchedule, clientMap: Record<string, Client>, onBack: () => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const attendees = classData.attendees || [];
  const waitlist = classData.waitlist || [];
  const checkedIn = classData.checkedIn || [];
  const noShows = classData.noShows || [];

  const handleStatusUpdate = async (memberId: string, action: 'checkin' | 'noshow' | 'uncheckin') => {
    setUpdating(memberId);
    try {
      const classRef = doc(db, 'classSchedules', classData.id);
      
      if (action === 'checkin') {
        const newCheckedIn = [...checkedIn, memberId];
        const newNoShows = noShows.filter(id => id !== memberId);
        await updateDoc(classRef, { checkedIn: newCheckedIn, noShows: newNoShows });
      } else if (action === 'noshow') {
        const newNoShows = [...noShows, memberId];
        const newCheckedIn = checkedIn.filter(id => id !== memberId);
        await updateDoc(classRef, { noShows: newNoShows, checkedIn: newCheckedIn });
      } else if (action === 'uncheckin') {
        const newCheckedIn = checkedIn.filter(id => id !== memberId);
        const newNoShows = noShows.filter(id => id !== memberId);
        await updateDoc(classRef, { checkedIn: newCheckedIn, noShows: newNoShows });
      }
    } catch (e) {
      console.error('Failed to update status:', e);
      alert('Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const allMembers = [...attendees.map(id => ({ id, status: 'booked' })), ...waitlist.map(id => ({ id, status: 'waitlist' }))];

  const filteredMembers = allMembers.filter(m => {
    const clientName = clientMap[m.id]?.name?.toLowerCase() || '';
    return clientName.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Button variant="outline" size="sm" onClick={onBack}>← Back to Classes</Button>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <h2 className="text-xl font-bold">{classData.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {format(new Date(classData.startTime), 'EEEE, MMMM d, yyyy • h:mm a')}
          </p>
          <div className="flex gap-2 mt-3">
            <Badge variant="secondary">{attendees.length} / {classData.capacity} Booked</Badge>
            {waitlist.length > 0 && <Badge variant="destructive">{waitlist.length} Waitlisted</Badge>}
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search roster..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Roster</h3>
        {filteredMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No members found.</p>
        ) : (
          filteredMembers.map(member => {
            const client = clientMap[member.id];
            const isCheckedIn = checkedIn.includes(member.id);
            const isNoShow = noShows.includes(member.id);
            const isWaitlisted = member.status === 'waitlist';

            return (
              <Card key={member.id} className={isCheckedIn ? 'border-green-200 bg-green-50/30' : isNoShow ? 'border-red-200 bg-red-50/30' : ''}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{client?.name || 'Unknown Member'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {isWaitlisted ? (
                        <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-600">Waitlisted (#{waitlist.indexOf(member.id) + 1})</Badge>
                      ) : isCheckedIn ? (
                        <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">Checked In</Badge>
                      ) : isNoShow ? (
                        <Badge variant="secondary" className="text-xs bg-red-500/10 text-red-600">No Show</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-blue-500 border-blue-200">Booked</Badge>
                      )}
                    </div>
                  </div>
                  
                  {!isWaitlisted && (
                    <div className="flex gap-2">
                      {isCheckedIn || isNoShow ? (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-muted-foreground"
                          disabled={updating === member.id}
                          onClick={() => handleStatusUpdate(member.id, 'uncheckin')}
                        >
                          Undo Status
                        </Button>
                      ) : (
                        <>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 text-green-600 border-green-200 hover:bg-green-50"
                            disabled={updating === member.id}
                            onClick={() => handleStatusUpdate(member.id, 'checkin')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Check In
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 text-red-500 border-red-200 hover:bg-red-50"
                            disabled={updating === member.id}
                            onClick={() => handleStatusUpdate(member.id, 'noshow')}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> No Show
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

