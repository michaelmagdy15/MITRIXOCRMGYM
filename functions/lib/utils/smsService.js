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
exports.SMS_SECRETS = void 0;
exports.sendSms = sendSms;
exports.sendMemberExpiryAlert = sendMemberExpiryAlert;
exports.sendLeadAssignedNotification = sendLeadAssignedNotification;
const logger = __importStar(require("firebase-functions/logger"));
const params_1 = require("firebase-functions/params");
const TWILIO_ACCOUNT_SID = (0, params_1.defineSecret)("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = (0, params_1.defineSecret)("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = (0, params_1.defineSecret)("TWILIO_FROM_NUMBER");
exports.SMS_SECRETS = [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER];
function normalizeEgyptianPhone(phone) {
    // Handle Egyptian numbers: convert "01X..." to "+2011..." or "+2012..." etc.
    // If phone starts with "01", replace with "+201"
    // If phone already starts with "+20", keep it
    // Otherwise, assume it's already formatted correctly
    if (phone.startsWith("01")) {
        return "+2" + phone;
    }
    return phone;
}
async function sendSms(to, body) {
    const sid = TWILIO_ACCOUNT_SID.value();
    const token = TWILIO_AUTH_TOKEN.value();
    const from = TWILIO_FROM_NUMBER.value();
    if (!sid || !token || !from) {
        logger.warn("Twilio credentials not configured. Skipping SMS.");
        return;
    }
    const phoneNumber = normalizeEgyptianPhone(to);
    // Dynamic import to avoid top-level require issues
    const twilio = require("twilio");
    const client = twilio(sid, token);
    const message = await client.messages.create({ to: phoneNumber, from, body });
    logger.info(`SMS sent to ${phoneNumber}. SID: ${message.sid}`);
}
function sendMemberExpiryAlert(phone, memberName, daysLeft) {
    return sendSms(phone, `Hi ${memberName}, your mitrixogymcrm membership expires in ${daysLeft} day(s). Contact us to renew!`);
}
function sendLeadAssignedNotification(phone, repName, leadName) {
    return sendSms(phone, `Hi ${repName}, new lead "${leadName}" has been assigned to you in mitrixogymcrm.`);
}
//# sourceMappingURL=smsService.js.map