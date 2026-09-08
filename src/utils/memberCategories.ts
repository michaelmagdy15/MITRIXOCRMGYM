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

  // Explicit 'All' or 'All Tiers' tag
  if (sessionTier === 'all' || sessionTier === 'all tiers' || allowed.includes('all') || allowed.includes('all tiers')) {
    return true;
  }

  // 1. Kids Only (Standard Kids)
  if (normCategory === 'Kids Only') {
    if (sessionTier === 'kids pro' || allowed.includes('kids pro') || sessionName.includes('pro')) return false;
    if (sessionTier === 'adults' || allowed.includes('adults') || sessionName.includes('adult')) return false;
    if (sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior')) return false;
    return sessionTier === 'kids only' || sessionTier === 'kids' || allowed.includes('kids only') || allowed.includes('kids') || sessionName.includes('kid');
  }

  // 2. Kids Pro
  if (normCategory === 'Kids Pro') {
    if (sessionTier === 'adults' || allowed.includes('adults') || sessionName.includes('adult')) return false;
    if (sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior')) return false;
    return sessionTier === 'kids pro' || sessionTier === 'kids only' || sessionTier === 'kids' || 
           allowed.includes('kids pro') || allowed.includes('kids only') || allowed.includes('kids') ||
           sessionName.includes('kid');
  }

  // 3. Junior Only
  if (normCategory === 'Junior Only') {
    if (sessionTier.includes('advanced') || sessionTier.includes('pro') || allowed.some(t => t.includes('advanced') || t.includes('pro')) || sessionName.includes('pro') || sessionName.includes('advanced')) return false;
    if (sessionTier.includes('kid') || allowed.some(t => t.includes('kid')) || sessionName.includes('kid')) return false;
    if (sessionTier === 'adults' || allowed.includes('adults') || sessionName.includes('adult')) return false;
    return sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior');
  }

  // 4. Junior Advanced
  if (normCategory === 'Junior Advanced') {
    if (sessionTier.includes('kid') || allowed.some(t => t.includes('kid')) || sessionName.includes('kid')) return false;
    if (sessionTier === 'adults' || allowed.includes('adults') || sessionName.includes('adult')) return false;
    return sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior');
  }

  // 5. Adults
  if (normCategory === 'Adults') {
    if (sessionTier.includes('kid') || allowed.some(t => t.includes('kid')) || sessionName.includes('kid')) return false;
    if (sessionTier.includes('junior') || allowed.some(t => t.includes('junior')) || sessionName.includes('junior')) return false;
    return true;
  }

  return true;
}

/**
 * Normalizes branch names so variations ("Maxim", "Maxim Compound", "Strike Maxim") match.
 */
export function normalizeBranchName(branch?: string): string {
  if (!branch) return '';
  const lower = branch.trim().toLowerCase();
  if (lower.includes('maxim')) return 'maxim';
  if (lower.includes('mivida') || lower.includes('mvida')) return 'mivida';
  if (lower.includes('impact')) return 'impact';
  if (lower.includes('envida')) return 'envida';
  return lower;
}

/**
 * Strict Branch / Location Gating check.
 * Enforces that members assigned to specific branches can only view & book
 * sessions located at that branch, excluding other branches unless
 * multi-branch access is enabled.
 */
export function isSessionBranchAllowed(
  sessionBranch: string | undefined,
  memberBranch: string | undefined,
  isMultiBranch: boolean = false
): boolean {
  if (isMultiBranch) return true;
  const sRaw = (sessionBranch || '').trim().toLowerCase();
  const mRaw = (memberBranch || '').trim().toLowerCase();

  // Open to all branches
  if (!sRaw || sRaw === 'all' || sRaw === 'all branches') return true;

  // Member has no branch constraint
  if (!mRaw || mRaw === 'all' || mRaw === 'all branches') return true;

  const sNorm = normalizeBranchName(sessionBranch);
  const mNorm = normalizeBranchName(memberBranch);
  if (sNorm && mNorm && sNorm === mNorm) return true;

  return sRaw === mRaw;
}
