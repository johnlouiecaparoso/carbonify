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
> **Scope:** open items only. Closed work (#13c, #14 decided, #17, #19, #26 decided) is not repeated —
> see the backlog.

---

## 🤖 Lane 1 — In-repo (no external dependency)

### 1a. Defects — a user gets a wrong result today

| # | Issue | Source |
|---|---|---|
| 11 | A heavy trader's **retirements disappear** from combined transaction history — two tables back the feature and the merged list is sliced to `limit` | [#11](DEFERRED_BACKLOG.md) |
| 10 | **Keyboard users cannot Escape a payment dialog** — 26 raw `.modal-overlay` divs bypass `AccessibleModal.vue` | [#10](DEFERRED_BACKLOG.md) |
| 15 | **Error handling is three systems with none on** — `ErrorBoundary` commented out; `main.js` monkeypatches `window.fetch` globally and can eat unrelated errors | [#15](DEFERRED_BACKLOG.md) |
| 26 | The farmer **"Paid" flag is a one-sided assertion rendered as fact** — the farmer can neither acknowledge nor contest it. Load-bearing since the 2026-07-28 decision | [#26](DEFERRED_BACKLOG.md) |
| 26 | A **feedstock dispute is structurally impossible** — `disputes.transaction_id` is `not null references credit_transactions(id)`; a delivery has no such row. Schema change | [#26](DEFERRED_BACKLOG.md) |
| 3 | A receipt **cannot show the counterparty's name**. Needs a `SECURITY DEFINER` name-only RPC — **do not loosen `profiles` SELECT RLS** (hardened by `20260703000300`) | [#3](DEFERRED_BACKLOG.md) |

### 1b. Cleanups and hardening

| # | Item | Note |
|---|---|---|
| 30 | ~61 dead exports remain (347 lines already removed) | **Exact-string edits only** — line arithmetic corrupted two files last pass |
| 9 | Consolidate duplicated formatters — `peso()` ×11, `round2()` ×9, `shortDate()` ×8 | Two competing currency conventions |
| 15 | The `const s = getSupabase(); if (!s) return` guard is copy-pasted **~233× across 49 files** | Fix at the root, then delete the guards |
| 15 | **Fulfillment saga exists twice**, "kept in sync by hand" | The webhook copy is the one that settles money |
| 15 | Runtime schema-probing (5-attempt insert loop, "retry without `updated_at`") | Delete once migrations are authoritative (#7) |
| 12 | Grant hygiene on ~10 `SECURITY DEFINER` RPCs | I write the migration, owner applies |
| 4 | `VALIDATE CONSTRAINT` the two `NOT VALID` FKs | Integrity cleanup only |
| 5 | Prettier **breaks the build** on multi-statement inline Vue handlers | Refactor those to named methods first |
| 27 | **i18n: no library installed, and Filipino was never on the list** of seven offered | Farmer + LGU surfaces first — they're the users for whom English is the obstacle |
| P3 | Derive `payment_intents.user_id` from the verified JWT, not the request body | |
| P5 | Migrate wallet top-ups onto `payment_intents` | Consistent reconciliation |

### 1c. Test coverage — the gap is not unit tests

| Item | State | Source |
|---|---|---|
| **Integration tests (RPC/RLS on a real DB)** | ❌ none automated — RLS/grants checked by hand | [TESTING_PLAN §1](TESTING_PLAN.md) |
| Playwright **required in CI on a seeded backend** | 🟡 present, not required, not seeded | needs a backend from the owner |
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
| **Farmer** | Dispute path (see 1a) · indicative feedstock pricing from `biomass_rfqs` · delivery-due reminders · offline field capture |
| **Cross-cutting** | ESG reporting is **credit-owner side only** · the public `/registry` is a certificate lookup, **not a national registry** |

### 1e. Blocked only on an owner decision — I build the moment it's made

| # | Item | The decision |
|---|---|---|
| 29 | Read-only admin feedstock view | ✅ **Already scoped** by the #26 decision — actionable now |
| 26 | ToS + in-app modal stating the records-layer position | They move in **lockstep**; one is `src/App.vue` |
| 28 | Notify an LGU when a project appears in its jurisdiction | Must be jurisdiction-scoped and **fail closed** |
| 24 | Verifier's own decision history | Convenience view (an afternoon) vs attestation record (schema) |
| 31 | Farmers reach checkout by URL but aren't offered it | Is a farmer a buyer? |
| 21 | Provider layer imported only by tests | Route through the seam, or delete 11 files + port the signature test |
| 25 | Reviews aren't assigned; concurrent reviewers invisible | Claimed vs merely advertised |
| 23 | Developer forward/projection view | An IRR in front of a project owner invites it into a funding conversation |
| 20 | **Cart charges once per listing, not once per cart** | Multi-seller escrow split — take it **with #14, not after** |
| 18 | Organization accounts, 5 phases | Phase 1 safe now; **Phase 2 must follow the beta** — it rewrites the same RPC as escrow |

---

## 👤 Lane 2 — Owner only

### 2a. The pilot pre-flight — the active next step

Full procedure in [SOFT_LAUNCH_RUNBOOK.md §1](SOFT_LAUNCH_RUNBOOK.md).

1. Run [`pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql) → read the `verdict` column
2. Dashboard checks **1c–1g by hand**: 7 edge functions deployed · PayMongo in **test** mode, webhook **enabled** · `ALLOW_UNSIGNED_WEBHOOKS` unset · Sentry receiving · frontend deployed
3. **Apply escrow `20260725000200` before inviting anyone** — the ToS already promises a hold window live does not provide
4. Redeploy + **schedule `process-payouts`** (~15 min cron) so `release_matured_escrow()` fires
5. Run the 4 escrow reconcile checks ([ESCROW_DECISION.md §6](ESCROW_DECISION.md)) — each `reconcile_financials()` = 0
6. Apply pending **`20260718001100`** (clears a console 400/406 on receipts)
7. Confirm the **`20260718000000`–`000700`** batch status — one read-only query settles it
8. Decide the **beta database** — reuse live (reconcile is clean) but purge or label leftover test data first
9. **Run the closed beta** — 8–15 invited users, every role, `reconcile_financials()` = 0 daily

### 2b. Decisions I cannot make for you

Org accounts go/no-go · public API exposure + key-gating · fee amounts · Business-tier value · blockchain / IoT · **is a farmer a buyer** · seller-of-record (then a tax advisor confirms) · DR/backup policy · every 1e row above.

### 2c. Repo and infrastructure

Push the 2 unpushed commits · decide on merging **PR #14** (124 commits ahead of `origin/main`) · buy + verify the **email-confirmation domain** · adopt CLI migration tracking (#7) so live stops drifting from `supabase/migrations/` · hold all keys and secrets.

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

The sharpest *ethical* item is not on the gate at all: **#26 + #29**. A farmer delivers a physical good
they cannot take back, the buyer alone asserts payment, no dispute can be represented in the schema,
and no admin console can see the trade. The 2026-07-28 decision settled the positioning; the two
follow-ups it made load-bearing are both still open, and both are in Lane 1.
