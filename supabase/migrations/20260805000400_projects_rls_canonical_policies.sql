-- ============================================================================
-- public.projects: replace the always-true policy with a canonical policy set.
--
-- ⚠️ GATED — RUN THE §PRE-FLIGHT QUERY BELOW FIRST, THEN APPLY. This is the
--    highest-impact change in the 2026-08-05 advisor sweep and it is the only
--    one that can break a working user flow if live differs from what was
--    measured. Read the pre-flight output before running it.
--
-- WHAT IS WRONG TODAY
--   Live carries a policy on public.projects named "Allow all project
--   operations", for ALL commands, with USING (true) AND WITH CHECK (true),
--   applying to every role (pg_policies.roles = '-'). It predates version
--   control and no migration in this repo creates or drops it.
--
--   RLS policies are PERMISSIVE and OR together. One USING(true) policy
--   therefore makes every other policy on the table irrelevant — including the
--   careful owner/staff set added by 20260624000000_projects_rls_owner_and_staff,
--   which has been dead on live since the day it was applied.
--
--   Measured against live on 2026-08-05 with the anon (publishable) key, signed
--   out, using empty-body inserts that cannot create a row:
--
--     POST /rest/v1/projects        {}  -> 23502 null value in column "user_id"
--     POST /rest/v1/wallet_accounts {}  -> 42501 violates row-level security
--     POST /rest/v1/credit_ownership{}  -> 42501 violates row-level security
--     POST /rest/v1/credit_listings {}  -> 42501 violates row-level security
--     POST /rest/v1/ledger_entries  {}  -> 42501 violates row-level security
--
--   The four money tables reject the request AT the policy. `projects` gets
--   past the policy and dies on a NOT NULL constraint — which is only reachable
--   once RLS has already said yes. PATCH and DELETE against an impossible id
--   filter returned 204, so the table-level grants are there too.
--
--   In plain terms: an anonymous visitor holding the publishable key — which
--   ships in the browser bundle and is not a secret — can insert projects,
--   rewrite the title/status/price of any existing project, and delete every
--   row in the table. For a carbon registry, projects are the artifact the
--   credits derive from.
--
-- WHAT THIS DOES
--   Establishes the complete, self-contained policy set for the table and THEN
--   drops the permissive one, in a single transaction, so there is no window in
--   which the table is locked with no replacement in force. The set is written
--   out in full rather than relying on 20260624000000 having taken effect,
--   because on live it demonstrably has not.
--
--     select — PUBLIC, unchanged (see the note below).
--     insert — authenticated, only with your own user_id.
--     update — owner while the submission is still editable; admin/verifier any.
--     delete — owner while still editable; admin any; verifier if not validated.
--
--   The update/delete rules are reproduced verbatim from 20260624000000. That
--   file stays in the repo as the origin of the rules; this one makes them
--   actually apply.
--
--   THE INSERT POLICY IS NEW AND IS NOT OPTIONAL. 20260624000000 defines only
--   UPDATE and DELETE. Today INSERT works solely because the always-true policy
--   covers it, so dropping that policy without adding this one would break
--   project submission completely.
--
-- WHY SELECT STAYS PUBLIC
--   Anon reads all 7 rows on live today. Every marketplace, registry and
--   project-detail page depends on reading projects while signed out, and the
--   Supabase linter deliberately excludes SELECT USING(true) because it is a
--   normal public-read pattern. Keeping it identical holds this migration's
--   blast radius to WRITES, which is what the finding is about.
--
--   It does mean draft projects stay publicly readable, which contradicts the
--   "a draft is the developer's private workspace" comment in
--   projectWorkflowService.js. That is a real question and a separate change of
--   a different shape (it narrows reads, so it can empty a screen). Logged as
--   DEFERRED_BACKLOG #41 rather than smuggled in here.
--
-- WHAT WILL STOP WORKING, DELIBERATELY
--   * A signed-out caller can no longer write to this table at all. Intended.
--   * A signed-in caller can no longer create a project owned by someone else.
--     Both writers (projectService.createProject, projectWorkflowService.
--     submitProject) set user_id from getCurrentUserId(), so both are fine.
--   * LOCALHOST DEV MOCK SESSIONS WILL FAIL TO SUBMIT A PROJECT. The test
--     account logins install a session Supabase never sees, so auth.uid() is
--     null and `user_id = auth.uid()` cannot pass. Project submission on
--     localhost currently works only because of the always-true policy. Use a
--     real Supabase session to test submission after this.
--   * Server paths are unaffected: service_role and SECURITY DEFINER functions
--     bypass RLS.
--
-- FRESH-ENVIRONMENT NOTE
--   public.projects is created by no tracked migration, so like 20260624000000
--   before it this file targets live and will fail on a fresh rebuild for want
--   of the table. DEFERRED_BACKLOG #16, unchanged by this migration.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §PRE-FLIGHT — run this FIRST and read the result before applying.
--
--   select policyname, cmd, roles, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'projects'
--    order by cmd, policyname;
--
-- Expected: a row named "Allow all project operations" with cmd = ALL,
-- qual = true, with_check = true. That is the row this migration removes.
--
-- READ THE OTHER ROWS TOO. If any OTHER policy on this table is also
-- unrestricted (qual = true on UPDATE/DELETE, or with_check = true on INSERT),
-- dropping only the named one leaves the hole open — permissive policies OR
-- together. Add a matching drop below before applying.
--
-- If "Allow all project operations" is NOT present, live has already changed:
-- stop and re-run the advisor before applying anything.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.projects enable row level security;

-- ── Public read ─────────────────────────────────────────────────────────────
-- Unchanged behaviour, made explicit so a fresh environment reproduces it
-- instead of inheriting it from the policy this migration drops.
drop policy if exists "projects_public_read" on public.projects;
create policy "projects_public_read" on public.projects
  for select
  using (true);

-- ── Owner insert (NEW — nothing else grants INSERT once the ALL policy goes) ─
drop policy if exists "projects_owner_insert" on public.projects;
create policy "projects_owner_insert" on public.projects
  for insert to authenticated
  with check (user_id = auth.uid());

-- ── Project developer: edit own submission while still editable ─────────────
-- Reproduced from 20260624000000.
drop policy if exists "projects_owner_update_editable" on public.projects;
create policy "projects_owner_update_editable" on public.projects
  for update to authenticated
  using (
    user_id = auth.uid()
    and coalesce(status, 'pending') in ('draft', 'pending', 'submitted', 'needs_revision')
  )
  with check (
    user_id = auth.uid()
    and coalesce(status, 'pending') in ('draft', 'pending', 'submitted', 'needs_revision')
  );

-- ── Project developer: delete own submission while still editable ───────────
drop policy if exists "projects_owner_delete_editable" on public.projects;
create policy "projects_owner_delete_editable" on public.projects
  for delete to authenticated
  using (
    user_id = auth.uid()
    and coalesce(status, 'pending') in ('draft', 'pending', 'submitted', 'needs_revision')
  );

-- ── Verifier / Admin: update any project ────────────────────────────────────
drop policy if exists "projects_staff_update" on public.projects;
create policy "projects_staff_update" on public.projects
  for update to authenticated
  using (
    public.canonicalize_notification_role(public.current_user_role()) in ('admin', 'verifier')
  )
  with check (
    public.canonicalize_notification_role(public.current_user_role()) in ('admin', 'verifier')
  );

-- ── Verifier / Admin: delete projects ───────────────────────────────────────
drop policy if exists "projects_staff_delete" on public.projects;
create policy "projects_staff_delete" on public.projects
  for delete to authenticated
  using (
    public.canonicalize_notification_role(public.current_user_role()) = 'admin'
    or (
      public.canonicalize_notification_role(public.current_user_role()) = 'verifier'
      and coalesce(status, 'pending') <> 'validated'
    )
  );

-- ── The actual fix ──────────────────────────────────────────────────────────
-- Last, and inside the same transaction as the replacements above.
drop policy if exists "Allow all project operations" on public.projects;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST — the first one is the proof, the rest are the guard.
--
--   (1) SIGNED OUT, with the anon key, an empty-body insert must now be
--       rejected by the POLICY, not by a column constraint:
--         curl -X POST "$URL/rest/v1/projects" \
--              -H "apikey: $ANON" -H "Content-Type: application/json" -d '{}'
--       Expected: 42501 "new row violates row-level security policy".
--       If you still see 23502, another always-true policy is in force —
--       go back to the pre-flight query.
--
--   (2) Signed out, the marketplace and /registry still list projects.
--   (3) A project developer with a REAL session can still submit a project,
--       and still edit and delete their own pending submission.
--   (4) A developer cannot edit a project that has been validated.
--   (5) A verifier can still approve/reject from the review queue.
--   (6) An admin can still delete a project.
--
-- ROLLBACK (restores the vulnerable state — only if something above fails):
--   create policy "Allow all project operations" on public.projects
--     for all using (true) with check (true);
-- ============================================================================
