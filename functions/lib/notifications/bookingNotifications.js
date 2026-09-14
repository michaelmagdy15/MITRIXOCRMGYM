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
exports.onBookingStatusChange = exports.onBookingCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const notificationUtils_1 = require("./notificationUtils");
const db = admin.firestore();
exports.onBookingCreated = (0, firestore_1.onDocumentCreated)("classBookings/{bookingId}", async (event) => {
    const booking = event.data?.data();
    if (!booking)
        return;
    if (booking.status && booking.status !== "booked")
        return;
    const clientId = booking.clientId || booking.memberId;
    if (!clientId) {
        logger.warn("[onBookingCreated] Booking missing clientId", { bookingId: event.params.bookingId });
        return;
    }
    const title = "Booking confirmed";
    const body = `${booking.className || "Your class"} is booked${booking.classTime ? ` at ${booking.classTime}` : ""}.`;
    const data = {
        bookingId: event.params.bookingId,
        classId: booking.classId || booking.scheduleId,
        url: "/member/classes",
    };
    await (0, notificationUtils_1.writeMemberNotification)(db, clientId, {
        type: "BOOKING_CONFIRMED",
        title,
        body,
        data,
    });
    const token = await (0, notificationUtils_1.getClientPushToken)(db, clientId);
    await (0, notificationUtils_1.sendExpoPush)(token, title, body, data);
});
exports.onBookingStatusChange = (0, firestore_1.onDocumentUpdated)("classBookings/{bookingId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status)
        return;
    const nextStatus = String(after.status || "").toLowerCase();
    if (nextStatus !== "cancelled" && nextStatus !== "no-show")
        return;
    const clientId = after.clientId || after.memberId;
    if (!clientId) {
        logger.warn("[onBookingStatusChange] Booking missing clientId", { bookingId: event.params.bookingId });
        return;
    }
    const isNoShow = nextStatus === "no-show";
    const title = isNoShow ? "Class marked no-show" : "Booking cancelled";
    const body = isNoShow
        ? `${after.className || "Your class"} was marked as no-show.`
        : `${after.className || "Your class"} booking was cancelled.`;
    const data = {
        bookingId: event.params.bookingId,
        classId: after.classId || after.scheduleId,
        url: "/member/classes",
    };
    await (0, notificationUtils_1.writeMemberNotification)(db, clientId, {
        type: isNoShow ? "BOOKING_NO_SHOW" : "BOOKING_CANCELLED",
        title,
        body,
        data,
    });
    const token = await (0, notificationUtils_1.getClientPushToken)(db, clientId);
    await (0, notificationUtils_1.sendExpoPush)(token, title, body, data);
});
//# sourceMappingURL=bookingNotifications.js.map