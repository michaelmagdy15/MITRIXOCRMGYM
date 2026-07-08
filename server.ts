import express from "express";
import path from "path";
import fs from "fs";
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { provisionNewGym } from "./provisioning";

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// ===============================================================
// Reserved subdomains — these can NEVER be provisioned as tenants
// ===============================================================
const RESERVED_SUBDOMAINS = new Set([
  'strike', 'strikeboxing', 'dashboard', 'superadmin', 'admin',
  'www', 'api', 'app', 'test', 'staging', 'dev', 'mail', 'smtp',
  'ftp', 'cdn', 'static', 'assets', 'mitrixo', 'default', 'registry',
]);

// ===============================================================
// Platform Super Admin Email (God Mode)
// ===============================================================
const PLATFORM_SUPER_ADMIN_EMAIL = 'michaelmitry13@gmail.com';

// Simple in-memory rate limiter for public endpoints
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5; // max 5 requests per hour per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

/**
 * Middleware: Verifies the caller is a platform super admin.
 * Checks Firebase ID token, then looks up the user in db-registry-2.
 * Michael's email always passes (God Mode).
 */
async function requirePlatformAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header.' });
  }
  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token!);

    // God mode: platform owner always passes
    if (decodedToken.email === PLATFORM_SUPER_ADMIN_EMAIL) {
      (req as any).platformUser = decodedToken;
      return next();
    }

    // For other users, check db-registry-2 for platform_admin or super_admin role
    const centralDb = getFirestore('db-registry-2');
    const userDoc = await centralDb.collection('platform_admins').doc(decodedToken.uid).get();
    if (userDoc.exists && userDoc.data()?.role === 'platform_admin') {
      (req as any).platformUser = decodedToken;
      return next();
    }

    return res.status(403).json({ error: 'Forbidden: You are not a platform administrator.' });
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
}

// Use process.cwd() instead of __dirname to avoid ESM/CJS path resolution issues on Windows
const __dirname = process.cwd();

// Load the default credentials to use as a fallback / local config
const defaultFirebaseConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8")
);

// Map hostnames to their respective database configurations.
const strikeCrmConfig = { 
  ...defaultFirebaseConfig,
  tenantId: "strike"
};
delete strikeCrmConfig.firestoreDatabaseId;

const tenantConfigs: Record<string, any> = {
  "localhost": defaultFirebaseConfig, // has firestoreDatabaseId: "db-test"
  "strike.mitrixo.com": strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  "strikeboxing.mitrixo.com": strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  "dashboard.strikeboxing-eg.pro": strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  "mitrixogymcrm-boxing.local": {
    ...defaultFirebaseConfig,
    projectId: "mitrixogymcrm-boxing-tenant-1",
    tenantId: "mitrixogymcrm-boxing",
  },
  "other-gym.local": {
    ...defaultFirebaseConfig,
    projectId: "other-gym-tenant-2",
    tenantId: "other-gym",
  }
};

// Caching interface for tenant lookups
interface CacheEntry {
  config: any;
  status: 'active' | 'suspended' | 'not_found';
  expiresAt: number;
}

const cache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

const SUSPENDED_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Suspended</title>
  <style>
    body { background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    div { text-align: center; border: 1px solid #27272a; padding: 40px; border-radius: 24px; background: #09090b; max-width: 400px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); }
    h1 { color: #f43f5e; font-size: 24px; text-transform: uppercase; margin-bottom: 16px; font-weight: 900; letter-spacing: 0.05em; }
    p { color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div>
    <h1>Workspace Suspended</h1>
    <p>This gym CRM workspace has been temporarily suspended. Please contact your system administrator or billing support to resume access.</p>
  </div>
</body>
</html>
`;

async function getTenantInfoForHost(hostname: string): Promise<{ config: any; status: string }> {
  const normalizedHost = hostname.toLowerCase().trim();
  
  // 1. Intercept superadmin subdomains to route them directly to the registry database
  const hostParts = normalizedHost.split('.');
  if (hostParts.length >= 2 && hostParts[0] === 'superadmin') {
    const registryConfig = {
      ...defaultFirebaseConfig,
      firestoreDatabaseId: "db-registry-2"
    };
    return { config: registryConfig, status: 'active' };
  }

  // 2. Check in-memory Cache
  const cached = cache[normalizedHost];
  if (cached && Date.now() < cached.expiresAt) {
    return { config: cached.config, status: cached.status };
  }
  
  // 3. Fallbacks for localhost & static configs
  if (tenantConfigs[normalizedHost]) {
    return { config: tenantConfigs[normalizedHost], status: 'active' };
  }
  
  try {
    const centralDb = getFirestore('db-registry-2');
    
    // A. Search by customDomain
    const customQuery = await centralDb.collection('tenants')
      .where('customDomain', '==', normalizedHost)
      .limit(1)
      .get();
      
    if (!customQuery.empty) {
      const docSnap = customQuery.docs[0];
      if (docSnap) {
        const data = docSnap.data();
        if (data) {
          const config = {
            ...defaultFirebaseConfig,
            firestoreDatabaseId: data.databaseId === '(default)' ? undefined : data.databaseId,
            tenantId: data.tenantId || docSnap.id
          };
          if (config.firestoreDatabaseId === undefined) {
            delete config.firestoreDatabaseId;
          }
          cache[normalizedHost] = { config, status: data.status || 'active', expiresAt: Date.now() + CACHE_TTL_MS };
          return { config, status: data.status || 'active' };
        }
      }
    }
    
    // B. Search by subdomain (e.g. gym.mitrixo.com -> subdomain 'gym', or gym.localhost -> subdomain 'gym')
    const parts = normalizedHost.split('.');
    const isLocalDomain = parts.length === 2 && (parts[1] === 'localhost' || parts[1] === 'local');
    if (parts.length >= 3 || isLocalDomain) {
      const subdomain = parts[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        const subDoc = await centralDb.collection('tenants').doc(subdomain).get();
        if (subDoc.exists) {
          const data = subDoc.data();
          if (data) {
            const config = {
              ...defaultFirebaseConfig,
              firestoreDatabaseId: data.databaseId === '(default)' ? undefined : data.databaseId,
              tenantId: data.tenantId || subDoc.id
            };
            if (config.firestoreDatabaseId === undefined) {
              delete config.firestoreDatabaseId;
            }
            cache[normalizedHost] = { config, status: data.status || 'active', expiresAt: Date.now() + CACHE_TTL_MS };
            return { config, status: data.status || 'active' };
          }
        }
      }
    }
  } catch (error) {
    console.error(`[Server] Error fetching tenant config for host "${hostname}":`, error);
  }
  
  // Cache negative lookup to prevent spam
  cache[normalizedHost] = { config: defaultFirebaseConfig, status: 'not_found', expiresAt: Date.now() + CACHE_TTL_MS };
  return { config: defaultFirebaseConfig, status: 'not_found' };
}

async function injectFirebaseConfig(html: string, hostname: string): Promise<string> {
  const { config } = await getTenantInfoForHost(hostname);
  const scriptTag = `<script type="text/javascript">window.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};</script>`;
  return html.replace("<!-- FIREBASE_CONFIG_PLACEHOLDER -->", scriptTag);
}

function getRequestHostname(req: express.Request): string {
  const originalHost = req.headers["x-original-host"] || req.headers["x-forwarded-host"];
  if (originalHost) {
    const hostStr = Array.isArray(originalHost) ? originalHost[0] : originalHost;
    if (hostStr) {
      return (hostStr.split(":")[0] || "").trim();
    }
  }
  return req.hostname || "localhost";
}

async function getDbForRequest(req: express.Request) {
  const hostname = getRequestHostname(req);
  const { config } = await getTenantInfoForHost(hostname);
  if (config && config.firestoreDatabaseId) {
    return getFirestore(config.firestoreDatabaseId);
  }
  return getFirestore();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 8080;

  // Support JSON body parsing
  app.use(express.json());

  // API routes go here
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Provisioning endpoint for new gym onboarding
  app.post("/api/provision", requirePlatformAdmin, async (req, res) => {
    const { tenantId, tenantName, ownerEmail, ownerName, ownerPassword, locationId, enableMobileApp, packageTier } = req.body;
    if (!tenantId || !tenantName || !ownerEmail || !ownerName) {
      return res.status(400).json({ error: "Missing required fields: tenantId, tenantName, ownerEmail, ownerName" });
    }
    
    try {
      console.log(`[Server] Received provisioning request for tenant: ${tenantId}, enableMobileApp: ${enableMobileApp}`);
      const result = await provisionNewGym({
        tenantId,
        tenantName,
        ownerEmail,
        ownerName,
        ownerPassword,
        locationId,
        enableMobileApp,
        packageTier,
      });
      return res.json(result);
    } catch (error) {
      console.error("[Server] Provisioning error:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // Public endpoint for new tenant subscription requests (rate-limited)
  app.post("/api/subscription-request", async (req, res) => {
    // Rate limiting
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (isRateLimited(clientIp)) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    const { gymName, subdomain, ownerName, ownerEmail, amountPaid, paymentMethod, transactionId, plan } = req.body;
    
    if (!gymName || !subdomain || !ownerName || !ownerEmail) {
      return res.status(400).json({ error: "Missing required fields: gymName, subdomain, ownerName, ownerEmail" });
    }

    // Subdomain alphanumeric check
    if (!/^[a-z0-9-]+$/.test(subdomain.trim())) {
      return res.status(400).json({ error: "Subdomain must contain only lowercase letters, numbers, and hyphens." });
    }

    // Reserved subdomain check
    if (RESERVED_SUBDOMAINS.has(subdomain.trim().toLowerCase())) {
      return res.status(400).json({ error: "This subdomain is reserved and cannot be used." });
    }

    try {
      const centralDb = getFirestore('db-registry-2');
      
      // Check if subdomain is already taken in tenants registry
      const tenantDoc = await centralDb.collection('tenants').doc(subdomain.trim().toLowerCase()).get();
      if (tenantDoc.exists) {
        return res.status(409).json({ error: "This subdomain is already taken." });
      }

      // Check if subdomain is already taken in pending requests
      const requestDoc = await centralDb.collection('requests').doc(subdomain.trim().toLowerCase()).get();
      if (requestDoc.exists && requestDoc.data()?.status === 'pending') {
        return res.status(409).json({ error: "This subdomain is pending approval." });
      }

      const requestId = subdomain.trim().toLowerCase();
      const newRequest = {
        id: requestId,
        gymName: gymName.trim(),
        subdomain: requestId,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        amountPaid: amountPaid || 0,
        paymentMethod: paymentMethod || 'Mock checkout',
        transactionId: transactionId || `TX-${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
        status: 'pending',
        createdAt: new Date().toISOString(),
        plan: plan || 'professional'
      };

      await centralDb.collection('requests').doc(requestId).set(newRequest);
      console.log(`[Server] Subscription request registered for: ${requestId}`);
      return res.json({ success: true, requestId });
    } catch (error) {
      console.error("[Server] Error creating subscription request:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // Endpoint for Super Admin to approve a pending request and trigger provisioning
  app.post("/api/approve-request", requirePlatformAdmin, async (req, res) => {
    const { requestId } = req.body;
    if (!requestId) {
      return res.status(400).json({ error: "Missing required field: requestId" });
    }

    try {
      const centralDb = getFirestore('db-registry-2');
      const requestRef = centralDb.collection('requests').doc(requestId);
      const requestSnap = await requestRef.get();

      if (!requestSnap.exists) {
        return res.status(404).json({ error: "Subscription request not found." });
      }

      const requestData = requestSnap.data();
      if (!requestData) {
        return res.status(500).json({ error: "Subscription request document is empty." });
      }

      if (requestData.status !== 'pending') {
        return res.status(400).json({ error: `Request is already ${requestData.status}.` });
      }

      console.log(`[Server] Super Admin approved subscription request: ${requestId}. Starting provisioning...`);

      // Execute provisioning
      const result = await provisionNewGym({
        tenantId: requestData.subdomain,
        tenantName: requestData.gymName,
        ownerEmail: requestData.ownerEmail,
        ownerName: requestData.ownerName,
        enableMobileApp: requestData.plan === 'premium',
        packageTier: requestData.plan as any // starter, professional, premium
      });

      // Update request status to approved
      await requestRef.update({
        status: 'approved',
        approvedAt: new Date().toISOString(),
        databaseId: result.databaseId,
        ownerUid: result.ownerUid
      });

      return res.json({
        success: true,
        databaseId: result.databaseId,
        temporaryPassword: result.temporaryPassword
      });
    } catch (error) {
      console.error("[Server] Approval and provisioning error:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // Admin endpoint to force-reset a user's Firebase Auth password
  // Uses Firebase Admin SDK — the ONLY way to reset synthetic email passwords
  app.post("/api/admin/reset-password", requirePlatformAdmin, async (req, res) => {
    const { uid, email } = req.body;
    const DEFAULT_PASSWORD = '12345678';
    
    if (!uid && !email) {
      return res.status(400).json({ error: "Missing required field: uid or email" });
    }

    try {
      let targetUid = uid;
      
      // If only email was provided, look up the UID
      if (!targetUid && email) {
        try {
          const userRecord = await admin.auth().getUserByEmail(email);
          targetUid = userRecord.uid;
        } catch (lookupErr: any) {
          return res.status(404).json({ error: `No Firebase Auth user found for email: ${email}` });
        }
      }
      
      // Reset the password using Admin SDK
      await admin.auth().updateUser(targetUid, { password: DEFAULT_PASSWORD });
      
      console.log(`[Server] Password reset to default for user: ${targetUid}`);
      return res.json({ success: true, message: 'Password has been reset to the default temporary password.' });
    } catch (error) {
      console.error("[Server] Password reset error:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // ─── PUBLIC QR Code Check-In Endpoint ───
  app.post("/api/attendance/qr-checkin", async (req, res) => {
    const { qrData, branch } = req.body;
    if (!qrData) {
      return res.status(400).json({ error: "Missing qrData parameter" });
    }

    try {
      const db = await getDbForRequest(req);

      // Search by ID first
      let clientSnap = await db.collection('clients').doc(qrData).get();
      let clientDoc = null;
      if (clientSnap.exists) {
        clientDoc = clientSnap;
      } else {
        // Search by memberId
        const q1 = await db.collection('clients').where('memberId', '==', qrData).limit(1).get();
        if (!q1.empty) {
          clientDoc = q1.docs[0];
        } else {
          // Search by phone
          const q2 = await db.collection('clients').where('phone', '==', qrData).limit(1).get();
          if (!q2.empty) {
            clientDoc = q2.docs[0];
          }
        }
      }

      if (!clientDoc) {
        return res.status(404).json({ error: "Member not found. Please check the QR code or ID." });
      }

      const client = clientDoc.data();
      const clientId = clientDoc.id;

      if (!client) {
        return res.status(404).json({ error: "Member not found." });
      }

      // 1. Validation checks
      if (client.status === 'Expired') {
        return res.status(400).json({ error: `${client.name}'s membership is expired. They must head to the STRIKE branch to renew.` });
      }
      if (client.status === 'Hold') {
        return res.status(400).json({ error: `${client.name}'s membership is currently on hold.` });
      }

      // Check double check-in
      const cairoDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      const todayCheckinsSnap = await db.collection('attendance')
        .where('clientId', '==', clientId)
        .get();
      
      const todayCheckins = todayCheckinsSnap.docs.filter(docSnap => {
        const data = docSnap.data();
        if (!data.date) return false;
        try {
          return new Date(data.date).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) === cairoDateStr;
        } catch {
          return false;
        }
      });
      const checkinCount = todayCheckins.length;

      // Count expected sessions
      const sessionsSnap = await db.collection('sessions')
        .where('clientId', '==', clientId)
        .where('date', '==', cairoDateStr)
        .get();
      const ptSessionsCount = sessionsSnap.docs.filter(docSnap => {
        const status = docSnap.data().status;
        return status === 'Scheduled' || status === 'Attended';
      }).length;

      const classesSnap = await db.collection('classes')
        .where('date', '==', cairoDateStr)
        .get();
      const groupClassesCount = classesSnap.docs.filter(docSnap => {
        const attendees = docSnap.data().attendees || [];
        return attendees.includes(clientId);
      }).length;

      const totalExpected = Math.max(1, ptSessionsCount + groupClassesCount);

      if (checkinCount >= totalExpected) {
        const msg = totalExpected === 1
          ? `Double check-in blocked. ${client.name} has already checked in today.`
          : `Double check-in blocked. ${client.name} has already checked in ${checkinCount} times today for ${totalExpected} scheduled sessions.`;
        return res.status(400).json({ error: msg });
      }

      // 2. Add Attendance document
      const attendanceData = {
        clientId,
        branch: branch || 'MAIN',
        date: new Date().toISOString(),
        recordedBy: 'qr-reader',
        packageName: client.packageType || '',
      };
      await db.collection('attendance').add(attendanceData);

      // 3. Mark matching scheduled PT sessions today to 'Attended'
      const scheduledPTs = sessionsSnap.docs.filter(docSnap => docSnap.data().status === 'Scheduled');
      for (const ptDoc of scheduledPTs) {
        await ptDoc.ref.update({ status: 'Attended' });
      }

      // 4. Decrement remaining sessions
      const packagesCopy = client.packages ? [...client.packages] : [];
      const activePkgIdx = packagesCopy.findIndex((p: any) => p.status === 'Active');
      const updateData: any = {};

      if (activePkgIdx !== -1) {
        const activePkg = packagesCopy[activePkgIdx];
        if (activePkg && typeof activePkg.sessionsRemaining === 'number' && activePkg.sessionsRemaining > 0) {
          packagesCopy[activePkgIdx] = {
            ...activePkg,
            sessionsRemaining: activePkg.sessionsRemaining - 1
          };
          updateData.packages = packagesCopy;
        }
      }

      if (typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0) {
        updateData.sessionsRemaining = client.sessionsRemaining - 1;
      }

      if (Object.keys(updateData).length > 0) {
        await db.collection('clients').doc(clientId).update(updateData);
      }

      // Log audit trail
      await db.collection('auditLogs').add({
        action: 'CREATE',
        entityType: 'ATTENDANCE',
        entityId: clientId,
        details: `Attendance recorded via QR: ${client.name} at ${branch || 'MAIN'}`,
        timestamp: new Date().toISOString(),
        userId: 'qr-reader',
        userName: 'QR Reader API'
      });

      return res.json({ success: true, message: `Check-in recorded for ${client.name}`, clientName: client.name });
    } catch (err: any) {
      console.error("[QR Checkin] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to process QR checkin" });
    }
  });

  // ─── PUBLIC Self-Service Password Reset for Members ───
  // Flow: Member enters ID + Phone (identity verification) + Real Email
  // Server: Verifies identity → Updates auth email to real email → Saves email to profiles
  // Client: Calls sendPasswordResetEmail(realEmail) → Firebase sends reset link
  // Bonus: We collect real member emails for future communications!
  app.post("/api/self-reset-member-password", async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (isRateLimited(clientIp)) {
      return res.status(429).json({ error: "Too many attempts. Please try again in an hour." });
    }

    const { memberId, phone, realEmail } = req.body;

    if (!memberId || !phone || !realEmail) {
      return res.status(400).json({ error: "Please provide your Member ID, phone number, and email address." });
    }

    const trimmedId = memberId.trim();
    const trimmedPhone = phone.trim().replace(/\s/g, '');
    const trimmedEmail = realEmail.trim().toLowerCase();

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    try {
      const defaultDb = getFirestore();

      // 1. Look up the client record by memberId
      const clientsSnap = await defaultDb.collection('clients')
        .where('memberId', '==', trimmedId)
        .limit(1)
        .get();

      if (clientsSnap.empty) {
        return res.status(404).json({ error: "Member ID not found. Please check and try again." });
      }

      const clientDoc = clientsSnap.docs[0]!;
      const clientData = clientDoc.data();
      const storedPhone = (clientData.phone || '').replace(/\s/g, '');

      // 2. Verify phone number matches
      if (!storedPhone || storedPhone !== trimmedPhone) {
        return res.status(403).json({ error: "Phone number does not match our records." });
      }

      // 3. Find the Firebase Auth user linked to this member
      const usersSnap = await defaultDb.collection('users')
        .where('clientRecordId', '==', trimmedId)
        .limit(1)
        .get();

      if (usersSnap.empty) {
        return res.status(404).json({ error: "No portal account found for this Member ID." });
      }

      const userDoc = usersSnap.docs[0]!;
      const userUid = userDoc.id;

      // 4. Check if another Firebase Auth user already has this real email
      try {
        const existingUser = await admin.auth().getUserByEmail(trimmedEmail);
        // If a DIFFERENT user has this email, block it
        if (existingUser.uid !== userUid) {
          return res.status(409).json({ error: "This email is already associated with another account." });
        }
      } catch (lookupErr: any) {
        // auth/user-not-found = email is available, which is what we want
        if (lookupErr?.code !== 'auth/user-not-found') {
          throw lookupErr;
        }
      }

      // 5. Update the Firebase Auth email to the real email
      await admin.auth().updateUser(userUid, { email: trimmedEmail });

      // 6. Save the real email to the user profile AND client record
      await defaultDb.collection('users').doc(userUid).update({ 
        email: trimmedEmail,
        personalEmail: trimmedEmail,
        mustChangePassword: true 
      });
      await defaultDb.collection('clients').doc(clientDoc.id).update({ 
        personalEmail: trimmedEmail 
      });

      console.log(`[Server] Member ${trimmedId} email updated to ${trimmedEmail}, ready for reset`);
      return res.json({ 
        success: true, 
        email: trimmedEmail,
        message: 'Identity verified! A password reset link will be sent to your email.' 
      });
    } catch (error) {
      console.error("[Server] Self-service reset error:", error);
      return res.status(500).json({ error: "Something went wrong. Please try again or contact support." });
    }
  });

  app.post("/api/proxy-push", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
      }

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      const resData = await response.json();
      return res.status(response.status).json(resData);
    } catch (err: any) {
      console.error("[Push Proxy] Error forwarding push request:", err);
      return res.status(500).json({ error: err.message || "Failed to forward push request." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom", // Use custom to intercept and transform index.html requests
    });
    
    // Serve static files via Vite middleware
    app.use(vite.middlewares);

    app.get("*", async (req, res, next) => {
      const hostname = getRequestHostname(req);
      try {
        const { status } = await getTenantInfoForHost(hostname);
        if (status === 'suspended') {
          return res.status(402).set({ "Content-Type": "text/html" }).end(SUSPENDED_HTML);
        }
        
        const templatePath = path.join(process.cwd(), "index.html");
        let template = fs.readFileSync(templatePath, "utf-8");
        
        // Transform the template (injects react preambles, HMR client script, etc.)
        template = await vite.transformIndexHtml(req.originalUrl, template);
        
        // Inject the dynamic client config
        const html = await injectFirebaseConfig(template, hostname);
        
        return res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
        return;
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve static assets, but do not serve index.html statically (index: false)
    app.use(express.static(distPath, { index: false }));
    
    app.get("*", async (req, res) => {
      const hostname = getRequestHostname(req);
      try {
        const { status } = await getTenantInfoForHost(hostname);
        if (status === 'suspended') {
          return res.status(402).set({ "Content-Type": "text/html" }).end(SUSPENDED_HTML);
        }
        
        const templatePath = path.join(distPath, "index.html");
        const template = fs.readFileSync(templatePath, "utf-8");
        
        // Inject dynamic config into production index.html
        const html = await injectFirebaseConfig(template, hostname);
        
        return res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (error) {
        console.error("Error serving index.html:", error);
        return res.status(500).send("Internal Server Error");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
