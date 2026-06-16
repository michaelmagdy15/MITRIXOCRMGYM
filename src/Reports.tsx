import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppContext } from './context';
import {
  format,
  parseISO,
  isSameMonth,
  subMonths,
  differenceInDays,
} from 'date-fns';
import { Download, AlertTriangle, TrendingUp, Users, DollarSign, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  Legend,
} from 'recharts';

const SOURCE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  color: 'red' | 'green' | 'blue' | 'indigo';
}) {
  const colors = {
    red: 'bg-red-50 border-red-200 text-red-600',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-600',
  };
  return (
    <Card className={`border ${colors[color]}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-1">{title}</p>
            <p className="text-2xl font-extrabold">{value}</p>
            <p className="text-xs opacity-60 mt-1">{subtitle}</p>
          </div>
          <div className="p-2 rounded-lg bg-white/60">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CustomTooltipRevenue = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-emerald-600">Revenue: {payload[0]?.value?.toLocaleString()} LE</p>
      {payload[0]?.payload?.conversion != null && (
        <p className="text-muted-foreground">{payload[0].payload.conversion}% conversion</p>
      )}
    </div>
  );
};

const CustomTooltipRetention = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const active_ = payload.find((p: any) => p.dataKey === 'active')?.value ?? 0;
  const churned = payload.find((p: any) => p.dataKey === 'churned')?.value ?? 0;
  const total = active_ + churned;
  const rate = total > 0 ? ((active_ / total) * 100).toFixed(0) : 0;
  return (
    <div className="bg-background border rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-blue-600">Still Active: {active_}</p>
      <p className="text-red-500">Left: {churned}</p>
      <p className="text-muted-foreground font-medium mt-1">{rate}% retention</p>
    </div>
  );
};

export default function Reports() {
  const { clients, payments, attendances } = useAppContext();
  const now = new Date();

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
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- KPI: Revenue this month ---
  const revenueThisMonth = useMemo(
    () =>
      payments
        .filter(p => !p.deleted_at && isSameMonth(parseISO(p.date), now))
        .reduce((sum, p) => sum + (p.amount_paid || p.amount || 0), 0),
    [payments]
  );

  // --- KPI: Active members ---
  const activeCount = useMemo(() => clients.filter(c => c.status === 'Active').length, [clients]);

  // --- KPI: Overall conversion rate ---
  const conversionRate = useMemo(() => {
    const total = clients.length;
    const converted = clients.filter(c => c.status !== 'Lead').length;
    return total > 0 ? ((converted / total) * 100).toFixed(0) : '0';
  }, [clients]);

  // --- Lead Source chart data ---
  const sourceROI = useMemo(() => {
    const getDisplaySource = (c: any) => {
      // Differentiate between intentional 'Other' and unmapped imported data
      if (c.source === 'Other' && c.importBatchId) return 'Imported (Unknown)';
      return c.source;
    };

    const sources = Array.from(new Set(clients.map(getDisplaySource).filter(Boolean))) as string[];
    return sources
      .map(source => {
        const leads = clients.filter(c => getDisplaySource(c) === source);
        const converted = leads.filter(c => c.status !== 'Lead');
        const revenue = payments
          .filter(p => !p.deleted_at && leads.some(c => c.id === p.clientId))
          .reduce((sum, p) => sum + (p.amount_paid || p.amount || 0), 0);
        return {
          source,
          leads: leads.length,
          converted: converted.length,
          conversion: leads.length > 0 ? +((converted.length / leads.length) * 100).toFixed(1) : 0,
          revenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [clients, payments]);

  // --- Churn Risk ---
  const churnRisk = useMemo(() => {
    const activeMembers = clients.filter(c => c.status === 'Active');
    return activeMembers
      .filter(member => {
        const memberAttendances = attendances.filter(a => a.clientId === member.id);
        if (memberAttendances.length === 0) return true;
        const last = memberAttendances.sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!last) return true;
        return differenceInDays(now, parseISO(last.date)) > 14;
      })
      .map(m => {
        const last = attendances
          .filter(a => a.clientId === m.id)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        const daysAgo = last ? differenceInDays(now, parseISO(last.date)) : null;
        return {
          id: m.id,
          name: m.name,
          lastDate: last ? format(parseISO(last.date), 'MMM d') : null,
          daysAgo,
        };
      })
      .sort((a, b) => (b.daysAgo ?? 9999) - (a.daysAgo ?? 9999));
  }, [clients, attendances]);

  // --- Cohort Retention chart data ---
  const cohortRetention = useMemo(() => {
    const cohorts: Record<string, { active: number; churned: number; sortKey: string }> = {};
    clients.forEach(c => {
      if (!c.startDate) return;
      const parsed = parseISO(c.startDate);
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
  }, [clients]);

  // --- Revenue Forecast ---
  const revenueForecast = useMemo(() => {
    const expiringThisMonth = clients.filter(
      c => c.status === 'Active' && c.membershipExpiry && isSameMonth(parseISO(c.membershipExpiry), now)
    );
    const sumValue = expiringThisMonth.reduce((sum, c) => {
      const cp = payments.filter(p => p.clientId === c.id && !p.deleted_at);
      const last = cp.sort((a, b) => b.date.localeCompare(a.date))[0];
      return sum + (last?.amount_paid || last?.amount || 0);
    }, 0);
    const last3 = [subMonths(now, 1), subMonths(now, 2), subMonths(now, 3)];
    const rates = last3
      .map(m => {
        const expired = clients.filter(c => c.membershipExpiry && isSameMonth(parseISO(c.membershipExpiry), m));
        if (!expired.length) return null;
        const renewed = expired.filter(c => c.status === 'Active' || c.status === 'Nearly Expired').length;
        return renewed / expired.length;
      })
      .filter(r => r !== null) as number[];
    const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0.7;
    return { expiringCount: expiringThisMonth.length, sumValue, renewalRate: avgRate, forecast: sumValue * avgRate };
  }, [clients, payments]);

  // CSV export data
  const sourceCSV = sourceROI.map(r => ({
    Source: r.source,
    'Total Leads': r.leads,
    Converted: r.converted,
    'Conversion %': r.conversion + '%',
    'Revenue (LE)': r.revenue,
  }));
  const churnCSV = churnRisk.map(r => ({
    Name: r.name,
    'Last Visit': r.lastDate ?? 'Never',
    'Days Since Visit': r.daysAgo ?? 'N/A',
  }));
  const cohortCSV = cohortRetention.map(r => ({
    Month: r.month,
    'Still Active': r.active,
    Left: r.churned,
    'Retention %': r.active + r.churned > 0 ? (((r.active / (r.active + r.churned)) * 100).toFixed(1) + '%') : '0%',
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Sales Overview</h2>
        <p className="text-muted-foreground text-sm">Your gym's performance at a glance</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Members at Risk"
          value={churnRisk.length}
          subtitle="No visit in 14+ days"
          icon={AlertTriangle}
          color="red"
        />
        <KPICard
          title="Active Members"
          value={activeCount}
          subtitle="Currently enrolled"
          icon={Users}
          color="green"
        />
        <KPICard
          title="Conversion Rate"
          value={conversionRate + '%'}
          subtitle="Leads turned into members"
          icon={TrendingUp}
          color="blue"
        />
        <KPICard
          title="Revenue This Month"
          value={revenueThisMonth.toLocaleString() + ' LE'}
          subtitle="Payments collected so far"
          icon={DollarSign}
          color="indigo"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Lead Source Chart */}
        <Card className="shadow-sm border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                Where Members Come From
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Revenue collected per lead source</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportToCSV(sourceCSV, 'lead_sources')}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </CardHeader>
          <CardContent>
            {sourceROI.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No data yet.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(160, sourceROI.length * 44)}>
                  <BarChart data={sourceROI} layout="vertical" margin={{ left: 8, right: 60, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="source" width={80} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltipRevenue />} />
                    <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={28}>
                      {sourceROI.map((_, i) => (
                        <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                      ))}
                      <LabelList
                        dataKey="revenue"
                        position="right"
                        formatter={(v: any) => typeof v === 'number' ? v.toLocaleString() + ' LE' : String(v)}
                        style={{ fontSize: 11, fill: '#6b7280' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Conversion badges below chart */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                  {sourceROI.map((r, i) => (
                    <div key={r.source} className="flex items-center gap-1 text-xs">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                      />
                      <span className="text-muted-foreground">{r.source}:</span>
                      <span className="font-semibold">{r.conversion}% conv.</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Churn Risk */}
        <Card className="shadow-sm border-red-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Members at Risk
                <Badge variant="destructive" className="ml-1">{churnRisk.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Haven't visited in 14 or more days — call them!</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportToCSV(churnCSV, 'members_at_risk')}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
              {churnRisk.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-3xl mb-2">🎉</div>
                  <p className="text-muted-foreground text-sm">All members are attending regularly.</p>
                </div>
              ) : (
                churnRisk.map(m => {
                  const severity =
                    m.daysAgo === null ? 'never' : m.daysAgo > 30 ? 'high' : 'medium';
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/40 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-sm">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.lastDate ? `Last visit: ${m.lastDate}` : 'Never visited'}
                        </p>
                      </div>
                      <Badge
                        className={
                          severity === 'never' || severity === 'high'
                            ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100'
                            : 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100'
                        }
                        variant="outline"
                      >
                        {m.daysAgo !== null ? `${m.daysAgo}d ago` : 'Never'}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Retention Chart */}
        <Card className="shadow-sm border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-blue-500" />
                Monthly Retention
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Of members who joined each month — how many are still active vs. left
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportToCSV(cohortCSV, 'retention')}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </CardHeader>
          <CardContent>
            {cohortRetention.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cohortRetention} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltipRetention />} />
                  <Legend
                    formatter={(value) => (value === 'active' ? 'Still Active' : 'Left')}
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
        <Card className="shadow-sm border-indigo-200 bg-indigo-50/30 dark:bg-indigo-900/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-indigo-600 dark:text-indigo-400">
                <RefreshCw className="h-5 w-5" />
                Renewal Forecast
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Memberships expiring this month and expected renewals
              </p>
            </div>
            <Badge variant="outline" className="border-indigo-400 text-indigo-600 text-xs">
              {format(now, 'MMMM yyyy')}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background rounded-xl border p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                  Expiring This Month
                </p>
                <p className="text-3xl font-extrabold text-indigo-600">{revenueForecast.expiringCount}</p>
                <p className="text-xs text-muted-foreground mt-1">members</p>
              </div>
              <div className="bg-background rounded-xl border p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                  Their Total Value
                </p>
                <p className="text-3xl font-extrabold text-indigo-600">
                  {revenueForecast.sumValue.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">LE if all renew</p>
              </div>
            </div>

            <div className="relative p-5 bg-indigo-600 rounded-2xl overflow-hidden shadow-lg">
              <div className="absolute inset-0 opacity-5">
                <DollarSign className="h-40 w-40 text-white absolute -right-4 -top-4" />
              </div>
              <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wider mb-1">
                Expected Renewal Revenue
              </p>
              <p className="text-4xl font-extrabold text-white">
                {Math.round(revenueForecast.forecast).toLocaleString()}{' '}
                <span className="text-lg font-normal opacity-70">LE</span>
              </p>
              <p className="text-indigo-200 text-xs mt-2">
                Based on{' '}
                <span className="font-bold text-white">
                  {(revenueForecast.renewalRate * 100).toFixed(0)}% avg renewal rate
                </span>{' '}
                over the last 3 months
              </p>
            </div>

            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() =>
                exportToCSV(
                  [
                    {
                      Month: format(now, 'yyyy-MM'),
                      'Expiring Members': revenueForecast.expiringCount,
                      'Total Potential (LE)': revenueForecast.sumValue,
                      'Avg Renewal Rate': (revenueForecast.renewalRate * 100).toFixed(1) + '%',
                      'Expected Revenue (LE)': Math.round(revenueForecast.forecast),
                    },
                  ],
                  `renewal_forecast_${format(now, 'yyyy_MM')}`
                )
              }
            >
              <Download className="h-4 w-4 mr-2" />
              Download Forecast
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
