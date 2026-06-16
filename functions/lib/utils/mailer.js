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
exports.sendEmail = sendEmail;
exports.sendNewLeadEmail = sendNewLeadEmail;
exports.sendAssignmentEmail = sendAssignmentEmail;
const nodemailer = __importStar(require("nodemailer"));
const logger = __importStar(require("firebase-functions/logger"));
const params_1 = require("firebase-functions/params");
// Define configuration parameters
const smtpHost = (0, params_1.defineSecret)("SMTP_HOST");
const smtpPort = (0, params_1.defineSecret)("SMTP_PORT");
const smtpUser = (0, params_1.defineSecret)("SMTP_USER");
const smtpPass = (0, params_1.defineSecret)("SMTP_PASS");
const fromEmail = (0, params_1.defineSecret)("FROM_EMAIL");
/**
 * Sends a generic email using Nodemailer
 */
async function sendEmail(to, subject, html) {
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
    }
    catch (error) {
        logger.error("Error sending email:", error);
        throw error;
    }
}
/**
 * Template for New Lead Notification
 */
async function sendNewLeadEmail(recipientEmail, lead) {
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
async function sendAssignmentEmail(recipientEmail, leadName) {
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
//# sourceMappingURL=mailer.js.map