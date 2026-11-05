import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  Search,
  Users,
  AlertTriangle,
  Gift,
  UserPlus,
  Snowflake,
  Clock,
  Phone,
  MessageCircle,
  ExternalLink,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Calendar,
  CreditCard,
  Barcode,
  RefreshCw,
} from 'lucide-react';
import type { Client, Payment, User } from '../types';
import { safeFormatDate, toValidDate } from '../utils/dateUtils';
import { format } from 'date-fns';

export type DrilldownKpiKey =
  | 'leads'
  | 'expiring'
  | 'expired'
  | 'birthdays'
  | 'new'
  | 'returning'
  | 'frozen'
  | 'unconfirmed';

interface DashboardKpiDrilldownPageProps {
  activeKey: DrilldownKpiKey;
  onSelectKey: (key: DrilldownKpiKey) => void;
  onBack: () => void;
  leadsList: Client[];
  nearlyExpiredList: Client[];
  expiredList: Client[];
  upcomingBirthdays: Client[];
  newMembersList: Client[];
  returningMembersList: Client[];
  frozenMembersList: Client[];
  unconfirmedClientsList: Client[];
  allClients: Client[];
  payments: Payment[];
  users: User[];
  branches: string[];
  selectedMonth: Date;
  clubName: string;
  onOpenProfile: (clientId: string) => void;
  onCallMember?: (client: Client) => void;
  onUnfreezeMember?: (clientId: string, clientName: string) => Promise<void>;
  onConfirmPackage?: (client: Client, pkgIndex: number) => Promise<void>;
  onOpenUnconfirmedModule?: () => void;
}

const ITEMS_PER_PAGE = 50;

export default function DashboardKpiDrilldownPage({
  activeKey,
  onSelectKey,
  onBack,
  leadsList,
  nearlyExpiredList,
  expiredList,
  upcomingBirthdays,
  newMembersList,
  returningMembersList,
  frozenMembersList,
  unconfirmedClientsList,
  payments,
  users,
  branches,
  selectedMonth,
  clubName,
  onOpenProfile,
  onCallMember,
  onUnfreezeMember,
  onConfirmPackage,
  onOpenUnconfirmedModule,
}: DashboardKpiDrilldownPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [subFilter, setSubFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('default');
  const [currentPage, setCurrentPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleSwitchKey = (key: DrilldownKpiKey) => {
    onSelectKey(key);
    setSubFilter('all');
    setSortBy('default');
    setCurrentPage(1);
  };

  const kpiTabs: Array<{
    key: DrilldownKpiKey;
    label: string;
    subtitle: string;
    count: number;
    icon: React.ReactNode;
    accentClass: string;
    badgeClass: string;
  }> = [
    {
      key: 'leads',
      label: 'Active Leads',
      subtitle: 'Prospects & walk-ins needing sales follow-up',
      count: leadsList.length,
      icon: <Users className="h-4 w-4 text-blue-500" />,
      accentClass: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
      badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    },
    {
      key: 'expiring',
      label: 'Expiring Soon',
      subtitle: 'Active memberships ending within 14 days',
      count: nearlyExpiredList.length,
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      accentClass: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
      badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    },
    {
      key: 'expired',
      label: 'Total Expired',
      subtitle: 'Expired memberships ready for win-back & renewal',
      count: expiredList.length,
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      accentClass: 'border-red-500/40 bg-red-500/10 text-red-400',
      badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
    },
    {
      key: 'birthdays',
      label: 'Upcoming Birthdays',
      subtitle: 'Members celebrating birthdays in the next 7 days',
      count: upcomingBirthdays.length,
      icon: <Gift className="h-4 w-4 text-pink-500" />,
      accentClass: 'border-pink-500/40 bg-pink-500/10 text-pink-400',
      badgeClass: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
    },
    {
      key: 'new',
      label: `New Members (${format(selectedMonth, 'MMM yyyy')})`,
      subtitle: `Members who started in ${format(selectedMonth, 'MMMM yyyy')}`,
      count: newMembersList.length,
      icon: <UserPlus className="h-4 w-4 text-emerald-500" />,
      accentClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
    {
      key: 'returning',
      label: 'Returning Active',
      subtitle: 'Long-standing active members joined prior to this month',
      count: returningMembersList.length,
      icon: <RefreshCw className="h-4 w-4 text-teal-500" />,
      accentClass: 'border-teal-500/40 bg-teal-500/10 text-teal-400',
      badgeClass: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    },
    {
      key: 'frozen',
      label: 'Frozen Members',
      subtitle: 'Currently paused / On Hold memberships',
      count: frozenMembersList.length,
      icon: <Snowflake className="h-4 w-4 text-sky-500" />,
      accentClass: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
      badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    },
    {
      key: 'unconfirmed',
      label: 'Unconfirmed Queue',
      subtitle: 'Packages awaiting accounting review & confirmation',
      count: unconfirmedClientsList.length,
      icon: <Clock className="h-4 w-4 text-orange-500" />,
      accentClass: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
      badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    },
  ];

  const activeTabInfo = (kpiTabs.find((t) => t.key === activeKey) || kpiTabs[0])!;

  const rawItems: Client[] = useMemo(() => {
    switch (activeKey) {
      case 'leads':
        return leadsList;
      case 'expiring':
        return nearlyExpiredList;
      case 'expired':
        return expiredList;
      case 'birthdays':
        return upcomingBirthdays;
      case 'new':
        return newMembersList;
      case 'returning':
        return returningMembersList;
      case 'frozen':
        return frozenMembersList;
      case 'unconfirmed':
        return unconfirmedClientsList;
      default:
        return [];
    }
  }, [
    activeKey,
    leadsList,
    nearlyExpiredList,
    expiredList,
    upcomingBirthdays,
    newMembersList,
    returningMembersList,
    frozenMembersList,
    unconfirmedClientsList,
  ]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => {
      if (u.id) map.set(u.id, u.name || u.email || u.id);
    });
    return map;
  }, [users]);

  const clientPaidMap = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((p) => {
      if (p.deleted_at || (p.status && p.status !== 'paid')) return;
      if (!p.clientId) return;
      const amt = Number(p.amount_paid ?? p.amount ?? 0) || 0;
      map.set(p.clientId, (map.get(p.clientId) || 0) + amt);
    });
    return map;
  }, [payments]);

  const getRepLabel = (c: Client): string => {
    const raw = (c as any).salesName || c.salesRep || c.assignedTo || (c as any).recordedBy || '';
    if (!raw) return 'Unassigned';
    return userMap.get(raw) || String(raw);
  };

  const getDaysToExpiry = (c: Client): number | null => {
    const expStr = c.membershipExpiry || (c as any).membershipEndDate || (c as any).expiryDate;
    if (!expStr) return typeof c.daysRemaining === 'number' ? c.daysRemaining : null;
    const d = toValidDate(expStr);
    if (!d) return null;
    return Math.ceil((d.getTime() - Date.now()) / 86400000);
  };

  const getBirthdayDaysAway = (c: Client): { daysAway: number; nextAge: number | null; bdayDisplay: string } => {
    if (!c.dateOfBirth) return { daysAway: 999, nextAge: null, bdayDisplay: '—' };
    const dob = toValidDate(c.dateOfBirth);
    if (!dob) return { daysAway: 999, nextAge: null, bdayDisplay: c.dateOfBirth };
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let nextBday = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
    if (nextBday.getTime() < todayMidnight.getTime()) {
      nextBday = new Date(now.getFullYear() + 1, dob.getMonth(), dob.getDate());
    }
    const daysAway = Math.round((nextBday.getTime() - todayMidnight.getTime()) / 86400000);
    const nextAge = dob.getFullYear() > 1920 ? nextBday.getFullYear() - dob.getFullYear() : null;
    return {
      daysAway,
      nextAge,
      bdayDisplay: safeFormatDate(c.dateOfBirth, 'dd MMM yyyy', c.dateOfBirth),
    };
  };

  const repOptions = useMemo(() => {
    const set = new Set<string>();
    rawItems.forEach((c) => {
      const label = getRepLabel(c);
      if (label && label !== 'Unassigned') set.add(label);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawItems, userMap]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^#/, '');
    const list = rawItems.filter((c) => {
      if (selectedBranch !== 'all' && c.branch !== selectedBranch) return false;
      if (selectedRep !== 'all' && getRepLabel(c) !== selectedRep) return false;

      if (q) {
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const idMatch = String(c.memberId || '').toLowerCase().includes(q);
        const redgitsMatch = String((c as any).redgitsId || '').toLowerCase().includes(q);
        const phoneMatch = (c.phone || '').toLowerCase().includes(q);
        const barcodeMatch = String((c as any).barcode || '').toLowerCase().includes(q);
        const pkgMatch = String(c.primaryPackageName || c.packageType || '').toLowerCase().includes(q);
        const repMatch = getRepLabel(c).toLowerCase().includes(q);
        if (!nameMatch && !idMatch && !redgitsMatch && !phoneMatch && !barcodeMatch && !pkgMatch && !repMatch) {
          return false;
        }
      }

      if (subFilter !== 'all') {
        if (activeKey === 'expiring') {
          const days = getDaysToExpiry(c);
          if (days === null) return false;
          if (subFilter === '3d' && days > 3) return false;
          if (subFilter === '7d' && days > 7) return false;
          if (subFilter === '14d' && days > 14) return false;
        } else if (activeKey === 'expired') {
          const days = getDaysToExpiry(c);
          if (days === null) return false;
          const daysAgo = Math.abs(days);
          if (subFilter === '30d' && daysAgo > 30) return false;
          if (subFilter === '90d' && daysAgo > 90) return false;
          if (subFilter === '365d' && daysAgo > 365) return false;
        } else if (activeKey === 'birthdays') {
          const { daysAway } = getBirthdayDaysAway(c);
          if (subFilter === 'today' && daysAway !== 0) return false;
          if (subFilter === '3d' && daysAway > 3) return false;
        } else if (activeKey === 'leads') {
          const hasComments = Array.isArray(c.comments) && c.comments.length > 0;
          if (subFilter === 'uncontacted' && hasComments) return false;
          if (subFilter === 'contacted' && !hasComments) return false;
        }
      }

      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'memberId') {
        return (Number(b.memberId) || 0) - (Number(a.memberId) || 0);
      }
      if (sortBy === 'revenue') {
        return (clientPaidMap.get(b.id) || 0) - (clientPaidMap.get(a.id) || 0);
      }
      // Smart default per KPI page
      if (activeKey === 'expiring') {
        return (getDaysToExpiry(a) ?? 999) - (getDaysToExpiry(b) ?? 999);
      }
      if (activeKey === 'expired') {
        return (getDaysToExpiry(b) ?? -99999) - (getDaysToExpiry(a) ?? -99999);
      }
      if (activeKey === 'birthdays') {
        return getBirthdayDaysAway(a).daysAway - getBirthdayDaysAway(b).daysAway;
      }
      if (activeKey === 'new' || activeKey === 'returning') {
        return String(b.startDate || '').localeCompare(String(a.startDate || ''));
      }
      return (Number(b.memberId) || 0) - (Number(a.memberId) || 0);
    });
  }, [rawItems, searchQuery, selectedBranch, selectedRep, subFilter, sortBy, activeKey, clientPaidMap]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = filteredItems.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const openWhatsApp = (client: Client) => {
    const rawPhone = (client.phone || '').replace(/\D/g, '');
    if (!rawPhone) return;
    const intlPhone = rawPhone.startsWith('0') ? `2${rawPhone}` : rawPhone;
    const firstName = (client.name || 'Member').split(' ')[0];
    const pkgName = client.primaryPackageName || client.packageType || 'membership';
    const expDate = safeFormatDate(client.membershipExpiry, 'dd MMM yyyy', '');

    let msg = `Hello ${firstName}, this is ${clubName}.`;
    if (activeKey === 'expiring') {
      msg = `Hi ${firstName}! Your ${pkgName} at ${clubName} expires on ${expDate}. Let us know if you would like to lock in your renewal offer!`;
    } else if (activeKey === 'expired') {
      msg = `Hi ${firstName}! We miss seeing you at ${clubName}. Reach out to check our latest renewal packages!`;
    } else if (activeKey === 'birthdays') {
      msg = `Happy Birthday ${firstName}! 🎂🎉 Wishing you an amazing year ahead from the entire ${clubName} family!`;
    } else if (activeKey === 'leads') {
      msg = `Hi ${firstName}! Following up from ${clubName} — would you like to book your tour or complimentary trial session this week?`;
    } else if (activeKey === 'new') {
      msg = `Welcome to ${clubName}, ${firstName}! 💪 Let us know if you need help booking your Free PT assessment or classes.`;
    }
    window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const exportCsv = () => {
    const headers = [
      'Member ID',
      'Name',
      'Phone',
      'Status',
      'Package',
      'Start Date',
      'Expiry Date',
      'Days To Expiry',
      'Date of Birth',
      'Barcode',
      'Sales Rep',
      'Coach / Trainer',
      'Branch',
      'Total Paid (LE)',
    ];
    const rows = filteredItems.map((c) => [
      c.memberId || '',
      `"${String(c.name || '').replace(/"/g, '""')}"`,
      c.phone || '',
      c.status || '',
      `"${String(c.primaryPackageName || c.packageType || '').replace(/"/g, '""')}"`,
      c.startDate || '',
      c.membershipExpiry || '',
      getDaysToExpiry(c) ?? '',
      c.dateOfBirth || '',
      (c as any).barcode || '',
      `"${getRepLabel(c).replace(/"/g, '""')}"`,
      `"${String((c as any).trainerName || c.assignedCoachName || '').replace(/"/g, '""')}"`,
      c.branch || '',
      clientPaidMap.get(c.id) || 0,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeKey}_members_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Top Bar: Back Button + KPI Page Switcher Pills */}
      <div className="flex flex-col gap-3 bg-card/80 backdrop-blur border border-border/60 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="gap-1.5 font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
            <div>
              <div className="flex items-center gap-2">
                {activeTabInfo.icon}
                <h1 className="text-lg sm:text-xl font-black tracking-tight">
                  {activeTabInfo.label}
                </h1>
                <Badge variant="outline" className={`font-mono font-bold ${activeTabInfo.badgeClass}`}>
                  {filteredItems.length.toLocaleString()} {filteredItems.length !== rawItems.length ? `/ ${rawItems.length.toLocaleString()}` : ''}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{activeTabInfo.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeKey === 'unconfirmed' && onOpenUnconfirmedModule && (
              <Button
                variant="default"
                size="sm"
                onClick={onOpenUnconfirmedModule}
                className="gap-1.5 text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Full Finance Queue
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={filteredItems.length === 0}
              className="gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV ({filteredItems.length})
            </Button>
          </div>
        </div>

        {/* Fast Switcher Pills across all 8 Dashboard KPI views */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-border/50">
          {kpiTabs.map((tab) => {
            const isSelected = tab.key === activeKey;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSwitchKey(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition-all ${
                  isSelected
                    ? `${tab.accentClass} shadow-xs`
                    : 'border-transparent bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-background/70">
                  {tab.count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search, Filters & Category Quick-Pills */}
      <Card className="border-border/60">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by Name, #Member ID, Phone, Barcode (e.g. o904), Package, or Rep..."
                className="pl-9 h-9 text-sm"
              />
            </div>

            <Select
              value={selectedRep}
              onValueChange={(v) => {
                setSelectedRep(v || 'all');
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Sales Reps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sales Reps ({repOptions.length})</SelectItem>
                {repOptions.map((rep) => (
                  <SelectItem key={rep} value={rep}>
                    {rep}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedBranch}
              onValueChange={(v) => {
                setSelectedBranch(v || 'all');
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v || 'default');
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Sort Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Smart Priority Sort</SelectItem>
                <SelectItem value="memberId">Member ID (Newest #)</SelectItem>
                <SelectItem value="name">Member Name (A–Z)</SelectItem>
                <SelectItem value="revenue">Lifetime Paid (Highest LE)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category-Specific Sub-Filter Pills */}
          {activeKey === 'expiring' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-bold uppercase text-muted-foreground mr-1">Urgency Window:</span>
              {[
                { id: 'all', label: 'All Expiring (≤14 Days)' },
                { id: '3d', label: 'Critical (≤3 Days)' },
                { id: '7d', label: 'Ending in 7 Days' },
                { id: '14d', label: 'Ending in 14 Days' },
              ].map((f) => (
                <Button
                  key={f.id}
                  variant={subFilter === f.id ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => {
                    setSubFilter(f.id);
                    setCurrentPage(1);
                  }}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          )}

          {activeKey === 'expired' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-bold uppercase text-muted-foreground mr-1">Expired Window:</span>
              {[
                { id: 'all', label: 'All Expired Members' },
                { id: '30d', label: 'Expired Last 30 Days (Hot Win-Back)' },
                { id: '90d', label: 'Expired Last 90 Days' },
                { id: '365d', label: 'Expired Within 1 Year' },
              ].map((f) => (
                <Button
                  key={f.id}
                  variant={subFilter === f.id ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => {
                    setSubFilter(f.id);
                    setCurrentPage(1);
                  }}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          )}

          {activeKey === 'birthdays' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-bold uppercase text-muted-foreground mr-1">Birthday Window:</span>
              {[
                { id: 'all', label: 'Next 7 Days' },
                { id: 'today', label: '🎂 Celebrating Today' },
                { id: '3d', label: 'Next 3 Days' },
              ].map((f) => (
                <Button
                  key={f.id}
                  variant={subFilter === f.id ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => {
                    setSubFilter(f.id);
                    setCurrentPage(1);
                  }}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          )}

          {activeKey === 'leads' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-bold uppercase text-muted-foreground mr-1">Follow-Up Status:</span>
              {[
                { id: 'all', label: 'All Active Leads' },
                { id: 'uncontacted', label: 'No Notes / Uncontacted' },
                { id: 'contacted', label: 'Has Call Center / Follow-Up Notes' },
              ].map((f) => (
                <Button
                  key={f.id}
                  variant={subFilter === f.id ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => {
                    setSubFilter(f.id);
                    setCurrentPage(1);
                  }}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Actionable Member Table */}
      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="text-left py-3 px-4">Member</th>
                <th className="text-left py-3 px-3">Contact & ID</th>
                <th className="text-left py-3 px-3">Package / Membership</th>
                <th className="text-left py-3 px-3">
                  {activeKey === 'birthdays'
                    ? 'Birthday & Age'
                    : activeKey === 'frozen'
                    ? 'Freeze Window & Balance'
                    : activeKey === 'leads'
                    ? 'Latest Follow-Up / Note'
                    : 'Dates & Countdown'}
                </th>
                <th className="text-left py-3 px-3">Sales Rep / Coach</th>
                <th className="text-right py-3 px-4">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    No members match your current filters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((client) => {
                  const daysToExp = getDaysToExpiry(client);
                  const bdayInfo = activeKey === 'birthdays' ? getBirthdayDaysAway(client) : null;
                  const repName = getRepLabel(client);
                  const trainerName = (client as any).trainerName || client.assignedCoachName || '';
                  const barcode = (client as any).barcode || '';
                  const totalPaid = clientPaidMap.get(client.id) || 0;
                  const pendingPkgIndex = Array.isArray(client.packages)
                    ? client.packages.findIndex((p) => p.isPendingConfirmation === true)
                    : -1;
                  const pendingPkg =
                    pendingPkgIndex >= 0 && client.packages ? client.packages[pendingPkgIndex] : null;

                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-muted/25 transition-colors group"
                    >
                      {/* Member Name + Avatar + Status */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {client.photoURL || (client as any).photoUrl || (client as any).avatarUrl ? (
                            <img
                              src={client.photoURL || (client as any).photoUrl || (client as any).avatarUrl}
                              alt={client.name}
                              className="h-10 w-10 rounded-full object-cover border border-border shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-xs text-primary shrink-0">
                              {(client.name || '?')
                                .split(' ')
                                .slice(0, 2)
                                .map((w) => w[0])
                                .join('')
                                .toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onOpenProfile(client.id)}
                              className="font-bold text-foreground hover:text-primary hover:underline text-left block truncate"
                            >
                              {client.name || 'Unnamed Member'}
                            </button>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${
                                  client.status === 'Active'
                                    ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                                    : client.status === 'Hold'
                                    ? 'border-sky-500/40 text-sky-400 bg-sky-500/10'
                                    : client.status === 'Expired'
                                    ? 'border-red-500/40 text-red-400 bg-red-500/10'
                                    : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                                }`}
                              >
                                {client.status || 'Member'}
                              </Badge>
                              {client.branch && (
                                <span className="text-[11px] text-muted-foreground">{client.branch}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact & Member ID / Barcode */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {client.memberId && (
                              <Badge variant="secondary" className="font-mono text-[11px] font-bold">
                                #{client.memberId}
                              </Badge>
                            )}
                            {barcode && (
                              <Badge variant="outline" className="font-mono text-[10px] gap-1">
                                <Barcode className="h-3 w-3" />
                                {barcode}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs font-mono text-muted-foreground">
                            {client.phone || 'No phone'}
                          </p>
                        </div>
                      </td>

                      {/* Package / Revenue */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5 max-w-[230px]">
                          <p className="font-semibold text-xs truncate">
                            {pendingPkg?.packageName ||
                              client.primaryPackageName ||
                              client.packageType ||
                              '—'}
                          </p>
                          {totalPaid > 0 && (
                            <p className="text-[11px] text-emerald-500 font-mono flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              {totalPaid.toLocaleString()} LE paid
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Context Column: Dates / Birthday / Freeze / Notes */}
                      <td className="py-3 px-3">
                        {activeKey === 'birthdays' && bdayInfo ? (
                          <div className="space-y-0.5">
                            <Badge
                              variant="outline"
                              className={
                                bdayInfo.daysAway === 0
                                  ? 'bg-pink-500/20 text-pink-400 border-pink-500/40 font-bold'
                                  : 'bg-pink-500/10 text-pink-400 border-pink-500/30'
                              }
                            >
                              {bdayInfo.daysAway === 0
                                ? '🎂 Birthday Today!'
                                : bdayInfo.daysAway === 1
                                ? 'Tomorrow'
                                : `In ${bdayInfo.daysAway} days`}
                            </Badge>
                            <p className="text-xs text-muted-foreground font-mono">
                              {bdayInfo.bdayDisplay}
                              {bdayInfo.nextAge ? ` (Turns ${bdayInfo.nextAge})` : ''}
                            </p>
                          </div>
                        ) : activeKey === 'frozen' ? (
                          <div className="space-y-0.5 text-xs">
                            <p className="font-mono">
                              {(client as any).freezeStartDate || '—'} → {(client as any).freezeEndDate || '—'}
                            </p>
                            <p className="text-sky-400 font-semibold">
                              {(client as any).freezeDaysRemaining ?? (client as any).freezeCoins ?? 0} freeze days left
                            </p>
                          </div>
                        ) : activeKey === 'leads' ? (
                          <div className="max-w-[260px] text-xs">
                            {client.comments && client.comments.length > 0 ? (
                              <>
                                <p className="truncate font-medium">
                                  {client.comments[client.comments.length - 1]?.text}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {safeFormatDate(
                                    client.comments[client.comments.length - 1]?.date,
                                    'dd MMM yyyy',
                                    ''
                                  )}{' '}
                                  ({client.comments.length} notes)
                                </p>
                              </>
                            ) : (client as any).legacyNotes ? (
                              <p className="truncate text-muted-foreground">
                                {String((client as any).legacyNotes).slice(0, 80)}
                              </p>
                            ) : (
                              <span className="text-amber-500 font-medium">No follow-up logged yet</span>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5 text-xs">
                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                              <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span>
                                {safeFormatDate(client.startDate, 'dd MMM yy', '—')} →{' '}
                                {safeFormatDate(client.membershipExpiry, 'dd MMM yy', '—')}
                              </span>
                            </div>
                            {daysToExp !== null && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-mono ${
                                  daysToExp < 0
                                    ? 'border-red-500/40 text-red-400 bg-red-500/10'
                                    : daysToExp <= 7
                                    ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                                    : 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                                }`}
                              >
                                {daysToExp < 0
                                  ? `Expired ${Math.abs(daysToExp)}d ago`
                                  : `${daysToExp}d remaining`}
                              </Badge>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Sales Rep / Coach */}
                      <td className="py-3 px-3 text-xs">
                        <p className="font-medium truncate max-w-[160px]">{repName}</p>
                        {trainerName && (
                          <p className="text-[11px] text-emerald-500 truncate max-w-[160px]">
                            Coach: {trainerName}
                          </p>
                        )}
                      </td>

                      {/* Quick Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {activeKey === 'frozen' && onUnfreezeMember && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === client.id}
                              onClick={async () => {
                                setBusyId(client.id);
                                try {
                                  await onUnfreezeMember(client.id, client.name);
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className="h-8 text-xs border-sky-500/40 text-sky-400 hover:bg-sky-500/15"
                            >
                              <Snowflake className="h-3.5 w-3.5 mr-1" />
                              Unfreeze
                            </Button>
                          )}

                          {activeKey === 'unconfirmed' && onConfirmPackage && pendingPkgIndex >= 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === client.id}
                              onClick={async () => {
                                setBusyId(client.id);
                                try {
                                  await onConfirmPackage(client, pendingPkgIndex);
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className="h-8 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Confirm
                            </Button>
                          )}

                          {client.phone && (
                            <>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:border-emerald-500/40"
                                title="Send WhatsApp Message"
                                onClick={() => openWhatsApp(client)}
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </Button>
                              {onCallMember && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-blue-400 hover:border-blue-500/40"
                                  title="Call Member"
                                  onClick={() => onCallMember(client)}
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}

                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => onOpenProfile(client.id)}
                            className="h-8 text-xs font-semibold gap-1"
                          >
                            Profile
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-border/60 bg-muted/20">
            <span className="text-xs text-muted-foreground">
              Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}–
              {Math.min(safePage * ITEMS_PER_PAGE, filteredItems.length)} of{' '}
              {filteredItems.length.toLocaleString()} members
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
              </Button>
              <span className="text-xs font-mono font-semibold px-2">
                Page {safePage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
              >
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
