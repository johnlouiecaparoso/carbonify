# Carbonify — Open Work Register

> **Created 2026-07-28.** One question: **who can actually do each open item?** Everything still open
> is routed into exactly one of three lanes — 🤖 **in-repo** (code/docs, no external dependency),
> 👤 **owner** (needs a dashboard, a key, a live DB, or a business decision), 🏢 **third party** (needs
> an external firm, regulator, or vendor).
>
> ### This file holds routing, not status
>
> **Do not record status here.** Each row links to the doc that owns the detail, and that doc stays
> authoritative:
>
> | Source | Owns |
> |---|---|
> | [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) | Numbered items #1–#31 — the reasoning and the close-out plan |
> | [role-needs/](role-needs/README.md) | Per-role feature gaps, with priority + effort |
> | [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) | The real-money gate and the go/no-go checklist |
> | [TESTING_PLAN.md](TESTING_PLAN.md) | What is and is not automated |
> | [EXPANSION_FEATURE_AUDIT.md](EXPANSION_FEATURE_AUDIT.md) | Sub-item gaps inside "shipped" features |
> | [GAP_ANALYSIS.md](GAP_ANALYSIS.md) | The 2026-07-25 expansion workstream, Built/Partial/To-build |
> | [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) | The pilot pre-flight and click-through |
> | [HANDOFF.md](HANDOFF.md) § *Consolidated status* | 🆕 **2026-08-04** — implemented vs not, and the one-table answer to *"is this ready to go live?"*. Start there if you want the whole picture rather than a lane |
>
> Routing changes rarely; status changes constantly. Duplicating status across files is what produced
> the drift the 2026-07-26 reconciliation pass had to clean up. **If a row here disagrees with its
> source doc, the source doc wins.**
>
> **Scope:** open items only. Closed work (#13c, #14 decided, #17, #19, #26, #29) is not repeated —
> see the backlog.
>
> **Worked 2026-07-28:** #11 (slice half), #10 and #9 are closed — struck through below for one
> revision, then to be removed. Suite **757 → 770**. The lesson from #11 is worth carrying: its
> backlog entry described a cosmetic symptom, and the actual impact was a **wrong number on an
> exported ESG report**. Severity in these entries is a starting point, not a finding.
>
> **Worked 2026-07-29:** **#26's two follow-ups and #29 are closed** — the whole "sharpest ethical
> item" block at the bottom of this page. Suite **770 → 786**. One migration,
> `20260729000100_feedstock_payment_record.sql`, and **everything built is inert until it is applied**
> — so this moves an item from Lane 1 into the Lane 2 pre-flight rather than off the board.
>
> The finding worth carrying: **the structural blocker was avoidable.** #26 recorded that a feedstock
> dispute needs a schema change to `disputes`, and that reading is what made it look like a phase of
> work. It does not — recording the disagreement on the delivery, where it happens, closes it without
> touching the credit-side dispute table at all. An entry that names a specific blocking change is
> still only one proposed route to the outcome.
>
> **Reconciled 2026-08-01:** §2a steps **4** and **4b** still read 🔴 *"Not confirmed done"* — the
> payout worker scheduling and the three edge-function redeploys. **Both were completed and verified
> on 2026-07-30**, and both HANDOFF and YOUR_ACTION_ITEMS recorded them that day; only this page
> carried the stale 🔴. Corrected, and split out the part that genuinely *is* still open — the
> **frontend deploy**, now step 4c.
>
> This page states it holds routing rather than status, and the two rows above are what that rule
> exists to prevent: a routing doc that names a red blocker is read as status whatever its header
> says. **A row that says "not confirmed done" is itself a claim that needs re-measuring** — the same
> class as every other defect on this project, reached from the doc side.
>
> **Worked 2026-08-02 (evening) — the cross-role UX pass.** Suite **1138 → 1173** (99 files), merged
> to `main` and deployed. It closed a ~50-item user-reported list across all six roles, and **Lane 2
> is now empty of migrations**: the owner applied `20260802000300/000400/000500/000600/000700` and
> redeployed `paymongo-webhook` the same day, all verified by probe except #4's constraint validation
> (not readable through the anon API — recorded as the owner's word).
>
> Three defects surfaced that no backlog entry had predicted, all found while doing something else:
> analytics rendering **invented placeholder data** as if it were the user's portfolio; **every
> download in the app** able to fail silently; and a sidebar link that could never highlight. Two of
> the three were user-visible on the paid plan.
>
> > The routing lesson: **all three were found by working through a UX list, not by auditing.** A
> > register of known items cannot route work nobody has written down yet, and the highest-severity
> > findings today were in that category. Lane 1 being short is not the same as Lane 1 being done.
>
> **✅ Closed 2026-08-05 — the database half of Lane 2 is empty.** All five `20260804*` migrations are
> applied, **all three** money edge functions redeployed and `main` pushed. The pre-flight audit
> returned 5 rows and both findings are closed; the one that mattered was **D**, which was breaking
> every profile save on production and had never been reported. Detail in [HANDOFF.md](HANDOFF.md)
> § *2026-08-05*.
>
> > ✅ **And the frontend is live too — at `carbonify-gilt.vercel.app`, not the URL every doc named.**
> > `carbonify13.vercel.app` 404s since the GitHub repo was renamed; Vercel had created the project
> > as `carbonify-gilt` because it appends a random word when the name is taken. **The pipeline was
> > never broken.** Verified across all 106 deployed chunks.
> >
> > **The routing lesson, and it is the sharpest one this page has recorded.** Every lane on this
> > register describes work on the *codebase*. The deploy **target** is not in the codebase, not in
> > the database, and not in any document — it lives in a third-party dashboard, and no artifact in
> > this repo could have produced it. It was surfaced by fetching a URL after a push that reported
> > success, and *resolved* only when the owner supplied the address in one message.
> >
> > Two claims were made in between that the evidence did not support: that the responding host was
> > the known `ecolink` project (it was a third, unaccounted-for one), and that **no deployment
> > existed** — which nine hostname guesses cannot establish. *A negative result from an enumeration
> > is a statement about the enumeration.* The site was up the whole time. Now checkable with
> > `node scripts/analysis/verify-deploy.mjs <url>`.
>
> **⚠️ Historical — Lane 2 was NOT empty of migrations.** The money-path defect
> pass added **five (`20260804000100`–`000500`) plus three edge-function redeploys**, routed 👤 owner.
> *(Corrected 2026-08-05 — it said two. `paymongo-checkout` was modified by the pass and named in no
> deploy instruction anywhere, which would have shipped four of the five fixes and silently left the
> wallet top-up suspension guard on the floor.)*
> The ordered list lives in [HANDOFF.md](HANDOFF.md) § *DEPLOY STATE*; the decisions the pass
> deliberately did **not** take are [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) **#38–40**.
>
> One of the five, `20260804000500` (certificates RLS), is **🔒 gated** on a pre-flight query rather
> than simply pending — and one item routes to **neither lane cleanly**: `profiles` has no tracked
> SELECT policy, and closing that needs an owner query *first* and then in-repo work to convert six
> cross-user reads. It is #39, and it is the only open item on this page whose lane depends on an
> answer nobody has yet.
>
> > The same routing lesson, from the money side this time. **None of the five were on this
> > register.** Two were guards that existed on one purchase path and not its sibling; one was a
> > branch that had never once executed. A green suite, lint 0 and a working deploy were all true of
> > every one of them. *The register routes what has been written down; it cannot route a rule nobody
> > encoded.*
>
> ~~One branch is open and unmerged: **`fix-mobile-cart-and-earnings`**~~ — ✅ **merged 2026-08-03**
> (`43ea63a`). Every branch in this repo is now merged into `main`, and `main` is level with `origin`.
>
> **Worked 2026-08-05 — the measurement pass.** Suite **1278 → 1296** (111 → 114 files), lint 0,
> build green, all pushed and live. Three migrations applied and **verified by probe**
> (`20260805000100/000200/000300`). What is worth carrying is not the list but where the findings
> came from: **every one came from re-measuring a row that already said DONE.**
>
> - the accessibility row said *"0 violations, WCAG 2.1 AA"* — it meant the **seven public routes**.
>   The authenticated shell had never been scanned. Sweeping it found the **account menu was a
>   `<div>`, so a keyboard-only user could not sign out**, on every page for every role — which axe
>   cannot detect and never will;
> - `access_posture_audit.sql` was recorded as answering the `profiles` read posture. Its check is a
>   **string match against `true`**, which any equally permissive policy passes silently. The
>   behavioural probe that answers it did not exist. Built; it **falsified #39's premise** — there is
>   no user directory — and then a per-role version found the **verifier console naming nobody**;
> - a routine *"is it live?"* anon probe after a migration found **seven SECURITY DEFINER functions
>   callable by `anon`**, because `revoke … from public` does not remove Supabase's explicit `anon`
>   grant. The ratchet that should have caught it asked whether *a* revoke existed — its own failure
>   message had said `from public, anon` since the day it was written. **The intent was right and the
>   assertion was weaker than the intent**;
> - and re-running one old migration **silently reverted the money path**. Caught only because it was
>   mentioned out loud.
>
> > The routing lesson, and it is a different one from 08-02's. That pass concluded *a register
> > cannot route work nobody has written down*. This one is sharper: **the register's own ✅ rows are
> > unmeasured claims.** Four independent findings today, all inside rows marked closed. Lane 1 was
> > not short of unblocked work; it was short of re-measured ones.
>
> **Worked 2026-08-05 (evening) — the Supabase advisor sweep, and a routing failure this page has now
> made twice.** Seven migrations (`20260805000400`–`001000`), applied to live and **re-probed**:
> `node scripts/analysis/verify-anon-exposure.mjs` → 23/23 PASS signed out. Detail in
> [HANDOFF.md](HANDOFF.md) § *2026-08-05 (evening)*; what the sweep deliberately left is
> [DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) **#41–45**.
>
> **Worked 2026-08-06 — the role-approval failure, and the notification audit behind it.** Two
> migrations (`20260806000100`–`000200`) applied to live, `send-approval-email` redeployed, and the
> exposure harness re-probed at **25/25 PASS** signed out (two checks added for the new notification
> helpers). Four bugs fixed in the approval path, all of them silent; the audit that followed found
> **nine services notifying nobody** and closed eight of them with triggers. Detail in
> [HANDOFF.md](HANDOFF.md) § *2026-08-06*; what it deliberately left — AML, and the missing
> `audit_logs` FK — is [DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) **#47** and the section above it.
>
> **The routing failure first, because it is this page's own subject.** All seven were applied to the
> database and left **uncommitted** — so for several hours production was protected by policies that
> existed on live and in no repository, while this register, HANDOFF and YOUR_ACTION_ITEMS all still
> said escrow was the only open item. On 2026-08-05 (morning) this page recorded the identical
> lesson — *"work that is not committed is not in Lane 2; it is still in Lane 1, and this register
> cannot see it"* — and the same day it happened again, in the harder direction: **applied to live,
> absent from git.** Committed `29c9fd2`.
>
> > **A register cannot route what it cannot see, and it cannot see the database.** Every lane here
> > describes work on the codebase. Twice now the real state has been somewhere else — in a Vercel
> > dashboard on 08-05 (morning), in `pg_policies` on 08-05 (evening). *The repo, the database and
> > the deploy are three separate states; agreement between any two says nothing about the third.*
>
> **The findings themselves, in one line each.** `public.projects` carried `USING(true) WITH
> CHECK(true)` for ALL roles, so a signed-out stranger could delete every project in the registry —
> and the advisor rated that **WARN** while four of its nine **ERRORs** were empty superseded tables.
> Two `SECURITY DEFINER` views handed an anonymous caller 2 wallet balances and 16 credit holdings.
> Three tables took inserts from anyone. The `avatars` bucket was listable, and filenames are
> `${userId}_${timestamp}`, so the listing was a roster of user ids. Then a second round found the
> hole in the first: three anon-callable `SECURITY DEFINER` functions wrote to `audit_logs` **as
> owner**, walking around the policy just added — **a table's RLS is not sufficient while a DEFINER
> function will do the write for you.**
>
> 🆕 **And one checklist item was wrong in six documents: `public-registry` is not deployed.** The
> pre-flight said *"8 edge functions deployed"*; the gateway says seven, control-tested. It is an
> ungated white-label scaffold nothing in `src/` calls, so **the checklist was wrong, not the
> deployment** — and running that check for the first time during pre-flight would have invited the
> owner to publish an unauthenticated public API to make a box tick. Now reads **7 required**, with
> the eighth routed to **2b** as a decision. *An unrun check does not become true by being copied
> forward six times.*
>
> **And then the day's second silent revert, which is the one that changes how this page should be
> read.** `20260606000500` was replayed against live and reverted `reconcile_financials()` to a
> definition missing check #6. Repaired and confirmed by measurement — `widened_check_present =
> true`, **0 rows against 14 completed transactions**.
>
> > **Why it is worse than the morning's escrow revert, and it is not about severity.** The escrow
> > revert would have produced a *visible* wrong result — `ESC-02` failing, a tester filing a
> > confident false bug. This one produces **the correct-looking answer**: a reverted
> > `reconcile_financials()` returns *"no rows — healthy"*, byte-identical to a healthy database. The
> > daily money check this register routes the whole pilot through would have gone on reassuring
> > everybody while the part that speaks had been removed. *A monitor that fails silent reports
> > success.*
>
> **The fix is the first control on this project that is not advisory.** All 27 superseded
> migrations already carried a ⚠️ banner, and `migrationSupersession.test.js` enforced it — both
> working exactly as designed, and neither could ever have helped: **the banner is inside the text
> you select-all and copy.** It travels with the paste rather than standing in the way of it. The 16
> money-path migrations now open with an **executable** guard that queries `pg_proc` for a marker
> unique to the current definition and raises before any statement below it runs, naming the
> recovery file. Applying in order from empty is unaffected. ✅ **Proven on live the same day** — the
> owner pasted the exact file that caused the morning's revert and the database refused it, with the
> raise coming from the guard block, before the first `create or replace` was reached.
>
> > The routing lesson, and it is one this page has never recorded. Every previous entry here fixed
> > a **defect in the product**. This one fixed a defect in **how the product gets changed** — the
> > apply procedure itself, which appears in no lane, has no owner, and produced two production
> > incidents in a single day. *The riskiest surface on this project today is not code that runs; it
> > is a person pasting a file into an editor.*
>
> **Worked 2026-08-04 — the pre-pilot defect hunt.** Suite **1185 → 1256** (110 files), build green,
> lint 0, no migrations. **#35 is CLOSED**, and the decision it was parked on turned out not to be
> needed.
>
> > ⚠️ **Routing note: the whole 2026-08-04 pass is committed but NOT pushed.** Held at the owner's
> > instruction, so the work sits in **Lane 2 (owner)** as a deploy, not in Lane 1 as code. Nothing
> > here needs a migration — pushing `main` is the whole of it. Tracked as YOUR_ACTION_ITEMS item 0.
>
> > 🔎 **Corrected 2026-08-05, and it is a routing failure rather than a status one.** The *defect
> > hunt* above was committed. The *money-path pass* that landed later the same day was **not** — it
> > was still uncommitted in the working tree while four documents, this one included, routed it to
> > Lane 2 as an owner deploy. **Work that is not committed is not in Lane 2; it is still in Lane 1,
> > and this register cannot see it.** This page's rule is that it holds routing and not status; what
> > this shows is that routing *depends* on a status, and nobody measured that one. Committed
> > 2026-08-05, along with three ratchets closing a hole in the escrow fix itself — see
> > [HANDOFF.md](HANDOFF.md) § *2026-08-05*.
>
> **Eight further defects, none of which any entry on this page predicted:**
>
> - the production bundle **replaced `window.fetch`** and named each metric after the full request
>   URL — query strings included — forwarding them to GA the moment a measurement ID is set;
> - an **abandoned cart checkout deleted an unpaid item** from the basket on the buyer's next
>   successful payment, and told them it had been purchased;
> - **search history was keyed by device, not by account**, so the next person to sign in was shown
>   the previous person's search terms — #35's own defect in a neighbouring branch, found by asking
>   "what else is keyed this way?" after fixing the cart. One grep of `localStorage.setItem`;
> - **the homepage onboarding guide was dismissed per device and never reset**, so the first person
>   to close it closed it for every account that signed in on that machine afterwards. The panel is
>   role-specific, so an admin dismissing it silently denied the next farmer or LGU their own
>   quick-start. Found by re-running that same grep **exhaustively** instead of stopping at its first
>   hit — a pattern with six instances rarely has exactly six. Its sibling `FirstRunGuide.vue` had
>   keyed by user id all along, with a docblock explaining why;
> - `wallet_topup_user_id` was **written and never read** — a guard that existed only as decoration;
> - the payment confirmation screen **threw inside its own render** if the provider omitted `amount`;
> - **the "allow analytics" consent switch did nothing.** All six privacy controls appear in exactly
>   two places — the store's defaults and the form that writes them — and nothing reads any of them.
>   Now honoured (backlog **#37**, which routes the rest: the remaining controls need server-side
>   enforcement and a schema, and the opt-in/opt-out default is an NPC/DPO call, not a build one).
>   **#37 also records two *live* notification-preference surfaces that disagree** — twelve toggles
>   in `localStorage` and four on `profiles.notification_preferences` — neither of which is read by
>   anything that sends. The database-backed one is the more dangerous, because a populated column
>   on `profiles` reads to an auditor as a feature that works.
> - **the webhook signature check had no replay protection** — in `PayMongoProvider`, the copy #21
>   proposes adopting. The live edge function enforces a 300s window; this one never looked at `t`.
>   Its five tests passed by signing with a **November 2023** timestamp, performing the replay rather
>   than simulating it. Fixed and pinned on both sides; see #21, which this materially changes.
>
> > The routing lesson, again and more sharply than on 08-02: the analytics defect was reachable in
> > **no** development environment. `isEnabled` is `import.meta.env.PROD`, so it was absent from
> > `npm run dev`, absent from vitest, and present in `dist/`. **Build green, lint 0 and a full green
> > suite can all be true of a bug that only exists once deployed** — the second such case in two
> > days, after the CSP font outage. Reading the built bundle is now part of the check.
>
> **The consent gate was re-reported and the database came back clean.** Every check PASS; 0 accounts
> without a row, 7 on the current version, 0 stranded under another. The service worker was ruled out
> too (`networkFirstShell` — navigations fetch fresh, cache only offline). The explanation that fits
> every number is that the gate shows **once per account** and six or seven accounts were signed into
> in a row, which is the designed behaviour.
>
> > Two real defects were fixed anyway, neither of them the reported symptom: the service could
> > report success for a row it could not read back (INSERT and SELECT are separate policies, so
> > writable-but-not-readable is a reachable state), and **the diagnostic could not detect the thing
> > it was most likely to be run about** — §6 counted acceptances against the newest row's version
> > rather than the app's. *The clean result above only means something because those checks now
> > exist.*

---

## 🤖 Lane 1 — In-repo (no external dependency)

### 1a. Defects — a user gets a wrong result today

| # | Issue | Source |
|---|---|---|
| ~~11~~ | ~~Retirements dropped from transaction history~~ — ✅ **fixed 2026-07-28.** It was under-reporting **ESG offset totals**, not just a short list | [#11](DEFERRED_BACKLOG.md) |
| ~~11~~ | ~~**The ESG report read a table nothing writes**~~ — ✅ **CLOSED 2026-08-01**, the dual-source half. The entry called this "a data-model question — which table is canonical". It was not: **nothing writes `credit_purchases`**, and that was the ESG report's only purchase source, so the exported PDF printed **"Credits purchased (lifetime): 0"** for every buyer. #11's failure mode a *third* time — and the two earlier fixes were both made **in this same function** without either asking whether the table had rows. Owned/retired/by-project were always correct. Name collision closed by renaming the other copy to `getPurchaseAndRetirementHistory` | [#11](DEFERRED_BACKLOG.md) |
| 🆕 | ~~**A failed retirements read told RetireView "you have retired nothing"**~~ — ✅ **fixed 2026-08-01.** `getUserRetirementHistory` sits on a function that logged the retirements error and stepped over it, then re-swallowed everything in an outer catch returning `{purchases: [], retirements: [], all: []}`. On the retirement screen, to a user who had retired credits. Also deleted a `credit_purchases` "fallback" that logged *"✅ Found purchases"* and discarded the rows behind a `// TODO` | [#15](DEFERRED_BACKLOG.md) |
| 🆕 | ~~**A failed wallet read rendered as "no transactions"**~~ — ✅ **fixed 2026-08-01.** `walletService.getTransactions` looked up `wallet_accounts` with `.single()`, which returns an **error** for zero rows — so `if (walletError || !walletAccount) return []` had to collapse "no wallet yet" with "the read failed", swallowing real failures onto the money screen. `WalletView`'s `allSettled` rejected branch was dead code for it, the fourth view this week. Now `.maybeSingle()`. The other ~12 `error || !row` sites were checked and **all throw** — imprecise wording, not silent | [#15](DEFERRED_BACKLOG.md) |
| ~~33~~ | ~~**`ProjectForm` submits through a three-service cascade**~~ — ✅ **removed 2026-08-01.** The evidence settled it: path 2 duplicated path 1's validation, and **path 3 had none** — `estimated_credits: -5` was accepted on the third try — spread the raw form object into the insert, and hardcoded `status: 'pending'`, so a **draft** reaching it was promoted into the review queue and notified reviewers. *A fallback more permissive than the thing it backs up is the validation being optional.* The nine name collisions remain as a ratchet baseline | [#33](DEFERRED_BACKLOG.md) |
| ~~10~~ | ~~Keyboard users cannot Escape a payment dialog~~ — ✅ **fixed 2026-07-28** via `v-modal-a11y` on all 15 dialogs (not by adopting `AccessibleModal`; see the entry for why) | [#10](DEFERRED_BACKLOG.md) |
| ~~15~~ | ~~**Nullable-client guard copy-pasted ~162×**~~ — ✅ **fixed at the root 2026-08-01.** `getSupabase()` returned `null` while an async init was in flight, so "is Supabase available?" depended on *when* you asked. Now synchronous; a null means the env is misconfigured, nothing else. **This row's own prescription — "delete the guards" — was wrong**: the count was never the defect, the two SHAPES were (94 `throw` vs 31 `return []`), and with the race gone the guards are correct | [#15](DEFERRED_BACKLOG.md) |
| ~~15~~ | ~~**`errorStore` is commented out**~~ — ✅ **the premise was false, confirmed 2026-08-01.** `ErrorBoundary` is mounted and uses it in full; the `main.js` monkeypatches went 2026-07-29. Two stale `// Temporarily disabled` comments were all that survived | [#15](DEFERRED_BACKLOG.md) |
| ~~3~~ | ~~A receipt cannot show the counterparty's name~~ — ✅ **built 2026-08-01**, `20260801000100`. `SECURITY DEFINER`, **name only**, only to a party of that transaction; `profiles` RLS untouched; `search_path` pinned; PUBLIC execute revoked. **⚠️ Owner must apply the migration** — the client degrades to `null` until then | [#3](DEFERRED_BACKLOG.md) |
| ~~15~~ | ~~**Error handling: the remaining half**~~ — ✅ **CLOSED 2026-08-02**, by scanning every `catch` / `if (error)` in `src/services` instead of waiting for the next report: **40 candidates, 7 fixed, the rest deliberately left degrading.** The sharpest was `getAllSettings` — a failed read rendered as **platform fee 0%, min KYC level 0, both fees ₱0** in editable admin inputs beside an enabled Save button, so one click writes those zeros into live config and turns off the KYC gate on trading. SystemConfigView's *"Do not save those sections"* banner had been unreachable the whole time: **the fifth view this week whose error handling was written and could never run.** Also `findDuplicateEvidence`, where `[]` is what *suppresses* the duplicate alert — a failed fraud check reading as a clean one, on the screen where credits are approved | [#15](DEFERRED_BACKLOG.md) |
| 🆕 | ~~**A failed settings read was savable back into live configuration**~~ — ✅ **fixed 2026-08-02.** See above. The rule this leaves: **when a view handles a rejection, check that its service can produce one** — a handler is evidence of intent, not of behaviour | code |
| 🆕 | ~~**The notification bell was an open redirect**~~ — ✅ **fixed 2026-08-02.** `Header.vue` navigated with `window.location.assign(notification.link)`, and `link` is stored data that **any signed-in user can write into anyone else's feed** (see #36). An absolute URL there is an in-product phishing link aimed at whoever opens the bell, staff included. Now constrained to a root-relative path by [`safeInternalPath`](../src/utils/safeInternalPath.js). ⚠️ **The RLS half is NOT fixed** — that is [#36](DEFERRED_BACKLOG.md) and needs a migration plus ~18 call sites moved behind an RPC | [#36](DEFERRED_BACKLOG.md) |
| 39 | ~~**The verifier's review thread attributed every developer message to "User"**~~ — ✅ **fixed 2026-08-05**, migration `20260805000200`. Found by measuring the staff read posture per role: admin `FULL`, **verifier `*** NONE ***` — 0 of 6**. `ProjectCommentThread` is mounted inside `ProjectApprovalPanel`, which is what `/verifier` renders, so **on the screen where a verifier asks a developer for evidence before approving credits into existence, the other party had no name.** Symmetric — the developer saw the verifier's replies the same way — and silent, because RLS *filters* the embed rather than erroring, so the service's deliberate `throw` never fired and `'User'` looked like a chosen default. Now a name-only RPC scoped to the thread, authorisation mirroring `project_comments_select`. ⚠️ **Owner must apply the migration** | [#39](DEFERRED_BACKLOG.md) |
| 39 | ~~**A developer's asset ledger named none of its buyers**~~ — ✅ **fixed 2026-08-05**, migration `20260805000100`. Found by *measuring* rather than reading: probes 9–10 of the negative RLS suite returned `0 of 6` foreign profile rows, so `getBuyerProfiles`' direct `profiles` read returned nothing and every counterparty on the ERPA-facing buyer list rendered **"Unknown buyer"**. Its error branch **could not fire** — RLS filters rather than erroring — so the handler covered the failure that does not happen. Now a `SECURITY DEFINER` RPC returning names only, for buyers the caller has a completed sale to. ⚠️ **Owner must apply the migration**; until then the ledger degrades exactly as before, but now says so | [#39](DEFERRED_BACKLOG.md) |
| 🆕 | ~~**The analytics page showed INVENTED data as the user's own portfolio**~~ — ✅ **fixed 2026-08-02.** `categoryChartData` was seeded with five hard-coded categories at shares `[35,25,15,15,10]`. Those rendered as a finished doughnut **before any fetch resolved** and **stayed** if the load failed or the account had never bought anything — so a buyer on the **paid** plan could read a confident breakdown of a portfolio they do not own, on the page they upgraded for, and take a disclosure decision from it. Now starts empty with an empty state. **The rule: placeholder data that is visually indistinguishable from real data is worse than an empty state** — it is the swallowed-read family, but louder, because invented numbers look *more* trustworthy than a blank panel | code |
| 🆕 | ~~**Every download in the app could silently never happen**~~ — ✅ **fixed 2026-08-02.** All **eight** call sites revoked the object URL in the same tick as `a.click()`. The click only *schedules* the download; the browser reads the blob afterwards, so a synchronous revoke can cancel it — no error, no console warning, nothing to report but *"I clicked export and nothing happened"*. Timing-dependent, hence intermittent, hence it survived eight copies. Five services each held a byte-identical `triggerDownload`; three more inlined it. **Fifth instance of this repo's signature pattern — a correct fix applied to one branch and not its siblings.** Now one `utils/download.js` | code |
| 🆕 | ~~**"User guide" could never highlight in the sidebar**~~ — ✅ **fixed 2026-08-02.** `/guide` was missing from the path list the active-link resolver matches against, so the one item you were standing on stayed unlit. Same commit: "Take a tour" drew a UA button border because the reset was scoped to `.nav-item--logout`, and the tour is a `<button>` too | code |
| ~~26~~ | ~~The farmer "Paid" flag is a one-sided assertion rendered as fact~~ — ✅ **fixed 2026-07-29.** The record is two-sided; the badge reads "buyer says paid" until the farmer answers | [#26](DEFERRED_BACKLOG.md) |
| ~~26~~ | ~~A feedstock dispute is structurally impossible~~ — ✅ **fixed 2026-07-29**, and **without** widening `disputes`: the disagreement is recorded on the delivery and escalates to `/admin/feedstock` | [#26](DEFERRED_BACKLOG.md) |
| 🆕 | ~~**One payment could activate two subscription periods**~~ — ✅ **fixed 2026-07-30.** The webhook's subscription branch guarded with a read-then-act `status === 'paid'` check while `activate_subscription()` is *additive*. PayMongo delivers both `checkout_session.payment.paid` and `payment.paid` (distinct event ids → both clear event-level dedup), so two deliveries granted two periods. Now uses the same atomic claim the wallet branch already had | code |
| 🆕 | ~~**`verify` accepted any checkout session id, unauthenticated**~~ — ✅ **fixed 2026-07-30.** `paymongo-checkout`'s `action:'verify'` ran before any auth check and returned the raw PayMongo session — payer billing name/email/phone, amounts, line items. Session ids travel in redirect URLs and history, so they are not secrets. Now requires a JWT, checks the caller owns the intent, is rate-limited, and no longer returns the raw session blob | code |
| 🆕 | ~~**A completed erasure could be recorded as still pending, forever**~~ — ✅ **fixed 2026-07-30.** `account-deletion` claimed rows with an unconditional UPDATE, so two overlapping runs both called `deleteUser()`; the loser's "User not found" reset the row to `pending`. Now an atomic claim, matching `mark_payout_processing()` | code |
| 🆕 | ~~**An admin could not view a KYC ID document at all**~~ — ✅ **fixed 2026-07-31.** "View ID document" opened a blank tab with nothing in the console, on the screen whose job is reviewing them. `id_document_url` holds a **`data:` URI** (`KycView` uploads via `readAsDataURL`) and browsers **block top-level navigation to `data:`** — anti-phishing, since 2017. Now rendered in-place, where the same URI works, with zoom/rotate | code |
| 🆕 | ~~**The KYC review card was three columns**~~ — ✅ **fixed 2026-07-31.** `.app-card` was `display: flex` with three children, so the AML button sat marooned mid-card and the notes input was squeezed until its placeholder truncated — taking the *"rejection requires notes"* rule with it. The AML row was added later as a third sibling without updating the container. Now an ordered ①②③ workflow | code |
| 🆕 | ~~**Every accessibility toggle was a placebo**~~ — ✅ **fixed 2026-07-31.** `applyAccessibilitySettings()` added `.high-contrast` / `.large-text` / `.reduced-motion`; **zero rules styled any of them.** It also read `accessibility.reducedMotion`, which nothing ever wrote — the visible switch is "Animations", writing `display.animations`. Six settings are now real; Theme, **Currency** (offered USD/EUR/GBP/JPY while nothing converts), date/time format, items-per-page and two fake a11y toggles were removed | code |
| 🆕 | ~~**The PWA safe-area rule had never matched an element**~~ — ✅ **fixed 2026-07-31.** It targeted `.app-header` / `.app-shell-header`, neither of which exists — the real classes are `.header` and `.sidebar`. Meanwhile `viewport-fit=cover` *was* extending content under the notch, so an installed PWA drew its header beneath the status bar. Same shape as the router guard | code |
| 🆕 | ~~**Offline, every icon rendered as a word**~~ — ✅ **fixed 2026-07-31.** Material Symbols renders by ligature and the SW never cached cross-origin, so with no font the UI showed the literal words *"check_circle"*, *"menu_book"*. Now `&display=block` plus a cache-first strategy for the two font origins, accepting opaque responses | code |
| 🆕 | ~~**`/home` overflowed on every phone**~~ — ✅ **fixed 2026-07-31.** `.stats-grid` declared `repeat(4, 1fr)` in its BASE rule — measured **697px wide on a 390px screen**. The `@media (min-width: 768px)` block restating the same value is what gave the intent away. Found by `responsive.spec.js`, not by reading CSS | code |
| 🆕 | ~~**Any signed-in account could open `/admin` by URL**~~ — ✅ **fixed 2026-07-31.** `router.beforeEach` has two paths into an authenticated navigation; the second — restore the session straight from Supabase when the store is cold (hard refresh on a deep link, or `fetchSession()` throwing) — called a bare `next()`, skipping the MFA check, all five role guards, `disallowedRoles` and the plan gate. Reproduced: a farmer lands on `/admin`. Both paths now call one `enforceAuthenticatedAccess()`. **Client-side gate only — RLS still stood behind it**, so this is broken access control, not a data breach | code |
| 🆕 | ~~**A failed marketplace read rendered as "no credits available"**~~ — ✅ **fixed 2026-07-31.** `getMarketplaceListings` returned `[]` on error, on the buyer's primary surface. Three callers already had error states, all dead code. `OrdersView` is the counter-example worth keeping: it opts out **explicitly** with `.catch(() => [])` because there listings are only title enrichment — the caller decides an absence is tolerable, not the service | [#15](DEFERRED_BACKLOG.md) |
| 🆕 | ~~**The `[]`-on-error class in the two compliance queues**~~ — ✅ **fixed 2026-07-31.** `listScreenings` (AML) returned `[]` for a failed read, and with `status:'open'` that renders as *"no subject awaits a compliance decision"*; `getWatchlist` did the same, so screening ran against a silently-empty list and **matched nobody**. `listDataSubjectRequests` did it to the **DPA erasure queue**, where every row has a statutory clock — the same shape as the misnamed `ACCOUNT_DELETION_SECRET`, reached from the frontend. Plus `getMyDataRequests`, `getMyOfftakes`, `getMyDataRoomActivity`, `listProjectComments` | [#15](DEFERRED_BACKLOG.md) |
| 🆕 | ~~**Six more `[]`-on-error reads, all with a caller already waiting to catch**~~ — ✅ **fixed 2026-07-31.** `listKybApplications` (*"No pending applications"* while a seller's withdrawals stay locked), `listAllDisputes`, `listRecentTransactions`, `getMyDisputes`, `getMyOrders`, `getUserCertificates` (*"you have retired nothing"* — and it triggered `generateMissingCertificates()` for a user who had them). Four of the six callers had catch branches that were **dead code**, same as `BuyerDashboardView`'s was | [#15](DEFERRED_BACKLOG.md) |
| 🆕 | ~~**The register page had no link to the Terms at all**~~ — ✅ **fixed 2026-08-01.** Zero mentions of "Terms", "agree" or "legal" in 483 lines, while the Terms say *"by creating an account you agree to these Terms, the Privacy Policy, and the Carbon Credits Policy"*. The footer carrying those links is `v-if="showHeader"`, which **excludes** `login`/`register`/`role-application` — so people agreed by signing up to documents the page gave them no way to open. Now three links dispatching `OPEN_POLICY_EVENT` into the one modal `App.vue` already renders. **Not** a checkbox: the first-sign-in gate is what records consent against a version | code |
| 🆕 | ~~**A failed portfolio read rendered as "you own nothing"**~~ — ✅ **fixed 2026-07-30.** `getUserCreditPortfolio` / `getUserTransactionHistory` swallowed errors and returned `[]`. Worst case was the ESG export: a failed retirements query produced a downloaded report stating **zero offsets**. All three callers already handled rejection — `BuyerDashboardView`'s `holdingsRes.status === 'rejected'` branch was dead code | [#15](DEFERRED_BACKLOG.md) |
| 🆕 | ~~**…and the fix missed RetireView, while claiming to cover it**~~ — ✅ **fixed 2026-08-01.** `getUserCreditPortfolio` existed **twice**, reading the same `credit_ownership` rows; the 2026-07-30 fix landed on the `creditOwnershipService` copy and its comment named RetireView as already covered. RetireView imported the **marketplaceService** copy, which still returned `[]` — so a database outage read as *"you own no credits to retire"* and that view's error banner was dead code. Duplicate deleted; wiring pinned by `duplicateServiceReads.test.js` (mutation-checked). **A fix's own claim about its callers is not a measurement of them** | [#11](DEFERRED_BACKLOG.md) |

### 1b. Cleanups and hardening

| # | Item | Note |
|---|---|---|
| 41 | 🆕 **Draft projects are readable signed out** | `20260805000400` deliberately changed **writes only**, so anon still reads all 7 project rows, drafts included — which contradicts `projectWorkflowService.js`'s own comment that a draft is the developer's private workspace. Not folded in because **narrowing a read can empty a screen**, and the marketplace, registry and project-detail pages all read this table while signed out. Needs a pass over those read paths first, then roughly `status <> 'draft' OR user_id = auth.uid() OR staff` |
| 42 | 🆕 **Client-side audit logging is self-asserted** | `20260805000600` stopped anonymous and cross-user forgery of `audit_logs`; it did **not** make the trail trustworthy. A signed-in caller can still write truthful-looking rows about themselves, and pre-auth events — failed sign-ins, blocked registrations, the exact things an auditor asks for — cannot be captured from a browser at all. **Do not describe this table as an audit trail to a pilot partner** until capture is server-side |
| 43 | 🆕 **Four superseded tables are locked but still present** | `listings` / `orders` / `wallets` / `verifications` are the pre-rename originals. `20260805000700` enables deny-all RLS rather than dropping them, because a drop is irreversible and these objects were never tracked, so the repo cannot prove nothing external reads them. Dropping is the honest end state — two tables called `listings` and `credit_listings` is a bug waiting for a tired evening |
| 45 | 🆕 **Anon can ask the database for any user's role** 🟡 | `get_user_role('32bb632d-…')` returned `"general_user"` to a **signed-out** caller. With a user id — which the avatars bucket was handing out until `20260805000900` — that is account enumeration with role labels. ⚠️ **The one open exposure while invited users are on the system.** Deferred, not forgotten: the no-arg forms appear inside RLS policy expressions, which evaluate as the *querying* role, so a revoke catching the wrong overload empties the marketplace for signed-out visitors. Do it from a **policy dump**, per signature — Query C in [`definer_grant_surface.sql`](../supabase/diagnostics/definer_grant_surface.sql) |
| 44 | 🆕 **`get_email_stats` is not admin-gated** 🟢 | `20260805000800` takes `anon` off it; `authenticated` keeps EXECUTE because **the function body is not in this repo** and may already gate on `is_admin()`. Nobody has read it. Dump the definition and either confirm the gate or add one |
| ~~33~~ | ~~Three services own project writes~~ — ✅ **CLOSED 2026-08-02, and it was never an architecture problem.** `projectWorkflowService` had 9 methods and **1 reachable**; deleting the dead block closed 6 of the 9 collisions and ~420 lines. The other three had one live copy and one dead twin each. **Ratchet baseline is now empty.** ⚠️ The deletion broke the verifier's sign-in via a stale `.bind()` re-export — `undefined.bind` throws at module load, so the whole chunk dies. Build, lint and 957 unit tests all passed while it was broken; only a real-login Playwright test caught it. Guarded by `boundExportsResolve.test.js` | [#33](DEFERRED_BACKLOG.md) |
| 30 | **62 → 55 candidates**, re-derived by `node scripts/analysis/find-dead-exports.mjs`. **Worked 2026-08-02:** the seven `notify*` twins in `notificationService` are deleted — they duplicated five live database triggers, and `20260626000200`'s header records that the client-side version *was rejected by RLS and the bell never rang*, so calling one gave you either nothing or a double notification | **Exact-string edits only** — line arithmetic corrupted two files last pass; this pass used start/end string markers. The rest is deliberately left: the detector counts a symbol used only *inside* its own module as a candidate, so most of the remaining 55 want the `export` keyword removed rather than the function deleted, which is churn with a real regression budget (see the 08-02 `.bind()` outage) and no user-visible gain |
| ~~9~~ | ~~Consolidate duplicated formatters~~ | ✅ **Done 2026-07-28** — `src/utils/format.js`; three real divergences fixed, incl. money rendering at one decimal place |
| ~~15~~ | ~~The nullable-client guard is copy-pasted ~162×~~ — ✅ **root cause fixed 2026-08-01.** `getSupabase()` is synchronous, so a `null` now means "misconfigured", never "you asked too early". **The instruction in this row — "then delete the guards" — was wrong** and is recorded as such: the count was never the defect, the two SHAPES were (94 `throw` vs 31 `return []`), and with the race gone the guards are correct and rare | [#15](DEFERRED_BACKLOG.md) |
| ~~15~~ | ~~**Fulfillment saga exists twice**~~ — ✅ **drift FOUND and fixed 2026-08-02.** They were not in sync. The live TS port had **no retry cap** and **ignored its `supplier_orders` lookup error**, so a transient read failure made it place a **second supplier order** — defeating the `transaction_id UNIQUE` idempotency design. The tested JS copy is imported by nothing. Pinned by `fulfillmentSagaParity.test.js`, mutation-checked. 🔴 **Inert until `paymongo-webhook` is redeployed** |
| ~~15~~ | ~~Runtime schema-probing / drift retry~~ — ✅ **removed 2026-08-02, on measured evidence.** It was not just dead weight: a failed insert was retried with up to **16 fields deleted**, including `methodology`, `additionality_type`, `permanence_years` and `reversal_risk` — so a project was created unassessable and nobody was told. All 16 columns probed live: every one `200`, against a control returning `400 42703`. Guarded by `noSilentColumnDrop.test.js` |
| ~~12~~ | ~~Grant hygiene on ~10 `SECURITY DEFINER` RPCs~~ — ✅ **written 2026-08-02**, `20260802000100`. **It is not ~10: 89 SECURITY DEFINER functions, 39 with no revoke** — 15 trigger functions (not a reachable surface) and 24 callable, which the migration covers. Per-function role lists, because 7 of them are called from inside RLS policies and a policy is evaluated as the *querying* role, so revoking `anon` there breaks anonymous reads. Ratcheted by `securityDefinerGrants.test.js`, mutation-checked | ✅ **APPLIED 2026-08-02, verified by probe** — `anon` now gets `401 42501` on the admin RPCs, the public reads still `200`, and eight anonymous table reads are clean (the failure mode that mattered: 7 of these are called inside RLS policies) |
| ~~4~~ | ~~`VALIDATE CONSTRAINT` the two `NOT VALID` FKs~~ — ✅ **written 2026-08-02**, `20260802000200`. **It is four constraints, not two FKs**, and the two the entry omitted are the interesting ones: `credit_ownership_qty_nonneg` (the backstop against retiring or selling the same carbon unit twice) and `kyc_level_requested_range`. `NOT VALID` means neither was **ever checked against pre-existing rows** — so "has a holding ever gone negative?" is unanswered, and this migration is the first thing to ask it | ✅ **APPLIED AND VERIFIED 2026-08-05** — `convalidated = true` for `credit_ownership_qty_nonneg`. It had been "reported run" since 08-02 and was the **last claim on this board resting on recollection rather than a probe**. The answer to "has a holding ever gone negative?" is now no, checked against every pre-existing row |
| ~~5~~ | ~~Prettier **breaks the build** on multi-statement inline Vue handlers~~ — ✅ **unblocked 2026-08-02.** The blocker was **seven attribute values in one file**, all the same shape, now one named `onNumericInput(field)`. Repo-wide scan: zero multi-statement template handlers remain. Proven by running `prettier --write` then `npm run build` | ⚠️ **Prettier still NOT enabled** — one file produced a **3383-line** diff, so turning it on repo-wide is a formatting-policy decision and belongs in its own commit. Owner's call |
| 27 | **i18n — scoped 2026-08-01: ~375 strings** across the farmer + LGU surfaces | ⚠️ **The blocker is translation CONTENT, not code** — Filipino renderings of *escrow*, *retirement*, *feedstock*, *dispute* are terminology decisions with legal weight. Moved to an owner decision; a half-translated UI is worse than English-only. See [#27](DEFERRED_BACKLOG.md) |
| ~~P3~~ | ~~Derive `payment_intents.user_id` from the verified JWT, not the request body~~ | ✅ **Already done** — verified 2026-07-30. All four `paymongo-checkout` actions call `getVerifiedUserId(req)` and `throw` when it is null; the body's `user_id` is never read. Only a stale *comment* said otherwise. This row was the doc drifting, not the code |
| ~~P5~~ | ~~Migrate wallet top-ups onto `payment_intents`~~ | ✅ **CLOSED 2026-08-04 — and the server half had been done for a long time.** The checkout function already wrote `purpose: 'wallet_topup'`, the webhook already credited the balance from it, `paymongo-reconcile` already swept every intent *without filtering on purpose*, and `paymongo-resettle` already healed top-ups by name. **The stated benefit — consistent reconciliation — was therefore already being delivered while this row said the work was open.** What actually remained was the callback page, which still decided *"was this a top-up?"* from a `localStorage` key: the last branch in the money path chosen from browser storage. Now read from the intent, with the key kept only as a fallback. Same class as the two YOUR_ACTION_ITEMS rows reconciled on 08-04 — **a register row is a claim, not a measurement** |

### 1c. Test coverage — the gap is not unit tests

| Item | State | Source |
|---|---|---|
| **Negative RLS suite** | ✅ **RE-RUN 2026-08-05 — 7 PASS, 3 UNPROVEN, 0 FAIL** (was 5/3/0 on 07-30). Every write attack blocked: mint credits, reprice another seller's listing, forge a retirement, mint wallet money, self-promote to admin. 🆕 **Two profile read probes added and both PASS — `0 of 6` foreign rows visible**, which **falsifies [#39](DEFERRED_BACKLOG.md)'s premise**: no signed-in user can enumerate the user table, so the privacy exposure it described is not present. ⚠️ The actor is deliberately a **non-admin**, so the staff read path is still unmeasured — pin `<ACTOR_USER_ID>` to an admin to settle it. 🆕 **The victim-selection fix worked, re-run same day: 8 PASS, 2 UNPROVEN, 0 FAIL.** Picking the victim **by how much there is to steal** rather than by age moved to a different account (`wallets=1`) and turned probe 6 from UNPROVEN into a real **PASS — `0 of 1` foreign wallet rows visible**. Wallet read isolation is now *proven* rather than merely undisturbed, for the first time in three runs. **Probes 7-8 remain UNPROVEN, and that is now a measured fact about the database rather than a bad pick**: the suite selects the richest available victim, and the richest has `holdings=0, third-party trades=0`, so **no account on live holds credits or has traded with a third party**. Those two resolve themselves when the pilot creates the first holding and the first trade — nothing to do until then | [TESTING_PLAN §1.2](TESTING_PLAN.md) |
| **Staff read posture** | ✅ **RUN 2026-08-05** — [`staff_profile_reads.sql`](../supabase/diagnostics/staff_profile_reads.sql), read-only, finds an admin and a verifier itself, **nothing to edit**. It answers the half the negative suite structurally cannot: that file impersonates a NON-admin on purpose, so all three of its runs said nothing about staff. **Result: admin `FULL` (6 of 6), verifier `*** NONE ***` (0 of 6)**, own-row control passing for both. The admin consoles were never affected; **the verifier console was**, and that found a live defect — see 1a | [#39](DEFERRED_BACKLOG.md) |
| **Integration tests (positive RPC path)** | 🟡 **written 2026-08-01, owner-run**: [`rpc_positive_suite.sql`](../supabase/diagnostics/rpc_positive_suite.sql). Everything inside a transaction ending in `ROLLBACK`; probes that would pass vacuously report `UNPROVEN`. Needs the live DB | [TESTING_PLAN §1.2](TESTING_PLAN.md) |
| Playwright **required in CI on a seeded backend** | 🟡 **46/47 green** (was 38/44 with 6 failures nobody saw — the CI job is `continue-on-error`). Still not required, still not seeded | [TESTING_PLAN](TESTING_PLAN.md) intro box |
| **Backend-configuration checks** | ✅ **new layer 2026-07-29** — `pilot-readiness.spec.js`. Found two beta-blocking auth settings | [TESTING_PLAN §1.9](TESTING_PLAN.md) |
| **Guard *behaviour*, not guard metadata** | ✅ **new layer 2026-07-31** — `routerGuardBypass.test.js` drives the real router with a cold store. `routeAccess.test.js` asserts that `/admin` carries `requiresAdmin`; nothing asserted the guard **reads** it, which is how a whole branch that checked nothing survived. **Generalise this**: an assertion about configuration is not an assertion about enforcement | [TESTING_PLAN §1.2](TESTING_PLAN.md) |
| **Consent lifecycle, not just its parts** | ✅ **new layer 2026-08-01** — `policyShownOnce.test.js`, 8 tests. `policyConsent.test.js` covered the read and the write in isolation; nothing asserted the **sequence** (no row → box → accept → reload → no box). Runs it against an in-memory table enforcing the same `UNIQUE (user_id, policy_version)` index. **Mutation-checked**: removing `.eq('user_id', …)` turns two tests red. Owner-side half is [`policy_consent_verification.sql`](../supabase/diagnostics/policy_consent_verification.sql) | [TESTING_PLAN](TESTING_PLAN.md) |
| **Responsive layout, MEASURED** | ✅ **new layer 2026-07-31** — `responsive.spec.js`, 37 tests at 320/390/768/1024/1440. Found the `/home` overflow that reading the CSS had not. `html { overflow-x: clip }` hides overflow rather than scrolling it, so `scrollWidth` would have passed while content was unreachable — it measures element geometry instead. ✅ **Authenticated half added 2026-08-01** — [`responsive-authenticated.spec.js`](../src/test/e2e/responsive-authenticated.spec.js), 22 tests, which found **three real layout bugs at 320px** on its first honest run. Its first version reported 22/22 passing having measured NOTHING (`page.goto` reloads, and the DEV mock session lives only in the store) — caught by a `measured.length > 0` assertion added because a green that has never been red proves nothing | [TESTING_PLAN](TESTING_PLAN.md) |
| ~~**`localStorage` in unit tests is a no-op**~~ | ✅ **fixed 2026-08-02, by DELETING the mock.** happy-dom already provides a real `Storage`; the stub was pure loss. **It was worse than "stores nothing":** `Object.keys()` on it returned `['getItem','setItem','removeItem','clear']` — and that is exactly what `userStore.clearLocalStorage()` iterates, so the sign-out/expiry clear matched nothing, removed nothing and could not fail a test. `sessionStorage` was never stubbed, so the two halves of one loop behaved differently for months. Two new files pin what was previously untestable: [`authStorageClearing.test.js`](../src/test/store/authStorageClearing.test.js) (7) and [`cartPersistence.test.js`](../src/test/store/cartPersistence.test.js) (10, the cart had **no** tests at all). Both mutation-checked in both directions | [TESTING_PLAN](TESTING_PLAN.md) |
| **The apply procedure itself** | ✅ **new layer 2026-08-05 (evening)** — [`migrationReplayGuard.test.js`](../src/test/services/migrationReplayGuard.test.js), 7 tests, mutation-checked in two directions. Every other row in this table tests the **product**; this one tests **how the product gets changed**, which produced two production incidents in one day and appears in no lane on this page. The 16 money-path migrations now refuse to execute when a newer definition is live. The assertion that carries the weight is *"the marker can actually fire"* — present in the newest definition, **absent from every earlier one** — because a guard whose marker also appears in the old file passes review and never once aborts. **It found a real defect on its first run: in itself.** ✅ Proven on live | [HANDOFF](HANDOFF.md) |
| **Load / performance** | ❌ not done | before scaling, not before soft launch |
| **Accessibility** | 🟢 **automated pass CLOSED 2026-08-04** — [`accessibility.spec.js`](../src/test/e2e/accessibility.spec.js), 18 tests, axe-core 4.10.3 against **WCAG 2.1 A + AA** in real Chromium (contrast needs layout, so happy-dom cannot check it). **0 violations on the 7 public routes.** Found and fixed: no `main` landmark ANYWHERE in the app, every route sharing one `<title>`, an ARIA-invalid combobox, three unnamed carousel buttons, and four contrast failures. ⚠️ **Automated checks catch roughly a third of WCAG** — green here means no *machine-detectable* violation, not that a screen-reader user can complete a purchase. **Manual/AT testing remains open** | [TESTING_PLAN](TESTING_PLAN.md) |
| **Accessibility — the authenticated half** | 🟢 **CLOSED 2026-08-05** — [`accessibility-authenticated.spec.js`](../src/test/e2e/accessibility-authenticated.spec.js). The row above said "authenticated routes are not yet covered", and that was the whole finding: **the 08-04 green described the marketing pages.** Four roles × the ten routes each role's nav actually offers ≈ 40 page-audits. **0 violations now; on the first run every authenticated page failed.** The bell had no accessible name; the account menu was a `<div>`, so **a keyboard-only user could not sign out** — which **axe cannot detect and never will**, and was caught only by asserting the control *opens*. Four contrast defects each spanned many pages at once, all of them a *translucent* value over the brand green — including a `:deep()` rule in the shared `PageHeader` that outranked every view's own button style | [TESTING_PLAN §1.8](TESTING_PLAN.md) |

> ⚠️ **#21 — ~40 tests overstate money-path coverage.** The `services/credits|payments|payouts`
> provider layer is imported **only by tests**. `paymongoWebhookSignature.test.js` tests signature
> verification against `PayMongoProvider`, while the code that actually guards live money is inside
> `supabase/functions/paymongo-webhook`. A green suite is not evidence here.
>
> > 🔴 **2026-08-04 — and that overstatement had already poisoned the decision.** The provider's
> > signature check had **no replay protection at all**, where the live function rejects anything
> > outside a 300s window. All five of its tests signed with a **November 2023** timestamp and
> > passed — performing the replay rather than simulating it. So "route the money path through this
> > layer" was not a neutral option: it would have silently dropped replay protection, with every
> > test staying green. Provider fixed to match, signature tests **5 → 11**, plus an 8-test
> > `webhookSignatureParity.test.js` pinning the live copy's guards and asserting both tolerance
> > constants are the same number. Mutation-checked in four directions. **Two copies have now
> > drifted twice, in opposite directions** — the strongest argument yet for resolving #21 either
> > way rather than maintaining two implementations by hand.

### 1d. Per-role feature gaps

Detail, priority and effort live in [role-needs/](role-needs/README.md) — this is the routing index only.

| Role | Open gaps |
|---|---|
| **Buyer** | RFQ / bulk-quote flow for volume buyers · recurring auto-offset · genuine PWA/offline pass |
| **Developer** | **MRV reminders are client-triggered — a developer who never signs in is never emailed** · persist + display financials & yield projection · boundary polygon + methodology selection · registry-readiness checklist / export pack · custom monitoring metrics · project templates & cloning · document re-upload & versioning |
| **Admin** | Fraud / risk dashboard with anomaly alerts · report builder with date ranges · broadcast announcements · feature flags & maintenance mode · project moderation / takedowns · support impersonation + bulk ops |
| **LGU** | Benchmarking against other LGUs (now feasible — `profiles.municipality` exists) · diversion → project origination |
| **Farmer** | ~~Dispute path~~ ✅ 2026-07-29 · indicative feedstock pricing from `biomass_rfqs` · delivery-due reminders · offline field capture |
| **Cross-cutting** | ESG reporting is **credit-owner side only** · the public `/registry` is a certificate lookup, **not a national registry** |

### 1e. Blocked only on an owner decision — I build the moment it's made

| # | Item | The decision |
|---|---|---|
| ~~29~~ | ~~Read-only admin feedstock view~~ | ✅ **Built 2026-07-29** — `/admin/feedstock`, read-only plus a record-the-outcome action |
| ~~26~~ | ~~ToS + in-app modal stating the records-layer position~~ | ✅ **Built 2026-07-29** — ToS §1.14 + modal §6, landed together |
| 28 | Notify an LGU when a project appears in its jurisdiction | Must be jurisdiction-scoped and **fail closed** |
| ~~24~~ | ~~Verifier's own decision history~~ | ✅ **Built 2026-08-02 — and the decision it was waiting on turned out not to block it.** The choice was framed as "convenience view (an afternoon) vs attestation record (schema)". It needed **neither an afternoon of scaffolding nor a schema**: every decision was already in `audit_logs`, and 20260722000300 already let verifiers read project-scoped rows. Nobody had ever queried that table **by actor** instead of by subject. `MyDecisionsPanel` + `getMyVerificationDecisions` + a CSV export whose timestamps are ISO-8601 UTC, because the file is evidence. ⚠️ It is the *convenience view*: it reports what was logged, and is not a signed attestation — if an accreditation body ever needs non-repudiation, that is still the schema conversation |
| ~~31~~ | ~~Farmers reach checkout by URL but aren't offered it~~ | ✅ **Decided + built 2026-07-30. A farmer is a SELLER, not a buyer** — they supply feedstock and do not trade credits, same as a project developer. `ROLES.FARMER` added to `FINANCE_RESTRICTED_ROLES`. Zero nav regression: `isBuyerRole()` already excluded farmers and their sidebar never offered those 10 routes — **only the router guard disagreed**, which is the contradiction #31 was actually about |
| ~~32~~ | ~~**Google and phone sign-in are advertised in the UI and disabled on the backend**~~ | ✅ **fixed 2026-07-30 — and the decision no longer blocks anything.** Rather than pick one of the two answers, the forms now ask GoTrue `/auth/v1/settings` which providers are enabled and render accordingly (`useAuthProviders`). Enable Google in the dashboard and the button appears with **no redeploy**; leave it off and nobody is offered a dead path. Fails closed |
| 37 | 🆕 **The preferences page's Privacy and Notification sections are placebos** | `allowAnalytics` is fixed; the other 17 controls are read by nothing. Needs server-side enforcement + preferences on the profile row, **not** a client patch. The opt-in/opt-out default is a 🏢 **DPA/NPC call** (Step 6c) |
| 21 | Provider layer imported only by tests | Route through the seam, or delete 11 files + port the signature test |
| 25 | Reviews aren't assigned; concurrent reviewers invisible | Claimed vs merely advertised |
| ~~35~~ | ~~**The cart survives sign-out, so a shared device hands it to the next person**~~ | ✅ **CLOSED 2026-08-04 — the decision was a false blocker.** The cost that made this a choice ("clearing loses a legitimate basket") belonged to option (a) only; option (b), namespacing per user id, never had it. What neither option named was the **guest bucket** — browse signed-out, then sign in to pay — so the guest cart now merges forward at sign-in and is emptied. Nothing discarded, nobody inherits anybody. **A second, worse cart defect surfaced while fixing it** (see 2026-08-04 above) | 
| 23 | Developer forward/projection view | An IRR in front of a project owner invites it into a funding conversation |
| 20 | **Cart charges once per listing, not once per cart** | Multi-seller escrow split — take it **with #14, not after** |
| 18 | Organization accounts, 5 phases | Phase 1 safe now; **Phase 2 must follow the beta** — it rewrites the same RPC as escrow |

---

## 👤 Lane 2 — Owner only

### 2a. The pilot pre-flight — the active next step

Full procedure in [SOFT_LAUNCH_RUNBOOK.md §1](SOFT_LAUNCH_RUNBOOK.md).

> ✅ **Updated 2026-08-05 — steps 0z and the whole 08-04 queue are closed.** `access_posture_audit.sql`
> was run (5 rows; both findings closed by `20260804000200`), all five `20260804*` migrations are
> applied, **all three** money edge functions are redeployed, and the frontend is live and
> chunk-verified at **`carbonify-gilt.vercel.app`** — not `carbonify13.vercel.app`, which 404s since
> the GitHub repo was renamed. **Step 5 below (`ESC-01…06`) is the only remaining functional gate**,
> with step 9's test-data purge alongside it.

0. ✅ ~~**Enable signups, and settle the sender domain first.**~~ — **done 2026-07-31.**
   `disable_signup=false`, `mailer_autoconfirm=true` (measured). Registration works and signs the user
   straight in with no email involved — the route taken instead of buying the domain first, and it
   avoids the worst combination of the three. ⚠️ Anyone can now register with an address they do not
   control; re-enable confirmation before any public launch.
   [YOUR_ACTION_ITEMS](YOUR_ACTION_ITEMS.md) Step 2.
1. Run [`pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql) → read the `verdict` column
   · then [`rls_negative_suite.sql`](../supabase/diagnostics/rls_negative_suite.sql) → every row must
   read PASS (**`UNPROVEN` is not a pass** — it means nothing existed to attack)
2. Dashboard checks **1c–1g by hand**: the **7 required** edge functions deployed (✅ measured 2026-08-05; the eighth, `public-registry`, is **deliberately not deployed** — do not deploy it to tick the box) · PayMongo in **test** mode, webhook **enabled** · `ALLOW_UNSIGNED_WEBHOOKS` unset · Sentry receiving · frontend deployed — all of it is `OWN-01…10` in [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) Part 1 if you want it as tick-boxes
3. ~~Apply escrow `20260725000200`~~ · ~~feedstock `20260729000100`~~ · ~~`20260718001100`~~ — ✅ **all applied 2026-07-29**, reconcile = 0 after each
4. ~~Deploy + set `PAYOUT_WORKER_SECRET` + schedule `process-payouts`~~ — ✅ **done 2026-07-30.**
   On `pg_cron` (`carbonify-process-payouts`, jobid 1, `*/15`, active) and **proven succeeding**, not
   merely scheduled: `net._http_response` row 1 is `200`. Verified three ways — correct secret → 200,
   wrong secret → 401, `GET` → 405. Its first run settled an 18-day-old payout that had been sitting
   in `requested` since 2026-07-12.
4b. ~~Redeploy three edge functions (2026-07-30 fixes)~~ — ✅ **done 2026-07-30.**
   `paymongo-webhook` (double-subscription), `paymongo-checkout` (unauthenticated `verify`) and
   `account-deletion` (erasure recorded pending forever) are deployed. The security fix was confirmed
   **against the running function**, using the public anon key as an outsider would:
   `POST {"action":"verify","sessionId":"cs_someoneElsesSessionId123"}` → `401 Authentication
   required`. `ACCOUNT_DELETION_SECRET` was also set under the correct name the same day.
   ⚠️ **The frontend half of this is still owed** — see step 4c.
4c. ~~Deploy the frontend~~ — ✅ **done 2026-08-01.** PR #14 merged (`c640f9c`); `main` went from 153
   commits behind to 0. **Verified by fetching production rather than by reading a green check:**
   `carbonify13.vercel.app` serves `sw.js` at `CACHE_VERSION = 'v4'` and a bundle containing
   `policy_acceptances` — neither of which existed on the old `main`. The router-guard fix, the
   consent gate, the onboarding guides, the KYC viewer and the PWA fixes are live.
   ⚠️ The deploy came from the **Vercel GitHub integration**. The `deploy` job in `ci.yml` failed
   with `Input required and not supplied: vercel-token` — that secret has never been set. Set the
   three `VERCEL_*` secrets or delete the job; do not read its red X as a failed deploy.
4d. ✅ **Re-deployed and re-verified 2026-08-05 at a NEW URL — `carbonify-gilt.vercel.app`.** The
   GitHub repo was renamed `carbonify13` → `carbonify`, which killed `carbonify13.vercel.app`; the
   Vercel project had been created as `carbonify-gilt` and had been building every push throughout.
   Verified by walking all **106** deployed chunks — `node scripts/analysis/verify-deploy.mjs <url>`.
   ⚠️ `carbonify.vercel.app` is a **different application that is also titled "Carbonify"**; do not
   send a tester there.
5. 🔴 **Run the escrow behaviour checks** — **still unrun, and the only remaining *functional gate*.** *(This said "the only open item on this entire register" until the evening of 2026-08-05, when the advisor sweep added #41–45. None of those gate the pilot, so the gate is unchanged — but "the only open item" was a claim about the board, and the board had moved.)* 🆕 Use **[OWNER_TEST_GUIDE.md](OWNER_TEST_GUIDE.md)** (yours) with **[TESTER_GUIDE.md](TESTER_GUIDE.md)** and **[TESTER_FEEDBACK.md](TESTER_FEEDBACK.md)** for the helpers: `ESC-01…06` needs a buyer, a seller and an admin acting in sequence, because each claim is visible on a screen only one of them can see. They carry owner set-up, a 16-step running order with handoff points, plain-language instructions per role, and a fill-in feedback form. ⚠️ **It corrects `ESC-03`, which could not have passed as written** — `hold_until` is stamped at purchase time, so lowering `escrow_hold_days_card` moves nothing, and a fresh purchase at `0` days creates no hold at all; the fix is to age the hold by id. Found by reading `20260725000200`, not by running it, so it would have cost a tester an afternoon and produced a confident false bug report. Background: [ESCROW_DECISION.md §6](ESCROW_DECISION.md)
6. ~~Confirm the 11 role-audit migrations (§0.4)~~ — ✅ **all eleven verified `true` 2026-07-29**
7. ~~Confirm the **`20260718000000`–`000700`** batch~~ — ✅ 4-arg `retire_credits_atomic` confirmed; the `available_credits` half is covered by the pre-flight §7 summary
8b. ~~**Accept the consent box once on a REAL account, and confirm the row landed**~~ — ✅ **DONE and
   verified 2026-08-02.** This step existed because `policy_acceptances` had **never held a row**, so
   "the write is broken for real accounts" and "nobody ever ticked the box" were indistinguishable.
   They are now distinguished: [`policy_consent_verification.sql`](../supabase/diagnostics/policy_consent_verification.sql)
   returns **every check PASS**, with **7 users on the current version**, **0 accounts without a
   row**, and **0 rows stranded under an older version**. The write lands, it is readable, and the
   SELECT/INSERT policies plus the `authenticated` grants are all present.
9. Decide the **beta database** — reuse live (reconcile is clean) but purge or label leftover test data first
10. **Run the closed beta** — 8–15 invited users, every role, `reconcile_financials()` = 0 daily

> ✅ **2026-08-02 — the migration queue is empty.** `20260802000300` + `000400` (#36 notification
> spoofing), `000500`, `000600`, `000700` were all applied and `paymongo-webhook` redeployed on the
> same day. Five of the six were verified from here by anon probe; `20260802000200` (#4, validating
> the `NOT VALID` constraints) is **reported run but not independently verified** — constraint
> validity is not readable through the anon API. If you want that one settled:
> `select convalidated from pg_constraint where conname = 'credit_ownership_qty_nonneg';`
>
> ⚠️ **A probe reported the opposite of the truth first.** #36 was briefly recorded here and in
> HANDOFF as "confirmed still unapplied" on the strength of a `PGRST202`. The probe had **invented
> the argument names** — PostgREST resolves an RPC by name *and* argument names, so a wrong arg list
> returns the same code as a missing function. **Copy the signature out of the migration; never guess
> it.** A green control proves you reached the right database and nothing more.

### 2b. Decisions I cannot make for you

Org accounts go/no-go · public API exposure + key-gating · fee amounts · Business-tier value · blockchain / IoT · **is a farmer a buyer** · seller-of-record (then a tax advisor confirms) · DR/backup policy · every 1e row above.

### 2c. Repo and infrastructure

> 🆕 **Two Vercel items found 2026-08-01, both small and both yours:**
>
> 1. ~~**`ci.yml`'s `deploy` job fails on every push to `main`**~~ — ✅ **deleted 2026-08-02**
>    (`693eb47`), so this is **no longer an owner item**. It had never run: the three `VERCEL_*`
>    secrets were never set, and the Vercel **Git integration** was doing the real deploying all
>    along. Removed rather than fixed — setting the secrets would deploy **twice** per push and add a
>    second place for the deploy target to drift. `main` should now go green for the first time.
> 2. **A second Vercel project, `ecolink`, builds from this repo on every push** and serves an
>    unrelated *"Vite + React + TS"* app. `carbonify13` is production. Not a data risk, but it burns a
>    build per push and **`.vercel/repo.json` links this checkout to `ecolink`**, so a CLI
>    `vercel --prod` from the project folder would target the wrong project.
>
> 🆕 **2026-08-02 — the owner is redeploying and deleting `ecolink`, and finalising a domain.**
> Everything needed for that is in **[VERCEL_DOMAIN_AND_REDEPLOY.md](VERCEL_DOMAIN_AND_REDEPLOY.md)**.
> The headline, because it was the owner's actual worry: **a custom domain is never renamed by
> anything in git.** The only git-derived part of any Vercel hostname is the **branch name**, and it
> appears solely in *preview* URLs (`<project>-git-<branch>-<scope>.vercel.app`) — which is why a
> preview built from `fix-mobile-cart-and-earnings` reads like the link was renamed to a commit
> message. Commit messages and PR titles appear in no Vercel hostname at all.
>
> Recommendation on item 1: **delete the `deploy` job.** Keeping it alongside the Git integration
> deploys twice per push, and `VERCEL_PROJECT_ID` would need hand-updating whenever the project
> changes — a second place for the deploy target to drift, which is the very thing this cleanup is
> removing.

~~Decide on merging **PR #14**~~ — ✅ **merged 2026-08-01**, 153 commits; `main` is current and
production is running it · ~~set the three `VERCEL_*` secrets or delete `ci.yml`'s `deploy` job~~ —
✅ **job deleted 2026-08-02**; the Git integration was always the real deploy path ·
**delete the spare `ecolink` Vercel project and finalise the domain**
([VERCEL_DOMAIN_AND_REDEPLOY.md](VERCEL_DOMAIN_AND_REDEPLOY.md)) · buy + verify the
**email-confirmation domain** · adopt CLI migration tracking (#7) so live stops drifting from
`supabase/migrations/` · hold all keys and secrets.

### 2d. Content, not code

**Farmer training material** (expansion #6e) — the farmer portal is 5/6 and the missing item is a content problem: no module, content, route or table exists, and writing it needs domain knowledge, not a component.

---

## 🏢 Lane 3 — Third party only

| Item | Who | What it blocks |
|---|---|---|
| **Independent penetration test** | Security firm | 🔴 **The last P0** before live payment keys |
| Live PayMongo keys + licensed PSP/EMI arrangement | PayMongo + PSP | Real money |
| Legal entity registration | SEC Philippines | Everything commercial |
| BIR registration + accredited receipts | BIR | Invoices stay **provisional** until then |
| **Seller-of-record determination** (#22) | Tax advisor | Whose TIN goes on a seller invoice — *a tax question, not an implementation choice* |
| DPO registration + DPA program | National Privacy Commission | Export/deletion already ship; only registration is outstanding |
| AML program + sanctions screening feed | AMLC + data vendor | Screening needs a vendor feed |
| **Registry backing** (Verra / Gold Standard / CAR / ACR) | Registry + Carbonmark / Cloverly / Patch | Retirement yields a Carbonify certificate, **not a registry receipt** |
| Accredited verifier (VVB) status | Accreditation body | Granular per-VVB permissions |
| DENR / CCC accreditation, Carbon Pricing Framework | PH regulators | "Real carbon market" claims · national-registry linkage |
| Resend domain verification | Resend + registrar | Email confirmation **and all transactional email** — only the approval email sends; the rest are `console.log` stubs |
| Anthropic API key | Anthropic | AI Assistant is UI-only, no backend |
| Satellite / IoT sensor feeds | Data + hardware vendors | MRV dashboard stays 6/8 |

---

## The through-line

The **engineering** track is essentially clear. Both pre-live-keys code blockers are closed (#13c, #14
decided + staged), and Lane 1 is quality and product work — none of it gates go-live.

> **Updated 2026-08-04 — Lane 1 is now empty of *unblocked* work.** P5 and the automated
> accessibility pass closed the last two items that needed no decision. What remains splits into
> **decision-gated** (#21, #37, #18, #27, #31 — where building before the call is the work most
> likely to be discarded, and for #21/#37 the wrong choice is actively harmful), **deliberately
> declined** (#30's dead exports: churn with a real regression budget, and the 08-02 `.bind()`
> outage came from exactly this kind of tidying), and **not-a-coding-task** (load testing before
> scaling; manual screen-reader testing, which needs a real person).
>
> So the honest reading of this lane is no longer "more to build". **The next useful action on the
> project is a deploy and the escrow behaviour checks — both Lane 2.** A register that keeps
> offering engineering work when the bottleneck has moved is its own kind of stale.
>
> > 🔎 **Updated 2026-08-05 (evening) — and "Lane 1 is empty" was wrong a fourth time, from a source
> > no lane covers.** The Supabase **advisor** is a third-party linter reading the live database. It
> > produced, in one sweep, the most severe finding of the week: an anonymous stranger able to delete
> > every project in the registry. Nothing in this repo could have surfaced it, and no re-measurement
> > of any row here would have either — the defect was in an untracked policy that predates version
> > control. **Lane 1 is a list of work; the codebase, the database and the deployment are the
> > actual system, and only two of the three are in git.** Run the advisor periodically, and probe
> > every finding before ranking it: its worst ERRORs were empty tables and its WARN was the hole.

What gates go-live is Lanes 2 and 3. **The single longest pole is the penetration test**: it is
external, it costs money, and it is the one P0 that no amount of code closes.

The sharpest *ethical* item was never on the gate: **#26 + #29** — a farmer delivers a physical good
they cannot take back, the buyer alone asserts payment, no dispute can be represented in the schema,
and no admin console can see the trade. **Closed 2026-07-29.** The record is two-sided, the terms say
plainly that Carbonify does not hold the money, and a farmer who is not paid reaches staff who can see
the trade and reverse a false "Paid".

✅ **Live as of 2026-07-29** — applied alongside the escrow migration, `reconcile_financials()` = 0.
The remaining work on this path is a click-through, and the honest limit stands: Carbonify still does
not move the money, so a farmer's counterparty risk is reduced by transparency and escalation, not
removed.
