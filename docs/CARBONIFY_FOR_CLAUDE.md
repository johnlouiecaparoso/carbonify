# Carbonify — portable context brief

**Paste this whole file into a Claude conversation that does not have the repository.**
It is written to be read by an assistant, not by a person, though a person can read it fine.

> **Last measured: 2026-08-11.** Every ✅ below was verified against the live system on that date
> with a probe that had a control. Anything older is marked. **This file ages.** If you are reading
> it more than a couple of weeks later, treat the *state* sections as history and the *architecture*
> and *house rules* sections as still true.

---

## 0. How to use this brief

You are being handed context about a real production system you cannot see. Be explicit about that
boundary — it is the single most useful thing you can do here, because this project's entire failure
history is people (and assistants) stating things about production they had not checked.

**You can help with, without the repo:** explaining the domain, reviewing SQL or code the user
pastes, designing a migration or a policy, writing user-facing copy, planning a feature, reasoning
about carbon-accounting logic, drafting a test strategy, talking through a decision.

**You cannot, from a chat:** confirm what is deployed, what is applied to the database, whether a
test passes, or what a file currently contains. If an answer depends on any of those, **say so and
ask the user to check**, or ask them to paste the file. Guessing here has cost this project real
production incidents.

**The one habit worth adopting:** when you state something about the live system, say how you know.
This project distinguishes three grades and so should you — **measured** (a probe with a control),
**attested** (the owner says so), **assumed** (neither). They are not interchangeable.

---

## 1. What Carbonify is

A **commercial Philippine carbon-credit registry and marketplace**. Project developers register
carbon-removal projects; independent verifiers review them; credits are issued on verification;
corporate and individual buyers purchase and **retire** them (retirement = permanently consuming a
credit to claim the offset, producing a certificate); LGUs (Local Government Units — Philippine city
and municipal governments) get waste-diversion and jurisdiction tooling; farmers supply **biomass
feedstock** (rice husk, coconut shell, agricultural residue) into biochar and similar projects.

It is not an academic project. It is built for institutional users and has a revenue model.

**Two limits are disclosed inside the product and must never be overstated:**

1. **Credits are not registry-backed.** Retirement yields a *Carbonify* certificate, not a Verra /
   Gold Standard / CAR / ACR receipt. Getting there is accreditation and governance, not code.
2. **Payments run on PayMongo test keys.** No real money has moved. The payouts function is a
   **mock** — a payout marked `settled` moved nothing.

### Revenue streams

| Stream | State |
|---|---|
| Transaction fee on marketplace trades | Built and live |
| Subscription plans (buyer analytics tiers) | Built and live |
| **Project onboarding + verification fees** | Built, migration applied — **but both default to ₱0, so nothing is charged until an admin sets a price** |
| **White-label registry API** (keyed, metered, brandable) | Built, migration applied, function deployed |
| Wallet top-ups / float | Built and live |

*Built*, *applied* and *earning* are three separate facts on this project, and they get confused.

---

## 2. The seven roles

Defined in `src/constants/roles.js`. RLS policies, router guards and navigation all key off these.

| Role | Constant | What they do |
|---|---|---|
| Buyer / Investor | `buyer_investor` | Browse marketplace, buy, retire, ESG reporting, certificates |
| Project Developer | `project_developer` | Register projects, submit MRV reports, sell credits, get paid out |
| Verifier | `verifier` | Review projects and monitoring reports, approve issuance, comment threads |
| Admin | `admin` | Finance console, KYC/KYB review, refunds, disputes, system config, audit |
| LGU User | `lgu_user` | Jurisdiction dashboards, waste-diversion accounting, local project visibility |
| Farmer | `farmer` | Supply feedstock, confirm deliveries, dispute payment claims, export records |
| General User | `general_user` | Default on signup, before a role application is approved |

**A farmer is a seller, not a buyer** — decided deliberately. Farmers and project developers are both
in `FINANCE_RESTRICTED_ROLES`; they supply, they do not trade credits.

---

## 3. The credit lifecycle

This is the domain core. Everything else serves it.

```
  developer submits project
        ↓
  verifier VALIDATES                    ← onboarding fee invoice raised here (not at submission:
        ↓                                 the platform bills only for a decision it has delivered)
  developer submits MRV monitoring report
        ↓
  verifier approves the VER             ← credits are MINTED here, and only here
        ↓
  developer LISTS credits on the marketplace, sets a price
        ↓
  buyer purchases (card / GCash / Maya / wallet balance)
        ↓
  seller proceeds go to ESCROW (card) or credit directly (e-wallet)
        ↓
  buyer RETIRES credits → certificate with serial, QR and signature
```

**Mint-on-VER is the single issuance path.** Both a validation trigger and a VER trigger were once
live simultaneously, meaning validate-then-approve would have issued the same tonne twice. That was
found, audited (nothing had been double-issued), and closed.

**Feedstock is deliberately outside the ledger.** A farmer delivery is a *record*, not a payment.
Carbonify does not move the farmer's money — the buyer pays them directly. The record is
**two-sided**: the buyer asserts payment, and until the farmer confirms it, the UI says *"the buyer
says they paid you"*, never *"Paid"*. A farmer can dispute, which escalates to `/admin/feedstock`.
If a feedstock action ever moves the books, that is a bug.

---

## 4. Architecture

**Frontend:** Vue 3 (Composition API, `<script setup>`), Vite 7, Pinia, Vue Router 4, plain CSS with
design tokens. Chart.js, Leaflet (project boundary maps), jsPDF + QRCode (certificates), Sentry.
PWA with a service worker and an offline shell. **Plain JavaScript, not TypeScript** — except the
edge functions, which are TS on Deno. Responsive to 320px.

Roughly 59 views, 78 services, ~142 migrations.

**Backend: Supabase.** Postgres with Row Level Security everywhere, `SECURITY DEFINER` RPCs for
anything crossing a user boundary, and Deno edge functions for anything touching money or secrets.

**Payments:** PayMongo (Philippine gateway — cards, GCash, Maya). **Test mode.**

**Hosting:** Vercel, deployed by the GitHub integration from `origin/main`.

### The eight edge functions

| Function | Job |
|---|---|
| `paymongo-checkout` | Creates payment sessions. Identity from the verified JWT, never the request body |
| `paymongo-webhook` | Settles payments. HMAC-signed, 300s replay window, atomic idempotency claims |
| `paymongo-reconcile` | Sweeps payment intents that never got a webhook |
| `paymongo-resettle` | Heals intents that settled wrong |
| `process-payouts` | Worker on `pg_cron` every 15 min. Releases matured escrow, disburses payouts. **`disburse()` is a mock** |
| `account-deletion` | DPA erasure requests |
| `send-approval-email` | Role and project decision mail. Recipients resolved server-side |
| `public-registry` | The white-label partner API. Deployed with `--no-verify-jwt`, which is mandatory |

### Key architectural rules

- **Amounts are recomputed server-side at settlement.** The client never states a price that is
  charged. The displayed price comes from `credit_listings.price_per_credit` — the same row
  settlement reads.
- **Identity comes from the JWT**, never from a request body field.
- **Settlement RPCs are `service_role`-only.** The browser cannot call them.
- **RLS filters, it does not error.** A read the caller may not see returns `200 []` with
  `error: null` — byte-identical to "there is nothing there". This is the single most important fact
  about this codebase; see §7.
- **`SECURITY DEFINER` functions must be audited per *signature*, not per name.** An overload can be
  left granted while the audit matches the name and reports done.
- **A table's RLS is not sufficient while a `SECURITY DEFINER` function will do the write for you.**

---

## 5. Where it runs

| | |
|---|---|
| **Production** | `https://carbonify-gilt.vercel.app` |
| **Not production** | `carbonify13.vercel.app` — 404s since the GitHub repo was renamed |
| **Also not production** | `carbonify.vercel.app` — a *different* app that is also titled "Carbonify" |
| **Supabase project ref** | `fmngptolarydbgrtltnd` |
| **Deploy mechanism** | Vercel Git integration builds `origin/main`. There is no CI deploy job |

Vercel appended a random word (`-gilt`) because the project name it wanted was taken. This cost the
project a day: the documented URL 404'd, nine hostname guesses hardened the wrong conclusion, and the
site had been up and building the whole time. **A negative result from an enumeration is a statement
about the enumeration.**

### The four states — this is the project's most-repeated lesson

Any piece of work is in one of four places, and adjacent pairs get confused constantly:

```
   on disk   →   committed locally   →   on origin   →   live
```

- `git status` clean answers *"is the working tree saved"*, **not** *"does anyone else have this"*.
- The check that answers the third gap is `git fetch` **then** `git log origin/main..HEAD`. Without
  the fetch, a stale remote-tracking ref answers wrong in the reassuring direction.
- And there is a **fifth** state discovered 2026-08-11: *broken inside "live"*. A function can be
  deployed, from correct code, and still refuse everyone — because of a **deploy-time flag** that
  exists in no file. *A deploy is not one fact. It has settings, and the settings are not in git.*

**The repo, the database and the deploy are separate states. Agreement between any two is not
evidence about a third.**

---

## 6. Current state — measured 2026-08-11

### Built and verified

Marketplace / cart / checkout / orders · full credit lifecycle · escrow (method-gated hold) · payout
worker on cron · wallet top-ups on `payment_intents` end to end · KYC gate on **both** purchase paths
· KYB gate on payouts · RBAC + router guards on both auth paths · consent gate with policy versioning
· DPA export and deletion · two-sided farmer payment record with dispute → admin console · project
fee invoices · API tenants and keys · public project registry · developer impact disclosure · farmer
CSV exports · WCAG 2.1 AA automated, public **and** authenticated routes, 0 violations · PWA, offline
shell, responsive to 320px.

**Suite: 1401 unit tests across 122 files · lint 0 · build green.** Playwright 130 tests, last run
2026-08-06.

### Not built, and none of it is a coding task

| Gap | Why | Whose |
|---|---|---|
| Registry backing (Verra / Gold Standard) | Accreditation, not code | third party |
| Real payouts | `disburse()` is a mock; needs a licensed PSP/EMI | third party |
| 8 of 9 transactional emails | Blocked on a verified sender domain | owner |
| Live payment keys | Gated on an independent penetration test | third party |
| BIR-accredited invoices | Invoices are provisional and watermarked | third party |
| AML against a commercial feed | Runs on a local watchlist today | third party |
| Notification + privacy preference enforcement | 17 controls read by nothing; needs a policy decision first | blocked on owner |
| i18n (~375 strings) | Blocked on translation **content** — Filipino renderings of *escrow*, *retirement*, *feedstock* carry legal weight | owner |
| AI Project Assistant | `/assistant` is a UI preview with a disabled composer; needs an API key and per-query cost | owner |
| Satellite / IoT MRV | Needs external data feeds with running costs | third party |
| Organization accounts | Phase 2 rewrites the same RPC as escrow; must follow the beta | owner |
| Load testing · manual screen-reader testing | Before scaling / needs a real person with a real screen reader | later |

### Open right now

| Item | Grade |
|---|---|
| Set the two project fee prices — both are ₱0, so the fee system earns nothing | **open** |
| Run the `VERIFY` blocks at the bottom of the three newest migrations | **open** |
| Redeploy `public-registry` once, to pick up the discovery-URL fix | **open** |
| `paymongo-webhook` redeploy | **attested**, not measured — see §8 |
| **`ESC-01…06`** — the escrow behaviour checks. The last functional gate before inviting a seller | **open** |
| Independent penetration test | **external** — the last P0, weeks of lead time |

---

## 7. House rules — the recurring defect patterns

These were each found the hard way, more than once. They are the most useful thing in this brief: if
the user describes a bug, check these first.

### 7.1 A failed read that returns `[]` renders as a fact about the user

The signature defect of this codebase, found in **dozens** of services. A read fails, the catch
returns `[]`, and the UI says *"you have retired nothing"* / *"no credits available"* / *"no subject
awaits a compliance decision"* — to a user who has, and does.

Worst instances: a failed retirements query produced a downloaded **ESG report stating zero
offsets**; a failed fraud check returned `[]`, which is what *suppresses* the duplicate-evidence
alert, so a failed check read as a clean one on the screen where credits are approved; a failed
settings read rendered as **platform fee 0%, KYC gate 0** in editable admin inputs beside an enabled
Save button.

**The rule:** the *caller* decides whether an absence is tolerable, never the service. A service
throws. A caller may opt out explicitly with `.catch(() => [])` and a comment saying why.

**Its companion:** RLS filters rather than erroring, so a service's error branch often *cannot fire*,
and the error handling written above it is dead code that looks like diligence. **When a view handles
a rejection, check that its service can actually produce one.**

### 7.2 The guard exists in the neighbouring branch

Nearly every defect here is a **correct pattern applied to one branch and not its sibling**. The KYC
gate on the card path but not the wallet path. Replay protection in the live webhook but not in the
provider copy. A cart keyed by user but a search history keyed by device. One `triggerDownload` fixed
and seven copies not.

**When you fix something, grep for the pattern and fix every instance.** A pattern with six instances
rarely has exactly six.

### 7.3 A claim is not a measurement

Docs, test names, comments and checklists all age into lies. Specific instances:

- A checklist line *"8 edge functions deployed"* was copied forward through **six documents**; the
  real number was seven. Running the check for the first time during pre-flight would have invited
  someone to deploy an ungated public API to make a box tick.
- A test reported **22 of 22 passing having measured nothing** — `page.goto` reloads, and the dev mock
  session lives only in the store. Caught by adding `expect(measured.length).toBeGreaterThan(0)`.
- An accessibility row said *"0 violations, WCAG 2.1 AA"*. It meant the **seven public routes**; the
  authenticated shell had never been scanned. Sweeping it found the account menu was a `<div>`, so a
  **keyboard-only user could not sign out**, on every page, for every role — which axe cannot detect.
- **A 🔴 is a claim too.** On 2026-08-11 four documents said three migrations were unapplied. They had
  been applied days earlier. A wrong red produces no symptom and nothing contradicts it — and it is
  the *more* dangerous direction, because it invites a **redo**, and re-running a migration has caused
  two silent production reverts here.

### 7.4 A guard whose assertion is weaker than its intent

A grant-hygiene test asked whether *a* revoke existed. Its own failure message had said
`from public, anon` since the day it was written — and seven `SECURITY DEFINER` functions were
`anon`-callable because `revoke … from public` does not remove Supabase's explicit `anon` grant.

**Mutation-check every guard.** Break the thing it protects and confirm it goes red. A green that has
never been red proves nothing. Also: an artifact assertion that greps a whole file is testing the
prose — one such test passed against a source with the lookup deleted, because the *comment*
explaining the field still contained the string.

### 7.5 A test of the callee is not a test of the caller

Found 2026-08-11 and it is the newest one. A function was tested with a correct input and asserted to
echo it — which it did. **The handler built the input, and nothing asserted anything about the value
it passed.** Result: every URL in a public API's discovery document was broken, over `http`, while
the suite stayed green.

Same shape as: a route test asserting `/admin` carries `requiresAdmin`, while nothing asserted the
guard **reads** it — which is how a whole auth branch that checked nothing reached production.

### 7.6 Green build, green lint, green tests, broken product

Three separate defects were invisible to all three:

- an analytics wrapper that **replaced `window.fetch`** and named metrics after full request URLs,
  query strings included — `isEnabled` was `import.meta.env.PROD`, so it existed only in `dist/`;
- a CSP font outage that only appeared once deployed;
- profile column grants, which live only in the database's privilege catalog and are visible to no
  artifact in the repo. Every profile save on production was failing `42501` and nobody had reported
  it.

**Grep the built bundle. Probe the live database. Read the dashboard.**

### 7.7 Replaying a migration silently reverts newer work

`create or replace` overwrites rather than merges. Pasting a superseded migration into the SQL editor
reverted the escrow fix, and later the same day reverted `reconcile_financials()` to a version
missing a check — **which is worse, because a reverted reconciliation returns "no rows — healthy",
byte-identical to a healthy database.** *A monitor that fails silent reports success.* The only
symptom either time was `Success. No rows returned.`

The supersession banner at the top of each file could never have helped: **it is inside the text you
select-all and copy.** The fix is executable — 16 money-path migrations now open with a `do` block
that queries `pg_proc` for a marker unique to the current definition and **raises before any
statement below it runs**, naming the file to re-apply. Proven on live.

**An advisory control cannot close a paste-and-run.**

### 7.8 Probing traps

- **PostgREST resolves an RPC by name *and argument names*.** A guessed arg list returns `PGRST202` —
  the identical code to a genuinely missing function. **Copy the signature out of the migration.**
  This has produced a false negative twice, including once on 2026-08-11.
- **Always run a control in both directions.** A known-live thing must answer, and a known-absent
  thing must not. A green control proves you reached the right database and nothing more.
- **`42501` on an RPC means it exists and you may not call it — that is a PASS**, not a failure.
- **Advisor severity describes the shape of a finding, not its consequence.** Supabase's advisor rated
  *"anyone signed out can delete every project in the registry"* as a WARN, while four of its nine
  ERRORs were empty superseded tables. **Probe before you prioritise.**

### 7.9 Dev mock sessions break RLS features

Localhost test-account logins install a session in the Pinia store that Supabase never sees. RLS reads
then return `[]` with no error. **Suspect this before suspecting the database**, and note that it also
makes data-dense screens render empty in tests.

---

## 8. What is measured, attested, and unknown

Recording provenance is the project's core discipline. As of 2026-08-11:

**Measured** — every migration through `20260807000100` is applied; `paymongo-checkout` is
redeployed; `public-registry` is deployed with Verify JWT off and its public tier serving; the
frontend is live and chunk-verified across 111 files; the anon exposure surface passes 25/25 signed
out; `reconcile_financials()` returns 0 rows.

**Attested, not measured** — `paymongo-webhook`'s redeploy. Every route into it is behind the HMAC
signature check, so old and new builds both answer `401 Invalid signature`, and the Supabase gateway
returns **identical response headers for functions deployed months apart** — no version, no deploy
id, no timestamp. There is nothing readable from outside. The measurement that will settle it is
behavioural and comes later: after a project fee is paid by card, `reconcile_project_fees()` at 0 rows
proves the settlement branch ran. Before any fee is paid, that check passes **vacuously**.

**Unknown** — whether the two fee prices have been set. The anon key can read only four
`app_settings` keys and neither fee is among them.

**Structurally unproven** — two RLS attack probes return `UNPROVEN` rather than `PASS`, and that is
now a measured fact about the database rather than a bad test: no account on live holds credits or has
traded with a third party, so there is nothing to attack yet. They resolve themselves when the pilot
creates the first holding and the first trade.

---

## 9. Working conventions

```bash
npm run dev                                  # Vite dev server
npm run test:run -- --no-file-parallelism    # unit tests — the flag is REQUIRED on Windows
npm run test:e2e                             # Playwright (needs: npx playwright install chromium)
npm run lint                                 # eslint --fix
npm run build                                # must be green before any claim of done
node scripts/analysis/verify-deploy.mjs https://carbonify-gilt.vercel.app
node scripts/analysis/verify-anon-exposure.mjs
```

- **`--no-file-parallelism` is not optional on Windows.** The parallel happy-dom worker init flakes
  and reports "no tests", which reads like a broken suite and is an environment issue.
- **Without the Chromium binary all 130 Playwright tests "fail" in ~6ms** — that is a missing
  download, not a broken suite.
- **Deno is not installed on the dev machine**, so `deno check` on the edge functions cannot be run
  there. esbuild parse-checks them, which catches syntax and nothing else.
- **Edit by exact string match, never by line number.** Line arithmetic has corrupted files here.
- **Never re-run `20260703000300`.** Its own header tells you to; doing so re-grants `UPDATE` on
  `kyb_verified` and `is_active`, letting users self-approve KYB and self-unsuspend. `20260804000200`
  replaces it and is safe to re-run.
- Diagnostics live in `supabase/diagnostics/*.sql`, are read-only, and each ends with a single SUMMARY
  statement on purpose — the Supabase editor shows only the last statement's result when several are
  pasted together, and reading the wrong table has misled a full pre-flight before.

### Documentation map

`docs/HANDOFF.md` is the running log and the consolidated status table (it is very large — grep it,
do not read it whole). `docs/OPEN_WORK_REGISTER.md` routes open work into three lanes: in-repo /
owner / third party. `docs/YOUR_ACTION_ITEMS.md` and `docs/DEPLOY_RUNBOOK_*.md` are the owner's
instructions. `docs/DEFERRED_BACKLOG.md` holds numbered items #1–#51 — the decisions deliberately
**not** taken, with the reasoning.

**Fix defects directly; write architecture and compliance decisions into the backlog rather than
guessing at them.** For several open items the *wrong* choice is actively harmful, which is why they
were pinned with tests and documented instead of built.

---

## 10. Open decisions the owner has to make

None of these should be built before the answer is a sentence rather than a preference.

| # | Decision |
|---|---|
| 21 | The `services/credits\|payments\|payouts` provider layer is imported **only by tests**, so ~40 passing tests overstate money-path coverage. Route the money path through it, or delete it |
| 37 | 17 notification and privacy controls are read by nothing. Needs server-side enforcement and a schema — and the opt-in/opt-out default is a DPA/NPC call |
| 48 | Should an unpaid project fee **gate** anything? Today it raises a receivable and blocks nothing |
| 49 | Fee refunds have no path. When built, it must post a **reversing ledger pair** — `ledger_entries` is append-only |
| 50 | What a white-label partner may **redistribute**. A contract clause, needed before the first key is issued |
| 51 | Usage metering for API billing. Rate limiting and metering look like one feature and are not: the limiter answers *"may this call proceed"*, billing needs *"how many calls last month"* |
| 18 | Organization accounts — five phases; Phase 2 rewrites the same RPC as escrow |
| 22 | **Seller-of-record**: whose TIN goes on a seller invoice. A tax question, not an implementation choice |
| 27 | i18n — blocked on translation content, not code |

---

## 11. The through-line

The engineering track is essentially clear. What gates go-live is **operational, legal and
external**: an independent penetration test, a licensed PSP/EMI for real disbursement, SEC/BIR/NPC
registration, an AML data vendor, and the carbon-market track (registry backing, an accredited VVB,
DENR/CCC).

The sharpest *ethical* item was never on the technical gate, and it is worth understanding if you are
asked about the design: **a farmer delivers a physical good they cannot take back, and Carbonify does
not hold the money.** That is why the payment record is two-sided, why an unconfirmed claim reads
*"the buyer says they paid you"* rather than *"Paid"*, why a farmer can dispute to a staff console
that can reverse a false "Paid", and why the terms say plainly that Carbonify is a records layer
here. The counterparty risk is **reduced by transparency and escalation, not removed** — and any copy
you write for this product must not imply otherwise.
