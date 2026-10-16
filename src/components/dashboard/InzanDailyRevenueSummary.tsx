import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CreditCard,
  Smartphone,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Receipt,
  Layers,
  Tag,
  User as UserIcon,
  Clock,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Payment, User } from '../../types';
import { safeFormatDate, safeAddDays, safeFormatTime, toValidDate } from '../../utils/dateUtils';
import { resolvePaymentCategory } from '../../utils/paymentCategories';

const PAYMENT_METHODS = ['Cash', 'Credit Card', 'Instapay', 'Bank Transfer'] as const;
type SummaryMethod = (typeof PAYMENT_METHODS)[number];

const PACKAGE_CATEGORIES = ['Memberships', 'PT', 'Classes', 'Other'] as const;
type SummaryCategory = (typeof PACKAGE_CATEGORIES)[number];

interface DaySummary {
  dateStr: string;
  displayDate: string;
  totalRevenue: number;
  transactionCount: number;
  byMethod: Record<SummaryMethod, { amount: number; count: number }>;
  byCategory: Record<SummaryCategory, { amount: number; count: number }>;
  payments: Payment[];
}

function getPaymentAmount(p: Payment): number {
  return Number(p.amount_paid ?? p.amount) || 0;
}

function getPaymentDateKey(p: Payment): string {
  const raw = p.date || p.created_at;
  return safeFormatDate(raw, 'yyyy-MM-dd', '');
}

function normalizeMethodBucket(method?: string): SummaryMethod {
  const lower = (method || '').trim().toLowerCase();
  if (lower === 'credit card' || lower === 'card' || lower === 'visa') return 'Credit Card';
  if (lower === 'instapay' || lower === 'insta pay') return 'Instapay';
  if (lower === 'bank transfer' || lower === 'bank' || lower === 'transfer') return 'Bank Transfer';
  return 'Cash';
}

function normalizeCategoryBucket(p: Payment): SummaryCategory {
  const rawCat = (p.package_category_type || '').trim();
  if (rawCat === 'PT' || rawCat === 'Private Training') return 'PT';
  if (rawCat === 'Classes' || rawCat === 'Group Training') return 'Classes';
  if (rawCat === 'Physio' || rawCat === 'Nutrition' || rawCat === 'Other') return 'Other';

  const resolved = resolvePaymentCategory(p.packageType || '');
  if (resolved === 'PT') return 'PT';
  if (resolved === 'Classes') return 'Classes';
  if (resolved === 'Physio' || resolved === 'Nutrition') return 'Other';

  if (rawCat === 'Memberships') return 'Memberships';
  const pkgLower = (p.packageType || '').toLowerCase();
  if (
    pkgLower.includes('other') ||
    pkgLower.includes('merch') ||
    pkgLower.includes('freeze') ||
    pkgLower.includes('inbody') ||
    pkgLower.includes('supplement')
  ) {
    return 'Other';
  }
  return 'Memberships';
}

function buildDaySummary(dateObj: Date, validPayments: Payment[]): DaySummary {
  const dateStr = safeFormatDate(dateObj, 'yyyy-MM-dd', '');
  const displayDate = safeFormatDate(dateObj, 'EEE, MMM d, yyyy', dateStr);

  const byMethod: Record<SummaryMethod, { amount: number; count: number }> = {
    Cash: { amount: 0, count: 0 },
    'Credit Card': { amount: 0, count: 0 },
    Instapay: { amount: 0, count: 0 },
    'Bank Transfer': { amount: 0, count: 0 },
  };

  const byCategory: Record<SummaryCategory, { amount: number; count: number }> = {
    Memberships: { amount: 0, count: 0 },
    PT: { amount: 0, count: 0 },
    Classes: { amount: 0, count: 0 },
    Other: { amount: 0, count: 0 },
  };

  const dayPayments = validPayments
    .filter(p => getPaymentDateKey(p) === dateStr)
    .sort((a, b) => {
      const tA = toValidDate(a.created_at || a.date)?.getTime() || 0;
      const tB = toValidDate(b.created_at || b.date)?.getTime() || 0;
      return tB - tA;
    });

  let totalRevenue = 0;

  for (const p of dayPayments) {
    const amt = getPaymentAmount(p);
    totalRevenue += amt;

    const mBucket = normalizeMethodBucket(p.method);
    byMethod[mBucket].amount += amt;
    byMethod[mBucket].count += 1;

    const cBucket = normalizeCategoryBucket(p);
    byCategory[cBucket].amount += amt;
    byCategory[cBucket].count += 1;
  }

  return {
    dateStr,
    displayDate,
    totalRevenue,
    transactionCount: dayPayments.length,
    byMethod,
    byCategory,
    payments: dayPayments,
  };
}

function getMethodIcon(method: SummaryMethod) {
  switch (method) {
    case 'Cash':
      return <Banknote className="w-3.5 h-3.5 text-emerald-500" />;
    case 'Credit Card':
      return <CreditCard className="w-3.5 h-3.5 text-blue-500" />;
    case 'Instapay':
      return <Smartphone className="w-3.5 h-3.5 text-purple-500" />;
    case 'Bank Transfer':
      return <Building2 className="w-3.5 h-3.5 text-amber-500" />;
  }
}

function getCategoryBadgeClasses(category: SummaryCategory): string {
  switch (category) {
    case 'Memberships':
      return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
    case 'PT':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    case 'Classes':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    case 'Other':
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
  }
}

export function InzanDailyRevenueSummary({
  payments,
  users = [],
}: {
  payments: Payment[];
  users?: User[];
}) {
  const [selectedTab, setSelectedTab] = useState<'today' | 'yesterday'>('today');

  // Package target attribution: this month's revenue per target team.
  const teamTargets = useMemo(() => {
    const monthKey = safeFormatDate(new Date(), 'yyyy-MM');
    const teams: Record<string, { revenue: number; count: number }> = {
      Sales: { revenue: 0, count: 0 },
      PT: { revenue: 0, count: 0 },
      'Class Instructors': { revenue: 0, count: 0 },
      Nutrition: { revenue: 0, count: 0 },
    };
    for (const p of payments) {
      if (p.deleted_at || (p.status && p.status !== 'paid')) continue;
      const d = p.date || p.created_at;
      if (!d || safeFormatDate(d, 'yyyy-MM') !== monthKey) continue;
      let team = (p as Payment & { targetTeam?: string }).targetTeam;
      if (!team) {
        const cat = resolvePaymentCategory(p.packageType || '');
        team = cat === 'PT' ? 'PT' : cat === 'Classes' ? 'Class Instructors' : cat === 'Nutrition' ? 'Nutrition' : 'Sales';
      }
      const bucket = teams[team] || (teams[team] = { revenue: 0, count: 0 });
      bucket.revenue += Number(p.amount_paid ?? p.amount) || 0;
      bucket.count += 1;
    }
    return Object.entries(teams);
  }, [payments]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      if (u.id) map.set(u.id, u.name);
      if (u.email) map.set(u.email, u.name);
    }
    return map;
  }, [users]);

  const { todaySummary, yesterdaySummary, deltaPercent, deltaDiff } = useMemo(() => {
    const now = new Date();
    const yesterday = safeAddDays(now, -1);

    const validPayments = (payments || []).filter(
      p => !p.deleted_at && (!p.status || p.status === 'paid')
    );

    const todaySum = buildDaySummary(now, validPayments);
    const yesterdaySum = buildDaySummary(yesterday, validPayments);

    const diff = todaySum.totalRevenue - yesterdaySum.totalRevenue;
    let pct: number | null = null;
    if (yesterdaySum.totalRevenue > 0) {
      pct = ((todaySum.totalRevenue - yesterdaySum.totalRevenue) / yesterdaySum.totalRevenue) * 100;
    } else if (todaySum.totalRevenue > 0) {
      pct = 100;
    } else {
      pct = 0;
    }

    return {
      todaySummary: todaySum,
      yesterdaySummary: yesterdaySum,
      deltaPercent: pct,
      deltaDiff: diff,
    };
  }, [payments]);

  const resolveRecordedBy = (p: Payment): string => {
    if (p.recordedBy && userMap.has(p.recordedBy)) {
      return userMap.get(p.recordedBy)!;
    }
    if (p.salesName && p.salesName.trim()) {
      return p.salesName.trim();
    }
    if (p.sales_rep_id && userMap.has(p.sales_rep_id)) {
      return userMap.get(p.sales_rep_id)!;
    }
    return p.recordedBy || p.sales_rep_id || 'System';
  };

  const formatDiscount = (p: Payment): string => {
    const val = Number(p.discountValue) || 0;
    if (val > 0) {
      const label =
        p.discountType === 'percentage'
          ? `${val}% OFF`
          : `${val.toLocaleString()} LE OFF`;
      return p.discountReason ? `${label} (${p.discountReason})` : label;
    }
    const orig = Number(p.originalAmount) || 0;
    const paid = getPaymentAmount(p);
    if (orig > paid && paid >= 0) {
      return `${(orig - paid).toLocaleString()} LE OFF`;
    }
    return '—';
  };

  const activePayments = selectedTab === 'today' ? todaySummary.payments : yesterdaySummary.payments;
  const activeDateLabel =
    selectedTab === 'today'
      ? `Today (${todaySummary.displayDate})`
      : `Yesterday (${yesterdaySummary.displayDate})`;

  const renderSummaryCard = (
    title: string,
    subtitle: string,
    summary: DaySummary,
    isToday: boolean
  ) => {
    const isActive = (isToday && selectedTab === 'today') || (!isToday && selectedTab === 'yesterday');

    return (
      <div
        onClick={() => setSelectedTab(isToday ? 'today' : 'yesterday')}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedTab(isToday ? 'today' : 'yesterday');
          }
        }}
        className={`rounded-2xl border p-5 transition-all cursor-pointer ${
          isActive
            ? 'border-indigo-500/50 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.06] shadow-sm'
            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  isToday ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400 dark:bg-slate-500'
                }`}
              />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {title}
              </h4>
            </div>
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {summary.displayDate}
            </p>
          </div>

          {isToday ? (
            <div className="flex flex-col items-end">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                  deltaDiff > 0
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : deltaDiff < 0
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                    : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
                }`}
              >
                {deltaDiff > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : deltaDiff < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5" />
                ) : (
                  <Minus className="w-3.5 h-3.5" />
                )}
                {deltaPercent !== null
                  ? `${deltaDiff > 0 ? '+' : ''}${deltaPercent.toFixed(1)}%`
                  : '0.0%'}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                vs Yesterday ({deltaDiff >= 0 ? '+' : ''}
                {deltaDiff.toLocaleString()} LE)
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {subtitle}
            </span>
          )}
        </div>

        {/* Total Revenue + Transactions Count */}
        <div className="flex items-baseline justify-between gap-4 pb-4 mb-4 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Total Revenue
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white tabular-nums">
                {summary.totalRevenue.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">LE</span>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Transactions
            </p>
            <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 font-bold text-sm tabular-nums">
              <Receipt className="w-3.5 h-3.5 text-indigo-500" />
              {summary.transactionCount}
            </div>
          </div>
        </div>

        {/* Breakdown Grid: Payment Methods & Package Categories */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Payment Methods */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CreditCard className="w-3 h-3 text-indigo-500" />
              By Payment Method
            </p>
            <div className="space-y-1.5">
              {PAYMENT_METHODS.map(method => {
                const item = summary.byMethod[method];
                return (
                  <div
                    key={method}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/70 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60"
                  >
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                      {getMethodIcon(method)}
                      <span>{method}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        ({item.count})
                      </span>
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                      {item.amount.toLocaleString()} LE
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Package Categories */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-indigo-500" />
              By Package Category
            </p>
            <div className="space-y-1.5">
              {PACKAGE_CATEGORIES.map(category => {
                const item = summary.byCategory[category];
                return (
                  <div
                    key={category}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/70 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60"
                  >
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          category === 'Memberships'
                            ? 'bg-indigo-500'
                            : category === 'PT'
                            ? 'bg-emerald-500'
                            : category === 'Classes'
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                        }`}
                      />
                      <span>{category}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        ({item.count})
                      </span>
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                      {item.amount.toLocaleString()} LE
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm space-y-6">
      {/* Widget Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
                Daily Revenue Summary
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Live Audit
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Side-by-side revenue comparison & transaction ledger for Today vs. Yesterday
            </p>
          </div>
        </div>

        {/* Quick Delta Pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 text-xs">
          {deltaDiff >= 0 ? (
            <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-rose-500 shrink-0" />
          )}
          <span className="text-slate-600 dark:text-slate-300 font-medium">Net Daily Variance:</span>
          <span
            className={`font-black tabular-nums ${
              deltaDiff > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : deltaDiff < 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {deltaDiff >= 0 ? '+' : ''}
            {deltaDiff.toLocaleString()} LE
          </span>
        </div>
      </div>

      {/* Side-by-Side Cards: Today vs Yesterday */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderSummaryCard('Today (Current Day)', 'Current Day', todaySummary, true)}
        {renderSummaryCard('Yesterday (Previous Day)', 'Previous Day', yesterdaySummary, false)}
      </div>

      {/* Toggleable Payments Ledger Section */}
      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setSelectedTab('today')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                selectedTab === 'today'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Today&apos;s Payments</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  selectedTab === 'today'
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {todaySummary.transactionCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedTab('yesterday')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                selectedTab === 'yesterday'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Yesterday&apos;s Payments</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  selectedTab === 'yesterday'
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {yesterdaySummary.transactionCount}
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Showing <span className="font-bold text-slate-800 dark:text-slate-200">{activePayments.length}</span>{' '}
            transaction{activePayments.length === 1 ? '' : 's'} for{' '}
            <span className="font-bold text-slate-800 dark:text-slate-200">{activeDateLabel}</span>
          </div>
        </div>

        {/* Transactions Table */}
        {activePayments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-8 text-center">
            <Receipt className="w-7 h-7 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              No payments recorded for {selectedTab === 'today' ? 'today' : 'yesterday'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Completed transactions will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold text-[10px]">
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Member Name</th>
                  <th className="py-2.5 px-3">Package</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Discount</th>
                  <th className="py-2.5 px-3 text-right">Amount Paid</th>
                  <th className="py-2.5 px-3">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/80 bg-white dark:bg-slate-900">
                {activePayments.map(payment => {
                  const categoryBucket = normalizeCategoryBucket(payment);
                  const methodBucket = normalizeMethodBucket(payment.method);
                  const amountPaid = getPaymentAmount(payment);
                  const discountStr = formatDiscount(payment);
                  const memberName =
                    payment.client_name || payment.clientName || payment.guestName || 'Walk-in Member';
                  const timeDisplay = safeFormatTime(
                    payment.created_at || payment.date,
                    'hh:mm a',
                    safeFormatDate(payment.date, 'MMM d', '—')
                  );

                  return (
                    <tr
                      key={payment.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500 dark:text-slate-400 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {timeDisplay}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {memberName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium max-w-[200px] truncate">
                        {payment.packageType || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getCategoryBadgeClasses(
                            categoryBucket
                          )}`}
                        >
                          {categoryBucket}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                          {getMethodIcon(methodBucket)}
                          {payment.method || methodBucket}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {discountStr !== '—' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-semibold text-[10px]">
                            <Tag className="w-2.5 h-2.5" />
                            {discountStr}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-right font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {amountPaid.toLocaleString()} LE
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300 font-medium">
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="w-3 h-3 text-slate-400" />
                          {resolveRecordedBy(payment)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Package Target Attribution — This Month</h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {teamTargets.map(([team, v]) => (
            <div key={team} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{team}</div>
              <div className="text-lg font-black text-slate-900 dark:text-white">{v.revenue.toLocaleString()} LE</div>
              <div className="text-[11px] text-slate-500">{v.count} sale(s)</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default InzanDailyRevenueSummary;
