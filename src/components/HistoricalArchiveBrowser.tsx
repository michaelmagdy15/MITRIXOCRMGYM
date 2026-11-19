import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Archive, Loader2, Search, X } from 'lucide-react';
import { auth } from '../firebase';

type ArchiveDatasetType = 'leads' | 'invitations' | 'callCenterLog' | 'attendance';

interface ArchiveMetaPayload {
  version: number;
  tenantId: string;
  generatedAt: string;
  totalRecords: number;
  counts: {
    attendanceHistory: number;
    attendance: number;
    leads: number;
    invitations: number;
    callCenterLog: number;
  };
}

const ARCHIVE_TABS: Array<{ id: ArchiveDatasetType; label: string }> = [
  { id: 'leads', label: 'Leads' },
  { id: 'invitations', label: 'Invitations' },
  { id: 'callCenterLog', label: 'Call Center' },
  { id: 'attendance', label: 'Attendance' },
];

export default function HistoricalArchiveBrowser() {
  const [available, setAvailable] = useState<boolean>(false);
  const [meta, setMeta] = useState<ArchiveMetaPayload | null>(null);
  const [activeType, setActiveType] = useState<ArchiveDatasetType>('leads');
  const [queryText, setQueryText] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (!token || !active) return;
        const res = await fetch('/api/archive/meta', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setAvailable(Boolean(data?.available));
        setMeta(data?.meta || null);
      } catch {
        // Leave hidden cleanly if archive metadata is unavailable
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(queryText.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryText]);

  const runSearch = useCallback(async () => {
    if (!available) return;
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (!token) return;
      const params = new URLSearchParams({
        type: activeType,
        q: debouncedQuery,
        limit: '40',
      });
      const res = await fetch(`/api/archive/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setTotalCount(Number(data?.total || 0));
      setMatchedCount(Number(data?.matched || 0));
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      // Ignore transient search error
    } finally {
      setLoading(false);
    }
  }, [available, activeType, debouncedQuery]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  if (!available || !meta) {
    return null;
  }

  return (
    <Card className="md:col-span-2 border-amber-500/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-amber-500" />
            <div>
              <CardTitle className="text-base">Legacy Historical Archive (Zero Firestore Reads)</CardTitle>
              <CardDescription>
                {meta.totalRecords.toLocaleString()} read-only historical records served instantly from Cloudflare KV without consuming Spark daily quota.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-600 dark:text-amber-300">
            {meta.counts.attendanceHistory.toLocaleString()} Att. History · {meta.counts.leads.toLocaleString()} Leads · {meta.counts.invitations.toLocaleString()} Invites · {meta.counts.callCenterLog.toLocaleString()} Calls
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="grid grid-cols-2 sm:flex gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/60">
            {ARCHIVE_TABS.map((tab) => {
              const isActive = activeType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveType(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-background text-foreground shadow-sm border border-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={`Search archived ${activeType}...`}
              className="pl-8 pr-8 h-9 text-xs bg-muted/30"
            />
            {queryText && (
              <button
                type="button"
                data-compact="true"
                onClick={() => setQueryText('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
          <span>
            Showing {items.length} of {matchedCount.toLocaleString()} matches ({totalCount.toLocaleString()} total in archive)
          </span>
          {loading && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching KV...
            </span>
          )}
        </div>

        <div className="max-h-[340px] overflow-y-auto rounded-xl border border-border/80 divide-y divide-border/60 bg-background/60">
          {items.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              {loading ? 'Loading archived records...' : 'No archived records match that query.'}
            </p>
          ) : (
            items.map((item, idx) => (
              <div
                key={`${activeType}-${item.id || idx}`}
                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground truncate">
                      {item.name || item.guestName || item.memberName || item.clientId || 'Record'}
                    </span>
                    {(item.phone || item.memberPhone) && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        · {item.phone || item.memberPhone}
                      </span>
                    )}
                    {item.branch && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {item.branch}
                      </Badge>
                    )}
                    {(item.status || item.callType || item.packageName) && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {item.packageName || item.callType || item.status}
                      </Badge>
                    )}
                  </div>
                  {(item.comment || item.category || item.packageData || item.source) && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {item.comment || [item.category, item.packageData, item.source].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground shrink-0 sm:text-right">
                  <div>{String(item.createdAt || item.date || '').slice(0, 16).replace('T', ' ') || '—'}</div>
                  {(item.salesName || item.createdByName || item.staffName) && (
                    <div className="text-[10px] text-muted-foreground/80">
                      {item.salesName || item.createdByName || item.staffName}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
