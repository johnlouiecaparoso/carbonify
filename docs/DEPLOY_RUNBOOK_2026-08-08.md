# 🚀 Deploy runbook — 2026-08-08

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

---

## Order matters — read this before clicking anything

```
    STEP 1  you    apply 3 migrations          ← must be first
    STEP 2  you    deploy 3 edge functions
    STEP 3  me     push main → Vercel builds   ← tell me when 1 is done
    STEP 4  you    set the fee prices
    STEP 5  you    run the VERIFY blocks
```

**Why step 1 comes before step 3.** The frontend adds a **Projects tab to the public `/registry`**,
which calls `search_public_project_registry`. Deploy the frontend before the migration is applied and
that tab shows *"Failed to search the project registry"* — signed out, on your public page, to
anyone. Nothing is damaged and the Certificates tab is untouched, but a public registry showing an
error is the worst screen on the platform to leave broken for a window.

Steps 1 and 2 are independent of each other; do them in either order.

---

## STEP 1 — Apply three migrations

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

## STEP 2 — Redeploy three edge functions

**Dashboard:** 👉 **[Supabase → Edge Functions](https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/functions)**

From the project folder in a terminal:

```bash
supabase functions deploy paymongo-checkout      # new create_project_fee_checkout action
supabase functions deploy paymongo-webhook       # new project_fee settlement branch
supabase functions deploy public-registry --no-verify-jwt
```

⚠️ **The webhook is not optional.** A fee paid by card creates the PayMongo session from
`paymongo-checkout`, but the invoice is only marked paid — and the revenue only reaches the ledger —
by the webhook. **Deploy checkout without the webhook and you will take money and not book it.**

⚠️ **`public-registry` needs a secret.** It now reads `SUPABASE_SERVICE_ROLE_KEY`. Without it the
anonymous tier still works and *every keyed call returns 401*, which looks exactly like a bad key.
Set it here: 👉 **[Edge Function secrets](https://supabase.com/dashboard/project/fmngptolarydbgrtltnd/settings/functions)**

🆕 **`public-registry` is now two files** (`index.ts` + `routing.ts`). The command above is unchanged
— `supabase functions deploy` bundles the whole folder — but it is the first edge function in this
repo with a relative import, and **I could not verify the bundle locally** (Deno isn't installed on
this machine; both files parse-check clean via esbuild). **After deploying, please paste me what this
returns** — it is the one thing I can't measure for you:

```
https://fmngptolarydbgrtltnd.supabase.co/functions/v1/public-registry
```

Expected: a JSON discovery document with `"currentVersion":"v1"`. A boot error means the import
didn't resolve and I'll inline it.

---

## STEP 3 — Mine: push `main`

**Tell me when step 1 is done and I'll push.** Vercel's Git integration builds `origin/main`
automatically — there is nothing for you to click.

Five commits are waiting, plus today's two. What ships: `/developer/fees`, `/admin/api-keys`, the
public **Projects tab**, farmer CSV exports, the **impact disclosure** on the Carbon Asset Ledger,
and corrected homepage social links.

Watch the build here if you like: 👉 **[Vercel dashboard](https://vercel.com/dashboard)** (project
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
