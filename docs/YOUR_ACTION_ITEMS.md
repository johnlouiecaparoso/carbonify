# 👉 Your Action Items — owner runbook

> **Rewritten 2026-07-29.** The previous contents were the 2026-07-01 → 07-03 cutover checklist, which
> that page's own banner recorded as **superseded and complete**. The cutover detail it referenced is
> preserved in [YOUR_CUTOVER_STEPS.md](YOUR_CUTOVER_STEPS.md). This page is now the **current** list of
> things only you can do, in the order to do them.
>
> **This page holds instructions, not status.** Where a step has a source of truth it links there:
> [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) owns the pilot procedure,
> [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) owns the real-money gate,
> [OPEN_WORK_REGISTER.md](OPEN_WORK_REGISTER.md) owns who-can-do-what, and
> [HANDOFF.md](HANDOFF.md) § *Consolidated status* (🆕 2026-08-04) answers *"is this ready to go live?"*
> in one table — including the distinction this project has confused before: **ready to deploy** and
> **ready to take real money** are different questions with different answers.

> ## 🧭 2026-08-02 — where this stands, in one box
>
> ### 🔒 CONFIRMED 2026-08-02 — and the fix is staged in three steps
>
> **Any signed-in user can write a notification into any other user's bell** — including yours.
> You ran the query and it came back `(auth.uid() IS NOT NULL)`, so this is real.
> `system_notifications`' INSERT policy is `with check (auth.uid() is not null)`, which means "any
> logged-in user, for any recipient" rather than "for yourself", and the client inserts those rows
> directly. Someone with an account could plant *"Payout on hold — reconfirm your bank details"* in an
> admin's notification feed, rendered by Carbonify's own UI.
>
> **The worst half is fixed today:** the bell used to navigate with
> `window.location.assign(notification.link)`, which accepted an **absolute URL**, so a forged
> notification could send you off-site. Links are now restricted to paths inside the app.
>
> **The database half is now built, in three steps — and the ORDER MATTERS MORE THAN THE SPEED.**
>
> | Step | You do | When |
> |---|---|---|
> | 1 | Apply `20260802000300_notify_counterparty_rpc.sql` | Any time. Additive, changes nothing |
> | 2 | Deploy the frontend | After step 1 |
> | 3 | Apply `20260802000400_tighten_notification_insert.sql` | **Only once step 2 is live** |
>
> 🔴 **Do not run step 3 early.** It would not throw an error you could see — every one of these
> notifications is wrapped in a non-fatal catch, so a farmer would simply stop being told their
> delivery was confirmed, silently, with nothing in the console. Step 3 refuses to run if step 1 is
> missing, but it cannot detect whether your frontend is deployed. **That check is yours.**
>
> Both are reversible: step 3's header carries the two statements that put the old policy back.
>
> **Still not urgent and it does not gate the pilot** — no money moves, nobody else's notifications
> become readable, no privilege is gained — but it belongs on the pentest brief, and it is worth
> closing while signups are open to anyone.
>
> ### ✅ 2026-08-05 — everything is applied, pushed and LIVE
>
> ## 🔗 Production is **https://carbonify-gilt.vercel.app**
>
> **Not `carbonify13.vercel.app`** — that one now returns `404 DEPLOYMENT_NOT_FOUND`, which is what
> sent me looking. Your GitHub repo was renamed `carbonify13` → `carbonify`, and Vercel had created
> the project as **`carbonify-gilt`** because it appends a random word when the name it wants is
> taken (`carbonify.vercel.app` is held by an unrelated React app). **Your deploy pipeline was never
> broken — it has been building this whole time.** Only the docs naming the URL were wrong, and
> they are fixed now.
>
> Verified by walking all 106 deployed chunks rather than loading the page:
>
> ```bash
> node scripts/analysis/verify-deploy.mjs https://carbonify-gilt.vercel.app
> ```
>
> Every check passes, including that the deployed marketplace chunk quotes the **listing** price
> first — the 2026-08-04 fix that stops a buyer being shown one number and charged another.
>
> ✅ **`VITE_GA_TRACKING_ID` is safe to set now.** The deployed bundle contains no `api_error_`
> anywhere, so the `window.fetch` wrapper is genuinely gone from what is being served.
>
> **One tidy-up worth doing while you are in the dashboard:** you have at least three Vercel
> projects, one of them a React app sitting on `carbonify.vercel.app` — your product's name. If you
> want that hostname, release it there first; a domain belongs to one project at a time (§*Order of
> operations* in [VERCEL_DOMAIN_AND_REDEPLOY.md](VERCEL_DOMAIN_AND_REDEPLOY.md)), and copy the
> `VITE_*` env vars **before** moving anything, or the new project builds green and fails at runtime.
>
> ---
>
> ### ✅ The database half is done too — nothing there is waiting on you
>
> You ran `access_posture_audit.sql` (5 rows, both findings now closed) and applied
> `20260804000100`–`000500` — each returned *"Success. No rows returned"* — and redeployed the edge
> functions.
>
> ✅ **All three money edge functions are deployed** — `paymongo-webhook`, `paymongo-resettle` and
> `paymongo-checkout` (the last one 2026-08-05, closing the wallet **top-up** suspension check).
> **The entire backend side of this pass is now live.**
>
> **One thing carries forward, and it is the last functional gate:**
>
> ## ✅ 2026-08-05 — a silent revert HAPPENED and was caught and undone the same hour
>
> Recorded because it is the clearest example this project has of the thing it keeps finding, and
> because it was **one query away from being invisible**.
>
> `20260725000200` was re-run against live. It defines `process_marketplace_purchase` — and so does
> `20260804000300`, the migration that fixed the escrow method-gate. **`create or replace` overwrites
> rather than merges**, so replaying the older file reverted the newer one with no error and nothing
> on screen.
>
> The check came back **`*** REVERTED ***`**. Re-applying `20260804000300` restored it.
>
> **What it would have cost if nobody had asked.** The gate was reading `payment_intents.provider`
> again — always the literal `'paymongo'` — so every sale takes the 7-day card hold and
> `credit_transactions.payment_method` records `'paymongo'` for everything. **`ESC-02` would have
> failed during the team test session, and it would have looked like an escrow defect** rather than a
> reverted migration. Several people would have spent an afternoon debugging working code.
>
> **Blast radius: exactly one function, and no data.** `20260725000200` also defines
> `release_matured_escrow`, but that is defined *nowhere else*, so re-running rewrote it to the same
> definition. Verified rather than assumed — and then confirmed against the data: the repair query
> returned **`OK — 20260804000300 is live`**, and the most recent settlement on the database is
> **2026-07-11**, nearly a month before the revert. **Nothing settled inside the window**, so no row
> carries a wrong `payment_method` because of it.
>
> > 🔎 **The same query showed the original bug in the wild.** Two settlements from 2026-07-03 read
> > `payment_method = 'paymongo'` — the gateway, not the method — which is precisely what
> > `20260804000300`'s header describes and what it was written to stop. They are ₱1.00 test
> > purchases and are **deliberately not backfilled**: they are the only surviving evidence of the
> > pre-fix behaviour, and rewriting history to look correct is the opposite of what a ledger is for.
> > Anything from the pilot onwards will record the real method.
>
> **Re-run this any time you have applied migrations out of order:**
>
> ```sql
> select case
>          when pg_get_functiondef('public.process_marketplace_purchase(uuid, text)'::regprocedure)
>               like '%v_intent.payment_method%'
>          then 'OK — 20260804000300 is live'
>          else '*** REVERTED *** — re-apply 20260804000300'
>        end as verdict;
> ```
>
> **And it can no longer happen quietly.** All 27 superseded migrations now carry a header naming the
> file that supersedes them, and `migrationSupersession.test.js` fails the suite if a new one lands
> without it. `process_marketplace_purchase` alone is defined in **seven** migrations; 19 functions
> are defined in more than one.
>
> > The lesson worth keeping: **the only reason this was caught is that the re-run was mentioned out
> > loud.** Nothing errored, nothing logged, no check would have fired, and the next signal would
> > have been a confident false bug report from a tester. When you replay a migration, say which one.
>
> ---
>
> 🔴 **`ESC-01…06` — the escrow behaviour checks.** Against **https://carbonify-gilt.vercel.app**.
>
> 🆕 **Bringing helpers? Use [ESCROW_TEST_RUNSHEET.md](ESCROW_TEST_RUNSHEET.md).** This is the one
> test that cannot be done alone — a buyer buys, only the seller can see the money held, only you can
> age a hold, only an admin can refund. The run sheet has your set-up checklist (do it *before* they
> arrive), a 16-step sequence with explicit handoffs, a one-pager to send each person, and a feedback
> sheet built around the question that has found the most bugs on this project: *"did any screen tell
> you that you have nothing, when you knew you had something?"*
>
> ⚠️ **Two traps, both in the run sheet:** run `ESC-02` with **GCash**, not wallet balance — wallet
> does not touch the branch that was broken. And **`ESC-03` was wrong until 2026-08-05**: lowering
> `escrow_hold_days_card` cannot release an existing hold (`hold_until` is stamped at purchase), and a
> new purchase at `0` days creates no hold to release. **Age the hold by id instead** — the SQL is in
> §7. The old step also told you to put the setting back afterwards; there is now nothing to put back.
>
> > 🔎 **What the audit found, because it is worth knowing which way it went.** Finding **C** was
> > `plan` and `plan_expires_at` — **not** `kyb_verified` or `is_active`. That means `20260703000300`
> > was applied once and never re-run, so the KYB-self-approval hole was **never open on your live
> > database**, and the plan columns were additionally covered by a trigger that reverts client
> > writes. Finding **D** was the live one: `municipality`, `province` and `onboarding_tour_version`
> > were not writable by their own owner, so **every profile save was failing outright** and the
> > welcome tour replayed on every device. Nobody had reported either. Both are closed.
>
> ---
>
> ### 🔴 SUPERSEDED 2026-08-04 — five migrations ARE now waiting on you *(historical — see above)*
>
> The paragraph below said *"no migration is waiting on you"*. **That was true when written and is
> no longer true.** The 2026-08-04 money-path pass added **five migrations (`20260804000100`–
> `000500`) and **three** edge-function redeploys.** The full ordered list, with what each one closes,
> is in [HANDOFF.md](HANDOFF.md) § *DEPLOY STATE*. Four things to carry over here:
>
> - 🆕 **It is three functions, not two — corrected 2026-08-05.** `paymongo-webhook` and
>   `paymongo-resettle` record the real payment method; **`paymongo-checkout`** carries the wallet
>   **top-up** suspension check, and until 2026-08-05 it appeared in no deploy instruction in any
>   document. Deploying only the first two leaves that guard inert while every doc calls it shipped.
>   No ordering constraint — the RPC it calls has been live since `20260722000800`.
>
> - **Start with the query, not a migration.** `supabase/diagnostics/access_posture_audit.sql` is
>   read-only and its result sets the urgency of the rest. One possible answer — finding **C**,
>   "client can write a protected profiles column" — means any signed-in user can set their own
>   `kyb_verified` and withdraw money. If that comes back, `20260804000200` is the most urgent thing
>   on this page.
> - **`20260804000300` must go in before the escrow checks.** `ESC-02` cannot pass without it: the
>   escrow method-gate was reading `payment_intents.provider`, which is always the literal
>   `'paymongo'`, so the GCash/Maya branch was dead code and every sale took the 7-day card hold.
> - ⚠️ **Never re-run `20260703000300` again.** Its own header tells you to re-run it after adding
>   profile columns; doing so re-grants `UPDATE` on `kyb_verified` and `is_active`, letting users
>   self-approve KYB and self-unsuspend. `20260804000200` replaces it and is safe to re-run.
>
> Suite is now **1275 green** across 111 files. Lint 0, build green, `deno check` clean.

> **The in-repo lane is clear of everything that gates the pilot.** Suite **1256 green** across 110
> files (1185 on 2026-08-03, 1131 on 08-02, 920 on 08-01, 908 on 07-31, 801 the morning before), plus
> a 37-test responsive spec and a 22-test authenticated one. Lint 0, build green. ~~**No migration is
> waiting on you**~~ — *see the correction above.* Every migration before 08-04 is applied and
> probe-verified except `20260802000200`, whose *validity* is unconfirmed only because constraint
> state is not readable through the anon API (item 7 below). **Everything else is frontend and is
> sitting in unpushed commits on `main` — item 0.**
>
> ### ✅ PR #14 IS MERGED AND PRODUCTION IS RUNNING IT (2026-08-01)
>
> `main` went from 153 commits behind to **0**. Production was verified by **fetching it**, not by
> reading a green check: `carbonify13.vercel.app` serves `sw.js` at `CACHE_VERSION = 'v4'` and a
> `RetireView` chunk containing `getPurchaseAndRetirementHistory` — code that has never been on `main`
> before today. **The router-guard fix is live: a farmer can no longer reach `/admin` by URL.**
>
> ⚠️ **Do not misread `main`'s red X.** The `deploy` job in `ci.yml` fails with
> `Input required and not supplied: vercel-token` — that secret has never been set, and the job has
> never run in this repo's history. **Your real deploy is the Vercel GitHub integration, and it
> succeeded.** Set the three `VERCEL_*` secrets or delete the job. Everything else on `main` is green
> for the first time ever.
>
> ⚠️ **A second Vercel project, `ecolink`, builds from this repo on every push and serves an unrelated
> React app.** `carbonify13` is production. Your local `.vercel/repo.json` points at `ecolink`, so a
> CLI `vercel --prod` from the project folder would deploy the wrong thing. Worth unlinking.
>
> **2026-08-01 added no work for you, but it did add one thing worth five minutes.** The consent gate
> was reappearing at every sign-in and recording nothing — fixed, see HANDOFF. The fix is verified for
> the four DEV mock accounts. It is **not yet confirmed against your real accounts**, because
> `policy_acceptances` has never held a single row, and the only way to tell "the write was broken" from
> "nobody ever ticked the box" is to tick it once. Sign in with a real account, accept, then run:
>
> ```sql
> select p.role, p.email, a.accepted_at
> from public.profiles p
> left join public.policy_acceptances a
>   on a.user_id = p.id and a.policy_version = '2026-07-31'
> order by p.role;
> ```
>
> A row with `accepted_at` still null after you accepted means the write is broken for real accounts
> too, and that is a different bug from the one fixed. Every other null is simply an account that has
> not been asked yet.
>
> Also on 2026-08-01: the register page had no link to the Terms (people were agreeing by signing up to
> documents the page gave them no way to open), a test file proving the consent box appears **once**, a
> read-only diagnostic
> ([`policy_consent_verification.sql`](../supabase/diagnostics/policy_consent_verification.sql)), and a
> correction pass over four docs that still told you signups were disabled. Your three items below are
> unchanged.
>
> ### ✅ Two things came OFF this list on 2026-07-31
>
> **Signups are ON** — measured, not assumed: `disable_signup: false`, `mailer_autoconfirm: true`.
> Anyone can register and is signed in immediately, with no email involved. That is the right state
> while there is no verified sender domain, because it sidesteps the worst combination (signups on,
> confirmation required, no sender). ⚠️ **A person can now register with an address they do not
> control** — fine for a closed pilot with invited people, **turn confirmation back on before any
> public launch.**
>
> **`20260731000100_policy_acceptances.sql` is applied** — confirmed by probing the REST endpoint
> rather than trusting the dashboard: `/rest/v1/policy_acceptances` returns `200 []` where a
> non-existent table returns `404`, and RLS correctly shows `anon` nothing. The consent gate is
> therefore live: new users must accept the Terms, Privacy Policy and Carbon Credits Policy before
> they can use the platform, and the acceptance is recorded with the policy version.
>
> > 🔎 **Worth knowing about that gate:** its read **fails open** — but only for the cases it can
> > see. If the table were dropped or the read errored, users are let through rather than locked out,
> > deliberately, because an owner-applied migration must never brick the platform, including for the
> > admin who would fix it. The signal is a console error beginning `[policy] Could not read
> > policy_acceptances`.
> >
> > ⚠️ **RLS is NOT one of those cases, and the code claimed it was until 2026-08-01.** PostgREST
> > filters rows; it does not error. An RLS-blocked read returns `200 []` with `error: null` — which
> > is byte-identical to "this user has not accepted". So an identity problem makes the gate fail
> > **closed** and ask forever, silently, with nothing in the console. That is exactly what happened
> > (see HANDOFF 2026-08-01 late). Now that it is applied, run the `VERIFY` block at the bottom of the
> > migration if you want the four PASS rows on record.
>
> ## ⚠️ Reconciled 2026-08-04 — this page was a day behind, and it was telling you to redo finished work
>
> The table below carried 🔴 against **two things you had already completed on 2026-08-02**: the
> `paymongo-webhook` redeploy (row 5) and the three-step notification fix (row 8). HANDOFF and
> OPEN_WORK_REGISTER both recorded them as done and probe-verified that same day; only this page
> still said otherwise. Corrected below.
>
> **That is worth more than the correction itself.** This page opens by saying it holds
> *instructions, not status* — and a row reading 🔴 **is** status, whatever the header says. It is
> the same failure OPEN_WORK_REGISTER had to be reconciled for on 2026-08-01, arriving from the
> other side: there, a routing doc claimed a red blocker; here, an instruction doc claimed unfinished
> work. **A page that ranks by urgency cannot avoid carrying status.** The rule that follows is the
> one already applied to code in this repo — *a claim is not a measurement* — pointed at the docs:
> anything marked 🔴 here should be re-checked against its source before you act on it, and the
> source is HANDOFF for what happened and the live database for what is true.
>
> **Updated 2026-08-05 — you have THREE things left, and only the first one gates the pilot.**
> Everything about the money-path pass (five migrations, three edge functions, the deploy) is closed
> and verified.
>
> | # | Do this | Blocks |
> |---|---|---|
> | 0 | ~~Deploy the 2026-08-04 pass~~ ✅ **done 2026-08-05** — pushed, and the deployed bundle verified chunk-by-chunk at `carbonify-gilt.vercel.app`. `VITE_GA_TRACKING_ID` is now safe to set | — |
> | 1 | 🔴 **Run the escrow behaviour checks** — `ESC-01…06`, Step 1b. **On GCash specifically**; wallet balance alone does not exercise the branch that was broken | **Inviting any seller.** The last functional gate |
> | 2 | 🟠 **Purge or label the leftover test data** — Step 3 | The pilot: a real tester must not buy a fake credit |
> | 3 | 🟠 Buy + verify the email domain — Step 6b | The 8 stub emails, MRV reminders |
> | 4 | ~~Apply `20260801000100`~~ ✅ **done 2026-08-02** — verified by probe (`200 []` vs a `404` control) | — |
> | 5 | ~~Redeploy `paymongo-webhook`~~ ✅ **done 2026-08-02.** The saga's retry cap and its second-supplier-order fix are live | — |
> | 6 | ~~Apply `20260802000100` (grant hygiene, #12)~~ ✅ **done 2026-08-02** — verified by probe | — |
> | 7 | ✅ **DONE 2026-08-05 — `convalidated` is `true`.** Backlog #4 is closed on a measurement rather than on your recollection, and it was the last item on the board in that category. The constraint is the backstop against selling or retiring the same carbon unit twice, and it has now been checked against every row that predated it | — |
> | 8 | ~~Apply `20260802000300` → deploy → `20260802000400`~~ ✅ **done 2026-08-02, in the right order.** `notify_counterparty` answers `401 42501` to `anon`, which is the grant-hygiene block doing its job | — |

> ### ✅ #0 — deployed 2026-08-05. Kept because of what it says about *before* you deploy.
>
> **This is closed.** The pass is pushed, live and verified. The reasoning below is retained because
> the `VITE_GA_TRACKING_ID` warning it carries was real, was one dashboard keystroke away from
> firing, and is exactly the kind of thing that will be true again after some future undeployed pass.
>
> The 2026-08-04 defect hunt is **committed but not pushed.** Nothing on this page
> gated on them, which is exactly why they need saying out loud: *built ≠ live* has now been the
> failure mode four times on this project (the unscheduled payout worker, the misnamed
> `account-deletion` secret, the undeployed function fixes, the frontend that lagged `main` by 153
> commits). **Pushing `main` is the deploy** — Vercel's Git integration builds it.
>
> > ⚠️ **Corrected 2026-08-05: the money-path half of this was not committed either.** The defect
> > hunt's 14 commits were real; the five migrations, the diagnostic, the guard tests, the price fix
> > and the three edge functions from the money-path pass were **still uncommitted in the working
> > tree** while four documents described them as committed. They are committed now. Nothing about
> > your steps changes — but if you ever read a status doc and a `git status` and they disagree,
> > the `git status` is the one that is true.
>
> 🔴 **Do not set `VITE_GA_TRACKING_ID` in Vercel until this is deployed.** Until 2026-08-04 the
> production bundle **replaced `window.fetch`** and recorded one metric per request named after the
> **full URL, query string included** — which is where PostgREST puts its filters
> (`?email=eq.<address>`) and where a signed storage URL puts its token — then forwarded those names
> to Google Analytics whenever `window.gtag` existed. Nothing was ever sent **only because that
> measurement ID has never been set.** Setting it is one field in the dashboard, it is a completely
> reasonable thing to do before a pilot to get traffic numbers, and on the currently-deployed build
> that single keystroke would start streaming user identifiers and signed tokens to Google. It is
> fixed in these commits and inert until they ship. Deploy first, then set the ID if you want it.
>
> **What else goes live with it**, in the order that matters to a pilot:
>
> | Fix | Why you care |
> |---|---|
> | The `window.fetch` wrapper is **deleted** | Above. The one that changes what you may safely do in the dashboard |
> | An abandoned cart checkout **deleted an unpaid item from the basket** and told the buyer they had bought it | A pilot buyer losing a basket item and being told it was purchased is a support ticket you cannot answer |
> | Cart, search history and the homepage onboarding guide are now **keyed by account, not device** | Shared devices — a co-op office, an LGU desk — are the normal case for this pilot, not the edge case |
> | The payment confirmation screen no longer **throws inside its own render** when the provider omits `amount` | It blanked at the exact moment a buyer needs to see their payment went through |
> | `wallet_topup_user_id` is now **actually checked** | It had always been written and never read |
> | The **"allow analytics" switch now works** | It did nothing at all before |
>
> ⚠️ **One deliberate, one-time cost:** any cart a user has open at the moment you deploy is
> dropped. The old cart key held whatever the last person on that device put there, and adopting it
> for the next person to sign in is the exact defect being closed — so it is deleted rather than
> migrated. Device-local, public listing data, rebuilt in two clicks. Same for a dismissed
> onboarding guide: it reappears once per account.
>
> ~~**No migrations.** Nothing to apply, nothing to order. Push and you are done.~~ **← true of the
> defect hunt only.** The money-path pass landed on top of it later the same day and brought five
> migrations and three function redeploys with it. **Follow the ordered list in
> [HANDOFF.md](HANDOFF.md) § *DEPLOY STATE*, not this line.**

**#7 is not urgent, and it is the most interesting thing on this list.** Four constraints on live
were added `NOT VALID`, which means Postgres enforces them on every new write but **skipped the check
against rows that already existed**. One of them is `credit_ownership_qty_nonneg` — `quantity >= 0` —
described in its own migration as the backstop that stops the same carbon unit being **retired or
sold twice**.

So *"has any holding in the ledger ever gone negative?"* has never been asked. This migration asks
it. Most likely the answer is a clean four PASS rows and it is pure cleanup. If it is not, you want
to know before a pilot, and the file's read-only QUERIES block will show you the exact rows.

It validates each constraint independently and **reports** failures by name instead of aborting on
the first, so one bad constraint cannot hide the state of the other three. `VALIDATE CONSTRAINT`
takes only a SHARE UPDATE EXCLUSIVE lock — reads and writes continue while it scans. Re-runnable.
>
> **#6 is done, and it was checked by measuring rather than by reading a green result.** As `anon`
> against live: `review_kyc_application`, `review_kyb_application` and `resolve_dispute` now return
> **`401 42501 permission denied for function`** — refused at the privilege layer instead of being
> admitted and failing an `is_admin()` check inside the body. The four public reads still return
> `200` with real rows, and eight anonymous table reads came back `200` with no
> `permission denied for function` anywhere.
>
> That last check is the one that mattered. Seven of these functions are called from **inside RLS
> policies**, and a policy is evaluated as the *querying* role — so a careless revoke there would have
> broken anonymous reads across the site. They were granted rather than revoked for exactly that
> reason, and the probe is what proves it.
>
> Nothing was exploitable before this; each function checks `is_admin()` or `auth.uid()` in its body.
> It closes the gap between *"safe because the body checks"* and *"safe because you cannot call it"*.
>
> **#5 is new and it is the only red item that was not there yesterday.** The fulfillment saga exists
> twice — a JS copy that **nothing imports except its own test**, and the TS port inside
> `paymongo-webhook` that actually settles money. The comment said "keep the two in sync"; they were
> not. The live copy had **no retry cap** (a failing supplier re-attempted on every webhook
> redelivery, forever) and **ignored its own `supplier_orders` lookup error**, which made it place a
> **second supplier order** for a transaction that already had one — defeating the idempotency design
> that exists precisely because PayMongo retries webhooks.
>
> Both are fixed in the repo and **inert until you redeploy that one function**. Nothing else changed
> in it, and there is no deploy-order constraint.
>
> *Honest severity:* `CREDIT_SUPPLIER` is still `mock`, so no real registry order could have been
> duplicated yet — but `refund_purchase`, which both copies call, reverses a real ledger, and these
> guards must exist before a supplier is wired rather than after.
>
> **#4 is done.** `20260801000100` is applied and was verified by probing the live REST endpoint
> rather than trusting the dashboard: the RPC returns `200 []` to an anonymous caller where a
> non-existent function returns `404 PGRST202` (run as a control). That proves both that it exists and
> that it fails closed. Receipts can now name the counterparty — a display name only, and only to a
> party of that transaction.
>
> 🆕 **Also new, and worth a run when convenient:**
> [`rpc_positive_suite.sql`](../supabase/diagnostics/rpc_positive_suite.sql) — the positive half of
> the integration tests. `rls_negative_suite.sql` proves an attacker is stopped; this asks whether the
> *legitimate* path still works against the live schema, and whether the books reconcile. Everything
> runs inside a transaction that ends in `ROLLBACK`, so it writes nothing. Probes that would pass
> vacuously report `UNPROVEN` rather than `PASS`.
>
> **#2's deploy half is closed.** ⚠️ **Re-opened 2026-08-05 — that host now 404s; see the top of this
> page.** The paragraph below was true when written and is kept because *how* it was verified is the
> method that later caught the outage. PR #14 is merged and `carbonify13.vercel.app` was **verified by
> fetching it** — it serves `sw.js` at `CACHE_VERSION = 'v4'` and a bundle containing
> `policy_acceptances`, neither of which existed on the old `main`. So the router fix is live: a
> farmer can no longer reach `/admin` by typing the URL. The consent gate, onboarding guides, KYC
> document viewer and PWA fixes shipped with it. **What remains under #2 is purging or labelling the
> leftover test data** before a pilot user can buy a fake credit.
>
> ⚠️ **One thing to not misread:** `main`'s CI now shows a red X on the `deploy` job —
> `Input required and not supplied: vercel-token`. That secret has never been set, and that job has
> never run in this repo's history. **Your actual deploy is the Vercel GitHub integration, and it
> succeeded.** Either set the three `VERCEL_*` secrets or delete the job.
>
> **#1 is the one people skip, and it is the one that can strand a pilot seller's money.** Escrow is
> live and the Terms already promise sellers a hold window. The *releaser* is proven; what escrow does
> to a real purchase is not. A pilot seller whose money is stuck permanently is the worst outcome this
> beta can produce.
>
> Anything still open on the build side is quality and product work, routed in
> [OPEN_WORK_REGISTER.md](OPEN_WORK_REGISTER.md) Lane 1 — **none of it gates go-live.** The long pole
> remains the **independent penetration test** (Step 6a), which is external and is not needed for a
> test-mode pilot but *is* needed before live payment keys.
>
> ### 🧭 2026-08-04 — the build side has run out of things it can do without you
>
> Worth saying plainly, because for weeks this page could assume more code was coming. P5 and the
> automated accessibility pass closed the last two in-repo items that needed **no decision from
> anyone**. Everything still open on the build side is now one of:
>
> - **waiting on a decision of yours** — #21, #37, #18, #27, #31. Building either way before the
>   call is made is the work most likely to be thrown out, and for #21 and #37 the *wrong* choice is
>   actively harmful, which is why both were pinned with tests and written up rather than guessed;
> - **deliberately declined** — #30's dead-export cleanup is churn with a real regression budget;
> - **not a coding task** — load testing belongs before scaling, and manual screen-reader testing
>   needs a real person with a real screen reader.
>
> **So the bottleneck is now entirely on this page.** The two things that actually move the project
> are **item 0 (deploy)** and **item 1 (the four escrow checks)**. Neither takes long; both have
> been the top of this list for a while.

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
| [`supabase/diagnostics/policy_consent_verification.sql`](../supabase/diagnostics/policy_consent_verification.sql) | 🆕 Any time you want to confirm the consent box is shown **once per user per version** — and that the UNIQUE index enforcing that is still there |

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

> ## ✅ RESOLVED 2026-07-31 — both auth settings are now correct
>
> Re-measured off `GET /auth/v1/settings`: **`disable_signup: false`**, **`mailer_autoconfirm: true`**.
> Registration works and signs the user straight in, with no email in the loop. The historical record
> of the problem is kept below because the *lesson* is the point — the settings were documented the
> opposite way round for weeks and nothing re-measured them.
>
> ⚠️ The remaining trade-off: with confirmation off, **anyone can register with an address they do not
> control.** Acceptable for a closed pilot with invited people. Re-enable confirmation — which needs
> the verified sender domain, Step 6b — before any public launch.
>
> <details>
> <summary>The original 2026-07-29 finding (kept for the lesson)</summary>
>
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
> </details>
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
- [x] ✅ **Signups enabled** (`disable_signup` = `false`) — measured 2026-07-31
- [x] ✅ **Email confirmation turned OFF** (`mailer_autoconfirm` = `true`) — the route taken instead of
      buying the domain first. New users are signed in immediately with no email involved, which
      avoids the worst combination (signups on + confirmation required + no verified sender).
- [ ] **Sender domain verified** — no longer blocks the beta, but still blocks the 8 stub emails and
      the MRV reminders, and is what would let confirmation be turned back on. Step 6b.
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

Full procedure: [SOFT_LAUNCH_RUNBOOK.md §3](SOFT_LAUNCH_RUNBOOK.md). **Hand out two documents:**
[UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) (what they do) and
[TEST_REPORT_FORM.md](TEST_REPORT_FORM.md) (what they send back).

> **Before you invite anyone, run `OWN-01…10` yourself** — Part 1 of the test script. It is the same
> pre-flight as Step 2 above, in tick-box form. **`OWN-08` (signups accepted) went green on
> 2026-07-31**, so the gate is now **`ESC-01…06`** (Part 2) — escrow is live and promising sellers a
> hold window that nobody has yet watched behave on a real purchase. A pilot seller whose money is
> stuck permanently is the worst outcome this beta could produce.
>
> `TEST_REPORT_FORM.md` §F is yours, not the testers' — it records which diagnostics you ran, and
> **whether the `escrow_hold_days_card` value you lower for `ESC-03` was put back**.

- Invite **8–15 people covering all seven roles**, including at least one real farmer and one LGU
- ✅ **Signups are ON and email confirmation is OFF** (measured 2026-07-31) — an invited person
  registers and is signed straight in, with no email in the loop. Nothing here blocks the invites.

### Brief every pilot user on these four things

1. **Payments are in test mode.** Test card `4343 4343 4343 4345`, any future expiry, any CVC. No real
   money moves.
2. **Credits are not registry-backed.** A retirement produces a Carbonify certificate, **not** a
   Verra / Gold Standard registry receipt. Not usable for compliance or statutory ESG reporting.
3. **VAT invoices are provisional** — not BIR-accredited, and they carry **no buyer TIN**, so a company
   cannot claim input VAT on them.
4. **There is no confirmation email — that is expected.** `mailer_autoconfirm` is on, so registering
   signs them in immediately. Tell them so, or someone will sit waiting for a link and report it as a
   bug. The flip side is worth saying out loud to *you*, not to them: **an address nobody verified can
   register**, so only invite people you actually know. Confirmation goes back on before public
   launch, once the sender domain is verified (Step 6b).

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
4. **Then turn email confirmation back ON** in Supabase Auth (`mailer_autoconfirm` → `false`). It is
   deliberately **off** today (measured 2026-07-31) so the pilot does not depend on mail that has no
   verified sender. Turning it on before the domain is verified puts every new user behind Supabase's
   shared default SMTP — rate-limited and spam-filed — which is the worst of the three states. Domain
   first, then this.
5. Tell me it's done — I'll wire the remaining 8 emails through the Resend function

### 6c. The commercial / legal track

| Who | Ask for | Unblocks |
|---|---|---|
| **SEC Philippines** | Legal entity registration | Everything commercial |
| **BIR** | Registration + accredited receipts | Invoices stop being watermarked PROVISIONAL |
| **A tax advisor** | **Seller-of-record determination** — in a marketplace sale, is Carbonify the seller issuing on the developer's behalf, or an agent between two parties who each issue their own? | Whose TIN goes on a seller invoice (#22). **A tax question, not an implementation choice** — nobody on the build side should guess it. |
| **PayMongo + a licensed PSP/EMI** | Live keys + a custody arrangement | Real money. Gated on 6a. |
| **National Privacy Commission** | DPO appointment + registration, **plus a ruling on analytics consent: opt-out or opt-in?** (#37) | Export/deletion already ship; only registration is outstanding. The consent question now has a working switch behind it, so it is answerable rather than academic |
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
| 🆕 **Which notification-preference surface survives?** | There are **two live ones and they disagree** (#37): twelve toggles in `localStorage` from the preferences page, four on `profiles.notification_preferences` from the profile page. **Neither is read by anything that sends** — that column has zero hits across all of `supabase/`. Pick one before anyone builds enforcement, or shipping it makes the disagreement visible instead of merely latent. |
| 🆕 **May analytics consent default to ON?** | A **DPA question, not an implementation choice** (#37) — opt-out vs opt-in. It is `true` today only because that is what the switch already showed users. Ask the DPO / NPC track in 6c. Nobody on the build side should guess it. |
| ~~**Merge PR #14?**~~ | ✅ **Merged 2026-08-01** — 153 commits. `main` is current and production runs it. |
| **Provider layer: route through it, or delete it?** | ~40 tests overstate money-path coverage (#21). 🔴 **Sharper as of 2026-08-04:** the provider's webhook signature check had **no replay protection** where the live one enforces a 300s window — and its five tests passed by signing with a **November 2023** timestamp. Routing through it as it stood would have silently weakened the money path with every test green. Now fixed and pinned both sides, so the decision is safe to make either way — but **two copies have drifted twice, in opposite directions**, which argues for picking one rather than keeping both. |
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
