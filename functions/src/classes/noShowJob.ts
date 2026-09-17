import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

// Run every 15 minutes to check for no-shows
export const processNoShows = onSchedule("*/15 * * * *", async (event) => {
  logger.info("[processNoShows] Starting no-show job for Inzan Athletics...");

  const tenantDb = getFirestore("db-inzanathletics");
  
  try {
    const now = new Date();
    // We check classes that started at least 10 minutes ago, but not more than 2 hours ago (to limit query)
    const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    const activeClassesSnapshot = await tenantDb.collection("classSchedules")
      .where("status", "==", "active")
      .where("startTime", "<=", tenMinsAgo)
      .where("startTime", ">=", twoHoursAgo)
      .get();

    if (activeClassesSnapshot.empty) {
      logger.info("[processNoShows] No recently started classes found.");
      return;
    }

    let noShowCount = 0;

    // Process each class
    for (const scheduleDoc of activeClassesSnapshot.docs) {
      const scheduleId = scheduleDoc.id;
      
      // Find all bookings for this class that are still "booked" (not checked in)
      const unverifiedBookingsSnapshot = await tenantDb.collection("classBookings")
        .where("classId", "==", scheduleId)
        .where("status", "==", "booked")
        .get();
        
      if (unverifiedBookingsSnapshot.empty) continue;

      const batch = tenantDb.batch();
      
      for (const bookingDoc of unverifiedBookingsSnapshot.docs) {
        // Mark as no-show
        batch.update(bookingDoc.ref, { status: "no-show" });
        noShowCount++;

        // Add a strike to the member and enforce lockout if strikes exceed threshold
        const memberId = bookingDoc.data().memberId;
        if (memberId) {
          const clientRef = tenantDb.collection("clients").doc(memberId);
          const clientDoc = await clientRef.get();
          const currentStrikes = (clientDoc.data()?.noShowStrikes || 0) + 1;
          const updateData: Record<string, any> = {
            noShowStrikes: currentStrikes,
            lastNoShowAt: new Date().toISOString()
          };
          if (currentStrikes >= 3) {
            // Lock out bookings for 7 days
            const blockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            updateData.bookingBlockedUntil = blockedUntil;
            logger.info(`[processNoShows] Member ${memberId} reached ${currentStrikes} no-show strikes. Booking blocked until ${blockedUntil}`);
          }
          batch.update(clientRef, updateData);
        }
      }
      
      await batch.commit();
      logger.info(`[processNoShows] Processed ${unverifiedBookingsSnapshot.size} no-shows for schedule ${scheduleId}`);
    }

    logger.info(`[processNoShows] Job completed. Total no-shows marked: ${noShowCount}`);
  } catch (error) {
    logger.error("[processNoShows] Error processing no-shows:", error);
  }
});
