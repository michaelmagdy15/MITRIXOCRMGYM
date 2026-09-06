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
        const scheduleId = afterData.scheduleId || afterData.classId;
        if (!scheduleId) {
            logger.warn(`[waitlist] No scheduleId or classId found on booking ${event.params.bookingId}`);
            return;
        }
        logger.info(`Booking ${event.params.bookingId} cancelled for schedule ${scheduleId}. Checking waitlist...`);
        const tenantDb = (0, firestore_2.getFirestore)("db-inzanathletics");
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
                const attendees = Array.isArray(scheduleData.attendees) ? [...scheduleData.attendees] : [];
                const waitlist = Array.isArray(scheduleData.waitlist) ? [...scheduleData.waitlist] : [];
                // Remove cancelling user from attendees array if present
                const cancellingUserId = afterData.clientId || afterData.memberId;
                if (cancellingUserId) {
                    const idx = attendees.indexOf(cancellingUserId);
                    if (idx > -1) {
                        attendees.splice(idx, 1);
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
                    if (wIdx > -1)
                        waitlist.splice(wIdx, 1);
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
        }
        catch (error) {
            logger.error("Error processing waitlist promotion:", error);
        }
    }
});
//# sourceMappingURL=waitlist.js.map