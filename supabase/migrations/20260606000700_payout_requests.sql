-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.request_payout()  ->  20260804000400_payout_suspension_and_idempotency_scope.sql
--   public.mark_payout_processing()  ->  20260718000300_payout_processing_returns_claim.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- Phase 2.3 — Seller payout/disbursement state machine.
--
-- Lifecycle: requested -> processing -> settled | failed.
-- Funds move through the ledger so balances stay derived and consistent:
--   request : debit seller_payable:<id>  / credit payout_pending:<id>   (reserve)
--   settled : debit payout_pending:<id>  / credit cash_out              (money leaves)
--   failed  : debit payout_pending:<id>  / credit seller_payable:<id>   (return; ret ryable)
--
-- request_payout is callable by an authenticated seller (scoped to auth.uid()).
-- The settle/fail/processing transitions are service-role only (a worker calls
-- them after the PayoutProvider responds). Failed rows are the dead-letter queue.

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'PHP',
  destination jsonb not null,
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'settled', 'failed')),
  provider text not null default 'mock',
  provider_payout_id text,
  idempotency_key text unique,
  failure_reason text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists idx_payout_requests_seller on public.payout_requests (seller_id, created_at desc);
create index if not exists idx_payout_requests_status on public.payout_requests (status, created_at);

alter table public.payout_requests enable row level security;
drop policy if exists "Sellers read own payouts" on public.payout_requests;
create policy "Sellers read own payouts" on public.payout_requests
  for select to authenticated using (seller_id = auth.uid());

-- Minimum payout amount (mirrors MIN_PAYOUT_AMOUNT in src/services/payouts).
create or replace function public._min_payout_amount() returns numeric language sql immutable as $$ select 100::numeric $$;

-- ---------------------------------------------------------------------------
-- request_payout — seller-initiated; reserves funds and records the request.
-- ---------------------------------------------------------------------------
create or replace function public.request_payout(
  p_amount numeric,
  p_destination jsonb,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid := auth.uid();
  v_available numeric;
  v_payout_id uuid;
  v_entry uuid := gen_random_uuid();
  v_existing uuid;
begin
  if v_seller is null then
    raise exception 'not authenticated';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_amount < public._min_payout_amount() then
    raise exception 'amount below minimum payout of %', public._min_payout_amount();
  end if;
  if p_destination is null or p_destination->>'method' is null then
    raise exception 'destination with a method is required';
  end if;

  -- Idempotency: return the existing request for a repeated key.
  if p_idempotency_key is not null then
    select id into v_existing from public.payout_requests where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  -- Available balance = seller_payable account net.
  select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
    into v_available
  from public.ledger_entries
  where account = 'seller_payable:' || v_seller::text;

  if v_available < p_amount then
    raise exception 'insufficient balance: available %, requested %', v_available, p_amount;
  end if;

  insert into public.payout_requests (seller_id, amount, destination, idempotency_key, status)
    values (v_seller, p_amount, p_destination, p_idempotency_key, 'requested')
    returning id into v_payout_id;

  -- Reserve the funds out of available into pending.
  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description) values
    (v_entry, 'seller_payable:' || v_seller::text, 'debit', p_amount, 'PHP', 'payout_request', v_payout_id::text, 'Payout reserved'),
    (v_entry, 'payout_pending:' || v_seller::text, 'credit', p_amount, 'PHP', 'payout_request', v_payout_id::text, 'Payout pending');

  return v_payout_id;
end;
$$;

revoke all on function public.request_payout(numeric, jsonb, text) from public, anon;
grant execute on function public.request_payout(numeric, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Worker transitions (service role only).
-- ---------------------------------------------------------------------------
create or replace function public.mark_payout_processing(p_payout_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.payout_requests
    set status = 'processing', attempts = attempts + 1, updated_at = now()
    where id = p_payout_id and status = 'requested';
end;
$$;

create or replace function public.mark_payout_settled(p_payout_id uuid, p_provider_payout_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p public.payout_requests%rowtype;
  v_entry uuid := gen_random_uuid();
begin
  select * into v_p from public.payout_requests where id = p_payout_id for update;
  if not found then raise exception 'payout % not found', p_payout_id; end if;
  if v_p.status = 'settled' then return; end if; -- idempotent

  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description) values
    (v_entry, 'payout_pending:' || v_p.seller_id::text, 'debit', v_p.amount, v_p.currency, 'payout_settled', v_p.id::text, 'Payout disbursed'),
    (v_entry, 'cash_out', 'credit', v_p.amount, v_p.currency, 'payout_settled', v_p.id::text, 'Payout left the platform');

  update public.payout_requests
    set status = 'settled', provider_payout_id = p_provider_payout_id, settled_at = now(), updated_at = now()
    where id = p_payout_id;
end;
$$;

create or replace function public.mark_payout_failed(p_payout_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p public.payout_requests%rowtype;
  v_entry uuid := gen_random_uuid();
begin
  select * into v_p from public.payout_requests where id = p_payout_id for update;
  if not found then raise exception 'payout % not found', p_payout_id; end if;
  if v_p.status in ('failed', 'settled') then return; end if; -- idempotent

  -- Return the reserved funds to available so the seller can retry.
  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description) values
    (v_entry, 'payout_pending:' || v_p.seller_id::text, 'debit', v_p.amount, v_p.currency, 'payout_failed', v_p.id::text, 'Payout failed - reverse reservation'),
    (v_entry, 'seller_payable:' || v_p.seller_id::text, 'credit', v_p.amount, v_p.currency, 'payout_failed', v_p.id::text, 'Funds returned to seller balance');

  update public.payout_requests
    set status = 'failed', failure_reason = p_reason, updated_at = now()
    where id = p_payout_id;
end;
$$;

revoke all on function public.mark_payout_processing(uuid) from public, anon, authenticated;
revoke all on function public.mark_payout_settled(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_payout_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payout_processing(uuid) to service_role;
grant execute on function public.mark_payout_settled(uuid, text) to service_role;
grant execute on function public.mark_payout_failed(uuid, text) to service_role;

notify pgrst, 'reload schema';
