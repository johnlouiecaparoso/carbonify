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
      message = 'REFUSING TO RUN 20260703000400_retire_credits_authuid.sql — a NEWER definition is already live and this file would silently revert it',
      detail  = v_blocked,
      hint    = 'Nothing has been changed. To replay anyway: set carbonify.allow_superseded_replay = ''yes''; then re-run this file AND re-apply every file named above.';
  end if;
end
$carbonify_replay_guard$;

-- ============================================================================
-- Hardening — retire_credits_atomic must bind identity to the JWT, not a
-- client-passed p_user_id.
--
-- The previous body used `coalesce(auth.uid(), p_user_id)`, so if auth.uid()
-- were ever null (e.g. the execute grant is widened to anon, or the function is
-- called in a context without a JWT) a caller could retire ANOTHER user's
-- credits by passing their id. As granted today (authenticated only) it is not
-- exploitable, but retirement destroys credits and mints offset claims, so this
-- removes the fragile fallback: identity is auth.uid(), and a null uid is
-- rejected. p_user_id is ignored for identity (kept in the signature for
-- backward compatibility with the existing client call).
--
-- Behaviour for legitimate users is unchanged (auth.uid() is always set for an
-- authenticated PostgREST call and equals the id the client passes).
-- Re-verify retirement (flow E) after applying: reconcile_financials() = 0.
-- ============================================================================

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
  v_user      uuid := auth.uid();
  v_total     numeric;
  v_remaining numeric;
  r           record;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    return false;
  end if;

  select coalesce(sum(quantity), 0) into v_total
  from public.credit_ownership
  where user_id = v_user
    and project_id = p_project_id
    and coalesce(status, 'owned') <> 'retired';

  if v_total < p_quantity then
    return false;
  end if;

  v_remaining := p_quantity;
  for r in
    select id, quantity
    from public.credit_ownership
    where user_id = v_user
      and project_id = p_project_id
      and coalesce(status, 'owned') <> 'retired'
      and quantity > 0
    order by created_at asc
    for update
  loop
    exit when v_remaining <= 0;
    if r.quantity <= v_remaining then
      update public.credit_ownership set quantity = 0, updated_at = now() where id = r.id;
      v_remaining := v_remaining - r.quantity;
    else
      update public.credit_ownership set quantity = quantity - v_remaining, updated_at = now() where id = r.id;
      v_remaining := 0;
    end if;
  end loop;

  return v_remaining <= 0;
end;
$$;

revoke all on function public.retire_credits_atomic(uuid, uuid, numeric) from public, anon;
grant execute on function public.retire_credits_atomic(uuid, uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
