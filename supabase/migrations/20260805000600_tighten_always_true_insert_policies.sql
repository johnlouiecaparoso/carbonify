-- ============================================================================
-- audit_logs / email_logs / receipts: retire the "System can insert …" policies.
--
-- WHAT IS WRONG TODAY
--   Three tables carry an INSERT policy with WITH CHECK (true), applying to
--   every role:
--     public.audit_logs   "System can insert audit logs"
--     public.email_logs   "System can insert email logs"
--     public.receipts     "System can insert receipts"
--
--   "System can insert" is the intent; "anyone at all can insert" is the
--   effect. WITH CHECK (true) does not distinguish a server from a stranger —
--   service_role bypasses RLS entirely and never needed a policy to do this.
--
--   Verified on live 2026-08-05, SIGNED OUT with the anon key, using empty-body
--   inserts that cannot create a row. All three reached a NOT NULL constraint
--   (23502), which is only reachable after the policy has already said yes:
--     audit_logs -> null value in column "action"
--     email_logs -> null value in column "email_type"
--     receipts   -> null value in column "transaction_id"
--   Compare wallet_accounts / credit_ownership / ledger_entries, which return
--   42501 at the policy for the identical request.
--
--   Why it matters, in order of seriousness:
--     * receipts is a financial artifact. A forged receipt row is a claim that
--       a payment happened. Anonymous forgery of it is a money-integrity bug.
--     * audit_logs is the record you would reconstruct an incident from. If
--       anyone can write to it, it proves nothing — and a poisoned audit trail
--       is worse than no audit trail, because it is trusted.
--     * email_logs is the mildest: log noise and a delivery-stats skew.
--
-- WHAT THIS DOES
--   audit_logs — INSERT restricted to authenticated, and only attributed to
--     yourself (user_id = auth.uid()). Callers: auditService.logUserAction,
--     which already sets user_id from the session.
--
--     This deliberately does NOT allow user_id IS NULL. auditService.
--     logSystemEvent inserts with user_id: null, and permitting that would let
--     any signed-in user forge unattributed "system" events, which is most of
--     the value of the hole. Checked before removing it: logSystemEvent has NO
--     production callers — the only references in src/ are vi.fn() mocks in
--     authFlowSignals.test.js and authService.test.js. Nothing real stops
--     working.
--
--     Client-side audit logging remains inherently self-asserted: a caller can
--     still write a truthful-looking row about their own actions. This closes
--     anonymous and cross-user forgery, not that. The genuine fix is
--     server-side capture, which auditService.js:70-73 already calls out for
--     pre-auth events. DEFERRED_BACKLOG #42.
--
--   email_logs — INSERT policy dropped with no client replacement. `email_logs`
--     appears nowhere in src/ or supabase/functions/; its only writer is
--     public.log_email_sent(), which is SECURITY DEFINER and so executes as its
--     owner and bypasses RLS. No client has ever needed to write this table.
--
--   receipts — INSERT restricted to a party to the transaction, or staff.
--     receiptService.js:311 inserts with buyer_id and seller_id taken from the
--     transaction row it just read, so a real buyer passes on buyer_id.
--
--   No SELECT, UPDATE or DELETE policy is touched on any of the three. The
--   advisor did not flag those and changing read scope is a different kind of
--   change with a different blast radius.
--
-- FRESH-ENVIRONMENT NOTE
--   `receipts` and `email_logs` are created by no tracked migration (only
--   audit_logs is, in 20260326030100). This file therefore targets live, and
--   replaying it into an environment rebuilt from supabase/migrations/ alone
--   will fail on a missing table. That is DEFERRED_BACKLOG #16, not a defect
--   introduced here — 20260624000000 and 20260626000400 already alter untracked
--   tables the same way. Left plain rather than guarded so the failure is loud
--   and points at the real gap.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §PRE-FLIGHT — run this FIRST.
--
--   select tablename, policyname, cmd, roles, qual, with_check
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('audit_logs', 'email_logs', 'receipts')
--    order by tablename, cmd, policyname;
--
-- Expected: the three "System can insert …" rows with with_check = true, plus
-- whatever SELECT policies exist (left alone).
--
-- If receipts has NO other INSERT policy and your fulfillment path writes
-- receipts from the browser as a user who is neither buyer nor seller, the
-- policy below will reject it — check §AFTER APPLYING test (2) before you
-- assume the migration is safe in your environment.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── audit_logs ──────────────────────────────────────────────────────────────
alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_insert_own" on public.audit_logs;
create policy "audit_logs_insert_own" on public.audit_logs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "System can insert audit logs" on public.audit_logs;

-- ── email_logs ──────────────────────────────────────────────────────────────
-- No replacement policy on purpose: the only writer is a SECURITY DEFINER
-- function, which does not consult RLS.
alter table public.email_logs enable row level security;

drop policy if exists "System can insert email logs" on public.email_logs;

-- ── receipts ────────────────────────────────────────────────────────────────
alter table public.receipts enable row level security;

drop policy if exists "receipts_insert_party" on public.receipts;
create policy "receipts_insert_party" on public.receipts
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or public.is_verifier_or_admin()
  );

drop policy if exists "System can insert receipts" on public.receipts;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--
--   (1) SIGNED OUT, anon key, empty-body insert into each of the three:
--         expected 42501 "new row violates row-level security policy".
--         Before this migration all three returned 23502.
--
--   (2) Complete a purchase end to end as a real buyer. The receipt must still
--       be created and must still open from the transaction history. This is
--       the one that can break — receipts are written from the browser.
--
--   (3) Sign in, do something audited (submit a project), and confirm a row
--       still lands in audit_logs with your user_id.
--
--   (4) The project audit trail on the verifier screen
--       (verificationService.getProjectAuditTrail) still renders — it reads,
--       and no read policy changed.
--
-- ROLLBACK (restores the vulnerable state):
--   create policy "System can insert audit logs" on public.audit_logs
--     for insert with check (true);
--   create policy "System can insert email logs" on public.email_logs
--     for insert with check (true);
--   create policy "System can insert receipts" on public.receipts
--     for insert with check (true);
-- ============================================================================
