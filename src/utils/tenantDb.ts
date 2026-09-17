import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Load the default credentials to use as a fallback / local config
export const defaultFirebaseConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8')
);

// Map hostnames to their respective database configurations.
export const strikeCrmConfig = {
  ...defaultFirebaseConfig,
  tenantId: 'strike',
};
delete (strikeCrmConfig as any).firestoreDatabaseId;

export const inzanConfig = {
  ...defaultFirebaseConfig,
  firestoreDatabaseId: 'db-inzanathletics',
  tenantId: 'inzanathletics',
};

export const tenantConfigs: Record<string, any> = {
  'localhost': defaultFirebaseConfig, // has firestoreDatabaseId: "db-test"
  'strike.mitrixo.com': strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  'strikeboxing.mitrixo.com': strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  'dashboard.strikeboxing-eg.pro': strikeCrmConfig, // no firestoreDatabaseId, defaults to (default)
  'strike-egy.com': strikeCrmConfig,
  'www.strike-egy.com': strikeCrmConfig,
  'strike.localhost': strikeCrmConfig,
  'inzanathletics.mitrixo.com': inzanConfig,
  'inzanathletics.com': inzanConfig,
  'www.inzanathletics.com': inzanConfig,
  'inzanathletics.localhost': inzanConfig,
  'inzan.localhost': inzanConfig,
  'inzanathletics.local': inzanConfig,
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
    const customQuery = await centralDb
      .collection('tenants')
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
  // 1. Explicit query parameter (e.g. ?tenant=inzan)
  if (req.query?.tenant) {
    const t = String(req.query.tenant).toLowerCase();
    if (t === 'inzan' || t === 'inzanathletics') return 'inzanathletics.mitrixo.com';
    if (t === 'strike' || t === 'strikeboxing') return 'strike.mitrixo.com';
  }

  // 2. Explicit tenant header or body (e.g. x-tenant-id: inzanathletics)
  const headerOrBodyTenant = (
    (req.headers['x-tenant-id'] as string) ||
    (req.body && typeof req.body === 'object' && req.body.tenantId) ||
    ''
  ).toLowerCase();
  if (headerOrBodyTenant === 'inzan' || headerOrBodyTenant === 'inzanathletics') return 'inzanathletics.mitrixo.com';
  if (headerOrBodyTenant === 'strike' || headerOrBodyTenant === 'strikeboxing') return 'strike.mitrixo.com';

  // 3. Referer header (when called from local dev browser like http://localhost:3000/?tenant=inzan)
  const referer = req.headers.referer;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const refTenant = refUrl.searchParams.get('tenant')?.toLowerCase();
      if (refTenant === 'inzan' || refTenant === 'inzanathletics') return 'inzanathletics.mitrixo.com';
      if (refTenant === 'strike' || refTenant === 'strikeboxing') return 'strike.mitrixo.com';
      if (refUrl.hostname && (refUrl.hostname.includes('inzanathletics') || refUrl.hostname.includes('inzan'))) {
        return 'inzanathletics.mitrixo.com';
      }
      if (refUrl.hostname && refUrl.hostname.includes('strike')) return 'strike.mitrixo.com';
    } catch {}
  }

  // 4. Hostname
  if (req.hostname && req.hostname !== 'localhost') {
    return req.hostname;
  }
  return ((req.get('host') || 'localhost').split(':')[0] as string);
}

export async function getDbForRequest(req: Request): Promise<Firestore> {
  const hostname = getRequestHostname(req);
  const { config } = await getTenantInfoForHost(hostname);
  if (config && config.firestoreDatabaseId) {
    return getFirestore(config.firestoreDatabaseId);
  }
  return getFirestore();
}

export async function getTenantIdForRequest(req: Request): Promise<string> {
  const hostname = getRequestHostname(req);
  const { config } = await getTenantInfoForHost(hostname);
  return config?.tenantId || 'strike';
}
