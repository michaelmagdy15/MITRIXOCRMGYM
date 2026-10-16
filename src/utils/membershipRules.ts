/**
 * Inzan Athletics Membership Hierarchy and Eligibility Rules
 *
 * Core Business Invariants:
 * 1. Primary Membership: To do anything at the gym (e.g. access facilities, workout, attend gym floor),
 *    a member must hold an active Primary Membership ('Membership' category).
 * 2. Secondary Services: Personal Training (PT) and Nutrition are secondary memberships that require
 *    an active Primary Membership.
 * 3. Exemptions (NO Primary Membership required):
 *    a. Young kids 16 years old and below can purchase PT packages without a primary membership.
 *    b. Academy classes (SGF academy, MMA classes, Gymnastics academy) do NOT require a primary membership.
 *    c. Single day drop-in passes and complimentary passes.
 */

import { Client, Package } from '../types';
import { isTenantInzan } from './inzanOrg';
import { getTenantId } from '../firebase';

export interface MembershipValidationResult {
  allowed: boolean;
  reason?: string;
  isPrimaryMembership: boolean;
  isExempt: boolean;
  exemptionReason?: string;
}

/**
 * Checks whether a package is a Primary Membership.
 * Primary memberships have hierarchy === 'Primary', or are categorized under 'Membership' or 'Gym Memberships'.
 */
export function isPrimaryMembershipPackage(
  pkg?: Package | null | { category?: string; name?: string; packageName?: string; type?: string; hierarchy?: string }
): boolean {
  if (!pkg) return false;
  if ((pkg as Package).hierarchy === 'Primary') return true;
  if ((pkg as Package).hierarchy === 'Secondary') return false;

  const cat = (pkg.category || '').toLowerCase().trim();
  const name = ((pkg as any).packageName || pkg.name || '').toLowerCase().trim();
  
  if (cat === 'membership' || cat === 'gym memberships' || cat === 'memberships') {
    return true;
  }
  // If no category is set, check name
  if (name.includes('membership') && !name.includes('pt') && !name.includes('trainer') && !name.includes('session')) {
    return true;
  }
  return false;
}

/**
 * Checks whether a package is an Academy / SGF / MMA / Gymnastics package
 * which does NOT require an active primary membership.
 */
export function isAcademyOrExemptPackage(
  pkg?: Package | null | { category?: string; name?: string; packageName?: string; type?: string; hierarchy?: string }
): boolean {
  if (!pkg) return false;
  if ((pkg as Package).hierarchy === 'Secondary' || (pkg as Package).hierarchy === 'Primary') {
    return false;
  }
  const cat = (pkg.category || '').toLowerCase().trim();
  const name = ((pkg as any).packageName || pkg.name || '').toLowerCase().trim();
  
  // SGF, Gymnastics, Academy, MMA, Classes, Complimentary, Drop-in
  if (
    cat === 'sgf' ||
    cat === 'gymnastics' ||
    cat === 'complimentary' ||
    cat === 'drop-in / day pass' ||
    cat === 'classes' ||
    name.includes('sgf') ||
    name.includes('academy') ||
    name.includes('mma') ||
    name.includes('gymnastic') ||
    name.includes('drop in') ||
    name.includes('day pass') ||
    name.includes('complimentary') ||
    name.includes('guest')
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether a client is a junior / kid (16 years old and below),
 * who is exempt from the primary membership requirement for PT packages.
 */
export function isClientUnder16OrJunior(client?: Client | null): boolean {
  if (!client) return false;
  
  // 1. Check memberCategory
  const cat = (client.memberCategory || '').toLowerCase();
  if (cat.includes('kids') || cat.includes('junior')) {
    return true;
  }
  
  // 2. Check dateOfBirth
  if (client.dateOfBirth) {
    const dob = new Date(client.dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      if (age <= 16) {
        return true;
      }
    }
  }
  
  return false;
}

export function isTenantExemptFromPrimaryRules(tenantId?: string): boolean {
  try {
    if (typeof window !== 'undefined') {
      const tenant = (tenantId || getTenantId()).toLowerCase();
      return !tenant.includes('inzan') && !isTenantInzan();
    }
    if (tenantId) {
      return !tenantId.toLowerCase().includes('inzan');
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Checks whether a client holds an active Primary Membership.
 */
export function hasActivePrimaryMembership(client?: Client | null, now: Date = new Date(), tenantId?: string): boolean {
  if (!client) return false;

  // Multi-tenant isolation: non-Inzan gyms (like Strike Boxing) do not require primary memberships
  if (isTenantExemptFromPrimaryRules(tenantId)) {
    return true;
  }

  // 1. Check client.packages array
  if (Array.isArray(client.packages) && client.packages.length > 0) {
    const hasActive = client.packages.some(p => {
      if (p.status !== 'Active') return false;
      const isPrimary = isPrimaryMembershipPackage(p as any);
      if (!isPrimary) return false;
      if (p.endDate) {
        return new Date(p.endDate) >= now;
      }
      return true;
    });
    if (hasActive) return true;
  }

  // 2. Check client-level status and membershipExpiry
  if (client.status === 'Active' && client.membershipExpiry) {
    const expiry = new Date(client.membershipExpiry);
    if (expiry >= now) {
      const pType = (client.packageType || '').toLowerCase();
      // If packageType is explicitly a primary membership
      if (pType.includes('membership') && !pType.includes('pt') && !pType.includes('private')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validates whether a client is eligible to purchase or book a given package
 * according to Inzan Athletics gym rules:
 * - A primary membership is required for secondary services (PT, Nutrition, or any package with hierarchy === 'Secondary').
 * - Exemptions:
 *   1. Young kids 16 and below can get PT packages without a membership.
 *   2. Academy classes (SGF academy, MMA classes, Gymnastics) do not need memberships unless explicitly marked Secondary.
 *   3. Purchasing a Primary Membership itself does not require an existing membership.
 */
export function validateMembershipEligibility(
  client?: Client | null,
  targetPackage?: Package | null | { category?: string; name?: string; type?: string; hierarchy?: string },
  now: Date = new Date(),
  tenantId?: string
): MembershipValidationResult {
  if (!targetPackage) {
    return { allowed: true, isPrimaryMembership: false, isExempt: true };
  }

  // Multi-tenant isolation: This invariant is strictly unique to INZAN ATHLETICS.
  // For Strike Boxing Club (and other tenants), return allowed: true immediately!
  if (isTenantExemptFromPrimaryRules(tenantId)) {
    return { allowed: true, isPrimaryMembership: true, isExempt: true };
  }

  // 1. If the target package IS a primary membership, allowed!
  if (isPrimaryMembershipPackage(targetPackage)) {
    return {
      allowed: true,
      isPrimaryMembership: true,
      isExempt: true,
      exemptionReason: 'Package is a primary gym membership'
    };
  }

  // 2. If the package is Academy / SGF / MMA / Gymnastics / Drop-in / Complimentary (and not explicitly Secondary), allowed!
  if ((targetPackage as Package).hierarchy !== 'Secondary' && isAcademyOrExemptPackage(targetPackage)) {
    return {
      allowed: true,
      isPrimaryMembership: false,
      isExempt: true,
      exemptionReason: 'Academy, SGF, MMA, or guest packages do not require primary membership'
    };
  }

  // 3. If client is young kid (16 and below), allowed for PT packages!
  const isKid = isClientUnder16OrJunior(client);
  const isPt = (targetPackage.category || '').toLowerCase().includes('training') ||
               (targetPackage.category || '').toLowerCase() === 'personal training' ||
               (targetPackage.name || '').toLowerCase().includes('pt');
               
  if (isKid && isPt) {
    return {
      allowed: true,
      isPrimaryMembership: false,
      isExempt: true,
      exemptionReason: 'Kids 16 and below can purchase PT packages without a primary membership'
    };
  }

  // 4. Otherwise, target package is Secondary (explicit hierarchy === 'Secondary', or PT/Nutrition for adult, etc.).
  // Client MUST have an active Primary Membership!
  const hasActivePrimary = hasActivePrimaryMembership(client, now, tenantId);
  if (hasActivePrimary) {
    return {
      allowed: true,
      isPrimaryMembership: false,
      isExempt: false
    };
  }

  // 5. Blocked with clear, actionable explanation
  const serviceName = (targetPackage.category || targetPackage.name || 'this service');
  return {
    allowed: false,
    isPrimaryMembership: false,
    isExempt: false,
    reason: `A primary gym membership is required to purchase or book ${serviceName}. Adult members must hold an active Primary Membership before adding secondary packages like Personal Training or Nutrition. (Exemption: Kids 16 and below, or Academy/SGF/MMA classes).`
  };
}

function parseTimeToMinutes(timeStr: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Validates whether a check-in time falls within the package's allowed time window.
 */
export function validatePackageTimeWindow(
  pkg?: Partial<Package> | null,
  checkInTime: Date = new Date()
): { allowed: boolean; reason?: string } {
  if (!pkg || !pkg.isTimeRestricted || !pkg.allowedStartTime || !pkg.allowedEndTime) {
    return { allowed: true };
  }

  const startMinutes = parseTimeToMinutes(pkg.allowedStartTime);
  const endMinutes = parseTimeToMinutes(pkg.allowedEndTime);
  if (startMinutes === null || endMinutes === null) {
    return { allowed: true };
  }

  const checkMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
  const isWithinWindow =
    startMinutes <= endMinutes
      ? checkMinutes >= startMinutes && checkMinutes <= endMinutes
      : checkMinutes >= startMinutes || checkMinutes <= endMinutes;

  if (!isWithinWindow) {
    const checkInFormatted = `${String(checkInTime.getHours()).padStart(2, '0')}:${String(checkInTime.getMinutes()).padStart(2, '0')}`;
    return {
      allowed: false,
      reason: `Package "${pkg.name || 'Time-Restricted Package'}" only allows access between ${pkg.allowedStartTime} and ${pkg.allowedEndTime} (current time: ${checkInFormatted}).`
    };
  }

  return { allowed: true };
}

/**
 * Validates whether a requested freeze duration satisfies the package's minimum, maximum, and total allowance limits.
 */
export function validateFreezeDurationLimits(
  pkg?: Partial<Package> | null,
  requestedDays: number = 0,
  alreadyFrozenDays: number = 0
): { allowed: boolean; reason?: string } {
  if (!pkg) {
    return { allowed: true };
  }

  const minFreezeDays =
    pkg.minFreezeDays && pkg.minFreezeDays > 0
      ? pkg.minFreezeDays
      : pkg.benefits?.minFreezeDays && pkg.benefits.minFreezeDays > 0
      ? pkg.benefits.minFreezeDays
      : 1;

  const maxFreezeDays =
    pkg.maxFreezeDays && pkg.maxFreezeDays > 0
      ? pkg.maxFreezeDays
      : pkg.benefits?.maxFreezeDays && pkg.benefits.maxFreezeDays > 0
      ? pkg.benefits.maxFreezeDays
      : 365;

  const freezeAllowanceDays =
    pkg.freezeAllowanceDays && pkg.freezeAllowanceDays > 0
      ? pkg.freezeAllowanceDays
      : pkg.benefits?.freezeAllowanceDays && pkg.benefits.freezeAllowanceDays > 0
      ? pkg.benefits.freezeAllowanceDays
      : 365;

  if (requestedDays < minFreezeDays) {
    return {
      allowed: false,
      reason: `Minimum freeze duration is ${minFreezeDays} day(s) (requested: ${requestedDays}).`
    };
  }

  if (requestedDays > maxFreezeDays) {
    return {
      allowed: false,
      reason: `Maximum single freeze duration is ${maxFreezeDays} day(s) (requested: ${requestedDays}).`
    };
  }

  if (alreadyFrozenDays + requestedDays > freezeAllowanceDays) {
    const remaining = Math.max(0, freezeAllowanceDays - alreadyFrozenDays);
    return {
      allowed: false,
      reason: `Freeze request of ${requestedDays} day(s) exceeds total freeze allowance of ${freezeAllowanceDays} day(s) (${alreadyFrozenDays} already used, ${remaining} remaining).`
    };
  }

  return { allowed: true };
}
