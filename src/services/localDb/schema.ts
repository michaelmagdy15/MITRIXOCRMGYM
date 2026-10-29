import type { DBSchema, IDBPDatabase } from 'idb';

/**
 * Default database name and version for MitrixoGYM CRM offline local storage.
 */
export const LOCAL_DB_NAME = 'mitrixogym_local_db';
export const LOCAL_DB_VERSION = 1;

export interface LocalMember {
  id: string;
  memberId?: string;
  name: string;
  phone?: string;
  normalizedPhone?: string;
  status?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface LocalTodayAttendance {
  id: string;
  clientId?: string;
  memberId?: string;
  date?: string;
  sessionDate?: string;
  checkedInAt?: string;
  status?: string;
  notes?: string;
  [key: string]: any;
}

export interface LocalTodaySchedule {
  id: string;
  date?: string;
  coachId?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  [key: string]: any;
}

export interface LocalPackage {
  id: string;
  name: string;
  price?: number;
  durationMonths?: number;
  sessionsCount?: number;
  [key: string]: any;
}

export interface LocalSyncMeta {
  key: string;
  value?: string;
  cursor?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface MitrixoGymLocalDbSchema extends DBSchema {
  members: {
    key: string;
    value: LocalMember;
    indexes: {
      phone: string;
      normalizedPhone: string;
      name: string;
      status: string;
      updatedAt: string;
      memberId: string;
    };
  };
  todayAttendance: {
    key: string;
    value: LocalTodayAttendance;
    indexes: {
      clientId: string;
      date: string;
      sessionDate: string;
    };
  };
  todaySchedule: {
    key: string;
    value: LocalTodaySchedule;
    indexes: {
      date: string;
      coachId: string;
    };
  };
  packages: {
    key: string;
    value: LocalPackage;
    indexes: {
      name: string;
    };
  };
  syncMeta: {
    key: string;
    value: LocalSyncMeta;
  };
}

export const LOCAL_DB_STORES = {
  MEMBERS: 'members',
  TODAY_ATTENDANCE: 'todayAttendance',
  TODAY_SCHEDULE: 'todaySchedule',
  PACKAGES: 'packages',
  SYNC_META: 'syncMeta'
} as const;

/**
 * Resolves the tenant-specific IndexedDB database name.
 * Default is 'mitrixogym_local_db'; when tenantId is provided, returns `mitrixo_${tenantId}_db`.
 */
export function getDbNameForTenant(tenantId?: string): string {
  if (tenantId && tenantId.trim() !== '') {
    const cleanTenantId = tenantId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    return `mitrixo_${cleanTenantId}_db`;
  }
  return LOCAL_DB_NAME;
}

/**
 * Upgrade handler that provisions stores and indexes for MitrixoGym local IndexedDB.
 */
export function upgradeLocalDb(db: IDBPDatabase<MitrixoGymLocalDbSchema>): void {
  // 1. members store: keyPath 'id', indexes on 'phone', 'normalizedPhone', 'name', 'status', 'updatedAt', 'memberId'
  if (!db.objectStoreNames.contains('members')) {
    const store = db.createObjectStore('members', { keyPath: 'id' });
    store.createIndex('phone', 'phone', { unique: false });
    store.createIndex('normalizedPhone', 'normalizedPhone', { unique: false });
    store.createIndex('name', 'name', { unique: false });
    store.createIndex('status', 'status', { unique: false });
    store.createIndex('updatedAt', 'updatedAt', { unique: false });
    store.createIndex('memberId', 'memberId', { unique: false });
  }

  // 2. todayAttendance store: keyPath 'id', indexes on 'clientId', 'date', 'sessionDate'
  if (!db.objectStoreNames.contains('todayAttendance')) {
    const store = db.createObjectStore('todayAttendance', { keyPath: 'id' });
    store.createIndex('clientId', 'clientId', { unique: false });
    store.createIndex('date', 'date', { unique: false });
    store.createIndex('sessionDate', 'sessionDate', { unique: false });
  }

  // 3. todaySchedule store: keyPath 'id', indexes on 'date', 'coachId'
  if (!db.objectStoreNames.contains('todaySchedule')) {
    const store = db.createObjectStore('todaySchedule', { keyPath: 'id' });
    store.createIndex('date', 'date', { unique: false });
    store.createIndex('coachId', 'coachId', { unique: false });
  }

  // 4. packages store: keyPath 'id', indexes on 'name'
  if (!db.objectStoreNames.contains('packages')) {
    const store = db.createObjectStore('packages', { keyPath: 'id' });
    store.createIndex('name', 'name', { unique: false });
  }

  // 5. syncMeta store: keyPath 'key'
  if (!db.objectStoreNames.contains('syncMeta')) {
    db.createObjectStore('syncMeta', { keyPath: 'key' });
  }
}
