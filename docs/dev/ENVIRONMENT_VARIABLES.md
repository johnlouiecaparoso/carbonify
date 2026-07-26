# Environment Variables

Complete reference for Carbonify's configuration: **frontend `VITE_*` variables** (read at build/runtime and shipped to the browser) and **Edge-function secrets** (set in Supabase, never committed, read via `Deno.env.get(...)`).

See also: [SETUP.md](SETUP.md) · [SECURITY.md](SECURITY.md) · [../PAYMENTS_ARCHITECTURE.md](../PAYMENTS_ARCHITECTURE.md)

## Public vs. secret

- **Public (safe to expose):** all `VITE_*` variables are compiled into the browser bundle by Vite. `VITE_SUPABASE_ANON_KEY` is public **by design** — access is constrained by Postgres Row-Level Security, not by key secrecy. Never put a real secret behind a `VITE_` prefix.
- **Secret (never in the frontend, never committed):** `SUPABASE_SERVICE_ROLE_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, and the worker/deletion secrets. These live only in Node setup scripts and Supabase Edge Function secrets.

## Frontend `VITE_*` variables

Read via `import.meta.env.*` in `src/services/supabaseClient.js`, `src/services/emailService.js`, `src/services/paymongoService.js`, `src/utils/sentry.js` and `src/utils/analytics.js`. Placed in a root `.env` / `.env.local`.

> **Corrected 2026-07-26.** This line also named `src/config/environment.js` and `src/config/production.js`. Neither was imported by anything, and both were deleted in the dead-code pass — which means the four variables they were the only readers of have **never had any effect**. They are marked ⚠️ in the table below rather than removed, so that anyone who has them set in a `.env` knows they can go.

| Variable | Required | Purpose | Example / placeholder |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | **Yes** | Supabase project URL; used to create the client (`supabaseClient.js`). Validated at runtime. | `https://abcd1234.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Supabase anon/public key for the browser client. Public by design (RLS-guarded). | `eyJhbGciOi...` |
| `VITE_SUPABASE_PROJECT_REF` | Recommended | Project ref used by `emailService.js` to build the Edge Functions URL when `VITE_SUPABASE_FUNCTIONS_URL` isn't set. | `abcd1234` |
| `VITE_SUPABASE_FUNCTIONS_URL` | Optional | Explicit Edge Functions base URL; overrides the ref-derived URL (`emailService.js`). | `https://abcd1234.functions.supabase.co` |
| `VITE_API_BASE_URL` | ⚠️ **No effect** | Read by nothing. It survives only as the usage example in a comment at the top of `src/utils/env.js`. Safe to delete from any `.env`. | — |
| `VITE_ENABLE_ANALYTICS` | ⚠️ **No effect** | Read by nothing. Analytics is gated instead on `import.meta.env.PROD` plus a real `VITE_GA_TRACKING_ID` — see that row. | — |
| `VITE_ENABLE_ERROR_REPORTING` | ⚠️ **No effect** | Read by nothing. Error reporting is gated on `VITE_SENTRY_DSN` being set. | — |
| `VITE_ENABLE_PERFORMANCE_MONITORING` | ⚠️ **No effect** | Read by nothing. Tracing is controlled by `VITE_SENTRY_TRACES_SAMPLE_RATE`. | — |
| `VITE_SENTRY_DSN` | Optional | **Enables Sentry error tracking.** When set, `src/utils/sentry.js` dynamically loads `@sentry/vue` and initializes it (errors + traces). When unset, Sentry is fully dormant (SDK never loaded). | `https://...@sentry.io/...` |
| `VITE_SENTRY_ENVIRONMENT` | Optional | Sentry environment tag (defaults to the Vite mode, e.g. `production`). | `production` |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Optional | Fraction of transactions traced (0–1); defaults to `0.1`. | `0.1` |
| `VITE_GA_TRACKING_ID` | Optional | Google Analytics measurement ID (`src/utils/analytics.js`). Until 2026-07-26 this defaulted to the literal `GA-XXXXXXXXX`, which is truthy — so production injected a gtag script for a non-existent property on every page load. Placeholder-shaped IDs are now rejected; leave it unset and analytics stays off. | `G-XXXXXXXXXX` |

> Vite only reads env at process start — restart `npm run dev` after changing `.env.local`.

## Edge-function secrets

Set in Supabase (Project Settings → Edge Functions → Secrets, or `supabase secrets set`). Read via `Deno.env.get(...)` in `supabase/functions/*/index.ts`. **Never** committed or exposed to the browser.

| Secret | Used by (function) | Purpose |
| --- | --- | --- |
| `PAYMONGO_SECRET_KEY` | `paymongo-checkout`, `paymongo-webhook` | PayMongo API secret for creating checkout sessions and querying/settling payments. |
| `PAYMONGO_WEBHOOK_SECRET` | `paymongo-webhook` | Verifies the PayMongo webhook signature (with a ±300s replay tolerance). |
| `PAYOUT_WORKER_SECRET` | `process-payouts` | Shared secret authorizing the payout worker to run. |
| `ACCOUNT_DELETION_SECRET` | `account-deletion` | Shared secret authorizing account-deletion requests. |
| `SUPABASE_SERVICE_ROLE_KEY` | all functions + `scripts/setup/setup-test-accounts.js` | Privileged DB access that bypasses RLS for server-authoritative writes. **Highly sensitive.** |
| `SUPABASE_URL` | all functions | Supabase project URL used by the server-side client. |
| `SUPABASE_ANON_KEY` | `paymongo-checkout` | Anon key for a caller-scoped client inside the function. |
| `CREDIT_SUPPLIER` | `paymongo-webhook` | Selects the credit supplier for fulfillment; defaults to `mock` when unset. |
| `ALLOW_UNSIGNED_WEBHOOKS` | `paymongo-webhook` | When `true`, accepts unsigned webhooks (**local/dev only**). Default is fail-closed — no secret and no opt-in ⇒ reject. |
| `RESEND_API_KEY` | `send-approval-email` | Resend API key for transactional email. |

## Notes on the money path

Financial tables are server-write-only via RLS, so the browser (anon key) cannot write balances, ledger entries, or ownership directly. Settlement runs through `SECURITY DEFINER` RPCs invoked by the signed `paymongo-webhook` function using the service-role key. This is why `PAYMONGO_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` must be treated as high-value secrets and kept out of the frontend bundle. See [../PAYMENTS_ARCHITECTURE.md](../PAYMENTS_ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).
