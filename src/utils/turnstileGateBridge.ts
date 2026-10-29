import type { Client, Package, Payment } from '../types';
import { evaluateCheckinGatekeeper } from './universalQr';
import { validatePackageTimeWindow, isPrimaryMembershipPackage } from './membershipRules';
import { resolveEffectivePackageRules } from './packageVersioning';

export interface TurnstileHardwareConfig {
  enabled: boolean;
  controllerType: 'ZKTeco' | 'Hikvision' | 'Shelly_HTTP' | 'Custom_Webhook';
  relayEndpointUrl: string; // e.g. http://192.168.1.200/relay/0?turn=on
  relayPulseMs: number; // default 1500ms
  isSeasonalSahelBranch: boolean;
  seasonalFreeVisitsAllowance: number; // e.g. 7 visits at North Coast pop-up for Cairo Annual members
}

export const DEFAULT_TURNSTILE_CONFIG: TurnstileHardwareConfig = {
  enabled: false,
  controllerType: 'ZKTeco',
  relayEndpointUrl: 'http://192.168.1.200/relay/open',
  relayPulseMs: 1500,
  isSeasonalSahelBranch: false,
  seasonalFreeVisitsAllowance: 7,
};

export interface TurnstileGateDecision {
  allowRelayOpen: boolean;
  relayPulseMs: number;
  statusColor: 'green' | 'amber' | 'red';
  reasonCode:
    | 'GRANTED'
    | 'GRANTED_WITH_WARNING'
    | 'OUTSIDE_TIME_WINDOW'
    | 'SEASONAL_PASS_REQUIRED'
    | 'EXPIRED'
    | 'ON_HOLD'
    | 'UNCONFIRMED'
    | 'NO_SESSIONS'
    | 'OVERDUE_INSTALLMENT';
  messageEn: string;
  messageAr: string;
}

/**
 * Evaluates physical turnstile / speed-gate access for ZKTeco / Hikvision controllers,
 * enforcing:
 * 1. Core 6-stage membership gatekeeper (Active, Frozen/Hold, Unconfirmed, Remaining Sessions)
 * 2. Morning / Time-Restricted Package Windows (e.g. 06:00–14:00)
 * 3. North Coast (Sahel) Seasonal Pop-Up Branch rules
 */
export function evaluateTurnstileGateAccess(params: {
  member: Client;
  payments: Payment[];
  cataloguePackages?: Package[];
  config?: Partial<TurnstileHardwareConfig>;
  seasonalVisitsUsed?: number;
  now?: Date;
}): TurnstileGateDecision {
  const {
    member,
    payments,
    cataloguePackages = [],
    config = DEFAULT_TURNSTILE_CONFIG,
    seasonalVisitsUsed = 0,
    now = new Date(),
  } = params;

  const pulseMs = config.relayPulseMs || 1500;
  const gate = evaluateCheckinGatekeeper(member, payments);

  if (!gate.allowed) {
    const code = gate.denialReasonCode || 'EXPIRED';
    const arMap: Record<string, string> = {
      EXPIRED: 'الاشتراك منتهي — يرجى التجديد في الاستقبال',
      ON_HOLD: 'الاشتراك مجمد حالياً (Hold) — يرجى فك التجميد أولاً',
      UNCONFIRMED: 'الاشتراك في انتظار تأكيد الإدارة المالية',
      NO_SESSIONS: 'تم استنفاد جميع الحصص المتاحة في الباقة',
    };
    return {
      allowRelayOpen: false,
      relayPulseMs: 0,
      statusColor: 'red',
      reasonCode: (code as TurnstileGateDecision['reasonCode']) || 'EXPIRED',
      messageEn: gate.denialMessage || 'Access denied at turnstile gate.',
      messageAr: arMap[code] || 'غير مسموح بالدخول — يرجى مراجعة الاستقبال',
    };
  }

  // Resolve effective package rules using Snapshot-First / Version-History precedence
  // so future edits to a package's time window do not retroactively block legacy members.
  const activeClientPkg = gate.activePackages[0];
  const matchedCatPkg = cataloguePackages.find(
    (p) =>
      p.name.trim().toLowerCase() ===
      String(activeClientPkg?.packageName || member.packageType || '')
        .trim()
        .toLowerCase()
  );

  const resolvedRules = resolveEffectivePackageRules(activeClientPkg as any, member, matchedCatPkg);
  if (resolvedRules.isTimeRestricted) {
    const timeCheck = validatePackageTimeWindow(
      {
        name: resolvedRules.packageName,
        isTimeRestricted: resolvedRules.isTimeRestricted,
        allowedStartTime: resolvedRules.allowedStartTime,
        allowedEndTime: resolvedRules.allowedEndTime,
      },
      now,
      'Africa/Cairo'
    );
    if (!timeCheck.allowed) {
      return {
        allowRelayOpen: false,
        relayPulseMs: 0,
        statusColor: 'red',
        reasonCode: 'OUTSIDE_TIME_WINDOW',
        messageEn: timeCheck.reason || 'Outside allowed package check-in hours.',
        messageAr: `باقة صباحية — مسموح بالدخول فقط من ${resolvedRules.allowedStartTime || '06:00'} إلى ${resolvedRules.allowedEndTime || '14:00'}`,
      };
    }
  }

  // Check Seasonal / Sahel Pop-Up Branch rules if enabled
  if (config.isSeasonalSahelBranch) {
    const hasAllBranches = Boolean(member.has_multi_branch_access || matchedCatPkg?.is_all_branches);
    const isPrimary = matchedCatPkg ? isPrimaryMembershipPackage(matchedCatPkg) : true;
    const maxSeasonalVisits = config.seasonalFreeVisitsAllowance ?? 7;

    if (!hasAllBranches && (!isPrimary || seasonalVisitsUsed >= maxSeasonalVisits)) {
      return {
        allowRelayOpen: false,
        relayPulseMs: 0,
        statusColor: 'red',
        reasonCode: 'SEASONAL_PASS_REQUIRED',
        messageEn: `Seasonal Sahel Branch limit reached (${seasonalVisitsUsed}/${maxSeasonalVisits} complimentary visits used). Seasonal pass upgrade required.`,
        messageAr: `تم استنفاد الزيارات المجانية لفرع الساحل (${seasonalVisitsUsed}/${maxSeasonalVisits}) — يرجى ترقية باقة الساحل`,
      };
    }
  }

  if (gate.unpaidAmount > 0) {
    return {
      allowRelayOpen: true,
      relayPulseMs: pulseMs,
      statusColor: 'amber',
      reasonCode: 'GRANTED_WITH_WARNING',
      messageEn: `Gate Open (${pulseMs}ms) — Note: Member has ${gate.unpaidAmount.toLocaleString()} EGP remaining balance.`,
      messageAr: `تم فتح البوابة — تنبيه: يوجد رصيد متبقي ${gate.unpaidAmount.toLocaleString()} ج.م`,
    };
  }

  return {
    allowRelayOpen: true,
    relayPulseMs: pulseMs,
    statusColor: 'green',
    reasonCode: 'GRANTED',
    messageEn: `Gate Relay Open (${pulseMs}ms) — Welcome, ${member.name}!`,
    messageAr: `تم فتح البوابة — أهلاً بك يا ${member.name}!`,
  };
}

/**
 * Triggers a local LAN HTTP Turnstile Relay (ZKTeco / Hikvision / Shelly IP Relay) if enabled.
 */
export async function triggerTurnstileRelay(
  config: TurnstileHardwareConfig,
  decision: TurnstileGateDecision,
  member: Pick<Client, 'id' | 'name' | 'memberId'>
): Promise<{ triggered: boolean; error?: string }> {
  if (!config.enabled || !decision.allowRelayOpen || !config.relayEndpointUrl) {
    return { triggered: false };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    await fetch(config.relayEndpointUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'OPEN_GATE',
        pulseMs: decision.relayPulseMs,
        memberId: member.memberId || member.id,
        memberName: member.name,
        controllerType: config.controllerType,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { triggered: true };
  } catch (err: any) {
    return { triggered: false, error: err?.message || 'Relay unreachable on local network' };
  }
}
