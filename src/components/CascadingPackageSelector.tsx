import { getTenantId } from '../firebase';
import React, { useState, useMemo, useEffect } from 'react';
import { Package } from '../types';
import { MEMBER_CATEGORIES, MemberCategory, normalizeMemberCategory, isPackageMatchingFilter } from '../utils/memberCategories';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, Dumbbell, MapPin, Layers, CheckCircle2, UserCheck, ShieldAlert } from 'lucide-react';

export interface CascadingPackageSelectorProps {
  packages: Package[];
  selectedPackageName: string;
  onPackageSelect: (pkg: Package | null, isPt: boolean) => void;
  initialCategory?: string;
  initialBranch?: string;
  branches?: string[];
  onCategoryChange?: (category: MemberCategory) => void;
  onBranchChange?: (branch: string) => void;
  showPtToggle?: boolean;
  className?: string;
  readOnlyCategory?: boolean;
  readOnlyBranch?: boolean;
}

export const CascadingPackageSelector: React.FC<CascadingPackageSelectorProps> = ({
  packages,
  selectedPackageName,
  onPackageSelect,
  initialCategory,
  initialBranch,
  branches = ['Main Complex', 'Envida'],
  onCategoryChange,
  onBranchChange,
  showPtToggle = true,
  className = '',
  readOnlyCategory = false,
  readOnlyBranch = false,
}) => {
  // Step 1: Member Category
  const [category, setCategory] = useState<MemberCategory>(() => 
    initialCategory ? normalizeMemberCategory(initialCategory) : 'Adults'
  );

  // Step 2: Branch / Location
  const [branch, setBranch] = useState<string>(() => 
    initialBranch || 'All Branches'
  );

  // PT Add-on Toggle
  const [isPtSelected, setIsPtSelected] = useState<boolean>(false);

  // Segmented package category filter (Inzan-only POS segmentation)
  const showCategoryTabs = getTenantId().toLowerCase().includes('inzan');
  const [packageTypeFilter, setPackageTypeFilter] = useState<
    'ALL' | 'MEMBERSHIP' | 'PT' | 'CLASSES' | 'SGF' | 'NUTRITION' | 'DROPIN'
  >('ALL');

  const isNutritionPackage = (pkg: Package) => {
    const n = (pkg.name || '').toLowerCase();
    const c = (pkg.category || '').toLowerCase().trim();
    const team = (pkg.targetTeam || '').toLowerCase().trim();
    return c === 'nutrition' || c.includes('nutrition') || team === 'nutrition' || n.includes('nutrition') || n.includes('diet');
  };

  const isSgfPackage = (pkg: Package) => {
    const n = (pkg.name || '').toLowerCase();
    const c = (pkg.category || '').toLowerCase().trim();
    return c === 'sgf' || c.includes('sgf') || n.includes('sgf') || n.includes('small group');
  };

  const isClassesPackage = (pkg: Package) => {
    const n = (pkg.name || '').toLowerCase();
    const c = (pkg.category || '').toLowerCase().trim();
    const team = (pkg.targetTeam || '').toLowerCase().trim();
    return (
      c === 'classes' ||
      c === 'gymnastics' ||
      c.includes('class') ||
      c.includes('gymnastic') ||
      team === 'class instructors' ||
      n.includes('class') ||
      n.includes('gymnastic') ||
      n.includes('mma') ||
      n.includes('academy') ||
      n.includes('bootcamp')
    );
  };

  const isPtPackage = (pkg: Package) => {
    const c = (pkg.category || '').toLowerCase().trim();
    if (
      c === 'nutrition' ||
      c === 'sgf' ||
      c === 'classes' ||
      c === 'gymnastics' ||
      c === 'membership' ||
      c === 'memberships'
    ) {
      return false;
    }
    const t = (pkg.type || '').toLowerCase();
    const n = (pkg.name || '').toLowerCase();
    const team = (pkg.targetTeam || '').toLowerCase().trim();
    return (
      c === 'personal training' ||
      c === 'pt' ||
      team === 'pt' ||
      t === 'private' ||
      n.includes('pt') ||
      n.includes('private') ||
      n.includes('personal')
    );
  };

  const isDropInPackage = (pkg: Package) => {
    const n = (pkg.name || '').toLowerCase();
    const c = (pkg.category || '').toLowerCase().trim();
    return (
      c.includes('drop') ||
      c.includes('day pass') ||
      c === 'complimentary' ||
      n.includes('drop') ||
      n.includes('day pass') ||
      n.includes('daypass') ||
      n.includes('visit') ||
      n.includes('single') ||
      (pkg.sessions === 1 && !isPtPackage(pkg) && !isNutritionPackage(pkg))
    );
  };

  const isMembershipPackage = (pkg: Package) => {
    const c = (pkg.category || '').toLowerCase().trim();
    if (pkg.hierarchy === 'Primary' || c === 'membership' || c === 'memberships' || c === 'gym memberships') {
      return true;
    }
    return (
      !isPtPackage(pkg) &&
      !isDropInPackage(pkg) &&
      !isSgfPackage(pkg) &&
      !isNutritionPackage(pkg) &&
      !isClassesPackage(pkg)
    );
  };

  const getPackageMetadataBadges = (pkg: Package) => {
    const badges: { key: string; label: string; className: string }[] = [];

    if (pkg.hierarchy === 'Primary') {
      badges.push({
        key: 'hierarchy',
        label: 'Primary',
        className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      });
    } else if (pkg.hierarchy === 'Secondary') {
      badges.push({
        key: 'hierarchy',
        label: 'Secondary',
        className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
      });
    }

    if (pkg.isTimeRestricted || (pkg.allowedStartTime && pkg.allowedEndTime)) {
      const start = pkg.allowedStartTime || '06:00';
      const end = pkg.allowedEndTime || '14:00';
      const startHour = parseInt(start.split(':')[0] || '6', 10);
      const endHour = parseInt(end.split(':')[0] || '14', 10);
      const isMorningWindow = !isNaN(startHour) && !isNaN(endHour) && startHour < 12 && endHour <= 16;
      badges.push({
        key: 'time',
        label: isMorningWindow ? `⏰ Morning ${start}-${end}` : `⏰ ${start}-${end}`,
        className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      });
    }

    const freePt = pkg.benefits?.freePtSessions ?? pkg.freePtSessions ?? 0;
    if (freePt > 0) {
      badges.push({
        key: 'free-pt',
        label: `Free PT: ${freePt}`,
        className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
      });
    }

    const freezeDays = pkg.benefits?.freezeAllowanceDays ?? pkg.freezeAllowanceDays ?? 0;
    if (freezeDays > 0) {
      badges.push({
        key: 'freeze',
        label: `Freeze Allowance: ${freezeDays}d`,
        className: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
      });
    }

    const invitations = pkg.benefits?.guestInvitations ?? pkg.guestInvitations ?? 0;
    if (invitations > 0) {
      badges.push({
        key: 'invitations',
        label: `Invitations: ${invitations}`,
        className: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
      });
    }

    const classTrials = pkg.benefits?.freeClassTrials ?? pkg.freeClassTrials ?? 0;
    if (classTrials > 0) {
      badges.push({
        key: 'trials',
        label: `Class Trials: ${classTrials}`,
        className: 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30',
      });
    }

    return badges;
  };

  // Sync initial props
  useEffect(() => {
    if (initialCategory) {
      setCategory(normalizeMemberCategory(initialCategory));
    }
  }, [initialCategory]);

  useEffect(() => {
    if (initialBranch) {
      setBranch(initialBranch);
    }
  }, [initialBranch]);

  // Handle Category Change
  const handleCategoryChange = (newCat: MemberCategory) => {
    if (readOnlyCategory) return;
    setCategory(newCat);
    onCategoryChange?.(newCat);
  };

  // Handle Branch Change
  const handleBranchChange = (newBranch: string | null) => {
    if (readOnlyBranch || !newBranch) return;
    setBranch(newBranch);
    onBranchChange?.(newBranch);
  };

  const isPackageActive = (pkg: Package) =>
    pkg.status !== 'Hold' && pkg.isActive !== false && pkg.is_active !== false && !pkg.archivedAt;

  // Filter packages dynamically based on Step 1, Step 2, and PT toggle using SQL RBAC parity
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      if (!isPackageActive(pkg)) return false;
      const isPkgPt = isPtPackage(pkg);
      const pkgForMatch = { ...pkg, type: (isPkgPt ? 'Private' : 'Group') as Package['type'] };
      const shouldMatchPt =
        showCategoryTabs && packageTypeFilter === 'ALL' && !isPtSelected
          ? isPkgPt
          : packageTypeFilter === 'PT' || isPtSelected;
      if (!isPackageMatchingFilter(pkgForMatch, category, branch, shouldMatchPt)) {
        return false;
      }
      if (packageTypeFilter === 'MEMBERSHIP') {
        return isMembershipPackage(pkg);
      }
      if (packageTypeFilter === 'PT') {
        return isPkgPt;
      }
      if (packageTypeFilter === 'CLASSES') {
        return isClassesPackage(pkg);
      }
      if (packageTypeFilter === 'SGF') {
        return isSgfPackage(pkg);
      }
      if (packageTypeFilter === 'NUTRITION') {
        return isNutritionPackage(pkg);
      }
      if (packageTypeFilter === 'DROPIN') {
        return isDropInPackage(pkg);
      }
      return true;
    });
  }, [packages, category, branch, isPtSelected, packageTypeFilter, showCategoryTabs]);

  // Currently selected package object
  const activePackage = useMemo(() => {
    return packages.find(p => p.name === selectedPackageName) || null;
  }, [packages, selectedPackageName]);

  // Combined branch list
  const branchOptions = useMemo(() => {
    const list = ['All Branches', ...branches];
    return Array.from(new Set(list));
  }, [branches]);

  return (
    <div className={`space-y-4 rounded-2xl border border-border/40 bg-card/60 p-4 shadow-sm backdrop-blur-sm ${className}`}>
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-border/30 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold uppercase tracking-wider text-foreground">
            Dynamic Pricing & Package Filter
          </span>
        </div>
        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
          POS Safe Guard
        </Badge>
      </div>

      {/* Step 1: Member Category */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5 text-primary" />
            Step 1: Member Tier & Category
          </Label>
          <span className="text-[11px] text-muted-foreground">
            Current: <strong className="text-foreground">{category}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {MEMBER_CATEGORIES.map((cat) => {
            const isSelected = category === cat;
            return (
              <button
                type="button"
                key={cat}
                disabled={readOnlyCategory}
                onClick={() => handleCategoryChange(cat)}
                className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs font-semibold transition-all border ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm scale-[1.02]'
                    : 'bg-background/80 text-muted-foreground border-border/50 hover:bg-accent hover:text-foreground'
                } ${readOnlyCategory ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span>{cat}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Branch Location & PT Add-on Toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Step 2: Branch */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Step 2: Location / Branch
          </Label>
          <Select
            value={branch}
            onValueChange={handleBranchChange}
            disabled={readOnlyBranch}
          >
            <SelectTrigger className="h-10 rounded-xl bg-background/70 border-border/50 text-xs font-semibold">
              <SelectValue placeholder="Select Branch" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {branchOptions.map((b) => (
                <SelectItem key={b} value={b} className="text-xs font-medium">
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* PT Add-on Toggle */}
        {showPtToggle && (
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Dumbbell className="h-3.5 w-3.5 text-amber-500" />
              Private Training (PT) Add-on
            </Label>
            <div
              onClick={() => {
                const nextVal = !isPtSelected;
                setIsPtSelected(nextVal);
                // Clear selection if currently selected package doesn't match
                if (activePackage) {
                  const isPtPkg = isPtPackage(activePackage);
                  if (isPtPkg !== nextVal) {
                    onPackageSelect(null, nextVal);
                  }
                }
              }}
              className={`flex items-center justify-between h-10 px-3 rounded-xl border transition-all cursor-pointer ${
                isPtSelected
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 font-semibold'
                  : 'bg-background/70 border-border/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={isPtSelected}
                  onCheckedChange={(checked) => setIsPtSelected(!!checked)}
                  id="pt-addon-checkbox"
                />
                <span className="text-xs font-medium">Show Private PT Packages</span>
              </div>
              <Badge variant={isPtSelected ? 'default' : 'secondary'} className="text-[10px] h-5 px-1.5">
                {isPtSelected ? 'PT Filter Active' : 'Group Sessions'}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Segmented Package Category Filter Tabs */}
      {showCategoryTabs && (
      <div className="space-y-1.5 pt-1">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            POS Package Category
          </span>
          <span className="text-[11px] text-muted-foreground">
            {packageTypeFilter === 'ALL' && 'All Types'}
            {packageTypeFilter === 'MEMBERSHIP' && 'Primary Memberships'}
            {packageTypeFilter === 'PT' && 'Private Coaching'}
            {packageTypeFilter === 'CLASSES' && 'Classes & Gymnastics'}
            {packageTypeFilter === 'SGF' && 'Small Group Fitness (SGF)'}
            {packageTypeFilter === 'NUTRITION' && 'Nutrition & Diet'}
            {packageTypeFilter === 'DROPIN' && 'Day Pass / Drop-in'}
          </span>
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 bg-muted/40 p-1.5 rounded-xl border border-border/40">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'MEMBERSHIP', label: 'Membership' },
            { id: 'PT', label: 'PT' },
            { id: 'CLASSES', label: 'Classes' },
            { id: 'SGF', label: 'SGF' },
            { id: 'NUTRITION', label: 'Nutrition' },
            { id: 'DROPIN', label: 'Drop-in' },
          ].map((tab) => {
            const isSel = packageTypeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setPackageTypeFilter(tab.id as any);
                  if (tab.id === 'PT') {
                    setIsPtSelected(true);
                  } else {
                    setIsPtSelected(false);
                  }
                }}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all text-center truncate ${
                  isSel
                    ? 'bg-primary text-primary-foreground shadow-sm font-bold scale-[1.02]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/70'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Step 3: Dynamic Filtered Package Dropdown */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            Step 3: Matching Price Packages ({filteredPackages.length})
          </Label>
          {filteredPackages.length === 0 && (
            <span className="text-[11px] text-amber-500 font-medium">
              No direct package for this combination
            </span>
          )}
        </div>

        <Select
          value={selectedPackageName || ''}
          onValueChange={(val) => {
            if (val === '__custom__') {
              onPackageSelect(null, isPtSelected);
              return;
            }
            const found = packages.find(p => p.name === val);
            onPackageSelect(found || null, found ? isPtPackage(found) : isPtSelected);
          }}
        >
          <SelectTrigger className="h-12 rounded-xl bg-background border-primary/30 focus:border-primary text-sm font-semibold shadow-inner">
            <SelectValue placeholder={filteredPackages.length > 0 ? "Select package..." : "No matching packages — click for options"} />
          </SelectTrigger>
          <SelectContent className="rounded-2xl max-h-[320px]">
            {filteredPackages.length > 0 ? (
              filteredPackages.map((pkg) => {
                const metaBadges = getPackageMetadataBadges(pkg);
                return (
                  <SelectItem key={pkg.id} value={pkg.name} className="py-2.5 px-3 rounded-xl cursor-pointer">
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex items-center justify-between w-full gap-4">
                        <span className="font-semibold text-xs text-foreground">{pkg.name}</span>
                        <div className="flex items-center gap-2 text-right">
                          <span className="text-[11px] text-muted-foreground">
                            {pkg.sessions === -1 || pkg.sessions === 0 ? 'Unlimited' : `${pkg.sessions} ses`} • {pkg.expiryDays}d
                          </span>
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            {pkg.price.toLocaleString()} LE
                          </span>
                        </div>
                      </div>
                      {metaBadges.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          {metaBadges.map((b) => (
                            <span
                              key={b.key}
                              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${b.className}`}
                            >
                              {b.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </SelectItem>
                );
              })
            ) : (
              <div className="p-3 text-center text-xs text-muted-foreground">
                <p>No package matches <strong>{category}</strong> at <strong>{branch}</strong>.</p>
                <p className="mt-1 text-[11px] text-primary">Try changing the Branch or Category, or create a custom package.</p>
              </div>
            )}
            <SelectItem value="__custom__" className="py-2 px-3 text-xs italic text-muted-foreground border-t border-border/40 mt-1">
              + Custom Package Entry...
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Selected Package Confirmation Card */}
      {activePackage && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex flex-col gap-2 text-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <div>
                <p className="font-bold text-foreground">{activePackage.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  Tier: <span className="font-semibold text-foreground">{category}</span> • 
                  Location: <span className="font-semibold text-foreground">{branch}</span> • 
                  Valid: <span className="font-semibold text-foreground">{activePackage.expiryDays} Days</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                {activePackage.price.toLocaleString()} LE
              </span>
            </div>
          </div>
          {getPackageMetadataBadges(activePackage).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pl-6 pt-1 border-t border-emerald-500/15">
              {getPackageMetadataBadges(activePackage).map((b) => (
                <span
                  key={b.key}
                  className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${b.className}`}
                >
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CascadingPackageSelector;
