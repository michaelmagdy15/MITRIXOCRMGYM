import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSettings } from './contexts/SettingsContext';
import { FeatureFlags } from './types';
import {
  Shield,
  Save,
  CheckCircle2,
  UserPlus,
  CreditCard,
  Scan,
  BarChart3,
  FileText,
  Coffee,
  Package,
  Smartphone,
  Phone,
  Search as SearchIcon,
  MessageSquare,
  Star,
  ClipboardList,
  Target,
  Database,
  Dumbbell,
  CheckSquare,
  ShoppingCart,
  Clock,
  QrCode,
  Trophy,
  Coins,
  AlertCircle,
  Snowflake,
  Lock,
  Boxes,
  UserCheck,
  Activity,
  Megaphone,
  KeyRound,
  Camera,
  Split,
  ShieldCheck,
  Briefcase,
  Sparkles,
  Layers,
  Filter,
} from 'lucide-react';
import ImportData from './ImportData';
import ImportHistory from './ImportHistory';
import { RedgitsLiveSyncDialog } from './components/RedgitsLiveSyncDialog';

import { activeConfig, getTenantId } from './firebase';
import { isTenantInzan } from './utils/inzanOrg';

type FeatureSectionId = 'core' | 'packages' | 'club' | 'member' | 'premium' | 'enterprise';

interface FeatureItemDef {
  key: keyof FeatureFlags;
  section: FeatureSectionId;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  defaultVal: (isInzan: boolean) => boolean;
}

const FEATURE_DEFINITIONS: FeatureItemDef[] = [
  // ── 1. Core CRM & Staff Modules ──
  {
    key: 'leads',
    section: 'core',
    title: 'Leads & Sales Pipeline Module',
    description: 'Enable tracking prospective clients, follow-up call logs, rep assignment, and trial conversions.',
    icon: UserPlus,
    defaultVal: () => true,
  },
  {
    key: 'payments',
    section: 'core',
    title: 'Payments, POS & Financials',
    description: 'Show full invoicing, POS payment recording, receipts, and revenue dashboards.',
    icon: CreditCard,
    defaultVal: () => true,
  },
  {
    key: 'attendance',
    section: 'core',
    title: 'Attendance Kiosk & Reception Check-ins',
    description: 'Enable front-desk reception check-in dashboard, barcode/QR scanner, and self-service kiosk mode.',
    icon: Scan,
    defaultVal: () => true,
  },
  {
    key: 'workoutLibrary',
    section: 'core',
    title: 'Workout & Exercise Library (1,585+ GIFs)',
    description: 'Enable the visual ExerciseDB & Calisthenics library, 78+ workout templates, and custom coach workout assignments across CRM, Coach, and Member portals.',
    icon: Dumbbell,
    badge: 'New',
    defaultVal: () => true,
  },
  {
    key: 'classBookingSystem',
    section: 'core',
    title: 'Group Class Scheduling & Booking System',
    description: 'Enable the full group class timetable, Class Manager, waitlists, cutoff windows, and attendance tracking.',
    icon: Target,
    defaultVal: () => true,
  },
  {
    key: 'nutrition',
    section: 'core',
    title: 'Nutrition & InBody Module',
    description: 'Enable nutrition profiles, dietitian consultation scheduling, InBody tracking, and meal planning.',
    icon: Activity,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'tasks',
    section: 'core',
    title: 'Staff Tasks & Follow-up Reminders',
    description: 'Enable staff task assignments, automated follow-up reminders, and daily operational checklists.',
    icon: CheckSquare,
    defaultVal: () => true,
  },
  {
    key: 'bookings',
    section: 'core',
    title: 'Bookings & POS Cart Tab',
    description: 'Enable the unified Bookings tab for staff to book classes and PT sessions for members.',
    icon: ShoppingCart,
    defaultVal: () => true,
  },
  {
    key: 'requests',
    section: 'core',
    title: 'Member Requests Queue',
    description: 'Enable the Requests tab to review member freeze requests, profile updates, and booking inquiries.',
    icon: ClipboardList,
    defaultVal: () => true,
  },
  {
    key: 'pendingApprovals',
    section: 'core',
    title: 'Pending Approvals & Dual-Control Queue',
    description: 'Enable the Pending Approvals tab for manager sign-off on sensitive edits, refunds, and overrides.',
    icon: Clock,
    defaultVal: () => true,
  },
  {
    key: 'reports',
    section: 'core',
    title: 'Reports & Basic Analytics',
    description: 'Enable standard sales charts, branch performance summaries, and membership status reports.',
    icon: BarChart3,
    defaultVal: () => true,
  },
  {
    key: 'quotes',
    section: 'core',
    title: 'Commercial Quote Generator',
    description: 'Enable generation of branded PDF membership proposals and corporate price quotes.',
    icon: FileText,
    defaultVal: () => true,
  },

  // ── 2. Packages, Billing & Financial Controls ──
  {
    key: 'ptPackages',
    section: 'packages',
    title: 'Private Training Packages (PT)',
    description: 'Enable private 1-on-1, Partner, and Small Group session packages, session deductions, and trainer scheduling.',
    icon: Package,
    defaultVal: () => true,
  },
  {
    key: 'secondaryPackages',
    section: 'packages',
    title: 'Primary + Secondary Package Hierarchy',
    description: 'Allow members to hold a Primary Membership alongside Secondary Add-On Packages (PT, SGF, Nutrition). Disable for single-package gyms like vanilla STRIKE.',
    icon: Layers,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'packageBenefitsEngine',
    section: 'packages',
    title: 'Package Benefits & Entitlements Engine',
    description: 'Enable configurable package quotas for Freeze Allowance Days, Free PT Sessions, Guest Invitations, Free Class Trials, and Off-Peak time restrictions.',
    icon: Sparkles,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'splitTenderPayments',
    section: 'packages',
    title: 'Split-Tender Payments (Dual Payment Methods)',
    description: 'Allow splitting a single invoice across two payment methods (e.g. Cash + Credit Card or Instapay + Wallet).',
    icon: Split,
    defaultVal: () => true,
  },
  {
    key: 'corporateDiscounts',
    section: 'packages',
    title: 'Corporate Discounts & Proof Verification',
    description: 'Enable corporate discount tiers with mandatory corporate ID/proof upload during checkout.',
    icon: Briefcase,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'debtors',
    section: 'packages',
    title: 'Debtors & Installments Tracker',
    description: 'Track members with unpaid balances, remaining installments, and quick debt collection.',
    icon: AlertCircle,
    defaultVal: () => true,
  },
  {
    key: 'unconfirmedMemberships',
    section: 'packages',
    title: 'Unconfirmed Memberships Queue (Accounting)',
    description: 'Track and verify newly sold memberships awaiting accounting/finance confirmation.',
    icon: Clock,
    defaultVal: () => true,
  },
  {
    key: 'frozenMembers',
    section: 'packages',
    title: 'Frozen Memberships & Freeze KPIs',
    description: 'Display frozen member counts on the dashboard and manage active/scheduled membership freezes.',
    icon: Snowflake,
    defaultVal: () => true,
  },

  // ── 3. Club Operations, Kitchen, Lockers & Hardware ──
  {
    key: 'operations',
    section: 'club',
    title: 'Club Operations Hub (Master Tab)',
    description: 'Show the Club Operations sidebar tab housing Juice Bar/Kitchen, Lockers, and Guest Invites.',
    icon: Coffee,
    defaultVal: () => true,
  },
  {
    key: 'juiceBar',
    section: 'club',
    title: "Juice Bar & Earth's Kitchen POS / Pre-Orders",
    description: 'Enable smoothie/meal menu pre-ordering from the member app and live kitchen order preparation queue.',
    icon: Coffee,
    defaultVal: () => true,
  },
  {
    key: 'kitchenInventory',
    section: 'club',
    title: 'Kitchen Stock & Inventory Manager',
    description: 'Enable raw ingredient stock tracking, low-stock alerts, and recipe inventory movements.',
    icon: Boxes,
    badge: 'New',
    defaultVal: () => true,
  },
  {
    key: 'locker',
    section: 'club',
    title: 'Standard Lockers & PIN Management',
    description: 'Enable branch locker directory, member locker allocation requests, and physical lockbox PINs.',
    icon: Lock,
    defaultVal: () => true,
  },
  {
    key: 'inzanSmartLockers',
    section: 'club',
    title: 'Smart Hardware Lockers (Phone Key & eLocker Bridge)',
    description: 'Enable live hardware locker unlocking via mobile Phone Key and front-desk Smart Locker Console.',
    icon: KeyRound,
    badge: 'Hardware',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'guestInvites',
    section: 'club',
    title: 'Guest Invitations & Member Referrals',
    description: 'Allow members to send digital guest passes and convert visiting guests into sales leads at reception.',
    icon: UserCheck,
    defaultVal: () => true,
  },
  {
    key: 'turnstileGateControl',
    section: 'club',
    title: 'Turnstile Gate Hardware Integration',
    description: 'Enable automatic turnstile relay triggers and gate decision badges on member check-in.',
    icon: Scan,
    badge: 'Hardware',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'webcamPhotoCapture',
    section: 'club',
    title: 'Reception Webcam Member Photo Capture',
    description: 'Allow front-desk staff to snap live member profile photos directly from the webcam at check-in.',
    icon: Camera,
    defaultVal: () => true,
  },

  // ── 4. Member App, Portals & Smart PWA ──
  {
    key: 'mobileApp',
    section: 'member',
    title: 'Mobile App & Public Guest Storefront',
    description: 'Enable public guest package browsing, online checkout storefront, and mobile app sync.',
    icon: Smartphone,
    defaultVal: () => false,
  },
  {
    key: 'qrCheckin',
    section: 'member',
    title: 'Digital QR Check-In Pass',
    description: 'Display dynamic QR entry pass and barcode on the Member Portal home screen.',
    icon: QrCode,
    defaultVal: () => true,
  },
  {
    key: 'wallet',
    section: 'member',
    title: 'Member Digital Wallet & Pre-Funded Balance',
    description: 'Allow members to top up a cashless club wallet balance for juice bar, PT, and renewals.',
    icon: Coins,
    defaultVal: () => true,
  },
  {
    key: 'pointsSystem',
    section: 'member',
    title: 'Loyalty Points, Streaks, Badges & Gamification',
    description: 'Enable member check-in streaks, achievement badges, leaderboards, and reward redemptions.',
    icon: Trophy,
    defaultVal: () => true,
  },
  {
    key: 'coachPortal',
    section: 'member',
    title: 'Dedicated Coach & Fitness Manager Portal',
    description: 'Enable the specialized Coach login tab, Floor Mode, Coach Earnings, and Schedule management.',
    icon: Dumbbell,
    defaultVal: () => true,
  },
  {
    key: 'smartPwaInstaller',
    section: 'member',
    title: 'Forced Smart PWA Home-Screen Installer',
    description: 'Prompt mobile visitors (iOS & Android) to install the gym web app to their home screen with custom tenant branding.',
    icon: Smartphone,
    badge: 'New',
    defaultVal: () => true,
  },
  {
    key: 'appQrGenerator',
    section: 'member',
    title: 'App QR Poster & Standee Generator',
    description: 'Enable the App QR sidebar page to print branded QR codes for reception desks.',
    icon: QrCode,
    defaultVal: () => true,
  },

  // ── 5. Telephony, WhatsApp & Premium Modules ──
  {
    key: 'clickToCall',
    section: 'premium',
    title: 'Click-to-Call Mobile Bridge & Call Logger',
    description: 'Allow staff on desktop to push 1-tap dial notifications to their mobile phone and log call outcomes.',
    icon: Phone,
    badge: 'New',
    defaultVal: () => true,
  },
  {
    key: 'twilioBroadcasts',
    section: 'premium',
    title: 'WhatsApp & SMS Broadcast Campaigns (Twilio)',
    description: 'Enable bulk WhatsApp template broadcasting, Meta template monitor, and incoming member reply inbox.',
    icon: Megaphone,
    badge: 'New',
    defaultVal: () => true,
  },
  {
    key: 'callCenter',
    section: 'premium',
    title: 'Call Center & Outbound Telemarketing Hub',
    description: 'Dedicated Call Center workspace with cooldown timers, Call Later reminders, and lead conversion queues.',
    icon: Phone,
    defaultVal: () => true,
  },
  {
    key: 'advancedReports',
    section: 'premium',
    title: 'Premium Reports & Custom Analytics',
    description: 'Unlock deep retention cohorts, coach utilization reports, and custom CSV/Excel exports.',
    icon: BarChart3,
    defaultVal: () => true,
  },
  {
    key: 'lostAndFound',
    section: 'premium',
    title: 'Lost & Found Property Registry',
    description: 'Track found items with photos, manage member claims, and categorize lost property across branches.',
    icon: SearchIcon,
    defaultVal: () => true,
  },
  {
    key: 'complaints',
    section: 'premium',
    title: 'Complaints & Suggestions Escalation',
    description: 'Receive, categorize, and resolve member complaints with SLA priority tracking.',
    icon: MessageSquare,
    defaultVal: () => true,
  },
  {
    key: 'surveys',
    section: 'premium',
    title: 'Member Satisfaction Surveys & NPS',
    description: 'Create and distribute surveys to gather member feedback and Net Promoter Scores.',
    icon: ClipboardList,
    defaultVal: () => true,
  },
  {
    key: 'serviceCategoryTargets',
    section: 'premium',
    title: 'Service Category Sales Targets (PT / Classes / Memberships)',
    description: 'Set and track granular monthly revenue targets broken down by PT, Group Classes, and Memberships.',
    icon: Target,
    defaultVal: () => true,
  },

  // ── 6. Permissions, Governance & Enterprise Workflows ──
  {
    key: 'advancedPermissionMatrix',
    section: 'enterprise',
    title: 'Advanced 88-Permission Matrix & Role Templates',
    description: 'Enable the full 88-checkbox granular permission matrix and custom role templates. Disable to use simple basic role switches.',
    icon: ShieldCheck,
    badge: 'Inzan',
    defaultVal: () => true,
  },
  {
    key: 'commercialGymWorkspaces',
    section: 'enterprise',
    title: 'Departmental Org Structure & Job Titles',
    description: 'Enable commercial gym departments (Sales, Fitness, Experience, Finance, Operations) and specialized staff job titles.',
    icon: Briefcase,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'fitnessAssessmentQueue',
    section: 'enterprise',
    title: 'Fitness Manager Triage & Assessment Queue',
    description: 'Route new member PT assessments to the Fitness Manager Triage Board for 1-click coach assignment and conversion analytics.',
    icon: UserCheck,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'customMemberProfile',
    section: 'enterprise',
    title: 'Enhanced Commercial Member Profile (360° View)',
    description: 'Use the rich commercial gym member profile layout with contract snapshots, benefits bars, and multi-department tabs.',
    icon: UserPlus,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'repLocking',
    section: 'enterprise',
    title: 'Strict Sales Rep Ownership Locking',
    description: 'Lock assigned sales reps on member profiles and renewals so only Sales Managers/Admins can reassign ownership.',
    icon: Lock,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'shiftHandover',
    section: 'enterprise',
    title: 'Front-Desk Shift Handover & Cash Drawer Audit',
    description: 'Enable morning/evening/night shift cash drawer counting, Instapay/card reconciliation, and discrepancy logging.',
    icon: CreditCard,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'twoPersonApproval',
    section: 'enterprise',
    title: 'Two-Person Approval Rule for Sensitive Edits',
    description: 'Require manager approval before non-admin staff can delete records, backdate packages, or issue refunds.',
    icon: Shield,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
  {
    key: 'redgitsMigration',
    section: 'enterprise',
    title: 'RedGITS Cloud Sync & Legacy CSV Migration Center',
    description: 'Show the RedGITS live cloud sync and bulk CSV import tools in the Admin Hub.',
    icon: Database,
    badge: 'Inzan',
    defaultVal: (isInzan) => isInzan,
  },
];

const SECTIONS: { id: FeatureSectionId; title: string; subtitle: string; accent: string }[] = [
  {
    id: 'core',
    title: '1. Core CRM & Staff Modules',
    subtitle: 'Primary navigation tabs and daily staff workspaces.',
    accent: 'text-sky-500',
  },
  {
    id: 'packages',
    title: '2. Packages, Billing & Financial Controls',
    subtitle: 'Primary/Secondary package logic, benefits engine, split-tender POS, and accounting queues.',
    accent: 'text-emerald-500',
  },
  {
    id: 'club',
    title: "3. Club Operations, Kitchen, Lockers & Hardware",
    subtitle: "Earth's Kitchen / Juice Bar, inventory, standard or hardware smart lockers, and turnstiles.",
    accent: 'text-orange-500',
  },
  {
    id: 'member',
    title: '4. Member App, Wallet, Gamification & Smart PWA',
    subtitle: 'Member-facing mobile features, digital wallet, loyalty points, and forced home-screen installer.',
    accent: 'text-violet-500',
  },
  {
    id: 'premium',
    title: '5. Telephony, WhatsApp Broadcasts & Premium Add-Ons',
    subtitle: 'Click-to-Call, Twilio WhatsApp/SMS broadcasts, Call Center, and member feedback modules.',
    accent: 'text-amber-500',
  },
  {
    id: 'enterprise',
    title: '6. Permissions, Governance & Enterprise Workflows',
    subtitle: '88-Permission Matrix vs Basic Roles, Fitness Manager triage, 7-stage pipeline, and rep locking.',
    accent: 'text-rose-500',
  },
];

export default function AdminHub() {
  const { branding, features, updateFeatures, bookingWindow, updateBookingWindow } = useSettings();
  const isInzanTenant = isTenantInzan(branding.companyName) || getTenantId().toLowerCase().includes('inzan');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeSectionFilter, setActiveSectionFilter] = useState<FeatureSectionId | 'all'>('all');

  // Build local feature map from current context features
  const buildFeatureMap = (source: FeatureFlags): Record<string, boolean> => {
    const map: Record<string, boolean> = {};
    for (const def of FEATURE_DEFINITIONS) {
      const rawVal = source[def.key];
      if (typeof rawVal === 'boolean') {
        map[def.key] = rawVal;
      } else {
        map[def.key] = def.defaultVal(isInzanTenant);
      }
    }
    return map;
  };

  const [localFeatures, setLocalFeatures] = useState<Record<string, boolean>>(() => buildFeatureMap(features));
  const [salesPipelineStages, setSalesPipelineStages] = useState<'5-stage' | '7-stage'>(
    features.salesPipelineStages || (isInzanTenant ? '7-stage' : '5-stage')
  );
  const [defaultCutoffMinutes, setDefaultCutoffMinutes] = useState(bookingWindow?.defaultCutoffMinutes ?? 120);
  const [allowWalkInsViaAdminOnly, setAllowWalkInsViaAdminOnly] = useState(bookingWindow?.allowWalkInsViaAdminOnly !== false);

  // Sync local state whenever Firestore settings update
  useEffect(() => {
    setLocalFeatures(buildFeatureMap(features));
    if (features.salesPipelineStages) {
      setSalesPipelineStages(features.salesPipelineStages);
    }
  }, [features, isInzanTenant]);

  useEffect(() => {
    if (bookingWindow) {
      setDefaultCutoffMinutes(bookingWindow.defaultCutoffMinutes ?? 120);
      setAllowWalkInsViaAdminOnly(bookingWindow.allowWalkInsViaAdminOnly !== false);
    }
  }, [bookingWindow]);

  const toggleFlag = (key: keyof FeatureFlags, val: boolean) => {
    setLocalFeatures((prev) => ({ ...prev, [key]: val }));
  };

  // Preset 1: Vanilla STRIKE (Clean Boutique Gym — Primary Package Only, Basic Permissions, Core CRM)
  const applyVanillaStrikePreset = () => {
    setLocalFeatures({
      leads: true,
      ptPackages: true,
      payments: true,
      attendance: true,
      workoutLibrary: false,
      classBookingSystem: true,
      nutrition: false,
      tasks: true,
      bookings: true,
      requests: true,
      pendingApprovals: false,
      reports: true,
      quotes: true,
      // Packages & Billing
      secondaryPackages: false,
      packageBenefitsEngine: false,
      splitTenderPayments: false,
      corporateDiscounts: false,
      debtors: true,
      unconfirmedMemberships: false,
      frozenMembers: true,
      // Club Ops
      operations: true,
      juiceBar: false,
      kitchenInventory: false,
      locker: false,
      inzanSmartLockers: false,
      guestInvites: true,
      turnstileGateControl: false,
      webcamPhotoCapture: false,
      // Member App
      mobileApp: true,
      qrCheckin: true,
      wallet: false,
      pointsSystem: true,
      coachPortal: true,
      smartPwaInstaller: true,
      appQrGenerator: true,
      // Premium & Comms
      clickToCall: false,
      twilioBroadcasts: false,
      callCenter: false,
      advancedReports: false,
      lostAndFound: false,
      complaints: false,
      surveys: false,
      serviceCategoryTargets: false,
      // Enterprise
      advancedPermissionMatrix: false,
      commercialGymWorkspaces: false,
      fitnessAssessmentQueue: false,
      customMemberProfile: false,
      repLocking: false,
      shiftHandover: false,
      twoPersonApproval: false,
      redgitsMigration: false,
    });
    setSalesPipelineStages('5-stage');
  };

  // Preset 2: Full Enterprise INZAN (All 45+ Features Enabled)
  const applyFullEnterprisePreset = () => {
    const next: Record<string, boolean> = {};
    for (const def of FEATURE_DEFINITIONS) {
      next[def.key] = true;
    }
    setLocalFeatures(next);
    setSalesPipelineStages('7-stage');
  };

  const handleSave = async () => {
    setIsLoading(true);
    setSuccess(false);
    setError('');
    try {
      const payload: Partial<FeatureFlags> = {
        ...(localFeatures as Partial<FeatureFlags>),
        salesPipelineStages,
      };
      await updateFeatures(payload);
      await updateBookingWindow({
        defaultCutoffMinutes: Number(defaultCutoffMinutes) || 120,
        allowWalkInsViaAdminOnly,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to save feature settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const enabledCount = useMemo(
    () => FEATURE_DEFINITIONS.filter((d) => localFeatures[d.key]).length,
    [localFeatures]
  );

  const filteredDefinitions = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return FEATURE_DEFINITIONS.filter((def) => {
      if (activeSectionFilter !== 'all' && def.section !== activeSectionFilter) return false;
      if (!q) return true;
      return (
        def.title.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.key.toLowerCase().includes(q)
      );
    });
  }, [searchFilter, activeSectionFilter]);

  return (
    <div className="space-y-6">
      {/* Header & Quick Presets */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8 text-amber-500" />
            Platform Admin Hub
            <Badge variant="outline" className="ml-2 text-xs font-mono border-amber-500/40 text-amber-500">
              {enabledCount} / {FEATURE_DEFINITIONS.length} Active
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm">
            Complete modular control over every feature, workspace, hardware bridge, and billing rule for this gym tenant.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={applyVanillaStrikePreset}
            disabled={isLoading}
            className="h-9 text-xs font-bold rounded-xl border-border hover:bg-muted cursor-pointer"
            title="Primary package only, basic permissions, no kitchen/lockers/wallet/click-to-call"
          >
            Load Vanilla Preset (STRIKE Classic)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={applyFullEnterprisePreset}
            disabled={isLoading}
            className="h-9 text-xs font-bold rounded-xl border-amber-500/40 text-amber-500 hover:bg-amber-500/10 cursor-pointer"
            title="Enable all Inzan Athletics enterprise modules, 88-permission matrix, secondary packages, kitchen, lockers, WhatsApp & Click-to-Call"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Load Full Enterprise Preset (INZAN All-In)
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="font-bold gap-2 rounded-xl h-9 px-5 bg-amber-500 hover:bg-amber-600 text-black shadow-md cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {isLoading ? 'Saving...' : 'Apply Feature Plan'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Features Config Column */}
        <Card className="lg:col-span-2 border-border/50 shadow-md">
          <CardHeader className="space-y-4 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg font-bold">Global Feature Gateways</CardTitle>
                <CardDescription>
                  Enable or disable individual system modules on demand. Changes take effect immediately upon saving.
                </CardDescription>
              </div>
            </div>

            {/* Search & Section Filter Bar */}
            <div className="space-y-3 pt-1">
              <div className="relative">
                <SearchIcon className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search features (e.g. Workout Library, Secondary Package, Wallet, Kitchen, Lockers, Click to Call, WhatsApp, Permissions)..."
                  className="pl-9 h-10 text-xs rounded-xl bg-muted/30"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                <button
                  type="button"
                  onClick={() => setActiveSectionFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    activeSectionFilter === 'all'
                      ? 'bg-amber-500 text-black'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All ({FEATURE_DEFINITIONS.length})
                </button>
                {SECTIONS.map((sec) => {
                  const count = FEATURE_DEFINITIONS.filter((d) => d.section === sec.id).length;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setActiveSectionFilter(sec.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        activeSectionFilter === sec.id
                          ? 'bg-amber-500 text-black font-bold'
                          : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {sec.title.replace(/^\d+\.\s*/, '').split(',')[0]} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-8">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="bg-emerald-950/20 border-emerald-500/30 text-emerald-400">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                <AlertDescription>Feature configurations updated and applied across the tenant!</AlertDescription>
              </Alert>
            )}

            {SECTIONS.map((section) => {
              const items = filteredDefinitions.filter((d) => d.section === section.id);
              if (items.length === 0) return null;

              const allSectionEnabled = items.every((i) => localFeatures[i.key]);

              return (
                <div key={section.id} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <div>
                      <h3 className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${section.accent}`}>
                        <Star className="h-4 w-4 fill-current" />
                        {section.title}
                      </h3>
                      <p className="text-xs text-muted-foreground">{section.subtitle}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isLoading}
                      onClick={() => {
                        const nextVal = !allSectionEnabled;
                        setLocalFeatures((prev) => {
                          const updated = { ...prev };
                          items.forEach((i) => {
                            updated[i.key] = nextVal;
                          });
                          return updated;
                        });
                      }}
                      className="h-7 text-[11px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {allSectionEnabled ? 'Disable Section' : 'Enable Section'}
                    </Button>
                  </div>

                  <div className="divide-y divide-border/60">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const isChecked = Boolean(localFeatures[item.key]);

                      return (
                        <React.Fragment key={item.key}>
                          <div className="flex items-center justify-between py-3.5 gap-4">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={`p-2 rounded-lg mt-0.5 shrink-0 ${isChecked ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Label
                                    className="font-bold text-sm cursor-pointer"
                                    onClick={() => toggleFlag(item.key, !isChecked)}
                                  >
                                    {item.title}
                                  </Label>
                                  {item.badge && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-500 font-semibold">
                                      {item.badge}
                                    </Badge>
                                  )}
                                  <Badge
                                    variant={isChecked ? 'default' : 'secondary'}
                                    className={`text-[10px] px-1.5 py-0 h-4 ${
                                      isChecked ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'text-muted-foreground'
                                    }`}
                                  >
                                    {isChecked ? 'Enabled' : 'Disabled'}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                  {item.description}
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={isChecked}
                              onCheckedChange={(val) => toggleFlag(item.key, val)}
                              disabled={isLoading}
                            />
                          </div>

                          {/* Sub-configuration for Class Booking Cutoff Window */}
                          {item.key === 'classBookingSystem' && isChecked && (
                            <div className="ml-11 mb-4 p-4 bg-muted/40 rounded-xl border space-y-3">
                              <div>
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  Mobile App Booking Cutoff Window
                                </Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Restricts clients from booking classes within this lead-time window before session start.
                                </p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                                <div>
                                  <Label className="text-xs font-semibold">Cutoff Lead Time (Minutes)</Label>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={1440}
                                      step={15}
                                      value={defaultCutoffMinutes}
                                      onChange={(e) => setDefaultCutoffMinutes(Number(e.target.value))}
                                      className="w-28 h-9 text-xs"
                                      disabled={isLoading}
                                    />
                                    <div className="flex items-center gap-1">
                                      {[90, 120].map((mins) => (
                                        <Button
                                          key={mins}
                                          type="button"
                                          variant={defaultCutoffMinutes === mins ? 'default' : 'outline'}
                                          size="sm"
                                          className="h-9 text-xs px-2.5"
                                          onClick={() => setDefaultCutoffMinutes(mins)}
                                          disabled={isLoading}
                                        >
                                          {mins}m ({mins / 60}h)
                                        </Button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between sm:justify-start sm:gap-4 pt-4 sm:pt-0">
                                  <div>
                                    <Label className="text-xs font-semibold">Allow Walk-Ins via CRM Only</Label>
                                    <p className="text-[11px] text-muted-foreground">Front-desk staff can bypass cutoff window</p>
                                  </div>
                                  <Switch
                                    checked={allowWalkInsViaAdminOnly}
                                    onCheckedChange={setAllowWalkInsViaAdminOnly}
                                    disabled={isLoading}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Sub-configuration for Leads Sales Pipeline Mode (5-stage vs 7-stage) */}
                          {item.key === 'leads' && isChecked && (
                            <div className="ml-11 mb-4 p-3.5 bg-muted/40 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  Sales Pipeline Stage Model
                                </Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Choose between Classic 5-Stage (New → Trial → Converted) or Commercial 7-Stage (New → Contacted → Qualified → Trial/Visit → Proposal → Won).
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={salesPipelineStages === '5-stage' ? 'default' : 'outline'}
                                  className="h-8 text-xs font-bold"
                                  onClick={() => setSalesPipelineStages('5-stage')}
                                  disabled={isLoading}
                                >
                                  5-Stage (Vanilla)
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={salesPipelineStages === '7-stage' ? 'default' : 'outline'}
                                  className="h-8 text-xs font-bold"
                                  onClick={() => setSalesPipelineStages('7-stage')}
                                  disabled={isLoading}
                                >
                                  7-Stage (Enterprise)
                                </Button>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end pt-4 border-t border-border">
              <Button
                onClick={handleSave}
                className="font-bold gap-2 rounded-xl h-11 px-6 bg-amber-500 hover:bg-amber-600 text-black shadow-md cursor-pointer flex items-center justify-center"
                disabled={isLoading}
              >
                <Save className="h-4 w-4" />
                {isLoading ? 'Saving...' : 'Apply Feature Plan'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tenant Info Column */}
        <div className="space-y-6">
          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Tenant Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Database ID</span>
                <p className="font-mono text-sm font-bold bg-muted p-2 rounded border border-border">
                  {activeConfig.firestoreDatabaseId || '(default)'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Project ID</span>
                <p className="font-mono text-sm bg-muted p-2 rounded border border-border">
                  {activeConfig.projectId}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Active Modules</span>
                <p className="text-sm font-bold bg-muted p-2 rounded border border-border flex items-center justify-between">
                  <span>Enabled Features</span>
                  <span className="text-amber-500 font-mono">{enabledCount} / {FEATURE_DEFINITIONS.length}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {(isInzanTenant || localFeatures.redgitsMigration) && (
            <Card className="border-amber-500/30 shadow-md bg-amber-500/5">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Database className="h-5 w-5 text-amber-500" />
                  RedGITS v17.12 Migration Center
                </CardTitle>
                <CardDescription>
                  One-click CSV / Excel migration for active members, printed barcode IDs, remaining sessions, freeze quotas, unpaid debt installments, and sales leads.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-2">
                  <div className="text-xs text-emerald-300 font-semibold">
                    Live Cloud Sync (Direct from inzan.redgits.com → db-inzanathletics)
                  </div>
                  <div>
                    <RedgitsLiveSyncDialog variant="admin-card" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <ImportData type="Active" />
                  <ImportData type="Lead" />
                </div>
                <div className="pt-2 border-t border-border/50">
                  <ImportHistory />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
