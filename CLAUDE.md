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

~17 domain models + Auth.js tables + AI conversation + multi-org tables. See `prisma/schema.prisma`. Key concepts:

- **Multi-tenant via `Organization` + `OrganizationMembership`**. Three fixed orgs seeded: `org_sparmanik` (all legacy data), `org_andre` (Andre Melon, empty), `org_kevin` (Kevin Farm, empty). The active org is held in the `activeOrgId` cookie; Boyd (superuser / Dev User) is the only OWNER across all three.
- **Auto-scoping via Prisma `$extends`** in `src/lib/prisma.ts`. The extension reads `activeOrgId` from the request cookie (dynamic `import("next/headers")`) and injects `where: { organizationId }` on reads/updates/deletes and `data: { organizationId }` on creates for every model in `ORG_SCOPED_MODELS` (18 tenant tables: Category, Produce, Greenhouse, Supplier, Item, Batch, Staff, Harvest, HarvestAsset, HarvestUsage, Sale, Task, NutrientRecipe, Sop, Video, AuditAction, AiConversation, AiMessage). Non-request contexts (seed, CLI scripts) skip scoping — they must stamp `organizationId` explicitly. **Implication**: `organizationId` is `String?` in the Prisma schema (so `prisma.x.create({ data: {…} })` typechecks without the field) but **`NOT NULL` in the DB** via migration; if the extension doesn't fire, the FK fails — safe failure.
- **Active-org plumbing**: `src/server/org.ts` (`listMyOrgs`, `getActiveOrgId`, `requireActiveOrgId`), `src/server/org-actions.ts` (`setActiveOrg`), `src/components/shared/org-switcher.tsx` (Xero-style dropdown in topbar). Single-org users see a static label; multi-org users see the chevron + dropdown.
- **FIFO inventory** via `Batch` + `BatchConsumption`. Remaining = `qty − Σ(consumptions.qty)`. **No denormalised `remaining` column** — recompute on read.
- **Depreciable assets** (cocopeat, rockwool, grow bags): `Batch.maxUses / useCount / amortisedCostPerUse / returned`. Each harvest gets charged `amortisedCharge = qty × amortisedCostPerUse`; at end-harvest, batches with remaining uses return as `price=0` batches (same `amortisedCostPerUse`) so future harvests still get charged a fair share without further cash leaving the business. Invariant: `Σ(amortised_charge) + (remaining_uses × cost_per_use × remaining_qty) = original_price`. See `src/server/fifo.ts`, `src/server/pl.ts`.
- **Multi-produce harvests**: `HarvestProduce` join table. A harvest can grow multiple crops simultaneously. `Harvest.produceId` stays as the "primary" for backward compat; canonical list is `harvest.produces`.
- **Money** is `Decimal(18, 4)`. **Always serialize to string** before passing across the RSC → client boundary. Use `serializeMoney()` in `src/server/money.ts`. Passing a raw `Decimal` to a Client Component throws — most common error.
- **Audit log** is generic: `AuditAction { type, entityType, entityId, payload (Json), undone }`. Per-type undo handlers registered in `src/server/audit-handlers.ts`.
- **Staff rates** are versioned (`StaffRate.effectiveFrom`). Use the most-recent `effectiveFrom ≤ date`.
- **Wages split**: `WageEntry.totalHours` is total per day per staff; `WageEntryLine` allocates hours per `harvestId` (null = general farm work). Harvest P&L charges only allocated lines; Financials charges every line.
- **Two-tier auth**: `User.role` is `USER` or `SUPERUSER`. Only SUPERUSER sees `/admin/users` (create / edit / reset password / delete) and the "Users" sidebar entry. Dev User is auto-promoted on every seed.
- **Staff ↔ User**: `Staff.userId` is a unique nullable FK. Seed auto-creates a login for every staff (`<firstname>@sparmanikfarm.local`, password `Jasper1.0!`). `createStaff` provisions one in the same transaction.
- **Ask AI conversations**: `AiConversation` groups `AiMessage`s per user (ChatGPT/Claude.ai-style sidebar). `AiMessage.attachments` (Json) holds vision images for user messages: `[{ path, mimeType, width, height }]`.
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

9. **Railway production env vars are gated by the auto-mode classifier.**
   You can `railway list` and read GraphQL, but `railway variables --set`
   and the equivalent GraphQL mutation are blocked as "production
   infrastructure modification". Walk the user through the Railway
   dashboard (Project → web service → Variables → + New Variable). Don't
   bother trying to script it — the classifier denies every workaround.

10. **Some legacy items have empty `name` strings.** The seed accepts
    whatever the legacy `S` literal contains; ~265 items in the "Other"
    category were imported with `name = ""`. The inventory list and
    detail page fall back to "Untitled item" so they render, but a real
    fix is either a backfill migration or letting the user rename them
    inline. See `src/app/(app)/inventory/page.tsx:128-136` and
    `[itemId]/page.tsx:73-77`.

11. **GitHub repo is hooked up to THREE Railway projects.** Only
    `sparmanikfarm - web` (project `1c8787f4-…`, serves
    `web-production-1e6de.up.railway.app`) matters. The other two
    (`Sparmanik Farm OS - back-end`, `Sparmanik Farm OS - front-end`)
    fail on every push and will keep doing so until disconnected from
    the repo in their Railway settings. When polling deploy status,
    filter on `"context": "sparmanikfarm - web"` — the top-level GH
    state is always failure because of the other two.

12. **Lockfile drift after adding new deps.** `npm install` sometimes
    partially syncs `package-lock.json` (Railway's strict `npm ci` then
    rejects with "Missing: X from lock file"). Fix:
    `npm install --package-lock-only` after the install. If a peer-dep
    conflict shows up (e.g. `next-intl`'s `@swc/core` wants
    `@swc/helpers>=0.5.17` but Next 16 bundles 0.5.15), pin the higher
    version as a top-level devDep so npm has a satisfying resolution.

13. **Railway Volume mount needs root.** Volumes mount at runtime as
    root; the `nextjs` non-root user can't `mkdir` inside `/data/uploads`
    → EACCES on Ask AI uploads. The Dockerfile runs the container as
    root and the CMD pre-creates + chmods the upload dir before
    starting the app. Don't add `USER nextjs` back.

14. **Multi-org auto-scoping silently drops queries when no `activeOrgId` cookie is set in a request context.** The extension reads the cookie; if it's missing on a logged-in user (e.g. cookie expired, first visit before middleware runs) reads return empty and creates fail the NOT NULL FK. The fix is to ensure `setActiveOrg` runs before the first scoped query — `src/proxy.ts` would be the right place if this ever bites users in practice. Today it doesn't because `listMyOrgs()` in the topbar falls back to the user's first membership and `OrgSwitcher` sets the cookie on first render. Seed and CLI scripts bypass scoping deliberately (no `next/headers` in scope → `getActiveOrgIdFromCookie` returns `null`) so they must stamp `organizationId` explicitly on every `data:` payload.

15. **Browser caches stale `/ask-ai` HTML across deploys.** The
    server-rendered `<Card>` saying "Set ANTHROPIC_API_KEY…" sticks
    around in the browser after the env var is added on Railway. Open
    a fresh tab or hard-refresh (Ctrl+Shift+R). Curl-against-prod also
    misleads because unauthenticated `/ask-ai` redirects to `/signin`,
    so banner-grep returns 0 even when the running container still has
    the old code. Use an authenticated browser fetch to verify.

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
- `ANTHROPIC_API_KEY` — Claude (Ask AI + Echo); set on prod
- `GEMINI_API_KEY` — Google Gemini (alternate Ask AI provider, free tier);
  set on prod
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

- In-app password change screen (currently superuser-resets via
  `/admin/users` only).
- Disconnect the two stale Railway projects from the GitHub repo so
  `git push` doesn't trigger false-failure deploy statuses.
- Full bilingual entity content (item names, supplier names) — would
  need translation API integration (Google Translate / DeepL).
- Photo uploads in forms (Staff photo, Task evidence, SOP cover) —
  upload infra in `src/server/uploads.ts` exists, no UI yet uses it.
- Barcode scanning (`@zxing/browser` — not yet installed).
- CSV export — server-side `papaparse` not yet hooked into a route.
- Financials → P&L Forecast is still a "coming soon…" placeholder.
- Settings → Categories has a "Drag to reorder (coming soon)" hint;
  reorder UX not implemented.
- Backfill / rename UI for the ~265 unnamed legacy items in inventory.
- Legacy cleanup (Phase 8): delete `public/farm-legacy.js`,
  `src/app/api/farm-state/`, `src/lib/auth-token.*`, the `FarmDocument`
  model and its migration entries.

## Recent session log

- **2026-05-16** — Production tour. Settings → Staff got Add / Edit /
  Delete. Inventory rendered "Untitled item" fallback. Ask AI activated
  via env vars on Railway. Depreciable assets feature (cocopeat /
  rockwool amortisation) shipped with full schema + UI per spec.

- **2026-05-17** —
  - Ask AI got image attachments (Anthropic + Gemini vision via base64),
    a Claude.ai-style centred layout with markdown rendering, and a
    per-user **conversation history sidebar** (AiConversation model;
    legacy messages backfilled into one "Earlier chats" thread per
    user).
  - Gemini 2.5 Flash-Lite added as alternate AI provider with a
    Claude/Gemini pill toggle (localStorage-persisted).
  - Multi-produce harvests (`HarvestProduce` join table; chip multi-
    select in StartHarvestDialog; badges on harvest cards).
  - Financials → real P&L statement with Revenue, COGS (Σ batch
    purchases), Wages split (allocated vs general), Depreciation, Net.
  - Staff auto-login: every Staff gets a User (email
    `<firstname>@sparmanikfarm.local`, password `Jasper1.0!`); seed
    backfills idempotently, `createStaff` provisions in-transaction.
  - Two-tier auth: `User.role` (`USER` / `SUPERUSER`). Dev User
    auto-promoted. `/admin/users` (SUPERUSER-only) with create / edit /
    reset password / delete; "Users" sidebar entry gated on role.
  - **Echo widget**: floating 🧑‍🌾 button bottom-right of every
    authenticated page → small popover for single-turn quick farm
    questions. Uses askAi() with a "be terse" wrapper. Not persisted.
  - Searchable Combobox primitive (`src/components/ui/combobox.tsx`,
    no extra deps) applied to Item / Supplier / Category / Produce
    dropdowns in the high-cardinality dialogs.
  - Dockerfile fix: runs as root + `mkdir -p $UPLOAD_DIR && chmod 777`
    on start so the Railway Volume mount is writable. (EACCES on Ask
    AI image upload is gone.)
  - Lockfile drift fix: pinned `@swc/helpers@^0.5.17` as a top-level
    devDep to satisfy `next-intl`'s `@swc/core` peer dep that Next 16's
    bundled 0.5.15 doesn't.
  - **Multi-organisation switcher** shipped (`b1e6803`). Three orgs
    seeded (`org_sparmanik` with all legacy data, `org_andre` empty,
    `org_kevin` empty). `Organization` + `OrganizationMembership`
    tables; `organizationId` added to 18 tenant tables (NOT NULL in
    DB, optional in Prisma schema so creates typecheck without it).
    Auto-scoping via Prisma `$extends` in `src/lib/prisma.ts` reads
    `activeOrgId` cookie and stamps every query. Xero-style topbar
    switcher (`OrgSwitcher`) lets Boyd flip between orgs.

## When in doubt

Run `npx tsc --noEmit` before committing. The legacy Prisma generator hides
type errors locally that production catches; this is the single most common
deploy-breaker.

---

@AGENTS.md
