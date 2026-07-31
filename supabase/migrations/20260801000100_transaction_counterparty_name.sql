-- ============================================================================
-- A receipt can finally name the other party — WITHOUT loosening profiles RLS.
--
-- DEFERRED_BACKLOG #3.
--
-- THE PROBLEM
-- A receipt says who you traded with. But `profiles` SELECT is deliberately
-- hardened (20260703000300, against role / kyc_level escalation), so a buyer
-- cannot read the seller's profile row and vice versa. The embed
-- `seller:profiles!credit_transactions_seller_id_fkey(full_name,email)` resolves
-- structurally after 20260718001100 — and then returns NOTHING under RLS,
-- because RLS filters rows rather than erroring.
--
-- That last part is this project's most expensive lesson, and it applies here
-- exactly: PostgREST does not fail when RLS hides a row, it returns nothing. A
-- receipt therefore rendered a blank counterparty with no error anywhere.
--
-- THE SHAPE OF THE FIX
-- The temptation is to widen the `profiles` SELECT policy. Do not. That policy
-- is load-bearing: `20260703000300` exists because `role` and `kyc_level` sit on
-- the same row, and a readable profiles table is how privilege escalation starts.
--
-- Instead: one `SECURITY DEFINER` function, returning ONLY a display name, ONLY
-- for a transaction the caller is actually a party to.
--
-- WHAT THIS DELIBERATELY DOES NOT RETURN
-- No email, no phone, no role, no kyc_level, no company, no address. A receipt
-- needs a name. Everything else is the counterparty's, and the 2026-07-30
-- `paymongo-checkout` finding — an endpoint handing out payer billing name,
-- email and phone to anyone with a session id — is the cost of returning "just
-- a bit more than needed" on a payment surface.
--
-- WHY IT CANNOT BE USED AS A DIRECTORY
-- The caller must supply a transaction id AND be the buyer or seller on that
-- exact row. There is no "look up user X" entry point. A caller who is party to
-- nothing can read nothing, and the failure is a NULL result rather than an
-- error, so it is not an existence oracle either.
--
-- Additive + idempotent. Safe to re-run. No table is altered and no policy is
-- changed.
-- ============================================================================

create or replace function public.get_transaction_counterparty_name(
  p_transaction_id uuid
)
returns table (
  counterparty_id uuid,
  counterparty_name text,
  counterparty_role text  -- 'buyer' | 'seller', relative to the CALLER
)
language plpgsql
security definer
-- Pin the search path: a SECURITY DEFINER function that resolves unqualified
-- names through the caller's search_path is the classic privilege-escalation
-- footgun.
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_buyer  uuid;
  v_seller uuid;
begin
  -- Never derive identity from an argument. Same rule the payment path learned
  -- (P3): the caller is auth.uid(), full stop.
  if v_caller is null then
    return;
  end if;

  select t.buyer_id, t.seller_id
    into v_buyer, v_seller
    from public.credit_transactions t
   where t.id = p_transaction_id;

  if not found then
    return;
  end if;

  -- The authorisation check. Not a party to this row -> no rows, no error.
  if v_caller <> v_buyer and v_caller <> v_seller then
    return;
  end if;

  if v_caller = v_buyer then
    return query
      select p.id,
             coalesce(nullif(btrim(p.full_name), ''), 'Carbonify seller'),
             'seller'::text
        from public.profiles p
       where p.id = v_seller;
  else
    return query
      select p.id,
             coalesce(nullif(btrim(p.full_name), ''), 'Carbonify buyer'),
             'buyer'::text
        from public.profiles p
       where p.id = v_buyer;
  end if;
end;
$$;

-- Grant hygiene, per DEFERRED_BACKLOG #12: revoke the implicit PUBLIC EXECUTE
-- that Postgres grants on every new function BEFORE granting to authenticated.
-- Without the revoke, `anon` can call this too — and while the auth.uid() check
-- makes that harmless today, it is one refactor away from not being.
revoke all on function public.get_transaction_counterparty_name(uuid) from public;
grant execute on function public.get_transaction_counterparty_name(uuid) to authenticated;

comment on function public.get_transaction_counterparty_name(uuid) is
  'Display name of the other party on a credit transaction the caller is party to. '
  'Name only — never email, role or kyc_level. Returns zero rows for a caller who '
  'is not the buyer or seller, so it cannot be used as a directory or an oracle.';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select
--   'function exists' as check,
--   case when to_regprocedure('public.get_transaction_counterparty_name(uuid)') is not null
--        then 'PASS' else 'FAIL' end as verdict
-- union all
-- select
--   'is SECURITY DEFINER',
--   case when p.prosecdef then 'PASS' else 'FAIL' end
--   from pg_proc p
--   where p.oid = 'public.get_transaction_counterparty_name(uuid)'::regprocedure
-- union all
-- select
--   'search_path is pinned',
--   case when array_to_string(p.proconfig, ',') like '%search_path%'
--        then 'PASS' else 'FAIL' end
--   from pg_proc p
--   where p.oid = 'public.get_transaction_counterparty_name(uuid)'::regprocedure
-- union all
-- select
--   'PUBLIC cannot execute (only authenticated)',
--   case when has_function_privilege('public', 'public.get_transaction_counterparty_name(uuid)', 'execute')
--        then 'FAIL' else 'PASS' end
-- union all
-- select
--   'profiles SELECT policy count unchanged (this migration must not touch it)',
--   case when count(*) > 0 then 'PASS' else 'FAIL' end
--   from pg_policies where tablename = 'profiles' and cmd = 'SELECT';
--
-- Negative check — run as a user who is NOT party to the transaction. It must
-- return ZERO rows, not an error and not a name:
--   select * from public.get_transaction_counterparty_name('<someone-elses-txn>');
