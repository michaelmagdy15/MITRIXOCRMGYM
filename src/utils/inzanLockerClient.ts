import { auth } from '../firebase';

export interface InzanLockerUser {
  id: number;
  username: string;
  email: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: number;
  gym_id: string | null;
  rfid_tag: string | null;
  locker_id: number | null;
  valid_until: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InzanLockerGroup {
  id: number;
  name: string;
  description: string;
  color: string;
  slug?: string;
  is_system?: number;
  locker_ids: number[];
}

export interface InzanHardwareLocker {
  id: number;
  locker_id: string;
  name: string;
  location: string;
  status: 'available' | 'occupied' | 'maintenance' | 'in-use' | string;
  ip_address: string | null;
  topic: string | null;
  num_locks: number;
  controller_type: string | null;
  last_heartbeat: string | null;
  uptime: number | null;
  is_online: number;
  user_id: number | null;
  last_used: string | null;
  controller_id: number | null;
  channel: number | null;
  protocol: 'aywana' | 'rubik' | string | null;
  unique_id: string | null;
  state_topic: string | null;
  command_topic: string | null;
  relay_state: 'ON' | 'OFF' | string | null;
  gender: 'men' | 'women' | string | null;
  gender_locked: number;
  metadata?: string | Record<string, any> | null;
  // Enriched fields from CRM bridge
  occupant?: InzanLockerUser | null;
  group?: InzanLockerGroup | null;
  crmClientId?: string | null;
  crmClientName?: string | null;
  crmPin?: string | null;
}

export interface InzanLockerController {
  id: number;
  hostname: string;
  name: string;
  protocol: string;
  manufacturer: string;
  model: string;
  sw_version: string;
  channel_count: number;
  ip_address: string;
  is_online: number;
  last_seen: string | null;
  last_telemetry: string | Record<string, any> | null;
  availability_topic: string | null;
  gender: 'men' | 'women' | string | null;
  group?: { id: number; name: string } | null;
  lockers?: InzanHardwareLocker[];
}

export interface InzanLockerReader {
  id: number;
  reader_id: string;
  name: string | null;
  source: 'usb' | 'mqtt' | 'http' | string;
  controller_id: number | null;
  group_id: number | null;
  is_active: number;
  last_seen: string | null;
  metadata?: {
    auto_assign?: boolean;
    allow_global?: boolean;
    [key: string]: any;
  } | null;
}

export interface InzanLockerOverviewResponse {
  ok: boolean;
  serverUrl: string;
  status: {
    mqtt: string;
    connected: boolean;
    config?: Record<string, any>;
    circuitBreaker?: Record<string, any>;
  };
  heartbeat: {
    total: number;
    online: number;
    offline: number;
    noHeartbeat: number;
    averageUptime: number;
    lastHeartbeat: string | null;
    lockersByStatus?: {
      online: Array<{ id: number; name: string; lastHeartbeat: string; uptime: number }>;
      offline: Array<{ id: number; name: string; lastHeartbeat: string; uptime: number }>;
      noHeartbeat: Array<{ id: number; name: string }>;
    };
  };
  lockerExpiryHours: number;
  settings?: Record<string, any>;
  lockers: InzanHardwareLocker[];
  groups: InzanLockerGroup[];
  controllers: InzanLockerController[];
  readers: InzanLockerReader[];
  users: InzanLockerUser[];
  syncedAt: string;
  bridge?: {
    online: boolean;
    lastSeen: string | null;
    localUrl: string;
    tunnelUrl: string | null;
    hostname?: string | null;
    installCommand: string;
  };
}

export interface InzanMemberLockerStatus {
  ok: boolean;
  assignedLocker: InzanHardwareLocker | null;
  occupant: InzanLockerUser | null;
  pin: string | null;
  sessionToken: string | null;
  expiresAt: string | null;
  unlockUrl: string;
  groups: Array<{
    id: number;
    name: string;
    slug?: string;
    color: string;
    availableOnline: number;
    total: number;
  }>;
}

/**
 * Converts UID from USB RFID reader format to ESP-compatible 8-char reversed uppercase hex.
 * Matches QuickRegister.js in the Inzan Locker Server.
 */
export function convertRfidUid(raw: string): string {
  const cleaned = (raw || '').split('\n').pop()?.trim().toUpperCase() || '';
  if (!cleaned) return '';

  const isPureDecimal = /^\d+$/.test(cleaned);
  if (isPureDecimal) {
    const dec = parseInt(cleaned, 10);
    if (!isNaN(dec) && dec > 0) {
      const hex = ('00000000' + dec.toString(16).toUpperCase()).slice(-8);
      return hex.slice(6, 8) + hex.slice(4, 6) + hex.slice(2, 4) + hex.slice(0, 2);
    }
  }

  const hexOnly = cleaned.replace(/[^0-9A-F]/gi, '').toUpperCase();
  if (hexOnly.length >= 8) {
    const hex8 = hexOnly.slice(-8);
    return hex8.slice(6, 8) + hex8.slice(4, 6) + hex8.slice(2, 4) + hex8.slice(0, 2);
  } else if (hexOnly.length > 0) {
    const hex8 = ('00000000' + hexOnly).slice(-8);
    return hex8.slice(6, 8) + hex8.slice(4, 6) + hex8.slice(2, 4) + hex8.slice(0, 2);
  }

  return cleaned;
}

export function isHardwareLockerOnline(locker?: { is_online?: number; last_heartbeat?: string | null } | null): boolean {
  if (!locker) return false;
  if (locker.is_online === 1) return true;
  if (!locker.last_heartbeat) return false;
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return new Date(locker.last_heartbeat).getTime() > fiveMinutesAgo;
}

export function formatLockerTimeRemaining(validUntil?: string | null): {
  expired: boolean;
  text: string;
  msRemaining: number;
  approaching: boolean;
} | null {
  if (!validUntil) return null;
  const target = new Date(validUntil).getTime();
  if (isNaN(target)) return null;
  const ms = target - Date.now();
  if (ms <= 0) {
    return { expired: true, text: 'Expired', msRemaining: 0, approaching: false };
  }
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const text = h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
  return {
    expired: false,
    text,
    msRemaining: ms,
    approaching: ms < 30 * 60 * 1000,
  };
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // Proceed without token if unavailable
  }
  return headers;
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `HTTP ${res.status}` };
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.reason || data?.message || `Locker request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchInzanLockerOverview(): Promise<InzanLockerOverviewResponse> {
  return requestJson<InzanLockerOverviewResponse>('/api/inzan/lockers/overview');
}

export async function sendInzanLockerCommand(
  lockerId: number,
  command: 'openlock' | 'maintenance' | 'normal'
): Promise<{ ok: boolean; locker?: InzanHardwareLocker }> {
  return requestJson(`/api/inzan/lockers/${lockerId}/command`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  });
}

export async function assignInzanLockerToMember(
  lockerId: number,
  payload: {
    clientId?: string;
    clientName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    rfidTag?: string;
    userId?: number;
    expiryHours?: number;
    expiryDate?: string;
  }
): Promise<{
  ok: boolean;
  locker: InzanHardwareLocker;
  user: InzanLockerUser;
  pin: string | null;
  expiresAt: string;
}> {
  return requestJson(`/api/inzan/lockers/${lockerId}/assign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function assignInzanLockerCardless(payload: {
  groupId: number;
  clientId?: string;
  clientName?: string;
  phone?: string;
  email?: string;
}): Promise<{
  ok: boolean;
  locker: InzanHardwareLocker;
  user: InzanLockerUser;
  pin: string | null;
  expires_at: string;
}> {
  return requestJson('/api/inzan/lockers/assign-cardless', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function scanInzanRfid(payload: {
  uid: string;
  groupId: number;
  readerId?: string;
  source?: string;
  clientId?: string;
  clientName?: string;
}): Promise<{
  ok: boolean;
  decision: string;
  locker?: InzanHardwareLocker;
  user?: InzanLockerUser;
  valid_until?: string;
  pin?: string | null;
  reason?: string;
}> {
  return requestJson('/api/inzan/lockers/rfid-scan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function unassignInzanLocker(lockerId: number): Promise<{ ok: boolean; locker?: InzanHardwareLocker }> {
  return requestJson(`/api/inzan/lockers/${lockerId}/unassign`, {
    method: 'POST',
  });
}

export async function reissueInzanLockerPin(lockerId: number): Promise<{ ok: boolean; pin: string }> {
  return requestJson(`/api/inzan/lockers/${lockerId}/reissue-pin`, {
    method: 'POST',
  });
}

export async function extendInzanLockerUserExpiry(
  userId: number,
  newExpiryDate: string,
  lockerId?: number
): Promise<{ ok: boolean; valid_until: string }> {
  return requestJson(`/api/inzan/lockers/users/${userId}/extend-expiry`, {
    method: 'PUT',
    body: JSON.stringify({ newExpiryDate, lockerId }),
  });
}

export async function fetchInzanLockerUserLogs(userId: number): Promise<{ ok: boolean; logs: any[] }> {
  return requestJson(`/api/inzan/lockers/users/${userId}/logs`);
}

export async function bulkUnlockInzanLockers(
  onlineOnly = true
): Promise<{ ok: boolean; results: any[]; errors: any[] }> {
  return requestJson('/api/inzan/lockers/bulk-unlock', {
    method: 'POST',
    body: JSON.stringify({ onlineOnly }),
  });
}

export async function runInzanGroupBulkOperation(
  groupId: number,
  operation: 'unlock' | 'maintenance' | 'normal'
): Promise<{ ok: boolean }> {
  return requestJson(`/api/inzan/lockers/groups/${groupId}/bulk`, {
    method: 'POST',
    body: JSON.stringify({ operation }),
  });
}

export async function saveInzanLockerGroup(group: {
  id?: number;
  name: string;
  description: string;
  color: string;
  locker_ids: number[];
}): Promise<{ ok: boolean; group: InzanLockerGroup }> {
  if (group.id) {
    return requestJson(`/api/inzan/lockers/groups/${group.id}`, {
      method: 'PUT',
      body: JSON.stringify(group),
    });
  }
  return requestJson('/api/inzan/lockers/groups', {
    method: 'POST',
    body: JSON.stringify(group),
  });
}

export async function deleteInzanLockerGroup(groupId: number): Promise<{ ok: boolean }> {
  return requestJson(`/api/inzan/lockers/groups/${groupId}`, {
    method: 'DELETE',
  });
}

export async function sendInzanControllerRelayCommand(
  controllerId: number,
  channel: number,
  action: 'open' | 'on' | 'off'
): Promise<{ ok: boolean; success: boolean }> {
  return requestJson(`/api/inzan/lockers/controllers/${controllerId}/relay/${channel}`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export async function updateInzanController(
  controllerId: number,
  body: { name?: string; hostname?: string; group_id?: number | 'auto' | null }
): Promise<{ ok: boolean }> {
  return requestJson(`/api/inzan/lockers/controllers/${controllerId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function syncInzanControllerGroup(
  controllerId: number
): Promise<{ ok: boolean; detected?: { id: number; name: string } | null }> {
  return requestJson(`/api/inzan/lockers/controllers/${controllerId}/sync-group`, {
    method: 'POST',
  });
}

export async function renameInzanControllerChannels(
  controllerId: number,
  body: { prefix: string; startNumber: number; startChannel: number }
): Promise<{ ok: boolean; renamed?: any[] }> {
  return requestJson(`/api/inzan/lockers/controllers/${controllerId}/rename-channels`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function saveInzanReader(reader: {
  id?: number;
  reader_id?: string;
  name?: string | null;
  source?: string;
  controller_id?: number | null;
  group_id?: number | null;
  is_active?: boolean;
  metadata?: Record<string, any>;
}): Promise<{ ok: boolean }> {
  if (reader.id) {
    return requestJson(`/api/inzan/lockers/readers/${reader.id}`, {
      method: 'PUT',
      body: JSON.stringify(reader),
    });
  }
  return requestJson('/api/inzan/lockers/readers', {
    method: 'POST',
    body: JSON.stringify(reader),
  });
}

export async function deleteInzanReader(readerId: number): Promise<{ ok: boolean }> {
  return requestJson(`/api/inzan/lockers/readers/${readerId}`, {
    method: 'DELETE',
  });
}

export async function saveInzanLockerSettings(payload: {
  mqttConfig?: Record<string, any>;
  systemSettings?: Record<string, any>;
  serverConfig?: {
    baseUrl?: string;
    username?: string;
    password?: string;
  };
}): Promise<{ ok: boolean }> {
  return requestJson('/api/inzan/lockers/settings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// Member Profile & Member Portal Self-Service Helpers
// ============================================================================

export async function fetchMemberLockerStatus(clientId: string): Promise<InzanMemberLockerStatus> {
  return requestJson<InzanMemberLockerStatus>(
    `/api/inzan/lockers/member-status?clientId=${encodeURIComponent(clientId)}`
  );
}

export async function memberClaimLocker(payload: {
  clientId: string;
  clientName: string;
  gender?: string;
  groupId?: number;
  lockerId?: number;
  phone?: string;
  email?: string;
}): Promise<{
  ok: boolean;
  locker: InzanHardwareLocker;
  user: InzanLockerUser;
  pin: string | null;
  sessionToken: string | null;
  expiresAt: string;
}> {
  return requestJson('/api/inzan/lockers/member-claim', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function memberLinkLockerByPin(payload: {
  pin: string;
  clientId?: string;
  clientName?: string;
}): Promise<{
  ok: boolean;
  session: {
    token: string;
    locker_name: string;
    expires_at: string;
    extensions_left?: number;
  };
  locker?: InzanHardwareLocker | null;
}> {
  return requestJson('/api/inzan/lockers/public/unlock', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function memberCheckSessionStatus(token: string): Promise<{
  state: 'active' | 'expired';
  locker_name?: string;
  expires_at?: string;
  extensions_left?: number;
}> {
  return requestJson('/api/inzan/lockers/public/session/status', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function memberOpenLocker(payload: {
  clientId?: string;
  lockerId?: number;
  sessionToken?: string;
}): Promise<{ ok: boolean; message?: string }> {
  return requestJson('/api/inzan/lockers/member-open', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function memberExtendLocker(payload: {
  clientId?: string;
  lockerId?: number;
  userId?: number;
  sessionToken?: string;
}): Promise<{ ok: boolean; expires_at: string; extensions_left?: number }> {
  return requestJson('/api/inzan/lockers/member-extend', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function memberReleaseLocker(payload: {
  clientId?: string;
  lockerId?: number;
}): Promise<{ ok: boolean }> {
  return requestJson('/api/inzan/lockers/member-release', {
    method: 'POST',
  });
}
