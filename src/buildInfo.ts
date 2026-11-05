/**
 * Build information - injected at build time via Vite env vars.
 * VITE_BUILD_COMMIT    → set in Dockerfile as --build-arg VITE_BUILD_COMMIT=$(git rev-parse --short HEAD)
 * VITE_BUILD_TIMESTAMP → set in Dockerfile via $(date -u) during RUN npm run build
 */

const SYSTEM_VERSION = '12.5';
const BUILD_COMMIT = import.meta.env.VITE_BUILD_COMMIT || '32befec';
// Fixed release date of version 12.5 rather than dynamic clock
const LAST_UPDATE_DATE = 'Nov 5, 2026';

export const buildInfo = {
  systemVersion: SYSTEM_VERSION,
  version: `v${SYSTEM_VERSION}`,
  commit: BUILD_COMMIT.substring(0, 7),
  fullCommit: BUILD_COMMIT,
  lastUpdated: LAST_UPDATE_DATE,
  timestamp: LAST_UPDATE_DATE,
  displayText: `System v${SYSTEM_VERSION} • Last Updated: ${LAST_UPDATE_DATE}`,
};

export default buildInfo;
