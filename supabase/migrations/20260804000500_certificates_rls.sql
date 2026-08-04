-- ============================================================================
-- Put RLS on public.certificates.
--
-- ⚠️ GATED — RUN THE §PRE-FLIGHT QUERY BELOW FIRST, THEN APPLY. Same handling as
--    20260725000200: this changes the access posture of a live table that the
--    browser writes to directly, so it wants a look before it wants a run.
--
-- WHAT IS WRONG TODAY
--   `certificates` predates version control. It appears in nine migrations, all
--   of them `alter table ... add column`, and 20260718001000 rebuilds it for a
--   fresh environment with `create table if not exists`. Not one of them enables
--   row level security, and there is no policy on it anywhere in this repo.
--   RLS is off by default on a newly created table, so an environment rebuilt
--   from supabase/migrations/ has a completely open certificates table.
--
--   That table is not incidental. It holds `user_id`, `beneficiary_name`,
--   `beneficiary_email`, `wallet_address`, `payment_reference`, `transaction_id`
--   and `credits_quantity` — and the browser INSERTs and UPDATEs it directly
--   (certificateService.js: generateCreditCertificate, signCertificateRecord,
--   attachCreditSerial, attachRegistryInfo). With no RLS that means any
--   authenticated user can read every other user's certificates AND overwrite
--   them: change a beneficiary, change a quantity, or void one by setting
--   status. For a carbon registry the certificate is the artifact the whole
--   product is trusted on.
--
--   Note this is invisible to supabase/diagnostics/money_table_rls_audit.sql:
--   certificates is not in its money_tables list, and its finding (A) only
--   inspects INSERT/UPDATE/DELETE/ALL policies, so an over-permissive SELECT
--   posture would not be flagged even if it were.
--
-- WHAT THIS DOES
--   Enables RLS and adds the same owner-scoped posture the money tables got in
--   20260725000100:
--     * read   — your own certificates; staff (admin/verifier) read all.
--     * insert — only with your own user_id.
--     * update — only your own rows.
--   No delete policy: nothing in the app deletes a certificate, and a registry
--   artifact should not be client-deletable.
--
--   The PUBLIC verification page is unaffected. /verify goes through
--   verify_certificate_public(text), which is SECURITY DEFINER and granted to
--   anon — it bypasses RLS by design and returns a fixed, non-personal column
--   list. This migration does NOT add an anon policy, so the table itself stays
--   private and the RPC remains the only public window onto it.
--
--   Server-side writers are unaffected: the fulfillment saga and the settlement
--   RPCs run as service_role or SECURITY DEFINER and bypass RLS.
--
-- Every certificate read in the app is already owner-scoped — by user_id, by
-- certificate id fetched from the user's own row, or by transaction/retirement
-- ids taken from the caller's own purchases (transactionHistoryService,
-- marketplaceService, PaymentCallbackView) — so these policies should not
-- narrow anything that currently works.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §PRE-FLIGHT — run this FIRST and read the result before applying.
--
--   select c.relrowsecurity as rls_enabled,
--          (select count(*) from pg_policies p
--            where p.schemaname = 'public' and p.tablename = 'certificates') as policy_count
--     from pg_class c
--    where c.relname = 'certificates' and c.relnamespace = 'public'::regnamespace;
--
--   select policyname, cmd, roles, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'certificates';
--
-- Expected before applying: rls_enabled = false, policy_count = 0 — the posture
-- this migration exists to fix.
--
-- If rls_enabled is already TRUE and policies exist, live is ahead of the repo:
-- read those policies before running this, because enabling RLS is not the
-- change you need and the names below may not be the ones in force.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.certificates enable row level security;

-- Read: owner + staff. Deliberately no anon policy — see the header.
--
-- Uses is_verifier_or_admin() (20260615000100) rather than the
-- is_admin(uuid) / is_verifier(uuid) single-argument forms that
-- 20260718000800 and 20260725000100 call. Those two are NOT defined in any
-- tracked migration — they exist only on the live database — so those
-- migrations cannot be replayed into a fresh environment as-is. This one
-- deliberately does not add to that debt.
drop policy if exists "certificates_read_own" on public.certificates;
create policy "certificates_read_own" on public.certificates
  for select to authenticated
  using (user_id = auth.uid() or public.is_verifier_or_admin());

-- Insert: only for yourself. Stops a caller minting a certificate in someone
-- else's name (or with someone else's transaction attached).
drop policy if exists "certificates_insert_own" on public.certificates;
create policy "certificates_insert_own" on public.certificates
  for insert to authenticated
  with check (user_id = auth.uid());

-- Update: only your own rows, and you may not reassign them to someone else.
-- The client needs this for signing and for attaching the credit serial /
-- registry info after issuance.
drop policy if exists "certificates_update_own" on public.certificates;
create policy "certificates_update_own" on public.certificates
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) buy credits -> the purchase certificate is still created, signed, and
--       appears on /certificates;
--   (2) retire credits -> the retirement certificate is still created and shows
--       on the retirement history;
--   (3) the PUBLIC /verify page still resolves a certificate number while
--       signed OUT (this proves verify_certificate_public is doing the work,
--       not a table read);
--   (4) signed in as a DIFFERENT user, GET
--       /rest/v1/certificates?select=* returns only your own rows, and a PATCH
--       against another user's certificate id changes nothing (0 rows);
--   (5) the fulfillment saga can still attach registry_serial (service_role).
--
-- ROLLBACK
--   drop policy if exists "certificates_read_own"   on public.certificates;
--   drop policy if exists "certificates_insert_own" on public.certificates;
--   drop policy if exists "certificates_update_own" on public.certificates;
--   alter table public.certificates disable row level security;
--   notify pgrst, 'reload schema';
-- ============================================================================
