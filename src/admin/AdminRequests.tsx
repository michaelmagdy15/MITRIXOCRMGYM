import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { ClipboardList, Target, PauseCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function AdminRequests() {
  const { users } = useAppContext();
  const { currentUser } = useAuth();
  
  const [assessments, setAssessments] = useState<any[]>([]);
  const [freezes, setFreezes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const coaches = users.filter(u => u.role === 'coach' || u.role === 'admin');

  const fetchRequests = async () => {
    try {
      setLoading(true);
      
      // Fetch Assessments
      const asmntSnap = await getDocs(query(collection(db, 'assessments'), orderBy('createdAt', 'desc')));
      setAssessments(asmntSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      // Fetch Freezes (bookingRequests with type: 'freeze')
      const reqsSnap = await getDocs(query(collection(db, 'bookingRequests'), orderBy('createdAt', 'desc')));
      const allReqs = reqsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      setFreezes(allReqs.filter(r => r.type === 'freeze'));
      
    } catch (err) {
      console.error("Error loading requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAssignAssessment = async (requestId: string, coachId: string) => {
    if (!currentUser) return;
    setProcessingId(requestId);
    try {
      const res = await fetch('/api/requests/assessment/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, coachId })
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchRequests();
    } catch (err) {
      console.error(err);
      alert("Failed to assign assessment.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveFreeze = async (requestId: string) => {
    if (!currentUser) return;
    setProcessingId(requestId);
    try {
      const res = await fetch('/api/requests/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId })
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchRequests();
    } catch (err) {
      console.error(err);
      alert("Failed to approve freeze request.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Requests Manager
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Review and manage member assessments and package freeze requests.</p>
        </div>
        <Button variant="outline" onClick={fetchRequests} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <Tabs defaultValue="assessments" className="w-full">
        <TabsList className="w-full sm:w-auto grid grid-cols-2">
          <TabsTrigger value="assessments" className="flex items-center gap-2">
            <Target className="h-4 w-4" /> Assessments
            {assessments.filter(a => a.status === 'Pending').length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary">{assessments.filter(a => a.status === 'Pending').length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="freezes" className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4" /> Package Freezes
            {freezes.filter(f => f.status === 'Pending').length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary">{freezes.filter(f => f.status === 'Pending').length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assessments" className="mt-4 space-y-4">
          {assessments.length === 0 && !loading && (
            <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No assessment requests found.</CardContent></Card>
          )}
          {assessments.map(req => (
            <Card key={req.id}>
              <CardContent className="p-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{req.clientName}</h3>
                    <Badge variant="outline" className={req.status === 'Pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}>
                      {req.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Requested: {format(parseISO(req.createdAt), 'dd MMM yyyy HH:mm')}</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                    <div><span className="text-muted-foreground font-semibold">Preferred Coach:</span> {req.preferredCoachName || 'Any'}</div>
                    <div><span className="text-muted-foreground font-semibold">Pref. Date/Time:</span> {req.preferredDate} {req.preferredTime}</div>
                  </div>
                  
                  {(req.injuries || req.goals) && (
                    <div className="mt-2 text-xs bg-muted/50 p-2 rounded-md space-y-1">
                      {req.injuries && <p><span className="font-semibold text-muted-foreground">Injuries:</span> {req.injuries}</p>}
                      {req.goals && <p><span className="font-semibold text-muted-foreground">Goals:</span> {req.goals}</p>}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-2 w-full md:w-48">
                  {req.status === 'Pending' ? (
                    <div className="flex flex-col gap-2">
                      <Select onValueChange={(val: string | null) => val && handleAssignAssessment(req.id, val)} disabled={processingId === req.id}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Assign Coach" />
                        </SelectTrigger>
                        <SelectContent>
                          {coaches.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="text-sm font-semibold flex items-center justify-end gap-1 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" /> Assigned
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="freezes" className="mt-4 space-y-4">
          {freezes.length === 0 && !loading && (
            <Card className="border-dashed"><CardContent className="py-8 text-center text-muted-foreground">No freeze requests found.</CardContent></Card>
          )}
          {freezes.map(req => (
            <Card key={req.id}>
              <CardContent className="p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{req.clientName}</h3>
                    <Badge variant="outline" className={req.status === 'Pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}>
                      {req.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Package: {req.packageName}</p>
                  <p className="text-xs text-muted-foreground">Requested: {format(parseISO(req.createdAt), 'dd MMM yyyy HH:mm')}</p>
                </div>
                
                <div className="flex gap-2">
                  {req.status === 'Pending' && (
                    <Button 
                      onClick={() => handleApproveFreeze(req.id)}
                      disabled={processingId === req.id}
                      className="bg-primary text-primary-foreground"
                    >
                      {processingId === req.id ? 'Approving...' : 'Approve (Extend 7 Days)'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
