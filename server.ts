import express from "express";
import path from "path";
import fs from "fs";
import { getFirestore } from 'firebase-admin/firestore';
import { provisionNewGym } from "./provisioning";

// Use process.cwd() instead of __dirname to avoid ESM/CJS path resolution issues on Windows
const __dirname = process.cwd();

// Load the default credentials to use as a fallback / local config
const defaultFirebaseConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8")
);

// Map hostnames to their respective database configurations.
const strikeCrmConfig = { ...defaultFirebaseConfig };
delete strikeCrmConfig.firestoreDatabaseId;

const tenantConfigs: Record<string, any> = {
  "localhost": defaultFirebaseConfig, // has firestoreDatabaseId: "db-test"
  "strike.mitrixo.com": strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  "strikeboxing.mitrixo.com": strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  "dashboard.strikeboxing-eg.pro": strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  "mitrixogymcrm-boxing.local": {
    ...defaultFirebaseConfig,
    projectId: "mitrixogymcrm-boxing-tenant-1",
  },
  "other-gym.local": {
    ...defaultFirebaseConfig,
    projectId: "other-gym-tenant-2",
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
            firestoreDatabaseId: data.databaseId
          };
          cache[normalizedHost] = { config, status: data.status || 'active', expiresAt: Date.now() + CACHE_TTL_MS };
          return { config, status: data.status || 'active' };
        }
      }
    }
    
    // B. Search by subdomain (e.g. gym.mitrixo.com -> subdomain 'gym')
    const parts = normalizedHost.split('.');
    if (parts.length >= 3) {
      const subdomain = parts[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        const subDoc = await centralDb.collection('tenants').doc(subdomain).get();
        if (subDoc.exists) {
          const data = subDoc.data();
          if (data) {
            const config = {
              ...defaultFirebaseConfig,
              firestoreDatabaseId: data.databaseId
            };
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
  return req.hostname;
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
  app.post("/api/provision", async (req, res) => {
    const { tenantId, tenantName, ownerEmail, ownerName, ownerPassword, locationId, enableMobileApp } = req.body;
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
      });
      return res.json(result);
    } catch (error) {
      console.error("[Server] Provisioning error:", error);
      return res.status(500).json({ error: (error as Error).message });
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
