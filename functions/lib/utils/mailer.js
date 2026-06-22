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
exports.sendLeadReplyEmail = sendLeadReplyEmail;
const nodemailer = __importStar(require("nodemailer"));
const logger = __importStar(require("firebase-functions/logger"));
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
// Define configuration parameters
const smtpHost = (0, params_1.defineSecret)("SMTP_HOST");
const smtpPort = (0, params_1.defineSecret)("SMTP_PORT");
const smtpUser = (0, params_1.defineSecret)("SMTP_USER");
const smtpPass = (0, params_1.defineSecret)("SMTP_PASS");
const fromEmail = (0, params_1.defineSecret)("FROM_EMAIL");
/**
 * Retrieves the current branding settings from Firestore
 */
async function getBranding() {
    try {
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        const db = admin.firestore();
        const docRef = db.collection("settings").doc("branding");
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            const data = docSnap.data();
            const companyName = data?.companyName || "mitrixogymcrm";
            const logoUrl = data?.logoUrl || "";
            const isDefault = companyName === "mitrixogymcrm";
            return {
                companyName: isDefault ? "STRIKE" : companyName,
                logoUrl: (isDefault || !logoUrl || logoUrl === "/mitrixogymcrmlogo.png")
                    ? "https://strike-egy.com/strikelogo.png"
                    : logoUrl,
            };
        }
    }
    catch (error) {
        logger.error("Error fetching branding settings:", error);
    }
    return {
        companyName: "STRIKE",
        logoUrl: "https://strike-egy.com/strikelogo.png",
    };
}
/**
 * Sends a generic email using Nodemailer
 */
async function sendEmail(to, subject, html, companyName) {
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
        const senderName = companyName || "mitrixogymcrm";
        const fromAddr = fromEmail.value();
        const info = await transporter.sendMail({
            from: `"${senderName}" <${fromAddr}>`,
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
    const branding = await getBranding();
    const companyName = branding.companyName;
    const logoUrl = branding.logoUrl;
    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${companyName}" style="max-height: 60px; max-width: 200px; object-fit: contain; margin-bottom: 20px;" />`
        : `<h2 style="margin: 0 0 20px 0; color: #333;">${companyName}</h2>`;
    const subject = `🔥 New Lead: ${lead.name}`;
    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 20px;">
        ${logoHtml}
      </div>
      <h2 style="color: #333; margin-top: 0;">New Lead Ingested!</h2>
      <p>A new lead has been added to the CRM from <strong>${lead.source}</strong>.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p><strong>Name:</strong> ${lead.name}</p>
      <p><strong>Phone:</strong> ${lead.phone}</p>
      <p><strong>Source:</strong> ${lead.source}</p>
      <br />
      <a href="https://dashboard.mitrixogymcrmboxing-eg.pro/" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View in CRM</a>
    </div>
  `;
    return sendEmail(recipientEmail, subject, html, companyName);
}
/**
 * Template for Assignment Notification
 */
async function sendAssignmentEmail(recipientEmail, leadName) {
    const branding = await getBranding();
    const companyName = branding.companyName;
    const logoUrl = branding.logoUrl;
    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${companyName}" style="max-height: 60px; max-width: 200px; object-fit: contain; margin-bottom: 20px;" />`
        : `<h2 style="margin: 0 0 20px 0; color: #333;">${companyName}</h2>`;
    const subject = `📌 New Lead Assigned: ${leadName}`;
    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 20px;">
        ${logoHtml}
      </div>
      <h2 style="color: #333; margin-top: 0;">You've been assigned a new lead!</h2>
      <p>Hello,</p>
      <p>You have been assigned to handle <strong>${leadName}</strong>. Please check the CRM for details and follow up.</p>
      <br />
      <a href="https://dashboard.mitrixogymcrmboxing-eg.pro/" style="background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Go to Dashboard</a>
    </div>
  `;
    return sendEmail(recipientEmail, subject, html, companyName);
}
/**
 * Template for Auto-Reply / Confirmation Email sent directly to the Lead
 */
async function sendLeadReplyEmail(recipientEmail, leadName) {
    const branding = await getBranding();
    const companyName = branding.companyName;
    const logoUrl = branding.logoUrl;
    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="${companyName}" style="max-height: 60px; max-width: 200px; object-fit: contain; margin-bottom: 20px;" />`
        : `<h2 style="margin: 0 0 20px 0; color: #333;">${companyName}</h2>`;
    const subject = `We have received your request - ${companyName}`;
    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <div style="text-align: center; margin-bottom: 20px;">
        ${logoHtml}
      </div>
      <h2 style="color: #333; margin-top: 0; font-size: 20px;">Hello ${leadName},</h2>
      <p>Thank you for reaching out to <strong>${companyName}</strong>. We are pleased to receive your request.</p>
      <p>One of our representatives will contact you shortly to confirm your booking.</p>
      <p>If you have any questions in the meantime, please feel free to contact us.</p>
      <br />
      <p style="margin: 0; color: #777777;">Stay sharp,</p>
      <p style="margin: 5px 0 0 0; font-weight: bold; color: #333;">${companyName.toUpperCase().includes('STRIKE') ? 'Strike Team' : `${companyName} Team`}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #999; font-size: 11px; text-align: center; margin: 0;">This is an automated confirmation email. Please do not reply directly to this message.</p>
    </div>
  `;
    return sendEmail(recipientEmail, subject, html, companyName);
}
//# sourceMappingURL=mailer.js.map