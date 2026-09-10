import { collection, addDoc, updateDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ApprovalRequest, ApprovalRequestType, ApprovalStatus } from '../types/approval';
import { addAuditLog } from './auditService';
import { cleanData } from '../utils';

/**
 * Create a new approval request
 */
export const createApprovalRequest = async (
  type: ApprovalRequestType,
  details: Record<string, any>,
  reason: string,
  requesterId: string,
  requesterName: string,
  requesterRole: string,
  targetEntityId: string,
  targetEntityType: 'class' | 'session' | 'payment' | 'client' | 'user',
  approverRole: string = 'manager'
): Promise<string> => {
  const requestData: Omit<ApprovalRequest, 'id'> = {
    type,
    status: 'pending',
    requesterId,
    requesterName,
    requesterRole,
    targetEntityId,
    targetEntityType,
    details,
    reason,
    approverRole,
    createdAt: new Date().toISOString()
  };

  const docRef = await addDoc(collection(db, 'approvalRequests'), cleanData(requestData));
  
  await addAuditLog(
    'CREATE', 
    'SYSTEM', 
    docRef.id, 
    `Created ${type} approval request targeting ${targetEntityType} ${targetEntityId}`,
    requesterName
  );
  
  return docRef.id;
};

/**
 * Approve a pending request and execute its side effects
 */
export const approveRequest = async (
  requestId: string,
  approverId: string,
  approverName: string
): Promise<void> => {
  const reqRef = doc(db, 'approvalRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  
  if (!reqSnap.exists()) {
    throw new Error('Approval request not found');
  }
  
  const request = reqSnap.data() as ApprovalRequest;
  
  if (request.status !== 'pending') {
    throw new Error(`Request is already ${request.status}`);
  }

  // Anti-self-approval rule (Enforce Two-Person Maker-Checker rule from PRD)
  if (request.requesterId && request.requesterId === approverId) {
    throw new Error('Maker cannot approve their own request. A secondary manager or General Manager must countersign.');
  }

  // 1. Execute specific logic based on type
  await executeApprovalSideEffects(request);

  // 2. Mark as approved
  await updateDoc(reqRef, {
    status: 'approved',
    approvedBy: approverId,
    approvedAt: new Date().toISOString(),
    updatedAt: serverTimestamp()
  });

  // 3. Audit log
  await addAuditLog(
    'UPDATE',
    'SYSTEM',
    requestId,
    `Approved ${request.type} request`,
    approverName
  );
};

/**
 * Reject a pending request
 */
export const rejectRequest = async (
  requestId: string,
  approverId: string,
  approverName: string,
  rejectionReason: string
): Promise<void> => {
  const reqRef = doc(db, 'approvalRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  
  if (!reqSnap.exists()) throw new Error('Request not found');
  
  await updateDoc(reqRef, {
    status: 'rejected',
    approvedBy: approverId,
    rejectionReason,
    updatedAt: serverTimestamp()
  });

  await addAuditLog(
    'UPDATE',
    'SYSTEM',
    requestId,
    `Rejected ${reqSnap.data().type} request. Reason: ${rejectionReason}`,
    approverName
  );
};

/**
 * Helper to execute the actual business logic for an approved request
 */
async function executeApprovalSideEffects(req: ApprovalRequest) {
  const { type, targetEntityId, details } = req;
  
  switch (type) {
    case 'class_cancellation':
      // Update classSchedules status to cancelled
      await updateDoc(doc(db, 'classSchedules', targetEntityId), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });
      break;

    case 'pt_override':
      // Update sessions status to newStatus
      if (details.newStatus) {
        await updateDoc(doc(db, 'sessions', targetEntityId), {
          status: details.newStatus,
          updatedAt: serverTimestamp()
        });
      }
      break;

    case 'discount':
      // Update payment amount
      if (details.newAmount !== undefined) {
        await updateDoc(doc(db, 'payments', targetEntityId), {
          amount: details.newAmount,
          isDiscounted: true,
          discountPercentage: details.discountPercentage,
          updatedAt: serverTimestamp()
        });
      }
      break;

    case 'refund':
      // Update payment status
      await updateDoc(doc(db, 'payments', targetEntityId), {
        status: 'Refunded',
        refundMethod: details.refundMethod || 'Cash',
        refundAmount: details.amount,
        updatedAt: serverTimestamp()
      });
      break;

    case 'balance_adjustment':
      // Update client's package remaining sessions
      // Note: In a real app this might require a transaction to read and update correctly
      const clientRef = doc(db, 'clients', targetEntityId);
      const clientSnap = await getDoc(clientRef);
      if (clientSnap.exists()) {
        const clientData = clientSnap.data();
        const pkgs = clientData.packages || [];
        const updatedPkgs = pkgs.map((p: any) => {
          if (p.id === details.entitlementId || p.packageId === details.entitlementId) {
            return { ...p, remainingSessions: details.newTotal };
          }
          return p;
        });
        await updateDoc(clientRef, {
          packages: updatedPkgs,
          updatedAt: serverTimestamp()
        });
      }
      break;

    case 'permission_change':
      // Update user role
      if (details.newRole) {
        await updateDoc(doc(db, 'users', targetEntityId), {
          role: details.newRole,
          updatedAt: serverTimestamp()
        });
      }
      break;

    default:
      console.warn(`No side-effects configured for approval type: ${type}`);
  }
}
