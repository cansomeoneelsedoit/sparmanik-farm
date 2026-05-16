# Sparmanik Farm

Cultivation OS — a Next.js 16 + Postgres full-stack app.

- **Frontend & API**: Next.js 16 (App Router) + TypeScript
- **Database**: Postgres + Prisma ORM
- **Auth**: Auth.js (NextAuth v5) with Prisma adapter + credentials provider
- **Tests**: Vitest
- **Dev environment**: Docker Compose
- **Deploy target**: Railway (auto-deploy from `main` via Railway's GitHub integration)

## Local development

### Prerequisites

- Docker Desktop (or Docker Engine + Compose)
- Node.js 22+ if you want to run scripts on the host

### First run

```bash
cp .env.example .env
docker compose up --build
```

This brings up two services:

- `db` — Postgres 16 on `localhost:5432`
- `web` — Next.js dev server on [http://localhost:3000](http://localhost:3000), with hot reload

On boot the web container runs `prisma migrate deploy` so the schema is in
place before the dev server starts.

### Day to day

```bash
docker compose up          # start
docker compose down        # stop (data persists in the named volume)
docker compose down -v     # stop and wipe the database
```

To run commands inside the web container:

```bash
docker compose exec web npx prisma studio     # open Prisma Studio
docker compose exec web npm test              # run the test suite
docker compose exec web npm run db:seed       # seed the dev user
```

### Without Docker (host-only)

You still need a Postgres running somewhere. Point `DATABASE_URL` at it, then:

```bash
npm install
npx prisma migrate dev
npm run dev
```

## Useful endpoints

- `GET /api/health` — liveness + DB ping
- `GET /api/farm-state` — returns the JSON state document (`{}` if empty)
- `PUT /api/farm-state` — replaces the JSON state document
- `POST /api/auth/*` — Auth.js handlers (sign in, callback, etc.)

If `FARM_API_TOKEN` is set, `/api/farm-state` requires `Authorization: Bearer <token>`.

## Database

Schema lives in [`prisma/schema.prisma`](prisma/schema.prisma). The app data
is a single JSONB document in `farm_document` (id = 1). Auth.js tables follow
the standard Prisma adapter shape.

Create a new migration after editing the schema:

```bash
docker compose exec web npx prisma migrate dev --name <change-name>
```

## Deployment (Railway)

The repo is set up to deploy via Railway's GitHub integration — connect the
repo to a Railway project and pushes to `main` auto-deploy.

1. Create a Railway project, link this repo, and add the **Postgres** plugin.
2. In the web service variables, set:
   - `DATABASE_URL` — copy from the Postgres plugin (`${{Postgres.DATABASE_URL}}`)
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `AUTH_URL` — your Railway public URL
   - `FARM_API_TOKEN` — optional bearer token for the farm-state endpoint
3. Railway will use [`railway.json`](railway.json) which:
   - Builds with `npm ci && prisma generate && next build`
   - Starts with `prisma migrate deploy && next start`
   - Health-checks at `/api/health`

GitHub Actions runs lint, typecheck, tests, and a production build on every
push and PR — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml). The
deploy itself is handled by Railway (no Actions deploy step needed).

## Project layout

```
.
├── prisma/
│   ├── schema.prisma          # DB schema (FarmDocument + Auth.js)
│   └── seed.ts                # Dev seed (creates farm_document row + dev user)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts   # Auth.js handlers
│   │   │   ├── farm-state/route.ts           # GET/PUT JSON state
│   │   │   └── health/route.ts               # Liveness + DB ping
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── auth-token.ts      # Legacy bearer-token guard
│   │   └── auth-token.test.ts # Vitest sample
│   ├── types/
│   │   └── next-auth.d.ts     # Session type augmentation
│   ├── auth.config.ts         # Edge-safe Auth.js config (used by proxy.ts)
│   ├── auth.ts                # Full Auth.js config (PrismaAdapter + credentials)
│   ├── auth-handlers.ts       # Re-exports handlers for the route file
│   └── proxy.ts               # Auth.js Proxy (Next 16's middleware replacement)
├── docker-compose.yml         # db + web (dev)
├── Dockerfile                 # Production multi-stage build
├── Dockerfile.dev             # Dev image, used by docker-compose
├── railway.json               # Railway build + deploy config
└── .github/workflows/ci.yml   # Lint / typecheck / test / build
```
