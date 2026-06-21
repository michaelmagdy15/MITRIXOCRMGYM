import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gift, Coins, ShoppingCart, CheckCircle2, AlertCircle, Sparkles, Clock, Star } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, query, where, doc, updateDoc } from 'firebase/firestore';
import { getOrCreateCoinsWallet, creditCoins, type CoinsWallet } from '../services/gamificationService';
import { format, parseISO } from 'date-fns';

interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  coinsPrice: number;
  partnerName: string;
  type: 'partner' | 'internal';
  quantity: number;
  claimed: number;
  active: boolean;
  expiresAt?: string;
}

interface Redemption {
  id: string;
  memberId: string;
  rewardId: string;
  rewardName: string;
  coinsSpent: number;
  status: 'pending' | 'validated' | 'expired';
  createdAt: string;
}

const DEFAULT_REWARDS: Omit<Reward, 'id'>[] = [
  {
    name: 'Free Protein Shake',
    description: 'Redeem at the juice bar for any protein shake of your choice',
    icon: '🥤',
    coinsPrice: 50,
    partnerName: 'Juice Bar',
    type: 'internal',
    quantity: 100,
    claimed: 0,
    active: true,
  },
  {
    name: 'Guest Pass (1 Day)',
    description: 'Bring a friend for a free day pass at the gym',
    icon: '🎫',
    coinsPrice: 100,
    partnerName: 'Gym',
    type: 'internal',
    quantity: 50,
    claimed: 0,
    active: true,
  },
  {
    name: '15% Off - Next Renewal',
    description: 'Get 15% off your next membership renewal',
    icon: '💰',
    coinsPrice: 200,
    partnerName: 'Gym',
    type: 'internal',
    quantity: 20,
    claimed: 0,
    active: true,
  },
  {
    name: 'Free Towel Service (1 Month)',
    description: 'Complimentary towel service for one month',
    icon: '🧺',
    coinsPrice: 75,
    partnerName: 'Gym',
    type: 'internal',
    quantity: 30,
    claimed: 0,
    active: true,
  },
  {
    name: 'Boxing Gloves Upgrade',
    description: 'Upgrade to premium club gloves for your sessions',
    icon: '🥊',
    coinsPrice: 150,
    partnerName: 'Pro Shop',
    type: 'partner',
    quantity: 10,
    claimed: 0,
    active: true,
  },
];

export default function MemberRewards({ client }: { client: Client | null }) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [myRedemptions, setMyRedemptions] = useState<Redemption[]>([]);
  const [coinsWallet, setCoinsWallet] = useState<CoinsWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'shop' | 'my-rewards'>('shop');

  useEffect(() => {
    if (!client?.id) { setLoading(false); return; }

    const loadAll = async () => {
      try {
        // Seed default rewards if empty
        const rewardsSnap = await getDocs(collection(db, 'rewards'));
        if (rewardsSnap.empty) {
          for (const r of DEFAULT_REWARDS) {
            await addDoc(collection(db, 'rewards'), r);
          }
        }

        const [rSnap, wallet] = await Promise.all([
          getDocs(collection(db, 'rewards')),
          getOrCreateCoinsWallet(client.id),
        ]);
        
        const rList = rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Reward)).filter(r => r.active);
        rList.sort((a, b) => a.coinsPrice - b.coinsPrice);
        setRewards(rList);
        setCoinsWallet(wallet);

        // Load my redemptions
        const redemptionSnap = await getDocs(
          query(collection(db, 'rewardRedemptions'), where('memberId', '==', client.id))
        );
        const redemptions = redemptionSnap.docs.map(d => ({ id: d.id, ...d.data() } as Redemption));
        redemptions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setMyRedemptions(redemptions);
      } catch (err) {
        console.error('Failed to load rewards:', err);
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, [client?.id]);

  const handleRedeem = async (reward: Reward) => {
    if (!client?.id || !coinsWallet) return;
    if (coinsWallet.balance < reward.coinsPrice) {
      setResult({ type: 'error', message: `Not enough coins. You have ${coinsWallet.balance}, need ${reward.coinsPrice}.` });
      return;
    }

    setRedeemingId(reward.id);
    setResult(null);

    try {
      // Debit coins
      const walletRef = doc(db, 'coinsWallets', client.id);
      const newBalance = coinsWallet.balance - reward.coinsPrice;
      await updateDoc(walletRef, {
        balance: newBalance,
        totalSpent: coinsWallet.totalSpent + reward.coinsPrice,
        lastUpdated: new Date().toISOString(),
      });

      // Log transaction
      await addDoc(collection(db, 'coinsTransactions'), {
        memberId: client.id,
        type: 'debit',
        amount: reward.coinsPrice,
        reason: `Redeemed: ${reward.name}`,
        referenceId: reward.id,
        createdAt: new Date().toISOString(),
      });

      // Create redemption
      await addDoc(collection(db, 'rewardRedemptions'), {
        memberId: client.id,
        rewardId: reward.id,
        rewardName: reward.name,
        coinsSpent: reward.coinsPrice,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      // Update claimed count
      const rewardRef = doc(db, 'rewards', reward.id);
      await updateDoc(rewardRef, { claimed: reward.claimed + 1 });

      // Refresh wallet
      setCoinsWallet({ ...coinsWallet, balance: newBalance, totalSpent: coinsWallet.totalSpent + reward.coinsPrice });
      setResult({ type: 'success', message: `🎉 "${reward.name}" redeemed! Show this to staff for validation.` });

      // Refresh redemptions
      const redemptionSnap = await getDocs(
        query(collection(db, 'rewardRedemptions'), where('memberId', '==', client.id))
      );
      setMyRedemptions(redemptionSnap.docs.map(d => ({ id: d.id, ...d.data() } as Redemption)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Failed to redeem' });
    } finally {
      setRedeemingId(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-600 border-amber-200/50',
    validated: 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50',
    expired: 'bg-zinc-500/10 text-zinc-500 border-zinc-200/50',
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Coins Balance Header ─── */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/20">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Your Coins</p>
          <div className="flex items-center gap-1.5">
            <Coins className="h-5 w-5 text-amber-500" />
            <span className="text-3xl font-black font-mono">{coinsWallet?.balance || 0}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Earn coins from badges &amp; streaks</p>
        </div>
      </div>

      {/* ─── Tab Switcher ─── */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {(['shop', 'my-rewards'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
              activeTab === tab ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'shop' ? '🛒 Rewards Shop' : '🎁 My Rewards'}
          </button>
        ))}
      </div>

      {result && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium border ${
          result.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50' : 'bg-rose-500/10 text-rose-600 border-rose-200/50'
        }`}>
          {result.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {result.message}
        </div>
      )}

      {/* ─── Rewards Shop ─── */}
      {activeTab === 'shop' && (
        <div className="grid gap-3">
          {rewards.map(reward => {
            const canAfford = (coinsWallet?.balance || 0) >= reward.coinsPrice;
            const isOutOfStock = reward.claimed >= reward.quantity;
            
            return (
              <Card key={reward.id} className={`border overflow-hidden transition-all ${canAfford && !isOutOfStock ? 'hover:shadow-md' : 'opacity-70'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{reward.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-extrabold">{reward.name}</h3>
                        <Badge variant="outline" className="text-[8px] font-bold">
                          {reward.type === 'partner' ? reward.partnerName : 'GYM'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{reward.description}</p>
                      
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1 text-amber-500">
                          <Coins className="h-4 w-4" />
                          <span className="text-base font-extrabold font-mono">{reward.coinsPrice}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">
                            {reward.quantity - reward.claimed} left
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="h-8 text-xs font-bold"
                          disabled={!canAfford || isOutOfStock || redeemingId === reward.id}
                          onClick={() => handleRedeem(reward)}
                        >
                          {redeemingId === reward.id ? 'Redeeming...' : isOutOfStock ? 'Sold Out' : !canAfford ? 'Not Enough' : 'Redeem'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          
          {rewards.length === 0 && (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="py-10 text-center text-xs text-muted-foreground italic">
                <Gift className="h-8 w-8 mx-auto opacity-20 mb-2" />
                No rewards available yet. Check back soon!
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── My Rewards ─── */}
      {activeTab === 'my-rewards' && (
        <div className="space-y-2">
          {myRedemptions.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="py-10 text-center text-xs text-muted-foreground italic">
                <Gift className="h-8 w-8 mx-auto opacity-20 mb-2" />
                You haven't redeemed any rewards yet. Visit the shop!
              </CardContent>
            </Card>
          ) : (
            myRedemptions.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-card/50 border">
                <div>
                  <p className="text-xs font-bold">{r.rewardName}</p>
                  <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                    {(() => { try { return format(parseISO(r.createdAt), 'dd MMM yyyy, h:mm a'); } catch { return ''; } })()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`text-[9px] ${statusColors[r.status] || ''}`}>
                    {r.status}
                  </Badge>
                  <span className="text-xs font-bold text-amber-500 font-mono">-{r.coinsSpent}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
