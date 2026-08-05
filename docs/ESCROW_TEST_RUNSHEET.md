# 🔴 Escrow test — run sheet for a small team

> **What this is.** `ESC-01…06` is the **last functional gate** before the closed beta, and it is the
> one test that cannot be done alone: it needs a buyer, a seller and an admin acting *in sequence*,
> because the evidence for each step appears on a screen only one of them can see.
>
> [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) Part 2 says **what** to test. This says **who does what,
> in what order, and what to hand to the next person.** [TEST_REPORT_FORM.md](TEST_REPORT_FORM.md)
> is the general pilot feedback form; the compact one in §6 here is escrow-specific and replaces it
> for this session.
>
> **Time:** about 90 minutes of work, plus one unavoidable ~15-minute wait for the cron.
> **People:** 3 is ideal, 2 works, 1 is possible but slow.

---

## 1. Why this needs more than one person

Escrow has been live and holding real sellers' money since 2026-07-29, and **no purchase has ever
been watched through the hold → release → refund path.** Applied is not verified.

The reason it needs a team is structural, not organisational:

| The claim being tested | Who can see it |
|---|---|
| Card money is **held** | only the **Seller**, on Seller Earnings |
| GCash money is **immediate** | only the **Seller** |
| A matured hold **releases** | Seller sees it; only the **Owner** can age the hold |
| A refund while held **reverses cleanly** | **Admin** acts, **Seller** confirms |
| The books still balance | only the **Owner**, in SQL |
| A withdrawal completes | **Seller** requests, **Admin** approves |

One person switching accounts can do all of it, but every switch is a chance to look at the wrong
screen and record the wrong verdict — and a wrong PASS here is worse than no test at all.

---

## 2. Who you need

| Role | How many | What they need | Can it be the owner? |
|---|---|---|---|
| **Owner** | 1 — you | Supabase SQL editor + the Vercel/PayMongo dashboards | — |
| **Buyer** | 1 | An account, KYC passed to the buy threshold, a browser | No — must be a different account from the seller |
| **Seller** | 1 | A **project developer** account with **at least one credit listed** | No |
| **Admin** | 1 | Admin role — for the refund and the KYB approval | ✅ Yes, the owner can do this |

**So: you + two helpers.** With one helper, they take Buyer and you take Seller by switching
accounts — but never sign in as buyer and seller in the same browser profile at the same time.

> ⚠️ **Self-purchase is blocked by design.** The buyer and seller must be genuinely different
> accounts, or the purchase is refused and it will look like a bug.

---

## 3. Owner set-up — do this BEFORE anyone arrives

Nothing below involves your helpers. Doing it live while two people wait is how a 90-minute session
becomes a whole afternoon.

- [ ] **Confirm PayMongo is in TEST mode.** No real money may move. Dashboard → the keys in use must
      be test keys.
- [ ] **Confirm the payout worker is on cron.** `ESC-03` and `ESC-06` both wait on it:
      ```sql
      select jobid, schedule, active from cron.job where jobname = 'carbonify-process-payouts';
      -- must be active, '*/15 * * * *'
      ```
- [ ] **Confirm the hold window is 7 days** (the default — nothing should have changed it):
      ```sql
      select public.get_setting('escrow_hold_days_card', '7'::jsonb);
      ```
- [ ] **Create the two accounts** and give the seller a listed credit. A seller with nothing listed
      cannot be bought from, and discovering that with helpers watching is avoidable.
- [ ] **Take the "before" reading** — you need it to prove nothing drifted:
      ```sql
      select public.reconcile_financials();   -- must be 0 rows
      ```
      then run [`escrow_verification.sql`](../supabase/diagnostics/escrow_verification.sql) and keep
      the output. Rows 3–6 will read `INFO`/`UNPROVEN` now; that is the baseline they move from.
- [ ] **Send each helper their one-pager** — §5 below. Send only their own.

**Test card:** `4343 4343 4343 4345`, any future expiry, any CVC.

---

## 4. The run sheet

Read left to right. **A step cannot start until the one above it is confirmed** — that confirmation
is the handoff, and it is why this is a sheet rather than a list.

| # | Who | Does | Then tells | Confirmed when |
|---|---|---|---|---|
| 1 | **Buyer** | Buys a credit with the **test card**. Note the amount. | Seller | Payment succeeds, credits appear in the portfolio |
| 2 | **Buyer** | Buys a **second** credit with the test card. Note the amount. | Seller | Same again — *two* card purchases now exist |
| 3 | **Seller** | Opens **Seller Earnings** | Owner | 🔴 **ESC-01**: both amounts sit under **"Held in escrow"**, NOT "Available to withdraw" |
| 4 | **Buyer** | Buys a third credit with **GCash** — *not* wallet balance | Seller | Payment succeeds |
| 5 | **Seller** | Reloads Seller Earnings | Owner | 🔴 **ESC-02**: the GCash amount is **"Available to withdraw"** immediately, with no hold |
| 6 | **Owner** | Runs the ESC-02 column check (§7) | — | `credit_transactions.payment_method` reads `gcash`, **not** `paymongo` |
| 7 | **Owner** | **Ages ONE of the two held rows** — the §7 procedure, by `id` | Seller, after the wait | The row's `hold_until` is in the past |
| 8 | *(everyone waits ~15 min)* | The cron runs | — | — |
| 9 | **Seller** | Reloads Seller Earnings | Owner | 🔴 **ESC-03**: that amount moved **Held → Available**. The *other* card amount is still held |
| 10 | **Admin** | Refunds the **still-held** purchase (the one NOT aged in step 7) | Seller | Refund completes without error |
| 11 | **Seller** | Reloads Seller Earnings | Owner | 🔴 **ESC-04**: the held amount **disappears**, and the *already-available* money from steps 5 and 9 is **untouched** |
| 12 | **Owner** | Runs `escrow_verification.sql` | — | 🔴 **ESC-05**: rows 4, 5, 6 now `PASS`; **row 7 (Books) still `PASS`**; row 3 no longer `UNPROVEN` |
| 13 | **Seller** | Submits **KYB** | Admin | Submitted |
| 14 | **Admin** | Approves the KYB | Seller | Approved |
| 15 | **Seller** | Requests a payout | Owner | Request accepted |
| 16 | *(wait ~15 min)* | The cron runs | — | 🔴 **ESC-06**: payout reads **settled** |

> **Step 11 is the one people get wrong.** ESC-04 passes only if the held money vanishes **and** the
> available money does not. A refund that also claws back released proceeds is a real defect, and it
> is invisible unless someone is looking at both numbers. Write both down in step 9.

> ⚠️ **ESC-06's "settled" does not mean "paid".** The payout provider is still a mock — no money
> leaves anything. Do not report it as a successful withdrawal.

---

## 5. One-pagers — send each person only their own

### 👤 For the BUYER

You are testing that money behaves correctly when you buy carbon credits. **This is a test
environment — no real money moves.** Card: `4343 4343 4343 4345`, any future expiry, any CVC.

1. Sign in and go to **Marketplace**.
2. **Buy a credit with the card.** Write down the exact amount.
3. **Buy a second credit with the card.** Write down the amount.
4. **Buy a third with GCash** — pick GCash on the payment page. **Not** wallet balance; that is a
   different path and is not what we are testing.
5. Tell the seller after each purchase.

**Write down anything that looked wrong**, even if the payment worked — a number that changed
between two screens, a message that said something had not happened when it had, a screen that told
you that you own nothing when you had just bought something. Those are the findings that matter most.

### 🏗️ For the SELLER

You are checking what happens to *your* money after somebody buys from you. You will be asked to look
at **Seller Earnings** several times. **Each time, write down both numbers** — "Held in escrow" and
"Available to withdraw" — even when only one seems to change. Half of what we are testing is that the
other number *doesn't* move.

1. Wait to be told a purchase happened, then open **Seller Earnings** and record both numbers.
2. Expect: **card purchases start as HELD.** That is correct, not a bug.
3. Expect: **a GCash purchase is available immediately.** Also correct.
4. Later you will be asked to look again after a wait — one held amount should have become available.
5. Later still, after a refund, a held amount should disappear — **and your available money must not
   change.** This is the important one.
6. Finally: submit **KYB**, and once it is approved, request a **payout**.

If a number ever looks wrong, **say so immediately and do not reload** — being told the exact screen
matters more than being told the right answer.

### 🛠️ For the ADMIN *(often the owner)*

Two actions, both when asked:

1. **Refund one specific purchase** — the seller and owner will tell you which. It must be the one
   still showing as held. Refunding the wrong one invalidates the test.
2. **Approve the seller's KYB** once submitted, so they can request a payout.

Note anything that made either action unclear — an ambiguous button, a confirmation that did not say
what would happen, a screen that did not update afterwards.

---

## 6. Feedback sheet — one per tester

Copy this and fill it in as you go, not afterwards.

```
Name / role tested:
Date + rough times:
Browser + device (e.g. Chrome on Windows / Safari on iPhone):

ESCROW STEPS — tick, and record the NUMBERS, not just pass/fail
  Step  What I did                          Held (₱)     Available (₱)   Looked right?
  ----  ---------------------------------   ----------   -------------   -------------
   3    after two card purchases
   5    after the GCash purchase
   9    after the wait
  11    after the refund

THE FIVE QUESTIONS  (these find more than the steps do)
  1. Did any screen tell you that you have NOTHING when you knew you had something?
     (empty list, ₱0, "no transactions", "you own no credits")            yes / no — where:

  2. Did any NUMBER DISAGREE between two screens for the same thing?      yes / no — which two:

  3. Did anything claim something HAD happened when it hadn't,
     or say it failed when it actually worked?                            yes / no — what:

  4. Did any button or link DO NOTHING, or go somewhere broken?           yes / no — which:

  5. Where did you get STUCK, confused, or need to ask someone?           where:

ANYTHING ELSE — including "this was fine but felt wrong":


For each problem, please give: what you did → what you expected → what happened.
A screenshot of the whole window (not a crop) is worth a paragraph.
```

> **Why question 1 is first.** Every one of this project's most expensive bugs looked like an empty
> screen: a portfolio that said you owned nothing, a compliance queue that said nobody was waiting, an
> export that reported zero offsets. They are silent by nature — nothing errors, the page just reads
> as a fact about you. **A tester saying "it said I had nothing" is the single most valuable sentence
> in this document.**

---

## 7. Owner's SQL — the exact statements

**ESC-02 — did the payment method record correctly?** This is what `20260804000300` fixed; before it,
every purchase recorded `paymongo`.

```sql
select id, payment_method, total_amount, created_at
from public.credit_transactions
order by created_at desc
limit 5;
-- the GCash purchase must read 'gcash', NOT 'paymongo'
```

**ESC-03 — age exactly one hold.** Do **not** change `escrow_hold_days_card`; see the box in
UAT_TEST_SCRIPT Part 2 for why that cannot work.

```sql
-- 1. List the held rows and pick ONE. Note both ids: you will age this one and
--    refund the other in ESC-04.
select id, transaction_id, amount, status, hold_until
from public.escrow_holds
where status = 'held'
order by created_at desc;

-- 2. Age that one row, by id. Never a bare update.
update public.escrow_holds
   set hold_until = now() - interval '1 minute'
 where id = '<paste the id>'
   and status = 'held';

-- 3. After ~15 minutes, confirm the worker released it:
select id, status, hold_until from public.escrow_holds where id = '<same id>';
-- expect status = 'released'
```

**ESC-05 — after each of ESC-01…04:**

```sql
select public.reconcile_financials();   -- must stay 0 rows, every time
```
then run [`escrow_verification.sql`](../supabase/diagnostics/escrow_verification.sql) and keep each
output. **Row 7 (Books) staying `PASS` throughout is the single most important line in this test** —
it is what says the money still adds up after a hold, a release and a refund.

**If the cron seems not to have run:**

```sql
select jobid, jobname, schedule, active from cron.job;
select status_code, content from net._http_response order by created desc limit 3;
```

---

## 8. When you are done

- [ ] Every `ESC-0x` row in [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) Part 2 ticked or explained
- [ ] `reconcile_financials()` = **0** after every step
- [ ] `escrow_verification.sql` row 7 **PASS** throughout
- [ ] `escrow_hold_days_card` is still **`7`** (nothing should have changed it)
- [ ] No aged hold left behind that you did not intend
- [ ] Every tester's feedback sheet collected — **including the ones who found nothing**

Then bring the results back. A failure here is a good outcome: it is the last gate before invited
people put real projects and real money-shaped actions through the platform, and it is the cheapest
place left to find one.
