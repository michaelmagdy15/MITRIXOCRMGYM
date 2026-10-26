import { runTransaction, doc, collection, query, where, getDocs, setDoc, addDoc } from 'firebase/firestore';
import { db, getTenantId } from '../firebase';
import { cleanData } from '../utils';
import { Payment, Package } from '../types';
import { addAuditLog } from './auditService';
import { buildEntitlementPayload, inferEntitlementType } from './entitlementService';
import { buildPackageSnapshotForClient } from '../utils/packageVersioning';
import { PaymentCategory, resolvePaymentCategory } from '../utils/paymentCategories';
import { toCanonicalBranchId } from '../utils/memberCategories';
import { normalizeBranchName } from '../utils/branchUtils';
import { toValidDate, safeIsoDate, safeAddDays, safeFormatDate } from '../utils/dateUtils';

/**
 * Transaction Service: Handles member package upgrades and payments
 *
 * UPGRADE FLOW (Option A - Preferred):
 * 1. Member upgrade initiated from Members tab (Clients.tsx) or Payments tab (Payments.tsx)
 * 2. Calls processPaymentTransaction with isUpgradePayment: true
 * 3. Finds and updates previous active package payments to the new package category & name
 * 4. Expires only the previous active package and creates new active package
 * 5. Uses runTransaction for read-write isolation to prevent concurrent update conflicts (race conditions)
 *
 * MANUAL PAYMENT FLOW:
 * 1. Payment manually added from Payments tab (Payments.tsx)
 * 2. Calls processPaymentTransaction with isUpgradePayment: false (default)
 * 3. Validates that no active package exists for the same type (prevents duplicates)
 * 4. If validation fails, throws error - user must upgrade from Members tab or expire existing package
 */

export interface PaymentTransactionParams {
  clientId: string;
  clientName: string;
  clientBranch?: string;
  branch?: string;
  branchId?: string;
  clientStatus?: string;
  clientPackages?: any[];

  amount: number;
  /** Original catalogue/gross amount before discount (for audit/receipts). */
  originalAmount?: number;
  method: Payment['method'];
  instapayRef?: string;

  packageType: string;
  packageCategory: PaymentCategory;
  coachId?: string;
  coachName?: string;
  notes?: string;
  receiptSerial?: string;

  sales_rep_id: string;
  salesName: string;
  recordedBy: string;
  recordedByName: string; // for the comment author

  paymentDate: string; // ISO
  startDate: string; // ISO
  endDate?: string; // ISO

  amount_paid?: number; // Actual amount collected, defaults to amount if full

  discountType?: 'percentage' | 'amount';
  discountValue?: number;
  discountedAmount?: number;

  isMemberOnHold?: boolean;
  isUpgradePayment?: boolean; // True when payment is from Members tab upgrade (not manual Payments entry)
  isRenewal?: boolean; // True when payment is renewing an existing package
  isGuest?: boolean; // True when payment is for a drop-in / walk-in guest without a member profile
  systemPackage?: Package; // The matched package configuration, if any
  previousPackageName?: string;
  corporateProofUrl?: string;
  discountReason?: string;
  paymentStatus?: 'paid' | 'pending' | 'failed';
  isComplimentary?: boolean;
  installments?: any[];
  secondaryMethod?: Payment['method'];
  primaryTenderAmount?: number;
  secondaryTenderAmount?: number;
  /** Idempotency key. If a payment already exists with this key, the transaction is skipped. */
  operationId?: string;
}

export interface ResolvedCoachAssignment {
  coachUserId?: string;
  coachDocId?: string;
  coachCustomId?: string;
  coachName: string;
  effectiveCoachId: string;
}

export async function resolveCoachAssignmentInfo(
  coachNameInput?: string,
  coachIdInput?: string
): Promise<ResolvedCoachAssignment | null> {
  const cleanName = (coachNameInput || '').trim();
  const cleanId = (coachIdInput || '').trim();
  if ((!cleanName || cleanName.toLowerCase() === 'unassigned') && (!cleanId || cleanId.toLowerCase() === 'unassigned')) {
    return null;
  }

  let coachUserId: string | undefined;
  let coachDocId: string | undefined;
  let coachCustomId: string | undefined;
  let resolvedName = cleanName && cleanName.toLowerCase() !== 'unassigned' ? cleanName : '';

  try {
    const [coachesSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, 'coaches')),
      getDocs(query(collection(db, 'users'), where('role', 'in', ['coach', 'trainer', 'fitness_manager']))),
    ]);

    const nameLower = resolvedName.toLowerCase();

    for (const d of coachesSnap.docs) {
      const data = d.data() as any;
      const cName = String(data.name || '').trim();
      const matchesId = cleanId && (d.id === cleanId || data.userId === cleanId || data.coachId === cleanId);
      const matchesName = nameLower && cName.toLowerCase() === nameLower;
      if (matchesId || matchesName) {
        coachDocId = d.id;
        if (data.userId) coachUserId = data.userId;
        if (data.coachId) coachCustomId = data.coachId;
        if (cName && !resolvedName) resolvedName = cName;
        break;
      }
    }

    for (const d of usersSnap.docs) {
      const data = d.data() as any;
      const uId = String(data.id || d.id).trim();
      const uName = String(data.name || data.email || '').trim();
      const matchesId =
        (cleanId && (uId === cleanId || d.id === cleanId || data.coachId === cleanId)) ||
        (coachUserId && (uId === coachUserId || d.id === coachUserId));
      const matchesName = (resolvedName && uName.toLowerCase() === resolvedName.toLowerCase()) || (nameLower && uName.toLowerCase() === nameLower);
      if (matchesId || matchesName) {
        coachUserId = uId || d.id;
        if (data.coachId && !coachCustomId) coachCustomId = data.coachId;
        if (uName && !resolvedName) resolvedName = uName;
        break;
      }
    }
  } catch (err) {
    console.warn('[resolveCoachAssignmentInfo] Could not query coaches/users for coach resolution:', err);
  }

  if (!resolvedName && cleanId) {
    resolvedName = cleanId;
  }
  if (!resolvedName) return null;

  const effectiveCoachId = coachUserId || coachDocId || (cleanId && cleanId.toLowerCase() !== 'unassigned' ? cleanId : resolvedName);
  return {
    coachUserId,
    coachDocId,
    coachCustomId,
    coachName: resolvedName,
    effectiveCoachId,
  };
}

export async function notifyCoachClientAssigned(params: {
  coachId?: string;
  coachUserId?: string;
  coachDocId?: string;
  coachCustomId?: string;
  coachName: string;
  clientId: string;
  clientName: string;
  memberId?: string;
  packageName?: string;
  sessionsTotal?: number | string;
  branch?: string;
  assignedBy?: string;
}): Promise<void> {
  if (!params.coachName || params.coachName.toLowerCase() === 'unassigned') return;
  const nowIso = new Date().toISOString();
  const recipientUid = params.coachUserId || params.coachId || params.coachDocId || '';
  const pkgLabel = params.packageName || 'Personal Training Package';
  const sessionsSuffix =
    params.sessionsTotal !== undefined && params.sessionsTotal !== '' && params.sessionsTotal !== 0
      ? ` (${params.sessionsTotal} sessions)`
      : '';
  const title = `🏋️ New PT Client Assigned: ${params.clientName}`;
  const body = `${params.clientName}${params.memberId ? ` (#${params.memberId})` : ''} has been assigned to you for "${pkgLabel}"${sessionsSuffix}${params.assignedBy ? ` by ${params.assignedBy}` : ''}.`;

  try {
    await addDoc(
      collection(db, 'notifications'),
      cleanData({
        type: 'coach_client_assigned',
        recipientUid,
        recipientId: recipientUid,
        coachId: recipientUid || params.coachDocId || params.coachName,
        coachDocId: params.coachDocId || undefined,
        coachCustomId: params.coachCustomId || undefined,
        coachName: params.coachName,
        clientId: params.clientId,
        clientName: params.clientName,
        memberId: params.memberId || undefined,
        packageName: pkgLabel,
        sessionsTotal: params.sessionsTotal,
        branch: params.branch || undefined,
        title,
        body,
        description: body,
        message: body,
        read: false,
        assignedBy: params.assignedBy || 'Staff',
        createdAt: nowIso,
        tenantId: getTenantId(),
      })
    );
  } catch (err) {
    console.warn('[notifyCoachClientAssigned] Failed to write coach notification document:', err);
  }

  if (recipientUid && typeof window !== 'undefined' && 'fetch' in window) {
    try {
      await fetch('/api/proxy-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: recipientUid,
          title,
          body,
          data: {
            type: 'coach_client_assigned',
            clientId: params.clientId,
            clientName: params.clientName,
            packageName: pkgLabel,
          },
        }),
      }).catch(() => {});
    } catch {}
  }
}

export const processPaymentTransaction = async (params: PaymentTransactionParams): Promise<void> => {
  const actualAmountPaid = params.amount_paid !== undefined ? params.amount_paid : params.amount;
  const isGuestClient = params.isGuest || !params.clientId || params.clientId === 'WALK-IN-GUEST' || params.clientId === 'GUEST' || params.clientId === 'GUEST-LEAD';

  // Fuzzy duplicate guard for non-guest payments without an explicit operationId.
  // Catches accidental double-submits within a short window without requiring UI wiring.
  if (!params.operationId && !isGuestClient) {
    const cutoff = new Date(Date.now() - 3000).toISOString();
    const dupQuery = query(
      collection(db, 'payments'),
      where('clientId', '==', params.clientId),
      where('created_at', '>=', cutoff)
    );
    const dupSnap = await getDocs(dupQuery);
    for (const d of dupSnap.docs) {
      const p = d.data() as Payment;
      if (
        p.packageType === params.packageType &&
        p.amount === params.amount &&
        p.amount_paid === actualAmountPaid &&
        p.recordedBy === params.recordedBy
      ) {
        console.warn(`[processPaymentTransaction] Recent duplicate payment detected within 3s window; skipping. Existing payment: ${p.id}`);
        return;
      }
    }
  }

  // Idempotency: skip duplicate transactions when the caller provides an operationId
  if (params.operationId) {
    const existingQuery = query(
      collection(db, 'payments'),
      where('operationId', '==', params.operationId),
      where('clientId', '==', params.clientId || 'WALK-IN-GUEST')
    );
    const existingSnap = await getDocs(existingQuery);
    if (!existingSnap.empty) {
      const [existingDoc] = existingSnap.docs;
      if (existingDoc) {
        const existing = existingDoc.data() as Payment;
        console.warn(`[processPaymentTransaction] Duplicate operationId ${params.operationId} detected; skipping. Existing payment: ${existing.id}`);
        return;
      }
    }
  }

  const rawBranch = params.branch || params.clientBranch || '';
  const effectiveBranch = normalizeBranchName(rawBranch);
  const effectiveBranchId = params.branchId || toCanonicalBranchId(effectiveBranch) || undefined;
  const effectiveCategory = params.packageCategory || resolvePaymentCategory(params.packageType);
  const lockRef = params.operationId ? doc(db, 'operationLocks', params.operationId) : null;
  const resolvedCoachInfo = await resolveCoachAssignmentInfo(params.coachName, params.coachId);
  let resolvedClientMemberId = '';

  if (isGuestClient) {
    const paymentRef = doc(collection(db, 'payments'));
    const clientNameVal = params.clientName || 'Walk-in Guest';
    const remainingBalance = Math.max(0, params.amount - actualAmountPaid);
    const paymentData: Partial<Payment> = {
      id: paymentRef.id,
      clientId: params.clientId || 'WALK-IN-GUEST',
      client_name: clientNameVal,
      clientName: clientNameVal,
      guestName: clientNameVal,
      amount: params.amount,
      originalAmount: params.originalAmount,
      amount_paid: actualAmountPaid,
      remainingBalance,
      isPartialPayment: remainingBalance > 0,
      isComplimentary: params.isComplimentary || (params.amount === 0 && actualAmountPaid === 0),
      status: params.paymentStatus || 'paid',
      method: params.method,
      date: safeIsoDate(params.paymentDate, true),
      instapayRef: params.instapayRef,
      packageType: params.packageType,
      package_category_type: effectiveCategory,
      coachName: resolvedCoachInfo?.coachName || (params.coachName && params.coachName !== 'unassigned' ? params.coachName : undefined),
      coachId: resolvedCoachInfo?.effectiveCoachId || (params.coachId && params.coachId !== 'unassigned' ? params.coachId : undefined),
      notes: params.notes,
      receiptSerial: params.receiptSerial || undefined,
      recordedBy: params.recordedBy,
      recordedByName: params.recordedByName || params.salesName || 'Staff',
      salesName: params.salesName,
      sales_rep_id: params.sales_rep_id,
      branch: effectiveBranch || undefined,
      branchId: effectiveBranchId,
      clientBranch: effectiveBranch || undefined,
      discountType: params.discountType,
      discountValue: params.discountValue,
      discountedAmount: params.discountedAmount,
      corporateProofUrl: params.corporateProofUrl || undefined,
      discountReason: params.discountReason || undefined,
      isUpgradePayment: false,
      isOnHold: params.isMemberOnHold || false,
      holdReason: params.isMemberOnHold ? (params.notes || 'Placed on hold at payment checkout') : undefined,
      holdDate: params.isMemberOnHold ? new Date().toISOString() : undefined,
      heldBy: params.isMemberOnHold ? params.recordedBy : undefined,
      operationId: params.operationId,
      created_at: new Date().toISOString(),
      deleted_at: null
    } as any;

    if (lockRef) {
      await runTransaction(db, async (txn) => {
        const lockSnap = await txn.get(lockRef);
        if (lockSnap.exists()) {
          console.warn(`[processPaymentTransaction] Duplicate guest operationId ${params.operationId}; skipping.`);
          return;
        }
        txn.set(lockRef, {
          operationId: params.operationId,
          clientId: params.clientId || 'WALK-IN-GUEST',
          status: 'COMMITTED',
          createdAt: new Date().toISOString()
        });
        txn.set(paymentRef, cleanData(paymentData));
      });
    } else {
      await setDoc(paymentRef, cleanData(paymentData), { merge: true });
    }
    return;
  }

  const clientRef = doc(db, 'clients', params.clientId);

  // 1. Fetch payments candidates for transfer before transaction (queries not allowed inside runTransaction gets)
  let paymentsToUpdateRefs: { ref: any; data: any }[] = [];
  let transferredPaymentsCount = 0;

  // Only transfer payments when upgrading to a different package type, not when renewing
  if (params.isUpgradePayment && !params.isRenewal && params.previousPackageName && params.previousPackageName !== params.packageType) {
    const paymentsRef = collection(db, 'payments');
    const q = query(
      paymentsRef,
      where('clientId', '==', params.clientId),
      where('packageType', '==', params.previousPackageName)
    );

    try {
      const querySnapshot = await getDocs(q);
      paymentsToUpdateRefs = querySnapshot.docs.map(docSnap => ({
        ref: docSnap.ref,
        data: docSnap.data()
      }));
    } catch (err) {
      console.error("Error querying previous payments for upgrade:", err);
    }
  }

  // 2. Run Firestore transaction for write atomicity and read consistency
  await runTransaction(db, async (transaction) => {
    // 0. Concurrency lock check: ensure this operation has not already been processed
    if (lockRef) {
      const lockSnap = await transaction.get(lockRef);
      if (lockSnap.exists()) {
        console.warn(`[processPaymentTransaction] Operation lock ${params.operationId} already held; skipping duplicate submission.`);
        return;
      }
    }

    // Fetch client details inside transaction to guarantee data integrity
    const clientSnap = await transaction.get(clientRef);
    if (!clientSnap.exists()) {
      throw new Error("Client document not found.");
    }
    const clientData = clientSnap.data();
    const clientPackages = clientData.packages || [];
    const legacyStartDate = clientData.startDate || params.startDate;

    // Fetch wallet details and member ID counter inside transaction before any writes to satisfy Firestore rules
    const isPrimaryWallet = params.method === 'Wallet Balance';
    const isSecondaryWallet = params.secondaryMethod === 'Wallet Balance';
    const walletDeductionEGP =
      (isPrimaryWallet ? (params.primaryTenderAmount !== undefined ? Number(params.primaryTenderAmount) : actualAmountPaid) : 0) +
      (isSecondaryWallet ? Number(params.secondaryTenderAmount || 0) : 0);
    const nonWalletCashCollected = Math.max(0, actualAmountPaid - walletDeductionEGP);
    const pointsEarned = Math.floor(nonWalletCashCollected / 100);
    const walletRef = doc(db, 'pointsWallets', params.clientId);
    let walletSnap: any = null;
    if (pointsEarned > 0 || walletDeductionEGP > 0) {
      walletSnap = await transaction.get(walletRef);
    }
    if (walletDeductionEGP > 0 && params.paymentStatus !== 'pending' && params.paymentStatus !== 'failed') {
      const currentWalletCash = walletSnap?.exists?.() ? Number(walletSnap.data()?.cashBalance || 0) : Number(clientData.walletBalance || 0);
      if (currentWalletCash < walletDeductionEGP) {
        throw new Error(
          `Insufficient Wallet Cash Balance. Available: ${currentWalletCash.toLocaleString()} EGP, Required: ${walletDeductionEGP.toLocaleString()} EGP`
        );
      }
    }

    const existingMemberId = String(clientData.memberId || '').trim();
    const existingLeadId = String(clientData.leadId || clientData.redgitsId || '').trim();
    const needsNewMemberId =
      clientData.status === 'Lead' ||
      !existingMemberId ||
      (existingLeadId !== '' && existingMemberId === existingLeadId);
    const memberCounterRef = doc(db, 'counters', 'clients');
    let memberCounterSnap: any = null;
    if (needsNewMemberId && params.paymentStatus !== 'pending' && params.paymentStatus !== 'failed') {
      try {
        memberCounterSnap = await transaction.get(memberCounterRef);
      } catch {}
    }

    // A. Validation: Prevent duplicate active packages if not an upgrade payment and not a renewal
    if (!params.isUpgradePayment && !params.isRenewal) {
      const existingActivePackage = clientPackages.find((p: any) => p.status === 'Active' && p.packageName === params.packageType);
      if (existingActivePackage) {
        throw new Error(`Member already has an active "${params.packageType}" package. Choose Renew to renew this package, or expire the existing package first.`);
      }
    }

    // B. If upgrading, find and transfer the payments of the previous active package to the new package type and category
    if (params.isUpgradePayment && !params.isRenewal && params.previousPackageName && params.previousPackageName !== params.packageType) {
      const prevActive = clientPackages.find(
        (p: any) => p.status === 'Active' && p.packageName === params.previousPackageName
      );
      const targetPackage = prevActive || clientPackages.find((p: any) => p.packageName === params.previousPackageName);
      const packageStartDateStr = targetPackage?.startDate || legacyStartDate;
      const packageStart = packageStartDateStr ? toValidDate(packageStartDateStr) : null;

      const filteredPayments = paymentsToUpdateRefs.filter(p => {
        const data = p.data;
        // Skip soft-deleted payments
        if (data.deleted_at !== null && data.deleted_at !== undefined) return false;

        // Filter payments belonging to the active package (on/after start date minus 10 days buffer)
        if (packageStart) {
          const paymentDate = toValidDate(data.date);
          if (!paymentDate) return false;
          const bufferTime = packageStart.getTime() - 10 * 24 * 60 * 60 * 1000;
          return paymentDate.getTime() >= bufferTime;
        }
        return true;
      });

      filteredPayments.forEach(p => {
        transaction.update(p.ref, {
          packageType: params.packageType,
          package_category_type: params.packageCategory,
          wasTransferredDueToUpgrade: true,
          transferredFromPackageName: params.previousPackageName,
          transferredAt: new Date().toISOString()
        });
      });
      transferredPaymentsCount = filteredPayments.length;
    }

    // C. Resolve package dates before creating documents
    const validPkgStart = toValidDate(params.startDate) || new Date();
    const resolvedStartDateIso = validPkgStart.toISOString();
    let resolvedEndDate = params.endDate ? safeIsoDate(params.endDate) : undefined;
    if (!resolvedEndDate && params.systemPackage) {
       const end = safeAddDays(validPkgStart, params.systemPackage.expiryDays);
       resolvedEndDate = end.toISOString();
    }

    const isPendingOrFailed = params.paymentStatus === 'pending' || params.paymentStatus === 'failed';
    const remainingBalance = Math.max(0, params.amount - actualAmountPaid);

    // D. Create Payment and Entitlement documents atomically
    const paymentRef = doc(collection(db, 'payments'));
    const entitlementRef = params.systemPackage ? doc(collection(db, 'entitlements')) : null;
    const paymentData: Partial<Payment> = {
      id: paymentRef.id,
      clientId: params.clientId,
      client_name: params.clientName,
      clientName: params.clientName,
      amount: params.amount,
      originalAmount: params.originalAmount,
      amount_paid: actualAmountPaid,
      remainingBalance,
      isPartialPayment: remainingBalance > 0,
      isComplimentary: params.isComplimentary || (params.amount === 0 && actualAmountPaid === 0),
      status: params.paymentStatus || 'paid',
      method: params.method,
      date: safeIsoDate(params.paymentDate, true),
      instapayRef: params.instapayRef,
      packageType: params.packageType,
      package_category_type: effectiveCategory,
      coachName: resolvedCoachInfo?.coachName || (params.coachName && params.coachName !== 'unassigned' ? params.coachName : undefined),
      coachId: resolvedCoachInfo?.effectiveCoachId || (params.coachId && params.coachId !== 'unassigned' ? params.coachId : undefined),
      notes: params.notes,
      receiptSerial: params.receiptSerial || undefined,
      recordedBy: params.recordedBy,
      recordedByName: params.recordedByName || params.salesName || 'Staff',
      salesName: params.salesName,
      sales_rep_id: params.sales_rep_id,
      ...(params.systemPackage?.targetTeam ? { targetTeam: params.systemPackage.targetTeam } : {}),
      branch: effectiveBranch || undefined,
      branchId: effectiveBranchId,
      clientBranch: effectiveBranch || undefined,
      discountType: params.discountType,
      discountValue: params.discountValue,
      discountedAmount: params.discountedAmount,
      corporateProofUrl: params.corporateProofUrl || undefined,
      discountReason: params.discountReason || undefined,
      isUpgradePayment: params.isUpgradePayment || false,
      previousPackageName: params.previousPackageName,
      isOnHold: params.isMemberOnHold || false,
      holdReason: params.isMemberOnHold ? (params.notes || 'Placed on hold at payment checkout') : undefined,
      holdDate: params.isMemberOnHold ? new Date().toISOString() : undefined,
      heldBy: params.isMemberOnHold ? params.recordedBy : undefined,
      installments: params.installments && params.installments.length > 0 ? params.installments : undefined,
      secondaryMethod: params.secondaryMethod || undefined,
      primaryTenderAmount: params.primaryTenderAmount,
      secondaryTenderAmount: params.secondaryTenderAmount,
      operationId: params.operationId,
      linkedEntitlementId: (!isPendingOrFailed && entitlementRef) ? entitlementRef.id : undefined,
      created_at: new Date().toISOString(),
      deleted_at: null
    } as any;

    if (lockRef) {
      transaction.set(lockRef, {
        operationId: params.operationId,
        clientId: params.clientId,
        status: 'COMMITTED',
        createdAt: new Date().toISOString()
      });
    }

    transaction.set(paymentRef, cleanData(paymentData));

    // Create entitlement ONLY for completed/paid payments
    if (!isPendingOrFailed && entitlementRef && params.systemPackage) {
      const entitlement = buildEntitlementPayload(
        entitlementRef.id,
        params.clientId,
        params.systemPackage,
        paymentRef.id,
        resolvedStartDateIso,
        resolvedEndDate,
        'active'
      );
      transaction.set(entitlementRef, cleanData(entitlement));
    }

    // E. Client Upgrade/Renewal Logic and Package Activation
    if (!isPendingOrFailed) {
      const nowIso = new Date().toISOString();
      const auditCreatedBy = params.recordedBy || 'system';
      const auditCreatedByName = params.recordedByName || params.salesName || 'Staff';

      // Expire previous active package if renewing the same package or upgrading from previous package
      const updatedPkgs = clientPackages.map((p: any) => {
        const basePkg = {
          ...p,
          createdAt: p.createdAt || nowIso,
          createdBy: p.createdBy || auditCreatedBy,
          createdByName: p.createdByName || auditCreatedByName,
        };
        if (p.status !== 'Active') return basePkg;
        if (params.isRenewal && p.packageName === params.packageType) {
          return { ...basePkg, status: 'Expired' };
        }
        if (params.isUpgradePayment && params.previousPackageName && p.packageName === params.previousPackageName) {
          return { ...basePkg, status: 'Expired' };
        }
        return basePkg;
      });

      let newClientPackage: any = {
        id: Math.random().toString(36).substr(2, 9),
        packageName: params.packageType,
        startDate: resolvedStartDateIso,
        endDate: resolvedEndDate,
        status: 'Active',
        amount: params.amount,
        amountPaid: actualAmountPaid,
        remainingBalance,
        isPartial: remainingBalance > 0,
        isComplimentary: params.isComplimentary || (params.amount === 0 && actualAmountPaid === 0),
        subscriptionType: params.isRenewal ? 'renew' : params.isUpgradePayment ? 'upgrade' : 'new',
        salesRepName: params.salesName || undefined,
        trainerName: resolvedCoachInfo?.coachName || (params.coachName && params.coachName !== 'unassigned' ? params.coachName : undefined),
        coachName: resolvedCoachInfo?.coachName || (params.coachName && params.coachName !== 'unassigned' ? params.coachName : undefined),
        coachId: resolvedCoachInfo?.effectiveCoachId || (params.coachId && params.coachId !== 'unassigned' ? params.coachId : undefined),
        createdAt: nowIso,
        createdBy: auditCreatedBy,
        createdByName: auditCreatedByName,
      };

      const pkgStr = (params.packageType || '').toLowerCase();
      let inferredCategory: 'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults' | undefined;
      if (pkgStr.includes('kids pro')) {
        inferredCategory = 'Kids Pro';
      } else if (pkgStr.includes('kids')) {
        inferredCategory = 'Kids Only';
      } else if (pkgStr.includes('junior advanced') || pkgStr.includes('juniors advanced') || pkgStr.includes('junior pro')) {
        inferredCategory = 'Junior Advanced';
      } else if (pkgStr.includes('junior')) {
        inferredCategory = 'Junior Only';
      } else if (pkgStr.includes('adult')) {
        inferredCategory = 'Adults';
      } else {
        inferredCategory = 'Adults';
      }

      const clientUpdate: any = {
        packageType: params.packageType,
        startDate: resolvedStartDateIso,
        status: params.isMemberOnHold ? 'Hold' : 'Active',
        hasDiscount: !!params.discountType,
        lastContactDate: nowIso,
        memberCategory: inferredCategory
      };

      if (remainingBalance > 0) {
        clientUpdate.hasOutstandingBalance = true;
        clientUpdate.outstandingBalance = (clientData.outstandingBalance || 0) + remainingBalance;
      }
      
      if (resolvedEndDate) {
        clientUpdate.membershipExpiry = resolvedEndDate;
      }

      const nextPackages = [...updatedPkgs, newClientPackage];

      if (params.systemPackage) {
        const pkgSnapshot = buildPackageSnapshotForClient(params.systemPackage, nowIso);
        Object.assign(newClientPackage, pkgSnapshot);

        const isUnlimited = params.systemPackage.sessions === 0;
        const sessions = params.systemPackage.sessions;
        newClientPackage.sessionsTotal = isUnlimited ? 'unlimited' : sessions;
        newClientPackage.sessionsRemaining = isUnlimited ? 'unlimited' : sessions;
        clientUpdate.sessionsRemaining = isUnlimited ? 'unlimited' : sessions;

        const benefitGuestInvites = Number(
          params.systemPackage.guestInvitations ?? params.systemPackage.benefits?.guestInvitations ?? 0
        );
        if (benefitGuestInvites > 0) {
          clientUpdate.guestInvitesRemaining = (Number(clientData.guestInvitesRemaining) || 0) + benefitGuestInvites;
        }
        const benefitClassTrials = Number(
          params.systemPackage.freeClassTrials ?? params.systemPackage.benefits?.freeClassTrials ?? 0
        );
        if (benefitClassTrials > 0) {
          clientUpdate.freeClassTrialsRemaining = (Number(clientData.freeClassTrialsRemaining) || 0) + benefitClassTrials;
        }

        const freePtSessions = Number(
          params.systemPackage.freePtSessions ?? params.systemPackage.benefits?.freePtSessions ?? 0
        );
        if (freePtSessions > 0) {
          const currentPtRemaining =
            typeof clientData.ptSessionsRemaining === 'number'
              ? clientData.ptSessionsRemaining
              : Number(clientData.ptSessionsRemaining) || 0;
          clientUpdate.ptSessionsRemaining = currentPtRemaining + freePtSessions;

          const complimentaryPtPackage: any = {
            id: Math.random().toString(36).substr(2, 9),
            packageName: `Complimentary PT (${freePtSessions} Sessions - ${params.packageType})`,
            type: 'pt',
            isPT: true,
            startDate: resolvedStartDateIso,
            endDate: resolvedEndDate,
            sessionsTotal: freePtSessions,
            sessionsRemaining: freePtSessions,
            status: 'Active',
            amount: 0,
            amountPaid: 0,
            remainingBalance: 0,
            isPartial: false,
            isComplimentary: true,
            subscriptionType: 'new',
            salesRepName: params.salesName || undefined,
            trainerName: params.coachName || undefined,
            createdAt: nowIso,
            createdBy: auditCreatedBy,
            createdByName: auditCreatedByName,
          };
          nextPackages.push(complimentaryPtPackage);

          if (inferEntitlementType(params.systemPackage.name) !== 'pt') {
            const compPtEntitlementRef = doc(collection(db, 'entitlements'));
            transaction.set(compPtEntitlementRef, cleanData({
              id: compPtEntitlementRef.id,
              memberId: params.clientId,
              productId: `${params.systemPackage.id}-comp-pt`,
              productName: 'Complimentary PT (' + params.packageType + ')',
              type: 'pt',
              status: 'active',
              sessionsTotal: freePtSessions,
              sessionsUsed: 0,
              validFrom: resolvedStartDateIso,
              validUntil: resolvedEndDate,
              paymentId: paymentRef.id,
              createdAt: nowIso,
              tenantId: getTenantId()
            }));
          }
        }
      }

      clientUpdate.packages = nextPackages;

      // Only overwrite assignedTo when a specific rep was explicitly selected
      if (params.sales_rep_id) {
        clientUpdate.assignedTo = params.sales_rep_id;
      }
      if (params.salesName) {
        clientUpdate.salesName = params.salesName;
      }
      if (resolvedCoachInfo) {
        clientUpdate.assignedCoachId = resolvedCoachInfo.effectiveCoachId;
        clientUpdate.assignedCoachName = resolvedCoachInfo.coachName;
        clientUpdate.trainerName = resolvedCoachInfo.coachName;
        clientUpdate.coach = resolvedCoachInfo.coachName;
        clientUpdate.staffAssignments = {
          ...(clientData.staffAssignments || {}),
          coach: {
            staffId: resolvedCoachInfo.effectiveCoachId,
            staffName: resolvedCoachInfo.coachName,
          },
        };
      }
      if (clientData.status === 'Lead') {
        clientUpdate.stage = 'Converted';
      }
      if (needsNewMemberId) {
        const lastId = memberCounterSnap?.exists?.() ? Number(memberCounterSnap.data()?.lastId || 111) : 111;
        const nextMemberId = lastId + 1;
        transaction.set(memberCounterRef, { lastId: nextMemberId }, { merge: true });
        clientUpdate.memberId = String(nextMemberId);
        resolvedClientMemberId = String(nextMemberId);
        if (existingLeadId && !clientData.leadId) {
          clientUpdate.leadId = existingLeadId;
        }
      } else {
        resolvedClientMemberId = existingMemberId;
      }

      // Deduct Wallet Cash Balance if paid via Wallet Balance (full or split tender) and award Points on new money collected
      if ((pointsEarned > 0 || walletDeductionEGP > 0) && walletSnap) {
        const walletData = walletSnap.exists() ? walletSnap.data() : {};
        const prevPoints = Number(walletData.balance ?? clientData.points ?? 0);
        const nextPoints = prevPoints + pointsEarned;
        const prevCash = Number(walletData.cashBalance ?? clientData.walletBalance ?? 0);
        const nextCash = Math.max(0, prevCash - walletDeductionEGP);

        if (pointsEarned > 0) {
          clientUpdate.points = nextPoints;
        }
        if (walletDeductionEGP > 0) {
          clientUpdate.walletBalance = nextCash;
        }

        const nextWalletPayload: Record<string, any> = {
          memberId: params.clientId,
          balance: nextPoints,
          totalEarned: Number(walletData.totalEarned || 0) + pointsEarned,
          totalSpent: Number(walletData.totalSpent || 0),
          cashBalance: nextCash,
          cashTotalDeposited: Number(walletData.cashTotalDeposited || 0),
          cashTotalSpent: Number(walletData.cashTotalSpent || 0) + walletDeductionEGP,
          lastUpdated: new Date().toISOString(),
        };

        if (walletSnap.exists()) {
          transaction.update(walletRef, nextWalletPayload);
        } else {
          transaction.set(walletRef, nextWalletPayload);
        }

        if (walletDeductionEGP > 0) {
          const cashTxnRef = doc(collection(db, 'pointsTransactions'));
          transaction.set(cashTxnRef, {
            memberId: params.clientId,
            walletType: 'cash',
            type: 'debit',
            amount: walletDeductionEGP,
            reason: 'cash_spend',
            description: `Paid for package: ${params.packageType}${walletDeductionEGP < actualAmountPaid ? ` (Split Tender: ${walletDeductionEGP.toLocaleString()} EGP Wallet + ${(actualAmountPaid - walletDeductionEGP).toLocaleString()} EGP)` : ''}`,
            referenceId: paymentRef.id,
            balanceBefore: prevCash,
            balanceAfter: nextCash,
            createdBy: params.recordedByName || 'System',
            createdAt: new Date().toISOString(),
          });
        }

        if (pointsEarned > 0) {
          const txnRef = doc(collection(db, 'pointsTransactions'));
          transaction.set(txnRef, {
            memberId: params.clientId,
            walletType: 'points',
            type: 'credit',
            amount: pointsEarned,
            reason: 'purchase',
            description: `Earned from package purchase: ${params.packageType}`,
            referenceId: paymentRef.id,
            balanceBefore: prevPoints,
            balanceAfter: nextPoints,
            createdBy: params.recordedByName || 'System',
            createdAt: new Date().toISOString(),
          });
        }
      }

      transaction.update(clientRef, cleanData(clientUpdate));
    } else {
      // Pending/Failed payment: record payment intent, but DO NOT grant package or activate membership
      const pendingClientUpdate: any = {
        lastContactDate: new Date().toISOString(),
        hasPendingPayment: true,
        lastPendingPaymentId: paymentRef.id
      };
      if (params.sales_rep_id) {
        pendingClientUpdate.assignedTo = params.sales_rep_id;
      }
      if (params.salesName) {
        pendingClientUpdate.salesName = params.salesName;
      }
      transaction.update(clientRef, cleanData(pendingClientUpdate));
    }

    // F. Comment Document
    const commentRef = doc(collection(db, 'clients', params.clientId, 'comments'));
    let commentMsg = '';
    const formattedStartDate = safeFormatDate(validPkgStart, 'd MMM yyyy');
    if (isPendingOrFailed) {
      commentMsg = `Payment ${params.paymentStatus}: "${params.packageType}". Amount: ${actualAmountPaid.toLocaleString()} LE. Service not activated pending confirmation.`;
    } else if (params.isRenewal) {
      commentMsg = `Package renewed: "${params.packageType}" starting ${formattedStartDate}. Amount collected: ${actualAmountPaid.toLocaleString()} LE.`;
    } else if (params.previousPackageName && params.isUpgradePayment) {
      commentMsg = `Package upgraded: "${params.previousPackageName}" → "${params.packageType}" starting ${formattedStartDate}. Amount collected: ${actualAmountPaid.toLocaleString()} LE.`;
      if (transferredPaymentsCount > 0) {
        commentMsg += ` Transferred ${transferredPaymentsCount} previous payment(s) from "${params.previousPackageName}" to the new package.`;
      }
    } else {
      commentMsg = `Payment recorded: "${params.packageType}" starting ${formattedStartDate}. Amount collected: ${actualAmountPaid.toLocaleString()} LE.`;
    }
    if (remainingBalance > 0 && !isPendingOrFailed) {
      commentMsg += ` (Partial payment: ${actualAmountPaid.toLocaleString()} LE paid, ${remainingBalance.toLocaleString()} LE remaining balance).`;
    }
    if (resolvedCoachInfo && !isPendingOrFailed) {
      commentMsg += ` Assigned Coach: ${resolvedCoachInfo.coachName}.`;
    }
    transaction.set(commentRef, {
      text: commentMsg,
      date: new Date().toISOString(),
      author: params.recordedByName || 'System'
    });
  });

  if (resolvedCoachInfo && params.paymentStatus !== 'pending' && params.paymentStatus !== 'failed') {
    await notifyCoachClientAssigned({
      coachId: resolvedCoachInfo.effectiveCoachId,
      coachUserId: resolvedCoachInfo.coachUserId,
      coachDocId: resolvedCoachInfo.coachDocId,
      coachCustomId: resolvedCoachInfo.coachCustomId,
      coachName: resolvedCoachInfo.coachName,
      clientId: params.clientId,
      clientName: params.clientName,
      memberId: resolvedClientMemberId || undefined,
      packageName: params.packageType,
      sessionsTotal: params.systemPackage?.sessions,
      branch: effectiveBranch || undefined,
      assignedBy: params.recordedByName || params.salesName || 'Staff',
    });
  }

  // Log audit entry for payment creation/upgrade/renewal
  const logAction = params.isRenewal ? 'UPDATE' : params.isUpgradePayment ? 'UPDATE' : 'CREATE';
  const logDetails = params.isRenewal
    ? `Renewed package "${params.packageType}" for ${params.clientName} (+${actualAmountPaid.toLocaleString()} LE)`
    : params.isUpgradePayment
    ? `Upgraded "${params.previousPackageName}" → "${params.packageType}" for ${params.clientName} (+${actualAmountPaid.toLocaleString()} LE)`
    : `Recorded payment of ${actualAmountPaid.toLocaleString()} LE for ${params.clientName} (${params.packageType})${params.paymentStatus ? ` [Status: ${params.paymentStatus}]` : ''}`;

  await addAuditLog(logAction as 'CREATE' | 'UPDATE' | 'DELETE', 'PAYMENT', params.clientId, logDetails, params.recordedByName);
};
