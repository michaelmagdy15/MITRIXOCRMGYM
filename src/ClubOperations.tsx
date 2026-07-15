import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebase';
import { auth } from './firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Coffee, Lock, UserCheck, Search, Plus, Key, RefreshCw, XCircle, CheckCircle2, AlertCircle, Trash2, MapPin } from 'lucide-react';
import { JuiceBarOrder, Locker, LockerRequest, GuestInvite } from './types';
import { useSettings } from './contexts/SettingsContext';

const BRANCHES = ['Heliopolis', 'Fifth Settlement', 'Zamalek', 'Sheikh Zayed'];

export default function ClubOperations() {
  const { features, branding } = useSettings();

  // --- Earth's Kitchen Juice Bar State ---
  const [juiceOrders, setJuiceOrders] = useState<JuiceBarOrder[]>([]);

  const operationsTabs = useMemo(() => {
    const list = [
      { id: 'juicebar', label: "Earth's Kitchen Orders", count: juiceOrders.length, icon: <Coffee className="h-4 w-4" />, requiredFeature: features.juiceBar },
      { id: 'lockers', label: 'Lockers & Smart Locks', icon: <Lock className="h-4 w-4" />, requiredFeature: features.locker },
      { id: 'guests', label: 'Guest Invites & Leads', icon: <UserCheck className="h-4 w-4" /> },
    ];
    return list.filter(t => t.requiredFeature !== false);
  }, [features, juiceOrders.length]);

  const [activeTab, setActiveTab] = useState<'juicebar' | 'lockers' | 'guests'>('juicebar');

  // Auto-transition if activeTab is disabled
  useEffect(() => {
    const isAllowed = operationsTabs.some(t => t.id === activeTab);
    if (!isAllowed && operationsTabs.length > 0) {
      setActiveTab(operationsTabs[0]?.id as any);
    }
  }, [operationsTabs, activeTab]);
  const [loadingJuice, setLoadingJuice] = useState(true);

  // --- Lockers State ---
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [lockerRequests, setLockerRequests] = useState<LockerRequest[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [newLockerNumber, setNewLockerNumber] = useState('');
  const [newLockerBranch, setNewLockerBranch] = useState(BRANCHES[0]);
  const [isAddingLocker, setIsAddingLocker] = useState(false);
  const [approvingRequest, setApprovingRequest] = useState<LockerRequest | null>(null);
  const [availableLockers, setAvailableLockers] = useState<Locker[]>([]);
  const [selectedLockerId, setSelectedLockerId] = useState<string>('');
  const [editingLockerPin, setEditingLockerPin] = useState<Locker | null>(null);
  const [newLockerPin, setNewLockerPin] = useState('');

  // --- Guest Invites State ---
  const [guestInvites, setGuestInvites] = useState<GuestInvite[]>([]);
  const [guestSearch, setGuestSearch] = useState('');
  const [loadingGuests, setLoadingGuests] = useState(true);

  // --- Fetch Data ---
  const fetchData = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const headers = { 'Authorization': `Bearer ${token}` };

      // 1. Fetch Juice Bar Orders
      fetch('/api/juice-bar-orders', { headers }).then(res => res.json()).then(data => {
        const list = (data || []).filter((o: any) => ['Pending', 'Preparing', 'Ready'].includes(o.status));
        const statusWeight: Record<string, number> = { Ready: 1, Preparing: 2, Pending: 3 };
        list.sort((a: any, b: any) => {
          const diff = (statusWeight[a.status] || 99) - (statusWeight[b.status] || 99);
          if (diff !== 0) return diff;
          return new Date(a.orderedAt).getTime() - new Date(b.orderedAt).getTime();
        });
        setJuiceOrders(list);
        setLoadingJuice(false);
      }).catch(err => {
        console.error("Error loading juice orders:", err);
        setLoadingJuice(false);
      });

      // 2. Fetch Lockers
      fetch('/api/lockers', { headers }).then(res => res.json()).then(data => setLockers(data || []));

      // 3. Fetch Locker Requests
      fetch('/api/locker-requests', { headers }).then(res => res.json()).then(data => {
        setLockerRequests((data || []).filter((r: any) => r.status === 'Pending'));
      });

      // 4. Fetch Guest Invites
      fetch('/api/guest-invites', { headers }).then(res => res.json()).then(data => {
        setGuestInvites(data || []);
        setLoadingGuests(false);
      }).catch(err => {
        console.error("Error loading guest invites:", err);
        setLoadingGuests(false);
      });
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch available lockers when approving a request
  useEffect(() => {
    if (!approvingRequest) {
      setAvailableLockers([]);
      setSelectedLockerId('');
      return;
    }
    const filtered = lockers.filter(
      l => l.branch === approvingRequest.branch && l.status === 'Available'
    );
    setAvailableLockers(filtered);
    setSelectedLockerId(filtered[0]?.id || '');
  }, [approvingRequest, lockers]);

  // --- Juice Bar Actions ---
  const updateJuiceStatus = async (orderId: string, currentStatus: string) => {
    let nextStatus: string = currentStatus;
    if (currentStatus === 'Pending') nextStatus = 'Preparing';
    else if (currentStatus === 'Preparing') nextStatus = 'Ready';
    else if (currentStatus === 'Ready') nextStatus = 'Completed';

    try {
      const token = await auth.currentUser?.getIdToken();
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
      await fetch('/api/juice-bar-orders/update-status', {
        method: 'POST', headers, body: JSON.stringify({ id: orderId, status: nextStatus })
      });
      await fetch('/api/audit-logs/add', {
        method: 'POST', headers, body: JSON.stringify({
          log: {
            id: crypto.randomUUID(), action: 'UPDATE', entityType: 'SYSTEM', entityId: orderId,
            details: `Juice Bar Order status advanced from ${currentStatus} to ${nextStatus}`,
            timestamp: new Date().toISOString(), userId: 'staff-portal', userName: 'Club Receptionist'
          }
        })
      });
      fetchData();
    } catch (err) {
      console.error("Error updating order status:", err);
      alert("Failed to update status.");
    }
  };

  const cancelJuiceOrder = async (orderId: string) => {
    if (!window.confirm("Cancel this pre-order?")) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/juice-bar-orders/update-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: orderId, status: 'Cancelled' })
      });
      fetchData();
    } catch (err) {
      console.error("Error cancelling order:", err);
    }
  };

  // --- Locker Actions ---
  const handleAddLocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLockerNumber || isAddingLocker) return;

    // Check duplicate locker number at branch
    const exists = lockers.some(
      l => l.number === newLockerNumber.trim() && l.branch === newLockerBranch
    );
    if (exists) {
      alert(`Locker ${newLockerNumber} already exists at ${newLockerBranch} branch.`);
      return;
    }

    setIsAddingLocker(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/lockers/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          locker: {
            id: crypto.randomUUID(),
            lockerNumber: newLockerNumber.trim(),
            branch: newLockerBranch,
            status: 'Available',
            pinCode: '1234'
          }
        })
      });
      setNewLockerNumber('');
      alert("Locker added successfully.");
    } catch (err) {
      console.error("Error adding locker:", err);
      alert("Failed to add locker.");
    } finally {
      setIsAddingLocker(false);
    }
  };

  const handleApproveLockerRequest = async () => {
    if (!approvingRequest || !selectedLockerId) return;

    try {
      const locker = lockers.find(l => l.id === selectedLockerId);
      if (!locker) return;

      // 1. Update locker document
      const token = await auth.currentUser?.getIdToken();
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
      await fetch('/api/lockers/update', {
        method: 'POST', headers, body: JSON.stringify({
          id: selectedLockerId, updates: { status: 'Assigned', assignedTo: approvingRequest.clientId, assignedToName: approvingRequest.clientName }
        })
      });

      // 2. Update request document
      await fetch('/api/locker-requests/update-status', {
        method: 'POST', headers, body: JSON.stringify({ id: approvingRequest.id, status: 'Approved' })
      });

      // 3. Log to auditLogs
      await fetch('/api/audit-logs/add', {
        method: 'POST', headers, body: JSON.stringify({
          log: {
            id: crypto.randomUUID(), action: 'UPDATE', entityType: 'SYSTEM', entityId: selectedLockerId,
            details: `Smart Locker ${locker.number} (${locker.branch}) assigned to client ${approvingRequest.clientName}`,
            timestamp: new Date().toISOString(), userId: 'staff-portal', userName: 'Club Receptionist'
          }
        })
      });

      setApprovingRequest(null);
      alert("Locker request approved and assigned.");
    } catch (err) {
      console.error("Error approving request:", err);
      alert("Failed to approve request.");
    }
  };

  const handleDenyLockerRequest = async (request: LockerRequest) => {
    if (!window.confirm(`Deny locker request from ${request.clientName}?`)) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/locker-requests/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: request.id, status: 'Denied' })
      });
    } catch (err) {
      console.error("Error denying request:", err);
    }
  };

  const releaseLocker = async (locker: Locker) => {
    if (!window.confirm(`Release locker ${locker.number} currently assigned to ${locker.assignedToName}?`)) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
      await fetch('/api/lockers/update', {
        method: 'POST', headers, body: JSON.stringify({
          id: locker.id, updates: { status: 'Available', assignedTo: '', assignedToName: '' }
        })
      });

      await fetch('/api/audit-logs/add', {
        method: 'POST', headers, body: JSON.stringify({
          log: {
            id: crypto.randomUUID(), action: 'UPDATE', entityType: 'SYSTEM', entityId: locker.id,
            details: `Locker ${locker.number} released from client ${locker.assignedToName}`,
            timestamp: new Date().toISOString(), userId: 'staff-portal', userName: 'Club Receptionist'
          }
        })
      });
    } catch (err) {
      console.error("Error releasing locker:", err);
    }
  };

  const changeLockerStatus = async (lockerId: string, newStatus: 'Available' | 'Maintenance') => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/lockers/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          id: lockerId, updates: { status: newStatus }
        })
      });
    } catch (err) {
      console.error("Error changing locker status:", err);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLockerPin || !newLockerPin) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/lockers/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          id: editingLockerPin.id, updates: { pinCode: newLockerPin.trim() }
        })
      });
      setEditingLockerPin(null);
      setNewLockerPin('');
      alert("Locker PIN code updated.");
    } catch (err) {
      console.error("Error updating pin:", err);
    }
  };

  // --- Guest Invites Actions ---
  const handleCheckinGuest = async (invite: GuestInvite) => {
    if (!window.confirm(`Check in ${invite.guestName}? This will convert them to a Lead.`)) return;

    try {
      // 1. Update guestInvite status
      const token = await auth.currentUser?.getIdToken();
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
      await fetch('/api/guest-invites/update-status', {
        method: 'POST', headers, body: JSON.stringify({ id: invite.id, status: 'Attended' })
      });

      // 2. Add client record as Lead
      await fetch('/api/clients/add', {
        method: 'POST', headers, body: JSON.stringify({
          id: crypto.randomUUID(),
          client: {
            name: invite.guestName,
            phone: invite.guestPhone,
            status: 'Lead',
            stage: 'Trial',
            source: 'Walk-in',
            interest: 'Pending',
            category: 'None',
            createdAt: new Date().toISOString(),
            assignedTo: '',
            comments: [
              {
                id: Math.random().toString(),
                text: `Guest Checked In via referral code: ${invite.inviteCode} (Invited by ${invite.hostName})`,
                date: new Date().toISOString(),
                author: 'Front Desk'
              }
            ]
          }
        })
      });

      // 3. Log to audit logs
      await fetch('/api/audit-logs/add', {
        method: 'POST', headers, body: JSON.stringify({
          log: {
            id: crypto.randomUUID(), action: 'CREATE', entityType: 'LEAD', entityId: invite.inviteCode,
            details: `Guest ${invite.guestName} checked in using referral code ${invite.inviteCode} (Member: ${invite.hostName})`,
            timestamp: new Date().toISOString(), userId: 'staff-portal', userName: 'Club Receptionist'
          }
        })
      });

      alert(`${invite.guestName} successfully checked in and added to Leads list.`);
    } catch (err) {
      console.error("Error checking in guest:", err);
      alert("Failed to check in guest.");
    }
  };

  // --- Filters ---
  const filteredLockers = selectedBranch === 'All'
    ? lockers
    : lockers.filter(l => l.branch === selectedBranch);

  const filteredGuests = guestInvites.filter(g =>
    g.guestName.toLowerCase().includes(guestSearch.toLowerCase()) ||
    g.guestPhone.includes(guestSearch) ||
    g.inviteCode.toLowerCase().includes(guestSearch.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Club Operations</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Manage locker rooms, Earth's Kitchen orders, and check-in referrals.</p>
      </div>

      {/* Main Tab bar */}
      <div className="flex gap-2 border-b border-zinc-800 pb-px">
        {operationsTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {tab.icon} {tab.label} {'count' in tab ? `(${tab.count})` : ''}
          </button>
        ))}
      </div>

      {/* Earth's Kitchen orders tab */}
      {activeTab === 'juicebar' && (
        <Card className="border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Coffee className="h-4 w-4 text-primary animate-pulse" /> Pre-order Preparation Queue
            </CardTitle>
            <CardDescription className="text-[11px]">Active beverage and protein bowl orders sorted by pickup schedules.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingJuice ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : juiceOrders.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {juiceOrders.map(order => (
                  <Card key={order.id} className="border bg-zinc-950/40 relative">
                    <CardContent className="p-4 space-y-3.5">
                      <div className="flex justify-between items-start border-b border-white/5 pb-2">
                        <div>
                          <strong className="text-xs font-bold text-foreground block">{order.clientName}</strong>
                          <span className="text-[9px] text-zinc-500 font-mono">Pickup: {order.pickupTime}</span>
                        </div>
                        <Badge className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${order.status === 'Ready' ? 'bg-emerald-500/10 text-emerald-400' : order.status === 'Preparing' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-500'}`}>
                          {order.status}
                        </Badge>
                      </div>

                      <div className="space-y-1 text-xs">
                        {order.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-muted-foreground">
                            <span>{it.name} <strong className="text-primary font-bold">x{it.quantity}</strong></span>
                            <span className="font-mono text-[10px]">{branding.currencySymbol || 'LE'} {it.price * it.quantity}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-white/5">
                        <Button
                          size="sm"
                          className="flex-1 font-bold text-[10px] h-8"
                          onClick={() => updateJuiceStatus(order.id, order.status)}
                        >
                          {order.status === 'Pending' ? 'Start Preparing' : order.status === 'Preparing' ? 'Mark Ready' : 'Complete Order'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] text-destructive border-destructive/20 hover:bg-destructive hover:text-white h-8"
                          onClick={() => cancelJuiceOrder(order.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground italic">
                No active orders in Earth's Kitchen queue right now.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lockers management tab */}
      {activeTab === 'lockers' && (
        <div className="space-y-6">
          {/* Section: Pending Locker Requests */}
          {lockerRequests.length > 0 && (
            <Card className="border-primary/20 bg-amber-500/5 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-amber-500">
                  <AlertCircle className="h-4 w-4" /> Pending Locker Requests ({lockerRequests.length})
                </CardTitle>
                <CardDescription className="text-[11px]">Members requesting physical lockboxes assigned at their branch location.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-zinc-800">
                  {lockerRequests.map(req => (
                    <div key={req.id} className="flex justify-between items-center py-2.5">
                      <div>
                        <strong className="text-xs font-bold text-foreground block">{req.clientName}</strong>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-semibold uppercase mt-0.5">
                          <MapPin className="h-3 w-3" /> {req.branch} Branch
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-8 text-[10px] font-bold"
                          onClick={() => setApprovingRequest(req)}
                        >
                          Approve & Assign
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[10px] text-destructive border-destructive/20 hover:bg-destructive hover:text-white"
                          onClick={() => handleDenyLockerRequest(req)}
                        >
                          Deny
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Controls: Branch Filter & Add Locker */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground">Filter Branch</Label>
                <Select value={selectedBranch} onValueChange={(val) => setSelectedBranch(val || '')}>
                  <SelectTrigger className="w-44 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Branches</SelectItem>
                    {BRANCHES.map(br => (
                      <SelectItem key={br} value={br}>{br}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick Add Locker Form */}
            <Card className="border bg-zinc-950/20 p-4 rounded-xl flex-1 max-w-md">
              <form onSubmit={handleAddLocker} className="flex gap-3 items-end">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="lockNum" className="text-[10px] font-bold text-zinc-400 uppercase">Locker Number</Label>
                  <Input
                    id="lockNum"
                    type="text"
                    placeholder="e.g. 105"
                    value={newLockerNumber}
                    onChange={e => setNewLockerNumber(e.target.value)}
                    required
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="lockBranch" className="text-[10px] font-bold text-zinc-400 uppercase">Branch</Label>
                  <Select value={newLockerBranch} onValueChange={(val) => setNewLockerBranch(val || '')}>
                    <SelectTrigger id="lockBranch" className="h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BRANCHES.map(br => (
                        <SelectItem key={br} value={br}>{br}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" size="sm" className="h-8 font-bold text-[10px] px-3.5" disabled={isAddingLocker}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </form>
            </Card>
          </div>

          {/* Locker Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {filteredLockers.map(locker => (
              <Card key={locker.id} className="border bg-card/45 relative group overflow-hidden">
                <CardContent className="p-3 text-center space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold font-mono">{locker.branch.substring(0, 4)}</span>
                    <Badge className={`text-[8px] px-1 py-px rounded-full font-bold ${locker.status === 'Available' ? 'bg-emerald-500/10 text-emerald-400' : locker.status === 'Assigned' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`}>
                      {locker.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-xl font-extrabold text-foreground tracking-tight block">{locker.number}</span>
                    <span className="text-[9px] text-zinc-500 font-mono font-semibold flex items-center justify-center gap-0.5 mt-0.5">
                      <Key className="h-2.5 w-2.5 text-primary" /> PIN: {locker.code || '----'}
                    </span>
                  </div>

                  {locker.status === 'Assigned' && (
                    <div className="text-[9px] text-zinc-400 font-semibold truncate leading-tight pt-1 border-t border-white/5">
                      👤 {locker.assignedToName}
                    </div>
                  )}

                  {/* Actions context bar */}
                  <div className="flex gap-1 pt-1.5 justify-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit Lock PIN"
                      className="h-6 w-6 rounded-md hover:bg-zinc-900 text-zinc-400 hover:text-white"
                      onClick={() => {
                        setEditingLockerPin(locker);
                        setNewLockerPin(locker.code || '');
                      }}
                    >
                      <Key className="h-3 w-3" />
                    </Button>
                    {locker.status === 'Assigned' ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Release Locker"
                        className="h-6 w-6 rounded-md hover:bg-zinc-900 text-destructive"
                        onClick={() => releaseLocker(locker)}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        title={locker.status === 'Maintenance' ? 'Put Available' : 'Put Under Maintenance'}
                        className="h-6 w-6 rounded-md hover:bg-zinc-900 text-zinc-400"
                        onClick={() => changeLockerStatus(locker.id, locker.status === 'Maintenance' ? 'Available' : 'Maintenance')}
                      >
                        <XCircle className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Guest invites converter tab */}
      {activeTab === 'guests' && (
        <Card className="border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" /> Guest Referral Code check-in
            </CardTitle>
            <CardDescription className="text-[11px]">Verify guest codes issued by members and check them in to create CRM Leads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by code, guest name, phone..."
                value={guestSearch}
                onChange={e => setGuestSearch(e.target.value)}
                className="pl-9 bg-background h-9 text-xs"
              />
            </div>

            {loadingGuests ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : filteredGuests.length > 0 ? (
              <div className="divide-y divide-zinc-800">
                {filteredGuests.map(invite => (
                  <div key={invite.id} className="flex justify-between items-center py-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-bold text-foreground">{invite.guestName}</strong>
                        <Badge className={`text-[8px] px-1.5 py-px rounded-full font-bold ${invite.status === 'Attended' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-500'}`} variant="outline">
                          {invite.status === 'Attended' ? 'Checked In' : 'Pending Check-In'}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-semibold">Phone: {invite.guestPhone} | Host Member: {invite.hostName}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <strong className="font-mono text-xs tracking-wider text-primary bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                        {invite.inviteCode}
                      </strong>
                      {invite.status === 'Pending' && (
                        <Button
                          size="sm"
                          className="h-8 font-bold text-[10px]"
                          onClick={() => handleCheckinGuest(invite)}
                        >
                          Check-In Guest
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground italic">
                No guest invites matching your search filters.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Approve Locker Request Dialog */}
      <Dialog open={approvingRequest !== null} onOpenChange={open => { if (!open) setApprovingRequest(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Assign Smart Locker</DialogTitle>
            <DialogDescription>
              Assign a physical locker box for {approvingRequest?.clientName} at {approvingRequest?.branch} branch.
            </DialogDescription>
          </DialogHeader>

          {availableLockers.length > 0 ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="lockerSel">Select Available Locker</Label>
                <Select value={selectedLockerId} onValueChange={(val) => setSelectedLockerId(val || '')}>
                  <SelectTrigger id="lockerSel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLockers.map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        Locker #{l.number} (PIN: {l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setApprovingRequest(null)}>
                  Cancel
                </Button>
                <Button type="button" className="font-bold" onClick={handleApproveLockerRequest}>
                  Assign Locker
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-4 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
              <p className="text-xs text-muted-foreground font-semibold">
                No "Available" lockers found at the <strong>{approvingRequest?.branch}</strong> branch. Mark locker maintenance complete or add new lockers first.
              </p>
              <DialogFooter>
                <Button type="button" className="w-full" variant="outline" onClick={() => setApprovingRequest(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Locker PIN Dialog */}
      <Dialog open={editingLockerPin !== null} onOpenChange={open => { if (!open) setEditingLockerPin(null); }}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>Edit Locker PIN</DialogTitle>
            <DialogDescription>
              Modify the digital lockbox PIN code for Locker #{editingLockerPin?.number} ({editingLockerPin?.branch}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePin} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pincode">New 4-digit PIN Code</Label>
              <Input
                id="pincode"
                type="text"
                maxLength={4}
                value={newLockerPin}
                onChange={e => setNewLockerPin(e.target.value.replace(/\D/g, ''))}
                required
                className="bg-background font-mono tracking-widest text-center text-lg"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingLockerPin(null)}>
                Cancel
              </Button>
              <Button type="submit" className="font-bold">
                Save PIN
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
