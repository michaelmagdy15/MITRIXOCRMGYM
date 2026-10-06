import { doc, runTransaction, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { calculatePTBalanceTransition, ClientPTSnapshot, PTSessionSnapshot } from '../utils/ptAttendance';
import { addAuditLog } from './auditService';
import { cleanData } from '../utils';

export interface UpdatePTSessionOptions {
  authorName?: string;
  authorId?: string;
  reason?: string;
}

/**
 * Atomically updates a PT session's status and applies token deductions or restorations
 * to the client profile, package array, and active entitlements.
 */
export async function updatePTSessionStatus(
  sessionId: string,
  newStatus: 'Scheduled' | 'Attended' | 'No Show' | 'Cancelled' | 'Rescheduled',
  options: UpdatePTSessionOptions = {}
): Promise<{ actionTaken: string; reason: string }> {
  const sessionRef = doc(db, 'sessions', sessionId);
  const now = new Date();
  const nowIso = now.toISOString();

  let actionTaken = 'unchanged';
  let reasonMsg = '';
  let clientId = '';
  let clientName = '';

  await runTransaction(db, async (transaction) => {
    // 1. Read session doc
    const sessionSnap = await transaction.get(sessionRef);
    if (!sessionSnap.exists()) {
      throw new Error(`PT Session ${sessionId} not found`);
    }
    const sessionData = sessionSnap.data() as PTSessionSnapshot;
    clientId = sessionData.clientId;

    // 2. Read client doc
    const clientRef = doc(db, 'clients', clientId);
    const clientSnap = await transaction.get(clientRef);
    if (!clientSnap.exists()) {
      throw new Error(`Client ${clientId} not found for session ${sessionId}`);
    }
    const clientData = clientSnap.data() as ClientPTSnapshot;
    clientName = clientData.name || clientId;

    // 3. Compute balance transition
    const transition = calculatePTBalanceTransition(sessionData, newStatus, clientData, now);
    actionTaken = transition.actionTaken;
    reasonMsg = transition.reason;

    // 4. Update client if balances changed
    if (Object.keys(transition.clientUpdates).length > 0) {
      transaction.update(clientRef, cleanData({
        ...transition.clientUpdates,
        lastContactDate: nowIso,
        updatedAt: nowIso
      }));

      // Add a client comment logging the attendance event
      const commentRef = doc(collection(db, 'clients', clientId, 'comments'));
      transaction.set(commentRef, {
        text: `Private Session: ${newStatus} (${transition.reason})`,
        date: nowIso,
        author: options.authorName || 'Staff'
      });
    }

    // 5. Update session doc
    const sessionUpdates: Record<string, any> = {
      status: newStatus,
      updatedAt: nowIso,
      statusChangedAt: nowIso,
      statusChangedBy: options.authorName || options.authorId || 'Staff'
    };
    if (newStatus === 'Attended') {
      sessionUpdates.attendedAt = nowIso;
    } else if (newStatus === 'No Show') {
      sessionUpdates.noShowAt = nowIso;
    } else if (newStatus === 'Cancelled') {
      sessionUpdates.cancelledAt = nowIso;
      if (options.reason) {
        sessionUpdates.cancellationReason = options.reason;
      }
    }

    transaction.update(sessionRef, cleanData(sessionUpdates));
  });

  // 6. Audit log outside transaction
  await addAuditLog(
    'UPDATE',
    'SESSION',
    sessionId,
    `Updated PT session for ${clientName} to "${newStatus}". Action: ${actionTaken} (${reasonMsg})`,
    options.authorName
  );

  return { actionTaken, reason: reasonMsg };
}
