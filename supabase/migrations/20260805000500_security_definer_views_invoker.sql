-- ============================================================================
-- The four SECURITY DEFINER views: make them respect the caller's RLS.
--
-- WHAT IS WRONG TODAY
--   A Postgres view runs with the privileges of its OWNER unless it is created
--   with security_invoker = on. All four of these are owned by postgres and
--   none sets the flag, so each one reads its base tables with RLS bypassed and
--   hands the result to whoever can SELECT the view.
--
--   Two of them are over the money tables, and the leak is live. Measured on
--   2026-08-05 with the anon (publishable) key, SIGNED OUT:
--
--     GET /rest/v1/wallet_accounts       -> 0 rows      (RLS working)
--     GET /rest/v1/credit_ownership      -> 0 rows      (RLS working)
--     GET /rest/v1/wallet_summary        -> 2 rows      (RLS bypassed)
--     GET /rest/v1/user_credit_portfolio -> 16 rows     (RLS bypassed)
--
--   wallet_summary exposes user_id, current_balance, total_topups,
--   total_withdrawals and total_payments per wallet. user_credit_portfolio
--   exposes user_id, owned_quantity, purchase_price and purchase_date per
--   holding. Both are personal financial data under the DPA, readable by anyone
--   who opens the site and reads the key out of the network tab.
--
--   marketplace_listings and marketplace_listings_view are the same defect with
--   a much smaller payload: they surface active-listing data that credit_listings
--   already makes public to anon by policy. marketplace_listings_view also adds
--   seller_name. Fixed here for consistency, not urgency.
--
-- WHY security_invoker RATHER THAN DROP
--   None of the four is referenced anywhere in this repo — not in src/, not in
--   scripts/, not in supabase/functions/, not in another migration. Dropping
--   them would be the thorough cleanup and would cost the app nothing. It is
--   NOT done here because these views predate version control (DEFERRED_BACKLOG
--   #16) and something outside the repo may read them: a Studio view, a saved
--   SQL snippet, a BI dashboard. security_invoker fixes the security defect
--   without removing anything, and a drop stays available later.
--
--   Note the failure modes differ. Under security_invoker the views keep
--   working and simply return the caller's own rows; an external reader sees
--   fewer rows rather than an error. If any of these feeds an admin dashboard
--   that expects to see everyone, it will quietly show only the operator's own
--   data. Check §AFTER APPLYING before assuming the numbers are wrong.
--
-- WHAT THIS DOES NOT DO
--   No view definition is rewritten. The bodies are not in this repo and are
--   not needed: ALTER VIEW ... SET (security_invoker = on) changes the
--   execution context and nothing else. The column lists stay exactly as they
--   are.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §PRE-FLIGHT — run this FIRST.
--
--   select c.relname,
--          c.reloptions,
--          pg_get_userbyid(c.relowner) as owner
--     from pg_class c
--    where c.relnamespace = 'public'::regnamespace
--      and c.relkind in ('v', 'm')
--      and c.relname in ('user_credit_portfolio', 'wallet_summary',
--                        'marketplace_listings', 'marketplace_listings_view');
--
-- Expected: four rows, reloptions null (no security_invoker), owner postgres.
--
-- relkind 'm' would mean a MATERIALIZED view, which does not support
-- security_invoker at all and would need a different fix (revoke + rebuild).
-- The advisor reports all four as type "view", so 'v' is expected for each.
-- ─────────────────────────────────────────────────────────────────────────────

-- security_invoker on views requires PostgreSQL 15+. Fail loudly and early
-- rather than half-applying: on PG14 the ALTERs below raise a confusing
-- "unrecognized parameter" error one at a time.
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception
      'security_invoker views need PostgreSQL 15+; this server is %. Revoke SELECT from anon/authenticated on these four views instead.',
      current_setting('server_version');
  end if;
end
$$;

begin;

-- ── The live leak ───────────────────────────────────────────────────────────
alter view if exists public.wallet_summary          set (security_invoker = on);
alter view if exists public.user_credit_portfolio   set (security_invoker = on);

-- Defence in depth: with security_invoker these return nothing to a signed-out
-- caller anyway, but there is no reason anon should hold SELECT on a view whose
-- every column is somebody's balance or somebody's holding.
--
-- Guarded, unlike the ALTERs above, because REVOKE has no IF EXISTS: these
-- views exist only on live (DEFERRED_BACKLOG #16), so an unguarded revoke would
-- abort this transaction in any environment rebuilt from supabase/migrations/.
do $$
begin
  if to_regclass('public.wallet_summary') is not null then
    revoke select on public.wallet_summary from anon;
  else
    raise notice 'public.wallet_summary not present — skipping revoke';
  end if;

  if to_regclass('public.user_credit_portfolio') is not null then
    revoke select on public.user_credit_portfolio from anon;
  else
    raise notice 'public.user_credit_portfolio not present — skipping revoke';
  end if;
end
$$;

-- ── Same defect, public data ────────────────────────────────────────────────
-- SELECT is deliberately NOT revoked from anon here: these two carry the same
-- active-listing data credit_listings already publishes to anon by policy, and
-- an anonymous marketplace browse is the product working as intended.
alter view if exists public.marketplace_listings      set (security_invoker = on);
alter view if exists public.marketplace_listings_view set (security_invoker = on);

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--
--   (1) SIGNED OUT, with the anon key — the proof:
--         GET /rest/v1/wallet_summary?select=*
--         GET /rest/v1/user_credit_portfolio?select=*
--       Expected: 401/permission denied (the revoke), or an empty array.
--       Before this migration they returned 2 and 16 rows.
--
--   (2) SIGNED IN as a buyer who owns credits: if you use either view from a
--       SQL editor session, you now see only your own rows. That is the fix
--       working, not a regression.
--
--   (3) The app is expected to be entirely unaffected — nothing reads these
--       four. If a screen does change, it is reading a view this repo does not
--       know about; say so, because that is a finding in itself.
--
-- ROLLBACK:
--   alter view public.wallet_summary        set (security_invoker = off);
--   alter view public.user_credit_portfolio set (security_invoker = off);
--   grant select on public.wallet_summary, public.user_credit_portfolio to anon;
-- ============================================================================
