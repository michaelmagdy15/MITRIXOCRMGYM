/**
 * Dynamic Expo config — reads EAS build-time env vars.
 *
 * process.env is available HERE (Node context during `expo prebuild` / `eas build`)
 * but NOT inside App.js at runtime. Values flow:
 *   process.env → extra → Constants.expoConfig.extra
 *
 * For white-label builds, the generate_white_label.cjs script creates config.json
 * which is loaded as a fallback when env vars aren't set.
 */

let fileConfig = {};
try {
  fileConfig = require('./config.json');
} catch (_) {
  // config.json is optional — only exists for white-label builds
}

const baseConfig = require('./app.json');

module.exports = ({ config }) => {
  return {
    ...baseConfig.expo,
    extra: {
      ...baseConfig.expo.extra,
      PRODUCTION_URL:
        process.env.PRODUCTION_URL ||
        fileConfig.PRODUCTION_URL ||
        'https://strike-egy.com/',
      APP_NAME:
        process.env.APP_NAME ||
        fileConfig.APP_NAME ||
        'STRIKE',
    },
  };
};
