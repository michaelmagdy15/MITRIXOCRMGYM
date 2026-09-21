import { PermissionCategory, PermissionDefinition, PermissionTemplate, User, UserRole } from '../types';

export interface CategoryMetadata {
  id: PermissionCategory;
  label: string;
  description: string;
  iconName: string;
}

export const PERMISSION_CATEGORIES: CategoryMetadata[] = [
  {
    id: 'dashboard',
    label: 'Dashboard & Financial Analytics',
    description: 'Control access to high-level KPIs, revenue totals, sales leaderboards, and branch trends.',
    iconName: 'LayoutDashboard'
  },
  {
    id: 'payments',
    label: 'Payments & Billing',
    description: 'Manage point-of-sale checkout, payment records, edits, deletions, refunds, discounts, and receipts.',
    iconName: 'CreditCard'
  },
  {
    id: 'members',
    label: 'Members & Profiles',
    description: 'Client database management, profile editing, package assignment, balance adjustments, and freeze periods.',
    iconName: 'Users'
  },
  {
    id: 'leads',
    label: 'Leads & Sales Pipeline',
    description: 'Inbound sales inquiries, lead assignment, stage transitions, conversion to member, and follow-ups.',
    iconName: 'UserPlus'
  },
  {
    id: 'attendance',
    label: 'Attendance & Front Desk Check-in',
    description: 'Access gate control, QR / RFID / barcode check-in, guest drop-ins, and manual overrides.',
    iconName: 'Scan'
  },
  {
    id: 'classes',
    label: 'Classes & Group Schedules',
    description: 'Class timetable scheduling, attendee bookings, capacity overrides, rosters, and attendance marking.',
    iconName: 'Target'
  },
  {
    id: 'coaches',
    label: 'Coaches & Personal Training',
    description: 'Trainer directory, PT session scheduling, completion deductions, and coach commission payouts.',
    iconName: 'Award'
  },
  {
    id: 'packages',
    label: 'Packages & Pricing Catalog',
    description: 'Membership and PT package catalog configuration, pricing rules, and branch validity.',
    iconName: 'Package'
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    description: 'Standard and advanced financial reports, CSV/Excel/PDF exports, and security audit trails.',
    iconName: 'BarChart3'
  },
  {
    id: 'operations',
    label: 'Club Operations',
    description: 'Juice bar POS, locker rentals, lost & found, call center queue, complaints, and shift handover.',
    iconName: 'Coffee'
  },
  {
    id: 'settings',
    label: 'Settings & Administration',
    description: 'Branding, branch management, staff accounts, permission templates, and system tools.',
    iconName: 'Settings'
  }
];

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // 1. DASHBOARD
  {
    key: 'dashboard.view',
    label: 'View Dashboard',
    description: 'Access the main overview dashboard and basic operational stats.',
    category: 'dashboard'
  },
  {
    key: 'dashboard.view_financials',
    label: 'View Financial Totals',
    description: 'View total revenue cards, cash, card, Instapay, and bank transfer breakdowns.',
    category: 'dashboard'
  },
  {
    key: 'dashboard.view_global',
    label: 'View All Branches (Global)',
    description: 'View combined gym figures across all branches rather than user-assigned branch only.',
    category: 'dashboard'
  },
  {
    key: 'dashboard.view_rep_breakdown',
    label: 'View Sales Leaderboard',
    description: 'View individual sales representatives conversion metrics and leaderboard.',
    category: 'dashboard'
  },
  {
    key: 'dashboard.view_attendance_trends',
    label: 'View Attendance Analytics',
    description: 'View peak hours, check-in heatmaps, and hourly gym floor occupancy trends.',
    category: 'dashboard'
  },
  {
    key: 'dashboard.view_retention_metrics',
    label: 'View Retention & Expiry Stats',
    description: 'View renewal cohorts, churn rates, and expiring membership timelines.',
    category: 'dashboard'
  },
  {
    key: 'dashboard.export_stats',
    label: 'Export Dashboard Analytics',
    description: 'Export dashboard visual summaries and aggregated KPI tables.',
    category: 'dashboard'
  },

  // 2. PAYMENTS & BILLING
  {
    key: 'payments.view',
    label: 'View Payments Tab',
    description: 'Access payment transaction history and daily receipts.',
    category: 'payments'
  },
  {
    key: 'payments.view_all_branches',
    label: 'View All Branch Payments',
    description: 'View transactions collected across every branch location.',
    category: 'payments'
  },
  {
    key: 'payments.create',
    label: 'Record New Payments',
    description: 'Process checkout and record membership and package payments.',
    category: 'payments'
  },
  {
    key: 'payments.create_guest',
    label: 'Record Guest Drop-ins',
    description: 'Collect drop-in day passes and walk-in trial session fees.',
    category: 'payments'
  },
  {
    key: 'payments.edit',
    label: 'Edit Payment Details',
    description: 'Update payment notes, payment methods, attribution, and payment dates.',
    category: 'payments'
  },
  {
    key: 'payments.edit_amount',
    label: 'Edit Payment Amounts',
    description: 'Modify the numerical price or cash collected on existing payment records.',
    category: 'payments'
  },
  {
    key: 'payments.delete',
    label: 'Delete & Void Payments',
    description: 'Permanently remove or void payment records (formerly can_delete_payments).',
    category: 'payments'
  },
  {
    key: 'payments.refund',
    label: 'Process & Approve Refunds',
    description: 'Issue partial or full payment refunds and reverse package activations.',
    category: 'payments'
  },
  {
    key: 'payments.apply_discount',
    label: 'Apply Custom Discounts',
    description: 'Override standard pricing with manual percentage or fixed monetary discounts.',
    category: 'payments'
  },
  {
    key: 'payments.hold_freeze',
    label: 'Freeze / Hold Payments',
    description: 'Place payment packages on administrative hold.',
    category: 'payments'
  },
  {
    key: 'payments.release_hold',
    label: 'Release Payment Holds',
    description: 'Unfreeze payment packages and resume membership counting.',
    category: 'payments'
  },
  {
    key: 'payments.upgrade',
    label: 'Process Package Upgrades',
    description: 'Transfer remaining package balance towards upgraded higher-tier packages.',
    category: 'payments'
  },
  {
    key: 'payments.print_receipt',
    label: 'Print & Share Receipts',
    description: 'Generate, download, and print official gym invoice receipts for clients.',
    category: 'payments'
  },
  {
    key: 'payments.view_branch_totals',
    label: 'View Branch Revenue Cards',
    description: 'View individual branch revenue sub-totals in the payments tab.',
    category: 'payments'
  },
  {
    key: 'payments.export',
    label: 'Export Payment Records',
    description: 'Export financial transactions to CSV, Excel, and accounting files.',
    category: 'payments'
  },

  // 3. MEMBERS & CLIENT PROFILES
  {
    key: 'members.view',
    label: 'View Members Directory',
    description: 'Access the main members list and client profile overview cards.',
    category: 'members'
  },
  {
    key: 'members.view_all_branches',
    label: 'View All Branch Members',
    description: 'View members regardless of which home branch they registered at.',
    category: 'members'
  },
  {
    key: 'members.view_contact_info',
    label: 'View Contact Information',
    description: 'View unmasked phone numbers, email addresses, and emergency contacts.',
    category: 'members'
  },
  {
    key: 'members.create',
    label: 'Register New Members',
    description: 'Create new member profiles and add client records to the system.',
    category: 'members'
  },
  {
    key: 'members.edit_profile',
    label: 'Edit Member Details',
    description: 'Update name, date of birth, gender, home branch, and custom tags.',
    category: 'members'
  },
  {
    key: 'members.edit_status',
    label: 'Change Member Status',
    description: 'Manually set status between Active, Expired, Hold, and Inactive.',
    category: 'members'
  },
  {
    key: 'members.delete',
    label: 'Delete Member Records',
    description: 'Permanently delete member accounts and historical profile data.',
    category: 'members'
  },
  {
    key: 'members.manage_packages',
    label: 'Assign & Renew Packages',
    description: 'Attach new membership or PT packages directly to a member account.',
    category: 'members'
  },
  {
    key: 'members.adjust_balances',
    label: 'Adjust Session Balances',
    description: 'Perform manual session balance credits/deductions with mandatory audit notes.',
    category: 'members'
  },
  {
    key: 'members.freeze',
    label: 'Apply Membership Freeze',
    description: 'Set temporary membership pause windows (travel, medical, personal).',
    category: 'members'
  },
  {
    key: 'members.create_portal_account',
    label: 'Create Portal Accounts',
    description: 'Provision member portal login accounts and mobile app access.',
    category: 'members'
  },
  {
    key: 'members.reset_password',
    label: 'Reset Member Password',
    description: 'Trigger password resets or update credentials for member portal logins.',
    category: 'members'
  },
  {
    key: 'members.assign_rfid',
    label: 'Assign RFID & Access Tags',
    description: 'Pair RFID key fobs, wristbands, or NFC tags to member profiles.',
    category: 'members'
  },
  {
    key: 'members.log_interactions',
    label: 'Log CRM Interactions & Notes',
    description: 'Write follow-up notes, phone call summaries, and member history comments.',
    category: 'members'
  },
  {
    key: 'members.export',
    label: 'Export Member Directory',
    description: 'Export member contact lists, active counts, and expiry lists.',
    category: 'members'
  },

  // 4. LEADS & SALES PIPELINE
  {
    key: 'leads.view_all',
    label: 'View All Gym Leads',
    description: 'View all prospective inquiries across all sales reps and branches.',
    category: 'leads'
  },
  {
    key: 'leads.view_assigned_only',
    label: 'View Assigned Leads Only',
    description: 'Restrict lead visibility strictly to inquiries assigned to the current user.',
    category: 'leads'
  },
  {
    key: 'leads.view_contact_info',
    label: 'View Lead Contact Info',
    description: 'View prospective lead phone numbers, WhatsApp links, and emails.',
    category: 'leads'
  },
  {
    key: 'leads.create',
    label: 'Add Prospective Leads',
    description: 'Record new lead inquiries from walk-ins, phone calls, or social campaigns.',
    category: 'leads'
  },
  {
    key: 'leads.import_bulk',
    label: 'Bulk Import Leads',
    description: 'Upload lead spreadsheets (CSV / Excel) into the CRM pipeline.',
    category: 'leads'
  },
  {
    key: 'leads.edit',
    label: 'Edit Lead Details',
    description: 'Update lead pipeline stage, interests, follow-up dates, and notes.',
    category: 'leads'
  },
  {
    key: 'leads.assign',
    label: 'Assign / Distribute Leads',
    description: 'Reassign leads between sales representatives (formerly can_assign_leads).',
    category: 'leads'
  },
  {
    key: 'leads.convert',
    label: 'Convert Lead to Member',
    description: 'Promote qualified leads into active registered gym members.',
    category: 'leads'
  },
  {
    key: 'leads.delete',
    label: 'Delete Leads',
    description: 'Archive or permanently delete unqualified lead records.',
    category: 'leads'
  },
  {
    key: 'leads.export',
    label: 'Export Leads',
    description: 'Export leads and sales pipeline activity to CSV / Excel.',
    category: 'leads'
  },

  // 5. ATTENDANCE & CHECK-IN
  {
    key: 'attendance.view',
    label: 'View Attendance Logs',
    description: 'View real-time check-in stream and historical entry records.',
    category: 'attendance'
  },
  {
    key: 'attendance.checkin',
    label: 'Check-in Members',
    description: 'Perform check-in via search, barcode, RFID card, or QR scan.',
    category: 'attendance'
  },
  {
    key: 'attendance.checkin_guests',
    label: 'Check-in Drop-in Guests',
    description: 'Record trial participants and walk-in guest check-ins.',
    category: 'attendance'
  },
  {
    key: 'attendance.override_restrictions',
    label: 'Override Check-in Blocks',
    description: 'Admit members with expired, frozen, unpaid, or restricted access.',
    category: 'attendance'
  },
  {
    key: 'attendance.edit_records',
    label: 'Edit Attendance History',
    description: 'Correct timestamps or void mistaken check-in entries.',
    category: 'attendance'
  },
  {
    key: 'attendance.view_live_count',
    label: 'View Live Occupancy',
    description: 'Monitor real-time headcount on the gym floor across locations.',
    category: 'attendance'
  },
  {
    key: 'attendance.export',
    label: 'Export Attendance Data',
    description: 'Export check-in and attendance logs for auditing and reports.',
    category: 'attendance'
  },

  // 6. CLASSES & GROUP SCHEDULES
  {
    key: 'classes.view',
    label: 'View Class Timetables',
    description: 'Access the gym class schedules, timetables, and upcoming sessions.',
    category: 'classes'
  },
  {
    key: 'classes.manage_schedule',
    label: 'Create & Edit Classes',
    description: 'Build recurring schedules, assign instructors, and set room capacities.',
    category: 'classes'
  },
  {
    key: 'classes.cancel_class',
    label: 'Cancel Class Slots',
    description: 'Cancel scheduled class slots and trigger automated cancellation alerts.',
    category: 'classes'
  },
  {
    key: 'classes.book_member',
    label: 'Book Member into Class',
    description: 'Reserve class slots on behalf of gym members from the admin panel.',
    category: 'classes'
  },
  {
    key: 'classes.cancel_booking',
    label: 'Cancel Member Booking',
    description: 'Remove members from class rosters and manage waitlist auto-promotion.',
    category: 'classes'
  },
  {
    key: 'classes.override_capacity',
    label: 'Override Class Capacity',
    description: 'Force booking members into classes that have already reached maximum capacity.',
    category: 'classes'
  },
  {
    key: 'classes.view_roster',
    label: 'View Class Rosters',
    description: 'View registered member lists and attendee counts for each class.',
    category: 'classes'
  },
  {
    key: 'classes.mark_attendance',
    label: 'Mark Class Attendance',
    description: 'Check off member presence or mark no-shows during class sessions.',
    category: 'classes'
  },

  // 7. COACHES & PERSONAL TRAINING
  {
    key: 'coaches.view',
    label: 'View Coach Directory',
    description: 'View coach profiles, bio descriptions, and specialty tags.',
    category: 'coaches'
  },
  {
    key: 'coaches.manage_profiles',
    label: 'Manage Coach Profiles',
    description: 'Add new trainers, edit working hours, and deactivate coach accounts.',
    category: 'coaches'
  },
  {
    key: 'coaches.schedule_pt',
    label: 'Schedule PT Sessions',
    description: 'Book 1-on-1, Partner, and Small Group training appointments.',
    category: 'coaches'
  },
  {
    key: 'coaches.cancel_pt',
    label: 'Cancel / Reschedule PT',
    description: 'Reschedule or cancel scheduled PT sessions.',
    category: 'coaches'
  },
  {
    key: 'coaches.complete_pt',
    label: 'Complete PT Sessions',
    description: 'Mark PT sessions completed and deduct sessions from client balances.',
    category: 'coaches'
  },
  {
    key: 'coaches.view_payouts',
    label: 'View Trainer Payouts',
    description: 'View coach commission calculations, completed hours, and payout tabs.',
    category: 'coaches'
  },
  {
    key: 'coaches.edit_payout_rates',
    label: 'Edit Payout & Commission Rates',
    description: 'Configure trainer compensation rates, tiered payouts, and per-session fees.',
    category: 'coaches'
  },

  // 8. PACKAGES & PRICING CATALOG
  {
    key: 'packages.view',
    label: 'View Packages Catalog',
    description: 'Browse available gym memberships, PT packages, and pass options.',
    category: 'packages'
  },
  {
    key: 'packages.create',
    label: 'Create New Packages',
    description: 'Create membership plans with session counts, validity days, and pricing.',
    category: 'packages'
  },
  {
    key: 'packages.edit',
    label: 'Edit Package Details',
    description: 'Update prices, validity durations, branch eligibility, and descriptions.',
    category: 'packages'
  },
  {
    key: 'packages.delete',
    label: 'Archive / Delete Packages',
    description: 'Deactivate or delete outdated packages from the catalog.',
    category: 'packages'
  },

  // 9. REPORTS & ANALYTICS
  {
    key: 'reports.view_basic',
    label: 'View Standard Reports',
    description: 'Access core gym activity, attendance summaries, and daily revenue reports.',
    category: 'reports'
  },
  {
    key: 'reports.view_advanced',
    label: 'View Advanced & Cohort Reports',
    description: 'Access executive analytics, retention curves, and revenue forecasting.',
    category: 'reports'
  },
  {
    key: 'reports.export_csv',
    label: 'Export CSV Data',
    description: 'Download raw data tables in CSV format.',
    category: 'reports'
  },
  {
    key: 'reports.export_pdf',
    label: 'Export PDF Reports',
    description: 'Generate branded PDF summary documents for management presentation.',
    category: 'reports'
  },
  {
    key: 'reports.export_excel',
    label: 'Export Excel (.xlsx)',
    description: 'Export styled multi-sheet Excel spreadsheets.',
    category: 'reports'
  },
  {
    key: 'reports.view_audit_logs',
    label: 'View Security Audit Trail',
    description: 'Inspect system change logs: who modified payments, members, or settings.',
    category: 'reports'
  },
  {
    key: 'reports.view_user_performance',
    label: 'View Staff Performance',
    description: 'View sales representative closing ratios and individual target completion.',
    category: 'reports'
  },

  // 10. CLUB OPERATIONS
  {
    key: 'operations.pos_juice_bar',
    label: 'Juice Bar & Merchandise POS',
    description: 'Record food, beverage, supplement, and pro-shop retail sales.',
    category: 'operations'
  },
  {
    key: 'operations.lockers',
    label: 'Locker Management',
    description: 'Assign, rent, inspect, and release gym member lockers.',
    category: 'operations'
  },
  {
    key: 'operations.lost_found',
    label: 'Lost & Found Registry',
    description: 'Log recovered gym floor items, track claims, and verify returns.',
    category: 'operations'
  },
  {
    key: 'operations.call_center',
    label: 'Call Center & Telephony',
    description: 'Access call center queues, daily call tasks, and contact outcomes.',
    category: 'operations'
  },
  {
    key: 'operations.complaints',
    label: 'Member Complaints & SLAs',
    description: 'Log member tickets, manage SLA resolution timers, and escalate to managers.',
    category: 'operations'
  },
  {
    key: 'operations.shift_handover',
    label: 'Shift Handover & Cash Drawer',
    description: 'Complete end-of-shift cash drawer reconciliations and notes.',
    category: 'operations'
  },
  {
    key: 'operations.manage_inventory',
    label: 'Manage Operations Inventory',
    description: 'Update stock levels, reorder alerts, and retail item catalog.',
    category: 'operations'
  },

  // 11. SETTINGS & ADMINISTRATION
  {
    key: 'settings.access',
    label: 'Access Settings Portal',
    description: 'Open the main system settings and configuration panel.',
    category: 'settings'
  },
  {
    key: 'settings.branding',
    label: 'Edit Gym Branding',
    description: 'Change gym logos, brand colors, club name, and portal hero assets.',
    category: 'settings'
  },
  {
    key: 'settings.branches',
    label: 'Manage Gym Branches',
    description: 'Add new locations, modify branch addresses, and configure branch gates.',
    category: 'settings'
  },
  {
    key: 'settings.manage_users',
    label: 'Manage Staff Accounts',
    description: 'Invite new staff, edit accounts, set roles, and manage passwords.',
    category: 'settings'
  },
  {
    key: 'settings.manage_permissions',
    label: 'Manage Permission Templates',
    description: 'Create, edit, clone, and configure granular permission templates.',
    category: 'settings'
  },
  {
    key: 'settings.assign_templates',
    label: 'Assign User Permissions',
    description: 'Assign templates and configure custom permission overrides on staff users.',
    category: 'settings'
  },
  {
    key: 'settings.booking_rules',
    label: 'Configure Booking Rules',
    description: 'Set booking lead times, cancellation deadlines, and penalty policies.',
    category: 'settings'
  },
  {
    key: 'settings.system_tools',
    label: 'System Maintenance & Tools',
    description: 'Run package recalculation, data repair, cache flush, and sync utilities.',
    category: 'settings'
  }
];

// Helper lookup map for all permissions
export const PERMISSION_BY_KEY: Record<string, PermissionDefinition> = PERMISSION_DEFINITIONS.reduce((acc, def) => {
  acc[def.key] = def;
  return acc;
}, {} as Record<string, PermissionDefinition>);

// Build an "all true" permission dictionary
export const ALL_PERMISSIONS_TRUE: Record<string, boolean> = PERMISSION_DEFINITIONS.reduce((acc, def) => {
  acc[def.key] = true;
  return acc;
}, {} as Record<string, boolean>);

// Build an "all false" permission dictionary
export const ALL_PERMISSIONS_FALSE: Record<string, boolean> = PERMISSION_DEFINITIONS.reduce((acc, def) => {
  acc[def.key] = false;
  return acc;
}, {} as Record<string, boolean>);

/**
 * Standard default permission sets for common gym staff roles.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Record<string, boolean>> = {
  super_admin: { ...ALL_PERMISSIONS_TRUE },
  crm_admin: { ...ALL_PERMISSIONS_TRUE },
  admin: { ...ALL_PERMISSIONS_TRUE },
  manager: {
    ...ALL_PERMISSIONS_TRUE,
    // Managers can do almost everything except dangerous unlogged system wipe/tools
    'settings.system_tools': false
  },
  rep: {
    ...ALL_PERMISSIONS_FALSE,
    'dashboard.view': true,
    'dashboard.view_rep_breakdown': true,
    'payments.view': true,
    'payments.create': true,
    'payments.create_guest': true,
    'payments.print_receipt': true,
    'members.view': true,
    'members.view_contact_info': true,
    'members.create': true,
    'members.edit_profile': true,
    'members.manage_packages': true,
    'members.log_interactions': true,
    'leads.view_all': true,
    'leads.view_contact_info': true,
    'leads.create': true,
    'leads.edit': true,
    'leads.convert': true,
    'attendance.view': true,
    'attendance.checkin': true,
    'classes.view': true,
    'classes.book_member': true,
    'packages.view': true,
    'reports.view_basic': true,
    'operations.call_center': true,
    'operations.complaints': true
  },
  coach: {
    ...ALL_PERMISSIONS_FALSE,
    'classes.view': true,
    'classes.view_roster': true,
    'classes.mark_attendance': true,
    'coaches.view': true,
    'coaches.schedule_pt': true,
    'coaches.cancel_pt': true,
    'coaches.complete_pt': true,
    'coaches.view_payouts': true,
    'members.view': true,
    'attendance.view': true
  },
  client: {
    ...ALL_PERMISSIONS_FALSE
  }
};

/**
 * Pre-configured Built-in System Templates that can be seeded or used directly.
 */
export const DEFAULT_SYSTEM_TEMPLATES: Omit<PermissionTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Super Admin',
    description: 'Unrestricted access to all gym branches, financial records, audit logs, and settings.',
    isSystem: true,
    baseRole: 'super_admin',
    permissions: { ...ALL_PERMISSIONS_TRUE }
  },
  {
    name: 'General Manager',
    description: 'Complete operational management, staff oversight, full financial analytics, and approvals.',
    isSystem: true,
    baseRole: 'manager',
    permissions: {
      ...ALL_PERMISSIONS_TRUE,
      'settings.system_tools': false
    }
  },
  {
    name: 'Front Desk / Receptionist',
    description: 'Check-in scanning, guest walk-ins, class bookings, member registration, locker rentals, and juice bar POS.',
    isSystem: true,
    baseRole: 'rep',
    permissions: {
      ...ALL_PERMISSIONS_FALSE,
      'dashboard.view': true,
      'dashboard.view_attendance_trends': true,
      'payments.view': true,
      'payments.create': true,
      'payments.create_guest': true,
      'payments.print_receipt': true,
      'members.view': true,
      'members.create': true,
      'members.edit_profile': true,
      'members.view_contact_info': true,
      'members.log_interactions': true,
      'members.assign_rfid': true,
      'attendance.view': true,
      'attendance.checkin': true,
      'attendance.checkin_guests': true,
      'attendance.view_live_count': true,
      'classes.view': true,
      'classes.book_member': true,
      'classes.cancel_booking': true,
      'classes.view_roster': true,
      'classes.mark_attendance': true,
      'packages.view': true,
      'operations.pos_juice_bar': true,
      'operations.lockers': true,
      'operations.lost_found': true,
      'operations.shift_handover': true
    }
  },
  {
    name: 'Sales Representative',
    description: 'Lead generation, sales pipeline follow-ups, trial bookings, and package checkout.',
    isSystem: true,
    baseRole: 'rep',
    permissions: {
      ...ALL_PERMISSIONS_FALSE,
      'dashboard.view': true,
      'dashboard.view_rep_breakdown': true,
      'payments.view': true,
      'payments.create': true,
      'payments.create_guest': true,
      'payments.print_receipt': true,
      'members.view': true,
      'members.view_contact_info': true,
      'members.create': true,
      'members.edit_profile': true,
      'members.manage_packages': true,
      'members.log_interactions': true,
      'leads.view_all': true,
      'leads.view_contact_info': true,
      'leads.create': true,
      'leads.edit': true,
      'leads.convert': true,
      'classes.view': true,
      'classes.book_member': true,
      'packages.view': true,
      'reports.view_basic': true,
      'operations.call_center': true
    }
  },
  {
    name: 'Head Coach / Fitness Director',
    description: 'Class schedule builder, trainer assignments, session rosters, and PT tracking.',
    isSystem: true,
    baseRole: 'coach',
    permissions: {
      ...ALL_PERMISSIONS_FALSE,
      'dashboard.view': true,
      'dashboard.view_attendance_trends': true,
      'members.view': true,
      'attendance.view': true,
      'attendance.checkin': true,
      'classes.view': true,
      'classes.manage_schedule': true,
      'classes.cancel_class': true,
      'classes.book_member': true,
      'classes.cancel_booking': true,
      'classes.override_capacity': true,
      'classes.view_roster': true,
      'classes.mark_attendance': true,
      'coaches.view': true,
      'coaches.manage_profiles': true,
      'coaches.schedule_pt': true,
      'coaches.cancel_pt': true,
      'coaches.complete_pt': true,
      'coaches.view_payouts': true,
      'packages.view': true,
      'reports.view_basic': true
    }
  },
  {
    name: 'Personal Trainer / Coach',
    description: 'Personal training appointments, class rosters, attendance marking, and earnings overview.',
    isSystem: true,
    baseRole: 'coach',
    permissions: {
      ...ALL_PERMISSIONS_FALSE,
      'classes.view': true,
      'classes.view_roster': true,
      'classes.mark_attendance': true,
      'coaches.view': true,
      'coaches.schedule_pt': true,
      'coaches.cancel_pt': true,
      'coaches.complete_pt': true,
      'coaches.view_payouts': true,
      'members.view': true,
      'attendance.view': true
    }
  },
  {
    name: 'Accountant / Finance Officer',
    description: 'Full financial transaction oversight, revenue reporting, bank reconciliation, receipts, and audit logs.',
    isSystem: true,
    baseRole: 'admin',
    permissions: {
      ...ALL_PERMISSIONS_FALSE,
      'dashboard.view': true,
      'dashboard.view_financials': true,
      'dashboard.view_global': true,
      'dashboard.view_rep_breakdown': true,
      'dashboard.export_stats': true,
      'payments.view': true,
      'payments.view_all_branches': true,
      'payments.edit': true,
      'payments.print_receipt': true,
      'payments.view_branch_totals': true,
      'payments.export': true,
      'packages.view': true,
      'reports.view_basic': true,
      'reports.view_advanced': true,
      'reports.export_csv': true,
      'reports.export_excel': true,
      'reports.export_pdf': true,
      'reports.view_audit_logs': true,
      'coaches.view_payouts': true,
      'operations.shift_handover': true
    }
  }
];

/**
 * Check if a user possesses a specific permission.
 * Evaluates:
 * 1. Super admin / CRM admin -> always true
 * 2. User custom explicit overrides (customPermissions)
 * 3. Assigned PermissionTemplate (permissionTemplateId)
 * 4. Default role permission set
 * 5. Legacy boolean flags (backward compatibility)
 */
export function hasPermission(
  user: User | null | undefined,
  permissionKey: string,
  templatesMap?: Record<string, PermissionTemplate>
): boolean {
  if (!user) return false;

  const role = user.role;

  // 1. Super Admins and CRM Admins have unrestricted power
  if (role === 'super_admin' || role === 'crm_admin') {
    return true;
  }

  // 2. Explicit custom user-level override takes precedence
  if (user.customPermissions && typeof user.customPermissions[permissionKey] === 'boolean') {
    return user.customPermissions[permissionKey];
  }

  // 3. Check assigned Permission Template
  if (user.permissionTemplateId && templatesMap) {
    const template = templatesMap[user.permissionTemplateId];
    if (template && template.permissions) {
      const templatePerm = template.permissions[permissionKey];
      if (typeof templatePerm === 'boolean') {
        return templatePerm;
      }
    }
  }

  // 4. Check legacy boolean flags for backward compatibility
  if (permissionKey === 'payments.delete' && typeof user.can_delete_payments === 'boolean') {
    return user.can_delete_payments;
  }
  if (permissionKey === 'dashboard.view_global' && typeof user.can_view_global_dashboard === 'boolean') {
    return user.can_view_global_dashboard;
  }
  if (permissionKey === 'settings.access' && typeof user.can_access_settings_and_history === 'boolean') {
    return user.can_access_settings_and_history;
  }
  if (permissionKey === 'reports.view_audit_logs' && typeof user.can_access_settings_and_history === 'boolean') {
    return user.can_access_settings_and_history;
  }
  if (permissionKey === 'members.delete' && (user.can_delete_records || user.can_delete_payments)) {
    return true;
  }
  if (permissionKey === 'leads.assign' && (user.can_assign_leads || user.can_access_settings_and_history)) {
    return true;
  }

  // 5. Check role-based template defaults
  const roleDefaults = DEFAULT_ROLE_PERMISSIONS[role];
  if (roleDefaults && typeof roleDefaults[permissionKey] === 'boolean') {
    return roleDefaults[permissionKey];
  }

  // Managers default to true for general features unless restricted
  if (role === 'manager' || role === 'admin') {
    return true;
  }

  return false;
}

/**
 * Returns a complete map of all permission keys -> resolved boolean for a user.
 */
export function getEffectiveUserPermissions(
  user: User | null | undefined,
  templatesMap?: Record<string, PermissionTemplate>
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const def of PERMISSION_DEFINITIONS) {
    result[def.key] = hasPermission(user, def.key, templatesMap);
  }
  return result;
}

/**
 * Helper to sync legacy boolean fields on the User model with permission keys.
 */
export function syncLegacyFlags(permissions: Record<string, boolean>): Partial<User> {
  return {
    can_delete_payments: !!permissions['payments.delete'],
    can_view_global_dashboard: !!permissions['dashboard.view_global'],
    can_access_settings_and_history: !!permissions['settings.access'] || !!permissions['reports.view_audit_logs'],
    can_delete_records: !!permissions['members.delete'] || !!permissions['payments.delete'],
    can_assign_leads: !!permissions['leads.assign']
  };
}
