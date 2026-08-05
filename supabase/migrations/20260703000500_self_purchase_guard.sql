-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.process_marketplace_purchase()  ->  20260804000300_settlement_records_real_payment_method.sql
--   public.process_wallet_purchase()  ->  20260804000100_wallet_purchase_trade_gate.sql
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
      select 'process_marketplace_purchase — recover by re-applying 20260804000300_settlement_records_real_payment_method.sql' as msg
       where exists (
         select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'process_marketplace_purchase'
            and pg_get_functiondef(p.oid) like '%v_intent.payment_method%')
      union all
      select 'process_wallet_purchase — recover by re-applying 20260804000100_wallet_purchase_trade_gate.sql' as msg
       where exists (
         select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'process_wallet_purchase'
            and pg_get_functiondef(p.oid) like '%assert_can_trade(v_buyer)%')
  ) t;

  if v_blocked is not null
     and coalesce(current_setting('carbonify.allow_superseded_replay', true), '') <> 'yes'
  then
    raise exception using
      errcode = 'raise_exception',
      message = 'REFUSING TO RUN 20260703000500_self_purchase_guard.sql — a NEWER definition is already live and this file would silently revert it',
      detail  = v_blocked,
      hint    = 'Nothing has been changed. To replay anyway: set carbonify.allow_superseded_replay = ''yes''; then re-run this file AND re-apply every file named above.';
  end if;
end
$carbonify_replay_guard$;

-- ============================================================================
-- P6 hardening — block self-purchase (wash trading).
--
-- A seller could buy their own listing (directly, or to inflate volume / cycle
-- funds through the platform). This adds a guard to BOTH settlement RPCs, right
-- after the listing is locked: if the buyer is the listing's seller, the whole
-- transaction raises and rolls back (no pool decrement, no ledger entries).
--
-- Postgres can only replace a function wholesale, so each function below is a
-- full CREATE OR REPLACE identical to its latest definition
-- (process_marketplace_purchase ← 20260702000000, process_wallet_purchase ←
-- 20260701000400) with ONLY the self-purchase check added. Idempotent and safe
-- to re-run.
--
-- ⚠️ AFTER APPLYING, TEST: (1) a normal buyer can still buy another seller's
-- listing (card + wallet), reconcile = 0; (2) a seller buying THEIR OWN listing
-- is rejected with 'cannot buy your own listing' and nothing is decremented.
-- ============================================================================

-- ── 1) Card / online settlement (service_role, buyer = payment_intent.user_id) ──
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

  -- 7) Double-entry ledger: cash in from provider; owed to seller (+ platform fee).
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

revoke all on function public.process_marketplace_purchase(uuid, text) from public;
revoke all on function public.process_marketplace_purchase(uuid, text) from anon;
revoke all on function public.process_marketplace_purchase(uuid, text) from authenticated;
grant execute on function public.process_marketplace_purchase(uuid, text) to service_role;

-- ── 2) Wallet settlement (authenticated, buyer = auth.uid()) ──
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
