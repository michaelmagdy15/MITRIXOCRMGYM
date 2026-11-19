/**
 * Per-tenant Firebase Spark free-tier read/write quota meter & automatic shield.
 * Counters automatically roll over at Pacific Midnight (00:00 America/Los_Angeles),
 * matching Google Cloud Firestore's daily quota reset schedule.
 */

export const SPARK_DAILY_READ_LIMIT = 50_000;
export const SPARK_CONSERVE_READ_THRESHOLD = 35_000;
export const SPARK_SHIELD_READ_THRESHOLD = 45_000;

export const SPARK_DAILY_WRITE_LIMIT = 20_000;
export const SPARK_CONSERVE_WRITE_THRESHOLD = 14_000;
export const SPARK_SHIELD_WRITE_THRESHOLD = 18_000;

export type QuotaState = 'normal' | 'conserve' | 'shield_active';

export interface QuotaAlertEvent {
  id: string;
  tenantId: string;
  fromState: QuotaState;
  toState: QuotaState;
  pacificDate: string;
  reads: number;
  writes: number;
  reason?: string;
  timestamp: string;
}

export type QuotaAlertListener = (alert: QuotaAlertEvent, status: QuotaStatus) => void;

export interface QuotaStatus {
  tenantId: string;
  pacificDate: string;
  reads: number;
  writes: number;
  readLimit: number;
  writeLimit: number;
  readPercent: number;
  writePercent: number;
  state: QuotaState;
  shieldActive: boolean;
  exhaustedLatch: boolean;
  reason?: string;
  nextResetIso: string;
  updatedAt: string;
}

interface TenantQuotaMeter {
  pacificDate: string;
  reads: number;
  writes: number;
  exhaustedLatch: boolean;
  lastAlertedState: QuotaState;
  alerts: QuotaAlertEvent[];
  reason?: string;
  updatedAt: string;
}

const tenantMeters = new Map<string, TenantQuotaMeter>();
const alertListeners = new Set<QuotaAlertListener>();

const PACIFIC_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const PACIFIC_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function normalizeTenantKey(tenantId: string): string {
  const clean = String(tenantId || '').trim().toLowerCase();
  return clean || 'default';
}

export function getPacificDateKey(now: Date = new Date()): string {
  return PACIFIC_DATE_FORMATTER.format(now);
}

/**
 * Computes the exact UTC ISO timestamp for the next 00:00 America/Los_Angeles boundary
 * (accounting for PST UTC-8 and PDT UTC-7 transitions accurately).
 */
export function getNextPacificMidnightIso(now: Date = new Date()): string {
  const todayPt = getPacificDateKey(now);
  const [y, m, d] = todayPt.split('-').map(Number);
  const tomorrowUtcNoon = new Date(Date.UTC(y!, m! - 1, d! + 1, 12, 0, 0));
  const tomorrowPt = getPacificDateKey(tomorrowUtcNoon);

  // Midnight in America/Los_Angeles always falls between 07:00 UTC (PDT) and 08:00 UTC (PST).
  for (let utcHour = 6; utcHour <= 9; utcHour++) {
    const candidate = new Date(Date.UTC(y!, m! - 1, d! + 1, utcHour, 0, 0));
    const parts = PACIFIC_PARTS_FORMATTER.formatToParts(candidate);
    const ptDate = `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
    const ptHour = parts.find((p) => p.type === 'hour')?.value;
    if (ptDate === tomorrowPt && (ptHour === '00' || ptHour === '24')) {
      return candidate.toISOString();
    }
  }

  return new Date(Date.UTC(y!, m! - 1, d! + 1, 8, 0, 0)).toISOString();
}

function getOrRotateMeter(tenantId: string, now: Date = new Date()): TenantQuotaMeter {
  const key = normalizeTenantKey(tenantId);
  const ptDate = getPacificDateKey(now);
  const existing = tenantMeters.get(key);
  if (existing && existing.pacificDate === ptDate) {
    return existing;
  }

  const fresh: TenantQuotaMeter = {
    pacificDate: ptDate,
    reads: 0,
    writes: 0,
    exhaustedLatch: false,
    lastAlertedState: 'normal',
    alerts: [],
    updatedAt: now.toISOString(),
  };
  tenantMeters.set(key, fresh);
  return fresh;
}

const STATE_RANK: Record<QuotaState, number> = {
  normal: 0,
  conserve: 1,
  shield_active: 2,
};

function maybeNotifyStateTransition(
  tenantId: string,
  meter: TenantQuotaMeter,
  prevState: QuotaState,
  now: Date
): QuotaStatus {
  const status = buildStatus(tenantId, meter, now);
  if (
    status.state !== 'normal' &&
    STATE_RANK[status.state] > STATE_RANK[meter.lastAlertedState]
  ) {
    const alert: QuotaAlertEvent = {
      id: `${meter.pacificDate}:${meter.lastAlertedState}->${status.state}:${meter.alerts.length + 1}`,
      tenantId: status.tenantId,
      fromState: prevState,
      toState: status.state,
      pacificDate: meter.pacificDate,
      reads: status.reads,
      writes: status.writes,
      ...(status.reason ? { reason: status.reason } : {}),
      timestamp: now.toISOString(),
    };
    meter.lastAlertedState = status.state;
    meter.alerts = [alert, ...meter.alerts].slice(0, 10);
    for (const listener of alertListeners) {
      try {
        listener(alert, status);
      } catch {
        // Alert listeners must never disrupt request paths
      }
    }
  }
  return status;
}

function computeState(meter: TenantQuotaMeter): QuotaState {
  if (
    meter.exhaustedLatch ||
    meter.reads >= SPARK_SHIELD_READ_THRESHOLD ||
    meter.writes >= SPARK_SHIELD_WRITE_THRESHOLD
  ) {
    return 'shield_active';
  }
  if (
    meter.reads >= SPARK_CONSERVE_READ_THRESHOLD ||
    meter.writes >= SPARK_CONSERVE_WRITE_THRESHOLD
  ) {
    return 'conserve';
  }
  return 'normal';
}

function buildStatus(tenantId: string, meter: TenantQuotaMeter, now: Date = new Date()): QuotaStatus {
  const state = computeState(meter);
  return {
    tenantId: normalizeTenantKey(tenantId),
    pacificDate: meter.pacificDate,
    reads: meter.reads,
    writes: meter.writes,
    readLimit: SPARK_DAILY_READ_LIMIT,
    writeLimit: SPARK_DAILY_WRITE_LIMIT,
    readPercent: Math.min(100, Math.round((meter.reads / SPARK_DAILY_READ_LIMIT) * 1000) / 10),
    writePercent: Math.min(100, Math.round((meter.writes / SPARK_DAILY_WRITE_LIMIT) * 1000) / 10),
    state,
    shieldActive: state === 'shield_active',
    exhaustedLatch: meter.exhaustedLatch,
    ...(meter.reason ? { reason: meter.reason } : {}),
    nextResetIso: getNextPacificMidnightIso(now),
    updatedAt: meter.updatedAt,
  };
}

export function onQuotaStateTransition(listener: QuotaAlertListener): () => void {
  alertListeners.add(listener);
  return () => {
    alertListeners.delete(listener);
  };
}

export function getQuotaAlertHistory(tenantId: string, now: Date = new Date()): QuotaAlertEvent[] {
  const meter = getOrRotateMeter(tenantId, now);
  return [...meter.alerts];
}

export function getQuotaStatus(tenantId: string, now: Date = new Date()): QuotaStatus {
  const meter = getOrRotateMeter(tenantId, now);
  return buildStatus(tenantId, meter, now);
}

export function recordFirestoreReads(tenantId: string, count: number, now: Date = new Date()): QuotaStatus {
  const meter = getOrRotateMeter(tenantId, now);
  const prevState = computeState(meter);
  const delta = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (delta > 0) {
    meter.reads += delta;
    meter.updatedAt = now.toISOString();
  }
  return maybeNotifyStateTransition(tenantId, meter, prevState, now);
}

export function recordFirestoreWrites(tenantId: string, count: number, now: Date = new Date()): QuotaStatus {
  const meter = getOrRotateMeter(tenantId, now);
  const prevState = computeState(meter);
  const delta = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (delta > 0) {
    meter.writes += delta;
    meter.updatedAt = now.toISOString();
  }
  return maybeNotifyStateTransition(tenantId, meter, prevState, now);
}

export function markQuotaExhausted(
  tenantId: string,
  reason = 'FIRESTORE_QUOTA_EXCEEDED',
  now: Date = new Date()
): QuotaStatus {
  const meter = getOrRotateMeter(tenantId, now);
  const prevState = computeState(meter);
  meter.exhaustedLatch = true;
  meter.reason = String(reason || 'FIRESTORE_QUOTA_EXCEEDED').slice(0, 240);
  meter.updatedAt = now.toISOString();
  return maybeNotifyStateTransition(tenantId, meter, prevState, now);
}

/**
 * Clears the quota-exhausted latch so an admin can test whether Google Cloud Spark
 * quota has reset cleanly; if the next Firestore request hits quota, it re-latches.
 */
export function resetQuotaShieldProbe(tenantId: string, now: Date = new Date()): QuotaStatus {
  const meter = getOrRotateMeter(tenantId, now);
  meter.exhaustedLatch = false;
  delete meter.reason;
  if (meter.reads >= SPARK_SHIELD_READ_THRESHOLD) {
    meter.reads = 0;
  }
  if (meter.writes >= SPARK_SHIELD_WRITE_THRESHOLD) {
    meter.writes = 0;
  }
  meter.lastAlertedState = computeState(meter);
  meter.updatedAt = now.toISOString();
  return buildStatus(tenantId, meter, now);
}

export function shouldDeferBackgroundJob(tenantId: string, now: Date = new Date()): boolean {
  return getQuotaStatus(tenantId, now).state !== 'normal';
}

export function isQuotaShieldActive(tenantId: string, now: Date = new Date()): boolean {
  return getQuotaStatus(tenantId, now).state === 'shield_active';
}

export function __clearAllQuotaMetersForTests(): void {
  tenantMeters.clear();
  alertListeners.clear();
}
