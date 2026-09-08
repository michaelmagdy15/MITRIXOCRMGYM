import { Package, SessionType } from '../types';

export interface Product extends Package {
  eligibilityRules?: string[]; // e.g., ["Must be new member", "Must be female"]
  cancellationWindowHours?: number; // Hours before session where cancellation is free
  freezeRules?: {
    allowed: boolean;
    maxDaysPerFreeze: number;
    maxFreezesPerYear: number;
  };
  services: SessionType[]; // What types of sessions this product grants access to
}

export type EntitlementStatus = 'pending' | 'active' | 'expired' | 'cancelled' | 'frozen';

export interface Entitlement {
  id: string;
  memberId: string;
  productId: string;
  productName: string;
  type: 'membership' | 'pt' | 'class' | 'nutrition';
  status: EntitlementStatus;
  sessionsTotal: number | 'unlimited';
  sessionsUsed: number;
  validFrom: string; // ISO string
  validUntil?: string; // ISO string
  paymentId?: string; // Links back to the payment that activated this
  createdAt: string; // ISO string
  frozenAt?: string; // ISO string
  unfreezeAt?: string; // ISO string
  tenantId?: string;
}

export type AdjustmentType = 'deduct' | 'refund' | 'credit' | 'freeze' | 'unfreeze' | 'extend';

export interface EntitlementAdjustment {
  id: string;
  entitlementId: string;
  type: AdjustmentType;
  amount: number; // Positive or negative depending on type (e.g. sessions deducted)
  reason: string;
  performedBy: string; // User ID
  createdAt: string; // ISO string
}
