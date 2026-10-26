import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Coins,
  Plus,
  Minus,
  Save,
  Package,
  TrendingUp,
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  CheckCircle2,
  AlertCircle,
  Banknote,
  RotateCcw,
  ArrowRightLeft,
  Clock,
} from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { useAppContext } from '../context';
import {
  creditPoints,
  debitPoints,
  depositCashBalance,
  spendCashBalance,
  refundCashBalance,
  transferCashBalance,
  getCashRefundEligibility,
  getOrCreateWallet,
  getTransactionHistory,
  getAllBundles,
  saveBundle,
  seedDefaultBundles,
  getAllRecentWalletTransactions,
  WALLET_REFUND_WINDOW_DAYS,
  type PointsWallet,
  type PointsTransaction,
  type PointsBundle,
  type WalletDepositRequest,
  type WalletRefundRequest,
} from '../services/pointsService';
import { format, parseISO } from 'date-fns';

export default function AdminPointsManager() {
  const { currentUser, branding } = useAppContext();
  const [activeTab, setActiveTab] = useState<'credit' | 'requests' | 'bundles' | 'ledger'>('credit');

  // Member Search & Wallet State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; memberId: string; phone: string }[]>([]);
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string; memberId: string } | null>(null);
  const [memberWallet, setMemberWallet] = useState<PointsWallet | null>(null);
  const [memberTxns, setMemberTxns] = useState<PointsTransaction[]>([]);

  // Wallet Operation Controls
  const [walletCurrency, setWalletCurrency] = useState<'cash' | 'points'>('cash');
  const [actionType, setActionType] = useState<'credit' | 'debit' | 'refund' | 'transfer'>('credit');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Instapay' | 'Credit Card' | 'Bank Transfer'>('Cash');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [forceBypassRefundWindow, setForceBypassRefundWindow] = useState(false);

  // Transfer Target State (Admin Transfer between 2 members)
  const [transferSearch, setTransferSearch] = useState('');
  const [transferResults, setTransferResults] = useState<{ id: string; name: string; memberId: string; phone: string }[]>([]);
  const [transferTarget, setTransferTarget] = useState<{ id: string; name: string; memberId: string } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Pending Deposit & Refund Requests
  const [depositRequests, setDepositRequests] = useState<WalletDepositRequest[]>([]);
  const [refundRequests, setRefundRequests] = useState<WalletRefundRequest[]>([]);
  const [allLedgerTxns, setAllLedgerTxns] = useState<PointsTransaction[]>([]);

  // Bundle state
  const [bundles, setBundles] = useState<PointsBundle[]>([]);
  const [bundleForm, setBundleForm] = useState<PointsBundle>({
    name: '',
    pointsAmount: 0,
    priceEGP: 0,
    bonusPoints: 0,
    active: true,
    sortOrder: 1,
  });
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [isSavingBundle, setIsSavingBundle] = useState(false);

  const loadAllAdminData = async () => {
    try {
      const [b, depSnap, refSnap, ledger] = await Promise.all([
        getAllBundles(),
        getDocs(collection(db, 'walletDepositRequests')).catch(() => null),
        getDocs(collection(db, 'walletRefundRequests')).catch(() => null),
        getAllRecentWalletTransactions(80).catch(() => []),
      ]);
      setBundles(b);
      if (depSnap) {
        const deps = depSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as WalletDepositRequest));
        deps.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
        setDepositRequests(deps);
      }
      if (refSnap) {
        const refs = refSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as WalletRefundRequest));
        refs.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
        setRefundRequests(refs);
      }
      setAllLedgerTxns(ledger);
    } catch (err) {
      console.error('Failed to load admin wallet data:', err);
    }
  };

  useEffect(() => {
    seedDefaultBundles().then(() => loadAllAdminData());
  }, []);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    try {
      const snap = await getDocs(collection(db, 'clients'));
      const term = searchTerm.toLowerCase().trim();
      const results = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter(
          (c: any) =>
            String(c.name || '').toLowerCase().includes(term) ||
            String(c.memberId || '').toLowerCase().includes(term) ||
            String(c.phone || '').includes(term)
        )
        .slice(0, 10)
        .map((c: any) => ({
          id: c.id,
          name: String(c.name || ''),
          memberId: c.memberId != null ? String(c.memberId) : 'N/A',
          phone: String(c.phone || ''),
        }));
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleSearchTransferTarget = async () => {
    if (!transferSearch.trim()) return;
    try {
      const snap = await getDocs(collection(db, 'clients'));
      const term = transferSearch.toLowerCase().trim();
      const results = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter(
          (c: any) =>
            c.id !== selectedMember?.id &&
            (String(c.name || '').toLowerCase().includes(term) ||
              String(c.memberId || '').toLowerCase().includes(term) ||
              String(c.phone || '').includes(term))
        )
        .slice(0, 8)
        .map((c: any) => ({
          id: c.id,
          name: String(c.name || ''),
          memberId: c.memberId != null ? String(c.memberId) : 'N/A',
          phone: String(c.phone || ''),
        }));
      setTransferResults(results);
    } catch (err) {
      console.error('Transfer search failed:', err);
    }
  };

  const handleSelectMember = async (member: { id: string; name: string; memberId: string }) => {
    setSelectedMember(member);
    setSearchResults([]);
    setActionResult(null);
    try {
      const [w, txns] = await Promise.all([getOrCreateWallet(member.id), getTransactionHistory(member.id, 20)]);
      setMemberWallet(w);
      setMemberTxns(txns);
    } catch (err) {
      console.error('Failed to load wallet:', err);
    }
  };

  const handleProcessAction = async () => {
    if (!selectedMember || !amount || Number(amount) <= 0) return;
    setIsProcessing(true);
    setActionResult(null);
    try {
      const val = Number(amount);
      const by = currentUser?.name || currentUser?.email || 'Admin';

      if (walletCurrency === 'cash') {
        if (actionType === 'credit') {
          const desc = reason.trim() || `Cash Wallet Deposit (${paymentMethod})`;
          await depositCashBalance(selectedMember.id, val, paymentMethod, desc, by);
          setActionResult({
            type: 'success',
            message: `Deposited ${val.toLocaleString()} EGP into ${selectedMember.name}'s Cash Balance (+${Math.floor(val / 100)} bonus PTS).`,
          });
        } else if (actionType === 'debit') {
          const desc = reason.trim() || 'In-Gym Service / Package Spend';
          await spendCashBalance(selectedMember.id, val, 'cash_spend', desc, by);
          setActionResult({
            type: 'success',
            message: `Deducted ${val.toLocaleString()} EGP from ${selectedMember.name}'s Cash Balance.`,
          });
        } else if (actionType === 'refund') {
          const desc = reason.trim() || `Cash Balance Refund (${WALLET_REFUND_WINDOW_DAYS}-day policy)`;
          await refundCashBalance(selectedMember.id, val, desc, by, forceBypassRefundWindow);
          setActionResult({
            type: 'success',
            message: `Refunded ${val.toLocaleString()} EGP from ${selectedMember.name}'s Cash Balance.`,
          });
        } else if (actionType === 'transfer') {
          if (!transferTarget) {
            throw new Error('Please select a recipient member to transfer the balance to.');
          }
          await transferCashBalance({
            fromMemberId: selectedMember.id,
            fromMemberName: selectedMember.name,
            toMemberId: transferTarget.id,
            toMemberName: transferTarget.name,
            amountEGP: val,
            note: reason.trim() || undefined,
            createdBy: by,
          });
          setActionResult({
            type: 'success',
            message: `Transferred ${val.toLocaleString()} EGP from ${selectedMember.name} to ${transferTarget.name}.`,
          });
          setTransferTarget(null);
          setTransferSearch('');
        }
      } else {
        const desc = reason.trim() || (actionType === 'credit' ? 'Staff Points Credit' : 'In-Gym Service Points Redemption');
        if (actionType === 'credit') {
          await creditPoints(selectedMember.id, val, 'admin_adjustment', desc, by);
        } else {
          await debitPoints(selectedMember.id, val, 'service_redemption', desc, by);
        }
        setActionResult({
          type: 'success',
          message: `${actionType === 'credit' ? 'Credited' : 'Debited'} ${val} PTS ${actionType === 'credit' ? 'to' : 'from'} ${selectedMember.name}.`,
        });
      }

      const [w, txns] = await Promise.all([
        getOrCreateWallet(selectedMember.id),
        getTransactionHistory(selectedMember.id, 20),
      ]);
      setMemberWallet(w);
      setMemberTxns(txns);
      setAmount('');
      setReason('');
      await loadAllAdminData();
    } catch (err: any) {
      setActionResult({ type: 'error', message: err.message || 'Operation failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveDepositRequest = async (req: WalletDepositRequest) => {
    if (!req.id) return;
    try {
      const by = currentUser?.name || currentUser?.email || 'Admin';
      await depositCashBalance(
        req.memberId,
        req.amountEGP,
        req.method,
        `Approved Deposit Request (${req.method}${req.instapayRef ? ` · Ref: ${req.instapayRef}` : ''})`,
        by,
        req.id
      );
      await updateDoc(doc(db, 'walletDepositRequests', req.id), {
        status: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy: by,
      });
      await loadAllAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to approve deposit request');
    }
  };

  const handleRejectDepositRequest = async (req: WalletDepositRequest) => {
    if (!req.id) return;
    try {
      const by = currentUser?.name || currentUser?.email || 'Admin';
      await updateDoc(doc(db, 'walletDepositRequests', req.id), {
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        reviewedBy: by,
      });
      await loadAllAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to reject request');
    }
  };

  const handleApproveRefundRequest = async (req: WalletRefundRequest) => {
    if (!req.id) return;
    try {
      const by = currentUser?.name || currentUser?.email || 'Admin';
      await refundCashBalance(req.memberId, req.amountEGP, `Approved Refund: ${req.reason}`, by, true);
      await updateDoc(doc(db, 'walletRefundRequests', req.id), {
        status: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy: by,
      });
      await loadAllAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to approve refund request');
    }
  };

  const handleSaveBundle = async () => {
    if (!bundleForm.name.trim() || bundleForm.pointsAmount <= 0) return;
    setIsSavingBundle(true);
    try {
      if (editingBundleId) {
        await saveBundle({ ...bundleForm, id: editingBundleId });
        setEditingBundleId(null);
      } else {
        await saveBundle(bundleForm);
      }
      setBundleForm({
        name: '',
        pointsAmount: 0,
        priceEGP: 0,
        bonusPoints: 0,
        active: true,
        sortOrder: bundles.length + 1,
      });
      await loadAllAdminData();
    } catch (err) {
      console.error('Failed to save bundle:', err);
    } finally {
      setIsSavingBundle(false);
    }
  };

  const refundElig = getCashRefundEligibility(memberWallet);
  const pendingDepositsCount = depositRequests.filter((r) => r.status === 'pending').length;
  const pendingRefundsCount = refundRequests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-emerald-500/10 rounded-xl">
          <Banknote className="h-6 w-6 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Member Wallet: Cash Balance & Service Points</h2>
          <p className="text-xs text-muted-foreground">
            Manage real-money wallet deposits (EGP), {WALLET_REFUND_WINDOW_DAYS}-day refunds, member-to-member transfers, and service points (PTS).
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {(
          [
            { id: 'credit', label: 'Manage Member Wallet' },
            { id: 'requests', label: `Requests (${pendingDepositsCount + pendingRefundsCount})` },
            { id: 'bundles', label: 'Points Bundles' },
            { id: 'ledger', label: 'Gym-Wide Ledger' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: MANAGE MEMBER WALLET ─── */}
      {activeTab === 'credit' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" /> Find Member & Manage Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Name, Member ID, or Phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} size="sm">
                  Search
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {searchResults.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleSelectMember(r)}
                      className="w-full text-left p-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-xs font-bold">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        #{r.memberId} · {r.phone}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {selectedMember && (
                <div className="p-4 rounded-xl bg-muted/20 border space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div>
                      <p className="text-sm font-extrabold">{selectedMember.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">Member #{selectedMember.memberId}</p>
                    </div>
                    <div className="flex gap-4 text-right">
                      <div>
                        <p className="text-xl font-black font-mono text-emerald-500">
                          {(memberWallet?.cashBalance || 0).toLocaleString()} EGP
                        </p>
                        <p className="text-[9px] text-muted-foreground font-bold uppercase">Cash Balance</p>
                      </div>
                      <div>
                        <p className="text-xl font-black font-mono text-amber-500">{memberWallet?.balance || 0} PTS</p>
                        <p className="text-[9px] text-muted-foreground font-bold uppercase">Service Points</p>
                      </div>
                    </div>
                  </div>

                  {/* Select Currency: Cash Balance vs Service Points */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setWalletCurrency('cash');
                        setActionType('credit');
                      }}
                      className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                        walletCurrency === 'cash'
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-500'
                          : 'bg-muted/40 border-border text-muted-foreground'
                      }`}
                    >
                      <Banknote className="h-4 w-4" /> Real Money (EGP)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWalletCurrency('points');
                        if (actionType === 'refund' || actionType === 'transfer') setActionType('credit');
                      }}
                      className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                        walletCurrency === 'points'
                          ? 'bg-amber-500/15 border-amber-500 text-amber-500'
                          : 'bg-muted/40 border-border text-muted-foreground'
                      }`}
                    >
                      <Coins className="h-4 w-4" /> Service Points (PTS)
                    </button>
                  </div>

                  {/* Action Type */}
                  {walletCurrency === 'cash' ? (
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          { id: 'credit', label: 'Deposit', icon: Plus },
                          { id: 'debit', label: 'Spend', icon: Minus },
                          { id: 'refund', label: 'Refund', icon: RotateCcw },
                          { id: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
                        ] as const
                      ).map((act) => {
                        const Icon = act.icon;
                        return (
                          <button
                            key={act.id}
                            type="button"
                            onClick={() => setActionType(act.id)}
                            className={`p-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                              actionType === act.id
                                ? 'bg-primary text-primary-foreground shadow'
                                : 'bg-muted/50 text-muted-foreground'
                            }`}
                          >
                            <Icon className="h-3 w-3" /> {act.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setActionType('credit')}
                        className={`p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                          actionType === 'credit'
                            ? 'bg-emerald-500 text-white shadow'
                            : 'bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        <Plus className="h-3 w-3" /> Earn / Credit Points
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionType('debit')}
                        className={`p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                          actionType === 'debit'
                            ? 'bg-rose-500 text-white shadow'
                            : 'bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        <Minus className="h-3 w-3" /> Spend on Gym Service
                      </button>
                    </div>
                  )}

                  {walletCurrency === 'cash' && actionType === 'credit' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Deposit Payment Method</Label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs font-bold"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Instapay">Instapay</option>
                        <option value="Credit Card">Visa / Credit Card</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                    </div>
                  )}

                  {walletCurrency === 'cash' && actionType === 'refund' && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-500">14-Day Refund Window Check</span>
                        <Badge variant="outline" className="text-[9px]">
                          {refundElig.canRefund ? `${refundElig.daysRemaining}d remaining` : 'Expired'}
                        </Badge>
                      </div>
                      {!refundElig.canRefund && (
                        <label className="flex items-center gap-2 text-[11px] cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={forceBypassRefundWindow}
                            onChange={(e) => setForceBypassRefundWindow(e.target.checked)}
                          />
                          <span>Manager Override: Force refund past 14-day window</span>
                        </label>
                      )}
                    </div>
                  )}

                  {walletCurrency === 'cash' && actionType === 'transfer' && (
                    <div className="space-y-2 p-2.5 rounded-lg bg-muted/40 border">
                      <Label className="text-xs font-bold">Recipient Member</Label>
                      <div className="flex gap-2">
                        <Input
                          value={transferSearch}
                          onChange={(e) => setTransferSearch(e.target.value)}
                          placeholder="Search recipient name / ID / phone..."
                          className="h-8 text-xs"
                        />
                        <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={handleSearchTransferTarget}>
                          Find
                        </Button>
                      </div>
                      {transferResults.length > 0 && !transferTarget && (
                        <div className="border rounded divide-y max-h-32 overflow-y-auto bg-background">
                          {transferResults.map((tr) => (
                            <button
                              key={tr.id}
                              type="button"
                              onClick={() => {
                                setTransferTarget(tr);
                                setTransferResults([]);
                              }}
                              className="w-full text-left p-2 text-xs hover:bg-muted/50"
                            >
                              <span className="font-bold">{tr.name}</span> (#{tr.memberId})
                            </button>
                          ))}
                        </div>
                      )}
                      {transferTarget && (
                        <div className="flex items-center justify-between p-2 rounded bg-primary/10 text-xs">
                          <span className="font-bold">To: {transferTarget.name} (#{transferTarget.memberId})</span>
                          <button type="button" className="text-[10px] underline" onClick={() => setTransferTarget(null)}>
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs">
                      Amount ({walletCurrency === 'cash' ? branding.currencySymbol || 'EGP' : 'Points'})
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={walletCurrency === 'cash' ? 'e.g. 10000' : 'e.g. 25'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Description / Service Note</Label>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={
                        walletCurrency === 'cash'
                          ? 'e.g. Front desk cash deposit / PT package payment'
                          : 'e.g. Redeemed Protein Shake at Earth’s Kitchen'
                      }
                    />
                  </div>

                  <Button
                    className="w-full font-bold"
                    onClick={handleProcessAction}
                    disabled={isProcessing || !amount || Number(amount) <= 0}
                  >
                    {isProcessing
                      ? 'Processing...'
                      : `Confirm ${actionType.toUpperCase()} (${Number(amount || 0).toLocaleString()} ${
                          walletCurrency === 'cash' ? 'EGP' : 'PTS'
                        })`}
                  </Button>

                  {actionResult && (
                    <div
                      className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium ${
                        actionResult.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-rose-500/10 text-rose-600'
                      }`}
                    >
                      {actionResult.type === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0" />
                      )}
                      <span>{actionResult.message}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Member Transaction History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                {selectedMember ? `${selectedMember.name}'s Wallet Ledger` : 'Member Wallet History'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedMember ? (
                <p className="text-xs text-muted-foreground text-center py-8 italic">
                  Search and select a member to view their Cash Balance & Points history.
                </p>
              ) : memberTxns.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8 italic">
                  No wallet transactions yet for this member.
                </p>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto">
                  {memberTxns.map((txn) => {
                    const isCash = txn.walletType === 'cash' || txn.reason?.startsWith('cash_');
                    return (
                      <div key={txn.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border text-xs">
                        <div className="flex items-center gap-2">
                          {txn.type === 'credit' ? (
                            <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <ArrowDownCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold">{txn.description}</p>
                              <Badge variant="outline" className="text-[8px] px-1 py-0">
                                {isCash ? 'CASH' : 'PTS'}
                              </Badge>
                            </div>
                            <p className="text-[9px] text-muted-foreground font-mono">
                              {(() => {
                                try {
                                  return format(parseISO(txn.createdAt), 'dd MMM, h:mm a');
                                } catch {
                                  return '';
                                }
                              })()}
                              {txn.createdBy ? ` · by ${txn.createdBy}` : ''}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`font-extrabold font-mono shrink-0 ${
                            txn.type === 'credit' ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {txn.type === 'credit' ? '+' : '-'}
                          {txn.amount.toLocaleString()} {isCash ? 'EGP' : 'PTS'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 2: PENDING DEPOSIT & REFUND REQUESTS ─── */}
      {activeTab === 'requests' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Banknote className="h-4 w-4 text-emerald-500" /> Member Cash Deposit Requests ({pendingDepositsCount} Pending)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {depositRequests.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8 italic">No deposit requests yet.</p>
              ) : (
                depositRequests.map((req) => (
                  <div key={req.id} className="p-3 rounded-xl border bg-card/50 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold">{req.memberName}</p>
                      <p className="text-sm font-black font-mono text-emerald-500">
                        {req.amountEGP.toLocaleString()} EGP ({req.method})
                      </p>
                      {req.instapayRef && (
                        <p className="text-[10px] font-mono text-muted-foreground">Ref: {req.instapayRef}</p>
                      )}
                      <p className="text-[9px] text-muted-foreground">
                        {(() => {
                          try {
                            return format(parseISO(req.createdAt), 'dd MMM yyyy, h:mm a');
                          } catch {
                            return '';
                          }
                        })()}
                      </p>
                    </div>
                    {req.status === 'pending' ? (
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-7 text-xs font-bold" onClick={() => handleApproveDepositRequest(req)}>
                          Approve & Credit
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleRejectDepositRequest(req)}>
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[9px] uppercase">
                        {req.status}
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-500" /> 14-Day Refund Requests ({pendingRefundsCount} Pending)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {refundRequests.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8 italic">No refund requests yet.</p>
              ) : (
                refundRequests.map((req) => (
                  <div key={req.id} className="p-3 rounded-xl border bg-card/50 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold">{req.memberName}</p>
                      <p className="text-sm font-black font-mono text-amber-500">
                        Refund: {req.amountEGP.toLocaleString()} EGP
                      </p>
                      <p className="text-[10px] text-muted-foreground">{req.reason}</p>
                    </div>
                    {req.status === 'pending' ? (
                      <Button size="sm" className="h-7 text-xs font-bold" onClick={() => handleApproveRefundRequest(req)}>
                        Process Refund
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-[9px] uppercase">
                        {req.status}
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 3: BUNDLES ─── */}
      {activeTab === 'bundles' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                {editingBundleId ? 'Edit Bundle' : 'Create Bundle'}
              </CardTitle>
              <CardDescription className="text-[11px]">
                Points bundles members can purchase at reception.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Bundle Name *</Label>
                <Input
                  value={bundleForm.name}
                  onChange={(e) => setBundleForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Starter"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Points Amount *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={bundleForm.pointsAmount || ''}
                    onChange={(e) => setBundleForm((f) => ({ ...f, pointsAmount: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Price ({branding.currencySymbol || 'LE'}) *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={bundleForm.priceEGP || ''}
                    onChange={(e) => setBundleForm((f) => ({ ...f, priceEGP: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Bonus Points</Label>
                  <Input
                    type="number"
                    min={0}
                    value={bundleForm.bonusPoints || ''}
                    onChange={(e) => setBundleForm((f) => ({ ...f, bonusPoints: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Sort Order</Label>
                  <Input
                    type="number"
                    min={1}
                    value={bundleForm.sortOrder || ''}
                    onChange={(e) => setBundleForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSaveBundle} disabled={isSavingBundle || !bundleForm.name.trim()}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSavingBundle ? 'Saving...' : editingBundleId ? 'Update' : 'Create'}
                </Button>
                {editingBundleId && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingBundleId(null);
                      setBundleForm({
                        name: '',
                        pointsAmount: 0,
                        priceEGP: 0,
                        bonusPoints: 0,
                        active: true,
                        sortOrder: bundles.length + 1,
                      });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">Active Bundles ({bundles.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {bundles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6 italic">No bundles yet.</p>
              ) : (
                bundles.map((b) => (
                  <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold">{b.name}</p>
                        {!b.active && (
                          <Badge variant="outline" className="text-[8px]">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {b.pointsAmount} pts · {b.priceEGP.toLocaleString()} {branding.currencySymbol || 'LE'}
                        {b.bonusPoints > 0 ? ` · +${b.bonusPoints} bonus` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingBundleId(b.id || null);
                        setBundleForm(b);
                      }}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB 4: GYM-WIDE LEDGER ─── */}
      {activeTab === 'ledger' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Gym-Wide Wallet & Points Ledger
            </CardTitle>
            <CardDescription className="text-[11px]">
              Recent Cash Balance deposits, spends, transfers, refunds, and Points transactions across all members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allLedgerTxns.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 italic">No wallet transactions recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {allLedgerTxns.map((txn) => {
                  const isCash = txn.walletType === 'cash' || txn.reason?.startsWith('cash_');
                  return (
                    <div key={txn.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border text-xs">
                      <div className="flex items-center gap-2.5">
                        {txn.type === 'credit' ? (
                          <ArrowUpCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <ArrowDownCircle className="h-4 w-4 text-rose-500 shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold">{txn.description}</span>
                            <Badge variant="outline" className="text-[8px] px-1.5 py-0">
                              {isCash ? 'CASH (EGP)' : 'POINTS (PTS)'}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            Member ID: {txn.memberId} · Balance: {txn.balanceBefore.toLocaleString()} →{' '}
                            {txn.balanceAfter.toLocaleString()} · by {txn.createdBy}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`font-extrabold font-mono ${
                          txn.type === 'credit' ? 'text-emerald-500' : 'text-rose-500'
                        }`}
                      >
                        {txn.type === 'credit' ? '+' : '-'}
                        {txn.amount.toLocaleString()} {isCash ? 'EGP' : 'PTS'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
