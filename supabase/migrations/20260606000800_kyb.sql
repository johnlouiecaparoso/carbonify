-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.request_payout()  ->  20260804000400_payout_suspension_and_idempotency_scope.sql
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
      select 'request_payout — recover by re-applying 20260804000400_payout_suspension_and_idempotency_scope.sql' as msg
       where exists (
         select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'request_payout'
            and pg_get_functiondef(p.oid) like '%assert_not_suspended%')
  ) t;

  if v_blocked is not null
     and coalesce(current_setting('carbonify.allow_superseded_replay', true), '') <> 'yes'
  then
    raise exception using
      errcode = 'raise_exception',
      message = 'REFUSING TO RUN 20260606000800_kyb.sql — a NEWER definition is already live and this file would silently revert it',
      detail  = v_blocked,
      hint    = 'Nothing has been changed. To replay anyway: set carbonify.allow_superseded_replay = ''yes''; then re-run this file AND re-apply every file named above.';
  end if;
end
$carbonify_replay_guard$;

-- Phase 2.5 — KYB (Know Your Business): seller business verification.
--
-- Mirrors the KYC flow (20260604020200) but for the entity being paid out.
-- A seller must be KYB-verified before they can withdraw earnings — enforced by
-- updating request_payout below.

alter table public.profiles add column if not exists kyb_verified boolean not null default false;

create table if not exists public.kyb_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_name text not null,
  business_type text,                     -- sole_prop | partnership | corporation | cooperative
  registration_number text,               -- SEC / DTI / CDA registration no.
  tax_id text,                             -- BIR TIN
  business_address text,
  authorized_representative text,
  registration_document_url text,
  tax_document_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_kyb_user on public.kyb_applications(user_id);
create index if not exists idx_kyb_status on public.kyb_applications(status);

alter table public.kyb_applications enable row level security;

drop policy if exists kyb_select on public.kyb_applications;
create policy kyb_select on public.kyb_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists kyb_insert on public.kyb_applications;
create policy kyb_insert on public.kyb_applications
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists kyb_update on public.kyb_applications;
create policy kyb_update on public.kyb_applications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admin review: approve/reject; on approve, flag the seller KYB-verified.
create or replace function public.review_kyb_application(
  p_application_id uuid,
  p_approve boolean,
  p_notes text default ''
)
returns public.kyb_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.kyb_applications;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can review KYB applications';
  end if;

  update public.kyb_applications
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = p_notes
  where id = p_application_id
  returning * into v_app;

  if v_app.id is null then
    raise exception 'KYB application not found';
  end if;

  update public.profiles set kyb_verified = p_approve where id = v_app.user_id;
  return v_app;
end;
$$;

grant execute on function public.review_kyb_application(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Gate payouts on KYB: redefine request_payout to require kyb_verified.
-- (Supersedes the version in 20260606000700.)
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
  if not coalesce((select kyb_verified from public.profiles where id = v_seller), false) then
    raise exception 'business verification (KYB) is required before withdrawing';
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

  if p_idempotency_key is not null then
    select id into v_existing from public.payout_requests where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

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

  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description) values
    (v_entry, 'seller_payable:' || v_seller::text, 'debit', p_amount, 'PHP', 'payout_request', v_payout_id::text, 'Payout reserved'),
    (v_entry, 'payout_pending:' || v_seller::text, 'credit', p_amount, 'PHP', 'payout_request', v_payout_id::text, 'Payout pending');

  return v_payout_id;
end;
$$;

revoke all on function public.request_payout(numeric, jsonb, text) from public, anon;
grant execute on function public.request_payout(numeric, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
