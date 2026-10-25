import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = defineSecret("TWILIO_FROM_NUMBER");

export const SMS_SECRETS = [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER];

export function normalizeEgyptianPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) {
    return "+" + digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("01")) {
    return "+2" + digits;
  }
  if (digits.length === 10 && digits.startsWith("1")) {
    return "+20" + digits;
  }
  if (digits.length === 12 && digits.startsWith("201")) {
    return "+" + digits;
  }
  return phone.startsWith("+") ? phone : "+" + digits;
}

export async function sendSms(
  to: string,
  body: string,
  options?: {
    channel?: "sms" | "whatsapp";
    brandName?: string;
    fromOverride?: string;
    contentSid?: string;
    contentVariables?: Record<string, string>;
  }
): Promise<{ sid: string; status: string } | null> {
  const sid = TWILIO_ACCOUNT_SID.value() || process.env.TWILIO_ACCOUNT_SID || "";
  const token = TWILIO_AUTH_TOKEN.value() || process.env.TWILIO_AUTH_TOKEN || "";
  const from =
    options?.fromOverride ||
    TWILIO_FROM_NUMBER.value() ||
    process.env.TWILIO_FROM_NUMBER ||
    "";

  if (!sid || !token || !from) {
    logger.warn("Twilio credentials not configured. Skipping message.");
    return null;
  }

  const channel = options?.channel || "sms";
  const brandName = options?.brandName || "INZAN Athletics";
  const phoneNumber = normalizeEgyptianPhone(to);

  const formattedTo = channel === "whatsapp" ? `whatsapp:${phoneNumber}` : phoneNumber;
  const formattedFrom =
    channel === "whatsapp" && !from.startsWith("whatsapp:")
      ? `whatsapp:${normalizeEgyptianPhone(from)}`
      : from;

  const finalBody =
    body.toLowerCase().includes(brandName.toLowerCase())
      ? body
      : channel === "whatsapp"
      ? `🏋️ *${brandName}*\n\n${body}`
      : `${brandName}: ${body}`;

  // Dynamic import to avoid top-level require issues
  const twilio = require("twilio");
  const client = twilio(sid, token);

  const payload: Record<string, any> = {
    to: formattedTo,
    from: formattedFrom,
  };

  if (channel === "whatsapp" && options?.contentSid) {
    payload.contentSid = options.contentSid;
    if (options.contentVariables) {
      payload.contentVariables = JSON.stringify(options.contentVariables);
    }
  } else {
    payload.body = finalBody;
  }

  const message = await client.messages.create(payload);
  logger.info(`${channel.toUpperCase()} sent to ${formattedTo}. SID: ${message.sid}`);
  return { sid: message.sid, status: message.status };
}

export function sendMemberExpiryAlert(
  phone: string,
  memberName: string,
  daysLeft: number,
  brandName = "INZAN Athletics",
  channel: "sms" | "whatsapp" = "whatsapp"
) {
  return sendSms(
    phone,
    `Hi ${memberName}, your ${brandName} membership expires in ${daysLeft} day(s). Contact us to renew!`,
    { channel, brandName }
  );
}

export function sendLeadAssignedNotification(
  phone: string,
  repName: string,
  leadName: string,
  brandName = "INZAN Athletics",
  channel: "sms" | "whatsapp" = "whatsapp"
) {
  return sendSms(
    phone,
    `Hi ${repName}, new lead "${leadName}" has been assigned to you in ${brandName}.`,
    { channel, brandName }
  );
}
