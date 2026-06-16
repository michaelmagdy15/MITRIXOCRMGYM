import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Loader2, AlertCircle, CheckCircle2, DollarSign, Download, ShieldCheck } from 'lucide-react';
import { collection, getDocs, writeBatch, addDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, User, Payment } from '../types';
import { SALES_NAME_MAPPING } from '../constants';
import { exportDatabaseToJson } from '../services/backupService';

interface ResyncPaymentsProps {
  clients: Client[];
  users: User[];
}

interface RepairItem {
  paymentId?: string;
  clientId: string;
  clientName: string;
  action: 'fix-rep' | 'backfill';
  oldRepId?: string;
  newRepId?: string;
  newRepName?: string;
  backfillAmount?: number;
}

function canonicalize(name: string): string {
  if (!name) return '';
  const lower = name.trim().toLowerCase();
  for (const [key, value] of Object.entries(SALES_NAME_MAPPING)) {
    if (key.toLowerCase() === lower) return value.toLowerCase().trim();
  }
  return lower.trim();
}

function resolveRepUser(salesName: string, users: User[]): User | undefined {
  if (!salesName) return undefined;
  const targetCanon = canonicalize(salesName);
  if (!targetCanon) return undefined;
  return users.find(u => canonicalize(u.name || u.email || '') === targetCanon);
}

export default function ResyncPayments({ clients, users }: ResyncPaymentsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'backup' | 'idle' | 'scanning' | 'preview' | 'applying' | 'done'>('backup');
  const [progress, setProgress] = useState(0);
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [stats, setStats] = useState({ repFixed: 0, backfilled: 0, skipped: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupDone, setBackupDone] = useState(false);

  const reset = () => {
    setStep('backup');
    setProgress(0);
    setRepairs([]);
    setStats({ repFixed: 0, backfilled: 0, skipped: 0 });
    setError(null);
    setBackupDone(false);
    setIsBackingUp(false);
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    setError(null);
    try {
      await exportDatabaseToJson();
      setBackupDone(true);
    } catch (err) {
      setError('Backup failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleScan = async () => {
    setStep('scanning');
    setProgress(0);
    setError(null);

    try {
      const snapshot = await getDocs(collection(db, 'payments'));
      const allPayments = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Payment));

      const clientPaymentSum = new Map<string, number>();
      allPayments.forEach(p => {
        const prev = clientPaymentSum.get(p.clientId) ?? 0;
        clientPaymentSum.set(p.clientId, prev + (p.amount || 0));
      });

      const found: RepairItem[] = [];

      // Pass 1: fix sales_rep_id on existing payments
      allPayments.forEach((p, i) => {
        const client = clients.find(c => c.id === p.clientId);
        if (!client) return;

        const salesNameRaw = client.salesName || (client.assignedTo && client.assignedTo.length < 40 ? client.assignedTo : '');
        if (!salesNameRaw) return;

        const repUser = resolveRepUser(salesNameRaw, users);
        if (!repUser) return;

        if (p.sales_rep_id !== repUser.id) {
          const canonicalName = canonicalize(repUser.name || repUser.email || '');
          found.push({
            paymentId: p.id,
            clientId: client.id,
            clientName: client.name,
            action: 'fix-rep',
            oldRepId: p.sales_rep_id || '(none)',
            newRepId: repUser.id,
            newRepName: canonicalName || repUser.name || repUser.email,
          });
        }

        setProgress(Math.round(((i + 1) / allPayments.length) * 60));
      });

      // Pass 2: backfill missing payment records
      clients.forEach((client, i) => {
        const totalPaid = (client as any).totalPaid ?? 0;
        if (totalPaid <= 0) return;

        const sumInPayments = clientPaymentSum.get(client.id) ?? 0;
        const gap = totalPaid - sumInPayments;

        if (gap > 50) {
          const salesNameRaw = client.salesName || (client.assignedTo && client.assignedTo.length < 40 ? client.assignedTo : '');
          const repUser = resolveRepUser(salesNameRaw, users);
          const canonicalRepName = repUser
            ? (canonicalize(repUser.name || repUser.email || '') || repUser.name || salesNameRaw)
            : canonicalize(salesNameRaw) || salesNameRaw;

          found.push({
            clientId: client.id,
            clientName: client.name,
            action: 'backfill',
            newRepId: repUser?.id,
            newRepName: canonicalRepName,
            backfillAmount: Math.round(gap),
          });
        }

        setProgress(60 + Math.round(((i + 1) / clients.length) * 40));
      });

      setRepairs(found);
      setProgress(100);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setStep('idle');
    }
  };

  const handleApply = async () => {
    setStep('applying');
    setProgress(0);
    setError(null);

    let repFixed = 0;
    let backfilled = 0;
    let skipped = 0;

    let batch = writeBatch(db);
    let opsInBatch = 0;

    const flush = async () => {
      if (opsInBatch > 0) {
        await batch.commit();
        batch = writeBatch(db);
        opsInBatch = 0;
      }
    };

    try {
      for (let i = 0; i < repairs.length; i++) {
        const item = repairs[i]!;

        if (item.action === 'fix-rep' && item.paymentId && item.newRepId) {
          batch.update(doc(db, 'payments', item.paymentId), {
            sales_rep_id: item.newRepId,
            salesName: item.newRepName || '',
          });
          opsInBatch++;
          repFixed++;
        } else if (item.action === 'backfill' && item.backfillAmount) {
          const client = clients.find(c => c.id === item.clientId);
          if (!client) { skipped++; continue; }

          await flush();
          await addDoc(collection(db, 'payments'), {
            clientId: item.clientId,
            client_name: client.name,
            amount: item.backfillAmount,
            amount_paid: item.backfillAmount,
            date: (client as any).startDate || new Date().toISOString(),
            method: 'Cash',
            packageType: (client as any).packageType || 'Historical',
            package_category_type: ((client as any).packageType || '').toLowerCase().includes('pt') ? 'Private Training' : 'Group Training',
            branch: client.branch || '',
            sales_rep_id: item.newRepId || '',
            salesName: item.newRepName || '',
            notes: 'Historical payment — backfilled from member record',
            importBatchId: (client as any).importBatchId || 'backfill-resync',
            created_at: new Date().toISOString(),
            deleted_at: null,
          });
          backfilled++;
        } else {
          skipped++;
        }

        if (opsInBatch >= 450) await flush();
        setProgress(Math.round(((i + 1) / repairs.length) * 100));
      }

      await flush();
      setStats({ repFixed, backfilled, skipped });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
      setStep('preview');
    }
  };

  const fixRepCount = repairs.filter(r => r.action === 'fix-rep').length;
  const backfillCount = repairs.filter(r => r.action === 'backfill').length;

  return (
    <Dialog open={isOpen} onOpenChange={v => { if (!v) reset(); setIsOpen(v); }}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <DollarSign className="mr-2 h-4 w-4" />
        Resync Payments
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resync All Payment Records</DialogTitle>
        </DialogHeader>

        {/* STEP 1: Backup */}
        {step === 'backup' && (
          <div className="space-y-5 py-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <ShieldCheck className="h-6 w-6 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-900">Step 1: Download a Backup First</p>
                <p className="text-sm text-blue-700 mt-1">
                  Before making any changes, download a full backup of your database. If anything looks wrong after the resync, you can restore from this file.
                </p>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" /><p>{error}</p>
              </div>
            )}

            <Button
              className="w-full"
              variant="outline"
              onClick={handleBackup}
              disabled={isBackingUp}
            >
              {isBackingUp
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exporting…</>
                : <><Download className="mr-2 h-4 w-4" />Download Full Backup (.json)</>
              }
            </Button>

            {backupDone && (
              <div className="flex items-center gap-2 text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 p-3 rounded-md">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <p>Backup downloaded! Keep that file safe. You can now proceed.</p>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm text-muted-foreground font-medium">What this tool does:</p>
              <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
                <li><strong className="text-foreground">Fix attribution</strong> — Stamps every payment with the correct sales rep ID (instead of Michael's importer ID)</li>
                <li><strong className="text-foreground">Backfill history</strong> — Creates payment records for pre-CRM amounts stored only in client records</li>
                <li>No data is deleted. Only <code>sales_rep_id</code> field is updated on existing payments.</li>
              </ul>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => { reset(); setIsOpen(false); }} className="flex-1">
                Cancel
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setStep('idle')}
                disabled={!backupDone}
              >
                {backupDone ? 'Continue to Scan →' : 'Download Backup First'}
              </Button>
            </div>
            <div className="text-center pt-1">
              <button
                onClick={() => setStep('idle')}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Skip backup — I already have one / I understand the risk
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Scan */}
        {step === 'idle' && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 p-3 rounded-md">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <p>Backup saved. Ready to scan.</p>
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleScan}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Scan & Preview Changes
            </Button>
          </div>
        )}

        {step === 'scanning' && (
          <div className="py-10 flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="font-medium text-lg">Scanning all records…</p>
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground">{progress}% complete</p>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 py-4">
            <div className="flex gap-3 flex-wrap">
              <Badge className="bg-blue-600 text-white">{fixRepCount} rep fixes</Badge>
              <Badge className="bg-emerald-600 text-white">{backfillCount} backfills</Badge>
              <Badge variant="secondary">{repairs.length} total ops</Badge>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" /><p>{error}</p>
              </div>
            )}

            <ScrollArea className="h-[320px] border rounded-md">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Member</th>
                    <th className="px-3 py-2 text-left font-semibold">Action</th>
                    <th className="px-3 py-2 text-left font-semibold">Rep → New Rep</th>
                    <th className="px-3 py-2 text-left font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.map((r, i) => (
                    <tr key={i} className={`border-t ${r.action === 'backfill' ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'bg-blue-50/40 dark:bg-blue-900/10'}`}>
                      <td className="px-3 py-2 font-medium max-w-[140px] truncate">{r.clientName}</td>
                      <td className="px-3 py-2">
                        {r.action === 'fix-rep'
                          ? <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-700">Fix Rep</Badge>
                          : <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-700">Backfill</Badge>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.action === 'fix-rep'
                          ? <span>{(r.oldRepId || '').substring(0, 8)}… → <strong>{r.newRepName}</strong></span>
                          : <span className="font-medium text-foreground">{r.newRepName}</span>}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {r.action === 'backfill' ? `${r.backfillAmount?.toLocaleString()} LE` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={reset} className="flex-1">Cancel</Button>
              <Button
                onClick={handleApply}
                disabled={repairs.length === 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Apply {repairs.length} Change{repairs.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        )}

        {step === 'applying' && (
          <div className="py-10 flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="font-medium text-lg">Applying fixes…</p>
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground">{progress}% complete</p>
          </div>
        )}

        {step === 'done' && (
          <div className="py-8 flex flex-col items-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="font-bold text-xl">Resync Complete</p>
            <div className="flex gap-4 text-sm flex-wrap justify-center">
              <div className="text-center p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200">
                <div className="text-3xl font-black text-blue-600">{stats.repFixed}</div>
                <div className="text-xs text-muted-foreground mt-1">Rep IDs Fixed</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200">
                <div className="text-3xl font-black text-emerald-600">{stats.backfilled}</div>
                <div className="text-xs text-muted-foreground mt-1">Payments Backfilled</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-muted border">
                <div className="text-3xl font-black">{stats.skipped}</div>
                <div className="text-xs text-muted-foreground mt-1">Skipped</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              All payments now have correct sales attribution. Dashboard and Payments tab will reflect accurate numbers immediately.
            </p>
            <Button onClick={reset} className="mt-2">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
