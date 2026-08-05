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

-- Retirement: retire across MULTIPLE ownership rows (bug fix).
--
-- The previous retire_credits_atomic decremented a single credit_ownership row
-- (limit 1). Because each purchase creates its own ownership row, a buyer's
-- credits for one project are usually split across several rows — so retiring an
-- amount larger than any single row (or simply summing to enough across rows)
-- wrongly failed with "insufficient credits". This version checks the TOTAL for
-- the project and decrements across rows (oldest first) until satisfied.

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
  v_user      uuid;
  v_total     numeric;
  v_remaining numeric;
  r           record;
begin
  v_user := coalesce(auth.uid(), p_user_id);

  if p_quantity is null or p_quantity <= 0 then
    return false;
  end if;

  -- Total still-owned (non-retired) credits for this project.
  select coalesce(sum(quantity), 0) into v_total
  from public.credit_ownership
  where user_id = v_user
    and project_id = p_project_id
    and coalesce(status, 'owned') <> 'retired';

  if v_total < p_quantity then
    return false;
  end if;

  -- Decrement across rows, oldest first, until the requested amount is met.
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
      update public.credit_ownership
        set quantity = 0, updated_at = now()
        where id = r.id;
      v_remaining := v_remaining - r.quantity;
    else
      update public.credit_ownership
        set quantity = quantity - v_remaining, updated_at = now()
        where id = r.id;
      v_remaining := 0;
    end if;
  end loop;

  return v_remaining <= 0;
end;
$$;

grant execute on function public.retire_credits_atomic(uuid, uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
