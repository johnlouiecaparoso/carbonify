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
