-- ============================================================================
-- Seller listing management — price, inventory, pause/relist.
--
-- Closes the last open 🔴 in docs/role-needs/02-project-developer.md (#3):
-- "Let me set and edit my credit price and manage inventory/listing status."
-- A developer could set a price once at submission and never change it, because
-- there is no UI and no safe write path.
--
-- WHY AN RPC AND NOT A DIRECT UPDATE
-- 20260718000800 locked credit_listings against cross-user writes precisely
-- because checkout recomputes the charge from price_per_credit. The remaining
-- `sellers_manage_own_listings` policy (ALL, seller_id = auth.uid()) is not
-- enough on its own: it lets a seller raise their OWN listing.quantity above the
-- credits that actually exist in project_credits.credits_available. That is not
-- an oversell — process_marketplace_purchase re-checks the pool (20260606000400
-- line ~80) — but it fails AFTER the buyer has paid, which orphans a real
-- PayMongo charge. Every other guard in this codebase deliberately rejects
-- before a provider session exists; this one must too.
--
-- So all seller edits go through update_my_listing(), which:
--   * proves ownership against auth.uid() (never a client-supplied seller id),
--   * clamps quantity to the pool's credits_available (the oversell ceiling),
--   * rejects a non-positive price,
--   * restricts status to 'active' | 'paused'.
--
-- Marketplace reads all filter `.eq('status','active')`, so 'paused' simply
-- removes the listing from sale with no other code change. Pausing does NOT
-- touch project_credits — the credits stay in the pool, they are just not for
-- sale, which is what "pause" has to mean for the ledger to stay balanced.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

-- A seller must be able to read their own listing even when it is paused (every
-- marketplace read filters to 'active', and the seller UI needs the paused row
-- back to relist it). Policies are OR'd, so this only widens the seller's own
-- view — it grants nothing on anyone else's listings.
drop policy if exists "sellers_read_own_listings" on public.credit_listings;
create policy "sellers_read_own_listings" on public.credit_listings
  for select to authenticated
  using (seller_id = auth.uid());

create or replace function public.update_my_listing(
  p_listing_id uuid,
  p_price_per_credit numeric default null,
  p_quantity numeric default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_listing    public.credit_listings%rowtype;
  v_available  numeric;
  v_price      numeric;
  v_quantity   numeric;
  v_status     text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_listing_id is null then
    raise exception 'Listing is required';
  end if;

  -- Lock the listing so a concurrent purchase can't decrement quantity between
  -- our ceiling check and the write.
  select * into v_listing
    from public.credit_listings
   where id = p_listing_id
     for update;

  if not found then
    raise exception 'Listing not found';
  end if;

  -- Ownership from auth.uid() only. A seller may never edit another's listing.
  if v_listing.seller_id is distinct from v_uid then
    raise exception 'You can only manage your own listings';
  end if;

  -- The pool is the ceiling for how much may be offered for sale.
  select credits_available into v_available
    from public.project_credits
   where id = v_listing.project_credit_id
     for update;

  v_available := coalesce(v_available, 0);

  -- ---- price -------------------------------------------------------------
  v_price := coalesce(p_price_per_credit, v_listing.price_per_credit);
  if v_price is null or v_price <= 0 then
    raise exception 'Price per credit must be greater than zero';
  end if;

  -- ---- quantity ----------------------------------------------------------
  v_quantity := coalesce(p_quantity, v_listing.quantity);
  if v_quantity is null or v_quantity < 0 then
    raise exception 'Quantity cannot be negative';
  end if;
  if v_quantity > v_available then
    raise exception
      'You only have % credit(s) available to sell for this project', v_available;
  end if;

  -- ---- status ------------------------------------------------------------
  v_status := coalesce(nullif(btrim(lower(p_status)), ''), v_listing.status);
  if v_status not in ('active', 'paused') then
    raise exception 'Listing status must be active or paused';
  end if;

  update public.credit_listings
     set price_per_credit = v_price,
         quantity         = v_quantity,
         status           = v_status,
         updated_at       = now()
   where id = p_listing_id
   returning * into v_listing;

  return jsonb_build_object(
    'id',               v_listing.id,
    'price_per_credit', v_listing.price_per_credit,
    'quantity',         v_listing.quantity,
    'status',           v_listing.status,
    'currency',         v_listing.currency,
    'credits_available', v_available
  );
end;
$$;

revoke all on function public.update_my_listing(uuid, numeric, numeric, text) from public;
grant execute on function public.update_my_listing(uuid, numeric, numeric, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK
--   drop function if exists public.update_my_listing(uuid, numeric, numeric, text);
--   drop policy if exists "sellers_read_own_listings" on public.credit_listings;
--   notify pgrst, 'reload schema';
-- ============================================================================
