# Carbonify — Handoff (current state)

> ## 📍 Where we are — verified 2026-07-20 · role audit + hardening 2026-07-22 · UI consistency 2026-07-26 · consent gate fixed 2026-08-01 · cross-role UX pass 2026-08-02
>
> **Carbonify is a commercial Philippine carbon-credit registry and marketplace built for institutional users — project developers, corporate buyers, verifiers, and LGUs. It is feature-complete for the current product scope; the money path is hardened in code and verified against the live DB. Remaining work is mostly external, operational, or legal.**
>
> *(Repositioned 2026-07-25 — this is no longer an academic capstone. The two disclosed beta limits — credits not yet registry-backed, payments in test mode — are unchanged and remain disclosed in-app.)*
>
> **The next step is the closed beta on PayMongo test keys** — see [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) (execution), [TESTING_PLAN.md](TESTING_PLAN.md) (what to test), [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) (per-role scripts to hand to pilot users), and [TEST_REPORT_FORM.md](TEST_REPORT_FORM.md) (what they fill in and send back).
>
> **The two test docs were rewritten 2026-07-30.** The script previously had no coverage at all for the escrow hold window, the two-sided farmer payment record built 2026-07-29, the admin feedstock console, privacy/data rights, keyboard access, or the public no-login pages — six surfaces that are live and were going to be handed to pilot users untested. The escrow block (`ESC-01…06`) is the one to run first: escrow is switched on and the Terms already promise sellers a hold window, but nothing has yet checked what it does to a real purchase.
>
> Read [CARBONIFY_OVERVIEW.md](CARBONIFY_OVERVIEW.md) for the plain-language system map. Read [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) for the real-money launch gate.
>
> ### ✅ The owner's queue is clear — verified on live 2026-08-02
>
> 1. ~~`supabase functions deploy paymongo-webhook`~~ — **deployed by the owner 2026-08-02.** The
>    fulfillment saga's retry cap and its second-supplier-order fix are live.
> 2. ~~Apply `20260802000300` then `20260802000400`~~ (#36) — **APPLIED, verified by probe.**
>    `notify_counterparty` returns `401 42501 permission denied for function` as `anon`, i.e. it is
>    in the catalog with `EXECUTE` revoked from `public, anon`, which is exactly what the migration's
>    grant-hygiene block does. The notification bell can no longer be written by a client naming its
>    own recipient.
> 3. ~~Apply `20260802000200_validate_not_valid_constraints.sql`~~ (#4) — reported run by the owner
>    2026-08-02. **Not independently verified:** constraint validity is not readable through the anon
>    API, so this one rests on the owner's word rather than a probe. If it matters later, the check is
>    `select convalidated from pg_constraint where conname = 'credit_ownership_qty_nonneg';`
>
> ⚠️ **A probe told us the opposite of the truth first, and it is worth knowing why.** The initial
> check of #36 reported `PGRST202` and this document briefly recorded it as "confirmed still
> unapplied". The probe had **invented the argument names**. PostgREST resolves an RPC by name *and*
> argument names, so a wrong arg list returns `PGRST202` — **the same code as a genuinely missing
> function**. The rule for every future probe: **copy the signature out of the migration; never guess
> it.** A green control (`is_admin` → 200) proves you reached the right database and says nothing
> about whether you called the target correctly.
>
> ✅ **Nothing from the 2026-08-02 UX pass is waiting.** Its three migrations
> (`20260802000500` / `000600` / `000700`) are applied and verified.
>
> Everything else on the board is the owner's pilot work (escrow `ESC-01…06` first).
>
> ✅ **`20260802000100` (grant hygiene, #12) is APPLIED — verified by probe, not by trust.** As `anon`
> on live: `review_kyc_application`, `review_kyb_application` and `resolve_dispute` all return
> **`401 42501 permission denied for function`**, where before the revoke the call reached the body.
> The four public reads still return **`200`** with real rows, and eight anonymous table reads
> (`projects`, `credit_listings`, `app_settings`, `methodology_factors`, `profiles`,
> `policy_acceptances`, `monitoring_reports`, `project_comments`) are all **`200`** with no
> `permission denied for function` anywhere — which is the one failure mode that mattered, since seven
> of these helpers are called from inside RLS policies.
>
> **Current build state:** build green, lint 0, **1173 unit tests green across 99 files**
> (re-verified 2026-08-02, after the cross-role UX pass).
>
> *1173 includes the 121-case `modulesEvaluate` sweep — one assertion per module — added 2026-08-02,
> so it is not directly comparable to the 959 before it.*
>
> **Playwright: 46/46 public + 22/22 authenticated + 9/9 runtime smoke.** The authenticated spec is
> new on 2026-08-01 and found three real layout bugs at 320px on its first honest run; it is also the
> only thing that caught a module-load outage on 08-02 that build, lint and 957 unit tests all missed.
> `pilot-readiness.spec.js` is green now that signups are enabled on live.
>
> Unit-test history: 1173 · 1138 · 1131 · 1121 · 1104 · 1086 (08-02, incl. the module sweep) · 959 · 957 · 952 · 951 · 935 · 920 · 916 ·
> 908 (07-31) · 820 · 801 · 786 (before the 07-30 security pass) · 770 · 757 · 703 (before the 07-26
> role review) · 693 · 681 · 665 · 543 (07-22) · ~313 before that.
>
> *Run the suite with `--no-file-parallelism` — the parallel happy-dom worker init flakes on Windows
> and reports "no tests"; it is an environment issue, not a real failure.*
>
> ### 🆕 2026-08-02 (latest) — cross-role UX pass; analytics was showing invented data
>
> Suite **1138 → 1173** (99 files). Build green, lint 0. **Three migrations, ALL APPLIED and
> verified on live** — `20260802000500` (tour flag), `000600` (`support_reports`), `000700`
> (`admin_set_user_jurisdiction`).
>
> A single reported list of ~50 items, worked end to end across all six roles. Two things found on
> the way matter more than the list did.
>
> 🐛 **The analytics page was seeded with INVENTED DATA.** `categoryChartData` shipped five
> hard-coded category names at shares `[35, 25, 15, 15, 10]`. Those rendered as a finished doughnut
> **before any fetch resolved**, and **stayed on screen if the load failed or the account had never
> bought anything**. So a buyer on the *paid* plan could be shown a confident breakdown of a
> portfolio they do not own — on the page they upgraded for — and take a disclosure decision from
> it. It now starts empty and has an empty state.
>
> > The general rule this earns: **placeholder data that is visually indistinguishable from real
> > data is worse than an empty state.** It is the same defect family as the swallowed reads
> > (`return []` rendering as a fact about the user), but louder, because invented numbers look
> > *more* trustworthy than a blank panel rather than less.
>
> 🐛 **Every download in the app could silently never happen.** All eight call sites revoked the
> object URL in the same tick as `a.click()`. The click only *schedules* the download; the browser
> reads the blob afterwards, so revoking synchronously can cancel it — no error, no console warning,
> nothing to report but "I clicked export and nothing happened". Five services each carried a
> byte-identical `triggerDownload`; three more inlined it. **Fifth entry in the pattern this repo
> keeps hitting: a correct fix applied to one branch and not its siblings.** There is now one
> `utils/download.js`.
>
> **Structural change worth knowing about: the header is ONE row at every width.** It was two — a
> mobile layout and a desktop layout, each with its own brand group, and only the desktop one
> carried the avatar dropdown. That is the whole reason profile, preferences, KYC, wallet, the tour
> and the user guide were reachable on a phone only by scrolling to the bottom of the sidebar
> drawer. The sidebar's `.account-block` is **deleted**, and `AppSidebar.test.js` now asserts its
> absence deliberately — if you see that assertion and think it is stale, read it again.
>
> **New surfaces:** "Report a problem" for every role (it existed only on a receipt card, so
> verifier, LGU, farmer and developer could not report anything at all — new `support_reports`
> table, guided two-step form whose checklist is specific to the category chosen); verifier **My
> Decisions**; LGU **Endorsement Record**; portfolio **concentration** on analytics; `SmartSearch`
> on marketplace and registry.
>
> > The two record views needed **no migration**. Both read tables the role could already see —
> > asked by **actor** instead of by subject. Nobody had ever asked `audit_logs` "what did *I*
> > decide?", which is the first question an accreditation body puts to a verifier.
>
> **LGU accounts could not be created at all** — `lgu_user` was missing from the admin role
> dropdown. Jurisdiction is now captured where the role is granted, which matters because every LGU
> scoping surface *fails open* on a null municipality: an LGU with none sees and can endorse
> projects nationwide. `admin_set_user_jurisdiction` is a **separate** RPC on purpose — adding
> parameters to `admin_set_user_profile` would have broken editing *every* user on a database where
> the migration had not landed.
>
> **The repeated "dropdown is bigger than the box" complaint had one cause.** A native `<select>`'s
> popup is never narrower than its control but grows to fit its longest `<option>`. So an
> under-sized control with long labels *always* opens a list that overhangs it. Fixed by sizing
> controls to their content and shortening labels (e.g. `"<title> — <category>"` → title, with the
> category shown beneath), plus a global form-control baseline in `src/styles/form-controls.css`.
>
> ### 🆕 2026-08-02 — #36 confirmed on live, and the fix is staged
>
> Suite **1131 → 1138** (96 files). Build green, lint 0. **Two migrations, neither applied at the
> time of writing** — *both applied by the owner later the same day and verified by probe; see the
> owner's queue at the top.* **The order between them is load-bearing.**
>
> **The owner ran the query and it came back `(auth.uid() IS NOT NULL)`.** The notification-spoofing
> hole is real: any signed-in user can insert a row into any other user's bell.
>
> **The one-line fix would have been wrong.** `with check (auth.uid() = user_id)` closes it and
> breaks every legitimate cross-user notification — a farmer told their delivery was confirmed, a
> supplier told their quote was accepted, an admin told a payment is disputed. Ten call sites, all
> proper. The three that remain direct inserts are all **self-addressed** (MRV reminders,
> saved-search matches, watchlist price drops), and that is precisely what makes the tightening
> possible.
>
> **So the recipient stops being something the client can name at all.**
> `notify_counterparty(subject_type, subject_id, audience, payload)` reads the parties off a
> `biomass_rfq` or `farmer_delivery` row and works out who to tell. There is no "notify user X" entry
> point — a stranger cannot be reached, and an admin can only be reached by **escalation out of a
> trade you are actually in**. It also refuses a non-root-relative `link`, so the open-redirect rule
> now exists in the database and not only in the browser, and it returns 0 rather than erroring for a
> non-party so it is not an existence oracle.
>
> > **The structural insight that made this tractable:** every one of those ten notifications fires
> > immediately after an RPC that *already* did the authorised work — `respond_biomass_quote`,
> > `resolve_farmer_delivery_payment`, `confirm_farmer_delivery`. The server already knew the row,
> > the caller's right to act on it, and who the counterparty was. The client was re-supplying
> > information the database was in a better position to know.
>
> **🔴 Three steps, and the order is the whole risk:**
>
> | | | |
> |---|---|---|
> | 1 | apply `20260802000300` | additive, changes nothing |
> | 2 | deploy the frontend | starts calling the RPC |
> | 3 | apply `20260802000400` | tightens the policy |
>
> **Running 3 before 2 fails silently.** Every one of these calls is wrapped in a non-fatal catch, so
> nothing raises — a farmer just stops being told. That is this project's signature defect shape, so
> it is shouted about in both migration headers, and step 3 **refuses to run** if step 1 is missing.
> It cannot detect whether the frontend is deployed; that check is the owner's.
>
> **🐛 And a smaller one found in passing.** The dispute escalation carried the comment *"Notified
> separately so a failure to reach the buyer cannot also silence staff"* — while sitting in the
> **same `try` block** as the buyer notification, so a failure there skipped the admin escalation
> entirely. Genuinely separated now, and staff go first: if only one can land, it should be the one
> that gets a human involved. *A comment describing a separation the code does not implement is the
> same class as a handler for a rejection the service cannot produce.*
>
> ✅ **Two ratchets, both mutation-checked.**
> [`notifyCounterparty.test.js`](../src/test/services/notifyCounterparty.test.js) fails if a fourth
> service calls the raw insert helpers, and asserts the ported services **call** the new path rather
> than merely having stopped calling the old one — deleting the notification entirely would satisfy
> the weaker check. And the #12 grant-hygiene ratchet **caught the new RPC**: removing its `revoke`
> turned `securityDefinerGrants.test.js` red. A guard written yesterday policing code written today
> is the whole point of a ratchet.
>
> ⚠️ **What this deliberately does not fix:** the message *text* is still client-composed. Between two
> parties already trading — who can write to each other through quote and delivery notes anyway —
> that is far smaller than reaching arbitrary users, but it is not nothing. The honest end state is
> server-composed text from an event vocabulary, like the five `notify_*` triggers. That means
> rewriting functions that move money, on a database these migrations cannot be tested against, days
> before a pilot. Recorded in #36 rather than half-done.
>
> ### 🆕 2026-08-02 — #4 and #5 closed, and both were mis-stated
>
> Suite unchanged at **1131** (95 files). Build green, lint 0. **One migration, NOT applied** —
> `20260802000200`. The frontend half is a 21-line refactor.
>
> **#5 said Prettier "breaks the build". The blocker was seven attribute values in one file.** Every
> multi-statement inline Vue handler in the repo lived in `RoleApplicationView.vue`, all of the same
> shape — `sanitizeNumericField('x'); errors.x = ''` — and all seven now call one named
> `onNumericInput(field)`. A repo-wide scan finds **zero** multi-statement template handlers left, and
> it was **proven by running `prettier --write` then `npm run build`**, not by reasoning about it.
>
> ⚠️ **Prettier is still not enabled, deliberately.** Formatting that one file produced a **3383-line**
> diff, so turning it on repo-wide is a formatting-policy decision with an unreviewable diff and
> belongs in its own commit touching nothing else. The Prettier run was reverted; only the refactor
> landed.
>
> **#4 said "the two `NOT VALID` foreign keys". There are four constraints, and the two it omitted are
> the ones that matter.** Alongside the two `credit_transactions` FKs sit
> **`credit_ownership_qty_nonneg`** (`quantity >= 0`) and `kyc_level_requested_range`.
>
> > `credit_ownership_qty_nonneg` is described in its own migration as the backstop that stops the
> > same carbon unit being **retired or sold twice**. `NOT VALID` means it has been enforced on every
> > new write and **never once checked against the rows that already existed**. So *"has any holding
> > ever gone negative?"* is a question about whether the ledger is sound, and nothing in this
> > project's history has asked it. `20260802000200` is the first thing to ask.
>
> The migration validates each constraint **independently** — a bare `validate constraint` aborts on
> the first violation and tells you nothing about the rest — catching and naming any failure with its
> reason while the others still run. A read-only QUERIES block lists the offending rows if one fails.
>
> > **Fourth entry in a row whose stated size did not survive measurement** — #30's hand-count became a
> > script, #27's estimate became 375 strings, #12's "~10" became 39, and #4's "two FKs" is four
> > constraints. The backlog is reliable about the *shape* of a problem and unreliable about its
> > *size*. Re-measure before acting, every time.
>
> ### 🆕 2026-08-02 — dead code led to a live spoofing surface
>
> Suite **1121 → 1131** (95 files). Build green, lint 0. **No migration** — the frontend half ships
> with the next deploy; the database half is [#36](DEFERRED_BACKLOG.md) and is **not** fixed.
>
> Started as **#30** (dead exports, 62 candidates). Verifying whether seven dead `notify*` functions
> were safe to delete meant reading the triggers that replaced them — and that is where the real find
> was.
>
> **1. 🔒 Any signed-in user can write a notification into anyone else's bell.**
> `system_notifications`' INSERT policy is:
>
> ```sql
> with check (auth.uid() is not null)
> ```
>
> That is *"any logged-in user, for any recipient"* — not *"for yourself"*. And
> `createNotificationsForUsers()` inserts **client-side** with a caller-supplied `user_id`, `title`,
> `message` and `link`. So a row can be planted in any chosen user's feed — an admin's, a verifier's,
> a seller's — with arbitrary text, rendered by the product's own trusted UI.
>
> **🐛 And the bell was an open redirect on top of it.** `Header.vue` navigated with
> `window.location.assign(notification.link)`, which accepts an **absolute URL**. Forged
> notification, arbitrary destination: *"Payout on hold — reconfirm your bank details"*, pointing
> anywhere. **Fixed** by [`safeInternalPath`](../src/utils/safeInternalPath.js) — a link out of the
> app is no longer reachable from a database row, whatever wrote it.
>
> > **Severity, stated honestly:** medium, now medium-low. It needs an authenticated account, and
> > signups are open with autoconfirm right now, so that is a low bar during the pilot. It grants **no**
> > read access to anyone else's notifications, moves no money and escalates no privilege. It is a
> > spoofing surface — and precisely what a pentest files.
>
> **The RLS half is not a one-line tightening**, which is why it is backlogged rather than fixed:
> `auth.uid() = user_id` would immediately break every *legitimate* cross-user notification (feedstock
> deliveries, biomass quotes, price-drop alerts, admin escalations — ~18 call sites). The route is the
> one the five triggers already model: a `SECURITY DEFINER` RPC that resolves recipients server-side,
> then tighten the policy. Steps 1–2 land safely ahead of step 3.
>
> ⚠️ **Derived from `supabase/migrations/`, not measured live** — confirming it needs an authenticated
> session on the live project, which is not something to create unilaterally. #36 carries the one-line
> query that settles it.
>
> **2. 🧹 #30, the part that was worth doing.** Seven exported `notify*` functions deleted — they
> duplicated five live database triggers (`trg_notify_project_submission`, `…_submitted`,
> `…_project_status`, `…_role_application`, `…_marketplace_listing`). **Not merely dead:**
> `20260626000200`'s own header records why the trigger exists — *the client-side version was rejected
> by RLS and the bell never rang*. So the trap cut both ways: call one and you got either nothing, or
> a second notification on top of the trigger's. 62 → 55 candidates.
>
> **The other 55 are deliberately left**, and the reason matters: the detector counts a symbol used
> only *inside* its own module as a candidate, so most of them want the `export` keyword removed
> rather than the function deleted. Vite already tree-shakes unused exports, so there is no bundle
> win — and the 08-02 `.bind()` outage is what deleting dead code costs when it goes wrong.
> **Comprehension is the only benefit, and it does not outrank that risk at pilot time.**
>
> **3. 📐 Mutation testing found dead code in my own fix, within the hour.** `safeInternalPath`
> shipped its first draft with four guards. Mutating each one showed **two could not fire**: anything
> reaching the scheme check already starts with `/`, so `'/x'.split(/[/?#]/)[0]` is always empty, and
> the control-character scan was likewise unreachable for off-site navigation. Both deleted rather
> than kept as "belt and braces" — **a guard that cannot fire is dead code wearing a safety label**,
> the same pattern as the placebo accessibility toggles and the safe-area CSS rule that matched no
> element. The tests still assert every one of those inputs is refused, because the outcome is what
> matters, not which line produces it. Both remaining branches are mutation-verified load-bearing.
>
> ### 🆕 2026-08-02 — the test `localStorage` was not merely empty, it was mis-shaped
>
> Suite **1104 → 1121** (94 files). Build green, lint 0. **No migration, no function deploy** — test
> infrastructure and two new test files, so nothing here is inert waiting on anything.
>
> **The known half:** `src/test/setup.js` replaced `localStorage` with `{ getItem: vi.fn(), … }`,
> stubs that record calls and store nothing, so any test that appeared to verify persistence verified
> nothing. Recorded on 2026-07-31 and worked around locally in `preferencesEffects.test.js`.
>
> **The half nobody had noticed, and it is the one that mattered.** Real `Storage` exposes its entries
> as own enumerable properties — that is what makes `Object.keys(localStorage)` the list of stored
> **keys**. On the stub it returned **`['getItem','setItem','removeItem','clear']`**. And
> `userStore.clearLocalStorage()` is written as:
>
> ```js
> Object.keys(storage).filter(isAuthStorageKey).forEach((key) => storage.removeItem(key))
> ```
>
> So under test that loop iterated four method names, matched none of them, removed nothing, and threw
> nothing. **A test of sign-out clearing would have passed no matter what the function did, including
> the exact opposite.** `sessionStorage` was never stubbed at all, so the two halves of that one loop
> behaved differently in tests for months.
>
> **Fixed by deleting the mock, not by writing a better one.** happy-dom already provides a real
> `Storage` — probed before changing anything: `Object.keys` returns the stored keys, `getItem`
> round-trips, `length` works. `setup.js` now clears both stores between tests instead. The local
> in-memory workaround in `preferencesEffects.test.js` is deleted with it, rather than left to rot
> into a second, subtly different Storage implementation.
>
> ✅ **All 1104 existing tests stayed green through the change** — which is the finding, not a relief.
> Nothing depended on the fake, because **nothing was testing persistence at all.** The gap was
> missing tests, not broken ones.
>
> **Two files now cover what could not be covered before**, both mutation-checked in both directions:
>
> **1. [`authStorageClearing.test.js`](../src/test/store/authStorageClearing.test.js) (7).**
> `authStorageKeys.test.js` pinned `isAuthStorageKey` and it was correct the whole time; **nothing
> asserted anything used it correctly** — the same gap as `routeAccess` vs `routerGuardBypass`, and as
> the RetireView portfolio import. This drives the real thing: the Supabase tokens go from *both*
> stores, and theme, language, preferences, sidebar state, an unsaved draft and **the cart** all
> survive. It matters because `clearLocalStorage()` runs on session **expiry**, not only sign-out —
> over-matching destroys a user's settings while they sit on the page, under-matching leaves a token
> on a shared machine. Restoring the old `includes('auth')` predicate turns it red; making the clear a
> no-op turns it red differently.
>
> **2. [`cartPersistence.test.js`](../src/test/store/cartPersistence.test.js) (10).** **The cart had no
> tests at all**, and could not have had useful ones — every behaviour worth checking round-trips
> through storage. It is not decoration: `CartView` walks it sequentially through PayMongo and
> `PaymentCallbackView` removes each paid item after the redirect, so a cart that fails to reload is a
> buyer who pays for one item and loses the basket. Covers the reload round-trip, the money
> arithmetic, corrupt stored JSON (a throw there happens during component setup and blanks the page,
> not the cart), and quantity clamping to available stock.
>
> ⚠️ **One thing recorded rather than changed:** the cart deliberately survives sign-out, which is the
> correct fix for the old `localStorage.clear()` that wiped theme and accessibility settings — but on
> a **shared device the next person to sign in inherits the previous person's basket**. It holds
> public listing data and no payment detail, and checkout is authorised server-side against the
> signed-in buyer, so it is a privacy wrinkle rather than a money defect. *"Clear the cart on
> sign-out"* is a product decision, so it is in [DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) rather than
> made unilaterally.
>
> ### 🆕 2026-08-02 — the #15 tail, and #12 measured at four times its stated size
>
> Suite **1086 → 1104** (92 files). Build green, lint 0. **One migration, NOT yet applied** —
> `20260802000100_grant_hygiene_security_definer.sql`. The frontend half ships with the next deploy.
>
> **1. 🐛 An admin could save a failed read back into live configuration.** `SystemConfigView` loads
> platform settings and emission factors through `Promise.allSettled` and builds a banner from the
> rejected branch — *"Could not load: platform settings. Do not save those sections until this
> resolves."* — with a comment saying exactly why: *"Never let a blank field read as 'the saved value
> is empty' — saving over that would silently reset live configuration."*
>
> **Both services returned `{}` and `[]` on error, so that branch had never run.** A failed read
> rendered as **platform fee 0%, minimum KYC level to trade 0, both project fees ₱0** — in editable
> inputs, next to an enabled Save button. `saveKyc()` writes `Number(minKyc.value)`, so one click
> turns off the KYC gate on trading and records it as a deliberate admin decision.
>
> > **The fifth view this week whose error handling was written and could never run** —
> > BuyerDashboardView, RetireView, WalletView, the three from 07-31, and now this one. The pattern is
> > stable enough to state as a rule: **when a view handles a rejection, check that its service can
> > actually produce one.** The handler is evidence of intent, not of behaviour.
>
> **2. 🐛 A verifier's duplicate-file check reported "clean" when it had not run.**
> `findDuplicateEvidence` degraded to `[]`, and `[]` is not neutral there — it is the input that
> *suppresses* the `alert` flag on the evidence integrity panel. A failed lookup rendered as
> "these bytes appear on no other report", on the screen where credits are approved. It now throws,
> and the component counts the failures and says so.
>
> **Six more reads in the same family**, found by scanning every `catch` / `if (error)` in
> `src/services` rather than by following a report — 40 candidates, triaged one by one:
>
> | Read | Failure rendered as |
> |---|---|
> | `getAllSettings` / `listMethodologyFactors` | *"fee 0%, min KYC 0, no emission factors configured"* — **and savable** |
> | `findDuplicateEvidence` | *"this evidence is not a duplicate"* |
> | `getMyWatchlist` | *"your watchlist is empty"* — WatchlistView's error banner was dead code |
> | `listMySavedSearches` | *"you have saved no searches"* — the buyer's fix is to save it again, producing a duplicate row and duplicate price alerts |
> | `getMyListings` | a seller's listed inventory shown as unlisted |
> | `getProjectPriceHistory` | a price chart drawn flat instead of absent |
>
> **What was deliberately left degrading, and why it is not the same thing:** `assetLedgerService`'s
> and `mrvDashboardService`'s optional-table reads, `offtakeService.getOfftakeSummary`,
> `farmerService.getMyCarbonParticipation`, `verificationService.getProjectAuditTrail` and
> `listVerifiers`. Each degrades an **optional section** that is absent from the page when it fails,
> rather than making a claim about the user. `getSetting` also keeps its fallback — every caller
> passes one explicitly, which is the caller opting out where a reader can see it, the same shape as
> `OrdersView`'s `.catch(() => [])`. What changed there is that a real error is now logged instead of
> being absorbed into the default.
>
> **3. 📐 #12 said "~10 SECURITY DEFINER RPCs". It is 89 functions, 39 with no revoke.** Postgres
> grants EXECUTE to PUBLIC on every new function, so `grant execute … to authenticated` without a
> prior revoke leaves it callable by `anon` too. Of the 39: **15 are trigger functions** — not a
> reachable surface, since PostgREST will not expose a `trigger` return type and a direct call raises
> — and **24 are callable**, which is what the migration covers.
>
> > **The third backlog entry this week whose number was wrong** — #30's hand-count became a script,
> > #27's estimate became 375 measured strings, and now #12's "~10" is 39. The entries are reliable
> > about the *shape* of a problem and unreliable about its *size*.
>
> **The roles differ per function, and that is the whole design.** Seven of them (`is_admin`,
> `is_lgu`, `is_mrv_staff`, `is_verifier_or_admin`, `owns_project`, `owns_report_project`,
> `current_user_role`) appear inside `create policy` expressions — 13 files for `is_admin` alone — and
> **a policy expression is evaluated as the querying role**, so revoking `anon` there would break
> anonymous reads of every table whose policy calls one. Those keep all three roles: the change makes
> an implicit default explicit and reviewable, and nothing else. Three more (`get_setting`,
> `insert_system_notification`, `current_plan`) are reachable only from other `SECURITY DEFINER`
> functions, which execute as the owner — verified call site by call site — so they get a revoke and
> no grant. The four public reads keep `anon` **on purpose**: `/registry` and `/verify` work signed
> out, and a revoke that closed them would be a regression wearing the costume of a security fix.
>
> Signatures are resolved from `pg_proc` inside the migration rather than typed out, because this repo
> has overloads and a hand-written argument list that matches nothing is a migration that succeeds
> while doing nothing.
>
> ✅ **Applied and probe-verified the same day** — see the box at the top of this file for the exact
> responses. The admin RPCs now refuse `anon` at the privilege layer (`42501`) instead of admitting
> the call and failing an `is_admin()` check inside the body, and nothing anonymous broke.
>
> **And the live values sharpen the finding rather than softening it.** `app_settings` on production
> holds `platform_fee_percent = 0` — so for *that* field the swallowed-read rendering was
> indistinguishable from the truth, and would never have been noticed. But
> **`min_kyc_level_to_trade = 1`**, and the failed read rendered it as **0** with Save enabled. That
> is the one that mattered: the difference between "the fee display looked right by luck" and "one
> click turns off the KYC gate on trading".
>
> ✅ **Both changes are ratcheted, and both ratchets were mutation-checked.**
> [`swallowedReadErrors.test.js`](../src/test/services/swallowedReadErrors.test.js) (13) asserts
> rejection rather than shape — a `[]` is indistinguishable from a real empty result, which is the
> entire defect — and includes a non-vacuity test that a successful read still resolves.
> [`securityDefinerGrants.test.js`](../src/test/services/securityDefinerGrants.test.js) (5) re-derives
> the inventory from `supabase/migrations/` on every run and fails if any client-callable
> `SECURITY DEFINER` function lacks a revoke, **naming it**. Deleting one entry from the migration
> turned it red and printed `open_dispute`; restoring it went green.
>
> ### 🆕 2026-08-02 — a silent data-loss path in the project write, and a net for the near-miss
>
> Suite **959 → 1086** (90 files; +121 of that is one test importing every module). Build green,
> lint 0, authenticated e2e 22/22.
>
> **1. 🐛 A failed project insert was retried with fields silently deleted.** Both project write paths
> caught an insert error, checked whether its message named any of **16 optional columns**, removed
> those fields from the payload and retried. The project was created without them and **nobody was
> told** — not the developer, not the verifier, not an admin.
>
> Four of the sixteen were `methodology`, `additionality_type`, `permanence_years` and
> `reversal_risk` — **the fields that make a carbon credit assessable at all.** A project that looks
> complete and silently lacks them is worse than a failed submit: the failure is visible, the
> reshaping is not, and a verifier downstream cannot tell the difference.
>
> > Same family as everything else here — a fallback that turns an error into a plausible-looking
> > result. `[]`-on-error said *"you own nothing"*; this said *"your project has no methodology"*.
>
> **Removed on evidence, not assumption.** All 16 columns were probed against the live schema via
> PostgREST: every one returned **`200`**, against a control column returning
> **`400 42703 column does not exist`**. The retry could not fire. #15 said to delete these "once
> migrations are authoritative" — this is that, measured.
>
> **2. 🕸️ A net for yesterday's near-miss.**
> [`modulesEvaluate.test.js`](../src/test/services/modulesEvaluate.test.js) imports **all 121**
> service / util / store / composable / constant modules and asserts each one evaluates.
>
> The `.bind()` outage was invisible to build (syntax fine), lint (nothing unused) and 957 unit tests
> (no test imported that module) — only a real-login Playwright spec caught it. **Mutation-checked by
> recreating the exact break: this test names the failing module and the line in about a second.** It
> also asserts it found more than 40 modules, so it cannot pass vacuously.
>
> ### 🆕 2026-08-02 — #33 closed: it was never an architecture problem
>
> Suite **957 → 959** (88 files). Build green, lint 0. Frontend only.
>
> **#33 read as "three services own project writes — needs a decision about which one." It did not.**
> `projectWorkflowService` had **nine methods and exactly one reachable** (`submitProject`, called by
> ProjectForm). The other eight were called from nowhere, and `calculateCreditsAmount` /
> `calculateBasePrice` were reachable only from `generateProjectCredits`, itself dead. Deleting that
> block closed **six** of the nine collisions and ~420 lines without touching a live path. The
> remaining three — `getAllProjects`, `updateProjectStatus`, `submitProject` — each had one live copy
> and one dead twin; the twins are gone. **The ratchet baseline is now empty.**
>
> > **"Consolidate three services" was the wrong shape of the problem.** Nothing needed merging.
> > Almost all of it was dead code that had only ever *looked* like an architecture question — the
> > same correction #26 and #11 each needed, where the entry named a blocking change that was not on
> > the path at all.
>
> **🔴 And deleting two dead methods took down the verifier's sign-in.** Worth reading twice, because
> every safety net missed it.
>
> `projectService` re-exports each method at the bottom as
> `export const x = projectService.x.bind(projectService)`. **`undefined.bind` throws at module
> evaluation**, so the whole chunk failed to load and every route importing anything from it died with
> it — not just callers of the removed methods. A dead-code deletion became a total outage of an
> unrelated surface.
>
> **Build passed** (syntax was fine). **Lint passed** (nothing was unused). **The unit suite passed —
> 957 green.** The only thing that went red was `responsive-authenticated.spec.js`, written the day
> before, which drives a real login. I attributed it by stashing the change and re-running: baseline
> 5/5 green, my change 5/5 red.
>
> [`boundExportsResolve.test.js`](../src/test/services/boundExportsResolve.test.js) now checks every
> `.bind()` re-export names a method that exists — and asserts it found bindings at all, so it cannot
> pass vacuously. Mutation-checked.
>
> ### 🔴 2026-08-02 — THE FULFILLMENT SAGA HAD DRIFTED, and the tested copy is not the live one
>
> Suite **952 → 957** (87 files). Build green, lint 0.
> **🔴 ONE EDGE FUNCTION MUST BE REDEPLOYED: `supabase functions deploy paymongo-webhook`.**
> Until then both defects below are still live.
>
> `#15` recorded that the fulfillment saga "exists twice, kept in sync by hand". Checked, and **it had
> not been.** `src/services/credits/fulfillmentSaga.js` is imported by **nothing but its own unit
> test**; the copy that settles money is the TS port inside `paymongo-webhook`. So
> `fulfillmentSaga.test.js` has been green about code that does not run, while the code that moves
> money had no test at all — **#21's "~40 tests overstate money-path coverage", made concrete.**
>
> **Two real divergences, both in the live copy only:**
>
> | | JS copy (tested) | TS port (settles money) |
> |---|---|---|
> | Retry cap | stops at `MAX_ATTEMPTS = 3` | **no cap at all** — a failing supplier was re-attempted on every webhook redelivery, forever |
> | `supplier_orders` lookup error | throws | **destructured `data` only.** A transient read error left `order` undefined, and the placeOrder branch begins `if (!order \|\| …)` — so it placed a **SECOND supplier order** for a transaction that already had one |
>
> The second is the sharper one: it defeats the `transaction_id UNIQUE` key and the entire
> idempotency design, which exist *because* PayMongo retries webhooks. It is the same read-then-act
> shape as the double-subscription bug fixed on 2026-07-30, in the neighbouring function.
>
> **Severity, stated honestly:** `CREDIT_SUPPLIER` is still `mock`, so no real registry order could
> have been duplicated yet. But `refund_purchase` — the compensation path both copies call — reverses
> a real ledger, and these guards must exist *before* a supplier is wired, not after.
>
> > **"Kept in sync by hand" is not a mechanism, it is a hope.**
> > [`fulfillmentSagaParity.test.js`](../src/test/services/fulfillmentSagaParity.test.js) is the
> > mechanism. It cannot prove the two behave identically — only a Deno test against the real function
> > could — but it asserts that the invariants which **already drifted** are present in both, plus the
> > shared refund RPC and the terminal-state check. A drift that happened once is the likeliest to
> > happen again. Mutation-checked.
>
> ✅ **`20260801000100` (counterparty name) is APPLIED — verified by probe, not by trust.**
> `POST /rest/v1/rpc/get_transaction_counterparty_name` as `anon` returns **`200 []`**, where a
> non-existent function returns **`404 PGRST202`** (run as a control on the same request). Two things
> proven at once: the function exists, and it **fails closed** for an unauthenticated caller exactly
> as designed.
>
> ### 🆕 2026-08-01 — the backlog lane: #33, #15, #3, #30, and the first look at authenticated layout
>
> Suite **935 → 951** (86 files). Build green, lint 0. **One migration, NOT yet applied** —
> `20260801000100_transaction_counterparty_name.sql`; everything else is frontend and already live.
>
> **1. 🐛 #33 — project submission had three write paths, and the third was dangerous.** `ProjectForm`
> cascaded `projectWorkflowService.submitProject` → `projectService.createProject` →
> `projectApprovalService.submitProject`, taking whichever did not throw. Path 2 was a near-verbatim
> copy of path 1 and validated identically, so it could only ever mask a transient blip. **Path 3 had
> no numeric validation at all** — `estimated_credits: -5`, refused by both paths above, was accepted
> on the third try — **spread the raw form object into the insert** instead of picking known columns,
> and **hardcoded `status: 'pending'`**, so a **draft** reaching it was silently promoted into the
> review queue and fired `notify_project_submitted_trigger`. A private draft became a submission, and
> reviewers were notified, because two other code paths had failed.
>
> > **A fallback more permissive than the thing it backs up is not redundancy. It is the validation
> > being optional.** Cascade removed; the surviving path is the one with the schema-drift retry.
>
> **2. 🔧 #15 — the nullable-client race, fixed where it starts.** `getSupabase()` kicked off an async
> init and returned whatever the singleton held, so *"is Supabase available?"* depended on **when you
> asked**. `createClient()` does no I/O; the only await was a legacy-session migration, now a
> background side effect. A null return now means one thing: the environment is misconfigured.
>
> > **The entry's own prescription — "delete the ~162 guards" — was wrong.** The count was never the
> > defect. The **shapes** were: 94 `throw` against 31 `return []`. One transient race surfaced as a
> > hard error in one service and as an empty list in the next — and an empty list reads as a fact
> > about the user. That is the class chased all week, and its source was a startup race.
>
> **And `errorStore` was never disabled.** `ErrorBoundary` uses it in full and is mounted; the
> `main.js` monkeypatches went on 2026-07-29. Two stale `// Temporarily disabled` comments were all
> that survived. The row asserting a system was off had been wrong for weeks.
>
> **3. 🆕 #3 — a receipt can name the counterparty.** New migration: a `SECURITY DEFINER` function
> returning a **display name only**, and only to a party of that exact transaction. `profiles` SELECT
> RLS is untouched — it is hardened against role/kyc_level escalation and must stay that way. No
> email, no phone, no role: the `paymongo-checkout` finding is what returning "slightly more than
> needed" costs on a payment surface. `search_path` pinned, PUBLIC execute revoked before granting
> (#12 hygiene). The client degrades to `null` when the RPC is absent, so it is inert rather than
> broken until you apply it.
>
> > 🐛 **And I shipped this one half-built, which is worth recording.** The migration, the service
> > function and five tests all existed — and **nothing imported `getCounterpartyName`**, so Vite
> > tree-shook it out and it was not in the production bundle at all. Caught by checking the deployed
> > file rather than the source, the same way the 2026-07-30 `verify` fix was confirmed. **This
> > session's own "built ≠ live" pattern, produced by the person fixing it.** The test now asserts the
> > function is *called*, not that it exists — asserting the export would have passed the whole time.
>
> **4. 📐 #30 is measurable instead of estimated.** The entry carried a hand-count nobody could
> re-derive. [`find-dead-exports.mjs`](../scripts/analysis/find-dead-exports.mjs) re-derives it: **63
> candidates**. Deliberately conservative. Removed only what was hand-verified — nine `analytics.js`
> wrappers and `getUserPurchaseHistory`.
>
> **5. 🐛 Three layout bugs on authenticated pages, found by the first test ever to look.**
> [`responsive-authenticated.spec.js`](../src/test/e2e/responsive-authenticated.spec.js) — 22 tests.
> All three were the same shape, **a hard minimum that cannot shrink**: `/dashboard`'s
> `minmax(320px, 1fr)` grid measured **336px wide on a 320px screen** (six more grids across
> CreditPortfolio, Marketplace, Analytics and UserPreferences carried it too); `/admin`'s
> `.section-link` is `flex-shrink: 0` beside a text block and landed **65px off the edge**; the admin
> filter bars' `min-width: 240px` search box could not fit beside a 180px select. All fixed with
> `min(Npx, 100%)`.
>
> > **Two things that spec learned the hard way, and both are the same lesson.** Its FIRST version
> > used `page.goto()` and reported **22/22 passing having measured nothing** — a goto is a full
> > reload, and the DEV mock session lives only in the Pinia store, so every route bounced to
> > `/login`. Then hand-written route paths were wrong twice, and a wrong path is indistinguishable
> > from a page with no overflow. Both were caught by one assertion — `measured.length > 0` — added
> > *because* a green result on a test that has never been red proves nothing. **It went red
> > immediately, twice.** Routes are now discovered from the rendered navigation.
>
> **6. 📐 #27 (i18n) measured and deliberately NOT started.** ~**375** strings across the farmer + LGU
> surfaces. The blocker is not the library or the extraction — it is the **translation content**, and
> Filipino renderings of *escrow*, *retirement*, *feedstock* and *dispute* are terminology decisions
> with legal weight on a platform where a smallholder contests a payment. Wrapping 375 strings in
> `t()` with English values would be a large diff that changes nothing a user sees — the placebo
> pattern removed twice this week. **Owner decision first.**
>
> ✅ Also added: [`rpc_positive_suite.sql`](../supabase/diagnostics/rpc_positive_suite.sql) — the
> other half of TESTING_PLAN §1.2. Everything runs inside a transaction that ends in `ROLLBACK`, and
> probes that would pass vacuously report `UNPROVEN`.
>
> ### 🆕 2026-08-01 — post-merge sweep: the wallet, and the deploy topology
>
> Suite **932 → 935** (82 files). Build green, lint 0.
>
> **1. 🐛 A failed wallet read rendered as "no transactions".** `walletService.getTransactions`
> looked up `wallet_accounts` with `.single()`, which returns an **error** (PGRST116) when there are
> simply no rows — so the two cases had to be collapsed into
> `if (walletError || !walletAccount) return []`. That swallowed real failures (network, RLS,
> timeout) onto the money screen, and made `WalletView`'s `Promise.allSettled` rejected branch dead
> code for that path — the fourth view this week whose error handling had been written and could
> never run. `.maybeSingle()` separates them: no row is `data: null, error: null`.
>
> **The other ~12 `error || !row` sites were checked and are fine** — they all `throw`. The wording
> is imprecise (a database outage reports as *"Listing not found"*), but the user gets an error and
> the operation stops. That is materially different from rendering a failure as a fact.
>
> **2. ⚠️ Two Vercel projects build from this repo, and one is not Carbonify.** `carbonify13` is
> production. **`ecolink` is wired to the same repo, builds on every push, and serves a
> *"Vite + React + TS"* app** — a different codebase entirely. Not a data risk, but it burns a build
> per push, and **`.vercel/repo.json` links this checkout to `ecolink`**, so a CLI `vercel --prod`
> from this directory would target the wrong project.
>
> **3. ⚠️ `ci.yml`'s `deploy` job fails on every push to `main`** — `VERCEL_TOKEN` was never set, and
> it has never run in this repo's history. The **Vercel Git integration** is what actually deploys.
> **A red X on `main` does not mean the deploy failed.** Set the three `VERCEL_*` secrets or delete
> the job.
>
> ✅ **Measured on live production, not assumed:** all six security headers are served (CSP, HSTS,
> X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy) · `console.log` really is
> stripped from the production bundle (`vite.config.js` `esbuild.pure`) while `console.error`
> survives · no secrets, `.env` files or live keys are tracked in git.
>
> ### 🆕 2026-08-01 — 🐛 #11 CLOSED. The ESG report was reading a table nothing writes.
>
> Suite **924 → 932** (81 files). Build green, lint 0. **No migration, no function deploy.**
>
> **The open half of #11 said consolidating the two purchase sources was "a data-model question —
> which table is canonical". It was not a question.** Nothing in this project writes
> `credit_purchases`: not one migration, edge function or client path. Every settled purchase goes
> into `credit_transactions` via `process_marketplace_purchase`. The table is legacy — and
> `creditOwnershipService.getUserTransactionHistory`, the ESG report's **only** source, had been
> reading it.
>
> So `buildEsgDataset().totals.purchasedCredits` was **structurally zero**, and the exported PDF
> printed **"Credits purchased (lifetime): 0"** for every buyer who had ever bought anything.
>
> > **This is #11's failure mode for the third time, by a third route.** The cross-type slice
> > (2026-07-28) and the swallowed error (2026-07-30) were both fixed **in this same function**, and
> > neither pass asked whether the table under it had rows. Two fixes, one function, and the thing
> > actually wrong was one line above where both of them were looking.
>
> **Scoped honestly:** `Credits owned`, `Credits retired` and the `By Project` breakdown were always
> correct — they read `credit_ownership` and `credit_retirements`. Only the purchased figure was wrong.
>
> **The name collision is closed by renaming, and that is the real close-out of #11.**
> `transactionHistoryService`'s copy is now `getPurchaseAndRetirementHistory`: it returns
> `{purchases, retirements, all}` from different tables and was never interchangeable with the flat
> array the other returns. One name over two shapes is what let a fix land on one copy and be believed
> to cover both — twice this week.
>
> **Two more `[]`-on-error reads went with it,** both live on RetireView through
> `getUserRetirementHistory`: a failed retirements query was logged and stepped over, and the outer
> catch returned `{purchases: [], retirements: [], all: []}`. **A user who had retired credits was
> told, on the retirement screen, that they had retired none.** Both now throw.
>
> **Also deleted:** a `credit_purchases` "fallback" that queried the table, logged
> *"✅ Found purchases in credit_purchases table"*, then discarded the rows behind a
> `// TODO: Implement proper fallback` — a success line printed for data it never used, against a
> table nothing writes. *A log line saying a thing worked is not evidence the thing worked.*
>
> **🆕 The guard I wrote yesterday would have missed this, and that is worth carrying.**
> `duplicateServiceReads.test.js` matched only `export function`, and #11's collision is a bare export
> on one side and a **class method** on the other. A guard written against one of two syntaxes catches
> half the class — the same partial-coverage mistake it exists to prevent. Extended to both, it
> immediately found **nine more collisions** across `projectService`, `projectWorkflowService` and
> `projectApprovalService`, and one of them is live: `ProjectForm.vue`'s submit handler **cascades**
> `projectWorkflowService.submitProject` → `projectService.createProject` →
> `projectApprovalService.submitProject`, taking whichever does not throw. Three write paths into one
> table, chosen by failure. Recorded as **[#33](DEFERRED_BACKLOG.md)** rather than fixed — it needs a
> decision about which service owns project writes. The nine are an explicit **ratchet baseline**: a
> new collision fails the suite, and the count can only go down.
>
> **Mutation-checked, three ways** — reverting the table turns the guard red; re-swallowing the
> retirements error turns exactly the two retirement assertions red; the pinned-to-`credit_purchases`
> assertion in `creditOwnershipErrors.test.js` went red on the table change, which is how we know it
> was really exercising that path. *That test had agreed with the code and both were wrong about the
> database.*
>
> ### 🆕 2026-08-01 — 🐛 the portfolio fix named RetireView as covered. RetireView imported the other copy.
>
> Suite **920 → 924** (80 files). Build green, lint 0. **No migration, no function deploy** — one
> import, one deletion, one new test.
>
> **`getUserCreditPortfolio` existed twice**, in `creditOwnershipService` and in
> [`marketplaceService`](../src/services/marketplaceService.js), both reading the same
> `credit_ownership` rows through the same `projects!inner` embed. The 2026-07-30 pass fixed the first
> to rethrow instead of returning `[]`, and **its own comment recorded the coverage it believed it
> had**: *"every caller already handles a rejection: CreditPortfolioView and **RetireView** catch and
> show an error banner."*
>
> [`RetireView.vue`](../src/views/RetireView.vue) did not call it. It imported the **marketplaceService**
> copy, which still swallowed the error and returned `[]`. So on the retirement screen a database
> outage rendered as **"you own no credits to retire"**, and the error banner in that view's `catch`
> — `'Failed to load your credits. Please try again.'` — was **dead code that could never run**,
> exactly as `BuyerDashboardView`'s rejected branch had been before it was fixed.
>
> The duplicate is deleted rather than patched. Two exported reads under one name is the precondition
> for the whole class: it makes *"is this the fixed one?"* unanswerable at the import site. This is the
> `getUserCreditPortfolio` sibling of the dual-source half of **#11** (`creditOwnershipService` vs
> `transactionHistoryService`, both exporting `getUserTransactionHistory`), which remains open.
>
> > **The lesson, and it is a sharper version of an old one: a fix's own claim about its callers is
> > not a measurement of them.** `creditOwnershipErrors.test.js` asserts the surviving copy rejects —
> > true the whole time, and it caught nothing, because the defect was never in the function. It was in
> > *which function the view imported*. Same shape as `routerGuardBypass.test.js`: the route metadata
> > was correct; nothing asserted the guard read it.
>
> So [`duplicateServiceReads.test.js`](../src/test/services/duplicateServiceReads.test.js) asserts the
> **wiring**, not the function: no two service modules may export the same function name (allowlist of
> one — `exportFilename`, which touches no database), RetireView reads the portfolio from the service
> that rethrows, and `marketplaceService` no longer exports a second copy. **Mutation-checked** —
> restoring the old import turns it red.
>
> **Verified this pass, by running rather than reading:** unit **924/924** (80 files) · Playwright
> `responsive.spec.js` + `runtime-smoke.spec.js` **46/46** · `pilot-readiness.spec.js` **2/2 against
> live** (`disable_signup=false`, `mailer_autoconfirm=true` — still matching what the docs claim) ·
> lint 0 · build green.
>
> **Also corrected:** [OPEN_WORK_REGISTER](OPEN_WORK_REGISTER.md) §2a steps 4 and 4b still read 🔴
> *"Not confirmed done"* for the payout-worker schedule and the three edge-function redeploys — both
> done and verified 2026-07-30. The genuinely-open part is split out as step 4c, **the frontend
> deploy**. A routing doc that names a red blocker is read as status whatever its header says.
>
> ### 🆕 2026-08-01 (late) — 🐛 the consent gate asked forever, because it asked as nobody
>
> Suite **916 → 920** (79 files). Build green, lint 0. **No migration** — the table and both its RLS
> policies have been correct since 2026-07-31. This was entirely frontend.
>
> **The report:** the policy box appeared at every sign-in, in every role, on localhost. The
> obvious readings were all wrong. It was not the migration (the table exists — `200 []` where a
> missing table gives `404`). It was not RLS (`pg_policies` shows both the SELECT and INSERT policy,
> exactly as the migration writes them). It was not the deploy (production runs `main`, three weeks
> stale, which does not contain the gate at all).
>
> **What it was:** in development `LoginForm.handleSubmit` assigns `testAccount.mockSession` straight
> into the store for the four `*@carbonify.test` accounts — objects fabricated in
> [`testAccounts.js`](../src/utils/testAccounts.js) carrying an `access_token` of, literally,
> `'admin-test-token'`, for users **that do not exist in Supabase auth**. The Supabase client never
> receives that session, so every PostgREST request still went out as `anon` with `auth.uid()` null,
> while the app believed a hard-coded uuid was signed in.
>
> - The **read** matched nothing under RLS and returned `200 []` with `error: null` → indistinguishable
>   from "has not accepted" → box shown again, every time.
> - The **write** was rejected `42501` → accepting could never succeed → the table stayed empty, which
>   is what made it look like a migration fault in the first place.
>
> The gate was **unsatisfiable**. That is worse than no gate: it teaches people to dismiss the one
> thing they are meant to read. `authenticatedUserId()` now asks Supabase who it actually holds and
> **skips** the gate when that disagrees with the store — consent that cannot be recorded is not worth
> collecting — and the write refuses with a sentence instead of a bare `42501`.
>
> > **The lesson, and it is a new one for this repo: a fail-open read can fail closed.** The service
> > carried a comment saying it failed open "if the table is missing, **RLS blocks the read**, or the
> > network is down". RLS does not error. PostgREST *filters rows*. So the one case the comment named
> > as safe was the one case that failed closed — and did so **silently**, because the console warning
> > written to catch exactly this only fires on an `error`, which never came. Corrected in place and
> > verified against the live project. Sibling of the recurring
> > "a read that swallows its error and returns `[]` reads as a fact about the user" defect, one layer
> > down: here nothing was swallowed, because nothing was thrown.
>
> **Four more defects found scanning that path**, none of them reported, all fixed here:
>
> | | Was | Now |
> |---|---|---|
> | [`supabaseClient.js`](../src/services/supabaseClient.js) | `initSupabase` returned **`null`** to any caller arriving mid-startup ("already in progress"). Affects every service, not just this one | Concurrent callers await the in-flight promise |
> | [`policyService.js`](../src/services/policyService.js) | Sampled `getSupabase()` in the same tick as the first call. The router guard hydrates the session **before** `App.vue` mounts, so an unlucky load gave indeterminate → let through → **never retried**, since the watcher only re-fires when the user id changes | Awaits the client. Whether a consent form shows must not depend on a startup race |
> | [`PolicyConsentGate.vue`](../src/components/legal/PolicyConsentGate.vue) | "Cannot be dismissed" stopped the **mouse only**. Tab reached the header and sidebar behind it; the mobile menu is `z-index: 9999 !important` against the gate's 1900, so it opens **on top** | Focus trap + body scroll lock. The z-index is deliberately left alone — the documents open at 2000 and must stay above the gate, or "Read" opens behind the thing telling you to read |
> | [`App.vue`](../src/App.vue) | No race guard (sign out, back in as someone else, slower answer wins) and a throw rejected into the watcher as an unhandled rejection | Guarded by user id; catches and fails open like the service |
>
> **And one about the tests themselves.** The global double in [`setup.js`](../src/test/setup.js)
> exposed only `getSupabase`. The moment a service used any other export of that module, **all 67
> suites failed at once** with "is not a function" — not one informative failure, sixty-seven
> uninformative ones. It now mirrors the real module's four exports. *(This is also the one flake
> worth not chasing: a first run straight after editing a file can still report `0 tests` from
> `setup.js` — the Windows parallel-worker issue already noted at the top of this file. It clears on
> re-run.)*
>
> ⚠️ **Still open, and it needs you:** the fix is verified for the four mock accounts. `policy_acceptances`
> has **never** held a row, so for real accounts "the write was broken too" and "nobody ever ticked the
> box" are still indistinguishable from the outside. Accept once on a real account and run the join in
> [YOUR_ACTION_ITEMS](YOUR_ACTION_ITEMS.md). [`verify-policy-gate.js`](../scripts/test/verify-policy-gate.js)
> does the same round-trip from the terminal for one account.
>
> **Left alone deliberately:** [`userStore.js`](../src/store/userStore.js) hard-codes the four mock
> uuids in a literal array. Correct today; a hand-maintained list that has to be updated whenever a
> test account is added — the same shape as the bug above. And the mock-session login itself, which is
> load-bearing for role testing.
>
> ### 🆕 2026-08-01 — the consent gate, verified rather than asserted; and the doc set caught up with the backend
>
> Suite **908 → 916** (79 files). Build green, lint 0. **No migration, no function deploy** — one
> frontend change and one new diagnostic, so nothing here is inert waiting on a deploy.
>
> **1. "Will the policy box show only once?" is now a test, not a claim.** `policyConsent.test.js`
> already covered the read and the write *in isolation*; nothing asserted the **sequence** —
> no row → box → accept → reload → no box. [`policyShownOnce.test.js`](../src/test/services/policyShownOnce.test.js)
> runs that lifecycle against an in-memory table that enforces the same
> `UNIQUE (user_id, policy_version)` index the migration creates, because that constraint is half of
> why re-accepting is a no-op. It pins: shown once and not again across 25 reloads · two tabs
> accepting at once leave **one** row · one user accepting does **not** clear the box for anyone else ·
> all six roles behave identically (a role is not a parameter of the gate at all) · a version bump
> re-asks and **keeps the old row** · a failed read does **not** bring the box back.
>
> **The test was mutation-checked**, because a check that cannot go red proves nothing — the payout
> worker's lesson. Removing `.eq('user_id', userId)` from the service turned exactly the two isolation
> tests red; reverted, `git diff` clean.
>
> This is the same shape as `routerGuardBypass.test.js`: **an assertion about the parts is not an
> assertion about the behaviour.**
>
> **2. 🐛 The register page had no link to the Terms at all.** Zero mentions of "Terms", "agree" or
> "legal" in 483 lines — while the Terms themselves say *"by creating an account you agree to these
> Terms, the Privacy Policy, and the Carbon Credits Policy"*. The footer that normally carries those
> links is `v-if="showHeader"`, which **excludes** `login`, `register` and `role-application`. So
> people were agreeing, by signing up, to documents the page gave them no way to open. Now a line
> above "Already have an account?" whose three links dispatch `OPEN_POLICY_EVENT` — opening the **one**
> modal `App.vue` already renders, not a second copy of the legal text.
>
> Deliberately **not** a checkbox there. The blocking gate on first sign-in is what records consent
> against a version; a tick on the register form would record nothing and only imply it had.
>
> **3. [`policy_consent_verification.sql`](../supabase/diagnostics/policy_consent_verification.sql)** —
> the owner-side half of the same question, read-only. §1 is the one that answers it: no user has more
> than one row for the same version. It also checks the UNIQUE index still exists, because "at most
> once" is enforced by the database, not the frontend — drop that index and the guarantee quietly
> becomes a frontend convention.
>
> **4. The doc set said signups were disabled and confirmation required. Both had been false since
> 2026-07-31.** Four files still carried it *after* the reconciliation commit, because that pass fixed
> the status boxes at the top of each page and not the instructions further down:
> `YOUR_ACTION_ITEMS` Step 4 (the invite warning, the `OWN-08` gate line, the pilot brief, Step 6b),
> `UAT_TEST_SCRIPT` (`OWN-08` "red today", and `BUY-01` telling testers to click a confirmation email
> and check spam), `GO_LIVE_ROADMAP` (a row that had claimed three different values over three
> revisions — now leads with the measurement and the date).
>
> **The lesson, and it is the same one as the `ACCOUNT_DELETION_SECRET`:** a page can be corrected at
> the top and still be wrong where somebody actually reads it. `BUY-01` is handed to pilot users —
> a tester following it would have sat waiting for mail that is never sent.
>
> **5. [TESTING_PLAN.md](TESTING_PLAN.md) now opens with the complete list of test types** — 18 of
> them across 4 tiers, plus the 98 UAT tests by block. The content was already there, spread across
> §1.1–§1.9 and §2; there was no single answer to "what kinds of testing does this system have?".
>
> ### ✅ 2026-07-31 (late) — SIGNUPS ARE ON. The pilot's front door is open.
>
> **Measured, not assumed** — `GET /auth/v1/settings` on the live project:
>
> | Setting | Was | Now |
> |---|---|---|
> | `disable_signup` | `true` | **`false`** |
> | `mailer_autoconfirm` | `false` | **`true`** |
>
> Anyone can register and is signed in immediately, with no email involved. That is the correct state
> while there is no verified sender domain: it sidesteps the "worst of the three states" the runbook
> warns about (signups on, confirmation required, no sender). The domain is still worth buying — the
> other 8 transactional emails and the MRV reminders remain stubs — but it no longer blocks the beta.
>
> ⚠️ **The trade-off, stated plainly: anyone can now register with an address they do not control.**
> Fine for a closed pilot with people you invited. **Turn confirmation back on before any public
> launch.**
>
> **Also applied to live: `20260731000100_policy_acceptances.sql`** — confirmed by probe, not by the
> dashboard (`/rest/v1/policy_acceptances` returns `200 []` where a non-existent table returns `404`,
> and RLS correctly returns nothing to `anon`).
>
> ### 🆕 2026-07-31 (late) — onboarding, consent, and three screens that did not work
>
> Nine commits after the security pass below. Suite **820 → 908** (78 files). Build green, lint 0.
> **One migration, already applied.** Everything else is frontend.
>
> **1. A new account landed on "Welcome back" over an empty dashboard.** Now three onboarding surfaces,
> each for a different moment: `WelcomeTour` (one-shot modal, unchanged), **`FirstRunGuide`** (dashboard
> panel, until the account is used), and **`/guide`** (the page you come back to in week three, linked
> directly below "Take a tour" in both the account menu and the sidebar). New-ness is measured from
> **activity, not a timestamp** — an account created three weeks ago with no holdings and no orders has
> not started, and greeting that person "welcome back" is the confusion being fixed.
>
> The guide states the beta limits on the page rather than leaving them to be discovered, and it warns
> that **a pending farmer / developer / verifier application blocks sign-in** — which users currently
> learn by being locked out of an account that worked five minutes earlier. LGU is deliberately *not*
> offered as an application: it is absent from `ROLE_APPLICATION_ROLES` because staff assign it, so an
> "Apply as an LGU" button would submit into a role the service rejects.
>
> *Found while writing it:* a pending **farmer** application told the user their **"Project Developer
> account"** was awaiting approval — the message was a binary `=== 'verifier' ? … : 'Project Developer'`
> over a lookup that queries all three roles.
>
> **2. 🔴 Policy consent is now blocking, and recorded per version.** Terms + Privacy + Carbon Credits,
> one checkbox, no close button, no Escape; declining signs the user out globally. The gate holds **no
> legal text** — it opens the same modal `App.vue` already renders, because two copies of the Terms
> drift the first time one is edited and the one a user consented to would be whichever component
> happened to render.
>
> A **table, not a boolean on `profiles`**: a flag answers "did they agree?", but the question actually
> asked is "what did they agree to, and when?". Policies change, and a flag silently retconning every
> historical acceptance is not evidence. No UPDATE or DELETE policy exists.
>
> > ⚠️ **The read FAILS OPEN, deliberately.** If the table is missing or the read errors, users are let
> > through rather than locked out — matching `App.vue`, where a missing `is_active` column must read as
> > ACTIVE. An owner-applied migration must never brick the platform, including for the admin who would
> > have to fix it. The consequence: **before the migration was applied the gate did nothing, silently.**
> > It is applied now. The **write** is the opposite and throws — a user who ticked the box and was let
> > in without a record is the case that leaves us with no evidence at all.
>
> **3. 🐛 An admin could not view a KYC ID document at all.** Clicking "View ID document" opened a new
> tab and a blank white page, with nothing in the console — on the screen whose entire job is reviewing
> them. `KycView` uploads via `FileReader.readAsDataURL`, so `id_document_url` holds a **`data:` URI**,
> and **every modern browser blocks top-level navigation to `data:`** (Chrome and Firefox since 2017,
> anti-phishing). The link was a shape browsers stopped honouring. The block is on *navigation only* —
> the same URI renders fine as an `<img>` `src`, so it now opens in-place with zoom, rotate and reset.
>
> **4. The KYC review card was three columns.** `.app-card` was `display: flex` with three children, so
> identity, the AML row and the actions block laid out side by side: the screening button marooned in
> the middle with no explanation, and the notes input squeezed until its own placeholder was cut off
> mid-word — taking the rule that **rejection requires notes** with it. The AML row had been added later
> as a third sibling without the container being updated. Now an ordered top-to-bottom workflow: who →
> ① check the document → ② screen → ③ decide.
>
> **5. The preferences page was almost entirely placebo.** `applyAccessibilitySettings()` added
> `.high-contrast`, `.large-text` and `.reduced-motion` to `<html>`; **searching the codebase for those
> three class names returned zero rules outside the store itself.** Every accessibility toggle saved a
> value and changed nothing — and the user switching on "High contrast" is the one who cannot work
> around it being fake. Worse, it read `accessibility.reducedMotion`, which **nothing ever wrote**: the
> visible switch is "Animations", writing `display.animations`. Two keys that could never meet.
>
> `src/styles/preferences.css` makes six settings real. **Removed** rather than left doing nothing:
> Theme (tokens.css says the app is *"NOT dark-mode aware, deliberately"*), **Currency** — the dangerous
> one, offering USD/EUR/GBP/JPY while **nothing converts**, so selecting USD would relabel ₱1,000 as
> $1,000 — date/time format, items-per-page, "Screen reader support" (not a mode you switch on) and
> "Enhanced keyboard navigation" (a toggle implying keyboard access can be turned *off*).
>
> **6. Emoji → Material Symbols** across the preferences tabs, the seven flag emoji, PaymentCallback,
> SubmitProject's `1️⃣2️⃣3️⃣` keycaps, ProjectDetail, CertificateView, FinanceConsole and the payment
> icons. *Still emoji: ~388 in `console.log` across 60 files — developer-facing, deliberately left.*
>
> **7. `/apply` was several screens tall.** `row-gap: 2.75rem` between every pair of fields, 140px
> textareas, 2.5rem card padding, a 4rem hero. Roughly halved. **The `@media` blocks still held the
> pre-shrink values** — every one now larger than the new desktop rule, so the form would have been
> *more* spacious on a phone than a laptop. That is the 2026-07-26 header-shrink trap exactly, which
> shipped once and had to be come back for.
>
> ### 🆕 2026-07-31 (late) — PWA + responsive audit. Two dead rules and a landing-page overflow
>
> **1. The safe-area rule had never matched anything.** `responsive.css` guarded the notch with
> `.app-header`, `header.app-header` and `.app-shell-header`. **None of those classes exist** — the
> header's root is `.header`, the sidebar's is `.sidebar`. So the block never applied, while
> `viewport-fit=cover` in `index.html` *was* extending content under the notch: an installed PWA on a
> notched iPhone drew its header beneath the status bar, the exact thing the block existed to prevent.
> Same shape as the router guard and the KYC card — a correct rule pointed at something that is not
> there. Now covers top (header), left (sidebar in landscape) and bottom (iOS home indicator).
>
> **2. Offline, every icon became a word.** The UI is Material Symbols, which renders by **ligature**,
> and the service worker never cached cross-origin — so with no font the icons degraded not to blank but
> to the literal words *"check_circle"*, *"menu_book"*, *"visibility"*. Sharper after the emoji sweep
> moved more of the UI onto that font. Fixed with `&display=block` (glyph invisible until the font
> arrives, rather than flashing its own name) **and** a cache-first strategy for the two Google Fonts
> origins — the single cross-origin exception, which must accept **opaque** responses because the
> `<link>` carries no `crossorigin`. `CACHE_VERSION → v4`.
>
> **3. `/home` overflowed on every phone.** `.stats-grid` declared `repeat(4, 1fr)` in its **base** rule,
> so four cards with 2rem padding and 2rem gaps were forced onto a 390px screen — **measured at 697px
> wide**, pushing the landing page sideways on the first screen a visitor sees. The giveaway was the
> `@media (min-width: 768px)` block setting `repeat(4, 1fr)` *again*: a redundant override means the base
> was meant to be the small-screen case and was never written that way.
>
> **Why a Playwright spec rather than more CSS reading:** `html { overflow-x: clip }` prevents the
> scrollbar but **hides what overflowed**, so `scrollWidth` would have passed while a table's last
> columns were unreachable. `responsive.spec.js` measures element geometry at five widths, ignores
> anything inside a legitimate scroll container, and checks tap-target height and the 16px input floor.
> **It found #3; reading the CSS had not.**
>
> ✅ Clean on inspection: all six icons are genuine PNGs, every manifest icon exists, the SW registers
> exactly once, the CSP already permits both font origins, and the 720px tables in `AuditLogsView` and
> `RegistryView` both sit in proper scroll containers.
>
> ⚠️ **The responsive spec covers PUBLIC routes only.** Authenticated pages — dashboards, admin queues,
> the rebuilt KYC card — are unmeasured, and they are the widest layouts in the app, so they are the
> likeliest remaining offenders. Closing that needs a seeded test account and a login helper.
>
> ### 🔒 2026-07-31 — the role guards were skipped on one of two paths into the app
>
> A pre-pilot read of the router and the remaining service reads. Suite **801 → 820** (71 files).
> Build green, lint 0. **No migration, no function deploy — this is frontend only**, so it ships
> with the next frontend deploy and nothing is inert in the meantime.
>
> **1. 🔴 Any signed-in account could open `/admin` by typing the URL.** `router.beforeEach` has two
> ways to reach a signed-in navigation. Path 1 — `userStore.isAuthenticated` already true — ran the
> MFA check, the five role guards, the `disallowedRoles` block list and the plan gate. Path 2 — the
> store is cold, so the guard asks Supabase directly, finds the session in localStorage and restores
> it — called a bare **`next()`**. It treated a restored session as proof of *authorisation* rather
> than *authentication*, checking nothing at all.
>
> Path 2 is not exotic: it is a hard refresh onto a deep link, or `fetchSession()` throwing, which
> the guard catches and ignores three lines earlier. **Reproduced before fixing** — a `farmer`
> account lands on `/admin`, `/verifier` and `/cart`, all three of which its metadata forbids.
>
> `routeAccess.test.js` could never have caught it: it asserts route **metadata**, and the metadata
> was correct the whole time. Nothing asserted that the guard *reads* it. Both paths now call one
> `enforceAuthenticatedAccess()`, and [`routerGuardBypass.test.js`](../src/test/services/routerGuardBypass.test.js)
> drives the real router with a cold store. Its fourth test admits an **admin** to `/admin` — a guard
> that rejected everyone would pass the other three and be useless.
>
> ⚠️ **Scope, stated honestly:** this is the client-side gate. RLS still stood behind it, so an
> attacker reached admin *screens*, not admin *data* — the reads on those screens are separately
> policy-enforced, and `rls_negative_suite.sql` showed every write attack blocked. It is a broken
> access-control finding a pentest would file, not a data breach.
>
> **2. The `[]`-on-error class, in six more reads — and every caller was already waiting to catch.**
> The 2026-07-30 pass fixed `getUserCreditPortfolio` and `getUserTransactionHistory`. The same shape
> was still live in `listAllDisputes`, `listRecentTransactions`, `listKybApplications`,
> `getMyDisputes`, `getMyOrders` and `getUserCertificates`. What each said when it failed:
>
> | Read | Rendered as | Whose problem |
> |---|---|---|
> | `listKybApplications` | *"No pending applications."* | a **seller's withdrawals stay locked** while the queue that unlocks them reports itself cleared |
> | `listAllDisputes` | *"No open disputes."* | a buyer's dispute is invisible to the admin resolving it |
> | `listRecentTransactions` | an empty refund console | — |
> | `getUserCertificates` | *"you have retired nothing"* | **and it made `CertificateView` call `generateMissingCertificates()`** for a user who already had them |
> | `getMyOrders` | *"you have no orders"* | an unfinished order is money the buyer already started to spend |
> | `getMyDisputes` | *"you have reported nothing"* | — |
>
> **The through-line is the same as 2026-07-30's:** `AdminRefundsView`'s `Promise.allSettled` +
> `loadError`, `MyDisputesView`'s catch, `OrdersView`'s catch and `CertificateView`'s catch were all
> **dead code that could never run** — precisely what `BuyerDashboardView`'s rejected branch was
> before it was fixed. The error handling had been written; the services never gave it anything to
> catch. Only `AdminKybReviewView` genuinely lacked a catch, and now has one plus a retry.
>
> **3. Then the same sweep across the compliance and developer surfaces — seven more reads.**
> The two sharpest are queues where an empty result is itself the finding:
>
> - **`listScreenings` (AML).** With `status: 'open'`, `[]` means *"no subject is awaiting a
>   compliance decision"*. A screening queue that reports itself clear because the query failed is
>   the precise failure an AML programme exists to prevent. `getWatchlist` is the other half:
>   screening against a silently-empty watchlist **matches nobody, forever**.
> - **`listDataSubjectRequests` (DPA erasure queue).** Every row on it has a statutory clock running,
>   and `[]` reads as "no outstanding requests". This is the same shape as the misnamed
>   `ACCOUNT_DELETION_SECRET` — erasure requests queuing invisibly while the record said otherwise —
>   reached from the frontend instead of from a secret name.
>
> Plus `getMyDataRequests` (a user shown no pending deletion asks again), `getMyOfftakes`,
> `getMyDataRoomActivity` (an access log reading "nobody viewed your documents") and
> `listProjectComments` — an empty revision thread reads as *"the verifier has asked you nothing"*,
> on the screen where revisions are requested and answered.
>
> **And the biggest surface of all: `getMarketplaceListings`.** A failed read rendered as
> **"no credits available"** — the buyer's primary screen, and the worst false statement a
> marketplace can make about itself. `MarketplaceViewEnhanced`, `ProjectsMapView` and
> `WatchlistView` all already rendered an error state for it; all three were dead code.
> `OrdersView` is the instructive counter-example — it opts out **explicitly** with
> `.catch(() => [])`, because there the listings are only enrichment for order titles. That is the
> right shape: the caller decides an absence is tolerable, rather than the service deciding it for
> everyone.
>
> `ProjectCommentThread.load` carried **two** bugs in one line: no `catch`, so a throw would have
> pinned it on "Loading conversation…" forever, and the `[]` beneath it. `AdminAmlView` used
> `allSettled` but surfaced nothing on rejection — its own comment said an unreadable watchlist
> "must not hide the queue", which was the right instinct applied to only one of the two halves.
> `PrivacyDataPanel` had no error path at all.
>
> Pinned by [`emptyOnErrorReads.test.js`](../src/test/services/emptyOnErrorReads.test.js) — 14 tests,
> including happy-path cases so none of this can degrade into a blanket throw.
>
> **Still returning `[]` on purpose, and correctly:** `assetLedgerService` and `mrvDashboardService`
> skip tables that may not exist yet (deliberate schema tolerance), and `getMyOrders` still returns
> `[]` when there is genuinely no signed-in user — that is an answer, not a failure. The distinction
> this pass is drawing is between *no rows* and *no answer*, not between empty and non-empty.
>
> ### 🔒 2026-07-30 — pre-pilot security + defect pass. FOUR FIXES, THREE FUNCTIONS TO REDEPLOY
>
> A senior-engineer / security read of the money path, the auth surface and the service reads.
> Suite **786 → 797** (68 files). Build green, lint 0.
>
> **The two that would have mattered with real users:**
>
> 1. **One payment could activate two subscription periods.** `paymongo-webhook`'s subscription
>    branch guarded with a read-then-act `intentRow.status === 'paid'` check, while
>    `activate_subscription()` is deliberately **additive** (`greatest(now(), plan_expires_at) +
>    period_days`). PayMongo delivers both `checkout_session.payment.paid` **and** `payment.paid`
>    with distinct event ids, so both clear event-level dedup and can race — each reading the intent
>    as unpaid. The wallet top-up branch **80 lines above it** already had the correct atomic claim;
>    the subscription branch never got it. Now claims the same way.
>
> 2. **`paymongo-checkout`'s `verify` action was unauthenticated.** It ran before any auth check,
>    with no rate limit, and returned the raw PayMongo session — payer **billing name, email, phone**,
>    amounts, line items — for **any** `cs_…` id supplied. Checkout session ids are not secrets; they
>    travel in redirect URLs, browser history and referrer headers. It was also an unmetered proxy
>    onto PayMongo's API on our secret key. Now: JWT required, caller must own the matching
>    `payment_intents` row (fails closed, 404 for both "missing" and "someone else's" so it is not an
>    oracle), rate-limited, and the raw session blob is no longer returned.
>
> **The other two:**
>
> 3. **A completed erasure could be recorded as pending forever.** `account-deletion` claimed rows
>    with an unconditional UPDATE, so two overlapping runs both reached `deleteUser()`; the loser's
>    "User not found" hit the failure path and reset the row to `pending`. A DPA erasure that *did*
>    happen would report as outstanding — a compliance-record bug, not a data bug. Now an atomic
>    claim, matching `mark_payout_processing()`.
>
> 4. **The `[]`-on-error bug class, in the two financially load-bearing reads.**
>    `getUserCreditPortfolio` and `getUserTransactionHistory` swallowed errors and returned `[]`.
>    The sharp end is the ESG export: a failed retirements query produced a **downloaded report
>    stating zero offsets**, worded "you have no credits to disclose yet". That is #11's outcome —
>    a wrong number on a document someone discloses — reached through the error path rather than the
>    slice #11 fixed. All three callers already handled rejection; `BuyerDashboardView`'s
>    `holdingsRes.status === 'rejected'` branch was **dead code that could never run**.
>
> **Also closed: #32**, without needing the owner decision it was waiting on. Instead of choosing
> between "enable the providers" and "hide the buttons", the forms now read GoTrue
> `/auth/v1/settings` and render only what the backend actually accepts (`useAuthProviders`, fails
> closed). Enable Google in the dashboard and the button appears with no redeploy.
>
> **And one row was the doc drifting, not the code: `P3` is already done.** All four
> `paymongo-checkout` actions derive identity from the verified JWT and throw when it is null. Only
> a stale comment said otherwise.
>
> > 🔴 **These fixes are INERT until three functions are redeployed** — the same lesson as the
> > migrations: `supabase functions deploy paymongo-webhook · paymongo-checkout · account-deletion`.
> > No deploy-order constraint (`functions.invoke` already forwards the session token, so the current
> > frontend works against the new function). One behaviour change: a buyer whose session **expired
> > during checkout** now sees "Authentication required" on the callback instead of a silent verify —
> > their payment still settles via the webhook, so the credits appear once they sign back in.
>
> **The through-line for this pass:** three of the four bugs were a correct pattern that existed in
> the same file — or the same function — and was not applied to the neighbouring branch. The guard
> was never missing from the codebase, only from one path.
>
> ### ✅ 2026-07-30 (evening, later) — ALL THREE FIXES ARE DEPLOYED AND CONFIRMED LIVE
>
> `paymongo-webhook`, `paymongo-checkout` and `account-deletion` are deployed. **The security fix was
> verified against the running function, not the source** — the `verify` action was attacked exactly
> as an outsider would, with the *public* anon key and a session id belonging to nobody:
>
> ```
> POST /paymongo-checkout {"action":"verify","sessionId":"cs_someoneElsesSessionId123"}
> → 401 {"error":"Authentication required"}
> ```
>
> Before the fix that same request returned the payer's billing name, email, phone and amount. Note
> the anon key is in the frontend bundle, so "authenticated" was never a barrier — the exposure was
> open to anyone who loaded the site.
>
> **Also settled: the payout worker cron is PROVEN, not merely scheduled.** `net._http_response` row 1
> — `status_code 200`, body `{"escrowReleased":0,"processed":0,"results":[]}`, fired `07:30:00`. And
> `reconcile_financials()` returns **0 rows** after the mock settlement of the 18-day-old payout, so
> the books survived it.
>
> **`account-deletion` has two gates, which the runbook did not say.** Platform JWT verification is on
> (unlike `process-payouts`, deployed `--no-verify-jwt`), so it needs `Authorization: Bearer <anon>`
> **and** `x-worker-secret`. Confirmed: no auth header → platform `401 UNAUTHORIZED_NO_AUTH_HEADER`;
> valid JWT + wrong secret → the function's own `401 Unauthorized`.
>
> **The `ACCOUNT_DELETION_SECRET` fix failed on the first attempt, and the failure looked like
> success.** The value was set on the existing, wrongly-named `account-deletion` secret instead of
> under the correct name — so `secrets list` showed a fresh timestamp on a key nothing reads. It read
> as fixed and was not. **A recent `updated_at` on the wrong name is not evidence.** Same shape as
> everything else found today, one layer further out again.
>
> ### ✅ 2026-07-30 (evening) — THE PAYOUT WORKER IS LIVE. Step 0 is closed.
>
> `process-payouts` is deployed, secret-gated and on a `*/15` `pg_cron` schedule (jobid 1, active).
> Verified **three** ways because one is not enough: correct secret → **200**, wrong secret → **401**,
> `GET` → **405**. The negative cases were run deliberately — this project's own lesson is that a
> check which never had the opportunity to be red proves nothing.
>
> **The first real run settled an 18-day-old payout**, and that is the finding worth carrying.
> `d63ce676…` (₱3,123, GCash) was created **2026-07-12** and sat in `requested` until the worker's
> first run on **2026-07-30**. It is the owner's own test account, so nobody was harmed — but the
> documented failure mode ("no error, no alert, the seller simply never gets paid") had **already
> happened to a real row** before anyone scheduled the worker. It settled through the MOCK provider,
> so the row reads `settled` and no money moved; it belongs in the test-data purge.
>
> **🐛 `account-deletion` had never been able to run either.** The function reads
> `ACCOUNT_DELETION_SECRET`; the project had a secret named **`account-deletion`**, which nothing
> reads. Fail-closed logic meant every call was a 401, so every DPA erasure request queued forever —
> while the doc set listed export/deletion as shipping with only NPC registration outstanding. Fixed.
>
> **Three "built ≠ live" defects in one day** — the unscheduled payout worker, the undeployed code
> fixes, and a secret under the wrong name. The repo was right about all three; production was not.
> Nothing in the test suite could have caught any of them, because none of them are code.
>
> ✅ Also confirmed by inspecting `secrets list`: **`ALLOW_UNSIGNED_WEBHOOKS` is unset** (the required
> state, not `false`), `PAYMONGO_WEBHOOK_SECRET` is set, and `RECONCILE_WORKER_SECRET` is set — three
> pre-flight checklist items closed without a click-through.
>
> ### ✅ 2026-07-30 (later) — #31 decided and built · negative RLS suite RUN
>
> **A farmer is a SELLER, not a buyer** (owner decision). They supply feedstock and do not trade
> credits — the same position as a project developer. `ROLES.FARMER` added to
> `FINANCE_RESTRICTED_ROLES` in `src/router/index.js`.
>
> **Zero navigation regression, and that is the point.** `isBuyerRole()` already excluded farmers,
> their sidebar is Feedstock + Insights with none of the 10 buying routes, and the account menu gave
> them no wallet. **Only the router guard disagreed** — so a farmer could reach checkout by typing
> the URL while nothing anywhere offered it. That contradiction, not a missing feature, is what #31
> was about. Pinned by `farmerIsNotABuyer.test.js`, which asserts *both* layers so they cannot drift
> apart again.
>
> **`rls_negative_suite.sql` was run against live — 5 PASS, 3 UNPROVEN, 0 FAIL.** Every write attack
> was blocked: minting into `project_credits`, repricing another seller's listing, forging a
> `credit_retirements` row, crediting its own wallet ₱1,000,000, and self-promoting to admin (the
> last two blocked outright by RLS, `42501`).
>
> The three UNPROVEN are the **read**-isolation probes, and they are honest rather than reassuring:
> the victim account the script picked has no wallet row, no holdings and no third-party trades, so
> "you could not read it" proves nothing. This is the file's own design working as intended — the
> `escrow_verification.sql` row-3 lesson built in from the start. **Re-run mid-pilot**, once a real
> user has data worth hiding, to convert those three.
>
> ⏸️ **Signups + sender domain are deferred** — the owner has not bought the domain yet. Deliberately
> held together: enabling signups while confirmation is required and no sender is verified is the
> worst of the three states. Steps 0, 1, 4 and 5 of [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) all
> proceed without a second user.
>
> ### ⚠️ LIVE BEHAVIOUR CHANGED 2026-07-26 — validating a project no longer issues credits
>
> **Read this before testing anything on the issuance path.** Both issuance triggers had been live at
> once (backlog #17): `trg_activate_validated_project` minted a credit pool *and* an active
> marketplace listing when a project was validated, and `trg_mint_credits_on_ver_approval` minted
> again when a VER was approved — the same tonne issued twice. `20260604010100` had deliberately
> retired the validation trigger; `20260626000500` brought it back as a side effect of fixing an
> unrelated `credits_available` column bug, and nothing ever dropped the VER one.
>
> `supabase/diagnostics/issuance_model_audit.sql` was run against live and found the exposure real but
> **never exercised** — nothing double-issued, nothing sold — so
> `supabase/cutover/adopt_mint_on_ver.sql` was applied with no reconciliation needed. The audit now
> returns zero rows.
>
> **What is different now:** a validated project mints nothing and does **not** appear on the
> marketplace. Credits exist only once a verifier approves a monitoring report's VERs. Pools and
> listings created before the change are untouched, so a project validated last week behaves
> differently from one validated today — worth saying to any pilot developer before they report it as
> a bug.
>
> ### ✅ MERGED AND DEPLOYED 2026-08-01 — `main` is current and production is running it
>
> [PR #14](https://github.com/johnlouiecaparoso/carbonify13/pull/14) is **merged** (`c640f9c`).
> `main` was 153 commits behind; it is now **0 behind** the feature branch. The three-week
> "built ≠ live" gap that headed this doc set is closed.
>
> **Production verified by fetching it, not by trusting a green check.** `carbonify13.vercel.app`
> serves `sw.js` with `CACHE_VERSION = 'v4'` (a 2026-07-31 change that could not exist on the old
> `main`), and its main bundle contains `policy_acceptances` and `consent gate` — code that has never
> been on `main` before today. The router-guard fix, the consent gate, the onboarding guides, the KYC
> document viewer and the PWA fixes are live.
>
> ⚠️ **The deploy you get is the Vercel GitHub integration, NOT the `deploy` job in
> [`ci.yml`](../.github/workflows/ci.yml).** That job failed in 7 seconds with
> `Input required and not supplied: vercel-token` — `VERCEL_TOKEN` has never been set. It was dead
> twice over: gated behind a Lighthouse job that could never pass (fixed today), and missing its
> credentials. **Expect a red X on `main` from that one job while production deploys correctly
> anyway.** Either set the three `VERCEL_*` secrets or delete the job — do not read its red as a
> failed deploy. Two deploy paths where one is undeclared and the other has never run is the same
> shape as everything else on this page.
>
> **First fully-green CI run on `main` in this repo's history**, incidentally: `test (20)`,
> `test (22)`, `e2e`, `build` and `lighthouse` all passed. Every previous run on `main` — all 20,
> back to 2026-02-12 — had failed.
>
> ⚠️ **"Pushed and in sync as of 2026-07-28" was wrong when written.** The 2026-07-30 push moved the
> remote `b8cdab8 → ee9fd6d`, i.e. **five** commits — three from that day's audit *plus* `344b9de`
> and `3958760`, which had been sitting local-only since 07-28. The a11y fix and the e2e-suite work
> were not on the remote, and no one knew. Same class as everything else this doc records: a written
> claim about a system state that nothing re-measured. `git status -sb` settles it in one second.
>
> > ### ✅ 2026-07-29 (evening) — THREE MIGRATIONS APPLIED TO LIVE. One follow-up is now urgent.
>
> The owner applied, in order, against the live project — each returning clean, with
> `reconcile_financials()` = **0 rows** afterwards:
>
> | Migration | What it turns on |
> |---|---|
> | `20260725000200_restore_escrow_hold_window` | **Escrow (#14) is LIVE.** Card sellers' net now routes to `escrow_held`. |
> | `20260729000100_feedstock_payment_record` | **#26/#29 are LIVE.** Two-sided farmer payment record + `/admin/feedstock`. |
> | `20260718001100_credit_tx_profile_fk_reload` | Receipt embed resolves; the console 400/406 is gone. |
>
> **Also settled the same evening:** the §0.4 eleven-migration verify query returned **`true` on all
> eleven rows**. The 2026-07-22 role-audit batch *is* applied — so the LGU jurisdiction guard and the
> admin segregation-of-duties guard are live, not silently inert. §0.4's "NOT yet applied" heading is
> stale; treat that batch as done.
>
> ### ✅ RESOLVED 2026-07-30 — `process-payouts` is deployed, scheduled and PROVEN
>
> This section was the project's top red item for two days. It is closed. `release_matured_escrow()`
> is called every 15 minutes by `pg_cron` job `carbonify-process-payouts` (jobid 1, active), and the
> HTTP response was verified — **`net._http_response` row 1: `status_code 200`**, body
> `{"escrowReleased":0,"processed":0,"results":[]}`, fired `07:30:00`. Not "scheduled", *succeeding*.
>
> Full procedure and troubleshooting: [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) Step 0.
>
> **The four escrow behaviour checks ([ESCROW_DECISION.md §6](ESCROW_DECISION.md)) remain UNRUN:**
> card→held, push→immediate, matured release, refund-while-held. The *releaser* is now proven; what
> escrow does to a real purchase is not. **Do not invite a pilot seller until it is.** This is now
> the single largest untested surface in the money path.
>
> ### ✅ RESOLVED 2026-07-31 — nobody could sign up, and this doc set said the opposite
>
> **Fixed on the backend 2026-07-31**: `disable_signup: false`, `mailer_autoconfirm: true`. Kept in
> full below because the lesson outlives the defect — this doc set asserted the opposite of live for
> weeks, and nothing re-measured it. The fix took two dashboard toggles; *finding* it took running a
> test suite nobody had run to completion.
>
> Found 2026-07-29 by running the Playwright suite, which had never been run to completion in this
> project's history. Measured off the live project's public `GET /auth/v1/settings`:
>
> | Setting | Live | Every doc said | Consequence |
> |---|---|---|---|
> | `disable_signup` | **`true`** | assumed signups work | **Every closed-beta invite is rejected** — *"Signups not allowed for this instance"* |
> | `mailer_autoconfirm` | **`false`** (confirmation REQUIRED) | "email confirmation is off by choice" ×4 places | Confirmation enforced **with no verified sender domain** |
>
> The whole of Step 4 — "invite 8–15 people covering all seven roles" — was unrunnable, and no
> document, diagnostic or test knew it. Fix order and the interaction between the two settings:
> [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) Step 2. Guarded from now on by
> [`pilot-readiness.spec.js`](../src/test/e2e/pilot-readiness.spec.js), a read-only check that creates
> no account.
>
> **This is the same bug class as everything else on this page, one layer further out.** Not a service
> read returning `[]` and rendering as a fact about the user — a *document* asserting a fact about live
> that nothing ever re-measured. The pre-flight checks migrations, RLS and books; it never asked
> whether the front door opens. `1c–1g` are "check by hand", and by hand nobody checked.
>
> **One correction in your favour:** the go/no-go gate lists *"email confirmation re-enabled"* as an
> open P0. It is already on — only the verified sender domain is outstanding.
>
> ### ✅ Pre-flight re-run and READ — 11 of 12 PASS, 1 outstanding
>
> The first run was misread: the editor shows only the last statement's result, so pasting the whole
> file surfaced nothing but the §6 project list. `pilot_preflight.sql` now ends with a **§7 SUMMARY**
> that rolls every verdict into one statement, so a whole-file paste shows the verdicts. Re-run
> 2026-07-29:
>
> **PASS ×11** — books reconcile · webhook health · `000600/000700` · `000000` · `001100` · RLS on all
> 7 money tables · no client writes · no blanket writes · escrow applied · escrow in the settlement RPC
> · feedstock record. **Row 11 (release worker) is the only one outstanding**, and it is Step 0 of
> [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md).
>
> `escrow_verification.sql` and `feedstock_verification.sql` were also run: no FAILs, and every `INFO`
> is "you have not run that click-through yet" rather than a defect. `daily_beta_health.sql`: all OK.
>
> ### 🐛 A diagnostic reported a FALSE PASS, and the bug is worth carrying
>
> `escrow_verification.sql` row 3 — *"Release worker running"* — returned **PASS** with the detail
> *"no matured hold is sitting unreleased"*, while row 4 on the same run said *"no holds yet"*.
>
> **It was reporting PASS across an empty table.** Zero holds means zero overdue holds, so the check
> proved nothing and said everything was fine. That is the **same bug class the 2026-07-26 role review
> found in five service reads**: an empty result rendered as a fact rather than as an absence of
> evidence. It appeared here in a file written *to guard against* exactly that.
>
> Row 3 now returns **UNPROVEN** when `escrow_holds` is empty and can only reach PASS once a real hold
> has existed. **A green diagnostic is not evidence unless it had the opportunity to be red.**
>
> ### 🐛 The scheduling instruction was wrong — `process-payouts` is not a one-click schedule
>
> This file, the runbook and the roadmap all said "Dashboard → Edge Functions → Schedule". Reading
> [`process-payouts/index.ts:40`](../supabase/functions/process-payouts/index.ts) shows that is not
> enough: the worker rejects any request that is not a `POST` **and** whose `x-worker-secret` header
> does not match `PAYOUT_WORKER_SECRET` — and **if that env var is unset, the guard treats every call
> as unauthorized.** A schedule that just "calls the function" therefore **401s every 15 minutes
> forever, releasing nothing, with no error anywhere a human would look.**
>
> Corrected everywhere, and the full procedure is now a file:
> [`supabase/cutover/schedule_payout_worker.sql`](../supabase/cutover/schedule_payout_worker.sql)
> (`pg_cron` + `pg_net`, with the queries that prove the job is *succeeding* rather than merely
> *running* — a job that 401s still reports `succeeded` in `cron.job_run_details`, so the truth is in
> `net._http_response`).
>
> **Also worth knowing about that worker:** its payout disbursement is still the **mock provider** —
> it marks a payout settled unless the destination account number is the literal string `FAIL`. Correct
> for a test-key beta, but a "settled" payout is not money that moved.

### 🆕 2026-07-29 — the feedstock record is two-sided, and the farmer finally has somewhere to go

Closed **#26's two follow-ups** and **#29** — the block [OPEN_WORK_REGISTER.md](OPEN_WORK_REGISTER.md)
called the sharpest ethical item on the project. Tests **770 → 786**, lint and build green. One
migration: [`20260729000100_feedstock_payment_record.sql`](../supabase/migrations/20260729000100_feedstock_payment_record.sql).

**✅ Applied to live 2026-07-29** (see the box above), together with the escrow migration. The farmer's
Confirm/Dispute buttons and `/admin/feedstock` are live. **Behaviour not yet clicked through** — the
verification steps are in the migration header.

**1. The payment record is two-sided.** `payment_status` stays what it always was — the *buyer's*
assertion that they settled off-platform — and `farmer_payment_ack` is the farmer's answer to it. The
portal no longer renders one party's word as the platform's finding: the badge reads **"buyer says
paid"** in amber until the farmer responds, and only a farmer-confirmed payment gets the settled
green. "Paid to date" became **"Recorded as paid"** and now says how much of that total the farmer has
not agreed to.

**The dispute path covers both failure modes, and the second is the one that had no expression at
all:** "you said you paid me and you did not", *and* **"you confirmed my delivery and never claimed to
have paid"**. The second is the more common real-world case — a confirmed delivery simply going quiet.

**2. #29 — `/admin/feedstock`.** Read-only oversight plus one write: recording what staff established.
`unpaid_confirmed` **reverses a buyer's false "Paid"**, which is the entire reason the escalation point
had to exist. A resolution must carry a note, and both parties are notified — the outcome is a finding
about both of them.

**3. The ToS and the modal moved in lockstep** — POLICY_AND_USER_AGREEMENT **§1.14** and **§6 of the
in-app modal**, stating that Carbonify does not hold, transfer or guarantee feedstock payment and that
§1.5–§1.6 escrow/refund/payout are **credit-side only**. §1.5 now points at §1.14 so a farmer reading
about escrow is not left assuming it covers them.

> **The finding worth carrying: the structural blocker was avoidable.** #26 recorded that a feedstock
> dispute is *structurally impossible* because `disputes.transaction_id` is
> `not null references credit_transactions(id)` — and that reading is what made this look like a phase
> of work rather than a day of it. It closed **without touching `disputes` at all**: the disagreement
> is recorded on the delivery, where it happens, and escalates through notifications and an admin
> screen. Coupling a physical-goods dispute to the credit chargeback table would have dragged the
> feedstock path into the money path this decision exists to keep it out of. **A backlog entry that
> names a specific blocking change is one proposed route, not the shape of the problem.**

**Two things checked and found stale while working** (both corrected in the register): `ErrorBoundary`
is **not** commented out — it is mounted in `App.vue`; and `main.js` no longer monkeypatches
`window.fetch`, which its own comment explains. #15 still stands on `errorStore` and inconsistent
service error handling, but two-thirds of what that entry describes was fixed without the entry being
updated. The nullable-client guard is now **~162×**, not 233.

**Not done, deliberately:** the farmer-side surfaces are English-only (#27), so a smallholder disputing
a payment does it in a second language. That is the sharpest remaining instance of #27 and the reason
the register puts farmer + LGU first.

### 🆕 2026-07-28 — three backlog defects closed, and one of them was mis-scoped

Worked the in-repo lane of the new [OPEN_WORK_REGISTER.md](OPEN_WORK_REGISTER.md). Tests **757 → 770**,
lint and build green throughout. **#26 was decided the same day** (see below) but deliberately not built.

**#11 was not the bug its entry described, and that is the finding worth carrying.** The entry read
"a heavy trader's retirements disappear from the combined view" — a list-length problem.
`getUserTransactionHistory` fetched `limit` purchases and `limit` retirements, merged, sorted
newest-first, then sliced the **combined** list, so purchases newer than the retirements pushed every
retirement out. But its **only caller is `esgReportService.buildEsgDataset`**, which derives
`retiredCredits`, `retiredTco2e` and the by-project groupings from exactly those rows. **The ESG
report a corporate buyer exports as evidence of their offsetting was silently under-reporting the one
number it exists to state.** Nothing errored, nothing looked missing.

The suite could not see it — `esgReportService.test.js` injects a fake service, so the broken function
never ran. The new test drives it through a mocked client; with the slice restored it reports
**0 credits retired for a user who retired 8**. **The dual-source half of #11 is still open** —
`creditOwnershipService` reads `credit_purchases`, `transactionHistoryService` reads
`credit_transactions`, and both export a function of the *same name*, which is how this stayed hidden.

**#10 — closed differently than proposed.** The defect was worse than "bypass the accessible modal":
15 `.modal-overlay` dialogs across 9 files and **not one handled Escape**, including wallet top-up and
withdraw, so a keyboard user could not dismiss a payment dialog. `AccessibleModal.vue` had exactly one
adopter. Adopting it everywhere was the wrong fix — these overlays wrap `<TopUp>`, `<Withdraw>` and
`<ListingManagerModal>`, which render their own headers, so it would have given each a duplicate
header and turned an accessibility fix into a visual rewrite. Instead
[`v-modal-a11y`](../src/directives/modalA11y.js) adds Escape (topmost dialog only), Tab wrapping with
focus pulled back if it escapes, `role="dialog"`, focus restore and scroll lock — one attribute per
dialog, no markup change. It queries focusables **live per Tab**; the existing
`focusManager.trapFocus` caches at open and would miss content that appears after mount.

**#9 — three real divergences, not just duplication.** `src/utils/format.js` replaced `peso()` ×15,
`shortDate()` ×11, `round2()` ×10, `num()` ×10, `formatCurrency()` ×5. What it fixed:
`BuyerDashboardView` rendered money at **one decimal place** (`₱1,234.5`); `FinanceConsoleView` and
`MarketDashboardView` grouped digits by the **viewer's browser locale**, not en-PH; and
`AdminRefundsView`'s `shortDate` was date **+ time** while every other view's was date-only — one
name, two outputs. `pesoCode()` (VAT invoices carry the ISO code) and `pesoWhole()` (CAPEX) are
deliberate variants, now named rather than duplicated.

**Not done, deliberately:** **#30** (61 remaining dead exports) — lowest value in the lane and highest
risk; the previous pass computed line ranges, corrupted two files and needed a restore from backup.
Start it fresh, with exact-string edits. **#26's two follow-ups** (the ToS/modal pairing and the
two-sided payment record) remain open by decision, not oversight.

### 🆕 2026-07-26 — role-by-role live-readiness review, all six roles

Buyer, project developer, verifier, farmer, LGU and admin, each asked the same three questions: is it
deployable, are there errors/bugs/dead code, and would someone in that role be satisfied. **30 commits**
(`3fe8ff5`…), 118 files, **4,212 insertions against 11,631 deletions**, unit tests **703 → 757** plus a
new 9-check runtime smoke. Build and lint green throughout.

**The one that mattered: #17, closed.** See the LIVE BEHAVIOUR CHANGED box above — both issuance
triggers were live, so validate-then-approve issued the same tonne twice. Found during the verifier
pass, audited against live, fixed by `supabase/cutover/adopt_mint_on_ver.sql`. Nothing had been
double-issued.

**One bug class ran through every single role**: service reads that swallow their error and return
`[]` or zeros. On these screens that does not read as "something went wrong", it reads as a fact
about the user — "No sales yet", "₱0.00 available", "No parcels registered yet", "you have no
accepted quotes", "no audit entries". Fixed in the seller, farmer, biomass, LGU and admin paths. The
sharpest instances: `getMyAcceptedRfqs` failing removed a farmer's only route to logging a delivery
they were owed for, while telling them no buyer had accepted anything; `getMyKyb` failing told an
already-verified seller they were unverified and disabled their withdrawal; and `searchAuditLogs`
returning `[]` meant an investigation concluded no such events existed.

**Also fixed:** the app was deleting its own service-worker caches on every load (offline support had
never once worked); the favicon and PWA icons were a JPEG named `.png` with a transparency
checkerboard baked in; the CSP was `Report-Only` with no reporting endpoint, so it collected nothing —
now enforced, after fixing a placeholder GA measurement ID that would have violated it on every page;
32 dead files and five unreachable routes deleted, including one serving fabricated impact figures and
one public test page; four verifier decision paths reported committed decisions as failures when only
the list refresh failed; and `/monitoring` and the whole LGU buying path were reachable by URL but in
no sidebar.

**Recorded, not built — decisions rather than defects:** #20 (cart charges per listing), #21 + `paymentService` (provider layer is test-only), #22 (sellers get no invoice), #23 (no developer forward view), #24 (verifiers cannot see their own decision history), #25 (reviews are not assigned), **#26 (farmers are not paid through the platform — a flag the buyer sets, no escrow, no dispute path)**, #27 (i18n absent; Filipino missing), #28 (LGUs are never told a project appeared in their jurisdiction), **#29 (the feedstock side has no admin surface at all — the escalation point for #26 does not exist)**, #30 (~100 unused exports).

**#26 was the highest-value next decision, and it was answered on 2026-07-28: Carbonify is an
introduction-and-records layer for feedstock, not the payment rail.** Buyers and farmers settle
directly; Carbonify records it. That ratifies the current implementation, so nothing was built — but
it converts two items from optional to load-bearing, and **neither is done**: (1) the ToS and the
in-app policy modal must state it, and they move in lockstep so one of the pair is `src/App.vue`;
(2) the "Paid" flag must stop rendering a buyer's one-sided assertion as settled fact — the farmer
can currently neither acknowledge nor contest it. It also scopes **#29** down to a read-only admin
feedstock view plus a way to record an off-platform resolution. Full record in
[DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #26.

*Established while taking the decision:* a farmer non-payment dispute is **structurally impossible**,
not merely unrouted — `disputes.transaction_id` is `not null references credit_transactions(id)` and a
delivery has no such row. Any dispute path for deliveries needs a schema change under either answer.

Per-role feature gaps continue to live in [role-needs/](role-needs/) — now including
[06-farmer.md](role-needs/06-farmer.md), which did not exist before this pass.

**Then a documentation reconciliation across all 75 markdown files**, which turned up two *code* bugs
the role passes had missed:

- **`AdvancedSearch.vue` was dead and un-findable by tooling.** Its only reference anywhere was the
  `vite.config.js` manualChunks pin, which an import-graph scan counts as a use — so the orphan scan
  reported zero orphans while a 347-line component sat unreachable. [CODE_AUDIT_2026-07-09.md](CODE_AUDIT_2026-07-09.md)
  had called this exactly, including the warning that component and config line must go together or
  the build breaks. That audit now carries a resolution banner instead of edits: its dead-code list
  was right, and its value is that it called all of this two and a half weeks early.
- **`vue-chartjs` was an unused dependency** — the chart components import `chart.js` directly.
  Removed from `package.json`.
- **Four documented environment variables have never done anything.** `VITE_API_BASE_URL`,
  `VITE_ENABLE_ANALYTICS`, `VITE_ENABLE_ERROR_REPORTING` and `VITE_ENABLE_PERFORMANCE_MONITORING`
  were read only by `config/environment.js` and `config/production.js` — files nothing imported.
  They are marked "No effect" in [dev/ENVIRONMENT_VARIABLES.md](dev/ENVIRONMENT_VARIABLES.md) rather
  than deleted, so anyone with them in a `.env` knows they can go. **If you have
  `VITE_ENABLE_ANALYTICS=false` set expecting it to suppress analytics, it is not doing that.**

**The user guides needed almost no correction — because they already described the model #17 made
true.** `04-verifier-guide.md` states "Validating a project does not itself mint credits… Credits are
only minted later when you approve an MRV report." That was false on live until this morning's
cutover. The guides had been written against the intended design all along, which is further evidence
the resurrected validation trigger was an accident. Added the missing
[07-farmer-guide.md](user-guide/07-farmer-guide.md); corrected `06-lgu-guide.md`, which documented
four dashboard tabs when there are six.

**First runtime verification of the whole session** (`a7631b8`): `src/test/e2e/runtime-smoke.spec.js`
runs the app and checks seven public routes for console errors (**zero** — notable because the
`console.error` monkey-patch that used to hide them was removed today), asserts every manifest icon
really begins `89 50 4E 47` (this test would have **failed** yesterday — they were JPEGs named
`.png`), and asserts the service worker registers **at most once** (it was registered three times).
Public routes only; an authenticated pass through checkout, retirement and certificate generation is
still unrun.

**Backlog additions from the whole pass: #20–#31.** The two that matter most are unchanged: **#26**
(farmers are not paid through the platform) and **#29** (the feedstock side has no admin surface, so
#26 has no escalation point). **#31** was recorded rather than fixed — farmers have exactly the
buying-path contradiction that was fixed for LGU users, but without the evidence that justified
fixing it.

> ### 🆕 2026-07-26 (later) — accessibility close-out, a mobile header bug, and a one-shot pre-flight

Follow-on to the consistency pass below, same branch. Build green, lint green,
**703 tests** (693 + 10 new contrast assertions). Committed as `bb19629`,
`f28a684`, `806546b`, `a2c2eee`.

**1. #19 closed — the palette clears WCAG AA.** `--primary-color` went
`#069e2d` → `#058526` (3.54:1 → **4.78:1** on white), with `--primary-hover`
→ `#04701f` (6.28:1) and `--primary-dark` → `#045c1a` (8.23:1);
`--text-muted` went `#718096` → `#64748b` (4.02:1 → 4.76:1). **Two traps, both
hit:** (a) darkening `--primary-color` alone would have left `--primary-hover`
*lighter* than the resting state, so the whole ramp had to move together; (b)
the token was not the only source of the colour — of 411 `#069e2d` occurrences
only 290 were `var()` fallbacks, and the **121 bare literals** would have kept
the old light green and re-created the two-toned app the pass below had just
fixed. 62 bare `#718096` and 110 `rgba(6,158,45)` tints likewise. New guard:
[tokenContrast.test.js](../src/test/styles/tokenContrast.test.js) parses
`tokens.css` and fails the suite on a regression.

**2. 🐛 A real bug found while clearing "orphaned CSS": banners were BIGGER on
phones than on desktop.** The 2026-07-25 header-shrink pass pinned the
*desktop* rule to 1.5rem/0.95rem but never touched the `@media` blocks, so
pre-shrink sizes survived there and won on small viewports — Marketplace
`2rem` @768px and `1.75rem` @480px (plus banner padding `1.5rem → 2rem`), Retire
`var(--font-size-3xl)` @768px. The "header eats the viewport" problem that pass
set out to fix was still live on mobile. Both now inherit the desktop values;
measured at 390px wide the marketplace title is 24px, was 28px. ProfileView's
`1.35rem` @768px was left alone — that one is a deliberate step *down*. Also
removed 10 genuinely redundant single-declaration overrides. **Note the
handoff's own follow-up line was wrong:** only 1 of the 26 PageHeader adopters
still carried leftover CSS, not six.

**3. Dead demo files deleted (backlog #8).** `authServiceSimple.js` (hardcoded
`demo@carbonify.io` login) and `sampleDataService.js` (fake Amazon/Brazil seed
projects) are gone. `src/test/e2e/auth.spec.js` was **kept** — only 1 of its 9
tests used the demo credentials; the other 8 cover navigation and validation.

**4. 🆕 One-shot pilot pre-flight —
[`supabase/diagnostics/pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql).**
Read-only. Bundles runbook §1a/§1b, the money-table RLS posture, the escrow
apply-status question and the `20260718*` apply-status question into one paste,
each printing a `verdict` column instead of raw rows. **1c–1g stay manual**
(edge functions, PayMongo keys/webhook, `ALLOW_UNSIGNED_WEBHOOKS`, Sentry,
frontend deploy). While writing it: the runbook's §1b snippet queried
`webhook_events.created_at`, **a column that does not exist** (it is
`received_at`) — that snippet would have errored on paste. Corrected.

> ⚠️ **Still owner-only, unchanged:** applying `20260725000200` (escrow),
> running the pre-flight, and the beta itself. The Supabase account available
> in the dev environment has access to two unrelated projects (SPMS, BSC), not
> Carbonify's `fmngptolarydbgrtltnd`, so none of the live-DB steps could be
> executed here.

### 🆕 2026-07-26 (UI consistency pass) — one green, one list pattern, one control height
>
> Cosmetic + component work across every role, on `feature-user-onboarding-ux`. No
> money-path, schema or service changes; all of it is Vue/CSS. Build green, lint
> green, **693 tests** (687 + 6 new for the extracted list component).
>
> **1. One brand green — 27 page banners, and 28 stray literals.** The reported symptom
> was that Submit a Project looked darker than everything else. The scan found *four*
> different treatments: `--primary-dark` flat (#04773b — Submit a Project, Developer
> Projects), a `primary → primary-hover` gradient (Marketplace, Registry, Profile,
> Calculator, LGU, Admin, Finance, Market Dashboard), a `primary → primary-dark`
> gradient (Credit Portfolio), and a hardcoded `#069e2d → #0b7a27` (Biomass hero).
> Thirteen more used `var(--primary-color, #10b981)` — a Tailwind emerald fallback
> that appears nowhere in the palette. **All 27 now carry the single declaration from
> [PageHeader.vue](../src/components/layout/PageHeader.vue): `background: var(--primary-color, #069e2d)`.**
> Separately, `#10b981` was swept out of the rest of the app (28 occurrences) — most
> visibly the **nav logo text and avatar ring** in [Header.vue](../src/components/layout/Header.vue),
> which were rendering a different green from the brand on every page, plus admin
> active tabs, the spinner, progress bars, toasts, the connection indicator, map pin
> fills and wallet/prompt status colours. They now use `--primary-color` /
> `--success-color` (both #069e2d).
>
> > ✅ **The trade-off this created was closed the same day.** Unifying the banners
> > returned Submit a Project and Developer Projects to 3.5:1 subtitle contrast — the
> > same as the other 25. That gap was app-wide, so it was fixed in the token: the
> > whole green ramp was darkened later on 2026-07-26 and `--primary-color` now
> > measures **4.78:1**. See the entry below and
> > [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #19 (closed).
>
> **2. A reusable collapse-and-scroll list — [CollapsibleList.vue](../src/components/ui/CollapsibleList.vue).**
> The "compact list + See more" pattern from the 2026-07-25 records compaction was
> being re-implemented per view. It is now one component: it **measures** the rendered
> rows (row N's bottom edge minus the viewport top, plus scroll offset) instead of
> assuming a row height, so a wrapping row still leaves exactly N rows visible. Props
> `count` / `visible` (default 4) / `rowSelector` (default `tbody > tr`, so card lists
> work too); a `ResizeObserver` re-measures and the box re-collapses when the list
> changes. Applied to **Finance Console** (transactions + reconciliation drift),
> **Audit Logs**, **Emission Factors** (System Config) and **Refunds & Disputes**
> (transactions, open disputes at 2, resolved). Registry's certificate table got the
> same treatment inline earlier the same day (kept separate: its toggle reads "Show
> more" by request).
>
> Two traps worth knowing if you extend this:
> - The component **replaces** existing `.table-scroll` wrappers rather than nesting
>   inside them. An element with `overflow-x: auto` becomes the scrolling ancestor for
>   `position: sticky`, so wrapping one silently kills the pinned table header.
> - Sticky `th` needs an **opaque background** or rows scroll straight through the
>   header text. Three of the four tables had none (Audit Logs put it on `thead`, which
>   doesn't travel with a sticky `th`). The component supplies a default, overridable
>   with `--collapsible-head-bg`.
> - **Audit Logs already had a "See more"** that loads the next 25 rows — a different
>   action. Relabelled to **"Load N more"** so two buttons don't share one name.
>
> **3. Marketplace filter bar realigned.** Eight controls in one `flex-wrap` row with
> different intrinsic widths wrapped 3 / 4 / 1, and the buttons were ~46px against
> 42px selects. The six filters are now a fixed `repeat(3, 1fr)` grid (3 → 2 → 1
> columns), the two actions moved to their own centred row, and every control is 42px.
> **This is why it looked wrong specifically to project developers** — the role-gated
> *Submit Project* button was the item that pushed the grid out of alignment.
>
> **4. Submit a Project — density + a dead class.** `two-columns` is used four times
> in [ProjectForm.vue](../src/components/ProjectForm.vue) (dates, capacity + unit,
> CAPEX + OPEX) and **was never defined in any stylesheet** — every pair had been
> stacking full-width, doubling the form's height. Defined, plus a density pass: field
> gap 24→14px, section blocks 24→16px, form padding 32→20/24px, card padding
> 1.25rem→0.85rem, textarea min-height 120→84px with `resize: vertical`, and the 2rem
> `.form-spacer` above the buttons removed. Inputs stay at 15px with a mobile override
> to 16px so iOS doesn't zoom on focus.
>
> **5. Credibility section (same form) — helper text unified.** `.field-help` (12px,
> +4px), `.field-hint` (13.6px, **−4px**, different grey) and `.subsection-hint` were
> three styles for one thing; they are now one rule. The section header's title and
> hint had zero gap; the `UiInput` field rendered taller and heavier than the selects
> beside it (0.75rem/2px/10px vs 0.6rem/1px/8px) — normalised via a scoped `:deep()`.
> Grid is now three explicit columns instead of `auto-fit`, which had broken 2-then-1.
>
> **6. LGU land-use tab.** `.results` shared a `justify-content: space-between` flex
> rule with `.esg-header`, so the tiles sized to their own text and drifted apart; it
> is now a grid identical to `.esg-grid` (this also fixes the MSW Calculator's four
> tiles). "+ Add parcel" floated a rem above the Horizon field because the field
> carried a stray `margin-bottom`; parcel rows were doubly spaced for the same reason
> (the file's existing `.form-grid .form-group` fix didn't match `.landuse-row`).
> **One real bug:** parcels were keyed by array index with a Remove button, so
> deleting a middle parcel made Vue reuse the removed row's DOM — parcels now carry a
> stable id.
>
> ### 🆕 2026-07-25 (repositioning) — Carbonify is a commercial product, not an academic capstone
>
> The project's own documentation and its **in-app policy modal** still described Carbonify as a
> *"pre-production / demonstration platform (academic capstone stage)"* serving *"simulated"* credits.
> That framing was stale, and it was the first thing a prospective business user would have read.
> Repositioned across the app and the docs.
>
> **What changed — framing, not facts.** The two genuine limitations are still disclosed, because
> removing them would be a material misrepresentation to exactly the institutional users this
> repositioning targets:
> 1. credits are issued by Carbonify's own MRV/verification workflow and are **not yet registry-backed**
>    (Verra/VCS, Gold Standard, CAR, ACR);
> 2. payments run against **PayMongo in test mode** during the closed beta.
>
> What went away is the *self-description* as a student project, a demo, or a simulation.
>
> - **[App.vue](../src/App.vue) policy modal rewritten** — the status notice now reads as a closed
>   commercial beta with two named limits. Also corrected against the real build: **7 roles** (farmer
>   was missing), MFA described as **enforced at step-up** rather than "recommended", the
>   **self-purchase / wash-trading block** stated, the method-gated **escrow hold** described
>   (Held vs Available), refunds/disputes described as **shipped** rather than "planned", and DPA
>   self-service export/deletion described as **available** (only the formal DPO/NPC registration is
>   still outstanding).
> - **[POLICY_AND_USER_AGREEMENT.md](POLICY_AND_USER_AGREEMENT.md)** finished and reconciled with the
>   modal — §1.9 liability, §4 planned-features, §6 precedence and the footer no longer say
>   "pre-production" or "simulated".
> - **⚠️ New hard pairing rule (§7 of the policy doc):** the modal and the ToS now describe the escrow
>   hold window, but live behaviour is **still instant payout** until `20260725000200` is applied.
>   **That migration must land before the first pilot seller is invited** or the platform is claiming a
>   protection it does not provide. It is already step 1 of the pre-flight below — do not reorder it.
> - **Positioning docs reframed** — ECOLINK_SYSTEM_ANALYSIS ("nature of the system", the rating
>   lenses, the bottom line), SYSTEM_STATUS_OVERVIEW, CARBONIFY_PRESENTATION, CARBONIFY_BOARD_UPDATED,
>   CARBONIFY_BUILD_PROMPT, ABOUT_CARBONIFY, SOFT_LAUNCH_RUNBOOK, IMPLEMENTATION_ROADMAP_TIMELINE.
>   The recurring correction: the gap between Carbonify and an accredited registry is **institutional
>   (accreditation, methodologies, governance), not technical** — so it belongs on the partnership and
>   regulatory track, not in a list of product shortcomings.
> - **📋 New gap surfaced + scoped — [ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md)
>   ([DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #18).** Repositioning for institutional users exposed
>   that **every account in Carbonify is an individual person.** There is no company entity:
>   `profiles.company` is a free-text string, `kyb_applications.user_id` makes a business an attribute
>   of one person, and no `organizations`/`organization_members` tables exist. Three consequences:
>   (1) `credit_ownership.user_id` is a person, so **an employee leaving takes the company's carbon
>   assets, retirement history and ESG evidence with them**; (2) `buildVatInvoice` renders
>   `buyer.tin`/`buyer.address` but `receiptService` never supplies them, so both are **always blank**
>   and a company **cannot claim input VAT**; (3) one login per company means shared credentials, a
>   broken audit trail, and a violation of our own ToS §1.2. **This does not block the beta** — but it
>   likely blocks the first corporate customer. Phase 1 (org entity + membership) touches no money path
>   and is safe to build in parallel; **Phase 2 rewrites `process_marketplace_purchase`, the same
>   function the staged escrow migration rewrites, so it must wait until after the beta.**
> - **Doc-set consistency pass.** [docs/README.md](README.md) (the index) was stale — it omitted
>   GAP_ANALYSIS, ESCROW_DECISION and the new ORGANIZATION_ACCOUNTS_SCOPE, and still said #13c was
>   open. Rebuilt, with the positioning statement at the top. Also corrected a **factual error
>   repeated across the whole doc set and the in-app modal: Carbonify has SEVEN roles, not six** —
>   `farmer` was missing everywhere ([roles.js](../src/constants/roles.js) has had it since the farmer
>   portal shipped). Fixed in the user guides, ABOUT_CARBONIFY, dev/SECURITY, GAP_ANALYSIS,
>   GO_LIVE_ROADMAP, the root README and App.vue. Historical snapshots (SYSTEM_STATUS_OVERVIEW,
>   IMPLEMENTATION_TASKLIST, CARBONIFY_BOARD_UPDATED, ECOLINK_SYSTEM_ANALYSIS) were left at "6" on
>   purpose — they are dated snapshots carrying superseded banners.
> - **Invoice defaults fixed.** [vatInvoiceService.js](../src/services/vatInvoiceService.js) defaulted
>   the invoice issuer name to `"Carbonify (pre-production)"` — a string that would have printed on
>   tax documents. Now `"Carbonify"`. The admin guide now also states plainly that provisional invoices
>   carry **no buyer TIN**, so a corporate buyer cannot claim input VAT (Phase 3 of the org scope).
> - **✅ Done 2026-07-26 — the two dead demo files are deleted.**
>   **`src/services/authServiceSimple.js`** (a mock auth service with a hardcoded
>   `demo@carbonify.io / demo123` login) and **`src/services/sampleDataService.js`** (which seeded
>   fake "Amazon Rainforest / Brazil" projects) are gone — re-verified as imported by **nothing**
>   before removal. Neither belonged in a repo for a commercial PH platform.
>   **`src/test/e2e/auth.spec.js` was kept, not dropped:** only 1 of its 9 tests used the demo
>   credentials, and the other 8 cover homepage/login/register navigation and form validation. That
>   one test was removed; the rest stand. Tracked in [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #8.
>
> ### 🆕 2026-07-25 (expansion pass) — gap tracker, fees, LGU land-use, guided tour, Docker/API
>
> Built the first tranche of the three review docs' backlog (expansion feature
> list + Ecolink SRD + PH-eligibility review), all on `feature-user-onboarding-ux`.
> Verification first showed the platform already implements the vast majority of
> all three docs — see the new **[GAP_ANALYSIS.md](GAP_ANALYSIS.md)** (one
> deduplicated Built/Partial/To-build checklist + owner responsibilities + 3rd-party
> services). What shipped this pass:
>
> - **Onboarding + verification/certification fees** — admin-configurable in System
>   Configuration and disclosed to developers at submission
>   ([settingsService.js](../src/services/settingsService.js), SystemConfigView,
>   SubmitProjectView). **Config + disclosure only** — PayMongo collection is the
>   follow-up (gated on prod keys).
> - **LGU land-use carbon modeling** — a new "Land Use" tab estimates annual +
>   multi-year CO₂e sequestration across restoration parcels (mangrove/reforestation/
>   bamboo/agroforestry/grassland) with Tier-1 per-ha factors ([constants/lgu.js](../src/constants/lgu.js));
>   framed as planning-only, never issuance. +6 unit tests.
> - **Guided onboarding tour** — role-aware [WelcomeTour.vue](../src/components/onboarding/WelcomeTour.vue),
>   auto-opens once per user+role, reopenable from the sidebar + header ("Take a
>   tour"); step content per role incl. LGU/coop guidance.
> - **Dockerfile** (multi-stage + nginx SPA config) — closes the "container-ready"
>   claim; only public VITE_* config as build args, no secrets baked in.
> - **Public-registry API scaffold** — read-only [edge function](../supabase/functions/public-registry/index.ts)
>   over validated projects + stats (anon key → RLS → public rows only) as the
>   white-label starting point; key-gating/rate-limits are the owner's next call.
>
> **Paused (owner input needed):** transactional email wiring (provider/domain —
> only the approval email actually sends today; the rest are `console.log` stubs),
> AI Assistant backend (Anthropic key), fee collection (PayMongo prod keys),
> public-API key-gating. **Deferred:** blockchain, IoT sensors, AI fraud mapping.
>
> ### 🆕 2026-07-25 (UX pass) — dashboard/header/nav consistency + records compaction
>
> Cosmetic + IA polish across every role, on `feature-user-onboarding-ux`. No
> money-path or schema changes; all of it is Vue/CSS + navigation.
>
> - **One shared green header.** New [PageHeader.vue](../src/components/layout/PageHeader.vue)
>   (title / subtitle / optional icon / actions slot) now backs every signed-in
>   dashboard and console. ~30 views that hand-rolled their own banner — several of
>   which had *no* green header at all (System Config, KYB/AML/Privacy/Refunds, Role
>   Applications, Analytics, AI Assistant, Seller Earnings, Carbon Ledger, Offtakes,
>   Data Room, Investor/MRV/Farmer/Buyer, Cart, **Saved**, Orders, Reported problems,
>   Upgrade, Social) — were converted. Embedded panels (the verifier's tabs inside
>   Verifier Panel) were correctly left alone.
> - **Headers shrunk.** The banner was `2rem` padding + a 2–2.5rem title, eating the
>   viewport; every one is now `1.25rem` padding / `1.5rem` title / `0.95rem`
>   subtitle. A first rem-only pass missed three views whose titles used CSS tokens
>   (`var(--font-size-4xl)` — Retire, Profile, Verifier Panel); those are pinned too.
>   All banners resolve to the same `--primary-color` (#069e2d).
> - **Sidebar IA.** Dashboard + Explore (marketplace-led) are pinned to the top of
>   the sidebar for **every** role, with the role-specific workspace below
>   ([navigation.js](../src/constants/navigation.js)).
> - **Sidebar highlight bug fixed.** `isCurrent` used a naive prefix match, so
>   `/biomass/sell` lit **both** "Sell feedstock" and its parent "Biomass" (and
>   `/admin/users` lit "Admin Dashboard") — which read as "Sell feedstock takes me to
>   Biomass". Now the longest matching nav path wins
>   ([AppSidebar.vue](../src/components/layout/AppSidebar.vue)); covered by a new test.
> - **Records compaction.** Portfolio holdings, Orders and Receipts render as a
>   compact, **vertically**-scrollable list (~60vh, ~4 cards) with a **See more /
>   Show less** toggle, so a long history no longer scrolls for pages. Portfolio
>   stats/breakdowns still compute over the full set. Audit Logs got the same
>   See-more treatment; User Management's table no longer clips its Actions column.
> - **"Watchlist" → "Saved"** in all user-facing copy (route/service/DB names and the
>   unrelated AML sanctions "watchlist" left intact).
> - **Carbon calculator hardened:** per-source inputs clamped to ≥ 0 (a negative in
>   one field was silently cancelling real emissions in the total), credit
>   pluralisation, and the Buy button disabled at zero.
>
> Follow-ups worth a cleanup pass: the six title-page views converted to PageHeader
> still carry orphaned `.page-title`/`.page-description` CSS (dead, harmless).
>
> ### 🆕 2026-07-25 — profile-fetch failure hardened, and the signup-trigger migration applied
>
> Follow-on to the 2026-07-23 auth audit, on `feature-user-onboarding-ux`. The
> signup-trigger migration below made a profile *always exist*; this pass fixes what
> the **client** did when a profile still couldn't be read, so the same invisibility
> that hid the original bug can't downgrade a signed-in user.
>
> - **No more silent role downgrade.** A profile fetch that times out, errors, or
>   returns an unreadable row previously reset the user to `general_user` with no
>   signal — an admin mid-session lost their admin UI/permissions until a reload
>   happened to succeed. The store now **preserves the last-known role**, flags the
>   failure, and recovers in the background
>   ([userStore.js](../src/store/userStore.js)).
> - **The background retry actually runs now.** `_retryProfileFetch` guarded on
>   `_profileFetchInProgress`, but it's called from *inside* the in-progress fetch,
>   so it returned immediately every time — dead code. It's on a dedicated
>   `_profileRetryInProgress` flag now.
> - **`createProfile` returns the full row, not an `{ id }` stub.** With the trigger
>   pre-creating every profile, the "already exists" path is now common; returning a
>   bare id made the store canonicalize `role` to `general_user` and render a blank
>   profile ([profileService.js](../src/services/profileService.js)).
> - **The failure is surfaced, not swallowed.** A new `profileFetchFailed` store flag
>   drives a global `profile-stale-banner` ([App.vue](../src/App.vue)) plus an ambient
>   pulsing dot on the avatar and a role-adjacent note in the account dropdown
>   ([Header.vue](../src/components/layout/Header.vue)). All clear automatically once a
>   profile loads.
> - **✅ `20260723000100_profile_on_signup.sql` was applied to the live project on
>   2026-07-25** (§0.5). Note the trigger swallows its own INSERT errors by design (so
>   it can never block a signup) — meaning a future `profiles` constraint it can't
>   satisfy would fail *silently*; worth watching the Postgres logs / adding an alert
>   rather than relying on the `raise warning`.
>
> ### 🆕 2026-07-25 (later) — money-table RLS posture captured into version control (#13c closed)
>
> The last repo-side security-provability gap is closed. The money tables' RLS was
> **correct on live but existed nowhere in `supabase/migrations/`** (the four ledger
> tables predate version control), so a fresh staging/DR/local env rebuilt them
> *client-writable* and the repo could not *prove* the money path was locked.
>
> - **New migration [`20260725000100_capture_money_table_rls.sql`](../supabase/migrations/20260725000100_capture_money_table_rls.sql)** captures the complete posture declaratively — write-lockdown + the four ledger tables' own-row SELECT policies + the two inventory tables' public reads — **reconciled against a live `pg_policies` dump** and **applied to live 2026-07-25**.
> - **A real bug was caught during reconciliation:** `wallet_transactions` is scoped through `account_id → wallet_accounts`, not a direct `user_id`; the migration was corrected to match live before finalizing.
> - **Two ways to prove it now:** [`supabase/diagnostics/money_table_rls_audit.sql`](../supabase/diagnostics/money_table_rls_audit.sql) (read-only, **0 findings** on live — run at pilot pre-flight) and [`src/test/services/moneyTableRls.test.js`](../src/test/services/moneyTableRls.test.js) (CI guard that trips if the migration is edited to reopen a hole).
> - The gated `supabase/cutover/lockdown_financial_writes.sql` is now **retired** (deleted) — its job is fully covered by the versioned migration; one source of truth.
>
> **Escrow (#14) decided the same day — Option B (method-gated hold).** Card
> settlements hold the seller's net ~7 days against chargebacks; GCash/Maya and
> wallet purchases release immediately. Implementation is **written and staged** as
> [`20260725000200_restore_escrow_hold_window.sql`](../supabase/migrations/20260725000200_restore_escrow_hold_window.sql)
> — it reuses the existing escrow machinery (`escrow_holds`, `release_escrow`, the
> held-aware `refund_purchase`, the `held`/`available` split in
> `get_my_seller_balance`) and adds only the escrow branch in
> `process_marketplace_purchase`, a `release_matured_escrow()` batch releaser, and
> two configurable `app_settings` windows. **Not yet applied** — it rewrites the
> live settlement RPC, so it lands in the pilot pre-flight with a full reconcile-to-0
> check (rationale + apply plan in [ESCROW_DECISION.md](ESCROW_DECISION.md)). With
> both #13c and #14 resolved, the pre-live-keys *engineering* track is clear; the
> remaining go-live P0s are external (pentest, email-confirmation domain, the beta).
>
> ### 🆕 2026-07-23 — navigation moved to a sidebar; auth + role guards audited and fixed
>
> Two pieces of work, both on `feature-user-onboarding-ux`.
>
> **1. Navigation is now one grouped sidebar**, not three drifting menus. Signed-in
> users navigate from a persistent left sidebar ([AppSidebar.vue](../src/components/layout/AppSidebar.vue));
> the header keeps only identity + alerts (cart, bell, avatar); the avatar menu is
> account-only. Every destination is declared once in
> [constants/navigation.js](../src/constants/navigation.js), so a page can no longer
> carry three different names on three surfaces (it did: "Buy credits" / "Marketplace",
> "Saved" / "Watchlist"). The three-line menu button sits next to the logo and also
> collapses the desktop rail; guests keep the old marketing header. The developer
> project list now collapses to one row per project, grouped by what the developer
> must do about each ([groupDeveloperProjects.js](../src/utils/groupDeveloperProjects.js)).
>
> **2. Login / register / role-guard audit — three access-control blockers fixed:**
>
> | Blocker | Was | Fix |
> |---|---|---|
> | Public marketplace unreachable | The guard's allowlist had lost `marketplace` + `project-detail`, so the signed-out header's own links bounced visitors to `/login` | Routes declare `meta.public`; a test forbids any route being neither public nor `requiresAuth` |
> | `super_admin` locked out of the whole app | `getRoleDefaultRoute` sent them to `/admin`, the guard's `===` refused them, → **infinite redirect** | One `canonicalizeRole()` mirrors the DB's `canonicalize_notification_role()`; `super_admin` → `admin` everywhere |
> | Non-buying roles could walk checkout | `/cart`, `/credit-portfolio`, `/watchlist`, `/sales`, `/kyc` had no role gate — only the cart *icon* was hidden | `disallowedRoles` on each, matching what the UI already claimed |
>
> Plus: registration now reports email-confirmation-pending and already-registered
> instead of always "Account created, sign in"; the unapproved-specialist login gate
> keys on `err.code` not a matched sentence and fails **open** on lookup error by
> design; logout no longer wipes theme/language/sidebar prefs (auth keys only); a
> parallel dead authorization path (`canAccessRoute` / `getRoutePermissions`) that
> disagreed with the real guards was removed; and a **verifier-panel crash on every
> mount** (`Cannot access 'auditRows' before initialization`, a TDZ hit in an
> `immediate` watcher) was fixed — found while sweeping every role's dashboard in a
> real browser.
>
> **The migration from this pass — [`20260723000100_profile_on_signup.sql`](../supabase/migrations/20260723000100_profile_on_signup.sql)
> — was applied to the live project on 2026-07-25** (§0.5). It guarantees every
> `auth.users` row gets a profile via a signup trigger, closing the gap where accounts
> created with email confirmation on silently landed with no profile (blank name,
> demoted to `general_user`). The client-side resilience follow-on is in the
> 2026-07-25 note above.
>
> ### 🆕 2026-07-22 — all five roles audited end to end
>
> Every role was walked against its own `docs/role-needs/` page. **Two findings
> repeated for all five:** the requirements doc badly understated what had already
> shipped, and each role carried exactly one structural bug that undercut its
> premise.
>
> | Role | Structural bug found | Status |
> |---|---|---|
> | Developer | Progress tracker frozen at stage 3 of 5 — it was never passed issuance/listing state | fixed |
> | Verifier | The **Submitted** queue tab hid every first-time submission (tab matched `'submitted'`, create paths write `'pending'`) | fixed |
> | LGU | Endorsements were **unscoped nationwide** — nothing recorded which municipality an LGU governs | fixed |
> | Buyer | Permanent credit retirement had **no confirmation step** | fixed |
> | Admin | DPA request queue had an index, RLS and a worker — but **no reader** | fixed |
>
> Security posture moved substantially, all enforced **at the database** rather
> than in the UI: verifier independence, endorsement jurisdiction, account
> suspension, admin segregation of duties, and AML screening.
>
> Also fixed along the way: project verification decisions were writing **no audit
> rows at all**, and every resource-scoped audit reader queried columns that do not
> exist (`entity_type`/`entity_id`/`timestamp` vs `resource_type`/`resource_id`/
> `created_at`).
>
> ⚠️ **Six migrations from this pass are listed in §0.4 — apply them before relying
> on any of the above.** Several of these features are inert until their migration
> runs, and two of them (LGU jurisdiction, admin SoD) are *silently* inert: the UI
> works, the guard simply is not there.
>
> *2026-07-21 was a documentation-reconciliation pass only — no code, DB, or deploy change. It corrected stale "do this next" instructions that later entries in this same file had already superseded.*

## Current snapshot

- Carbonify is a Philippine carbon-credit registry and marketplace with role-based workflows for developers, verifiers, buyers, admins, and LGUs.
- The core product flow is in place: register -> validate -> MRV -> issue -> trade -> retire, and it has been run end-to-end against the live DB.
- The money path is server-authoritative: settlement is controlled by the backend, not the browser, and the financial tables are RLS-locked against client writes (**verified on live 2026-07-20**).
- `reconcile_financials()` returns **0 rows** on live — a clean baseline for the pilot.
- The most important remaining work is the pilot itself, then launch hardening, external integrations, and operations/legal readiness.

## Implemented now

- Auth, roles, router guards, and MFA/KYC/KYB gates.
- Project registration, MRV, verifier review, issuance, and QR-verifiable certificates.
- Marketplace, cart, wallet, retirement, receipts, seller earnings, payouts, and refunds/disputes.
- Public registry and market views, plus LGU and admin tooling.
- The seven expansion features (registry fields, carbon asset ledger, biomass marketplace, MRV dashboard, investor portal + data room, farmer portal); the AI assistant is interface-only.
- Developer docs, user guides, testing docs, deployment docs, and security docs.

## Not yet implemented or still external

**Gates before real money** (detail in [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) §5):
- **Independent penetration test** — the last P0 before live payment keys.
- **Email confirmation is OFF by choice** — anyone can sign up with an address they do not control. Needs an owned domain (~₱600–900/yr) verified in Resend.
- **Legal entity / licensed PSP / BIR-accredited receipts / AML-DPO program** — business track, runs in parallel.
- **Real credit-supplier integration** for live registry-retirement fulfillment (Carbonmark/Cloverly/Patch). Today a retirement produces a Carbonify certificate, not a Verra/Gold Standard registry receipt.

**Open engineering items that do not block the pilot but must be settled before live keys:**
- **Escrow — decided 2026-07-25 (Option B, method-gated hold)** ([DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #14, [ESCROW_DECISION.md](ESCROW_DECISION.md)). Implementation staged in `20260725000200_restore_escrow_hold_window.sql` (cards held ~7d; push payments immediate). **Apply during the pilot pre-flight** (it rewrites the settlement RPC), then wire `release_matured_escrow()` to a worker/cron and surface Held vs Available in the seller UI.
- ~~**The money-table RLS posture is not in version control**~~ ✅ **CLOSED 2026-07-25** ([DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #13c) — captured in migration `20260725000100`, reconciled against a live `pg_policies` dump and applied to live. A fresh env now rebuilds the locked posture, and `supabase/diagnostics/money_table_rls_audit.sql` proves it (0 findings).
- **Migration `20260718001100`** (receipt FK schema-cache reload) — still pending on live. Non-fatal; clears a console 400/406 on receipts.
- **Testing gaps** ([TESTING_PLAN.md](TESTING_PLAN.md)) — no automated RPC/RLS integration tests, Playwright e2e not required in CI and not run on a seeded backend, no load test, accessibility pass partial.
- **Externally-blocked feature work** — MRV satellite/IoT feeds (#4), AI assistant backend (#7, needs an API key + running cost), farmer training content (#6e).

## 🔜 Do these next, in order

> **The engineering track is clear.** Both pre-live-keys code blockers are resolved:
> **#13c** (money-table RLS captured + applied + audited, 2026-07-25) and **#14** (escrow
> decided — Option B — and implemented, staged for the pilot). Everything below is
> pilot/ops/external. **All work through 2026-07-28 is committed and pushed** to
> `feature-user-onboarding-ux` (PR #14).
>
> **Still worth knowing before the beta is *reported on*:** the ESG-report fix (#11) means any offset
> report exported before 2026-07-28 understated retired credits — pilot users who export one should
> re-run it.
>
> **#26's two follow-ups are now BUILT (2026-07-29)** — a pilot farmer no longer sees a buyer-set
> "Paid" flag presented as settled fact, and can contest one. **But only once `20260729000100` is
> applied**, which is why it is step 0 below. Farmers should still be briefed that Carbonify does not
> hold or transfer their money; that part of the decision has not changed.

0. ~~Apply the escrow + feedstock + receipt-FK migrations~~ — ✅ **all three applied 2026-07-29**, `reconcile_financials()` = 0 after each. **What replaced this as step 0: schedule `process-payouts` on a ~15-minute cron.** Escrow is live, so card sellers are being held right now and `release_matured_escrow()` is the only thing that frees them.
1. **Run the pilot pre-flight** — and read the new **§7 SUMMARY** at the end of the file, not the project list — [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) §1, all seven checks green (reconcile 0 · no errored `webhook_events` · **8** edge functions deployed · PayMongo in **test** mode with the webhook enabled · `ALLOW_UNSIGNED_WEBHOOKS` unset · Sentry receiving · frontend deployed). This is also `OWN-01…10` in [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) Part 1, if you prefer a tick-box form of it. **Plus, in this same window:**
   - **Redeploy + schedule** `process-payouts` (cron ~15 min, so `release_matured_escrow()` fires), then run the escrow checks — now **`ESC-01…06`** in [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) Part 2, which supersede the 4 informal ones in [ESCROW_DECISION.md](ESCROW_DECISION.md) §6 (card→held, push→immediate, matured release, refund-while-held, each `reconcile_financials()` = 0, plus a withdrawal). **Run these BEFORE inviting pilot users**, so the beta exercises escrow on test money. *(The escrow migration itself is no longer pending — see step 0.)*
   - **Run** [`money_table_rls_audit.sql`](../supabase/diagnostics/money_table_rls_audit.sql) → expect **0 rows** (confirms #13c holds).
2. **Decide the beta database** — [TESTING_PLAN.md](TESTING_PLAN.md) §3. Recommendation: reuse the current live project now that reconcile is clean, but purge or clearly label leftover test projects/listings first.
3. **Confirm the `20260718000000`–`000700` batch is fully applied on live** — see the apply-status note below. One query settles it.
4. **Run the closed beta** — invite ~8–15 users covering every role, disclose the runbook §2 limitations, hand out **[UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) *and* [TEST_REPORT_FORM.md](TEST_REPORT_FORM.md)** (the script is what they do, the form is what comes back), and check `reconcile_financials()` = 0 daily.
5. **Then start the real-money gate** — email confirmation on (needs an owned domain), independent penetration test, legal/PSP track. This is the only remaining P0 tier and it's all external.

### ⚠️ Apply-status note (2026-07-21) — `20260718000000`–`000700`

The 2026-07-11 entries below say this seven-migration batch was written but **NOT applied**. Later
entries in this same file contradict that: validation failed live with
`column "available_credits" of relation "project_credits" does not exist`, which is only possible if
**`000700` (the column drop) had already landed**. So the batch was at least partly applied, and the
historical "apply these 7 next" instruction is stale — do not follow it blindly.

Settle it with one read-only query before the pilot rather than re-running migrations:

```sql
-- expect: no 'available_credits' row (000600/000700 landed)
select column_name, is_nullable from information_schema.columns
 where table_schema='public' and table_name='project_credits';

-- expect: the 4-arg signature only (000000 landed)
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='retire_credits_atomic';
```

Status of the later migrations is not ambiguous: **`000800` verified applied on live 2026-07-20**;
**`000900` + `001000` applied 2026-07-11**; **`001100` still pending**.

## Doc map

- [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) — the active next step: pre-flight, pilot click-through, daily monitoring, abort criteria.
- [TESTING_PLAN.md](TESTING_PLAN.md) — the layered what-to-test map and the beta plan.
- [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) — per-role, tick-box test scripts for pilot users. Rewritten 2026-07-30: owner pre-flight (`OWN`), escrow (`ESC`), two-sided farmer payment (`FARM-04…07`), admin feedstock (`FEED`), privacy (`PRIV`), keyboard (`KEY`) and public pages (`PUB`).
- [TEST_REPORT_FORM.md](TEST_REPORT_FORM.md) — what a tester fills in and sends back. §C's seven questions each target a bug class the automated suite cannot see; §G says how each answer is read.
- [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) — the real-money gate and priority tiers.
- [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) — everything knowingly postponed, with the reasoning.
- [ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md) — company/team accounts: the gap, why it matters commercially, and the 5-phase build. Scoped, not started.
- `docs/dev/` — setup, architecture, database/RPCs, deployment, testing, security.

> ## Historical notes below
>
> The remainder of this file preserves the detailed audit trail and older snapshots for traceability.
>
> ### ✅ 2026-07-11 (live testing) — END-TO-END FLOW NOW WORKS; drift fixed migration-by-migration
> A full live run (developer submits → verifier validates → buy → retire) surfaced a chain of
> **live-DB-vs-code drift** bugs, each fixed by a small migration. Apply status on the live DB:
> - ✅ **`000900`** issuance triggers → `credits_available` (validation + auto-listing work). *Applied.*
> - ✅ **`001000`** certificates schema catch-up (retirement/purchase certs generate). *Applied.*
> - ⬜ **`001100`** receipt FK cache reload (below). *Pending — or run `notify pgrst, 'reload schema';`.*
> - ✅ **`000800`** RLS write-lockdown (the security one). **VERIFIED APPLIED on live 2026-07-20** —
>   a read-only `pg_policies` check confirms all three blanket-write holes (project_credits,
>   credit_listings, credit_retirements) are gone and the `project_credits_owner_or_admin_delete`
>   marker policy exists. The #1 launch blocker is closed.
>
> Confirmed working live after `000900`+`001000`: validate → project auto-lists → purchase → retire →
> certificate. See per-fix notes below.
>
> ### ✅ 2026-07-20 — BOOKS VERIFIED BALANCED (`reconcile_financials()` = 0 on live)
> Ran the reconciliation against live. It flagged **4 `transaction_unaccounted` rows** — all ₱1.00,
> all between the owner's own test accounts (`louiecaparoso12` ↔ `johnlouiecaparoso12`), created
> **2026-06-26 to 2026-07-01**, i.e. pre-cutover client-side writes that never created a payment_intent
> or ledger group (exactly the legacy residue check #6 was built to surface — not a regression, and
> impossible to recreate now that the RLS lockdown is verified live). Footprint check showed **zero**
> dependent certificates / ledger entries / payment intents, so the four rows were **deleted**.
> `reconcile_financials()` now returns **0 rows** — a clean baseline for the test-key soft launch
> (see [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) §1a).
>
> ### 🛠️ 2026-07-11 — RECEIPT JOIN 400 (`credit_transactions ↔ profiles` not in PostgREST cache)
> The receipt embeds `buyer/seller:profiles!credit_transactions_*_id_fkey(...)` and 400'd with "Could not
> find a relationship … in the schema cache", then the per-profile fallback 406'd under `profiles` RLS — so
> the receipt rendered without counterparty names. The buyer/seller→`profiles(id)` FKs exist
> (`20260606000100`/`20260626000700`); **PostgREST's relationship cache was stale.** **Fix:** migration
> **`20260718001100_credit_tx_profile_fk_reload.sql`** re-asserts both FKs (idempotent, NOT VALID) and
> reloads the schema cache. Non-fatal (receipt already worked), but clears the console 400/406. Caveat:
> after the reload, `profiles` RLS still governs which embedded rows are visible, so a counterparty's name
> may still be blank by design — showing it would need a small `SECURITY DEFINER` name-only RPC (not a
> `profiles` RLS loosening, which we deliberately hardened).
>
> ### 🛠️ 2026-07-11 — CERTIFICATES SCHEMA CATCH-UP (retirement/purchase certs failed silently)
> After a retirement, certificate generation 400'd ("creating certificate with all fields" / retirement
> cert lookups by `retirement_id`). The `certificates` table predated version control and its live shape was
> **missing 11 columns** certificateService writes: `retirement_id` (the retirement↔certificate link the
> lookups filter on), `project_description`, `tonnes_co2`, `beneficiary_email`, `purpose`,
> `transaction_id_ref`, `payment_reference`, `wallet_address`, `purchase_date`, `purchase_datetime`,
> `timestamp`. The retirement itself is unaffected (burn+record are atomic); only the certificate row failed.
> **Fix:** migration **`20260718001000_certificates_schema_catchup.sql`** adds the columns (idempotent) and
> captures the full table into version control from the live dump. *(Applied — certs now generate.)*
>
> ### 🛠️ 2026-07-11 — DRIFT REPAIR: issuance triggers still wrote the dropped `available_credits`
> Validating a project failed live with `column "available_credits" of relation "project_credits" does not
> exist`. **Root cause:** the M6 consolidation dropped `available_credits` (migration `000700`) on the
> premise it was "maintained by NO trigger" — **that premise was wrong.** Two SECURITY DEFINER issuance
> triggers write it: `activate_validated_project_trigger` (fires on validation, latest body from
> `20260626000500`) and `mint_credits_on_ver_approval`. After the column drop, the validation trigger throws
> and the whole `projects` status UPDATE rolls back — a **DB** failure surfacing as a frontend error, which
> is why no redeploy fixed it.
> **Fix:** migration **`20260718000900_issuance_triggers_use_credits_available.sql`** redefines both trigger
> functions to write only the canonical `credits_available` (same pool/listing logic otherwise). Also fixed
> a real client bug: the verifier's price-save called `updateProject` without `isAdmin`, 406-ing on a
> non-owned project (PR #9).
> **Note on the real flow:** the LIVE DB issues on **validation** — `activate_validated_project_trigger`
> creates the pool **and** an active listing the moment a project is validated, so a validated project goes
> straight to the marketplace. (The `20260604010100` "decouple, mint-on-VER" model was superseded on live by
> `20260626000500`, which re-established validation-time issuance.) **⚠️ Apply `000900` in the SQL Editor;
> then validating a project should succeed and list it.**
>
> ### 🔴 2026-07-11 (earlier) — LIVE RLS AUDIT: 3 CREDIT-INTEGRITY HOLES FOUND + CLOSED
> Merged the 2026-07-11 batch to `main` via **PR #7**, then audited the live `pg_policies` for the money
> tables. **Good:** the four ledger tables (`credit_ownership`, `wallet_accounts`, `wallet_transactions`,
> `credit_transactions`) are already client-SELECT-only. **Bad — three live, exploitable write holes:**
> - `project_credits` had a `USING(true) WITH CHECK(true)` ALL policy → **any user could mint
>   `credits_available`**.
> - `credit_listings` had the same → **any user could rewrite any listing's `price_per_credit`**, which
>   checkout reads to compute the charge (buy real credits for ₱0.01 — defeats server-authoritative pricing).
> - `credit_retirements` had a client INSERT policy → **forge a retirement + certificate with no burn**.
>
> Closed by new migration **`20260718000800_lock_credit_pool_and_listing_writes.sql`** (writes now go only
> through the SECURITY DEFINER issuance trigger + service_role RPCs, which are RLS-exempt; sellers keep own
> listings; staff keep all). **✅ VERIFIED APPLIED on live 2026-07-20** (read-only `pg_policies` check:
> all three blanket-write policies dropped, `project_credits_owner_or_admin_delete` present). Remaining
> capture work (codify the money-table RLS posture into a versioned migration) tracked in
> [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #13.
>
> ### 🔎 2026-07-11 (later) — SENIOR REVIEW + 3 FOLLOW-UP CHANGES ON TOP OF THE 17 FIXES
> A senior-dev pass over architecture + security, on top of the audit below. **3 concrete changes made
> (working tree, uncommitted, still part of the same un-applied batch):**
> - **H1 regression corrected — do this BEFORE applying the batch.** Migration
>   `20260718000000_retire_credits_atomic_with_record.sql` had reintroduced
>   `v_user := coalesce(auth.uid(), p_user_id)` — the client-supplied-identity fallback that
>   `20260703000400` had deliberately removed. Now bound to `auth.uid()` with a null-reject (the 4-arg
>   signature/grant are unchanged, so the client caller is unaffected). Not exploitable under the
>   authenticated-only grant, but it silently undid a prior hardening; corrected while still un-applied.
> - **Dead client-side money writers deleted** — `addCreditsToPortfolio` / `removeCreditsFromPortfolio`
>   (290 lines) removed from `creditOwnershipService.js`. They did **un-transacted** browser writes to
>   `credit_ownership` + `credit_retirements` with a **client-supplied userId** (the TOCTOU/double-retire
>   pattern the atomic RPC replaced) and were called by no view. The read methods (`getUserCreditPortfolio`
>   / `getUserCreditStats`, used by `CreditPortfolioView` + `esgReportService`) are untouched.
> - **2 zero-byte dead files deleted** — `services/adminService.js`, `services/verifierService.js`
>   (imported nowhere). Progress against backlog #8.
>
> **Two review findings recorded, not yet actioned** (see [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md)):
> - **🔴 The financial-table RLS posture is not in version control.** There is no `create policy` for
>   `credit_ownership` / `wallet_accounts` / `wallet_transactions` / `credit_transactions` anywhere in
>   `supabase/migrations/`; the only lockdown lives in the gated `supabase/cutover/` script (backlog P1).
>   Any fresh env (staging/DR/local) rebuilds with client-writable money tables. **The repo cannot prove
>   the money tables are locked down** — capture the live `pg_policies` into a versioned migration.
> - **🟠 Escrow was silently reverted.** `escrow_holds` has had no writer since `20260606000600`; every
>   later `process_marketplace_purchase` credits `seller_payable` directly. Sellers are immediately
>   withdrawable with **no dispute/chargeback hold window** — a real fraud exposure on the card rail once
>   live keys are on. Decide instant-payout-by-design vs. restore the hold.
>
> Build ✅ · ESLint 0 ✅ · **313 tests ✅** after all three changes.
>
> ### 🛠️ 2026-07-11 — WHOLE-CODEBASE CODE AUDIT + 17 FIXES → [CODE_AUDIT_2026-07-11.md](CODE_AUDIT_2026-07-11.md)
> A four-reviewer code-level bug hunt (money path · expansion features · registry/investor · auth/roles),
> every finding adjudicated against the actual RPC/RLS SQL. **Fixed 17** (5 HIGH, 6 MED, 6 LOW) and
> consolidated the `project_credits` column drift. Highlights:
> - **H1 retirement is now atomic** — the burn + `credit_retirements` insert happen in one RPC
>   transaction (the HIGH previously "left unfixed on purpose" is closed).
> - **H2 wallet top-up double-credit** and **M1 double payout** — idempotency/claim guards added.
> - **H3 (NEW)** — any signed-in user could read/enumerate **every** project's compliance PII; the
>   bucket read policy is now scoped. **H4** send-approval-email relay closed. **H5 (NEW)** offtake
>   project-reassignment closed.
> - **`project_credits` drift RESOLVED** — `credits_available` (numeric) is canonical; the stale
>   `available_credits` stray is retired via expand/contract migrations.
>
> **7 new migrations (`20260718000000`–`000700`) + 4 edge-fn redeploys are written but NOT yet applied
> to the live DB.** Deploy order + pairing rules are in §"2026-07-11 deploy runbook" below. Three LOWs
> and one H3 residual (public/private bucket split) were deliberately deferred.
>
> ---
>
> #### Earlier baseline — 2026-07-09
>
> **All 31 migrations applied. Build ✅ · ESLint 0 ✅ · 312 tests ✅.**
>
> The seven expansion features, scored **bullet-by-bullet against the code** (not against these notes)
> in **[EXPANSION_FEATURE_AUDIT.md](EXPANSION_FEATURE_AUDIT.md)**:
>
> | # | Feature | First audit | Now |
> |---|---|---|---|
> | 1 | Project Registry | 5/8 | **8/8** ✅ |
> | 2 | Carbon Asset Management | 5/6 | **6/6** ✅ |
> | 3 | Biomass Marketplace | 6/7 | **7/7** ✅ |
> | 4 | MRV Dashboard | **0/8** | **6/8** 🟡 |
> | 5 | Investor Portal | 5/7 | **7/7** ✅ |
> | 6 | Farmer Portal | 3/6 | **5/6** 🟡 |
> | 7 | AI Assistant | 0/5 | **0/5** 🔴 interface only |
>
> **Nothing codeable remains in #1–#6.** What's open needs training *content* (#6e), an **API key +
> running cost** (#7), or **external feeds** (#4 satellite/IoT).
>
> ### 🔎 Codebase audits
> - **[CODE_AUDIT_2026-07-11.md](CODE_AUDIT_2026-07-11.md)** (latest) — whole-codebase, 17 fixed. The
>   retirement-atomicity HIGH and the `send-approval-email` relay noted below are now **fixed** (pending
>   live apply/redeploy). Two NEW HIGHs were found and fixed: unscoped project-document reads (PII) and
>   offtake project-reassignment.
> - **[CODE_AUDIT_2026-07-09.md](CODE_AUDIT_2026-07-09.md)** — earlier pass (empty /analytics charts ·
>   the 15s marketplace refresh wiping the grid · a load race · one unpriced listing reporting ₱0).
>
> ### 🔴 Do these next, in order *(SUPERSEDED 2026-07-21 — kept for history)*
>
> **⚠️ This list is stale. The current next steps are in "🔜 Do these next, in order" at the top of this
> file.** Items 1 and 2 below are contradicted or overtaken by later entries: the migration batch was at
> least partly applied (see the apply-status note at the top), `000800` was verified applied on live
> 2026-07-20, and the runtime verification in item 3 was exercised end-to-end on 2026-07-11.
>
> 1. **Apply the 2026-07-11 fixes to the live DB** — 7 new migrations + 4 edge-fn redeploys, written but
>    not yet applied. Order + pairing rules in the "2026-07-11 deploy runbook" note below. The
>    `20260718000000` H1 migration already carries the `auth.uid()` correction (above) — no extra step,
>    just apply the current file. *(Stale — confirm with the query at the top instead.)*
> 2. **Capture the live financial-table RLS into a versioned migration** (backlog P1). Dump
>    `select * from pg_policies where tablename in ('credit_ownership','wallet_accounts','wallet_transactions','credit_transactions')`
>    and codify it, so the migration chain — not an out-of-band cutover script — *is* the security posture.
> 3. **[RUNTIME_VERIFICATION_RUNBOOK.md](RUNTIME_VERIFICATION_RUNBOOK.md)** — nothing here has been
>    exercised against the live DB. Unit tests prove the pure math; they prove nothing about RLS
>    policies or RPC grants. **Start with §1, the privilege-escalation check.**
> 4. **Independent penetration test** — last P0 before live payment keys.
> 5. **Email confirmation** — OFF by choice (needs a domain, ~₱600–900/yr; Resend's free tier is
>    3,000 emails/mo). Until then **anyone can sign up with an address they do not control.**
>
> ### Two honest caveats about the positioning
> - **"National biomass registry"** — the public [`/registry`](../src/views/RegistryView.vue) is a
>   *certificate table*. It never shows methodology, development status, feedstock, or capacity;
>   that data lives only on each project's own page. And there is no DENR/CCC linkage.
> - **"ESG reporting platform"** — the ESG export is **credit-owner side only**. Developers,
>   farmers, and verifiers have no ESG export.
>
> ---
>
> <details><summary>Session-by-session notes (newest first)</summary>
>
> 🛠️ **2026-07-11 — WHOLE-CODEBASE AUDIT + 17 FIXES (deploy runbook).** Full findings in
> [CODE_AUDIT_2026-07-11.md](CODE_AUDIT_2026-07-11.md). Build ✅ · ESLint 0 ✅ · **313 tests ✅**. All
> code is in the working tree; **the DB/edge changes are NOT yet applied to the live project.**
>
> **① Run these 7 migrations in the SQL Editor** (`supabase/migrations/`):
> `20260718000000_retire_credits_atomic_with_record` (H1) · `…000100_scope_project_documents_read`
> (H3) · `…000200_offtake_update_ownership_guard` (H5) · `…000300_payout_processing_returns_claim`
> (M1) · `…000400_kyc_level_clamp` (M3) · `…000500_biomass_rpc_grant_hygiene` (L7) ·
> `…000600_available_credits_nullable` (M6 phase 1).
>
> **② Redeploy 4 edge functions:** `paymongo-webhook` (H2) · `paymongo-checkout` (L2) ·
> `send-approval-email` (H4) · `process-payouts` (M1). *(`npm run deploy:webhook` /
> `deploy:paymongo` cover the first two; the other two: `supabase functions deploy <name>`.)*
>
> **③ Deploy the frontend** (normal build) — carries H1-client, M2, M3, M4, M5, M6, L5, L6, L8, L9.
>
> **④ Then run the final migration:** `…000700_drop_available_credits` (M6 phase 2) — **only after ③**.
>
> **Hard pairing rules:** H1 migration must land **with** the frontend (old 3-arg
> `retire_credits_atomic` is dropped); M1 migration must land **with** the `process-payouts` redeploy
> (RPC return type changed `void→boolean`). The `available_credits` drop is expand/contract: `…000600`
> before the frontend, `…000700` after — no broken window.
>
> **Deferred (not touched):** L1 displayed-vs-charged price · L3 client-computed receipt total · L4
> `getTransactions` writing on a read path · H3 residual (a doc a validated project publishes is still
> viewable; the full fix is a public/private bucket split). **Then verify live** per
> [RUNTIME_VERIFICATION_RUNBOOK.md](RUNTIME_VERIFICATION_RUNBOOK.md).
>
> 🧪 **2026-07-09 — ALL 31 MIGRATIONS APPLIED. THE GAP IS NOW RUNTIME, NOT CODE.**
> All seven expansion features are code-complete to the limit of what code can do (#1 8/8 · #2 6/6 ·
> #3 7/7 · #4 6/8 · #5 7/7 · #6 5/6 · #7 interface-only). Build ✅ · ESLint 0 ✅ · **312 tests ✅**.
> **Nothing has been exercised against the live database.** Unit tests prove the pure math; they prove
> nothing about RLS policies, RPC grants, or drift fallbacks.
> 👉 **Do this next: [RUNTIME_VERIFICATION_RUNBOOK.md](RUNTIME_VERIFICATION_RUNBOOK.md)** — a
> step-by-step click-through with the expected result at each step and, when it fails, which layer
> broke. It starts with the **privilege-escalation check**, because nothing else matters if that hole
> is open.
>
> 📈 **2026-07-09 — PLANTATION PERFORMANCE MONITORING (#6f). No migration.** The parcel register was
> static: it stored `expected_yield_tonnes` and never compared it to anything. Deliveries now carry
> `parcel_id` (migration #31), so each parcel card shows **actual vs expected**, colour-coded.
> Build ✅ · ESLint 0 ✅ · **312 tests ✅** (+9).
>
> **The subtlety that shapes it:** `expected_yield_tonnes` is an **annual** figure, so actuals are
> summed over the **trailing 12 months**, not lifetime. A three-year-old parcel compared against one
> year's expectation would report **300% performance** and mean nothing. Lifetime tonnage is shown
> separately, as context rather than as the ratio.
>
> A parcel with no expected yield reports `performance: null` — **not zero, and not 100%**. An absent
> target is not a met one. Over-performance is reported honestly (130%), never capped at 100%.
> Non-mass units (sacks/bales/m³) are excluded, as everywhere else in the farmer math.
>
> 🌾 **2026-07-09 — FARMER CARBON PARTICIPATION (#6 now 5/6).** A farmer could see sacks and pesos,
> never how their feedstock became carbon. Migration **#31** adds `farmer_deliveries.project_id` — the
> missing link that made attribution impossible — plus `farmer_carbon_participation()`, and the Farmer
> Portal gains a **Carbon** tab. Build ✅ · ESLint 0 ✅ · **303 tests ✅** (+15).
>
> **The attribution rule is written down before the code** in
> [FARMER_CARBON_ATTRIBUTION.md](FARMER_CARBON_ATTRIBUTION.md): *pro-rata by delivered mass, per
> project, lifetime-to-date* — `verified_tCO₂e × farmer_tonnes / project_tonnes`, over **confirmed**
> deliveries and **approved** VERs. Shares sum to exactly 1, so a farmer can never be attributed carbon
> the project never verified. What a smallholder is told they contributed is a claim they will repeat;
> the doc records why this rule and not per-delivery carbon factors (which would let farmer totals
> exceed the project's verified total — the double-counting failure this platform exists to prevent).
>
> **Presented as an ESTIMATE, never as credit ownership** — the farmer cannot sell or retire it, and
> the UI says so first, not in a footnote. Deliveries in **sacks/bales/m³ are excluded from both sides
> of the ratio** (no bulk density → treating a sack as a tonne would corrupt *every other farmer's*
> share, since the denominator is shared), and the farmer is told how many were excluded and why.
> Deliveries the buyer never attributed to a project are counted and surfaced too.
>
> Buyers now name the project when confirming receipt. `confirm_farmer_delivery()` validates the buyer
> **owns** that project — otherwise a buyer could attribute feedstock to a rival's project, or inflate
> one farmer's share of it. The 3-arg version is dropped first: a defaulted 4th parameter would create
> an ambiguous overload for existing callers.
>
> **Migrations #30 + #31 APPLIED (2026-07-09).** All 31 migrations are live.
>
> 🗂️ **2026-07-09 — INVESTOR DATA ROOM SHIPPED (#5 COMPLETE, 7/7).** The portal showed a document
> *count badge* linking out to the project page. A data room is not a link: it is documents you open
> in context, plus a record of who opened them. Investors now open documents inside
> [`/investor`](../src/views/InvestorPortalView.vue) via short-lived signed URLs; developers see
> **who is reading what** at [`/developer/data-room`](../src/views/DataRoomActivityView.vue).
> Migration **#30**. Build ✅ · ESLint 0 ✅ · **288 tests ✅** (+16).
>
> **Three deliberate calls.** (1) The access log is written **only** through
> `log_data_room_access()`, a SECURITY DEFINER RPC that derives *both* the viewer (`auth.uid()`) and
> the developer (`projects.user_id`) server-side — with a plain INSERT policy the client supplies
> `developer_id` and could forge either side, or erase a row that incriminates them. (2) **Viewers are
> counted, never named.** An investor doing diligence reasonably expects not to be published as a
> named lead list; "is anyone reading my PDD?" is answered by distinct-viewer counts. (3) **Distinct
> viewers, not raw views** — one investor refreshing a PDD ten times is one interested party, and
> "10 viewers" would flatter the developer with a meaningless number. Self-views aren't recorded.
>
> **Migration #30 APPLIED (2026-07-09).**
>
> 🔓 **2026-07-09 — EMAIL CONFIRMATION IS OFF, DELIBERATELY (accepted risk, not an oversight).**
> Supabase Auth "Confirm email" stays **disabled** because the custom-SMTP sender needs a paid domain
> the owner isn't buying yet. Consequence: **anyone can sign up with an email address they do not
> control.** That is tolerable for demos and testing; it is **not** tolerable once real users hold
> real money, because account recovery and every notification route through an unverified address.
> **Before real users:** register a domain → verify it in Resend → set the Supabase SMTP sender +
> creds → re-enable confirmation. Steps in [TODAY_2026-07-07.md](TODAY_2026-07-07.md) §1c. No code
> change needed; signup is a standard `supabase.auth.signUp()`.
>
> 📑 **2026-07-09 — #1 COMPLETE (8/8) · #4 now 6/8.** Two small closers, **no migration**:
> **MRV Report** is now an optional project document type (a published monitoring report reaches the
> public project page — #1's last bullet), and the MRV dashboard gained a dedicated **Energy
> generated** tile (kWh → MWh → GWh). The tile sums `energy_kwh` only and **deliberately excludes
> `energy_saved_kwh`** — energy *saved* is avoided consumption, a different claim, and adding them
> would overstate what the project produced. Build ✅ · ESLint 0 ✅ · **272 tests ✅**.
>
> **Scorecard:** #1 **8/8** · #2 **6/6** · #3 **7/7** · #4 **6/8** (only satellite + IoT, both
> external) · #5 **6/7** (data room is a link-out) · #6 3/6 · #7 0/5.
> Full detail: [EXPANSION_FEATURE_AUDIT.md](EXPANSION_FEATURE_AUDIT.md).
>
> 🌱 **2026-07-09 — CO₂ REMOVED vs AVOIDED SPLIT (closes #4b + #4c).** The MRV dashboard summed every
> verified reduction into one tCO₂e figure. Registries and buyers price removals and avoidances very
> differently — a durable removal (biochar, afforestation) is not interchangeable with an avoided
> emission (methane capture, clean energy displacing coal) — so collapsing them hid the distinction a
> carbon buyer looks for first. Migration **#29** adds `reduction_type` to
> `verified_emission_reductions`; the **verifier now asserts it at approval** (pre-selected from the
> project category, never auto-applied); the dashboard shows **removed / avoided / unclassified**.
> Build ✅ · ESLint 0 ✅ · **269 tests ✅** (+11).
>
> **Nothing is backfilled, and that is the point.** Legacy VERs were approved without anyone being
> asked. Guessing from the project category would stamp an assertion onto an already-issued credit
> that no verifier made — a registry-grade error. They stay NULL and surface in an explicit
> **Unclassified** bucket. The category only *pre-selects* the verifier's dropdown
> ([`suggestedReductionType`](../src/constants/mrv.js)) because a category isn't decisive either: a
> biochar project removes carbon *and* the bio-briquettes burnt alongside it avoid emissions.
>
> Drift-safety matters more than usual here: **issuance must never fail because a classification
> column is missing**, so `approveReport` retries the VER insert without `reduction_type` and mints
> the credits unclassified. The dashboard read falls back the same way.
>
> **Migration #29 APPLIED (2026-07-09).** **⬜ To finish:** approve an MRV report → pick
> Removal/Avoidance → the dashboard splits it.
>
> 🏷️ **2026-07-09 — REGISTRY CREDIBILITY PASS (closes #1c + #1g).** **Methodology is now an enum**
> ([`projectRegistry.js`](../src/constants/projectRegistry.js)): Verra (VCS), Gold Standard,
> Puro.earth, ISO 14064, CDM, ACR, CAR, Plan Vivo, ISCC, a PH national methodology, and the interim
> Carbonify Standard — plus **Other**, so no developer is forced into a wrong standard. It was a
> free-text box, so "Gold Standard", "gold standard" and "GS" were three different projects to any
> filter. **`development_status` is a new column** (migration **#28**): concept → feasibility →
> financing → construction → operational → decommissioned. It is **orthogonal to `projects.status`**,
> which is the Carbonify *validation* workflow — a project can be fully `validated` on the platform
> and still be nothing but a feasibility study in the real world, and conflating the two was the bug.
> The Investor Portal now **filters by standard and by stage**. Build ✅ · ESLint 0 ✅ ·
> **258 tests ✅** (+11).
>
> Care taken: `methodology` stays **TEXT with no CHECK** — legacy rows hold free text like
> "Verra VM0044", and a constraint would reject them on any later UPDATE, including ones unrelated to
> methodology. Editing an old project maps its free text into **Other** with the text preserved rather
> than silently discarding it. `development_status` is **nullable** — defaulting existing projects to
> 'concept' would assert something untrue about every project already in the registry. And the
> Investor Portal's query **falls back** if the column is absent, rather than 400-ing the whole
> pipeline over one optional field.
>
> **Migration #28 APPLIED (2026-07-09).**
>
> 🤝 **2026-07-09 — OFFTAKE AGREEMENTS / ERPAs SHIPPED (closes #5's biggest gap).** Until now every
> IRR in the Investor Portal rested on an **assumed** credit price for every credit the project might
> ever issue. An ERPA is what turns a slice of that into **contracted** revenue. New
> [`/developer/offtakes`](../src/views/OfftakeAgreementsView.vue) lets a developer record agreements
> (counterparty, volume, price, term, status); the Investor Portal now splits **contracted vs
> speculative** revenue, blends the negotiated price with the listed price for the remainder, and
> shows a **downside IRR on contracted revenue alone**. Migration **#27**. 22 new tests.
> Build ✅ · ESLint 0 ✅ · **247 tests ✅**.
>
> **Confidentiality is the load-bearing design call.** Counterparty names and negotiated prices are
> commercially sensitive, so full rows are **owner-only** under RLS. Investors reach only aggregates
> via `offtake_summary()` — a SECURITY DEFINER RPC that returns contracted volume/value/count per
> project and **never** a counterparty, price, or document. Insert is doubly guarded (you must claim
> yourself as developer **and** own the project), or a developer could attach an agreement to someone
> else's project and inflate its contracted revenue.
>
> **Only `signed`/`active` count as contracted.** A draft, a negotiation, a completed or a terminated
> agreement contributes nothing — counting any of them would restate speculative revenue as
> contracted, the precise error this feature exists to prevent.
>
> Two correctness details found while building: **`irrContracted` is null for two different reasons**
> — nothing contracted, *or* contracted revenue ≤ OPEX (every year negative, so no real IRR exists).
> The second is a **solvency warning**, not a missing number, so `contractedCoversOpex` disambiguates
> and the portal renders them differently. And **over-commitment** (contracted volume > estimated
> issuance) is flagged in both the developer view and the portal rather than letting speculative
> volume go negative.
>
> **Migration #27 APPLIED (2026-07-09).** **⬜ To finish:** a developer records a signed agreement →
> the Investor Portal shows contracted % and the downside IRR.
>
> ✅ **2026-07-09 — TOP 3 AUDIT GAPS CLOSED.** **#2 buyer history** (a Buyer history section on
> [`/developer/ledger`](../src/views/CarbonAssetLedgerView.vue): counterparties per project with
> credits, value, purchase count, last purchase — the ERPA use case), **#4 farmers participating +
> biomass collected + plantation hectares** (a new *Farmer supply chain* panel on the MRV dashboard,
> wiring expansion #6 into #4), and **#3 black pellets** as a first-class feedstock type. Build ✅ ·
> ESLint 0 ✅ · **225 tests ✅** (+18).
>
> **Migration #26 (`20260712000000_parcel_supply_visibility.sql`) APPLIED (2026-07-09)** — plantation
> hectares now resolve. The audit wrongly called hectares "no migration": migration #25 made
> `farm_parcels` readable only by the owning farmer, so a developer couldn't see the area of parcels
> supplying them. #26 adds a narrow policy — a buyer may read a parcel **only** if it supplied them a
> delivery **they confirmed**. The "—" fallback remains as a drift-safe degrade path.
>
> Two correctness notes worth keeping: **biomass tonnage excludes sacks/bales/m³** (their mass depends
> on bulk density — summing them would invent a number) and counts **confirmed deliveries only**;
> **buyer names degrade to "Unknown buyer"** if `profiles` reads are RLS-blocked, rather than erroring.
>
> 🔍 **2026-07-09 — BULLET-BY-BULLET AUDIT OF THE 7 EXPANSION FEATURES → [EXPANSION_FEATURE_AUDIT.md](EXPANSION_FEATURE_AUDIT.md).**
> The features were tracked at *feature* granularity ("#5 Investor Portal — shipped"), which hid
> missing **sub-items inside shipped features**. Audited against the code, the feature-level status
> below was **over-optimistic**. Real per-bullet score: **#1 5/8 · #2 5/6 · #3 6/7 · #4 0/8 fully ·
> #5 5/7 · #6 3/6 · #7 0/5.** The plumbing for all seven exists; the **investor- and farmer-facing
> storytelling layers** are the consistent gap. Concretely missing, despite the feature being marked
> shipped:
> - **#2 buyer history** — the developer ledger never selects `buyer_id`; only aggregate sold totals.
>   This is the exact ERPA / institutional-buyer use case the feature was built for.
> - **#4 farmers participating + plantation hectares** — the MRV dashboard **never reads**
>   `farm_parcels`/`farmer_deliveries`, even though migration #25 created them. Also no
>   avoided-vs-removed CO₂ split, and no "biomass collected" metric. The stated "biggest
>   differentiator" is the least complete feature.
> - **#5 offtake agreements** — zero functional code repo-wide. Every IRR in the Investor Portal
>   therefore rests on an *assumed* credit price, not contracted revenue.
> - **#6 carbon participation + training** — a farmer sees sacks and pesos, never how their feedstock
>   became a carbon credit. Plantation "monitoring" is a static register with no actual-vs-expected.
> - **#1 methodology is free text**, not an enum — Verra/Gold Standard/Puro/ISO are only placeholder
>   hint text, so nothing can filter or group by methodology. "Development status" is the validation
>   workflow status, not a project lifecycle stage. MRV reports aren't a registry document type.
> - **#3 black pellets** is not a first-class feedstock type (only `wood_pellets`).
>
> **Top 3 gaps need no migration** (MRV farmer join · ledger buyer history · black pellets). Full
> ranked close-out list is in the audit doc.
>
> 🤖 **2026-07-09 — EXPANSION FEATURE #7: INTERFACE ONLY (AI Project Assistant).** A discoverable
> [`/assistant`](../src/views/AiAssistantView.vue) preview so users can see the assistant is coming:
> chat surface, role-aware example questions, and a "what it will do" panel. **The backend does not
> exist** — the composer is disabled, nothing is sent anywhere, and no answers are generated. Linked
> in the profile dropdown under **Insights**, ungated (the Pro-gate decision waits for the backend).
> No migration, no new dependency. Build ✅ · ESLint 0 ✅ · **207 tests ✅**.
> **⬜ To finish #7:** a Supabase edge fn → Claude API with tool access to the project/credit/MRV
> tables. That needs an API key + running cost, and should stay RLS-scoped to the caller.
>
> 🧭 **2026-07-09 — EXPANSION FEATURE #6 SHIPPED (Farmer Portal).** The last big code lift of the
> expansion series. Introduces the **`farmer` role** and the smallholder supply side of the biomass
> chain: [`/farmer`](../src/views/FarmerPortalView.vue) — a plantation **parcel register** (crop,
> area, GPS, expected yield) and **delivery logging** against an *accepted* biomass RFQ, with proof
> uploads, buyer confirmation, and **payment tracking**. The buyer half is a new **Deliveries tab**
> on [`/biomass/rfqs`](../src/views/BiomassRfqsView.vue) (confirm receipt → mark paid). New pure
> [`farmerService`](../src/services/farmerService.js) (23 unit tests). Migration **#25** adds
> `farm_parcels` + `farmer_deliveries` + 3 SECURITY DEFINER RPCs, and widens the two role gates.
> Build ✅ · ESLint 0 ✅ · **207 tests ✅**.
>
> **Two deliberate design calls, both worth knowing:**
> 1. **Farmer payments are record-keeping, not settlement.** `payment_status` is a bookkeeping flag;
>    it never touches `ledger_entries`/`escrow_holds`/`payout_requests`. The proven money path
>    (`reconcile_financials()` = 0) is untouched by this feature.
> 2. **Farmers bypass the KYB gate on `/biomass/sell`.** KYB gates *payouts* (real money leaving the
>    platform); no platform money moves for feedstock, and farmers are admin-approved via the role
>    application. Requiring a business registration from a smallholder was friction with no safety
>    payoff. KYB is unchanged everywhere else.
>
> **Migration #25 APPLIED (2026-07-09).** **⬜ To finish:** a runtime click-through — admin approves a
> `farmer` role application (or sets the role in User Management) → farmer registers a parcel →
> lists feedstock → a buyer requests + accepts a quote → farmer logs a delivery → buyer confirms +
> marks paid.
> **Remaining expansion work: #7 (AI Assistant) only.** Earlier #1–#5 notes follow.
>
> 🧭 **2026-07-08 — EXPANSION FEATURE #5 SHIPPED (Investor Portal).** A Pro-gated
> [`/investor`](../src/views/InvestorPortalView.vue) portal for `buyer_investor` accounts: the
> cross-developer **pipeline** of validated projects, projected gross value, **funding gap**, a
> by-category value chart, and a per-project **financial model — IRR / NPV / payback** — from a
> fresh pure [`investorAnalytics`](../src/services/investorAnalytics.js) module (11 unit tests; no
> financial helper existed before). New `FEATURES.INVESTOR_PORTAL` gates it (Pro/Business). Migration
> **#24** persists `capex`/`opex`/`project_lifetime_years`/`funding_target`/`funding_raised` — the
> submit form collected CAPEX/OPEX but silently dropped them; now there's a "Financials (Optional)"
> subsection and they persist. Financials degrade gracefully to “—” when a project hasn't provided
> them. Build ✅ · ESLint 0 ✅ · **184 tests ✅**. **⬜ To finish:** apply migration #24, then a
> developer fills a project's Financials → the portal shows its IRR/NPV. **Remaining expansion work:
> #6 (Farmer Portal, needs role migration) · #7 (AI Assistant).** Earlier #1–#4 notes follow.
>
> 🧭 **2026-07-08 — EXPANSION FEATURE #4 SHIPPED (MRV roll-up Dashboard).** A developer-facing
> MRV dashboard at [`/developer/mrv-dashboard`](../src/views/MrvDashboardView.vue): verified /
> proposed / pending **tCO₂e** cards, a monthly **proposed-vs-verified trend** line chart, per-metric
> **measured-activity** sums (biomass, energy, hectares…), and a **per-project reporting-compliance**
> table (overdue / due-soon / on-track vs the admin cadence). Pure [`aggregateMrvDashboard`](../src/services/mrvDashboardService.js)
> over `monitoring_reports` / `verified_emission_reductions` / `monitoring_activity_data` (drift-safe),
> reusing the existing PortfolioChart/CategoryChart (no Chart.js re-registration). **No migration
> needed.** 6 unit tests. Build ✅ · ESLint 0 ✅ · **173 tests ✅**. Satellite/IoT feeds deferred
> (external). **Remaining expansion work: #6 (Farmer Portal, needs role migration) · #5 (Investor
> Portal) · #7 (AI Assistant).** Earlier #1–#3 notes follow.
>
> 🧭 **2026-07-08 — EXPANSION FEATURE #3 SHIPPED (Biomass Marketplace / feedstock RFQ).** A full
> feedstock marketplace: suppliers list biomass products, buyers submit a request-for-quotation,
> suppliers quote, buyers accept/decline. New migration **#22** (`biomass_products` + `biomass_rfqs`
> + 3 SECURITY DEFINER RPCs, RLS, no new role — listing is **KYB-gated**), [`biomassService`](../src/services/biomassService.js)
> (11 unit tests), and three views: public browse [`/biomass`](../src/views/BiomassMarketplaceView.vue),
> KYB-gated [`/biomass/sell`](../src/views/BiomassSellView.vue), and [`/biomass/rfqs`](../src/views/BiomassRfqsView.vue)
> (buyer + supplier tabs). Notifications wired on submit/quote/response. Build ✅ · ESLint 0 ✅ ·
> **167 tests ✅**. **⬜ To finish:** apply migration **#22** (§0), then a runtime click-through
> (list feedstock → request a quote as a second user → quote → accept). **Next up: #6 (Farmer
> Portal) or #4 (MRV dashboard).** Earlier #1/#2 notes follow.
>
> 🧭 **2026-07-08 — EXPANSION FEATURES #1 + #2 SHIPPED.** Two of the seven proposed PH-market
> expansion features are **code-complete** (🆕, runtime-unverified). **#2 — Carbon Asset
> Management:** a developer asset-ledger at [`/developer/ledger`](../src/views/CarbonAssetLedgerView.vue)
> that rolls up estimated/issued/pending/sold/retired/inventory (+ inventory & sold value) per
> project via the pure, drift-safe [`aggregateAssetLedger`](../src/services/assetLedgerService.js)
> (6 unit tests) — **no migration needed**. Linked in the developer top-nav + profile menu
> ("Carbon Assets"). Build ✅ · ESLint 0 ✅ · **156 tests ✅**. **Next up: #3 — Biomass Marketplace
> (feedstock RFQ).** The earlier #1 note follows.
>
> 🧭 **2026-07-08 — EXPANSION FEATURE #1 SHIPPED (Project Registry fields).** First of the
> seven proposed PH-market expansion features is **code-complete** (🆕, runtime-unverified).
> Added investor-facing registry fields to the project page: **feedstock**, **capacity**
> (+unit), and wired **methodology** into the submit form (the column existed since
> `20260607000400` but was never captured — only settable on edit). End-to-end across 5 files:
> new migration `20260707000200_project_registry_fields.sql` (+ `feedstock` / `capacity` /
> `capacity_unit` on `projects`), [ProjectForm.vue](../src/components/ProjectForm.vue) new
> "Registry Details" subsection, both insert whitelists + drift-guards
> ([projectService.js](../src/services/projectService.js),
> [projectWorkflowService.js](../src/services/projectWorkflowService.js)), and Feedstock/Capacity
> rows on [ProjectDetailView.vue](../src/views/ProjectDetailView.vue). Build ✅ · ESLint 0 ✅ ·
> **150 tests ✅**. **Migration #21 APPLIED (2026-07-08)** — the form now persists
> `feedstock`/`capacity`/`capacity_unit`/`methodology`. **⬜ To finish:** a runtime click-through
> (submit a project with the new fields → confirm they render on the detail page).
> **In progress:** expansion feature **#2 — Carbon Asset Management**
> (developer asset-ledger view). See §3 "Proposed expansion features" for the full status table.

> 📧 **2026-07-07 (latest) — SIGNUP EMAIL BLOCKER (config, not code).** Account creation
> was returning `500: Error sending confirmation email`. Auth logs showed
> `550 "yourdomain.com domain is not verified"` — the Supabase custom SMTP (Resend) still
> had the **placeholder `…@yourdomain.com` sender**, so every confirmation email was rejected.
> **Temp fix (DONE):** "Confirm email" is now turned **OFF** in Supabase Auth — signups work
> again for testing (must be re-enabled before real users). **Permanent fix (P0 before launch):**
> register an owned domain → verify it in Resend → set the Supabase SMTP sender + creds →
> re-enable confirmation. Full steps in [TODAY_2026-07-07.md](TODAY_2026-07-07.md) §1c. No repo
> change — signup code is a standard `supabase.auth.signUp()`.
>
> ⬜ **Next: apply the 4 pending DB migrations (§0 #17–20).** Paste-ready consolidated SQL for all
> four (profiles role/KYC lock, retire-identity, project-documents bucket + private) has been
> prepared for the Supabase SQL Editor. **Still pending apply + verify** — until then the
> privilege-escalation hole is open and developer compliance-doc uploads have no bucket.

> 🚀 **2026-07-07 (earlier) — MERGED TO `main` + DEAD-CODE CLEANUP.** The full
> `feature-user-onboarding-ux` branch (Phases 0–8, the proven money cutover, security
> close-out, role-interface hardening, freemium analytics) was **merged into `main`**
> via **PR #2** (merge `d3ee30d`) — `main` is no longer stale. Then a **dead-code sweep**
> removed **23 verified-unimported files** (the entire `src/_hidden/` tree, the three
> unused `MarketplaceView*.vue` variants — only `MarketplaceViewEnhanced.vue` is routed —
> and `Header_backup.vue`) plus the stale `MarketplaceView.vue` entry in `vite.config`
> `manualChunks`; merged via **PR #3** (merge `fb14e42`). Debug utils
> (`debugAdminQueries`/`diagnoseAdminDashboard`/`verifyTestAccounts`) were **kept** — they
> are still imported by `AdminDashboard.vue`/dev components. Build ✅ ESLint 0 ✅ **150 tests ✅**.
> **No code/migrations were changed by the merge** — the 4 pending DB migrations below
> (🔴 profiles role/KYC lock + project-documents bucket) are **still unapplied** and remain
> the gate for real usage. Console-log emojis were intentionally left (dev-facing only).

> 🖤 **2026-07-07 (earlier) — FREEMIUM ANALYTICS + UI POLISH.** (1) **Analytics is now on
> for every role** (profile menu → Insights → Analytics) with a **freemium split**: free
> users get the summary metric cards; **Pro** unlocks the trend charts, category breakdown,
> full history, and the Selling tab. (2) **Fixed the analytics crash** — Chart.js v4
> needed the controllers registered (`LineController`/`DoughnutController`); this also fixed
> `/market` and the LGU ESG chart. (3) **Replaced all rendered emojis with monochrome
> Material Symbols icons** across the UI (dev console logs + dead `_hidden/` views left as
> is). Build ✅ ESLint ✅ 150 tests ✅. See [ANALYTICS.md](ANALYTICS.md).

> 📊 **2026-07-07 (later) — LIVE STATS + ANALYTICS.** The homepage hero stats were
> **hardcoded placeholders** (2.3M / 150+ / 45 / 5.2M) — now wired to **real data** via
> `public_market_stats()` (Retired / Active Projects / Credits Available / CO2 Reduced;
> show `—` until loaded). The prebuilt **Analytics dashboard was disabled** (route
> redirected to `/`) — now **re-enabled at `/analytics`** (Buying tab free; Selling tab
> Pro-gated) and linked in the profile menu. Document storage was also hardened to a
> **private bucket + signed URLs** (migration `20260707000100`). Full analytics map +
> tooling guidance: **[ANALYTICS.md](ANALYTICS.md)**. Build ✅ ESLint ✅ 150 tests ✅.

> 🎨 **2026-07-07 — ROLE-INTERFACE HARDENING (this session).** Audited + fixed the
> **Project Developer, Verifier, and LGU** interfaces so we can onboard real project
> developers. **Critical fix:** compliance documents now actually upload to storage (they
> were never saved before — links were dead). Also: enforced required docs on submit,
> fixed verifier status badges + silent price-save failure, developer Contact Support +
> Seller Earnings error state, LGU diverted-tonnage clamp, brand-green unification,
> role-aware landing, rubric-gated Validate, MRV reject confirm, and developer/LGU empty +
> error states. Build ✅ ESLint ✅ **150 tests ✅**. **One new migration to apply:**
> `20260707000000_project_documents_bucket.sql` (creates the `project-documents` bucket).
> 👉 **Full changelog + today's test plan: [TODAY_2026-07-07.md](TODAY_2026-07-07.md).**
> LGU self-application was intentionally deferred (LGU stays admin-provisioned).

> 🔒 **2026-07-04 — SECURITY CLOSE-OUT + INTEGRITY HARDENING (this session).**
> The P0 security items are now **applied + tested on the live project**: profiles
> role/KYC lock (`20260703000300`), retire identity (`…000400`), self-purchase
> guard (`…000500`), widened reconcile (`…000600`), **rate limiting**
> (`20260704000000` + checkout redeploy), JWT-only checkout identity, closed email
> relay + **SMTP/email confirmation live**, and legacy/demo code removed. New
> capabilities shipped + verified: **Sentry error tracking** (live), **external PSP
> settlement reconciliation** (`paymongo-reconcile` — already caught 6 orphaned
> paid intents in sandbox). **Two features are pushed but await tomorrow's
> deploy/test:** (A) **`paymongo-resettle`** (heals orphaned paid intents) and
> (B) **velocity caps by KYC tier** (`20260704000200` + checkout redeploy).
> 👉 **The step-by-step test plan for tomorrow is
> [SECURITY_CLOSEOUT_CHECKLIST.md](SECURITY_CLOSEOUT_CHECKLIST.md) §3.**
> Only P0 item left before LIVE keys: an **independent penetration test**.

> **Updated:** 2026-07-03 · **Branch:** `feature-user-onboarding-ux` · **PR #2 → `main`**
> ✅ **Server-authoritative money cutover is COMPLETE and HARDENED.** All six money
> flows (card, wallet top-up, wallet buy, cart, retire, subscription) settle
> server-side and `reconcile_financials()` = 0 — **re-verified after** the P1 RLS
> lockdown (financial tables are now server-write-only). See
> [MONEY_CUTOVER_STATUS.md](MONEY_CUTOVER_STATUS.md) and
> [YOUR_CUTOVER_STEPS.md](YOUR_CUTOVER_STEPS.md) for the completed runbook, and
> [RELEASE_NOTES.md](RELEASE_NOTES.md) for the release summary. Pair with
> [ROADMAP_SIMPLE.md](ROADMAP_SIMPLE.md) and
> [PRODUCTION_READINESS_TODO.md](PRODUCTION_READINESS_TODO.md).
>
> **User & developer docs:** step-by-step per-role guides live in
> [user-guide/](user-guide/README.md); developer onboarding/architecture/deploy
> docs live in [dev/](dev/README.md).

> ✅ **2026-07-03 — cutover done.** B–E passed after fixing four out-of-version-control
> DB objects the live flows surfaced (migrations `20260703000000`–`20260703000200`):
> `update_wallet_balance_atomic` (was in no migration), `wallet_transactions.external_reference`
> (missing column), the RetireView `project_id` mapping, and a stray
> `credit_ownership_quantity_positive` (> 0) constraint that blocked retirement. Then
> the RLS lockdown was applied and all six flows re-verified at reconcile = 0. Older
> "partially verified / B–E remain" notes below are historical.

> 🔐 **2026-07-03 — SECURITY REVIEW DONE; NOT YET CLEARED FOR LIVE PAYMENT KEYS.**
> Two adversarial reviews (payment path + auth/RLS/secrets) ran before real-user
> deployment. Frontend hardening is **applied** (security headers, `v-html` XSS
> escape, prod-log stripping, no client secret key). Higher-severity fixes are
> **written and queued** — chiefly a **Critical** `profiles` privilege-escalation
> lock (migration `20260703000300`), retirement identity (`20260703000400`), an
> **open email relay** (`send-approval-email`), and **JWT-enforced checkout
> identity**. **Full findings, exact fixes, and the go/no-go checklist:**
> [dev/DEPLOYMENT_READINESS.md](dev/DEPLOYMENT_READINESS.md). **What to do now, by
> priority:** [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md). Run in **sandbox mode only**
> until the 🔴/🟠 items + an independent penetration test are done.

> 📚 **New docs this session:** product overview [ABOUT_CARBONIFY.md](ABOUT_CARBONIFY.md);
> per-role user guides [user-guide/](user-guide/README.md); developer docs
> [dev/](dev/README.md); rebuild/finish prompt [CARBONIFY_BUILD_PROMPT.md](CARBONIFY_BUILD_PROMPT.md);
> deployment readiness [dev/DEPLOYMENT_READINESS.md](dev/DEPLOYMENT_READINESS.md);
> go-live roadmap [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md). Also removed a dead
> `/register/lgu` link + unwired listing methods.

</details>

---

## TL;DR

Phases 0–8 are **code-complete** and the **money path is fully proven** (purchase + subscription
+ **payout + refund**, all reconciling to 0 — verified 2026-07-01).
The 2026-06-26 session shipped DPA tooling, the edit/resubmit loop, project-detail page,
`local|supplier` + SDG filters, ESG export, finance console, VAT invoices, public registry,
a schema-drift catch-up, then a **codeable-backlog sweep** (scored rubric, boundary map, MRV
reminders, offline SW, mobile polish) and a **Phase 2–4 sweep** (payment-path tests → 114
tests, composite indexes + paginated history, `/market` dashboard + double-claim guard, buyer
portfolio P&L) and nav links. The **2026-07-01 session** then proved the money-path edges
(payout + refund), shipped the codeable backlog + admin action consoles, and runtime-verified
everything. Build green, ESLint 0, **145 tests** (~86 commits ahead of `main`).

> ✅ **2026-06-26 — THE CORE MONEY PATH IS PROVEN.** The §0 migrations were applied, the 3
> PayMongo secrets were set, the **bug-fixed `paymongo-webhook` was deployed**, and a real
> sandbox purchase (PayMongo test card on the Vercel preview) **settled cleanly** —
> `reconcile_financials()` returns **0 rows** after the sale, and **subscription** was verified
> too (`/upgrade` → Pro flipped `profiles.plan`). The #1 blocker the rest of this doc was built
> around is **cleared**. The registry, `/market` dashboard, and offline service worker were also
> verified live in the same session.

> ✅ **2026-07-01 — MONEY PATH FULLY PROVEN + click-through complete.** The remaining edges were
> verified: **KYB-gated payout** and **cart + refund** both settled with `reconcile_financials()`
> at **0 rows**. The `account-deletion` edge function was deployed (DPA erasure works). The
> session's new features (seller per-project earnings, purchases pagination, structured
> additionality/permanence, saved-search/price alerts) were all runtime-verified, and the admin
> KYB-review + refunds consoles + seller KYB form + KYC-level admin override were exercised.

**What's left of the money path:** ✅ **nothing** — as of 2026-07-03 the gated cutover is
**done**: the Buy/top-up/retire UI runs fully server-side and the financial-table RLS lockdown
has been applied and re-verified (all six flows reconcile to 0). Everything else depends on an
external partner (real registry, AML data, PSP) or ops/legal.

> ✅ **Migrations applied + audit clean** (2026-06-26). The live DB had drifted behind the
> migrations all session; the §0 catch-up (`20260626000700`) + audit
> ([diagnostics/schema_catchup_audit.sql](../supabase/diagnostics/schema_catchup_audit.sql))
> resolved it. Re-run the audit anytime to confirm (empty result = good).

---

## 0. Pending migrations — apply via SQL Editor (idempotent, safe to re-run)

This session added migrations. Apply any not yet run, in this order (all use
`IF NOT EXISTS` / `NOT VALID` / `on conflict do nothing`, so re-running is harmless):

| # | Migration | Purpose |
|---|---|---|
| 1 | `20260626000700_schema_catchup.sql` | Ensures all drift-prone columns + the `credit_transactions→profiles` FKs + widened `projects` status constraint (supersedes the column-adds of 000100/000400). |
| 2 | `20260607000200_supplier_orders.sql` | `supplier_orders` table (audit flagged it missing). |
| 3 | `20260626000200_notify_project_submitted_trigger.sql` | Verifier bell on submit/resubmit. |
| 4 | `20260626000300_backfill_validated_listings.sql` | Publishes validated projects to the marketplace + backfills. |
| 5 | `20260626000500_fix_credit_pool_availability.sql` | Fixes the `credits_available` pool (false "sold out"). |
| 6 | `20260626000600_admin_finance_console.sql` | Admin finance RPCs (`is_admin`-gated). |
| 7 | `20260626000800_seed_tax_settings.sql` | Seeds VAT/company tax settings. |
| 8 | `20260626000900_public_registry.sql` | Public registry RPCs (anon-granted). |
| 9 | `20260626001000_performance_indexes.sql` | Hot-path indexes. |

Already applied earlier this session: `20260626000000` (DPA), `20260626000100` (status
constraint), `20260626000400` (marketplace reconcile). After applying, **re-run the audit**
to confirm an empty result.

> 🆕 **Two more migrations from the Phase 2–4 code sweep** (apply via SQL Editor; idempotent,
> drift-safe, no behaviour change to existing flows):
> | # | Migration | Purpose |
> |---|---|---|
> | 10 | `20260627000000_scale_composite_indexes.sql` | Composite hot-path indexes (sold-qty scan, history, seller listings). |
> | 11 | `20260627000100_market_integrity.sql` | Double-claim serial guard + `public_market_stats()` RPC (powers `/market`). |
> | 12 | `20260627000200_fix_admin_recent_transactions_casts.sql` | **Fixes a live 42804** — `admin_recent_transactions()` selected raw `credit_transactions` columns with no casts, so on a drifted DB (e.g. `quantity` integer ≠ declared numeric) the Finance Console RPC 400'd. Now casts each column to its declared type. |

> 🆕 **2026-07-03 migrations.** The cutover fixes (13–16) were **applied + verified live** this
> session. The security fixes (17–18) are **NEW and NOT yet applied** — apply them and re-test
> before real users (see [dev/DEPLOYMENT_READINESS.md](dev/DEPLOYMENT_READINESS.md)).
> | # | Migration | Status | Purpose |
> |---|---|---|---|
> | 13 | `20260703000000_update_wallet_balance_atomic.sql` | ✅ applied | Wallet top-up settlement fn (was defined in no migration). |
> | 14 | `20260703000100_wallet_transactions_external_reference.sql` | ✅ applied | Adds the missing top-up audit column + index. |
> | 15 | `20260703000200_fix_credit_ownership_quantity_constraint.sql` | ✅ applied | Drops stray `> 0` constraint (blocked retirement); asserts `>= 0`. |
> | 16 | `20260702000000_fix_marketplace_ownership_status.sql` | ✅ applied | `credit_ownership.status = 'owned'` (was `'active'`, rejected by constraint). |
> | 17 | `20260703000300_harden_profiles_role_kyc.sql` | ✅ **applied (2026-07-04)** | 🔴 Blocks direct client writes to `profiles.role`/`kyc_level` (privilege escalation). Admin RPCs still work. **Verify a normal user can't self-promote.** |
> | 18 | `20260703000400_retire_credits_authuid.sql` | ✅ **applied (2026-07-04)** | Binds retirement identity to `auth.uid()`. **Retest flow E → reconcile 0.** |

> 🆕 **2026-07-07 migration** (apply via SQL Editor; idempotent). See
> [TODAY_2026-07-07.md](TODAY_2026-07-07.md).
> | # | Migration | Status | Purpose |
> |---|---|---|---|
> | 19 | `20260707000000_project_documents_bucket.sql` | ✅ **applied (2026-07-09)** | 🔴 Creates the `project-documents` storage bucket + RLS so developer compliance PDFs actually upload and are retrievable (were never stored before — dead links). Also backs farmer delivery-proof uploads (#25). |
> | 20 | `20260707000100_project_documents_private.sql` | ✅ **applied (2026-07-09)** | Makes that bucket **private** (compliance PDFs = sensitive PII) + authenticated SELECT for signed URLs. App resolves short-lived signed URLs; anon can no longer open raw docs. |

> 🆕 **2026-07-08 migration** (apply via SQL Editor; idempotent, additive, drift-safe).
> | # | Migration | Status | Purpose |
> |---|---|---|---|
> | 21 | `20260707000200_project_registry_fields.sql` | ✅ **applied (2026-07-08)** | Adds `feedstock`, `capacity`, `capacity_unit` to `projects` (+ non-negative `capacity` check) for the investor-facing Project Registry. Applied live; the form now persists these + `methodology`. ⬜ Remaining: a runtime click-through (submit a project with the new fields → confirm they render on the detail page). |
> | 22 | `20260708000000_biomass_marketplace.sql` | ✅ **applied (2026-07-08)** | Expansion #3. Creates `biomass_products` (supplier feedstock catalog) + `biomass_rfqs` (buyer request + folded quote) with RLS (public browse of active products; owner writes; buyer-or-seller-or-admin reads RFQs) and 3 SECURITY DEFINER RPCs for status transitions (`submit_biomass_quote` / `respond_biomass_quote` / `close_biomass_rfq`). Applied live. ⬜ Remaining: runtime click-through (list feedstock KYB-gated → request a quote as another user → quote → accept). |
> | 24 | `20260710000000_project_financials.sql` | ✅ **applied (2026-07-09)** | Expansion #5. Adds `capex`, `opex`, `project_lifetime_years`, `funding_target`, `funding_raised` to `projects` (non-negative checks) so the Investor Portal can model IRR/NPV/payback + funding gap. The submit form now captures them (new "Financials" subsection). ⬜ Remaining: a developer edits a project → fills Financials → the Investor Portal shows IRR/NPV. |
> | 31 | `20260717000000_farmer_carbon_participation.sql` | ✅ **applied (2026-07-09)** | Expansion #6's carbon bullet. Adds `farmer_deliveries.project_id` (the link whose absence made attribution impossible), re-creates `confirm_farmer_delivery()` with a 4th `p_project_id` param **validating the buyer owns that project**, and adds `farmer_carbon_participation()` (SECURITY DEFINER, so a farmer never needs read access to `verified_emission_reductions` or to other farmers' deliveries). Rule: `verified × farmer_tonnes / project_tonnes` over confirmed deliveries + approved VERs — see [FARMER_CARBON_ATTRIBUTION.md](FARMER_CARBON_ATTRIBUTION.md). **Apply, then a buyer confirms a delivery naming a project → the farmer's Carbon tab shows their attributed tCO₂e.** |
> | 30 | `20260716000000_data_room_access_log.sql` | ✅ **applied (2026-07-09)** | Expansion #5's last bullet. Creates `data_room_access_log` (project, developer, viewer, document, action) with **no INSERT/UPDATE/DELETE policy** — writes go only through `log_data_room_access()`, a SECURITY DEFINER RPC deriving viewer from `auth.uid()` and developer from `projects.user_id`, so neither identity can be forged and a log row can't be erased by the person it incriminates. Reads are limited to the two parties + admin (one investor must not see which rivals are doing diligence). Self-views and non-validated projects are skipped. **Apply, then an investor opens a document in `/investor` → the developer sees it at `/developer/data-room`.** |
> | 29 | `20260715000000_ver_reduction_type.sql` | ✅ **applied (2026-07-09)** | Adds `verified_emission_reductions.reduction_type` (`removal` / `avoidance`, **nullable**, CHECK-constrained + partial index on approved rows). Closes #4's CO₂-avoided-vs-removed bullet. **Deliberately not backfilled** — a legacy VER was approved without anyone asserting a type, and guessing from the project category would fake a verifier's assertion on an issued credit. The MRV dashboard shows an explicit **Unclassified** bucket instead. **Apply, then approve an MRV report → pick Removal/Avoidance → the dashboard splits it.** |
> | 28 | `20260714000000_project_development_status.sql` | ✅ **applied (2026-07-09)** | Adds `projects.development_status` (concept / feasibility / financing / construction / operational / decommissioned, nullable, CHECK-constrained + partial index) — the **real-world lifecycle**, distinct from `projects.status` (the Carbonify validation workflow). Closes #1's "development status" bullet. `methodology` intentionally stays free TEXT (the UI drives it from a canonical list; a CHECK would reject legacy rows like "Verra VM0044" on any later UPDATE). **Apply, then Submit/Edit Project offers a Development Status dropdown and the Investor Portal gains a stage filter.** |
> | 27 | `20260713000000_offtake_agreements.sql` | ✅ **applied (2026-07-09)** | Expansion #5's missing bullet. Creates `offtake_agreements` (project, counterparty, volume, price, term, status) — **owner-only RLS**, since counterparty + price are commercially sensitive — plus `offtake_summary(uuid[])`, a SECURITY DEFINER RPC returning only contracted volume/value/count per validated project (never a counterparty or price) so investors can see contracted share without seeing terms. Insert is doubly guarded: `developer_id = auth.uid()` **and** the caller owns the project. **Apply, then a developer records a signed agreement → the Investor Portal shows contracted % + downside IRR.** |
> | 26 | `20260712000000_parcel_supply_visibility.sql` | ✅ **applied (2026-07-09)** | Unblocks **plantation hectares** on the MRV dashboard. #25 made `farm_parcels` owner-private, so a developer couldn't read the area of parcels supplying them. Adds a narrow SELECT policy: a buyer may read a parcel **only** where it supplied them a delivery with `status='confirmed'` (a pending/rejected delivery grants nothing, so a farmer can't be exposed by merely logging one). Owner INSERT/UPDATE/DELETE from #25 untouched. Plus a `(parcel_id, buyer_id, status)` index. **Apply, then the MRV dashboard's “Plantation hectares” stops showing “—”.** |
> | 25 | `20260711000000_farmer_portal.sql` | ✅ **applied (2026-07-09)** | Expansion #6. Adds `farm_parcels` (plantation register, owner-private RLS) + `farmer_deliveries` (delivery against an accepted RFQ, with proof docs, buyer confirmation, and a bookkeeping `payment_status`) + 3 SECURITY DEFINER RPCs (`record_farmer_delivery` / `confirm_farmer_delivery` / `mark_farmer_delivery_paid` — no INSERT/UPDATE policy, so a farmer can't mark their own delivery paid). Also **widens the two role gates**: `assign_user_role()` now admits `'farmer'`, `role_applications.role_requested` CHECK now admits `'farmer'`, and `notify_role_application_trigger()` routes farmer applications to admins. **Apply, then run the click-through in the header note.** |
> | 23 | `20260709000000_admin_set_kyb_verified.sql` | ✅ **applied (2026-07-08)** | Adds `admin_set_kyb_verified(uuid, boolean)` (is_admin-gated) so an admin can manually verify a business from **User Management** — clears the "Business verification required" gate for a developer who never filed a KYB application (previously only `review_kyb_application` could set `kyb_verified`, and only against an existing application). Also revokes client `update(kyb_verified)` so users can't self-verify. **Apply, then: Admin → User Management → edit a user → tick "Business verified (KYB)" → Save → that account's Sell-Feedstock gate disappears.** |

---

### 0.4 🆕 2026-07-22 — role audit + hardening migrations (NOT yet applied)

Apply in order. All additive and idempotent, each with its own `AFTER APPLYING,
TEST` checklist and a rollback block in its header.

| # | Migration | Purpose | Inert until applied? |
|---|---|---|---|
| 1 | `20260721000400_seller_listing_management.sql` | `update_my_listing` RPC — sellers set price / quantity / pause. Clamps quantity to the pool so a raised listing cannot fail *after* the buyer pays. | Manage-listing errors |
| 2 | `20260722000100_verifier_independence_guard.sql` | Nobody may validate a project they own, or approve VERs against it. | ⚠️ **Silently** — UI works, guard absent |
| 3 | `20260722000200_verifier_queue_assignment.sql` | `assigned_verifier_id` + `list_verifiers()`. | Assignment picker errors |
| 4 | `20260722000300_verification_timeline.sql` | Lets verifiers read **project-scoped** audit rows (payments/auth stay admin-only). | Timeline shows only its spine |
| 5 | `20260722000400_evidence_integrity.sql` | EXIF capture time + GPS + SHA-256 hash on MRV evidence; duplicate detection. | Degrades gracefully — upload still works |
| 6 | `20260722000500_lgu_jurisdiction.sql` | `profiles.municipality` + endorsement jurisdiction trigger. | ⚠️ **Silently** — every LGU still sees every project nationwide |
| 7 | `20260722000600_lgu_record_evidence.sql` | Attachments on LGU emissions records. | Degrades gracefully |
| 8 | `20260722000700_dpa_admin_queue.sql` | `process_data_subject_request` — the DPA queue's missing action path. | `/admin/privacy` lists, actions error |
| 9 | `20260722000800_account_suspension.sql` | `profiles.is_active` + suspension guards at `assert_can_trade`, retirement and project insert. | Suspend button errors |
| 10 | `20260722000900_admin_segregation_of_duties.sql` | No self-granted KYC level, role, KYB verification, or refund on your own transaction. | ⚠️ **Silently** — self-dealing stays possible |
| 11 | `20260722001000_aml_screening.sql` | `aml_watchlist_entries` + `aml_screenings` + record/review RPCs. | `/admin/aml` errors |

**Verify all eleven in one query** (each row should read `true`):

```sql
select 'update_my_listing'            as check, exists(select 1 from pg_proc where proname='update_my_listing') as ok
union all select 'verifier independence', exists(select 1 from pg_trigger where tgname='trg_guard_project_self_validation')
union all select 'queue assignment',      exists(select 1 from information_schema.columns where table_name='projects' and column_name='assigned_verifier_id')
union all select 'timeline policy',       exists(select 1 from pg_policies where tablename='audit_logs' and policyname like 'Verifiers%')
union all select 'evidence integrity',    exists(select 1 from information_schema.columns where table_name='monitoring_evidence' and column_name='content_hash')
union all select 'lgu jurisdiction',      exists(select 1 from information_schema.columns where table_name='profiles' and column_name='municipality')
union all select 'lgu evidence',          exists(select 1 from information_schema.columns where table_name='lgu_emissions_records' and column_name='documents')
union all select 'dpa admin rpc',         exists(select 1 from pg_proc where proname='process_data_subject_request')
union all select 'suspension',            exists(select 1 from information_schema.columns where table_name='profiles' and column_name='is_active')
union all select 'admin sod',             exists(select 1 from pg_proc where proname='admin_set_kyb_verified')
union all select 'aml screening',         exists(select 1 from information_schema.columns where table_name='aml_screenings' and column_name='status');
```

> The Supabase SQL editor shows **only the last statement's result** when several
> are pasted together. Run the union above as one statement, or check each
> separately — a single-row result is not confirmation that the others passed.

**The two runtime checks that matter most**, because each is the whole point of
its feature and the thing a careless change would break:

1. A **suspended user can still download a retirement certificate.** Suspension
   blocks transacting, never access to your own records — a retirement
   certificate is ESG evidence and a platform sanction must not destroy it.
2. An **admin editing their own display name still succeeds.** The SoD guard
   compares against *current* values precisely so this keeps working; the admin
   UI submits the whole form every time.

---

### 0.5 🆕 2026-07-23 — profile-on-signup (✅ applied 2026-07-25)

One migration. Additive, idempotent, safe to re-run; has a rollback block in its
header.

| # | Migration | Purpose | Inert until applied? |
|---|---|---|---|
| 1 | `20260723000100_profile_on_signup.sql` | A `security definer` trigger on `auth.users` creates the profile row **inside the signup transaction**, before any session exists — plus a backfill for accounts already missing one. | ⚠️ **Silently** — email-confirmation signups get no profile, so they load blank and demoted to `general_user` |

**✅ Applied to the live project on 2026-07-25.** Run the verify query below to
confirm (`trigger_installed = true`, `users_without_profile = 0`). The client-side
resilience that pairs with it (last-known-role preservation, working retry, failure
banner) shipped the same day — see the 🆕 2026-07-25 note near the top.

**Why a trigger and not client code:** the profile was created from the browser
right after `signUp()`. That only works when `signUp` returns a session; with
email confirmation on it does not, so the client INSERT is refused by the
`profiles` RLS policy (`auth.uid() = id`) and the error is swallowed. OAuth and
phone signups never ran that path at all. A definer trigger is the only place
that can hold the invariant. The trigger always writes `general_user` — trusting
a role from signup metadata would let anyone self-register as admin — and swallows
its own errors so a failure can never block a signup.

**Verify:**

```sql
select exists(select 1 from pg_trigger where tgname = 'on_auth_user_created') as trigger_installed,
       (select count(*) from auth.users u
          left join public.profiles p on p.id = u.id
         where p.id is null) as users_without_profile;  -- expect 0 after backfill
```

Then: register a brand-new email on a project with confirmation enabled → confirm
a `profiles` row exists immediately, with the name from signup and role
`general_user`.

---

## 1. What changed

### 2026-07-23 — navigation → sidebar, and a login/register/role-guard audit (branch `feature-user-onboarding-ux`)

**Navigation.** Collapsed three parallel menus (top nav, avatar dropdown,
per-dashboard link directories) into a single grouped left sidebar for signed-in
users, sourced from one canonical destination table
([constants/navigation.js](../src/constants/navigation.js)). The header retains
only identity and alerts; the avatar menu is account-only; the three-line button
next to the logo opens the mobile drawer and collapses the desktop rail (the
sidebar's own collapse control was removed so there is one). Guests keep the
marketing header. Developer projects collapse to grouped one-line rows
([DeveloperProjectsDashboardView.vue](../src/views/DeveloperProjectsDashboardView.vue),
[groupDeveloperProjects.js](../src/utils/groupDeveloperProjects.js)). Dead
`UserDashboard.vue` / `UserProfile.vue` deleted. New: `AppSidebar` (rewritten),
[useSidebar.js](../src/composables/useSidebar.js), [logout.js](../src/utils/logout.js).

**Access control.** Fixed three blockers (public marketplace redirecting to login;
`super_admin` infinite-redirect; non-buying roles reaching checkout) at their root
— route `meta.public`, a shared `canonicalizeRole()` mirroring the DB, and
`disallowedRoles` on the buying routes. Removed ~450ms of hardcoded per-navigation
guard sleeps that waited on an already-resolved promise. Auth-form signals
(email-confirmation-pending, already-registered) now reported honestly; the
specialist-approval gate keys on `err.code`; storage clearing scoped to auth keys
only; the dead `canAccessRoute`/`getRoutePermissions`/`createRoleGuard` path
removed. Fixed a verifier-panel TDZ crash in
[ProjectApprovalPanel.vue](../src/components/admin/ProjectApprovalPanel.vue).
Verified every role's dashboard mounts clean in a real browser. New migration in
§0.5. **+122 tests** (543 → 665): navigation IA, sidebar render per role, project
grouping, route-access metadata, role canonicalization, auth-flow signals, and
auth-storage-key scoping.


### 2026-07-02 — server-authoritative cutover: first live sandbox pass (bug found + fixed; commit `a881294`)
The cutover money path was runtime-tested for the first time. It did **not** work
out of the box — the first purchase surfaced a hard blocker that had been latent
because this RPC path was never exercised against the live DB. Fixed and
**partially re-verified** the same session.

| Area | What | Notes |
|---|---|---|
| **Bug (critical)** | `process_marketplace_purchase` inserted `credit_ownership.status = 'active'`; the live `credit_ownership_status_check` allows only `'owned'`/`'retired'`/`'transferred'` → **every card/cart purchase rolled back**, webhook 500'd, intent stuck `pending`, and **PayMongo auto-disabled the webhook** after repeated failures | Fix: migration `20260702000000_fix_marketplace_ownership_status.sql` (`status = 'owned'`, matching sibling `process_wallet_purchase`). Safe — `status` is not a read filter (portfolio uses `ownership_type`; retire filters on user/project/qty) |
| **Ops** | PayMongo webhook had been auto-disabled → re-created it + reset `PAYMONGO_WEBHOOK_SECRET`; delivery restored | PayMongo has no dashboard "re-enable"; recreate or call the `/enable` API |
| **Diagnostics** | `paymongo-webhook` now records thrown handler errors to `webhook_events.error` (was silent — a failed handler just left the event at `received` and retried) | [paymongo-webhook/index.ts](../supabase/functions/paymongo-webhook/index.ts) |
| **UI** | `/upgrade` now confirms/polls the plan on return from PayMongo (`?status=success`) and shows success/pending/cancelled; previously it silently re-rendered "Free" even on a successful upgrade | [UpgradeView.vue](../src/views/UpgradeView.vue) |
| **DB** | Applied §0 `20260626000700_schema_catchup` (adds `credit_transactions → profiles` FKs); schema audit now empty → the receipt/certificate 400 join noise is gone | — |

> **Step 4 status (see [YOUR_CUTOVER_STEPS.md](YOUR_CUTOVER_STEPS.md)):**
> ✅ **A. card purchase** (settles via webhook, certificate issued, reconcile = 0) ·
> ✅ **F. subscription** (`/upgrade` → Pro via `activate_subscription`) ·
> ⬜ **B. wallet top-up** · ⬜ **C. wallet purchase** · ⬜ **D. cart (2 items)** ·
> ⬜ **E. retire credits** — **not yet tested.** The **P1 RLS lockdown stays gated**
> until B–E pass. B–E run through `process_wallet_purchase` / `ensure_wallet` /
> `retire_credits_atomic` — the webhook now surfaces any failure in
> `webhook_events.error`.

### 2026-07-01 — money edges proven + codeable backlog + admin consoles (build green, ESLint 0, 145 tests)
The money path was proven end-to-end and the remaining "built-but-not-clickable" gaps were closed.
Everything below was **runtime-verified** this session (not just build-green). Four idempotent
migrations (`20260701000000–000300`) were applied.
| Area | What | Notes |
|---|---|---|
| **Money edges** | ✅ **payout + refund proven** — KYB-gated payout settled; cart + refund reversed; `reconcile_financials()` = 0 throughout | Phase 2 now PROVEN, not just code-complete |
| Backlog | Seller **per-project earnings** breakdown on `/sales` | pure `aggregateSalesByProject` + unit tests |
| Backlog | **Server-side pagination** on the buyer purchases tab | also un-orphaned `/retire` (redirected to `/wallet`, was unreachable) |
| Phase 3 | **Structured additionality + permanence** metadata (form → trust card) | migration `…000000`; persisted across all 3 write paths |
| Phase 6 | **Saved searches + price alerts** (marketplace) | migration `…000100`; bell alert on new/cheaper match |
| Nav | Surfaced **Retire Credits** (buyers) + **Seller Earnings** (developers) in nav | both existed but were linked nowhere |
| Phase 5 | **Admin KYB-review console** (`/admin/kyb`) + **Refunds/Disputes console** (`/admin/refunds`) | migration `…000200` (admin refund RPC); were backend-only RPCs |
| Phase 2 | **Seller KYB submission form** (from the Seller Earnings gate) | completes the click-driven payout path |
| Phase 5 | **Admin KYC-level override + level list** in User Management (fixes a 400) | migration `…000300`; KYC ≠ KYB clarified |
| DPA | **`account-deletion` edge function deployed** | erasure worker live |

> All 2026-07-01 work is committed on `feature-user-onboarding-ux` and pushed. Migrations
> `20260701000000–000300` are applied on the live DB.

### 2026-06-26 — UI/UX design pass + a Submit-Project fix (build green, ESLint 0, 114 tests)
A presentation-layer polish sweep across the most-used screens, kept brand-safe (green/white
Carbonify identity) and **logic-free** except for one genuine bug fix. Every change is CSS/markup
only and revertible per-file with `git checkout`.
| Area | What | Notes |
|---|---|---|
| Header / nav | Profile dropdown + mobile menu rebuilt into **role-aware grouped sections** (Workspace / Account / Shopping / Records / Tools / More) with icons + identity header; top-nav links got pill hover + animated underline | [Header.vue](../src/components/layout/Header.vue); routes unchanged |
| Header | Removed the name/role **text block** from the bar — now just the **bell + avatar**; name/role still shown inside the dropdown | per request |
| Page heroes | Unified the **green hero gradient** across Market, Registry, Finance Console, About to match the Marketplace hero (they were teal/light before) | [MarketDashboardView](../src/views/MarketDashboardView.vue), [RegistryView](../src/views/RegistryView.vue), [FinanceConsoleView](../src/views/FinanceConsoleView.vue), [AboutView](../src/views/AboutView.vue) |
| Profile | Brand-gradient header, **role pill** (colour-tinted per role), phone/website shown, tinted Role & Access card | [ProfileView.vue](../src/views/ProfileView.vue) |
| Admin dashboard | Gradient header, **floating stat cards with tinted icons**, green tool-card hovers (was off-brand blue), accented section headers + pill "Open Full Role Applications" | [AdminDashboard.vue](../src/components/admin/AdminDashboard.vue) |
| Project detail | Pill back-button, richer hero (overlay + zoom), accented card headers, hover lifts, listing rows, gradient "Go to marketplace" button | [ProjectDetailView.vue](../src/views/ProjectDetailView.vue) |
| **Submit Project (bug fix)** | The **Required Technical & Compliance Documents** inputs were `display:none` with no `for`/`id` and no click handler — **they were not clickable at all**. Rebuilt each as a `<label>`-wrapped **card with a plain-language description** of the document (PDD, Baseline, Additionality, Leakage, Safeguards, LGU Endorsement, Land/Lease, ECC, MOA) + an attached/required status. Clicking now opens the file picker natively | [ProjectForm.vue](../src/components/ProjectForm.vue); `handleSingleDocUpload` + refs unchanged. **Runtime-verify** an actual upload |

> ⚠️ The document-input fix is exactly the "code-complete but runtime-untested" class — those
> required-doc fields had never been clickable, so confirm a real PDF attaches on submit.

### 2026-06-26 session — features shipped (build green, ESLint 0)
| Area | What | Commit |
|---|---|---|
| Phase 5 | DPA tooling — self-service data export + account-deletion request + erasure worker | `3d14b5e` |
| Phase 4 | Edit/resubmit-after-revision loop complete (queue re-entry, verifier bell, revision badge) | `d7d0055`, `95be6f3` |
| Phase 3 | Full buyer-facing project-detail page (trust card, developer, map, docs, co-benefits) | `d993521` |
| Phase 3 | `local\|supplier` provenance badge + marketplace filter | `977ce39` |
| Phase 3 | ESG / offset report export (PDF + CSV) on the Credit Portfolio | `73f7c97` |
| Phase 3 | SDG tagging (submit form) → display → marketplace filter, end-to-end | `1ab3785` |
| Phase 5 | Admin finance console (sales/fees/payouts + book reconciliation, admin-gated RPCs) | `9790dc3` |
| Phase 5 | Provisional VAT invoices (12% PH VAT, admin-configurable tax identity) | `742305e` |
| Phase 7 | Public searchable carbon registry (`/registry`, anon-accessible) | `81792ac` |
| Phase 7 | Hot-path DB indexes | `5683731` |
| Nav/UX | Portfolio link in top nav; verifier panel scroll fix; misc | `87a5e84`, `b765b63` |
| DB | Schema-drift fixes + consolidated **catch-up** migration + read-only audit | `a99ce91`, `80416b1`, `2e00a40`, `df62627`, `a378e6f`, `4991a64` |

> Several "missing" roadmap items turned out to be **already built** (verification checklist,
> SLA aging, audit-log search) — verified, not rebuilt. The recurring theme this session was
> the live DB **lagging the migrations**; §0's catch-up + audit close that out.

### 2026-06-26 — codeable-backlog sweep (no dashboard/partner needed, build green, ESLint 0)
A pass to clear the items that could ship as pure code, with **zero new migrations**
(every feature reuses existing columns/tables) — so nothing here is blocked on the
dashboard or an external party:
| Area | What | Notes |
|---|---|---|
| Phase 4 | **Weighted scored rubric** on the validation checklist (Inadequate/Adequate/Strong × per-item weight → overall score + band) | Score stored in the existing `verification_assessments.checklist` JSONB; `checked` kept in sync |
| Phase 4 | **Project boundary map** — draw the location pin + boundary polygon at submit/edit | Writes `projects.geo_coordinates` + `projects.boundary` (cols already exist); detail view already rendered them. Also fixes a latent bug where **geo was never saved on create** |
| Phase 4 | **MRV reporting reminders** — due/overdue banner on the Monitoring page + deduped bell notification | Derived from `projects` + `monitoring_reports` vs admin cadence `mrv_reporting_days` (default 365); no schema change |
| Phase 8 | **Offline-capable service worker** — app-shell precache, network-first nav with offline fallback, stale-while-revalidate assets | Same-origin GET only; never caches Supabase/PayMongo/OSM |
| Phase 8 | **Mobile polish** — wide tables (finance console, seller earnings, emission factors) now scroll + 640px breakpoints | No behavior change |

> All five are **runtime-untested** (🆕) — they're committed and build-green but, like the
> rest of the session, want a real click-through. None require the §0 migrations or the
> dashboard blocker; they can be tested as soon as the app is running.

### 2026-06-26 — Phase 2–4 + backlog code sweep (after the money path was proven)
Advanced the unimplemented phases with pure-code work (build green, ESLint 0, **114 unit
tests**, +40 this sweep). Two new idempotent migrations (§0 #10–11); everything else is
additive and leaves the proven money path untouched.
| Phase | What | Notes |
|---|---|---|
| **2 — Beta hardening** | Payment-path tests: VAT-invoice math, weighted rubric, seller-withdrawal validation | Locks the money/feature logic against regression (the silent-webhook-bug class) |
| **3 — Scale** | Composite hot-path indexes + `getUserPurchaseHistoryPage()` (server-side paginated history with exact count) | Additive; existing marketplace loader untouched |
| **4 — Credibility** | Double-claim **serial guard** (unique `certificates.registry_serial`) + **`/market` public dashboard** (`public_market_stats`) | Mirrors the registry's anon pattern |
| **Backlog** | Buyer **portfolio gain/loss vs market** (real value, replaces the fake `×25` placeholder) | Pure `computePortfolioPnl` + cost basis surfaced from `purchase_price` |

> ⏳ Still open in the backlog (not yet built): seller per-project earnings/issuance history,
> saved-search/price alerts. The `/market` dashboard and paginated history are not yet linked
> in the nav (reachable by URL); wiring is a small follow-up.

### 2026-06-25 cycle — Branding & UX (build green)
- ✅ **Rebrand EcoLink → Carbonify** across ~105 files (app, views, services, config, docs, `index.html`,
  `manifest.json`, edge functions). Internal storage keys + applied DB migrations intentionally preserved.
- ✅ **Logo** — new `public/carbonify-logo.png` wired into header, login, register, mobile menu, favicon, manifest.
- ✅ **Login fix** — surfaced the real "Email not confirmed" error; root cause was unconfirmed accounts +
  `[auth.email] enable_confirmations` (handled in `config.toml` / dashboard).
- ✅ **Project Map fix** — map never rendered (Leaflet init ran before the container existed); also added a
  stacking context so the map can't paint over the sticky header. Uses free OpenStreetMap tiles (no key).
- ✅ **Legal policies** — split the single modal into real **Terms / Privacy / Carbon Credits** docs with the
  pre-production disclaimer, matching `POLICY_AND_USER_AGREEMENT.md`.
- ✅ **Profile menu** — moved About / Saved / Cart into the profile dropdown (About for every role).
- ✅ **LGU Tools** — fixed input box-sizing/overflow + doubled row spacing on the MSW calculator.
- ✅ **Submit Project** — removed the developer's "Price per Credit" field; the **verifier sets the price**
  at review (also fixed a latent bug where editing would blank a verifier-set price).

### Money-path verification progress
- ✅ CLI logged in + linked to project `fmngptolarydbgrtltnd`.
- ✅ Deployed edge functions: **`process-payouts`** (was missing) and **`paymongo-checkout`** (refreshed).
- ✅ Applied the 3 pending migrations in the SQL Editor: `project_comments`, `app_settings`,
  `verification_checklist` (fee-aware purchase RPC confirmed live).
- ✅ PayMongo webhook registered: `…/functions/v1/paymongo-webhook`, event `checkout_session.payment.paid`.
- 🐛 **Found + fixed a critical webhook bug** ([paymongo-webhook/index.ts](../supabase/functions/paymongo-webhook/index.ts)):
  it read the event name from the wrong field (`data.attributes.event`) and compared to the wrong value
  (`checkout.payment.paid`), so **every payment would be silently ignored** — buyer pays, nothing settles.
  Now reads `data.attributes.type` and accepts `checkout_session.payment.paid`; also fixed `sessionId`/`amount`
  extraction. **Code fixed; not yet deployed (see blocker).**

### Verifier workflow — Phase 4 (this cycle, committed)
- ✅ **Developer ↔ verifier comment thread** — was already built; unblocked by the applied `project_comments`
  migration. Added **comment notifications** ([notificationService.js](../src/services/notificationService.js))
  so the other party is alerted via the bell (reviewer→owner, owner→reviewers, internal notes→reviewers only).
- ✅ **Verifier price input** — the verifier now sets the price per credit at validation
  ([ProjectApprovalPanel.vue](../src/components/admin/ProjectApprovalPanel.vue)); persisted to
  `projects.credit_price` (blank falls back to the category default). Completes the submit-project change.

> Commits: `f39cf51` (rebrand + fixes + comment notifications); verifier price input committed after.

### Phase 5 — DPA tooling (data export / account deletion) — this cycle, code-complete 🆕
- ✅ **Self-service data export** — **Profile → Privacy & Data** tab → "Download my data"
  gathers everything we hold for the signed-in user (profile, transactions, holdings,
  certificates, activity, …) into a single JSON file. RLS scopes every read to the user;
  the source list is drift-proof (skips missing tables/columns).
  ([dataPrivacyService.js](../src/services/dataPrivacyService.js),
  [PrivacyDataPanel.vue](../src/components/account/PrivacyDataPanel.vue))
- ✅ **Account-deletion request** — same tab; a typed-`DELETE` confirmation records a
  request in the new `data_subject_requests` table (owner-or-admin RLS), idempotent per
  user, cancellable while pending.
- 🆕 **Erasure worker** — [account-deletion edge function](../supabase/functions/account-deletion/index.ts)
  deletes the auth user (cascades profile-keyed personal data; retains legally-required
  financial rows). **Code-complete; deploy when the dashboard blocker below is cleared.**
- Migration: [20260626000000_dpa_data_subject_requests.sql](../supabase/migrations/20260626000000_dpa_data_subject_requests.sql)
  (apply via SQL Editor). Fulfils the Privacy Policy's §2.5 promise. Build green, ESLint 0.

---

## 2. ✅ Money-path blocker — CLEARED (2026-06-26)

The Supabase CLI `403 "necessary privileges"` was sidestepped via the **Dashboard**: the 3
secrets (`PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PAYOUT_WORKER_SECRET`) were set
and the **bug-fixed `paymongo-webhook` was deployed** from the function editor. A real sandbox
purchase (PayMongo test card `4343 4343 4343 4345`, on the Vercel **preview** deploy of
`feature-user-onboarding-ux`) **settled cleanly** — `reconcile_financials()` = **0 rows**.

**Still needs the same Dashboard flow when you get to them:**
- Deploy the **`account-deletion`** edge function + set `ACCOUNT_DELETION_SECRET` (so DPA
  deletion requests can be processed).
- The money-path **edges** (subscription, payout, refund) — no new deploy, just app/SQL steps
  (runbook Step E).

> Testing setup used: pushed `feature-user-onboarding-ux` to GitHub, linked the repo to the
> `ecolink` Vercel project, and ran `vercel deploy` for a **preview** URL (production `main`
> intentionally untouched). The webhook posts to the public Supabase functions URL, so the
> preview front-end is enough to drive the test.

---

## 3. Roadmap — implemented vs not yet implemented

Legend: ✅ done & verified · 🆕 code-complete, runtime unverified · 🟡 partial · ❌ not started

### ✅ / 🆕 Implemented (as of 2026-06-26)
| Phase / area | Status |
|---|---|
| **0 — Stabilize** | ✅ webhook conflict markers, 4 latent bugs, ESLint 0, live schema fixes |
| **1 — Money Foundation** | ✅ **PROVEN** — real sandbox **purchase** settled (`reconcile_financials()` = 0) **and subscription** verified (`/upgrade` → Pro flipped `profiles.plan`). Provider abstraction, server-authoritative checkout, bug-fixed signed webhook, double-entry ledger, atomic purchase RPC, reconciliation |
| **2 — Seller Payouts** | ✅ **PROVEN (2026-07-01)** — escrow, payout state machine + worker, seller KYB gating, refunds/disputes, earnings dashboard; **payout + refund settled with `reconcile_financials()` = 0**. Now click-driven: seller KYB submission form, admin KYB-review (`/admin/kyb`) + refunds console (`/admin/refunds`) |
| **Branding & UX** | ✅ Carbonify rebrand; login/map/policies/LGU/submit-project fixes; mobile polish on heavy tables |
| **Buyer cart + watchlist** | ✅ sequential cart checkout + saved/watchlist |
| **3 — Buyer Trust** | 🆕 project-detail page, `local\|supplier` badge + filter, ESG/offset export, SDG tagging + filter, **project boundary map (draw + display)**, **buyer portfolio gain/loss vs market** — (real registry/supplier still pending a partner) |
| **4 — Developer ↔ Verifier** | 🆕 comment thread + notifications, verifier sets price at validation, edit/resubmit-after-revision loop, **weighted scored rubric**, SLA aging, **MRV reporting reminders** |
| **5 — Admin & Compliance** | 🆕 DPA tooling (export/delete + erasure worker), admin finance console, provisional VAT invoices, audit-log search, system-config UI |
| **7 — Scale & Security** | 🆕 public searchable registry, **`/market` public dashboard**, hot-path + **composite indexes**, **server-side paginated purchase history**, **double-claim serial guard**, offline service worker, **payment-path test suite (114 tests)** |
| **8 — Mobile / PWA** | 🆕 installable manifest, offline service worker, mobile view polish |

> Money path = ✅ **fully proven** (purchase + subscription + payout + refund, all reconcile to 0, 2026-07-01). The 2026-07-01 session also runtime-verified the codeable-backlog features + admin consoles below.

### ❌ Not yet implemented (what's actually left)
| Item | Phase | Blocked on |
|---|---|---|
| **Real registry/supplier integration** | 3 | 🌐 external registry partner (Verra / Gold Standard / Carbonmark / Patch) |
| **AML / sanctions screening** | 5 | 🌐 a sanctions/PEP data vendor |
| **Error tracking (Sentry) + alerts** | 2 | you — a Sentry DSN; then codeable |
| **Web push notifications** | 8 | you — a deployed edge fn + VAPID keys |
| **Pentest · backups/PITR · connection pooling · observability** | 7 | ops/infra + a provider key |
| **Legal entity · PSP/EMI · BIR/DPO · accredited VVB** | 9 🏛️ | business/legal |
| **Money-path gated cutover** (server-authoritative Buy UI + RLS lockdown) | 1 | codeable now — see NOW_IMPLEMENTATION_PLAN Wave 3 |
| **Code hygiene** (dual-column canonicalization, FK-fallback removal, split large views) | — | codeable now — Wave 2 |
| **LGU self-application flow** (LGU can't self-request the role; admin-provisioned for now) | 5 | codeable — needs role-application service + admin-approval + DB constraint changes. See [TODAY_2026-07-07.md](TODAY_2026-07-07.md) §4 |
| **Full accessibility pass** (`for`/`id` on all MRV/assessment/LGU form fields) | 7 | codeable now — partial done 2026-07-07 |

> ✅ **2026-07-01 — DONE this session (built + runtime-verified):** seller per-project earnings ·
> purchases pagination · structured additionality/permanence · saved-search/price alerts · admin
> KYB-review console · refunds/disputes console · seller KYB submission form · admin KYC-level
> override + level list. Migrations `20260701000000–000300` applied. All the codeable-backlog +
> "built-but-not-clickable" gaps are closed.

---

### 🧭 Proposed expansion features (scoped 2026-07-07) — implemented vs not

Seven product-expansion features were proposed (national biomass registry / MRV / investor
data-room positioning for the PH market). This is their **real status** against the current
codebase — roughly ~60% is already built as extensions of existing modules, not greenfield.

> ⚠️ **The "code-complete" labels below are FEATURE-level, and they hide missing sub-items.**
> For the honest bullet-by-bullet picture — including the buyer history, offtake agreements, farmer
> carbon participation, and MRV farmer/hectare metrics that are **not built** despite their features
> being marked shipped — read **[EXPANSION_FEATURE_AUDIT.md](EXPANSION_FEATURE_AUDIT.md)**. Where the
> two disagree, the audit is right: it was checked against the code.

| # | Feature | Status | What exists today | Gap to build |
|---|---|---|---|---|
| 1 | **Project Registry page** | 🆕 **code-complete (2026-07-08)** — migration #21 pending apply + runtime check | [ProjectDetailView.vue](../src/views/ProjectDetailView.vue) + `projects` table carry **GPS** (`geo_coordinates` + `boundary` GeoJSON, drawn on the map), **methodology** (now captured on the submit form), **feedstock**, **capacity** (+unit), **development status** (`projects.status`), **expected reductions** (`estimated_credits`), **documents** (real [`project-documents` bucket](../supabase/migrations/20260707000000_project_documents_bucket.sql): PDD/feasibility/MRV), co-benefits, additionality/permanence; **project developer** shown via the Developer profile card | ✅ shipped: `feedstock`/`capacity`/`capacity_unit` cols ([mig #21](../supabase/migrations/20260707000200_project_registry_fields.sql)) + form subsection + detail rows. **⚠️ Weaker than claimed (5/8 bullets):** methodology is a **free-text input, not an enum** — Verra/Gold Standard/Puro/ISO are only placeholder hint text, so nothing can filter or group by it; **"development status" is the validation-workflow status**, not a project lifecycle stage (no such column); **MRV reports are not a registry document type**. **Remaining:** methodology enum, lifecycle field, MRV docs, runtime-verify |
| 2 | **Carbon Asset Management** | 🆕 **code-complete (2026-07-08)** — no migration needed; runtime-unverified | Credit **serials**, issued/pending **pool**, **sold** (`credit_transactions`), **retired** (atomic multi-row), **buyer history**, **inventory** (`credit_ownership`), [CreditPortfolioView](../src/views/CreditPortfolioView.vue), [SellerEarningsView](../src/views/SellerEarningsView.vue) | ✅ shipped: developer **asset-ledger view** [`/developer/ledger`](../src/views/CarbonAssetLedgerView.vue) rolling up estimated/issued/pending/sold/retired/inventory (+value) per project via pure [`aggregateAssetLedger`](../src/services/assetLedgerService.js) over `projects`/`project_credits`/`credit_transactions`/`verified_emission_reductions`/`credit_retirements` (MRV tables drift-safe). 6 unit tests. **⚠️ Missing vs spec: BUYER HISTORY** — the sales query never selects `buyer_id`, so a developer sees aggregate sold totals but not *who* bought. That was the stated ERPA/institutional-buyer rationale. **Remaining:** buyer history (no migration needed) + runtime click-through |
| 3 | **Biomass Marketplace** (feedstock RFQ) | 🆕 **code-complete (2026-07-08)** — migration #22 pending apply; runtime-unverified | Marketplace was **credits only**; `supplier_orders` is external-registry fulfillment, not feedstock | ✅ shipped: [mig #22](../supabase/migrations/20260708000000_biomass_marketplace.sql) (`biomass_products` + `biomass_rfqs` + 3 RPCs), [`biomassService`](../src/services/biomassService.js), public browse [`/biomass`](../src/views/BiomassMarketplaceView.vue) + RFQ modal, KYB-gated [`/biomass/sell`](../src/views/BiomassSellView.vue), [`/biomass/rfqs`](../src/views/BiomassRfqsView.vue) buyer+supplier tabs. 11 unit tests, notifications wired. **⚠️ `black_pellets` is not a first-class feedstock type** (only `wood_pellets`); it can only be entered as free-text "Other biomass", so it can't be browsed or filtered — a named RRCC product. One-line fix. **Remaining:** black pellets + runtime click-through |
| 4 | **MRV Dashboard** | 🆕 **roll-up shipped (2026-07-08)** — no migration; runtime-unverified. Satellite/IoT still external (deferred) | [MRV module](../supabase/migrations/20260604010000_create_mrv_module.sql) + [MonitoringReportView](../src/views/MonitoringReportView.vue) + [mrv.js](../src/constants/mrv.js) capture biomass, energy, CO₂ avoided/removed, hectares, methodology factors | ✅ shipped: developer **roll-up dashboard** [`/developer/mrv-dashboard`](../src/views/MrvDashboardView.vue) — verified/proposed/pending tCO₂e, monthly proposed-vs-verified trend, per-metric activity sums, per-project reporting-compliance vs cadence — via pure [`aggregateMrvDashboard`](../src/services/mrvDashboardService.js) over `monitoring_reports`/`verified_emission_reductions`/`monitoring_activity_data` (drift-safe), reusing PortfolioChart/CategoryChart. 6 unit tests. **⚠️ Weakest feature vs spec (0/8 bullets fully).** Missing: **biomass collected** (no such metric key), **farmers participating** + **plantation hectares** (the dashboard never reads `farm_parcels`/`farmer_deliveries` — they exist since mig #25 and are a join away, no migration), and **CO₂ avoided vs removed is never split** (only a combined tCO₂e). Energy generated appears only if a report happens to carry `energy_kwh`. **Deferred:** satellite + IoT feeds (external API + cost) |
| 5 | **Investor Portal** | 🆕 **code-complete (2026-07-08)** — migration #24 pending apply; runtime-unverified | `buyer_investor` role + document/data-room foundation + [FeatureGate](../src/components/ui/FeatureGate.vue) plan gating existed | ✅ shipped: Pro-gated [`/investor`](../src/views/InvestorPortalView.vue) — cross-developer **pipeline** of validated projects, projected value, **funding gap**, and a per-project **financial model (IRR/NPV/payback)** via fresh pure [`investorAnalytics`](../src/services/investorAnalytics.js) (11 tests). New `FEATURES.INVESTOR_PORTAL` (Pro/Business). [mig #24](../supabase/migrations/20260710000000_project_financials.sql) persists `capex`/`opex`/`project_lifetime_years`/`funding_target`/`funding_raised` (the form collected CAPEX/OPEX but dropped them — now wired into a new "Financials" form subsection). **⚠️ Missing vs spec: OFFTAKE AGREEMENTS** — zero functional code repo-wide (no table, field, or UI), so every IRR rests on an *assumed* credit price rather than contracted revenue. The "data room" is a document **count badge + link-out** to the project page, not an in-portal viewer. **Remaining:** offtake/ERPA model, a real data room, developers enter financials, runtime-verify |
| 6 | **Farmer Portal** | 🆕 **code-complete (2026-07-09)** — migration #25 pending apply; runtime-unverified | No `farmer` role existed; `profiles.role` has **no CHECK constraint** — the real gates were `assign_user_role()`'s allow-list and `role_applications.role_requested`'s CHECK | ✅ shipped: `farmer` role end-to-end (constants, `roleService` permissions map, `userStore.isFarmer`, `createFarmerGuard`, `/farmer` landing, applyable at `/apply`, assignable in User Management); [mig #25](../supabase/migrations/20260711000000_farmer_portal.sql) (`farm_parcels` + `farmer_deliveries` + 3 RPCs); [`farmerService`](../src/services/farmerService.js) (23 tests); [`/farmer`](../src/views/FarmerPortalView.vue) parcel register + delivery logging with proof upload; buyer **Deliveries tab** on [`/biomass/rfqs`](../src/views/BiomassRfqsView.vue) (confirm → mark paid). Farmers bypass the KYB listing gate. **⚠️ Missing vs spec (3/6 bullets): CARBON PARTICIPATION** (a farmer sees sacks and pesos — `farmer_deliveries` has no link to credit issuance, and the word tCO₂e appears nowhere in the portal) and **TRAINING** (no module at all). **Plantation "monitoring" is a static register** — expected yield is stored but never reconciled against actual delivered quantity, despite deliveries carrying `parcel_id`. **Remaining:** carbon participation, actual-vs-expected yield, training, runtime click-through |
| 7 | **AI Project Assistant** | 🟡 **interface only (2026-07-09)** — no backend, no LLM dep | No LLM integration (no `anthropic`/`openai` dep) | ✅ shipped: discoverable [`/assistant`](../src/views/AiAssistantView.vue) preview — chat surface, role-aware example questions, planned-capability panel. **Composer is disabled and nothing is sent anywhere; no answers are generated.** Linked in the profile dropdown under Insights, ungated. **Remaining:** the actual Supabase edge fn → Claude API with tool access to project/credit/MRV tables (external API cost); decide then whether to Pro-gate it via `FEATURES.AI_ASSISTANT` |

> **All seven features have shipped code, but none is 100% against its spec bullets.** The next pass
> is *depth, not breadth* — see [EXPANSION_FEATURE_AUDIT.md](EXPANSION_FEATURE_AUDIT.md) for the
> ranked close-out list. The top three need **no migration**:
> 1. **MRV: farmers participating + plantation hectares** — join `farm_parcels`/`farmer_deliveries`
>    into `aggregateMrvDashboard`. Turns the "biggest differentiator" into one.
> 2. **Asset ledger: buyer history** — select `buyer_id`, join `profiles`. Serves the ERPA use case.
> 3. **Black pellets** in the feedstock dropdown — one line.
>
> Then: farmer carbon participation → methodology enum + lifecycle status → **offtake/ERPA model**
> (largest new build; converts projected into contracted revenue) → CO₂ avoided/removed split →
> **#7 AI backend** (Claude API edge fn, external cost) → satellite/IoT (deferred, external) →
> training content.

---

### Schema drift — catch-up tooling (this cycle)
The live DB predates the tracked migrations and has been applied piecemeal, which
repeatedly surfaced as "missing column" 400s and broken PostgREST joins. Two new files:
- [schema_catchup_audit.sql](../supabase/diagnostics/schema_catchup_audit.sql) — **read-only**;
  run it in the SQL Editor to list every expected table/column/FK/function that is **missing**
  on this DB. Empty result = fully current.
- [20260626000700_schema_catchup.sql](../supabase/migrations/20260626000700_schema_catchup.sql) —
  one **idempotent** migration that ensures all drift-prone columns + the credit_transactions→
  profiles FKs + the widened status constraint. Apply it to fix the column/FK/join class of
  drift in one shot. If the audit reports a missing **table**, apply that table's own migration.

## 4. Next steps

Feature work and the money cutover are **done**. The priority now is **security close-out
before real users**, then launch. The authoritative, prioritized plan is
**[GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md)** (implemented vs not, by priority, with a printable
go/no-go gate); the security detail is **[dev/DEPLOYMENT_READINESS.md](dev/DEPLOYMENT_READINESS.md)**.

### A. 🔴 P0 — security close-out (do before ANY real user pays)
1. Apply migration `20260703000300` (lock `profiles.role`/`kyc_level`) → verify a normal user
   can't self-promote to admin, and admin/verifier/KYC flows still work.
2. Apply `20260703000400` (retirement identity = `auth.uid()`) → retest flow E, reconcile = 0.
3. Redeploy `send-approval-email` with `verify_jwt=true` (close the open email relay).
4. Redeploy `paymongo-checkout` to require the verified JWT (stop trusting client `user_id`) →
   re-run the 6 money flows, reconcile = 0 each.
5. Enable email confirmation + custom SMTP; confirm `ALLOW_UNSIGNED_WEBHOOKS` unset + secrets set.
6. Remove the legacy/demo code paths (raw checkout branch, legacy webhook branches, `demo`
   purchase, dead wallet mutators) → re-run flows.
7. **Book an independent penetration test** before switching to live PayMongo keys.

### B. Capture the work — ✅ done
- **PR #2 is MERGED** (2026-07-07) — `feature-user-onboarding-ux` → `main` (merge `d3ee30d`),
  ~121 commits. `main` now carries the full app. A follow-up **PR #3** (merge `fb14e42`) removed
  23 dead files. `gh` is authenticated. The branch and `main` are in sync (0 unmerged commits).
  Note: merging code does **not** apply the pending DB migrations (§0 #17–20) — do those separately.

### C. Remaining work — external party or ops/legal (parallel track)
- **Real registry/supplier fulfillment** — needs an external registry partner (Carbonmark/Cloverly/Patch).
- **AML screening** — needs a sanctions/PEP data vendor.
- **Backups/PITR · connection pooling · observability (Sentry) · CSP · rate limiting** — ops/infra + keys.
- **Legal entity · licensed PSP/EMI · BIR registration · DPO/AMLA · accredited verifier (VVB)** — business/legal.
- **Favicon set** — generate square favicons from the logo (`scripts/create-favicons.js`).

---

## 5. Notes for whoever picks this up
- All session work is **committed** on `feature-user-onboarding-ux` (build green, ESLint 0).
- **Apply the §0 migrations** before testing; the schema had drifted behind all session.
  Run [schema_catchup_audit.sql](../supabase/diagnostics/schema_catchup_audit.sql) anytime to
  check (empty = current). As of the last audit only `supplier_orders` + 2 certificate columns
  were missing — both covered by the §0 list.
- VAT invoices are **provisional** (not BIR-accredited until the entity is registered).
- The public registry, finance console, and DPA RPCs are **SECURITY DEFINER** and self-gate
  (anon for the registry; `is_admin()` for finance; `auth.uid()` for DPA) — the underlying
  tables stay RLS-protected.
- PayMongo webhooks can't reach `localhost` — run the money-path test against the deployed app or a tunnel.
- Don't use `supabase db push` here (known schema drift) — apply migrations via the SQL Editor.
