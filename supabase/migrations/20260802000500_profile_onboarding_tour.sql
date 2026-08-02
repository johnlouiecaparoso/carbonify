-- ============================================================================
-- Remember, per ACCOUNT, that the welcome tour has been shown.
--
-- WelcomeTour has always tracked this in localStorage, under
-- `carbonify_tour_seen_v<TOUR_VERSION>_<uid>`. That is per BROWSER, so the
-- "shows once" promise broke in every one of these cases:
--
--   * signing in on a second device, or a second browser, or a phone;
--   * a private window;
--   * anything that clears site data.
--
-- Worse, the key falls back to the literal string 'anon' when the session has
-- not resolved yet. On a slow profile load the tour could open, be dismissed,
-- and write `..._anon` — and then show again on the very next load, now that
-- the real user id was known. The one thing the flag exists to prevent.
--
-- A column on the profile is the only place this can live and mean "this
-- account has seen it". Storing the VERSION rather than a boolean keeps the
-- existing behaviour where bumping TOUR_VERSION re-shows a genuinely new tour.
--
-- FAILS OPEN, deliberately, matching policy_acceptances: if this migration has
-- not been applied, the read errors and the client falls back to localStorage —
-- i.e. exactly today's behaviour. An un-migrated database must not mean nobody
-- can ever be shown the tour, nor that everybody is shown it on every load.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles
      add column if not exists onboarding_tour_version integer;

    comment on column public.profiles.onboarding_tour_version is
      'Highest TOUR_VERSION (src/constants/onboarding.js) this account has completed or skipped. Null = never shown.';
  end if;
end $$;

-- No new RLS policy is needed: profiles already carries a self-select and a
-- self-update policy, and this column is covered by both. It is deliberately
-- NOT admin-writable — nobody but the account owner has a reason to set it.

-- ============================================================================
-- §VERIFY — run against the live database after applying.
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'profiles'
--      and column_name  = 'onboarding_tour_version';
--
-- Expected: exactly one row, integer. No rows means this migration has not been
-- applied and the tour is still relying on localStorage alone — which is not an
-- outage, just the old behaviour.
-- ============================================================================
