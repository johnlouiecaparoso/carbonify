-- ============================================================================
-- storage: stop the world listing every file in the `avatars` bucket.
--
-- WHAT IS WRONG TODAY
--   The `avatars` bucket is public, and storage.objects carries a broad SELECT
--   policy named "Anyone can view avatars". A public bucket does NOT need that
--   policy to serve images: /storage/v1/object/public/<bucket>/<file> bypasses
--   RLS by design. What the policy actually grants is the LIST endpoint.
--
--   Verified on live 2026-08-05, signed out with the anon key:
--     POST /storage/v1/object/list/avatars {"prefix":"","limit":100}
--       -> 200, a full JSON directory of the bucket.
--
--   And the filenames are the problem. storageService.js:76 builds them as
--   `${userId}_${timestamp}.${ext}`, so the listing is a complete roster of
--   every user id that has ever uploaded a profile photo — handed to an
--   anonymous caller, in one request, with sizes and timestamps attached.
--   The images were meant to be public. The membership list was not.
--
-- WHAT THIS DOES
--   Drops the broad SELECT policy and replaces it with an owner-scoped one, so
--   a signed-in user can still list their own objects and nobody can enumerate
--   the bucket.
--
--   Avatar display is unaffected: the app never calls .list(). It calls
--   .upload() (INSERT policy, untouched), .getPublicUrl() (pure string
--   construction — no API call, no policy) and .remove() (DELETE policy,
--   untouched). Uploads pass upsert: false, so they do not need SELECT either.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §PRE-FLIGHT — run this FIRST.
--
--   select policyname, cmd, roles, qual
--     from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--    order by policyname;
--
--   select id, name, public from storage.buckets where id = 'avatars';
--
-- Expected: a policy "Anyone can view avatars" for SELECT, and the bucket
-- marked public = true.
--
-- If OTHER buckets rely on a shared catch-all SELECT policy that happens to be
-- this one, dropping it affects them too. The policy name suggests otherwise,
-- but confirm the qual mentions bucket_id = 'avatars' before applying.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Owner-scoped listing for signed-in users. `owner` is set by storage on upload.
drop policy if exists "avatars_owner_list" on storage.objects;
create policy "avatars_owner_list" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

-- The enumeration hole.
drop policy if exists "Anyone can view avatars" on storage.objects;

commit;

-- ============================================================================
-- AFTER APPLYING, TEST:
--
--   (1) SIGNED OUT, anon key — the proof:
--         POST /storage/v1/object/list/avatars {"prefix":"","limit":100}
--       Expected: []. Before this migration it returned the full file list.
--
--   (2) Avatars still RENDER. Open any page showing profile photos while
--       signed out (project cards, comments, the public registry). This is the
--       test that matters: it proves public-bucket URL access does not depend
--       on the dropped policy.
--
--   (3) Upload a new profile photo, and confirm replacing an existing one still
--       works — that exercises INSERT and DELETE, neither of which changed.
--
-- ROLLBACK:
--   create policy "Anyone can view avatars" on storage.objects
--     for select using (bucket_id = 'avatars');
-- ============================================================================
