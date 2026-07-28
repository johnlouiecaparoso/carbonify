# 👉 Your Action Items — owner runbook

> **Rewritten 2026-07-29.** The previous contents were the 2026-07-01 → 07-03 cutover checklist, which
> that page's own banner recorded as **superseded and complete**. The cutover detail it referenced is
> preserved in [YOUR_CUTOVER_STEPS.md](YOUR_CUTOVER_STEPS.md). This page is now the **current** list of
> things only you can do, in the order to do them.
>
> **This page holds instructions, not status.** Where a step has a source of truth it links there:
> [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) owns the pilot procedure,
> [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) owns the real-money gate,
> [OPEN_WORK_REGISTER.md](OPEN_WORK_REGISTER.md) owns who-can-do-what.

## How to run any SQL on this page

Every SQL check is a **file in the repo**. You never need to copy code out of a document.

1. Open the file in your editor, select all, copy.
2. Supabase Dashboard → **SQL Editor** → paste → **Run**.
3. **Read the LAST table it prints.** Every one of these files ends with a single SUMMARY statement on
   purpose — the Supabase editor shows only the final statement's result when several are pasted
   together, and reading the wrong table is exactly how a full pre-flight got misread on 2026-07-29.

| File | When to run it |
|---|---|
| [`supabase/diagnostics/pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql) | Before inviting anyone |
| [`supabase/diagnostics/escrow_verification.sql`](../supabase/diagnostics/escrow_verification.sql) | After applying escrow, and after each escrow test |
| [`supabase/diagnostics/feedstock_verification.sql`](../supabase/diagnostics/feedstock_verification.sql) | After the farmer click-through |
| [`supabase/diagnostics/daily_beta_health.sql`](../supabase/diagnostics/daily_beta_health.sql) | Every morning during the pilot |
| [`supabase/diagnostics/money_table_rls_audit.sql`](../supabase/diagnostics/money_table_rls_audit.sql) | Pre-flight, and after any RLS change |

---

# 🔴 Step 0 — Do this before anything else

**Deploy and schedule the `process-payouts` edge function.**

Escrow went live on 2026-07-29. `process_marketplace_purchase` now holds a **card** seller's net in
`escrow_held` instead of paying them directly. The **only** thing that ever releases a hold is
`release_matured_escrow()`, and the only thing that calls it is
[`process-payouts`](../supabase/functions/process-payouts/index.ts).

**If that function is not deployed and on a schedule, every card seller's money is held permanently —
not delayed.** Applying the escrow migration without scheduling the worker is worse than not applying
it at all.

### What `process-payouts` actually is

An **edge function** — a small server-side script that runs on Supabase, not in anyone's browser. It is
a **worker**: nobody clicks it, it wakes up on a timer and does two jobs each run.

1. **Releases matured escrow.** Calls `release_matured_escrow()`, which moves every hold whose window
   has elapsed — and that has no open dispute — from `escrow_held` to the seller's withdrawable
   balance. **This is the job that matters today.**
2. **Pays out withdrawal requests.** Picks up to 25 `requested` payouts and disburses them.

> ⚠️ **Job 2 is currently a MOCK.** Read
> [`process-payouts/index.ts:28`](../supabase/functions/process-payouts/index.ts#L28): it marks a payout
> settled unless the destination account number is the literal string `FAIL`. **No real money leaves
> anywhere.** That is correct for a test-key beta, but do not read a "settled" payout as money having
> moved. A real payouts partner replaces `disburse()` later.

### ⚠️ It is NOT just a "Schedule" button — my earlier instruction was wrong

The function **rejects every call that does not carry a shared secret**:

- not a `POST` → **405**
- header `x-worker-secret` missing or wrong → **401**
- **`PAYOUT_WORKER_SECRET` not set on the function → every call is 401**, because the code treats an
  unset secret as "reject everything"

So a schedule that merely "calls the function" **401s every 15 minutes forever and releases nothing** —
silently, with no error anywhere a human would look. The secret has to be set *and* sent.

### Do this

**1. Set the secret** (Dashboard → Edge Functions → Secrets, or CLI):
```
supabase secrets set PAYOUT_WORKER_SECRET='<a long random string>'
```

**2. Deploy the function:**
```
supabase functions deploy process-payouts --no-verify-jwt
```
`--no-verify-jwt` is correct here — this is a machine caller with its own shared-secret auth, not a
signed-in user. See [dev/DEPLOYMENT.md](dev/DEPLOYMENT.md).

**3. Test it by hand before scheduling anything:**
```
curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: <your secret>" \
  https://<PROJECT_REF>.supabase.co/functions/v1/process-payouts
```
- `200` + `{"escrowReleased":0,...}` → working
- `401` → the secret is unset or wrong. **Fix this before scheduling**, or you will schedule a job that
  fails forever.

**4. Schedule it.** Run [`supabase/cutover/schedule_payout_worker.sql`](../supabase/cutover/schedule_payout_worker.sql)
— it sets up `pg_cron` + `pg_net` to POST with the header every 15 minutes. **Replace the two
placeholders** (`<PROJECT_REF>`, `<PAYOUT_WORKER_SECRET>`) before running. It also contains the queries
that prove the job is *succeeding*, not merely *running* — a job that 401s still reports "succeeded" in
`cron.job_run_details`, so check `net._http_response` for a `200`.

*(If your project has the Dashboard's Cron section, you can use that instead — but you must still add
the `x-worker-secret` header there, for the same reason.)*

**5. Prove it.** Run [`escrow_verification.sql`](../supabase/diagnostics/escrow_verification.sql).
Row 3 must not say `UNPROVEN`.

> **Row 3 cannot reach PASS until a real hold has existed.** With an empty `escrow_holds` table there
> has never been anything to release, so "nothing is overdue" proves nothing. That is why the card test
> purchase in Step 1b is not optional.

---

# Step 1 — Verify what you already applied

You applied three migrations on 2026-07-29 and `reconcile_financials()` returned 0 after each. Good —
but **applied is not verified**. Three things still need confirming.

### 1a. Re-run the pre-flight and read the summary

Run [`pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql). It now ends with a **§7
SUMMARY** table carrying all 12 verdicts.

**Every row must say PASS**, except row 11 (`5c. Release worker scheduled`) which reads
`CHECK BY HAND` — that is Step 0.

> On 2026-07-29 this file was pasted whole and the editor showed only the §6 project list. Sections 1–5
> never printed. The summary now sits last specifically so that cannot happen again.

### 1b. Verify escrow actually behaves (4 test purchases)

Escrow is applied but **not behaviourally verified**, and the Terms (§1.5) already promise the hold
window to sellers. Do these on test keys — full detail in [ESCROW_DECISION.md §6](ESCROW_DECISION.md):

- [ ] **Card purchase** → the seller's Earnings page shows **Held**, not Available
- [ ] **GCash / Maya / wallet purchase** → releases **immediately**, no hold
- [ ] **Matured release** → temporarily lower `escrow_hold_days_card`, wait for the cron, confirm
      Held → Available
- [ ] **Refund while held** → reverses the hold; it must not claw back settled funds

After each, run [`escrow_verification.sql`](../supabase/diagnostics/escrow_verification.sql). Rows 4, 5
and 6 turn from `INFO` to `PASS`, and row 7 (Books) must stay `PASS`.

### 1c. Verify the farmer payment record

Two accounts, about five minutes:

1. **Buyer**: confirm a farmer delivery, then mark it paid
2. **Farmer**: the delivery must read **"The buyer says they paid you"** in amber — **not** a green
   "paid". If it shows green, stop and tell me.
3. **Farmer**: press **"No, I was not paid"**, give a reason → the buyer and all admins get notified
4. **Admin**: open `/admin/feedstock` → the dispute sits at the top, the farmer's words visible inline
5. **Admin**: record **"Payment was NOT made"** with a note → the delivery flips back to unpaid and
   `paid_at` clears
6. Run [`feedstock_verification.sql`](../supabase/diagnostics/feedstock_verification.sql) → all rows
   PASS or INFO, and **row 6 (Money core untouched) must be PASS**

> Row 6 matters most. Feedstock is deliberately outside the ledger. If a feedstock action ever moves
> the books, that is a bug, not a feature.

---

# Step 2 — Dashboard checks (no SQL can do these)

- [ ] **8 edge functions deployed**: `account-deletion` · `paymongo-checkout` · `paymongo-reconcile` ·
      `paymongo-resettle` · `paymongo-webhook` · `process-payouts` · `public-registry` ·
      `send-approval-email`
- [ ] **PayMongo in TEST mode** — the deployed secrets hold `sk_test_…`
- [ ] **PayMongo webhook shows ENABLED**, pointing at your Supabase functions URL, event
      `checkout_session.payment.paid`. *(It auto-disables after repeated failures — confirm, don't
      assume.)*
- [ ] **`ALLOW_UNSIGNED_WEBHOOKS` is unset** — not `false`, **unset** — and `PAYMONGO_WEBHOOK_SECRET`
      is set
- [ ] **Sentry receiving** — trigger one handled error and confirm it lands
- [ ] **Frontend deployed** from the current `feature-user-onboarding-ux` build

---

# Step 3 — Decide the beta database

Recommendation from [TESTING_PLAN.md](TESTING_PLAN.md) §3: **reuse the live project.** Reconciliation
is clean, so there is no reason to stand up a second environment.

**But purge or clearly label the leftover test data first.** The pre-flight's §6 listed 7 projects,
several obviously seed rows. A pilot user must not be able to buy a fake credit and only afterwards
find out it was test data.

---

# Step 4 — Run the closed beta

Full procedure: [SOFT_LAUNCH_RUNBOOK.md §3](SOFT_LAUNCH_RUNBOOK.md). Scripts to hand out:
[UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md).

- Invite **8–15 people covering all seven roles**, including at least one real farmer and one LGU
- Invite only people you trust — **email confirmation is still off**, so signups are unverified

### Brief every pilot user on these four things

1. **Payments are in test mode.** Test card `4343 4343 4343 4345`, any future expiry, any CVC. No real
   money moves.
2. **Credits are not registry-backed.** A retirement produces a Carbonify certificate, **not** a
   Verra / Gold Standard registry receipt. Not usable for compliance or statutory ESG reporting.
3. **VAT invoices are provisional** — not BIR-accredited, and they carry **no buyer TIN**, so a company
   cannot claim input VAT on them.
4. **Email confirmation is off.** Use an address you control.

### Two role briefings that will otherwise be reported as bugs

- **Project developers: validating a project no longer mints or lists anything.** Credits appear only
  when a verifier approves an MRV report. A project validated *before* 2026-07-26 behaves differently
  from one validated after. This is the mint-on-VER cutover (#17), and it is correct.
- **Farmers: Carbonify does not hold or transfer your money.** The buyer pays you directly. The app
  records it, lets you confirm or contest it, and escalates a dispute to staff — but it cannot recover
  money it never held.

---

# Step 5 — Daily, during the pilot

Run [`daily_beta_health.sql`](../supabase/diagnostics/daily_beta_health.sql). One paste, one table.

| Status | Means |
|---|---|
| **STOP** | Pause the pilot. Do not invite more users. |
| **ACTION** | A real person is waiting on you today. |
| **INVESTIGATE** | Not urgent this hour; don't let it run a second day. |
| **INFO** | Context only. |

Two rows are red-stop conditions: **BOOKS** (reconcile ≠ 0) and **STRANDED SELLER MONEY** (the payout
cron stopped). Abort criteria and rollback: [SOFT_LAUNCH_RUNBOOK.md §5](SOFT_LAUNCH_RUNBOOK.md).

---

# Step 6 — Start these in parallel (lead times you cannot compress)

Do not wait for the beta to finish. Full list: [OPEN_WORK_REGISTER.md](OPEN_WORK_REGISTER.md) Lane 3.

### 🔴 6a. Book the independent penetration test — the last P0

**This is the only gate no amount of code closes**, and booking + scheduling + remediation runs into
weeks. Get quotes now, even if the beta hasn't started.

- **Ask for:** a web-app and API penetration test covering authentication, authorization / RBAC, the
  payment flow, and Supabase Row-Level Security.
- **Give them:** [dev/SECURITY.md](dev/SECURITY.md), [dev/ARCHITECTURE.md](dev/ARCHITECTURE.md), one
  test account per role, and the staging URL.
- **Blocks:** switching to live PayMongo keys.

### 🔴 6b. Buy and verify the email domain — the cheapest unblock on the project

Right now **anyone can register with an address they do not control**, and 8 of the 9 transactional
emails are `console.log` stubs — only the approval email really sends.

1. Buy a domain (~₱600–900/yr)
2. Add it in **Resend** → add the DNS records it gives you (SPF, DKIM, return-path CNAME)
3. Wait for verification, then set the sender in your Supabase edge-function secrets
4. **Turn email confirmation ON** in Supabase Auth
5. Tell me it's done — I'll wire the remaining 8 emails through the Resend function

### 6c. The commercial / legal track

| Who | Ask for | Unblocks |
|---|---|---|
| **SEC Philippines** | Legal entity registration | Everything commercial |
| **BIR** | Registration + accredited receipts | Invoices stop being watermarked PROVISIONAL |
| **A tax advisor** | **Seller-of-record determination** — in a marketplace sale, is Carbonify the seller issuing on the developer's behalf, or an agent between two parties who each issue their own? | Whose TIN goes on a seller invoice (#22). **A tax question, not an implementation choice** — nobody on the build side should guess it. |
| **PayMongo + a licensed PSP/EMI** | Live keys + a custody arrangement | Real money. Gated on 6a. |
| **National Privacy Commission** | DPO appointment + registration | Export/deletion already ship; only registration is outstanding |
| **AMLC + a screening vendor** | AML program + a sanctions data feed | Screening runs against a local watchlist today — real, but not a commercial feed |

### 6d. The carbon-market track

**Registry backing** (Verra / Gold Standard / CAR / ACR, via Carbonmark / Cloverly / Patch) ·
**accredited VVB** status · **DENR / CCC** accreditation and Carbon Pricing Framework alignment.

> The gap between Carbonify and an accredited registry is **institutional — accreditation,
> methodologies, governance — not technical.** It belongs on a partnership and regulatory track, not on
> a list of product shortcomings.

---

# Step 7 — Decisions I'm waiting on

None of these block the beta. Each one unblocks work that is otherwise held.

| Decision | Why it's yours |
|---|---|
| **Is a farmer a buyer?** | They can reach checkout by URL today but aren't offered it in the sidebar (#31). Either give them the buying nav or block the routes — the contradiction is the problem. |
| **Merge PR #14?** | 131 commits. Everything ships from a feature branch right now. |
| **Provider layer: route through it, or delete it?** | ~40 tests currently overstate money-path coverage (#21). |
| **Organization accounts: go/no-go?** | Phase 1 is safe to build now. Phase 2 must wait until after the beta — it rewrites the same RPC as escrow. |
| **Public API: expose it, and to whom?** | Key-gating and rate limits — the edge function has neither. |
| **Fee amounts** | Config and disclosure are built; collection needs prod keys and a number. |
| **Verifier decision history: convenience view or attestation record?** | One is an afternoon, the other is a schema change (#24). |
| **DR / backup policy** | Nothing technical — a written policy you need to have. |

---

# Quick reference — what to run when

| Situation | Run |
|---|---|
| Before inviting anyone | `pilot_preflight.sql` |
| After any escrow test | `escrow_verification.sql` |
| After the farmer click-through | `feedstock_verification.sql` |
| Every morning during the pilot | `daily_beta_health.sql` |
| After anything money-related, always | `select * from reconcile_financials();` → **0 rows** |
| Something looks wrong and you're not sure | `daily_beta_health.sql` first — it names the escalation |
