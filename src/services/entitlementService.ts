import { db } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where, updateDoc, runTransaction, getDoc } from 'firebase/firestore';
import { Entitlement, EntitlementAdjustment, EntitlementStatus } from '../types/entitlement';
import { Package, SessionType } from '../types';
import { addAuditLog } from './auditService';
import { toValidDate, safeAddDays } from '../utils/dateUtils';
import { getTenantId } from '../firebase';

/**
 * Creates a new entitlement upon package purchase.
 */
export const createEntitlement = async (
  memberId: string,
  pkg: Package,
  paymentId: string,
  startDateIso: string,
  endDateIso?: string
): Promise<Entitlement> => {
  const entitlementRef = doc(collection(db, 'entitlements'));
  
  // Determine entitlement type from package category
  let type: Entitlement['type'] = 'membership';
  const pkgName = pkg.name.toLowerCase();
  if (pkgName.includes('pt') || pkgName.includes('personal training')) type = 'pt';
  else if (pkgName.includes('class') || pkgName.includes('group')) type = 'class';
  else if (pkgName.includes('nutrition')) type = 'nutrition';

  const isUnlimited = pkg.sessions === 0;

  const entitlement: Entitlement = {
    id: entitlementRef.id,
    memberId,
    productId: pkg.id,
    productName: pkg.name,
    type,
    status: 'pending', // Starts pending until payment is confirmed active
    sessionsTotal: isUnlimited ? 'unlimited' : pkg.sessions,
    sessionsUsed: 0,
    validFrom: startDateIso,
    validUntil: endDateIso,
    paymentId,
    createdAt: new Date().toISOString(),
    tenantId: getTenantId()
  };

  await setDoc(entitlementRef, entitlement);
  return entitlement;
};

/**
 * Activates an entitlement once payment is confirmed.
 */
export const activateEntitlement = async (entitlementId: string): Promise<void> => {
  const entitlementRef = doc(db, 'entitlements', entitlementId);
  await updateDoc(entitlementRef, { status: 'active' });
};

/**
 * Checks if a member has a valid entitlement for a specific service.
 */
export const checkEntitlement = async (
  memberId: string,
  serviceType: 'membership' | 'pt' | 'class' | 'nutrition'
): Promise<{ canBook: boolean; reason?: string; entitlement?: Entitlement }> => {
  try {
    const q = query(
      collection(db, 'entitlements'),
      where('memberId', '==', memberId),
      where('status', 'in', ['active']),
      where('type', '==', serviceType) // This logic might need refinement if 'membership' covers 'class' etc.
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return { canBook: false, reason: `No active ${serviceType} entitlement found.` };
    }

    // Find the first valid entitlement (not expired, has sessions)
    const now = new Date().getTime();
    for (const d of snapshot.docs) {
      const ent = d.data() as Entitlement;
      
      if (ent.validUntil && new Date(ent.validUntil).getTime() < now) {
        continue;
      }

      if (ent.sessionsTotal !== 'unlimited' && ent.sessionsUsed >= ent.sessionsTotal) {
        continue;
      }

      // Found a valid one!
      return { canBook: true, entitlement: ent };
    }

    return { canBook: false, reason: `No valid ${serviceType} entitlement has remaining sessions or validity.` };
  } catch (error) {
    console.error("Error checking entitlement:", error);
    return { canBook: false, reason: "Error verifying entitlement status." };
  }
};

/**
 * Deducts a session from an entitlement atomically.
 */
export const deductSession = async (
  entitlementId: string,
  amount: number = 1,
  reason: string,
  performedBy: string
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const entitlementRef = doc(db, 'entitlements', entitlementId);
    const snap = await transaction.get(entitlementRef);
    if (!snap.exists()) throw new Error("Entitlement not found");

    const ent = snap.data() as Entitlement;
    if (ent.status !== 'active') throw new Error("Entitlement is not active");
    
    if (ent.sessionsTotal !== 'unlimited') {
      if (ent.sessionsUsed + amount > ent.sessionsTotal) {
        throw new Error("Not enough sessions remaining");
      }
      transaction.update(entitlementRef, {
        sessionsUsed: ent.sessionsUsed + amount
      });
    }

    // Record adjustment
    const adjRef = doc(collection(db, `entitlements/${entitlementId}/adjustments`));
    const adj: EntitlementAdjustment = {
      id: adjRef.id,
      entitlementId,
      type: 'deduct',
      amount,
      reason,
      performedBy,
      createdAt: new Date().toISOString()
    };
    transaction.set(adjRef, adj);
  });
};

/**
 * Refunds an entitlement.
 */
export const refundEntitlement = async (
  entitlementId: string,
  reason: string,
  performedBy: string
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const entitlementRef = doc(db, 'entitlements', entitlementId);
    transaction.update(entitlementRef, { status: 'cancelled' });

    const adjRef = doc(collection(db, `entitlements/${entitlementId}/adjustments`));
    const adj: EntitlementAdjustment = {
      id: adjRef.id,
      entitlementId,
      type: 'refund',
      amount: 0,
      reason,
      performedBy,
      createdAt: new Date().toISOString()
    };
    transaction.set(adjRef, adj);
  });
};

/**
 * Freezes an entitlement.
 */
export const freezeEntitlement = async (
  entitlementId: string,
  reason: string,
  performedBy: string
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const entitlementRef = doc(db, 'entitlements', entitlementId);
    transaction.update(entitlementRef, { 
      status: 'frozen',
      frozenAt: new Date().toISOString()
    });

    const adjRef = doc(collection(db, `entitlements/${entitlementId}/adjustments`));
    const adj: EntitlementAdjustment = {
      id: adjRef.id,
      entitlementId,
      type: 'freeze',
      amount: 0,
      reason,
      performedBy,
      createdAt: new Date().toISOString()
    };
    transaction.set(adjRef, adj);
  });
};

/**
 * Unfreezes an entitlement and extends its validity.
 */
export const unfreezeEntitlement = async (
  entitlementId: string,
  reason: string,
  performedBy: string
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const entitlementRef = doc(db, 'entitlements', entitlementId);
    const snap = await transaction.get(entitlementRef);
    if (!snap.exists()) throw new Error("Entitlement not found");

    const ent = snap.data() as Entitlement;
    if (ent.status !== 'frozen' || !ent.frozenAt) {
      throw new Error("Entitlement is not frozen");
    }

    const now = new Date();
    const frozenAt = new Date(ent.frozenAt);
    const daysFrozen = Math.floor((now.getTime() - frozenAt.getTime()) / (1000 * 60 * 60 * 24));

    let newValidUntil = ent.validUntil;
    if (ent.validUntil) {
      const validUntilDate = safeAddDays(new Date(ent.validUntil), daysFrozen);
      newValidUntil = validUntilDate.toISOString();
    }

    transaction.update(entitlementRef, { 
      status: 'active',
      unfreezeAt: now.toISOString(),
      validUntil: newValidUntil
    });

    const adjRef = doc(collection(db, `entitlements/${entitlementId}/adjustments`));
    const adj: EntitlementAdjustment = {
      id: adjRef.id,
      entitlementId,
      type: 'unfreeze',
      amount: daysFrozen, // Records how many days it was extended by
      reason,
      performedBy,
      createdAt: now.toISOString()
    };
    transaction.set(adjRef, adj);
  });
};

/**
 * Batch job to expire old entitlements.
 */
export const checkExpiredEntitlements = async (): Promise<void> => {
  try {
    const now = new Date().toISOString();
    const q = query(
      collection(db, 'entitlements'),
      where('status', 'in', ['pending', 'active']),
      where('validUntil', '<', now)
    );
    const snapshot = await getDocs(q);
    
    for (const docSnap of snapshot.docs) {
      await updateDoc(docSnap.ref, { status: 'expired' });
    }
  } catch (error) {
    console.error("Error checking expired entitlements:", error);
  }
};
