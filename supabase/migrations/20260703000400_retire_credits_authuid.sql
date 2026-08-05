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
