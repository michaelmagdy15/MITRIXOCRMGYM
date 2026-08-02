import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Gift, Coins, ShoppingCart, CheckCircle2, AlertCircle, Sparkles, Clock, Star, Shield, Dumbbell, Coffee, Ticket, Percent, HandFist, Bath as BathIcon } from 'lucide-react';
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

// Map reward types/names to professional icons
const getRewardIcon = (name: string, type: 'partner' | 'internal') => {
  const n = name.toLowerCase();
  if (n.includes('shake') || n.includes('protein') || n.includes('drink') || n.includes('juice')) return Coffee;
  if (n.includes('guest') || n.includes('pass') || n.includes('friend')) return Ticket;
  if (n.includes('renewal') || n.includes('discount') || n.includes('off') || n.includes('%')) return Percent;
  if (n.includes('towel') || n.includes('service')) return BathIcon;
  if (n.includes('glove') || n.includes('boxing') || n.includes('gear') || n.includes('equipment')) return HandFist;
  if (n.includes('session') || n.includes('class') || n.includes('training')) return Dumbbell;
  if (n.includes('shield') || n.includes('protect')) return Shield;
  if (type === 'partner') return Gift;
  return Sparkles;
};

const DEFAULT_REWARDS: Omit<Reward, 'id'>[] = [
  {
    name: 'Free Protein Shake',
    description: 'Show this at the juice bar and grab any shake you like',
    icon: 'coffee',
    coinsPrice: 50,
    partnerName: 'Juice Bar',
    type: 'internal',
    quantity: 100,
    claimed: 0,
    active: true,
  },
  {
    name: 'Guest Pass (1 Day)',
    description: 'Bring a friend along for a free day at the gym',
    icon: 'ticket',
    coinsPrice: 100,
    partnerName: 'Gym',
    type: 'internal',
    quantity: 50,
    claimed: 0,
    active: true,
  },
  {
    name: '15% Off - Next Renewal',
    description: 'Knock 15% off your next membership renewal',
    icon: 'percent',
    coinsPrice: 200,
    partnerName: 'Gym',
    type: 'internal',
    quantity: 20,
    claimed: 0,
    active: true,
  },
  {
    name: 'Free Towel Service (1 Month)',
    description: 'A month of free towel service - leave yours at home',
    icon: 'towel',
    coinsPrice: 75,
    partnerName: 'Gym',
    type: 'internal',
    quantity: 30,
    claimed: 0,
    active: true,
  },
  {
    name: 'Boxing Gloves Upgrade',
    description: 'Swap to a premium pair of club gloves for your sessions',
    icon: 'boxing-glove',
    coinsPrice: 150,
    partnerName: 'Pro Shop',
    type: 'partner',
    quantity: 10,
    claimed: 0,
    active: true,
  },
];

const RewardIconWrapper = ({ icon: Icon, className = '' }: { icon: React.ComponentType<{ className?: string }>, className?: string }) => (
  <div className={`w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary ${className}`}>
    <Icon className="h-5 w-5" />
  </div>
);

export default function MemberRewards({ client }: { client: Client | null }) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [myRedemptions, setMyRedemptions] = useState<Redemption[]>([]);
  const [coinsWallet, setCoinsWallet] = useState<CoinsWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'shop' | 'my-rewards'>('shop');
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);

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
      setResult({ type: 'error', message: `You need ${reward.coinsPrice} coins for this one - you have ${coinsWallet.balance}.` });
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
      setResult({ type: 'success', message: `"${reward.name}" is yours - show this screen to the front desk and they'll sort you out.` });

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
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const statusConfig: Record<string, { bg: string; text: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
    pending: { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-200/50', icon: Clock },
    validated: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-200/50', icon: CheckCircle2 },
    expired: { bg: 'bg-zinc-500/10', text: 'text-zinc-500', border: 'border-zinc-200/50', icon: AlertCircle },
  };

  const formatDate = (dateStr: string) => {
    try { return format(parseISO(dateStr), 'dd MMM yyyy, h:mm a'); } catch { return ''; }
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Coins Balance Header ─── */}
      <Card className="border-primary/20 bg-primary/5 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Coins className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">Your Coins</p>
                <div className="flex items-center baseline gap-1.5">
                  <span className="text-3xl font-black font-mono text-foreground">{coinsWallet?.balance || 0}</span>
                  <Coins className="h-5 w-5 text-primary" />
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Earn them by checking in, keeping your streak and grabbing badges</p>
              <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
                Earned in total: <span className="font-mono text-foreground">{coinsWallet?.totalEarned || 0}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Tab Switcher ─── */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {(['shop', 'my-rewards'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold capitalize transition-all flex items-center justify-center gap-1.5 ${
              activeTab === tab 
                ? 'bg-card shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'shop' ? (
              <>
                <ShoppingCart className="h-3.5 w-3.5" />
                Shop
              </>
            ) : (
              <>
                <Gift className="h-3.5 w-3.5" />
                My Picks
              </>
            )}
          </button>
        ))}
      </div>

      {result && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium border ${
          result.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50' 
            : 'bg-rose-500/10 text-rose-600 border-rose-200/50'
        }`}>
          {result.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {result.message}
        </div>
      )}

      {/* ─── Rewards Shop ─── */}
      {activeTab === 'shop' && (
        <div className="space-y-3">
          {rewards.map(reward => {
            const canAfford = (coinsWallet?.balance || 0) >= reward.coinsPrice;
            const isOutOfStock = reward.claimed >= reward.quantity;
            const IconComponent = getRewardIcon(reward.name, reward.type);
            
            return (
              <Card 
                key={reward.id} 
                className={`border overflow-hidden transition-all hover:shadow-md ${
                  !canAfford || isOutOfStock ? 'opacity-50' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <RewardIconWrapper icon={IconComponent} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-foreground truncate">{reward.name}</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{reward.description}</p>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-bold shrink-0 ml-2">
                          {reward.type === 'partner' ? reward.partnerName : 'At the gym'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-3 border-t">
                        <div className="flex items-center gap-2 text-primary">
                          <Coins className="h-4 w-4" />
                          <span className="text-lg font-black font-mono">{reward.coinsPrice}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {reward.quantity - reward.claimed} left
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="h-9 text-xs font-bold px-4"
                          disabled={!canAfford || isOutOfStock || redeemingId === reward.id}
                          onClick={() => handleRedeem(reward)}
                        >
                          {redeemingId === reward.id ? (
                            <> <span className="animate-spin mr-1">⏳</span> Redeeming... </>
                          ) : isOutOfStock ? (
                            'Sold Out'
                          ) : !canAfford ? (
                            'Not enough coins'
                          ) : (
                            'Redeem'
                          )}
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
              <CardContent className="py-10 text-center text-xs text-muted-foreground">
                <Gift className="h-8 w-8 mx-auto opacity-20 mb-2" />
                Nothing in the shop yet - check back soon.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── My Picks ─── */}
      {activeTab === 'my-rewards' && (
        <div className="space-y-2">
          {myRedemptions.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="py-10 text-center text-xs text-muted-foreground">
                <Gift className="h-8 w-8 mx-auto opacity-20 mb-2" />
                You haven't redeemed anything yet - your picks will show up here.
              </CardContent>
            </Card>
          ) : (
            myRedemptions.map(r => {
              const config = statusConfig[r.status] || statusConfig.pending || { bg: 'bg-zinc-500/10', text: 'text-zinc-500', border: 'border-zinc-200/50', icon: Clock };
              const StatusIcon = config.icon;
              
              return (
                <Card key={r.id} className="border overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center`}>
                          <StatusIcon className={`h-5 w-5 ${config.text}`} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{r.rewardName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {formatDate(r.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${config.bg} ${config.text} ${config.border} text-[9px] font-bold`}>
                          {r.status === 'validated' ? 'Done' : r.status === 'pending' ? 'Awaiting desk' : 'Expired'}
                        </Badge>
                        <span className="text-sm font-black text-rose-500 font-mono">-{r.coinsSpent}</span>
                        <Coins className="h-4 w-4 text-rose-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ─── Reward Detail Dialog ─── */}
      {selectedReward && (
        <Dialog open onOpenChange={(open) => !open && setSelectedReward(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <RewardIconWrapper icon={getRewardIcon(selectedReward.name, selectedReward.type)} className="mx-auto mb-3 w-14 h-14" />
              <DialogTitle className="text-center">{selectedReward.name}</DialogTitle>
              <DialogDescription className="text-center">
                {selectedReward.description}
              </DialogDescription>
            </DialogHeader>
            <div role="separator" className="my-4 border-t" />
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost</span>
                <span className="font-bold flex items-center gap-1">
                  <Coins className="h-4 w-4" /> {selectedReward.coinsPrice}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">From</span>
                <span className="font-medium">{selectedReward.type === 'partner' ? selectedReward.partnerName : 'the gym'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">In stock</span>
                <span className="font-medium">{selectedReward.quantity - selectedReward.claimed} left</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}