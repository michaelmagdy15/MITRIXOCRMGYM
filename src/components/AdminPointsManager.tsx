import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Coins, Plus, Minus, Save, Trash2, Package, Users, TrendingUp, ArrowUpCircle, ArrowDownCircle, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAppContext } from '../context';
import {
  creditPoints, debitPoints, getOrCreateWallet, getTransactionHistory, 
  getAllBundles, saveBundle, seedDefaultBundles,
  type PointsWallet, type PointsTransaction, type PointsBundle
} from '../services/pointsService';
import { format, parseISO } from 'date-fns';

export default function AdminPointsManager() {
  const { currentUser } = useAppContext();
  const [activeTab, setActiveTab] = useState<'credit' | 'bundles' | 'ledger'>('credit');

  // Credit/Debit state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; memberId: string; phone: string }[]>([]);
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string; memberId: string } | null>(null);
  const [memberWallet, setMemberWallet] = useState<PointsWallet | null>(null);
  const [memberTxns, setMemberTxns] = useState<PointsTransaction[]>([]);
  const [actionType, setActionType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Bundle state
  const [bundles, setBundles] = useState<PointsBundle[]>([]);
  const [bundleForm, setBundleForm] = useState<PointsBundle>({ name: '', pointsAmount: 0, priceEGP: 0, bonusPoints: 0, active: true, sortOrder: 1 });
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [isSavingBundle, setIsSavingBundle] = useState(false);

  useEffect(() => {
    seedDefaultBundles().then(() => loadBundles());
  }, []);

  const loadBundles = async () => {
    const b = await getAllBundles();
    setBundles(b);
  };

  // Search members
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    try {
      const snap = await getDocs(collection(db, 'clients'));
      const term = searchTerm.toLowerCase().trim();
      const results = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((c: any) =>
          (c.name || '').toLowerCase().includes(term) ||
          (c.memberId || '').toLowerCase().includes(term) ||
          (c.phone || '').includes(term)
        )
        .slice(0, 10)
        .map((c: any) => ({ id: c.id, name: c.name, memberId: c.memberId || 'N/A', phone: c.phone || '' }));
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleSelectMember = async (member: { id: string; name: string; memberId: string }) => {
    setSelectedMember(member);
    setSearchResults([]);
    try {
      const [w, txns] = await Promise.all([
        getOrCreateWallet(member.id),
        getTransactionHistory(member.id, 10)
      ]);
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
      const pts = Number(amount);
      const desc = reason.trim() || (actionType === 'credit' ? 'Admin credit' : 'Admin debit');
      const by = currentUser?.email || 'admin';

      if (actionType === 'credit') {
        await creditPoints(selectedMember.id, pts, 'admin_adjustment', desc, by);
      } else {
        await debitPoints(selectedMember.id, pts, 'admin_adjustment', desc, by);
      }

      // Refresh
      const [w, txns] = await Promise.all([
        getOrCreateWallet(selectedMember.id),
        getTransactionHistory(selectedMember.id, 10)
      ]);
      setMemberWallet(w);
      setMemberTxns(txns);
      setAmount('');
      setReason('');
      setActionResult({ type: 'success', message: `${actionType === 'credit' ? 'Credited' : 'Debited'} ${pts} points ${actionType === 'credit' ? 'to' : 'from'} ${selectedMember.name}` });
    } catch (err: any) {
      setActionResult({ type: 'error', message: err.message || 'Operation failed' });
    } finally {
      setIsProcessing(false);
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
      setBundleForm({ name: '', pointsAmount: 0, priceEGP: 0, bonusPoints: 0, active: true, sortOrder: bundles.length + 1 });
      await loadBundles();
    } catch (err) {
      console.error('Failed to save bundle:', err);
    } finally {
      setIsSavingBundle(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-500/10 rounded-xl">
          <Coins className="h-6 w-6 text-amber-500" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Points Management</h2>
          <p className="text-xs text-muted-foreground">Credit, debit, and manage Points bundles for members.</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {(['credit', 'bundles', 'ledger'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
              activeTab === tab ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'credit' ? 'Credit / Debit' : tab === 'bundles' ? 'Bundles' : 'Ledger'}
          </button>
        ))}
      </div>

      {/* ─── Credit / Debit Tab ─── */}
      {activeTab === 'credit' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" /> Find Member
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Name, Member ID, or Phone..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} size="sm">Search</Button>
              </div>

              {searchResults.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {searchResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => handleSelectMember(r)}
                      className="w-full text-left p-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-xs font-bold">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">{r.memberId} · {r.phone}</p>
                    </button>
                  ))}
                </div>
              )}

              {selectedMember && (
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-extrabold">{selectedMember.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{selectedMember.memberId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black font-mono text-amber-500">{memberWallet?.balance || 0}</p>
                      <p className="text-[9px] text-muted-foreground font-bold">PTS BALANCE</p>
                    </div>
                  </div>

                  {/* Action Type */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setActionType('credit')}
                      className={`p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                        actionType === 'credit' ? 'bg-emerald-500 text-white shadow' : 'bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      <Plus className="h-3 w-3" /> Credit
                    </button>
                    <button
                      onClick={() => setActionType('debit')}
                      className={`p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                        actionType === 'debit' ? 'bg-rose-500 text-white shadow' : 'bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      <Minus className="h-3 w-3" /> Debit
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Amount (Points)</Label>
                    <Input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 10" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Reason (optional)</Label>
                    <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Bundle purchase confirmed" />
                  </div>

                  <Button
                    className="w-full font-bold"
                    onClick={handleProcessAction}
                    disabled={isProcessing || !amount || Number(amount) <= 0}
                  >
                    {isProcessing ? 'Processing...' : `${actionType === 'credit' ? 'Credit' : 'Debit'} ${amount || '0'} Points`}
                  </Button>

                  {actionResult && (
                    <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium ${
                      actionResult.type === 'success' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                    }`}>
                      {actionResult.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      {actionResult.message}
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
                {selectedMember ? `${selectedMember.name}'s History` : 'Member History'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedMember ? (
                <p className="text-xs text-muted-foreground text-center py-8 italic">Search and select a member to view their history.</p>
              ) : memberTxns.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8 italic">No transactions yet for this member.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {memberTxns.map(txn => (
                    <div key={txn.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border text-xs">
                      <div className="flex items-center gap-2">
                        {txn.type === 'credit'
                          ? <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500" />
                          : <ArrowDownCircle className="h-3.5 w-3.5 text-rose-500" />
                        }
                        <div>
                          <p className="font-bold">{txn.description}</p>
                          <p className="text-[9px] text-muted-foreground font-mono">
                            {(() => { try { return format(parseISO(txn.createdAt), 'dd MMM, h:mm a'); } catch { return ''; } })()}
                            {txn.createdBy ? ` · by ${txn.createdBy}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className={`font-extrabold font-mono ${txn.type === 'credit' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {txn.type === 'credit' ? '+' : '-'}{txn.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Bundles Tab ─── */}
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
                <Input value={bundleForm.name} onChange={e => setBundleForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Starter" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Points Amount *</Label>
                  <Input type="number" min={1} value={bundleForm.pointsAmount || ''} onChange={e => setBundleForm(f => ({ ...f, pointsAmount: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Price (EGP) *</Label>
                  <Input type="number" min={0} value={bundleForm.priceEGP || ''} onChange={e => setBundleForm(f => ({ ...f, priceEGP: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Bonus Points</Label>
                  <Input type="number" min={0} value={bundleForm.bonusPoints || ''} onChange={e => setBundleForm(f => ({ ...f, bonusPoints: Number(e.target.value) }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Sort Order</Label>
                  <Input type="number" min={1} value={bundleForm.sortOrder || ''} onChange={e => setBundleForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSaveBundle} disabled={isSavingBundle || !bundleForm.name.trim()}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSavingBundle ? 'Saving...' : editingBundleId ? 'Update' : 'Create'}
                </Button>
                {editingBundleId && (
                  <Button variant="outline" onClick={() => { setEditingBundleId(null); setBundleForm({ name: '', pointsAmount: 0, priceEGP: 0, bonusPoints: 0, active: true, sortOrder: bundles.length + 1 }); }}>
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
                bundles.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold">{b.name}</p>
                        {!b.active && <Badge variant="outline" className="text-[8px]">Inactive</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {b.pointsAmount} pts · {b.priceEGP.toLocaleString()} EGP
                        {b.bonusPoints > 0 ? ` · +${b.bonusPoints} bonus` : ''}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                      setEditingBundleId(b.id || null);
                      setBundleForm(b);
                    }}>
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Ledger Tab ─── */}
      {activeTab === 'ledger' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Gym-Wide Points Ledger
            </CardTitle>
            <CardDescription className="text-[11px]">
              All points transactions across all members. Search a member above to filter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground text-center py-8 italic">
              Use the "Credit / Debit" tab to search for a specific member and view their transaction history.
              <br />Gym-wide reporting will be available in the next update.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
