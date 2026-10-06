export type EquipmentCategory =
  | 'Cardio'
  | 'Strength'
  | 'Boxing Ring & Bags'
  | 'Recovery'
  | 'Facility';

export type EquipmentStatus =
  | 'OPERATIONAL'
  | 'MAINTENANCE_DUE'
  | 'UNDER_REPAIR'
  | 'DECOMMISSIONED';

export type MaintenanceType =
  | 'ROUTINE_PREVENTATIVE'
  | 'EMERGENCY_REPAIR'
  | 'INSPECTION'
  | 'PARTS_REPLACEMENT';

export interface EquipmentItem {
  id: string;
  serialNumber: string;
  name: string;
  category: EquipmentCategory;
  brand?: string;
  model?: string;
  locationZone?: string; // e.g. "Boxing Floor", "Cardio Zone", "Weight Room"
  branch?: string;
  purchaseDate: string; // YYYY-MM-DD
  purchasePrice: number; // in LE / EGP
  usefulLifeYears: number; // typically 3 - 7 years
  salvageValue?: number; // expected salvage at end of life
  currentBookValue?: number;
  warrantyExpiry?: string; // YYYY-MM-DD
  status: EquipmentStatus;
  lastServiceDate?: string; // YYYY-MM-DD
  nextServiceDueDate?: string; // YYYY-MM-DD
  serviceIntervalDays?: number; // e.g. 90 for quarterly service
  notes?: string;
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
}

export interface MaintenanceRecord {
  id: string;
  equipmentId: string;
  equipmentName: string;
  serviceDate: string; // YYYY-MM-DD
  serviceType: MaintenanceType;
  cost: number;
  vendorOrStaff: string;
  notes?: string;
  partsReplaced?: string[];
  nextServiceDate?: string;
  recordedBy: string; // User ID
  createdAt: string;
  tenantId?: string;
}

export interface DepreciationSchedule {
  purchasePrice: number;
  salvageValue: number;
  usefulLifeYears: number;
  annualDepreciation: number;
  accumulatedDepreciation: number;
  currentBookValue: number;
  isFullyDepreciated: boolean;
}
