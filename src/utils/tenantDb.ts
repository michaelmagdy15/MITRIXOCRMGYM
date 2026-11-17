import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { isStandaloneMode, getStandaloneTenantId } from '../config/environment.js';
import { strikeDedicatedFirebaseConfig } from '../config/strikeDedicatedConfig.js';
import { inzanFirebaseConfig } from '../config/inzanFirebaseConfig.js';

function parseServiceAccountFromEnv(raw?: string): admin.ServiceAccount | undefined {
  if (!raw || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('[tenantDb] Failed to parse service account env JSON:', e);
    return undefined;
  }
}

function getCredentialForProject(projectId: string): admin.credential.Credential | undefined {
  if (projectId === 'inzan-crm-spark-26' || projectId === inzanFirebaseConfig.projectId) {
    const sa = parseServiceAccountFromEnv(process.env.FIREBASE_SA_INZAN_JSON);
    if (sa) return admin.credential.cert(sa);
  }
  if (projectId === 'vbt-camp-spark-26') {
    const sa = parseServiceAccountFromEnv(process.env.FIREBASE_SA_VBT_JSON);
    if (sa) return admin.credential.cert(sa);
  }
  const saEnvPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saEnvPath && fs.existsSync(saEnvPath)) {
    try {
      const saKey = JSON.parse(fs.readFileSync(saEnvPath, 'utf8'));
      if (!saKey.project_id || saKey.project_id === projectId) {
        return admin.credential.cert(saKey);
      }
    } catch (e) {
      console.error('Failed to parse service account key in tenantDb.ts:', e);
    }
  }
  return undefined;
}

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  const initialProjectId = isStandaloneMode()
    ? 'strike-production-f5242'
    : process.env.FIREBASE_PROJECT_ID || inzanFirebaseConfig.projectId || 'faa-test-guide-v2';
  const adminOptions: admin.AppOptions = { projectId: initialProjectId };
  const cred = getCredentialForProject(initialProjectId);
  if (cred) adminOptions.credential = cred;
  admin.initializeApp(adminOptions);
}

const projectAdminApps = new Map<string, admin.app.App>();

export function getAdminAppForProject(projectId: string): admin.app.App {
  const targetProjectId = (projectId || defaultFirebaseConfig.projectId || 'inzan-crm-spark-26').trim();
  const cached = projectAdminApps.get(targetProjectId);
  if (cached) return cached;

  const defaultApp = admin.apps[0];
  if (defaultApp && defaultApp.options.projectId === targetProjectId) {
    projectAdminApps.set(targetProjectId, defaultApp);
    return defaultApp;
  }

  const appName = `project-${targetProjectId}`;
  const existingNamed = admin.apps.find((a) => a?.name === appName);
  if (existingNamed) {
    projectAdminApps.set(targetProjectId, existingNamed);
    return existingNamed;
  }

  const opts: admin.AppOptions = { projectId: targetProjectId };
  const cred = getCredentialForProject(targetProjectId);
  if (cred) opts.credential = cred;
  const created = admin.initializeApp(opts, appName);
  projectAdminApps.set(targetProjectId, created);
  return created;
}

// Load the default credentials to use as a fallback / local config
export const defaultFirebaseConfig = isStandaloneMode()
  ? strikeDedicatedFirebaseConfig
  : JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

// Map hostnames to their respective database configurations.
export const strikeCrmConfig = {
  ...strikeDedicatedFirebaseConfig,
  tenantId: 'strike',
};
delete (strikeCrmConfig as any).firestoreDatabaseId;

export const inzanConfig = inzanFirebaseConfig;

export const vbtConfig = {
  projectId: 'vbt-camp-spark-26',
  tenantId: 'vbt',
};

export const tenantConfigs: Record<string, any> = {
  'localhost': defaultFirebaseConfig, // has firestoreDatabaseId: "db-test"
  'strike.mitrixo.com': strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  'strikeboxing.mitrixo.com': strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  'dashboard.strikeboxing-eg.pro': strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  'strike-egy.com': strikeCrmConfig,
  'www.strike-egy.com': strikeCrmConfig,
  'admin.strike-egy.com': strikeCrmConfig,
  'app.strike-egy.com': strikeCrmConfig,
  'strike.localhost': strikeCrmConfig,
  'inzanathletics.mitrixo.com': inzanConfig,
  'admin.inzanathletics.com': inzanConfig,
  'app.inzanathletics.com': inzanConfig,
  'portal.inzanathletics.com': inzanConfig,
  'crm.inzanathletics.com': inzanConfig,
  'members.inzanathletics.com': inzanConfig,
  'inzanathletics.localhost': inzanConfig,
  'inzan.localhost': inzanConfig,
  'inzanathletics.local': inzanConfig,
  'vbt.mitrixo.com': vbtConfig,
  'vbt-camp.pages.dev': vbtConfig,
  'vbt.localhost': vbtConfig,
  'mitrixogymcrm-boxing.local': {
    ...defaultFirebaseConfig,
    projectId: 'mitrixogymcrm-boxing-tenant-1',
    tenantId: 'mitrixogymcrm-boxing',
  },
  'other-gym.local': {
    ...defaultFirebaseConfig,
    projectId: 'other-gym-tenant-2',
    tenantId: 'other-gym',
  },
};

// Caching interface for tenant lookups
interface CacheEntry {
  config: any;
  status: 'active' | 'suspended' | 'not_found';
  expiresAt: number;
}

const cache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

export async function getTenantInfoForHost(hostname: string): Promise<{ config: any; status: string }> {
  // Fast path: In standalone deployment, route directly to local standalone config
  if (isStandaloneMode()) {
    if (hostname.toLowerCase().includes('inzan')) {
      throw new Error('[API] Inzan requires the central deployment; this server is configured for Strike standalone mode.');
    }
    const standaloneConfig = {
      ...strikeDedicatedFirebaseConfig,
      tenantId: getStandaloneTenantId(),
    };
    delete (standaloneConfig as any).firestoreDatabaseId;
    return { config: standaloneConfig, status: 'active' };
  }

  const normalizedHost = hostname.toLowerCase().trim();

  // 1. Intercept superadmin subdomains to route them directly to the registry database
  const hostParts = normalizedHost.split('.');
  if (hostParts.length >= 2 && hostParts[0] === 'superadmin') {
    const registryConfig = {
      ...defaultFirebaseConfig,
      firestoreDatabaseId: 'db-registry-2',
    };
    return { config: registryConfig, status: 'active' };
  }

  // 2. Distinguish public marketing/landing domains from the CRM dashboard
  if (normalizedHost === 'inzanathletics.com' || normalizedHost === 'www.inzanathletics.com') {
    return { config: inzanConfig, status: 'landing_page' };
  }

  // 3. Direct fast-path for known tenant domains & subdomains
  if (
    normalizedHost === 'admin.inzanathletics.com' ||
    normalizedHost.startsWith('admin.inzan') ||
    normalizedHost === 'inzanathletics.mitrixo.com' ||
    normalizedHost.includes('inzanathletics') ||
    normalizedHost.includes('inzan')
  ) {
    return { config: inzanConfig, status: 'active' };
  }
  if (normalizedHost.includes('strike-egy') || normalizedHost.includes('strikeboxing') || normalizedHost.startsWith('strike.')) {
    return { config: strikeCrmConfig, status: 'active' };
  }
  if (normalizedHost.startsWith('vbt.') || normalizedHost.includes('vbt-camp')) {
    return { config: vbtConfig, status: 'active' };
  }

  // 3. Check in-memory Cache
  const cached = cache[normalizedHost];
  if (cached && Date.now() < cached.expiresAt) {
    return { config: cached.config, status: cached.status };
  }

  // 4. Fallbacks for localhost & static configs
  if (tenantConfigs[normalizedHost]) {
    return { config: tenantConfigs[normalizedHost], status: 'active' };
  }

  if (process.env.DISABLE_REGISTRY_DB === 'true') {
    cache[normalizedHost] = { config: defaultFirebaseConfig, status: 'not_found', expiresAt: Date.now() + CACHE_TTL_MS };
    return { config: defaultFirebaseConfig, status: 'not_found' };
  }

  try {
    const centralDb = getFirestore('db-registry-2');

    // A. Search by customDomain (exact match, or apex match for subdomains like admin.gym.com)
    let customQuery = await centralDb
      .collection('tenants')
      .where('customDomain', '==', normalizedHost)
      .limit(1)
      .get();

    if (customQuery.empty && hostParts.length > 2) {
      const rootDomain = hostParts.slice(-2).join('.');
      customQuery = await centralDb
        .collection('tenants')
        .where('customDomain', '==', rootDomain)
        .limit(1)
        .get();
    }

    if (!customQuery.empty) {
      const docSnap = customQuery.docs[0];
      if (docSnap) {
        const data = docSnap.data();
        if (data) {
          const config = {
            ...defaultFirebaseConfig,
            firestoreDatabaseId: data.databaseId === '(default)' ? undefined : data.databaseId,
            tenantId: data.tenantId || docSnap.id,
          };
          if (config.firestoreDatabaseId === undefined) {
            delete (config as any).firestoreDatabaseId;
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
              tenantId: data.tenantId || subDoc.id,
            };
            if (config.firestoreDatabaseId === undefined) {
              delete (config as any).firestoreDatabaseId;
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

export function getRequestHostname(req: Request): string {
  const reqPath = String(req.originalUrl || req.path || '');
  // On-site Mac bridge, RedGITS agent, and /api/inzan/* gateway calls belong strictly to Inzan Athletics.
  if (reqPath.startsWith('/api/inzan/')) {
    return 'admin.inzanathletics.com';
  }

  const enforceProxySecret =
    process.env.NODE_ENV === 'production' &&
    !isStandaloneMode() &&
    Boolean(process.env.PROXY_SHARED_SECRET);
  const hasTrustedProxyHeader =
    !enforceProxySecret ||
    req.headers['x-proxy-secret'] === process.env.PROXY_SHARED_SECRET;

  if (hasTrustedProxyHeader) {
    // 1. Explicit query parameter (e.g. ?tenant=inzan)
    if (req.query?.tenant) {
      const t = String(req.query.tenant).toLowerCase();
      if (t === 'inzan' || t === 'inzanathletics') return 'admin.inzanathletics.com';
      if (t === 'strike' || t === 'strikeboxing') return 'strike.mitrixo.com';
      if (t === 'vbt') return 'vbt.mitrixo.com';
    }

    // 2. Explicit tenant header or body (e.g. x-tenant-id: inzanathletics)
    const headerOrBodyTenant = (
      (req.headers['x-tenant-id'] as string) ||
      (req.body && typeof req.body === 'object' && req.body.tenantId) ||
      ''
    ).toLowerCase();
    if (headerOrBodyTenant === 'inzan' || headerOrBodyTenant === 'inzanathletics') return 'admin.inzanathletics.com';
    if (headerOrBodyTenant === 'strike' || headerOrBodyTenant === 'strikeboxing') return 'strike.mitrixo.com';
    if (headerOrBodyTenant === 'vbt') return 'vbt.mitrixo.com';
  }

  // 3. Referer header (only on localhost or when proxied with trusted secret)
  const referer = req.headers.referer;
  if (referer && (hasTrustedProxyHeader || req.hostname === 'localhost')) {
    try {
      const refUrl = new URL(referer);
      const refTenant = refUrl.searchParams.get('tenant')?.toLowerCase();
      if (refTenant === 'inzan' || refTenant === 'inzanathletics') return 'admin.inzanathletics.com';
      if (refTenant === 'strike' || refTenant === 'strikeboxing') return 'strike.mitrixo.com';
      if (refTenant === 'vbt' || refUrl.hostname?.startsWith('vbt.') || refUrl.hostname?.includes('vbt-camp')) return 'vbt.mitrixo.com';
      if (refUrl.hostname && (refUrl.hostname.includes('inzanathletics') || refUrl.hostname.includes('inzan'))) {
        return refUrl.hostname.toLowerCase();
      }
      if (refUrl.hostname && refUrl.hostname.includes('strike')) return refUrl.hostname.toLowerCase();
    } catch {}
  }

  // 4. Reverse proxy X-Forwarded-Host (trusted when proxy secret matches or outside hardened gateway)
  if (hasTrustedProxyHeader) {
    const rawForwarded = typeof req.headers?.['x-forwarded-host'] === 'string'
      ? req.headers['x-forwarded-host']
      : (Array.isArray(req.headers?.['x-forwarded-host']) ? (req.headers['x-forwarded-host'][0] || '') : '');
    const forwardedHost = ((rawForwarded.split(',')[0] || '').trim().split(':')[0] || '').toLowerCase();
    if (forwardedHost && forwardedHost !== 'localhost') {
      return forwardedHost;
    }
  }

  // 5. Direct Host header
  if (req.hostname && req.hostname !== 'localhost') {
    return req.hostname.toLowerCase();
  }
  return ((req.get('host') || 'localhost').split(':')[0] as string).toLowerCase();
}

export function getDbForTenant(tenantId: string): Firestore {
  const normalized = (tenantId || '').toLowerCase();
  if (isStandaloneMode() || normalized === 'strike' || normalized === 'strikeboxing') {
    const app = getAdminAppForProject(strikeDedicatedFirebaseConfig.projectId);
    return getFirestore(app);
  }
  if (normalized === 'vbt') {
    return getFirestore(getAdminAppForProject('vbt-camp-spark-26'));
  }
  if (normalized === 'inzan' || normalized === 'inzanathletics') {
    const app = getAdminAppForProject(inzanFirebaseConfig.projectId);
    return getFirestore(app);
  }
  return getFirestore();
}

export function getAuthForTenant(tenantId: string): admin.auth.Auth {
  const normalized = (tenantId || '').toLowerCase();
  if (isStandaloneMode() || normalized === 'strike' || normalized === 'strikeboxing') {
    return admin.auth(getAdminAppForProject(strikeDedicatedFirebaseConfig.projectId));
  }
  if (normalized === 'vbt') {
    return admin.auth(getAdminAppForProject('vbt-camp-spark-26'));
  }
  if (normalized === 'inzan' || normalized === 'inzanathletics') {
    return admin.auth(getAdminAppForProject(inzanFirebaseConfig.projectId));
  }
  return admin.auth();
}

export async function getAuthForRequest(req: Request): Promise<admin.auth.Auth> {
  const hostname = getRequestHostname(req);
  const { config } = await getTenantInfoForHost(hostname);
  const app = getAdminAppForProject(config?.projectId || defaultFirebaseConfig.projectId);
  return admin.auth(app);
}

export async function getDbForRequest(req: Request): Promise<Firestore> {
  const hostname = getRequestHostname(req);
  const { config } = await getTenantInfoForHost(hostname);
  const app = getAdminAppForProject(config?.projectId || defaultFirebaseConfig.projectId);
  if (config && config.firestoreDatabaseId) {
    return getFirestore(app, config.firestoreDatabaseId);
  }
  return getFirestore(app);
}

export async function getTenantIdForRequest(req: Request): Promise<string> {
  const hostname = getRequestHostname(req);
  const { config } = await getTenantInfoForHost(hostname);
  return config?.tenantId || 'strike';
}
