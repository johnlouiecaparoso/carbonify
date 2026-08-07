# Carbonify — Commercial Feature Implementation Plan

> **Drafted:** 2026-07-20 · **Both open items built:** 2026-08-06
>
> This was a plan. It is now a record of what was built, kept in the same file so
> the reasoning and the result stay next to each other.

## Scope — the five revenue streams

| Feature | State on 2026-07-20 | State now |
|---|---|---|
| Project onboarding fees | Not implemented as a product flow | ✅ **Built** — `20260806000300` |
| Verification & certification support | Already implemented | ✅ Live; the **fee** is now billed too |
| Marketplace transaction fees | Already implemented | ✅ Live, unchanged |
| Premium enterprise tools and data analytics | Already implemented | ✅ Live, unchanged |
| White-label MRV/API solutions | Roadmap-adjacent only | ✅ **Built** — `20260806000400` |

**All five now collect, or can be made to collect by setting a price.**

---

## 1. Project onboarding fees — built

### What existed before

Two admin-editable numbers in `app_settings` (`project_onboarding_fee`,
`verification_fee`) rendered as a card on the submit-project form. Nothing
charged them, nothing recorded that they were owed, and nothing booked them to
platform revenue. Two of the five revenue streams were a label on a screen.

### The billing moment, and why

**Validation, not submission.** An invoice is raised when a project reaches
`validated`, and when a monitoring report reaches `approved`.

Billing at submission would charge for work that has not been accepted yet, and
every rejection would then owe a refund. Refunds are the most expensive thing a
young payment integration can take on. Billing at validation means the platform
only ever invoices for a decision it has already delivered, and the refund path
stays as narrow as it is today.

### Invoice, not gate

A `due` invoice does **not** block validation, listing, or issuance. Whether an
unpaid fee should suspend a project is a commercial decision, written up as
**backlog #48** rather than assumed. Turning a fee into a gate is a small change
on top of this; unpicking a gate nobody agreed to is not.

### What was built

| Piece | Where |
|---|---|
| `project_fee_invoices` table, RLS, partial unique indexes | `supabase/migrations/20260806000300_project_fee_invoices.sql` |
| Triggers on `projects.status` and `monitoring_reports.status` | same |
| `pay_project_fee_from_wallet` (authenticated), `mark_project_fee_paid` (service_role), `waive_project_fee` (admin) | same |
| `reconcile_project_fees()` | same |
| `create_project_fee_checkout` action | `supabase/functions/paymongo-checkout/index.ts` |
| `project_fee` settlement branch | `supabase/functions/paymongo-webhook/index.ts` |
| Client service | `src/services/projectFeeService.js` |
| Developer statement at `/developer/fees` | `src/views/ProjectFeesView.vue` |
| Admin panel + waive | `src/views/FinanceConsoleView.vue` |

### Acceptance check — met

- ✅ **The developer sees the fee before submission.** The disclosure card on the
  submit form remains, and now states truthfully when the charge occurs.
- ✅ **Charged once per project lifecycle, not on every edit.** Enforced
  structurally by two partial unique indexes, not by careful calling. Re-saving a
  validated project produces no second invoice.
- ✅ **The ledger distinguishes onboarding revenue from marketplace revenue.**
  Fee entries carry `ref_type = 'project_fee'`; marketplace entries carry
  `'purchase'`. Both credit `platform_revenue`, so total revenue stays one number
  while its sources stay separable.

### Two properties worth keeping

- **Zero is inert.** Both settings ship at 0, and the raising function returns
  null on a non-positive fee. On a database where no price is set, this migration
  creates nothing and notifies nobody.
- **The amount is snapshotted.** Raising the price next month does not restate an
  invoice already sent.

### Reconciliation

Deliberately invisible to `reconcile_financials()`: its check #1 is scoped to
`purpose = 'marketplace_purchase'` and #5 inner-joins `credit_transactions`,
which a fee intent never has. Check #3 (ledger groups must balance) **does**
apply, and both settlement paths post balanced two-leg entries.
`reconcile_financials` was **not redefined** — fee checks live in their own
`reconcile_project_fees()`, because this repository has twice had a newer
function definition silently reverted by an older file being replayed.

---

## 2. White-label MRV/API — built

### What existed before

`supabase/functions/public-registry` — an unauthenticated read-only mirror of the
public registry, carrying its own warning: *"No API-key gating or rate limiting
yet. Add both before advertising this as a paid/white-label product."*

### The three things a sellable API needs

| Need | How it is met |
|---|---|
| **Identity** — who is calling | Keys belong to tenants. The raw key is shown **once**, at creation, and never stored: the table holds a SHA-256 digest and a display prefix. A database dump does not yield a working credential. |
| **Authority** — what they may call | Scopes, not a boolean: `registry:read`, `certificates:read`, `mrv:read`. A tenant paying for one must not silently receive another. An unknown scope is **rejected** at issue, not ignored. |
| **A meter** — how much they may call | Per-key requests-per-minute, through the existing `check_rate_limit` rather than a second limiter with its own bugs. The limit is a per-key column because it is a price tier. |

### Branding is data, not a deployment

`display_name`, `logo_url`, `primary_color` and `support_email` travel in every
keyed response, so one deployment serves a partner-branded front-end. The
alternative — a build per partner — multiplies every future fix by the customer
count.

### What was built

| Piece | Where |
|---|---|
| `api_tenants`, `api_keys`, scopes, RLS | `supabase/migrations/20260806000400_api_tenants_and_keys.sql` |
| `upsert_api_tenant`, `create_api_key`, `revoke_api_key` (admin) | same |
| `authenticate_api_key`, `api_project_mrv_summary` (service_role only) | same |
| Two-tier API, scope checks, per-key limiter, branding block | `supabase/functions/public-registry/index.ts` |
| Endpoint + security reference | `supabase/functions/public-registry/README.md` |
| Client service | `src/services/apiKeyService.js` |
| Admin console at `/admin/api-keys` | `src/views/AdminApiKeysView.vue` |

### Acceptance check — met

- ✅ **A partner can authenticate.** `Authorization: Bearer ck_live_…`, verified
  by digest. Unknown, revoked, expired and inactive-tenant keys all return the
  same 401 — a distinguishable response would confirm which keys exist.
- ✅ **A partner can retrieve MRV and certificate data through documented
  endpoints.** `?mrv=<uuid>` (aggregates: issued, retired, removed/avoided split)
  and `?certificate=<serial>`, both documented in the README.
- ✅ **The same data can be presented under Carbonify or partner branding.** The
  `tenant` block on every keyed response.

### What is deliberately absent

- **No write scopes.** Every scope is read-only. Partner writes mean idempotency,
  authorship and audit attribution — a much larger design, and inventing it
  speculatively would be inventing an attack surface.
- **No version prefix yet.** Backlog **#50**: freeze under `/v1/` before the first
  partner integrates.
- **No billable usage metering.** Backlog **#51**: the limiter answers "may this
  call proceed", which is not "how many calls happened last month".

### The unauthenticated tier still works

Kept on purpose. The public registry is a transparency claim, and putting a key
in front of it would retract that claim. Anonymous callers get the same public
data, an IP-based limit, and no branding.

---

## 3. Streams that needed no change

- **Verification and certification support** — public certificate verification,
  QR checks, tamper-evident signatures. Live before this work; its **fee** is now
  billed by the same mechanism as onboarding.
- **Marketplace transaction fees** — `platform_fee_percent` applies at purchase
  and books to `platform_revenue`. Untouched.
- **Premium enterprise tools and analytics** — Free/Pro/Business gating in
  `src/constants/plans.js`, enforced server-side. Untouched.

## 4. Before any of this earns money

1. **Apply both migrations**, in order, and run each file's VERIFY block. Note
   `20260806000300` expects `20260806000200` (it calls `notify_one`) — the call is
   guarded, so it applies either way, but out of order means no notifications.
2. **Set a price.** Both fees default to 0 and everything stays inert until an
   admin sets them in System Configuration.
3. **Deploy both edge functions** — `paymongo-checkout` and `paymongo-webhook`
   both changed, and a fee paid by card will not settle without the webhook.
4. **Run the behavioural checks** at the foot of each migration. The SQL VERIFY
   blocks prove grants and triggers exist; only the behavioural checks prove a
   fee raises once, settles once, and reconciles.

## 5. Cost model reference

For the spending side of the same picture, see
[SYSTEM_COST_MODEL.md](SYSTEM_COST_MODEL.md) — it turns the ₱300,000 / 18-month
funding ask into a monthly burn view and separates fixed, variable and one-off
costs.
