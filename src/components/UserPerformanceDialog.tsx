import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppContext } from '../context';
import { useAuth } from '../contexts/AuthContext';
import { useClients } from '../hooks/useClients';
import { usePayments } from '../hooks/usePayments';
import { User } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { SALES_NAME_MAPPING } from '../constants';
import { resolveUserDisplay } from '../utils/resolveUserDisplay';

export const PRIVATE_PACKAGES = [
  'drop session pt',
  '30 s pt',
  '20 s pt',
  '10 s pt'
];

export const GROUP_PACKAGES = [
  '6 month',
  '10s gt (adult)',
  '10s gt (kids/juniors)',
  '20s gt (adult)',
  '20s gt (kids/juniors)',
  '30 s gt (adult)',
  '30 s gt (kids/juniors)',
  '5 s gt (adult)',
  'drop session gt'
];

export const isPrivatePackage = (packageType: string) => {
  if (!packageType) return false;
  const lower = packageType.toLowerCase().trim();
  return PRIVATE_PACKAGES.includes(lower) || /\bpt\b/i.test(packageType) || lower.includes('private');
};

export const isGroupPackage = (packageType: string) => {
  if (!packageType) return false;
  const lower = packageType.toLowerCase().trim();
  return GROUP_PACKAGES.includes(lower) || lower.includes('group') || lower.includes('gt');
};

interface UserPerformanceDialogProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

export function UserPerformanceDialog({ user, isOpen, onClose }: UserPerformanceDialogProps) {
  const { userTargets, updateUserTarget, users } = useAppContext();
  const { currentUser } = useAuth();
  const { clients } = useClients(currentUser);
  const { payments } = usePayments({ currentUser, clients, canDeletePayments: false });
  
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0);
  const selectedDate = subMonths(new Date(), selectedMonthOffset);
  const selectedMonthStr = format(selectedDate, 'yyyy-MM');

  const existingTarget = userTargets.find(t => t.userId === user.id && t.month === selectedMonthStr);
  const [newTarget, setNewTarget] = useState(existingTarget?.targetAmount.toString() || '');

  // Sync target input when month offset changes
  useEffect(() => {
    const target = userTargets.find(t => t.userId === user.id && t.month === selectedMonthStr);
    setNewTarget(target?.targetAmount.toString() || '');
  }, [selectedMonthOffset, userTargets, user.id, selectedMonthStr]);
  
  const handleSaveTarget = () => {
    const totalAmt = parseFloat(newTarget);
    if (!isNaN(totalAmt) && totalAmt >= 0) {
      updateUserTarget(user.id, selectedMonthStr, totalAmt);
    }
  };

  // Generate last 6 months data for chart
  const performanceData = useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, i) => subMonths(new Date(), 5 - i));
    
    return months.map(date => {
      const monthStr = format(date, 'yyyy-MM');
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      
      const targetDoc = userTargets.find(t => t.userId === user.id && t.month === monthStr);
      const targetAmount = targetDoc ? targetDoc.targetAmount : 0;
      
      // Calculate achieved by getting payments in this month attributed to this user
      // Create a lookup map for faster access - though for one user it's less critical, consistency is good
      const clientMap = new Map(clients.map(c => [c.id, c]));

      const monthPayments = payments.filter(p => {
        const pDate = parseISO(p.date);
        if (!isWithinInterval(pDate, { start, end })) return false;
        
        const client = clientMap.get(p.clientId);
        
        // Branch Check
        if (user.branch && user.branch.toLowerCase() !== 'all') {
          // If the payment is linked to a client, check their branch
          if (client && client.branch !== user.branch) {
             // Exception: if it's explicitly recorded by this user/ID, maybe don't filter? 
             // keeping consistent with dashboard logic
             return false;
          }
        }

        // Robust Attribution Logic (Matching Dashboard.tsx)
        const getCanonicalName = (name: string) => {
          if (!name) return '';
          const trimmed = name.trim().toLowerCase();
          for (const [key, value] of Object.entries(SALES_NAME_MAPPING)) {
            if (key.toLowerCase() === trimmed) {
              return value.toLowerCase().trim();
            }
          }
          return trimmed;
        };

        const canonicalRepName = getCanonicalName(user.name || '');

        // 1. Direct ID match
        if (p.sales_rep_id && p.sales_rep_id === user.id) return true;

        // 2. Canonical name match on payment fields
        const resolvedSalesName = resolveUserDisplay(p.salesName, users, p.salesName || '');
        const salesName = (resolvedSalesName || '').trim();
        if (salesName) {
          const canonicalSalesName = getCanonicalName(salesName);
          if (canonicalSalesName === canonicalRepName && canonicalSalesName !== '') return true;
        }

        // 3. Transitive fallback ONLY if payment has no explicit sales attribution
        if (!p.sales_rep_id && !p.salesName) {
          if (client) {
            if (client.assignedTo === user.id) return true;
            const canonicalAssigned = getCanonicalName(client.assignedTo || '');
            if (canonicalAssigned === canonicalRepName && canonicalAssigned !== '') return true;
          }
        }

        return false;
      });


      // Breakdown by session type
      const privatePayments = monthPayments.filter(p => isPrivatePackage(p.packageType));
      const groupPayments = monthPayments.filter(p => isGroupPackage(p.packageType));

      const privateRevenue = privatePayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const groupRevenue = groupPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      const achievedAmount = monthPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      return {
        month: format(date, 'MMM yyyy'),
        monthStr,
        targetAmount,
        achievedAmount,
        privateRevenue,
        groupRevenue,
        privateSessionsSold: privatePayments.length,
        groupSessionsSold: groupPayments.length,
        isTargetMet: targetAmount > 0 && achievedAmount >= targetAmount
      };
    });
  }, [userTargets, payments, clients, user.id]);

  // Find data for the selected month
  const selectedMonthData = performanceData.find(d => d.monthStr === selectedMonthStr) || performanceData[performanceData.length - 1];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Performance: {user.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 p-4 border rounded-md bg-muted/20">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Set Targets</h4>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedMonthOffset(o => o + 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-medium min-w-[90px] text-center">{format(selectedDate, 'MMM yyyy')}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedMonthOffset === 0} onClick={() => setSelectedMonthOffset(o => o - 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Monthly Total Amount (LE)</Label>
                  <Input 
                    type="number" 
                    value={newTarget} 
                    onChange={e => setNewTarget(e.target.value)}
                    placeholder="e.g. 50000"
                    className="h-8"
                  />
                </div>
                <Button onClick={handleSaveTarget} className="w-full mt-2">Save Targets</Button>
              </div>
            </div>
            
            <div className="space-y-3 p-4 border rounded-md bg-muted/20">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Selected Month Status</h4>
                {selectedMonthData && selectedMonthData.targetAmount > 0 && (
                  selectedMonthData.isTargetMet ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Target Met</span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">✕ Below Target</span>
                  )
                )}
              </div>
              <div className="flex flex-col space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Target:</span>
                  <span className="font-medium">{selectedMonthData?.targetAmount.toLocaleString()} LE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Achieved:</span>
                  <span className={`font-medium ${selectedMonthData?.isTargetMet ? 'text-emerald-500' : ''}`}>
                    {selectedMonthData?.achievedAmount.toLocaleString()} LE
                  </span>
                </div>
                
                <div className="border-t pt-2 mt-2 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Packages Breakdown</span>
                  
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-muted-foreground block">PT Packages</span>
                      <span className="text-base font-bold">
                        {selectedMonthData?.privateRevenue.toLocaleString()} <span className="text-[10px] font-normal">LE</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded">
                        {selectedMonthData?.privateSessionsSold} packages
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-muted-foreground block">Group Packages</span>
                      <span className="text-base font-bold">
                        {selectedMonthData?.groupRevenue.toLocaleString()} <span className="text-[10px] font-normal">LE</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded">
                        {selectedMonthData?.groupSessionsSold} packages
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Historical Performance (6 Months)</h4>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [`${Number(value || 0).toLocaleString()} LE`]} />
                  <Legend />
                  <Bar dataKey="targetAmount" name="Target" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="privateRevenue" name="Private" stackId="revenue" fill="#6366f1" />
                  <Bar dataKey="groupRevenue" name="Group" stackId="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
