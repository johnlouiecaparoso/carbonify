-- ============================================================================
-- Capture the money-table RLS posture into version control (backlog #13c).
--
-- WHY THIS EXISTS
--   The live database is correctly locked (verified 2026-07-20: reconcile = 0,
--   no client write policies on the money tables). But that posture lives ONLY
--   on the live DB and in the gated, out-of-band supabase/cutover/ script. The
--   SELECT policies on the four ledger tables (credit_ownership, wallet_accounts,
--   wallet_transactions, credit_transactions) appear in NO migration — those
--   tables predate version control. So a fresh env (staging / DR restore / local)
--   rebuilt from supabase/migrations/ does NOT reproduce the locked posture, and
--   the repo cannot *prove* the money tables are locked down. This migration is
--   that proof, made declarative and idempotent.
--
-- WHAT IT GUARANTEES (the security-critical, fully-verified part — uncommented)
--   For all 7 money tables:
--     * Row Level Security is ENABLED (not FORCED — the SECURITY DEFINER issuance
--       trigger and service_role RPCs must keep bypassing RLS, exactly as today).
--     * The three known client-writable holes closed by 20260718000800 stay dropped
--       (repeated here so a fresh env that inherited them from a live dump is clean).
--     * No new client INSERT/UPDATE/DELETE capability is introduced. Every money
--       write continues to flow only through:
--         - activate_validated_project_trigger (SECURITY DEFINER)  -> issuance
--         - process_marketplace_purchase / process_wallet_purchase (service_role)
--         - retire_credits_atomic (SECURITY DEFINER)               -> retirement
--         - seller-owned listing management (sellers_manage_own_listings)
--         - staff policies from earlier migrations
--
-- READ POSTURE — reconciled against the live pg_policies dump on 2026-07-25.
--   The §READ policies below now mirror the live SELECT posture exactly (the four
--   ledger tables predate version control, so live is the authority):
--     * credit_ownership / credit_transactions — own-row / party, plus staff.
--     * wallet_accounts — own-row, plus staff.
--     * wallet_transactions — scoped through account_id -> wallet_accounts (the
--       table has no reliable own user_id; this matches the live policy).
--     * project_credits — publicly readable (marketplace/registry inventory).
--     * credit_listings — active listings public; sellers see own; staff all.
--     * credit_retirements — own-row, plus staff (public registry reads go
--       through SECURITY DEFINER RPCs, not a direct table SELECT).
--   Live carries several redundant legacy SELECT policies for the same tables
--   (pre-VC cruft). They are harmless (RLS is permissive; each is equal-or-narrower)
--   and are intentionally NOT reproduced here — a fresh env rebuilds the single
--   canonical set below. Retiring the live duplicates is optional cleanup.
--
--   Verify the invariant any time with supabase/diagnostics/money_table_rls_audit.sql
--   (returns 0 rows when the posture is correct).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §RLS — enable on every money table. Idempotent; not FORCED (definer/service
-- role must bypass). Safe on live (already enabled) and required on a fresh env.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.credit_ownership      enable row level security;
alter table public.wallet_accounts       enable row level security;
alter table public.wallet_transactions   enable row level security;
alter table public.credit_transactions   enable row level security;
alter table public.project_credits        enable row level security;
alter table public.credit_listings        enable row level security;
alter table public.credit_retirements     enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- §WRITE-LOCKDOWN — re-assert that the three exploitable blanket/forgeable write
-- policies stay gone (mirrors 20260718000800 so a fresh env dumped from an older
-- live snapshot is also clean). drop-if-exists is a no-op when already absent.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Allow all project credits operations"  on public.project_credits;
drop policy if exists "Allow all credit listings operations"  on public.credit_listings;
drop policy if exists "Users can insert their own retirements" on public.credit_retirements;

-- Preserve the one legitimate client write that 20260718000800 (re)introduced:
-- a project owner or admin may DELETE their pool rows (project deletion). DELETE
-- is not a mint vector. Idempotent.
drop policy if exists "project_credits_owner_or_admin_delete" on public.project_credits;
create policy "project_credits_owner_or_admin_delete" on public.project_credits
  for delete to authenticated
  using (
    is_admin(auth.uid())
    or project_id in (select id from public.projects where user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- §READ — the canonical SELECT posture, reconciled against the live dump
-- (2026-07-25). Canonical names are prefixed "money_rls_" so they never collide
-- with the redundant legacy policies live still carries. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- credit_ownership — a user reads the credits they own; staff read all.
drop policy if exists "money_rls_credit_ownership_read_own" on public.credit_ownership;
create policy "money_rls_credit_ownership_read_own" on public.credit_ownership
  for select to authenticated
  using (user_id = auth.uid() or is_admin(auth.uid()) or is_verifier(auth.uid()));

-- wallet_accounts — a user reads their own wallet; staff read all.
drop policy if exists "money_rls_wallet_accounts_read_own" on public.wallet_accounts;
create policy "money_rls_wallet_accounts_read_own" on public.wallet_accounts
  for select to authenticated
  using (user_id = auth.uid() or is_admin(auth.uid()));

-- wallet_transactions — scoped through the owning wallet account (the table has
-- no reliable own user_id column; this mirrors the live policy exactly). Staff all.
drop policy if exists "money_rls_wallet_transactions_read_own" on public.wallet_transactions;
create policy "money_rls_wallet_transactions_read_own" on public.wallet_transactions
  for select to authenticated
  using (
    account_id in (select id from public.wallet_accounts where user_id = auth.uid())
    or is_admin(auth.uid())
  );

-- credit_transactions — either party to a trade reads it; staff read all.
drop policy if exists "money_rls_credit_transactions_read_party" on public.credit_transactions;
create policy "money_rls_credit_transactions_read_party" on public.credit_transactions
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or is_admin(auth.uid()) or is_verifier(auth.uid()));

-- credit_retirements — own-row + staff. The PUBLIC registry does NOT read this
-- table directly (it goes through SECURITY DEFINER RPCs), so this stays private.
drop policy if exists "money_rls_credit_retirements_read_own" on public.credit_retirements;
create policy "money_rls_credit_retirements_read_own" on public.credit_retirements
  for select to authenticated
  using (user_id = auth.uid() or is_admin(auth.uid()));

-- project_credits — publicly readable inventory (marketplace + registry show pool
-- availability to anyone). Matches live's "Anyone can view project credits".
drop policy if exists "money_rls_project_credits_read_public" on public.project_credits;
create policy "money_rls_project_credits_read_public" on public.project_credits
  for select to anon, authenticated
  using (true);

-- credit_listings — active listings are public (marketplace browse); a seller sees
-- their own regardless of status; staff see all. Tighter than live's stray `true`
-- SELECT policy, which is legacy cruft — this is the intended posture.
drop policy if exists "money_rls_credit_listings_read" on public.credit_listings;
create policy "money_rls_credit_listings_read" on public.credit_listings
  for select to anon, authenticated
  using (
    status::text = 'active'
    or seller_id = auth.uid()
    or is_admin(auth.uid())
  );

notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK — only the §READ additions are removable; the write-lockdown must
-- never be rolled back on live. To drop the added reads:
--   drop policy if exists "money_rls_credit_ownership_read_own"      on public.credit_ownership;
--   drop policy if exists "money_rls_wallet_accounts_read_own"       on public.wallet_accounts;
--   drop policy if exists "money_rls_wallet_transactions_read_own"   on public.wallet_transactions;
--   drop policy if exists "money_rls_credit_transactions_read_party" on public.credit_transactions;
--   drop policy if exists "money_rls_credit_retirements_read_own"    on public.credit_retirements;
--   drop policy if exists "money_rls_project_credits_read_public"    on public.project_credits;
--   drop policy if exists "money_rls_credit_listings_read"           on public.credit_listings;
--   notify pgrst, 'reload schema';
-- ============================================================================
