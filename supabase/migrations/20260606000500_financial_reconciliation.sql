-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.reconcile_financials()  ->  20260703000600_reconcile_widen_unaccounted.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- ── REPLAY GUARD (executable) ───────────────────────────────────────────
-- The banner above is a comment. It travels INSIDE the text you copy, so it
-- cannot stop a paste-and-run — which is exactly how a newer definition was
-- silently reverted twice on 2026-08-05, by two different files.
--
-- This block can stop it, and it aborts BEFORE any statement below has run.
-- It fires only when the NEWER definition is already live, so applying
-- migrations in order from an empty database is unaffected: at that point the
-- marker does not exist yet and this passes in silence.
--
-- Deliberate replay:  set carbonify.allow_superseded_replay = 'yes';
do $carbonify_replay_guard$
declare
  v_blocked text;
begin
  select string_agg(msg, chr(10)) into v_blocked from (
      select 'reconcile_financials — recover by re-applying 20260703000600_reconcile_widen_unaccounted.sql' as msg
       where exists (
         select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'reconcile_financials'
            and pg_get_functiondef(p.oid) like '%transaction_unaccounted%')
  ) t;

  if v_blocked is not null
     and coalesce(current_setting('carbonify.allow_superseded_replay', true), '') <> 'yes'
  then
    raise exception using
      errcode = 'raise_exception',
      message = 'REFUSING TO RUN 20260606000500_financial_reconciliation.sql — a NEWER definition is already live and this file would silently revert it',
      detail  = v_blocked,
      hint    = 'Nothing has been changed. To replay anyway: set carbonify.allow_superseded_replay = ''yes''; then re-run this file AND re-apply every file named above.';
  end if;
end
$carbonify_replay_guard$;

-- Phase 1.6 — Internal financial reconciliation (drift detection) + derived balances.
--
-- This reconciles the system against ITSELF (intents vs transactions vs ledger vs
-- webhook events). External reconciliation against PayMongo's settlement report
-- is a follow-up that needs the PayMongo API (tracked in DEFERRED_BACKLOG.md).
--
-- Both objects are server/admin-only (the underlying ledger is deny-all to clients).

-- Derived per-account balances (balances are never stored; always summed).
create or replace view public.ledger_account_balances as
select
  account,
  currency,
  sum(case when direction = 'debit' then amount else 0 end)  as total_debits,
  sum(case when direction = 'credit' then amount else 0 end) as total_credits,
  sum(case when direction = 'credit' then amount else -amount end) as balance
from public.ledger_entries
group by account, currency;

revoke all on public.ledger_account_balances from public, anon, authenticated;
grant select on public.ledger_account_balances to service_role;

-- Drift report. Returns one row per detected inconsistency; empty = healthy.
create or replace function public.reconcile_financials(p_stuck_minutes int default 60)
returns table(issue_type text, ref_id text, detail text)
language sql
stable
security definer
set search_path = public
as $$
  -- 1) Paid intents that never produced a settling transaction.
  select 'paid_intent_no_transaction', pi.id::text,
         format('intent paid (amount %s) but no credit_transactions row', pi.amount)
  from public.payment_intents pi
  where pi.status = 'paid'
    and pi.purpose = 'marketplace_purchase'
    and not exists (
      select 1 from public.credit_transactions ct where ct.payment_reference = pi.id::text
    )

  union all
  -- 2) NEW-FLOW completed transactions with no ledger entry group.
  --    Scoped to transactions that went through the server-authoritative flow
  --    (payment_reference matches a payment_intent), so legacy/pre-ledger
  --    transactions are not flagged as drift.
  select 'transaction_no_ledger', ct.id::text,
         'completed transaction has no ledger_entries'
  from public.credit_transactions ct
  where ct.status = 'completed'
    and exists (
      select 1 from public.payment_intents pi where pi.id::text = ct.payment_reference
    )
    and not exists (
      select 1 from public.ledger_entries le
      where le.ref_type = 'purchase' and le.ref_id = ct.id::text
    )

  union all
  -- 3) Ledger groups whose debits != credits (should be impossible; safety net).
  select 'ledger_imbalance', le.entry_id::text,
         format('debits-credits = %s', sum(case when direction = 'debit' then amount else -amount end))
  from public.ledger_entries le
  group by le.entry_id
  having sum(case when direction = 'debit' then amount else -amount end) <> 0

  union all
  -- 4) Webhook events stuck unprocessed beyond the threshold.
  select 'webhook_stuck', we.event_id,
         format('received %s, still %s', we.received_at, we.status)
  from public.webhook_events we
  where we.status <> 'processed'
    and we.received_at < now() - make_interval(mins => p_stuck_minutes)

  union all
  -- 5) Paid intent amount vs settled ledger debit mismatch.
  select 'intent_ledger_amount_mismatch', pi.id::text,
         format('intent %s vs ledger debit %s', pi.amount, coalesce(led.total, 0))
  from public.payment_intents pi
  join public.credit_transactions ct on ct.payment_reference = pi.id::text
  left join (
    select ref_id, sum(amount) as total
    from public.ledger_entries
    where ref_type = 'purchase' and direction = 'debit'
    group by ref_id
  ) led on led.ref_id = ct.id::text
  where pi.status = 'paid' and coalesce(led.total, 0) <> pi.amount;
$$;

revoke all on function public.reconcile_financials(int) from public, anon, authenticated;
grant execute on function public.reconcile_financials(int) to service_role;

notify pgrst, 'reload schema';
