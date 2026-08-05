-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.process_marketplace_purchase()  ->  20260804000300_settlement_records_real_payment_method.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- Phase 2.1 — Escrow + seller balance.
--
-- A purchase no longer credits the seller immediately. Instead the seller's net
-- is held in escrow (ledger account 'escrow_held' + an escrow_holds row). Funds
-- move to the seller's withdrawable balance ('seller_payable:<id>') only when the
-- hold is released (after the hold window / dispute-free), and can be reversed on
-- refund (Phase 2.6). Balances remain derived from the ledger.

create table if not exists public.escrow_holds (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.credit_transactions(id),
  seller_id uuid not null,
  buyer_id uuid not null,
  amount numeric(18,2) not null check (amount > 0),   -- seller net held
  currency text not null default 'PHP',
  status text not null default 'held' check (status in ('held', 'released', 'refunded')),
  hold_until timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_escrow_holds_seller on public.escrow_holds (seller_id, status);
create index if not exists idx_escrow_holds_txn on public.escrow_holds (transaction_id);
create index if not exists idx_escrow_holds_due on public.escrow_holds (status, hold_until);

alter table public.escrow_holds enable row level security;
drop policy if exists "Sellers read own escrow" on public.escrow_holds;
create policy "Sellers read own escrow" on public.escrow_holds
  for select to authenticated using (seller_id = auth.uid());

-- Default escrow hold window (days) before funds become releasable.
-- (A scheduled job / admin action calls release_escrow once elapsed.)

-- ---------------------------------------------------------------------------
-- Re-route the purchase RPC: seller net -> escrow (held), platform fee -> revenue.
-- (create or replace; supersedes 20260606000400.)
-- ---------------------------------------------------------------------------
create or replace function public.process_marketplace_purchase(
  p_payment_intent_id uuid,
  p_provider_payment_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent        public.payment_intents%rowtype;
  v_listing       public.credit_listings%rowtype;
  v_pc_available  numeric;
  v_project_id    uuid;
  v_qty           numeric;
  v_unit          numeric;
  v_amount        numeric;
  v_fee           numeric := 0;
  v_seller_net    numeric;
  v_txn_id        uuid;
  v_existing_txn  uuid;
  v_entry         uuid := gen_random_uuid();
  v_hold_days     int := 7;
begin
  select * into v_intent from public.payment_intents where id = p_payment_intent_id for update;
  if not found then
    raise exception 'payment_intent % not found', p_payment_intent_id;
  end if;

  if v_intent.status = 'paid' then
    select id into v_existing_txn from public.credit_transactions
      where payment_reference = p_payment_intent_id::text limit 1;
    return v_existing_txn;
  end if;

  if v_intent.purpose <> 'marketplace_purchase' or v_intent.listing_id is null then
    raise exception 'intent % is not a marketplace purchase', p_payment_intent_id;
  end if;

  v_qty := v_intent.quantity;
  v_unit := v_intent.unit_amount;
  v_amount := v_intent.amount;
  if v_qty is null or v_qty <= 0 then
    raise exception 'intent % has invalid quantity', p_payment_intent_id;
  end if;

  select * into v_listing from public.credit_listings where id = v_intent.listing_id for update;
  if not found then
    raise exception 'listing % not found', v_intent.listing_id;
  end if;

  select credits_available, project_id into v_pc_available, v_project_id
    from public.project_credits where id = v_listing.project_credit_id for update;

  if v_pc_available is null or v_pc_available < v_qty then
    raise exception 'insufficient credits available (% < %)', coalesce(v_pc_available, 0), v_qty;
  end if;
  if v_listing.quantity < v_qty then
    raise exception 'insufficient listing quantity (% < %)', v_listing.quantity, v_qty;
  end if;

  update public.project_credits
    set credits_available = credits_available - v_qty, updated_at = now()
    where id = v_listing.project_credit_id;
  update public.credit_listings
    set quantity = quantity - v_qty, updated_at = now()
    where id = v_listing.id;

  v_seller_net := v_amount - v_fee;

  insert into public.credit_transactions (
    listing_id, buyer_id, seller_id, project_credit_id, quantity,
    price_per_credit, total_amount, currency, payment_method, payment_reference,
    status, transaction_fee, platform_fee_percentage, completed_at, created_at, updated_at
  ) values (
    v_listing.id, v_intent.user_id, v_listing.seller_id, v_listing.project_credit_id, v_qty,
    v_unit, v_amount, v_intent.currency, v_intent.provider, p_payment_intent_id::text,
    'completed', v_fee, 0, now(), now(), now()
  ) returning id into v_txn_id;

  insert into public.credit_ownership (
    user_id, project_credit_id, project_credits_id, project_id, quantity,
    purchase_price, currency, transaction_id, status, ownership_status,
    purchase_date, created_at, updated_at
  ) values (
    v_intent.user_id, v_listing.project_credit_id, v_listing.project_credit_id, v_project_id, v_qty,
    v_unit, v_intent.currency, v_txn_id, 'active', 'owned',
    now(), now(), now()
  );

  -- Escrow hold for the seller net.
  if v_seller_net > 0 then
    insert into public.escrow_holds (transaction_id, seller_id, buyer_id, amount, currency, status, hold_until)
      values (v_txn_id, v_listing.seller_id, v_intent.user_id, v_seller_net, v_intent.currency, 'held',
              now() + make_interval(days => v_hold_days));
  end if;

  -- Double-entry: cash in from provider; held in escrow (+ platform fee).
  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
    values (v_entry, 'paymongo_clearing', 'debit', v_amount, v_intent.currency, 'purchase', v_txn_id::text, 'Marketplace purchase settlement');
  if v_seller_net > 0 then
    insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
      values (v_entry, 'escrow_held', 'credit', v_seller_net, v_intent.currency, 'purchase', v_txn_id::text, 'Seller proceeds held in escrow');
  end if;
  if v_fee > 0 then
    insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
      values (v_entry, 'platform_revenue', 'credit', v_fee, v_intent.currency, 'purchase', v_txn_id::text, 'Platform fee');
  end if;

  update public.payment_intents
    set status = 'paid',
        provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
        updated_at = now()
    where id = p_payment_intent_id;

  return v_txn_id;
end;
$$;

revoke all on function public.process_marketplace_purchase(uuid, text) from public, anon, authenticated;
grant execute on function public.process_marketplace_purchase(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Release a hold: move escrow_held -> seller_payable. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.release_escrow(p_hold_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold  public.escrow_holds%rowtype;
  v_entry uuid := gen_random_uuid();
begin
  select * into v_hold from public.escrow_holds where id = p_hold_id for update;
  if not found then
    raise exception 'escrow hold % not found', p_hold_id;
  end if;
  if v_hold.status <> 'held' then
    return; -- already released/refunded; idempotent no-op
  end if;

  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description) values
    (v_entry, 'escrow_held', 'debit', v_hold.amount, v_hold.currency, 'escrow_release', v_hold.id::text, 'Escrow release'),
    (v_entry, 'seller_payable:' || v_hold.seller_id::text, 'credit', v_hold.amount, v_hold.currency, 'escrow_release', v_hold.id::text, 'Escrow released to seller');

  update public.escrow_holds set status = 'released', released_at = now(), updated_at = now() where id = p_hold_id;
end;
$$;

revoke all on function public.release_escrow(uuid) from public, anon, authenticated;
grant execute on function public.release_escrow(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- A seller's own balance (available = withdrawable; held = in escrow).
-- ---------------------------------------------------------------------------
create or replace function public.get_my_seller_balance()
returns table(available numeric, held numeric, currency text)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(case when direction = 'credit' then amount else -amount end)
      from public.ledger_entries
      where account = 'seller_payable:' || auth.uid()::text
    ), 0) as available,
    coalesce((
      select sum(amount) from public.escrow_holds
      where seller_id = auth.uid() and status = 'held'
    ), 0) as held,
    'PHP'::text as currency;
$$;

revoke all on function public.get_my_seller_balance() from public, anon;
grant execute on function public.get_my_seller_balance() to authenticated;

notify pgrst, 'reload schema';
