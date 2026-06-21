/**
 * Gamification Service
 * Handles badges, achievements, streaks, and coins
 */
import { db } from '../firebase';
import {
  doc, getDoc, setDoc, updateDoc, addDoc, getDocs,
  collection, query, where, orderBy, limit, increment
} from 'firebase/firestore';

// ─── Types ───
export interface BadgeDefinition {
  id?: string;
  name: string;
  description: string;
  icon: string;           // emoji
  category: 'featured' | 'general';
  criteria: {
    type: 'checkin_count' | 'checkin_streak' | 'classes_joined' | 'pt_sessions' | 'months_active';
    target: number;
  };
  coinsReward: number;
  active: boolean;
  sortOrder: number;
}

export interface MemberBadge {
  id?: string;
  memberId: string;
  badgeId: string;
  badgeName: string;
  badgeIcon: string;
  progress: number;       // current progress value
  target: number;         // target to unlock
  unlockedAt: string | null;
  coinsAwarded: number;
}

export interface StreakRecord {
  memberId: string;
  currentStreak: number;
  bestStreak: number;
  lastCheckInDate: string;
}

export interface CoinsWallet {
  memberId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  lastUpdated: string;
}

export interface CoinsTransaction {
  id?: string;
  memberId: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  referenceId?: string;
  createdAt: string;
}

// ─── Default Badge Definitions ───
const DEFAULT_BADGES: Omit<BadgeDefinition, 'id'>[] = [
  {
    name: 'First Steps',
    description: 'Complete your first check-in',
    icon: '👣',
    category: 'general',
    criteria: { type: 'checkin_count', target: 1 },
    coinsReward: 10,
    active: true,
    sortOrder: 1
  },
  {
    name: 'Getting Started',
    description: 'Check in 10 times',
    icon: '🔥',
    category: 'general',
    criteria: { type: 'checkin_count', target: 10 },
    coinsReward: 25,
    active: true,
    sortOrder: 2
  },
  {
    name: 'Dedicated',
    description: 'Check in 30 times',
    icon: '💪',
    category: 'general',
    criteria: { type: 'checkin_count', target: 30 },
    coinsReward: 50,
    active: true,
    sortOrder: 3
  },
  {
    name: '7-Day Warrior',
    description: 'Maintain a 7-day check-in streak',
    icon: '⚔️',
    category: 'featured',
    criteria: { type: 'checkin_streak', target: 7 },
    coinsReward: 50,
    active: true,
    sortOrder: 4
  },
  {
    name: '30-Day Beast',
    description: 'Maintain a 30-day check-in streak',
    icon: '🏆',
    category: 'featured',
    criteria: { type: 'checkin_streak', target: 30 },
    coinsReward: 200,
    active: true,
    sortOrder: 5
  },
  {
    name: 'Class Explorer',
    description: 'Join 5 group classes',
    icon: '🗺️',
    category: 'general',
    criteria: { type: 'classes_joined', target: 5 },
    coinsReward: 30,
    active: true,
    sortOrder: 6
  },
  {
    name: 'PT Champion',
    description: 'Complete 10 personal training sessions',
    icon: '🥇',
    category: 'featured',
    criteria: { type: 'pt_sessions', target: 10 },
    coinsReward: 75,
    active: true,
    sortOrder: 7
  },
  {
    name: 'Loyal Member',
    description: 'Be an active member for 6 months',
    icon: '❤️',
    category: 'featured',
    criteria: { type: 'months_active', target: 6 },
    coinsReward: 100,
    active: true,
    sortOrder: 8
  },
  {
    name: 'Veteran',
    description: 'Be an active member for 12 months',
    icon: '🎖️',
    category: 'featured',
    criteria: { type: 'months_active', target: 12 },
    coinsReward: 250,
    active: true,
    sortOrder: 9
  },
  {
    name: 'Century Club',
    description: 'Check in 100 times',
    icon: '💯',
    category: 'featured',
    criteria: { type: 'checkin_count', target: 100 },
    coinsReward: 150,
    active: true,
    sortOrder: 10
  }
];

// ─── Seed ───
export async function seedBadgeDefinitions(): Promise<void> {
  const snap = await getDocs(collection(db, 'badgeDefinitions'));
  if (!snap.empty) return;
  for (const b of DEFAULT_BADGES) {
    await addDoc(collection(db, 'badgeDefinitions'), b);
  }
}

export async function getAllBadgeDefinitions(): Promise<BadgeDefinition[]> {
  const snap = await getDocs(collection(db, 'badgeDefinitions'));
  const defs = snap.docs.map(d => ({ id: d.id, ...d.data() } as BadgeDefinition));
  defs.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return defs;
}

// ─── Member Badges ───
export async function getMemberBadges(memberId: string): Promise<MemberBadge[]> {
  const q = query(collection(db, 'memberBadges'), where('memberId', '==', memberId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as MemberBadge));
}

export async function updateBadgeProgress(
  memberId: string,
  badgeDef: BadgeDefinition,
  currentValue: number
): Promise<MemberBadge> {
  // Find or create member badge
  const q = query(
    collection(db, 'memberBadges'),
    where('memberId', '==', memberId),
    where('badgeId', '==', badgeDef.id)
  );
  const snap = await getDocs(q);
  
  const progress = Math.min(currentValue, badgeDef.criteria.target);
  const wasUnlocked = snap.docs[0]?.data()?.unlockedAt;
  const isNowUnlocked = progress >= badgeDef.criteria.target;
  
  const badge: Omit<MemberBadge, 'id'> = {
    memberId,
    badgeId: badgeDef.id!,
    badgeName: badgeDef.name,
    badgeIcon: badgeDef.icon,
    progress,
    target: badgeDef.criteria.target,
    unlockedAt: isNowUnlocked ? (wasUnlocked || new Date().toISOString()) : null,
    coinsAwarded: isNowUnlocked ? badgeDef.coinsReward : 0,
  };
  
  if (snap.empty) {
    const ref = await addDoc(collection(db, 'memberBadges'), badge);
    
    // Award coins if just unlocked
    if (isNowUnlocked) {
      await creditCoins(memberId, badgeDef.coinsReward, `Badge unlocked: ${badgeDef.name}`, badgeDef.id!);
    }
    
    return { ...badge, id: ref.id };
  } else {
    const docRef = snap.docs[0]!.ref;
    await updateDoc(docRef, badge as any);
    
    // Award coins if newly unlocked
    if (isNowUnlocked && !wasUnlocked) {
      await creditCoins(memberId, badgeDef.coinsReward, `Badge unlocked: ${badgeDef.name}`, badgeDef.id!);
    }
    
    return { ...badge, id: snap.docs[0]!.id };
  }
}

// ─── Coins Wallet ───
export async function getOrCreateCoinsWallet(memberId: string): Promise<CoinsWallet> {
  const ref = doc(db, 'coinsWallets', memberId);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as CoinsWallet;
  const wallet: CoinsWallet = { memberId, balance: 0, totalEarned: 0, totalSpent: 0, lastUpdated: new Date().toISOString() };
  await setDoc(ref, wallet);
  return wallet;
}

export async function creditCoins(
  memberId: string, amount: number, reason: string, referenceId?: string
): Promise<void> {
  const walletRef = doc(db, 'coinsWallets', memberId);
  const snap = await getDoc(walletRef);
  
  if (snap.exists()) {
    const w = snap.data() as CoinsWallet;
    await updateDoc(walletRef, {
      balance: w.balance + amount,
      totalEarned: w.totalEarned + amount,
      lastUpdated: new Date().toISOString(),
    });
  } else {
    await setDoc(walletRef, {
      memberId, balance: amount, totalEarned: amount, totalSpent: 0,
      lastUpdated: new Date().toISOString(),
    });
  }
  
  await addDoc(collection(db, 'coinsTransactions'), {
    memberId, type: 'credit', amount, reason, referenceId,
    createdAt: new Date().toISOString(),
  } satisfies Omit<CoinsTransaction, 'id'>);
}

// ─── Streak ───
export async function getOrCreateStreak(memberId: string): Promise<StreakRecord> {
  const ref = doc(db, 'streaks', memberId);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as StreakRecord;
  const streak: StreakRecord = { memberId, currentStreak: 0, bestStreak: 0, lastCheckInDate: '' };
  await setDoc(ref, streak);
  return streak;
}

export async function updateStreak(memberId: string, checkInDate: string): Promise<StreakRecord> {
  const ref = doc(db, 'streaks', memberId);
  const snap = await getDoc(ref);
  let streak: StreakRecord;
  
  if (snap.exists()) {
    streak = snap.data() as StreakRecord;
    const lastDate = streak.lastCheckInDate;
    const today = checkInDate.split('T')[0];
    
    if (lastDate === today) return streak; // Already checked in today
    
    // Check if consecutive
    const lastDateObj = new Date(lastDate || '2020-01-01');
    const todayObj = new Date(today!);
    const diffDays = Math.floor((todayObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      streak.currentStreak += 1;
    } else if (diffDays > 1) {
      streak.currentStreak = 1; // Reset
    }
    
    streak.bestStreak = Math.max(streak.bestStreak, streak.currentStreak);
    streak.lastCheckInDate = today!;
  } else {
    streak = { memberId, currentStreak: 1, bestStreak: 1, lastCheckInDate: checkInDate.split('T')[0]! };
  }
  
  await setDoc(ref, streak);
  return streak;
}
