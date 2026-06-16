import { useState } from 'react';
import { useAppContext } from '../context';
import { useCoaches } from '../hooks/useCoaches';
import { usePackages } from '../hooks/usePackages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO, isBefore, addDays, differenceInDays, startOfDay } from 'date-fns';
import { Client, Payment } from '../types';
import { resolveUserDisplay } from '../utils/resolveUserDisplay';
import { AlertTriangle, Clock, Phone, DollarSign, User, Calendar } from 'lucide-react';

export default function RenewalPipeline() {
  const {
    clients,
    updateClient,
    addComment,
    currentUser,
    addPayment,
    users
  } = useAppContext();
  const { coaches } = useCoaches();
  const { packages } = usePackages();

  // Dialog states
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  
  // Payment form states
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Payment['method']>('Cash');
  const [instapayRef, setInstapayRef] = useState('');
  const [packageType, setPackageType] = useState('');
  const [coachName, setCoachName] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const now = startOfDay(new Date());

  const safeParseISO = (dateStr: string | undefined): Date | null => {
    if (!dateStr) return null;
    try {
      const d = parseISO(dateStr);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  // Filter members for renewal
  const renewalMembers = clients.filter(c => c.status === 'Nearly Expired' || c.status === 'Expired');

  // Grouping logic
  const expired = renewalMembers.filter(c => {
    const expiry = safeParseISO(c.membershipExpiry);
    if (!expiry) return c.status === 'Expired';
    return isBefore(expiry, now);
  });

  const urgent = renewalMembers.filter(c => {
    const expiry = safeParseISO(c.membershipExpiry);
    if (!expiry) return false;
    const diff = differenceInDays(expiry, now);
    // Includes today (diff === 0) through 7 days
    return diff >= 0 && diff <= 7;
  });

  const upcoming = renewalMembers.filter(c => {
    const expiry = safeParseISO(c.membershipExpiry);
    if (!expiry) return false;
    const diff = differenceInDays(expiry, now);
    return diff > 7 && diff <= 30;
  });

  const handleMarkContacted = async (client: Client) => {
    await addComment(client.id, "Contacted regarding renewal", currentUser?.name || 'System');
    await updateClient(client.id, {
      lastContactDate: new Date().toISOString()
    });
  };

  const handleOpenPayment = (client: Client) => {
    setSelectedClient(client);
    setPackageType(client.packageType || '');
    const pkg = packages.find(p => p.name === client.packageType);
    if (pkg) {
      setAmount(pkg.price.toString());
    }
    setPaymentDialogOpen(true);
  };

  const handlePackageChange = (val: string) => {
    setPackageType(val);
    const pkg = packages.find(p => p.name === val);
    if (pkg) {
      setAmount(pkg.price.toString());
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedClient || !amount || !packageType) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Invalid Amount: The payment amount must be greater than zero. Free payments are not permitted.');
      return;
    }

    if (method === 'Instapay' && (!instapayRef || !/^\d{12}$/.test(instapayRef))) {
      alert('Invalid Reference: Please enter a valid 12-digit Instapay reference number.');
      return;
    }

    const finalPackageType = packageType;
    const isPT = /\bpt\b/i.test(finalPackageType);
    
    if (isPT && !coachName) {
      alert('Missing Information: Please select a coach for this PT package.');
      return;
    }

    await addPayment({
      clientId: selectedClient.id,
      amount: parseFloat(amount),
      date: new Date(startDate).toISOString(),
      method,
      instapayRef: method === 'Instapay' ? instapayRef : undefined,
      packageType: finalPackageType,
      coachName: isPT ? coachName : undefined,
      notes,
      recordedBy: currentUser?.id,
      salesName: selectedClient.assignedTo || undefined,
      sales_rep_id: selectedClient.assignedTo || currentUser?.id || ''
    });

    // Update client membership — wrapped so a failure here doesn't silently lose the payment
    try {
      const pkg = packages.find(p => p.name === packageType);
      if (pkg) {
        const pkgStartDate = new Date(startDate);
        const isUnlimited = pkg.sessions === 0;
        await updateClient(selectedClient.id, {
          packageType: pkg.name,
          sessionsRemaining: isUnlimited ? ('unlimited' as any) : pkg.sessions,
          membershipExpiry: addDays(pkgStartDate, pkg.expiryDays).toISOString(),
          startDate: pkgStartDate.toISOString(),
          status: 'Active'
        });
      } else {
        await updateClient(selectedClient.id, {
          packageType: finalPackageType,
          startDate: new Date(startDate).toISOString(),
          status: 'Active'
        });
      }
    } catch (err) {
      console.error('Payment saved but member update failed:', err);
      await addComment(
        selectedClient.id,
        `⚠️ Payment recorded but membership was NOT updated automatically. Please update manually: package="${packageType}", start=${startDate}.`,
        'System'
      );
    }

    setPaymentDialogOpen(false);
    // Reset form
    setSelectedClient(null);
    setAmount('');
    setMethod('Cash');
    setInstapayRef('');
    setPackageType('');
    setCoachName('');
    setNotes('');
  };

  const PipelineTable = ({ title, members, icon: Icon, colorClass }: { title: string, members: Client[], icon: any, colorClass: string }) => (
    <Card className="mb-6 overflow-hidden">
      <CardHeader className={`bg-gradient-to-r ${colorClass} text-white`}>
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5" />
          <CardTitle className="text-lg">{title} ({members.length})</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Member</TableHead>
              <TableHead>Expiry Status</TableHead>
              <TableHead>Last Contact</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead className="text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  No members in this category
                </TableCell>
              </TableRow>
            ) : (
              members.map((client) => {
                const expiryDate = safeParseISO(client.membershipExpiry);
                const daysLeft = expiryDate ? differenceInDays(expiryDate, now) : 0;
                const lastContactDate = safeParseISO(client.lastContactDate);

                return (
                  <TableRow key={client.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="pl-6">
                      <div className="font-medium text-slate-900">{client.name}</div>
                      <div className="text-xs text-slate-500">#{client.memberId || 'N/A'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={daysLeft < 0 ? 'destructive' : 'outline'} className={daysLeft >= 0 && daysLeft <= 7 ? 'w-fit text-orange-600 border-orange-200 bg-orange-50' : 'w-fit'}>
                          {daysLeft < 0
                            ? `Expired ${Math.abs(daysLeft)}d ago`
                            : daysLeft === 0
                              ? 'Expires today'
                              : `${daysLeft} days left`}
                        </Badge>
                        <div className="text-xs text-slate-500">
                          {expiryDate ? format(expiryDate, 'MMM d, yyyy') : 'N/A'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {lastContactDate ? format(lastContactDate, 'MMM d, yyyy') : 'Never'}
                        </span>
                        {lastContactDate && (
                          <span className="text-xs text-slate-400">
                            {differenceInDays(now, lastContactDate)} days ago
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <User className="w-3.5 h-3.5" />
                        {resolveUserDisplay(client.assignedTo, users, client.salesName || 'Unassigned')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                          onClick={() => handleMarkContacted(client)}
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Mark Contacted
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleOpenPayment(client)}
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          Renew
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col gap-1 mb-2">
        <h2 className="text-2xl font-bold text-slate-800">Renewal Pipeline</h2>
        <p className="text-slate-500">Manage upcoming and expired memberships to prevent churn.</p>
      </div>

      <PipelineTable 
        title="Already Expired" 
        members={expired} 
        icon={AlertTriangle} 
        colorClass="from-rose-500 to-red-600"
      />
      
      <PipelineTable 
        title="Expiring Soon (1-7 Days)" 
        members={urgent} 
        icon={Clock} 
        colorClass="from-orange-400 to-darkorange-500"
      />
      
      <PipelineTable 
        title="Upcoming (8-30 Days)" 
        members={upcoming} 
        icon={Calendar} 
        colorClass="from-blue-500 to-indigo-600"
      />

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Record Renewal Payment
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Member</Label>
              <div className="p-2 bg-slate-50 rounded-md border border-slate-100 flex items-center justify-between">
                <span className="font-medium">{selectedClient?.name}</span>
                <span className="text-xs text-slate-500">#{selectedClient?.memberId}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="package">Package</Label>
              <Select value={packageType} onValueChange={(val) => val && handlePackageChange(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select package" />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.name}>
                      {pkg.name} ({pkg.price} EGP)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount (EGP)</Label>
                <Input 
                  id="amount" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="method">Method</Label>
                <Select value={method} onValueChange={(val) => val && setMethod(val as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Visa">Visa</SelectItem>
                    <SelectItem value="Instapay">Instapay</SelectItem>
                    <SelectItem value="Vodafone Cash">Vodafone Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {method === 'Instapay' && (
              <div className="grid gap-2">
                <Label htmlFor="instapay">Instapay Reference (12 digits)</Label>
                <Input 
                  id="instapay" 
                  value={instapayRef} 
                  onChange={(e) => setInstapayRef(e.target.value)} 
                  placeholder="000000000000"
                />
              </div>
            )}

            {/\bpt\b/i.test(packageType) && (
              <div className="grid gap-2">
                <Label htmlFor="coach">Coach</Label>
                <Select value={coachName} onValueChange={(val) => val && setCoachName(val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select coach" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches.map((coach) => (
                      <SelectItem key={coach.id} value={coach.name}>
                        {coach.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input 
                id="startDate" 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Input 
                id="notes" 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                placeholder="Optional notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} className="bg-emerald-600 hover:bg-emerald-700">Record & Activate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
