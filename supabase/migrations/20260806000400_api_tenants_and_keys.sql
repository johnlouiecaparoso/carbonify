-- ============================================================================
-- White-label MRV/API — tenants, keys, scopes, and a rate limit that bites.
--
-- WHAT WAS THERE BEFORE
--   `supabase/functions/public-registry` — a read-only JSON view of validated
--   projects, open to the whole internet, with this written in its own header:
--
--       "No API-key gating or rate limiting yet. Add both (an `api_keys` table +
--        a per-key quota) before advertising this as a paid/white-label product."
--
--   That note was the honest description of a scaffold. This file is the thing it
--   asked for. Until now "white-label MRV/API solutions" was a revenue stream with
--   no product behind it: nothing to sell, nothing to meter, nothing to bill.
--
-- THE THREE THINGS A SELLABLE API NEEDS, AND HOW EACH IS DONE HERE
--
--   1. IDENTITY — who is calling.
--      A key belongs to a tenant. The raw key is shown EXACTLY ONCE, at creation,
--      and never stored: the table holds a SHA-256 digest and a display prefix.
--      A database dump therefore does not hand anyone a working credential, and
--      "please resend our key" is correctly answered with "we'll issue a new one".
--
--   2. AUTHORITY — what they may call.
--      Scopes, not a boolean. `registry:read` is public data behind a key;
--      `mrv:read` is aggregate monitoring data and is a different commercial
--      product. A tenant that pays for one must not silently receive the other,
--      and that separation has to exist before the first contract, not after.
--
--   3. A METER — how much they may call.
--      Per-key requests-per-minute, enforced through the existing
--      `check_rate_limit` (20260704000000) rather than a second limiter with its
--      own bugs. The limit is a per-key COLUMN because it is a price tier.
--
-- BRANDING
--   Tenant branding is data, not a deployment. `display_name`, `logo_url`,
--   `primary_color` and `support_email` travel in the API response, so one
--   deployment serves a partner-branded front-end without a fork. The alternative
--   — a build per partner — multiplies every future fix by the customer count.
--
-- WHAT IS DELIBERATELY NOT HERE
--   No writes. Every scope in this file is read-only. A partner cannot create a
--   project, submit an MRV report, or issue a credit through the API. Write
--   scopes are a much larger surface (idempotency, authorship, audit attribution)
--   and inventing them speculatively would be inventing an attack surface.
--
-- Additive. Idempotent. Nothing existing is redefined.
-- ============================================================================

begin;

-- ── 1. Tenants ──────────────────────────────────────────────────────────────
create table if not exists public.api_tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null,
  -- Branding. All optional: an unbranded tenant renders as Carbonify, which is
  -- the correct default for an integration partner who is not white-labelling.
  display_name text,
  logo_url text,
  primary_color text,
  support_email text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. Keys ─────────────────────────────────────────────────────────────────
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.api_tenants(id) on delete cascade,
  label text,
  -- Shown in the dashboard so a human can tell two keys apart. Not a secret and
  -- not sufficient to authenticate.
  key_prefix text not null,
  -- SHA-256 of the full key. The key itself is never written anywhere.
  key_hash text not null unique,
  scopes text[] not null default array['registry:read']::text[],
  rate_limit_per_min integer not null default 60 check (rate_limit_per_min > 0),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_tenant on public.api_keys (tenant_id, created_at desc);
-- Authentication looks a key up by hash on every single request; this index is
-- the difference between a constant-time lookup and a table scan per call.
create index if not exists idx_api_keys_hash on public.api_keys (key_hash);

alter table public.api_tenants enable row level security;
alter table public.api_keys enable row level security;

-- Admin-only, read-only, for both. Writes go through the SECURITY DEFINER
-- functions below so that key creation always hashes and never stores a secret —
-- a direct insert policy would make it possible to store a key in the clear.
drop policy if exists "api_tenants admin read" on public.api_tenants;
create policy "api_tenants admin read"
  on public.api_tenants for select using (public.is_admin());

drop policy if exists "api_keys admin read" on public.api_keys;
create policy "api_keys admin read"
  on public.api_keys for select using (public.is_admin());

-- ── 3. Tenant management (admin) ────────────────────────────────────────────
create or replace function public.upsert_api_tenant(
  p_slug text,
  p_name text,
  p_display_name text default null,
  p_logo_url text default null,
  p_primary_color text default null,
  p_support_email text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;
  if coalesce(btrim(p_slug), '') = '' or coalesce(btrim(p_name), '') = '' then
    raise exception 'a slug and a name are required';
  end if;

  insert into public.api_tenants (
    slug, name, display_name, logo_url, primary_color, support_email, active, created_by
  ) values (
    lower(btrim(p_slug)), btrim(p_name), nullif(btrim(coalesce(p_display_name, '')), ''),
    nullif(btrim(coalesce(p_logo_url, '')), ''), nullif(btrim(coalesce(p_primary_color, '')), ''),
    nullif(btrim(coalesce(p_support_email, '')), ''), coalesce(p_active, true), auth.uid()
  )
  on conflict (slug) do update
    set name = excluded.name,
        display_name = excluded.display_name,
        logo_url = excluded.logo_url,
        primary_color = excluded.primary_color,
        support_email = excluded.support_email,
        active = excluded.active,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ── 4. Issuing a key ────────────────────────────────────────────────────────
-- Returns the raw key. This is the ONLY moment it exists anywhere; the table
-- stores a digest. Losing it means rotating it, which is the correct trade: a
-- retrievable key is a key that leaks through every log, backup and screenshot
-- that ever touches it.
create or replace function public.create_api_key(
  p_tenant_id uuid,
  p_label text default null,
  p_scopes text[] default array['registry:read']::text[],
  p_rate_limit_per_min integer default 60,
  p_expires_at timestamptz default null
)
returns table(key_id uuid, api_key text, key_prefix text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw text;
  v_prefix text;
  v_scopes text[];
  v_id uuid;
  v_allowed constant text[] := array['registry:read', 'mrv:read', 'certificates:read'];
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;
  if not exists (select 1 from public.api_tenants where id = p_tenant_id) then
    raise exception 'tenant % not found', p_tenant_id;
  end if;

  v_scopes := coalesce(p_scopes, array['registry:read']::text[]);
  if array_length(v_scopes, 1) is null then
    raise exception 'at least one scope is required';
  end if;
  -- An unknown scope is refused rather than ignored. Silently dropping it would
  -- issue a key that the buyer believes grants something it does not.
  if exists (select 1 from unnest(v_scopes) s where s <> all (v_allowed)) then
    raise exception 'unknown scope; allowed: %', array_to_string(v_allowed, ', ');
  end if;

  -- 256 bits from two gen_random_uuid() draws. Deliberately not pgcrypto's
  -- gen_random_bytes: that needs an extension this database does not require,
  -- and an extension that has to be enabled before a key can be issued is an
  -- outage waiting for the day somebody restores into a clean project.
  v_raw := 'ck_live_' || replace(gen_random_uuid()::text, '-', '')
                      || replace(gen_random_uuid()::text, '-', '');
  v_prefix := left(v_raw, 16);

  insert into public.api_keys (
    tenant_id, label, key_prefix, key_hash, scopes, rate_limit_per_min, expires_at, created_by
  ) values (
    p_tenant_id,
    nullif(btrim(coalesce(p_label, '')), ''),
    v_prefix,
    encode(sha256(convert_to(v_raw, 'utf8')), 'hex'),
    v_scopes,
    greatest(coalesce(p_rate_limit_per_min, 60), 1),
    p_expires_at,
    auth.uid()
  )
  returning id into v_id;

  return query select v_id, v_raw, v_prefix;
end;
$$;

create or replace function public.revoke_api_key(p_key_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;

  -- Revocation is a timestamp, not a delete: the usage history of a key that was
  -- withdrawn is exactly the history somebody will want to read later.
  update public.api_keys
     set revoked_at = now()
   where id = p_key_id and revoked_at is null;

  return found;
end;
$$;

-- ── 5. Authenticating a call ────────────────────────────────────────────────
-- service_role only — it is called by the edge function, never from a browser.
-- Takes the RAW key and hashes it here, so the caller never has to implement the
-- digest and two implementations cannot drift apart.
--
-- Returns no row for absent / revoked / expired / inactive-tenant keys. One
-- indistinguishable outcome for all four: a caller learning that a key exists
-- but is expired is a caller learning that the key exists.
create or replace function public.authenticate_api_key(p_key text)
returns table(
  key_id uuid,
  tenant_id uuid,
  tenant_slug text,
  tenant_name text,
  display_name text,
  logo_url text,
  primary_color text,
  support_email text,
  scopes text[],
  rate_limit_per_min integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_key_id uuid;
begin
  if p_key is null or btrim(p_key) = '' then
    return;
  end if;

  v_hash := encode(sha256(convert_to(btrim(p_key), 'utf8')), 'hex');

  select k.id into v_key_id
    from public.api_keys k
    join public.api_tenants t on t.id = k.tenant_id
   where k.key_hash = v_hash
     and k.revoked_at is null
     and (k.expires_at is null or k.expires_at > now())
     and t.active;

  if v_key_id is null then
    return;
  end if;

  -- Best-effort touch. A write failure here must not fail an otherwise valid
  -- request — last_used_at is telemetry, not authorization.
  begin
    update public.api_keys set last_used_at = now() where id = v_key_id;
  exception when others then
    null;
  end;

  return query
    select k.id, t.id, t.slug, t.name, t.display_name, t.logo_url, t.primary_color,
           t.support_email, k.scopes, k.rate_limit_per_min
      from public.api_keys k
      join public.api_tenants t on t.id = k.tenant_id
     where k.id = v_key_id;
end;
$$;

-- ── 6. The one partner data product that is not already public ──────────────
-- Aggregate MRV for a validated project: issued, retired, and the avoided/removed
-- split. Aggregates only — no counterparty, no price, no per-transaction row.
-- Unvalidated projects return nothing at all, which is the same answer the public
-- registry gives, so a key does not widen what is visible, only what is queryable.
create or replace function public.api_project_mrv_summary(p_project_id uuid)
returns table(
  project_id uuid,
  title text,
  category text,
  methodology text,
  development_status text,
  credits_issued numeric,
  credits_retired numeric,
  co2_removed numeric,
  co2_avoided numeric,
  reports_approved integer,
  last_report_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.category,
    p.methodology,
    p.development_status,
    coalesce((select sum(v.approved_quantity) from public.verified_emission_reductions v
               where v.project_id = p.id and v.status = 'approved'), 0),
    coalesce((select sum(r.quantity) from public.credit_retirements r
               where r.project_id = p.id), 0),
    -- 'removal' / 'avoidance' are the values migration 20260715000000 defines.
    -- A VER approved before that migration has a NULL type and is counted in
    -- neither bucket — so removed + avoided can be less than issued, and that
    -- gap is honest. Retro-guessing a type nobody asserted would publish a
    -- classification the verifier never made, through an API a partner may
    -- reasonably treat as authoritative.
    coalesce((select sum(v.approved_quantity) from public.verified_emission_reductions v
               where v.project_id = p.id and v.status = 'approved'
                 and v.reduction_type = 'removal'), 0),
    coalesce((select sum(v.approved_quantity) from public.verified_emission_reductions v
               where v.project_id = p.id and v.status = 'approved'
                 and v.reduction_type = 'avoidance'), 0),
    (select count(*)::integer from public.monitoring_reports m
      where m.project_id = p.id and m.status = 'approved'),
    (select max(m.reviewed_at) from public.monitoring_reports m
      where m.project_id = p.id and m.status = 'approved')
  from public.projects p
  where p.id = p_project_id
    and p.status = 'validated';
$$;

commit;

-- ── 7. Grants ───────────────────────────────────────────────────────────────
-- authenticate_api_key and api_project_mrv_summary are service_role only: they
-- are the metered product. Reaching them from a browser would be free access to
-- the thing being sold, and authenticate_api_key would additionally become an
-- oracle for testing guessed keys.
revoke all on function public.authenticate_api_key(text) from public, anon, authenticated;
grant execute on function public.authenticate_api_key(text) to service_role;

revoke all on function public.api_project_mrv_summary(uuid) from public, anon, authenticated;
grant execute on function public.api_project_mrv_summary(uuid) to service_role;

revoke all on function public.create_api_key(uuid, text, text[], integer, timestamptz) from public, anon;
grant execute on function public.create_api_key(uuid, text, text[], integer, timestamptz) to authenticated, service_role;

revoke all on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.revoke_api_key(uuid) to authenticated, service_role;

revoke all on function public.upsert_api_tenant(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.upsert_api_tenant(text, text, text, text, text, text, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select 'both tables exist with RLS on' as check,
--        case when count(*) = 2 then 'PASS' else 'FAIL' end as verdict
--   from pg_tables
--  where schemaname = 'public' and tablename in ('api_tenants', 'api_keys') and rowsecurity
-- union all
-- select 'no client write policy on either table',
--        case when bool_or(cmd <> 'SELECT') then 'FAIL' else 'PASS' end
--   from pg_policies where tablename in ('api_tenants', 'api_keys')
-- union all
-- select 'authenticate_api_key is NOT reachable from a browser',
--        case when has_function_privilege('anon', p.oid, 'EXECUTE')
--               or has_function_privilege('authenticated', p.oid, 'EXECUTE')
--             then 'FAIL' else 'PASS' end
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'authenticate_api_key'
-- union all
-- select 'mrv summary is NOT reachable from a browser',
--        case when has_function_privilege('anon', p.oid, 'EXECUTE')
--               or has_function_privilege('authenticated', p.oid, 'EXECUTE')
--             then 'FAIL' else 'PASS' end
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'api_project_mrv_summary';
--
-- BEHAVIOURAL CHECK, as an admin:
--   select public.upsert_api_tenant('acme-energy', 'Acme Energy', 'Acme Carbon Registry');
--   select * from public.create_api_key(
--     (select id from public.api_tenants where slug = 'acme-energy'),
--     'Sandbox', array['registry:read','mrv:read'], 60, null);
--   -- copy the api_key column; it is not retrievable again.
--   curl -H "Authorization: Bearer ck_live_..." \
--        "https://YOUR_PROJECT.functions.supabase.co/public-registry?stats=1"
--   -> 200, and the payload carries a `tenant` block with the branding.
--   curl "https://.../public-registry?stats=1"          -> 200, no tenant block.
--   curl -H "Authorization: Bearer ck_live_wrong" "..." -> 401.
--   select public.revoke_api_key('<key_id>'); then retry -> 401.
--   Hammer past rate_limit_per_min within a minute            -> 429.
--   A key WITHOUT 'mrv:read' calling ?mrv=<project_id>        -> 403.
--
-- ROLLBACK
--   drop function if exists public.authenticate_api_key(text);
--   drop function if exists public.api_project_mrv_summary(uuid);
--   drop function if exists public.create_api_key(uuid, text, text[], integer, timestamptz);
--   drop function if exists public.revoke_api_key(uuid);
--   drop function if exists public.upsert_api_tenant(text, text, text, text, text, text, boolean);
--   drop table if exists public.api_keys;
--   drop table if exists public.api_tenants;
-- ============================================================================
