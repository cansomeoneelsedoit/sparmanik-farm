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

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["/sbin/tini", "--"]
# Run pending migrations on boot, then start Next.js.
CMD sh -c "npx prisma migrate deploy && npm run start"
