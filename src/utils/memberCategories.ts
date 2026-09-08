export type MemberCategory = 'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults';

export const MEMBER_CATEGORIES: MemberCategory[] = [
  'Kids Only',
  'Kids Pro',
  'Junior Only',
  'Junior Advanced',
  'Adults'
];

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
 * - Kids Only: ONLY standard Kids classes (no Pro, no Adults, no Juniors)
 * - Kids Pro: Kids Only + Kids Pro classes (no Adults, no Juniors)
 * - Junior Only: ONLY standard Junior classes (no Advanced/Pro, no Kids, no Adults)
 * - Junior Advanced: Junior Only + Junior Advanced/Pro (no Kids, no Adults)
 * - Adults: Adult classes only (no Kids, no Juniors)
 */
export function isSessionTierAllowed(
  session: { tier?: string; allowedTiers?: string[]; name?: string; category?: string },
  memberCategory: string
): boolean {
  const normCategory = normalizeMemberCategory(memberCategory);
  const sessionTier = (session.tier || '').trim().toLowerCase();
  const allowed = Array.isArray(session.allowedTiers) 
    ? session.allowedTiers.map(t => t.trim().toLowerCase()) 
    : [];
  const sessionName = (session.name || '').trim().toLowerCase();
  const sessionCat = (session.category || '').trim().toLowerCase();

  // Explicit 'All' or 'All Tiers' tag
  if (sessionTier === 'all' || sessionTier === 'all tiers' || allowed.includes('all') || allowed.includes('all tiers')) {
    return true;
  }

  // If session explicitly lists this member's category in allowedTiers, it is allowed!
  const normCatLower = normCategory.toLowerCase();
  if (
    allowed.includes(normCatLower) || 
    (normCategory === 'Junior Only' && (allowed.includes('junior only') || allowed.includes('juniors only') || allowed.includes('juniors') || allowed.includes('junior'))) || 
    (normCategory === 'Kids Only' && (allowed.includes('kids only') || allowed.includes('kids') || allowed.includes('kid')))
  ) {
    return true;
  }

  // 1. Kids Only (Standard Kids)
  if (normCategory === 'Kids Only') {
    if (sessionTier === 'adults' || allowed.includes('adults') || sessionName.includes('adult') || sessionCat.includes('adult')) return false;
    if (sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior') || sessionCat.includes('junior')) return false;
    // In Strike, "Kids / Pro Boxing" is open to all Kids
    return sessionTier.includes('kid') || allowed.some(t => t.includes('kid')) || sessionName.includes('kid') || sessionCat.includes('kid');
  }

  // 2. Kids Pro
  if (normCategory === 'Kids Pro') {
    if (sessionTier === 'adults' || allowed.includes('adults') || sessionName.includes('adult') || sessionCat.includes('adult')) return false;
    if (sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior') || sessionCat.includes('junior')) return false;
    return sessionTier.includes('kid') || allowed.some(t => t.includes('kid')) || sessionName.includes('kid') || sessionCat.includes('kid');
  }

  // 3. Junior Only
  if (normCategory === 'Junior Only') {
    if (sessionTier.includes('kid') || allowed.some(t => t.includes('kid')) || sessionName.includes('kid') || sessionCat.includes('kid')) return false;
    if (sessionTier === 'adults' || allowed.includes('adults') || sessionName.includes('adult') || sessionCat.includes('adult')) return false;
    // In Strike, "Juniors / Advanced Boxing" is open to all Juniors
    return sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior') || sessionCat.includes('junior');
  }

  // 4. Junior Advanced
  if (normCategory === 'Junior Advanced') {
    if (sessionTier.includes('kid') || allowed.some(t => t.includes('kid')) || sessionName.includes('kid') || sessionCat.includes('kid')) return false;
    if (sessionTier === 'adults' || allowed.includes('adults') || sessionName.includes('adult') || sessionCat.includes('adult')) return false;
    return sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior') || sessionCat.includes('junior');
  }

  // 5. Adults
  if (normCategory === 'Adults') {
    if (sessionTier.includes('kid') || allowed.some(t => t.includes('kid')) || sessionName.includes('kid') || sessionCat.includes('kid')) return false;
    if (sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior') || sessionCat.includes('junior')) return false;
    return true;
  }

  return true;
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
  // Check active status (if is_active/isActive is set, must be truthy)
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
  // Fallback: If package is not branch-restricted (branch === 'ALL', is_all_branches = true, or no branch), it populates for all branches
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

  // If user selected "All Branches", show all packages
  const sBranchNorm = normalizeBranchName(selectedBranch);
  if (!selectedBranch || selectedBranch === 'All Branches' || selectedBranch === 'ALL' || sBranchNorm === 'all') {
    return true;
  }

  // Check branch match
  const pkgBranchNorm = normalizeBranchName(pkg.branch || pkg.branch_id || pkg.branchId);
  return pkgBranchNorm === sBranchNorm;
}

/**
 * Strict Branch / Location Gating check (Booking Engine RBAC):
 * - Kids / Juniors / Kids Pro / Juniors Pro:
 *   Enforce session.branch_id == member.home_branch_id.
 *   Block access to all sessions outside their assigned home facility (e.g. Mivida members only see Mivida schedules).
 * - Adults:
 *   Set member.has_multi_branch_access = TRUE.
 *   Allow Adult memberships to retrieve schedules and reserve slots across all 3 branches without restriction.
 */
export function isSessionBranchAllowed(
  sessionBranch: string | undefined,
  memberBranch: string | undefined,
  isMultiBranch: boolean = false,
  memberCategory?: string
): boolean {
  // Adult members automatically receive multi-branch access across all 3 branches
  const normCat = memberCategory ? normalizeMemberCategory(memberCategory) : undefined;
  if (isMultiBranch || normCat === 'Adults') {
    return true;
  }

  const sRaw = (sessionBranch || '').trim().toLowerCase();
  const mRaw = (memberBranch || '').trim().toLowerCase();

  // Open to all branches
  if (!sRaw || sRaw === 'all' || sRaw === 'all branches') return true;

  // Member has no branch constraint (fallback)
  if (!mRaw || mRaw === 'all' || mRaw === 'all branches') return true;

  const sNorm = normalizeBranchName(sessionBranch);
  const mNorm = normalizeBranchName(memberBranch);
  if (sNorm && mNorm && sNorm === mNorm) return true;

  return sRaw === mRaw;
}
