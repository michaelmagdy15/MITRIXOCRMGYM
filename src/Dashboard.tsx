import React, { useState } from 'react';
import ConversionFunnel from './components/ConversionFunnel';
import TwilioBroadcastManager from './components/TwilioBroadcastManager';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from './context';
import type { Payment } from './types';
import { SALES_NAME_MAPPING } from './constants';
import { resolveUserDisplay } from './utils/resolveUserDisplay';
import { differenceInDays, isSameDay, parseISO, isAfter, isBefore, addDays, subDays, subMonths, startOfMonth, endOfMonth, isWithinInterval, format, getDay } from 'date-fns';
import { safeFormatDate, toValidDate } from './utils/dateUtils';
import { resolvePaymentBranch } from './utils/branchUtils';
import { useLanguage } from './contexts/LanguageContext';
import { toast } from 'sonner';

const safeParseISO = (dateStr: any): Date => {
  const valid = toValidDate(dateStr);
  return valid || new Date(NaN);
};

// A payment only counts toward revenue when it is settled and not soft-deleted.
// Refunds set status 'refunded' and a deleted_at timestamp, so both are excluded.
const isValidPayment = (p: Payment) => !p.deleted_at && (!p.status || p.status === 'paid');

// Revenue must reflect money actually collected. amount_paid is authoritative
// once a discount is applied; amount is the gross price before discount.
const getPaymentNet = (p: Payment) => Number(p.amount_paid ?? p.amount) || 0;

const PRIVATE_PACKAGES = [
  'drop session pt', 
  '30 s pt',
  '20 s pt',
  '10 s pt'
];

const GROUP_PACKAGES = [
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
  if (lower.includes('group pt')) return false;
  return PRIVATE_PACKAGES.includes(lower) || /\bpt\b/i.test(pkg) || lower.includes('private');
};

export const isGroupPackage = (pkg: string) => {
  if (!pkg) return false;
  const lower = pkg.toLowerCase().trim();
  if (isPrivatePackage(pkg)) return false;
  return GROUP_PACKAGES.includes(lower) || lower.includes('group') || lower.includes('gt') || lower.includes('sgf');
};
import { Target, Users, CalendarDays, AlertTriangle, Gift, Settings, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Trophy, Download, ArrowUpDown, UserCheck, UserPlus, Snowflake, Clock, Send, Megaphone } from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import OnlineUsers from './components/OnlineUsers';
import { Textarea } from '@/components/ui/textarea';
import TodayClassesWidget from './components/dashboard/TodayClassesWidget';
import InzanDailyRevenueSummary from './components/dashboard/InzanDailyRevenueSummary';
import { RetentionRadarCard } from './components/dashboard/RetentionRadarCard';
import { isTenantInzan } from './utils/inzanOrg';
import { getTenantId } from './firebase';

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

// Precomputed once: lowercase alias -> lowercase canonical rep name.
// Previously every comparison looped over the whole mapping table, which ran
// hundreds of thousands of times per dashboard render.
const CANONICAL_NAME_MAP = new Map(
  Object.entries(SALES_NAME_MAPPING).map(([alias, canonical]) => [alias.trim().toLowerCase(), canonical.trim().toLowerCase()])
);
const toCanonicalName = (name?: string | null): string => {
  if (!name) return '';
  const key = name.trim().toLowerCase();
  return CANONICAL_NAME_MAP.get(key) ?? key;
};

interface SalesTargetValues {
  targetAmount: number;
  ptTarget: number;
  classesTarget: number;
  membershipsTarget: number;
}

// Owns its own input state so typing re-renders only this dialog,
// not the whole Dashboard (charts, leaderboard, member lists).
const SalesTargetDialog = React.memo(function SalesTargetDialog({
  initial,
  onSave,
}: {
  initial: SalesTargetValues;
  onSave: (values: SalesTargetValues) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ targetAmount: '', ptTarget: '', classesTarget: '', membershipsTarget: '' });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setDraft({
        targetAmount: String(initial.targetAmount),
        ptTarget: String(initial.ptTarget),
        classesTarget: String(initial.classesTarget),
        membershipsTarget: String(initial.membershipsTarget),
      });
    }
  };

  const setField = (field: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const targetAmount = parseFloat(draft.targetAmount);
    if (isNaN(targetAmount) || targetAmount <= 0) {
      toast.error('Enter a total target greater than 0.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        targetAmount,
        ptTarget: parseFloat(draft.ptTarget) || 0,
        classesTarget: parseFloat(draft.classesTarget) || 0,
        membershipsTarget: parseFloat(draft.membershipsTarget) || 0,
      });
      toast.success('Sales target saved.');
      setOpen(false);
    } catch {
      toast.error('Failed to save sales target. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Settings className="h-4 w-4 text-muted-foreground" />
          </Button>
        }
      />
      <DialogContent className="w-[95vw] sm:max-w-md md:max-w-lg rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{t('dashboard.update_sales_target')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('dashboard.new_target_amount')} (Total)</Label>
            <Input type="number" inputMode="decimal" value={draft.targetAmount} onChange={setField('targetAmount')} />
          </div>
          <div className="space-y-2">
            <Label>PT Target (LE)</Label>
            <Input type="number" inputMode="decimal" value={draft.ptTarget} onChange={setField('ptTarget')} />
          </div>
          <div className="space-y-2">
            <Label>Classes Target (LE)</Label>
            <Input type="number" inputMode="decimal" value={draft.classesTarget} onChange={setField('classesTarget')} />
          </div>
          <div className="space-y-2">
            <Label>Memberships Target (LE)</Label>
            <Input type="number" inputMode="decimal" value={draft.membershipsTarget} onChange={setField('membershipsTarget')} />
          </div>
          <Button onClick={handleSave} className="w-full" disabled={saving}>
            {saving ? 'Saving…' : t('dashboard.save_target')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default function Dashboard() {
  const { salesTarget, updateSalesTarget, updateUserTarget, currentUser, userTargets, users, canViewGlobalDashboard, canAccessSettings, branches, branding, clients: contextClients, payments: contextPayments, attendances, features, setActiveTab, setActiveClientId } = useAppContext();
  const { t, language, isRtl } = useLanguage();
  // Use context data directly instead of creating duplicate Firestore listeners.
  // Context 'clients' and 'payments' are already filtered for the current user's visibility.
  // For manager cross-rep analysis we need unfiltered data — but all users in context already
  // receive the full dataset when canViewGlobalDashboard is true. For reps, they only see their own.
  const allClients = contextClients;
  const allPayments = contextPayments;
  const isInzan = isTenantInzan() || getTenantId().toLowerCase().includes('inzan');

  const pendingConfirmationCount = React.useMemo(() => {
    let count = 0;
    allClients.forEach(client => {
      if (client.packages) {
        client.packages.forEach(pkg => {
          if (pkg.isPendingConfirmation === true) {
            count++;
          }
        });
      }
    });
    return count;
  }, [allClients]);

  const frozenCount = React.useMemo(() => {
    return allClients.filter(c => c.status === 'Hold').length;
  }, [allClients]);

  const frozenMembers = React.useMemo(() => {
    return allClients.filter(c => c.status === 'Hold');
  }, [allClients]);

  const handleUnfreeze = async (clientId: string, clientName: string) => {
    try {
      const heldPayments = contextPayments.filter(p => p.clientId === clientId && p.isOnHold === true);
      const { releasePayment } = await import('./utils/holdUtils');
      
      if (heldPayments.length > 0) {
        for (const payment of heldPayments) {
          await releasePayment(payment.id, clientId, clientName, currentUser?.id || 'system', currentUser?.name || 'Staff');
        }
      } else {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        await updateDoc(doc(db, 'clients', clientId), {
          status: 'Active'
        });
      }
      toast.success(`Successfully unfrozen ${clientName}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to unfreeze member.');
    }
  };
  const [isTargetWidgetCollapsed, setIsTargetWidgetCollapsed] = useState(() => localStorage.getItem('isTargetWidgetCollapsed') === 'true');

  const toggleTargetWidget = () => {
    setIsTargetWidgetCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('isTargetWidgetCollapsed', String(next));
      return next;
    });
  };

  const [selectedRepId, setSelectedRepId] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'revenue', direction: 'desc' });
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [isSendingPush, setIsSendingPush] = useState(false);
  // Stat-card drill-down: which member list is open in the dialog (null = closed).
  const [statDrilldown, setStatDrilldown] = useState<null | 'leads' | 'expiring' | 'expired' | 'birthdays' | 'new' | 'returning'>(null);

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSendPushNotifications) {
      toast.error('You do not have permission to send push notifications.');
      return;
    }
    if (!pushTitle.trim() || !pushBody.trim()) {
      toast.error('Please enter both title and message.');
      return;
    }
    
    setIsSendingPush(true);
    try {
      const { notifyAllMembers } = await import('./services/pushService');
      const res = await notifyAllMembers(pushTitle.trim(), pushBody.trim(), {
        createdByName: currentUser?.name || currentUser?.email || 'Strike Admin',
        createdById: currentUser?.id || 'admin'
      });
      if (res && res.successCount > 0) {
        toast.success(`Announcement published in-app & sent as push to ${res.successCount} mobile devices!`);
      } else {
        toast.success('Announcement published in-app! All members opening the app or website will see this alert.');
      }
      setPushTitle('');
      setPushBody('');
    } catch (err) {
      console.error('[Dashboard] Error sending push announcement:', err);
      toast.error('Failed to send push notifications. Please check connection and try again.');
    } finally {
      setIsSendingPush(false);
    }
  };

  const canSendPushNotifications = React.useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    if (['admin', 'super_admin', 'crm_admin', 'owner'].includes(role)) return true;
    const nameEmail = (currentUser.name || currentUser.email || '').toLowerCase();
    return ['michael', 'magd', 'shady', 'inzan'].some(k => nameEmail.includes(k));
  }, [currentUser]);

  const clientMap = React.useMemo(() => {
    const map = new Map<string, any>();
    allClients.forEach(c => map.set(c.id, c));
    return map;
  }, [allClients]);

  const getCanonicalName = React.useCallback((name: string) => toCanonicalName(name), []);

  // id -> display name (same semantics as resolveUserDisplay, but O(1) instead of users.find per payment).
  const userDisplayById = React.useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(u => map.set(u.id, u.name || u.email || ''));
    return map;
  }, [users]);

  const isClientAssignedToRep = React.useCallback((client: any, repId: string, repName: string) => {
    const assigned = client.assignedTo || client.salesRep || client.salesName;
    if (!assigned) return false;
    if (client.assignedTo === repId || client.salesRep === repId) return true;
    const canonicalRep = getCanonicalName(repName);
    if (!canonicalRep) return false;
    if (client.assignedTo && getCanonicalName(client.assignedTo) === canonicalRep) return true;
    if (client.salesName && getCanonicalName(client.salesName) === canonicalRep) return true;
    return false;
  }, [getCanonicalName]);

  const isPaymentAttributedToRep = React.useCallback((payment: any, repId: string, repName: string) => {
    // 1. Direct ID match (new payments created through the CRM)
    if (payment.sales_rep_id && payment.sales_rep_id === repId) return true;

    // 2. Canonical name match on payment fields (some legacy data)
    const rawSalesName: string = payment.salesName || '';
    const resolvedSalesName = rawSalesName
      ? (userDisplayById.has(rawSalesName) ? (userDisplayById.get(rawSalesName) || rawSalesName) : rawSalesName)
      : '';
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
  }, [clientMap, getCanonicalName, userDisplayById]);

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
      filtered = filtered.filter(p => {
        const pBranch = resolvePaymentBranch(p, clientMap.get(p.clientId));
        return pBranch === selectedBranch || branchClientIds.has(p.clientId);
      });
    }

    if (!canViewGlobalDashboard && currentUser) {
      filtered = filtered.filter(p => isPaymentAttributedToRep(p, currentUser.id, currentUser.name || ''));
    }

    return filtered;
  }, [allPayments, allClients, selectedBranch, canViewGlobalDashboard, currentUser, isPaymentAttributedToRep, clientMap]);

  // Only super_admin and crm_admin can drill into individual rep performance.
  // admin / manager see aggregate global data but cannot filter by rep.
  const canViewRepBreakdown = currentUser?.role === 'super_admin' || currentUser?.role === 'crm_admin';

  // Ensure non-breakdown users always see the "all" aggregate view
  const effectiveRepId = canViewRepBreakdown ? selectedRepId : 'all';

  const now = new Date();

  // Stats — one memoized pass instead of ~10 full scans of the member list on every render.
  const {
    totalLeads, leadsList, activeMembers, nearlyExpiredList, nearlyExpired, expiredList, expired,
    negativeSessions, noAttendance, upcomingVisits, upcomingBirthdays, attentionLeads,
  } = React.useMemo(() => {
    const today = new Date();
    const visitWindowEnd = addDays(today, 3);
    const birthdayWindowStart = subDays(today, 1);
    const birthdayWindowEnd = addDays(today, 7);
    const currentUserId = currentUser?.id;

    let leadCount = 0;
    let activeCount = 0;
    const leadsArr: typeof clients = [];
    const nearlyExpiredArr: typeof clients = [];
    const expiredArr: typeof clients = [];
    const negativeArr: typeof clients = [];
    const noAttendArr: typeof clients = [];
    const visitsArr: typeof clients = [];
    const birthdaysArr: typeof clients = [];
    const attentionArr: typeof clients = [];

    for (const c of clients) {
      if (c.status === 'Lead') { leadCount++; leadsArr.push(c); }
      else if (c.status === 'Active') {
        activeCount++;
        if (c.isNearlyExpired) {
          nearlyExpiredArr.push(c);
        } else if (c.membershipExpiry) {
          const expD = safeParseISO(c.membershipExpiry);
          if (!isNaN(expD.getTime())) {
            const diffDays = Math.ceil((expD.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= 14) {
              nearlyExpiredArr.push(c);
            }
          }
        }
      }
      else if (c.status === 'Nearly Expired') nearlyExpiredArr.push(c);
      else if (c.status === 'Expired') expiredArr.push(c);

      if (typeof c.sessionsRemaining === 'number' && c.sessionsRemaining < 0) negativeArr.push(c);
      if (c.sessionsRemaining === 'no attend') noAttendArr.push(c);

      if (c.expectedVisitDate) {
        const d = parseISO(c.expectedVisitDate);
        if (!isNaN(d.getTime()) && isAfter(d, today) && isBefore(d, visitWindowEnd)) visitsArr.push(c);
      }

      if (c.dateOfBirth) {
        const dob = parseISO(c.dateOfBirth);
        if (!isNaN(dob.getTime())) {
          const dobThisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
          if (isAfter(dobThisYear, birthdayWindowStart) && isBefore(dobThisYear, birthdayWindowEnd)) birthdaysArr.push(c);
        }
      }

      if (c.status === 'Lead' && !c.paid && c.assignedTo === currentUserId && c.comments && c.comments.length > 0) {
        const latestComment = c.comments.reduce((latest, current) => {
          if (!latest || !latest.date) return current;
          if (!current || !current.date) return latest;
          const l = safeParseISO(latest.date);
          const cur = safeParseISO(current.date);
          if (isNaN(l.getTime())) return current;
          if (isNaN(cur.getTime())) return latest;
          return isAfter(cur, l) ? current : latest;
        }, c.comments[0]);
        if (latestComment?.date) {
          const p = safeParseISO(latestComment.date);
          if (!isNaN(p.getTime()) && differenceInDays(today, p) >= 7) attentionArr.push(c);
        }
      }
    }

    return {
      totalLeads: leadCount,
      leadsList: leadsArr,
      activeMembers: activeCount,
      nearlyExpiredList: nearlyExpiredArr,
      nearlyExpired: nearlyExpiredArr.length,
      expiredList: expiredArr,
      expired: expiredArr.length,
      negativeSessions: negativeArr,
      noAttendance: noAttendArr,
      upcomingVisits: visitsArr,
      upcomingBirthdays: birthdaysArr,
      attentionLeads: attentionArr,
    };
  }, [clients, currentUser?.id]);

  // Filtered statistics for rep performance view
  const selectedMonth = React.useMemo(() => subMonths(new Date(), selectedMonthOffset), [selectedMonthOffset]);
  const currentMonthStr = format(selectedMonth, 'yyyy-MM');
  // Stable reference: previously a new array every render, which forced the
  // leaderboard + rep comparison memos to recompute on every keystroke.
  const reps = React.useMemo(
    () => users.filter(u => u.role === 'rep' || (u.role as string) === 'sales_rep' || (u.role as string) === 'sales' || u.role === 'manager'),
    [users]
  );

  const handleSaveTarget = React.useCallback(async ({ targetAmount, ptTarget, classesTarget, membershipsTarget }: SalesTargetValues) => {
    if (canViewGlobalDashboard && effectiveRepId !== 'all') {
      await updateUserTarget(effectiveRepId, currentMonthStr, targetAmount, ptTarget, classesTarget, membershipsTarget);
      return;
    }
    const writes: Promise<void>[] = [updateSalesTarget(targetAmount, ptTarget, classesTarget, membershipsTarget)];
    if (canViewGlobalDashboard) {
      writes.push(updateUserTarget('global', currentMonthStr, targetAmount, ptTarget, classesTarget, membershipsTarget));
    }
    await Promise.all(writes);
  }, [canViewGlobalDashboard, effectiveRepId, currentMonthStr, updateUserTarget, updateSalesTarget]);

  
  const filteredSalesData = React.useMemo(() => {
    let targetAmount = 0;
    let ptTarget = 0;
    let classesTarget = 0;
    let membershipsTarget = 0;

    let relevantPayments = payments.filter(p => {
      if (!isValidPayment(p)) return false;
      if (!p.date) return false;
      return safeFormatDate(p.date, 'yyyy-MM') === currentMonthStr;
    });

    if (canViewGlobalDashboard && effectiveRepId !== 'all') {
      // Manager viewing a specific rep
      const repTarget = userTargets.find(t =>
        (t.userId === effectiveRepId || t.sales_rep_id === effectiveRepId) &&
        (t.month === currentMonthStr || t.month_year === currentMonthStr)
      );
      targetAmount = repTarget?.targetAmount ?? 0;
      ptTarget = repTarget?.ptTarget ?? 0;
      classesTarget = repTarget?.classesTarget ?? 0;
      membershipsTarget = repTarget?.membershipsTarget ?? 0;

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
        ptTarget = globalMonthlyTarget.ptTarget ?? 0;
        classesTarget = globalMonthlyTarget.classesTarget ?? 0;
        membershipsTarget = globalMonthlyTarget.membershipsTarget ?? 0;
      } else {
        // Manager viewing all reps — sum every active rep's target for the selected month
        const monthTargets = userTargets.filter(t =>
          (t.month === currentMonthStr || t.month_year === currentMonthStr) && t.userId !== 'global'
        );
        targetAmount = monthTargets.length > 0
          ? monthTargets.reduce((sum, t) => sum + (t.targetAmount || 0), 0)
          : salesTarget.targetAmount;
        ptTarget = monthTargets.length > 0 ? monthTargets.reduce((sum, t) => sum + (t.ptTarget || 0), 0) : (salesTarget.ptTarget || 0);
        classesTarget = monthTargets.length > 0 ? monthTargets.reduce((sum, t) => sum + (t.classesTarget || 0), 0) : (salesTarget.classesTarget || 0);
        membershipsTarget = monthTargets.length > 0 ? monthTargets.reduce((sum, t) => sum + (t.membershipsTarget || 0), 0) : (salesTarget.membershipsTarget || 0);
      }
    } else if (!canViewGlobalDashboard && currentUser) {
      // Rep viewing their own data
      const repTarget = userTargets.find(t =>
        (t.userId === currentUser.id || t.sales_rep_id === currentUser.id) &&
        (t.month === currentMonthStr || t.month_year === currentMonthStr)
      );
      if (repTarget) {
        targetAmount = repTarget.targetAmount;
        ptTarget = repTarget.ptTarget ?? 0;
        classesTarget = repTarget.classesTarget ?? 0;
        membershipsTarget = repTarget.membershipsTarget ?? 0;
      } else if (currentUser.salesTarget) {
        targetAmount = currentUser.salesTarget;
      }
    }

    const currentAmount = relevantPayments.reduce((acc, p) => acc + (getPaymentNet(p)), 0);
    const privatePayments = relevantPayments.filter(p => isPrivatePackage(p.packageType));
    const groupPayments = relevantPayments.filter(p => isGroupPackage(p.packageType));
    const membershipPayments = relevantPayments.filter(p => !isPrivatePackage(p.packageType) && !isGroupPackage(p.packageType));

    const privateSessionsSold = privatePayments.length;
    const groupSessionsSold = groupPayments.length;
    const membershipsSold = membershipPayments.length;
    const privateRevenue = privatePayments.reduce((acc, p) => acc + (getPaymentNet(p)), 0);
    const groupRevenue = groupPayments.reduce((acc, p) => acc + (getPaymentNet(p)), 0);
    const membershipsRevenue = membershipPayments.reduce((acc, p) => acc + (getPaymentNet(p)), 0);
    
    const cash = relevantPayments.filter(p => p.method === 'Cash').reduce((acc, p) => acc + (getPaymentNet(p)), 0);
    const visa = relevantPayments.filter(p => p.method === 'Credit Card').reduce((acc, p) => acc + (getPaymentNet(p)), 0);
    const instapay = relevantPayments.filter(p => p.method === 'Instapay').reduce((acc, p) => acc + (getPaymentNet(p)), 0);

    return {
      targetAmount,
      ptTarget,
      classesTarget,
      membershipsTarget,
      currentAmount,
      privateSessionsSold,
      groupSessionsSold,
      membershipsSold,
      privateRevenue,
      groupRevenue,
      membershipsRevenue,
      cash,
      visa,
      instapay,
      percentage: targetAmount > 0 ? Math.round((currentAmount / targetAmount) * 100) : 0
    };
  }, [payments, effectiveRepId, canViewGlobalDashboard, salesTarget, userTargets, currentMonthStr, clients]);

  const targetDialogInitial = React.useMemo<SalesTargetValues>(() => ({
    targetAmount: filteredSalesData.targetAmount,
    ptTarget: filteredSalesData.ptTarget,
    classesTarget: filteredSalesData.classesTarget,
    membershipsTarget: filteredSalesData.membershipsTarget,
  }), [filteredSalesData.targetAmount, filteredSalesData.ptTarget, filteredSalesData.classesTarget, filteredSalesData.membershipsTarget]);

  // Valid payments in the selected month, computed once and shared by every per-rep calculation
  // (previously each of ~30 reps re-scanned and re-parsed the full payment list).
  const selectedMonthPayments = React.useMemo(
    () => payments.filter(p => isValidPayment(p) && !!p.date && safeFormatDate(p.date, 'yyyy-MM') === currentMonthStr),
    [payments, currentMonthStr]
  );

  // Always use filteredSalesData which has correct month + rep filtering applied
  const totalCash = filteredSalesData.cash;
  const totalVisa = filteredSalesData.visa;
  const totalInstapay = filteredSalesData.instapay;

  const totalPackagesSold = filteredSalesData.privateSessionsSold + filteredSalesData.groupSessionsSold + filteredSalesData.membershipsSold;
  const privatePercentage = totalPackagesSold > 0 ? Math.round((filteredSalesData.privateSessionsSold / totalPackagesSold) * 100) : 0;
  const groupPercentage = totalPackagesSold > 0 ? Math.round((filteredSalesData.groupSessionsSold / totalPackagesSold) * 100) : 0;
  const membershipsPercentage = totalPackagesSold > 0 ? Math.round((filteredSalesData.membershipsSold / totalPackagesSold) * 100) : 0;

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
        if (!isValidPayment(p)) return false;
        const pDate = safeParseISO(p.date);
        if (isNaN(pDate.getTime())) return false;
        if (!isWithinInterval(pDate, { start, end })) return false;

        if (currentUser?.role === 'rep') {
          return isPaymentAttributedToRep(p, currentUser.id, currentUser.name || '');
        }

        return true;
      });

      const achievedAmount = monthPayments.reduce((sum, p) => sum + (getPaymentNet(p)), 0);
      const privateRevenue = monthPayments.filter(p => isPrivatePackage(p.packageType)).reduce((s, p) => s + (getPaymentNet(p)), 0);
      const groupRevenue = monthPayments.filter(p => isGroupPackage(p.packageType)).reduce((s, p) => s + (getPaymentNet(p)), 0);

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
      const mp = payments.filter(p => {
        if (!isValidPayment(p)) return false;
        const d = safeParseISO(p.date);
        if (isNaN(d.getTime())) return false;
        return isWithinInterval(d, { start, end });
      });
      return {
        month: format(date, 'MMM yy'),
        Revenue: mp.reduce((s, p) => s + getPaymentNet(p), 0),
      };
    });
  }, [payments]);

  // Per-rep revenue, target and conversion for the selected month — computed once and shared by
  // the comparison chart and the leaderboard (previously computed twice, each re-scanning all payments).
  const repStats = React.useMemo(() => {
    if (!canViewGlobalDashboard) return [];
    return reps.map(rep => {
      const repName = rep.name || '';
      const repTarget = userTargets.find(t => t.userId === rep.id && t.month === currentMonthStr);
      const targetAmount = repTarget?.targetAmount || 0;

      let revenue = 0;
      for (const p of selectedMonthPayments) {
        if (isPaymentAttributedToRep(p, rep.id, repName)) revenue += getPaymentNet(p);
      }

      let totalLeadsCount = 0;
      let convertedThisMonth = 0;
      for (const c of clients) {
        if (!isClientAssignedToRep(c, rep.id, repName)) continue;
        totalLeadsCount++;
        if (c.status !== 'Lead' && c.startDate && c.startDate.startsWith(currentMonthStr)) convertedThisMonth++;
      }

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
        conversionRate: Math.round(conversionRate * 10) / 10,
      };
    });
  }, [reps, selectedMonthPayments, userTargets, currentMonthStr, clients, canViewGlobalDashboard, isPaymentAttributedToRep, isClientAssignedToRep]);

  // Per-rep revenue vs target for selected month
  const repComparisonData = React.useMemo(
    () => repStats.map(r => ({ name: r.name.split(' ')[0], Revenue: r.revenue, Target: r.targetAmount })),
    [repStats]
  );

  // 6-month payment method breakdown
  const monthlyMethodData = React.useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, i) => subMonths(now, 5 - i));
    return months.map(date => {
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const mp = payments.filter(p => {
        if (!isValidPayment(p)) return false;
        const d = safeParseISO(p.date);
        if (isNaN(d.getTime())) return false;
        return isWithinInterval(d, { start, end });
      });
      return {
        month: format(date, 'MMM yy'),
        Cash: mp.filter(p => p.method === 'Cash').reduce((s, p) => s + (getPaymentNet(p)), 0),
        Visa: mp.filter(p => p.method === 'Credit Card').reduce((s, p) => s + (getPaymentNet(p)), 0),
        Instapay: mp.filter(p => p.method === 'Instapay').reduce((s, p) => s + (getPaymentNet(p)), 0),
      };
    });
  }, [payments]);

  // 6-month session type breakdown
  const monthlySessionData = React.useMemo(() => {
    const months = Array.from({ length: 6 }).map((_, i) => subMonths(now, 5 - i));
    return months.map(date => {
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const mp = payments.filter(p => {
        if (!isValidPayment(p)) return false;
        const d = safeParseISO(p.date);
        if (isNaN(d.getTime())) return false;
        return isWithinInterval(d, { start, end });
      });
      return {
        month: format(date, 'MMM yy'),
        Private: mp.filter(p => isPrivatePackage(p.packageType)).length,
        Group: mp.filter(p => isGroupPackage(p.packageType)).length,
      };
    });
  }, [payments]);

  // Leaderboard Data Calculation — sorting only; the heavy per-rep work lives in repStats.
  const leaderboardData = React.useMemo(() => {
    return [...repStats].sort((a, b) => {
      const aValue = (a as any)[sortConfig.key];
      const bValue = (b as any)[sortConfig.key];
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [repStats, sortConfig]);

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
  const { newMembersCount, returningMembersCount, newMembersList, returningMembersList } = React.useMemo(() => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const newList = clients.filter(c => {
      if (c.status === 'Lead') return false;
      if (!c.startDate) return false;
      const d = safeParseISO(c.startDate);
      if (isNaN(d.getTime())) return false;
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });
    const returningList = clients.filter(c => {
      if (!c.startDate) return false;
      if (c.status !== 'Active' && c.status !== 'Nearly Expired') return false;
      const d = safeParseISO(c.startDate);
      if (isNaN(d.getTime())) return false;
      return d < monthStart;
    });
    return {
      newMembersCount: newList.length,
      returningMembersCount: returningList.length,
      newMembersList: newList,
      returningMembersList: returningList,
    };
  }, [clients, selectedMonth]);

  // Stat-card drill-down: title + member list for the currently opened card.
  const drilldownConfig = React.useMemo(() => {
    switch (statDrilldown) {
      case 'leads': return { title: t('dashboard.active_leads'), items: leadsList };
      case 'expiring': return { title: t('dashboard.expiring_soon'), items: nearlyExpiredList };
      case 'expired': return { title: t('dashboard.total_expired'), items: expiredList };
      case 'birthdays': return { title: t('dashboard.upcoming_birthdays'), items: upcomingBirthdays };
      case 'new': return { title: `${t('dashboard.new_members')} — ${format(selectedMonth, 'MMM yyyy')}`, items: newMembersList };
      case 'returning': return { title: t('dashboard.returning_active'), items: returningMembersList };
      default: return null;
    }
  }, [statDrilldown, t, leadsList, nearlyExpiredList, expiredList, upcomingBirthdays, newMembersList, returningMembersList, selectedMonth]);

  const getDrilldownDetail = (client: any): string => {
    switch (statDrilldown) {
      case 'expiring':
      case 'expired':
        return client.membershipExpiry ? `${t('members.table.expiry_date') || 'Expiry'}: ${safeFormatDate(client.membershipExpiry, 'dd MMM yyyy', 'Unknown')}` : (client.packageType || '');
      case 'birthdays':
        return client.dateOfBirth ? safeFormatDate(client.dateOfBirth, 'dd MMM', 'Unknown') : '';
      case 'new':
      case 'returning':
        return client.startDate ? `${safeFormatDate(client.startDate, 'dd MMM yyyy', 'Unknown')}${client.packageType ? ` · ${client.packageType}` : ''}` : (client.packageType || '');
      default:
        return client.phone || client.packageType || '';
    }
  };

  // Keyboard/touch-friendly props for clickable stat cards.
  const statCardProps = (key: NonNullable<typeof statDrilldown>) => ({
    role: 'button' as const,
    tabIndex: 0,
    className: 'cursor-pointer hover:border-primary/50 active:scale-[0.98] transition-all',
    onClick: () => setStatDrilldown(key),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatDrilldown(key); }
    },
  });

  // Attendance heatmap: check-ins per day-of-week per branch over the last 90 days
  const attendanceHeatmap = React.useMemo(() => {
    const cutoff = subDays(now, 90);
    const recent = attendances.filter(a => {
      if (!a.date) return false;
      const d = safeParseISO(a.date);
      if (isNaN(d.getTime())) return false;
      return d >= cutoff;
    });
    const branchList = selectedBranch === 'all' ? branches : [selectedBranch as string];
    return branchList.map(branch => {
      const counts: number[] = [0, 0, 0, 0, 0, 0, 0];
      recent.filter(a => a.branch === branch).forEach(a => {
        const d = safeParseISO(a.date);
        if (isNaN(d.getTime())) return;
        const dow = getDay(d); // 0 = Sun
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
        <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 p-3 rounded-lg border border-border/50">
          <div>
            <h3 className="text-sm font-medium capitalize">{currentUser?.name || 'Dashboard'}</h3>
            <p className="text-xs text-muted-foreground">{currentUser?.branch || currentUser?.role || 'Staff'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedMonthOffset(o => o + 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-28 text-center">{format(selectedMonth, 'MMM yyyy')}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedMonthOffset(o => Math.max(0, o - 1))} disabled={selectedMonthOffset === 0}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Badge variant="secondary" className="capitalize">{currentUser?.role || 'User'}</Badge>
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
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                {t('dashboard.sales_target')}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleTargetWidget} title={isTargetWidgetCollapsed ? 'Expand widget' : 'Collapse widget'}>
                  {isTargetWidgetCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </CardTitle>
              {!isTargetWidgetCollapsed && canAccessSettings && (
                <CardAction>
                  <SalesTargetDialog initial={targetDialogInitial} onSave={handleSaveTarget} />
                </CardAction>
              )}
            </CardHeader>
            {!isTargetWidgetCollapsed && (
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
                          {filteredSalesData.privateRevenue.toLocaleString()} 
                          {filteredSalesData.ptTarget > 0 && <span className="text-sm font-normal text-muted-foreground"> / {filteredSalesData.ptTarget.toLocaleString()}</span>}
                          <span className="text-xs font-normal"> LE</span>
                        </span>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="font-semibold px-1.5 py-0 h-5 bg-blue-500/10 text-blue-500 border-blue-500/20">
                          {filteredSalesData.privateSessionsSold} {t('dashboard.packages')}
                        </Badge>
                      </div>
                    </div>
                    {filteredSalesData.ptTarget > 0 && (
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mt-1">
                        <div 
                          className="h-full bg-blue-500" 
                          style={{ width: `${Math.min((filteredSalesData.privateRevenue / filteredSalesData.ptTarget) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-muted-foreground block text-[11px] mb-0.5">{t('dashboard.group_packages')}</span>
                        <span className="text-lg font-bold">
                          {filteredSalesData.groupRevenue.toLocaleString()}
                          {filteredSalesData.classesTarget > 0 && <span className="text-sm font-normal text-muted-foreground"> / {filteredSalesData.classesTarget.toLocaleString()}</span>}
                          <span className="text-xs font-normal"> LE</span>
                        </span>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="font-semibold px-1.5 py-0 h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          {filteredSalesData.groupSessionsSold} {t('dashboard.packages')}
                        </Badge>
                      </div>
                    </div>
                    {filteredSalesData.classesTarget > 0 && (
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mt-1">
                        <div 
                          className="h-full bg-emerald-500" 
                          style={{ width: `${Math.min((filteredSalesData.groupRevenue / filteredSalesData.classesTarget) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-muted-foreground block text-[11px] mb-0.5">Memberships</span>
                        <span className="text-lg font-bold">
                          {filteredSalesData.membershipsRevenue.toLocaleString()}
                          {filteredSalesData.membershipsTarget > 0 && <span className="text-sm font-normal text-muted-foreground"> / {filteredSalesData.membershipsTarget.toLocaleString()}</span>}
                          <span className="text-xs font-normal"> LE</span>
                        </span>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="font-semibold px-1.5 py-0 h-5 bg-purple-500/10 text-purple-500 border-purple-500/20">
                          {filteredSalesData.membershipsSold} {t('dashboard.packages')}
                        </Badge>
                      </div>
                    </div>
                    {filteredSalesData.membershipsTarget > 0 && (
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mt-1">
                        <div 
                          className="h-full bg-purple-500" 
                          style={{ width: `${Math.min((filteredSalesData.membershipsRevenue / filteredSalesData.membershipsTarget) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
            )}
          </Card>
        )}
        
        <Card {...statCardProps('leads')}>
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
        
        <Card {...statCardProps('expiring')}>
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

        <Card {...statCardProps('expired')}>
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
        
        <Card {...statCardProps('birthdays')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.upcoming_birthdays')}</CardTitle>
            <Gift className="h-4 w-4 text-pink-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingBirthdays.length}</div>
            <p className="text-xs text-muted-foreground">{t('dashboard.next_7_days')}</p>
          </CardContent>
        </Card>

        <Card {...statCardProps('new')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.new_members')}</CardTitle>
            <UserPlus className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{newMembersCount}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.joined_in')} {format(selectedMonth, 'MMM yyyy')}
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setStatDrilldown('returning'); }}
              onKeyDown={(e) => e.stopPropagation()}
              className="mt-3 pt-3 border-t w-full flex justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{t('dashboard.returning_active')}</span>
              <span className="font-semibold text-foreground">{returningMembersCount}</span>
            </button>
          </CardContent>
        </Card>

        {features?.frozenMembers === true && (
          <Card className="cursor-pointer hover:border-primary/50 transition-all" onClick={() => {
            const el = document.getElementById('frozen-members-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Frozen Members</CardTitle>
              <Snowflake className="h-4 w-4 text-sky-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-sky-600">{frozenCount}</div>
              <p className="text-xs text-muted-foreground">Currently paused packages</p>
            </CardContent>
          </Card>
        )}

        {features?.unconfirmedMemberships === true && (
          <Card className="cursor-pointer hover:border-primary/50 transition-all" onClick={() => {
            setActiveTab('unconfirmed-memberships');
          }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unconfirmed Queue</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{pendingConfirmationCount}</div>
              <p className="text-xs text-muted-foreground">Pending confirmation</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={statDrilldown !== null} onOpenChange={(open) => { if (!open) setStatDrilldown(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span>{drilldownConfig?.title}</span>
              <Badge variant="secondary">{drilldownConfig?.items.length ?? 0}</Badge>
            </DialogTitle>
          </DialogHeader>
          {drilldownConfig && drilldownConfig.items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No members in this list.</p>
          ) : drilldownConfig ? (
            <PaginatedList
              key={statDrilldown ?? 'none'}
              items={drilldownConfig.items}
              itemsPerPage={10}
              renderItem={(client) => (
                <div key={client.id} className="flex items-center justify-between gap-2 p-2 border rounded-md">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        setStatDrilldown(null);
                        setActiveTab('clients');
                        setActiveClientId(client.id);
                      }}
                      className="text-primary hover:underline font-semibold text-sm text-left block truncate"
                    >
                      {client.name}
                    </button>
                    <p className="text-xs text-muted-foreground truncate">{getDrilldownDetail(client)}</p>
                  </div>
                  {client.status && <Badge variant="outline" className="shrink-0 text-[10px]">{client.status}</Badge>}
                </div>
              )}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {canViewGlobalDashboard && (
        <InzanDailyRevenueSummary payments={payments} users={users} />
      )}

      <TodayClassesWidget />

      <RetentionRadarCard
        clients={allClients}
        attendances={attendances}
        payments={allPayments}
        clubName={branding?.companyName || (isInzan ? 'Inzan Athletics' : 'Strike Boxing Club')}
        onSelectMember={(clientId) => {
          setActiveClientId(clientId);
          setActiveTab('clients');
        }}
      />

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
                          <button
                            onClick={() => {
                              setActiveTab('clients');
                              setActiveClientId(client.id);
                            }}
                            className="text-primary hover:underline font-semibold text-sm text-left block"
                          >
                            {client.name}
                          </button>
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
                          <button
                            onClick={() => {
                              setActiveTab('clients');
                              setActiveClientId(client.id);
                            }}
                            className="text-primary hover:underline font-semibold text-sm text-left block"
                          >
                            {client.name}
                          </button>
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
                          <button
                            onClick={() => {
                              setActiveTab('clients');
                              setActiveClientId(client.id);
                            }}
                            className="text-primary hover:underline font-semibold text-sm text-left block"
                          >
                            {client.name}
                          </button>
                          <p className="text-xs text-muted-foreground">{t('members.table.expiry_date') || 'Expired'}: {client.membershipExpiry ? safeFormatDate(client.membershipExpiry, 'dd MMM yyyy', 'Unknown') : 'Unknown'}</p>
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
                          <button
                            onClick={() => {
                              setActiveTab('clients');
                              setActiveClientId(client.id);
                            }}
                            className="text-primary hover:underline font-semibold text-sm text-left block"
                          >
                            {client.name}
                          </button>
                          <p className="text-xs text-muted-foreground">{t('dashboard.expected_visit')}: {safeFormatDate(client.expectedVisitDate, 'dd MMM yyyy', 'Unknown')}</p>
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
                          <button
                            onClick={() => {
                              setActiveTab('clients');
                              setActiveClientId(client.id);
                            }}
                            className="text-primary hover:underline font-semibold text-sm text-left block"
                          >
                            {client.name}
                          </button>
                          <p className="text-xs text-muted-foreground">{t('members.table.expiry_date') || 'Expires'}: {client.membershipExpiry ? safeFormatDate(client.membershipExpiry, 'dd MMM yyyy', 'Unknown') : 'Unknown'}</p>
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
                          <button
                            onClick={() => {
                              setActiveTab('clients');
                              setActiveClientId(client.id);
                            }}
                            className="text-primary hover:underline font-semibold text-sm text-left block"
                          >
                            {client.name}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {t('dashboard.last_comment')}{' '}
                            {(() => {
                              if (!client.comments || client.comments.length === 0) return '—';
                              const latestComment = client.comments.reduce((latest: any, current: any) => {
                                if (!latest || !latest.date) return current;
                                if (!current || !current.date) return latest;
                                const l = safeParseISO(latest.date);
                                const cur = safeParseISO(current.date);
                                if (isNaN(l.getTime())) return current;
                                if (isNaN(cur.getTime())) return latest;
                                return isAfter(cur, l) ? current : latest;
                              }, client.comments[0]);
                              if (!latestComment || !latestComment.date) return '—';
                              const d = safeParseISO(latestComment.date);
                              if (isNaN(d.getTime())) return '—';
                              return differenceInDays(now, d);
                            })()}{' '}
                            {t('dashboard.days_ago')}
                          </p>
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
          <Card className="mt-4 overflow-hidden border border-border shadow-lg bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  <Trophy className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-foreground leading-none">{t('dashboard.leaderboard_title')}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{format(selectedMonth, 'MMMM yyyy')} {language === 'ar' ? 'الإحصائيات' : 'statistics'}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportRepLeaderboardCSV}
                className="hover:bg-muted transition-colors duration-200"
              >
                <Download className="h-4 w-4 mr-2" />
                {t('dashboard.export_csv')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
            <div className="overflow-x-auto -mx-4 md:mx-0 scroll-touch">
                <table className={`w-full border-collapse ${isRtl ? 'text-right' : 'text-left'}`}>
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className={`px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider ${isRtl ? 'text-right' : 'text-left'}`}>{t('dashboard.rank')}</th>
                      <th className={`px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider ${isRtl ? 'text-right' : 'text-left'}`}>
                        <button onClick={() => handleSort('name')} className="flex items-center hover:text-foreground transition-colors">
                          {t('dashboard.rep_name')} <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                      <th className={`px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider ${isRtl ? 'text-right' : 'text-left'}`}>
                        <button onClick={() => handleSort('revenue')} className="flex items-center hover:text-foreground transition-colors">
                          {t('dashboard.revenue')} <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                      <th className={`px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${isRtl ? 'text-right' : 'text-left'}`}>
                        <button onClick={() => handleSort('targetAchievement')} className="flex items-center hover:text-foreground transition-colors">
                          {t('dashboard.target_percent')} <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                      <th className={`px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${isRtl ? 'text-right' : 'text-left'}`}>
                        <button onClick={() => handleSort('converted')} className="flex items-center hover:text-foreground transition-colors">
                          {t('dashboard.converted')} <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                      <th className={`px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${isRtl ? 'text-right' : 'text-left'}`}>
                        <button onClick={() => handleSort('conversionRate')} className="flex items-center hover:text-foreground transition-colors">
                          {t('dashboard.rate_percent')} <ArrowUpDown className="h-3 w-3 ml-1" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground italic">{t('dashboard.no_data_leaderboard')}</td>
                      </tr>
                    ) : (
                      leaderboardData.map((rep, index) => (
                        <tr key={rep.id} className="border-b border-border/60 hover:bg-muted/40 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold text-foreground group-hover:bg-indigo-500/15 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                                {index + 1}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{rep.name}</div>
                              <div className="text-[10px] text-muted-foreground uppercase font-medium">{rep.id?.slice(-6) || 'N/A'}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-foreground">{rep.revenue.toLocaleString()} <span className="text-[10px] text-muted-foreground font-normal">LE</span></div>
                            <div className="text-[10px] text-muted-foreground">{t('dashboard.goal')}: {rep.targetAmount.toLocaleString()}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-[80px] h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-500 ${rep.targetAchievement >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                  style={{ width: `${Math.min(rep.targetAchievement, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-bold ${rep.targetAchievement >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                                {rep.targetAchievement}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                              {rep.converted} <span className={`text-[10px] opacity-70 font-medium ${isRtl ? 'mr-1' : 'ml-1'}`}>{t('dashboard.leads')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-foreground">{rep.conversionRate}%</span>
                              <span className="text-[10px] text-muted-foreground">{rep.converted} {t('dashboard.of')} {rep.totalLeads} {t('dashboard.total')}</span>
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

      {features?.frozenMembers === true && (
        <div id="frozen-members-section" className="mt-8 space-y-4">
          <h3 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-sky-500" />
            Frozen Members List
          </h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-4 font-semibold">Member</th>
                      <th className="p-4 font-semibold">Phone</th>
                      <th className="p-4 font-semibold">Branch</th>
                      <th className="p-4 font-semibold">Package</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frozenMembers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground italic">
                          No currently frozen members.
                        </td>
                      </tr>
                    ) : (
                      frozenMembers.map(member => (
                        <tr key={member.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-4 font-medium">
                            <button
                              onClick={() => {
                                setActiveTab('clients');
                                setActiveClientId(member.id);
                              }}
                              className="text-primary hover:underline font-semibold"
                            >
                              {member.name}
                            </button>
                            <span className="text-xs text-muted-foreground block">ID: {member.memberId || 'N/A'}</span>
                          </td>
                          <td className="p-4">{member.phone}</td>
                          <td className="p-4">{member.branch || 'N/A'}</td>
                          <td className="p-4">{member.packageType || 'N/A'}</td>
                          <td className="p-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUnfreeze(member.id, member.name)}
                              className="border-sky-500/20 text-sky-500 hover:bg-sky-500/10 hover:text-sky-600"
                            >
                              Unfreeze
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
      )}

      {/* ── MULTI-CHANNEL ANNOUNCEMENTS (TWILIO WHATSAPP, SMS, PUSH & IN-APP MODAL) ── */}
      {canSendPushNotifications && (
        <div className="grid grid-cols-1 gap-6">
          <TwilioBroadcastManager compact />
          <Card className="border-primary/15 bg-primary/[0.02] dark:bg-primary/[0.02] rounded-2xl shadow-sm border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center text-sm font-extrabold uppercase tracking-wider text-primary gap-2">
                <Megaphone className="h-5 w-5 text-primary" /> Broadcast Club Announcement
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Multi-channel broadcast: Sends an instant lock-screen push notification to all mobile app devices AND posts an in-app pop-up announcement for all 1,174 members when they open the website or portal.
              </p>
            </CardHeader>
            <CardContent className="pt-2">
              <form onSubmit={handleSendAnnouncement} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Notification Title</Label>
                    <Input 
                      placeholder="e.g. Special Offer 🎉 or Branch Update 📍"
                      className="bg-background text-xs font-medium rounded-xl h-10 border border-input focus:ring-2 focus:ring-primary focus:outline-none"
                      value={pushTitle}
                      onChange={(e) => setPushTitle(e.target.value)}
                      disabled={isSendingPush}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Message Body</Label>
                    <Textarea 
                      placeholder="Type your announcement details here..."
                      className="bg-background text-xs font-medium rounded-xl min-h-[80px] border border-input focus:ring-2 focus:ring-primary focus:outline-none"
                      value={pushBody}
                      onChange={(e) => setPushBody(e.target.value)}
                      disabled={isSendingPush}
                    />
                  </div>
                </div>
                
                <div className="flex justify-end pt-2">
                  <Button 
                    type="submit" 
                    disabled={isSendingPush || !pushTitle.trim() || !pushBody.trim()}
                    className="rounded-xl px-5 h-10 text-xs font-bold gap-2 flex items-center"
                  >
                    {isSendingPush ? 'Sending Notifications...' : 'Send Broadcast'}
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}


