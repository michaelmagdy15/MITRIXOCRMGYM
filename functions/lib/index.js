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
exports.onPaymentUpdated = exports.onClientAssigned = exports.onLeadCreated = exports.metaWebhook = exports.upgradeMemberPackage = exports.forcePasswordReset = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const logger = __importStar(require("firebase-functions/logger"));
const admin = __importStar(require("firebase-admin"));
const mailer_1 = require("./utils/mailer");
// Initialize Firebase Admin for Firestore access
admin.initializeApp();
const db = admin.firestore();
const ADMIN_EMAILS = [
    "michaelmitry13@gmail.com",
    "magd.gallab@gmail.com",
    "admin@mitrixogymcrm.eg",
];
const ADMIN_ROLES = ["admin", "super_admin", "crm_admin", "manager"];
/**
 * Callable: Force reset a user's password to "12345678" and flag mustChangePassword.
 * Only callable by authenticated admins/super_admins.
 * Data: { userId: string }
 */
exports.forcePasswordReset = (0, https_1.onCall)({ cors: true }, async (request) => {
    const callerEmail = request.auth?.token?.email ?? "";
    const callerUid = request.auth?.uid;
    if (!callerUid) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in.");
    }
    // Check caller is an admin
    const isHardcodedAdmin = ADMIN_EMAILS.includes(callerEmail);
    if (!isHardcodedAdmin) {
        const callerDoc = await db.collection("users").doc(callerUid).get();
        const callerRole = callerDoc.data()?.role ?? "";
        if (!ADMIN_ROLES.includes(callerRole)) {
            throw new https_1.HttpsError("permission-denied", "Only admins can force password resets.");
        }
    }
    const { userId } = request.data;
    if (!userId) {
        throw new https_1.HttpsError("invalid-argument", "userId is required.");
    }
    // Prevent resetting your own account this way
    if (userId === callerUid) {
        throw new https_1.HttpsError("invalid-argument", "You cannot force-reset your own account.");
    }
    // Reset Firebase Auth password to default
    await admin.auth().updateUser(userId, { password: "12345678" });
    // Mark mustChangePassword in Firestore
    await db.collection("users").doc(userId).update({ mustChangePassword: true });
    logger.info(`[forcePasswordReset] ${callerEmail} force-reset password for user ${userId}`);
    return { success: true };
});
// Callable function for member upgrades with race-condition prevention
exports.upgradeMemberPackage = (0, https_1.onRequest)(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Only POST is allowed");
        return;
    }
    try {
        const { clientId, packageName, startDate } = req.body;
        if (!clientId || !packageName || !startDate) {
            res.status(400).send({ error: "Missing required fields: clientId, packageName, startDate" });
            return;
        }
        // Fetch the client document
        const clientDoc = await db.collection("clients").doc(clientId).get();
        if (!clientDoc.exists) {
            res.status(404).send({ error: "Client not found" });
            return;
        }
        const clientData = clientDoc.data();
        const currentPackages = clientData?.packages || [];
        // Check for existing active package of the same type
        const activePackageOfType = currentPackages.find((p) => p.status === "Active" && p.packageName === packageName);
        if (activePackageOfType) {
            res.status(409).send({ error: `Member already has an active "${packageName}" package` });
            return;
        }
        logger.info(`Successfully validated upgrade for client ${clientId}: ${packageName}`);
        res.status(200).send({ success: true, message: "Upgrade validation passed" });
    }
    catch (error) {
        logger.error("Error in upgradeMemberPackage:", error);
        res.status(500).send({ error: "Internal Server Error" });
    }
});
// -------------------------------------------------------------
// SECRETS & CONFIGURATION
// -------------------------------------------------------------
const MITRIXOGYMCRM_WEBHOOK_SECRET = (0, params_1.defineSecret)("MITRIXOGYMCRM_WEBHOOK_SECRET");
/**
 * Generic Webhook Endpoint for Zapier / Make.com
 * Accepts a POST request with name, phone, email, and source.
 */
exports.metaWebhook = (0, https_1.onRequest)({ secrets: [MITRIXOGYMCRM_WEBHOOK_SECRET] }, async (req, res) => {
    logger.info(`[${req.method}] Webhook triggered`);
    // Only allow POST
    if (req.method !== "POST") {
        res.status(405).send("Only POST is allowed");
        return;
    }
    try {
        const body = req.body;
        const secret = req.headers["x-mitrixogymcrm-secret"];
        logger.info("Incoming Webhook Data:", JSON.stringify(body, null, 2));
        // MANDATORY: Verify webhook secret — reject all unauthenticated requests
        if (!secret || secret !== MITRIXOGYMCRM_WEBHOOK_SECRET.value()) {
            logger.warn("Missing or invalid webhook secret");
            res.status(401).send("Unauthorized");
            return;
        }
        const { name, phone, email, source } = body;
        if (!name) {
            logger.warn("Missing required field: name");
            res.status(400).send("Missing field: name");
            return;
        }
        // Inject into CRM
        await createLeadInCRM(name, phone || "000-000-0000", source || "Zapier", email || "");
        res.status(200).send({ status: "success", message: "Lead added to CRM" });
    }
    catch (err) {
        logger.error("Error processing webhook payload:", err);
        res.status(500).send({ status: "error", message: "Internal Server Error" });
    }
});
/**
 * Helper function to inject a Lead directly into mitrixogymcrm's Firestore
 */
async function createLeadInCRM(name, phone, source, email) {
    try {
        const newClientRef = db.collection("clients").doc();
        const leadData = {
            name: name,
            phone: phone,
            email: email,
            status: "Lead",
            stage: "New",
            source: source,
            createdAt: new Date().toISOString(),
            lastContactDate: new Date().toISOString(),
            notes: `Ingested via Zapier (${source})`
        };
        await newClientRef.set(leadData);
        logger.info(`Successfully added Lead to CRM: ${name} (${source})`);
    }
    catch (error) {
        logger.error("Error creating Lead in CRM:", error);
    }
}
/**
 * Trigger: Notify on New Lead
 * Sends an email to all active sales reps (or a specific manager)
 */
exports.onLeadCreated = (0, firestore_1.onDocumentCreated)("clients/{clientId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const leadData = snapshot.data();
    // Only trigger for Leads
    if (leadData.status !== "Lead")
        return;
    logger.info(`New Lead detected: ${leadData.name}. Sending notifications...`);
    try {
        // 1. Get all sales reps to notify (or a hardcoded list)
        // For now, let's fetch users with role 'rep' or 'manager'
        const usersSnapshot = await db.collection("users")
            .where("role", "in", ["rep", "manager", "admin", "super_admin", "crm_admin"])
            .get();
        const recipientEmails = usersSnapshot.docs
            .map(doc => doc.data().email)
            .filter(email => !!email);
        if (recipientEmails.length === 0) {
            logger.warn("No recipient emails found for lead notification.");
            return;
        }
        // 2. Send emails to reps/managers
        const emailPromises = recipientEmails.map(email => (0, mailer_1.sendNewLeadEmail)(email, {
            name: leadData.name,
            phone: leadData.phone,
            source: leadData.source || "Unknown"
        }));
        await Promise.all(emailPromises);
        logger.info(`Lead notifications sent to ${recipientEmails.length} users.`);
    }
    catch (error) {
        logger.error("Error in onLeadCreated trigger:", error);
    }
});
/**
 * Trigger: Notify on Lead Assignment
 * Sends an email to the specifically assigned sales rep
 */
exports.onClientAssigned = (0, firestore_1.onDocumentUpdated)("clients/{clientId}", async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData)
        return;
    // Check if assignedTo has changed
    if (afterData.assignedTo && afterData.assignedTo !== beforeData.assignedTo) {
        logger.info(`Lead ${afterData.name} assigned to ${afterData.assignedTo}. Notifying...`);
        try {
            // 1. Get the assigned user's email
            const userDoc = await db.collection("users").doc(afterData.assignedTo).get();
            const userEmail = userDoc.data()?.email;
            if (userEmail) {
                await (0, mailer_1.sendAssignmentEmail)(userEmail, afterData.name);
                logger.info(`Assignment notification sent to ${userEmail}`);
            }
            else {
                logger.warn(`Could not find email for assigned user: ${afterData.assignedTo}`);
            }
        }
        catch (error) {
            logger.error("Error in onClientAssigned trigger:", error);
        }
    }
});
/**
 * Trigger: Sync Payment Branch Edits to Client
 * When a payment's branch changes, mirrors that change to the linked client document.
 * NOTE: Sales rep assignment (Client.assignedTo) is intentionally NOT synced from
 * payment edits. Client assignment is managed exclusively via the Clients tab to
 * prevent payment-driven silent reassignments that bypass manager intent.
 */
exports.onPaymentUpdated = (0, firestore_1.onDocumentUpdated)("payments/{paymentId}", async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData)
        return;
    const clientId = afterData.clientId;
    if (!clientId)
        return;
    const branchChanged = beforeData.branch !== afterData.branch;
    if (branchChanged) {
        logger.info(`Payment ${event.params.paymentId} branch changed. Syncing branch to Client ${clientId}...`);
        try {
            await db.collection("clients").doc(clientId).update({ branch: afterData.branch });
            logger.info(`Successfully synced branch to Client ${clientId}`);
        }
        catch (error) {
            logger.error(`Error syncing branch to Client ${clientId}:`, error);
        }
    }
});
//# sourceMappingURL=index.js.map