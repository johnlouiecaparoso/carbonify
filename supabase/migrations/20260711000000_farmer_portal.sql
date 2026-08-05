-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.confirm_farmer_delivery()  ->  20260717000000_farmer_carbon_participation.sql
--   public.mark_farmer_delivery_paid()  ->  20260729000100_feedstock_payment_record.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- ============================================================================
-- Farmer Portal — expansion feature #6.
--
-- Introduces the `farmer` role and the smallholder supply side of the biomass
-- chain (#3). A farmer registers plantation parcels, then logs feedstock
-- deliveries against an ACCEPTED biomass RFQ; the buyer confirms receipt and
-- marks it paid. Payment here is RECORD-KEEPING ONLY — it deliberately does not
-- touch `ledger_entries` / `escrow_holds` / `payout_requests`, so the proven
-- money path (reconcile_financials() = 0) is untouched by this feature.
--
--   farm_parcels      — a farmer's plantation/parcel register (crop, area, GPS).
--   farmer_deliveries — a delivery of feedstock against an accepted RFQ, with
--                       proof photos, buyer confirmation, and payment status.
--
-- Deliveries are always tied to an accepted RFQ, so `buyer_id` is derived
-- server-side from the RFQ rather than trusted from the client, and no farmer
-- needs to browse the user table to pick a buyer.
--
-- ALL writes to farmer_deliveries go through SECURITY DEFINER RPCs (no INSERT /
-- UPDATE policy) so neither party can rewrite the other's fields — same shape as
-- the biomass RFQ RPCs.
--
-- Also widens the two role gates so `farmer` is assignable + applyable:
--   • assign_user_role()               — added 'farmer' to the allow-list.
--   • role_applications.role_requested — CHECK now admits 'farmer'.
--   • notify_role_application_trigger()  — farmer applications notify admins.
--
-- Additive + idempotent + drift-safe. Safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1) Plantation / parcel register -------------------------------------------
create table if not exists public.farm_parcels (
  id                    uuid primary key default gen_random_uuid(),
  farmer_id             uuid not null references public.profiles(id) on delete cascade,
  name                  text not null,
  crop_type             text not null,
  area_hectares         numeric check (area_hectares is null or area_hectares >= 0),
  expected_yield_tonnes numeric check (expected_yield_tonnes is null or expected_yield_tonnes >= 0),
  location              text,
  region                text,
  latitude              numeric check (latitude is null or (latitude between -90 and 90)),
  longitude             numeric check (longitude is null or (longitude between -180 and 180)),
  planted_on            date,
  notes                 text,
  status                text not null default 'active'
                        check (status in ('active', 'fallow', 'retired')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_farm_parcels_farmer
  on public.farm_parcels (farmer_id, created_at desc);

-- 2) Feedstock deliveries + payment tracking ---------------------------------
create table if not exists public.farmer_deliveries (
  id                uuid primary key default gen_random_uuid(),
  rfq_id            uuid not null references public.biomass_rfqs(id) on delete cascade,
  parcel_id         uuid references public.farm_parcels(id) on delete set null,
  farmer_id         uuid not null references public.profiles(id) on delete cascade,
  buyer_id          uuid not null references public.profiles(id) on delete cascade,
  quantity          numeric not null check (quantity > 0),
  unit              text not null default 'tonnes',
  delivered_on      date not null default current_date,
  price_per_unit    numeric check (price_per_unit is null or price_per_unit >= 0),
  total_amount      numeric check (total_amount is null or total_amount >= 0),
  currency          text not null default 'PHP',
  proof_docs        jsonb not null default '[]'::jsonb,
  note              text,
  status            text not null default 'pending'
                    check (status in ('pending', 'confirmed', 'rejected')),
  confirmed_at      timestamptz,
  decision_note     text,
  payment_status    text not null default 'unpaid'
                    check (payment_status in ('unpaid', 'paid')),
  paid_at           timestamptz,
  payment_reference text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_farmer_deliveries_farmer
  on public.farmer_deliveries (farmer_id, created_at desc);
create index if not exists idx_farmer_deliveries_buyer
  on public.farmer_deliveries (buyer_id, created_at desc);
create index if not exists idx_farmer_deliveries_rfq
  on public.farmer_deliveries (rfq_id);

-- 3) RLS ---------------------------------------------------------------------
alter table public.farm_parcels enable row level security;

-- A parcel is private to its farmer (admins can read for support/audit).
drop policy if exists "farm_parcels owner select" on public.farm_parcels;
create policy "farm_parcels owner select"
  on public.farm_parcels for select
  using (farmer_id = auth.uid() or public.is_admin());

drop policy if exists "farm_parcels owner insert" on public.farm_parcels;
create policy "farm_parcels owner insert"
  on public.farm_parcels for insert
  with check (farmer_id = auth.uid());

drop policy if exists "farm_parcels owner update" on public.farm_parcels;
create policy "farm_parcels owner update"
  on public.farm_parcels for update
  using (farmer_id = auth.uid())
  with check (farmer_id = auth.uid());

drop policy if exists "farm_parcels owner delete" on public.farm_parcels;
create policy "farm_parcels owner delete"
  on public.farm_parcels for delete
  using (farmer_id = auth.uid() or public.is_admin());

alter table public.farmer_deliveries enable row level security;

-- Both parties (and admin) read a delivery.
drop policy if exists "farmer_deliveries party select" on public.farmer_deliveries;
create policy "farmer_deliveries party select"
  on public.farmer_deliveries for select
  using (farmer_id = auth.uid() or buyer_id = auth.uid() or public.is_admin());

-- Intentionally NO insert/update/delete policy: every write goes through the
-- SECURITY DEFINER RPCs below, which self-guard on auth.uid(). This is what
-- stops a farmer from marking their own delivery paid.

-- 4) Write RPCs --------------------------------------------------------------

-- Farmer logs a delivery against one of their ACCEPTED RFQs. `buyer_id` is taken
-- from the RFQ, never from the client. Falls back to the RFQ's quoted price when
-- no explicit price is supplied.
create or replace function public.record_farmer_delivery(
  p_rfq_id uuid,
  p_quantity numeric,
  p_unit text default null,
  p_delivered_on date default null,
  p_parcel_id uuid default null,
  p_price_per_unit numeric default null,
  p_proof_docs jsonb default '[]'::jsonb,
  p_note text default null
) returns public.farmer_deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rfq      public.biomass_rfqs;
  v_delivery public.farmer_deliveries;
  v_price    numeric;
begin
  select * into v_rfq from public.biomass_rfqs where id = p_rfq_id;
  if not found then raise exception 'Request not found'; end if;
  if v_rfq.seller_id <> auth.uid() then
    raise exception 'Only the supplier can record a delivery for this request';
  end if;
  if v_rfq.status <> 'accepted' then
    raise exception 'Deliveries can only be recorded against an accepted quote';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a delivered quantity greater than zero';
  end if;
  if p_price_per_unit is not null and p_price_per_unit < 0 then
    raise exception 'Price cannot be negative';
  end if;

  -- A parcel, if given, must belong to the farmer recording the delivery.
  if p_parcel_id is not null and not exists (
    select 1 from public.farm_parcels
     where id = p_parcel_id and farmer_id = auth.uid()
  ) then
    raise exception 'That parcel does not belong to you';
  end if;

  v_price := coalesce(p_price_per_unit, v_rfq.quoted_price_per_unit);

  insert into public.farmer_deliveries (
    rfq_id, parcel_id, farmer_id, buyer_id,
    quantity, unit, delivered_on,
    price_per_unit, total_amount, proof_docs, note
  ) values (
    p_rfq_id,
    p_parcel_id,
    auth.uid(),
    v_rfq.buyer_id,
    p_quantity,
    coalesce(nullif(btrim(p_unit), ''), v_rfq.unit, 'tonnes'),
    coalesce(p_delivered_on, current_date),
    v_price,
    case when v_price is null then null else round(v_price * p_quantity, 2) end,
    coalesce(p_proof_docs, '[]'::jsonb),
    nullif(btrim(p_note), '')
  )
  returning * into v_delivery;

  return v_delivery;
end;
$$;
revoke all on function public.record_farmer_delivery(uuid, numeric, text, date, uuid, numeric, jsonb, text) from public, anon;
grant execute on function public.record_farmer_delivery(uuid, numeric, text, date, uuid, numeric, jsonb, text) to authenticated;

-- Buyer confirms (or rejects) receipt of a pending delivery.
create or replace function public.confirm_farmer_delivery(
  p_delivery_id uuid,
  p_accept boolean,
  p_note text default null
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
    raise exception 'Only the buyer can confirm this delivery';
  end if;
  if v_delivery.status <> 'pending' then
    raise exception 'This delivery has already been reviewed';
  end if;

  update public.farmer_deliveries
     set status        = case when p_accept then 'confirmed' else 'rejected' end,
         confirmed_at  = now(),
         decision_note = nullif(btrim(p_note), ''),
         updated_at    = now()
   where id = p_delivery_id
   returning * into v_delivery;
  return v_delivery;
end;
$$;
revoke all on function public.confirm_farmer_delivery(uuid, boolean, text) from public, anon;
grant execute on function public.confirm_farmer_delivery(uuid, boolean, text) to authenticated;

-- Buyer records that a confirmed delivery has been paid for (off-platform
-- settlement; this is a bookkeeping flag, not a ledger movement).
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
         updated_at        = now()
   where id = p_delivery_id
   returning * into v_delivery;
  return v_delivery;
end;
$$;
revoke all on function public.mark_farmer_delivery_paid(uuid, text) from public, anon;
grant execute on function public.mark_farmer_delivery_paid(uuid, text) to authenticated;

-- 5) Widen the role gates so `farmer` is assignable ---------------------------
-- `profiles.role` has no CHECK constraint; the effective server-side allow-list
-- is this RPC. Re-created verbatim from 20260326020100 with 'farmer' added.
create or replace function public.assign_user_role(
  target_user_id uuid,
  target_role text,
  target_email text default null,
  target_full_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewer_role text;
  normalized_role text;
  auth_email text;
  auth_full_name text;
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to assign roles.';
  end if;

  select lower(trim(role))
  into reviewer_role
  from public.profiles
  where id = auth.uid();

  if reviewer_role is null then
    raise exception 'Reviewer profile not found.';
  end if;

  normalized_role := lower(trim(coalesce(target_role, '')));

  if normalized_role not in ('general_user', 'buyer_investor', 'project_developer', 'verifier', 'farmer') then
    raise exception 'Invalid target role.';
  end if;

  if reviewer_role = 'verifier' and normalized_role <> 'project_developer' then
    raise exception 'Verifiers can only assign the project_developer role.';
  end if;

  if reviewer_role not in ('admin', 'verifier') then
    raise exception 'You are not allowed to assign roles.';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    select
      au.email,
      coalesce(
        au.raw_user_meta_data ->> 'full_name',
        au.raw_user_meta_data ->> 'name'
      )
    into auth_email, auth_full_name
    from auth.users au
    where au.id = target_user_id;

    insert into public.profiles (
      id, full_name, email, role, company, location, bio, kyc_level, avatar_url, phone, website
    )
    values (
      target_user_id,
      coalesce(nullif(trim(target_full_name), ''), nullif(trim(auth_full_name), ''), 'User'),
      coalesce(nullif(trim(target_email), ''), nullif(trim(auth_email), ''), ''),
      normalized_role,
      '', '', '', 0, null, '', ''
    );
  else
    update public.profiles
    set
      role = normalized_role,
      email = case
        when coalesce(trim(email), '') = '' and coalesce(trim(target_email), '') <> '' then trim(target_email)
        else email
      end,
      full_name = case
        when coalesce(trim(full_name), '') = '' and coalesce(trim(target_full_name), '') <> '' then trim(target_full_name)
        else full_name
      end
    where id = target_user_id;
  end if;

  select * into updated_profile from public.profiles where id = target_user_id;
  return updated_profile;
end;
$$;

revoke all on function public.assign_user_role(uuid, text, text, text) from public;
grant execute on function public.assign_user_role(uuid, text, text, text) to authenticated;

-- 6) Let `farmer` be applied for via /apply -----------------------------------
do $$
begin
  if to_regclass('public.role_applications') is not null then
    alter table public.role_applications
      drop constraint if exists role_applications_role_requested_check;
    alter table public.role_applications
      add constraint role_applications_role_requested_check
      check (role_requested in ('project_developer', 'verifier', 'farmer'));
  end if;
end $$;

-- Farmer applications notify admins (developers → verifiers, verifiers → admins).
-- Re-creates the existing trigger function in place; the trigger binding
-- (trg_notify_role_application, from 20260402002000) is unchanged.
create or replace function public.notify_role_application_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role text;
  v_role_label text;
  v_recipient_role text[];
  v_link text;
begin
  v_requested_role := public.canonicalize_notification_role(new.role_requested);

  if v_requested_role not in ('verifier', 'project_developer', 'farmer') then
    return new;
  end if;

  v_role_label := case v_requested_role
                    when 'verifier' then 'Verifier'
                    when 'farmer' then 'Farmer'
                    else 'Project Developer'
                  end;
  v_recipient_role := case when v_requested_role = 'project_developer'
                           then array['verifier'] else array['admin'] end;
  v_link := case when v_requested_role = 'project_developer' then '/verifier' else '/admin' end;

  insert into public.system_notifications (
    user_id, type, title, message, link, metadata, is_read
  )
  select
    recipient.user_id,
    'role_application_submission',
    format('New %s application', v_role_label),
    format('%s submitted a %s application for review.', coalesce(new.applicant_full_name, new.email, 'A new applicant'), v_role_label),
    v_link,
    jsonb_build_object(
      'application_id', new.id,
      'requested_role', new.role_requested,
      'applicant_email', new.email
    ),
    false
  from public.resolve_notification_recipient_ids(
    null,
    v_recipient_role,
    array[new.user_id]
  ) as recipient;

  return new;
end;
$$;

comment on table public.farm_parcels is
  'Farmer plantation/parcel register (expansion #6). Private to the owning farmer.';
comment on table public.farmer_deliveries is
  'Feedstock deliveries against an accepted biomass RFQ (expansion #6). Payment status is bookkeeping only — no ledger movement.';

notify pgrst, 'reload schema';
