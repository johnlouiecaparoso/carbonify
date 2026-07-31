-- ============================================================================
-- Money-table RLS audit (read-only). Proves backlog #13c's invariant on any DB.
--
-- Run in the Supabase SQL Editor against live (or any env). It returns ONE
-- consolidated result set of FINDINGS:
--
--        ✅ 0 rows        = posture is correct (locked, RLS on, no known holes)
--        ❌ any rows      = each row is a problem to fix; `check` says which
--
-- Returning findings-only (instead of one SELECT per check) matters because the
-- SQL Editor shows only the LAST statement's rows in a multi-statement script —
-- a per-check layout can silently hide the (A)/(C) exposure checks. This layout
-- cannot hide anything: a problem is a row, and every row is displayed.
--
-- Nothing here writes; safe to run any time, including pre-flight before a pilot.
-- ============================================================================

with money_tables(tablename) as (
  values
    ('credit_ownership'), ('wallet_accounts'), ('wallet_transactions'),
    ('credit_transactions'), ('project_credits'), ('credit_listings'),
    ('credit_retirements')
),

-- (A) CLIENT WRITE POLICIES — a finding is a write policy (INSERT/UPDATE/DELETE/
-- ALL) that a client can use to write rows they neither OWN nor manage as STAFF.
-- We treat a policy as safe when EITHER its qual or its with_check is scoped by
-- auth.uid() (owner-scoped) OR references staff (is_admin/is_verifier, or an
-- inline profiles.role='admin' subquery). A true hole — e.g. the old blanket
-- `using(true) with check(true)` — is scoped by none of these and is flagged.
-- (Heuristic: the pg_policies dump is the final authority; this is the tripwire.)
finding_a as (
  select
    'A: client write policy present' as check_name,
    p.tablename,
    p.policyname || ' [' || p.cmd || ']' as detail
  from pg_policies p
  join money_tables m on m.tablename = p.tablename
  where p.schemaname = 'public'
    and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
          !~* $re$auth\.uid|is_admin|is_verifier|profiles|'admin'$re$
),

-- (B) RLS ENABLED — a money table with RLS off (or missing entirely) is a finding.
finding_b as (
  select
    'B: RLS not enabled' as check_name,
    m.tablename,
    case when c.oid is null then 'table not found'
         else 'relrowsecurity = false' end as detail
  from money_tables m
  left join pg_class c
    on c.relname = m.tablename
   and c.relnamespace = 'public'::regnamespace
  where c.oid is null or c.relrowsecurity = false
),

-- (C) KNOWN HOLES — the exact blanket/forgeable policies 20260718000800 closed,
-- in case a live dump or manual edit reintroduces one.
finding_c as (
  select
    'C: known hole reintroduced' as check_name,
    p.tablename,
    p.policyname as detail
  from pg_policies p
  where p.schemaname = 'public'
    and (
      (p.tablename = 'project_credits'     and p.policyname = 'Allow all project credits operations')
      or (p.tablename = 'credit_listings'    and p.policyname = 'Allow all credit listings operations')
      or (p.tablename = 'credit_retirements' and p.policyname = 'Users can insert their own retirements')
    )
)

select * from finding_a
union all
select * from finding_b
union all
select * from finding_c
order by check_name, tablename, detail;
