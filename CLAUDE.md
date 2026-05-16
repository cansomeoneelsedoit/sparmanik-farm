# Sparmanik Farm — context for future Claude sessions

## What this is

Cultivation OS for a hydroponic farm in Indonesia. Originally a single-file
vanilla-JS SPA (`public/farm-legacy.js`); now a full-stack Next.js 16 app with
Postgres. The legacy script is still in `public/` but is no longer loaded.

Live: <https://web-production-1e6de.up.railway.app>
Repo: <https://github.com/cansomeoneelsedoit/sparmanik-farm>
Sign in (dev): `dev@sparmanikfarm.local` / `devpassword`

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack). Read
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/`
  before touching routing — Next 16 has breaking changes (async `params`,
  `middleware` → `proxy` file rename, etc.).
- **Language**: TypeScript everywhere, `strict: true`.
- **DB**: Postgres + Prisma 6.19. Generator is `prisma-client-js` (legacy);
  `PrismaClient` types as `any`, so use `TransactionClient` from
  `src/server/decimal.ts` for `$transaction` callbacks.
- **Auth**: Auth.js v5 (`5.0.0-beta.31`) with the edge-safe split:
  - `src/auth.config.ts` — config used by `src/proxy.ts` (no Prisma)
  - `src/auth.ts` — full config: Prisma adapter, Credentials, Google
    (env-gated)
  - JWT session strategy
- **UI**: Tailwind v4 + shadcn-style primitives in `src/components/ui/`.
  Dark mode via `.dark` class on `<html>`; toggle in topbar.
- **State**: RSC + Server Actions for everything. `nuqs` for URL search-state
  on filters. Zustand only if a truly client-only need appears (not used yet).
- **Forms**: react-hook-form + zod (resolver). Zod schemas double as Server
  Action validators.
- **i18n**: `next-intl` with EN / ID, cookie-based locale (no URL prefix).
  Messages in `src/i18n/messages/{en,id}.json`. SOP/Video entities have
  parallel `xxxEn` / `xxxId` columns.
- **Tests**: Vitest + `fast-check` for FIFO property tests.

## Where things live

```
src/
├── app/
│   ├── (auth)/signin/              auth page
│   ├── (app)/                      ALL authenticated app routes
│   │   ├── layout.tsx              sidebar + topbar; redirects to /signin
│   │   ├── page.tsx                Dashboard
│   │   ├── inventory/              + [itemId]/ detail + new-item-dialog
│   │   ├── suppliers/              + [supplierId]/ detail
│   │   ├── harvest/                + [harvestId]/ detail (P&L, sales,
│   │   │                           usage, labour, assets, full P&L statement)
│   │   ├── tasks/
│   │   ├── recipes/                + [recipeId]/
│   │   ├── sops/                   + [sopId]/  (EN/ID parallel)
│   │   ├── videos/
│   │   ├── staff/
│   │   ├── sales/
│   │   ├── financials/
│   │   ├── calendar/
│   │   ├── settings/{categories,produce,greenhouses,staff,general}/
│   │   ├── ask-ai/                 Claude integration (env-gated)
│   │   └── audit/actions.ts        undoActionById server action
│   ├── api/
│   │   ├── auth/[...nextauth]/     Auth.js handlers
│   │   ├── health/                 Railway healthcheck
│   │   ├── uploads/[...path]/      authenticated file serving
│   │   └── farm-state/             legacy proxy route (unused, will delete)
│   └── layout.tsx                  root layout, next-intl provider, theme bootstrap
├── components/
│   ├── ui/                         shadcn primitives (button, dialog, etc.)
│   └── shared/                     Money, LocalizedText, ConfirmDialog,
│                                   Sidebar, Topbar, AlertBell, AuditHistorySheet,
│                                   ThemeToggle, LangToggle
├── server/                         server-only utils (never imported by client)
│   ├── prisma.ts                   re-exports the singleton
│   ├── decimal.ts                  Decimal, InputJsonValue, TransactionClient
│   ├── money.ts                    serializeMoney, parseMoney, formatMoney
│   ├── fifo.ts                     consumeFifo, totalStock, totalValue, avgCost
│   ├── pl.ts                       getHarvestPL (cached per request)
│   ├── alerts.ts                   getAlerts (low stock + live harvest + overdue task)
│   ├── audit.ts                    recordAction, undoAction, registry
│   ├── audit-handlers.ts           every undo handler registered here
│   ├── uploads.ts                  sharp resize → ./uploads (Volume in prod)
│   └── ai.ts                       Claude SDK + farm-context system prompt
├── i18n/
│   ├── routing.ts / request.ts / actions.ts
│   └── messages/{en,id}.json
├── lib/
│   ├── prisma.ts                   PrismaClient singleton
│   └── utils.ts                    cn()
├── auth.ts / auth.config.ts / auth-handlers.ts
├── proxy.ts                        Auth.js Proxy (Next-16 "middleware" rename)
└── types/next-auth.d.ts            session.user.id augmentation
prisma/
├── schema.prisma                   13 domain entities + auth + audit
├── migrations/                     2 migrations (init + domain_schema)
└── seed.ts                         loads legacy farm-legacy.js S object via vm
```

## Schema highlights

13 domain models + Auth.js tables. See `prisma/schema.prisma`. Key concepts:

- **FIFO inventory** via `Batch` + `BatchConsumption`. Remaining = `qty − Σ(consumptions.qty)`. **No denormalised `remaining` column** — recompute on read. The legacy app had this denormalised and its undo was buggy as a result.
- **Money** is `Decimal(18, 4)`. **Always serialize to string** before passing across the RSC → client boundary. Use `serializeMoney()` in `src/server/money.ts`. Passing a raw `Decimal` to a Client Component throws "Only plain objects can be passed to Client Components from Server Components" — this is the most common error.
- **Audit log** is generic: `AuditAction { type, entityType, entityId, payload (Json), undone }`. Per-type undo handlers registered in `src/server/audit-handlers.ts`.
- **Staff rates** are versioned (`StaffRate.effectiveFrom`). Use the most-recent `effectiveFrom ≤ date` for wage cost calculations.
- **SOP / Video** have parallel EN/ID columns. Render via `<LocalizedText en={…} id={…} />`.

## Common gotchas

1. **Decimal across RSC boundary**: explicit field-picking required.
   `items.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))` — never
   `items.map((i) => i)` even if TS allows it. Same for Date is fine (Date
   is serializable); Decimal is NOT.

2. **`tx: typeof prisma` doesn't work in prod**: legacy Prisma generator
   makes `PrismaClient = any` locally, so it compiles. In Railway's build
   the real types catch it. Always type tx callbacks as
   `tx: TransactionClient` from `@/server/decimal`.

3. **`Prisma.Decimal` and `Prisma.InputJsonValue` are NOT in the legacy
   generator's `Prisma` namespace.** Import them from
   `@prisma/client/runtime/library` (re-exported from
   `src/server/decimal.ts`).

4. **Dropdowns inside dialogs**: `SelectContent` z-index is `z-[100]` (above
   `Dialog`'s `z-50`). If you copy a new shadcn primitive that opens a
   portal, give it `z-[100]` or it'll get hidden behind the dialog.

5. **Server Actions returning Date or Decimal**: Server Actions serialize
   their return value via the React Flight encoder which supports Date but
   not Decimal. Map Decimals to strings before returning.

6. **Legacy `tx: typeof prisma` will silently break in prod, not dev.**
   Always run `npx tsc --noEmit` before pushing — it's the local way to
   catch this.

7. **CRLF warnings on commit are normal** — Windows checkout, repo is LF.
   Don't worry about them.

8. **Browser-extension hydration warnings** (e.g. Scribe recorder injecting
   `data-scribe-recorder-ready`): silenced via `suppressHydrationWarning`
   on `<html>` and `<body>`.

## Auth flow

1. Unauthenticated user hits any `/(app)/*` route.
2. `src/proxy.ts` checks `req.auth`, redirects to `/signin?callbackUrl=…`.
3. Sign-in form posts to `/api/auth/callback/credentials` with email +
   password.
4. `src/auth.ts` Credentials provider's `authorize` looks up the user via
   Prisma, compares bcrypt hash, returns `{ id, email, name }`.
5. JWT session cookie set. Subsequent requests authenticated.
6. Google provider exists in `src/auth.ts` but only added when
   `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are present in env.

## Local dev

```bash
cp .env.example .env       # only needed once
docker compose up --build  # first time
docker compose up -d       # subsequent
```

Postgres on `localhost:5432` (creds: `sparmanik` / `sparmanik`).
App on <http://localhost:3000>.
The web container runs `prisma migrate deploy && seed && next dev` on boot.

```bash
# Run things inside the container:
docker compose exec web npm test
docker compose exec web npx prisma studio        # port 5555
docker compose exec web npx prisma migrate dev --name <change>
docker compose exec db psql -U sparmanik -d sparmanik
```

## Deployment (Railway)

- Project: `sparmanikfarm` (workspace: `cansomeoneelsedoit's Projects`)
- Services: `web` (Dockerfile build) + `Postgres` plugin
- Web has a Volume mounted at `/data`; `UPLOAD_DIR=/data/uploads`
- Auto-deploys on push to `main` (GitHub integration)
- Production startCommand: `npm run start:prod` =
  `prisma migrate deploy && tsx prisma/seed.ts && next start`
- Healthcheck: `GET /api/health`

Required env on Railway:
- `DATABASE_URL` — `${{ Postgres.DATABASE_URL }}` (Railway internal network)
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_URL` — public Railway domain
- `AUTH_TRUST_HOST=true`
- `UPLOAD_DIR=/data/uploads`
- `ANTHROPIC_API_KEY` (optional — enables Ask AI)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional — enables Google
  Calendar)

## Commands

```bash
npm run dev                # next dev (port 3000)
npm run build              # prisma generate + next build
npm run start              # next start (prod, no migrate)
npm run start:prod         # migrate + seed + start (Railway uses this)
npm run typecheck          # tsc --noEmit
npm run lint               # eslint
npm test                   # vitest run
npm run test:watch         # vitest watch
npm run prisma:migrate     # prisma migrate dev
npm run prisma:studio      # prisma studio (port 5555)
npm run db:seed            # tsx prisma/seed.ts (idempotent — skips if data exists)
npm run check:i18n         # diff EN vs ID keysets
```

## Currently deferred / TODO

- Multi-farm switcher (Xero-style account picker) — needs `Farm` entity +
  every domain model gets a `farmId` FK + scoped queries.
- Full bilingual entity content (item names, supplier names) — would need
  translation API integration (Google Translate / DeepL).
- Photo uploads in forms (Staff photo, Task evidence, SOP cover) —
  upload infra in `src/server/uploads.ts` exists, no UI yet uses it.
- Barcode scanning (`@zxing/browser` — not yet installed).
- CSV export — server-side `papaparse` not yet hooked into a route.
- Legacy cleanup (Phase 8): delete `public/farm-legacy.js`,
  `src/app/api/farm-state/`, `src/lib/auth-token.*`, the `FarmDocument`
  model and its migration entries.

## When in doubt

Run `npx tsc --noEmit` before committing. The legacy Prisma generator hides
type errors locally that production catches; this is the single most common
deploy-breaker.

---

@AGENTS.md
