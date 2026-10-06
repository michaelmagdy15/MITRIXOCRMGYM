import { EquipmentItem, DepreciationSchedule, EquipmentStatus } from '../types/equipment';

/**
 * Computes straight-line asset depreciation according to standard GAAP/IFRS principles.
 */
export function computeStraightLineDepreciation(
  purchasePrice: number,
  salvageValue: number = 0,
  usefulLifeYears: number = 5,
  purchaseDateStr: string,
  asOfDate: Date = new Date()
): DepreciationSchedule {
  const purchaseDate = new Date(purchaseDateStr);
  const depreciableBase = Math.max(0, purchasePrice - salvageValue);
  const annualDepreciation = usefulLifeYears > 0 ? Math.round((depreciableBase / usefulLifeYears) * 100) / 100 : 0;

  if (isNaN(purchaseDate.getTime()) || asOfDate.getTime() <= purchaseDate.getTime()) {
    return {
      purchasePrice,
      salvageValue,
      usefulLifeYears,
      annualDepreciation,
      accumulatedDepreciation: 0,
      currentBookValue: purchasePrice,
      isFullyDepreciated: false
    };
  }

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsElapsed = (asOfDate.getTime() - purchaseDate.getTime()) / msPerYear;
  const rawAccumulated = annualDepreciation * yearsElapsed;
  const accumulatedDepreciation = Math.min(depreciableBase, Math.max(0, Math.round(rawAccumulated * 100) / 100));
  const currentBookValue = Math.max(salvageValue, Math.round((purchasePrice - accumulatedDepreciation) * 100) / 100);

  return {
    purchasePrice,
    salvageValue,
    usefulLifeYears,
    annualDepreciation,
    accumulatedDepreciation,
    currentBookValue,
    isFullyDepreciated: currentBookValue <= salvageValue
  };
}

/**
 * Evaluates whether equipment requires maintenance based on next service due date.
 */
export function evaluateEquipmentServiceStatus(
  item: EquipmentItem,
  asOfDateStr: string = new Date().toISOString().split('T')[0]!
): EquipmentStatus {
  if (item.status === 'UNDER_REPAIR' || item.status === 'DECOMMISSIONED') {
    return item.status;
  }

  if (item.nextServiceDueDate) {
    if (item.nextServiceDueDate <= asOfDateStr) {
      return 'MAINTENANCE_DUE';
    }
  }

  return 'OPERATIONAL';
}
