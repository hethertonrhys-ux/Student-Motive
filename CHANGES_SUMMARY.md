# Overnight updates: what changed, what you need to do, how to go live

Everything here is on the git branch **`overnight-updates`** (branched from
`expo-app`). Nothing has been merged, pushed to production or deployed. The
LSE Poker Society's page, events, members, chats and data were not touched.

Six phases, one commit each (plus one for this file). All the browser tests
pass against the new build (the full list is at the end). The native phone
app typechecks but has not been run on a real phone; the checklist below
says what to try on your iPhone.

---

## Phase 1: text and landing page

**What changed**
- Two email addresses, in one place: `apps/mobile/src/lib/site.ts`.
  Management (societies, claims, the data controller in the privacy policy)
  is `management@studentfunction.com`; help and support (Support page, Terms
  contact, "your rights" in the privacy policy) is `help@studentfunction.com`.
  Both can be overridden with the environment variables
  `EXPO_PUBLIC_CONTACT_EMAIL` and `EXPO_PUBLIC_SUPPORT_EMAIL`.
- Every "students at LSE, UCL, King's and Imperial" became "every London
  university" / "London university students": the landing page, the login
  page and its error message, the committee event form ("open to all
  London"), the Admin page, the web page description, the manifest and the
  link-preview function.
- The landing page has a top bar with the Function name and a **Log in /
  Sign up** button, and the first big button is now "Log in or sign up".
  "Get your society on Function" is still there as a second button.

**Files:** `apps/mobile/src/lib/site.ts`, `src/components/landing.tsx`,
`src/app/{support,terms,privacy,login,admin,+html}.tsx`,
`src/components/committee/event-form.tsx`, `api/preview.js`, `app.json`,
`public/manifest.webmanifest`, `docs/EXPO_LAUNCH.md`.

**Decision:** the old Next.js website (`apps/web`) was left alone, since the
Expo app replaces it. Its Vercel environment variable
`NEXT_PUBLIC_CONTACT_EMAIL` can be changed in the Vercel dashboard if you
want the old site to show the new address meanwhile.

---

## Phase 2: navigation, layout and visual bugs

**What changed**
- **Back button everywhere.** A round chevron button, top left, on every
  screen that isn't one of the five tabs: profiles (yours and other people's),
  events, societies, chats, the account pages, friends, notifications, all the
  committee dashboard screens, admin, login, install, privacy/terms/support
  and the 404 page. It goes back; if the page was opened from a link (nothing
  to go back to) it goes to a sensible place instead (the map, Me, Societies…).
  Component: `src/components/back-button.tsx`.
- **Bottom tab bar** now adds the phone's bottom safe-area inset to its height
  and padding (`src/app/(tabs)/_layout.tsx`), and on the web its colours come
  from the page's CSS variables so it's right in dark mode from the first
  paint (it used to stay white on a dark page).
- **Social tab:** the Discover / Hosting / Going bar sits right at the top,
  under the "Social" title and the + Host button.
- **Event forms:** date on its own row, then start and finish times side by
  side with equal widths (host form); starts/ends each as a date + time row
  (committee form). The web date/time inputs are told to fill their box
  (iPhones otherwise size them to their text).
- **Dark mode audit.** I took light and dark screenshots of 29 screens at
  iPhone size, had them reviewed, and fixed everything found: placeholder text
  in every input (was the light grey on dark), icons hardcoded to light-mode
  colours (search, chevrons, close buttons, Me rows, chat avatars, map
  buttons), the "Private" pill (white on white), MapLibre's zoom buttons and
  attribution, the browser's own date pickers and scrollbars (`color-scheme`),
  and avatars whose photo fails to load (now show initials instead of a gap).
  A `useTheme()` hook (`src/lib/theme.ts`) gives components the right colours;
  on the web it asks the browser directly because React Native's own check
  could report "light" on a dark phone.
- **Map category filter** is now a proper modal layer above the map and its
  pins: solid, fades in and out, tap outside to close. No more see-through
  panel.
- **All categories are ticked by default** so the map is as full as possible.
  The filter badge only shows when some categories are switched off.
- Also: the map's bottom row no longer overlaps the attribution strip; pins
  further south draw in front of ones behind them.

**Files:** `src/components/{back-button,icon,avatar,ui,select,complete-profile-card}.tsx`,
`src/lib/{theme.ts,map-prefs.ts}`, `src/app/(tabs)/{_layout,social,map,chats,me}.tsx`,
`src/components/map/{controls,LiveMapImpl.web,Map.web}.tsx`,
`src/components/fields/date-time.web.tsx`, `src/components/social/{event-form,filters,event-card}.tsx`,
`src/components/committee/event-form.tsx`, `src/global.css`, every screen file under
`src/app/` (back button).

---

## Phase 3: sign-up and accounts

**What changed**
- **Login codes.** The app accepts 6 to 10 digits. Supabase's shortest
  allowed code is **6 digits** (it refuses 4), so set it to 6 in the dashboard
  (see "What you need to do"). The expiry and the limit on wrong attempts are
  dashboard settings too.
- **London university emails only.** The list of universities and their email
  domains lives in **one file**: `packages/shared/src/universities.ts` (39
  London universities; a domain also covers its subdomains, so
  `live.rhul.ac.uk` counts as Royal Holloway). The database keeps the same
  list in its `universities` table, which is what actually decides who may
  sign up, so adding a uni means editing that file and running a one-line
  insert (the migration shows the pattern).
- **Creating an account** (`/welcome`, shown straight after the first login):
  full name (required, first and last), nickname (optional), university (set
  from the email and shown as a tag; a picker for invited non-uni emails), and
  graduation year (required, this year to seven years ahead). What other
  students see is the nickname if set, otherwise the full name; a profile page
  shows both, plus the uni tag and "Class of 2028". The step can't be skipped.
- **Existing users** missing these details are sent to the same screen the
  next time they open the app (wherever they land), with their current name
  pre-filled. Nothing about their account is lost.
- **Account settings** (Me → Edit profile) now has two tabs: **Edit profile**
  (photos, the account details, course, prompts) and **Password & security**
  (set a password; two-factor authentication with an authenticator app or a
  text message). Logging in asks for the 2FA code when it's on.
- **About me** prompts are no longer asked at sign-up. The "say a bit about
  yourself" nudge appears only after you join an event, and only while you
  have no prompts at all.

**Database change (not applied to the live database; see below):**
`supabase/migrations/20261108000000_accounts_and_london_unis.sql` adds three
columns to `profiles` (`full_name`, `nickname`, `graduation_year`), the new
universities, subdomain matching in `uni_from_email`, the new wording of the
sign-up rule, two extra columns on the `profile_cards` view and one more
sign-up funnel event. It only adds; nothing is deleted or overwritten.

**Files:** `packages/shared/src/{universities,types,social,profile,signup-events}.ts`,
`src/app/{welcome,login,mfa}.tsx`, `src/app/account/{index,security}.tsx`,
`src/app/u/[id].tsx`, `src/app/auth/callback.tsx`, `src/app/_layout.tsx`,
`src/components/account/details-form.tsx`, `src/components/{account-gate,uni-tag}.tsx`,
`src/lib/{profile,mfa}.ts`, `src/components/complete-profile-card.tsx`,
`src/app/s/[slug].tsx`, `src/app/e/[id].tsx`.

**Decisions I made**
- Phone-number 2FA is built, but Supabase only offers it on the Pro plan with
  an SMS provider (Twilio etc.). Until that's switched on, the app shows "This
  kind of 2FA isn't switched on for Function yet" for the text-message option.
  The authenticator-app option works on the free plan once you enable TOTP in
  the dashboard.
- The display name is kept as the single "what others see" field, so every
  existing list, chat and card in the app keeps working without changes.

---

## Phase 4: home-screen lag

An investigation (six angles, with measurements against the built site)
found these causes, in order of impact. All of them are fixed except the two
marked "later".

1. **The map library was loaded on every page** (1 MB of code, about 290 KB
   compressed, parsed even on the login page). Now it's loaded only when a map
   is on screen (`React.lazy`), for both the live map and the host form's map.
2. **The map drew at 3x pixels on iPhones** (a 1170×1824 canvas for a 390×608
   area). Capped at 2x: half the GPU work, no visible difference.
3. **3D buildings were drawn twice** because they were semi-transparent, and
   showed striping on phones. They're now opaque (same look) and only appear
   from zoom 15.5, where they were visible anyway.
4. **No service worker**, so every launch from the home screen re-downloaded
   about 2.4 MB. `public/sw.js` now caches the app's files (they have unique
   names, so cached forever), keeps pages for offline use, and keeps map tiles
   with a cap. It also handles push notifications (phase 6).
5. **Pins were rebuilt on every drawn frame** of a pan or zoom. Now they sync
   when the map settles.
6. **The map data was re-sent to MapLibre every 30 seconds** even when nothing
   changed, re-clustering everything. It's only pushed when the set of events
   or their live/upcoming status actually changed, and the 30-second clock
   only runs while the Map tab is showing.
7. **Five polling timers ran on every tab at once** (17–19 requests a minute
   while idle). Each tab now polls only while it's the one showing, and
   refreshes itself when you come back to it. Returning to the app no longer
   refetches every cached query at once (that was a "storm" of about 20
   requests).
8. **An open chat hit the server twice every 4 seconds** including a database
   write. Now: the read-marker and the sender lookup run together, the
   read-marker only runs when something new arrived, checks slow to every 16
   seconds once a chat has been quiet for a minute, and stop when the screen
   isn't showing.
9. **All fourteen icon fonts' glyph maps were bundled** (392 KB) although only
   Ionicons is used. Fixed by importing the Ionicons family directly.
10. **Text waited for all five font files** before anything rendered on the
    web. Fonts now swap in when they arrive (the page shows immediately).
11. The badge checks (unread messages, new notifications) ran every minute;
    now every 2 and 5 minutes. The install page used a 1024 px icon for a 56 px
    picture; it uses the 192 px one.
12. *Later:* resized thumbnails for logos and photos need Supabase's image
    transformation (Pro plan). *Later:* a single SQL function for the two badge
    counts (saves 8 requests a minute) is a database change worth doing next.

Measured on the built site (before numbers from the investigation, after
numbers from the final build):

| What | Before | After |
|---|---|---|
| Shared JavaScript every page downloads | 2.20 MB (599 KB compressed) | 0.81 MB (216 KB compressed) |
| Map library | in every page | only on map screens (1.08 MB / 282 KB, loaded once, then cached) |
| Map canvas on an iPhone 13 | 1170 × 1824 pixels | 780 × 1216 pixels (56% fewer) |
| Network requests while idle on a tab | 17 to 19 a minute | 0 in a 90-second idle on Societies (only the two badge checks remain, every 2 and 5 minutes) |
| Second launch from the home screen | everything re-downloaded | served from the cache |

**Files:** `src/components/map/{Map.web,LiveMapImpl.web}.tsx`,
`src/components/place/{place-map.web,place-map-impl.web}.tsx`,
`packages/shared/src/{map,chats}.ts`, `src/app/_layout.tsx`, `src/app/+html.tsx`,
`public/sw.js`, `vercel.json`, `src/app/(tabs)/{map,social,chats,societies}.tsx`,
`src/app/chats/[id].tsx`, `src/lib/{badges,push,use-refetch-on-focus}.ts`,
`src/components/icon.tsx`, `src/app/install.tsx`.

---

## Phase 5: splitting up messages

Chats has two sections at the top: **Events & Societies** (the group chat of
every event you're in) and **Personal** (one-to-one chats). Each shows its
own unread count; the Chats tab badge still shows the total. Empty states and
the "find friends / find an event" buttons fit the section.

**Files:** `src/app/(tabs)/chats.tsx`.

**Decision:** there are no personal group chats in the app yet (chats are
either one-to-one or tied to an event), so "Personal" holds the one-to-one
chats; if group chats are added later they belong there too.

---

## Phase 6: push notifications

**How it works**
- The database writes a row into a new outbox table (`push_queue`) when
  something happens: a message in a chat you're in, a friend request or an
  acceptance, a society you're a member of posting an event, someone joining
  or asking to join an event you host, and (every 5 minutes) "starting soon"
  reminders 30 minutes before an event you've joined. People who haven't
  allowed notifications, or who switched that kind off, get no row.
- A small server function (`supabase/functions/send-push`) sends what's queued
  every minute: through Expo's push service to the iPhone/Android apps, and
  through Web Push to the home-screen web app.
- In the app: the "Turn on notifications?" card appears **once, after you
  join your first event** (not when the app opens). Me → **Notification
  settings** has a switch for each kind, plus the state of this device.
  Tapping a notification opens the right chat, event or profile. Logging out
  forgets the device.

**Database change (not applied):**
`supabase/migrations/20261109000000_push_notifications.sql` adds three tables
(`push_tokens`, `notification_settings`, `push_queue`), the trigger functions
and the reminder function. Additive only.

**Files:** `supabase/migrations/20261109000000_push_notifications.sql`,
`supabase/RUN_ONCE_push_cron.sql`, `supabase/functions/send-push/index.ts`,
`packages/shared/src/push.ts`, `src/lib/push.ts`,
`src/components/{push-prompt,push-lifecycle}.tsx`,
`src/app/account/notifications.tsx`, `public/sw.js`, `app.json`
(expo-notifications plugin), `src/app/e/[id].tsx`, `src/app/social/[id]/index.tsx`,
`src/app/(tabs)/me.tsx`, `src/app/_layout.tsx`.

**Decisions I made**
- "When they're near an event" is not built: it needs the phone to report its
  location in the background, which the web app can't do and which Apple
  reviews strictly. "Starting soon" (30 minutes before) is built instead.
- Pushes to the phone apps need the Expo project id from `eas init` (part of
  the launch guide); until then the app quietly skips phone registration.
  Web pushes need the VAPID keys below.

---

## What you need to do yourself

Nothing below changes or deletes existing data. Order matters only where
numbered.

### A. Database (Supabase → SQL Editor → New query, paste, Run)
1. `supabase/migrations/20261108000000_accounts_and_london_unis.sql`
2. `supabase/migrations/20261109000000_push_notifications.sql`

Run them **before** deploying the branch: the new build expects the new
columns and tables. (Until the first file is run, the app would show the
account-details screen but fail to save.)

### B. Supabase dashboard settings
- Authentication → Providers → Email: **Email OTP Length = 6** (minimum
  Supabase allows), **Email OTP Expiration = 600** seconds.
- Authentication → Rate Limits: lower "verifying OTP" to about 10 per 5
  minutes.
- Authentication → Multi-Factor: enable **TOTP**. (Phone: Pro plan + SMS
  provider, optional.)

### C. Push notifications (optional until you want them on)
1. On your computer: `npx web-push generate-vapid-keys` (prints two keys).
2. `npx supabase login`, `npx supabase link --project-ref xrpbmcoptyrpgkdowfdt`
3. `npx supabase secrets set PUSH_SECRET=<long random string> VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:help@studentfunction.com SITE_URL=https://studentfunction.com`
4. `npx supabase functions deploy send-push --no-verify-jwt`
5. Edit `supabase/RUN_ONCE_push_cron.sql` (replace `<PROJECT_REF>` and
   `<PUSH_SECRET>`) and run it in the SQL Editor.
6. Vercel (function-app project) → Environment Variables: add
   `EXPO_PUBLIC_VAPID_PUBLIC_KEY` = the public key, and
   `EXPO_PUBLIC_SUPPORT_EMAIL` = `help@studentfunction.com`; redeploy.

### D. Accounts (for the phone apps, unchanged from the launch guide)
Expo, Apple Developer Program, Google Play. `docs/EXPO_LAUNCH.md` has the steps.

---

## Test checklist (iPhone and laptop) before going live

Test site: whichever Vercel preview URL the `overnight-updates` branch gets
(see "Going live"), or `app.studentfunction.com` after step 2 there.

**Laptop (Chrome/Safari), logged out**
- [ ] Landing page: top-right "Log in / Sign up" button works; wording says
      "every London university".
- [ ] Privacy, Terms, Support show help@ / management@ addresses and have a
      back button.

**iPhone, Safari, then added to the home screen**
- [ ] Add to Home Screen; the icon is the red one; opening it shows the map.
- [ ] Bottom tab bar sits above the home indicator, nothing cut off, in both
      light and dark mode (Settings → Display → Dark).
- [ ] Dark mode: scroll every tab and the profile, event, society, chat,
      account and committee screens; no dark text on dark backgrounds.
- [ ] Back button: open someone's profile from an event's "who's coming", from
      a chat, from Friends; the top-left chevron goes back each time. Open an
      event from a shared link; the chevron goes to the map.
- [ ] Map: all categories on by default; the filter panel is solid and closes
      smoothly; pins and night mode look right; panning is smoother than
      before; switching tabs and coming back is quick.
- [ ] Social tab: the Discover/Hosting/Going bar is at the top.
- [ ] Host an event: date, start and finish fields line up.
- [ ] Sign up with a brand-new email: the account step asks for full name,
      nickname, graduation year, shows the uni tag; Continue goes to the map.
      Try a non-London email: refused.
- [ ] Log in with your existing account: asked once for full name and
      graduation year, then everything is as before.
- [ ] Your profile shows nickname + full name + uni tag + class year.
- [ ] Me → Edit profile: two tabs; set a password; add an authenticator app
      (after TOTP is enabled); log out, log in, the 2FA code is asked.
- [ ] Chats: two sections with unread counts; a new message to you shows in
      the right section.
- [ ] Join an event: the "turn on notifications?" card appears once; Me →
      Notification settings switches save; (after step C) a friend request
      arrives as a notification on the home-screen app.
- [ ] Speed: launching from the home screen the second time is noticeably
      faster (files cached); the map tab feels lighter.

**Committee (as Poker Society committee)**
- [ ] Society dashboard, event form, members, manage event all have the back
      button and still work; results and who-pays-who unchanged.

---

## Going live, when you're happy

1. Run the two SQL files (A above) and change the dashboard settings (B).
2. Merge the branch: on GitHub open a pull request from `overnight-updates`
   into `expo-app` and merge it (or `git checkout expo-app && git merge
   overnight-updates && git push`). The function-app Vercel project builds
   `expo-app` automatically; `app.studentfunction.com` has the new version
   when the build says Ready.
3. Check the checklist items on the real site; the service worker means
   the second open is the fast one.
4. When the launch guide's switch-over day comes, carry on from
   `docs/EXPO_LAUNCH.md` part 4 exactly as before.
5. Push notifications: steps C whenever you're ready; nothing else depends on
   them.

**Rollback:** in Vercel, the Deployments tab lets you "Promote" the previous
deployment in one click. The SQL files only added things, so the old build
keeps working against the updated database.

---

## Browser test results

All 14 browser tests pass against the final build (Playwright, iPhone-13
size, against a local stand-in copy of the database and login service; the
LSE Poker Society test data is only ever read).

| Test | What it covers |
|---|---|
| login | code login, the new account-details step, the gate for accounts missing details, refused non-London emails, the password path for review accounts |
| web | landing + uni pages, legal pages, install guide, 404, manifest, link previews |
| events | feed, joining and leaving, members-only visibility, sharing, a King's student's view |
| map | pins, time windows, search, directions, category filter (all on by default, remembered) |
| societies | search, join and leave, claiming |
| eventfull | tables, seats, waiting lists, results, settling up (the full poker night) |
| social | hosting, joining, requests, group chat, reporting |
| profile | photos, prompts, Two truths, the profile editor |
| chats | private and group chats, live updates, delete and report |
| committee | claim approval, event form, managing an event, members, admin page |
| delete-account | the delete-my-account flow |
| account (new) | full name, nickname, uni tag, graduation year, validation, the returning-user gate, invited non-uni emails, QMUL sign-up, the security tab |
| chats-tabs (new) | the two chat sections and their unread counts |
| notify (new) | notification settings save and persist; a message queues a push only when that kind is on |

Not covered by the automated tests, so please try by hand: two-factor
authentication and push delivery (the stand-in login service can't do
either), the native phone app, and how it all feels on a real iPhone.

The dark-mode screenshots of every screen (light and dark) that were used
for the audit are not in the repo; the fixes they led to are listed under
Phase 2.
