# Browser tests (kept for reference)

These are the end-to-end browser tests used while building Function with
Claude Code (Oct to Nov 2026), copied here at the handover so they aren't
lost. They drive the website build of the app (apps/mobile, `expo export
--platform web`) in a headless Chromium with Playwright, against a LOCAL
copy of the database. They never touch Supabase.

They are not wired up to run as they are: paths inside them point at the
machine they were written on (`/tmp/claude-0/...`). To run them again,
recreate the local stack and adjust the paths. A Claude Code session can
do this from this README.

The local stack (stack/):
- PostgreSQL 16 on port 5499, built from every migration in
  supabase/migrations plus supabase/seed.sql, with supabase/tests/stubs.sql
  standing in for Supabase's auth, storage and realtime schemas
  (see supabase/tests/run.sh);
- PostgREST on port 3001 (stack/postgrest.conf; its jwt-secret must be the
  fake auth server's public JWKS);
- a fake auth server on port 54321 (stack/fakeauth-server.mjs): accepts any
  email and the login code 123456; generate its own ES256 key pair
  (es256-private.pem, jwks-public.json) and an HS256 secret locally, never
  commit them;
- a small proxy on port 54400 (stack/delayproxy.mjs) that the web build
  uses as its Supabase URL, and a static server for the built site
  (stack/serve-static.mjs);
- stack/up.sh starts everything; stack/prep-run.sh rebuilds the site and
  runs a set of tests: `TESTS="login societies chats" bash prep-run.sh`.

Test users (from the browser tests' own set-up): s1@lse.ac.uk (Sam),
s2@lse.ac.uk (Bea), s3 (Cas, UCL), s4 (Sky), committee@lse.ac.uk (manager of
lse-poker-society). Each test file says what it covers at the top; the
c2-* files cover the community screens (communities Part 2) and
communities-db.mjs covers Part 1 from the browser.
