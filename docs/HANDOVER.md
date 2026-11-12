# Function: handover

Written on 12 Nov 2026, when Rhys (one of the two founders) left the
project and handed it to his cofounder. This is the one current-state
document: start here. Older reports in docs/ are history.

Contents:
1. Where things stand
2. Handing over the accounts (checklist)
3. Work waiting to be done
4. How to work on Function with Claude
5. Risks to know about

---

## 1. Where things stand

**Live now (branch `expo-app`, served at studentfunction.com and in the
iPhone app on TestFlight):**
- the student app: Societies, Social (student-hosted plans), events, chats,
  profiles, friends, notifications;
- the Society Hub for committees (claim links, set-up, Founding Society
  programme, feature requests, event admin for LSE societies);
- the admin panel (Me → Admin) for Function admins;
- the live map is switched off: the Map tab says "Map coming soon"
  (apps/mobile/src/lib/app-features.ts, `MAP_ENABLED`);
- paid plans (Stripe) are built but only in test mode and switched off.

**On the branch `society-onboarding`, not yet merged (the "communities"
feature, first client UCL Abacus; plan in docs/COMMUNITIES_PLAN.md):**
- Part 1, the database: roles, join requests, sub-groups, live-chat
  plumbing, mutes, faster notifications. Built, reviewed by two independent
  reviewers, all 8 findings fixed, all tests passing. Migration
  `supabase/migrations/20261202000000_communities.sql`. Not yet run on any
  real database.
- Part 2, the screens: community page `/c/<slug>`, join page
  `/c/<slug>/join`, Manage page, invite link and QR code, Chats and
  Societies tab rows, admin panel Communities page. Built and all tests
  pass, but **not yet independently reviewed** (the review failed to run).
  Part 2 also adds a section to the same migration file.
- Also on this branch: CLAUDE.md, this file, docs/CLAUDE_CHATS.md and
  supabase/staging/ (the test project's set-up files).

**Planned, not started:**
- Communities Part 3, the chat itself: live updates, history in pages of
  50, mute menu, nicknames in role colours with tags. The full brief is in
  docs/communities/part-3-chat-brief.md.
- Then: a faster chat list for very long chats, WhatsApp-style grouping in
  the Chats tab, a role-colour editor, and Phase 2, the ticket marketplace
  (plan in docs/COMMUNITIES_PLAN.md).

**The UCL Abacus date (Sun 8 Nov) has passed with nothing live.** Agree a
new date with the Abacus presidents (see section 3).

**Two Supabase projects:**
- the REAL one, `xrpbmcoptyrpgkdowfdt` (London): real users. Never test on it.
- the TEST one, `function-staging`, `pvldkzjrrhcnwctveemu`: for testing.
  Set-up files 01 to 04 and 90 have been pasted; 05 and 91 haven't (see
  supabase/staging/README.txt).

---

## 2. Handing over the accounts

Do these in order. The person leaving should not remove themselves from
anything until the new owner has full control of it, including two-factor
and recovery.

### Before anything else

- [ ] **Agree the split in writing** (with your lawyers): who owns the code,
      the name and logo "Function", the domain, the accounts, the user data
      and the social media accounts. This also decides who is named as data
      controller in the privacy policy and as seller on the App Store.
- [ ] **Back up the real database and its files** to somewhere the new owner
      controls (Supabase CLI: `npx supabase db dump`, again with
      `--data-only`, and download the storage buckets). The free plan has
      no automatic backups.
- [ ] **List which email each account signs in with.** Any account that uses
      a personal address of the person leaving needs its login, recovery
      email, recovery phone and two-factor device moved to the new owner.

### Accounts

| Account | What it runs | What to do |
|---|---|---|
| **GitHub** repo `Student-Motive` (on Rhys's personal account) | All the code | Repo Settings → General → Danger Zone → **Transfer ownership** to the new owner. **The repo is public**: decide whether to make it private afterwards (same section, Change visibility). |
| **Vercel** projects `function-app` (the live site) and `student-motive` (old site, kept for rollback) | studentfunction.com | Each project → Settings → General → **Transfer**. Check the domains and environment variables came across (list below). Reconnect the GitHub repo after the repo transfer. Hobby plan is for non-commercial use; payments will need Pro. |
| **Domain** studentfunction.com | Website, login links, app links, all @studentfunction.com email | The registrar isn't written down anywhere: the person leaving must say where it's registered. Move the domain (or the registrar account) and its renewal card to the new owner. Keep every DNS record (Vercel, mail, Resend) exactly as it is. |
| **Mailboxes** management@, help@, hello@, review@, reports@, noreply@ | User reports (to help@), Apple review contact, login-code sender | Give the new owner admin rights at the mail provider, reset passwords, remove any forwarding to the person leaving. Someone must read help@ (every user report goes there). |
| **Supabase** organisation "Motive" (both projects) | The database, logins, files, edge functions | The cofounder is already an Owner. Move billing, then the person leaving leaves the organisation. Never recreate the project: all the data lives in it. |
| **Resend** | Login-code emails (Supabase SMTP) and report emails | Add the new owner, transfer ownership, move billing. Make new API keys (below). |
| **Expo** account/organisation `studentmotive` | Phone builds and over-the-air updates | Add the new owner as Owner (or move the project to their organisation), move billing, then remove the person leaving. Make a new `EXPO_TOKEN` (below). |
| **Apple Developer** team FVT2MCM7C9, App Store Connect app 6824785646 (`com.studentfunction.app`) | The iPhone app, TestFlight | If it's an individual membership in a personal name it can't be handed over: the new owner enrols their own (ideally as a company) and uses Apple's **App Transfer** (check Apple's current conditions). Settle this BEFORE the first App Store release, or the leaving founder is shown as the seller. Meanwhile the cofounder has App Manager access. |
| **Google Play / Firebase** | Android | Not set up yet. Create under the new owner or the company. |
| **Stripe** (Connect, test mode only) | Paid plans (switched off) | If an account exists, transfer ownership (Settings → Team) or start a new one under the business before going live. |
| **Instagram / TikTok** | Marketing, DMs with society committees (claim links) | Hand over logins, email, phone and two-factor, or add the new owner as admin, then change passwords. |
| **Claude** | Six chats, the cloud environment, documents | Chats can't be moved between accounts. The new owner recreates them from docs/CLAUDE_CHATS.md. Documents ("Function: business strategy report" and others) are shared with the Share button, "Can edit". |
| **Google doc(s)** | Planning | Transfer ownership or make a copy into the new owner's Drive. |

Vercel `function-app` environment variables (public values; keep them):
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_CONTACT_EMAIL`,
`EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, and later
`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

### Change every secret the person leaving knew

Do this once the new owner controls each account. Test on the test project
first where possible.

- [ ] Supabase: create a new secret API key and delete the old one; reset
      the database password (both projects).
- [ ] `PUSH_SECRET`: it lives in three places. Set the new value as the edge
      function secret (`npx supabase secrets set PUSH_SECRET=...`), re-run
      supabase/RUN_ONCE_push_cron.sql and RUN_ONCE_instant_push.sql in the
      real project's SQL Editor with the new value typed in (never saved in
      the file), then check notifications still send.
- [ ] `EMAIL_SECRET` and `PAYMENTS_WORKER_SECRET`: the same way, with
      RUN_ONCE_email_cron.sql and RUN_ONCE_payments_cron.sql (only if those
      timers were set up).
- [ ] Resend: new API key for `RESEND_API_KEY` (edge function secret) and a
      new one for Supabase → Authentication → SMTP; send a test login code;
      delete the old keys.
- [ ] Stripe: roll the secret key and both webhook signing secrets, update
      the Supabase secrets.
- [ ] Expo: create a new access token under the new owner, save it as the
      GitHub secret `EXPO_TOKEN` (repo Settings → Secrets and variables →
      Actions), revoke the old one. (It may never have been set: until it
      is, phone updates are sent by hand with `npm run send-update`.)
- [ ] App Store review account review@studentfunction.com: new password,
      update the review notes in App Store Connect.
- [ ] Web push keys (VAPID): changing them makes website users turn
      notifications on again, so either change them or have the person
      leaving confirm they deleted their copy.
- [ ] Test project accounts (`@staging.studentfunction.com`): their password
      hash is in this public repo, so set a new password (test project only):
      in function-staging's SQL Editor,
      `update auth.users set encrypted_password = extensions.crypt('NEW-PASSWORD', extensions.gen_salt('bf')) where email like '%@staging.studentfunction.com';`
- [ ] The person leaving logs out of the Supabase and Expo command-line tools
      on their computer and deletes local secret files (apps/web/.env.local).

### Inside the app

- [ ] Make sure the new owner's own Function account is a Function admin
      (`profiles.is_admin = true`), then remove admin, society manager and
      community roles from the person leaving (or they delete their account:
      Me → Edit profile → Delete my account).
- [ ] Update the privacy policy's data controller
      (apps/mobile/src/content/legal/privacy.ts) once the split is agreed.
- [ ] Move every paid plan and renewal (Apple, domain, Supabase, Vercel,
      Expo, Resend) to the new owner's card before the old card is removed.

---

## 3. Work waiting to be done

### Ship communities (Parts 1 and 2), in this order

1. Get Part 2 independently reviewed (database security and app behaviour).
   Fix what the review finds. If the migration changes, rebuild the test
   project's file 05 (supabase/staging/README.txt explains how).
2. On the TEST project: paste supabase/staging/05-setup-communities.sql, then
   91-test-community-roles.sql (test roles and 130 sample messages). Switch
   off Realtime → Settings → "Allow public access". Try every flow as the
   test accounts, and check that ordinary event, Social and private chats
   still work.
   - The last local check of these files had one failure: join requests
     listed in a different order from what the check expected. Find out
     whether the check or the list order is wrong before relying on it.
3. On the REAL project, first confirm every earlier migration up to
   20261201000000_instant_push.sql has been run (nothing records this;
   check one function from each file exists), including
   20261123000000_hub_push_links.sql.
4. Paste 20261202000000_communities.sql into the real project's SQL Editor.
5. Redeploy the send-push edge function (only after step 4):
   `npx supabase functions deploy send-push --no-verify-jwt`.
6. Switch off Realtime "Allow public access" on the real project.
7. Open a pull request from `society-onboarding` into `expo-app` and merge
   it. The website updates by itself. Straight away send the phone update
   (`npm run send-update -- "Communities"` in apps/mobile), because iPhones
   will open /c/ links in the app.
8. Set up UCL Abacus: its presidents sign up with their UCL emails; in the
   admin panel → Communities → UCL Abacus, make them admins; add the bio,
   logo and banner. Print QR codes only once
   studentfunction.com/c/ucl-abacus/join works.

The fastest route to Abacus: ship Parts 1 and 2 with the existing chat
(it checks for new messages every few seconds), then Part 3's live chat
goes out as a phone update.

### Other waiting items

- Communities Part 3 (docs/communities/part-3-chat-brief.md), then the
  marketplace. Ask Abacus whether their tickets can be resold.
- Open pull requests: #45 poker tables fixes (no database change; check and
  merge), #46 Two truths names (run its SQL first; check the privacy change
  in its description), #42 landing page wording (has conflicts; redo or
  close).
- Branches: `expo-app` is the main line, but GitHub's default branch is
  `main`, which is out of date. Make `expo-app` the default (repo Settings →
  General → Default branch), or merge it into `main`.
- Phones: check a 1.4.0 build is on TestFlight (build 1.0.0 can't receive
  updates). Android needs a new build for /c/ links.
- Before the busy sign-up days: Supabase's free plan limits login emails
  and live-chat connections (200 at once). Consider Supabase Pro (also
  gives daily backups).
- Founding Society promises made to societies (24-hour feature builds,
  Instagram collab posts, a prize draw): decide who keeps them, or end the
  programme cleanly.
- Introductions: the person leaving introduces the new owner to the UCL
  Abacus presidents, the committees of the live societies, and SU contacts.

---

## 4. How to work on Function with Claude

- docs/CLAUDE_CHATS.md: how to set up Claude Code in your own account and
  the opening message for each of the six Function chats.
- CLAUDE.md: the rules every Claude chat follows in this repo.
- Database changes: new migration files only; paste them into the real
  project's SQL Editor, in order, before merging. RUN_ONCE_*.sql files are
  for the real project only, once. supabase/staging files are for the test
  project only.
- Edge functions: install the Supabase CLI, `npx supabase login`,
  `npx supabase link --project-ref xrpbmcoptyrpgkdowfdt`, then
  `npx supabase functions deploy <name>`. send-push, send-email,
  stripe-webhook and stripe-worker need `--no-verify-jwt`.
- Phone updates and builds: apps/mobile/AGENTS.md and docs/EXPO_LAUNCH.md.
- Tests: `npm test --workspace packages/shared` (unit),
  `bash supabase/tests/run.sh` with a local PostgreSQL 16 (database; see
  CLAUDE.md). GitHub only runs the unit tests, type checks and lint, so run
  the database tests yourself before merging any SQL. The browser tests
  used during the build are kept for reference in tools/browser-tests/.

---

## 5. Risks to know about

- **Pull request previews use the real database.** Vercel previews read and
  write real users' data. Don't try the unmerged communities branch on a
  preview before the real database has the communities tables; test on the
  test project instead (run the app locally pointed at function-staging, or
  point Vercel's Preview environment variables at it).
- **The chat code change touches every chat**, not only communities. It was
  tested thoroughly here but has never run on a hosted database: test
  ordinary chats right after running the migration.
- **Live chat for 1,000 people hasn't been tried on real servers.** Load-test
  on the test project after Part 3.
- **The repo is public**, and the person leaving's email address is on their
  commits. Making the repo private hides it.
- **app.studentfunction.com** is still used by user-report email links and
  possibly by App Store URLs: don't remove that address until those point
  at studentfunction.com.
