# Carbonify — Test Script for Every Role

> ## 🔗 The site to test is **https://carbonify-gilt.vercel.app**
>
> Confirmed 2026-08-05. **Two nearby addresses are wrong and one of them is convincing:**
> `carbonify13.vercel.app` is dead (404), and `carbonify.vercel.app` loads a completely different
> application that is *also* titled "Carbonify". If a tester reports that nothing works and nothing
> looks familiar, check which URL they opened before anything else.

**Simple, step-by-step tests for the closed beta.** Each test has a **name/ID**, a goal, the steps, and
what "pass" looks like. Tick the box when it passes. If a step fails, write it on the
**[TEST_REPORT_FORM.md](TEST_REPORT_FORM.md)** — that form is what comes back to the build side, and it
is designed so that a non-technical answer still tells us which layer broke.

> **Updated 2026-07-30.** Added the tests that had no coverage here at all: the **escrow hold window**
> (ESC), the **two-sided farmer payment record** (FARM-04…07), the **admin feedstock console** (FEED),
> **privacy / data rights** (PRIV), **keyboard use** (KEY), and **public, no-login** pages (PUB).
> `FARM-04` was also **stale** — it described the old one-sided "payment status updates" behaviour that
> was replaced on 2026-07-29.

---

## 🟢 Before you start — read this once

- **This is test mode. No real money moves.** Nothing you do here can charge a real card or send real
  money to anyone.
- **When a step asks for card payment, use the test card:**
  `4343 4343 4343 4345` · any future expiry date · any 3-digit CVC.
- **You need one account per role.** The Admin sets Verifier and LGU. Farmer and Developer are applied
  for in-app and then approved by the Admin.
- **After every payment test, the Admin runs `ADMIN-05`.** The books must balance. This is the single
  most important check on this page.
- **Work in the order the sections appear.** Credits have to exist before anyone can buy them, so the
  Verifier tests come before the Buyer ones.

### 🔑 The golden rule for testers

> **If a screen tells you that you have nothing — no credits, no sales, no deliveries, ₱0.00, "nothing
> to show yet" — and you believe that is wrong, that is a bug. Report it.**

Not a small one. The most serious defects found on this project so far have all had this exact shape: a
screen quietly failing to load your data and then telling you, in a friendly sentence, that you don't
have any. It looks like a fact about you. It is not. **You are the only person who can catch this,
because you are the only one who knows what you actually own.** Write down what you expected to see.

### ⚠️ One thing that is correct but looks wrong

**Validating a project mints no credits and puts nothing on the marketplace.** Credits appear only when
a verifier approves a *monitoring report* (VER-03). This changed on 2026-07-26, so a project validated
before that date behaves differently from one validated today. If you see an older project already
listed, that is expected. Run **VER-03** before the buyer tests if you need fresh credits to buy.

---

# PART 1 — Owner only (before anyone is invited)

These need the Supabase dashboard or the SQL editor. **Nobody else can run them, and no tester test is
meaningful until they pass.** Each is a file in the repo — open it, copy all, paste into the Supabase
SQL Editor, run it, and **read the LAST table it prints**.

| ID | What | How | Pass when |
|---|---|---|---|
| ☐ OWN-01 | Everything is configured | Run [`pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql) | The §7 SUMMARY table: **every row PASS** |
| ☐ OWN-02 | Nobody can steal anything | Run [`rls_negative_suite.sql`](../supabase/diagnostics/rls_negative_suite.sql) | 0 FAIL. **`UNPROVEN` is not a pass** — it means there was nothing there to steal, so re-run it mid-pilot once a real user has data |
| ☐ OWN-03 | The books balance | `select * from reconcile_financials();` | **0 rows.** Run after every single money test |
| ☐ OWN-04 | 8 edge functions deployed | Dashboard → Edge Functions | `account-deletion` · `paymongo-checkout` · `paymongo-reconcile` · `paymongo-resettle` · `paymongo-webhook` · `process-payouts` · `public-registry` · `send-approval-email` |
| ☐ OWN-05 | PayMongo is in **test** mode | Dashboard → the deployed secrets | Keys start `sk_test_…` |
| ☐ OWN-06 | The PayMongo webhook is **enabled** | PayMongo dashboard | Shows enabled, points at the Supabase functions URL, event `checkout_session.payment.paid`. *It auto-disables after repeated failures — confirm, don't assume* |
| ☐ OWN-07 | The payout worker is alive | `select * from net._http_response order by id desc limit 5;` | Recent rows show `status_code 200` |
| ☐ OWN-08 | Signups actually work | `npx playwright test src/test/e2e/pilot-readiness.spec.js` | *"the backend accepts new signups"* is **green**. ✅ Went green 2026-07-31 — re-run it anyway, a setting can be changed back |
| ☐ OWN-09 | The frontend is the current build | Load the site | ✅ **Verified 2026-08-05 — the site is `https://carbonify-gilt.vercel.app`.** ⚠️ **Not `carbonify13.vercel.app`** (404s) and **not `carbonify.vercel.app`** (a different React app that is nonetheless titled "Carbonify" — do not let a tester land there). Re-confirm after any deploy with `node scripts/analysis/verify-deploy.mjs https://carbonify-gilt.vercel.app`; a `200` and a matching page title are not evidence |
| ☐ OWN-10 | Errors are being recorded | Trigger one handled error | It lands in Sentry |

> **OWN-08 used to be the gate** — while it was red, no invited person could create an account. It
> went green on 2026-07-31. **The gate is now Part 2 (`ESC-01…06`)**, which has never been run.

---

# PART 2 — 🔴 Money-safety tests (the biggest untested area)

**This section has never been run.** Escrow is switched on and the Terms already promise sellers a hold
window, but nobody has checked what it does to a real purchase. **Do these before inviting a pilot
seller** — a seller whose money is stuck permanently is the worst thing this pilot could produce.

> ## 🔴 PREREQUISITE — apply `20260804000300` first, or ESC-02 cannot pass
>
> Found 2026-08-04 by reading the settlement RPC. The escrow method-gate branches on
> `payment_intents.provider` — but that column is the **gateway**, not the method, and is always the
> literal `'paymongo'`. The GCash/Maya "no hold" branch has therefore **never executed**: every
> online sale took the 7-day card hold, and `credit_transactions.payment_method` recorded
> `'paymongo'` for all of them.
>
> **ESC-02 would have failed, and it would have looked like an escrow bug.** It is not — the hold
> logic is correct; it was reading the wrong column. `20260804000300` adds a real
> `payment_intents.payment_method`, written by `paymongo-webhook` and `paymongo-resettle` before
> settling. **Apply it and redeploy both functions before running this section.**
>
> Note the wallet half of ESC-02 was never affected: `process_wallet_purchase` credits
> `seller_payable` directly and holds nothing. **Run ESC-02 with GCash specifically** — testing it
> with wallet balance alone passes without exercising the branch that was broken.

Needs: the Owner (for one setting change), one **Buyer** account, one **Seller/Developer** account with
a credit listed.

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ ESC-01 | Card money is **held** | Buyer buys a credit with the **test card** → Seller opens Seller Earnings | The amount shows under **"Held in escrow"**, **not** "Available to withdraw" |
| ☐ ESC-02 | GCash money is **immediate** | Buyer buys with **GCash** (not wallet balance — see the prerequisite above) → Seller opens Seller Earnings | The amount shows as **"Available to withdraw"** straight away, with **no** hold. Also check `credit_transactions.payment_method` reads `gcash`, not `paymongo` |
| ☐ ESC-03 | A held amount is **released** on time | *Owner:* **age the hold**, do not change the setting — see the corrected procedure below → wait for the 15-minute cron → Seller reloads Earnings | The amount moves **Held → Available** |
| ☐ ESC-04 | A refund **while held** reverses cleanly | Admin refunds the ESC-01 purchase while it is still held → Seller opens Earnings | The held amount **disappears**, and no *already-available* money is taken away |
| ☐ ESC-05 | The books survived all of it | *Owner:* run [`escrow_verification.sql`](../supabase/diagnostics/escrow_verification.sql) after **each** of ESC-01…04 | Rows 4, 5 and 6 turn from `INFO` to `PASS`; **row 7 (Books) stays PASS**; row 3 stops saying `UNPROVEN` |
| ☐ ESC-06 | A withdrawal actually completes | Seller submits KYB → Admin approves → Seller requests a payout → wait for the cron | Payout reads **settled**. ⚠️ **No real money moved** — the payout provider is still a mock. Do not read "settled" as "paid" |

> ## 🔴 ESC-03 was WRONG until 2026-08-05. Read this before running it.
>
> It said: *lower `escrow_hold_days_card` to `0`, wait for the cron, watch the ESC-01 amount move.*
> **That cannot work, for two independent reasons**, and it was found by reading
> `20260725000200` rather than by running it — so it would have cost a tester an afternoon and
> produced a confident *"escrow does not release"* bug report against working code.
>
> 1. **`hold_until` is stamped at PURCHASE time** — `now() + make_interval(days => v_hold_days)`.
>    `release_matured_escrow()` releases on `hold_until <= now()`. Changing the setting afterwards
>    does not move an existing row's `hold_until`, so the ESC-01 hold stays 7 days out.
> 2. **A new purchase at `0` days creates no hold at all.** The settlement RPC branches
>    `if v_hold_days > 0 then insert escrow_holds … else` credit `seller_payable` directly. So the
>    "make another purchase instead" workaround produces nothing to release either.
>
> **The correct procedure — age the hold, don't change the window.** As the Owner, in the SQL editor:
>
> ```sql
> -- 1. Find the ESC-01 hold. Confirm it is 'held' before touching anything.
> select id, transaction_id, amount, status, hold_until
> from public.escrow_holds
> where status = 'held'
> order by created_at desc
> limit 5;
>
> -- 2. Age exactly ONE hold by id — never a bare update.
> update public.escrow_holds
>    set hold_until = now() - interval '1 minute'
>  where id = '<the id from step 1>'
>    and status = 'held';
>
> -- 3. Wait up to 15 minutes for the pg_cron worker, then re-run step 1:
> --    that row should now read status = 'released'.
> ```
>
> This exercises the real path — `release_matured_escrow()` finds a matured, dispute-free hold and
> calls `release_escrow()` — which is exactly what a genuine 7-day expiry would do.
>
> ⚠️ **`escrow_hold_days_card` must stay `7`. There is no longer any reason to touch it**, which also
> removes the "put the test value back" trap the old step carried.
>
> ⚠️ **Do not age the hold you intend to refund in ESC-04.** Released is not held, and ESC-04 tests
> *refund while held*. Make **two** card purchases in ESC-01 — age one, refund the other. The run
> sheet does this by default.

---

# PART 3 — Tests by role

## 👤 Buyer / User — "BUY"

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ BUY-01 | Create account | Register → fill the form → Create Account | You are signed in **immediately — there is no confirmation email**, and that is expected during the pilot. Then a **policy consent box** appears: Terms, Privacy and Carbon Credits, one tick. It is shown once, on your first sign-in |
| ☐ BUY-02 | Identity check (KYC) | Profile → complete KYC | KYC shows verified; you can buy |
| ☐ BUY-03 | Browse the marketplace | Marketplace → click a project | Detail page opens with map, documents, price |
| ☐ BUY-04 | Top up wallet | Wallet → Top up → test card | Wallet balance goes up by the right amount |
| ☐ BUY-05 | Buy a credit (card) | Marketplace → buy 1 credit → test card | Certificate + receipt appear; the credit is in your portfolio |
| ☐ BUY-06 | Buy with wallet | Buy a credit paying from wallet balance | Purchase completes; wallet goes down by the right amount |
| ☐ BUY-07 | Buy with cart | Add **2 different** credits to cart → checkout | Both complete; 2 certificates. ⚠️ Note whether you were charged **once** or **twice** — see the known issue below |
| ☐ BUY-08 | Retire a credit | Portfolio → Retire → confirm | Retirement certificate generates |
| ☐ BUY-09 | Verify a certificate | Open the certificate's QR / public link | Public page shows it as valid |
| ☐ BUY-10 | **ESG report matches reality** | Retire 2–3 credits → Credit Portfolio → export the ESG / offset report | PDF/CSV downloads **and the tonnes it states match what you actually retired.** 🔑 If it says zero or a smaller number, that is a serious bug — write down both numbers |
| ☐ BUY-11 | Upgrade to Pro | Upgrade → subscribe with test card | Account shows "Pro" — and note the **expiry date** |
| ☐ BUY-12 | You are charged once | After BUY-11, reload and check the expiry date again | The expiry did **not** jump further into the future. One payment must buy one period |
| ☐ BUY-13 | Session expiry during payment | Start a checkout, leave it ~1 hour, then complete it | You may see **"Authentication required"** on the return page. That is **expected**. Your payment still goes through — sign back in and the credit should be there |

> **Known issue, don't re-report it:** the cart charges **once per listing**, not once per cart. Two
> items can mean two card charges. Confirm it, note it on the form, move on.

## 🏗️ Project Developer — "DEV"

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ DEV-01 | Apply as developer | Register → "I develop carbon projects" → apply → Admin approves | Your role becomes Project Developer |
| ☐ DEV-02 | Submit a project | Submit Project → details, registry fields, financials → upload the required documents → submit | Saved as "pending"; documents attached |
| ☐ DEV-03 | Resubmit after revision | A verifier requests changes → edit → resubmit | Re-enters the review queue with a revision badge |
| ☐ DEV-04 | File a monitoring report | Monitoring → new report → activity data → submit | Submitted for verification |
| ☐ DEV-05 | Carbon Asset Ledger | Open Carbon Assets / ledger | Shows issued / sold / retired + buyer history |
| ☐ DEV-06 | MRV dashboard | Open MRV Dashboard | Verified / pending tCO₂e, trend, compliance |
| ☐ DEV-07 | Offtake agreement | Offtakes → add a signed agreement | Appears; investor view shows contracted % |
| ☐ DEV-08 | Payout | Seller Earnings → submit KYB → request payout (Admin approves) | Processes; earnings update. *Same mock-provider caveat as ESC-06* |
| ☐ DEV-09 | Data-room activity | Developer → Data Room | Shows how many investors viewed documents |
| ☐ DEV-10 | **Sales are not silently empty** | Open Seller Earnings after a buyer has bought from you | Your sale is listed. 🔑 "No sales yet" when you know you sold is a bug |
| ☐ DEV-11 | **Are you told a report is due?** | Have a validated project with an overdue monitoring report. Then **sign out and wait** | Do you get an **email**, or only a banner when you next sign in? Write down which. *We believe email is missing — confirming it matters* |

## ✅ Verifier — "VER"  *(Admin sets this role)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ VER-01 | Review a project | Verifier panel → open a submitted project → run the scored rubric | Rubric score shows; checklist saves |
| ☐ VER-02 | Validate & price | Set price per credit → Validate | Becomes **Validated** and moves to MRV. **No credits minted, not on the marketplace** — correct, not a bug |
| ☐ VER-03 | Approve emission reductions | Open the monitoring report → approve → pick **Removal** or **Avoidance** | Credits mint **and** the project appears on the marketplace; MRV dashboard splits removed/avoided |
| ☐ VER-04 | Request changes | Reject / request revision with a comment | Developer is notified; project returns to them |
| ☐ VER-05 | **A decision is never lost** | Approve or reject something, then immediately reload the page | Your decision is recorded. 🔑 If you see an error but the decision *did* save, report it — that exact mismatch was a bug here before |
| ☐ VER-06 | Two verifiers, one project | Have two verifiers open the **same** project at once | Note what you see. *We know reviews aren't assigned and concurrent reviewers are invisible — confirm how bad it feels* |

## 🌾 Farmer — "FARM"  *(applied for, Admin approves)*

> 🔴 **FARM-04 to FARM-07 are new and have never been tested by anyone.** They cover the two-sided
> payment record built on 2026-07-29. Please do all four.

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ FARM-01 | Register as farmer | Register → "I am a farmer" → apply → Admin approves | Role becomes Farmer; `/farmer` opens |
| ☐ FARM-02 | Register a parcel | Farmer portal → Parcels → add (crop, area, expected yield, location) | Appears in the register |
| ☐ FARM-03 | Log a delivery | Deliveries → log against an accepted RFQ → upload a proof photo | Recorded as pending |
| ☐ FARM-04 | **"Buyer says paid" is not "paid"** | Buyer confirms your delivery, then marks it **Paid** → you open Deliveries | It reads **"The buyer says they paid you"** in **amber**. 🔴 **If it shows a green "paid", stop and report it immediately** — the platform must not state as fact something only the buyer claims |
| ☐ FARM-05 | You can confirm payment | Press **"Yes, I was paid"** | The badge turns green; "Recorded as paid" reflects it |
| ☐ FARM-06 | You can contest a payment | On another delivery press **"No, I was not paid"** → give a reason | The buyer **and** all admins are notified; the delivery shows as disputed |
| ☐ FARM-07 | Silence is also contestable | Find a delivery the buyer **confirmed** but never claimed to have paid → contest it | You can raise it. *This is the common real-world case — a confirmed delivery just going quiet* |
| ☐ FARM-08 | Carbon participation | Farmer portal → Carbon tab | Shows attributed tCO₂e (as an estimate) |
| ☐ FARM-09 | Parcel performance | Look at a parcel card | Actual vs expected yield, colour-coded |
| ☐ FARM-10 | **Do you understand the money warning?** | Read what the app tells you about payment | In your own words: **who pays you, and what happens if they don't?** Write your answer down. If it's wrong, our wording is wrong |
| ☐ FARM-11 | **Language** | Use the whole farmer portal | Note **every** place where the English blocked you. *These screens are English-only today and we know it — we need to know which words hurt most* |

## 🏛️ LGU User — "LGU"  *(Admin sets this role)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ LGU-01 | Waste emissions calculator | LGU Tools → MSW Calculator → enter waste figures | Emissions estimate calculates |
| ☐ LGU-02 | Diversion tracking | Enter diverted tonnage | Diverted impact shows (not exceeding total) |
| ☐ LGU-03 | City ESG report | Open the ESG / city report tab | Report + chart render |
| ☐ LGU-04 | Endorse a project | Endorsements tab → endorse a project | Recorded |
| ☐ LGU-05 | Land-use parcels | Land-use tab → add 3 parcels → **delete the middle one** | The right one disappears and the others keep their values |
| ☐ LGU-06 | **Are you told about projects in your area?** | Have a developer submit a project in your municipality | Do you find out **without being told by a person?** *We believe not — confirming it matters* |
| ☐ LGU-07 | All six tabs work | Open every tab in the LGU dashboard | All six render; note any that are empty or error |

## 📈 Investor — "INV"  *(Pro plan, buyer-investor)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ INV-01 | Open the portal | Investor Portal | Cross-developer pipeline of validated projects |
| ☐ INV-02 | Financial model | Open a project | IRR / NPV / payback + funding gap |
| ☐ INV-03 | Filter pipeline | Filter by category / standard / stage | Filters correctly |
| ☐ INV-04 | Data room | Open a project's document | Opens; the developer sees the view logged |

## 🛠️ Admin — "ADMIN"

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ ADMIN-01 | Approve a role | Role Applications → approve a farmer/developer/verifier | Role updates |
| ☐ ADMIN-02 | Set KYB | User Management → tick "Business verified (KYB)" | That seller's payout gate clears |
| ☐ ADMIN-03 | Review KYB | `/admin/kyb` → review a submission | Status updates |
| ☐ ADMIN-04 | Refund / dispute | `/admin/refunds` → process a refund | Reverses; books still balance |
| ☐ ADMIN-05 | **Books health check** | Finance Console, or `select * from reconcile_financials();` | **0 rows / balanced.** Run after **every** payment test |
| ☐ ADMIN-06 | System config | System Config → change platform fee / tax | Saves and applies |
| ☐ ADMIN-07 | **Audit search finds real events** | Audit Logs → search for something you **know** happened | You find it. 🔑 An empty result here would mean an investigation wrongly concludes nothing happened |
| ☐ ADMIN-08 | Daily health script | Run [`daily_beta_health.sql`](../supabase/diagnostics/daily_beta_health.sql) | One table, 8 rows. **BOOKS** and **STRANDED SELLER MONEY** are stop-the-pilot rows |

## 🌾 Admin — feedstock oversight — "FEED"  *(never tested)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ FEED-01 | The console opens | `/admin/feedstock` | Deliveries and payment states are visible |
| ☐ FEED-02 | A dispute reaches you | After FARM-06 | The dispute sits at the top with the **farmer's own words** visible inline |
| ☐ FEED-03 | You can reverse a false "Paid" | Record **"Payment was NOT made"** with a note | The delivery flips back to unpaid and `paid_at` clears |
| ☐ FEED-04 | A note is required | Try to record a resolution with **no** note | It refuses |
| ☐ FEED-05 | Both parties are told | After FEED-03 | Buyer **and** farmer are both notified |
| ☐ FEED-06 | **The money core is untouched** | Run [`feedstock_verification.sql`](../supabase/diagnostics/feedstock_verification.sql) | All rows PASS or INFO, and **row 6 (Money core untouched) must be PASS.** Feedstock must never move the books |

## 🔐 Privacy & data rights — "PRIV"  *(never tested end-to-end)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ PRIV-01 | Download my data | Profile → Privacy & Data → "Download my data" | A JSON file downloads and **contains your actual data** |
| ☐ PRIV-02 | Request deletion | Profile → Privacy & Data → request account deletion | Recorded, and you are told it is pending |
| ☐ PRIV-03 | Cancel the request | Cancel it before it runs | It is cancelled and your account still works |
| ☐ PRIV-04 | Deletion really happens | *Owner:* on a **throwaway** account, request deletion, then run `account-deletion` | The auth user is gone and the request no longer reads `pending`. ⚠️ **Owner: check the queue first — this permanently deletes accounts** |

## ⌨️ Keyboard & clarity — "KEY"  *(anyone, 10 minutes)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ KEY-01 | Escape closes dialogs | Open wallet **Top up**, then **Withdraw**, then any pop-up → press **Escape** | Every one closes |
| ☐ KEY-02 | Tab stays inside a dialog | Open a dialog → press Tab ~15 times | Focus stays in the dialog and cycles; it never wanders behind it |
| ☐ KEY-03 | Text is readable | Look at page headers, green buttons, and grey helper text | Nothing is too faint to read comfortably |
| ☐ KEY-04 | Required-field errors are visible | Submit a form with a blank required field | The warning is **red** and you can tell which field |
| ☐ KEY-05 | Phone-sized | Open the marketplace, a form, and the finance tables on a real phone | Nothing overflows sideways; headers don't eat the screen |
| ☐ KEY-06 | No dead buttons | Click every button and link you meet | Everything does something. List any that do nothing |

## 🌐 Public, no login — "PUB"

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ PUB-01 | Home page loads | Open `/` signed out | Hero stats show real numbers, not `—` |
| ☐ PUB-02 | Certificate verification | Open a certificate's public link signed out | Shows as valid |
| ☐ PUB-03 | Public registry | Open `/registry` signed out | Issued / retired credits are browsable and searchable |
| ☐ PUB-04 | Market dashboard | Open `/market` signed out | Supply, price range, retired vs issued |
| ☐ PUB-05 | Only real sign-in options | Look at the sign-in and sign-up pages | Every option offered actually works. There should be **no Google or phone button** unless the owner enabled it |
| ☐ PUB-06 | No console errors | Press F12 → Console → visit 5 public pages | The Console stays clean (red text = report it) |

---

# What is deliberately NOT being tested

Say these to every tester up front, so they don't spend time reporting them:

1. **Payments are in test mode.** No real money moves, ever.
2. **Credits are not registry-backed.** A retirement produces a **Carbonify** certificate, **not** a
   Verra / Gold Standard registry receipt. It cannot be used for compliance or statutory ESG reporting.
3. **VAT invoices are provisional** — not BIR-accredited, and they carry **no buyer TIN**, so a company
   cannot claim input VAT on them.
4. **Payouts are simulated.** A payout that reads "settled" moved no money.
5. **Carbonify never holds feedstock money.** Buyers pay farmers directly; the app only records it.
6. **Most emails don't send yet** — only the approval email does. The rest are stubs.
7. **The farmer and LGU screens are English-only.** Report *which* words blocked you (FARM-11), not the
   absence of translation itself.

---

## How to record results

Use **[TEST_REPORT_FORM.md](TEST_REPORT_FORM.md)**. Copy it, fill it in, send it back.

For each test mark **Pass**, **Fail**, or **Couldn't try**. For a fail, note:

- The **test ID** (e.g. `BUY-05`)
- What you **expected** vs what **happened**
- **The exact words on the screen**, copied — not summarised
- A screenshot if possible

**The most important single check is `ADMIN-05`.** If the books ever fail to balance after a payment
test, **stop the pilot** and report it before continuing.
