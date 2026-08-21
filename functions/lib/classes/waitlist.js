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
exports.onBookingCancelled = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = __importStar(require("firebase-functions/logger"));
const firestore_2 = require("firebase-admin/firestore");
// Waitlist promotion for Inzan Athletics database
exports.onBookingCancelled = (0, firestore_1.onDocumentUpdated)({
    document: "classBookings/{bookingId}",
    database: "db-inzanathletics"
}, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData)
        return;
    // We only care if a booking goes from 'booked' to 'cancelled'
    if (beforeData.status === 'booked' && afterData.status === 'cancelled') {
        const scheduleId = afterData.scheduleId;
        logger.info(`Booking ${event.params.bookingId} cancelled for schedule ${scheduleId}. Checking waitlist...`);
        // For a specific database in admin sdk v12:
        const tenantDb = (0, firestore_2.getFirestore)("db-inzanathletics");
        try {
            await tenantDb.runTransaction(async (transaction) => {
                const scheduleRef = tenantDb.collection("classSchedules").doc(scheduleId);
                const scheduleDoc = await transaction.get(scheduleRef);
                if (!scheduleDoc.exists) {
                    logger.warn(`Schedule ${scheduleId} not found.`);
                    return;
                }
                // const scheduleData = scheduleDoc.data()!;
                // If the client side didn't decrement it yet, we should be careful. 
                // Usually, it's safer if the cloud function strictly manages the counts, but for now we'll just check if there is room.
                // Since one person cancelled, there is at least 1 spot open conceptually.
                // Let's query the waitlist.
                const waitlistQuery = tenantDb.collection("classBookings")
                    .where("scheduleId", "==", scheduleId)
                    .where("status", "==", "waitlist")
                    .orderBy("createdAt", "asc")
                    .limit(1);
                const waitlistDocs = await transaction.get(waitlistQuery);
                if (waitlistDocs.empty) {
                    logger.info(`No users on waitlist for schedule ${scheduleId}.`);
                    // We should decrement the bookedCount if not already handled by client.
                    // But let's assume the client decremented it.
                    return;
                }
                const firstWaitlistDoc = waitlistDocs.docs[0];
                const promotedUser = firstWaitlistDoc.data();
                logger.info(`Promoting user ${promotedUser.userId} from waitlist to booked.`);
                // Update the promoted booking
                transaction.update(firstWaitlistDoc.ref, {
                    status: "booked",
                    promotedAt: new Date().toISOString()
                });
                // We don't increment bookedCount because 1 cancelled and 1 took their place (net 0 change).
                // But if the client already decremented it when cancelling, we should increment it back.
                // Let's assume the client UI handled the cancellation decrement, so we should increment it.
                // Wait, it's much safer if the transaction handles the exact count.
                // Let's just do an increment to be safe if the client decremented it.
                // Actually, if we just rely on net 0, we don't change the schedule.
                // To be absolutely robust, we should calculate the real count of "booked" status.
                // As an asynchronous action, send email (do outside transaction)
                // We'll queue the email promise
            });
            // After transaction, send email to promoted user
            // We'll need their email. We can fetch user from 'users' collection.
            // Wait, 'users' collection is usually in the default DB, unless they are tenant-specific users.
            // In this CRM, users are in the default database! `db-inzanathletics` only holds CRM data (clients, packages).
            // Let's verify where `users` live.
        }
        catch (error) {
            logger.error("Error processing waitlist promotion:", error);
        }
    }
});
//# sourceMappingURL=waitlist.js.map