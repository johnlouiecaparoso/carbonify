-- ============================================================================
-- Restore the escrow / chargeback hold window (backlog #14 — Option B).
--
-- DECISION (see docs/ESCROW_DECISION.md, decided 2026-07-25): Option B — a
-- method-gated hold. Card settlements hold the seller's net for a configurable
-- window (default 7 days) so a fraudulent card purchase can be clawed back
-- before the money leaves the platform; push payments (GCash/Maya) and wallet
-- purchases release immediately (they cannot charge back).
--
-- ⚠️ GATED — APPLY DURING THE TEST-KEY PILOT, NOT BEFORE.
--   This rewrites the live settlement RPC (process_marketplace_purchase). Apply
--   it in the pilot pre-flight window and IMMEDIATELY verify:
--     1. Buy another seller's listing on CARD  -> an escrow_holds row (status
--        'held', hold_until ~= now()+7d) is created; seller sees it as "held",
--        NOT withdrawable; reconcile_financials() = 0.
--     2. Buy on GCash/Maya (or wallet) -> proceeds credit seller_payable
--        directly (hold_until in the past / no hold); reconcile = 0.
--     3. release_matured_escrow() moves a matured, dispute-free hold to
--        seller_payable; reconcile = 0.
--     4. refund_purchase() on a still-held txn reverses escrow_held (already
--        supported in 20260606000900) — a held sale refunds cleanly; reconcile = 0.
--
-- WHAT THIS CHANGES vs the current live RPC (20260703000500):
--   * process_marketplace_purchase now routes the seller net to escrow_held +
--     an escrow_holds row when the hold window is > 0, instead of always
--     crediting seller_payable directly. Everything else (self-purchase guard,
--     oversell locks, platform fee, ownership, idempotency) is byte-for-byte the
--     same. The wallet RPC (process_wallet_purchase) is UNCHANGED — wallet funds
--     are already captured and cannot charge back.
--   * Adds release_matured_escrow(): releases holds past hold_until that have no
--     OPEN dispute. Wire it to the process-payouts worker or a pg_cron job.
--   * The hold windows are admin-configurable via app_settings:
--        escrow_hold_days_card   (default 7)
--        escrow_hold_days_wallet (default 0)   -- push payments
--     get_setting() supplies the defaults, so no seed row is required; override
--     with set_setting('escrow_hold_days_card', '5'::jsonb) etc.
--
-- Rollback = re-apply 20260703000500 (the direct-to-seller_payable version).
-- ============================================================================

-- ── Card / online settlement — seller net goes to escrow when held ──
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
  -- release immediately; card settlements are held. Provider string is matched
  -- case-insensitively; anything not recognised as a push method defaults to the
  -- CARD window (the safe, conservative default).
  if lower(coalesce(v_intent.provider, '')) ~ '(gcash|maya|paymaya|grab)' then
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

-- ── Batch release of matured, dispute-free holds ──
-- Releases every hold whose window has elapsed and whose transaction has no OPEN
-- dispute (disputes.status = 'open'; resolved_* are terminal). Uses the existing
-- release_escrow(hold_id) so the ledger move (escrow_held -> seller_payable) and
-- idempotency are unchanged. Call from the process-payouts worker or a pg_cron
-- job (e.g. every 15 min). Returns the number of holds released.
create or replace function public.release_matured_escrow()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select eh.id
    from public.escrow_holds eh
    where eh.status = 'held'
      and eh.hold_until is not null
      and eh.hold_until <= now()
      and not exists (
        select 1 from public.disputes d
        where d.transaction_id = eh.transaction_id
          and d.status = 'open'
      )
  loop
    perform public.release_escrow(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.release_matured_escrow() from public, anon, authenticated;
grant execute on function public.release_matured_escrow() to service_role;

notify pgrst, 'reload schema';
