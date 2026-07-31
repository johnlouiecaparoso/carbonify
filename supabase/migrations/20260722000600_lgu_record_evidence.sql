-- ============================================================================
-- Supporting evidence on LGU emissions records — role-needs #5.
--
-- An LGU self-reports tonnages that become City ESG claims and get exported as
-- a PDF for a council or DENR/CCC. Until now there was nowhere to attach the
-- hauler logs or MRF records those numbers come from, so the report asserted
-- figures with no way to show their basis.
--
-- Stored as base64 data URLs on the record itself, matching how MRV evidence
-- and project images already work in this codebase, rather than introducing a
-- storage bucket for a handful of small documents. `documents` is a JSON array
-- of { name, type, size, url, uploaded_at }.
--
-- No new table and no new policies: the evidence lives on lgu_emissions_records,
-- which is already owner-scoped for select/insert/update/delete
-- (20260604040000), so attaching a document inherits exactly the access rules
-- of the record it belongs to.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

do $$
begin
  if to_regclass('public.lgu_emissions_records') is null then
    raise notice 'lgu_emissions_records missing — skipping evidence column';
    return;
  end if;

  alter table public.lgu_emissions_records
    add column if not exists documents jsonb not null default '[]'::jsonb;

  -- Guard against a malformed write turning the column into something the UI
  -- would iterate over and crash on.
  if not exists (
    select 1 from pg_constraint where conname = 'lgu_records_documents_is_array'
  ) then
    alter table public.lgu_emissions_records
      add constraint lgu_records_documents_is_array
      check (jsonb_typeof(documents) = 'array');
  end if;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) attaching a PDF to a record persists it and it reappears after reload;
--   (2) the attachment opens from the records table;
--   (3) records created before this migration show an empty attachment list
--       rather than erroring;
--   (4) another LGU account cannot read your records (unchanged — the existing
--       owner-scoped policies still apply).
--
-- ROLLBACK
--   alter table public.lgu_emissions_records
--     drop constraint if exists lgu_records_documents_is_array;
--   alter table public.lgu_emissions_records drop column if exists documents;
--   notify pgrst, 'reload schema';
-- ============================================================================
