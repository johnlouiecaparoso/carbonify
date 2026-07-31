-- ============================================================================
-- Per-project verification timeline — let verifiers read the trail they create.
--
-- Closes docs/role-needs/03-verifier.md #4 ("show me every action, who, when").
-- The doc listed this as "audit exists, not surfaced". Two things were actually
-- in the way, and neither was the UI:
--
--   1. audit_logs is SELECT-able by ADMINS ONLY (20260326030100). A verifier
--      could write audit rows and never read one back, so a timeline built on
--      the table would have rendered empty for exactly the role that needs it.
--
--   2. projectApprovalService never wrote any audit rows in the first place.
--      Validate / reject / request-revision produced no audit trail at all,
--      despite the role doc claiming "everything is recorded in time-stamped
--      audit logs". That half is fixed in the service, not here.
--
-- This grants verifiers read access to PROJECT-SCOPED audit rows only. They get
-- no wider view of the log: payment, auth, KYC and role-change entries stay
-- admin-only. Scoping by resource_type is what keeps "see the history of the
-- thing I am reviewing" from becoming "read the whole audit log".
--
-- Policies are OR'd, so the existing admin policy is unaffected.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

do $$
begin
  if to_regclass('public.audit_logs') is null then
    raise notice 'audit_logs missing — skipping verifier read policy';
    return;
  end if;

  drop policy if exists "Verifiers can read project audit logs" on public.audit_logs;

  create policy "Verifiers can read project audit logs"
    on public.audit_logs
    for select
    to authenticated
    using (
      resource_type in ('projects', 'monitoring_reports')
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('verifier', 'admin')
      )
    );
end $$;

-- The timeline reads one project's history, newest first.
create index if not exists idx_audit_logs_resource
  on public.audit_logs (resource_type, resource_id, created_at desc);

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) a verifier opening a project sees its timeline populate after they
--       validate / reject / request revision / assign it;
--   (2) a verifier still CANNOT read audit rows with another resource_type
--       (e.g. 'payments') — select returns zero rows rather than erroring;
--   (3) an admin's existing full audit view is unchanged.
--
-- ROLLBACK
--   drop policy if exists "Verifiers can read project audit logs" on public.audit_logs;
--   drop index if exists public.idx_audit_logs_resource;
--   notify pgrst, 'reload schema';
-- ============================================================================
