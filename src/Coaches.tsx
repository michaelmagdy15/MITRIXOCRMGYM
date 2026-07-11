import React, { useState } from 'react';
import { useAppContext } from './context';
import { useCoaches } from './hooks/useCoaches';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coach } from './types';
import { Plus, Edit, Trash2, Calendar, Phone, DollarSign, Users, Shield, Save, Briefcase, Mail } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { format, parseISO } from 'date-fns';

export default function Coaches() {
  const { currentUser, canAccessSettings, ptPackageRecords, clients, payments, users } = useAppContext();
  const { coaches, addCoach, updateCoach, deleteCoach } = useCoaches();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [coachToDelete, setCoachToDelete] = useState<string | null>(null);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [active, setActive] = useState(true);

  // Manage Coach State
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [managingCoach, setManagingCoach] = useState<Coach | null>(null);
  const [coachSchedule, setCoachSchedule] = useState<Record<string, { enabled: boolean; startTime: string; endTime: string }>>({});
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const DAYS = [
    { key: 'monday',    label: 'Monday' },
    { key: 'tuesday',   label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday',  label: 'Thursday' },
    { key: 'friday',    label: 'Friday' },
    { key: 'saturday',  label: 'Saturday' },
    { key: 'sunday',    label: 'Sunday' },
  ];

  if (!canAccessSettings) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  const handleAdd = async () => {
    if (name) {
      await addCoach({
        name,
        active,
        phone
      });
      setIsAddOpen(false);
      resetForm();
    }
  };

  const handleEdit = async () => {
    if (editingCoach && name) {
      await updateCoach(editingCoach.id, {
        name,
        active,
        phone
      });
      setIsEditOpen(false);
      setEditingCoach(null);
      resetForm();
    }
  };

  const handleDelete = async (id: string) => {
    setCoachToDelete(id);
    setIsConfirmDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (coachToDelete) {
      await deleteCoach(coachToDelete);
      setCoachToDelete(null);
    }
  };

  const openEdit = (coach: Coach) => {
    setEditingCoach(coach);
    setName(coach.name);
    setActive(coach.active);
    setPhone(coach.phone || '');
    setIsEditOpen(true);
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setActive(true);
  };

  // Manage functions
  const openManage = (coach: Coach) => {
    setManagingCoach(coach);
    setIsManageOpen(true);
    if (coach.userId) {
      fetchCoachSchedule(coach.userId);
    } else {
      setCoachSchedule({});
    }
  };

  const fetchCoachSchedule = async (coachUserId: string) => {
    setLoadingSchedule(true);
    try {
      const ref = doc(db, 'coachSchedules', coachUserId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setCoachSchedule(snap.data().days || {});
      } else {
        const defaultSched = Object.fromEntries(
          DAYS.map(d => [d.key, { enabled: d.key !== 'sunday', startTime: '09:00', endTime: '21:00' }])
        );
        setCoachSchedule(defaultSched);
      }
    } catch (err) {
      console.error("Error fetching coach schedule:", err);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handleSaveSchedule = async (coachUserId: string) => {
    setIsSavingSchedule(true);
    try {
      await setDoc(doc(db, 'coachSchedules', coachUserId), {
        coachId: coachUserId,
        days: coachSchedule,
        updatedAt: new Date().toISOString(),
      });
      alert("Coach schedule saved successfully!");
    } catch (err) {
      console.error("Error saving coach schedule:", err);
      alert("Failed to save coach schedule.");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const updateDay = (day: string, field: 'enabled' | 'startTime' | 'endTime', value: boolean | string) => {
    setCoachSchedule(prev => {
      const dayData = prev[day] || { enabled: false, startTime: '09:00', endTime: '21:00' };
      return {
        ...prev,
        [day]: { ...dayData, [field]: value }
      };
    });
  };

  // Memoized stats for the active coach
  const coachClients = React.useMemo(() => {
    if (!managingCoach || !managingCoach.userId) return [];
    const trainerSessions = ptPackageRecords.filter(r => r.trainerId === managingCoach.userId);
    const clientIds = Array.from(new Set(trainerSessions.map(s => s.clientId)));
    
    return clientIds.map(cid => {
      const client = clients.find(c => c.id === cid);
      if (!client) return null;
      
      const attendedCount = trainerSessions.filter(s => s.clientId === cid && s.status === 'Attended').length;
      const scheduledCount = trainerSessions.filter(s => s.clientId === cid && s.status === 'Scheduled').length;
      
      return {
        id: client.id,
        name: client.name,
        phone: client.phone,
        status: client.status,
        packageType: client.packageType || 'N/A',
        sessionsTrained: attendedCount,
        sessionsScheduled: scheduledCount,
        sessionsRemaining: client.sessionsRemaining
      };
    }).filter(Boolean);
  }, [managingCoach, ptPackageRecords, clients]);

  const revenueDetails = React.useMemo(() => {
    if (!managingCoach) return { total: 0, thisMonth: 0, payments: [] };
    const coachPayments = payments.filter(p => 
      (p.coachName || '').toLowerCase() === managingCoach.name.toLowerCase() ||
      (p.coach_name || '').toLowerCase() === managingCoach.name.toLowerCase()
    );
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const total = coachPayments.reduce((acc, p) => acc + (Number(p.amount_paid) || Number(p.amount) || 0), 0);
    const thisMonth = coachPayments.reduce((acc, p) => {
      const pDate = p.date ? new Date(p.date) : p.created_at ? new Date(p.created_at) : null;
      if (pDate && pDate.getFullYear() === currentYear && pDate.getMonth() === currentMonth) {
        return acc + (Number(p.amount_paid) || Number(p.amount) || 0);
      }
      return acc;
    }, 0);

    return {
      total,
      thisMonth,
      payments: coachPayments.sort((a, b) => {
        const dateA = a.date || a.created_at || '';
        const dateB = b.date || b.created_at || '';
        return dateB.localeCompare(dateA);
      })
    };
  }, [managingCoach, payments]);

  const linkedUser = React.useMemo(() => {
    if (!managingCoach?.userId) return null;
    return users.find(u => u.id === managingCoach.userId);
  }, [managingCoach, users]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Coach Management</h2>
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" /> Add Coach
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Coach</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Coach Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SHADY YOUSSEF" />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +20 123 456 7890" />
              </div>
              <div className="space-y-2">
                <Label>Active Status</Label>
                <Select value={active ? "true" : "false"} onValueChange={v => v && setActive(v === "true")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Save Coach</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coaches.map(coach => (
                <TableRow key={coach.id}>
                  <TableCell className="font-medium">{coach.name}</TableCell>
                  <TableCell>{coach.phone || '-'}</TableCell>
                  <TableCell>
                    {coach.active ? (
                      <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20" variant="outline">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground border-muted-foreground/20">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1.5">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openManage(coach)}>
                        <Briefcase className="h-3.5 w-3.5" /> Manage
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(coach)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive h-8 w-8 hover:bg-destructive/10" onClick={() => handleDelete(coach.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {coaches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No coaches found. Create one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Coach Modal */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Coach</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Coach Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Active Status</Label>
              <Select value={active ? "true" : "false"} onValueChange={v => v && setActive(v === "true")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit}>Update Coach</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Coach Dialog */}
      <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Briefcase className="h-5 w-5 text-primary" />
              Manage Coach: {managingCoach?.name}
            </DialogTitle>
            <DialogDescription>
              View detailed statistics, clients roster, scheduling, and payment revenue.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-4">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="clients">Clients</TabsTrigger>
                <TabsTrigger value="revenue">Revenue</TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Phone className="h-4 w-4" /> Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <p className="text-sm font-semibold">{managingCoach?.name}</p>
                      <p className="text-sm text-muted-foreground">{managingCoach?.phone || 'No phone recorded'}</p>
                      <div className="mt-2">
                        {managingCoach?.active ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20" variant="outline">Active status</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground border-muted-foreground/20">Inactive status</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Shield className="h-4 w-4" /> Portal Account Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {linkedUser ? (
                        <div className="space-y-1 text-sm">
                          <p className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-semibold">{linkedUser.email}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Coach ID: <span className="font-mono">{linkedUser.coachId || '-'}</span>
                          </p>
                          {linkedUser.mustChangePassword && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">
                              Forced password reset pending
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm space-y-1">
                          <p className="text-muted-foreground italic">No linked login account found.</p>
                          <p className="text-xs text-muted-foreground">Portal accounts are auto-created for Active coaches.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Schedule Tab */}
              <TabsContent value="schedule" className="space-y-4">
                {!managingCoach?.userId ? (
                  <div className="flex flex-col items-center justify-center p-8 bg-muted/20 border border-dashed rounded-lg gap-2 text-center">
                    <Calendar className="h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm font-medium">No schedule available</p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Schedules can only be managed for coaches with active portal accounts. Enable the coach to create one.
                    </p>
                  </div>
                ) : loadingSchedule ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b">
                      <p className="text-sm text-muted-foreground">Set coach weekly hours and availability.</p>
                      <Button 
                        size="sm" 
                        onClick={() => handleSaveSchedule(managingCoach.userId!)} 
                        disabled={isSavingSchedule}
                        className="gap-1.5 h-8 font-semibold"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {isSavingSchedule ? 'Saving...' : 'Save Schedule'}
                      </Button>
                    </div>

                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {DAYS.map(({ key, label }) => {
                        const day = coachSchedule[key] || { enabled: false, startTime: '09:00', endTime: '21:00' };
                        return (
                          <div key={key} className={`flex items-center justify-between p-3 border rounded-lg bg-card/50 transition-opacity ${day.enabled ? '' : 'opacity-60'}`}>
                            <div className="flex items-center gap-3">
                              <Switch 
                                checked={day.enabled}
                                onCheckedChange={(v) => updateDay(key, 'enabled', v)}
                              />
                              <span className="text-sm font-semibold">{label}</span>
                            </div>

                            {day.enabled ? (
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground">From</span>
                                  <Input 
                                    type="time" 
                                    value={day.startTime || '09:00'} 
                                    onChange={(e) => updateDay(key, 'startTime', e.target.value)} 
                                    className="h-8 w-24 text-xs" 
                                  />
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground">To</span>
                                  <Input 
                                    type="time" 
                                    value={day.endTime || '21:00'} 
                                    onChange={(e) => updateDay(key, 'endTime', e.target.value)} 
                                    className="h-8 w-24 text-xs" 
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic mr-2">Unavailable / Off</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Clients Tab */}
              <TabsContent value="clients" className="space-y-4">
                {coachClients.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 bg-muted/20 border border-dashed rounded-lg gap-2 text-center">
                    <Users className="h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm font-medium">No clients found</p>
                    <p className="text-xs text-muted-foreground">
                      This coach has not been scheduled for any Private Training sessions yet.
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="py-2.5">Client</TableHead>
                          <TableHead className="py-2.5">Package Type</TableHead>
                          <TableHead className="py-2.5 text-center">Sessions Trained</TableHead>
                          <TableHead className="py-2.5 text-right">Remaining</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {coachClients.map(c => c && (
                          <TableRow key={c.id}>
                            <TableCell className="py-2.5">
                              <p className="font-semibold text-xs">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground">{c.phone}</p>
                            </TableCell>
                            <TableCell className="py-2.5 text-xs max-w-[150px] truncate">{c.packageType}</TableCell>
                            <TableCell className="py-2.5 text-center text-xs font-semibold">{c.sessionsTrained} attended</TableCell>
                            <TableCell className="py-2.5 text-right text-xs font-mono font-semibold">{c.sessionsRemaining ?? '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* Revenue Tab */}
              <TabsContent value="revenue" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="bg-muted/20">
                    <CardHeader className="p-3 pb-1">
                      <CardDescription className="text-xs uppercase tracking-wider">This Month's Revenue</CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="text-2xl font-bold text-green-500">{revenueDetails.thisMonth.toLocaleString()} LE</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/20">
                    <CardHeader className="p-3 pb-1">
                      <CardDescription className="text-xs uppercase tracking-wider">Total Revenue Generated</CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="text-2xl font-bold text-primary">{revenueDetails.total.toLocaleString()} LE</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-primary" /> Payments Breakdown ({revenueDetails.payments.length})
                  </p>

                  {revenueDetails.payments.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-6 border rounded-lg border-dashed">
                      No revenue transactions logged under this coach name.
                    </p>
                  ) : (
                    <div className="border rounded-lg max-h-[200px] overflow-y-auto pr-1">
                      <Table>
                        <TableHeader className="bg-muted/40 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="py-2 text-xs">Date</TableHead>
                            <TableHead className="py-2 text-xs">Client</TableHead>
                            <TableHead className="py-2 text-xs">Package</TableHead>
                            <TableHead className="py-2 text-xs text-right">Paid</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {revenueDetails.payments.map(p => (
                            <TableRow key={p.id}>
                              <TableCell className="py-2 text-xs font-mono">
                                {p.date ? format(parseISO(p.date), 'dd MMM yyyy') : p.created_at ? format(parseISO(p.created_at), 'dd MMM yyyy') : '-'}
                              </TableCell>
                              <TableCell className="py-2 text-xs">{p.client_name}</TableCell>
                              <TableCell className="py-2 text-xs truncate max-w-[120px]">{p.packageType}</TableCell>
                              <TableCell className="py-2 text-xs text-right font-mono font-bold text-green-500">{(p.amount_paid || p.amount || 0).toLocaleString()} LE</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="p-4 border-t bg-muted/30">
            <Button onClick={() => setIsManageOpen(false)} className="w-full sm:w-auto font-semibold">
              Done / Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog 
        isOpen={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
        title="Delete Coach"
        description="Are you sure you want to delete this coach? This action cannot be undone."
        onConfirm={confirmDelete}
        variant="destructive"
        confirmText="Delete"
      />
    </div>
  );
}
