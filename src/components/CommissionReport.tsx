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
import { useAuth } from '../contexts/AuthContext';
import { useClients } from '../hooks/useClients';
import { usePayments } from '../hooks/usePayments';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { SALES_NAME_MAPPING, SALES_MEMBERS } from '../constants';


const CommissionReport: React.FC = () => {
  const { commissionRates, updateCommissionRates, users } = useAppContext();
  const { currentUser } = useAuth();
  const { clients } = useClients(currentUser);
  const { payments } = usePayments({ currentUser, clients, canDeletePayments: false });

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
              const resolvedName = (SALES_NAME_MAPPING[assigned] || assigned).toLowerCase().trim();
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

      const amount = Number(p.amount) || 0;
      reps[repId].totalRevenue += amount;

      if (p.package_category_type === 'Private Training' || p.packageType?.toLowerCase().includes('pt')) {
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
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Commission_Report_${selectedMonth}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalMonthRevenue = reportData.reduce((sum, r) => sum + r.totalRevenue, 0);
  const totalMonthCommission = reportData.reduce((sum, r) => sum + r.commission, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Month Revenue</p>
            <p className="text-2xl font-bold text-slate-900">{totalMonthRevenue.toLocaleString()} EGP</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Commission</p>
            <p className="text-2xl font-bold text-slate-900">{totalMonthCommission.toLocaleString()} EGP</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Reps</p>
            <p className="text-2xl font-bold text-slate-900">{reportData.length}</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
              />
            </div>
            <button 
              onClick={exportToCSV}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
            >
              <Download size={18} />
              <span>Export CSV</span>
            </button>
          </div>

          {isManager && (
            <div className="flex items-center space-x-4">
              {editingRates ? (
                <div className="flex items-center space-x-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase">PT:</span>
                    <input 
                      type="number" 
                      value={localRates.ptRate}
                      onChange={(e) => setLocalRates({...localRates, ptRate: Number(e.target.value)})}
                      className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Group:</span>
                    <input 
                      type="number" 
                      value={localRates.groupRate}
                      onChange={(e) => setLocalRates({...localRates, groupRate: Number(e.target.value)})}
                      className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                  <button 
                    onClick={handleSaveRates}
                    disabled={saving}
                    className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
                  >
                    <Save size={16} />
                  </button>
                  <button 
                    onClick={() => {
                      setEditingRates(false);
                      setLocalRates(safeCommissionRates);
                    }}
                    className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
                  >
                    <SettingsIcon size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  {showSuccess && (
                    <div className="flex items-center space-x-1 text-emerald-600 animate-in fade-in slide-in-from-right-2">
                      <CheckCircle2 size={16} />
                      <span className="text-sm font-medium">Rates updated</span>
                    </div>
                  )}
                  <div className="text-sm text-slate-500">
                    Rates: <span className="font-semibold text-slate-900">PT {safeCommissionRates.ptRate}%</span>, Group <span className="font-semibold text-slate-900">{safeCommissionRates.groupRate}%</span>
                  </div>
                  <button 
                    onClick={() => setEditingRates(true)}
                    className="flex items-center space-x-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Representative</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Private Revenue</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Group Revenue</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total Revenue</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {reportData.length > 0 ? (
                reportData.map((rep, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                          {rep.name.charAt(0)}
                        </div>
                        <span className="font-medium text-slate-900">{rep.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-600">{rep.privateRevenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-medium text-slate-600">{rep.groupRevenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">{rep.totalRevenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-sm font-bold border border-emerald-100">
                        {rep.commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center">
                      <FileSpreadsheet size={48} className="mb-2 opacity-20" />
                      <p>No payments found for {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {reportData.length > 0 && (
              <tfoot className="bg-slate-50/80 border-t border-slate-100">
                <tr>
                  <td className="px-6 py-4 font-bold text-slate-900">Monthly Totals</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900">{reportData.reduce((s, r) => s + r.privateRevenue, 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900">{reportData.reduce((s, r) => s + r.groupRevenue, 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-blue-600">{totalMonthRevenue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right font-bold text-emerald-600">{totalMonthCommission.toLocaleString()} EGP</td>
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
