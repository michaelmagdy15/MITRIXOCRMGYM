import * as nodemailer from "nodemailer";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

// Define configuration parameters
const smtpHost = defineSecret("SMTP_HOST");
const smtpPort = defineSecret("SMTP_PORT");
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");
const fromEmail = defineSecret("FROM_EMAIL");

/**
 * Sends a generic email using Nodemailer
 */
export async function sendEmail(to: string, subject: string, html: string) {
  try {
    const user = smtpUser.value();
    const pass = smtpPass.value();
    const host = smtpHost.value();
    const portStr = smtpPort.value();
    const port = parseInt(portStr || "587", 10);

    if (!user || !pass) {
      logger.warn("SMTP credentials not set. Skipping email send.");
      return;
    }

    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user: user,
        pass: pass,
      },
    });

    const info = await transporter.sendMail({
      from: fromEmail.value(),
      to: to,
      subject: subject,
      html: html,
    });

    logger.info("Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    logger.error("Error sending email:", error);
    throw error;
  }
}

/**
 * Template for New Lead Notification
 */
export async function sendNewLeadEmail(recipientEmail: string, lead: { name: string; phone: string; source: string }) {
  const subject = `🔥 New Lead: ${lead.name}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #333;">New Lead Ingested!</h2>
      <p>A new lead has been added to the CRM from <strong>${lead.source}</strong>.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p><strong>Name:</strong> ${lead.name}</p>
      <p><strong>Phone:</strong> ${lead.phone}</p>
      <p><strong>Source:</strong> ${lead.source}</p>
      <br />
      <a href="https://dashboard.mitrixogymcrmboxing-eg.pro/" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in CRM</a>
    </div>
  `;
  return sendEmail(recipientEmail, subject, html);
}

/**
 * Template for Assignment Notification
 */
export async function sendAssignmentEmail(recipientEmail: string, leadName: string) {
  const subject = `📌 New Lead Assigned: ${leadName}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #333;">You've been assigned a new lead!</h2>
      <p>Hello,</p>
      <p>You have been assigned to handle <strong>${leadName}</strong>. Please check the CRM for details and follow up.</p>
      <br />
      <a href="https://dashboard.mitrixogymcrmboxing-eg.pro/" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
    </div>
  `;
  return sendEmail(recipientEmail, subject, html);
}
