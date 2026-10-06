import assert from 'assert';
import { computeStockStatus } from './inventoryService';
import { InventoryProduct, InventoryMovement, MovementType } from '../types/inventory';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

/**
 * In-memory Inventory Transaction Simulator
 */
class InventorySimulator {
  public products = new Map<string, InventoryProduct>();
  public movements: InventoryMovement[] = [];

  recordMovement(params: {
    productId: string;
    type: MovementType;
    quantityChange: number;
    reason?: string;
  }) {
    const prod = this.products.get(params.productId);
    if (!prod) throw new Error('Product not found');

    const currentQty = prod.stockQuantity;
    const newQty = currentQty + params.quantityChange;

    if (params.type === 'SALE' && newQty < 0) {
      throw new Error(`Insufficient stock for "${prod.name}". Available: ${currentQty}, Requested: ${Math.abs(params.quantityChange)}`);
    }

    const newStatus = computeStockStatus(newQty, prod.minThreshold);
    prod.stockQuantity = newQty;
    prod.status = newStatus;
    this.products.set(params.productId, prod);

    const mov: InventoryMovement = {
      id: `mov_${Math.random().toString(36).substring(2, 9)}`,
      productId: params.productId,
      productName: prod.name,
      type: params.type,
      quantityChange: params.quantityChange,
      quantityBefore: currentQty,
      quantityAfter: newQty,
      recordedBy: 'staff_1',
      recordedByName: 'Front Desk Lead',
      timestamp: new Date().toISOString()
    };
    this.movements.push(mov);
    return mov;
  }
}

async function runTests() {
  console.log('Running Inventory & Supplier unit tests...');

  // Test 1: Stock Status computation
  await test('1. Status transitions correctly between IN_STOCK, LOW_STOCK, and OUT_OF_STOCK', () => {
    assert.strictEqual(computeStockStatus(0, 5), 'OUT_OF_STOCK');
    assert.strictEqual(computeStockStatus(-2, 5), 'OUT_OF_STOCK');
    assert.strictEqual(computeStockStatus(4, 5), 'LOW_STOCK');
    assert.strictEqual(computeStockStatus(5, 5), 'LOW_STOCK');
    assert.strictEqual(computeStockStatus(6, 5), 'IN_STOCK');
    assert.strictEqual(computeStockStatus(100, 10), 'IN_STOCK');
  });

  // Test 2: Receiving Inventory increases stock and updates status
  await test('2. Receiving stock updates quantity and clears low-stock status', () => {
    const sim = new InventorySimulator();
    sim.products.set('p1', {
      id: 'p1',
      sku: 'GLV-12OZ',
      name: 'Inzan Pro Boxing Gloves 12oz',
      category: 'Boxing Equipment',
      costPrice: 800,
      retailPrice: 1200,
      stockQuantity: 2,
      minThreshold: 5,
      unit: 'pairs',
      status: 'LOW_STOCK',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const m = sim.recordMovement({
      productId: 'p1',
      type: 'RECEIVE',
      quantityChange: 10,
      reason: 'Shipment from Supplier Alpha'
    });

    assert.strictEqual(m.quantityBefore, 2);
    assert.strictEqual(m.quantityAfter, 12);
    assert.strictEqual(sim.products.get('p1')?.stockQuantity, 12);
    assert.strictEqual(sim.products.get('p1')?.status, 'IN_STOCK');
  });

  // Test 3: Selling Inventory deducts stock
  await test('3. Selling stock deducts quantity and flags low stock when threshold is reached', () => {
    const sim = new InventorySimulator();
    sim.products.set('p2', {
      id: 'p2',
      sku: 'WTR-750',
      name: 'Mineral Water 750ml',
      category: 'Beverages',
      costPrice: 5,
      retailPrice: 15,
      stockQuantity: 7,
      minThreshold: 5,
      unit: 'bottles',
      status: 'IN_STOCK',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    sim.recordMovement({
      productId: 'p2',
      type: 'SALE',
      quantityChange: -3
    });

    assert.strictEqual(sim.products.get('p2')?.stockQuantity, 4);
    assert.strictEqual(sim.products.get('p2')?.status, 'LOW_STOCK');
  });

  // Test 4: Overselling rejection
  await test('4. Overselling attempts exceeding stock are rejected without altering balance', () => {
    const sim = new InventorySimulator();
    sim.products.set('p3', {
      id: 'p3',
      sku: 'PRO-WHEY',
      name: 'Gold Standard Whey 2kg',
      category: 'Supplements',
      costPrice: 1500,
      retailPrice: 2200,
      stockQuantity: 1,
      minThreshold: 2,
      unit: 'tubs',
      status: 'LOW_STOCK',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    let errCaught = false;
    try {
      sim.recordMovement({
        productId: 'p3',
        type: 'SALE',
        quantityChange: -2 // Trying to sell 2 when only 1 is available!
      });
    } catch (e: any) {
      errCaught = true;
      assert.ok(e.message.includes('Insufficient stock'));
    }

    assert.strictEqual(errCaught, true);
    assert.strictEqual(sim.products.get('p3')?.stockQuantity, 1);
    assert.strictEqual(sim.movements.length, 0); // No movement logged on failure
  });

  console.log('All Inventory & Supplier unit tests passed successfully! ✅\n');
}

runTests();
