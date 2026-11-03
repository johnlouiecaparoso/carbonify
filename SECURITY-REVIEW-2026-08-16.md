# Carbonify — Security Review & Production Readiness

*16 August 2026. Adversarial review of the money path, plus a go/no-go assessment for live deployment. Written from a direct read of the edge functions, migrations and RPCs on this machine — not from the documentation.*

---

## Verdict

**Not ready for live money. Two blockers, both fixable in about a week.**

The code quality on the payment path is genuinely good — better than most production fintech I've reviewed at this scale. Server-side amount computation, HMAC verification with constant-time comparison, row-level locks on settlement, double-entry ledger, atomic idempotency claims. You've clearly thought hard about this.

But there is **one exploitable vulnerability that lets a seller withdraw more money than they have**, and **one function that marks payouts as settled without moving any money**. Either alone is a go-live blocker.

| | |
|---|---|
| **Critical** | 2 |
| **High** | 3 |
| **Medium** | 4 |
| **Verdict** | **No-go** until C-1 and C-2 are fixed |
| **Estimated time to go-live readiness** | 5–8 days of focused work |

---

# Part 1 — Attacker's view

I approached this as someone trying to extract money from the system. Here's what I tried, what failed, and what worked.

## What I could NOT break (this is the good news)

**Price tampering — blocked.** I tried the classic: send a modified amount in the checkout body. `paymongo-checkout` recomputes the total server-side from `credit_listings.price_per_credit` and never reads a client amount. The rounding is even done correctly — `unitCentavos × quantity`, not `round(unit × qty)`, so reconciliation doesn't false-positive on sub-centavo prices. That's a detail most teams get wrong.

**Identity spoofing — blocked.** The docstring still says the client sends `user_id`, but the code doesn't trust it: identity comes from `getUser(token)` on the verified JWT, and `if (!verifiedUserId) throw` rejects anonymous callers. *(Fix the stale comment on line 160/165 — it describes a vulnerability you already closed, and a reader will believe the comment.)*

**Invoice IDOR — blocked, and done properly.** `createProjectFeeCheckout` returns the *same* error for "no such invoice" and "not your invoice," so I can't enumerate invoice IDs. That's a deliberate choice most developers miss.

**Webhook forgery — blocked.** HMAC-SHA256 over `${timestamp}.${payload}`, `timingSafeEqual` rather than `===`, 300-second replay window. Correct.

**Oversell race — blocked.** I expected to find this. Two buyers racing for the last credits, both passing the availability check. But `process_marketplace_purchase` takes `FOR UPDATE` locks on the intent, the listing, and the `project_credits` row before checking quantity. Properly serialised.

**Double-settlement — blocked.** Event-level idempotency on `(provider, event_id)`, plus a second per-handler claim because `update_wallet_balance_atomic('add')` isn't itself idempotent. You noticed that distinction, which is rare.

**Anon-callable `SECURITY DEFINER` functions — clean.** You revoke from `public, anon, authenticated` explicitly rather than just `public` — the exact bug you found before. The only anon grants are genuinely public reads (`verify_certificate_public`, `search_public_registry`, market stats). Correct.

**Payout preconditions — solid.** `request_payout` checks auth, suspension, KYB, positive amount, minimum threshold, destination, and balance, and writes a balanced double-entry reservation.

That is a lot of failed attacks. Take the win — this is not a system that falls over to casual probing.

---

## C-1 — CRITICAL: Double withdrawal via concurrent payout requests

**File:** `supabase/migrations/20260804000400_payout_suspension_and_idempotency_scope.sql`
**Function:** `public.request_payout(numeric, jsonb, text)`
**Impact:** A seller can withdraw their balance multiple times. Direct financial loss.

### The bug

The function reads the balance, checks it, then writes — with nothing holding a lock in between:

```sql
select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
  into v_available
from public.ledger_entries
where account = 'seller_payable:' || v_seller::text;   -- ← no FOR UPDATE, no lock

if v_available < p_amount then
  raise exception 'insufficient balance: ...';
end if;

insert into public.payout_requests ...                  -- ← both callers reach here
```

Postgres defaults to READ COMMITTED. Two concurrent transactions both run the `SELECT SUM`, both see ₱10,000, both pass the check, both insert. Classic time-of-check-to-time-of-use.

### Why the existing defences don't stop it

- **The idempotency key doesn't help.** It only catches *the same key retried*. I send two requests with different keys — or no key at all, since it's nullable.
- **`FOR UPDATE` elsewhere doesn't help.** The settlement path is locked; this path isn't. I confirmed: **zero lock statements across all three versions of `request_payout`, and no advisory locks anywhere in the codebase.**
- **No constraint catches it.** There's no CHECK preventing `seller_payable` going negative.
- **Reconciliation won't flag it.** `reconcile_financials` checks that each `entry_id` group balances. A double payout produces *two internally balanced groups* — it passes. You'd only find it later as a negative balance, after the money was gone.

### How I'd exploit it

As a seller with a ₱10,000 balance, fire N simultaneous `request_payout(10000, …)` calls with distinct idempotency keys. Several succeed. The payout worker then disburses each one. With `BATCH_SIZE = 25` and a 15-minute cron, a single race window can drain well beyond the real balance.

### The fix

Take a per-seller lock at the top of the function, before the balance read:

```sql
-- Serialise all payout requests for this seller. Two concurrent calls can no
-- longer both pass the balance check on the same funds.
perform pg_advisory_xact_lock(hashtext('payout:' || v_seller::text));
```

Place it immediately after the `v_seller is null` check. It's transaction-scoped, so it releases automatically.

**Add defence in depth as well:**

1. A CHECK or trigger asserting `seller_payable` never goes negative — turns a silent loss into a loud failure.
2. Add `negative_seller_payable` as an explicit finding type in `reconcile_financials`.
3. A regression test: fire 10 concurrent `request_payout` calls against a balance that covers one. Assert exactly one succeeds. **This test is the deliverable — the fix without the test will regress.**

---

## C-2 — CRITICAL: `disburse()` marks payouts settled without moving money

**File:** `supabase/functions/process-payouts/index.ts`
**Impact:** Every payout is recorded as paid while no money moves. Your ledger says sellers were paid; their bank accounts disagree.

```ts
/** Mock disbursement: settle unless the destination uses the FAIL sentinel. */
function disburse(payout: PayoutRow): { ok: boolean; providerPayoutId: string; reason?: string } {
  const providerPayoutId = `mock_payout_${payout.id}`
  if (payout.destination?.accountNumber === 'FAIL') {
    return { ok: false, providerPayoutId, reason: 'simulated disbursement failure' }
  }
  return { ok: true, providerPayoutId }
}
```

You already know about this — it's documented in the file header, in `ABOUT-ME.md`, and in `DEFERRED_BACKLOG.md`. I'm flagging it as critical anyway because **the failure mode is silent.** It doesn't error. It writes `settled` and a plausible-looking `mock_payout_<uuid>` provider ID. Nothing downstream distinguishes it from a real disbursement.

### The fix

Wire a real payouts provider — or, until then, make it impossible to run this in production:

```ts
const ALLOW_MOCK_DISBURSEMENT = Deno.env.get('ALLOW_MOCK_DISBURSEMENT') === 'true'

if (!ALLOW_MOCK_DISBURSEMENT) {
  return new Response(
    JSON.stringify({ error: 'Mock disbursement is disabled. Configure a payouts provider.' }),
    { status: 503 },
  )
}
```

Fail closed. A misconfigured production deploy should refuse to run, not quietly mark everything paid. Also prefix mock provider IDs unmistakably (`MOCK_DO_NOT_TRUST_…`) so they're greppable if any ever reach a real database.

---

## H-1 — HIGH: `ALLOW_UNSIGNED_WEBHOOKS` accepts forged payment events

**File:** `supabase/functions/paymongo-webhook/index.ts:31, 75–79`

```ts
const ALLOW_UNSIGNED_WEBHOOKS = Deno.env.get('ALLOW_UNSIGNED_WEBHOOKS') === 'true'
...
if (!secret) {
  if (ALLOW_UNSIGNED_WEBHOOKS) {
    console.warn('... accepting unsigned (DEV ONLY)')
    return { ok: true }
  }
```

The default is safe and it requires two conditions (flag set *and* secret missing). But if both ever hold in production, **anyone who knows the function URL can POST a `checkout_session.payment.paid` event and receive credits for free.** No authentication at all. The function is deployed `--no-verify-jwt`, so the platform won't stop them either.

This is a dev-convenience escape hatch on the single most security-critical endpoint in the system.

**Fix:** gate it on a non-production environment, so it cannot be enabled in prod even by accident:

```ts
const IS_PRODUCTION = Deno.env.get('ENVIRONMENT') === 'production'
const ALLOW_UNSIGNED_WEBHOOKS =
  !IS_PRODUCTION && Deno.env.get('ALLOW_UNSIGNED_WEBHOOKS') === 'true'
```

Better still: delete it. Use the PayMongo CLI or a test secret locally. An escape hatch that bypasses payment authentication doesn't earn its keep.

---

## H-2 — HIGH: Unchecked RPC results leave payouts in limbo

**File:** `supabase/functions/process-payouts/index.ts`

```ts
const outcome = disburse(payout)
if (outcome.ok) {
  await supabase.rpc('mark_payout_settled', { ... })   // ← result never checked
  results.push({ id: payout.id, status: 'settled' })   // ← reported settled regardless
}
```

Neither `mark_payout_settled` nor `mark_payout_failed` has its result inspected. If the RPC fails — deploy blip, connection drop, transient error — the payout stays `processing` forever while the function reports `settled`.

**Once money is really moving, this becomes: money left the building, the database doesn't know.**

Compounding it: **there is no reaper for stuck `processing` rows.** `mark_payout_processing` is a correct atomic claim, so a stuck row is never re-claimed by a later run. It just sits there.

**Fix:**

1. Check both RPC results; on failure, log loudly and emit to Sentry with the payout ID.
2. Add a `claimed_at` timestamp and a reaper that surfaces anything `processing` for more than N minutes — **alert, don't auto-retry.** Auto-retrying a disbursement whose true state is unknown is how you double-pay.
3. Record the provider payout ID *before* disbursing, not after, so a crash mid-flight is still traceable.

---

## H-3 — HIGH: Migration drift — production is not reproducible

Your own README says it plainly:

> **Migrations are applied by hand.** There is no CLI migration tracking; the live database drifts from `supabase/migrations/`. Do **not** run `supabase db push`.

For a content site this is untidy. For a system holding money it's a serious operational risk:

- You cannot recreate production in staging, so **you cannot test the fixes in this document against the real schema**
- You cannot reliably tell which of your 142 migrations are actually live
- Disaster recovery has no known-good target
- You've already been bitten: `docs/` records a replayed migration silently reverting a reconciliation function, and a monitor that returned "no rows, healthy" — indistinguishable from healthy

You wrote `schema_catchup_audit.sql` to detect drift, which is a good mitigation. But detection isn't control.

**Fix before go-live:** get to a known-good state via `schema_catchup_audit.sql`, snapshot it as a baseline migration, then adopt CLI-tracked migrations from that point forward. Nothing hand-applied once real money is in the system.

---

## M-1 — MEDIUM: Non-constant-time comparison of worker secrets

`process-payouts`, `paymongo-reconcile` and `paymongo-resettle` all do:

```ts
if (!SECRET || req.headers.get('x-worker-secret') !== SECRET) { ... 401 }
```

`!==` short-circuits on the first differing byte. Remote timing attacks across a network are hard but not theoretical, and you already have `timingSafeEqual` in the webhook — this is an inconsistency more than an oversight.

**Fix:** export `timingSafeEqual` to a shared module and use it in all three. Twenty minutes.

---

## M-2 — MEDIUM: Untrusted input parsed and logged before authentication

**File:** `paymongo-webhook/index.ts:345–351`

```ts
const payload = await req.text()
const webhookData = JSON.parse(payload)      // ← before signature check
console.log('📥 Webhook received:', { type: webhookData.type, ... })   // ← before signature check
const sigCheck = await verifyWebhookSignature(...)   // ← auth happens here
```

Anyone can POST arbitrary JSON and have it parsed and written to your logs without authenticating. That's unauthenticated log injection, log-volume abuse, and a malformed-JSON throw that bypasses your clean 401.

**Fix:** verify the signature first. Parse and log only after. The raw text is all you need for HMAC.

---

## M-3 — MEDIUM: Escrow release failures are invisible

`process-payouts` swallows `release_matured_escrow` errors by design — "must never block payouts." Reasonable. But a persistent failure means matured escrow silently stops releasing, and the only trace is a `console.error`.

**Fix:** keep the non-blocking behaviour, add an alert. Include `escrowReleased` in a monitored metric and alert if it's zero across consecutive runs when matured holds exist.

---

## M-4 — MEDIUM: `npm run format` breaks the build

From your own README: *"known to break the build; do not run casually."*

A formatting command that breaks the build is a trap for anyone who runs it — including future you. It also fails an interview smell test.

**Fix:** either repair the Prettier config, or remove the script so it can't be run by accident.

---

# Part 2 — Production readiness

## Ready

| Area | Status |
|---|---|
| Payment authorisation | Server-side amounts, JWT identity, KYC/KYB gates |
| Webhook security | HMAC, replay window, constant-time compare |
| Settlement concurrency | `FOR UPDATE` locks on intent, listing, credits |
| Idempotency | Event-level plus per-handler claims |
| Accounting | Double-entry ledger with balance checks |
| Grant hygiene | Explicit revokes from `public, anon, authenticated` |
| Access-control testing | 25/25 signed-out exposure checks; RLS negative suite |
| Rate limiting | `rate_limits` and `velocity_caps` migrations present |
| CI | Lint + unit + E2E on Node 20/22 |
| Accessibility | WCAG 2.1 AA, zero violations, authenticated routes included |
| Error tracking | Sentry wired |

## Not ready

| Gap | Severity | Notes |
|---|---|---|
| Payout race condition | **Critical** | C-1 — exploitable today |
| Mock disbursement | **Critical** | C-2 — silent failure mode |
| Unsigned webhook escape hatch | High | H-1 |
| Unchecked payout RPC results | High | H-2 |
| Migration drift | High | H-3 — blocks safe testing of everything else |
| Live PayMongo credentials | High | Still on test keys |
| Independent penetration test | High | Not done |
| Stuck-payout reaper | Medium | No detection for `processing` limbo |
| Money-path alerting | Medium | Sentry catches exceptions, not silent divergence |
| Backup / restore drill | Medium | No evidence of a tested restore |
| BIR registration & invoicing | High (legal) | Provisional watermarked invoices only |
| Verra / Gold Standard backing | — | Accreditation, not engineering. Fine to launch without, but say so publicly. |

## Missing operationally

**Alerting on silent divergence.** Your best insight is already recorded in your own docs: a reverted monitor returns "no rows, healthy," identical to a healthy database. Apply it here — alert on *absence* of expected activity, not only on errors. If zero payouts settle in 24 hours, that should page you.

**A runbook.** One page: what to do when a webhook fails, when reconciliation flags drift, when a payout is stuck, when PayMongo has an outage. Write it before you need it.

**A tested restore.** Backups you haven't restored are not backups.

---

# Part 3 — Fix order

### Week 1 — blockers

| # | Task | Est. |
|---|---|---|
| 1 | **C-1** — advisory lock in `request_payout` + concurrency regression test | 4h |
| 2 | **C-1** — negative-balance constraint + reconciliation check | 2h |
| 3 | **C-2** — fail-closed guard on mock disbursement | 1h |
| 4 | **H-1** — gate `ALLOW_UNSIGNED_WEBHOOKS` on non-production, or delete | 30m |
| 5 | **H-2** — check RPC results, add stuck-payout detection | 3h |
| 6 | **M-2** — verify signature before parsing/logging | 30m |
| 7 | **M-1** — shared `timingSafeEqual` across workers | 30m |

### Week 2 — before real money

8. **H-3** — resolve migration drift, snapshot a baseline, adopt CLI tracking
9. Money-path alerting, including the absence-of-activity alarm
10. Write the runbook
11. Test a backup restore end to end
12. Fix or remove `npm run format`
13. Fix the stale docstring in `paymongo-checkout` (lines 160/165)

### Before go-live

14. Wire a real payouts provider, replacing `disburse()`
15. Switch to live PayMongo credentials
16. **Independent penetration test** — you've reviewed your own work, and so have I; neither substitutes for an outside party on a system holding public money
17. BIR registration and compliant invoicing

---

# Part 4 — Assessment

To answer your question directly: **is it good enough to go live after you test it?**

Testing won't find C-1. Your test suite is strong — 122 files, 1,200+ unit tests, 75 E2E specs — but concurrency bugs don't appear in sequential tests. `request_payout` passes every functional test it has, because the bug only exists when two calls overlap. **That's precisely why it survived until now.** The fix isn't more testing in general; it's one specific concurrency test.

What impresses me is the shape of what I found. The hard parts are right: server-side amounts, HMAC with constant-time compare, `FOR UPDATE` on the settlement path, double-entry accounting, correct grant revocation. The two critical findings are both in the **payout** path — the newest, least-exercised part of the system, and the one where you've had the least real traffic. That's an ordinary pattern, not a sign of sloppiness.

One habit worth naming: you locked the settlement path correctly and then didn't lock the payout path. The concept was clearly understood — it just wasn't applied uniformly. When you fix C-1, do a deliberate sweep for every other read-then-write on a balance or a count, and check each one takes a lock. That class of bug travels in groups.

Your instinct to say *"payments run on test keys pending an independent penetration test"* was right. Keep it. Fix C-1 and C-2 this week, and you're in genuinely good shape — this is a system that will survive contact with real users.
