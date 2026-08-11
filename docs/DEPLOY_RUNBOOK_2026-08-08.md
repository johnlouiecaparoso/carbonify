# 🚀 Deploy runbook — 2026-08-08 · ✅ **mostly executed, re-measured 2026-08-11**

> ## ✅ 2026-08-11 — STEPS 1, 2 AND 3 ARE DONE. This page said none of them were.
>
> **Re-probed against live today, each with a control in both directions.** The owner had applied all
> three migrations and redeployed `paymongo-checkout` at some point after this page was written, and
> **four documents — this one, [HANDOFF](HANDOFF.md), [YOUR_ACTION_ITEMS](YOUR_ACTION_ITEMS.md) and
> [OPEN_WORK_REGISTER](OPEN_WORK_REGISTER.md) — all still carried 🔴 against finished work.**
>
> | | This page said | Measured 2026-08-11 |
> |---|---|---|
> | `20260806000300` project fees | 🔴 not applied | ✅ **applied** — `project_fee_invoices` → 200; `reconcile_project_fees` → `401 42501`, matching the `reconcile_financials` control, against a made-up name → `404 PGRST202` |
> | `20260806000400` API tenants + keys | 🔴 not applied | ✅ **applied** — `api_tenants` and `api_keys` → 200 |
> | `20260807000100` public project registry | 🔴 not applied | ✅ **applied** — `search_public_project_registry` returns real validated projects |
> | `paymongo-checkout` | 🔴 not redeployed | ✅ **redeployed** — `create_project_fee_checkout` answers *"Authentication required to pay a fee"*, an error only the new build can produce; the old build's `create_wallet_topup_checkout` answers its own message as the control |
> | `paymongo-webhook` | 🔴 not redeployed | ✅ **owner-confirmed** — ❓ not measurable from here, see STEP 2 |
> | `public-registry` | 🔴 not deployed | ✅ **deployed, Verify JWT off, re-probed working** — 🔴 one more redeploy for the discovery-URL fix, STEP 2b |
> | Frontend | 🔴 not pushed | ✅ **pushed 2026-08-11** — `origin/main` `76477c4` → `9d02053` → `230a8bc`, chunk-verified live |
> | Tests / lint / build | 1387 across 122 | ✅ **1401 unit across 122 files · lint 0 · build green**, all re-run today |
>
> 🔎 **A probe told me the opposite of the truth first, and it is the trap this project has already
> recorded once.** `search_public_project_registry` returned `PGRST202` on the first attempt and read
> as *"not applied"*. The arg list had been **guessed** — `p_status` where the migration says
> `p_category`. PostgREST resolves an RPC by name *and* argument names, so a wrong signature returns
> the identical code to a missing function. Copied out of
> [`20260807000100`](../supabase/migrations/20260807000100_public_project_registry.sql#L61) it returns
> projects. **Copy the signature out of the migration; never guess it.**
>
> > **The routing lesson, and it is this project's own subject running backwards.** Every previous
> > version of this failure was *work believed done that was not*. This is *work believed pending that
> > was finished* — and it is the more expensive direction, because a 🔴 against a completed step
> > invites the owner to **redo it**. Re-applying `20260806000300` would have been harmless; re-running
> > the wrong file on a different day is what caused two silent reverts on 2026-08-05. **A red box is a
> > claim that needs re-measuring exactly as much as a green one.**

<details>
<summary>What this page said on 2026-08-08 (kept — the reasoning is still why the order matters)</summary>

> **Everything on my side is done.** This page is your half, in order, with a link on every step.
>
> **State measured today, not carried forward** (each probe had a control):
>
> | | State |
> |---|---|
> | Tests / lint / build | ✅ 1387 unit across 122 files · lint 0 · build green |
> | Production frontend | ✅ live at **carbonify-gilt.vercel.app**, serving the 2026-08-06 build |
> | The 08-07 + 08-08 work | 🔴 committed, **not pushed**, not applied, not deployed |
> | 3 migrations | 🔴 not applied |
> | 3 edge functions | 🔴 not redeployed |
>
> ⚠️ **One thing changed since the last runbook.** The commits were never pushed to GitHub — they
> existed only on this laptop. So "deploy the frontend" is **my** step now, not yours, and it has to
> happen **after** your step 1. Details in [HANDOFF.md](HANDOFF.md) § *DEPLOY STATE*.

</details>

---

## Order matters — read this before clicking anything

```
    STEP 1  you    apply 3 migrations          ✅ DONE  (measured 2026-08-11)
    STEP 2  you    deploy 2 edge functions     ✅ checkout MEASURED · ✅ webhook — your word
    STEP 2b you    fix public-registry         ✅ DONE and verified · 🔴 one more redeploy
    STEP 3  me     push main → Vercel builds   ✅ DONE  2026-08-11 (9d02053, 230a8bc)
    STEP 4  you    set the fee prices          🔴 still open
    STEP 5  you    run the VERIFY blocks       🔴 still open
```

**The ordering hazard is gone.** Step 1 landed before step 3, which is the constraint that mattered:
the Projects tab on the public `/registry` calls `search_public_project_registry`, and that RPC was
already live when the frontend carrying the tab was pushed. Nothing was broken for a window.

**Why step 1 comes before step 3.** The frontend adds a **Projects tab to the public `/registry`**,
which calls `search_public_project_registry`. Deploy the frontend before the migration is applied and
that tab shows *"Failed to search the project registry"* — signed out, on your public page, to
anyone. Nothing is damaged and the Certificates tab is untouched, but a public registry showing an
error is the worst screen on the platform to leave broken for a window.

Steps 1 and 2 are independent of each other; do them in either order.

---

## STEP 1 — Apply three migrations — ✅ **ALL THREE APPLIED** (measured 2026-08-11)

> ✅ **Nothing to do here.** All three were confirmed live by anon probe with controls — the evidence
> is in the table at the top of this page. **Do not re-run any of them**: re-applying a migration you
> have already applied is exactly what produced the two silent reverts of 2026-08-05, and the
> executable replay guards only protect the 16 money-path files, not these three.

**Open the SQL editor:** 👉 **[Supabase → SQL Editor → New query](https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/sql/new)**

For each file below: click the file link, select all, copy, paste into the SQL editor, **Run**.
Do them **in this order**.

| # | Migration file — click to open | Why this order | Expect |
|---|---|---|---|
| 1 | **[20260806000300_project_fee_invoices.sql](../supabase/migrations/20260806000300_project_fee_invoices.sql)** | Calls `notify_one` from `20260806000200` (already applied). The call is guarded by `to_regprocedure`, so it applies either way — out of order just means fee notifications silently do nothing | `Success. No rows returned` |
| 2 | **[20260806000400_api_tenants_and_keys.sql](../supabase/migrations/20260806000400_api_tenants_and_keys.sql)** | Independent | `Success. No rows returned` |
| 3 | **[20260807000100_public_project_registry.sql](../supabase/migrations/20260807000100_public_project_registry.sql)** | Independent of both. The safest of the three — changes no data, no policy, and no existing function | `Success. No rows returned` |

> ⚠️ **"Success. No rows returned" is not proof it worked.** It is also what a silently reverted
> function returns, which has happened twice on this project. Step 5 is what actually proves it.

> ✅ **Migrations that would revert something newer now refuse to run.** If you ever paste a
> superseded file by accident you will get a loud `P0001 REFUSING TO RUN …` with the file to
> re-apply instead. None of the three above will trigger it.

---

## STEP 2 — Redeploy **two** edge functions (the third is a decision, not a step)

**Dashboard:** 👉 **[Supabase → Edge Functions](https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/functions)**

> ⚠️ **Corrected 2026-08-08.** This step originally listed three deploys as equally required. It is
> **two**. `public-registry` has never been deployed, and **nothing in the app calls it** — verified
> by grep: the only references in `src/` are its own test file. The new Projects tab on `/registry`
> reads the `search_public_project_registry` **RPC** from migration 3, not this function.
> `public-registry` is the partner-facing white-label API — a product you sell access to, not a
> dependency of the site. Deploying it puts a **new public endpoint on the internet**, which is a
> commercial decision. [SOFT_LAUNCH_RUNBOOK](SOFT_LAUNCH_RUNBOOK.md) already had this right — its
> pre-flight reads *"7 required, with the eighth named as a decision"* — and this page had regressed
> it back to a checklist item. **A checklist that turns a decision into a tick-box is how the
> ungated version of this function nearly got deployed on 2026-08-05.**

### Required — the fee path is broken without both

```bash
npx supabase functions deploy paymongo-checkout      # ✅ DONE — confirmed live 2026-08-11
npx supabase functions deploy paymongo-webhook       # ❓ UNCONFIRMED — only you can settle this
```

> ✅ **Owner-confirmed 2026-08-11 — and this one rests on your word, not on a measurement.** Recorded
> that way deliberately, because this project's whole method is not blurring the two.
>
> ❓ **Why I cannot check it, now tested rather than assumed.** Every path into the webhook is behind
> the HMAC signature check, so old and new builds both answer `401 Invalid signature`. I also
> compared the gateway's response headers for `paymongo-webhook`, `public-registry` (deployed today)
> and `process-payouts` (deployed 2026-07-30): **identical header sets, no version, no deploy id, no
> timestamp.** There is nothing to read from outside.
>
> **The measurement that will eventually settle it is behavioural, and it is step 5c**: after the
> first project fee is paid by card, `reconcile_project_fees()` returning **0 rows** proves the
> webhook's `project_fee` branch ran. Until a fee is actually paid, that check passes vacuously —
> which is the same `UNPROVEN`-vs-`PASS` distinction the RLS suite makes.
>
> ⚠️ **The asymmetry is what makes this urgent rather than tidy.** Checkout is live, so a project fee
> can be **paid by card today**. The invoice is only marked paid — and the revenue only reaches
> `platform_revenue` — by the webhook's `project_fee` branch. Checkout without the webhook means
> **you take the money and never book it**, and `reconcile_project_fees()` is what would eventually
> tell you, after the fact. Re-deploying a function that is already current costs nothing; the
> reverse costs a reconciliation.

⚠️ **`npx supabase`, not `supabase`** — the CLI is not on this machine's PATH; it resolves through
`npx` (2.106.0). `supabase/.temp/linked-project.json` already points at `fmngptolarydbgrtltnd`, so
no `--project-ref` is needed, but you will need to be logged in (`npx supabase login`).

⚠️ **The webhook is not optional.** A fee paid by card creates the PayMongo session from
`paymongo-checkout`, but the invoice is only marked paid — and the revenue only reaches the ledger —
by the webhook. **Deploy checkout without the webhook and you will take money and not book it.**

---

## STEP 2b — ✅ FIXED by the owner 2026-08-11 · 🔴 **one more redeploy needed**

> ✅ **Verified — the gateway problem is gone and the current build is live.** Re-probed after the
> owner turned Verify JWT off and redeployed. Every check passed, in both directions:
>
> | Check | Result |
> |---|---|
> | no header → root | ✅ **200 discovery document** (was `401 UNAUTHORIZED_NO_AUTH_HEADER`) |
> | no header → `/v1/?stats=1` | ✅ **200**, `validatedProjects: 3` — the public tier is genuinely serving |
> | no header → `/v1/` | ✅ **200**, real validated projects |
> | `Bearer <anon JWT>` | ✅ **200 discovery** — treated as *no key*, so the `9d02053` build is live (the old one answered `401 Invalid or expired API key`) |
> | `Bearer ck_live_<bogus>` | ✅ **401 from the FUNCTION**, not `UNAUTHORIZED_INVALID_JWT_FORMAT` from the gateway — **a real partner key can now arrive** |
> | `/v1/projects` | ✅ 404, does not fall through to the listing |
> | `/v2/` | ✅ 404 with `supportedVersions: ["v1"]` |
> | `Bearer notaprefix123` | ✅ 200 — a non-`ck_` bearer is anonymous, not rejected |
>
> No `sb-error-code` header on any response, which is the direct evidence that the gateway is no
> longer refusing: **Verify JWT is OFF.**

> 🔴 **AND THE PROBE FOUND A THIRD DEFECT, in the same request.** Every URL in the discovery
> document was **broken**, and the discovery document is the one endpoint whose entire job is telling
> a partner where to point.
>
> ```
> served:   http://<ref>.supabase.co/public-registry/v1/?stats=1   -> 404 requested path is invalid
> correct:  https://<ref>.supabase.co/functions/v1/public-registry/v1/?stats=1  -> 200   (control)
> ```
>
> Two independent causes, both invisible in code review and both needing a running deploy:
>
> - **scheme** — TLS terminates at the gateway, so `url.origin` is `http:` inside the edge runtime.
>   A partner copying that base sends `Authorization: Bearer ck_live_…` **over cleartext** on their
>   first call;
> - **prefix** — the gateway strips `/functions/v1` before the function sees the request. The router
>   depends on that and is right to; rebuilding a *public* URL from the same source drops the segment
>   that makes it resolve at all.
>
> **Fixed in the repo, pushed, and pinned** — `publicApiBaseUrl` builds from `SUPABASE_URL`, with 5
> new tests mutation-checked in three directions. 🔴 **One redeploy to pick it up:**
>
> ```bash
> npx supabase functions deploy public-registry --no-verify-jwt
> ```
>
> ⚠️ **Nothing is broken while you wait.** Every data endpoint works; only the *directions* in the
> discovery document are wrong, and no partner has a key yet. **Do this before you issue the first
> key**, not tonight.
>
> > 🔎 **Why the test suite was green through all of it.** `registryApiVersioning.test.js` called
> > `discoveryDocument()` with a correctly-formed base and asserted the document echoed it — which it
> > did. `discoveryDocument` was never the defect. **The handler built the base, and nothing asserted
> > anything about the value it passed.** *A test of the callee is not a test of the caller* — the
> > same shape as `routeAccess.test.js` asserting `/admin` carries `requiresAdmin` while nothing
> > asserted the guard reads it, which is how a whole branch that checked nothing survived.

<details>
<summary>The finding as first measured, before the owner fixed it</summary>

### ⚠️ 2026-08-11: `public-registry` is deployed, and every tier of it is dead

**It was deployed at some point after 2026-08-08 — and without `--no-verify-jwt`.** That flag is not
a convenience. Without it the Supabase gateway demands a valid Supabase JWT *before a request ever
reaches the function*, and all three ways in are refused. Measured today:

| Caller | Response | Who refused |
|---|---|---|
| No `Authorization` header — **the public tier** | `401 UNAUTHORIZED_NO_AUTH_HEADER` | the gateway |
| `Authorization: Bearer ck_live_…` — **a paying partner** | `401 UNAUTHORIZED_INVALID_JWT_FORMAT` | the gateway |
| `Authorization: Bearer <anon JWT>` — an ordinary browser | `401 {"error":"Invalid or expired API key."}` | the function, pre-`9d02053` |

The second row is the fatal one: **the gateway parses a partner's API key as a JWT and rejects it, so
a valid key can never arrive**, and the failure reads as *"bad key"* to whoever is holding a good one.
[`index.ts:32-42`](../supabase/functions/public-registry/index.ts#L32-L42) predicts all three
responses exactly — the header was written from the first deploy's measurements, and today's probe
reproduced them line for line.

✅ **Nothing else is affected.** Grep of `src/` returns one file, the function's own test. The site
does not call this endpoint; what is broken is the partner API **product**, not Carbonify.

**Two things to fix it, and the second is now possible because `main` is pushed:**

1. 👉 **[Edge Functions](https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/functions)** →
   `public-registry` → **Verify JWT: OFF**.
2. Redeploy from the current code — commit `9d02053` fixes the function's own half, so that an
   ordinary browser sending the standard anon JWT is treated as **anonymous** rather than as a caller
   with a bad key:

   ```bash
   npx supabase functions deploy public-registry --no-verify-jwt
   ```

**Or leave it.** Nothing in the product needs this endpoint, and the honest option is to take it down
until you have a partner — an unwatched endpoint on the internet with your name on it is a liability
before it is an asset. It is currently live and answering `401` to everybody, which is at least a
safe way to be broken.

> 🔎 **Worth naming, because it is a new shape for this project.** Every previous failure here was a
> gap between two of *on disk · committed · on origin · live*. This one is a gap **inside "live"**:
> the function is deployed, the code is right, and a **deploy-time flag** makes it behave as though
> neither were true. *A deploy is not one fact. It has settings, and the settings are not in git.*

<details>
<summary>The 2026-08-08 wording of this step, when the function had never been deployed</summary>

### Optional — only when you want to sell the partner API

```bash
npx supabase functions deploy public-registry --no-verify-jwt
```

Nothing breaks if you never run this. Deploy it when you have a partner, not before — there is no
benefit to having it live and unused, and an endpoint nobody is watching is one more thing on the
internet with your name on it.

When you do:

- **Set `SUPABASE_SERVICE_ROLE_KEY` first.** Without it the anonymous tier still works and *every
  keyed call returns 401*, which looks exactly like a bad key. 👉 **[Edge Function secrets](https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/settings/functions)**
- ~~**It is now two files**~~ — ✅ **fixed 2026-08-08 after the first deploy failed.** The version
  routing briefly lived in a `routing.ts` beside `index.ts`, and the deploy returned
  `Module not found ".../source/routing.ts"` — the bundler had only `index.ts`. It is **one file
  again**, with the routing inlined, and a test now fails the suite if a relative import reappears.
  Paste me what this returns and I'll confirm it booted:

  ```
  https://fmngptolarydbgrtltnd.supabase.co/functions/v1/public-registry
  ```

  Expected: a JSON discovery document with `"currentVersion":"v1"`. A boot error means the import
  didn't resolve and I'll inline it.

</details>

</details>

⚠️ **Two things are still live guidance, not history:**

- **Set `SUPABASE_SERVICE_ROLE_KEY`** if you have not. 👉 **[Edge Function secrets](https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/settings/functions)** —
  without it the keyed tier 401s, which is indistinguishable from the gateway problem above and would
  send you chasing the wrong one. ⚠️ **Worth checking now**: `ck_live_<bogus>` correctly returns the
  function's own 401, which proves the request *reaches* the function — but a missing service key
  produces that identical answer for a **valid** key, and no probe from here can tell those apart
  because nobody holds a real key yet.
- **Settle the redistribution terms before issuing the first key** to anyone outside the company —
  what a partner may republish is a contract clause, and backlog #50 leaves it open.

---

## STEP 3 — Mine: push `main` — ✅ **DONE 2026-08-11**

**Pushed.** `origin/main` went `76477c4` → `9d02053`, nine commits. Vercel's Git integration builds
`origin/main` automatically, so there was nothing to click.

What shipped: `/developer/fees`, `/admin/api-keys`, the public **Projects tab** on `/registry`,
farmer CSV exports, the **impact disclosure** on the Carbon Asset Ledger, corrected homepage social
links, the registry API **v1** freeze, and both registry-API fixes.

Confirm it landed rather than assuming — this repo's own rule:

```bash
node scripts/analysis/verify-deploy.mjs https://carbonify-gilt.vercel.app
```

Watch the build if you like: 👉 **[Vercel dashboard](https://vercel.com/dashboard)** (project
**carbonify-gilt**, **not** carbonify13 — that host 404s since the repo rename).

---

## STEP 4 — Set the fee prices

👉 **In the app: System Configuration → Fees** (`/admin/settings` as an admin)

Both fees ship at **₱0**, and every trigger short-circuits on a non-positive amount. Until you set
them, the fee migration creates no invoices, sends no notifications and earns nothing.

**"Applied" and "earning" are two separate events**, and only you can cause the second one.

You do not have to decide today. Applying at ₱0 is safe and inert by design — which is also what
makes the first behavioural check in step 5 worth running before you price anything.

---

## STEP 5 — Prove it, don't assume it

### 5a. The safest check first — the one that changes nothing

**With both fees still at ₱0, validate a project and confirm no invoice row appears.**

```sql
select count(*) from project_fee_invoices;   -- expect 0 while fees are ₱0
```

If a row appears, **stop** — the zero-guard is the whole reason this migration is safe to apply
before pricing is decided.

> 🆕 **2026-08-11: this reads 0 today**, checked from here against live. ⚠️ **It is weaker evidence
> than it looks** — 0 invoices is equally consistent with *"the fees are ₱0 and the guard works"* and
> with *"no project has been validated since the migration landed"*. The check only means something
> **after** a validation. And I could not read the two fee settings to tell you which case you are in:
> anon RLS returns only four `app_settings` keys and neither `project_onboarding_fee` nor
> `verification_fee` is among them. **Only you can see step 4's answer.**

### 5b. Run the VERIFY block at the bottom of each migration

Each file ends with a `VERIFY` block (line ~514 in the fees migration) — **every row must read
PASS**. I cannot read `pg_trigger` with the anon key, so the triggers are the part I genuinely
cannot measure from here.

### 5c. The behavioural checks

These matter more than the SQL ones: they are what prove a fee raises **exactly once**, settles
once, and leaves the books balanced.

```sql
select * from reconcile_financials();    -- expect 0 rows
select * from reconcile_project_fees();  -- expect 0 rows
```

---

## After this: the one gate left before the beta

**`ESC-01…06` — the escrow behaviour checks.** Escrow is switched on and the Terms already promise
sellers a hold window; nothing has yet checked what it does to a real purchase.

It cannot be done alone — each claim is visible on a screen only the buyer, the seller, or you can
see. 👉 **[OWNER_TEST_GUIDE.md](OWNER_TEST_GUIDE.md)** (yours) ·
**[TESTER_GUIDE.md](TESTER_GUIDE.md)** (hand to each helper) ·
**[TESTER_FEEDBACK.md](TESTER_FEEDBACK.md)** (what they send back)

⚠️ Run **`ESC-02` on GCash specifically**, and note that `ESC-03` is corrected in the guide — the
hold is stamped at purchase time, so changing the setting moves nothing on an existing purchase.

---

## Quick reference — every link on this page

| What | Link |
|---|---|
| SQL editor (new query) | https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/sql/new |
| Edge Functions | https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/functions |
| Edge Function secrets | https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/settings/functions |
| Database → Triggers | https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/database/triggers |
| Vercel | https://vercel.com/dashboard |
| Production site | https://carbonify-gilt.vercel.app |
| Migration 1 — project fees | [`20260806000300_project_fee_invoices.sql`](../supabase/migrations/20260806000300_project_fee_invoices.sql) |
| Migration 2 — API tenants + keys | [`20260806000400_api_tenants_and_keys.sql`](../supabase/migrations/20260806000400_api_tenants_and_keys.sql) |
| Migration 3 — public project registry | [`20260807000100_public_project_registry.sql`](../supabase/migrations/20260807000100_public_project_registry.sql) |
| Registry API docs | [`supabase/functions/public-registry/README.md`](../supabase/functions/public-registry/README.md) |

---

_Created 2026-08-08. Supersedes the step list at the top of
[YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) for this deploy only — that page stays authoritative
for everything after it._
