# Carbonify — Build & Finish Prompt (Spec + Tech Stack + Enhancements)

A reusable, copy-paste **prompt** for an AI coding agent (or a developer) to either **rebuild a Carbonify-class system from scratch** or **finish the existing one**. It encodes the architecture, the tech stack, the non-negotiable money-safety and security rules learned in production, and a prioritized enhancement list.

**How to use this file**
- **To build a fresh system:** paste **Part A** (the build prompt) into your agent, then follow **Part B** (stack) and **Part E** (guardrails).
- **To finish the existing Carbonify:** paste **Part D** (the finish prompt) — it references the real repo state.
- **Parts B/C** are recommendations you can accept or swap.

---

## Part A — The build prompt (copy-paste)

> **You are building "Carbonify," a Philippine carbon-credit registry and marketplace web application.** Build it end-to-end with the architecture, roles, and safety rules below. Prefer boring, well-supported technology. Ship in vertical slices (auth → projects → verification → issuance → marketplace → money → admin), each fully working and tested before the next.
>
> ### What the product is
> A platform that manages the full carbon-credit lifecycle: **Register → Validate → Monitor & Verify (MRV) → Issue → Trade → Retire.** Project developers register climate projects; verifiers assess them against a scored rubric; credits are issued with unique serials and QR-verifiable, tamper-evident certificates; buyers purchase and permanently retire credits to offset emissions; local governments use climate tools; the public can browse a registry and verify any certificate without logging in.
>
> ### Roles (6)
> `general_user`, `buyer_investor`, `project_developer`, `verifier`, `admin`, `lgu_user`. Access is gated by three independent things: **authentication** (signed in), **role** (what workspace you see), and **KYC level** (identity verification, required to buy/trade). Sellers additionally need **KYB** (business verification) to withdraw earnings.
>
> ### Core features to build
> - **Auth & security:** email/password, password reset, TOTP 2FA with step-up, role-based access with server-side enforcement, audit logging.
> - **Projects:** submission form (title, geo-location + boundary polygon on a map, a fixed list of local project types, dates), a set of required compliance documents (uploads), a status workflow (Draft → Submitted → In Review → Needs Revision → Validated → Rejected), a developer dashboard, and edit/resubmit after revision.
> - **MRV:** monitoring reports with activity data + evidence; **server-side** emission-reduction calculation (the developer must not be able to dictate the credit amount); a verifier review dashboard that approves a Verified Emission Reduction (VER), which is what **mints** the credits.
> - **Verification:** a review queue with aging/SLA, a weighted scored rubric (e.g. Inadequate/Adequate/Strong × weights → band), a two-way developer↔verifier comment thread, and the verifier sets the credit price at validation.
> - **Issuance & certificates:** per-unit serial numbers, a QR code + cryptographic signature over stable fields, a public verification page (`/verify/:serial`), and PDF certificates.
> - **Marketplace:** browse/filter by location/price/type, a map view, a project detail page, a cart for multiple items, purchase via a real payment gateway, ownership transfer, receipts, a buyer portfolio with gain/loss, watchlist + price alerts, and **retirement** with a retirement certificate and anti-double-counting.
> - **Money (see Part E — this is the highest-risk part):** wallet + top-up, server-authoritative purchase settlement, escrow, KYB-gated seller payouts, refunds/disputes, a double-entry ledger, and a reconciliation report.
> - **Admin & compliance:** user/role management, KYC/KYB review, a finance console (sales/fees/payouts + reconciliation), refunds/disputes console, system config (fees, KYC tiers, emission factors), audit-log search, VAT invoices, and DPA tooling (self-service data export + account deletion).
> - **Public/transparency:** a searchable registry of issued/retired credits, a market dashboard (supply, price, retirements), and a double-claim guard (a serial can't back two certificates).
> - **LGU tools:** municipal-waste emissions calculator, waste-diversion tracking, city ESG summary, and project endorsements.
>
> ### Build order (vertical slices, each tested)
> 1. Auth + roles + RLS foundation. 2. Projects + documents. 3. Verification + MRV. 4. Issuance + certificates + public verify. 5. Marketplace + cart + portfolio + retire. 6. **Money path** (do this carefully, per Part E). 7. Seller payouts + KYB. 8. Admin/compliance + public registry. 9. LGU tools. 10. PWA/offline + polish.
>
> ### Definition of done for every slice
> Lint clean, unit tests for the logic, a working UI path, server-side authorization (not just client route guards), and — for anything touching money — a reconciliation that nets to zero.

---

## Part B — Recommended tech stack

The stack Carbonify uses today works and is a reasonable choice. The table shows **what it uses** and **what to consider** if starting fresh or upgrading.

| Concern | Carbonify today | Recommended / upgrade | Why |
|---|---|---|---|
| Frontend framework | Vue 3 (`<script setup>`) | **Keep Vue 3**, or Nuxt 3 if you want SSR/SEO for public pages | Public registry/marketplace benefit from SSR; Nuxt gives routing/SEO/data-fetching for free |
| Language | JavaScript | **Adopt TypeScript** | Money/ledger code is exactly where types prevent bugs; strongly recommended |
| State | Pinia | Keep Pinia | Simple, official |
| Build | Vite | Keep Vite | Fast, standard |
| Backend / DB | Supabase (Postgres, Auth, Edge Functions, Storage) | Keep Supabase; **adopt CLI migrations** (`supabase db push`) instead of hand-applied SQL | The #1 maintainability fix — see Part C |
| Server logic | Postgres `SECURITY DEFINER` RPCs + Deno Edge Functions | Keep; move heavy/batch jobs (reconciliation, payouts, reports) to a dedicated worker as volume grows | Edge functions have CPU/cold-start limits |
| Payments (PH) | PayMongo (cards, GCash, Maya) | Keep PayMongo or Xendit; **a licensed PSP/EMI must custody funds** for real operation | Regulatory requirement, not a code choice |
| Real credits | Issued in-platform, not registry-backed | **Carbonmark / Cloverly / Patch API** for externally verified credits | Fastest path to registry-backed credits without becoming a registry |
| Maps | Leaflet + OpenStreetMap | Keep (no API key, free tiles) | Good enough; MapLibre if you need vector tiles |
| Charts | Chart.js (`vue-chartjs`) | Keep | Fine |
| PDFs / QR | jsPDF + `qrcode` | Keep, or server-side PDF for tamper-resistance | Server-rendered certs are harder to forge |
| Email | Resend (via edge function) | Keep; **custom SMTP** for auth confirmations | Needed to enable email verification |
| Hosting | Vercel (frontend) + Supabase | Keep; never put money logic in Vercel functions | Keep money logic in Postgres/Supabase |
| Tests | Vitest + Playwright + MSW | Keep; add coverage gates + make e2e required in CI | Money code needs regression protection |
| Observability | none | **Add Sentry + payment/webhook dashboards** | You cannot operate real money blind |
| Error/rate limits | none | Add rate limiting at the edge (per-IP/per-user) | Abuse/cost protection |

**Minimum viable stack if starting today:** Nuxt 3 + TypeScript + Supabase (with CLI migrations) + PayMongo/Xendit behind a provider interface + Sentry, deployed on Vercel + Supabase.

---

## Part C — Recommendations & enhancements

Ordered by leverage. Items marked **(hard-won)** are lessons from this codebase.

### Architecture & maintainability
1. **(hard-won) Adopt tracked migrations.** The single biggest source of production bugs here was hand-applied SQL drifting from the migration files (missing functions/columns/constraints surfaced only at runtime). Use `supabase db push` (or an equivalent) as the *only* way schema changes land; keep a read-only drift-audit script for safety.
2. **(hard-won) Keep ALL money writes server-side.** The browser must never write financial tables. Settle everything through `SECURITY DEFINER` RPCs (scoped to `auth.uid()`) or a service-role webhook, and lock the financial tables to server-write-only via RLS.
3. **Adopt TypeScript**, starting with the services/store/money layer.
4. **Consolidate duplicated data-model quirks** (e.g. dual columns for the same concept) before they cause drift.

### Money & trust (do before real users)
5. **(hard-won) Server-authoritative amounts + signed, idempotent webhook as the source of truth.** Client sends only `{listing_id, quantity}`; server recomputes price; webhook verifies HMAC + replay window + event dedup and fails closed. Every settlement writes balanced double-entry ledger legs; a reconciliation job must return zero drift.
6. **Real credit supplier integration** (Carbonmark/Cloverly/Patch) behind a `CreditSupplier` interface, with a purchase → place-order → retire saga and compensating refunds on failure.
7. **External reconciliation** against the PSP's settlement report (not just system-vs-self).
8. **Self-purchase / wash-trading guards** and velocity caps by KYC tier.

### Security (do before live keys — see DEPLOYMENT_READINESS.md)
9. **Lock privileged columns** (`role`, `kyc_level`) so users can't self-escalate; route all role/KYC changes through admin RPCs only.
10. **Enforce authorization server-side** (RLS + `is_admin()`), treating client route guards as UX only; consider **AAL2 (MFA) enforcement in RLS** for admin operations.
11. **Close open endpoints** (authenticate the email function; require a verified JWT for checkout identity; remove legacy/demo code paths).
12. **Add CSP + security headers**, strip PII from prod logs, and keep all secrets in server env only.
13. **Independent penetration test** before switching to live payment keys — non-negotiable.

### Product & UX enhancements
14. **Real registry-grade certificates** (server-rendered, registry serials, retirement receipts).
15. **Verifier task queue depth** (assignment, filters, SLA scoring) and evidence-integrity checks (EXIF geotag/timestamp, duplicate detection).
16. **Buyer trust:** richer project detail (methodology, co-benefits, SDG data that actually filters), ESG/offset report export, shareable retirement badges, recurring auto-offset.
17. **Notifications** across web + email + (later) web push; MRV reminders.
18. **Mobile:** installable PWA with offline reads (already scaffolded); native later only if needed.
19. **Analytics/reporting exports** (CSV/PDF) for admins and LGUs.

### Operations & longevity
20. **Observability** (Sentry, payment success %, webhook lag, drift, failed-payout alerts).
21. **Backups/PITR + tested restore**, connection pooling (PgBouncer/Supavisor), partitioned ledger as volume grows.
22. **CI gates:** lint 0, unit tests, e2e on a seeded backend, and a migration-applies check.
23. **Institutional track (not code):** legal entity, licensed PSP/EMI partnership, AML program + DPO/DPA compliance, BIR registration + VAT-accredited receipts, and an accredited third-party verifier (VVB) — these gate "real carbon market" status more than software does.

---

## Part D — Prompt to *finish* the existing Carbonify

> **You are finishing the existing Carbonify repo (Vue 3 + Supabase + PayMongo).** The full feature set is built and the server-authoritative money path is proven and hardened (all flows reconcile to zero; financial tables are server-write-only). Do NOT rewrite working systems. Your job is to close the remaining gaps in priority order. Before changing any money RPC or edge function, re-run the sandbox flows (card, wallet top-up, wallet purchase, cart, retire, subscription) and confirm `reconcile_financials()` returns zero after each.
>
> **Priority 1 — security before real users** (see `docs/dev/DEPLOYMENT_READINESS.md`):
> 1. Apply migration `20260703000300` (lock `profiles.role`/`kyc_level`) and verify a normal user can't self-promote while admin/verifier/KYC flows still work.
> 2. Apply `20260703000400` (retirement identity = `auth.uid()`) and retest retire.
> 3. Redeploy `send-approval-email` with `verify_jwt=true` (close the open email relay).
> 4. Redeploy `paymongo-checkout` to reject requests without a verified JWT (stop trusting client `user_id`).
> 5. Remove the legacy/demo code paths (raw checkout branch, legacy webhook branches, `demo` purchase branch, dead wallet mutators).
> 6. Add a Content-Security-Policy (test against Leaflet/Supabase/PayMongo), rate limiting on public functions, and Sentry.
> 7. Turn on email confirmation with a custom SMTP provider.
> 8. Commission an independent penetration test before using live PayMongo keys.
>
> **Priority 2 — make credits real:** integrate a real credit supplier (Carbonmark/Cloverly/Patch) behind a `CreditSupplier` interface; attach registry serials + retirement receipts to certificates; add external PSP reconciliation.
>
> **Priority 3 — maintainability:** move to tracked migrations, adopt TypeScript in the money/services layer, consolidate the dual-column data-model quirks, and make e2e required in CI.
>
> **Priority 4 — polish:** verifier task-queue depth, evidence-integrity checks, ESG/report exports, web push, and richer buyer-trust surfaces.
>
> **Guardrails:** never write financial tables from the browser; keep amounts server-computed; keep secrets server-side; every money change must reconcile to zero and preserve idempotency. Work on a feature branch, gate on lint 0 + tests + build, and describe any DB/edge steps a reviewer/operator must run.

---

## Part E — Non-negotiable guardrails (money & security)

Any implementation of a Carbonify-class system MUST hold these invariants:

1. **The client never sets a price or an amount.** The server recomputes every charge from trusted data (listing price, plan catalog). The browser sends identifiers and quantities only.
2. **The payment provider's signed webhook is the single source of truth** for settlement — verified (HMAC + replay window), idempotent (event dedup), and fail-closed (reject if unsigned/unverifiable).
3. **The browser never writes financial tables.** All money writes go through server-side functions scoped to the authenticated user, and the financial tables are locked to server-write-only.
4. **Double-entry ledger + reconciliation.** Every money movement writes balanced entries; a reconciliation report must return zero drift, and it must not be blind to any settlement path.
5. **Identity is bound to the verified session**, never to a client-supplied user id, everywhere money or roles are involved.
6. **Privileged columns (role, KYC level) are not client-writable.** Authorization is enforced server-side (RLS + `SECURITY DEFINER`), not only in the router.
7. **Secrets live only on the server.** The browser bundle carries public keys only.
8. **Nothing goes to live payment keys without an independent penetration test.**

> Companion docs: [ABOUT_CARBONIFY.md](ABOUT_CARBONIFY.md) (what it is) · [dev/ARCHITECTURE.md](dev/ARCHITECTURE.md) · [dev/DATABASE_AND_RPCS.md](dev/DATABASE_AND_RPCS.md) · [PAYMENTS_ARCHITECTURE.md](PAYMENTS_ARCHITECTURE.md) · [dev/DEPLOYMENT_READINESS.md](dev/DEPLOYMENT_READINESS.md) · [dev/SECURITY.md](dev/SECURITY.md).
