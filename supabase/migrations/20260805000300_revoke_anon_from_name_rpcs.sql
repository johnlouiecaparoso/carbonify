-- ============================================================================
-- `revoke … from public` is NOT enough on this database. Three functions were
-- callable by `anon` while their own headers claimed otherwise.
--
-- DEFERRED_BACKLOG #12. Measured, not assumed — anon-probed against live on
-- 2026-08-05 with signatures copied out of each migration:
--
--   get_transaction_counterparty_name  200   anon CAN execute   (#3,  20260801000100)
--   get_my_buyer_names                 200   anon CAN execute   (#39, 20260805000100)
--   get_project_comment_author_names   200   anon CAN execute   (#39, 20260805000200)
--   review_kyc_application             401 42501  BLOCKED       (control)
--
-- The control is the whole point: `review_kyc_application` was revoked by
-- 20260802000100 and correctly refuses anon, so the probe reaches the right
-- database and the method works. The three above genuinely differ.
--
-- WHY THE REVOKE DID NOT TAKE
-- Supabase's default privileges GRANT EXECUTE to `anon` and `authenticated`
-- explicitly on functions created in `public`. `revoke all … from public`
-- removes the implicit PUBLIC grant and does nothing to an explicit per-role
-- one. `20260802000100` gets this right and says so in code — it issues BOTH:
--
--     execute format('revoke all on function %s from public', v_fn.sig);
--     execute format('revoke all on function %s from anon',   v_fn.sig);
--
-- 20260801000100 (#3) established the two-line pattern with only the PUBLIC
-- half, and the two 2026-08-05 migrations copied it. This repo's signature
-- defect is a correct pattern applied to one branch and not its sibling; this
-- is that in reverse — an INCORRECT pattern propagated to its siblings, from a
-- file whose header explains in detail why the revoke matters.
--
-- WHAT WAS AND WAS NOT EXPOSED
-- No data. All three return early when `auth.uid()` is null, which is why the
-- probes returned `200 []` rather than rows. The defect is the missing outer
-- gate, exactly the risk 20260801000100's own comment names: "while the
-- auth.uid() check makes that harmless today, it is one refactor away from not
-- being". A future edit that reads a parameter before checking auth.uid() would
-- turn each of these into an anonymous lookup endpoint.
--
-- Idempotent. Revoking a privilege that is already absent is a no-op.
-- ============================================================================

revoke all on function public.get_transaction_counterparty_name(uuid) from anon;
revoke all on function public.get_my_buyer_names(uuid[]) from anon;
revoke all on function public.get_project_comment_author_names(uuid) from anon;

-- ── AND FOUR MORE, found by the ratchet once it was strengthened ────────────
-- Tightening `securityDefinerGrants.test.js` to check the revoke NAMES ANON —
-- rather than merely existing — turned up six further functions in the same
-- state. Four of them belong here. They are staff or owner writes, every one
-- gated internally on auth.uid(), so again nothing was exposed; the outer gate
-- was simply missing.
-- Signatures copied out of their defining migrations, never guessed: a wrong
-- argument list does not error here, it silently revokes nothing (or fails on a
-- function that does not exist), and the probe that checks it afterwards would
-- report the same PGRST202 as a missing function. That misreading cost a false
-- negative on 2026-08-02.
--   assign_user_role             20260711000000 (same signature as 20260326020100,
--                                so a replace rather than an overload — one to revoke)
--   list_verifiers               20260722000200
--   process_data_subject_request 20260722000700
--   update_my_listing            20260721000400
revoke all on function public.assign_user_role(uuid, text, text, text) from anon;
revoke all on function public.list_verifiers() from anon;
revoke all on function public.process_data_subject_request(uuid, text, text) from anon;
revoke all on function public.update_my_listing(uuid, numeric, numeric, text) from anon;

-- ── AND TWO THAT MUST KEEP ANON, deliberately ──────────────────────────────
-- `public_price_history` and `project_price_history` are the other two the
-- ratchet flagged, and revoking them would be a regression wearing the costume
-- of a security fix — the exact failure 20260802000100's test guards against
-- for /registry and /verify.
--
-- `/projects/:id` carries `meta: { public: true }`, and ProjectDetailView
-- renders price history on it. A signed-out visitor comparing a price is the
-- intended audience: the data is aggregated, volume-weighted daily buckets over
-- settled trades, with no counterparty in it. They are named here so the next
-- person reading this file does not "finish the job".

-- Re-assert the intended grant. `revoke … from anon` cannot affect
-- `authenticated`, but stating it keeps this file readable as the complete
-- final posture rather than as a diff against three other files.
grant execute on function public.get_transaction_counterparty_name(uuid) to authenticated;
grant execute on function public.get_my_buyer_names(uuid[]) to authenticated;
grant execute on function public.get_project_comment_author_names(uuid) to authenticated;
grant execute on function public.assign_user_role(uuid, text, text, text) to authenticated;
grant execute on function public.list_verifiers() to authenticated;
grant execute on function public.process_data_subject_request(uuid, text, text) to authenticated;
grant execute on function public.update_my_listing(uuid, numeric, numeric, text) to authenticated;

-- ============================================================================
-- VERIFY — every row must read PASS.
-- ============================================================================
-- select
--   f.sig as "function",
--   case when has_function_privilege('anon', f.sig, 'execute')
--        then '*** FAIL *** anon can still execute' else 'PASS' end as "anon revoked",
--   case when has_function_privilege('authenticated', f.sig, 'execute')
--        then 'PASS' else '*** FAIL *** authenticated lost access' end as "authenticated kept"
-- from (values
--   ('public.get_transaction_counterparty_name(uuid)'),
--   ('public.get_my_buyer_names(uuid[])'),
--   ('public.get_project_comment_author_names(uuid)')
-- ) as f(sig);
--
-- Or from outside, as an anonymous caller — copy each signature, do not guess
-- it (a wrong argument name returns PGRST202, which reads as "absent"):
--   POST /rest/v1/rpc/get_my_buyer_names  {"p_buyer_ids": []}
--   -> must be 401 with code 42501, where it returned 200 [] before this ran.
