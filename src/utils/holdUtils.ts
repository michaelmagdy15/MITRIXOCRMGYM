import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Payment, Client } from '../types';
import { addAuditLog } from '../services/auditService';

/**
 * Place a payment/package on hold and update client status
 */
export const holdPayment = async (
  paymentId: string,
  clientId: string,
  clientName: string,
  reason: string,
  userId: string,
  userName: string
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'payments', paymentId), {
      isOnHold: true,
      holdReason: reason,
      holdDate: new Date().toISOString(),
      heldBy: userId,
    });

    // Update client status to "Hold"
    await updateDoc(doc(db, 'clients', clientId), {
      status: 'Hold',
    });

    await addAuditLog(
      'UPDATE',
      'PAYMENT',
      paymentId,
      `Placed on hold: "${reason}" for ${clientName}`,
      userName
    );
  } catch (error) {
    console.error('Error holding payment:', error);
    throw error;
  }
};

/**
 * Release a payment/package from hold and update client status if applicable
 */
export const releasePayment = async (
  paymentId: string,
  clientId: string,
  clientName: string,
  userId: string,
  userName: string
): Promise<void> => {
  try {
    await updateDoc(doc(db, 'payments', paymentId), {
      isOnHold: false,
      holdReason: undefined,
      holdDate: undefined,
      heldBy: undefined,
    });

    // Check if there are any other held payments for this client
    const clientRef = doc(db, 'clients', clientId);
    const clientSnapshot = await getDoc(clientRef);
    const client = clientSnapshot.data() as Client | undefined;

    if (client && client.status === 'Hold') {
      // Restore client to Active status
      await updateDoc(clientRef, {
        status: 'Active',
      });
    }

    await addAuditLog(
      'UPDATE',
      'PAYMENT',
      paymentId,
      `Released from hold for ${clientName}`,
      userName
    );
  } catch (error) {
    console.error('Error releasing payment:', error);
    throw error;
  }
};

/**
 * Get hold status display info
 */
export const getHoldStatusInfo = (payment: Partial<Payment>) => {
  if (!payment.isOnHold) {
    return {
      isHeld: false,
      badgeColor: '',
      badgeLabel: '',
      tooltip: '',
    };
  }

  return {
    isHeld: true,
    badgeColor: 'bg-yellow-500',
    badgeLabel: 'HOLD',
    tooltip: payment.holdReason ? `Reason: ${payment.holdReason}` : 'On hold',
  };
};
