import React, { useState, useEffect } from 'react';
import { getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  Shield, Search, RefreshCw, Power, PowerOff, Globe, Database, 
  Calendar, Users, Sliders, CheckCircle2, UserPlus, CreditCard, 
  Scan, BarChart3, FileText, Package, Smartphone, Plus, Mail, User, Building, Loader2, Clock
} from 'lucide-react';
import { Tenant } from './types';

interface SubscriptionRequest {
  id: string;
  gymName: string;
  subdomain: string;
  ownerName: string;
  ownerEmail: string;
  amountPaid: number;
  paymentMethod: string;
  transactionId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt?: string;
}

export default function SuperAdminHub() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Hub Tab State
  const [activeHubTab, setActiveHubTab] = useState<'tenants' | 'leads'>('tenants');

  // Subscription requests states
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Features Dialog State
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [features, setFeatures] = useState({
    leads: true,
    ptPackages: true,
    payments: true,
    attendance: true,
    reports: true,
    quotes: true,
    operations: true,
    mobileApp: false
  });
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [featuresError, setFeaturesError] = useState('');
  const [featuresSuccess, setFeaturesSuccess] = useState(false);

  // Provisioning Dialog State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newGymName, setNewGymName] = useState('');
  const [newSubdomain, setNewSubdomain] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [enableMobileApp, setEnableMobileApp] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionSuccess, setProvisionSuccess] = useState(false);
  const [provisionError, setProvisionError] = useState('');
  const [tempPasswordShow, setTempPasswordShow] = useState('');

  const handleProvisionGym = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    setProvisionError('');
    setProvisionSuccess(false);
    setTempPasswordShow('');

    // Basic validation
    if (!newGymName.trim() || !newSubdomain.trim() || !newOwnerName.trim() || !newOwnerEmail.trim()) {
      setProvisionError('Please fill in all required fields.');
      setProvisioning(false);
      return;
    }

    // Subdomain alphanumeric check
    if (!/^[a-z0-9-]+$/.test(newSubdomain.trim())) {
      setProvisionError('Subdomain must contain only lowercase letters, numbers, and hyphens.');
      setProvisioning(false);
      return;
    }

    try {
      const response = await fetch('/api/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: newSubdomain.trim().toLowerCase(),
          tenantName: newGymName.trim(),
          ownerEmail: newOwnerEmail.trim(),
          ownerName: newOwnerName.trim(),
          ownerPassword: newOwnerPassword.trim() || undefined,
          enableMobileApp,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to provision tenant.');
      }

      const result = await response.json();
      setProvisionSuccess(true);
      setTempPasswordShow(result.temporaryPassword);
      
      // Refresh list
      fetchTenants();

      // Reset form
      setNewGymName('');
      setNewSubdomain('');
      setNewOwnerName('');
      setNewOwnerEmail('');
      setNewOwnerPassword('');
      setEnableMobileApp(false);
    } catch (err: any) {
      setProvisionError(err.message || 'An error occurred during provisioning.');
    } finally {
      setProvisioning(false);
    }
  };

  const fetchTenants = async () => {
    setLoading(true);
    setError('');
    try {
      const db = getFirestore(getApp(), 'db-registry-2');
      const snap = await getDocs(collection(db, 'tenants'));
      const list = snap.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Tenant));
      setTenants(list);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch platform tenants.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      const db = getFirestore(getApp(), 'db-registry-2');
      const snap = await getDocs(collection(db, 'requests'));
      const list = snap.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as SubscriptionRequest));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(list);
    } catch (err: any) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    setApprovingId(requestId);
    setError('');
    setProvisionSuccess(false);
    setTempPasswordShow('');
    try {
      const response = await fetch('/api/approve-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to approve request.');
      }

      const result = await response.json();
      
      // Update local state to approved
      setRequests(prev => prev.map(req => req.id === requestId ? { ...req, status: 'approved' } : req));
      
      // Show success alert in the provisioning modal
      setProvisionSuccess(true);
      setTempPasswordShow(result.temporaryPassword);
      setIsCreateOpen(true);
      
      // Refresh tenants registry
      fetchTenants();
    } catch (err: any) {
      setError(err.message || 'An error occurred during approval.');
    } finally {
      setApprovingId(null);
    }
  };

  useEffect(() => {
    fetchTenants();
    fetchRequests();
  }, []);

  const toggleTenantStatus = async (tenantId: string, currentStatus: 'active' | 'suspended') => {
    setError('');
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const db = getFirestore(getApp(), 'db-registry-2');
      await updateDoc(doc(db, 'tenants', tenantId), {
        status: nextStatus
      });
      
      // Update local state
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, status: nextStatus } : t));
    } catch (err: any) {
      setError(err.message || 'Failed to update workspace status.');
    }
  };

  const openFeaturesModal = async (tenant: Tenant) => {
    setEditingTenant(tenant);
    setLoadingFeatures(true);
    setFeaturesError('');
    setFeaturesSuccess(false);

    try {
      const tenantDb = getFirestore(getApp(), tenant.databaseId);
      const featuresRef = doc(tenantDb, 'settings', 'features');
      const snap = await getDoc(featuresRef);
      if (snap.exists()) {
        const data = snap.data();
        setFeatures({
          leads: data.leads !== false,
          ptPackages: data.ptPackages !== false,
          payments: data.payments !== false,
          attendance: data.attendance !== false,
          reports: data.reports !== false,
          quotes: data.quotes !== false,
          operations: data.operations !== false,
          mobileApp: data.mobileApp === true
        });
      } else {
        // Fallback default configurations
        setFeatures({
          leads: true,
          ptPackages: true,
          payments: true,
          attendance: true,
          reports: true,
          quotes: true,
          operations: true,
          mobileApp: false
        });
      }
    } catch (err: any) {
      setFeaturesError(`Could not load features from database [${tenant.databaseId}]: ${err.message}`);
    } finally {
      setLoadingFeatures(false);
    }
  };

  const saveFeatures = async () => {
    if (!editingTenant) return;
    setSavingFeatures(true);
    setFeaturesError('');
    setFeaturesSuccess(false);

    try {
      const tenantDb = getFirestore(getApp(), editingTenant.databaseId);
      const featuresRef = doc(tenantDb, 'settings', 'features');
      await setDoc(featuresRef, features, { merge: true });
      
      setFeaturesSuccess(true);
      setTimeout(() => {
        setEditingTenant(null);
      }, 1500);
    } catch (err: any) {
      setFeaturesError(`Failed to save features: ${err.message}`);
    } finally {
      setSavingFeatures(false);
    }
  };

  const toggleFeature = (key: keyof typeof features) => {
    setFeatures(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const filteredTenants = tenants.filter(t => 
    t.gymName.toLowerCase().includes(search.toLowerCase()) ||
    t.subdomain.toLowerCase().includes(search.toLowerCase()) ||
    (t.customDomain && t.customDomain.toLowerCase().includes(search.toLowerCase())) ||
    t.databaseId.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.status === 'active').length,
    suspended: tenants.filter(t => t.status === 'suspended').length
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8 text-rose-500" />
            Platform Super Admin
          </h1>
          <p className="text-muted-foreground text-sm">
            Platform-wide tenant registry, custom domain routing, and account lifecycle management.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl h-10 font-bold">
            <Plus className="h-4 w-4" />
            Provision Gym
          </Button>
          <Button onClick={fetchTenants} disabled={loading} variant="outline" className="gap-2 rounded-xl h-10">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Registry
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border/50 shadow-md">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Total Tenants</span>
              <p className="text-3xl font-black">{stats.total}</p>
            </div>
            <div className="p-3 bg-zinc-900 rounded-2xl border">
              <Globe className="h-6 w-6 text-zinc-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Active Workspaces</span>
              <p className="text-3xl font-black text-emerald-500">{stats.active}</p>
            </div>
            <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl">
              <Power className="h-6 w-6 text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md">
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Suspended Workspaces</span>
              <p className="text-3xl font-black text-rose-500">{stats.suspended}</p>
            </div>
            <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-2xl">
              <PowerOff className="h-6 w-6 text-rose-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Selector */}
      <div className="flex border-b border-border gap-6">
        <button
          onClick={() => setActiveHubTab('tenants')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all relative ${
            activeHubTab === 'tenants' 
              ? 'border-rose-500 text-rose-500' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Gym Registries ({stats.total})
        </button>
        <button
          onClick={() => setActiveHubTab('leads')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all relative ${
            activeHubTab === 'leads' 
              ? 'border-rose-500 text-rose-500' 
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Subscription Leads ({requests.length})
          {requests.some(r => r.status === 'pending') && (
            <span className="absolute top-0 -right-2 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-card border rounded-2xl p-3 max-w-md shadow-sm">
        <Search className="h-5 w-5 text-muted-foreground shrink-0" />
        <Input 
          placeholder={
            activeHubTab === 'tenants' 
              ? "Search by name, subdomain, custom domain..." 
              : "Search by name, subdomain, owner email..."
          }
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
        />
      </div>

      {/* Tables Switched Content */}
      {activeHubTab === 'tenants' ? (
        <Card className="border-border/50 shadow-md">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Gym name</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Subdomain</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Custom domain</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Database ID</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Created</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                        Loading central registry...
                      </td>
                    </tr>
                  ) : filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted-foreground font-medium">
                        No gym workspaces found matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map(tenant => (
                      <tr key={tenant.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-sm text-foreground">{tenant.gymName}</div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-zinc-300">
                          {tenant.subdomain}.mitrixo.com
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-zinc-300">
                          {tenant.customDomain ? (
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3 text-zinc-400" />
                              {tenant.customDomain}
                            </span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-rose-400 flex items-center gap-1.5 pt-5">
                          <Database className="h-3.5 w-3.5" />
                          {tenant.databaseId}
                        </td>
                        <td className="px-6 py-4">
                          {tenant.status === 'active' ? (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-bold">Active</Badge>
                          ) : (
                            <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px] font-bold">Suspended</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground font-semibold">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 text-xs font-bold rounded-xl gap-1.5"
                              onClick={() => openFeaturesModal(tenant)}
                            >
                              <Sliders className="h-3.5 w-3.5" />
                              Features
                            </Button>
                            <Button 
                              size="sm" 
                              variant={tenant.status === 'active' ? 'destructive' : 'default'} 
                              className="h-8 px-3.5 text-xs font-bold rounded-xl gap-1.5"
                              onClick={() => toggleTenantStatus(tenant.id, tenant.status)}
                            >
                              {tenant.status === 'active' ? (
                                <>
                                  <PowerOff className="h-3.5 w-3.5" />
                                  Suspend
                                </>
                              ) : (
                                <>
                                  <Power className="h-3.5 w-3.5" />
                                  Activate
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 shadow-md animate-in fade-in duration-200">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Gym name</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Subdomain</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Owner details</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Requested</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingRequests ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                        Loading subscription leads...
                      </td>
                    </tr>
                  ) : requests.filter(r => 
                      r.gymName.toLowerCase().includes(search.toLowerCase()) ||
                      r.subdomain.toLowerCase().includes(search.toLowerCase()) ||
                      r.ownerEmail.toLowerCase().includes(search.toLowerCase()) ||
                      r.ownerName.toLowerCase().includes(search.toLowerCase())
                    ).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted-foreground font-medium">
                        No subscription leads found matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    requests.filter(r => 
                      r.gymName.toLowerCase().includes(search.toLowerCase()) ||
                      r.subdomain.toLowerCase().includes(search.toLowerCase()) ||
                      r.ownerEmail.toLowerCase().includes(search.toLowerCase()) ||
                      r.ownerName.toLowerCase().includes(search.toLowerCase())
                    ).map(req => (
                      <tr key={req.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                            <Building className="h-4 w-4 text-zinc-400" />
                            {req.gymName}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-zinc-300">
                          {req.subdomain}.mitrixo.com
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-zinc-400" />
                            {req.ownerName}
                          </div>
                          <div className="text-[10px] text-zinc-450 flex items-center gap-1.5 mt-0.5">
                            <Mail className="h-3 w-3 text-zinc-500" />
                            {req.ownerEmail}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <CreditCard className="h-3.5 w-3.5" />
                            ${req.amountPaid} ({req.paymentMethod})
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            TX: {req.transactionId}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {req.status === 'pending' ? (
                            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] font-bold flex items-center gap-1 w-fit">
                              <Clock className="h-3.5 w-3.5 animate-pulse" />
                              Pending Approval
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-bold flex items-center gap-1 w-fit">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approved & Active
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground font-semibold">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {req.createdAt ? new Date(req.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {req.status === 'pending' ? (
                            <Button 
                              size="sm" 
                              disabled={approvingId !== null}
                              className="bg-rose-600 hover:bg-rose-500 text-white h-8 px-3.5 text-xs font-bold rounded-xl gap-1.5 shadow-sm"
                              onClick={() => handleApproveRequest(req.id)}
                            >
                              {approvingId === req.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Activating...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Approve & Activate
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-zinc-500 font-bold italic">Active</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feature Configuration Dialog */}
      <Dialog open={editingTenant !== null} onOpenChange={(open) => { if (!open) setEditingTenant(null); }}>
        <DialogContent 
          style={{ maxWidth: '680px', width: '95%' }}
          className="border-border/50 shadow-2xl bg-zinc-950 text-white"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Sliders className="h-5 w-5 text-rose-500" />
              Manage Features
            </DialogTitle>
            <DialogDescription className="text-zinc-450">
              Configure active modules for <strong className="text-zinc-200">{editingTenant?.gymName}</strong> ({editingTenant?.databaseId})
            </DialogDescription>
          </DialogHeader>

          {loadingFeatures ? (
            <div className="py-12 flex flex-col items-center justify-center text-sm text-zinc-400">
              <RefreshCw className="h-6 w-6 animate-spin mb-2 text-rose-500" />
              Fetching tenant settings...
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {featuresError && (
                <Alert variant="destructive">
                  <AlertDescription>{featuresError}</AlertDescription>
                </Alert>
              )}
              {featuresSuccess && (
                <Alert className="bg-emerald-950/20 border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  <AlertDescription>Features updated successfully!</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1 py-1">
                {/* Leads */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg shrink-0 mt-0.5">
                      <UserPlus className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs text-zinc-200 cursor-pointer block" onClick={() => toggleFeature('leads')}>Leads Module</Label>
                      <p className="text-[10px] text-zinc-400 leading-snug">Track prospective clients & trials.</p>
                    </div>
                  </div>
                  <Switch checked={features.leads} onCheckedChange={() => toggleFeature('leads')} disabled={savingFeatures} />
                </div>

                {/* PT Packages */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg shrink-0 mt-0.5">
                      <Package className="h-3.5 w-3.5 text-purple-400" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs text-zinc-200 cursor-pointer block" onClick={() => toggleFeature('ptPackages')}>PT Packages</Label>
                      <p className="text-[10px] text-zinc-400 leading-snug">Package deductions & coaches.</p>
                    </div>
                  </div>
                  <Switch checked={features.ptPackages} onCheckedChange={() => toggleFeature('ptPackages')} disabled={savingFeatures} />
                </div>

                {/* Payments */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg shrink-0 mt-0.5">
                      <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs text-zinc-200 cursor-pointer block" onClick={() => toggleFeature('payments')}>Payments & Invoices</Label>
                      <p className="text-[10px] text-zinc-400 leading-snug">Record payments & view metrics.</p>
                    </div>
                  </div>
                  <Switch checked={features.payments} onCheckedChange={() => toggleFeature('payments')} disabled={savingFeatures} />
                </div>

                {/* Attendance */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-lg shrink-0 mt-0.5">
                      <Scan className="h-3.5 w-3.5 text-sky-400" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs text-zinc-200 cursor-pointer block" onClick={() => toggleFeature('attendance')}>Attendance & QR</Label>
                      <p className="text-[10px] text-zinc-400 leading-snug">Check-ins via QR scanner kiosk.</p>
                    </div>
                  </div>
                  <Switch checked={features.attendance} onCheckedChange={() => toggleFeature('attendance')} disabled={savingFeatures} />
                </div>

                {/* Reports */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-violet-500/10 border border-violet-500/20 rounded-lg shrink-0 mt-0.5">
                      <BarChart3 className="h-3.5 w-3.5 text-violet-400" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs text-zinc-200 cursor-pointer block" onClick={() => toggleFeature('reports')}>Analytics & Reports</Label>
                      <p className="text-[10px] text-zinc-400 leading-snug">Access reports & data exports.</p>
                    </div>
                  </div>
                  <Switch checked={features.reports} onCheckedChange={() => toggleFeature('reports')} disabled={savingFeatures} />
                </div>

                {/* Quotes */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg shrink-0 mt-0.5">
                      <FileText className="h-3.5 w-3.5 text-rose-400" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs text-zinc-200 cursor-pointer block" onClick={() => toggleFeature('quotes')}>Quotes Generator</Label>
                      <p className="text-[10px] text-zinc-400 leading-snug">Generate custom commercial quote PDFs.</p>
                    </div>
                  </div>
                  <Switch checked={features.quotes} onCheckedChange={() => toggleFeature('quotes')} disabled={savingFeatures} />
                </div>

                {/* Operations */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg shrink-0 mt-0.5">
                      <Users className="h-3.5 w-3.5 text-blue-400" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs text-zinc-200 cursor-pointer block" onClick={() => toggleFeature('operations')}>Club Operations</Label>
                      <p className="text-[10px] text-zinc-400 leading-snug">Lockers, juice bar, & guest invites.</p>
                    </div>
                  </div>
                  <Switch checked={features.operations} onCheckedChange={() => toggleFeature('operations')} disabled={savingFeatures} />
                </div>

                {/* Mobile App */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/80 hover:border-zinc-700 transition-all">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg shrink-0 mt-0.5">
                      <Smartphone className="h-3.5 w-3.5 text-orange-400" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="font-bold text-xs text-zinc-200 cursor-pointer block" onClick={() => toggleFeature('mobileApp')}>Mobile App Sync</Label>
                      <p className="text-[10px] text-zinc-400 leading-snug">Enable mobile app logins & sync services.</p>
                    </div>
                  </div>
                  <Switch checked={features.mobileApp} onCheckedChange={() => toggleFeature('mobileApp')} disabled={savingFeatures} />
                </div>
              </div>

              <DialogFooter className="mt-4 gap-2">
                <Button variant="ghost" onClick={() => setEditingTenant(null)} disabled={savingFeatures} className="text-zinc-400 hover:text-white rounded-xl">
                  Cancel
                </Button>
                <Button onClick={saveFeatures} disabled={savingFeatures} className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold gap-2">
                  {savingFeatures ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Provisioning Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => { if (!open) { setIsCreateOpen(false); setProvisionError(''); setProvisionSuccess(false); setTempPasswordShow(''); } }}>
        <DialogContent 
          style={{ maxWidth: '540px', width: '95%' }}
          className="border-border/50 shadow-2xl bg-zinc-950 text-white rounded-3xl"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Database className="h-5 w-5 text-rose-500" />
              Provision New Gym Tenant
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Create a new isolated database, seed default schemas, configure auth, and fire welcome instructions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleProvisionGym} className="space-y-4 py-2">
            {provisionError && (
              <Alert variant="destructive" className="rounded-2xl">
                <AlertDescription>{provisionError}</AlertDescription>
              </Alert>
            )}

            {provisionSuccess && (
              <Alert className="bg-emerald-950/20 border-emerald-500/30 text-emerald-400 rounded-2xl">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                <AlertDescription>
                  Gym tenant provisioned and activated successfully!
                  {tempPasswordShow && (
                    <div className="mt-2 p-2.5 bg-zinc-900 border rounded-xl font-mono text-xs text-white">
                      <strong>Temp Password:</strong> {tempPasswordShow}
                      <p className="text-[10px] text-zinc-400 mt-1">An email has been fired with instructions.</p>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-300">Gym / Business Name *</Label>
                <Input 
                  placeholder="e.g. Iron Gym" 
                  value={newGymName} 
                  onChange={e => setNewGymName(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 rounded-xl text-sm"
                  disabled={provisioning}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-300">Desired Subdomain *</Label>
                <div className="relative">
                  <Input 
                    placeholder="e.g. irongym" 
                    value={newSubdomain} 
                    onChange={e => setNewSubdomain(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                    className="bg-zinc-900 border-zinc-800 rounded-xl text-sm pr-20"
                    disabled={provisioning}
                    required
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-zinc-500 font-bold">.mitrixo.com</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-300">Owner Full Name *</Label>
                <Input 
                  placeholder="e.g. Captain Yasser" 
                  value={newOwnerName} 
                  onChange={e => setNewOwnerName(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 rounded-xl text-sm"
                  disabled={provisioning}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-300">Owner Email Address *</Label>
                <Input 
                  type="email"
                  placeholder="owner@irongym.com" 
                  value={newOwnerEmail} 
                  onChange={e => setNewOwnerEmail(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 rounded-xl text-sm"
                  disabled={provisioning}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-300">Custom Password (Optional)</Label>
                <Input 
                  type="password"
                  placeholder="Auto-generated if empty" 
                  value={newOwnerPassword} 
                  onChange={e => setNewOwnerPassword(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 rounded-xl text-sm"
                  disabled={provisioning}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 mt-5">
                <div className="space-y-0.5">
                  <Label className="font-bold text-xs text-zinc-200 cursor-pointer block" onClick={() => setEnableMobileApp(!enableMobileApp)}>Mobile App Sync</Label>
                  <p className="text-[10px] text-zinc-400">Sync mobile storefront.</p>
                </div>
                <Switch checked={enableMobileApp} onCheckedChange={setEnableMobileApp} disabled={provisioning} />
              </div>
            </div>

            <DialogFooter className="mt-6 gap-2 border-t border-zinc-900 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)} disabled={provisioning} className="text-zinc-400 hover:text-white rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={provisioning} className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold gap-2">
                {provisioning ? 'Provisioning...' : 'Provision & Activate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
