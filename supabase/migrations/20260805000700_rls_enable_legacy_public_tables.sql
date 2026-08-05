-- ============================================================================
-- Enable RLS on the five pre-version-control tables that never had it.
--
-- WHAT IS WRONG TODAY
--   Five tables sit in the `public` schema with row level security switched
--   off. PostgREST exposes every table in `public`, so each is readable at
--   /rest/v1/<table> by anyone holding the publishable anon key:
--
--     public.notification_templates
--     public.orders
--     public.verifications
--     public.listings
--     public.wallets
--
--   Measured on live 2026-08-05, signed out with the anon key:
--     notification_templates -> 3 rows (subject_template, html_template, …)
--     orders / verifications / listings / wallets -> 0 rows; all four EMPTY.
--
-- WHAT THESE ACTUALLY ARE
--   Superseded originals. The app queries credit_listings, supplier_orders,
--   wallet_accounts and verification_assessments instead; `listings`, `orders`,
--   `wallets` and `verifications` are the pre-rename tables, kept alive by
--   nothing. None of the five appears anywhere in this repo — not in src/, not
--   in scripts/, not in supabase/functions/, not in another migration. They are
--   DEFERRED_BACKLOG #16 (objects created out-of-band, never tracked) in its
--   purest form.
--
--   So the exposure today is small — four empty tables and three email
--   templates. What makes it worth closing anyway is that an empty untracked
--   table is not permanently empty. Anything that later writes to one of these
--   by mistake writes into a table with no access control at all.
--
-- WHAT THIS DOES
--   Enables RLS on all five and adds NO policies. RLS with no policy denies
--   every client read and write, which is the correct posture for a table no
--   client should be touching. service_role and SECURITY DEFINER functions
--   bypass RLS and are unaffected.
--
--   This is deliberately lock-down, not DROP TABLE. Dropping is the honest
--   end state for four empty superseded tables and is the cheaper thing to
--   maintain — but it is irreversible, it would take notification_templates'
--   three rows with it, and it cannot be verified as safe from inside this repo
--   because these objects were never in it. Locked now, droppable later:
--   DEFERRED_BACKLOG #43.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §PRE-FLIGHT — run this FIRST.
--
--   select c.relname,
--          c.relrowsecurity as rls_enabled,
--          (select count(*) from pg_policies p
--            where p.schemaname = 'public' and p.tablename = c.relname) as policies,
--          (select n_live_tup from pg_stat_user_tables s
--            where s.relname = c.relname and s.schemaname = 'public') as approx_rows
--     from pg_class c
--    where c.relnamespace = 'public'::regnamespace
--      and c.relkind = 'r'
--      and c.relname in ('notification_templates', 'orders', 'verifications',
--                        'listings', 'wallets');
--
-- Expected: five rows, rls_enabled = false, policies = 0, approx_rows 0 for all
-- but notification_templates.
--
-- IF approx_rows IS NON-ZERO FOR orders / verifications / listings / wallets,
-- STOP. Something has started writing to a table this repo believes is dead,
-- and locking it will break that writer. Find it before applying.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table if exists public.notification_templates enable row level security;
alter table if exists public.orders                 enable row level security;
alter table if exists public.verifications          enable row level security;
alter table if exists public.listings               enable row level security;
alter table if exists public.wallets                enable row level security;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--
--   (1) SIGNED OUT, anon key:
--         GET /rest/v1/notification_templates?select=*   -> [] (was 3 rows)
--         GET /rest/v1/orders?select=*                   -> []
--       An empty array rather than an error is normal: RLS filters rows, it
--       does not raise.
--
--   (2) Notification emails still send. If a template lookup breaks, the reader
--       is a SECURITY INVOKER function rather than the SECURITY DEFINER one
--       assumed here — that is a finding, not a reason to revert blindly.
--
--   (3) The app should be untouched everywhere else. Nothing reads these five.
--
-- ROLLBACK:
--   alter table public.notification_templates disable row level security;
--   (…and the same for the other four.)
-- ============================================================================
