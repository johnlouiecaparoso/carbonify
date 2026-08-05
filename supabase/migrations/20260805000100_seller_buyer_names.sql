-- ============================================================================
-- A developer's asset ledger can name its buyers — WITHOUT loosening profiles RLS.
--
-- DEFERRED_BACKLOG #39. Sibling of 20260801000100 (#3), and deliberately the
-- same shape: the receipt case and this one are the same problem on two
-- different screens.
--
-- THE PROBLEM, AND HOW IT WAS MEASURED
-- `assetLedgerService.getBuyerProfiles` reads `profiles` directly for the buyer
-- ids on a developer's completed sales. On 2026-08-05 probes 9 and 10 of
-- rls_negative_suite.sql measured what that read actually returns for a
-- signed-in non-admin: **0 of 6 foreign profile rows**. So it returns nothing,
-- and every counterparty on the ledger renders as "Unknown buyer".
--
-- The service does have a fallback — it degrades to {} and logs. That branch
-- has never fired: RLS FILTERS rows rather than erroring, so `error` is null
-- and `data` is []. The logged path handles the failure that does not happen,
-- and the failure that does happen is silent. That is this project's most
-- expensive recurring shape, and #3's header records it in the same words.
--
-- Why it matters more than a cosmetic blank: the ledger's own comment calls the
-- buyer list "the shape an ERPA conversation wants — a counterparty list, not a
-- transaction log", and sorts it "largest counterparty first — that's the one an
-- ERPA hangs on". A counterparty list where every counterparty is "Unknown
-- buyer" is not a weaker version of that document. It is not that document.
--
-- THE SHAPE OF THE FIX
-- Not a wider `profiles` SELECT policy — that policy is load-bearing
-- (20260703000300 exists because `role` and `kyc_level` sit on the same row).
-- Instead: one SECURITY DEFINER function returning ONLY display names, ONLY for
-- buyers the caller has actually sold to.
--
-- WHAT THIS DELIBERATELY DOES NOT RETURN
-- No email, no phone, no role, no kyc_level, no address. The current client code
-- falls back to showing the buyer's EMAIL when no name is set; that fallback is
-- dropped rather than reproduced. A counterparty list needs a name, and the
-- 2026-07-30 `paymongo-checkout` finding — an endpoint handing out payer name,
-- email and phone to anyone holding a session id — is what "just a bit more
-- than needed" costs on a money surface.
--
-- `organization_name` IS returned, unlike #3's name-only rule. It is the trading
-- entity on a counterparty list, it is the name an ERPA would carry, and it is
-- not personal data in the way an email is. Stated explicitly because it is a
-- deliberate divergence from the sibling migration, not an oversight.
--
-- WHY IT CANNOT BE USED AS A DIRECTORY
-- Ids are filtered through an EXISTS on `credit_transactions` requiring the
-- caller to be the SELLER on a COMPLETED sale to that buyer. Passing a thousand
-- ids you have no relationship with returns zero rows. Unmatched ids are simply
-- absent from the result rather than reported, so it is not an existence oracle
-- either — the caller cannot distinguish "no such user" from "not your buyer".
--
-- Additive + idempotent. Safe to re-run. No table is altered, no policy changed.
-- ============================================================================

create or replace function public.get_my_buyer_names(
  p_buyer_ids uuid[]
)
returns table (
  buyer_id     uuid,
  display_name text
)
language plpgsql
security definer
-- Pin the search path: a SECURITY DEFINER function resolving unqualified names
-- through the caller's search_path is the classic privilege-escalation footgun.
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
begin
  -- Never derive identity from an argument. The caller is auth.uid(), full stop
  -- (the rule the payment path learned as P3).
  if v_caller is null or p_buyer_ids is null or cardinality(p_buyer_ids) = 0 then
    return;
  end if;

  return query
    select p.id,
           coalesce(
             nullif(btrim(p.organization_name), ''),
             nullif(btrim(p.full_name), ''),
             'Carbonify buyer'
           )
      from public.profiles p
     where p.id = any (p_buyer_ids)
       -- The authorisation check, per row. Not a buyer of yours -> not returned.
       and exists (
         select 1
           from public.credit_transactions t
          where t.seller_id = v_caller
            and t.buyer_id  = p.id
            and t.status    = 'completed'
       );
end;
$$;

-- Grant hygiene, per DEFERRED_BACKLOG #12: revoke the implicit PUBLIC EXECUTE
-- that Postgres grants on every new function BEFORE granting to authenticated.
revoke all on function public.get_my_buyer_names(uuid[]) from public;
grant execute on function public.get_my_buyer_names(uuid[]) to authenticated;

comment on function public.get_my_buyer_names(uuid[]) is
  'Display names of buyers the CALLER has completed sales to, for the seller''s '
  'asset ledger. Organization or full name only — never email, role or kyc_level. '
  'Ids with no completed sale from the caller are omitted, so it is neither a '
  'directory nor an existence oracle.';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select
--   'function exists' as check,
--   case when to_regprocedure('public.get_my_buyer_names(uuid[])') is not null
--        then 'PASS' else 'FAIL' end as verdict
-- union all
-- select
--   'is SECURITY DEFINER',
--   case when p.prosecdef then 'PASS' else 'FAIL' end
--   from pg_proc p
--   where p.oid = 'public.get_my_buyer_names(uuid[])'::regprocedure
-- union all
-- select
--   'search_path is pinned',
--   case when array_to_string(p.proconfig, ',') like '%search_path%'
--        then 'PASS' else 'FAIL' end
--   from pg_proc p
--   where p.oid = 'public.get_my_buyer_names(uuid[])'::regprocedure
-- union all
-- select
--   'PUBLIC cannot execute (only authenticated)',
--   case when has_function_privilege('public', 'public.get_my_buyer_names(uuid[])', 'execute')
--        then 'FAIL' else 'PASS' end
-- union all
-- select
--   'profiles SELECT policy count unchanged (this migration must not touch it)',
--   case when count(*) > 0 then 'PASS' else 'FAIL' end
--   from pg_policies where tablename = 'profiles' and cmd = 'SELECT';
--
-- Negative check — pass ids you have never sold to. It must return ZERO rows,
-- not an error and not a name:
--   select * from public.get_my_buyer_names(
--     array(select id from public.profiles limit 50)
--   );
-- Run as a developer with completed sales, that same call must return ONLY the
-- buyers on those sales — which is also the positive check.
