/**
 * Dynamic Expo config — reads EAS build-time env vars.
 *
 * process.env is available HERE (Node context during `expo prebuild` / `eas build`)
 * but NOT inside App.js at runtime. Values flow:
 *   process.env → extra → Constants.expoConfig.extra
 *
 * For white-label builds, the generate_white_label.cjs script creates config.json
 * which is loaded as a fallback when env vars aren't set.
 *
 * IMPORTANT: STRIKE is the ONLY tenant that may fall back to hardcoded defaults.
 * White-label builds MUST set PRODUCTION_URL + APP_NAME explicitly (via EAS env or
 * config.json). A missing config on a non-STRIKE build throws at build time so we
 * never silently ship one gym's app pointing at another gym's data.
 */

const STRIKE_DEFAULTS = {
  PRODUCTION_URL: 'https://strike-egy.com/',
  APP_NAME: 'STRIKE',
};

let fileConfig = {};
try {
  fileConfig = require('./config.json');
} catch (_) {
  // config.json is optional — only exists for white-label builds
}

const baseConfig = require('./app.json');

module.exports = ({ config }) => {
  const productionUrl = process.env.PRODUCTION_URL || fileConfig.PRODUCTION_URL;
  const appName = process.env.APP_NAME || fileConfig.APP_NAME;

  // No explicit config at all — only allowed for the STRIKE tenant.
  if (!productionUrl && !appName) {
    // Safe: this is the documented STRIKE default build.
    return {
      ...baseConfig.expo,
      extra: {
        ...baseConfig.expo.extra,
        ...STRIKE_DEFAULTS,
      },
    };
  }

  // Partial config is never valid — fail loudly at build time.
  if (!productionUrl || !appName) {
    throw new Error(
      `[app.config] Incomplete white-label config: PRODUCTION_URL=${productionUrl ?? '(missing)'} ` +
      `APP_NAME=${appName ?? '(missing)'}. Set both via EAS env or config.json. ` +
      `If this is the STRIKE build, omit both to use the STRIKE defaults.`
    );
  }

  // Validate URL shape so a typo doesn't ship an app that loads nothing.
  try {
    new URL(productionUrl);
  } catch (e) {
    throw new Error(`[app.config] PRODUCTION_URL is not a valid URL: ${productionUrl}`);
  }

  return {
    ...baseConfig.expo,
    extra: {
      ...baseConfig.expo.extra,
      PRODUCTION_URL: productionUrl,
      APP_NAME: appName,
    },
  };
};
