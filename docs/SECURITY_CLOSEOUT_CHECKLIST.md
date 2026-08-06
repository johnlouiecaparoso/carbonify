# Security Close-out & Hardening — Status + Test Runbook

> ## ✅ 2026-08-05 (evening) — the Supabase advisor sweep. **All seven applied and re-probed.**
>
> This page's §4 gate has read all-ticked-but-the-pentest since 2026-07-04, and §1 lists what was
> "done AND verified". A third-party linter reading the **live database** — not this page, not the
> code — produced the most severe finding of the week in one pass.
>
> | # | Finding, as measured signed out with the publishable key | Fix | State |
> |---|---|---|---|
> | A | `public.projects` carried `USING (true) WITH CHECK (true)` for **ALL** commands and every role, so an **anonymous stranger could rewrite or delete every project in the registry**. RLS policies are PERMISSIVE and OR together, so this had made the careful owner/staff set from `20260624000000` dead on live since the day it was applied | `20260805000400` | ✅ applied |
> | B | Two `SECURITY DEFINER` views returned **2 wallet balances and 16 credit holdings** to a signed-out caller. A view runs as its **owner** unless `security_invoker = on`, so RLS on the base tables was working perfectly and being read around. Personal financial data under the DPA | `20260805000500` | ✅ applied |
> | C | `audit_logs` / `email_logs` / `receipts` accepted inserts from **anyone**. "System can insert" was the intent; `WITH CHECK (true)` was the effect — and `service_role` bypasses RLS anyway, so the policy was never needed for the thing it was named after | `20260805000600` | ✅ applied |
> | D | Five pre-version-control tables had RLS **off**; PostgREST exposes everything in `public` | `20260805000700` | ✅ applied |
> | E | 25 legacy functions had a role-mutable `search_path`, including the four that **issue and transfer credits** | `20260805000800` | ✅ applied |
> | F | The `avatars` bucket was **anon-listable**, and filenames are `${userId}_${timestamp}` — so one request returned a roster of every user id that had uploaded a photo. The images were meant to be public; the membership list was not | `20260805000900` | ✅ applied |
> | G | Three anon-callable `SECURITY DEFINER` functions wrote to `audit_logs` **as owner**, walking around the policy F's sibling had just added. Proven by accident: a probe meant to fail on a cast ran the function and wrote two rows | `20260805001000` | ✅ applied |
>
> **Two lessons this checklist should carry, because both contradict how a close-out is usually read:**
>
> 1. **Severity describes the shape of a finding, not its consequence.** The advisor rated the
>    deletable project registry a **WARN**, while four of its nine **ERRORs** were empty superseded
>    tables. Every finding here was probed against live before it was ranked. *Probe before you
>    prioritise.*
> 2. **A grant audit must be done per SIGNATURE, never per name.** `20260703000400` revoked
>    `retire_credits_atomic(uuid, uuid, numeric)`; `20260718000000` added a four-argument overload and
>    never revoked it; `20260802000100`'s audit matched on the **name** and marked it done. The hole
>    sat open for three weeks behind a ✅.
>
> **Re-runnable evidence, exit 1 on any failure:** `node scripts/analysis/verify-anon-exposure.mjs`
> → **25/25 PASS** (23 until 2026-08-06, when `notify_admins` and `notify_one` were added), including
> two `STILL-WORKS` checks so a "fix" that protects data by emptying the marketplace cannot pass. Per-signature grant surface:
> [`definer_grant_surface.sql`](../supabase/diagnostics/definer_grant_surface.sql).
>
> ⚠️ **Left open deliberately, and belongs on the pentest brief:** signed out, the database still
> answers *"what role does this user id have?"* (`get_user_role(uuid)` → `"general_user"`) — account
> enumeration with role labels. Not fixed because the no-argument forms of those helpers appear
> inside RLS policy expressions, which evaluate as the **querying** role, so a revoke catching the
> wrong overload empties the marketplace for signed-out visitors. Do it from a policy dump, per
> signature. Tracked as [DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) **#45**; `audit_logs` being
> self-asserted rather than an audit trail is **#42**.
>
> ### 🔐 A control this checklist never had: an applied fix could be un-applied by accident
>
> Twice on 2026-08-05, pasting a superseded migration into the SQL editor **silently reverted a
> security or money fix** — `create or replace` overwrites rather than merges, and the editor reports
> *"Success. No rows returned."* Every ✅ on this page describes a migration that was applied, and
> until today **nothing stopped one being undone by a routine copy-paste.** A close-out checklist
> that only records what was applied is measuring the wrong moment.
>
> The 16 money-path migrations now carry an **executable guard** that aborts when a newer definition
> is already live, naming the file to re-apply. Ratcheted by
> [`migrationReplayGuard.test.js`](../src/test/services/migrationReplayGuard.test.js) and **proven on
> live** — the file that caused the morning's revert was pasted again and refused. Deliberate replay
> stays possible via `set carbonify.allow_superseded_replay = 'yes'`.
>
> **For the pentest brief:** the reverted `reconcile_financials()` is the instructive one. It did not
> fail — it returned *"no rows, healthy"*, which is what a healthy database returns. **A monitor that
> fails silent reports success**, and this project's daily money-integrity check was that monitor.

> ## ✅ 2026-08-04 — money-path defect pass. **All five applied 2026-08-05.**
>
> This page's §4 gate has read all-ticked-but-the-pentest since 2026-07-04. A read of the money
> surface **against the code rather than this page** found five defects that the gate's wording did
> not cover, because each is a rule the gate never stated. Full write-up in [HANDOFF.md](HANDOFF.md)
> § *2026-08-04 money-path defect pass*; ordered apply steps in its § *DEPLOY STATE*.
>
> | # | Finding | Fix | State |
> |---|---|---|---|
> | 1 | The escrow method-gate reads `payment_intents.provider`, which is always `'paymongo'` — the GCash/Maya branch has **never executed**, and `credit_transactions.payment_method` recorded `'paymongo'` for every online sale | `20260804000300` + redeploy `paymongo-webhook`, `paymongo-resettle` | ✅ **applied 2026-08-05** |
> | 2 | `assert_can_trade` had **one** call site (the card path). `process_wallet_purchase` is granted to `authenticated`, so KYC **and account suspension** were bypassable by calling the RPC directly | `20260804000100` + redeploy **`paymongo-checkout`** (the wallet **top-up** suspension check lives there) | ✅ **applied 2026-08-05** |
> | 3 | `20260703000300` grants profiles UPDATE from a two-name **allow**-list and says "re-run after adding columns" — doing so re-grants `kyb_verified` (self-approve KYB → withdraw) and `is_active` (self-unsuspend); *not* doing so breaks every profile save | `20260804000200` (deny-list) | ✅ **applied 2026-08-05** |
> | 4 | Payouts ignored suspension; `request_payout`'s idempotency key was global, so a collision returned **another seller's** payout id | `20260804000400` | ✅ **applied 2026-08-05** |
> | 5 | **`certificates` has no RLS in any migration** and the browser INSERTs/UPDATEs it directly — on a fresh env, read *and* write on everyone's certificates | `20260804000500` | ✅ **applied 2026-08-05** after its pre-flight |
>
> **`access_posture_audit.sql` was run first, on 2026-08-05, and returned 5 rows.** It is read-only,
> returns 0 rows when the posture is correct, and covers four things `money_table_rls_audit.sql`
> **structurally cannot see** — most importantly **open SELECT policies**, since that audit's finding
> (A) only inspects `INSERT/UPDATE/DELETE/ALL`. A `using (true)` read policy on `wallet_accounts`
> would pass it silently today.
>
> | Finding | What it said | Read |
> |---|---|---|
> | **C ×2** | `plan`, `plan_expires_at` client-writable | 🟢 **Better than feared.** *Not* `kyb_verified`, `is_active`, `role` or `kyc_level` — so `20260703000300` was applied once and never re-run, and the later revokes held. **The KYB-self-approval hole was never open on live.** Exploitability was further blocked by `trg_protect_plan_columns`, which silently reverts non-service-role plan writes |
> | **D ×3** | `municipality`, `province`, `onboarding_tour_version` not owner-writable | 🔴 **Live and broken.** `updateProfile` PATCHes the whole form at once, so **every profile save was failing `42501`**; `markTourSeen` tolerates only `42703`, so the welcome tour replayed on every device forever, silently. Nobody had reported either |
>
> **Both closed by `20260804000200`, applied 2026-08-05.** Re-run the audit and expect 0 rows.
>
> **Two items are decisions, not fixes** — [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #38 and #39.
> #38 belongs on the pentest brief and in any wording review: the certificate `signature_hash` is an
> **unkeyed SHA-256 over public fields computed in the browser**, so it detects corruption, not
> tampering. Until that is a keyed or asymmetric signature, **do not describe these certificates as
> tamper-evident** to a pilot user or in the Terms.
>
> §4's real-money gate should be read as gaining a line: **all five applied and re-verified, and
> `access_posture_audit.sql` returning 0 rows**, before live keys.
>
> > 🔎 **Verified 2026-08-05 before commit, and finding 1's fix had finding 1 inside it.** Both
> > `resolvePaymentMethod` implementations read the method from the **payment** resource only.
> > PayMongo also carries it on the **checkout session** — which is the resource the webhook is
> > delivered — as `payment_method_used`. Where only the session had it, the resolver returned null,
> > settlement fell back to `provider`, and `provider` is the literal `'paymongo'`: **the dead gate,
> > restored inside the migration written to kill it**, and visible only as `ESC-02` failing for no
> > stated reason. Fixed on both paths and ratcheted. The deploy list was also short by one function
> > — see the row 2 correction above.

> **Updated:** 2026-07-04 · **Branch:** `feature-user-onboarding-ux` (pushed)
> Companion to [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) and [dev/DEPLOYMENT_READINESS.md](dev/DEPLOYMENT_READINESS.md).
> **Use §3 as your test plan for tomorrow.** §1 = already done + verified; §2 = still pending deploy/test; §4 = the go/no-go gate.

---

## 1. ✅ Done AND verified (applied on the live project + tested)

| Item | What | Verified |
|---|---|---|
| Profiles role/KYC lock (`…000300`) | Blocks self-promotion to admin / KYC bump | ✅ applied + tested |
| Retire identity (`…000400`) | Retirement bound to `auth.uid()` | ✅ applied + tested |
| Self-purchase guard (`…000500`) | Seller can't buy own listing | ✅ applied + tested |
| Reconcile widened (`…000600`) | Flags unaccounted transactions | ✅ applied |
| Rate limiting (`…000000` + checkout redeploy) | 20 checkouts / 5 min per user → 429 | ✅ applied + deployed + tested |
| Checkout JWT-only identity | `paymongo-checkout` trusts only verified JWT | ✅ deployed + tested (6 money flows reconcile to 0) |
| Email relay closed | `send-approval-email` JWT **on** + fixed sender | ✅ deployed |
| SMTP + email confirmation | Resend SMTP; confirmations on | ✅ configured + tested |
| External PSP reconciliation (`…000100` + `paymongo-reconcile`) | System-vs-PayMongo drift report | ✅ applied + deployed + tested (**found 6 orphaned paid intents**) |
| Sentry error tracking | Live via baked-in DSN, production-only | ✅ shipped (verify per §3.4) |
| `ALLOW_UNSIGNED_WEBHOOKS` | Confirmed absent (webhooks fail-closed) | ✅ |

---

## 2. ⬜ Pending — deploy & test TOMORROW

Two features are pushed to the branch but **not yet applied/deployed on the live project**:

- **A. `paymongo-resettle`** — heals the 6 orphaned paid intents reconcile found.
- **B. Velocity caps** — per-KYC-tier daily spend limit (migration `…000200` + `paymongo-checkout` redeploy).

Do §3 to activate + test them.

---

## 3. 🧪 Test runbook (do these tomorrow, in order)

> Project ref: `fmngptolarydbgrtltnd`. Worker secret (already set): `RECONCILE_WORKER_SECRET = 9dcaba5fc4bafbf78a5b4bf22c5db2fbdd6ce50eb9f38f2955d33df636f30256`. Run `curl.exe` in **PowerShell**.

### 3.1 — Heal the 6 orphaned payments (feature A)
1. **Deploy** edge function `paymongo-resettle` (Verify JWT **OFF**).
2. Run the heal (auto-finds paid-but-pending intents):
   ```powershell
   curl.exe -i -X POST "https://fmngptolarydbgrtltnd.supabase.co/functions/v1/paymongo-resettle" -H "x-worker-secret: 9dcaba5fc4bafbf78a5b4bf22c5db2fbdd6ce50eb9f38f2955d33df636f30256" -H "Content-Type: application/json" -d '{\"lookback_days\": 30}'
   ```
   **Expect:** `{"success":true,"healed":6,"results":[... "outcome":"settled" ...]}`
3. **Confirm** by re-running reconcile — `discrepancy_count` should now be **0**:
   ```powershell
   curl.exe -i -X POST "https://fmngptolarydbgrtltnd.supabase.co/functions/v1/paymongo-reconcile" -H "x-worker-secret: 9dcaba5fc4bafbf78a5b4bf22c5db2fbdd6ce50eb9f38f2955d33df636f30256" -H "Content-Type: application/json" -d '{\"lookback_days\": 30}'
   ```
4. (Optional) In the app, confirm those 3 subscriptions flipped to Pro and the 3 marketplace buyers now hold their credits.

### 3.2 — Velocity caps (feature B)
1. **Apply** migration `20260704000200_velocity_caps.sql` (SQL Editor).
2. **Redeploy** `paymongo-checkout` (it now calls the cap check before creating a session; Verify JWT stays **OFF**).
3. **Happy path:** a normal purchase still works (defaults: KYC L0 = ₱10,000/day, L1 = ₱100,000/day, L2+ = unlimited).
4. **Prove it blocks** — set a tiny cap, then attempt a purchase over it:
   ```sql
   -- set a tiny cap (SQL Editor)
   insert into public.app_settings (key, value, description)
   values ('velocity_daily_caps', '{"0": 5, "1": 5}'::jsonb, 'Daily purchase caps by KYC level')
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```
   - A wallet purchase or a card checkout over ₱5 should be rejected with *"daily purchase limit exceeded for your verification level…"* (card is blocked **before** redirect to PayMongo — nothing is charged).
5. **Restore** the real caps:
   ```sql
   update public.app_settings set value = '{"0": 10000, "1": 100000}'::jsonb where key = 'velocity_daily_caps';
   ```

### 3.3 — Re-confirm the 6 money flows still reconcile to 0
After 3.1/3.2, run one of each (card, wallet top-up, wallet purchase, cart, retire, subscription) and confirm `select * from public.reconcile_financials();` returns **0 rows**.

### 3.4 — Sentry (optional, 1 min)
On the **deployed** URL, open the browser console and run `myUndefinedFunction()`. Within ~30s it appears in your Sentry dashboard → Issues.

### 3.5 — CSP (optional, decision)
On the deployed URL, open DevTools console and click through map / checkout / all pages. If there are **no** `Content-Security-Policy-Report-Only` violations, tell your developer to flip the header in `vercel.json` from `Content-Security-Policy-Report-Only` → `Content-Security-Policy` to enforce it.

---

## 4. Go / no-go gate (real money)

- [x] `profiles` role/KYC lock applied + verified
- [x] Retire identity applied + retested
- [x] `send-approval-email` requires auth
- [x] `paymongo-checkout` requires a verified JWT
- [x] Email confirmation on; `ALLOW_UNSIGNED_WEBHOOKS` unset; secrets present
- [x] Legacy/demo code paths removed
- [x] All 6 money flows reconcile to 0
- [x] Rate limiting + velocity caps (value abuse) — *velocity pending tomorrow's apply (§3.2)*
- [x] Error tracking (Sentry) live
- [x] External settlement reconciliation + heal path
- [ ] 🆕 **The five `20260804*` migrations applied and re-verified** (see the 2026-08-04 box at the top)
- [ ] 🆕 **`access_posture_audit.sql` returns 0 rows** — in particular, `certificates` and `profiles` have RLS with a scoped read policy
- [ ] 🆕 **Certificates are not described as "tamper-evident"** until the signature is keyed (backlog #38)
- [ ] **Independent penetration test** ← the last blocker before LIVE keys
- [ ] CSP switched to enforcing (§3.5)

**Until the pentest passes, run in sandbox/test mode only.**

---

## 5. Still external / not code (unchanged)
Real credit-supplier partner · AML/sanctions vendor · licensed PSP/EMI · legal entity + BIR + DPO/AMLA · accredited verifier (VVB) · backups/PITR + connection pooling + observability dashboards.
