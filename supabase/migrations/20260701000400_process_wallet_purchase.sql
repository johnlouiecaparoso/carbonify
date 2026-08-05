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
      message = 'REFUSING TO RUN 20260701000400_process_wallet_purchase.sql — a NEWER definition is already live and this file would silently revert it',
      detail  = v_blocked,
      hint    = 'Nothing has been changed. To replay anyway: set carbonify.allow_superseded_replay = ''yes''; then re-run this file AND re-apply every file named above.';
  end if;
end
$carbonify_replay_guard$;

-- Phase 1 P2 cutover — server-authoritative WALLET purchase.
--
-- The marketplace "wallet" payment method previously settled entirely in the
-- browser (direct writes to wallet_accounts, wallet_transactions,
-- credit_transactions and credit_ownership). That blocks the financial-table
-- RLS lockdown and keeps money logic client-side.
--
-- This RPC moves the whole wallet purchase server-side in one atomic
-- transaction, mirroring process_marketplace_purchase (same pools, same fee
-- model from app_settings, same balanced double-entry ledger) — the only
-- difference is the funding source (the buyer's wallet balance instead of a
-- PayMongo payment_intent).
--
-- Reconciliation note: payment_reference is a wallet-scoped token, NOT a
-- payment_intent id, so reconcile_financials()'s intent-scoped checks (#1/#2/#5)
-- correctly ignore wallet transactions, while the ledger group still balances to
-- zero (checked by #3).
--
-- Safe to grant to `authenticated`: the buyer is taken from auth.uid() and the
-- function only ever spends the caller's own wallet, so a user cannot move
-- someone else's money or fabricate a cheaper price (the amount is recomputed
-- from the listing).

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
  --    Legs share v_entry and sum to zero (v_amount = v_seller_net + v_fee).
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

-- Callable by signed-in buyers (spends only their own wallet) and the service role.
revoke all on function public.process_wallet_purchase(uuid, numeric) from public, anon;
grant execute on function public.process_wallet_purchase(uuid, numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
