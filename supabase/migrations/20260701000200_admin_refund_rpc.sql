-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.admin_refund_transaction()  ->  20260722000900_admin_segregation_of_duties.sql
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
      select 'admin_refund_transaction — recover by re-applying 20260722000900_admin_segregation_of_duties.sql' as msg
       where exists (
         select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'admin_refund_transaction'
            and pg_get_functiondef(p.oid) like '%refund a transaction you are a party to%')
  ) t;

  if v_blocked is not null
     and coalesce(current_setting('carbonify.allow_superseded_replay', true), '') <> 'yes'
  then
    raise exception using
      errcode = 'raise_exception',
      message = 'REFUSING TO RUN 20260701000200_admin_refund_rpc.sql — a NEWER definition is already live and this file would silently revert it',
      detail  = v_blocked,
      hint    = 'Nothing has been changed. To replay anyway: set carbonify.allow_superseded_replay = ''yes''; then re-run this file AND re-apply every file named above.';
  end if;
end
$carbonify_replay_guard$;

-- ============================================================================
-- Admin refund console — client-callable, admin-gated refund wrapper.
--
-- refund_purchase() (20260606000900) is granted to service_role ONLY, so the
-- admin UI can't call it directly. This thin SECURITY DEFINER wrapper checks
-- is_admin() and then delegates to refund_purchase, letting an admin refund a
-- transaction from the Refunds console without a buyer-opened dispute.
--
-- The heavy lifting (compensating ledger entries, inventory restore, idempotent
-- no-op if already refunded) all still lives in refund_purchase — this only adds
-- the auth gate + a client grant. Idempotent create-or-replace; safe to re-run.
-- ============================================================================

create or replace function public.admin_refund_transaction(
  p_transaction_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only administrators can issue refunds';
  end if;
  perform public.refund_purchase(p_transaction_id, p_reason);
end;
$$;

revoke all on function public.admin_refund_transaction(uuid, text) from public, anon;
grant execute on function public.admin_refund_transaction(uuid, text) to authenticated;

notify pgrst, 'reload schema';
