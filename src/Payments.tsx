import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from './context';
import { useLanguage } from './contexts/LanguageContext';
import { SALES_NAME_MAPPING, toCanonical } from './constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO, addDays } from 'date-fns';
import { safeFormatDate, safeAddDays, toValidDate, safeIsoDate } from './utils/dateUtils';
import { Payment, Client, RefundDetails } from './types';
import { resolveUserDisplay } from './utils/resolveUserDisplay';
import { calculatePricing, formatCurrencyAmount } from './utils/pricing';
import { getEgyptDate } from './utils';
import { holdPayment, releasePayment, getHoldStatusInfo } from './utils/holdUtils';
import { Plus, DollarSign, CreditCard, Banknote, FileText, Smartphone, Printer, Search, Trash2, ChevronLeft, ChevronRight, User, UserPlus, Pause, Play, TrendingUp, Receipt, RotateCcw, Tag, MoreHorizontal, SlidersHorizontal, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog } from './components/AlertDialog';
import { PaymentCategory, PAYMENT_CATEGORIES, resolvePaymentCategory } from './utils/paymentCategories';
import { createApprovalRequest } from './services/approvalService';
import CascadingPackageSelector from './components/CascadingPackageSelector';
import { canReassignMemberSalesRep, isPaymentEditableByStaff, getRevenueScopeForUser, isPaymentInRevenueScope } from './utils/permissions';
import { validateMembershipEligibility } from './utils/membershipRules';
import { resolvePaymentBranch, normalizeBranchName } from './utils/branchUtils';
import { matchesPhoneSearch } from './utils/phoneUtils';
import { matchesFuzzyNameSearch, scoreNameMatch } from './utils/fuzzyNameSearch';
import { toCanonicalBranchId } from './utils/memberCategories';
import { isTenantInzan, isValidNationalIdOrPassport, isValidEgyptianMobile } from './utils/inzanOrg';
import { getTenantId, storage } from './firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addAuditLog } from './services/auditService';
import { useOperationId } from './hooks/useOperationId';
import { ShieldAlert, Paperclip, MessageCircle, CheckCircle, Clock, Download } from 'lucide-react';
import { calculateSplitTenderRemaining, splitInstallmentsEvenly } from './utils/installmentSplitter';
import { buildWhatsAppPaymentReceiptUrl, openWhatsAppUrl } from './utils/whatsappTemplates';
import {
  validateOrExtractInstapayRef,
  calculateBnplSchedule,
  buildWhatsAppPaymentLinkUrl,
  generateEgyptianEtaTaxCsv,
} from './utils/egyptianPayments';
import { ShiftHandoverDialog } from './components/ShiftHandoverDialog';

export default function Payments() {
  const { t, language, isRtl } = useLanguage();
  const {
    clients,
    users,
    updateClient,
    addClient,
    currentUser,
    branding,
    canDeletePayments,
    branches,
    processPaymentTransaction,
    setActiveTab,
    setActiveClientId,
    features,
    packages,
    coaches,
    payments,
    addPayment,
    deletePayment,
    updatePayment,
    fetchExpiredMembers,
    expiredLoaded,
    loadingExpired,
    can,
  } = useAppContext();
  const visiblePackages = React.useMemo(() => {
    return packages.filter(p => {
      const active = p.isActive !== false && p.is_active !== false && !p.archivedAt;
      return active && (features?.ptPackages !== false || p.type !== 'Private');
    });
  }, [packages, features]);
  const [isNewPaymentOpen, setIsNewPaymentOpen] = useState(false);
  const [isShiftHandoverOpen, setIsShiftHandoverOpen] = useState(false);
  const [bnplMonths, setBnplMonths] = useState<3 | 6 | 9 | 12>(6);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const isInzan = isTenantInzan(branding?.companyName) || getTenantId() === 'inzanathletics';
  const isCurrentUserAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'crm_admin';
  const isSalesManager = canReassignMemberSalesRep(currentUser);

  // RedGITS v17.12 Parity: Dual-Tender Split Payment + Even Installment Schedule Builder State
  const [useSplitTender, setUseSplitTender] = useState(false);
  const [secondaryMethod, setSecondaryMethod] = useState<Payment['method']>('Credit Card');
  const [primaryTenderAmount, setPrimaryTenderAmount] = useState('');
  const [installmentCount, setInstallmentCount] = useState(2);
  const [firstInstallmentDueDate, setFirstInstallmentDueDate] = useState(() => format(addDays(new Date(), 30), 'yyyy-MM-dd'));

  // Corporate Discount Verification State
  const [discountReason, setDiscountReason] = useState<'Standard' | 'Corporate' | 'Referral' | 'Promotional'>('Standard');
  const [corporateProofUrl, setCorporateProofUrl] = useState<string>('');
  const [corporateProofFileName, setCorporateProofFileName] = useState<string>('');
  const [isUploadingCorporateProof, setIsUploadingCorporateProof] = useState<boolean>(false);

  // Pre-Payment Verification Gate (National ID) State
  const [inlineNationalId, setInlineNationalId] = useState<string>('');
  const [newClientNationalId, setNewClientNationalId] = useState<string>('');
  const [isSavingNationalId, setIsSavingNationalId] = useState<boolean>(false);

  // Sales Rep Reassign Confirmation Dialog State
  const [salesReassignConfirmOpen, setSalesReassignConfirmOpen] = useState<boolean>(false);
  const [pendingSalesName, setPendingSalesName] = useState<string>('');
  const [reassignPaymentTarget, setReassignPaymentTarget] = useState<{ isEdit: boolean; oldName: string; newName: string; paymentId?: string } | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editMethod, setEditMethod] = useState<Payment['method']>('Cash');
  const [editSalesName, setEditSalesName] = useState('');
  const [editCoachName, setEditCoachName] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertDescription, setAlertDescription] = useState('');
  
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'Original Method' | 'Cash' | 'Bank Transfer'>('Original Method');
  
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
  const [newClientGender, setNewClientGender] = useState<'Male' | 'Female' | 'Other' | 'Prefer not to say'>('Male');
  const [newClientCategory, setNewClientCategory] = useState<'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults'>('Adults');
  const [pendingNewPhone, setPendingNewPhone] = useState<string | null>(null);
  const [isWalkInGuest, setIsWalkInGuest] = useState(false);
  const [guestClientName, setGuestClientName] = useState('');
  const [paymentBranch, setPaymentBranch] = useState('');

  useEffect(() => {
    if (!expiredLoaded && !loadingExpired && fetchExpiredMembers) {
      fetchExpiredMembers();
    }
  }, [expiredLoaded, loadingExpired, fetchExpiredMembers]);

  useEffect(() => {
    if (!pendingNewPhone) return;
    const found = clients.find(c => c.phone === pendingNewPhone || matchesPhoneSearch(c.phone, pendingNewPhone));
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
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentCategory, setPaymentCategory] = useState<PaymentCategory>('Memberships');
  const [packageCategoryFilter, setPackageCategoryFilter] = useState<'All' | 'Membership' | 'PT' | 'Classes' | 'SGF' | 'Nutrition'>('All');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [isMemberOnHold, setIsMemberOnHold] = useState(false);

  const modalFilteredPackages = React.useMemo(() => {
    if (packageCategoryFilter === 'All') return visiblePackages;
    return visiblePackages.filter((pkg) => {
      const cat = (pkg.category || '').toLowerCase();
      const name = (pkg.name || '').toLowerCase();
      const type = (pkg.type || '').toLowerCase();
      const resolved = resolvePaymentCategory(pkg.name);
      switch (packageCategoryFilter) {
        case 'PT':
          return cat === 'pt' || cat.includes('private') || type === 'private' || resolved === 'PT' || name.includes('pt');
        case 'Classes':
          return cat.includes('class') || resolved === 'Classes' || name.includes('class');
        case 'SGF':
          return cat.includes('sgf') || name.includes('sgf') || name.includes('small group');
        case 'Nutrition':
          return cat.includes('nutrition') || name.includes('nutrition') || pkg.targetTeam === 'Nutrition';
        case 'Membership':
          return (
            cat.includes('membership') ||
            (resolved === 'Memberships' &&
              !cat.includes('sgf') &&
              !name.includes('sgf') &&
              !cat.includes('nutrition') &&
              !name.includes('nutrition'))
          );
        default:
          return true;
      }
    });
  }, [visiblePackages, packageCategoryFilter]);

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

  // Stable operation ids for payment flows (reset when each dialog opens)
  const { operationId: newPaymentOperationId, resetOperationId: resetNewPaymentOperationId } = useOperationId();
  const { operationId: upgradeOperationId, resetOperationId: resetUpgradeOperationId } = useOperationId();

  useEffect(() => { if (isNewPaymentOpen) resetNewPaymentOperationId(); }, [isNewPaymentOpen, resetNewPaymentOperationId]);
  useEffect(() => { if (isUpgradeDialogOpen) resetUpgradeOperationId(); }, [isUpgradeDialogOpen, resetUpgradeOperationId]);

  // Warn before navigating away when the new-payment form has unsaved data
  const isFormDirty = isNewPaymentOpen && (clientSearch.trim() !== '' || amount.trim() !== '' || amountPaid.trim() !== '');

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

  const adminUsers = React.useMemo(
    () =>
      users.filter(u =>
        ['admin', 'super_admin', 'crm_admin', 'manager', 'rep', 'sales_rep', 'sales'].includes(u.role?.toLowerCase() || '')
      ),
    [users]
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

  const canApplyDiscount = can('payments.apply_discount') || isCurrentUserAdmin || currentUser?.role === 'manager';
  const pricingBreakdown = calculatePricing({
    grossAmount: amount ? Number(amount) : 0,
    discountType: discountType || 'none',
    discountValue: discountValue ? Number(discountValue) : undefined,
    amountPaid: amountPaid ? Number(amountPaid) : undefined,
  });

  useEffect(() => {
    if (pricingBreakdown.valid) {
      setDiscountedAmount(pricingBreakdown.netAmount.toFixed(2));
    } else {
      setDiscountedAmount('');
    }
  }, [pricingBreakdown.netAmount, pricingBreakdown.valid]);

  const handleCreateNewClient = async () => {
    if (!newClientName.trim() || !newClientPhone.trim()) return;
    if (isInzan && !isValidNationalIdOrPassport(newClientNationalId)) {
      setAlertTitle('National ID Required');
      setAlertDescription('Inzan policy requires a valid Egyptian National ID (14 digits) or Passport before creating an account.');
      setAlertOpen(true);
      return;
    }
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
      gender: newClientGender,
      memberCategory: newClientCategory,
      nationalId: newClientNationalId.trim() || undefined,
    } as any);
    setPendingNewPhone(newClientPhone.trim());
    setIsCreatingNew(false);
    setClientDropdownOpen(false);
    setNewClientName('');
    setNewClientPhone('');
    setNewClientBranch('');
    setNewClientLinked(false);
    setNewClientGender('Male');
    setNewClientCategory('Adults');
    setNewClientNationalId('');
  };

  const handlePackageChange = (val: string | null) => {
    if (!val) return;
    setPackageType(val);
    const pkg = packages.find(p => p.name === val);
    if (pkg) {
      setAmount(pkg.price.toString());
      setPaymentCategory(resolvePaymentCategory(pkg.name));
      if (startDate) {
        const end = safeAddDays(startDate, pkg.expiryDays);
        setEndDate(safeFormatDate(end, 'yyyy-MM-dd', ''));
      }
    }
  };

  const handleAddPayment = async () => {
    const finalPackageType = packageType === 'Custom' ? customPackage : packageType;
    const isGuest = clientId === 'WALK-IN-GUEST' || isWalkInGuest;
    const resolvedGuestName = (guestClientName || clientSearch).trim();
    const selectedClient = !isGuest ? clients.find(c => c.id === clientId) : null;

    // Inzan Mandatory Verification Gate: National ID Enforcement
    if (isInzan) {
      const effectiveId = (!isGuest ? (selectedClient?.nationalId || inlineNationalId) : inlineNationalId) || '';
      if (!isValidNationalIdOrPassport(effectiveId)) {
        setAlertTitle('National ID Required');
        setAlertDescription('Inzan policy strictly requires a verified Egyptian National ID (14 digits) or Passport before completing payment. Please enter and verify the National ID.');
        setAlertOpen(true);
        return;
      }
    }

    if (isInzan && !isGuest && !isValidEgyptianMobile(selectedClient?.phone)) {
      setAlertTitle('Valid Mobile Number Required');
      setAlertDescription('Inzan policy requires a valid Egyptian mobile number (+201XXXXXXXXX) on the member profile before payment.');
      setAlertOpen(true);
      return;
    }

    // Inzan Corporate Discount Document Gate
    if (isInzan && discountReason === 'Corporate' && !corporateProofUrl) {
      setAlertTitle('Corporate Proof Document Required');
      setAlertDescription('Corporate discounts require an attached copy of the member’s work badge or corporate ID. Please attach the verification proof before proceeding.');
      setAlertOpen(true);
      return;
    }

    if (!isGuest && !clientId && !resolvedGuestName) {
      setAlertTitle('Missing Information');
      setAlertDescription('Please select a client or enter a walk-in guest name.');
      setAlertOpen(true);
      return;
    }

    if (isGuest && !resolvedGuestName) {
      setAlertTitle('Missing Information');
      setAlertDescription('Please enter the client or guest name for this payment.');
      setAlertOpen(true);
      return;
    }

    if (!amount || !finalPackageType) {
      setAlertTitle('Missing Information');
      setAlertDescription('Please enter an amount and select a package type.');
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

    if (method === 'Instapay' && instapayRef && !/^\d{12}$/.test(instapayRef)) {
      setAlertTitle('Invalid Reference');
      setAlertDescription('Please enter a valid 12-digit Instapay reference number.');
      setAlertOpen(true);
      return;
    }

    const finalCategory: PaymentCategory = packageType === 'Custom' ? resolvePaymentCategory(customPackage) : paymentCategory;
    const isPT = finalCategory === 'PT';
    const resolvedCoachName = coachName === '__custom__' ? customCoachName.trim() : coachName;
    if (isPT && !resolvedCoachName) {
      setAlertTitle('Missing Information');
      setAlertDescription('Please select or enter a coach for this PT package.');
      setAlertOpen(true);
      return;
    }

    if (!pricingBreakdown.valid) {
      setAlertTitle('Invalid Pricing');
      setAlertDescription(pricingBreakdown.error || 'Please check the discount and amount values.');
      setAlertOpen(true);
      return;
    }

    if (discountType && !canApplyDiscount) {
      setAlertTitle('Not Authorised');
      setAlertDescription('You do not have permission to apply a discount.');
      setAlertOpen(true);
      return;
    }

    const finalAmount = pricingBreakdown.netAmount;

    const salesRepUser = users.find(u => {
      const name = u.name || u.email || u.id;
      return toCanonical(name).toLowerCase() === toCanonical(salesName).toLowerCase();
    });
    const salesRepId = salesRepUser ? salesRepUser.id : undefined;

    try {
      const selectedClient = !isGuest ? clients.find(c => c.id === clientId) : null;
      const pkg = packages.find(p => p.name === packageType);

      if (isInzan && !isGuest && selectedClient && pkg) {
        const eligibility = validateMembershipEligibility(selectedClient, pkg);
        if (!eligibility.allowed) {
          setAlertTitle('Primary Membership Required');
          setAlertDescription(eligibility.reason || 'An active primary gym membership is required for this package.');
          setAlertOpen(true);
          return;
        }
      }

      // Sales rep locking rule (Inzan only):
      // "When a sales rep is assigned to a member they will always be locked to them even when renewing.
      // The only person that can change a member that is assigned to a sales rep is the sales manager only."
      const clientRepId = selectedClient?.assignedTo || selectedClient?.salesRep;
      const isClientRepLocked = isInzan && Boolean(clientRepId && clientRepId !== 'unassigned');
      const canReassignRep = isInzan ? canReassignMemberSalesRep(currentUser) : true;

      const effectiveSalesRepId = (isClientRepLocked && !canReassignRep) ? clientRepId! : (salesRepId || clientRepId || '');
      const effectiveSalesName = (isClientRepLocked && !canReassignRep)
        ? resolveUserDisplay(clientRepId!, users, selectedClient?.salesName || '')
        : (salesName || '');

      const effectiveClientName = isGuest ? resolvedGuestName : (selectedClient?.name || resolvedGuestName);

      // Check for existing active packages with same type -> seamlessly process as Renewal cycle
      const existingActivePackage = (selectedClient?.packages || []).find(
        p => p.status === 'Active' && p.packageName === finalPackageType
      );
      const isRenewalPayment = !isGuest && !!existingActivePackage;

      const effectiveBranch = normalizeBranchName(paymentBranch || newClientBranch || selectedClient?.branch || currentUser?.branch || (branches.length > 0 ? branches[0] : ''));

      const parsedPrimaryTender = useSplitTender
        ? Math.min(pricingBreakdown.amountPaid, Math.max(0, parseFloat(primaryTenderAmount) || 0))
        : pricingBreakdown.amountPaid;
      const parsedSecondaryTender = useSplitTender
        ? calculateSplitTenderRemaining(pricingBreakdown.amountPaid, parsedPrimaryTender).remainingDebt
        : 0;

      const generatedInstallments =
        pricingBreakdown.remainingBalance > 0
          ? splitInstallmentsEvenly(
              pricingBreakdown.remainingBalance,
              installmentCount,
              firstInstallmentDueDate || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
              30
            ).map((inst) => ({
              id: `inst_${inst.index}_${Date.now()}`,
              amount: inst.amount,
              dueDate: inst.dueDate,
              status: 'pending' as const,
            }))
          : undefined;

      const splitNoteSuffix =
        useSplitTender && parsedSecondaryTender > 0
          ? ` [Split Tender: ${method} ${parsedPrimaryTender} LE + ${secondaryMethod} ${parsedSecondaryTender} LE]`
          : '';

      await processPaymentTransaction({
        clientId: isGuest ? 'WALK-IN-GUEST' : clientId,
        clientName: effectiveClientName,
        clientBranch: effectiveBranch,
        branch: effectiveBranch,
        branchId: toCanonicalBranchId(effectiveBranch) || undefined,
        clientStatus: isGuest ? 'Active' : selectedClient?.status,
        clientPackages: selectedClient?.packages,
        isGuest,
        amount: finalAmount,
        originalAmount: parseFloat(amount),
        amount_paid: pricingBreakdown.amountPaid,
        method,
        instapayRef: method === 'Instapay' ? instapayRef : undefined,
        packageType: finalPackageType,
        packageCategory: finalCategory,
        coachName: isPT ? resolvedCoachName : undefined,
        notes: `${notes || ''}${splitNoteSuffix}`.trim(),
        receiptSerial: receiptNumber.trim() || undefined,
        sales_rep_id: effectiveSalesRepId || '',
        salesName: effectiveSalesName || '',
        recordedBy: recordedById || currentUser?.id || '',
        recordedByName: users.find(u => u.id === (recordedById || currentUser?.id))?.name || '',
        paymentDate: safeIsoDate(paymentDate, true),
        startDate: safeIsoDate(startDate, true),
        endDate: endDate ? safeIsoDate(endDate) : undefined,
        discountType: discountType ? (discountType as 'percentage' | 'amount') : undefined,
        discountValue: discountValue ? parseFloat(discountValue) : undefined,
        discountedAmount: finalAmount,
        isMemberOnHold,
        systemPackage: pkg,
        isRenewal: isRenewalPayment,
        previousPackageName: isRenewalPayment ? finalPackageType : undefined,
        corporateProofUrl: discountReason === 'Corporate' ? corporateProofUrl : undefined,
        discountReason: discountReason !== 'Standard' ? discountReason : undefined,
        installments: generatedInstallments,
        secondaryMethod: useSplitTender && parsedSecondaryTender > 0 ? secondaryMethod : undefined,
        primaryTenderAmount: useSplitTender ? parsedPrimaryTender : undefined,
        secondaryTenderAmount: useSplitTender && parsedSecondaryTender > 0 ? parsedSecondaryTender : undefined,
        operationId: newPaymentOperationId
      });
      if (isInzan && !isGuest && clientId && discountReason === 'Corporate' && corporateProofUrl) {
        await updateClient(clientId, { corporateProofUrl } as Partial<Client>);
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      setAlertTitle('Error');
      setAlertDescription(error instanceof Error ? error.message : 'Failed to record payment. Please try again.');
      setAlertOpen(true);
      return;
    }

      setIsNewPaymentOpen(false);
      setIsCreatingNew(false);
      setIsWalkInGuest(false);
      setGuestClientName('');
      setPaymentBranch('');
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
      setAmountPaid('');
      setPaymentCategory('Memberships');
      setPackageCategoryFilter('All');
      setReceiptNumber('');
      setIsMemberOnHold(false);
      setDiscountReason('Standard');
      setCorporateProofUrl('');
      setCorporateProofFileName('');
      setInlineNationalId('');
      setNewClientNationalId('');
      setUseSplitTender(false);
      setPrimaryTenderAmount('');
      setSecondaryMethod('Credit Card');
      setInstallmentCount(2);
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

      const clientBranchNorm = normalizeBranchName(client.branch);
      await processPaymentTransaction({
        clientId: client.id,
        clientName: client.name,
        clientBranch: clientBranchNorm,
        branch: clientBranchNorm,
        branchId: toCanonicalBranchId(clientBranchNorm) || undefined,
        clientStatus: client.status,
        clientPackages: client.packages,
        amount: amountToPay,
        originalAmount: pkg.price,
        amount_paid: amountToPay,
        method: upgradeMethod,
        instapayRef: upgradeMethod === 'Instapay' ? upgradeInstapayRef : undefined,
        packageType: pkg.name,
        packageCategory: resolvePaymentCategory(pkg.name),
        sales_rep_id: payment.sales_rep_id,
        salesName: payment.salesName || '',
        recordedBy: currentUser?.id || '',
        recordedByName: currentUser?.name || '',
        paymentDate: safeIsoDate(upgradeStartDate, true),
        startDate: safeIsoDate(upgradeStartDate, true),
        systemPackage: pkg,
        previousPackageName: prevActive?.packageName || payment.packageType,
        isUpgradePayment: true,
        operationId: upgradeOperationId
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

  const handleRequestRefund = async () => {
    if (!refundPaymentId || !currentUser) return;
    
    const payment = payments.find(p => p.id === refundPaymentId);
    if (!payment) return;

    const parsedAmount = parseFloat(refundAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setAlertTitle('Invalid Amount');
      setAlertDescription('Please enter a valid refund amount greater than 0.');
      setAlertOpen(true);
      return;
    }

    if (parsedAmount > payment.amount) {
      setAlertTitle('Invalid Amount');
      setAlertDescription(`Refund amount cannot exceed the original payment amount of ${payment.amount} LE.`);
      setAlertOpen(true);
      return;
    }

    if (!refundReason.trim()) {
      setAlertTitle('Reason Required');
      setAlertDescription('Please provide a reason for the refund request.');
      setAlertOpen(true);
      return;
    }

    const effectiveMethod = refundMethod === 'Original Method' ? payment.method : refundMethod;
    const client = resolvePaymentClient(payment);
    const clientDisplayName = 
      client?.name || 
      payment.clientName || 
      payment.client_name || 
      payment.guestName || 
      (payment as any).guest_name || 
      'Walk-in Guest';
    
    try {
      const refundDetails: RefundDetails = {
        paymentId: payment.id,
        amount: parsedAmount,
        refundMethod: effectiveMethod,
      };

      await createApprovalRequest(
        'refund',
        {
          ...refundDetails,
          clientId: payment.clientId,
          clientName: clientDisplayName,
          packageType: payment.packageType,
          originalAmount: payment.amount,
          originalMethod: payment.method,
          entitlementId: payment.linkedEntitlementId,
        },
        refundReason.trim(),
        currentUser.id,
        currentUser.name || 'Staff',
        currentUser.role,
        payment.id,
        'payment',
        'manager'
      );
      
      setIsRefundDialogOpen(false);
      setRefundPaymentId(null);
      setRefundReason('');
      setRefundAmount('');
      
      setAlertTitle('Refund Request Submitted');
      setAlertDescription('Refund request has been submitted for manager approval.');
      setAlertOpen(true);
    } catch (err: any) {
      setAlertTitle('Error');
      setAlertDescription(err.message || 'Failed to submit refund request.');
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

    const isArabic = language === 'ar';
    
    const labelBilledTo = isArabic ? 'المستلم' : 'Billed To';
    const labelMemberId = isArabic ? 'رقم العضوية' : 'Member ID';
    const labelBranch = isArabic ? 'الفرع' : 'Branch';
    const labelReceiptNo = isArabic ? 'رقم الإيصال' : 'Receipt No.';
    const labelDate = isArabic ? 'التاريخ' : 'Date';
    const labelPaymentMethod = isArabic ? 'طريقة الدفع' : 'Payment Method';
    const labelDescription = isArabic ? 'البيان / الباقة' : 'Description';
    const labelAmount = isArabic ? 'القيمة' : 'Amount';
    const labelTotalPaid = isArabic ? 'إجمالي المدفوع' : 'Total Paid';
    const labelThankYou = isArabic ? 'شكراً لثقتكم بنا!' : 'Thank you for your business!';
    const labelReceiptTitle = isArabic ? 'إيصال دفع' : 'Payment Receipt';
    const labelCoachName = isArabic ? 'المدرب' : 'Coach';

    // Localize payment method
    let displayMethod = payment.method;
    if (isArabic) {
      switch (payment.method) {
        case 'Cash': displayMethod = 'نقداً' as any; break;
        case 'Credit Card': displayMethod = 'فيزا / كارت' as any; break;
        case 'Bank Transfer': displayMethod = 'تحويل بنكي' as any; break;
        case 'Instapay': displayMethod = 'إنستاباي' as any; break;
        default: displayMethod = 'أخرى' as any;
      }
    }

    const formattedDate = isArabic 
      ? (toValidDate(payment.date)?.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || '—')
      : safeFormatDate(getEgyptDate(payment.date), 'MMMM d, yyyy h:mm a');

    win.document.write(`
      <html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${language}">
        <head>
          <title>${isArabic ? 'فاتورة' : 'Invoice'} - ${payment.id.substring(0, 8).toUpperCase()}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;700;900&family=Inter:wght@400;500;600;700&display=swap');
            body { 
              font-family: ${isArabic ? "'Cairo', sans-serif" : "'Inter', 'Helvetica Neue', sans-serif"}; 
              padding: 40px; 
              color: #1f2937; 
              background-color: #fff;
            }
            .header { 
              display: flex; 
              justify-content: space-between; 
              align-items: center; 
              border-bottom: 2px solid #f3f4f6; 
              padding-bottom: 20px; 
              margin-bottom: 30px; 
              flex-direction: ${isRtl ? 'row-reverse' : 'row'};
            }
            .logo { font-size: 24px; font-weight: 800; color: #000; }
            .logo img { max-height: 50px; object-fit: contain; }
            .invoice-title { font-size: 20px; font-weight: 900; color: #111827; text-transform: uppercase; letter-spacing: 1px; }
            .details { display: flex; justify-content: space-between; margin-bottom: 40px; flex-direction: ${isRtl ? 'row-reverse' : 'row'}; }
            .details-col { flex: 1; text-align: ${isRtl ? 'right' : 'left'}; }
            .details-col.align-end { text-align: ${isRtl ? 'left' : 'right'}; }
            .label { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px; }
            .value { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { text-align: ${isRtl ? 'right' : 'left'}; padding: 12px; border-bottom: 2px solid #f3f4f6; color: #4b5563; font-size: 12px; font-weight: 700; text-transform: uppercase; }
            td { padding: 14px 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #4b5563; text-align: ${isRtl ? 'right' : 'left'}; }
            .total-row td { font-weight: 800; font-size: 18px; color: #111827; border-top: 2px solid #e5e7eb; border-bottom: none; }
            .text-end { text-align: ${isRtl ? 'left' : 'right'}; }
            .footer { margin-top: 60px; text-align: center; color: #9ca3af; font-size: 12px; font-weight: 500; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo"><img src="${branding.logoUrl || '/strikelogo.png'}" alt="${branding.companyName}" /></div>
            <div class="invoice-title">${labelReceiptTitle}</div>
          </div>
          
          <div class="details">
            <div class="details-col">
              <div class="label">${labelBilledTo}</div>
              <div class="value">${client?.name || 'Unknown Client'}</div>
              <div class="label">${labelMemberId}</div>
              <div class="value">${client?.memberId ? '#' + client.memberId : 'N/A'}</div>
              <div class="label">${labelBranch}</div>
              <div class="value">${resolvePaymentBranch(payment, client) !== 'Unknown' ? resolvePaymentBranch(payment, client) : 'N/A'}</div>
            </div>
            <div class="details-col align-end">
              <div class="label">${labelReceiptNo}</div>
              <div class="value">${(payment.receiptSerial || payment.id.substring(0, 8).toUpperCase())}</div>
              <div class="label">${labelDate}</div>
              <div class="value">${formattedDate}</div>
              <div class="label">${labelPaymentMethod}</div>
              <div class="value">${displayMethod} ${payment.instapayRef ? '(Ref: ' + payment.instapayRef + ')' : ''}</div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>${labelDescription}</th>
                <th class="text-end">${labelAmount}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  ${payment.packageType}
                  ${payment.coachName ? `<br><span style="font-size: 12px; color: #888;">${labelCoachName}: ${payment.coachName}</span>` : ''}
                </td>
                <td class="text-end">${(payment.originalAmount && payment.originalAmount > payment.amount ? payment.originalAmount : payment.amount).toLocaleString()} LE</td>
              </tr>
              ${((payment.discountValue && payment.discountValue > 0) || (payment.originalAmount && payment.originalAmount > payment.amount)) ? `
              <tr style="color: #d97706; font-size: 12px;">
                <td>Discount ${payment.discountReason && payment.discountReason !== 'Standard' ? '(' + payment.discountReason + ')' : ''} ${payment.discountType === 'percentage' && payment.discountValue ? '(' + payment.discountValue + '%)' : ''}</td>
                <td class="text-end">- ${((payment.originalAmount || payment.amount) - payment.amount).toLocaleString()} LE</td>
              </tr>` : ''}
              <tr class="total-row">
                <td class="text-end">${labelTotalPaid}</td>
                <td class="text-end">${(payment.amount_paid ?? payment.amount).toLocaleString()} LE</td>
              </tr>
              ${(payment.remainingBalance && payment.remainingBalance > 0) ? `
              <tr style="color: #dc2626; font-size: 12px;">
                <td class="text-end">Remaining Debt</td>
                <td class="text-end">${payment.remainingBalance.toLocaleString()} LE</td>
              </tr>` : ''}
            </tbody>
          </table>
          
          <div class="footer">
            ${labelThankYou}<br>
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

  const printThermal80mmReceipt = (payment: Payment, client: any) => {
    const win = window.open('', '_blank', 'width=360,height=640');
    if (!win) {
      setAlertTitle('Popups Blocked');
      setAlertDescription('Please allow popups to print 80mm thermal receipts.');
      setAlertOpen(true);
      return;
    }

    const paidNow = Number(payment.amount_paid ?? payment.amount) || 0;
    const netTotal = Number(payment.amount) || 0;
    const remBalance = Math.max(0, netTotal - paidNow);
    const splitSecondaryMethod = (payment as any).secondaryMethod;
    const splitPrimaryAmt = (payment as any).primaryTenderAmount;
    const splitSecondaryAmt = (payment as any).secondaryTenderAmount;
    const installmentsList: any[] = Array.isArray((payment as any).installments) ? (payment as any).installments : [];
    const cashierName = users.find(u => u.id === payment.recordedBy)?.name || (payment as any).recordedByName || currentUser?.name || 'Reception';
    const branchLabel = resolvePaymentBranch(payment, client) !== 'Unknown' ? resolvePaymentBranch(payment, client) : 'MAIN';
    const serialNo = payment.receiptSerial || payment.id.substring(0, 8).toUpperCase();

    win.document.write(`
      <html>
        <head>
          <title>80mm Receipt - ${serialNo}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 72mm;
              margin: 0 auto;
              padding: 4mm 2mm;
              font-size: 12px;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .line { border-top: 1px dashed #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; margin: 3px 0; }
            .small { font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 15px;">${branding.companyName || 'MITRIXO GYM'}</div>
          <div class="center small">Branch: ${branchLabel} | 80mm POS Thermal Receipt</div>
          <div class="center small">Receipt #: ${serialNo}</div>
          <div class="center small">${safeFormatDate(getEgyptDate(payment.date), 'yyyy-MM-dd hh:mm a')}</div>
          <div class="line"></div>
          <div class="row"><span>Member:</span><span class="bold">${client?.name || payment.clientName || payment.client_name || 'Walk-in'}</span></div>
          <div class="row"><span>Member ID:</span><span>#${client?.memberId || (payment as any).memberId || 'N/A'}</span></div>
          <div class="row"><span>Cashier:</span><span>${cashierName}</span></div>
          ${payment.salesName ? `<div class="row"><span>Sales Rep:</span><span>${payment.salesName}</span></div>` : ''}
          <div class="line"></div>
          <div class="bold">${payment.packageType}</div>
          ${payment.coachName ? `<div class="small">Trainer: ${payment.coachName}</div>` : ''}
          ${(payment.originalAmount && payment.originalAmount > payment.amount) ? `<div class="row small"><span>Gross Catalog Price:</span><span>${payment.originalAmount.toLocaleString()} LE</span></div>` : ''}
          ${((payment.discountValue && payment.discountValue > 0) || (payment.originalAmount && payment.originalAmount > payment.amount)) ? `<div class="row small" style="color: #b45309;"><span>Discount ${payment.discountReason && payment.discountReason !== 'Standard' ? '(' + payment.discountReason + ')' : ''}:</span><span>- ${((payment.originalAmount || payment.amount) - payment.amount).toLocaleString()} LE ${payment.discountType === 'percentage' && payment.discountValue ? '(' + payment.discountValue + '%)' : ''}</span></div>` : ''}
          <div class="row"><span>Net Package Total:</span><span>${netTotal.toLocaleString()} LE</span></div>
          <div class="row bold"><span>PAID NOW:</span><span>${paidNow.toLocaleString()} LE</span></div>
          ${
            splitSecondaryMethod && splitSecondaryAmt > 0
              ? `<div class="row small"><span>- ${payment.method}:</span><span>${Number(splitPrimaryAmt || 0).toLocaleString()} LE</span></div>
                 <div class="row small"><span>- ${splitSecondaryMethod}:</span><span>${Number(splitSecondaryAmt).toLocaleString()} LE</span></div>`
              : `<div class="row small"><span>Method:</span><span>${payment.method}${payment.instapayRef ? ' (' + payment.instapayRef + ')' : ''}</span></div>`
          }
          ${
            remBalance > 0
              ? `<div class="line"></div>
                 <div class="row bold"><span>REMAINING DEBT:</span><span>${remBalance.toLocaleString()} LE</span></div>
                 ${installmentsList
                   .map(
                     (inst, idx) =>
                       `<div class="row small"><span>Inst #${idx + 1} (${inst.dueDate}):</span><span>${Number(inst.amount).toLocaleString()} LE</span></div>`
                   )
                   .join('')}`
              : ''
          }
          <div class="line"></div>
          <div class="center small">Thank you for training with us!</div>
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

  const printCashierShiftZReport = () => {
    const win = window.open('', '_blank', 'width=360,height=680');
    if (!win) {
      setAlertTitle('Popups Blocked');
      setAlertDescription('Please allow popups to print the Cashier Shift Z-Report.');
      setAlertOpen(true);
      return;
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const sourcePayments =
      deferredFilterDateFrom || deferredFilterDateTo
        ? filteredPayments
        : filteredPayments.filter((p) => (p.date || '').substring(0, 10) === todayStr);

    const activePayments = sourcePayments.filter((p) => p.status !== 'refunded');
    const totalsByMethod: Record<string, number> = {
      Cash: 0,
      'Credit Card': 0,
      'Bank Transfer': 0,
      Instapay: 0,
      Other: 0,
    };

    let grandTotalCollected = 0;
    for (const p of activePayments) {
      const paidVal = Number(p.amount_paid ?? p.amount) || 0;
      const secMethod = (p as any).secondaryMethod as string | undefined;
      const priAmt = Number((p as any).primaryTenderAmount) || 0;
      const secAmt = Number((p as any).secondaryTenderAmount) || 0;

      if (secMethod && secAmt > 0) {
        totalsByMethod[p.method] = (totalsByMethod[p.method] || 0) + priAmt;
        totalsByMethod[secMethod] = (totalsByMethod[secMethod] || 0) + secAmt;
      } else {
        totalsByMethod[p.method] = (totalsByMethod[p.method] || 0) + paidVal;
      }
      grandTotalCollected += paidVal;
    }

    win.document.write(`
      <html>
        <head>
          <title>Shift Z-Report - ${todayStr}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 72mm;
              margin: 0 auto;
              padding: 4mm 2mm;
              font-size: 12px;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .line { border-top: 1px dashed #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; margin: 3px 0; }
            .small { font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 15px;">${branding.companyName || 'MITRIXO GYM'}</div>
          <div class="center bold">CASHIER SHIFT Z-REPORT (80MM)</div>
          <div class="center small">Date: ${todayStr} | Cashier: ${currentUser?.name || 'Admin'}</div>
          <div class="center small">Branch Filter: ${deferredFilterBranch}</div>
          <div class="line"></div>
          <div class="row"><span>Transactions Count:</span><span class="bold">${activePayments.length}</span></div>
          <div class="line"></div>
          ${Object.entries(totalsByMethod)
            .map(
              ([m, val]) =>
                `<div class="row"><span>${m}:</span><span class="bold">${val.toLocaleString()} LE</span></div>`
            )
            .join('')}
          <div class="line"></div>
          <div class="row bold" style="font-size: 14px;"><span>TOTAL COLLECTED:</span><span>${grandTotalCollected.toLocaleString()} LE</span></div>
          <div class="line"></div>
          <div class="small" style="margin-top: 14px;">Outgoing Cashier Sign: _______________</div>
          <div class="small" style="margin-top: 14px;">Incoming Cashier Sign: _______________</div>
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

  const renderStatusBadge = (status?: Payment['status']) => {
    const s = (status || 'paid').toLowerCase();
    switch (s) {
      case 'refunded':
        return (
          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 text-[11px] font-semibold">
            Refunded
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 text-[11px] font-semibold">
            Pending
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800 text-[11px] font-semibold">
            Failed
          </Badge>
        );
      case 'paid':
      default:
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 text-[11px] font-semibold">
            Paid
          </Badge>
        );
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

  const { clientById, clientByMemberId, clientByPortalUserId, clientByPhone } = React.useMemo(() => {
    const byId = new Map<string, Client>();
    const byMemberId = new Map<string, Client>();
    const byPortalUserId = new Map<string, Client>();
    const byPhone = new Map<string, Client>();

    for (const c of clients) {
      if (c.id) {
        byId.set(c.id, c);
      }
      if (c.memberId) {
        const clean = String(c.memberId).replace(/^#/, '').trim().toLowerCase();
        if (clean) byMemberId.set(clean, c);
      }
      if (c.portalUserId) {
        byPortalUserId.set(c.portalUserId, c);
      }
      if (c.phone) {
        const digits = String(c.phone).replace(/\D/g, '').slice(-10);
        if (digits.length >= 8) byPhone.set(digits, c);
      }
    }

    return { clientById: byId, clientByMemberId: byMemberId, clientByPortalUserId: byPortalUserId, clientByPhone: byPhone };
  }, [clients]);

  const resolvePaymentClient = useCallback((payment: any): Client | undefined => {
    if (!payment) return undefined;
    if (payment.clientId === 'WALK-IN-GUEST' || payment.isGuest) return undefined;

    // 1. Direct match by document ID
    if (payment.clientId && typeof payment.clientId === 'string' && payment.clientId.trim()) {
      const byId = clientById.get(payment.clientId.trim());
      if (byId) return byId;
    }

    // 2. Match payment.memberId (or member_id) if explicitly provided
    const pMemberId = payment.memberId || payment.member_id;
    if (pMemberId) {
      const cleanMemberId = String(pMemberId).replace(/^#/, '').trim().toLowerCase();
      if (cleanMemberId) {
        const byMember = clientByMemberId.get(cleanMemberId);
        if (byMember) return byMember;
        const byId = clientById.get(cleanMemberId);
        if (byId) return byId;
      }
    }

    // 3. Fallback: payment.clientId might be a memberId, portalUserId, or phone
    if (payment.clientId && typeof payment.clientId === 'string' && payment.clientId.trim()) {
      const cleanId = payment.clientId.replace(/^#/, '').trim().toLowerCase();
      if (cleanId) {
        const byMember = clientByMemberId.get(cleanId);
        if (byMember) return byMember;
        const byPortal = clientByPortalUserId.get(payment.clientId.trim());
        if (byPortal) return byPortal;
        const rawDigits = payment.clientId.replace(/\D/g, '').slice(-10);
        if (rawDigits.length >= 8) {
          const byPhone = clientByPhone.get(rawDigits);
          if (byPhone) return byPhone;
        }
      }
    }

    return undefined;
  }, [clientById, clientByMemberId, clientByPortalUserId, clientByPhone]);

  const revenueScope = React.useMemo(() => getRevenueScopeForUser(currentUser), [currentUser]);

  const filteredPayments = React.useMemo(() => {
    let result = payments.filter(payment => {
      if (isInzan && revenueScope !== 'all' && !isPaymentInRevenueScope(payment, revenueScope)) {
        return false;
      }
      const client = resolvePaymentClient(payment);

      // Sales reps only see payments attributed to them.
      // Matches by sales_rep_id, canonical salesName, recordedBy, or assigned client.
      if (isRep && currentUser) {
        const repCanonical = currentUser.name ? toCanonical(currentUser.name).toLowerCase() : '';
        const paySalesCanonical = payment.salesName ? toCanonical(payment.salesName).toLowerCase() : '';
        const clientSalesCanonical = client?.salesName ? toCanonical(client.salesName).toLowerCase() : '';
        const ownPayment =
          (payment.sales_rep_id && payment.sales_rep_id === currentUser.id) ||
          (repCanonical && paySalesCanonical && paySalesCanonical === repCanonical) ||
          (payment.recordedBy && payment.recordedBy === currentUser.id) ||
          (!payment.sales_rep_id && !payment.salesName && client && (
            client.assignedTo === currentUser.id ||
            client.salesRep === currentUser.id ||
            (repCanonical && clientSalesCanonical === repCanonical)
          ));
        if (!ownPayment) return false;
      }

      // Search filter
      if (deferredSearchTerm) {
        const term = deferredSearchTerm.toLowerCase();
        const clientName = client?.name || payment.clientName || payment.client_name || payment.guestName || (payment as any).guest_name || '';
        const matchesName = matchesFuzzyNameSearch(clientName, term);
        const matchesId = String(client?.memberId || '').toLowerCase().includes(term) || String((payment as any).memberId || '').toLowerCase().includes(term);
        const matchesPhone = String(client?.phone || '').includes(term);
        const matchesAmount = payment.amount.toString().includes(term);
        const matchesRef = payment.instapayRef?.toLowerCase().includes(term);

        if (!matchesName && !matchesId && !matchesPhone && !matchesAmount && !matchesRef) return false;
      }

      // Method filter
      if (deferredFilterMethod !== 'All' && payment.method !== deferredFilterMethod) return false;

      // Branch filter (via payment and client)
      if (deferredFilterBranch !== 'All') {
        const paymentBranch = resolvePaymentBranch(payment, client);
        if (paymentBranch !== deferredFilterBranch) return false;
      }

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
  }, [payments, clients, deferredSearchTerm, deferredFilterMethod, deferredFilterBranch, deferredFilterPackage, deferredFilterCoach, deferredFilterDateFrom, deferredFilterDateTo, deferredSortConfig, isRep, currentUser, filterSalesName, deferredFilterShowOnlyHeld, isInzan, revenueScope, resolvePaymentClient]);

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
      if (p.status === 'refunded') continue;
      if (p.coachName) {
        map[p.coachName] = (map[p.coachName] || 0) + (Number(p.amount) || 0);
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
      if (p.status === 'refunded') continue;
      const client = clientMap.get(p.clientId);
      const branch = resolvePaymentBranch(p, client);
      if (!totals[branch]) totals[branch] = { Cash: 0, 'Credit Card': 0, 'Bank Transfer': 0, Instapay: 0, Other: 0, Total: 0 };
      const row = totals[branch]!;
      const m = (METHODS as readonly string[]).includes(p.method) ? p.method : 'Other';
      row[m] = (row[m] || 0) + (Number(p.amount) || 0);
      row.Total = (row.Total || 0) + (Number(p.amount) || 0);
    }
    return totals;
  }, [canViewBranchTotals, filteredPayments, clients]);

  // Inzan pre-payment verification gate: payment stays blocked until member data is complete.
  const inzanGateIssues: string[] = (() => {
    if (!isInzan) return [];
    const issues: string[] = [];
    const guestMode = clientId === 'WALK-IN-GUEST' || isWalkInGuest;
    const gateClient = !guestMode && clientId ? clients.find(cl => cl.id === clientId) : null;
    if (!guestMode && !gateClient) { issues.push('Select or create a member'); return issues; }
    const name = guestMode ? (guestClientName || clientSearch).trim() : (gateClient?.name || '').trim();
    if (name.length < 2) issues.push('Full name');
    if (!guestMode && !isValidEgyptianMobile(gateClient?.phone)) issues.push('Valid Egyptian mobile number (+201XXXXXXXXX)');
    const idValue = (!guestMode ? (gateClient?.nationalId || inlineNationalId) : inlineNationalId) || '';
    if (!isValidNationalIdOrPassport(idValue)) issues.push('National ID (14 digits) or Passport');
    if (discountReason === 'Corporate' && !corporateProofUrl) issues.push('Corporate proof document is required to apply corporate pricing');
    return issues;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-2xl font-bold tracking-tight">{t('payments.title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const { csv } = generateEgyptianEtaTaxCsv(filteredPayments, clients);
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `ETA_VAT_Report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="gap-1.5 font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
            title="Export Egyptian Tax Authority (ETA 14% VAT) CSV for Filtered Payments"
          >
            <Download className="h-4 w-4" />
            Export ETA 14% VAT CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsShiftHandoverOpen(true)}
            className="gap-1.5 font-semibold border-primary/30 hover:bg-primary/5"
            title="Reconcile Cash Drawer, Visa Terminal Batch & InstaPay for Shift Handover"
          >
            <Clock className="h-4 w-4 text-primary" />
            Shift Handover
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={printCashierShiftZReport}
            className="gap-1.5 font-semibold border-primary/30 hover:bg-primary/5"
            title="Print 80mm Thermal Cashier Shift Z-Report (Cash + Card + Instapay totals)"
          >
            <Receipt className="h-4 w-4 text-primary" />
            Shift Z-Report (80mm)
          </Button>
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
                
                <div className="md:col-span-2 lg:col-span-3 bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs text-muted-foreground flex items-start gap-3">
                  <Receipt className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground text-sm">Payment & Entitlement Transaction Integrity</div>
                    <div>Selecting a package and recording payment executes an atomic transaction that registers the financial receipt, updates the member package status, and creates the exact service entitlement for booking. Partial payments preserve remaining balances, while Inzan members require Egyptian mobile and National ID verification before completion.</div>
                  </div>
                </div>

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
                            <select
                              className="flex h-10 w-full rounded-xl border border-input bg-background/60 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={newClientGender}
                              onChange={e => setNewClientGender(e.target.value as any)}
                            >
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                              <option value="Prefer not to say">Prefer not to say</option>
                            </select>
                            <select
                              className="flex h-10 w-full rounded-xl border border-input bg-background/60 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              value={newClientCategory}
                              onChange={e => setNewClientCategory(e.target.value as any)}
                            >
                              <option value="Adults">Adults</option>
                              <option value="Kids Only">Kids Only</option>
                              <option value="Kids Pro">Kids Pro</option>
                              <option value="Junior Only">Junior Only</option>
                              <option value="Junior Advanced">Junior Advanced</option>
                            </select>
                            {isInzan && (
                              <Input
                                placeholder="National ID (14 digits) or Passport *"
                                className="h-10 rounded-xl text-sm bg-background/60"
                                value={newClientNationalId}
                                onChange={e => setNewClientNationalId(e.target.value)}
                              />
                            )}
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
                            {clientSearch.trim().length > 0 && (
                              <button
                                type="button"
                                className="w-full text-left px-5 py-3 hover:bg-emerald-500/10 transition-colors flex items-center gap-3 border-b border-white/10"
                                onMouseDown={() => {
                                  setClientId('WALK-IN-GUEST');
                                  setGuestClientName(clientSearch.trim());
                                  setIsWalkInGuest(true);
                                  setClientSearch(clientSearch.trim());
                                  if (!paymentBranch) setPaymentBranch(currentUser?.branch || (branches.length > 0 ? branches[0] : '') || '');
                                  setClientDropdownOpen(false);
                                }}
                              >
                                <User className="h-4 w-4 text-emerald-500 shrink-0" />
                                <span className="text-sm font-semibold text-emerald-500">
                                  {(t('payments.record_as_guest') || 'Record as Walk-in / Drop Session Guest')}: "{clientSearch.trim()}"
                                </span>
                              </button>
                            )}
                            <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
                              {(() => {
                                const term = clientSearch.toLowerCase().trim();
                                const cleanId = term.replace(/^#/, '');
                                const scored: { client: Client; score: number }[] = [];
                                for (const c of clients) {
                                  if (!term) {
                                    scored.push({ client: c, score: 100 });
                                    if (scored.length >= 50) break;
                                  } else {
                                    const nameRes = scoreNameMatch(c.name, term);
                                    if (nameRes.matched) {
                                      scored.push({ client: c, score: nameRes.score });
                                    } else if (
                                      matchesPhoneSearch(c.phone, term) ||
                                      matchesPhoneSearch((c as any).parentPhone, term) ||
                                      (c.memberId && c.memberId.toString().includes(cleanId))
                                    ) {
                                      scored.push({ client: c, score: 100 });
                                    }
                                  }
                                }
                                const matched = term
                                  ? scored.sort((a, b) => b.score - a.score).slice(0, 50).map(s => s.client)
                                  : scored.map(s => s.client);
                                if (matched.length === 0) {
                                  return (
                                    <div className="px-5 py-4 text-sm text-muted-foreground text-center">{t('members.no_members')}</div>
                                  );
                                }
                                return matched.map(client => (
                                  <button
                                    key={client.id}
                                    type="button"
                                    className="w-full text-left px-5 py-3 hover:bg-muted/60 transition-colors flex items-center gap-3"
                                    onMouseDown={() => {
                                      setClientId(client.id);
                                      setClientSearch(`${client.name}${client.phone ? ` (${client.phone})` : ''}`);
                                      if (client.branch) setPaymentBranch(client.branch);
                                      const repName = client.salesRep || resolveUserDisplay(client.assignedTo, users, '') || (currentUser?.role === 'rep' ? currentUser.name : '');
                                      if (repName) setSalesName(repName);
                                      setInlineNationalId(client.nationalId || (client as any).nationalIdOrPassport || (client as any).passport || '');
                                      setClientDropdownOpen(false);
                                    }}
                                  >
                                    <div>
                                      <div className="font-medium text-sm">{client.name}</div>
                                      <div className="text-xs text-muted-foreground">{[client.phone, client.memberId ? `#${client.memberId}` : null, client.branch].filter(Boolean).join(' · ')}</div>
                                    </div>
                                  </button>
                                ));
                              })()}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {isInzan && clientId && clientId !== 'WALK-IN-GUEST' && (() => {
                      const curClient = clients.find(c => c.id === clientId);
                      const hasValidId = isValidNationalIdOrPassport(curClient?.nationalId || inlineNationalId);
                      if (hasValidId) return null;
                      return (
                        <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-500 text-xs space-y-2 mt-2">
                          <div className="flex items-center gap-2 font-bold">
                            <ShieldAlert className="h-4 w-4 shrink-0" />
                            <span>Pre-Payment Verification Gate: National ID Required</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Inzan policy requires entering the National ID (14 digits) or Passport before payment can proceed.
                          </p>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Egyptian National ID (14 digits) or Passport..."
                              value={inlineNationalId}
                              onChange={e => setInlineNationalId(e.target.value)}
                              className="h-9 text-xs bg-background text-foreground"
                            />
                            <Button
                              size="sm"
                              type="button"
                              disabled={!isValidNationalIdOrPassport(inlineNationalId) || isSavingNationalId}
                              onClick={async () => {
                                if (clientId && isValidNationalIdOrPassport(inlineNationalId)) {
                                  setIsSavingNationalId(true);
                                  try {
                                    await updateClient(clientId, { nationalId: inlineNationalId.trim() });
                                    setAlertTitle('Verified');
                                    setAlertDescription('National ID verified and saved to member profile.');
                                    setAlertOpen(true);
                                  } finally {
                                    setIsSavingNationalId(false);
                                  }
                                }
                              }}
                              className="h-9 text-xs font-bold shrink-0"
                            >
                              {isSavingNationalId ? 'Saving...' : 'Save & Verify'}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
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
                        const end = safeAddDays(e.target.value, pkg.expiryDays);
                        setEndDate(safeFormatDate(end, 'yyyy-MM-dd', ''));
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
                    <Select value={discountType || 'none'} disabled={!canApplyDiscount} onValueChange={(v) => {
                      if (v === 'none') {
                        setDiscountType('');
                        setDiscountValue('');
                        setDiscountedAmount('');
                        setAmountPaid('');
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
                          disabled={!canApplyDiscount}
                          onChange={(e) => setDiscountValue(e.target.value)} 
                        />
                      </div>
                    )}
                  </div>
                  {discountedAmount && (
                    <div className="text-xs space-y-1 ml-1">
                      <p className="font-semibold text-emerald-500">Net Due: {discountedAmount} LE</p>
                      {pricingBreakdown.discountAmount > 0 && (
                        <p className="text-rose-500">Discount: {pricingBreakdown.discountAmount.toLocaleString()} LE</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Amount Paid Now (LE)</Label>
                    <Input
                      type="number"
                      placeholder={pricingBreakdown.netAmount.toFixed(2)}
                      className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-lg font-bold font-mono"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                    />
                    {amountPaid && pricingBreakdown.remainingBalance > 0 && (
                      <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2 mt-2">
                        <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-300">
                          <span>Remaining Debt (Installment Schedule)</span>
                          <span>{formatCurrencyAmount(pricingBreakdown.remainingBalance)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Split Installments</Label>
                            <select
                              value={installmentCount}
                              onChange={(e) => setInstallmentCount(Number(e.target.value))}
                              className="w-full h-8 rounded-lg bg-background border px-2 text-xs font-bold"
                            >
                              <option value={1}>1 Installment</option>
                              <option value={2}>2 Even Installments</option>
                              <option value={3}>3 Even Installments</option>
                              <option value={4}>4 Even Installments</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">1st Due Date</Label>
                            <Input
                              type="date"
                              value={firstInstallmentDueDate}
                              onChange={(e) => setFirstInstallmentDueDate(e.target.value)}
                              className="h-8 text-xs bg-background px-2"
                            />
                          </div>
                        </div>
                        <div className="space-y-1 pt-1 border-t border-amber-500/20 text-[11px] font-mono">
                          {splitInstallmentsEvenly(
                            pricingBreakdown.remainingBalance,
                            installmentCount,
                            firstInstallmentDueDate || format(addDays(new Date(), 30), 'yyyy-MM-dd'),
                            30
                          ).map((inst, idx) => (
                            <div key={inst.index} className="flex justify-between">
                              <span>Installment #{idx + 1} ({inst.dueDate}):</span>
                              <span className="font-bold">{inst.amount.toLocaleString()} LE</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {discountType && (
                    <div className="space-y-2 pt-2 border-t border-border/30">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Discount Category</Label>
                      <Select value={discountReason} onValueChange={(v: any) => setDiscountReason(v)}>
                        <SelectTrigger className="h-10 rounded-xl bg-background/50 border-white/10 text-xs font-medium">
                          <SelectValue placeholder="Discount Category" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-none shadow-2xl">
                          <SelectItem value="Standard">Standard / Manager Discretion</SelectItem>
                          <SelectItem value="Corporate">Corporate Partner (Proof Required)</SelectItem>
                          <SelectItem value="Referral">Member Referral</SelectItem>
                          <SelectItem value="Promotional">Seasonal / Promotional Campaign</SelectItem>
                        </SelectContent>
                      </Select>

                      {discountReason === 'Corporate' && (
                        <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-primary flex items-center gap-1.5">
                              <Paperclip className="h-3.5 w-3.5" />
                              Corporate Verification Document *
                            </span>
                            {corporateProofUrl && (
                              <Badge className="bg-emerald-500 text-white text-[10px]">Proof Attached</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Upload National ID or Corporate Work Badge (Image / PDF). Required to authorize corporate pricing.
                          </p>
                          <Input
                            type="file"
                            accept=".png,.jpg,.jpeg,.pdf"
                            disabled={isUploadingCorporateProof}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const okType = /^image\/(png|jpe?g)$/.test(file.type) || file.type === 'application/pdf';
                              if (!okType || file.size > 5 * 1024 * 1024) {
                                setAlertTitle('Invalid Document');
                                setAlertDescription('Upload a PNG, JPG or PDF file up to 5MB.');
                                setAlertOpen(true);
                                e.target.value = '';
                                return;
                              }
                              setIsUploadingCorporateProof(true);
                              try {
                                const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '');
                                const path = `corporate_proofs/${clientId || 'guest'}_${Date.now()}_${cleanName}`;
                                const r = storageRef(storage, path);
                                await uploadBytes(r, file);
                                const url = await getDownloadURL(r);
                                setCorporateProofUrl(url);
                                setCorporateProofFileName(file.name);
                              } catch (err: any) {
                                console.error('Upload proof failed:', err);
                                setAlertTitle('Upload Failed');
                                setAlertDescription(err?.message || 'Failed to upload document.');
                                setAlertOpen(true);
                              } finally {
                                setIsUploadingCorporateProof(false);
                              }
                            }}
                            className="h-9 text-xs bg-background"
                          />
                          {corporateProofFileName && (
                            <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                              Attached: {corporateProofFileName}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.payment_method')}</Label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !useSplitTender;
                        setUseSplitTender(next);
                        if (next && !primaryTenderAmount) {
                          setPrimaryTenderAmount(String(Math.round(pricingBreakdown.amountPaid / 2)));
                        }
                      }}
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border transition-all ${
                        useSplitTender
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/40'
                      }`}
                    >
                      {useSplitTender ? '✓ Split Tender (2 Methods)' : '+ Split Tender (Cash + Instapay / Visa)'}
                    </button>
                  </div>
                  <Select value={method} onValueChange={(v) => v && setMethod(v as Payment['method'])}>
                    <SelectTrigger className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder={t('payments.payment_method')} />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      <SelectItem value="Cash" className="rounded-xl py-3 px-4">{t('dashboard.cash')}</SelectItem>
                      <SelectItem value="Credit Card" className="rounded-xl py-3 px-4">{t('dashboard.visa')}</SelectItem>
                      <SelectItem value="Instapay" className="rounded-xl py-3 px-4">{t('dashboard.instapay')}</SelectItem>
                      <SelectItem value="Wallet Balance" className="rounded-xl py-3 px-4">💳 Wallet Cash Balance</SelectItem>
                      <SelectItem value="ValU" className="rounded-xl py-3 px-4">ValU (BNPL Installments)</SelectItem>
                      <SelectItem value="Sympl" className="rounded-xl py-3 px-4">Sympl (Pay Later)</SelectItem>
                      <SelectItem value="Souhoola" className="rounded-xl py-3 px-4">Souhoola (BNPL)</SelectItem>
                      <SelectItem value="Fawry" className="rounded-xl py-3 px-4">Fawry Reference Code</SelectItem>
                      <SelectItem value="Bank Transfer" className="rounded-xl py-3 px-4">Bank Transfer</SelectItem>
                      <SelectItem value="Other" className="rounded-xl py-3 px-4">{t('leads.tabs.other')}</SelectItem>
                    </SelectContent>
                  </Select>

                  {clientId && !isWalkInGuest && (() => {
                    const selClient = clients.find(c => c.id === clientId);
                    const wBal = Number((selClient as any)?.walletBalance || 0);
                    if (wBal <= 0 && method !== 'Wallet Balance' && (!useSplitTender || secondaryMethod !== 'Wallet Balance')) return null;
                    return (
                      <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          💳 Member Wallet Cash Balance: <span className="font-mono font-black">{wBal.toLocaleString()} LE</span>
                        </span>
                        {wBal > 0 && wBal < pricingBreakdown.amountPaid && !useSplitTender && (
                          <button
                            type="button"
                            onClick={() => {
                              setMethod('Wallet Balance');
                              setUseSplitTender(true);
                              setPrimaryTenderAmount(String(wBal));
                              setSecondaryMethod('Cash');
                            }}
                            className="text-[11px] font-bold underline text-emerald-600 dark:text-emerald-400 hover:opacity-80"
                          >
                            Apply {wBal.toLocaleString()} LE + Split Remainder
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {useSplitTender && (
                    <div className="p-3 rounded-xl border border-primary/25 bg-primary/5 space-y-2.5">
                      <div className="text-[11px] font-bold uppercase text-primary">
                        Dual-Tender Split (Pay Type 1 + Pay Type 2)
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                            {method} Amount (LE)
                          </Label>
                          <Input
                            type="number"
                            value={primaryTenderAmount}
                            onChange={(e) => setPrimaryTenderAmount(e.target.value)}
                            placeholder="0"
                            className="h-9 bg-background font-mono text-xs font-bold"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                            Pay Type 2 Method
                          </Label>
                          <select
                            value={secondaryMethod}
                            onChange={(e) => setSecondaryMethod(e.target.value as Payment['method'])}
                            className="w-full h-9 rounded-md bg-background border px-2 text-xs font-bold"
                          >
                            <option value="Credit Card">Visa / Credit Card</option>
                            <option value="Instapay">Instapay</option>
                            <option value="Cash">Cash</option>
                            <option value="Wallet Balance">Wallet Cash Balance</option>
                            <option value="ValU">ValU</option>
                            <option value="Sympl">Sympl</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-primary/15">
                        <span className="text-muted-foreground">Auto-calculated {secondaryMethod}:</span>
                        <span className="font-mono font-bold text-primary">
                          {calculateSplitTenderRemaining(
                            pricingBreakdown.amountPaid,
                            parseFloat(primaryTenderAmount) || 0
                          ).remainingDebt.toLocaleString()}{' '}
                          LE
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {(method === 'Instapay' || (useSplitTender && secondaryMethod === 'Instapay')) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">
                        {t('payments.instapay_ref')} / Paste SMS
                      </Label>
                      {(() => {
                        const selClient = clients.find((c) => c.id === clientId);
                        const waLink = buildWhatsAppPaymentLinkUrl({
                          clientName: selClient?.name || guestClientName || 'Member',
                          clientPhone: selClient?.phone || newClientPhone,
                          clubName: branding?.companyName || 'Mitrixo Gym',
                          packageName: packageType || 'Membership',
                          amount: pricingBreakdown.amountPaid || Number(amount) || 0,
                          method: 'Instapay',
                        });
                        return waLink ? (
                          <a
                            href={waLink}
                            target="whatsapp_crm"
                            onClick={(e) => {
                              e.preventDefault();
                              openWhatsAppUrl(waLink);
                            }}
                            className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Send IPA via WhatsApp
                          </a>
                        ) : null;
                      })()}
                    </div>
                    <Input 
                      placeholder="Paste InstaPay SMS or 12-digit IPN Ref..." 
                      className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all px-5 text-base font-mono"
                      value={instapayRef} 
                      onChange={(e) => {
                        const rawVal = e.target.value;
                        const parsed = validateOrExtractInstapayRef(rawVal);
                        setInstapayRef(parsed.valid ? parsed.normalizedRef : rawVal.replace(/\D/g, '').slice(0, 16));
                      }} 
                    />
                  </div>
                )}

                {(['ValU', 'Sympl', 'Souhoola'] as const).includes(method as any) && (
                  <div className="p-3.5 rounded-2xl border border-purple-500/30 bg-purple-500/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase text-purple-600 dark:text-purple-400">
                        {method} BNPL Plan
                      </span>
                      <div className="flex gap-1">
                        {([3, 6, 9, 12] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setBnplMonths(m)}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              bnplMonths === m
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-background text-muted-foreground border-border'
                            }`}
                          >
                            {m}M
                          </button>
                        ))}
                      </div>
                    </div>
                    {(() => {
                      const plan = calculateBnplSchedule(
                        pricingBreakdown.amountPaid || Number(amount) || 0,
                        method as 'ValU' | 'Sympl' | 'Souhoola',
                        bnplMonths
                      );
                      const selClient = clients.find((c) => c.id === clientId);
                      const waBnplUrl = buildWhatsAppPaymentLinkUrl({
                        clientName: selClient?.name || guestClientName || 'Member',
                        clientPhone: selClient?.phone || newClientPhone,
                        clubName: branding?.companyName || 'Mitrixo Gym',
                        packageName: packageType || 'Membership',
                        amount: pricingBreakdown.amountPaid || Number(amount) || 0,
                        method: method as 'ValU' | 'Sympl' | 'Souhoola',
                        bnplMonths,
                      });
                      return (
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between font-mono">
                            <span className="text-muted-foreground">Est. Monthly Installment:</span>
                            <span className="font-bold text-purple-600 dark:text-purple-400">
                              {plan.monthlyInstallment.toLocaleString()} EGP / mo ({plan.months} mos)
                            </span>
                          </div>
                          {waBnplUrl && (
                            <a
                              href={waBnplUrl}
                              target="whatsapp_crm"
                              onClick={(e) => {
                                e.preventDefault();
                                openWhatsAppUrl(waBnplUrl);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline pt-1"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              Send {method} Checkout Link via WhatsApp
                            </a>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.receipt_no')}</Label>
                  <div className="relative">
                    <Receipt className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input 
                      placeholder="Optional receipt / invoice number" 
                      className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 focus-visible:ring-primary border-white/10 transition-all pl-14 pr-5 text-lg"
                      value={receiptNumber} 
                      onChange={(e) => setReceiptNumber(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('leads.branch') || 'Branch'}</Label>
                  <Select 
                    value={paymentBranch || (branches.length > 0 ? branches[0] : '')} 
                    onValueChange={(v) => v && setPaymentBranch(v)}
                  >
                    <SelectTrigger className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue placeholder={t('leads.branch') || 'Select Branch'} />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      {branches.map(b => (
                        <SelectItem key={b} value={b} className="rounded-xl py-3 px-4">{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-full space-y-3">
                  {isInzan && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
                      Filter Packages by Category
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {(['All', 'Membership', 'PT', 'Classes', 'SGF', 'Nutrition'] as const).map((pill) => {
                        const isSelected = packageCategoryFilter === pill;
                        return (
                          <button
                            key={pill}
                            type="button"
                            onClick={() => {
                              setPackageCategoryFilter(pill);
                              if (pill === 'PT') setPaymentCategory('PT');
                              else if (pill === 'Classes' || pill === 'SGF') setPaymentCategory('Classes');
                              else if (pill === 'Membership') setPaymentCategory('Memberships');
                            }}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                              isSelected
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                : 'bg-background/60 text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground'
                            }`}
                          >
                            {pill}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  )}
                  {(() => {
                    const currentSelectedClient = clientId ? clients.find(c => c.id === clientId) : null;
                    return (
                      <>
                        <CascadingPackageSelector
                          packages={visiblePackages}
                          selectedPackageName={packageType}
                          initialCategory={currentSelectedClient?.memberCategory || currentSelectedClient?.category || (isCreatingNew ? newClientCategory : 'Adults')}
                          initialBranch={paymentBranch || currentSelectedClient?.branch || (isCreatingNew ? newClientBranch : 'All Branches')}
                          branches={branches}
                          onCategoryChange={(cat) => {
                            if (isCreatingNew) setNewClientCategory(cat);
                          }}
                          onBranchChange={(b) => {
                            if (isCreatingNew) setNewClientBranch(b);
                            if (b && b !== 'All Branches') setPaymentBranch(b);
                          }}
                          onPackageSelect={(pkg, isPt) => {
                            if (!pkg) {
                              setPackageType('Custom');
                              return;
                            }
                            setPackageType(pkg.name);
                            setAmount(pkg.price.toString());
                            setPaymentCategory(isPt ? 'PT' : resolvePaymentCategory(pkg.name));
                            if (startDate) {
                              const end = safeAddDays(startDate, pkg.expiryDays);
                              setEndDate(safeFormatDate(end, 'yyyy-MM-dd', ''));
                            }
                          }}
                        />
                        {(() => {
                          if (!isInzan) return null;
                          const currentPkg = packages.find(p => p.name === packageType);
                          const eligibility = (!isWalkInGuest && currentSelectedClient && currentPkg)
                            ? validateMembershipEligibility(currentSelectedClient, currentPkg)
                            : { allowed: true, reason: '' };
                          if (eligibility.allowed) return null;
                          return (
                            <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-2xl text-xs flex items-center gap-2">
                              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500" />
                              <span><strong>Primary Membership Required:</strong> {eligibility.reason}</span>
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
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

                <div className="space-y-3">
                  <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">Category</Label>
                  <Select value={paymentCategory} onValueChange={(v) => v && setPaymentCategory(v as PaymentCategory)}>
                    <SelectTrigger className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-5 text-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-none shadow-2xl">
                      {PAYMENT_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat} className="rounded-xl py-3 px-4">{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {paymentCategory === 'PT' && (
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

                {(() => {
                  const selectedClientForForm = (!isWalkInGuest && clientId) ? clients.find(c => c.id === clientId) : null;
                  const isRepLockedForForm = isInzan && Boolean(selectedClientForForm?.assignedTo || selectedClientForForm?.salesRep);
                  const isRepFieldDisabled = isRepLockedForForm && !isSalesManager;

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground ml-1">{t('payments.sales_person')}</Label>
                        {isInzan && isRepLockedForForm && !isSalesManager ? (
                          <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                            🔒 Locked to Assigned Rep
                          </Badge>
                        ) : isInzan && isSalesManager && isRepLockedForForm ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                            Sales Manager Authority
                          </Badge>
                        ) : null}
                      </div>
                      <Select
                        value={salesName}
                        disabled={isRepFieldDisabled}
                        onValueChange={(v) => {
                          if (!v) return;
                          if (isInzan && isSalesManager && salesName && salesName !== v) {
                            setPendingSalesName(v);
                            setReassignPaymentTarget({ isEdit: false, oldName: salesName, newName: v });
                            setSalesReassignConfirmOpen(true);
                          } else {
                            setSalesName(v);
                          }
                        }}
                      >
                        <SelectTrigger className="h-12 md:h-14 rounded-xl md:rounded-2xl bg-background/50 border-white/10 px-5 text-lg disabled:opacity-60 disabled:cursor-not-allowed">
                          <SelectValue placeholder="For commission" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-none shadow-2xl">
                          {uniqueSalesNames.map((name: string) => (
                            <SelectItem key={name} value={name} className="rounded-xl py-3 px-4">{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isInzan && isRepLockedForForm && !isSalesManager && (
                        <p className="text-[10px] text-muted-foreground ml-1">
                          Member is permanently locked to their assigned sales representative. Only the Sales Manager can reassign this member.
                        </p>
                      )}
                    </div>
                  );
                })()}

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

              {inzanGateIssues.length > 0 && (
                <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
                  <p className="font-bold flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Complete member verification before payment:</p>
                  <ul className="mt-1 list-disc pl-6 text-xs space-y-0.5">
                    {inzanGateIssues.map(issue => <li key={issue}>{issue}</li>)}
                  </ul>
                </div>
              )}
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
                  disabled={inzanGateIssues.length > 0 || isUploadingCorporateProof}
                  className="flex-1 h-12 md:h-16 rounded-xl md:rounded-2xl text-base md:text-xl font-extrabold shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  {t('payments.complete_transaction')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {(() => {
        const activeAdvCount = [
          filterPackage !== 'All',
          filterCoach !== 'All',
          filterSalesName !== 'All',
          Boolean(filterDateFrom),
          Boolean(filterDateTo),
          Boolean(filterShowOnlyHeld),
        ].filter(Boolean).length;

        return (
          <div className="mb-5 bg-card p-3 sm:p-4 rounded-xl border shadow-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('payments.filters.search')}
                  className="pl-9 h-10 bg-muted/30 border-border/50 focus-visible:ring-1 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <select
                aria-label={t('payments.filters.method')}
                className="flex h-10 w-[135px] sm:w-[155px] items-center justify-between rounded-md bg-muted/30 border border-border/50 px-2.5 py-1.5 text-xs sm:text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
              >
                <option value="All">{t('common.all_methods')}</option>
                <option value="Cash">{t('dashboard.cash')}</option>
                <option value="Credit Card">{t('dashboard.visa')}</option>
                <option value="Instapay">{t('dashboard.instapay')}</option>
                <option value="ValU">ValU</option>
                <option value="Sympl">Sympl</option>
                <option value="Souhoola">Souhoola</option>
                <option value="Fawry">Fawry</option>
                <option value="Bank Transfer">{t('common.bank_transfer')}</option>
                <option value="Other">{t('common.other')}</option>
              </select>

              <select
                aria-label={t('payments.filters.branch')}
                className="flex h-10 w-[135px] sm:w-[155px] items-center justify-between rounded-md bg-muted/30 border border-border/50 px-2.5 py-1.5 text-xs sm:text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
              >
                <option value="All">{t('dashboard.all_branches')}</option>
                {branches.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <select
                aria-label={t('payments.filters.sort_by')}
                className="flex h-10 w-[145px] sm:w-[170px] items-center justify-between rounded-md bg-muted/30 border border-border/50 px-2.5 py-1.5 text-xs sm:text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
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

              <Button
                type="button"
                variant={showAdvancedFilters || activeAdvCount > 0 ? 'default' : 'outline'}
                size="sm"
                className="h-10 gap-1.5 px-3 text-xs font-semibold shrink-0"
                onClick={() => setShowAdvancedFilters(prev => !prev)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filters & Dates</span>
                {activeAdvCount > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-background/20 px-1 text-[10px] font-bold">
                    {activeAdvCount}
                  </span>
                )}
              </Button>
            </div>

            {(showAdvancedFilters || activeAdvCount > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-border/50">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground ml-1">{t('payments.filters.package')}</Label>
                  <select
                    className="flex h-9 w-full items-center justify-between rounded-md bg-muted/30 border border-border/50 px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={filterPackage}
                    onChange={(e) => setFilterPackage(e.target.value)}
                  >
                    <option value="All">{t('common.all_packages')}</option>
                    {uniquePackageNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground ml-1">{t('payments.filters.pt_coach')}</Label>
                  <select
                    className="flex h-9 w-full items-center justify-between rounded-md bg-muted/30 border border-border/50 px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={filterCoach}
                    onChange={(e) => setFilterCoach(e.target.value)}
                  >
                    <option value="All">{t('common.all_coaches')}</option>
                    {uniqueCoachNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground ml-1">{t('payments.filters.sales_person')}</Label>
                  <select
                    className="flex h-9 w-full items-center justify-between rounded-md bg-muted/30 border border-border/50 px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={filterSalesName}
                    onChange={(e) => setFilterSalesName(e.target.value)}
                  >
                    <option value="All">{t('dashboard.all_reps')}</option>
                    {uniqueSalesNames.map((name: string) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground ml-1">{t('payments.filters.from_date')}</Label>
                  <Input
                    type="date"
                    className="flex h-9 w-full rounded-md bg-muted/30 border border-border/50 px-2.5 py-1 text-xs focus-visible:ring-1"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground ml-1">{t('payments.filters.to_date')}</Label>
                  <Input
                    type="date"
                    className="flex h-9 w-full rounded-md bg-muted/30 border border-border/50 px-2.5 py-1 text-xs focus-visible:ring-1"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                  />
                </div>

                <div className="flex flex-col justify-end gap-1.5">
                  <div className="flex items-center gap-2 h-9">
                    <Checkbox
                      id="filterHeld"
                      checked={filterShowOnlyHeld}
                      onCheckedChange={(checked) => setFilterShowOnlyHeld(checked as boolean)}
                    />
                    <Label htmlFor="filterHeld" className="text-xs font-semibold text-muted-foreground cursor-pointer">
                      {t('payments.filters.show_only_held')}
                    </Label>
                    {activeAdvCount > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground ml-auto"
                        onClick={() => {
                          setFilterPackage('All');
                          setFilterCoach('All');
                          setFilterSalesName('All');
                          setFilterDateFrom('');
                          setFilterDateTo('');
                          setFilterShowOnlyHeld(false);
                        }}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

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

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t('payments.table.date')}</TableHead>
                  <TableHead>{t('payments.table.client')} & {t('payments.table.package')}</TableHead>
                  <TableHead>{t('payments.table.amount')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('payments.table.method')} & {t('payments.table.branch')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('payments.table.sales_member')}</TableHead>
                  <TableHead className="text-right pr-4 w-[108px]">{t('payments.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPayments.length > 0 ? (
                  paginatedPayments.map(payment => {
                    const client = resolvePaymentClient(payment);
                    const isGuestPayment = (payment as any).isGuest || payment.clientId === 'WALK-IN-GUEST' || !!(payment.guestName || (payment as any).guest_name);
                    const clientDisplayName =
                      client?.name ||
                      payment.clientName ||
                      payment.client_name ||
                      payment.guestName ||
                      (payment as any).guest_name ||
                      (t('payments.table.unknown_client') || 'Walk-in Guest');
                    const recordedByUser = users.find(u => u.id === payment.recordedBy);
                    const salesRepUser = !recordedByUser ? users.find(u => u.id === payment.sales_rep_id) : null;
                    const recordedByLabel = recordedByUser?.name
                      || (payment as any).recordedByName
                      || (payment.recordedBy ? resolveUserDisplay(payment.recordedBy, users, payment.recordedBy) : '')
                      || salesRepUser?.name
                      || (payment as any).sales_rep_name
                      || '—';
                    const editEligibility = isPaymentEditableByStaff(payment, currentUser, can('payments.edit'));
                    const isPaymentRepLocked = isInzan && Boolean(client?.assignedTo || client?.salesRep || payment.sales_rep_id || payment.salesName);
                    const resolvedBranchLabel = resolvePaymentBranch(payment, client) !== 'Unknown' ? resolvePaymentBranch(payment, client) : t('leads.tabs.unassigned');

                    return (
                      <TableRow key={payment.id} className="group hover:bg-muted/40 transition-colors">
                        {/* Column 1: Date, Time & Receipt # */}
                        <TableCell className="pl-4 py-3 text-xs sm:text-sm whitespace-nowrap align-top">
                          <div className="flex flex-col gap-0.5">
                            {payment.date ? (() => {
                              const egyptDate = getEgyptDate(payment.date);
                              const paymentYear = egyptDate.getFullYear();
                              return (
                                <>
                                  <div className="font-semibold text-foreground">
                                    {safeFormatDate(egyptDate, 'MMM d')}
                                    {paymentYear !== new Date().getFullYear() && (
                                      <span className="text-[10px] text-amber-600 font-semibold ml-1">
                                        {paymentYear}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {payment.created_at ? safeFormatDate(getEgyptDate(payment.created_at), 'h:mm a') : safeFormatDate(egyptDate, 'h:mm a')}
                                  </div>
                                </>
                              );
                            })() : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {payment.receiptSerial && (
                              <span className="font-mono text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded w-fit mt-0.5">
                                #{payment.receiptSerial}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Column 2: Client Name + Package + Coach */}
                        <TableCell className="py-3 font-medium text-xs sm:text-sm align-top">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {client ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTab('clients');
                                    setActiveClientId(client.id);
                                  }}
                                  className="text-primary hover:underline font-bold text-xs sm:text-sm text-left"
                                >
                                  {client.name}
                                </button>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs sm:text-sm text-foreground">{clientDisplayName}</span>
                                  {isGuestPayment && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground border-border/60 font-medium">
                                      {t('payments.table.walk_in_tag') || 'Guest'}
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {payment.isOnHold && (
                                <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-[10px] px-1.5 py-0" title={payment.holdReason || t('payments.hold')}>
                                  {t('payments.hold')}
                                </Badge>
                              )}
                            </div>

                            {/* Package & Coach stacked cleanly right under Client Name */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] font-semibold bg-muted/30 max-w-[200px] truncate">
                                {payment.packageType || '—'}
                              </Badge>
                              {payment.linkedEntitlementId && (
                                <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200 text-[9px] px-1 h-4 shadow-none" title="Linked to Entitlement">
                                  Entitled
                                </Badge>
                              )}
                              {payment.coachName && (
                                <span className="text-[10px] text-muted-foreground">
                                  • {t('payments.coach')}: <strong className="text-foreground/80">{payment.coachName}</strong>
                                </span>
                              )}
                            </div>

                            {payment.isOnHold && payment.holdReason && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400">{payment.holdReason}</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Column 3: Amount + Status + Discount/Debt */}
                        <TableCell className="py-3 text-xs sm:text-sm whitespace-nowrap align-top">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-green-600 dark:text-green-400 text-xs sm:text-sm">
                                {payment.amount.toLocaleString()} {t('payments.currency_le')}
                              </span>
                              {renderStatusBadge(payment.status)}
                            </div>
                            {payment.originalAmount && payment.originalAmount > payment.amount ? (
                              <span className="text-[10px] text-muted-foreground line-through font-mono">
                                {payment.originalAmount.toLocaleString()} {t('payments.currency_le')}
                              </span>
                            ) : null}
                            {(() => {
                              const val = Number(payment.discountValue) || 0;
                              const orig = Number(payment.originalAmount) || 0;
                              const current = Number(payment.amount) || 0;
                              if (val > 0) {
                                const label = payment.discountType === 'percentage' ? `${val}% OFF` : `${val.toLocaleString()} LE OFF`;
                                const reason = payment.discountReason && payment.discountReason !== 'Standard' ? ` (${payment.discountReason})` : '';
                                return (
                                  <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-semibold px-1 py-0 mt-0.5 w-fit inline-flex items-center gap-1">
                                    <Tag className="w-2.5 h-2.5" />
                                    {label}{reason}
                                  </Badge>
                                );
                              } else if (orig > current && orig > 0) {
                                return (
                                  <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-semibold px-1 py-0 mt-0.5 w-fit inline-flex items-center gap-1">
                                    <Tag className="w-2.5 h-2.5" />
                                    {(orig - current).toLocaleString()} LE OFF
                                  </Badge>
                                );
                              }
                              return null;
                            })()}
                            {payment.amount_paid !== undefined && payment.amount_paid < payment.amount ? (
                              <span className="text-[10px] text-amber-600 font-medium">
                                Paid: {payment.amount_paid.toLocaleString()} LE
                              </span>
                            ) : null}
                            {payment.remainingBalance && payment.remainingBalance > 0 ? (
                              <span className="text-[10px] text-rose-500 font-medium">
                                Debt: {payment.remainingBalance.toLocaleString()} LE
                              </span>
                            ) : null}
                          </div>
                        </TableCell>

                        {/* Column 4: Method + IPN + Branch */}
                        <TableCell className="hidden sm:table-cell py-3 align-top">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center text-xs font-medium">
                                {getMethodIcon(payment.method)}
                                {payment.method === 'Cash' ? t('dashboard.cash') : payment.method === 'Credit Card' ? t('dashboard.visa') : payment.method === 'Bank Transfer' ? t('common.bank_transfer') : payment.method === 'Instapay' ? t('dashboard.instapay') : payment.method === 'Other' ? t('common.other') : payment.method}
                              </span>
                              {(payment.method === 'Instapay' || payment.secondaryMethod === 'Instapay') && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const nextVerified = !payment.instapayVerified;
                                    await updatePayment(payment.id, {
                                      instapayVerified: nextVerified,
                                      instapayVerifiedBy: nextVerified ? (currentUser?.name || 'Admin') : '',
                                      instapayVerifiedAt: nextVerified ? new Date().toISOString() : '',
                                    } as any);
                                  }}
                                  title={
                                    payment.instapayVerified
                                      ? `Verified by ${payment.instapayVerifiedBy || 'Admin'} — click to unverify`
                                      : 'Click to verify InstaPay transfer in bank statement'
                                  }
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                                    payment.instapayVerified
                                      ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                                      : 'bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/25'
                                  }`}
                                >
                                  {payment.instapayVerified ? '✓ IPN' : '⏳ Verify'}
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                                {resolvedBranchLabel}
                              </Badge>
                              {payment.instapayRef && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  #{payment.instapayRef}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Column 5: Sales Rep + Recorded By + Notes */}
                        <TableCell className="hidden md:table-cell py-3 align-top">
                          <div className="flex flex-col gap-1 max-w-[190px]">
                            {payment.salesName ? (
                              <Badge variant="outline" className="flex items-center gap-1 w-fit text-[10px] bg-amber-50 dark:bg-amber-900/10 text-amber-600 border-amber-200 px-2 py-0">
                                <User className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate max-w-[140px]">{resolveUserDisplay(payment.salesName, users, payment.salesName || '')}</span>
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                            {recordedByLabel && recordedByLabel !== '—' && (
                              <span className="text-[10px] text-muted-foreground truncate">
                                By: <strong className="font-medium text-foreground/80">{recordedByLabel}</strong>
                              </span>
                            )}
                            {payment.notes && (
                              <span className="text-[10px] text-muted-foreground truncate" title={payment.notes}>
                                {payment.notes}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Column 6: Compact Actions (WhatsApp + Thermal Receipt + ⋯ More Menu) */}
                        <TableCell className="text-right pr-4 py-3 align-top whitespace-nowrap">
                          <div className="flex items-center justify-end gap-0.5">
                            {(() => {
                              const waUrl = buildWhatsAppPaymentReceiptUrl({
                                payment,
                                client,
                                clubName: branding?.companyName || 'Mitrixo Gym',
                              });
                              return waUrl ? (
                                <a
                                  href={waUrl}
                                  target="whatsapp_crm"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openWhatsAppUrl(waUrl);
                                  }}
                                  title="Send Digital Receipt via WhatsApp"
                                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </a>
                              ) : null;
                            })()}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => printThermal80mmReceipt(payment, client)}
                              title="Print 80mm Thermal POS Receipt"
                              className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            >
                              <Receipt className="h-4 w-4" />
                            </Button>

                            {/* Compact ⋯ Actions Menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    title="More Payment Actions"
                                  />
                                }
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => printInvoice(payment, client)}>
                                  <Printer className="h-4 w-4 text-muted-foreground" />
                                  <span>{t('payments.print_invoice') || 'Print A4 Invoice'}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setUpgradePaymentId(payment.id);
                                    setIsUpgradeDialogOpen(true);
                                    setUpgradePackageType('');
                                    setUpgradeMethod(payment.method || 'Cash');
                                    setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd'));
                                  }}
                                >
                                  <TrendingUp className="h-4 w-4 text-blue-600" />
                                  <span>{t('payments.upgrade_package') || 'Upgrade Package'}</span>
                                </DropdownMenuItem>
                                {editEligibility.canEdit && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingPaymentId(payment.id);
                                      setEditAmount(payment.amount.toString());
                                      setEditNotes(payment.notes || '');
                                      setEditBranch(resolvePaymentBranch(payment, client) !== 'Unknown' ? resolvePaymentBranch(payment, client) : '');
                                      setEditMethod(payment.method);
                                      setEditSalesName(payment.salesName || '');
                                      setEditCoachName(payment.coachName || '');
                                      setEditClientName(client?.name || payment.clientName || payment.client_name || payment.guestName || (payment as any).guest_name || '');
                                      setEditClientPhone(client?.phone || (client?.memberId ? String(client.memberId) : ''));
                                      setEditPaymentDate(payment.date ? payment.date.substring(0, 10) : format(new Date(), 'yyyy-MM-dd'));
                                    }}
                                  >
                                    <DollarSign className="h-4 w-4 text-emerald-600" />
                                    <span>{t('payments.edit_payment') || 'Edit Payment'}</span>
                                  </DropdownMenuItem>
                                )}
                                {!payment.isOnHold ? (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setHoldPaymentId(payment.id);
                                      setIsHoldDialogOpen(true);
                                      setHoldReason('');
                                    }}
                                  >
                                    <Pause className="h-4 w-4 text-amber-600" />
                                    <span>{t('payments.hold_payment') || 'Put Payment On Hold'}</span>
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => handleReleasePayment(payment.id)}>
                                    <Play className="h-4 w-4 text-emerald-600" />
                                    <span>{t('payments.release_payment') || 'Release from Hold'}</span>
                                  </DropdownMenuItem>
                                )}
                                {(!payment.status || payment.status === 'paid') && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setRefundPaymentId(payment.id);
                                      setRefundAmount(payment.amount.toString());
                                      setRefundMethod('Original Method');
                                      setRefundReason('');
                                      setIsRefundDialogOpen(true);
                                    }}
                                  >
                                    <RotateCcw className="h-4 w-4 text-purple-600" />
                                    <span>Request Refund</span>
                                  </DropdownMenuItem>
                                )}
                                {canDeletePayment && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={payment.isOnHold}
                                      onClick={() => {
                                        if (!payment.isOnHold) handleDeletePayment(payment.id);
                                      }}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      <span>{payment.isOnHold ? t('payments.cannot_delete_held') : (t('payments.delete_payment') || 'Delete Payment')}</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Controlled Dialogs for Upgrade, Edit, Hold, and Refund */}
                            <Dialog open={isUpgradeDialogOpen && upgradePaymentId === payment.id} onOpenChange={(open) => {
                              if (!open) {
                                setIsUpgradeDialogOpen(false);
                                setUpgradePaymentId(null);
                              }
                            }}>
                              <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
                                <DialogHeader>
                                  <DialogTitle className="text-xl font-bold">{t('payments.upgrade.title')}</DialogTitle>
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
                                        {visiblePackages.map(pkg => (
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

                            {editEligibility.canEdit && (
                              <Dialog open={editingPaymentId === payment.id} onOpenChange={(open) => {
                                if (!open) setEditingPaymentId(null);
                              }}>
                                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>{t('payments.edit.title')} - {client?.name || clientDisplayName}</DialogTitle>
                                  </DialogHeader>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                      <div className="flex items-center justify-between mb-1">
                                        <Label className="text-xs font-semibold">{t('payments.edit.sales_name')}</Label>
                                        {(isInzan && isPaymentRepLocked && !isSalesManager) ? (
                                          <span className="text-[10px] text-amber-500 font-bold">🔒 Locked</span>
                                        ) : isInzan && isSalesManager && isPaymentRepLocked ? (
                                          <span className="text-[10px] text-emerald-500 font-bold">Manager Authority</span>
                                        ) : null}
                                      </div>
                                      <Select
                                        value={editSalesName}
                                        disabled={isInzan && isPaymentRepLocked && !isSalesManager}
                                        onValueChange={(val) => {
                                          if (!val) return;
                                          if (isInzan && isSalesManager && editSalesName && editSalesName !== val) {
                                            setPendingSalesName(val);
                                            setReassignPaymentTarget({ isEdit: true, oldName: editSalesName, newName: val, paymentId: payment.id });
                                            setSalesReassignConfirmOpen(true);
                                          } else {
                                            setEditSalesName(val);
                                          }
                                        }}
                                      >
                                        <SelectTrigger className="h-9 disabled:opacity-60 disabled:cursor-not-allowed">
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
                                    {(payment.package_category_type === 'PT' || (payment.package_category_type as string) === 'Private Training' || payment.coachName) && (
                                      <div>
                                        <Label className="text-xs font-semibold">Coach Name</Label>
                                        <Select value={editCoachName} onValueChange={(val) => setEditCoachName(val || '')}>
                                          <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Select Coach" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="unassigned">Unassigned</SelectItem>
                                            {coaches.map(c => (
                                              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    )}
                                    <div>
                                      <Label className="text-xs font-semibold">{t('payments.edit.amount')}</Label>
                                      <Input
                                        type="number"
                                        value={editAmount}
                                        onChange={(e) => setEditAmount(e.target.value)}
                                        step="0.01"
                                      />
                                    </div>
                                    <div className="sm:col-span-2">
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
                                          u.id === editSalesName ||
                                          (toCanonical(u.name || u.email || '').toLowerCase() === toCanonical(editSalesName || '').toLowerCase())
                                        );
                                        const rawRepId = salesRepUser ? salesRepUser.id : undefined;

                                        const repId = (isPaymentRepLocked && !isSalesManager)
                                          ? (payment.sales_rep_id || client?.assignedTo || client?.salesRep)
                                          : rawRepId;
                                        const repName = (isPaymentRepLocked && !isSalesManager)
                                          ? (payment.salesName || resolveUserDisplay(repId, users, ''))
                                          : editSalesName;

                                        await updatePayment(payment.id, {
                                          amount: parseFloat(editAmount),
                                          notes: editNotes || undefined,
                                          branch: editBranch || undefined,
                                          branchId: toCanonicalBranchId(editBranch) || undefined,
                                          clientBranch: editBranch || undefined,
                                          method: editMethod,
                                          salesName: repName || undefined,
                                          sales_rep_id: repId || undefined,
                                          coachName: (editCoachName && editCoachName !== 'unassigned') ? editCoachName : undefined,
                                          date: editPaymentDate ? safeIsoDate(editPaymentDate) : payment.date,
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

                            <Dialog open={isHoldDialogOpen && holdPaymentId === payment.id} onOpenChange={(open) => {
                              if (!open) {
                                setIsHoldDialogOpen(false);
                                setHoldPaymentId(null);
                                setHoldReason('');
                              }
                            }}>
                              <DialogContent className="w-[95vw] sm:max-w-lg md:max-w-xl rounded-2xl p-6">
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

                            <Dialog open={isRefundDialogOpen && refundPaymentId === payment.id} onOpenChange={(open) => {
                              if (!open) {
                                setIsRefundDialogOpen(false);
                                setRefundPaymentId(null);
                              }
                            }}>
                              <DialogContent className="w-[95vw] sm:max-w-lg md:max-w-xl rounded-2xl p-6">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <RotateCcw className="h-5 w-5 text-purple-600" />
                                    Request Refund
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-2">
                                  <p className="text-sm text-muted-foreground">
                                    Submit a maker-checker refund request for <strong>{clientDisplayName}</strong>.
                                  </p>

                                  <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Refund Amount (LE)</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      max={payment.amount}
                                      placeholder="Refund Amount"
                                      value={refundAmount}
                                      onChange={(e) => setRefundAmount(e.target.value)}
                                      className="rounded-lg"
                                    />
                                    <span className="text-xs text-muted-foreground">Original Payment: {payment.amount.toLocaleString()} LE</span>
                                  </div>

                                  <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Refund Method</Label>
                                    <Select value={refundMethod} onValueChange={(val) => setRefundMethod(val as any || 'Original Method')}>
                                      <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select Method" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Original Method">Original Method ({payment.method})</SelectItem>
                                        <SelectItem value="Cash">Cash</SelectItem>
                                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Reason for Refund</Label>
                                    <Input
                                      placeholder="Explain why this refund is requested..."
                                      value={refundReason}
                                      onChange={(e) => setRefundReason(e.target.value)}
                                      className="rounded-lg"
                                    />
                                  </div>

                                  <div className="flex gap-2 justify-end pt-4">
                                    <Button variant="outline" onClick={() => setIsRefundDialogOpen(false)}>
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={handleRequestRefund}
                                      disabled={!refundReason.trim() || !refundAmount || Number(refundAmount) <= 0 || Number(refundAmount) > payment.amount}
                                      className="bg-purple-600 hover:bg-purple-700 text-white"
                                    >
                                      Submit Request
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
          {visiblePackages.map(pkg => (
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

      {/* Reassign Sales Attribution Confirmation Dialog */}
      <Dialog open={salesReassignConfirmOpen} onOpenChange={setSalesReassignConfirmOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
              Reassign Sales Commission
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 text-sm space-y-3">
            <p>
              Are you sure you want to reassign sales commission from{' '}
              <strong className="text-foreground">{reassignPaymentTarget?.oldName || 'Unassigned'}</strong> to{' '}
              <strong className="text-emerald-600">{reassignPaymentTarget?.newName}</strong>?
            </p>
            <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl border">
              This action modifies commission attribution and will be recorded in the permanent audit trail.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setSalesReassignConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              onClick={async () => {
                if (reassignPaymentTarget) {
                  if (reassignPaymentTarget.isEdit) {
                    setEditSalesName(reassignPaymentTarget.newName);
                  } else {
                    setSalesName(reassignPaymentTarget.newName);
                  }
                  await addAuditLog(
                    'UPDATE',
                    'PAYMENT',
                    reassignPaymentTarget.paymentId || clientId || 'new',
                    `Reassigned sales commission from ${reassignPaymentTarget.oldName || 'unassigned'} to ${reassignPaymentTarget.newName}`,
                    currentUser?.name
                  );
                }
                setSalesReassignConfirmOpen(false);
              }}
            >
              Confirm Reassignment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ShiftHandoverDialog
        open={isShiftHandoverOpen}
        onOpenChange={setIsShiftHandoverOpen}
        currentUser={currentUser}
        selectedBranch={filterBranch !== 'All' ? filterBranch : (branches[0] || 'MAIN')}
      />

      <AlertDialog 
        isOpen={alertOpen}
        onOpenChange={setAlertOpen}
        title={alertTitle}
        description={alertDescription}
      />
    </div>
  );
}
