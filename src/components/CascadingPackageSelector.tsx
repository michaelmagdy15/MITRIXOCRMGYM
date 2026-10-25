import { getTenantId } from '../firebase';
import React, { useState, useMemo, useEffect } from 'react';
import { Package } from '../types';
import { MEMBER_CATEGORIES, MemberCategory, normalizeMemberCategory, isPackageMatchingFilter } from '../utils/memberCategories';
import { getEffectivePackageHierarchy, getEffectivePackageCategory } from '../utils/membershipRules';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles, Dumbbell, MapPin, Layers, CheckCircle2, UserCheck, ShieldAlert, Search, X, Check, ArrowRight } from 'lucide-react';

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
  const [hierarchyFilter, setHierarchyFilter] = useState<'ALL' | 'Primary' | 'Secondary'>('ALL');
  const [packageTypeFilter, setPackageTypeFilter] = useState<
    'ALL' | 'MEMBERSHIP' | 'PT' | 'CLASSES' | 'SGF' | 'GYMNASTICS' | 'NUTRITION' | 'PHYSIO' | 'DROPIN'
  >('ALL');

  // Instant quick search query across all packages
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isNutritionPackage = (pkg: Package) => {
    const n = (pkg.name || '').toLowerCase();
    const c = (pkg.category || '').toLowerCase().trim();
    const team = (pkg.targetTeam || '').toLowerCase().trim();
    return c === 'nutrition' || c.includes('nutrition') || team === 'nutrition' || n.includes('nutrition') || n.includes('diet');
  };

  const isPhysioPackage = (pkg: Package) => {
    const n = (pkg.name || '').toLowerCase();
    const c = (pkg.category || '').toLowerCase().trim();
    return c === 'physiotherapy' || c.includes('physio') || n.includes('physio') || n.includes('recovery');
  };

  const isGymnasticsPackage = (pkg: Package) => {
    const n = (pkg.name || '').toLowerCase();
    const c = (pkg.category || '').toLowerCase().trim();
    return c === 'gymnastics' || c.includes('gymnastic') || n.includes('gymnastic');
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
      c === 'mma' ||
      c.includes('class') ||
      team === 'class instructors' ||
      n.includes('class') ||
      n.includes('mma') ||
      (n.includes('academy') && !isGymnasticsPackage(pkg) && !isSgfPackage(pkg)) ||
      n.includes('bootcamp')
    );
  };

  const isPtPackage = (pkg: Package) => {
    const c = (pkg.category || '').toLowerCase().trim();
    if (
      c === 'nutrition' ||
      c === 'physiotherapy' ||
      c === 'sgf' ||
      c === 'classes' ||
      c === 'gymnastics' ||
      c === 'complimentary' ||
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
      c === 'personal training (pt)' ||
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
      n.includes('complimentary') ||
      n.includes('visit') ||
      n.includes('single') ||
      (pkg.sessions === 1 && !isPtPackage(pkg) && !isNutritionPackage(pkg) && !isPhysioPackage(pkg) && !isGymnasticsPackage(pkg))
    );
  };

  const isMembershipPackage = (pkg: Package) => {
    const c = (pkg.category || '').toLowerCase().trim();
    if (c === 'membership' || c === 'memberships' || c === 'gym memberships') {
      return true;
    }
    if (getEffectivePackageHierarchy(pkg) === 'Primary') {
      return true;
    }
    return (
      !isPtPackage(pkg) &&
      !isDropInPackage(pkg) &&
      !isSgfPackage(pkg) &&
      !isGymnasticsPackage(pkg) &&
      !isNutritionPackage(pkg) &&
      !isPhysioPackage(pkg) &&
      !isClassesPackage(pkg)
    );
  };

  const getPackageMetadataBadges = (pkg: Package) => {
    const badges: { key: string; label: string; className: string }[] = [];

    const resolvedHierarchy = showCategoryTabs ? getEffectivePackageHierarchy(pkg) : pkg.hierarchy;
    if (resolvedHierarchy === 'Primary') {
      badges.push({
        key: 'hierarchy',
        label: 'Primary',
        className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      });
    } else if (resolvedHierarchy === 'Secondary') {
      badges.push({
        key: 'hierarchy',
        label: 'Secondary',
        className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
      });
    }

    const resolvedCat = getEffectivePackageCategory(pkg);
    if (resolvedCat) {
      badges.push({
        key: 'category',
        label: resolvedCat,
        className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
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
    pkg.status !== 'Hold' && (pkg.status as string) !== 'Inactive' && pkg.isActive !== false && pkg.is_active !== false && !pkg.archivedAt;

  // Filter packages dynamically
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      if (!isPackageActive(pkg)) return false;
      const isPkgPt = isPtPackage(pkg);

      if (showCategoryTabs) {
        if (hierarchyFilter !== 'ALL') {
          const h = getEffectivePackageHierarchy(pkg);
          if (h !== hierarchyFilter) return false;
        }
        if (isPtSelected && packageTypeFilter === 'ALL' && !isPkgPt) {
          return false;
        }
      } else {
        const pkgForMatch = { ...pkg, type: (isPkgPt ? 'Private' : 'Group') as Package['type'] };
        const shouldMatchPt = packageTypeFilter === 'PT' || isPtSelected;
        if (!isPackageMatchingFilter(pkgForMatch, category, branch, shouldMatchPt)) {
          return false;
        }
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
      if (packageTypeFilter === 'GYMNASTICS') {
        return isGymnasticsPackage(pkg);
      }
      if (packageTypeFilter === 'NUTRITION') {
        return isNutritionPackage(pkg);
      }
      if (packageTypeFilter === 'PHYSIO') {
        return isPhysioPackage(pkg);
      }
      if (packageTypeFilter === 'DROPIN') {
        return isDropInPackage(pkg);
      }
      return true;
    });
  }, [packages, category, branch, isPtSelected, hierarchyFilter, packageTypeFilter, showCategoryTabs]);

  // Currently selected package object
  const activePackage = useMemo(() => {
    return packages.find(p => p.name === selectedPackageName) || null;
  }, [packages, selectedPackageName]);

  // Quick Search Filter: searches across all active packages
  const searchedPackages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return packages
      .filter((pkg) => {
        if (!isPackageActive(pkg)) return false;
        const name = (pkg.name || '').toLowerCase();
        const cat = (pkg.category || '').toLowerCase();
        const targetTeam = (pkg.targetTeam || '').toLowerCase();
        const branchName = (pkg.branch || '').toLowerCase();
        const memberCat = String((pkg as any).memberCategory || '').toLowerCase();
        const priceStr = String(pkg.price ?? '');
        const sessionsStr = String(pkg.sessions ?? '');
        const hierarchy = (pkg.hierarchy || '').toLowerCase();

        return (
          name.includes(q) ||
          cat.includes(q) ||
          targetTeam.includes(q) ||
          branchName.includes(q) ||
          memberCat.includes(q) ||
          priceStr.includes(q) ||
          (q === 'morning' && (pkg.isTimeRestricted || (pkg.allowedStartTime && pkg.allowedEndTime))) ||
          (q === 'pt' && isPtPackage(pkg)) ||
          (q === 'sgf' && isSgfPackage(pkg)) ||
          (q === 'classes' && isClassesPackage(pkg)) ||
          (q === 'nutrition' && isNutritionPackage(pkg)) ||
          (q === 'dropin' && isDropInPackage(pkg)) ||
          (q === 'membership' && isMembershipPackage(pkg)) ||
          (q === 'unlimited' && (pkg.sessions === -1 || pkg.sessions === 0)) ||
          (sessionsStr === q) ||
          (hierarchy === q)
        );
      })
      .sort((a, b) => {
        const q = searchQuery.trim().toLowerCase();
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        if (aName === q && bName !== q) return -1;
        if (bName === q && aName !== q) return 1;
        if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
        if (bName.startsWith(q) && !aName.startsWith(q)) return 1;
        const aCat = (a.category || '').toLowerCase();
        const bCat = (b.category || '').toLowerCase();
        if (aCat.startsWith(q) && !bCat.startsWith(q)) return -1;
        if (bCat.startsWith(q) && !aCat.startsWith(q)) return 1;
        return a.price - b.price;
      });
  }, [packages, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;
  const effectiveFilteredPackages = isSearching ? searchedPackages : filteredPackages;

  // Direct package selection (from search results or dropdown)
  const handleDirectSelect = (pkg: Package) => {
    const isPt = isPtPackage(pkg);
    setIsPtSelected(isPt);
    const pkgMemberCat = (pkg as any).memberCategory;
    if (pkgMemberCat) {
      const norm = normalizeMemberCategory(pkgMemberCat);
      setCategory(norm);
      onCategoryChange?.(norm);
    }
    if (pkg.branch && pkg.branch !== 'All Branches' && pkg.branch !== 'All') {
      setBranch(pkg.branch);
      onBranchChange?.(pkg.branch);
    }
    onPackageSelect(pkg, isPt);
  };

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

      {/* Instant Package Search Bar */}
      <div className="space-y-2 rounded-xl bg-background/60 p-3 border border-border/50 shadow-sm">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-primary" />
            Quick Package Search
          </Label>
          {isSearching && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <X className="h-3 w-3" />
              Clear search
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by package name, price (e.g. 2500), category, or sessions..."
            className="pl-9 pr-9 h-10 rounded-xl bg-background border-border/70 focus-visible:border-primary text-xs font-medium placeholder:text-muted-foreground/70 shadow-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        {!isSearching && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Quick:</span>
            {['Morning', 'PT', 'Membership', 'Classes', 'SGF', 'Nutrition'].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setSearchQuery(chip)}
                className="text-[10px] px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted border border-border/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer font-medium"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Live Search Results */}
        {isSearching && (
          <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                Found {searchedPackages.length} package{searchedPackages.length === 1 ? '' : 's'} matching "{searchQuery}"
              </span>
              <span className="text-muted-foreground text-[10px]">
                Click any to select directly
              </span>
            </div>

            {searchedPackages.length > 0 ? (
              <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
                {searchedPackages.map((pkg) => {
                  const isSelected = selectedPackageName === pkg.name;
                  const metaBadges = getPackageMetadataBadges(pkg);
                  return (
                    <div
                      key={pkg.id}
                      onClick={() => handleDirectSelect(pkg)}
                      className={`group p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500 shadow-sm'
                          : 'bg-background hover:bg-accent/50 border-border/60 hover:border-primary/50'
                      }`}
                    >
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold truncate ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'}`}>
                            {pkg.name}
                          </span>
                          {isSelected && (
                            <Badge className="h-4 px-1.5 text-[9px] bg-emerald-600 hover:bg-emerald-600 text-white font-bold">
                              Selected
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          {pkg.category && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-semibold bg-muted text-muted-foreground border border-border/40">
                              {pkg.category}
                            </span>
                          )}
                          {(pkg as any).memberCategory && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                              {(pkg as any).memberCategory}
                            </span>
                          )}
                          {pkg.branch && pkg.branch !== 'All Branches' && pkg.branch !== 'All' && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              {pkg.branch}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {pkg.sessions === -1 || pkg.sessions === 0 ? 'Unlimited' : `${pkg.sessions} ses`} • {pkg.expiryDays}d
                          </span>
                          {metaBadges.map((b) => (
                            <span
                              key={b.key}
                              className={`inline-flex items-center rounded px-1.5 py-0.2 text-[9px] font-semibold ${b.className}`}
                            >
                              {b.label}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                            {pkg.price.toLocaleString()} LE
                          </span>
                        </div>
                        <div className={`h-7 w-7 rounded-lg flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'border-border/60 group-hover:border-primary group-hover:text-primary'
                        }`}>
                          {isSelected ? <Check className="h-4 w-4" /> : <ArrowRight className="h-3.5 w-3.5" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-border/60 text-center text-xs text-muted-foreground space-y-1">
                <p>No package matches "<strong>{searchQuery}</strong>".</p>
                <p className="text-[11px] text-primary">Try searching by partial name, category (e.g. PT, Classes), or price (e.g. 2000).</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 1 & Step 2: Member Category & Branch (Non-Inzan / Strike Boxing) */}
      {!showCategoryTabs && (
        <>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
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
        </>
      )}

      {/* Inzan Primary / Secondary Hierarchy + Package Category Filter Tabs */}
      {showCategoryTabs && (
        <div className="space-y-3 pt-1">
          {/* Primary vs Secondary Hierarchy Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-primary" />
                Step 1: Package Hierarchy (Primary vs Secondary)
              </span>
              <span className="text-[11px] text-muted-foreground">
                {hierarchyFilter === 'ALL' && 'All Packages'}
                {hierarchyFilter === 'Primary' && 'Primary (Core Gym Memberships)'}
                {hierarchyFilter === 'Secondary' && 'Secondary (PT, Classes & Add-ons)'}
              </span>
            </Label>
            <div className="grid grid-cols-3 gap-1.5 bg-muted/40 p-1.5 rounded-xl border border-border/40">
              {([
                {
                  id: 'ALL' as const,
                  label: 'All Packages',
                  count: packages.filter(isPackageActive).length,
                  activeClass: 'bg-primary text-primary-foreground shadow-sm font-bold',
                },
                {
                  id: 'Primary' as const,
                  label: 'Primary (Memberships)',
                  count: packages.filter((p) => isPackageActive(p) && getEffectivePackageHierarchy(p) === 'Primary').length,
                  activeClass: 'bg-emerald-600 text-white shadow-sm font-bold',
                },
                {
                  id: 'Secondary' as const,
                  label: 'Secondary (PT / Add-ons)',
                  count: packages.filter((p) => isPackageActive(p) && getEffectivePackageHierarchy(p) === 'Secondary').length,
                  activeClass: 'bg-purple-600 text-white shadow-sm font-bold',
                },
              ]).map((hTab) => {
                const isSel = hierarchyFilter === hTab.id;
                return (
                  <button
                    key={hTab.id}
                    type="button"
                    onClick={() => {
                      setHierarchyFilter(hTab.id);
                      if (hTab.id === 'Primary' && packageTypeFilter !== 'ALL' && packageTypeFilter !== 'MEMBERSHIP') {
                        setPackageTypeFilter('MEMBERSHIP');
                        setIsPtSelected(false);
                      } else if (hTab.id === 'Secondary' && packageTypeFilter === 'MEMBERSHIP') {
                        setPackageTypeFilter('ALL');
                      }
                    }}
                    className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all text-center truncate cursor-pointer ${
                      isSel
                        ? hTab.activeClass
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/70'
                    }`}
                  >
                    {hTab.label} ({hTab.count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: POS Package Category */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Step 2: Package Category
              </span>
              <span className="text-[11px] text-muted-foreground">
                {packageTypeFilter === 'ALL' && 'All Categories'}
                {packageTypeFilter === 'MEMBERSHIP' && 'Primary Memberships'}
                {packageTypeFilter === 'PT' && 'Personal Training (Secondary)'}
                {packageTypeFilter === 'CLASSES' && 'Classes (Secondary)'}
                {packageTypeFilter === 'SGF' && 'Small Group Fitness / SGF (Secondary)'}
                {packageTypeFilter === 'GYMNASTICS' && 'Gymnastics (Secondary)'}
                {packageTypeFilter === 'NUTRITION' && 'Nutrition & Diet (Secondary)'}
                {packageTypeFilter === 'PHYSIO' && 'Physiotherapy & Recovery (Secondary)'}
                {packageTypeFilter === 'DROPIN' && 'Complimentary / Drop-in (Secondary)'}
              </span>
            </Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 bg-muted/40 p-1.5 rounded-xl border border-border/40">
              {[
                { id: 'ALL', label: 'All Categories' },
                { id: 'MEMBERSHIP', label: 'Membership' },
                { id: 'PT', label: 'Personal Training' },
                { id: 'CLASSES', label: 'Classes' },
                { id: 'SGF', label: 'SGF' },
                { id: 'GYMNASTICS', label: 'Gymnastics' },
                { id: 'NUTRITION', label: 'Nutrition' },
                { id: 'PHYSIO', label: 'Physiotherapy' },
                { id: 'DROPIN', label: 'Complimentary' },
              ].map((tab) => {
                const isSel = packageTypeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setPackageTypeFilter(tab.id as any);
                      if (tab.id === 'MEMBERSHIP' && hierarchyFilter === 'Secondary') {
                        setHierarchyFilter('ALL');
                      } else if (tab.id !== 'ALL' && tab.id !== 'MEMBERSHIP' && hierarchyFilter === 'Primary') {
                        setHierarchyFilter('ALL');
                      }
                      if (tab.id === 'PT') {
                        setIsPtSelected(true);
                      } else {
                        setIsPtSelected(false);
                      }
                    }}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all text-center truncate cursor-pointer ${
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
        </div>
      )}

      {/* Step 3: Dynamic Filtered Package Dropdown */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            {isSearching
              ? `Matching Search Packages (${effectiveFilteredPackages.length})`
              : `Step 3: Matching Price Packages (${effectiveFilteredPackages.length})`}
          </Label>
          {effectiveFilteredPackages.length === 0 && (
            <span className="text-[11px] text-amber-500 font-medium">
              {isSearching ? 'No packages matched search' : 'No direct package for this combination'}
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
            if (found) {
              handleDirectSelect(found);
            } else {
              onPackageSelect(null, isPtSelected);
            }
          }}
        >
          <SelectTrigger className="h-12 rounded-xl bg-background border-primary/30 focus:border-primary text-sm font-semibold shadow-inner">
            <SelectValue placeholder={effectiveFilteredPackages.length > 0 ? "Select package..." : "No matching packages — click for options"} />
          </SelectTrigger>
          <SelectContent className="rounded-2xl max-h-[320px]">
            {effectiveFilteredPackages.length > 0 ? (
              effectiveFilteredPackages.map((pkg) => {
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
                {isSearching ? (
                  <>
                    <p>No package matches search query "<strong>{searchQuery}</strong>".</p>
                    <p className="mt-1 text-[11px] text-primary">Try another keyword, or clear search to browse all tiers.</p>
                  </>
                ) : (
                  <>
                    <p>No package matches <strong>{category}</strong> at <strong>{branch}</strong>.</p>
                    <p className="mt-1 text-[11px] text-primary">Try changing the Branch or Category, or create a custom package.</p>
                  </>
                )}
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
