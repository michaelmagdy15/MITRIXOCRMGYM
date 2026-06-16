import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { Client, PTPackageRecord } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Users, Search, Phone, Minus, CheckCircle2, AlertTriangle, Activity, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../contexts/ThemeContext';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export default function CoachClients() {
  const { currentUser } = useAuth();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'my-clients' | 'all-members'>('my-clients');
  const [myClients, setMyClients] = useState<Client[]>([]);
  const [allMembers, setAllMembers] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Manual deduction modal state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [deductionNotes, setDeductionNotes] = useState('');
  const [isDeducting, setIsDeducting] = useState(false);
  const [deductionSuccess, setDeductionSuccess] = useState(false);

  // Performance modal state
  const [selectedPerformanceClient, setSelectedPerformanceClient] = useState<Client | null>(null);
  const [performanceTab, setPerformanceTab] = useState<'history' | 'log'>('history');
  const [performanceHistory, setPerformanceHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // New Performance Log Form State
  const [logWeight, setLogWeight] = useState('');
  const [logNutrition, setLogNutrition] = useState('');
  const [logWorkoutNotes, setLogWorkoutNotes] = useState('');
  const [logPrs, setLogPrs] = useState<{ exercise: string; weight: string; reps: string }[]>([]);
  const [isSavingPerformance, setIsSavingPerformance] = useState(false);

  // Fetch coach's clients
  const fetchMyClients = async () => {
    if (!currentUser) return;
    try {
      const sessionsQ = query(collection(db, 'sessions'), where('trainerId', '==', currentUser.id));
      const sessionsSnap = await getDocs(sessionsQ);
      const clientIds = [...new Set(sessionsSnap.docs.map(d => d.data().clientId as string))];
      if (clientIds.length === 0) {
        setMyClients([]);
        return;
      }

      const allClients: Client[] = [];
      for (let i = 0; i < clientIds.length; i += 30) {
        const batch = clientIds.slice(i, i + 30);
        const clientsQ = query(collection(db, 'clients'), where('__name__', 'in', batch));
        const snap = await getDocs(clientsQ);
        snap.docs.forEach(d => allClients.push({ ...d.data(), id: d.id } as Client));
      }
      setMyClients(allClients);
    } catch (err) {
      console.error("Error fetching my clients:", err);
    }
  };

  // Fetch all active members in the gym
  const fetchAllActiveMembers = async () => {
    try {
      const q = query(collection(db, 'clients'), where('status', '==', 'Active'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as Client));
      setAllMembers(list);
    } catch (err) {
      console.error("Error fetching active members:", err);
    }
  };

  const fetchPerformanceHistory = async (clientId: string) => {
    setLoadingHistory(true);
    try {
      const q = query(collection(db, 'clientPerformance'), where('clientId', '==', clientId));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      list.sort((a: any, b: any) => b.date.localeCompare(a.date));
      setPerformanceHistory(list);
    } catch (err) {
      console.error("Error fetching performance history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchMyClients();
      await fetchAllActiveMembers();
      setLoading(false);
    };
    loadData();
  }, [currentUser?.id]);

  const handleDeductSession = async () => {
    if (!selectedClient || !currentUser) return;
    setIsDeducting(true);
    try {
      const remaining = typeof selectedClient.sessionsRemaining === 'number' 
        ? selectedClient.sessionsRemaining 
        : parseInt(String(selectedClient.sessionsRemaining || '0'), 10);

      if (isNaN(remaining) || remaining <= 0) {
        throw new Error('No sessions remaining to deduct.');
      }

      const newRemaining = remaining - 1;

      // 1. Update clients collection
      await updateDoc(doc(db, 'clients', selectedClient.id), {
        sessionsRemaining: newRemaining
      });

      // 2. Add to sessions collection (PT Session Attended)
      await addDoc(collection(db, 'sessions'), {
        clientId: selectedClient.id,
        date: new Date().toISOString(),
        status: 'Attended',
        notes: deductionNotes.trim() || 'Manually deducted by Coach',
        trainerId: currentUser.id,
        branch: currentUser.branch || selectedClient.branch || 'ALL'
      });

      // 3. Add to attendance collection (Check-in log)
      await addDoc(collection(db, 'attendance'), {
        clientId: selectedClient.id,
        branch: currentUser.branch || selectedClient.branch || 'ALL',
        date: new Date().toISOString(),
        recordedBy: currentUser.id,
        packageName: selectedClient.packageType || '',
      });

      // 4. Log to auditLogs
      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'CLIENT',
        entityId: selectedClient.id,
        details: `Manual PT session deduction: -1 session for ${selectedClient.name}. Notes: ${deductionNotes || 'None'}. Remaining: ${newRemaining}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name || 'Coach',
      });

      setDeductionSuccess(true);
      
      // Refresh local lists
      await fetchMyClients();
      await fetchAllActiveMembers();
      
      setTimeout(() => {
        setSelectedClient(null);
        setDeductionSuccess(false);
        setDeductionNotes('');
      }, 1500);

    } catch (err: any) {
      alert(err.message || 'Failed to deduct session.');
    } finally {
      setIsDeducting(false);
    }
  };

  const handleSavePerformance = async () => {
    if (!selectedPerformanceClient || !currentUser) return;
    setIsSavingPerformance(true);
    try {
      const parsedPrs = logPrs
        .filter(pr => pr.exercise.trim() !== '')
        .map(pr => ({
          exercise: pr.exercise.trim(),
          weight: parseFloat(pr.weight) || 0,
          reps: parseInt(pr.reps, 10) || 0
        }));

      await addDoc(collection(db, 'clientPerformance'), {
        clientId: selectedPerformanceClient.id,
        coachId: currentUser.id,
        coachName: currentUser.name || 'Coach',
        date: new Date().toISOString(),
        weight: parseFloat(logWeight) || null,
        nutritionNotes: logNutrition.trim(),
        workoutNotes: logWorkoutNotes.trim(),
        prs: parsedPrs
      });

      // Log in audit log
      await addDoc(collection(db, 'auditLogs'), {
        action: 'CREATE',
        entityType: 'CLIENT',
        entityId: selectedPerformanceClient.id,
        details: `Logged performance details (Weight: ${logWeight || 'N/A'}, PRs count: ${parsedPrs.length}) for ${selectedPerformanceClient.name}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name || 'Coach',
      });

      // Reset form
      setLogWeight('');
      setLogNutrition('');
      setLogWorkoutNotes('');
      setLogPrs([]);
      
      // Refresh history & switch tab
      await fetchPerformanceHistory(selectedPerformanceClient.id);
      setPerformanceTab('history');

    } catch (err: any) {
      alert(err.message || 'Failed to save performance log.');
    } finally {
      setIsSavingPerformance(false);
    }
  };

  const statusColor: Record<string, string> = {
    Active: 'bg-green-500/10 text-green-600 border-green-500/20',
    'Nearly Expired': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    Expired: 'bg-red-500/10 text-red-600 border-red-500/20',
    Lead: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    Hold: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  };

  const displayedList = activeTab === 'my-clients' ? myClients : allMembers;

  const filtered = displayedList.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search) ||
    (c.memberId || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Member Management
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          View client sessions, log fitness performance, and manually deduct attending sessions.
        </p>
      </div>

      <div className="flex border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'my-clients' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => { setActiveTab('my-clients'); setSearch(''); }}
        >
          My Clients
        </button>
        <button
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'all-members' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          onClick={() => { setActiveTab('all-members'); setSearch(''); }}
        >
          Search All Active Members
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, phone, or member ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Users className="h-12 w-12 opacity-20" />
            <p>{search ? 'No members match your search.' : 'No members found.'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map(client => {
            const sessionsCount = typeof client.sessionsRemaining === 'number' 
              ? client.sessionsRemaining 
              : parseInt(String(client.sessionsRemaining || '0'), 10);
            const hasSessions = !isNaN(sessionsCount) && sessionsCount > 0;

            return (
              <Card key={client.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{client.name}</p>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span>{client.phone}</span>
                        {client.memberId && <span className="font-mono text-xs">· {client.memberId}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex flex-col items-end gap-1 mr-2">
                      <Badge variant="outline" className={`text-xs ${statusColor[client.status] || ''}`}>{client.status}</Badge>
                      {client.sessionsRemaining !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {client.sessionsRemaining} sessions left
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-primary/20 hover:border-primary/40 text-primary"
                      onClick={() => {
                        setSelectedPerformanceClient(client);
                        setPerformanceTab('history');
                        fetchPerformanceHistory(client.id);
                      }}
                    >
                      <Activity className="h-3.5 w-3.5" /> Stats
                    </Button>
                    {hasSessions && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all"
                        onClick={() => { setSelectedClient(client); setDeductionNotes(''); }}
                      >
                        <Minus className="h-3.5 w-3.5" /> Deduct
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Manual Deduction Confirmation Modal */}
      <Dialog open={selectedClient !== null} onOpenChange={open => { if (!open) setSelectedClient(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Manual PT Session Deduction
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to deduct 1 PT session from <strong>{selectedClient?.name}</strong>?
            </DialogDescription>
          </DialogHeader>

          {deductionSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="font-semibold text-lg">Deduction Successful!</p>
              <p className="text-xs text-muted-foreground">The client's session count has been updated.</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/50 border rounded-lg text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Sessions:</span>
                  <strong className="font-mono">{selectedClient?.sessionsRemaining}</strong>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>After Deduction:</span>
                  <strong className="font-mono">
                    {typeof selectedClient?.sessionsRemaining === 'number' 
                      ? selectedClient.sessionsRemaining - 1 
                      : parseInt(String(selectedClient?.sessionsRemaining || '0'), 10) - 1}
                  </strong>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deduction-notes">Session Notes (Optional)</Label>
                <Textarea
                  id="deduction-notes"
                  placeholder="e.g. Attended Sparring class, Boxing training..."
                  value={deductionNotes}
                  onChange={e => setDeductionNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSelectedClient(null)} disabled={isDeducting}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeductSession}
                  disabled={isDeducting}
                  className="gap-1 font-bold"
                >
                  {isDeducting ? 'Deducting...' : 'Deduct 1 Session'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Performance Dialog */}
      <Dialog open={selectedPerformanceClient !== null} onOpenChange={open => { if (!open) { setSelectedPerformanceClient(null); setLogPrs([]); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Fitness Progress: {selectedPerformanceClient?.name}
            </DialogTitle>
            <DialogDescription>
              Log workout weights, PRs, and macro notes for this member.
            </DialogDescription>
          </DialogHeader>

          <div className="flex border-b border-border mt-2">
            <button
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${performanceTab === 'history' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setPerformanceTab('history')}
            >
              History
            </button>
            <button
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${performanceTab === 'log' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => { setPerformanceTab('log'); setLogPrs([]); }}
            >
              Log New Stats
            </button>
          </div>

          {performanceTab === 'history' ? (
            <div className="max-h-[350px] overflow-y-auto pr-1 py-4 space-y-3 scroll-touch">
              {loadingHistory ? (
                <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
              ) : performanceHistory.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground italic py-8">No performance logs recorded yet.</p>
              ) : (
                <>
                  {(() => {
                    const weightChartData = [...performanceHistory]
                      .filter(log => log.weight !== null && log.weight !== undefined && !isNaN(parseFloat(log.weight)))
                      .map(log => ({
                        date: format(parseISO(log.date), 'dd MMM'),
                        weight: parseFloat(log.weight)
                      }))
                      .reverse();

                    const strokeColor = theme === 'dark' ? '#f4f4f5' : '#09090b';
                    const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
                    const textColor = theme === 'dark' ? '#a1a1aa' : '#71717a';

                    if (weightChartData.length === 0) return null;

                    return (
                      <div className="p-3 border rounded-xl bg-card/40 mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5" /> Weight Trend (kg)
                        </p>
                        <div className="h-32 w-full -ml-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={weightChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                              <XAxis dataKey="date" stroke={textColor} fontSize={9} tickLine={false} axisLine={false} />
                              <YAxis stroke={textColor} fontSize={9} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff',
                                  borderColor: theme === 'dark' ? '#27272a' : '#e4e4e7',
                                  color: theme === 'dark' ? '#ffffff' : '#000000',
                                  borderRadius: '8px',
                                  fontSize: '10px'
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="weight"
                                stroke={strokeColor}
                                strokeWidth={2}
                                dot={{ stroke: strokeColor, strokeWidth: 1.5, r: 2.5, fill: theme === 'dark' ? '#09090b' : '#ffffff' }}
                                activeDot={{ r: 4, strokeWidth: 0, fill: strokeColor }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })()}
                  {performanceHistory.map(log => (
                    <Card key={log.id} className="border bg-card/50">
                      <CardContent className="p-3.5 space-y-2.5">
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span className="font-semibold">By Coach {log.coachName}</span>
                        <span className="font-mono">{format(parseISO(log.date), 'dd MMM yyyy, h:mm a')}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {log.weight && (
                          <div className="bg-muted/40 p-2 rounded-lg">
                            <span className="text-[10px] text-muted-foreground block uppercase font-bold">Weight</span>
                            <strong className="text-sm font-bold">{log.weight} kg</strong>
                          </div>
                        )}
                      </div>

                      {log.workoutNotes && (
                        <div className="text-xs">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Workout Notes</span>
                          <p className="mt-0.5 text-muted-foreground leading-relaxed">{log.workoutNotes}</p>
                        </div>
                      )}

                      {log.nutritionNotes && (
                        <div className="text-xs border-t pt-2 mt-1">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Nutrition / Diet Notes</span>
                          <p className="mt-0.5 text-muted-foreground leading-relaxed">{log.nutritionNotes}</p>
                        </div>
                      )}

                      {log.prs && log.prs.length > 0 && (
                        <div className="text-xs border-t pt-2 mt-1">
                          <span className="text-[10px] text-muted-foreground block uppercase font-bold">Personal Records (PRs)</span>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {log.prs.map((pr: any, i: number) => (
                              <Badge key={i} variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px]">
                                {pr.exercise}: {pr.weight} kg x {pr.reps} reps
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                </>
              )}
            </div>
          ) : (
            <div className="max-h-[350px] overflow-y-auto pr-1 py-4 space-y-4 scroll-touch">
              <div className="space-y-1.5">
                <Label htmlFor="weight-input">Current Weight (kg)</Label>
                <Input
                  id="weight-input"
                  type="number"
                  placeholder="e.g. 78.5"
                  value={logWeight}
                  onChange={e => setLogWeight(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="workout-input">Workout / Performance Notes</Label>
                <Textarea
                  id="workout-input"
                  placeholder="e.g. Great energy today, Sparring form improved, increased power..."
                  value={logWorkoutNotes}
                  onChange={e => setLogWorkoutNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nutrition-input">Nutrition / Diet Notes</Label>
                <Textarea
                  id="nutrition-input"
                  placeholder="e.g. Increase daily protein intake to 150g, stay hydrated..."
                  value={logNutrition}
                  onChange={e => setLogNutrition(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2 border-t pt-3">
                <div className="flex justify-between items-center">
                  <Label className="text-xs uppercase tracking-wider font-bold">Personal Records (PRs)</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    className="h-7 text-xs"
                    onClick={() => setLogPrs(prev => [...prev, { exercise: '', weight: '', reps: '' }])}
                  >
                    + Add Exercise
                  </Button>
                </div>

                {logPrs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">No PRs added for this entry.</p>
                ) : (
                  <div className="space-y-2">
                    {logPrs.map((pr, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <Input
                          placeholder="e.g. Bench Press"
                          value={pr.exercise}
                          onChange={e => {
                            const copy = [...logPrs];
                            copy[idx]!.exercise = e.target.value;
                            setLogPrs(copy);
                          }}
                          className="flex-1 h-8 text-xs"
                        />
                        <Input
                          placeholder="wt"
                          type="number"
                          value={pr.weight}
                          onChange={e => {
                            const copy = [...logPrs];
                            copy[idx]!.weight = e.target.value;
                            setLogPrs(copy);
                          }}
                          className="w-16 h-8 text-xs"
                        />
                        <Input
                          placeholder="reps"
                          type="number"
                          value={pr.reps}
                          onChange={e => {
                            const copy = [...logPrs];
                            copy[idx]!.reps = e.target.value;
                            setLogPrs(copy);
                          }}
                          className="w-14 h-8 text-xs"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 h-8 w-8 shrink-0"
                          onClick={() => setLogPrs(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 border-t pt-3">
                <Button variant="outline" onClick={() => setSelectedPerformanceClient(null)} disabled={isSavingPerformance}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSavePerformance}
                  disabled={isSavingPerformance}
                  className="font-bold"
                >
                  {isSavingPerformance ? 'Saving...' : 'Save Entry'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
