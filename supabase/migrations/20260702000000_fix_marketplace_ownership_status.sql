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
  ) t;

  if v_blocked is not null
     and coalesce(current_setting('carbonify.allow_superseded_replay', true), '') <> 'yes'
  then
    raise exception using
      errcode = 'raise_exception',
      message = 'REFUSING TO RUN 20260702000000_fix_marketplace_ownership_status.sql — a NEWER definition is already live and this file would silently revert it',
      detail  = v_blocked,
      hint    = 'Nothing has been changed. To replay anyway: set carbonify.allow_superseded_replay = ''yes''; then re-run this file AND re-apply every file named above.';
  end if;
end
$carbonify_replay_guard$;

-- ============================================================================
-- Fix: process_marketplace_purchase inserted credit_ownership.status = 'active',
-- which violates the live `credit_ownership_status_check` constraint (it permits
-- 'owned'/'retired'/'refunded', not 'active'). Every card/cart marketplace
-- purchase therefore rolled back at settlement — the webhook 500'd, the intent
-- stayed 'pending', and no credits/certificate were issued (this also caused
-- PayMongo to auto-disable the webhook after repeated failures).
--
-- Root cause: this RPC path was never exercised against the live constraint
-- until the server-authoritative cutover routed purchases through it. The
-- sibling process_wallet_purchase already uses status = 'owned'; this aligns
-- the two.
--
-- Safe change: the `status` column on credit_ownership is not used as a filter
-- anywhere critical — getUserCreditPortfolio reads all of a user's rows and
-- derives display state from ownership_type; retire_credits_atomic filters only
-- on user_id/project_id/quantity. So flipping 'active' -> 'owned' does not hide
-- purchased credits or break retirement.
--
-- This is a full CREATE OR REPLACE (identical to 20260615000200's definition)
-- with the single one-word fix on the credit_ownership insert.
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
  --    FIX: status must be 'owned' (was 'active') to satisfy credit_ownership_status_check.
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
