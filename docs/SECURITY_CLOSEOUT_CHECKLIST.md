# Security Close-out & Hardening — Status + Test Runbook

> ## 🆕 2026-08-04 — money-path defect pass. Five new items, none of them applied yet.
>
> This page's §4 gate has read all-ticked-but-the-pentest since 2026-07-04. A read of the money
> surface **against the code rather than this page** found five defects that the gate's wording did
> not cover, because each is a rule the gate never stated. Full write-up in [HANDOFF.md](HANDOFF.md)
> § *2026-08-04 money-path defect pass*; ordered apply steps in its § *DEPLOY STATE*.
>
> | # | Finding | Fix | State |
> |---|---|---|---|
> | 1 | The escrow method-gate reads `payment_intents.provider`, which is always `'paymongo'` — the GCash/Maya branch has **never executed**, and `credit_transactions.payment_method` recorded `'paymongo'` for every online sale | `20260804000300` + redeploy `paymongo-webhook`, `paymongo-resettle` | ⬜ written, not applied |
> | 2 | `assert_can_trade` had **one** call site (the card path). `process_wallet_purchase` is granted to `authenticated`, so KYC **and account suspension** were bypassable by calling the RPC directly | `20260804000100` + redeploy **`paymongo-checkout`** (the wallet **top-up** suspension check lives there) | ⬜ written, not applied |
> | 3 | `20260703000300` grants profiles UPDATE from a two-name **allow**-list and says "re-run after adding columns" — doing so re-grants `kyb_verified` (self-approve KYB → withdraw) and `is_active` (self-unsuspend); *not* doing so breaks every profile save | `20260804000200` (deny-list) | ⬜ written, not applied |
> | 4 | Payouts ignored suspension; `request_payout`'s idempotency key was global, so a collision returned **another seller's** payout id | `20260804000400` | ⬜ written, not applied |
> | 5 | **`certificates` has no RLS in any migration** and the browser INSERTs/UPDATEs it directly — on a fresh env, read *and* write on everyone's certificates | `20260804000500` | 🔒 **gated** on its pre-flight query |
>
> **Run `supabase/diagnostics/access_posture_audit.sql` before any of them.** It is read-only, returns
> 0 rows when the posture is correct, and covers four things `money_table_rls_audit.sql`
> **structurally cannot see** — most importantly **open SELECT policies**, since that audit's finding
> (A) only inspects `INSERT/UPDATE/DELETE/ALL`. A `using (true)` read policy on `wallet_accounts`
> would pass it silently today.
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
