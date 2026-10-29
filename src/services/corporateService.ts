import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { db, getTenantId } from '../firebase';
import { CorporateAccount, CorporateBenefitCalculationResult } from '../types/corporate';
import { cleanData } from '../utils';

const COLLECTION_NAME = 'corporateAccounts';

/**
 * Fetch all corporate accounts for the specified tenant.
 */
export async function getCorporateAccounts(tenantId: string): Promise<CorporateAccount[]> {
  try {
    const colRef = collection(db, COLLECTION_NAME);
    const snapshot = await getDocs(colRef);
    let accounts: CorporateAccount[] = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    } as CorporateAccount));

    const effectiveTenantId = tenantId || getTenantId();
    if (effectiveTenantId && effectiveTenantId !== 'all') {
      accounts = accounts.filter(acc => !acc.tenantId || acc.tenantId === effectiveTenantId);
    }

    return accounts.sort((a, b) => a.companyName.localeCompare(b.companyName));
  } catch (error) {
    console.error('[corporateService] Error getting corporate accounts:', error);
    throw error;
  }
}

/**
 * Real-time subscription to corporate accounts for the specified tenant.
 */
export function subscribeCorporateAccounts(
  tenantId: string,
  callback: (accounts: CorporateAccount[]) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, COLLECTION_NAME);
  const effectiveTenantId = tenantId || getTenantId();

  return onSnapshot(
    colRef,
    (snapshot) => {
      let accounts: CorporateAccount[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as CorporateAccount));

      if (effectiveTenantId && effectiveTenantId !== 'all') {
        accounts = accounts.filter(acc => !acc.tenantId || acc.tenantId === effectiveTenantId);
      }

      accounts.sort((a, b) => a.companyName.localeCompare(b.companyName));
      callback(accounts);
    },
    (err) => {
      console.error('[corporateService] Subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Create a new corporate account under the specified tenant.
 */
export async function createCorporateAccount(
  tenantId: string,
  account: Omit<CorporateAccount, 'id' | 'createdAt'>
): Promise<string> {
  try {
    const colRef = collection(db, COLLECTION_NAME);
    const nowIso = new Date().toISOString();
    const effectiveTenantId = tenantId || getTenantId();

    const payload = cleanData({
      ...account,
      tenantId: effectiveTenantId,
      corporateCode: (account.corporateCode || '').trim().toUpperCase(),
      isActive: account.isActive ?? true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const docRef = await addDoc(colRef, payload);
    return docRef.id;
  } catch (error) {
    console.error('[corporateService] Error creating corporate account:', error);
    throw error;
  }
}

/**
 * Update an existing corporate account.
 */
export async function updateCorporateAccount(
  tenantId: string,
  id: string,
  updates: Partial<CorporateAccount>
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const payload = cleanData({
      ...updates,
      ...(updates.corporateCode ? { corporateCode: updates.corporateCode.trim().toUpperCase() } : {}),
      updatedAt: new Date().toISOString(),
    });

    await updateDoc(docRef, payload);
  } catch (error) {
    console.error(`[corporateService] Error updating corporate account ${id}:`, error);
    throw error;
  }
}

/**
 * Delete a corporate account.
 */
export async function deleteCorporateAccount(
  tenantId: string,
  id: string
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`[corporateService] Error deleting corporate account ${id}:`, error);
    throw error;
  }
}

/**
 * Calculate corporate benefits and applied discount for a gym package.
 */
export function applyCorporateBenefitsToPackage(
  pkg: any,
  corporate: CorporateAccount
): CorporateBenefitCalculationResult {
  const basePrice = Number(pkg?.price ?? 0);

  // If corporate account is inactive or benefits are not configured, return base package values
  if (!corporate || !corporate.isActive || !corporate.benefits) {
    return {
      discountedPrice: basePrice,
      extraDurationDays: 0,
      extraFreezeDays: 0,
      extraPtSessions: 0,
      extraGuestPasses: 0,
    };
  }

  const { benefits } = corporate;

  // Check package eligibility if eligiblePackageIds is defined and non-empty
  if (
    benefits.eligiblePackageIds &&
    benefits.eligiblePackageIds.length > 0 &&
    pkg?.id &&
    !benefits.eligiblePackageIds.includes(pkg.id)
  ) {
    return {
      discountedPrice: basePrice,
      extraDurationDays: 0,
      extraFreezeDays: 0,
      extraPtSessions: 0,
      extraGuestPasses: 0,
    };
  }

  // Calculate price after discount
  let discountedPrice = basePrice;
  const discountVal = Number(benefits.discountValue ?? 0);

  if (benefits.discountType === 'percentage') {
    const discountAmount = (basePrice * discountVal) / 100;
    discountedPrice = Math.max(0, basePrice - discountAmount);
  } else if (benefits.discountType === 'fixed') {
    discountedPrice = Math.max(0, basePrice - discountVal);
  }

  discountedPrice = Math.round(discountedPrice * 100) / 100;

  return {
    discountedPrice,
    extraDurationDays: Number(benefits.extraDurationDays ?? 0),
    extraFreezeDays: Number(benefits.extraFreezeDays ?? 0),
    extraPtSessions: Number(benefits.extraPtSessions ?? 0),
    extraGuestPasses: Number(benefits.extraGuestPasses ?? 0),
  };
}

/**
 * Helper to match corporate account by corporate code (case-insensitive).
 */
export async function getCorporateAccountByCode(
  tenantId: string,
  code: string
): Promise<CorporateAccount | null> {
  const accounts = await getCorporateAccounts(tenantId);
  const normalized = (code || '').trim().toUpperCase();
  return accounts.find(a => a.isActive && a.corporateCode.trim().toUpperCase() === normalized) || null;
}

/**
 * Helper to match corporate account by member email domain (e.g. "@cibeg.com").
 */
export async function getCorporateAccountByEmailDomain(
  tenantId: string,
  email: string
): Promise<CorporateAccount | null> {
  if (!email || !email.includes('@')) return null;
  const emailDomain = email.substring(email.indexOf('@')).toLowerCase();
  const accounts = await getCorporateAccounts(tenantId);
  return accounts.find(a => {
    if (!a.isActive || !a.domain) return false;
    let d = a.domain.trim().toLowerCase();
    if (!d.startsWith('@')) d = '@' + d;
    return d === emailDomain;
  }) || null;
}
