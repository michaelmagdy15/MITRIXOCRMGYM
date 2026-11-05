import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Expense, ExpenseCategory } from '../types/expense';
import {
  recordExpense,
  fetchExpenses,
  removeExpense,
  computeExpenseSummary,
} from '../services/expenseService';
import { useAppContext } from '../context';
import { formatCurrencyAmount } from '../utils/pricing';
import { downloadFile } from '../utils/download';
import { toast } from 'sonner';
import {
  Receipt,
  Plus,
  Download,
  Trash2,
  Calendar,
  Building,
  TrendingDown,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';

const CATEGORIES: ExpenseCategory[] = [
  'Cleaning & Hygiene',
  'Office & Front Desk Supplies',
  'Staff Refreshments',
  'Towel Laundry',
  'Equipment Maintenance',
  'Facility Repairs',
  'Utilities',
  'Marketing & Print',
  'Other',
];

interface PettyCashRegisterProps {
  onExpenseLogged?: () => void;
}

export function PettyCashRegister({ onExpenseLogged }: PettyCashRegisterProps) {
  const { currentUser, branches } = useAppContext();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Cleaning & Hygiene');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().substring(0, 10));
  const defaultBranch = branches && branches.length > 0 ? (typeof branches[0] === 'string' ? branches[0] : (branches[0] as any)?.name || 'all') : 'all';
  const [expenseBranch, setExpenseBranch] = useState(defaultBranch);
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canDelete =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'manager';

  const loadData = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-');
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

      const res = await fetchExpenses({
        branch: selectedBranch,
        startDate,
        endDate,
      });
      setExpenses(res);
    } catch (err) {
      toast.error('Failed to load petty cash records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranch, selectedMonth]);

  const summary = useMemo(() => computeExpenseSummary(expenses), [expenses]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('Please enter a valid expense amount');
      return;
    }
    if (!description.trim()) {
      toast.error('Please provide a short description or receipt note');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordExpense({
        date: expenseDate,
        amount: parsedAmount,
        category,
        description: description.trim(),
        branch: expenseBranch,
        authorizedBy: authorizedBy.trim(),
        recordedBy: currentUser?.id || 'unknown',
        recordedByName: currentUser?.name || 'Staff',
      });

      toast.success('Petty cash expense recorded successfully');
      setIsAddOpen(false);
      setAmount('');
      setDescription('');
      setAuthorizedBy('');
      await loadData();
      if (onExpenseLogged) onExpenseLogged();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to record expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this petty cash record?')) return;
    try {
      await removeExpense(id, {
        id: currentUser?.id || 'unknown',
        name: currentUser?.name || 'Staff',
      });
      toast.success('Record deleted');
      await loadData();
      if (onExpenseLogged) onExpenseLogged();
    } catch (err: any) {
      toast.error('Failed to delete expense');
    }
  };

  const handleExportCSV = () => {
    if (expenses.length === 0) {
      toast.error('No expenses to export');
      return;
    }

    const headers = ['Date', 'Category', 'Description', 'Amount (EGP)', 'Branch', 'Authorized By', 'Recorded By', 'Created At'];
    const rows = expenses.map((e) => [
      e.date,
      `"${e.category}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      e.amount.toFixed(2),
      `"${e.branch}"`,
      `"${e.authorizedBy || ''}"`,
      `"${e.recordedByName}"`,
      e.createdAt,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `Petty_Cash_${selectedMonth}.csv`);
    toast.success('Petty cash report downloaded');
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Petty Cash & Expense Register
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Track daily front-desk cash outflows, operational expenses, and shift drawer balances.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="rounded-xl">
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
          <Button onClick={() => setIsAddOpen(true)} size="sm" className="rounded-xl font-semibold shadow-sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Record Expense
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Label className="text-xs font-semibold">Month:</Label>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-40 h-9 text-xs rounded-xl"
            />
          </div>

          {branches && branches.length > 0 && (
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs font-semibold">Branch:</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-36 h-9 text-xs rounded-xl">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b: any) => {
                    const name = typeof b === 'string' ? b : (b?.name || String(b));
                    const key = typeof b === 'string' ? b : (b?.id || b?.name || String(b));
                    return (
                      <SelectItem key={key} value={name}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Total Outflow This Month</span>
              <TrendingDown className="h-4 w-4 text-rose-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400">
              {formatCurrencyAmount(summary.totalAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.count} recorded transaction{summary.count === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border shadow-sm sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center justify-between">
              <span>Top Outflow Categories</span>
              <Layers className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 pt-1">
              {Object.entries(summary.byCategory)
                .filter(([_, val]) => val > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat, val]) => (
                  <Badge key={cat} variant="secondary" className="px-2.5 py-1 text-xs rounded-lg">
                    <span className="font-medium mr-1.5">{cat}:</span>
                    <span className="font-bold text-foreground">{formatCurrencyAmount(val)}</span>
                  </Badge>
                ))}
              {summary.totalAmount === 0 && (
                <span className="text-xs text-muted-foreground italic">No expenses recorded for this month.</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-44">Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-28 text-right">Amount</TableHead>
                <TableHead className="w-28">Branch</TableHead>
                <TableHead className="w-36">Logged By</TableHead>
                {canDelete && <TableHead className="w-16 text-center">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canDelete ? 7 : 6} className="text-center py-8 text-muted-foreground">
                    Loading petty cash records...
                  </TableCell>
                </TableRow>
              ) : expenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canDelete ? 7 : 6} className="text-center py-12 text-muted-foreground">
                    No petty cash records found for the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                expenses.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell className="font-mono text-xs text-foreground/80">{exp.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] font-medium rounded-md">
                        {exp.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-xs text-foreground">{exp.description}</div>
                      {exp.authorizedBy && (
                        <div className="text-[10px] text-muted-foreground">
                          Authorized by: <span className="font-semibold">{exp.authorizedBy}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-rose-600 dark:text-rose-400 font-mono">
                      -{formatCurrencyAmount(exp.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{exp.branch || 'All'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{exp.recordedByName}</TableCell>
                    {canDelete && (
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-rose-600 rounded-lg"
                          onClick={() => handleDeleteExpense(exp.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Record Expense Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Record Petty Cash Expense
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateExpense} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Date</Label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="rounded-xl h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Amount (LE)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0.5"
                  placeholder="e.g. 150"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="rounded-xl h-9 text-xs font-semibold"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Select value={category} onValueChange={(val: ExpenseCategory) => setCategory(val)}>
                <SelectTrigger className="rounded-xl h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description / Receipt Note</Label>
              <Textarea
                placeholder="e.g. 5 Water gallons for reception cooler and disinfectant spray"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl text-xs min-h-[70px]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Branch</Label>
                <Select value={expenseBranch} onValueChange={setExpenseBranch}>
                  <SelectTrigger className="rounded-xl h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches?.map((b: any) => {
                      const name = typeof b === 'string' ? b : (b?.name || String(b));
                      const key = typeof b === 'string' ? b : (b?.id || b?.name || String(b));
                      return (
                        <SelectItem key={key} value={name}>
                          {name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Authorized By (Optional)</Label>
                <Input
                  placeholder="e.g. Coach Karim / Manager"
                  value={authorizedBy}
                  onChange={(e) => setAuthorizedBy(e.target.value)}
                  className="rounded-xl h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-xl font-bold shadow-sm">
                {isSubmitting ? 'Recording...' : 'Record Outflow'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
