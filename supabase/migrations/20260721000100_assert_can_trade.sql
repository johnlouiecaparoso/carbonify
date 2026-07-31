-- ============================================================================
-- Server-side KYC trade gate.
--
-- Until now "you must be KYC-verified to buy credits" was enforced ONLY in the
-- browser (marketplaceService.purchaseCredits → assertCanTrade). That has two
-- problems:
--   1. A client-side check is not a boundary — it can be bypassed.
--   2. The cart's card-checkout path (paymongo-checkout edge function) never
--      called it at all, so the two purchase paths enforced different rules.
--      An unverified buyer was capped only by the velocity limit (₱10k/day at
--      kyc_level 0) instead of being blocked.
--
-- This adds one authoritative check both paths can call. Threshold comes from
-- app_settings.min_kyc_level_to_trade (admin-editable in System Config), same
-- source the client reads, defaulting to 1.
--
-- Enforcement point (deliberate): checkout CREATION, alongside
-- check_velocity_limit — before a PayMongo session exists, so a rejection never
-- happens after the customer has already paid.
--
-- NOTE: process_wallet_purchase is not re-declared here on purpose. Re-issuing
-- a money-moving function to insert one line risks drift against the live
-- definition; the wallet path currently gates in the client only. Closing that
-- is tracked as a follow-up and should be done as a full, reviewed
-- CREATE OR REPLACE of that function.
-- ============================================================================

-- Raises if p_user_id's KYC level is below the configured trading threshold.
create or replace function public.assert_can_trade(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level int;
  v_min   int;
begin
  if p_user_id is null then
    raise exception 'authentication required' using errcode = 'check_violation';
  end if;

  select coalesce(kyc_level, 0) into v_level from public.profiles where id = p_user_id;
  v_level := coalesce(v_level, 0);

  v_min := coalesce(
    (public.get_setting('min_kyc_level_to_trade', '1'::jsonb))::text::int,
    1
  );

  if v_level < v_min then
    raise exception
      'identity verification required before trading (your level %, required %)',
      v_level, v_min
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.assert_can_trade(uuid) from public, anon;
grant execute on function public.assert_can_trade(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
