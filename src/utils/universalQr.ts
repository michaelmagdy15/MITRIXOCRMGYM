import { Attendance, Client, ClientPackage, Payment } from '../types';

export type CheckinLookupMode = 'member_id' | 'qr_code' | 'invitation_id' | 'service_member_id';

export interface ParsedUniversalQr {
  isUniversal: boolean;
  raw: string;
  originHost: string | null;
  tokenOrMemberId: string;
}

export interface WrongEntryLogRecord {
  id: string;
  memberId: string;
  clientName: string;
  clientId?: string;
  branch: string;
  lookupMode: CheckinLookupMode;
  reasonCode: 'EXPIRED' | 'ON_HOLD' | 'UNCONFIRMED' | 'NO_SESSIONS' | 'NOT_FOUND' | 'CROSS_BRANCH_LIMIT';
  reasonMessage: string;
  timestamp: string;
  stationFingerprint?: string;
}

export interface CheckinGatekeeperEvaluation {
  allowed: boolean;
  requiresConfirmation: boolean;
  member: Client;
  activePackages: ClientPackage[];
  hasMultiplePackages: boolean;
  isFrozen: boolean;
  freezeReason?: string;
  freezeSince?: string;
  isUnconfirmed: boolean;
  unpaidAmount: number;
  hasOverdueDebt: boolean;
  stickyNote?: string;
  denialReasonCode?: WrongEntryLogRecord['reasonCode'];
  denialMessage?: string;
}

/**
 * Clean-room equivalent of RedGITS v17.12 `isUniversalQrCode(raw)` in `source-15`:
 * Recognizes `UC|<hostname>|<token>` or `<hostname>|<token>` for multi-branch / sister-gym roaming.
 */
export function parseUniversalQrCode(rawInput: string): ParsedUniversalQr {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    return { isUniversal: false, raw: '', originHost: null, tokenOrMemberId: '' };
  }

  const parts = trimmed.split('|');
  if (parts.length === 3 && parts[0]?.toUpperCase() === 'UC') {
    const host = parts[1]?.trim() || '';
    const token = parts[2]?.trim() || '';
    if (host.includes('.') && token.length >= 2) {
      return {
        isUniversal: true,
        raw: trimmed,
        originHost: host.toLowerCase(),
        tokenOrMemberId: token,
      };
    }
  }

  if (parts.length === 2) {
    const host = parts[0]?.trim() || '';
    const token = parts[1]?.trim() || '';
    if (host.includes('.') && token.length >= 2) {
      return {
        isUniversal: true,
        raw: trimmed,
        originHost: host.toLowerCase(),
        tokenOrMemberId: token,
      };
    }
  }

  return {
    isUniversal: false,
    raw: trimmed,
    originHost: null,
    tokenOrMemberId: trimmed.replace(/^#/, ''),
  };
}

/**
 * Evaluates the 6-Stage Front-Desk Check-In Gatekeeper for a scanned or looked-up member:
 * 1. Multi-package disambiguation (`hasMultiplePackages`)
 * 2. Freeze / Hold interception (`isFrozen`) with instant Break-Freeze option
 * 3. Unconfirmed membership check (`isUnconfirmed`)
 * 4. Overdue debt / installment alert (`hasOverdueDebt`, `unpaidAmount`)
 * 5. Sticky reception alert note (`stickyNote`)
 * 6. Expiry & remaining session validation (`allowed`, `denialReasonCode`)
 */
export function evaluateCheckinGatekeeper(
  member: Client,
  payments: Payment[]
): CheckinGatekeeperEvaluation {
  const pkgs = member.packages || [];
  const activePackages = pkgs.filter((p) => p.status === 'Active' && !p.isPendingConfirmation);
  const pendingPackages = pkgs.filter((p) => p.isPendingConfirmation === true);
  const holdPackage = pkgs.find((p) => p.status === 'Hold' || p.isOnHold);

  const unpaidAmount = payments
    .filter((p) => p.clientId === member.id && !p.deleted_at)
    .reduce((sum, p) => sum + Math.max(0, (p.amount || 0) - (p.amount_paid || 0)), 0);

  const latestComment =
    member.comments && member.comments.length > 0
      ? member.comments[member.comments.length - 1]?.text
      : undefined;
  const stickyNote = member.legacyNotes || latestComment;

  const isFrozen = member.status === 'Hold' || Boolean(holdPackage);
  const isUnconfirmed =
    activePackages.length === 0 && pendingPackages.length > 0;

  // Check expiry
  let isExpired = member.status === 'Expired';
  if (member.membershipExpiry) {
    const exp = new Date(member.membershipExpiry);
    if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      isExpired = true;
    }
  }

  const noSessions =
    typeof member.sessionsRemaining === 'number' && member.sessionsRemaining <= 0;

  let denialReasonCode: WrongEntryLogRecord['reasonCode'] | undefined;
  let denialMessage: string | undefined;

  if (isUnconfirmed) {
    denialReasonCode = 'UNCONFIRMED';
    denialMessage = 'Membership is unconfirmed in the Finance queue. Confirm package before entry.';
  } else if (isFrozen) {
    denialReasonCode = 'ON_HOLD';
    denialMessage = `Membership is currently Frozen (${holdPackage?.holdReason || 'On Hold'}). Break freeze to check in.`;
  } else if (isExpired) {
    denialReasonCode = 'EXPIRED';
    denialMessage = 'Member finished or expired their package. Renewal required.';
  } else if (noSessions) {
    denialReasonCode = 'NO_SESSIONS';
    denialMessage = 'Member has 0 sessions remaining on their package.';
  }

  const allowed = !denialReasonCode;
  const requiresConfirmation =
    !allowed ||
    activePackages.length > 1 ||
    unpaidAmount > 0 ||
    Boolean(stickyNote);

  return {
    allowed,
    requiresConfirmation,
    member,
    activePackages,
    hasMultiplePackages: activePackages.length > 1,
    isFrozen,
    freezeReason: holdPackage?.holdReason,
    freezeSince: holdPackage?.holdDate,
    isUnconfirmed,
    unpaidAmount,
    hasOverdueDebt: unpaidAmount > 0,
    stickyNote,
    denialReasonCode,
    denialMessage,
  };
}

/**
 * Computes live floor occupancy breakdown (`Active Member now is X | Male: Y | Female: Z`)
 * for today's check-ins within the active floor window (default last 3 hours or since today's start).
 */
export function computeLiveFloorOccupancy(
  attendances: Attendance[],
  clients: Client[],
  selectedBranch?: string,
  checkedOutClientIds?: Set<string>
): { totalActive: number; male: number; female: number; activeClientIds: string[] } {
  const cairoToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const clientMap = new Map<string, Client>();
  for (const c of clients) {
    clientMap.set(c.id, c);
  }

  const activeSet = new Set<string>();
  for (const att of attendances) {
    if (!att.date) continue;
    if (selectedBranch && selectedBranch !== 'ALL' && att.branch && att.branch !== selectedBranch) {
      continue;
    }
    try {
      const attDate = new Date(att.date).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      if (attDate === cairoToday && !checkedOutClientIds?.has(att.clientId)) {
        activeSet.add(att.clientId);
      }
    } catch {
      // ignore malformed date
    }
  }

  let male = 0;
  let female = 0;
  for (const cid of activeSet) {
    const c = clientMap.get(cid);
    const g = (c?.gender || '').toLowerCase();
    if (g === 'female') {
      female++;
    } else {
      male++;
    }
  }

  return {
    totalActive: activeSet.size,
    male,
    female,
    activeClientIds: Array.from(activeSet),
  };
}
