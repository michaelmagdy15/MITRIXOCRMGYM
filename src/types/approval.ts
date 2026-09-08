export type ApprovalRequestType = 'cancellation' | 'class_cancellation' | 'pt_override' | 'discount' | 'refund' | 'balance_adjustment' | 'permission_change';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  type: ApprovalRequestType;
  status: ApprovalStatus;
  
  requesterId: string;
  requesterName: string;
  requesterRole: string;
  
  targetEntityId: string;
  targetEntityType: 'class' | 'session' | 'payment' | 'client' | 'user';
  
  details: Record<string, any>;
  reason: string;
  
  approverRole: string; // The minimum role required to approve this request (e.g. 'manager', 'admin')
  
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  
  createdAt: string;
}

// Payload specific types for details
export interface RefundDetails {
  paymentId: string;
  amount: number;
  refundMethod: string;
}

export interface ClassCancellationDetails {
  classId: string;
  instructorId: string;
  className: string;
  startTime: string;
}

export interface PtOverrideDetails {
  sessionId: string;
  clientId: string;
  originalStatus: string;
  newStatus: string;
}

export interface DiscountDetails {
  paymentId: string;
  originalAmount: number;
  discountPercentage: number;
  newAmount: number;
}

export interface BalanceAdjustmentDetails {
  entitlementId: string;
  clientId: string;
  adjustmentAmount: number; // positive or negative
  newTotal: number;
}

export interface PermissionChangeDetails {
  userId: string;
  oldRole: string;
  newRole: string;
}
