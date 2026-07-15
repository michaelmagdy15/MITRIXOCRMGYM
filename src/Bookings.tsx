import React, { useState, useEffect } from 'react';
import { useAppContext } from './context';
import { db, auth } from './firebase';
import { collection, onSnapshot, doc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Clock, User, Phone, Mail, Search, ShieldAlert, DollarSign, MapPin, CheckCircle } from 'lucide-react';
import { processPaymentTransaction } from './services/transactionService';
import { Package, Branch } from './types';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BookingItem {
  packageId: string;
  packageName: string;
  price: number;
  quantity: number;
  sessions: number;
  type: string;
  expiryDays: number;
}

interface BookingRequest {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientId: string;
  items: BookingItem[];
  totalPrice: number;
  paymentMethod: string;
  instapayRef?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
}

export default function Bookings() {
  const { currentUser, users, packages, branches } = useAppContext();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');

  // Accept Dialog State
  const [selectedRequest, setSelectedRequest] = useState<BookingRequest | null>(null);
  const [isAcceptOpen, setIsAcceptOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientBranch, setClientBranch] = useState<Branch | ''>('');
  const [clientGender, setClientGender] = useState('Prefer not to say');
  const [salesRepId, setSalesRepId] = useState('');
  const [processingAccept, setProcessingAccept] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  // Reject Dialog State
  const [rejectingRequest, setRejectingRequest] = useState<BookingRequest | null>(null);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processingReject, setProcessingReject] = useState(false);

  // Fetch booking requests
  const fetchBookingRequests = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/booking-requests', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = data.bookingRequests || [];
      list.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
      setRequests(list);
      setLoading(false);
    } catch (err) {
      console.error("Error loading booking requests:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookingRequests();
  }, []);

  // Pre-fill accept dialog when selected
  useEffect(() => {
    if (selectedRequest) {
      setClientName(selectedRequest.clientName);
      setClientPhone(selectedRequest.clientPhone);
      setClientEmail(selectedRequest.clientEmail);
      setAcceptError('');
      
      // Look up existing client branch and gender
      if (selectedRequest.clientId && selectedRequest.clientId !== 'GUEST-LEAD') {
        const docRef = doc(db, 'clients', selectedRequest.clientId);
        getDocs(query(collection(db, 'clients'), where('id', '==', selectedRequest.clientId))).then(snap => {
          if (!snap.empty && snap.docs[0]) {
            const data = snap.docs[0].data();
            if (data.branch) setClientBranch(data.branch);
            if (data.gender) setClientGender(data.gender);
          }
        }).catch(err => console.error("Error loading client record for accept dialog:", err));
      }
    } else {
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientBranch('');
      setClientGender('Prefer not to say');
      setSalesRepId('');
    }
  }, [selectedRequest]);

  const resolveCategory = (pkg: Package): 'Private Training' | 'Group Training' => {
    const lowerName = pkg.name.toLowerCase();
    const lowerType = (pkg.type || '').toLowerCase();
    if (lowerName.includes('private') || lowerName.includes('pt') || lowerType.includes('private')) {
      return 'Private Training';
    }
    return 'Group Training';
  };

  const handleAcceptConfirm = async () => {
    if (!selectedRequest) return;
    if (!clientBranch) {
      setAcceptError('Please select a branch for the member.');
      return;
    }
    if (!salesRepId) {
      setAcceptError('Please assign a sales representative for this booking.');
      return;
    }

    setProcessingAccept(true);
    setAcceptError('');

    try {
      const assignedRep = users.find(u => u.id === salesRepId);
      const repName = assignedRep?.name || 'Unassigned';

      // 1. Update the client's profile details on the spot
      if (selectedRequest.clientId && selectedRequest.clientId !== 'GUEST-LEAD') {
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/clients/update-from-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            id: selectedRequest.clientId,
            fields: {
              name: clientName,
              phone: clientPhone,
              branch: clientBranch,
              gender: clientGender,
              status: 'Active',
              lastContactDate: new Date().toISOString()
            }
          })
        });
      }

      // 2. Loop through items in booking request and run transaction for each package
      for (const item of selectedRequest.items) {
        // Find matching system package config
        const sysPkg = packages.find(p => p.id === item.packageId || p.name.toLowerCase() === item.packageName.toLowerCase());
        const category = sysPkg ? resolveCategory(sysPkg) : 'Group Training';

        const isKidsPackage = item.packageName.toLowerCase().includes('kids') || item.packageName.toLowerCase().includes('junior');
        if (isKidsPackage && clientBranch !== 'Mivida') {
          alert(`Booking rejected: "${item.packageName}" can only be booked at the Mivida branch.`);
          return;
        }

        await processPaymentTransaction({
          clientId: selectedRequest.clientId,
          clientName: clientName,
          clientBranch: clientBranch,
          clientStatus: 'Active',
          amount: item.price * item.quantity,
          method: selectedRequest.paymentMethod as any,
          instapayRef: selectedRequest.instapayRef || undefined,
          packageType: item.packageName,
          packageCategory: category,
          recordedBy: currentUser?.id || 'admin',
          recordedByName: currentUser?.name || 'Admin',
          sales_rep_id: salesRepId,
          salesName: repName,
          paymentDate: new Date().toISOString(),
          startDate: new Date().toISOString(),
          systemPackage: sysPkg,
          notes: `Storefront booking request approved. Method: ${selectedRequest.paymentMethod}`
        });
      }

      // 3. Mark the booking request as Approved
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/booking-requests/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: selectedRequest.id, status: 'Approved' })
      });

      // 4. Create an automatic Follow Up task
      await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          task: {
            id: crypto.randomUUID(),
            title: `Follow up with ${clientName}`,
            description: `Follow up on recently activated package. Ensure everything is smooth.`,
            dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            assignedTo: salesRepId,
            status: 'Pending',
            type: 'Follow Up',
            createdAt: new Date().toISOString()
          }
        })
      });

      fetchBookingRequests();

      try {
        const { notifyClient } = await import('./services/pushService');
        const pkgNames = selectedRequest.items.map(item => item.packageName).join(', ');
        await notifyClient(
          selectedRequest.clientId,
          'Purchase Approved! 🎉',
          `Your request for ${pkgNames} has been approved and activated.`
        );
      } catch (err) {
        console.error('Failed to send client push notification:', err);
      }

      setIsAcceptOpen(false);
      setSelectedRequest(null);
    } catch (err: any) {
      console.error("Error accepting booking request:", err);
      setAcceptError(err.message || 'Failed to approve booking request.');
    } finally {
      setProcessingAccept(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingRequest) return;
    setProcessingReject(true);

    try {
      // 1. Mark the booking request as Rejected
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/booking-requests/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: rejectingRequest.id, status: 'Rejected' })
      });

      // 2. Add a follow-up task
      if (salesRepId) {
        await fetch('/api/tasks/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            task: {
              id: crypto.randomUUID(),
              title: `Follow up with ${rejectingRequest.clientName} regarding rejected request`,
              description: `Reason: ${rejectReason}`,
              dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              assignedTo: salesRepId,
              status: 'Pending',
              type: 'Follow Up',
              createdAt: new Date().toISOString()
            }
          })
        });
      }
      
      fetchBookingRequests();

      // Notify client via push notification
      try {
        const { notifyClient } = await import('./services/pushService');
        await notifyClient(
          rejectingRequest.clientId,
          'Purchase Request Declined',
          `Your booking request has been declined. ${rejectReason ? `Reason: ${rejectReason}` : ''}`
        );
      } catch (err) {
        console.error('Failed to send client push notification:', err);
      }

      setIsRejectOpen(false);
      setRejectingRequest(null);
      setRejectReason('');
    } catch (err) {
      console.error("Error rejecting booking request:", err);
    } finally {
      setProcessingReject(false);
    }
  };

  // Filter requests
  const filteredRequests = requests.filter(r => {
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      r.clientName.toLowerCase().includes(q) || 
      r.clientPhone.includes(q) || 
      r.clientEmail.toLowerCase().includes(q) || 
      (r.instapayRef && r.instapayRef.includes(q)) ||
      r.items.some(i => i.packageName.toLowerCase().includes(q));

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">App Bookings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage package purchase requests submitted from the mobile storefront.</p>
        </div>
        
        {/* Status Filter Tab Group */}
        <div className="flex bg-muted p-1 rounded-xl border border-border/40">
          {(['Pending', 'Approved', 'Rejected', 'All'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === tab 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search by name, phone, package, or reference..." 
          className="ps-9 bg-card border-none"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Bookings Table */}
      <Card className="border bg-card/40">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground text-xs italic">
              No booking requests found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px] uppercase font-bold text-xs">Date</TableHead>
                  <TableHead className="uppercase font-bold text-xs">Client</TableHead>
                  <TableHead className="uppercase font-bold text-xs">Requested Package(s)</TableHead>
                  <TableHead className="uppercase font-bold text-xs">Price</TableHead>
                  <TableHead className="uppercase font-bold text-xs">Payment Method</TableHead>
                  <TableHead className="w-[120px] uppercase font-bold text-xs">Status</TableHead>
                  {statusFilter === 'Pending' && <TableHead className="w-[200px] text-right uppercase font-bold text-xs">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map(req => (
                  <TableRow key={req.id}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {new Date(req.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="space-y-0.5">
                      <p className="font-extrabold text-xs uppercase text-foreground">{req.clientName}</p>
                      <p className="text-[10px] text-muted-foreground">📞 {req.clientPhone}</p>
                      {req.clientEmail && <p className="text-[10px] text-zinc-500">✉️ {req.clientEmail}</p>}
                    </TableCell>
                    <TableCell className="space-y-1">
                      {req.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] py-0 border-zinc-700 text-zinc-400 font-bold">x{item.quantity}</Badge>
                          <span className="text-xs font-semibold text-foreground uppercase">{item.packageName}</span>
                          <span className="text-[10px] text-muted-foreground font-medium">({item.sessions} sessions)</span>
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="font-black text-xs text-primary">
                      {req.totalPrice.toLocaleString()} EGP
                    </TableCell>
                    <TableCell className="space-y-0.5">
                      <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-wider">{req.paymentMethod}</Badge>
                      {req.paymentMethod === 'Instapay' && req.instapayRef && (
                        <p className="text-[10px] text-muted-foreground font-mono">Ref: {req.instapayRef}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        className={`text-[9px] font-black uppercase tracking-wider ${
                          req.status === 'Approved' 
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                            : req.status === 'Rejected'
                            ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                        }`}
                      >
                        {req.status}
                      </Badge>
                    </TableCell>
                    {statusFilter === 'Pending' && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-8 text-xs font-bold border-rose-500/30 text-rose-500 hover:bg-rose-600 hover:text-white"
                            onClick={() => { setRejectingRequest(req); setIsRejectOpen(true); }}
                          >
                            <X className="h-3 w-3 mr-1" /> Decline
                          </Button>
                          <Button 
                            size="sm" 
                            className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={() => { setSelectedRequest(req); setIsAcceptOpen(true); }}
                          >
                            <Check className="h-3 w-3 mr-1" /> Accept
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─── ACCEPT BOOKING DIALOG ─── */}
      <Dialog open={isAcceptOpen} onOpenChange={setIsAcceptOpen}>
        <DialogContent className="max-w-md bg-card border">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-500" /> Accept Booking & Profile Setup
            </DialogTitle>
            <DialogDescription className="text-xs">Verify member details, assign branch, and set sales attribution on the spot.</DialogDescription>
          </DialogHeader>

          {acceptError && (
            <Alert variant="destructive" className="py-2.5 rounded-xl">
              <AlertDescription className="text-xs font-semibold">{acceptError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4 py-3">
            {/* Member Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="memberName" className="text-xs font-bold text-muted-foreground uppercase">Member Name</Label>
                <Input 
                  id="memberName" 
                  value={clientName} 
                  onChange={(e) => setClientName(e.target.value)} 
                  className="h-10 bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="memberPhone" className="text-xs font-bold text-muted-foreground uppercase">Phone Number</Label>
                <Input 
                  id="memberPhone" 
                  value={clientPhone} 
                  onChange={(e) => setClientPhone(e.target.value)} 
                  className="h-10 bg-background"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="memberEmail" className="text-xs font-bold text-muted-foreground uppercase">Email Address (Optional)</Label>
              <Input 
                id="memberEmail" 
                value={clientEmail} 
                onChange={(e) => setClientEmail(e.target.value)} 
                className="h-10 bg-background"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="memberBranch" className="text-xs font-bold text-muted-foreground uppercase">Assigned Branch</Label>
                <Select value={clientBranch} onValueChange={(v) => v && setClientBranch(v as Branch)}>
                  <SelectTrigger id="memberBranch" className="h-10 bg-background">
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="memberGender" className="text-xs font-bold text-muted-foreground uppercase">Gender</Label>
                <Select value={clientGender} onValueChange={(val) => setClientGender(val || '')}>
                  <SelectTrigger id="memberGender" className="h-10 bg-background">
                    <SelectValue placeholder="Select Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sales Representative Attribution */}
            <div className="space-y-1.5 border-t pt-3 mt-2">
              <Label htmlFor="salesRep" className="text-xs font-bold text-primary uppercase">Attributed Sales Rep</Label>
              <Select value={salesRepId} onValueChange={(val) => setSalesRepId(val || '')}>
                <SelectTrigger id="salesRep" className="h-10 bg-background border-primary/20">
                  <SelectValue placeholder="Assign Sales Representative" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.role === 'rep' || u.role === 'manager' || u.role === 'crm_admin').map(rep => (
                    <SelectItem key={rep.id} value={rep.id}>{rep.name} ({rep.role === 'rep' ? 'Sales Rep' : rep.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Packages to Activate Summary */}
            <div className="bg-muted/40 p-3 rounded-xl border border-border/50 space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Packages to Activate</p>
              {selectedRequest?.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs font-semibold">
                  <span className="uppercase text-foreground">{item.packageName} x{item.quantity}</span>
                  <span className="text-primary">{(item.price * item.quantity).toLocaleString()} EGP</span>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsAcceptOpen(false)}
              disabled={processingAccept}
              className="h-10 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAcceptConfirm}
              disabled={processingAccept}
              className="h-10 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {processingAccept ? 'Activating...' : 'Approve & Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DECLINE BOOKING DIALOG ─── */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="max-w-sm bg-card border">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-tight">Decline Booking Request</DialogTitle>
            <DialogDescription className="text-xs">Specify a reason for declining this storefront purchase request.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="rejectReason" className="text-xs font-bold text-muted-foreground uppercase">Decline Reason (Optional)</Label>
            <Input 
              id="rejectReason" 
              placeholder="e.g. Reference number not found, unpaid request..." 
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="h-10 bg-background"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsRejectOpen(false)}
              disabled={processingReject}
              className="h-10 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={processingReject}
              className="h-10 text-xs font-bold rounded-xl"
            >
              {processingReject ? 'Declining...' : 'Decline Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
