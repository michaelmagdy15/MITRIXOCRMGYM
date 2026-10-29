import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CorporateCompany } from '../types';
import { Building2, Plus, Trash2, Edit2, Check, X, Percent, Calendar, Snowflake, Dumbbell, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const DEFAULT_CIB_COMPANY: CorporateCompany = {
  id: 'corp-cib',
  name: 'CIB (Commercial International Bank)',
  code: 'CIB',
  active: true,
  discountType: 'percentage',
  discountValue: 20,
  extraMonths: 1,
  extraDays: 0,
  extraFreezeDays: 15,
  extraFreePtSessions: 2,
  extraInvitations: 2,
  notes: 'CIB Corporate Partnership — 20% off standard membership rate + 1 extra free month + 15 extra freeze days + 2 complimentary PT sessions.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export function useCorporateCompanies() {
  const [companies, setCompanies] = useState<CorporateCompany[]>([DEFAULT_CIB_COMPANY]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'corporateCompanies'),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as CorporateCompany));
        if (list.length === 0) {
          setCompanies([DEFAULT_CIB_COMPANY]);
        } else {
          const hasCib = list.some((c) => c.code?.toUpperCase() === 'CIB' || c.id === 'corp-cib');
          setCompanies(hasCib ? list : [DEFAULT_CIB_COMPANY, ...list]);
        }
        setLoading(false);
      },
      () => {
        setCompanies([DEFAULT_CIB_COMPANY]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { companies, loading };
}

interface CorporateDealsManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: CorporateCompany[];
  canManage?: boolean;
}

export const CorporateDealsManagerModal: React.FC<CorporateDealsManagerModalProps> = ({
  open,
  onOpenChange,
  companies,
  canManage = true,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'amount'>('percentage');
  const [discountValue, setDiscountValue] = useState('20');
  const [extraMonths, setExtraMonths] = useState('0');
  const [extraDays, setExtraDays] = useState('0');
  const [extraFreezeDays, setExtraFreezeDays] = useState('0');
  const [extraFreePtSessions, setExtraFreePtSessions] = useState('0');
  const [extraInvitations, setExtraInvitations] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setDiscountType('percentage');
    setDiscountValue('20');
    setExtraMonths('0');
    setExtraDays('0');
    setExtraFreezeDays('0');
    setExtraFreePtSessions('0');
    setExtraInvitations('0');
    setNotes('');
  };

  const handleEdit = (comp: CorporateCompany) => {
    setEditingId(comp.id);
    setName(comp.name);
    setCode(comp.code);
    setDiscountType(comp.discountType || 'percentage');
    setDiscountValue(String(comp.discountValue ?? 0));
    setExtraMonths(String(comp.extraMonths ?? 0));
    setExtraDays(String(comp.extraDays ?? 0));
    setExtraFreezeDays(String(comp.extraFreezeDays ?? 0));
    setExtraFreePtSessions(String(comp.extraFreePtSessions ?? 0));
    setExtraInvitations(String(comp.extraInvitations ?? 0));
    setNotes(comp.notes || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      alert('Please enter both Company Name and Short Code (e.g. CIB).');
      return;
    }
    setSaving(true);
    try {
      const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '_');
      const id = editingId || `corp-${cleanCode.toLowerCase()}-${Date.now().toString(36)}`;
      const payload: CorporateCompany = {
        id,
        name: name.trim(),
        code: cleanCode,
        active: true,
        discountType,
        discountValue: Math.max(0, Number(discountValue) || 0),
        extraMonths: Math.max(0, parseInt(extraMonths, 10) || 0),
        extraDays: Math.max(0, parseInt(extraDays, 10) || 0),
        extraFreezeDays: Math.max(0, parseInt(extraFreezeDays, 10) || 0),
        extraFreePtSessions: Math.max(0, parseInt(extraFreePtSessions, 10) || 0),
        extraInvitations: Math.max(0, parseInt(extraInvitations, 10) || 0),
        notes: notes.trim(),
        createdAt: editingId
          ? companies.find((c) => c.id === editingId)?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'corporateCompanies', id), payload, { merge: true });
      resetForm();
    } catch (err) {
      console.error('Failed to save corporate company:', err);
      alert('Failed to save corporate company deal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (comp: CorporateCompany) => {
    if (!window.confirm(`Delete corporate deal "${comp.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'corporateCompanies', comp.id));
    } catch (err) {
      console.error('Failed to delete corporate company:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Building2 className="w-5 h-5 text-indigo-500" />
            Corporate Accounts & Dynamic Partnership Deals (e.g. CIB)
          </DialogTitle>
          <DialogDescription>
            Configure corporate companies and their automatic benefits. When a sales rep selects a corporate company on a member or package, the system automatically calculates the discounted rate and adds complimentary months, freeze days, and PT sessions.
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                {editingId ? 'Edit Corporate Deal' : 'Add New Corporate Company Deal'}
              </span>
              {editingId && (
                <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="h-7 text-xs">
                  <X className="w-3.5 h-3.5 mr-1" /> Cancel Edit
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-semibold">Company Name *</Label>
                <Input
                  placeholder="e.g. CIB (Commercial International Bank), Vodafone, Orange..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 rounded-xl bg-background"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Short Code / Tag *</Label>
                <Input
                  placeholder="e.g. CIB"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="h-9 rounded-xl bg-background font-mono uppercase"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Discount Type</Label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'amount')}
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 text-xs font-semibold"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="amount">Fixed Discount (LE)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">
                  {discountType === 'percentage' ? 'Discount %' : 'Discount Amount (LE)'}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={discountType === 'percentage' ? 100 : 100000}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="h-9 rounded-xl bg-background font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Extra Free Months</Label>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={extraMonths}
                  onChange={(e) => setExtraMonths(e.target.value)}
                  className="h-9 rounded-xl bg-background font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Extra Free Days</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={extraDays}
                  onChange={(e) => setExtraDays(e.target.value)}
                  className="h-9 rounded-xl bg-background font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Extra Freeze Days</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={extraFreezeDays}
                  onChange={(e) => setExtraFreezeDays(e.target.value)}
                  className="h-9 rounded-xl bg-background font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Extra Free PT Sessions</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={extraFreePtSessions}
                  onChange={(e) => setExtraFreePtSessions(e.target.value)}
                  className="h-9 rounded-xl bg-background font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Extra Guest Invitations</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={extraInvitations}
                  onChange={(e) => setExtraInvitations(e.target.value)}
                  className="h-9 rounded-xl bg-background font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Corporate Deal Terms / Notes</Label>
              <Input
                placeholder="Optional terms (e.g. Requires valid employee badge or corporate email)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 rounded-xl bg-background text-xs"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
                {editingId ? (
                  <>
                    <Check className="w-4 h-4 mr-1.5" /> Update Corporate Deal
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1.5" /> Save Corporate Deal
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-2.5 pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Active Corporate Accounts ({companies.length})
          </div>
          <div className="space-y-2">
            {companies.map((comp) => (
              <div
                key={comp.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{comp.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px] border-indigo-500/40 text-indigo-400 bg-indigo-500/10">
                      {comp.code}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {comp.discountValue > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
                        <Percent className="w-3 h-3" />
                        {comp.discountType === 'percentage' ? `${comp.discountValue}% OFF` : `${comp.discountValue} LE OFF`}
                      </span>
                    )}
                    {(comp.extraMonths > 0 || comp.extraDays > 0) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 font-semibold border border-blue-500/30">
                        <Calendar className="w-3 h-3" />
                        +{comp.extraMonths > 0 ? `${comp.extraMonths} Mo ` : ''}
                        {comp.extraDays > 0 ? `${comp.extraDays} Days` : ''} Free
                      </span>
                    )}
                    {comp.extraFreezeDays > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 font-semibold border border-cyan-500/30">
                        <Snowflake className="w-3 h-3" />
                        +{comp.extraFreezeDays} Freeze Days
                      </span>
                    )}
                    {comp.extraFreePtSessions > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30">
                        <Dumbbell className="w-3 h-3" />
                        +{comp.extraFreePtSessions} Free PT
                      </span>
                    )}
                    {comp.extraInvitations > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 font-semibold border border-purple-500/30">
                        <Users className="w-3 h-3" />
                        +{comp.extraInvitations} Invites
                      </span>
                    )}
                  </div>
                  {comp.notes && <p className="text-[11px] text-muted-foreground">{comp.notes}</p>}
                </div>

                {canManage && (
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(comp)} className="h-8 rounded-lg text-xs">
                      <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    {comp.id !== 'corp-cib' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(comp)}
                        className="h-8 rounded-lg text-xs text-rose-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
