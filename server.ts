import express from "express";
import path from "path";
import fs from "fs";
import { provisionNewGym } from "./provisioning";

// Use process.cwd() instead of __dirname to avoid ESM/CJS path resolution issues on Windows
const __dirname = process.cwd();

// Load the default credentials to use as a fallback / local config
const defaultFirebaseConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8")
);

// Map hostnames to their respective database configurations.
// In production, these could be fetched dynamically from a database (e.g. Redis, Firestore admin) or GCS.
const tenantConfigs: Record<string, any> = {
  "localhost": defaultFirebaseConfig,
  "strike.mitrixo.com": defaultFirebaseConfig,
  "strikeboxing.mitrixo.com": defaultFirebaseConfig, // Map the original Strike CRM to the default database
  "mitrixogymcrm-boxing.local": {
    ...defaultFirebaseConfig,
    projectId: "mitrixogymcrm-boxing-tenant-1",
  },
  "other-gym.local": {
    ...defaultFirebaseConfig,
    projectId: "other-gym-tenant-2",
  }
};

function getFirebaseConfigForHost(hostname: string) {
  // Matches exact hostname in manual configs
  if (tenantConfigs[hostname]) {
    return tenantConfigs[hostname];
  }
  
  // Resolve dynamically based on subdomains (e.g., gym1.mitrixo.com -> db-gym1)
  const parts = hostname.toLowerCase().split(".");
  if (parts.length >= 3) {
    const subdomain = parts[0];
    // Ignore common non-tenant subdomains
    if (subdomain !== "www" && subdomain !== "api") {
      console.log(`[Server] Dynamically routing hostname "${hostname}" to database "db-${subdomain}"`);
      return {
        ...defaultFirebaseConfig,
        firestoreDatabaseId: `db-${subdomain}`
      };
    }
  }
  
  return defaultFirebaseConfig;
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

function injectFirebaseConfig(html: string, hostname: string): string {
  const config = getFirebaseConfigForHost(hostname);
  const scriptTag = `<script type="text/javascript">window.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};</script>`;
  return html.replace("<!-- FIREBASE_CONFIG_PLACEHOLDER -->", scriptTag);
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
      const url = req.originalUrl;
      try {
        const templatePath = path.join(process.cwd(), "index.html");
        let template = fs.readFileSync(templatePath, "utf-8");
        
        // Transform the template (injects react preambles, HMR client script, etc.)
        template = await vite.transformIndexHtml(url, template);
        
        // Inject the dynamic client config
        const html = injectFirebaseConfig(template, getRequestHostname(req));
        
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve static assets, but do not serve index.html statically (index: false)
    app.use(express.static(distPath, { index: false }));
    
    app.get("*", (req, res) => {
      try {
        const templatePath = path.join(distPath, "index.html");
        const template = fs.readFileSync(templatePath, "utf-8");
        
        // Inject dynamic config into production index.html
        const html = injectFirebaseConfig(template, getRequestHostname(req));
        
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (error) {
        console.error("Error serving index.html:", error);
        res.status(500).send("Internal Server Error");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
