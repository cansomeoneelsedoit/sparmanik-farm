# syntax=docker/dockerfile:1.6
# Production multi-stage build for the Next.js + Prisma app.
# Build:   docker build -t sparmanikfarm .
# Run:     docker run -p 3000:3000 --env-file .env sparmanikfarm

ARG NODE_VERSION=22-alpine

# ---------- 1. deps: install production-shaped dependencies ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---------- 2. builder: compile Next.js ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ---------- 3. runner: minimal runtime image ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat openssl tini \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Ship the standalone Next.js server + static assets + prisma client/migrations
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# NOTE: We intentionally do NOT switch to a non-root user. Railway mounts the
# persistent Volume (e.g. /data) at runtime as root, after which a non-root
# container cannot mkdir/chmod inside the mount. Running the app as root keeps
# Ask AI image uploads + other Volume writes working without an init sidecar.
# The container is isolated, so the security trade-off is acceptable.
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["/sbin/tini", "--"]
# Ensure the upload dir exists + is writable, run pending migrations, start.
CMD sh -c "mkdir -p \"${UPLOAD_DIR:-./uploads}\" && chmod 777 \"${UPLOAD_DIR:-./uploads}\" && npx prisma migrate deploy && npm run start"
