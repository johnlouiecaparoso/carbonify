-- ============================================================================
-- Evidence integrity — geotag, capture time, and duplicate detection.
--
-- Closes docs/role-needs/03-verifier.md #8, the last item on that page about
-- catching fraud rather than throughput. A verifier reviewing MRV photos could
-- see the image and nothing else: no capture date, no location, and no way to
-- know the same photo had already been submitted against a different report or
-- a different reporting period.
--
-- WHAT IS STORED, AND WHY IT IS CAPTURED AT UPLOAD
-- Evidence is held as a base64 data URL in file_url, so the original bytes —
-- including the EXIF block — survive intact. The metadata is nevertheless
-- extracted once, at upload, rather than parsed on every review: it makes
-- duplicate detection an indexed lookup instead of a scan-and-hash of every
-- row, and it records what the file said WHEN IT ARRIVED, which is the honest
-- thing to attest to later.
--
--   content_hash  SHA-256 of the decoded bytes. Identical bytes = identical
--                 hash, which is what "this photo was submitted before" means.
--   captured_at   EXIF DateTimeOriginal, when present.
--   gps_lat/lng   EXIF GPS, when present.
--   exif_status   'present' | 'absent' | 'unreadable'. Deliberately three
--                 states and NOT a boolean: a photo whose EXIF was stripped is
--                 a different fact from one this platform could not parse, and
--                 both differ from a row that predates this migration (null).
--
-- Absent EXIF is NOT treated as evidence of wrongdoing anywhere in the UI.
-- Messaging apps, screenshots and privacy settings all strip it routinely. It
-- is surfaced as an absence for the verifier to weigh, not as an accusation.
--
-- Nullable throughout: every existing row keeps its data and simply reports
-- "not analysed" rather than being back-filled with guesses.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

do $$
begin
  if to_regclass('public.monitoring_evidence') is null then
    raise notice 'monitoring_evidence missing — skipping evidence integrity columns';
    return;
  end if;

  alter table public.monitoring_evidence add column if not exists content_hash text;
  alter table public.monitoring_evidence add column if not exists captured_at timestamptz;
  alter table public.monitoring_evidence add column if not exists gps_lat numeric;
  alter table public.monitoring_evidence add column if not exists gps_lng numeric;
  alter table public.monitoring_evidence add column if not exists exif_status text;

  if not exists (
    select 1 from pg_constraint where conname = 'monitoring_evidence_exif_status_check'
  ) then
    alter table public.monitoring_evidence
      add constraint monitoring_evidence_exif_status_check
      check (exif_status is null or exif_status in ('present', 'absent', 'unreadable'));
  end if;

  -- Duplicate lookup is "find other evidence with this hash", so index the hash
  -- for rows that have one.
  create index if not exists idx_monitoring_evidence_hash
    on public.monitoring_evidence (content_hash)
    where content_hash is not null;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) uploading a geotagged JPEG records captured_at + gps and shows the
--       coordinates to the verifier;
--   (2) uploading the SAME file to a second report flags a duplicate on both,
--       naming the other report;
--   (3) uploading a screenshot (no EXIF) records exif_status='absent' and is
--       described as missing metadata, not as suspicious;
--   (4) evidence uploaded before this migration still renders, reporting
--       "not analysed".
--
-- ROLLBACK
--   drop index if exists public.idx_monitoring_evidence_hash;
--   alter table public.monitoring_evidence
--     drop constraint if exists monitoring_evidence_exif_status_check;
--   alter table public.monitoring_evidence
--     drop column if exists content_hash,
--     drop column if exists captured_at,
--     drop column if exists gps_lat,
--     drop column if exists gps_lng,
--     drop column if exists exif_status;
--   notify pgrst, 'reload schema';
-- ============================================================================
