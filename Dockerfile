# ==============================================================================
# Multi-Stage Production Dockerfile for Strike Gym Dedicated Cloud Run
# ==============================================================================

# Stage 1: Build Assets
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Minimal Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV STANDALONE_MODE=true
ENV STANDALONE_TENANT_ID=strike
ENV PORT=8080

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/firebase.standalone.json ./firebase.json
COPY --from=builder /app/firestore-tenant.rules ./firestore.rules
COPY --from=builder /app/firestore.indexes.json ./firestore.indexes.json
COPY --from=builder /app/storage.rules ./storage.rules
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Cloud Run defaults to port 8080
EXPOSE 8080

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

CMD ["node", "dist-server/server.cjs"]
