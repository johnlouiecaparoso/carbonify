-- ============================================================================
-- Carbonify — escrow verification (backlog #14, migration 20260725000200)
--
-- READ-ONLY. No INSERT, UPDATE, DELETE, DDL. Running it twice changes nothing.
--
-- WHY THIS FILE EXISTS
-- `20260725000200` was applied to live on 2026-07-29. Applying it is NOT the
-- same as verifying it. The migration changes how sellers get paid:
-- process_marketplace_purchase now routes a CARD seller's net into escrow_held
-- + an escrow_holds row instead of crediting seller_payable directly.
--
-- ⚠️ THE ONE THAT STRANDS MONEY. The only thing that ever releases a hold is
-- release_matured_escrow(), called from the process-payouts edge function. If
-- that function is not deployed and on a ~15-minute cron, holds mature and then
-- sit there forever. Check §D below — it is the whole reason to run this file.
--
-- HOW TO USE
--   1. Run the 4 test purchases in docs/ESCROW_DECISION.md §6 (card, GCash or
--      wallet, a matured release, and a refund while held).
--   2. Paste this whole file into the Supabase SQL Editor and read the SUMMARY
--      table at the very bottom. The editor shows only the LAST statement's
--      result when several are pasted at once, so the summary is deliberately
--      last.
--   3. Every row must read PASS or INFO. A FAIL means do not invite a seller.
-- ============================================================================


select '=== A. CONFIGURATION — the hold windows the RPC reads ===' as section;

-- get_setting() supplies defaults (card 7 days, wallet 0), so an empty result
-- here is not automatically wrong — it means the defaults are in force.
select key, value from app_settings
where key in ('escrow_hold_days_card', 'escrow_hold_days_wallet')
order by key;


select '=== B. CARD PURCHASE -> HELD (ESCROW_DECISION §6 check 1) ===' as section;

-- Every hold ever created, newest first. After a card test purchase there
-- should be a fresh row here with status='held' and a hold_until in the future.
select eh.id,
       eh.status,
       eh.amount,
       eh.hold_until,
       eh.released_at,
       eh.refunded_at,
       eh.created_at
from escrow_holds eh
order by eh.created_at desc
limit 20;


select '=== C. PUSH PAYMENT -> IMMEDIATE (check 2) ===' as section;

-- A GCash/Maya/wallet purchase must NOT create a hold. This lists recent
-- transactions alongside whether a hold exists for them, so you can confirm the
-- card one held and the push one did not.
select ct.id as transaction_id,
       ct.created_at,
       ct.total_amount,
       ct.status,
       case when eh.id is null then 'no hold (immediate)' else 'held' end as escrow,
       eh.hold_until
from credit_transactions ct
left join escrow_holds eh on eh.transaction_id = ct.id
order by ct.created_at desc
limit 20;


select '=== D. THE RELEASE WORKER — is process-payouts actually running? ===' as section;

-- 🔴 THIS IS THE IMPORTANT ONE.
-- A hold that is past its hold_until, has no OPEN dispute, and is still 'held'
-- is money that release_matured_escrow() should already have freed. If any row
-- appears here and the timestamp is more than ~20 minutes old, the worker is
-- NOT running on its cron and sellers are stranded.
select eh.id,
       eh.seller_id,
       eh.amount,
       eh.hold_until,
       now() - eh.hold_until as overdue_by
from escrow_holds eh
where eh.status = 'held'
  and eh.hold_until is not null
  and eh.hold_until <= now()
  and not exists (
    select 1 from disputes d
    where d.transaction_id = eh.transaction_id and d.status = 'open'
  )
order by eh.hold_until;


select '=== E. REFUND WHILE HELD (check 4) ===' as section;

-- A refund on a still-held sale must reverse the hold (status 'refunded'),
-- not claw back settled funds.
select eh.id, eh.status, eh.amount, eh.refunded_at, eh.released_at
from escrow_holds eh
where eh.status in ('refunded', 'released')
order by coalesce(eh.refunded_at, eh.released_at) desc
limit 20;


select '=== F. BOOKS — must be zero after every one of the four flows ===' as section;

select * from reconcile_financials();


-- ============================================================================
-- G. SUMMARY — read this table. Every row must be PASS or INFO.
-- ============================================================================

with recon as (select count(*) as n from reconcile_financials()),
     holds_all as (select count(*) as total from escrow_holds),
     overdue as (
       select count(*) as n,
              coalesce(max(now() - hold_until), interval '0') as worst
       from escrow_holds eh
       where eh.status = 'held'
         and eh.hold_until is not null
         and eh.hold_until <= now()
         and not exists (
           select 1 from disputes d
           where d.transaction_id = eh.transaction_id and d.status = 'open'
         )
     ),
     checks as (

  select 1 as seq, 'Escrow migration applied' as check_name,
         case when exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'release_matured_escrow'
         ) then 'PASS' else 'FAIL' end as status,
         'release_matured_escrow() exists' as detail

  union all select 2, 'Settlement RPC holds',
         case when coalesce((
           select position('escrow_holds' in pg_get_functiondef(p.oid)) > 0
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'process_marketplace_purchase'
            limit 1), false)
         then 'PASS' else 'FAIL' end,
         'process_marketplace_purchase writes escrow_holds, not seller_payable directly'

  -- 🔴 The stranded-money check.
  --
  -- An empty escrow_holds table must NOT report PASS. "Nothing is overdue"
  -- across zero rows says nothing about whether the worker runs — it is the
  -- same class of bug as a failed read returning [] and being rendered as a
  -- fact about the user. Report UNPROVEN until a real hold has existed.
  union all select 3, 'Release worker running',
         case when (select n from overdue) > 0 then 'FAIL'
              when (select total from holds_all) = 0 then 'UNPROVEN'
              else 'PASS' end,
         case when (select n from overdue) > 0
              then (select n from overdue)::text
                   || ' matured hold(s) NOT released, worst overdue by '
                   || (select worst from overdue)::text
                   || ' — process-payouts is NOT running. Seller money is stranded.'
              when (select total from holds_all) = 0
              then 'NOT PROVEN — escrow_holds is empty, so there has never been '
                   || 'anything for the worker to release. This check cannot pass '
                   || 'until a card test purchase creates a hold (check 1). Do not '
                   || 'read this as "the cron works".'
              else 'no matured hold is sitting unreleased, across '
                   || (select total from holds_all)::text || ' hold(s)'
         end

  union all select 4, 'A card sale was held',
         case when exists (select 1 from escrow_holds) then 'PASS' else 'INFO' end,
         case when exists (select 1 from escrow_holds)
              then (select count(*)::text from escrow_holds) || ' hold(s) recorded'
              else 'no holds yet — run the card test purchase (check 1)' end

  union all select 5, 'A hold has been released',
         case when exists (select 1 from escrow_holds where status = 'released')
              then 'PASS' else 'INFO' end,
         'proves the full held -> matured -> released path (check 3)'

  union all select 6, 'A held sale was refunded',
         case when exists (select 1 from escrow_holds where status = 'refunded')
              then 'PASS' else 'INFO' end,
         'proves refund-while-held reverses the hold (check 4)'

  union all select 7, 'Books reconcile',
         case when (select n from recon) = 0 then 'PASS' else 'FAIL' end,
         case when (select n from recon) = 0 then 'zero discrepancy rows'
              else (select n from recon)::text || ' row(s) — STOP' end

)
select seq, check_name as "check", status, detail from checks order by seq;

-- ============================================================================
-- IF ROW 3 SAYS FAIL:
--   The worker is not running. Run supabase/cutover/schedule_payout_worker.sql
--   and follow its header. It is NOT just a dashboard button: process-payouts
--   rejects every call with 401 unless PAYOUT_WORKER_SECRET is set on the
--   function AND sent as the x-worker-secret header by the scheduler.
--   Nothing else on this list matters until row 3 stops saying FAIL.
--
-- IF ROW 3 SAYS UNPROVEN:
--   escrow_holds is empty, so nothing has ever needed releasing and this check
--   has proven nothing. Do NOT treat that as a pass. Run the card test purchase
--   (ESCROW_DECISION.md §6 check 1) to create a real hold, then re-run.
--
-- ROWS 4-6 SAYING "INFO" just means you have not run that test flow yet. They
-- are not failures — but all three should read PASS before a pilot seller is
-- invited, because the Terms (§1.5) already promise the hold window.
-- ============================================================================
