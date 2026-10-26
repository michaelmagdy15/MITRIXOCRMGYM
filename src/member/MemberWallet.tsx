import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Sparkles,
  Gift,
  ShoppingBag,
  Clock,
  TrendingUp,
  Coins,
  Banknote,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Coffee,
  Dumbbell,
  ArrowRightLeft,
  Plus,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  getOrCreateWallet,
  getTransactionHistory,
  getActiveBundles,
  getCashRefundEligibility,
  createWalletDepositRequest,
  createWalletRefundRequest,
  getMemberDepositRequests,
  getMemberRefundRequests,
  transferCashBalance,
  debitPoints,
  WALLET_REFUND_WINDOW_DAYS,
  type PointsWallet,
  type PointsTransaction,
  type PointsBundle,
  type WalletDepositRequest,
  type WalletRefundRequest,
} from '../services/pointsService';
import { db } from '../firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';

interface ServiceRewardItem {
  id: string;
  name: string;
  category: 'Kitchen & Drinks' | 'Training & PT' | 'Recovery & Services';
  pointsCost: number;
  description: string;
}

const GYM_SERVICE_CATALOG: ServiceRewardItem[] = [
  {
    id: 'srv-protein-shake',
    name: "Earth's Kitchen Protein Shake",
    category: 'Kitchen & Drinks',
    pointsCost: 20,
    description: 'Redeem for any signature whey or vegan protein shake at Earth’s Kitchen.',
  },
  {
    id: 'srv-specialty-coffee',
    name: 'Specialty Coffee / Matcha',
    category: 'Kitchen & Drinks',
    pointsCost: 12,
    description: 'Any hot or iced specialty coffee, pre-workout shot, or matcha.',
  },
  {
    id: 'srv-inbody-scan',
    name: 'InBody Composition & Progress Scan',
    category: 'Recovery & Services',
    pointsCost: 25,
    description: 'Full skeletal muscle & body fat composition analysis with coach review.',
  },
  {
    id: 'srv-towel-locker',
    name: 'VIP Towel & Day Locker Service',
    category: 'Recovery & Services',
    pointsCost: 15,
    description: 'Complimentary towel kit + smart locker pass for your session.',
  },
  {
    id: 'srv-group-class',
    name: 'Single Group Class Pass (SGF / Conditioning)',
    category: 'Training & PT',
    pointsCost: 40,
    description: 'Book a drop-in group conditioning, boxing, or SGF class session.',
  },
  {
    id: 'srv-pt-session-credit',
    name: '1-on-1 PT Session Upgrade / Credit',
    category: 'Training & PT',
    pointsCost: 100,
    description: 'Redeem toward a personal training session or assessment with a coach.',
  },
];

export default function MemberWallet({ client }: { client: Client | null }) {
  const { t } = useLanguage();
  const [wallet, setWallet] = useState<PointsWallet | null>(null);
  const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
  const [bundles, setBundles] = useState<PointsBundle[]>([]);
  const [depositRequests, setDepositRequests] = useState<WalletDepositRequest[]>([]);
  const [refundRequests, setRefundRequests] = useState<WalletRefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'deposit' | 'services' | 'transfer' | 'history'>('overview');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'cash' | 'points'>('all');

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState<string>('2000');
  const [depositMethod, setDepositMethod] = useState<'Cash' | 'Instapay' | 'Credit Card' | 'Bank Transfer'>('Instapay');
  const [depositInstapayRef, setDepositInstapayRef] = useState('');
  const [depositNotes, setDepositNotes] = useState('');
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);

  // Refund Form State
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  // Transfer Form State
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientResults, setRecipientResults] = useState<{ id: string; name: string; memberId: string; phone: string }[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<{ id: string; name: string; memberId: string; phone: string } | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Service Redemption State
  const [redeemingServiceId, setRedeemingServiceId] = useState<string | null>(null);

  // Feedback Banner
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadWalletData = async () => {
    if (!client?.id) {
      setLoading(false);
      return;
    }
    try {
      const [w, txns, b, depReqs, refReqs] = await Promise.all([
        getOrCreateWallet(client.id),
        getTransactionHistory(client.id, 40),
        getActiveBundles(),
        getMemberDepositRequests(client.id).catch(() => []),
        getMemberRefundRequests(client.id).catch(() => []),
      ]);
      setWallet(w);
      setTransactions(txns);
      setBundles(b);
      setDepositRequests(depReqs);
      setRefundRequests(refReqs);
    } catch (err) {
      console.error('Failed to load wallet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, [client?.id]);

  const refundEligibility = useMemo(() => getCashRefundEligibility(wallet), [wallet]);

  const filteredTransactions = useMemo(() => {
    if (historyFilter === 'all') return transactions;
    return transactions.filter((txn) => {
      const wType = txn.walletType || (txn.reason?.startsWith('cash_') ? 'cash' : 'points');
      return wType === historyFilter;
    });
  }, [transactions, historyFilter]);

  const handleRequestDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id) return;
    const amt = Number(depositAmount);
    if (!amt || amt <= 0) {
      setBanner({ type: 'error', message: 'Please enter a valid deposit amount in EGP.' });
      return;
    }
    setIsSubmittingDeposit(true);
    setBanner(null);
    try {
      await createWalletDepositRequest({
        memberId: client.id,
        memberName: client.name,
        memberPhone: client.phone,
        amountEGP: amt,
        method: depositMethod,
        instapayRef: depositInstapayRef.trim() || undefined,
        notes: depositNotes.trim() || undefined,
      });
      await loadWalletData();
      setDepositInstapayRef('');
      setDepositNotes('');
      setBanner({
        type: 'success',
        message: `Deposit request for ${amt.toLocaleString()} EGP (${depositMethod}) submitted! Show this at the front desk to credit your Cash Balance immediately (+${Math.floor(amt / 100)} bonus PTS).`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Failed to submit deposit request.' });
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  const handleRequestRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id || !wallet) return;
    const amt = Number(refundAmount || wallet.cashBalance || 0);
    if (!amt || amt <= 0 || amt > (wallet.cashBalance || 0)) {
      setBanner({ type: 'error', message: 'Invalid refund amount.' });
      return;
    }
    if (!refundEligibility.canRefund) {
      setBanner({ type: 'error', message: refundEligibility.reason || 'Refund window has expired.' });
      return;
    }
    setIsSubmittingRefund(true);
    setBanner(null);
    try {
      await createWalletRefundRequest({
        memberId: client.id,
        memberName: client.name,
        amountEGP: amt,
        reason: refundReason.trim() || '14-day unused wallet balance refund request',
        eligibleWithin14Days: refundEligibility.canRefund,
        depositDate: wallet.cashLastDepositAt,
      });
      await loadWalletData();
      setRefundAmount('');
      setRefundReason('');
      setBanner({
        type: 'success',
        message: `Refund request for ${amt.toLocaleString()} EGP submitted within your 14-day guarantee window. Reception/Finance will process it shortly.`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Failed to submit refund request.' });
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  const handleSearchRecipient = async () => {
    const q = recipientQuery.trim().toLowerCase();
    if (!q || !client) return;
    try {
      const snap = await getDocs(collection(db, 'clients'));
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter(
          (c) =>
            c.id !== client.id &&
            (String(c.name || '').toLowerCase().includes(q) ||
              String(c.memberId || '').toLowerCase().includes(q) ||
              String(c.phone || '').includes(q))
        )
        .slice(0, 6)
        .map((c) => ({
          id: c.id,
          name: String(c.name || 'Member'),
          memberId: c.memberId != null ? String(c.memberId) : 'N/A',
          phone: String(c.phone || ''),
        }));
      setRecipientResults(matches);
    } catch (err) {
      console.error('Recipient search failed:', err);
    }
  };

  const handleTransferCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id || !selectedRecipient) return;
    const amt = Number(transferAmount);
    if (!amt || amt <= 0) {
      setBanner({ type: 'error', message: 'Enter a valid amount to transfer.' });
      return;
    }
    if (amt > (wallet?.cashBalance || 0)) {
      setBanner({ type: 'error', message: 'Transfer amount exceeds your available Cash Balance.' });
      return;
    }
    setIsTransferring(true);
    setBanner(null);
    try {
      await transferCashBalance({
        fromMemberId: client.id,
        fromMemberName: client.name,
        toMemberId: selectedRecipient.id,
        toMemberName: selectedRecipient.name,
        amountEGP: amt,
        note: transferNote.trim() || undefined,
        createdBy: client.name,
      });
      await loadWalletData();
      setTransferAmount('');
      setTransferNote('');
      setSelectedRecipient(null);
      setRecipientQuery('');
      setBanner({
        type: 'success',
        message: `Successfully transferred ${amt.toLocaleString()} EGP from your Wallet Balance to ${selectedRecipient.name}!`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Transfer failed.' });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleRedeemServiceWithPoints = async (service: ServiceRewardItem) => {
    if (!client?.id || !wallet) return;
    if (wallet.balance < service.pointsCost) {
      setBanner({
        type: 'error',
        message: `You need ${service.pointsCost} PTS for "${service.name}" (you have ${wallet.balance} PTS).`,
      });
      return;
    }
    setRedeemingServiceId(service.id);
    setBanner(null);
    try {
      await debitPoints(
        client.id,
        service.pointsCost,
        'service_redemption',
        `Redeemed Service: ${service.name}`,
        client.name,
        service.id
      );
      await addDoc(collection(db, 'rewardRedemptions'), {
        memberId: client.id,
        memberName: client.name,
        rewardId: service.id,
        rewardName: service.name,
        coinsSpent: service.pointsCost,
        currency: 'POINTS',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      await loadWalletData();
      setBanner({
        type: 'success',
        message: `Redeemed "${service.name}" for ${service.pointsCost} PTS! Show your activity history at the counter/desk to claim.`,
      });
    } catch (err: any) {
      setBanner({ type: 'error', message: err.message || 'Could not redeem service.' });
    } finally {
      setRedeemingServiceId(null);
    }
  };

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

  const cashBalance = wallet?.cashBalance || 0;
  const pointsBalance = wallet?.balance || 0;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── Dual-Wallet Hero: Real Money Cash Balance + Gym Points ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* 1. Cash Balance Card (EGP / LE) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-zinc-900 to-zinc-950 border border-emerald-500/30 p-5 text-white shadow-lg">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/15 rounded-full blur-2xl" />
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
                  <Banknote className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                    Cash Balance
                  </span>
                  <span className="text-[10px] text-zinc-400">Use for PT, Packages & Kitchen</span>
                </div>
              </div>
              {cashBalance > 0 && refundEligibility.canRefund && (
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] font-bold">
                  {refundEligibility.daysRemaining}d Refund Guarantee
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-1.5 pt-1">
              <span className="text-4xl font-black font-mono tracking-tight text-white">
                {cashBalance.toLocaleString()}
              </span>
              <span className="text-sm font-bold text-emerald-400">{t('payments.currency_le') || 'EGP'}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-[10px]">
              <div>
                <span className="text-zinc-400 block">Deposited</span>
                <span className="font-mono font-bold text-emerald-300">
                  {(wallet?.cashTotalDeposited || 0).toLocaleString()} EGP
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block">Used / Spent</span>
                <span className="font-mono font-bold text-zinc-200">
                  {(wallet?.cashTotalSpent || 0).toLocaleString()} EGP
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Gym Loyalty Points Card (PTS) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-950/90 via-zinc-900 to-zinc-950 border border-amber-500/30 p-5 text-white shadow-lg">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl" />
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
                  <Coins className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                    Service Points
                  </span>
                  <span className="text-[10px] text-zinc-400">Spend on In-Gym Services</span>
                </div>
              </div>
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[9px] font-bold">
                1 PTS per 100 EGP
              </Badge>
            </div>

            <div className="flex items-baseline gap-1.5 pt-1">
              <span className="text-4xl font-black font-mono tracking-tight text-white">
                {pointsBalance.toLocaleString()}
              </span>
              <span className="text-sm font-bold text-amber-400">PTS</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-[10px]">
              <div>
                <span className="text-zinc-400 block">Total Earned</span>
                <span className="font-mono font-bold text-amber-300">
                  {(wallet?.totalEarned || 0).toLocaleString()} PTS
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block">Total Spent</span>
                <span className="font-mono font-bold text-zinc-200">
                  {(wallet?.totalSpent || 0).toLocaleString()} PTS
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {banner && (
        <div
          className={`flex items-start gap-2.5 p-3.5 rounded-xl text-xs font-medium border ${
            banner.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
          }`}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">{banner.message}</div>
        </div>
      )}

      {/* ─── Navigation Tabs ─── */}
      <div className="grid grid-cols-5 gap-1 bg-muted/60 rounded-xl p-1 border border-border/60">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'deposit', label: 'Add Cash' },
            { id: 'services', label: 'Use Points' },
            { id: 'transfer', label: 'Transfer' },
            { id: 'history', label: 'History' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`py-2 px-1 rounded-lg text-[11px] font-bold transition-all truncate ${
              activeTab === tab.id
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: OVERVIEW ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              className="h-11 font-bold text-xs border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-2"
              onClick={() => setActiveTab('deposit')}
            >
              <Plus className="h-4 w-4" /> Deposit Cash Balance
            </Button>
            <Button
              variant="outline"
              className="h-11 font-bold text-xs border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center gap-2"
              onClick={() => setActiveTab('services')}
            >
              <Sparkles className="h-4 w-4" /> Spend Points on Services
            </Button>
          </div>

          <Card className="border bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" /> How Your Cash Balance & Points Work
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[
                {
                  icon: '💵',
                  title: 'Real-Money Cash Balance (EGP)',
                  desc: 'Deposit any amount (e.g. 5,000 or 10,000 EGP) to spend seamlessly at Earth’s Kitchen, PT sessions, or membership renewals without carrying cash.',
                },
                {
                  icon: '🔄',
                  title: 'Split-Payment Ready',
                  desc: 'Renewing a 10,000 EGP PT package with 5,000 EGP in your wallet? Use your 5,000 EGP Wallet Balance and pay only the remaining 5,000 EGP!',
                },
                {
                  icon: '🛡️',
                  title: `${WALLET_REFUND_WINDOW_DAYS}-Day Refund Guarantee & Member Transfer`,
                  desc: `Unused cash deposits can be refunded within ${WALLET_REFUND_WINDOW_DAYS} days of deposit, or transferred to any other gym member's wallet at any time.`,
                },
                {
                  icon: '⭐',
                  title: 'Service Points (PTS)',
                  desc: 'Earn 1 Point for every 100 EGP deposited or spent. Points are used exclusively for inside-gym services (shakes, coffee, InBody scans, classes, and PT perks).',
                },
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 p-2.5 rounded-xl bg-muted/30 border">
                  <span className="text-lg shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-xs font-extrabold text-foreground">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 14-Day Refund Card (if member has cash balance) */}
          {cashBalance > 0 && (
            <Card className="border bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5 text-emerald-500" /> {WALLET_REFUND_WINDOW_DAYS}-Day Deposit Refund Policy
                  </span>
                  <Badge variant="outline" className="text-[9px]">
                    {refundEligibility.canRefund
                      ? `${refundEligibility.daysRemaining} days left`
                      : 'Window elapsed'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {refundEligibility.canRefund ? (
                  <form onSubmit={handleRequestRefund} className="space-y-2.5">
                    <p className="text-[11px] text-muted-foreground">
                      Your cash balance of <strong>{cashBalance.toLocaleString()} EGP</strong> is within the{' '}
                      {WALLET_REFUND_WINDOW_DAYS}-day refund window. You can request a refund or keep it in your wallet.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={cashBalance}
                        placeholder={`Amount (max ${cashBalance} EGP)`}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder="Reason (optional)"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <Button type="submit" size="sm" variant="outline" className="h-8 text-xs font-bold" disabled={isSubmittingRefund}>
                      {isSubmittingRefund ? 'Submitting...' : 'Request Cash Refund'}
                    </Button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">{refundEligibility.reason}</p>
                    <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => setActiveTab('transfer')}>
                      Transfer to Member
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── TAB 2: ADD CASH BALANCE (DEPOSIT) ─── */}
      {activeTab === 'deposit' && (
        <div className="space-y-4">
          <Card className="border bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Banknote className="h-4 w-4 text-emerald-500" /> Top Up Your Cash Balance
              </CardTitle>
              <CardDescription className="text-xs">
                Deposit real money into your gym wallet to pay for PT sessions, memberships, or Earth&apos;s Kitchen orders.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRequestDeposit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Quick Select Amount (EGP)</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1000, 2500, 5000, 10000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDepositAmount(String(preset))}
                        className={`py-2 rounded-xl text-xs font-extrabold font-mono border transition-all ${
                          Number(depositAmount) === preset
                            ? 'bg-emerald-500 text-black border-emerald-400 shadow'
                            : 'bg-muted/40 text-foreground border-border hover:border-emerald-500/40'
                        }`}
                      >
                        {preset.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Custom Amount (EGP)</Label>
                    <Input
                      type="number"
                      min={100}
                      step={50}
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="e.g. 10000"
                      className="font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Method</Label>
                    <select
                      value={depositMethod}
                      onChange={(e) => setDepositMethod(e.target.value as any)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs font-bold"
                    >
                      <option value="Instapay">Instapay</option>
                      <option value="Cash">Cash at Reception</option>
                      <option value="Credit Card">Visa / Credit Card</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>

                {depositMethod === 'Instapay' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Instapay Reference / Sender Handle (optional)</Label>
                    <Input
                      value={depositInstapayRef}
                      onChange={(e) => setDepositInstapayRef(e.target.value)}
                      placeholder="12-digit IPN reference or handle"
                      className="text-xs font-mono"
                    />
                  </div>
                )}

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-emerald-500">Loyalty Bonus Included</p>
                    <p className="text-[10px] text-muted-foreground">
                      Refundable within {WALLET_REFUND_WINDOW_DAYS} days if unused
                    </p>
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 font-mono font-bold">
                    +{Math.floor((Number(depositAmount) || 0) / 100)} PTS
                  </Badge>
                </div>

                <Button type="submit" className="w-full font-bold" disabled={isSubmittingDeposit}>
                  {isSubmittingDeposit
                    ? 'Submitting Request...'
                    : `Deposit ${(Number(depositAmount) || 0).toLocaleString()} EGP to Wallet`}
                </Button>
              </form>
            </CardContent>
          </Card>

          {depositRequests.length > 0 && (
            <Card className="border bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider">Recent Deposit Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {depositRequests.slice(0, 5).map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border text-xs">
                    <div>
                      <p className="font-bold font-mono">{req.amountEGP.toLocaleString()} EGP · {req.method}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {(() => { try { return format(parseISO(req.createdAt), 'dd MMM yyyy, h:mm a'); } catch { return ''; } })()}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] uppercase font-bold ${
                        req.status === 'approved'
                          ? 'text-emerald-500 border-emerald-500/30'
                          : req.status === 'rejected'
                          ? 'text-rose-500 border-rose-500/30'
                          : 'text-amber-500 border-amber-500/30'
                      }`}
                    >
                      {req.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── TAB 3: USE POINTS ON GYM SERVICES & BUNDLES ─── */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <Card className="border bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" /> Spend Points on In-Gym Services
              </CardTitle>
              <CardDescription className="text-xs">
                Points are exclusively used for inside-gym services, drinks at Earth&apos;s Kitchen, scans, and session perks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {GYM_SERVICE_CATALOG.map((service) => {
                const canAfford = pointsBalance >= service.pointsCost;
                return (
                  <div
                    key={service.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/30 border hover:bg-muted/50 transition-colors"
                  >
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-foreground">{service.name}</span>
                        <Badge variant="outline" className="text-[9px]">
                          {service.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{service.description}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <div className="text-sm font-black font-mono text-amber-500">{service.pointsCost} PTS</div>
                      <Button
                        size="sm"
                        className="h-7 text-[10px] font-bold px-3"
                        disabled={!canAfford || redeemingServiceId === service.id}
                        onClick={() => handleRedeemServiceWithPoints(service)}
                      >
                        {redeemingServiceId === service.id ? 'Redeeming...' : canAfford ? 'Redeem' : 'Need PTS'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Points Bundles */}
          {bundles.length > 0 && (
            <Card className="border bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Coins className="h-4 w-4 text-amber-500" /> Points Bundles
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2.5">
                {bundles.map((bundle, idx) => (
                  <div
                    key={bundle.id || idx}
                    className="flex items-center justify-between p-3 rounded-xl border bg-muted/20"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{bundle.name}</span>
                        {bundle.bonusPoints > 0 && (
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px]">
                            +{bundle.bonusPoints} Bonus PTS
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-black font-mono text-amber-500 mt-0.5">
                        {bundle.pointsAmount + (bundle.bonusPoints || 0)} PTS Total
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold font-mono">{bundle.priceEGP.toLocaleString()} EGP</p>
                      <span className="text-[10px] text-muted-foreground">Ask Front Desk</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── TAB 4: TRANSFER CASH BALANCE TO ANOTHER MEMBER ─── */}
      {activeTab === 'transfer' && (
        <Card className="border bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" /> Transfer Cash Balance to Another Member
            </CardTitle>
            <CardDescription className="text-xs">
              Share or transfer your available Cash Balance ({cashBalance.toLocaleString()} EGP) to a family member or training partner&apos;s wallet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTransferCash} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold">1. Find Recipient Member</Label>
                <div className="flex gap-2">
                  <Input
                    value={recipientQuery}
                    onChange={(e) => setRecipientQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchRecipient();
                      }
                    }}
                    placeholder="Search by Name, Member ID, or Phone..."
                    className="text-xs"
                  />
                  <Button type="button" size="sm" variant="secondary" onClick={handleSearchRecipient}>
                    Search
                  </Button>
                </div>

                {recipientResults.length > 0 && !selectedRecipient && (
                  <div className="border rounded-xl divide-y max-h-40 overflow-y-auto bg-background">
                    {recipientResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSelectedRecipient(r);
                          setRecipientResults([]);
                        }}
                        className="w-full text-left p-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <p className="text-xs font-bold">{r.name}</p>
                          <p className="text-[10px] text-muted-foreground">#{r.memberId} · {r.phone}</p>
                        </div>
                        <Badge variant="outline" className="text-[9px]">Select</Badge>
                      </button>
                    ))}
                  </div>
                )}

                {selectedRecipient && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/30">
                    <div>
                      <p className="text-xs font-extrabold">{selectedRecipient.name}</p>
                      <p className="text-[10px] text-muted-foreground">Member #{selectedRecipient.memberId}</p>
                    </div>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedRecipient(null)}>
                      Change
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount to Transfer (EGP)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={cashBalance || undefined}
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder={`Max ${cashBalance.toLocaleString()} EGP`}
                    className="font-mono font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Note (optional)</Label>
                  <Input
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    placeholder="e.g. For PT renewal"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full font-bold"
                disabled={isTransferring || !selectedRecipient || !transferAmount || Number(transferAmount) <= 0}
              >
                <Send className="h-4 w-4 mr-1.5" />
                {isTransferring ? 'Transferring...' : 'Transfer Wallet Balance Now'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ─── TAB 5: TRANSACTION HISTORY ─── */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            {(['all', 'cash', 'points'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setHistoryFilter(f)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border transition-all ${
                  historyFilter === f
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card/50 text-muted-foreground border-border'
                }`}
              >
                {f === 'all' ? 'All Activity' : f === 'cash' ? 'Cash Balance (EGP)' : 'Service Points (PTS)'}
              </button>
            ))}
          </div>

          {filteredTransactions.length === 0 ? (
            <Card className="border-dashed bg-muted/20">
              <CardContent className="py-10 text-center text-xs text-muted-foreground italic">
                <Clock className="h-8 w-8 mx-auto opacity-20 mb-2" />
                No wallet transactions recorded yet.
              </CardContent>
            </Card>
          ) : (
            filteredTransactions.map((txn) => {
              const isCash = txn.walletType === 'cash' || txn.reason?.startsWith('cash_');
              return (
                <div
                  key={txn.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-card/50 border transition-colors hover:bg-card/70"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl border ${
                        txn.type === 'credit'
                          ? 'bg-emerald-500/10 border-emerald-500/20'
                          : 'bg-secondary border-border'
                      }`}
                    >
                      {txn.type === 'credit' ? (
                        <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold">{txn.description}</p>
                        <Badge variant="outline" className="text-[8px] px-1.5 py-0">
                          {isCash ? 'CASH' : 'POINTS'}
                        </Badge>
                      </div>
                      <p className="text-[9px] text-muted-foreground">
                        Balance: {txn.balanceBefore.toLocaleString()} → {txn.balanceAfter.toLocaleString()}{' '}
                        {isCash ? 'EGP' : 'PTS'}
                      </p>
                      <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                        {(() => {
                          try {
                            return format(parseISO(txn.createdAt), 'dd MMM yyyy, h:mm a');
                          } catch {
                            return '';
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-extrabold font-mono ${
                      txn.type === 'credit' ? 'text-emerald-500' : 'text-muted-foreground'
                    }`}
                  >
                    {txn.type === 'credit' ? '+' : '-'}
                    {txn.amount.toLocaleString()} {isCash ? 'EGP' : 'PTS'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
