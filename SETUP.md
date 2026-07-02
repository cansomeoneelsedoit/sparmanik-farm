# Sparmanik Farm — Setup Guide

Cultivation OS for a hydroponic farm in Indonesia. Full-stack **Next.js 16 + Postgres + Prisma** app, multi-tenant, deployed on Railway.

- **Live / repo URLs and credentials:** kept out of this file (it may be committed to a public repo). See your local notes.
- **Canonical local path:** `C:\Users\boyds\Desktop\sparmanikfarm`
- **Dev sign-in:** the local seed prints the dev login to the console on first run.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **22.x** | Matches the Docker base image (`node:22-alpine`) |
| npm | 10+ | Repo uses `npm ci` (strict lockfile) |
| Docker + Docker Compose | latest | Recommended path for local dev (runs Postgres + app) |
| Git | any | Repo is LF; CRLF warnings on Windows checkout are normal |
| Postgres 16 | optional | Only if running without Docker |

---

## 2. Tech stack reference

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router + Turbopack) | `16.2.4` |
| UI runtime | React / React DOM | `19.2.4` |
| Language | TypeScript (`strict: true`) | `5.7` |
| Database | Postgres | `16-alpine` |
| ORM | Prisma (`prisma-client-js` legacy generator) | `6.x` |
| Auth | Auth.js / NextAuth v5 (JWT sessions) | `5.0.0-beta.31` |
| Styling | Tailwind CSS v4 + shadcn/Radix primitives | v4 |
| i18n | next-intl (EN / ID, cookie locale) | `4.x` |
| Forms | react-hook-form + zod | — |
| Tests | Vitest + fast-check | `2.x` |
| AI | `@anthropic-ai/sdk` (Claude) + `@google/generative-ai` (Gemini) | dual-provider, env-gated |
| Money | decimal.js — `Decimal(18,4)` | always serialize to string across RSC boundary |
| Images | sharp | resize on upload |

---

## 3. Local development (Docker Compose — recommended)

This is the fastest path: Compose runs Postgres **and** the web app together.

```bash
# 1. Clone
git clone https://github.com/cansomeoneelsedoit/sparmanik-farm.git
cd sparmanik-farm

# 2. Environment (only needed once)
cp .env.example .env

# 3. First run (builds image, runs migrations + seed, starts dev server)
docker compose up --build

# 4. Subsequent runs
docker compose up -d
```

- App: <http://localhost:3000>
- Postgres: `localhost:5432` (user `sparmanik` / pass `sparmanik` / db `sparmanik`)
- The web container boots with: `prisma migrate deploy && seed && next dev`.

### Compose services
- **db** — `postgres:16-alpine`, port `5432`, `pg_isready` healthcheck, named volume `sparmanik-db`.
- **web** — built from `Dockerfile.dev`, port `3000`, source bind-mounted for hot reload (container-side `node_modules` and `.next` preserved).

### Running commands inside the container
```bash
docker compose exec web npm test                          # vitest
docker compose exec web npx prisma studio                 # DB GUI on :5555
docker compose exec web npx prisma migrate dev --name <change>
docker compose exec db psql -U sparmanik -d sparmanik     # psql shell
```

---

## 4. Local development (host Node, without Docker)

Use this only if you already have Postgres 16 running locally.

```bash
# 1. Install deps
npm ci

# 2. Configure .env  (DATABASE_URL must point at your local Postgres)
cp .env.example .env
#    DATABASE_URL="postgresql://sparmanik:sparmanik@localhost:5432/sparmanik?schema=public"
#    DATABASE_SSL=false

# 3. Generate client + run migrations + seed
npx prisma generate
npx prisma migrate deploy
npm run db:seed

# 4. Start the dev server
npm run dev          # http://localhost:3000
```

> Note: inside Compose the DB host is `db`; on the host it's `localhost`.

---

## 5. Environment variables

Copy `.env.example` → `.env` and fill in. Full reference:

| Var | Required | Purpose / value |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string. Local: `postgresql://sparmanik:sparmanik@localhost:5432/sparmanik?schema=public`. Prod: Railway Postgres plugin URL. |
| `DATABASE_SSL` | — | `false` locally. Railway Postgres uses SSL automatically (`?sslmode=require`). |
| `AUTH_SECRET` | ✅ | Generate with `openssl rand -base64 32`. |
| `AUTH_URL` | ✅ | Canonical app URL. Dev: `http://localhost:3000`. Prod: the public Railway domain. |
| `AUTH_TRUST_HOST` | ✅ (prod) | `true` — required behind Railway's proxy. |
| `UPLOAD_DIR` | ✅ (prod) | Where uploads are written. Dev: `./uploads`. Prod: `/data/uploads` (Railway Volume). |
| `ANTHROPIC_API_KEY` | optional | Enables Ask AI + Jasper Echo (Claude). Feature is hidden if unset. |
| `GEMINI_API_KEY` | optional | Alternate Ask AI provider (Gemini 2.5 Flash-Lite, free tier). Key from <https://aistudio.google.com/app/apikey>. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Enables Google sign-in + Calendar sync. Redirect URI: `http://localhost:3000/api/auth/callback/google`. |
| `FARM_API_TOKEN` | optional | Legacy bearer token for the (deprecated) farm-state endpoint. Leave unset to disable. |
| `NODE_ENV` | — | `development` locally; `production` in prod. |
| `NEXT_TELEMETRY_DISABLED` | — | `1` to silence Next telemetry. |

---

## 6. Database & seed

- Schema: `prisma/schema.prisma` — ~17 domain models + Auth.js tables + AI conversations + multi-org tables.
- Migrations: `prisma/migrations/` — applied with `prisma migrate deploy`.
- Seed: `prisma/seed.ts` — **idempotent** (skips if data already exists). Loads the legacy `farm-legacy.js` `S` object via `vm`.

**Seed creates:**
- 3 organizations: `org_sparmanik` (all legacy data), `org_andre` (empty), `org_kevin` (empty).
- Boyd / **Dev User** as OWNER across all three, auto-promoted to `SUPERUSER`.
- A login for every Staff record: email `<firstname>@sparmanikfarm.local`. Each is created with a random one-time password shown to the admin at creation (staff must change it on first sign-in).

```bash
npm run db:seed          # tsx prisma/seed.ts (safe to re-run)
npm run prisma:studio    # inspect data on :5555
npm run prisma:migrate   # create a new migration (prisma migrate dev)
```

---

## 7. npm scripts

```bash
npm run dev            # next dev (port 3000)
npm run build          # prisma generate && next build
npm run start          # next start (no migrate)
npm run start:prod     # prisma migrate deploy && seed && next start   (Railway uses this)
npm run typecheck      # tsc --noEmit   ← run before every commit
npm run lint           # eslint
npm test               # vitest run
npm run test:watch     # vitest watch
npm run prisma:migrate # prisma migrate dev
npm run prisma:studio  # prisma studio (5555)
npm run db:seed        # seed (idempotent)
npm run check:i18n     # diff EN vs ID message keysets
```

> **Always run `npx tsc --noEmit` before committing.** The legacy Prisma generator hides type errors locally that the Railway build catches — this is the single most common deploy-breaker.

---

## 8. Deployment (Railway)

- **Project:** `sparmanikfarm` (workspace: `cansomeoneelsedoit's Projects`)
- **Services:** `web` + `Postgres` plugin
- **Build:** the production multi-stage **`Dockerfile`** (node 22-alpine, runs as **root**, tini entrypoint).
  - ⚠️ `railway.json` still declares `"builder": "NIXPACKS"`, but the Dockerfile is the path actually in use (the root/Volume upload fix only works under Docker). Recommend reconciling to `"builder": "DOCKERFILE"`.
- **Start command:** `npm run start:prod` = `prisma migrate deploy && (tsx prisma/seed.ts || true) && next start` (set in `railway.json`; overrides the Dockerfile `CMD`).
- **Healthcheck:** `GET /api/health`, timeout 180s.
- **Restart policy:** `ON_FAILURE`, max 10 retries.
- **Volume:** mounted at `/data`; set `UPLOAD_DIR=/data/uploads`. The container runs as root so it can `mkdir`/`chmod` inside the mount (do **not** re-add `USER nextjs`).
- **Auto-deploy:** on push to `main` (GitHub integration).

### Required env on Railway
```
DATABASE_URL        = ${{ Postgres.DATABASE_URL }}
AUTH_SECRET         = <openssl rand -base64 32>
AUTH_URL            = https://web-production-1e6de.up.railway.app
AUTH_TRUST_HOST     = true
UPLOAD_DIR          = /data/uploads
ANTHROPIC_API_KEY   = <claude key>
GEMINI_API_KEY      = <gemini key>
GOOGLE_CLIENT_ID    = <optional>
GOOGLE_CLIENT_SECRET= <optional>
```

> Setting prod env vars must be done **in the Railway dashboard** (Project → web → Variables → + New Variable). The CLI/GraphQL `variables --set` path is blocked by the auto-mode classifier.

### Deploy gotchas
- **Three Railway projects are hooked to this repo.** Only `sparmanikfarm - web` (serves `web-production-1e6de…`) matters. The other two fail on every push — ignore them; filter deploy status on `context: "sparmanikfarm - web"`.
- **Lockfile drift:** after adding a dep, run `npm install --package-lock-only` so Railway's `npm ci` doesn't reject with "Missing X from lock file".

---

## 9. Common gotchas (must-read)

1. **Decimal across the RSC → client boundary throws.** Always `serializeMoney()` / explicit field-pick before passing to a Client Component. Date is fine; Decimal is not.
2. **Type `$transaction` callbacks as `TransactionClient`** (from `@/server/decimal`), never `tx: typeof prisma` — the latter compiles locally but breaks the Railway build.
3. **`Prisma.Decimal` / `Prisma.InputJsonValue` aren't in the legacy generator's namespace.** Import from `@prisma/client/runtime/library` (re-exported via `src/server/decimal.ts`).
4. **Portal z-index:** new shadcn primitives that open in a portal inside a Dialog need `z-[100]` (Dialog is `z-50`).
5. **Multi-org auto-scoping** silently returns empty / fails NOT NULL FK if the `activeOrgId` cookie is missing. Seed & CLI scripts bypass scoping and must stamp `organizationId` explicitly.
6. **Caching:** global `Cache-Control: no-store` is set in `next.config.mjs` for everything except `/_next/static/*`, so deploys are visible without a hard refresh. If `/ask-ai` still shows stale HTML, hard-refresh (Ctrl+Shift+R).
7. **CRLF warnings on commit are normal** (Windows checkout, LF repo).

---

## 10. Verifying a healthy setup

```bash
# Local
curl http://localhost:3000/api/health          # → 200 OK
npm run typecheck                                # → no errors
npm test                                         # → all pass

# Prod (use your live URL from local notes)
curl https://<your-app>.up.railway.app/api/health
```

Then sign in at <http://localhost:3000> with the dev login the seed printed to the console.

---

_Last updated from repo state at commit `7284529`. See `CLAUDE.md` and `AGENTS.md` for architecture/contributor notes._
