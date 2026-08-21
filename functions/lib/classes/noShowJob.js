"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processNoShows = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const firestore_1 = require("firebase-admin/firestore");
const admin = __importStar(require("firebase-admin"));
// Run every 15 minutes to check for no-shows
exports.processNoShows = (0, scheduler_1.onSchedule)("*/15 * * * *", async (event) => {
    logger.info("[processNoShows] Starting no-show job for Inzan Athletics...");
    const tenantDb = (0, firestore_1.getFirestore)("db-inzanathletics");
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
            if (unverifiedBookingsSnapshot.empty)
                continue;
            const batch = tenantDb.batch();
            for (const bookingDoc of unverifiedBookingsSnapshot.docs) {
                // Mark as no-show
                batch.update(bookingDoc.ref, { status: "no-show" });
                noShowCount++;
                // Add a strike to the member (using a new 'strikes' subcollection or field)
                const memberId = bookingDoc.data().memberId;
                if (memberId) {
                    const clientRef = tenantDb.collection("clients").doc(memberId);
                    // Increment the no-show strikes count
                    batch.update(clientRef, {
                        noShowStrikes: admin.firestore.FieldValue.increment(1),
                        lastNoShowAt: new Date().toISOString()
                    });
                }
            }
            await batch.commit();
            logger.info(`[processNoShows] Processed ${unverifiedBookingsSnapshot.size} no-shows for schedule ${scheduleId}`);
        }
        logger.info(`[processNoShows] Job completed. Total no-shows marked: ${noShowCount}`);
    }
    catch (error) {
        logger.error("[processNoShows] Error processing no-shows:", error);
    }
});
//# sourceMappingURL=noShowJob.js.map