-- ============================================================================
-- Carbonify — DAILY beta health check. One paste, one table, every morning.
--
-- READ-ONLY. Safe to run as often as you like.
--
-- This is docs/SOFT_LAUNCH_RUNBOOK.md §4 as a single script. Paste the whole
-- file into the Supabase SQL Editor and read the table it prints. The editor
-- shows only the LAST statement's result, and this file has exactly one
-- statement, so there is nothing to scroll past.
--
-- Every row must read OK. Anything else has a "what to do" in its detail
-- column. Two rows are red-stop conditions: BOOKS and STRANDED.
-- ============================================================================

with
recon as (select count(*) as n from reconcile_financials()),

hook_err as (
  select count(*) as n from webhook_events
   where error is not null and received_at > now() - interval '24 hours'
),

-- Money the platform is holding that it should already have released. This is
-- the failure mode that is invisible from the app: nobody gets an error, a
-- seller just never gets paid.
stranded as (
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

held_now as (
  select count(*) as n, coalesce(sum(amount), 0) as amt
  from escrow_holds where status = 'held'
),

open_disputes as (
  select count(*) as n from disputes where status = 'open'
),

feedstock_disputes as (
  select count(*) as n from farmer_deliveries
   where farmer_payment_ack = 'disputed' and payment_resolution is null
),

stuck_payouts as (
  select count(*) as n from payout_requests
   where status = 'processing' and updated_at < now() - interval '6 hours'
),

new_activity as (
  select
    (select count(*) from credit_transactions
      where created_at > now() - interval '24 hours') as txns,
    (select count(*) from auth.users
      where created_at > now() - interval '24 hours') as signups
),

checks as (

  select 1 as seq, 'BOOKS' as check_name,
         case when (select n from recon) = 0 then 'OK' else 'STOP' end as status,
         case when (select n from recon) = 0
              then 'reconcile_financials() = 0 rows'
              else (select n from recon)::text
                   || ' discrepancy row(s). PAUSE NEW ACTIVITY. Run '
                   || 'select * from reconcile_financials(); and read the rows.'
         end as detail

  union all select 2, 'STRANDED SELLER MONEY',
         case when (select n from stranded) = 0 then 'OK' else 'STOP' end,
         case when (select n from stranded) = 0
              then 'no matured escrow hold is sitting unreleased'
              else (select n from stranded)::text
                   || ' hold(s) matured but NOT released (worst: '
                   || (select worst from stranded)::text
                   || '). The process-payouts cron is not running, or it is '
                   || 'running but getting 401 because PAYOUT_WORKER_SECRET is not '
                   || 'being sent. See supabase/cutover/schedule_payout_worker.sql.'
         end

  union all select 3, 'WEBHOOKS',
         case when (select n from hook_err) = 0 then 'OK' else 'INVESTIGATE' end,
         case when (select n from hook_err) = 0
              then 'no errored webhook_events in 24h'
              else (select n from hook_err)::text
                   || ' errored event(s) in 24h. A purchase may have been paid '
                   || 'without settling. Check webhook_events.error, and confirm '
                   || 'the PayMongo webhook still shows ENABLED (it auto-disables).'
         end

  union all select 4, 'ESCROW HELD (informational)',
         'INFO',
         (select n from held_now)::text || ' hold(s), '
         || (select to_char(amt, 'FM999,999,990.00') from held_now)
         || ' PHP currently held. Expected to be non-zero while cards settle.'

  union all select 5, 'OPEN CREDIT DISPUTES',
         case when (select n from open_disputes) = 0 then 'OK' else 'ACTION' end,
         case when (select n from open_disputes) = 0
              then 'none open'
              else (select n from open_disputes)::text
                   || ' waiting at /admin/refunds. Escrow will not release on '
                   || 'these transactions while the dispute is open.'
         end

  union all select 6, 'FARMERS SAYING THEY WERE NOT PAID',
         case when (select n from feedstock_disputes) = 0 then 'OK' else 'ACTION' end,
         case when (select n from feedstock_disputes) = 0
              then 'none open'
              else (select n from feedstock_disputes)::text
                   || ' waiting at /admin/feedstock. A person delivered a physical '
                   || 'good they cannot take back. Treat as high priority.'
         end

  union all select 7, 'STUCK PAYOUTS',
         case when (select n from stuck_payouts) = 0 then 'OK' else 'INVESTIGATE' end,
         case when (select n from stuck_payouts) = 0
              then 'none stuck in processing'
              else (select n from stuck_payouts)::text
                   || ' payout(s) in processing for over 6h — the worker claimed '
                   || 'them and did not finish.'
         end

  union all select 8, 'ACTIVITY (last 24h)',
         'INFO',
         (select txns from new_activity)::text || ' transaction(s), '
         || (select signups from new_activity)::text || ' signup(s). '
         || 'Zero on both during an active pilot usually means the frontend or '
         || 'checkout is broken, not that nobody tried.'

)
select seq, check_name as "check", status, detail from checks order by seq;

-- ============================================================================
-- ESCALATION
--   STOP        -> pause the pilot. Do not invite more users. Investigate now.
--   ACTION      -> a real person is waiting on you today.
--   INVESTIGATE -> not urgent this hour, but do not let it run a second day.
--   INFO        -> context, no action implied.
--
-- Abort criteria and rollback: docs/SOFT_LAUNCH_RUNBOOK.md §5.
-- ============================================================================
