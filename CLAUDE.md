# Function: notes for Claude

Function (studentfunction.com) is a London student events app. Claude reads
this file at the start of every session in this repo. Read docs/HANDOVER.md
next: it says where everything stands and what's waiting.

## The owner

The owner is not a developer. Explain in plain English, sentence case,
British spelling, and say exactly what to click or type. Ask before doing
anything that's hard to undo or that other people will see.

## The code

- apps/mobile: the app (Expo + expo-router + NativeWind). It is also the
  website, studentfunction.com (Vercel project "function-app"). Read
  apps/mobile/AGENTS.md before touching Expo or EAS.
- packages/shared: shared code and its unit tests (packages/shared/test).
- supabase/migrations: the database, applied in filename order.
  supabase/functions: edge functions. supabase/tests: database tests.
- apps/web: the old Next.js website, no longer on the main address. Don't
  change it.
- Branches: expo-app is the main line. Work on a branch from expo-app and
  open a pull request into expo-app. Only the owner merges.

## Safety rules

- Never run anything against the real Supabase project
  (xrpbmcoptyrpgkdowfdt). Database changes are new migration files only,
  named after the latest one. The owner pastes them into the Supabase SQL
  Editor, in the order you give, BEFORE merging the pull request.
- The test project (function-staging, pvldkzjrrhcnwctveemu) is for testing;
  its setup files are in supabase/staging (README.txt there).
- Every table has row level security. New server functions use
  `security definer set search_path = ''`, fully qualified names, and
  revoke execute from public and anon (Supabase grants them by default).
  Add database tests for any permission change.
- Permissions never loosen: app admins (is_motive_admin()) see everything;
  society managers see only their own society, names never emails;
  community roles are as in docs/COMMUNITIES_PLAN.md.
- Never ask for passwords, keys or tokens in chat; they go in the
  environment's settings.
- The name is Function, never Motive.

## Checks before saying something is done

- Unit tests: `npm test --workspace packages/shared`
- Types: `npm run typecheck --workspace packages/shared` and
  `npm run typecheck --workspace apps/mobile`
- Lint: `cd apps/mobile && npx eslint . --max-warnings 50`
- Database tests (needs a local PostgreSQL 16):
  `PGHOST=... PGPORT=... PGUSER=postgres TEST_DB=function_test bash supabase/tests/run.sh`
- Show screenshots of any screen you changed, light and dark, phone width.

## Shipping

- Website: updates by itself a few minutes after a merge into expo-app.
- Phones: `npm run send-update -- "what changed"` in apps/mobile sends an
  over-the-air update. Changes to app.json or native packages need a new
  build instead (see apps/mobile/AGENTS.md).
- The live map is switched off (apps/mobile/src/lib/app-features.ts,
  MAP_ENABLED); the Map tab says "Map coming soon".
