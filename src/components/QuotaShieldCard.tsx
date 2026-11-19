import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, CloudUpload, RefreshCw, RotateCcw, Database } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../firebase';

interface QuotaStatusPayload {
  tenantId: string;
  pacificDate: string;
  reads: number;
  writes: number;
  readLimit: number;
  writeLimit: number;
  readPercent: number;
  writePercent: number;
  state: 'normal' | 'conserve' | 'shield_active';
  shieldActive: boolean;
  exhaustedLatch: boolean;
  reason?: string;
  nextResetIso: string;
  updatedAt: string;
}

interface BackupMetaPayload {
  tenantId: string;
  lastBackupAt: string;
  mode: 'incremental' | 'bootstrap';
  readsUsed: number;
  gzipBytes: number;
  rawBytes: number;
  dailyKey: string;
  counts: {
    clients?: number;
    payments?: number;
    attendance?: number;
    packages?: number;
    classSchedules?: number;
    users?: number;
  };
}

function formatResetCountdown(nextResetIso?: string): string {
  if (!nextResetIso) return '—';
  const targetMs = Date.parse(nextResetIso);
  if (Number.isNaN(targetMs)) return '—';
  const diffMs = Math.max(0, targetMs - Date.now());
  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  const localTime = new Date(targetMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${localTime} (in ${hours}h ${mins}m)`;
}

export default function QuotaShieldCard() {
  const [loading, setLoading] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [resettingProbe, setResettingProbe] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<QuotaStatusPayload | null>(null);
  const [backupMeta, setBackupMeta] = useState<BackupMetaPayload | null>(null);
  const [cloudConfigured, setCloudConfigured] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/quota/status');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setStatus(data.status || null);
      setBackupMeta(data.backupMeta || null);
      setCloudConfigured(Boolean(data.cloudBackupConfigured));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load quota shield status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleRunBackup = async () => {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      toast.error('Please sign in again to run a cloud backup.');
      return;
    }
    setRunningBackup(true);
    try {
      const res = await fetch('/api/admin/backup-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok && !data?.quotaExceeded) {
        throw new Error(data?.error || `Backup failed (${res.status})`);
      }
      if (data?.ok) {
        toast.success(`Cloud backup complete (${data.readsUsed || 0} reads).`);
      } else {
        toast.warning(`Cloud backup skipped: ${data?.reason || 'Quota shield active'}`);
      }
      await loadStatus();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to run cloud backup.');
    } finally {
      setRunningBackup(false);
    }
  };

  const handleResetProbe = async () => {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      toast.error('Please sign in again to reset the shield probe.');
      return;
    }
    setResettingProbe(true);
    try {
      const res = await fetch('/api/admin/quota-reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Reset failed (${res.status})`);
      }
      setStatus(data.status || null);
      toast.success('Quota Shield probe reset to Normal.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset quota shield probe.');
    } finally {
      setResettingProbe(false);
    }
  };

  const stateBadge =
    status?.state === 'shield_active'
      ? { label: 'SHIELD ACTIVE', cls: 'bg-rose-600 text-white border-rose-600' }
      : status?.state === 'conserve'
      ? { label: 'CONSERVE MODE', cls: 'bg-amber-500 text-black border-amber-500' }
      : { label: 'NORMAL', cls: 'bg-emerald-600 text-white border-emerald-600' };

  return (
    <Card className="md:col-span-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Spark Quota Shield & Nightly Cloud Backup</CardTitle>
              <CardDescription>
                Automatic daily read/write protection + Cloudflare KV incremental cloud snapshots (0 Firestore reads to inspect).
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-[10px] font-bold uppercase ${stateBadge.cls}`}>
              {stateBadge.label}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => loadStatus()}
              disabled={loading}
              className="h-7 px-2"
              title="Refresh status"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMsg && (
          <p className="text-xs text-rose-500 font-medium">{errorMsg}</p>
        )}

        {status && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Server Metered Reads Today</span>
                <span className="font-mono font-bold">
                  {status.reads.toLocaleString()} / {status.readLimit.toLocaleString()} ({status.readPercent}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    status.readPercent >= 90
                      ? 'bg-rose-500'
                      : status.readPercent >= 70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, status.readPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-muted-foreground font-medium">Server Metered Writes Today</span>
                <span className="font-mono font-bold">
                  {status.writes.toLocaleString()} / {status.writeLimit.toLocaleString()} ({status.writePercent}%)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">
                Next Pacific Midnight reset: <strong className="text-foreground">{formatResetCountdown(status.nextResetIso)}</strong>
              </p>
            </div>

            <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  Cloudflare KV Nightly Backup
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {cloudConfigured ? 'Connected' : 'Not Configured'}
                </Badge>
              </div>
              {backupMeta ? (
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p>
                    Last backup: <strong className="text-foreground">{new Date(backupMeta.lastBackupAt).toLocaleString()}</strong> ({backupMeta.mode})
                  </p>
                  <p className="font-mono">
                    Clients: {backupMeta.counts?.clients ?? 0} · Payments: {backupMeta.counts?.payments ?? 0} · Attendance: {backupMeta.counts?.attendance ?? 0} · Packages: {backupMeta.counts?.packages ?? 0}
                  </p>
                  <p>
                    Compressed size: <strong className="text-foreground">{Math.max(1, Math.round(backupMeta.gzipBytes / 1024))} KB</strong> · Reads used: {backupMeta.readsUsed}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  {cloudConfigured
                    ? 'No nightly cloud snapshot recorded yet. Runs nightly at 00:01 Cairo or click "Run Cloud Backup Now".'
                    : 'Cloudflare KV backup credentials are not set on the gateway.'}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRunBackup}
            disabled={runningBackup || !cloudConfigured}
            className="gap-1.5"
          >
            <CloudUpload className="h-3.5 w-3.5" />
            {runningBackup ? 'Backing Up...' : 'Run Cloud Backup Now'}
          </Button>
          {status?.state !== 'normal' && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleResetProbe}
              disabled={resettingProbe}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {resettingProbe ? 'Resetting...' : 'Reset Shield Probe'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
