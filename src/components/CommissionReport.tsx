import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Download, 
  Settings as SettingsIcon, 
  Users, 
  TrendingUp, 
  Calendar,
  Save,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import { useAppContext } from '../context';
import { downloadFile } from '../utils/download';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { SALES_NAME_MAPPING, SALES_MEMBERS, toCanonical } from '../constants';


const CommissionReport: React.FC = () => {
  const { commissionRates, updateCommissionRates, users, branding, clients, payments } = useAppContext();
  const { currentUser } = useAuth();

  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [editingRates, setEditingRates] = useState(false);
  const safeCommissionRates = commissionRates || { ptRate: 0, groupRate: 0 };
  const [localRates, setLocalRates] = useState(safeCommissionRates);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const handleSaveRates = async () => {
    setSaving(true);
    await updateCommissionRates(localRates);
    setSaving(false);
    setEditingRates(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const reportData = useMemo(() => {
    const monthDate = parseISO(`${selectedMonth}-01`);
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);

    // Filter payments for the selected month
    const filteredPayments = payments.filter(p => {
      const pDate = typeof p.date === 'string' ? parseISO(p.date) : (p.date as any)?.toDate?.() || new Date(p.date);
      return isWithinInterval(pDate, { start, end });
    });

    // Strategy Part 1: Map all of our known Sales Rep IDs to their current full names
    // And Part 2: Map Aliases/Names to IDs
    const repIdToName: Record<string, string> = {};
    const nameToRepId: Record<string, string> = {};
    
    users.forEach(u => {
      const role = u.role?.toLowerCase();
      // Only include reps or those in SALES_MEMBERS
      if (role === 'rep' || role === 'sales_rep' || SALES_MEMBERS.includes(u.name)) {
        repIdToName[u.id] = u.name;
        nameToRepId[u.name.toLowerCase().trim()] = u.id;
      }
    });

    // Add explicit mapping for common aliases to the IDs we found
    Object.entries(SALES_NAME_MAPPING).forEach(([alias, fullName]) => {
      const id = nameToRepId[fullName.toLowerCase().trim()];
      if (id) {
        nameToRepId[alias.toLowerCase().trim()] = id;
      }
    });

    // Strategy Part 3: Client Assignments Fallback
    const clientIdToAssignedRepMap = new Map();
    clients.forEach(c => {
      if (c.assignedTo) clientIdToAssignedRepMap.set(c.id, c.assignedTo);
    });

    const reps: Record<string, {
      name: string;
      totalRevenue: number;
      privateRevenue: number;
      groupRevenue: number;
    }> = {};

    filteredPayments.forEach(p => {
      // Determine the "Winner" (Rep who gets credit).
      // sales_rep_id is the single source of truth; recordedBy is excluded from commission.
      let winnerId = p.sales_rep_id || '';
      
      // If no explicit ID, try to match by name alias
      if (!winnerId && p.salesName) {
        winnerId = nameToRepId[p.salesName.toLowerCase().trim()] ?? '';
      }

      // If still no ID, use the client assignment
      if (p.clientId) {
        const assigned = clientIdToAssignedRepMap.get(p.clientId);
        if (assigned) {
          if (!winnerId) {
            // Try as direct user ID first
            if (repIdToName[assigned]) {
              winnerId = assigned;
            } else {
              // It's a name string — resolve through mapping then look up ID
              const resolvedName = toCanonical(assigned).toLowerCase().trim();
              const resolvedId = nameToRepId[resolvedName] || nameToRepId[assigned.toLowerCase().trim()];
              if (resolvedId) winnerId = resolvedId;
            }
          }
        }
      }

      const repId = winnerId || 'unassigned';
      const repName = repIdToName[repId] || p.salesName || 'Unassigned';

      if (!reps[repId]) {
        reps[repId] = {
          name: repName,
          totalRevenue: 0,
          privateRevenue: 0,
          groupRevenue: 0
        };
      }

      const amount = Number(p.amount_paid ?? p.amount) || 0;
      reps[repId].totalRevenue += amount;

      if (p.package_category_type === 'PT' || (p.package_category_type as string) === 'Private Training' || p.packageType?.toLowerCase().includes('pt')) {
        reps[repId].privateRevenue += amount;
      } else {
        reps[repId].groupRevenue += amount;
      }
    });

    return Object.values(reps).map(rep => ({
      ...rep,
      commission: (rep.privateRevenue * ((commissionRates?.ptRate || 0) / 100)) + 
                  (rep.groupRevenue * ((commissionRates?.groupRate || 0) / 100))
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [payments, selectedMonth, commissionRates, users, clients]);


  const exportToCSV = () => {
    const headers = ['Representative', 'Total Revenue', 'Private Revenue', 'Group Revenue', 'Commission'];
    const rows = reportData.map(rep => [
      rep.name,
      rep.totalRevenue.toFixed(2),
      rep.privateRevenue.toFixed(2),
      rep.groupRevenue.toFixed(2),
      rep.commission.toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `Commission_Report_${selectedMonth}.csv`);
  };

  const totalMonthRevenue = reportData.reduce((sum, r) => sum + r.totalRevenue, 0);
  const totalMonthCommission = reportData.reduce((sum, r) => sum + r.commission, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border flex items-center space-x-4">
          <div className="p-3 bg-blue-500/15 rounded-xl text-blue-600 dark:text-blue-400">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Month Revenue</p>
            <p className="text-2xl font-bold text-foreground">{totalMonthRevenue.toLocaleString()} {branding.currencySymbol || 'LE'}</p>
          </div>
        </div>
        
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border flex items-center space-x-4">
          <div className="p-3 bg-emerald-500/15 rounded-xl text-emerald-600 dark:text-emerald-400">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Commission</p>
            <p className="text-2xl font-bold text-foreground">{totalMonthCommission.toLocaleString()} {branding.currencySymbol || 'LE'}</p>
          </div>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border flex items-center space-x-4">
          <div className="p-3 bg-amber-500/15 rounded-xl text-amber-600 dark:text-amber-400">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Reps</p>
            <p className="text-2xl font-bold text-foreground">{reportData.length}</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input 
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="pl-10 pr-4 py-2 bg-muted/40 text-foreground border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none"
              />
            </div>
            <button 
              onClick={exportToCSV}
              className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity shadow-sm"
            >
              <Download size={18} />
              <span>Export CSV</span>
            </button>
          </div>

          {isManager && (
            <div className="flex items-center space-x-4">
              {editingRates ? (
                <div className="flex items-center space-x-3 bg-muted/40 p-2 rounded-xl border border-border">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">PT:</span>
                    <input 
                      type="number" 
                      value={localRates.ptRate}
                      onChange={(e) => setLocalRates({...localRates, ptRate: Number(e.target.value)})}
                      className="w-16 px-2 py-1 bg-background text-foreground border border-border rounded-lg text-sm"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Group:</span>
                    <input 
                      type="number" 
                      value={localRates.groupRate}
                      onChange={(e) => setLocalRates({...localRates, groupRate: Number(e.target.value)})}
                      className="w-16 px-2 py-1 bg-background text-foreground border border-border rounded-lg text-sm"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <button 
                    onClick={handleSaveRates}
                    disabled={saving}
                    className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    <Save size={16} />
                  </button>
                  <button 
                    onClick={() => {
                      setEditingRates(false);
                      setLocalRates(safeCommissionRates);
                    }}
                    className="p-1.5 bg-muted text-muted-foreground rounded-lg hover:text-foreground transition-colors"
                  >
                    <SettingsIcon size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  {showSuccess && (
                    <div className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 animate-in fade-in slide-in-from-right-2">
                      <CheckCircle2 size={16} />
                      <span className="text-sm font-medium">Rates updated</span>
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground">
                    Rates: <span className="font-semibold text-foreground">PT {safeCommissionRates.ptRate}%</span>, Group <span className="font-semibold text-foreground">{safeCommissionRates.groupRate}%</span>
                  </div>
                  <button 
                    onClick={() => setEditingRates(true)}
                    className="flex items-center space-x-2 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors border border-border"
                  >
                    <SettingsIcon size={16} />
                    <span className="text-sm font-medium">Adjust Rates</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Representative</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Private Revenue</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Group Revenue</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Total Revenue</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reportData.length > 0 ? (
                reportData.map((rep, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-foreground font-bold text-xs">
                          {rep.name.charAt(0)}
                        </div>
                        <span className="font-medium text-foreground">{rep.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-muted-foreground">{rep.privateRevenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-medium text-muted-foreground">{rep.groupRevenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-foreground">{rep.totalRevenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-sm font-bold border border-emerald-500/30">
                        {rep.commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {branding.currencySymbol || 'LE'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center">
                      <FileSpreadsheet size={48} className="mb-2 opacity-20" />
                      <p>No payments found for {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {reportData.length > 0 && (
              <tfoot className="bg-muted/40 border-t border-border">
                <tr>
                  <td className="px-6 py-4 font-bold text-foreground">Monthly Totals</td>
                  <td className="px-6 py-4 text-right font-bold text-foreground">{reportData.reduce((s, r) => s + r.privateRevenue, 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-foreground">{reportData.reduce((s, r) => s + r.groupRevenue, 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-blue-600 dark:text-blue-400">{totalMonthRevenue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">{totalMonthCommission.toLocaleString()} {branding.currencySymbol || 'LE'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default CommissionReport;
