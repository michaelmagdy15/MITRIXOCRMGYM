import React, { useState, useEffect, useMemo } from 'react';
import { getTenantId } from '../firebase';
import { CorporateAccount, CorporateBenefit } from '../types/corporate';
import { 
  subscribeCorporateAccounts, 
  createCorporateAccount, 
  updateCorporateAccount, 
  deleteCorporateAccount,
  applyCorporateBenefitsToPackage
} from '../services/corporateService';
import { usePackages } from '../hooks/usePackages';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { 
  Building2, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Percent, 
  Calendar, 
  Snowflake, 
  Dumbbell, 
  Users, 
  Copy, 
  Check, 
  Calculator, 
  Mail, 
  Phone, 
  User, 
  Tag, 
  CheckCircle2, 
  XCircle,
  HelpCircle,
  Briefcase
} from 'lucide-react';
import { toast } from 'sonner';

interface FormState {
  companyName: string;
  corporateCode: string;
  domain: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number | string;
  extraDurationDays: number | string;
  extraFreezeDays: number | string;
  extraPtSessions: number | string;
  extraGuestPasses: number | string;
  packageScope: 'all' | 'specific';
  eligiblePackageIds: string[];
  isActive: boolean;
  notes: string;
}

const DEFAULT_FORM_STATE: FormState = {
  companyName: '',
  corporateCode: '',
  domain: '',
  contactPerson: '',
  contactPhone: '',
  contactEmail: '',
  discountType: 'percentage',
  discountValue: 15,
  extraDurationDays: 0,
  extraFreezeDays: 0,
  extraPtSessions: 0,
  extraGuestPasses: 0,
  packageScope: 'all',
  eligiblePackageIds: [],
  isActive: true,
  notes: '',
};

export default function CorporateAccountManager() {
  const tenantId = getTenantId();
  const { packages, loading: packagesLoading } = usePackages();

  // Declare all useState hooks first (prevent React hook dependency TDZ)
  const [accounts, setAccounts] = useState<CorporateAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CorporateAccount | null>(null);
  const [formData, setFormData] = useState<FormState>(DEFAULT_FORM_STATE);
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deletingAccount, setDeletingAccount] = useState<CorporateAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Simulator modal state
  const [simulatorAccount, setSimulatorAccount] = useState<CorporateAccount | null>(null);
  const [selectedSimPackageId, setSelectedSimPackageId] = useState<string>('');

  // Declare useEffect after all useState declarations
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeCorporateAccounts(
      tenantId,
      (updatedAccounts) => {
        setAccounts(updatedAccounts);
        setLoading(false);
      },
      (error) => {
        console.error('[CorporateAccountManager] Subscription error:', error);
        toast.error('Failed to load corporate accounts');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tenantId]);

  // Derived filtered accounts
  const filteredAccounts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return accounts.filter((acc) => {
      // Status filter
      if (statusFilter === 'active' && !acc.isActive) return false;
      if (statusFilter === 'inactive' && acc.isActive) return false;

      // Text search
      if (!q) return true;
      const matchesName = acc.companyName.toLowerCase().includes(q);
      const matchesCode = acc.corporateCode.toLowerCase().includes(q);
      const matchesDomain = (acc.domain || '').toLowerCase().includes(q);
      const matchesContact = (acc.contactPerson || '').toLowerCase().includes(q);
      const matchesEmail = (acc.contactEmail || '').toLowerCase().includes(q);
      return matchesName || matchesCode || matchesDomain || matchesContact || matchesEmail;
    });
  }, [accounts, searchTerm, statusFilter]);

  // Derived metrics
  const activeCount = useMemo(() => accounts.filter((a) => a.isActive).length, [accounts]);
  const avgDiscount = useMemo(() => {
    const percentageDeals = accounts.filter(
      (a) => a.isActive && a.benefits?.discountType === 'percentage'
    );
    if (percentageDeals.length === 0) return 0;
    const sum = percentageDeals.reduce((acc, curr) => acc + (curr.benefits.discountValue || 0), 0);
    return Math.round(sum / percentageDeals.length);
  }, [accounts]);

  const perksCount = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.isActive &&
        ((a.benefits?.extraPtSessions && a.benefits.extraPtSessions > 0) ||
          (a.benefits?.extraGuestPasses && a.benefits.extraGuestPasses > 0) ||
          (a.benefits?.extraDurationDays && a.benefits.extraDurationDays > 0) ||
          (a.benefits?.extraFreezeDays && a.benefits.extraFreezeDays > 0))
    ).length;
  }, [accounts]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Copied corporate code: ${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setFormData(DEFAULT_FORM_STATE);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (account: CorporateAccount) => {
    setEditingAccount(account);
    const hasSpecificPackages =
      Array.isArray(account.benefits.eligiblePackageIds) &&
      account.benefits.eligiblePackageIds.length > 0;

    setFormData({
      companyName: account.companyName,
      corporateCode: account.corporateCode,
      domain: account.domain || '',
      contactPerson: account.contactPerson || '',
      contactPhone: account.contactPhone || '',
      contactEmail: account.contactEmail || '',
      discountType: account.benefits.discountType || 'percentage',
      discountValue: account.benefits.discountValue ?? 0,
      extraDurationDays: account.benefits.extraDurationDays ?? 0,
      extraFreezeDays: account.benefits.extraFreezeDays ?? 0,
      extraPtSessions: account.benefits.extraPtSessions ?? 0,
      extraGuestPasses: account.benefits.extraGuestPasses ?? 0,
      packageScope: hasSpecificPackages ? 'specific' : 'all',
      eligiblePackageIds: account.benefits.eligiblePackageIds || [],
      isActive: account.isActive,
      notes: account.notes || '',
    });
    setIsFormOpen(true);
  };

  const handleToggleActive = async (account: CorporateAccount) => {
    try {
      const nextStatus = !account.isActive;
      await updateCorporateAccount(tenantId, account.id, { isActive: nextStatus });
      toast.success(
        `${account.companyName} is now ${nextStatus ? 'active' : 'inactive'}`
      );
    } catch (err) {
      console.error('[CorporateAccountManager] Toggle status error:', err);
      toast.error('Failed to update corporate status');
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.companyName.trim()) {
      toast.error('Company name is required');
      return;
    }
    if (!formData.corporateCode.trim()) {
      toast.error('Corporate code is required (e.g. CIB-CORP)');
      return;
    }

    const discountVal = Math.max(0, Number(formData.discountValue) || 0);
    if (formData.discountType === 'percentage' && discountVal > 100) {
      toast.error('Percentage discount cannot exceed 100%');
      return;
    }

    setSaving(true);
    try {
      const benefits: CorporateBenefit = {
        discountType: formData.discountType,
        discountValue: discountVal,
        extraDurationDays: Math.max(0, Number(formData.extraDurationDays) || 0),
        extraFreezeDays: Math.max(0, Number(formData.extraFreezeDays) || 0),
        extraPtSessions: Math.max(0, Number(formData.extraPtSessions) || 0),
        extraGuestPasses: Math.max(0, Number(formData.extraGuestPasses) || 0),
        eligiblePackageIds:
          formData.packageScope === 'specific' ? formData.eligiblePackageIds : [],
      };

      let cleanedDomain = formData.domain.trim().toLowerCase();
      if (cleanedDomain && !cleanedDomain.startsWith('@')) {
        cleanedDomain = '@' + cleanedDomain;
      }

      if (editingAccount) {
        await updateCorporateAccount(tenantId, editingAccount.id, {
          companyName: formData.companyName.trim(),
          corporateCode: formData.corporateCode.trim().toUpperCase(),
          domain: cleanedDomain || undefined,
          contactPerson: formData.contactPerson.trim() || undefined,
          contactPhone: formData.contactPhone.trim() || undefined,
          contactEmail: formData.contactEmail.trim().toLowerCase() || undefined,
          benefits,
          isActive: formData.isActive,
          notes: formData.notes.trim() || undefined,
        });
        toast.success(`Updated corporate deal for ${formData.companyName}`);
      } else {
        await createCorporateAccount(tenantId, {
          tenantId,
          companyName: formData.companyName.trim(),
          corporateCode: formData.corporateCode.trim().toUpperCase(),
          domain: cleanedDomain || undefined,
          contactPerson: formData.contactPerson.trim() || undefined,
          contactPhone: formData.contactPhone.trim() || undefined,
          contactEmail: formData.contactEmail.trim().toLowerCase() || undefined,
          benefits,
          isActive: formData.isActive,
          notes: formData.notes.trim() || undefined,
        });
        toast.success(`Corporate account "${formData.companyName}" created successfully!`);
      }

      setIsFormOpen(false);
    } catch (err: any) {
      console.error('[CorporateAccountManager] Save error:', err);
      toast.error(err?.message || 'Failed to save corporate account');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingAccount) return;
    setDeleting(true);
    try {
      await deleteCorporateAccount(tenantId, deletingAccount.id);
      toast.success(`Deleted ${deletingAccount.companyName}`);
      setDeletingAccount(null);
    } catch (err: any) {
      console.error('[CorporateAccountManager] Delete error:', err);
      toast.error(err?.message || 'Failed to delete corporate account');
    } finally {
      setDeleting(false);
    }
  };

  const togglePackageSelection = (pkgId: string) => {
    setFormData((prev) => {
      const exists = prev.eligiblePackageIds.includes(pkgId);
      return {
        ...prev,
        eligiblePackageIds: exists
          ? prev.eligiblePackageIds.filter((id) => id !== pkgId)
          : [...prev.eligiblePackageIds, pkgId],
      };
    });
  };

  const handleOpenSimulator = (account: CorporateAccount) => {
    setSimulatorAccount(account);
    if (packages.length > 0) {
      // Pick first eligible package or first package
      const eligible =
        account.benefits.eligiblePackageIds && account.benefits.eligiblePackageIds.length > 0
          ? packages.find((p) => account.benefits.eligiblePackageIds?.includes(p.id)) || packages[0]
          : packages[0];
      setSelectedSimPackageId(eligible?.id || '');
    }
  };

  const simSelectedPackage = useMemo(() => {
    return packages.find((p) => p.id === selectedSimPackageId) || null;
  }, [packages, selectedSimPackageId]);

  const simResult = useMemo(() => {
    if (!simulatorAccount || !simSelectedPackage) return null;
    return applyCorporateBenefitsToPackage(simSelectedPackage, simulatorAccount);
  }, [simulatorAccount, simSelectedPackage]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Corporate Accounts & Company Deals
                <Badge variant="secondary" className="font-mono text-xs">
                  {accounts.length} Partners
                </Badge>
              </h1>
              <p className="text-sm text-muted-foreground">
                Configure corporate agreements, partner discount rates, bonus months, freeze days, and perks.
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleOpenCreate} className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" />
          Add Corporate Partner
        </Button>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total Companies
              </p>
              <h3 className="text-2xl font-bold mt-1 text-foreground">{accounts.length}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-blue-500/10 text-blue-500">
              <Briefcase className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active Deals
              </p>
              <h3 className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                {activeCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Avg. Discount
              </p>
              <h3 className="text-2xl font-bold mt-1 text-indigo-600 dark:text-indigo-400">
                {avgDiscount}%
              </h3>
            </div>
            <div className="p-2.5 rounded-full bg-indigo-500/10 text-indigo-500">
              <Percent className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Perks Included
              </p>
              <h3 className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                {perksCount} Deals
              </h3>
            </div>
            <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-500">
              <Dumbbell className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search company, code, domain, contact..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            size="sm"
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('all')}
          >
            All ({accounts.length})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'active' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('active')}
          >
            Active ({activeCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'inactive' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('inactive')}
          >
            Inactive ({accounts.length - activeCount})
          </Button>
        </div>
      </div>

      {/* Corporate Accounts Grid */}
      {loading ? (
        <div className="p-12 text-center text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading corporate accounts...
        </div>
      ) : filteredAccounts.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold text-lg">No corporate accounts found</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            {searchTerm
              ? 'No corporate accounts matched your search criteria.'
              : 'Start by creating agreements with corporate partners (e.g. CIB, Vodafone, PwC) to provide exclusive employee benefits.'}
          </p>
          {!searchTerm && (
            <Button onClick={handleOpenCreate} className="mt-4 gap-2">
              <Plus className="w-4 h-4" />
              Add First Corporate Deal
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAccounts.map((account) => {
            const isPercentage = account.benefits?.discountType === 'percentage';
            const discountLabel = isPercentage
              ? `${account.benefits?.discountValue}% OFF`
              : `${account.benefits?.discountValue} LE OFF`;

            return (
              <Card
                key={account.id}
                className={`transition-all duration-200 border ${
                  account.isActive
                    ? 'border-border/80 shadow-sm hover:shadow-md'
                    : 'border-border/40 opacity-75 bg-muted/20'
                }`}
              >
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-bold leading-tight text-foreground">
                          {account.companyName}
                        </CardTitle>
                        {account.isActive ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 text-[10px] px-1.5 py-0.5">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                            Inactive
                          </Badge>
                        )}
                      </div>

                      {/* Corporate Code & Domain */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <div
                          onClick={() => handleCopyCode(account.corporateCode)}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-muted rounded text-xs font-mono font-medium text-foreground cursor-pointer hover:bg-muted/80 transition-colors"
                          title="Click to copy code"
                        >
                          <Tag className="w-3 h-3 text-muted-foreground" />
                          <span>{account.corporateCode}</span>
                          {copiedCode === account.corporateCode ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>

                        {account.domain && (
                          <span className="text-xs text-muted-foreground font-mono bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded">
                            {account.domain}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Switch
                        checked={account.isActive}
                        onCheckedChange={() => handleToggleActive(account)}
                        aria-label="Toggle active status"
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-2 space-y-4">
                  {/* Benefits Pill Matrix */}
                  <div className="p-3 bg-secondary/30 rounded-lg space-y-2 border border-border/50">
                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <span>Agreed Benefits</span>
                      <Badge variant="outline" className="font-mono text-primary font-bold">
                        {discountLabel}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {account.benefits?.extraDurationDays ? (
                        <Badge
                          variant="secondary"
                          className="text-[11px] gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                        >
                          <Calendar className="w-3 h-3" />
                          +{account.benefits.extraDurationDays} Days Validity
                        </Badge>
                      ) : null}

                      {account.benefits?.extraFreezeDays ? (
                        <Badge
                          variant="secondary"
                          className="text-[11px] gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                        >
                          <Snowflake className="w-3 h-3" />
                          +{account.benefits.extraFreezeDays} Days Freeze
                        </Badge>
                      ) : null}

                      {account.benefits?.extraPtSessions ? (
                        <Badge
                          variant="secondary"
                          className="text-[11px] gap-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                        >
                          <Dumbbell className="w-3 h-3" />
                          +{account.benefits.extraPtSessions} Free PT
                        </Badge>
                      ) : null}

                      {account.benefits?.extraGuestPasses ? (
                        <Badge
                          variant="secondary"
                          className="text-[11px] gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        >
                          <Users className="w-3 h-3" />
                          +{account.benefits.extraGuestPasses} Guest Passes
                        </Badge>
                      ) : null}

                      {(!account.benefits?.eligiblePackageIds ||
                        account.benefits.eligiblePackageIds.length === 0) ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          All Packages
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {account.benefits.eligiblePackageIds.length} Eligible Packages
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Contact Info if available */}
                  {(account.contactPerson || account.contactPhone || account.contactEmail) && (
                    <div className="text-xs text-muted-foreground space-y-1 border-t border-border/50 pt-2">
                      {account.contactPerson && (
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="w-3 h-3 shrink-0" />
                          <span className="font-medium text-foreground">{account.contactPerson}</span>
                        </div>
                      )}
                      {account.contactPhone && (
                        <div className="flex items-center gap-1.5 truncate font-mono">
                          <Phone className="w-3 h-3 shrink-0" />
                          <span>{account.contactPhone}</span>
                        </div>
                      )}
                      {account.contactEmail && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="w-3 h-3 shrink-0" />
                          <span>{account.contactEmail}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes snippet */}
                  {account.notes && (
                    <p className="text-xs text-muted-foreground/80 line-clamp-2 italic bg-muted/30 p-2 rounded">
                      "{account.notes}"
                    </p>
                  )}

                  {/* Bottom Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs text-primary h-8 px-2"
                      onClick={() => handleOpenSimulator(account)}
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      Test Simulator
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleOpenEdit(account)}
                        title="Edit Account"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletingAccount(account)}
                        title="Delete Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Account Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {editingAccount ? `Edit ${editingAccount.companyName}` : 'Add Corporate Partner'}
            </DialogTitle>
            <DialogDescription>
              Set up corporate partner details, custom discount rates, extra duration, freeze, PT sessions, and guest passes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveForm} className="space-y-6 pt-2">
            {/* Section 1: Company Profile */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Company & Identification
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="companyName">
                    Company Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="companyName"
                    required
                    placeholder="e.g. CIB, Vodafone, PwC"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="corporateCode">
                    Corporate Code <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="corporateCode"
                    required
                    placeholder="e.g. CIB-CORP, VODA-PERKS"
                    className="font-mono uppercase"
                    value={formData.corporateCode}
                    onChange={(e) =>
                      setFormData({ ...formData, corporateCode: e.target.value.toUpperCase() })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Staff enter this code during membership checkout.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="domain">Corporate Email Domain (Optional)</Label>
                  <Input
                    id="domain"
                    placeholder="e.g. @cibeg.com or cibeg.com"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Auto-qualifies members registering with this company email.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactPerson">HR / Contact Person</Label>
                  <Input
                    id="contactPerson"
                    placeholder="e.g. Sarah Jenkins (HR Lead)"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    placeholder="e.g. +20 10 1234 5678"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    placeholder="e.g. corporate@company.com"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Benefits & Discounts */}
            <div className="space-y-3 border-t border-border pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Deals & Package Benefits
              </h4>

              {/* Discount Type and Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Discount Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={formData.discountType === 'percentage' ? 'default' : 'outline'}
                      onClick={() => setFormData({ ...formData, discountType: 'percentage' })}
                      className="gap-1.5"
                    >
                      <Percent className="w-3.5 h-3.5" />
                      Percentage (%)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={formData.discountType === 'fixed' ? 'default' : 'outline'}
                      onClick={() => setFormData({ ...formData, discountType: 'fixed' })}
                      className="gap-1.5"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      Fixed Amount
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="discountValue">
                    {formData.discountType === 'percentage'
                      ? 'Discount Percentage (%)'
                      : 'Fixed Discount Amount (LE)'}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    min="0"
                    max={formData.discountType === 'percentage' ? '100' : undefined}
                    step="any"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                  />
                </div>
              </div>

              {/* Bonus Days / Perks */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="extraDurationDays" className="text-xs">
                    Extra Duration (Days)
                  </Label>
                  <Input
                    id="extraDurationDays"
                    type="number"
                    min="0"
                    placeholder="e.g. 30"
                    value={formData.extraDurationDays}
                    onChange={(e) =>
                      setFormData({ ...formData, extraDurationDays: e.target.value })
                    }
                  />
                  <p className="text-[10px] text-muted-foreground">30 days = +1 month</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="extraFreezeDays" className="text-xs">
                    Extra Freeze (Days)
                  </Label>
                  <Input
                    id="extraFreezeDays"
                    type="number"
                    min="0"
                    placeholder="e.g. 15"
                    value={formData.extraFreezeDays}
                    onChange={(e) => setFormData({ ...formData, extraFreezeDays: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">Bonus hold allowance</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="extraPtSessions" className="text-xs">
                    Extra PT Sessions
                  </Label>
                  <Input
                    id="extraPtSessions"
                    type="number"
                    min="0"
                    placeholder="e.g. 2"
                    value={formData.extraPtSessions}
                    onChange={(e) => setFormData({ ...formData, extraPtSessions: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground">Free coach sessions</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="extraGuestPasses" className="text-xs">
                    Extra Guest Passes
                  </Label>
                  <Input
                    id="extraGuestPasses"
                    type="number"
                    min="0"
                    placeholder="e.g. 3"
                    value={formData.extraGuestPasses}
                    onChange={(e) =>
                      setFormData({ ...formData, extraGuestPasses: e.target.value })
                    }
                  />
                  <p className="text-[10px] text-muted-foreground">Bring a friend</p>
                </div>
              </div>
            </div>

            {/* Section 3: Package Eligibility */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Eligible Packages
                </h4>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.packageScope === 'all' ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setFormData({ ...formData, packageScope: 'all' })}
                  >
                    All Packages
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={formData.packageScope === 'specific' ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setFormData({ ...formData, packageScope: 'specific' })}
                  >
                    Specific Packages Only
                  </Button>
                </div>
              </div>

              {formData.packageScope === 'specific' && (
                <div className="border border-border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/10">
                  {packagesLoading ? (
                    <p className="text-xs text-muted-foreground">Loading packages...</p>
                  ) : packages.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No packages available.</p>
                  ) : (
                    packages.map((pkg) => {
                      const checked = formData.eligiblePackageIds.includes(pkg.id);
                      return (
                        <div
                          key={pkg.id}
                          onClick={() => togglePackageSelection(pkg.id)}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer border text-xs transition-colors ${
                            checked
                              ? 'bg-primary/10 border-primary/40 font-medium'
                              : 'bg-background border-border hover:bg-muted/40'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}} // handled by parent onClick
                              className="rounded border-border"
                            />
                            <span>{pkg.name}</span>
                          </div>
                          <span className="font-mono text-muted-foreground">{pkg.price} LE</span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Section 4: Notes & Status */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="notes">Agreement Notes & Requirements (Optional)</Label>
                <textarea
                  id="notes"
                  rows={2}
                  className="w-full text-xs rounded-md border border-input bg-transparent px-3 py-2 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="e.g. Requires presenting company HR ID card or employee email verification upon sign up."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <Label htmlFor="statusToggle">Activate Corporate Deal</Label>
                  <p className="text-[11px] text-muted-foreground">
                    When inactive, employees will not receive corporate perks or discounts.
                  </p>
                </div>
                <Switch
                  id="statusToggle"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? 'Saving...'
                  : editingAccount
                  ? 'Save Changes'
                  : 'Create Corporate Deal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingAccount} onOpenChange={(open) => !open && setDeletingAccount(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Corporate Account
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong className="text-foreground">{deletingAccount?.companyName}</strong>? This will
              remove their corporate code ({deletingAccount?.corporateCode}) and benefit configuration.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3">
            <Button
              variant="outline"
              onClick={() => setDeletingAccount(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Partner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Live Benefit Simulator Dialog */}
      <Dialog open={!!simulatorAccount} onOpenChange={(open) => !open && setSimulatorAccount(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              Corporate Deal Simulator
            </DialogTitle>
            <DialogDescription>
              Simulate applied benefits and member pricing for{' '}
              <strong>{simulatorAccount?.companyName}</strong> ({simulatorAccount?.corporateCode}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="simPackage">Select Gym Package</Label>
              <select
                id="simPackage"
                className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
                value={selectedSimPackageId}
                onChange={(e) => setSelectedSimPackageId(e.target.value)}
              >
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} — {pkg.price} LE ({pkg.expiryDays} days)
                  </option>
                ))}
              </select>
            </div>

            {simSelectedPackage && simResult && (
              <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/20">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs text-muted-foreground">Original Package Price</span>
                  <span className="font-mono text-sm line-through text-muted-foreground">
                    {simSelectedPackage.price} LE
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    Corporate Discount (
                    {simulatorAccount?.benefits.discountType === 'percentage'
                      ? `${simulatorAccount?.benefits.discountValue}%`
                      : `${simulatorAccount?.benefits.discountValue} LE`}
                    )
                  </span>
                  <span className="font-mono text-sm font-semibold text-rose-500">
                    -{(simSelectedPackage.price - simResult.discountedPrice).toFixed(2)} LE
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-bold text-foreground">Final Member Price</span>
                  <span className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {simResult.discountedPrice} LE
                  </span>
                </div>

                {/* Additional Perks Breakdown */}
                <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Included Corporate Perks
                  </span>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="p-2 bg-background rounded border border-border/60">
                      <p className="text-muted-foreground text-[10px]">Total Validity</p>
                      <p className="font-semibold text-foreground">
                        {simSelectedPackage.expiryDays + simResult.extraDurationDays} Days
                        {simResult.extraDurationDays > 0 && (
                          <span className="text-emerald-500 ml-1">
                            (+{simResult.extraDurationDays})
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="p-2 bg-background rounded border border-border/60">
                      <p className="text-muted-foreground text-[10px]">Freeze Allowance</p>
                      <p className="font-semibold text-foreground">
                        {(simSelectedPackage.freezeAllowanceDays || 0) + simResult.extraFreezeDays} Days
                        {simResult.extraFreezeDays > 0 && (
                          <span className="text-emerald-500 ml-1">
                            (+{simResult.extraFreezeDays})
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="p-2 bg-background rounded border border-border/60">
                      <p className="text-muted-foreground text-[10px]">PT Sessions</p>
                      <p className="font-semibold text-foreground">
                        {(simSelectedPackage.freePtSessions || 0) + simResult.extraPtSessions} Sessions
                        {simResult.extraPtSessions > 0 && (
                          <span className="text-emerald-500 ml-1">
                            (+{simResult.extraPtSessions} free)
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="p-2 bg-background rounded border border-border/60">
                      <p className="text-muted-foreground text-[10px]">Guest Passes</p>
                      <p className="font-semibold text-foreground">
                        {(simSelectedPackage.guestInvitations || 0) + simResult.extraGuestPasses} Passes
                        {simResult.extraGuestPasses > 0 && (
                          <span className="text-emerald-500 ml-1">
                            (+{simResult.extraGuestPasses} free)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button onClick={() => setSimulatorAccount(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
