import { getFirestore } from 'firebase-admin/firestore';
import { isStandaloneMode } from '../config/environment.js';
import { getDbForTenant } from '../utils/tenantDb.js';

function parseScheduleStartDate(cls: FirebaseFirestore.DocumentData): Date {
  const rawStart = String(cls.startTime || '').trim();
  if (rawStart.includes('T')) {
    const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawStart);
    return new Date(hasTz ? rawStart : `${rawStart}+02:00`);
  }
  const datePart = String(cls.date || '').trim();
  const timeSource = String(rawStart || cls.time || '00:00:00').trim();
  const normalizedTime = timeSource.length === 5 ? `${timeSource}:00` : timeSource;
  if (!datePart) return new Date(NaN);
  return new Date(`${datePart}T${normalizedTime}+02:00`);
}

/**
 * Replaces the legacy Cloud Function `sendClassReminders` (runs via Cloudflare Cron every 30 min).
 * Finds booked members whose class starts in 90–150 minutes, writes an in-app notification,
 * sends an Expo push notification if registered, and marks `reminderSent = true` idempotently.
 */
export async function runClassRemindersScan(): Promise<{ sentCount: number }> {
  const databases = isStandaloneMode()
    ? [getFirestore()]
    : [getDbForTenant('inzanathletics')];

  let totalSent = 0;

  for (const db of databases) {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() + 90 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + 150 * 60 * 1000);
      const today = now.toISOString().slice(0, 10);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const scheduleSnap = await db
        .collection('classSchedules')
        .where('date', 'in', [today, tomorrow])
        .get();

      for (const scheduleDoc of scheduleSnap.docs) {
        const cls = scheduleDoc.data();
        if (cls.status === 'cancelled') continue;
        const start = parseScheduleStartDate(cls);
        if (Number.isNaN(start.getTime()) || start < windowStart || start > windowEnd) continue;

        const bookingsSnap = await db
          .collection('classBookings')
          .where('classId', '==', scheduleDoc.id)
          .where('status', '==', 'booked')
          .get();

        for (const bookingDoc of bookingsSnap.docs) {
          const booking = bookingDoc.data();
          if (booking.reminderSent) continue;

          const clientId = String(booking.clientId || booking.memberId || '').trim();
          if (!clientId) continue;

          const title = 'Class reminder';
          const body = `${cls.name || booking.className || 'Your class'} starts at ${cls.time || cls.startTime || 'soon'}.`;
          const data = {
            bookingId: bookingDoc.id,
            classId: scheduleDoc.id,
            startsAt: start.toISOString(),
            url: '/member/classes',
          };

          try {
            await db.collection('clients').doc(clientId).collection('notifications').add({
              type: 'CLASS_REMINDER',
              title,
              body,
              read: false,
              createdAt: now.toISOString(),
              data,
            });

            const clientSnap = await db.collection('clients').doc(clientId).get();
            const token = clientSnap.exists ? clientSnap.data()?.expoPushToken : null;
            if (typeof token === 'string' && token.startsWith('ExponentPushToken')) {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: token,
                  title,
                  body,
                  sound: 'default',
                  priority: 'high',
                  channelId: 'member-alerts',
                  data,
                }),
                signal: AbortSignal.timeout(8000),
              }).catch((err) => {
                console.warn('[ClassReminders] Expo push warning:', err?.message || err);
              });
            }

            await bookingDoc.ref.set(
              {
                reminderSent: true,
                reminderSentAt: now.toISOString(),
              },
              { merge: true }
            );
            totalSent++;
          } catch (err) {
            console.error('[ClassReminders] Failed reminder for booking', bookingDoc.id, err);
          }
        }
      }
    } catch (dbErr) {
      console.error('[ClassReminders] Error scanning database:', dbErr);
    }
  }

  return { sentCount: totalSent };
}
