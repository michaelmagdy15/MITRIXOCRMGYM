export type MemberCategory = 'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults';

export const MEMBER_CATEGORIES: MemberCategory[] = [
  'Kids Only',
  'Kids Pro',
  'Junior Only',
  'Junior Advanced',
  'Adults'
];

// ===============================================================
// STRICT TIER & BRANCH ACCESS CONTROL ENGINE (CANONICAL RBAC)
// ===============================================================

export type CanonicalTier = 'KIDS' | 'KIDS_PRO' | 'JUNIORS' | 'JUNIORS_PRO' | 'ADULT';
export type CanonicalBranchId = 'strike_maxim' | 'strike_mivida' | 'impact';

export const CANONICAL_TIERS: CanonicalTier[] = ['KIDS', 'KIDS_PRO', 'JUNIORS', 'JUNIORS_PRO', 'ADULT'];
export const ALLOWED_ADULT_BRANCHES: CanonicalBranchId[] = ['strike_maxim', 'strike_mivida', 'impact'];
export const ALLOWED_YOUTH_HOME_BRANCHES: CanonicalBranchId[] = ['strike_maxim', 'strike_mivida'];

/**
 * Maps any tier string, category string, or class name to its canonical tier.
 * Rules:
 * - Kids Only / Kids -> KIDS
 * - Kids Pro -> KIDS_PRO
 * - Junior Only / Juniors -> JUNIORS
 * - Junior Advanced / Juniors Pro -> JUNIORS_PRO
 * - Adults / Adult -> ADULT
 */
export function toCanonicalTier(val?: string | null): CanonicalTier {
  if (!val) return 'ADULT';
  const lower = val.trim().toLowerCase().replace(/[-_]/g, ' ');

  if (lower.includes('kid')) {
    if (lower.includes('pro') || lower.includes('advanced')) {
      return 'KIDS_PRO';
    }
    return 'KIDS';
  }

  if (lower.includes('junior')) {
    if (lower.includes('pro') || lower.includes('advanced')) {
      return 'JUNIORS_PRO';
    }
    return 'JUNIORS';
  }

  if (lower.includes('adult')) {
    return 'ADULT';
  }

  return 'ADULT';
}

/**
 * Maps any branch string or ID to its canonical branch ID ('strike_maxim', 'strike_mivida', 'impact').
 */
export function toCanonicalBranchId(val?: string | null): CanonicalBranchId | '' {
  if (!val) return '';
  const lower = val.trim().toLowerCase().replace(/[-_]/g, ' ');

  if (lower.includes('maxim') || lower.includes('complex')) {
    return 'strike_maxim';
  }
  if (lower.includes('mivida') || lower.includes('mvida')) {
    return 'strike_mivida';
  }
  if (lower.includes('impact')) {
    return 'impact';
  }

  return '';
}

/**
 * Decouples session display title from booking eligibility.
 * Retrieves or derives the allowed canonical tiers array for a session:
 * - If session.allowed_tiers or session.allowedTiers exists, normalizes and returns them.
 * - Otherwise analyzes session title/tier:
 *   - Combined "Kids / Kids Pro" -> ['KIDS', 'KIDS_PRO']
 *   - Combined "Juniors / Juniors Pro" -> ['JUNIORS', 'JUNIORS_PRO']
 *   - Exclusive "Kids Pro" -> ['KIDS_PRO']
 *   - Standard "Kids" -> ['KIDS']
 *   - Exclusive "Juniors Pro" -> ['JUNIORS_PRO']
 *   - Standard "Juniors" -> ['JUNIORS']
 *   - "Adults" -> ['ADULT']
 */
export function getSessionAllowedTiers(session: {
  tier?: string;
  allowedTiers?: string[];
  allowed_tiers?: string[];
  name?: string;
  className?: string;
  category?: string;
  [key: string]: any;
}): CanonicalTier[] {
  if (!session) return ['ADULT'];

  const rawArray = session.allowed_tiers || session.allowedTiers;
  if (Array.isArray(rawArray) && rawArray.length > 0) {
    const canonicalSet = new Set<CanonicalTier>();
    for (const item of rawArray) {
      if (item) canonicalSet.add(toCanonicalTier(String(item)));
    }
    if (canonicalSet.size > 0) {
      return Array.from(canonicalSet);
    }
  }

  // Deduce from name / tier / category strings
  const combinedStr = `${session.name || ''} ${session.className || ''} ${session.tier || ''} ${session.category || ''}`.toLowerCase();

  const hasKids = combinedStr.includes('kid');
  const hasJuniors = combinedStr.includes('junior');
  const hasPro = combinedStr.includes('pro') || combinedStr.includes('advanced');
  const isCombined = combinedStr.includes('/') || combinedStr.includes('&') || combinedStr.includes('and');

  if (hasKids) {
    if (hasPro && isCombined) {
      return ['KIDS', 'KIDS_PRO'];
    }
    if (hasPro) {
      return ['KIDS_PRO'];
    }
    return ['KIDS'];
  }

  if (hasJuniors) {
    if (hasPro && isCombined) {
      return ['JUNIORS', 'JUNIORS_PRO'];
    }
    if (hasPro) {
      return ['JUNIORS_PRO'];
    }
    return ['JUNIORS'];
  }

  if (combinedStr.includes('adult')) {
    return ['ADULT'];
  }

  return [toCanonicalTier(session.tier || session.category || session.name)];
}

/**
 * Normalizes any category string into a standardized MemberCategory.
 */
export const normalizeMemberCategory = (val?: string | null): MemberCategory => {
  if (!val) return 'Adults';
  const lower = val.trim().toLowerCase();
  if (lower.includes('kids pro')) return 'Kids Pro';
  if (lower.includes('kid')) return 'Kids Only';
  if (lower.includes('junior advanced') || lower.includes('juniors advanced') || lower.includes('junior pro') || lower.includes('juniors pro')) return 'Junior Advanced';
  if (lower.includes('junior')) return 'Junior Only';
  return 'Adults';
};

/**
 * Derives a member's category from their client record or package name.
 */
export const getMemberCategory = (client: any): MemberCategory => {
  if (!client) return 'Adults';
  if (client.memberCategory) return normalizeMemberCategory(client.memberCategory);
  if (client.category) return normalizeMemberCategory(client.category);

  // Check packages array (Strike Gym stores active packages here)
  if (Array.isArray(client.packages) && client.packages.length > 0) {
    for (const pkg of client.packages) {
      const name = (pkg.packageName || pkg.name || '').toLowerCase();
      if (name.includes('kids pro')) return 'Kids Pro';
      if (name.includes('kids') || name.includes('kid')) return 'Kids Only';
      if (name.includes('junior advanced') || name.includes('juniors advanced') || name.includes('junior pro') || name.includes('juniors pro')) return 'Junior Advanced';
      if (name.includes('junior')) return 'Junior Only';
      if (name.includes('adult')) return 'Adults';
    }
  }

  const pkgStr = (client.packageType || '').toLowerCase();
  if (pkgStr.includes('kids pro')) return 'Kids Pro';
  if (pkgStr.includes('kids')) return 'Kids Only';
  if (pkgStr.includes('junior advanced') || pkgStr.includes('juniors advanced') || pkgStr.includes('junior pro') || pkgStr.includes('juniors pro')) return 'Junior Advanced';
  if (pkgStr.includes('junior')) return 'Junior Only';
  if (pkgStr.includes('adult')) return 'Adults';
  return 'Adults';
};

/**
 * Strict Tier Gating check for sessions / gym classes.
 * Enforces business access rules:
 * Uses getSessionAllowedTiers to support merged sessions (e.g. Kids / Kids Pro)
 */
export function isSessionTierAllowed(
  session: { tier?: string; allowedTiers?: string[]; allowed_tiers?: string[]; name?: string; category?: string },
  memberCategory: string
): boolean {
  const normCategory = normalizeMemberCategory(memberCategory);
  const canonicalMemberTier = toCanonicalTier(normCategory);
  const allowedTiers = getSessionAllowedTiers(session);

  return allowedTiers.includes(canonicalMemberTier);
}

/**
 * Normalizes branch names so variations ("Maxim", "Maxim Compound", "Strike Maxim", "COMPLEX") match.
 */
export function normalizeBranchName(branch?: string): string {
  if (!branch) return '';
  const lower = branch.trim().toLowerCase();
  if (lower.includes('maxim') || lower.includes('complex')) return 'maxim';
  if (lower.includes('mivida') || lower.includes('mvida')) return 'mivida';
  if (lower.includes('impact')) return 'impact';
  if (lower.includes('envida')) return 'envida';
  if (lower.includes('playa')) return 'playa';
  if (lower === 'all' || lower === 'all branches') return 'all';
  return lower;
}

/**
 * Normalizes category enum/slug across frontend buttons and backend DB
 * ('junior_only' vs 'Junior Only' vs 'juniors')
 */
export function normalizeTierCategory(val?: string | null): { tier: MemberCategory | 'PT'; slug: string } {
  if (!val) return { tier: 'Adults', slug: 'adults' };
  const lower = val.trim().toLowerCase().replace(/[-_]/g, ' ');
  if (lower.includes('pt') || lower.includes('private')) {
    return { tier: 'PT' as any, slug: 'pt' };
  }
  if (lower.includes('kids pro') || lower.includes('kid pro')) {
    return { tier: 'Kids Pro', slug: 'kids_pro' };
  }
  if (lower.includes('kid')) {
    return { tier: 'Kids Only', slug: 'kids_only' };
  }
  if (
    lower.includes('junior advanced') ||
    lower.includes('juniors advanced') ||
    lower.includes('junior pro') ||
    lower.includes('juniors pro')
  ) {
    return { tier: 'Junior Advanced', slug: 'junior_advanced' };
  }
  if (lower.includes('junior') || lower.includes('juniors')) {
    return { tier: 'Junior Only', slug: 'junior_only' };
  }
  return { tier: 'Adults', slug: 'adults' };
}

/**
 * Dynamic Package Query Logic matching:
 * SELECT * FROM packages 
 * WHERE tier = :selected_tier 
 *   AND (branch_id = :selected_branch OR branch_id IS NULL OR is_all_branches = TRUE)
 *   AND is_active = TRUE;
 */
export function isPackageMatchingFilter(
  pkg: any,
  selectedCategoryOrTier: string,
  selectedBranch: string,
  isPtSelected: boolean = false
): boolean {
  if (pkg.is_active === false || pkg.isActive === false) return false;

  const nameLower = (pkg.name || '').toLowerCase();
  const typeLower = (pkg.type || '').toLowerCase();
  const isPtPkg = typeLower === 'private' || nameLower.includes('pt') || nameLower.includes('private') || pkg.tier === 'PT' || pkg.category === 'pt';

  if (isPtSelected) {
    if (!isPtPkg) return false;
  } else {
    if (isPtPkg) return false;
  }

  // 1. Tier / Category Matching
  const targetNorm = normalizeTierCategory(selectedCategoryOrTier);
  const pkgTierNorm = pkg.tier ? normalizeTierCategory(pkg.tier) : null;
  const pkgCategoryNorm = pkg.category ? normalizeTierCategory(pkg.category) : null;

  let matchesTier = false;
  if (targetNorm.tier === 'Junior Only') {
    matchesTier =
      pkgTierNorm?.tier === 'Junior Only' ||
      pkgCategoryNorm?.slug === 'junior_only' ||
      (nameLower.includes('junior') && !nameLower.includes('advanced') && !nameLower.includes('pro'));
  } else if (targetNorm.tier === 'Junior Advanced') {
    matchesTier =
      pkgTierNorm?.tier === 'Junior Advanced' ||
      pkgCategoryNorm?.slug === 'junior_advanced' ||
      (nameLower.includes('junior') && (nameLower.includes('advanced') || nameLower.includes('pro')));
  } else if (targetNorm.tier === 'Kids Only') {
    matchesTier =
      pkgTierNorm?.tier === 'Kids Only' ||
      pkgCategoryNorm?.slug === 'kids_only' ||
      (nameLower.includes('kid') && !nameLower.includes('pro'));
  } else if (targetNorm.tier === 'Kids Pro') {
    matchesTier =
      pkgTierNorm?.tier === 'Kids Pro' ||
      pkgCategoryNorm?.slug === 'kids_pro' ||
      (nameLower.includes('kid') && nameLower.includes('pro'));
  } else if (targetNorm.tier === 'Adults') {
    matchesTier =
      pkgTierNorm?.tier === 'Adults' ||
      pkgCategoryNorm?.slug === 'adults' ||
      (!nameLower.includes('kid') && !nameLower.includes('junior'));
  } else if (targetNorm.tier === 'PT') {
    matchesTier = isPtPkg;
  }

  if (!matchesTier) return false;

  // 2. Branch Matching
  const isPkgAllBranches =
    pkg.is_all_branches === true ||
    pkg.branch === 'ALL' ||
    pkg.branch_id === 'all' ||
    pkg.branchId === 'all' ||
    !pkg.branch ||
    pkg.branch === 'All Branches';

  if (isPkgAllBranches) {
    return true;
  }

  const sBranchNorm = normalizeBranchName(selectedBranch);
  if (!selectedBranch || selectedBranch === 'All Branches' || selectedBranch === 'ALL' || sBranchNorm === 'all') {
    return true;
  }

  const pkgBranchNorm = normalizeBranchName(pkg.branch || pkg.branch_id || pkg.branchId);
  return pkgBranchNorm === sBranchNorm;
}

/**
 * Strict Branch / Location Gating check (Booking Engine RBAC):
 * - Kids / Juniors / Kids Pro / Juniors Pro:
 *   Enforce session.branch_id == member.home_branch_id.
 *   Block access to all sessions outside their assigned home facility.
 * - Adults:
 *   Allow Adult memberships to retrieve schedules and reserve slots across all 3 branches without restriction.
 */
export function isSessionBranchAllowed(
  sessionBranch: string | undefined,
  memberBranch: string | undefined,
  isMultiBranch: boolean = false,
  memberCategory?: string
): boolean {
  const normCat = memberCategory ? normalizeMemberCategory(memberCategory) : undefined;
  if (isMultiBranch || normCat === 'Adults') {
    return true;
  }

  const sRaw = (sessionBranch || '').trim().toLowerCase();
  const mRaw = (memberBranch || '').trim().toLowerCase();

  if (!sRaw || sRaw === 'all' || sRaw === 'all branches') return true;
  if (!mRaw || mRaw === 'all' || mRaw === 'all branches') return true;

  const sNorm = normalizeBranchName(sessionBranch);
  const mNorm = normalizeBranchName(memberBranch);
  if (sNorm && mNorm && sNorm === mNorm) return true;

  return sRaw === mRaw;
}

/**
 * Checks exact tier equality.
 */
export function isExactTierMatch(memberTier: string, sessionTier: string): boolean {
  return toCanonicalTier(memberTier) === toCanonicalTier(sessionTier);
}

export interface MemberAccessContext {
  id?: string;
  memberId?: string;
  name?: string;
  tier?: string;
  category?: string;
  memberCategory?: string;
  home_branch_id?: string;
  branch_id?: string;
  branchId?: string;
  branch?: string;
  homeBranch?: string;
  has_all_branch_access?: boolean;
}

export interface SessionAccessContext {
  id?: string;
  name?: string;
  className?: string;
  tier?: string;
  category?: string;
  branch_id?: string;
  branchId?: string;
  branch?: string;
  location?: string;
  allowed_tiers?: string[];
  allowedTiers?: string[];
}

export interface BookingValidationResult {
  allowed: boolean;
  status: number;
  error?: string;
  details?: {
    memberTier?: CanonicalTier;
    sessionTier?: CanonicalTier;
    allowedTiers?: CanonicalTier[];
    memberHomeBranch?: CanonicalBranchId | '';
    sessionBranch?: CanonicalBranchId | '';
    allowedBranches?: CanonicalBranchId[];
    [key: string]: any;
  };
}

/**
 * Strict Server-Side Booking Interceptor & Access Guard.
 * Enforces:
 * 1. Under-18s (Kids & Juniors):
 *    - Must book only at their assigned immutable home branch (Maxim or Mivida).
 *    - Tier check validates inclusion inside session's allowed_tiers.
 * 2. Adults:
 *    - Multi-branch access across Maxim, Mivida, and Impact.
 *    - Adult sessions only.
 */
export function validateBookingRules(
  member?: MemberAccessContext | null,
  session?: SessionAccessContext | null
): BookingValidationResult {
  const m = member || {};
  const s = session || {};

  const memberTier = toCanonicalTier(m.tier || m.memberCategory || m.category);
  const sessionTier = toCanonicalTier(s.tier || s.category || s.name);
  const sessionAllowedTiers = getSessionAllowedTiers(s);

  const memberHomeBranch = toCanonicalBranchId(
    m.home_branch_id || m.branch_id || m.branchId || m.homeBranch || m.branch
  );
  const sessionBranch = toCanonicalBranchId(
    s.branch_id || s.branchId || s.branch || s.location
  );

  const isAdult = memberTier === 'ADULT' || m.category?.toUpperCase() === 'ADULT';

  if (!isAdult) {
    // Under-18s (Kids, Kids Pro, Juniors, Juniors Pro):
    // Rule 1: Home branch isolation
    if (sessionBranch !== memberHomeBranch) {
      const branchLabel = m.homeBranch || (memberHomeBranch === 'strike_maxim' ? 'Maxim Compound' : memberHomeBranch === 'strike_mivida' ? 'Mivida' : memberHomeBranch);
      return {
        allowed: false,
        status: 403,
        error: `You are registered at ${branchLabel}. You cannot book sessions at other facilities.`,
        details: {
          memberHomeBranch,
          sessionBranch
        }
      };
    }

    // Rule 2: Tier check via allowed_tiers inclusion
    if (!sessionAllowedTiers.includes(memberTier)) {
      return {
        allowed: false,
        status: 403,
        error: `This session is reserved for tiers: ${sessionAllowedTiers.join(', ')}. Your plan is ${memberTier}.`,
        details: {
          memberTier,
          sessionTier,
          allowedTiers: sessionAllowedTiers
        }
      };
    }
  } else {
    // Adults:
    // Rule 1: Facility access across Maxim, Mivida, and Impact
    if (!ALLOWED_ADULT_BRANCHES.includes(sessionBranch as CanonicalBranchId)) {
      return {
        allowed: false,
        status: 403,
        error: 'This session branch is not available for Adult packages.',
        details: {
          sessionBranch,
          allowedBranches: ALLOWED_ADULT_BRANCHES
        }
      };
    }

    // Rule 2: Adult members cannot book youth sessions
    if (!sessionAllowedTiers.includes('ADULT')) {
      return {
        allowed: false,
        status: 403,
        error: 'Adult members cannot book youth sessions.',
        details: {
          memberTier: 'ADULT',
          sessionTier,
          allowedTiers: sessionAllowedTiers
        }
      };
    }
  }

  return {
    allowed: true,
    status: 200,
    details: {
      memberTier,
      sessionTier,
      allowedTiers: sessionAllowedTiers,
      memberHomeBranch,
      sessionBranch
    }
  };
}

/**
 * Dynamic Membership Status Calculator
 * Guarantees CRM & App parity:
 * - Frozen / On Hold -> HOLD
 * - validUntil < now OR sessionsLeft <= 0 (if session-based and not unlimited) -> EXPIRED
 * - Otherwise -> ACTIVE
 */
export function getEffectiveStatus(member: any): 'ACTIVE' | 'EXPIRED' | 'HOLD' {
  if (!member) return 'EXPIRED';
  const rawStatus = (member.status || '').toString().trim().toUpperCase();
  if (rawStatus === 'HOLD' || rawStatus === 'FROZEN') {
    return 'HOLD';
  }

  const now = new Date();

  // Check date expiration
  const validUntilStr = member.validUntil || member.expiryDate || member.expirationDate || member.endDate;
  if (validUntilStr) {
    const validUntil = new Date(validUntilStr);
    if (!isNaN(validUntil.getTime()) && validUntil < now) {
      return 'EXPIRED';
    }
  }

  // Check sessions left (if finite number provided)
  const sessionsLeft = member.sessionsLeft !== undefined ? Number(member.sessionsLeft) : undefined;
  const isUnlimited = member.isUnlimited === true || member.packageType?.toLowerCase?.().includes('unlimited');
  if (!isUnlimited && sessionsLeft !== undefined && !isNaN(sessionsLeft) && sessionsLeft <= 0) {
    return 'EXPIRED';
  }

  if (rawStatus === 'EXPIRED' || rawStatus === 'INACTIVE') {
    return 'EXPIRED';
  }

  return 'ACTIVE';
}
