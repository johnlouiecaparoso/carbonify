-- ============================================================================
-- Adopt mint-on-VER as the single issuance path.  🔒 GATED — read before running
--
-- Closes backlog #17. Deliberately NOT in supabase/migrations/, so that
-- `supabase db push` cannot apply it ahead of its preconditions — same reason
-- lockdown_financial_writes.sql was kept out-of-band.
--
-- ── WHAT IS WRONG TODAY ─────────────────────────────────────────────────────
-- Two triggers can mint credits and both are live:
--
--   trg_activate_validated_project      fires when a project becomes 'validated'
--                                       → creates a credit pool AND an active
--                                         marketplace listing
--   trg_mint_credits_on_ver_approval    fires when a VER is approved
--                                       → mints credits for verified reductions
--
-- So validating a project issues credits, and then approving a monitoring
-- report against that same project issues them AGAIN. For a registry that is
-- the cardinal error: the same tonne issued, listed and sellable twice.
--
-- ── WHY MINT-ON-VER, AND WHY THIS IS A RESTORATION NOT A CHOICE ─────────────
-- The history shows the current state is an accident:
--
--   20260604010100_decouple_issuance_mint_on_ver.sql
--       dropped trg_activate_validated_project and created
--       trg_mint_credits_on_ver_approval. Deliberate — it is what the file is
--       named and what it exists to do.
--
--   20260626000500_fix_credit_pool_availability.sql
--       re-created trg_activate_validated_project. But that file's subject is
--       the credits_available / available_credits column drift; its header is
--       "write the column the app actually reads" and it does not discuss
--       issuance models anywhere. The trigger came back as a side effect of
--       redefining the function to keep both columns in sync.
--
-- Nothing ever dropped the VER trigger, so both have been live since.
--
-- On the merits it is also not close. Validation means "this project is
-- legitimate and may proceed"; verification means "these reductions actually
-- happened". Issuing at validation sells credits for reductions nobody has
-- measured yet — which is what the entire MRV module exists to prevent, and
-- what forward sales (offtake agreements) already handle properly.
--
-- ── PRECONDITIONS ───────────────────────────────────────────────────────────
--   1. Run supabase/diagnostics/issuance_model_audit.sql FIRST.
--   2. If it returns (B) or (C) rows, STOP. Those projects already hold more
--      issued credits than were verified, and (C) means a buyer holds some.
--      Reconcile that first — this script prevents new double issuance, it does
--      not repair old.
--   3. Expect a product change: a validated project will NO LONGER appear on
--      the marketplace by itself. It reaches the marketplace when its first
--      monitoring report is approved. Existing pools and listings are untouched.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

begin;

-- 1) Retire the validation-time issuance path.
--    The FUNCTION is intentionally left in place: dropping it would break the
--    rollback below, and an orphaned function mints nothing on its own.
drop trigger if exists trg_activate_validated_project on public.projects;

-- 2) Guarantee the VER path is actually present. It should already exist
--    (20260604010100, columns fixed by 20260718000900) but after this script
--    it is the ONLY way a credit can come into existence, so assert it rather
--    than assume it.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_mint_credits_on_ver_approval' and not tgisinternal
  ) then
    raise exception
      'trg_mint_credits_on_ver_approval is missing. Apply 20260604010100 and '
      '20260718000900 before this script, or no credit can ever be issued.';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgname = 'trg_mint_credits_on_ver_approval'
      and not tgisinternal
      and tgenabled = 'D'
  ) then
    raise exception
      'trg_mint_credits_on_ver_approval exists but is DISABLED. Enable it '
      'before running this, or no credit can ever be issued.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY
--   Re-run supabase/diagnostics/issuance_model_audit.sql — check (A) should
--   fall silent, leaving exactly one enabled issuance trigger.
--
--   Then, end to end: validate a project (expect NO pool and NO listing), file
--   and approve a monitoring report against it (expect the pool, the listing,
--   and credits equal to the approved VER quantity).
--
-- ROLLBACK
--   drop trigger if exists trg_activate_validated_project on public.projects;
--   create trigger trg_activate_validated_project
--     after update of status on public.projects
--     for each row execute function public.activate_validated_project_trigger();
--   notify pgrst, 'reload schema';
--
--   Restores the accidental both-triggers state, including its double-issuance
--   behaviour. Only do this if adopting mint-on-VER is being abandoned, and if
--   so, close #17 the other way instead — by dropping the VER trigger — rather
--   than leaving both live.
-- ============================================================================
