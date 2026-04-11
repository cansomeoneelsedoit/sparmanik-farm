# Sparmanik Farm

Full-stack cultivation OS for Sparmanik Farm. Rebuild of the single-file HTML demo into a real React + FastAPI + Postgres application deployed on Railway.

## Architecture

- **Frontend** Vite + React 18 + TypeScript + Tailwind CSS
- **Backend** FastAPI + SQLAlchemy 2 + Alembic + Postgres
- **Auth** JWT access + refresh tokens, bcrypt password hashing
- **Deploy** Railway for backend, frontend, and Postgres
- **Repo** https://github.com/cansomeoneelsedoit/sparmanik-farm

## What is in this Session 1 drop

- Database schema for every module in the HTML demo (17 tables: users, sales, staff_wages, tasks, task_assignees, inventory_items, plantings, sops, videos, suppliers, accounting_entries, forecast_budgets, recipes, recipe_ingredients, recipe_comments, settings)
- Alembic initial migration
- Auth endpoints: register, login, refresh, me, update language
- Seed script that creates the three required users, 31 inventory items, Kevin Medan's locked Generative melon recipe, and Bintang's shipping address
- Login page with bilingual EN/ID toggle matching the dark theme aesthetic
- Dashboard placeholder showing logged-in user and permissions
- Docker configs and railway.json for both services
- Auto-refresh on 401 for seamless session extension

## What is in Session 2

- New `inventory_adjustments` audit table (migration `0002`) - every quantity change is logged with who, when, why, and old/new values
- Inventory API: list with category and search filters, stats endpoint, create, update, adjust (delta or absolute), photo upload (base64 in Postgres for now), adjustment history, owner-only delete
- Owner-only delete: only Boyd, Bintang, and Erni can delete items - everyone else with the inventory permission can view, create, and adjust
- Reusable AppShell with sidebar nav, mobile burger menu, language toggle, user avatar, logout
- Inventory page with stats cards, category filter, search, grouped item cards with photo thumbnails and quick +/- buttons
- Adjust modal with reason dropdown (Stock take, Used, Wastage, Received, Correction) and optional note
- History modal showing the full audit trail per item
- Stock take walkthrough: progress bar, item-by-item, photo capture from rear camera on mobile, save and next, skip, previous, exit confirmation
- Optimistic UI on quick adjust - the count updates instantly and reverts only if the API call fails

## What is in Session 3

- Recipes API: list, get, create, update, lock, unlock, clone, comments, owner-only delete
- Nutrient Recipes page with Kevin Medan's GENERATIF table format
- Full bilingual EN/ID - every name, crop, stage, instructions, notes field has separate English and Indonesian values that auto-switch with the header language toggle
- The recipe table shows all 14 ingredients grouped by MAKRO A, MIKRO A, MAKRO B, MIKRO B sections with A and B colour coding, four concentrate columns (1L / 5L / 25L / 50L each with × and grams sub-columns), supplier source column, and a total row summing each concentrate
- Lock and unlock: locked recipes hide the Edit button and show Unlock instead. Kevin's recipe ships locked
- Clone: creates a fresh editable copy with "(copy)" / "(salinan)" appended to the name, owned by the current user
- Print: dedicated print CSS hides sidebar and buttons, keeps the coloured table, adds a centered "Sparmanik Farm" header with the recipe name
- Comments: timestamped comments per recipe, blocked on locked recipes
- Kevin's recipe is automatically seeded by the existing seed script - no new migration needed for Session 3

## What is in Session 4 (this drop)

- Dashboard rebuild with the full chart layout: four stat cards (revenue, kg harvested, wages paid, budget status), a line chart for the last 8 weeks of revenue, a bar chart for species breakdown this week, today's tasks card showing overdue and due-today items with assignee names, and a low stock card pulling from the inventory module
- Sales module ported from the HTML demo: full species dropdown (chili_red, chili_keriting, chili_green, chili_bigred, melon_yellow, melon_rock), grade A/B/C filter, period filter (all time / last 7 days / last 30 days), weekly rollup stat cards sorted newest first, a sortable table with coloured grade chips, new sale modal with auto-filled week number, owner-only delete
- Tasks module: sections for Overdue, Today, Upcoming, Completed with counts at the top, tappable checkbox to toggle done, multi-assign pills with per-staff colours (same hash algorithm as the HTML demo), priority chips in red/yellow/blue, category chips, ICS calendar file export per task or all pending tasks at once, new task modal with assignee checkboxes
- Rich seed data pulled from the HTML demo: 20 sales entries across 8 weeks, 9 staff wage rows, 6 tasks with multi-assign (Budi Santoso, Sri Wahyuni, Dewi Lestari, Agus Pranoto, Boyd Sparrow), plus Kevin Medan's second recipe (Vegetative, 9 ingredients) that was missed in Session 1
- Sidebar now has Dashboard, Sales, Tasks, Inventory, Recipes
- ICS calendar download works on any device - tap 📅 on a task to download a .ics file, open it on your phone and it adds to Apple Calendar, Google Calendar, or Outlook with a 1-hour reminder

## What is in Session 5 (this drop)

- Staff API: list wages, list profiles aggregated by name, create new wage entries, owner-only delete
- Staff page with profile cards (avatar, role, total hours, weeks worked, total earned in IDR), tap any card to see full history modal, weekly entries grouped by week descending with totals
- Accounting API: list, totals (income, expense, net), create manual entries, sync endpoint that rolls up sales and wages from those modules into auto entries (idempotent), delete (auto entries are protected)
- Accounting page with three big stat cards, manual/auto chips, coloured income (green) vs expense (red) amounts, sync button to pull in sales and wages rollups
- Forecast API: list with actuals computed live from accounting expense entries matched by category, totals with over-budget detection, create, owner-only delete
- Forecast page with a big total card showing over/under budget vs total budgeted, then per-category cards each with actual vs budgeted, variance, and progress bar (red if over)
- Plantings API: list with computed days_to_harvest, create, patch (for stage updates), owner-only delete
- Calendar page with full month grid (prev/next nav), day headers in EN or ID, events from plantings (planting and harvest dates) and tasks (coloured by first assignee), staff filter pills, "today" highlight, active plantings cards below with stage colour coding (seed purple, veg green, flower yellow, fruit orange, harvest red)
- 6 plantings, 3 manual accounting entries, and 6 forecast budgets are now seeded from the HTML demo data
- Sidebar now has 9 items: Dashboard, Calendar, Sales, Tasks, Inventory, Recipes, Staff, Accounting, Forecast

## What is in Session 6 (this drop)

- SOPs API: list active, list archive, create, replace (auto-archives the old version), archive, restore, owner-only permanent delete
- SOPs page with active/archive tabs, AI builder modal that calls Claude server-side, viewer modal showing steps + safety + frequency, replace flow that bumps version and archives the old one, version history shown on each SOP
- AI generate-sop endpoint that calls Claude with a structured JSON prompt and returns description, steps, safety_notes, frequency
- Videos API: list, create with auto YouTube URL conversion, owner-only delete
- Videos page with category > subcategory dropdown filters, embedded YouTube player in 16:9, bilingual category chips
- Suppliers API: list, create with computed total_cost, owner-only delete, plus shipping address GET/PUT endpoints
- Suppliers page with category quick chips, supplier cards showing image + supplier name + product + price/shipping/total breakdown + source link, manual new-supplier form with shipping address card pre-filled (Bintang Damanik, Pematang Siantar, Sumatera Utara), Shopee URL field for traceability
- AI chat endpoint that builds full farm context (sales, staff, tasks, inventory, recipes, suppliers, accounting, forecast, plantings, SOPs) and stuffs it into the system prompt, then calls Claude with the conversation history
- Ask AI page with chat bubble interface, suggested questions, thinking indicator, configuration check that warns if ANTHROPIC_API_KEY is not set
- 3 SOPs, 6 videos, 7 suppliers, and the default Bintang shipping address are all seeded
- Sidebar now has 13 items: Dashboard, Calendar, Sales, Tasks, Inventory, Recipes, SOPs, Videos, Suppliers, Staff, Accounting, Forecast, Ask AI

## What comes next

- Session 7: Weather API, Stock take photo identify (vision), Google Calendar OAuth two-way task sync, password change UI, dashboard wages and budget polish

## How to deploy Session 6

**IMPORTANT:** Session 6 is the first session that needs an Anthropic API key to fully work. Two of the four modules (SOPs and Ask AI) call Claude server-side. Videos and Suppliers work without it.

Step 1: Get an Anthropic API key from https://console.anthropic.com/settings/keys (you need a billing source set up, usually a $5 minimum).

Step 2: Add the key to Railway BEFORE pushing the code. Go to https://railway.com/project/5ee06477-2f01-428e-b939-d556fe2614d0, click your backend service (the one without "front-end" in the name), click the Variables tab, click + New Variable, name it `ANTHROPIC_API_KEY`, paste your key (starts with `sk-ant-...`), save. Railway will redeploy the backend automatically.

Step 3: Push the code.

```bash
cd sparmanik-farm
git add .
git commit -m "Session 6: SOPs, videos, suppliers, ask AI"
git push
```

Both services rebuild in 2-3 minutes (slightly longer because the backend is installing the anthropic SDK for the first time).

After deploying:
- Sign in as Boyd
- Tap SOPs - 3 SOPs seeded, tap "+ New with AI" to try the AI builder. Type a title, pick a category, paste a few rough bullet points, tap Generate. Claude will return a clean SOP draft.
- Tap Videos - 6 videos with category > subcategory tree
- Tap Suppliers - 7 suppliers seeded, tap one to see the price + shipping + total breakdown, tap "+ New supplier" to see the form with the pre-filled Bintang delivery address
- Tap Ask AI - try one of the suggested questions, or ask Claude anything about the farm data

If SOPs or Ask AI returns an error about "Anthropic API key not configured", that means step 2 was missed. Add the env var, wait 60 seconds for Railway to redeploy, try again.

## How to deploy Session 5

No new database migrations - all four modules use tables that already exist from migration 0001. Just push and Railway redeploys.

```bash
cd sparmanik-farm
git add .
git commit -m "Session 5: staff, accounting, forecast, calendar"
git push
```

After deploying:
- Sign in as Boyd
- Tap Calendar - month grid with the 6 plantings on their respective dates and the 6 tasks coloured by assignee
- Tap Staff - 4 profile cards (Agus, Sri, Budi, Dewi) sorted by total earned, weekly tables below
- Tap Accounting - 3 manual entries seeded, click ↻ Sync to pull in 8 weeks of sales and wages rollups
- Tap Forecast - 6 budget categories, will show actuals once you've synced accounting

## How to deploy Session 4

No new database migrations for Session 4. The tables already exist from migration 0001. The seed script has new data arrays but it's still idempotent - it only adds sales, staff, tasks, and the vegetative recipe if those tables are empty, so existing data stays untouched.

```bash
cd sparmanik-farm
git add .
git commit -m "Session 4: dashboard charts, sales, tasks"
git push
```

Railway auto-redeploys both services. The seed runs on the backend start and inserts the new data (sales, staff, tasks, vegetative recipe) if those tables were previously empty.

After deploying:
- Sign in as Boyd
- Dashboard should now show charts, stat cards, today's tasks, and low stock
- Tap Sales - you should see 20 entries grouped by week with the weekly rollup cards
- Tap Tasks - 6 tasks should appear with colour-coded assignee pills, try tapping 📅 on one to download a .ics file
- Language toggle still works across everything

## How to deploy Session 3

Session 3 adds no new database migrations, no new env vars, and no new Railway config. It's a pure code update.

```bash
cd sparmanik-farm
git add .
git commit -m "Session 3: nutrient recipes module"
git push
```

Railway will auto-redeploy both services. The backend registers the new `/api/recipes` routes, the frontend builds with the new page and sidebar item.

Kevin Medan's Generatif melon recipe is already seeded from Session 1 (it's in the seed script), so as soon as you visit /recipes you should see it. It ships locked by default.

After deploying:
- Sign in as Boyd
- Tap Recipes in the sidebar
- Kevin's recipe should appear with a 🔒 Locked badge
- Click it to see the full table with all 14 ingredients
- Try the EN/ID toggle - every field switches
- Try Print - your browser's print dialog opens showing just the table
- Try Clone - a new editable copy appears in the list

## How to deploy Session 2

If Session 1 is already deployed and live, you only need to push the new code. Railway will auto-deploy both services.

```bash
cd sparmanik-farm
git add .
git commit -m "Session 2: inventory module"
git push
```

The backend will:
1. Build the new Docker image
2. Run `alembic upgrade head` which applies migration `0002_inventory_adjustments` (creates the new audit table - additive, your existing data is untouched)
3. Run the seed (idempotent, no-op since users and inventory already exist)
4. Start uvicorn

The frontend will:
1. Build the new Vite bundle including the inventory page, AppShell, and updated dictionaries
2. Serve from `dist/`

No new env vars are needed for Session 2. CORS, database, JWT secret all stay the same.

After deployment:
- Open the frontend URL on your phone
- Sign in with `boydsparrow@gmail.com` / `changeme`
- Tap Inventory in the sidebar
- You should see all 31 items grouped by category with stats cards at the top
- Try the +/- buttons on a card to adjust quantities (instant feedback)
- Tap Adjust for the full reason-dropdown form
- Tap History on any item to see the audit trail
- Tap Stock Take to walk through every item one by one with photo capture

## Known limitations to clean up later

- Search has no debounce so each keystroke fires a request. Fine for the small inventory but should be debounced before we get to hundreds of items
- Stock take refreshes the full item list after each save instead of patching just the one item. Inefficient but simple
- Photo storage is base64 in Postgres, capped at ~3 MB encoded per image. Will move to Cloudflare R2 or Railway Volume in Session 6 or 7
- No password change UI yet - still need to do it via SQL on the Railway Postgres
- No optimistic update for create/edit/delete - those use a refresh after success

---

## Local development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set DATABASE_URL to your local Postgres
# Generate a JWT secret:
python -c "import secrets; print(secrets.token_hex(32))"
# Paste that into JWT_SECRET in .env

# Run migrations
alembic upgrade head

# Seed the database
python -m app.seed

# Start the server
uvicorn app.main:app --reload
```

Backend runs on http://localhost:8000. Visit http://localhost:8000/docs for the auto-generated OpenAPI docs.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# .env already points at localhost:8000 which is fine for local dev
npm run dev
```

Frontend runs on http://localhost:5173. Open it and log in with one of the seed users (see below).

### Seed users (default password: `changeme`)

| Email | Name | Role |
|---|---|---|
| boydsparrow@gmail.com | Boyd Sparrow | superuser |
| bintangdamanik85@gmail.com | Bintang Damanik | superuser |
| sparmanikfarm@gmail.com | Erni Damanik | admin |

**Change the passwords immediately after first login.** An endpoint for password change will land in Session 2.

---

## Pushing to GitHub

From the `sparmanik-farm` project root:

```bash
git init
git branch -M main
git add .
git commit -m "Session 1: auth, schema, login page"

# Create the repo on GitHub first (private, no README, no .gitignore, no license)
# at https://github.com/new
# Name: sparmanik-farm
# Visibility: Private

git remote add origin https://github.com/cansomeoneelsedoit/sparmanik-farm.git
git push -u origin main
```

---

## Deploying to Railway

This project uses two Railway services plus a Postgres addon, all in one Railway project.

### 1. Create the Railway project

1. Go to https://railway.app and create a new project
2. Name it `sparmanik-farm`
3. Click **New** → **Database** → **Add PostgreSQL**. Railway will provision it and expose `DATABASE_URL` as a shared variable

### 2. Deploy the backend

1. In the same project, click **New** → **GitHub Repo** → select `cansomeoneelsedoit/sparmanik-farm`
2. Railway will start building from the root. We need it to build from `backend/`:
   - Click the new service → **Settings** → **Root Directory** → set to `backend`
3. Add environment variables under **Variables**:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<paste output of: python -c "import secrets; print(secrets.token_hex(32))">
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
REFRESH_TOKEN_EXPIRE_DAYS=30
CORS_ORIGINS=https://sparmanik-farm-frontend.up.railway.app,http://localhost:5173
ANTHROPIC_API_KEY=<leave empty for now, add in Session 6>
ENVIRONMENT=production
```

4. Under **Settings** → **Networking** → **Generate Domain**. You will get something like `sparmanik-farm-backend.up.railway.app`
5. Railway redeploys. Check the deploy logs. You should see migrations run, then the seed output, then uvicorn starting
6. Test: `curl https://sparmanik-farm-backend.up.railway.app/health` should return `{"status":"healthy"}`
7. Test docs: open `https://sparmanik-farm-backend.up.railway.app/docs` in a browser

### 3. Deploy the frontend

1. Back in the project, click **New** → **GitHub Repo** → select the same `sparmanik-farm` repo
2. Click the new service → **Settings** → **Root Directory** → set to `frontend`
3. Add environment variable under **Variables**:

```
VITE_API_URL=https://sparmanik-farm-backend.up.railway.app
PORT=4173
```

**Important:** Vite bakes env vars into the build at build time. If you change `VITE_API_URL` later you must trigger a rebuild.

4. Under **Settings** → **Networking** → **Generate Domain**. You will get something like `sparmanik-farm-frontend.up.railway.app`
5. Go back to the backend service and update `CORS_ORIGINS` to include the real frontend domain
6. Railway redeploys both. Open the frontend URL and log in with `boydsparrow@gmail.com` / `changeme`

### 4. Change the default passwords

There is no password-change endpoint in Session 1. For now:

- Open the Railway Postgres service
- Click **Data** → run a SQL query to update, or connect via `psql`:

```sql
-- Hash a new password locally first:
-- python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('your-new-password'))"
UPDATE users SET password_hash = '<paste the bcrypt hash here>' WHERE email = 'boydsparrow@gmail.com';
```

A proper password-change UI lands in Session 2.

---

## Troubleshooting

**Backend deploy fails on migrations**
Check deploy logs. Most likely: `DATABASE_URL` is not set or `Postgres` service is not linked. Under backend **Variables**, confirm `DATABASE_URL=${{Postgres.DATABASE_URL}}`.

**Frontend loads but login hangs or fails**
Open the browser console and Network tab. If requests go to `http://localhost:8000` instead of the Railway backend, `VITE_API_URL` was not set at build time. Fix the variable and trigger a rebuild from Railway.

**CORS errors**
The browser console will say `blocked by CORS policy`. Add the frontend domain to `CORS_ORIGINS` on the backend service. Restart the backend.

**401 on every request after some time**
The refresh token expired (30 days). Just log in again. Frontend already handles access-token refresh automatically.

**"Could not load dynamic module" or similar Python import errors**
Check that `requirements.txt` versions match what is installed. Rebuild the backend service.

---

## Project layout

```
sparmanik-farm/
├── backend/
│   ├── app/
│   │   ├── main.py              FastAPI app, CORS, router registration
│   │   ├── config.py            Env vars via pydantic-settings
│   │   ├── database.py          SQLAlchemy engine + session
│   │   ├── auth.py              JWT + bcrypt + get_current_user dependency
│   │   ├── seed.py              Idempotent seed script
│   │   ├── models/              ORM models (all tables)
│   │   ├── schemas/             Pydantic request/response models
│   │   └── routers/             Endpoint groups per module
│   ├── alembic/                 Migrations
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── railway.json
│   └── start.sh                 Runs migrations, seeds, starts uvicorn
├── frontend/
│   ├── src/
│   │   ├── main.tsx             Entry
│   │   ├── App.tsx              Router + providers
│   │   ├── index.css            Tailwind + dark theme variables
│   │   ├── api/client.ts        Typed fetch with auto-refresh on 401
│   │   ├── hooks/useAuth.tsx    Auth context
│   │   ├── i18n/                EN/ID dictionaries and useI18n hook
│   │   ├── pages/               LoginPage, DashboardPage
│   │   └── components/          (shared UI lands in Session 2)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   ├── Dockerfile
│   └── railway.json
└── README.md
```
