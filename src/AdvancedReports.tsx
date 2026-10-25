import React, { useEffect, useMemo, useState } from 'react';
import { downloadFile } from './utils/download';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useAppContext } from './context';
import { useAuditLogs } from './hooks/useAuditLogs';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { useSettings } from './contexts/SettingsContext';
import { format, parseISO, isAfter, isBefore, differenceInDays, subDays } from 'date-fns';
import { Download, Star, Users, DollarSign, TrendingUp, UserPlus, Activity, Award, Globe, Briefcase, BarChart3, ShieldAlert, Camera, Search, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { findSimilarPhoneClusters } from './utils/phoneSimilarity';

function inferPackageClassification(
  name: string,
  explicitCategory?: string,
  explicitHierarchy?: 'primary' | 'secondary'
): { packageCategory: string; packageHierarchy: 'primary' | 'secondary' } {
  const n = (name || '').toLowerCase();
  let cat = explicitCategory || 'Membership';
  if (!explicitCategory) {
    if (/\b(pt|personal\s*train|private\s*session|coach)\b/i.test(n)) cat = 'Personal Training';
    else if (/\b(recovery|ice\s*bath|sauna|jacuzzi|massage|cryo)\b/i.test(n)) cat = 'Recovery';
    else if (/\b(physio|rehab)\b/i.test(n)) cat = 'Physiotherapy';
    else if (/\b(nutrition|inbody|diet)\b/i.test(n)) cat = 'Nutrition';
    else if (/\b(boxing)\b/i.test(n)) cat = 'Boxing';
    else if (/\b(mma|kickboxing|bjj|grappling|muay\s*thai)\b/i.test(n)) cat = 'MMA';
    else if (/\b(class|group|spinning|yoga|pilates|crossfit|aerobics|zumba)\b/i.test(n)) cat = 'Group Classes';
    else if (/\b(assessment|fitness\s*test)\b/i.test(n)) cat = 'Assessment';
    else cat = 'Membership';
  }
  const hierarchy: 'primary' | 'secondary' =
    explicitHierarchy || (cat === 'Membership' ? 'primary' : 'secondary');
  return { packageCategory: cat, packageHierarchy: hierarchy };
}

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
  | 'staff-logs'
  | 'similarity-mobile'
  | 'missing-photos';

interface ReportTab {
  id: ReportId;
  label: string;
  icon: React.ElementType;
}

export default function AdvancedReports() {
  const { clients, payments, ptPackageRecords, attendances, users, coaches, branches, packages, fetchExpiredMembers, expiredLoaded, loadingExpired, setActiveTab: setNavTab, setActiveClientId } = useAppContext();
  const { currentUser } = useAuth();
  const { branding } = useSettings();

  const [activeReport, setActiveReport] = useState<ReportId>('expired-members');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [trainerFilter, setTrainerFilter] = useState('all');
  const [packageFilter, setPackageFilter] = useState('all');
  const [hierarchyFilter, setHierarchyFilter] = useState<'all' | 'primary' | 'secondary'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Expired' | 'Active' | 'Hold'>('Expired');
  const [renewalFilter, setRenewalFilter] = useState<'all' | 'OFF' | 'ON'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<
    | 'package-asc'
    | 'package-desc'
    | 'expiry-desc'
    | 'expiry-asc'
    | 'name-asc'
    | 'name-desc'
    | 'id-desc'
    | 'id-asc'
    | 'sales-asc'
  >('expiry-desc');
  const [rowLimit, setRowLimit] = useState<number>(250);

  // Ensure all expired members are loaded when opening Premium Reports
  useEffect(() => {
    if (!expiredLoaded && !loadingExpired && typeof fetchExpiredMembers === 'function') {
      fetchExpiredMembers();
    }
  }, [expiredLoaded, loadingExpired, fetchExpiredMembers]);

  // Audit logs are fetched on-demand (this page mounts lazily). Pass the report's
  // selected date range so the backend filters server-side instead of loading all logs.
  const { auditLogs } = useAuditLogs(currentUser, { dateFrom, dateTo });

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
    { id: 'similarity-mobile', label: 'Phone Similarity (7-Digit)', icon: ShieldAlert },
    { id: 'missing-photos', label: 'Missing Member Photos', icon: Camera },
  ];

  // --- Unique branch list ---
  const branchList = useMemo(() => {
    const set = new Set<string>();
    (clients || []).forEach(c => { if (c.branch) set.add(c.branch); });
    (payments || []).forEach(p => { if (p.branch) set.add(p.branch); });
    return Array.from(set).sort();
  }, [clients, payments]);

  // --- Unique staff (Sales Man) list ---
  const staffList = useMemo(() => {
    const set = new Set<string>();
    (clients || []).forEach(c => {
      if (c.salesName) set.add(c.salesName);
      if (c.salesRep) set.add(c.salesRep);
    });
    (payments || []).forEach(p => { if (p.salesName) set.add(p.salesName); });
    (users || []).forEach(u => {
      const r = String(u.role || '');
      if (u.name && (r === 'rep' || r === 'sales_manager' || r === 'admin' || r === 'manager')) set.add(u.name);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [clients, payments, users]);

  // --- Unique trainer list ---
  const trainerList = useMemo(() => {
    const set = new Set<string>();
    (coaches || []).forEach(c => { if (c.name) set.add(c.name); });
    (users || []).forEach(u => {
      const r = String(u.role || '');
      if (u.name && (r === 'coach' || r === 'trainer' || r === 'fitness_manager')) set.add(u.name);
    });
    (clients || []).forEach(c => {
      if (c.staffAssignments?.coach?.staffName) set.add(c.staffAssignments.coach.staffName);
      if (Array.isArray(c.packages)) {
        c.packages.forEach(p => { if (p.trainerName) set.add(p.trainerName); });
      }
    });
    return Array.from(set).filter(Boolean).sort();
  }, [coaches, users, clients]);

  // --- Unique package list ---
  const packageList = useMemo(() => {
    const set = new Set<string>();
    (packages || []).forEach(p => { if (p.name) set.add(p.name.trim()); });
    (clients || []).forEach(c => {
      if (c.packageType) set.add(c.packageType.trim());
      if (Array.isArray(c.packages)) {
        c.packages.forEach(p => { if (p.packageName) set.add(p.packageName.trim()); });
      }
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [packages, clients]);

  // --- Categories list (matching RedGITS + Inzan package categories) ---
  const categoryList = [
    'Membership',
    'Personal Training',
    'Group Classes',
    'Boxing',
    'MMA',
    'Recovery',
    'Nutrition',
    'Physiotherapy',
    'Assessment',
  ];

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

  // --- Helper: extract package, category, hierarchy, trainer, renewal, and lastCall from client ---
  const getClientReportDetails = (c: any) => {
    const pkgs = Array.isArray(c.packages) ? c.packages : [];
    const primaryPkg = pkgs.find((p: any) => p.packageHierarchy === 'primary') || pkgs[0] || null;
    const pkgName = (c.packageType || primaryPkg?.packageName || '').trim();
    const inferred = inferPackageClassification(
      pkgName,
      primaryPkg?.packageCategory || c.packageCategory,
      primaryPkg?.packageHierarchy || c.packageHierarchy
    );

    const trainerName =
      primaryPkg?.trainerName ||
      pkgs.find((p: any) => p.trainerName)?.trainerName ||
      c.staffAssignments?.coach?.staffName ||
      (c as any).trainerName ||
      '';

    const salesRepName = c.salesName || c.salesRep || (c.assignedTo ? usersMap[c.assignedTo] || c.assignedTo : '') || '';

    const hasActiveRenewal =
      c.status === 'Active' ||
      pkgs.some((p: any) => p.status === 'Active' || p.subscriptionType === 'renewal') ||
      pkgs.length > 1;

    const lastCallText =
      c.lastCall?.text ||
      c.lastCallText ||
      (Array.isArray(c.interactions) && c.interactions[0]?.notes) ||
      c.lastComment?.text ||
      '';
    const lastCallMeta =
      c.lastCall?.date || c.lastCallDate
        ? `${(c.lastCall?.date || c.lastCallDate || '').slice(0, 10)}${c.lastCall?.author || c.lastCallBy ? ` • ${c.lastCall?.author || c.lastCallBy}` : ''}`
        : '';

    return {
      pkgName: pkgName || '—',
      packageHierarchy: inferred.packageHierarchy,
      packageCategory: inferred.packageCategory,
      trainerName,
      salesRepName,
      hasActiveRenewal,
      lastCallText,
      lastCallMeta,
    };
  };

  // --- Helper: date within range ---
  const isInDateRange = (dateStr: any): boolean => {
    const parsed = safeParseDate(dateStr);
    if (!parsed) return !dateFrom && !dateTo;
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
  const matchStaff = (s: string | undefined, alt?: string): boolean => {
    if (staffFilter === 'all') return true;
    const target = staffFilter.toLowerCase();
    return (s || '').toLowerCase() === target || (alt || '').toLowerCase() === target;
  };

  // --- Helper: advanced client filter (Package, Trainer, Type, Category, Gender, Renewal, Search) ---
  const matchesAdvancedClientFilters = (c: any, details = getClientReportDetails(c)): boolean => {
    // Trainer filter
    if (trainerFilter !== 'all') {
      const tLower = trainerFilter.toLowerCase();
      const pkgs = Array.isArray(c.packages) ? c.packages : [];
      const matchesAnyPkgTrainer = pkgs.some((p: any) => (p.trainerName || '').toLowerCase() === tLower);
      if (details.trainerName.toLowerCase() !== tLower && !matchesAnyPkgTrainer) return false;
    }

    // Package filter
    if (packageFilter !== 'all') {
      const pLower = packageFilter.toLowerCase();
      const pkgs = Array.isArray(c.packages) ? c.packages : [];
      const matchesPkgArray = pkgs.some((p: any) => (p.packageName || '').trim().toLowerCase() === pLower);
      if ((c.packageType || '').trim().toLowerCase() !== pLower && !matchesPkgArray) return false;
    }

    // Hierarchy Type filter (Primary Membership vs Secondary Package)
    if (hierarchyFilter !== 'all') {
      const pkgs = Array.isArray(c.packages) ? c.packages : [];
      const matchesPkgHierarchy = pkgs.some((p: any) => {
        const inf = inferPackageClassification(p.packageName || '', p.packageCategory, p.packageHierarchy);
        return inf.packageHierarchy === hierarchyFilter;
      });
      if (details.packageHierarchy !== hierarchyFilter && !matchesPkgHierarchy) return false;
    }

    // Category filter (Membership, Personal Training, Group Classes, Recovery, etc.)
    if (categoryFilter !== 'all') {
      const pkgs = Array.isArray(c.packages) ? c.packages : [];
      const matchesPkgCat = pkgs.some((p: any) => {
        const inf = inferPackageClassification(p.packageName || '', p.packageCategory, p.packageHierarchy);
        return inf.packageCategory.toLowerCase() === categoryFilter.toLowerCase();
      });
      if (details.packageCategory.toLowerCase() !== categoryFilter.toLowerCase() && !matchesPkgCat) return false;
    }

    // Gender (Male / Female) filter
    if (genderFilter !== 'all') {
      if ((c.gender || '').toLowerCase() !== genderFilter.toLowerCase()) return false;
    }

    // Renewal filter (OFF = did not renew, ON = renewed)
    if (renewalFilter !== 'all') {
      if (renewalFilter === 'ON' && !details.hasActiveRenewal) return false;
      if (renewalFilter === 'OFF' && details.hasActiveRenewal) return false;
    }

    // Search query (Name, Member ID, Lead ID, Phone, Package, Sales Rep, Trainer, Last Call)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = [
        c.name,
        c.memberId,
        c.leadId,
        c.redgitsId,
        c.phone,
        details.pkgName,
        details.salesRepName,
        details.trainerName,
        details.lastCallText,
        c.branch,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  };

  // --- Helper: sort client rows by Package, Expiry Date, Name, Member ID, or Sales Rep ---
  const sortClientRows = <T extends any>(rows: T[]): T[] => {
    const copy = [...rows];
    copy.sort((a: any, b: any) => {
      if (sortBy === 'package-asc' || sortBy === 'package-desc') {
        const pkgA = (a.packageType || a.packages?.[0]?.packageName || 'zzz').toLowerCase();
        const pkgB = (b.packageType || b.packages?.[0]?.packageName || 'zzz').toLowerCase();
        const cmp = pkgA.localeCompare(pkgB);
        if (cmp !== 0) return sortBy === 'package-asc' ? cmp : -cmp;
      }
      if (sortBy === 'expiry-desc' || sortBy === 'expiry-asc') {
        const dA = safeParseDate(a.membershipExpiry || a.createdAt)?.getTime() || 0;
        const dB = safeParseDate(b.membershipExpiry || b.createdAt)?.getTime() || 0;
        if (dA !== dB) return sortBy === 'expiry-desc' ? dB - dA : dA - dB;
      }
      if (sortBy === 'name-asc' || sortBy === 'name-desc') {
        const cmp = (a.name || '').localeCompare(b.name || '');
        if (cmp !== 0) return sortBy === 'name-asc' ? cmp : -cmp;
      }
      if (sortBy === 'id-desc' || sortBy === 'id-asc') {
        const idA = Number(String(a.memberId || a.leadId || a.redgitsId || '0').replace(/\D/g, '')) || 0;
        const idB = Number(String(b.memberId || b.leadId || b.redgitsId || '0').replace(/\D/g, '')) || 0;
        if (idA !== idB) return sortBy === 'id-desc' ? idB - idA : idA - idB;
      }
      if (sortBy === 'sales-asc') {
        const sA = (a.salesName || a.salesRep || '').toLowerCase();
        const sB = (b.salesName || b.salesRep || '').toLowerCase();
        const cmp = sA.localeCompare(sB);
        if (cmp !== 0) return cmp;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
    return copy;
  };

  const toggleColumnSort = (col: 'package' | 'expiry' | 'name' | 'id' | 'sales') => {
    if (col === 'package') {
      setSortBy(prev => (prev === 'package-asc' ? 'package-desc' : 'package-asc'));
    } else if (col === 'expiry') {
      setSortBy(prev => (prev === 'expiry-desc' ? 'expiry-asc' : 'expiry-desc'));
    } else if (col === 'name') {
      setSortBy(prev => (prev === 'name-asc' ? 'name-desc' : 'name-asc'));
    } else if (col === 'id') {
      setSortBy(prev => (prev === 'id-desc' ? 'id-asc' : 'id-desc'));
    } else if (col === 'sales') {
      setSortBy('sales-asc');
    }
  };

  // ============================================================
  // 1. Expired Members
  // ============================================================
  const expiredMembersData = useMemo(() => {
    const filtered = (clients || []).filter(c => {
      if (c.status === 'Lead') return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'Hold') {
          if (c.status !== 'Hold' && !(c as any).isFrozen) return false;
        } else if (c.status !== statusFilter) {
          return false;
        }
      }
      if (!isInDateRange(c.membershipExpiry)) return false;
      if (!matchBranch(c.branch)) return false;
      const details = getClientReportDetails(c);
      if (!matchStaff(details.salesRepName, c.salesRep)) return false;
      if (!matchesAdvancedClientFilters(c, details)) return false;
      return true;
    });
    return sortClientRows(filtered);
  }, [
    clients,
    dateFrom,
    dateTo,
    branchFilter,
    staffFilter,
    trainerFilter,
    packageFilter,
    hierarchyFilter,
    statusFilter,
    renewalFilter,
    categoryFilter,
    genderFilter,
    searchQuery,
    sortBy,
    usersMap,
  ]);

  const expiredByPackageChartData = useMemo(() => {
    const map: Record<string, number> = {};
    expiredMembersData.forEach(c => {
      const pkg = c.packageType || c.packages?.[0]?.packageName || 'Unknown';
      map[pkg] = (map[pkg] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));
  }, [expiredMembersData]);

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
    const filtered = (clients || []).filter(c => {
      if (c.status !== 'Active') return false;
      if (!matchBranch(c.branch)) return false;
      const details = getClientReportDetails(c);
      if (!matchStaff(details.salesRepName, c.salesRep)) return false;
      if (!matchesAdvancedClientFilters(c, details)) return false;
      return true;
    });
    return sortClientRows(filtered);
  }, [
    clients,
    branchFilter,
    staffFilter,
    trainerFilter,
    packageFilter,
    hierarchyFilter,
    categoryFilter,
    genderFilter,
    searchQuery,
    sortBy,
    usersMap,
  ]);

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
  // 6. Guest Members (RedGITS REPORTS FOR GUEST + Leads)
  // ============================================================
  const guestMembersData = useMemo(() => {
    const filtered = (clients || []).filter(c => {
      const isGuestOrLead =
        c.status === 'Lead' ||
        (c.typeOfClient && c.typeOfClient.toLowerCase().includes('guest'));
      if (!isGuestOrLead) return false;
      if (!isInDateRange(c.createdAt)) return false;
      if (!matchBranch(c.branch)) return false;
      const details = getClientReportDetails(c);
      if (!matchStaff(details.salesRepName, c.salesRep)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = [
          c.name,
          c.leadId,
          c.redgitsId,
          c.phone,
          details.salesRepName,
          c.comeFromType,
          c.source,
          details.lastCallText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortClientRows(filtered);
  }, [clients, dateFrom, dateTo, branchFilter, staffFilter, searchQuery, sortBy, usersMap]);

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
    const directLeads = (clients || []).filter(c => {
      if (!c.referredBy && !c.referredByName) return false;
      if (!matchBranch(c.branch)) return false;
      return true;
    });
    const seenPhones = new Set(directLeads.map(c => String(c.phone || '').replace(/\D/g, '').slice(-10)));
    const embeddedRefs: any[] = [];
    (clients || []).forEach(host => {
      if (!matchBranch(host.branch)) return;
      const refs = Array.isArray((host as any).referrals) ? (host as any).referrals : [];
      refs.forEach((r: any) => {
        const cleanP = String(r.phone || '').replace(/\D/g, '').slice(-10);
        if (cleanP && seenPhones.has(cleanP)) return;
        if (cleanP) seenPhones.add(cleanP);
        embeddedRefs.push({
          id: r.leadClientId || r.id || `ref-${host.id}-${cleanP}`,
          name: r.name || 'Referred Friend',
          phone: r.phone || '—',
          status: 'Lead',
          stage: 'New',
          source: 'Referral',
          referredBy: host.id,
          referredByName: r.referredByName || host.name,
          branch: host.branch || 'Garden 8',
          createdAt: r.createdAt || host.createdAt,
        });
      });
    });
    return [...directLeads, ...embeddedRefs];
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

  const openAccountDetails = (clientId?: string) => {
    if (!clientId) return;
    if (typeof setActiveClientId === 'function' && typeof setNavTab === 'function') {
      setActiveClientId(clientId);
      setNavTab('clients');
    }
  };

  const resetAllFilters = () => {
    setDateFrom('');
    setDateTo('');
    setBranchFilter('all');
    setStaffFilter('all');
    setTrainerFilter('all');
    setPackageFilter('all');
    setHierarchyFilter('all');
    setStatusFilter('Expired');
    setRenewalFilter('all');
    setCategoryFilter('all');
    setGenderFilter('all');
    setSearchQuery('');
    setSortBy('expiry-desc');
  };

  // --- Filter Row component ---
  const FilterRow = ({
    showStaff = false,
    showDateRange = true,
    showAdvancedMemberFilters = false,
    showSearchAndSort = false,
    showStatusAndRenewal = false,
  }: {
    showStaff?: boolean;
    showDateRange?: boolean;
    showAdvancedMemberFilters?: boolean;
    showSearchAndSort?: boolean;
    showStatusAndRenewal?: boolean;
  }) => (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 mb-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {(showSearchAndSort || showAdvancedMemberFilters) && (
          <div className="space-y-1 flex-1 min-w-[220px]">
            <label className="text-xs font-medium text-muted-foreground">Search (Name, ID, Phone, Package, Call)</label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search member name, ID, phone, package..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9 bg-background text-xs"
              />
            </div>
          </div>
        )}
        {showDateRange && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-38 h-9 bg-background text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-38 h-9 bg-background text-xs" />
            </div>
          </>
        )}
        {showStaff && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sales Man</label>
            <Select value={staffFilter} onValueChange={v => setStaffFilter(v || 'all')}>
              <SelectTrigger className="w-44 h-9 bg-background text-xs">
                <SelectValue placeholder="All Sales Reps" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All</SelectItem>
                {staffList.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {showAdvancedMemberFilters && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Trainer Name</label>
              <Select value={trainerFilter} onValueChange={v => setTrainerFilter(v || 'all')}>
                <SelectTrigger className="w-44 h-9 bg-background text-xs">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">ALL</SelectItem>
                  {trainerList.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Package</label>
              <Select value={packageFilter} onValueChange={v => setPackageFilter(v || 'all')}>
                <SelectTrigger className="w-52 h-9 bg-background text-xs">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="all">ALL Packages ({packageList.length})</SelectItem>
                  {packageList.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={hierarchyFilter} onValueChange={v => setHierarchyFilter((v as any) || 'all')}>
                <SelectTrigger className="w-44 h-9 bg-background text-xs">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL (Primary & Secondary)</SelectItem>
                  <SelectItem value="primary">Primary Membership</SelectItem>
                  <SelectItem value="secondary">Secondary Package</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {showStatusAndRenewal && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={v => setStatusFilter((v as any) || 'all')}>
                <SelectTrigger className="w-36 h-9 bg-background text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Hold">Hold / Frozen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Renewal</label>
              <Select value={renewalFilter} onValueChange={v => setRenewalFilter((v as any) || 'all')}>
                <SelectTrigger className="w-36 h-9 bg-background text-xs">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  <SelectItem value="OFF">OFF (Did Not Renew)</SelectItem>
                  <SelectItem value="ON">ON (Renewed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {showAdvancedMemberFilters && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Categories</label>
              <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v || 'all')}>
                <SelectTrigger className="w-44 h-9 bg-background text-xs">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  {categoryList.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Male / Female</label>
              <Select value={genderFilter} onValueChange={v => setGenderFilter(v || 'all')}>
                <SelectTrigger className="w-36 h-9 bg-background text-xs">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Branch</label>
          <Select value={branchFilter} onValueChange={v => setBranchFilter(v || 'all')}>
            <SelectTrigger className="w-40 h-9 bg-background text-xs">
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
        {(showSearchAndSort || showAdvancedMemberFilters) && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sort By</label>
            <Select value={sortBy} onValueChange={v => setSortBy((v as any) || 'expiry-desc')}>
              <SelectTrigger className="w-48 h-9 bg-background text-xs font-semibold">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="package-asc">Package (A → Z)</SelectItem>
                <SelectItem value="package-desc">Package (Z → A)</SelectItem>
                <SelectItem value="expiry-desc">Expiry Date (Newest)</SelectItem>
                <SelectItem value="expiry-asc">Expiry Date (Oldest)</SelectItem>
                <SelectItem value="id-desc">Member ID (High → Low)</SelectItem>
                <SelectItem value="id-asc">Member ID (Low → High)</SelectItem>
                <SelectItem value="name-asc">Name (A → Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z → A)</SelectItem>
                <SelectItem value="sales-asc">Sales Rep (A → Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={resetAllFilters}
        >
          Clear Filters
        </Button>
      </div>
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

  const Th = ({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
    <th
      onClick={onClick}
      className={`px-3 py-2 text-left text-xs font-semibold text-muted-foreground bg-muted/50 whitespace-nowrap ${onClick ? 'cursor-pointer hover:text-foreground select-none' : ''} ${className}`}
    >
      {children}
    </th>
  );

  const SortIndicator = ({ activeAsc, activeDesc }: { activeAsc: boolean; activeDesc: boolean }) => {
    if (activeAsc) return <ArrowUp className="inline h-3 w-3 ml-1 text-primary" />;
    if (activeDesc) return <ArrowDown className="inline h-3 w-3 ml-1 text-primary" />;
    return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
  };

  const Td = ({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) => (
    <td title={title} className={`px-3 py-2 whitespace-nowrap text-foreground ${className}`}>
      {children}
    </td>
  );

  // ============================================================
  // Report renderers
  // ============================================================

  const renderExpiredMembers = () => (
    <>
      <FilterRow
        showStaff
        showDateRange
        showAdvancedMemberFilters
        showSearchAndSort
        showStatusAndRenewal
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">
            {expiredMembersData.length} {statusFilter === 'all' ? 'matching members' : `${statusFilter.toLowerCase()} members`}
          </Badge>
          {loadingExpired && (
            <Badge variant="outline" className="text-xs gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Loading full expired members archive...
            </Badge>
          )}
          {packageFilter !== 'all' && (
            <Badge variant="outline" className="text-xs border-primary/40 text-primary">
              Package: {packageFilter}
            </Badge>
          )}
          {categoryFilter !== 'all' && (
            <Badge variant="outline" className="text-xs">
              Category: {categoryFilter}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(rowLimit)} onValueChange={v => setRowLimit(Number(v) || 250)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="Rows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="100">Show 100</SelectItem>
              <SelectItem value="250">Show 250</SelectItem>
              <SelectItem value="500">Show 500</SelectItem>
              <SelectItem value="1000">Show 1,000</SelectItem>
              <SelectItem value="10000">Show All</SelectItem>
            </SelectContent>
          </Select>
          <ExportMenu
            data={expiredMembersData.map(c => {
              const d = getClientReportDetails(c);
              return {
                Name: c.name,
                MemberId: c.memberId || '',
                Phone: c.phone || '',
                Gender: c.gender || '',
                Package: d.pkgName,
                Category: d.packageCategory,
                Type: d.packageHierarchy === 'primary' ? 'Primary Membership' : 'Secondary Package',
                Status: c.status,
                Renewal: d.hasActiveRenewal ? 'ON' : 'OFF',
                ExpiryDate: formatDate(c.membershipExpiry),
                SalesRep: d.salesRepName,
                Trainer: d.trainerName,
                LastCall: d.lastCallText,
                Branch: c.branch || '',
              };
            })}
            filename="expired_members"
          >
            <Download className="h-4 w-4 mr-1" /> Export ({expiredMembersData.length})
          </ExportMenu>
        </div>
      </div>
      {expiredMembersData.length === 0 ? <EmptyState message="No matching members found for the selected filters." /> : (
        <>
          <TableWrapper>
            <thead>
              <tr>
                <Th onClick={() => toggleColumnSort('name')}>
                  Name <SortIndicator activeAsc={sortBy === 'name-asc'} activeDesc={sortBy === 'name-desc'} />
                </Th>
                <Th onClick={() => toggleColumnSort('id')}>
                  Member ID <SortIndicator activeAsc={sortBy === 'id-asc'} activeDesc={sortBy === 'id-desc'} />
                </Th>
                <Th>Phone</Th>
                <Th onClick={() => toggleColumnSort('package')}>
                  Package <SortIndicator activeAsc={sortBy === 'package-asc'} activeDesc={sortBy === 'package-desc'} />
                </Th>
                <Th>Type / Category</Th>
                <Th onClick={() => toggleColumnSort('expiry')}>
                  Expiry Date <SortIndicator activeAsc={sortBy === 'expiry-asc'} activeDesc={sortBy === 'expiry-desc'} />
                </Th>
                <Th onClick={() => toggleColumnSort('sales')}>
                  Sales Rep <SortIndicator activeAsc={sortBy === 'sales-asc'} activeDesc={false} />
                </Th>
                <Th>Trainer</Th>
                <Th>Last Call / Note</Th>
                <Th>Branch</Th>
              </tr>
            </thead>
            <tbody>
              {expiredMembersData.slice(0, rowLimit).map((c, i) => {
                const d = getClientReportDetails(c);
                return (
                  <tr key={c.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <Td className="font-medium">
                      <button
                        type="button"
                        onClick={() => openAccountDetails(c.id)}
                        className="text-left font-semibold text-foreground hover:text-primary hover:underline cursor-pointer"
                      >
                        {c.name}
                      </button>
                      {c.gender && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">({c.gender})</span>
                      )}
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => openAccountDetails(c.id)}
                        className="font-mono text-xs text-primary hover:underline cursor-pointer"
                      >
                        {c.memberId || '—'}
                      </button>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => openAccountDetails(c.id)}
                        className="hover:text-primary hover:underline cursor-pointer"
                      >
                        {c.phone || '—'}
                      </button>
                    </Td>
                    <Td>
                      <Badge variant="outline" className="text-xs font-semibold">
                        {d.pkgName}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {d.packageHierarchy === 'primary' ? 'Primary' : 'Secondary'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{d.packageCategory}</span>
                      </div>
                    </Td>
                    <Td>{formatDate(c.membershipExpiry)}</Td>
                    <Td>{d.salesRepName || '—'}</Td>
                    <Td>{d.trainerName || '—'}</Td>
                    <Td className="max-w-[220px] truncate" title={d.lastCallText}>
                      {d.lastCallText ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-medium truncate">{d.lastCallText}</span>
                          {d.lastCallMeta && <span className="text-[10px] text-muted-foreground">{d.lastCallMeta}</span>}
                        </div>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>{c.branch || '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrapper>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {expiredByPackageChartData.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-foreground">Members by Package (Top 12)</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={expiredByPackageChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {expiredByPackageChartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {expiredChartData.length > 0 && (
              <div>
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
          </div>
        </>
      )}
    </>
  );

  const renderPackageMembers = () => (
    <>
      <FilterRow
        showStaff
        showDateRange={false}
        showAdvancedMemberFilters
        showSearchAndSort
      />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{packageMembersData.length} active members</Badge>
        <ExportMenu data={
          packageMembersData.map(c => {
            const d = getClientReportDetails(c);
            return {
              Name: c.name,
              MemberId: c.memberId,
              Phone: c.phone,
              Package: d.pkgName,
              Category: d.packageCategory,
              Type: d.packageHierarchy === 'primary' ? 'Primary Membership' : 'Secondary Package',
              StartDate: formatDate(c.startDate),
              EndDate: formatDate(c.membershipExpiry),
              Sessions: c.sessionsRemaining,
              SalesRep: d.salesRepName,
              Trainer: d.trainerName,
              Branch: c.branch,
            };
          })} filename="package_members"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
      </div>
      {packageMembersData.length === 0 ? <EmptyState message="No active members found." /> : (
        <>
          <TableWrapper>
            <thead><tr>
              <Th onClick={() => toggleColumnSort('name')}>
                Name <SortIndicator activeAsc={sortBy === 'name-asc'} activeDesc={sortBy === 'name-desc'} />
              </Th>
              <Th onClick={() => toggleColumnSort('id')}>
                Member ID <SortIndicator activeAsc={sortBy === 'id-asc'} activeDesc={sortBy === 'id-desc'} />
              </Th>
              <Th>Phone</Th>
              <Th onClick={() => toggleColumnSort('package')}>
                Package <SortIndicator activeAsc={sortBy === 'package-asc'} activeDesc={sortBy === 'package-desc'} />
              </Th>
              <Th>Type / Category</Th>
              <Th>Start</Th>
              <Th onClick={() => toggleColumnSort('expiry')}>
                End <SortIndicator activeAsc={sortBy === 'expiry-asc'} activeDesc={sortBy === 'expiry-desc'} />
              </Th>
              <Th>Sessions</Th>
              <Th onClick={() => toggleColumnSort('sales')}>Sales Rep</Th>
              <Th>Branch</Th>
            </tr></thead>
            <tbody>
              {packageMembersData.slice(0, rowLimit).map((c, i) => {
                const d = getClientReportDetails(c);
                return (
                  <tr key={c.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <Td className="font-medium">
                      <button
                        type="button"
                        onClick={() => openAccountDetails(c.id)}
                        className="text-left font-semibold text-foreground hover:text-primary hover:underline cursor-pointer"
                      >
                        {c.name}
                      </button>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => openAccountDetails(c.id)}
                        className="font-mono text-xs text-primary hover:underline cursor-pointer"
                      >
                        {c.memberId || '—'}
                      </button>
                    </Td>
                    <Td>{c.phone || '—'}</Td>
                    <Td><Badge variant="outline" className="text-xs">{d.pkgName}</Badge></Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {d.packageHierarchy === 'primary' ? 'Primary' : 'Secondary'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{d.packageCategory}</span>
                      </div>
                    </Td>
                    <Td>{formatDate(c.startDate)}</Td>
                    <Td>{formatDate(c.membershipExpiry)}</Td>
                    <Td>{c.sessionsRemaining ?? '—'}</Td>
                    <Td>{d.salesRepName || '—'}</Td>
                    <Td>{c.branch || '—'}</Td>
                  </tr>
                );
              })}
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
          <ExportMenu data={
            incomeByServiceData.map(d => ({ Category: d.name, Revenue: d.value }))} filename="income_by_service"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          staffInvitationsData.map(d => ({ SalesRep: d.salesRep, Total: d.total, Active: d.active, Expired: d.expired }))} filename="staff_invitations"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          notActiveMembersData.map(c => ({
            Name: c.name, MemberId: c.memberId, Phone: c.phone, Package: c.packageType,
            LastAttendance: c.lastAttendance ? formatDate(c.lastAttendance) : 'Never', Branch: c.branch,
          }))} filename="not_active_members"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
      </div>
      {notActiveMembersData.length === 0 ? <EmptyState message="All active members have recent attendance." /> : (
        <TableWrapper>
          <thead><tr>
            <Th>Name</Th><Th>Member ID</Th><Th>Phone</Th><Th>Package</Th><Th>Last Attendance</Th><Th>Branch</Th>
          </tr></thead>
          <tbody>
            {notActiveMembersData.slice(0, 200).map((c, i) => (
              <tr key={c.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td className="font-medium">
                  <button
                    type="button"
                    onClick={() => openAccountDetails(c.id)}
                    className="text-left font-semibold text-foreground hover:text-primary hover:underline cursor-pointer"
                  >
                    {c.name}
                  </button>
                </Td>
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
      <FilterRow showStaff showDateRange showSearchAndSort />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{guestMembersData.length} guest / lead members</Badge>
        <ExportMenu
          data={guestMembersData.map(c => {
            const d = getClientReportDetails(c);
            return {
              Code: c.leadId || c.redgitsId || '',
              MemberName: c.name,
              Phone: c.phone || '',
              SalesMan: d.salesRepName,
              ComeFrom: c.comeFromType || '',
              Source: c.source || '',
              Date: formatDate(c.createdAt),
              LastCall: d.lastCallText,
              LastCallMeta: d.lastCallMeta,
            };
          })}
          filename="guest_members"
        >
          <Download className="h-4 w-4 mr-1" /> Export
        </ExportMenu>
      </div>
      {guestMembersData.length === 0 ? <EmptyState message="No guest members found." /> : (
        <TableWrapper>
          <thead>
            <tr>
              <Th onClick={() => toggleColumnSort('id')}>Code</Th>
              <Th onClick={() => toggleColumnSort('name')}>Member Name</Th>
              <Th>Phone</Th>
              <Th onClick={() => toggleColumnSort('sales')}>Sales Man</Th>
              <Th>Come From</Th>
              <Th>Source</Th>
              <Th onClick={() => toggleColumnSort('expiry')}>Date</Th>
              <Th>Last Call</Th>
            </tr>
          </thead>
          <tbody>
            {guestMembersData.slice(0, rowLimit).map((c, i) => {
              const d = getClientReportDetails(c);
              return (
                <tr key={c.id || i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <Td>
                    <button
                      type="button"
                      onClick={() => openAccountDetails(c.id)}
                      className="font-mono text-xs text-primary hover:underline cursor-pointer"
                    >
                      {c.leadId || c.redgitsId || '—'}
                    </button>
                  </Td>
                  <Td className="font-medium">
                    <button
                      type="button"
                      onClick={() => openAccountDetails(c.id)}
                      className="text-left font-semibold text-foreground hover:text-primary hover:underline cursor-pointer"
                    >
                      {c.name}
                    </button>
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => openAccountDetails(c.id)}
                      className="hover:text-primary hover:underline cursor-pointer"
                    >
                      {c.phone || '—'}
                    </button>
                  </Td>
                  <Td>{d.salesRepName || '—'}</Td>
                  <Td>{c.comeFromType || '—'}</Td>
                  <Td>{c.source || '—'}</Td>
                  <Td>{formatDate(c.createdAt)}</Td>
                  <Td className="max-w-[260px] truncate" title={d.lastCallText}>
                    {d.lastCallText ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground truncate">{d.lastCallText}</span>
                        {d.lastCallMeta && <span className="text-[10px] text-muted-foreground">{d.lastCallMeta}</span>}
                      </div>
                    ) : (
                      '—'
                    )}
                  </Td>
                </tr>
              );
            })}
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
        <ExportMenu data={
          marketingReportData.map(d => ({ Source: d.source, Total: d.total, Active: d.active, Expired: d.expired, ConversionRate: d.conversionRate }))} filename="marketing_report"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          marketingByPackageData.map(d => ({ Source: d.source, Package: d.packageType, Count: d.count, Revenue: d.revenue }))} filename="marketing_by_package"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          packageUpgradesData.map(p => ({
            Client: p.client_name, PreviousPackage: p.previousPackageName, NewPackage: p.packageType,
            Amount: p.amount_paid || p.amount, Date: formatDate(p.date || p.created_at), SalesRep: p.salesName,
          }))} filename="package_upgrades"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          trainerExerciseData.map(d => ({ Trainer: d.trainerName, Total: d.total, Attended: d.attended, NoShow: d.noShow, Cancelled: d.cancelled }))} filename="trainer_exercise"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          topActivityData.map(d => ({ Day: d.day, CheckIns: d.checkIns }))} filename="top_activity"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          memberAttendanceData.map(d => ({ Name: d.name, MemberId: d.memberId, TotalAttendances: d.totalAttendances, LastAttendance: d.lastAttendance ? formatDate(d.lastAttendance) : 'N/A' }))} filename="member_attendance"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          memberPointsData.map(d => ({ Rank: d.rank, Name: d.name, MemberId: d.memberId, Points: d.points, Package: d.packageType, Branch: d.branch }))} filename="member_points"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          referralsData.map(c => ({ Member: c.name, ReferredBy: c.referredByName || c.referredBy, DateJoined: formatDate(c.createdAt), Package: c.packageType }))} filename="referrals"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          nationalMembersData.map(d => ({ Nationality: d.nationality, Count: d.count, Percentage: d.percentage }))} filename="national_members"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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
        <ExportMenu data={
          staffLogsData.map(l => ({ Date: formatDateTime(l.timestamp), User: l.userName, Action: l.action, EntityType: l.entityType, Details: l.details }))} filename="staff_logs"><Download className="h-4 w-4 mr-1" /> Export</ExportMenu>
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

  const similarityClusters = useMemo(() => {
    const filteredClients = (clients || []).filter(c => matchBranch(c.branch));
    return findSimilarPhoneClusters(filteredClients, 7);
  }, [clients, branchFilter]);

  const missingPhotosData = useMemo(() => {
    return (clients || []).filter(c => {
      if (c.isDeleted) return false;
      if (!matchBranch(c.branch)) return false;
      const status = (c.status || '').toLowerCase();
      if (status === 'lead') return false;
      return !c.photoURL || !String(c.photoURL).trim();
    });
  }, [clients, branchFilter]);

  const renderSimilarityMobile = () => {
    const flattenedExport = similarityClusters.flatMap(cluster =>
      cluster.members.map(m => ({
        Shared7Digits: cluster.shared7Digits,
        MemberID: m.memberId,
        Name: m.name,
        Phone: m.phone,
        BackupPhone: m.backupPhone || '—',
        Status: m.status,
        Branch: m.branch || '—',
        SalesRep: m.salesRep || '—',
      }))
    );
    return (
      <>
        <FilterRow />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="destructive">{similarityClusters.length} similar 7-digit clusters</Badge>
            <span className="text-xs text-muted-foreground">
              Flags distinct members sharing 7 consecutive digits across Mobile 1 or Mobile 2
            </span>
          </div>
          <ExportMenu data={flattenedExport} filename="phone_similarity_7digit">
            <Download className="h-4 w-4 mr-1" /> Export
          </ExportMenu>
        </div>
        {similarityClusters.length === 0 ? (
          <EmptyState message="No 7-digit consecutive phone similarity conflicts detected." />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Shared 7 Digits</Th>
                <Th>Matched Accounts</Th>
                <Th>Phones (Primary / Backup)</Th>
                <Th>Status & Branch</Th>
              </tr>
            </thead>
            <tbody>
              {similarityClusters.map(cluster => (
                <tr key={cluster.clusterKey} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <Td className="font-mono font-bold text-rose-600">*{cluster.shared7Digits}*</Td>
                  <Td>
                    <div className="space-y-1">
                      {cluster.members.map(m => (
                        <div key={m.id} className="text-xs font-semibold">
                          #{m.memberId} — {m.name}
                        </div>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <div className="space-y-1 font-mono text-xs">
                      {cluster.members.map(m => (
                        <div key={m.id}>
                          {m.phone} {m.backupPhone ? `/ ${m.backupPhone}` : ''}
                        </div>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <div className="space-y-1">
                      {cluster.members.map(m => (
                        <div key={m.id} className="flex items-center gap-1.5 text-xs">
                          <Badge variant="outline" className="text-[10px]">{m.status}</Badge>
                          <span className="text-muted-foreground">{m.branch || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </>
    );
  };

  const renderMissingPhotos = () => (
    <>
      <FilterRow />
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary">{missingPhotosData.length} members missing profile photo</Badge>
        <ExportMenu
          data={missingPhotosData.map(c => ({
            MemberID: c.memberId || c.id,
            Name: c.name,
            Phone: c.phone,
            Status: c.status,
            Package: c.packageType || '—',
            Branch: c.branch || '—',
          }))}
          filename="missing_member_photos"
        >
          <Download className="h-4 w-4 mr-1" /> Export
        </ExportMenu>
      </div>
      {missingPhotosData.length === 0 ? (
        <EmptyState message="All members have profile photos uploaded!" />
      ) : (
        <TableWrapper>
          <thead>
            <tr>
              <Th>Member ID</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>Package</Th>
              <Th>Branch</Th>
            </tr>
          </thead>
          <tbody>
            {missingPhotosData.slice(0, 200).map(c => (
              <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <Td className="font-mono text-xs">#{c.memberId || c.id.slice(0, 6)}</Td>
                <Td className="font-medium">{c.name}</Td>
                <Td className="font-mono text-xs">{c.phone || '—'}</Td>
                <Td><Badge variant="outline" className="text-xs">{c.status}</Badge></Td>
                <Td>{c.packageType || '—'}</Td>
                <Td>{c.branch || '—'}</Td>
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
      case 'similarity-mobile': return renderSimilarityMobile();
      case 'missing-photos': return renderMissingPhotos();
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
