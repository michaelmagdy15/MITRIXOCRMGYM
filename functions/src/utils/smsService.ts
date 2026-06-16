import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = defineSecret("TWILIO_FROM_NUMBER");

export const SMS_SECRETS = [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER];

function normalizeEgyptianPhone(phone: string): string {
  // Handle Egyptian numbers: convert "01X..." to "+2011..." or "+2012..." etc.
  // If phone starts with "01", replace with "+201"
  // If phone already starts with "+20", keep it
  // Otherwise, assume it's already formatted correctly
  if (phone.startsWith("01")) {
    return "+2" + phone;
  }
  return phone;
}

export async function sendSms(to: string, body: string): Promise<void> {
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

export function sendMemberExpiryAlert(phone: string, memberName: string, daysLeft: number) {
  return sendSms(
    phone,
    `Hi ${memberName}, your mitrixogymcrm membership expires in ${daysLeft} day(s). Contact us to renew!`
  );
}

export function sendLeadAssignedNotification(phone: string, repName: string, leadName: string) {
  return sendSms(
    phone,
    `Hi ${repName}, new lead "${leadName}" has been assigned to you in mitrixogymcrm.`
  );
}
