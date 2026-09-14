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
exports.sendClassReminders = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const logger = __importStar(require("firebase-functions/logger"));
const notificationUtils_1 = require("./notificationUtils");
const db = admin.firestore();
const toIso = (date) => date.toISOString();
const getClassStart = (cls) => {
    const rawStart = String(cls.startTime || cls.time || "");
    if (rawStart.includes("T"))
        return new Date(rawStart);
    const normalizedTime = rawStart.length === 5 ? `${rawStart}:00` : rawStart || "00:00:00";
    return new Date(`${cls.date}T${normalizedTime}`);
};
exports.sendClassReminders = (0, scheduler_1.onSchedule)({
    schedule: "*/30 * * * *",
    timeZone: "Africa/Cairo",
}, async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 90 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 150 * 60 * 1000);
    const today = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const scheduleSnap = await db.collection("classSchedules")
        .where("date", "in", [today, tomorrow])
        .get();
    for (const scheduleDoc of scheduleSnap.docs) {
        const cls = scheduleDoc.data();
        const start = getClassStart(cls);
        if (Number.isNaN(start.getTime()) || start < windowStart || start > windowEnd)
            continue;
        const bookingsSnap = await db.collection("classBookings")
            .where("classId", "==", scheduleDoc.id)
            .where("status", "==", "booked")
            .get();
        for (const bookingDoc of bookingsSnap.docs) {
            const booking = bookingDoc.data();
            if (booking.reminderSent)
                continue;
            const clientId = booking.clientId || booking.memberId;
            if (!clientId)
                continue;
            const title = "Class reminder";
            const body = `${cls.name || booking.className || "Your class"} starts at ${cls.startTime || cls.time || "soon"}.`;
            const data = {
                bookingId: bookingDoc.id,
                classId: scheduleDoc.id,
                startsAt: toIso(start),
                url: "/member/classes",
            };
            try {
                await (0, notificationUtils_1.writeMemberNotification)(db, clientId, {
                    type: "CLASS_REMINDER",
                    title,
                    body,
                    data,
                });
                const token = await (0, notificationUtils_1.getClientPushToken)(db, clientId);
                await (0, notificationUtils_1.sendExpoPush)(token, title, body, data);
                await bookingDoc.ref.set({
                    reminderSent: true,
                    reminderSentAt: new Date().toISOString(),
                }, { merge: true });
            }
            catch (error) {
                logger.error("[sendClassReminders] Failed reminder", {
                    bookingId: bookingDoc.id,
                    classId: scheduleDoc.id,
                    error,
                });
            }
        }
    }
});
//# sourceMappingURL=classReminder.js.map