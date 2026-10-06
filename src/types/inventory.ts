export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type MovementType = 'RECEIVE' | 'SALE' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN';

export interface InventorySupplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  categories: string[]; // e.g. ["Beverages", "Gloves", "Supplements"]
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  tenantId?: string;
}

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  category: string; // e.g. 'Beverages' | 'Supplements' | 'Apparel' | 'Boxing Equipment' | 'Accessories'
  supplierId?: string;
  supplierName?: string;
  costPrice: number;
  retailPrice: number;
  stockQuantity: number;
  minThreshold: number; // Alerts when stock <= minThreshold
  unit: string; // e.g. 'pcs', 'bottle', 'can', 'kg'
  branch?: string;
  status: StockStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  quantityChange: number; // positive for receive/return, negative for sale/damage/deduct
  quantityBefore: number;
  quantityAfter: number;
  unitCost?: number;
  retailPrice?: number;
  reason?: string;
  referenceId?: string; // Receipt #, invoice #, PO #
  recordedBy: string; // user UID
  recordedByName: string;
  timestamp: string; // ISO
  tenantId?: string;
}
