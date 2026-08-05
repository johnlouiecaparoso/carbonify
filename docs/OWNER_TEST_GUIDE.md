# Owner test guide

This is your copy. It covers the things only you can do: the set up before anyone arrives, the SQL
checks, the admin actions during the money test, and what to do with the results afterwards.

Your helpers get TESTER_GUIDE and TESTER_FEEDBACK. Do not give them this one. It contains the SQL
and the admin steps, and knowing the expected answers in advance changes what people report.

Related documents. UAT_TEST_SCRIPT is the full technical checklist with test IDs, kept for
reference. TESTING_PLAN says what is automated and what is not. This guide is the practical one.

---

## What is being tested and why it matters

Escrow has been switched on since 2026-07-29 and is holding real sellers' money right now. When
someone buys with a card, the seller's share is held for seven days so a fraudulent card payment can
be clawed back before the money leaves. When someone pays with GCash, there is no hold, because
those payments cannot be reversed.

None of that has ever been watched happening. The code is applied and has never been observed. That
is the gate. A seller whose money is stuck permanently is the worst outcome this pilot could
produce, and it would be your fault rather than the platform's.

There are six checks. In the older technical document they are called ESC-01 through ESC-06.

---

## Why this needs more than one person

Each thing being tested is visible on a screen only one person can see.

Money being held is visible only to the seller, on Seller Earnings. Only you can age a hold in the
database. Only an admin can issue a refund. Only SQL can say whether the books still balance.

One person switching between accounts can do all of it, but every switch is a chance to look at the
wrong screen and write down the wrong answer. A wrong pass here is worse than no test at all.

You need yourself plus two people. One is the buyer, one is the seller. You are the admin.

The buyer and seller must be genuinely different accounts. Buying your own listing is blocked on
purpose, and if you try it, the refusal will look like a bug.

---

## Before anyone arrives

Do all of this in advance. Doing it live while two people wait is how ninety minutes becomes a whole
afternoon.

### 1. Confirm payments are in test mode

Open the PayMongo dashboard and confirm the keys in use are test keys. No real money may move.

### 2. Confirm the payout worker is running

The release step and the payout step both wait on a scheduled job.

    select jobid, schedule, active
    from cron.job
    where jobname = 'carbonify-process-payouts';

It must be active and scheduled every fifteen minutes.

### 3. Confirm the hold window is seven days

    select public.get_setting('escrow_hold_days_card', '7'::jsonb);

It should return 7. Nothing in this test changes it, and nothing should have.

### 4. Confirm the settlement function is the fixed version

This one matters. On 2026-08-05 an older migration was re-run and silently reverted this. If it is
wrong, the GCash check cannot pass and it will look like an escrow fault.

    select case
             when pg_get_functiondef('public.process_marketplace_purchase(uuid, text)'::regprocedure)
                  like '%v_intent.payment_method%'
             then 'OK'
             else 'REVERTED, re-apply 20260804000300'
           end as verdict;

If it says reverted, apply
supabase/migrations/20260804000300_settlement_records_real_payment_method.sql in full, then run the
check again.

### 5. Create the accounts and list something

Create a buyer account and a seller account. The seller must be a project developer with at least
one credit actually listed for sale. A seller with nothing listed cannot be bought from, and finding
that out with two people waiting is avoidable.

Get the buyer through KYC to the level required to buy.

### 6. Take the before reading

You need this to prove nothing drifted.

    select public.reconcile_financials();

It must return zero rows. Then run supabase/diagnostics/escrow_verification.sql and keep the output
somewhere. Rows three to six will say INFO or UNPROVEN at this point. That is the baseline they move
from.

### 7. Send out the guides

Send each helper TESTER_GUIDE and TESTER_FEEDBACK. Tell them which role they have.

---

## The running order

Each step waits for the one above it to be confirmed. That confirmation is the handover.

Step 1. Buyer buys one credit with the test card. Writes down the amount.

Step 2. Buyer buys a second credit with the test card. Writes down the amount. Tells the seller.

Step 3. Seller opens Seller Earnings and writes down both numbers.
This is check one. Both amounts must appear as held in escrow, not as available to withdraw.

Step 4. Buyer buys a third credit using GCash, not wallet balance. Tells the seller.

Step 5. Seller reloads Seller Earnings and writes down both numbers.
This is check two. The GCash amount must be available immediately, with nothing held.

Step 6. You run the payment method check below.
Still check two. The GCash purchase must record gcash, not paymongo.

Step 7. You age exactly one of the two held rows, using the SQL below. Age one and leave the other.

Step 8. Everyone waits about fifteen minutes for the scheduled job.

Step 9. Seller reloads Seller Earnings.
This is check three. The aged amount has moved from held to available. The other card amount is
still held.

Step 10. You refund the purchase that is still held. Not the one you aged.

Step 11. Seller reloads Seller Earnings.
This is check four, and it is the one people get wrong. The held amount must disappear, and the
already available money must not change. A refund that also claws back released money is a real
fault, and it is invisible unless somebody wrote down both numbers beforehand.

Step 12. You run escrow_verification.sql again.
This is check five. Rows four, five and six should now pass. Row seven, the books row, must still
pass. Row three should no longer say UNPROVEN.

Step 13. Seller submits KYB.

Step 14. You approve the KYB.

Step 15. Seller requests a payout.

Step 16. Wait about fifteen minutes.
This is check six. The payout should read settled. No real money moved. The payout provider is still
a mock, so do not record this as a successful withdrawal.

---

## Your SQL

### Check the payment method was recorded correctly

This is what the 20260804000300 migration fixed. Before it, every online purchase recorded paymongo
regardless of how it was actually paid.

    select id, payment_method, total_amount, created_at
    from public.credit_transactions
    order by created_at desc
    limit 5;

The GCash purchase must read gcash. If it reads paymongo, the settlement function has been reverted
again. See step 4 of the set up.

### Age one hold, for the release check

Do not change escrow_hold_days_card. That cannot work, for two reasons. The release date is stamped
onto the row at the moment of purchase, so changing the setting afterwards does not move an existing
hold. And a new purchase made while the setting is zero creates no hold at all, so there would be
nothing to release. Age the row instead.

First list the held rows and choose one. Note both ids. You will age this one and refund the other.

    select id, transaction_id, amount, status, hold_until
    from public.escrow_holds
    where status = 'held'
    order by created_at desc;

Then age that one row by its id. Never write an update without the id.

    update public.escrow_holds
       set hold_until = now() - interval '1 minute'
     where id = 'paste the id here'
       and status = 'held';

After about fifteen minutes, confirm the worker released it.

    select id, status, hold_until
    from public.escrow_holds
    where id = 'paste the same id here';

It should now say released.

### After every step

    select public.reconcile_financials();

It must return zero rows every single time. If it ever returns rows, stop the test and write down
exactly which step you had just completed.

### If the scheduled job seems not to have run

    select jobid, jobname, schedule, active from cron.job;

    select status_code, content
    from net._http_response
    order by created desc
    limit 3;

---

## When you finish

Go through this list before you call it done.

1. Every one of the six checks either passed, or you have written down what happened instead.
2. reconcile_financials returned zero rows after every step.
3. escrow_verification.sql row seven passed throughout. This is the single most important line in the
   whole test. It is what says the money still adds up after a hold, a release and a refund.
4. escrow_hold_days_card is still 7.
5. No aged hold left behind that you did not intend. Check for anything with a hold_until in the
   past that is still marked held.
6. You collected a feedback form from every helper, including the ones who found nothing.

Then bring the results back.

A failure here is a good outcome. This is the last gate before invited people start putting real
projects and real money shaped actions through the platform, and it is the cheapest place left to
find a problem.

---

## After the money test

Once escrow passes, the wider pilot can start. Your helpers can work through part two and part three
of TESTER_GUIDE at their own pace, covering the individual roles, keyboard access, phones, and the
pages that do not need a login.

For that phase, run this daily and keep the output:

    select public.reconcile_financials();

Zero rows every day. If it is ever not zero, that is the most important thing happening on the
project and everything else waits.
