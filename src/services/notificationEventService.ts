import { collection, addDoc, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db, getTenantId } from '../firebase';
import { cleanData } from '../utils';
import {
  NotificationEventType,
  NotificationDeliveryLog,
  NotificationEventParams,
  NotificationDeliveryStatus,
  NotificationChannel
} from '../types/notificationEvent';

/**
 * Renders standard title and message text for all Inzan PRD Section 15 events.
 */
export function renderNotificationContent(
  eventType: NotificationEventType,
  data: NotificationEventParams['data']
): { title: string; body: string } {
  switch (eventType) {
    case 'booking_confirmed':
      return {
        title: 'Booking Confirmed',
        body: `Your booking for ${data.serviceName || 'Session'} on ${data.date || 'the scheduled date'}${data.time ? ` at ${data.time}` : ''}${data.coachName ? ` with ${data.coachName}` : ''} has been confirmed.`
      };

    case 'session_reminder_48h':
      return {
        title: 'Session Reminder (48 Hours)',
        body: `Reminder: You have an upcoming ${data.serviceName || 'session'} scheduled on ${data.date || 'soon'}${data.time ? ` at ${data.time}` : ''}. Please reschedule at least 24 hours in advance if needed.`
      };

    case 'session_cancelled_24h':
      return {
        title: 'Booking Cancelled',
        body: `Your booking for ${data.serviceName || 'session'} on ${data.date || 'the scheduled date'} has been cancelled.${data.reason ? ` Reason: ${data.reason}` : ''}`
      };

    case 'waitlist_promoted':
      return {
        title: 'Promoted from Waitlist! 🎉',
        body: `A slot opened up! You have been confirmed for ${data.serviceName || 'Class'} on ${data.date || 'the scheduled date'}${data.time ? ` at ${data.time}` : ''}.`
      };

    case 'instructor_cancelled':
      return {
        title: 'Class Cancelled by Gym',
        body: `Notice: ${data.serviceName || 'Class'} on ${data.date || 'the scheduled date'} was cancelled by management. Your session token has been automatically refunded.`
      };

    case 'payment_confirmed':
      return {
        title: 'Payment Received',
        body: `Thank you! Your payment of ${data.amount ? `${data.amount.toLocaleString()} LE` : 'the requested amount'} for ${data.serviceName || 'Package'} has been confirmed.`
      };

    case 'membership_expiring':
      return {
        title: 'Membership Expiring Soon',
        body: `Your gym membership will expire on ${data.expiryDate || 'soon'}. Renew today to continue booking your favorite sessions.`
      };

    case 'pt_balance_low':
      return {
        title: 'PT Session Balance Low',
        body: `You have ${data.sessionsRemaining ?? 1} session(s) remaining in your ${data.serviceName || 'PT package'}. Top up with your coach or front desk.`
      };

    case 'lead_followup_due':
      return {
        title: 'Lead Follow-up Due',
        body: `Action required: Follow up with ${data.clientName || 'prospect'} regarding ${data.serviceName || 'membership inquiry'}.`
      };

    case 'frontdesk_fully_booked':
      return {
        title: 'High Capacity Alert',
        body: `Peak capacity alert: Hour ${data.time || ''} on ${data.date || 'today'} at ${data.branch || 'gym'} is now 100% fully booked.`
      };

    case 'frontdesk_repeated_noshow':
      return {
        title: 'Repeated No-Show Alert',
        body: `Member ${data.clientName || ''} (ID: ${data.clientId || ''}) has recorded multiple no-shows. Policy action may be required.`
      };

    default:
      return {
        title: 'Inzan Gym Notification',
        body: 'You have a new update from Inzan Athletics.'
      };
  }
}

/**
 * Dispatches a transactional notification across requested channels and writes an immutable delivery log.
 */
export async function dispatchNotificationEvent(
  params: NotificationEventParams,
  firestoreDb = db
): Promise<NotificationDeliveryLog> {
  const channels: NotificationChannel[] = params.channels && params.channels.length > 0
    ? params.channels
    : ['in_app'];

  const { title, body } = renderNotificationContent(params.eventType, params.data);
  const now = new Date().toISOString();
  const tenantId = getTenantId();

  // 1. Idempotency check: if idempotencyKey already delivered, return existing log
  if (params.idempotencyKey) {
    try {
      const q = query(
        collection(firestoreDb, 'notificationDeliveryLogs'),
        where('idempotencyKey', '==', params.idempotencyKey)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const existing = snap.docs[0]?.data() as NotificationDeliveryLog;
        console.warn(`[NotificationService] IdempotencyKey ${params.idempotencyKey} already delivered. Skipping duplicate.`);
        return {
          ...existing,
          status: 'skipped_duplicate'
        };
      }
    } catch (err) {
      console.warn('[NotificationService] Idempotency query error:', err);
    }
  }

  let finalStatus: NotificationDeliveryStatus = 'delivered';
  let failureReason: string | undefined = undefined;

  // 2. Dispatch Channels
  for (const channel of channels) {
    if (channel === 'in_app') {
      try {
        await addDoc(collection(firestoreDb, 'notifications'), cleanData({
          recipientId: params.recipientId,
          clientId: params.recipientId,
          recipientType: params.recipientType,
          title,
          message: body,
          type: params.eventType,
          read: false,
          data: params.data,
          tenantId,
          createdAt: now
        }));
      } catch (inAppErr: any) {
        console.error('[NotificationService] In-app notification write failed:', inAppErr);
        finalStatus = 'failed';
        failureReason = inAppErr?.message || 'In-app notification write failed';
      }
    }

    if (channel === 'push') {
      // Push via Expo proxy endpoint
      try {
        if (typeof window !== 'undefined' && 'fetch' in window) {
          await fetch('/api/proxy-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: params.recipientId,
              title,
              body,
              data: {
                eventType: params.eventType,
                ...params.data
              }
            })
          }).catch((e) => {
            console.warn('[NotificationService] Push delivery network warning:', e);
          });
        }
      } catch (pushErr: any) {
        console.warn('[NotificationService] Push delivery failed:', pushErr);
        // Secondary push failure does not fail the primary event
      }
    }
  }

  // 3. Write Delivery Log
  const logId = `log_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
  const deliveryLog: NotificationDeliveryLog = {
    id: logId,
    eventType: params.eventType,
    recipientId: params.recipientId,
    recipientType: params.recipientType,
    recipientName: params.recipientName,
    recipientEmail: params.recipientEmail,
    channels,
    title,
    body,
    metadata: params.data,
    status: finalStatus,
    sentAt: now,
    idempotencyKey: params.idempotencyKey,
    failureReason,
    tenantId
  };

  try {
    const logDocRef = doc(firestoreDb, 'notificationDeliveryLogs', logId);
    await setDoc(logDocRef, cleanData(deliveryLog));
  } catch (logErr) {
    console.error('[NotificationService] Failed to write delivery log:', logErr);
  }

  return deliveryLog;
}
