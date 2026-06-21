import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wallet, ArrowUpCircle, ArrowDownCircle, Sparkles, Gift, ShoppingBag, Clock, TrendingUp, Coins } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  getOrCreateWallet, getTransactionHistory, getActiveBundles,
  type PointsWallet, type PointsTransaction, type PointsBundle
} from '../services/pointsService';

export default function MemberWallet({ client }: { client: Client | null }) {
  const [wallet, setWallet] = useState<PointsWallet | null>(null);
  const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
  const [bundles, setBundles] = useState<PointsBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'buy' | 'history'>('overview');

  useEffect(() => {
    if (!client?.id) { setLoading(false); return; }
    
    Promise.all([
      getOrCreateWallet(client.id),
      getTransactionHistory(client.id, 20),
      getActiveBundles()
    ]).then(([w, txns, b]) => {
      setWallet(w);
      setTransactions(txns);
      setBundles(b);
    }).catch(err => {
      console.error('Failed to load wallet:', err);
    }).finally(() => setLoading(false));
  }, [client?.id]);

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Wallet className="h-12 w-12 opacity-20 mb-3" />
        <p className="font-semibold text-lg">No member record found.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const reasonIcons: Record<string, React.ReactNode> = {
    purchase: <ShoppingBag className="h-3.5 w-3.5 text-emerald-500" />,
    gift: <Gift className="h-3.5 w-3.5 text-pink-500" />,
    refund: <ArrowUpCircle className="h-3.5 w-3.5 text-blue-500" />,
    packageBuy: <ShoppingBag className="h-3.5 w-3.5 text-amber-500" />,
    admin_adjustment: <Sparkles className="h-3.5 w-3.5 text-purple-500" />,
    promo_bonus: <Gift className="h-3.5 w-3.5 text-emerald-500" />,
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Wallet Balance Hero ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-500/20 via-amber-500/10 to-transparent border border-amber-500/20 p-6">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full -translate-y-12 translate-x-12" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500/5 rounded-full translate-y-8 -translate-x-8" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-amber-500/20 rounded-xl">
              <Coins className="h-5 w-5 text-amber-500" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-600">Points Balance</span>
          </div>
          
          <div className="flex items-end gap-2">
            <span className="text-5xl font-black font-mono tracking-tight">{wallet?.balance || 0}</span>
            <span className="text-lg font-bold text-muted-foreground mb-1">PTS</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-card/40 rounded-xl p-3 border border-emerald-500/10">
              <div className="flex items-center gap-1 text-emerald-500">
                <ArrowUpCircle className="h-3 w-3" />
                <span className="text-[10px] font-bold uppercase">Total Earned</span>
              </div>
              <p className="text-lg font-extrabold font-mono mt-0.5">{wallet?.totalEarned || 0}</p>
            </div>
            <div className="bg-card/40 rounded-xl p-3 border border-rose-500/10">
              <div className="flex items-center gap-1 text-rose-500">
                <ArrowDownCircle className="h-3 w-3" />
                <span className="text-[10px] font-bold uppercase">Total Spent</span>
              </div>
              <p className="text-lg font-extrabold font-mono mt-0.5">{wallet?.totalSpent || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tab Switcher ─── */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {(['overview', 'buy', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
              activeTab === tab
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'buy' ? 'Buy Points' : tab}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <Card className="border bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> How Points Work
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                {[
                  { icon: '💰', text: 'Buy Points bundles with cash or Instapay' },
                  { icon: '🎁', text: 'Get bonus Points on larger bundles' },
                  { icon: '🏋️', text: 'Use Points to purchase gym packages' },
                  { icon: '✨', text: 'Mix Points + cash for any purchase' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-xs font-medium">{item.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Transactions Preview */}
          {transactions.length > 0 && (
            <Card className="border bg-card/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Recent Activity
                  </CardTitle>
                  <button onClick={() => setActiveTab('history')} className="text-[10px] font-bold text-primary hover:underline">
                    View All →
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {transactions.slice(0, 3).map(txn => (
                    <div key={txn.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-card border">
                          {reasonIcons[txn.reason] || <Sparkles className="h-3.5 w-3.5 text-zinc-500" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold">{txn.description}</p>
                          <p className="text-[9px] text-muted-foreground font-mono">
                            {(() => { try { return format(parseISO(txn.createdAt), 'dd MMM, h:mm a'); } catch { return ''; } })()}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-extrabold font-mono ${txn.type === 'credit' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {txn.type === 'credit' ? '+' : '-'}{txn.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Buy Points Tab ─── */}
      {activeTab === 'buy' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Select a Points bundle to purchase. Pay at reception with Cash or Instapay.</p>
          
          {bundles.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="py-10 text-center text-xs text-muted-foreground italic">
                <Coins className="h-8 w-8 mx-auto opacity-20 mb-2" />
                No Points bundles available yet. Ask your gym admin to set them up.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {bundles.map((bundle, idx) => (
                <Card key={bundle.id || idx} className={`border overflow-hidden transition-all hover:shadow-md ${
                  idx === 1 ? 'ring-2 ring-primary/50 bg-primary/5' : 'bg-card/40'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-extrabold">{bundle.name}</h3>
                          {idx === 1 && (
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[8px] font-extrabold">
                              POPULAR
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-2xl font-black font-mono text-amber-500">{bundle.pointsAmount}</span>
                          <span className="text-xs text-muted-foreground font-bold">Points</span>
                          {bundle.bonusPoints > 0 && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200/50 text-[9px] font-bold">
                              +{bundle.bonusPoints} BONUS
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-extrabold font-mono">{bundle.priceEGP.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground font-bold">EGP</p>
                      </div>
                    </div>
                    
                    <div className="mt-3 flex items-center justify-between border-t pt-3">
                      <span className="text-[10px] text-muted-foreground">
                        {bundle.bonusPoints > 0
                          ? `You get ${bundle.pointsAmount + bundle.bonusPoints} total points`
                          : `${(bundle.priceEGP / bundle.pointsAmount).toFixed(0)} EGP per point`}
                      </span>
                      <Button size="sm" className="h-8 text-xs font-bold px-4">
                        Buy Now
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card className="border bg-amber-500/5 border-amber-500/10">
            <CardContent className="p-3">
              <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                💡 <strong>How to purchase:</strong> Tap "Buy Now", then visit reception to complete payment via Cash or Instapay. Points will be credited to your wallet instantly after staff confirmation.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Transaction History Tab ─── */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="py-10 text-center text-xs text-muted-foreground italic">
                <Clock className="h-8 w-8 mx-auto opacity-20 mb-2" />
                No transactions yet. Purchase Points to get started!
              </CardContent>
            </Card>
          ) : (
            transactions.map(txn => (
              <div key={txn.id} className="flex items-center justify-between p-3 rounded-xl bg-card/50 border transition-colors hover:bg-card/70">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl border ${txn.type === 'credit' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                    {txn.type === 'credit'
                      ? <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                      : <ArrowDownCircle className="h-4 w-4 text-rose-500" />
                    }
                  </div>
                  <div>
                    <p className="text-xs font-bold">{txn.description}</p>
                    <p className="text-[9px] text-muted-foreground">
                      Balance: {txn.balanceBefore} → {txn.balanceAfter}
                    </p>
                    <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                      {(() => { try { return format(parseISO(txn.createdAt), 'dd MMM yyyy, h:mm a'); } catch { return ''; } })()}
                    </p>
                  </div>
                </div>
                <span className={`text-base font-extrabold font-mono ${txn.type === 'credit' ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {txn.type === 'credit' ? '+' : '-'}{txn.amount}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
