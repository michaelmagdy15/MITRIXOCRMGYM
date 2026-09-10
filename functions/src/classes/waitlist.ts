import { onDocumentUpdated, FirestoreEvent, QueryDocumentSnapshot, Change } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

// Waitlist promotion for Inzan Athletics database
export const onBookingCancelled = onDocumentUpdated(
  { 
    document: "classBookings/{bookingId}",
    database: "db-inzanathletics" 
  }, 
  async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, { bookingId: string }>) => {
    
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    // We only care if a booking goes from 'booked' to 'cancelled'
    if (beforeData.status === 'booked' && afterData.status === 'cancelled') {
      const scheduleId = afterData.scheduleId || afterData.classId;
      if (!scheduleId) {
        logger.warn(`[waitlist] No scheduleId or classId found on booking ${event.params.bookingId}`);
        return;
      }
      logger.info(`Booking ${event.params.bookingId} cancelled for schedule ${scheduleId}. Checking waitlist...`);

      const tenantDb = getFirestore("db-inzanathletics");

      try {
        await tenantDb.runTransaction(async (transaction) => {
          const scheduleRef = tenantDb.collection("classSchedules").doc(scheduleId);
          const scheduleDoc = await transaction.get(scheduleRef);

          if (!scheduleDoc.exists) {
            logger.warn(`Schedule ${scheduleId} not found.`);
            return;
          }

          const scheduleData = scheduleDoc.data() || {};
          const capacity = scheduleData.capacity || 0;
          const attendees: string[] = Array.isArray(scheduleData.attendees) ? [...scheduleData.attendees] : [];
          const waitlist: string[] = Array.isArray(scheduleData.waitlist) ? [...scheduleData.waitlist] : [];

          // Remove cancelling user from attendees array if present
          const cancellingUserId = afterData.clientId || afterData.memberId;
          if (cancellingUserId) {
            const idx = attendees.indexOf(cancellingUserId);
            if (idx > -1) {
              attendees.splice(idx, 1);
            }
          }

          // 2-Hour Cutoff check from INZAN PRD
          const startTimeStr = scheduleData.startTime || scheduleData.date;
          if (startTimeStr) {
            const classStartMs = new Date(startTimeStr).getTime();
            const twoHoursMs = 2 * 60 * 60 * 1000;
            if (!isNaN(classStartMs) && (classStartMs - Date.now()) < twoHoursMs) {
              logger.info(`[waitlist] Class ${scheduleId} starts in less than 2 hours. Automated waitlist promotion halted.`);
              transaction.update(scheduleRef, {
                attendees,
                updatedAt: new Date().toISOString()
              });
              return;
            }
          }

          // Check if there is capacity to promote someone
          // If attendees are already >= capacity (e.g. server already promoted someone), do not promote another
          if (attendees.length >= capacity) {
            logger.info(`Class ${scheduleId} already at capacity (${attendees.length}/${capacity}). No promotion needed.`);
            transaction.update(scheduleRef, {
              attendees,
              updatedAt: new Date().toISOString()
            });
            return;
          }

          // Query waitlist in classBookings
          const waitlistQuery = tenantDb.collection("classBookings")
            .where("classId", "==", scheduleId);

          const waitlistDocs = await transaction.get(waitlistQuery);
          const eligibleWaitlist = waitlistDocs.docs
            .filter(d => {
              const st = d.data().status;
              return st === 'waitlist' || st === 'waitlisted';
            })
            .sort((a, b) => {
              const aTime = a.data().bookedAt || a.data().createdAt || '';
              const bTime = b.data().bookedAt || b.data().createdAt || '';
              return aTime.localeCompare(bTime);
            });

          if (eligibleWaitlist.length === 0) {
            logger.info(`No eligible users on waitlist for schedule ${scheduleId}.`);
            transaction.update(scheduleRef, {
              attendees,
              updatedAt: new Date().toISOString()
            });
            return;
          }

          const firstWaitlistDoc = eligibleWaitlist[0];
          const promotedUser = firstWaitlistDoc.data();
          const promotedUserId = promotedUser.clientId || promotedUser.memberId || promotedUser.userId;

          logger.info(`Promoting user ${promotedUserId} from waitlist to booked for schedule ${scheduleId}.`);

          // Update the promoted booking doc
          transaction.update(firstWaitlistDoc.ref, {
            status: "booked",
            promotedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          // Update schedule document arrays
          if (promotedUserId) {
            const wIdx = waitlist.indexOf(promotedUserId);
            if (wIdx > -1) waitlist.splice(wIdx, 1);
            if (!attendees.includes(promotedUserId)) {
              attendees.push(promotedUserId);
            }
          }

          transaction.update(scheduleRef, {
            attendees,
            waitlist,
            updatedAt: new Date().toISOString()
          });
        });
      } catch (error) {
        logger.error("Error processing waitlist promotion:", error);
      }
    }
  }
);
