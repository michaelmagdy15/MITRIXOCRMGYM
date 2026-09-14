import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { getClientPushToken, sendExpoPush, writeMemberNotification } from "./notificationUtils";

const db = admin.firestore();

export const onBookingCreated = onDocumentCreated("classBookings/{bookingId}", async (event) => {
  const booking = event.data?.data();
  if (!booking) return;
  if (booking.status && booking.status !== "booked") return;

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

  await writeMemberNotification(db, clientId, {
    type: "BOOKING_CONFIRMED",
    title,
    body,
    data,
  });

  const token = await getClientPushToken(db, clientId);
  await sendExpoPush(token, title, body, data);
});

export const onBookingStatusChange = onDocumentUpdated("classBookings/{bookingId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === after.status) return;

  const nextStatus = String(after.status || "").toLowerCase();
  if (nextStatus !== "cancelled" && nextStatus !== "no-show") return;

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

  await writeMemberNotification(db, clientId, {
    type: isNoShow ? "BOOKING_NO_SHOW" : "BOOKING_CANCELLED",
    title,
    body,
    data,
  });

  const token = await getClientPushToken(db, clientId);
  await sendExpoPush(token, title, body, data);
});

