# [Ask client for name] — Setup Guide

> **Template.** Before sharing/using, work through **Section 0** to fill in the
> project name, allocate free ports, and gather Railway details. Then
> find-and-replace every `[Ask client for name]` placeholder (use the
> lowercased, no-space form in slug spots — DB name, URL slug, email domain).

Cultivation OS for a hydroponic farm. Full-stack **Next.js 16 + Postgres + Prisma** app, multi-tenant, deployed on Railway.

- **Live:** https://[Ask client for name].up.railway.app
- **Repo:** https://github.com/[Ask client for name]/[Ask client for name]
- **Canonical local path:** C:\Users\boyds\Desktop\[Ask client for name]
- **Dev sign-in:** the local seed prints the dev login to the console on first run (do not commit credentials).

---

## 0. Before you start — onboarding questions

Answer these first. Anything already known, fill in; anything blank, follow the prompt.

### 0.1 Project name
- **Display name:** `[Ask client for name]`
- **Slug** (lowercase, no spaces — used for DB name, repo, URL, emails): `[Ask client for name]`

### 0.2 Allocate free local ports (do NOT reuse a taken one)

Each project must get its **own** app + DB ports so running two locally never
collides. Known-allocated ports on this machine:

| Port | Used by | Type |
|---|---|---|
| 3000 | Sparmanik Farm | app (web) |
| 3001 | SMSF Echo | app (web) |
| 3002 | Marriott Standards Portal | app (web) |
| 3003 | _(allocated)_ | app (web) |
| 3004 | newproject skeleton | app (web) |
| 5432 | Sparmanik Farm | Postgres |
| 5434 | Marriott Standards Portal | Postgres |
| 5435 | newproject skeleton | Postgres |
| 5555 | (any) Prisma Studio default | tooling |

**Rule:** take the next free number above the highest used one.

- **`[APP_PORT]`** → next free web port. Default next free: **3005**.
- **`[DB_PORT]`** → next free Postgres port. Default next free: **5436**.
- **Prisma Studio** → if you ever run two Studios at once, override with
  `npx prisma studio --port <free>` (default 5555).

> ⚠️ **Verify before committing** — another project may have been added since
> this table was written. Confirm each chosen port is actually free:
> ```powershell
> netstat -ano | findstr :[APP_PORT]      # no output = free
> netstat -ano | findstr :[DB_PORT]
> ```
> If a chosen port is taken, bump to the next number and update this table so
> the next project sees the new allocation.

After choosing, find-and-replace `[APP_PORT]` and `[DB_PORT]` throughout this
doc **and** in `docker-compose.yml`, `.env`, and the `dev`/`start` scripts /
`-p` flags. The app's default is 3000, so a non-default port needs
`next dev -p [APP_PORT]` (and the compose port mapping `"[APP_PORT]:3000"`).

### 0.3 Railway details — do we already have them?

**First ask: "Have the Railway project + Postgres already been set up for this client?"**

- **YES — already set up.** Collect and record these (ask the client / check the
  Railway dashboard). Don't proceed to env config until all are filled:
  - [ ] Railway **project name** / ID
  - [ ] **Public domain** (e.g. `https://<something>.up.railway.app`)
  - [ ] Postgres plugin attached? (Y/N) → `DATABASE_URL` reference
  - [ ] Volume mounted at `/data`? (Y/N)
  - [ ] Which env vars are already set vs. still missing (see §5 / §8)

- **NO — not set up yet.** Walk through provisioning (one-time, prompts below):
  1. **Create the project:** Railway dashboard → New Project → Deploy from GitHub
     repo `[Ask client for name]` (or `railway init` if using the CLI).
     → *Prompt: "What should the Railway project be named?"* (default = slug)
  2. **Add Postgres:** in the project → New → Database → PostgreSQL.
     This auto-creates `${{ Postgres.DATABASE_URL }}`.
  3. **Add a Volume:** web service → Volumes → New Volume, mount path `/data`.
     → *Prompt: "Confirm volume mount path = /data"*
  4. **Set the builder:** ensure `railway.json` build block is
     `"builder": "DOCKERFILE"` (this stack ships a production Dockerfile).
  5. **Set env vars** (dashboard → web → Variables) — see the required list in §8.
     → *Prompt for each secret: "Do you already have a value for `X`, or should
     I generate/leave it blank?"* (`AUTH_SECRET` → `openssl rand -base64 32`;
     `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / Google OAuth → ask the client).
  6. **First deploy:** push to `main` (auto-deploys) and confirm
     `GET /api/health` → 200.

> Note: setting prod env vars must be done **in the Railway dashboard** — the
> CLI/GraphQL `variables --set` path may be blocked.

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
git clone https://github.com/[Ask client for name]/[Ask client for name].git
cd [Ask client for name]

# 2. Environment (only needed once)
cp .env.example .env

# 3. First run (builds image, runs migrations + seed, starts dev server)
docker compose up --build

# 4. Subsequent runs
docker compose up -d
```

- App: <http://localhost:[APP_PORT]>
- Postgres: `localhost:[DB_PORT]` (user `[Ask client for name]` / pass `[Ask client for name]` / db `[Ask client for name]`)
- The web container boots with: `prisma migrate deploy && seed && next dev`.

> Compose maps host→container ports. Inside the container the app still listens
> on 3000 and Postgres on 5432; only the **host-side** port is `[APP_PORT]` /
> `[DB_PORT]`. So `docker-compose.yml` should read
> `ports: ["[APP_PORT]:3000"]` (web) and `["[DB_PORT]:5432"]` (db).

### Compose services
- **db** — `postgres:16-alpine`, host port `[DB_PORT]`, `pg_isready` healthcheck, named volume `[Ask client for name]-db`.
- **web** — built from `Dockerfile.dev`, host port `[APP_PORT]`, source bind-mounted for hot reload (container-side `node_modules` and `.next` preserved).

### Running commands inside the container
```bash
docker compose exec web npm test                          # vitest
docker compose exec web npx prisma studio                 # DB GUI on :5555
docker compose exec web npx prisma migrate dev --name <change>
docker compose exec db psql -U [Ask client for name] -d [Ask client for name]   # psql shell
```

---

## 4. Local development (host Node, without Docker)

Use this only if you already have Postgres 16 running locally.

```bash
# 1. Install deps
npm ci

# 2. Configure .env  (DATABASE_URL must point at your local Postgres)
cp .env.example .env
#    DATABASE_URL="postgresql://[Ask client for name]:[Ask client for name]@localhost:[DB_PORT]/[Ask client for name]?schema=public"
#    DATABASE_SSL=false

# 3. Generate client + run migrations + seed
npx prisma generate
npx prisma migrate deploy
npm run db:seed

# 4. Start the dev server on the allocated port
npm run dev -- -p [APP_PORT]          # http://localhost:[APP_PORT]
```

> Note: inside Compose the DB host is `db`; on the host it's `localhost`.

---

## 5. Environment variables

Copy `.env.example` → `.env` and fill in. Full reference:

| Var | Required | Purpose / value |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string. Local: `postgresql://[Ask client for name]:[Ask client for name]@localhost:[DB_PORT]/[Ask client for name]?schema=public`. Prod: Railway Postgres plugin URL. |
| `DATABASE_SSL` | — | `false` locally. Railway Postgres uses SSL automatically (`?sslmode=require`). |
| `AUTH_SECRET` | ✅ | Generate with `openssl rand -base64 32`. |
| `AUTH_URL` | ✅ | Canonical app URL. Dev: `http://localhost:[APP_PORT]`. Prod: the public Railway domain. |
| `AUTH_TRUST_HOST` | ✅ (prod) | `true` — required behind Railway's proxy. |
| `UPLOAD_DIR` | ✅ (prod) | Where uploads are written. Dev: `./uploads`. Prod: `/data/uploads` (Railway Volume). |
| `ANTHROPIC_API_KEY` | optional | Enables Ask AI + the AI widget (Claude). Feature is hidden if unset. |
| `GEMINI_API_KEY` | optional | Alternate Ask AI provider (Gemini 2.5 Flash-Lite, free tier). Key from <https://aistudio.google.com/app/apikey>. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Enables Google sign-in + Calendar sync. Redirect URI: `http://localhost:[APP_PORT]/api/auth/callback/google`. |
| `FARM_API_TOKEN` | optional | Legacy bearer token for the (deprecated) farm-state endpoint. Leave unset to disable. |
| `NODE_ENV` | — | `development` locally; `production` in prod. |
| `NEXT_TELEMETRY_DISABLED` | — | `1` to silence Next telemetry. |

---

## 6. Database & seed

- Schema: `prisma/schema.prisma` — ~17 domain models + Auth.js tables + AI conversations + multi-org tables.
- Migrations: `prisma/migrations/` — applied with `prisma migrate deploy`.
- Seed: `prisma/seed.ts` — **idempotent** (skips if data already exists).

**Seed creates:**
- Seeded organizations (one primary org holding the client's data, plus any additional empty orgs).
- A superuser **Dev User** as OWNER across all orgs (auto-promoted to `SUPERUSER`).
- A login for every Staff record: `<firstname>@[Ask client for name].local` (set the default staff password during onboarding).

```bash
npm run db:seed          # tsx prisma/seed.ts (safe to re-run)
npm run prisma:studio    # inspect data on :5555
npm run prisma:migrate   # create a new migration (prisma migrate dev)
```

---

## 7. npm scripts

```bash
npm run dev            # next dev   (add `-- -p [APP_PORT]` for the allocated port)
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

> If Railway isn't provisioned yet, do **Section 0.3** first.

- **Project:** `[Ask client for name]`
- **Services:** `web` + `Postgres` plugin
- **Build:** the production multi-stage **`Dockerfile`** (node 22-alpine, runs as **root**, tini entrypoint). Set the service builder to `DOCKERFILE` in `railway.json`.
- **Start command:** `npm run start:prod` = `prisma migrate deploy && (tsx prisma/seed.ts || true) && next start` (set in `railway.json`; overrides the Dockerfile `CMD`).
- **Healthcheck:** `GET /api/health`, timeout 180s.
- **Restart policy:** `ON_FAILURE`, max 10 retries.
- **Volume:** mounted at `/data`; set `UPLOAD_DIR=/data/uploads`. The container runs as root so it can `mkdir`/`chmod` inside the mount (do **not** re-add `USER nextjs`).
- **Auto-deploy:** on push to `main` (GitHub integration).
- **Ports:** Railway injects `$PORT` and the container listens on it — the local
  `[APP_PORT]` / `[DB_PORT]` allocation is **local-only** and does not apply in prod.

### Required env on Railway
```
DATABASE_URL        = ${{ Postgres.DATABASE_URL }}
AUTH_SECRET         = <openssl rand -base64 32>
AUTH_URL            = https://[Ask client for name].up.railway.app
AUTH_TRUST_HOST     = true
UPLOAD_DIR          = /data/uploads
ANTHROPIC_API_KEY   = <claude key>
GEMINI_API_KEY      = <gemini key>
GOOGLE_CLIENT_ID    = <optional>
GOOGLE_CLIENT_SECRET= <optional>
```

> Setting prod env vars must be done **in the Railway dashboard** (Project → web → Variables → + New Variable). The CLI/GraphQL `variables --set` path may be blocked.

### Deploy gotchas
- **Only one Railway project should be hooked to this repo.** If extra projects are connected, they fail on every push — disconnect them or filter deploy status on the `web` service.
- **Lockfile drift:** after adding a dep, run `npm install --package-lock-only` so Railway's `npm ci` doesn't reject with "Missing X from lock file".

---

## 9. Common gotchas (must-read)

1. **Decimal across the RSC → client boundary throws.** Always `serializeMoney()` / explicit field-pick before passing to a Client Component. Date is fine; Decimal is not.
2. **Type `$transaction` callbacks as `TransactionClient`** (from `@/server/decimal`), never `tx: typeof prisma` — the latter compiles locally but breaks the Railway build.
3. **`Prisma.Decimal` / `Prisma.InputJsonValue` aren't in the legacy generator's namespace.** Import from `@prisma/client/runtime/library` (re-exported via `src/server/decimal.ts`).
4. **Portal z-index:** new shadcn primitives that open in a portal inside a Dialog need `z-[100]` (Dialog is `z-50`).
5. **Multi-org auto-scoping** silently returns empty / fails NOT NULL FK if the `activeOrgId` cookie is missing. Seed & CLI scripts bypass scoping and must stamp `organizationId` explicitly.
6. **Caching:** global `Cache-Control: no-store` is set in `next.config.mjs` for everything except `/_next/static/*`, so deploys are visible without a hard refresh.
7. **CRLF warnings on commit are normal** (Windows checkout, LF repo).
8. **Port collisions:** if `docker compose up` errors with "port is already
   allocated", another project grabbed `[APP_PORT]`/`[DB_PORT]` — bump to the
   next free number (§0.2) and update the registry.

---

## 10. Verifying a healthy setup

```bash
# Local
curl http://localhost:[APP_PORT]/api/health     # → 200 OK
npm run typecheck                                # → no errors
npm test                                         # → all pass

# Prod
curl https://[Ask client for name].up.railway.app/api/health
```

Then sign in at <http://localhost:[APP_PORT]> with `dev@[Ask client for name].local` / `devpassword`.

---

_Template derived from the cultivation-OS stack. See `CLAUDE.md` and `AGENTS.md` for architecture/contributor notes._
