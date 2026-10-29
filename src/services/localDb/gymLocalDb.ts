import { openDB, deleteDB, type IDBPDatabase, type StoreNames } from 'idb';
import {
  LOCAL_DB_VERSION,
  getDbNameForTenant,
  upgradeLocalDb,
  type MitrixoGymLocalDbSchema,
  type LocalMember,
  type LocalTodayAttendance,
  type LocalPackage,
  type LocalTodaySchedule
} from './schema';

export type LocalDbStoreName = StoreNames<MitrixoGymLocalDbSchema>;

/**
 * Cache for active database connection promises keyed by tenant database name.
 */
const dbPromiseMap = new Map<string, Promise<IDBPDatabase<MitrixoGymLocalDbSchema>>>();
let customLocalDbInstance: any = null;

/**
 * Sets a custom database instance (primarily for tests / mocked environments).
 */
export function setCustomLocalDb(instance: any): void {
  customLocalDbInstance = instance;
}

/**
 * Initializes and retrieves the tenant-isolated IndexedDB instance using 'idb'.
 * The database name is namespaced per tenant: `mitrixo_${tenantId}_db`.
 */
export async function getLocalDb(tenantId: string): Promise<IDBPDatabase<MitrixoGymLocalDbSchema>> {
  if (customLocalDbInstance) {
    return customLocalDbInstance;
  }
  const dbName = getDbNameForTenant(tenantId);
  let dbPromise = dbPromiseMap.get(dbName);

  if (!dbPromise) {
    dbPromise = openDB<MitrixoGymLocalDbSchema>(dbName, LOCAL_DB_VERSION, {
      upgrade(db) {
        upgradeLocalDb(db);
      },
      blocked() {
        console.warn(`[gymLocalDb] Database ${dbName} open blocked by an older connection.`);
      },
      blocking() {
        console.warn(`[gymLocalDb] Database ${dbName} is blocking an upgrade request.`);
      },
      terminated() {
        console.warn(`[gymLocalDb] Database ${dbName} connection terminated abnormally.`);
        dbPromiseMap.delete(dbName);
      }
    });

    dbPromiseMap.set(dbName, dbPromise);
  }

  return dbPromise;
}

/**
 * Closes the active IndexedDB connection for the specified tenant.
 */
export async function closeLocalDb(tenantId: string): Promise<void> {
  const dbName = getDbNameForTenant(tenantId);
  const dbPromise = dbPromiseMap.get(dbName);
  if (dbPromise) {
    dbPromiseMap.delete(dbName);
    const db = await dbPromise;
    db.close();
  }
}

/**
 * Deletes the tenant's IndexedDB database.
 */
export async function deleteLocalDb(tenantId: string): Promise<void> {
  await closeLocalDb(tenantId);
  const dbName = getDbNameForTenant(tenantId);
  await deleteDB(dbName);
}

/**
 * Clears all records from a specific store in the tenant's local database.
 */
export async function clearLocalStore(
  tenantId: string,
  storeName: LocalDbStoreName
): Promise<void> {
  const db = await getLocalDb(tenantId);
  await db.clear(storeName);
}

// ============================================================================
// MEMBERS
// ============================================================================

/**
 * Saves a list of member records into the tenant's local 'members' store.
 * Automatically normalizes phone numbers and ensures required index fields exist.
 */
export async function saveMembers(tenantId: string, members: any[]): Promise<void> {
  if (!members || !Array.isArray(members) || members.length === 0) return;
  const db = await getLocalDb(tenantId);
  const tx = db.transaction('members', 'readwrite');
  const store = tx.objectStore('members');

  for (const m of members) {
    if (!m || !m.id) continue;
    const phoneStr = m.phone ? String(m.phone) : '';
    const normPhone = m.normalizedPhone || phoneStr.replace(/\D/g, '');
    const record: LocalMember = {
      ...m,
      id: String(m.id),
      name: m.name ? String(m.name) : '',
      phone: phoneStr,
      normalizedPhone: normPhone,
      status: m.status ? String(m.status) : 'Active',
      updatedAt: m.updatedAt || new Date().toISOString()
    };
    store.put(record);
  }

  await tx.done;
}

/**
 * Retrieves a single member by their unique ID from the local database.
 */
export async function getMemberById(tenantId: string, id: string): Promise<any | null> {
  if (!id) return null;
  const db = await getLocalDb(tenantId);
  const member = await db.get('members', String(id));
  return member ?? null;
}

/**
 * Searches local members by name, phone, normalizedPhone, memberId, or document ID.
 * Returns an array of matching members (case-insensitive substring search).
 */
export async function searchMembersLocal(tenantId: string, searchTerm: string): Promise<any[]> {
  const rawTerm = searchTerm?.trim() ?? '';
  if (!rawTerm) return [];

  const lowerTerm = rawTerm.toLowerCase();
  const digitsOnly = rawTerm.replace(/\D/g, '');
  const db = await getLocalDb(tenantId);

  // 1. Direct ID lookup check first
  const directMatch = await db.get('members', rawTerm);
  if (directMatch) {
    return [directMatch];
  }

  // 2. Fetch all members from local store for comprehensive matching
  const allMembers = await db.getAll('members');
  return allMembers.filter((m) => {
    if (!m) return false;
    const id = m.id ? String(m.id).toLowerCase() : '';
    const memberId = m.memberId ? String(m.memberId).toLowerCase() : '';
    const name = m.name ? String(m.name).toLowerCase() : '';
    const phone = m.phone ? String(m.phone) : '';
    const normPhone = m.normalizedPhone ? String(m.normalizedPhone) : '';

    if (id === lowerTerm) return true;
    if (memberId && memberId.includes(lowerTerm)) return true;
    if (name && name.includes(lowerTerm)) return true;
    if (phone && phone.includes(rawTerm)) return true;
    if (digitsOnly && normPhone && normPhone.includes(digitsOnly)) return true;
    if (digitsOnly && phone && phone.replace(/\D/g, '').includes(digitsOnly)) return true;

    return false;
  });
}

// ============================================================================
// ATTENDANCE
// ============================================================================

/**
 * Saves a list of attendance records into the tenant's 'todayAttendance' store.
 */
export async function saveTodayAttendance(tenantId: string, records: any[]): Promise<void> {
  if (!records || !Array.isArray(records) || records.length === 0) return;
  const db = await getLocalDb(tenantId);
  const tx = db.transaction('todayAttendance', 'readwrite');
  const store = tx.objectStore('todayAttendance');

  for (const r of records) {
    if (!r || !r.id) continue;
    store.put(r);
  }

  await tx.done;
}

/**
 * Records or updates a single local attendance entry in 'todayAttendance'.
 */
export async function recordLocalAttendance(tenantId: string, attendance: any): Promise<void> {
  if (!attendance) return;
  const db = await getLocalDb(tenantId);
  const record: LocalTodayAttendance = {
    ...attendance,
    id: attendance.id || `local_att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    updatedAt: attendance.updatedAt || new Date().toISOString()
  };
  await db.put('todayAttendance', record);
}

/**
 * Retrieves today's attendance records for a given client matching the Cairo date string.
 * Checks both clientId and memberId, matching sessionDate, date prefix, or checkedInAt prefix.
 */
export async function getTodayAttendanceForClient(
  tenantId: string,
  clientId: string,
  cairoDateStr: string
): Promise<any[]> {
  if (!clientId) return [];
  const db = await getLocalDb(tenantId);

  let records: any[] = [];
  try {
    records = await db.getAllFromIndex('todayAttendance', 'clientId', clientId);
  } catch {
    records = [];
  }

  if (records.length === 0) {
    const all = await db.getAll('todayAttendance');
    records = all.filter((r) => r && (r.clientId === clientId || r.memberId === clientId));
  }

  return records.filter((a) => {
    if (!a) return false;
    const matchesClient = a.clientId === clientId || a.memberId === clientId;
    if (!matchesClient) return false;

    if (a.sessionDate === cairoDateStr) return true;
    if (a.date === cairoDateStr) return true;
    if (typeof a.date === 'string' && a.date.startsWith(cairoDateStr)) return true;
    if (typeof a.checkedInAt === 'string' && a.checkedInAt.startsWith(cairoDateStr)) return true;

    return false;
  });
}

// ============================================================================
// SCHEDULE
// ============================================================================

/**
 * Saves today's schedule records into 'todaySchedule'.
 */
export async function saveTodaySchedule(tenantId: string, schedules: any[]): Promise<void> {
  if (!schedules || !Array.isArray(schedules) || schedules.length === 0) return;
  const db = await getLocalDb(tenantId);
  const tx = db.transaction('todaySchedule', 'readwrite');
  const store = tx.objectStore('todaySchedule');

  for (const s of schedules) {
    if (!s || !s.id) continue;
    store.put(s);
  }

  await tx.done;
}

/**
 * Retrieves today's schedule records, optionally filtered by date.
 */
export async function getTodaySchedule(tenantId: string, dateStr?: string): Promise<LocalTodaySchedule[]> {
  const db = await getLocalDb(tenantId);
  if (dateStr) {
    try {
      return await db.getAllFromIndex('todaySchedule', 'date', dateStr);
    } catch {
      const all = await db.getAll('todaySchedule');
      return all.filter((s) => s && s.date === dateStr);
    }
  }
  return db.getAll('todaySchedule');
}

// ============================================================================
// PACKAGES
// ============================================================================

/**
 * Saves packages into the local 'packages' store.
 */
export async function savePackages(tenantId: string, packages: any[]): Promise<void> {
  if (!packages || !Array.isArray(packages) || packages.length === 0) return;
  const db = await getLocalDb(tenantId);
  const tx = db.transaction('packages', 'readwrite');
  const store = tx.objectStore('packages');

  for (const pkg of packages) {
    if (!pkg || !pkg.id) continue;
    store.put(pkg);
  }

  await tx.done;
}

/**
 * Retrieves all packages from the tenant's local 'packages' store.
 */
export async function getPackages(tenantId: string): Promise<LocalPackage[]> {
  const db = await getLocalDb(tenantId);
  return db.getAll('packages');
}

// ============================================================================
// SYNC META & CURSOR
// ============================================================================

/**
 * Retrieves the sync cursor string from the 'syncMeta' store for the specified tenant.
 */
export async function getSyncCursor(tenantId: string): Promise<string | null> {
  const db = await getLocalDb(tenantId);
  const entry = await db.get('syncMeta', 'syncCursor');
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  return entry.cursor ?? entry.value ?? null;
}

/**
 * Sets the sync cursor string in the 'syncMeta' store for the specified tenant.
 */
export async function setSyncCursor(tenantId: string, cursor: string): Promise<void> {
  const db = await getLocalDb(tenantId);
  await db.put('syncMeta', {
    key: 'syncCursor',
    cursor,
    value: cursor,
    updatedAt: new Date().toISOString()
  });
}
