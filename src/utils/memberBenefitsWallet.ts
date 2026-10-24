import type { Client, Package, ClientPackage } from '../types';
import { isPrimaryMembershipPackage } from './membershipRules';

export interface MemberBenefitsSummary {
  activePrimaryPackage: {
    name: string;
    status: string;
    endDate?: string;
    daysRemaining: number | null;
    isTimeRestricted: boolean;
    allowedStartTime?: string;
    allowedEndTime?: string;
  } | null;
  activeSecondaryCount: number;
  ptSessions: {
    remaining: number;
    total: number;
  };
  classTrials: {
    remaining: number;
    total: number;
  };
  guestInvitations: {
    remaining: number;
    total: number;
    used: number;
  };
  freezeAllowance: {
    remainingDays: number;
    totalDays: number;
    usedDays: number;
    minDays: number;
    maxDays: number;
  };
  hasAnyBenefits: boolean;
}

/**
 * Computes a unified summary of a member's package entitlements and benefits
 * across active packages and member-level balances.
 */
export function computeMemberBenefitsSummary(
  client: Client,
  cataloguePackages: Package[] = [],
  usedInvitationsCount = 0,
  now: Date = new Date()
): MemberBenefitsSummary {
  const clientPackages: ClientPackage[] = Array.isArray(client.packages) ? client.packages : [];
  const activeClientPackages = clientPackages.filter((cp) => cp.status === 'Active' || cp.status === 'Hold');

  const findCataloguePkg = (name?: string): Package | undefined => {
    if (!name) return undefined;
    const lower = name.trim().toLowerCase();
    return cataloguePackages.find((p) => (p.name || '').trim().toLowerCase() === lower);
  };

  let primaryClientPkg: ClientPackage | undefined;
  let primaryCataloguePkg: Package | undefined;
  let activeSecondaryCount = 0;

  for (const cp of activeClientPackages) {
    const catPkg = findCataloguePkg(cp.packageName);
    const isPrimary = catPkg
      ? isPrimaryMembershipPackage(catPkg)
      : isPrimaryMembershipPackage({ name: cp.packageName });
    if (isPrimary && !primaryClientPkg) {
      primaryClientPkg = cp;
      primaryCataloguePkg = catPkg;
    } else if (!isPrimary && cp.status === 'Active') {
      activeSecondaryCount += 1;
    }
  }

  // Fallback to client.packageType if client.packages has no primary entry
  if (!primaryClientPkg && client.packageType && client.status === 'Active') {
    const catPkg = findCataloguePkg(client.packageType);
    if (!catPkg || isPrimaryMembershipPackage(catPkg)) {
      primaryClientPkg = {
        id: 'legacy-primary',
        packageName: client.packageType,
        status: client.status,
        startDate: client.startDate,
        endDate: client.membershipExpiry,
      };
      primaryCataloguePkg = catPkg;
    }
  }

  let daysRemaining: number | null = null;
  const endDateStr = primaryClientPkg?.endDate || client.membershipExpiry;
  if (endDateStr) {
    const endMs = new Date(endDateStr).getTime();
    if (!isNaN(endMs)) {
      daysRemaining = Math.max(0, Math.ceil((endMs - now.getTime()) / (1000 * 60 * 60 * 24)));
    }
  }

  // Aggregate benefits across all active catalogue packages (or primary package)
  let totalFreePt = 0;
  let totalClassTrials = 0;
  let totalGuestInvites = 0;
  let totalFreezeAllowance = 0;
  let minFreezeDays = 0;
  let maxFreezeDays = 0;
  let usedFreezeDays = 0;

  const matchedCatalogueSet = new Set<string>();
  for (const cp of activeClientPackages) {
    usedFreezeDays += Number(cp.freezeDaysUsed || 0);
    const catPkg = findCataloguePkg(cp.packageName);
    const cpBenefits = (cp as any).benefits || {};
    if (catPkg && !matchedCatalogueSet.has(catPkg.id)) {
      matchedCatalogueSet.add(catPkg.id);
      totalFreePt += Number(catPkg.benefits?.freePtSessions ?? catPkg.freePtSessions ?? cpBenefits.freePtSessions ?? (cp as any).freePtSessions ?? 0);
      totalClassTrials += Number(catPkg.benefits?.freeClassTrials ?? catPkg.freeClassTrials ?? cpBenefits.freeClassTrials ?? cpBenefits.classTrials ?? (cp as any).freeClassTrials ?? (cp as any).classTrials ?? 0);
      totalGuestInvites += Number(catPkg.benefits?.guestInvitations ?? catPkg.guestInvitations ?? cpBenefits.guestInvitations ?? (cp as any).guestInvitations ?? 0);
      totalFreezeAllowance += Number(catPkg.benefits?.freezeAllowanceDays ?? catPkg.freezeAllowanceDays ?? cpBenefits.freezeAllowanceDays ?? (cp as any).freezeAllowanceDays ?? 0);
      const pkgMin = Number(catPkg.benefits?.minFreezeDays ?? catPkg.minFreezeDays ?? cpBenefits.minFreezeDays ?? 0);
      const pkgMax = Number(catPkg.benefits?.maxFreezeDays ?? catPkg.maxFreezeDays ?? cpBenefits.maxFreezeDays ?? 0);
      if (pkgMin > 0 && (minFreezeDays === 0 || pkgMin < minFreezeDays)) minFreezeDays = pkgMin;
      if (pkgMax > maxFreezeDays) maxFreezeDays = pkgMax;
    } else if (!catPkg) {
      totalFreePt += Number(cpBenefits.freePtSessions ?? (cp as any).freePtSessions ?? 0);
      totalClassTrials += Number(cpBenefits.freeClassTrials ?? cpBenefits.classTrials ?? (cp as any).freeClassTrials ?? (cp as any).classTrials ?? 0);
      totalGuestInvites += Number(cpBenefits.guestInvitations ?? (cp as any).guestInvitations ?? 0);
      totalFreezeAllowance += Number(cpBenefits.freezeAllowanceDays ?? (cp as any).freezeAllowanceDays ?? 0);
      const pkgMin = Number(cpBenefits.minFreezeDays ?? (cp as any).minFreezeDays ?? 0);
      const pkgMax = Number(cpBenefits.maxFreezeDays ?? (cp as any).maxFreezeDays ?? 0);
      if (pkgMin > 0 && (minFreezeDays === 0 || pkgMin < minFreezeDays)) minFreezeDays = pkgMin;
      if (pkgMax > maxFreezeDays) maxFreezeDays = pkgMax;
    }
  }

  if (matchedCatalogueSet.size === 0 && primaryCataloguePkg) {
    totalFreePt = Number(primaryCataloguePkg.benefits?.freePtSessions ?? primaryCataloguePkg.freePtSessions ?? 0);
    totalClassTrials = Number(primaryCataloguePkg.benefits?.freeClassTrials ?? primaryCataloguePkg.freeClassTrials ?? 0);
    totalGuestInvites = Number(primaryCataloguePkg.benefits?.guestInvitations ?? primaryCataloguePkg.guestInvitations ?? 0);
    totalFreezeAllowance = Number(
      primaryCataloguePkg.benefits?.freezeAllowanceDays ?? primaryCataloguePkg.freezeAllowanceDays ?? 0
    );
    minFreezeDays = Number(primaryCataloguePkg.benefits?.minFreezeDays ?? primaryCataloguePkg.minFreezeDays ?? 0);
    maxFreezeDays = Number(primaryCataloguePkg.benefits?.maxFreezeDays ?? primaryCataloguePkg.maxFreezeDays ?? 0);
  }

  // Remaining balances on client record (fallback to catalogue total if not explicitly decremented yet)
  const ptRemainingRaw =
    typeof client.ptSessionsRemaining === 'number'
      ? client.ptSessionsRemaining
      : Number(client.ptSessionsRemaining) || totalFreePt;
  const ptTotal = Math.max(totalFreePt, ptRemainingRaw);

  const trialsRemaining =
    typeof client.freeClassTrialsRemaining === 'number'
      ? Math.max(0, client.freeClassTrialsRemaining)
      : totalClassTrials;
  const trialsTotal = Math.max(totalClassTrials, trialsRemaining);

  const clientTotalInvites = Number((client as any).invitationsTotal ?? (client as any).guestInvitations ?? (typeof client.guestInvitesRemaining === 'number' ? client.guestInvitesRemaining : 0));
  const totalGuestInvitesFinal = Math.max(totalGuestInvites, clientTotalInvites);
  const clientUsedCount = Number((client as any).invitationsUsed ?? usedInvitationsCount);
  const invitesRemaining =
    typeof client.guestInvitesRemaining === 'number'
      ? Math.max(0, client.guestInvitesRemaining)
      : typeof (client as any).invitationsRemaining === 'number'
      ? Math.max(0, (client as any).invitationsRemaining)
      : Math.max(0, totalGuestInvitesFinal - clientUsedCount);
  const invitesTotal = Math.max(totalGuestInvitesFinal, invitesRemaining + clientUsedCount);

  const freezeRemaining = Math.max(0, totalFreezeAllowance - usedFreezeDays);

  const isTimeRestricted = Boolean(
    primaryCataloguePkg?.isTimeRestricted ||
      (primaryCataloguePkg?.allowedStartTime && primaryCataloguePkg?.allowedEndTime)
  );

  const hasAnyBenefits =
    Boolean(primaryClientPkg) ||
    ptTotal > 0 ||
    trialsTotal > 0 ||
    invitesTotal > 0 ||
    totalFreezeAllowance > 0;

  return {
    activePrimaryPackage: primaryClientPkg
      ? {
          name: primaryClientPkg.packageName,
          status: primaryClientPkg.status,
          endDate: endDateStr,
          daysRemaining,
          isTimeRestricted,
          allowedStartTime: primaryCataloguePkg?.allowedStartTime || (isTimeRestricted ? '06:00' : undefined),
          allowedEndTime: primaryCataloguePkg?.allowedEndTime || (isTimeRestricted ? '14:00' : undefined),
        }
      : null,
    activeSecondaryCount,
    ptSessions: {
      remaining: Math.max(0, ptRemainingRaw),
      total: ptTotal,
    },
    classTrials: {
      remaining: trialsRemaining,
      total: trialsTotal,
    },
    guestInvitations: {
      remaining: invitesRemaining,
      total: invitesTotal,
      used: usedInvitationsCount,
    },
    freezeAllowance: {
      remainingDays: freezeRemaining,
      totalDays: totalFreezeAllowance,
      usedDays: usedFreezeDays,
      minDays: minFreezeDays,
      maxDays: maxFreezeDays,
    },
    hasAnyBenefits,
  };
}

export interface WaitlistPromotionResult {
  updatedAttendees: string[];
  updatedWaitlist: string[];
  promotedMemberId: string | null;
}

/**
 * Pure FIFO waitlist promotion when an attending member cancels/is removed.
 * If capacity allows after removing `removedAttendeeId`, promotes `waitlist[0]`.
 */
export function promoteNextWaitlistedMember(
  attendees: string[],
  waitlist: string[],
  capacity: number,
  removedAttendeeId?: string
): WaitlistPromotionResult {
  const nextAttendees = removedAttendeeId
    ? attendees.filter((id) => String(id) !== String(removedAttendeeId))
    : [...attendees];
  const nextWaitlist = [...waitlist];

  let promotedMemberId: string | null = null;
  const effectiveCapacity = capacity > 0 ? capacity : Infinity;

  if (nextWaitlist.length > 0 && nextAttendees.length < effectiveCapacity) {
    const candidate = nextWaitlist.shift()!;
    if (!nextAttendees.includes(candidate)) {
      nextAttendees.push(candidate);
      promotedMemberId = candidate;
    }
  }

  return {
    updatedAttendees: nextAttendees,
    updatedWaitlist: nextWaitlist,
    promotedMemberId,
  };
}
