import React, { useState, useMemo } from 'react';
import { useAppContext } from './context';
import { useLanguage } from './contexts/LanguageContext';
import { format, parseISO } from 'date-fns';
import { Client, ClientPackage } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Check, X, User, Calendar, Tag, ShieldCheck, ShieldAlert, CheckCircle, AlertCircle } from 'lucide-react';

const LOCALES = {
  en: {
    title: "Unconfirmed Memberships",
    searchPlaceholder: "Search by member name, ID, or package...",
    memberName: "Member Name",
    memberId: "Member ID",
    branch: "Branch",
    packageName: "Package Name",
    startDate: "Start Date",
    expiryDate: "Expiry Date",
    totalPrice: "Total Price",
    subscriptionType: "Subscription Type",
    actions: "Actions",
    confirm: "Confirm",
    reject: "Reject",
    noPending: "No unconfirmed memberships found matching the filters.",
    confirmSuccess: "Membership confirmed successfully!",
    rejectSuccess: "Membership rejected successfully!",
    loading: "Loading unconfirmed memberships...",
    confirmTitle: "Confirm Membership",
    rejectTitle: "Reject Membership",
    confirmQuestion: "Are you sure you want to confirm this membership? This will activate the package and update the client profile.",
    rejectQuestion: "Are you sure you want to reject this membership? This will cancel the package and set its type as a wrong entry.",
    yes: "Yes, Confirm",
    no: "No, Cancel",
    new: "New",
    renew: "Renew",
    upgrade: "Upgrade",
    wrongentry: "Wrong Entry",
    allBranches: "All Branches",
    pendingCount: "Pending Confirmation",
  },
  ar: {
    title: "تأكيد الاشتراكات",
    searchPlaceholder: "البحث باسم العضو، الرقم التعريفي، أو الباقة...",
    memberName: "اسم العضو",
    memberId: "رقم العضو",
    branch: "الفرع",
    packageName: "اسم الباقة",
    startDate: "تاريخ البدء",
    expiryDate: "تاريخ الانتهاء",
    totalPrice: "السعر الإجمالي",
    subscriptionType: "نوع الاشتراك",
    actions: "الإجراءات",
    confirm: "تأكيد",
    reject: "رفض",
    noPending: "لا توجد اشتراكات معلقة تطابق الفلاتر.",
    confirmSuccess: "تم تأكيد الاشتراك بنجاح!",
    rejectSuccess: "تم رفض الاشتراك بنجاح!",
    loading: "جاري تحميل الاشتراكات المعلقة...",
    confirmTitle: "تأكيد الاشتراك",
    rejectTitle: "رفض الاشتراك",
    confirmQuestion: "هل أنت متأكد من رغبتك في تأكيد هذا الاشتراك؟ سيؤدي ذلك إلى تفعيل الباقة وتحديث الملف الشخصي للعضو.",
    rejectQuestion: "هل أنت متأكد من رغبتك في رفض هذا الاشتراك؟ سيتم إلغاء الباقة وتصنيفها كإدخال خاطئ.",
    yes: "نعم، تأكيد",
    no: "لا، إلغاء",
    new: "جديد",
    renew: "تجديد",
    upgrade: "ترقية",
    wrongentry: "إدخال خاطئ",
    allBranches: "كل الفروع",
    pendingCount: "معلق بانتظار التأكيد",
  }
};

interface PendingItem {
  client: Client;
  pkg: ClientPackage;
  pkgIndex: number;
  uniqueId: string;
}

export default function UnconfirmedMemberships() {
  const { language, isRtl } = useLanguage();
  const { clients, packages, updateClient, branches } = useAppContext();

  const currentLoc = LOCALES[language as 'en' | 'ar'] || LOCALES.en;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');

  // Confirmation dialog states
  const [actionItem, setActionItem] = useState<PendingItem | null>(null);
  const [actionType, setActionType] = useState<'confirm' | 'reject' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Flatten clients packages to retrieve all unconfirmed items (isPendingConfirmation === true)
  const allPendingItems = useMemo(() => {
    const items: PendingItem[] = [];
    clients.forEach(client => {
      if (client.packages) {
        client.packages.forEach((pkg, index) => {
          if (pkg.isPendingConfirmation === true) {
            items.push({
              client,
              pkg,
              pkgIndex: index,
              uniqueId: `${client.id}_${pkg.id || index}`
            });
          }
        });
      }
    });
    return items;
  }, [clients]);

  // 2. Filter pending items by search criteria & branch
  const filteredPendingItems = useMemo(() => {
    return allPendingItems.filter(item => {
      const q = searchTerm.toLowerCase();

      const memberName = (item.client.name || '').toLowerCase();
      const memberId = (item.client.memberId || '').toLowerCase();
      const packageName = (item.pkg.packageName || '').toLowerCase();

      const matchesSearch = !searchTerm ||
        memberName.includes(q) ||
        memberId.includes(q) ||
        packageName.includes(q);

      let matchesBranch = true;
      if (selectedBranch !== 'ALL') {
        matchesBranch = item.client.branch === selectedBranch;
      }

      return matchesSearch && matchesBranch;
    });
  }, [allPendingItems, searchTerm, selectedBranch]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  const getSubscriptionTypeBadge = (subType?: string) => {
    if (!subType) return <Badge variant="outline">N/A</Badge>;
    const displayType = currentLoc[subType as 'new' | 'renew' | 'upgrade' | 'wrongentry'] || subType;
    
    switch (subType) {
      case 'new':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-none">{displayType}</Badge>;
      case 'renew':
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none">{displayType}</Badge>;
      case 'upgrade':
        return <Badge className="bg-purple-500 hover:bg-purple-600 text-white border-none">{displayType}</Badge>;
      default:
        return <Badge variant="outline">{displayType}</Badge>;
    }
  };

  const handleActionClick = (item: PendingItem, type: 'confirm' | 'reject') => {
    setActionItem(item);
    setActionType(type);
    setErrorMsg('');
  };

  const executeAction = async () => {
    if (!actionItem || !actionType) return;
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const { client, pkg, pkgIndex } = actionItem;
      const updatedPackages = [...(client.packages || [])];

      if (actionType === 'confirm') {
        // Sets package isPendingConfirmation = false, status = 'Active', client status = 'Active', and updates top level package fields
        updatedPackages[pkgIndex] = {
          ...pkg,
          isPendingConfirmation: false,
          status: 'Active'
        };

        const updates: Partial<Client> = {
          status: 'Active',
          packageType: pkg.packageName,
          startDate: pkg.startDate,
          membershipExpiry: pkg.endDate,
          sessionsRemaining: pkg.sessionsRemaining !== undefined ? pkg.sessionsRemaining : pkg.sessionsTotal,
          packages: updatedPackages
        };

        await updateClient(client.id, updates);
      } else {
        // Sets package status = 'Cancelled', isPendingConfirmation = false, and subscriptionType = 'wrongentry'
        updatedPackages[pkgIndex] = {
          ...pkg,
          status: 'Cancelled',
          isPendingConfirmation: false,
          subscriptionType: 'wrongentry'
        };

        const updates: Partial<Client> = {
          packages: updatedPackages
        };

        await updateClient(client.id, updates);
      }

      setActionItem(null);
      setActionType(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while updating the client membership.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          {currentLoc.title}
        </h1>
        <p className="text-muted-foreground mt-1">
          {language === 'ar' ? 'مراجعة وتأكيد أو رفض الاشتراكات الجديدة والمعلقة للأعضاء.' : 'Review and confirm or reject pending membership packages from members.'}
        </p>
      </div>

      {/* Stats and Info Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border border-border/40 bg-gradient-to-br from-card to-muted/20 shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-shadow col-span-1">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground font-medium">{currentLoc.pendingCount}</p>
              <h3 className="text-3xl font-extrabold tracking-tight text-amber-500">{filteredPendingItems.length}</h3>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <AlertCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="border border-border/40 bg-card rounded-2xl shadow-sm overflow-hidden">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          </div>
        </CardContent>
      </Card>

      {/* Unconfirmed Table */}
      <Card className="border border-border/40 bg-card rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.memberName}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.memberId}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.branch}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.packageName}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.startDate}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.expiryDate}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.totalPrice}</TableHead>
                <TableHead className={isRtl ? 'text-right' : 'text-left'}>{currentLoc.subscriptionType}</TableHead>
                <TableHead className="text-center w-48">{currentLoc.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPendingItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    {currentLoc.noPending}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPendingItems.map(item => {
                  // Retrieve price from global system packages list using the package name
                  const sysPkg = packages.find(p => p.name === item.pkg.packageName);
                  const priceDisplay = sysPkg ? `${sysPkg.price.toLocaleString()} LE` : 'N/A';

                  return (
                    <TableRow key={item.uniqueId} className="hover:bg-muted/20 transition-colors">
                      <TableCell className="font-semibold text-sm">
                        {item.client.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <Badge variant="outline" className="rounded-md font-mono bg-muted/30">
                          {item.client.memberId || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.client.branch || 'N/A'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate font-medium" title={item.pkg.packageName}>
                        {item.pkg.packageName}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatDate(item.pkg.startDate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatDate(item.pkg.endDate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-primary">
                        {priceDisplay}
                      </TableCell>
                      <TableCell className="text-xs">
                        {getSubscriptionTypeBadge(item.pkg.subscriptionType)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleActionClick(item, 'confirm')}
                            className="h-8 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs px-2 shadow-sm flex items-center gap-1"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>{currentLoc.confirm}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleActionClick(item, 'reject')}
                            className="h-8 rounded-lg text-xs px-2 shadow-sm flex items-center gap-1"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>{currentLoc.reject}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Confirmation Modal */}
      <Dialog open={actionItem !== null} onOpenChange={(open) => !open && setActionItem(null)}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl p-6" dir={isRtl ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              {actionType === 'confirm' ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  <span className="text-emerald-600">{currentLoc.confirmTitle}</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  <span className="text-destructive">{currentLoc.rejectTitle}</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {actionItem && (
            <div className="space-y-4 py-3">
              <DialogDescription className="text-sm font-medium text-foreground">
                {actionType === 'confirm' ? currentLoc.confirmQuestion : currentLoc.rejectQuestion}
              </DialogDescription>

              {/* Detail box */}
              <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-2 border border-border/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{currentLoc.memberName}:</span>
                  <span className="font-semibold">{actionItem.client.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{currentLoc.packageName}:</span>
                  <span className="font-semibold">{actionItem.pkg.packageName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{currentLoc.subscriptionType}:</span>
                  <span>{getSubscriptionTypeBadge(actionItem.pkg.subscriptionType)}</span>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 font-medium animate-in fade-in duration-200">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setActionItem(null)}
              className="rounded-xl h-11 font-semibold flex-1"
              disabled={isSubmitting}
            >
              {currentLoc.no}
            </Button>
            <Button
              onClick={executeAction}
              disabled={isSubmitting}
              className={`rounded-xl h-11 font-semibold flex-1 text-white ${
                actionType === 'confirm' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-destructive hover:bg-destructive/90'
              }`}
            >
              {isSubmitting ? (language === 'ar' ? 'جاري المعالجة...' : 'Processing...') : currentLoc.yes}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
