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
exports.onClientStatusChangeNotification = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const notificationUtils_1 = require("./notificationUtils");
const db = admin.firestore();
exports.onClientStatusChangeNotification = (0, firestore_1.onDocumentUpdated)("clients/{clientId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const previousStatus = String(before.status || "").toLowerCase();
    const nextStatus = String(after.status || "").toLowerCase();
    if (previousStatus === nextStatus)
        return;
    if (nextStatus !== "expired" && nextStatus !== "hold")
        return;
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
    await (0, notificationUtils_1.writeMemberNotification)(db, clientId, {
        type: "STATUS_CHANGED",
        title,
        body,
        data,
    });
    const token = await (0, notificationUtils_1.getClientPushToken)(db, clientId, after);
    await (0, notificationUtils_1.sendExpoPush)(token, title, body, data);
});
//# sourceMappingURL=statusChangeNotification.js.map