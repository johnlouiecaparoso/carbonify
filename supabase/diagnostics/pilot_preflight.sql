-- ============================================================================
-- Carbonify — pilot pre-flight, one script
--
-- Run this in the Supabase SQL Editor before inviting anyone to the closed
-- beta. It is READ-ONLY: no INSERT, UPDATE, DELETE, DDL or migration. Running
-- it twice changes nothing.
--
-- It answers, in one pass, the SQL-answerable half of
-- docs/SOFT_LAUNCH_RUNBOOK.md §1 plus the two open migration questions that
-- docs/HANDOFF.md flags as unsettled. Each check prints its own verdict, so you
-- are reading a PASS/FAIL column rather than eyeballing raw rows.
--
-- What this script CANNOT check (dashboard/console, do them by hand):
--   1c. All 7 edge functions deployed
--   1d. PayMongo secrets hold sk_test_… and the webhook shows "enabled"
--   1e. ALLOW_UNSIGNED_WEBHOOKS unset, PAYMONGO_WEBHOOK_SECRET set
--   1f. Sentry receiving events
--   1g. Frontend deployed from the current branch build
--
-- Related: supabase/diagnostics/money_table_rls_audit.sql (§4 below runs it
-- in spirit; run that file too if you want its full per-policy output).
-- ============================================================================

select '=== 1. BOOKS RECONCILE (runbook 1a) — expect PASS / zero rows ===' as section;

select
  case when count(*) = 0
       then 'PASS — books balance'
       else 'FAIL — ' || count(*) || ' discrepancy row(s); STOP and investigate'
  end as verdict
from reconcile_financials();

-- The detail, if the above is not zero.
select * from reconcile_financials();


select '=== 2. WEBHOOK HEALTH (runbook 1b) — expect no errored recent events ===' as section;

select status, count(*) as events
from webhook_events
group by status
order by events desc;

select
  case when count(*) = 0
       then 'PASS — no errored webhook_events in the last 7 days'
       else 'FAIL — ' || count(*) || ' errored event(s); read them below'
  end as verdict
from webhook_events
where error is not null
  and received_at > now() - interval '7 days';

select id, error, received_at
from webhook_events
where error is not null
order by received_at desc
limit 20;


select '=== 3. MIGRATION APPLY-STATUS — settles the HANDOFF ambiguity ===' as section;

-- HANDOFF §"Apply-status note": the 2026-07-11 notes claim the
-- 20260718000000–000700 batch was never applied, but a later live failure
-- (column "available_credits" does not exist) is only possible if 000700 HAD
-- landed. These two checks settle it without re-running anything.

select
  case when count(*) = 0
       then 'PASS — available_credits is gone (000600/000700 landed)'
       else 'ATTENTION — available_credits still present; the batch is NOT fully applied'
  end as verdict_000700
from information_schema.columns
where table_schema = 'public'
  and table_name = 'project_credits'
  and column_name = 'available_credits';

select
  case when count(*) = 1
       then 'PASS — single 4-arg retire_credits_atomic (000000 landed)'
       else 'ATTENTION — found ' || count(*) || ' signature(s); expected exactly 1'
  end as verdict_000000
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'retire_credits_atomic';

-- For the record, whatever the count says:
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'retire_credits_atomic';

-- 20260718001100 (receipt FK schema-cache reload). Non-fatal: it only clears a
-- console 400/406 on receipts. If this reports ATTENTION you can either apply
-- the migration or just run:  notify pgrst, 'reload schema';
select
  case when count(*) = 2
       then 'PASS — both credit_transactions→profiles FKs present (001100 landed)'
       else 'ATTENTION — found ' || count(*) || ' of 2 FKs; receipts may 400 in console'
  end as verdict_001100
from pg_constraint
where conrelid = 'public.credit_transactions'::regclass
  and contype = 'f'
  and conname in (
    'credit_transactions_buyer_id_fkey',
    'credit_transactions_seller_id_fkey'
  );


select '=== 4. MONEY-TABLE RLS (backlog #13c) — expect PASS on all 7 tables ===' as section;

-- RLS must be enabled on every money table.
select
  case when count(*) = 0
       then 'PASS — RLS enabled on all 7 money tables'
       else 'FAIL — RLS DISABLED on: ' || string_agg(relname, ', ')
  end as verdict_rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'credit_ownership', 'wallet_accounts', 'wallet_transactions',
    'credit_transactions', 'project_credits', 'credit_listings',
    'credit_retirements'
  )
  and c.relrowsecurity = false;

-- No client-role write policy may exist on the four ledger tables. Writes go
-- only through SECURITY DEFINER RPCs and the issuance trigger, which are
-- RLS-exempt. A row here is a reopened hole.
select
  case when count(*) = 0
       then 'PASS — no client write policy on the ledger tables'
       else 'FAIL — ' || count(*) || ' client write policy(ies); see rows below'
  end as verdict_no_client_writes
from pg_policies
where schemaname = 'public'
  and tablename in (
    'credit_ownership', 'wallet_accounts', 'wallet_transactions',
    'credit_transactions'
  )
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and (roles && array['anon', 'authenticated', 'public']::name[]);

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'credit_ownership', 'wallet_accounts', 'wallet_transactions',
    'credit_transactions'
  )
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and (roles && array['anon', 'authenticated', 'public']::name[]);

-- The three blanket-write policies closed by 20260718000800 must stay gone.
select
  case when count(*) = 0
       then 'PASS — the 2026-07-11 blanket-write policies are still gone'
       else 'FAIL — a blanket-write policy is back: ' || string_agg(policyname, ', ')
  end as verdict_no_blanket_writes
from pg_policies
where schemaname = 'public'
  and policyname in (
    'Allow all project credits operations',
    'Allow all credit listings operations'
  );


select '=== 5. ESCROW (backlog #14) — is 20260725000200 applied yet? ===' as section;

-- This is the one migration that MUST land before the first pilot SELLER is
-- invited: the ToS and the in-app modal already describe a hold window that
-- live settlement does not yet provide. See docs/ESCROW_DECISION.md §6.

select
  case when count(*) = 1
       then 'APPLIED — release_matured_escrow() exists'
       else 'NOT APPLIED — apply 20260725000200 before inviting pilot sellers'
  end as verdict_escrow_fn
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'release_matured_escrow';

-- The configurable windows the RPC reads via get_setting().
select
  case when count(*) = 2
       then 'APPLIED — both escrow window settings present'
       else 'NOT APPLIED — found ' || count(*) || ' of 2 escrow window settings'
  end as verdict_escrow_settings
from app_settings
where key in ('escrow_hold_days_card', 'escrow_hold_days_wallet');

select key, value from app_settings
where key in ('escrow_hold_days_card', 'escrow_hold_days_wallet')
order by key;

-- The settlement RPC itself must contain the escrow branch, not just the
-- helper function. A migration that half-applied would show fn present here
-- but no escrow_holds write in the RPC body.
select
  case when position('escrow_holds' in pg_get_functiondef(p.oid)) > 0
       then 'APPLIED — process_marketplace_purchase writes escrow_holds'
       else 'NOT APPLIED — process_marketplace_purchase still pays sellers directly'
  end as verdict_settlement_rpc
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'process_marketplace_purchase'
limit 1;

-- After applying, run the 4 escrow flows in ESCROW_DECISION.md §6
-- (card→held, push→immediate, matured release, refund-while-held) and re-run
-- section 1 of this script after each. Each must come back PASS.


select '=== 6. INVENTORY SANITY — leftover test data before the beta ===' as section;

-- TESTING_PLAN §3: reusing the live project is fine, but purge or clearly
-- label leftover test projects/listings first so pilot users do not buy them.
select
  (select count(*) from projects)         as projects_total,
  (select count(*) from credit_listings
     where status = 'active')             as active_listings,
  (select count(*) from credit_ownership) as ownership_rows,
  (select count(*) from credit_retirements) as retirements;

select id, title, status, created_at
from projects
order by created_at desc
limit 20;
