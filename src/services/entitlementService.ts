import { db } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where, updateDoc, runTransaction, getDoc } from 'firebase/firestore';
import { Entitlement, EntitlementAdjustment, EntitlementStatus } from '../types/entitlement';
import { Package, SessionType } from '../types';
import { addAuditLog } from './auditService';
import { toValidDate, safeAddDays, safeParseExpiryToEndOfDay } from '../utils/dateUtils';
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
 * Supports both the dedicated 'entitlements' collection and direct client record
 * packages / session balances (used by Strike Gym).
 */
export const checkEntitlement = async (
  memberId: string,
  serviceType: 'membership' | 'pt' | 'class' | 'nutrition'
): Promise<{ canBook: boolean; reason?: string; entitlement?: Entitlement }> => {
  try {
    const now = new Date().getTime();

    // 1. Check dedicated entitlements collection
    const q = query(
      collection(db, 'entitlements'),
      where('memberId', '==', memberId),
      where('status', 'in', ['active']),
      where('type', '==', serviceType)
    );

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      for (const d of snapshot.docs) {
        const ent = d.data() as Entitlement;
        
        if (ent.validUntil) {
          const entEnd = safeParseExpiryToEndOfDay(ent.validUntil);
          if (entEnd && entEnd.getTime() < now) {
            continue;
          }
        }

        if (ent.sessionsTotal !== 'unlimited' && ent.sessionsUsed >= ent.sessionsTotal) {
          continue;
        }

        // Found a valid entitlement document
        return { canBook: true, entitlement: ent };
      }
    }

    // 2. Fallback for Strike & direct client-level packages or session balances
    const clientRef = doc(db, 'clients', memberId);
    const clientSnap = await getDoc(clientRef);
    if (clientSnap.exists()) {
      const client = clientSnap.data();
      const statusLower = (client.status || '').toLowerCase();
      if (statusLower === 'expired') {
        return { canBook: false, reason: 'Your membership has expired. Please renew your package.' };
      }
      if (statusLower === 'frozen' || statusLower === 'suspended') {
        return { canBook: false, reason: `Your membership is currently ${statusLower}. Please contact the front desk.` };
      }

      // Check client-level membership expiry with end-of-day tolerance
      if (client.membershipExpiry) {
        const expDate = safeParseExpiryToEndOfDay(client.membershipExpiry);
        if (expDate && expDate.getTime() < now) {
          return { canBook: false, reason: 'Your membership has expired. Please renew your package.' };
        }
      }

      if (serviceType === 'pt') {
        // Inspect packages array for PT
        const packages: any[] = Array.isArray(client.packages) ? client.packages : [];
        for (const pkg of packages) {
          const pkgStatus = (pkg.status || '').toLowerCase();
          if (pkgStatus === 'expired' || pkgStatus === 'inactive' || pkgStatus === 'cancelled') continue;
          if (pkg.endDate) {
            const pkgEnd = safeParseExpiryToEndOfDay(pkg.endDate);
            if (pkgEnd && pkgEnd.getTime() < now) continue;
          }

          const isPtPkg = pkg.type === 'pt' || pkg.isPT === true || 
            (pkg.name || '').toLowerCase().includes('pt') || 
            (pkg.packageName || '').toLowerCase().includes('pt') || 
            (pkg.name || '').toLowerCase().includes('private') || 
            (pkg.packageName || '').toLowerCase().includes('private');

          if (isPtPkg) {
            if (pkg.sessionsTotal !== 'unlimited' && pkg.sessionsRemaining !== undefined && pkg.sessionsRemaining <= 0) continue;
            return {
              canBook: true,
              entitlement: {
                id: `pkg-${pkg.id || pkg.packageId || 'pt-direct'}`,
                memberId,
                productId: pkg.id || pkg.packageId || 'pt-package',
                productName: pkg.name || pkg.packageName || 'Personal Training',
                type: 'pt',
                status: 'active',
                sessionsTotal: pkg.sessionsTotal ?? 'unlimited',
                sessionsUsed: pkg.usedSessions ?? 0,
                validFrom: pkg.startDate || new Date().toISOString(),
                validUntil: pkg.endDate || client.membershipExpiry,
                createdAt: new Date().toISOString(),
                tenantId: getTenantId()
              }
            };
          }
        }

        const rawPtRemaining = client.ptSessionsRemaining ?? client.sessionsRemaining;
        const hasPtSessions = typeof rawPtRemaining === 'number' && rawPtRemaining > 0;
        const isUnlimitedPt = client.membershipType === 'unlimited_pt';

        if (hasPtSessions || isUnlimitedPt) {
          return {
            canBook: true,
            entitlement: {
              id: `client-pt-${memberId}`,
              memberId,
              productId: 'client-pt-balance',
              productName: 'Personal Training Session',
              type: 'pt',
              status: 'active',
              sessionsTotal: isUnlimitedPt ? 'unlimited' : rawPtRemaining,
              sessionsUsed: 0,
              validFrom: new Date().toISOString(),
              validUntil: client.membershipExpiry,
              createdAt: new Date().toISOString(),
              tenantId: getTenantId()
            }
          };
        }

        return { canBook: false, reason: "No active Personal Training package or remaining sessions found." };
      }

      if (serviceType === 'class') {
        const packages: any[] = Array.isArray(client.packages) ? client.packages : [];
        for (const pkg of packages) {
          const pkgStatus = (pkg.status || '').toLowerCase();
          if (pkgStatus === 'expired' || pkgStatus === 'inactive' || pkgStatus === 'cancelled') continue;
          if (pkg.endDate) {
            const pkgEnd = safeParseExpiryToEndOfDay(pkg.endDate);
            if (pkgEnd && pkgEnd.getTime() < now) continue;
          }

          if (pkg.sessionsTotal !== 'unlimited' && pkg.sessionsRemaining !== undefined && pkg.sessionsRemaining <= 0) continue;
          return {
            canBook: true,
            entitlement: {
              id: `pkg-${pkg.id || pkg.packageId || 'class-direct'}`,
              memberId,
              productId: pkg.id || pkg.packageId || 'class-package',
              productName: pkg.name || pkg.packageName || 'Class Package',
              type: 'class',
              status: 'active',
              sessionsTotal: pkg.sessionsTotal ?? 'unlimited',
              sessionsUsed: pkg.usedSessions ?? 0,
              validFrom: pkg.startDate || new Date().toISOString(),
              validUntil: pkg.endDate || client.membershipExpiry,
              createdAt: new Date().toISOString(),
              tenantId: getTenantId()
            }
          };
        }

        const rawRemaining = client.sessionsRemaining;
        const hasRemaining = (typeof rawRemaining === 'number' && rawRemaining > 0) || rawRemaining === 'unlimited';
        const isUnlimited = client.membershipType === 'unlimited' || client.isUnlimited === true;

        if (hasRemaining || isUnlimited) {
          return {
            canBook: true,
            entitlement: {
              id: `client-class-${memberId}`,
              memberId,
              productId: 'client-class-balance',
              productName: 'Class Booking Pass',
              type: 'class',
              status: 'active',
              sessionsTotal: isUnlimited ? 'unlimited' : rawRemaining,
              sessionsUsed: 0,
              validFrom: new Date().toISOString(),
              validUntil: client.membershipExpiry,
              createdAt: new Date().toISOString(),
              tenantId: getTenantId()
            }
          };
        }

        return { canBook: false, reason: "No active class package or remaining sessions found." };
      }

      // General membership service type
      if (statusLower === 'active' || statusLower === 'nearly expired') {
        return {
          canBook: true,
          entitlement: {
            id: `client-mem-${memberId}`,
            memberId,
            productId: 'client-membership',
            productName: client.packageType || 'Membership',
            type: serviceType,
            status: 'active',
            sessionsTotal: 'unlimited',
            sessionsUsed: 0,
            validFrom: new Date().toISOString(),
            validUntil: client.membershipExpiry,
            createdAt: new Date().toISOString(),
            tenantId: getTenantId()
          }
        };
      }
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
