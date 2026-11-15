-- Cloud share currently has no authentication: usernames are free text, so any
-- visitor can delete or overwrite another person's decks by guessing the name.
-- This migration restores row deletion (dropped in 20260630134336, which is why
-- the client's delete-then-insert re-upload silently fails) and adds a
-- uniqueness guarantee so an upload cannot silently duplicate another's row.
--
-- NOTE: This is a containment fix, not real auth. Full protection requires
-- Supabase Auth + policies keyed on auth.uid(). Until then, treat the cloud
-- table as public and do not store anything private in it.

-- 1. Insert: shape and size checks only. Uniqueness is enforced by the
--    constraint below rather than a self-referencing subquery in the policy.
DROP POLICY IF EXISTS "Anyone can upload valid vocab sets" ON public.vocab_sets;
DROP POLICY IF EXISTS "Anyone can upload vocab sets" ON public.vocab_sets;

CREATE POLICY "Anyone can upload valid vocab sets"
ON public.vocab_sets
FOR INSERT
TO public
WITH CHECK (
  username IS NOT NULL
  AND length(btrim(username)) BETWEEN 1 AND 60
  AND set_name IS NOT NULL
  AND length(btrim(set_name)) BETWEEN 1 AND 120
  AND jsonb_typeof(data) = 'object'
  AND pg_column_size(data) < 1048576
);

-- 2. One row per (username, set_name). Combined with delete-then-insert, this
--    makes re-upload idempotent and blocks duplicate rows from racing inserts.
--    Clears any pre-existing duplicates first, keeping the newest per pair.
DELETE FROM public.vocab_sets a
USING public.vocab_sets b
WHERE a.username = b.username
  AND a.set_name = b.set_name
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS vocab_sets_username_set_name_key
  ON public.vocab_sets (username, set_name);

-- 3. Delete: restore the delete-then-insert re-upload flow. Without a policy
--    here every DELETE is denied, so re-uploading a deck that already exists
--    fails and the client reports "Failed to upload set".
DROP POLICY IF EXISTS "Users can delete their own sets" ON public.vocab_sets;

CREATE POLICY "Anyone can delete a vocab set"
ON public.vocab_sets
FOR DELETE
TO public
USING (true);

-- 4. No UPDATE policy. The client deletes and re-inserts instead of updating,
--    which keeps written rows immutable at the database level.
