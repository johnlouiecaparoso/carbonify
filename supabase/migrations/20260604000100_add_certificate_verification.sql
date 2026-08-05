-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.verify_certificate_public()  ->  20260607000300_certificate_registry_fields.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- Public certificate verification: QR codes + tamper-evident signature.
--
-- Each issued certificate carries a QR code that points to /verify/<number>.
-- That page must work for anyone (a corporate buyer's auditor, a regulator)
-- WITHOUT logging in, but the certificates table is owner-restricted by RLS.
-- We therefore expose a SECURITY DEFINER RPC that returns only the safe,
-- non-PII fields needed to confirm a certificate is genuine.

-- 1) Ensure every column the verification function reads exists.
--    The certificates table schema varies across environments (some fields are
--    stored in the certificate_data JSONB instead of dedicated columns), so we
--    add any missing optional columns. ADD COLUMN IF NOT EXISTS is a no-op when
--    the column already exists, regardless of its current type.
alter table public.certificates
  add column if not exists certificate_type text;

alter table public.certificates
  add column if not exists project_category text;

alter table public.certificates
  add column if not exists project_location text;

alter table public.certificates
  add column if not exists beneficiary_name text;

alter table public.certificates
  add column if not exists vintage_year integer;

alter table public.certificates
  add column if not exists verification_standard text;

-- Tamper-evident signature columns.
alter table public.certificates
  add column if not exists signature_hash text;

alter table public.certificates
  add column if not exists signed_by uuid references public.profiles(id);

alter table public.certificates
  add column if not exists signed_at timestamptz;

-- 2) Public verification function. Returns a single row for a valid, active
--    certificate, or no rows if not found. Deliberately omits email, wallet
--    address, and payment reference. Columns are cast to the declared return
--    types so the function never fails on environments where a column has a
--    different underlying type.
create or replace function public.verify_certificate_public(p_certificate_number text)
returns table (
  certificate_number text,
  certificate_type text,
  project_title text,
  project_category text,
  project_location text,
  credits_quantity numeric,
  beneficiary_name text,
  vintage_year integer,
  verification_standard text,
  issued_at timestamptz,
  signed_at timestamptz,
  signature_hash text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    c.certificate_number::text,
    c.certificate_type::text,
    c.project_title::text,
    c.project_category::text,
    c.project_location::text,
    c.credits_quantity::numeric,
    c.beneficiary_name::text,
    c.vintage_year::integer,
    c.verification_standard::text,
    c.issued_at::timestamptz,
    c.signed_at::timestamptz,
    c.signature_hash::text,
    c.status::text
  from public.certificates c
  where c.certificate_number = p_certificate_number
    and coalesce(c.status, 'active') = 'active'
  limit 1;
$$;

-- Anyone (including anonymous visitors) may look up a certificate by its number.
grant execute on function public.verify_certificate_public(text) to anon;
grant execute on function public.verify_certificate_public(text) to authenticated;
