import assert from 'assert';
import { computeStraightLineDepreciation, evaluateEquipmentServiceStatus } from './equipmentService';
import { EquipmentItem } from '../types/equipment';

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
  console.log('Running Equipment & Depreciation unit tests...');

  // Test 1: Day 0 depreciation
  await test('1. Asset on purchase date has zero accumulated depreciation and full book value', () => {
    const purchaseDate = '2026-01-01';
    const asOfDate = new Date('2026-01-01T00:00:00.000Z');
    const schedule = computeStraightLineDepreciation(100000, 10000, 5, purchaseDate, asOfDate);

    assert.strictEqual(schedule.purchasePrice, 100000);
    assert.strictEqual(schedule.salvageValue, 10000);
    assert.strictEqual(schedule.usefulLifeYears, 5);
    assert.strictEqual(schedule.annualDepreciation, 18000); // (100000 - 10000) / 5 = 18000
    assert.strictEqual(schedule.accumulatedDepreciation, 0);
    assert.strictEqual(schedule.currentBookValue, 100000);
    assert.strictEqual(schedule.isFullyDepreciated, false);
  });

  // Test 2: Exactly 1 year elapsed
  await test('2. Asset after 1 year reflects exact 1-year annual depreciation', () => {
    const purchaseDate = '2025-01-01T00:00:00.000Z';
    // 365.25 days = 1 year
    const asOfDate = new Date(new Date(purchaseDate).getTime() + 365.25 * 24 * 60 * 60 * 1000);
    const schedule = computeStraightLineDepreciation(50000, 5000, 5, purchaseDate, asOfDate);

    assert.strictEqual(schedule.annualDepreciation, 9000); // (50000 - 5000) / 5 = 9000
    assert.strictEqual(schedule.accumulatedDepreciation, 9000);
    assert.strictEqual(schedule.currentBookValue, 41000); // 50000 - 9000
    assert.strictEqual(schedule.isFullyDepreciated, false);
  });

  // Test 3: Fully depreciated asset caps at salvage value
  await test('3. Fully depreciated asset caps accumulated depreciation and does not fall below salvage value', () => {
    const purchaseDate = '2020-01-01T00:00:00.000Z';
    // 6 years elapsed for a 5-year asset
    const asOfDate = new Date(new Date(purchaseDate).getTime() + 6 * 365.25 * 24 * 60 * 60 * 1000);
    const schedule = computeStraightLineDepreciation(50000, 5000, 5, purchaseDate, asOfDate);

    assert.strictEqual(schedule.accumulatedDepreciation, 45000); // Depreciable base cap
    assert.strictEqual(schedule.currentBookValue, 5000); // Matches salvage value
    assert.strictEqual(schedule.isFullyDepreciated, true);
  });

  // Test 4: Maintenance status evaluation
  await test('4. Equipment status correctly evaluates maintenance due dates and preserved states', () => {
    const baseEquipment: EquipmentItem = {
      id: 'eq-1',
      serialNumber: 'INZ-BOX-001',
      name: 'Olympic Boxing Ring 20x20',
      category: 'Boxing Ring & Bags',
      purchaseDate: '2024-01-01',
      purchasePrice: 250000,
      usefulLifeYears: 7,
      status: 'OPERATIONAL',
      nextServiceDueDate: '2026-10-15',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    };

    // Before due date -> OPERATIONAL
    assert.strictEqual(evaluateEquipmentServiceStatus(baseEquipment, '2026-10-01'), 'OPERATIONAL');

    // On due date -> MAINTENANCE_DUE
    assert.strictEqual(evaluateEquipmentServiceStatus(baseEquipment, '2026-10-15'), 'MAINTENANCE_DUE');

    // Past due date -> MAINTENANCE_DUE
    assert.strictEqual(evaluateEquipmentServiceStatus(baseEquipment, '2026-10-20'), 'MAINTENANCE_DUE');

    // Preserves UNDER_REPAIR even if service date is in the future
    const underRepairItem: EquipmentItem = {
      ...baseEquipment,
      status: 'UNDER_REPAIR',
      nextServiceDueDate: '2026-11-01'
    };
    assert.strictEqual(evaluateEquipmentServiceStatus(underRepairItem, '2026-10-01'), 'UNDER_REPAIR');

    // Preserves DECOMMISSIONED
    const decommissionedItem: EquipmentItem = {
      ...baseEquipment,
      status: 'DECOMMISSIONED'
    };
    assert.strictEqual(evaluateEquipmentServiceStatus(decommissionedItem, '2026-10-01'), 'DECOMMISSIONED');
  });

  console.log('All Equipment & Depreciation unit tests passed successfully! ✅\n');
}

runTests();
