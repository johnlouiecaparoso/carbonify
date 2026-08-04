-- ============================================================================
-- Record the real payment METHOD at settlement, and make the escrow method-gate
-- actually fire.
--
-- WHAT WAS WRONG
--   20260725000200 gates the escrow hold window on the payment method:
--
--       if lower(coalesce(v_intent.provider, '')) ~ '(gcash|maya|paymaya|grab)'
--         then <no hold — push payments cannot charge back>
--         else <7-day card hold>
--
--   but `payment_intents.provider` is the GATEWAY, not the method. It is set to
--   the literal 'paymongo' at checkout creation (paymongo-checkout/index.ts) and
--   its column default is 'paymongo' (20260606000300). The regex can therefore
--   never match, so the branch is dead code and EVERY online settlement takes
--   the 7-day card hold — including GCash and Maya, which the escrow decision
--   (docs/ESCROW_DECISION.md, Option B) deliberately exempts.
--
--   The same substitution is written into the ledger of record:
--   credit_transactions.payment_method is set to v_intent.provider, so every
--   online purchase reads 'paymongo' and no receipt, export or reconciliation
--   can tell a card sale from a GCash one.
--
--   This matters now: escrow behaviour is the last gate on the closed beta, and
--   the ESC-02 check ("buy on GCash/Maya -> proceeds credit seller_payable
--   directly") would fail against the current definition.
--
-- WHAT THIS CHANGES
--   1) payment_intents gains a nullable `payment_method` column. The webhook
--      resolves the real method from the PayMongo payment resource and writes it
--      before calling the settlement RPC.
--   2) process_marketplace_purchase reads coalesce(payment_method, provider) for
--      BOTH the escrow gate and the recorded payment_method. Everything else is
--      the 20260725000200 body byte for byte.
--
--   The signature is unchanged — no drop, no recreate, no PostgREST ordering
--   hazard — and the fallback to `provider` means the order of (apply migration,
--   redeploy webhook) does not matter. With an old webhook the column stays null
--   and behaviour is exactly today's: the conservative 7-day hold. The window
--   only ever shortens once the webhook that supplies the method is live.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

alter table public.payment_intents
  add column if not exists payment_method text;

comment on column public.payment_intents.payment_method is
  'Real payment method resolved at settlement (card | gcash | maya | grab_pay). '
  'Distinct from `provider`, which is the gateway and is always ''paymongo''. '
  'Null until the webhook settles the intent; settlement falls back to `provider`.';

-- ── Card / online settlement — now gated on the real method ──
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
  v_method        text;                -- real method, falling back to provider
  v_fee_pct       numeric := 0;       -- platform fee %, from app_settings
  v_fee           numeric := 0;       -- computed platform fee
  v_seller_net    numeric;
  v_hold_days     numeric := 0;       -- escrow window for this settlement
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

  -- The method the customer actually paid with. Null when the webhook that
  -- supplies it has not been redeployed yet — falling back to `provider`
  -- reproduces the previous behaviour exactly (an unrecognised string, so the
  -- conservative card window below).
  v_method := lower(coalesce(nullif(btrim(v_intent.payment_method), ''), v_intent.provider, ''));

  -- 3) Lock the listing + its credit pool (oversell guard).
  select * into v_listing from public.credit_listings
    where id = v_intent.listing_id
    for update;
  if not found then
    raise exception 'listing % not found', v_intent.listing_id;
  end if;

  -- P6: a seller cannot buy their own listing (wash trading).
  if v_listing.seller_id = v_intent.user_id then
    raise exception 'cannot buy your own listing';
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

  -- Escrow hold window (backlog #14). Push payments can't charge back, so they
  -- release immediately; card settlements are held. Matched case-insensitively
  -- against the REAL method; anything not recognised as a push method defaults
  -- to the CARD window (the safe, conservative default).
  if v_method ~ '(gcash|maya|paymaya|grab)' then
    v_hold_days := coalesce((public.get_setting('escrow_hold_days_wallet', '0'::jsonb))::text::numeric, 0);
  else
    v_hold_days := coalesce((public.get_setting('escrow_hold_days_card', '7'::jsonb))::text::numeric, 7);
  end if;
  if v_hold_days < 0 then v_hold_days := 0; end if;

  -- 5) Record the transaction.
  insert into public.credit_transactions (
    listing_id, buyer_id, seller_id, project_credit_id, quantity,
    price_per_credit, total_amount, currency, payment_method, payment_reference,
    status, transaction_fee, platform_fee_percentage, completed_at, created_at, updated_at
  ) values (
    v_listing.id, v_intent.user_id, v_listing.seller_id, v_listing.project_credit_id, v_qty,
    v_unit, v_amount, v_intent.currency, v_method, p_payment_intent_id::text,
    'completed', v_fee, v_fee_pct, now(), now(), now()
  ) returning id into v_txn_id;

  -- 6) Record buyer ownership (purchase_price is PER CREDIT; status = 'owned').
  insert into public.credit_ownership (
    user_id, project_credit_id, project_credits_id, project_id, quantity,
    purchase_price, currency, transaction_id, status, ownership_status,
    purchase_date, created_at, updated_at
  ) values (
    v_intent.user_id, v_listing.project_credit_id, v_listing.project_credit_id, v_project_id, v_qty,
    v_unit, v_intent.currency, v_txn_id, 'owned', 'owned',
    now(), now(), now()
  );

  -- 7) Double-entry ledger: cash in from provider; seller net to ESCROW when
  --    held, else straight to seller_payable; platform fee to revenue.
  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
    values (v_entry, 'paymongo_clearing', 'debit', v_amount, v_intent.currency, 'purchase', v_txn_id::text, 'Marketplace purchase settlement');
  if v_seller_net > 0 then
    if v_hold_days > 0 then
      insert into public.escrow_holds (transaction_id, seller_id, buyer_id, amount, currency, status, hold_until)
        values (v_txn_id, v_listing.seller_id, v_intent.user_id, v_seller_net, v_intent.currency, 'held',
                now() + make_interval(days => v_hold_days::int));
      insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
        values (v_entry, 'escrow_held', 'credit', v_seller_net, v_intent.currency, 'purchase', v_txn_id::text, 'Seller proceeds held in escrow');
    else
      insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
        values (v_entry, 'seller_payable:' || v_listing.seller_id::text, 'credit', v_seller_net, v_intent.currency, 'purchase', v_txn_id::text, 'Seller proceeds');
    end if;
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

revoke all on function public.process_marketplace_purchase(uuid, text) from public;
revoke all on function public.process_marketplace_purchase(uuid, text) from anon;
revoke all on function public.process_marketplace_purchase(uuid, text) from authenticated;
grant execute on function public.process_marketplace_purchase(uuid, text) to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING (and redeploying paymongo-webhook), TEST — this is ESC-01/02:
--   (1) buy another seller's listing on CARD -> credit_transactions.payment_method
--       reads 'card'; an escrow_holds row exists, status 'held',
--       hold_until ~= now() + 7 days; reconcile_financials() = 0;
--   (2) buy on GCASH -> payment_method reads 'gcash'; NO escrow_holds row; the
--       seller's proceeds land in seller_payable immediately; reconcile = 0.
--       This is the case that could not pass before this migration;
--   (3) payment_intents.payment_method is populated on both.
--
-- ROLLBACK
--   Re-apply 20260725000200 (gates on `provider`, i.e. always the card window).
--   The column can stay; nothing else reads it.
-- ============================================================================
