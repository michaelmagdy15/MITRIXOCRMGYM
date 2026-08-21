import 'dotenv/config';

import express from "express";
import path from "path";
import fs from "fs";
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { provisionNewGym } from "./provisioning";
import { startNoShowJob } from './src/jobs/noShowJob.js';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

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
    if (rateLimitMap.size > 1000) {
      for (const [k, v] of rateLimitMap.entries()) {
        if (now > v.resetAt) rateLimitMap.delete(k);
      }
    }
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
    if (userDoc.exists && ['platform_admin', 'super_admin'].includes(userDoc.data()?.role)) {
      (req as any).platformUser = decodedToken;
      return next();
    }

    return res.status(403).json({ error: 'Forbidden: You are not a platform administrator.' });
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
}

interface ClientCacheEntry {
  clients: any[];
  timestamp: number;
}
const clientsCache = new Map<string, ClientCacheEntry>();
const clientsFetchPromises = new Map<string, Promise<any[]>>();

interface PaymentCacheEntry {
  payments: any[];
  timestamp: number;
}
const paymentsCache = new Map<string, PaymentCacheEntry>();
const paymentsFetchPromises = new Map<string, Promise<any[]>>();


async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }
  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token!);
    (req as any).user = decodedToken;

    // Cross-tenant protection: the tenant database is selected from the request
    // hostname (getRequestHostname may trust x-forwarded-host / x-original-host),
    // so after authentication we MUST verify the user is actually a member of the
    // tenant resolved for this request. Otherwise any authenticated user could
    // spoof another tenant's host header and read/write that tenant's data.
    const hostname = getRequestHostname(req);
    const { config: tenantConfig, status: tenantStatus } = await getTenantInfoForHost(hostname);
    
    // Deny requests for unresolvable hosts to prevent cross-tenant auth bypass (C-4)
    if (tenantStatus === 'not_found') {
      res.status(403).json({ error: 'Forbidden: Unknown tenant host' });
      return;
    }

    const resolvedTenantId = tenantConfig?.tenantId;

    // Enforce membership for all authenticated requests (unless it's the superadmin dashboard 
    // which operates on the registry DB and has no tenantId).
    if (resolvedTenantId) {
      let memberDb;
      try {
        memberDb = tenantConfig.firestoreDatabaseId
          ? getFirestore(tenantConfig.firestoreDatabaseId)
          : getFirestore();
      } catch (dbErr) {
        console.error('[Auth] Error resolving tenant database:', dbErr);
        res.status(500).json({ error: 'Internal error resolving tenant' });
        return;
      }
      const userDoc = await memberDb.collection('users').doc(decodedToken.uid).get();
      if (!userDoc.exists) {
        console.warn(
          `[Auth] User ${decodedToken.uid} is not a member of tenant "${resolvedTenantId}" (host: ${hostname}) — denying access`
        );
        res.status(403).json({ error: 'Forbidden: User is not a member of this tenant' });
        return;
      }
    }

    next();
    return;
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return;
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

const inzanConfig = {
  ...defaultFirebaseConfig,
  firestoreDatabaseId: "db-inzanathletics",
  tenantId: "inzanathletics"
};

const tenantConfigs: Record<string, any> = {
  "localhost": defaultFirebaseConfig, // has firestoreDatabaseId: "db-test"
  "strike.mitrixo.com": strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  "strikeboxing.mitrixo.com": strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  "dashboard.strikeboxing-eg.pro": strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  "inzanathletics.mitrixo.com": inzanConfig,
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
const DATA_CACHE_TTL_MS = 30 * 1000; // 30 seconds cache TTL for clients/payments to prevent cache drift on Cloud Run

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
  if (req.hostname) {
    return req.hostname;
  }
  return ((req.get("host") || "localhost").split(":")[0] as string);
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
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT) || 8080;

  // Support JSON body parsing
  app.use(express.json());

  // API routes go here
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Fetch all clients (members) via memory cache
  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      const dbId = config?.firestoreDatabaseId || '(default)';
      const cacheKey = `${tenantId || 'default'}:${dbId}`;
      
      const now = Date.now();
      const cached = clientsCache.get(cacheKey);
      if (cached && now - cached.timestamp < DATA_CACHE_TTL_MS) {
        return res.json({ clients: cached.clients, cached: true });
      }

      // Check if there is an in-flight promise for this database
      let fetchPromise = clientsFetchPromises.get(cacheKey);
      if (!fetchPromise) {
        fetchPromise = (async () => {
          console.log(`[Cache] Fetching clients from Firestore (${dbId})...`);
          const db = await getDbForRequest(req);
          const snap = await db.collection('clients').where('status', '!=', 'Lead').get();
          return snap.docs.map(doc => {
            const data = doc.data();
            // Exclude large subcollections to keep memory consumption minimal
            delete data.comments;
            delete data.interactions;
            return { ...data, id: doc.id } as any;
          });
        })();
        clientsFetchPromises.set(cacheKey, fetchPromise);
      }

      try {
        const clients = await fetchPromise;
        clientsCache.set(cacheKey, { clients, timestamp: Date.now() });
        return res.json({ clients, cached: false });
      } finally {
        clientsFetchPromises.delete(cacheKey);
      }
    } catch (error) {
      console.error('[API] Error fetching clients:', error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // Invalidate clients cache
  app.post("/api/clients/invalidate", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      const dbId = config?.firestoreDatabaseId || '(default)';
      const cacheKey = `${tenantId || 'default'}:${dbId}`;
      
      clientsCache.delete(cacheKey);
      console.log(`[Cache] Invalidated cache for: ${cacheKey}`);
      return res.json({ success: true });
    } catch (error) {
      console.error('[API] Error invalidating cache:', error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // Fetch all payments via memory cache
  app.get("/api/payments", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      const dbId = config?.firestoreDatabaseId || '(default)';
      const cacheKey = `${tenantId || 'default'}:${dbId}`;
      
      const now = Date.now();
      const cached = paymentsCache.get(cacheKey);
      if (cached && now - cached.timestamp < DATA_CACHE_TTL_MS) {
        return res.json({ payments: cached.payments, cached: true });
      }

      // Check if there is an in-flight promise for this database
      let fetchPromise = paymentsFetchPromises.get(cacheKey);
      if (!fetchPromise) {
        fetchPromise = (async () => {
          console.log(`[Cache] Fetching payments from Firestore (${dbId})...`);
          const db = await getDbForRequest(req);
          const snap = await db.collection('payments').get();
          return snap.docs
            .map(doc => ({ ...doc.data(), id: doc.id } as any))
            .filter((p: any) => !p.deleted_at);
        })();
        paymentsFetchPromises.set(cacheKey, fetchPromise);
      }

      try {
        const payments = await fetchPromise;
        paymentsCache.set(cacheKey, { payments, timestamp: Date.now() });
        return res.json({ payments, cached: false });
      } finally {
        paymentsFetchPromises.delete(cacheKey);
      }
    } catch (error) {
      console.error('[API] Error fetching payments:', error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // Invalidate payments cache
  app.post("/api/payments/invalidate", requireAuth, async (req, res) => {
    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
      const dbId = config?.firestoreDatabaseId || '(default)';
      const cacheKey = `${tenantId || 'default'}:${dbId}`;
      
      paymentsCache.delete(cacheKey);
      console.log(`[Cache] Invalidated payments cache for: ${cacheKey}`);
      return res.json({ success: true });
    } catch (error) {
      console.error('[API] Error invalidating payments cache:', error);
      return res.status(500).json({ error: (error as Error).message });
    }
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
      
      console.log(`[Server] Password reset to default for user.`);
      return res.json({ success: true, message: 'Password has been reset to the default temporary password.' });
    } catch (error) {
      console.error("[Server] Password reset error:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // Tenant-level endpoint to force-reset another user's password
  app.post("/api/tenant/reset-user-password", requireAuth, async (req, res) => {
    const { targetUserId } = req.body;
    const DEFAULT_PASSWORD = '12345678';

    if (!targetUserId) {
      return res.status(400).json({ error: "Missing required field: targetUserId" });
    }

    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const db = await getDbForRequest(req);
      
      const callerUid = (req as any).user.uid;
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerRole = callerDoc.data()?.role || "";

      const ADMIN_ROLES = ["admin", "super_admin", "crm_admin", "manager"];
      if (!ADMIN_ROLES.includes(callerRole?.toLowerCase())) {
        return res.status(403).json({ error: "Forbidden: Only admins can reset user passwords." });
      }

      if (targetUserId === callerUid) {
        return res.status(400).json({ error: "You cannot force-reset your own password." });
      }

      // Reset the password in Firebase Auth using Admin SDK
      await admin.auth().updateUser(targetUserId, { password: DEFAULT_PASSWORD });

      // Update Firestore user document to flag mustChangePassword
      await db.collection("users").doc(targetUserId).update({ mustChangePassword: true });

      console.log(`[Server] Force reset password executed.`);
      return res.json({ success: true, message: 'Password has been reset to "12345678".' });
    } catch (error) {
      console.error("[Server] Tenant password reset error:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // Tenant-level endpoint to create a Firebase Auth user
  app.post("/api/tenant/create-auth-user", requireAuth, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing required fields: email or password" });
    }

    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const db = await getDbForRequest(req);
      
      const callerUid = (req as any).user.uid;
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerRole = callerDoc.data()?.role || "";

      const ADMIN_ROLES = ["admin", "super_admin", "crm_admin", "manager"];
      if (!ADMIN_ROLES.includes(callerRole?.toLowerCase())) {
        return res.status(403).json({ error: "Forbidden: Only admins can create users." });
      }

      // Check if user already exists first to prevent duplicate accounts
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(email);
        
        // Prevent cross-tenant overlap (H-6)
        const existingUserDoc = await db.collection('users').doc(userRecord.uid).get();
        if (!existingUserDoc.exists) {
          return res.status(409).json({ error: "This email is already registered with another account on the platform." });
        }
        
        console.log(`[Server] Auth account already exists.`);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          // Create Firebase Auth user using Admin SDK
          userRecord = await admin.auth().createUser({
            email,
            password
          });
          console.log(`[Server] Auth account created.`);
        } else {
          throw err;
        }
      }

      return res.json({ success: true, uid: userRecord.uid });
    } catch (error) {
      console.error("[Server] Tenant create-auth-user error:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // Tenant-level endpoint to activate a pending user account
  app.post("/api/tenant/activate-user", requireAuth, async (req, res) => {
    const { pendingDocId, email, role, name } = req.body;
    const DEFAULT_PASSWORD = '12345678';

    if (!pendingDocId || !email || !role || !name) {
      return res.status(400).json({ error: "Missing required fields: pendingDocId, email, role, or name" });
    }

    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const db = await getDbForRequest(req);
      
      const callerUid = (req as any).user.uid;
      const callerDoc = await db.collection("users").doc(callerUid).get();
      const callerRole = callerDoc.data()?.role || "";

      const ADMIN_ROLES = ["admin", "super_admin", "crm_admin", "manager"];
      if (!ADMIN_ROLES.includes(callerRole?.toLowerCase())) {
        return res.status(403).json({ error: "Forbidden: Only admins can activate users." });
      }

      // Check if user already exists in Firebase Auth
      let uid = "";
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        uid = userRecord.uid;
      } catch (authErr: any) {
        if (authErr?.code === 'auth/user-not-found') {
          // Create new user in Firebase Auth
          const userRecord = await admin.auth().createUser({
            email,
            password: DEFAULT_PASSWORD,
            displayName: name
          });
          uid = userRecord.uid;
        } else {
          throw authErr;
        }
      }

      // Write/update user in Firestore
      const newUser = { id: uid, name, email, role };
      await db.collection("users").doc(uid).set(newUser);

      // Clean up pending doc in Firestore if it has a different ID
      if (pendingDocId !== uid) {
        await db.collection("users").doc(pendingDocId).delete();
      }

      console.log(`[Server] User account activated.`);
      return res.json({ success: true, uid });
    } catch (error) {
      console.error("[Server] Tenant activate user error:", error);
      return res.status(500).json({ error: (error as Error).message });
    }
  });

  // ─── PUBLIC QR Code Check-In Endpoint ───
  app.post("/api/attendance/qr-checkin", requireAuth, async (req, res) => {
    const { qrData, branch } = req.body;
    if (!qrData) {
      return res.status(400).json({ error: "Missing qrData parameter" });
    }

    try {
      const hostname = getRequestHostname(req);
      const { config } = await getTenantInfoForHost(hostname);
      const tenantId = config?.tenantId;
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

  // Server-authoritative endpoint for class booking
  // Handles capacity checks, waitlist promotion, and prevents double-booking
  app.post("/api/classes/book", requireAuth, async (req, res) => {
    try {
      const { classId, action, clientId } = req.body;
      if (!classId || !action || !clientId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const db = await getDbForRequest(req);
      const classRef = db.collection("classSchedules").doc(classId);
      
      await db.runTransaction(async (transaction) => {
        const classDoc = await transaction.get(classRef);
        if (!classDoc.exists) {
          throw new Error("Class not found");
        }

        const classData = classDoc.data();
        let attendees = classData?.attendees || [];
        let waitlist = classData?.waitlist || [];
        const capacity = classData?.capacity || 0;

        if (action === 'join') {
          if (attendees.includes(clientId) || waitlist.includes(clientId)) {
            throw new Error("Already booked or waitlisted");
          }
          if (attendees.length < capacity) {
            attendees.push(clientId);
          } else {
            waitlist.push(clientId);
          }
        } else if (action === 'leave') {
          const attendeeIndex = attendees.indexOf(clientId);
          if (attendeeIndex > -1) {
            attendees.splice(attendeeIndex, 1);
            // Waitlist FIFO Promotion
            if (waitlist.length > 0) {
              const promotedId = waitlist.shift();
              if (promotedId) attendees.push(promotedId);
            }
          } else {
            const waitlistIndex = waitlist.indexOf(clientId);
            if (waitlistIndex > -1) {
              waitlist.splice(waitlistIndex, 1);
            } else {
              throw new Error("Client not found in attendees or waitlist");
            }
          }
        } else {
          throw new Error("Invalid action");
        }

        transaction.update(classRef, { attendees, waitlist });
      });

      return res.json({ success: true, message: `Class ${action} successful` });
    } catch (err: any) {
      console.error("[Classes Book] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to process booking" });
    }
  });

  // Server-authoritative endpoint for PT/Session booking
  app.post("/api/sessions/book", requireAuth, async (req, res) => {
    try {
      const { sessionData } = req.body;
      if (!sessionData || !sessionData.coachId || !sessionData.clientId || !sessionData.date || !sessionData.startTime || !sessionData.type) {
        return res.status(400).json({ error: "Missing required session fields" });
      }

      const db = await getDbForRequest(req);
      
      const newSessionRef = db.collection("sessions").doc();
      const coachRef = db.collection("coachSchedules").doc(sessionData.coachId);
      const clientRef = db.collection("clients").doc(sessionData.clientId);

      const existingSessionsQuery = db.collection("sessions")
        .where("coachId", "==", sessionData.coachId)
        .where("date", "==", sessionData.date)
        .where("startTime", "==", sessionData.startTime)
        .where("type", "==", sessionData.type)
        .where("status", "in", ["Scheduled", "Completed", "No Show"]);

      await db.runTransaction(async (transaction) => {
        const coachDoc = await transaction.get(coachRef);
        const clientDoc = await transaction.get(clientRef);
        const existingSnap = await transaction.get(existingSessionsQuery);

        if (!coachDoc.exists) throw new Error("Coach schedule not found");
        if (!clientDoc.exists) throw new Error("Client not found");

        const coachSchedule = coachDoc.data()?.days || {};
        const dateObj = new Date(sessionData.date);
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
        const dayOfWeek = days[dateObj.getDay()] as typeof days[number];
        
        const dayConfig = coachSchedule[dayOfWeek];
        if (!dayConfig || !dayConfig.enabled) {
          throw new Error("Coach is not available on this day");
        }

        const capacity = dayConfig.capacities?.[sessionData.type] || 0;
        if (capacity === 0) {
          throw new Error(`Coach does not offer ${sessionData.type} sessions on this day`);
        }

        if (existingSnap.docs.length >= capacity) {
          throw new Error(`This time slot is fully booked for ${sessionData.type} sessions`);
        }

        const client = clientDoc.data()!;
        let packageToDeduct = null;
        let packageIdToUse = sessionData.packageId || null;
        let rootSessionsToDeduct = false;

        const packagesCopy = client.packages ? [...client.packages] : [];
        if (packageIdToUse) {
           const pkgIdx = packagesCopy.findIndex((p: any) => p.id === packageIdToUse && p.status === 'Active');
           if (pkgIdx !== -1 && typeof packagesCopy[pkgIdx].sessionsRemaining === 'number' && packagesCopy[pkgIdx].sessionsRemaining > 0) {
             packageToDeduct = pkgIdx;
           } else {
             throw new Error("Selected package is invalid or has no sessions remaining");
           }
        } else {
           // Find any active package
           const pkgIdx = packagesCopy.findIndex((p: any) => p.status === 'Active' && typeof p.sessionsRemaining === 'number' && p.sessionsRemaining > 0);
           if (pkgIdx !== -1) {
             packageToDeduct = pkgIdx;
             packageIdToUse = packagesCopy[pkgIdx].id;
           } else if (typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0) {
             rootSessionsToDeduct = true;
           } else {
             throw new Error("Client has no sessions remaining in active packages");
           }
        }

        const updateData: any = {};
        if (packageToDeduct !== null) {
          packagesCopy[packageToDeduct].sessionsRemaining -= 1;
          updateData.packages = packagesCopy;
        } else if (rootSessionsToDeduct) {
          updateData.sessionsRemaining = client.sessionsRemaining - 1;
        }

        const newSession = {
          ...sessionData,
          packageId: packageIdToUse,
          status: 'Scheduled',
          createdAt: new Date().toISOString()
        };

        if (Object.keys(updateData).length > 0) {
          transaction.update(clientRef, updateData);
        }
        transaction.set(newSessionRef, newSession);
        
        transaction.set(db.collection("auditLogs").doc(), {
          action: "CREATE",
          entityType: "SESSION",
          entityId: newSessionRef.id,
          details: `Booked ${sessionData.type} session for ${sessionData.date} at ${sessionData.startTime}`,
          timestamp: new Date().toISOString(),
          userId: req.user?.uid || "system",
          userName: req.user?.email || "System API"
        });
      });

      return res.json({ success: true, sessionId: newSessionRef.id });
    } catch (err: any) {
      console.error("[Sessions Book] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to process booking" });
    }
  });

  // Server-authoritative endpoint for PT/Session cancellation
  app.post("/api/sessions/cancel", requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
      }

      const db = await getDbForRequest(req);
      const sessionRef = db.collection("sessions").doc(sessionId);
      
      await db.runTransaction(async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists) throw new Error("Session not found");
        const session = sessionDoc.data()!;
        if (session.status !== 'Scheduled') {
          throw new Error(`Cannot cancel a session with status ${session.status}`);
        }

        const clientRef = db.collection("clients").doc(session.clientId);
        const clientDoc = await transaction.get(clientRef);
        
        if (clientDoc.exists) {
          const client = clientDoc.data()!;
          const updateData: any = {};
          
          if (session.packageId && client.packages) {
            const packagesCopy = [...client.packages];
            const pkgIdx = packagesCopy.findIndex((p: any) => p.id === session.packageId);
            if (pkgIdx !== -1) {
              if (typeof packagesCopy[pkgIdx].sessionsRemaining === 'number') {
                packagesCopy[pkgIdx].sessionsRemaining += 1;
                updateData.packages = packagesCopy;
              }
            }
          } else if (typeof client.sessionsRemaining === 'number') {
             updateData.sessionsRemaining = client.sessionsRemaining + 1;
          }

          if (Object.keys(updateData).length > 0) {
            transaction.update(clientRef, updateData);
          }
        }

        transaction.update(sessionRef, { status: 'Cancelled' });
        
        transaction.set(db.collection("auditLogs").doc(), {
          action: "UPDATE",
          entityType: "SESSION",
          entityId: sessionId,
          details: `Cancelled session and refunded to package`,
          timestamp: new Date().toISOString(),
          userId: req.user?.uid || "system",
          userName: req.user?.email || "System API"
        });
      });

      return res.json({ success: true, message: "Session cancelled" });
    } catch (err: any) {
      console.error("[Sessions Cancel] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to cancel session" });
    }
  });

  // Server-authoritative endpoint for PT/Session reschedule
  app.post("/api/sessions/reschedule", requireAuth, async (req, res) => {
    try {
      const { sessionId, newDate, newStartTime, newEndTime } = req.body;
      if (!sessionId || !newDate || !newStartTime || !newEndTime) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const db = await getDbForRequest(req);
      const sessionRef = db.collection("sessions").doc(sessionId);
      
      await db.runTransaction(async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists) throw new Error("Session not found");
        const session = sessionDoc.data()!;
        if (session.status !== 'Scheduled') {
          throw new Error(`Cannot reschedule a session with status ${session.status}`);
        }

        const coachRef = db.collection("coachSchedules").doc(session.coachId);
        const coachDoc = await transaction.get(coachRef);
        if (!coachDoc.exists) throw new Error("Coach schedule not found");

        const existingSessionsQuery = db.collection("sessions")
          .where("coachId", "==", session.coachId)
          .where("date", "==", newDate)
          .where("startTime", "==", newStartTime)
          .where("type", "==", session.type)
          .where("status", "in", ["Scheduled", "Completed", "No Show"]);

        const existingSnap = await transaction.get(existingSessionsQuery);

        const coachSchedule = coachDoc.data()?.days || {};
        const dateObj = new Date(newDate);
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
        const dayOfWeek = days[dateObj.getDay()] as typeof days[number];
        
        const dayConfig = coachSchedule[dayOfWeek];
        if (!dayConfig || !dayConfig.enabled) {
          throw new Error("Coach is not available on this day");
        }

        const capacity = dayConfig.capacities?.[session.type] || 0;
        if (capacity === 0) {
          throw new Error(`Coach does not offer ${session.type} sessions on this day`);
        }

        if (existingSnap.docs.length >= capacity) {
          throw new Error(`This time slot is fully booked for ${session.type} sessions`);
        }

        transaction.update(sessionRef, {
           date: newDate,
           startTime: newStartTime,
           endTime: newEndTime,
           status: 'Scheduled'
        });

        transaction.set(db.collection("auditLogs").doc(), {
          action: "UPDATE",
          entityType: "SESSION",
          entityId: sessionId,
          details: `Rescheduled session from ${session.date} ${session.startTime} to ${newDate} ${newStartTime}`,
          timestamp: new Date().toISOString(),
          userId: req.user?.uid || "system",
          userName: req.user?.email || "System API"
        });
      });

      return res.json({ success: true, message: "Session rescheduled" });
    } catch (err: any) {
      console.error("[Sessions Reschedule] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to reschedule session" });
    }
  });

  // --- Admin Requests API ---
  app.post("/api/requests/freeze", requireAuth, async (req, res) => {
    try {
      const { requestId } = req.body;
      const db = await getDbForRequest(req);
      
      await db.runTransaction(async (transaction: any) => {
        const reqRef = db.collection("bookingRequests").doc(requestId);
        const reqSnap = await transaction.get(reqRef);
        if (!reqSnap.exists) throw new Error("Request not found");
        
        const reqData = reqSnap.data() as any;
        if (reqData.status !== "Pending" || reqData.type !== "freeze") {
          throw new Error("Invalid or already processed request");
        }
        
        const clientId = reqData.clientId;
        const packageId = reqData.packageId;
        
        const clientRef = db.collection("clients").doc(clientId);
        const clientSnap = await transaction.get(clientRef);
        if (!clientSnap.exists) throw new Error("Client not found");
        
        const clientData = clientSnap.data() as any;
        let packages = clientData.packages || [];
        const pkgIndex = packages.findIndex((p: any) => p.id === packageId);
        
        if (pkgIndex === -1) throw new Error("Package not found on client");
        
        const pkg = packages[pkgIndex];
        if (pkg.status !== "Active") throw new Error("Can only freeze active packages");
        
        // Add 7 days to endDate
        if (pkg.endDate) {
          const endDateObj = new Date(pkg.endDate);
          endDateObj.setDate(endDateObj.getDate() + 7);
          pkg.endDate = endDateObj.toISOString();
        }
        
        pkg.freezeCount = (pkg.freezeCount || 0) + 1;
        packages[pkgIndex] = pkg;
        
        transaction.update(clientRef, { packages });
        transaction.update(reqRef, { status: "Approved", updatedAt: new Date().toISOString() });
      });
      
      return res.json({ success: true, message: "Package frozen for 7 days" });
    } catch (err: any) {
      console.error("[Requests Freeze] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to process freeze" });
    }
  });

  app.post("/api/requests/assessment/assign", requireAuth, async (req, res) => {
    try {
      const { requestId, coachId } = req.body;
      const db = await getDbForRequest(req);
      
      const reqRef = db.collection("assessments").doc(requestId);
      await reqRef.update({
        assignedCoachId: coachId,
        status: "Assigned",
        updatedAt: new Date().toISOString()
      });
      
      return res.json({ success: true, message: "Assessment assigned to coach" });
    } catch (err: any) {
      console.error("[Assessment Assign] Error:", err);
      return res.status(500).json({ error: err.message || "Failed to assign assessment" });
    }
  });

  // Push-notification relay to the Expo push API.
  // Authenticated via requireAuth: previously this was an unauthenticated open relay,
  // so anyone could push arbitrary payloads (including a "url" deep-link field) to any
  // staff/member device token. Requiring a valid Firebase ID token ensures only signed-in
  // users can trigger notifications, and the mobile app's deep-link validation guards the
  // payload regardless.
  app.post("/api/proxy-push", requireAuth, async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
      }
      if (messages.length > 100) {
        return res.status(400).json({ error: "Too many messages in a single request (max 100)." });
      }

      // Expo accepts either a single message object or an array; normalize to array.
      const payload = JSON.stringify(messages);

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: payload,
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
    const templatePath = path.join(distPath, "index.html");
    
    // Read production index.html once on startup
    let productionTemplate = "";
    try {
      if (fs.existsSync(templatePath)) {
        productionTemplate = fs.readFileSync(templatePath, "utf-8");
        console.log("[Server] Loaded production index.html template into memory cache.");
      }
    } catch (err) {
      console.error("[Server] Failed to pre-load production index.html:", err);
    }
    
    // Serve static assets, but do not serve index.html statically (index: false)
    app.use(express.static(distPath, { index: false }));
    
    app.get("*", async (req, res) => {
      const hostname = getRequestHostname(req);
      try {
        const { status } = await getTenantInfoForHost(hostname);
        if (status === 'suspended') {
          return res.status(402).set({ "Content-Type": "text/html" }).end(SUSPENDED_HTML);
        }
        
        // Use cached template if available, fallback to reading from disk
        let template = productionTemplate;
        if (!template) {
          template = fs.readFileSync(templatePath, "utf-8");
        }
        
        // Inject dynamic config into production index.html
        const html = await injectFirebaseConfig(template, hostname);
        
        return res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (error) {
        console.error("Error serving index.html:", error);
        return res.status(500).send("Internal Server Error");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Start background jobs
    startNoShowJob();
  });
}

startServer();
