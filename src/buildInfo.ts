/**
 * Build information - injected at build time via Vite env vars.
 * VITE_BUILD_COMMIT  → set in Dockerfile as --build-arg VITE_BUILD_COMMIT=$(git rev-parse --short HEAD)
 * VITE_BUILD_TIMESTAMP → set in Dockerfile via $(date -u) during RUN npm run build
 */

const BUILD_COMMIT = import.meta.env.VITE_BUILD_COMMIT || 'dev';
const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP || new Date().toISOString();

export const buildInfo = {
  version: `Build ${BUILD_COMMIT.substring(0, 7)}`,
  fullCommit: BUILD_COMMIT,
  timestamp: BUILD_TIMESTAMP,
  displayText: `v${BUILD_COMMIT.substring(0, 7)} | ${new Date(BUILD_TIMESTAMP).toLocaleDateString()} ${new Date(BUILD_TIMESTAMP).toLocaleTimeString()}`,
};

export default buildInfo;
