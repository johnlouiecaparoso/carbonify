-- ============================================================================
-- Schedule the payout worker (process-payouts) — REQUIRED once escrow is live.
--
-- ⚠️ THIS SCRIPT WRITES. It is not a read-only diagnostic. It is deliberately
-- kept in supabase/cutover/ rather than supabase/migrations/ so `db push` can
-- never apply it automatically — it embeds a secret and a project-specific URL
-- that only the owner has.
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
-- Migration 20260725000200 (applied 2026-07-29) made card settlement hold the
-- seller's net in escrow_held. The ONLY thing that ever releases a hold is
-- release_matured_escrow(), and the only caller is the process-payouts edge
-- function. Without a schedule, holds mature and then sit there forever: no
-- error, no alert, the seller simply never gets paid.
--
-- ── WHY IT IS NOT JUST A "SCHEDULE" BUTTON ──────────────────────────────────
-- process-payouts is NOT publicly callable by design. Reading its source
-- (supabase/functions/process-payouts/index.ts):
--
--   * it rejects anything that is not POST                      -> 405
--   * it requires the header  x-worker-secret  to equal the
--     PAYOUT_WORKER_SECRET env var                              -> 401
--   * if PAYOUT_WORKER_SECRET is UNSET, the check `!PAYOUT_WORKER_SECRET`
--     is true and EVERY call is rejected                        -> 401
--
-- So a schedule that just "calls the function" silently 401s every 15 minutes
-- and nothing is ever released. The secret must be set AND sent.
--
-- ── BEFORE YOU RUN THIS ─────────────────────────────────────────────────────
--   1. Set the secret (Dashboard -> Edge Functions -> Secrets, or CLI):
--        supabase secrets set PAYOUT_WORKER_SECRET='<a long random string>'
--   2. Deploy the function:
--        supabase functions deploy process-payouts --no-verify-jwt
--      (--no-verify-jwt is correct here: this is a machine caller with its own
--      shared-secret auth, not a signed-in user. See docs/dev/DEPLOYMENT.md.)
--   3. Test it by hand before scheduling — see the curl at the bottom of this
--      file. A 200 with {"escrowReleased":0,...} means it works. A 401 means
--      the secret is wrong or unset; fix that FIRST, or you will schedule a job
--      that fails silently forever.
--
-- ── WHAT process-payouts DOES ON EACH RUN ───────────────────────────────────
--   a. calls release_matured_escrow() -> moves every matured, dispute-free hold
--      from escrow_held to seller_payable. This is the part that matters today.
--   b. picks up to 25 'requested' payout_requests and disburses them.
--      ⚠️ Disbursement is currently the MOCK provider: it marks a payout settled
--      unless destination.accountNumber is the literal 'FAIL'. No real money
--      leaves anywhere. That is correct for a test-key beta, but do not read a
--      "settled" payout as money having actually moved.
--
-- ── ALTERNATIVE: the Dashboard ──────────────────────────────────────────────
-- Newer Supabase projects have a Cron section in the Dashboard that can call an
-- Edge Function on a schedule. If yours has it, you can use that instead of
-- this script — but you must still add the `x-worker-secret` header there, for
-- the same reason. This SQL path is given because it is explicit, versioned,
-- and verifiable from the SQL Editor.
-- ============================================================================


-- ── 1) Extensions ───────────────────────────────────────────────────────────
-- pg_cron schedules the job; pg_net makes the outbound HTTP call.
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ── 2) Schedule it ──────────────────────────────────────────────────────────
--
-- ⚠️ REPLACE TWO THINGS BELOW BEFORE RUNNING:
--     <PROJECT_REF>          your Supabase project ref (the subdomain in your
--                            project URL, e.g. fmngptolarydbgrtltnd)
--     <PAYOUT_WORKER_SECRET> the exact value you set in step 1
--
-- Unschedule first so re-running this file replaces the job instead of
-- stacking duplicates (two concurrent runs are survivable — mark_payout_processing
-- is an atomic claim, so only one wins — but duplicates make the cron table a
-- mess and double the outbound calls).
select cron.unschedule('carbonify-process-payouts')
where exists (select 1 from cron.job where jobname = 'carbonify-process-payouts');

select cron.schedule(
  'carbonify-process-payouts',
  '*/15 * * * *',                        -- every 15 minutes
  $job$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-payouts',
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-worker-secret', '<PAYOUT_WORKER_SECRET>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);


-- ── 3) Verify the job exists ────────────────────────────────────────────────
select jobid, jobname, schedule, active
from cron.job
where jobname = 'carbonify-process-payouts';


-- ── 4) Verify it is actually SUCCEEDING (run this ~20 minutes later) ────────
-- A scheduled job that 401s every time still shows status 'succeeded' here —
-- pg_cron reports whether the SQL ran, not whether the HTTP call was accepted.
-- So check the response, not just the run.
select jrd.runid, jrd.status, jrd.return_message, jrd.start_time
from cron.job_run_details jrd
join cron.job j on j.jobid = jrd.jobid
where j.jobname = 'carbonify-process-payouts'
order by jrd.start_time desc
limit 10;

-- The response bodies from the actual HTTP calls. THIS is the one that tells
-- you the truth: look for status_code 200 and a body containing
-- "escrowReleased". A 401 here means the secret is wrong.
select id, status_code, content::text, created
from net._http_response
order by created desc
limit 10;


-- ============================================================================
-- TEST IT BY HAND FIRST (recommended before scheduling anything)
--
--   curl -i -X POST \
--     -H "Content-Type: application/json" \
--     -H "x-worker-secret: <PAYOUT_WORKER_SECRET>" \
--     https://<PROJECT_REF>.supabase.co/functions/v1/process-payouts
--
--   200 + {"escrowReleased":0,"processed":0,"results":[]}  -> working
--   401 + {"error":"Unauthorized"}                         -> secret unset/wrong
--   405 + {"error":"Method not allowed"}                   -> you sent a GET
--
-- AFTER SCHEDULING, PROVE IT END TO END:
--   Run supabase/diagnostics/escrow_verification.sql. Row 3 must not say
--   UNPROVEN. It only reaches PASS once a real hold has existed and no matured
--   hold is sitting unreleased — which is why the card test purchase in
--   ESCROW_DECISION.md §6 is not optional.
--
-- A NOTE ON THE SECRET IN THIS JOB
-- The secret is stored in cron.job.command in plain text, readable by anyone
-- with database owner access. That is the same trust boundary as the service
-- role key, so it is acceptable here — but if you want it out of the table,
-- put it in Supabase Vault and reference it via vault.decrypted_secrets in the
-- job body instead of inlining it.
--
-- TO REMOVE THE SCHEDULE
--   select cron.unschedule('carbonify-process-payouts');
-- ============================================================================
