import { toCanonicalBranchId, CanonicalBranchId } from './memberCategories';

export const BRANCH_CANONICAL_TO_DISPLAY: Record<string, string> = {
  strike_maxim: 'Maxim Compound',
  maxim: 'Maxim Compound',
  'maxim compound': 'Maxim Compound',
  strike_mivida: 'Mivida Compound',
  mivida: 'Mivida Compound',
  'mivida compound': 'Mivida Compound',
  impact: 'Impact by Strike',
  'impact by strike': 'Impact by Strike',
  playa: 'Playa North Cost',
  'playa north cost': 'Playa North Cost',
};

/**
 * Normalizes any branch identifier or raw string into the canonical display branch name.
 * Preserves custom tenant branch names (e.g. for Inzan Athletics) if no alias match is found.
 */
export function normalizeBranchName(rawBranch?: string | null): string {
  if (!rawBranch || typeof rawBranch !== 'string') return '';
  const trimmed = rawBranch.trim();
  const lower = trimmed.toLowerCase();
  
  if (BRANCH_CANONICAL_TO_DISPLAY[lower]) {
    return BRANCH_CANONICAL_TO_DISPLAY[lower];
  }
  if (lower.includes('maxim') || lower.includes('complex')) {
    return 'Maxim Compound';
  }
  if (lower.includes('mivida') || lower.includes('mvida')) {
    return 'Mivida Compound';
  }
  if (lower.includes('impact')) {
    return 'Impact by Strike';
  }
  if (lower.includes('playa')) {
    return 'Playa North Cost';
  }
  return trimmed;
}

/**
 * Robustly resolves the branch name for a payment record.
 * Checks payment.branchId, payment.branch, payment.clientBranch, and client.branch/branchId.
 * Guarantees that payments from expired members and walk-in guests are never labeled 'Unknown'
 * when branch information is present on the payment record.
 */
export function resolvePaymentBranch(
  payment?: { branch?: string; clientBranch?: string; branchId?: string; [key: string]: any } | null,
  client?: { branch?: string; branchId?: string; [key: string]: any } | null
): string {
  // 1. Direct payment.branchId
  if (payment?.branchId) {
    const norm = normalizeBranchName(payment.branchId);
    if (norm) return norm;
  }

  // 2. Direct payment.branch
  if (payment?.branch) {
    const norm = normalizeBranchName(payment.branch);
    if (norm) return norm;
  }

  // 3. Direct payment.clientBranch
  if (payment?.clientBranch) {
    const norm = normalizeBranchName(payment.clientBranch);
    if (norm) return norm;
  }

  // 4. Associated client branch / branchId
  if (client?.branch) {
    const norm = normalizeBranchName(client.branch);
    if (norm) return norm;
  }
  if (client?.branchId) {
    const norm = normalizeBranchName(client.branchId);
    if (norm) return norm;
  }

  return 'Unknown';
}
