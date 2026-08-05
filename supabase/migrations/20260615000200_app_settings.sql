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

-- ============================================================================
-- Admin System Config — app_settings key/value store + admin-editable factors.
--
-- Replaces hardcoded platform constants with admin-managed config:
--   * platform_fee_percent  — now READ by process_marketplace_purchase (was 0).
--   * min_kyc_level_to_trade — read by kycService.assertCanTrade.
--   * kyc_tiers              — tier labels by level (display).
--   * methodology_factors    — emission factors that already drive server-side
--                              credit math get an admin UPDATE policy.
--
-- All writes are admin-only (is_admin()); reads are open so the rest of the app
-- can consume the values.
-- ============================================================================

-- Helper: is the current user an admin? --------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
$$;

-- Key/value settings store ---------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings readable" on public.app_settings;
create policy "app_settings readable"
  on public.app_settings for select using (true);

drop policy if exists "app_settings admin insert" on public.app_settings;
create policy "app_settings admin insert"
  on public.app_settings for insert with check (public.is_admin());

drop policy if exists "app_settings admin update" on public.app_settings;
create policy "app_settings admin update"
  on public.app_settings for update using (public.is_admin()) with check (public.is_admin());

-- Seed defaults (don't clobber values an admin has already changed).
insert into public.app_settings (key, value, description) values
  ('platform_fee_percent', '0'::jsonb,
    'Marketplace platform fee as a percent of the purchase amount (e.g. 2.5 = 2.5%).'),
  ('min_kyc_level_to_trade', '1'::jsonb,
    'Minimum profiles.kyc_level required to buy or sell credits.'),
  ('kyc_tiers',
    '[{"level":0,"label":"Unverified"},{"level":1,"label":"Basic"},{"level":2,"label":"Verified"}]'::jsonb,
    'KYC tier labels by level (for display/admin reference).')
on conflict (key) do nothing;

-- Read helper for SQL/RPC consumers -----------------------------------------
create or replace function public.get_setting(p_key text, p_default jsonb default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.app_settings where key = p_key), p_default)
$$;

-- Emission factors: let admins edit the factors that drive credit math -------
alter table public.methodology_factors enable row level security;

drop policy if exists "methodology_factors readable" on public.methodology_factors;
create policy "methodology_factors readable"
  on public.methodology_factors for select using (true);

drop policy if exists "methodology_factors admin write" on public.methodology_factors;
create policy "methodology_factors admin write"
  on public.methodology_factors for update
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Re-issue process_marketplace_purchase so the platform fee comes from
-- app_settings instead of the hardcoded 0. ONLY the fee computation changed;
-- the rest is byte-for-byte the original (Phase 1.5) function.
-- ============================================================================
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
  v_fee_pct       numeric := 0;       -- platform fee %, from app_settings
  v_fee           numeric := 0;       -- computed platform fee
  v_seller_net    numeric;
  v_txn_id        uuid;
  v_existing_txn  uuid;
  v_entry         uuid := gen_random_uuid();
begin
  -- 1) Lock + load the intent (serializes concurrent processing of the same intent).
  select * into v_intent from public.payment_intents
    where id = p_payment_intent_id
    for update;
  if not found then
    raise exception 'payment_intent % not found', p_payment_intent_id;
  end if;

  -- 2) Idempotency: already settled => return the existing transaction.
  if v_intent.status = 'paid' then
    select id into v_existing_txn from public.credit_transactions
      where payment_reference = p_payment_intent_id::text
      limit 1;
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

  -- 3) Lock the listing + its credit pool (oversell guard).
  select * into v_listing from public.credit_listings
    where id = v_intent.listing_id
    for update;
  if not found then
    raise exception 'listing % not found', v_intent.listing_id;
  end if;

  select credits_available, project_id
    into v_pc_available, v_project_id
    from public.project_credits
    where id = v_listing.project_credit_id
    for update;

  if v_pc_available is null or v_pc_available < v_qty then
    raise exception 'insufficient credits available (% < %)', coalesce(v_pc_available, 0), v_qty;
  end if;
  if v_listing.quantity < v_qty then
    raise exception 'insufficient listing quantity (% < %)', v_listing.quantity, v_qty;
  end if;

  -- 4) Decrement the pools.
  update public.project_credits
    set credits_available = credits_available - v_qty, updated_at = now()
    where id = v_listing.project_credit_id;
  update public.credit_listings
    set quantity = quantity - v_qty, updated_at = now()
    where id = v_listing.id;

  -- Platform fee from admin config (clamped to a sane 0–100%).
  v_fee_pct := coalesce((public.get_setting('platform_fee_percent', '0'::jsonb))::text::numeric, 0);
  if v_fee_pct < 0 then v_fee_pct := 0; end if;
  if v_fee_pct > 100 then v_fee_pct := 100; end if;
  v_fee := round(v_amount * v_fee_pct / 100.0, 2);
  v_seller_net := v_amount - v_fee;

  -- 5) Record the transaction.
  insert into public.credit_transactions (
    listing_id, buyer_id, seller_id, project_credit_id, quantity,
    price_per_credit, total_amount, currency, payment_method, payment_reference,
    status, transaction_fee, platform_fee_percentage, completed_at, created_at, updated_at
  ) values (
    v_listing.id, v_intent.user_id, v_listing.seller_id, v_listing.project_credit_id, v_qty,
    v_unit, v_amount, v_intent.currency, v_intent.provider, p_payment_intent_id::text,
    'completed', v_fee, v_fee_pct, now(), now(), now()
  ) returning id into v_txn_id;

  -- 6) Record buyer ownership (purchase_price is PER CREDIT; set both legacy
  --    project_credit_id and project_credits_id; status/ownership_status conventions).
  insert into public.credit_ownership (
    user_id, project_credit_id, project_credits_id, project_id, quantity,
    purchase_price, currency, transaction_id, status, ownership_status,
    purchase_date, created_at, updated_at
  ) values (
    v_intent.user_id, v_listing.project_credit_id, v_listing.project_credit_id, v_project_id, v_qty,
    v_unit, v_intent.currency, v_txn_id, 'active', 'owned',
    now(), now(), now()
  );

  -- 7) Double-entry ledger: cash in from provider; owed to seller (+ platform fee).
  --    Legs share v_entry and sum to zero (enforced by the deferred constraint).
  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
    values (v_entry, 'paymongo_clearing', 'debit', v_amount, v_intent.currency, 'purchase', v_txn_id::text, 'Marketplace purchase settlement');
  if v_seller_net > 0 then
    insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
      values (v_entry, 'seller_payable:' || v_listing.seller_id::text, 'credit', v_seller_net, v_intent.currency, 'purchase', v_txn_id::text, 'Seller proceeds');
  end if;
  if v_fee > 0 then
    insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
      values (v_entry, 'platform_revenue', 'credit', v_fee, v_intent.currency, 'purchase', v_txn_id::text, 'Platform fee');
  end if;

  -- 8) Mark the intent paid.
  update public.payment_intents
    set status = 'paid',
        provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
        updated_at = now()
    where id = p_payment_intent_id;

  return v_txn_id;
end;
$$;

-- Server-only: no client may call this directly.
revoke all on function public.process_marketplace_purchase(uuid, text) from public;
revoke all on function public.process_marketplace_purchase(uuid, text) from anon;
revoke all on function public.process_marketplace_purchase(uuid, text) from authenticated;
grant execute on function public.process_marketplace_purchase(uuid, text) to service_role;

notify pgrst, 'reload schema';
