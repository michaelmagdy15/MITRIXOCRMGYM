import { runTransaction, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { cleanData } from '../utils';
import { Payment, Package } from '../types';
import { addAuditLog } from './auditService';

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
  clientStatus?: string;
  clientPackages?: any[];

  amount: number;
  method: Payment['method'];
  instapayRef?: string;

  packageType: string;
  packageCategory: 'Private Training' | 'Group Training';
  coachName?: string;
  notes?: string;

  sales_rep_id: string;
  salesName: string;
  recordedBy: string;
  recordedByName: string; // for the comment author

  paymentDate: string; // ISO
  startDate: string; // ISO
  endDate?: string; // ISO

  discountType?: 'percentage' | 'amount';
  discountValue?: number;
  discountedAmount?: number;

  isMemberOnHold?: boolean;
  isUpgradePayment?: boolean; // True when payment is from Members tab upgrade (not manual Payments entry)
  systemPackage?: Package; // The matched package configuration, if any
  previousPackageName?: string;
}

export const processPaymentTransaction = async (params: PaymentTransactionParams): Promise<void> => {
  const clientRef = doc(db, 'clients', params.clientId);

  // 1. Fetch payments candidates for transfer before transaction (queries not allowed inside runTransaction gets)
  let paymentsToUpdateRefs: { ref: any; data: any }[] = [];
  let transferredPaymentsCount = 0;

  if (params.isUpgradePayment && params.previousPackageName) {
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
    // Fetch client details inside transaction to guarantee data integrity
    const clientSnap = await transaction.get(clientRef);
    if (!clientSnap.exists()) {
      throw new Error("Client document not found.");
    }
    const clientData = clientSnap.data();
    const clientPackages = clientData.packages || [];
    const legacyStartDate = clientData.startDate || params.startDate;

    // Fetch wallet details inside transaction before any writes to satisfy Firestore rules
    const pointsEarned = Math.floor(params.amount / 100);
    const walletRef = doc(db, 'pointsWallets', params.clientId);
    let walletSnap: any = null;
    if (pointsEarned > 0) {
      walletSnap = await transaction.get(walletRef);
    }

    // A. Validation: Prevent duplicate active packages if not an upgrade payment
    if (!params.isUpgradePayment) {
      const existingActivePackage = clientPackages.find((p: any) => p.status === 'Active' && p.packageName === params.packageType);
      if (existingActivePackage) {
        throw new Error(`Member already has an active "${params.packageType}" package. Please expire or replace the existing package first.`);
      }
    }

    // B. If upgrading, find and transfer the payments of the previous active package to the new package type and category
    if (params.isUpgradePayment && params.previousPackageName) {
      const prevActive = clientPackages.find(
        (p: any) => p.status === 'Active' && p.packageName === params.previousPackageName
      );
      const targetPackage = prevActive || clientPackages.find((p: any) => p.packageName === params.previousPackageName);
      const packageStartDateStr = targetPackage?.startDate || legacyStartDate;
      const packageStart = packageStartDateStr ? new Date(packageStartDateStr) : null;

      const filteredPayments = paymentsToUpdateRefs.filter(p => {
        const data = p.data;
        // Skip soft-deleted payments
        if (data.deleted_at !== null && data.deleted_at !== undefined) return false;

        // Filter payments belonging to the active package (on/after start date minus 10 days buffer)
        if (packageStart) {
          const paymentDate = new Date(data.date);
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

    // C. Create New Payment Document
    const paymentRef = doc(collection(db, 'payments'));
    const paymentData: Partial<Payment> = {
      id: paymentRef.id,
      clientId: params.clientId,
      client_name: params.clientName,
      amount: params.amount,
      amount_paid: params.amount,
      method: params.method,
      date: params.paymentDate,
      instapayRef: params.instapayRef,
      packageType: params.packageType,
      package_category_type: params.packageCategory,
      coachName: params.coachName,
      notes: params.notes,
      recordedBy: params.recordedBy,
      salesName: params.salesName,
      sales_rep_id: params.sales_rep_id,
      branch: params.clientBranch || '',
      discountType: params.discountType,
      discountValue: params.discountValue,
      discountedAmount: params.discountedAmount,
      isUpgradePayment: params.isUpgradePayment || false,
      previousPackageName: params.previousPackageName,
      isOnHold: params.isMemberOnHold || false,
      holdReason: params.isMemberOnHold ? (params.notes || 'Placed on hold at payment checkout') : undefined,
      holdDate: params.isMemberOnHold ? new Date().toISOString() : undefined,
      heldBy: params.isMemberOnHold ? params.recordedBy : undefined,
      created_at: new Date().toISOString(),
      deleted_at: null
    };
    transaction.set(paymentRef, cleanData(paymentData));

    // D. Client Upgrade Logic
    const pkgStartDate = new Date(params.startDate);
    let resolvedEndDate = params.endDate;
    if (!resolvedEndDate && params.systemPackage) {
       const end = new Date(pkgStartDate);
       end.setDate(end.getDate() + params.systemPackage.expiryDays);
       resolvedEndDate = end.toISOString();
    }

    // Expire ONLY the package being upgraded from
    const updatedPkgs = clientPackages.map((p: any) =>
      p.status === 'Active' && (params.isUpgradePayment ? p.packageName === params.previousPackageName : false)
        ? { ...p, status: 'Expired' }
        : p
    );

    let newClientPackage: any = {
      id: Math.random().toString(36).substr(2, 9),
      packageName: params.packageType,
      startDate: pkgStartDate.toISOString(),
      endDate: resolvedEndDate,
      status: 'Active'
    };

    const clientUpdate: any = {
      packageType: params.packageType,
      startDate: pkgStartDate.toISOString(),
      status: params.isMemberOnHold ? 'Hold' : 'Active',
      hasDiscount: !!params.discountType,
      lastContactDate: new Date().toISOString()
    };
    
    if (resolvedEndDate) {
      clientUpdate.membershipExpiry = resolvedEndDate;
    }

    if (params.systemPackage) {
      const isUnlimited = params.systemPackage.sessions === 0;
      const sessions = params.systemPackage.sessions;
      newClientPackage.sessionsTotal = isUnlimited ? 'unlimited' : sessions;
      newClientPackage.sessionsRemaining = isUnlimited ? 'unlimited' : sessions;
      clientUpdate.sessionsRemaining = isUnlimited ? 'unlimited' : sessions;
    }

    clientUpdate.packages = [...updatedPkgs, newClientPackage];

    // Only overwrite assignedTo when a specific rep was explicitly selected
    if (params.sales_rep_id) {
      clientUpdate.assignedTo = params.sales_rep_id;
    }
    if (params.salesName) {
      clientUpdate.salesName = params.salesName;
    }
    if (clientData.status === 'Lead') {
      clientUpdate.stage = 'Converted';
    }

    // Award points on package purchase! (1 Point per 100 LE/EGP spent)
    if (pointsEarned > 0 && walletSnap) {
      const currentPoints = clientData.points || 0;
      clientUpdate.points = currentPoints + pointsEarned;

      // Update pointsWallet doc
      let walletData: any;
      if (walletSnap.exists()) {
        walletData = walletSnap.data();
        transaction.update(walletRef, {
          balance: (walletData.balance || 0) + pointsEarned,
          totalEarned: (walletData.totalEarned || 0) + pointsEarned,
          lastUpdated: new Date().toISOString()
        });
      } else {
        walletData = {
          memberId: params.clientId,
          balance: pointsEarned,
          totalEarned: pointsEarned,
          totalSpent: 0,
          lastUpdated: new Date().toISOString()
        };
        transaction.set(walletRef, walletData);
      }

      // Log pointsTransaction
      const txnRef = doc(collection(db, 'pointsTransactions'));
      transaction.set(txnRef, {
        memberId: params.clientId,
        type: 'credit',
        amount: pointsEarned,
        reason: 'purchase',
        description: `Earned from package purchase: ${params.packageType}`,
        balanceBefore: walletSnap.exists() ? (walletData.balance || 0) : 0,
        balanceAfter: (walletSnap.exists() ? (walletData.balance || 0) : 0) + pointsEarned,
        createdBy: params.recordedByName || 'System',
        createdAt: new Date().toISOString()
      });
    }

    transaction.update(clientRef, cleanData(clientUpdate));

    // E. Comment Document
    const commentRef = doc(collection(db, 'clients', params.clientId, 'comments'));
    let commentMsg = '';
    if (params.previousPackageName) {
      commentMsg = `Package upgraded: "${params.previousPackageName}" → "${params.packageType}" starting ${pkgStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. Amount collected: ${params.amount.toLocaleString()} LE.`;
      if (transferredPaymentsCount > 0) {
        commentMsg += ` Transferred ${transferredPaymentsCount} previous payment(s) from "${params.previousPackageName}" to the new package.`;
      }
    } else {
      commentMsg = `Payment recorded: "${params.packageType}" starting ${pkgStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}. Amount collected: ${params.amount.toLocaleString()} LE.`;
    }
    transaction.set(commentRef, {
      text: commentMsg,
      date: new Date().toISOString(),
      author: params.recordedByName || 'System'
    });
  });

  // Log audit entry for payment creation/upgrade
  const logAction = params.isUpgradePayment ? 'UPDATE' : 'CREATE';
  const logDetails = params.isUpgradePayment
    ? `Upgraded "${params.previousPackageName}" → "${params.packageType}" for ${params.clientName} (+${params.amount.toLocaleString()} LE)`
    : `Recorded payment of ${params.amount.toLocaleString()} LE for ${params.clientName} (${params.packageType})`;

  await addAuditLog(logAction as 'CREATE' | 'UPDATE' | 'DELETE', 'PAYMENT', params.clientId, logDetails, params.recordedByName);
};
