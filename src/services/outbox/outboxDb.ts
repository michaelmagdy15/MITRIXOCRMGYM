import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { OutboxEntry } from './outboxTypes';

export interface OutboxDBSchema extends DBSchema {
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: {
      status: string;
      tenantId: string;
      createdAtUtc: string;
    };
  };
}

const DB_NAME = 'mitrixogym_outbox';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OutboxDBSchema>> | null = null;
let customDbInstance: any = null;

/**
 * Sets a custom database instance (primarily for tests / mocked environments).
 */
export function setCustomOutboxDb(instance: any): void {
  customDbInstance = instance;
}

/**
 * Returns a connection to the persistent IndexedDB outbox store.
 */
export async function getOutboxDb(): Promise<IDBPDatabase<OutboxDBSchema>> {
  if (customDbInstance) {
    return customDbInstance;
  }

  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not supported in the current environment.');
  }

  if (!dbPromise) {
    dbPromise = openDB<OutboxDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', { keyPath: 'operationId' });
          store.createIndex('status', 'status');
          store.createIndex('tenantId', 'tenantId');
          store.createIndex('createdAtUtc', 'createdAtUtc');
        }
      },
    });
  }

  return dbPromise;
}

/**
 * Puts or updates an outbox entry.
 */
export async function saveOutboxEntry(entry: OutboxEntry): Promise<void> {
  const db = await getOutboxDb();
  await db.put('outbox', entry);
}

/**
 * Retrieves a single outbox entry by its operationId.
 */
export async function getOutboxEntry(operationId: string): Promise<OutboxEntry | undefined> {
  const db = await getOutboxDb();
  return db.get('outbox', operationId);
}

/**
 * Deletes an outbox entry by its operationId.
 */
export async function deleteOutboxEntry(operationId: string): Promise<void> {
  const db = await getOutboxDb();
  await db.delete('outbox', operationId);
}

/**
 * Retrieves all outbox entries currently stored.
 */
export async function getAllOutboxEntries(): Promise<OutboxEntry[]> {
  const db = await getOutboxDb();
  return db.getAll('outbox');
}

/**
 * Retrieves all outbox entries for a specific tenant.
 */
export async function getOutboxEntriesByTenant(tenantId: string): Promise<OutboxEntry[]> {
  const db = await getOutboxDb();
  return db.getAllFromIndex('outbox', 'tenantId', tenantId);
}

/**
 * Clears all entries from the outbox store.
 */
export async function clearOutboxStore(): Promise<void> {
  const db = await getOutboxDb();
  await db.clear('outbox');
}
