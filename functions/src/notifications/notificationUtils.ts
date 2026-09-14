import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

export type MemberNotificationType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_NO_SHOW"
  | "CLASS_REMINDER"
  | "STATUS_CHANGED";

const MEMBER_ALERTS_CHANNEL_ID = "member-alerts";

export async function writeMemberNotification(
  db: admin.firestore.Firestore,
  clientId: string,
  payload: {
    type: MemberNotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }
) {
  if (!clientId) return;
  await db.collection("clients").doc(clientId).collection("notifications").add({
    ...payload,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

export async function getClientPushToken(
  db: admin.firestore.Firestore,
  clientId: string,
  clientData?: admin.firestore.DocumentData
): Promise<string | null> {
  let data = clientData;
  if (!data && clientId) {
    const clientSnap = await db.collection("clients").doc(clientId).get();
    data = clientSnap.data();
  }

  const directToken = data?.expoPushToken || data?.fcmToken || data?.pushToken;
  if (directToken) return directToken;

  const portalUserId = data?.portalUserId || data?.userId;
  if (portalUserId) {
    const userSnap = await db.collection("users").doc(portalUserId).get();
    const userData = userSnap.data();
    return userData?.expoPushToken || userData?.fcmToken || userData?.pushToken || null;
  }

  return null;
}

export async function sendExpoPush(
  token: string | null,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  if (!token) return;
  if (!token.startsWith("ExponentPushToken") && !token.startsWith("ExpoPushToken")) {
    logger.warn("[notifications] Unsupported push token format", { tokenPrefix: token.slice(0, 16) });
    return;
  }

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: "default",
        priority: "high",
        channelId: MEMBER_ALERTS_CHANNEL_ID,
        interruptionLevel: "active",
        data: data || {},
      }),
    });

    if (!response.ok) {
      logger.warn("[notifications] Expo push returned non-OK response", {
        status: response.status,
        text: await response.text(),
      });
    }
  } catch (error) {
    logger.error("[notifications] Failed to dispatch push", error);
  }
}
