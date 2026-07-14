import React, { useMemo, useState } from 'react';
import { downloadFile } from './utils/download';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from './context';
import { useLanguage } from './contexts/LanguageContext';
import { useSettings } from './contexts/SettingsContext';
import { format, parseISO, isAfter, isBefore, differenceInDays, subDays } from 'date-fns';
import { Download, Star, Users, DollarSign, TrendingUp, UserPlus, Activity, Award, Globe, Briefcase, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

type ReportId =
  | 'expired-members'
  | 'package-members'
  | 'income-by-service'
  | 'staff-invitations'
  | 'not-active-members'
  | 'guest-members'
  | 'marketing-report'
  | 'marketing-by-package'
  | 'package-upgrades'
  | 'trainer-exercise'
  | 'top-activity'
  | 'member-attendance'
  | 'member-points'
  | 'referrals'
  | 'national-members'
  | 'staff-logs';

interface ReportTab {
  id: ReportId;
  label: string;
  icon: React.ElementType;
}

export default function AdvancedReports() {
  const { clients, payments, ptPackageRecords, attendances, auditLogs, users, coaches, branches } = useAppContext();
  const { branding } = useSettings();

  const [activeReport, setActiveReport] = useState<ReportId>('expired-members');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');

  const safeParseDate = (d: any): Date | null => {
    if (!d) return null;
    try {
      const p = parseISO(d);
      return isNaN(p.getTime()) ? null : p;
    } catch {
      return null;
    }
  };

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

  const reportTabs: ReportTab[] = [
    { id: 'expired-members', label: 'Expired Members', icon: Users },
    { id: 'package-members', label: 'Package Members', icon: Briefcase },
    { id: 'income-by-service', label: 'Income by Service', icon: DollarSign },
    { id: 'staff-invitations', label: 'Staff Invitations', icon: UserPlus },
    { id: 'not-active-members', label: 'Not Active Members', icon: Activity },
    { id: 'guest-members', label: 'Guest Members', icon: Users },
    { id: 'marketing-report', label: 'Marketing Report', icon: TrendingUp },
    { id: 'marketing-by-package', label: 'Marketing by Package', icon: BarChart3 },
    { id: 'package-upgrades', label: 'Package Upgrades', icon: TrendingUp },
    { id: 'trainer-exercise', label: 'Trainer Exercise', icon: Activity },
    { id: 'top-activity', label: 'Top Activity', icon: BarChart3 },
    { id: 'member-attendance', label: 'Member Attendance', icon: Activity },
    { id: 'member-points', label: 'Member Points', icon: Award },
    { id: 'referrals', label: 'Referrals', icon: UserPlus },
    { id: 'national-members', label: 'National Members', icon: Globe },
    { id: 'staff-logs', label: 'Staff Logs', icon: Briefcase },
  ];

  // --- Unique branch list ---
  const branchList = useMemo(() => {
    const set = new Set<string>();
    (clients || []).forEach(c => { if (c.branch) set.add(c.branch); });
    (payments || []).forEach(p => { if (p.branch) set.add(p.branch); });
    return Array.from(set).sort();
  }, [clients, payments]);

  // --- Unique staff list ---
  const staffList = useMemo(() => {
    const set = new Set<string>();
    (clients || []).forEach(c => { if (c.salesName) set.add(c.salesName); });
    (payments || []).forEach(p => { if (p.salesName) set.add(p.salesName); });
    return Array.from(set).sort();
  }, [clients, payments]);

  // --- Users map (id -> name) ---
  const usersMap = useMemo(() => {
    const map: Record<string, string> = {};
    (users || []).forEach(u => {
      if (u.id && u.name) map[u.id] = u.name;
    });
    return map;
  }, [users]);

  // --- Client map (id -> client) ---
  const clientsMap = useMemo(() => {
    const map: Record<string, any> = {};
    (clients || []).forEach(c => {
      if (c.id) map[c.id] = c;
    });
    return map;
  }, [clients]);

  // --- Helper: date within range ---
  const isInDateRange = (dateStr: any): boolean => {
    const parsed = safeParseDate(dateStr);
    if (!parsed) return true; // include if no date
    if (dateFrom) {
      const from = safeParseDate(dateFrom);
      if (from && isBefore(parsed, from)) return false;
    }
    if (dateTo) {
      const to = safeParseDate(dateTo);
      if (to && isAfter(parsed, to)) return false;
    }
    return true;
  };

  // --- Helper: branch match ---
  const matchBranch = (b: string | undefined): boolean => {
    if (branchFilter === 'all') return true;
    return (b || '') === branchFilter;
  };

  // --- Helper: staff match ---
  const matchStaff = (s: string | undefined): boolean => {
    if (staffFilter === 'all') return true;
    return (s || '') === staffFilter;
  };

  // ============================================================
  // 1. Expired Members
  // ============================================================
  const expiredMembersData = useMemo(() => {
    return (clients || []).filter(c => {
      if (c.status !== 'Expired') return false;
      if (!isInDateRange(c.membershipExpiry)) return false;
      if (!matchBranch(c.branch)) return false;
      if (!matchStaff(c.salesName)) return false;
      return true;
    });
  }, [clients, dateFrom, dateTo, branchFilter, staffFilter]);

  const expiredChartData = useMemo(() => {
    const map: Record<string, number> = {};
    expiredMembersData.forEach(c => {
      const d = safeParseDate(c.membershipExpiry);
      const key = d ? format(d, 'yyyy-MM') : 'Unknown';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  }, [expiredMembersData]);

  // ============================================================
  // 2. Package Members
  // ============================================================
  const packageMembersData = useMemo(() => {
    return (clients || []).filter(c => {
      if (c.status !== 'Active') return false;
      if (!matchBranch(c.branch)) return false;
      return true;
    });
  }, [clients, branchFilter]);

  const packageChartData = useMemo(() => {
    const map: Record<string, number> = {};
    packageMembersData.forEach(c => {
      const pkg = c.packageType || 'Unknown';
      map[pkg] = (map[pkg] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));
  }, [packageMembersData]);

  // ============================================================
  // 3. Income by Service Category
  // ============================================================
  const incomeByServiceData = useMemo(() => {
    const validPayments = (payments || []).filter(p => !p.deleted_at);
    const filtered = validPayments.filter(p => {
      if (!isInDateRange(p.date || p.created_at)) return false;
      if (!matchBranch(p.branch)) return false;
      return true;
    });
    const map: Record<string, number> = {};
    filtered.forEach(p => {
      const cat = p.package_category_type || 'Other';
      map[cat] = (map[cat] || 0) + (Number(p.amount_paid) || Number(p.amount) || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [payments, dateFrom, dateTo, branchFilter]);

  // ============================================================
  // 4. Staff Invitations
  // ============================================================
  const staffInvitationsData = useMemo(() => {
    const filtered = (clients || []).filter(c => {
      if (!matchBranch(c.branch)) return false;
      return true;
    });
    const map: Record<string, { total: number; active: number; expired: number }> = {};
    filtered.forEach(c => {
      const rep = c.salesName || 'Unassigned';
      if (!map[rep]) map[rep] = { total: 0, active: 0, expired: 0 };
      map[rep].total++;
      if (c.status === 'Active') map[rep].active++;
      if (c.status === 'Expired') map[rep].expired++;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([salesRep, data]) => ({ salesRep, ...data }));
  }, [clients, branchFilter]);

  // ============================================================
  // 5. Not Active Members (No attendance in 30 days)
  // ============================================================
  const notActiveMembersData = useMemo(() => {
    const thirtyDaysAgo = subDays(new Date(), 30);
    const attendanceMap: Record<string, string> = {};
    (attendances || []).forEach(a => {
      if (!a.clientId) return;
      const d = safeParseDate(a.date);
      if (!d) return;
      const existing = attendanceMap[a.clientId];
      if (!existing || isAfter(d, safeParseDate(existing)!)) {
        attendanceMap[a.clientId] = a.date;
      }
    });
    return (clients || [])
      .filter(c => {
        if (c.status !== 'Active') return false;
        if (!matchBranch(c.branch)) return false;
        const lastAtt = attendanceMap[c.id];
        if (!lastAtt) return true; // never attended
        const lastDate = safeParseDate(lastAtt);
        if (!lastDate) return true;
        return isBefore(lastDate, thirtyDaysAgo);
      })
      .map(c => ({
        ...c,
        lastAttendance: attendanceMap[c.id] || null,
      }));
  }, [clients, attendances, branchFilter]);

  // ============================================================
  // 6. Guest Members
  // ============================================================
  const guestMembersData = useMemo(() => {
    return (clients || []).filter(c => {
      if (!c.typeOfClient || !c.typeOfClient.toLowerCase().includes('guest')) return false;
      if (!matchBranch(c.branch)) return false;
      return true;
    });
  }, [clients, branchFilter]);

  // ============================================================
  // 7. Marketing Report
  // ============================================================
  const marketingReportData = useMemo(() => {
    const filtered = (clients || []).filter(c => matchBranch(c.branch));
    const map: Record<string, { total: number; active: number; expired: number }> = {};
    filtered.forEach(c => {
      const src = c.source || 'Unknown';
      if (!map[src]) map[src] = { total: 0, active: 0, expired: 0 };
      map[src].total++;
      if (c.status === 'Active') map[src].active++;
      if (c.status === 'Expired') map[src].expired++;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([source, data]) => ({
        source,
        ...data,
        conversionRate: data.total > 0 ? ((data.active / data.total) * 100).toFixed(1) + '%' : '0%',
      }));
  }, [clients, branchFilter]);

  const marketingChartData = useMemo(() => {
    return marketingReportData.map(d => ({ name: d.source, count: d.total }));
  }, [marketingReportData]);

  // ============================================================
  // 8. Marketing by Package
  // ============================================================
  const marketingByPackageData = useMemo(() => {
    const validPayments = (payments || []).filter(p => !p.deleted_at);
    const filtered = validPayments.filter(p => {
      if (!isInDateRange(p.date || p.created_at)) return false;
      if (!matchBranch(p.branch)) return false;
      return true;
    });
    const map: Record<string, { count: number; revenue: number }> = {};
    filtered.forEach(p => {
      const client = clientsMap[p.clientId];
      const src = client?.source || 'Unknown';
      const pkg = p.packageType || 'Unknown';
      const key = `${src}|||${pkg}`;
      if (!map[key]) map[key] = { count: 0, revenue: 0 };
      map[key].count++;
      map[key].revenue += Number(p.amount_paid) || Number(p.amount) || 0;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([key, data]) => {
        const [source, packageType] = key.split('|||');
        return { source, packageType, ...data };
      });
  }, [payments, clientsMap, dateFrom, dateTo, branchFilter]);

  // ============================================================
  // 9. Package Upgrades
  // ============================================================
  const packageUpgradesData = useMemo(() => {
    return (payments || []).filter(p => {
      if (!p.isUpgradePayment) return false;
      if (p.deleted_at) return false;
      if (!isInDateRange(p.date || p.created_at)) return false;
      if (!matchBranch(p.branch)) return false;
      if (!matchStaff(p.salesName)) return false;
      return true;
    });
  }, [payments, dateFrom, dateTo, branchFilter, staffFilter]);

  // ============================================================
  // 10. Trainer Exercise
  // ============================================================
  const trainerExerciseData = useMemo(() => {
    const filtered = (ptPackageRecords || []).filter(r => {
      if (!isInDateRange(r.date)) return false;
      if (!matchBranch(r.branch)) return false;
      return true;
    });
    const map: Record<string, { total: number; attended: number; noShow: number; cancelled: number }> = {};
    filtered.forEach(r => {
      const tid = r.trainerId || 'Unknown';
      if (!map[tid]) map[tid] = { total: 0, attended: 0, noShow: 0, cancelled: 0 };
      map[tid].total++;
      if (r.status === 'Attended') map[tid].attended++;
      if (r.status === 'No Show') map[tid].noShow++;
      if (r.status === 'Cancelled') map[tid].cancelled++;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([trainerId, data]) => ({
        trainerId,
        trainerName: usersMap[trainerId] || trainerId,
        ...data,
      }));
  }, [ptPackageRecords, dateFrom, dateTo, branchFilter, usersMap]);

  const trainerChartData = useMemo(() => {
    return trainerExerciseData.map(d => ({ name: d.trainerName, attended: d.attended, noShow: d.noShow }));
  }, [trainerExerciseData]);

  // ============================================================
  // 11. Top Activity (Attendances by day of week)
  // ============================================================
  const topActivityData = useMemo(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const filtered = (attendances || []).filter(a => {
      if (!isInDateRange(a.date)) return false;
      if (!matchBranch(a.branch)) return false;
      return true;
    });
    filtered.forEach(a => {
      const d = safeParseDate(a.date);
      if (d) { const day = d.getDay(); counts[day] = (counts[day] ?? 0) + 1; }
    });
    // Reorder to Mon-Sun
    const reordered = [1, 2, 3, 4, 5, 6, 0].map(i => ({
      day: dayNames[i],
      checkIns: counts[i],
    }));
    return reordered;
  }, [attendances, dateFrom, dateTo, branchFilter]);

  // ============================================================
  // 12. Member Attendance
  // ============================================================
  const memberAttendanceData = useMemo(() => {
    const map: Record<string, { count: number; lastDate: string | null }> = {};
    const filtered = (attendances || []).filter(a => {
      if (!isInDateRange(a.date)) return false;
      if (!matchBranch(a.branch)) return false;
      return true;
    });
    filtered.forEach(a => {
      if (!a.clientId) return;
      if (!map[a.clientId]) map[a.clientId] = { count: 0, lastDate: null };
      map[a.clientId]!.count++;
      const d = safeParseDate(a.date);
      const existing = map[a.clientId]!.lastDate ? safeParseDate(map[a.clientId]!.lastDate) : null;
      if (d && (!existing || isAfter(d, existing))) {
        map[a.clientId]!.lastDate = a.date;
      }
    });
    return Object.entries(map)
      .map(([clientId, data]) => {
        const client = clientsMap[clientId];
        return {
          clientId,
          name: client?.name || 'Unknown',
          memberId: client?.memberId || '',
          totalAttendances: data.count,
          lastAttendance: data.lastDate,
        };
      })
      .sort((a, b) => b.totalAttendances - a.totalAttendances);
  }, [attendances, clientsMap, dateFrom, dateTo, branchFilter]);

  // ============================================================
  // 13. Member Points
  // ============================================================
  const memberPointsData = useMemo(() => {
    return (clients || [])
      .filter(c => matchBranch(c.branch))
      .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0))
      .map((c, i) => ({
        rank: i + 1,
        name: c.name,
        memberId: c.memberId,
        points: Number(c.points) || 0,
        packageType: c.packageType || '',
        branch: c.branch || '',
      }));
  }, [clients, branchFilter]);

  // ============================================================
  // 14. Referrals
  // ============================================================
  const referralsData = useMemo(() => {
    return (clients || []).filter(c => {
      if (!c.referredBy && !c.referredByName) return false;
      if (!matchBranch(c.branch)) return false;
      return true;
    });
  }, [clients, branchFilter]);

  // ============================================================
  // 15. National Members
  // ============================================================
  const nationalMembersData = useMemo(() => {
    const filtered = (clients || []).filter(c => matchBranch(c.branch));
    const map: Record<string, number> = {};
    filtered.forEach(c => {
      const nat = c.nationality || 'Unknown';
      map[nat] = (map[nat] || 0) + 1;
    });
    const total = filtered.length;
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([nationality, count]) => ({
        nationality,
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%',
      }));
  }, [clients, branchFilter]);

  const nationalPieData = useMemo(() => {
    return nationalMembersData.slice(0, 10).map(d => ({ name: d.nationality, value: d.count }));
  }, [nationalMembersData]);

  // ============================================================
  // 16. Staff Logs
  // ============================================================
  const staffLogsData = useMemo(() => {
    return (auditLogs || []).filter(l => {
      if (!isInDateRange(l.timestamp)) return false;
      if (!matchBranch(l.branch)) return false;
      if (staffFilter !== 'all' && l.userId !== staffFilter && l.userName !== staffFilter) return false;
      return true;
    });
  }, [auditLogs, dateFrom, dateTo, branchFilter, staffFilter]);

  // --- Unique users from audit logs for filter ---
  const auditUsersList = useMemo(() => {
    const set = new Set<string>();
    (auditLogs || []).forEach(l => {
      if (l.userName) set.add(l.userName);
    });
    return Array.from(set).sort();
  }, [auditLogs]);

  // ============================================================
  // Render helpers
  // ============================================================

  const formatDate = (d: any): string => {
    const parsed = safeParseDate(d);
    return parsed ? format(parsed, 'dd MMM yyyy') : '—';
  };

  const formatDateTime = (d: any): string => {
    const parsed = safeParseDate(d);
    return parsed ? format(parsed, 'dd MMM yyyy HH:mm') : '—';
  };

  const formatCurrency = (v: number): string => {
    return new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  };

  // --- Filter Row component ---
  const FilterRow = ({ showStaff = false, showDateRange = true }: { showStaff?: boolean; showDateRange?: boolean }) => (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      {showDateRange && (
        <>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 h-9 bg-background" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-9 bg-background" />
          </div>
        </>
      )}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Branch</label>
        <Select value={branchFilter} onValueChange={v => setBranchFilter(v || '')}>
          <SelectTrigger className="w-44 h-9 bg-background">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branchList.map(b => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showStaff && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Staff</label>
          <Select value={staffFilter} onValueChange={v => setStaffFilter(v || '')}>
            <SelectTrigger className="w-44 h-9 bg-background">
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffList.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => { setDateFrom(''); setDateTo(''); setBranchFilter('all'); setStaffFilter('all'); }}
      >
        Clear Filters
      </Button>
    </div>
  );

  // --- Empty state ---
  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <BarChart3 className="h-12 w-12 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );

  // --- Table wrapper ---
  const TableWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  );

  const Th = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-2 text-left text-xs font-semibold text-muted-foreground bg-muted/50 whitespace-nowrap ${className}`}>
      {children}
    </th>
  );

  const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <td className={`px-3 py-2 whitespace-nowrap text-foreground ${className}`}>
      {children}
    </td>
  );

  // ============================================================
  // Report renderers
  // ============================================================

  const renderExpiredMembers = () => (
    <>
      <FilterRow showStaff showDateRange />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{expiredMembersData.length} expired members</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          expiredMembersData.map(c => ({
            Name: c.name, MemberId: c.memberId, Phone: c.phone, Package: c.packageType,
            ExpiryDate: formatDate(c.membershipExpiry), SalesRep: c.salesName, Branch: c.branch,
          })),
          'expired_members'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {expiredMembersData.length === 0 ? <EmptyState message="No expired members found." /> : (
        <>
          <TableWrapper>
            <thead><tr>
              <Th>Name</Th><Th>Member ID</Th><Th>Phone</Th><Th>Package</Th><Th>Expiry Date</Th><Th>Sales Rep</Th><Th>Branch</Th>
            </tr></thead>
            <tbody>
              {expiredMembersData.slice(0, 200).map((c, i) => (
                <tr key={c.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <Td className="font-medium">{c.name}</Td>
                  <Td>{c.memberId || '—'}</Td>
                  <Td>{c.phone || '—'}</Td>
                  <Td>{c.packageType || '—'}</Td>
                  <Td>{formatDate(c.membershipExpiry)}</Td>
                  <Td>{c.salesName || '—'}</Td>
                  <Td>{c.branch || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
          {expiredChartData.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2 text-foreground">Expired Members by Month</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={expiredChartData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {expiredChartData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </>
  );

  const renderPackageMembers = () => (
    <>
      <FilterRow showDateRange={false} />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{packageMembersData.length} active members</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          packageMembersData.map(c => ({
            Name: c.name, MemberId: c.memberId, Package: c.packageType, StartDate: formatDate(c.startDate),
            EndDate: formatDate(c.membershipExpiry), Sessions: c.sessionsRemaining, Branch: c.branch,
          })),
          'package_members'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {packageMembersData.length === 0 ? <EmptyState message="No active members found." /> : (
        <>
          <TableWrapper>
            <thead><tr>
              <Th>Name</Th><Th>Member ID</Th><Th>Package</Th><Th>Start</Th><Th>End</Th><Th>Sessions</Th><Th>Branch</Th>
            </tr></thead>
            <tbody>
              {packageMembersData.slice(0, 200).map((c, i) => (
                <tr key={c.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <Td className="font-medium">{c.name}</Td>
                  <Td>{c.memberId || '—'}</Td>
                  <Td><Badge variant="outline" className="text-xs">{c.packageType || '—'}</Badge></Td>
                  <Td>{formatDate(c.startDate)}</Td>
                  <Td>{formatDate(c.membershipExpiry)}</Td>
                  <Td>{c.sessionsRemaining ?? '—'}</Td>
                  <Td>{c.branch || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
          {packageChartData.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2 text-foreground">Members per Package</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={packageChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {packageChartData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </>
  );

  const renderIncomeByService = () => {
    const total = incomeByServiceData.reduce((s, d) => s + d.value, 0);
    return (
      <>
        <FilterRow showDateRange />
        <div className="flex items-center justify-between mb-3">
          <Badge variant="secondary">Total: {formatCurrency(total)}</Badge>
          <Button size="sm" variant="outline" onClick={() => exportToCSV(
            incomeByServiceData.map(d => ({ Category: d.name, Revenue: d.value })),
            'income_by_service'
          )}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
        {incomeByServiceData.length === 0 ? <EmptyState message="No payment data found." /> : (
          <>
            <TableWrapper>
              <thead><tr><Th>Service Category</Th><Th>Revenue</Th><Th>Share</Th></tr></thead>
              <tbody>
                {incomeByServiceData.map((d, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <Td className="font-medium">{d.name}</Td>
                    <Td>{formatCurrency(d.value)}</Td>
                    <Td>{total > 0 ? ((d.value / total) * 100).toFixed(1) + '%' : '0%'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrapper>
            <div className="mt-6 flex justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={incomeByServiceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}>
                    {incomeByServiceData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </>
    );
  };

  const renderStaffInvitations = () => (
    <>
      <FilterRow showDateRange={false} />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{staffInvitationsData.length} staff members</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          staffInvitationsData.map(d => ({ SalesRep: d.salesRep, Total: d.total, Active: d.active, Expired: d.expired })),
          'staff_invitations'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {staffInvitationsData.length === 0 ? <EmptyState message="No staff data found." /> : (
        <>
          <TableWrapper>
            <thead><tr><Th>Sales Rep</Th><Th>Total Members</Th><Th>Active</Th><Th>Expired</Th></tr></thead>
            <tbody>
              {staffInvitationsData.map((d, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <Td className="font-medium">{d.salesRep}</Td>
                  <Td>{d.total}</Td>
                  <Td><span className="text-emerald-500 font-medium">{d.active}</span></Td>
                  <Td><span className="text-red-500 font-medium">{d.expired}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
          <div className="mt-6">
            <h3 className="text-sm font-semibold mb-2 text-foreground">Members by Staff</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={staffInvitationsData}>
                <XAxis dataKey="salesRep" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {staffInvitationsData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </>
  );

  const renderNotActiveMembers = () => (
    <>
      <FilterRow showDateRange={false} />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{notActiveMembersData.length} inactive members (30+ days)</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          notActiveMembersData.map(c => ({
            Name: c.name, MemberId: c.memberId, Phone: c.phone, Package: c.packageType,
            LastAttendance: c.lastAttendance ? formatDate(c.lastAttendance) : 'Never', Branch: c.branch,
          })),
          'not_active_members'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {notActiveMembersData.length === 0 ? <EmptyState message="All active members have recent attendance." /> : (
        <TableWrapper>
          <thead><tr>
            <Th>Name</Th><Th>Member ID</Th><Th>Phone</Th><Th>Package</Th><Th>Last Attendance</Th><Th>Branch</Th>
          </tr></thead>
          <tbody>
            {notActiveMembersData.slice(0, 200).map((c, i) => (
              <tr key={c.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.memberId || '—'}</Td>
                <Td>{c.phone || '—'}</Td>
                <Td>{c.packageType || '—'}</Td>
                <Td>{c.lastAttendance ? formatDate(c.lastAttendance) : <span className="text-red-500">Never</span>}</Td>
                <Td>{c.branch || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </>
  );

  const renderGuestMembers = () => (
    <>
      <FilterRow showDateRange={false} />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{guestMembersData.length} guest members</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          guestMembersData.map(c => ({ Name: c.name, Phone: c.phone, Branch: c.branch, CreatedAt: formatDate(c.createdAt) })),
          'guest_members'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {guestMembersData.length === 0 ? <EmptyState message="No guest members found." /> : (
        <TableWrapper>
          <thead><tr><Th>Name</Th><Th>Phone</Th><Th>Branch</Th><Th>Created At</Th></tr></thead>
          <tbody>
            {guestMembersData.slice(0, 200).map((c, i) => (
              <tr key={c.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.phone || '—'}</Td>
                <Td>{c.branch || '—'}</Td>
                <Td>{formatDate(c.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </>
  );

  const renderMarketingReport = () => (
    <>
      <FilterRow showDateRange={false} />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{marketingReportData.length} lead sources</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          marketingReportData.map(d => ({ Source: d.source, Total: d.total, Active: d.active, Expired: d.expired, ConversionRate: d.conversionRate })),
          'marketing_report'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {marketingReportData.length === 0 ? <EmptyState message="No marketing data found." /> : (
        <>
          <TableWrapper>
            <thead><tr><Th>Source</Th><Th>Total</Th><Th>Active</Th><Th>Expired</Th><Th>Conversion Rate</Th></tr></thead>
            <tbody>
              {marketingReportData.map((d, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <Td className="font-medium">{d.source}</Td>
                  <Td>{d.total}</Td>
                  <Td><span className="text-emerald-500 font-medium">{d.active}</span></Td>
                  <Td><span className="text-red-500 font-medium">{d.expired}</span></Td>
                  <Td><Badge variant="outline" className="text-xs">{d.conversionRate}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
          {marketingChartData.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2 text-foreground">Members by Lead Source</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={marketingChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {marketingChartData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </>
  );

  const renderMarketingByPackage = () => (
    <>
      <FilterRow showDateRange />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{marketingByPackageData.length} source-package combinations</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          marketingByPackageData.map(d => ({ Source: d.source, Package: d.packageType, Count: d.count, Revenue: d.revenue })),
          'marketing_by_package'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {marketingByPackageData.length === 0 ? <EmptyState message="No marketing-by-package data found." /> : (
        <TableWrapper>
          <thead><tr><Th>Source</Th><Th>Package</Th><Th>Count</Th><Th>Revenue</Th></tr></thead>
          <tbody>
            {marketingByPackageData.slice(0, 200).map((d, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td className="font-medium">{d.source}</Td>
                <Td><Badge variant="outline" className="text-xs">{d.packageType}</Badge></Td>
                <Td>{d.count}</Td>
                <Td>{formatCurrency(d.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </>
  );

  const renderPackageUpgrades = () => (
    <>
      <FilterRow showStaff showDateRange />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{packageUpgradesData.length} upgrades</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          packageUpgradesData.map(p => ({
            Client: p.client_name, PreviousPackage: p.previousPackageName, NewPackage: p.packageType,
            Amount: p.amount_paid || p.amount, Date: formatDate(p.date || p.created_at), SalesRep: p.salesName,
          })),
          'package_upgrades'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {packageUpgradesData.length === 0 ? <EmptyState message="No package upgrades found." /> : (
        <TableWrapper>
          <thead><tr><Th>Client</Th><Th>Previous Package</Th><Th>New Package</Th><Th>Amount</Th><Th>Date</Th><Th>Sales Rep</Th></tr></thead>
          <tbody>
            {packageUpgradesData.slice(0, 200).map((p, i) => (
              <tr key={p.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td className="font-medium">{p.client_name || '—'}</Td>
                <Td><Badge variant="outline" className="text-xs text-red-400">{p.previousPackageName || '—'}</Badge></Td>
                <Td><Badge variant="outline" className="text-xs text-emerald-400">{p.packageType || '—'}</Badge></Td>
                <Td>{formatCurrency(Number(p.amount_paid) || Number(p.amount) || 0)}</Td>
                <Td>{formatDate(p.date || p.created_at)}</Td>
                <Td>{p.salesName || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </>
  );

  const renderTrainerExercise = () => (
    <>
      <FilterRow showDateRange />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{trainerExerciseData.length} trainers</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          trainerExerciseData.map(d => ({ Trainer: d.trainerName, Total: d.total, Attended: d.attended, NoShow: d.noShow, Cancelled: d.cancelled })),
          'trainer_exercise'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {trainerExerciseData.length === 0 ? <EmptyState message="No trainer session data found." /> : (
        <>
          <TableWrapper>
            <thead><tr><Th>Trainer</Th><Th>Total Sessions</Th><Th>Attended</Th><Th>No Show</Th><Th>Cancelled</Th></tr></thead>
            <tbody>
              {trainerExerciseData.map((d, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <Td className="font-medium">{d.trainerName}</Td>
                  <Td>{d.total}</Td>
                  <Td><span className="text-emerald-500 font-medium">{d.attended}</span></Td>
                  <Td><span className="text-red-500 font-medium">{d.noShow}</span></Td>
                  <Td><span className="text-amber-500 font-medium">{d.cancelled}</span></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
          {trainerChartData.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2 text-foreground">Sessions by Trainer</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trainerChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="attended" fill="#10b981" name="Attended" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="noShow" fill="#ef4444" name="No Show" radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </>
  );

  const renderTopActivity = () => (
    <>
      <FilterRow showDateRange />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{topActivityData.reduce((s, d) => s + (d.checkIns || 0), 0)} total check-ins</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          topActivityData.map(d => ({ Day: d.day, CheckIns: d.checkIns })),
          'top_activity'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {topActivityData.every(d => d.checkIns === 0) ? <EmptyState message="No attendance data found." /> : (
        <>
          <TableWrapper>
            <thead><tr><Th>Day</Th><Th>Check-ins</Th></tr></thead>
            <tbody>
              {topActivityData.map((d, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <Td className="font-medium">{d.day}</Td>
                  <Td>{d.checkIns}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
          <div className="mt-6">
            <h3 className="text-sm font-semibold mb-2 text-foreground">Check-ins by Day of Week</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topActivityData}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="checkIns" radius={[4, 4, 0, 0]}>
                  {topActivityData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </>
  );

  const renderMemberAttendance = () => (
    <>
      <FilterRow showDateRange />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{memberAttendanceData.length} members with attendance</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          memberAttendanceData.map(d => ({ Name: d.name, MemberId: d.memberId, TotalAttendances: d.totalAttendances, LastAttendance: d.lastAttendance ? formatDate(d.lastAttendance) : 'N/A' })),
          'member_attendance'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {memberAttendanceData.length === 0 ? <EmptyState message="No attendance records found." /> : (
        <TableWrapper>
          <thead><tr><Th>Name</Th><Th>Member ID</Th><Th>Total Attendances</Th><Th>Last Attendance</Th></tr></thead>
          <tbody>
            {memberAttendanceData.slice(0, 200).map((d, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td className="font-medium">{d.name}</Td>
                <Td>{d.memberId || '—'}</Td>
                <Td><Badge variant="secondary">{d.totalAttendances}</Badge></Td>
                <Td>{d.lastAttendance ? formatDate(d.lastAttendance) : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </>
  );

  const renderMemberPoints = () => (
    <>
      <FilterRow showDateRange={false} />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{memberPointsData.length} members</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          memberPointsData.map(d => ({ Rank: d.rank, Name: d.name, MemberId: d.memberId, Points: d.points, Package: d.packageType, Branch: d.branch })),
          'member_points'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {memberPointsData.length === 0 ? <EmptyState message="No member points data found." /> : (
        <TableWrapper>
          <thead><tr><Th>Rank</Th><Th>Name</Th><Th>Member ID</Th><Th>Points</Th><Th>Package</Th><Th>Branch</Th></tr></thead>
          <tbody>
            {memberPointsData.slice(0, 200).map((d, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td>
                  {d.rank <= 3 ? (
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      d.rank === 1 ? 'bg-amber-500 text-white' : d.rank === 2 ? 'bg-slate-400 text-white' : 'bg-amber-700 text-white'
                    }`}>
                      {d.rank}
                    </span>
                  ) : d.rank}
                </Td>
                <Td className="font-medium">{d.name}</Td>
                <Td>{d.memberId || '—'}</Td>
                <Td><span className="font-bold text-amber-500">{d.points}</span></Td>
                <Td>{d.packageType || '—'}</Td>
                <Td>{d.branch || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </>
  );

  const renderReferrals = () => (
    <>
      <FilterRow showDateRange={false} />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{referralsData.length} referred members</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          referralsData.map(c => ({ Member: c.name, ReferredBy: c.referredByName || c.referredBy, DateJoined: formatDate(c.createdAt), Package: c.packageType })),
          'referrals'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {referralsData.length === 0 ? <EmptyState message="No referral data found." /> : (
        <TableWrapper>
          <thead><tr><Th>Member</Th><Th>Referred By</Th><Th>Date Joined</Th><Th>Package</Th></tr></thead>
          <tbody>
            {referralsData.slice(0, 200).map((c, i) => (
              <tr key={c.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.referredByName || c.referredBy || '—'}</Td>
                <Td>{formatDate(c.createdAt)}</Td>
                <Td><Badge variant="outline" className="text-xs">{c.packageType || '—'}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </>
  );

  const renderNationalMembers = () => (
    <>
      <FilterRow showDateRange={false} />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{nationalMembersData.length} nationalities</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          nationalMembersData.map(d => ({ Nationality: d.nationality, Count: d.count, Percentage: d.percentage })),
          'national_members'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {nationalMembersData.length === 0 ? <EmptyState message="No nationality data found." /> : (
        <>
          <TableWrapper>
            <thead><tr><Th>Nationality</Th><Th>Count</Th><Th>Percentage</Th></tr></thead>
            <tbody>
              {nationalMembersData.map((d, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <Td className="font-medium">{d.nationality}</Td>
                  <Td>{d.count}</Td>
                  <Td><Badge variant="outline" className="text-xs">{d.percentage}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
          {nationalPieData.length > 0 && (
            <div className="mt-6 flex justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={nationalPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}>
                    {nationalPieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </>
  );

  const renderStaffLogs = () => (
    <>
      <FilterRow showDateRange />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">User</label>
          <Select value={staffFilter} onValueChange={v => setStaffFilter(v || '')}>
            <SelectTrigger className="w-44 h-9 bg-background">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {auditUsersList.map(u => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{staffLogsData.length} log entries</Badge>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(
          staffLogsData.map(l => ({ Date: formatDateTime(l.timestamp), User: l.userName, Action: l.action, EntityType: l.entityType, Details: l.details })),
          'staff_logs'
        )}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>
      {staffLogsData.length === 0 ? <EmptyState message="No audit logs found." /> : (
        <TableWrapper>
          <thead><tr><Th>Date</Th><Th>User</Th><Th>Action</Th><Th>Entity Type</Th><Th>Details</Th></tr></thead>
          <tbody>
            {staffLogsData.slice(0, 200).map((l, i) => (
              <tr key={l.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td className="text-xs">{formatDateTime(l.timestamp)}</Td>
                <Td className="font-medium">{l.userName || '—'}</Td>
                <Td><Badge variant="outline" className="text-xs">{l.action || '—'}</Badge></Td>
                <Td>{l.entityType || '—'}</Td>
                <Td className="max-w-xs truncate text-xs text-muted-foreground">{typeof l.details === 'string' ? l.details : JSON.stringify(l.details) || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrapper>
      )}
    </>
  );

  // ============================================================
  // Report router
  // ============================================================
  const renderActiveReport = () => {
    switch (activeReport) {
      case 'expired-members': return renderExpiredMembers();
      case 'package-members': return renderPackageMembers();
      case 'income-by-service': return renderIncomeByService();
      case 'staff-invitations': return renderStaffInvitations();
      case 'not-active-members': return renderNotActiveMembers();
      case 'guest-members': return renderGuestMembers();
      case 'marketing-report': return renderMarketingReport();
      case 'marketing-by-package': return renderMarketingByPackage();
      case 'package-upgrades': return renderPackageUpgrades();
      case 'trainer-exercise': return renderTrainerExercise();
      case 'top-activity': return renderTopActivity();
      case 'member-attendance': return renderMemberAttendance();
      case 'member-points': return renderMemberPoints();
      case 'referrals': return renderReferrals();
      case 'national-members': return renderNationalMembers();
      case 'staff-logs': return renderStaffLogs();
      default: return <EmptyState message="Select a report from the sidebar." />;
    }
  };

  const activeTab = reportTabs.find(t => t.id === activeReport);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Star className="h-7 w-7 text-amber-500 fill-amber-500" />
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Premium Reports</h1>
          <p className="text-sm text-muted-foreground">Advanced analytics and reporting engine</p>
        </div>
      </div>

      {/* Layout: sidebar + content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <aside className="w-full lg:w-56 space-y-1 flex-shrink-0">
          {reportTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveReport(tab.id);
                setDateFrom('');
                setDateTo('');
                setBranchFilter('all');
                setStaffFilter('all');
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
                activeReport === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <Card className="bg-card border-border">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                {activeTab && <activeTab.icon className="h-5 w-5 text-primary" />}
                {activeTab?.label || 'Report'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderActiveReport()}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
