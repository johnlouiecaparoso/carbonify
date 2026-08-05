-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.process_wallet_purchase()  ->  20260804000100_wallet_purchase_trade_gate.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- ============================================================================
-- P1 — Velocity caps by KYC tier (anti-abuse spending limit).
--
-- Limits how much a user can spend on credit purchases per rolling 24h, scaled
-- by their KYC level. Complements the per-endpoint rate limiter (which caps
-- request FREQUENCY) by capping VALUE.
--
-- Caps live in app_settings under 'velocity_daily_caps' as a JSON object keyed
-- by kyc_level → daily cap in currency units (JSON null / missing key =
-- unlimited). Admin-configurable; a sensible default is used if unset.
--
-- Enforcement points (deliberate):
--   • Wallet purchases  → checked INLINE in process_wallet_purchase (synchronous;
--     rejecting is safe — nothing is charged).
--   • Card purchases    → checked at CHECKOUT CREATION in the paymongo-checkout
--     edge function, BEFORE a PayMongo session exists. NOT in the settlement RPC:
--     rejecting at settlement would happen AFTER the customer already paid,
--     orphaning the payment.
-- ============================================================================

-- Raises if p_user_id's completed purchases in the last 24h + p_amount would
-- exceed their KYC-tier daily cap. No-op when the tier is uncapped.
create or replace function public.check_velocity_limit(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level int;
  v_caps  jsonb;
  v_cap   numeric;
  v_spent numeric;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    return;
  end if;

  select coalesce(kyc_level, 0) into v_level from public.profiles where id = p_user_id;
  v_level := coalesce(v_level, 0);

  -- Default caps: level 0 = 10k/day, level 1 = 100k/day, level 2+ = unlimited.
  v_caps := public.get_setting('velocity_daily_caps', '{"0": 10000, "1": 100000}'::jsonb);

  if v_caps ? v_level::text and jsonb_typeof(v_caps -> v_level::text) = 'number' then
    v_cap := (v_caps ->> v_level::text)::numeric;
  else
    v_cap := null; -- uncapped tier
  end if;

  if v_cap is null then
    return;
  end if;

  select coalesce(sum(total_amount), 0) into v_spent
  from public.credit_transactions
  where buyer_id = p_user_id
    and status = 'completed'
    and created_at >= now() - interval '24 hours';

  if v_spent + p_amount > v_cap then
    raise exception
      'daily purchase limit exceeded for your verification level (limit %, spent %, attempted %)',
      v_cap, v_spent, p_amount
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.check_velocity_limit(uuid, numeric) from public, anon;
grant execute on function public.check_velocity_limit(uuid, numeric) to authenticated, service_role;

-- ── Re-define process_wallet_purchase with the inline velocity check ──────────
-- Full CREATE OR REPLACE = the 20260703000500 definition (server amounts,
-- self-purchase guard) + one added check_velocity_limit call after the amount is
-- known and before any pool/wallet mutation.
create or replace function public.process_wallet_purchase(
  p_listing_id uuid,
  p_quantity numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer         uuid := auth.uid();
  v_listing       public.credit_listings%rowtype;
  v_wallet        public.wallet_accounts%rowtype;
  v_pc_available  numeric;
  v_project_id    uuid;
  v_unit          numeric;
  v_amount        numeric;
  v_fee_pct       numeric := 0;
  v_fee           numeric := 0;
  v_seller_net    numeric;
  v_currency      text;
  v_ref           text := 'wallet_' || gen_random_uuid()::text;
  v_txn_id        uuid;
  v_entry         uuid := gen_random_uuid();
begin
  if v_buyer is null then
    raise exception 'authentication required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  -- 1) Lock the listing + its credit pool (oversell guard).
  select * into v_listing from public.credit_listings
    where id = p_listing_id
    for update;
  if not found then
    raise exception 'listing % not found', p_listing_id;
  end if;
  if v_listing.status <> 'active' then
    raise exception 'listing is not active';
  end if;

  -- P6: a seller cannot buy their own listing (wash trading).
  if v_listing.seller_id = v_buyer then
    raise exception 'cannot buy your own listing';
  end if;

  v_unit := v_listing.price_per_credit;
  if v_unit is null or v_unit <= 0 then
    raise exception 'listing has no valid price';
  end if;
  v_currency := coalesce(v_listing.currency, 'PHP');
  v_amount := round(v_unit * p_quantity, 2);

  -- Velocity cap (per KYC tier). Raises if this purchase would exceed the
  -- buyer's rolling-24h limit. Safe here: nothing has been charged yet.
  perform public.check_velocity_limit(v_buyer, v_amount);

  select credits_available, project_id
    into v_pc_available, v_project_id
    from public.project_credits
    where id = v_listing.project_credit_id
    for update;

  if v_pc_available is null or v_pc_available < p_quantity then
    raise exception 'insufficient credits available (% < %)', coalesce(v_pc_available, 0), p_quantity;
  end if;
  if v_listing.quantity < p_quantity then
    raise exception 'insufficient listing quantity (% < %)', v_listing.quantity, p_quantity;
  end if;

  -- 2) Lock + check the buyer's wallet.
  select * into v_wallet from public.wallet_accounts
    where user_id = v_buyer
    for update;
  if not found then
    raise exception 'wallet not found for buyer';
  end if;
  if coalesce(v_wallet.current_balance, 0) < v_amount then
    raise exception 'insufficient wallet balance (% < %)', coalesce(v_wallet.current_balance, 0), v_amount;
  end if;

  -- 3) Decrement the pools.
  update public.project_credits
    set credits_available = credits_available - p_quantity, updated_at = now()
    where id = v_listing.project_credit_id;
  update public.credit_listings
    set quantity = quantity - p_quantity, updated_at = now()
    where id = v_listing.id;

  -- 4) Debit the wallet + record the wallet transaction.
  update public.wallet_accounts
    set current_balance = current_balance - v_amount, updated_at = now()
    where id = v_wallet.id;
  insert into public.wallet_transactions (
    account_id, user_id, type, amount, status, payment_method, description, reference_id
  ) values (
    v_wallet.id, v_buyer, 'withdrawal', v_amount, 'completed', 'wallet',
    'Marketplace purchase (' || p_quantity || ' credits)', v_ref
  );

  -- Platform fee from admin config (same source as the PayMongo path).
  v_fee_pct := coalesce((public.get_setting('platform_fee_percent', '0'::jsonb))::text::numeric, 0);
  if v_fee_pct < 0 then v_fee_pct := 0; end if;
  if v_fee_pct > 100 then v_fee_pct := 100; end if;
  v_fee := round(v_amount * v_fee_pct / 100.0, 2);
  v_seller_net := v_amount - v_fee;

  -- 5) Record the transaction (wallet-scoped payment_reference).
  insert into public.credit_transactions (
    listing_id, buyer_id, seller_id, project_credit_id, quantity,
    price_per_credit, total_amount, currency, payment_method, payment_reference,
    status, transaction_fee, platform_fee_percentage, completed_at, created_at, updated_at
  ) values (
    v_listing.id, v_buyer, v_listing.seller_id, v_listing.project_credit_id, p_quantity,
    v_unit, v_amount, v_currency, 'wallet', v_ref,
    'completed', v_fee, v_fee_pct, now(), now(), now()
  ) returning id into v_txn_id;

  -- 6) Record buyer ownership.
  insert into public.credit_ownership (
    user_id, project_credit_id, project_credits_id, project_id, quantity,
    purchase_price, currency, transaction_id, status, ownership_status,
    purchase_date, created_at, updated_at
  ) values (
    v_buyer, v_listing.project_credit_id, v_listing.project_credit_id, v_project_id, p_quantity,
    v_unit, v_currency, v_txn_id, 'owned', 'owned',
    now(), now(), now()
  );

  -- 7) Double-entry ledger: wallet funds move to the seller (+ platform fee).
  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
    values (v_entry, 'wallet_float', 'debit', v_amount, v_currency, 'purchase', v_txn_id::text, 'Wallet-funded marketplace purchase');
  if v_seller_net > 0 then
    insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
      values (v_entry, 'seller_payable:' || v_listing.seller_id::text, 'credit', v_seller_net, v_currency, 'purchase', v_txn_id::text, 'Seller proceeds (wallet)');
  end if;
  if v_fee > 0 then
    insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
      values (v_entry, 'platform_revenue', 'credit', v_fee, v_currency, 'purchase', v_txn_id::text, 'Platform fee (wallet)');
  end if;

  return v_txn_id;
end;
$$;

revoke all on function public.process_wallet_purchase(uuid, numeric) from public, anon;
grant execute on function public.process_wallet_purchase(uuid, numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
