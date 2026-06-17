import React, { useState } from 'react';
import ConversionFunnel from './components/ConversionFunnel';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from './context';
import { SALES_NAME_MAPPING } from './constants';
import { resolveUserDisplay } from './utils/resolveUserDisplay';
import { differenceInDays, isSameDay, parseISO, isAfter, isBefore, addDays, subDays, subMonths, startOfMonth, endOfMonth, isWithinInterval, format, getDay } from 'date-fns';
import { useLanguage } from './contexts/LanguageContext';

const PRIVATE_PACKAGES = [
  'drop session pt', 
  '30 s pt',
  '20 s pt',
  '10 s pt'
];

const GROUP_PACKAGES = [
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

export const isPrivatePackage = (pkg: string) => {
  if (!pkg) return false;
  const lower = pkg.toLowerCase().trim();
  return PRIVATE_PACKAGES.includes(lower) || /\bpt\b/i.test(pkg) || lower.includes('private');
};

export const isGroupPackage = (pkg: string) => {
  if (!pkg) return false;
  const lower = pkg.toLowerCase().trim();
  return GROUP_PACKAGES.includes(lower) || lower.includes('group') || lower.includes('gt');
};
import { Target, Users, CalendarDays, AlertTriangle, Gift, Settings, ChevronLeft, ChevronRight, Trophy, Download, ArrowUpDown, UserCheck, UserPlus } from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import OnlineUsers from './components/OnlineUsers';

function PaginatedList({ items, renderItem, itemsPerPage = 5 }: { items: any[], renderItem: (item: any) => React.ReactNode, itemsPerPage?: number }) {
  const [currentPage, setCurrentPage] = useState(1);
  const { t } = useLanguage();
  const totalPages = Math.ceil((items || []).length / itemsPerPage);
  const paginatedItems = (items || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {paginatedItems.map(renderItem)}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 px-2 text-xs"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-3 w-3 mr-1" /> {t('common.prev')}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('common.page')} {currentPage} {t('common.of')} {totalPages}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 px-2 text-xs"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            {t('common.next')} <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { salesTarget, updateSalesTarget, updateUserTarget, currentUser, userTargets, users, canViewGlobalDashboard, canAccessSettings, branches, clients: contextClients, payments: contextPayments, attendances } = useAppContext();
  const { t, language } = useLanguage();
  // Use context data directly instead of creating duplicate Firestore listeners.
  // Context 'clients' and 'payments' are already filtered for the current user's visibility.
  // For manager cross-rep analysis we need unfiltered data — but all users in context already
  // receive the full dataset when canViewGlobalDashboard is true. For reps, they only see their own.
  const allClients = contextClients;
  const allPayments = contextPayments;
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState(false);
  const [newTarget, setNewTarget] = useState(salesTarget.targetAmount.toString());
  const [selectedRepId, setSelectedRepId] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'revenue', direction: 'desc' });

  const clientMap = React.useMemo(() => {
    const map = new Map<string, any>();
    allClients.forEach(c => map.set(c.id, c));
    return map;
  }, [allClients]);

  const getCanonicalName = React.useCallback((name: string) => {
    if (!name) return '';
    const trimmed = name.trim().toLowerCase();
    for (const [key, value] of Object.entries(SALES_NAME_MAPPING)) {
      if (key.toLowerCase() === trimmed) {
        return value.toLowerCase().trim();
      }
    }
    return trimmed;
  }, []);

  const isClientAssignedToRep = React.useCallback((client: any, repId: string, repName: string) => {
    if (!client.assignedTo) return false;
    if (client.assignedTo === repId) return true;
    const canonicalAssigned = getCanonicalName(client.assignedTo);
    const canonicalRep = getCanonicalName(repName);
    return canonicalAssigned === canonicalRep && canonicalAssigned !== '';
  }, [getCanonicalName]);

  const isPaymentAttributedToRep = React.useCallback((payment: any, repId: string, repName: string) => {
    // 1. Direct ID match (new payments created through the CRM)
    if (payment.sales_rep_id && payment.sales_rep_id === repId) return true;

    // 2. Canonical name match on payment fields (some legacy data)
    const resolvedSalesName = resolveUserDisplay(payment.salesName, users, payment.salesName || '');
    const salesName = (resolvedSalesName || payment.assigned_sales_name || '').trim();
    if (salesName) {
      const canonicalSalesName = getCanonicalName(salesName);
      const canonicalRep = getCanonicalName(repName);
      if (canonicalSalesName === canonicalRep && canonicalSalesName !== '') return true;
    }

    // 3. Transitive fallback ONLY if payment has no explicit sales attribution.
    // If it DOES have attribution but it didn't match the rep above, we must return false
    // to prevent double counting (e.g. rep A recorded payment but rep B owns client).
    if (!payment.sales_rep_id && !payment.salesName && !payment.assigned_sales_name) {
      const client = clientMap.get(payment.clientId);
      if (client) {
        // 3a. Direct ID match on client assignedTo
        if (client.assignedTo === repId) return true;
        // 3b. Canonical name match on client salesName
        const clientSalesName = (client.salesName || client.assignedTo || '').trim();
        if (clientSalesName) {
          const canonicalClientSales = getCanonicalName(clientSalesName);
          const canonicalRep = getCanonicalName(repName);
          if (canonicalClientSales === canonicalRep && canonicalClientSales !== '') return true;
        }
      }
    }

    return false;
  }, [clientMap, getCanonicalName, users]);

  const clients = React.useMemo(() => {
    let filtered = selectedBranch === 'all' ? allClients : allClients.filter(c => c.branch === selectedBranch);
    
    if (!canViewGlobalDashboard && currentUser) {
      filtered = filtered.filter(c => isClientAssignedToRep(c, currentUser.id, currentUser.name || ''));
    }
    
    return filtered;
  }, [allClients, selectedBranch, canViewGlobalDashboard, currentUser, isClientAssignedToRep]);

  const payments = React.useMemo(() => {
    let filtered = allPayments;
    if (selectedBranch !== 'all') {
      const branchClientIds = new Set(allClients.filter(c => c.branch === selectedBranch).map(c => c.id));
      filtered = filtered.filter(p => branchClientIds.has(p.clientId));
    }

    if (!canViewGlobalDashboard && currentUser) {
      filtered = filtered.filter(p => isPaymentAttributedToRep(p, currentUser.id, currentUser.name || ''));
    }

    return filtered;
  }, [allPayments, allClients, selectedBranch, canViewGlobalDashboard, currentUser, isPaymentAttributedToRep]);

  // Only super_admin and crm_admin can drill into individual rep performance.
  // admin / manager see aggregate global data but cannot filter by rep.
  const canViewRepBreakdown = currentUser?.role === 'super_admin' || currentUser?.role === 'crm_admin';

  // Ensure non-breakdown users always see the "all" aggregate view
  const effectiveRepId = canViewRepBreakdown ? selectedRepId : 'all';

  const now = new Date();

  // Stats
  const totalLeads = clients.filter(c => c.status === 'Lead').length;
  const activeMembers = clients.filter(c => c.status === 'Active').length;
  const nearlyExpiredList = clients.filter(c => c.status === 'Nearly Expired');
  const nearlyExpired = nearlyExpiredList.length;
  const expiredList = clients.filter(c => c.status === 'Expired');
  const expired = expiredList.length;
  
  // New workflow specific filters
  const negativeSessions = clients.filter(c => typeof c.sessionsRemaining === 'number' && c.sessionsRemaining < 0);
  const noAttendance = clients.filter(c => c.sessionsRemaining === 'no attend');
  
  // Reminders
  const upcomingVisits = clients.filter(c => 
    c.expectedVisitDate && 
    isAfter(parseISO(c.expectedVisitDate), now) && 
    isBefore(parseISO(c.expectedVisitDate), addDays(now, 3))
  );
  
  const upcomingBirthdays = clients.filter(c => {
    if (!c.dateOfBirth) return false;
    const dob = parseISO(c.dateOfBirth);
    const dobThisYear = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    return isAfter(dobThisYear, subDays(now, 1)) && isBefore(dobThisYear, addDays(now, 7));
  });

  const attentionLeads = clients.filter(c => {
    if (c.status !== 'Lead' || c.paid) return false;
    if (c.assignedTo !== currentUser?.id) return false;
    if (!c.comments || c.comments.length === 0) return false;
    
    const latestComment = c.comments.reduce((latest, current) => {
      if (!latest || !latest.date) return current;
      if (!current || !current.date) return latest;
      return isAfter(parseISO(current.date), parseISO(latest.date)) ? current : latest;
    }, c.comments[0]);

    if (!latestComment || !latestComment.date) return false;

    const daysSinceComment = differenceInDays(now, parseISO(latestComment.date));
    return daysSinceComment >= 7;
  });

  const handleUpdateTarget = () => {
    const target = parseFloat(newTarget);
    if (!isNaN(target) && target > 0) {
      if (canViewGlobalDashboard && effectiveRepId !== 'all') {
        updateUserTarget(effectiveRepId, currentMonthStr, target);
      } else {
        if (canViewGlobalDashboard) {
          updateUserTarget('global', currentMonthStr, target);
        }
        updateSalesTarget(target);
      }
      setIsTargetDialogOpen(false);
    }
  };

  // Filtered statistics for rep performance view
  const selectedMonth = subMonths(now, selectedMonthOffset);
  const currentMonthStr = format(selectedMonth, 'yyyy-MM');
  const reps = users.filter(u => u.role === 'rep' || (u.role as string) === 'sales_rep' || (u.role as string) === 'sales' || u.role === 'manager');

  
  const filteredSalesData = React.useMemo(() => {
    let targetAmount = 0;

    let relevantPayments = payments.filter(p => format(parseISO(p.date), 'yyyy-MM') === currentMonthStr);

    if (canViewGlobalDashboard && effectiveRepId !== 'all') {
      // Manager viewing a specific rep
      const repTarget = userTargets.find(t =>
        (t.userId === effectiveRepId || t.sales_rep_id === effectiveRepId) &&
        (t.month === currentMonthStr || t.month_year === currentMonthStr)
      );
      targetAmount = repTarget?.targetAmount ?? 0;

      const selectedUser = users.find(u => u.id === effectiveRepId);
      const repName = selectedUser?.name || '';
      relevantPayments = relevantPayments.filter(p => isPaymentAttributedToRep(p, effectiveRepId, repName));
    } else if (canViewGlobalDashboard && effectiveRepId === 'all') {
      const globalMonthlyTarget = userTargets.find(t => 
        t.userId === 'global' && 
        (t.month === currentMonthStr || t.month_year === currentMonthStr)
      );

      if (globalMonthlyTarget) {
        targetAmount = globalMonthlyTarget.targetAmount;
      } else {
        // Manager viewing all reps — sum every active rep's target for the selected month
        const monthTargets = userTargets.filter(t =>
          (t.month === currentMonthStr || t.month_year === currentMonthStr) && t.userId !== 'global'
        );
        targetAmount = monthTargets.length > 0
          ? monthTargets.reduce((sum, t) => sum + (t.targetAmount || 0), 0)
          : salesTarget.targetAmount;
      }
    } else if (!canViewGlobalDashboard && currentUser) {
      // Rep viewing their own data
      const repTarget = userTargets.find(t =>
        (t.userId === currentUser.id || t.sales_rep_id === currentUser.id) &&
        (t.month === currentMonthStr || t.month_year === currentMonthStr)
      );
      if (repTarget) {
        targetAmount = repTarget.targetAmount;
      } else if (currentUser.salesTarget) {
        targetAmount = currentUser.salesTarget;
      }
    }

    const currentAmount = relevantPayments.reduce((acc, p) => acc + p.amount, 0);
    const privatePayments = relevantPayments.filter(p => isPrivatePackage(p.packageType));
    const groupPayments = relevantPayments.filter(p => isGroupPackage(p.packageType));

    const privateSessionsSold = privatePayments.length;
    const groupSessionsSold = groupPayments.length;
    const privateRevenue = privatePayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const groupRevenue = groupPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    
    const cash = relevantPayments.filter(p => p.method === 'Cash').reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const visa = relevantPayments.filter(p => p.method === 'Credit Card').reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const instapay = relevantPayments.filter(p => p.method === 'Instapay').reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

    return {
      targetAmount,
      currentAmount,
      privateSessionsSold,
      groupSessionsSold,
      privateRevenue,
      groupRevenue,
      cash,
      visa,
      instapay,
      percentage: targetAmount > 0 ? Math.round((currentAmount / targetAmount) * 100) : 0
    };
  }, [payments, effectiveRepId, canViewGlobalDashboard, salesTarget, userTargets, currentMonthStr, clients]);

  // Always use filteredSalesData which has correct month + rep filtering applied
  const totalCash = filteredSalesData.cash;
  const totalVisa = filteredSalesData.visa;
  const totalInstapay = filteredSalesData.instapay;

  const totalPackagesSold = filteredSalesData.privateSessionsSold + filteredSalesData.groupSessionsSold;
  const privatePercentage = totalPackagesSold > 0 ? Math.round((filteredSalesData.privateSessionsSold / totalPackagesSold) * 100) : 0;
  const groupPercentage = totalPackagesSold > 0 ? Math.round((filteredSalesData.groupSessionsSold / totalPackagesSold) * 100) : 0;

  // Chart Data (personal - for rep view)
  const chartData = React.useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, i) => subMonths(now, 5 - i));

    return months.map(date => {
      const monthStr = format(date, 'yyyy-MM');
      const start = startOfMonth(date);
      const end = endOfMonth(date);

      let targetAmount = 0;
      if (currentUser?.role === 'rep') {
        const targetDoc = userTargets.find(t => t.userId === currentUser.id && t.month === monthStr);
        targetAmount = targetDoc ? targetDoc.targetAmount : 0;
      }

      const monthPayments = payments.filter(p => {
        const pDate = parseISO(p.date);
        if (!isWithinInterval(pDate, { start, end })) return false;

        if (currentUser?.role === 'rep') {
          return isPaymentAttributedToRep(p, currentUser.id, currentUser.name || '');
        }

        return true;
      });

      const achievedAmount = monthPayments.reduce((sum, p) => sum + p.amount, 0);
      const privateRevenue = monthPayments.filter(p => isPrivatePackage(p.packageType)).reduce((s, p) => s + p.amount, 0);
      const groupRevenue = monthPayments.filter(p => isGroupPackage(p.packageType)).reduce((s, p) => s + p.amount, 0);

      return {
        month: format(date, 'MMM yy'),
        Target: targetAmount,
        Private: privateRevenue,
        Group: groupRevenue,
      };
    });
  }, [userTargets, payments, clients, currentUser]);

  // 6-month team revenue trend (global)
  const teamRevenueData = React.useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, i) => subMonths(now, 5 - i));
    return months.map(date => {
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const mp = payments.filter(p => isWithinInterval(parseISO(p.date), { start, end }));
      return {
        month: format(date, 'MMM yy'),
        Revenue: mp.reduce((s, p) => s + p.amount, 0),
      };
    });
  }, [payments]);

  // Per-rep revenue vs target for selected month
  const repComparisonData = React.useMemo(() => {
    if (!canViewGlobalDashboard) return [];
    return reps.map(rep => {
      const repTarget = userTargets.find(t => t.userId === rep.id && t.month === currentMonthStr);
      const repPayments = payments.filter(p => {
        if (format(parseISO(p.date), 'yyyy-MM') !== currentMonthStr) return false;
        return isPaymentAttributedToRep(p, rep.id, rep.name || '');
      });
      return {
        name: (rep.name || rep.email || 'Unknown').split(' ')[0],
        Revenue: repPayments.reduce((s, p) => s + p.amount, 0),
        Target: repTarget?.targetAmount || 0,
      };
    });
  }, [reps, payments, userTargets, currentMonthStr, canViewGlobalDashboard]);

  // 6-month payment method breakdown
  const monthlyMethodData = React.useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, i) => subMonths(now, 5 - i));
    return months.map(date => {
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const mp = payments.filter(p => isWithinInterval(parseISO(p.date), { start, end }));
      return {
        month: format(date, 'MMM yy'),
        Cash: mp.filter(p => p.method === 'Cash').reduce((s, p) => s + p.amount, 0),
        Visa: mp.filter(p => p.method === 'Credit Card').reduce((s, p) => s + p.amount, 0),
        Instapay: mp.filter(p => p.method === 'Instapay').reduce((s, p) => s + p.amount, 0),
      };
    });
  }, [payments]);

  // 6-month session type breakdown
  const monthlySessionData = React.useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, i) => subMonths(now, 5 - i));
    return months.map(date => {
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const mp = payments.filter(p => isWithinInterval(parseISO(p.date), { start, end }));
      return {
        month: format(date, 'MMM yy'),
        Private: mp.filter(p => isPrivatePackage(p.packageType)).length,
        Group: mp.filter(p => isGroupPackage(p.packageType)).length,
      };
    });
  }, [payments]);

  // Leaderboard Data Calculation
  const leaderboardData = React.useMemo(() => {
    if (!canViewGlobalDashboard) return [];

    const data = reps.map(rep => {
      const repTarget = userTargets.find(t => t.userId === rep.id && t.month === currentMonthStr);
      const targetAmount = repTarget?.targetAmount || 0;

      const repPayments = payments.filter(p => {
        if (format(parseISO(p.date), 'yyyy-MM') !== currentMonthStr) return false;
        return isPaymentAttributedToRep(p, rep.id, rep.name || '');
      });
      const revenue = repPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

      const convertedThisMonth = clients.filter(c => 
        isClientAssignedToRep(c, rep.id, rep.name || '') && 
        c.status !== 'Lead' && 
        c.startDate && (c.startDate.startsWith(currentMonthStr))
      ).length;

      const totalLeadsCount = clients.filter(c => isClientAssignedToRep(c, rep.id, rep.name || '')).length;
      const targetAchievement = targetAmount > 0 ? (revenue / targetAmount) * 100 : 0;
      const conversionRate = totalLeadsCount > 0 ? (convertedThisMonth / totalLeadsCount) * 100 : 0;

      return {
        id: rep.id,
        name: rep.name || rep.email || 'Unknown',
        revenue,
        targetAmount,
        targetAchievement: Math.round(targetAchievement),
        converted: convertedThisMonth,
        totalLeads: totalLeadsCount,
        conversionRate: Math.round(conversionRate * 10) / 10
      };
    });

    // Apply sorting
    return [...data].sort((a, b) => {
      const aValue = (a as any)[sortConfig.key];
      const bValue = (b as any)[sortConfig.key];
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [reps, payments, userTargets, currentMonthStr, clients, canViewGlobalDashboard, sortConfig]);

  const exportRepLeaderboardCSV = () => {
    const headers = ['Rank', 'Rep Name', 'Revenue', 'Target Amount', 'Target Achievement %', 'Converted Leads', 'Total Leads', 'Conversion Rate %'];
    const rows = leaderboardData.map((rep, index) => [
      index + 1,
      `"${rep.name.replace(/"/g, '""')}"`,
      rep.revenue,
      rep.targetAmount,
      rep.targetAchievement,
      rep.converted,
      rep.totalLeads,
      rep.conversionRate
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Rep_Leaderboard_${currentMonthStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // New vs Returning members for the selected month
  const { newMembersCount, returningMembersCount } = React.useMemo(() => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const newCount = clients.filter(c =>
      c.startDate && isWithinInterval(parseISO(c.startDate), { start: monthStart, end: monthEnd })
    ).length;
    const returningCount = clients.filter(c =>
      (c.status === 'Active' || c.status === 'Nearly Expired') &&
      c.startDate && parseISO(c.startDate) < monthStart
    ).length;
    return { newMembersCount: newCount, returningMembersCount: returningCount };
  }, [clients, selectedMonth]);

  // Attendance heatmap: check-ins per day-of-week per branch over the last 90 days
  const attendanceHeatmap = React.useMemo(() => {
    const cutoff = subDays(now, 90);
    const recent = attendances.filter(a => parseISO(a.date) >= cutoff);
    const branchList = selectedBranch === 'all' ? branches : [selectedBranch as string];
    return branchList.map(branch => {
      const counts: number[] = [0, 0, 0, 0, 0, 0, 0];
      recent.filter(a => a.branch === branch).forEach(a => {
        const dow = getDay(parseISO(a.date)); // 0 = Sun
        const idx = dow === 0 ? 6 : dow - 1; // remap Mon=0 … Sun=6
        counts[idx] = (counts[idx] ?? 0) + 1;
      });
      return { branch, counts };
    });
  }, [attendances, branches, selectedBranch]);

  return (
    <div className="space-y-6">
      {canViewGlobalDashboard ? (
        <div className="flex flex-wrap items-center gap-3 bg-muted/30 p-3 rounded-lg border border-border/50">
          <Users className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium">{t('dashboard.rep_performance')}</h3>
            <p className="text-xs text-muted-foreground hidden sm:block">{t('dashboard.filter_by_rep')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedMonthOffset(o => o + 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-24 text-center">{format(selectedMonth, 'MMM yyyy')}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedMonthOffset(o => Math.max(0, o - 1))} disabled={selectedMonthOffset === 0}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {canViewRepBreakdown && (
            <Select value={selectedRepId} onValueChange={(v) => setSelectedRepId(v || 'all')}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder={t('dashboard.select_rep')}>
                  {selectedRepId === 'all' ? t('dashboard.all_reps') : reps.find(r => r.id === selectedRepId)?.name ?? 'Unknown User'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dashboard.all_reps')}</SelectItem>
                {reps.map(rep => (
                  <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={selectedBranch} onValueChange={(v) => setSelectedBranch(v || 'all')}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder={t('dashboard.select_branch')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.all_branches')}</SelectItem>
              {branches.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-muted/30 px-4 py-3 rounded-lg border border-border/50">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground flex-1">{t('dashboard.viewing_history')}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSelectedMonthOffset(o => o + 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-28 text-center">
              {format(selectedMonth, 'MMM yyyy')}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSelectedMonthOffset(o => Math.max(0, o - 1))}
              disabled={selectedMonthOffset === 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-5">
        {currentUser?.role === 'admin' ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.total_payments')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredSalesData.currentAmount.toLocaleString()} LE</div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t('dashboard.cash')}:</span>
                  <span className="font-medium text-foreground">{totalCash.toLocaleString()} LE</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('dashboard.visa')}:</span>
                  <span className="font-medium text-foreground">{totalVisa.toLocaleString()} LE</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('dashboard.instapay')}:</span>
                  <span className="font-medium text-foreground">{totalInstapay.toLocaleString()} LE</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.sales_target')}</CardTitle>
              {canAccessSettings && (
                <CardAction>
                  <Dialog open={isTargetDialogOpen} onOpenChange={setIsTargetDialogOpen}>
                    <DialogTrigger
                      render={
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <Settings className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      }
                    />
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t('dashboard.update_sales_target')}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>{t('dashboard.new_target_amount')}</Label>
                          <Input 
                            type="number" 
                            value={newTarget} 
                            onChange={(e) => setNewTarget(e.target.value)} 
                          />
                        </div>
                        <Button onClick={handleUpdateTarget} className="w-full">{t('dashboard.save_target')}</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredSalesData.currentAmount.toLocaleString()} LE</div>
              <p className="text-xs text-muted-foreground">
                {filteredSalesData.percentage}% {t('common.of')} {filteredSalesData.targetAmount.toLocaleString()} LE {t('dashboard.sales_target')}
              </p>
              <div className="mt-4 h-2 w-full bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary" 
                  style={{ width: `${Math.min(filteredSalesData.percentage, 100)}%` }}
                />
              </div>

              <div className="mt-4 pt-3 border-t">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-2">{t('dashboard.packages_breakdown')}</span>
                <div className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-muted-foreground block text-[11px] mb-0.5">{t('dashboard.pt_packages')}</span>
                        <span className="text-lg font-bold">
                          {filteredSalesData.privateRevenue.toLocaleString()} <span className="text-xs font-normal">LE</span>
                        </span>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="font-semibold px-1.5 py-0 h-5 bg-blue-500/10 text-blue-500 border-blue-500/20">
                          {filteredSalesData.privateSessionsSold} {t('dashboard.packages')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-muted-foreground block text-[11px] mb-0.5">{t('dashboard.group_packages')}</span>
                        <span className="text-lg font-bold">
                          {filteredSalesData.groupRevenue.toLocaleString()} <span className="text-xs font-normal">LE</span>
                        </span>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="font-semibold px-1.5 py-0 h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          {filteredSalesData.groupSessionsSold} {t('dashboard.packages')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.active_leads')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.needs_follow_up')}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.expiring_soon')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{nearlyExpired}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.ending_30d')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.total_expired')}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{expired}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.expired_memberships')}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.upcoming_birthdays')}</CardTitle>
            <Gift className="h-4 w-4 text-pink-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingBirthdays.length}</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.next_7_days')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.new_members')}</CardTitle>
            <UserPlus className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{newMembersCount}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.joined_in')} {format(selectedMonth, 'MMM yyyy')}
            </p>
            <div className="mt-3 pt-3 border-t flex justify-between text-xs text-muted-foreground">
              <span>{t('dashboard.returning_active')}</span>
              <span className="font-semibold text-foreground">{returningMembersCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Branch Attendance Heatmap */}
      {attendanceHeatmap.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.branch_attendance')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
              const max = Math.max(...attendanceHeatmap.flatMap(b => b.counts), 1);
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left pr-3 pb-2 font-medium text-muted-foreground w-28">{t('dashboard.branch')}</th>
                        {DAY_LABELS.map(d => (
                          <th key={d} className="pb-2 font-medium text-muted-foreground text-center w-12">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceHeatmap.map(({ branch, counts }) => (
                        <tr key={branch}>
                          <td className="pr-3 py-1 font-medium text-sm truncate max-w-[7rem]">{branch}</td>
                          {counts.map((count, i) => {
                            const intensity = count / max;
                            const bg = intensity === 0
                              ? 'bg-muted/40'
                              : intensity < 0.33
                              ? 'bg-primary/20'
                              : intensity < 0.66
                              ? 'bg-primary/50'
                              : 'bg-primary/80';
                            return (
                              <td key={i} className="py-1 px-1 text-center">
                                <div
                                  title={`${count} check-ins`}
                                  className={`mx-auto h-8 w-9 rounded flex items-center justify-center font-semibold text-[11px] transition-colors ${bg} ${intensity > 0.5 ? 'text-primary-foreground' : 'text-foreground'}`}
                                >
                                  {count > 0 ? count : ''}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-[10px] text-muted-foreground">
                    {t('dashboard.heatmap_legend')}
                  </p>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.action_required_packages')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {negativeSessions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-red-600 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1" /> {t('dashboard.negative_packages')}
                  </h4>
                  <PaginatedList 
                    items={negativeSessions} 
                    renderItem={(client) => (
                      <div key={client.id} className="flex items-center justify-between p-2 border border-red-200 bg-red-50 dark:bg-red-900/10 rounded-md">
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{client.packageType}</p>
                        </div>
                        <Badge variant="destructive">{client.sessionsRemaining} {t('dashboard.packages')}</Badge>
                      </div>
                    )} 
                  />
                </div>
              )}
              
              {noAttendance.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-sm font-semibold text-amber-600 flex items-center">
                    <CalendarDays className="h-4 w-4 mr-1" /> {t('dashboard.no_attendance_yet')}
                  </h4>
                  <PaginatedList 
                    items={noAttendance} 
                    renderItem={(client) => (
                      <div key={client.id} className="flex items-center justify-between p-2 border border-amber-200 bg-amber-50 dark:bg-amber-900/10 rounded-md">
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{client.packageType}</p>
                        </div>
                        <Badge variant="outline" className="text-amber-600 border-amber-600">{t('dashboard.no_attendance')}</Badge>
                      </div>
                    )} 
                  />
                </div>
              )}

              {expiredList.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-sm font-semibold text-red-600 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1" /> {t('dashboard.expired_packages')}
                  </h4>
                  <PaginatedList 
                    items={expiredList} 
                    renderItem={(client) => (
                      <div key={client.id} className="flex items-center justify-between p-2 border border-red-200 bg-red-50 dark:bg-red-900/10 rounded-md">
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{t('members.table.expiry_date') || 'Expired'}: {client.membershipExpiry ? new Date(client.membershipExpiry).toLocaleDateString() : 'Unknown'}</p>
                        </div>
                        <Badge variant="destructive">{t('members.tabs.expired') || 'Expired'}</Badge>
                      </div>
                    )} 
                  />
                </div>
              )}

              {negativeSessions.length === 0 && noAttendance.length === 0 && expiredList.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('dashboard.all_packages_ok')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.urgent_reminders')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingVisits.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-blue-600 flex items-center">
                    <CalendarDays className="h-4 w-4 mr-1" /> {t('dashboard.upcoming_visits')}
                  </h4>
                  <PaginatedList 
                    items={upcomingVisits} 
                    renderItem={(client) => (
                      <div key={client.id} className="flex items-center justify-between p-2 border rounded-md">
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{t('dashboard.expected_visit')}: {new Date(client.expectedVisitDate!).toLocaleDateString()}</p>
                        </div>
                      </div>
                    )} 
                  />
                </div>
              )}

              {nearlyExpiredList.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-sm font-semibold text-amber-600 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1" /> {t('dashboard.expiring_soon')}
                  </h4>
                  <PaginatedList 
                    items={nearlyExpiredList} 
                    renderItem={(client) => (
                      <div key={client.id} className="flex items-center justify-between p-2 border border-amber-200 bg-amber-50 dark:bg-amber-900/10 rounded-md">
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{t('members.table.expiry_date') || 'Expires'}: {client.membershipExpiry ? new Date(client.membershipExpiry).toLocaleDateString() : 'Unknown'}</p>
                        </div>
                      </div>
                    )} 
                  />
                </div>
              )}

              {attentionLeads.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-sm font-semibold text-purple-600 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-1" /> {t('dashboard.leads_needing_attention')}
                  </h4>
                  <PaginatedList 
                    items={attentionLeads} 
                    renderItem={(client) => (
                      <div key={client.id} className="flex items-center justify-between p-2 border border-purple-200 bg-purple-50 dark:bg-purple-900/10 rounded-md">
                        <div>
                          <p className="font-medium text-sm">{client.name}</p>
                          <p className="text-xs text-muted-foreground">{t('dashboard.last_comment')} {differenceInDays(now, parseISO(client.comments.reduce((latest: any, current: any) => isAfter(parseISO(current.date), parseISO(latest.date)) ? current : latest, client.comments[0]).date))} {t('dashboard.days_ago')}</p>
                        </div>
                      </div>
                    )} 
                  />
                </div>
              )}

              {upcomingVisits.length === 0 && nearlyExpiredList.length === 0 && attentionLeads.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('dashboard.no_urgent_reminders')}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    <div className="md:col-span-1">
      <OnlineUsers />
    </div>
  </div>

      {/* ── Team Charts (managers see global, reps see personal) ── */}
      {canViewGlobalDashboard ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">{t('dashboard.team_analytics')}</h2>

          <div className="grid grid-cols-1">
            <ConversionFunnel 
              selectedRepId={effectiveRepId} 
              selectedMonthStr={currentMonthStr} 
            />
          </div>

          {/* Row 1: Revenue Trend + Rep Comparison */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t('dashboard.six_month_revenue')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={teamRevenueData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [`${v.toLocaleString()} LE`, t('payments.table.amount') || 'Revenue']} />
                    <Area type="monotone" dataKey="Revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2} dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t('dashboard.rep_performance')} — {format(selectedMonth, 'MMMM yyyy')}</CardTitle>
              </CardHeader>
              <CardContent>
                {repComparisonData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">No reps found.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={repComparisonData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => `${v.toLocaleString()} LE`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Revenue" name={t('payments.table.amount') || 'Revenue'} fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Target" name={t('dashboard.sales_target') || 'Target'} fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Payment Methods + Session Types */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Payment Methods — 6 Months</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyMethodData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => `${v.toLocaleString()} LE`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Cash" name={t('dashboard.cash')} stackId="a" fill="#22c55e" />
                    <Bar dataKey="Visa" name={t('dashboard.visa')} stackId="a" fill="#3b82f6" />
                    <Bar dataKey="Instapay" name={t('dashboard.instapay')} stackId="a" fill="#ec4899" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Session Types — 6 Months</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlySessionData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Private" name={t('dashboard.pt_packages')} stackId="b" fill="#8b5cf6" />
                    <Bar dataKey="Group" name={t('dashboard.group_packages')} stackId="b" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Rep Leaderboard Section */}
          <Card className="mt-4 overflow-hidden border-none shadow-lg bg-gradient-to-br from-white to-gray-50/50">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Trophy className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900 leading-none">Rep Performance Leaderboard</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{format(selectedMonth, 'MMMM yyyy')} statistics</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportRepLeaderboardCSV}
                className="hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all duration-200"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0">
            <div className="overflow-x-auto -mx-4 md:mx-0 scroll-touch">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Rank</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <button onClick={() => handleSort('name')} className="flex items-center hover:text-indigo-600 transition-colors">
                          REP NAME <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <button onClick={() => handleSort('revenue')} className="flex items-center hover:text-indigo-600 transition-colors">
                          REVENUE <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        <button onClick={() => handleSort('targetAchievement')} className="flex items-center hover:text-indigo-600 transition-colors">
                          TARGET % <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        <button onClick={() => handleSort('converted')} className="flex items-center hover:text-indigo-600 transition-colors">
                          CONVERTED <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        <button onClick={() => handleSort('conversionRate')} className="flex items-center hover:text-indigo-600 transition-colors">
                          RATE % <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground italic">No representative data found for this period.</td>
                      </tr>
                    ) : (
                      leaderboardData.map((rep, index) => (
                        <tr key={rep.id} className="border-b border-gray-50 hover:bg-indigo-50/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-700 group-hover:bg-indigo-100 group-hover:text-indigo-700 transition-colors">
                                {index + 1}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">{rep.name}</div>
                              <div className="text-[10px] text-muted-foreground uppercase font-medium">{rep.id?.slice(-6) || 'N/A'}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-gray-900">{rep.revenue.toLocaleString()} <span className="text-[10px] text-muted-foreground font-normal">LE</span></div>
                            <div className="text-[10px] text-muted-foreground">Goal: {rep.targetAmount.toLocaleString()}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-[80px] h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-500 ${rep.targetAchievement >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                  style={{ width: `${Math.min(rep.targetAchievement, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-bold ${rep.targetAchievement >= 100 ? 'text-emerald-600' : 'text-gray-700'}`}>
                                {rep.targetAchievement}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                              {rep.converted} <span className="ml-1 text-[10px] opacity-70 font-medium">leads</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-gray-900">{rep.conversionRate}%</span>
                              <span className="text-[10px] text-muted-foreground">{rep.converted} of {rep.totalLeads} total</span>
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
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">My Performance</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Revenue vs Target — Last 6 Months</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => `${v.toLocaleString()} LE`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Private" name={t('dashboard.pt_packages')} stackId="rev" fill="#6366f1" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Group" name={t('dashboard.group_packages')} stackId="rev" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Target" name={t('dashboard.sales_target') || 'Target'} fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}


