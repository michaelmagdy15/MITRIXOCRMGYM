import { collection, doc, runTransaction, getDoc, setDoc } from 'firebase/firestore';
import { db, getTenantId } from '../firebase';
import { cleanData } from '../utils';
import { addAuditLog } from './auditService';
import {
  InventoryProduct,
  InventorySupplier,
  InventoryMovement,
  MovementType,
  StockStatus
} from '../types/inventory';

/**
 * Calculates stock status based on current quantity and threshold.
 */
export function computeStockStatus(quantity: number, minThreshold: number): StockStatus {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity <= minThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export interface RecordMovementParams {
  productId: string;
  type: MovementType;
  quantityChange: number;
  reason?: string;
  referenceId?: string;
  recordedBy: string;
  recordedByName: string;
}

/**
 * Executes an atomic stock movement transaction in Firestore.
 * Prevents overselling by rejecting sales that exceed available stock.
 */
export async function executeStockMovement(
  params: RecordMovementParams,
  firestoreDb = db
): Promise<InventoryMovement> {
  const productRef = doc(firestoreDb, 'inventoryProducts', params.productId);
  const now = new Date().toISOString();
  const tenantId = getTenantId();

  return await runTransaction(firestoreDb, async (transaction) => {
    const prodSnap = await transaction.get(productRef);
    if (!prodSnap.exists()) {
      throw new Error(`Product ${params.productId} not found in inventory.`);
    }

    const prodData = prodSnap.data() as InventoryProduct;
    const currentQty = prodData.stockQuantity || 0;
    const newQty = currentQty + params.quantityChange;

    // Prevent negative inventory on sales / deductions
    if (params.type === 'SALE' && newQty < 0) {
      throw new Error(`Insufficient stock for "${prodData.name}". Available: ${currentQty}, Requested: ${Math.abs(params.quantityChange)}`);
    }

    const minThreshold = prodData.minThreshold ?? 5;
    const newStatus = computeStockStatus(newQty, minThreshold);

    // 1. Update Product
    transaction.update(productRef, cleanData({
      stockQuantity: newQty,
      status: newStatus,
      updatedAt: now
    }));

    // 2. Create Movement Record
    const movementRef = doc(collection(firestoreDb, 'inventoryMovements'));
    const movementData: InventoryMovement = {
      id: movementRef.id,
      productId: params.productId,
      productName: prodData.name,
      type: params.type,
      quantityChange: params.quantityChange,
      quantityBefore: currentQty,
      quantityAfter: newQty,
      unitCost: prodData.costPrice,
      retailPrice: prodData.retailPrice,
      reason: params.reason || undefined,
      referenceId: params.referenceId || undefined,
      recordedBy: params.recordedBy,
      recordedByName: params.recordedByName,
      timestamp: now,
      tenantId
    };

    transaction.set(movementRef, cleanData(movementData));
    return movementData;
  });
}
