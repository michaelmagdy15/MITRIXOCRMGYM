/**
 * Points Wallet Service
 * Handles all points wallet operations: balance queries, credits, debits, transaction history
 */
import { db } from '../firebase';
import {
  doc, getDoc, setDoc, updateDoc, addDoc, getDocs, Timestamp,
  collection, query, where, orderBy, limit, runTransaction
} from 'firebase/firestore';

// ─── Types ───
export interface PointsWallet {
  memberId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  lastUpdated: string;
}

export interface PointsTransaction {
  id?: string;
  memberId: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: 'purchase' | 'gift' | 'refund' | 'packageBuy' | 'admin_adjustment' | 'promo_bonus';
  description: string;
  referenceId?: string;
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

// ─── Wallet Operations ───

export async function getOrCreateWallet(memberId: string): Promise<PointsWallet> {
  const walletRef = doc(db, 'pointsWallets', memberId);
  const snap = await getDoc(walletRef);
  
  if (snap.exists()) {
    return snap.data() as PointsWallet;
  }
  
  // Create new wallet
  const newWallet: PointsWallet = {
    memberId,
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    lastUpdated: new Date().toISOString(),
  };
  await setDoc(walletRef, newWallet);
  return newWallet;
}

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
    
    let wallet: PointsWallet;
    if (walletSnap.exists()) {
      wallet = walletSnap.data() as PointsWallet;
    } else {
      wallet = { memberId, balance: 0, totalEarned: 0, totalSpent: 0, lastUpdated: new Date().toISOString() };
    }
    
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;
    
    // Update wallet
    transaction.set(walletRef, {
      ...wallet,
      balance: balanceAfter,
      totalEarned: wallet.totalEarned + amount,
      lastUpdated: new Date().toISOString(),
    });
    
    // Create transaction record
    const txn: PointsTransaction = {
      memberId,
      type: 'credit',
      amount,
      reason,
      description,
      referenceId,
      balanceBefore,
      balanceAfter,
      createdBy,
      createdAt: new Date().toISOString(),
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
    
    if (!walletSnap.exists()) {
      throw new Error('Wallet does not exist');
    }
    
    const wallet = walletSnap.data() as PointsWallet;
    
    if (wallet.balance < amount) {
      throw new Error(`Insufficient balance. Current: ${wallet.balance}, Required: ${amount}`);
    }
    
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - amount;
    
    transaction.set(walletRef, {
      ...wallet,
      balance: balanceAfter,
      totalSpent: wallet.totalSpent + amount,
      lastUpdated: new Date().toISOString(),
    });
    
    const txn: PointsTransaction = {
      memberId,
      type: 'debit',
      amount,
      reason,
      description,
      referenceId,
      balanceBefore,
      balanceAfter,
      createdBy,
      createdAt: new Date().toISOString(),
    };
    
    const txnRef = doc(collection(db, 'pointsTransactions'));
    transaction.set(txnRef, txn);
    
    return { ...txn, id: txnRef.id };
  });
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
