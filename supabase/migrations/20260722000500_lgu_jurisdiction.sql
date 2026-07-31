-- ============================================================================
-- LGU jurisdiction — record which municipality an LGU actually governs.
--
-- The platform had no idea. `projects.municipality` exists, but profiles carried
-- only organization_name/type/address, and an LGU's own municipality was free
-- text typed into the emissions CALCULATOR form and stored per record. Nothing
-- structural tied an LGU user to a place.
--
-- That is why getCommunityProjects() returned every validated project in the
-- country: an LGU in Cabanatuan could see and endorse a project in Davao. A
-- host-LGU endorsement is a credibility signal attached to a carbon project —
-- one of the nine required submission documents — so an endorsement from a body
-- with no authority over the site is worse than none at all. It looks like due
-- diligence.
--
-- It also blocked the "projects in my municipality" tracker (role-needs #4) and
-- makes benchmarking (#6) meaningless: you cannot compare LGUs you cannot
-- identify.
--
-- THE MATCHING RULE, AND WHY IT FAILS OPEN
-- Municipality is free text on both sides, so comparison is normalised (trimmed,
-- case-folded, internal whitespace collapsed). The guard below rejects an
-- endorsement only when BOTH sides declare a municipality and they differ.
-- If either is null it allows the endorsement, because:
--   * every existing LGU account predates this column and has none — enforcing
--     would lock out every current user on deploy;
--   * a project submitted without a municipality is a data-quality problem, not
--     an endorsement-authority problem, and should not be silently unendorsable.
-- The UI tells an LGU with no jurisdiction set that its endorsements are
-- unscoped, rather than pretending the scoping is in force.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles add column if not exists municipality text;
    alter table public.profiles add column if not exists province text;
  end if;
end $$;

-- Shared normaliser so the guard, the tracker query and the UI all agree on
-- what "the same municipality" means.
create or replace function public.normalize_jurisdiction(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p_value, ''))), '\s+', ' ', 'g'), '')
$$;

-- Match projects to a jurisdiction quickly (used by the LGU project tracker).
create index if not exists idx_projects_municipality_norm
  on public.projects (public.normalize_jurisdiction(municipality))
  where municipality is not null;

-- ── Endorsement authority guard ─────────────────────────────────────────────
create or replace function public.guard_endorsement_jurisdiction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lgu_municipality     text;
  v_project_municipality text;
begin
  -- service_role / direct SQL: the deliberate operational escape hatch, as with
  -- the verifier independence guards (20260722000100).
  if auth.uid() is null then
    return new;
  end if;

  select public.normalize_jurisdiction(p.municipality)
    into v_lgu_municipality
    from public.profiles p
   where p.id = new.lgu_user_id;

  select public.normalize_jurisdiction(pr.municipality)
    into v_project_municipality
    from public.projects pr
   where pr.id = new.project_id;

  -- Fails open when either side has not declared a municipality — see header.
  if v_lgu_municipality is null or v_project_municipality is null then
    return new;
  end if;

  if v_lgu_municipality is distinct from v_project_municipality then
    raise exception
      'You can only endorse projects in your own municipality. This project is in %.',
      (select pr.municipality from public.projects pr where pr.id = new.project_id)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_endorsement_jurisdiction on public.project_endorsements;
create trigger trg_guard_endorsement_jurisdiction
before insert or update on public.project_endorsements
for each row
execute function public.guard_endorsement_jurisdiction();

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) an LGU with municipality set sees ONLY projects in that municipality on
--       the Endorsements and Projects tabs;
--   (2) that LGU is rejected if it tries to endorse a project elsewhere;
--   (3) an LGU with NO municipality set still sees everything and can still
--       endorse, with the "jurisdiction not set" banner shown;
--   (4) a project with no municipality remains endorsable by anyone.
--
-- ROLLBACK
--   drop trigger if exists trg_guard_endorsement_jurisdiction on public.project_endorsements;
--   drop function if exists public.guard_endorsement_jurisdiction();
--   drop index if exists public.idx_projects_municipality_norm;
--   drop function if exists public.normalize_jurisdiction(text);
--   alter table public.profiles drop column if exists municipality, drop column if exists province;
--   notify pgrst, 'reload schema';
-- ============================================================================
