-- ============================================================================
-- Admin: set an LGU account's municipality / province.
--
-- WHY THIS EXISTS
-- `profiles.municipality` and `profiles.province` are what scope every LGU
-- surface: getJurisdictionProjects() ("Projects in My Area"),
-- getEndorsableCommunityProjects(), and the SQL endorsement guard from
-- 20260722000500. All three FAIL OPEN when the column is null — an LGU with no
-- declared municipality sees, and can endorse, projects from the whole country.
--
-- The only place that could set it was the LGU's own profile page. But an LGU
-- account is not self-serve: there is no LGU application flow, so the role is
-- granted by an admin in User Management. That meant every LGU account began
-- life unscoped, and stayed that way until somebody happened to notice — which
-- is exactly the "they should only see projects near where the LGU is located"
-- gap. The place to capture a jurisdiction is the moment the role is granted.
--
-- WHY A SEPARATE FUNCTION AND NOT TWO MORE PARAMETERS ON
-- admin_set_user_profile
-- Adding parameters changes that function's signature. PostgREST resolves RPCs
-- by argument names, so a client sending six arguments to a database where this
-- migration has NOT been applied gets "function not found" — and User
-- Management would stop being able to edit ANY user, including to fix the
-- problem. A separate function degrades far better: if it is missing, saving a
-- jurisdiction fails and everything else in the console still works. This
-- repository has been bitten by built-≠-live often enough to design for it.
--
-- Idempotent create-or-replace; safe to re-run.
-- ============================================================================

create or replace function public.admin_set_user_jurisdiction(
  p_user_id      uuid,
  p_municipality text default null,
  p_province     text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'only administrators can set a jurisdiction';
  end if;
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  -- Empty string clears the field rather than being coalesced away. Clearing a
  -- jurisdiction has to be possible: an LGU officer who moves office must not
  -- be stuck holding authority over their old municipality, and the only way to
  -- express that through this API is to send ''.
  update public.profiles
  set
    municipality = nullif(btrim(coalesce(p_municipality, municipality, '')), ''),
    province     = nullif(btrim(coalesce(p_province, province, '')), '')
  where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'user % not found', p_user_id;
  end if;

  return v_profile;
end;
$$;

revoke all on function public.admin_set_user_jurisdiction(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_jurisdiction(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- §VERIFY — run against the live database after applying.
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'admin_set_user_jurisdiction';
--   -- expect one row: (uuid, text, text)
--
-- Then, as a non-admin, `select public.admin_set_user_jurisdiction(...)` must
-- raise 'only administrators can set a jurisdiction'.
-- ============================================================================
