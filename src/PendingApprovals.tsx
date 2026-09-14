import React, { useMemo, useState } from 'react';
import { Clock, PackageCheck, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from './context';
import { useAuth } from './contexts/AuthContext';

export default function PendingApprovals() {
  const { clients, packages, setActiveTab, setActiveClientId } = useAppContext();
  const { activateFromPending } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedPackages, setSelectedPackages] = useState<Record<string, string>>({});
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const pendingClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter(c => String(c.status || '').toUpperCase() === 'PENDING_ONBOARDING')
      .filter(c => {
        if (!q) return true;
        return [c.name, c.phone, c.memberId, c.email].filter(Boolean).join(' ').toLowerCase().includes(q);
      });
  }, [clients, search]);

  const handleActivate = async (clientId: string) => {
    const pkgId = selectedPackages[clientId];
    const pkg = packages.find(p => p.id === pkgId);
    setActivatingId(clientId);
    try {
      const now = new Date();
      const packagePayload = pkg ? [{
        id: pkg.id,
        packageId: pkg.id,
        packageName: pkg.name,
        name: pkg.name,
        sessionsTotal: pkg.sessions,
        sessionsRemaining: pkg.sessions,
        price: pkg.price,
        status: 'Active',
        startDate: now.toISOString(),
      }] : undefined;

      await activateFromPending(clientId, {
        packageType: pkg?.name,
        sessionsRemaining: pkg?.sessions,
        packages: packagePayload as any,
      } as any);
      toast.success('Member activated successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to activate member.');
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Pending Approvals</h1>
          <p className="text-sm text-muted-foreground">App signups waiting for front desk activation.</p>
        </div>
        <Badge variant="outline" className="w-fit font-bold">{pendingClients.length} Pending</Badge>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, or member ID..."
          className="pl-9"
        />
      </div>

      {pendingClients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-3 opacity-60" />
            <p className="text-sm">No pending member accounts.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {pendingClients.map(client => (
            <Card key={client.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{client.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {client.memberId ? `#${client.memberId}` : 'No member ID'} · {client.phone || 'No phone'}
                    </p>
                  </div>
                  <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20">Pending</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col lg:flex-row lg:items-end gap-3">
                <div className="space-y-1.5 flex-1 min-w-[220px]">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Assign Package</Label>
                  <Select
                    value={selectedPackages[client.id] || ''}
                    onValueChange={(value) => setSelectedPackages(prev => ({ ...prev, [client.id]: value || '' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Activate without package" />
                    </SelectTrigger>
                    <SelectContent>
                      {packages.map(pkg => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          {pkg.name} · {pkg.sessions} sessions · {pkg.price} LE
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveTab('clients');
                      setActiveClientId(client.id);
                    }}
                  >
                    View
                  </Button>
                  <Button
                    disabled={activatingId === client.id}
                    onClick={() => handleActivate(client.id)}
                    className="gap-2 font-bold"
                  >
                    <PackageCheck className="h-4 w-4" />
                    {activatingId === client.id ? 'Activating...' : 'Assign Package & Activate'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
