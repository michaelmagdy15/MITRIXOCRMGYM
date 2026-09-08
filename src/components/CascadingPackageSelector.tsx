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

  // Filter packages dynamically based on Step 1, Step 2, and PT toggle using SQL RBAC parity
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      return isPackageMatchingFilter(pkg, category, branch, isPtSelected);
    });
  }, [packages, category, branch, isPtSelected]);

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
                  const isPtPkg = (activePackage.type || '').toLowerCase() === 'private' || activePackage.name.toLowerCase().includes('pt');
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
            onPackageSelect(found || null, isPtSelected);
          }}
        >
          <SelectTrigger className="h-12 rounded-xl bg-background border-primary/30 focus:border-primary text-sm font-semibold shadow-inner">
            <SelectValue placeholder={filteredPackages.length > 0 ? "Select package..." : "No matching packages — click for options"} />
          </SelectTrigger>
          <SelectContent className="rounded-2xl max-h-[280px]">
            {filteredPackages.length > 0 ? (
              filteredPackages.map((pkg) => (
                <SelectItem key={pkg.id} value={pkg.name} className="py-2.5 px-3 rounded-xl cursor-pointer">
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
                </SelectItem>
              ))
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
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center justify-between text-xs animate-in fade-in duration-200">
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
      )}
    </div>
  );
};

export default CascadingPackageSelector;
