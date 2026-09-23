const path = require('path');
const fs = require('fs');

/**
 * Tenant Profiles Specification
 * Single source of truth for multi-tenant mobile builds.
 */
const TENANT_PROFILES = {
  strike: {
    APP_NAME: 'STRIKE',
    APP_SLUG: 'strike-eg',
    SCHEME: 'strike-eg',
    BUNDLE_ID: 'com.mitrixogymcrmboxing.crm',
    PRODUCTION_URL: 'https://strike-egy.com/',
    ICON: './assets/icon.png',
    SPLASH: './assets/splash-icon.png',
    ADAPTIVE_FOREGROUND: './assets/android-icon-foreground.png',
    EAS_PROJECT_ID: '91ff5ffa-407c-49c6-9a0e-c1edc54db1fb',
  },
  inzanathletics: {
    APP_NAME: 'INZAN Athletics',
    APP_SLUG: 'inzanathletics',
    SCHEME: 'inzanathletics',
    BUNDLE_ID: 'com.inzanathletics.crm',
    PRODUCTION_URL: 'https://inzanathletics.com/',
    ICON: './assets/inzan/icon.png',
    SPLASH: './assets/inzan/splash-icon.png',
    ADAPTIVE_FOREGROUND: './assets/inzan/android-icon-foreground.png',
    EAS_PROJECT_ID: '0440486c-49e4-4cde-a0de-afb11c7899af',
  },
};

let fileConfig = {};
try {
  fileConfig = require('./config.json');
} catch (_) {
  // config.json is optional — only exists for manual white-label overrides
}

const baseConfig = require('./app.json');

module.exports = ({ config }) => {
  // Resolve active tenant key
  const envTenant = (process.env.APP_TENANT || process.env.GYM_SUBDOMAIN || fileConfig.TENANT_ID || '').toLowerCase();
  const envAppName = process.env.APP_NAME || fileConfig.APP_NAME || '';

  let tenantKey = 'strike';
  if (envTenant.includes('inzan') || envAppName.toLowerCase().includes('inzan')) {
    tenantKey = 'inzanathletics';
  } else if (envTenant && TENANT_PROFILES[envTenant]) {
    tenantKey = envTenant;
  }

  const profile = TENANT_PROFILES[tenantKey] || TENANT_PROFILES.strike;

  // Resolve specific parameters (explicit env/file vars override profile defaults)
  const appName = process.env.APP_NAME || fileConfig.APP_NAME || profile.APP_NAME;
  const appSlug = (process.env.APP_SLUG || fileConfig.APP_SLUG || profile.APP_SLUG).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const appScheme = (process.env.APP_SCHEME || profile.SCHEME).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const bundleId = process.env.BUNDLE_ID || fileConfig.BUNDLE_ID || profile.BUNDLE_ID;
  const productionUrl = process.env.PRODUCTION_URL || fileConfig.PRODUCTION_URL || profile.PRODUCTION_URL;
  const easProjectId = process.env.EAS_PROJECT_ID || fileConfig.EAS_PROJECT_ID || profile.EAS_PROJECT_ID;

  // Validate URL shape
  try {
    new URL(productionUrl);
  } catch (e) {
    throw new Error(`[app.config] PRODUCTION_URL is not a valid URL: ${productionUrl}`);
  }

  // Resolve icon and splash assets
  const projectRoot = __dirname;
  const resolvedIcon = fs.existsSync(path.resolve(projectRoot, profile.ICON))
    ? profile.ICON
    : baseConfig.expo.icon;
  const resolvedSplash = fs.existsSync(path.resolve(projectRoot, profile.SPLASH))
    ? profile.SPLASH
    : (baseConfig.expo.splash && baseConfig.expo.splash.image ? baseConfig.expo.splash.image : './assets/splash-icon.png');
  const resolvedForeground = fs.existsSync(path.resolve(projectRoot, profile.ADAPTIVE_FOREGROUND))
    ? profile.ADAPTIVE_FOREGROUND
    : (baseConfig.expo.android?.adaptiveIcon?.foregroundImage || './assets/android-icon-foreground.png');

  const easConfig = { ...(baseConfig.expo?.extra?.eas || {}) };
  if (easProjectId) {
    easConfig.projectId = easProjectId;
  } else {
    delete easConfig.projectId;
  }

  return {
    ...baseConfig.expo,
    ...(tenantKey === 'inzanathletics' ? { userInterfaceStyle: 'dark', backgroundColor: '#000000', androidStatusBar: { barStyle: 'light-content', backgroundColor: '#000000' }, androidNavigationBar: { barStyle: 'light-content', backgroundColor: '#000000' } } : {}),
    name: appName,
    slug: appSlug,
    scheme: appScheme,
    icon: resolvedIcon,
    ios: {
      ...baseConfig.expo.ios,
      bundleIdentifier: bundleId,
    },
    android: {
      ...baseConfig.expo.android,
      package: bundleId,
      adaptiveIcon: {
        ...baseConfig.expo.android?.adaptiveIcon,
        foregroundImage: resolvedForeground,
        ...(tenantKey === 'inzanathletics' ? { backgroundColor: '#000000' } : {}),
      },
    },
    splash: {
      ...baseConfig.expo.splash,
      image: resolvedSplash,
      ...(tenantKey === 'inzanathletics' ? { backgroundColor: '#000000' } : {}),
    },
    extra: {
      ...baseConfig.expo.extra,
      eas: easConfig,
      PRODUCTION_URL: productionUrl,
      APP_NAME: appName,
      APP_TENANT: tenantKey,
    },
  };
};
