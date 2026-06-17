import React, { useState, useEffect } from 'react';
import { getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Search, RefreshCw, Power, PowerOff, Globe, Database, Calendar, Users } from 'lucide-react';
import { Tenant } from './types';

export default function SuperAdminHub() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchTenants = async () => {
    setLoading(true);
    setError('');
    try {
      const db = getFirestore(getApp(), 'db-registry');
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

  useEffect(() => {
    fetchTenants();
  }, []);

  const toggleTenantStatus = async (tenantId: string, currentStatus: 'active' | 'suspended') => {
    setError('');
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const db = getFirestore(getApp(), 'db-registry');
      await updateDoc(doc(db, 'tenants', tenantId), {
        status: nextStatus
      });
      
      // Update local state
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, status: nextStatus } : t));
    } catch (err: any) {
      setError(err.message || 'Failed to update workspace status.');
    }
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
        <Button onClick={fetchTenants} disabled={loading} variant="outline" className="gap-2 rounded-xl h-10">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Registry
        </Button>
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

      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-card border rounded-2xl p-3 max-w-md shadow-sm">
        <Search className="h-5 w-5 text-muted-foreground shrink-0" />
        <Input 
          placeholder="Search by name, subdomain, custom domain..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
        />
      </div>

      {/* Tenants Table */}
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
}
