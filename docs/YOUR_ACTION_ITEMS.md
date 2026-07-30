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
| [`supabase/diagnostics/rls_negative_suite.sql`](../supabase/diagnostics/rls_negative_suite.sql) | 🆕 Pre-flight, and before the pentest — **tries the attacks** rather than reading the policies |

---

# ✅ Step 0 — DONE 2026-07-30. The payout worker is live.

> **`process-payouts` is deployed, secret-gated and on a 15-minute cron.** Verified three ways, not
> one: correct secret → **200**, wrong secret → **401**, `GET` → **405**. A check that cannot go red
> proves nothing, so the negative cases were run deliberately.
>
> | Item | State |
> |---|---|
> | `PAYOUT_WORKER_SECRET` set on the function | ✅ confirmed in `secrets list` |
> | `process-payouts` deployed | ✅ |
> | Hand-tested before scheduling | ✅ 200 / 401 / 405 |
> | `pg_cron` job `carbonify-process-payouts` | ✅ jobid 1, `*/15 * * * *`, active |
> | Response body shows `200` in `net._http_response` | ✅ **PROVEN** — row 1, `200`, fired `07:30:00` |
>
> ✅ **`reconcile_financials()` = 0 rows** after the mock settlement below. The books survived it.
>
> **The first real run settled an 18-day-old payout.** `d63ce676…` — ₱3,123 to a GCash destination —
> was created **2026-07-12** and sat in `requested` until the worker's first run on **2026-07-30**.
> It belongs to the owner's own test account, so nobody was harmed, but it is the documented failure
> mode having already happened to a real row: no error, no alert, the seller simply never gets paid.
> Treat it as the evidence for why this step was Step 0.
>
> ⚠️ It settled through the **MOCK** provider — the row reads `settled` and **no money moved**.
> Run `select * from reconcile_financials();` (expect 0 rows) and include this row in the Step 3
> test-data purge.
>
> **Still unproven:** `escrow_verification.sql` row 3 reads `UNPROVEN` until a real hold has existed.
> That is Step 1b's card purchase, and it is why that test is not optional.

<details>
<summary>Reference — what the worker is and why it needed a shared secret (kept for troubleshooting)</summary>

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

</details>

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

> ## 🔴 2026-07-29 — TWO AUTH SETTINGS BLOCK THE BETA, and this page had both backwards
>
> Measured directly off the live project's public `GET /auth/v1/settings` (read-only, creates
> nothing). Re-check any time with `npx playwright test src/test/e2e/pilot-readiness.spec.js`.
>
> | Setting | Live value | What this page said | Consequence |
> |---|---|---|---|
> | `disable_signup` | **`true`** | assumed signups work | 🔴 **Nobody can register.** Every Step 4 invite is rejected with *"Signups not allowed for this instance"* |
> | `mailer_autoconfirm` | **`false`** → confirmation **REQUIRED** | "email confirmation is still off" | 🔴 New users must click an emailed link — **with no verified sender domain** (Step 6b) |
>
> **These two interact badly.** Turning signups on while confirmation is required, and before the
> Resend domain is verified, means every invited user hits a confirmation email sent by Supabase's
> shared default SMTP — heavily rate-limited (a handful per hour) and likely to be spam-filed. Inviting
> 8–15 people into that produces a wave of "I never got the email" with no way to tell a rate-limit
> from a typo.
>
> **Do these in order:**
>
> 1. **Either** finish Step 6b (buy + verify the domain, set the sender) — the clean route — **or**
>    accept the default SMTP and invite in batches of 2–3, deliberately.
> 2. **Then** Dashboard → Authentication → Sign In / Providers → **allow new users to sign up**.
> 3. Re-run `pilot-readiness.spec.js` — *"the backend accepts new signups"* must go green.
>
> **One correction in your favour:** the go/no-go gate lists *"email confirmation re-enabled"* as an
> open P0. It is already **on**. Only the verified sender domain half is outstanding.
>
> ### ✅ Two providers were advertised in the UI and disabled on the backend — fixed 2026-07-30
>
> `external.google` and `external.phone` are both **`false`** on live, but the sign-in and sign-up
> forms rendered a **"Sign in / Sign up with Google"** button unconditionally and the login form
> offered a phone/OTP mode. A pilot user who picked either got an error on the very first screen.
>
> **You no longer have to decide this before the beta.** The forms now ask the backend which
> providers are enabled (`/auth/v1/settings`, the same endpoint `pilot-readiness.spec.js` reads) and
> render only those. So:
>
> - **Do nothing** → the buttons stay hidden, and email + password (which works) is the only path
>   offered. Nothing is advertised that the backend rejects.
> - **Enable Google** in Dashboard → Authentication → Providers → the button appears on the next page
>   load, **no redeploy needed**.
>
> It fails closed: if the settings probe fails, the buttons stay hidden. Email + password always
> works, so a hidden provider never blocks a sign-in, whereas a dead one always breaks one.
>
> ⚠️ This ships with the **frontend deploy** below — until you redeploy, live still shows the
> dead buttons.

- [x] ✅ **The three functions changed on 2026-07-30 are DEPLOYED** — `paymongo-webhook`,
      `paymongo-checkout`, `account-deletion`. **The `verify` fix was confirmed live against the
      running function**, using the public anon key exactly as an attacker would:
      `POST {"action":"verify","sessionId":"cs_someoneElsesSessionId123"}` → **`401 Authentication
      required`**. Before the fix that same request returned the payer's billing name, email, phone
      and amount. This is the whole point of testing the deployed thing rather than the source.
      `paymongo-webhook` fixes **one payment activating two subscription periods**;
      `paymongo-checkout` closes an **unauthenticated read of any payer's billing details**.

      *No deploy-order constraint:* `supabase.functions.invoke` already forwards the signed-in
      user's token, so the currently-deployed frontend works against the new function unchanged.
      The one behaviour change to know about: a buyer whose **session expired during checkout** now
      gets "Authentication required" on the callback page instead of a silent verify. Their payment
      is unaffected — the webhook settles it server-side regardless — so they see the credits after
      signing back in. Worth a line in the pilot brief.
- [ ] **8 edge functions deployed**: `account-deletion` · `paymongo-checkout` · `paymongo-reconcile` ·
      `paymongo-resettle` · `paymongo-webhook` · `process-payouts` · `public-registry` ·
      `send-approval-email`
- [ ] ⏸️ **BLOCKED 2026-07-30 — owner has not bought the domain yet.** Signups + sender domain are
      deferred together, deliberately. Do **not** enable signups before deciding which route below;
      turning them on with confirmation required and no verified sender is the worst of the three
      states. Everything else in this runbook (Steps 0, 1, 4, 5) can proceed meanwhile — none of it
      needs a second user.
- [ ] 🔴 **Signups enabled** (`disable_signup` = `false`) — see the box above
- [ ] 🔴 **Sender domain verified** before signups are enabled, or invite in small batches knowingly
> ### 🐛 2026-07-30 — `account-deletion` had never been able to run. Found by reading `secrets list`.
>
> The function reads **`ACCOUNT_DELETION_SECRET`**. The project had a secret named **`account-deletion`**
> — a name nothing in the codebase reads. Because the worker treats an unset secret as "reject
> everything" (the same fail-closed rule as the payout worker), **every call returned 401** and every
> DPA erasure request queued in `data_subject_requests` forever.
>
> ✅ **Fixed 2026-07-30** — `ACCOUNT_DELETION_SECRET` set, stray `account-deletion` secret removed.
>
> ⚠️ **The first attempt at this fix silently failed, and the failure looked like success.** The
> value was updated on the *existing* `account-deletion` secret rather than created under the correct
> name, so `secrets list` showed a fresh `updated_at` on a name nothing reads — configured at a
> glance, still 401 in reality. **When fixing a misnamed secret, confirm the NEW name appears in the
> list; a recent timestamp on the old one proves nothing.**
>
> ### 🔑 Invoking `account-deletion` needs TWO headers, not one
>
> Unlike `process-payouts` (deployed `--no-verify-jwt`), this function has platform JWT verification
> **on**, so there are two gates in front of it. Verified 2026-07-30:
>
> | Request | Result |
> |---|---|
> | No `Authorization` header | `401` `UNAUTHORIZED_NO_AUTH_HEADER` — **platform**, before the code runs |
> | Valid JWT + wrong `x-worker-secret` | `401` `{"error":"Unauthorized"}` — the function's own gate |
> | Valid JWT + correct `x-worker-secret` | ✅ `200 {"processed":0,"results":[]}` — proven 2026-07-30 |
>
> All three were exercised, including the **positive** case. That was safe to run only because the
> pending queue was empty (`data_subject_requests` returned no rows) — with a queued request it would
> have erased a real account. Check the queue before running it, every time.
>
> ```
> curl -i -X POST \
>   -H "Content-Type: application/json" \
>   -H "Authorization: Bearer <ANON_KEY>" \
>   -H "x-worker-secret: <ACCOUNT_DELETION_SECRET>" \
>   https://fmngptolarydbgrtltnd.supabase.co/functions/v1/account-deletion
> ```
>
> ⚠️ **This function permanently deletes auth users.** It drains every `pending` deletion row in
> `data_subject_requests`. Check what is queued **before** calling it:
> ```sql
> select id, user_id, status, created_at from data_subject_requests
> where request_type = 'deletion' and status = 'pending';
> ```
>
> **Why this matters beyond the bug:** the doc set lists export/deletion as *shipping*, with only NPC
> registration outstanding. It was shipping in the repo and inert in production — the third instance
> today of "built ≠ live", after the unscheduled payout worker and the undeployed function fixes. A
> secret that exists under the wrong name reads as configured at a glance, which is exactly why this
> survived.

- [ ] ✅ **`ALLOW_UNSIGNED_WEBHOOKS` is unset** — confirmed by inspection 2026-07-30. Absent from
      `secrets list` entirely, which is the required state (unset, not `false`)
- [ ] ✅ **`PAYMONGO_WEBHOOK_SECRET` is set** — confirmed 2026-07-30
- [ ] ✅ **`RECONCILE_WORKER_SECRET` is set** — confirmed 2026-07-30, so `paymongo-reconcile` and
      `paymongo-resettle` are gated rather than open
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
- ⚠️ **Signups are disabled and email confirmation is ON** — resolve Step 2's red box first, or not one
  of these invites can create an account

### Brief every pilot user on these four things

1. **Payments are in test mode.** Test card `4343 4343 4343 4345`, any future expiry, any CVC. No real
   money moves.
2. **Credits are not registry-backed.** A retirement produces a Carbonify certificate, **not** a
   Verra / Gold Standard registry receipt. Not usable for compliance or statutory ESG reporting.
3. **VAT invoices are provisional** — not BIR-accredited, and they carry **no buyer TIN**, so a company
   cannot claim input VAT on them.
4. **Email confirmation is ON** (corrected 2026-07-29 — this page previously said "off"). They must
   click a link before signing in, and until the sender domain is verified that mail comes from
   Supabase's shared default SMTP, so **tell them to check spam**.

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
4. ~~**Turn email confirmation ON** in Supabase Auth~~ — ✅ **already on** (`mailer_autoconfirm=false`,
   measured 2026-07-29). This step is what makes it *usable*: right now confirmation is enforced
   against Supabase's shared default SMTP.
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
| **Merge PR #14?** | 138 commits. Everything ships from a feature branch right now. |
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
