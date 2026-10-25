import { Client, ClientPackage } from '../types';

export type GlobalMemberLifecycleStatus =
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'HOLD'
  | 'EXPIRED'
  | 'GUEST';

export interface ResolvedMemberNote {
  text: string;
  date: string;
  author: string;
  outcome?: string;
  type?: string;
  nextFollowUp?: string;
  source: 'call' | 'comment' | 'feedback' | 'frontDesk' | 'none';
}

export interface MemberGlobalStatusEvaluation {
  /** Mutually exclusive global lifecycle state for the member */
  globalStatus: GlobalMemberLifecycleStatus;
  /** True if the member holds at least one currently active, hold/frozen, or upcoming package */
  hasActiveOrUpcomingPackage: boolean;
  /**
   * True ONLY if the member currently has an active/hold/upcoming package
   * (or renewed after a prior expired package). Never true merely because `packages.length > 1`
   * when all historical packages are expired.
   */
  hasActiveRenewal: boolean;
  /** True if the member has 1+ expired historical packages AND is currently active/renewed */
  isRenewedFromExpired: boolean;
  /**
   * The single authoritative primary package for reporting:
   * - First priority: currently active/frozen/upcoming Primary package with the latest `endDate`
   * - Second priority: any currently active/frozen/upcoming package with the latest `endDate`
   * - Third priority: historical Primary package with `MAX(endDate)`
   * - Fallback: package with `MAX(endDate)` across all packages
   */
  effectivePrimaryPackage: Partial<ClientPackage> | null;
  /** Secondary active package (e.g., PT / Nutrition add-on) if present */
  effectiveSecondaryPackage: Partial<ClientPackage> | null;
  /** ISO date string (YYYY-MM-DD) of the most recent valid package expiry (`MAX(endDate)`) */
  latestPackageEndDate: string;
  /** ISO date string (YYYY-MM-DD) of the effective primary package start date */
  effectiveStartDate: string;
  /** Days remaining from referenceDate to `latestPackageEndDate` (negative if expired) */
  daysRemaining: number;
  /** Total count of valid (non-cancelled) packages on the member profile */
  totalValidPackages: number;
  /** Unified latest comment / call disposition / feedback note for sales visibility */
  lastNote: ResolvedMemberNote;
}

export interface ExpiredMembersFilterOptions {
  /** Inclusive start date (YYYY-MM-DD) for `latestPackageEndDate`. Defaults to `'2000-01-01'`. */
  dateFrom?: string;
  /** Inclusive end date (YYYY-MM-DD) for `latestPackageEndDate`. Defaults to today (`referenceDate`). */
  dateTo?: string;
  /**
   * When false (default), strictly purges any member who has an active, hold, or upcoming package
   * (`hasActiveOrUpcomingPackage === true`). Set true ONLY when auditing historical expired packages
   * that have since renewed.
   */
  includeRenewed?: boolean;
  /** Optional reference date for deterministic testing */
  referenceDate?: Date;
}

function toIsoDateOnly(value?: string | null): string {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function isPrimaryHierarchy(pkg: Partial<ClientPackage>): boolean {
  const h1 = String(pkg.hierarchyType || '').toLowerCase();
  const h2 = String(pkg.packageHierarchy || '').toLowerCase();
  const cat = String(pkg.category || '').toLowerCase();
  if (h1 === 'secondary' || h2 === 'secondary') return false;
  if (h1 === 'primary' || h2 === 'primary') return true;
  if (cat === 'pt' || cat === 'nutrition' || cat === 'physiotherapy' || cat === 'addon') {
    return false;
  }
  return true;
}

function isPackageCancelledOrVoid(pkg: Partial<ClientPackage>): boolean {
  const st = String(pkg.status || '').trim().toLowerCase();
  return st === 'cancelled' || st === 'void' || st === 'refunded' || st === 'deleted';
}

/**
 * Evaluates whether an individual package record is currently active, on hold/frozen, or upcoming
 * as of `todayStr` (`YYYY-MM-DD`).
 */
export function isPackageCurrentlyActiveOrHold(
  pkg: Partial<ClientPackage>,
  todayStr: string
): boolean {
  if (!pkg || isPackageCancelledOrVoid(pkg)) return false;

  const st = String(pkg.status || '').trim().toLowerCase();
  const endStr = toIsoDateOnly(pkg.endDate);

  // Frozen / Hold or Upcoming packages are active commitments
  if (st === 'frozen' || st === 'hold' || st === 'upcoming') {
    return true;
  }

  // Explicitly marked Expired in the database AND its endDate is in the past (or missing)
  if (st === 'expired' || st === 'completed') {
    if (endStr && endStr >= todayStr) {
      // Edge case: package endDate is still in the future despite a stale 'Expired' label
      return false;
    }
    return false;
  }

  // If package has an explicit endDate, check if it has not yet passed
  if (endStr) {
    return endStr >= todayStr;
  }

  // No endDate: check if status is Active and sessions (if tracked) are not exhausted
  if (st === 'active') {
    if (
      pkg.sessionsRemaining !== undefined &&
      pkg.totalSessions !== undefined &&
      Number(pkg.totalSessions) > 0 &&
      Number(pkg.sessionsRemaining) <= 0
    ) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Extracts the most recent sales comment, call log, member feedback, or front-desk note
 * so sales reps always have full context in Active and Expired member views.
 */
export function resolveLatestMemberNote(client: Partial<Client>): ResolvedMemberNote {
  const candidates: ResolvedMemberNote[] = [];

  if (client.lastCall && (client.lastCall.text || client.lastCall.outcome)) {
    candidates.push({
      text: client.lastCall.text || client.lastCall.outcome || '',
      date: client.lastCall.date || client.lastCallDate || client.lastContactDate || '',
      author: client.lastCall.author || client.lastCallBy || 'Sales Rep',
      outcome: client.lastCall.outcome,
      type: client.lastCall.type,
      nextFollowUp: client.nextReminderDate,
      source: 'call',
    });
  } else if (client.lastCallText) {
    candidates.push({
      text: client.lastCallText,
      date: client.lastCallDate || client.lastContactDate || '',
      author: client.lastCallBy || 'Sales Rep',
      nextFollowUp: client.nextReminderDate,
      source: 'call',
    });
  }

  if (client.lastComment && client.lastComment.text) {
    candidates.push({
      text: client.lastComment.text,
      date: client.lastComment.date || client.lastContactDate || '',
      author: client.lastComment.author || 'Staff',
      nextFollowUp: client.nextReminderDate,
      source: 'comment',
    });
  }

  if (Array.isArray(client.comments) && client.comments.length > 0) {
    const sortedComments = [...client.comments]
      .filter((c) => c && c.text)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (sortedComments[0]) {
      candidates.push({
        text: sortedComments[0].text,
        date: sortedComments[0].date || '',
        author: sortedComments[0].author || 'Staff',
        nextFollowUp: client.nextReminderDate,
        source: 'comment',
      });
    }
  }

  if (Array.isArray(client.interactions) && client.interactions.length > 0) {
    const sortedInteractions = [...client.interactions]
      .filter((i) => i && (i.notes || i.outcome))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (sortedInteractions[0]) {
      const topInt = sortedInteractions[0];
      candidates.push({
        text: topInt.notes?.trim() || topInt.outcome || '',
        date: topInt.date || '',
        author: topInt.author || 'Sales Rep',
        outcome: topInt.outcome,
        type: topInt.type,
        nextFollowUp: topInt.nextFollowUp || client.nextReminderDate,
        source: 'call',
      });
    }
  }

  if (client.memberFeedback && String(client.memberFeedback).trim()) {
    candidates.push({
      text: String(client.memberFeedback).trim(),
      date: client.lastContactDate || client.updatedAt || '',
      author: client.salesName || 'Feedback',
      outcome: 'Feedback',
      nextFollowUp: client.nextReminderDate,
      source: 'feedback',
    });
  }

  if (client.frontDeskNote && String(client.frontDeskNote).trim()) {
    candidates.push({
      text: String(client.frontDeskNote).trim(),
      date: client.updatedAt || client.createdAt || '',
      author: 'Front Desk',
      nextFollowUp: client.nextReminderDate,
      source: 'frontDesk',
    });
  }

  if (candidates.length === 0) {
    return {
      text: '',
      date: '',
      author: '',
      nextFollowUp: client.nextReminderDate,
      source: 'none',
    };
  }

  candidates.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    const validA = Number.isFinite(dateA) ? dateA : 0;
    const validB = Number.isFinite(dateB) ? dateB : 0;
    return validB - validA;
  });

  return candidates[0]!;
}

/**
 * Deterministic Global Member Status & Package Evaluation Rule.
 *
 * Solves the 1:N relational package vs. member status flaw:
 * - Evaluates all packages in `client.packages` plus top-level membership fields.
 * - Selects `effectivePrimaryPackage` by prioritizing active/hold packages and sorting by `endDate DESC` (`MAX(endDate)`),
 *   never picking an arbitrary older expired `packages[0]`.
 * - Ensures any member who has renewed (`hasActiveOrUpcomingPackage === true`) resolves to `'ACTIVE'`, `'EXPIRING_SOON'`, or `'HOLD'`,
 *   and is strictly excluded from `'EXPIRED'`.
 */
export function computeMemberGlobalStatus(
  client: Partial<Client>,
  referenceDate: Date = new Date()
): MemberGlobalStatusEvaluation {
  const todayStr = referenceDate.toISOString().slice(0, 10);
  const rawPackages = Array.isArray(client.packages) ? client.packages : [];
  const validPackages = rawPackages.filter((p) => p && !isPackageCancelledOrVoid(p));

  const clientStatusNorm = String(client.status || '').trim().toLowerCase();
  const topExpiryStr = toIsoDateOnly(client.membershipExpiry);
  const topStartStr = toIsoDateOnly(client.startDate);

  // Sort helper: latest endDate first, then latest startDate first
  const sortByLatestEndDate = (a: Partial<ClientPackage>, b: Partial<ClientPackage>): number => {
    const endA = toIsoDateOnly(a.endDate) || '0000-00-00';
    const endB = toIsoDateOnly(b.endDate) || '0000-00-00';
    if (endA !== endB) return endB.localeCompare(endA);
    const startA = toIsoDateOnly(a.startDate) || '0000-00-00';
    const startB = toIsoDateOnly(b.startDate) || '0000-00-00';
    return startB.localeCompare(startA);
  };

  const activeOrHoldPackages = validPackages
    .filter((p) => isPackageCurrentlyActiveOrHold(p, todayStr))
    .sort(sortByLatestEndDate);

  const expiredPackages = validPackages
    .filter((p) => !isPackageCurrentlyActiveOrHold(p, todayStr))
    .sort(sortByLatestEndDate);

  const activePrimaryPackages = activeOrHoldPackages.filter(isPrimaryHierarchy);
  const activeSecondaryPackages = activeOrHoldPackages.filter((p) => !isPrimaryHierarchy(p));
  const allPrimaryPackages = [...validPackages].filter(isPrimaryHierarchy).sort(sortByLatestEndDate);
  const allSortedPackages = [...validPackages].sort(sortByLatestEndDate);

  // Resolve the authoritative Primary package
  const effectivePrimaryPackage: Partial<ClientPackage> | null =
    activePrimaryPackages[0] ||
    activeOrHoldPackages[0] ||
    allPrimaryPackages[0] ||
    allSortedPackages[0] ||
    (client.packageType || client.primaryPackageName || topExpiryStr
      ? {
          packageName: client.primaryPackageName || client.packageType || 'Membership',
          startDate: topStartStr || undefined,
          endDate: topExpiryStr || undefined,
          status:
            clientStatusNorm === 'hold'
              ? 'Frozen'
              : clientStatusNorm === 'expired'
              ? 'Expired'
              : 'Active',
        }
      : null);

  const effectiveSecondaryPackage: Partial<ClientPackage> | null =
    activeSecondaryPackages[0] ||
    validPackages
      .filter((p) => !isPrimaryHierarchy(p))
      .sort(sortByLatestEndDate)[0] ||
    null;

  // Compute MAX(endDate) across all valid primary/membership packages and top-level expiry
  const candidateEndDates: string[] = [];
  for (const pkg of validPackages) {
    const d = toIsoDateOnly(pkg.endDate);
    if (d) candidateEndDates.push(d);
  }
  if (topExpiryStr) {
    candidateEndDates.push(topExpiryStr);
  }
  candidateEndDates.sort((a, b) => b.localeCompare(a));

  const primaryEndStr = toIsoDateOnly(effectivePrimaryPackage?.endDate);
  const latestPackageEndDate = primaryEndStr || candidateEndDates[0] || '';
  const effectiveStartDate =
    toIsoDateOnly(effectivePrimaryPackage?.startDate) || topStartStr || '';

  // Calculate daysRemaining relative to referenceDate (UTC midnight diff)
  let daysRemaining = 0;
  if (latestPackageEndDate) {
    const expiryMs = new Date(`${latestPackageEndDate}T00:00:00Z`).getTime();
    const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();
    if (Number.isFinite(expiryMs) && Number.isFinite(todayMs)) {
      daysRemaining = Math.round((expiryMs - todayMs) / 86400000);
    }
  } else if (typeof client.daysRemaining === 'number') {
    daysRemaining = client.daysRemaining;
  }

  // Determine if the member is a Guest / Unconverted Lead
  const hasPaidFlag = client.paid === true;
  const hasRealPackageName = Boolean(
    (client.packageType && !/^(prospect|lead|guest|none|-)$/i.test(client.packageType.trim())) ||
      (client.primaryPackageName &&
        !/^(prospect|lead|guest|none|-)$/i.test(client.primaryPackageName.trim()))
  );

  const isGuestOrLead =
    clientStatusNorm === 'lead' &&
    validPackages.length === 0 &&
    !hasPaidFlag &&
    !topExpiryStr;

  const lastNote = resolveLatestMemberNote(client);

  if (isGuestOrLead) {
    return {
      globalStatus: 'GUEST',
      hasActiveOrUpcomingPackage: false,
      hasActiveRenewal: false,
      isRenewedFromExpired: false,
      effectivePrimaryPackage: null,
      effectiveSecondaryPackage: null,
      latestPackageEndDate: '',
      effectiveStartDate,
      daysRemaining: 0,
      totalValidPackages: 0,
      lastNote,
    };
  }

  // Check if any package or top-level state is Hold / Frozen
  const hasHoldState =
    clientStatusNorm === 'hold' ||
    activeOrHoldPackages.some((p) => {
      const st = String(p.status || '').trim().toLowerCase();
      return st === 'frozen' || st === 'hold';
    });

  // Check if member has an active or upcoming package:
  // 1. At least one package in `validPackages` is currently active/hold/upcoming, OR
  // 2. Top-level status is Active/Nearly Expired/Hold AND either:
  //    - `topExpiryStr >= todayStr`, OR
  //    - No package end dates exist at all (e.g. open-ended active membership)
  const hasTopLevelActiveOverride =
    (clientStatusNorm === 'active' ||
      clientStatusNorm === 'nearly expired' ||
      clientStatusNorm === 'hold') &&
    (topExpiryStr >= todayStr || (!topExpiryStr && validPackages.length === 0));

  const hasActiveOrUpcomingPackage =
    activeOrHoldPackages.length > 0 || hasTopLevelActiveOverride;

  const isRenewedFromExpired =
    hasActiveOrUpcomingPackage &&
    (expiredPackages.length > 0 ||
      validPackages.length > 1 ||
      activeOrHoldPackages.some(
        (p) => String(p.subscriptionType || '').toLowerCase() === 'renewal'
      ));

  // `hasActiveRenewal` is strictly true ONLY when the member currently holds an active/hold/upcoming package!
  const hasActiveRenewal = hasActiveOrUpcomingPackage;

  let globalStatus: GlobalMemberLifecycleStatus;
  if (hasHoldState && hasActiveOrUpcomingPackage) {
    globalStatus = 'HOLD';
  } else if (hasActiveOrUpcomingPackage) {
    if (latestPackageEndDate && daysRemaining >= 0 && daysRemaining <= 7) {
      globalStatus = 'EXPIRING_SOON';
    } else {
      globalStatus = 'ACTIVE';
    }
  } else if (validPackages.length > 0 || topExpiryStr || hasRealPackageName || clientStatusNorm === 'expired') {
    globalStatus = 'EXPIRED';
  } else {
    globalStatus = 'GUEST';
  }

  return {
    globalStatus,
    hasActiveOrUpcomingPackage,
    hasActiveRenewal,
    isRenewedFromExpired,
    effectivePrimaryPackage,
    effectiveSecondaryPackage,
    latestPackageEndDate,
    effectiveStartDate,
    daysRemaining,
    totalValidPackages: validPackages.length,
    lastNote,
  };
}

/**
 * Pulls a clean, accurate list of Expired members within a specific date range
 * (e.g., `2000-01-01` to present) based on the member's *most recent* package expiry (`latestPackageEndDate`),
 * strictly purging any member who currently holds an active or renewed package (`hasActiveOrUpcomingPackage === true`).
 */
export function filterExpiredMembersClean<T extends Partial<Client>>(
  clients: T[],
  options: ExpiredMembersFilterOptions = {}
): Array<{ client: T; evaluation: MemberGlobalStatusEvaluation }> {
  const referenceDate = options.referenceDate || new Date();
  const todayStr = referenceDate.toISOString().slice(0, 10);
  const dateFrom = toIsoDateOnly(options.dateFrom) || '2000-01-01';
  const dateTo = toIsoDateOnly(options.dateTo) || todayStr;
  const includeRenewed = options.includeRenewed === true;

  const results: Array<{ client: T; evaluation: MemberGlobalStatusEvaluation }> = [];

  for (const client of clients) {
    const evaluation = computeMemberGlobalStatus(client, referenceDate);

    // Never include Guests / Leads in Expired Members
    if (evaluation.globalStatus === 'GUEST') {
      continue;
    }

    // CRITICAL FIX: Purge any member who currently has an active, hold, or upcoming package
    // unless the caller explicitly requests renewed historical records (`includeRenewed: true`).
    if (!includeRenewed && evaluation.hasActiveOrUpcomingPackage) {
      continue;
    }

    if (includeRenewed) {
      // Even when includeRenewed is true, only include members who actually have an expired package or are expired
      const hasAnyExpiredHistory =
        evaluation.globalStatus === 'EXPIRED' || evaluation.isRenewedFromExpired;
      if (!hasAnyExpiredHistory) continue;
    } else if (evaluation.globalStatus !== 'EXPIRED') {
      continue;
    }

    // Date range check strictly against the member's latest package expiry (`MAX(endDate)`)
    const expiryDate = evaluation.latestPackageEndDate;
    if (expiryDate) {
      if (dateFrom && expiryDate < dateFrom) continue;
      if (dateTo && expiryDate > dateTo) continue;
    }

    results.push({ client, evaluation });
  }

  // Sort by most recently expired first (`latestPackageEndDate DESC`)
  results.sort((a, b) =>
    (b.evaluation.latestPackageEndDate || '').localeCompare(
      a.evaluation.latestPackageEndDate || ''
    )
  );

  return results;
}
