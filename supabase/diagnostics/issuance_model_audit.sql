-- ============================================================================
-- Issuance-model audit (read-only). Settles backlog #17 on any DB.
--
-- Run in the Supabase SQL Editor against live. It returns ONE consolidated set
-- of FINDINGS:
--
--        ✅ 0 rows        = exactly one issuance path is live and nothing has
--                           been issued twice
--        ❌ any rows      = each row is a problem; `finding` says which, and
--                           `detail` carries the evidence
--
-- Findings-only, single result set, for the same reason as
-- money_table_rls_audit.sql: the SQL Editor shows only the LAST statement's
-- rows, so a per-check layout can silently hide the checks that matter.
--
-- WHY THIS EXISTS
-- Two triggers can mint credits, and the migration history left both in place:
--
--   20260604010100  dropped trg_activate_validated_project and created
--                   trg_mint_credits_on_ver_approval   (deliberate: the file is
--                   named decouple_issuance_mint_on_ver)
--   20260626000500  re-created trg_activate_validated_project — as part of a
--                   fix for the credits_available / available_credits column
--                   drift. That file is titled "Fix credit pool availability"
--                   and does not discuss issuance models at all.
--
-- So the live state is very likely an ACCIDENT rather than a decision: a
-- bug-fix migration resurrected a trigger that had been intentionally retired
-- three weeks earlier. Check (A) confirms which triggers are actually enabled;
-- (B) and (C) look for credits that were therefore issued twice.
--
-- Nothing here writes. Safe to run any time.
-- ============================================================================

with

-- (A) WHICH ISSUANCE TRIGGERS ARE ENABLED?
--     A finding is "both are enabled" (double issuance is possible) or
--     "neither is" (nothing can ever be issued).
trigger_state as (
  select
    count(*) filter (
      where t.tgname = 'trg_activate_validated_project' and t.tgenabled <> 'D'
    ) as on_validation,
    count(*) filter (
      where t.tgname = 'trg_mint_credits_on_ver_approval' and t.tgenabled <> 'D'
    ) as on_ver
  from pg_trigger t
  where not t.tgisinternal
),

check_a as (
  select
    'A. issuance triggers'::text as finding,
    case
      when on_validation > 0 and on_ver > 0 then
        'BOTH trg_activate_validated_project and trg_mint_credits_on_ver_approval are enabled. '
        || 'Validating a project mints a pool + listing, and approving a VER against it mints AGAIN. '
        || 'Decide which model is canonical (backlog #17) and drop the other.'
      when on_validation = 0 and on_ver = 0 then
        'NEITHER issuance trigger is enabled — no credit can ever be minted.'
      else null
    end as detail
  from trigger_state
),

-- (B) PROJECTS ISSUED ON BOTH PATHS
--     Validated (so the validation trigger minted a pool) AND carrying at least
--     one approved VER (so the VER trigger minted again). These are the rows
--     where the same reductions have been issued twice.
double_issued as (
  select
    p.id,
    p.title,
    count(v.id) as approved_vers,
    coalesce(sum(v.approved_quantity), 0) as ver_quantity
  from public.projects p
  join public.verified_emission_reductions v
    on v.project_id = p.id
   and v.status = 'approved'
  where lower(coalesce(p.status, '')) in ('validated', 'approved')
  group by p.id, p.title
),

-- (C) DOUBLE-ISSUED **AND ALREADY SOLD**
--     The subset of (B) where credits have left the platform. These cannot be
--     fixed by adjusting a pool — a buyer holds them — so they are listed
--     separately and first in severity.
--
--     Defined BEFORE check_b because check_b subtracts it: a plain WITH clause
--     may only reference CTEs declared earlier.
sold as (
  select
    d.id,
    d.title,
    coalesce(sum(ct.quantity), 0) as sold_qty
  from double_issued d
  join public.project_credits pc on pc.project_id = d.id
  join public.credit_transactions ct
    on ct.project_credit_id = pc.id
   and ct.status = 'completed'
  group by d.id, d.title
  having coalesce(sum(ct.quantity), 0) > 0
),

-- Reported here only if NOT already reported by (C); a project whose credits
-- have been sold is the more severe finding and should appear once, not twice.
check_b as (
  select
    'B. double-issued project'::text as finding,
    'Project "' || d.title || '" (' || d.id || ') was validated AND has '
      || d.approved_vers || ' approved VER(s) totalling ' || d.ver_quantity
      || ' tCO2e. Credits were minted on both paths; reconcile the pool against '
      || 'what was actually verified before any further sale.' as detail
  from double_issued d
  where not exists (select 1 from sold s where s.id = d.id)
),

check_c as (
  select
    'C. double-issued AND SOLD'::text as finding,
    'Project "' || s.title || '" (' || s.id || ') is double-issued and '
      || s.sold_qty || ' credit(s) have already been SOLD. Buyers hold credits '
      || 'that may not correspond to verified reductions. Escalate before '
      || 'issuing or selling anything further against this project.' as detail
  from sold s
)

select finding, detail from check_c            -- most severe first
union all
select finding, detail from check_b
union all
select finding, detail from check_a where detail is not null
order by 1;

-- ============================================================================
-- IF (A) REPORTS BOTH TRIGGERS ENABLED
--   Apply supabase/cutover/adopt_mint_on_ver.sql, which restores the model
--   20260604010100 intended. Read its header first: it changes when a project
--   reaches the marketplace.
--
-- IF (B) OR (C) RETURN ROWS
--   Do NOT simply drop a trigger and move on — those projects already carry
--   more issued credits than were verified. (C) rows involve credits a buyer
--   now holds and need a decision (retire the excess against platform reserve,
--   or honour and reconcile), not a migration.
-- ============================================================================
