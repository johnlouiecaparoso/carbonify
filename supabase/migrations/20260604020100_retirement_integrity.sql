-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.retire_credits_atomic()  ->  20260718000000_retire_credits_atomic_with_record.sql
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
      select 'retire_credits_atomic — recover by re-applying 20260718000000_retire_credits_atomic_with_record.sql' as msg
       where exists (
         select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'retire_credits_atomic'
            and pg_get_functiondef(p.oid) like '%credit_retirements%')
  ) t;

  if v_blocked is not null
     and coalesce(current_setting('carbonify.allow_superseded_replay', true), '') <> 'yes'
  then
    raise exception using
      errcode = 'raise_exception',
      message = 'REFUSING TO RUN 20260604020100_retirement_integrity.sql — a NEWER definition is already live and this file would silently revert it',
      detail  = v_blocked,
      hint    = 'Nothing has been changed. To replay anyway: set carbonify.allow_superseded_replay = ''yes''; then re-run this file AND re-apply every file named above.';
  end if;
end
$carbonify_replay_guard$;

-- Anti-double-counting for retirement.
--
-- Retiring credits must atomically reduce the owner's balance and can never
-- drive it negative — this is what prevents the same carbon unit from being
-- retired (or sold) twice. We add a DB-level guard plus an atomic RPC that
-- decrements only when the balance is sufficient.

-- Backstop: an owner's balance can never go below zero (NOT VALID so any
-- legacy rows are not retroactively rejected, but all future writes are).
alter table public.credit_ownership
  drop constraint if exists credit_ownership_qty_nonneg;
alter table public.credit_ownership
  add constraint credit_ownership_qty_nonneg check (quantity >= 0) not valid;

-- Atomic retirement decrement. Returns true only if a single ownership row had
-- enough credits and was decremented; false otherwise (caller aborts).
create or replace function public.retire_credits_atomic(
  p_user_id uuid,
  p_project_id uuid,
  p_quantity numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_updated int;
begin
  -- Prefer the authenticated user; fall back to the supplied id (test accounts).
  v_user := coalesce(auth.uid(), p_user_id);

  if p_quantity is null or p_quantity <= 0 then
    return false;
  end if;

  update public.credit_ownership
    set quantity = quantity - p_quantity,
        updated_at = now()
  where ctid in (
    select ctid
    from public.credit_ownership
    where user_id = v_user
      and project_id = p_project_id
      and quantity >= p_quantity
    order by created_at asc
    limit 1
    for update
  );

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

grant execute on function public.retire_credits_atomic(uuid, uuid, numeric) to authenticated;
