export type ClientStatus = 'Lead' | 'Active' | 'Nearly Expired' | 'Expired' | 'Hold';
export type LeadInterest = 'Interested' | 'Not Interested' | 'Pending';
export type LeadCategory = 'Out of area zone' | 'Social class' | 'Price' | 'No answer' | 'Ladies only' | 'Morning session' | 'Other' | 'None';
export type LeadSource = 'Call in' | 'Walk-in' | 'Word Of Mouth' | 'Instagram' | 'ADS' | 'Facebook' | 'Website' | 'Google' | 'WhatsApp' | 'TikTok' | 'Other';
export type LeadStage = 'New' | 'Trial' | 'Follow Up' | 'Converted' | 'Lost';
export type PackageType = 'Private' | 'Group';
export type UserRole = 'manager' | 'rep' | 'admin' | 'super_admin' | 'crm_admin' | 'coach' | 'client';
export type InteractionType = 'Call' | 'WhatsApp' | 'Email' | 'Visit';
export type InteractionOutcome = 'Interested' | 'Not Answered' | 'Scheduled Trial' | 'Rejected' | 'Other';

export type Branch = string;

export interface Package {
  id: string;
  name: string;
  price: number;
  sessions: number; // Keep field name for now but logic uses as packages
  expiryDays: number;
  branch: Branch | 'ALL';
  type: 'Private' | 'Group' | 'Other';
  imageUrl?: string;
}

export interface Coach {
  id: string;
  name: string;
  active: boolean;
  userId?: string; // links to users collection when coach has a login account
  phone?: string;
}

export interface PendingAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  message?: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface PasswordResetRequest {
  id: string;
  email: string;
  name?: string;
  memberId?: string;  // set for client/member reset requests
  phone?: string;     // set for client/member reset requests
  requestedAt: string;
  status: 'pending' | 'sent' | 'denied';
}

export interface CoachSchedule {
  coachId: string; // userId
  days: Record<string, { enabled: boolean; startTime: string; endTime: string }>;
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  date: string;
  fileName: string;
  importedCount: number;
  failedCount: number;
  errors: { row: number; reason: string }[];
  status: 'Completed' | 'Rolled Back';
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  branch?: Branch;
  salesTarget?: number;
  can_delete_payments?: boolean;
  can_view_global_dashboard?: boolean;
  can_access_settings_and_history?: boolean;
  can_delete_records?: boolean;
  can_assign_leads?: boolean;
  lastSeen?: string;
  isPending?: boolean; // true = invited but hasn't logged in yet
  coachId?: string;    // e.g. 'COACH-001', only for role='coach'
  clientRecordId?: string; // links to clients collection for role='client'
  clientDocId?: string;    // Firestore client document ID for role='client'
  phone?: string;
  mustChangePassword?: boolean; // true = forced change on next login
  photoURL?: string;           // avatar image URL
  dismissedNotifications?: string[];
}

export interface PTPackageRecord {
  id: string;
  clientId: string;
  date: string; // ISO string
  status: 'Scheduled' | 'Attended' | 'No Show' | 'Cancelled';
  notes?: string;
  trainerId?: string; // userId
  branch?: Branch;
}

export interface CRMComment {
  id: string;
  text: string;
  date: string; // ISO string
  author: string;
}

export interface InteractionLog {
  id: string;
  date: string; // ISO string
  type: InteractionType;
  outcome: InteractionOutcome;
  notes: string;
  nextFollowUp?: string; // ISO string
  author: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: 'CLIENT' | 'PAYMENT' | 'PACKAGE_RECORD' | 'LEAD' | 'TARGET' | 'ATTENDANCE' | 'COACH' | 'SYSTEM' | 'BRANCH' | 'SESSION';
  entityId: string;
  details: string;
  timestamp: string;
  branch?: Branch;
}

export interface Payment {
  id: string;
  clientId: string;
  client_name: string;
  amount: number;
  amount_paid: number;
  date: string; // ISO string
  method: 'Cash' | 'Credit Card' | 'Bank Transfer' | 'Instapay' | 'Other';
  instapayRef?: string; // 12 digits
  packageType: string;
  package_category_type: 'Private Training' | 'Group Training';
  coachName?: string; // Optional coach name for PT packages
  coach_name?: string; // Aligning with requested schema
  notes?: string;
  recordedBy?: string; // userId
  sales_rep_id: string;
  salesName?: string;
  branch?: Branch; // Branch where payment was recorded
  discountType?: 'percentage' | 'amount'; // Type of discount
  discountValue?: number; // Discount percentage (0-100) or fixed amount
  discountedAmount?: number; // Final amount after discount
  isUpgradePayment?: boolean; // True if this payment resulted from member upgrade (not manual entry)
  previousPackageName?: string; // Package name before upgrade
  wasTransferredDueToUpgrade?: boolean; // True if payment was transferred from an old package due to upgrade
  transferredFromPackageName?: string; // Name of the package it was originally paid for
  transferredAt?: string; // Timestamp of the transfer
  isOnHold?: boolean; // True if payment/package is temporarily paused
  holdReason?: string; // Reason for holding the payment/package
  holdDate?: string; // ISO string - when the hold was placed
  heldBy?: string; // userId - who placed the hold
  created_at: string; // ISO string
  deleted_at?: string | null; // ISO string (soft delete)
  currency?: string;
  receiptSerial?: string;
}

export type Gender = 'Male' | 'Female' | 'Other' | 'Prefer not to say';
export type ActivityLevel = 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active' | 'Extra Active';
export type FitnessTarget = 'Weight Loss' | 'Gain Muscle' | 'Improve Lifestyle' | 'Maintenance';

export interface Client {
  id: string;
  name: string;
  phone: string;
  status: ClientStatus;
  assignedTo?: string; // userId
  branch?: Branch;
  memberId?: string; // Sequential ID for members
  portalUserId?: string; // Link to the user portal record
  linkedClientIds?: string[]; // Array of linked client record IDs (family members)
  importBatchId?: string; // ID of the import batch this client was created in
  
  // Lead specific
  interest?: LeadInterest;
  category?: LeadCategory;
  source?: LeadSource;
  stage?: LeadStage;
  expectedVisitDate?: string; // ISO string
  trialDate?: string; // ISO string
  
  // Member specific
  packageType?: string; // e.g., "10 S GT Adults", "30 package adult"
  sessionsRemaining?: number | string; // e.g., 6, 0, -3, or "no attend"
  startDate?: string; // ISO string
  membershipExpiry?: string; // ISO string (End Date)
  dateOfBirth?: string; // ISO string
  points?: number;
  typeOfClient?: string;
  salesName?: string;
  salesRep?: string;
  
  // Gamified Fitness & AI Health Profile
  gender?: Gender;
  memberCategory?: 'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults';
  height?: number; // in cm
  weight?: number; // in kg
  activityLevel?: ActivityLevel;
  workoutTimes?: string[]; // e.g., ["Morning", "Evening"] or ["Mon 6AM", ...]
  fitnessTarget?: FitnessTarget;
  aiTokens?: number; // Tokens available for AI Coach chat
  referralCode?: string; // User's unique invite code
  referredBy?: string; // Referral code of the person who invited them

  packages?: ClientPackage[];
  linkedAccount?: boolean; // Shares phone number with another member (family/parent)
  hasDiscount?: boolean; // Flag to indicate if member has received a discount

  comments?: CRMComment[];
  interactions?: InteractionLog[];
  lastContactDate?: string; // ISO string
  nextReminderDate?: string; // ISO string
  paid?: boolean;
  createdAt?: string; // ISO string — set on creation, used for sorting
  nationalId?: string;
  email?: string;
  backupPhone?: string;
  isBlacklisted?: boolean;
  photoURL?: string;
  advertisingSource?: string;
  country?: string;
  city?: string;
  address?: string;
  homePhone?: string;
  nationality?: string;
  jobTitle?: string;
  guestSerial?: string;
  civilianOrMilitary?: 'None' | 'Civilian' | 'Military';
  referredByName?: string;
  documents?: ClientDocument[];
}

export interface ClientDocument {
  id: string;
  name: string;
  url: string;
  uploadDate: string;
}

export interface ClientPackage {
  id: string;
  packageName: string;
  startDate?: string;
  endDate?: string;
  sessionsTotal?: number;
  sessionsRemaining?: number;
  status: 'Active' | 'Expired' | 'Cancelled' | 'Pending' | 'Hold';
  isOnHold?: boolean; // True if package is temporarily paused
  holdReason?: string; // Reason for holding the package
  holdDate?: string; // ISO string - when the hold was placed
  subscriptionType?: 'new' | 'renew' | 'upgrade' | 'wrongentry';
  isPendingConfirmation?: boolean;
}

export interface Attendance {
  id: string;
  clientId: string;
  branch: Branch;
  date: string; // ISO string
  recordedBy: string; // userId
  packageName?: string;
}

export type TaskStatus = 'Pending' | 'In Progress' | 'Completed';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate: string; // ISO string
  status: TaskStatus;
  priority: TaskPriority;
  clientId?: string;
  assignedTo: string; // userId
  createdBy: string; // userId
  createdAt: string; // ISO string
}

export interface SalesTarget {
  targetAmount: number;
  currentAmount: number;
  privatePackagesSold: number;
  groupPackagesSold: number;
}

export interface CommissionRates {
  ptRate: number;
  groupRate: number;
}

export interface UserSalesTarget {
  id: string;
  userId: string;
  sales_rep_id: string;
  month: string; // 'YYYY-MM'
  month_year: string; // 'YYYY-MM'
  targetAmount: number;
  setBy: string; // manager userId
  createdAt: string; // ISO string
}

export interface BrandingSettings {
  companyName: string;
  logoUrl: string;
  kioskPin?: string;
  dailyCheckinPin?: string;
  currencyCode?: string;
  currencySymbol?: string;
  brandAccentColor?: string;  // NEW: gym brand accent hex e.g. "#dc2626"
}

export type UserId = string;
export type ClientId = string;
export type PackageId = string;
export type TaskId = string;
export type PaymentId = string;
export type SessionId = string;
export type ImportBatchId = string;

export type PrivateSession = PTPackageRecord;
export type Comment = CRMComment;
export type UserTarget = UserSalesTarget;
export type ClientUpdates = Partial<Client>;

export const isSuperAdmin = (role?: UserRole): boolean => role === 'super_admin' || role === 'crm_admin';
export const isAdmin = (role?: UserRole): boolean => role === 'manager' || role === 'super_admin' || role === 'crm_admin';

export interface Locker {
  id: string;
  number: string;
  branch: string;
  status: 'Available' | 'Assigned' | 'Maintenance';
  assignedTo?: string; // clientId
  assignedToName?: string;
  code?: string; // lock PIN
  updatedAt: string;
}

export interface LockerRequest {
  id: string;
  clientId: string;
  clientName: string;
  branch: string;
  status: 'Pending' | 'Approved' | 'Denied';
  requestedAt: string;
}

export interface JuiceBarOrder {
  id: string;
  clientId: string;
  clientName: string;
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  totalAmount: number;
  pickupTime: string;
  status: 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled';
  orderedAt: string;
}

export interface GuestInvite {
  id: string;
  hostClientId: string;
  hostName: string;
  guestName: string;
  guestPhone: string;
  inviteCode: string;
  status: 'Pending' | 'Attended' | 'Expired';
  createdAt: string;
}

export interface FeatureFlags {
  leads?: boolean;
  ptPackages?: boolean;
  payments?: boolean;
  attendance?: boolean;
  reports?: boolean;
  quotes?: boolean;
  operations?: boolean;
  mobileApp?: boolean;
  juiceBar?: boolean;
  locker?: boolean;
  qrCheckin?: boolean;
  pointsSystem?: boolean;
  wallet?: boolean;
  debtors?: boolean;
  unconfirmedMemberships?: boolean;
  frozenMembers?: boolean;
}

export interface Tenant {
  id: string; // Matches subdomain
  subdomain: string;
  customDomain?: string;
  databaseId: string;
  gymName: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

// ── Storefront CMS Types ──

export interface HeroSlide {
  id: string;
  title: string;
  subtitle: string;
  badgeText: string;
  badgeColor: 'white' | 'primary' | 'red' | 'green' | 'gold';
  imageUrl: string;
  ctaText: string;
  enabled: boolean;
  order: number;
}

export interface StorefrontSection {
  id: string;
  type: 'packages-kids' | 'packages-adults' | 'packages-all' | 'banner';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  enabled: boolean;
  order: number;
}

export interface ScheduleEntry {
  id: string;
  className: string;
  coach: string;
  branch: string;
  days: string;
  time: string;
  enabled: boolean;
}

export interface OfferEntry {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  badgeText?: string;
  validUntil?: string;
  enabled: boolean;
  order: number;
}

export interface StorefrontConfig {
  heroSlides: HeroSlide[];
  sections: StorefrontSection[];
  tabs: {
    book: boolean;
    locations: boolean;
    schedule: boolean;
    announcements: boolean;
  };
  schedule: ScheduleEntry[];
  offers: OfferEntry[];
  packageDisplay: {
    showPrices: boolean;
    showSessionCount: boolean;
    showExpiryDays: boolean;
    allowAddToCart: boolean;
    groupBy: 'category' | 'branch' | 'none';
    categoryLabels: { kids: string; adults: string };
  };
  ctaText: string;
  ctaTextMember: string;
}
