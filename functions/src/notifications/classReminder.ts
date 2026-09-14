import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getClientPushToken, sendExpoPush, writeMemberNotification } from "./notificationUtils";

const db = admin.firestore();

const toIso = (date: Date) => date.toISOString();
const getClassStart = (cls: admin.firestore.DocumentData): Date => {
  const rawStart = String(cls.startTime || cls.time || "");
  if (rawStart.includes("T")) return new Date(rawStart);
  const normalizedTime = rawStart.length === 5 ? `${rawStart}:00` : rawStart || "00:00:00";
  return new Date(`${cls.date}T${normalizedTime}`);
};

export const sendClassReminders = onSchedule(
  {
    schedule: "*/30 * * * *",
    timeZone: "Africa/Cairo",
  },
  async () => {
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
      if (Number.isNaN(start.getTime()) || start < windowStart || start > windowEnd) continue;

      const bookingsSnap = await db.collection("classBookings")
        .where("classId", "==", scheduleDoc.id)
        .where("status", "==", "booked")
        .get();

      for (const bookingDoc of bookingsSnap.docs) {
        const booking = bookingDoc.data();
        if (booking.reminderSent) continue;

        const clientId = booking.clientId || booking.memberId;
        if (!clientId) continue;

        const title = "Class reminder";
        const body = `${cls.name || booking.className || "Your class"} starts at ${cls.startTime || cls.time || "soon"}.`;
        const data = {
          bookingId: bookingDoc.id,
          classId: scheduleDoc.id,
          startsAt: toIso(start),
          url: "/member/classes",
        };

        try {
          await writeMemberNotification(db, clientId, {
            type: "CLASS_REMINDER",
            title,
            body,
            data,
          });
          const token = await getClientPushToken(db, clientId);
          await sendExpoPush(token, title, body, data);
          await bookingDoc.ref.set({
            reminderSent: true,
            reminderSentAt: new Date().toISOString(),
          }, { merge: true });
        } catch (error) {
          logger.error("[sendClassReminders] Failed reminder", {
            bookingId: bookingDoc.id,
            classId: scheduleDoc.id,
            error,
          });
        }
      }
    }
  }
);
