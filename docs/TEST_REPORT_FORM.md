# Carbonify — Test Report Form

> **Copy this page, fill it in, send it back.** You do not need to be technical. Answer in plain words.
>
> This form is deliberately not just a pass/fail grid. **Sections C and D are the valuable part** — they
> ask the questions that only a human who used the app can answer, and each one maps to a class of bug
> that automated tests on this project have repeatedly failed to catch.
>
> Companion to [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) (the tests) and
> [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) (the owner's steps).

---

## A. Who and what

| | |
|---|---|
| **Your name** | |
| **Date(s) you tested** | |
| **Role(s) you tested as** | Buyer / Developer / Verifier / Farmer / LGU / Investor / Admin |
| **Device** | e.g. Windows laptop / iPhone 13 / Android tablet |
| **Browser** | e.g. Chrome, Safari |
| **Roughly how long** | |
| **Did you need help from someone to get through it?** | Yes / No — and at which step |

---

## B. The test grid

Mark every test you attempted. **"Couldn't try" is useful information — do not leave it blank.**

| Test ID | Pass | Fail | Couldn't try | If Couldn't try — why? |
|---|:--:|:--:|:--:|---|
| | ☐ | ☐ | ☐ | |
| | ☐ | ☐ | ☐ | |
| | ☐ | ☐ | ☐ | |
| | ☐ | ☐ | ☐ | |
| | ☐ | ☐ | ☐ | |

*(Add rows as needed. Copy the IDs from the test script — `BUY-05`, `FARM-04`, `ESC-01`, etc.)*

**Totals:** Passed ☐☐ · Failed ☐☐ · Couldn't try ☐☐

---

## C. The seven questions that matter most

**Please answer all seven, even if the answer is "no".** A "no" is a result.

### C1. 🔑 Did any screen tell you that you have **nothing**, when you knew you had something?

Examples: "No sales yet" when you had sold · "₱0.00 available" when you had money · "No credits to
disclose" when you had retired some · "No parcels registered yet" · "No deliveries" · an empty audit
search for something you know happened.

> **Answer:**
>
> **Which screen:**
>
> **What you actually had:**
>
> **What the screen said, word for word:**

*This is the single most valuable question on the form. Every version of this bug found so far looked
exactly like a normal, friendly empty state.*

---

### C2. 🔑 Did any **number disagree** between two places?

Examples: your portfolio says 8 credits but the ESG report says 0 · a receipt total differs from the
wallet deduction · the seller's "held" plus "available" doesn't equal what was sold · a peso amount
shown with the wrong number of decimal places.

> **Answer:**
>
> **Place 1 said:** ......... **Place 2 said:** .........
>
> **Which one was right, as far as you can tell:**

---

### C3. Did anything claim something had happened when it **hadn't** — or the reverse?

Examples: "Payment successful" but no credit arrived · an error message but the action *did* work · a
decision that said it failed and then turned out to be saved · "paid" shown for money you never received.

> **Answer:**

---

### C4. Where did you get **stuck**, confused, or need to ask someone?

Write the step and, if you can, the sentence you wished the screen had said instead. Be blunt.

> **Answer:**

---

### C5. Was any **word, label or language** confusing, wrong, or in a language you don't read comfortably?

Farmers and LGU users especially — **list the specific words**, not just "it's in English".

> **Answer:**

---

### C6. Did any **button or link do nothing**, or take you somewhere broken?

> **Answer:**

---

### C7. Was there anything you **could not undo, close, or get out of**?

Examples: a pop-up that wouldn't close · a form that lost your work · no way back from a page · pressing
Escape doing nothing.

> **Answer:**

---

## D. One honest verdict per role you tested

> **Would you use this for real, with your own money or your own farm's harvest?**
>
> **Yes / No / Not yet — and the one thing that would change your answer:**

> **What is the single most annoying thing about it?**

> **What is the one feature you expected to be there and wasn't?**

*Answer D as the person in that role, not as a tester being polite. "It works" is less useful than "it
works but I would not trust it with a real harvest because…".*

---

## E. Detail for every failure

**Copy this block once per failed test.** The exact on-screen wording matters more than anything else
here — it usually identifies which layer broke without anyone needing to look at the code.

```
FAILURE #___

Test ID:
What I was trying to do:
What I expected to happen:
What actually happened:

The exact words on the screen (copy them, don't summarise):

Was there red text anywhere?             Yes / No
Roughly what time did it happen?
Could you carry on afterwards, or were you stuck?
Did it happen again when you retried?    Yes / No / Didn't retry
Screenshot attached?                     Yes / No
```

---

## F. Owner-only section  *(skip this if you are a pilot tester)*

### F1. Pre-flight and diagnostics

| Script | Date run | Result | Notes |
|---|---|---|---|
| `pilot_preflight.sql` | | ☐ all PASS ☐ some not | which rows: |
| `rls_negative_suite.sql` | | ☐ 0 FAIL · PASS __ · UNPROVEN __ | |
| `escrow_verification.sql` | | ☐ row 3 no longer UNPROVEN ☐ row 7 PASS | |
| `feedstock_verification.sql` | | ☐ **row 6 PASS** ☐ not | |
| `daily_beta_health.sql` | | ☐ all OK ☐ STOP/ACTION rows | which: |
| `reconcile_financials()` | | ☐ **0 rows** ☐ non-zero 🔴 | run after every money test |

### F2. Configuration changes made for testing — **and whether they were put back**

The one that matters: **ESC-03 requires lowering `escrow_hold_days_card`.** A test value left in
production is the same class of defect as everything else this project has been bitten by.

| Setting changed | To what | Reverted? | Date reverted |
|---|---|---|---|
| `escrow_hold_days_card` | | ☐ **YES** ☐ no 🔴 | |
| | | ☐ yes ☐ no | |

### F3. Deploys and config done during this round

- [ ] Frontend deployed from `feature-user-onboarding-ux` — date: ______
      *(carries the router access-control fix, the consent gate, the onboarding guides, the KYC
      document viewer and the PWA fixes — until it ships, none of those are live)*
- [ ] All 8 edge functions confirmed deployed
- [x] ✅ Signups enabled (`disable_signup` = `false`) — **2026-07-31**
- [x] ✅ Email confirmation OFF (`mailer_autoconfirm` = `true`) — **2026-07-31**, taken instead of
      buying the domain first
- [x] ✅ `20260731000100_policy_acceptances.sql` applied — **2026-07-31**, confirmed by REST probe
- [ ] **Consent box accepted once on a REAL account, and the row is there** — date: ______
      *(the gate was asking forever and recording nothing until 2026-08-01; fixed and verified for the
      four DEV mock accounts, but `policy_acceptances` has never held a row, so real accounts are still
      unproven. Accept once, then run the join in YOUR_ACTION_ITEMS. A null `accepted_at` after you
      accepted is a second, different bug)*
- [ ] Sender domain verified in Resend — date: ______ *(no longer blocks the beta; still blocks the
      8 stub emails, the MRV reminders, and turning confirmation back on)*
- [ ] `pilot-readiness.spec.js` green
- [ ] Test/seed data purged or clearly labelled
- [ ] The mock-settled ₱3,123 payout row (`d63ce676…`) removed

### F4. Things that changed on live but not in the repo

*Anything you clicked in a dashboard that no file records. This is the project's most persistent source
of drift — a doc that asserts a fact about live that nothing re-measured.*

>

---

## G. How this report gets read

*Included so you know why each question is there — and so nothing you write gets wasted.*

| What you report | What it tells the build side |
|---|---|
| **C1** — "it said I had none" | A data read is failing and being rendered as a fact about you. **Highest severity by default.** It has produced a downloaded ESG report stating zero offsets, a verified seller told they were unverified with withdrawal disabled, and a farmer told no buyer had accepted anything. Automated tests cannot see it |
| **C2** — two numbers disagree | Two code paths read different tables for the same thing. There is a known live instance of this (two functions with the *same name* reading different tables), so a second sighting tells us how far it spreads |
| **C3** — claimed vs actual | Separates a genuinely failed action from a UI that only *reports* failure. Four verifier paths had exactly this bug: the decision committed, the list refresh failed, the screen said it failed |
| **C4 / D** — stuck, and your verdict | The only source for whether the product is *usable* rather than merely working. Feature gaps get prioritised off these answers, so blunt beats polite |
| **C5** — specific words | Turns "add i18n" into an ordered list. The farmer surfaces are English-only and a smallholder disputing a payment is doing it in a second language — your list decides what gets translated first |
| **C6** — dead buttons | Usually a dead route, an unbuilt feature that shipped its button, or a permission the screen offers and the server refuses |
| **C7** — couldn't get out | Keyboard-trap and focus bugs. Every one of the 15 dialogs was fixed for Escape recently; this checks whether the fix actually reached the live build |
| **Exact on-screen wording** | Usually identifies the failing layer on its own — browser, permission rule, database function, or payment provider — without anyone reading the code |
| **"Couldn't try"** | Tells us what is *blocked* versus what is *broken*. A wave of "couldn't try" on one role usually means a missing permission or an undeployed piece, not a bug in that feature |
| **F1** — script verdicts | The machine-checkable half. `UNPROVEN` is treated as **not proven**, never as a pass |
| **F2** — reverted? | A test setting left in production is a live defect. It gets checked explicitly because it is invisible from the app |
| **F4** — live-only changes | Every "built ≠ live" defect on this project came from here — an unscheduled worker, undeployed fixes, a secret under the wrong name |

**Send the form back even if it is half-finished.** A partial report on the day beats a complete one next
week — and "couldn't try" rows are often the fastest thing to unblock.
