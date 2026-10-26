/**
 * Points & Cash Balance Wallet Service
 * Handles dual-currency member wallets:
 * 1) Real-Money Cash Balance (`cashBalance` in EGP/LE):
 *    - Members can deposit real money (e.g. 10,000 EGP) to spend anywhere in the gym
 *      (PT sessions, memberships, renewals, classes, Earth's Kitchen / Juice Bar, split-tender checkout).
 *    - Refundable within 14 days of deposit (`cashLastDepositAt`) if unused, or transferable to another member's wallet.
 * 2) Gym Loyalty Points (`balance` in PTS):
 *    - Earned on purchases/activities or bought via Points Bundles.
 *    - Spent strictly on internal gym services (Earth's Kitchen, PT/Class services, towel/locker perks).
 */
import { db } from '../firebase';
import {
  doc, getDoc, setDoc, updateDoc, addDoc, getDocs,
  collection, query, where, orderBy, limit, runTransaction
} from 'firebase/firestore';

export const WALLET_REFUND_WINDOW_DAYS = 14;

// ─── Types ───
export interface PointsWallet {
  memberId: string;
  // Points ledger (earned / service-only)
  balance: number;
  totalEarned: number;
  totalSpent: number;
  // Real-Money Cash Balance ledger (EGP / LE)
  cashBalance?: number;
  cashTotalDeposited?: number;
  cashTotalSpent?: number;
  cashTotalRefunded?: number;
  cashLastDepositAt?: string;
  cashLastDepositAmount?: number;
  lastUpdated: string;
}

export interface PointsTransaction {
  id?: string;
  memberId: string;
  memberName?: string;
  walletType?: 'points' | 'cash'; // defaults to 'points' for legacy records
  type: 'credit' | 'debit';
  amount: number;
  paymentMethod?: string;
  reason:
    | 'purchase'
    | 'gift'
    | 'refund'
    | 'packageBuy'
    | 'admin_adjustment'
    | 'promo_bonus'
    | 'cash_deposit'
    | 'cash_spend'
    | 'cash_refund'
    | 'cash_transfer_out'
    | 'cash_transfer_in'
    | 'service_redemption'
    | 'juice_bar';
  description: string;
  referenceId?: string;
  relatedMemberId?: string;
  relatedMemberName?: string;
  refundableUntil?: string;
  balanceBefore: number;
  balanceAfter: number;
  createdBy: string;
  createdAt: string;
}

export interface PointsBundle {
  id?: string;
  name: string;
  pointsAmount: number;
  priceEGP: number;
  bonusPoints: number;
  active: boolean;
  sortOrder: number;
}

export interface WalletDepositRequest {
  id?: string;
  memberId: string;
  memberName: string;
  memberPhone?: string;
  amountEGP: number;
  method: 'Cash' | 'Instapay' | 'Credit Card' | 'Bank Transfer';
  instapayRef?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface WalletRefundRequest {
  id?: string;
  memberId: string;
  memberName: string;
  amountEGP: number;
  reason: string;
  eligibleWithin14Days: boolean;
  depositDate?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

function normalizeWallet(memberId: string, raw?: Partial<PointsWallet> | null): PointsWallet {
  return {
    memberId: raw?.memberId || memberId,
    balance: Number(raw?.balance || 0),
    totalEarned: Number(raw?.totalEarned || 0),
    totalSpent: Number(raw?.totalSpent || 0),
    cashBalance: Number(raw?.cashBalance || 0),
    cashTotalDeposited: Number(raw?.cashTotalDeposited || 0),
    cashTotalSpent: Number(raw?.cashTotalSpent || 0),
    cashTotalRefunded: Number(raw?.cashTotalRefunded || 0),
    cashLastDepositAt: raw?.cashLastDepositAt,
    cashLastDepositAmount: raw?.cashLastDepositAmount !== undefined ? Number(raw.cashLastDepositAmount) : undefined,
    lastUpdated: raw?.lastUpdated || new Date().toISOString(),
  };
}

/**
 * Checks whether a member's current cash balance is eligible for a 14-day refund.
 */
export function getCashRefundEligibility(wallet: PointsWallet | null | undefined): {
  canRefund: boolean;
  daysRemaining: number;
  refundableAmount: number;
  expiresAt?: string;
  reason?: string;
} {
  if (!wallet || (wallet.cashBalance || 0) <= 0) {
    return { canRefund: false, daysRemaining: 0, refundableAmount: 0, reason: 'No cash balance available to refund.' };
  }
  if (!wallet.cashLastDepositAt) {
    return {
      canRefund: true,
      daysRemaining: WALLET_REFUND_WINDOW_DAYS,
      refundableAmount: wallet.cashBalance || 0,
    };
  }
  const depositMs = new Date(wallet.cashLastDepositAt).getTime();
  if (isNaN(depositMs)) {
    return {
      canRefund: true,
      daysRemaining: WALLET_REFUND_WINDOW_DAYS,
      refundableAmount: wallet.cashBalance || 0,
    };
  }
  const windowMs = WALLET_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const expiresMs = depositMs + windowMs;
  const nowMs = Date.now();
  const diffMs = expiresMs - nowMs;
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

  if (diffMs <= 0) {
    return {
      canRefund: false,
      daysRemaining: 0,
      refundableAmount: 0,
      expiresAt: new Date(expiresMs).toISOString(),
      reason: `The ${WALLET_REFUND_WINDOW_DAYS}-day refund window has expired. Your balance remains active in your wallet to spend on any gym service or can be transferred to another member.`,
    };
  }

  return {
    canRefund: true,
    daysRemaining,
    refundableAmount: wallet.cashBalance || 0,
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

// ─── Wallet Operations ───

export async function getOrCreateWallet(memberId: string): Promise<PointsWallet> {
  const walletRef = doc(db, 'pointsWallets', memberId);
  const snap = await getDoc(walletRef);

  if (snap.exists()) {
    return normalizeWallet(memberId, snap.data() as PointsWallet);
  }

  const newWallet = normalizeWallet(memberId, null);
  try {
    await setDoc(walletRef, newWallet);
  } catch {
    // Return in-memory default if client does not have write permission yet
  }
  return newWallet;
}

// ─── Points Operations (Earned / Service-Only) ───

export async function creditPoints(
  memberId: string,
  amount: number,
  reason: PointsTransaction['reason'],
  description: string,
  createdBy: string,
  referenceId?: string
): Promise<PointsTransaction> {
  return runTransaction(db, async (transaction) => {
    const walletRef = doc(db, 'pointsWallets', memberId);
    const walletSnap = await transaction.get(walletRef);
    const clientRef = doc(db, 'clients', memberId);
    const clientSnap = await transaction.get(clientRef);

    const wallet = walletSnap.exists()
      ? normalizeWallet(memberId, walletSnap.data() as PointsWallet)
      : normalizeWallet(memberId, null);

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;
    const nowIso = new Date().toISOString();

    transaction.set(walletRef, {
      ...wallet,
      balance: balanceAfter,
      totalEarned: wallet.totalEarned + amount,
      lastUpdated: nowIso,
    }, { merge: true });

    if (clientSnap.exists()) {
      transaction.update(clientRef, {
        points: balanceAfter,
        updatedAt: nowIso,
      });
    }

    const txn: PointsTransaction = {
      memberId,
      walletType: 'points',
      type: 'credit',
      amount,
      reason,
      description,
      ...(referenceId ? { referenceId } : {}),
      balanceBefore,
      balanceAfter,
      createdBy,
      createdAt: nowIso,
    };

    const txnRef = doc(collection(db, 'pointsTransactions'));
    transaction.set(txnRef, txn);

    return { ...txn, id: txnRef.id };
  });
}

export async function debitPoints(
  memberId: string,
  amount: number,
  reason: PointsTransaction['reason'],
  description: string,
  createdBy: string,
  referenceId?: string
): Promise<PointsTransaction> {
  return runTransaction(db, async (transaction) => {
    const walletRef = doc(db, 'pointsWallets', memberId);
    const walletSnap = await transaction.get(walletRef);
    const clientRef = doc(db, 'clients', memberId);
    const clientSnap = await transaction.get(clientRef);

    if (!walletSnap.exists()) {
      throw new Error('Points wallet does not exist');
    }

    const wallet = normalizeWallet(memberId, walletSnap.data() as PointsWallet);

    if (wallet.balance < amount) {
      throw new Error(`Insufficient Points balance. Current: ${wallet.balance} PTS, Required: ${amount} PTS`);
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - amount;
    const nowIso = new Date().toISOString();

    transaction.set(walletRef, {
      ...wallet,
      balance: balanceAfter,
      totalSpent: wallet.totalSpent + amount,
      lastUpdated: nowIso,
    }, { merge: true });

    if (clientSnap.exists()) {
      transaction.update(clientRef, {
        points: balanceAfter,
        updatedAt: nowIso,
      });
    }

    const txn: PointsTransaction = {
      memberId,
      walletType: 'points',
      type: 'debit',
      amount,
      reason,
      description,
      ...(referenceId ? { referenceId } : {}),
      balanceBefore,
      balanceAfter,
      createdBy,
      createdAt: nowIso,
    };

    const txnRef = doc(collection(db, 'pointsTransactions'));
    transaction.set(txnRef, txn);

    return { ...txn, id: txnRef.id };
  });
}

// ─── Real-Money Cash Balance Operations (EGP / LE) ───

export async function depositCashBalance(
  memberId: string,
  amountEGP: number,
  paymentMethod: string,
  description: string,
  createdBy: string,
  referenceId?: string
): Promise<PointsTransaction> {
  if (amountEGP <= 0) {
    throw new Error('Deposit amount must be greater than 0.');
  }

  return runTransaction(db, async (transaction) => {
    const walletRef = doc(db, 'pointsWallets', memberId);
    const walletSnap = await transaction.get(walletRef);
    const clientRef = doc(db, 'clients', memberId);
    const clientSnap = await transaction.get(clientRef);

    const wallet = walletSnap.exists()
      ? normalizeWallet(memberId, walletSnap.data() as PointsWallet)
      : normalizeWallet(memberId, null);

    const balanceBefore = wallet.cashBalance || 0;
    const balanceAfter = balanceBefore + amountEGP;
    const nowIso = new Date().toISOString();
    const refundableUntil = new Date(Date.now() + WALLET_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Also award loyalty points on cash wallet deposit (1 PTS per 100 EGP deposited)
    const bonusPointsEarned = Math.floor(amountEGP / 100);
    const nextPointsBalance = wallet.balance + bonusPointsEarned;

    transaction.set(walletRef, {
      ...wallet,
      balance: nextPointsBalance,
      totalEarned: wallet.totalEarned + bonusPointsEarned,
      cashBalance: balanceAfter,
      cashTotalDeposited: (wallet.cashTotalDeposited || 0) + amountEGP,
      cashLastDepositAt: nowIso,
      cashLastDepositAmount: amountEGP,
      lastUpdated: nowIso,
    }, { merge: true });

    if (clientSnap.exists()) {
      transaction.update(clientRef, {
        walletBalance: balanceAfter,
        points: nextPointsBalance,
        updatedAt: nowIso,
      });
    }

    const txn: PointsTransaction = {
      memberId,
      walletType: 'cash',
      type: 'credit',
      amount: amountEGP,
      paymentMethod,
      reason: 'cash_deposit',
      description: description || `Wallet Cash Deposit (${paymentMethod})`,
      ...(referenceId ? { referenceId } : {}),
      refundableUntil,
      balanceBefore,
      balanceAfter,
      createdBy,
      createdAt: nowIso,
    };

    const txnRef = doc(collection(db, 'pointsTransactions'));
    transaction.set(txnRef, txn);

    if (bonusPointsEarned > 0) {
      const ptsTxnRef = doc(collection(db, 'pointsTransactions'));
      transaction.set(ptsTxnRef, {
        memberId,
        walletType: 'points',
        type: 'credit',
        amount: bonusPointsEarned,
        reason: 'promo_bonus',
        description: `Earned +${bonusPointsEarned} PTS from ${amountEGP.toLocaleString()} EGP Wallet Deposit`,
        balanceBefore: wallet.balance,
        balanceAfter: nextPointsBalance,
        createdBy,
        createdAt: nowIso,
      });
    }

    return { ...txn, id: txnRef.id };
  });
}

export async function spendCashBalance(
  memberId: string,
  amountEGP: number,
  reason: PointsTransaction['reason'],
  description: string,
  createdBy: string,
  referenceId?: string
): Promise<PointsTransaction> {
  if (amountEGP <= 0) {
    throw new Error('Spend amount must be greater than 0.');
  }

  return runTransaction(db, async (transaction) => {
    const walletRef = doc(db, 'pointsWallets', memberId);
    const walletSnap = await transaction.get(walletRef);
    const clientRef = doc(db, 'clients', memberId);
    const clientSnap = await transaction.get(clientRef);

    if (!walletSnap.exists()) {
      throw new Error('Member wallet does not exist.');
    }

    const wallet = normalizeWallet(memberId, walletSnap.data() as PointsWallet);
    const currentCash = wallet.cashBalance || 0;

    if (currentCash < amountEGP) {
      throw new Error(`Insufficient Wallet Cash Balance. Available: ${currentCash.toLocaleString()} EGP, Required: ${amountEGP.toLocaleString()} EGP`);
    }

    const balanceBefore = currentCash;
    const balanceAfter = balanceBefore - amountEGP;
    const nowIso = new Date().toISOString();

    transaction.set(walletRef, {
      ...wallet,
      cashBalance: balanceAfter,
      cashTotalSpent: (wallet.cashTotalSpent || 0) + amountEGP,
      lastUpdated: nowIso,
    }, { merge: true });

    if (clientSnap.exists()) {
      transaction.update(clientRef, {
        walletBalance: balanceAfter,
        updatedAt: nowIso,
      });
    }

    const txn: PointsTransaction = {
      memberId,
      walletType: 'cash',
      type: 'debit',
      amount: amountEGP,
      reason,
      description,
      ...(referenceId ? { referenceId } : {}),
      balanceBefore,
      balanceAfter,
      createdBy,
      createdAt: nowIso,
    };

    const txnRef = doc(collection(db, 'pointsTransactions'));
    transaction.set(txnRef, txn);

    return { ...txn, id: txnRef.id };
  });
}

export async function refundCashBalance(
  memberId: string,
  amountEGP: number,
  reasonNote: string,
  createdBy: string,
  forceBypassWindow: boolean = false
): Promise<PointsTransaction> {
  if (amountEGP <= 0) {
    throw new Error('Refund amount must be greater than 0.');
  }

  return runTransaction(db, async (transaction) => {
    const walletRef = doc(db, 'pointsWallets', memberId);
    const walletSnap = await transaction.get(walletRef);
    const clientRef = doc(db, 'clients', memberId);
    const clientSnap = await transaction.get(clientRef);

    if (!walletSnap.exists()) {
      throw new Error('Member wallet does not exist.');
    }

    const wallet = normalizeWallet(memberId, walletSnap.data() as PointsWallet);
    const currentCash = wallet.cashBalance || 0;

    if (currentCash < amountEGP) {
      throw new Error(`Refund amount (${amountEGP.toLocaleString()} EGP) exceeds current cash balance (${currentCash.toLocaleString()} EGP).`);
    }

    const eligibility = getCashRefundEligibility(wallet);
    if (!eligibility.canRefund && !forceBypassWindow) {
      throw new Error(eligibility.reason || 'Refund window (14 days) has expired.');
    }

    const balanceBefore = currentCash;
    const balanceAfter = balanceBefore - amountEGP;
    const nowIso = new Date().toISOString();

    transaction.set(walletRef, {
      ...wallet,
      cashBalance: balanceAfter,
      cashTotalRefunded: (wallet.cashTotalRefunded || 0) + amountEGP,
      lastUpdated: nowIso,
    }, { merge: true });

    if (clientSnap.exists()) {
      transaction.update(clientRef, {
        walletBalance: balanceAfter,
        updatedAt: nowIso,
      });
    }

    const txn: PointsTransaction = {
      memberId,
      walletType: 'cash',
      type: 'debit',
      amount: amountEGP,
      reason: 'cash_refund',
      description: reasonNote || `Cash Balance Refund (${WALLET_REFUND_WINDOW_DAYS}-day policy)`,
      balanceBefore,
      balanceAfter,
      createdBy,
      createdAt: nowIso,
    };

    const txnRef = doc(collection(db, 'pointsTransactions'));
    transaction.set(txnRef, txn);

    return { ...txn, id: txnRef.id };
  });
}

/**
 * Transfers cash balance from one member's wallet to another member's wallet.
 * Useful when a member decides not to continue or wants to share wallet credit with a family member/friend.
 */
export async function transferCashBalance(params: {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amountEGP: number;
  note?: string;
  createdBy: string;
}): Promise<{ debitTxn: PointsTransaction; creditTxn: PointsTransaction }> {
  const { fromMemberId, fromMemberName, toMemberId, toMemberName, amountEGP, note, createdBy } = params;
  if (!fromMemberId || !toMemberId) {
    throw new Error('Both sender and recipient members are required.');
  }
  if (fromMemberId === toMemberId) {
    throw new Error('Cannot transfer wallet balance to the same account.');
  }
  if (amountEGP <= 0) {
    throw new Error('Transfer amount must be greater than 0.');
  }

  return runTransaction(db, async (transaction) => {
    const fromWalletRef = doc(db, 'pointsWallets', fromMemberId);
    const toWalletRef = doc(db, 'pointsWallets', toMemberId);
    const fromClientRef = doc(db, 'clients', fromMemberId);
    const toClientRef = doc(db, 'clients', toMemberId);

    const [fromSnap, toSnap, fromClientSnap, toClientSnap] = await Promise.all([
      transaction.get(fromWalletRef),
      transaction.get(toWalletRef),
      transaction.get(fromClientRef),
      transaction.get(toClientRef),
    ]);

    if (!fromSnap.exists()) {
      throw new Error('Sender wallet does not exist.');
    }

    const fromWallet = normalizeWallet(fromMemberId, fromSnap.data() as PointsWallet);
    const toWallet = toSnap.exists()
      ? normalizeWallet(toMemberId, toSnap.data() as PointsWallet)
      : normalizeWallet(toMemberId, null);

    const fromBefore = fromWallet.cashBalance || 0;
    if (fromBefore < amountEGP) {
      throw new Error(`Insufficient cash balance to transfer. Available: ${fromBefore.toLocaleString()} EGP`);
    }

    const fromAfter = fromBefore - amountEGP;
    const toBefore = toWallet.cashBalance || 0;
    const toAfter = toBefore + amountEGP;
    const nowIso = new Date().toISOString();

    transaction.set(fromWalletRef, {
      ...fromWallet,
      cashBalance: fromAfter,
      cashTotalSpent: (fromWallet.cashTotalSpent || 0) + amountEGP,
      lastUpdated: nowIso,
    }, { merge: true });

    transaction.set(toWalletRef, {
      ...toWallet,
      cashBalance: toAfter,
      cashTotalDeposited: (toWallet.cashTotalDeposited || 0) + amountEGP,
      lastUpdated: nowIso,
    }, { merge: true });

    if (fromClientSnap.exists()) {
      transaction.update(fromClientRef, { walletBalance: fromAfter, updatedAt: nowIso });
    }
    if (toClientSnap.exists()) {
      transaction.update(toClientRef, { walletBalance: toAfter, updatedAt: nowIso });
    }

    const debitTxn: PointsTransaction = {
      memberId: fromMemberId,
      memberName: fromMemberName,
      walletType: 'cash',
      type: 'debit',
      amount: amountEGP,
      reason: 'cash_transfer_out',
      description: `Transferred to ${toMemberName}${note ? ` (${note})` : ''}`,
      relatedMemberId: toMemberId,
      relatedMemberName: toMemberName,
      balanceBefore: fromBefore,
      balanceAfter: fromAfter,
      createdBy,
      createdAt: nowIso,
    };

    const creditTxn: PointsTransaction = {
      memberId: toMemberId,
      memberName: toMemberName,
      walletType: 'cash',
      type: 'credit',
      amount: amountEGP,
      reason: 'cash_transfer_in',
      description: `Received from ${fromMemberName}${note ? ` (${note})` : ''}`,
      relatedMemberId: fromMemberId,
      relatedMemberName: fromMemberName,
      balanceBefore: toBefore,
      balanceAfter: toAfter,
      createdBy,
      createdAt: nowIso,
    };

    const debitRef = doc(collection(db, 'pointsTransactions'));
    const creditRef = doc(collection(db, 'pointsTransactions'));
    transaction.set(debitRef, debitTxn);
    transaction.set(creditRef, creditTxn);

    return {
      debitTxn: { ...debitTxn, id: debitRef.id },
      creditTxn: { ...creditTxn, id: creditRef.id },
    };
  });
}

// ─── Member Self-Service Deposit & Refund Requests ───

export async function createWalletDepositRequest(reqData: Omit<WalletDepositRequest, 'id' | 'status' | 'createdAt'>): Promise<string> {
  const payload: Omit<WalletDepositRequest, 'id'> = {
    ...reqData,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, 'walletDepositRequests'), payload);
  return ref.id;
}

export async function createWalletRefundRequest(reqData: Omit<WalletRefundRequest, 'id' | 'status' | 'createdAt'>): Promise<string> {
  const payload: Omit<WalletRefundRequest, 'id'> = {
    ...reqData,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, 'walletRefundRequests'), payload);
  return ref.id;
}

export async function getMemberDepositRequests(memberId: string): Promise<WalletDepositRequest[]> {
  const q = query(collection(db, 'walletDepositRequests'), where('memberId', '==', memberId));
  const snap = await getDocs(q);
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as WalletDepositRequest));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export async function getMemberRefundRequests(memberId: string): Promise<WalletRefundRequest[]> {
  const q = query(collection(db, 'walletRefundRequests'), where('memberId', '==', memberId));
  const snap = await getDocs(q);
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as WalletRefundRequest));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export async function getTransactionHistory(
  memberId: string,
  maxResults = 50
): Promise<PointsTransaction[]> {
  const q = query(
    collection(db, 'pointsTransactions'),
    where('memberId', '==', memberId),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PointsTransaction));
}

export async function getAllRecentWalletTransactions(maxResults = 100): Promise<PointsTransaction[]> {
  const q = query(
    collection(db, 'pointsTransactions'),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PointsTransaction));
}

// ─── Bundle Operations ───

export async function getActiveBundles(): Promise<PointsBundle[]> {
  const q = query(
    collection(db, 'pointsBundles'),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  const bundles = snap.docs.map(d => ({ id: d.id, ...d.data() } as PointsBundle));
  bundles.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return bundles;
}

export async function getAllBundles(): Promise<PointsBundle[]> {
  const snap = await getDocs(collection(db, 'pointsBundles'));
  const bundles = snap.docs.map(d => ({ id: d.id, ...d.data() } as PointsBundle));
  bundles.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return bundles;
}

export async function saveBundle(bundle: PointsBundle): Promise<string> {
  if (bundle.id) {
    const ref = doc(db, 'pointsBundles', bundle.id!);
    const { id, ...data } = bundle as any;
    await updateDoc(ref, data);
    return bundle.id!;
  } else {
    const { id, ...data } = bundle as any;
    const ref = await addDoc(collection(db, 'pointsBundles'), data);
    return ref.id;
  }
}

// ─── Seed Default Bundles ───
export async function seedDefaultBundles(): Promise<void> {
  const snap = await getDocs(collection(db, 'pointsBundles'));
  if (!snap.empty) return;

  const defaults: Omit<PointsBundle, 'id'>[] = [
    { name: 'Starter', pointsAmount: 5, priceEGP: 1000, bonusPoints: 0, active: true, sortOrder: 1 },
    { name: 'Popular', pointsAmount: 10, priceEGP: 2000, bonusPoints: 1, active: true, sortOrder: 2 },
    { name: 'Premium', pointsAmount: 25, priceEGP: 4500, bonusPoints: 3, active: true, sortOrder: 3 },
    { name: 'VIP', pointsAmount: 50, priceEGP: 8000, bonusPoints: 8, active: true, sortOrder: 4 },
  ];

  for (const b of defaults) {
    await addDoc(collection(db, 'pointsBundles'), b);
  }
}
