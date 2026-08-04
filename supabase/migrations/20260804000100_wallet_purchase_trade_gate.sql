-- ============================================================================
-- Close the wallet branch of the trade gate.
--
-- WHAT WAS WRONG
--   assert_can_trade() had exactly ONE call site in the whole system: the
--   paymongo-checkout edge function (the card/GCash/Maya path). The wallet
--   branch never called it, so the KYC threshold and — since 20260722000800 —
--   ACCOUNT SUSPENSION were enforced on one purchase path and not its sibling.
--
--   process_wallet_purchase is granted to `authenticated`, so the browser's
--   marketplaceService.purchaseCredits -> assertCanTrade check is not a
--   boundary: a suspended or unverified user could POST straight to
--   /rest/v1/rpc/process_wallet_purchase and settle a purchase. The velocity cap
--   was the only thing left standing (₱10,000/day at kyc_level 0), and a
--   spending cap is not a substitute for a sanction.
--
--   20260721000100 documented this gap deliberately rather than patching it:
--   "process_wallet_purchase is not re-declared here on purpose ... Closing that
--   is tracked as a follow-up and should be done as a full, reviewed
--   CREATE OR REPLACE of that function." This is that follow-up.
--
-- WHAT THIS CHANGES
--   The body below is the 20260704000200 definition BYTE FOR BYTE with one line
--   added — `perform public.assert_can_trade(v_buyer);` immediately after the
--   authentication check. Nothing else moves. Re-issuing the whole function
--   (rather than patching) is what keeps it from drifting against live.
--
--   Placed FIRST, before the listing is even read, for two reasons: a suspended
--   user should be told they are suspended rather than "listing not found", and
--   nothing has been locked or charged at that point, so rejecting is free.
--
--   assert_can_trade checks suspension first, then the KYC threshold from
--   app_settings.min_kyc_level_to_trade — the same authority the card path uses,
--   so the two branches now enforce identical rules.
--
-- Signature is unchanged, so no drop/recreate and no PostgREST reload hazard.
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

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

  -- Suspension + KYC threshold. The card path enforces this at checkout
  -- creation (paymongo-checkout); the wallet path enforces it here. Same
  -- function, same app_settings threshold, so the two branches cannot diverge.
  perform public.assert_can_trade(v_buyer);

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

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) a KYC-verified, active buyer completes a wallet purchase exactly as
--       before, and reconcile_financials() returns 0 rows;
--   (2) a buyer at kyc_level 0 is refused with the identity-verification
--       message — including when calling the RPC directly, not just in the UI;
--   (3) a SUSPENDED buyer is refused with the suspension message, and gets that
--       message rather than the KYC one;
--   (4) the refusal happens before any wallet debit — the balance is unchanged.
--
-- ROLLBACK
--   Re-apply 20260704000200_velocity_caps.sql, which carries the same body
--   without the assert_can_trade line.
-- ============================================================================
