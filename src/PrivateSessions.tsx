import React, { useState, useMemo } from 'react';
import { useAppContext } from './context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { format, isSameDay, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PTPackageRecord, Branch } from './types';
import { 
  MapPin, 
  Users as TrainerIcon, 
  Clock, 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Calendar as CalendarIcon,
  ChevronRight,
  User,
  History
} from 'lucide-react';

export default function PrivateSessions() {
  const { currentUser, users, clients, updateClient, ptPackageRecords: privateSessions, addPTPackageRecord: addPrivateSession, updatePTPackageRecord: updatePrivateSession, coaches } = useAppContext();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [newSessionClientId, setNewSessionClientId] = useState('');
  const [newSessionTrainerId, setNewSessionTrainerId] = useState('');
  const [newSessionBranch, setNewSessionBranch] = useState<Branch | ''>('');
  const [newSessionTime, setNewSessionTime] = useState('10:00');
  
  const [filterBranch, setFilterBranch] = useState<Branch | 'All'>('All');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyClientId, setHistoryClientId] = useState('');

  // Analytics
  const monthStats = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    
    const monthSessions = privateSessions.filter(s => {
      const d = parseISO(s.date);
      return isWithinInterval(d, { start, end });
    });
    
    const attended = monthSessions.filter(s => s.status === 'Attended').length;
    const noShow = monthSessions.filter(s => s.status === 'No Show').length;
    const scheduled = monthSessions.filter(s => s.status === 'Scheduled').length;
    
    return {
      total: monthSessions.length,
      attended,
      noShow,
      scheduled,
      rate: monthSessions.length > 0 ? Math.round((attended / (attended + noShow || 1)) * 100) : 0
    };
  }, [privateSessions]);

  const handleAddSession = () => {
    if (newSessionClientId && selectedDate) {
      const [hours, minutes] = newSessionTime.split(':');
      const sessionDate = new Date(selectedDate as Date);
      sessionDate.setHours(parseInt(hours || '0'), parseInt(minutes || '0'));

      addPrivateSession({
        clientId: newSessionClientId,
        trainerId: newSessionTrainerId || undefined,
        branch: newSessionBranch || undefined,
        date: sessionDate.toISOString(),
        status: 'Scheduled',
      });
      setIsNewSessionOpen(false);
      setNewSessionClientId('');
      setNewSessionTrainerId('');
      setNewSessionBranch('');
    }
  };

  const handleUpdateStatus = (session: PTPackageRecord, status: PTPackageRecord['status']) => {
    updatePrivateSession(session.id, { status });
    
    if (status === 'Attended' || status === 'No Show') {
      const client = clients.find(c => c.id === session.clientId);
      if (client) {
        let currentSessions = client.sessionsRemaining;
        if (currentSessions === 'no attend') {
          const match = client.packageType?.match(/(\d+)\s*S/i) || client.packageType?.match(/(\d+)\s*Session/i);
          currentSessions = match ? parseInt(match[1]!, 10) : 0;
        }
        // Only decrement if sessions are finite and above zero (prevent negative sessions)
        if (typeof currentSessions === 'number' && currentSessions > 0) {
          updateClient(client.id, { sessionsRemaining: currentSessions - 1 });
        }
      }
    }
  };

  const sessionsForSelectedDate = privateSessions
    .filter(session => {
      const matchesDate = selectedDate && isSameDay(parseISO(session.date), selectedDate);
      const matchesBranch = filterBranch === 'All' || session.branch === filterBranch;
      return matchesDate && matchesBranch;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const historySessions = privateSessions
    .filter(s => s.clientId === historyClientId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getStatusBadge = (status: PTPackageRecord['status']) => {
    switch (status) {
      case 'Attended': return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Attended</Badge>;
      case 'No Show': return <Badge className="bg-destructive/10 text-destructive border-destructive/20">No Show</Badge>;
      case 'Cancelled': return <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>;
      case 'Scheduled': return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Scheduled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Private Sessions</h2>
          <p className="text-muted-foreground">Manage 1-on-1 member training and trainer schedules.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsHistoryOpen(true)}>
            <History className="mr-2 h-4 w-4" /> Client History
          </Button>
          <Button size="sm" onClick={() => setIsNewSessionOpen(true)}>
            <CalendarIcon className="mr-2 h-4 w-4" /> Schedule Session
          </Button>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scheduled (MTD)</p>
                <p className="text-2xl font-bold">{monthStats.total}</p>
              </div>
              <CalendarIcon className="h-8 w-8 text-primary opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Attended</p>
                <p className="text-2xl font-bold text-emerald-700">{monthStats.attended}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-emerald-600 opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Attendance Rate</p>
                <p className="text-2xl font-bold text-amber-700">{monthStats.rate}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-amber-600 opacity-20" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-none">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-destructive uppercase tracking-wider">No Shows</p>
                <p className="text-2xl font-bold text-destructive">{monthStats.noShow}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-destructive opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[350px_1fr] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">Select Date</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border mx-auto"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Branch Filter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={filterBranch} onValueChange={(v) => setFilterBranch(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Branches</SelectItem>
                  <SelectItem value="COMPLEX">COMPLEX</SelectItem>
                  <SelectItem value="MIVIDA">MIVIDA</SelectItem>
                  <SelectItem value="mitrixogymcrm IMPACT">mitrixogymcrm IMPACT</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        <Card className="flex flex-col">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Daily Schedule</CardTitle>
                <CardDescription>{selectedDate ? format(selectedDate, 'EEEE, MMMM do, yyyy') : 'No date selected'}</CardDescription>
              </div>
              <Badge variant="outline" className="bg-background">{sessionsForSelectedDate.length} Sessions</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {sessionsForSelectedDate.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground opacity-50">
                <Clock className="h-12 w-12 mb-2" />
                <p>No sessions scheduled for this date and branch.</p>
              </div>
            ) : (
              <div className="divide-y">
                {sessionsForSelectedDate.map(session => {
                  const client = clients.find(c => c.id === session.clientId);
                  const trainer = users.find(u => u.id === session.trainerId);
                  return (
                    <div key={session.id} className="p-6 hover:bg-muted/20 transition-colors group">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-start gap-4">
                          <div className="bg-primary/10 p-3 rounded-xl flex flex-col items-center justify-center min-w-[70px]">
                            <span className="text-sm font-bold text-primary">{format(parseISO(session.date), 'h:mm')}</span>
                            <span className="text-[10px] font-bold text-primary/70 uppercase">{format(parseISO(session.date), 'a')}</span>
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-bold text-lg">{client?.name || 'Unknown Client'}</h4>
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><TrainerIcon className="h-3 w-3" /> {trainer?.name || 'Unassigned'}</span>
                              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {session.branch || 'N/A'}</span>
                              <span>{getStatusBadge(session.status)}</span>
                            </div>
                          </div>
                        </div>
                        
                        {session.status === 'Scheduled' && (
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-bold" onClick={() => handleUpdateStatus(session, 'Attended')}>
                              <CheckCircle className="mr-2 h-4 w-4" /> Attended
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/5 font-bold" onClick={() => handleUpdateStatus(session, 'No Show')}>
                              <XCircle className="mr-2 h-4 w-4" /> No Show
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={isNewSessionOpen} onOpenChange={setIsNewSessionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule New Session</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <div className="p-2 border rounded-md bg-muted/50 text-sm font-medium">
                  {selectedDate ? format(selectedDate, 'PPP') : 'Select date first'}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={newSessionTime} onChange={(e) => setNewSessionTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={newSessionClientId} onValueChange={(v) => v && setNewSessionClientId(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.filter(c => c.status === 'Active').map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name} ({client.sessionsRemaining} left)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Trainer (Optional)</Label>
              <Select value={newSessionTrainerId} onValueChange={(v) => v && setNewSessionTrainerId(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trainer" />
                </SelectTrigger>
                <SelectContent>
                   {users.filter(u => u.role === 'coach' || coaches.some(c => c.active && c.userId === u.id)).map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={newSessionBranch} onValueChange={(v) => setNewSessionBranch(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLEX">COMPLEX</SelectItem>
                  <SelectItem value="MIVIDA">MIVIDA</SelectItem>
                  <SelectItem value="mitrixogymcrm IMPACT">mitrixogymcrm IMPACT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full mt-2" onClick={handleAddSession} disabled={!newSessionClientId || !selectedDate || !newSessionBranch}>
              Confirm Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member Session History</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Member</Label>
              <Select value={historyClientId} onValueChange={(v) => v && setHistoryClientId(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {historyClientId && (
              <div className="border rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Trainer</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historySessions.length > 0 ? (
                      historySessions.map(session => (
                        <TableRow key={session.id}>
                          <TableCell className="font-medium">
                            {format(parseISO(session.date), 'MMM d, yyyy @ h:mm a')}
                          </TableCell>
                          <TableCell className="text-sm">
                            {users.find(u => u.id === session.trainerId)?.name || '-'}
                          </TableCell>
                          <TableCell className="text-xs font-bold opacity-70">
                            {session.branch}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(session.status)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground italic">
                          No session history found for this member.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

