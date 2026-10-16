import React, { useState } from 'react';
import {
  Layers,
  Gift,
  Snowflake,
  Clock,
  Target,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  PauseCircle,
  Dumbbell,
  Users,
  Sparkles,
} from 'lucide-react';
import { PackageHierarchy, PackageTargetTeam } from '../../types';

export interface PackageEnhancementsState {
  hierarchy: PackageHierarchy; // 'Primary' | 'Secondary'
  status: 'Active' | 'Hold';
  freePtSessions: number;
  freezeAllowanceDays: number;
  minFreezeDays: number;
  maxFreezeDays: number;
  guestInvitations: number;
  freeClassTrials: number;
  isTimeRestricted: boolean;
  allowedStartTime: string;
  allowedEndTime: string;
  targetTeam: PackageTargetTeam; // 'Sales' | 'PT' | 'Class Instructors' | 'Nutrition'
  targetAmount: number;
}

export const DEFAULT_PACKAGE_ENHANCEMENTS: PackageEnhancementsState = {
  hierarchy: 'Primary',
  status: 'Active',
  freePtSessions: 0,
  freezeAllowanceDays: 0,
  minFreezeDays: 7,
  maxFreezeDays: 30,
  guestInvitations: 0,
  freeClassTrials: 0,
  isTimeRestricted: false,
  allowedStartTime: '06:00',
  allowedEndTime: '14:00',
  targetTeam: 'Sales',
  targetAmount: 0,
};

const TARGET_TEAMS: { value: PackageTargetTeam; label: string; description: string }[] = [
  { value: 'Sales', label: 'Sales', description: 'Front-desk & membership sales team targets' },
  { value: 'PT', label: 'PT (Personal Training)', description: 'Fitness coaches & personal trainers targets' },
  { value: 'Class Instructors', label: 'Class Instructors', description: 'Group fitness & studio class instructors' },
  { value: 'Nutrition', label: 'Nutrition', description: 'Clinical & sports nutrition specialists' },
];

export function PackageBenefitsFormSection({
  value,
  onChange,
}: {
  value: PackageEnhancementsState;
  onChange: (next: PackageEnhancementsState) => void;
}) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const updateField = <K extends keyof PackageEnhancementsState>(
    key: K,
    fieldValue: PackageEnhancementsState[K]
  ) => {
    onChange({
      ...value,
      [key]: fieldValue,
    });
  };

  const handleNumberChange = (key: keyof PackageEnhancementsState, rawValue: string, min = 0) => {
    const parsed = rawValue === '' ? 0 : Math.max(min, parseInt(rawValue, 10) || 0);
    updateField(key, parsed as never);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden transition-all">
      {/* Header / Collapsible Toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-zinc-900/90 hover:bg-zinc-800/80 transition-colors text-left border-b border-zinc-800/80"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100">
              Package Hierarchy, Benefits & Rules
            </h4>
            <p className="text-xs text-zinc-400">
              Configure membership tier prerequisites, freeze policies, complimentary perks, time windows & sales attribution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
              value.hierarchy === 'Primary'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
            }`}
          >
            {value.hierarchy}
          </span>
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
              value.status === 'Active'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            {value.status === 'Active' ? 'Active' : 'On Hold'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-5">
          {/* 1. Package Hierarchy & Status */}
          <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-3.5 space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Package Hierarchy & Status</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Hierarchy Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Package Hierarchy
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => updateField('hierarchy', 'Primary')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                      value.hierarchy === 'Primary'
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-zinc-100'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="package-hierarchy"
                      checked={value.hierarchy === 'Primary'}
                      onChange={() => updateField('hierarchy', 'Primary')}
                      className="mt-0.5 accent-emerald-500"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-zinc-100">
                        Primary Package (Base Membership)
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Standalone gym membership; unlocks eligibility for Secondary add-on packages.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateField('hierarchy', 'Secondary')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                      value.hierarchy === 'Secondary'
                        ? 'border-blue-500/60 bg-blue-500/10 text-zinc-100'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="package-hierarchy"
                      checked={value.hierarchy === 'Secondary'}
                      onChange={() => updateField('hierarchy', 'Secondary')}
                      className="mt-0.5 accent-blue-500"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-zinc-100">
                        Secondary Package (Requires Active Primary Package)
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Add-on service (e.g., PT, Nutrition, Classes). Member must hold a valid Primary package.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Status Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Availability Status
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => updateField('status', 'Active')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                      value.status === 'Active'
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-zinc-100'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        value.status === 'Active' ? 'text-emerald-400' : 'text-zinc-500'
                      }`}
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-zinc-100">
                        Active (Available for sale)
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Selectable in new signups, renewals, and POS checkout flows.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateField('status', 'Hold')}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                      value.status === 'Hold'
                        ? 'border-amber-500/60 bg-amber-500/10 text-zinc-100'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <PauseCircle
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        value.status === 'Hold' ? 'text-amber-400' : 'text-zinc-500'
                      }`}
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-zinc-100">
                        On Hold (Paused)
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Temporarily paused for new sales while keeping existing subscriptions intact.
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Prerequisite Info Banner */}
            <div className="flex items-start gap-2 rounded-lg bg-zinc-900/90 border border-zinc-800 px-3 py-2 text-[11px] text-zinc-400">
              <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {value.hierarchy === 'Secondary'
                  ? 'Prerequisite Rule: Staff and self-service checkouts will verify that the member has an active, non-expired Primary Package before allowing purchase of this Secondary Package.'
                  : 'Primary Package Rule: Acts as the foundational gym membership. Members with an active Primary Package can purchase any Secondary Package (PT, Classes, Nutrition).'}
              </span>
            </div>
          </div>

          {/* 2. Package Benefits & Freeze Rules */}
          <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-3.5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                <Gift className="w-3.5 h-3.5 text-emerald-400" />
                <span>Package Benefits & Freeze Rules</span>
              </div>
              <span className="text-[11px] text-zinc-500">Set to 0 if not included</span>
            </div>

            {/* Perks Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Dumbbell className="w-3.5 h-3.5 text-amber-400" />
                  <span>Free PT Sessions</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={value.freePtSessions}
                  onChange={(e) => handleNumberChange('freePtSessions', e.target.value, 0)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  placeholder="0"
                />
                <p className="text-[11px] text-zinc-500">Complimentary 1-on-1 PT quota</p>
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span>Guest Invitations</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={value.guestInvitations}
                  onChange={(e) => handleNumberChange('guestInvitations', e.target.value, 0)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  placeholder="0"
                />
                <p className="text-[11px] text-zinc-500">Free day-passes for guests</p>
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Free Trials for Paid Classes</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={value.freeClassTrials}
                  onChange={(e) => handleNumberChange('freeClassTrials', e.target.value, 0)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  placeholder="0"
                />
                <p className="text-[11px] text-zinc-500">Complimentary paid class entries</p>
              </div>
            </div>

            {/* Freeze Allowance Row */}
            <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Total Freezing Allowance (Days)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={value.freezeAllowanceDays}
                  onChange={(e) => handleNumberChange('freezeAllowanceDays', e.target.value, 0)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-cyan-500 focus:outline-none"
                  placeholder="0"
                />
                <p className="text-[11px] text-zinc-500">Max cumulative freeze days allowed</p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">
                  Min Freeze Duration (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={value.minFreezeDays}
                  onChange={(e) => handleNumberChange('minFreezeDays', e.target.value, 1)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-cyan-500 focus:outline-none"
                  placeholder="7"
                />
                <p className="text-[11px] text-zinc-500">Shortest single freeze request</p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">
                  Max Freeze Duration (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={value.maxFreezeDays}
                  onChange={(e) => handleNumberChange('maxFreezeDays', e.target.value, 1)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-cyan-500 focus:outline-none"
                  placeholder="30"
                />
                <p className="text-[11px] text-zinc-500">Longest single freeze request</p>
              </div>
            </div>
          </div>

          {/* 3. Time-Based Package Restriction */}
          <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={value.isTimeRestricted}
                  onChange={(e) => updateField('isTimeRestricted', e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 accent-amber-500"
                />
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                    Time-Restricted Package (e.g. Morning Package)
                  </span>
                </div>
              </label>
              {value.isTimeRestricted && (
                <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  {value.allowedStartTime || '06:00'} – {value.allowedEndTime || '14:00'}
                </span>
              )}
            </div>

            {value.isTimeRestricted && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">
                    Allowed Start Time
                  </label>
                  <input
                    type="time"
                    value={value.allowedStartTime || '06:00'}
                    onChange={(e) => updateField('allowedStartTime', e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-zinc-500">Earliest check-in time allowed</p>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">
                    Allowed End Time
                  </label>
                  <input
                    type="time"
                    value={value.allowedEndTime || '14:00'}
                    onChange={(e) => updateField('allowedEndTime', e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-zinc-500">Latest check-in time allowed</p>
                </div>
              </div>
            )}
          </div>

          {/* 4. Target Attribution */}
          <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
              <Target className="w-3.5 h-3.5 text-rose-400" />
              <span>Target Attribution</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">
                  Target Team / Role
                </label>
                <select
                  value={value.targetTeam}
                  onChange={(e) =>
                    updateField('targetTeam', e.target.value as PackageTargetTeam)
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                >
                  {TARGET_TEAMS.map((team) => (
                    <option key={team.value} value={team.value}>
                      {team.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-500">
                  {TARGET_TEAMS.find((t) => t.value === value.targetTeam)?.description ||
                    'Department credited for revenue when this package is sold'}
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">
                  Package Target Value (LE){' '}
                  <span className="text-zinc-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={value.targetAmount}
                  onChange={(e) => handleNumberChange('targetAmount', e.target.value, 0)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
                  placeholder="0"
                />
                <p className="text-[11px] text-zinc-500">
                  Monthly revenue or quota target benchmark for this package (0 = use package price)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PackageBenefitsFormSection;
