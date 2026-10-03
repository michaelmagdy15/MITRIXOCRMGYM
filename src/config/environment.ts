/**
 * Environment & Deployment Mode Configuration
 * 
 * Supports both:
 * 1. Multi-tenant mode (central deployment serving Inzan Athletics & other white-label gyms)
 * 2. Standalone mode (dedicated client deployment for Strike in their own GCP project)
 */

export const isStandaloneMode = (): boolean => {
  // Check browser-injected or Node process env
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.STANDALONE_MODE === 'true' || process.env.VITE_STANDALONE_MODE === 'true') {
      return true;
    }
  }

  if (typeof window !== 'undefined') {
    const dynamicConfig = (window as any).__FIREBASE_CONFIG__;
    if (dynamicConfig?.standaloneMode === true) {
      return true;
    }
  }

  return false;
};

export const getStandaloneTenantId = (): string => {
  if (typeof process !== 'undefined' && process.env?.STANDALONE_TENANT_ID) {
    return process.env.STANDALONE_TENANT_ID.toLowerCase().trim();
  }
  if (typeof window !== 'undefined') {
    const dynamicConfig = (window as any).__FIREBASE_CONFIG__;
    if (dynamicConfig?.tenantId) {
      return dynamicConfig.tenantId;
    }
  }
  return 'strike';
};
