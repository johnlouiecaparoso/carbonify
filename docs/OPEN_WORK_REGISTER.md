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

---

## 🤖 Lane 1 — In-repo (no external dependency)

### 1a. Defects — a user gets a wrong result today

| # | Issue | Source |
|---|---|---|
| ~~11~~ | ~~Retirements dropped from transaction history~~ — ✅ **fixed 2026-07-28.** It was under-reporting **ESG offset totals**, not just a short list. The *dual-source* half of #11 is still open | [#11](DEFERRED_BACKLOG.md) |
| ~~10~~ | ~~Keyboard users cannot Escape a payment dialog~~ — ✅ **fixed 2026-07-28** via `v-modal-a11y` on all 15 dialogs (not by adopting `AccessibleModal`; see the entry for why) | [#10](DEFERRED_BACKLOG.md) |
| 15 | **Error handling is three systems, one on** — re-checked 2026-07-29: `ErrorBoundary` **is** mounted in `App.vue` and the `main.js` `window.fetch` monkeypatch **is gone** (both were fixed without updating this row). What remains: `errorStore` is still commented out, and services swallow/throw inconsistently | [#15](DEFERRED_BACKLOG.md) |
| ~~26~~ | ~~The farmer "Paid" flag is a one-sided assertion rendered as fact~~ — ✅ **fixed 2026-07-29.** The record is two-sided; the badge reads "buyer says paid" until the farmer answers | [#26](DEFERRED_BACKLOG.md) |
| ~~26~~ | ~~A feedstock dispute is structurally impossible~~ — ✅ **fixed 2026-07-29**, and **without** widening `disputes`: the disagreement is recorded on the delivery and escalates to `/admin/feedstock` | [#26](DEFERRED_BACKLOG.md) |
| 3 | A receipt **cannot show the counterparty's name**. Needs a `SECURITY DEFINER` name-only RPC — **do not loosen `profiles` SELECT RLS** (hardened by `20260703000300`) | [#3](DEFERRED_BACKLOG.md) |
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
| 🆕 | ~~**A failed portfolio read rendered as "you own nothing"**~~ — ✅ **fixed 2026-07-30.** `getUserCreditPortfolio` / `getUserTransactionHistory` swallowed errors and returned `[]`. Worst case was the ESG export: a failed retirements query produced a downloaded report stating **zero offsets**. All three callers already handled rejection — `BuyerDashboardView`'s `holdingsRes.status === 'rejected'` branch was dead code | [#15](DEFERRED_BACKLOG.md) |

### 1b. Cleanups and hardening

| # | Item | Note |
|---|---|---|
| 30 | ~61 dead exports remain (347 lines already removed) | **Exact-string edits only** — line arithmetic corrupted two files last pass |
| ~~9~~ | ~~Consolidate duplicated formatters~~ | ✅ **Done 2026-07-28** — `src/utils/format.js`; three real divergences fixed, incl. money rendering at one decimal place |
| 15 | The nullable-client guard is copy-pasted **~162×** (re-counted 2026-07-29; was ~233 — the 2026-07-26 pass converted many to `throw`, which is the dangerous half) | Fix at the root, then delete the guards |
| 15 | **Fulfillment saga exists twice**, "kept in sync by hand" | The webhook copy is the one that settles money |
| 15 | Runtime schema-probing (5-attempt insert loop, "retry without `updated_at`") | Delete once migrations are authoritative (#7) |
| 12 | Grant hygiene on ~10 `SECURITY DEFINER` RPCs | I write the migration, owner applies |
| 4 | `VALIDATE CONSTRAINT` the two `NOT VALID` FKs | Integrity cleanup only |
| 5 | Prettier **breaks the build** on multi-statement inline Vue handlers | Refactor those to named methods first |
| 27 | **i18n: no library installed, and Filipino was never on the list** of seven offered | Farmer + LGU surfaces first — they're the users for whom English is the obstacle |
| ~~P3~~ | ~~Derive `payment_intents.user_id` from the verified JWT, not the request body~~ | ✅ **Already done** — verified 2026-07-30. All four `paymongo-checkout` actions call `getVerifiedUserId(req)` and `throw` when it is null; the body's `user_id` is never read. Only a stale *comment* said otherwise. This row was the doc drifting, not the code |
| P5 | Migrate wallet top-ups onto `payment_intents` | Consistent reconciliation |

### 1c. Test coverage — the gap is not unit tests

| Item | State | Source |
|---|---|---|
| **Negative RLS suite** | ✅ **RUN 2026-07-30 — 5 PASS, 3 UNPROVEN, 0 FAIL.** Every write attack was blocked: mint credits, reprice another seller's listing, forge a retirement, mint wallet money, self-promote to admin. The 3 UNPROVEN are the **read**-isolation probes — the chosen victim had no wallet, no holdings and no third-party trades, so there was nothing to hide. **Re-run against a victim with data during the pilot** | [TESTING_PLAN §1.2](TESTING_PLAN.md) |
| **Integration tests (positive RPC path)** | ❌ still none automated | [TESTING_PLAN §1.2](TESTING_PLAN.md) |
| Playwright **required in CI on a seeded backend** | 🟡 **46/47 green** (was 38/44 with 6 failures nobody saw — the CI job is `continue-on-error`). Still not required, still not seeded | [TESTING_PLAN](TESTING_PLAN.md) intro box |
| **Backend-configuration checks** | ✅ **new layer 2026-07-29** — `pilot-readiness.spec.js`. Found two beta-blocking auth settings | [TESTING_PLAN §1.9](TESTING_PLAN.md) |
| **Guard *behaviour*, not guard metadata** | ✅ **new layer 2026-07-31** — `routerGuardBypass.test.js` drives the real router with a cold store. `routeAccess.test.js` asserts that `/admin` carries `requiresAdmin`; nothing asserted the guard **reads** it, which is how a whole branch that checked nothing survived. **Generalise this**: an assertion about configuration is not an assertion about enforcement | [TESTING_PLAN §1.2](TESTING_PLAN.md) |
| **Responsive layout, MEASURED** | ✅ **new layer 2026-07-31** — `responsive.spec.js`, 37 tests at 320/390/768/1024/1440. Found the `/home` overflow that reading the CSS had not. `html { overflow-x: clip }` hides overflow rather than scrolling it, so `scrollWidth` would have passed while content was unreachable — it measures element geometry instead. **Public routes only**; authenticated pages are the widest layouts and remain unmeasured | [TESTING_PLAN](TESTING_PLAN.md) |
| **`localStorage` in unit tests is a no-op** | ⚠️ **found 2026-07-31.** `src/test/setup.js` mocks it with `vi.fn()` stubs that store nothing, so `getItem` always returns `undefined` — any test that appears to verify persistence does not. `preferencesEffects.test.js` installs a real in-memory version locally rather than changing the shared mock | [TESTING_PLAN](TESTING_PLAN.md) |
| **Load / performance** | ❌ not done | before scaling, not before soft launch |
| **Accessibility** | 🟡 partial | contrast closed (#19); full pass outstanding |

> ⚠️ **#21 — ~40 tests overstate money-path coverage.** The `services/credits|payments|payouts`
> provider layer is imported **only by tests**. `paymongoWebhookSignature.test.js` tests signature
> verification against `PayMongoProvider`, while the code that actually guards live money is inside
> `supabase/functions/paymongo-webhook`. A green suite is not evidence here.

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
| 24 | Verifier's own decision history | Convenience view (an afternoon) vs attestation record (schema) |
| ~~31~~ | ~~Farmers reach checkout by URL but aren't offered it~~ | ✅ **Decided + built 2026-07-30. A farmer is a SELLER, not a buyer** — they supply feedstock and do not trade credits, same as a project developer. `ROLES.FARMER` added to `FINANCE_RESTRICTED_ROLES`. Zero nav regression: `isBuyerRole()` already excluded farmers and their sidebar never offered those 10 routes — **only the router guard disagreed**, which is the contradiction #31 was actually about |
| ~~32~~ | ~~**Google and phone sign-in are advertised in the UI and disabled on the backend**~~ | ✅ **fixed 2026-07-30 — and the decision no longer blocks anything.** Rather than pick one of the two answers, the forms now ask GoTrue `/auth/v1/settings` which providers are enabled and render accordingly (`useAuthProviders`). Enable Google in the dashboard and the button appears with **no redeploy**; leave it off and nobody is offered a dead path. Fails closed |
| 21 | Provider layer imported only by tests | Route through the seam, or delete 11 files + port the signature test |
| 25 | Reviews aren't assigned; concurrent reviewers invisible | Claimed vs merely advertised |
| 23 | Developer forward/projection view | An IRR in front of a project owner invites it into a funding conversation |
| 20 | **Cart charges once per listing, not once per cart** | Multi-seller escrow split — take it **with #14, not after** |
| 18 | Organization accounts, 5 phases | Phase 1 safe now; **Phase 2 must follow the beta** — it rewrites the same RPC as escrow |

---

## 👤 Lane 2 — Owner only

### 2a. The pilot pre-flight — the active next step

Full procedure in [SOFT_LAUNCH_RUNBOOK.md §1](SOFT_LAUNCH_RUNBOOK.md).

0. ✅ ~~**Enable signups, and settle the sender domain first.**~~ — **done 2026-07-31.**
   `disable_signup=false`, `mailer_autoconfirm=true` (measured). Registration works and signs the user
   straight in with no email involved — the route taken instead of buying the domain first, and it
   avoids the worst combination of the three. ⚠️ Anyone can now register with an address they do not
   control; re-enable confirmation before any public launch.
   [YOUR_ACTION_ITEMS](YOUR_ACTION_ITEMS.md) Step 2.
1. Run [`pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql) → read the `verdict` column
   · then [`rls_negative_suite.sql`](../supabase/diagnostics/rls_negative_suite.sql) → every row must
   read PASS (**`UNPROVEN` is not a pass** — it means nothing existed to attack)
2. Dashboard checks **1c–1g by hand**: **8** edge functions deployed · PayMongo in **test** mode, webhook **enabled** · `ALLOW_UNSIGNED_WEBHOOKS` unset · Sentry receiving · frontend deployed — all of it is `OWN-01…10` in [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) Part 1 if you want it as tick-boxes
3. ~~Apply escrow `20260725000200`~~ · ~~feedstock `20260729000100`~~ · ~~`20260718001100`~~ — ✅ **all applied 2026-07-29**, reconcile = 0 after each
4. 🔴 **Deploy + set `PAYOUT_WORKER_SECRET` + schedule `process-payouts` (~15 min)** — escrow is LIVE and `release_matured_escrow()` is the only releaser. **Not a one-click schedule:** the worker 401s without the `x-worker-secret` header, so a naive schedule fails silently. See [`schedule_payout_worker.sql`](../supabase/cutover/schedule_payout_worker.sql). **Not confirmed done.**
4b. 🔴 🆕 **Redeploy three edge functions (2026-07-30 fixes) — they are inert until you do.**
   Same shape as the migration lesson: built ≠ live.
   ```
   supabase functions deploy paymongo-webhook
   supabase functions deploy paymongo-checkout
   supabase functions deploy account-deletion
   ```
   `paymongo-webhook` carries the **double-subscription** fix and `paymongo-checkout` the
   **unauthenticated `verify`** fix. Until deployed, both defects are live. Deploy
   `paymongo-checkout` **and** the frontend together — the callback page now sends its auth token
   to that action.
5. Run the 4 escrow behaviour checks ([ESCROW_DECISION.md §6](ESCROW_DECISION.md)) — **still unrun**; escrow is applied but not behaviourally verified
6. ~~Confirm the 11 role-audit migrations (§0.4)~~ — ✅ **all eleven verified `true` 2026-07-29**
7. ~~Confirm the **`20260718000000`–`000700`** batch~~ — ✅ 4-arg `retire_credits_atomic` confirmed; the `available_credits` half is covered by the pre-flight §7 summary
9. Decide the **beta database** — reuse live (reconcile is clean) but purge or label leftover test data first
10. **Run the closed beta** — 8–15 invited users, every role, `reconcile_financials()` = 0 daily

### 2b. Decisions I cannot make for you

Org accounts go/no-go · public API exposure + key-gating · fee amounts · Business-tier value · blockchain / IoT · **is a farmer a buyer** · seller-of-record (then a tax advisor confirms) · DR/backup policy · every 1e row above.

### 2c. Repo and infrastructure

Decide on merging **PR #14** — **151 commits** ahead of `origin/main`, pushed and in sync as of
2026-07-31 (the PR page's commit list is API-capped at 100 and understates it) · buy + verify the
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
