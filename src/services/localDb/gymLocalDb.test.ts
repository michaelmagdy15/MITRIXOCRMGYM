import assert from 'assert';
import {
  LOCAL_DB_NAME,
  LOCAL_DB_VERSION,
  LOCAL_DB_STORES,
  getDbNameForTenant,
  upgradeLocalDb
} from './schema';
import * as gymLocalDb from './gymLocalDb';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function runTests() {
  console.log('Running LocalDB & Schema tests...');

  // Test 1: Database name & version constants
  await test('1. Schema constants match requirements', () => {
    assert.strictEqual(LOCAL_DB_NAME, 'mitrixogym_local_db');
    assert.strictEqual(LOCAL_DB_VERSION, 1);
  });

  // Test 2: Tenant namespacing logic
  await test('2. Tenant namespacing generates correct DB name prefix', () => {
    assert.strictEqual(getDbNameForTenant('strike'), 'mitrixo_strike_db');
    assert.strictEqual(getDbNameForTenant('inzanathletics'), 'mitrixo_inzanathletics_db');
    assert.strictEqual(getDbNameForTenant('demo_gym'), 'mitrixo_demo_gym_db');
    assert.strictEqual(getDbNameForTenant(''), 'mitrixogym_local_db');
    assert.strictEqual(getDbNameForTenant(undefined), 'mitrixogym_local_db');
  });

  // Test 3: Object store names
  await test('3. Schema defines all required stores', () => {
    assert.strictEqual(LOCAL_DB_STORES.MEMBERS, 'members');
    assert.strictEqual(LOCAL_DB_STORES.TODAY_ATTENDANCE, 'todayAttendance');
    assert.strictEqual(LOCAL_DB_STORES.TODAY_SCHEDULE, 'todaySchedule');
    assert.strictEqual(LOCAL_DB_STORES.PACKAGES, 'packages');
    assert.strictEqual(LOCAL_DB_STORES.SYNC_META, 'syncMeta');
  });

  // Test 4: Upgrade logic schema verification
  await test('4. upgradeLocalDb provisions all stores, keypaths, and indexes correctly', () => {
    const createdStores: Record<string, { keyPath?: string; indexes: Record<string, { unique?: boolean }> }> = {};

    const mockDb: any = {
      objectStoreNames: {
        contains: (name: string) => Boolean(createdStores[name])
      },
      createObjectStore: (name: string, options?: { keyPath?: string }) => {
        createdStores[name] = { keyPath: options?.keyPath, indexes: {} };
        return {
          createIndex: (indexName: string, _keyPath: string, indexOptions?: { unique?: boolean }) => {
            createdStores[name].indexes[indexName] = indexOptions || {};
          }
        };
      }
    };

    upgradeLocalDb(mockDb);

    // members store
    assert(createdStores.members, 'members store must be created');
    assert.strictEqual(createdStores.members.keyPath, 'id', 'members keyPath must be "id"');
    const memberIndexes = Object.keys(createdStores.members.indexes);
    ['phone', 'normalizedPhone', 'name', 'status', 'updatedAt', 'memberId'].forEach((idx) => {
      assert(memberIndexes.includes(idx), `members must have index "${idx}"`);
    });

    // todayAttendance store
    assert(createdStores.todayAttendance, 'todayAttendance store must be created');
    assert.strictEqual(createdStores.todayAttendance.keyPath, 'id', 'todayAttendance keyPath must be "id"');
    const attIndexes = Object.keys(createdStores.todayAttendance.indexes);
    ['clientId', 'date', 'sessionDate'].forEach((idx) => {
      assert(attIndexes.includes(idx), `todayAttendance must have index "${idx}"`);
    });

    // todaySchedule store
    assert(createdStores.todaySchedule, 'todaySchedule store must be created');
    assert.strictEqual(createdStores.todaySchedule.keyPath, 'id', 'todaySchedule keyPath must be "id"');
    const schedIndexes = Object.keys(createdStores.todaySchedule.indexes);
    ['date', 'coachId'].forEach((idx) => {
      assert(schedIndexes.includes(idx), `todaySchedule must have index "${idx}"`);
    });

    // packages store
    assert(createdStores.packages, 'packages store must be created');
    assert.strictEqual(createdStores.packages.keyPath, 'id', 'packages keyPath must be "id"');
    const pkgIndexes = Object.keys(createdStores.packages.indexes);
    assert(pkgIndexes.includes('name'), 'packages must have index "name"');

    // syncMeta store
    assert(createdStores.syncMeta, 'syncMeta store must be created');
    assert.strictEqual(createdStores.syncMeta.keyPath, 'key', 'syncMeta keyPath must be "key"');
  });

  // Test 5: Exported function signatures in gymLocalDb
  await test('5. gymLocalDb exports all requested API functions', () => {
    assert.strictEqual(typeof gymLocalDb.saveMembers, 'function');
    assert.strictEqual(typeof gymLocalDb.getMemberById, 'function');
    assert.strictEqual(typeof gymLocalDb.searchMembersLocal, 'function');
    assert.strictEqual(typeof gymLocalDb.saveTodayAttendance, 'function');
    assert.strictEqual(typeof gymLocalDb.recordLocalAttendance, 'function');
    assert.strictEqual(typeof gymLocalDb.getTodayAttendanceForClient, 'function');
    assert.strictEqual(typeof gymLocalDb.savePackages, 'function');
    assert.strictEqual(typeof gymLocalDb.getPackages, 'function');
    assert.strictEqual(typeof gymLocalDb.getSyncCursor, 'function');
    assert.strictEqual(typeof gymLocalDb.setSyncCursor, 'function');
  });

  console.log('\nAll LocalDB & Schema tests passed successfully!\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
