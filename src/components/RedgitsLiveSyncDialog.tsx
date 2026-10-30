import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, CheckCircle2, AlertCircle, Database, Users, Package, CreditCard, UserPlus, Shield, Clock, X, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { auth } from '../firebase';

interface SyncCounts {
  activeMembers: number;
  expiredMembers: number;
  leads: number;
  packages: number;
  payments: number;
  staff: number;
  invitations: number;
  checkIns?: number;
  unmaskedPhonesFetched: number;
}

interface SyncStatusRecord {
  lastSyncAt?: string;
  lastSyncBy?: string;
  mode?: 'fast' | 'full';
  durationMs?: number;
  counts?: SyncCounts;
  status?: string;
}

interface RedgitsLiveSyncDialogProps {
  variant?: 'header' | 'button' | 'admin-card';
  onSyncComplete?: (counts: SyncCounts) => void;
}

async function clearInzanExpiredClientsIdbCache(): Promise<void> {
  try {
    localStorage.removeItem('inzan_expired_clients_v1_meta');
    localStorage.removeItem('inzan_expired_sync_ts');
    localStorage.removeItem('inzan_expired_sync_ts_v2');
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('inzan_crm_cache', 1);
      req.onsuccess = () => {
        try {
          const db = req.result;
          if (db.objectStoreNames.contains('cache')) {
            const tx = db.transaction('cache', 'readwrite');
            tx.objectStore('cache').delete('expired_clients');
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              resolve();
            };
          } else {
            db.close();
            resolve();
          }
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch {
    // Ignore IndexedDB cleanup errors
  }
}

export const RedgitsLiveSyncDialog: React.FC<RedgitsLiveSyncDialogProps> = ({
  variant = 'button',
  onSyncComplete,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'fast' | 'full'>('fast');
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusRecord, setStatusRecord] = useState<SyncStatusRecord | null>(null);
  const [lastResult, setLastResult] = useState<{
    counts: SyncCounts;
    durationMs: number;
    syncedAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const fetchStatus = async () => {
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/inzan/redgits-sync/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const st = data?.ok ? data.status : null;
        if (st) {
          setStatusRecord({
            ...st,
            lastSyncAt: st.lastSyncAt || st.completedAt || st.syncedAt,
            lastSyncBy: st.lastSyncBy || st.syncedBy,
          });
        }
      } else {
        console.warn(`[RedGITS Sync] Status check returned HTTP ${res.status}`);
      }
    } catch (statusErr) {
      // Background status check only — the sync button itself still reports errors.
      console.warn('[RedGITS Sync] Status check failed:', statusErr);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const handleRunSync = async (selectedMode: 'fast' | 'full' = mode) => {
    setIsSyncing(true);
    setError(null);
    setLastResult(null);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        throw new Error('You must be signed in to run RedGITS Live Sync.');
      }

      const bodyPayload: Record<string, string> = { mode: selectedMode };
      if (username.trim() && password.trim()) {
        bodyPayload.username = username.trim();
        bodyPayload.password = password.trim();
      }

      // Abort just under the Cloud Run request timeout (300s) so the user always gets a clear message.
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 290_000);
      let res: Response;
      try {
        res = await fetch('/api/inzan/redgits-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(bodyPayload),
          signal: controller.signal,
        });
      } catch (netErr: any) {
        if (netErr?.name === 'AbortError') {
          throw new Error('RedGITS sync is taking longer than expected. It may still finish in the background — reopen this dialog in a minute to check the last sync time.');
        }
        throw new Error('Could not reach the CRM server. Check your internet connection and try again.');
      } finally {
        clearTimeout(abortTimer);
      }

      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }
      if (!res.ok || !data?.ok) {
        if (res.status === 401) {
          throw new Error('Your staff session has expired. Please sign out and sign back in, then retry the sync.');
        }
        if (data?.error) throw new Error(data.error);
        if (res.status === 401 || res.status === 403) {
          throw new Error('Your session does not have permission to run RedGITS sync. Sign out and back in, or ask an Inzan admin.');
        }
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          throw new Error(`The server timed out talking to RedGITS (HTTP ${res.status}). Please try again in a minute.`);
        }
        throw new Error(`Sync failed with HTTP ${res.status}`);
      }

      // Always drop cached expired members so refreshed phones / Member IDs show immediately.
      await clearInzanExpiredClientsIdbCache();

      const syncedAt: string = data.syncedAt || data.completedAt || new Date().toISOString();
      const counts: SyncCounts = {
        activeMembers: 0,
        expiredMembers: 0,
        leads: 0,
        packages: 0,
        payments: 0,
        staff: 0,
        invitations: 0,
        checkIns: 0,
        unmaskedPhonesFetched: 0,
        ...(data.counts || {}),
      };

      setLastResult({
        counts,
        durationMs: Number(data.durationMs) || 0,
        syncedAt,
      });

      setStatusRecord({
        lastSyncAt: syncedAt,
        lastSyncBy: data.lastSyncBy || data.syncedBy,
        mode: selectedMode,
        durationMs: data.durationMs,
        counts,
        status: 'completed',
      });

      if (onSyncComplete) {
        onSyncComplete(counts);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sync with RedGITS');
    } finally {
      setIsSyncing(false);
    }
  };

  const renderTrigger = () => {
    if (variant === 'header') {
      return (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Sync live members, leads, packages & payments directly from inzan.redgits.com"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>Sync RedGITS</span>
        </button>
      );
    }

    if (variant === 'admin-card') {
      return (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-all shadow-md"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>Sync Live from RedGITS Now</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all"
      >
        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        <span>Sync RedGITS Live</span>
      </button>
    );
  };

  return (
    <>
      {renderTrigger()}

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSyncing) {
              setIsOpen(false);
            }
          }}
        >
          <div className="w-full max-w-lg my-auto rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden text-zinc-100">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    RedGITS v17.12 Live Sync
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      db-inzanathletics
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Pulls real-time data from <code className="text-zinc-300">inzan.redgits.com</code> directly into Inzan Athletics CRM
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSyncing && setIsOpen(false)}
                disabled={isSyncing}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Last Sync Status Banner */}
              {statusRecord?.lastSyncAt && (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60 text-xs">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Last synced:{' '}
                      <strong className="text-white">
                        {new Date(statusRecord.lastSyncAt).toLocaleString()}
                      </strong>
                    </span>
                  </div>
                  {statusRecord.counts && (
                    <span className="text-[11px] text-zinc-400">
                      {statusRecord.counts.activeMembers} active · {statusRecord.counts.packages} pkgs
                    </span>
                  )}
                </div>
              )}

              {/* Sync Mode Selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => setMode('fast')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    mode === 'fast'
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      Fast Live Sync
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      ~10 sec
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Active Members, Walk-in &amp; Social Leads, All Packages, Subscriptions/Payments, Invitations &amp; Staff.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => setMode('full')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    mode === 'full'
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm'
                      : 'bg-zinc-800/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-blue-400" />
                      Full Archive Sync
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      ~25 sec
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Everything in Fast Sync <strong>plus all 4,900+ Expired Members</strong> &amp; clears local browser cache.
                  </p>
                </button>
              </div>

              {/* Optional Custom RedGITS Credentials */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowCredentials((v) => !v)}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <span>RedGITS Credentials (Uses configured admin account by default)</span>
                  {showCredentials ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showCredentials && (
                  <div className="p-3.5 pt-1 grid grid-cols-2 gap-2.5 border-t border-zinc-800/80">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                        RedGITS Username
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Default (mi5a / trasnfer)"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                        RedGITS Password
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Error Alert */}
              {error && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">RedGITS Sync Error</p>
                    <p className="text-red-300/90 mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              {/* Sync Progress State */}
              {isSyncing && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-emerald-300">
                      Connecting to inzan.redgits.com &amp; syncing to db-inzanathletics...
                    </p>
                    <p className="text-zinc-400 mt-0.5">
                      Fetching active members, unmasked phone numbers, packages, subscriptions, leads &amp; staff.
                    </p>
                  </div>
                </div>
              )}

              {/* Sync Results Breakdown */}
              {lastResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Live RedGITS Sync Complete!</span>
                    </div>
                    <span className="text-[11px] text-emerald-300/80 font-mono">
                      {(lastResult.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="font-bold text-white">{lastResult.counts.activeMembers.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-400">Active Members</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center gap-2">
                      <Package className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="font-bold text-white">{lastResult.counts.packages.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-400">Packages</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-400 shrink-0" />
                      <div>
                        <div className="font-bold text-white">{lastResult.counts.payments.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-400">Invoices / Subs</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-purple-400 shrink-0" />
                      <div>
                        <div className="font-bold text-white">{lastResult.counts.leads.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-400">Recent Leads</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div>
                        <div className="font-bold text-white">{lastResult.counts.staff.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-400">Staff &amp; Coaches</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="font-bold text-white">
                          {(lastResult.counts.checkIns ?? 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-zinc-400">Live Check-ins</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/60">
              <span className="text-[11px] text-zinc-400">
                Safe upsert (`merge: true`) · Zero data loss
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isSyncing}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleRunSync(mode)}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing RedGITS...' : `Start ${mode === 'full' ? 'Full' : 'Live'} Sync`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
export default RedgitsLiveSyncDialog;
