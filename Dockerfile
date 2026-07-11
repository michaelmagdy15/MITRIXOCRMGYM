# Use a multi-stage build for efficiency
# Stage 1: Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
# Using npm ci with retries to mitigate ECONNRESET network issues in Cloud Build
RUN npm config set fetch-retry-maxtimeout 6000000 && npm config set fetch-retry-mintimeout 10000 && npm ci || npm ci

# Copy the rest of the application code
COPY . .

# Build argument for Gemini API Key (needed for Vite build)
ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

# Build arguments for version tracking
ARG VITE_BUILD_COMMIT=unknown
ARG VITE_BUILD_TIMESTAMP
ENV VITE_BUILD_COMMIT=$VITE_BUILD_COMMIT
ENV VITE_BUILD_TIMESTAMP=$VITE_BUILD_TIMESTAMP

# Run the build script
# This produces dist/assets (frontend) and dist/server.cjs (backend)
RUN VITE_BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ") npm run build

# Stage 2: Runtime stage
FROM node:20-slim

WORKDIR /app

# Copy the production output from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/firebase-applet-config.json ./
COPY --from=builder /app/root.crt ./

# Install only production dependencies cleanly and ignore postinstall scripts that fail
RUN npm ci --omit=dev --ignore-scripts

# The server listens on the port defined by the Cloud Run environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Run the bundled server
CMD ["node", "dist-server/server.cjs"]
