# Carbonify

Carbonify (repo/internal name **ecolink**; `package.json` name `carbonify`) is a Philippine carbon-credit **registry + marketplace** web app. Project developers register MRV (Measurement, Reporting & Verification) projects, verifiers assess them, credits are issued with QR-verifiable certificates, and buyers purchase and retire credits through a server-authoritative money path backed by PayMongo. Local government units (LGUs) and the public get registry and analytics views.

## Key features

**Registry / MRV**

- Project submission, developer project dashboard, and monitoring reports
- Verifier panel with verification checklists / assessments
- Credit issuance with serials, atomic multi-row retirement, and QR-verifiable certificates (public verification at `/verify/:certificateNumber`)
- Public carbon registry (`/registry`) and public market dashboard (`/market`)

**Marketplace / payments**

- Marketplace, cart, buy-credits, watchlist, and credit portfolio
- Server-authoritative purchase settlement: financial tables are server-write-only via RLS; settlement runs through `SECURITY DEFINER` RPCs and a **signed PayMongo webhook**
- Wallet, escrow holds, seller earnings, seller payouts, refunds/disputes, and receipts

**Roles / security**

- Roles: general user, buyer/investor, project developer, verifier, LGU, farmer, admin — 7 total (see `src/constants/roles.js`)
- Supabase Auth with MFA/2FA step-up enforcement in the router guard, OAuth/phone callback, KYC (buyer) and KYB (seller) flows
- Role-based route guards and finance-restricted role gating in `src/router/index.js`

**LGU / analytics**

- LGU dashboard and emissions records
- Admin console: user management, role applications, KYC/KYB review, finance console, refunds, audit logs, and system config

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Vue 3 (`<script setup>`), Vue Router, Pinia |
| Build | Vite 7 (`@` → `src` alias) |
| Backend | Supabase — Postgres + Auth + Edge Functions (Deno) + Storage |
| Payments | PayMongo (test/live), via Supabase Edge Functions |
| Maps / charts | Leaflet, Chart.js (`vue-chartjs`) |
| Docs / codes | jsPDF, `qrcode` |
| Tooling | Vitest (unit), Playwright (e2e), ESLint (flat config), Prettier |
| Node | `^20.19.0 || >=22.12.0` |

## Quickstart

```bash
# 1. Clone and install
git clone <repo-url> ecolink
cd ecolink
npm install

# 2. Create your local env file (see the env table below / docs/dev/ENVIRONMENT_VARIABLES.md)
#    Carbonify reads a plain .env / .env.local at the project root.
cp docs/dev/ENVIRONMENT_VARIABLES.md /dev/null  # (reference only — copy the vars manually)

# 3. Start the dev server (http://localhost:5173)
npm run dev
```

Minimum frontend variables to boot the app:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key (public by design) |
| `VITE_SUPABASE_PROJECT_REF` | Recommended | Project ref; used to build the Edge Functions URL |
| `VITE_SUPABASE_FUNCTIONS_URL` | Optional | Explicit Edge Functions base URL (overrides the ref) |

The full list of frontend and Edge-function variables is in **[docs/dev/ENVIRONMENT_VARIABLES.md](docs/dev/ENVIRONMENT_VARIABLES.md)**. Full setup (schema, edge functions, test accounts) is in **[docs/dev/SETUP.md](docs/dev/SETUP.md)**.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port 5173 |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint with `--fix` |
| `npm run lint:check` | ESLint without fixing (CI-style check) |
| `npm run format` | Prettier over `src/` — **known to break the build; do not run casually** (see `docs/DEFERRED_BACKLOG.md`) |
| `npm run test` / `npm run test:run` | Vitest (watch / single run) — 145 unit tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:coverage` | Vitest with V8 coverage |
| `npm run setup:supabase` | Diagnose Supabase connection + expected tables (read-only) |
| `npm run setup:accounts` | Seed the four test accounts (needs `SUPABASE_SERVICE_ROLE_KEY`) |
| `npm run deploy:paymongo` | Deploy the `paymongo-checkout` edge function |
| `npm run deploy:webhook` | Deploy the `paymongo-webhook` edge function |

## Project structure

```
src/
  views/        route-level pages (marketplace, registry, admin, wallet, ...)
  components/   reusable UI (auth, admin, search, ...)
  services/     Supabase client, auth, payments, email, MFA/KYC services
  store/        Pinia stores (userStore, ...)
  router/       Vue Router + role/MFA guards
  constants/    roles and other enums
  config/       database.js
  middleware/   role guards
  utils/        analytics, helpers
supabase/
  migrations/   SQL migrations (applied BY HAND in the SQL Editor — see below)
  functions/    Deno edge functions (paymongo-checkout, paymongo-webhook, process-payouts, account-deletion, send-approval-email)
  diagnostics/  read-only schema audit scripts
  cutover/      financial-write lockdown SQL
scripts/setup/  setup-supabase.js, setup-test-accounts.js
```

> **Migrations are applied by hand.** There is no CLI migration tracking; the live database drifts from `supabase/migrations/`. Do **not** run `supabase db push`. Apply SQL in the Supabase SQL Editor and use `supabase/diagnostics/schema_catchup_audit.sql` to detect drift. See `docs/dev/SETUP.md` and the Supabase migration notes.

## Documentation

- **User guide:** [docs/user-guide/README.md](docs/user-guide/README.md)
- **Developer docs:** [docs/dev/README.md](docs/dev/README.md) — index of ARCHITECTURE, DATABASE_AND_RPCS, DEPLOYMENT, TESTING, CONTRIBUTING, SECURITY, plus [SETUP.md](docs/dev/SETUP.md) and [ENVIRONMENT_VARIABLES.md](docs/dev/ENVIRONMENT_VARIABLES.md)
- **System overview:** [docs/SYSTEM_GUIDE.md](docs/SYSTEM_GUIDE.md)
- **Payments architecture:** [docs/PAYMENTS_ARCHITECTURE.md](docs/PAYMENTS_ARCHITECTURE.md)
- **Money cutover:** [docs/MONEY_CUTOVER_STATUS.md](docs/MONEY_CUTOVER_STATUS.md), [docs/YOUR_CUTOVER_STEPS.md](docs/YOUR_CUTOVER_STEPS.md), [docs/NEXT_STEP_verify_money_path.md](docs/NEXT_STEP_verify_money_path.md)

## Status

Feature-complete. The money path is proven in the sandbox and hardened (financial tables are server-write-only via RLS; settlement via `SECURITY DEFINER` RPCs + a signed PayMongo webhook). Remaining work is largely external / ops-legal (production PayMongo credentials, KYB/payout operations, and compliance) rather than application code.
