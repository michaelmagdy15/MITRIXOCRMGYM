import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { getClientPushToken, sendExpoPush, writeMemberNotification } from "./notificationUtils";

const db = admin.firestore();

export const onClientStatusChangeNotification = onDocumentUpdated("clients/{clientId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;

  const previousStatus = String(before.status || "").toLowerCase();
  const nextStatus = String(after.status || "").toLowerCase();
  if (previousStatus === nextStatus) return;
  if (nextStatus !== "expired" && nextStatus !== "hold") return;

  const clientId = event.params.clientId;
  const title = nextStatus === "expired" ? "Membership expired" : "Membership on hold";
  const body = nextStatus === "expired"
    ? "Your membership has expired. Visit the front desk to renew your plan."
    : "Your membership is currently on hold. Visit the front desk if you need help.";
  const data = {
    clientId,
    status: after.status,
    url: "/member/profile",
  };

  await writeMemberNotification(db, clientId, {
    type: "STATUS_CHANGED",
    title,
    body,
    data,
  });

  const token = await getClientPushToken(db, clientId, after);
  await sendExpoPush(token, title, body, data);
});

