-- ============================================================================
-- Make the profiles column-privilege lockdown re-runnable without re-opening
-- holes. Supersedes 20260703000300_harden_profiles_role_kyc.sql.
--
-- WHY THIS EXISTS — the previous migration is a landmine
--   20260703000300 revokes table-level UPDATE from `authenticated` and re-grants
--   it column by column, excluding an ALLOW-LIST of exactly two names:
--   `role` and `kyc_level`. Its own header then says "Re-run after adding new
--   profile columns."
--
--   Following that instruction today silently undoes two later security fixes,
--   because every column NOT named in those two exclusions gets UPDATE granted:
--     * `kyb_verified` — revoked by 20260709000000 precisely to stop users
--       self-approving business verification. request_payout() gates on this
--       column, so re-granting it lets any user self-verify and withdraw.
--     * `is_active` / `suspended_at` / `suspended_by` / `suspension_reason` —
--       added by 20260722000800. Granting UPDATE on `is_active` lets a
--       suspended user un-suspend themselves with a single PATCH.
--
--   NOT re-running it is also wrong, in the opposite direction: a column-level
--   grant does not extend to columns added later, so every profile column added
--   after 2026-07-03 is UNWRITABLE by its own owner. That is not theoretical —
--     * `municipality` / `province` (20260722000500) are bound to the profile
--       edit form (ProfileView.vue), and updateProfile sends the whole form in
--       one PATCH, so the entire profile save fails with 42501;
--     * `onboarding_tour_version` (20260802000500) is written by
--       onboardingService.markTourSeen, which only tolerates 42703 — so the
--       write fails, is swallowed, and the welcome tour replays on every device.
--
--   So the migration was correct exactly once, on the day it was applied.
--
-- THE FIX — invert it into a DENY-LIST
--   Grant UPDATE on every current column EXCEPT the ones that are security
--   decisions. New columns are then owner-writable by default (which is what
--   every profile column added since has wanted), and the protected set stays
--   protected no matter how many times this runs or what is added later.
--
--   Privileged columns keep their existing write paths, all SECURITY DEFINER and
--   all owner-privileged, so they bypass column privileges and keep working:
--     role          -> assign_user_role()
--     kyc_level     -> review_kyc_application(), admin_set_user_profile()
--     kyb_verified  -> admin_set_kyb_verified(), review_kyb_application()
--     is_active &c. -> set_user_suspended()
--     plan columns  -> activate_subscription() (also belt-and-braced by the
--                      protect_plan_columns trigger)
--
--   `plan` / `plan_expires_at` are added to the deny-list too. The trigger
--   already reverts client writes to them, but a privilege is a cleaner boundary
--   than a trigger that silently discards the change.
--
-- Idempotent and drift-safe: it enumerates the live columns at apply time, so
-- re-running it after ANY future column addition is now the correct action.
-- ============================================================================

do $$
declare
  v_cols text;
  v_protected text[] := array[
    'role',
    'kyc_level',
    'kyb_verified',
    'is_active',
    'suspended_at',
    'suspended_by',
    'suspension_reason',
    'plan',
    'plan_expires_at'
  ];
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  -- Start from zero so a previously-granted protected column is dropped, not
  -- merely left alone. This is what makes the migration self-healing if
  -- 20260703000300 was re-run at some point after 2026-07-09.
  revoke update on public.profiles from anon;
  revoke update on public.profiles from authenticated;

  select string_agg(quote_ident(column_name), ', ')
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and not (column_name = any (v_protected));

  if v_cols is not null then
    execute format('grant update (%s) on public.profiles to authenticated', v_cols);
  end if;
end $$;

notify pgrst, 'reload schema';

-- ============================================================================
-- §VERIFY — run against the live database after applying. Expect the protected
-- names to be ABSENT and the editable ones PRESENT.
--
--   select column_name, privilege_type
--     from information_schema.column_privileges
--    where table_schema = 'public'
--      and table_name   = 'profiles'
--      and grantee      = 'authenticated'
--      and privilege_type = 'UPDATE'
--    order by column_name;
--
-- AFTER APPLYING, TEST:
--   (1) a normal user saves their profile INCLUDING municipality/province — the
--       whole save succeeds (this is the regression the deny-list fixes);
--   (2) the welcome tour, dismissed on one browser, does not reappear on a
--       second browser signed into the same account;
--   (3) PATCH /rest/v1/profiles?id=eq.<self> with {"kyb_verified":true} is
--       REFUSED (42501), and with {"role":"admin"}, {"kyc_level":2},
--       {"is_active":true} likewise;
--   (4) an admin can still change a role, approve KYC, set KYB and suspend or
--       reactivate an account through the admin console — those go through the
--       definer RPCs and are unaffected.
--
-- ROLLBACK
--   Re-apply 20260703000300 (restores the two-name allow-list). Do not: that
--   restores the landmine described above.
-- ============================================================================
