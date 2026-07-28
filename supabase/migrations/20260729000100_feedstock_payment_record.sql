-- ============================================================================
-- Feedstock payments become a TWO-SIDED record, and gain an escalation point.
--
-- Closes the two follow-ups the 2026-07-28 decision made load-bearing
-- (DEFERRED_BACKLOG.md #26) and the resolution half of #29.
--
-- THE DECISION THIS IMPLEMENTS
-- Carbonify is an introduction-and-records layer for feedstock, not the payment
-- rail. Buyers and farmers settle directly -- cash, GCash, bank transfer -- and
-- Carbonify records that they did. Nothing here moves money, and nothing here
-- touches ledger_entries / escrow_holds / payout_requests. The proven money path
-- is untouched by design.
--
-- WHAT WAS WRONG
-- `mark_farmer_delivery_paid` is buyer-only. It flips payment_status to 'paid'
-- and the farmer's portal then renders that as settled fact -- with no way for
-- the farmer to agree, and no way to say "no, I was not paid". Under the
-- decision above the record IS the entire product on this path, so a record only
-- one party can write is the wrong shape: the least powerful party on the
-- platform carries all the counterparty risk and cannot even contradict the
-- assertion made about them.
--
-- A feedstock dispute was also structurally impossible, not merely unrouted:
-- disputes.transaction_id is `not null references credit_transactions(id)` and a
-- delivery has no such row. Rather than widen the credit-side dispute schema --
-- which would put a physical-goods disagreement into the same table as chargeback
-- handling for issued credits -- the disagreement is recorded where it happens,
-- on the delivery itself.
--
-- WHAT THIS ADDS
--   * farmer_payment_ack     -- the farmer's side of the record (pending /
--                               confirmed / disputed), written only by the farmer
--   * payment_resolution     -- how Carbonify staff closed a disputed record,
--                               written only by an admin
-- `payment_status` keeps its existing meaning -- the BUYER's assertion -- so the
-- farmer portal's existing aggregates (amountOwed, paidCount) are unaffected.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

-- ── 1) The farmer's side of the record ──────────────────────────────────────
alter table public.farmer_deliveries
  add column if not exists farmer_payment_ack text not null default 'pending',
  add column if not exists farmer_payment_ack_at timestamptz,
  add column if not exists farmer_payment_ack_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.farmer_deliveries'::regclass
       and conname  = 'farmer_deliveries_farmer_payment_ack_check'
  ) then
    alter table public.farmer_deliveries
      add constraint farmer_deliveries_farmer_payment_ack_check
      check (farmer_payment_ack in ('pending', 'confirmed', 'disputed'));
  end if;
end $$;

-- ── 2) How staff closed a disputed record ───────────────────────────────────
alter table public.farmer_deliveries
  add column if not exists payment_resolution text,
  add column if not exists payment_resolution_note text,
  add column if not exists payment_resolved_at timestamptz,
  add column if not exists payment_resolved_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.farmer_deliveries'::regclass
       and conname  = 'farmer_deliveries_payment_resolution_check'
  ) then
    alter table public.farmer_deliveries
      add constraint farmer_deliveries_payment_resolution_check
      check (payment_resolution is null or payment_resolution in
             ('paid_confirmed', 'unpaid_confirmed', 'withdrawn', 'other'));
  end if;
end $$;

comment on column public.farmer_deliveries.payment_status is
  'The BUYER''s assertion that they settled off-platform. Not a platform payment: '
  'Carbonify neither holds nor transfers feedstock money. See farmer_payment_ack '
  'for the farmer''s side of the same record.';
comment on column public.farmer_deliveries.farmer_payment_ack is
  'The FARMER''s side: pending (has not responded), confirmed (money received), '
  'disputed (asserts they were not paid). Written only by the farmer, via '
  'acknowledge_farmer_delivery_payment.';
comment on column public.farmer_deliveries.payment_resolution is
  'How Carbonify staff closed a disputed record. Recording an off-platform '
  'outcome -- not a platform settlement.';

-- The admin queue: open disagreements, newest first. Partial, so it stays small.
create index if not exists idx_farmer_deliveries_payment_disputed
  on public.farmer_deliveries (updated_at desc)
  where farmer_payment_ack = 'disputed';

-- ── 3) The farmer answers the buyer's assertion ─────────────────────────────
-- Deliberately usable in BOTH failure modes: "you said you paid me and you did
-- not" (payment_status = 'paid') and "you confirmed my delivery and never paid"
-- (payment_status = 'unpaid'). The second is the more common real-world case and
-- the one the product had no way at all to express.
create or replace function public.acknowledge_farmer_delivery_payment(
  p_delivery_id uuid,
  p_confirm     boolean,
  p_note        text default null
) returns public.farmer_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.farmer_deliveries;
begin
  select * into v_delivery from public.farmer_deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found';
  end if;

  if v_delivery.farmer_id <> auth.uid() then
    raise exception 'Only the farmer who made this delivery can respond to its payment record'
      using errcode = 'insufficient_privilege';
  end if;

  -- A pending or rejected delivery has no payment question to answer yet.
  if v_delivery.status <> 'confirmed' then
    raise exception 'The buyer must confirm receipt of this delivery first';
  end if;

  -- You cannot acknowledge receipt of a payment nobody has claimed to have made.
  if p_confirm and v_delivery.payment_status <> 'paid' then
    raise exception 'The buyer has not recorded a payment for this delivery yet';
  end if;

  -- Confirmation is terminal and favourable; reopening it would let a farmer be
  -- pressured into withdrawing and then re-raising indefinitely.
  if v_delivery.farmer_payment_ack = 'confirmed' then
    raise exception 'You have already confirmed you were paid for this delivery';
  end if;

  -- A dispute is a claim against a counterparty and has to carry a reason.
  if not p_confirm and coalesce(btrim(p_note), '') = '' then
    raise exception 'Please describe what happened so this can be looked into';
  end if;

  -- NOTE: a dispute raised after staff already resolved the record deliberately
  -- leaves payment_resolution in place rather than clearing it. The prior
  -- outcome stays on the record, and the admin view reads
  -- (ack = 'disputed' and payment_resolution is not null) as REOPENED.
  update public.farmer_deliveries
     set farmer_payment_ack      = case when p_confirm then 'confirmed' else 'disputed' end,
         farmer_payment_ack_at   = now(),
         farmer_payment_ack_note = nullif(btrim(p_note), ''),
         updated_at              = now()
   where id = p_delivery_id
   returning * into v_delivery;

  return v_delivery;
end;
$$;

revoke all on function public.acknowledge_farmer_delivery_payment(uuid, boolean, text) from public, anon;
grant execute on function public.acknowledge_farmer_delivery_payment(uuid, boolean, text) to authenticated;

-- ── 4) A fresh assertion deserves a fresh answer ────────────────────────────
-- Re-created verbatim from 20260711000000 with one addition: marking a delivery
-- paid resets the farmer's side to 'pending'. This only ever fires when
-- payment_status was 'unpaid' (the RPC refuses an already-paid delivery), so in
-- practice it matters in exactly one case -- staff reversed a false "Paid" via
-- unpaid_confirmed below, and the buyer has now genuinely paid and says so. The
-- farmer's earlier dispute must not silently carry over onto the new assertion.
create or replace function public.mark_farmer_delivery_paid(
  p_delivery_id uuid,
  p_reference text default null
) returns public.farmer_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.farmer_deliveries;
begin
  select * into v_delivery from public.farmer_deliveries where id = p_delivery_id;
  if not found then raise exception 'Delivery not found'; end if;
  if v_delivery.buyer_id <> auth.uid() then
    raise exception 'Only the buyer can mark this delivery paid';
  end if;
  if v_delivery.status <> 'confirmed' then
    raise exception 'Confirm the delivery before marking it paid';
  end if;
  if v_delivery.payment_status = 'paid' then
    raise exception 'This delivery is already marked paid';
  end if;

  update public.farmer_deliveries
     set payment_status    = 'paid',
         paid_at           = now(),
         payment_reference = nullif(btrim(p_reference), ''),
         -- The farmer answers this assertion, not the previous one.
         farmer_payment_ack      = 'pending',
         farmer_payment_ack_at   = null,
         farmer_payment_ack_note = null,
         updated_at        = now()
   where id = p_delivery_id
   returning * into v_delivery;
  return v_delivery;
end;
$$;
revoke all on function public.mark_farmer_delivery_paid(uuid, text) from public, anon;
grant execute on function public.mark_farmer_delivery_paid(uuid, text) to authenticated;

-- ── 5) Staff record an off-platform resolution ──────────────────────────────
-- This is the escalation point #26 needed and #29 found did not exist. It
-- records what staff established happened between two parties settling directly.
-- It does NOT settle anything: no funds are held, moved or released here.
create or replace function public.resolve_farmer_delivery_payment(
  p_delivery_id uuid,
  p_resolution  text,
  p_note        text default null
) returns public.farmer_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.farmer_deliveries;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can resolve a feedstock payment record'
      using errcode = 'insufficient_privilege';
  end if;

  if p_resolution not in ('paid_confirmed', 'unpaid_confirmed', 'withdrawn', 'other') then
    raise exception 'Resolution must be paid_confirmed, unpaid_confirmed, withdrawn or other';
  end if;

  -- The note IS the resolution on a records-layer product. Without it the row
  -- says a decision was taken and nothing about what was established.
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Record what was established before closing this';
  end if;

  select * into v_delivery from public.farmer_deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Delivery not found';
  end if;

  update public.farmer_deliveries
     set payment_resolution      = p_resolution,
         payment_resolution_note = btrim(p_note),
         payment_resolved_at     = now(),
         payment_resolved_by     = auth.uid(),

         -- Staff established the money did arrive: bring both sides of the
         -- record into line with what actually happened.
         payment_status = case
           when p_resolution = 'paid_confirmed'   then 'paid'
           when p_resolution = 'unpaid_confirmed' then 'unpaid'
           else payment_status end,
         paid_at = case
           when p_resolution = 'paid_confirmed'   then coalesce(paid_at, now())
           -- Reversing a buyer's false assertion is the whole point of having an
           -- escalation point; leaving paid_at set would keep the claim alive.
           when p_resolution = 'unpaid_confirmed' then null
           else paid_at end,
         farmer_payment_ack = case
           when p_resolution = 'paid_confirmed' then 'confirmed'
           else farmer_payment_ack end,
         farmer_payment_ack_at = case
           when p_resolution = 'paid_confirmed' then coalesce(farmer_payment_ack_at, now())
           else farmer_payment_ack_at end,

         updated_at = now()
   where id = p_delivery_id
   returning * into v_delivery;

  return v_delivery;
end;
$$;

revoke all on function public.resolve_farmer_delivery_payment(uuid, text, text) from public, anon;
grant execute on function public.resolve_farmer_delivery_payment(uuid, text, text) to authenticated;

-- ── 6) The admin's read surface (#29) ───────────────────────────────────────
-- The feedstock trade was invisible to every admin console: nothing read
-- farmer_deliveries or biomass_rfqs, so a farmer owed money could be helped by
-- nobody. RLS already lets an admin SELECT these tables directly, but the
-- counterparty NAMES live in `profiles`, whose SELECT is deliberately hardened
-- (20260703000300, and see #3's warning against loosening it). So this reads
-- through a definer RPC -- the same shape as admin_recent_transactions -- rather
-- than widening profile visibility to get a name onto a screen.

create or replace function public.admin_feedstock_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v json;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  select json_build_object(
    'delivery_count',  count(*),
    'pending_count',   count(*) filter (where status = 'pending'),
    'confirmed_count', count(*) filter (where status = 'confirmed'),
    -- Open = the farmer says they are unpaid and staff have not closed it.
    'disputed_open',   count(*) filter (where farmer_payment_ack = 'disputed'
                                          and payment_resolution is null),
    'disputed_total',  count(*) filter (where farmer_payment_ack = 'disputed'),
    'awaiting_ack',    count(*) filter (where status = 'confirmed'
                                          and payment_status = 'paid'
                                          and farmer_payment_ack = 'pending'),
    -- Value the buyer asserts they paid, and value confirmed received but not
    -- yet claimed as paid. Neither is money Carbonify holds.
    'recorded_paid_value', coalesce(sum(total_amount) filter (
                             where status = 'confirmed' and payment_status = 'paid'), 0),
    'unpaid_value',        coalesce(sum(total_amount) filter (
                             where status = 'confirmed' and payment_status <> 'paid'), 0),
    'rfq_open_count',  (select count(*) from public.biomass_rfqs where status in ('open', 'quoted')),
    'rfq_count',       (select count(*) from public.biomass_rfqs)
  ) into v
  from public.farmer_deliveries;

  return v;
end;
$$;

revoke all on function public.admin_feedstock_summary() from public, anon;
grant execute on function public.admin_feedstock_summary() to authenticated;

-- p_filter: 'all' | 'disputed' | 'awaiting_ack' | 'unpaid'
create or replace function public.admin_feedstock_deliveries(
  p_filter text default 'all',
  p_limit  int  default 100
)
returns table (
  id uuid,
  created_at timestamptz,
  delivered_on date,
  farmer_id uuid,
  farmer_name text,
  buyer_id uuid,
  buyer_name text,
  quantity numeric,
  unit text,
  total_amount numeric,
  currency text,
  status text,
  payment_status text,
  paid_at timestamptz,
  payment_reference text,
  farmer_payment_ack text,
  farmer_payment_ack_at timestamptz,
  farmer_payment_ack_note text,
  payment_resolution text,
  payment_resolution_note text,
  payment_resolved_at timestamptz,
  resolved_by_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  return query
  select d.id,
         d.created_at,
         d.delivered_on,
         d.farmer_id,
         coalesce(f.full_name, 'Unknown')::text,
         d.buyer_id,
         coalesce(b.full_name, 'Unknown')::text,
         d.quantity::numeric,
         d.unit::text,
         d.total_amount::numeric,
         d.currency::text,
         d.status::text,
         d.payment_status::text,
         d.paid_at,
         d.payment_reference::text,
         d.farmer_payment_ack::text,
         d.farmer_payment_ack_at,
         d.farmer_payment_ack_note::text,
         d.payment_resolution::text,
         d.payment_resolution_note::text,
         d.payment_resolved_at,
         r.full_name::text
    from public.farmer_deliveries d
    left join public.profiles f on f.id = d.farmer_id
    left join public.profiles b on b.id = d.buyer_id
    left join public.profiles r on r.id = d.payment_resolved_by
   where case coalesce(p_filter, 'all')
           when 'disputed'     then d.farmer_payment_ack = 'disputed' and d.payment_resolution is null
           when 'awaiting_ack' then d.status = 'confirmed' and d.payment_status = 'paid'
                                    and d.farmer_payment_ack = 'pending'
           when 'unpaid'       then d.status = 'confirmed' and d.payment_status <> 'paid'
           else true
         end
   -- Disputes first regardless of filter: the queue exists for them.
   order by (d.farmer_payment_ack = 'disputed' and d.payment_resolution is null) desc,
            d.updated_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.admin_feedstock_deliveries(text, int) from public, anon;
grant execute on function public.admin_feedstock_deliveries(text, int) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) buyer confirms a delivery, marks it paid -> the farmer sees it as
--       "the buyer says they paid", NOT as settled fact, with Confirm / Dispute;
--   (2) farmer confirms -> farmer_payment_ack = 'confirmed', and confirming a
--       second time is refused;
--   (3) farmer disputes with no reason -> refused; with a reason -> 'disputed'
--       and the buyer + admins are notified;
--   (4) farmer disputes a delivery the buyer NEVER marked paid -> allowed
--       (this is the common case: confirmed but never settled);
--   (5) a BUYER calling acknowledge_farmer_delivery_payment -> refused;
--   (6) a non-admin calling resolve_farmer_delivery_payment -> refused;
--   (7) admin resolves 'unpaid_confirmed' -> payment_status flips back to
--       'unpaid' and paid_at clears (a false "Paid" is reversible);
--   (8) admin resolves 'paid_confirmed' -> payment_status 'paid' and the
--       farmer's ack reads 'confirmed';
--  (10) an admin opens /admin/feedstock and sees the delivery, both parties'
--       names, and the dispute at the top of the list; a non-admin calling
--       admin_feedstock_deliveries is refused;
--  (11) reconcile_financials() still returns 0 rows -- nothing here is a ledger
--       movement, and that must remain visibly true.
--
-- ROLLBACK
--   Re-run the mark_farmer_delivery_paid block from
--   20260711000000_farmer_portal.sql FIRST -- this migration replaced it, and the
--   column drops below would otherwise leave it referencing columns that no
--   longer exist. Then:
--   drop function if exists public.acknowledge_farmer_delivery_payment(uuid, boolean, text);
--   drop function if exists public.resolve_farmer_delivery_payment(uuid, text, text);
--   drop function if exists public.admin_feedstock_deliveries(text, int);
--   drop function if exists public.admin_feedstock_summary();
--   drop index if exists public.idx_farmer_deliveries_payment_disputed;
--   alter table public.farmer_deliveries
--     drop column if exists farmer_payment_ack,
--     drop column if exists farmer_payment_ack_at,
--     drop column if exists farmer_payment_ack_note,
--     drop column if exists payment_resolution,
--     drop column if exists payment_resolution_note,
--     drop column if exists payment_resolved_at,
--     drop column if exists payment_resolved_by;
--   notify pgrst, 'reload schema';
-- ============================================================================
