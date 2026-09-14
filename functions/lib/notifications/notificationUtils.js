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
exports.writeMemberNotification = writeMemberNotification;
exports.getClientPushToken = getClientPushToken;
exports.sendExpoPush = sendExpoPush;
const logger = __importStar(require("firebase-functions/logger"));
async function writeMemberNotification(db, clientId, payload) {
    if (!clientId)
        return;
    await db.collection("clients").doc(clientId).collection("notifications").add({
        ...payload,
        read: false,
        createdAt: new Date().toISOString(),
    });
}
async function getClientPushToken(db, clientId, clientData) {
    let data = clientData;
    if (!data && clientId) {
        const clientSnap = await db.collection("clients").doc(clientId).get();
        data = clientSnap.data();
    }
    const directToken = data?.expoPushToken || data?.fcmToken || data?.pushToken;
    if (directToken)
        return directToken;
    const portalUserId = data?.portalUserId || data?.userId;
    if (portalUserId) {
        const userSnap = await db.collection("users").doc(portalUserId).get();
        const userData = userSnap.data();
        return userData?.expoPushToken || userData?.fcmToken || userData?.pushToken || null;
    }
    return null;
}
async function sendExpoPush(token, title, body, data) {
    if (!token)
        return;
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
                data: data || {},
            }),
        });
        if (!response.ok) {
            logger.warn("[notifications] Expo push returned non-OK response", {
                status: response.status,
                text: await response.text(),
            });
        }
    }
    catch (error) {
        logger.error("[notifications] Failed to dispatch push", error);
    }
}
//# sourceMappingURL=notificationUtils.js.map