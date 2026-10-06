import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  calculateShiftReconciliation,
  generateShiftReconciliationCSV,
  DeclaredShiftAmounts,
  ShiftReconciliationReport
} from '../utils/shiftReconciliation';
import { downloadFile } from '../utils/download';
import { addAuditLog } from '../services/auditService';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { cleanData } from '../utils';
import { toast } from 'sonner';
import {
  Scale,
  DollarSign,
  CreditCard,
  Building,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calendar,
  Layers,
  FileCheck,
  SendHorizontal
} from 'lucide-react';

interface ShiftReconciliationViewProps {
  onClose?: () => void;
}

export function ShiftReconciliationView({ onClose }: ShiftReconciliationViewProps) {
  const { payments, currentUser, branches } = useAppContext();

  // Shift Settings
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [shiftType, setShiftType] = useState<'Morning' | 'Evening' | 'Night' | 'Full Day'>('Full Day');

  // Declared Amounts by Cashier
  const [declaredCash, setDeclaredCash] = useState<string>('');
  const [declaredVisa, setDeclaredVisa] = useState<string>('');
  const [declaredBankTransfer, setDeclaredBankTransfer] = useState<string>('');
  const [declaredInstapay, setDeclaredInstapay] = useState<string>('');
  const [declaredOther, setDeclaredOther] = useState<string>('');
  const [operationalNotes, setOperationalNotes] = useState<string>('');
  const [managerSignOffNotes, setManagerSignOffNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isManagerOrAdmin =
    currentUser?.role === 'manager' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'crm_admin';

  // Compute live report
  const report: ShiftReconciliationReport = useMemo(() => {
    const declared: Partial<DeclaredShiftAmounts> = {
      cash: parseFloat(declaredCash) || 0,
      visa: parseFloat(declaredVisa) || 0,
      bankTransfer: parseFloat(declaredBankTransfer) || 0,
      instapay: parseFloat(declaredInstapay) || 0,
      other: parseFloat(declaredOther) || 0
    };

    return calculateShiftReconciliation(payments, {
      date: shiftDate,
      branch: selectedBranch,
      shiftType,
      cashierId: currentUser?.id,
      cashierName: currentUser?.name,
      declared,
      notes: operationalNotes
    });
  }, [
    payments,
    shiftDate,
    selectedBranch,
    shiftType,
    currentUser,
    declaredCash,
    declaredVisa,
    declaredBankTransfer,
    declaredInstapay,
    declaredOther,
    operationalNotes
  ]);

  const handleExportCSV = () => {
    const csvContent = generateShiftReconciliationCSV(report);
    const filename = `shift_reconciliation_${report.date}_${report.shiftType.toLowerCase()}_${report.branch || 'all'}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, filename);
    toast.success('Shift reconciliation report exported successfully');
  };

  const handleSubmitReconciliation = async (action: 'submit' | 'approve') => {
    if (!currentUser) return;
    setIsSubmitting(true);
    try {
      const dataToSave = cleanData({
        ...report,
        managerId: action === 'approve' ? currentUser.id : undefined,
        managerName: action === 'approve' ? currentUser.name : undefined,
        managerNotes: managerSignOffNotes || undefined,
        status: action === 'approve' ? 'Approved' : report.status,
        submittedAt: new Date().toISOString(),
        submittedBy: currentUser.id,
        submittedByName: currentUser.name
      });

      const docRef = await addDoc(collection(db, 'shiftReconciliations'), dataToSave);

      await addAuditLog(
        action === 'approve' ? 'APPROVE' : 'CREATE',
        'SHIFT_HANDOVER',
        docRef.id,
        `Shift Reconciliation ${action === 'approve' ? 'Approved' : 'Submitted'} for ${report.date} (${report.shiftType} - ${report.branch || 'All Branches'}). Status: ${report.status}. System: ${report.system.totalCollected} LE, Declared: ${report.declared.total} LE, Variance: ${report.variance.total} LE.`,
        currentUser.name,
        { branch: report.branch }
      );

      toast.success(
        action === 'approve'
          ? 'Shift Reconciliation approved with manager sign-off'
          : 'Shift Reconciliation report saved to audit records'
      );
    } catch (err: any) {
      console.error('Error saving shift reconciliation:', err);
      toast.error(`Failed to submit reconciliation: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Scale className="h-6 w-6 text-primary" />
            Shift Reconciliation & Daily Closeout
          </h2>
          <p className="text-sm text-muted-foreground">
            Multi-method cash drawer & digital payments verification against live collection records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Filter Parameters */}
      <Card className="p-4 rounded-2xl bg-muted/20 border">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Shift Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                className="pl-9 h-10 rounded-xl"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Branch</Label>
            <Select value={selectedBranch} onValueChange={(val: any) => setSelectedBranch(val)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="All Branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Branches (Global)</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Shift Period</Label>
            <Select value={shiftType} onValueChange={(val: any) => setShiftType(val)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Full Day">Full Day</SelectItem>
                <SelectItem value="Morning">Morning Shift</SelectItem>
                <SelectItem value="Evening">Evening Shift</SelectItem>
                <SelectItem value="Night">Night Shift</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Executive Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 rounded-2xl border bg-card">
          <div className="text-xs text-muted-foreground font-medium">System Total (Collected)</div>
          <div className="text-2xl font-extrabold mt-1 text-foreground">
            {report.system.totalCollected.toLocaleString()} <span className="text-xs font-normal">LE</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
            <span>{report.system.transactionCount} transactions</span>
            <span>•</span>
            <span>{report.system.discountsTotal.toLocaleString()} LE discounts</span>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl border bg-card">
          <div className="text-xs text-muted-foreground font-medium">Staff Declared Total</div>
          <div className="text-2xl font-extrabold mt-1 text-primary">
            {report.declared.total.toLocaleString()} <span className="text-xs font-normal">LE</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Cashier: {report.cashierName || 'Staff Member'}
          </div>
        </Card>

        <Card
          className={`p-4 rounded-2xl border ${
            report.variance.hasDiscrepancy
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          <div className="text-xs font-medium">Net Discrepancy / Variance</div>
          <div className="text-2xl font-extrabold mt-1 flex items-center gap-2">
            {report.variance.total > 0 ? `+${report.variance.total.toLocaleString()}` : report.variance.total.toLocaleString()}{' '}
            <span className="text-xs font-normal">LE</span>
            {report.variance.hasDiscrepancy ? (
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            )}
          </div>
          <div className="text-[11px] font-semibold mt-1 uppercase tracking-wider">
            {report.variance.hasDiscrepancy ? 'Audit Discrepancy Flagged' : '100% Balanced Clean'}
          </div>
        </Card>
      </div>

      {/* Method by Method Reconciliation Grid */}
      <Card className="p-5 rounded-2xl border">
        <h3 className="font-bold text-base mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" /> Breakdown by Payment Method
        </h3>

        <div className="space-y-4">
          {/* Method Row: Cash */}
          <div className="grid grid-cols-1 md:grid-cols-4 items-center gap-4 p-3 rounded-xl bg-muted/30 border">
            <div className="flex items-center gap-2.5">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="font-semibold text-sm">Cash in Drawer</div>
                <div className="text-xs text-muted-foreground">Physical bills</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">System Expected</div>
              <div className="font-bold text-sm">{report.system.cash.toLocaleString()} LE</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Declared Cash (LE)</Label>
              <Input
                type="number"
                placeholder="0"
                className="h-9 rounded-lg"
                value={declaredCash}
                onChange={(e) => setDeclaredCash(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Variance</div>
              <Badge
                variant="outline"
                className={
                  report.variance.cash === 0
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                }
              >
                {report.variance.cash > 0 ? `+${report.variance.cash} LE` : `${report.variance.cash} LE`}
              </Badge>
            </div>
          </div>

          {/* Method Row: Visa / Card */}
          <div className="grid grid-cols-1 md:grid-cols-4 items-center gap-4 p-3 rounded-xl bg-muted/30 border">
            <div className="flex items-center gap-2.5">
              <CreditCard className="h-5 w-5 text-blue-600" />
              <div>
                <div className="font-semibold text-sm">Credit / Debit Card</div>
                <div className="text-xs text-muted-foreground">POS Terminal batch</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">System Expected</div>
              <div className="font-bold text-sm">{report.system.visa.toLocaleString()} LE</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Terminal Total (LE)</Label>
              <Input
                type="number"
                placeholder="0"
                className="h-9 rounded-lg"
                value={declaredVisa}
                onChange={(e) => setDeclaredVisa(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Variance</div>
              <Badge
                variant="outline"
                className={
                  report.variance.visa === 0
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                }
              >
                {report.variance.visa > 0 ? `+${report.variance.visa} LE` : `${report.variance.visa} LE`}
              </Badge>
            </div>
          </div>

          {/* Method Row: Instapay */}
          <div className="grid grid-cols-1 md:grid-cols-4 items-center gap-4 p-3 rounded-xl bg-muted/30 border">
            <div className="flex items-center gap-2.5">
              <Smartphone className="h-5 w-5 text-purple-600" />
              <div>
                <div className="font-semibold text-sm">Instapay</div>
                <div className="text-xs text-muted-foreground">Direct app transfers</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">System Expected</div>
              <div className="font-bold text-sm">{report.system.instapay.toLocaleString()} LE</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Instapay App Total (LE)</Label>
              <Input
                type="number"
                placeholder="0"
                className="h-9 rounded-lg"
                value={declaredInstapay}
                onChange={(e) => setDeclaredInstapay(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Variance</div>
              <Badge
                variant="outline"
                className={
                  report.variance.instapay === 0
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                }
              >
                {report.variance.instapay > 0 ? `+${report.variance.instapay} LE` : `${report.variance.instapay} LE`}
              </Badge>
            </div>
          </div>

          {/* Method Row: Bank Transfer */}
          <div className="grid grid-cols-1 md:grid-cols-4 items-center gap-4 p-3 rounded-xl bg-muted/30 border">
            <div className="flex items-center gap-2.5">
              <Building className="h-5 w-5 text-amber-600" />
              <div>
                <div className="font-semibold text-sm">Bank Transfer</div>
                <div className="text-xs text-muted-foreground">Wire / deposit slips</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">System Expected</div>
              <div className="font-bold text-sm">{report.system.bankTransfer.toLocaleString()} LE</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confirmed Bank Total (LE)</Label>
              <Input
                type="number"
                placeholder="0"
                className="h-9 rounded-lg"
                value={declaredBankTransfer}
                onChange={(e) => setDeclaredBankTransfer(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Variance</div>
              <Badge
                variant="outline"
                className={
                  report.variance.bankTransfer === 0
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                }
              >
                {report.variance.bankTransfer > 0
                  ? `+${report.variance.bankTransfer} LE`
                  : `${report.variance.bankTransfer} LE`}
              </Badge>
            </div>
          </div>
        </div>

        {/* Audit Adjustments Sub-Bar */}
        <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div>
            <strong>Discounts Granted:</strong> {report.system.discountsTotal.toLocaleString()} LE
          </div>
          <div>
            <strong>Refunds Excluded:</strong> {report.system.refundsCount} payments (
            {report.system.refundsTotal.toLocaleString()} LE)
          </div>
          <div>
            <strong>Partial Outstanding:</strong> {report.system.outstandingBalancesTotal.toLocaleString()} LE
          </div>
        </div>
      </Card>

      {/* Staff Notes & Manager Sign-Off Section */}
      <Card className="p-5 rounded-2xl border space-y-4">
        <div className="space-y-2">
          <Label className="font-semibold text-sm">Cashier Shift Notes / Discrepancy Reason</Label>
          <Textarea
            placeholder="Explain any drawer differences, bank delays, or operational notes for the shift..."
            rows={3}
            value={operationalNotes}
            onChange={(e) => setOperationalNotes(e.target.value)}
          />
        </div>

        {isManagerOrAdmin && (
          <div className="space-y-2 pt-2 border-t">
            <Label className="font-semibold text-sm text-foreground flex items-center gap-1.5">
              <FileCheck className="h-4 w-4 text-primary" /> Manager Verification & Sign-Off Notes
            </Label>
            <Input
              placeholder="e.g. Checked against physical cash drop and terminal receipt batch"
              value={managerSignOffNotes}
              onChange={(e) => setManagerSignOffNotes(e.target.value)}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
          <Button
            variant="outline"
            onClick={() => handleSubmitReconciliation('submit')}
            disabled={isSubmitting}
            className="gap-1.5"
          >
            <SendHorizontal className="h-4 w-4" />
            {isSubmitting ? 'Saving...' : 'Submit Cashier Closeout'}
          </Button>

          {isManagerOrAdmin && (
            <Button
              onClick={() => handleSubmitReconciliation('approve')}
              disabled={isSubmitting}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isSubmitting ? 'Approving...' : 'Manager Sign-Off & Approve'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
