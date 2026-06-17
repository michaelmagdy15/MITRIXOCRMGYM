import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from './context';
import { useLanguage } from './contexts/LanguageContext';
import { SALES_NAME_MAPPING } from './constants';
import { useCoaches } from './hooks/useCoaches';
import { usePackages } from './hooks/usePackages';
import { usePayments } from './hooks/usePayments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO, addDays } from 'date-fns';
import { Payment } from './types';
import { resolveUserDisplay } from './utils/resolveUserDisplay';
import { getEgyptDate } from './utils';
import { holdPayment, releasePayment, getHoldStatusInfo } from './utils/holdUtils';
import { Plus, DollarSign, CreditCard, Banknote, FileText, Smartphone, Printer, Search, Trash2, ChevronLeft, ChevronRight, User, UserPlus, Pause, Play, TrendingUp } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog } from './components/AlertDialog';

/**
 * Canonicalise any sales name variant (alias, typo, email prefix) to its
 * clean canonical form using SALES_NAME_MAPPING.
 * Unknown names are returned as-is, so new reps work automatically.
 */
function toCanonical(name: string): string {
  if (!name) return '';
  const lower = name.trim().toLowerCase();
  for (const [key, value] of Object.entries(SALES_NAME_MAPPING)) {
    if (key.toLowerCase() === lower) return value;
  }
  return name.trim();
}
export default function Payments() {
  const { t } = useLanguage();
  const { clients, users, updateClient, addClient, currentUser, branding, canDeletePayments, branches, processPaymentTransaction } = useAppContext();
  const { coaches } = useCoaches();
  const { packages } = usePackages();
  const { payments, addPayment, deletePayment, updatePayment } = usePayments({ currentUser, clients, canDeletePayments });
  const [isNewPaymentOpen, setIsNewPaymentOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editMethod, setEditMethod] = useState<Payment['method']>('Cash');
  const [editSalesName, setEditSalesName] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertDescription, setAlertDescription] = useState('');
  
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // New member inline creation
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientBranch, setNewClientBranch] = useState('');
  const [newClientLinked, setNewClientLinked] = useState(false);
  const [pendingNewPhone, setPendingNewPhone] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingNewPhone) return;
    const found = clients.find(c => c.phone === pendingNewPhone);
    if (found) {
      setClientId(found.id);
      setClientSearch(`${found.name}${found.phone ? ` (${found.phone})` : ''}`);
      setPendingNewPhone(null);
    }
  }, [clients, pendingNewPhone]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Payment['method']>('Cash');
  const [instapayRef, setInstapayRef] = useState('');
  const [packageType, setPackageType] = useState('');
  const [customPackage, setCustomPackage] = useState('');
  const [coachName, setCoachName] = useState('');
  const [customCoachName, setCustomCoachName] = useState('');
  const [notes, setNotes] = useState('');
  const [recordedById, setRecordedById] = useState('');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [salesName, setSalesName] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMethod, setFilterMethod] = useState('All');
  const [filterBranch, setFilterBranch] = useState('All');
  const [filterSalesName, setFilterSalesName] = useState('All');
  const [filterPackage, setFilterPackage] = useState('All');
  const [filterCoach, setFilterCoach] = useState('All');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortConfig, setSortConfig] = useState<{key: keyof Payment | 'date', direction: 'asc' | 'desc'}>({key: 'date', direction: 'desc'});
  const [discountType, setDiscountType] = useState<'percentage' | 'amount' | ''>('');
  const [discountValue, setDiscountValue] = useState('');
  const [discountedAmount, setDiscountedAmount] = useState('');
  const [isMemberOnHold, setIsMemberOnHold] = useState(false);

  // Hold feature state
  const [isHoldDialogOpen, setIsHoldDialogOpen] = useState(false);
  const [holdPaymentId, setHoldPaymentId] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [filterShowOnlyHeld, setFilterShowOnlyHeld] = useState(false);

  // Upgrade feature state
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState(false);
  const [upgradePaymentId, setUpgradePaymentId] = useState<string | null>(null);
  const [upgradePackageType, setUpgradePackageType] = useState('');
  const [upgradeMethod, setUpgradeMethod] = useState<Payment['method']>('Cash');
  const [upgradeInstapayRef, setUpgradeInstapayRef] = useState('');
  const [upgradeStartDate, setUpgradeStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Warn before navigating away when the new-payment form has unsaved data
  const isFormDirty = isNewPaymentOpen && (clientSearch.trim() !== '' || amount.trim() !== '');

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isFormDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isFormDirty]);

  const canDeletePayment = canDeletePayments;

  const adminUsers = users.filter(u =>
    ['admin', 'super_admin', 'crm_admin', 'manager', 'rep', 'sales_rep', 'sales'].includes(u.role?.toLowerCase() || '')
  );

  const uniqueSalesNames = React.useMemo(() => {
    const nameMap = new Map<string, string>();

    const addName = (rawName: string) => {
      if (!rawName) return;
      // Normalize aliases ("El Goo" → "Youssef Emad") so duplicates collapse.
      const cleanName = toCanonical(rawName);
      const lowerName = cleanName.toLowerCase();
      if (!nameMap.has(lowerName)) {
        nameMap.set(lowerName, cleanName);
      } else {
        const existing = nameMap.get(lowerName)!;
        if (cleanName.length > 0 && existing.length > 0 && cleanName !== existing && cleanName.charAt(0) === cleanName.charAt(0).toUpperCase() && existing.charAt(0) !== existing.charAt(0).toUpperCase()) {
          nameMap.set(lowerName, cleanName);
        }
      }
    };

    adminUsers.forEach(u => addName(u.name || u.email || u.id));
    payments.forEach(p => {
      if (p.salesName) {
        const resolved = resolveUserDisplay(p.salesName, users, p.salesName);
        if (resolved) addName(resolved);
      }
    });
    return Array.from(nameMap.values()).sort((a, b) => a.localeCompare(b));
  }, [adminUsers, users, payments]);

  useEffect(() => {
    if (recordedById === '' && users.length > 0) {
      const sama = users.find(u => u.name?.toLowerCase().includes('sama'));
      setRecordedById(sama?.id || currentUser?.id || '');
    }
  }, [users]);

  useEffect(() => {
    if (clientId) {
      const client = clients.find(c => c.id === clientId);
      if (client?.assignedTo) {
        const resolved = resolveUserDisplay(client.assignedTo, users);
        setSalesName(resolved || '');
      } else {
        setSalesName('');
      }
    }
  }, [clientId, clients]);

  const handleDeletePayment = async (id: string) => {
    const payment = payments.find(p => p.id === id);
    if (payment?.isOnHold) {
      setAlertTitle('Cannot Delete');
      setAlertDescription('This payment is on hold and cannot be deleted. Release the hold first.');
      setAlertOpen(true);
      return;
    }
    if (window.confirm('Are you sure you want to delete this payment record? This action cannot be undone.')) {
      try {
        await deletePayment(id);
      } catch (error) {
        setAlertTitle('Delete Failed');
        setAlertDescription(
          error instanceof Error
            ? error.message
            : 'Permission denied. You may not have the required role, or your session needs to be refreshed. Try logging out and back in.'
        );
        setAlertOpen(true);
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (amount && discountType && discountValue) {
      const baseAmount = parseFloat(amount);
      let finalAmount = baseAmount;

      if (discountType === 'percentage') {
        const discountPercent = Math.min(Math.max(parseFloat(discountValue), 0), 100);
        finalAmount = baseAmount * (1 - discountPercent / 100);
      } else if (discountType === 'amount') {
        const discountAmt = parseFloat(discountValue);
        finalAmount = Math.max(baseAmount - discountAmt, 0);
      }

      setDiscountedAmount(finalAmount.toFixed(2));
    } else {
      setDiscountedAmount('');
    }
  }, [amount, discountType, discountValue]);

  const handleCreateNewClient = async () => {
    if (!newClientName.trim() || !newClientPhone.trim()) return;
    await addClient({
      id: Math.random().toString(36).substr(2, 9),
      name: newClientName.trim(),
      phone: newClientPhone.trim(),
      status: 'Active',
      branch: newClientBranch || undefined,
      stage: 'Converted',
      comments: [],
      interactions: [],
      assignedTo: currentUser?.role === 'rep' ? currentUser.id : undefined,
      startDate: new Date().toISOString(),
      linkedAccount: newClientLinked || undefined,
    } as any);
    setPendingNewPhone(newClientPhone.trim());
    setIsCreatingNew(false);
    setClientDropdownOpen(false);
    setNewClientName('');
    setNewClientPhone('');
    setNewClientBranch('');
    setNewClientLinked(false);
  };

  const handlePackageChange = (val: string | null) => {
    if (!val) return;
    setPackageType(val);
    const pkg = packages.find(p => p.name === val);
    if (pkg) {
      setAmount(pkg.price.toString());
      if (startDate) {
        const s = new Date(startDate);
        const e = new Date(s);
        e.setDate(e.getDate() + pkg.expiryDays);
        setEndDate(format(e, 'yyyy-MM-dd'));
      }
    }
  };

  const handleAddPayment = async () => {
    const finalPackageType = packageType === 'Custom' ? customPackage : packageType;

    if (!clientId || !amount || !finalPackageType) {
      setAlertTitle('Missing Information');
      setAlertDescription('Please select a client, enter an amount, and select a package type.');
      setAlertOpen(true);
      return;
    }

    if (!paymentDate || !startDate) {
      setAlertTitle('Missing Information');
      setAlertDescription('Please select both payment date and start date.');
      setAlertOpen(true);
      return;
    }

    // Validate dates can be parsed
    const paymentDateObj = new Date(paymentDate);
    const startDateObj = new Date(startDate);
    if (isNaN(paymentDateObj.getTime()) || isNaN(startDateObj.getTime())) {
      setAlertTitle('Invalid Date');
      setAlertDescription('Please enter valid dates for payment and start dates.');
      setAlertOpen(true);
      return;
    }

    if (endDate) {
      const endDateObj = new Date(endDate);
      if (isNaN(endDateObj.getTime())) {
        setAlertTitle('Invalid Date');
        setAlertDescription('Please enter a valid end date.');
        setAlertOpen(true);
        return;
      }
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setAlertTitle('Invalid Amount');
      setAlertDescription('The payment amount must be greater than zero. Free payments are not permitted.');
      setAlertOpen(true);
      return;
    }

    if (method === 'Instapay' && (!instapayRef || !/^\d{12}$/.test(instapayRef))) {
      setAlertTitle('Invalid Reference');
      setAlertDescription('Please enter a valid 12-digit Instapay reference number.');
      setAlertOpen(true);
      return;
    }

    const isPT = /\bpt\b/i.test(finalPackageType);
    const resolvedCoachName = coachName === '__custom__' ? customCoachName.trim() : coachName;
    if (isPT && !resolvedCoachName) {
      setAlertTitle('Missing Information');
      setAlertDescription('Please select or enter a coach for this PT package.');
      setAlertOpen(true);
      return;
    }

    const finalAmount = discountedAmount ? parseFloat(discountedAmount) : parseFloat(amount);

    const salesRepUser = users.find(u => {
      const name = u.name || u.email || u.id;
      return name.trim().toLowerCase() === salesName.trim().toLowerCase();
    });
    const salesRepId = salesRepUser ? salesRepUser.id : undefined;

    try {
      const selectedClient = clients.find(c => c.id === clientId);

      // Validation: Check for existing active packages with same type to prevent duplicates
      const existingActivePackage = (selectedClient?.packages || []).find(
        p => p.status === 'Active' && p.packageName === finalPackageType
      );
      if (existingActivePackage) {
        setAlertTitle('Active Package Exists');
        setAlertDescription(`Member "${selectedClient?.name}" already has an active "${finalPackageType}" package. Please upgrade from the Members tab or expire the existing package first.`);
        setAlertOpen(true);
        return;
      }

      const pkg = packages.find(p => p.name === packageType);
      const clientBranch = newClientBranch || selectedClient?.branch || '';

      await processPaymentTransaction({
        clientId,
        clientName: selectedClient?.name || '',
        clientBranch,
        clientStatus: selectedClient?.status,
        clientPackages: selectedClient?.packages,
        amount: finalAmount,
        method,
        instapayRef: method === 'Instapay' ? instapayRef : undefined,
        packageType: finalPackageType,
        packageCategory: isPT ? 'Private Training' : 'Group Training',
        coachName: isPT ? resolvedCoachName : undefined,
        notes,
        sales_rep_id: salesRepId || '',
        salesName: salesName || '',
        recordedBy: recordedById || currentUser?.id || '',
        recordedByName: users.find(u => u.id === (recordedById || currentUser?.id))?.name || '',
        paymentDate: new Date(paymentDate).toISOString(),
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        discountType: discountType ? (discountType as 'percentage' | 'amount') : undefined,
        discountValue: discountValue ? parseFloat(discountValue) : undefined,
        discountedAmount: discountedAmount ? parseFloat(discountedAmount) : undefined,
        isMemberOnHold,
        systemPackage: pkg
      });
    } catch (error) {
      console.error('Error processing payment:', error);
      setAlertTitle('Error');
      setAlertDescription(error instanceof Error ? error.message : 'Failed to record payment. Please try again.');
      setAlertOpen(true);
      return;
    }

      setIsNewPaymentOpen(false);
      setIsCreatingNew(false);
      // Reset form
      setClientId('');
      setClientSearch('');
      setAmount('');
      setMethod('Cash');
      setInstapayRef('');
      setPackageType('');
      setCustomPackage('');
      setCoachName('');
      setCustomCoachName('');
      setNotes('');
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      setEndDate('');
      const sama = users.find(u => u.name?.toLowerCase().includes('sama'));
      setRecordedById(sama?.id || currentUser?.id || '');
      setSalesName('');
      setDiscountType('');
      setDiscountValue('');
      setDiscountedAmount('');
      setIsMemberOnHold(false);
  };

  const handleHoldPayment = async () => {
    if (!holdPaymentId || !holdReason.trim()) {
      setAlertTitle('Missing Information');
      setAlertDescription('Please provide a reason for holding the payment.');
      setAlertOpen(true);
      return;
    }

    try {
      const payment = payments.find(p => p.id === holdPaymentId);
      if (!payment) return;

      await holdPayment(
        holdPaymentId,
        payment.clientId,
        payment.client_name,
        holdReason,
        currentUser?.id || '',
        currentUser?.name || ''
      );

      setIsHoldDialogOpen(false);
      setHoldPaymentId(null);
      setHoldReason('');

      setAlertTitle('Success');
      setAlertDescription(`Payment for ${payment.client_name} has been placed on hold. Member status updated to Hold.`);
      setAlertOpen(true);
    } catch (error) {
      console.error('Error holding payment:', error);
      setAlertTitle('Error');
      setAlertDescription('Failed to place payment on hold.');
      setAlertOpen(true);
    }
  };

  const handleReleasePayment = async (paymentId: string) => {
    try {
      const payment = payments.find(p => p.id === paymentId);
      if (!payment) return;

      await releasePayment(
        paymentId,
        payment.clientId,
        payment.client_name,
        currentUser?.id || '',
        currentUser?.name || ''
      );

      setAlertTitle('Success');
      setAlertDescription(`Payment for ${payment.client_name} has been released from hold. Member status updated to Active.`);
      setAlertOpen(true);
    } catch (error) {
      console.error('Error releasing payment:', error);
      setAlertTitle('Error');
      setAlertDescription('Failed to release payment from hold.');
      setAlertOpen(true);
    }
  };

  const handleUpgradePackage = async () => {
    if (!upgradePaymentId || !upgradePackageType) {
      setAlertTitle('Missing Information');
      setAlertDescription('Please select a package and date.');
      setAlertOpen(true);
      return;
    }

    try {
      const payment = payments.find(p => p.id === upgradePaymentId);
      const client = clients.find(c => c.id === payment?.clientId);
      if (!payment || !client) return;

      const pkg = packages.find(p => p.name === upgradePackageType);
      if (!pkg) return;

      const prevActive = (client.packages || []).find(p => p.status === 'Active');
      const prevSysPkg = prevActive ? packages.find(p => p.name === prevActive.packageName) : null;
      const priceDiff = prevSysPkg ? pkg.price - prevSysPkg.price : pkg.price;
      const amountToPay = Math.max(0, priceDiff);

      await processPaymentTransaction({
        clientId: client.id,
        clientName: client.name,
        clientBranch: client.branch,
        clientStatus: client.status,
        clientPackages: client.packages,
        amount: amountToPay,
        method: upgradeMethod,
        instapayRef: upgradeMethod === 'Instapay' ? upgradeInstapayRef : undefined,
        packageType: pkg.name,
        packageCategory: pkg.name.toLowerCase().includes('pt') || pkg.name.toLowerCase().includes('private') ? 'Private Training' : 'Group Training',
        sales_rep_id: payment.sales_rep_id,
        salesName: payment.salesName || '',
        recordedBy: currentUser?.id || '',
        recordedByName: currentUser?.name || '',
        paymentDate: new Date(upgradeStartDate).toISOString(),
        startDate: new Date(upgradeStartDate).toISOString(),
        systemPackage: pkg,
        previousPackageName: prevActive?.packageName || payment.packageType,
        isUpgradePayment: true
      });

      setIsUpgradeDialogOpen(false);
      setUpgradePaymentId(null);
      setUpgradePackageType('');
      setUpgradeMethod('Cash');
      setUpgradeInstapayRef('');
      setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd'));

      setAlertTitle('Success');
      setAlertDescription(`${client.name} has been upgraded to ${pkg.name}. Payment of ${amountToPay} LE has been recorded.`);
      setAlertOpen(true);
    } catch (error) {
      console.error('Error upgrading package:', error);
      setAlertTitle('Error');
      setAlertDescription(error instanceof Error ? error.message : 'Failed to upgrade package. Please try again.');
      setAlertOpen(true);
    }
  };

  const printInvoice = (payment: Payment, client: any) => {
    const win = window.open('', '_blank');
    if (!win) {
      setAlertTitle('Popups Blocked');
      setAlertDescription('Please allow popups to print invoices.');
      setAlertOpen(true);
      return;
    }
    
    win.document.write(`
      <html>
        <head>
          <title>Invoice - ${payment.id}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
            .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #000; }
            .logo img { max-height: 60px; object-fit: contain; }
            .invoice-title { font-size: 20px; color: #666; text-transform: uppercase; letter-spacing: 2px; margin-top: 10px; }
            .details { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .details-col { flex: 1; }
            .label { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 5px; }
            .value { font-size: 16px; font-weight: 500; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { text-align: left; padding: 12px; border-bottom: 2px solid #ddd; color: #666; }
            td { padding: 12px; border-bottom: 1px solid #eee; }
            .total-row td { font-weight: bold; font-size: 18px; border-top: 2px solid #333; border-bottom: none; }
            .footer { margin-top: 50px; text-align: center; color: #888; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo"><img src="/mitrixogymcrmlogo.png" alt="${branding.companyName}" /></div>
            <div class="invoice-title">Payment Receipt</div>
          </div>
          
          <div class="details">
            <div class="details-col">
              <div class="label">Billed To</div>
              <div class="value">${client?.name || 'Unknown Client'}</div>
              <div class="label">Member ID</div>
              <div class="value">${client?.memberId ? '#' + client.memberId : 'N/A'}</div>
              <div class="label">Branch</div>
              <div class="value">${client?.branch || 'N/A'}</div>
            </div>
            <div class="details-col" style="text-align: right;">
              <div class="label">Receipt No.</div>
              <div class="value">${payment.id.substring(0, 8).toUpperCase()}</div>
              <div class="label">Date</div>
              <div class="value">${format(getEgyptDate(payment.date), 'MMMM d, yyyy h:mm a')}</div>
              <div class="label">Payment Method</div>
              <div class="value">${payment.method} ${payment.instapayRef ? '(Ref: ' + payment.instapayRef + ')' : ''}</div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${payment.packageType} ${payment.coachName ? `<br><span style="font-size: 12px; color: #888;">Coach: ${payment.coachName}</span>` : ''}</td>
                <td style="text-align: right;">${payment.amount.toLocaleString()} LE</td>
              </tr>
              <tr class="total-row">
                <td style="text-align: right;">Total Paid</td>
                <td style="text-align: right;">${payment.amount.toLocaleString()} LE</td>
              </tr>
            </tbody>
          </table>
          
          <div class="footer">
            Thank you for your business!<br>
            ${branding.companyName}
          </div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const getMethodIcon = (method: Payment['method']) => {
    switch (method) {
      case 'Cash': return <Banknote className="h-4 w-4 mr-2 text-green-600" />;
      case 'Credit Card': return <CreditCard className="h-4 w-4 mr-2 text-blue-600" />;
      case 'Bank Transfer': return <FileText className="h-4 w-4 mr-2 text-purple-600" />;
      case 'Instapay': return <Smartphone className="h-4 w-4 mr-2 text-pink-600" />;
      default: return <DollarSign className="h-4 w-4 mr-2 text-gray-600" />;
    }
  };

  const isRep = currentUser?.role === 'rep';

  const deferredSearchTerm = React.useDeferredValue(searchTerm);
  const deferredFilterMethod = React.useDeferredValue(filterMethod);
  const deferredFilterBranch = React.useDeferredValue(filterBranch);
  const deferredFilterPackage = React.useDeferredValue(filterPackage);
  const deferredFilterCoach = React.useDeferredValue(filterCoach);
  const deferredFilterDateFrom = React.useDeferredValue(filterDateFrom);
  const deferredFilterDateTo = React.useDeferredValue(filterDateTo);
  const deferredSortConfig = React.useDeferredValue(sortConfig);
  const deferredFilterShowOnlyHeld = React.useDeferredValue(filterShowOnlyHeld);

  const filteredPayments = React.useMemo(() => {
    const clientMap = new Map();
    for (const client of clients) {
      clientMap.set(client.id, client);
    }

    let result = payments.filter(payment => {
      const client = clientMap.get(payment.clientId);

      // Sales reps only see payments attributed to them.
      // If sales_rep_id is set it is authoritative; otherwise fall back to client-based visibility
      // (payment belongs to a client assigned to this rep) for legacy unattributed records.
      if (isRep && currentUser) {
        const ownPayment = payment.sales_rep_id
          ? payment.sales_rep_id === currentUser.id
          : clientMap.has(payment.clientId);
        if (!ownPayment) return false;
      }

      // Search filter
      if (deferredSearchTerm) {
        const term = deferredSearchTerm.toLowerCase();
        const matchesName = client?.name?.toLowerCase().includes(term);
        const matchesId = client?.memberId?.toString().includes(term);
        const matchesPhone = client?.phone?.includes(term);
        const matchesAmount = payment.amount.toString().includes(term);
        const matchesRef = payment.instapayRef?.toLowerCase().includes(term);

        if (!matchesName && !matchesId && !matchesPhone && !matchesAmount && !matchesRef) return false;
      }

      // Method filter
      if (deferredFilterMethod !== 'All' && payment.method !== deferredFilterMethod) return false;

      // Branch filter (via client)
      if (deferredFilterBranch !== 'All' && client?.branch !== deferredFilterBranch) return false;

      // Sales name filter — canonicalize both sides so variants like "Maison Mohmed" match "Maison Mohamed"
      if (filterSalesName !== 'All') {
        const resolvedSalesName = resolveUserDisplay(payment.salesName, users, payment.salesName || '');
        const canonicalResolved = toCanonical(resolvedSalesName).toLowerCase();
        const canonicalFilter = toCanonical(filterSalesName).toLowerCase();
        if (canonicalResolved !== canonicalFilter) return false;
      }

      // Date filter
      if (deferredFilterDateFrom) {
        if (payment.date.substring(0, 10) < deferredFilterDateFrom) return false;
      }
      if (deferredFilterDateTo) {
        if (payment.date.substring(0, 10) > deferredFilterDateTo) return false;
      }

      // Package filter
      if (deferredFilterPackage !== 'All' && payment.packageType !== deferredFilterPackage) return false;

      // Coach filter
      if (deferredFilterCoach !== 'All' && (payment.coachName || '').toLowerCase() !== deferredFilterCoach.toLowerCase()) return false;

      // Hold filter
      if (deferredFilterShowOnlyHeld && !payment.isOnHold) return false;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      const { key, direction } = deferredSortConfig;
      if (key === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) {
          return direction === 'asc' ? dateA - dateB : dateB - dateA;
        }
        // Tiebreaker: use created_at so same-day payments appear in entry order
        const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return direction === 'asc' ? createdA - createdB : createdB - createdA;
      } else if (key === 'amount') {
        return direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
      return 0;
    });

    return result;
  }, [payments, clients, deferredSearchTerm, deferredFilterMethod, deferredFilterBranch, deferredFilterPackage, deferredFilterCoach, deferredFilterDateFrom, deferredFilterDateTo, deferredSortConfig, isRep, currentUser, filterSalesName, deferredFilterShowOnlyHeld]);

  // Unique package names from all payments (for filter dropdown)
  const uniquePackageNames = React.useMemo(() => {
    const names = new Set<string>();
    payments.forEach(p => { if (p.packageType) names.add(p.packageType); });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [payments]);

  // Unique coach names from all payments that have a coachName
  const uniqueCoachNames = React.useMemo(() => {
    const names = new Set<string>();
    payments.forEach(p => { if (p.coachName) names.add(p.coachName); });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [payments]);

  // PT Coach earnings from FILTERED payments
  const coachEarnings = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of filteredPayments) {
      if (p.coachName) {
        map[p.coachName] = (map[p.coachName] || 0) + p.amount;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredPayments]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, deferredFilterMethod, deferredFilterBranch, deferredFilterPackage, deferredFilterCoach, deferredFilterDateFrom, deferredFilterDateTo, deferredSortConfig, deferredFilterShowOnlyHeld]);

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const paginatedPayments = filteredPayments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const canViewBranchTotals = React.useMemo(() => {
    if (!currentUser) return false;
    if (['super_admin', 'crm_admin', 'manager'].includes(currentUser.role)) return true;
    const n = (currentUser.name || currentUser.email || '').toLowerCase();
    return ['michael', 'magd', 'shady'].some(k => n.includes(k));
  }, [currentUser]);

  const METHODS = ['Cash', 'Credit Card', 'Bank Transfer', 'Instapay', 'Other'] as const;

  const branchTotals = React.useMemo(() => {
    if (!canViewBranchTotals) return null;
    const clientMap = new Map(clients.map(c => [c.id, c]));
    const totals: Record<string, Record<string, number>> = {};
    for (const p of filteredPayments) {
      const branch = clientMap.get(p.clientId)?.branch || 'Unknown';
      if (!totals[branch]) totals[branch] = { Cash: 0, 'Credit Card': 0, 'Bank Transfer': 0, Instapay: 0, Other: 0, Total: 0 };
      const row = totals[branch]!;
      const m = (METHODS as readonly string[]).includes(p.method) ? p.method : 'Other';
      row[m] = (row[m] || 0) + p.amount;
      row.Total = (row.Total || 0) + p.amount;
    }
    return totals;
  }, [canViewBranchTotals, filteredPayments, clients]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">{t('payments.title')}</h2>
        <Dialog open={isNewPaymentOpen} onOpenChange={setIsNewPaymentOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" /> {t('payments.record_payment')}
          </DialogTrigger>
          <DialogContent className="w-full max-w-full md:max-w-[1400px] h-[100dvh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl rounded-none md:rounded-3xl bg-background/95 backdrop-blur-xl">
            <DialogHeader className="p-5 md:p-10 pb-4 md:pb-6 pt-12 md:pt-10 bg-muted/30 border-b">
              <DialogTitle className="text-xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2 md:gap-3">
                <CreditCard className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                {t('payments.record_payment')}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-5 md:p-10 pt-6 md:pt-8 pb-10 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 md:gap-x-10 gap-y-4 md:gap-y-8">
                
                <div className="space-y-3 lg:col-span-2">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.table.client')}</Label>
                  <div className="relative" ref={clientDropdownRef}>
                    <div className="relative">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                      <Input
                        className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 pl-14 pr-5 text-lg focus-visible:ring-primary"
                        placeholder={t('header.search_placeholder')}
                        value={clientSearch}
                        onChange={e => { setClientSearch(e.target.value); setClientDropdownOpen(true); if (!e.target.value) setClientId(''); }}
                        onFocus={() => setClientDropdownOpen(true)}
                      />
                    </div>
                    {clientDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full rounded-2xl border border-white/10 bg-popover shadow-2xl overflow-hidden">
                        {isCreatingNew ? (
                          <div className="p-5 space-y-3">
                            <p className="text-sm font-bold flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" />{t('members.add_member')}</p>
                            <Input
                              placeholder={`${t('leads.table.name')} *`}
                              className="h-10 rounded-xl text-sm bg-background/60"
                              value={newClientName}
                              onChange={e => setNewClientName(e.target.value)}
                              autoFocus
                            />
                            <Input
                              placeholder={`${t('leads.table.phone')} *`}
                              className="h-10 rounded-xl text-sm bg-background/60"
                              value={newClientPhone}
                              onChange={e => setNewClientPhone(e.target.value)}
                            />
                            <select
                              className="flex h-10 w-full rounded-xl border border-input bg-background/60 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={newClientBranch}
                              onChange={e => setNewClientBranch(e.target.value)}
                            >
                              <option value="">{t('leads.branch')}</option>
                              {branches.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                              <Checkbox checked={newClientLinked} onCheckedChange={c => setNewClientLinked(!!c)} />
                              {t('members.linked_family_account')}
                            </label>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" variant="outline" className="flex-1 rounded-xl" onMouseDown={() => { setIsCreatingNew(false); }}>{t('common.cancel')}</Button>
                              <Button size="sm" className="flex-1 rounded-xl font-bold" onMouseDown={handleCreateNewClient} disabled={!newClientName.trim() || !newClientPhone.trim()}>
                                {t('common.create_and_select')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="w-full text-left px-5 py-3 hover:bg-primary/10 transition-colors flex items-center gap-3 border-b border-white/10"
                              onMouseDown={() => { setIsCreatingNew(true); }}
                            >
                              <UserPlus className="h-4 w-4 text-primary shrink-0" />
                              <span className="text-sm font-semibold text-primary">{t('members.add_member')} — {t('common.create_and_select')}</span>
                            </button>
                            <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
                              {clients
                                .filter(c => {
                                  if (!clientSearch) return true;
                                  const t = clientSearch.toLowerCase();
                                  return c.name?.toLowerCase().includes(t) || c.phone?.includes(t) || c.memberId?.toString().includes(t);
                                })
                                .slice(0, 50)
                                .map(client => (
                                  <button
                                    key={client.id}
                                    type="button"
                                    className="w-full text-left px-5 py-3 hover:bg-muted/60 transition-colors flex items-center gap-3"
                                    onMouseDown={() => {
                                      setClientId(client.id);
                                      setClientSearch(`${client.name}${client.phone ? ` (${client.phone})` : ''}`);
                                      setClientDropdownOpen(false);
                                    }}
                                  >
                                    <div>
                                      <div className="font-medium text-sm">{client.name}</div>
                                      <div className="text-xs text-muted-foreground">{[client.phone, client.memberId ? `#${client.memberId}` : null, client.branch].filter(Boolean).join(' · ')}</div>
                                    </div>
                                  </button>
                                ))}
                              {clients.filter(c => {
                                if (!clientSearch) return true;
                                const t = clientSearch.toLowerCase();
                                  return c.name?.toLowerCase().includes(t) || c.phone?.includes(t) || c.memberId?.toString().includes(t);
                              }).length === 0 && (
                                <div className="px-5 py-4 text-sm text-muted-foreground text-center">{t('members.no_members')}</div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.payment_date')}</Label>
                  <Input
                    type="date"
                    className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg"
                    value={paymentDate}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.start_date')}</Label>
                  <Input
                    type="date"
                    className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      const pkg = packages.find(p => p.name === packageType);
                      if (pkg && e.target.value) {
                        const s = new Date(e.target.value);
                        const end = new Date(s);
                        end.setDate(end.getDate() + pkg.expiryDays);
                        setEndDate(format(end, 'yyyy-MM-dd'));
                      }
                    }}
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.end_date')}</Label>
                  <Input
                    type="date"
                    className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.amount')}</Label>
                  <div className="relative">
                    <Input 
                      type="number" 
                      placeholder="0.00" 
                      className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all pl-12 pr-5 text-lg font-bold text-green-600"
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)} 
                    />
                    <DollarSign className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.discount')}</Label>
                  <div className="flex gap-2">
                    <Select value={discountType || 'none'} onValueChange={(v) => {
                      if (v === 'none') {
                        setDiscountType('');
                        setDiscountValue('');
                        setDiscountedAmount('');
                      } else {
                        setDiscountType(v as 'percentage' | 'amount');
                      }
                    }}>
                      <SelectTrigger className="h-12 md:h-14 w-[120px] md:w-[140px] rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-4 text-sm font-medium">
                        <SelectValue placeholder="No Discount" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl">
                        <SelectItem value="none" className="rounded-xl py-3 px-4 italic">No Discount</SelectItem>
                        <SelectItem value="percentage" className="rounded-xl py-3 px-4">Percent (%)</SelectItem>
                        <SelectItem value="amount" className="rounded-xl py-3 px-4">Fixed (LE)</SelectItem>
                      </SelectContent>
                    </Select>
                    {discountType && (
                      <div className="relative flex-1">
                        <Input 
                          type="number" 
                          placeholder={discountType === 'percentage' ? "e.g. 15" : "e.g. 500"} 
                          className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg font-bold text-amber-500"
                          value={discountValue} 
                          onChange={(e) => setDiscountValue(e.target.value)} 
                        />
                      </div>
                    )}
                  </div>
                  {discountedAmount && (
                    <p className="text-xs font-semibold text-emerald-500 ml-1">Final Total: {discountedAmount} LE</p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.payment_method')}</Label>
                  <Select value={method} onValueChange={(v) => v && setMethod(v as Payment['method'])}>
                    <SelectTrigger className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder={t('payments.payment_method')} />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      <SelectItem value="Cash" className="rounded-xl py-3 px-4">{t('dashboard.cash')}</SelectItem>
                      <SelectItem value="Credit Card" className="rounded-xl py-3 px-4">{t('dashboard.visa')}</SelectItem>
                      <SelectItem value="Bank Transfer" className="rounded-xl py-3 px-4">Bank Transfer</SelectItem>
                      <SelectItem value="Instapay" className="rounded-xl py-3 px-4">{t('dashboard.instapay')}</SelectItem>
                      <SelectItem value="Other" className="rounded-xl py-3 px-4">{t('leads.tabs.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {method === 'Instapay' && (
                  <div className="space-y-3">
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.instapay_ref')}</Label>
                    <Input 
                      placeholder="123456789012" 
                      className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg font-mono"
                      value={instapayRef} 
                      maxLength={12}
                      onChange={(e) => setPaymentDate(e.target.value.replace(/\D/g, ''))} 
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.package_type')}</Label>
                  <Select value={packageType} onValueChange={handlePackageChange}>
                    <SelectTrigger className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder={t('payments.package_type')} />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      {packages.map(pkg => (
                        <SelectItem key={pkg.id} value={pkg.name} className="rounded-xl py-3 px-4">
                          {pkg.name} ({pkg.price} LE)
                        </SelectItem>
                      ))}
                      <SelectItem value="Custom" className="rounded-xl py-3 px-4 italic">Custom Package...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {packageType === 'Custom' && (
                  <div className="space-y-3">
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.custom_package_name')}</Label>
                    <Input 
                      placeholder="e.g., 5 S GT Adults" 
                      className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg"
                      value={customPackage} 
                      onChange={(e) => setCustomPackage(e.target.value)} 
                    />
                  </div>
                )}

                {((packageType && packageType !== 'Custom' && /\bpt\b/i.test(packageType)) || (packageType === 'Custom' && /\bpt\b/i.test(customPackage))) && (
                  <div className="space-y-3">
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.coach')}</Label>
                    <Select value={coachName} onValueChange={(v) => { if(!v) return; setCoachName(v); if (v !== '__custom__') setCustomCoachName(''); }}>
                      <SelectTrigger className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                        <SelectValue placeholder={t('payments.coach')} />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-none shadow-2xl">
                        {coaches.filter(c => c.active).map(coach => (
                          <SelectItem key={coach.id} value={coach.name} className="rounded-xl py-3 px-4">{coach.name}</SelectItem>
                        ))}
                        <SelectItem value="__custom__" className="rounded-xl py-3 px-4">Manual Entry...</SelectItem>
                      </SelectContent>
                    </Select>
                    {coachName === '__custom__' && (
                      <Input
                        placeholder="Enter coach name"
                        className="h-12 rounded-xl bg-background/50 mt-2 px-4 shadow-inner"
                        value={customCoachName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomCoachName(e.target.value)}
                      />
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.sales_person')}</Label>
                  <Select value={salesName} onValueChange={v => v && setSalesName(v)}>
                    <SelectTrigger className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder="For commission" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      {uniqueSalesNames.map((name: string) => (
                        <SelectItem key={name} value={name} className="rounded-xl py-3 px-4">{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.recorded_by')}</Label>
                  <Select value={recordedById} onValueChange={v => v && setRecordedById(v)}>
                    <SelectTrigger className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder="Staff member">
                         {adminUsers.find(u => u.id === recordedById)?.name || undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      {adminUsers.map(u => (
                        <SelectItem key={u.id} value={u.id} className="rounded-xl py-3 px-4">{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 lg:col-span-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.internal_notes')}</Label>
                  <Input
                    placeholder="Add descriptive notes for this transaction..."
                    className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-6 md:mt-12 flex gap-3 pb-safe">
                <Button 
                  variant="outline" 
                  className="h-12 md:h-16 px-6 md:px-10 rounded-xl md:rounded-2xl text-sm md:text-lg font-bold border-white/10 hover:bg-muted/50 transition-all"
                  onClick={() => setIsNewPaymentOpen(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button 
                  onClick={handleAddPayment} 
                  className="flex-1 h-12 md:h-16 rounded-xl md:rounded-2xl text-base md:text-xl font-extrabold shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  {t('payments.complete_transaction')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9 gap-4 mb-6 bg-card p-4 rounded-xl border shadow-sm">
        <div className="space-y-1.5 xl:col-span-1">
          <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('payments.filters.search')}</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder={t('payments.filters.search')} 
              className="pl-9 h-11 bg-muted/30 border-none focus-visible:ring-1"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('payments.filters.method')}</Label>
          <select 
            className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-none"
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
          >
            <option value="All">{t('common.all_methods')}</option>
            <option value="Cash">{t('dashboard.cash')}</option>
            <option value="Credit Card">{t('dashboard.visa')}</option>
            <option value="Bank Transfer">{t('common.bank_transfer')}</option>
            <option value="Instapay">{t('dashboard.instapay')}</option>
            <option value="Other">{t('common.other')}</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('payments.filters.branch')}</Label>
          <select 
            className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-none"
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
          >
            <option value="All">{t('dashboard.all_branches')}</option>
            <option value="COMPLEX">COMPLEX</option>
            <option value="MIVIDA">MIVIDA</option>
            <option value="mitrixogymcrm IMPACT">mitrixogymcrm IMPACT</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('payments.filters.package')}</Label>
          <select
            className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-none"
            value={filterPackage}
            onChange={(e) => setFilterPackage(e.target.value)}
          >
            <option value="All">{t('common.all_packages')}</option>
            {uniquePackageNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('payments.filters.pt_coach')}</Label>
          <select
            className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-none"
            value={filterCoach}
            onChange={(e) => setFilterCoach(e.target.value)}
          >
            <option value="All">{t('common.all_coaches')}</option>
            {uniqueCoachNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('payments.filters.sales_person')}</Label>
          <select 
            className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-none"
            value={filterSalesName}
            onChange={(e) => setFilterSalesName(e.target.value)}
          >
            <option value="All">{t('dashboard.all_reps')}</option>
            {uniqueSalesNames.map((name: string) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('payments.filters.from_date')}</Label>
          <Input 
            type="date"
            className="flex h-11 w-full rounded-md bg-muted/30 px-3 py-2 text-sm border-none focus-visible:ring-1"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('payments.filters.to_date')}</Label>
          <Input 
            type="date"
            className="flex h-11 w-full rounded-md bg-muted/30 px-3 py-2 text-sm border-none focus-visible:ring-1"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground ml-1">{t('payments.filters.sort_by')}</Label>
          <select
            className="flex h-11 w-full items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-none"
            value={`${sortConfig.key}-${sortConfig.direction}`}
            onChange={(e) => {
              const [key, direction] = e.target.value.split('-');
              setSortConfig({ key: key as keyof Payment, direction: direction as 'asc' | 'desc' });
            }}
          >
            <option value="date-desc">{t('payments.filters.sort_options.newest_first')}</option>
            <option value="date-asc">{t('payments.filters.sort_options.oldest_first')}</option>
            <option value="amount-desc">{t('payments.filters.sort_options.amount_high_low')}</option>
            <option value="amount-asc">{t('payments.filters.sort_options.amount_low_high')}</option>
          </select>
        </div>

        <div className="flex items-center gap-3 xl:col-span-1">
          <Checkbox
            id="filterHeld"
            checked={filterShowOnlyHeld}
            onCheckedChange={(checked) => setFilterShowOnlyHeld(checked as boolean)}
          />
          <Label htmlFor="filterHeld" className="text-xs font-semibold text-muted-foreground cursor-pointer">
            {t('payments.filters.show_only_held')}
          </Label>
        </div>
      </div>

      {/* ── PT Coach Earnings (visible only when there are PT payments in the current view) ── */}
      {coachEarnings.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {t('payments.coach_earnings.title')}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                — {t('payments.coach_earnings.based_on_filters')} ({filteredPayments.filter(p => p.coachName).length} {t('payments.coach_earnings.pt_payments')})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="flex flex-wrap gap-3">
              {coachEarnings.map(([coach, total]) => (
                <div
                  key={coach}
                  className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-2.5 shadow-sm hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => setFilterCoach(filterCoach === coach ? 'All' : coach)}
                  title={filterCoach === coach ? 'Click to clear coach filter' : `Click to filter by ${coach}`}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {coach.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className={`text-sm font-semibold leading-tight ${filterCoach === coach ? 'text-primary' : ''}`}>{coach}</div>
                    <div className="text-xs text-green-600 font-bold">{total.toLocaleString()} {t('payments.currency_le')}</div>
                  </div>
                  {filterCoach === coach && (
                    <Badge className="text-[10px] bg-primary/10 text-primary border-none ml-1">{t('common.selected')}</Badge>
                  )}
                </div>
              ))}
              {/* Grand total PT revenue */}
              <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-2.5 shadow-sm ml-auto">
                <div>
                  <div className="text-xs text-muted-foreground font-medium">{t('payments.coach_earnings.total_pt_revenue')}</div>
                  <div className="text-base font-extrabold text-primary">
                    {coachEarnings.reduce((sum, [, v]) => sum + v, 0).toLocaleString()} {t('payments.currency_le')}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('payments.table.date')}</TableHead>
                  <TableHead>{t('payments.table.client')}</TableHead>
                  <TableHead>{t('payments.table.amount')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('payments.table.branch')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('payments.table.method')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('payments.table.package')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('payments.table.recorded_by')}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t('payments.table.sales_member')}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t('payments.table.notes')}</TableHead>
                  <TableHead className="text-right">{t('payments.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPayments.length > 0 ? (
                  paginatedPayments.map(payment => {
                    const client = clients.find(c => c.id === payment.clientId);
                    const recordedByUser = users.find(u => u.id === payment.recordedBy);
                    // Fallback: use stored name, then default to Atef mitrixogymcrm for imported/unknown records
                    const recordedByLabel = recordedByUser?.name
                      || (payment as any).recordedByName
                      || (users.find(u => u.name?.toLowerCase().includes('atef') && u.name?.toLowerCase().includes('mitrixogymcrm'))?.name ?? 'Atef mitrixogymcrm');
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="text-xs sm:text-sm">
                          {payment.date ? (() => {
                            const egyptDate = getEgyptDate(payment.date);
                            const paymentYear = egyptDate.getFullYear();
                            return (
                              <>
                                <div className="font-medium">
                                  {format(egyptDate, 'MMM d')}
                                  {paymentYear !== new Date().getFullYear() && (
                                    <span className="text-[10px] text-amber-600 font-semibold ml-1">
                                      {paymentYear}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-muted-foreground">{format(egyptDate, 'h:mm a')}</div>
                              </>
                            );
                          })() : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-xs sm:text-sm">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span>{client?.name || t('payments.table.unknown_client')}</span>
                              {payment.isOnHold && (
                                <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-[10px]" title={payment.holdReason || t('payments.hold')}>
                                  {t('payments.hold')}
                                </Badge>
                              )}
                            </div>
                            {payment.isOnHold && payment.holdReason && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400">{payment.holdReason}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-green-600 text-xs sm:text-sm">{payment.amount.toLocaleString()} {t('payments.currency_le')}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="secondary" className="text-[10px]">
                            {payment.branch || client?.branch || t('leads.tabs.unassigned')}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center">
                            {getMethodIcon(payment.method)}
                            <div>
                              <div className="text-xs sm:text-sm">
                                {payment.method === 'Cash' ? t('dashboard.cash') : payment.method === 'Credit Card' ? t('dashboard.visa') : payment.method === 'Bank Transfer' ? t('common.bank_transfer') : payment.method === 'Instapay' ? t('dashboard.instapay') : payment.method === 'Other' ? t('common.other') : payment.method}
                              </div>
                              {payment.instapayRef && (
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  {t('payments.ref')}: {payment.instapayRef}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant="outline" className="text-[10px] sm:text-xs">{payment.packageType}</Badge>
                            {payment.coachName && (
                              <span className="text-[10px] text-muted-foreground flex items-center">
                                <span className="font-medium">{t('payments.coach')}:</span> <span className="ml-1">{payment.coachName}</span>
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs sm:text-sm hidden lg:table-cell">
                          {recordedByLabel}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {payment.salesName ? (
                            <Badge variant="outline" className="flex items-center gap-1 w-fit bg-amber-50 dark:bg-amber-900/10 text-amber-600 border-amber-200">
                              <User className="h-3 w-3" />
                              {resolveUserDisplay(payment.salesName, users, payment.salesName || '')}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs hidden xl:table-cell">{payment.notes || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => printInvoice(payment, client)} title={t('payments.print_invoice')}>
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Dialog open={isUpgradeDialogOpen && upgradePaymentId === payment.id} onOpenChange={(open) => {
                              if (open) {
                                setUpgradePaymentId(payment.id);
                                setIsUpgradeDialogOpen(true);
                                setUpgradePackageType('');
                                setUpgradeMethod(payment.method || 'Cash');
                                setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd'));
                              } else {
                                setIsUpgradeDialogOpen(false);
                                setUpgradePaymentId(null);
                              }
                            }}>
                              <DialogTrigger render={<Button variant="ghost" size="sm" title={t('payments.upgrade_package')} className="text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" />}>
                                <TrendingUp className="h-4 w-4" />
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader>
                                  <DialogTitle>{t('payments.upgrade.title')}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <p className="text-sm text-muted-foreground">
                                    {t('payments.upgrade.hint').split(/(\{name\}|\{package\})/g).map((part, i) => {
                                      if (part === '{name}') return <strong key={i}>{client?.name}</strong>;
                                      if (part === '{package}') return <strong key={i}>{payment.packageType}</strong>;
                                      return part;
                                    })}
                                  </p>
                                  <div className="space-y-2">
                                    <Label htmlFor="upgradePackage" className="text-sm font-semibold">{t('payments.upgrade.new_package')}</Label>
                                    <Select value={upgradePackageType} onValueChange={(v) => v && setUpgradePackageType(v)}>
                                      <SelectTrigger>
                                        <SelectValue placeholder={t('payments.upgrade.select_package')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {packages.map(pkg => (
                                          <SelectItem key={pkg.id} value={pkg.name}>
                                            {pkg.name} ({pkg.price} {t('payments.currency_le')})
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                      <Label htmlFor="upgradeDate" className="text-sm font-semibold">{t('payments.upgrade.upgrade_date')}</Label>
                                      <Input
                                        id="upgradeDate"
                                        type="date"
                                        value={upgradeStartDate}
                                        onChange={(e) => setUpgradeStartDate(e.target.value)}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="upgradeMethod" className="text-sm font-semibold">{t('payments.upgrade.method')}</Label>
                                      <Select value={upgradeMethod} onValueChange={(v) => v && setUpgradeMethod(v as Payment['method'])}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="Cash">{t('dashboard.cash')}</SelectItem>
                                          <SelectItem value="Credit Card">{t('dashboard.visa')}</SelectItem>
                                          <SelectItem value="Bank Transfer">{t('common.bank_transfer')}</SelectItem>
                                          <SelectItem value="Instapay">{t('dashboard.instapay')}</SelectItem>
                                          <SelectItem value="Other">{t('common.other')}</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                  {upgradeMethod === 'Instapay' && (
                                    <div className="space-y-2">
                                      <Label htmlFor="upgradeInstapay" className="text-sm font-semibold">{t('payments.upgrade.instapay_ref')}</Label>
                                      <Input
                                        id="upgradeInstapay"
                                        placeholder="123456789012"
                                        maxLength={12}
                                        value={upgradeInstapayRef}
                                        onChange={(e) => setUpgradeInstapayRef(e.target.value.replace(/\D/g, ''))}
                                      />
                                    </div>
                                  )}
                                  <div className="flex gap-2 justify-end pt-4">
                                    <Button variant="outline" onClick={() => setIsUpgradeDialogOpen(false)}>
                                      {t('common.cancel')}
                                    </Button>
                                    <Button onClick={handleUpgradePackage} className="bg-blue-600 hover:bg-blue-700">
                                      {t('payments.upgrade.process_upgrade')}
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                            {['manager', 'super_admin', 'crm_admin'].includes(currentUser?.role || '') && (
                              <Dialog open={editingPaymentId === payment.id} onOpenChange={(open) => {
                                if (open) {
                                  setEditingPaymentId(payment.id);
                                  setEditAmount(payment.amount.toString());
                                  setEditNotes(payment.notes || '');
                                  setEditBranch(payment.branch || client?.branch || '');
                                  setEditMethod(payment.method);
                                  setEditSalesName(payment.salesName || '');
                                  setEditClientName(client?.name || '');
                                  setEditClientPhone(client?.phone || client?.memberId || '');
                                  setEditPaymentDate(payment.date ? payment.date.substring(0, 10) : format(new Date(), 'yyyy-MM-dd'));
                                } else {
                                  setEditingPaymentId(null);
                                }
                              }}>
                                <DialogTrigger render={<Button variant="ghost" size="sm" title={t('payments.edit_payment')} />}>
                                  <DollarSign className="h-4 w-4" />
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>{t('payments.edit.title')} - {client?.name}</DialogTitle>
                                  </DialogHeader>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <Label className="text-xs font-semibold">{t('payments.edit.payment_date')}</Label>
                                      <Input
                                        type="date"
                                        value={editPaymentDate}
                                        onChange={(e) => setEditPaymentDate(e.target.value)}
                                        max={format(new Date(), 'yyyy-MM-dd')}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">{t('payments.edit.customer_name')}</Label>
                                      <Input
                                        value={editClientName}
                                        onChange={(e) => setEditClientName(e.target.value)}
                                        placeholder={t('payments.edit.customer_name')}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">{t('payments.edit.customer_phone')}</Label>
                                      <Input
                                        value={editClientPhone}
                                        onChange={(e) => setEditClientPhone(e.target.value)}
                                        placeholder={t('payments.edit.customer_phone')}
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">{t('payments.edit.branch')}</Label>
                                      <Select value={editBranch} onValueChange={(val) => setEditBranch(val || '')}>
                                        <SelectTrigger className="h-9">
                                          <SelectValue placeholder={t('payments.edit.select_branch')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {branches.map(b => (
                                            <SelectItem key={b} value={b}>{b}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">{t('payments.edit.method')}</Label>
                                      <Select value={editMethod} onValueChange={(val) => setEditMethod(val as Payment['method'])}>
                                        <SelectTrigger className="h-9">
                                          <SelectValue placeholder={t('payments.edit.select_method')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="Cash">{t('dashboard.cash')}</SelectItem>
                                          <SelectItem value="Credit Card">{t('dashboard.visa')}</SelectItem>
                                          <SelectItem value="Bank Transfer">{t('common.bank_transfer')}</SelectItem>
                                          <SelectItem value="Instapay">{t('dashboard.instapay')}</SelectItem>
                                          <SelectItem value="Other">{t('common.other')}</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">{t('payments.edit.sales_name')}</Label>
                                      <Select value={editSalesName} onValueChange={(val) => setEditSalesName(val || '')}>
                                        <SelectTrigger className="h-9">
                                          <SelectValue placeholder={t('payments.edit.select_sales_rep')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {uniqueSalesNames.map((name: string) => (
                                            <SelectItem key={name} value={name}>
                                              {name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold">{t('payments.edit.amount')}</Label>
                                      <Input
                                        type="number"
                                        value={editAmount}
                                        onChange={(e) => setEditAmount(e.target.value)}
                                        step="0.01"
                                      />
                                    </div>
                                    <div className="col-span-2">
                                      <Label className="text-xs font-semibold">{t('payments.edit.notes')}</Label>
                                      <Input
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        placeholder={t('payments.edit.notes_placeholder')}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex gap-2 mt-6">
                                    <Button
                                      variant="outline"
                                      onClick={() => setEditingPaymentId(null)}
                                    >
                                      {t('common.cancel')}
                                    </Button>
                                    <Button
                                      onClick={async () => {
                                        const salesRepUser = users.find(u => 
                                          u.name === editSalesName || 
                                          u.id === editSalesName || 
                                          (u.name && editSalesName && u.name.trim().toLowerCase() === editSalesName.trim().toLowerCase())
                                        );
                                        const salesRepId = salesRepUser ? salesRepUser.id : undefined;

                                        await updatePayment(payment.id, {
                                          amount: parseFloat(editAmount),
                                          notes: editNotes || undefined,
                                          branch: editBranch || undefined,
                                          method: editMethod,
                                          salesName: editSalesName || undefined,
                                          sales_rep_id: salesRepId || undefined,
                                          date: editPaymentDate ? new Date(editPaymentDate).toISOString() : payment.date,
                                        });
                                        setEditingPaymentId(null);
                                      }}
                                    >
                                      {t('payments.edit.save_changes')}
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                            {!payment.isOnHold ? (
                              <Dialog open={isHoldDialogOpen && holdPaymentId === payment.id} onOpenChange={(open) => {
                                if (open) {
                                  setHoldPaymentId(payment.id);
                                  setIsHoldDialogOpen(true);
                                  setHoldReason('');
                                } else {
                                  setIsHoldDialogOpen(false);
                                  setHoldPaymentId(null);
                                  setHoldReason('');
                                }
                              }}>
                                <DialogTrigger render={<Button variant="ghost" size="sm" title={t('payments.hold_payment')} className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" />}>
                                  <Pause className="h-4 w-4" />
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>{t('payments.hold_dialog.title')}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <p className="text-sm text-muted-foreground">
                                      {t('payments.hold_dialog.hint').split(/(\{name\})/g).map((part, i) => {
                                        if (part === '{name}') return <strong key={i}>{client?.name}</strong>;
                                        return part;
                                      })}
                                    </p>
                                    <div className="space-y-2">
                                      <Label htmlFor="holdReason" className="text-sm font-semibold">{t('payments.hold_dialog.reason')}</Label>
                                      <Input
                                        id="holdReason"
                                        placeholder={t('payments.hold_dialog.reason_placeholder')}
                                        value={holdReason}
                                        onChange={(e) => setHoldReason(e.target.value)}
                                        className="rounded-lg"
                                      />
                                    </div>
                                    <div className="flex gap-2 justify-end pt-4">
                                      <Button variant="outline" onClick={() => setIsHoldDialogOpen(false)}>
                                        {t('common.cancel')}
                                      </Button>
                                      <Button onClick={handleHoldPayment} className="bg-amber-600 hover:bg-amber-700">
                                        {t('payments.hold_dialog.confirm_hold')}
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                                onClick={() => handleReleasePayment(payment.id)}
                                title={t('payments.release_payment')}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {canDeletePayment && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`${payment.isOnHold ? 'opacity-50 cursor-not-allowed' : 'text-destructive hover:bg-destructive/10'}`}
                                onClick={() => handleDeletePayment(payment.id)}
                                title={payment.isOnHold ? t('payments.cannot_delete_held') : t('payments.delete_payment')}
                                disabled={payment.isOnHold}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {t('payments.no_payments')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            {t('common.showing')} {(currentPage - 1) * itemsPerPage + 1} {t('common.to')} {Math.min(currentPage * itemsPerPage, filteredPayments.length)} {t('common.of')} {filteredPayments.length} {t('common.entries')}
          </p>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{t('common.page')} {currentPage} {t('common.of')} {totalPages}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {canViewBranchTotals && branchTotals && Object.keys(branchTotals).length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-semibold">{t('payments.revenue_by_branch')}</h3>
            {(filterDateFrom || filterDateTo) && (
              <span className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                {filterDateFrom && filterDateTo
                  ? `${filterDateFrom} → ${filterDateTo}`
                  : filterDateFrom
                  ? `${t('payments.branch_totals.from')} ${filterDateFrom}`
                  : `${t('payments.branch_totals.until')} ${filterDateTo}`}
              </span>
            )}
            <span className="text-sm text-muted-foreground">· {filteredPayments.length} {t('nav.payments')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(branchTotals)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([branch, data]) => (
              <Card key={branch} className="bg-card border shadow-sm">
                <CardHeader className="pb-3 pt-4 px-5">
                  <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{branch}</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 space-y-2">
                  {METHODS.map(m => (data[m] ?? 0) > 0 && (
                    <div key={m} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        {getMethodIcon(m as Payment['method'])}
                        {m === 'Cash' ? t('dashboard.cash') : m === 'Credit Card' ? t('dashboard.visa') : m === 'Bank Transfer' ? t('common.bank_transfer') : m === 'Instapay' ? t('dashboard.instapay') : m === 'Other' ? t('common.other') : m}
                      </span>
                      <span className="font-medium tabular-nums">{(data[m] ?? 0).toLocaleString()} {t('payments.currency_le')}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t font-bold">
                    <span>{t('payments.branch_totals.total')}</span>
                    <span className="text-primary tabular-nums">{(data.Total || 0).toLocaleString()} {t('payments.currency_le')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {Object.keys(branchTotals).length > 1 && (
            <div className="mt-4 flex justify-end">
              <div className="bg-primary/10 border border-primary/20 rounded-xl px-6 py-3 flex items-center gap-6">
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('payments.branch_totals.grand_total')}</span>
                <span className="text-2xl font-extrabold text-primary tabular-nums">
                  {Object.values(branchTotals).reduce((sum, d) => sum + (d.Total || 0), 0).toLocaleString()} {t('payments.currency_le')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">{t('payments.available_packages')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map(pkg => (
            <Card key={pkg.id} className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{pkg.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">{t('payments.packages_list.price')}</span>
                  <span className="font-bold text-primary">{pkg.price.toLocaleString()} {t('payments.currency_le')}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">{t('payments.packages_list.sessions')}</span>
                  <span className="font-medium">{pkg.sessions}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t('payments.packages_list.expiry')}</span>
                  <span className="text-xs">{pkg.expiryDays} {t('payments.days')}</span>
                </div>
                {pkg.branch !== 'ALL' && (
                  <div className="mt-3 pt-3 border-t">
                    <Badge variant="outline" className="text-[10px]">{pkg.branch} {t('payments.packages_list.branch')}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {packages.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full text-center py-4">
              {t('payments.packages_list.no_packages')}
            </p>
          )}
        </div>
      </div>

      <AlertDialog 
        isOpen={alertOpen}
        onOpenChange={setAlertOpen}
        title={alertTitle}
        description={alertDescription}
      />
    </div>
  );
}
