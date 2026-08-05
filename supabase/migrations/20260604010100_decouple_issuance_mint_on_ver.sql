-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.mint_credits_on_ver_approval()  ->  20260718000900_issuance_triggers_use_credits_available.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- Decouple credit issuance from project validation (SRD-faithful MRV model).
--
-- BEFORE: validating a project auto-created project_credits + a marketplace
--         listing (trg_activate_validated_project).
-- AFTER:  validation only marks a project eligible. Carbon credits are minted
--         ONLY when a verifier approves a Verified Emission Reduction (VER),
--         which represents independently reviewed monitoring data.
--
-- Existing projects that were already validated under the old flow keep their
-- credits/listings; this only changes behaviour going forward.

-- 1) Remove the validation-time auto-issuance trigger + function.
drop trigger if exists trg_activate_validated_project on public.projects;
drop function if exists public.activate_validated_project_trigger();

-- 2) Mint credits + ensure a marketplace listing when a VER is approved.
create or replace function public.mint_credits_on_ver_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric;
  v_price numeric;
  v_project record;
  v_project_credit_id uuid;
  v_listing_id uuid;
begin
  -- Only act when a VER becomes approved (on insert, or on a status change).
  if lower(coalesce(new.status, '')) <> 'approved' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  v_qty := greatest(coalesce(new.approved_quantity, 0), 0);
  if v_qty <= 0 then
    return new;
  end if;

  select id, user_id, title, description, category, location, credit_price
    into v_project
  from public.projects
  where id = new.project_id;

  if v_project.id is null then
    return new;
  end if;

  v_price := greatest(coalesce(v_project.credit_price, 1), 0.01);

  -- Upsert project_credits: add the newly approved quantity to the pool.
  select pc.id
    into v_project_credit_id
  from public.project_credits pc
  where pc.project_id = new.project_id
  order by pc.created_at asc
  limit 1;

  if v_project_credit_id is null then
    insert into public.project_credits (
      project_id, total_credits, available_credits, price_per_credit, currency
    ) values (
      new.project_id, v_qty, v_qty, v_price, 'PHP'
    )
    returning id into v_project_credit_id;
  else
    update public.project_credits
      set total_credits = coalesce(total_credits, 0) + v_qty,
          available_credits = coalesce(available_credits, 0) + v_qty,
          price_per_credit = coalesce(nullif(v_project.credit_price, 0), price_per_credit),
          currency = coalesce(currency, 'PHP'),
          updated_at = now()
    where id = v_project_credit_id;
  end if;

  -- Ensure an active marketplace listing exists; top up its quantity if so.
  select cl.id
    into v_listing_id
  from public.credit_listings cl
  where cl.project_credit_id = v_project_credit_id
    and cl.status = 'active'
  order by cl.created_at asc
  limit 1;

  if v_listing_id is null then
    insert into public.credit_listings (
      project_credit_id, seller_id, quantity, price_per_credit, currency,
      status, listing_type, title, description, category, location,
      verification_standard, listed_at
    ) values (
      v_project_credit_id,
      v_project.user_id,
      v_qty,
      v_price,
      'PHP',
      'active',
      'sell',
      case when btrim(coalesce(v_project.title, '')) = ''
        then 'Carbon Credits'
        else v_project.title || ' - Carbon Credits' end,
      coalesce(v_project.description, 'Verified carbon credits from ' || coalesce(v_project.title, 'project')),
      coalesce(v_project.category, 'Renewable Energy'),
      coalesce(v_project.location, 'Unknown Location'),
      'EcoLink Standard',
      now()
    );
  else
    update public.credit_listings
      set quantity = coalesce(quantity, 0) + v_qty,
          price_per_credit = v_price
    where id = v_listing_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_mint_credits_on_ver_approval on public.verified_emission_reductions;
create trigger trg_mint_credits_on_ver_approval
after insert or update of status on public.verified_emission_reductions
for each row
execute function public.mint_credits_on_ver_approval();
