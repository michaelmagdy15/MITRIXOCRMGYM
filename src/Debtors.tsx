import React, { useState, useMemo } from 'react';
import { downloadFile } from './utils/download';
import { useAppContext } from './context';
import { useLanguage } from './contexts/LanguageContext';
import { resolveUserDisplay } from './utils/resolveUserDisplay';
import { format, parseISO } from 'date-fns';
import { Payment } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, DollarSign, Download, User, Calendar, Phone, MapPin, CreditCard, ArrowUpDown } from 'lucide-react';

const LOCALES = {
  en: {
    title: "Debtors List",
    searchPlaceholder: "Search by member name, ID, or phone...",
    startDate: "Start Date",
    endDate: "End Date",
    exportCsv: "Export CSV",
    memberName: "Member Name",
    memberId: "Member ID",
    mobile: "Mobile",
    salesRep: "Sales Rep",
    paymentDate: "Payment Date",
    packageName: "Package Name",
    total: "Total",
    paid: "Paid",
    remaining: "Remaining",
    actions: "Actions",
    pay: "Pay",
    noDebtors: "No debtors found matching the filters.",
    payDebtTitle: "Pay Remaining Debt",
    paymentMethod: "Payment Method",
    amountToPay: "Amount to Pay",
    notes: "Notes",
    cancel: "Cancel",
    confirmPayment: "Confirm Payment",
    successAlert: "Payment updated successfully!",
    invalidAmount: "Please enter a valid amount.",
    remainingDebt: "Remaining Debt",
    allBranches: "All Branches",
    branch: "Branch",
    totalDebtorsCount: "Total Debtors",
    totalRemainingAmount: "Total Outstanding Debt",
    loading: "Loading payments...",
    cash: "Cash",
    creditCard: "Credit Card",
    bankTransfer: "Bank Transfer",
    instapay: "Instapay",
    other: "Other",
    instapayRef: "Instapay Reference (12 digits)",
    instapayRefRequired: "Instapay reference is required and must be 12 digits.",
  },
  ar: {
    title: "قائمة المدينين",
    searchPlaceholder: "البحث باسم العضو، الرقم التعريفي، أو الهاتف...",
    startDate: "تاريخ البدء",
    endDate: "تاريخ الانتهاء",
    exportCsv: "تصدير CSV",
    memberName: "اسم العضو",
    memberId: "رقم العضو",
    mobile: "رقم الموبايل",
    salesRep: "مندوب المبيعات",
    paymentDate: "تاريخ الدفع",
    packageName: "اسم الباقة",
    total: "الإجمالي",
    paid: "المدفوع",
    remaining: "المتبقي",
    actions: "الإجراءات",
    pay: "دفع",
    noDebtors: "لا يوجد مدينين يطابقون الفلاتر.",
    payDebtTitle: "دفع الدين المتبقي",
    paymentMethod: "طريقة الدفع",
    amountToPay: "المبلغ المراد دفعه",
    notes: "ملاحظات",
    cancel: "إلغاء",
    confirmPayment: "تأكيد الدفع",
    successAlert: "تم تحديث الدفع بنجاح!",
    invalidAmount: "يرجى إدخال مبلغ صحيح.",
    remainingDebt: "الدين المتبقي",
    allBranches: "كل الفروع",
    branch: "الفرع",
    totalDebtorsCount: "إجمالي المدينين",
    totalRemainingAmount: "إجمالي الديون المعلقة",
    loading: "جاري تحميل المدفوعات...",
    cash: "نقدي",
    creditCard: "بطاقة ائتمان",
    bankTransfer: "تحويل بنكي",
    instapay: "إنستاباي",
    other: "أخرى",
    instapayRef: "مرجع إنستاباي (12 رقم)",
    instapayRefRequired: "مرجع إنستاباي مطلوب ويجب أن يتكون من 12 رقمًا.",
  }
};

export default function Debtors() {
  const { language, isRtl } = useLanguage();
  const { payments, clients, users, updatePayment, branches, setActiveTab, setActiveClientId } = useAppContext();

  const currentLoc = LOCALES[language as 'en' | 'ar'] || LOCALES.en;

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');

  // Payment dialog state
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'Credit Card' | 'Bank Transfer' | 'Instapay' | 'Other'>('Cash');
  const [instapayRef, setInstapayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Filter debtors where amount_paid < amount and deleted_at is null
  const allDebtors = useMemo(() => {
    return payments.filter(p => (p.amount_paid ?? 0) < (p.amount ?? 0) && !p.deleted_at);
  }, [payments]);

  // 2. Apply search and filter criteria
  const filteredDebtors = useMemo(() => {
    return allDebtors.filter(d => {
      const client = clients.find(c => c.id === d.clientId);
      const q = searchTerm.toLowerCase();

      // Search filters
      const clientName = (client?.name || d.client_name || '').toLowerCase();
      const clientPhone = (client?.phone || '').toLowerCase();
      const clientMemberId = (client?.memberId || '').toLowerCase();
      const packageName = (d.packageType || '').toLowerCase();
      
      const matchesSearch = !searchTerm || 
        clientName.includes(q) || 
        clientPhone.includes(q) || 
        clientMemberId.includes(q) || 
        packageName.includes(q);

      // Date filters
      let matchesDate = true;
      const payDateOnly = d.date ? d.date.substring(0, 10) : '';
      if (startDate) {
        matchesDate = matchesDate && payDateOnly >= startDate;
      }
      if (endDate) {
        matchesDate = matchesDate && payDateOnly <= endDate;
      }

      // Branch filter (either payment branch or fallback to client branch)
      let matchesBranch = true;
      if (selectedBranch !== 'ALL') {
        const paymentBranch = d.branch || client?.branch;
        matchesBranch = paymentBranch === selectedBranch;
      }

      return matchesSearch && matchesDate && matchesBranch;
    });
  }, [allDebtors, clients, searchTerm, startDate, endDate, selectedBranch]);

  // Stats calculation
  const totalOutstanding = useMemo(() => {
    return filteredDebtors.reduce((sum, d) => sum + ((d.amount ?? 0) - (d.amount_paid ?? 0)), 0);
  }, [filteredDebtors]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  // CSV export function with UTF-8 BOM for Arabic language support in Excel
  const exportToCSV = () => {
    const headers = [
      currentLoc.memberName,
      currentLoc.memberId,
      currentLoc.mobile,
      currentLoc.salesRep,
      currentLoc.paymentDate,
      currentLoc.packageName,
      currentLoc.total,
      currentLoc.paid,
      currentLoc.remaining
    ];

    const csvRows = [
      headers.join(','),
      ...filteredDebtors.map(d => {
        const client = clients.find(c => c.id === d.clientId);
        const resolvedSales = resolveUserDisplay(d.salesName, users, d.salesName || '');
        const remaining = (d.amount ?? 0) - (d.amount_paid ?? 0);
        return [
          `"${client?.name || d.client_name || ''}"`,
          `"${client?.memberId || 'N/A'}"`,
          `"${client?.phone || 'N/A'}"`,
          `"${resolvedSales}"`,
          `"${formatDate(d.date)}"`,
          `"${d.packageType || 'N/A'}"`,
          `"${d.amount}"`,
          `"${d.amount_paid}"`,
          `"${remaining}"`
        ].join(',');
      })
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    downloadFile(blob, `debtors_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const handlePayClick = (payment: Payment) => {
    setSelectedPayment(payment);
    const remaining = (payment.amount ?? 0) - (payment.amount_paid ?? 0);
    setPayAmount(remaining.toString());
    setPayMethod('Cash');
    setInstapayRef('');
    setPayNotes('');
    setErrorMsg('');
  };

  const handleConfirmPayment = async () => {
    if (!selectedPayment) return;
    setErrorMsg('');

    const parsedAmount = parseFloat(payAmount);
    const remaining = (selectedPayment.amount ?? 0) - (selectedPayment.amount_paid ?? 0);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(currentLoc.invalidAmount);
      return;
    }

    if (parsedAmount > remaining) {
      setErrorMsg(language === 'ar' ? 'المبلغ المدفوع لا يمكن أن يتجاوز الدين المتبقي.' : 'Paid amount cannot exceed remaining debt.');
      return;
    }

    if (payMethod === 'Instapay') {
      const refClean = instapayRef.trim();
      if (refClean && !/^\d{12}$/.test(refClean)) {
        setErrorMsg(currentLoc.instapayRefRequired);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const newAmountPaid = (selectedPayment.amount_paid ?? 0) + parsedAmount;
      const combinedNotes = selectedPayment.notes 
        ? `${selectedPayment.notes}\n[Paid ${parsedAmount} LE via ${payMethod} on ${new Date().toLocaleDateString()}]${payNotes ? ': ' + payNotes : ''}`
        : `[Paid ${parsedAmount} LE via ${payMethod} on ${new Date().toLocaleDateString()}]${payNotes ? ': ' + payNotes : ''}`;

      const updates: Partial<Payment> = {
        amount_paid: newAmountPaid,
        method: payMethod,
        notes: combinedNotes,
      };

      if (payMethod === 'Instapay') {
        updates.instapayRef = instapayRef.trim();
      }

      await updatePayment(selectedPayment.id, updates);
      setSelectedPayment(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while updating the payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Upper Title Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            {currentLoc.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'ar' ? 'إدارة وتحصيل المبالغ المستحقة من الأعضاء المشتركين.' : 'Manage and collect outstanding payments from gym members.'}
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={exportToCSV}
          className="rounded-xl border-primary/20 hover:border-primary/50 flex items-center gap-2 hover:bg-muted/40 transition-colors h-11 self-start md:self-auto"
        >
          <Download className="h-4 w-4" />
          <span>{currentLoc.exportCsv}</span>
        </Button>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border border-border/40 bg-gradient-to-br from-card to-muted/20 shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground font-medium">{currentLoc.totalDebtorsCount}</p>
              <h3 className="text-3xl font-extrabold tracking-tight">{filteredDebtors.length}</h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <User className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/40 bg-gradient-to-br from-card to-muted/20 shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground font-medium">{currentLoc.totalRemainingAmount}</p>
              <h3 className="text-3xl font-extrabold tracking-tight text-destructive">
                {totalOutstanding.toLocaleString()} <span className="text-lg font-semibold">LE</span>
              </h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
              <DollarSign className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="border border-border/40 bg-card rounded-2xl shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search Input */}
            <div className="relative md:col-span-2">
              <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-3 h-5 w-5 text-muted-foreground`} />
              <Input
                type="search"
                placeholder={currentLoc.searchPlaceholder}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className={`pl-10 pr-4 h-11 rounded-xl bg-muted/30 border-border/60 focus-visible:ring-primary ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
              />
            </div>

            {/* Branch Filter */}
            <div>
              <Select value={selectedBranch} onValueChange={(val) => setSelectedBranch(val || 'ALL')}>
                <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-border/60">
                  <SelectValue placeholder={currentLoc.branch} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL">{currentLoc.allBranches}</SelectItem>
                  {branches.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Filters Toggle/Inputs */}
            <div className="flex gap-2">
              <div className="w-1/2">
                <Input
                  type="date"
                  title={currentLoc.startDate}
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="h-11 rounded-xl bg-muted/30 border-border/60 text-xs px-2"
                />
              </div>
              <div className="w-1/2">
                <Input
                  type="date"
                  title={currentLoc.endDate}
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="h-11 rounded-xl bg-muted/30 border-border/60 text-xs px-2"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Debtors Table */}
      <Card className="border border-border/40 bg-card rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.memberName}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.memberId}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.mobile}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.salesRep}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.paymentDate}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.packageName}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.total}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.paid}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.remaining}</TableHead>
                <TableHead className="text-center w-24">{currentLoc.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDebtors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                    {currentLoc.noDebtors}
                  </TableCell>
                </TableRow>
              ) : (
                filteredDebtors.map(d => {
                  const client = clients.find(c => c.id === d.clientId);
                  const remaining = (d.amount ?? 0) - (d.amount_paid ?? 0);
                  const resolvedRep = resolveUserDisplay(d.salesName, users, d.salesName || '');
                  
                  return (
                    <TableRow key={d.id} className="hover:bg-muted/20 transition-colors">
                      <TableCell className="font-semibold text-sm">
                        {client ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('clients');
                              setActiveClientId(client.id);
                            }}
                            className="text-primary hover:underline font-semibold text-sm text-left block"
                          >
                            {client.name}
                          </button>
                        ) : (
                          d.client_name
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <Badge variant="outline" className="rounded-md font-mono bg-muted/30">
                          {client ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('clients');
                                setActiveClientId(client.id);
                              }}
                              className="text-primary hover:underline font-mono"
                            >
                              {client.memberId || 'N/A'}
                            </button>
                          ) : (
                            'N/A'
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {client?.phone ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('clients');
                              setActiveClientId(client.id);
                            }}
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {client.phone}
                          </button>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {resolvedRep}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="flex items-center gap-1 font-mono">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatDate(d.date)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate" title={d.packageType}>
                        {d.packageType || 'N/A'}
                      </TableCell>
                      <TableCell className="text-xs font-semibold">
                        {d.amount.toLocaleString()} LE
                      </TableCell>
                      <TableCell className="text-xs text-emerald-600 font-semibold">
                        {d.amount_paid.toLocaleString()} LE
                      </TableCell>
                      <TableCell className="text-xs text-destructive font-bold">
                        {remaining.toLocaleString()} LE
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          onClick={() => handlePayClick(d)}
                          className="h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs px-3 shadow-sm flex items-center gap-1 mx-auto"
                        >
                          <DollarSign className="h-3 w-3" />
                          <span>{currentLoc.pay}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Pay Modal Dialog */}
      <Dialog open={selectedPayment !== null} onOpenChange={(open) => !open && setSelectedPayment(null)}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl p-6" dir={isRtl ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-500" />
              <span>{currentLoc.payDebtTitle}</span>
            </DialogTitle>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4 py-4">
              {/* Member details display */}
              <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-2 border border-border/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{currentLoc.memberName}:</span>
                  <span className="font-semibold">{selectedPayment.client_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{currentLoc.packageName}:</span>
                  <span className="font-semibold">{selectedPayment.packageType || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{currentLoc.remainingDebt}:</span>
                  <span className="font-bold text-destructive">
                    {((selectedPayment.amount ?? 0) - (selectedPayment.amount_paid ?? 0)).toLocaleString()} LE
                  </span>
                </div>
              </div>

              {/* Error messages */}
              {errorMsg && (
                <div className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Amount input */}
              <div className="space-y-2">
                <Label htmlFor="pay-amount" className="text-xs font-semibold">
                  {currentLoc.amountToPay} (LE)
                </Label>
                <div className="relative">
                  <Input
                    id="pay-amount"
                    type="number"
                    step="any"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="h-11 rounded-xl bg-muted/30 focus-visible:ring-primary font-semibold"
                    placeholder="0.00"
                    max={(selectedPayment.amount ?? 0) - (selectedPayment.amount_paid ?? 0)}
                  />
                  <div className={`absolute ${isRtl ? 'left-3' : 'right-3'} top-3 text-xs text-muted-foreground font-mono`}>
                    LE
                  </div>
                </div>
              </div>

              {/* Method Select */}
              <div className="space-y-2">
                <Label htmlFor="pay-method" className="text-xs font-semibold">
                  {currentLoc.paymentMethod}
                </Label>
                <Select 
                  value={payMethod} 
                  onValueChange={(val: any) => {
                    setPayMethod(val);
                    setErrorMsg('');
                  }}
                >
                  <SelectTrigger id="pay-method" className="h-11 rounded-xl bg-muted/30 border-border/60">
                    <SelectValue placeholder={currentLoc.paymentMethod} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="Cash">{currentLoc.cash}</SelectItem>
                    <SelectItem value="Credit Card">{currentLoc.creditCard}</SelectItem>
                    <SelectItem value="Bank Transfer">{currentLoc.bankTransfer}</SelectItem>
                    <SelectItem value="Instapay">{currentLoc.instapay}</SelectItem>
                    <SelectItem value="Other">{currentLoc.other}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Instapay Reference */}
              {payMethod === 'Instapay' && (
                <div className="space-y-2 animate-in slide-in-from-top-3 duration-200">
                  <Label htmlFor="instapay-ref" className="text-xs font-semibold flex items-center justify-between">
                    <span>{currentLoc.instapayRef}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">({instapayRef.length}/12)</span>
                  </Label>
                  <Input
                    id="instapay-ref"
                    maxLength={12}
                    value={instapayRef}
                    onChange={e => setInstapayRef(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456789012"
                    className="h-11 rounded-xl bg-muted/30 focus-visible:ring-primary font-mono text-center tracking-widest"
                  />
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="pay-notes" className="text-xs font-semibold">
                  {currentLoc.notes}
                </Label>
                <Input
                  id="pay-notes"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder={language === 'ar' ? 'ملاحظات إضافية للدفع...' : 'Additional notes for the payment...'}
                  className="h-11 rounded-xl bg-muted/30 focus-visible:ring-primary"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSelectedPayment(null)}
              className="rounded-xl h-11 font-semibold flex-1"
            >
              {currentLoc.cancel}
            </Button>
            <Button
              onClick={handleConfirmPayment}
              disabled={isSubmitting}
              className="rounded-xl h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold flex-1"
            >
              {isSubmitting ? (language === 'ar' ? 'جاري الدفع...' : 'Paying...') : currentLoc.confirmPayment}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
