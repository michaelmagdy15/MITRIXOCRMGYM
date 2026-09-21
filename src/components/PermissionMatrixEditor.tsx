import React, { useState, useMemo } from 'react';
import { 
  PERMISSION_CATEGORIES, 
  PERMISSION_DEFINITIONS, 
  CategoryMetadata 
} from '../utils/permissions';
import { PermissionCategory, PermissionDefinition } from '../types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Search, 
  Check, 
  X, 
  ChevronDown, 
  ChevronRight, 
  LayoutDashboard, 
  CreditCard, 
  Users, 
  UserPlus, 
  Scan, 
  Target, 
  Award, 
  Package, 
  BarChart3, 
  Coffee, 
  Settings,
  SlidersHorizontal,
  CheckCheck
} from 'lucide-react';

interface PermissionMatrixEditorProps {
  permissions: Record<string, boolean>;
  onChange: (permissions: Record<string, boolean>) => void;
  readOnly?: boolean;
  compact?: boolean;
  className?: string;
  defaultExpanded?: boolean;
}

const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  CreditCard,
  Users,
  UserPlus,
  Scan,
  Target,
  Award,
  Package,
  BarChart3,
  Coffee,
  Settings
};

export const PermissionMatrixEditor: React.FC<PermissionMatrixEditorProps> = ({
  permissions,
  onChange,
  readOnly = false,
  compact = false,
  className = '',
  defaultExpanded = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const cat of PERMISSION_CATEGORIES) {
      initial[cat.id] = defaultExpanded;
    }
    return initial;
  });

  // Filter permissions based on search query and category filter
  const filteredPermissionsByCategory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const result: Record<PermissionCategory, PermissionDefinition[]> = {
      dashboard: [],
      payments: [],
      members: [],
      leads: [],
      attendance: [],
      classes: [],
      coaches: [],
      packages: [],
      reports: [],
      operations: [],
      settings: []
    };

    for (const def of PERMISSION_DEFINITIONS) {
      if (selectedCategory !== 'all' && def.category !== selectedCategory) {
        continue;
      }
      if (query) {
        const matchesLabel = def.label.toLowerCase().includes(query);
        const matchesKey = def.key.toLowerCase().includes(query);
        const matchesDesc = def.description.toLowerCase().includes(query);
        const matchesCat = def.category.toLowerCase().includes(query);
        if (!matchesLabel && !matchesKey && !matchesDesc && !matchesCat) {
          continue;
        }
      }
      result[def.category]?.push(def);
    }

    return result;
  }, [searchQuery, selectedCategory]);

  // If user searches, auto-expand categories with matching items
  React.useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const allOpen: Record<string, boolean> = {};
      for (const cat of PERMISSION_CATEGORIES) {
        allOpen[cat.id] = true;
      }
      setExpandedCategories(allOpen);
    }
  }, [searchQuery]);

  // Calculation of totals
  const totalPermissionsCount = PERMISSION_DEFINITIONS.length;
  const totalEnabledCount = useMemo(() => {
    return PERMISSION_DEFINITIONS.filter(def => !!permissions[def.key]).length;
  }, [permissions]);

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  const handleTogglePermission = (key: string) => {
    if (readOnly) return;
    const current = !!permissions[key];
    onChange({
      ...permissions,
      [key]: !current
    });
  };

  const handleSelectAllCategory = (catId: PermissionCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;
    const updated = { ...permissions };
    const defs = PERMISSION_DEFINITIONS.filter(d => d.category === catId);
    for (const def of defs) {
      updated[def.key] = true;
    }
    onChange(updated);
  };

  const handleDeselectAllCategory = (catId: PermissionCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;
    const updated = { ...permissions };
    const defs = PERMISSION_DEFINITIONS.filter(d => d.category === catId);
    for (const def of defs) {
      updated[def.key] = false;
    }
    onChange(updated);
  };

  const handleEnableAll = () => {
    if (readOnly) return;
    const updated = { ...permissions };
    for (const def of PERMISSION_DEFINITIONS) {
      updated[def.key] = true;
    }
    onChange(updated);
  };

  const handleDisableAll = () => {
    if (readOnly) return;
    const updated = { ...permissions };
    for (const def of PERMISSION_DEFINITIONS) {
      updated[def.key] = false;
    }
    onChange(updated);
  };

  const handleExpandAll = (expanded: boolean) => {
    const updated: Record<string, boolean> = {};
    for (const cat of PERMISSION_CATEGORIES) {
      updated[cat.id] = expanded;
    }
    setExpandedCategories(updated);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Controls Bar */}
      <div className="bg-card/70 border rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <h4 className="text-base font-semibold text-foreground">Granular Permissions Matrix</h4>
            <Badge variant="outline" className="ml-2 font-mono text-xs">
              {totalEnabledCount} / {totalPermissionsCount} Active
            </Badge>
          </div>

          {!readOnly && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button 
                type="button" 
                size="sm" 
                variant="outline" 
                onClick={handleEnableAll}
                className="text-xs h-8 px-2.5 hover:bg-primary/10 hover:text-primary"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Enable All
              </Button>
              <Button 
                type="button" 
                size="sm" 
                variant="outline" 
                onClick={handleDisableAll}
                className="text-xs h-8 px-2.5 hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Disable All
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleExpandAll(true)}
                className="text-xs h-8 px-2"
              >
                Expand All
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleExpandAll(false)}
                className="text-xs h-8 px-2"
              >
                Collapse
              </Button>
            </div>
          )}
        </div>

        {/* Search and Category Filter */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by permission name, key (e.g. payments.delete), or feature description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm rounded-xl"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 max-w-full">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              }`}
            >
              All Categories ({PERMISSION_CATEGORIES.length})
            </button>
            {PERMISSION_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                }`}
              >
                {cat.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category Accordion List */}
      <div className="space-y-3">
        {PERMISSION_CATEGORIES.map(category => {
          const defs = filteredPermissionsByCategory[category.id] || [];
          if (defs.length === 0) return null;

          const isExpanded = !!expandedCategories[category.id];
          const enabledInCategory = defs.filter(d => !!permissions[d.key]).length;
          const allInCategoryEnabled = defs.length > 0 && enabledInCategory === defs.length;
          const CategoryIcon = CATEGORY_ICON_MAP[category.iconName] || LayoutDashboard;

          return (
            <div 
              key={category.id} 
              className="border rounded-2xl overflow-hidden bg-card transition-all shadow-sm hover:border-primary/30"
            >
              {/* Category Header */}
              <div 
                onClick={() => toggleCategory(category.id)}
                className="flex items-center justify-between p-3.5 sm:p-4 bg-muted/30 hover:bg-muted/50 cursor-pointer select-none transition-colors border-b"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${allInCategoryEnabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                    <CategoryIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm sm:text-base text-foreground">
                        {category.label}
                      </h4>
                      <Badge 
                        variant={enabledInCategory > 0 ? 'default' : 'secondary'} 
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          enabledInCategory === defs.length ? 'bg-emerald-600 hover:bg-emerald-700' : ''
                        }`}
                      >
                        {enabledInCategory} / {defs.length}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {category.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!readOnly && (
                    <div className="hidden sm:flex items-center gap-1.5 mr-2" onClick={e => e.stopPropagation()}>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleSelectAllCategory(category.id, e)}
                        className="h-7 text-xs px-2 text-muted-foreground hover:text-primary"
                      >
                        Select All
                      </Button>
                      <span className="text-muted-foreground/40 text-xs">|</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleDeselectAllCategory(category.id, e)}
                        className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Permissions Checkbox Grid */}
              {isExpanded && (
                <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-card/40">
                  {defs.map(def => {
                    const isChecked = !!permissions[def.key];
                    return (
                      <div
                        key={def.key}
                        onClick={() => handleTogglePermission(def.key)}
                        className={`group flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-primary/5 border-primary/30 shadow-xs'
                            : 'bg-card border-border/60 hover:border-border hover:bg-muted/20 opacity-80'
                        } ${readOnly ? 'cursor-default pointer-events-none' : ''}`}
                      >
                        <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            id={`perm-${def.key}`}
                            checked={isChecked}
                            disabled={readOnly}
                            onCheckedChange={() => handleTogglePermission(def.key)}
                            className="rounded-md"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1 select-none">
                          <div className="flex items-center justify-between gap-2">
                            <label 
                              htmlFor={`perm-${def.key}`} 
                              className="text-xs sm:text-sm font-semibold text-foreground cursor-pointer truncate"
                            >
                              {def.label}
                            </label>
                            <code className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                              {def.key}
                            </code>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {def.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
