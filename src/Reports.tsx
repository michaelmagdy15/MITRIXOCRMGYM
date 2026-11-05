import React, { useMemo, useEffect, useState } from 'react';
import { downloadFile } from './utils/download';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useAppContext } from './context';
import { useLanguage } from './contexts/LanguageContext';
import {
  format,
  parseISO,
  isSameMonth,
  subMonths,
  subDays,
  differenceInDays,
  isAfter,
} from 'date-fns';
import {
  Download,
  AlertTriangle,
  TrendingUp,
  Users,
  DollarSign,
  RefreshCw,
  Package as PackageIcon,
  PhoneCall,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
  CreditCard,
  Award,
  Layers,
  Sparkles,
  Camera,
  ShieldAlert,
  UserPlus,
  Globe,
  Briefcase,
} from 'lucide-react';
import { db, getTenantId } from './firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { getRevenueScopeForUser, isPaymentInRevenueScope } from './utils/permissions';
import { Badge } from '@/components/ui/badge';
import AdvancedReports, { ReportId } from './AdvancedReports';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  Legend,
} from 'recharts';

const SOURCE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  onClick,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  color: 'red' | 'green' | 'blue' | 'indigo' | 'amber' | 'purple';
  onClick?: () => void;
}) {
  const colors = {
    red: 'bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400',
    green: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400',
    blue: 'bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/25 text-indigo-600 dark:text-indigo-400',
    amber: 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400',
    purple: 'bg-purple-500/10 border-purple-500/25 text-purple-600 dark:text-purple-400',
  };
  return (
    <Card
      onClick={onClick}
      className={`border ${colors[color]} ${onClick ? 'cursor-pointer hover:scale-[1.01] transition-transform' : ''}`}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-75 mb-1">{title}</p>
            <p className="text-2xl font-extrabold">{value}</p>
            <p className="text-xs opacity-70 mt-1">{subtitle}</p>
          </div>
          <div className="p-2 rounded-lg bg-background/60">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CustomTooltipRevenue = ({ active, payload, label }: any) => {
  const { t } = useLanguage();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-xl p-3 shadow-xl text-xs space-y-1">
      <p className="font-bold text-foreground">{label}</p>
      <p className="text-emerald-500 font-bold">
        {t('payments.table.amount') || 'Revenue'}: {Number(payload[0]?.value || 0).toLocaleString()} LE
      </p>
      {payload[0]?.payload?.count != null && (
        <p className="text-muted-foreground">{payload[0].payload.count} transactions</p>
      )}
      {payload[0]?.payload?.conversion != null && (
        <p className="text-muted-foreground">{payload[0].payload.conversion}% {t('reports.conversion_rate')}</p>
      )}
    </div>
  );
};

const CustomTooltipRetention = ({ active, payload, label }: any) => {
  const { t } = useLanguage();
  if (!active || !payload?.length) return null;
  const active_ = payload.find((p: any) => p.dataKey === 'active')?.value ?? 0;
  const churned = payload.find((p: any) => p.dataKey === 'churned')?.value ?? 0;
  const total = active_ + churned;
  const rate = total > 0 ? ((active_ / total) * 100).toFixed(0) : 0;
  return (
    <div className="bg-popover border rounded-xl p-3 shadow-xl text-xs space-y-1">
      <p className="font-bold text-foreground">{label}</p>
      <p className="text-blue-500 font-semibold">{t('reports.still_active')}: {active_}</p>
      <p className="text-rose-500 font-semibold">{t('reports.left')}: {churned}</p>
      <p className="text-muted-foreground font-bold pt-1">{rate}% {t('reports.monthly_retention')}</p>
    </div>
  );
};

const QUICK_REPORT_SHORTCUTS: { id: ReportId; label: string; icon: React.ElementType }[] = [
  { id: 'expired-members', label: 'Expired Members', icon: Users },
  { id: 'package-members', label: 'Package Members', icon: Briefcase },
  { id: 'income-by-service', label: 'Income by Service', icon: DollarSign },
  { id: 'staff-invitations', label: 'Staff Invitations', icon: UserPlus },
  { id: 'not-active-members', label: 'Not Active Members', icon: Activity },
  { id: 'guest-members', label: 'Guest Members', icon: Users },
  { id: 'marketing-report', label: 'Marketing Report', icon: TrendingUp },
  { id: 'package-upgrades', label: 'Package Upgrades', icon: TrendingUp },
  { id: 'trainer-exercise', label: 'Trainer Exercise', icon: Activity },
  { id: 'top-activity', label: 'Top Activity', icon: BarChart3 },
  { id: 'member-attendance', label: 'Member Attendance', icon: Activity },
  { id: 'member-points', label: 'Member Points', icon: Award },
  { id: 'referrals', label: 'Referrals', icon: UserPlus },
  { id: 'national-members', label: 'National Members', icon: Globe },
  { id: 'staff-logs', label: 'Staff Logs', icon: Briefcase },
  { id: 'similarity-mobile', label: 'Phone Similarity', icon: ShieldAlert },
  { id: 'missing-photos', label: 'Missing Photos', icon: Camera },
];

export default function Reports() {
  const {
    clients,
    payments: rawPayments,
    attendances,
    currentUser,
    branches,
    setActiveTab,
    setActiveClientId,
  } = useAppContext();
  const isInzan = getTenantId() === 'inzanathletics';
  const revenueScope = useMemo(() => getRevenueScopeForUser(currentUser), [currentUser]);

  // Top-level Hub Mode: 'visual' (Executive Charts & Graphs) vs 'explorer' (All 18 Deep-Dive Reports)
  const [hubMode, setHubMode] = useState<'visual' | 'explorer'>('visual');
  const [selectedExplorerReport, setSelectedExplorerReport] = useState<ReportId>('expired-members');

  // Interactive Filters for Visual Analytics
  const [periodFilter, setPeriodFilter] = useState<'all' | 'this_month' | '30d' | '90d' | '12m'>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  const safeParseDate = (dateString: any): Date | null => {
    if (!dateString || typeof dateString !== 'string') return null;
    try {
      const parsed = parseISO(dateString);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  };

  const now = new Date();

  const payments = useMemo(() => {
    const scoped = !isInzan || revenueScope === 'all'
      ? rawPayments
      : rawPayments.filter(p => isPaymentInRevenueScope(p, revenueScope));

    return scoped.filter(p => {
      if (p.deleted_at || p.status === 'refunded') return false;
      if (selectedBranch !== 'all' && p.branch !== selectedBranch && (p as any).clientBranch !== selectedBranch) {
        return false;
      }
      if (periodFilter === 'all') return true;
      const d = safeParseDate(p.date);
      if (!d) return false;
      if (periodFilter === 'this_month') return isSameMonth(d, now);
      if (periodFilter === '30d') return isAfter(d, subDays(now, 30));
      if (periodFilter === '90d') return isAfter(d, subDays(now, 90));
      if (periodFilter === '12m') return isAfter(d, subMonths(now, 12));
      return true;
    });
  }, [rawPayments, isInzan, revenueScope, selectedBranch, periodFilter]);

  const filteredClients = useMemo(() => {
    if (selectedBranch === 'all') return clients;
    return clients.filter(c => c.branch === selectedBranch);
  }, [clients, selectedBranch]);

  const [callCenterLogs, setCallCenterLogs] = useState<any[]>([]);
  useEffect(() => {
    if (!isInzan) return;
    const q = query(collection(db, 'callCenterLogs'), orderBy('timestamp', 'desc'), limit(500));
    const unsub = onSnapshot(q, snap => {
      setCallCenterLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => setCallCenterLogs([]));
    return () => unsub();
  }, [isInzan]);

  const { t, language } = useLanguage();

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers
          .map(h => {
            const val = row[h];
            return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
          })
          .join(',')
      ),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `${filename}.csv`);
  };

  const exportToPDF = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const doc = new jsPDF();
    const headers = Object.keys(data[0]);
    const body = data.map(row => headers.map(h => row[h] == null ? '' : String(row[h])));
    autoTable(doc, {
      head: [headers],
      body: body,
    });
    doc.save(`${filename}.pdf`);
  };

  const exportToXLSX = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  };

  const ExportMenu = ({ data, filename, className, variant = 'outline', size = 'sm', children }: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant={variant} size={size} className={className} />}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportToCSV(data, filename)}>Export as CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToPDF(data, filename)}>Export as PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToXLSX(data, filename)}>Export as XLSX</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // --- KPIs ---
  const totalFilteredRevenue = useMemo(
    () => payments.reduce((sum, p) => sum + (Number(p.amount_paid) || Number(p.amount) || 0), 0),
    [payments]
  );

  const revenueThisMonth = useMemo(
    () =>
      rawPayments
        .filter(p => {
          if (p.deleted_at || p.status === 'refunded') return false;
          if (selectedBranch !== 'all' && p.branch !== selectedBranch) return false;
          const parsed = safeParseDate(p.date);
          return parsed ? isSameMonth(parsed, now) : false;
        })
        .reduce((sum, p) => sum + (Number(p.amount_paid) || Number(p.amount) || 0), 0),
    [rawPayments, selectedBranch]
  );

  const activeCount = useMemo(
    () => filteredClients.filter(c => c.status === 'Active').length,
    [filteredClients]
  );

  const conversionRate = useMemo(() => {
    const total = filteredClients.length;
    const converted = filteredClients.filter(c => c.status !== 'Lead').length;
    return total > 0 ? ((converted / total) * 100).toFixed(0) : '0';
  }, [filteredClients]);

  // --- NEW INTERACTIVE CHART 1: 12-Month Revenue & Transactions Trend (AreaChart) ---
  const monthlyRevenueTrend = useMemo(() => {
    const map = new Map<string, { month: string; sortKey: string; revenue: number; count: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(now, i);
      const sortKey = format(d, 'yyyy-MM');
      const month = format(d, 'MMM yy');
      map.set(sortKey, { month, sortKey, revenue: 0, count: 0 });
    }
    for (const p of payments) {
      const parsed = safeParseDate(p.date);
      if (!parsed) continue;
      const sortKey = format(parsed, 'yyyy-MM');
      const month = format(parsed, 'MMM yy');
      const amt = Number(p.amount_paid ?? p.amount) || 0;
      const entry = map.get(sortKey) || { month, sortKey, revenue: 0, count: 0 };
      entry.revenue += amt;
      entry.count += 1;
      map.set(sortKey, entry);
    }
    return Array.from(map.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-12);
  }, [payments]);

  // --- NEW INTERACTIVE CHART 2: Revenue by Service Category (Donut / PieChart) ---
  const serviceCategoryBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; value: number; count: number }>();
    for (const p of payments) {
      const pkg = (p.packageType || '').toLowerCase();
      const cat = String((p as any).package_category_type || '').toLowerCase();
      let service = 'Gym Memberships';
      if (cat === 'pt' || pkg.includes('pt') || pkg.includes('private') || pkg.includes('personal')) {
        service = 'Personal Training (PT)';
      } else if (pkg.includes('sgf') || pkg.includes('small group')) {
        service = 'SGF Group Fitness';
      } else if (pkg.includes('nutrition') || pkg.includes('diet') || pkg.includes('inbody')) {
        service = 'Nutrition & InBody';
      } else if (pkg.includes('class') || pkg.includes('gymnastic') || pkg.includes('mma') || pkg.includes('boxing')) {
        service = 'Classes & Academies';
      } else if (pkg.includes('drop') || pkg.includes('day pass') || pkg.includes('guest')) {
        service = 'Walk-in / Day Pass';
      }
      const amt = Number(p.amount_paid ?? p.amount) || 0;
      const cur = map.get(service) || { name: service, value: 0, count: 0 };
      cur.value += amt;
      cur.count += 1;
      map.set(service, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [payments]);

  // --- NEW INTERACTIVE CHART 3: Payment Methods Breakdown (Donut / PieChart) ---
  const paymentMethodBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; value: number; count: number }>();
    for (const p of payments) {
      const m = p.method || 'Cash';
      const amt = Number(p.amount_paid ?? p.amount) || 0;
      const cur = map.get(m) || { name: m, value: 0, count: 0 };
      cur.value += amt;
      cur.count += 1;
      map.set(m, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [payments]);

  // --- NEW INTERACTIVE CHART 4: Top Sales Representatives Revenue Leaderboard ---
  const topSalesRepsChart = useMemo(() => {
    const map = new Map<string, { rep: string; revenue: number; count: number }>();
    for (const p of payments) {
      const rep = (p.salesName || (p as any).sales_rep_name || 'Unassigned').trim();
      if (!rep || rep === 'Unassigned') continue;
      const amt = Number(p.amount_paid ?? p.amount) || 0;
      const cur = map.get(rep) || { rep, revenue: 0, count: 0 };
      cur.revenue += amt;
      cur.count += 1;
      map.set(rep, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [payments]);

  // --- NEW INTERACTIVE CHART 5: Attendance Volume by Month ---
  const attendanceTrendChart = useMemo(() => {
    const map = new Map<string, { month: string; sortKey: string; checkins: number }>();
    for (const a of attendances) {
      if (!a.date) continue;
      const sortKey = String(a.date).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(sortKey)) continue;
      const parsed = safeParseDate(`${sortKey}-01`);
      const month = parsed ? format(parsed, 'MMM yy') : sortKey;
      const cur = map.get(sortKey) || { month, sortKey, checkins: 0 };
      cur.checkins += 1;
      map.set(sortKey, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-12);
  }, [attendances]);

  // --- Lead Source ROI ---
  const sourceROI = useMemo(() => {
    const getDisplaySource = (c: any) => {
      if (c.source === 'Other' && c.importBatchId) return 'Imported';
      return c.source || 'Walk-in';
    };

    const revenueByClientId = new Map<string, number>();
    for (const p of payments) {
      if (!p.clientId) continue;
      const amt = Number(p.amount_paid) || Number(p.amount) || 0;
      revenueByClientId.set(p.clientId, (revenueByClientId.get(p.clientId) || 0) + amt);
    }

    const bySource = new Map<string, { leads: number; converted: number; revenue: number }>();
    for (const c of filteredClients) {
      const source = getDisplaySource(c);
      if (!source) continue;
      let entry = bySource.get(source);
      if (!entry) {
        entry = { leads: 0, converted: 0, revenue: 0 };
        bySource.set(source, entry);
      }
      entry.leads++;
      if (c.status !== 'Lead') entry.converted++;
      entry.revenue += revenueByClientId.get(c.id) || 0;
    }

    return Array.from(bySource.entries())
      .map(([source, { leads, converted, revenue }]) => ({
        source,
        leads,
        converted,
        conversion: leads > 0 ? +((converted / leads) * 100).toFixed(1) : 0,
        revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [filteredClients, payments]);

  // --- Churn Risk ---
  const churnRisk = useMemo(() => {
    const lastAttendanceDateByClientId = new Map<string, string>();
    for (const a of attendances) {
      if (!a.clientId || !a.date) continue;
      const existing = lastAttendanceDateByClientId.get(a.clientId);
      if (!existing || a.date.localeCompare(existing) > 0) {
        lastAttendanceDateByClientId.set(a.clientId, a.date);
      }
    }

    const result: { id: string; memberId?: string; name: string; lastDate: string | null; daysAgo: number | null }[] = [];
    for (const member of filteredClients) {
      if (member.status !== 'Active') continue;
      const lastDateStr = lastAttendanceDateByClientId.get(member.id);
      const parsed = lastDateStr ? safeParseDate(lastDateStr) : null;
      const daysAgo = parsed ? differenceInDays(now, parsed) : null;
      if (daysAgo === null || daysAgo > 14) {
        result.push({
          id: member.id,
          memberId: member.memberId,
          name: member.name,
          lastDate: parsed ? format(parsed, 'MMM d') : null,
          daysAgo,
        });
      }
    }
    return result.sort((a, b) => (b.daysAgo ?? 9999) - (a.daysAgo ?? 9999));
  }, [filteredClients, attendances]);

  // --- Cohort Retention ---
  const cohortRetention = useMemo(() => {
    const cohorts: Record<string, { active: number; churned: number; sortKey: string }> = {};
    filteredClients.forEach(c => {
      const parsed = safeParseDate(c.startDate);
      if (!parsed) return;
      const month = format(parsed, 'MMM yy');
      const sortKey = format(parsed, 'yyyy-MM');
      if (!cohorts[month]) cohorts[month] = { active: 0, churned: 0, sortKey };
      if (c.status === 'Active' || c.status === 'Nearly Expired') {
        cohorts[month].active++;
      } else if (c.status === 'Expired') {
        cohorts[month].churned++;
      }
    });
    return Object.entries(cohorts)
      .map(([month, s]) => ({ month, active: s.active, churned: s.churned, sortKey: s.sortKey }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-8);
  }, [filteredClients]);

  // --- Revenue Forecast ---
  const revenueForecast = useMemo(() => {
    const lastPaymentByClientId = new Map<string, { date: string; amount: number }>();
    for (const p of payments) {
      if (!p.clientId) continue;
      const pDate = p.date || '';
      const amt = Number(p.amount_paid) || Number(p.amount) || 0;
      const existing = lastPaymentByClientId.get(p.clientId);
      if (!existing || pDate.localeCompare(existing.date) > 0) {
        lastPaymentByClientId.set(p.clientId, { date: pDate, amount: amt });
      }
    }

    const expiringThisMonth = filteredClients.filter(c => {
      if (c.status !== 'Active') return false;
      const parsed = safeParseDate(c.membershipExpiry);
      return parsed ? isSameMonth(parsed, now) : false;
    });
    const sumValue = expiringThisMonth.reduce((sum, c) => {
      const last = lastPaymentByClientId.get(c.id);
      return sum + (last?.amount || 0);
    }, 0);
    const last3 = [subMonths(now, 1), subMonths(now, 2), subMonths(now, 3)];
    const rates = last3
      .map(m => {
        const expired = filteredClients.filter(c => {
          const parsed = safeParseDate(c.membershipExpiry);
          return parsed ? isSameMonth(parsed, m) : false;
        });
        if (!expired.length) return null;
        const renewed = expired.filter(c => c.status === 'Active' || c.status === 'Nearly Expired').length;
        return renewed / expired.length;
      })
      .filter(r => r !== null) as number[];
    const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0.7;
    return { expiringCount: expiringThisMonth.length, sumValue, renewalRate: avgRate, forecast: sumValue * avgRate };
  }, [filteredClients, payments]);

  // --- Packages Sold Breakdown ---
  const packagesSoldBreakdown = useMemo(() => {
    const map = new Map<string, { packageName: string; count: number; revenue: number }>();
    for (const p of payments) {
      const pkgName = (p.packageType || 'Unspecified Package').trim();
      const amt = Number(p.amount_paid ?? p.amount) || 0;
      const existing = map.get(pkgName) || { packageName: pkgName, count: 0, revenue: 0 };
      existing.count += 1;
      existing.revenue += amt;
      map.set(pkgName, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  }, [payments]);

  // --- Sales Team Calls Report ---
  const salesTeamCallsReport = useMemo(() => {
    const map = new Map<string, { repName: string; totalCalls: number; answered: number; followUp: number }>();
    for (const log of callCenterLogs) {
      const repName = log.staffName || log.callerName || log.recordedByName || 'Sales Team';
      const cur = map.get(repName) || { repName, totalCalls: 0, answered: 0, followUp: 0 };
      cur.totalCalls += 1;
      const outcome = String(log.outcome || log.disposition || log.status || '').toLowerCase();
      if (outcome.includes('answer') || outcome.includes('interested') || outcome.includes('booked') || outcome.includes('converted')) {
        cur.answered += 1;
      } else {
        cur.followUp += 1;
      }
      map.set(repName, cur);
    }
    for (const c of filteredClients) {
      const comments = Array.isArray(c.comments) ? c.comments : [];
      for (const cm of comments) {
        const txt = String(cm.text || '').toLowerCase();
        if (txt.includes('call') || txt.includes('phone') || txt.includes('spoke') || txt.includes('contacted')) {
          const repName = cm.author || 'Sales Team';
          const cur = map.get(repName) || { repName, totalCalls: 0, answered: 0, followUp: 0 };
          cur.totalCalls += 1;
          cur.answered += 1;
          map.set(repName, cur);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCalls - a.totalCalls);
  }, [callCenterLogs, filteredClients]);

  // --- Member Attendance Frequency Report ---
  const memberAttendanceFrequency = useMemo(() => {
    const countsByClient = new Map<string, { count: number; lastDate: string }>();
    for (const a of attendances) {
      if (!a.clientId) continue;
      const cur = countsByClient.get(a.clientId) || { count: 0, lastDate: '' };
      cur.count += 1;
      if (a.date && a.date > cur.lastDate) cur.lastDate = a.date;
      countsByClient.set(a.clientId, cur);
    }
    const rows: { id: string; memberId: string; name: string; packageType: string; visits: number; lastVisit: string }[] = [];
    for (const c of filteredClients) {
      const stat = countsByClient.get(c.id);
      const visits = stat?.count || Number((c as any).totalCheckins || 0);
      if (visits > 0) {
        rows.push({
          id: c.id,
          memberId: c.memberId || '—',
          name: c.name,
          packageType: c.packageType || '—',
          visits,
          lastVisit: stat?.lastDate ? stat.lastDate.slice(0, 10) : '—',
        });
      }
    }
    return rows.sort((a, b) => b.visits - a.visits).slice(0, 50);
  }, [filteredClients, attendances]);

  const sourceCSV = sourceROI.map(r => ({
    Source: r.source,
    'Total Leads': r.leads,
    Converted: r.converted,
    'Conversion %': r.conversion + '%',
    'Revenue (LE)': r.revenue,
  }));
  const churnCSV = churnRisk.map(r => ({
    Name: r.name,
    'Member ID': r.memberId || '—',
    'Last Visit': r.lastDate ?? 'Never',
    'Days Since Visit': r.daysAgo ?? 'N/A',
  }));
  const cohortCSV = cohortRetention.map(r => ({
    Month: r.month,
    'Still Active': r.active,
    Left: r.churned,
    'Retention %': r.active + r.churned > 0 ? (((r.active / (r.active + r.churned)) * 100).toFixed(1) + '%') : '0%',
  }));

  const openMemberProfile = (clientId: string) => {
    setActiveClientId(clientId);
    setActiveTab('clients');
  };

  const jumpToReport = (reportId: ReportId) => {
    setSelectedExplorerReport(reportId);
    setHubMode('explorer');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Unified Reports Hub Header & Mode Switcher */}
      <div className="rounded-3xl border border-border/60 bg-card/70 p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">
                  Reports &amp; Visual Intelligence Hub
                </h2>
                <p className="text-muted-foreground text-xs sm:text-sm">
                  Unified Executive Visual Charts &amp; 18 Granular Operational, Financial &amp; Member Reports
                </p>
              </div>
            </div>
          </div>

          {/* Primary Hub Mode Toggle */}
          <div className="flex items-center gap-1.5 rounded-2xl bg-muted/60 p-1.5 border border-border/60">
            <button
              type="button"
              onClick={() => setHubMode('visual')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                hubMode === 'visual'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <PieChartIcon className="h-4 w-4" />
              Interactive Charts &amp; Visuals
            </button>
            <button
              type="button"
              onClick={() => setHubMode('explorer')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                hubMode === 'explorer'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="h-4 w-4" />
              All 18 Detailed Reports Explorer
            </button>
          </div>
        </div>

        {/* 1-Click Quick-Jump Pills to Any of the 18 Detailed Reports */}
        <div className="pt-2 border-t border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Quick Jump to Specialized Report:
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REPORT_SHORTCUTS.map((item) => {
              const Icon = item.icon;
              const isSelected = hubMode === 'explorer' && selectedExplorerReport === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => jumpToReport(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background/60 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {hubMode === 'explorer' ? (
        <AdvancedReports initialReport={selectedExplorerReport} embedded />
      ) : (
        <>
          {/* Interactive Period & Branch Filter Bar for Visual Charts */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-2">
                Time Range:
              </span>
              {(
                [
                  { id: 'all', label: 'All Time' },
                  { id: 'this_month', label: 'This Month' },
                  { id: '30d', label: 'Last 30 Days' },
                  { id: '90d', label: 'Last 90 Days' },
                  { id: '12m', label: 'Last 12 Months' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodFilter(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    periodFilter === p.id
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-background/70 text-muted-foreground border-border/60 hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Branch:
              </span>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="h-9 rounded-xl border border-border/60 bg-background px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Branches</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 6 Interactive Executive KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <KPICard
              title={periodFilter === 'all' ? 'Total Revenue' : 'Filtered Revenue'}
              value={totalFilteredRevenue.toLocaleString() + ' LE'}
              subtitle={`${payments.length.toLocaleString()} transactions`}
              icon={DollarSign}
              color="green"
              onClick={() => jumpToReport('income-by-service')}
            />
            <KPICard
              title={t('reports.revenue_this_month')}
              value={revenueThisMonth.toLocaleString() + ' LE'}
              subtitle={format(now, 'MMMM yyyy')}
              icon={CreditCard}
              color="indigo"
              onClick={() => jumpToReport('income-by-service')}
            />
            <KPICard
              title={t('reports.active_members')}
              value={activeCount.toLocaleString()}
              subtitle="Click to view active packages"
              icon={Users}
              color="blue"
              onClick={() => jumpToReport('package-members')}
            />
            <KPICard
              title={t('reports.members_at_risk')}
              value={churnRisk.length.toLocaleString()}
              subtitle={t('reports.no_visit_14d')}
              icon={AlertTriangle}
              color="red"
              onClick={() => jumpToReport('not-active-members')}
            />
            <KPICard
              title={t('reports.conversion_rate')}
              value={conversionRate + '%'}
              subtitle={t('reports.leads_to_members')}
              icon={TrendingUp}
              color="purple"
              onClick={() => jumpToReport('marketing-report')}
            />
            <KPICard
              title="Total Check-Ins"
              value={attendances.length.toLocaleString()}
              subtitle="Click for attendance report"
              icon={Activity}
              color="amber"
              onClick={() => jumpToReport('member-attendance')}
            />
          </div>

          {/* ROW 1: 12-Month Revenue Trend AreaChart + Service Category Donut Chart */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    Monthly Revenue &amp; Cashflow Trend
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    12-month revenue trajectory and transaction volume
                  </p>
                </div>
                <ExportMenu data={monthlyRevenueTrend} filename="monthly_revenue_trend">
                  <Download className="h-4 w-4 mr-1" /> {t('reports.export')}
                </ExportMenu>
              </CardHeader>
              <CardContent>
                {monthlyRevenueTrend.every(m => m.revenue === 0) ? (
                  <p className="text-center text-muted-foreground py-12">No revenue recorded for selected filter.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={monthlyRevenueTrend} margin={{ left: 10, right: 16, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                      />
                      <Tooltip content={<CustomTooltipRevenue />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#revGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Revenue by Service Category Donut */}
            <Card className="shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <PieChartIcon className="h-5 w-5 text-blue-500" />
                    Revenue by Service Stream
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Memberships vs PT vs Classes vs SGF
                  </p>
                </div>
                <ExportMenu data={serviceCategoryBreakdown} filename="revenue_by_service">
                  <Download className="h-4 w-4" />
                </ExportMenu>
              </CardHeader>
              <CardContent>
                {serviceCategoryBreakdown.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">No service data yet.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={serviceCategoryBreakdown}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                        >
                          {serviceCategoryBreakdown.map((_, idx) => (
                            <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any) => `${Number(val || 0).toLocaleString()} LE`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-2 pt-2 border-t border-border/50 max-h-[130px] overflow-y-auto pr-1">
                      {serviceCategoryBreakdown.map((item, idx) => (
                        <div key={item.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }}
                            />
                            <span className="truncate font-medium">{item.name}</span>
                          </div>
                          <span className="font-mono font-bold text-foreground shrink-0 ml-2">
                            {item.value.toLocaleString()} LE
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ROW 2: Payment Methods Donut + Top Sales Representatives Leaderboard */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CreditCard className="h-5 w-5 text-purple-500" />
                    Payment Methods Mix
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cash vs Visa/Card vs InstaPay vs Bank Transfer
                  </p>
                </div>
                <ExportMenu data={paymentMethodBreakdown} filename="payment_methods_mix">
                  <Download className="h-4 w-4" />
                </ExportMenu>
              </CardHeader>
              <CardContent>
                {paymentMethodBreakdown.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">No payments recorded.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={paymentMethodBreakdown}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={78}
                          paddingAngle={3}
                        >
                          {paymentMethodBreakdown.map((_, idx) => (
                            <Cell key={idx} fill={SOURCE_COLORS[(idx + 2) % SOURCE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val: any) => `${Number(val || 0).toLocaleString()} LE`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-2 pt-2 border-t border-border/50">
                      {paymentMethodBreakdown.map((item, idx) => (
                        <div key={item.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: SOURCE_COLORS[(idx + 2) % SOURCE_COLORS.length] }}
                            />
                            <span className="font-medium">{item.name}</span>
                            <span className="text-[10px] text-muted-foreground">({item.count})</span>
                          </div>
                          <span className="font-mono font-bold">
                            {item.value.toLocaleString()} LE
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Top Sales Representatives Revenue BarChart */}
            <Card className="lg:col-span-2 shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Award className="h-5 w-5 text-amber-500" />
                    Sales Team Revenue Leaderboard
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Top performing sales representatives by collected revenue
                  </p>
                </div>
                <ExportMenu data={topSalesRepsChart} filename="sales_leaderboard">
                  <Download className="h-4 w-4 mr-1" /> {t('reports.export')}
                </ExportMenu>
              </CardHeader>
              <CardContent>
                {topSalesRepsChart.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">No sales rep attribution data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(220, topSalesRepsChart.length * 36)}>
                    <BarChart
                      data={topSalesRepsChart}
                      layout="vertical"
                      margin={{ left: 12, right: 80, top: 4, bottom: 4 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="rep" width={130} tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltipRevenue />} />
                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={24}>
                        {topSalesRepsChart.map((_, i) => (
                          <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                        ))}
                        <LabelList
                          dataKey="revenue"
                          position="right"
                          formatter={(v: any) => (typeof v === 'number' ? `${v.toLocaleString()} LE` : String(v))}
                          style={{ fontSize: 11, fill: '#9ca3af', fontWeight: 700 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ROW 3: Club Check-In Attendance Trend + Lead Source ROI */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Monthly Attendance Check-In Trend */}
            <Card className="shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-amber-500" />
                    Club Attendance &amp; Check-In Volume
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Monthly member check-in activity across the gym
                  </p>
                </div>
                <ExportMenu data={attendanceTrendChart} filename="monthly_attendance_trend">
                  <Download className="h-4 w-4 mr-1" /> {t('reports.export')}
                </ExportMenu>
              </CardHeader>
              <CardContent>
                {attendanceTrendChart.length === 0 ? (
                  <p className="text-center text-muted-foreground py-10">No attendance history yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={attendanceTrendChart} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="checkins" name="Check-Ins" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Lead Source Chart */}
            <Card className="shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    {t('reports.where_members_come_from')}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('reports.revenue_per_source')}</p>
                </div>
                <ExportMenu data={sourceCSV} filename="lead_sources">
                  <Download className="h-4 w-4 mr-1" /> {t('reports.export')}
                </ExportMenu>
              </CardHeader>
              <CardContent>
                {sourceROI.length === 0 ? (
                  <p className="text-center text-muted-foreground py-10">{t('reports.no_data_yet') || 'No data yet.'}</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={Math.max(170, sourceROI.length * 36)}>
                      <BarChart data={sourceROI} layout="vertical" margin={{ left: 8, right: 70, top: 4, bottom: 4 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="source" width={95} tick={{ fontSize: 11 }} />
                        <Tooltip content={<CustomTooltipRevenue />} />
                        <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={24}>
                          {sourceROI.map((_, i) => (
                            <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                          ))}
                          <LabelList
                            dataKey="revenue"
                            position="right"
                            formatter={(v: any) => (typeof v === 'number' ? v.toLocaleString() + ' LE' : String(v))}
                            style={{ fontSize: 11, fill: '#9ca3af' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                      {sourceROI.map((r, i) => (
                        <div key={r.source} className="flex items-center gap-1 text-xs">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                          />
                          <span className="text-muted-foreground">{r.source}:</span>
                          <span className="font-semibold">
                            {r.conversion}% {language === 'ar' ? 'تحويل' : 'conv.'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ROW 4: Cohort Retention + Renewal Forecast + Churn Risk */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Retention Chart */}
            <Card className="shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-blue-500" />
                    {t('reports.monthly_retention')}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('reports.retention_desc')}</p>
                </div>
                <ExportMenu data={cohortCSV} filename="retention">
                  <Download className="h-4 w-4 mr-1" /> {t('reports.export')}
                </ExportMenu>
              </CardHeader>
              <CardContent>
                {cohortRetention.length === 0 ? (
                  <p className="text-center text-muted-foreground py-10">{t('reports.no_data_yet') || 'No data yet.'}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={cohortRetention} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltipRetention />} />
                      <Legend
                        formatter={(value) => (value === 'active' ? t('reports.still_active') : t('reports.left'))}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="active" name="active" stackId="a" fill="#3b82f6" />
                      <Bar dataKey="churned" name="churned" stackId="a" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Revenue Forecast */}
            <Card className="shadow-sm border-indigo-500/25 bg-indigo-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg text-indigo-600 dark:text-indigo-400">
                    <RefreshCw className="h-5 w-5" />
                    {t('reports.renewal_forecast')}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('reports.expiring_desc')}</p>
                </div>
                <Badge variant="outline" className="border-indigo-400 text-indigo-600 dark:text-indigo-400 text-xs">
                  {format(now, 'MMMM yyyy')}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background rounded-xl border p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                      {t('reports.expiring_this_month')}
                    </p>
                    <p className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {revenueForecast.expiringCount}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t('reports.members')}</p>
                  </div>
                  <div className="bg-background rounded-xl border p-4 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                      {t('reports.total_value')}
                    </p>
                    <p className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {revenueForecast.sumValue.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t('reports.if_all_renew')}</p>
                  </div>
                </div>

                <div className="relative p-5 bg-indigo-600 rounded-2xl overflow-hidden shadow-lg">
                  <div className="absolute inset-0 opacity-5">
                    <DollarSign className="h-40 w-40 text-white absolute -right-4 -top-4" />
                  </div>
                  <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wider mb-1">
                    {t('reports.expected_renewal_rev')}
                  </p>
                  <p className="text-4xl font-extrabold text-white">
                    {Math.round(revenueForecast.forecast).toLocaleString()}{' '}
                    <span className="text-lg font-normal opacity-70">LE</span>
                  </p>
                  <p className="text-indigo-200 text-xs mt-2">
                    {t('reports.based_on')}{' '}
                    <span className="font-bold text-white">
                      {(revenueForecast.renewalRate * 100).toFixed(0)}% {t('reports.avg_renewal_rate')}
                    </span>{' '}
                    {t('reports.over_last_3_months')}
                  </p>
                </div>

                <ExportMenu
                  data={[
                    {
                      Month: format(now, 'yyyy-MM'),
                      'Expiring Members': revenueForecast.expiringCount,
                      'Total Potential (LE)': revenueForecast.sumValue,
                      'Avg Renewal Rate': (revenueForecast.renewalRate * 100).toFixed(1) + '%',
                      'Expected Revenue (LE)': Math.round(revenueForecast.forecast),
                    },
                  ]}
                  filename={`renewal_forecast_${format(now, 'yyyy_MM')}`}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  variant="default"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('reports.download_forecast')}
                </ExportMenu>
              </CardContent>
            </Card>

            {/* Churn Risk (Clickable Members) */}
            <Card className="shadow-sm border-red-500/25">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-5 w-5" />
                    {t('reports.members_at_risk')}
                    <Badge variant="destructive" className="ml-1">{churnRisk.length}</Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('reports.call_them')}</p>
                </div>
                <ExportMenu data={churnCSV} filename="members_at_risk">
                  <Download className="h-4 w-4 mr-1" /> {t('reports.export')}
                </ExportMenu>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                  {churnRisk.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="text-3xl mb-2">🎉</div>
                      <p className="text-muted-foreground text-sm">{t('reports.attending_regularly')}</p>
                    </div>
                  ) : (
                    churnRisk.slice(0, 80).map(m => {
                      const severity = m.daysAgo === null ? 'never' : m.daysAgo > 30 ? 'high' : 'medium';
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => openMemberProfile(m.id)}
                          className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/60 transition-colors text-left cursor-pointer"
                        >
                          <div>
                            <p className="font-semibold text-sm text-primary hover:underline">
                              {m.name} {m.memberId ? <span className="text-xs font-mono text-muted-foreground">#{m.memberId}</span> : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {m.lastDate ? `${t('reports.last_visit')}: ${m.lastDate}` : t('reports.never_visited')}
                            </p>
                          </div>
                          <Badge
                            className={
                              severity === 'never' || severity === 'high'
                                ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            }
                            variant="outline"
                          >
                            {m.daysAgo !== null ? `${m.daysAgo}${t('reports.days_ago') || 'd ago'}` : t('reports.never')}
                          </Badge>
                        </button>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Packages Sold Breakdown */}
            <Card className="shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PackageIcon className="h-4 w-4 text-emerald-500" />
                    Packages Sold Breakdown
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Units sold and revenue per package tier ({revenueScope === 'all' ? 'All Revenue' : revenueScope})
                  </p>
                </div>
                <ExportMenu data={packagesSoldBreakdown} filename="packages_sold_breakdown">
                  <Download className="h-3.5 w-3.5 mr-1" /> Export
                </ExportMenu>
              </CardHeader>
              <CardContent>
                <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                  {packagesSoldBreakdown.length === 0 ? (
                    <p className="text-center text-muted-foreground text-xs py-8">No package sales recorded yet.</p>
                  ) : (
                    packagesSoldBreakdown.map((pkg) => (
                      <div key={pkg.packageName} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 text-xs">
                        <div>
                          <p className="font-bold text-foreground">{pkg.packageName}</p>
                          <p className="text-[11px] text-muted-foreground">{pkg.count} sold</p>
                        </div>
                        <Badge variant="outline" className="font-mono font-bold text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                          {pkg.revenue.toLocaleString()} LE
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Sales Team Calls Report */}
            <Card className="shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PhoneCall className="h-4 w-4 text-blue-500" />
                    Sales Team Calls Report
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Logged outbound &amp; follow-up calls per sales representative
                  </p>
                </div>
                <ExportMenu data={salesTeamCallsReport} filename="sales_team_calls_report">
                  <Download className="h-3.5 w-3.5 mr-1" /> Export
                </ExportMenu>
              </CardHeader>
              <CardContent>
                <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                  {salesTeamCallsReport.length === 0 ? (
                    <p className="text-center text-muted-foreground text-xs py-8">No sales calls logged yet.</p>
                  ) : (
                    salesTeamCallsReport.map((rep) => (
                      <div key={rep.repName} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 text-xs">
                        <div>
                          <p className="font-bold text-foreground">{rep.repName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Answered/Positive: {rep.answered} • Follow-up: {rep.followUp}
                          </p>
                        </div>
                        <Badge className="bg-blue-600 text-white font-bold">
                          {rep.totalCalls} Calls
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Member Attendance Frequency (Clickable Members) */}
            <Card className="shadow-sm border-primary/15">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4 text-amber-500" />
                    Top Member Attendance Frequency
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Most active members by check-in count (click member to open profile)
                  </p>
                </div>
                <ExportMenu data={memberAttendanceFrequency} filename="member_attendance_frequency">
                  <Download className="h-3.5 w-3.5 mr-1" /> Export
                </ExportMenu>
              </CardHeader>
              <CardContent>
                <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1">
                  {memberAttendanceFrequency.length === 0 ? (
                    <p className="text-center text-muted-foreground text-xs py-8">No attendance records found.</p>
                  ) : (
                    memberAttendanceFrequency.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => openMemberProfile(m.id)}
                        className="w-full flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/50 transition-colors text-xs text-left cursor-pointer"
                      >
                        <div>
                          <p className="font-bold text-primary hover:underline">
                            {m.name} <span className="text-muted-foreground font-mono">#{m.memberId}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {m.packageType} • Last: {m.lastVisit}
                          </p>
                        </div>
                        <Badge variant="outline" className="font-bold border-amber-500/40 text-amber-600 dark:text-amber-400">
                          {m.visits} Visits
                        </Badge>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
