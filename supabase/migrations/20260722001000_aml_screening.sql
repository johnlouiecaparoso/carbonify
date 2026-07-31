-- ============================================================================
-- AML screening — sanctions / PEP checks with a retained evidence trail.
--
-- Closes the last red item on role-needs/04-admin.md (#6, AML half). KYC and
-- KYB captured identity documents and an admin approved them, but nothing was
-- ever checked against a sanctions or PEP list, and nothing recorded that a
-- check had happened. Under the AMLA a covered institution must both SCREEN and
-- RETAIN EVIDENCE that it screened; the second half is what an examiner asks
-- for, and there was no table capable of answering.
--
-- WHAT THIS IS, PLAINLY
-- A screening RECORD-KEEPING and REVIEW system with a pluggable matcher, plus a
-- locally-maintained list so it is functional on day one. It is NOT a
-- substitute for a commercial screening provider (ComplyAdvantage, Dow Jones,
-- Refinitiv): those maintain and version global lists continuously, resolve
-- aliases and transliteration, and carry adverse-media coverage that a local
-- table cannot. `list_source` and `list_version` exist on every screening row
-- precisely so that, when a provider is adopted, its results drop into the same
-- evidence trail and historic screenings stay interpretable.
--
-- WHY THE SUBJECT CANNOT SEE THESE ROWS
-- Both tables are admin-only, including SELECT. Telling someone they matched a
-- sanctions list — or that their file is under review — is tipping off, which
-- AML regimes generally prohibit and which would defeat the point of screening.
-- This is deliberately NOT the pattern used elsewhere in this codebase, where
-- the owner can usually read their own rows.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

-- ── The list being screened against ─────────────────────────────────────────
create table if not exists public.aml_watchlist_entries (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  aliases      text[] not null default '{}',
  entry_type   text not null default 'sanction'
                 check (entry_type in ('sanction', 'pep', 'adverse_media')),
  -- Where this entry came from: 'UN Consolidated', 'AMLC', 'OFAC SDN',
  -- 'manual', or a provider name once one is adopted.
  list_source  text not null default 'manual',
  country      text,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  added_by     uuid references public.profiles(id) on delete set null
);

create index if not exists idx_aml_watchlist_active
  on public.aml_watchlist_entries (is_active) where is_active = true;

-- ── Evidence that a screening happened, and what it found ───────────────────
create table if not exists public.aml_screenings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  kyc_application_id  uuid references public.kyc_applications(id) on delete set null,
  screened_name       text not null,
  status              text not null default 'clear'
                        check (status in ('clear', 'potential_match', 'confirmed_match', 'cleared_after_review')),
  match_count         int not null default 0,
  -- The matches as they stood AT SCREENING TIME. Denormalised on purpose: the
  -- watchlist changes, and an examiner asks what you saw then, not now.
  matches             jsonb not null default '[]'::jsonb,
  list_source         text,
  list_version        text,
  screened_at         timestamptz not null default now(),
  reviewed_by         uuid references public.profiles(id) on delete set null,
  reviewed_at         timestamptz,
  review_notes        text
);

create index if not exists idx_aml_screenings_user
  on public.aml_screenings (user_id, screened_at desc);
create index if not exists idx_aml_screenings_open
  on public.aml_screenings (status) where status in ('potential_match', 'confirmed_match');

alter table public.aml_watchlist_entries enable row level security;
alter table public.aml_screenings        enable row level security;

-- Admin-only, INCLUDING select — see the tipping-off note in the header.
drop policy if exists aml_watchlist_admin on public.aml_watchlist_entries;
create policy aml_watchlist_admin on public.aml_watchlist_entries
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists aml_screenings_admin on public.aml_screenings;
create policy aml_screenings_admin on public.aml_screenings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Record a screening result ───────────────────────────────────────────────
create or replace function public.record_aml_screening(
  p_user_id            uuid,
  p_screened_name      text,
  p_status             text,
  p_matches            jsonb default '[]'::jsonb,
  p_kyc_application_id uuid default null,
  p_list_source        text default 'manual',
  p_list_version       text default null
)
returns public.aml_screenings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.aml_screenings;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can record AML screenings'
      using errcode = 'insufficient_privilege';
  end if;
  if p_user_id is null then
    raise exception 'A subject is required';
  end if;
  if p_status not in ('clear', 'potential_match', 'confirmed_match', 'cleared_after_review') then
    raise exception 'Invalid screening status';
  end if;

  insert into public.aml_screenings (
    user_id, kyc_application_id, screened_name, status, match_count,
    matches, list_source, list_version
  ) values (
    p_user_id, p_kyc_application_id, coalesce(btrim(p_screened_name), ''), p_status,
    coalesce(jsonb_array_length(p_matches), 0),
    coalesce(p_matches, '[]'::jsonb), p_list_source, p_list_version
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ── Adjudicate a match ──────────────────────────────────────────────────────
create or replace function public.review_aml_screening(
  p_id     uuid,
  p_status text,
  p_notes  text default null
)
returns public.aml_screenings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.aml_screenings;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can review AML screenings'
      using errcode = 'insufficient_privilege';
  end if;

  -- A reviewer may only close a match out, or escalate it. 'clear' is a
  -- SCREENING outcome (the matcher found nothing), never a review outcome --
  -- conflating them would let a human decision masquerade as an automated pass
  -- in the evidence trail.
  if p_status not in ('confirmed_match', 'cleared_after_review') then
    raise exception 'Review outcome must be confirmed_match or cleared_after_review';
  end if;

  -- Both outcomes are judgements a regulator may question later, so both have
  -- to carry the reviewer's reasoning.
  if coalesce(btrim(p_notes), '') = '' then
    raise exception 'A review decision must include notes';
  end if;

  update public.aml_screenings
     set status       = p_status,
         review_notes = btrim(p_notes),
         reviewed_by  = auth.uid(),
         reviewed_at  = now()
   where id = p_id
   returning * into v_row;

  if not found then
    raise exception 'Screening not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.record_aml_screening(uuid, text, text, jsonb, uuid, text, text) from public, anon;
grant execute on function public.record_aml_screening(uuid, text, text, jsonb, uuid, text, text) to authenticated;
revoke all on function public.review_aml_screening(uuid, text, text) from public, anon;
grant execute on function public.review_aml_screening(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) an admin can add a watchlist entry and screen a KYC applicant against it;
--   (2) a matching name produces a 'potential_match' screening with the match
--       details stored on the row;
--   (3) a non-matching name produces a 'clear' screening -- the evidence that a
--       check happened, which is the half that was missing;
--   (4) reviewing without notes is refused, and 'clear' is refused as a review
--       outcome;
--   (5) a NON-admin cannot read aml_screenings at all, including their own row;
--   (6) editing the watchlist afterwards does not change what a past screening
--       recorded.
--
-- ROLLBACK
--   drop function if exists public.review_aml_screening(uuid, text, text);
--   drop function if exists public.record_aml_screening(uuid, text, text, jsonb, uuid, text, text);
--   drop table if exists public.aml_screenings;
--   drop table if exists public.aml_watchlist_entries;
--   notify pgrst, 'reload schema';
-- ============================================================================
